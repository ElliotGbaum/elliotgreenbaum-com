/**
 * The conversation panel — what opens when you talk to Elliot.
 *
 * It opens on a choice — ask Elliot about his work, or book a call with
 * him — and nothing can be typed until one is made. Then a log, a row of
 * chips, and a line to type your own. It is the one piece of chrome on this
 * site that talks back, and the one piece where the words on screen were
 * not written in advance: every reply is generated, live, by a model that
 * has been given a brief — Elliot's notes about himself for the first
 * choice (server/persona.ts), a booking script with two tools for the second
 * (server/book.ts). The model says what it is if anyone asks; the panel does
 * not announce it. It used to be said three times, with a greeting, with a
 * badge and a standing note, and the panel read like a product with a
 * warning label rather than a person; a visitor who has walked up to a
 * figure in a field and pressed E knows what this is. The strings live in
 * src/content/talk.json.
 *
 * THE TWO MODES are two conversations. Each keeps its own transcript for
 * the visit, and one chip in each switches to the other; switching redraws
 * that mode's log rather than starting over. The server is told which brief
 * a transcript belongs to and signs its replies for that brief only.
 *
 * WHAT IT IS NOT: an owner of the world. It knows nothing about the camera,
 * the figure or the field; main.ts opens it once the figure has walked over
 * and the shot has settled, and closes it on Escape or the Leave button, and
 * puts the world back. This file owns the transcript and the wire.
 *
 * THE WIRE is POST /api/chat with the mode, the transcript so far and the
 * visitor's timezone (so a booking's times are said in it), answered as a
 * plain text stream that is typed into the log as it arrives. The
 * transcripts are kept for the length of the visit, so leaving and coming
 * back continues the conversation rather than starting it over. They are
 * never stored anywhere.
 *
 * WHEN THE WIRE IS DOWN — no key on the server, a rate limit, a network that
 * is not there — Elliot says so, in a line that was written rather than
 * generated and that gives the real email. The one thing that does not work
 * must say that it does not work; a spinner that never resolves is a figure
 * that ignores you.
 */

import './chat.css'
import copy from '../content/talk.json'

export interface Chat {
  readonly isOpen: boolean
  /** start fetching the live lines now, so they are on screen the moment
   *  the panel opens — called when the visitor turns toward Elliot */
  warm(): void
  /** put the panel up and focus the line */
  open(): void
  /** take the panel down. `onClose` fires, whichever side asked. */
  close(): void
  /** the panel is coming down — main.ts gives the field back */
  onClose(cb: () => void): void
  dispose(): void
}

/** `sig` is the server's signature on its own reply (see server/chat.ts); it
 *  goes back with the turn, and a turn without it is refused. */
type Turn = { role: 'user' | 'assistant'; content: string; sig?: string }

/** the two briefs the server knows — see the header */
type Mode = 'talk' | 'book'

/** the unit separator that ends every streamed reply: `\u001f<signature>` */
const SIG_MARK = '\u001f'

/** links from the live feeds are only ever to the services they came from */
const LINK_HOSTS = ['open.spotify.com', 'github.com', 'www.strava.com', 'calendly.com']
function safeLink(url: unknown): string | null {
  if (typeof url !== 'string') return null
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return null
    if (!LINK_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h))) return null
    return u.href
  } catch {
    return null
  }
}

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`
  const days = Math.round(hours / 24)
  if (days < 14) return days === 1 ? 'yesterday' : `${days} days ago`
  const weeks = Math.round(days / 7)
  return weeks === 1 ? 'a week ago' : `${weeks} weeks ago`
}


/** what the visitor may type at once; the server enforces the same ceiling */
const MAX_CHARS = 500

function noopChat(): Chat {
  return { isOpen: false, warm() {}, open() {}, close() {}, onClose() {}, dispose() {} }
}

export function createChat(): Chat {
  const panel = document.getElementById('talk')
  const log = document.getElementById('talk-log')
  const asks = document.getElementById('talk-asks')
  const form = document.getElementById('talk-form')
  const input = document.getElementById('talk-input')
  const send = document.getElementById('talk-send')
  const closeBtn = document.getElementById('talk-close')
  const status = document.getElementById('talk-status')
  const now = document.getElementById('talk-now')
  if (
    !panel ||
    !log ||
    !asks ||
    !(form instanceof HTMLFormElement) ||
    !(input instanceof HTMLInputElement) ||
    !(send instanceof HTMLButtonElement) ||
    !(closeBtn instanceof HTMLButtonElement)
  )
    return noopChat()

  return build({ panel, log, asks, form, input, send, closeBtn, status, now })
}

interface Parts {
  panel: HTMLElement
  log: HTMLElement
  asks: HTMLElement
  form: HTMLFormElement
  input: HTMLInputElement
  send: HTMLButtonElement
  closeBtn: HTMLButtonElement
  status: HTMLElement | null
  now: HTMLElement | null
}

/** how many questions are offered at once — the rest wait their turn */
const CHIPS_SHOWN = 4

function build({ panel, log, asks, form, input, send, closeBtn, status, now }: Parts): Chat {
  input.placeholder = copy.placeholder
  input.maxLength = MAX_CHARS

  /* ---------------- the transcripts ----------------
     What is sent to the model, one per mode. The API wants the visitor to
     speak first, so each log starts empty; the booking one is opened by the
     visitor's own choice, sent as their first line. `mode` is null until the
     visitor has picked, and nothing can be typed until then. */
  const transcripts: Record<Mode, Turn[]> = { talk: [], book: [] }
  /* …and what each one showed, line by line. The log is kept as elements
     rather than rebuilt from the transcript, because a written fallback line
     is on screen without being in the transcript (see `ask`), and coming
     back should find the conversation exactly as it was left. */
  const shownLines: Record<Mode, HTMLElement[]> = { talk: [], book: [] }
  let mode: Mode | null = null
  const turnsOf = () => transcripts[mode ?? 'talk']
  const zone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      return undefined
    }
  })()
  let busy = false
  let open = false
  let inflight: AbortController | null = null
  const closeCbs: Array<() => void> = []

  /** one line in the log. Returns the element the text goes into. */
  function line(role: Turn['role'], text: string): HTMLElement {
    const li = document.createElement('li')
    li.className = `talk__line talk__line--${role}`
    const who = document.createElement('span')
    who.className = 'talk__who'
    who.textContent = role === 'user' ? 'You' : 'Elliot'
    const body = document.createElement('div')
    body.className = 'talk__text'
    li.append(who, body)
    log.append(li)
    if (mode) shownLines[mode].push(li)
    write(body, text)
    return body
  }

  /** paragraphs, from text. No markup is ever interpreted — the model is told
   *  to write prose and whatever it writes is shown as prose. */
  function write(el: HTMLElement, text: string): void {
    const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    // reuse the paragraphs already there, so a stream that adds one
    // character does not rebuild the whole reply
    while (el.children.length > paras.length) el.lastElementChild!.remove()
    paras.forEach((p, i) => {
      let node = el.children[i] as HTMLElement | undefined
      if (!node) {
        node = document.createElement('p')
        el.append(node)
      }
      if (node.textContent !== p) node.textContent = p
    })
  }

  /** the reply as it should be shown: everything before the signature mark */
  function shown(text: string): string {
    const mark = text.indexOf(SIG_MARK)
    return mark >= 0 ? text.slice(0, mark) : text
  }

  // the ledger and the log scroll together, so the facts read as the
  // opening of the conversation and go up with it once it is long
  const scroller = log.parentElement ?? log
  function scrollDown(): void {
    scroller.scrollTop = scroller.scrollHeight
  }

  function setBusy(on: boolean): void {
    busy = on
    send.disabled = on
    input.disabled = on
    panel.dataset.busy = on ? 'true' : 'false'
    for (const b of asks.querySelectorAll('button')) b.disabled = on
  }

  /** what the log shows: this mode's lines, as they were left */
  function redraw(): void {
    log.replaceChildren(...shownLines[mode ?? 'talk'])
    scrollDown()
  }

  /* ---------------- what is true right now ----------------
     GET /api/live: what he is playing on Spotify, what he last pushed to
     GitHub, how far he has run this month on Strava, his latest WHOOP
     recovery, and where to book time with him — each one read from his own
     account, each one a short line under the header that names where it
     came from, and each one absent when there is nothing to show. The same
     facts are handed to the model server-side, so the lines and the answers
     agree. Links only ever go to the service the line came from.

     WHEN IT IS FETCHED: before the panel opens, not as it opens. The walk
     over and the camera move take a second and a half, which is longer than
     the round trip, so `warm()` — called by main.ts as the visitor turns
     toward Elliot and again on the press — starts the request early and the
     rows are drawn on the first frame of the panel rather than arriving a
     beat after the questions. The answer is kept for a minute (the server's
     own cache-control) in memory and in sessionStorage, so reopening the
     panel, and a reload within the minute, draw from what is already here
     and only refetch when it is stale. */
  type Track = { title: string; artists: string; url: string; at: string; playing: boolean }
  type Live = {
    track: Track | null
    shipped: { repo: string; url: string; at: string } | null
    ran: { miles: number; runs: number; url: string } | null
    recovery: { score: number; at: string } | null
    booking: { url: string; next: string[]; minutes: number | null } | null
    zone: string
  }

  const LIVE_TTL_MS = 60_000
  const LIVE_KEY = 'talk-live'
  let liveCache: { at: number; live: Live } | null = null
  try {
    const raw = sessionStorage.getItem(LIVE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { at: number; live: Live }
      if (parsed && typeof parsed.at === 'number' && parsed.live) liveCache = parsed
    }
  } catch {
    /* storage is a convenience; without it the wire is asked each time */
  }
  let liveFetch: Promise<Live | null> | null = null
  function fresh(): boolean {
    return !!liveCache && Date.now() - liveCache.at < LIVE_TTL_MS
  }
  /** the live facts: from the cache while it is fresh, else one request
   *  shared by everyone who asks while it is in flight */
  function warmLive(): Promise<Live | null> {
    if (fresh()) return Promise.resolve(liveCache!.live)
    if (liveFetch) return liveFetch
    liveFetch = fetch('/api/live', { priority: 'high' } as RequestInit)
      .then(async (res) => {
        if (!res.ok) return null
        const live = (await res.json()) as Live
        liveCache = { at: Date.now(), live }
        try {
          sessionStorage.setItem(LIVE_KEY, JSON.stringify(liveCache))
        } catch {
          /* see above */
        }
        return live
      })
      .catch(() => null /* the feeds are a nicety; their absence is silent */)
      .finally(() => {
        liveFetch = null
      })
    return liveFetch
  }

  /* the source of a line, as a glyph: one stroke each, in the world's ink,
     never the service's own colour — four brands' colours in one column is
     a dashboard. Static markup, nothing from the wire goes in. */
  const GLYPH: Record<string, string> = {
    spotify: '<circle cx="6" cy="6" r="4.6"/><path d="M3.6 4.7c1.9-.6 3.8-.4 5.2.4M3.9 6.4c1.5-.4 3-.2 4.2.4M4.2 8c1.1-.3 2.2-.1 3.2.3"/>',
    github: '<circle cx="6" cy="6" r="1.9"/><path d="M6 .9v3.2M6 7.9v3.2"/>',
    strava: '<path d="M1.6 9.6l3-6.8 3 6.8M6.6 9.6l1.7-3.8 1.7 3.8"/>',
    whoop: '<path d="M1 6h2.2l1.3-3 1.8 6 1.5-4 1 1h2.2"/>',
    calendly: '<rect x="1.5" y="2.5" width="9" height="8" rx="1"/><path d="M1.5 5.2h9M4 1.3v2.2M8 1.3v2.2"/>',
  }
  function row(kind: string, source: string, label: string): { li: HTMLElement; body: HTMLElement } {
    const li = document.createElement('li')
    li.className = `talk__fact talk__fact--${kind}`
    const lab = document.createElement('span')
    lab.className = 'talk__fact-label'
    lab.textContent = label
    const body = document.createElement('span')
    body.className = 'talk__fact-body'
    const src = document.createElement('span')
    src.className = 'talk__src'
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 12 12')
    svg.setAttribute('aria-hidden', 'true')
    svg.innerHTML = GLYPH[kind] ?? ''
    const name = document.createElement('span')
    name.textContent = source
    src.append(svg, name)
    lab.append(src)
    li.append(lab, body)
    return { li, body }
  }
  function link(href: string | null, text: string): HTMLElement {
    const safe = safeLink(href)
    if (!safe) {
      const span = document.createElement('span')
      span.textContent = text
      return span
    }
    const a = document.createElement('a')
    a.href = safe
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.textContent = text
    return a
  }
  function plain(text: string): HTMLElement {
    const span = document.createElement('span')
    span.textContent = text
    return span
  }

  /** what is on screen, as JSON, so the same facts are not redrawn (and
   *  re-animated) when the panel is opened a second time */
  let liveDrawn = ''
  function render(live: Live): void {
    if (!now) return
    const key = JSON.stringify(live)
    if (key === liveDrawn) return
    liveDrawn = key
    const rows: HTMLElement[] = []
    const L = copy.live

    if (live.track) {
      const t = live.track
      const { li: r, body } = row('spotify', L.spotify, t.playing ? L.playing : L.played)
      r.id = 'talk-now-track'
      r.dataset.playing = t.playing ? 'true' : 'false'
      body.append(link(t.url, `${t.title} — ${t.artists}`))
      rows.push(r)
    }

    if (live.shipped) {
      const sh = live.shipped
      const { li: r, body } = row('github', L.github, L.shipped)
      const name = sh.repo.split('/').pop() ?? sh.repo
      body.append(link(sh.url, name), plain(` · ${ago(sh.at)}`))
      rows.push(r)
    }

    if (live.ran) {
      const { li: r, body } = row('strava', L.strava, L.ran)
      const miles = live.ran.runs === 0 ? L.noRuns : `${live.ran.miles} mi`
      // the joke is the reason the number is here: a public total is the
      // accountability plan, and the line says so
      body.append(link(live.ran.url, miles), plain(` ${L.accountable}`))
      rows.push(r)
    }

    if (live.recovery) {
      const { li: r, body } = row('whoop', L.whoop, L.recovery)
      const s = live.recovery.score
      // WHOOP's own bands, and its colours: the number is the whole line,
      // and green, yellow or red is what it means
      const band = s >= 67 ? 'green' : s >= 34 ? 'yellow' : 'red'
      const score = plain(`${s}%`)
      score.className = `talk__band talk__band--${band}`
      score.setAttribute('aria-label', `${s}%, ${band}`)
      body.append(score)
      rows.push(r)
    }


    if (live.booking) {
      const b = live.booking
      const { li: r, body } = row('calendly', L.calendly, b.next.length ? L.free : L.book)
      if (b.next[0]) {
        const when = new Intl.DateTimeFormat('en-US', {
          timeZone: live.zone,
          weekday: 'short',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
        }).format(new Date(b.next[0]))
        body.append(plain(`${when} · `))
      }
      body.append(link(b.url, L.bookLink))
      rows.push(r)
    }

    if (!rows.length) return
    now.replaceChildren(...rows)
    now.hidden = false
    scrollDown()
  }

  /** draw what is already here at once, then whatever the wire says */
  async function showLive(): Promise<void> {
    if (!now) return
    if (liveCache) render(liveCache.live)
    const live = await warmLive()
    if (live && open) render(live)
  }

  /* ---------------- the chips ----------------
     A few at a time, not the whole list: CHIPS_SHOWN are on screen, and when
     one is asked it leaves and the next in the queue takes its place. The
     row stays short and keeps changing, which is what a conversation does.
     One more chip, set apart, switches to the other mode. */
  const queue = copy.questions.slice()
  function chip(text: string, onPick: () => void, kind: 'ask' | 'switch' = 'ask'): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = kind === 'switch' ? 'talk__ask talk__ask--switch' : 'talk__ask'
    b.textContent = text
    b.addEventListener('click', () => {
      if (busy) return
      onPick()
      if (kind === 'ask') {
        b.dataset.asked = 'true'
        b.addEventListener('animationend', () => b.remove(), { once: true })
        setTimeout(() => b.remove(), 400)
        const next = queue.shift()
        if (next) asks.insertBefore(chip(next, () => void ask(next)), asks.querySelector('.talk__ask--switch'))
      }
    })
    return b
  }

  /** the row under the log, for the current mode */
  function drawAsks(): void {
    asks.replaceChildren()
    asks.dataset.picking = mode ? 'false' : 'true'
    if (!mode) {
      asks.setAttribute('aria-label', copy.pick.label)
      const pick = (m: Mode, text: string) => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'talk__pick'
        b.dataset.mode = m
        b.textContent = text
        b.addEventListener('click', () => choose(m))
        return b
      }
      asks.append(pick('talk', copy.pick.talk), pick('book', copy.pick.book))
      return
    }
    asks.setAttribute('aria-label', 'Questions to ask')
    if (mode === 'talk') {
      // the chips already asked have left the queue; what is shown is the next few
      for (let i = 0; i < CHIPS_SHOWN; i++) {
        const q = queue[i]
        if (q) asks.append(chip(q, () => void ask(q)))
      }
      queue.splice(0, Math.min(CHIPS_SHOWN, queue.length))
      asks.append(chip(copy.pick.toBook, () => choose('book'), 'switch'))
    } else {
      asks.append(chip(copy.pick.toTalk, () => choose('talk'), 'switch'))
    }
  }

  /** the visitor has said what this conversation is for */
  function choose(m: Mode): void {
    if (busy) return
    if (mode === 'talk') {
      // put the chips on screen back at the head of the queue, so they show again
      const shown = [...asks.querySelectorAll<HTMLButtonElement>('.talk__ask:not(.talk__ask--switch)')].map((b) => b.textContent ?? '')
      queue.unshift(...shown.filter(Boolean))
    }
    mode = m
    panel.dataset.mode = m
    form.hidden = false
    input.placeholder = m === 'book' ? copy.placeholderBook : copy.placeholder
    redraw()
    drawAsks()
    if (m === 'book' && transcripts.book.length === 0) {
      // choosing the call is the visitor's first line, the way a chip is
      void ask(copy.pick.bookOpener)
    } else if (open && window.matchMedia('(hover: hover)').matches) {
      input.focus({ preventScroll: true })
    }
  }

  form.hidden = true
  panel.dataset.mode = 'none'
  drawAsks()

  /* ---------------- asking ---------------- */
  async function ask(text: string): Promise<void> {
    const q = text.trim().slice(0, MAX_CHARS)
    if (!q || busy || !mode) return
    const asked = mode
    const turns = turnsOf()
    setBusy(true)
    input.value = ''
    turns.push({ role: 'user', content: q })
    line('user', q)
    const reply = line('assistant', '')
    reply.parentElement!.dataset.thinking = 'true'
    scrollDown()

    let answer = ''
    let sig: string | undefined
    let failed: string | null = null
    inflight?.abort()
    const ctl = new AbortController()
    inflight = ctl
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: asked, messages: turns, zone }),
        signal: ctl.signal,
      })
      if (!res.ok || !res.body) {
        failed =
          res.status === 503
            ? copy.fallback.unconfigured
            : res.status === 429
              ? copy.fallback.busy
              : copy.fallback.error
      } else {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          answer += decoder.decode(value, { stream: true })
          reply.parentElement!.dataset.thinking = 'false'
          write(reply, shown(answer))
          scrollDown()
        }
        answer += decoder.decode()
        // the last line is the server's signature on what it said — kept
        // with the turn, never shown
        const mark = answer.indexOf(SIG_MARK)
        if (mark >= 0) {
          sig = answer.slice(mark + 1).trim()
          answer = answer.slice(0, mark)
        }
        if (!answer.trim()) failed = copy.fallback.error
      }
    } catch (err) {
      if (ctl.signal.aborted) return
      console.error('[talk]', err)
      failed = copy.fallback.error
    } finally {
      if (inflight === ctl) inflight = null
    }

    reply.parentElement!.dataset.thinking = 'false'
    if (failed) {
      // a written line, not a generated one — and it does NOT go into the
      // transcript, or the model would be handed a sentence it never said
      turns.pop()
      reply.parentElement!.dataset.fallback = 'true'
      write(reply, failed)
    } else {
      turns.push({ role: 'assistant', content: answer.trim(), sig })
    }
    if (status) status.textContent = `Elliot: ${failed ?? answer.trim()}`
    scrollDown()
    setBusy(false)
    if (open) input.focus({ preventScroll: true })
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    if (!mode) return
    void ask(input.value)
  })

  /* Keys typed into the line are the line's. The world listens at the window
     for E, Space, Enter and the walk keys; main.ts guards all of those while
     the panel is up, but the film's own key handling is unrelated to this
     and a stray Space here must not shuttle anything. Escape is left to
     bubble, because Escape is how the panel closes and main.ts owns that. */
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') e.stopPropagation()
  })

  closeBtn.addEventListener('click', () => close())

  function close(): void {
    if (!open) return
    open = false
    panel.hidden = true
    for (const cb of closeCbs.slice()) cb()
  }

  return {
    get isOpen() {
      return open
    },

    warm() {
      void warmLive()
    },

    open() {
      if (open) return
      open = true
      panel.hidden = false
      void showLive()
      scrollDown()
      // a phone would bring the keyboard up over the figures on the first
      // frame; the visitor can tap the line or a chip, both of which are in
      // reach. A keyboard gets the cursor, because the next thing it does is
      // type.
      if (mode && window.matchMedia('(hover: hover)').matches) input.focus({ preventScroll: true })
      else if (!mode) asks.querySelector<HTMLButtonElement>('.talk__pick')?.focus({ preventScroll: true })
    },

    close,

    onClose(cb) {
      closeCbs.push(cb)
    },

    dispose() {
      inflight?.abort()
      close()
    },
  }
}

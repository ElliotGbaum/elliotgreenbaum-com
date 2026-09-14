/**
 * The conversation panel — what opens when you talk to Elliot.
 *
 * A log, a row of questions to pick from, and a line to type your own. It is
 * the one piece of chrome on this site that talks back, and the one piece
 * where the words on screen were not written in advance: every reply is
 * generated, live, by a model that has been given Elliot's notes about
 * himself (server/persona.ts). THAT FACT IS SAID THREE TIMES, on purpose —
 * the nametag over his head says AI, the first line in the log says it in his
 * voice, and the standing note under the header says it in ours — because a
 * visitor who thinks they are reading a script will read it as a script, and
 * a visitor who thinks they are talking to Elliot has been misled. Neither is
 * allowed. All three strings live in src/content/talk.json.
 *
 * WHAT IT IS NOT: an owner of the world. It knows nothing about the camera,
 * the figure or the field; main.ts opens it once the figure has walked over
 * and the shot has settled, and closes it on Escape or the Leave button, and
 * puts the world back. This file owns the transcript and the wire.
 *
 * THE WIRE is POST /api/chat with the transcript so far, answered as a plain
 * text stream that is typed into the log as it arrives. The transcript is
 * kept for the length of the visit, so leaving and coming back continues the
 * conversation rather than starting it over. It is never stored anywhere.
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
  /** put the panel up and focus the line; the first time, say the greeting */
  open(): void
  /** take the panel down. `onClose` fires, whichever side asked. */
  close(): void
  /** the panel is coming down — main.ts gives the field back */
  onClose(cb: () => void): void
  dispose(): void
}

type Turn = { role: 'user' | 'assistant'; content: string }

/** what the visitor may type at once; the server enforces the same ceiling */
const MAX_CHARS = 500

function noopChat(): Chat {
  return { isOpen: false, open() {}, close() {}, onClose() {}, dispose() {} }
}

export function createChat(): Chat {
  const panel = document.getElementById('talk')
  const log = document.getElementById('talk-log')
  const asks = document.getElementById('talk-asks')
  const form = document.getElementById('talk-form')
  const input = document.getElementById('talk-input')
  const send = document.getElementById('talk-send')
  const closeBtn = document.getElementById('talk-close')
  const note = document.getElementById('talk-note')
  const status = document.getElementById('talk-status')
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

  return build({ panel, log, asks, form, input, send, closeBtn, note, status })
}

interface Parts {
  panel: HTMLElement
  log: HTMLElement
  asks: HTMLElement
  form: HTMLFormElement
  input: HTMLInputElement
  send: HTMLButtonElement
  closeBtn: HTMLButtonElement
  note: HTMLElement | null
  status: HTMLElement | null
}

function build({ panel, log, asks, form, input, send, closeBtn, note, status }: Parts): Chat {
  if (note) note.textContent = copy.note
  input.placeholder = copy.placeholder
  input.maxLength = MAX_CHARS

  /* ---------------- the transcript ----------------
     What is sent to the model. The greeting is NOT in it — it is display
     only, and the API wants the visitor to speak first — so it is written to
     the log directly rather than through `add`. */
  const turns: Turn[] = []
  let busy = false
  let opened = false
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

  function scrollDown(): void {
    log.scrollTop = log.scrollHeight
  }

  function setBusy(on: boolean): void {
    busy = on
    send.disabled = on
    input.disabled = on
    panel.dataset.busy = on ? 'true' : 'false'
    for (const b of asks.querySelectorAll('button')) b.disabled = on
  }

  /* ---------------- the chips ---------------- */
  for (const q of copy.questions) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'talk__ask'
    b.textContent = q
    b.addEventListener('click', () => {
      if (busy) return
      b.dataset.asked = 'true'
      void ask(q)
    })
    asks.append(b)
  }

  /* ---------------- asking ---------------- */
  async function ask(text: string): Promise<void> {
    const q = text.trim().slice(0, MAX_CHARS)
    if (!q || busy) return
    setBusy(true)
    input.value = ''
    turns.push({ role: 'user', content: q })
    line('user', q)
    const reply = line('assistant', '')
    reply.parentElement!.dataset.thinking = 'true'
    scrollDown()

    let answer = ''
    let failed: string | null = null
    inflight?.abort()
    const ctl = new AbortController()
    inflight = ctl
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: turns }),
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
          write(reply, answer)
          scrollDown()
        }
        answer += decoder.decode()
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
      turns.push({ role: 'assistant', content: answer.trim() })
    }
    if (status) status.textContent = `Elliot: ${failed ?? answer.trim()}`
    scrollDown()
    setBusy(false)
    if (open) input.focus({ preventScroll: true })
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault()
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

    open() {
      if (open) return
      open = true
      panel.hidden = false
      if (!opened) {
        opened = true
        line('assistant', copy.greeting)
      }
      scrollDown()
      // a phone would bring the keyboard up over the figures on the first
      // frame; the visitor can tap the line or a chip, both of which are in
      // reach. A keyboard gets the cursor, because the next thing it does is
      // type.
      if (window.matchMedia('(hover: hover)').matches) input.focus({ preventScroll: true })
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

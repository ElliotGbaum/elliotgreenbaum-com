/**
 * The conversation, server side — one function, shared by two doors.
 *
 * In production it is a Vercel function: api/chat.ts is a two-line wrapper
 * around `handleChat`. In development the Vite server mounts the same function
 * at the same path (see vite.config.ts), so `npm run dev` talks to the real
 * model with the real key and nothing about the client changes between the
 * two. It is written against the web-standard Request and Response so that it
 * can be called from either without either knowing.
 *
 * WHAT IT DOES: takes the transcript so far, puts a brief in front of it and
 * streams the model's reply back as plain text, chunk by chunk, so the panel
 * can type it out as it arrives rather than sit on a spinner for the length
 * of a paragraph. There are two briefs, chosen by the panel's opening
 * choice and sent as `mode`:
 *
 *   talk  Elliot's notes about himself (server/persona.ts), answering the
 *         visitor's questions. Words only.
 *   book  getting a call onto his calendar (server/book.ts). This one has
 *         tools — read the open times, book one — and so the reply is a
 *         loop: the model asks for a tool, the server runs it, the result
 *         goes back, the model speaks. The visitor sees only the words; the
 *         tool calls happen inside one request and are not kept between
 *         requests, which is why the brief tells the model to re-read the
 *         slots before booking.
 *
 * WHAT IT REFUSES, because the key behind it is real money and the endpoint
 * is public: anything that is not a POST from this site (the browser's own
 * Sec-Fetch-Site header has to say same-origin — curl has to say it too);
 * a transcript that is too long, malformed, or not turn-taking; a single
 * message past a few hundred characters; and more than a handful of
 * requests a minute from one address.
 *
 * The transcript is the visitor's browser's, and it is not trusted. In
 * particular the ASSISTANT turns in it — the things "Elliot" said earlier —
 * are only accepted if they carry the signature this server put on them
 * when it said them (a keyed hash of the text, sent as the last line of the
 * stream, see `sign`). Without that, anyone could post a transcript in which
 * Elliot had already said anything at all, and the model would carry on
 * from there as if it had. The key is derived from the API key, so there is
 * nothing extra to configure.
 *
 * The signature also covers the mode, so a reply given as the interviewee
 * cannot be replayed as a step in a booking.
 *
 * The rate limit is per address per minute, counted by server/limits.ts in
 * a shared store when one is configured and in memory otherwise; the caps on
 * the transcript are what bound the cost of any one request either way.
 *
 * THE KEY is `ANTHROPIC_API_KEY`, read by the SDK from the environment. With
 * no key the function answers 503 and the panel says Elliot has lost his
 * voice, which is the honest failure: the world still runs, the figure is
 * still there, and the one thing that does not work says so.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createHmac, createHash, timingSafeEqual } from 'node:crypto'
import { PERSONA } from './persona'
import { liveFacts, ZONE } from './live'
import { count } from './limits'
import { BOOK_TOOLS, bookingSystem, runBookTool, safeZone } from './book'
import { canBook } from './calendly'

/**
 * The model. Overridable from the environment so it can be changed without a
 * deploy of code — `ELLIOT_MODEL=claude-sonnet-5`, say, if the bill matters
 * more than the last few points of judgement.
 */
const MODEL = process.env.ELLIOT_MODEL || 'claude-opus-5'

/** replies are short by instruction; this is the ceiling, not the target */
const MAX_TOKENS = 600
/** how much of the conversation is kept: the last N turns, either side */
const MAX_TURNS = 8
/** what the visitor may type at once — the input is capped to the same */
const MAX_USER_CHARS = 500
/** …and what we will accept back as one of our own earlier replies */
const MAX_ASSISTANT_CHARS = 1200
/** and the whole transcript, so the per-turn caps cannot be stacked */
const MAX_TOTAL_CHARS = 5000

/** requests per address per window, best effort — see the header */
const RATE_LIMIT = 12
const RATE_WINDOW_MS = 60_000

/** the two briefs — see the header */
export type Mode = 'talk' | 'book'
/** how many times round the tool loop one request may go */
const MAX_ROUNDS = 5

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

type Turn = { role: 'user' | 'assistant'; content: string }

/**
 * The signature on an assistant turn: a keyed hash of the text, the key
 * being derived from the API key (which the server has and nobody else
 * does). Sent to the client on the last line of each streamed reply as
 * `\u001f<hex>`, and required back on every assistant turn it replays. The
 * character is the ASCII unit separator, which no model writes.
 */
export const SIG_MARK = '\u001f'

function signingKey(): Buffer {
  return createHash('sha256')
    .update('elliot-chat-sign:' + (process.env.CHAT_SIGNING_SECRET || process.env.ANTHROPIC_API_KEY || ''))
    .digest()
}

export function sign(mode: Mode, text: string): string {
  return createHmac('sha256', signingKey()).update(`${mode}\n${text}`).digest('hex')
}

function signed(mode: Mode, text: string, sig: unknown): boolean {
  if (typeof sig !== 'string' || !/^[0-9a-f]{64}$/.test(sig)) return false
  const a = Buffer.from(sig, 'hex')
  const b = Buffer.from(sign(mode, text), 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * The transcript, checked. The client builds it, but the client is the
 * visitor's browser, so nothing about its shape is trusted: it has to be a
 * short array of {role, content} pairs that alternate, start with the visitor
 * and end with the visitor, with nothing oversized in it.
 */
function readTurns(body: unknown, mode: Mode): Turn[] | null {
  if (!body || typeof body !== 'object') return null
  const raw = (body as { messages?: unknown }).messages
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_TURNS * 2) return null
  const turns: Turn[] = []
  let total = 0
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const { role, content, sig } = item as { role?: unknown; content?: unknown; sig?: unknown }
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null
    const text = content.trim()
    if (!text) return null
    if (text.length > (role === 'user' ? MAX_USER_CHARS : MAX_ASSISTANT_CHARS)) return null
    if ((total += text.length) > MAX_TOTAL_CHARS) return null
    // only what this server actually said, in the words it said it
    if (role === 'assistant' && !signed(mode, text, sig)) return null
    const last = turns[turns.length - 1]
    if (last && last.role === role) return null
    turns.push({ role, content: text })
  }
  if (turns[0]!.role !== 'user' || turns[turns.length - 1]!.role !== 'user') return null
  return turns
}

export async function handleChat(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  /* Same site only. Every modern browser sends Sec-Fetch-Site and a request
     from another origin says so. A request with no header is a script, not
     a browser, and it is refused too: to debug from the command line, say
     it — `curl -H 'sec-fetch-site: same-origin' …`. */
  if (req.headers.get('sec-fetch-site') !== 'same-origin') return json({ error: 'origin' }, 403)

  /* The address, as the platform saw it — never as the client claims it.
     x-real-ip is set by Vercel; x-forwarded-for is appended to by every hop,
     so the LAST entry is the one the edge wrote and the first is whatever
     the client sent. */
  const forwarded = req.headers.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean)
  const ip = req.headers.get('x-real-ip') || forwarded?.at(-1) || 'local'
  if ((await count(`chat:${hash(ip)}`, RATE_WINDOW_MS)) > RATE_LIMIT) return json({ error: 'busy' }, 429)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ error: 'body' }, 400)
  }
  const rawMode = (body as { mode?: unknown } | null)?.mode
  if (rawMode !== undefined && rawMode !== 'talk' && rawMode !== 'book') return json({ error: 'mode' }, 400)
  const mode: Mode = rawMode === 'book' ? 'book' : 'talk'
  const turns = readTurns(body, mode)
  if (!turns) return json({ error: 'messages' }, 400)
  // the visitor's timezone, from their browser — every time the booking says is in it
  const zone = safeZone((body as { zone?: unknown }).zone, ZONE)

  if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'unconfigured' }, 503)

  const client = new Anthropic()
  const who = ip === 'local' ? 'local' : hash(ip)

  /* The brief goes first with a cache mark on it: it is the same every
     request and the transcript is not, so the prefix is what the API can
     reuse. What changes — the live facts, the date, the visitor's zone —
     goes in a second block AFTER the mark. */
  const system: Anthropic.Beta.BetaTextBlockParam[] = []
  let tools: Anthropic.Beta.BetaTool[] | undefined
  if (mode === 'talk') {
    system.push({ type: 'text', text: PERSONA, cache_control: { type: 'ephemeral' } })
    /* What is true about him right now — what he is listening to, what he
       last pushed to GitHub, how far he has run this month, what he is into,
       when he is free (server/live.ts). Each fact is absent when it cannot
       be read, in which case the model is simply never told and says so if
       asked. */
    const live = await liveFacts()
    if (live) {
      system.push({
        type: 'text',
        text: `LIVE, READ A MOMENT AGO (not from the notes — true right now):\n${live}\nUse these when the visitor asks something they answer — what you are listening to, what you have been building, whether you run, what you are into lately, how to book time with you. Do not bring them up otherwise, and never invent detail beyond what is here.`,
      })
    }
  } else {
    const today = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date())
    system.push({
      type: 'text',
      text: bookingSystem({ link: process.env.CALENDLY_URL || null, zone, today, wired: canBook() }),
    })
    tools = BOOK_TOOLS
  }

  const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((t) => ({ role: t.role, content: t.content }))
  const start = () =>
    client.beta.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      betas: ['server-side-fallback-2026-07-01'],
      // the safety net for a refusal: the API re-runs a declined request on a
      // fallback model inside the same call. For a chat about one person's CV
      // it should never fire, but a refusal here would be a figure that goes
      // silent mid-sentence, and that is the worse outcome.
      fallbacks: 'default',
      system,
      messages,
      ...(tools ? { tools } : {}),
      // a short conversational reply is the one case where the cheapest
      // setting is also the right one
      output_config: { effort: 'low' },
      metadata: { user_id: who === 'local' ? undefined : who },
    })

  /* THE FIRST EVENT IS AWAITED BEFORE ANYTHING IS PROMISED. A bad key, a
     rate limit, an outage — all of them surface on the first read, and if
     the Response had already been sent as a 200 with a body to follow, the
     only thing left to say would be a line of prose pretending to be Elliot.
     Fail here and the panel gets a status it can name honestly: a key that
     is wrong is the same to the visitor as a key that is missing. */
  let stream = start()
  let events = stream[Symbol.asyncIterator]()
  let first: IteratorResult<Awaited<ReturnType<typeof events.next>>['value']>
  try {
    first = await events.next()
  } catch (err) {
    return failure(err)
  }

  const encoder = new TextEncoder()
  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      let said = ''
      const say = (text: string) => {
        controller.enqueue(encoder.encode(text))
        said += text
      }
      const take = (event: (typeof first)['value']) => {
        if (event && event.type === 'content_block_delta' && event.delta.type === 'text_delta') say(event.delta.text)
      }
      try {
        let pending: IteratorResult<(typeof first)['value']> = first
        for (let round = 0; ; round++) {
          if (!pending.done) take(pending.value)
          for (let r = await events.next(); !r.done; r = await events.next()) take(r.value)
          const final = await stream.finalMessage()
          const calls = final.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
          if (final.stop_reason !== 'tool_use' || !calls.length || !tools || round + 1 >= MAX_ROUNDS) {
            // the whole chain declined, or the model produced nothing readable
            if (final.stop_reason === 'refusal' || !said.trim()) say(SILENT)
            break
          }
          /* The tool round: run every call the model made, hand all the
             results back in ONE user turn, and go again. Anything the model
             said before asking for a tool stays in the transcript; what it
             says after joins it as a new paragraph. */
          const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
          for (const call of calls) {
            const { result, isError } = await runBookTool(call.name, call.input, { turns, zone, who })
            results.push({ type: 'tool_result', tool_use_id: call.id, content: result, is_error: isError })
          }
          messages.push({ role: 'assistant', content: final.content })
          messages.push({ role: 'user', content: results })
          if (said.trim() && !/\n\n$/.test(said)) say(said.endsWith('\n') ? '\n' : '\n\n')
          stream = start()
          events = stream[Symbol.asyncIterator]()
          pending = await events.next()
        }
      } catch (err) {
        console.error('[chat] stream failed', err)
        if (!said.trim()) say(SILENT)
      } finally {
        // the signature the client must hand back with this reply — on its
        // own line, after everything, so a reply cut short is not signed
        controller.enqueue(encoder.encode(`\n${SIG_MARK}${sign(mode, said.trim())}`))
        controller.close()
      }
    },
    cancel() {
      stream.abort()
    },
  })

  return new Response(out, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      // proxies that buffer a streamed body turn typing into a spinner
      'x-accel-buffering': 'no',
    },
  })
}

/**
 * The request could not be started at all. Mapped onto the three things the
 * panel knows how to say (src/content/talk.json → fallback): the key is not
 * working, the model is busy, or something else. Most specific first.
 */
function failure(err: unknown): Response {
  console.error('[chat] request failed', err)
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return json({ error: 'unconfigured' }, 503)
  }
  if (err instanceof Anthropic.RateLimitError || (err instanceof Anthropic.APIError && err.status === 529)) {
    return json({ error: 'busy' }, 429)
  }
  return json({ error: 'upstream' }, 502)
}

/** what comes back when the model has nothing it is willing to say */
const SILENT = "That one I'd rather the real Elliot answered — he's at elliotgreenbaum@gmail.com."

/**
 * A stable id for an address, for the rate-limit key and for the API's
 * `metadata.user_id` field (abuse detection on its side). Keyed with the
 * same server-only secret as the signatures, so it is not a plain hash of
 * the address that a table of every IPv4 could reverse.
 */
function hash(s: string): string {
  return 'v' + createHmac('sha256', signingKey()).update(s).digest('hex').slice(0, 24)
}

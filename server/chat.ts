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
 * WHAT IT DOES: takes the transcript so far, puts Elliot's notes in front of
 * it (server/persona.ts) and streams the model's reply back as plain text,
 * chunk by chunk, so the panel can type it out as it arrives rather than sit
 * on a spinner for the length of a paragraph.
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
 * The rate limit is per address per minute. It counts in a shared store
 * when one is configured (KV_REST_API_URL and _TOKEN, the names Vercel's
 * Upstash integration writes, or UPSTASH_REDIS_REST_URL and _TOKEN — a free Upstash
 * Redis from the Vercel marketplace), because a serverless function runs as
 * many instances as there is load and memory in one of them means nothing
 * to the others. Without a store it counts in memory, which blunts a loop
 * from one instance and is not a wall; the caps on the transcript are what
 * bound the cost of any one request either way.
 *
 * THE KEY is `ANTHROPIC_API_KEY`, read by the SDK from the environment. With
 * no key the function answers 503 and the panel says Elliot has lost his
 * voice, which is the honest failure: the world still runs, the figure is
 * still there, and the one thing that does not work says so.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createHmac, createHash, timingSafeEqual } from 'node:crypto'
import { PERSONA } from './persona'
import { liveFacts } from './live'

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
const hits = new Map<string, number[]>()

/** the shared counter, when there is one: INCR on a key that expires with the window */
async function limitedShared(ip: string): Promise<boolean | null> {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  const key = `chat:${hash(ip)}:${Math.floor(Date.now() / RATE_WINDOW_MS)}`
  try {
    const r = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, Math.ceil(RATE_WINDOW_MS / 1000)],
      ]),
    })
    if (!r.ok) throw new Error(`upstash ${r.status}`)
    const [{ result }] = (await r.json()) as { result: number }[]
    return result > RATE_LIMIT
  } catch (err) {
    // the store is down: closed, not open — a minute of "busy" beats a bill
    console.error('[chat] rate store', err)
    return true
  }
}

function limited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  // keep the map from growing for the life of a warm instance
  if (hits.size > 2000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k)
  }
  return recent.length > RATE_LIMIT
}

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

export function sign(text: string): string {
  return createHmac('sha256', signingKey()).update(text).digest('hex')
}

function signed(text: string, sig: unknown): boolean {
  if (typeof sig !== 'string' || !/^[0-9a-f]{64}$/.test(sig)) return false
  const a = Buffer.from(sig, 'hex')
  const b = Buffer.from(sign(text), 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * The transcript, checked. The client builds it, but the client is the
 * visitor's browser, so nothing about its shape is trusted: it has to be a
 * short array of {role, content} pairs that alternate, start with the visitor
 * and end with the visitor, with nothing oversized in it.
 */
function readTurns(body: unknown): Turn[] | null {
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
    if (role === 'assistant' && !signed(text, sig)) return null
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
  if ((await limitedShared(ip)) ?? limited(ip)) return json({ error: 'busy' }, 429)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ error: 'body' }, 400)
  }
  const turns = readTurns(body)
  if (!turns) return json({ error: 'messages' }, 400)

  if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'unconfigured' }, 503)

  const client = new Anthropic()

  /* What is true about him right now — what he is listening to, what he
     last pushed to GitHub, how far he has run this month, what he is into,
     when he is free (server/live.ts). It goes in as a second system block
     AFTER the cache mark, because it changes and the notes do not. Each fact
     is absent when it cannot be read, in which case the model is simply
     never told and says so if asked. */
  const live = await liveFacts()
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: 'text', text: PERSONA, cache_control: { type: 'ephemeral' } },
  ]
  if (live) {
    system.push({
      type: 'text',
      text: `LIVE, READ A MOMENT AGO (not from the notes — true right now):\n${live}\nUse these when the visitor asks something they answer — what you are listening to, what you have been building, whether you run, what you are into lately, how to book time with you. Do not bring them up otherwise, and never invent detail beyond what is here.`,
    })
  }

  /* The notes are the same every request and the transcript is not, so the
     notes go first with a cache mark on them: the prefix is what the API can
     reuse. `fallbacks: "default"` is the safety net for a refusal — if the
     model declines a request outright the API re-runs it on a fallback model
     inside the same call, which for a chat that is only ever about one
     person's CV should never fire, but a refusal here would be a figure that
     goes silent mid-sentence, and that is the worse outcome. */
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages: turns,
    // a short conversational reply is the one case where the cheapest
    // setting is also the right one
    output_config: { effort: 'low' },
    metadata: { user_id: ip === 'local' ? undefined : hash(ip) },
  })

  /* THE FIRST EVENT IS AWAITED BEFORE ANYTHING IS PROMISED. A bad key, a
     rate limit, an outage — all of them surface on the first read, and if
     the Response had already been sent as a 200 with a body to follow, the
     only thing left to say would be a line of prose pretending to be Elliot.
     Fail here and the panel gets a status it can name honestly: a key that
     is wrong is the same to the visitor as a key that is missing. */
  const events = stream[Symbol.asyncIterator]()
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
      const take = (event: (typeof first)['value']) => {
        if (event && event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          controller.enqueue(encoder.encode(event.delta.text))
          said += event.delta.text
        }
      }
      const say = (text: string) => {
        controller.enqueue(encoder.encode(text))
        said += text
      }
      try {
        if (!first.done) take(first.value)
        for (let r = await events.next(); !r.done; r = await events.next()) take(r.value)
        const final = await stream.finalMessage()
        // the whole chain declined, or the model produced nothing readable
        if (final.stop_reason === 'refusal' || !said.trim()) say(SILENT)
      } catch (err) {
        console.error('[chat] stream failed', err)
        if (!said.trim()) say(SILENT)
      } finally {
        // the signature the client must hand back with this reply — on its
        // own line, after everything, so a reply cut short is not signed
        controller.enqueue(encoder.encode(`\n${SIG_MARK}${sign(said.trim())}`))
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

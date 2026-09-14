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
 * is public: anything that is not a POST from this site; a transcript that is
 * too long, malformed, or not turn-taking; a single message past a few
 * hundred characters; and more than a handful of requests a minute from one
 * address. The last one is best-effort — a serverless instance's memory does
 * not outlive the instance — and it exists to blunt a loop, not to be a wall.
 *
 * THE KEY is `ANTHROPIC_API_KEY`, read by the SDK from the environment. With
 * no key the function answers 503 and the panel says Elliot has lost his
 * voice, which is the honest failure: the world still runs, the figure is
 * still there, and the one thing that does not work says so.
 */

import Anthropic from '@anthropic-ai/sdk'
import { PERSONA } from './persona'

/**
 * The model. Overridable from the environment so it can be changed without a
 * deploy of code — `ELLIOT_MODEL=claude-sonnet-5`, say, if the bill matters
 * more than the last few points of judgement.
 */
const MODEL = process.env.ELLIOT_MODEL || 'claude-opus-5'

/** replies are short by instruction; this is the ceiling, not the target */
const MAX_TOKENS = 600
/** how much of the conversation is kept: the last N turns, either side */
const MAX_TURNS = 20
/** what the visitor may type at once — the input is capped to the same */
const MAX_USER_CHARS = 500
/** …and what we will accept back as one of our own earlier replies */
const MAX_ASSISTANT_CHARS = 2000

/** requests per address per window, best effort — see the header */
const RATE_LIMIT = 12
const RATE_WINDOW_MS = 60_000
const hits = new Map<string, number[]>()

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
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const { role, content } = item as { role?: unknown; content?: unknown }
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null
    const text = content.trim()
    if (!text) return null
    if (text.length > (role === 'user' ? MAX_USER_CHARS : MAX_ASSISTANT_CHARS)) return null
    const last = turns[turns.length - 1]
    if (last && last.role === role) return null
    turns.push({ role, content: text })
  }
  if (turns[0]!.role !== 'user' || turns[turns.length - 1]!.role !== 'user') return null
  return turns
}

export async function handleChat(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  /* Same site only. Every modern browser sends Sec-Fetch-Site, and a request
     from another origin says so; one with no header at all is a non-browser
     client and gets the benefit of the doubt only because curl from the
     command line is how this gets debugged. */
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return json({ error: 'origin' }, 403)

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'local'
  if (limited(ip)) return json({ error: 'busy' }, 429)

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
    system: [{ type: 'text', text: PERSONA, cache_control: { type: 'ephemeral' } }],
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
      let sent = 0
      const take = (event: (typeof first)['value']) => {
        if (event && event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          controller.enqueue(encoder.encode(event.delta.text))
          sent += event.delta.text.length
        }
      }
      try {
        if (!first.done) take(first.value)
        for (let r = await events.next(); !r.done; r = await events.next()) take(r.value)
        const final = await stream.finalMessage()
        // the whole chain declined, or the model produced nothing readable
        if (final.stop_reason === 'refusal' || sent === 0) {
          controller.enqueue(encoder.encode(SILENT))
        }
      } catch (err) {
        console.error('[chat] stream failed', err)
        if (sent === 0) controller.enqueue(encoder.encode(SILENT))
      } finally {
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
 * A stable, non-reversible id for the `metadata.user_id` field, which the API
 * uses for abuse detection on its side. It is never the address itself.
 */
function hash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return 'v' + (h >>> 0).toString(16)
}

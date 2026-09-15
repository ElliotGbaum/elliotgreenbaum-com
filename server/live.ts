/**
 * Everything true about Elliot right now, in one place.
 *
 * Six feeds, each its own module with the same contract — read live, cached
 * briefly, and null when it cannot be read — gathered here for the two
 * things that want all of them at once: the panel (GET /api/live, once per
 * opening) and the chat (server/chat.ts, one system block per question). One
 * fetch for the panel rather than five, and one sentence per feed for the
 * model, so what the visitor sees and what the figure says can never
 * disagree.
 *
 * A feed that is off — no token in the environment — is simply absent from
 * both. Nothing here knows or cares which are configured.
 *
 * ELLIOT_ZONE (default America/New_York) is the zone the week starts in and
 * the slots are named in; the client has its own copy in src/core/sun.ts
 * because the world's clock runs there without asking the server.
 */

import { latestTrack, listeningDetail, describe, describeDetail, ago, type Track } from './spotify.js'
import { lastShipped, describeShipped, type Shipped } from './github.js'
import { ranThisMonth, describeRan, type Ran } from './strava.js'
import { recoveryToday, describeRecovery, type Recovery } from './whoop.js'
import { booking, describeBooking, type Booking } from './calendly.js'
import { interest, describeInterest, type Interest } from './now.js'
import { sign } from './sign.js'
import talk from '../src/content/talk.json' with { type: 'json' }

export const ZONE = process.env.ELLIOT_ZONE || 'America/New_York'

export interface Live {
  track: Track | null
  shipped: Shipped | null
  ran: Ran | null
  recovery: Recovery | null
  /** what he is into this week: the one line with no account behind it */
  interest: Interest | null
  booking: Booking | null
  /**
   * The booking conversation's first reply, signed, so the panel can put it
   * on screen the moment the visitor chooses the call instead of asking the
   * model for a line that is the same every time — the model's answer to
   * "I'd like to book a call" is always "what days suit you?", and it was
   * costing the visitor two to four seconds of dots before the conversation
   * had begun. Absent when the model is not configured, so the panel asks
   * the wire as before and gets the honest 503.
   */
  greeting: { text: string; sig: string } | null
}

/** the opening line of the booking, signed as the server's own — see `Live.greeting` */
export function bookGreeting(): Live['greeting'] {
  if (!process.env.ANTHROPIC_API_KEY) return null
  const text = talk.pick.bookGreeting.trim()
  return { text, sig: sign('book', text) }
}

export async function live(): Promise<Live> {
  const [track, shipped, ran, recovery, book] = await Promise.all([
    latestTrack(),
    lastShipped(),
    ranThisMonth(),
    recoveryToday(),
    booking(),
  ])
  return { track, shipped, ran, recovery, interest: interest(), booking: book, greeting: bookGreeting() }
}

/** the facts as lines for the model, or null when there are none */
export async function liveFacts(): Promise<string | null> {
  const [l, detail] = await Promise.all([live(), listeningDetail()])
  const lines = [
    describe(l.track),
    describeDetail(detail),
    describeShipped(l.shipped, ago),
    describeRan(l.ran),
    describeRecovery(l.recovery),
    describeInterest(l.interest),
    describeBooking(l.booking, ZONE),
  ].filter((s): s is string => !!s)
  return lines.length ? lines.map((s) => `- ${s}`).join('\n') : null
}

/** GET /api/live — the same, as JSON, for the panel */
export async function handleLive(req: Request): Promise<Response> {
  if (req.method !== 'GET') return new Response(null, { status: 405 })
  const l = await live()
  return new Response(JSON.stringify({ ...l, zone: ZONE }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60, s-maxage=60',
    },
  })
}

/**
 * The signature on an assistant turn, and the two control characters the
 * streamed reply carries — in their own file because the panel's live
 * endpoint (server/live.ts) signs the booking's opening line too, and
 * server/chat.ts imports live.ts, so neither can import the other for it.
 *
 * The signature is a keyed hash of the text, the key being derived from the
 * API key (which the server has and nobody else does). Sent to the client on
 * the last line of each streamed reply as `<hex>`, and required back
 * on every assistant turn it replays — see the header of server/chat.ts. It
 * covers the mode, so a reply given as the interviewee cannot be replayed
 * as a step in a booking.
 */

import { createHmac, createHash, timingSafeEqual } from 'node:crypto'

/** the two briefs — see server/chat.ts */
export type Mode = 'talk' | 'book'

/** the ASCII unit separator, which no model writes: ends the reply, starts the signature */
export const SIG_MARK = ''
/**
 * The ASCII record separator: a line beginning with it is a status, not
 * speech — "checking his calendar" while a tool runs — shown by the panel
 * in place of the thinking dots and never part of the reply, so it is
 * neither signed nor kept in the transcript.
 */
export const STATUS_MARK = ''

function signingKey(): Buffer {
  return createHash('sha256')
    .update('elliot-chat-sign:' + (process.env.CHAT_SIGNING_SECRET || process.env.ANTHROPIC_API_KEY || ''))
    .digest()
}

export function sign(mode: Mode, text: string): string {
  return createHmac('sha256', signingKey()).update(`${mode}\n${text}`).digest('hex')
}

export function signed(mode: Mode, text: string, sig: unknown): boolean {
  if (typeof sig !== 'string' || !/^[0-9a-f]{64}$/.test(sig)) return false
  const a = Buffer.from(sig, 'hex')
  const b = Buffer.from(sign(mode, text), 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * A stable id for an address, for the rate-limit key and for the API's
 * `metadata.user_id` field (abuse detection on its side). Keyed with the
 * same server-only secret as the signatures, so it is not a plain hash of
 * the address that a table of every IPv4 could reverse.
 */
export function hashAddress(s: string): string {
  return 'v' + createHmac('sha256', signingKey()).update(s).digest('hex').slice(0, 24)
}

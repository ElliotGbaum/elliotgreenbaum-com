/**
 * When Elliot is free — his Calendly link, and the next open slots on it.
 *
 * Two levels, and each one works without the next:
 *
 *   CALENDLY_URL    the public booking link, e.g. https://calendly.com/elliot/30min.
 *                   With only this set, the panel shows "Book a time" and the
 *                   chat knows where to send people.
 *   CALENDLY_TOKEN  a personal access token (calendly.com → Integrations →
 *                   API & Webhooks). With this too, the next few open slots
 *                   are read live, so the line can say "next free: Tue 2pm".
 *
 * WHAT IT READS with the token: the current user, the active event type whose
 * scheduling link matches CALENDLY_URL (or the first active one), and that
 * type's available start times — the same list the public booking page
 * shows. Nothing about existing bookings, invitees or the calendar behind it
 * is ever read: the token could, and this module does not, which is the
 * whole of why it is safe to expose the result.
 *
 * WHAT IT WRITES with the token: one thing. `bookSlot` creates a booking on
 * that event type for a named visitor at one of the open times, through
 * Calendly's Scheduling API (POST /invitees, October 2025), which then does
 * everything the booking page would — the calendar invite, the confirmation
 * emails, the reschedule and cancel links. That call is what lets the
 * figure in the field book a meeting by talking rather than by handing over
 * a link. Calendly only allows it on a PAID plan; on a free one it answers
 * 403 and `bookSlot` says so, and the conversation falls back to the link.
 * Who may call it, how often, and with whose details is decided in
 * server/book.ts — this module is only the wire.
 *
 * CACHED: the next-slots line for five minutes, the open-slot list for one
 * minute (a booking has to be checked against something fresh), the event
 * type for the life of the instance.
 */

export interface Booking {
  url: string
  /** the next open start times, ISO, soonest first — empty without a token */
  next: string[]
  /** the slot length in minutes, when known */
  minutes: number | null
}

const TTL_MS = 5 * 60_000
let cached: { at: number; booking: Booking | null } | null = null
interface EventType {
  uri: string
  url: string
  minutes: number
  /** how the meeting happens, as Calendly has it: the first configured location */
  location: { kind: string; location?: string | null } | null
  /** a required custom question on the booking page — something this wire cannot answer */
  asks: boolean
}
let eventType: EventType | null = null

const API = 'https://api.calendly.com'

async function get<T>(path: string, token: string): Promise<T | null> {
  const r = await fetch(API + path, { headers: { authorization: `Bearer ${token}` } })
  if (!r.ok) {
    console.error('[calendly]', path.split('?')[0], r.status)
    return null
  }
  return (await r.json()) as T
}

async function findEventType(token: string, url: string) {
  if (eventType) return eventType
  const me = await get<{ resource: { uri: string } }>('/users/me', token)
  if (!me) return null
  const types = await get<{
    collection: {
      uri: string
      scheduling_url: string
      duration: number
      active: boolean
      locations?: { kind: string; location?: string | null }[] | null
      custom_questions?: { required?: boolean; enabled?: boolean }[] | null
    }[]
  }>(`/event_types?user=${encodeURIComponent(me.resource.uri)}&active=true&count=20`, token)
  if (!types) return null
  const norm = (s: string) => s.replace(/\/+$/, '').toLowerCase()
  const pick =
    types.collection.find((t) => norm(t.scheduling_url) === norm(url)) ?? types.collection[0]
  if (!pick) return null
  eventType = {
    uri: pick.uri,
    url: pick.scheduling_url,
    minutes: pick.duration,
    location: pick.locations?.[0] ?? null,
    asks: (pick.custom_questions ?? []).some((q) => q.required && q.enabled !== false),
  }
  return eventType
}

async function fetchBooking(): Promise<Booking | null> {
  const url = process.env.CALENDLY_URL
  if (!url) return null
  const token = process.env.CALENDLY_TOKEN
  if (!token) return { url, next: [], minutes: null }
  const type = await findEventType(token, url)
  if (!type) return { url, next: [], minutes: null }
  const next = (await availableTimes(token, type, 7)).slice(0, 3)
  return { url: type.url || url, next, minutes: type.minutes }
}

/**
 * The open start times over the next `days` days, ISO, soonest first.
 * Calendly allows at most a seven-day window per request, starting no
 * earlier than now, so a fortnight is two requests.
 */
async function availableTimes(token: string, type: EventType, days: number): Promise<string[]> {
  const out: string[] = []
  let from = Date.now() + 60_000
  const until = from + days * 86_400_000
  while (from < until) {
    const start = new Date(from)
    const end = new Date(Math.min(from + 7 * 86_400_000 - 60_000, until))
    const slots = await get<{ collection: { status: string; start_time: string }[] }>(
      `/event_type_available_times?event_type=${encodeURIComponent(type.uri)}&start_time=${start.toISOString()}&end_time=${end.toISOString()}`,
      token,
    )
    for (const s of slots?.collection ?? []) if (s.status === 'available') out.push(s.start_time)
    from = end.getTime() + 60_000
  }
  return [...new Set(out)].sort()
}

/* ───────────────────────── booking by conversation ───────────────────────── */

/** how far ahead the conversation may look and book */
export const BOOK_DAYS = 14
const SLOTS_TTL_MS = 60_000
let slotsCache: { at: number; slots: string[] } | null = null

/** true when the token is set, i.e. the slots can be read and a booking attempted */
export function canBook(): boolean {
  return !!(process.env.CALENDLY_URL && process.env.CALENDLY_TOKEN)
}

/** the open slots over the next BOOK_DAYS days, ISO, soonest first; [] without a token */
export async function openSlots(): Promise<string[]> {
  if (slotsCache && Date.now() - slotsCache.at < SLOTS_TTL_MS) return slotsCache.slots
  const url = process.env.CALENDLY_URL
  const token = process.env.CALENDLY_TOKEN
  if (!url || !token) return []
  let slots: string[] = []
  try {
    const type = await findEventType(token, url)
    if (type) slots = await availableTimes(token, type, BOOK_DAYS)
  } catch (err) {
    console.error('[calendly] slots', err)
  }
  slotsCache = { at: Date.now(), slots }
  return slots
}

export type Booked =
  | { ok: true; start: string; minutes: number; rescheduleUrl: string | null; cancelUrl: string | null }
  | {
      ok: false
      /** taken: someone got there first · plan: Calendly refuses bookings by API on this plan ·
       *  needs_input: the event type wants something only the booking page can collect ·
       *  error: anything else */
      code: 'taken' | 'plan' | 'needs_input' | 'error'
      detail: string
    }

/**
 * Book `start` (ISO, one of `openSlots()`) for a visitor. Nothing here checks
 * that the caller is allowed to — that is server/book.ts. This is the one
 * request on this site that writes to somebody else's account.
 */
export async function bookSlot(start: string, name: string, email: string, timezone: string): Promise<Booked> {
  const url = process.env.CALENDLY_URL
  const token = process.env.CALENDLY_TOKEN
  if (!url || !token) return { ok: false, code: 'error', detail: 'no token' }
  const type = await findEventType(token, url)
  if (!type) return { ok: false, code: 'error', detail: 'no event type' }
  if (type.asks) return { ok: false, code: 'needs_input', detail: 'required question' }

  /* The location has to match the event type's. A host-side location (a
     video link, a number Elliot calls from, an address) needs only its
     kind, plus the text for the kinds Calendly wants it echoed on. A kind
     that wants the VISITOR to supply something — a number to be called on,
     a place of their choosing — is a form field this conversation does not
     have, and the booking page is the honest place for it. */
  let location: { kind: string; location?: string } | undefined
  if (type.location) {
    const { kind, location: text } = type.location
    if (kind === 'outbound_call' || kind === 'ask_invitee')
      return { ok: false, code: 'needs_input', detail: kind }
    location = { kind }
    if ((kind === 'physical' || kind === 'custom') && text) location.location = text
  }

  const r = await fetch(`${API}/invitees`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      event_type: type.uri,
      start_time: start,
      invitee: { name, email, timezone },
      ...(location ? { location } : {}),
      // no `tracking`: Calendly rejects the object unless every field is present
    }),
  })
  // the slot list is stale the moment a booking is attempted, either way
  slotsCache = null
  if (r.ok) {
    const body = (await r.json().catch(() => null)) as {
      resource?: { reschedule_url?: string; cancel_url?: string }
    } | null
    return {
      ok: true,
      start,
      minutes: type.minutes,
      rescheduleUrl: body?.resource?.reschedule_url ?? null,
      cancelUrl: body?.resource?.cancel_url ?? null,
    }
  }
  const detail = (await r.text().catch(() => '')).slice(0, 300)
  console.error('[calendly] book', r.status, detail)
  if (r.status === 403) return { ok: false, code: 'plan', detail }
  if (r.status === 400 || r.status === 409 || r.status === 422) {
    // Calendly names the field; a start_time it will not take is a slot that went
    return { ok: false, code: /start_time|available|already/i.test(detail) ? 'taken' : 'error', detail }
  }
  return { ok: false, code: 'error', detail: `${r.status}` }
}

/** the booking link and the next open slots, or null when there is no link */
export async function booking(): Promise<Booking | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.booking
  let b: Booking | null = null
  try {
    b = await fetchBooking()
  } catch (err) {
    console.error('[calendly]', err)
  }
  cached = { at: Date.now(), booking: b }
  return b
}

/** a slot as "Tue Sep 15, 2:00 PM EDT" in Elliot's zone */
export function slotLabel(iso: string, zone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso))
}

/** one plain sentence for the model, or nothing */
export function describeBooking(b: Booking | null, zone: string): string | null {
  if (!b) return null
  const link = `Anyone who wants to talk to the real Elliot can book a call at ${b.url}`
  if (!b.next.length) return `${link}.`
  const when = b.next.map((s) => slotLabel(s, zone)).join('; ')
  return `${link}. His next open slots${b.minutes ? ` (${b.minutes} minutes)` : ''} are: ${when}.`
}

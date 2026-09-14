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
 * type's available start times over the next seven days — the same list the
 * public booking page shows. Nothing about existing bookings, invitees or
 * the calendar behind it is ever read: the token could, and this module does
 * not, which is the whole of why it is safe to expose the result.
 *
 * CACHED for five minutes per warm instance.
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
let eventType: { uri: string; url: string; minutes: number } | null = null

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
    collection: { uri: string; scheduling_url: string; duration: number; active: boolean }[]
  }>(`/event_types?user=${encodeURIComponent(me.resource.uri)}&active=true&count=20`, token)
  if (!types) return null
  const norm = (s: string) => s.replace(/\/+$/, '').toLowerCase()
  const pick =
    types.collection.find((t) => norm(t.scheduling_url) === norm(url)) ?? types.collection[0]
  if (!pick) return null
  eventType = { uri: pick.uri, url: pick.scheduling_url, minutes: pick.duration }
  return eventType
}

async function fetchBooking(): Promise<Booking | null> {
  const url = process.env.CALENDLY_URL
  if (!url) return null
  const token = process.env.CALENDLY_TOKEN
  if (!token) return { url, next: [], minutes: null }
  const type = await findEventType(token, url)
  if (!type) return { url, next: [], minutes: null }
  // Calendly allows at most a seven-day window, starting no earlier than now
  const start = new Date(Date.now() + 60_000)
  const end = new Date(start.getTime() + 7 * 86_400_000 - 60_000)
  const slots = await get<{ collection: { status: string; start_time: string }[] }>(
    `/event_type_available_times?event_type=${encodeURIComponent(type.uri)}&start_time=${start.toISOString()}&end_time=${end.toISOString()}`,
    token,
  )
  const next = (slots?.collection ?? [])
    .filter((s) => s.status === 'available')
    .map((s) => s.start_time)
    .sort()
    .slice(0, 3)
  return { url: type.url || url, next, minutes: type.minutes }
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

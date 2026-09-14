/**
 * How far Elliot has run this month — read live from his Strava account.
 *
 * WHY IT IS ON THE SITE AT ALL: accountability. A running total that anyone
 * can look up is a reason to go out and add to it, and the line on the panel
 * says so — it is a joke with a true premise.
 *
 * Same shape as server/spotify.ts: he authorised the site once
 * (tools/strava-auth.mjs), which produced a refresh token; this module trades
 * it for a short-lived access token when it needs one. Strava's token
 * exchange requires the app's client secret, so three things live in the
 * environment: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN.
 * Strava rotates the refresh token on every exchange but keeps honouring the
 * old one, so the one in the environment stays valid indefinitely.
 *
 * WHAT IT READS: his runs since the 1st, local time (the zone in ELLIOT_ZONE,
 * default America/New_York), summed into miles. The scope is activity:read —
 * activities marked "only me" are not included, and nothing else about the
 * account is read. Nothing but the total, the count and a link to his
 * profile ever leaves this module: no routes, no start points, no times of
 * day, which is why this is safe to show to anyone.
 *
 * CACHED for ten minutes per warm instance. A month with no runs is a real
 * answer (zero), and it is shown as one; a dead token is not, and answers
 * null — the panel shows no line and the chat is never told.
 */

export interface Ran {
  miles: number
  runs: number
  /** ISO instant the month started, local midnight on the 1st */
  monthStart: string
  /** the athlete's public profile */
  url: string
}

const TTL_MS = 10 * 60_000
let cached: { at: number; ran: Ran | null } | null = null
let access: { token: string; expires: number } | null = null

const ZONE = process.env.ELLIOT_ZONE || 'America/New_York'

/** midnight at the start of the 1st of the month in `zone`, as an instant */
export function monthStartIn(zone: string, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const sinceFirst = +get('day') - 1
  // seconds elapsed in the local day, then back to the 1st, 00:00 local
  const secsToday = +get('hour') * 3600 + +get('minute') * 60 + +get('second')
  return new Date(now.getTime() - secsToday * 1000 - sinceFirst * 86_400_000)
}

async function accessToken(): Promise<string | null> {
  const id = process.env.STRAVA_CLIENT_ID
  const secret = process.env.STRAVA_CLIENT_SECRET
  const refresh = process.env.STRAVA_REFRESH_TOKEN
  if (!id || !secret || !refresh) return null
  if (access && access.expires > Date.now() + 30_000) return access.token
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      grant_type: 'refresh_token',
      refresh_token: refresh,
    }),
  })
  if (!r.ok) {
    console.error('[strava] refresh failed', r.status, await r.text().catch(() => ''))
    return null
  }
  const j = (await r.json()) as { access_token: string; expires_at: number }
  access = { token: j.access_token, expires: j.expires_at * 1000 }
  return j.access_token
}

type Activity = { sport_type?: string; type?: string; distance: number; athlete?: { id: number } }

async function fetchRan(): Promise<Ran | null> {
  const token = await accessToken()
  if (!token) return null
  const headers = { authorization: `Bearer ${token}` }
  const start = monthStartIn(ZONE)
  const after = Math.floor(start.getTime() / 1000)
  const r = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100`,
    { headers },
  )
  if (!r.ok) {
    console.error('[strava] activities failed', r.status)
    return null
  }
  const acts = (await r.json()) as Activity[]
  const runs = acts.filter((a) => (a.sport_type ?? a.type) === 'Run' || (a.sport_type ?? a.type) === 'TrailRun')
  const metres = runs.reduce((s, a) => s + (a.distance || 0), 0)
  const me = await fetch('https://www.strava.com/api/v3/athlete', { headers })
  const id = me.ok ? ((await me.json()) as { id: number }).id : null
  return {
    miles: Math.round((metres / 1609.344) * 10) / 10,
    runs: runs.length,
    monthStart: start.toISOString(),
    url: id ? `https://www.strava.com/athletes/${id}` : 'https://www.strava.com',
  }
}

/** this month's running, or null when it cannot be read */
export async function ranThisMonth(): Promise<Ran | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.ran
  let ran: Ran | null = null
  try {
    ran = await fetchRan()
  } catch (err) {
    console.error('[strava]', err)
  }
  cached = { at: Date.now(), ran }
  return ran
}

/** one plain sentence for the model, or nothing */
export function describeRan(r: Ran | null): string | null {
  if (!r) return null
  const why =
    'He put that number on his website on purpose: a total anyone can look up is his accountability plan, so a low number is meant to sting a little and get him out the door.'
  if (r.runs === 0) return `Elliot has not logged a run on Strava yet this month (since the 1st). ${why}`
  return `So far this month (since the 1st) Elliot has run ${r.miles} miles on Strava, over ${r.runs} run${r.runs === 1 ? '' : 's'}. ${why}`
}

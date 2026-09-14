/**
 * How recovered Elliot is today — his WHOOP recovery score, read live.
 *
 * WHY IT IS ON THE SITE: the same reason the Strava total is. A number that
 * anyone can look up is a reason to sleep, and the line says so. It is one
 * integer out of 100 that WHOOP computes each morning from the night's sleep,
 * heart rate variability and resting heart rate; green is 67 and up, yellow
 * 34 to 66, red below that. Only the score and the day it was scored ever
 * leave this module: no HRV, no heart rate, no sleep times, no body data.
 *
 * Same shape as server/strava.ts, with one difference that matters. He
 * authorised the site once (tools/whoop-auth.mjs), which produced a refresh
 * token, and this module trades it for an hour-long access token when it
 * needs one. But WHOOP's refresh tokens are SINGLE-USE: every exchange hands
 * back a new one and kills the old one. So the current token has to be kept
 * somewhere that outlives one serverless instance:
 *
 *   - with UPSTASH_REDIS_REST_URL/_TOKEN set (the same store the chat's rate
 *     limit uses), it lives there under one key, and WHOOP_REFRESH_TOKEN in
 *     the environment is only the seed used the first time;
 *   - without a store, it lives in this instance's memory and, locally, in
 *     .vite/whoop-refresh (gitignored, and not a file Vite restarts on the
 *     way it does for .env) — so the dev server keeps working across
 *     restarts, but a deployment without the store will lose the chain on
 *     its first cold start and the line simply disappears until whoop-auth
 *     is run again.
 *
 * Three things in the environment: WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET,
 * WHOOP_REFRESH_TOKEN. Scope is read:recovery and offline, nothing else.
 *
 * CACHED for ten minutes per warm instance. A morning WHOOP has not scored
 * yet (he slept without the strap, or it is still calibrating) answers null,
 * so the panel shows no line and the chat is never told; so does a dead
 * token. There is no "zero" here the way there is for runs.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

export interface Recovery {
  /** 0–100 */
  score: number
  /** ISO instant WHOOP scored it (the morning it is for) */
  at: string
}

const TTL_MS = 10 * 60_000
const STORE_KEY = 'whoop:refresh'
const API = 'https://api.prod.whoop.com'
let cached: { at: number; recovery: Recovery | null } | null = null
let access: { token: string; expires: number } | null = null
/** the current refresh token, once known — see the rotation note above */
let refreshToken: string | null = null

async function store(cmd: string[]): Promise<string | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  const r = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
  })
  if (!r.ok) throw new Error(`upstash ${r.status}`)
  const { result } = (await r.json()) as { result: string | null }
  return result ?? null
}

/** the local copy of the current token, for a dev server without a store */
const LOCAL = new URL('../.vite/whoop-refresh', import.meta.url)

function readLocal(): string | null {
  if (process.env.VERCEL) return null
  try {
    return readFileSync(LOCAL, 'utf8').trim() || null
  } catch {
    return null
  }
}

function writeLocal(token: string): void {
  if (process.env.VERCEL) return
  try {
    mkdirSync(new URL('.', LOCAL), { recursive: true })
    writeFileSync(LOCAL, token + '\n', { mode: 0o600 })
  } catch (err) {
    console.error('[whoop] could not write the local token', err)
  }
}

async function currentRefresh(): Promise<string | null> {
  if (refreshToken) return refreshToken
  try {
    const stored = await store(['GET', STORE_KEY])
    if (stored) return (refreshToken = stored)
  } catch (err) {
    console.error('[whoop] store read', err)
  }
  return (refreshToken = readLocal() ?? process.env.WHOOP_REFRESH_TOKEN ?? null)
}

async function remember(token: string): Promise<void> {
  refreshToken = token
  try {
    await store(['SET', STORE_KEY, token])
  } catch (err) {
    console.error('[whoop] store write', err)
  }
  writeLocal(token)
}

async function accessToken(): Promise<string | null> {
  const id = process.env.WHOOP_CLIENT_ID
  const secret = process.env.WHOOP_CLIENT_SECRET
  if (!id || !secret) return null
  if (access && access.expires > Date.now() + 30_000) return access.token
  const refresh = await currentRefresh()
  if (!refresh) return null
  const r = await fetch(`${API}/oauth/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: id,
      client_secret: secret,
      scope: 'offline',
    }),
  })
  if (!r.ok) {
    console.error('[whoop] refresh failed', r.status, await r.text().catch(() => ''))
    return null
  }
  const j = (await r.json()) as { access_token: string; expires_in: number; refresh_token?: string }
  access = { token: j.access_token, expires: Date.now() + j.expires_in * 1000 }
  // the old one is dead the moment this reply arrives; keep the new one first
  if (j.refresh_token && j.refresh_token !== refresh) await remember(j.refresh_token)
  return j.access_token
}

type Record_ = {
  created_at: string
  score_state: 'SCORED' | 'PENDING_SCORE' | 'UNSCORABLE'
  score?: { user_calibrating: boolean; recovery_score: number }
}

async function fetchRecovery(): Promise<Recovery | null> {
  const token = await accessToken()
  if (!token) return null
  const r = await fetch(`${API}/developer/v2/recovery?limit=3`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!r.ok) {
    console.error('[whoop] recovery failed', r.status)
    return null
  }
  const { records } = (await r.json()) as { records: Record_[] }
  const latest = (records ?? [])[0]
  if (!latest || latest.score_state !== 'SCORED' || !latest.score || latest.score.user_calibrating) return null
  // a score is "today's" for the day it was made; older than that and it is
  // not what the line claims, so it is not shown
  if (Date.now() - Date.parse(latest.created_at) > 36 * 3_600_000) return null
  return { score: Math.round(latest.score.recovery_score), at: latest.created_at }
}

/** today's recovery, or null when there is none to show */
export async function recoveryToday(): Promise<Recovery | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.recovery
  let recovery: Recovery | null = null
  try {
    recovery = await fetchRecovery()
  } catch (err) {
    console.error('[whoop]', err)
  }
  cached = { at: Date.now(), recovery }
  return recovery
}

/** the band WHOOP colours it: green, yellow or red */
export function band(score: number): 'green' | 'yellow' | 'red' {
  return score >= 67 ? 'green' : score >= 34 ? 'yellow' : 'red'
}

/** one plain sentence for the model, or nothing */
export function describeRecovery(r: Recovery | null): string | null {
  if (!r) return null
  const colour = band(r.score)
  const read =
    colour === 'green'
      ? 'which WHOOP calls green: well recovered and ready to push'
      : colour === 'yellow'
        ? 'which WHOOP calls yellow: fine, but not a day to go all out'
        : 'which WHOOP calls red: run down, and a sign to take it easy'
  return `Elliot's WHOOP recovery score this morning is ${r.score} out of 100, ${read}. He put it on his website for the same reason as his running total: a number anyone can see is his reason to actually go to bed.`
}

#!/usr/bin/env node
/**
 * One-time WHOOP login for the site — run it once, keep what it prints.
 *
 *   WHOOP_CLIENT_ID=... WHOOP_CLIENT_SECRET=... node tools/whoop-auth.mjs
 *
 * Both values are on the app page at developer-dashboard.whoop.com (create
 * one there first; add `https://localhost:8890/callback` to its redirect
 * URLs and tick read:recovery). The figure in the field can say how
 * recovered Elliot is this morning; to read that the server needs his
 * permission, granted once here: the script opens WHOOP's consent page and
 * trades the code it hands back for a refresh token — the long-lived
 * credential the server exchanges for a fresh access token whenever it
 * needs one (server/whoop.ts).
 *
 * WHOOP only accepts https redirect URLs, and nothing here speaks TLS, so
 * after consent the browser lands on an error page at localhost:8890. The
 * code is in that page's address bar; the script reads it from the
 * address pasted at its prompt (or from WHOOP_CODE in the environment).
 *
 * WHOOP's refresh tokens are single-use — each exchange returns a new one
 * and retires the old — so the server keeps the current one in the Upstash
 * store when there is one (see server/whoop.ts). Running this again mints a
 * fresh chain, which is the fix if the line ever goes quiet.
 *
 * It writes the three values into .env (gitignored) for local runs, and
 * prints them so the same three can go into Vercel.
 */

import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { createInterface } from 'node:readline/promises'

const CLIENT_ID = process.env.WHOOP_CLIENT_ID
const CLIENT_SECRET = process.env.WHOOP_CLIENT_SECRET
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET are both needed (developer-dashboard.whoop.com)')
  process.exit(1)
}
const PORT = 8890
const REDIRECT = `https://localhost:${PORT}/callback`
const SCOPES = 'offline read:recovery'
const state = randomBytes(16).toString('hex')

const authUrl = new URL('https://api.prod.whoop.com/oauth/oauth2/auth')
authUrl.search = new URLSearchParams({
  client_id: CLIENT_ID,
  response_type: 'code',
  redirect_uri: REDIRECT,
  scope: SCOPES,
  state,
}).toString()

async function exchange(code) {
  const r = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT,
    }),
  })
  const tok = await r.json()
  if (!r.ok || !tok.refresh_token) {
    console.error('token exchange failed (was the offline scope granted?): ' + JSON.stringify(tok))
    process.exit(1)
  }

  const path = new URL('../.env', import.meta.url)
  let env = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const set = (k, v) => {
    const line = `${k}=${v}`
    env = new RegExp(`^${k}=.*$`, 'm').test(env)
      ? env.replace(new RegExp(`^${k}=.*$`, 'm'), line)
      : env + (env && !env.endsWith('\n') ? '\n' : '') + line + '\n'
  }
  set('WHOOP_CLIENT_ID', CLIENT_ID)
  set('WHOOP_CLIENT_SECRET', CLIENT_SECRET)
  set('WHOOP_REFRESH_TOKEN', tok.refresh_token)
  writeFileSync(path, env, { mode: 0o600 })
  // a fresh chain: the local copy of the old one is dead now
  try { unlinkSync(new URL('../.vite/whoop-refresh', import.meta.url)) } catch {}
  // and so is whatever the shared store had, when there is one
  const storeUrl = process.env.UPSTASH_REDIS_REST_URL
  const storeToken = process.env.UPSTASH_REDIS_REST_TOKEN
  if (storeUrl && storeToken) {
    const r = await fetch(storeUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${storeToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(['SET', 'whoop:refresh', tok.refresh_token]),
    })
    console.log(r.ok ? 'Seeded the Upstash store too.' : `Could not seed the Upstash store (${r.status}).`)
  }

  console.log('\nSaved to .env. Put the same three into Vercel → Settings → Environment Variables:\n')
  console.log(`WHOOP_CLIENT_ID=${CLIENT_ID}`)
  console.log(`WHOOP_CLIENT_SECRET=${CLIENT_SECRET}`)
  console.log(`WHOOP_REFRESH_TOKEN=${tok.refresh_token}\n`)
  console.log('The token is single-use. With UPSTASH_REDIS_REST_URL/_TOKEN in .env and in Vercel, the dev server\nand the site share one chain through the store; without them, whichever runs first takes the chain.')
}

/** the code out of a pasted callback address, or the bare code itself */
function codeFrom(text) {
  const t = text.trim()
  try {
    const u = new URL(t)
    if (u.searchParams.get('state') && u.searchParams.get('state') !== state) return null
    return u.searchParams.get('code')
  } catch {
    return t || null
  }
}

if (process.env.WHOOP_CODE) {
  await exchange(codeFrom(process.env.WHOOP_CODE))
} else {
  console.log('Opening WHOOP. If the browser did not open, visit:\n\n' + authUrl.href + '\n')
  execFile('open', [authUrl.href], () => {})
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const pasted = await rl.question('After "Authorize", paste the address of the error page you land on: ')
  rl.close()
  const code = codeFrom(pasted)
  if (!code) {
    console.error('no code in that (or the state did not match) — try again')
    process.exit(1)
  }
  await exchange(code)
}

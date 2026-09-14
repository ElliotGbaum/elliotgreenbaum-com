#!/usr/bin/env node
/**
 * One-time Strava login for the site — run it once, keep what it prints.
 *
 *   STRAVA_CLIENT_ID=... STRAVA_CLIENT_SECRET=... node tools/strava-auth.mjs
 *
 * Both values are on the app page at strava.com/settings/api (create one
 * there first; set its Authorization Callback Domain to `localhost`). The
 * figure in the field can say how far Elliot has run this month; to read
 * that the server needs his permission, granted once here: the script opens
 * Strava's consent page, catches the reply on localhost:8889, and trades it
 * for a refresh token — the long-lived credential the server exchanges for
 * a fresh access token whenever it needs one (server/strava.ts).
 *
 * Strava has no PKCE, so the client secret is part of the exchange; it lives
 * in the environment beside the token and never in the code. The scope is
 * activity:read — public and followers-only activities, nothing marked
 * "only me", and nothing else about the account.
 *
 * It writes the three values into .env (gitignored) for local runs, and
 * prints them so the same three can go into Vercel.
 */

import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFile } from 'node:child_process'

const CLIENT_ID = process.env.STRAVA_CLIENT_ID
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET are both needed (strava.com/settings/api)')
  process.exit(1)
}
const PORT = 8889
const REDIRECT = `http://localhost:${PORT}/callback`
const SCOPES = 'read,activity:read'
const state = randomBytes(16).toString('hex')

const authUrl = new URL('https://www.strava.com/oauth/authorize')
authUrl.search = new URLSearchParams({
  client_id: CLIENT_ID,
  response_type: 'code',
  redirect_uri: REDIRECT,
  approval_prompt: 'auto',
  scope: SCOPES,
  state,
}).toString()

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT)
  if (url.pathname !== '/callback') return res.writeHead(404).end()
  const fail = (msg) => {
    res.writeHead(400, { 'content-type': 'text/plain' }).end(msg)
    console.error(msg)
    server.close()
    process.exit(1)
  }
  if (url.searchParams.get('state') !== state) return fail('state mismatch')
  if (url.searchParams.get('error')) return fail('Strava said: ' + url.searchParams.get('error'))
  const code = url.searchParams.get('code')
  if (!code) return fail('no code in the reply')
  const granted = url.searchParams.get('scope') ?? ''
  if (!granted.includes('activity:read')) return fail('activity:read was not granted — tick "View data about your activities" and try again')

  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
    }),
  })
  const tok = await r.json()
  if (!r.ok || !tok.refresh_token) return fail('token exchange failed: ' + JSON.stringify(tok))

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(
    '<body style="font:16px system-ui;padding:2em">Done — you can close this tab.</body>',
  )

  const path = new URL('../.env', import.meta.url)
  let env = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const set = (k, v) => {
    const line = `${k}=${v}`
    env = new RegExp(`^${k}=.*$`, 'm').test(env)
      ? env.replace(new RegExp(`^${k}=.*$`, 'm'), line)
      : env + (env && !env.endsWith('\n') ? '\n' : '') + line + '\n'
  }
  set('STRAVA_CLIENT_ID', CLIENT_ID)
  set('STRAVA_CLIENT_SECRET', CLIENT_SECRET)
  set('STRAVA_REFRESH_TOKEN', tok.refresh_token)
  writeFileSync(path, env, { mode: 0o600 })

  console.log('\nSaved to .env. Put the same three into Vercel → Settings → Environment Variables:\n')
  console.log(`STRAVA_CLIENT_ID=${CLIENT_ID}`)
  console.log(`STRAVA_CLIENT_SECRET=${CLIENT_SECRET}`)
  console.log(`STRAVA_REFRESH_TOKEN=${tok.refresh_token}\n`)
  server.close()
  process.exit(0)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log('Waiting for Strava. If the browser did not open, visit:\n\n' + authUrl.href + '\n')
  execFile('open', [authUrl.href], () => {})
})

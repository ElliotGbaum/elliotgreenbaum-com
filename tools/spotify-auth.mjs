#!/usr/bin/env node
/**
 * One-time Spotify login for the site — run it once, keep what it prints.
 *
 *   SPOTIFY_CLIENT_ID=... node tools/spotify-auth.mjs
 *
 * The figure in the field can say what Elliot has been listening to. To read
 * that, the server needs Elliot's permission, granted once: this script opens
 * Spotify's consent page in the browser, catches the reply on 127.0.0.1:8888
 * (the redirect URI registered on the app), and trades it for a refresh
 * token — the long-lived credential the server exchanges for a fresh access
 * token whenever it needs one. It uses PKCE, so no client secret is involved
 * anywhere.
 *
 * It writes SPOTIFY_CLIENT_ID and SPOTIFY_REFRESH_TOKEN into .env (gitignored)
 * for local runs, and prints them so the same two can go into Vercel. The
 * scopes are the two read-only ones the feature needs and nothing else.
 */

import { createServer } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFile } from 'node:child_process'

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID
if (!CLIENT_ID) {
  console.error('SPOTIFY_CLIENT_ID is not set (it is on the app page at developer.spotify.com/dashboard)')
  process.exit(1)
}
const PORT = 8888
const REDIRECT = `http://127.0.0.1:${PORT}/callback`
const SCOPES = 'user-read-recently-played user-read-currently-playing'

const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const verifier = b64url(randomBytes(64))
const challenge = b64url(createHash('sha256').update(verifier).digest())
const state = b64url(randomBytes(16))

const authUrl = new URL('https://accounts.spotify.com/authorize')
authUrl.search = new URLSearchParams({
  client_id: CLIENT_ID,
  response_type: 'code',
  redirect_uri: REDIRECT,
  scope: SCOPES,
  state,
  code_challenge_method: 'S256',
  code_challenge: challenge,
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
  if (url.searchParams.get('error')) return fail('Spotify said: ' + url.searchParams.get('error'))
  const code = url.searchParams.get('code')
  if (!code) return fail('no code in the reply')

  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
    }),
  })
  const tok = await r.json()
  if (!r.ok || !tok.refresh_token) return fail('token exchange failed: ' + JSON.stringify(tok))

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(
    '<body style="font:16px system-ui;padding:2em">Done — you can close this tab.</body>',
  )

  // .env: replace or append the two lines, leave everything else alone
  const path = new URL('../.env', import.meta.url)
  let env = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const set = (k, v) => {
    const line = `${k}=${v}`
    env = new RegExp(`^${k}=.*$`, 'm').test(env)
      ? env.replace(new RegExp(`^${k}=.*$`, 'm'), line)
      : env + (env && !env.endsWith('\n') ? '\n' : '') + line + '\n'
  }
  set('SPOTIFY_CLIENT_ID', CLIENT_ID)
  set('SPOTIFY_REFRESH_TOKEN', tok.refresh_token)
  writeFileSync(path, env)

  console.log('\nSaved to .env. Put the same two into Vercel → Settings → Environment Variables:\n')
  console.log(`SPOTIFY_CLIENT_ID=${CLIENT_ID}`)
  console.log(`SPOTIFY_REFRESH_TOKEN=${tok.refresh_token}\n`)
  server.close()
  process.exit(0)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log('Waiting for Spotify. If the browser did not open, visit:\n\n' + authUrl.href + '\n')
  execFile('open', [authUrl.href], () => {})
})

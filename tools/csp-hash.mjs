#!/usr/bin/env node
/**
 * The CSP hash of the inline script in index.html.
 *
 *   node tools/csp-hash.mjs          prints it
 *   node tools/csp-hash.mjs --check  exits 1 if vercel.json does not carry it
 *
 * The WebGL probe at the top of index.html is the site's one inline script,
 * and it has to stay inline (it runs before first paint). The
 * Content-Security-Policy in vercel.json allows exactly it, by hash — so
 * editing it means re-running this and pasting the new value in, or the
 * probe is blocked in production and every visitor gets the fallback card.
 * verify runs the --check so that cannot ship.
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const root = new URL('../', import.meta.url)
const html = readFileSync(new URL('index.html', root), 'utf8')
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
const hashes = scripts.map((m) => 'sha256-' + createHash('sha256').update(m[1]).digest('base64'))

if (process.argv.includes('--check')) {
  const config = readFileSync(new URL('vercel.json', root), 'utf8')
  const missing = hashes.filter((h) => !config.includes(`'${h}'`))
  if (missing.length) {
    console.error('vercel.json CSP is missing the hash of an inline script:', missing.join(' '))
    process.exit(1)
  }
  console.log(`csp: ${hashes.length} inline script hash(es) present in vercel.json`)
} else {
  console.log(hashes.join('\n'))
}

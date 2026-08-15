/**
 * Look at the drawings.
 *
 *   npm run sketch            all four, part-way and finished
 *   npm run sketch guitar     one, big
 *
 * Writes shots/sketches.png (or shots/sketch-<name>.png). Starts its own vite
 * on a spare port and stops it again, so it does not care whether you have a
 * dev server up.
 *
 * The drawings themselves are hand-authored TypeScript in
 * src/film/sketches/ — see the kit there. tools/trace.mjs is the retired edge
 * tracer that used to generate them; it is kept for reference and it would
 * overwrite everything in that folder, so do not run it.
 */

import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const only = process.argv[2]
const PORT = 5311

await mkdir(path.join(root, 'shots'), { recursive: true })

/* ---- vite, on a port nothing else in this repo uses ---- */
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
})
const kill = () => {
  if (!vite.killed) vite.kill('SIGTERM')
}
process.on('exit', kill)
process.on('SIGINT', () => {
  kill()
  process.exit(130)
})

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('vite did not start in 30s')), 30000)
  vite.stdout.on('data', (b) => {
    if (/localhost:/.test(String(b))) {
      clearTimeout(timer)
      resolve()
    }
  })
  vite.stderr.on('data', (b) => process.stderr.write(b))
  vite.on('exit', (code) => reject(new Error(`vite exited (${code})`)))
})

/* ---- shoot ---- */
const browser = await chromium.launch({ channel: 'chrome', args: ['--hide-scrollbars'] })
const ctx = await browser.newContext({
  viewport: { width: only ? 1720 : 1180, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
})
const page = await ctx.newPage()

const problems = []
page.on('pageerror', (e) => problems.push(String(e.message)))
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(m.text())
})

const url = `http://localhost:${PORT}/sketches.html${only ? `?only=${only}` : ''}`
await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(400)

const out = path.join(root, 'shots', only ? `sketch-${only}.png` : 'sketches.png')
await page.screenshot({ path: out, fullPage: true })

const counts = await page.$$eval('h2', (hs) => hs.map((h) => h.textContent))
for (const c of counts) console.log(`  ${c}`)
console.log(`\n  → ${path.relative(root, out)}`)

if (problems.length) {
  console.log('\n  ✗ page errors:')
  for (const p of problems) console.log(`    ${p}`)
}

await browser.close()
kill()
process.exit(problems.length ? 1 : 0)

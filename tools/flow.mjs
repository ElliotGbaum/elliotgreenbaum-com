/**
 * Integration walkthrough: spawn → travel → film.
 *
 * Drives the real page rather than poking internals, so it exercises the same
 * path a visitor takes. Captures each stage to shots/flow/.
 *
 *   node tools/flow.mjs [url] [outdir] [--view desktop|phone]
 */

import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const args = process.argv.slice(2)
const url = args[0]?.startsWith('http') ? args[0] : 'http://localhost:5199/'
const outDir = args[1] && !args[1].startsWith('--') ? args[1] : 'shots/flow'
const viewArg = args.includes('--view') ? args[args.indexOf('--view') + 1] : 'desktop'

const VIEWS = {
  desktop: { width: 1440, height: 900, dsf: 2 },
  phone: { width: 390, height: 844, dsf: 3, mobile: true },
}
const view = VIEWS[viewArg] ?? VIEWS.desktop

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', args: ['--hide-scrollbars', '--mute-audio'] })
const ctx = await browser.newContext({
  viewport: { width: view.width, height: view.height },
  deviceScaleFactor: view.dsf,
  isMobile: !!view.mobile,
  hasTouch: !!view.mobile,
  colorScheme: 'dark',
})
const page = await ctx.newPage()

const problems = []
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|404/i.test(m.text())) problems.push(`console: ${m.text()}`)
})
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))

let n = 0
const shot = async (label) => {
  const file = path.join(outDir, `${String(++n).padStart(2, '0')}-${label}.png`)
  await page.screenshot({ path: file })
  console.log(`  → ${file}`)
}

const has = async (sel) => (await page.locator(sel).count()) > 0
const visible = async (sel) => {
  try {
    return await page.locator(sel).first().isVisible()
  } catch {
    return false
  }
}

console.log(`\n▸ ${url} @ ${viewArg}`)
await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(2600)

console.log('· spawn')
await shot('spawn')

/* ---- is the world actually running? ---- */
const state = await page.evaluate(() => ({
  hasWebglClass: document.documentElement.classList.contains('has-webgl'),
  cardHidden: getComputedStyle(document.querySelector('.card')).display === 'none',
  placesBtn: !!document.getElementById('places-btn'),
}))
console.log('· state:', JSON.stringify(state))

/* ---- Places menu ---- */
if (await has('#places-btn')) {
  console.log('· places menu')
  await page.click('#places-btn')
  await page.waitForTimeout(700)
  await shot('places')

  const items = await page.locator('#places-list button, #places-list [role="button"], #places-list li').count()
  console.log(`  ${items} place(s) listed`)

  // travel to the projector
  const proj = page.locator('#places-list').getByText(/projector/i).first()
  if ((await proj.count()) > 0) {
    await proj.click()
    console.log('· travelling to the projector')
  } else {
    await page.keyboard.press('Escape')
  }
}

/* ---- wait for the film ---- */
console.log('· waiting for film')
let filmUp = false
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(500)
  if (await visible('#film')) {
    filmUp = true
    break
  }
}
console.log(`  film visible: ${filmUp}`)

if (filmUp) {
  // sample across the runtime; act boundaries are unknown to this script on
  // purpose — we want to see whatever a viewer would see at these moments
  const marks = [1.5, 12, 26, 44, 66, 86, 98]
  let last = 0
  for (const m of marks) {
    await page.waitForTimeout((m - last) * 1000)
    last = m
    if (!(await visible('#film'))) break
    const cap = await page.locator('#film-caption').textContent().catch(() => '')
    console.log(`  t=${m}s  caption: ${String(cap).slice(0, 64)}`)
    await shot(`film-${String(m).replace('.', '_')}s`)
  }

  if (await visible('#film-skip')) {
    await page.click('#film-skip')
    await page.waitForTimeout(1800)
    console.log('· skipped to end')
    await shot('after-film')
  }
}

await browser.close()

console.log(problems.length ? `\n--- problems ---\n${problems.join('\n')}` : '\nno console errors')

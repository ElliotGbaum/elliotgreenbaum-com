/**
 * The checklist from PLAN.md §7, automated.
 *
 * These are the checks that decide whether the site is publishable at all —
 * a recruiter with no WebGL, someone on a keyboard, someone with reduced
 * motion set. Run against the production build, not the dev server.
 *
 *   node tools/verify.mjs [baseUrl]
 */

import { chromium } from 'playwright-core'

const base = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '')
const browser = await chromium.launch({ channel: 'chrome', args: ['--mute-audio'] })

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  cond ? pass++ : fail++
}

/* ── 1. first byte: is the résumé real HTML? ───────────────────────── */
console.log('\n1. Served HTML (no JS executed)')
{
  const res = await fetch(base + '/')
  const html = await res.text()
  ok('status 200', res.status === 200, String(res.status))
  ok('résumé heading present', html.includes('Elliot Greenbaum'))
  ok('experience content present', /AI Solutions Consultant/i.test(html))
  ok('education present', /Philosophy, Politics/i.test(html))
  ok('the hedge is intact', html.includes('no client-reported quality loss'))

  // What matters is not where the script tag sits but whether it blocks the
  // parser. `type="module"` is deferred by default, so a module script in
  // <head> never delays the résumé; a bare synchronous <script src> would.
  const blocking = /<script(?![^>]*\b(?:type=["']module["']|defer|async))[^>]*\bsrc=/i.test(html)
  ok('nothing render-blocking before the résumé', !blocking)
  ok('critical CSS is inline', /<style>[\s\S]*\.plain/.test(html))
}

/* ── 2. JavaScript disabled ────────────────────────────────────────── */
console.log('\n2. JavaScript disabled')
{
  const ctx = await browser.newContext({ javaScriptEnabled: false })
  const page = await ctx.newPage()
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' })
  const vis = await page.locator('#resume-source').isVisible()
  const text = await page.locator('#resume-source').innerText()
  ok('résumé visible', vis)
  ok('résumé readable', text.length > 600, `${text.length} chars`)
  await ctx.close()
}

/* ── 3. WebGL unavailable ──────────────────────────────────────────── */
console.log('\n3. WebGL unavailable')
{
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
      if (String(kind).startsWith('webgl')) return null
      return real.call(this, kind, ...rest)
    }
  })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  ok('résumé visible', await page.locator('#resume-source').isVisible())
  ok('world stays hidden', !(await page.locator('#stage').isVisible()))
  ok('no uncaught errors', errors.length === 0, errors[0] ?? '')
  await ctx.close()
}

/* ── 4. reduced motion ─────────────────────────────────────────────── */
console.log('\n4. prefers-reduced-motion: reduce')
{
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  ok('world still boots', await page.locator('#stage').isVisible())
  ok('résumé reachable', await page.locator('#resume-btn').isVisible())
  await page.click('#resume-btn')
  await page.waitForTimeout(500)
  ok('panel opens', await page.locator('#panel').isVisible())
  ok('no uncaught errors', errors.length === 0, errors[0] ?? '')
  await ctx.close()
}

/* ── 5. keyboard only ──────────────────────────────────────────────── */
console.log('\n5. Keyboard only')
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2200)

  // tab until we land on the résumé control, then activate it
  let reached = false
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    const id = await page.evaluate(() => document.activeElement?.id ?? '')
    if (id === 'resume-btn') {
      reached = true
      break
    }
  }
  ok('résumé button reachable by Tab', reached)

  if (reached) {
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)
    ok('panel opened by Enter', await page.locator('#panel').isVisible())

    const trapped = await page.evaluate(() => {
      const p = document.getElementById('panel')
      return !!p && p.contains(document.activeElement)
    })
    ok('focus moved into panel', trapped)

    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    ok('Escape closes panel', !(await page.locator('#panel').isVisible()))

    const returned = await page.evaluate(() => document.activeElement?.id ?? '')
    ok('focus returned to trigger', returned === 'resume-btn', returned)
  }

  // the Places menu is the keyboard path to every landmark
  await page.click('#places-btn')
  await page.waitForTimeout(500)
  const placesFocus = await page.evaluate(() => {
    const p = document.getElementById('places')
    return !!p && p.contains(document.activeElement)
  })
  ok('places menu takes focus', placesFocus)
  await page.keyboard.press('Escape')
  await ctx.close()
}

/* ── 6. phone viewport, tap targets ────────────────────────────────── */
console.log('\n6. Phone at 375px')
{
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  })
  const page = await ctx.newPage()
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)

  const boxes = await page.evaluate(() =>
    ['resume-btn', 'places-btn'].map((id) => {
      const el = document.getElementById(id)
      if (!el) return { id, w: 0, h: 0 }
      const r = el.getBoundingClientRect()
      return { id, w: Math.round(r.width), h: Math.round(r.height) }
    }),
  )
  for (const b of boxes) ok(`${b.id} ≥44px tall`, b.h >= 44, `${b.w}×${b.h}`)

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  ok('no horizontal overflow', overflow <= 0, `${overflow}px`)
  await ctx.close()
}

/* ── 7. landmarks disarm after use (regression) ────────────────────── *
 * The dwell trigger fires when you stand near something. After the film ends
 * you are still standing at the projector, so without a disarm it re-fires and
 * the film loops forever; the résumé panel reopens as fast as you dismiss it.
 * Skipping the film exercises the same end-path in seconds.
 */
console.log('\n7. Landmarks disarm after use')
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2200)

  await page.click('#places-btn')
  await page.waitForTimeout(600)
  await page.locator('#places-list').getByText(/projector/i).first().click()

  let started = false
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500)
    if (await page.locator('#film').isVisible()) {
      started = true
      break
    }
  }
  ok('film starts on arrival', started)

  if (started) {
    await page.click('#film-skip')
    await page.waitForTimeout(1500)
    ok('film closes on skip', !(await page.locator('#film').isVisible()))

    // still parked at the projector — this is where the loop used to happen
    await page.waitForTimeout(6000)
    ok('film does NOT restart while parked', !(await page.locator('#film').isVisible()))
  }

  await page.click('#resume-btn')
  await page.waitForTimeout(700)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(4000)
  ok('résumé panel does NOT reopen', !(await page.locator('#panel').isVisible()))
  await ctx.close()
}

await browser.close()
console.log(`\n${pass} passed, ${fail} failed\n`)
process.exitCode = fail ? 1 : 0

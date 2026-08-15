/**
 * Plays the parkour in a real browser, and photographs it.
 *
 * `npm run parkour:check` proves the courses are completable, but it proves it
 * against the physics module in isolation — it never renders a frame, never
 * presses a key, and never finds out that the camera is inside a wall or that
 * the level card covers the first jump. This does the other half: it opens
 * each course, drives it with actual keystrokes, and leaves a picture of each
 * one in shots/parkour/.
 *
 *   npm run dev            (in another terminal)
 *   npm run parkour:play [baseUrl]
 */

import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'

const base = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '')
const OUT = 'shots/parkour'
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', args: ['--mute-audio'] })
let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  cond ? pass++ : fail++
}

/* ── the gate does not exist until the film has been watched ───────── */
console.log('\n1. Before the film')
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2600)
  ok('the parkour chrome is not on screen', !(await page.locator('#pk').isVisible()))
  const compass = ((await page.locator('#compass em').textContent()) ?? '').trim()
  ok('the compass still names the projector', /projector/i.test(compass), compass)
  await page.screenshot({ path: `${OUT}/00-field-locked.png` })
  await ctx.close()
}

/* ── …and does once it has ─────────────────────────────────────────── */
console.log('\n2. After the film')
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(base + '/?unlock', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2600)
  const compass = ((await page.locator('#compass em').textContent()) ?? '').trim()
  ok('the compass has a new destination', /parkour/i.test(compass), compass)
  await page.screenshot({ path: `${OUT}/01-field-unlocked.png` })
  ok('no uncaught errors', errors.length === 0, errors[0] ?? '')
  await ctx.close()
}

/* ── every course loads, runs, and answers the keyboard ────────────── */
const LEVELS = 5
for (let n = 1; n <= LEVELS; n++) {
  console.log(`\n${n + 2}. Level ${n}`)
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })

  await page.goto(`${base}/?parkour=${n}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2200)

  ok('the course is on screen', await page.locator('#pk').isVisible())
  const name = ((await page.locator('#pk-level-name').textContent()) ?? '').trim()
  ok('it names itself', name.length > 0, name)
  ok('the level card explains it', ((await page.locator('#pk-card-hint').textContent()) ?? '').length > 10)

  // Arriving by URL has no click behind it, so the game does the right thing
  // and asks for one before it will take the mouse. Give it one.
  if (await page.locator('#pk-lock').isVisible()) {
    ok('it asks for the mouse before taking it', true)
    await page.click('#pk-lock')
    await page.waitForTimeout(400)
  }

  await page.screenshot({ path: `${OUT}/${String(n + 1).padStart(2, '0')}-level-${n}-start.png` })

  // drive it: forward, a jump, a sprint (Ctrl — Shift is sneak), and a look
  await page.keyboard.down('w')
  await page.waitForTimeout(700)
  await page.keyboard.down(' ')
  await page.waitForTimeout(300)
  await page.keyboard.up(' ')
  await page.keyboard.down('Control')
  await page.waitForTimeout(900)
  await page.mouse.move(640, 400)
  await page.mouse.move(720, 400)
  await page.waitForTimeout(600)
  await page.keyboard.up('Control')
  await page.keyboard.up('w')
  await page.waitForTimeout(400)

  const clock = ((await page.locator('#pk-timer').textContent()) ?? '').trim()
  ok('the clock runs', clock !== '0:00', clock)
  await page.screenshot({ path: `${OUT}/${String(n + 1).padStart(2, '0')}-level-${n}-run.png` })

  ok('no uncaught errors', errors.length === 0, errors[0] ?? '')
  await ctx.close()
}

/* ── leaving puts you back in the field ────────────────────────────── */
console.log(`\n${LEVELS + 3}. Leaving`)
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  await page.goto(`${base}/?parkour=1`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  if (await page.locator('#pk-lock').isVisible()) await page.click('#pk-lock')
  await page.waitForTimeout(300)
  // While the pointer is captured nothing on the page is clickable — the same
  // as any other game. Escape hands it back, and the bar has to still be
  // reachable underneath the overlay that then appears.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  ok('Leave is reachable after Escape', await page.locator('#pk-exit').isVisible())
  await page.click('#pk-exit')
  await page.waitForTimeout(1200)
  ok('the parkour chrome goes', !(await page.locator('#pk').isVisible()))
  ok('the field HUD comes back', await page.locator('#hud').isVisible())
  await page.screenshot({ path: `${OUT}/${String(LEVELS + 2).padStart(2, '0')}-back-in-the-field.png` })
  await ctx.close()
}

/* ── and a phone can play it ───────────────────────────────────────── */
console.log(`\n${LEVELS + 4}. Phone at 375px`)
{
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  })
  const page = await ctx.newPage()
  await page.goto(`${base}/?parkour=1`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2200)
  ok('the thumb controls are there', await page.locator('#pk-jump').isVisible())

  /* …AND THEY MOVE THE FIGURE. This suite passed a build whose entire touch
     path was dead — the listener was bound to a `pointer-events: none` layer,
     so no drag ever reached it — because all it checked was that the buttons
     were big enough. Drag the stick and assert the world actually changed. */
  const before = await page.screenshot()
  await page.touchscreen.tap(90, 620)
  const stick = page.locator('#pk-stick')
  await page.waitForTimeout(120)
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 90, y: 620 }],
  })
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: 90, y: 620 - i * 6 }],
    })
    await page.waitForTimeout(60)
  }
  ok('the thumbstick arms', (await stick.getAttribute('data-on')) === 'true')
  await page.waitForTimeout(700)
  const after = await page.screenshot()
  ok('and the figure actually moves', !before.equals(after))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const box = await page.locator('#pk-jump').boundingBox()
  ok('the jump button is thumb-sized', (box?.height ?? 0) >= 44, `${Math.round(box?.height ?? 0)}px`)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  ok('no horizontal overflow', overflow <= 0, `${overflow}px`)
  await page.screenshot({ path: `${OUT}/${String(LEVELS + 3).padStart(2, '0')}-phone.png` })
  await ctx.close()
}

await browser.close()
console.log(`\n${pass} passed, ${fail} failed`)
console.log(`pictures in ${OUT}/\n`)
process.exitCode = fail ? 1 : 0

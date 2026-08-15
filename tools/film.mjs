/**
 * The film, as a viewer actually sees it: on the projector's screen, out in
 * the world, with the transport bar under it.
 *
 * `npm run filmstrip` shows the *picture* — the canvas, at full size, every
 * act as stills. This shows the *shot*: whether the projector's silhouette is
 * sitting on top of the type, whether the figure is standing somewhere that
 * reads, whether the type survives being thrown onto a screen thirty units
 * away. Those are three different failures and the contact sheet cannot catch
 * any of them, because in the contact sheet there is no screen and no field.
 *
 * It also drives the controls — hover, seek, pause, 2× — so the states that
 * only exist under a pointer end up in a file you can look at.
 *
 *   node tools/film.mjs [url] [outdir] [desktop|phone]
 */

import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const url = process.argv[2] ?? 'http://localhost:5199/'
const outDir = process.argv[3] ?? 'shots/film'
const viewArg = process.argv[4] ?? 'desktop'

const VIEWS = {
  desktop: { width: 1440, height: 900, dsf: 2 },
  phone: { width: 390, height: 844, dsf: 3, mobile: true },
}
const view = VIEWS[viewArg] ?? VIEWS.desktop

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--hide-scrollbars', '--mute-audio'],
})
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

console.log(`\n▸ ${url} @ ${viewArg}`)
await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(2600)
await shot('spawn')

// Walk over and press E, because that is now the only way the lamp comes on.
// This used to click the projector — the machine is dead centre in every
// framing the rig produces — and before that it travelled via the Places menu.
// Both are gone: Places in the lantern pass (see CONTEXT §4: a list of places
// to go, in a world with one place worth going) and the click because a click
// carries no intent. Three seconds of ArrowUp covers the thirty units from
// spawn to well inside the seventeen-unit radius; tools/verify.mjs walks the
// same way.
console.log('· walking over')
await page.keyboard.down('ArrowUp')
await page.waitForTimeout(3000)
await page.keyboard.up('ArrowUp')
await page.waitForTimeout(400)
await page.keyboard.press('e')

let up = false
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(500)
  if (await page.locator('#film').isVisible()) {
    up = true
    break
  }
}
console.log(`  running: ${up}`)
if (!up) {
  console.log(problems.length ? `\n--- problems ---\n${problems.join('\n')}` : '\nno console errors')
  await browser.close()
  process.exit(1)
}

await shot('titles')

/* One frame per act, seeked rather than waited for: the film is two minutes
   long and watching it through is the feedback loop this tool exists to
   replace. Each is taken about seven tenths of the way into its act, which is
   after every beat in it has landed and before the act starts handing over. */
const scrub = await page.locator('#film-scrub').boundingBox()
/* The act list, read off the scrubber the film built for itself: each segment's
   flex-grow IS its duration in seconds (see src/film/controls.ts), and
   aria-valuemax is the runtime. Derived rather than written down here, so this
   tool cannot go stale when an act is added, cut or re-timed — which is exactly
   how it broke last time. */
const film = await page.evaluate(() => {
  const el = document.getElementById('film-scrub')
  const runtime = Number(el?.getAttribute('aria-valuemax') ?? 0)
  const durations = [...document.querySelectorAll('#film-scrub .film-chap')].map((s) =>
    Number(getComputedStyle(s).flexGrow) || 0,
  )
  return { runtime, durations }
})

if (scrub && film.runtime > 0 && film.durations.length) {
  console.log(`· ${film.durations.length} acts over ${film.runtime}s`)
  let start = 0
  for (let i = 0; i < film.durations.length; i++) {
    const dur = film.durations[i]
    const at = start + dur * 0.72
    start += dur
    await page.mouse.click(
      scrub.x + scrub.width * (at / film.runtime),
      scrub.y + scrub.height / 2,
    )
    await page.waitForTimeout(650)
    await shot(`act${i}`)
  }
}

const box = scrub
if (box) {
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height / 2)
  await page.waitForTimeout(400)
  await shot('scrub-hover')
  await page.mouse.click(box.x + box.width * 0.78, box.y + box.height / 2)
  await page.waitForTimeout(900)
  await shot('scrub-seek')
}

await page.click('#film-play')
await page.waitForTimeout(600)
await shot('paused')
await page.click('#film-play')
await page.waitForTimeout(400)

await page.keyboard.down(' ')
await page.waitForTimeout(900)
await shot('two-x')
await page.keyboard.up(' ')

await page.click('#film-skip')
await page.waitForTimeout(2500)
await shot('lights-up')
console.log(`  stopped: ${!(await page.locator('#film').isVisible())}`)

console.log(problems.length ? `\n--- problems ---\n${problems.join('\n')}` : '\nno console errors')
await browser.close()

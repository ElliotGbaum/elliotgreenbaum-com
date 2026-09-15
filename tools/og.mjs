/**
 * The link preview — public/og.png.
 *
 * What a pasted link shows in Slack, iMessage, LinkedIn or X. It is a frame of
 * the world itself: the field at night, the figure at the projector, the film
 * up on the screen with the title card typed out. A picture of the site
 * rather than a card *about* the site, because the site is the argument.
 *
 * Drives a real build exactly the way verify.mjs does — walk in on the keys,
 * press E, wait for the title to finish typing — then hides the chrome (the
 * transport bar, the compass, the prompt) and shoots 1200×630, which is the
 * one size every network accepts without cropping.
 *
 *   npm run build && npm run preview     (in another terminal)
 *   node tools/og.mjs [url] [outfile]
 *
 * CHROME_PATH=/path/to/chromium picks a binary when the system Chrome channel
 * is not there (CI, a container). Headless WebGL falls back to SwiftShader,
 * which is slower and a shade flatter than a GPU; the shot survives it.
 */

import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const url = process.argv[2] ?? 'http://localhost:4173/'
const out = process.argv[3] ?? 'public/og.png'
/** seconds into the film to shoot — after the title has typed out (act 0) */
const AT_T = Number(process.env.OG_T ?? 5.6)

await mkdir(path.dirname(out), { recursive: true })

const launch = {
  args: ['--hide-scrollbars', '--mute-audio', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
}
const browser = process.env.CHROME_PATH
  ? await chromium.launch({ ...launch, executablePath: process.env.CHROME_PATH })
  : await chromium.launch({ ...launch, channel: 'chrome' })

/* Shot a little wider than the picture and cropped back to 1200 from the
   left. Elliot stands off to the right of the projector, and at this aspect
   his nametag (a sprite in the world, not chrome — nothing here can hide it)
   just enters the right edge of a 1200-wide frame, cropped mid-word. The
   extra width pushes him out of the crop; the composition barely moves. */
const BLEED = Number(process.env.OG_BLEED ?? 240)
const ctx = await browser.newContext({
  viewport: { width: 1200 + BLEED, height: 630 },
  deviceScaleFactor: 1,
  colorScheme: 'dark',
})
const page = await ctx.newPage()
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|404/i.test(m.text())) console.error('console:', m.text())
})

// the preview server may still be coming up
for (let i = 0; ; i++) {
  try {
    await page.goto(`${url}${url.includes('?') ? '&' : '?'}analytics=off`, { waitUntil: 'load' })
    break
  } catch (err) {
    if (i >= 20) throw err
    await new Promise((r) => setTimeout(r, 500))
  }
}
await page.waitForSelector('html.is-ready', { state: 'attached', timeout: 30000 })
await page.waitForTimeout(800)

// walk in and switch it on. Held until the key badge lights rather than for
// a fixed three seconds: under SwiftShader the frame rate is low and the
// figure covers less ground per wall-clock second, so a timed walk falls short.
await page.keyboard.down('ArrowUp')
await page.waitForSelector('#interact[data-on="true"]', { state: 'attached', timeout: 40000 })
await page.keyboard.up('ArrowUp')
await page.waitForTimeout(400)
await page.keyboard.press('e')
await page.waitForSelector('#film', { state: 'visible', timeout: 30000 })

// hold on the frame we want: pause, then seek. The chrome goes at the same
// moment, so nothing is drawn over the picture.
await page.evaluate(() => {
  const css = document.createElement('style')
  css.textContent = '#hud,#film,#film-tldr,#fs-btn{display:none!important}'
  document.head.appendChild(css)
})
const seconds = async () => Number(((await page.locator('#film-time').textContent()) ?? '0').split('/')[0].split(':').reduce((m, s) => m * 60 + Number(s), 0))
for (let i = 0; i < 60 && (await seconds()) < AT_T; i++) await page.waitForTimeout(200)
await page.keyboard.press('k')
await page.waitForTimeout(600)

await page.screenshot({ path: out, type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } })
console.log(`og: wrote ${out}`)
await browser.close()

/**
 * Screenshot harness.
 *
 * Uses the system Chrome via playwright-core (no 300MB browser download) so
 * WebGL renders on real hardware drivers rather than SwiftShader — which
 * matters, because half the point of these shots is judging whether the
 * lighting reads correctly.
 *
 *   node tools/shoot.mjs <url> <outdir> [--wait ms] [--keys "f"] [--only desktop|phone]
 */

import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const args = process.argv.slice(2)
const url = args[0] ?? 'http://localhost:5199/preview.html'
const outDir = args[1] ?? 'shots'
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}
const settle = Number(flag('wait', 2600))
const keys = flag('keys', '')
const only = flag('only', '')

const VIEWS = [
  { name: 'desktop', width: 1440, height: 900, dsf: 2 },
  { name: 'phone', width: 390, height: 844, dsf: 3, mobile: true },
].filter((v) => !only || v.name === only)

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--hide-scrollbars', '--mute-audio'],
})

const problems = []

for (const v of VIEWS) {
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: v.dsf,
    isMobile: !!v.mobile,
    hasTouch: !!v.mobile,
    colorScheme: 'dark',
  })
  const page = await ctx.newPage()

  // --no-webgl captures the plain lane: what a recruiter on a locked-down
  // machine, a crawler, or anyone with WebGL blocked actually sees.
  if (args.includes('--no-webgl')) {
    await page.addInitScript(() => {
      const real = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
        if (String(kind).startsWith('webgl')) return null
        return real.call(this, kind, ...rest)
      }
    })
  }

  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[${v.name}] console: ${m.text()}`)
  })
  page.on('pageerror', (e) => problems.push(`[${v.name}] pageerror: ${e.message}`))

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })

  // confirm WebGL actually initialised rather than silently falling back
  const gl = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    if (!c) return 'no canvas'
    const ctx2 = c.getContext('webgl2') || c.getContext('webgl')
    if (!ctx2) return 'no gl context'
    const dbg = ctx2.getExtension('WEBGL_debug_renderer_info')
    return dbg ? String(ctx2.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'gl ok'
  })
  console.log(`[${v.name}] renderer: ${gl}`)

  await page.waitForTimeout(settle)

  for (const k of keys.split(',').filter(Boolean)) {
    await page.keyboard.press(k)
    await page.waitForTimeout(1400)
  }

  const file = path.join(outDir, `${v.name}.png`)
  // --full for contact sheets: a samples=14 strip is far taller than any
  // viewport, and a cropped sheet silently hides the rows you most need to see.
  await page.screenshot({ path: file, fullPage: args.includes('--full') })
  console.log(`[${v.name}] → ${file}`)

  await ctx.close()
}

await browser.close()

if (problems.length) {
  console.log('\n--- page problems ---')
  for (const p of problems) console.log(p)
  process.exitCode = 0 // reporting, not gating
} else {
  console.log('\nno console errors')
}

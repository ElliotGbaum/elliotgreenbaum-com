// scratch: walk to Elliot, pick the call, send a line, log how the reply text grows
import { chromium } from 'playwright-core'
const base = (process.argv[2] ?? 'http://localhost:5199').replace(/\/$/, '')
const out = process.argv[3] ?? '/tmp/pace.png'
const browser = await chromium.launch({ channel: 'chrome', args: ['--mute-audio'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2200)
await page.keyboard.down('ArrowUp'); await page.waitForTimeout(1300); await page.keyboard.up('ArrowUp')
await page.keyboard.down('ArrowRight'); await page.waitForTimeout(1300); await page.keyboard.up('ArrowRight')
await page.keyboard.down('ArrowUp'); await page.waitForTimeout(900); await page.keyboard.up('ArrowUp')
await page.waitForTimeout(900)
await page.keyboard.press('e')
await page.locator('#talk').waitFor({ state: 'visible', timeout: 10000 })
await page.locator('.talk__pick[data-mode="book"]').click()
await page.waitForFunction(() => document.querySelectorAll('#talk-log li').length >= 2 && document.querySelector('#talk-form button:not([disabled])'), null, { timeout: 30000 })
await page.evaluate(() => {
  window.__log = []
  const t0 = performance.now()
  const obs = new MutationObserver(() => {
    const lis = document.querySelectorAll('#talk-log li')
    const last = lis[lis.length - 1]
    if (!last || !last.classList.contains('talk__line--assistant')) return
    const len = last.querySelector('.talk__text').textContent.length
    const prev = window.__log[window.__log.length - 1]
    if (!prev || prev[1] !== len) window.__log.push([Math.round(performance.now() - t0), len])
  })
  obs.observe(document.querySelector('#talk-log'), { subtree: true, childList: true, characterData: true })
})
await page.locator('#talk-input').fill('Monday afternoon works')
await page.keyboard.press('Enter')
await page.waitForFunction(() => document.querySelector('#talk-form button:not([disabled])'), null, { timeout: 40000 })
const log = await page.evaluate(() => window.__log)
const first = log.find((e) => e[1] > 0)
console.log(`paint events: ${log.length}, first text at ${first?.[0]}ms, done at ${log.at(-1)?.[0]}ms, ${log.at(-1)?.[1]} chars`)
const steps = log.filter((e) => e[1] > 0).map((e, i, a) => (i ? e[1] - a[i - 1][1] : e[1]))
console.log(`chars per paint: max ${Math.max(...steps)}, median ${steps.sort((a, b) => a - b)[Math.floor(steps.length / 2)]}`)
const gaps = log.filter((e) => e[1] > 0).map((e, i, a) => (i ? e[0] - a[i - 1][0] : 0)).slice(1)
console.log(`gaps between paints: max ${Math.max(...gaps)}ms`)
await page.screenshot({ path: out })
await browser.close()

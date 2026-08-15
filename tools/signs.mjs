/**
 * The two signs, and the two ways into them.
 *
 * Everything in this field is opened the same way, and "the same way" now has
 * two halves: walk up and press the key the badge floating at the board names,
 * or point at the board — which does NOT open it where you stand. A click from
 * out in the field is an errand: the figure walks over and the board is pressed
 * on arrival. tools/verify.mjs §7 fences the identical pair of rules at the
 * projector; this file is the fence at the boards.
 *
 * THE INTERESTING ASSERTION IS STILL A NEGATIVE, and it is the one that matters
 * most out here: a click must never drop somebody into a platformer or an
 * endless runner from thirty units away, because a click is the one gesture in
 * this world that carries no intent. So each board is asked twice — nothing a
 * second after the click, the game once the walk is done.
 *
 * It is a separate tool rather than a block inside surf-play/parkour-play
 * because the thing under test is the FIELD, not either game: the same
 * assertions have to hold at both boards, and a check that lives inside a suite
 * about the runner is a check nobody runs when they change the gate.
 *
 *   node tools/signs.mjs [baseUrl]
 */

import { chromium } from 'playwright-core'

const base = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '')
const browser = await chromium.launch({ channel: 'chrome', args: ['--mute-audio'] })

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  cond ? pass++ : fail++
}

const until = async (page, fn, ms = 9000) => {
  const t = Date.now()
  while (Date.now() - t < ms) {
    if (await fn()) return true
    await page.waitForTimeout(200)
  }
  return false
}

/** hold a diagonal until `done` says we have arrived, then stop and settle */
async function walk(page, keys, done) {
  for (const k of keys) await page.keyboard.down(k)
  const there = await until(page, done)
  for (const k of keys) await page.keyboard.up(k)
  await page.waitForTimeout(600)
  return there
}

/** a page at the field, both signs already standing, the world faded up */
async function field(errors) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
  await page.goto(base + '/?unlock', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2600)
  return [page, ctx]
}

/* Keys are world axes (see player.ts's header) and the figure spawns at +Z
   facing the projector, so up-and-right arrives at the parkour board and
   up-and-left at the runner's. Both stand at z = 24.

   `at` is where the board's face lands on a 1280 × 800 canvas from the spawn
   point, as a fraction of it — the pair sit either side of the screen at about
   two-fifths of the way down (run `npm run shoot` and look). It is only used
   for the click-from-a-distance checks, which need a point on the board and do
   not care where on it. */
const BOARDS = [
  { name: 'the parkour board', keys: ['ArrowUp', 'ArrowRight'], prompt: /parkour/i, verb: /play/i, chrome: '#pk', at: [0.8, 0.39] },
  { name: 'the runner’s board', keys: ['ArrowUp', 'ArrowLeft'], prompt: /to run/i, verb: /run/i, chrome: '#sf', at: [0.23, 0.39] },
]

for (const b of BOARDS) {
  console.log(`\n${b.name}`)

  /* ---- walking up to it ---- */
  {
    const errors = []
    const [page, ctx] = await field(errors)

    const read = await walk(page, b.keys, async () =>
      b.prompt.test(((await page.locator('#prompt').textContent()) ?? '')),
    )
    ok('walking up offers it', read, ((await page.locator('#prompt').textContent()) ?? '').trim())

    /* …and keep walking, because the badge has its own much tighter radius:
       `radius` means "this is the thing you are near" and `reachRadius` means
       "you could put your hand on it". See the note over the badge block in
       src/main.ts — the sentence at the bottom of the screen hands over to the
       label at the object as you arrive. */
    const up = await walk(
      page,
      b.keys,
      async () => (await page.locator('#interact').getAttribute('data-on')) === 'true',
    )
    const verb = ((await page.locator('#interact .interact__verb').textContent()) ?? '').trim()
    ok('the key badge comes up at the board', up, verb)
    ok('…and it names the verb, not the sentence', b.verb.test(verb), verb)

    await page.keyboard.press('e')
    ok('E opens it', await until(page, async () => page.locator(b.chrome).isVisible(), 6000))
    ok('no uncaught errors', errors.length === 0, errors[0] ?? '')
    await ctx.close()
  }

  /* ---- pointing at it from the spawn ----
     THE NEGATIVE, and the positive it is half of. A click on the board from
     thirty units away must not open anything where you stand; it must send the
     figure over and open it when the figure gets there. Both halves, or the
     check is worth nothing: "nothing happened" also describes a click path
     that is simply broken. */
  {
    const errors = []
    const [page, ctx] = await field(errors)
    const box = await page.locator('#stage').boundingBox()
    await page.mouse.click(box.x + box.width * b.at[0], box.y + box.height * b.at[1])
    await page.waitForTimeout(1000)
    ok('clicking it does NOT open it there and then', !(await page.locator(b.chrome).isVisible()))
    ok(
      '…it walks over and opens it on arrival',
      await until(page, async () => page.locator(b.chrome).isVisible(), 15000),
    )
    ok('no uncaught errors', errors.length === 0, errors[0] ?? '')
    await ctx.close()
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
await browser.close()
process.exit(fail ? 1 : 0)

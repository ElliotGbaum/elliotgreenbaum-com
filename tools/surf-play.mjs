/**
 * Plays the trainyard in a real browser, and photographs it.
 *
 * `npm run surf:check` proves the generator is fair and the runner moves the
 * way §D says — but it proves it in Node, against three pure modules. It never
 * renders a frame, never presses a key, and so it can never find out that the
 * camera is inside a carriage, that the HUD covers the lane you are about to
 * need, or that the whole thing boots to a black rectangle. This does the other
 * half: it opens the sign, plays the game with actual keystrokes, and leaves a
 * numbered strip of pictures in shots/surf/ for a human to look at.
 *
 * What is asserted here is only what a machine can honestly decide: the chrome
 * is on screen, the readouts move, the frames differ, the run ends in a panel
 * that says how, the whole path works from the keyboard alone, and a thumb can
 * drag on a phone. Two of the pictures — riding a wagon roof, and a power
 * running — are HUNTED for rather than asserted: a blind bot reaches them by
 * luck, and a red line that depends on luck is a red line people learn to
 * ignore. They are reported with a `·` and the shot is taken if it happens.
 *
 *   npm run dev            (in another terminal)
 *   npm run surf:play [baseUrl]
 */

import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'

const base = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '')
const OUT = 'shots/surf'
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', args: ['--mute-audio'] })
let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  cond ? pass++ : fail++
}
/** an observation, not a claim. The house prints these with a dot. */
const note = (text) => console.log(`  · ${text}`)

/**
 * A screenshot, kept in memory as well as on disk.
 *
 * The frame check is the file size, and it is a heuristic on purpose. PNG is
 * run-length friendly: a black frame, a frame of flat fog, or a canvas that
 * never got a draw call all compress to a few kilobytes, while a real frame of
 * this game — sleepers, ballast speckle, rim lines, a hundred motes — comes out
 * near a third of a megabyte at 1280×800. Decoding the PNG to average its
 * pixels would be forty lines of zlib and IHDR parsing to learn the same thing.
 * The threshold is set an order of magnitude below a real frame and an order
 * above a blank one, which is as much precision as the question needs.
 */
const BLANK_BYTES = 20000
const shots = []
async function shoot(page, n, name) {
  const buf = await page.screenshot()
  const file = `${OUT}/${String(n).padStart(2, '0')}-${name}.png`
  await writeFile(file, buf)
  shots.push({ file, bytes: buf.length, buf })
  return buf
}

/** poll until `fn()` is true, or give up. Returns whether it happened. */
async function until(page, fn, ms, step = 100) {
  for (let waited = 0; waited < ms; waited += step) {
    if (await fn()) return true
    await page.waitForTimeout(step)
  }
  return false
}

/** every context gets both kinds of error caught, or the suite is decoration */
function watch(page) {
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  return errors
}

const desktop = () => browser.newContext({ viewport: { width: 1280, height: 800 } })

/** metres off `#sf-dist`, which reads "408 m" */
const metres = async (page) => {
  const t = (await page.locator('#sf-dist').textContent()) ?? ''
  const m = /(\d+)/.exec(t)
  return m ? Number(m[1]) : -1
}

/* ── 1. before the film there is no sign ───────────────────────────── *
 * The signal is gated on the same flag as the parkour gate, and §F is
 * explicit that a locked landmark is not a landmark you can see: it is not
 * there at all. A lock you can look at is a promise, and this site does not
 * make promises it makes you earn.
 */
console.log('\n1. Before the film')
{
  const ctx = await desktop()
  const page = await ctx.newPage()
  const errors = watch(page)
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2600)
  ok('the trainyard chrome is not on screen', !(await page.locator('#sf').isVisible()))
  const compass = ((await page.locator('#compass [data-mark="projector"] em').textContent()) ?? '').trim()
  ok('the compass still names the projector', /projector/i.test(compass), compass)
  await shoot(page, 0, 'field-locked')
  ok('no uncaught errors', errors.length === 0, errors[0] ?? '')
  await ctx.close()
}

/* ── 2. …and after it, a sign out to the west ──────────────────────── */
console.log('\n2. The sign in the field')
{
  const ctx = await desktop()
  const page = await ctx.newPage()
  const errors = watch(page)
  await page.goto(base + '/?unlock', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2600)
  const compass = ((await page.locator('#compass [data-mark="projector"] em').textContent()) ?? '').trim()
  ok('the compass has somewhere new to point', /surfers|parkour/i.test(compass), compass)

  /* Walk to it. Keys are world axes (see player.ts's header), the figure
     spawns at +Z facing the projector, and the signal stands at x = −20,
     z = 24 — so up and left, held together, is the diagonal that arrives. */
  await page.keyboard.down('ArrowUp')
  await page.keyboard.down('ArrowLeft')
  const arrived = await until(
    page,
    async () => /trainyard/i.test(((await page.locator('#prompt').textContent()) ?? '')),
    9000,
  )
  await page.keyboard.up('ArrowLeft')
  await page.keyboard.up('ArrowUp')
  await page.waitForTimeout(600)
  const prompt = ((await page.locator('#prompt').textContent()) ?? '').trim()
  ok('walking to the sign offers the run', arrived, prompt)
  await shoot(page, 1, 'the-sign')
  ok('no uncaught errors', errors.length === 0, errors[0] ?? '')
  await ctx.close()
}

/* ── 3. a run, photographed ────────────────────────────────────────── */
console.log('\n3. A run')
{
  const ctx = await desktop()
  const page = await ctx.newPage()
  const errors = watch(page)
  await page.goto(base + '/?surf', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2400)

  ok('the trainyard is on screen', await page.locator('#sf').isVisible())
  const name = ((await page.locator('#sf-card-name').textContent()) ?? '').trim()
  ok('it names itself', name.length > 0, name)
  const hint = ((await page.locator('#sf-card-hint').textContent()) ?? '').trim()
  ok('the card says how to play it', hint.length > 10, hint)
  ok('the field HUD has stood down', !(await page.locator('#hud').isVisible()))

  const first = await shoot(page, 2, 'first-frame')

  /* …and it is running before anything is pressed. §D.10: no countdown, the
     figure is already at V0, the swoop is decoration you can play through. */
  const early = await metres(page)
  await page.waitForTimeout(1200)
  const later = await metres(page)
  ok('the run starts itself, at speed', later > early && early >= 0, `${early} m → ${later} m`)

  await page.waitForTimeout(2500)
  const speedFrame = await shoot(page, 3, 'at-speed')
  ok('the world is redrawing', !first.equals(speedFrame))

  /* A lane change, caught inside its own four ticks. The tween is 0.20 s, so
     the shot has to be taken about eighty milliseconds after the key — late
     enough that the figure has left the lane, early enough that it has not
     arrived at the next one. */
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(80)
  const laneFrame = await shoot(page, 4, 'lane-change')
  ok('a lane change moves the picture', !speedFrame.equals(laneFrame))

  /* A jump, caught near the apex: fourteen ticks of airtime, seven of them
     rising, so 0.35 s after the key is the top of the arc. */
  await page.keyboard.press('Space')
  await page.waitForTimeout(350)
  const jumpFrame = await shoot(page, 5, 'jump')
  ok('a jump moves the picture', !laneFrame.equals(jumpFrame))

  /* ---- the two hunted pictures ---------------------------------------- *
   * Play on, blind, and watch the readouts for the two states that cannot be
   * asked for: a power running (a ring appears in #sf-rings) and a wagon roof
   * under the feet. Nothing in the DOM says "on a roof" — the HUD is a score,
   * a distance and a lane strip — so the roof shot is taken on the rhythm that
   * gets you there (jump at the wagons, hold the line) and named as an eye
   * check rather than pretended to be a measurement.
   */
  const RUNS = 3
  let power = false
  let roofShot = false
  let deathShot = false
  let best = 0
  for (let run = 1; run <= RUNS; run++) {
    let died = false
    let lastDist = await metres(page)
    let still = 0
    for (let i = 0; i < 300 && !died; i++) {
      const beat = i % 10
      if (beat === 0) await page.keyboard.press('Space')
      else if (beat === 4) await page.keyboard.press('ArrowRight')
      else if (beat === 6) await page.keyboard.press('ArrowDown')
      else if (beat === 8) await page.keyboard.press('ArrowLeft')
      await page.waitForTimeout(140)

      if (!power && (await page.locator('#sf-rings > *').count()) > 0) {
        power = true
        await shoot(page, 7, 'power-running')
      }
      if (!roofShot && beat === 1) {
        // one frame from inside the jump rhythm, which is where a roof happens
        roofShot = true
        await shoot(page, 6, 'wagon-attempt')
      }

      /* The death sequence is a second of hit-stop, slow-motion and a tumble
         before the panel arrives, and it is the best-looking second in the
         game. The tell is the distance readout freezing while the panel is
         still hidden — the simulation halts on the fatal tick and the DOM does
         not lie about it. Catch that and photograph the tumble. */
      const d = await metres(page)
      best = Math.max(best, d)
      const panel = await page.locator('#sf-panel').isVisible()
      if (!panel && d === lastDist && d > 0) {
        still++
        if (still === 2) {
          if (!deathShot) {
            await shoot(page, 8, 'death')
            deathShot = true
          }
          died = true
        }
      } else {
        still = 0
      }
      lastDist = d
      if (panel) died = true
    }
    /* Three runs rather than one, because the two hunted pictures are a
       question of how much track goes past: a power spawns about every 570 u
       and a blind bot covers two or three hundred at a time. Stop early the
       moment the hunt succeeds — the panel of whichever run is current is the
       one photographed next, and they are all the same panel. */
    if (power || run === RUNS) break
    await page.keyboard.press('KeyR')
    await page.waitForTimeout(1000)
  }

  note(
    power
      ? 'a power was collected and its ring photographed'
      : `no power collected in ${RUNS} runs (best ${best} m) — 07 not taken`,
  )
  note('06 is the jump rhythm, where a wagon roof happens; judge it by eye')

  const panelUp = await until(page, async () => page.locator('#sf-panel').isVisible(), 8000)
  ok('the run ends in a panel', panelUp)
  if (panelUp) {
    await page.waitForTimeout(900)
    await shoot(page, 9, 'panel')
    const title = ((await page.locator('#sf-panel-title').textContent()) ?? '').trim()
    ok('the panel names the ending', title.length > 0, title)
    const body = ((await page.locator('#sf-panel-body').innerText()) ?? '').trim()
    // §D.10: the player's question after a death is always *which way did I
    // get it wrong*, so the card answers it in a sentence before it shows a
    // number. A panel with only a score is the one that ends the session.
    ok('…and says how the run ended', /\w+ \w+/.test(body.split('\n')[0] ?? ''), (body.split('\n')[0] ?? '').slice(0, 60))
    ok('…and shows what was run', /\d/.test(body), body.replace(/\n+/g, ' · ').slice(0, 80))
    ok('Again is offered', await page.locator('#sf-again').isVisible())
  }

  ok('no uncaught errors in the whole run', errors.length === 0, errors[0] ?? '')
  await ctx.close()
}

/* ── 4. the whole path, keyboard only ──────────────────────────────── *
 * §G/39: field → sign → run → death → retry → leave, without one pointer
 * event being dispatched. Somebody arrives here on a laptop with a trackpad
 * they are not using, and the game is played with the same four keys the card
 * names; if the only way out of the panel is a click, the keyboard player is
 * stuck inside a dialog with no way back to the field.
 */
console.log('\n4. Keyboard only')
{
  const ctx = await desktop()
  const page = await ctx.newPage()
  const errors = watch(page)
  await page.goto(base + '/?surf', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2400)

  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Space')
  await page.waitForTimeout(800)
  const before = await metres(page)
  ok('the keys reach the runner', before > 0, `${before} m`)

  // R restarts, guarded on the meta/ctrl chord so it never eats a reload
  await page.keyboard.press('KeyR')
  await page.waitForTimeout(900)
  const after = await metres(page)
  ok('R starts a new run', after >= 0 && after < before + 40, `${before} m → ${after} m`)

  /* One Escape pauses; a second inside 600 ms leaves (input.ts's `LEAVE`
     note). Both halves are checked, because the pause is the half a player
     hits by accident and the leave is the half they need when they have had
     enough — and a single Escape that quit the game would take the run away
     from somebody who only wanted to stop for a moment. */
  await page.keyboard.press('Escape')
  await page.waitForTimeout(800) // past the 600 ms window, so this is only a pause
  ok('one Escape pauses, and does not leave', await page.locator('#sf').isVisible())
  await page.keyboard.press('Escape')
  await page.waitForTimeout(120)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1600)
  ok('two Escapes hand the field back', !(await page.locator('#sf').isVisible()))
  ok('the field HUD comes back', await page.locator('#hud').isVisible())
  await shoot(page, 10, 'back-in-the-field')
  ok('no uncaught errors', errors.length === 0, errors[0] ?? '')
  await ctx.close()
}

/* ── 5. and a phone can play it ────────────────────────────────────── *
 * Half the visitors are on a phone, so touch is a path and not a fallback.
 * The parkour's suite once passed a build whose entire touch path was dead —
 * the listener was bound to a `pointer-events: none` layer — because all it
 * checked was that the buttons were big enough. So: drag a real finger across
 * the canvas with CDP, and demand the picture change.
 */
console.log('\n5. Phone at 375px')
{
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  })
  const page = await ctx.newPage()
  const errors = watch(page)
  await page.goto(base + '/?surf', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2600)

  ok('the thumb controls are there', await page.locator('#sf-touch').isVisible())
  for (const id of ['sf-left', 'sf-right', 'sf-jump', 'sf-roll']) {
    const box = await page.locator(`#${id}`).boundingBox()
    ok(`#${id} is thumb-sized`, (box?.height ?? 0) >= 44, `${Math.round(box?.height ?? 0)}px`)
  }

  const before = await page.screenshot()
  const cdp = await ctx.newCDPSession(page)
  // a swipe left across the middle of the screen, dispatched as real touches
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 250, y: 500 }] })
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: 250 - i * 12, y: 500 }],
    })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(120)
  const after = await page.screenshot()
  ok('a thumb drag changes the frame', !before.equals(after))

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  ok('no horizontal overflow', overflow <= 0, `${overflow}px`)
  await shoot(page, 11, 'phone')
  ok('no uncaught errors', errors.length === 0, errors[0] ?? '')
  await ctx.close()
}

/* ── 6. and none of the pictures is a black rectangle ──────────────── */
console.log('\n6. The pictures')
{
  const blank = shots.filter((s) => s.bytes < BLANK_BYTES)
  for (const s of shots) {
    console.log(`  ${s.bytes < BLANK_BYTES ? '✗' : ' '} ${s.file.padEnd(34)} ${(s.bytes / 1024).toFixed(0)} kB`)
  }
  ok('no blank or black frames', blank.length === 0, blank.map((s) => s.file).join(' '))
}

await browser.close()
console.log(`\n${pass} passed, ${fail} failed`)
console.log(`pictures in ${OUT}/\n`)
process.exitCode = fail ? 1 : 0

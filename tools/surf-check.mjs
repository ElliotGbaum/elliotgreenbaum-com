/**
 * Is the trainyard fair, and does it move the way the spec says it moves?
 *
 * This runs the *shipping* modules — src/surf/rng.ts, track.ts and sim.ts — in
 * Node, with no browser, no three.js and no canvas, because all three of them
 * are pure on purpose and that purity is what buys this file. It proves things
 * about the generator rather than hoping about it: every committed metre of
 * track is walked, every lethal piece is timed, and a bot that follows the
 * solver's own witness line is put through the real simulation and asked to
 * survive six thousand units on every seed.
 *
 * The two bots are the argument, and they are two halves of one claim:
 *
 *   • the WITNESS bot replays the line `solve()` found, through `sim.ts` and
 *     not through `solve()`. If the generator and the simulation disagree by
 *     one tick anywhere, it dies. It proves the game is FAIR.
 *   • the DO-NOTHING bot holds no keys at all. It has to die, quickly, on
 *     nearly every seed. It proves the game is a GAME.
 *
 * Neither is worth anything without the other: a track nobody can survive
 * passes the second, and an empty field passes the first.
 *
 *   node tools/surf-check.mjs
 */

import { registerHooks } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/* The source imports `./track`, the way a bundler wants it; Node wants the
   extension. One resolve hook, and this tool runs the shipping files rather
   than a copy of them — which is the entire point of it. Same hook, character
   for character, as tools/parkour-check.mjs. */
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) {
      try {
        return next(`${specifier}.ts`, context)
      } catch {
        /* fall through to the real specifier */
      }
    }
    return next(specifier, context)
  },
})

const { createRng } = await import('../src/surf/rng.ts')
const {
  createTrack,
  solve,
  speedAt,
  tierAt,
  SOLVER_CONSTANTS,
  LANE_W,
  laneToX,
  WRITE_AHEAD,
  GAP_MIN,
  GAP_MAX,
  GAP_BRIDGE,
  MIN_DEPTH,
  LANES,
  FOG_DENSITY,
  DECISION_GAP_MIN,
  decisionSpacing,
  MOTE_DENSITY,
  MOTE_STEP,
  PATTERNS,
  decode,
} = await import('../src/surf/track.ts')
const SIM = await import('../src/surf/sim.ts')
const { createSim } = SIM

const HERE = dirname(fileURLToPath(import.meta.url))

/* ------------------------------------------------------------------ *
 * The house report shape: a ticked line each, a count at the end.
 * ------------------------------------------------------------------ */

const results = []
const ok = (name, pass, note = '') => {
  results.push(!!pass)
  console.log(`  ${pass ? '✓' : '✗'} ${name.padEnd(46)} ${note}`)
}
const near = (name, got, want, tol, unit = '') =>
  ok(name, Math.abs(got - want) <= tol, `${got}${unit} (want ${want}${unit} ±${tol})`)

/* ------------------------------------------------------------------ *
 * A scripted ActionSource. The seam in §C.3 exists precisely so that a
 * harness can drive the simulation without input.ts, the DOM or a hand.
 * ------------------------------------------------------------------ */

const source = () => {
  const q = { lane: null, vert: null }
  return {
    peek: (ch) => q[ch],
    take: (ch) => {
      const a = q[ch]
      q[ch] = null
      return a
    },
    clear: () => {
      q.lane = null
      q.vert = null
    },
    push: (ch, a) => {
      q[ch] = a
    },
  }
}

/** a Track that is nothing but flat ballast, for measuring the runner alone */
const bare = (ents = []) => ({
  entities: ents,
  writtenTo: 1e9,
  witness: [],
  tier: 0,
  advance() {},
  drainReleased: () => [],
  drainCommitted: () => [],
  reserve: () => true,
  reset() {},
})

/**
 * Put a sim on the ramp at `d` units, at the speed the ramp says it runs there.
 *
 * WRONG TURN, DO NOT RETAKE: this file used to write `createSim({…, headstart})`
 * and believe it. `createSim` builds its state literal with `z: 0` and
 * `speed: speedAt(0)` and reads `cfg.headstart` nowhere — only `restart()`
 * applies it. So every test that claimed to be measuring "at VMAX" was in fact
 * measuring at twelve units a second, which is the one speed everything is
 * easiest at. `restart()` is the shipping path a retry takes anyway, so this
 * is also closer to what the game does.
 */
const at = (sim, d, multBase = 1, handcars = 0) => {
  sim.restart(1, multBase, handcars, d)
  return sim
}

/** a blank entity, the shape `decode`'s sink hands out of the generator's pool */
const blank = (id) => ({
  id,
  kind: 'fence',
  lane: 0,
  x: 0,
  y0: 0,
  y1: 0,
  z0: 0,
  z1: 0,
  hx: 1.3,
  lethal: false,
  standable: false,
  collect: false,
})

const box = (id, kind, lane, z0, depth, y0, y1, lethal, standable) => ({
  id,
  kind,
  lane,
  x: laneToX(lane),
  y0,
  y1,
  z0,
  z1: z0 + depth,
  hx: 1.3,
  lethal,
  standable,
  collect: false,
})

/* ================================================================== *
 * Movement — the numbers a player has in their hands
 * ================================================================== */

console.log('\nThe runner moves the way §D.4 says')

{
  const src = source()
  const sim = createSim({ seed: 1, input: src, track: bare() })
  src.push('vert', 'jump')
  let apex = 0
  let rising = 0
  let air = 0
  let prevY = 0
  for (let i = 0; i < 30; i++) {
    sim.step(i * 50)
    if (!air) {
      if (sim.state.y > prevY) rising++
      if (sim.state.onGround) air = i + 1
    }
    apex = Math.max(apex, sim.state.y)
    prevY = sim.state.y
  }
  near('jump apex', apex, 2.5725, 0.002, ' u')
  ok('airtime is 14 ticks, 7 up 7 down', air === 14 && rising === 7, `${air} ticks, ${rising} rising`)
  ok('jumpAirTicks agrees', SIM.jumpAirTicks === 14, `${SIM.jumpAirTicks}`)
}

{
  // from a 2.20 roof the feet clear a 3.40 coach; from the ground they do not
  const roof = box(1, 'carriage', 0, -200, 400, 0, 2.2, true, true)
  const src = source()
  const sim = createSim({ seed: 1, input: src, track: bare([roof]) })
  sim.state.y = 2.2
  sim.state.groundY = 2.2
  src.push('vert', 'jump')
  let top = 0
  for (let i = 0; i < 20; i++) {
    sim.step(i * 50)
    top = Math.max(top, sim.state.y)
  }
  near('a jump from a 2.20 roof reaches', top, 4.7725, 0.01, ' u')
  ok('…which is over a 3.40 coach, and 2.5725 is not', top > 3.4 && 2.5725 < 3.4)
}

{
  // no double jump, at any speed on the ramp
  let worst = 0
  for (const head of [0, 1000, 3000, 8000]) {
    const src = source()
    const sim = at(createSim({ seed: 1, input: src, track: bare() }), head)
    src.push('vert', 'jump')
    sim.step(0)
    let top = 0
    for (let i = 1; i < 20; i++) {
      src.push('vert', 'jump')
      sim.step(i * 50)
      top = Math.max(top, sim.state.y)
    }
    worst = Math.max(worst, top)
  }
  ok('no input ever produces a second airborne jump', worst < 2.58, `highest ${worst.toFixed(3)} u`)
}

{
  const coyote = (delay) => {
    const roof = box(1, 'carriage', 0, -100, 130, 0, 2.2, true, true)
    const src = source()
    const sim = createSim({ seed: 1, input: src, track: bare([roof]) })
    sim.state.y = 2.2
    sim.state.groundY = 2.2
    let t = 0
    while (sim.state.onGround && t < 300) sim.step(t++ * 50)
    for (let i = 0; i < delay; i++) sim.step(t++ * 50)
    const before = sim.state.vy
    src.push('vert', 'jump')
    sim.step(t++ * 50)
    return sim.state.vy > before + 1
  }
  ok('coyote: a jump 4 ticks off the edge fires', coyote(3))
  ok('coyote: at 5 ticks it does not', !coyote(4))
}

{
  const src = source()
  const sim = createSim({ seed: 1, input: src, track: bare() })
  let t = 0
  sim.step(t++ * 50)
  src.push('lane', 'right')
  const xs = []
  for (let i = 0; i < 6; i++) {
    sim.step(t++ * 50)
    xs.push(sim.state.x)
  }
  ok('a grounded lane change takes 4 ticks', Math.abs(xs[3] - laneToX(1)) < 1e-9, xs.map((v) => v.toFixed(2)).join(' '))
  ok('the eased curve is symmetric', Math.abs(xs[1] - laneToX(1) / 2) < 1e-6, `x(2) = ${xs[1]}`)
}

{
  // the panic abort: the opposite swipe mid-tween must exist
  const src = source()
  const sim = createSim({ seed: 1, input: src, track: bare() })
  let t = 0
  sim.step(t++ * 50)
  src.push('lane', 'right')
  sim.step(t++ * 50)
  sim.step(t++ * 50)
  src.push('lane', 'left')
  let n = 0
  while (n < 8) {
    sim.step(t++ * 50)
    n++
    if (Math.abs(sim.state.x) < 1e-9 && sim.state.laneTicks === 0) break
  }
  ok('the opposite swipe aborts a lane change', n <= 4 && Math.abs(sim.state.x) < 1e-9, `${n} ticks back to lane 0`)
}

{
  const src = source()
  const sim = createSim({ seed: 1, input: src, track: bare() })
  let t = 0
  sim.step(t++ * 50)
  src.push('vert', 'roll')
  sim.step(t++ * 50)
  const low = []
  let anim = 0
  if (sim.state.low) low.push(0)
  for (let i = 1; i < 14; i++) {
    sim.step(t++ * 50)
    if (sim.state.low) low.push(i)
    if (sim.state.rollTicks > 0) anim = i + 1
  }
  ok('the low box is on at tick 0 and gone at 9', low[0] === 0 && low[low.length - 1] <= 8, `last low tick ${low[low.length - 1]}`)
  ok('the roll animation runs longer than the box', anim >= 10, `${anim} ticks`)
}

{
  // A jump pressed WHILE UNDER a lintel waits for the headroom and then fires
  // on the first tick that has it. The press has to happen with the figure
  // already inside the arch's span: pressed a tick early there IS headroom, the
  // jump is correct to fire, and it flies straight into the arch — which is the
  // player's mistake and not the buffer's.
  const arch = box(1, 'arch', 0, 40, 4, 1.1, 3.2, false, false)
  const src = source()
  const sim = createSim({ seed: 1, input: src, track: bare([arch]) })
  let t = 0
  while (sim.state.z < 39.3) sim.step(t++ * 50)
  src.push('vert', 'roll')
  while (sim.state.z < 40.6) sim.step(t++ * 50)
  src.push('vert', 'jump')
  let held = 0
  let firedAt = 0
  for (let i = 0; i < 20 && !firedAt; i++) {
    sim.step(t++ * 50)
    if (sim.state.vy > 1) firedAt = sim.state.z
    else held++
  }
  // it must clear the arch (nose and all) before it goes, and it must not have
  // touched it on the way — heat is the tell, since an arch is a stumble
  ok(
    'a jump under a lintel is buffered, not eaten',
    firedAt - 0.28 > arch.z1 && held >= 4 && sim.state.heat === 0,
    `held ${held} ticks, fired at ${firedAt.toFixed(2)}, arch ends ${arch.z1}`,
  )
}

{
  /*
   * Nothing of a legal depth is ever tunnelled through, at VMAX.
   *
   * 1.30 u a tick against a 1.6-u minimum depth is only a 1.23× margin, and a
   * sweep that is off by one tick's worth of anything passes straight through
   * a box at one phase of the grid and not at another — which is why this is
   * a thousand separate boxes at a thousand sub-tick offsets rather than one
   * box that happened to line up. The offset is drawn from `rng.range`, so the
   * thousand are the same thousand every time this runs.
   */
  const rng = createRng(99)
  const D0 = 12000 // far enough up the ramp that speedAt is VMAX to six places
  let hits = 0
  const N = 1000
  for (let i = 0; i < N; i++) {
    const b = box(1, 'box', 0, D0 + 40 + rng.range(0, 1.3), 2.4, 0, 3.6, true, false)
    const src = source()
    const sim = at(createSim({ seed: 1, input: src, track: bare([b]) }), D0)
    let t = 0
    let stopped = false
    for (let k = 0; k < 60 && !stopped; k++) {
      sim.step(t++ * 50)
      if (sim.state.phase === 'dying' || sim.state.phase === 'over') stopped = true
    }
    if (stopped && sim.state.z < b.z1 + 1.4) hits++
  }
  ok('a 2.4-deep box at VMAX is never passed through', hits === N, `${hits}/${N} contacts`)
}

{
  // …and the speed it is doing that at, measured off the sim rather than off
  // the constant. 26.0 u/s × 0.05 s is 1.30 u a tick, and every reaction-time
  // sum in §D.8 is that number divided into a sight line.
  const src = source()
  const sim = at(createSim({ seed: 1, input: src, track: bare() }), 40000)
  for (let i = 0; i < 10; i++) sim.step(i * 50)
  const before = sim.state.z
  sim.step(10 * 50)
  const step = sim.state.z - before
  near('top speed, off the sim', sim.state.speed, 26.0, 1e-6, ' u/s')
  near('…which is this far per tick', step, 1.3, 1e-6, ' u')
}

/* ================================================================== *
 * The ramp and the tiers
 * ================================================================== */

console.log('\nSpeed is a pure function of distance')

ok('speedAt(0) is V0', speedAt(0) === 12, `${speedAt(0)}`)
ok('speedAt(200) is still V0', speedAt(200) === 12, `${speedAt(200)}`)
ok('speedAt(∞) is VMAX', Math.abs(speedAt(1e6) - 26) < 1e-6, `${speedAt(1e6)}`)
{
  let mono = true
  let prev = -1
  for (let d = 0; d <= 20000; d++) {
    const v = speedAt(d)
    if (v < prev - 1e-12) mono = false
    prev = v
  }
  ok('…and monotone over 20 km, sampled every unit', mono)
}
ok(
  'the tier bands are §E.3s',
  tierAt(0) === 0 && tierAt(199) === 0 && tierAt(200) === 1 && tierAt(700) === 2 && tierAt(4200) === 7,
  [0, 200, 700, 1400, 4200].map((d) => `${d}→${tierAt(d)}`).join(' '),
)

/* The ramp, written out. §D.3 quotes six points on this curve and every
   fairness sum in §D.8 is one of them divided into the 48-unit sight line —
   so the curve is printed rather than described, and the six are asserted.
   The last column is the one level design reads: how much of the track a
   single jump swallows at that speed, which is what decides whether a roof
   gap is a hop or a leap of faith. */
console.log('\n  d (u)    v (u/s)   u/tick   jump (u)   sight (s)   tier')
for (const d of [0, 200, 700, 1400, 2100, 2800, 3500, 4200, 8000]) {
  const v = speedAt(d)
  console.log(
    `  ${String(d).padStart(5)}    ${v.toFixed(2).padStart(6)}   ${(v * 0.05).toFixed(3).padStart(6)}` +
      `   ${(v * 0.7).toFixed(2).padStart(7)}   ${(48 / v).toFixed(2).padStart(8)}   ${tierAt(d)}`,
  )
}
{
  const want = [
    [700, 16.2],
    [1400, 20.1],
    [2100, 22.4],
    [2800, 23.8],
    [3500, 24.7],
    [4200, 25.2],
  ]
  const off = want.filter(([d, v]) => Math.abs(speedAt(d) - v) > 0.05)
  ok(
    'the ramp hits §D.3s six quoted speeds',
    off.length === 0,
    off.length ? off.map(([d, v]) => `${d}: ${speedAt(d).toFixed(2)} ≠ ${v}`).join(' ') : '±0.05 u/s',
  )
  /* VMAX is not a taste decision: it is the sight line divided by what a
     person needs. If the art ever fogs the track harder, this is the line
     that says the game has to get slower. */
  ok(
    'VMAX is still LEGIBLE ÷ the reaction budget',
    Math.abs(48 / (0.9 + 0.7 + 0.25) - 26) < 0.15,
    `${(48 / 1.85).toFixed(2)} u/s`,
  )
  ok('the fog is thin enough for that sight line', FOG_DENSITY <= 0.013, `${FOG_DENSITY}`)
  // …and the number the checker asserts has to be the number the scene draws
  const scn = readFileSync(join(HERE, '../src/surf/scene.ts'), 'utf8')
  ok(
    'scene.ts takes its fog from track.ts',
    /FOG_DENSITY/.test(scn) && /from\s+['"]\.\/track['"]/.test(scn),
  )
}

/* ================================================================== *
 * The two copies of the movement constants
 * ================================================================== */

console.log('\ntrack.ts and sim.ts agree, field for field')

{
  const drift = []
  for (const [k, v] of Object.entries(SOLVER_CONSTANTS)) {
    if (SIM[k] !== v) drift.push(`${k}: track ${v} vs sim ${SIM[k]}`)
  }
  ok(
    "the solver's local copies equal sim.ts's exports",
    drift.length === 0,
    drift.length ? drift.join('; ') : `${Object.keys(SOLVER_CONSTANTS).length} constants`,
  )
}

{
  // the duplication is deliberate (no import cycle); an import cycle is not
  const src = readFileSync(join(HERE, '../src/surf/track.ts'), 'utf8')
  ok("track.ts does not import sim.ts", !/from\s+['"]\.\/sim['"]/.test(src))
}

{
  // comments are stripped first, and deliberately: every one of these files
  // explains in prose WHY it does not call Math.random, and a grep that cannot
  // tell code from the comment above it is a grep that teaches people to stop
  // writing the comment.
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  const hits = []
  for (const f of readdirSync(join(HERE, '../src/surf'))) {
    if (!/\.ts$/.test(f)) continue
    if (/Math\.random/.test(code(readFileSync(join(HERE, '../src/surf', f), 'utf8')))) hits.push(f)
  }
  for (const f of readdirSync(HERE)) {
    // …and this file is skipped, because it is the one place in the tree that
    // has to say the words out loud in order to look for them
    if (!/^surf-.*\.mjs$/.test(f) || f === 'surf-check.mjs') continue
    if (/Math\.random/.test(code(readFileSync(join(HERE, f), 'utf8')))) hits.push(`tools/${f}`)
  }
  ok('Math.random appears nowhere in src/surf or tools/surf-*', hits.length === 0, hits.join(' '))
}

{
  /*
   * The game's own vocabulary is OURS — everywhere except the board.
   *
   * §A gives this game its own name and a translation table for every borrowed
   * idea: carriage for train, mote of lantern-light for coin, handcar for
   * hoverboard, the yard guard for the inspector. That table still holds and
   * this grep still enforces it, because the reference game is the benchmark
   * for the FEEL and not a thing the runner should be narrating itself in.
   *
   * WHAT CHANGED IS THE SIGN, and only the sign. Elliot asked for the board out
   * in the field to read `Subway Surfers`, which is his call to make and worth
   * being clear-eyed about: that is somebody else's trademark, lettered eight
   * feet high, in a field with his name on it. So the exception is drawn as
   * narrowly as it can be — signal.ts's face texture, and nothing else. The
   * runner's own opening card, its HUD, its prose and its CSS still say
   * trainyard, and this grep is what keeps the borrowed name from spreading
   * off the board it was asked for.
   */
  const strays = []
  const files = [
    ['index.html', readFileSync(join(HERE, '../index.html'), 'utf8')],
    ...readdirSync(join(HERE, '../src/surf'))
      .filter((f) => /\.(ts|css)$/.test(f))
      .map((f) => [`src/surf/${f}`, readFileSync(join(HERE, '../src/surf', f), 'utf8')]),
  ]
  // comments may name it — the whole design argues with it in prose. Drawn,
  // rendered or written into the DOM is another matter.
  const strip = (s) =>
    s
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
  for (const [name, text] of files) {
    if (/subway surfers/i.test(strip(text))) strays.push(name)
  }
  ok('nothing inside the runner is called Subway Surfers', strays.length === 0, strays.join(' '))

  /* …and the board itself carries the one name that was asked for. The face
     texture is a canvas draw, so no screenshot test can read it back; a grep
     can, and this is the grep. */
  const signal = readFileSync(join(HERE, '../src/world/landmarks/signal.ts'), 'utf8')
  const drawn = /fillText\('([^']+)'/.exec(signal)?.[1] ?? ''
  ok('the sign is lettered Subway Surfers', drawn === 'Subway Surfers', drawn)
  ok(
    'the runner still names itself the trainyard',
    /Trainyard Run/.test(readFileSync(join(HERE, '../index.html'), 'utf8')),
  )
}

/* ================================================================== *
 * Powerups, score and the guard
 * ================================================================== */

console.log('\nThe loop')

ok(
  'the five powers have their §D.7 durations',
  SIM.POWER_TICKS.flare === 240 &&
    SIM.POWER_TICKS.tally === 400 &&
    SIM.POWER_TICKS.boots === 400 &&
    SIM.POWER_TICKS.updraft === 120 &&
    SIM.POWER_TICKS.handcar === 600,
  Object.entries(SIM.POWER_TICKS)
    .map(([k, v]) => `${k} ${v}`)
    .join(' '),
)
ok(
  'the multiplier steps at 400 u and caps at 30',
  SIM.MULT_STEP === 400 && SIM.MULT_CAP === 30,
  `${SIM.MULT_STEP} / ${SIM.MULT_CAP}`,
)
ok('two stumbles inside 2.5 s is the guard', SIM.HEAT_DECAY === 2.5, `${SIM.HEAT_DECAY} s`)
ok(
  'the handcar recharges over 100 ticks and covers 12',
  SIM.HANDCAR_RECHARGE === 100 && SIM.HANDCAR_INVULN === 12,
)

{
  // the multiplier is the distance integral's, and a stumble resets it to
  // multBase and not to 1
  const src = source()
  const sim = createSim({ seed: 5, input: src, track: bare(), multBase: 3 })
  for (let i = 0; i < 20 * 60; i++) sim.step(i * 50)
  const want = Math.min(SIM.MULT_CAP, 3 + Math.floor(sim.state.unbroken / SIM.MULT_STEP))
  ok('the multiplier is base + unbroken/400', sim.state.mult === want, `${sim.state.mult} (want ${want})`)
  ok('the score is the distance integral × mult', sim.state.score > 0 && sim.state.score >= sim.state.z, `${Math.round(sim.state.score)} over ${Math.round(sim.state.z)} u`)
}

/* ================================================================== *
 * The generator
 * ================================================================== */

const SEEDS = Number(process.env.SURF_SEEDS ?? 200)
const DIST = 6000

console.log(`\nThe track, over ${SEEDS} seeds × ${DIST} u`)

{
  let sortBad = 0
  let gapBad = 0
  let earlyAny = 0
  let earlyLethal = 0
  let earlyService = 0
  let mutated = 0
  let coachShadow = 0
  let ents = 0
  /* THREE INVARIANTS THAT WERE WRITTEN DOWN AND THEN NEVER CHECKED.
     `MIN_DEPTH`, `GAP_BRIDGE` and `LANES` were exported by track.ts and read by
     nothing at all — not by track.ts itself, not by sim.ts, not by this file,
     which had `1.0` typed out as a literal where GAP_BRIDGE belonged. A
     constant nobody reads is a comment that thinks it is code: it describes a
     property the generator is SUPPOSED to have and cannot fail if the
     generator stops having it. They are asserted below instead of deleted,
     because the properties are real and worth holding. */
  let thin = 0
  let thinWorst = ''
  let unbridged = 0
  const laneSet = new Set()

  for (let s = 0; s < SEEDS; s++) {
    const tr = createTrack({ seed: 1000 + s })
    let z = 0
    let snap = null
    let snapAt = 0
    while (z < DIST) {
      tr.advance(z, speedAt)
      if (snap === null && z > 500) {
        snapAt = z
        snap = new Map()
        // `service` is excluded and must be: it is the one authored thing that
        // moves, and it is announced 1.9 s before it reaches you.
        for (const e of tr.entities) {
          if (e.kind !== 'service' && e.z0 < z + WRITE_AHEAD) snap.set(e.id, JSON.stringify(e))
        }
      } else if (snap !== null && z > snapAt + WRITE_AHEAD - 6) {
        for (const e of tr.entities) {
          const was = snap.get(e.id)
          if (was !== undefined && was !== JSON.stringify(e)) mutated++
        }
        snap = null
      }
      z += 8
    }

    ents += tr.entities.length
    let prev = -Infinity
    for (const e of tr.entities) {
      if (e.z0 < prev - 1e-6) sortBad++
      prev = e.z0
      laneSet.add(e.lane)
      if (e.collect) continue
      if (e.z0 < 60) earlyAny++
      if (e.lethal && e.z0 < 200) earlyLethal++
      if (e.kind === 'service' && e.z0 < 700) earlyService++
      // §D.2: no collidable is thinner than MIN_DEPTH. `bridge` is exempt —
      // it is a floor, never a blocker.
      if (e.kind !== 'bridge' && e.z1 - e.z0 < MIN_DEPTH - 1e-6) {
        thin++
        if (!thinWorst) thinWorst = `${e.kind} ${(e.z1 - e.z0).toFixed(2)} u`
      }
    }

    // roof gaps: 0 tiles, or 6–10 u. Never the forbidden 1–5 band.
    const roofs = tr.entities
      .filter((e) => e.standable && e.kind !== 'bridge' && e.kind !== 'ramp')
      .sort((a, b) => a.lane - b.lane || a.z0 - b.z0)
    const bridges = tr.entities.filter((e) => e.kind === 'bridge')
    for (let i = 1; i < roofs.length; i++) {
      const a = roofs[i - 1]
      const b = roofs[i]
      if (a.lane !== b.lane) continue
      const gap = b.z0 - a.z1
      if (gap > GAP_BRIDGE && gap < GAP_MIN - 1e-6) gapBad++
      // …and the other side of the same rule: a seam at or under GAP_BRIDGE is
      // not a gap you jump, it is a gap that must be PAVED. Unbridged, it is
      // 23 ms of air that still clears `onGround`, breaks the run cycle and
      // eats the coyote window, and the player feels all three without ever
      // seeing what did it.
      else if (gap > 1e-6 && gap <= GAP_BRIDGE + 1e-6) {
        const paved = bridges.some(
          (x) => x.lane === a.lane && x.z0 <= a.z1 + 1e-6 && x.z1 >= b.z0 - 1e-6,
        )
        if (!paved) unbridged++
      }
    }

    // nothing lethal hiding behind a same-lane coach
    const coaches = tr.entities.filter((e) => e.kind === 'coach')
    for (const c of coaches) {
      for (const e of tr.entities) {
        if (!e.lethal || e.collect || e === c) continue
        if (e.lane !== c.lane) continue
        if (e.z0 > c.z1 && e.z0 < c.z1 + 20 && e.y0 < c.y1) coachShadow++
      }
    }
  }

  ok('entities stay sorted by z0', sortBad === 0, `${sortBad} inversions in ${ents}`)
  ok('no roof gap in the forbidden 1–5 band', gapBad === 0, `${gapBad}`)
  ok('every coupling seam is bridged', unbridged === 0, `${unbridged} left open`)
  ok('no collidable is thinner than MIN_DEPTH', thin === 0, thinWorst || `${MIN_DEPTH} u, ${ents} checked`)
  ok(
    'the track uses exactly LANES lanes',
    laneSet.size === LANES && [...laneSet].every((l) => l >= -1 && l <= 1),
    [...laneSet].sort().join(' '),
  )
  ok('the first 60 u are empty', earlyAny === 0, `${earlyAny}`)
  ok('the first 200 u contain nothing lethal', earlyLethal === 0, `${earlyLethal}`)
  ok('no service before 700 u', earlyService === 0, `${earlyService}`)
  ok('nothing inside WRITE_AHEAD is ever changed', mutated === 0, `${mutated}`)
  ok('nothing lethal hides behind a coach', coachShadow === 0, `${coachShadow}`)
}

{
  const walk = (seed) => {
    const tr = createTrack({ seed })
    let z = 0
    while (z < 4000) {
      tr.advance(z, speedAt)
      z += 16
    }
    return tr.entities.map((e) => JSON.stringify(e)).join('\n')
  }
  ok('two tracks on one seed are identical, field for field', walk(12345) === walk(12345))
}

{
  /*
   * Re-prove the committed track, window by window, WHILE walking it.
   *
   * WRONG TURN, DO NOT RETAKE: the first version walked the whole 6000 u and
   * then sliced the finished entity list at fixed 96-u boundaries, starting
   * every solve in lane 0 on the ballast. A boundary lands wherever it lands —
   * two units in front of a fence, or halfway along a carriage you are supposed
   * to be riding — so a third of the slices came back unsolvable, `solve()`
   * returns no warnings when it fails, and the whole fairness assertion
   * quietly ran on five pieces out of several hundred and passed. Start each
   * window from the state the witness says you are ACTUALLY in, and do it
   * inside the walk while the witness for that stretch still exists.
   */
  let short = 0
  let worst = Infinity
  let counted = 0
  let windows = 0
  let unsolved = 0
  for (let s = 0; s < Math.min(SEEDS, 30); s++) {
    const tr = createTrack({ seed: 2000 + s })
    let z = 0
    let nextProof = 120
    while (z < DIST) {
      tr.advance(z, speedAt)
      if (z >= nextProof) {
        nextProof = z + WRITE_AHEAD
        const b = z + WRITE_AHEAD - 8 // stay inside what is committed
        /*
         * …and the window has to OPEN somewhere a standing start is honest.
         * The witness is sampled every 1.6 u, so "the lane and height you are
         * at" is only known to a unit and a half — which is fine in open track
         * and useless a metre in front of a fence, where the sample says `run`
         * and the truth is that the take-off already happened between two
         * samples. So walk forward to the first `run` sample with ten clear
         * units in front of it and start there. Anything else measures the
         * sampling grid rather than the track.
         */
        let s0 = null
        for (const w of tr.witness) {
          if (w.z < z || w.z > z + 48) continue
          if (w.pose !== 'run') continue
          let clear = true
          for (const e of tr.entities) {
            if (e.collect) continue
            if (e.z1 > w.z - 1 && e.z0 < w.z + 10) {
              clear = false
              break
            }
          }
          if (clear) {
            s0 = w
            break
          }
        }
        if (s0) {
          windows++
          const slice = tr.entities.filter((e) => e.z1 > s0.z - 4 && e.z0 < b + 4)
          const res = solve(slice, s0.z, b, speedAt, s0.lane, s0.y)
          if (!res.solvable) unsolved++
          for (const w of res.warnings) {
            counted++
            const need = w.choice ? 0.9 : 0.75
            const got = w.lastAt - w.visibleAt
            if (got < worst) worst = got
            if (got < need - 1e-6) short++
          }
        }
      }
      z += 8
    }
  }
  ok('every committed window solves from the line you are on', unsolved === 0, `${unsolved}/${windows} failed`)
  ok(
    'every lethal piece is legible for 0.75 s / 0.90 s',
    short === 0,
    `${counted} pieces, worst ${worst === Infinity ? 'n/a' : worst.toFixed(2) + ' s'}`,
  )
}

/* ================================================================== *
 * Pacing: the same track, re-proved slower, and the gap between the
 * moments it asks something of you
 * ================================================================== */

{
  /*
   * Two claims, one walk.
   *
   * §E.5: the track must solve at the SLOWEST LEGAL SPEED on the stretch as
   * well as at `speedAt(d)`. A stumble multiplies speed by 0.72 for about a
   * second and a bit, and the failure mode it buys is specific and horrible:
   * a roof gap that a full-speed jump clears by four units is a jump you fall
   * short of, through no decision of your own, two seconds after the mistake
   * you were already punished for.
   *
   * §D.8: `DECISION_GAP_MIN` is 0.35 s — seven ticks — between one decision and
   * the next. NOT "window-close to window-open" as §D.8 words it: a window
   * OPENS when the piece becomes visible at 48 u, nearly two seconds before its
   * own deadline, so every consecutive pair overlaps and the literal reading is
   * satisfied by nothing and violated by everything.
   *
   * WRONG TURN, DO NOT RETAKE, AND IT COST THREE TEMPLATES. The reading before
   * this one was deadline-to-deadline over LETHAL PIECES. The note that used to
   * sit here even said what was wrong with it — "four boxes in a wall are one
   * lane choice and four warnings" — and asserted it anyway. `doubleConsist` is
   * a coach either side and a rake down the middle; the line's answer to all of
   * it is to press nothing at all, and counted as pieces that is four
   * decisions, two of them simultaneous. It failed on every seed at every tier
   * and `coach` was a kind that appeared nowhere in the game.
   *
   * A decision is a PRESS. `solve()` reports the times the surviving line
   * actually inputs something, the beam minimises inputs so that line is the
   * cheapest way through the window, and "no two presses inside a third of a
   * second" is both what a player feels and what the generator can honestly
   * promise. Presses on the same tick are one decision with two hands on it.
   *
   * Deliberately NOT asserted: the same spacing in units against
   * `decisionSpacing(v)`. The seconds form is the one that is true.
   */
  let slowFail = 0
  let slowWindows = 0
  let tight = 0
  let pairs = 0
  let worstGap = Infinity
  let worstAt = 0
  for (let s = 0; s < Math.min(SEEDS, 20); s++) {
    const tr = createTrack({ seed: 2000 + s })
    let z = 0
    let nextProof = 120
    while (z < DIST) {
      tr.advance(z, speedAt)
      if (z >= nextProof) {
        nextProof = z + WRITE_AHEAD
        const b = z + WRITE_AHEAD - 8
        let s0 = null
        for (const w of tr.witness) {
          if (w.z < z || w.z > z + 48 || w.pose !== 'run') continue
          let clear = true
          for (const e of tr.entities) {
            if (e.collect) continue
            if (e.z1 > w.z - 1 && e.z0 < w.z + 10) {
              clear = false
              break
            }
          }
          if (clear) {
            s0 = w
            break
          }
        }
        if (s0) {
          const slice = tr.entities.filter((e) => e.z1 > s0.z - 4 && e.z0 < b + 4)
          slowWindows++
          if (!solve(slice, s0.z, b, (d) => 0.72 * speedAt(d), s0.lane, s0.y).solvable) slowFail++

          const res = solve(slice, s0.z, b, speedAt, s0.lane, s0.y)
          for (let i = 1; i < res.inputs.length; i++) {
            const dt = res.inputs[i] - res.inputs[i - 1]
            // same tick, two hands: left+jump is one decision
            if (dt <= 1e-9) continue
            pairs++
            if (dt < worstGap) {
              worstGap = dt
              worstAt = s0.z + res.inputs[i] * speedAt(s0.z)
            }
            if (dt < DECISION_GAP_MIN - 1e-9) tight++
          }
        }
      }
      z += 8
    }
  }
  ok(
    'the same track still solves at 0.72× — a stumble is survivable',
    slowFail === 0,
    `${slowFail}/${slowWindows} windows`,
  )
  ok(
    `no two decisions closer than ${DECISION_GAP_MIN} s`,
    tight === 0,
    `${pairs} pairs, tightest ${worstGap === Infinity ? 'n/a' : `${worstGap.toFixed(2)} s at ${Math.round(worstAt)} u`}`,
  )
}

/* ================================================================== *
 * The mix — what a player actually meets, per thousand units
 * ================================================================== */

console.log('\nThe mix, per 1000 u of track')

{
  /*
   * A census, not an assertion — mostly. The table is here so a human can see
   * at a glance whether the trainyard is a trainyard or a field of fences,
   * and it is the first place to look when the game reads as monotonous
   * without anything being provably wrong.
   *
   * The one assertion is the sharp one: EVERY KIND THE LIBRARY CAN EMIT HAS TO
   * REACH THE TRACK. The vocabulary is not hand-written here — the twenty-five
   * templates are decoded, in both mirrors, and whatever comes out is what the
   * generator owes us. A kind that decodes but never appears in six thousand
   * units × N seeds is a template that is being silently swapped for a
   * breather somewhere in the write path, and the failure is invisible from
   * inside the game: the track is still fair, still solvable, still passes
   * every other line in this file. It is just missing half the game.
   */
  let nextId = 1
  const vocabulary = new Set()
  for (const p of PATTERNS) {
    for (const mirrored of p.mirror ? [false, true] : [false]) {
      const out = []
      try {
        decode(p, mirrored, 40, { out, take: () => blank(nextId++) })
      } catch (err) {
        ok(`the library decodes: ${p.id}`, false, err.message)
        continue
      }
      for (const e of out) vocabulary.add(e.kind)
    }
  }

  const KINDS = {}
  const POWERS = {}
  let walked = 0
  const seeds = Math.min(SEEDS, 40)
  for (let s = 0; s < seeds; s++) {
    const tr = createTrack({ seed: 7000 + s })
    let z = 0
    while (z < DIST) {
      tr.advance(z, speedAt)
      // drainCommitted is the honest census: `entities` is a live window that
      // despawns behind you, and ids are recycled through the pool, so
      // counting either of those under-reports by whatever the walk step is.
      for (const e of tr.drainCommitted()) {
        KINDS[e.kind] = (KINDS[e.kind] ?? 0) + 1
        if (e.kind === 'pickup') POWERS[e.power ?? '?'] = (POWERS[e.power ?? '?'] ?? 0) + 1
      }
      z += 8
    }
    walked += DIST
  }

  const rate = (n) => ((n / walked) * 1000).toFixed(2).padStart(8)
  const every = (n) => (n ? `one per ${(walked / n).toFixed(0)} u` : '—')
  const all = [...new Set([...vocabulary, ...Object.keys(KINDS)])].sort()
  for (const k of all) {
    const n = KINDS[k] ?? 0
    console.log(
      `  ${k.padEnd(9)} ${String(n).padStart(7)}  ${rate(n)} /1000u  ${every(n).padEnd(18)}` +
        `${vocabulary.has(k) ? '' : '(not from a template)'}`,
    )
  }
  console.log(
    `  powers: ${Object.entries(POWERS)
      .sort()
      .map(([k, v]) => `${k} ${v}`)
      .join('  ')}`,
  )

  const missing = [...vocabulary].filter((k) => !KINDS[k])
  ok('every kind the library can emit reaches the track', missing.length === 0, missing.join(' '))

  /* The collectables, against §D.7's authored rates. These are the numbers a
     player feels as generosity, and they are the ones that drift first when
     anything in the write path changes. Wide tolerances on purpose: this is a
     seeded sample, not an integral. */
  const per100 = ((KINDS.mote ?? 0) / walked) * 100
  ok(
    'mote density sits inside the authored band',
    per100 >= MOTE_DENSITY[7] - 3 && per100 <= MOTE_DENSITY[0] + 3,
    `${per100.toFixed(1)} per 100 u (authored ${MOTE_DENSITY[0]} → ${MOTE_DENSITY[7]})`,
  )
  const pickupEvery = walked / (KINDS.pickup ?? 0)
  ok('a powerup about every 570 u', pickupEvery > 400 && pickupEvery < 800, `${pickupEvery.toFixed(0)} u`)
  const crateEvery = walked / (KINDS.crate ?? 0)
  ok('a sealed crate about every 700 u', crateEvery > 550 && crateEvery < 950, `${crateEvery.toFixed(0)} u`)
  ok(
    'all five powers are drawn',
    Object.keys(POWERS).length === 5,
    Object.keys(POWERS).sort().join(' '),
  )
}

/* ================================================================== *
 * The two bots
 * ================================================================== */

console.log('\nThe two bots')

/**
 * Follow the solver's own witness line through the real simulation.
 *
 * The witness is sampled every MOTE_STEP, so a pose CHANGE in it is up to 1.6 u
 * late; the bot leads it by two-and-a-half ticks for a jump and three units for
 * a roll.
 *
 * TWO WRONG TURNS, DO NOT RETAKE EITHER. First: a jump fired on any air sample
 * rather than on the FIRST of a contiguous run reads the tail of an arc as a
 * second take-off, and the bot jumps into the arch it was supposed to roll
 * under — which looks exactly like a generator bug and is not one. Second: the
 * same first-of-a-run rule applied to ROLLS is wrong for the opposite reason.
 * `archBraid` puts two arches nineteen units apart and the solver rolls
 * through both, so the witness carries one unbroken run of `roll` samples
 * across a stretch far longer than the nine ticks a low box lasts. Rolls
 * re-fire whenever the line still says roll and the box has expired; jumps
 * never do. Leading the roll by more than three units is also wrong: the box
 * then runs out before the arch arrives.
 */
function witnessBot(seed, dist) {
  const tr = createTrack({ seed })
  const src = source()
  const sim = createSim({ seed, input: src, track: tr })
  const st = sim.state
  let t = 0
  let firedAir = -1e9
  let firedRoll = -1e9
  while (st.z < dist && st.phase !== 'dying' && st.phase !== 'over' && t < 20 * 900) {
    const w = tr.witness
    const v = st.speed
    let want = st.lane
    for (let i = 0; i < w.length; i++) {
      // FOURTH WRONG TURN. This used to look a quarter-second ahead — a lead
      // of six units at full pelt — and it walks the bot into scenery the line
      // was still avoiding: it starts sliding right while the box in the right
      // lane is still alongside. The witness does not record the lane a state
      // is HEADED for, it records `round(tween)`, so the sample where the lane
      // number flips is the MIDDLE of the change, not the start of it. Lead it
      // by exactly half a lane change — SOLVE_LANE_TICKS/2 = 2 ticks — and the
      // input lands where the solver's did. Two units is the floor, for the
      // opening where the tick is only 0.6 u long.
      if (w[i].z >= st.z + Math.max(2, v * 0.1)) {
        want = w[i].lane
        break
      }
    }
    if (want !== st.lane) src.push('lane', want < st.lane ? 'left' : 'right')
    for (let i = 0; i < w.length; i++) {
      const s = w[i]
      // THIRD WRONG TURN, found the day roofs started existing. This used to
      // read `s.z < st.z` — samples already behind the runner were dropped.
      // The witness is only sampled every MOTE_STEP, so on a tight line the
      // one sample that says "take off here" can sit a unit BEHIND the runner
      // by the time the tick comes round, and the jump is never fired. Off a
      // roof edge into `gapJump` that is a face full of carriage, and it reads
      // as a generator bug. Look back one sample.
      if (s.z < st.z - MOTE_STEP) continue
      if (s.z > st.z + (s.pose === 'roll' ? 3.0 : v * 0.05 * 2.5)) break
      if (s.pose === 'roll') {
        if (st.onGround && !st.low) {
          src.push('vert', 'roll')
          firedRoll = s.z
        }
        break
      }
      if (i > 0 && w[i - 1].pose === s.pose) continue
      if (s.pose === 'air' && st.onGround && s.z > firedAir + 4) {
        src.push('vert', 'jump')
        firedAir = s.z
      }
    }
    sim.step(t++ * 50)
  }
  return { z: st.z, dead: st.phase === 'dying' || st.phase === 'over', cause: st.cause }
}

{
  let survived = 0
  let sum = 0
  const causes = {}
  for (let s = 0; s < SEEDS; s++) {
    const r = witnessBot(3000 + s, DIST)
    sum += r.z
    if (!r.dead) survived++
    else causes[r.cause ?? '?'] = (causes[r.cause ?? '?'] ?? 0) + 1
  }
  ok(
    `the witness bot survives ${DIST} u on every seed`,
    survived === SEEDS,
    `${survived}/${SEEDS}, mean ${Math.round(sum / SEEDS)} u` +
      (Object.keys(causes).length ? `, deaths ${JSON.stringify(causes)}` : ''),
  )
}

{
  let quick = 0
  let sum = 0
  for (let s = 0; s < SEEDS; s++) {
    const tr = createTrack({ seed: 500 + s })
    const src = source()
    const sim = createSim({ seed: 500 + s, input: src, track: tr })
    let t = 0
    while (t < 20 * 60 && sim.state.phase !== 'over' && sim.state.phase !== 'dying') sim.step(t++ * 50)
    if (t < 25 * 20) quick++
    sum += t / 20
  }
  ok(
    'the do-nothing bot dies inside 25 s on 95 % of seeds',
    quick >= Math.ceil(SEEDS * 0.95),
    `${quick}/${SEEDS}, mean ${(sum / SEEDS).toFixed(1)} s`,
  )
}

const failed = results.filter((x) => !x).length
console.log(`\n${results.length - failed} passed, ${failed} failed\n`)
process.exitCode = failed ? 1 : 0

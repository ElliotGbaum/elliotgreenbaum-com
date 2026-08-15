/**
 * Does the parkour move like Minecraft?
 *
 * This runs the *actual* physics module — not a copy of its numbers — and
 * prints the handful of measurements every parkour player already knows by
 * feel. If a line here drifts, the courses in src/parkour/levels.ts are
 * silently no longer the difficulty they claim to be, because their gaps are
 * chosen against exactly these distances.
 *
 * The reference values, from the real game:
 *
 *   jump height           1.2522 blocks
 *   walk speed            4.317 blocks/second
 *   sprint speed          5.612 blocks/second
 *   sprint jump           ~3.7 blocks travelled, which is the "four block
 *                         jump" — four blocks centre to centre, three of air
 *
 * The last table is the one level design actually reads: how many blocks of
 * air a sprint jump clears at each height change.
 *
 *   node tools/parkour-check.mjs
 */

import { registerHooks } from 'node:module'

/* The source imports `./physics`, the way a bundler wants it; Node wants the
   extension. One resolve hook, and this tool runs the shipping files rather
   than a copy of them — which is the entire point of it. */
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

const { createBody, createCollider, tickBody, TICK, WIDTH } = await import(
  '../src/parkour/physics.ts'
)
const { buildCourse, touching } = await import('../src/parkour/course.ts')
const { LEVELS } = await import('../src/parkour/levels.ts')

const solid = (world, x0, y0, z0, x1, y1, z1, slip = 0.6) =>
  world.add({ x0, y0, z0, x1, y1, z1, slip, bounce: 0 })

const flat = (slip = 0.6) => {
  const w = createCollider()
  solid(w, -60, -1, -60, 60, 0, 60, slip)
  return w
}

const results = []
const check = (name, got, want, tol, unit = '') => {
  const pass = Math.abs(got - want) <= tol
  results.push(pass)
  console.log(
    `  ${pass ? '✓' : '✗'} ${name.padEnd(24)} ${got.toFixed(4)}${unit}` +
      `  (want ${want}${unit} ±${tol})`,
  )
}

/** run a body on flat ground and hand back the per-tick displacement it settles at */
function topSpeed(sprint, slip = 0.6) {
  const world = flat(slip)
  const body = createBody(0, 0, -50, 0)
  const input = { forward: 1, strafe: 0, jump: false, sprint, sneak: false }
  let step = 0
  // 90 ticks converges to seven decimal places and stays on the floor
  for (let t = 0; t < 90; t++) {
    const last = body.z
    tickBody(body, input, world)
    step = body.z - last
  }
  return step / TICK
}

console.log('\nMinecraft parity')

/* ---- jump height ---- */
{
  const world = flat()
  const body = createBody(0, 0, 0, 0)
  const input = { forward: 0, strafe: 0, jump: false, sprint: false, sneak: false }
  // two settling ticks: the first tick has no downward speed to collide with
  tickBody(body, input, world)
  tickBody(body, input, world)
  input.jump = true
  let peak = 0
  for (let t = 0; t < 40; t++) {
    tickBody(body, input, world)
    input.jump = false
    peak = Math.max(peak, body.y)
  }
  check('jump height', peak, 1.2522, 0.002, ' blocks')
}

check('walk speed', topSpeed(false), 4.317, 0.02, ' b/s')
check('sprint speed', topSpeed(true), 5.612, 0.02, ' b/s')

/* ---- ice ----
   Reported honestly: ice's own terminal speed is 4.157 b/s, so it can never
   reach the 4.317 that dirt does. This used to claim "walking speed" and
   measure 4.0, which was a false label on an unasserted line. */
{
  const world = flat(0.98)
  const body = createBody(0, 0, -50, 0)
  const input = { forward: 1, strafe: 0, jump: false, sprint: false, sneak: false }
  let ticks = 0
  for (let t = 0; t < 400; t++) {
    const before = body.z
    tickBody(body, input, world)
    if ((body.z - before) / TICK > 4.0 && !ticks) ticks = t
  }
  console.log(`  · ice takes ${ticks} ticks to reach 4 b/s; dirt takes 6`)
}

/* ------------------------------------------------------------------ *
 * The table level design is built on: with a running sprint start, how
 * many blocks of AIR can you clear, landing at a given height change?
 *
 * Simulated the way the game is actually played — stand on a platform,
 * sprint at the gap, jump from the last tick before the edge.
 * ------------------------------------------------------------------ */
function clears(gap, dy, sprint = true) {
  // platform A: z ∈ [0, 8]. platform B starts at z = 8 + gap.
  const world = createCollider()
  solid(world, -4, -1, -8, 4, 0, 8)
  solid(world, -4, dy - 1, 8 + gap, 4, dy, 8 + gap + 12)

  const body = createBody(0, 0, -6, 0)
  const input = { forward: 1, strafe: 0, jump: false, sprint, sneak: false }
  /** the furthest the centre can be and still have the box over the platform */
  const edge = 8 + WIDTH / 2
  let last = body.z

  for (let t = 0; t < 400; t++) {
    // jump on the last tick that still leaves us standing — which is what a
    // parkour player is doing when they talk about "hitting the edge"
    const step = body.z - last
    last = body.z
    input.jump = body.onGround && body.z + step >= edge - 0.02
    tickBody(body, input, world)
    if (body.y < dy - 4) return false // fell in
    if (body.onGround && body.z > 8 + gap) return true
  }
  return false
}

/** the largest gap of air, in blocks, that is clearable at this height change */
const maxGap = (dy, sprint = true) => {
  let best = 0
  for (let gap = 1; gap <= 7; gap++) if (clears(gap, dy, sprint)) best = gap
  return best
}

/* The names every parkour map uses, counted the way maps count them: a
   "4-block jump" is four blocks centre to centre, so three of air. These are
   the facts that decide whether a course is fair, and they are checked rather
   than trusted. */
console.log('\nThe jumps, by their parkour names')
check('standing jump = 2-block', standingGap(), 1, 0, ' air')
check('running jump = 3-block', maxGap(0, false), 2, 0, ' air')
check('sprint jump = 4-block', maxGap(0, true), 3, 0, ' air')
check('5-block is impossible', maxGap(0, true) < 4 ? 1 : 0, 1, 0, '')

/* ------------------------------------------------------------------ *
 * The mechanics the parity suite used to take on trust.
 *
 * Every one of these was pointed out as untested by a reviewer who was
 * right: the suite asserted thirteen things and none of them covered the
 * blocks and moves that actually make a course play differently.
 * ------------------------------------------------------------------ */
console.log('\nThe rest of the moveset')

/** drop onto a block from `from` blocks up and report how high it throws you */
function bounceHeight(from, sneaking = false) {
  const world = createCollider()
  world.add({ x0: -4, y0: -1, z0: -4, x1: 4, y1: 0, z1: 4, slip: 0.8, bounce: 1.0 })
  const body = createBody(0, from, 0, 0)
  const input = { forward: 0, strafe: 0, jump: false, sprint: false, sneak: sneaking }
  let landed = false
  let peak = 0
  for (let t = 0; t < 200; t++) {
    tickBody(body, input, world)
    if (body.vy > 0) landed = true
    if (landed) peak = Math.max(peak, body.y)
  }
  return peak
}
/* Vanilla reverses a LivingEntity's velocity in FULL (d0 = 1.0; 0.8 is the
   value for everything that is not a creature). You still do not come back to
   the height you fell from, because the 0.98 vertical drag is charged on the
   way down and again on the way up — six blocks returns about four. What full
   restitution buys is that it stays a trampoline over many bounces instead of
   dying in two. */
check('slime returns the drop', bounceHeight(6), 4.05, 0.4, ' blocks')
check('sneaking kills the bounce', bounceHeight(6, true), 0, 0.2, ' blocks')

/** can we walk up a half block without jumping? */
{
  const world = createCollider()
  world.add({ x0: -4, y0: -1, z0: -8, x1: 4, y1: 0, z1: 2, slip: 0.6, bounce: 0 })
  world.add({ x0: -4, y0: -1, z0: 2, x1: 4, y1: 0.5, z1: 60, slip: 0.6, bounce: 0 })
  const body = createBody(0, 0, -6, 0)
  const input = { forward: 1, strafe: 0, jump: false, sprint: false, sneak: false }
  let stepped = 0
  for (let t = 0; t < 120; t++) {
    tickBody(body, input, world)
    if (body.z > 3) {
      stepped = body.y
      break
    }
  }
  check('a slab is a step, not a wall', stepped, 0.5, 0.01, ' blocks')
}

/** a ceiling clips the jump — the head-hitter */
{
  const world = createCollider()
  world.add({ x0: -4, y0: -1, z0: -8, x1: 4, y1: 0, z1: 12, slip: 0.6, bounce: 0 })
  world.add({ x0: -4, y0: 2, z0: -8, x1: 4, y1: 3, z1: 12, slip: 0.6, bounce: 0 })
  const body = createBody(0, 0, 0, 0)
  const input = { forward: 0, strafe: 0, jump: false, sprint: false, sneak: false }
  tickBody(body, input, world)
  tickBody(body, input, world)
  input.jump = true
  let peak = 0
  for (let t = 0; t < 30; t++) {
    tickBody(body, input, world)
    input.jump = false
    peak = Math.max(peak, body.y)
  }
  check('a 2-block ceiling clips a jump', peak, 0.2, 0.02, ' blocks')
}

/** sneaking will not walk you off a ledge */
{
  const world = createCollider()
  world.add({ x0: -4, y0: -1, z0: -8, x1: 4, y1: 0, z1: 2, slip: 0.6, bounce: 0 })
  const body = createBody(0, 0, -4, 0)
  const input = { forward: 1, strafe: 0, jump: false, sprint: false, sneak: true }
  for (let t = 0; t < 200; t++) tickBody(body, input, world)
  check('sneak stops at the edge', body.y, 0, 0.05, ' blocks')
  const fall = createBody(0, 0, -4, 0)
  for (let t = 0; t < 200; t++) {
    tickBody(fall, { ...input, sneak: false }, world)
  }
  check('…and without it you walk off', fall.y < -4 ? 1 : 0, 1, 0, '')
}

/** ice really is slippery, and its top speed is its own */
{
  const world = flat(0.98)
  const body = createBody(0, 0, -50, 0)
  const input = { forward: 1, strafe: 0, jump: false, sprint: false, sneak: false }
  let step = 0
  for (let t = 0; t < 200; t++) {
    const last = body.z
    tickBody(body, input, world)
    step = body.z - last
  }
  check('ice walk speed', step / TICK, 4.157, 0.03, ' b/s')
}

/** a sprint survives a step-up but not a wall */
{
  const world = createCollider()
  world.add({ x0: -4, y0: -1, z0: -20, x1: 4, y1: 0, z1: 2, slip: 0.6, bounce: 0 })
  world.add({ x0: -4, y0: -1, z0: 2, x1: 4, y1: 0.5, z1: 20, slip: 0.6, bounce: 0 })
  const body = createBody(0, 0, -14, 0)
  const input = { forward: 1, strafe: 0, jump: false, sprint: true, sneak: false }
  for (let t = 0; t < 90; t++) tickBody(body, input, world)
  check('a step-up keeps your sprint', body.sprinting ? 1 : 0, 1, 0, '')
}

/** a diagonal is not slower than a straight line */
{
  const straight = (() => {
    const world = flat()
    const body = createBody(0, 0, -50, 0)
    const input = { forward: 1, strafe: 0, jump: false, sprint: false, sneak: false }
    let step = 0
    for (let t = 0; t < 90; t++) {
      const last = { x: body.x, z: body.z }
      tickBody(body, input, world)
      step = Math.hypot(body.x - last.x, body.z - last.z)
    }
    return step / TICK
  })()
  const diagonal = (() => {
    const world = flat()
    const body = createBody(0, 0, -50, 0)
    const input = { forward: 1, strafe: 1, jump: false, sprint: false, sneak: false }
    let step = 0
    for (let t = 0; t < 90; t++) {
      const last = { x: body.x, z: body.z }
      tickBody(body, input, world)
      step = Math.hypot(body.x - last.x, body.z - last.z)
    }
    return step / TICK
  })()
  /* Vanilla scales the stick by 0.98 BEFORE testing length. A straight line
     is (0.98, 0) — magnitude 0.98, under the threshold, used as-is. A full
     diagonal is (0.98, 0.98) — length² 1.92, so it normalises to magnitude
     1.0. The diagonal is therefore 1/0.98 = 2% FASTER than running straight,
     which is the 45°-strafing edge every speedrunner uses and is a real
     property of the game rather than a rounding error. */
  check('a diagonal is 2% faster', diagonal / straight, 1.0204, 0.004, '×')
}

function standingGap() {
  // no run-up at all: spawn, settle, jump on the spot while holding forward
  let best = 0
  for (let gap = 1; gap <= 5; gap++) {
    const world = createCollider()
    solid(world, -4, -1, -8, 4, 0, 8)
    solid(world, -4, -1, 8 + gap, 4, 0, 8 + gap + 12)
    const body = createBody(0, 0, 8.2, 0)
    const input = { forward: 1, strafe: 0, jump: false, sprint: false, sneak: false }
    tickBody(body, { ...input, forward: 0 }, world)
    tickBody(body, { ...input, forward: 0 }, world)
    input.jump = true
    let made = false
    for (let t = 0; t < 60; t++) {
      tickBody(body, input, world)
      input.jump = false
      if (body.y < -4) break
      if (body.onGround && body.z > 8 + gap) {
        made = true
        break
      }
    }
    if (made) best = gap
  }
  return best
}

console.log('\nBlocks of air a sprint jump clears, by height change:')
for (const dy of [2, 1, 0, -1, -2, -4]) {
  const best = maxGap(dy)
  console.log(
    `  ${dy >= 0 ? '+' : ''}${dy}: ${best ? `${best} air  (a ${best + 1}-block jump)` : 'not reachable'}`,
  )
}

/* ------------------------------------------------------------------ *
 * Chains of single blocks — the backbone of every parkour map, and the
 * one piece of level design that is not obvious from the jump table.
 *
 * One block of air looks like the easy spacing and is the hard one: a
 * bunny-hop carries about 2.4 blocks, so at a walk you drift a little
 * further out of every landing until you are in the gap. Two of air
 * regulates itself, because a running jump lands square in the middle of
 * the next block. Sprinting a one-air chain works only by skipping every
 * other block, which is a technique rather than a route.
 * ------------------------------------------------------------------ */
function chain(spacing, sprint) {
  const world = createCollider()
  solid(world, -2, -1, -8, 2, 0, 1)
  for (let n = 1; n <= 10; n++) solid(world, -0.5, -1, n * spacing, 0.5, 0, n * spacing + 1)
  const body = createBody(0, 0, -6, 0)
  const input = { forward: 1, strafe: 0, jump: false, sprint, sneak: false }
  const supported = (x, y, z) => {
    const out = []
    world.query(x - 0.3, y - 0.55, z - 0.3, x + 0.3, y - 0.02, z + 0.3, out)
    return out.some((s) => s.y1 > y - 0.6 && s.y1 <= y + 0.02 && s.x1 > x - 0.3 && s.x0 < x + 0.3)
  }
  /* Count blocks actually LANDED ON, not distance travelled. The first
     version divided z by the spacing, which scores ten for flying over all
     ten of them and is why its own output disagreed with itself. */
  const landed = new Set()
  for (let t = 0; t < 600; t++) {
    const speed = Math.hypot(body.vx, body.vz)
    input.jump = body.onGround && !supported(body.x, body.y, body.z + Math.max(speed * 1.85, 0.32))
    tickBody(body, input, world)
    if (body.y < -3) break
    if (body.onGround && body.z > spacing - 0.5) {
      const n = Math.round(body.z / spacing)
      if (n >= 1 && n <= 10 && Math.abs(body.z - n * spacing - 0.5) < 0.9) landed.add(n)
    }
  }
  return landed.size
}

console.log('\nChains of single blocks (of 10 landed):')
for (const s of [2, 3, 4]) {
  console.log(
    `  ${s - 1} air:  walking ${chain(s, false)}/10   sprinting ${chain(s, true)}/10`,
  )
}
check('a chain wants two of air', chain(3, false), 10, 0, '/10')

/* ------------------------------------------------------------------ *
 * Can the courses actually be finished?
 *
 * A simulated player runs each level: aim at the next platform centre, hold
 * forward, hold sprint, and jump on the last tick before there would be
 * nothing under your feet — which is what a good parkour player is doing when
 * they talk about hitting the edge. If this cannot finish a course, no human
 * is going to either, and the fix is in levels.ts.
 * ------------------------------------------------------------------ */

function play(level, opts = {}) {
  const { sprint = true, log = false, nudge = null } = opts
  const world = buildCourse(level)
  const body = createBody(level.spawn.x, level.spawn.y, level.spawn.z, level.spawn.yaw)
  const input = { forward: 1, strafe: 0, jump: false, sprint, sneak: false }
  const path = level.path

  /* Is there something at head height just in front of us? If so, crouch.
     Deliberately a *generic* test rather than a flag on the level: a course
     that needs sneak has to announce it with geometry a player can see, and
     if a bot cannot work it out from the geometry alone then neither can
     somebody arriving at it for the first time. */
  const lowAhead = (x, y, z, dx, dz) => {
    const out = []
    const x0 = Math.min(x, x + dx * 1.4) - 0.35
    const x1 = Math.max(x, x + dx * 1.4) + 0.35
    const z0 = Math.min(z, z + dz * 1.4) - 0.35
    const z1 = Math.max(z, z + dz * 1.4) + 0.35
    world.collider.query(x0, y + 1.45, z0, x1, y + 1.85, z1, out)
    return out.some((sd) => sd.y0 < y + 1.8 && sd.y1 > y + 1.45)
  }
  let i = 1
  let best = 1
  let falls = 0
  const jumpAt = opts.jumpAt ?? {}
  let respawn = { ...level.spawn }
  const reached = new Set()

  const supported = (x, y, z) => {
    const out = []
    world.collider.query(x - 0.3, y - 0.55, z - 0.3, x + 0.3, y - 0.02, z + 0.3, out)
    return out.some(
      (s) => s.y1 > y - 0.6 && s.y1 <= y + 0.02 && s.x1 > x - 0.3 && s.x0 < x + 0.3 && s.z1 > z - 0.3 && s.z0 < z + 0.3,
    )
  }

  for (var t = 0; t < 20 * 240; t++) {
    world.setTime(t * TICK)
    const target = path[Math.min(i, path.length - 1)]
    const dx = target.x - body.x
    const dz = target.z - body.z
    body.yaw = Math.atan2(dx, dz)

    const dist = Math.hypot(dx, dz)
    // Two things a human does without being told, and the bot has to be:
    // wait at the edge until the moving platform is actually there, and then
    // stand still while it carries you.
    let waiting = false
    if (target.board !== undefined) {
      const m = world.movers[target.board]
      waiting = Math.abs(m.ox) > 0.5 || Math.abs(m.oy) > 0.5 || Math.abs(m.oz) > 0.5
    }
    input.forward = target.ride || waiting ? 0 : 1
    input.sneak = false

    // Turning: a player coming out of a jump at speed does not immediately
    // sprint off in the new direction, they let the corner settle first. The
    // bot does the same, or it skids off the side of every landing pad.
    const speed = Math.hypot(body.vx, body.vz)
    const aligned =
      speed < 0.02 || (body.vx * dx + body.vz * dz) / (speed * Math.max(dist, 1e-6)) > 0.55

    // …and you only sprint when the gap ahead needs it. A sprint jump carries
    // 3.7 blocks whether you wanted it to or not, so sprinting at a single
    // block three away flies straight over the top of it and into the hole
    // beyond. Modulating speed is a real parkour skill and the bot needs it
    // too: look ahead to the next actual gap and decide from that.
    let ahead = 0
    for (let k = i; k < Math.min(path.length, i + 3); k++) {
      if (path[k].gap > 0) {
        ahead = path[k].gap
        break
      }
    }
    const wantSprint = sprint && aligned && ahead >= 3
    input.sprint = wantSprint
    // a sprint only ends when you stop pressing forward (see physics.ts), so
    // taking the speed off means letting go of W for a tick — which is
    // exactly what a player does before a short hop
    if (!wantSprint && body.sprinting && body.onGround) input.forward = 0

    // Jump when there would be nothing under us shortly. "Shortly" has to be a
    // distance and not just a multiple of the current speed: coming out of a
    // corner you are barely moving, so a speed-scaled look-ahead sees nothing
    // and you walk calmly off the edge.
    const dirX = speed > 1e-3 ? body.vx / speed : dx / Math.max(dist, 1e-6)
    const dirZ = speed > 1e-3 ? body.vz / speed : dz / Math.max(dist, 1e-6)
    // 1.85× because `body.v` is the post-drag value and the next tick's
    // displacement is a little under twice it; the floor keeps a barely-moving
    // player from strolling off a ledge without ever deciding to jump
    const look = Math.max(speed * 1.85, 0.32)
    // duck under anything low enough to stop us
    if (lowAhead(body.x, body.y, body.z, dx / Math.max(dist, 1e-6), dz / Math.max(dist, 1e-6))) {
      input.sneak = true
    }

    let wantJump =
      body.onGround &&
      aligned &&
      input.forward > 0 &&
      !supported(body.x + dirX * look, body.y, body.z + dirZ * look)

    /* Record when the bot chooses to leave the ground on each leg — that is
       the reference the window is measured either side of. */
    if (wantJump && jumpAt[i] === undefined) jumpAt[i] = t

    /* …and, when measuring the curve, take one jump at a different tick
       entirely. `at` is an absolute tick, so this is a true offset from the
       reference above rather than a fudge of the look-ahead. */
    if (nudge && nudge.leg === i) {
      wantJump = body.onGround && aligned && input.forward > 0 && t === nudge.at
    }
    input.jump = wantJump

    tickBody(body, input, world.collider)

    if (body.y < level.voidY) {
      falls++
      if (falls > 40) return stuck()
      body.x = respawn.x
      body.y = respawn.y
      body.z = respawn.z
      body.vx = body.vy = body.vz = 0
      // …and pick up the line again from wherever the checkpoint put us,
      // or the bot stands at the checkpoint aiming at a waypoint it has
      // already been told to reach by standing still
      let near = 0
      let nearD = Infinity
      for (let k = 0; k < path.length; k++) {
        const d = Math.hypot(path[k].x - body.x, path[k].z - body.z) + Math.abs(path[k].y - body.y)
        if (d < nearD) {
          nearD = d
          near = k
        }
      }
      i = near + 1
      continue
    }

    // getting *onto* a moving platform means standing on it properly, not
    // clipping the corner of it — everywhere else, close enough is close enough
    const arrive = target.board !== undefined ? 0.4 : 1.1
    // …and a ride is over when the platform has actually finished going up.
    // The generous vertical tolerance everywhere else exists because you clip
    // waypoints mid-jump; here it would have you leaping off a lift that is
    // still a block and a half short of the top.
    const arriveY = target.ride ? 0.35 : 1.6
    if (dist < arrive && Math.abs(body.y - target.y) < arriveY) {
      reached.add(i)
      i++
      best = Math.max(best, i)
      if (log) console.log(`      reached ${i}/${path.length}`)
    }
    for (const cp of level.checkpoints) {
      if (touching(body.x, body.y, body.z, cp)) respawn = { x: cp.x, y: cp.y, z: cp.z }
    }
    if (touching(body.x, body.y, body.z, level.goal)) {
      return { done: true, ticks: t, falls, seconds: t * TICK, jumpAt }
    }
  }
  return stuck()

  function stuck() {
    return {
      done: false,
      at: best,
      falls,
      of: path.length,
      jumpAt,
      want: path[Math.min(best, path.length - 1)],
      got: { x: +body.x.toFixed(1), y: +body.y.toFixed(1), z: +body.z.toFixed(1) },
    }
  }
}

/* ------------------------------------------------------------------ *
 * The difficulty curve, measured rather than asserted.
 *
 * A gap count is not a difficulty: what a player feels is the *window*, the
 * number of ticks in which pressing jump still makes the jump. This forces
 * the bot to leave early and late on each jump and reports the mean. A level
 * whose window is smaller than the level after it is a level in the wrong
 * place, and the finale should have the smallest window of all.
 * ------------------------------------------------------------------ */
function windowOf(level) {
  const base = play(level)
  if (!base.done) return null
  let early = 0
  let late = 0
  let n = 0
  for (let leg = 1; leg < level.path.length; leg++) {
    if (!level.path[leg].gap) continue
    const ref = base.jumpAt[leg]
    if (ref === undefined) continue
    n++
    let e = 0
    while (e < 8 && play(level, { nudge: { leg, at: ref - (e + 1) } }).done) e++
    let l = 0
    while (l < 8 && play(level, { nudge: { leg, at: ref + (l + 1) } }).done) l++
    early += e
    late += l
  }
  return n ? { early: early / n, late: late / n, total: (early + late) / n + 1 } : null
}

{
  console.log('\nThe difficulty curve (input window per jump, in ticks)')
  const rows = LEVELS.map((l) => ({ name: l.name, w: windowOf(l) }))
  for (const r of rows) {
    console.log(
      `  ${r.name.padEnd(14)} ${r.w ? `${r.w.total.toFixed(2)} ticks  (early ${r.w.early.toFixed(2)}, late ${r.w.late.toFixed(2)})` : 'unfinishable'}`,
    )
  }
  /* The mean window is the honest measure of how a level feels: a course of
     four brutal jumps and twelve free ones plays easy, however long its
     longest jump is. The finale should therefore have the smallest mean, and
     the curve should run downhill from level one. */
  const windows = rows.map((r) => r.w?.total ?? Infinity)
  const hardest = windows.indexOf(Math.min(...windows))
  check('the finale is the tightest', hardest === LEVELS.length - 1 ? 1 : 0, 1, 0, '')
  const easiest = windows.indexOf(Math.max(...windows))
  check('the first level is the widest', easiest === 0 ? 1 : 0, 1, 0, '')
  /* Every level must be meaningfully tighter than the one before it.
     "Boxed by the ends" was the assertion here for a while and it is a
     tautology any plateau satisfies — it passed three middle levels sitting
     within 24ms of each other, which is three courses a player cannot tell
     apart. A real curve needs a step, so: monotone, and at least this much
     of one. */
  const STEP = 0.4
  let smallest = Infinity
  for (let i = 1; i < windows.length; i++) smallest = Math.min(smallest, windows[i - 1] - windows[i])
  check('each level is tighter than the last', smallest, STEP + 0.35, 0.35, ' ticks')
}

console.log('\nEvery course can be finished')
for (const level of LEVELS) {
  const r = play(level)
  results.push(r.done)
  console.log(
    `  ${r.done ? '✓' : '✗'} ${level.name.padEnd(16)} ` +
      (r.done
        ? `${r.seconds.toFixed(1)}s, ${level.path.length} platforms, ${r.falls} fall${r.falls === 1 ? '' : 's'}`
        : `stuck at platform ${r.at}/${r.of ?? level.path.length} after ${r.falls} falls\n` +
        level.path
          .map((p, k) => [p, k])
          .slice(Math.max(0, r.at - 2), r.at + 3)
          .map(
            ([p, k]) =>
              `      ${k === r.at ? '→' : ' '} ${String(k).padStart(2)} ` +
              `(${p.x}, ${p.y}, ${p.z})  ${p.gap ? `${p.gap} air` : 'walk'}` +
              `${p.ride ? ' [ride]' : ''}${p.board !== undefined ? ' [board]' : ''}`,
          )
          .join('\n') +
        `\n        ended at (${r.got.x}, ${r.got.y}, ${r.got.z})`),
  )
}

const failed = results.filter((x) => !x).length
console.log(`\n${results.length - failed} passed, ${failed} failed\n`)
process.exitCode = failed ? 1 : 0

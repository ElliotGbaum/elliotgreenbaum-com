/**
 * Minecraft's movement, ported rather than approximated.
 *
 * This file is the reason the parkour feels right, and it is worth saying why
 * it looks like this instead of like the usual `velocity += accel * dt`.
 *
 * MINECRAFT SIMULATES AT 20 Hz AND ITS CONSTANTS ARE PER TICK. Every number a
 * parkour player has in their hands — the 1.2522-block jump, the four-block
 * sprint jump, the way you keep sliding for half a second after you let go of
 * W — falls out of five lines of per-tick integration with very specific
 * coefficients. Re-deriving them in continuous time gets you close and feels
 * wrong, because what people have actually memorised is the *discrete* curve.
 * So this runs a fixed 20 Hz accumulator and renders the interpolation between
 * the last two ticks, which is exactly what the real game does.
 *
 * The tick, in order (LivingEntity#travel, Entity#move):
 *
 *   1. jump      → vy = 0.42, and if sprinting, a 0.2/tick shove forwards
 *   2. accelerate → v += input · a, where a is 0.1 on the ground and 0.02 in
 *                   the air, ×1.3 while sprinting, and scaled by the cube of
 *                   0.6/slipperiness so that ice does what ice does
 *   3. move      → sweep the 0.6×1.8 box along Y, then X, then Z, with a
 *                   0.6-block step-up retry when a horizontal axis is blocked
 *   4. gravity   → vy = (vy − 0.08) × 0.98
 *   5. drag      → vx, vz ×= slipperiness × 0.91
 *
 * Check the numbers against the real thing before changing any of them:
 *   • standing jump clears 1.2522 blocks of height
 *   • a sprint jump travels ~4.5 blocks, which is the famous four-block jump
 *   • a walking jump makes three blocks, a standing jump barely two
 * `npm run parkour:check` prints all of these out of this exact code.
 */

/* ------------------------------------------------------------------ *
 * Constants. Every one of these is Minecraft's; do not round them.
 * ------------------------------------------------------------------ */

/** seconds per simulation tick — 20 per second, like the server */
export const TICK = 0.05

/** blocks per tick, straight up, the instant you press jump */
export const JUMP_POWER = 0.42
/** blocks per tick², subtracted every tick before the vertical drag */
export const GRAVITY = 0.08
/** what is left of your vertical speed after one tick */
export const AIR_DRAG_Y = 0.98
/** …and of your horizontal speed, before block slipperiness is applied */
export const AIR_DRAG_XZ = 0.91
/** every block except ice */
export const DEFAULT_SLIP = 0.6
/** the walk speed attribute; sprinting multiplies it */
export const SPEED = 0.1
export const SPRINT_MULT = 1.3
/** the player's own input scale — Minecraft multiplies the stick by this */
export const INPUT_SCALE = 0.98
/** how much steering you have in mid-air. Famously, almost none. */
export const AIR_ACCEL = 0.02
/** the forward shove a sprint jump gets, and the whole reason 4 blocks works */
export const SPRINT_JUMP_BOOST = 0.2
/** the player is 0.6 across and 1.8 tall, and stands on its own centre */
export const WIDTH = 0.6
export const HEIGHT = 1.8
/** you walk up a slab without jumping */
export const STEP_HEIGHT = 0.6
/** crouched, you are shorter — which is how you fit under a 1.5 gap */
export const SNEAK_HEIGHT = 1.5
/** …and slower. Vanilla scales the movement input, not the speed attribute. */
export const SNEAK_SCALE = 0.3
/** where the camera sits in first person, standing… */
export const EYE_HEIGHT = 1.62
/** …and crouched. Vanilla drops the eye by 0.35, and that drop is the only
 *  thing that tells a first-person player the crouch happened at all. */
export const SNEAK_EYE_HEIGHT = 1.27

/* ------------------------------------------------------------------ *
 * Solids and the grid they live in
 * ------------------------------------------------------------------ */

export interface Solid {
  x0: number
  y0: number
  z0: number
  x1: number
  y1: number
  z1: number
  /** 0.6 for everything, 0.98 for ice */
  slip: number
  /** slime hands this fraction of your downward speed back */
  bounce: number
  /** moving platforms carry whatever is standing on them */
  mover?: { dx: number; dy: number; dz: number }
}

export interface Collider {
  add(s: Solid): void
  /** everything overlapping this box, appended to `out` */
  query(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    out: Solid[],
  ): void
  /** solids that move — always tested, never in the hash */
  readonly movers: Solid[]
  addMover(s: Solid): void
  clear(): void
}

/**
 * A hash of one-block cells. Courses are a few hundred blocks, so this is not
 * about scale — it is about never testing the whole level for a 0.28-block
 * step, which at 20 ticks a second with five sweeps per tick adds up.
 */
export function createCollider(): Collider {
  const cells = new Map<number, Solid[]>()
  const movers: Solid[] = []

  // one integer key per cell. The offsets keep negative coordinates distinct;
  // courses live well inside ±512.
  const key = (x: number, y: number, z: number) =>
    (((x + 512) & 1023) << 20) | (((y + 512) & 1023) << 10) | ((z + 512) & 1023)

  return {
    movers,

    add(s) {
      for (let x = Math.floor(s.x0); x < Math.ceil(s.x1); x++) {
        for (let y = Math.floor(s.y0); y < Math.ceil(s.y1); y++) {
          for (let z = Math.floor(s.z0); z < Math.ceil(s.z1); z++) {
            const k = key(x, y, z)
            const list = cells.get(k)
            if (list) list.push(s)
            else cells.set(k, [s])
          }
        }
      }
    },

    addMover(s) {
      movers.push(s)
    },

    query(x0, y0, z0, x1, y1, z1, out) {
      for (let x = Math.floor(x0); x <= Math.floor(x1); x++) {
        for (let y = Math.floor(y0); y <= Math.floor(y1); y++) {
          for (let z = Math.floor(z0); z <= Math.floor(z1); z++) {
            const list = cells.get(key(x, y, z))
            if (!list) continue
            for (const s of list) if (!out.includes(s)) out.push(s)
          }
        }
      }
      for (const m of movers) {
        if (m.x1 > x0 && m.x0 < x1 && m.y1 > y0 && m.y0 < y1 && m.z1 > z0 && m.z0 < z1) {
          if (!out.includes(m)) out.push(m)
        }
      }
    },

    clear() {
      cells.clear()
      movers.length = 0
    },
  }
}

/* ------------------------------------------------------------------ *
 * The body
 * ------------------------------------------------------------------ */

export interface Body {
  /** feet centre */
  x: number
  y: number
  z: number
  /** blocks per TICK, not per second — these are Minecraft's own units */
  vx: number
  vy: number
  vz: number
  yaw: number
  onGround: boolean
  sprinting: boolean
  /** the slipperiness of whatever is underfoot this tick */
  slip: number
  /** set for one tick when a slime block threw us back up */
  bounced: boolean
  /** set for one tick when we hit the floor, with the speed we hit it at */
  landed: number
  /** crouched: shorter, slower, and unwilling to walk off a ledge */
  sneaking: boolean
  /** 1.8 normally, 1.5 crouched — the sweep reads this, not the constant */
  height: number
  /**
   * What we were standing on at the end of last tick. Only moving platforms
   * care: whatever they moved by has to be applied to the rider BEFORE the
   * collision sweep, or a platform rising into your feet is a platform you
   * are now inside, and the sweep pushes you off it.
   */
  standingOn: Solid | null
}

export interface Input {
  /** −1 back … +1 forward, in the direction `yaw` points */
  forward: number
  /** −1 left … +1 right */
  strafe: number
  jump: boolean
  sprint: boolean
  sneak: boolean
}

export function createBody(x: number, y: number, z: number, yaw = 0): Body {
  return {
    x, y, z,
    vx: 0, vy: 0, vz: 0,
    yaw,
    onGround: false,
    sprinting: false,
    slip: DEFAULT_SLIP,
    bounced: false,
    landed: 0,
    sneaking: false,
    height: HEIGHT,
    standingOn: null,
  }
}

/* ---- sweeping ---- */

const scratch: Solid[] = []

/**
 * How far the box may actually travel along one axis. The classic
 * expand-the-box-and-clamp: everything that overlaps on the other two axes
 * gets a chance to shorten the move.
 */
function sweep(
  world: Collider,
  x: number,
  y: number,
  z: number,
  axis: 0 | 1 | 2,
  delta: number,
  tall = HEIGHT,
): number {
  if (delta === 0) return 0
  const h = WIDTH / 2
  // the box, and then the box swept along `axis`
  const b0 = [x - h, y, z - h]
  const b1 = [x + h, y + tall, z + h]
  const q0 = b0.slice()
  const q1 = b1.slice()
  if (delta > 0) q1[axis]! += delta
  else q0[axis]! += delta

  scratch.length = 0
  // a hair of margin, so a box exactly flush with a wall still finds it
  world.query(q0[0]! - 0.001, q0[1]! - 0.001, q0[2]! - 0.001, q1[0]! + 0.001, q1[1]! + 0.001, q1[2]! + 0.001, scratch)

  const o = [
    [1, 2],
    [0, 2],
    [0, 1],
  ][axis]!
  const lo = [0, 0, 0]
  const hi = [0, 0, 0]

  let out = delta
  for (const s of scratch) {
    lo[0] = s.x0; lo[1] = s.y0; lo[2] = s.z0
    hi[0] = s.x1; hi[1] = s.y1; hi[2] = s.z1
    // must overlap on both other axes, or it is beside us and irrelevant
    let clear = false
    for (const a of o) {
      if (hi[a]! <= b0[a]! + 1e-7 || lo[a]! >= b1[a]! - 1e-7) {
        clear = true
        break
      }
    }
    if (clear) continue

    if (out > 0) {
      const room = lo[axis]! - b1[axis]!
      if (room >= -1e-7 && room < out) out = Math.max(0, room)
    } else {
      const room = hi[axis]! - b0[axis]!
      if (room <= 1e-7 && room > out) out = Math.min(0, room)
    }
  }
  return out
}

/** does the box at this position overlap anything solid? */
function blocked(world: Collider, x: number, y: number, z: number, tall: number): boolean {
  const h = WIDTH / 2
  scratch.length = 0
  world.query(x - h, y, z - h, x + h, y + tall, z + h, scratch)
  for (const s of scratch) {
    if (s.x1 <= x - h + 1e-6 || s.x0 >= x + h - 1e-6) continue
    if (s.z1 <= z - h + 1e-6 || s.z0 >= z + h - 1e-6) continue
    if (s.y1 <= y + 1e-6 || s.y0 >= y + tall - 1e-6) continue
    return true
  }
  return false
}

/** whatever is holding us up this tick, or null in mid-air */
function support(world: Collider, x: number, y: number, z: number): Solid | null {
  const h = WIDTH / 2
  scratch.length = 0
  world.query(x - h, y - 0.06, z - h, x + h, y + 0.02, z + h, scratch)
  // Whichever is actually holding up most of the box. Standing with a toe on
  // a moving platform and a heel on the ledge has to resolve one way, and
  // "most of you" is the answer that matches what you can see.
  let best: Solid | null = null
  let bestArea = 0
  for (const s of scratch) {
    if (s.y1 <= y - 0.06 || s.y1 > y + 0.02) continue
    const ox = Math.min(s.x1, x + h) - Math.max(s.x0, x - h)
    const oz = Math.min(s.z1, z + h) - Math.max(s.z0, z - h)
    if (ox <= 1e-6 || oz <= 1e-6) continue
    // a tie goes to whatever changes the feel — ice, slime, anything moving
    const area = ox * oz + (s.mover || s.bounce > 0 || s.slip !== DEFAULT_SLIP ? 1e-3 : 0)
    if (area > bestArea) {
      bestArea = area
      best = s
    }
  }
  return best
}

/* ---- the tick ---- */

/**
 * One 20 Hz Minecraft tick. `body` is mutated in place; the caller keeps the
 * previous position and interpolates for the frame it is actually drawing.
 */
export function tickBody(body: Body, input: Input, world: Collider): void {
  body.bounced = false
  body.landed = 0

  /* 0. carried. Whatever we were standing on has already moved this tick
     (the course updates its platforms before the body), so go with it first
     and let everything below run from there. Doing this after the move
     instead works for a platform sliding sideways and fails completely for
     one going up, because by then its top face is above your feet. */
  const ride = body.standingOn?.mover
  if (ride) {
    body.x += ride.dx
    body.y += ride.dy
    body.z += ride.dz
  }

  /* THE ORDER BELOW IS MINECRAFT'S AND IT IS LOAD-BEARING.
     `onGround` is whatever last tick's move decided, and it stays true for
     the whole of the tick you jump on — jumpFromGround() does not clear it.
     That one detail is why a sprint jump covers ~3.7 blocks and not ~4.2:
     the tick you leave the ground still gets ground acceleration *and*
     ground drag. Clear it early "because you're in the air now" and every
     four-block jump in the game turns into a five-block jump. */
  const grounded = body.onGround
  const slip = grounded ? body.slip : 1
  /** horizontal drag for this tick — Minecraft's slipperiness × 0.91 */
  const drag = slip * AIR_DRAG_XZ

  /* 1. crouching. Three separate mechanics in vanilla and all three matter
        here: the input is scaled to 0.3, the box shrinks to 1.5 so you fit
        under a one-and-a-half gap, and `maybeBackOffFromEdge` refuses to walk
        you off a ledge. That last one is the foundation of every setup jump in
        every parkour map ever made. */
  /* Crouching is not a ground state. Vanilla keeps the pose, the 1.5 box and
     the 0.3 input scale in mid-air — `isMovingSlowly` reads `isCrouching()` —
     which is what makes sneak-braking your air control a real technique. Only
     the edge-stop below needs you to be standing on something. */
  /* …and you cannot stand up where standing does not fit. Vanilla checks the
     pose before it changes it (`canEnterPose`); without that you pop to 1.8
     inside the ceiling, and because the sweep ignores solids you are already
     overlapping you then get a full unclipped jump with your head through a
     block — which was the fastest way out of the crawl. */
  const roomToStand = !blocked(world, body.x, body.y, body.z, HEIGHT)
  body.sneaking = input.sneak || !roomToStand
  body.height = body.sneaking ? SNEAK_HEIGHT : HEIGHT

  /* 2. sprinting.
     Vanilla starts a sprint when the key goes down while you are moving
     forwards, and — the part people get wrong — does NOT stop it when the key
     comes back up. A sprint ends when you stop pressing forward or when you
     run into something. That stickiness is why letting go of W for a moment
     is how you take the speed off before a short hop, and it is a real
     technique rather than an accident of this implementation. */
  // A sprint can only be *started* on the ground — LocalPlayer#aiStep gates it
  // on `onGround`. Without that you can press it mid-jump and collect 1.3× air
  // acceleration plus a sprint-jump boost you never earned.
  if (input.sprint && input.forward > 0.1 && grounded && !body.sneaking) {
    body.sprinting = true
  }
  if (input.forward <= 0.1 || body.sneaking) body.sprinting = false

  /* 3. jump */
  if (input.jump && grounded) {
    body.vy = JUMP_POWER
    if (body.sprinting) {
      body.vx += Math.sin(body.yaw) * SPRINT_JUMP_BOOST
      body.vz += Math.cos(body.yaw) * SPRINT_JUMP_BOOST
    }
  }

  /* 4. steering. On the ground the acceleration is scaled by the cube of
        0.6/slipperiness, which is the entire physics of ice: the same top
        speed, reached over two seconds instead of two ticks, and shed just
        as slowly. The 0.98 is the player's own input scale, and it is the
        difference between 4.4 blocks a second and the real 4.317. */
  const mult = body.sprinting ? SPRINT_MULT : 1
  const accel = grounded
    ? SPEED * mult * (0.216 / (slip * slip * slip))
    : AIR_ACCEL * mult

  /* The 0.98 input scale is applied HERE, before the length test — which is
     what Player#aiStep does, and it is not cosmetic. Vanilla's full diagonal
     is (0.98, 0.98), whose length² of 1.92 trips the >1 normalise, so the
     result is a unit vector and a diagonal runs at the SAME speed as a
     straight line. Folding 0.98 into the acceleration instead (which is what
     this used to do) normalises the raw (1,1) and leaves a diagonal 2% slow. */
  let f = input.forward * INPUT_SCALE
  let s = input.strafe * INPUT_SCALE
  if (body.sneaking) {
    f *= SNEAK_SCALE
    s *= SNEAK_SCALE
  }
  const mag = Math.hypot(f, s)
  if (mag > 1) {
    f /= mag
    s /= mag
  }
  if (mag > 1e-4) {
    // Forward is +Z in the body's own frame, matching how the figure is built.
    // RIGHT IS forward × up, WHICH IS (−cos, +sin) AND NOT (+cos, −sin): in a
    // Y-up right-handed world, facing +Z puts your right hand at −X. Getting
    // this backwards swaps A and D, which is exactly what it did.
    const sin = Math.sin(body.yaw)
    const cos = Math.cos(body.yaw)
    body.vx += (f * sin - s * cos) * accel
    body.vz += (f * cos + s * sin) * accel
  }

  /* 5. move — Y, then the horizontal axes with a step-up retry */
  body.onGround = false

  const dy = sweep(world, body.x, body.y, body.z, 1, body.vy, body.height)
  body.y += dy
  if (dy !== body.vy) {
    if (body.vy < 0) {
      body.onGround = true
      body.landed = -body.vy
      const under = support(world, body.x, body.y, body.z)
      /* …and vanilla does not bounce you if you are crouching, which is how
         you get off a slime block on purpose. It tests the KEY (
         `isSuppressingBounce` reads `isShiftKeyDown`), not the crouch state —
         and that distinction is the whole feature, because you are in the air
         when you land and therefore not crouching by any state definition. */
      if (under && under.bounce > 0 && !input.sneak && body.landed > 0.003) {
        // slime. Straight back up, which is what the real block does.
        body.vy = body.landed * under.bounce
        body.bounced = true
        body.onGround = false
      } else {
        body.vy = 0
      }
    } else {
      body.vy = 0
    }
  }

  const fromX = body.x
  const fromY = body.y
  const fromZ = body.z

  let wantX = body.vx
  let wantZ = body.vz

  /* Crouched on a ledge: shrink the move until there is still ground under
     the box a step below it. Vanilla walks this back in 0.05 increments and
     tries X, then Z, then both — which is why sneaking round an outside
     corner works at all. */
  if (body.sneaking && grounded && body.vy <= 0) {
    const safe = (dx: number, dz: number) =>
      blocked(world, body.x + dx, body.y - STEP_HEIGHT, body.z + dz, STEP_HEIGHT * 0.9)
    let gx = wantX
    let gz = wantZ
    while (gx !== 0 && !safe(gx, 0)) gx = Math.abs(gx) < 0.05 ? 0 : gx - Math.sign(gx) * 0.05
    while (gz !== 0 && !safe(0, gz)) gz = Math.abs(gz) < 0.05 ? 0 : gz - Math.sign(gz) * 0.05
    while (gx !== 0 && gz !== 0 && !safe(gx, gz)) {
      gx = Math.abs(gx) < 0.05 ? 0 : gx - Math.sign(gx) * 0.05
      gz = Math.abs(gz) < 0.05 ? 0 : gz - Math.sign(gz) * 0.05
    }
    wantX = gx
    wantZ = gz
  }

  /* Vanilla resolves the larger horizontal axis first (Shapes#collide), which
     changes how a diagonal approach resolves into an inside corner. */
  let mx: number
  let mz: number
  if (Math.abs(wantX) >= Math.abs(wantZ)) {
    mx = sweep(world, body.x, body.y, body.z, 0, wantX, body.height)
    body.x += mx
    mz = sweep(world, body.x, body.y, body.z, 2, wantZ, body.height)
    body.z += mz
  } else {
    mz = sweep(world, body.x, body.y, body.z, 2, wantZ, body.height)
    body.z += mz
    mx = sweep(world, body.x, body.y, body.z, 0, wantX, body.height)
    body.x += mx
  }

  const hitWall = mx !== wantX || mz !== wantZ
  let stepped = false
  if (hitWall && (body.onGround || grounded)) {
    // A step is not a jump: raise the box by up to 0.6, try the same move
    // again, and settle back down. Without it every slab in the world is a
    // wall, and half of parkour is slabs.
    const lift = sweep(world, fromX, fromY, fromZ, 1, STEP_HEIGHT, body.height)
    if (lift > 0.05) {
      let sx = fromX
      const sy = fromY + lift
      let sz = fromZ
      const ux = sweep(world, sx, sy, sz, 0, wantX, body.height)
      sx += ux
      const uz = sweep(world, sx, sy, sz, 2, wantZ, body.height)
      sz += uz
      if (Math.hypot(ux, uz) > Math.hypot(mx, mz) + 1e-4) {
        const drop = sweep(world, sx, sy, sz, 1, -lift, body.height)
        body.x = sx
        body.y = sy + drop
        body.z = sz
        body.onGround = true
        stepped = true
      }
    }
  }

  if (body.x === fromX + mx && mx !== wantX) body.vx = 0
  if (body.z === fromZ + mz && mz !== wantZ) body.vz = 0

  /* Running into a wall ends a sprint — the other half of the rule above, and
     why a fumbled corner costs you the next jump. But vanilla only counts a
     *major* collision: a step-up you walked cleanly over is minor and keeps
     your sprint, which is the whole reason you can sprint up a run of slabs. */
  if (hitWall && !stepped) body.sprinting = false

  /* 6. what we ended up on — read next tick, both for slipperiness and for
        whether we are riding something */
  const under = body.onGround ? support(world, body.x, body.y, body.z) : null
  body.standingOn = under
  body.slip = under?.slip ?? DEFAULT_SLIP

  /* 7. gravity and drag, in that order. A slime bounce goes through this too,
        exactly as it does in the real game — the block flips the sign, the
        tick that follows takes its 0.08 like any other. `drag` was decided at
        the top of the tick, from the ground state we started on. */
  body.vy = (body.vy - GRAVITY) * AIR_DRAG_Y
  body.vx *= drag
  body.vz *= drag
  // aiStep's cutoff, and it is 0.003 rather than something tiny — on all
  // three components, not just the horizontal pair
  if (Math.abs(body.vx) < 0.003) body.vx = 0
  if (Math.abs(body.vy) < 0.003) body.vy = 0
  if (Math.abs(body.vz) < 0.003) body.vz = 0
}

/** blocks per second, for anything that wants to talk about speed out loud */
export const perSecond = (perTick: number) => perTick / TICK

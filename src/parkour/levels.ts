/**
 * Five courses, and the builder that makes them legible.
 *
 * THE UNIT OF DIFFICULTY IS THE GAP, IN BLOCKS OF AIR. Every jump below is
 * written as `hop(2)` or `hop(3)`, which is how parkour maps have always been
 * written, and the numbers mean exactly what they mean in Minecraft because
 * the physics they run on is Minecraft's. `npm run parkour:check` prints the
 * table these are chosen against:
 *
 *   1 air  — a standing jump. Free, even from a single block.
 *   2 air  — a running jump. Needs three or four blocks of run-up, or
 *            momentum carried in from the jump before it.
 *   3 air  — a sprint jump: the "four block jump", the hardest thing vanilla
 *            Minecraft can do on the flat. Needs a real runway.
 *   4 air  — only downhill.
 *   +1 up  — costs you a block of reach. +2 up cannot be jumped at all.
 *
 * The other levers, roughly in the order the courses use them: platform width
 * (a 3×3 forgives, a 1×1 does not), turns mid-chain, height changes, slabs
 * you step onto rather than jump, moving platforms, slime, and ice.
 *
 * NOTHING HERE IMPORTS THREE.JS. Levels are data, so tools/parkour-check.mjs
 * can load them in Node and prove — by playing them with a simulated perfect
 * player — that each one is completable before it ever reaches a browser.
 */

import type { BlockId } from './blocks'

export interface Placement {
  x: number
  y: number
  z: number
  id: BlockId
  /** a Minecraft slab: half a block tall, so you step up rather than jump */
  half?: boolean
}

/** a platform that slides between two points, and carries you with it */
export interface MoverSpec {
  x: number
  y: number
  z: number
  w: number
  len: number
  id: BlockId
  /** total travel, in blocks */
  dx: number
  dy: number
  dz: number
  /** seconds for one leg of the trip */
  seconds: number
  /** 0…1 — where in its cycle it starts, so a row of them isn't in lockstep */
  phase: number
}

/**
 * Backdrop geometry: a floor a long way down, the walls of a shaft. One
 * stretched box each rather than ten thousand blocks — see blocks.ts. `solid`
 * ones are a single AABB in the collider, which is why a wall can be a mile
 * tall without costing anything.
 */
export interface Slab {
  x0: number
  y0: number
  z0: number
  x1: number
  y1: number
  z1: number
  id: BlockId
  solid: boolean
}

export interface Checkpoint {
  x: number
  y: number
  z: number
}

export interface Level {
  id: string
  /** the name on the sign, and in the HUD */
  name: string
  /** one line, shown on arrival. Says what this course is about. */
  hint: string
  /** the clear colour behind everything — NOT tone mapped */
  sky: number
  /** the fog colour, which IS tone mapped, so it is authored a shade apart */
  fog: number
  /** exponential fog density, like the field's */
  fogDensity: number
  /** how far the star dome is asked to reach */
  fogFar: number
  hemiSky: number
  hemiGround: number
  blocks: Placement[]
  slabs: Slab[]
  movers: MoverSpec[]
  checkpoints: Checkpoint[]
  spawn: { x: number; y: number; z: number; yaw: number }
  goal: Checkpoint
  /** below this, you have fallen */
  voidY: number
  /**
   * The platform centres in order — the line a perfect run takes, and what
   * the headless validator steers along. Two flags matter to it, and both
   * describe things a human does without being told: `board` is a moving
   * platform you have to wait for, `ride` is a place you get to by standing
   * still while something carries you.
   */
  path: Array<{
    x: number
    y: number
    z: number
    /** blocks of air crossed to get here. 0 means you walked. */
    gap: number
    ride?: boolean
    board?: number
  }>
}

/* ------------------------------------------------------------------ *
 * The builder
 *
 * A cursor that walks forward laying platforms. It holds the take-off cell —
 * the block you are standing on when you jump — so a hop reads as "leave this
 * one, cross N blocks of air, land on that one".
 * ------------------------------------------------------------------ */

type Dir = 0 | 1 | 2 | 3
/** +Z, +X, −Z, −X — the four ways a course can turn */
const STEP: Array<[number, number]> = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
]

interface HopOpts {
  /** height change of the platform you are landing on */
  dy?: number
  /** across the direction of travel */
  w?: number
  /** along it — a runway, if you are about to need one */
  len?: number
  id?: BlockId
  /**
   * Sideways offset of the landing platform, in blocks. A jump that is not
   * square to the way you are facing is the first thing every real parkour map
   * teaches, and without this every jump in the game is axis-aligned.
   */
  side?: number
  /** half-height, so you step on rather than jump up */
  half?: boolean
}

class Course {
  blocks: Placement[] = []
  slabs: Slab[] = []
  movers: MoverSpec[] = []
  checkpoints: Checkpoint[] = []
  path: Array<{
    x: number
    y: number
    z: number
    /** blocks of air crossed to get here. 0 means you walked. */
    gap: number
    ride?: boolean
    board?: number
  }> = []
  /** the cell you would jump from: block coordinates, top surface at y+1 */
  x = 0
  y = 0
  z = 0
  dir: Dir = 0
  id: BlockId
  /** the size of the platform under the cursor — read by turn() */
  lastLen = 1
  lastW = 1
  goalAt: Checkpoint = { x: 0, y: 0, z: 0 }
  spawnAt = { x: 0, y: 0, z: 0, yaw: 0 }

  constructor(id: BlockId) {
    this.id = id
  }

  private lay(
    cx: number,
    cy: number,
    cz: number,
    w: number,
    len: number,
    id: BlockId,
    half = false,
  ): void {
    const [sx, sz] = STEP[this.dir]!
    // perpendicular to travel
    const [px, pz] = STEP[((this.dir + 1) % 4) as Dir]!
    const across = (w - 1) / 2
    for (let l = 0; l < len; l++) {
      for (let k = -Math.floor(across); k <= Math.ceil(across); k++) {
        this.blocks.push({
          x: cx + sx * l + px * k,
          y: cy,
          z: cz + sz * l + pz * k,
          id,
          ...(half ? { half: true } : {}),
        })
      }
    }
  }

  /**
   * A block hanging over the gap you are about to jump. Minecraft's most
   * recognisable parkour element after the four-block: your jump clips on it
   * at 0.2 blocks and you cross low and fast instead of high and slow. The
   * physics already does this correctly — it just had nothing to hit.
   */
  over(dist: number, height: number, id: BlockId = this.id, w = 1): this {
    const [sx, sz] = STEP[this.dir]!
    const [px, pz] = STEP[((this.dir + 1) % 4) as Dir]!
    const across = Math.floor((w - 1) / 2)
    for (let k = -across; k <= across; k++) {
      this.blocks.push({
        x: this.x + sx * dist + px * k,
        y: this.y + height,
        z: this.z + sz * dist + pz * k,
        id,
      })
    }
    return this
  }

  /** the platform you start on. Also sets the spawn. */
  pad(w = 5, len = 5, id = this.id): this {
    this.lay(this.x, this.y, this.z, w, len, id)
    this.spawnAt = { x: this.x + 0.5, y: this.y + 1, z: this.z + 0.5, yaw: this.dir * (Math.PI / 2) }
    this.mark(this.x, this.y, this.z, len, 0, w)
    const [sx, sz] = STEP[this.dir]!
    this.x += sx * (len - 1)
    this.z += sz * (len - 1)
    return this
  }

  /** cross `air` blocks of nothing and land on what comes next */
  hop(air: number, o: HopOpts = {}): this {
    const { dy = 0, w = 1, len = 1, id = this.id, side = 0, half = false } = o
    const [sx, sz] = STEP[this.dir]!
    const [px, pz] = STEP[((this.dir + 1) % 4) as Dir]!
    const nx = this.x + sx * (air + 1) + px * side
    const nz = this.z + sz * (air + 1) + pz * side
    const ny = this.y + dy
    this.lay(nx, ny, nz, w, len, id, half)
    this.mark(nx, ny, nz, len, air, w)
    this.x = nx + sx * (len - 1)
    this.y = ny
    this.z = nz + sz * (len - 1)
    return this
  }

  /** more of the platform you are already on — a runway for the jump after */
  run(len: number, o: { w?: number; id?: BlockId } = {}): this {
    const { w = 1, id = this.id } = o
    const [sx, sz] = STEP[this.dir]!
    this.lay(this.x + sx, this.y, this.z + sz, w, len, id)
    this.mark(this.x + sx, this.y, this.z + sz, len, 0, w)
    this.x += sx * len
    this.z += sz * len
    return this
  }

  /**
   * Quarter turn: +1 right, −1 left.
   *
   * It also steps the cursor one cell back down the platform, so the corner
   * is not taken from the very last block. Arriving at a landing pad at
   * sprint speed and immediately steering ninety degrees leaves you drifting
   * in the old direction for another half block; without the run-off you
   * fall off the outside of every corner in the game, and the fix belongs
   * here rather than in five hand-written courses.
   */
  turn(q: 1 | -1 | 2): this {
    // one cell of run-off past the corner, along the way we came in
    if (this.lastLen > 2) {
      const [sx, sz] = STEP[this.dir]!
      this.x -= sx
      this.z -= sz
    }
    this.dir = (((this.dir + q) % 4) + 4) % 4 as Dir
    // …and out to the pad's edge in the new direction, so the width of the
    // pad becomes run-up and the next gap is measured from where you will
    // actually leave the ground rather than from the middle of the platform
    const reach = Math.floor((this.lastW - 1) / 2)
    if (reach > 0) {
      const [nx, nz] = STEP[this.dir]!
      this.x += nx * reach
      this.z += nz * reach
    }
    // Deliberately NOT moving the last waypoint to the corner. The cursor goes
    // there so the gap after the turn is measured from the edge you actually
    // leave, but anything running the course should aim from where it landed
    // straight at the next platform — crossing the pad diagonally is what
    // gives you the run-up, and a waypoint parked on the corner takes it away.
    this.lastLen = this.lastW
    return this
  }

  /**
   * A moving platform. You jump on at its home position and it carries you;
   * the cursor ends up where it *delivers* you, so the hop after this one is
   * measured from the far end of the ride rather than from where you boarded.
   */
  slide(
    air: number,
    o: HopOpts & {
      dx?: number
      dz?: number
      dyMove?: number
      seconds?: number
      phase?: number
    } = {},
  ): this {
    const {
      dy = 0,
      w = 3,
      len = 3,
      id = 'quartz',
      dx = 0,
      dz = 0,
      dyMove = 0,
      seconds = 2.6,
      phase = 0,
    } = o
    const [sx, sz] = STEP[this.dir]!
    const nx = this.x + sx * (air + 1)
    const nz = this.z + sz * (air + 1)
    const ny = this.y + dy
    const [px, pz] = STEP[((this.dir + 1) % 4) as Dir]!
    const half = Math.floor((w - 1) / 2)
    this.movers.push({
      x: nx - px * half,
      y: ny,
      z: nz - pz * half,
      w: this.dir % 2 === 0 ? w : len,
      len: this.dir % 2 === 0 ? len : w,
      id,
      dx,
      dy: dyMove,
      dz,
      seconds,
      phase,
    })
    // where you land on it — and you may have to wait for it to come back
    this.path.push({
      x: nx + 0.5,
      y: ny + 1,
      z: nz + 0.5,
      gap: air,
      board: this.movers.length - 1,
    })
    // …and where standing still on it leaves you. NOT the far end of the
    // platform: you do not walk anywhere during a ride, you are carried, so
    // the waypoint has to be the boarding cell plus the travel.
    this.path.push({ x: nx + dx + 0.5, y: ny + dyMove + 1, z: nz + dz + 0.5, gap: 0, ride: true })
    // the cursor, though, is the far edge at full extension — that is what
    // the gap after the ride is measured from
    this.x = nx + sx * (len - 1) + dx
    this.y = ny + dyMove
    this.z = nz + sz * (len - 1) + dz
    return this
  }

  /** light the platform you are on, and save your progress when you touch it */
  checkpoint(): this {
    this.blocks.push({ x: this.x, y: this.y, z: this.z, id: 'glowstone' })
    this.checkpoints.push({ x: this.x + 0.5, y: this.y + 1, z: this.z + 0.5 })
    return this
  }

  /** the end: a lit pad you can see from a long way back */
  goal(): this {
    const [sx, sz] = STEP[this.dir]!
    this.lay(this.x + sx, this.y, this.z + sz, 3, 3, 'emerald')
    const gx = this.x + sx * 2
    const gz = this.z + sz * 2
    this.goalAt = { x: gx + 0.5, y: this.y + 1, z: gz + 0.5 }
    this.path.push({ x: this.x + sx + 0.5, y: this.y + 1, z: this.z + sz + 0.5, gap: 0 })
    this.path.push({ x: gx + 0.5, y: this.y + 1, z: gz + 0.5, gap: 0 })
    return this
  }

  /**
   * The box the course occupies. Scenery is placed from this rather than from
   * hand-written coordinates: a wall written down as "x = 36" is a wall that
   * ends up standing in the middle of the course the first time a jump moves,
   * and the course wins that argument silently.
   */
  bounds(): { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number } {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity
    let x1 = -Infinity, y1 = -Infinity, z1 = -Infinity
    const seen = [...this.blocks, ...this.movers.flatMap((m) => [
      { x: m.x, y: m.y, z: m.z },
      { x: m.x + m.w + m.dx, y: m.y + 1 + m.dy, z: m.z + m.len + m.dz },
    ])]
    for (const b of seen) {
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); z0 = Math.min(z0, b.z)
      x1 = Math.max(x1, b.x); y1 = Math.max(y1, b.y); z1 = Math.max(z1, b.z)
    }
    return { x0, y0, z0, x1, y1, z1 }
  }

  /** one stretched box, standing in for a great many blocks */
  slab(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    id: BlockId,
    solid = true,
  ): this {
    this.slabs.push({ x0, y0, z0, x1, y1, z1, id, solid })
    return this
  }

  /** a plane `drop` blocks under the lowest platform, wider than the course */
  floor(drop: number, id: BlockId, pad = 14): this {
    const b = this.bounds()
    // not solid: you never reach it, because the void check fires first. Making
    // it solid would let a long fall end in a stand rather than a reset.
    return this.slab(
      b.x0 - pad, b.y0 - drop - 1, b.z0 - pad,
      b.x1 + pad + 1, b.y0 - drop, b.z1 + pad + 1,
      id, false,
    )
  }

  /**
   * Walls down either side. Solid, so you cannot leave the shaft — and tall
   * enough that their tops are nowhere you could land on, which is the whole
   * reason they are a slab and not a wall of blocks: a three-block-thick wall
   * of blocks has a walkable roof, and the first thing anybody does with a
   * walkable roof is stand on it and skip the level.
   */
  walls(id: BlockId, pad: number, drop: number, height: number, thick = 3): this {
    const b = this.bounds()
    this.slab(
      b.x0 - pad - thick, b.y0 - drop, b.z0 - pad,
      b.x0 - pad, b.y0 + height, b.z1 + pad + 1,
      id,
    )
    this.slab(
      b.x1 + pad + 1, b.y0 - drop, b.z0 - pad,
      b.x1 + pad + thick + 1, b.y0 + height, b.z1 + pad + 1,
      id,
    )
    return this
  }

  /** anything the cursor is not laying: scenery, a lamp, a tree */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId): this {
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) this.blocks.push({ x, y, z, id })
      }
    }
    return this
  }

  at(x: number, y: number, z: number, dir: Dir = this.dir): this {
    this.x = x
    this.y = y
    this.z = z
    this.dir = dir
    return this
  }

  /**
   * Record a point on the line a run takes. A platform gets two: where you
   * land on it, and — if it is long enough to walk along — where you leave
   * from. Recording only the far end (which this used to do) tells anything
   * following the path that a five-block runway is a five-block jump.
   */
  private mark(nx: number, ny: number, nz: number, len: number, gap: number, w = 1): void {
    this.lastLen = len
    this.lastW = w
    const [sx, sz] = STEP[this.dir]!
    this.path.push({ x: nx + 0.5, y: ny + 1, z: nz + 0.5, gap })
    if (len > 1) {
      this.path.push({
        x: nx + sx * (len - 1) + 0.5,
        y: ny + 1,
        z: nz + sz * (len - 1) + 0.5,
        gap: 0,
      })
    }
  }

  finish(
    meta: Omit<Level, 'blocks' | 'slabs' | 'movers' | 'checkpoints' | 'spawn' | 'goal' | 'path'>,
  ): Level {
    return {
      ...meta,
      blocks: this.blocks,
      slabs: this.slabs,
      movers: this.movers,
      checkpoints: this.checkpoints,
      spawn: this.spawnAt,
      goal: this.goalAt,
      path: this.path,
    }
  }
}

/* ==================================================================== *
 * THE COURSES
 *
 * Design rules, all of them consequences of the jump table above. Break one
 * and tools/parkour-check.mjs will fail to finish the course, which is the
 * only reason it exists:
 *
 *   • A 3-air sprint jump needs a runway of 4+ blocks in a straight line.
 *   • From a single block you have no run-up, so it is 1 air out of one —
 *     unless you are chaining in a straight line, where the momentum from the
 *     last jump carries you and 2 air is fair.
 *   • Turn on platforms that are at least 2×2. Turning on a single block
 *     while carrying speed is not difficulty, it is a coin toss.
 *   • +1 costs a block of reach. +2 cannot be jumped at all — climb it.
 * ==================================================================== */

/* ------------------------------------------------------------------ *
 * 1 · First Light
 *
 * Teaches walking, jumping, and that a gap is crossable. Wide platforms,
 * nothing over a running jump, two gentle turns so the camera gets used
 * once before it matters. Nobody should fall off this unless they are
 * trying to.
 * ------------------------------------------------------------------ */
function first(): Level {
  const c = new Course('grass')
  c.pad(5, 4)
  c.hop(1, { w: 3, len: 4 })
  c.hop(2, { w: 3, len: 5 })
  /* Slabs. Half a block, so you walk up them rather than jumping — the first
     thing this course teaches after "you can jump" is that not everything is
     a jump. They are adjacent, because a slab you have to leap at is just a
     small block. */
  c.hop(0, { w: 3, len: 2, dy: 1, half: true })
  c.hop(0, { w: 3, len: 4 })
  c.hop(2, { w: 3, len: 5 })
  c.turn(1)
  c.hop(1, { w: 3, len: 5 })
  // …and the first jump that is not square to the way you are facing. On a
  // one-wide target, so it is a real one: a sideways hop onto a 3-wide pad is
  // a straight jump you could have taken without touching the stick.
  c.hop(1, { len: 3, side: 1 })
  c.checkpoint()
  c.hop(1, { w: 3, len: 5 })
  c.turn(-1)
  c.hop(1, { w: 5, len: 5 })
  c.hop(2, { w: 3, len: 5, dy: -1 })
  c.hop(1, { len: 4, side: -1 })
  c.hop(1, { w: 3, len: 6 })
  c.goal()

  // a plain a long way down, so height reads as height
  c.floor(9, 'grass')

  return c.finish({
    id: 'first',
    name: 'First Light',
    hint: 'Walk, and jump the gaps. Nothing here is harder than a running jump.',
    // the field itself, after dark — this is the course you are least far
    // from home on, so it is lit closest to the world outside
    sky: 0x162a33,
    fog: 0x142731,
    fogDensity: 0.011,
    fogFar: 150,
    hemiSky: 0x3a5c69,
    hemiGround: 0x111f24,
    voidY: -6,
  })
}

/* ------------------------------------------------------------------ *
 * 2 · The Quarry
 *
 * Single blocks, in straight chains. The whole level is one idea: you cannot
 * stop to line a jump up, so you keep the momentum from the last one — the
 * first real parkour skill there is. Every turn happens on a pad wide enough
 * to stand still on.
 * ------------------------------------------------------------------ */
function cobble(): Level {
  const c = new Course('cobble')
  c.pad(3, 4, 'stone')
  /* Single blocks, three apart. Two of air is the spacing a chain of single
     blocks has to have: at a walk each jump lands square in the middle of the
     next block, so the chain regulates itself. One of air looks easier and is
     not — a bunny-hop carries 2.4 blocks and you drift a little further out of
     every landing until you are in the gap. See tools/parkour-check.mjs.

     Chains stay straight. A diagonal out of a single block means changing
     direction with no run-up and no room to stand, which is not difficulty,
     it is a coin toss — so the offsets happen off the wide pads instead. */
  c.hop(1, { len: 4 })
  c.hop(1, { len: 4 })
  c.hop(2, { w: 5, len: 5, id: 'mossy' })
  c.turn(1)
  // corners are walked, not jumped: the run-up out of a turn is only as long
  // as the pad is wide
  c.hop(0, { w: 3, len: 3 })
  // a slab staircase, walked
  c.hop(0, { w: 3, len: 2, dy: 1, half: true })
  c.hop(0, { w: 3, len: 4 })
  c.hop(1, { len: 4 })
  c.hop(1, { len: 3 })
  c.hop(2, { w: 5, len: 5, id: 'mossy' })
  c.checkpoint()
  c.turn(-1)
  c.hop(0, { w: 3, len: 4 })
  /* A low ceiling: two blocks over a narrow beam, so your jump clips at 0.2
     and you have to cross it on your feet. The physics has always handled a
     head bump correctly and nothing had ever asked it to — and this is the
     honest way to use it. A ceiling over a *gap* is a trap rather than a
     puzzle: a clipped jump only reaches about a block, so any gap you could
     actually clear under one would be a gap you could step across. */
  c.hop(2, { len: 6 })
  // …over the middle of it only: the cell you take off from has to be clear,
  // or the jump out of the corridor is clipped too and there is no way on
  // height 3, not 2: `over` measures from the platform's own grid cell, so a
  // block at +2 has its underside level with your chest. +3 leaves the two
  // blocks of headroom that make it a duck rather than a wall.
  for (const back of [1, 2, 3, 4]) c.over(-back, 3, 'stone')
  // one wide, so the sideways block is one you have to steer onto — a `side`
  // offset onto a 3-wide pad is a straight jump the pad already covers
  c.hop(2, { len: 5, side: 1 })
  c.hop(1, { len: 5 })
  c.hop(2, { w: 5, len: 5, id: 'mossy' })
  c.checkpoint()
  c.turn(-1)
  c.hop(0, { w: 3, len: 5 })
  c.hop(3, { w: 3, len: 7, id: 'stone' })
  c.hop(2, { len: 6, side: -1 })
  c.hop(2, { w: 5, len: 4, dy: -1, id: 'stone' })
  c.turn(1)
  c.hop(0, { w: 3, len: 4 })
  c.hop(2, { len: 2, dy: -1 })
  c.hop(2, { w: 3, len: 4, id: 'stone' })
  c.goal()

  // a quarry: a floor a long way down and two cut walls to give it a scale
  c.floor(12, 'stone')
  c.walls('stone', 16, 12, 34)

  return c.finish({
    id: 'cobble',
    name: 'The Quarry',
    hint: 'One block at a time. Keep moving — you cannot line these up.',
    /* A quarry: colder and a shade tighter than the field — but the sky is
       darker than it was, because this is the level where fifteen jumps land
       on a single block and you cannot plan a jump you cannot see. The
       platforms have to sit *against* something. */
    sky: 0x0e1a20,
    fog: 0x0d181e,
    fogDensity: 0.013,
    fogFar: 130,
    hemiSky: 0x35525e,
    hemiGround: 0x0f1c21,
    voidY: -8,
  })
}

/* ------------------------------------------------------------------ *
 * 3 · The Shaft
 *
 * Beams: long single-block runs where the danger is sideways rather than
 * forward. Because a beam is its own runway, this is where the four-block
 * jump can be introduced honestly — sprint the length of the beam and go.
 * ------------------------------------------------------------------ */
function mineshaft(): Level {
  const c = new Course('planks')
  c.pad(3, 5, 'planks')
  c.hop(1, { len: 5 })
  c.hop(1, { len: 5 })
  c.hop(2, { w: 5, len: 3, id: 'log' })
  c.checkpoint()
  c.turn(1)
  /* THE SHAFT'S OWN IDEA: it descends. Every other course climbs or runs
     level; this one drops, and dropping changes the arithmetic — a jump down
     reaches further, so the gaps open up as the beams go down and you are
     always leaving a platform you cannot see the bottom of. */
  c.hop(1, { len: 5 })
  c.hop(2, { len: 3, dy: -1 })
  c.hop(3, { len: 3, dy: -1 })
  c.hop(1, { w: 5, len: 3, dy: -2, id: 'log' })
  c.checkpoint()
  c.turn(-1)
  // a runway, and then the first four-block jump in the game
  /* A SETUP JUMP. The take-off is one block, so there is nowhere to stand but
     the very lip of it — and walking to a lip you cannot see over is what
     Shift is for. Sneak refuses to walk you off, which is the only way to be
     certain you are as far forward as the block allows before you go. */
  c.hop(1, { len: 1 })
  c.hop(3, { w: 3, len: 5, id: 'log' })
  c.checkpoint()
  c.hop(2, { len: 5, side: 1 })
  c.hop(2, { w: 5, len: 3 })
  c.turn(1)
  c.hop(1, { len: 5 })
  // half-block treads up the shaft wall, walked rather than jumped
  c.hop(0, { w: 3, len: 2, dy: 1, half: true })
  c.hop(0, { w: 3, len: 3 })
  /* …and a low beam over the climb. Not a crawl — the gap is a whole block,
     so you fit — but the ceiling clips your jump to 0.2, which means the two
     steps under it have to be walked and the one after it cannot be rushed. */
  c.hop(1, { dy: 1, len: 5 })
  for (const back of [1, 2, 3]) c.over(-back, 3, 'log', 3)
  c.hop(1, { dy: 1, len: 4 })
  c.hop(2, { w: 5, len: 4, id: 'log' })
  c.checkpoint()
  c.turn(-1)
  c.hop(2, { len: 4 })
  c.hop(2, { w: 3, len: 4, id: 'planks' })
  c.goal()

  // the shaft: walls either side, and a floor far below
  c.floor(14, 'stone')
  c.walls('stone', 14, 14, 40)

  return c.finish({
    id: 'mineshaft',
    name: 'The Shaft',
    hint: 'Narrow beams over a long drop. Watch your feet, not the far end.',
    // underground: warmer than the rest, but still dusk — a sepia room with
    // no blue left in it is a different website again, which is the exact
    // failure this whole pass exists to undo
    sky: 0x111a1e,
    fog: 0x141d20,
    fogDensity: 0.019,
    fogFar: 100,
    hemiSky: 0x3c4a48,
    hemiGround: 0x121a1c,
    voidY: -10,
  })
}

/* ------------------------------------------------------------------ *
 * 4 · Sprint
 *
 * Four-block jumps, one after another, each with a runway long enough that
 * the only question is whether you held sprint. Then a platform that will
 * not wait for you, and a slime block at the bottom of a drop that throws
 * you back out of it.
 * ------------------------------------------------------------------ */
function sprint(): Level {
  const c = new Course('sandstone')
  c.pad(5, 6, 'sandstone')
  // Four-block jumps, and short places to land after them. The landing length
  // is what sets the window — a six-long pad lets you leave two ticks early
  // and still make it, which is why this used to be the most forgiving level
  // in the game despite having the longest jumps in it.
  c.hop(3, { w: 3, len: 3 })
  c.checkpoint()
  c.hop(3, { len: 3 })
  // an ice runway into a four-block jump: you cannot shed speed on it and you
  // cannot get it back, so the take-off is decided long before you reach it
  c.hop(2, { w: 3, len: 7, id: 'ice' })
  c.hop(3, { len: 2 })
  c.turn(1)
  c.hop(2, { w: 3, len: 6 })
  c.hop(3, { len: 3, side: 1, id: 'sand' })
  c.checkpoint()
  // the lift: stand still and let it take you
  c.turn(-1)
  c.hop(2, { w: 3, len: 4 })
  c.slide(0, { w: 3, len: 3, dz: 9, seconds: 3.2, id: 'quartz' })
  c.hop(2, { len: 3 })
  c.checkpoint()
  // and the drop. The slime is the floor of it, and it is also the way out.
  c.hop(2, { w: 5, len: 3, dy: -4, id: 'slime' })
  // …and straight onto solid ground. A trampoline you can bounce off the edge
  // of is a trap, and there is no sneak key here to stop the bouncing with.
  c.hop(0, { w: 3, len: 4, id: 'sandstone' })
  // half-block treads out of the pit
  c.hop(0, { w: 3, len: 2, dy: 1, half: true })
  c.hop(0, { w: 3, len: 4 })
  c.checkpoint()
  c.hop(2, { len: 3 })
  c.hop(2, { w: 3, len: 5 })
  c.hop(3, { len: 2 })
  c.hop(2, { len: 3, side: -1 })
  c.turn(1)
  c.hop(2, { w: 3, len: 4 })
  c.goal()

  // desert floor, dunes, and a ruin or two — all outside the course's box
  const b4 = c.bounds()
  c.floor(12, 'sand')
  c.fill(b4.x0 - 13, b4.y0 - 11, b4.z0 + 8, b4.x0 - 6, b4.y0 - 10, b4.z0 + 22, 'sand')
  c.fill(b4.x1 + 6, b4.y0 - 11, b4.z1 - 30, b4.x1 + 14, b4.y0 - 9, b4.z1 - 16, 'sandstone')
  c.fill(b4.x0 - 12, b4.y0 - 11, b4.z1 - 12, b4.x0 - 7, b4.y0 - 8, b4.z1 - 6, 'sandstone')

  return c.finish({
    id: 'sprint',
    name: 'Sprint',
    hint: 'Long jumps. Hold Ctrl and use the whole runway.',
    // open country: the widest sky of the five, and the thinnest fog
    sky: 0x1b2b31,
    fog: 0x1a2a2e,
    fogDensity: 0.0075,
    fogFar: 190,
    hemiSky: 0x486a72,
    hemiGround: 0x1a201c,
    voidY: -9,
  })
}

/* ------------------------------------------------------------------ *
 * 5 · The Deep
 *
 * Everything at once, over nothing at all. Ice you cannot stop on, a lift
 * that only goes up while you stand on it, single blocks over the void, and
 * a four-block jump to finish.
 * ------------------------------------------------------------------ */
function theEnd(): Level {
  const c = new Course('endstone')
  c.pad(5, 5, 'endstone')
  /* THE FINALE HAS TO BE THE TIGHTEST THING IN THE GAME, and for a while it
     was not — it was third, behind a level-two chain and the level called
     Sprint. The fix is not more jumps, it is fewer easy ones: what a player
     feels is the average window across a course, so filler between the hard
     jumps makes a level *easier* however long it is. Almost nothing here is
     a one-block gap, every landing is short, and there is no floor. */
  c.hop(2, { w: 3, len: 5, id: 'purpur' })
  // a rise takes a block of reach with it, so it gets one of air and not two
  c.hop(1, { w: 3, len: 4, dy: 1, id: 'obsidian' })
  c.turn(1)
  c.hop(2, { len: 4 })
  c.hop(2, { w: 3, len: 4, id: 'obsidian' })
  c.checkpoint()
  // ice: two seconds to get going, two more to stop, and a short place to do
  // the stopping on
  c.hop(1, { w: 3, len: 8, id: 'ice' })
  c.hop(2, { w: 3, len: 3, id: 'obsidian' })
  c.turn(-1)
  c.hop(0, { w: 3, len: 5, id: 'purpur' })
  c.hop(3, { w: 3, len: 3, id: 'purpur' })
  // a genuine diagonal: one block wide, so the sideways offset is a block you
  // have to steer onto rather than one the straight line already covers
  c.hop(2, { len: 3, side: 1, id: 'obsidian' })
  c.checkpoint()
  /* A crawl, and the geometry of it is the whole trick. Blocks are one unit,
     you are 1.8 standing and 1.5 crouched — so *no* whole-block gap is a
     crouch gap: one block fits neither and two fit both. Minecraft makes one
     the same way this does, with a half-slab floor under a two-block ceiling:
     the deck comes up 0.5 and the headroom lands at exactly 1.5. Under your
     standing height, over your crouched one. It is the one stretch in the
     game you cannot walk through, and it is where Shift stops being a key the
     legend mentions and becomes a key you need. */
  c.hop(1, { w: 3, len: 5, dy: 1, half: true })
  /* The roof covers the middle only. Both ends have to be open: roof the cell
     you leave from and the jump out is clipped too, roof the cell you land on
     and the jump *in* clips on the way down and drops you short. `over` counts
     back from the far end, so on a five-long deck that is 1, 2, 3. */
  for (const back of [1, 2, 3]) c.over(-back, 2, 'obsidian', 3)
  c.hop(1, { w: 3, len: 4 })
  c.slide(0, { w: 3, len: 3, dyMove: 6, seconds: 3.0, id: 'obsidian' })
  c.hop(2, { w: 3, len: 5, id: 'endstone' })
  c.checkpoint()
  c.turn(1)
  c.hop(0, { w: 3, len: 5, id: 'purpur' })
  c.hop(3, { w: 3, len: 3, id: 'purpur' })
  c.hop(2, { len: 3, side: -1 })
  c.hop(2, { w: 3, len: 4, id: 'obsidian' })
  c.checkpoint()
  c.turn(-1)
  // single blocks, three apart, over nothing at all
  c.hop(0, { w: 3, len: 5 })
  c.hop(2)
  c.hop(2)
  c.hop(2)
  c.hop(2)
  c.hop(2)
  c.hop(2, { w: 3, len: 4, id: 'endstone' })
  c.checkpoint()
  // and the last thing you do in the game is a four-block jump onto three
  // blocks of stone with a very long way down on either side of them
  c.hop(3, { w: 3, len: 3, id: 'purpur' })
  c.goal()

  // the pillars of the End. No floor: this one really is over the void.
  const b5 = c.bounds()
  for (let i = 0; i < 6; i++) {
    const px = i % 2 ? b5.x1 + 7 + (i % 3) * 3 : b5.x0 - 7 - (i % 3) * 3
    const pz = Math.round(b5.z0 + 4 + i * ((b5.z1 - b5.z0) / 6))
    const h = 14 + (i % 3) * 6
    c.fill(px - 1, b5.y0 - 30, pz - 1, px + 1, b5.y0 - 30 + h, pz + 1, 'obsidian')
    c.fill(px - 1, b5.y0 - 30 + h, pz - 1, px + 1, b5.y0 - 30 + h, pz + 1, 'glowstone')
  }

  return c.finish({
    id: 'end',
    name: 'The Deep',
    hint: 'Ice, a crawl you will need Shift for, and one long jump. No floor.',
    // and the deep end: near black, cold, nothing underneath
    sky: 0x0a0a12,
    fog: 0x0d0d18,
    fogDensity: 0.015,
    fogFar: 160,
    hemiSky: 0x2b2c48,
    hemiGround: 0x0a0a12,
    voidY: -30,
  })
}

export const LEVELS: Level[] = [first(), cobble(), mineshaft(), sprint(), theEnd()]

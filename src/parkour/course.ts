/**
 * A level, turned into something you can stand on.
 *
 * Pure: no three.js, no DOM. The game builds meshes from the same `Level` data
 * separately, and tools/parkour-check.mjs uses this module on its own to play
 * every course headlessly and prove it is completable before it ships.
 */

import { createCollider, type Collider, type Solid } from './physics'
import { slipOf, bounceOf } from './blockmeta'
import type { Level, MoverSpec } from './levels'

export interface Mover {
  spec: MoverSpec
  /** the live box — the collider holds this same object */
  solid: Solid
  /** current offset from home, in blocks */
  ox: number
  oy: number
  oz: number
}

export interface CourseWorld {
  collider: Collider
  movers: Mover[]
  /** move everything that moves to absolute time `t`, in seconds */
  setTime(t: number): void
}

/**
 * Ping-pong, 0…1…0, with the corners taken off so a rider is not thrown — and
 * with a real pause at each end. The pause is the whole difference between a
 * platform you can time and a platform you have to guess at: it gives you a
 * beat to walk on and a beat to walk off, which is how every piston lift in
 * every parkour map has ever worked.
 */
const HOLD = 0.2
function shuttle(u: number): number {
  const k = ((u % 2) + 2) % 2
  const tri = k < 1 ? k : 2 - k
  const t = Math.max(0, Math.min(1, (tri - HOLD) / (1 - 2 * HOLD)))
  return t * t * (3 - 2 * t)
}

export function buildCourse(level: Level): CourseWorld {
  const collider = createCollider()

  /* Static blocks. One AABB each: merging runs would halve the count, but a
     course is a few hundred blocks and the hash makes that irrelevant. */
  for (const b of level.blocks) {
    collider.add({
      x0: b.x,
      y0: b.y,
      z0: b.z,
      x1: b.x + 1,
      y1: b.y + (b.half ? 0.5 : 1),
      z1: b.z + 1,
      slip: slipOf(b.id),
      bounce: bounceOf(b.id),
    })
  }

  /* Backdrop slabs: one AABB each, and only if they are meant to stop you */
  for (const sl of level.slabs) {
    if (!sl.solid) continue
    collider.add({
      x0: sl.x0, y0: sl.y0, z0: sl.z0,
      x1: sl.x1, y1: sl.y1, z1: sl.z1,
      slip: slipOf(sl.id),
      bounce: bounceOf(sl.id),
    })
  }

  const movers: Mover[] = level.movers.map((spec) => {
    const solid: Solid = {
      x0: spec.x,
      y0: spec.y,
      z0: spec.z,
      x1: spec.x + spec.w,
      y1: spec.y + 1,
      z1: spec.z + spec.len,
      slip: slipOf(spec.id),
      bounce: bounceOf(spec.id),
      mover: { dx: 0, dy: 0, dz: 0 },
    }
    collider.addMover(solid)
    return { spec, solid, ox: 0, oy: 0, oz: 0 }
  })

  return {
    collider,
    movers,

    setTime(t: number) {
      for (const m of movers) {
        const s = m.spec
        const k = shuttle(t / Math.max(0.05, s.seconds) + s.phase * 2)
        const nx = s.dx * k
        const ny = s.dy * k
        const nz = s.dz * k
        // the delta is what gets handed to whoever is standing on it
        m.solid.mover!.dx = nx - m.ox
        m.solid.mover!.dy = ny - m.oy
        m.solid.mover!.dz = nz - m.oz
        m.ox = nx
        m.oy = ny
        m.oz = nz
        m.solid.x0 = s.x + nx
        m.solid.x1 = s.x + nx + s.w
        m.solid.y0 = s.y + ny
        m.solid.y1 = s.y + ny + 1
        m.solid.z0 = s.z + nz
        m.solid.z1 = s.z + nz + s.len
      }
    },
  }
}

/**
 * The top of the highest solid surface under a point, or null. Used for the
 * drop shadow, which in a third-person platformer is not decoration — it is
 * the only cue for where you are going to land.
 */
export function groundUnder(
  world: CourseWorld,
  x: number,
  y: number,
  z: number,
  reach = 24,
): number | null {
  const out: Solid[] = []
  world.collider.query(x - 0.3, y - reach, z - 0.3, x + 0.3, y + 0.1, z + 0.3, out)
  let best: number | null = null
  for (const s of out) {
    if (s.y1 > y + 0.06) continue
    if (s.x1 <= x - 0.3 || s.x0 >= x + 0.3) continue
    if (s.z1 <= z - 0.3 || s.z0 >= z + 0.3) continue
    if (best === null || s.y1 > best) best = s.y1
  }
  return best
}

/** is this point inside something solid? Used to keep the camera out of walls. */
export function pointBlocked(world: CourseWorld, x: number, y: number, z: number, r = 0.3): boolean {
  const out: Solid[] = []
  world.collider.query(x - r, y - r, z - r, x + r, y + r, z + r, out)
  for (const s of out) {
    if (s.x1 > x - r && s.x0 < x + r && s.y1 > y - r && s.y0 < y + r && s.z1 > z - r && s.z0 < z + r) {
      return true
    }
  }
  return false
}

/** is the player standing on this marker block? */
export function touching(
  px: number,
  py: number,
  pz: number,
  m: { x: number; y: number; z: number },
): boolean {
  return Math.abs(px - m.x) < 0.85 && Math.abs(pz - m.z) < 0.85 && Math.abs(py - m.y) < 1.6
}

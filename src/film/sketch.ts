/**
 * SKETCHES — traced line art, and the pen that draws it.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  ELLIOT — THE DRAWINGS ARE WRITTEN BY HAND                           │
 * │                                                                      │
 * │  Each one is a short TypeScript file in src/film/sketches/, built    │
 * │  out of the kit in src/film/sketches/kit.ts. To change one, move a   │
 * │  number in it and run:                                               │
 * │                                                                      │
 * │      npm run sketch            all four, side by side                │
 * │      npm run sketch guitar     one, big                              │
 * │                                                                      │
 * │  Then look at shots/sketches.png, which shows every drawing          │
 * │  part-way and finished.                                              │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * WHY LINES AND NOT THE PHOTOGRAPHS: everything else in this film is drawn —
 * one hairline weight, two colours, nothing raster anywhere — and a photograph
 * pasted into the middle of that reads as an accident. Lines also let a picture
 * ARRIVE, stroke by stroke, the way the rest of the film arrives, which is the
 * only reason a still photograph is worth three seconds of anybody's time.
 *
 * WHY DRAWN AND NOT TRACED: the drawings were generated for a while, by an
 * edge detector pointed at four photographs. Edge detection has no idea what a
 * face is — it gives you every crease in a shirt at the same weight as the
 * jaw — so the portrait came out as ninety strokes of confident nonsense that
 * took five seconds to lay down and still didn't look like anybody. The tracer
 * is retired in tools/trace.mjs. Do not run it: it writes into sketches/.
 *
 * The array order IS the drawing order, and each file puts its big shapes
 * first: the marks that carry the picture land first and heaviest, the detail
 * lands on top. Pacing is by DISTANCE, not by stroke count — a long stroke
 * takes longer to draw than a short one, because that is what a pen does, and
 * because scheduling by count makes the eleven little marks around an eye take
 * as long as the jaw.
 *
 * This module is a LEAF below the acts and above the drawing kit: it may
 * import src/film/timeline.ts and nothing else in film/.
 */

import { clamp, easeOut, range } from '../core/contract'
import type { Pt } from './timeline'
import { drawPath, pointAt } from './timeline'

/* ==================================================================== *
 * The data
 * ==================================================================== */

/** one traced stroke: a weight multiplier and a polyline in unit space */
export interface SketchStroke {
  readonly w: number
  readonly c: ReadonlyArray<readonly [number, number]>
}

/**
 * What tools/sketch.mjs writes. y runs 0…1; x is centred on 0.5 at `aspect`,
 * so the drawing carries its own proportions and no caller has to know them.
 */
export interface SketchData {
  readonly aspect: number
  readonly strokes: readonly SketchStroke[]
}

/** a sketch with its drawing schedule worked out — build one with `prepare` */
export interface Sketch {
  readonly aspect: number
  readonly strokes: ReadonlyArray<{ readonly pts: readonly Pt[]; readonly weight: number }>
  /** per-stroke [start, end] as fractions of the whole drawing, by length */
  readonly schedule: ReadonlyArray<readonly [number, number]>
}

/**
 * Work out the schedule once, at module load, and hand back something an act
 * can draw every frame without allocating. Acts call this at the top of their
 * own module — never inside draw().
 */
export function prepare(data: SketchData): Sketch {
  const strokes = data.strokes.map((s) => ({
    pts: s.c.map(([x, y]) => ({ x, y })),
    weight: s.w,
  }))

  const lengths = strokes.map((s) => {
    let d = 0
    for (let i = 1; i < s.pts.length; i++) {
      const a = s.pts[i - 1]
      const b = s.pts[i]
      if (a && b) d += Math.hypot(b.x - a.x, b.y - a.y)
    }
    return d
  })
  const total = lengths.reduce((n, d) => n + d, 0) || 1

  const schedule: Array<readonly [number, number]> = []
  let run = 0
  for (const d of lengths) {
    const a = run / total
    run += d
    schedule.push([a, run / total])
  }

  return { aspect: data.aspect, strokes, schedule }
}

/* ==================================================================== *
 * Drawing
 * ==================================================================== */

export interface SketchBox {
  x: number
  y: number
  w: number
  h: number
}

export interface SketchStyle {
  /** overall opacity of the drawing */
  alpha: number
  /** the act's hairline width — every stroke is a multiple of it */
  hair: number
  /** stroke colour, as '#RRGGBB' */
  color: string
  /**
   * The lit tip of the pen. Off for a settled drawing, and off under reduced
   * motion — a glowing dot parked on a finished line is not a pen, it is a
   * bug. Pass the softDot painter in rather than importing it, so this module
   * stays independent of how an act wants its glow drawn.
   */
  pen?: ((p: Pt) => void) | undefined
}

/**
 * Fit a sketch inside `box` without distorting it, and return the rectangle it
 * actually occupies. Exported because acts need to hang labels and pointers off
 * the edges of the drawing rather than off the box they offered it.
 */
export function fitSketch(s: Sketch, box: SketchBox): SketchBox {
  const h = Math.min(box.h, box.w / s.aspect)
  const w = h * s.aspect
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }
}

/**
 * Draw the first `prog` of the sketch into `box`.
 *
 * `prog` is 0…1 across the WHOLE drawing; each stroke works out its own share
 * from the schedule. Returns the fitted rectangle so the caller can lay out
 * around it.
 */
export function drawSketch(
  ctx: CanvasRenderingContext2D,
  s: Sketch,
  box: SketchBox,
  prog: number,
  style: SketchStyle,
): SketchBox {
  const fit = fitSketch(s, box)
  if (style.alpha <= 0.004 || prog <= 0.0005) return fit

  const at = (u: Pt): Pt => ({ x: fit.x + (u.x - 0.5) * fit.h + fit.w / 2, y: fit.y + u.y * fit.h })

  const prevCap = ctx.lineCap
  const prevJoin = ctx.lineJoin
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const n = parseInt(style.color.slice(1), 16)
  const rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`

  let live: Pt | null = null
  for (let i = 0; i < s.strokes.length; i++) {
    const stroke = s.strokes[i]
    const win = s.schedule[i]
    if (!stroke || !win) continue
    const k = easeOut(range(prog, win[0], win[1]))
    if (k <= 0.004) continue

    // Detail costs height. A fret line is worth drawing at three hundred pixels
    // and is a grey smear at sixty, where it takes the silhouette down with it —
    // so the lighter a mark is, the more room it has to earn before it appears.
    // Ramped rather than switched, because the projector's screen changes size
    // as you walk toward it and a stroke popping in is worse than a faint one.
    const need = 58 / Math.max(0.35, stroke.weight)
    const lod = clamp(range(fit.h, need, need * 1.9))
    if (lod <= 0.01) continue

    const pts = stroke.pts.map(at)
    // the mark that is still being made is a shade brighter than the ones
    // already down — which is what a wet line looks like next to a dry one
    const a = clamp(style.alpha) * lod * (k < 1 ? 1 : 0.86)
    ctx.strokeStyle = `rgba(${rgb},${a.toFixed(4)})`
    ctx.lineWidth = style.hair * 1.55 * stroke.weight
    drawPath(ctx, pts, k)
    if (k < 1) live = pointAt(pts, k)
  }

  if (live && style.pen) style.pen(live)

  ctx.lineCap = prevCap
  ctx.lineJoin = prevJoin
  return fit
}

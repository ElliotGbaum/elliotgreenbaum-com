/**
 * The kit the sketches are DRAWN with.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  ELLIOT — HOW TO CHANGE A DRAWING                                    │
 * │                                                                      │
 * │  Open the drawing (src/film/sketches/<name>.ts), move a number,      │
 * │  and run:                                                            │
 * │                                                                      │
 * │      npm run sketch            all four, side by side                │
 * │      npm run sketch guitar     one, big                              │
 * │                                                                      │
 * │  It writes shots/sketches.png — every drawing at a quarter, a half   │
 * │  and finished, which is the only way to see whether it reads while   │
 * │  it is still arriving.                                               │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * WHY THESE ARE DRAWN AND NOT TRACED. They used to come out of an edge
 * detector pointed at four photographs (tools/trace.mjs, kept but retired).
 * Edge detection has no idea what a face is: it gives you every crease in a
 * shirt and every seam in the wall behind the head at the same weight as the
 * jaw, so the portrait was ninety strokes of confident nonsense that took five
 * seconds to lay down and still didn't look like anybody. The fix is not a
 * better threshold. It is to draw the thing — the way the sketch-my-life
 * videos do it, where a face is eleven marks and you know it in one.
 *
 * SO THE RULES FOR ANYTHING IN THIS FOLDER:
 *
 *   under twenty-five strokes    if it needs more, it is a photograph
 *   every stroke says one thing  a jaw, a brow, a bell — never a texture
 *   no stroke shorter than ~0.04 anything smaller is grain, and grain is
 *                                what made the traces look dirty
 *   symmetry is free             author one half, `mirror` the other, and the
 *                                drawing lands as clean as a stencil
 *
 * TWO WEIGHTS, NOT ONE. Use the `W` scale below and use it honestly: the
 * silhouette is heavy, the inside of the drawing is light. A drawing where the
 * jaw and the eyelashes are the same width is the thing that reads as
 * generated, and it is also the thing that dies first when the projector
 * throws it thirty units away and every line lands on the same two pixels.
 *
 * EVERY DRAWING IS COHERENT AT EVERY MOMENT. The array order is the drawing
 * order and the film spends most of its time part-way through, so a drawing
 * whose first half is an empty vessel — a bald egg, a bare U — is broken for
 * two seconds out of three even though it is perfect at the end. Order the
 * strokes so that whatever is on screen is always a picture of something.
 *
 * SPACE. y runs 0 (top) to 1 (bottom); x is centred on 0.5. Author in whatever
 * coordinates suit you and hand the strokes to `fit()`, which normalises the
 * lot to a common padded box and works out the aspect. Nothing should be
 * setting `aspect` by hand.
 */

import type { SketchData, SketchStroke } from '../sketch'

/** one authored point */
export type A = readonly [number, number]

/** four decimals is a tenth of a pixel on a 4K screen and half the file size */
const q = (n: number): number => Math.round(n * 1e4) / 1e4
const P = (x: number, y: number): A => [q(x), q(y)]

/**
 * The weights. Four of them, and a drawing should use three at most.
 *
 * `edge` is the silhouette and nothing else — the mark you would keep if you
 * were allowed six. `line` is structure inside the silhouette. `fine` is
 * detail. `hair` is texture, and if you find yourself reaching for it twice in
 * one drawing the drawing wants fewer marks, not thinner ones.
 */
export const W = {
  edge: 2.2,
  line: 1.15,
  fine: 0.75,
  hair: 0.5,
} as const

/* ==================================================================== *
 * Marks
 * ==================================================================== */

/** a polyline, exactly as given — for anything that is genuinely straight */
export function poly(w: number, pts: ReadonlyArray<A>): SketchStroke {
  return { w, c: pts.map(([x, y]) => P(x, y)) }
}

/** one straight mark */
export function line(w: number, x1: number, y1: number, x2: number, y2: number): SketchStroke {
  return poly(w, [
    [x1, y1],
    [x2, y2],
  ])
}

/**
 * A smooth curve THROUGH every anchor — Catmull–Rom, uniform.
 *
 * This is the workhorse, and it is a Catmull–Rom rather than a Bézier for one
 * reason: the anchors are the drawing. You place points where the line goes
 * and the curve goes there. With Béziers half the numbers in a file are
 * handles that are not on the line at all, and nobody can read the shape back
 * out of them a month later.
 *
 * Open curves get their ends reflected so the first and last segments bend the
 * way the eye expects instead of shooting off straight.
 */
export function curve(
  w: number,
  anchors: ReadonlyArray<A>,
  opts: { closed?: boolean; per?: number } = {},
): SketchStroke {
  const closed = opts.closed ?? false
  const per = opts.per ?? 10
  const n = anchors.length
  if (n < 3) return poly(w, anchors)

  const at = (i: number): A => {
    if (closed) return anchors[((i % n) + n) % n] as A
    if (i < 0) {
      const a = anchors[0] as A
      const b = anchors[1] as A
      return [2 * a[0] - b[0], 2 * a[1] - b[1]]
    }
    if (i > n - 1) {
      const a = anchors[n - 1] as A
      const b = anchors[n - 2] as A
      return [2 * a[0] - b[0], 2 * a[1] - b[1]]
    }
    return anchors[i] as A
  }

  const spline = (a: number, b: number, c: number, d: number, t: number): number => {
    const t2 = t * t
    const t3 = t2 * t
    return (
      0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
    )
  }

  const out: A[] = []
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    for (let s = 0; s < per; s++) {
      const t = s / per
      out.push(P(spline(p0[0], p1[0], p2[0], p3[0], t), spline(p0[1], p1[1], p2[1], p3[1], t)))
    }
  }
  const end = closed ? (anchors[0] as A) : (anchors[n - 1] as A)
  out.push(P(end[0], end[1]))
  return { w, c: out }
}

/** a closed ellipse — eyes, knobs, sound holes, the bell of a horn */
export function ring(w: number, cx: number, cy: number, rx: number, ry = rx, steps = 28): SketchStroke {
  const c: A[] = []
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2
    c.push(P(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry))
  }
  return { w, c }
}

/**
 * A dot, drawn as a scribbled-out little ring rather than a point, because a
 * one-point stroke has no length and the schedule in sketch.ts pays by length —
 * a zero-length mark arrives in zero time, which reads as a pop.
 */
export function dot(w: number, cx: number, cy: number, r: number): SketchStroke {
  const c: A[] = []
  const turns = 2.35
  const steps = 22
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = t * Math.PI * 2 * turns
    const k = r * (0.34 + 0.66 * t)
    c.push(P(cx + Math.cos(a) * k, cy + Math.sin(a) * k))
  }
  return { w, c }
}

/** an arc of an ellipse. Angles are TURNS: 0 is right, 0.25 is down. */
export function arc(
  w: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  from: number,
  to: number,
  steps = 20,
): SketchStroke {
  const c: A[] = []
  for (let i = 0; i <= steps; i++) {
    const a = (from + (to - from) * (i / steps)) * Math.PI * 2
    c.push(P(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry))
  }
  return { w, c }
}

/** a rounded box — pickups, bridges, anything manufactured */
export function box(
  w: number,
  x: number,
  y: number,
  bw: number,
  bh: number,
  r = Math.min(bw, bh) * 0.3,
): SketchStroke {
  const k = Math.min(r, bw / 2, bh / 2)
  const seg = (cx: number, cy: number, from: number, to: number): A[] => {
    const out: A[] = []
    for (let i = 0; i <= 5; i++) {
      const a = (from + (to - from) * (i / 5)) * Math.PI * 2
      out.push(P(cx + Math.cos(a) * k, cy + Math.sin(a) * k))
    }
    return out
  }
  const c: A[] = [
    ...seg(x + bw - k, y + k, 0.75, 1),
    ...seg(x + bw - k, y + bh - k, 0, 0.25),
    ...seg(x + k, y + bh - k, 0.25, 0.5),
    ...seg(x + k, y + k, 0.5, 0.75),
  ]
  c.push(c[0] as A)
  return { w, c }
}

/* ==================================================================== *
 * Symmetry
 * ==================================================================== */

/** the same mark, flipped about the centre line (or about `about`) */
export function mirror(s: SketchStroke, about = 0.5): SketchStroke {
  return { w: s.w, c: s.c.map(([x, y]) => P(about * 2 - x, y)) }
}

/** anchors, flipped — for building one closed outline out of one authored half */
export function flip(pts: ReadonlyArray<A>, about = 0.5): A[] {
  return pts.map(([x, y]) => P(about * 2 - x, y))
}

/**
 * A closed, left–right symmetric outline from the LEFT half only.
 *
 * Give it the profile from the top of the shape to the bottom of it; it walks
 * back up the mirrored side for you. The two points that sit on the centre line
 * (first and last) are not repeated, so the curve closes without a kink.
 */
export function symmetric(
  w: number,
  half: ReadonlyArray<A>,
  opts: { about?: number; per?: number } = {},
): SketchStroke {
  const about = opts.about ?? 0.5
  const back = flip(half, about).reverse().slice(1, -1)
  return curve(w, [...half, ...back], { closed: true, per: opts.per ?? 10 })
}

/* ==================================================================== *
 * The hand
 * ==================================================================== */

/**
 * Put a hand into the line.
 *
 * Everything above produces geometry that is exactly right, and exactly right
 * is the tell. A drawing where every ellipse closes perfectly, every mirrored
 * pair matches to four decimals and no curve ever wanders reads as generated
 * however good the shapes are — the eye is very good at spotting that nothing
 * decided anything.
 *
 * So: a low-frequency wobble along the NORMAL of the line, deterministic from
 * `seed`, tapering to nothing at both terminals so junctions still meet. Two
 * octaves, because one is a sine wave and three is noise. `amp` is in unit
 * space and wants to stay near 0.004 — about a pixel and a half at review
 * size, which is a hand, and four is a tremor.
 */
export function hand(s: SketchStroke, amp = 0.004, seed = 1): SketchStroke {
  const n = s.c.length
  if (n < 4) return s

  const run: number[] = [0]
  for (let i = 1; i < n; i++) {
    const a = s.c[i - 1] as A
    const b = s.c[i] as A
    run.push((run[i - 1] as number) + Math.hypot(b[0] - a[0], b[1] - a[1]))
  }
  const total = (run[n - 1] as number) || 1

  return {
    w: s.w,
    c: s.c.map((p, i) => {
      if (i === 0 || i === n - 1) return p
      const prev = s.c[i - 1] as A
      const next = s.c[i + 1] as A
      const tx = next[0] - prev[0]
      const ty = next[1] - prev[1]
      const m = Math.hypot(tx, ty) || 1
      const u = (run[i] as number) / total
      // fades to zero at both ends, so the mark still lands where it was aimed
      const taper = Math.sin(Math.PI * u)
      const wob =
        Math.sin(u * 6.9 + seed * 2.4) * 0.62 + Math.sin(u * 19.3 + seed * 5.1) * 0.38
      const k = amp * wob * taper
      return P(p[0] + (-ty / m) * k, p[1] + (tx / m) * k)
    }),
  }
}

/** the same, over a list — for the several contours that make one object */
export function handAll(
  strokes: ReadonlyArray<SketchStroke>,
  amp = 0.004,
  seed = 1,
): SketchStroke[] {
  return strokes.map((s, i) => hand(s, amp, seed + i * 1.37))
}

/**
 * Move, turn and resize a finished group of marks.
 *
 * For the things in a drawing that are composed rather than built — two chess
 * pieces that want to be a tenth taller and sit further right, without every
 * anchor in them being retyped and without losing the fact that they stand on
 * the table. Scale about a point ON the table and they still stand on it.
 *
 * `tilt` is in DEGREES, clockwise on screen, and it is the reason a face can be
 * authored square — every feature mirrored about x=0.5, which is the only way
 * anybody can read a face file back — and still not land as a mascot. A head
 * drawn dead level and dead symmetric reads as a mask however good the marks
 * are; four degrees of tilt about the base of the neck costs one number and
 * fixes it. Turn about a point the group is ATTACHED to, or it detaches.
 */
export function xform(
  strokes: ReadonlyArray<SketchStroke>,
  o: { about: A; scale?: number; dx?: number; dy?: number; tilt?: number },
): SketchStroke[] {
  const k = o.scale ?? 1
  const dx = o.dx ?? 0
  const dy = o.dy ?? 0
  const th = ((o.tilt ?? 0) * Math.PI) / 180
  const co = Math.cos(th)
  const si = Math.sin(th)
  const [ax, ay] = o.about
  return strokes.map((s) => ({
    w: s.w,
    c: s.c.map(([x, y]) => {
      const px = (x - ax) * k
      const py = (y - ay) * k
      return P(ax + px * co - py * si + dx, ay + px * si + py * co + dy)
    }),
  }))
}

/* ==================================================================== *
 * The frame
 * ==================================================================== */

/**
 * Normalise a finished drawing into the common box and work out its aspect.
 *
 * Author in whatever coordinates are convenient — this measures what you
 * actually drew, centres it, scales it so its HEIGHT fills the box less `pad`
 * at top and bottom, and reports the width as `aspect`. Every drawing then
 * arrives at its act already sharing a margin with the other three, which is
 * the difference between a set and four pictures.
 *
 * It also means no file has a hand-set `aspect` that quietly stops being true
 * the moment somebody moves a bell or a shoulder.
 */
export function fit(strokes: ReadonlyArray<SketchStroke>, pad = 0.025): SketchData {
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const s of strokes) {
    for (const [x, y] of s.c) {
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  const k = (1 - pad * 2) / Math.max(1e-6, y1 - y0)
  const cx = (x0 + x1) / 2
  return {
    aspect: q((x1 - x0) * k + pad * 2),
    strokes: strokes.map((s) => ({
      w: s.w,
      c: s.c.map(([x, y]) => P(0.5 + (x - cx) * k, pad + (y - y0) * k)),
    })),
  }
}

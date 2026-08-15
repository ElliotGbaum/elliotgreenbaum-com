/**
 * ACT 3 — UPenn.
 *
 * THE VENN DIAGRAM IS GONE. Three overlapping circles with a subject name on
 * each and a question written into every lens was the cleverest picture in the
 * film and the wrong one: it took fourteen seconds, it needed six labels to
 * make its point, and the point it made — the interesting part is where two
 * things touch — is an argument about the degree rather than a picture of it.
 * Three subjects studied alongside one another are not an intersection. A Venn
 * diagram is a set operation.
 *
 * WHAT REPLACED IT IS A BRAID. Three strands come down out of the top of the
 * frame, weave over and under one another, and converge into a single lit
 * point. Philosophy, politics, economics: three things, plaited, still three
 * things, arriving as one. It says the whole of what the old act said with one
 * label per strand instead of six, and it says it while MOVING, which the
 * circles never did once they had opened.
 *
 * HOW THE WEAVE WORKS, because it is the only clever thing in this file. Each
 * strand is a sine of the same amplitude and period, offset a third of a turn
 * from its neighbours — which is a braid, exactly, and costs one sin() per
 * point. What sells it is not the geometry, it is the GAPS: a strand is
 * BEHIND when its phase is on the far side of the turn, and where it is both
 * behind and near the centre line it simply stops being drawn for a few
 * points. Over and under, for free. Without those breaks the three read as
 * three sine waves sharing an axis, which is a wiring diagram.
 *
 * The amplitude holds full until 60% down and then closes to nothing, so the
 * braid is a braid for as long as it is worth looking at and a single cord by
 * the time it lands. Everything else — where the labels sit, where the node
 * goes — is solved off that.
 */

import { PALETTE, ease, easeOut, range } from '../../core/contract'
import type { Act, ActRenderContext } from '../../core/contract'
import type { Pt } from '../timeline'
import {
  comet,
  disc,
  drawPath,
  drawTracked,
  fitTracked,
  frameOf,
  hair,
  header,
  reset,
  ring,
  scale,
  setFont,
  softDot,
  subhead,
  wash,
  withAlpha,
} from '../timeline'
import copy from '../../content/film.json'

const C = copy.act3
/**
 * 7.0, down from 9.2. The braid took nine seconds to say a thing the heading
 * says in one line, and the back half of that was the strands crawling the
 * last third of the frame at the same rate they crawled the first two. The
 * grow run is shorter and everything downstream of it — the node, the pulses —
 * moved up with it. Nothing was cut: the whole braid still draws, it just
 * stops dawdling.
 */
/* 6.7, down from 7.0. The last pulse reaches the node at 5.97 — this act has
   the shortest tail in the film and the three tenths come out of it, leaving
   about three quarters of a second on the settled braid. Do not take more
   without moving PULSE_A up with it. */
const DURATION = 6.7

const STRANDS = 3
/** how many times the braid turns over its own height. Under one and it is a
 *  bend; over two and it is a rope, and a rope reads as texture, not as three
 *  things. */
const TURNS = 1.6
/** how many points each strand is sampled at — enough that the breaks land
 *  cleanly, few enough that three of them cost nothing */
const STEPS = 96

const FIELD_COLOUR = [PALETTE.buffCss, PALETTE.amberCss, PALETTE.mintCss]

/**
 * Left-to-right order of the strands where they enter the frame.
 *
 * Three sines a third of a turn apart start at 0, +0.87 and −0.87, which is
 * NOT the order they are written in film.json — so the labels are handed out
 * by measured position rather than by index, and "Philosophy, Politics,
 * Economics" reads left to right on screen whatever the phases do.
 */
const ORDER: number[] = Array.from({ length: STRANDS }, (_, i) => i)
  .map((i) => ({ i, x: Math.sin((i / STRANDS) * Math.PI * 2) }))
  .sort((a, b) => a.x - b.x)
  .map((o) => o.i)

const SCHOOL_A = 1.0
/** strand j starts here, and they are staggered so the braid builds up */
const GROW_A = 1.0
const GROW_STEP = 0.24
const GROW_RUN = 2.5
/** the point they all arrive at */
const NODE_A = 4.0
/** one pulse down each strand, into the node */
const PULSE_A = 4.5
const PULSE_STEP = 0.26
const PULSE_RUN = 0.95

function draw(c: ActRenderContext): void {
  const { ctx, w, h, t, reduced } = c
  reset(ctx)

  const F = frameOf(w, h)
  const S = scale(F)
  const hw = hair(F)
  wash(ctx, w, h, 0.85)

  const hy = header(ctx, F, S, C.index, C.heading, easeOut(range(t, -0.3, 0.7)))

  /* the date, directly under the heading — it belongs to the heading rather
     than to the picture, and it is drawn by the same routine that hangs the two
     firms and the job title under theirs. It used to be set at `micro`, which
     made it the smallest type in the film; it is a fact somebody might want to
     read. See `subhead` in src/film/timeline.ts. */
  const subY = subhead(ctx, F, S, hy, C.school, ease(range(t, SCHOOL_A, SCHOOL_A + 0.7)), PALETTE.sageCss)

  /* ---------------- the band ----------------
     The labels sit ABOVE the top of the braid, in their own strip, so a strand
     never has type on it. */
  const footY = F.y + F.h * 0.985
  const labelStrip = S.micro * 2.4
  const top = subY + S.micro * 1.2 + labelStrip
  const bot = footY - S.micro * 1.2
  const height = Math.max(40, bot - top)

  /**
   * Half the width of the braid at its widest.
   *
   * It is coupled to the HEIGHT as well as the width, because a braid wider
   * than it is tall is a ribbon — but the coefficient went up hard in this
   * pass. At 0.34 the three strands entered the frame about a hundred and
   * fifty points apart, which is fine on a desktop and nothing like enough at
   * contact-sheet size, where the type has floors and the picture does not.
   */
  const spread = Math.min(F.w * 0.34, height * 0.58)

  /* ---------------- where a strand is ---------------- */
  const phaseOf = (i: number, v: number): number =>
    (i / STRANDS + v * TURNS) * Math.PI * 2

  /** full amplitude until 60% down, then closed to nothing by the bottom */
  const ampAt = (v: number): number => spread * (1 - ease(range(v, 0.6, 1)))

  const pointAtV = (i: number, v: number): Pt => ({
    x: F.cx + Math.sin(phaseOf(i, v)) * ampAt(v),
    y: top + v * height,
  })

  /**
   * A strand is BEHIND where its phase is on the far side of the turn, and it
   * is only HIDDEN where it is both behind and close enough to the centre line
   * to actually be crossing something. Hiding it everywhere it is behind
   * deletes half of every strand.
   */
  const hidden = (i: number, v: number): boolean => {
    const p = phaseOf(i, v)
    return Math.cos(p) < 0 && Math.abs(Math.sin(p)) < 0.42 && ampAt(v) > spread * 0.25
  }

  /** the visible pieces of strand `i`, grown to `vMax` */
  const piecesOf = (i: number, vMax: number): Pt[][] => {
    const out: Pt[][] = []
    let cur: Pt[] = []
    for (let s = 0; s <= STEPS; s++) {
      const v = s / STEPS
      if (v > vMax) break
      if (hidden(i, v)) {
        if (cur.length > 1) out.push(cur)
        cur = []
      } else {
        cur.push(pointAtV(i, v))
      }
    }
    if (cur.length > 1) out.push(cur)
    return out
  }

  /* ---------------- the strands ---------------- */
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let j = 0; j < STRANDS; j++) {
    const i = ORDER[j] ?? j
    const colour = FIELD_COLOUR[j] ?? PALETTE.buffCss
    const born = GROW_A + j * GROW_STEP
    const grow = easeOut(range(t, born, born + GROW_RUN))
    if (grow <= 0.004) continue

    ctx.strokeStyle = withAlpha(colour, 0.72)
    ctx.lineWidth = hw * 2
    for (const piece of piecesOf(i, grow)) drawPath(ctx, piece, 1)

    // the head of the strand, lit while it is still travelling — the same pen
    // tip the sketches use, for the same reason
    if (grow < 1 && !reduced) {
      const head = pointAtV(i, grow)
      softDot(ctx, head.x, head.y, F.s * 0.05, PALETTE.glowCss, 0.55)
      ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.95)
      disc(ctx, head.x, head.y, hw * 1.8)
    }
  }

  /* ---------------- one pulse down each strand, into the node ----------------
     The last thing that moves in the act, and the only thing saying that the
     three of them end up in the same place on purpose. */
  if (!reduced) {
    for (let j = 0; j < STRANDS; j++) {
      const i = ORDER[j] ?? j
      const colour = FIELD_COLOUR[j] ?? PALETTE.buffCss
      const born = PULSE_A + j * PULSE_STEP
      const u = range(t, born, born + PULSE_RUN)
      if (u <= 0 || u >= 1) continue
      const whole: Pt[] = []
      for (let s = 0; s <= STEPS; s++) whole.push(pointAtV(i, s / STEPS))
      comet(ctx, whole, u, F.s * 0.03, colour, 0.8, 0.14)
    }
  }
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'

  /* ---------------- the three names, above their own strands ----------------
     THE OUTER TWO ARE HELD OUTBOARD and only the middle one is centred on its
     strand. Three centred names each fitted to a third of the frame is what
     this act shipped with first, and all three printed through one another the
     moment the band got short — the braid narrows with the band, the type does
     not, because the type has a floor. Fitting each to the real gap between
     strands fixed the overlap and left them touching, which is barely better.

     Turned outward, the two on the ends can run into the empty frame either
     side — which is where the picture is not — and the middle one gets the
     whole gap to itself. Nothing is fitted to a fraction of the frame any
     more; everything is measured off where the strands actually enter. */
  ctx.textBaseline = 'middle'
  const heads = Array.from({ length: STRANDS }, (_, j) => pointAtV(ORDER[j] ?? j, 0).x)
  const labelY = top - labelStrip * 0.5

  /* Measured first, all three, and then all three are drawn at the SMALLEST of
     the sizes that came back. The middle one has the least room by
     construction — it is the only one boxed in on both sides — so fitting each
     independently left it visibly smaller than its neighbours, and three
     labels in one row at two different sizes reads as a mistake rather than as
     a hierarchy. One size for the row; the row is one thing. */
  const placed = Array.from({ length: STRANDS }, (_, j) => {
    const at = heads[j] ?? F.cx
    const gapL = j > 0 ? at - (heads[j - 1] ?? F.x) : Infinity
    const gapR = j < STRANDS - 1 ? (heads[j + 1] ?? F.x + F.w) - at : Infinity
    const first = j === 0
    const last = j === STRANDS - 1
    // the ends turn outward and run into the empty frame either side; only the
    // middle is centred on its own strand
    const align: 'left' | 'right' | 'center' = first ? 'right' : last ? 'left' : 'center'
    const anchor = first ? at + gapR * 0.42 : last ? at - gapL * 0.42 : at
    const room = first
      ? anchor - F.x
      : last
        ? F.x + F.w - anchor
        : Math.min(gapL, gapR) * 0.8
    const text = (C.fields[j] ?? '').toUpperCase()
    return { text, align, anchor, size: fitTracked(ctx, text, Math.max(14, room), S.micro, 0.22, 'mono', 500).size }
  })
  const size = placed.reduce((n, p) => Math.min(n, p.size), S.micro)
  setFont(ctx, size, 'mono', 500)

  for (let j = 0; j < STRANDS; j++) {
    const p = placed[j]
    if (!p) continue
    const a = ease(range(t, GROW_A + j * GROW_STEP, GROW_A + j * GROW_STEP + 0.7))
    if (a <= 0.004) continue
    ctx.fillStyle = withAlpha(FIELD_COLOUR[j] ?? PALETTE.buffCss, 0.88 * a)
    drawTracked(ctx, p.text, p.anchor, labelY, size * 0.22, p.align)
  }
  ctx.textBaseline = 'alphabetic'

  /* ---------------- the point they arrive at ---------------- */
  const nodeK = easeOut(range(t, NODE_A, NODE_A + 0.8))
  if (nodeK > 0.004) {
    const end = pointAtV(0, 1)
    softDot(ctx, end.x, end.y, F.s * 0.09 * nodeK, PALETTE.glowCss, 0.32 * nodeK)
    ctx.strokeStyle = withAlpha(PALETTE.amberLitCss, 0.6 * nodeK)
    ctx.lineWidth = hw
    ring(ctx, end.x, end.y, F.s * 0.022 * nodeK)
    ctx.fillStyle = withAlpha(PALETTE.amberLitCss, 0.95 * nodeK)
    disc(ctx, end.x, end.y, Math.max(2, F.s * 0.009))
  }
}

export const act3: Act = {
  id: 'act3',
  duration: DURATION,
  chapter: C.chapter,
  caption: C.caption,
  draw,
}

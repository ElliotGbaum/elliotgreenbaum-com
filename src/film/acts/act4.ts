/**
 * ACT 4 — Real estate.
 *
 * The first of the two internships, and the two of them are drawn as siblings
 * on purpose: a head, a firm in mono under it, and a picture of the work. Both
 * used to close on a generous line at the foot and both lines were cut — see
 * `_learn` in src/content/film.json — so both acts are picture and title now,
 * and this one ends when the skyline is lit rather than a beat after somebody
 * comments on it. Act 5 draws a model filling in and a deal closing. This one
 * draws BUILDINGS, because that is the honest answer to what a real estate
 * investment firm is looking at all day, and because a viewer thirty units away
 * knows a skyline in one frame and would need to be told what anything more
 * clever was.
 *
 * SO THE PICTURE IS A BLOCK GOING UP, IN THREE MOVES:
 *
 *   ONE: THE GROUND. A rule sweeps out under everything, because a tower with
 *   no ground under it is a bar chart. It is the same mark act 6's curve leaves
 *   from, and it means the same thing — this is where the thing starts.
 *
 *   TWO: THE TOWERS. Six of them rise out of that line, staggered, each with a
 *   lit top face and a lit right side — the extrusion in src/film/timeline.ts,
 *   one light, up and to the left, which is where the projector's lamp is. Flat
 *   rectangles are a bar chart no matter how you space them; the second face is
 *   the entire difference between a chart and a city.
 *
 *   THREE: THE WINDOWS. They come on in reading order across the whole skyline
 *   rather than tower by tower, so the block fills the way a street does at
 *   dusk instead of the way a progress bar does. This is the beat that turns
 *   six extruded boxes into buildings, and it is the cheapest thing in the act.
 *
 * The heights are FIXED, not random. `rand` is deterministic here so the
 * skyline is the same skyline on every viewing, and it is written as a table
 * because a skyline is a composition — the tall one is off-centre, its
 * neighbours step down away from it, and there is a low one at each end so the
 * row has shoulders.
 */

import { PALETTE, ease, easeOut, range } from '../../core/contract'
import type { Act, ActRenderContext } from '../../core/contract'
import {
  RAMP,
  block,
  disc,
  faceOffset,
  fitText,
  frameOf,
  hair,
  halo,
  header,
  reset,
  scale,
  softDot,
  subhead,
  wash,
  withAlpha,
} from '../timeline'
import copy from '../../content/film.json'

const C = copy.act4
/**
 * 7.2, down from 9.4. The old runtime was sized around the line at the foot:
 * it landed at 5.0 and the act ran to 9.4 so there was time to read it. The
 * line is gone, so the last thing that moves is the windows finishing at
 * WIN_A + WIN_RUN + 0.4 = 6.2 — on every frame shape now, which it was not
 * before; see WIN_RUN. A second of lit skyline after that is the hold, and it
 * is deliberate: the act ends on the picture instead of on a sentence.
 */
const DURATION = 7.2

/**
 * The skyline, as heights in fractions of the band and widths in fractions of
 * a slot. Six towers: a low one at each end, the tallest a third of the way in.
 */
const TOWERS: ReadonlyArray<readonly [number, number]> = [
  [0.42, 0.78],
  [0.68, 0.9],
  [1.0, 0.82],
  [0.6, 0.72],
  [0.84, 0.94],
  [0.5, 0.8],
]

/* ---- beats ---- */
const GROUND_A = 0.8
const RISE_A = 1.3
/** each tower starts this long after the one to its left */
const RISE_STEP = 0.22
const RISE_RUN = 0.9
/** the windows, in reading order across the whole row */
const WIN_A = 3.2
/**
 * How long the whole skyline takes to light, START TO FINISH — not how long
 * one window waits behind the one before it.
 *
 * It was a per-window delay of 0.055s, and that is a bug the moment you turn
 * the phone upright. The row count per tower is `b.h / (cw * 1.35)`, so it is
 * a function of the BAND'S PROPORTIONS: a wide frame gets about 47 windows and
 * a 390x700 one gets about 240. At a fixed delay each, the wide frame finished
 * lighting at 5.8s and the phone at 16.4s — four times the length of the act,
 * so on a phone the skyline was still filling in when the act cut, and always
 * had been. The step is DERIVED from the count now, so the block lights over
 * the same two and a half seconds on every frame shape and the act settles at
 * the same moment everywhere, which is what lets DURATION be a number at all.
 */
const WIN_RUN = 2.6
/** and the line, if there is one — blank in the copy, so normally there is not */
const LEARN_A = 5.0

function draw(c: ActRenderContext): void {
  const { ctx, w, h, t } = c
  reset(ctx)

  const F = frameOf(w, h)
  const S = scale(F)
  const hw = hair(F)
  wash(ctx, w, h, 0.85)

  const hy = header(ctx, F, S, C.index, C.heading, easeOut(range(t, -0.3, 0.7)))
  const subY = subhead(ctx, F, S, hy, C.firm, ease(range(t, 0.8, 0.8 + RAMP)))
  const headBot = subY + S.micro * 1.2

  /* ---------------- the band ---------------- */
  const footY = F.y + F.h * 0.985
  const top = headBot + S.body * 0.5
  const bot = footY - S.body * 2.4
  const bandH = Math.max(30, bot - top)

  const gx = F.x + F.w * 0.06
  const gw = F.w * 0.88
  const slot = gw / TOWERS.length
  /** how tall the tallest tower is allowed to be */
  const tall = bandH * 0.92
  /** the depth of the extrusion — a hint, not an isometric drawing */
  const d = Math.max(1.5, F.s * 0.012)

  /* ---------------- the ground ---------------- */
  const groundK = easeOut(range(t, GROUND_A, GROUND_A + 1.1))
  if (groundK > 0.004) {
    ctx.fillStyle = withAlpha(PALETTE.sageCss, 0.24)
    ctx.fillRect(gx, bot, gw * groundK, hw)
  }

  /* ---------------- the towers ----------------
     Measured first, all of them, so the windows can be laid out across the
     whole row in reading order rather than tower by tower. */
  const built = TOWERS.map(([height, wide], i) => {
    const bw = slot * wide * 0.82
    const bh = tall * height
    return {
      x: gx + i * slot + (slot - bw) / 2,
      y: bot - bh,
      w: bw,
      h: bh,
      born: RISE_A + i * RISE_STEP,
    }
  })

  for (const b of built) {
    const k = easeOut(range(t, b.born, b.born + RISE_RUN))
    if (k <= 0.004) continue
    const bh = b.h * k
    const y = bot - bh

    // the two lit faces, then the front — the front last, so it sits over them
    block(ctx, b.x, y, b.w, bh, d * k, PALETTE.amberCss, 0.3)

    const g = ctx.createLinearGradient(b.x, y, b.x, bot)
    g.addColorStop(0, withAlpha(PALETTE.buffCss, 0.1))
    g.addColorStop(1, withAlpha(PALETTE.buffCss, 0.03))
    ctx.fillStyle = g
    ctx.fillRect(b.x, y, b.w, bh)

    ctx.strokeStyle = withAlpha(PALETTE.buffCss, 0.42)
    ctx.lineWidth = hw
    ctx.strokeRect(b.x, y, b.w, bh)
  }

  /* ---------------- the windows ----------------
     Three across every tower, as many rows as its height will take, and the
     whole row is walked in reading order so the block lights up as one thing.
     A window is a small filled square: at this size an outlined one is a grey
     smudge, and three of them in a row is a grille. */
  const COLS = 3
  /* Counted before any are drawn, because the delay between one window and the
     next is WIN_RUN split across all of them — see WIN_RUN. */
  const rowsOf = built.map((b) => Math.max(2, Math.round(b.h / ((b.w / COLS) * 1.35))))
  const slots = rowsOf.reduce((sum, rows) => sum + rows * COLS, 0)
  const winStep = WIN_RUN / Math.max(1, slots)

  let n = 0
  for (let i = 0; i < built.length; i++) {
    const b = built[i]
    if (!b) continue
    const cw = b.w / COLS
    const rows = rowsOf[i] as number
    const rh = b.h / rows
    const sq = Math.min(cw * 0.42, rh * 0.42)
    for (let r = 0; r < rows; r++) {
      for (let cc = 0; cc < COLS; cc++) {
        const at = WIN_A + n * winStep
        n++
        const k = ease(range(t, at, at + 0.4))
        if (k <= 0.004) continue
        // every fifth one stays dark. A fully lit block is a keypad.
        if ((r * COLS + cc + i) % 5 === 4) continue
        const x = b.x + cc * cw + (cw - sq) / 2
        const y = b.y + r * rh + (rh - sq) / 2
        ctx.fillStyle = withAlpha(PALETTE.amberLitCss, 0.72 * k)
        ctx.fillRect(x, y, sq, sq)
      }
    }
  }

  /* ---------------- the one lit roof ----------------
     The tallest tower gets a point of light on its top face, which is the mark
     that says somebody is looking at this row of buildings rather than living
     in it — the same node the other acts put over the thing they are about. */
  const roofK = easeOut(range(t, WIN_A + 1.6, WIN_A + 2.6))
  const tallest = built.reduce((a, b) => (b.h > a.h ? b : a), built[0] as (typeof built)[number])
  if (roofK > 0.004 && tallest) {
    const o = faceOffset(d)
    const rx = tallest.x + tallest.w / 2 + o.x / 2
    const ry = tallest.y + o.y / 2 - S.body * 0.7 * roofK
    softDot(ctx, rx, ry, F.s * 0.07 * roofK, PALETTE.glowCss, 0.34 * roofK)
    ctx.strokeStyle = withAlpha(PALETTE.amberCss, 0.5 * roofK)
    ctx.lineWidth = hw
    ctx.beginPath()
    ctx.moveTo(rx, tallest.y + o.y / 2)
    ctx.lineTo(rx, ry)
    ctx.stroke()
    ctx.fillStyle = withAlpha(PALETTE.amberLitCss, 0.95 * roofK)
    disc(ctx, rx, ry, Math.max(2, F.s * 0.011) * roofK)
  }

  /* ---------------- the line ----------------
     Skipped whole when the copy is blank, which it is: an empty string still
     measures, still haloes and still costs a fitText every frame, and the act
     is a beat shorter now precisely because nothing lands here. */
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const learnA = C.learn ? ease(range(t, LEARN_A, LEARN_A + RAMP)) : 0
  if (learnA > 0.004) {
    const size = fitText(ctx, C.learn, F.w * 0.96, S.body * 1.2, 'display', 400)
    halo(ctx, PALETTE.glowCss, size * 0.5, 0.18 * learnA, () => {
      ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.94 * learnA)
      ctx.fillText(C.learn, F.cx, footY)
    })
  }
  ctx.textAlign = 'left'
}

export const act4: Act = {
  id: 'act4',
  duration: DURATION,
  chapter: C.chapter,
  caption: C.caption,
  draw,
}

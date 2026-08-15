/**
 * ACT 5 — Banking.
 *
 * THE PYRAMID IS GONE, and it deserved to be. The act used to draw a
 * four-rank org chart, walk one piece of work up it hop by hop, and then
 * collapse the ten boxes into a single flat rank. As a piece of animation it
 * was the best thing in the film — one object, rearranged, arguing without a
 * word of complaint. As a picture of INVESTMENT BANKING it said nothing at
 * all. It was a picture of hierarchy. Hierarchy is every large company that
 * has ever existed, and a viewer looking at it has to be told, in type, which
 * industry they are looking at.
 *
 * SO THE ACT DRAWS THE JOB INSTEAD — THE MODEL, and only the model. A grid
 * rules itself out, a header row of periods lands in amber, and then thirty
 * cells fill in reading order — right-aligned bars, because that is what a
 * column of numbers looks like — and a heavier total row lights underneath with
 * a bracket and one number to the right of it. Nobody has to be told what a
 * spreadsheet is. It is five seconds of an analyst's whole summer, and it is
 * unmistakable at a glance from thirty units away, which the pyramid never was.
 *
 * THERE WAS A SECOND BEAT AND IT IS GONE. The model handed off at 6.8 to THE
 * DEAL: two blocks arriving from opposite edges of the frame, closing the gap
 * between them and locking into one under a bracket with a lit node above it —
 * what the model was FOR. It was a good picture and it cost four and a half
 * seconds, which made this the longest act in the middle of the film by a wide
 * margin. Act 4 says what the real estate job was in 7.2 seconds; this one took
 * 11.2 to say a job the film is passing through. The model alone is the job, so
 * the model alone is the act, and it now runs alongside act 4 instead of
 * doubling it.
 *
 * THERE IS NO COPY AT THE FOOT ANY MORE. The act used to close on two lines —
 * that he learned a great deal at a good firm, and then that he wanted more
 * autonomy next — in that order, deliberately, so the generous half was said
 * first. He cut both, so the act is now the two pictures and nothing else, and
 * the order it was protecting no longer exists to get wrong. What it leaves
 * behind is a film that states the turn toward AI in act 6 rather than closing
 * act 5 with it; act 6 opens on senior year and takes the weight.
 */

import { PALETTE, ease, easeOut, rand, range } from '../../core/contract'
import type { Act, ActRenderContext } from '../../core/contract'
import type { Frame, TypeScale } from '../timeline'
import {
  RAMP,
  disc,
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

const C = copy.act5
/**
 * 7.6, down from 11.2, which was down from 14.0. The deal beat took the last
 * four and a half seconds with it when it went; what is left is the model
 * drawing itself, the number landing at 6.1, and a beat and a half to look at
 * the finished sheet. Act 4 runs 7.2, which is the length this act was meant to
 * be sitting next to all along.
 */
const DURATION = 7.6

/** the model. Six periods across, five line items down, then a total. */
const COLS = 6
const ROWS = 5

/* ---- beat one: the model ---- */
const RULE_A = 0.9
const RULE_RUN = 1.2
const HEAD_A = 1.5
const CELL_A = 1.9
/** one cell every this many seconds, in reading order */
const CELL_STEP = 0.078
const TOTAL_A = 4.7
const NUMBER_A = 5.3

/* ---- the lines ----
   BOTH ARE BLANK IN THE COPY and the act skips them, so these are cues for the
   restore path rather than beats that fire today. They are kept in step with
   the runtime — learn lands while the model is still filling and leaves as the
   act closes — so putting the string back in film.json gives a line that is
   cued rather than one that arrives at the cut. `turn` is the last thing said
   in the act and it wants room after it that a 7.6-second act does not have:
   restoring it means lengthening DURATION by about three seconds as well. */
const LEARN_A = 4.4
const LEARN_OUT = 7.2
const TURN_A = 6.4

/* ==================================================================== *
 * Beat one — the model
 * ==================================================================== */
function beatModel(
  ctx: CanvasRenderingContext2D,
  F: Frame,
  S: TypeScale,
  t: number,
  hw: number,
  headBot: number,
  a: number,
): void {
  if (a <= 0.004) return

  const footY = F.y + F.h * 0.985
  const gx = F.x + F.w * 0.09
  // the right tenth is left clear for the bracket and the number, which hang
  // off the total row rather than sitting inside the last column
  const gw = F.w * 0.72
  const top = headBot + S.micro * 1.1
  const bot = footY - S.body * 2.5
  const avail = Math.max(20, bot - top)
  // 0.62, not 0.52. A model is a tall block of figures; at half its own width
  // it sat in the middle of the band with a third of the frame empty under it.
  const gh = Math.min(avail, gw * 0.62)
  const gy = top + (avail - gh) / 2

  /** the header row and the total row are each worth one row of height */
  const cw = gw / COLS
  const ch = gh / (ROWS + 2)
  const bodyTop = gy + ch
  const totalY = bodyTop + ROWS * ch

  /* ---------------- the rules ----------------
     Horizontals sweep right, verticals drop down, staggered — a grid that
     fades in as one is a texture, a grid that RULES ITSELF is somebody
     setting up a sheet. */
  ctx.fillStyle = withAlpha(PALETTE.sageCss, 0.22 * a)
  for (let r = 0; r <= ROWS; r++) {
    const k = easeOut(range(t, RULE_A + r * 0.06, RULE_A + RULE_RUN * 0.55 + r * 0.06))
    if (k <= 0.004) continue
    ctx.fillRect(gx, bodyTop + r * ch, gw * k, hw)
  }
  for (let c = 0; c <= COLS; c++) {
    const k = easeOut(range(t, RULE_A + 0.3 + c * 0.05, RULE_A + RULE_RUN + c * 0.05))
    if (k <= 0.004) continue
    ctx.fillRect(gx + c * cw, bodyTop, hw, ROWS * ch * k)
  }

  /* ---------------- the header row: the periods ----------------
     Short amber dashes rather than years. A model's column heads are the one
     place a real number would be readable at this size, and a real number is
     a claim about a deal that is not ours to print.
     See the house rule at the top of src/content/film.json. */
  for (let c = 0; c < COLS; c++) {
    const k = ease(range(t, HEAD_A + c * 0.07, HEAD_A + 0.45 + c * 0.07))
    if (k <= 0.004) continue
    const dw = cw * 0.34
    ctx.fillStyle = withAlpha(PALETTE.amberCss, 0.7 * k * a)
    ctx.fillRect(gx + (c + 1) * cw - dw - cw * 0.16, gy + ch * 0.55, dw, Math.max(1, hw * 1.6))
  }

  /* ---------------- the cells ----------------
     RIGHT-ALIGNED, which is the whole tell. Left-aligned bars of varying
     length are a bar chart; right-aligned ones are a column of figures, and
     the ragged left edge they make is what a spreadsheet looks like from
     across a room. */
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const n = r * COLS + c
      const k = ease(range(t, CELL_A + n * CELL_STEP, CELL_A + 0.34 + n * CELL_STEP))
      if (k <= 0.004) continue
      const wide = cw * (0.3 + rand(n * 3 + 7) * 0.42)
      const right = gx + (c + 1) * cw - cw * 0.16
      const y = bodyTop + r * ch + ch * 0.52
      ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.5 * k * a)
      ctx.fillRect(right - wide * k, y, wide * k, Math.max(1, hw * 1.5))
    }
  }

  /* ---------------- the total row ---------------- */
  const totalK = easeOut(range(t, TOTAL_A, TOTAL_A + 0.7))
  if (totalK > 0.004) {
    // the double rule above a total, which is the one piece of spreadsheet
    // grammar everybody knows
    ctx.fillStyle = withAlpha(PALETTE.amberCss, 0.55 * totalK * a)
    ctx.fillRect(gx, totalY - hw * 2.4, gw * totalK, hw)
    ctx.fillRect(gx, totalY - hw * 0.6, gw * totalK, hw)

    for (let c = 0; c < COLS; c++) {
      const k = ease(range(t, TOTAL_A + 0.25 + c * 0.06, TOTAL_A + 0.6 + c * 0.06))
      if (k <= 0.004) continue
      const wide = cw * (0.4 + rand(c * 5 + 31) * 0.3)
      const right = gx + (c + 1) * cw - cw * 0.16
      ctx.fillStyle = withAlpha(PALETTE.amberLitCss, 0.85 * k * a)
      ctx.fillRect(right - wide, totalY + ch * 0.42, wide, Math.max(1.5, hw * 2.2))
    }
  }

  /* ---------------- the bracket, and the one number it points at ---------- */
  const numK = easeOut(range(t, NUMBER_A, NUMBER_A + 0.8))
  if (numK > 0.004) {
    const bx = gx + gw + F.w * 0.02
    const y0 = totalY - ch * 0.5
    const y1 = totalY + ch * 0.9
    const tick = F.w * 0.014
    ctx.strokeStyle = withAlpha(PALETTE.amberCss, 0.6 * numK * a)
    ctx.lineWidth = hw
    ctx.beginPath()
    ctx.moveTo(bx + tick, y0)
    ctx.lineTo(bx, y0 + (y1 - y0) * 0.5 * numK)
    ctx.moveTo(bx + tick, y1)
    ctx.lineTo(bx, y1 - (y1 - y0) * 0.5 * numK)
    ctx.stroke()

    const nx = Math.min(F.x + F.w - F.s * 0.02, bx + F.w * 0.05)
    softDot(ctx, nx, (y0 + y1) / 2, F.s * 0.055 * numK, PALETTE.glowCss, 0.35 * numK * a)
    ctx.fillStyle = withAlpha(PALETTE.amberLitCss, 0.95 * numK * a)
    disc(ctx, nx, (y0 + y1) / 2, Math.max(2, F.s * 0.011) * numK)
  }

}

function draw(c: ActRenderContext): void {
  const { ctx, w, h, t } = c
  reset(ctx)

  const F = frameOf(w, h)
  const S = scale(F)
  const hw = hair(F)
  wash(ctx, w, h, 0.85)

  /* The firm used to be drawn inside beat one, in that beat's own alpha, which
     meant it left the screen with the model — so the name of the place he did
     this at was gone for the whole of the beat about what the work was FOR. It
     is a standing subtitle now, hung off the head by the same routine the date
     at UPenn and the firm in act 4 use, and it is up for the whole act. */
  const hy = header(ctx, F, S, C.index, C.heading, easeOut(range(t, -0.3, 0.7)))
  const subY = subhead(ctx, F, S, hy, C.firm, ease(range(t, 0.8, 0.8 + RAMP)))
  const headBot = subY + S.micro * 1.2

  /* The model is up for the whole act now — it used to be faded out at 6.8 to
     hand the frame to the deal, and with the deal gone there is nothing to hand
     it to. It holds, finished, and the cut takes it. */
  beatModel(ctx, F, S, t, hw, headBot, 1)

  /* ---------------- the lines ---------------- */
  const footY = F.y + F.h * 0.985
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  const learnA = C.learn
    ? ease(range(t, LEARN_A, LEARN_A + RAMP)) * (1 - ease(range(t, LEARN_OUT, LEARN_OUT + 0.55)))
    : 0
  if (learnA > 0.004) {
    const size = fitText(ctx, C.learn, F.w * 0.96, S.body * 1.2, 'display', 400)
    halo(ctx, PALETTE.glowCss, size * 0.5, 0.18 * learnA, () => {
      ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.94 * learnA)
      ctx.fillText(C.learn, F.cx, footY)
    })
  }

  const turnA = C.turn ? ease(range(t, TURN_A, TURN_A + RAMP)) : 0
  if (turnA > 0.004) {
    fitText(ctx, C.turn, F.w * 0.96, S.body, 'display', 400)
    ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.94 * turnA)
    ctx.fillText(C.turn, F.cx, footY)
  }

  ctx.textAlign = 'left'
}

export const act5: Act = {
  id: 'act5',
  duration: DURATION,
  chapter: C.chapter,
  caption: C.caption,
  draw,
}

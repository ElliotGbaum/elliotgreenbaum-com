/**
 * ACT 1 — Curious.
 *
 * ONE PICTURE, and that is the change that rebuilt this act.
 *
 * It used to be two beats. Beat A drew a boy with his chin on his fist and two
 * enormous free-standing chess pieces beside him; beat B threw that away and
 * built a real eight-by-eight board in code, with five moves of a real game
 * traced across it in amber. Both were good. Together they were two chess
 * animations back to back, and the second one started four seconds after
 * anybody had finished working out what the first one was.
 *
 * The board is in the DRAWING now — see src/film/sketches/chess.ts — and the
 * code beat is gone, along with the move list, the square-by-square build and
 * the crossfade between them. What is left is a single sketch that draws
 * itself for four seconds and two lines that hand the frame to each other
 * under it. Half the code, one idea.
 *
 * The closing line is the longest sentence in the film and it is allowed to
 * wrap. It arrives a line at a time, half a second apart, which is both the
 * thing that keeps the last third of the act moving and the way a person
 * actually says it.
 */

import { PALETTE, clamp, ease, easeOut, range } from '../../core/contract'
import type { Act, ActRenderContext } from '../../core/contract'
import {
  CROSSFADE,
  RAMP,
  disc,
  drawLines,
  frameOf,
  hair,
  header,
  reset,
  scale,
  setFont,
  softDot,
  wash,
  withAlpha,
  wrapText,
} from '../timeline'
import { drawSketch, prepare } from '../sketch'
import { CHESS } from '../sketches/chess'
import copy from '../../content/film.json'

const C = copy.act1
/**
 * 12.6, up from 11.0, which was up from 9.2. The chess caption used to be five
 * words ("Winning chess tournaments, age 5") set on one line; it is a whole
 * sentence now, it wraps, and a two-line caption that arrives and starts
 * leaving inside two and a half seconds is a caption nobody reads. Both of the
 * lines at the foot moved later and the act grew by the difference. Eight
 * tenths went onto each of them again after that — both sentences are long
 * enough to want a second pass, and neither was getting one.
 */
/* 12.3, down from 12.6. The second half of the closing line settles at 8.9, so
   the last three and a half seconds are a held frame; three tenths came off the
   hold and nothing arrives any earlier than it did. */
const DURATION = 12.3

const SCENE = prepare(CHESS)

/** the pen runs across these seconds — two dozen strokes is a long draw */
const SKETCH_A = 0.5
const SKETCH_B = 4.3

/** the caption under the picture, and then the line that replaces it */
const CHESS_A = 3.0
/** its own wrapped lines arrive this far apart */
const CHESS_STEP = 0.4
const CHESS_OUT = 7.4
const CLOSE_A = 7.7
/** how far apart the two wrapped halves of the closing line arrive */
const CLOSE_STEP = 0.5

function draw(c: ActRenderContext): void {
  const { ctx, w, h, t, reduced } = c
  reset(ctx)

  const F = frameOf(w, h)
  const S = scale(F)
  const hw = hair(F)
  wash(ctx, w, h, 0.85)

  // opens from before t=0 so the cut into this act is never a black frame
  const hy = header(ctx, F, S, C.index, C.heading, easeOut(range(t, -0.3, 0.7)))

  /* ---------------- the foot, and therefore the picture ----------------
     BOTH lines at the foot wrap now, and the room they need is MEASURED before
     the picture is sized — off whichever of the two is taller, since they hold
     the frame one after the other and the picture may not move between them.
     Hung off a fixed fraction of the frame instead, the second line lands
     under the bottom of the screen on exactly the windows nobody tests. */
  const footY = F.y + F.h * 0.99
  setFont(ctx, S.body, 'display', 400)
  const closeLines = wrapText(ctx, C.close, F.w * 0.94)
  const chessLines = wrapText(ctx, C.chess, F.w * 0.94)
  const lh = S.body * 1.34
  /** the top of a block of `n` lines whose last line sits on the foot */
  const topOf = (n: number): number => footY - (n - 1) * lh
  const capTop = topOf(Math.max(closeLines.length, chessLines.length))

  const bandTop = hy + S.micro * 1.1
  const bandBot = capTop - S.body * 1.5
  const bandH = Math.max(28, bandBot - bandTop)

  /* ---------------- the picture ---------------- */
  const picA = easeOut(range(t, 0.3, 1.0))
  if (picA > 0.004) {
    const box = { x: F.cx - F.w * 0.47, y: bandTop, w: F.w * 0.94, h: bandH * 0.99 }
    drawSketch(ctx, SCENE, box, clamp(range(t, SKETCH_A, SKETCH_B)), {
      alpha: 0.9 * picA,
      hair: hw,
      color: PALETTE.buffCss,
      pen: reduced
        ? undefined
        : (p) => {
            softDot(ctx, p.x, p.y, bandH * 0.11, PALETTE.glowCss, 0.45 * picA)
            ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.95 * picA)
            disc(ctx, p.x, p.y, hw * 1.4)
          },
    })
  }

  /* ================================================================ *
   * The lines at the foot. One at a time, always.
   * ================================================================ */
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  /* the chess line, a wrapped line at a time and then away as one — bottom
     aligned onto the foot off its OWN line count, so a caption that wraps to
     two on a narrow window grows upward into the picture's room rather than
     printing its second line off the bottom of the screen */
  setFont(ctx, S.body, 'display', 400)
  const chessOut = 1 - ease(range(t, CHESS_OUT, CHESS_OUT + CROSSFADE))
  const chessTop = topOf(chessLines.length)
  let ci = 0
  for (const line of chessLines) {
    const a = ease(range(t, CHESS_A + ci * CHESS_STEP, CHESS_A + RAMP + ci * CHESS_STEP)) * chessOut
    if (a > 0.004) {
      ctx.fillStyle = withAlpha(PALETTE.sageCss, 0.92 * a)
      drawLines(ctx, [line], F.cx, chessTop + ci * lh, lh, 'center')
    }
    ci++
  }

  /* the close, a wrapped line at a time — the only thing moving in the last
     third of the act, which is the whole reason it is staged rather than
     drawn in one go */
  setFont(ctx, S.body, 'display', 400)
  const closeTop = topOf(closeLines.length)
  let li = 0
  for (const line of closeLines) {
    const a = ease(range(t, CLOSE_A + li * CLOSE_STEP, CLOSE_A + RAMP + li * CLOSE_STEP))
    if (a > 0.004) {
      ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.92 * a)
      drawLines(ctx, [line], F.cx, closeTop + li * lh, lh, 'center')
    }
    li++
  }

  ctx.textAlign = 'left'
}

export const act1: Act = {
  id: 'act1',
  duration: DURATION,
  chapter: C.chapter,
  caption: C.caption,
  draw,
}

/**
 * ACT 7 — Teaching himself.
 *
 * ONE SENTENCE AND ONE DRAWING, and nothing else at all. It is the quietest act
 * in the film and it is deliberately so: it sits between the year AI took off
 * and the thing he built with it, and what happened in between is a person at a
 * desk, on his own, for months. A picture of that does not want a second line
 * of type under it explaining it.
 *
 * THERE IS NO CAPTION AT THE FOOT. The heading says "I began teaching myself
 * about it, learning and building with it" and the drawing under it shows
 * exactly that, so a caption would be the film reading itself out loud. The
 * whole frame below the head belongs to the picture, which is why the drawing
 * lands bigger here than in any other act.
 *
 * THE FIGURE IS THE CHESS BOY GROWN UP — same profile, same eye, same pen, at
 * adult proportions and with both hands down on a keyboard instead of one under
 * his chin. That rhyme is the reason the act works at four seconds: a viewer
 * has already met this person, six acts ago, working something out. See
 * src/film/sketches/desk.ts.
 */

import { clamp, easeOut, range } from '../../core/contract'
import { INK } from '../palette'
import type { Act, ActRenderContext } from '../../core/contract'
import {
  disc,
  frameOf,
  hair,
  header,
  reset,
  scale,
  softDot,
  wash,
  withAlpha,
} from '../timeline'
import { drawSketch, prepare } from '../sketch'
import { DESK } from '../sketches/desk'
import copy from '../../content/film.json'

const C = copy.act7
/**
 * 7.2, down from 7.9. The pen lifts at 5.0, so the tail here is nothing but a
 * finished drawing being looked at, and 2.9 seconds of it was past the point
 * where the hold stops reading as a held picture and starts reading as a stall
 * — the act had said everything it says and the film was waiting on it. 2.2
 * seconds is a look; the beats themselves are untouched, which is the only way
 * to shorten this act without making the pen hurry.
 */
const DURATION = 7.2

const SCENE = prepare(DESK)

/** the pen runs across these seconds */
const SKETCH_A = 0.6
const SKETCH_B = 5.0

function draw(c: ActRenderContext): void {
  const { ctx, w, h, t, reduced } = c
  reset(ctx)

  const F = frameOf(w, h)
  const S = scale(F)
  const hw = hair(F)
  wash(ctx, w, h, 0.85)

  // opens from before t=0 so the cut into this act is never a black frame
  const hy = header(ctx, F, S, C.index, C.heading, easeOut(range(t, -0.3, 0.7)))

  /* ---------------- the picture, and it gets everything ----------------
     No foot to reserve room for, so the band runs from under the head to the
     bottom of the frame. */
  const bandTop = hy + S.body * 0.9
  const bandBot = F.y + F.h * 0.99
  const bandH = Math.max(28, bandBot - bandTop)

  const picA = easeOut(range(t, 0.4, 1.1))
  if (picA > 0.004) {
    const box = { x: F.cx - F.w * 0.47, y: bandTop, w: F.w * 0.94, h: bandH }
    drawSketch(ctx, SCENE, box, clamp(range(t, SKETCH_A, SKETCH_B)), {
      alpha: 0.9 * picA,
      hair: hw,
      color: INK.text,
      pen: reduced
        ? undefined
        : (p) => {
            softDot(ctx, p.x, p.y, bandH * 0.1, INK.glow, 0.45 * picA)
            ctx.fillStyle = withAlpha(INK.text, 0.95 * picA)
            disc(ctx, p.x, p.y, hw * 1.4)
          },
    })
  }
}

export const act7: Act = {
  id: 'act7',
  duration: DURATION,
  chapter: C.chapter,
  caption: C.caption,
  draw,
}

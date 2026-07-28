/**
 * ACT 4 — Why startups.
 *
 * One idea: separate threads converge into one shape.
 * Five words sit in a column; each one draws itself out into a curve, and all
 * five arrive at the same point and leave it as a single line. The words
 * become the picture, so nothing has to be labelled twice.
 *
 * Two beats, dissolved: the picture, then the claim. They used to be drawn on
 * top of one another — five word rows and four lines of body copy competing
 * for the same 60 vertical points — which on a short frame put the claim
 * straight through the threads. The picture now hands the frame over.
 */

import { PALETTE, ease, easeOut, range } from '../../core/contract'
import type { Act, ActRenderContext } from '../../core/contract'
import type { Pt } from '../timeline'
import {
  bezier,
  disc,
  drawLines,
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
  trackedWidth,
  wash,
  withAlpha,
  wrapText,
} from '../timeline'
import copy from '../../content/film.json'

const C = copy.act4
const DURATION = 14

const THREAD_IN = 0.6
const THREAD_STAGGER = 0.34
const THREAD_RUN = 3.0
const MERGE_A = 5.9
const MERGE_B = 7.2

/** the picture hands the frame to the claim here */
const HAND_A = 8.4
const HAND_B = 9.2

function draw(c: ActRenderContext): void {
  const { ctx, w, h, t } = c
  reset(ctx)

  const F = frameOf(w, h)
  const S = scale(F)
  const hw = hair(F)
  wash(ctx, w, h, 0.85)

  // opens from before t=0 so the cut into this act is never a black frame
  const hy = header(ctx, F, S, C.index, C.heading, easeOut(range(t, -0.3, 0.7)))

  /* ---- beat one: the threads ---- */
  const picA = 1 - ease(range(t, HAND_A, HAND_B))
  if (picA > 0.004) {
    const threads = C.threads
    const n = Math.max(1, threads.length)
    const rowTop = hy + S.micro * 1.3
    const rowBot = F.y + F.h * 0.93
    const step = n > 1 ? (rowBot - rowTop) / (n - 1) : 0
    const meet: Pt = { x: F.x + F.w * 0.72, y: (rowTop + rowBot) / 2 }
    const endX = F.x + F.w * 0.94
    // a word may never grow far enough right to reach the convergence point
    const wordMax = (meet.x - F.x) * 0.56

    ctx.textBaseline = 'middle'
    ctx.lineCap = 'round'

    let i = 0
    for (const word of threads) {
      const y = rowTop + i * step
      const start = THREAD_IN + i * THREAD_STAGGER
      const k = easeOut(range(t, start, start + THREAD_RUN))
      const wordA = easeOut(range(t, start - 0.85, start + 0.15)) * picA
      // the second thread is the human one — the film's one cool accent
      const cool = i === 1
      const colour = cool ? PALETTE.mintCss : PALETTE.amberCss
      const fit = fitTracked(ctx, word, wordMax, S.micro, 0.18, 'mono', 400)

      if (wordA > 0.004) {
        ctx.fillStyle = withAlpha(cool ? PALETTE.mintCss : PALETTE.sageCss, 0.78 * wordA)
        drawTracked(ctx, word, F.x, y, fit.track, 'left')
      }

      if (k > 0.004) {
        const x0 = F.x + trackedWidth(ctx, word, fit.track) + S.micro * 1.1
        const span = meet.x - x0
        const pts = bezier(
          { x: x0, y },
          { x: x0 + span * 0.42, y },
          { x: meet.x - span * 0.34, y: meet.y + (y - meet.y) * 0.1 },
          meet,
          36,
        )
        ctx.strokeStyle = withAlpha(colour, (cool ? 0.6 : 0.4) * (0.7 + 0.3 * k) * picA)
        ctx.lineWidth = hw * (cool ? 1.4 : 1.1)
        const head = drawPath(ctx, pts, k)
        if (head && k < 1) softDot(ctx, head.x, head.y, F.s * 0.022, PALETTE.glowCss, 0.5 * picA)
      }
      i++
    }
    ctx.textBaseline = 'alphabetic'

    /* one line out of five */
    const merge = easeOut(range(t, MERGE_A, MERGE_B))
    if (merge > 0.004) {
      ctx.strokeStyle = withAlpha(PALETTE.amberLitCss, 0.8 * picA)
      ctx.lineWidth = hw * 2.2
      drawPath(ctx, [meet, { x: endX, y: meet.y }], merge)
    }

    /* the shape it becomes */
    const bloom = easeOut(range(t, MERGE_B - 0.2, MERGE_B + 1.0)) * picA
    if (bloom > 0.004) {
      const r = F.s * 0.026 * bloom
      softDot(ctx, endX, meet.y, r * 6, PALETTE.glowCss, 0.34 * bloom)
      ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.96 * bloom)
      disc(ctx, endX, meet.y, r)
      ctx.strokeStyle = withAlpha(PALETTE.amberCss, 0.4 * bloom)
      ctx.lineWidth = hw
      ring(ctx, endX, meet.y, r * 2.4)
    }
    ctx.lineCap = 'butt'
  }

  /* ---- beat two: the claim ----
     Measured, then centred in the band under the head and clamped to the foot
     of the frame. Bottom-anchoring alone left the claim hanging in the last
     fifth of a tall frame with four hundred empty points above it; centring
     alone let it grow into the head on a short one. */
  const lh = S.body * 1.32
  setFont(ctx, S.body, 'display', 400)
  const linesA = wrapText(ctx, C.lineA, F.w * 0.94)
  const linesB = wrapText(ctx, C.lineB, F.w * 0.94)
  const headBot = hy + S.micro * 0.7
  const footY = F.y + F.h * 0.975
  const cap = S.body * 0.72
  const span = (linesA.length - 1) * lh + lh * 1.35 + (linesB.length - 1) * lh
  const slack = Math.max(0, footY - headBot - (span + cap))
  const yA = headBot + cap + slack / 2
  const yB = yA + (linesA.length - 1) * lh + lh * 1.35

  const aA = easeOut(range(t, HAND_B - 0.15, HAND_B + 0.65))
  if (aA > 0.004) {
    ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.94 * aA)
    drawLines(ctx, linesA, F.cx, yA, lh, 'center')
  }
  const bA = ease(range(t, 10.4, 11.4))
  if (bA > 0.004) {
    setFont(ctx, S.body, 'display', 400)
    ctx.fillStyle = withAlpha(PALETTE.sageCss, 0.88 * bA)
    drawLines(ctx, linesB, F.cx, yB, lh, 'center')
  }
}

export const act4: Act = {
  id: 'act4',
  duration: DURATION,
  caption: C.caption,
  draw,
}

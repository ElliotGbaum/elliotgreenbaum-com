/**
 * ACT 5 — The card.
 *
 * The only text-heavy act, and the only one that asks for something. So it
 * holds still: a name, a rule, one line, an address. Everything arrives once
 * and then stops moving.
 *
 * ELLIOT: the two bracketed strings are yours to replace, in
 * src/content/film.json → act5.looking and act5.email.
 */

import { PALETTE, ease, easeOut, range } from '../../core/contract'
import type { Act, ActRenderContext } from '../../core/contract'
import {
  drawLines,
  drawTracked,
  fitText,
  frameOf,
  hair,
  reset,
  scale,
  setFont,
  softDot,
  trackedWidth,
  wash,
  withAlpha,
  wrapText,
} from '../timeline'
import copy from '../../content/film.json'

const C = copy.act5
const DURATION = 12

function draw(c: ActRenderContext): void {
  const { ctx, w, h, t, reduced } = c
  reset(ctx)

  const F = frameOf(w, h)
  const S = scale(F)
  const hw = hair(F)

  // one very slow breath, and nothing else moves
  const breath = reduced ? 1 : 0.94 + 0.06 * Math.sin(t * 0.5)
  wash(ctx, w, h, 0.9 * breath)

  const colW = Math.min(F.w, F.s * 0.94)
  const x = F.cx - colW / 2
  ctx.textBaseline = 'alphabetic'

  /* ---- measure the whole card, then centre it ----
     The card used to be hung off F.cy with fixed offsets, which ran the hint
     line past the bottom of the frame on short, wide frames — straight into
     the subtitle. Measuring first means it is centred at every aspect. */
  const nameSize = fitText(ctx, C.name, colW, S.title * 0.82, 'display', 400)
  setFont(ctx, S.body, 'display', 400)
  const askLines = wrapText(ctx, C.looking, colW)
  const lh = S.body * 1.5

  const capName = nameSize * 0.72
  const gapRule = nameSize * 0.52
  const gapAsk = S.body * 1.75
  const gapMail = S.body * 1.85
  const gapHint = S.body * 2.0
  const blockH =
    capName + gapRule + gapAsk + (askLines.length - 1) * lh + gapMail + gapHint + S.micro * 0.8

  const top = F.cy - blockH / 2
  const nameY = top + capName
  const ruleY = nameY + gapRule
  const askY = ruleY + gapAsk
  const mailY = askY + (askLines.length - 1) * lh + gapMail
  const hintY = mailY + gapHint

  /* name */
  const nameA = easeOut(range(t, -0.3, 0.9))
  if (nameA > 0.004) {
    setFont(ctx, nameSize, 'display', 400)
    softDot(ctx, x + nameSize * 0.2, nameY - nameSize * 0.3, nameSize * 3, PALETTE.glowCss, 0.05 * nameA)
    ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.96 * nameA)
    ctx.fillText(C.name, x, nameY)
  }

  /* rule */
  const ruleK = easeOut(range(t, 1.1, 2.4))
  if (ruleK > 0.004) {
    ctx.fillStyle = withAlpha(PALETTE.amberCss, 0.45)
    ctx.fillRect(x, ruleY, colW * ruleK, hw)
  }

  /* the ask */
  const askA = ease(range(t, 2.2, 3.8))
  if (askA > 0.004) {
    setFont(ctx, S.body, 'display', 400)
    ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.9 * askA)
    drawLines(ctx, askLines, x, askY, lh, 'left')
  }

  /* the address */
  const mailA = ease(range(t, 3.9, 5.3))
  setFont(ctx, S.body * 0.92, 'mono', 400)
  const track = S.body * 0.04
  if (mailA > 0.004) {
    ctx.fillStyle = withAlpha(PALETTE.amberLitCss, 0.95 * mailA)
    drawTracked(ctx, C.email, x, mailY, track, 'left')
    const uK = easeOut(range(t, 4.7, 5.9))
    if (uK > 0.004) {
      ctx.fillStyle = withAlpha(PALETTE.amberCss, 0.5)
      ctx.fillRect(x, mailY + S.body * 0.5, trackedWidth(ctx, C.email, track) * uK, hw)
    }
  }

  /* the quiet line */
  const hintA = ease(range(t, 5.7, 7.1))
  if (hintA > 0.004) {
    setFont(ctx, S.micro, 'mono', 400)
    ctx.fillStyle = withAlpha(PALETTE.sageCss, 0.6 * hintA)
    drawTracked(ctx, C.hint, x, hintY, S.micro * 0.18, 'left')
  }
}

export const act5: Act = {
  id: 'act5',
  duration: DURATION,
  caption: C.caption,
  draw,
}

/**
 * ACT 0 — Title.
 *
 * One idea: the beam strikes a dead screen and the screen comes alive.
 * A seam of light opens into a full frame, and the name resolves out of it —
 * letters arriving one at a time, letter-spacing settling inward.
 */

import { PALETTE, ease, easeOut, range } from '../../core/contract'
import type { Act, ActRenderContext } from '../../core/contract'
import {
  drawTracked,
  drawTrackedEach,
  fitTracked,
  flick,
  frameOf,
  hair,
  reset,
  scale,
  setFont,
  softDot,
  trackedWidth,
  wash,
  withAlpha,
} from '../timeline'
import copy from '../../content/film.json'

const C = copy.act0
const DURATION = 4

const TRACK_OPEN = 0.1 // widest letter-spacing, in ems
const TRACK_SET = 0.014 // where it settles

function draw(c: ActRenderContext): void {
  const { ctx, w, h, t, reduced } = c
  reset(ctx)

  const F = frameOf(w, h)
  const S = scale(F)
  const lamp = reduced ? 1 : flick(t, 0.3)

  /* ---- the gate opens ---- */
  const open = easeOut(range(t, 0.06, 1.05))
  const lit = easeOut(range(t, 0.04, 1.7))
  const gate = h * open

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, h * 0.5 - gate * 0.5, w, gate)
  ctx.clip()
  wash(ctx, w, h, lit * lamp)
  ctx.restore()

  /* ---- the seam of the beam striking ----
     Held a little longer than it used to be: the seam used to be gone by 0.8
     while the first letter was still under 5% alpha, which put a near-black
     frame at t≈0.6 — the very first cut of the film. */
  const seam = (1 - ease(range(t, 0.12, 1.05))) * lamp
  if (seam > 0.004) {
    softDot(ctx, w * 0.5, h * 0.5, Math.max(w, h) * 0.4, PALETTE.glowCss, 0.16 * seam)
    const bw = w * (0.2 + 0.8 * easeOut(range(t, 0, 0.4)))
    const bh = Math.max(1, h * 0.0035)
    const g = ctx.createLinearGradient(w * 0.5 - bw * 0.5, 0, w * 0.5 + bw * 0.5, 0)
    g.addColorStop(0, withAlpha(PALETTE.glowCss, 0))
    g.addColorStop(0.5, withAlpha(PALETTE.glowCss, 0.95 * seam))
    g.addColorStop(1, withAlpha(PALETTE.glowCss, 0))
    ctx.fillStyle = g
    ctx.fillRect(w * 0.5 - bw * 0.5, h * 0.5 - bh * 0.5, bw, bh)
  }

  /* ---- the name ---- */
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  // fitted at its widest tracking, so the settle only ever draws it inward
  const size = fitTracked(ctx, C.title, F.w * 0.96, S.title, TRACK_OPEN, 'display', 400).size

  const settle = ease(range(t, 0.45, 2.3))
  const track = (TRACK_OPEN - (TRACK_OPEN - TRACK_SET) * settle) * size
  const baseline = F.cy + size * 0.3

  // the first letter starts under the seam rather than after it, so the two
  // overlap and the frame is never handed from one to the other empty
  drawTrackedEach(ctx, C.title, F.cx, baseline, track, 'center', PALETTE.buffCss, (i) => {
    const a = ease(range(t, 0.34 + i * 0.032, 0.94 + i * 0.032))
    return a * (0.9 + 0.1 * lamp)
  })

  // one soft flare behind the type as it lands
  const flare = ease(range(t, 0.55, 1.4)) * (1 - ease(range(t, 1.6, 3.2)))
  if (flare > 0.004) {
    softDot(ctx, F.cx, baseline - size * 0.32, size * 3.2, PALETTE.glowCss, 0.07 * flare * lamp)
  }

  /* ---- rule ---- */
  const ruleP = easeOut(range(t, 1.5, 2.6))
  if (ruleP > 0.004) {
    const full = Math.min(F.w * 0.9, trackedWidth(ctx, C.title, track) * 1.02)
    const rw = full * ruleP
    const ry = baseline + size * 0.55
    ctx.fillStyle = withAlpha(PALETTE.amberCss, 0.5 * ruleP)
    ctx.fillRect(F.cx - rw * 0.5, ry, rw, hair(F))
  }

  /* ---- the small line ---- */
  const subA = ease(range(t, 2.3, 3.3))
  if (subA > 0.004 && C.sub) {
    setFont(ctx, S.small, 'mono', 400)
    ctx.fillStyle = withAlpha(PALETTE.sageCss, 0.62 * subA)
    drawTracked(ctx, C.sub, F.cx, baseline + size * 0.55 + S.small * 2.4, S.small * 0.3, 'center')
  }
}

export const act0: Act = {
  id: 'act0',
  duration: DURATION,
  caption: C.caption,
  draw,
}

/**
 * ACT 6 — The wave.
 *
 * A curve leaves the floor and doesn't come back. It is drawn rather than
 * plotted — no axes, no numbers, no gridlines — because the act is not claiming
 * a statistic, it is describing the year senior year turned out to be. What it
 * meant for him is said in one line underneath, and that is the whole act.
 *
 * IT USED TO BE THREE ACTS' WORTH OF MATERIAL IN ONE. The curve, then "I began
 * teaching myself about it", then the NewsGlide card with its features, its
 * address and the one number in the film — all inside thirteen seconds. Every
 * one of those is a beat somebody would slow down for if they were telling you
 * this out loud, and stacked into a single act each one was cut off by the next
 * one arriving: the taught line had a second and a bit of hold, and the card
 * came up on top of it. They are three acts now — this one, act 7 and act 8 —
 * and each holds one idea for as long as it takes to read it.
 *
 * What is left here is the cheapest act in the film to reason about: one curve,
 * one line, no beats to hand off between, and nothing on screen waiting for
 * anything else to leave.
 */

import { ease, easeOut, range } from '../../core/contract'
import { INK } from '../palette'
import type { Act, ActRenderContext } from '../../core/contract'
import type { Pt } from '../timeline'
import {
  RAMP,
  comet,
  disc,
  drawLines,
  drawPath,
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
import copy from '../../content/film.json'

const C = copy.act6
/* 7.3, down from 7.6. The foot lands at 4.6 and the rest was hold; three tenths
   came off it. CURVE_OUT is derived from this now — see below. */
const DURATION = 7.3

const CURVE_A = 0.9
const CURVE_B = 3.9

/** the line at the foot, a wrapped line at a time */
const SPARK_A = 3.4
const SPARK_STEP = 0.5
/**
 * The curve is still going out as the act cuts, on purpose — it is the last
 * thing on the screen and it should not have finished leaving before the frame
 * changes.
 *
 * DERIVED FROM THE DURATION, and it was a literal 7.35 until the act was
 * shortened by three tenths. A hardcoded out-point one twentieth of a second
 * inside the old cut is a hardcoded out-point AFTER the new one: the fade would
 * simply never have started, and the act would have cut on a curve at full
 * strength with nothing to say it had failed. The quarter-second is the beat;
 * the cut is where it is measured from.
 */
const CURVE_OUT = DURATION - 0.25

function draw(c: ActRenderContext): void {
  const { ctx, w, h, t, reduced } = c
  reset(ctx)

  const F = frameOf(w, h)
  const S = scale(F)
  const hw = hair(F)
  wash(ctx, w, h, 0.85)

  const hy = header(ctx, F, S, C.index, C.heading, easeOut(range(t, -0.3, 0.7)))

  /* ---------------- the foot, measured before the picture is placed ----------
     The line wraps on a narrow window, so the room it needs is worked out first
     and the curve is given what is left. */
  const footY = F.y + F.h * 0.99
  setFont(ctx, S.body, 'display', 400)
  const sparkLines = wrapText(ctx, C.spark, F.w * 0.94)
  const lh = S.body * 1.34
  const footTop = footY - (sparkLines.length - 1) * lh

  const bandTop = hy + S.micro * 1.2
  const bandBot = footTop - S.body * 1.6
  const bandH = Math.max(28, bandBot - bandTop)

  /* ================================================================ *
   * The curve
   * ================================================================ */
  const curveA = 1 - ease(range(t, CURVE_OUT, CURVE_OUT + 0.7))

  const cx0 = F.x + F.w * 0.06
  const cw = F.w * 0.88
  const floor = bandTop + bandH * 0.9
  const rise = bandH * 0.82

  const curve: Pt[] = []
  for (let i = 0; i <= 60; i++) {
    const u = i / 60
    curve.push({ x: cx0 + cw * u, y: floor - rise * Math.pow(u, 2.7) })
  }

  if (curveA > 0.004) {
    // the floor it leaves, so the climb has something to be measured against
    ctx.fillStyle = withAlpha(INK.muted, 0.16 * curveA)
    ctx.fillRect(cx0, floor, cw * easeOut(range(t, 0.5, 1.4)), hw)

    const k = easeOut(range(t, CURVE_A, CURVE_B))
    if (k > 0.004) {
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = withAlpha(INK.amber, 0.75 * curveA)
      ctx.lineWidth = hw * 2
      drawPath(ctx, curve, k)
      if (k < 1 && !reduced) {
        const p = comet(ctx, curve, k, F.s * 0.035, INK.glow, 0.7 * curveA, 0.15)
        if (p) {
          ctx.fillStyle = withAlpha(INK.text, 0.95 * curveA)
          disc(ctx, p.x, p.y, hw * 2)
        }
      } else if (k >= 1) {
        const end = curve[curve.length - 1]
        if (end) {
          softDot(ctx, end.x, end.y, F.s * 0.07, INK.glow, 0.35 * curveA)
          ctx.fillStyle = withAlpha(INK.text, 0.9 * curveA)
          disc(ctx, end.x, end.y, hw * 2)
        }
      }
      ctx.lineCap = 'butt'
      ctx.lineJoin = 'miter'
    }
  }

  /* ================================================================ *
   * The line at the foot
   * ================================================================ */
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  setFont(ctx, S.body, 'display', 400)
  let li = 0
  for (const line of sparkLines) {
    const a = ease(range(t, SPARK_A + li * SPARK_STEP, SPARK_A + RAMP + li * SPARK_STEP))
    if (a > 0.004) {
      ctx.fillStyle = withAlpha(INK.text, 0.92 * a)
      drawLines(ctx, [line], F.cx, footTop + li * lh, lh, 'center')
    }
    li++
  }

  ctx.textAlign = 'left'
}

export const act6: Act = {
  id: 'act6',
  duration: DURATION,
  chapter: C.chapter,
  caption: C.caption,
  draw,
}

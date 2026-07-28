/**
 * ACT 1 — I love to think.
 *
 * One idea: the board's geometry becomes the shape of the degree.
 * A board assembles out of the dark, five moves trace across it as pure
 * vectors, then three of the squares detach and open into the three
 * overlapping fields of PPE — the overlap is the whole point, so it is the
 * brightest thing on screen.
 */

import { PALETTE, clamp, ease, easeOut, rand, range } from '../../core/contract'
import type { Act, ActRenderContext } from '../../core/contract'
import type { Pt } from '../timeline'
import {
  disc,
  drawPath,
  drawTracked,
  fitText,
  fitTracked,
  frameOf,
  hair,
  header,
  reset,
  ring,
  scale,
  softDot,
  wash,
  withAlpha,
} from '../timeline'
import copy from '../../content/film.json'

const C = copy.act1
const DURATION = 18

/* ---- board coordinates: f = file 0..7 left→right, r = rank 0..7 top→bottom ---- */
interface Sq {
  f: number
  r: number
}
interface Move {
  from: Sq
  to: Sq
  knight: boolean
}

const MOVES: Move[] = [
  { from: { f: 6, r: 7 }, to: { f: 5, r: 5 }, knight: true }, // Ng1–f3
  { from: { f: 5, r: 7 }, to: { f: 2, r: 4 }, knight: false }, // Bf1–c4
  { from: { f: 1, r: 0 }, to: { f: 2, r: 2 }, knight: true }, // Nb8–c6
  { from: { f: 3, r: 7 }, to: { f: 7, r: 3 }, knight: false }, // Qd1–h5
  { from: { f: 5, r: 5 }, to: { f: 6, r: 3 }, knight: true }, // Nf3–g5
]

const MOVE_START = 3.4
const MOVE_GAP = 0.95
const MOVE_RUN = 0.85

/** the three squares that leave the board and become fields */
const SEEDS: Sq[] = [
  { f: 2, r: 2 },
  { f: 7, r: 3 },
  { f: 5, r: 5 },
]
const CENTRE: Sq = { f: 3, r: 3 }

/** where each field settles, as an angle from the centre */
const FIELD_ANGLE = [-Math.PI / 2, Math.PI / 6, (Math.PI * 5) / 6]
const FIELD_COLOUR = [PALETTE.buffCss, PALETTE.amberCss, PALETTE.mintCss]

const DISSOLVE_A = 8.6
const DISSOLVE_B = 10.4
/* the fields start opening while the seeds are still travelling — waiting for
   them to arrive left a second of three bare dots as the board dissolved */
const OPEN_A = 9.3
const OPEN_B = 12.8

function draw(c: ActRenderContext): void {
  const { ctx, w, h, t, reduced } = c
  reset(ctx)

  const F = frameOf(w, h)
  const S = scale(F)
  const hw = hair(F)
  wash(ctx, w, h, 0.85)

  // opens from before t=0 so the cut into this act is never a black frame
  const hy = header(ctx, F, S, C.index, C.heading, easeOut(range(t, -0.3, 0.7)))

  /* ---------------- the picture band ----------------
     Everything drawn between the standing head and the one caption line at
     the foot. Both motifs are sized off this band rather than off the frame,
     so neither can ever run into the type above or below it. */
  const capY = F.y + F.h * 0.99
  const bandTop = hy + S.micro * 1.0
  const bandBot = capY - S.body * 1.0
  const bandH = Math.max(28, bandBot - bandTop)
  const bandCy = (bandTop + bandBot) / 2

  /* ---------------- board ---------------- */
  const B = Math.min(F.w * 0.5, bandH * 0.98)
  const cell = B / 8
  const bx = F.cx - B / 2
  const by = bandCy - B / 2
  const boardA = 1 - ease(range(t, DISSOLVE_A, DISSOLVE_B))

  const at = (s: Sq): Pt => ({ x: bx + (s.f + 0.5) * cell, y: by + (s.r + 0.5) * cell })

  if (boardA > 0.004) {
    for (let f = 0; f < 8; f++) {
      for (let r = 0; r < 8; r++) {
        const i = r * 8 + f
        const d = Math.hypot(f - 3.5, r - 3.5) / 4.95
        // starts under the head rather than after it — the board is already
        // assembling by the time the heading has finished arriving
        const born = 0.4 + d * 1.2 + rand(i) * 0.45
        const k = easeOut(range(t, born, born + 0.5))
        if (k <= 0.004) continue

        const p = at({ f, r })
        const s = cell * (0.62 + 0.38 * k)
        ctx.globalAlpha = k * boardA
        if ((f + r) % 2 === 1) {
          ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.075)
          ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s)
        } else {
          ctx.strokeStyle = withAlpha(PALETTE.buffCss, 0.07)
          ctx.lineWidth = hw
          ctx.strokeRect(p.x - s / 2 + hw / 2, p.y - s / 2 + hw / 2, s - hw, s - hw)
        }
      }
    }
    ctx.globalAlpha = 1

    const edge = easeOut(range(t, 1.9, 3.0)) * boardA
    if (edge > 0.004) {
      ctx.strokeStyle = withAlpha(PALETTE.amberCss, 0.3 * edge)
      ctx.lineWidth = hw
      ctx.strokeRect(bx - cell * 0.12, by - cell * 0.12, B + cell * 0.24, B + cell * 0.24)
    }
  }

  /* ---------------- the moves ---------------- */
  const traceA = 1 - ease(range(t, DISSOLVE_A, DISSOLVE_B - 0.4))
  if (traceA > 0.004) {
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    let mi = 0
    for (const m of MOVES) {
      const start = MOVE_START + mi * MOVE_GAP
      const k = easeOut(range(t, start, start + MOVE_RUN))
      mi++
      if (k <= 0.004) continue

      const a = at(m.from)
      const b = at(m.to)
      const corner: Sq =
        Math.abs(m.to.r - m.from.r) === 2 ? { f: m.from.f, r: m.to.r } : { f: m.to.f, r: m.from.r }
      const pts: Pt[] = m.knight ? [a, at(corner), b] : [a, b]

      // the square it left, releasing
      ctx.strokeStyle = withAlpha(PALETTE.sageCss, 0.4 * (1 - k) * traceA)
      ctx.lineWidth = hw
      ring(ctx, a.x, a.y, cell * 0.24)

      // the vector
      ctx.strokeStyle = withAlpha(PALETTE.amberCss, 0.62 * traceA)
      ctx.lineWidth = hw * 1.4
      const head = drawPath(ctx, pts, k)

      if (head && k < 1) softDot(ctx, head.x, head.y, cell * 0.5, PALETTE.glowCss, 0.5 * traceA)

      const land = easeOut(range(t, start + MOVE_RUN * 0.85, start + MOVE_RUN + 0.35))
      if (land > 0.004) {
        ctx.fillStyle = withAlpha(PALETTE.glowCss, 0.1 * land * traceA)
        ctx.fillRect(b.x - cell / 2, b.y - cell / 2, cell, cell)
        softDot(ctx, b.x, b.y, cell * 0.72, PALETTE.glowCss, 0.15 * land * traceA)
        ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.9 * land * traceA)
        disc(ctx, b.x, b.y, cell * 0.13)
      }
    }
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'miter'
  }

  /* ---------------- fields ----------------
     The cluster is 2.84R tall once the top label is allowed for, so R is
     solved from the band instead of from the frame. That is what keeps
     PHILOSOPHY off the heading on a short frame. */
  const travel = ease(range(t, DISSOLVE_A + 0.2, OPEN_A + 0.5))
  const openK = easeOut(range(t, OPEN_A, OPEN_B))
  const labelLift = S.micro * 1.25
  const R = Math.min(F.w * 0.22, (bandH - labelLift) / 2.84)
  const d = R * 0.56
  // centre the whole cluster — label included — on the band
  const fy = bandCy + (d * 0.5 + labelLift) / 2

  if (travel > 0.004) {
    const drift = reduced ? 0 : Math.sin(t * 0.55) * R * 0.012

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < FIELD_ANGLE.length; i++) {
      const ang = FIELD_ANGLE[i] ?? 0
      const colour = FIELD_COLOUR[i] ?? PALETTE.buffCss
      const from = at(SEEDS[i] ?? CENTRE)
      const tx = F.cx + Math.cos(ang) * d
      const ty = fy + Math.sin(ang) * d + drift
      const px = from.x + (tx - from.x) * travel
      const py = from.y + (ty - from.y) * travel
      const r = Math.max(cell * 0.13, R * openK)

      if (openK > 0.004) {
        const g = ctx.createRadialGradient(px, py, 0, px, py, r)
        g.addColorStop(0, withAlpha(colour, 0.115 * openK))
        g.addColorStop(0.72, withAlpha(colour, 0.07 * openK))
        g.addColorStop(1, withAlpha(colour, 0.015 * openK))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.strokeStyle = withAlpha(colour, 0.4 * clamp(travel * 1.2))
      ctx.lineWidth = hw
      ring(ctx, px, py, r)

      if (openK < 1) {
        ctx.fillStyle = withAlpha(colour, 0.85 * (1 - openK))
        disc(ctx, px, py, cell * 0.13 * (1 - openK))
      }
    }
    ctx.restore()

    /* labels, held outboard so nothing lands on the overlap. Each is fitted
       to the clear run between its circle and the edge of the frame. */
    const labelA = ease(range(t, OPEN_A + 1.4, OPEN_B + 0.4))
    if (labelA > 0.004) {
      ctx.textBaseline = 'middle'
      let j = 0
      for (const field of C.fields) {
        const ang = FIELD_ANGLE[j] ?? 0
        const colour = FIELD_COLOUR[j] ?? PALETTE.buffCss
        const cxp = F.cx + Math.cos(ang) * d
        const cyp = fy + Math.sin(ang) * d
        const text = field.toUpperCase()
        ctx.fillStyle = withAlpha(colour, 0.82 * labelA)
        if (j === 0) {
          const fit = fitTracked(ctx, text, F.w * 0.9, S.micro, 0.22, 'mono', 500)
          drawTracked(ctx, text, cxp, cyp - R - labelLift * 0.55, fit.track, 'center')
        } else {
          const dir = Math.cos(ang) > 0 ? 1 : -1
          const lx = cxp + dir * R * 0.86
          const room = dir > 0 ? F.x + F.w - lx : lx - F.x
          const fit = fitTracked(ctx, text, Math.max(12, room), S.micro, 0.22, 'mono', 500)
          drawTracked(ctx, text, lx, cyp + R * 0.76, fit.track, dir > 0 ? 'left' : 'right')
        }
        j++
      }
      ctx.textBaseline = 'alphabetic'
    }
  }

  /* ---------------- the caption line ----------------
     One line, always. It used to wrap to two and the upper one landed on the
     bottom rank of the board. Fitting it keeps it inside its own band. */
  ctx.textAlign = 'center'

  const chessA = ease(range(t, 2.6, 3.6)) * (1 - ease(range(t, 9.4, 10.2)))
  if (chessA > 0.004) {
    fitText(ctx, C.chess, F.w * 0.96, S.body, 'display', 400)
    ctx.fillStyle = withAlpha(PALETTE.sageCss, 0.92 * chessA)
    ctx.fillText(C.chess, F.cx, capY)
  }

  const schoolA = ease(range(t, 13.4, 14.6))
  if (schoolA > 0.004) {
    const fit = fitTracked(ctx, C.school, F.w * 0.9, S.small, 0.24)
    ctx.fillStyle = withAlpha(PALETTE.sageCss, 0.72 * schoolA)
    drawTracked(ctx, C.school, F.cx, capY, fit.track, 'center')
  }
  ctx.textAlign = 'left'
}

export const act1: Act = {
  id: 'act1',
  duration: DURATION,
  caption: C.caption,
  draw,
}

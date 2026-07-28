/**
 * ACT 3 — Cassidy.
 *
 * The longest act, so it is cut into beats rather than layered: a workflow
 * graph whose nodes light as they are fixed, an instrument panel where cost
 * falls and accuracy climbs, the conversation that the job actually is, and
 * a closing card for the pre-sales half.
 *
 * The hedge is the point of the whole act, so it is set as the largest line
 * in the film after the two titles. Never shorten it.
 *
 * Two rules hold this act together and both were broken once:
 *
 *   1. A beat's contents start when its envelope OPENS, not when the envelope
 *      finishes. The envelopes were widened to cross-dissolve and the interior
 *      timings were left where the old, later envelopes used to begin, so each
 *      beat spent its first second at full alpha with nothing inside it.
 *
 *   2. Every band is measured off the one above it. Nothing is placed at a
 *      fraction of the frame height. At contact-sheet size the frame is 116
 *      points tall and the type has floors, so fractions put the metric
 *      labels through each other and the hedge through the subtitle.
 */

import { PALETTE, ease, easeOut, rand, range } from '../../core/contract'
import type { Act, ActRenderContext } from '../../core/contract'
import type { Frame, Pt, TypeScale } from '../timeline'
import {
  disc,
  drawPath,
  drawTracked,
  envelope,
  fitText,
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
  triangle,
  wash,
  withAlpha,
} from '../timeline'
import copy from '../../content/film.json'

const C = copy.act3
const DURATION = 26

/* ---- beats: [fade in from, to, fade out from, to] ----
 *
 * Each beat begins fading in at the moment the previous one begins fading
 * OUT, not when it finishes. The first pass started the incoming beat a few
 * tenths after the outgoing one had gone, which put four separate ~0.7s
 * near-empty frames into the longest act in the film — it read as the thing
 * having crashed. Overlap them and it's a dissolve instead of a cut to black.
 *
 * The title opens from before t=0 so the cut into this act is never black.
 */
const B_TITLE = [-0.55, 0.45, 1.9, 2.6] as const
const B_GRAPH = [1.9, 2.7, 8.9, 9.6] as const
const B_METRIC = [8.9, 9.7, 15.8, 16.5] as const
const B_TALK = [15.8, 16.6, 21.1, 21.8] as const
const B_SALES = [21.1, 21.9] as const

/* ---- the workflow graph, normalised inside its box ---- */
const NODES: Pt[] = [
  { x: 0.05, y: 0.48 },
  { x: 0.24, y: 0.14 },
  { x: 0.24, y: 0.82 },
  { x: 0.45, y: 0.5 },
  { x: 0.64, y: 0.16 },
  { x: 0.66, y: 0.84 },
  { x: 0.86, y: 0.46 },
]
const EDGES: Array<[number, number]> = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 3],
  [3, 4],
  [3, 5],
  [4, 6],
  [5, 6],
]
/** the edge that gets replaced — the one thing on screen that is actually fixed */
const OLD_EDGE: [number, number] = [1, 5]
const NEW_EDGE: [number, number] = [1, 4]
const REROUTE = 6.4

const NODE_FIRST = 4.3
const NODE_GAP = 0.42

/* ---- instruments ---- */
interface Metric {
  label: string
  from: number
  to: number
  up: boolean
}
const METRICS: Metric[] = [
  { label: C.metrics[0] ?? 'cost', from: 0.86, to: 0.34, up: false },
  { label: C.metrics[1] ?? 'hallucinations', from: 0.72, to: 0.2, up: false },
  { label: C.metrics[2] ?? 'accuracy', from: 0.42, to: 0.88, up: true },
]

/* ---- conversation ---- */
const MARKS = 6

/** baseline of the single line every beat hangs its closing text on */
function footOf(F: Frame): number {
  return F.y + F.h * 0.985
}

function beatTitle(ctx: CanvasRenderingContext2D, F: Frame, S: TypeScale, t: number): void {
  const a = envelope(t, B_TITLE[0], B_TITLE[1], B_TITLE[2], B_TITLE[3])
  if (a <= 0.004) return
  ctx.textBaseline = 'alphabetic'
  fitText(ctx, C.heading, F.w * 0.9, S.title * 0.86, 'display', 400)
  ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.95 * a)
  ctx.textAlign = 'center'
  ctx.fillText(C.heading, F.cx, F.cy)
  ctx.textAlign = 'left'
  const fit = fitTracked(ctx, C.role, F.w * 0.9, S.small, 0.24, 'mono', 400)
  ctx.fillStyle = withAlpha(PALETTE.sageCss, 0.66 * a)
  drawTracked(ctx, C.role, F.cx, F.cy + S.small * 2.6, fit.track, 'center')
}

function beatGraph(
  ctx: CanvasRenderingContext2D,
  F: Frame,
  S: TypeScale,
  t: number,
  hw: number,
  headBot: number,
): void {
  const a = envelope(t, B_GRAPH[0], B_GRAPH[1], B_GRAPH[2], B_GRAPH[3])
  if (a <= 0.004) return

  const footY = footOf(F)
  const gx = F.x + F.w * 0.08
  const gw = F.w * 0.84
  const r = Math.max(3, F.s * 0.016)
  const gTop = headBot + r
  const gAvail = Math.max(20, footY - S.body * 1.0 - r - gTop)
  // a left-to-right flow graph stretched to a portrait band is unreadable
  const gh = Math.min(gAvail, gw * 0.4)
  const gy = gTop + (gAvail - gh) / 2
  // the node table only spans y 0.14..0.84, so it is renormalised onto the
  // band rather than left floating inside the middle 70% of it
  const at = (i: number): Pt => {
    const n = NODES[i] ?? { x: 0.5, y: 0.5 }
    return { x: gx + n.x * gw, y: gy + ((n.y - 0.14) / 0.7) * gh }
  }

  /** a node counts as fixed once its moment has passed */
  const litAt = (i: number): number =>
    easeOut(range(t, NODE_FIRST + i * NODE_GAP, NODE_FIRST + i * NODE_GAP + 0.6))

  ctx.lineCap = 'round'

  // the edge being replaced
  const oldA = 1 - ease(range(t, REROUTE, REROUTE + 0.8))
  if (oldA > 0.004) {
    ctx.setLineDash([hw * 3, hw * 4])
    ctx.strokeStyle = withAlpha(PALETTE.sageCss, 0.3 * oldA * a)
    ctx.lineWidth = hw
    const p = at(OLD_EDGE[0])
    const q = at(OLD_EDGE[1])
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(q.x, q.y)
    ctx.stroke()
    ctx.setLineDash([])
  }
  const newK = easeOut(range(t, REROUTE + 0.5, REROUTE + 1.5))
  if (newK > 0.004) {
    ctx.strokeStyle = withAlpha(PALETTE.mintCss, 0.5 * a)
    ctx.lineWidth = hw * 1.2
    drawPath(ctx, [at(NEW_EDGE[0]), at(NEW_EDGE[1])], newK)
  }

  // the network — starts inside the fade-in, not a second after it
  let ei = 0
  for (const [p, q] of EDGES) {
    const k = easeOut(range(t, 2.25 + ei * 0.13, 2.8 + ei * 0.13))
    ei++
    if (k <= 0.004) continue
    const live = Math.min(litAt(p), litAt(q))
    ctx.strokeStyle = withAlpha(
      live > 0.5 ? PALETTE.amberCss : PALETTE.sageCss,
      (0.18 + 0.34 * live) * a,
    )
    ctx.lineWidth = hw * (1 + live * 0.5)
    drawPath(ctx, [at(p), at(q)], k)
  }

  // the nodes
  for (let i = 0; i < NODES.length; i++) {
    const p = at(i)
    const born = easeOut(range(t, 1.95 + i * 0.09, 2.55 + i * 0.09))
    if (born <= 0.004) continue
    const lit = litAt(i)
    if (lit > 0.004) {
      softDot(ctx, p.x, p.y, r * 5 * lit, PALETTE.glowCss, 0.26 * lit * a)
      ctx.fillStyle = withAlpha(PALETTE.amberLitCss, 0.95 * lit * a)
      disc(ctx, p.x, p.y, r * (0.55 + 0.45 * lit))
    }
    ctx.strokeStyle = withAlpha(PALETTE.sageCss, (0.28 + 0.4 * lit) * born * a)
    ctx.lineWidth = hw
    ring(ctx, p.x, p.y, r * born)
  }
  ctx.lineCap = 'butt'

  const lineA = ease(range(t, 5.4, 6.4)) * a
  if (lineA > 0.004) {
    fitText(ctx, C.graphLine, F.w * 0.96, S.body, 'display', 400)
    ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.9 * lineA)
    ctx.textAlign = 'center'
    ctx.fillText(C.graphLine, F.cx, footY)
    ctx.textAlign = 'left'
  }
}

interface Column {
  cx: number
  w: number
}

/**
 * Lay the three instruments out in proportion to their names rather than in
 * equal thirds. "hallucinations" is three times the length of "cost"; equal
 * thirds forced it below the legible floor and it ran into "accuracy" anyway.
 */
function metricColumns(
  ctx: CanvasRenderingContext2D,
  F: Frame,
  S: TypeScale,
): { cols: Column[]; size: number; track: number; triW: number } {
  const avail = F.w * 0.96
  const gaps = Math.max(1, METRICS.length - 1)

  setFont(ctx, S.micro, 'mono', 500)
  let wanted = 0
  for (const m of METRICS) wanted += trackedWidth(ctx, m.label, S.micro * 0.18) + S.micro * 0.95
  const room = avail - S.micro * 1.2 * gaps
  const k = Math.min(1, Math.max(7 / S.micro, room / Math.max(1, wanted)))
  const size = S.micro * k
  const track = size * 0.18
  const triW = size * 0.95
  setFont(ctx, size, 'mono', 500)

  const widths = METRICS.map((m) =>
    Math.max(trackedWidth(ctx, m.label, track) + triW, F.s * 0.075),
  )
  const used = widths.reduce((x, y) => x + y, 0)
  const gutter = Math.max(size * 0.8, (avail - used) / gaps)

  let cursor = F.cx - (used + gutter * gaps) / 2
  const cols: Column[] = widths.map((wCol) => {
    const col = { cx: cursor + wCol / 2, w: wCol }
    cursor += wCol + gutter
    return col
  })
  return { cols, size, track, triW }
}

function beatMetrics(
  ctx: CanvasRenderingContext2D,
  F: Frame,
  S: TypeScale,
  t: number,
  hw: number,
  headBot: number,
): void {
  const a = envelope(t, B_METRIC[0], B_METRIC[1], B_METRIC[2], B_METRIC[3])
  if (a <= 0.004) return

  ctx.textBaseline = 'alphabetic'
  const footY = footOf(F)

  /* the hedge — one line, set as large as the frame will carry it, and the
     lead sitting above it. It used to wrap to two lines whose second one
     landed below the frame, on top of the subtitle. */
  const hedgeSize = fitText(ctx, C.hedge, F.w * 0.98, S.body * 1.3, 'display', 400)
  const leadY = footY - (hedgeSize + S.small) * 0.85

  const { cols, size, track, triW } = metricColumns(ctx, F, S)
  // the band is the ceiling, not the target — an instrument stretched to a
  // tall band is a hairline forty times its own width, and one pinned to the
  // foot of the band leaves half the frame empty. Cap it, then centre it, and
  // let the names follow the instruments rather than the hedge.
  const bandBot = leadY - S.small * 0.85 - size * 2.25
  const height = Math.max(14, Math.min(bandBot - headBot, F.s * 0.2))
  const chartBot = bandBot - Math.max(0, bandBot - headBot - height) / 2
  const chartTop = chartBot - height
  const labelY = chartBot + size * 1.25
  const move = ease(range(t, 10.4, 13.4))

  let mi = 0
  for (const m of METRICS) {
    const col = cols[mi] ?? { cx: F.cx, w: F.s * 0.1 }
    const cx = col.cx
    mi++
    const v = m.from + (m.to - m.from) * move

    if (m.up) {
      // accuracy — a line finding its level
      const cw = Math.min(col.w * 0.9, height * 1.1)
      const pts: Pt[] = []
      for (let i = 0; i <= 8; i++) {
        const u = i / 8
        const lvl = m.from + (m.to - m.from) * ease(u) + (rand(i * 7 + 3) - 0.5) * 0.07 * (1 - u * 0.6)
        pts.push({ x: cx - cw / 2 + cw * u, y: chartBot - height * lvl })
      }
      ctx.strokeStyle = withAlpha(PALETTE.buffCss, 0.12 * a)
      ctx.lineWidth = hw
      ctx.beginPath()
      ctx.moveTo(cx - cw / 2, chartBot)
      ctx.lineTo(cx + cw / 2, chartBot)
      ctx.stroke()

      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = withAlpha(PALETTE.mintCss, 0.85 * a)
      ctx.lineWidth = hw * 1.6
      // starts with the beat, so this column is never an empty third
      const k = easeOut(range(t, 9.0, 12.8))
      const head = drawPath(ctx, pts, k)
      ctx.lineCap = 'butt'
      ctx.lineJoin = 'miter'
      if (head) {
        softDot(ctx, head.x, head.y, F.s * 0.03, PALETTE.mintCss, 0.4 * a)
        ctx.fillStyle = withAlpha(PALETTE.mintCss, 0.95 * a)
        disc(ctx, head.x, head.y, hw * 2)
      }
    } else {
      // cost, hallucinations — bars coming down off a remembered level
      const bw = Math.min(Math.max(6, F.s * 0.055), col.w * 0.5)
      ctx.strokeStyle = withAlpha(PALETTE.buffCss, 0.12 * a)
      ctx.lineWidth = hw
      ctx.strokeRect(cx - bw / 2 + hw / 2, chartTop + hw / 2, bw - hw, height - hw)

      const g = ctx.createLinearGradient(0, chartBot - height * v, 0, chartBot)
      g.addColorStop(0, withAlpha(PALETTE.amberLitCss, 0.6 * a))
      g.addColorStop(1, withAlpha(PALETTE.amberCss, 0.22 * a))
      ctx.fillStyle = g
      ctx.fillRect(cx - bw / 2, chartBot - height * v, bw, height * v)

      // where it started
      const wasY = chartBot - height * m.from
      ctx.setLineDash([hw * 2, hw * 3])
      ctx.strokeStyle = withAlpha(PALETTE.sageCss, 0.3 * a * move)
      ctx.lineWidth = hw
      ctx.beginPath()
      ctx.moveTo(cx - bw * 0.9, wasY)
      ctx.lineTo(cx + bw * 0.9, wasY)
      ctx.stroke()
      ctx.setLineDash([])
    }

    /* direction mark and label, set as one unit inside the column so the
       three names can never touch */
    setFont(ctx, size, 'mono', 500)
    const lw = trackedWidth(ctx, m.label, track)
    const startX = cx - (lw + triW) / 2
    const mark = ease(range(t, 10.9, 11.9)) * a
    if (mark > 0.004) {
      ctx.fillStyle = withAlpha(m.up ? PALETTE.mintCss : PALETTE.amberCss, 0.85 * mark)
      triangle(ctx, startX + triW * 0.45, labelY - size * 0.26, size * 0.34, m.up)
    }
    ctx.fillStyle = withAlpha(PALETTE.sageCss, 0.8 * a)
    drawTracked(ctx, m.label, startX + triW, labelY, track, 'left')
  }

  const hedgeA = ease(range(t, 13.2, 14.4)) * a
  if (hedgeA > 0.004) {
    ctx.textAlign = 'center'
    setFont(ctx, S.small, 'display', 400)
    ctx.fillStyle = withAlpha(PALETTE.sageCss, 0.8 * hedgeA)
    ctx.fillText(C.hedgeLead, F.cx, leadY)

    setFont(ctx, hedgeSize, 'display', 400)
    ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.96 * hedgeA)
    ctx.fillText(C.hedge, F.cx, footY)
    ctx.textAlign = 'left'
  }
}

function beatTalk(
  ctx: CanvasRenderingContext2D,
  F: Frame,
  S: TypeScale,
  t: number,
  hw: number,
  headBot: number,
): void {
  const a = envelope(t, B_TALK[0], B_TALK[1], B_TALK[2], B_TALK[3])
  if (a <= 0.004) return

  ctx.textBaseline = 'alphabetic'
  const footY = footOf(F)
  const colW = Math.min(F.w * 0.62, F.s * 0.66)
  const left = F.cx - colW / 2

  const contactY = footY - S.body * 1.6
  const markBot = contactY - S.body * 0.8 - S.micro * 0.4
  const markAvail = Math.max(hw * 6, markBot - headBot)
  const slot = Math.max(hw * 3, Math.min(markAvail / MARKS, F.s * 0.05))
  const markH = Math.max(hw * 2, slot * 0.66)
  const markTop = headBot + Math.max(0, markAvail - slot * MARKS) / 2

  for (let i = 0; i < MARKS; i++) {
    // arrives with the envelope rather than 1.0s after it
    const k = ease(range(t, 15.9 + i * 0.34, 16.4 + i * 0.34)) * a
    if (k <= 0.004) continue
    const mine = i % 2 === 1
    const wide = colW * (0.42 + rand(i * 5 + 2) * 0.5)
    const x = mine ? left + colW - wide : left
    const y = markTop + i * slot
    ctx.beginPath()
    ctx.roundRect(x, y, wide, markH, markH * 0.5)
    if (mine) {
      ctx.fillStyle = withAlpha(PALETTE.amberCss, 0.3 * k)
      ctx.fill()
      ctx.strokeStyle = withAlpha(PALETTE.amberCss, 0.42 * k)
    } else {
      ctx.strokeStyle = withAlpha(PALETTE.sageCss, 0.34 * k)
    }
    ctx.lineWidth = hw
    ctx.stroke()
  }

  const lineA = ease(range(t, 18.2, 19.2)) * a
  if (lineA > 0.004) {
    fitText(ctx, C.contactLine, F.w * 0.96, S.body, 'display', 400)
    ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.92 * lineA)
    ctx.textAlign = 'center'
    ctx.fillText(C.contactLine, F.cx, contactY)
    ctx.textAlign = 'left'
  }

  // the duty row is the widest mono line in the film; fit it as one unit
  const duties = C.duties
  let dSize = S.micro
  let track = dSize * 0.16
  let sep = dSize * 2.1
  setFont(ctx, dSize, 'mono', 400)
  let widths = 0
  for (const d of duties) widths += trackedWidth(ctx, d, track)
  const rowW = widths + sep * (duties.length - 1)
  const maxRow = F.w * 0.96
  if (rowW > maxRow && rowW > 0) {
    const shrink = maxRow / rowW
    dSize = Math.max(7, dSize * shrink)
    track *= shrink
    sep *= shrink
    widths *= shrink
    setFont(ctx, dSize, 'mono', 400)
  }
  let x = F.cx - (widths + sep * (duties.length - 1)) / 2
  let di = 0
  for (const d of duties) {
    const k = ease(range(t, 19.2 + di * 0.35, 19.8 + di * 0.35)) * a
    const dw = trackedWidth(ctx, d, track)
    if (k > 0.004) {
      ctx.fillStyle = withAlpha(PALETTE.sageCss, 0.72 * k)
      drawTracked(ctx, d, x, footY, track, 'left')
      if (di < duties.length - 1) {
        ctx.fillStyle = withAlpha(PALETTE.amberCss, 0.5 * k)
        disc(ctx, x + dw + sep / 2, footY - dSize * 0.3, hw * 1.1)
      }
    }
    x += dw + sep
    di++
  }
}

function beatSales(
  ctx: CanvasRenderingContext2D,
  F: Frame,
  S: TypeScale,
  t: number,
  hw: number,
  headBot: number,
): void {
  const a = envelope(t, B_SALES[0], B_SALES[1])
  if (a <= 0.004) return

  ctx.textBaseline = 'alphabetic'
  const footY = footOf(F)

  // both lines set at one size, each on its own line — the second used to be
  // laid out as though the first had never wrapped, and they collided
  const sizeA = fitText(ctx, C.presalesA, F.w * 0.96, S.body, 'display', 400)
  const sizeB = fitText(ctx, C.presalesB, F.w * 0.96, S.body, 'display', 400)
  const lineSize = Math.min(sizeA, sizeB)
  const aY = footY - lineSize * 1.65

  /* a demo, drawn as the thing this whole site is: a small source throwing
     light at a screen */
  const picBot = aY - lineSize * 0.95
  const band = Math.max(16, picBot - headBot)
  const boxH = Math.min(F.s * 0.21, band * 0.92)
  const boxW = boxH / 0.62
  const cy = (headBot + picBot) / 2
  const k = easeOut(range(t, 21.3, 23.0))
  const srcX = F.cx - F.w * 0.3
  const scrX = F.cx + F.w * 0.06

  ctx.fillStyle = withAlpha(PALETTE.amberCss, 0.8 * a)
  disc(ctx, srcX, cy, Math.max(2, F.s * 0.012) * a)
  softDot(ctx, srcX, cy, F.s * 0.06, PALETTE.glowCss, 0.3 * a)

  if (k > 0.004) {
    const reach = (scrX - srcX) * k
    const spread = (boxH / 2) * k
    ctx.beginPath()
    ctx.moveTo(srcX, cy)
    ctx.lineTo(srcX + reach, cy - spread)
    ctx.lineTo(srcX + reach, cy + spread)
    ctx.closePath()
    const g = ctx.createLinearGradient(srcX, cy, srcX + reach, cy)
    g.addColorStop(0, withAlpha(PALETTE.glowCss, 0.22 * a))
    g.addColorStop(1, withAlpha(PALETTE.glowCss, 0.05 * a))
    ctx.fillStyle = g
    ctx.fill()
  }

  const lit = easeOut(range(t, 22.4, 23.4)) * a
  if (lit > 0.004) {
    ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.07 * lit)
    ctx.fillRect(scrX, cy - boxH / 2, boxW, boxH)
    ctx.strokeStyle = withAlpha(PALETTE.amberCss, 0.5 * lit)
    ctx.lineWidth = hw
    ctx.strokeRect(scrX + hw / 2, cy - boxH / 2 + hw / 2, boxW - hw, boxH - hw)
  }

  ctx.textAlign = 'center'
  const aA = ease(range(t, 22.6, 23.6)) * a
  if (aA > 0.004) {
    setFont(ctx, lineSize, 'display', 400)
    ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.94 * aA)
    ctx.fillText(C.presalesA, F.cx, aY)
  }
  const bA = ease(range(t, 24.0, 25.0)) * a
  if (bA > 0.004) {
    setFont(ctx, lineSize, 'display', 400)
    ctx.fillStyle = withAlpha(PALETTE.sageCss, 0.88 * bA)
    ctx.fillText(C.presalesB, F.cx, footY)
  }
  ctx.textAlign = 'left'
}

function draw(c: ActRenderContext): void {
  const { ctx, w, h, t } = c
  reset(ctx)

  const F = frameOf(w, h)
  const S = scale(F)
  const hw = hair(F)
  wash(ctx, w, h, 0.85)

  beatTitle(ctx, F, S, t)

  // the standing tag, once the title card has gone
  const tagA = ease(range(t, 1.9, 2.7))
  const hy = header(ctx, F, S, C.index, C.tag, tagA)
  const headBot = hy + S.micro * 0.7

  beatGraph(ctx, F, S, t, hw, headBot)
  beatMetrics(ctx, F, S, t, hw, headBot)
  beatTalk(ctx, F, S, t, hw, headBot)
  beatSales(ctx, F, S, t, hw, headBot)
}

export const act3: Act = {
  id: 'act3',
  duration: DURATION,
  caption: C.caption,
  draw,
}

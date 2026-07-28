/**
 * ACT 2 — I also love to build.
 *
 * One idea: a blueprint draws itself, then runs.
 * Grid, boxes, routed edges — engineering-drawing restraint — and once the
 * diagram is complete a pulse of light makes a full circuit through it three
 * times. Underneath, three markers light along a rail: the arc of owning a
 * project from discovery to implementation.
 *
 * This act carries more furniture than any other — head, credit, six boxes and
 * their labels, a rail and its labels, and a closing line — so every one of
 * them is given an explicit horizontal band measured off the one above it.
 * Nothing here is positioned as a fraction of the frame any more; the frame is
 * only 116 points tall at contact-sheet size and the fractions all landed on
 * top of one another.
 */

import { PALETTE, ease, easeOut, range } from '../../core/contract'
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
  pointAt,
  reset,
  ring,
  scale,
  setFont,
  softDot,
  trackedWidth,
  wash,
  withAlpha,
} from '../timeline'
import copy from '../../content/film.json'

const C = copy.act2
const DURATION = 20

const L_INTAKE = C.nodes[0] ?? 'intake'
const L_AGENT = C.nodes[1] ?? 'agent'
const L_TOOLS = C.nodes[2] ?? 'tools'
const L_HANDOFF = C.nodes[3] ?? 'handoff'

const TOOL_X = [0.58, 0.74, 0.9]

const BOX_IN = [1.8, 2.4, 3.2, 3.6, 4.0, 4.6] // intake, agent, tool0..2, handoff
const EDGE_IN = [5.0, 5.5, 5.8, 6.1, 6.5] // intake→agent, agent→tool0..2, agent→handoff
const PASS = [7.6, 9.1, 10.6]
const PASS_LEN = 1.35

const RAIL_A = 12.2
const MARKER_IN = [13.0, 14.15, 15.3]

/** the credit hands the foot of the frame over to the closing line */
const CREDIT_OUT = [15.2, 16.2] as const

interface Box {
  x: number
  y: number
  w: number
  h: number
}

function boxPath(b: Box): Pt[] {
  const l = b.x - b.w / 2
  const r = b.x + b.w / 2
  const tp = b.y - b.h / 2
  const bt = b.y + b.h / 2
  return [
    { x: l, y: tp },
    { x: r, y: tp },
    { x: r, y: bt },
    { x: l, y: bt },
    { x: l, y: tp },
  ]
}

function draw(c: ActRenderContext): void {
  const { ctx, w, h, t } = c
  reset(ctx)

  const F = frameOf(w, h)
  const S = scale(F)
  const hw = hair(F)
  wash(ctx, w, h, 0.85)

  // opens from before t=0 so the cut into this act is never a black frame
  const hy = header(ctx, F, S, C.index, C.heading, easeOut(range(t, -0.3, 0.7)))

  /* ---------------- the bands ----------------
     Measured bottom-up: one line at the foot, the rail and its labels above
     it, and whatever is left over is the drawing board. */
  const footY = F.y + F.h * 0.985
  const footTop = footY - S.body * 0.75
  /** how far the largest marker ring reaches either side of the rail */
  const markerR = F.s * 0.016
  const stageY = footTop - S.micro * 0.75
  // clearance is measured off the ring, not off the rail — the ring is wider
  // than a micro line once the frame is desktop-sized
  const railY = stageY - markerR - S.micro * 1.0
  /** the lowest the node labels may sit before they touch the rail markers */
  const labelLimit = railY - markerR - S.micro * 0.9
  const dx = F.x + F.w * 0.06
  const dw = F.w * 0.88
  const dyTop = hy + S.micro * 0.7
  // the band is the ceiling, not the target — on a phone in portrait it is
  // four hundred points tall and a blueprint stretched to fill it is all lane
  const avail = Math.max(18, labelLimit - S.micro * 0.95 - dyTop)
  const dh = Math.min(avail, dw * 0.55)
  const dy = dyTop + (avail - dh) / 2
  // the labels belong to the boxes, so they follow the board, not the rail
  const nodeLabelY = dy + dh + S.micro * 0.95

  const bw = F.s * 0.14
  const bh = Math.min(F.s * 0.058, dh * 0.22)
  const aw = F.s * 0.18
  const ah = Math.min(F.s * 0.082, dh * 0.3)
  const tw = F.s * 0.1
  const th = Math.min(F.s * 0.046, dh * 0.2)

  const toolY = dy + th / 2
  const spineY = dy + dh - ah / 2
  // the clear run between the two rows — the routed lanes live in it
  const laneTop = toolY + th / 2
  const laneBot = spineY - ah / 2
  const busY = (laneTop + laneBot) / 2
  const laneStep = Math.max(hw * 2, (laneBot - laneTop) * 0.22)

  const intake: Box = { x: dx + dw * 0.09, y: spineY, w: bw, h: bh }
  const agent: Box = { x: dx + dw * 0.4, y: spineY, w: aw, h: ah }
  const handoff: Box = { x: dx + dw * 0.86, y: spineY, w: bw, h: bh }
  const tools: Box[] = TOOL_X.map((k) => ({ x: dx + dw * k, y: toolY, w: tw, h: th }))

  /* grid — the blueprint's paper */
  const step = Math.max(6, F.s * 0.034)
  ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.055)
  for (let gx = dx; gx <= dx + dw + 0.5; gx += step) {
    const k = easeOut(range(t, 0.7 + ((gx - dx) / dw) * 0.8, 1.2 + ((gx - dx) / dw) * 0.8))
    if (k <= 0.01) continue
    ctx.globalAlpha = k
    for (let gy = dy; gy <= dy + dh + 0.5; gy += step) {
      ctx.fillRect(gx, gy, hw, hw)
    }
  }
  ctx.globalAlpha = 1

  /* boxes */
  const boxes: Box[] = [intake, agent, ...tools, handoff]
  ctx.lineJoin = 'round'
  let bi = 0
  for (const b of boxes) {
    const start = BOX_IN[bi] ?? 2
    bi++
    const k = easeOut(range(t, start, start + 0.9))
    if (k <= 0.004) continue
    ctx.strokeStyle = withAlpha(PALETTE.amberCss, b === agent ? 0.62 : 0.42)
    ctx.lineWidth = b === agent ? hw * 1.5 : hw
    drawPath(ctx, boxPath(b), k)
    if (b === agent && k >= 1) {
      ctx.fillStyle = withAlpha(PALETTE.amberCss, 0.05)
      ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h)
    }
  }
  ctx.lineJoin = 'miter'

  /* labels — each fitted to the clear run between its box and its neighbour */
  ctx.textBaseline = 'alphabetic'
  const label = (text: string, x: number, room: number, start: number): void => {
    const k = ease(range(t, start, start + 0.7))
    if (k <= 0.004) return
    const fit = fitTracked(ctx, text, Math.max(14, room), S.micro, 0.18, 'mono', 400)
    ctx.fillStyle = withAlpha(PALETTE.sageCss, 0.75 * k)
    drawTracked(ctx, text, x, nodeLabelY, fit.track, 'center')
  }
  const spineGapL = agent.x - intake.x
  const spineGapR = handoff.x - agent.x
  label(L_INTAKE, intake.x, Math.min(spineGapL, (intake.x - F.x) * 2) * 0.92, (BOX_IN[0] ?? 2) + 0.7)
  label(L_AGENT, agent.x, Math.min(spineGapL, spineGapR) * 0.92, (BOX_IN[1] ?? 2) + 0.7)
  label(
    L_HANDOFF,
    handoff.x,
    Math.min(spineGapR, (F.x + F.w - handoff.x) * 2) * 0.92,
    (BOX_IN[5] ?? 2) + 0.7,
  )

  /* the tools group is labelled beside its row, not above it — above it is
     where the heading lives on a short frame */
  const toolsK = ease(range(t, (BOX_IN[4] ?? 2) + 0.7, (BOX_IN[4] ?? 2) + 1.4))
  if (toolsK > 0.004) {
    const edge = (tools[0]?.x ?? dx) - tw / 2 - S.micro * 0.9
    const fitT = fitTracked(ctx, L_TOOLS, Math.max(14, edge - dx), S.micro, 0.18, 'mono', 400)
    ctx.textBaseline = 'middle'
    ctx.fillStyle = withAlpha(PALETTE.sageCss, 0.75 * toolsK)
    drawTracked(ctx, L_TOOLS, edge, toolY, fitT.track, 'right')
    ctx.textBaseline = 'alphabetic'
  }

  /* edges */
  const eIntake: Pt[] = [
    { x: intake.x + bw / 2, y: spineY },
    { x: agent.x - aw / 2, y: spineY },
  ]
  const eHandoff: Pt[] = [
    { x: agent.x + aw / 2, y: spineY },
    { x: handoff.x - bw / 2, y: spineY },
  ]
  // each tool gets its own routed lane — no two lines ever share a pixel
  const eTools: Pt[][] = tools.map((b, i) => {
    const lane = busY + laneStep * (1 - i)
    const stem = agent.x + (i - 1) * aw * 0.3
    return [
      { x: stem, y: spineY - ah / 2 },
      { x: stem, y: lane },
      { x: b.x, y: lane },
      { x: b.x, y: toolY + th / 2 },
    ]
  })

  const edges: Pt[][] = [eIntake, ...eTools, eHandoff]
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  let ei = 0
  for (const e of edges) {
    const start = EDGE_IN[ei] ?? 5
    ei++
    const k = easeOut(range(t, start, start + 0.7))
    if (k <= 0.004) continue
    ctx.strokeStyle = withAlpha(PALETTE.sageCss, 0.34)
    ctx.lineWidth = hw
    drawPath(ctx, e, k)
  }

  /* the diagram runs */
  for (const p0 of PASS) {
    const u = range(t, p0, p0 + PASS_LEN)
    if (u <= 0 || u >= 1) continue
    const dots: Array<Pt | null> = []
    if (u < 0.3) dots.push(pointAt(eIntake, u / 0.3))
    else if (u < 0.58) for (const e of eTools) dots.push(pointAt(e, (u - 0.3) / 0.28))
    else if (u < 0.76) for (const e of eTools) dots.push(pointAt(e, 1 - (u - 0.58) / 0.18))
    else dots.push(pointAt(eHandoff, (u - 0.76) / 0.24))

    for (const p of dots) {
      if (!p) continue
      softDot(ctx, p.x, p.y, F.s * 0.026, PALETTE.glowCss, 0.7)
      ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.95)
      disc(ctx, p.x, p.y, hw * 1.6)
    }
    // the agent lights while it is working
    const busy = u > 0.28 && u < 0.8 ? 1 : 0
    if (busy) {
      ctx.strokeStyle = withAlpha(PALETTE.glowCss, 0.45)
      ctx.lineWidth = hw * 1.5
      ctx.strokeRect(agent.x - aw / 2, agent.y - ah / 2, aw, ah)
    }
  }
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'

  /* ---------------- the rail: discovery → scoping → implementation ----------
     The three names are very different lengths, so the rail is divided in
     proportion to them rather than into equal thirds. Equal thirds forced
     "implementation" down to an unreadable size and it ran into "scoping"
     anyway. */
  const rx = F.x + F.w * 0.08
  const rw = F.w * 0.84
  const railK = easeOut(range(t, RAIL_A, RAIL_A + 1.1))
  if (railK > 0.004) {
    ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.16 * railK)
    ctx.fillRect(rx, railY, rw * railK, hw)

    const stages = C.stages
    const gaps = Math.max(1, stages.length - 1)

    // measure at full size, shrink only as far as legibility allows, then
    // re-measure and spread the slack — so each name owns its own column
    setFont(ctx, S.micro, 'mono', 500)
    let wanted = 0
    for (const stage of stages) wanted += trackedWidth(ctx, stage, S.micro * 0.18)
    const room = rw - S.micro * 1.4 * gaps
    const kFit = Math.min(1, Math.max(7 / S.micro, room / Math.max(1, wanted)))
    const size = S.micro * kFit
    const fitTrack = size * 0.18
    setFont(ctx, size, 'mono', 500)

    const widths = stages.map((s) => trackedWidth(ctx, s, fitTrack))
    const used = widths.reduce((a, b) => a + b, 0)
    const gutter = Math.max(size * 0.6, (rw - used) / gaps)

    let cursor = rx
    let si = 0
    for (const stage of stages) {
      const colW = widths[si] ?? 0
      const at = cursor + colW / 2
      cursor += colW + gutter
      const start = MARKER_IN[si] ?? 13
      si++
      const mk = easeOut(range(t, start, start + 0.8))
      if (mk <= 0.004) continue

      softDot(ctx, at, railY, F.s * 0.05 * mk, PALETTE.glowCss, 0.3 * mk)
      ctx.fillStyle = withAlpha(PALETTE.amberLitCss, 0.95 * mk)
      disc(ctx, at, railY, markerR * 0.4)
      ctx.strokeStyle = withAlpha(PALETTE.amberCss, 0.4 * mk)
      ctx.lineWidth = hw
      ring(ctx, at, railY, markerR * (0.4 + 0.6 * mk))

      ctx.fillStyle = withAlpha(PALETTE.sageCss, 0.8 * mk)
      drawTracked(ctx, stage, at, stageY, fitTrack, 'center')
    }
  }

  /* ---------------- the foot ----------------
     The credit sits here first and hands over to the claim. It used to sit
     directly under the heading, where the tool lane ran straight through it. */
  const companyA = ease(range(t, 0.8, 1.8)) * (1 - ease(range(t, CREDIT_OUT[0], CREDIT_OUT[1])))
  if (companyA > 0.004) {
    const fit = fitTracked(ctx, C.company, F.w * 0.98, S.micro, 0.16, 'mono', 400)
    ctx.fillStyle = withAlpha(PALETTE.sageCss, 0.68 * companyA)
    drawTracked(ctx, C.company, F.cx, footY, fit.track, 'center')
  }

  const lineA = ease(range(t, 16.4, 17.6))
  if (lineA > 0.004) {
    fitText(ctx, C.line, F.w * 0.96, S.body, 'display', 400)
    ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.92 * lineA)
    ctx.textAlign = 'center'
    ctx.fillText(C.line, F.cx, footY)
    ctx.textAlign = 'left'
  }
}

export const act2: Act = {
  id: 'act2',
  duration: DURATION,
  caption: C.caption,
  draw,
}

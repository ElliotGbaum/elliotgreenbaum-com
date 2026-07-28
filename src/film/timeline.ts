/**
 * The drawing kit the acts share — type scale, text fitting, easing envelopes
 * and the handful of primitives every act reaches for.
 *
 * This module is a LEAF: it must never import an act, or the player. That is
 * what lets the acts import it freely without creating an import cycle.
 * Sequencing and playback live in src/film/film.ts.
 */

import { PALETTE, clamp, ease, rand, range } from '../core/contract'

/* ==================================================================== *
 * The drawing kit
 *
 * Shared by every act so the film reads as one object: one type scale,
 * one frame, one set of colours. Declared as hoisted functions because
 * the acts import them back from this module.
 * ==================================================================== */

/** the two stacks the rest of the site uses — no webfonts, nothing to load */
export const DISPLAY = '"Hoefler Text","Iowan Old Style",Palatino,Georgia,serif'
export const MONO = 'ui-monospace,"SF Mono",Menlo,monospace'

export type FontKind = 'display' | 'mono'
export type Align = 'left' | 'center' | 'right'

export interface Pt {
  x: number
  y: number
}

/** the safe rectangle inside the letterbox, and the unit every size derives from */
export interface Frame {
  x: number
  y: number
  w: number
  h: number
  cx: number
  cy: number
  /** typographic unit — all type and geometry scales off this, never off pixels */
  s: number
}

export interface TypeScale {
  title: number
  head: number
  body: number
  small: number
  micro: number
}

/**
 * Content frame. Deliberately asymmetric: extra room at the bottom so the
 * picture never collides with the subtitle or the controls.
 */
export function frameOf(w: number, h: number): Frame {
  const padX = Math.max(w * 0.07, 16)
  const padTop = Math.max(h * 0.12, 22)
  const padBottom = Math.max(h * 0.22, 74)
  const fh = Math.max(80, h - padTop - padBottom)
  const fw = Math.max(80, Math.min(w - padX * 2, fh * 1.9))
  const x = (w - fw) / 2
  const y = padTop
  return { x, y, w: fw, h: fh, cx: x + fw / 2, cy: y + fh / 2, s: Math.min(fw, fh * 1.6) }
}

export function scale(F: Frame): TypeScale {
  return {
    title: Math.max(26, F.s * 0.115),
    head: Math.max(19, F.s * 0.062),
    body: Math.max(13, F.s * 0.04),
    small: Math.max(11, F.s * 0.028),
    micro: Math.max(9.5, F.s * 0.02),
  }
}

/** hairline width — thin, but never sub-pixel */
export function hair(F: Frame): number {
  return Math.max(1, F.s * 0.0016)
}

export function setFont(
  ctx: CanvasRenderingContext2D,
  size: number,
  kind: FontKind = 'display',
  weight = 400,
): void {
  ctx.font = `${weight} ${size.toFixed(2)}px ${kind === 'mono' ? MONO : DISPLAY}`
}

/**
 * Set the font, shrinking it until `text` fits `maxW`. Returns the size used
 * so callers can lay out around it.
 */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  size: number,
  kind: FontKind = 'display',
  weight = 400,
): number {
  setFont(ctx, size, kind, weight)
  const m = ctx.measureText(text).width
  if (m <= maxW || m === 0) return size
  const next = Math.max(8, size * (maxW / m))
  setFont(ctx, next, kind, weight)
  return next
}

/**
 * Set a letter-spaced font, shrinking it until the tracked line fits `maxW`.
 * Tracked width is linear in size, so one correction is exact.
 * `em` is the tracking as a fraction of the size.
 */
export function fitTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  size: number,
  em: number,
  kind: FontKind = 'mono',
  weight = 400,
): { size: number; track: number } {
  setFont(ctx, size, kind, weight)
  const full = trackedWidth(ctx, text, size * em)
  if (full <= maxW || full === 0) return { size, track: size * em }
  const next = Math.max(7, size * (maxW / full))
  setFont(ctx, next, kind, weight)
  return { size: next, track: next * em }
}

/** '#RRGGBB' + alpha → rgba(). PALETTE is the only source of the hex. */
export function withAlpha(css: string, a: number): string {
  const n = parseInt(css.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${clamp(a).toFixed(4)})`
}

/** fade in, then optionally out — the spine of every act's timing */
export function envelope(t: number, inA: number, inB: number, outA?: number, outB?: number): number {
  const up = ease(range(t, inA, inB))
  if (outA === undefined || outB === undefined) return up
  return up * (1 - ease(range(t, outA, outB)))
}

/** deterministic projector wobble in [1-amt, 1]. Never called when reduced. */
export function flick(t: number, amt = 0.3, hz = 18): number {
  const i = Math.floor(t * hz)
  return 1 - amt * (rand(i) * 0.6 + rand(i * 3 + 11) * 0.4)
}

/** the warm lift of a lit screen — every act sits on this */
export function wash(ctx: CanvasRenderingContext2D, w: number, h: number, k: number): void {
  if (k <= 0.002) return
  const g = ctx.createRadialGradient(w * 0.5, h * 0.44, 0, w * 0.5, h * 0.44, Math.max(w, h) * 0.75)
  g.addColorStop(0, withAlpha(PALETTE.horizonCss, 0.85 * k))
  g.addColorStop(0.5, withAlpha(PALETTE.horizonCss, 0.34 * k))
  g.addColorStop(1, withAlpha(PALETTE.horizonCss, 0))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

/** reset everything an act might have left behind */
export function reset(ctx: CanvasRenderingContext2D): void {
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.setLineDash([])
  ctx.lineDashOffset = 0
  ctx.lineWidth = 1
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

/** width of `text` drawn with manual letter-spacing */
export function trackedWidth(ctx: CanvasRenderingContext2D, text: string, tracking: number): number {
  let total = 0
  let n = 0
  for (const ch of text) {
    total += ctx.measureText(ch).width + tracking
    n++
  }
  return n > 0 ? total - tracking : 0
}

/** letter-spaced text — ctx.letterSpacing is not portable enough to rely on */
export function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: Align = 'left',
): void {
  drawTrackedEach(ctx, text, x, y, tracking, align, null, null)
}

/** the same, with per-character colour/alpha — used for letters arriving one by one */
export function drawTrackedEach(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: Align,
  color: string | null,
  alphaAt: ((i: number) => number) | null,
): void {
  const total = trackedWidth(ctx, text, tracking)
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x
  const prev = ctx.textAlign
  ctx.textAlign = 'left'
  let i = 0
  for (const ch of text) {
    const a = alphaAt ? alphaAt(i) : 1
    if (a > 0.004) {
      if (color) ctx.fillStyle = withAlpha(color, a)
      ctx.fillText(ch, cx, y)
    }
    cx += ctx.measureText(ch).width + tracking
    i++
  }
  ctx.textAlign = prev
}

/** greedy wrap. Set the font first. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []
  let cur = ''
  for (const word of text.split(/\s+/)) {
    if (!word) continue
    const next = cur ? `${cur} ${word}` : word
    if (cur && ctx.measureText(next).width > maxW) {
      out.push(cur)
      cur = word
    } else {
      cur = next
    }
  }
  if (cur) out.push(cur)
  return out
}

/** draw wrapped lines; returns the baseline just past the last one */
export function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lh: number,
  align: Align = 'left',
): number {
  const prev = ctx.textAlign
  ctx.textAlign = align
  let yy = y
  for (const l of lines) {
    ctx.fillText(l, x, yy)
    yy += lh
  }
  ctx.textAlign = prev
  return yy
}

/** one call: wrap `text` to `maxW` and draw it. Returns the next baseline. */
export function paragraph(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lh: number,
  align: Align = 'left',
): number {
  return drawLines(ctx, wrapText(ctx, text, maxW), x, y, lh, align)
}

/* ---------- paths ---------- */

function traverse(
  pts: Pt[],
  prog: number,
  ctx: CanvasRenderingContext2D | null,
): Pt | null {
  if (pts.length < 2) return pts[0] ?? null
  let total = 0
  let prev: Pt | null = null
  for (const p of pts) {
    if (prev) total += Math.hypot(p.x - prev.x, p.y - prev.y)
    prev = p
  }
  const want = total * clamp(prog)
  let run = 0
  let head: Pt | null = null
  prev = null
  if (ctx) ctx.beginPath()
  for (const p of pts) {
    if (!prev) {
      if (ctx) ctx.moveTo(p.x, p.y)
      head = p
      prev = p
      continue
    }
    const seg = Math.hypot(p.x - prev.x, p.y - prev.y)
    if (run + seg <= want || seg === 0) {
      if (ctx) ctx.lineTo(p.x, p.y)
      head = p
      run += seg
      prev = p
      continue
    }
    const k = (want - run) / seg
    const hx = prev.x + (p.x - prev.x) * k
    const hy = prev.y + (p.y - prev.y) * k
    if (ctx) ctx.lineTo(hx, hy)
    head = { x: hx, y: hy }
    break
  }
  if (ctx) ctx.stroke()
  return head
}

/** stroke the first `prog` of a polyline; returns the head point */
export function drawPath(ctx: CanvasRenderingContext2D, pts: Pt[], prog: number): Pt | null {
  if (prog <= 0.0005) return pts[0] ?? null
  return traverse(pts, prog, ctx)
}

/** the point `prog` of the way along a polyline, without drawing */
export function pointAt(pts: Pt[], prog: number): Pt | null {
  return traverse(pts, prog, null)
}

/** sample a cubic bezier into a polyline */
export function bezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 40): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const u = i / n
    const v = 1 - u
    const a = v * v * v
    const b = 3 * v * v * u
    const c = 3 * v * u * u
    const d = u * u * u
    out.push({
      x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    })
  }
  return out
}

/* ---------- marks ---------- */

/** a soft point of light — the film's only "glow", no bloom pass anywhere */
export function softDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  css: string,
  a = 1,
): void {
  if (a <= 0.004 || r <= 0) return
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, withAlpha(css, a))
  g.addColorStop(0.35, withAlpha(css, a * 0.4))
  g.addColorStop(1, withAlpha(css, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

export function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  ctx.arc(x, y, Math.max(0.2, r), 0, Math.PI * 2)
  ctx.fill()
}

export function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  ctx.arc(x, y, Math.max(0.2, r), 0, Math.PI * 2)
  ctx.stroke()
}

/** a small solid triangle — direction marks, arrowheads */
export function triangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  up: boolean,
): void {
  const d = up ? -1 : 1
  ctx.beginPath()
  ctx.moveTo(x, y + d * r)
  ctx.lineTo(x - r * 0.86, y - d * r * 0.6)
  ctx.lineTo(x + r * 0.86, y - d * r * 0.6)
  ctx.closePath()
  ctx.fill()
}

/**
 * The standing head of acts 1–4: a small amber act number and the line.
 * Returns the heading's baseline so acts can hang layout off it.
 */
export function header(
  ctx: CanvasRenderingContext2D,
  F: Frame,
  S: TypeScale,
  index: string,
  heading: string,
  a: number,
): number {
  const iy = F.y + S.micro * 1.15
  const hy = iy + S.head * 1.3
  if (a <= 0.004) return hy
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  setFont(ctx, S.micro, 'mono', 500)
  ctx.fillStyle = withAlpha(PALETTE.amberCss, 0.8 * a)
  drawTracked(ctx, index, F.x, iy, S.micro * 0.26, 'left')
  fitText(ctx, heading, F.w * 0.94, S.head, 'display', 400)
  ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.94 * a)
  ctx.fillText(heading, F.x, hy)
  return hy
}

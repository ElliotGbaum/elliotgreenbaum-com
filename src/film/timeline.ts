/**
 * The drawing kit the acts share — type scale, text fitting, easing envelopes
 * and the handful of primitives every act reaches for.
 *
 * This module is a LEAF: it must never import an act, or the player. That is
 * what lets the acts import it freely without creating an import cycle.
 * Sequencing and playback live in src/film/film.ts.
 */

import { PALETTE, PHONE, clamp, ease, rand, range } from '../core/contract'

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

/**
 * The display stack again, with LINING FIGURES. Every face in the stack
 * defaults to old-style figures, which sit at x-height and dip below the
 * line — right for a date inside a sentence, wrong for a figure that has to
 * be read as a figure: an old-style "1" is a small capital I, and "1M+" on
 * the TL;DR card read as "IM+". Canvas has no font-variant-numeric, but a
 * FontFace built from the same local faces can carry the feature, and Chrome,
 * Safari and Firefox all honour it on a canvas. Registered once, below; until
 * it resolves (local faces, so at once) the name falls through to DISPLAY.
 */
export const DISPLAY_LINING = `"Display Lining",${DISPLAY}`

if (typeof FontFace !== 'undefined' && typeof document !== 'undefined') {
  const src = ['Hoefler Text', 'Iowan Old Style', 'Palatino', 'Georgia']
    .map((f) => `local("${f}")`)
    .join(', ')
  const face = new FontFace('Display Lining', src, { featureSettings: '"lnum" 1' })
  face.load().then((f) => document.fonts.add(f), () => undefined)
}

export type FontKind = 'display' | 'mono' | 'lining'
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
 * Content frame.
 *
 * The bottom used to be given 22% of the picture, because a DOM subtitle sat
 * under the screen and the two would read as one column of text if the picture
 * ran too close to its own edge. There is no subtitle any more — the picture
 * carries every word the film says — so that reserve was 22% of the screen
 * held back for nothing, and the film was playing in the top two thirds of a
 * screen the size of a house. It is still asymmetric, because a picture with
 * equal margins reads as a slide, but only just.
 */
export function frameOf(w: number, h: number): Frame {
  const padX = Math.max(w * 0.06, 14)
  const padTop = Math.max(h * 0.095, 18)
  const padBottom = Math.max(h * 0.135, 44)
  const fh = Math.max(80, h - padTop - padBottom)
  const fw = Math.max(80, Math.min(w - padX * 2, fh * 2.0))
  const x = (w - fw) / 2
  const y = padTop
  return { x, y, w: fw, h: fh, cx: x + fw / 2, cy: y + fh / 2, s: Math.min(fw, fh * 1.6) }
}

/**
 * A PHONE READS THE FILM AT A LARGER SIZE, and this multiplier is the only
 * place that knows it. Every act takes its type from `scale()` and its
 * geometry from the frame, so this moves the words and nothing else: the
 * compositions stay where they were composed.
 *
 * WHY IT HAS TO BE HERE AND NOT ONLY IN THE CAMERA. Re-framing the shot is
 * the honest first answer and is also done — see `watchVantage` in
 * src/world/landmarks/projector.ts — but there is a ceiling on it: a phone
 * held upright already lands the screen across about ninety per cent of the
 * glass, so the whole of what re-framing can buy there is the last tenth. A
 * tenth of eight points is nine points. The rest has to come out of the type.
 *
 * A FIFTH, AND IT IS A JUDGEMENT. Everything downstream fits itself to the
 * frame — `fitText` shrinks a line that would overrun, act 9 and act 10 scale
 * their whole stack to the band they are given — so the acts absorb a step
 * like this rather than break on it, and the same machinery is what limits
 * how far it is worth going: every further step is eventually handed straight
 * back as one more line in a paragraph, or one more notch off a stack. All
 * twelve acts were looked at one at a time at 390 points at this step and
 * every one of them lands as composed. The floors below are untouched: they are
 * the floor for a tiny canvas — the contact sheet in src/filmstrip.ts draws
 * at 384 wide — and not for a phone.
 */
const PHONE_TYPE = 1.22

export function scale(F: Frame): TypeScale {
  const k = PHONE ? PHONE_TYPE : 1
  return {
    title: Math.max(26, F.s * 0.115 * k),
    head: Math.max(19, F.s * 0.062 * k),
    body: Math.max(13, F.s * 0.04 * k),
    small: Math.max(11, F.s * 0.028 * k),
    micro: Math.max(9.5, F.s * 0.02 * k),
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
  const stack = kind === 'mono' ? MONO : kind === 'lining' ? DISPLAY_LINING : DISPLAY
  ctx.font = `${weight} ${size.toFixed(2)}px ${stack}`
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

/* ---------- pace ----------
 *
 * One film, one pace. Every act used to set its own, and the result was that
 * the most important line in an act — the hedge in 02, "the hard part moved"
 * in 04 — landed four tenths of a second before the beat holding it started
 * to dissolve. It was legible in a still and unreadable at speed.
 *
 * Three numbers hold the whole film to one rhythm, and every act obeys them:
 *
 *   RAMP       a line of type takes this long to arrive. Decorative marks —
 *              a beam sweeping, a bar finding its level, a pulse running a
 *              wire — set their own; type does not.
 *
 *   DWELL      the floor. Nothing readable is allowed to reach full alpha
 *              and then begin leaving, or have the act cut under it, in less
 *              than this. THIS IS THE RULE THAT KEEPS GETTING BROKEN: it is
 *              broken by adding one more thing to a beat and letting the
 *              beat's out-point stay where it was. Move the out-point, or
 *              lengthen the act. An act's DURATION is cheap — the scrubber
 *              and the timecode are both derived, so nothing else has to
 *              change — and a line nobody can read is not.
 *
 *   CROSSFADE  a beat hands the frame to the next one over this long, and
 *              the incoming beat's in-point IS the outgoing beat's out-point,
 *              so the two overlap instead of cutting through black.
 *
 * The other half of the same discipline: no HOLES. More than about a second
 * where nothing on screen is arriving, leaving or moving reads as the thing
 * having crashed. A held picture is not a hole — that is what DWELL buys —
 * but a held picture with nothing left to say is.
 */

/** how long a line of type takes to arrive */
export const RAMP = 0.7
/** the least time anything readable holds at full before it starts to go */
export const DWELL = 1.25
/** how long a beat takes to hand the frame to the next one */
export const CROSSFADE = 0.55

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

/**
 * Wrap, then BALANCE — same line count, evened out.
 *
 * Greedy wrapping fills every line to the brim and pours the remainder into the
 * last one, which is how "From there, I took a role at Cassidy as an AI
 * Solutions Consultant." came out as a full line and then the orphan word
 * "Consultant." sitting on its own in the middle of the frame. Centred type
 * makes that worse than it looks left-aligned: the short line is not a ragged
 * edge, it is a lonely object with air on both sides of it.
 *
 * So: wrap at `maxW`, note how many lines that took, then squeeze the width
 * down until one more line would be needed and wrap again at the last width
 * that still fits in the same count. Same words, same number of lines, no
 * orphan. Single-line text is returned untouched — there is nothing to balance.
 *
 * Call it for anything CENTRED. Left-aligned copy has a rag and does not need it.
 */
export function balanceText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string[] {
  const full = wrapText(ctx, text, maxW)
  if (full.length < 2) return full

  let lo = maxW * 0.45
  let hi = maxW
  // eight halvings put the answer inside a fifth of a percent of the column,
  // which is finer than a word boundary — no point iterating past it
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2
    if (wrapText(ctx, text, mid).length > full.length) lo = mid
    else hi = mid
  }
  return wrapText(ctx, text, hi)
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

/* ---------- dimension ----------
 *
 * The picture is flat, and the acts are vector drawings, and both of those are
 * on purpose — but the film is cut into out of a world with real depth in it,
 * and a rectangle of perfectly flat line art after that reads as a slide.
 *
 * So a handful of marks get a second face. Everything here assumes ONE light,
 * up and to the left, which is where the projector's lamp is relative to the
 * screen: an extruded mark shows its top and its right side, and nothing ever
 * shows a face that light could not reach. Depths are small — a few percent of
 * F.s — because this is a hint of a third dimension, not an isometric diagram.
 */

/** how far a face is offset per unit of depth. Shallow: this is a hint. */
const FACE_X = 1
const FACE_Y = -0.62

/** the far corner of a mark extruded by `d` — where its lit faces live */
export function faceOffset(d: number): Pt {
  return { x: d * FACE_X, y: d * FACE_Y }
}

/**
 * The two lit faces of an extruded rectangle: the top, and the right side.
 * The caller draws the front face itself, because the front is the one that
 * usually wants a gradient or a stroke of its own.
 */
export function block(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  d: number,
  css: string,
  a: number,
): void {
  if (a <= 0.004 || d <= 0 || w <= 0 || h <= 0) return
  const o = faceOffset(d)

  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + o.x, y + o.y)
  ctx.lineTo(x + w + o.x, y + o.y)
  ctx.lineTo(x + w, y)
  ctx.closePath()
  ctx.fillStyle = withAlpha(css, a * 0.8)
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(x + w, y)
  ctx.lineTo(x + w + o.x, y + o.y)
  ctx.lineTo(x + w + o.x, y + h + o.y)
  ctx.lineTo(x + w, y + h)
  ctx.closePath()
  ctx.fillStyle = withAlpha(css, a * 0.4)
  ctx.fill()
}

/** the same idea for anything already pathed: fill a polygon */
export function polygon(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  if (pts.length < 3) return
  ctx.beginPath()
  let first = true
  for (const p of pts) {
    if (first) {
      ctx.moveTo(p.x, p.y)
      first = false
    } else ctx.lineTo(p.x, p.y)
  }
  ctx.closePath()
}

/**
 * A card lying slightly off the picture plane: the shadow it casts, drawn
 * before whatever sits on it. Cheap, and it is the single strongest cue that
 * two things are at different distances.
 */
export function lift(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  d: number,
  a: number,
): void {
  if (a <= 0.004 || d <= 0) return
  const o = faceOffset(-d)
  ctx.save()
  ctx.shadowColor = withAlpha('#000000', 0.5 * a)
  ctx.shadowBlur = d * 3
  ctx.shadowOffsetX = o.x
  ctx.shadowOffsetY = o.y
  ctx.fillStyle = withAlpha('#000000', 0.22 * a)
  ctx.fillRect(x, y, w, h)
  ctx.restore()
}

/** run `paint` with a soft halo around everything it draws */
export function halo(
  ctx: CanvasRenderingContext2D,
  css: string,
  blur: number,
  a: number,
  paint: () => void,
): void {
  ctx.save()
  ctx.shadowColor = withAlpha(css, clamp(a))
  ctx.shadowBlur = blur
  paint()
  ctx.restore()
}

/**
 * A floor receding to a vanishing point, under whatever the act is showing.
 *
 * This is the one mark in the kit that is purely about depth — it says "there
 * is a ground here and it goes away from you" in about eight lines of stroke,
 * and everything drawn above it inherits the read. Kept at a whisper: any
 * louder and it competes with the type, which is the one thing on the screen
 * that has to survive being thrown thirty units.
 */
export function floorGrid(
  ctx: CanvasRenderingContext2D,
  F: Frame,
  horizonY: number,
  nearY: number,
  a: number,
  drift = 0,
): void {
  if (a <= 0.004 || nearY <= horizonY) return
  const depth = nearY - horizonY
  const hw = hair(F)
  const vx = F.cx

  ctx.save()
  ctx.lineWidth = hw
  ctx.strokeStyle = withAlpha(PALETTE.buffCss, 0.055 * a)

  // rails, converging on the vanishing point
  const RAILS = 9
  for (let i = 0; i <= RAILS; i++) {
    const u = (i / RAILS) * 2 - 1
    ctx.beginPath()
    ctx.moveTo(vx + u * F.w * 0.06, horizonY)
    ctx.lineTo(vx + u * F.w * 1.15, nearY)
    ctx.stroke()
  }

  // sleepers, spaced so they crowd toward the horizon. `drift` moves the whole
  // set toward the viewer without ever changing how many there are.
  const STEPS = 7
  for (let i = 0; i < STEPS; i++) {
    const u = ((i + drift) % STEPS) / STEPS
    const k = u * u * u
    const y = horizonY + depth * k
    const spread = 0.06 + (1.15 - 0.06) * k
    ctx.strokeStyle = withAlpha(PALETTE.buffCss, 0.075 * a * (0.25 + 0.75 * k))
    ctx.beginPath()
    ctx.moveTo(vx - F.w * spread, y)
    ctx.lineTo(vx + F.w * spread, y)
    ctx.stroke()
  }
  ctx.restore()
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

/**
 * A travelling point with a short tail behind it.
 *
 * The film's only motion blur, and it is not really blur: it is four samples
 * of the same path, dimmer the further back they are. A bare dot moving along
 * a line at 30fps reads as a dot that keeps being redrawn somewhere else; give
 * it a wake and the eye reads speed instead.
 */
export function comet(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  prog: number,
  r: number,
  css: string,
  a: number,
  tail = 0.1,
): Pt | null {
  const head = pointAt(pts, prog)
  if (!head || a <= 0.004) return head
  for (let i = 4; i >= 1; i--) {
    const p = pointAt(pts, Math.max(0, prog - (tail * i) / 4))
    if (!p) continue
    softDot(ctx, p.x, p.y, r * (1 - i * 0.15), css, a * 0.32 * (1 - i / 5))
  }
  softDot(ctx, head.x, head.y, r, css, a)
  return head
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
 * The standing head of the middle acts: a small amber act number and the line.
 * Returns the baseline of the LAST line of the heading, so acts can hang their
 * layout off it.
 *
 * The heading wraps. Most of them are three words and never will, but one of
 * them is a whole sentence — and a sentence squeezed onto one line by fitText
 * arrives at about 14px, which is smaller than the act number above it. Two
 * lines at heading size is the right answer; anything that would need three
 * gets shrunk until it doesn't.
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
  const maxW = F.w * 0.94

  let size = S.head
  setFont(ctx, size, 'display', 400)
  let lines = wrapText(ctx, heading, maxW)
  for (let guard = 0; lines.length > 2 && guard < 8; guard++) {
    size *= 0.88
    setFont(ctx, size, 'display', 400)
    lines = wrapText(ctx, heading, maxW)
  }
  if (lines.length <= 1) size = fitText(ctx, heading, maxW, size, 'display', 400)

  const lh = size * 1.16
  const first = iy + size * 1.3
  const last = first + (lines.length - 1) * lh
  if (a <= 0.004) return last

  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  setFont(ctx, S.micro, 'mono', 500)
  ctx.fillStyle = withAlpha(PALETTE.amberCss, 0.8 * a)
  drawTracked(ctx, index, F.x, iy, S.micro * 0.26, 'left')

  setFont(ctx, size, 'display', 400)
  ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.94 * a)
  drawLines(ctx, lines, F.x, first, lh, 'left')
  return last
}

/**
 * The small tracked mono line that hangs under a heading — the date at UPenn,
 * the two firms, the job title at Cassidy.
 *
 * ONE SIZE FOR ALL OF THEM, WHICH IS THE ENTIRE REASON THIS FUNCTION EXISTS.
 * Four acts drew this line and all four rolled their own: two at `micro` with
 * different tracking, one at `small * 0.9`, each hung off `hy` by its own
 * multiple of its own size. On screen that is four subtitles at three sizes
 * sitting at three different distances under four otherwise identical heads,
 * and it reads as four different kinds of thing rather than as one recurring
 * one. It is `small` now — a step up from where most of them were, because at
 * `micro` the date under UPenn was the smallest type in the film and it is a
 * fact somebody might actually want to read.
 *
 * THE BASELINE IS RETURNED WHETHER OR NOT ANYTHING IS DRAWN, and it does not
 * depend on `a`. Everything an act stacks below this is measured off the value
 * that comes back, so a baseline that moved while the line faded in would walk
 * the whole act down the frame over two-thirds of a second. The geometry
 * settles first; only the ink waits.
 *
 * The offset clears the heading's descenders with room to spare — "Cassidy"
 * has a y in it, and at anything under about two of its own sizes the mono line
 * is printed through the tail of it.
 */
export function subhead(
  ctx: CanvasRenderingContext2D,
  F: Frame,
  S: TypeScale,
  hy: number,
  text: string,
  a: number,
  css: string = PALETTE.amberCss,
): number {
  const size = S.small
  const y = hy + size * 2.2
  if (!text || a <= 0.004) return y
  const fit = fitTracked(ctx, text, F.w * 0.86, size, 0.22, 'mono', 400)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = withAlpha(css, 0.84 * a)
  drawTracked(ctx, text, F.x, y, fit.track, 'left')
  return y
}

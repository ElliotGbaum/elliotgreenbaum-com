/**
 * ACT 2 — Music.
 *
 * One idea: the curiosity in act 1 was never only about the board, so this act
 * shows two things at once. A boy singing with an electric guitar draws itself
 * on the left; the same boy on an alto sax draws itself on the right; both stay
 * up. Two drawings that are still on screen when the act ends is the only
 * composition in the film that does that, and it is the point — the act is
 * about the *and*.
 *
 * THE DRAWINGS ARE HIM NOW, NOT THE INSTRUMENTS, and everything else about
 * this act followed from that.
 *
 * They used to be a bare guitar and a bare saxophone standing on end, which
 * was right for the labels they carried: "Guitar / age 5 / talent shows, open
 * mics, gigs" and "Alto sax / jazz band, grade school to college". A label
 * naming a thing wants a picture of the thing, and two boys who differ only in
 * what they are holding are two smudges.
 *
 * The captions are stories now — a specific talent show, a specific song, a
 * specific town party — and a story wants the person in it. So the act lost
 * three things it no longer needs: the instrument NAMES (the picture says
 * guitar faster than the word does), the hand-lettered "age 5" callout (the
 * caption carries the year), and the closing line under the pair (there is
 * nothing left to sum up — the two captions ARE the act).
 *
 * WHAT THE CAPTIONS COST. They are long, they WRAP, and the wrap is measured
 * before the pictures are sized, not after. Both captions are laid out at the
 * same size and the block is as tall as the taller of the two, so the pair of
 * drawings sit on one line however the text breaks. And CAP_W is bounded by
 * the gap between the columns: the first pass let each caption run wider than
 * the space between the two centres and "…by Aerosmith" printed straight
 * through "Playing Sax at…".
 */

import { clamp, ease, easeOut, range } from '../../core/contract'
import { INK } from '../palette'
import type { Act, ActRenderContext } from '../../core/contract'
import type { Pt } from '../timeline'
import {
  RAMP,
  disc,
  drawLines,
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
import type { SketchBox } from '../sketch'
import { drawSketch, prepare } from '../sketch'
import { GUITAR } from '../sketches/guitar'
import { SAX } from '../sketches/sax'
import copy from '../../content/film.json'

const C = copy.act2
/**
 * 10.4 — back up where it started, having gone down to 9.6 in between. The trim
 * was made on the captions alone: they are three words each now, so the second
 * one is read a second after it arrives and the rest looked like a still frame.
 * What that missed is that the PICTURES are the act. The sax pen lifts at 6.3
 * and both drawings are on screen together for the first time, side by side,
 * and that is the frame this act exists to make. It gets four seconds now
 * instead of three.
 */
/* 10.1, down from 10.4. The sax caption lands at 6.9 and the rest is a held
   frame; three tenths came off that hold, not off the four seconds above. */
const DURATION = 10.1

const G = prepare(GUITAR)
const X = prepare(SAX)

/** each drawing gets about two and a half seconds of pen, a beat apart */
const G_A = 0.4
const G_B = 3.0
const X_A = 3.7
const X_B = 6.3

/** each caption lands as its own drawing finishes */
const G_CAP = 2.9
const X_CAP = 6.2

function draw(c: ActRenderContext): void {
  const { ctx, w, h, t, reduced } = c
  reset(ctx)

  const F = frameOf(w, h)
  const S = scale(F)
  const hw = hair(F)
  wash(ctx, w, h, 0.85)

  const hy = header(ctx, F, S, C.index, C.heading, easeOut(range(t, -0.3, 0.7)))

  /* How far apart the two columns stand, and therefore the widest a caption
     under either of them may be. These two numbers are a pair, and a caption
     may never be wider than the gap between the centres. */
  const COL = F.w * 0.23
  const CAP_W = F.w * 0.42

  /* ---------------- measure the captions, then size the band ----------------
     The block is as tall as the taller caption, so both drawings stand on the
     same line whatever the wrap does. */
  const capSize = S.small
  const capLh = capSize * 1.42
  setFont(ctx, capSize, 'display', 400)
  const gLines = wrapText(ctx, C.guitarNote, CAP_W)
  const xLines = wrapText(ctx, C.saxNote, CAP_W)
  const capRows = Math.max(gLines.length, xLines.length)

  const footY = F.y + F.h * 0.99
  const capTop = footY - (capRows - 1) * capLh
  const bandTop = hy + S.micro * 0.6
  const bandBot = capTop - capSize * 2.2
  const bandH = Math.max(28, bandBot - bandTop)

  /** the lit tip of the pen, shared by both drawings */
  const nib = (a: number) => (p: Pt) => {
    softDot(ctx, p.x, p.y, bandH * 0.1, INK.glow, 0.45 * a)
    ctx.fillStyle = withAlpha(INK.text, 0.95 * a)
    disc(ctx, p.x, p.y, hw * 1.4)
  }

  /* ---------------- the two drawings ----------------
     Both figures are tall and narrow, so they are given generous boxes and
     fit themselves inside — `drawSketch` returns the rectangle it actually
     used, and the stage rules hang off that rather than off the box, which is
     mostly empty air either side. */
  const half = F.w * 0.44
  const gA = easeOut(range(t, 0.2, 0.9))
  const xA = easeOut(range(t, 3.5, 4.2))

  const gFit = drawSketch(
    ctx,
    G,
    { x: F.cx - COL - half / 2, y: bandTop, w: half, h: bandH },
    clamp(range(t, G_A, G_B)),
    { alpha: 0.9 * gA, hair: hw, color: INK.text, pen: reduced ? undefined : nib(gA) },
  )

  const xFit = drawSketch(
    ctx,
    X,
    { x: F.cx + COL - half / 2, y: bandTop, w: half, h: bandH },
    clamp(range(t, X_A, X_B)),
    { alpha: 0.9 * xA, hair: hw, color: INK.text, pen: reduced ? undefined : nib(xA) },
  )

  /* the boards they are standing on — one mark each, and a figure stops
     floating and starts being on a stage */
  ctx.textAlign = 'center'
  const RULE = CAP_W * 0.6
  const stage = (fit: SketchBox, born: number) => {
    const k = easeOut(range(t, born, born + 1.1))
    if (k <= 0.004) return
    ctx.fillStyle = withAlpha(INK.muted, 0.18 * k)
    // ONE width for both, not each drawing's own. Sized off `fit.w`, the
    // guitar's rule came out nearly twice the sax's — the sax figure is a
    // narrow drawing — which is unbalanced furniture under balanced objects.
    ctx.fillRect(fit.x + fit.w / 2 - (RULE / 2) * k, fit.y + fit.h * 0.995, RULE * k, hw)
  }
  stage(gFit, 2.4)
  stage(xFit, 5.7)

  /* ---------------- the two captions ----------------
     Wrapped, centred under their own drawing, and arriving a line at a time
     so a three-line caption is not a paragraph landing in one frame. */
  ctx.textBaseline = 'alphabetic'
  const caption = (fit: SketchBox, lines: string[], born: number) => {
    setFont(ctx, capSize, 'display', 400)
    const cx = fit.x + fit.w / 2
    let i = 0
    for (const line of lines) {
      const a = ease(range(t, born + i * 0.28, born + RAMP + i * 0.28))
      if (a > 0.004) {
        ctx.fillStyle = withAlpha(INK.text, 0.92 * a)
        drawLines(ctx, [line], cx, capTop + i * capLh, capLh, 'center')
      }
      i++
    }
  }
  caption(gFit, gLines, G_CAP)
  caption(xFit, xLines, X_CAP)

  ctx.textAlign = 'left'
}

export const act2: Act = {
  id: 'act2',
  duration: DURATION,
  chapter: C.chapter,
  caption: C.caption,
  draw,
}

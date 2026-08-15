/**
 * ACT 0 — Title.
 *
 * One idea, said twice: the beam strikes a dead screen and somebody starts
 * writing on it. On the right the greeting TYPES ITSELF, one character at a
 * time behind a caret; on the left a face arrives one stroke at a time, the
 * way a person sketches, with the pen's tip lit. Two hands at work on the same
 * sheet — which is the only reason the act can be five seconds long and still
 * feel like an opening rather than a slide.
 *
 * THE TYPING IS A STAMP, NOT A FADE, and that is this pass's whole change.
 *
 * It used to be one line: every character ramped its alpha from 0 to 1 over an
 * eighth of a second and that was the entire effect. Legible, correctly timed,
 * and completely inert — fourteen characters arriving by dissolve read as a
 * line of type being switched on in fourteen pieces, not as somebody typing.
 * Three things fix it and they are all in `stamp` below:
 *
 *   SCALE. A character lands at 1.3× and settles to 1 over about a third of a
 *   keystroke. That is the single strongest cue; on its own it doubles how
 *   physical the line feels. It scales about its OWN centre and baseline, so
 *   nothing beside it moves — see the tracking note.
 *
 *   HEAT. The character just struck is drawn in lit amber and cools to buff
 *   over the next two keystrokes, so there is always a warm head to the line
 *   and a settled tail behind it. That is what a struck key looks like and it
 *   is also, conveniently, what draws the eye along the word.
 *
 *   THE STRIKE. One soft dot of light behind the newest character, gone in a
 *   fifth of a second. It is the impact.
 *
 * THE TRACKING IS FIXED, and it has to stay that way. The title used to settle
 * from wide letter-spacing into tight as it faded up, which is a lovely move
 * for a line that arrives whole and a disaster for one that arrives a letter
 * at a time: every new character shoves the ones before it sideways, and the
 * eye reads a nervous line rather than a typed one. The stamp above is
 * deliberately a scale about a fixed centre for the same reason — the pen
 * moves, the page does not.
 *
 * The face is drawn, not traced — thirty-one deliberate marks, in
 * src/film/sketches/portrait.ts. It was an edge-detected photograph for a
 * while, and at this size that is ninety strokes that resolve into a smudge.
 */

import { PALETTE, clamp, ease, easeOut, range } from '../../core/contract'
import type { Act, ActRenderContext } from '../../core/contract'
import {
  drawTracked,
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
import { drawSketch, prepare } from '../sketch'
import { PORTRAIT } from '../sketches/portrait'
import copy from '../../content/film.json'

const C = copy.act0
/**
 * 4.8, and it went 5.4 → 5.1 → 4.8. Every trim has come out of the same place:
 * the hold at the end, never the typing, which is why the greeting still lands
 * one character at a time at exactly the rate it always did.
 *
 * WHAT THE HOLD IS MEASURED AGAINST HAS MOVED, though, and the old note here
 * was out of date about it. It said the last arrival was the small line under
 * the rule at 3.9 — but `sub` is blank in film.json now and the act skips the
 * whole block, so the last thing that happens on this frame is the RULE
 * finishing its travel at 3.45. That leaves 1.35 seconds of a finished title
 * card, which is a beat rather than a pause. Restore `sub` and this wants to go
 * back up, because 3.9 plus a hold is a longer act than 3.45 plus one.
 */
const DURATION = 4.8

const FACE = prepare(PORTRAIT)

/** letter-spacing, in ems. One number, never animated — see the note above. */
const TRACK = 0.02

/** the title starts typing here… */
const TYPE_A = 0.5
/**
 * …at this many characters a second.
 *
 * It was 6.4, which put the last letter down at 2.74s and left the act with
 * barely a second to hold a finished frame. A stamped character reads at twice
 * the speed a dissolving one does — the scale change is legible in three
 * frames where an alpha ramp needs eight — so the rate went up with the effect
 * and the act got its hold back.
 */
const CPS = 8.2

const CHARS = [...C.title]
/** …and is finished here. Derived, so lengthening the greeting in film.json
 *  re-times the rest of the act instead of quietly overrunning it. */
const TYPE_B = TYPE_A + CHARS.length / CPS

/** the sketch runs across these seconds — the spine of the act */
const DRAW_A = 0.45
const DRAW_B = 3.0

/** the caret retires over this stretch, as the small line takes over */
const CARET_OUT_A = 2.9
const CARET_OUT_B = 3.4

/**
 * How a single character looks `age` keystrokes after it was struck.
 *
 * One function, so the caret, the strike flash and the character itself can
 * never disagree about where in its life a letter is.
 */
function stamp(age: number): { alpha: number; size: number; heat: number } {
  if (age <= 0) return { alpha: 0, size: 1, heat: 0 }
  // arrival takes a third of a keystroke: fast enough to read as a key going
  // down, slow enough not to alias at 30fps
  const k = easeOut(clamp(age * 3))
  return {
    alpha: k,
    size: 1 + 0.3 * (1 - k),
    // cools over the next two characters, so the line always has a warm head
    heat: clamp(1 - age * 0.5),
  }
}

function draw(c: ActRenderContext): void {
  const { ctx, w, h, t, reduced } = c
  reset(ctx)

  const F = frameOf(w, h)
  const S = scale(F)
  const hw = hair(F)
  const lamp = reduced ? 1 : flick(t, 0.3)

  /* ---- the gate opens ---- */
  const open = easeOut(range(t, 0.06, 0.85))
  const lit = easeOut(range(t, 0.04, 1.4))
  const gate = h * open

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, h * 0.5 - gate * 0.5, w, gate)
  ctx.clip()
  wash(ctx, w, h, lit * lamp)
  ctx.restore()

  /* ---- the seam of the beam striking ---- */
  const seam = (1 - ease(range(t, 0.1, 0.85))) * lamp
  if (seam > 0.004) {
    softDot(ctx, w * 0.5, h * 0.5, Math.max(w, h) * 0.4, PALETTE.glowCss, 0.16 * seam)
    const bw = w * (0.2 + 0.8 * easeOut(range(t, 0, 0.32)))
    const bh = Math.max(1, h * 0.0035)
    const g = ctx.createLinearGradient(w * 0.5 - bw * 0.5, 0, w * 0.5 + bw * 0.5, 0)
    g.addColorStop(0, withAlpha(PALETTE.glowCss, 0))
    g.addColorStop(0.5, withAlpha(PALETTE.glowCss, 0.95 * seam))
    g.addColorStop(1, withAlpha(PALETTE.glowCss, 0))
    ctx.fillStyle = g
    ctx.fillRect(w * 0.5 - bw * 0.5, h * 0.5 - bh * 0.5, bw, bh)
  }

  /* ---- the two columns ----
     The portrait is squared off against the band, the words take what is
     left. On a narrow frame there is no room for two columns, so the face
     goes behind the type instead of beside it and drops to a whisper. */
  const stacked = F.w < F.h * 1.25
  const boxH = F.h * (stacked ? 0.98 : 0.96)
  const boxW = boxH * FACE.aspect
  const px = stacked ? F.cx - boxW / 2 : F.x + F.w * 0.015
  const py = F.y + (F.h - boxH) / 2

  const drawK = clamp(range(t, DRAW_A, DRAW_B))
  const faceA = (stacked ? 0.3 : 1) * clamp(easeOut(range(t, 0.55, 1.2)))

  if (faceA > 0.004 && drawK > 0.0005) {
    // the sheet the drawing is on — enough lift that the lines have something
    // to sit against, never enough to read as a panel
    softDot(ctx, px + boxW * 0.5, py + boxH * 0.44, boxW * 0.95, PALETTE.glowCss, 0.055 * faceA * lamp)

    drawSketch(
      ctx,
      FACE,
      { x: px, y: py, w: boxW, h: boxH },
      drawK,
      {
        alpha: 0.88 * faceA,
        hair: hw,
        color: PALETTE.buffCss,
        pen: reduced
          ? undefined
          : (p) => {
              softDot(ctx, p.x, p.y, boxW * 0.07, PALETTE.glowCss, 0.5 * faceA)
              ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.95 * faceA)
              ctx.beginPath()
              ctx.arc(p.x, p.y, hw * 1.5, 0, Math.PI * 2)
              ctx.fill()
            },
      },
    )
  }

  /* ---- the words ---- */
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  const colX = stacked ? F.cx : px + boxW + F.w * 0.05
  const colW = stacked ? F.w * 0.96 : F.x + F.w - colX
  const anchor = stacked ? F.cx : colX
  const centred = stacked

  // Fitted at the tracking it will actually be drawn at — there is no settle
  // any more, so the fit is exact rather than a widest case. Fitted at 1.0 and
  // NOT at the 1.3 a character momentarily reaches: an incoming letter is
  // allowed to overhang, because it is back inside the column three frames
  // later and nothing else is ever there to collide with.
  const size = fitTracked(ctx, C.title, colW * 0.98, S.title, TRACK, 'display', 400).size
  const track = size * TRACK
  const baseline = F.cy + size * 0.16

  /* ---- the typing ----
     `typed` is a fractional character count, so the reveal is a pure function
     of t and scrubbing lands mid-word exactly where playing would. Reduced
     motion gets the settled line and no stamp: a letter that springs is
     exactly the kind of motion the setting is asking us not to make. */
  const typed = Math.max(0, (t - TYPE_A) * CPS)
  const total = trackedWidth(ctx, C.title, track)
  const startX = centred ? anchor - total / 2 : anchor

  {
    let cx = startX
    let i = 0
    for (const ch of C.title) {
      const cw = ctx.measureText(ch).width
      const s = reduced ? { alpha: typed > i ? 1 : 0, size: 1, heat: 0 } : stamp(typed - i)
      if (s.alpha > 0.004 && ch !== ' ') {
        // the strike: one soft dot behind the character, gone in a fifth of a
        // second. Drawn first, so the letter sits on top of its own flash.
        if (s.heat > 0.004) {
          softDot(
            ctx,
            cx + cw / 2,
            baseline - size * 0.3,
            size * (0.5 + 0.7 * s.heat),
            PALETTE.glowCss,
            0.34 * s.heat * s.alpha * lamp,
          )
        }
        // heat: lit amber at the head of the line, cooling to buff behind it.
        // A hard switch rather than a blend — two colours is the film's whole
        // palette and a per-character interpolation between them is a gradient
        // nobody asked for.
        const colour = s.heat > 0.45 ? PALETTE.amberLitCss : PALETTE.buffCss
        ctx.save()
        ctx.translate(cx + cw / 2, baseline)
        if (s.size !== 1) ctx.scale(s.size, s.size)
        ctx.fillStyle = withAlpha(colour, s.alpha * (0.9 + 0.1 * lamp))
        ctx.fillText(ch, -cw / 2, 0)
        ctx.restore()
      }
      cx += cw + track
      i++
    }
  }

  /* ---- the caret ----
     Where the next character is about to land: the whole reason the line reads
     as typed rather than as one that happens to fade in unevenly. It retires
     once the small line arrives — so the settled frame reduced motion draws
     has no cursor in it, which is right: nothing is being typed by then. */
  const caretA = (1 - ease(range(t, CARET_OUT_A, CARET_OUT_B))) * clamp(range(t, TYPE_A - 0.2, TYPE_A))
  if (caretA > 0.004) {
    const done = Math.min(CHARS.length, Math.floor(typed))
    let cx = startX + (done > 0 ? trackedWidth(ctx, CHARS.slice(0, done).join(''), track) + track : 0)

    // Past the character currently landing, not on top of it: `done` is the
    // index of the letter mid-stamp, so parking the caret at its pen position
    // draws the bar through the glyph. It clears the letter's *scaled* edge, so
    // the overshoot of the stamp can't reach it either — which means the caret
    // slides back a hair as that letter settles, the pen finishing the stroke.
    if (typed > 0 && done < CHARS.length) {
      const cw = ctx.measureText(CHARS[done]).width
      cx += cw * (reduced ? 1 : 0.5 + 0.5 * stamp(typed - done).size) + track
    }

    // solid while it is working, blinking once it has stopped — the same tell
    // every text cursor has ever used
    const blinking = t >= TYPE_B && !reduced
    const on = blinking ? (((t - TYPE_B) * 1.7) % 1 < 0.55 ? 1 : 0.12) : 1
    const a = caretA * on * lamp

    // the head of the pen, same as the sketch's
    softDot(ctx, cx, baseline - size * 0.3, size * 1.1, PALETTE.glowCss, 0.32 * a)
    ctx.fillStyle = withAlpha(PALETTE.amberCss, 0.85 * a)
    ctx.fillRect(cx, baseline - size * 0.72, Math.max(1.5, size * 0.05), size * 0.86)
  }

  // one soft flare behind the finished line, as the last character lands
  const flare = ease(range(t, TYPE_B - 0.35, TYPE_B + 0.35)) * (1 - ease(range(t, TYPE_B + 0.6, TYPE_B + 1.7)))
  if (flare > 0.004) {
    const fx = centred ? anchor : anchor + total * 0.5
    softDot(ctx, fx, baseline - size * 0.32, size * 3.2, PALETTE.glowCss, 0.07 * flare * lamp)
  }

  /* ---- rule ---- */
  const ruleP = easeOut(range(t, 2.75, 3.45))
  if (ruleP > 0.004) {
    const full = Math.min(colW * 0.94, total * 1.02)
    const rw = full * ruleP
    const ry = baseline + size * 0.5
    const rx = centred ? anchor - rw * 0.5 : anchor
    ctx.fillStyle = withAlpha(PALETTE.amberCss, 0.5 * ruleP)
    ctx.fillRect(rx, ry, rw, hw)
    // the head of the rule stays lit for as long as it is travelling, which is
    // the last thing in the act that moves
    if (ruleP < 1 && !reduced) softDot(ctx, rx + rw, ry, size * 0.6, PALETTE.glowCss, 0.4)
  }

  /* ---- the small line ---- */
  const subA = ease(range(t, 3.25, 3.9))
  if (subA > 0.004 && C.sub) {
    setFont(ctx, S.small, 'mono', 400)
    ctx.fillStyle = withAlpha(PALETTE.sageCss, 0.62 * subA)
    drawTracked(
      ctx,
      C.sub,
      anchor,
      baseline + size * 0.5 + S.small * 2.4,
      S.small * 0.3,
      centred ? 'center' : 'left',
    )
  }
}

export const act0: Act = {
  id: 'act0',
  duration: DURATION,
  chapter: C.chapter,
  caption: C.caption,
  draw,
}

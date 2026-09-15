/**
 * ACT 9 — E&B.
 *
 * Two beats, dissolved into each other.
 *
 *   One: the company names itself in the head, and one sentence sits alone in
 *   the middle of an empty frame saying what it was.
 *   Two: the sentence goes and the things we actually built arrive as cards.
 *
 * THE ACT IS NAMED AFTER THE COMPANY. It used to be headed "We worked with
 * local SMBs", and the company's own name landed four seconds earlier, big, in
 * the middle of the last frame of the act before it — a title card at the END
 * of one act, introducing the subject of the next. That is a caption on the
 * wrong picture. The name is the heading here, the way "Cassidy" heads act 10
 * and "NewsGlide" heads act 8, and the sentence that used to arrive with it
 * opens this act instead of closing the previous one.
 *
 * THE AGENT GRAPH IS GONE, and this is the second thing that used to be here to
 * come out. Beat one was a supervisor-pattern graph — an entry pill, an
 * orchestrator, three specialists with tools hanging off them, dashed return
 * edges for the cycles — that drew itself and then ran a pulse round the whole
 * itinerary. It was the best-observed drawing in the film and it was answering
 * a question nobody in the room had asked. Nothing in the act claims the work
 * was built on a supervisor pattern; the graph was a picture of a category, not
 * of anything on this list, and it cost nine of the act's fourteen seconds
 * before the first real project appeared. What replaced it is what he actually
 * says about the company, held long enough to read, and every second of the act
 * is now about the work.
 *
 * A CARD CAN CARRY A REAL LINK. Give one a `label` and an `href` in film.json
 * and it publishes the rectangle it just drew into src/film/links.ts, in canvas
 * pixels; main.ts resolves the click geometrically off a ray cast at the
 * screen. Two rules: publish the rect in the SAME frame you draw the type,
 * from the same numbers, and publish the alpha with it so a link that has not
 * arrived yet cannot be clicked. Act 8's NewsGlide card is the one that uses
 * it today.
 *
 * Every band is measured off the one above it. Nothing is positioned as a
 * fraction of the frame; the frame is only 116 points tall at contact-sheet
 * size and fractions all land on top of one another.
 */

import { clamp, ease, easeOut, range } from '../../core/contract'
import { INK } from '../palette'
import type { Act, ActRenderContext } from '../../core/contract'
import type { Frame, TypeScale } from '../timeline'
import {
  RAMP,
  drawTracked,
  fitText,
  frameOf,
  hair,
  halo,
  header,
  lift,
  reset,
  scale,
  setFont,
  trackedWidth,
  wash,
  withAlpha,
  wrapText,
} from '../timeline'
import { publishLink } from '../links'
import copy from '../../content/film.json'

const C = copy.act9
/**
 * 12.9. It went 11.0 → 13.4 → 12.9, and the two moves were for the same reason
 * from opposite sides.
 *
 * At 11.0 the last card was fully up by about 9.6s and the act ended a second
 * and a half later, so the third project arrived and the frame changed — the
 * three of them never got to be on screen together long enough to read as a
 * LIST, which is the whole point of the beat. 13.4 fixed that and overshot: the
 * list had been read for a second or so before the act was willing to leave,
 * which is the longest anything in this film sits on a finished frame.
 *
 * 12.9 keeps three and a bit seconds of the three cards standing together and
 * takes the half-second of dead air off the end. It is all hold either way:
 * nothing here arrives any later or earlier than it did at 11.0.
 *
 * This is the knob for that beat. Move the act, not the card cues.
 */
const DURATION = 12.9

/* ---- beat one: the sentence ---- */
const RULE_A = 0.3
const LINE_A = 0.7
const LINE_STEP = 0.5

/** the sentence hands the frame to the projects */
const HAND_A = 5.2
const HAND_B = 5.8

/* ---- beat two: what we built ---- */
const LEAD_A = 5.8
const CARD_IN = 6.3
const CARD_GAP = 0.95

/* ==================================================================== *
 * Beat one — what the company was
 *
 * One sentence, alone. It is set LARGER than the closing lines of every
 * other act, because in every other act the line at the foot is a caption
 * on a picture and here there is no picture — the sentence is the frame,
 * and type at caption size floating in the middle of an empty screen reads
 * as something that lost its illustration.
 *
 * It is fitted rather than assumed. At contact-sheet size the same words
 * wrap to five rows, so the block is measured against the band it has and
 * the size comes down until it fits.
 * ==================================================================== */
function beatStart(
  ctx: CanvasRenderingContext2D,
  F: Frame,
  S: TypeScale,
  t: number,
  hw: number,
  headBot: number,
  a: number,
): void {
  if (a <= 0.004) return

  ctx.textBaseline = 'alphabetic'
  const footY = F.y + F.h * 0.985
  const bandTop = headBot + S.body * 1.2
  const band = Math.max(24, footY - bandTop)

  let size = S.body * 1.2
  let lines: string[] = []
  let lh = size * 1.42
  for (let guard = 0; guard < 10; guard++) {
    setFont(ctx, size, 'display', 400)
    lines = wrapText(ctx, C.start, F.w * 0.86)
    lh = size * 1.42
    if ((lines.length - 1) * lh + size * 1.6 <= band) break
    size *= 0.9
  }

  const blockH = (lines.length - 1) * lh
  const top = bandTop + (band - blockH) / 2

  /* a short rule over it, opening from the middle. The frame has one thing in
     it for five seconds; the rule is what says the sentence was placed there
     rather than left there, and it is the same mark act 11 puts under the head
     of the card. */
  const ruleK = easeOut(range(t, RULE_A, RULE_A + 0.9))
  if (ruleK > 0.004) {
    const half = Math.min(F.w * 0.09, F.s * 0.09) * ruleK
    ctx.fillStyle = withAlpha(INK.amber, 0.5 * a)
    ctx.fillRect(F.cx - half, top - size * 2.0, half * 2, hw)
  }

  ctx.textAlign = 'center'
  let li = 0
  for (const line of lines) {
    const from = LINE_A + li * LINE_STEP
    const k = ease(range(t, from, from + RAMP)) * a
    // each row comes up a few points as it arrives, and the last of the travel
    // is spent almost stationary — the same arrival every card in the film uses
    const rise = (1 - easeOut(range(t, from, from + 1.1))) * size * 0.55
    const y = top + li * lh
    li++
    if (k <= 0.004) continue
    setFont(ctx, size, 'display', 400)
    ctx.fillStyle = withAlpha(INK.text, 0.94 * k)
    ctx.fillText(line, F.cx, y + rise)
  }
  ctx.textAlign = 'left'
}

/* ==================================================================== *
 * Beat two — what we built
 *
 * One card each, lifted off the picture plane by its own shadow and
 * arriving from below. Everything inside a card is measured off the card,
 * and the whole stack is scaled down as one if the band is too short for
 * it — which is what keeps this readable at contact-sheet size, where the
 * type has floors and the band does not.
 * ==================================================================== */
function beatProjects(
  ctx: CanvasRenderingContext2D,
  F: Frame,
  S: TypeScale,
  t: number,
  hw: number,
  headBot: number,
  a: number,
): void {
  if (a <= 0.004) return

  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  const footY = F.y + F.h * 0.985

  /* the lead, at the TOP of the band. It introduces the list, so it goes above
     the list — under it, it reads as a caption on the last card. */
  const leadA = ease(range(t, LEAD_A, LEAD_A + RAMP)) * a
  const leadY = headBot + S.body * 1.1
  if (leadA > 0.004) {
    fitText(ctx, C.lead, F.w * 0.96, S.body, 'display', 400)
    ctx.fillStyle = withAlpha(INK.muted, 0.9 * leadA)
    ctx.fillText(C.lead, F.x, leadY)
  }

  const cards = C.builds
  const bandTop = leadY + S.body * 1.0
  const band = Math.max(24, footY - bandTop)

  /* measure the stack at full size, then shrink it as one if it will not fit */
  const measure = (k: number) => {
    const nameSize = S.body * 1.05 * k
    const linkSize = S.body * 0.74 * k
    const pad = S.body * 0.62 * k
    const gap = S.body * 0.55 * k
    const heights = cards.map((c) => pad * 2 + nameSize * 1.2 + (c.label ? linkSize * 1.8 : 0))
    const total = heights.reduce((x, y) => x + y, 0) + gap * Math.max(0, cards.length - 1)
    return { nameSize, linkSize, pad, gap, heights, total }
  }
  let m = measure(1)
  if (m.total > band) m = measure(Math.max(0.55, band / m.total))

  const colW = Math.min(F.w * 0.9, F.s * 0.88)
  const cardX = F.cx - colW / 2
  let y = bandTop + Math.max(0, band - m.total) / 2

  let i = 0
  for (const card of cards) {
    const h = m.heights[i] ?? 0
    const startAt = CARD_IN + i * CARD_GAP
    const k = ease(range(t, startAt, startAt + 0.6))
    const rise = (1 - easeOut(range(t, startAt, startAt + 0.8))) * S.body * 0.7
    const top = y
    y += h + m.gap
    i++
    if (k <= 0.004) continue
    const ka = k * a
    const cy = top + rise

    /* the plate: a shadow, a wash, and one lit edge along the top */
    lift(ctx, cardX, cy, colW, h, Math.max(1.5, F.s * 0.008), 0.55 * ka)
    const g = ctx.createLinearGradient(cardX, cy, cardX, cy + h)
    g.addColorStop(0, withAlpha(INK.text, 0.075 * ka))
    g.addColorStop(1, withAlpha(INK.text, 0.022 * ka))
    ctx.fillStyle = g
    ctx.fillRect(cardX, cy, colW, h)
    ctx.fillStyle = withAlpha(INK.text, 0.18 * ka)
    ctx.fillRect(cardX, cy, colW, hw)
    ctx.fillStyle = withAlpha(INK.amber, 0.55 * ka)
    ctx.fillRect(cardX, cy, hw * 2.4, h)

    const x = cardX + m.pad * 1.6
    const inner = colW - m.pad * 3.2
    let ty = cy + m.pad + m.nameSize

    fitText(ctx, card.name, inner, m.nameSize, 'display', 400)
    ctx.fillStyle = withAlpha(INK.text, 0.95 * ka)
    ctx.fillText(card.name, x, ty)

    if (card.label) {
      ty += m.linkSize * 1.7
      const linkA = ease(range(t, startAt + 0.3, startAt + 0.95)) * a
      if (linkA > 0.004) {
        setFont(ctx, m.linkSize, 'mono', 400)
        const track = m.linkSize * 0.04
        const width = trackedWidth(ctx, card.label, track)
        halo(ctx, INK.glow, m.linkSize * 0.9, 0.3 * linkA, () => {
          ctx.fillStyle = withAlpha(INK.amberLit, 0.96 * linkA)
          drawTracked(ctx, card.label, x, ty, track, 'left')
        })
        const uK = easeOut(range(t, startAt + 0.55, startAt + 1.25))
        ctx.fillStyle = withAlpha(INK.amber, 0.5 * linkA)
        ctx.fillRect(x, ty + m.linkSize * 0.42, width * uK, hw)

        // the hit box is the type's own box, opened up to something a person
        // can actually hit with a cursor on a screen thirty units away
        if (card.href) {
          publishLink({
            href: card.href,
            label: card.label,
            x: x - m.linkSize * 0.25,
            y: ty - m.linkSize * 0.9,
            w: width + m.linkSize * 0.5,
            h: m.linkSize * 1.45,
            alpha: clamp(linkA),
          })
        }
      }
    }
  }
}

function draw(c: ActRenderContext): void {
  const { ctx, w, h, t } = c
  reset(ctx)

  const F = frameOf(w, h)
  const S = scale(F)
  const hw = hair(F)
  wash(ctx, w, h, 0.85)

  // opens from before t=0 so the cut into this act is never a black frame
  const hy = header(ctx, F, S, C.index, C.heading, easeOut(range(t, -0.3, 0.6)))
  const headBot = hy + S.micro * 0.7

  beatStart(ctx, F, S, t, hw, headBot, 1 - ease(range(t, HAND_A, HAND_B)))
  beatProjects(ctx, F, S, t, hw, headBot, ease(range(t, HAND_A + 0.1, HAND_B + 0.1)))
}

export const act9: Act = {
  id: 'act9',
  duration: DURATION,
  chapter: C.chapter,
  caption: C.caption,
  draw,
}

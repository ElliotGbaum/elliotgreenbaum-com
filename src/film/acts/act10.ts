/**
 * ACT 10 — Cassidy.
 *
 * The job was being the person the customer talks to once the contract is
 * signed, so the picture is a THREAD: cards alternating left and right down
 * the frame, each sliding in from its own side and casting a shadow, so the
 * column reads as a conversation rather than as a bar chart lying down.
 *
 * THE ACT USED TO OPEN ON A TITLE CARD — "Cassidy" alone in the middle of an
 * empty frame with the job in mono under it, holding for three and a half
 * seconds before dissolving into the standing head that says the same word in
 * the same typeface at a third the size. Every other act in the film opens on
 * its head and gets straight to the picture; this one stopped to introduce
 * itself first, and what it was introducing was the top-left corner of the
 * frame it was about to cut to. The card is gone. The act opens the way every
 * other one does, and THE JOB CAME WITH IT — "AI Solutions Consultant" is now
 * printed in mono directly under the standing head, in the same subtitle slot
 * the date at UPenn and the two firms use: on screen for the whole act rather
 * than for three seconds at the front of it.
 *
 * THE CARDS CARRY THE WORK NOW. They used to be blank — eight anonymous
 * lozenges, with the four things he actually did printed underneath in a
 * single tracked mono row. That row was the widest line in the film and it was
 * about to get half again as wide: the copy went from four duties to six, in
 * his own words, and six of those in one row comes out at seven points.
 *
 * So the thread and the list became the same object. Each duty IS a card, the
 * sides still alternate, and the back-and-forth now has something in it.
 *
 * THE DUTIES ARE SENTENCES, NOT LABELS. Seven of them, and the long ones run
 * fifty characters — "reworked live automations based on customer feedback",
 * where the card used to say "and more". Two things had to give. The cards are
 * measured against the COLUMN as well as the band, because at that length the
 * old fit ran them off the side of the frame; and they do not share the frame
 * with the sentences at all, because seven cards arriving while the frame is
 * still saying what the job was is two things competing for one pair of eyes.
 * The sentences go first, and they GO — which is what lets the thread have the
 * whole picture, and is the only reason the cards can be set at a size that
 * survives being thrown thirty units.
 *
 * THERE WERE THREE DOTS AT THE END and they are gone. They trailed off the
 * bottom-right corner a long way after the last card, and the argument for them
 * was that they kept the final seconds from being a still frame while saying
 * the truest thing in the act: the thread does not stop. What they actually
 * read as, in the corner under a finished column, was a loading indicator. The
 * held picture is the ending now — the cards deal slowly enough that the column
 * arriving IS the movement, and a finished list is allowed to be looked at.
 */

import { PHONE, ease, easeOut, range } from '../../core/contract'
import { INK } from '../palette'
import type { Act, ActRenderContext } from '../../core/contract'
import {
  CROSSFADE,
  RAMP,
  balanceText,
  drawLines,
  drawTracked,
  frameOf,
  hair,
  header,
  lift,
  reset,
  scale,
  setFont,
  subhead,
  trackedWidth,
  wash,
  withAlpha,
} from '../timeline'
import copy from '../../content/film.json'

const C = copy.act10
/**
 * 16.0, and it went 11.8 → 15.4 → 16.0. Nearly all of that went into the two
 * things this act was rushing: the sentences got a beat between them and a
 * longer hold, and the thread deals its cards half again as slowly instead of
 * cutting off the end of the column. The last six tenths are the hold on the
 * finished column — the seventh card settles at 11.3, and four seconds of
 * looking at a completed list was just short of enough.
 */
const DURATION = 16.0

/* ---- beats. TWO OF THEM, AND THEY DO NOT OVERLAP AT ALL.

   The act used to run three: the lead line arrived alone at the foot, was
   swapped out at 3.6 for the body line on the same baseline, and only then did
   the cards start. Two problems with that, and they compound. The swap was the
   only thing happening on screen for four seconds — a sentence blanking and
   being replaced in place reads as a correction, not as a second clause — and
   the pair of them were parked at the very bottom of the frame, as far from the
   head they belong to as it is possible to be.

   They are ONE BLOCK now, both up together, sitting in the middle of the frame
   where a sentence somebody is reading should be. They arrive, they hold, and
   they go — and the thread starts after they have gone, with the WHOLE picture
   to itself, which is what pays for the cards being a size anybody can read at
   thirty units. ---- */
const ROLE_A = 0.6
const LEAD_A = 0.7
/**
 * The second sentence — 2.6, up from 1.6. The lead wraps to two rows, the
 * second of which did not reach full alpha until 1.8, so the body used to
 * start arriving BEFORE the sentence above it had finished. One sentence at a
 * time: the lead lands, it is read, and then the second one comes in under it.
 */
const BODY_A = 2.6
/** and both of them out together — 6.2, which is two and a half seconds of the
    pair standing complete rather than the nine tenths they used to get */
const LINES_OUT = 6.2
/** the first card, as the lines finish leaving */
const CARD_A = 6.8
/**
 * 0.65, up from 0.4. Seven cards four tenths apart is a card every blink —
 * they were being dealt faster than a sentence on one can be read, so the
 * column arrived as a flicker rather than as seven things somebody did. The
 * arrival itself is slower too (see CARD_RAMP).
 */
const CARD_STEP = 0.65
/** and each one takes this long to slide in and settle */
const CARD_RAMP = 0.6

/* ---- the phone: fewer cards, and the air kept ----
 *
 * THE CARDS ARE THE ONE THING IN THE FILM THE TYPE SCALE CANNOT REACH. Every
 * other line of the picture is set from `scale()`; these are set by the BAND —
 * the whole stack measured as one object and scaled until it fits — so the step
 * up that a phone gives the rest of the film (PHONE_TYPE in
 * src/film/timeline.ts) did nothing here. Worse than nothing: the head above
 * them took the step, the band is whatever the head leaves, and the duties came
 * out SMALLER on a phone than on a laptop. Seven points on the glass, in the act
 * that carries the job.
 *
 * SO THE PHONE SPENDS THE AIR, which is the only thing in the stack that is not
 * a word: the padding inside a card, the gap between two, the clearance under
 * the head and over the foot. It went too far once — at 1.36 of its own line a
 * card hugs its type, and seven of those with hairlines between them and the
 * widest running flush to both edges of the frame is a solid slab rather than a
 * thread. Legible and ugly is not a trade this film makes anywhere else.
 *
 * These four are the settled answer between the two: about a quarter more type
 * than the film's own scale would have given these cards, and a card still half
 * again as tall as the line inside it, with the widest sitting a little short of
 * the frame. The pill's own end caps are the floor under `padX` — the corner
 * radius is 0.42 of the card's height, so anything much under 0.7 prints the
 * first glyph inside the curve.
 *
 * WHAT ACTUALLY SETS THE SIZE IS HOW MANY CARDS THERE ARE. Each one is a
 * seventh of the height the other six could have had, and there is no arranging
 * of the air that gets that back: six duties came out at 30.5 of the picture's
 * 1280 and seven at 28.1. `dutiesPhone` in src/content/film.json is where that
 * choice is made, and the note over it separates the two edits that look the
 * same and are not — one fewer duty is type on every card, while shortening a
 * duty that is not the longest one is worth exactly nothing.
 */
const AIR = PHONE
  ? { padX: 0.95, padY: 0.22, gap: 0.28, over: 0.32, under: 0.15 }
  : { padX: 0.95, padY: 0.36, gap: 0.38, over: 0.5, under: 0.4 }

function draw(c: ActRenderContext): void {
  const { ctx, w, h, t } = c
  reset(ctx)

  const F = frameOf(w, h)
  const S = scale(F)
  const hw = hair(F)
  wash(ctx, w, h, 0.85)

  // opens from before t=0 so the cut into this act is never a black frame
  const headA = easeOut(range(t, -0.3, 0.6))
  const hy = header(ctx, F, S, C.index, C.heading, headA)

  /* the job, in mono, hung off the head — the same standing subtitle the date
     at UPenn and the two firms use, at the same size. See `subhead` in
     src/film/timeline.ts.

     MEASURED WHETHER OR NOT IT HAS ARRIVED. Everything below is stacked off
     `headBot`, so a headBot that depended on the role's own alpha would walk
     the entire thread down the frame over the two-thirds of a second the role
     spends fading in. The geometry is settled first; only the ink waits. */
  const subY = subhead(ctx, F, S, hy, C.role, ease(range(t, ROLE_A, ROLE_A + RAMP)))
  const headBot = subY + S.micro * 0.9

  const thread = headA
  if (thread <= 0.004) return

  ctx.textBaseline = 'alphabetic'
  const footY = F.y + F.h * 0.985

  /* ---------------- the two sentences, measured first ----------------
     They are ONE block of wrapped lines and they hold the middle of the frame
     while they are up. The thread is given the whole band once they have gone,
     so nothing here reserves room from it — but the block still has to be
     measured before it can be centred.

     BALANCED, NOT JUST WRAPPED. Both sentences run a little over one line, and
     a greedy wrap gave each of them a full line and then a two-word orphan
     parked in the middle of the frame — "Consultant." on its own under the
     first, "POC for clients." under the second. Same line count, evened out:
     see `balanceText` in src/film/timeline.ts.

     AND THEY ARE TWO PARAGRAPHS. They used to be stacked on one unbroken
     baseline grid, so four centred rows read as one four-line block and the
     seam between the two sentences was invisible. `para` is the air that says
     one sentence ended and another began. */
  setFont(ctx, S.body, 'display', 400)
  const leadLines = balanceText(ctx, C.lead, F.w * 0.9)
  const bodyLines = balanceText(ctx, C.body, F.w * 0.9)
  const lineRows = [...leadLines, ...bodyLines]
  const lh = S.body * 1.38
  /** the break between the two sentences, on top of the line height */
  const para = S.body * 0.72

  /* ---------------- the thread ----------------
     Every card is measured, then the stack is scaled as one if it will not
     fit — the same discipline the cards in act 9 use, and for the same
     reason: the type has a floor and the band does not. */
  const duties = PHONE ? C.dutiesPhone : C.duties
  /* THE FULL WIDTH OF THE FRAME, and it is here to keep `kCol` out of the way
     rather than to buy anything on its own. Of the two constraints below it is
     `kBand` that binds — seven cards do not fit the band, and they were never
     close to running out of column — so widening this changes NOTHING by
     itself. What it does is stop the column becoming the new ceiling once the
     stack is tightened: at the old `F.s * 0.94` the cards ran out of width at
     k≈0.69, which is barely above where the band already held them, so every
     pixel the rhythm below gave back would have been taken straight off again.

     The old cap was `F.s * 0.94`, and `F.s` is the frame's SHORT reference —
     tying a horizontal measure to it taxed the widest frames hardest. Flush
     with the frame now, which also puts the cards on the same left edge as the
     headline above them. */
  const colW = F.w
  const leftEdge = F.cx - colW / 2
  const bandTop = headBot + S.body * AIR.over
  /* THE BAND RUNS TO THE FOOT. It used to stop short of two lines of type that
     are no longer on screen when a single card is, which cost the whole stack
     about a fifth of its size for nothing. */
  const bandBot = footY - S.body * AIR.under
  const band = Math.max(24, bandBot - bandTop)

  const measure = (k: number) => {
    // a step up from `small`: the cards are the only thing in the frame by the
    // time they arrive, and they are the list of what the job actually was
    const size = S.body * 0.92 * k
    const padX = size * AIR.padX
    /* THE STACK'S VERTICAL RHYTHM IS WHAT SETS THE TYPE SIZE, because the band
       is what this list runs out of. Seven cards at the old figures cost
       seventeen times the type size (each card twice its own size, plus half a
       size between them), against a band worth about ten — so the whole stack
       was scaled to 0.61 and the duties came out at under six CSS pixels on a
       phone, in the act that carries the job a recruiter is here to read.

       Tighter here is bigger there: the air came out of the padding and the
       gaps, which are the only things in the measurement that are not the
       words. Seventeen becomes fourteen and change, and every bit of that goes
       into the type. A card is still comfortably taller than its own line.

       It is worth being honest about the ceiling: this buys about a fifth, and
       a fifth is not everything. Seven duties cannot reach the size act 9's
       cards are set at no matter how tight the rhythm gets — that would take
       five of them, and how many there are is not a question this file gets to
       answer. */
    const padY = size * AIR.padY
    const cardH = size + padY * 2
    const gap = size * AIR.gap
    return { size, padX, padY, cardH, gap, total: duties.length * cardH + (duties.length - 1) * gap }
  }

  /* TWO constraints now, not one. The duties used to be two-word labels — the
     longest was nineteen characters, no card came within a third of the
     column, and so the only question worth asking was whether the stack stood
     taller than the band. They are his own sentences now: fifty characters at
     the long end, near three times the old width, and a card measured against
     the band alone runs clean off the side of the frame. Both answers are
     computed and the smaller one wins. Everything about a card scales with its
     type size, so measuring the widest duty once at k=1 is enough to know the
     ratio. */
  const base = measure(1)
  setFont(ctx, base.size, 'mono', 400)
  let widest = 0
  for (const duty of duties) widest = Math.max(widest, trackedWidth(ctx, duty, base.size * 0.12))
  const widestCard = widest + base.padX * 2
  const kBand = base.total > band ? band / base.total : 1
  const kCol = widestCard > colW ? colW / widestCard : 1
  const m = measure(Math.max(0.4, Math.min(kBand, kCol)))

  const d = Math.max(1, F.s * 0.006)
  let y = bandTop + Math.max(0, band - m.total) / 2

  setFont(ctx, m.size, 'mono', 400)
  const track = m.size * 0.12

  let i = 0
  for (const duty of duties) {
    const born = CARD_A + i * CARD_STEP
    const k = ease(range(t, born, born + CARD_RAMP))
    const top = y
    y += m.cardH + m.gap
    // his side and theirs alternate, so the column reads as a back-and-forth
    const mine = i % 2 === 1
    i++
    if (k <= 0.004) continue

    const tw = trackedWidth(ctx, duty, track)
    const wide = tw + m.padX * 2
    // in from its own side, the last of the travel spent almost stationary
    const slide = (1 - k) * colW * 0.16 * (mine ? 1 : -1)
    const x = (mine ? leftEdge + colW - wide : leftEdge) + slide
    const ka = k * thread

    // mine sit forward of theirs — the shadow is the only thing saying so
    lift(ctx, x, top, wide, m.cardH, mine ? d * 1.8 : d, 0.5 * ka)

    ctx.beginPath()
    ctx.roundRect(x, top, wide, m.cardH, m.cardH * 0.42)
    if (mine) {
      const g = ctx.createLinearGradient(x, top, x, top + m.cardH)
      g.addColorStop(0, withAlpha(INK.amberLit, 0.34 * ka))
      g.addColorStop(1, withAlpha(INK.amber, 0.16 * ka))
      ctx.fillStyle = g
      ctx.fill()
      ctx.strokeStyle = withAlpha(INK.amberLit, 0.5 * ka)
    } else {
      ctx.fillStyle = withAlpha(INK.muted, 0.07 * ka)
      ctx.fill()
      ctx.strokeStyle = withAlpha(INK.muted, 0.36 * ka)
    }
    ctx.lineWidth = hw
    ctx.stroke()

    // the top edge catches the light, which is what makes it a card
    ctx.strokeStyle = withAlpha(INK.text, (mine ? 0.22 : 0.12) * ka)
    ctx.beginPath()
    ctx.moveTo(x + m.cardH * 0.45, top + hw * 0.5)
    ctx.lineTo(x + wide - m.cardH * 0.45, top + hw * 0.5)
    ctx.stroke()

    ctx.textBaseline = 'middle'
    ctx.fillStyle = withAlpha(mine ? INK.text : INK.muted, 0.95 * ka)
    drawTracked(ctx, duty, x + m.padX, top + m.cardH / 2, track, 'left')
    ctx.textBaseline = 'alphabetic'
  }

  /* ---------------- the two sentences, in the middle of the frame ----------
     Centred in the SAME band the thread gets, so they sit where the eye already
     is rather than at the bottom edge of the picture. The lead's rows step off
     LEAD_A and the body's off BODY_A — one block, one baseline grid, two
     arrival times, and one out-point for the pair of them. */
  ctx.textAlign = 'center'
  setFont(ctx, S.body, 'display', 400)

  const leaving = 1 - ease(range(t, LINES_OUT, LINES_OUT + CROSSFADE))
  if (leaving > 0.004) {
    const blockH = (lineRows.length - 1) * lh + para
    const blockTop = bandTop + (band - blockH) / 2
    let li = 0
    for (const line of lineRows) {
      const second = li >= leadLines.length
      const from = second
        ? BODY_A + (li - leadLines.length) * 0.4
        : LEAD_A + li * 0.4
      const a = ease(range(t, from, from + RAMP)) * thread * leaving
      if (a > 0.004) {
        // the paragraph break is spent once, on the first row of the second
        // sentence, and every row after it carries the offset
        const y = blockTop + li * lh + (second ? para : 0)
        ctx.fillStyle = withAlpha(INK.text, 0.92 * a)
        drawLines(ctx, [line], F.cx, y, lh, 'center')
      }
      li++
    }
  }

  ctx.textAlign = 'left'
}

export const act10: Act = {
  id: 'act10',
  duration: DURATION,
  chapter: C.chapter,
  caption: C.caption,
  draw,
}

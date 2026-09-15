/**
 * ACT 8 — NewsGlide.
 *
 * The product names the act, the way E&B names act 9 and Cassidy names act 10.
 * It comes forward as a card — the name, three of the things it actually does,
 * and the address — with his own sentence about it running at the foot
 * underneath. That is the only piece of evidence in the film a viewer can go
 * and check for themselves, so it gets an act of its own rather than the last
 * five seconds of the act about the year he learned to build.
 *
 * The card used to carry the product's tagline as well; the sentence says the
 * same thing at length and in his voice, so the tagline row is blank and the
 * card skips it.
 *
 * AND THEN THE ONE NUMBER IN THE FILM. "It reached 200+ weekly active users"
 * lands under that sentence, in amber, a good beat after it — late enough to be
 * a separate thought rather than a clause. It is the only figure anywhere in
 * these twelve acts, and it earns the exception precisely because it is alone:
 * a card that says what a thing is, and one line saying how many people turned
 * out to want it.
 *
 * ── THE ADDRESS IS SAID ONCE, INSIDE THE SENTENCE ────────────────────────
 *
 * It used to be printed twice: as its own amber row on the card, under the
 * three features, and again as the words "NewsGlide.org" in the sentence at the
 * foot. One screen, one address, two places — and the card's copy was the one
 * that was clickable, so the sentence named a thing you could read and the card
 * named the same thing you could press.
 *
 * Now the card's row is gone (its `label` is blank in film.json, and the card
 * skips the row exactly the way it skips the tagline) and THE WORD IN THE
 * SENTENCE IS THE LINK — amber, underlined, haloed, in the middle of a line of
 * buff display type. That is the right way round: the sentence is where a
 * viewer is already reading, and a link inside a sentence is a thing anyone has
 * clicked ten thousand times.
 *
 * WHICH COSTS ONE MEASUREMENT, and `linkRun` below is it. The line is centred,
 * so the word's left edge is the line's own left edge plus the width of
 * everything before it — three `measureText` calls on the same font, in the
 * same frame, against the same string the draw uses. Nothing is cached: the
 * type size is a function of the frame, and a remembered rectangle is a
 * rectangle that is wrong the next time the window changes shape.
 *
 * THE LINK IS CLICKABLE the same way it always was. It publishes the rectangle
 * it just drew into src/film/links.ts, in canvas pixels, and main.ts resolves
 * the click off a ray cast at the screen out in the world. Two rules, and they
 * have not changed: publish the rect in the SAME frame you draw the type, from
 * the same numbers, and publish the alpha with it, so a link that has not
 * arrived yet cannot be clicked.
 */

import { clamp, ease, easeOut, range } from '../../core/contract'
import { INK } from '../palette'
import type { Act, ActRenderContext } from '../../core/contract'
import {
  balanceText,
  RAMP,
  disc,
  drawLines,
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
} from '../timeline'
import { publishLink } from '../links'
import copy from '../../content/film.json'

const C = copy.act8
/**
 * 10.8, down from 12.4. The last thing to arrive is the number, at REACH_A plus
 * a RAMP — about 5.9 in — so the old length left six and a half seconds of a
 * frame that had finished saying everything on it. The address still wants a
 * hold, because it is the one thing here a viewer might press or write down, so
 * this is trimmed rather than cut: nearly five seconds of the finished card and
 * both lines standing. Nothing else in the act moved — the sentence, the number
 * and the card all arrive exactly when they did.
 */
const DURATION = 10.8

/* ---- the card, and everything on it ---- */
const CARD_A = 0.6
const NAME_A = 0.8
const TAG_A = 1.3
const FEAT_A = 1.6
const FEAT_STEP = 0.4
const LINK_A = 3.1
/** the sentence that goes with the card, at the foot, a wrapped line at a time */
const BUILT_A = 1.1
/** and the number, under it — a good beat after the sentence has landed, so the
 *  act is done saying what the thing is before the line about it arrives */
const REACH_A = 5.2
const FOOT_STEP = 0.5

/**
 * The WIDEST the sentence at the foot may be, as a fraction of the frame — a
 * cap, not the width it gets.
 *
 * That distinction is the whole reason this number is as big as it is, and it
 * is worth stating because the obvious edit here is to shrink it. `balanceText`
 * takes this as a ceiling and then hunts DOWNWARD for the narrowest column that
 * still fits the same number of rows, so the block actually lands at about 0.65
 * of the frame and the margins are set by the balance, not by this. Pulling
 * this in does not add margin; it adds a ROW, and the row is what costs the
 * margin.
 *
 * Which is exactly what happened. The sentence lost its second clause — it used
 * to run "…navigate the news with AI, to help streamline clarity and avoid
 * clutter" — and the shorter sentence set at 0.78 still broke to three short
 * rows. At 0.94 it balances onto TWO, each about two-thirds of the frame, with
 * the air above and below coming from FOOT_GAP rather than from the sides.
 *
 * The number under it is measured on the same column, so the two stay one
 * block. See `balanceText` in src/film/timeline.ts for why this is a *balanced*
 * wrap and not a greedy one.
 */
const FOOT_W = 0.94

/**
 * The air between the card and the sentence under it, in body sizes. 1.9, up
 * from 1.5: the sentence is a row shorter than it was, and all of what that
 * bought went into the gap rather than into a bigger card. The card is the
 * illustration and the sentence is the caption on it — they need to read as two
 * things, and at 1.5 with two rows instead of three they had started to sit
 * together as one block.
 */
const FOOT_GAP = 1.9

/**
 * The word inside the sentence that is the link, drawn where it falls.
 *
 * Returns the x of its left edge and its width, in canvas pixels, measured
 * against the CURRENT font — so the caller must have set the type before asking
 * — or null if the line does not contain it, which is the honest answer for
 * every other row in the block.
 *
 * `x` is the centre the line is drawn about, matching `drawLines(…, 'center')`.
 */
function linkRun(
  ctx: CanvasRenderingContext2D,
  line: string,
  word: string,
  cx: number,
): { x: number; w: number } | null {
  const i = word ? line.indexOf(word) : -1
  if (i < 0) return null
  const full = ctx.measureText(line).width
  const before = ctx.measureText(line.slice(0, i)).width
  return { x: cx - full / 2 + before, w: ctx.measureText(word).width }
}

/**
 * The size the three feature lines get: `want`, or as much of it as the card's
 * column will take.
 *
 * ONE size for all three, decided by the LONGEST — three phrases at three
 * sizes is three kinds of thing, and they are one list. They are tracked mono,
 * so width is linear in size and one correction is exact (the same reasoning
 * `fitTracked` in src/film/timeline.ts is built on). Each line is inset past
 * its bead by 1.3 of its own size, so that inset scales with the answer and
 * has to be inside the measurement.
 */
function fitFeatures(
  ctx: CanvasRenderingContext2D,
  feats: readonly string[],
  room: number,
  want: number,
): number {
  setFont(ctx, want, 'mono', 400)
  let widest = 0
  for (const f of feats) widest = Math.max(widest, trackedWidth(ctx, f, want * 0.12))
  const need = widest + want * 1.3
  return need > room && need > 0 ? Math.max(9, want * (room / need)) : want
}

function draw(c: ActRenderContext): void {
  const { ctx, w, h, t } = c
  reset(ctx)

  const F = frameOf(w, h)
  const S = scale(F)
  const hw = hair(F)
  wash(ctx, w, h, 0.85)

  const hy = header(ctx, F, S, C.index, C.heading, easeOut(range(t, -0.3, 0.7)))

  /* ---------------- the foot, measured before anything is placed ----------
     The sentence wraps, and the number sits under it. The room the two of them
     need together is worked out first and the card is sized against what is
     left, so a three-line sentence on a narrow window makes the card shorter
     rather than printing itself off the bottom of the screen.

     They are ONE block, bottom-aligned onto the foot, and the number is simply
     its last row — measured with it and never at its own out-point. Treating
     the stat as a second, independent line anchored to the same baseline is how
     it would end up printed on top of the sentence the first time the window
     got narrow enough for that sentence to wrap to three. */
  const footY = F.y + F.h * 0.99
  setFont(ctx, S.body, 'display', 400)
  // balanced, not just wrapped — the sentence is centred, and a greedy wrap
  // left "clutter" alone in the middle of the frame. See balanceText.
  const builtLines = balanceText(ctx, C.built, F.w * FOOT_W)
  const reachLines = C.reach ? balanceText(ctx, C.reach, F.w * FOOT_W) : []
  const footLines = [...builtLines, ...reachLines]
  const lh = S.body * 1.38
  const footTop = footY - (footLines.length - 1) * lh

  const bandTop = hy + S.micro * 1.2
  const bandBot = footTop - S.body * FOOT_GAP
  const bandH = Math.max(28, bandBot - bandTop)
  const bandCy = (bandTop + bandBot) / 2

  /* ================================================================ *
   * The card: what it is, what it does, and where it is
   *
   * Everything inside is measured off the card and the card is measured off
   * the band, so a fourth feature in film.json makes the card taller rather
   * than making it overflow.
   * ================================================================ */
  const cardK = ease(range(t, CARD_A, CARD_A + 0.65))
  if (cardK > 0.004) {
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'

    const feats = C.project.features

    /* THE TAGLINE IS BLANK AND THE CARD SKIPS ITS WHOLE ROW.
       "Navigate news with clarity" is now said, in his own voice and at
       length, in the line at the foot — and the two of them were on screen
       together, four inches apart, saying the same six words. The card keeps
       the name, the three things it does and the address, which is the part a
       viewer can go and check; the sentence keeps the sentence. Put a string
       back in film.json and the row comes back with its spacing intact. */
    const tag: string = C.project.tagline

    /**
     * THE CARD IS FITTED TO THE BAND, and it did not used to be.
     *
     * Every row on it is a multiple of the type scale, and the type scale has
     * a FLOOR — so on a small canvas the card kept its full height while the
     * band it sits in shrank around it, and it grew out of both ends. So the
     * card is measured at its natural size first, and if that does not fit the
     * band, every size on it — type, padding, leading — is scaled by the one
     * ratio that makes it fit. One number, applied to everything, so the card
     * gets smaller without ever getting rearranged.
     */
    const pad0 = S.body * 0.85
    const nameSize0 = S.body * 1.18
    const tagSize0 = S.body * 0.82
    const cardW = Math.min(F.w * 0.62, F.s * 0.6)
    /* THE THREE THINGS IT DOES, SET TO THE CARD'S OWN COLUMN rather than to
       `micro`. They were the smallest step on the type scale — 0.02 of the
       frame, the size the index numbers in the corner are — and they are not a
       label, they are the only description of what the product actually does.
       The width they have to live in is a fixed fraction of the card, so the
       size is worked out from that instead: as big as `body * 0.78`, smaller
       only if the longest of them would run off the column. */
    const featSize0 = fitFeatures(ctx, C.project.features, cardW - pad0 * 3, S.body * 0.78)
    /* THE ADDRESS ROW, and it is blank now — the address is said once, inside
       the sentence at the foot (see the header). Same rule as the tagline: a
       blank string in film.json costs the row its height rather than leaving a
       hole where it used to be, so the card closes up by exactly the space the
       line occupied instead of standing there with its bottom third empty. */
    const label: string = C.project.label
    const linkSize0 = S.body * 0.8
    const linkRow0 = label ? linkSize0 * 2.1 : linkSize0 * 0.5
    const tagRow0 = tag ? tagSize0 * 1.9 : tagSize0 * 0.6
    /* 1.75, down from 1.95. The card's height is what limits the feature size —
       every row on it is scaled by one ratio to fit the band — so leading and
       size are trading against each other, and mono lines at 1.75 of their own
       size are still airy. The tenths that came off the leading went into the
       type, which is the thing that had to be readable. */
    const FEAT_ROW = 1.75
    const wanted =
      pad0 * 2 + nameSize0 * 1.15 + tagRow0 + feats.length * featSize0 * FEAT_ROW + linkRow0
    const fitK = Math.min(1, bandH / wanted)

    const pad = pad0 * fitK
    const nameSize = nameSize0 * fitK
    const tagSize = tagSize0 * fitK
    const featSize = featSize0 * fitK
    const linkSize = linkSize0 * fitK
    const tagRow = tagRow0 * fitK

    const cardH = wanted * fitK
    const cardX = F.cx - cardW / 2
    const rise = (1 - easeOut(range(t, CARD_A, CARD_A + 0.9))) * S.body * 0.8
    const cardY = bandCy - cardH / 2 + rise

    lift(ctx, cardX, cardY, cardW, cardH, Math.max(1.5, F.s * 0.009), 0.6 * cardK)
    const g = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH)
    g.addColorStop(0, withAlpha(INK.text, 0.09 * cardK))
    g.addColorStop(1, withAlpha(INK.text, 0.025 * cardK))
    ctx.fillStyle = g
    ctx.fillRect(cardX, cardY, cardW, cardH)
    ctx.fillStyle = withAlpha(INK.text, 0.2 * cardK)
    ctx.fillRect(cardX, cardY, cardW, hw)
    ctx.fillStyle = withAlpha(INK.amber, 0.6 * cardK)
    ctx.fillRect(cardX, cardY, hw * 2.6, cardH)

    const tx = cardX + pad * 1.5
    const inner = cardW - pad * 3
    let ty = cardY + pad + nameSize

    const nameA = ease(range(t, NAME_A, NAME_A + 0.5))
    if (nameA > 0.004) {
      fitText(ctx, C.project.name, inner, nameSize, 'display', 400)
      ctx.fillStyle = withAlpha(INK.text, 0.96 * nameA)
      ctx.fillText(C.project.name, tx, ty)
    }

    ty += tagRow
    const tagA = tag ? ease(range(t, TAG_A, TAG_A + 0.5)) : 0
    if (tagA > 0.004) {
      fitText(ctx, tag, inner, tagSize, 'display', 400)
      ctx.fillStyle = withAlpha(INK.muted, 0.9 * tagA)
      ctx.fillText(tag, tx, ty)
    }

    /* the three things it does. A stacked list with an amber bead each, not a
       tracked row: three phrases of this length in one line come out at seven
       points and the row is the widest thing on the card. */
    let fi = 0
    for (const feat of feats) {
      ty += featSize * FEAT_ROW
      const a = ease(range(t, FEAT_A + fi * FEAT_STEP, FEAT_A + 0.5 + fi * FEAT_STEP))
      fi++
      if (a <= 0.004) continue
      ctx.fillStyle = withAlpha(INK.amber, 0.7 * a)
      disc(ctx, tx + featSize * 0.3, ty - featSize * 0.3, hw * 1.4)
      setFont(ctx, featSize, 'mono', 400)
      ctx.fillStyle = withAlpha(INK.text, 0.82 * a)
      drawTracked(ctx, feat, tx + featSize * 1.3, ty, featSize * 0.12, 'left')
    }

    /* …and the address row, if there is one. Blank in film.json as it stands —
       see `label` above — so this whole block is skipped and the card ends
       under the third feature. */
    if (label) {
      ty += linkSize * 2.0
      const linkA = ease(range(t, LINK_A, LINK_A + 0.6))
      if (linkA > 0.004) {
        setFont(ctx, linkSize, 'mono', 400)
        const track = linkSize * 0.04
        const width = trackedWidth(ctx, label, track)
        halo(ctx, INK.glow, linkSize * 0.9, 0.3 * linkA, () => {
          ctx.fillStyle = withAlpha(INK.amberLit, 0.96 * linkA)
          drawTracked(ctx, label, tx, ty, track, 'left')
        })
        const uK = easeOut(range(t, LINK_A + 0.25, LINK_A + 0.95))
        ctx.fillStyle = withAlpha(INK.amber, 0.5 * linkA)
        ctx.fillRect(tx, ty + linkSize * 0.42, width * uK, hw)

        publishLink({
          href: C.project.href,
          label,
          x: tx - linkSize * 0.25,
          y: ty - linkSize * 0.9,
          w: width + linkSize * 0.5,
          h: linkSize * 1.45,
          alpha: clamp(linkA),
        })
      }
    }
  }

  /* ================================================================ *
   * What he built, under the card that shows it — and then the number.
   *
   * ONE BLOCK, one wrapped line at a time, bottom-aligned onto the foot off
   * the count of the whole thing. The rows before `builtLines.length` are the
   * sentence and step off BUILT_A; the rows after it are the stat and step off
   * REACH_A, which is four seconds later. Same block, same baseline grid, two
   * arrival times — so the number reads as a thing said afterwards while never
   * being able to land anywhere but the row under the sentence.
   *
   * The stat is AMBER and the sentence is buff. Amber is the film's colour for
   * the one thing on screen worth acting on, and here it does the work a change
   * of voice would do out loud.
   *
   * AND SO IS THE ADDRESS, for the same reason and by the same rule — it is the
   * one thing on this screen worth acting on. The row carrying it is drawn in
   * three pieces rather than one: the words before the link, the link, and the
   * words after it. Overprinting the amber word on top of a finished buff line
   * was the cheaper build and it is visibly wrong — two sets of antialiased
   * edges on the same glyphs, and the link comes out heavier than the sentence
   * it is part of.
   *
   * NOTHING LEAVES. The card and both lines are up when the act cuts, which is
   * what the act is for: the address is the one thing in the film a viewer
   * might want to write down or press, and it should still be on the screen
   * when they decide to.
   * ================================================================ */
  ctx.textBaseline = 'alphabetic'

  setFont(ctx, S.body, 'display', 400)
  let li = 0
  for (const line of footLines) {
    const stat = li >= builtLines.length
    const from = stat ? REACH_A + (li - builtLines.length) * FOOT_STEP : BUILT_A + li * FOOT_STEP
    const a = ease(range(t, from, from + RAMP))
    li++
    if (a <= 0.004) continue

    const y = footTop + (li - 1) * lh
    const run = stat ? null : linkRun(ctx, line, C.linkWord, F.cx)

    if (!run) {
      ctx.textAlign = 'center'
      ctx.fillStyle = withAlpha(stat ? INK.amberLit : INK.text, 0.92 * a)
      drawLines(ctx, [line], F.cx, y, lh, 'center')
      continue
    }

    /* the row with the address in it. Left-aligned at measured offsets, so the
       three pieces sit exactly where the centred line would have put them. */
    const i = line.indexOf(C.linkWord)
    ctx.textAlign = 'left'
    ctx.fillStyle = withAlpha(INK.text, 0.92 * a)
    ctx.fillText(line.slice(0, i), run.x - ctx.measureText(line.slice(0, i)).width, y)
    ctx.fillText(line.slice(i + C.linkWord.length), run.x + run.w, y)

    halo(ctx, INK.glow, S.body * 0.75, 0.28 * a, () => {
      ctx.fillStyle = withAlpha(INK.amberLit, 0.96 * a)
      ctx.fillText(C.linkWord, run.x, y)
    })
    /* the rule under it, drawn in as the line settles — the one mark that says
       this word is pressable rather than merely coloured */
    const uK = easeOut(range(t, from + RAMP * 0.5, from + RAMP + 0.4))
    ctx.fillStyle = withAlpha(INK.amber, 0.55 * a)
    ctx.fillRect(run.x, y + S.body * 0.26, run.w * uK, hw)

    publishLink({
      href: C.project.href,
      label: C.linkWord,
      x: run.x - S.body * 0.2,
      y: y - S.body * 0.8,
      w: run.w + S.body * 0.4,
      h: S.body * 1.25,
      alpha: clamp(a),
    })
  }

  ctx.textAlign = 'left'
}

export const act8: Act = {
  id: 'act8',
  duration: DURATION,
  chapter: C.chapter,
  caption: C.caption,
  draw,
}

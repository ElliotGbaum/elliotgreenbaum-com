/**
 * ACT 11 — The card.
 *
 * The only text-heavy act, and the only one that asks for something. So it
 * holds still: a rule, what he is looking for, three addresses, an invitation
 * and a thank-you. Everything arrives once and then stops moving.
 *
 * TWO LINES CAME OFF IT AND THE CARD IS BETTER FOR BOTH.
 *
 * "I left Cassidy in June 2026" opened it, and it dated the card — a sentence
 * that is true for a month and then quietly wrong, printed on the one frame a
 * viewer might come back to. What he is looking for does not need a leaving
 * date in front of it.
 *
 * "If you know of any open roles or are hiring, please don't hesitate to reach
 * out" sat between the roles and the addresses, which is the film asking for a
 * favour before it has given anybody a way to do it. The invitation is one
 * short line UNDER the three addresses now — "Would love to hear from you!" —
 * where it reads as a note attached to them rather than as a request the reader
 * has to hold on to while they look for an email address.
 *
 * BOTH ROWS ARE STILL HERE IN THE CODE, and they are skipped, spacing and all,
 * when their strings are blank in film.json. Put either back and the card
 * rebuilds itself around it.
 *
 * THE NAME IS GONE FROM THE TOP OF IT. It used to open the card, set large,
 * with the rule under it — and act 0 has already typed "Hi, I'm Elliot" one
 * character at a time as the very first thing in the film. Saying it again at
 * the end was the film introducing itself to somebody who had been watching it
 * for a minute and a half, and it was the largest thing on the one frame whose
 * job is to carry three addresses. `name` is blank in film.json and this act
 * skips the whole row; the rule stays and is now the top edge of the card. Put
 * a string back and the name draws again above it, spacing intact.
 *
 * THE SENTENCE RUNS THROUGH THE ROLE ROW. "I'm currently looking for roles in
 * the" / DEPLOYMENT · SOLUTIONS CONSULTING · IMPLEMENTATION · PRODUCT /
 * "space." is one sentence with a list set into the middle of it, and the tail
 * word is drawn on the same baseline as the last role so it reads as the end of
 * the sentence rather than as a caption under a list. That is the whole reason
 * `rolesTail` exists in film.json as its own string.
 *
 * THE LIST WRAPS AND IT IS BIGGER FOR IT. See `fitRoles` below: the four roles
 * used to be squeezed into one row and then scaled down by whatever it took to
 * fit, which put the most important line on the card at a smaller size than the
 * chapter markers on the scrubber.
 *
 * There is no "click any of them" line under the addresses. An amber underlined
 * address on a dark screen is a link in every piece of software anybody has
 * ever used, and the cursor turns into a pointer over it; saying so in mono
 * grey underneath was the film explaining its own interface.
 *
 * THE ADDRESSES ARE REAL LINKS. The film is a texture on a screen thirty units
 * away, so there is no anchor tag to click — instead each one publishes the
 * rectangle it just drew, in canvas pixels, into the registry in
 * src/film/links.ts. main.ts casts a ray at the screen, turns the hit into a
 * UV, turns the UV into canvas pixels, and looks the point up in that list.
 *
 * Two rules for anything added here:
 *   1. Publish the rect in the SAME frame you draw the text, from the same
 *      numbers. A hit box computed anywhere else drifts the moment the type
 *      is refitted for a new aspect ratio.
 *   2. Publish the alpha with it. A link that has not faded in yet is not
 *      clickable, or the card is a minefield for the second before it appears.
 *
 * The whole block is MEASURED and then centred, rather than hung off F.cy with
 * fixed offsets — which is what used to run the last address off the bottom of
 * the frame on a short, wide window.
 */

import { clamp, ease, easeOut, range } from '../../core/contract'
import { INK } from '../palette'
import type { Act, ActRenderContext } from '../../core/contract'
import {
  RAMP,
  disc,
  drawLines,
  drawTracked,
  fitText,
  floorGrid,
  frameOf,
  hair,
  halo,
  reset,
  scale,
  setFont,
  softDot,
  trackedWidth,
  wash,
  withAlpha,
  wrapText,
} from '../timeline'
import { publishLink } from '../links'
import copy from '../../content/film.json'

const C = copy.act11
/**
 * 13.0, up from 12.4. "Thanks for watching" lands at THANKS_A plus a RAMP,
 * about 8.9 in, and this is the frame the film ends on and the one anybody who
 * wants the address has to read off — so the last four seconds are the card
 * standing finished, and it is the one hold in the film that is allowed to be
 * generous. Six tenths more of it.
 */
const DURATION = 13.0

/**
 * The role list, set as large as the column allows and WRAPPED rather than
 * crushed into one row.
 *
 * All four roles used to be laid out on a single line: the row was measured at
 * `small`, and if it did not fit — it never fit — the whole thing was scaled
 * down by however much it took. Four roles came to about sixty characters of
 * tracked mono, so on a 16:9 frame the fitted size landed near 0.018 of the
 * frame. That is smaller than `micro`. It was the least legible type in the
 * film, set on the one line that says what he is actually asking for.
 *
 * Inverted here. The SIZE is chosen first, and the roles are packed into as
 * many rows as that size needs. A row can only force a shrink now by holding a
 * single role too wide for the column on its own, and then everything shrinks
 * together so the list still reads as one object.
 *
 * `tailW` is the width of the tail word ("space.") in the display face, which
 * rides on the last row beside the final role and therefore has to be reserved
 * out of that row's budget — it is measured by the caller because it is not set
 * in this face or at this size.
 *
 * ONE ROW IS STILL PREFERRED WHEN IT IS CHEAP. Wrapping was the answer to a
 * list that would otherwise have been crushed to nothing; it is not an answer
 * to a list that misses one row by a few characters. Four short roles at the
 * target size ran three across and left "Product" on a row of its own under
 * them, which reads as a fourth thing rather than the fourth item. So the
 * single row is measured first, and if it can be had for a shrink no deeper
 * than `ONE_ROW_FLOOR` it is taken, everything scaled together. Only past that
 * floor does the list wrap.
 */
const ONE_ROW_FLOOR = 0.8

function fitRoles(
  ctx: CanvasRenderingContext2D,
  roles: readonly string[],
  tailW: number,
  colW: number,
  target: number,
): { size: number; track: number; sep: number; rows: string[][]; k: number } {
  const track = target * 0.12
  const sep = target * 1.7
  setFont(ctx, target, 'mono', 500)

  /* the single row, before anything is wrapped */
  const oneW =
    roles.reduce((n, role) => n + trackedWidth(ctx, role, track), 0) +
    sep * Math.max(0, roles.length - 1) +
    tailW
  if (oneW > 0) {
    const k1 = Math.min(1, colW / oneW)
    if (k1 >= ONE_ROW_FLOOR) {
      return { size: target * k1, track: track * k1, sep: sep * k1, rows: [[...roles]], k: k1 }
    }
  }

  const rows: string[][] = []
  let row: string[] = []
  let rowW = 0
  /** the widest row ends up here, tail included, so one shrink can fix it */
  let widest = 0

  for (let i = 0; i < roles.length; i++) {
    const role = roles[i] ?? ''
    const rw = trackedWidth(ctx, role, track)
    const tail = i === roles.length - 1 ? tailW : 0
    const joined = row.length === 0 ? rw : rowW + sep + rw
    if (row.length > 0 && joined + tail > colW) {
      widest = Math.max(widest, rowW)
      rows.push(row)
      row = [role]
      rowW = rw
    } else {
      row.push(role)
      rowW = joined
    }
    if (i === roles.length - 1) widest = Math.max(widest, rowW + tail)
  }
  if (row.length > 0) rows.push(row)

  /* only a role that is too wide for the column ON ITS OWN can still overflow.
     `k` goes back to the caller because the tail word is not set in this face:
     it was measured out there, at a size struck off `target`, and it has to
     take the same correction or the width reserved for it stops matching the
     width it draws at. */
  const k = widest > colW && widest > 0 ? colW / widest : 1
  return { size: target * k, track: track * k, sep: sep * k, rows, k }
}

const LEFT_A = 1.4
const LOOK_A = 1.4
const ROLE_A = 2.0
const ROLE_STEP = 0.3
const TAIL_A = 3.1
const ASK_A = 3.6
/** a second apart. These are the three things a viewer is meant to act on. */
const MAIL_A = 4.0
const LINK_STEP = 0.9
/** the invitation, once all three addresses are up */
const HEAR_A = 7.0
/** last of all, and the only line in the film addressed to the room */
const THANKS_A = 8.2

function draw(c: ActRenderContext): void {
  const { ctx, w, h, t, reduced } = c
  reset(ctx)

  const F = frameOf(w, h)
  const S = scale(F)
  const hw = hair(F)

  // one very slow breath, and nothing else moves
  const breath = reduced ? 1 : 0.94 + 0.06 * Math.sin(t * 0.5)
  wash(ctx, w, h, 0.9 * breath)

  const colW = Math.min(F.w, F.s * 0.94)
  const x = F.cx - colW / 2
  ctx.textBaseline = 'alphabetic'

  /* ---- measure the whole card, then centre it ----
     `nameSize` is kept even when there is no name: the rule's travelling
     highlight and the air under it are both struck off it, and they are the
     right size for this card whether or not anything is printed above them. */
  const named = C.name.trim().length > 0
  const hasLeft = C.left.trim().length > 0
  const hasAsk = C.ask.trim().length > 0
  const hasHear = C.hear.trim().length > 0

  const nameSize = named
    ? fitText(ctx, C.name, colW, S.title * 0.78, 'display', 400)
    : S.title * 0.78
  setFont(ctx, S.body, 'display', 400)
  const askLines = hasAsk ? wrapText(ctx, C.ask, colW) : []
  const hearLines = hasHear ? wrapText(ctx, C.hear, colW) : []
  const thanksLines = wrapText(ctx, C.thanks, colW)
  const lh = S.body * 1.42

  /* the role list, fitted before the card is measured — it can be more than one
     row now, and the rows below it have to know that before anything is placed.

     The tail is measured out here because it is set in the DISPLAY face, not in
     the mono the roles use — and at a size struck off the roles' own, so that
     "space." reads as the same sentence as the word in front of it. It used to
     be fixed at `small`, which was right while the roles were being crushed
     down to fit and left the tail looking like a footnote once they were not. */
  const roleTarget = S.small * 1.15
  const tailSizeAt = (size: number) => size * 0.95
  setFont(ctx, tailSizeAt(roleTarget), 'display', 400)
  const tailW = C.rolesTail ? ctx.measureText(` ${C.rolesTail}`).width : 0
  const R = fitRoles(ctx, C.roles, tailW, colW, roleTarget)
  const roleStep = R.size * 1.9
  const rolesH = (R.rows.length - 1) * roleStep

  /* ---- the addresses are SIZED TO THEIR COLUMN, not struck off the body ----

     They were `body * 0.86`, a fraction picked against a desktop frame — and
     this picture is not a page, it is thrown onto a screen out in a field. On a
     phone the whole 1280×726 design space lands about two hundred CSS pixels
     tall, so 0.86 of body arrived as eight physical pixels of monospace: the
     smallest real type in the film, on the one frame the film is asking
     somebody to act on.

     Nothing here moves with the window, and it must not — the design space is
     fixed and the film has to be the same film in every window (see the header
     of src/film/film.ts). What changed is only that the size is measured now
     instead of guessed: as large as the longest address can be and still sit
     inside the column, capped so the addresses never outgrow the sentence
     above them. Monospace advances are linear in size, so one measurement at a
     reference size gives the ratio for all three.

     The labels are untouched. The obvious way to buy size here is to print
     `LinkedIn` instead of `linkedin.com/in/elliot-greenbaum` — but the label IS
     the address on this card, and a card that shows you a word you have to
     click to resolve is a worse card than one that shows you where it goes. */
  const ADDR_TRACK = 0.04
  const ADDR_REF = 100
  setFont(ctx, ADDR_REF, 'mono', 400)
  let addrWidest = 0
  for (const label of [C.email, ...C.links.map((l) => l.label)]) {
    addrWidest = Math.max(addrWidest, trackedWidth(ctx, label, ADDR_REF * ADDR_TRACK))
  }
  const addrSize = Math.min(
    S.body * 1.15,
    addrWidest > 0 ? (colW / addrWidest) * ADDR_REF : S.body * 1.15,
  )
  const addrStep = addrSize * 1.85
  const rows = 1 + C.links.length // email, then the rest

  /* Every optional row costs its gap AND its lines, or nothing at all. Rows
     that are switched off have to take their air with them: a card that keeps
     the spacing of a line it is not printing has a hole in it, and the hole is
     in the middle of the one frame in the film that is supposed to be a card. */
  const capName = named ? nameSize * 0.72 : 0
  const gapRule = named ? nameSize * 0.44 : 0
  /** air under the rule, before the first line of type whatever that turns out to be */
  const gapFirst = S.body * 1.9
  const gapLeft = hasLeft ? S.body * 1.6 : 0
  /* struck off the role's own size rather than off `micro`, because the roles
     are no longer a caption-sized row — the air under a line has to grow with
     the line or the list crowds the sentence it belongs to */
  const gapRoles = S.micro * 1.2 + R.size * 0.95
  const askH = hasAsk ? S.body * 1.9 + (askLines.length - 1) * lh : 0
  const gapMail = S.body * 1.9
  const hearH = hasHear ? S.body * 2.0 + (hearLines.length - 1) * lh : 0
  const gapThanks = S.body * 2.0

  const blockH =
    capName +
    gapRule +
    gapFirst +
    gapLeft +
    gapRoles +
    rolesH +
    askH +
    gapMail +
    (rows - 1) * addrStep +
    addrSize +
    hearH +
    gapThanks +
    (thanksLines.length - 1) * lh

  const top = F.cy - blockH / 2
  const nameY = top + capName
  const ruleY = nameY + gapRule
  const leftY = ruleY + gapFirst
  const lookY = leftY + gapLeft
  const rolesY = lookY + gapRoles
  /** the baseline of the LAST role row — everything under the list hangs here */
  const rolesBot = rolesY + rolesH
  const askY = rolesBot + (hasAsk ? S.body * 1.9 : 0)
  const mailY = rolesBot + askH + gapMail
  const lastAddrY = mailY + (rows - 1) * addrStep
  const hearY = lastAddrY + (hasHear ? S.body * 2.0 : 0)
  const thanksY = lastAddrY + hearH + gapThanks

  /* the room the card is standing in. The whole film is thrown at a screen
     out in a field, and this act is the one that holds still long enough for
     a flat frame to read as a slide — so the floor keeps going after the type
     stops. It is a whisper: any louder and it competes with the one thing
     here that has a job. */
  const floorA = ease(range(t, 0.6, 2.6))
  if (floorA > 0.004) {
    const horizon = thanksY + (thanksLines.length - 1) * lh + S.body * 1.2
    const near = Math.min(h - hw, F.y + F.h + F.h * 0.09)
    floorGrid(ctx, F, horizon, near, floorA * 0.85, reduced ? 0 : t * 0.045)
  }

  /* ---- name, if there is one ---- */
  const nameA = named ? easeOut(range(t, -0.3, 0.7)) : 0
  if (nameA > 0.004) {
    setFont(ctx, nameSize, 'display', 400)
    softDot(ctx, x + nameSize * 0.2, nameY - nameSize * 0.3, nameSize * 3, INK.glow, 0.05 * nameA)
    halo(ctx, INK.glow, nameSize * 0.42, 0.22 * nameA, () => {
      ctx.fillStyle = withAlpha(INK.text, 0.96 * nameA)
      ctx.fillText(C.name, x, nameY)
    })
  }

  /* ---- rule ----
     It opens from BEFORE t=0, because with the name gone it is the first thing
     on the card and nothing else arrives until 1.5s. It used to start at 0.8,
     which was correct while the name was already up and holding the frame; on
     its own that was most of a second of black at the cut into the last act. */
  const ruleK = easeOut(range(t, named ? 0.8 : -0.25, named ? 1.8 : 1.1))
  if (ruleK > 0.004) {
    ctx.fillStyle = withAlpha(INK.amber, 0.45)
    ctx.fillRect(x, ruleY, colW * ruleK, hw)
    // the head of the rule stays lit for as long as it is travelling
    if (ruleK < 1) softDot(ctx, x + colW * ruleK, ruleY, nameSize * 0.5, INK.glow, 0.4)
  }

  /* ---- where he just left, if the card still says so ---- */
  const leftA = hasLeft ? ease(range(t, LEFT_A, LEFT_A + RAMP)) : 0
  if (leftA > 0.004) {
    setFont(ctx, S.small, 'display', 400)
    ctx.fillStyle = withAlpha(INK.muted, 0.85 * leftA)
    ctx.fillText(C.left, x, leftY)
  }

  /* ---- what he is looking for ---- */
  const lookA = ease(range(t, LOOK_A, LOOK_A + RAMP))
  if (lookA > 0.004) {
    setFont(ctx, S.body, 'display', 400)
    ctx.fillStyle = withAlpha(INK.text, 0.92 * lookA)
    ctx.fillText(C.looking, x, lookY)
  }

  /* the roles, in as many rows as they need, with a bead between them — and the
     tail of the sentence set on the same baseline as the last of them.

     A bead separates two roles ON THE SAME ROW and nothing else. It used to be
     drawn after every role but the last, which put one hanging off the end of
     the first row with nothing after it — a separator that separates a word
     from a line break reads as a typo, not as a series. The row break is
     already the separator there. `ri` counts through all of them, not through
     each row, which is what keeps the arrivals a steady beat apart no matter
     where the rows happen to break. */
  {
    setFont(ctx, R.size, 'mono', 500)
    let ri = 0
    let ry = rolesY
    for (const row of R.rows) {
      let rx = x
      let ci = 0
      for (const role of row) {
        const k = ease(range(t, ROLE_A + ri * ROLE_STEP, ROLE_A + 0.55 + ri * ROLE_STEP))
        const rw = trackedWidth(ctx, role, R.track)
        const last = ri === C.roles.length - 1
        const endsRow = ci === row.length - 1
        ci++
        if (k > 0.004) {
          ctx.fillStyle = withAlpha(INK.amberLit, 0.9 * k)
          drawTracked(ctx, role, rx, ry, R.track, 'left')
          if (!endsRow) {
            ctx.fillStyle = withAlpha(INK.amber, 0.5 * k)
            disc(ctx, rx + rw + R.sep / 2, ry - R.size * 0.3, hw * 1.1)
          }
        }
        rx += rw + R.sep
        ri++
        // the tail rides the last role's baseline, flush enough against it to
        // read as the end of the sentence rather than as a caption under a list
        if (last && C.rolesTail) {
          const tailA = ease(range(t, TAIL_A, TAIL_A + RAMP))
          if (tailA > 0.004) {
            setFont(ctx, tailSizeAt(roleTarget) * R.k, 'display', 400)
            ctx.fillStyle = withAlpha(INK.text, 0.9 * tailA)
            ctx.fillText(C.rolesTail, rx - R.sep * 0.55, ry)
            setFont(ctx, R.size, 'mono', 500)
          }
        }
      }
      ry += roleStep
    }
  }

  /* ---- the ask, if the card still carries one above the addresses ---- */
  const askA = hasAsk ? ease(range(t, ASK_A, ASK_A + RAMP)) : 0
  if (askA > 0.004) {
    setFont(ctx, S.body, 'display', 400)
    ctx.fillStyle = withAlpha(INK.text, 0.9 * askA)
    drawLines(ctx, askLines, x, askY, lh, 'left')
  }

  /* ---- the addresses ----
     One routine for all three, so the hit box and the underline can never
     disagree with the type.

     MINT, NOT AMBER. They used to be amber over an amber underline, sitting
     four lines under a role list that is also amber and also set in mono — two
     blocks of warm monospace with nothing between them but a gap, and the
     addresses lost. Green is the film's one cool colour (see INK in
     src/film/palette.ts) and it is spent here, on the only three things on
     this card that are clickable: the roles say what he wants, these say how to
     reach him, and they are now different KINDS of thing at a glance rather
     than the same thing twice. The glow behind them stays warm, because the
     halo is the light in the room and not the ink. */
  const track = addrSize * ADDR_TRACK
  /** the lit one is the email — first, and the one he most wants used */
  const LINK = INK.link
  const LINK_LIT = INK.linkLit
  const rowsIn: Array<{ href: string; label: string; at: number; lit: boolean }> = [
    { href: `mailto:${C.email}`, label: C.email, at: MAIL_A, lit: true },
    ...C.links.map((l, i) => ({
      href: l.href,
      label: l.label,
      at: MAIL_A + (i + 1) * LINK_STEP,
      lit: false,
    })),
  ]

  let ri = 0
  for (const row of rowsIn) {
    const y = mailY + ri * addrStep
    const a = ease(range(t, row.at, row.at + 0.75))
    ri++
    if (a <= 0.004) continue

    setFont(ctx, addrSize, 'mono', 400)
    const width = trackedWidth(ctx, row.label, track)

    halo(ctx, LINK, addrSize * 0.8, 0.2 * a, () => {
      ctx.fillStyle = withAlpha(row.lit ? LINK_LIT : LINK, 0.95 * a)
      drawTracked(ctx, row.label, x, y, track, 'left')
    })

    const uK = easeOut(range(t, row.at + 0.5, row.at + 1.2))
    if (uK > 0.004) {
      ctx.fillStyle = withAlpha(LINK, 0.5)
      ctx.fillRect(x, y + addrSize * 0.45, width * uK, hw)
    }

    /* THE HIT BOXES TILE. They used to be the type's own box opened up a
       little — 1.45 of the size against a 1.85 step, so 78% of the pitch, and
       the remaining 22% was a dead band between every pair of rows. On a
       desktop that band is four pixels and nobody ever found it. Thrown onto a
       screen from fifty units back it is a fifth of a very small target, and
       on a phone the whole row is only a dozen CSS pixels tall to begin with:
       a thumb landing between two addresses opened neither, and one landing a
       little further opened the wrong one.

       So each row owns its full share of the pitch and no more — top and
       bottom meet exactly, `h` IS the step. A miss can now only ever land on
       another of his own three addresses, which is the correct worst case. The
       rows must stay in this order for it to hold, and they do: the boxes are
       published in the order they are drawn. */
    publishLink({
      href: row.href,
      label: row.label,
      x: x - addrSize * 0.25,
      y: y - addrStep * 0.62,
      w: width + addrSize * 0.5,
      h: addrStep,
      alpha: clamp(a),
    })
  }

  /* ---- the invitation, directly under the addresses ----
     It sits here rather than above them because that is what it is inviting
     somebody to do, and because an ask that arrives before the address is a
     request the reader has to carry. In buff, not sage: it is the one line on
     this card addressed TO the person watching. */
  const hearA = hasHear ? ease(range(t, HEAR_A, HEAR_A + RAMP)) : 0
  if (hearA > 0.004) {
    setFont(ctx, S.body, 'display', 400)
    ctx.fillStyle = withAlpha(INK.text, 0.92 * hearA)
    drawLines(ctx, hearLines, x, hearY, lh, 'left')
  }

  /* ---- and the last line in the film ----
     It is the only sentence anybody says to the room rather than about
     themselves, so it gets its own air above it and it lands alone. */
  const thanksA = ease(range(t, THANKS_A, THANKS_A + RAMP))
  if (thanksA > 0.004) {
    setFont(ctx, S.body, 'display', 400)
    ctx.fillStyle = withAlpha(INK.muted, 0.9 * thanksA)
    drawLines(ctx, thanksLines, x, thanksY, lh, 'left')
  }
}

export const act11: Act = {
  id: 'act11',
  duration: DURATION,
  chapter: C.chapter,
  caption: C.caption,
  draw,
}

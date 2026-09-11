/**
 * THE TL;DR CARD — the whole film on one slide.
 *
 * IT IS NOT ONE OF THE TWELVE. It is not in ACTS, it has no chapter on the
 * scrubber, it never arrives on its own and it has no act number printed on
 * it. It is what the film winds forward to when somebody presses TLDR
 * VERSION over the corner of the screen: the reel spins to the end and
 * this drops into the gate instead. See `rush()` in src/film/film.ts for the transport
 * side of it, and the button in src/film/controls.ts.
 *
 * It lives in this directory anyway, and with the numbered acts, because it is
 * an `Act` in every way that matters — a pure function of `t` that paints into
 * the same 1280 × 726 design space with the same kit — and putting it anywhere
 * else would mean the one file that draws a frame of this film is somewhere
 * else. The rule about file name / id / index in src/film/film.ts is about the
 * twelve; this is deliberately outside it.
 *
 * WHY IT IS ALLOWED TO BREAK THE FILM'S RULES. Every act in the film says one
 * thing and holds it: three lines of type at a size you can read from across a
 * field, and nothing on screen competing with them. This card says two dozen
 * things at once, at half that size, in two columns. That is the deal a
 * viewer makes by pressing the button — they have asked for the facts instead
 * of the film — and the honest way to serve it is to give them the facts, not
 * a tidier film. The one rule it keeps is the one that stops it becoming a
 * résumé lane on the site: this is still a frame the projector throws, in the
 * film's own type and colour, and the only way to it is through the film.
 *
 * IT FITS ITSELF. Nothing here is placed at a hardcoded height. The card is
 * measured — every row wrapped against its own column, both columns and the
 * foot totalled — and if the total is taller than the frame, the whole card is
 * scaled down and measured again. So adding a bullet in film.json costs type
 * size on every row rather than running the last section off the bottom of the
 * picture, and the phone step in `scale()` (see src/film/timeline.ts) is
 * absorbed the same way.
 *
 * THE THREE ADDRESSES ARE REAL LINKS, on the same terms as the card at the end
 * of the film: published in canvas pixels, in the same frame they are drawn,
 * with their alpha, into the registry in src/film/links.ts.
 */

import { PALETTE, clamp, ease, easeOut, range } from '../../core/contract'
import type { Act, ActRenderContext } from '../../core/contract'
import {
  balanceText,
  disc,
  drawLines,
  drawTracked,
  fitText,
  fitTracked,
  hair,
  halo,
  reset,
  scale,
  setFont,
  trackedWidth,
  wash,
  withAlpha,
  type Frame,
  type TypeScale,
} from '../timeline'
import { publishLink } from '../links'
import copy from '../../content/film.json'

const C = copy.digest
/** the roles and the addresses are the film's own last act, read not copied */
const CARD = copy.act11

/**
 * How long the card takes to finish arriving. It is not how long the card is
 * up — the film holds here until somebody scrubs back into it or leaves, and
 * every envelope below has settled well before this — but `p` and the reduced
 * -motion still frame are both struck off it, so it has to be the truth about
 * the animation rather than a guess at the reading time.
 */
const DURATION = 3.4

/**
 * The ceiling on the fitting pass below. The card grows until it fills the
 * frame, and with nothing stopping it a card that lost most of its bullets
 * would keep growing into poster type — which is the film's job, not this
 * one's. At this factor a bullet is set slightly larger than the film's own
 * body size, which is as large as a list of two dozen things has any business
 * being.
 */
const MAX_K = 2.2

/* ==================================================================== *
 * The rows
 *
 * One flat list per column, built once at module load because it is a pure
 * function of the copy. `head` rows are section labels, `item` rows are
 * bullets, `sub` rows are the indented run under a bullet. The order here is
 * the order they are drawn AND the order they arrive in, which is what keeps
 * the cascade reading as one path down the card rather than as two columns
 * racing each other.
 * ==================================================================== */

type RowKind = 'head' | 'item' | 'sub'

interface Row {
  readonly kind: RowKind
  readonly text: string
  /** the run of `text` drawn as a link, and where it goes; blank on most rows */
  readonly linkWord: string
  readonly href: string
}

const COLUMNS: Row[][] = C.columns.map((sections) => {
  const rows: Row[] = []
  for (const sec of sections) {
    rows.push({ kind: 'head', text: sec.head, linkWord: '', href: '' })
    for (const item of sec.items) {
      const linked = item.linkWord && item.href && item.name.includes(item.linkWord)
      rows.push({
        kind: 'item',
        text: item.name,
        linkWord: linked ? item.linkWord : '',
        href: linked ? item.href : '',
      })
      for (const sub of item.subs) rows.push({ kind: 'sub', text: sub, linkWord: '', href: '' })
    }
  }
  return rows
})

/* ==================================================================== *
 * The frame, the sizes, and the fitting pass
 * ==================================================================== */

/**
 * THE CARD'S OWN FRAME, and the one place it takes more of the picture than an
 * act is allowed to.
 *
 * `frameOf` reserves a tenth of the picture along the top and an eighth along
 * the bottom, and an act needs every point of it: an act is three lines of
 * type floating in a lot of dark, and the dark is half of what it is saying.
 * This card is a wall of small type whose only problem is that there is not
 * enough room for it — and because the fitting pass below grows the card until
 * it fills whatever frame it is given, margin here is not air, it is type size
 * handed back. A quarter of the picture's height was going to margin; this
 * spends a good part of that on the words instead — every point of it at the
 * top, where nothing stands in front of the screen.
 *
 * The edge is still drawn. The screen has a physical border around it out in
 * the field (see the frame in src/world/landmarks/projector.ts), so the
 * picture is bounded by real woodwork whether or not the card leaves air
 * inside it — which is exactly why this card can afford the trade and an act
 * playing to the same border still cannot.
 */
function digestFrame(w: number, h: number): Frame {
  const padX = Math.max(w * 0.045, 12)
  const padTop = Math.max(h * 0.065, 14)
  /* THE BOTTOM MATCHES THE TOP, ON PURPOSE. The projector stands between the
     viewer and the screen, and its head rises into the middle of the bottom
     edge, where the addresses sit — it clips the first letters of the
     LinkedIn one. Reserving a bigger margin down here to clear it was tried
     and taken out again: the fitting pass paid for every point of it with
     smaller type on EVERY row, and a card that is harder to read everywhere
     is a worse trade than an address that is a little covered and still
     obviously LinkedIn, still clickable, and printed in full on the card at
     the end of the film. */
  const padBottom = padTop
  const fh = Math.max(80, h - padTop - padBottom)
  const fw = Math.max(80, Math.min(w - padX * 2, fh * 2.0))
  const x = (w - fw) / 2
  return {
    x,
    y: padTop,
    w: fw,
    h: fh,
    cx: x + fw / 2,
    cy: padTop + fh / 2,
    s: Math.min(fw, fh * 1.6),
  }
}

interface Sizes {
  title: number
  head: number
  item: number
  sub: number
  /** leading INSIDE a wrapped row — tighter than the pitch between rows */
  itemLh: number
  subLh: number
  /** air above a section label, and under it */
  headLead: number
  headTrail: number
  /** air after a row, which with the size above sets the pitch */
  itemGap: number
  subGap: number
  /** how far a bullet and a sub-bullet sit in from the column edge */
  indent: number
  subIndent: number
}

/**
 * Every size on the card, struck off the film's own scale and then off one
 * factor. `k` is what the fitting pass turns down, so the card can only ever
 * shrink as a whole — a card that shrank one section to fit would read as two
 * cards.
 *
 * THE RATIOS ARE WHERE THE BULLET SIZE ACTUALLY COMES FROM, not the numbers
 * themselves: the fitting pass below renormalises `k` until the card fills the
 * frame, so making every number here bigger changes nothing at all. What moves
 * a bullet is taking height off everything that is NOT a bullet — the heading,
 * the section labels, the gaps, the foot — because the pass then has the room
 * to grow the whole card, bullets included. That is what the second pass at
 * these did: the heading came down from 2.8× a bullet to under 2×, the labels
 * and every gap came in, and the bullets came out about a fifth larger on the
 * same card in the same frame.
 *
 * The third pass did it again, and the thing to understand about it is that
 * almost none of the air it took is actually gone. Every gap here is a
 * multiple of a type size, so a gap that keeps its ratio GROWS with `k` — cut
 * the ratio by the same fraction `k` then rises and the gap comes out the
 * same number of pixels it was, with the difference spent on the letters. The
 * air over the one section that used to be drawn under an arrow is the one
 * place height actually went away, and it had the most of it to give.
 */
function sizesAt(S: TypeScale, k: number): Sizes {
  const title = S.head * 0.44 * k
  const head = S.micro * 0.82 * k
  const item = S.small * 0.62 * k
  const sub = item * 0.87
  return {
    title,
    head,
    item,
    sub,
    itemLh: item * 1.24,
    subLh: sub * 1.24,
    headLead: item * 1.34,
    headTrail: head * 0.7,
    /* THE PITCH BETWEEN BULLETS IS WIDER THAN THE LEADING INSIDE ONE, and
       by more than it used to be. At 0.38 a run of one-line bullets sat at
       the pitch of a wrapped paragraph, and the three project names — each
       with a rule under its address — read as one clump next to a column
       whose bullets happened to wrap. The gap is a multiple of the type
       size, so the fitting pass buys most of it back. */
    itemGap: item * 0.58,
    subGap: sub * 0.22,
    indent: item * 1.15,
    subIndent: item * 2.35,
  }
}

interface Placed {
  readonly row: Row
  readonly lines: string[]
  /** baseline of the FIRST line */
  readonly y: number
  readonly x: number
  readonly size: number
  readonly lh: number
}

/** lay a column out from y = 0; the caller adds the top */
function placeColumn(
  ctx: CanvasRenderingContext2D,
  rows: readonly Row[],
  colW: number,
  z: Sizes,
): { placed: Placed[]; h: number } {
  const placed: Placed[] = []
  let y = 0

  rows.forEach((row, i) => {
    if (row.kind === 'head') {
      if (i > 0) y += z.headLead
      y += z.head
      placed.push({ row, lines: [row.text.toUpperCase()], y, x: 0, size: z.head, lh: z.head })
      y += z.headTrail
      return
    }

    const isSub = row.kind === 'sub'
    const size = isSub ? z.sub : z.item
    const lh = isSub ? z.subLh : z.itemLh
    const x = isSub ? z.subIndent : z.indent
    // lining figures: see DISPLAY_LINING — "1M+" in old-style figures is "IM+"
    setFont(ctx, size, 'lining', 400)
    /* BALANCED, even though this is left-aligned type and the note on
       `balanceText` says that is what a rag is for. A rag is what you get when
       a paragraph wraps; what happens here is one bullet in a narrow column
       running two words past the line and leaving "'25)" alone underneath —
       an orphan, not a rag, and next to a bullet it reads as a second bullet
       with nothing in front of it. Same words, same line count, evened out. */
    const lines = balanceText(ctx, row.text, colW - x)
    y += size
    placed.push({ row, lines, y, x, size, lh })
    y += lh * (lines.length - 1) + (isSub ? z.subGap : z.itemGap)
  })

  return { placed, h: y }
}

/* ==================================================================== *
 * The foot — the last act of the film, restated
 * ==================================================================== */

/** the tracking on every section label on the card */
const HEAD_TRACK = 0.16

const ADDR_TRACK = 0.04
/** measuring monospace once at a reference size gives the ratio for any size */
const REF = 100

interface Foot {
  /** the addresses, laid out across one row */
  addrSize: number
  addrTrack: number
  addrSep: number
  addrW: number[]
  /** the sentence, and the role list set into the end of it */
  lookW: number
  roleSize: number
  roleTrack: number
  roleSep: number
  roleW: number[]
  /** offsets from the foot rule */
  headY: number
  rolesY: number
  addrY: number
  h: number
}

function measureFoot(ctx: CanvasRenderingContext2D, F: Frame, z: Sizes): Foot {
  const labels = [CARD.email, ...CARD.links.map((l) => l.label)]

  /* the addresses sit in ONE row, so the row is what they are fitted to —
     three addresses and two beads, as wide as they can be inside the frame
     and never wider than a bullet, because they are not the loudest thing on
     this card even though they are the only clickable one */
  setFont(ctx, REF, 'mono', 400)
  const refW = labels.map((l) => trackedWidth(ctx, l, REF * ADDR_TRACK))
  const refSep = REF * 1.5
  const refRun = refW.reduce((n, w) => n + w, 0) + refSep * (labels.length - 1)
  const addrSize = Math.min(z.item, refRun > 0 ? (F.w / refRun) * REF : z.item)
  const addrTrack = addrSize * ADDR_TRACK
  const addrSep = addrSize * 1.5
  const addrW = refW.map((w) => (w / REF) * addrSize)

  /* "I'm currently looking for roles in" is display type; the roles after it
     are tracked mono. Only the list is allowed to shrink — the sentence in
     front of it is the same size as every other sentence on the card. */
  setFont(ctx, z.item, 'display', 400)
  const lookW = ctx.measureText(CARD.looking).width + z.item * 0.55
  const roleTarget = z.item
  const roleTrack0 = roleTarget * 0.13
  const roleSep0 = roleTarget * 1.45
  setFont(ctx, roleTarget, 'mono', 500)
  const roleW0 = CARD.roles.map((r) => trackedWidth(ctx, r, roleTrack0))
  const roleRun = roleW0.reduce((n, w) => n + w, 0) + roleSep0 * (CARD.roles.length - 1)
  const roleRoom = Math.max(z.item * 4, F.w - lookW)
  const rk = roleRun > roleRoom && roleRun > 0 ? roleRoom / roleRun : 1

  /* THE TWO ROWS UNDER THE FOOT RULE ARE NOT ONE BLOCK, and the pitch here
     is what says so. The sentence about roles and the addresses are two
     separate things that happen to end the card; set at the same
     one-and-a-half of a row they closed up into a paragraph, with the
     addresses reading as the second line of the sentence above them. The gap
     is a little wider than a line of type now — enough to separate them, not
     enough to unstack them — and because these are multiples of a type size
     the fitting pass buys most of it back. The film's own invitation
     ("Would love to hear from you!", act11.hear) is NOT on the card: the
     addresses are the last thing it says. */
  const headY = z.head * 1.45
  const rolesY = headY + z.item * 1.5
  const addrY = rolesY + addrSize * 1.85

  return {
    addrSize,
    addrTrack,
    addrSep,
    addrW,
    lookW,
    roleSize: roleTarget * rk,
    roleTrack: roleTrack0 * rk,
    roleSep: roleSep0 * rk,
    roleW: roleW0.map((w) => w * rk),
    headY,
    rolesY,
    addrY,
    h: addrY + z.item * 0.25,
  }
}

/* ==================================================================== *
 * Timing
 *
 * The card is the answer to "I do not have two minutes", so it arrives fast:
 * the heading and its rule, then every row down the card a couple of frames
 * apart, then the foot under its own rule. The cascade is the only motion
 * here — nothing on this card moves once it has landed, because all of it is
 * meant to be read at once.
 * ==================================================================== */

const TITLE_A = 0.05
const RULE_A = 0.3
const ROWS_A = 0.72
const ROW_STEP = 0.045
const ROW_RAMP = 0.5
/** after the last row, the foot rule, then its four lines */
const FOOT_GAP = 0.28
const FOOT_STEP = 0.16

/** heading, rule, the taller column, and the foot — the whole card, top to toe */
function totalHeight(z: Sizes, colH: number, foot: Foot): number {
  return z.title + z.title * 0.4 + z.title * 0.5 + colH + z.item * 0.95 + foot.h
}

function draw(c: ActRenderContext): void {
  const { ctx, w, h, t, reduced } = c
  reset(ctx)

  const F = digestFrame(w, h)
  const S = scale(F)
  const hw = hair(F)

  // the lit screen, breathing once very slowly — the same one every act sits on
  const breath = reduced ? 1 : 0.94 + 0.06 * Math.sin(t * 0.45)
  wash(ctx, w, h, 0.86 * breath)

  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  const gutter = F.w * 0.055
  const colW = (F.w - gutter) / 2

  /* ---- measure, then size the card to the frame ----
     IT GROWS AS WELL AS SHRINKS, and the growing is the half that matters. The
     sizes above are a starting guess struck off the film's own scale; what the
     card is actually worth is whatever fills the picture, because this is the
     one frame in the film that is a wall of small type and every point of it
     has to survive being thrown thirty units. A first pass that only shrank
     left the whole card floating in the middle of the screen at two-thirds the
     size it had room for.

     Height is very nearly linear in `k` — the exception is re-wrapping, which
     is why this iterates rather than solving once — so each pass multiplies by
     however far off the target it landed. Five passes is three more than it has
     ever needed. TARGET is a shade under the full frame so the last pass cannot
     oscillate around it. */
  let k = 1
  let z = sizesAt(S, k)
  let cols = COLUMNS.map((rows) => placeColumn(ctx, rows, colW, z))
  let foot = measureFoot(ctx, F, z)
  let colH = Math.max(...cols.map((col) => col.h))
  let blockH = totalHeight(z, colH, foot)

  const TARGET = F.h * 0.985
  for (let pass = 0; pass < 5; pass++) {
    if (blockH > 0 && Math.abs(blockH - TARGET) / TARGET < 0.015) break
    k = Math.min(MAX_K, k * clamp(TARGET / Math.max(1, blockH), 0.5, 1.6))
    z = sizesAt(S, k)
    cols = COLUMNS.map((rows) => placeColumn(ctx, rows, colW, z))
    foot = measureFoot(ctx, F, z)
    colH = Math.max(...cols.map((col) => col.h))
    blockH = totalHeight(z, colH, foot)
  }

  const top = F.y + Math.max(0, (F.h - blockH) / 2)
  const titleY = top + z.title
  const ruleY = titleY + z.title * 0.4
  const colTop = ruleY + z.title * 0.5
  const footRuleY = colTop + colH + z.item * 0.95

  /* ---- the heading ---- */
  const titleA = easeOut(range(t, TITLE_A, TITLE_A + 0.7))
  if (titleA > 0.004) {
    const size = fitText(ctx, C.title, F.w * 0.7, z.title, 'display', 400)
    halo(ctx, PALETTE.glowCss, size * 0.4, 0.2 * titleA, () => {
      ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.96 * titleA)
      ctx.fillText(C.title, F.x, titleY)
    })
  }

  /* ---- and its rule, opening across the whole card ---- */
  const ruleK = easeOut(range(t, RULE_A, RULE_A + 0.85))
  if (ruleK > 0.004) {
    ctx.fillStyle = withAlpha(PALETTE.amberCss, 0.45)
    ctx.fillRect(F.x, ruleY, F.w * ruleK, hw)
  }

  /* ---- the two columns ----
     `order` counts through both of them, so the cascade runs down column one
     and then down column two rather than filling both at once. */
  let order = 0
  cols.forEach((col, ci) => {
    const cx = F.x + ci * (colW + gutter)
    for (const p of col.placed) {
      const at = ROWS_A + order * ROW_STEP
      order++
      const a = ease(range(t, at, at + ROW_RAMP))
      if (a <= 0.004) continue
      const y = colTop + p.y

      if (p.row.kind === 'head') {
        /* the one row on the card that is not wrapped — a section label that
           broke onto two lines would stop reading as a label. Tracked mono is
           linear in size, so one correction fits it exactly. */
        const label = p.lines[0] ?? ''
        const fit = fitTracked(ctx, label, colW, p.size, HEAD_TRACK, 'mono', 500)
        ctx.fillStyle = withAlpha(PALETTE.amberCss, 0.9 * a)
        drawTracked(ctx, label, cx, y, fit.track, 'left')
        continue
      }

      const sub = p.row.kind === 'sub'
      setFont(ctx, p.size, 'lining', 400)

      if (sub) {
        // a short rule where a bullet would be — the run under a bullet is a
        // list of parts, not a second list of things
        ctx.fillStyle = withAlpha(PALETTE.sageCss, 0.5 * a)
        ctx.fillRect(cx + p.x - p.size * 0.85, y - p.size * 0.3, p.size * 0.45, hw)
        ctx.fillStyle = withAlpha(PALETTE.sageCss, 0.88 * a)
      } else {
        ctx.fillStyle = withAlpha(PALETTE.amberCss, 0.62 * a)
        disc(ctx, cx + p.x - p.size * 0.66, y - p.size * 0.3, Math.max(1.1, p.size * 0.11))
        ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.94 * a)
      }

      if (!p.row.linkWord) {
        drawLines(ctx, p.lines, cx + p.x, y, p.lh, 'left')
        continue
      }

      /* ---- a bullet with a project address in it ----
         The address is the same buff as the rest of the row, with a rule
         under it, and published as a hit box. It used to be lit amber with a
         halo, the way the NewsGlide sentence in act 8 is — on this card that
         put two glowing words in a column whose section labels are already
         amber, and they fought. Here the underline alone says "pressable":
         it is the one thing on the card with a line under it besides the
         three addresses in the foot, which are links too. The bullet is
         left-aligned, so the three pieces are laid down at measured offsets
         from the column edge; the address is whole on whichever wrapped line
         it fell on, because the wrap never breaks inside a word. */
      ctx.textAlign = 'left'
      p.lines.forEach((line, li) => {
        const ly = y + li * p.lh
        const lx = cx + p.x
        const i = line.indexOf(p.row.linkWord)
        if (i < 0) {
          ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.94 * a)
          ctx.fillText(line, lx, ly)
          return
        }
        const before = line.slice(0, i)
        const after = line.slice(i + p.row.linkWord.length)
        const bx = lx + ctx.measureText(before).width
        const lw = ctx.measureText(p.row.linkWord).width
        ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.94 * a)
        ctx.fillText(before, lx, ly)
        ctx.fillText(after, bx + lw, ly)

        ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.94 * a)
        ctx.fillText(p.row.linkWord, bx, ly)
        ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.55 * a)
        // close under the baseline, not down in the air the next row needs
        ctx.fillRect(bx, ly + p.size * 0.18, lw, hw)

        publishLink({
          href: p.row.href,
          label: p.row.linkWord,
          x: bx - p.size * 0.2,
          y: ly - p.size * 0.8,
          w: lw + p.size * 0.4,
          h: p.size * 1.25,
          alpha: clamp(a),
        })
      })
    }
  })

  const footA = ROWS_A + order * ROW_STEP + FOOT_GAP

  /* ---- the foot rule ---- */
  const footK = easeOut(range(t, footA, footA + 0.7))
  if (footK > 0.004) {
    ctx.fillStyle = withAlpha(PALETTE.amberCss, 0.32)
    ctx.fillRect(F.x, footRuleY, F.w * footK, hw)
  }

  /* ---- NEXT STEPS ---- */
  const headA = ease(range(t, footA + FOOT_STEP, footA + FOOT_STEP + ROW_RAMP))
  if (headA > 0.004) {
    setFont(ctx, z.head, 'mono', 500)
    ctx.fillStyle = withAlpha(PALETTE.amberCss, 0.9 * headA)
    drawTracked(ctx, C.next.toUpperCase(), F.x, footRuleY + foot.headY, z.head * HEAD_TRACK, 'left')
  }

  /* ---- what he is looking for, with the list set into the end of it ---- */
  const rolesA = ease(range(t, footA + FOOT_STEP * 2, footA + FOOT_STEP * 2 + ROW_RAMP))
  if (rolesA > 0.004) {
    const y = footRuleY + foot.rolesY
    setFont(ctx, z.item, 'display', 400)
    ctx.fillStyle = withAlpha(PALETTE.buffCss, 0.92 * rolesA)
    ctx.fillText(CARD.looking, F.x, y)

    setFont(ctx, foot.roleSize, 'mono', 500)
    let rx = F.x + foot.lookW
    CARD.roles.forEach((role, i) => {
      const rw = foot.roleW[i] ?? 0
      ctx.fillStyle = withAlpha(PALETTE.amberLitCss, 0.92 * rolesA)
      drawTracked(ctx, role, rx, y, foot.roleTrack, 'left')
      if (i < CARD.roles.length - 1) {
        ctx.fillStyle = withAlpha(PALETTE.amberCss, 0.5 * rolesA)
        disc(ctx, rx + rw + foot.roleSep / 2, y - foot.roleSize * 0.3, hw * 1.1)
      }
      rx += rw + foot.roleSep
    })
  }

  /* ---- the three addresses, across one row, and all three clickable ----
     Mint, underlined, and the email lit — the same treatment they get on the
     card at the end of the film, because they are the same three things and a
     viewer who has seen one should recognise the other. */
  const addrA = ease(range(t, footA + FOOT_STEP * 3, footA + FOOT_STEP * 3 + ROW_RAMP))
  const LINK = PALETTE.mintCss
  const LINK_LIT = '#8FE3C6'
  {
    const y = footRuleY + foot.addrY
    const rowsIn = [
      { href: `mailto:${CARD.email}`, label: CARD.email, lit: true },
      ...CARD.links.map((l) => ({ href: l.href, label: l.label, lit: false })),
    ]
    let ax = F.x
    rowsIn.forEach((row, i) => {
      const width = foot.addrW[i] ?? 0
      if (addrA > 0.004) {
        setFont(ctx, foot.addrSize, 'mono', 400)
        halo(ctx, LINK, foot.addrSize * 0.8, 0.2 * addrA, () => {
          ctx.fillStyle = withAlpha(row.lit ? LINK_LIT : LINK, 0.95 * addrA)
          drawTracked(ctx, row.label, ax, y, foot.addrTrack, 'left')
        })
        ctx.fillStyle = withAlpha(LINK, 0.5 * addrA)
        ctx.fillRect(ax, y + foot.addrSize * 0.45, width, hw)

        if (i < rowsIn.length - 1) {
          ctx.fillStyle = withAlpha(PALETTE.sageCss, 0.4 * addrA)
          disc(ctx, ax + width + foot.addrSep / 2, y - foot.addrSize * 0.3, hw * 1.1)
        }

        /* the hit box, from the numbers the type was just drawn from. It is
           the row's own height and its own width plus half a bead either
           side — they are side by side here rather than stacked, so a miss
           between two of them opens neither, which is the right answer when
           the gap is wider than the type. */
        publishLink({
          href: row.href,
          label: row.label,
          x: ax - foot.addrSep * 0.3,
          y: y - foot.addrSize * 1.25,
          w: width + foot.addrSep * 0.6,
          h: foot.addrSize * 2.1,
          alpha: clamp(addrA),
        })
      }
      ax += width + foot.addrSep
    })
  }
}

export const digest: Act = {
  id: 'digest',
  duration: DURATION,
  chapter: C.chapter,
  caption: C.caption,
  draw,
}

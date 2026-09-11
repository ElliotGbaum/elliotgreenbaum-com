/**
 * THE FILM — act sequencing and transport.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  ELLIOT — WHERE TO EDIT                                              │
 * │                                                                      │
 * │  WORDS    src/content/film.json                                      │
 * │           Every user-visible string in the film lives there, keyed   │
 * │           by act ("act0" … "act11", in running order). Change a      │
 * │           string, reload, done.                                      │
 * │           `chapter` is the section name on the scrubber; `caption`   │
 * │           is announced to screen readers when the act begins and is  │
 * │           printed under the picture as a subtitle — keep it to one   │
 * │           or two short sentences.                                    │
 * │                                                                      │
 * │  LENGTHS  the `DURATION` constant at the top of each                 │
 * │           src/film/acts/actN.ts, in seconds. Every act is timed off  │
 * │           seconds from its own start, so making an act longer adds   │
 * │           hold time at the end instead of breaking its choreography. │
 * │           Lengthening an act is CHEAP — the scrubber segments, the   │
 * │           timecode and the total are all derived from these numbers  │
 * │           and nothing else has to change. If a line is arriving too  │
 * │           late to be read, this is the knob. See the pace note at    │
 * │           the top of src/film/timeline.ts for the rule it has to     │
 * │           clear, and re-time that act's cue in                       │
 * │           src/world/filmstage.ts, which mirrors these beats in 3D.   │
 * │                                                                      │
 * │  ORDER    the ACTS array below.                                      │
 * │                                                                      │
 * │  LOOK     src/film/film.css is the *player chrome* — the scrubber,   │
 * │           the buttons, the subtitle. The picture's own grain and     │
 * │           vignette are drawn here, in `finish()`, because the        │
 * │           picture is a texture on a screen in the world now and CSS  │
 * │           can't reach it. Colour comes from PALETTE in               │
 * │           src/core/contract.ts and nowhere else.                     │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * WHERE IT ENDS UP: nowhere near the DOM. This module owns an offscreen
 * canvas of a fixed size and paints acts into it; src/world/landmarks/
 * projector.ts hangs that canvas on the screen in the world as a texture,
 * and you watch it from outside, in third person, with the projector and the
 * sky still in frame. Nothing here knows that — it just paints.
 *
 * WHO DRIVES IT: main.ts, once per world frame, via `update(dt)`. There is no
 * requestAnimationFrame in this file. Two loops racing each other is how the
 * film and the world end up a frame apart, and the film has to stay in step
 * with the projector that is supposedly casting it.
 *
 * Transport is a real one — pause, seek, 2× — because the act list is a pure
 * function of time: every act draws from `t` seconds since its own start and
 * keeps no state, so moving the clock anywhere is exactly as valid as letting
 * it run. That is the property that makes scrubbing free, and it is worth
 * protecting: an act that remembers anything between frames breaks seeking.
 *
 * Under prefers-reduced-motion nothing animates — each act's settled frame
 * (p = 1) is held for the act's duration, so the film still reads as a paced
 * sequence of stills and stays skippable and scrubbable throughout.
 *
 * This module owns the act list; src/film/timeline.ts is the leaf-level
 * drawing kit the acts share. Keeping the two apart is what stops the acts
 * and the player importing each other in a cycle — a cycle that used to work
 * only because main.ts happened to enter it from the player side, and blew up
 * the moment anything imported an act first.
 */

/// <reference types="vite/client" />

import { PALETTE, REDUCED_MOTION, clamp, ease, easeOut, rand } from '../core/contract'
import type { Act, ActRenderContext } from '../core/contract'
import { reset } from './timeline'
import { clearLinks } from './links'

import { act0 } from './acts/act0'
import { act1 } from './acts/act1'
import { act2 } from './acts/act2'
import { act3 } from './acts/act3'
import { act4 } from './acts/act4'
import { act5 } from './acts/act5'
import { act6 } from './acts/act6'
import { act7 } from './acts/act7'
import { act8 } from './acts/act8'
import { act9 } from './acts/act9'
import { act10 } from './acts/act10'
import { act11 } from './acts/act11'
import { digest } from './acts/digest'

/**
 * The film, in order. It follows the two minutes Elliot says out loud when
 * somebody asks him about himself, beat for beat:
 *
 *    0  the title, and a face being drawn
 *    1  curious and analytical, from a long way back — tournament chess
 *    2  and never only the one thing — guitar, sax
 *    3  Philosophy, Politics and Economics at UPenn
 *    4  the first internship: a real estate investment firm
 *    5  another summer, investment banking, and what it taught him he wanted
 *    6  senior year, and AI taking off
 *    7  teaching himself to build with it
 *    8  NewsGlide
 *    9  E&B, and the work it did for local businesses
 *   10  Cassidy, as an AI Solutions Consultant
 *   11  the card: what he's looking for now, and how to reach him
 *
 * THE FILE NAME, THE `id`, THE `index` PRINTED ON SCREEN AND THE POSITION IN
 * THIS ARRAY ARE ALL THE SAME NUMBER, and keeping them that way is worth the
 * churn of renaming files. It has been broken twice — once by cutting two acts
 * out of the middle and letting the survivors keep their old numbers, once by
 * inserting new ones at the end and ordering them here — and both times the
 * thing that actually broke was src/world/filmstage.ts, whose cues are keyed by
 * position and which lit the wrong act for a release.
 *
 * So: adding an act means renumbering from it, in film.json too. The compiler
 * catches everything except the cue table, which is why the constants there are
 * named after what they light.
 */
export const ACTS: readonly Act[] = [
  act0,
  act1,
  act2,
  act3,
  act4,
  act5,
  act6,
  act7,
  act8,
  act9,
  act10,
  act11,
]

/** Total runtime in seconds. */
export const RUNTIME = ACTS.reduce((n, a) => n + a.duration, 0)

/**
 * Which chapter is the closing card. Derived rather than written down, because
 * the card has moved twice now, and a hardcoded number fails silently.
 *
 * Nothing gates link hit-testing on this any more. The card is no longer the
 * only act with something clickable on it (act 8 carries the NewsGlide URL), so
 * main.ts asks src/film/links.ts what is on the picture instead of asking which
 * act is playing. Kept because "where does the film end" is a fair question to
 * be able to answer without knowing the act order.
 */
export const CARD_INDEX = ACTS.findIndex((a) => a.id === 'act11')

/* ==================================================================== *
 * THE TL;DR CARD, AND THE WIND FORWARD TO IT
 *
 * There is a thirteenth frame in this film and it is not in ACTS. It is the
 * whole film on one slide — see src/film/acts/digest.ts — and the only way to
 * it is the TLDR VERSION button that sits over the top-right
 * corner of the screen while the film is running (src/film/controls.ts).
 * Press it and the picture DIPS: the frame that was playing goes to black,
 * and the card comes up out of the black on its own cascade. See THE DIP
 * below.
 *
 * IT IS NOT A THIRTEENTH ACT AND MUST NOT BECOME ONE. Nothing derived from
 * ACTS knows it exists: it has no chapter on the scrubber, it adds nothing to
 * RUNTIME, the depth cues in src/world/filmstage.ts are not keyed to it, and
 * a viewer who never presses the button never sees it. What it does have is
 * its own clock — `digestT` below — because `state.time` is parked at the end
 * of the film while the card is up, and the card still has to arrive.
 *
 * THE WAY OUT OF IT IS `seek`. Touch the scrubber, press an arrow, jump a
 * chapter, and the card goes and the film is back at wherever you asked for.
 * That is the whole of the return path and it is deliberately not a second
 * button: the transport is already sitting there saying where in the film you
 * are, and it is the thing a viewer reaches for.
 * ==================================================================== */

/** the card the wind-forward lands on. Exported so the chrome can name it. */
export const DIGEST = digest

/* -------------------------------------------------------------------- *
 * THE DIP
 *
 * The button used to wind the reel: first the film at sixty times speed,
 * then a strip of finished stills flipping through the gate, one per act
 * left. Both were a tour of the thing the button promises to spare you —
 * press it early and you watched eleven pictures go past before the card.
 *
 * Now it is a dip to black, which is what a film does when it is leaving one
 * thing for another. The frame that was playing holds exactly where it was
 * and goes to black over RUSH_OUT; the card comes up out of the black over
 * RUSH_IN, its own cascade already running, so it is filling in as it lands.
 * The same length wherever it is pressed — nothing is being crossed, so
 * there is nothing for the distance to be measured in. The scrubber slides
 * to the end under the fade-out, so the transport agrees with the picture
 * about where the film is by the time the card is up.
 * -------------------------------------------------------------------- */

/** how long the frame that was playing takes to go to black */
const RUSH_OUT = 0.45

/** how long the card takes to come up out of the black */
const RUSH_IN = 0.4

const RUSH_SECONDS = RUSH_OUT + RUSH_IN

/**
 * The picture runs at the world's own rate for the length of the dip, and
 * only for that. See the note on FPS: thirty is plenty for an act, which is
 * three lines of type holding still, but a full-screen fade sampled at thirty
 * steps visibly. The cost is under a second of uploads at sixty rather than
 * thirty, once, on a button press.
 */
const RUSH_FPS = 60
const RUSH_FRAME_DT = 1 / RUSH_FPS

/* ==================================================================== *
 * The picture buffer
 *
 * TWO SIZES, AND THEY ARE NOT THE SAME THING. Everything that draws the
 * film — every act, every link box, the vignette, the grain — works in a
 * fixed 1280 × 726 design space and always will: a picture whose layout
 * moved with the window would be a different film in every window, which
 * is the opposite of the point.
 *
 * The BACKING STORE underneath it is not fixed. This is a texture, and it
 * lands on a rectangle thirty world units wide that the watching shot
 * frames to fill the viewport — so on a maximised 2× window the picture
 * arrives on about 1750 device pixels of screen, and 1280 texels stretched
 * across them is a soft, slightly smeared film. It was fine in a half-width
 * window (about 1200 device pixels, near enough 1:1) and worse the bigger
 * the window got, which is exactly backwards.
 *
 * So `fitTo` sizes the buffer for the pixels the picture actually lands on
 * and `paint` scales the context to match. The acts never know. See the
 * resize handler in src/main.ts, which asks the projector how big the
 * picture is going to be on this viewport.
 *
 * The height is the screen's aspect (30 × 17 world units), so the picture
 * lands on the screen rectangle with no letterboxing of its own. Change one
 * and you must change the other.
 * ==================================================================== */
export const CANVAS_W = 1280
export const CANVAS_H = 726

/**
 * How far past the design size the buffer may go, and in what steps.
 *
 * The cap is what keeps the honest cost honest: every repaint is an upload,
 * the upload is the whole buffer, and it happens 30 times a second. At 1×
 * that is 3.7MB a frame; at the 2× cap it is 15MB, which is the most a
 * projected film is worth on any display made. The quarter steps are so that
 * dragging a window edge cannot reallocate the texture on every frame of the
 * drag — and they round UP, because a buffer slightly larger than the
 * rectangle it lands on is invisible and one slightly smaller is not.
 */
const MAX_SCALE = 2
const SCALE_STEP = 0.25

function fitScale(devicePxWide: number): number {
  if (!Number.isFinite(devicePxWide) || devicePxWide <= 0) return 1
  const raw = Math.ceil(devicePxWide / CANVAS_W / SCALE_STEP) * SCALE_STEP
  return Math.min(MAX_SCALE, Math.max(1, raw))
}

/** Texture refresh rate. The world still runs at 60; the picture doesn't
 *  need to, and every repaint is an upload of the whole buffer — 3.7MB at
 *  the design size, 15MB at the cap above. 30 also happens to look more
 *  like film than 60 does. */
const FPS = 30
const FRAME_DT = 1 / FPS

/* ==================================================================== *
 * Chapters
 * ==================================================================== */

export interface Chapter {
  readonly id: string
  readonly title: string
  /** seconds into the film where this chapter begins */
  readonly start: number
  readonly duration: number
}

export const CHAPTERS: readonly Chapter[] = (() => {
  const out: Chapter[] = []
  let start = 0
  for (const a of ACTS) {
    out.push({ id: a.id, title: a.chapter, start, duration: a.duration })
    start += a.duration
  }
  return out
})()

/** index of the chapter containing `t` */
export function chapterAt(t: number): number {
  for (let i = CHAPTERS.length - 1; i >= 0; i--) {
    const c = CHAPTERS[i]
    if (c && t >= c.start) return i
  }
  return 0
}

/** 0:00 / 1:34 — the only time format anywhere */
export function timecode(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/* ==================================================================== *
 * The projector's own dirt
 *
 * The picture used to sit in a full-screen DOM layer with grain and a
 * vignette stacked on top of it in CSS. It doesn't any more, and a
 * perfectly clean rectangle reads as a slide, not as something being
 * thrown across thirty units of night air — so both moved in here, onto
 * the canvas, where the texture can carry them.
 * ==================================================================== */

/** one tile of static, built once and repeated — cheaper than per-pixel noise */
function grainPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const S = 128
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const c = cv.getContext('2d')
  if (!c) return null
  const img = c.createImageData(S, S)
  for (let i = 0; i < S * S; i++) {
    const v = 40 + rand(i * 1.37 + 5) * 215
    img.data[i * 4] = v
    img.data[i * 4 + 1] = v
    img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  c.putImageData(img, 0, 0)
  return ctx.createPattern(cv, 'repeat')
}

/**
 * The playback speeds the transport offers, slowest first.
 *
 * A LIST RATHER THAN A RANGE, for the same reason every video player on the
 * web does it this way: the useful speeds are a handful of ratios, and a
 * continuous control makes a viewer aim at one. Anything not on this list is
 * snapped onto it by `setRate` — there is no way to end up at 1.37×, whatever
 * calls in.
 *
 * The chrome builds one button per entry (src/film/controls.ts), so adding a
 * speed here adds a button and nothing else needs to know.
 */
export const RATES: readonly number[] = [0.5, 1, 2, 3]

/** the speed a film starts at, and what the shuttle and Escape fall back to */
export const RATE_DEFAULT = 1

export interface FilmState {
  running: boolean
  paused: boolean
  /** seconds elapsed, 0…RUNTIME */
  time: number
  /** one of RATES */
  rate: number
  chapter: number
  /** the reel is winding forward to the TL;DR card. Over in about a second. */
  rushing: boolean
  /** the TL;DR card is up, and the film is holding on it */
  digest: boolean
  /**
   * The reel has run out and the film is holding on its last frame — still
   * running, still on the screen, until somebody scrubs back into it or
   * leaves. Exactly the hold the TL;DR card gets, for the same reason: the
   * last card is the one with the addresses on it, and a film that tore
   * itself down the moment it reached them was taking away the one frame a
   * viewer might want to write down or press.
   */
  ended: boolean
}

export interface Film {
  /** the picture. Hand it to whatever is going to display it. */
  readonly canvas: HTMLCanvasElement
  readonly state: FilmState
  /**
   * Size the buffer for the number of device pixels the picture is actually
   * going to land on. The aspect never changes, so whatever is showing the
   * film keeps the shape it built for it.
   *
   * Returns true if the buffer changed size — which is a reallocation, not a
   * repaint, so the caller has to rebuild its texture rather than re-upload
   * it. See `resizeScreen` on the projector.
   */
  fitTo(devicePxWide: number): boolean
  play(from?: number): void
  stop(): void
  /**
   * Wipe the picture back to black. Whoever is *showing* the film has to call
   * this before it strikes its lamp for a second viewing: `stop()` leaves the
   * last frame on the canvas on purpose (see below), so a screen that fades up
   * before `play()` runs fades up on the end of the previous viewing.
   */
  blank(): void
  setPaused(on: boolean): void
  togglePaused(): void
  /** absolute position in seconds; clamped, safe at any time */
  seek(seconds: number): void
  /** relative seek, in seconds */
  nudge(seconds: number): void
  /** jump to the start of chapter `i`, or the start of the current one */
  toChapter(i: number): void
  /**
   * Wind the reel forward to the TL;DR card and hold there. Safe at any point
   * in the film, including while paused; a no-op once the card is already up.
   * `seek` is the way back out. See THE DIP above.
   */
  rush(): void
  setRate(rate: number): void
  /** advance by `dt` seconds of wall clock. Returns true if the picture
   *  was repainted, so the caller knows when to re-upload the texture. */
  update(dt: number): boolean
  onEnd(cb: () => void): void
}

export function createFilm(): Film {
  const canvas = document.createElement('canvas')
  /** device pixels per design pixel — see the picture buffer note above */
  let scale = 1
  canvas.width = CANVAS_W
  canvas.height = CANVAS_H

  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('[film] 2D canvas context unavailable')
  const ctx: CanvasRenderingContext2D = context

  const grain = grainPattern(ctx)

  // The projected rectangle falls off at its edges; cached because the buffer
  // never resizes. Kept light on purpose — the projector throws no visible
  // beam any more (see world/landmarks/projector.ts for why), so nothing is
  // lifting the middle of the picture to compensate for dark corners.
  const vignette = ctx.createRadialGradient(
    CANVAS_W * 0.5,
    CANVAS_H * 0.47,
    CANVAS_H * 0.4,
    CANVAS_W * 0.5,
    CANVAS_H * 0.47,
    CANVAS_W * 0.72,
  )
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(0.62, 'rgba(0,0,0,0.13)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.42)')

  const ends: Array<() => void> = []

  const state: FilmState = {
    running: false,
    paused: false,
    time: 0,
    rate: RATE_DEFAULT,
    chapter: 0,
    rushing: false,
    digest: false,
    ended: false,
  }

  let acc = 0
  let dirty = true
  let grainStep = 0
  /** the TL;DR card's own clock — `state.time` is parked at the end while it is up */
  let digestT = 0
  /** real seconds since the dip started */
  let rushT = 0
  /** the act that was playing when the button went down */
  let rushFirst = 0
  /** how far into that act it was, so the frame holds where it was while it fades */
  let rushHeld = 0
  /** the card's own clock, running from the moment it starts coming up */
  let rushCardT = 0
  /** where the clock was when it was pressed, and how much film was left */
  let rushFrom = 0
  let rushSpan = 0

  /* ---------------- painting ---------------- */

  function finish(): void {
    reset(ctx)

    // emulsion. Stepped, not drifting — film grain jumps frame to frame.
    if (grain) {
      grainStep = (grainStep + 1) % 7
      const ox = -((grainStep * 37) % 128)
      const oy = -((grainStep * 61) % 128)
      ctx.save()
      ctx.globalCompositeOperation = 'overlay'
      ctx.globalAlpha = REDUCED_MOTION ? 0.035 : 0.06
      ctx.translate(ox, oy)
      ctx.fillStyle = grain
      ctx.fillRect(0, 0, CANVAS_W + 128, CANVAS_H + 128)
      ctx.restore()
    }

    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  }

  function paint(): void {
    /* WHAT IS ON THE SCREEN is one of two things: the act the clock is inside,
       or the TL;DR card — which is not in ACTS and runs on its own clock,
       because `state.time` is parked at the end of the film while it is up. */
    let act: Act | undefined
    let local: number
    if (state.digest) {
      act = DIGEST
      local = digestT
    } else {
      const i = state.chapter
      act = ACTS[i] ?? ACTS[0]
      const chapter = CHAPTERS[i] ?? CHAPTERS[0]
      if (!act || !chapter) return
      local = clamp(state.time - chapter.start, 0, act.duration)
    }
    if (!act) return
    const showing: Act = act

    // Whatever was clickable belonged to the frame that has just been thrown
    // away. Clear it here, once, before the act draws: an act that publishes
    // links republishes them every frame, and one that doesn't leaves the list
    // empty — which is exactly right when you seek out of it.
    clearLinks()

    // the one place the buffer's real size is allowed to matter: everything
    // downstream of here draws in design pixels
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    reset(ctx)
    ctx.fillStyle = PALETTE.nightCss
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    const frame: ActRenderContext = {
      ctx,
      w: CANVAS_W,
      h: CANVAS_H,
      p: REDUCED_MOTION ? 1 : clamp(local / showing.duration),
      t: REDUCED_MOTION ? showing.duration : local,
      reduced: REDUCED_MOTION,
    }

    if (state.rushing && !REDUCED_MOTION) {
      /* THE DIP. Out: the frame that was playing, held exactly where it was
         when the button went down, under a black that comes up over it. In:
         the card, on its own clock, under a black that goes away. */
      const out = rushT < RUSH_OUT
      let held: Act | undefined
      let t: number
      if (out) {
        held = ACTS[rushFirst]
        t = rushHeld
      } else {
        held = DIGEST
        t = rushCardT
      }
      if (held) {
        held.draw({ ctx, w: CANVAS_W, h: CANVAS_H, p: clamp(t / held.duration), t, reduced: false })
      }
      const black = out ? ease(clamp(rushT / RUSH_OUT)) : 1 - ease(clamp((rushT - RUSH_OUT) / RUSH_IN))
      if (black > 0.002) {
        reset(ctx)
        ctx.fillStyle = `rgba(0,0,0,${black.toFixed(3)})`
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
      }
      /* …and nothing on a picture that is fading is clickable. The acts
         publish their link boxes as they draw, and the pointer is still live
         out in main.ts. */
      clearLinks()
    } else {
      ctx.save()
      showing.draw(frame)
      ctx.restore()
    }

    finish()
    dirty = false
  }

  /** dark, so the screen has something to be before the first frame lands */
  function blank(): void {
    // the one place the buffer's real size is allowed to matter: everything
    // downstream of here draws in design pixels
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    reset(ctx)
    ctx.fillStyle = PALETTE.nightCss
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  }
  blank()

  /**
   * Resize the buffer under the picture. Nothing above this line knows it
   * happened: the design space is the same 1280 × 726 either way.
   */
  function fitTo(devicePxWide: number): boolean {
    const want = fitScale(devicePxWide)
    if (want === scale) return false
    scale = want
    canvas.width = Math.round(CANVAS_W * scale)
    // from the width, so the aspect is whatever rounding gives the width and
    // the picture can never land on the screen rectangle letterboxed
    canvas.height = Math.round(canvas.width * (CANVAS_H / CANVAS_W))
    // Setting either dimension clears the canvas and resets the context. The
    // picture has to be put back before anyone uploads it, or a viewer who
    // resizes mid-film gets one black frame for their trouble.
    if (state.running) paint()
    else blank()
    return true
  }

  /* ---------------- transport ---------------- */

  function locate(): void {
    state.chapter = chapterAt(state.time)
  }

  /** the reel has run out; the card drops into the gate and the film holds */
  function enterDigest(): void {
    clearLinks()
    state.rushing = false
    state.digest = true
    state.ended = false
    // the film IS over — the transport should say so, and the last chapter
    // should be the lit one on the scrubber
    state.time = RUNTIME - 0.001
    state.chapter = CHAPTERS.length - 1
    // the card started filling in as it came up out of the black; carry on from there
    digestT = rushCardT
    rushCardT = 0
    acc = 0
    dirty = true
  }

  /* THE WAY BACK INTO THE FILM, and the reason there is no second button for
     it: asking for a position in the film is asking to be in the film, so the
     card and the wind-forward both end here. Note the guard is not just
     "did the time change" any more — the card parks the clock at the end, so
     clicking the far right of the scrubber while it is up would have been a
     no-op that left the card exactly where it was. */
  function seek(seconds: number): void {
    const t = clamp(seconds, 0, RUNTIME - 0.001)
    const leaving = state.digest || state.rushing || state.ended
    if (t === state.time && !leaving) return
    state.rushing = false
    state.digest = false
    state.ended = false
    rushCardT = 0
    state.time = t
    locate()
    acc = 0
    dirty = true
  }

  function stop(): void {
    const was = state.running
    // the card's link boxes describe a picture that is about to stop existing
    clearLinks()
    state.running = false
    state.paused = false
    state.rate = 1
    state.time = 0
    state.chapter = 0
    state.rushing = false
    state.digest = false
    state.ended = false
    digestT = 0
    rushCardT = 0
    acc = 0
    dirty = true
    // DELIBERATELY NOT BLANKED. `update()` goes to some trouble to land on the
    // film's last frame before calling this, and wiping the canvas here threw
    // that away: the caller uploaded the black buffer, so the picture snapped
    // to black and *then* the lamp faded, which reads as the thing crashing
    // rather than ending. The projector fades the screen out over its own
    // half-second; let it fade out over a picture.
    //
    // The cost is that the last frame is still sitting there the NEXT time the
    // lamp strikes — and it strikes a good two seconds before `play()` does,
    // out in main.ts, while the figure walks clear of the beam. So the caller
    // owns the wipe: `blank()`, on the way in. See startFilm in src/main.ts.
    if (was) for (const cb of ends.slice()) cb()
  }

  function update(dt: number): boolean {
    if (!state.running) return false

    /* ---- the TL;DR card, holding ----
       It never ends. The film is over — `state.time` is at RUNTIME and the
       scrubber is full — and this frame stays on the screen until somebody
       scrubs back into the film or leaves. Nothing here may call `stop()`:
       that is what ends the viewing, walks the camera back and gives the
       field to the figure, and it is not what pressing TLDR asked for. */
    if (state.digest) {
      if (!state.paused) digestT += dt
      if (REDUCED_MOTION) {
        if (!dirty) return false
        paint()
        return true
      }
      if (dirty) {
        acc = 0
        paint()
        return true
      }
      if (state.paused) return false
      acc += dt
      if (acc < FRAME_DT) return false
      acc %= FRAME_DT
      paint()
      return true
    }

    /* ---- the dip ----
       Pause has no say in it: the dip is an action already in flight, not a
       speed, and it is over in under a second. The clock is not advanced by
       a rate — it is PLACED, sliding to the end under the fade-out, so the
       scrubber is full by the time the card is up and nothing here can
       overshoot RUNTIME or stop short of it. */
    if (state.rushing) {
      rushT += dt
      if (rushT >= RUSH_SECONDS) {
        enterDigest()
        paint()
        return true
      }
      state.time = rushFrom + rushSpan * easeOut(clamp(rushT / RUSH_OUT))
      state.chapter = chapterAt(state.time)
      // the card's clock starts the moment it begins coming up
      if (rushT > RUSH_OUT) rushCardT = rushT - RUSH_OUT
      acc += dt
      if (acc < RUSH_FRAME_DT) return false
      acc %= RUSH_FRAME_DT
      paint()
      return true
    }

    /* ---- the end of the reel ----
       The clock parks on the last frame and the film HOLDS there — it does
       not stop. `stop()` is what walks the camera back and hands the field to
       the figure, and it is now only ever called by somebody leaving (Escape,
       the close button, walking away); reaching the end is not leaving. The
       repaint below keeps running so the grain still moves on the held
       frame, and `seek` is the way back into the film, as it is off the card. */
    if (!state.paused && !state.ended) {
      state.time += dt * state.rate
      if (state.time >= RUNTIME) {
        state.time = RUNTIME - 0.001
        state.ended = true
        locate()
        dirty = true
      }
      const i = chapterAt(state.time)
      if (i !== state.chapter) {
        state.chapter = i
        dirty = true
      }
    }

    // Reduced motion holds one settled frame per act: repaint only when the
    // act changes or something moved the clock. Everyone else gets FPS.
    if (REDUCED_MOTION) {
      if (!dirty) return false
      paint()
      return true
    }

    if (dirty) {
      acc = 0
      paint()
      return true
    }
    if (state.paused) return false

    acc += dt
    if (acc < FRAME_DT) return false
    acc %= FRAME_DT
    paint()
    return true
  }

  return {
    canvas,
    state,
    fitTo,

    play(from = 0) {
      state.running = true
      state.paused = false
      state.rate = 1
      state.time = clamp(from, 0, RUNTIME - 0.001)
      state.rushing = false
      state.digest = false
      state.ended = false
      digestT = 0
      rushCardT = 0
      locate()
      acc = 0
      dirty = true
      paint()
    },

    rush() {
      if (!state.running || state.digest) return
      // whatever the transport was doing, this is what is happening now
      state.paused = false
      const remaining = RUNTIME - state.time
      /* Nothing left to leave, or nobody to watch it go: straight to the card.
         Under reduced motion a fade is motion too, and the card is the point
         of the button. */
      if (REDUCED_MOTION || remaining < 0.3) {
        enterDigest()
        paint()
        return
      }
      rushFrom = state.time
      rushSpan = remaining
      rushFirst = state.chapter
      rushHeld = clamp(state.time - (CHAPTERS[rushFirst]?.start ?? 0), 0, ACTS[rushFirst]?.duration ?? 0)
      rushCardT = 0
      rushT = 0
      state.rushing = true
      acc = 0
      dirty = true
    },

    stop,
    blank,
    seek,

    setPaused(on: boolean) {
      if (!state.running || state.paused === on) return
      state.paused = on
      if (!on) acc = 0
    },

    togglePaused() {
      if (!state.running) return
      state.paused = !state.paused
      if (!state.paused) acc = 0
    },

    nudge(seconds: number) {
      seek(state.time + seconds)
    },

    toChapter(i: number) {
      const c = CHAPTERS[clamp(i, 0, CHAPTERS.length - 1)]
      if (c) seek(c.start)
    },

    /* Snapped onto RATES rather than trusted. This is called by a button that
       already holds one of them, by the space shuttle, and by whatever tries it
       from a console — and the clock multiplies by whatever lands here, so an
       unchecked 0 stops the film dead with the transport still saying it is
       playing, and a negative number runs it backwards into a negative
       `time`. Nearest-wins keeps every caller honest for the cost of a scan. */
    setRate(rate: number) {
      let best = RATE_DEFAULT
      let bestD = Infinity
      for (const r of RATES) {
        const d = Math.abs(r - rate)
        if (d < bestD) {
          bestD = d
          best = r
        }
      }
      state.rate = best
    },

    update,

    onEnd(cb: () => void) {
      if (typeof cb === 'function') ends.push(cb)
    },
  }
}

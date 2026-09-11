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

import { PALETTE, REDUCED_MOTION, clamp, rand } from '../core/contract'
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
 * Press it and the reel
 * winds forward: the picture takes hold, rolls through the gate at whatever
 * speed gets it to the end in a little over a second, and the card cuts in
 * over it while the reel is still turning.
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

/**
 * How long the wind forward takes, in real seconds, from wherever it is
 * pressed. It is a fixed WAIT rather than a fixed SPEED — the rate is worked
 * out from how much film is left — because the button is a request for the
 * facts and the price of it should not depend on how far in you happened to
 * be. Pressed at the very end there is nothing left to wind, so the floor
 * below takes over and it is simply quick.
 *
 * IT IS A GLIMPSE, NOT A PREVIEW. Two seconds was long enough that the roll
 * started to read as something you were meant to watch, which is the one thing
 * the button's own label promises you are not going to have to do. At this
 * length the film goes past — you see there was a film, and you see roughly
 * how much of it there was — and then the card is up.
 *
 * It is a shade longer than the 1.15 it ran at when the wind was a flat rate,
 * and that is not a change of mind about the length. The curve below spends
 * its first sixth taking hold and its last seventh easing off; at 1.15 there
 * was no room left in the middle for it to actually run, and a dial that
 * starts stopping before it has finished starting is the one thing this was
 * meant to stop looking like.
 */
const RUSH_SECONDS = 1.3

/**
 * The floor under the wind's TOP speed, in film-seconds per real second, and
 * the reason a press two seconds from the end does not sit there winding for
 * the full RUSH_SECONDS. Below it the wind keeps its shape and simply takes
 * less time — see `rush`.
 */
const RUSH_MIN_PEAK = 8

/* -------------------------------------------------------------------- *
 * THE SHAPE OF THE WIND
 *
 * It used to be a flat rate: press the button and the clock jumped to sixty
 * times speed for a second and then stopped dead at the card. Two hard edges,
 * a constant in between, and the roll over the top of it running at its own
 * unrelated seven a second — which is why it read as the film cutting rather
 * than as anything being wound.
 *
 * What it is now is a dial being spun. `spin` is the speed, as a fraction of
 * the wind's own top speed: it takes hold over the first sixth, runs, and
 * eases off over the last seventh. `windTo` is that curve integrated, which is
 * where the clock actually comes from; the roll comes off the same number, so
 * the picture slows down because the REEL is slowing down and not because a
 * second timer says so.
 *
 * IT DOES NOT COME TO REST. For a while the tail was a cosine down to zero,
 * and a reel that stops dead is a reel that sits: the last third of the wind
 * was spent slowing, the final few frames were all but still, and the screen
 * held the last act's closing lines for a beat before the card arrived — long
 * enough to read as a glimpse of an ending the button had promised to spare
 * you. So the tail is short and stops at SPIN_FLOOR of the peak: the reel is
 * still turning when the card cuts in over it, which is what a cut is.
 * -------------------------------------------------------------------- */

/** the fraction of the wind spent getting up to speed */
const SPIN_RAMP = 0.16

/** the fraction of the wind spent easing off at the end */
const SPIN_TAIL = 0.14

/** the speed the wind is still doing, as a fraction of its peak, when the card cuts in */
const SPIN_FLOOR = 0.45

/** a³ − a⁴/2: the smoothstep a²(3 − 2a) integrated from 0 */
const smoothArea = (a: number): number => a * a * a - 0.5 * a * a * a * a

/**
 * The area under `spin` over its whole length, which is the wind's average
 * speed as a fraction of its peak. `rush` needs it to turn a floor on the
 * peak into a floor on the wait.
 */
const SPIN_MEAN =
  SPIN_RAMP * 0.5 + (1 - SPIN_RAMP - SPIN_TAIL) + SPIN_TAIL * (SPIN_FLOOR + (1 - SPIN_FLOOR) * 0.5)

/** the wind's speed at `u` of its own length, as a fraction of its own peak */
function spin(u: number): number {
  if (u <= 0 || u >= 1) return 0
  if (u < SPIN_RAMP) {
    const a = u / SPIN_RAMP
    return a * a * (3 - 2 * a)
  }
  if (u < 1 - SPIN_TAIL) return 1
  const c = (u - (1 - SPIN_TAIL)) / SPIN_TAIL
  return SPIN_FLOOR + (1 - SPIN_FLOOR) * (1 - c * c * (3 - 2 * c))
}

/**
 * How far through the film that was left the wind has got, 0…1, at `u` of its
 * own length. `spin`, integrated and renormalised — so it is exactly 0 at the
 * start and exactly 1 at the end whatever shape the curve above is given, and
 * the card drops into the gate on the frame the reel is passing rather than
 * on wherever a clock happened to land.
 */
function windTo(u: number): number {
  if (u <= 0) return 0
  if (u >= 1) return 1
  let area: number
  if (u < SPIN_RAMP) {
    area = SPIN_RAMP * smoothArea(u / SPIN_RAMP)
  } else if (u < 1 - SPIN_TAIL) {
    area = SPIN_RAMP * 0.5 + (u - SPIN_RAMP)
  } else {
    const c = (u - (1 - SPIN_TAIL)) / SPIN_TAIL
    area =
      SPIN_RAMP * 0.5 +
      (1 - SPIN_RAMP - SPIN_TAIL) +
      SPIN_TAIL * (SPIN_FLOOR * c + (1 - SPIN_FLOOR) * (c - smoothArea(c)))
  }
  return area / SPIN_MEAN
}

/**
 * How many whole frames go past the gate over the length of the wind. This is
 * the only reason the rush reads as a projector rather than as the film
 * glitching: the picture is drawn twice, offset, with the frame line between
 * them travelling up the screen — which is what a reel being wound on
 * actually looks like.
 *
 * IT IS A COUNT AND NOT A RATE, and that is what lets the card cut in without
 * a jump. The roll is driven off how far the wind has GOT rather than off the
 * clock, so when the wind ends it has turned exactly this many times and the
 * frame standing in the gate is square in it. A rate landed wherever it landed
 * and handed over with the frame line halfway up the screen.
 *
 * Four over a second and a third comes out around six a second at the top of
 * the wind — slow enough to see individual frames go past, fast enough that
 * nobody tries to read one — and it slows with the reel, because it IS the
 * reel.
 */
const SLIP_TURNS = 4

/**
 * The picture runs at the world's own rate for the length of the wind, and
 * only for that. See the note on FPS: thirty is plenty for an act, which is
 * three lines of type holding still, and it is not nearly enough for a
 * full-screen vertical roll — sampled at thirty the frame line jumps a
 * quarter of the screen at a time and strobes, which was most of what "it
 * feels unsmooth" actually was. The cost is a second and a third of uploads
 * at sixty rather than thirty, once, on a button press.
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
   * `seek` is the way back out. See the note above RUSH_SECONDS.
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
  }

  let acc = 0
  let dirty = true
  let grainStep = 0
  /** the TL;DR card's own clock — `state.time` is parked at the end while it is up */
  let digestT = 0
  /** real seconds since the wind started */
  let rushT = 0
  /** how long this wind is going to take, worked out when the button is pressed */
  let rushDur = RUSH_SECONDS
  /** where the clock was when it was pressed, and how much film was left */
  let rushFrom = 0
  let rushSpan = 0
  /** how far through that the wind has got, 0…1. The clock, the roll and the
   *  grain are all read off this one number, which is why they move together. */
  let rushRoll = 0

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
      // A film going past the gate at sixty times speed is a dirtier picture,
      // and the grain is the only thing on screen that can say so. It is tied
      // to how fast the reel is actually going rather than to whether it is
      // winding at all, so the dirt comes up with the wind and settles with
      // it instead of switching on and off at both ends.
      ctx.globalAlpha = REDUCED_MOTION
        ? 0.035
        : state.rushing
          ? 0.06 + 0.06 * spin(rushT / rushDur)
          : 0.06
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
      /* THE GATE. The picture is drawn twice, offset by one whole frame, with
         a frame line travelling up between them — so the reel reads as being
         wound on rather than as the film skipping. The two copies are the same
         act at the same instant, which is what two adjacent frames of a film
         very nearly are.

         The roll comes off `rushRoll` — how far the wind has got — and not
         off a clock of its own, so it runs at a speed the eye can follow
         while the film underneath it is doing sixty times normal, and it
         comes to rest square in a frame at the end. See SLIP_TURNS. */
      const slip = (rushRoll * SLIP_TURNS) % 1
      const dy = -slip * CANVAS_H
      for (const off of [dy, dy + CANVAS_H]) {
        ctx.save()
        ctx.translate(0, off)
        showing.draw(frame)
        ctx.restore()
      }
      // the black bar between one frame and the next
      ctx.fillStyle = 'rgba(0,0,0,0.82)'
      ctx.fillRect(0, dy + CANVAS_H - CANVAS_H * 0.012, CANVAS_W, CANVAS_H * 0.024)
      /* …and nothing on a frame going past at this speed is clickable. The
         acts publish their link boxes as they draw, twice over and at the
         wrong height, and the pointer is still live out in main.ts. */
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
    rushRoll = 0
    // the film IS over — the transport should say so, and the last chapter
    // should be the lit one on the scrubber
    state.time = RUNTIME - 0.001
    state.chapter = CHAPTERS.length - 1
    digestT = 0
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
    const leaving = state.digest || state.rushing
    if (t === state.time && !leaving) return
    state.rushing = false
    state.digest = false
    rushRoll = 0
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
    digestT = 0
    rushRoll = 0
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

    /* ---- winding forward ----
       Pause has no say in it: the wind is an action already in flight, not a
       speed, and it is over in a second and a third. The clock is not
       advanced by a rate — it is PLACED, off `windTo`, so the curve owns
       where the film is and the end of the curve is exactly the end of the
       film. Nothing here can overshoot RUNTIME or stop short of it. */
    if (state.rushing) {
      rushT += dt
      if (rushT >= rushDur) {
        enterDigest()
        paint()
        return true
      }
      rushRoll = windTo(rushT / rushDur)
      state.time = rushFrom + rushSpan * rushRoll
      state.chapter = chapterAt(state.time)
      acc += dt
      if (acc < RUSH_FRAME_DT) return false
      acc %= RUSH_FRAME_DT
      paint()
      return true
    }

    if (!state.paused) {
      state.time += dt * state.rate
      if (state.time >= RUNTIME) {
        // land on the last frame before tearing down, so the film ends on a
        // picture rather than on whatever the previous repaint happened to be
        state.time = RUNTIME - 0.001
        locate()
        paint()
        stop()
        return true
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
      digestT = 0
      rushRoll = 0
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
      /* Nothing to wind, or nobody to watch it wind: go straight to the card.
         Under reduced motion the roll is exactly the kind of thing that is not
         to be inflicted on anybody — a full-screen picture rolling vertically
         six times a second — and the card is the point of the button. */
      if (REDUCED_MOTION || remaining < 0.3) {
        enterDigest()
        paint()
        return
      }
      rushFrom = state.time
      rushSpan = remaining
      /* The wait is fixed, and the FLOOR is on the speed rather than on the
         wait: the curve peaks at 1/SPIN_MEAN of its own average, so a wind
         that would not get above RUSH_MIN_PEAK keeps its shape and takes less
         time instead. Pressed near the end it is simply quick. */
      rushDur = Math.min(RUSH_SECONDS, remaining / (SPIN_MEAN * RUSH_MIN_PEAK))
      rushT = 0
      rushRoll = 0
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

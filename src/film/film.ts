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
export const RATES: readonly number[] = [0.5, 1, 1.5, 2]

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
  }

  let acc = 0
  let dirty = true
  let grainStep = 0

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
    const i = state.chapter
    const act = ACTS[i] ?? ACTS[0]
    const chapter = CHAPTERS[i] ?? CHAPTERS[0]
    if (!act || !chapter) return
    const local = clamp(state.time - chapter.start, 0, act.duration)

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
      p: REDUCED_MOTION ? 1 : clamp(local / act.duration),
      t: REDUCED_MOTION ? act.duration : local,
      reduced: REDUCED_MOTION,
    }

    ctx.save()
    act.draw(frame)
    ctx.restore()

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

  function seek(seconds: number): void {
    const t = clamp(seconds, 0, RUNTIME - 0.001)
    if (t === state.time) return
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
      locate()
      acc = 0
      dirty = true
      paint()
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

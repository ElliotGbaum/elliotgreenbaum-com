/**
 * THE FILM — act sequencing and playback.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  ELLIOT — WHERE TO EDIT                                              │
 * │                                                                      │
 * │  WORDS    src/content/film.json                                      │
 * │           Every user-visible string in the film lives there, keyed   │
 * │           by act ("act0" … "act5"). Change a string, reload, done.   │
 * │           `caption` is announced to screen readers when the act      │
 * │           begins and is printed under the picture as a subtitle —    │
 * │           keep it to one or two short sentences.                     │
 * │                                                                      │
 * │  LENGTHS  the `DURATION` constant at the top of each                 │
 * │           src/film/acts/actN.ts, in seconds. Every act is timed off  │
 * │           seconds from its own start, so making an act longer adds   │
 * │           hold time at the end instead of breaking its choreography. │
 * │                                                                      │
 * │  ORDER    the ACTS array below.                                      │
 * │                                                                      │
 * │  LOOK     src/film/film.css — letterbox, grain, vignette, flicker.   │
 * │           Colour comes from PALETTE in src/core/contract.ts and      │
 * │           nowhere else.                                              │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * How it runs: one requestAnimationFrame loop, one 2D canvas, DPR capped at
 * 2. The loop pauses while the tab is hidden. Under prefers-reduced-motion
 * nothing animates — each act's settled frame (p = 1) is held for the act's
 * duration, so the film still reads as a paced sequence of stills and stays
 * skippable throughout.
 *
 * This module owns the act list; src/film/timeline.ts is the leaf-level
 * drawing kit the acts share. Keeping the two apart is what stops the acts
 * and the player importing each other in a cycle — a cycle that used to work
 * only because main.ts happened to enter it from the player side, and blew up
 * the moment anything imported an act first.
 */

/// <reference types="vite/client" />

import './film.css'
import { PALETTE, REDUCED_MOTION, clamp } from '../core/contract'
import type { Act, ActRenderContext } from '../core/contract'
import { reset } from './timeline'

import { act0 } from './acts/act0'
import { act1 } from './acts/act1'
import { act2 } from './acts/act2'
import { act3 } from './acts/act3'
import { act4 } from './acts/act4'
import { act5 } from './acts/act5'

/** The film, in order. */
export const ACTS: readonly Act[] = [act0, act1, act2, act3, act4, act5]

/** Total runtime in seconds. */
export const RUNTIME = ACTS.reduce((n, a) => n + a.duration, 0)

/* ==================================================================== *
 * The player
 * ==================================================================== */

export interface Film {
  play(): void
  stop(): void
  readonly running: boolean
  onEnd(cb: () => void): void
}

export function createFilm(): Film {
  const root = document.getElementById('film')
  const canvas = document.getElementById('film-canvas')
  const bar = document.querySelector<HTMLElement>('#film-progress span')
  const skip = document.getElementById('film-skip')
  const caption = document.getElementById('film-caption')

  if (
    !(root instanceof HTMLElement) ||
    !(canvas instanceof HTMLCanvasElement) ||
    !bar ||
    !(skip instanceof HTMLElement) ||
    !(caption instanceof HTMLElement)
  ) {
    throw new Error(
      '[film] missing markup: expected #film, #film-canvas, #film-progress span, #film-skip, #film-caption',
    )
  }

  // re-bound so the narrowing above survives into the closures below
  const view: HTMLElement = root
  const surface: HTMLCanvasElement = canvas
  const rail: HTMLElement = bar
  const skipBtn: HTMLElement = skip
  const sub: HTMLElement = caption

  const context = surface.getContext('2d', { alpha: false })
  if (!context) throw new Error('[film] 2D canvas context unavailable')
  const ctx: CanvasRenderingContext2D = context

  const ends: Array<() => void> = []

  let raf = 0
  let abort: AbortController | null = null
  let ro: ResizeObserver | null = null
  let isRunning = false
  let elapsed = 0
  let last = 0
  let index = -1
  let dpr = 0
  let cssW = 0
  let cssH = 0
  let dirty = true
  let shown = -1
  let restore: HTMLElement | null = null

  function measure(): void {
    const r = surface.getBoundingClientRect()
    const nw = Math.max(1, Math.round(r.width || window.innerWidth))
    const nh = Math.max(1, Math.round(r.height || window.innerHeight))
    const nd = Math.min(2, window.devicePixelRatio || 1)
    if (nw === cssW && nh === cssH && nd === dpr) return
    cssW = nw
    cssH = nh
    dpr = nd
    surface.width = Math.round(nw * nd)
    surface.height = Math.round(nh * nd)
    dirty = true
  }

  function paint(act: Act, local: number): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    reset(ctx)
    ctx.fillStyle = PALETTE.nightCss
    ctx.fillRect(0, 0, cssW, cssH)

    const frame: ActRenderContext = {
      ctx,
      w: cssW,
      h: cssH,
      p: REDUCED_MOTION ? 1 : clamp(local / act.duration),
      t: REDUCED_MOTION ? act.duration : local,
      reduced: REDUCED_MOTION,
    }

    ctx.save()
    act.draw(frame)
    ctx.restore()
    dirty = false
  }

  function progress(): void {
    const v = clamp(elapsed / RUNTIME)
    // reduced motion gets a stepped rail rather than a continuously moving one
    const step = REDUCED_MOTION ? 0.004 : 0.0006
    if (shown < 0 || Math.abs(v - shown) >= step || v >= 1) {
      shown = v
      rail.style.width = `${(v * 100).toFixed(2)}%`
    }
  }

  function tick(now: number): void {
    raf = requestAnimationFrame(tick)

    if (document.hidden) {
      last = now
      return
    }

    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
    last = now
    elapsed += dt

    if (elapsed >= RUNTIME) {
      elapsed = RUNTIME
      progress()
      stop()
      return
    }

    let offset = 0
    let i = 0
    for (const a of ACTS) {
      if (elapsed < offset + a.duration) break
      offset += a.duration
      i++
    }
    const act = ACTS[Math.min(i, ACTS.length - 1)]
    if (!act) return

    if (i !== index) {
      index = i
      sub.textContent = act.caption
      dirty = true
    }

    measure()
    if (!REDUCED_MOTION || dirty) paint(act, elapsed - offset)
    progress()
  }

  function onKey(e: KeyboardEvent): void {
    // captured before anything else: while the film is up it owns the keyboard,
    // so the world can never be steered from underneath it
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      stop()
      return
    }
    // a modal dialog with exactly one control — keep focus inside it
    if (e.key === 'Tab') {
      e.preventDefault()
      skipBtn.focus()
    }
  }

  function onSkip(e: Event): void {
    e.preventDefault()
    stop()
  }

  function onVisible(): void {
    if (!document.hidden) last = performance.now()
  }

  function play(): void {
    elapsed = 0
    index = -1
    shown = -1
    dirty = true
    sub.textContent = ''
    rail.style.width = '0%'

    if (!isRunning) {
      isRunning = true
      restore = document.activeElement instanceof HTMLElement ? document.activeElement : null
      view.hidden = false
      view.classList.add('is-live')

      cssW = 0
      cssH = 0
      dpr = 0
      measure()

      abort = new AbortController()
      const signal = abort.signal
      window.addEventListener('resize', measure, { signal })
      window.addEventListener('orientationchange', measure, { signal })
      window.addEventListener('keydown', onKey, { signal, capture: true })
      document.addEventListener('visibilitychange', onVisible, { signal })
      skipBtn.addEventListener('click', onSkip, { signal })

      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(measure)
        ro.observe(surface)
      }

      try {
        skipBtn.focus({ preventScroll: true })
      } catch {
        /* focus is a nicety, never a failure */
      }
    }

    last = performance.now()
    if (!raf) raf = requestAnimationFrame(tick)
  }

  /**
   * Tear down and reset. Fires onEnd if the film was running — so the natural
   * end, Skip and Escape all take the same path and callers can never wait on
   * an event that will not come.
   */
  function stop(): void {
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
    if (abort) {
      abort.abort()
      abort = null
    }
    if (ro) {
      ro.disconnect()
      ro = null
    }

    const was = isRunning
    isRunning = false
    elapsed = 0
    index = -1
    shown = -1
    dirty = true

    view.hidden = true
    view.classList.remove('is-live')
    sub.textContent = ''
    rail.style.width = '0%'

    const back = restore
    restore = null
    if (was && back && back.isConnected) {
      try {
        back.focus({ preventScroll: true })
      } catch {
        /* ignore */
      }
    }

    if (was) for (const cb of ends.slice()) cb()
  }

  return {
    play,
    stop,
    get running() {
      return isRunning
    },
    onEnd(cb: () => void) {
      if (typeof cb === 'function') ends.push(cb)
    },
  }
}

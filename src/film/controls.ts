/**
 * The player chrome — the bar along the bottom while the film is running.
 *
 * The film plays on a screen out in the world, not in a takeover, so you are
 * still standing in the field watching it. That makes this a *video player's*
 * controls rather than a modal's: a chaptered scrubber you can click into, a
 * pause button, a running time, and a speed picker.
 *
 * WHAT IT IS NOT: an owner of anything. It reads `film.state` once a frame and
 * writes to the DOM only where a value actually changed (`sync()`), and it
 * pushes user intent back through the Film interface. It holds no clock and no
 * copy of the position — there is exactly one of those, in film.ts, and this
 * reflects it.
 *
 * ── THE SPEED PICKER, AND THE ONE THING THAT IS SUBTLE ABOUT IT ──────────
 *
 * It replaces a line of grey type that read HOLD SPACE FOR 2×. That line was
 * the only way to know the film had a speed control at all, it was addressed
 * to somebody with a keyboard, and it went out of its way to name a shortcut
 * instead of offering a control. Now there is a button per speed, lit on the
 * one you are at, which is what every video player on the web looks like.
 *
 * SPACE STILL SHUTTLES, and that is the subtle part: it is a MOMENTARY 2×, not
 * a toggle, so it has to put back whatever was chosen when you let go — not 1×.
 * `chosen` below is the picked speed and `state.rate` is what the clock is
 * actually running at; they are the same number except while the key is down.
 * Restoring to 1× was the first build and it silently cancelled the picker:
 * choose 3×, brush the space bar, and the film is at 1× with the 3× button
 * still lit, which is a control that lies about the thing it controls.
 *
 * The buttons reflect `state.rate`, so the shuttle lights the 2× button while
 * it is held and hands it back on release. What is on screen is always the
 * speed the film is running at.
 *
 * KEYS, and why they are the ones they are:
 *   Space (held)   2× while down. Not a toggle — a shuttle. Held keys repeat,
 *                  so the handler guards on its own flag rather than trusting
 *                  the first keydown to be the only one.
 *   k / click      pause. `k` because anyone who has used a video player in
 *                  the last fifteen years will try it.
 *   ← →            ±5s.   ↑ ↓ / j l   previous / next chapter, ±10s.
 *   Escape         stop the film and give the field back.
 *   t              wind forward to the TL;DR card. The button over the corner
 *                  of the screen is the real control; this is here because every
 *                  other one of these has a key and a viewer who found `k`
 *                  will try the obvious letter for the thing on screen.
 *
 * ── THE ONE CONTROL THAT IS NOT ON THE BAR ──────────────────────────────
 *
 * TLDR VERSION sits just above the top-right corner of the screen,
 * out in the world, and main.ts moves it every frame to stay there (see `place`
 * below).
 * It is an offer the machine is making rather than a transport control, which
 * is the whole reason it is not sitting next to Exit. Press it and the reel
 * winds forward to a card with the whole film on it — `film.rush()`, and the
 * note over RUSH_SECONDS in src/film/film.ts.
 *
 * It takes itself off screen once the card is up, because there is nothing
 * left for it to do: the way back into the film is the scrubber, which is
 * already there, already says where in the film you are, and is the thing a
 * viewer reaches for.
 *
 * Space is claimed at the window, in capture, because the world is still live
 * underneath — but only when focus is not on a button, since Space is how a
 * keyboard user presses a button and taking that away to add a shuttle would
 * be a bad trade. That guard is what lets the speed buttons be real buttons.
 */

import {
  CHAPTERS,
  DIGEST,
  RUNTIME,
  RATES,
  RATE_DEFAULT,
  ACTS,
  chapterAt,
  timecode,
  type Film,
} from './film'
import { clamp } from '../core/contract'

export interface FilmControls {
  /** the element the world should treat as "chrome" for hit-testing */
  readonly root: HTMLElement
  show(): void
  hide(): void
  /** reflect film.state in the DOM. Call once per world frame. */
  sync(): void
  /** the Exit button, and Escape */
  onSkip(cb: () => void): void
  /**
   * Where the TLDR VERSION button should sit, in CSS pixels from
   * the top-left of the viewport. The point is the TOP-RIGHT CORNER OF THE
   * SCREEN, projected through the camera by main.ts once a frame — the button
   * hangs above it and to its left, so its own bottom-right corner lands
   * there. Clamped in here rather than out there, because the clamp needs the
   * button's own size and this is the only module that has it.
   */
  place(x: number, y: number): void
  /** `d` — whether the acts reach off the screen. On unless you turn it off. */
  onDepth(cb: (on: boolean) => void): void
  dispose(): void
}

const SEEK_SMALL = 5
const SEEK_BIG = 10

function noopControls(): FilmControls {
  const root = document.createElement('div')
  return {
    root,
    show() {},
    hide() {},
    sync() {},
    onSkip() {},
    place() {},
    onDepth() {},
    dispose() {},
  }
}

export function createFilmControls(film: Film): FilmControls {
  const $root = document.getElementById('film')
  const $scrub = document.getElementById('film-scrub')
  const $play = document.getElementById('film-play')
  const $skip = document.getElementById('film-skip')
  const $time = document.getElementById('film-time')
  const $title = document.getElementById('film-chapter')
  const $speed = document.getElementById('film-speed')
  const $tip = document.getElementById('film-tip')
  const $caption = document.getElementById('film-caption')
  const $tldr = document.getElementById('film-tldr')

  if (
    !($root instanceof HTMLElement) ||
    !($scrub instanceof HTMLElement) ||
    !($play instanceof HTMLButtonElement) ||
    !($skip instanceof HTMLButtonElement) ||
    !($time instanceof HTMLElement) ||
    !($title instanceof HTMLElement) ||
    !($speed instanceof HTMLElement) ||
    !($tip instanceof HTMLElement) ||
    !($caption instanceof HTMLElement) ||
    !($tldr instanceof HTMLButtonElement)
  ) {
    // The film is not the reason anyone came; if its chrome is missing, the
    // rest of the site is still a site.
    console.warn('[film] controls markup missing — the film will play without them')
    return noopControls()
  }

  // Re-bound, because the narrowing above does not survive into the hoisted
  // function declarations below — same reason, and the same fix, as in film.ts.
  const bar: HTMLElement = $root
  const scrub: HTMLElement = $scrub
  const playBtn: HTMLButtonElement = $play
  const skipBtn: HTMLButtonElement = $skip
  const timeEl: HTMLElement = $time
  const titleEl: HTMLElement = $title
  const speedBox: HTMLElement = $speed
  const tip: HTMLElement = $tip
  const caption: HTMLElement = $caption
  const tldrBtn: HTMLButtonElement = $tldr

  const skips: Array<() => void> = []
  const depths: Array<(on: boolean) => void> = []

  /* The depth cues — the acts that reach off the screen into the field under
     it. They are on, and there is no button for them any more: a control in
     the transport bar reads as something the film needs you to operate, and
     nobody watching a film wants to be asked whether it should be in 3D. `d`
     stays, because comparing the flat cut against this one is a thing worth
     being able to do while you are looking at it. */
  let depthOn = true

  function toggleDepth(): void {
    depthOn = !depthOn
    for (const cb of depths.slice()) cb(depthOn)
  }

  /* ---------------- the speed picker ----------------
   * One button per entry in RATES, built here so film.ts stays the only place
   * that says what the speeds are.
   *
   * `chosen` is the speed the VIEWER picked; `film.state.rate` is what the
   * clock is running at. They differ only while Space is held — see the header.
   *
   * role="radio" rather than a pressed toggle, because that is what this is:
   * one of a set, exactly one on. A screen reader then announces it as "3×,
   * radio button, 2 of 4" instead of leaving somebody to work out that four
   * unrelated buttons are a group.
   */
  let chosen = RATE_DEFAULT
  const rateBtns: HTMLButtonElement[] = []

  /** the whole number, or one decimal — 1× and 0.5× rather than 1.0× and 0.5× */
  const rateLabel = (r: number) => `${Number.isInteger(r) ? r : r.toFixed(1)}×`

  for (const r of RATES) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'film-rate'
    b.dataset.rate = String(r)
    b.textContent = rateLabel(r)
    b.setAttribute('role', 'radio')
    b.setAttribute('aria-checked', r === chosen ? 'true' : 'false')
    b.setAttribute('aria-label', `Play at ${rateLabel(r)}`)
    /* Only the selected one is tabbable, which is the roving-tabindex rule for
       a radio group: Tab moves you INTO the group and past it, the arrow keys
       move you around inside it. Four stops on the way to the Exit button is
       what you get for free, and it is wrong. */
    b.tabIndex = r === chosen ? 0 : -1
    speedBox.appendChild(b)
    rateBtns.push(b)
  }

  function pickRate(r: number, focus = false): void {
    chosen = r
    film.setRate(r)
    // …and take the shuttle off the hook. Choosing a speed while the space bar
    // happens to be down otherwise leaves `spaceDown` true with no keyup owed
    // to it, and the next release snaps you back to a speed you had left.
    spaceDown = false
    if (focus) {
      const i = RATES.indexOf(r)
      try {
        rateBtns[i]?.focus({ preventScroll: true })
      } catch {
        /* focus is a nicety, never a failure */
      }
    }
  }

  const onSpeedClick = (e: Event) => {
    const b = (e.target as HTMLElement | null)?.closest?.('.film-rate')
    if (!(b instanceof HTMLButtonElement)) return
    e.preventDefault()
    const r = Number(b.dataset.rate)
    if (Number.isFinite(r)) pickRate(r)
    /* …and hand focus back to the scrubber, exactly as the pause button does
       and for exactly the same reason: a mouse click leaves focus on the
       button, Space on a focused button is a button press, so one click on a
       speed would quietly cost you the shuttle for the rest of the film — and
       worse than on pause, because the key would silently re-press the speed
       you are already at and look like it had done nothing.
       Pointer clicks only. `detail` is 0 when a keyboard activated it, and a
       keyboard user's focus is theirs to move. */
    if (e instanceof MouseEvent && e.detail > 0) {
      try {
        scrub.focus({ preventScroll: true })
      } catch {
        /* focus is a nicety, never a failure */
      }
    }
  }

  /* ← → inside the group move the selection, the way a radio group does. They
     are stopped here so they never reach the scrubber's own ±5s seek — a
     keyboard user on the speed buttons is not asking to scrub. */
  const onSpeedKey = (e: KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    e.stopPropagation()
    const i = RATES.indexOf(chosen)
    const next = RATES[(i + dir + RATES.length) % RATES.length]
    if (next !== undefined) pickRate(next, true)
  }

  speedBox.addEventListener('click', onSpeedClick)
  speedBox.addEventListener('keydown', onSpeedKey)

  /* ---------------- chapter segments ----------------
     One flex child per act, grown by its duration, so the segment widths are
     the act lengths and nothing has to be recomputed on resize. */

  const fills: HTMLElement[] = []
  const segs: HTMLElement[] = []
  const track = document.createElement('div')
  track.className = 'film-chaps'
  track.setAttribute('aria-hidden', 'true')

  for (const c of CHAPTERS) {
    const seg = document.createElement('div')
    seg.className = 'film-chap'
    seg.style.flexGrow = String(c.duration)
    const fill = document.createElement('i')
    seg.appendChild(fill)
    track.appendChild(seg)
    segs.push(seg)
    fills.push(fill)
  }

  const head = document.createElement('div')
  head.className = 'film-head'
  head.setAttribute('aria-hidden', 'true')

  scrub.prepend(track)
  scrub.appendChild(head)

  scrub.setAttribute('role', 'slider')
  scrub.setAttribute('tabindex', '0')
  scrub.setAttribute('aria-label', 'Seek through the film')
  scrub.setAttribute('aria-valuemin', '0')
  scrub.setAttribute('aria-valuemax', RUNTIME.toFixed(0))

  /* ---------------- seeking ---------------- */

  /** pointer x → seconds, from the track's box so the gaps don't skew it */
  function timeAtX(clientX: number): number {
    const r = track.getBoundingClientRect()
    if (r.width <= 0) return 0
    return clamp((clientX - r.left) / r.width, 0, 1) * RUNTIME
  }

  let dragging = false

  const onScrubDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    // preventDefault kills the drag-selects-text behaviour, and with it the
    // click-to-focus that a tabindex element would otherwise get — so take
    // focus explicitly. Space has to keep shuttling after you scrub.
    e.preventDefault()
    try {
      scrub.focus({ preventScroll: true })
    } catch {
      /* focus is a nicety, never a failure */
    }
    dragging = true
    scrub.setPointerCapture?.(e.pointerId)
    scrub.dataset.drag = 'true'
    film.seek(timeAtX(e.clientX))
  }

  const onScrubMove = (e: PointerEvent) => {
    if (dragging) {
      film.seek(timeAtX(e.clientX))
      showTip(e.clientX)
      return
    }
    // hover: name the chapter you are about to jump into, the way a video
    // player does. This is the only place the chapter titles earn their keep.
    if (e.pointerType === 'mouse') showTip(e.clientX)
  }

  const onScrubUp = (e: PointerEvent) => {
    if (!dragging) return
    dragging = false
    scrub.releasePointerCapture?.(e.pointerId)
    delete scrub.dataset.drag
    if (e.pointerType !== 'mouse') hideTip()
  }

  const onScrubLeave = () => {
    if (!dragging) hideTip()
  }

  function showTip(clientX: number): void {
    const t = timeAtX(clientX)
    const c = CHAPTERS[chapterAt(t)]
    if (!c) return
    const r = scrub.getBoundingClientRect()
    tip.hidden = false
    tip.textContent = `${c.title} · ${timecode(t)}`
    // clamp to the scrubber so the label never hangs off the viewport edge
    const x = clamp(clientX - r.left, 26, Math.max(26, r.width - 26))
    tip.style.left = `${x}px`
  }

  function hideTip(): void {
    tip.hidden = true
  }

  const onScrubKey = (e: KeyboardEvent) => {
    let handled = true
    switch (e.key) {
      case 'ArrowLeft':
        film.nudge(-SEEK_SMALL)
        break
      case 'ArrowRight':
        film.nudge(SEEK_SMALL)
        break
      case 'ArrowUp':
        film.toChapter(chapterAt(film.state.time) - 1)
        break
      case 'ArrowDown':
        film.toChapter(chapterAt(film.state.time) + 1)
        break
      case 'Home':
        film.seek(0)
        break
      case 'End':
        film.seek(RUNTIME)
        break
      default:
        handled = false
    }
    if (handled) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  scrub.addEventListener('pointerdown', onScrubDown)
  scrub.addEventListener('pointermove', onScrubMove)
  scrub.addEventListener('pointerup', onScrubUp)
  scrub.addEventListener('pointercancel', onScrubUp)
  scrub.addEventListener('pointerleave', onScrubLeave)
  scrub.addEventListener('keydown', onScrubKey)

  /* ---------------- buttons ---------------- */

  const onPlay = (e: Event) => {
    e.preventDefault()
    film.togglePaused()
    // A mouse click leaves focus on the button, and Space on a focused button
    // is a button press — so one click on pause would quietly cost you the 2×
    // shuttle for the rest of the film. Hand focus back to the scrubber, but
    // only for pointer clicks: `detail` is 0 when a keyboard activated it, and
    // a keyboard user's focus is theirs to move.
    if (e instanceof MouseEvent && e.detail > 0) {
      try {
        scrub.focus({ preventScroll: true })
      } catch {
        /* focus is a nicety, never a failure */
      }
    }
  }
  const onSkipClick = (e: Event) => {
    e.preventDefault()
    for (const cb of skips.slice()) cb()
  }

  /* TLDR VERSION. It hands focus back to the scrubber for exactly
     the reason pause and the speed picker do — a click leaves focus on the
     button, Space on a focused button presses it again, and the film would be
     winding forward every time somebody brushed the shuttle. */
  const onTldrClick = (e: Event) => {
    e.preventDefault()
    film.rush()
    if (e instanceof MouseEvent && e.detail > 0) {
      try {
        scrub.focus({ preventScroll: true })
      } catch {
        /* focus is a nicety, never a failure */
      }
    }
  }

  playBtn.addEventListener('click', onPlay)
  skipBtn.addEventListener('click', onSkipClick)
  tldrBtn.addEventListener('click', onTldrClick)

  /* ---------------- placing the button ----------------
   * It hangs over a point in the WORLD, so main.ts projects that point through
   * the camera every frame and hands the answer down here. Two things this has
   * to do that a static control does not:
   *
   *   Not write a style that has not changed. A projected point moves by a
   *   fraction of a pixel most frames and every write is a style recalc — the
   *   same guard, for the same reason, as the key badge in src/ui/interact.ts.
   *
   *   Keep itself on screen. The shot breathes and the viewport can be any
   *   shape, so the point can end up under the transport bar or off an edge.
   *   A LABEL would rather be hidden than mispositioned; this is a CONTROL,
   *   and a control you cannot reach is worse than one an inch from where it
   *   ought to be. So it clamps.
   *
   * The size it clamps against is cached: reading it back from the element is
   * a forced layout, and this runs sixty times a second.
   */
  /** the film-second the TLDR button steps back at: halfway through act 1 */
  const TLDR_DIM_AT = (CHAPTERS[0]?.duration ?? 0) * 0.5
  const TLDR_LIFT = 14
  const TLDR_EDGE = 12
  /** the strip along the bottom the transport owns, and this must stay out of */
  const TLDR_BAR = 96

  let btnW = 0
  let btnH = 0
  let lastX = Number.NaN
  let lastY = Number.NaN

  function measureTldr(): void {
    btnW = tldrBtn.offsetWidth
    btnH = tldrBtn.offsetHeight
  }

  const onResize = () => {
    if (!bar.hidden) measureTldr()
  }
  window.addEventListener('resize', onResize)

  /* ---------------- the keyboard ---------------- */

  let spaceDown = false

  const onKeyDown = (e: KeyboardEvent) => {
    if (!film.state.running) return
    const onControl = (e.target as HTMLElement | null)?.closest?.('button')

    if (e.key === ' ' || e.code === 'Space') {
      // leave Space alone when it is somebody's button-press
      if (onControl) return
      e.preventDefault()
      e.stopPropagation()
      if (spaceDown) return
      spaceDown = true
      film.setRate(2)
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      for (const cb of skips.slice()) cb()
      return
    }

    const k = e.key.toLowerCase()
    if (k === 'k') {
      e.preventDefault()
      e.stopPropagation()
      film.togglePaused()
    } else if (k === 'j') {
      e.preventDefault()
      e.stopPropagation()
      film.nudge(-SEEK_BIG)
    } else if (k === 'l') {
      e.preventDefault()
      e.stopPropagation()
      film.nudge(SEEK_BIG)
    } else if (k === 'd') {
      e.preventDefault()
      e.stopPropagation()
      toggleDepth()
    } else if (k === 't') {
      e.preventDefault()
      e.stopPropagation()
      film.rush()
    }
  }

  /* Back to the PICKED speed, not to 1×. See the header — restoring to 1× is
     what makes the shuttle quietly cancel the picker. */
  const releaseSpace = () => {
    if (!spaceDown) return
    spaceDown = false
    film.setRate(chosen)
  }

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.code === 'Space') releaseSpace()
  }

  // A key held while the tab loses focus never sends its keyup, and the film
  // would be stuck at 2× for the rest of its runtime.
  const onBlur = () => releaseSpace()

  window.addEventListener('keydown', onKeyDown, { capture: true })
  window.addEventListener('keyup', onKeyUp, { capture: true })
  window.addEventListener('blur', onBlur)
  document.addEventListener('visibilitychange', onBlur)

  /* ---------------- reflecting state ---------------- */

  let shownTime = -1
  let shownChapter = -1
  let shownDigest: boolean | null = null
  let shownTldr: boolean | null = null
  let shownDim: boolean | null = null
  let shownPaused: boolean | null = null
  let shownRate = -1
  let restore: HTMLElement | null = null

  function sync(): void {
    const s = film.state

    // the fills: only the current chapter is ever partial, so touch three
    // elements at most rather than all six
    const t = s.time
    if (Math.abs(t - shownTime) >= 0.05 || shownTime < 0) {
      shownTime = t
      for (let i = 0; i < CHAPTERS.length; i++) {
        const c = CHAPTERS[i]
        const fill = fills[i]
        if (!c || !fill) continue
        const k = clamp((t - c.start) / c.duration)
        const pct = `${(k * 100).toFixed(1)}%`
        if (fill.style.width !== pct) fill.style.width = pct
      }
      head.style.left = `${((t / RUNTIME) * 100).toFixed(2)}%`
      timeEl.textContent = `${timecode(t)} / ${timecode(RUNTIME)}`
      scrub.setAttribute('aria-valuenow', t.toFixed(0))
    }

    /* WHAT IS ON THE SCREEN, which is not always the act the clock is inside:
       once the TL;DR card is up the film is parked at its end and the card is
       what is being shown, so that is what gets named and announced. Keyed off
       the pair, because moving between the last act and the card does not
       change the chapter index. */
    if (s.chapter !== shownChapter || s.digest !== shownDigest) {
      shownChapter = s.chapter
      shownDigest = s.digest
      const c = CHAPTERS[s.chapter]
      const title = s.digest ? DIGEST.chapter : c ? c.title : ''
      titleEl.textContent = title
      /* THE CAPTION SAYS NOTHING WHILE THE REEL IS WINDING. It is the film's
         aria-live region, and the wind crosses all twelve acts in about two
         seconds — which is twelve announcements queued one behind another,
         none of them the thing the viewer just asked for. It speaks again when
         the reel stops, which is the card. */
      if (!s.rushing) {
        caption.textContent = s.digest ? DIGEST.caption : (ACTS[s.chapter]?.caption ?? '')
      }
      scrub.setAttribute('aria-valuetext', title ? `${timecode(t)} — ${title}` : timecode(t))
      segs.forEach((seg, i) => {
        seg.dataset.on = i === s.chapter ? 'true' : 'false'
      })
    }

    /* …and the button goes with it. Once the card is up there is nothing left
       for it to skip; scrubbing back into the film brings it back. */
    if (s.digest !== shownTldr) {
      shownTldr = s.digest
      tldrBtn.hidden = s.digest
      if (s.digest) {
        tldrBtn.dataset.on = 'false'
        lastX = Number.NaN
        lastY = Number.NaN
      }
    }

    /* IT IS BRIGHT FOR HALF AN ACT AND THEN IT STEPS BACK. The button has to
       be seen once — it is the only way to the card — and after that it is a
       lit control in the corner of a screen you are meant to be watching. So
       it holds full for the first half of the opening act and then dims to
       the level the CSS sets, where it is still plainly there and no longer
       asking for anything. Hover or focus brings it back (src/film/film.css).
       Keyed off the clock rather than off time-since-shown, so scrubbing back
       to the start un-dims it and a wind never sees it flicker. */
    const dim = s.time >= TLDR_DIM_AT
    if (dim !== shownDim) {
      shownDim = dim
      tldrBtn.dataset.dim = dim ? 'true' : 'false'
    }

    if (s.paused !== shownPaused) {
      shownPaused = s.paused
      playBtn.dataset.paused = s.paused ? 'true' : 'false'
      playBtn.setAttribute('aria-label', s.paused ? 'Play' : 'Pause')
      bar.dataset.paused = s.paused ? 'true' : 'false'
    }

    /* The buttons follow `state.rate`, not `chosen` — so the 2× button lights
       while Space is held and hands it back on release, and what is lit is
       always the speed the film is actually running at. `tabIndex` follows
       `chosen` instead: the shuttle is momentary and must not move the tab
       stop out from under a keyboard user mid-press. */
    if (s.rate !== shownRate) {
      shownRate = s.rate
      rateBtns.forEach((b, i) => {
        const r = RATES[i]
        const on = r === s.rate
        b.dataset.on = on ? 'true' : 'false'
        b.setAttribute('aria-checked', on ? 'true' : 'false')
        b.tabIndex = r === chosen ? 0 : -1
      })
    }
  }

  return {
    root: bar,

    show() {
      restore = document.activeElement instanceof HTMLElement ? document.activeElement : null
      bar.hidden = false
      /* the button comes back UNPLACED — `data-on` is false and stays false
         until main.ts has projected the screen's corner through the camera
         at least once, or it would show for one frame in the top-left corner */
      tldrBtn.hidden = false
      tldrBtn.dataset.on = 'false'
      lastX = Number.NaN
      lastY = Number.NaN
      measureTldr()
      shownTime = -1
      shownChapter = -1
      shownDigest = null
      shownTldr = null
      shownPaused = null
      shownRate = -1
      sync()
      // focus the scrubber rather than a button, so Space is the shuttle
      try {
        scrub.focus({ preventScroll: true })
      } catch {
        /* focus is a nicety, never a failure */
      }
    },

    hide() {
      releaseSpace()
      /* …and the speed goes back to 1× with the film. A rate is a thing you set
         for the viewing you are in; leaving the film at 2× and coming back to
         the projector later to a film already running at double speed is a
         setting nobody remembers making. */
      chosen = RATE_DEFAULT
      film.setRate(RATE_DEFAULT)
      hideTip()
      dragging = false
      delete scrub.dataset.drag
      bar.hidden = true
      tldrBtn.hidden = true
      tldrBtn.dataset.on = 'false'
      caption.textContent = ''
      const back = restore
      restore = null
      if (back && back.isConnected) {
        try {
          back.focus({ preventScroll: true })
        } catch {
          /* ignore */
        }
      }
    },

    sync,

    place(x: number, y: number) {
      if (tldrBtn.hidden || !Number.isFinite(x) || !Number.isFinite(y)) return
      if (btnW <= 0 || btnH <= 0) measureTldr()

      const vw = window.innerWidth
      const vh = window.innerHeight
      /* `x` is the RIGHT-HAND edge, not the middle. The button is right-aligned
         on the screen's corner rather than centred on it, because half a button
         hanging out past the frame of the picture is not "at the top right of
         the screen", it is next to it. */
      const cx = clamp(x, btnW + TLDR_EDGE, Math.max(btnW + TLDR_EDGE, vw - TLDR_EDGE))
      // `y` is the point it hangs OVER, so the button's own height and the lift
      // come off it before the bottom of the box lands anywhere
      const cy = clamp(
        y - TLDR_LIFT,
        btnH + TLDR_EDGE,
        Math.max(btnH + TLDR_EDGE, vh - TLDR_BAR),
      )

      if (cx !== lastX || cy !== lastY) {
        lastX = cx
        lastY = cy
        tldrBtn.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0) translate(-100%, -100%)`
      }
      if (tldrBtn.dataset.on !== 'true') tldrBtn.dataset.on = 'true'
    },

    onSkip(cb: () => void) {
      if (typeof cb === 'function') skips.push(cb)
    },

    onDepth(cb: (on: boolean) => void) {
      if (typeof cb === 'function') {
        depths.push(cb)
        cb(depthOn)
      }
    },

    dispose() {
      scrub.removeEventListener('pointerdown', onScrubDown)
      scrub.removeEventListener('pointermove', onScrubMove)
      scrub.removeEventListener('pointerup', onScrubUp)
      scrub.removeEventListener('pointercancel', onScrubUp)
      scrub.removeEventListener('pointerleave', onScrubLeave)
      scrub.removeEventListener('keydown', onScrubKey)
      playBtn.removeEventListener('click', onPlay)
      skipBtn.removeEventListener('click', onSkipClick)
      tldrBtn.removeEventListener('click', onTldrClick)
      window.removeEventListener('resize', onResize)
      speedBox.removeEventListener('click', onSpeedClick)
      speedBox.removeEventListener('keydown', onSpeedKey)
      window.removeEventListener('keydown', onKeyDown, { capture: true })
      window.removeEventListener('keyup', onKeyUp, { capture: true })
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onBlur)
    },
  }
}

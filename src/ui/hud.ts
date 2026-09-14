/// <reference types="vite/client" />
/**
 * The HUD — the only chrome that is on screen while you are moving.
 *
 * Three things and no more: a compass that points at the projector and says
 * so, a prompt line that tells you what to do about it, and a clock in the
 * top-right corner saying what time it is where Elliot is — the field runs on
 * his sky (src/core/sun.ts), and the clock is what makes that legible rather
 * than arbitrary. It is not a control and nothing can be done to it.
 *
 * It was three. The third was a switch for the time of day, bottom right, and
 * it went when the field started reading the time off the visitor's own sky
 * (src/core/sun.ts): a control whose only job is to contradict the clock is
 * a setting, and this site has none. The switch is still built here — but
 * only on the dev server (`import.meta.env.DEV`), because whoever is working
 * on the field needs to see both looks without waiting for sunset. In the
 * production bundle the branch is dead code and the button does not exist:
 * not hidden, not disabled, absent. verify checks that it is.
 *
 * It was four before that. The fourth was a picture of the four arrow keys, tapping
 * themselves in the bottom-right corner as the site's only tutorial, and it
 * came out when clicking the ground became a way to walk: the keyboard is no
 * longer the only route across the field, and a permanent diagram of one in
 * the corner was furniture nobody was reading twice. If a control ever needs
 * explaining again, #prompt is where it gets explained, in words.
 *
 * There is no menu and no Résumé button. There used to be both, and they were
 * the same mistake twice: a field with one thing in it does not need a way to
 * navigate to the thing, and a résumé button next to a film telling the same
 * story is an invitation to skip the only thing here. There is no HTML résumé
 * to link to any more either — index.html holds a name-and-contact card for
 * anyone the world cannot serve, and nothing in here points at it.
 */
import './ui.css'
import { clamp, ease, reducedMotion } from '../core/contract'
import type { TimeOfDay } from '../world/field'

export interface Hud {
  setPrompt(text: string | null): void
  /**
   * @param angle screen-space bearing of the projector in radians —
   *   0 points at the top of the screen, positive turns clockwise. The
   *   marker rides along the strip by this: dead ahead is the middle, a
   *   right angle is the end of the strip, and anything further round than
   *   that is behind you and pins to the end with its point turned over.
   *   `null` hides the marker.
   * @param distance world units to the projector. The marker fades out as
   *   you close in; it is a way-finder, not a permanent fixture.
   */
  setCompass(angle: number | null, distance: number): void
  /**
   * Rename what the needle is pointing at. The compass has always named its
   * destination rather than just indicating a direction — that is the whole
   * reason it earns its place — so when the destination changes, the word has
   * to change with it.
   */
  setCompassLabel(text: string): void
  /**
   * The second marker on the same strip, which names Elliot. Same contract
   * as `setCompass`: a screen-space bearing, or `null` to hide, and a
   * distance it fades out over as you close in.
   */
  setCompassAside(angle: number | null, distance: number): void
  /** tell the chrome what time it is (and, on the dev server, repoint the switch) */
  setTimeOfDay(mode: TimeOfDay): void
  /** the wall clock where Elliot is, already formatted ("11:16 PM EDT") */
  setClock(text: string): void
  /** dev server only: the time-of-day switch was thrown; `mode` is the one asked for */
  onDayNight(cb: (mode: TimeOfDay) => void): void
  show(): void
  hide(): void
}

/** distance at which the compass has fully faded out / is at full strength */
const COMPASS_NEAR = 12
const COMPASS_FAR = 36

/** prompt cross-fade, ms — half of the CSS transition, so the swap reads as one move */
const PROMPT_SWAP_MS = 170
const HUD_FADE_MS = 220

function noopHud(): Hud {
  return {
    setPrompt() {},
    setCompass() {},
    setCompassLabel() {},
    setCompassAside() {},
    setTimeOfDay() {},
    setClock() {},
    onDayNight() {},
    show() {},
    hide() {},
  }
}

/** the dev-only time-of-day switch, in the corner the markup no longer has */
function buildDaySwitch(hud: HTMLElement): HTMLButtonElement {
  const corner = document.createElement('div')
  corner.className = 'hud-corner'
  const btn = document.createElement('button')
  btn.id = 'day-btn'
  btn.type = 'button'
  btn.className = 'hud-btn'
  corner.appendChild(btn)
  hud.prepend(corner)
  return btn
}

/** the clock, top right: the time, then whose it is */
function buildClock(hud: HTMLElement): HTMLElement {
  const clock = document.createElement('p')
  clock.id = 'clock'
  clock.setAttribute('aria-label', 'The time where Elliot is')
  const time = document.createElement('time')
  const whose = document.createElement('span')
  whose.textContent = 'Elliot’s time'
  clock.append(time, whose)
  hud.append(clock)
  return time
}

export function createHud(): Hud {
  const hud = document.getElementById('hud')
  if (!hud) return noopHud()
  const clockTime = buildClock(hud)

  const dayBtn = import.meta.env.DEV ? buildDaySwitch(hud) : null
  const compass = document.getElementById('compass')
  const compassMain = compass?.querySelector<HTMLElement>('[data-mark="projector"]') ?? null
  const compassName = compassMain?.querySelector<HTMLElement>('em') ?? null
  const compassAside = compass?.querySelector<HTMLElement>('[data-mark="elliot"]') ?? null
  const prompt = document.getElementById('prompt')

  // The markup ships `aria-hidden` on #world for the pre-boot state. The HUD
  // existing means the world is live and everything in it is real.
  document.getElementById('world')?.removeAttribute('aria-hidden')

  compass?.setAttribute('aria-hidden', 'true')

  if (prompt) {
    prompt.setAttribute('role', 'status')
    prompt.setAttribute('aria-live', 'polite')
    prompt.setAttribute('aria-atomic', 'true')
    prompt.dataset.on = 'false'
  }

  const dayCbs: Array<(mode: TimeOfDay) => void> = []

  /* ---------------- time of day ---------------- */

  // The button is an action, not a state: it always names the time you are
  // about to be in. Which means the ONLY thing tracked here is what it is
  // currently offering, and the world is told about it rather than asked.
  let offering: TimeOfDay = 'day'

  const setTimeOfDay = (mode: TimeOfDay) => {
    offering = mode === 'day' ? 'night' : 'day'
    document.documentElement.classList.toggle('is-day', mode === 'day')
    if (!dayBtn) return
    dayBtn.textContent = offering === 'day' ? 'Daytime' : 'Night'
    dayBtn.setAttribute(
      'aria-label',
      offering === 'day' ? 'Switch to daytime' : 'Switch to night',
    )
  }

  dayBtn?.addEventListener('click', () => {
    for (const cb of dayCbs.slice()) cb(offering)
  })

  const setClock = (text: string) => {
    if (clockTime.textContent !== text) clockTime.textContent = text
  }

  /* ---------------- prompt ---------------- */

  let promptText: string | null = null
  let promptTimer = 0

  const setPrompt = (text: string | null) => {
    if (!prompt) return
    const next = text && text.trim() ? text : null
    if (next === promptText) return

    const wasShowing = promptText !== null
    promptText = next
    window.clearTimeout(promptTimer)

    if (next === null) {
      prompt.dataset.on = 'false'
      // clear the text only after the fade, so it never blinks out
      promptTimer = window.setTimeout(
        () => {
          if (promptText === null) prompt.textContent = ''
        },
        reducedMotion() ? 0 : PROMPT_SWAP_MS + 60,
      )
      return
    }

    if (!wasShowing || reducedMotion()) {
      prompt.textContent = next
      prompt.dataset.on = 'true'
      return
    }

    // one line replacing another: out, then in — never a mid-air swap
    prompt.dataset.on = 'false'
    promptTimer = window.setTimeout(() => {
      if (promptText === null) return
      prompt.textContent = promptText
      prompt.dataset.on = 'true'
    }, PROMPT_SWAP_MS)
  }

  /* ---------------- compass ---------------- */

  // One strip, two markers. Each marker's place on the strip is its bearing,
  // mapped so that dead ahead is the centre and a right angle either way is
  // the end; past a right angle the thing is behind you, and the marker pins
  // to the end with its point turned over rather than swinging back through
  // the middle. The strip itself shows whenever any marker does.
  //
  // Called every frame — write to the DOM only when something actually moved.
  const readHalf = () => {
    const v = compass ? parseFloat(getComputedStyle(compass).getPropertyValue('--compass-half')) : 0
    return Number.isFinite(v) && v > 0 ? v : 120
  }
  let half = readHalf()
  window.addEventListener('resize', () => { half = readHalf() })

  /** the two markers must never sit on top of each other: this is the least
   *  gap between their centres, in px, before they are nudged apart. Each
   *  name sits in a pill, so the gap is half of each pill plus a little air,
   *  measured off the DOM rather than guessed — it changes with the phone
   *  breakpoint and with the font that actually loaded. */
  const measureGap = () => {
    const w = (el: HTMLElement | null) => el?.querySelector<HTMLElement>('em')?.offsetWidth ?? 0
    const sum = w(compassMain) + w(compassAside)
    return sum > 0 ? sum / 2 + 8 : Math.min(74, half * 1.2)
  }
  let gapPx = measureGap()
  window.addEventListener('resize', () => { gapPx = measureGap() })
  if (document.fonts?.ready) document.fonts.ready.then(() => { gapPx = measureGap() })
  const markGap = () => gapPx

  type Mark = { el: HTMLElement | null; x: number; behind: boolean; opacity: number; lastX: number; lastO: number; lastBehind: boolean }
  const mark = (el: HTMLElement | null): Mark => ({ el, x: 0, behind: false, opacity: 0, lastX: Number.NaN, lastO: Number.NaN, lastBehind: false })
  const marks = { main: mark(compassMain), aside: mark(compassAside) }
  let lastStrip = Number.NaN

  const place = (m: Mark, angle: number | null, distance: number) => {
    if (angle === null || !Number.isFinite(angle)) {
      m.opacity = 0
      return
    }
    const d = Number.isFinite(distance) ? distance : COMPASS_FAR
    m.opacity = ease(clamp((d - COMPASS_NEAR) / (COMPASS_FAR - COMPASS_NEAR)))
    // wrap to (-π, π] so a bearing of 350° reads as −10°, not as "far right"
    const a = Math.atan2(Math.sin(angle), Math.cos(angle))
    m.behind = Math.abs(a) > Math.PI / 2
    m.x = clamp(a / (Math.PI / 2), -1, 1) * half
  }

  const layout = () => {
    const { main, aside } = marks
    // two live markers closer than the gap: Elliot's steps aside. The
    // projector's marker never moves off the truth — it is the thing the
    // field is for, and when it is dead ahead it sits on the tick.
    const mx = main.x
    let ax = aside.x
    const gap = markGap()
    if (main.opacity > 0.02 && aside.opacity > 0.02 && Math.abs(mx - ax) < gap) {
      const dir = ax >= mx ? 1 : -1
      // stepping aside never steps off the strip: he goes as far as the end
      // on his own side, and only crosses to the other side of the projector
      // when that would still leave the two names on top of each other
      ax = clamp(mx + dir * gap, -half, half)
      if (Math.abs(ax - mx) < gap * 0.6) ax = mx - dir * gap
    }
    for (const [m, x] of [[main, mx], [aside, ax]] as const) {
      if (!m.el) continue
      const px = Math.round(x * 2) / 2
      if (px !== m.lastX) {
        m.el.style.setProperty('--x', `${px}px`)
        m.lastX = px
      }
      if (m.behind !== m.lastBehind) {
        m.el.dataset.behind = m.behind ? 'true' : 'false'
        m.lastBehind = m.behind
      }
      const o = Math.round(m.opacity * 100) / 100
      if (o !== m.lastO) {
        m.el.style.opacity = String(o)
        m.el.dataset.on = o > 0.02 ? 'true' : 'false'
        m.lastO = o
      }
    }
    const strip = Math.max(main.opacity, aside.opacity)
    const so = Math.round(strip * 100) / 100
    if (compass && so !== lastStrip) {
      compass.style.opacity = String(so)
      compass.dataset.on = so > 0.02 ? 'true' : 'false'
      lastStrip = so
    }
  }

  const setCompass = (angle: number | null, distance: number) => {
    place(marks.main, angle, distance)
    layout()
  }
  const setCompassAside = (angle: number | null, distance: number) => {
    place(marks.aside, angle, distance)
    layout()
  }

  setCompass(null, 0)
  setCompassAside(null, 0)

  /* ---------------- visibility ---------------- */

  let hudTimer = 0
  let shown = true

  const show = () => {
    if (shown) return
    shown = true
    window.clearTimeout(hudTimer)
    hud.hidden = false
    void hud.offsetWidth
    hud.classList.remove('is-off')
  }

  const hide = () => {
    if (!shown) return
    shown = false
    hud.classList.add('is-off')
    window.clearTimeout(hudTimer)
    hudTimer = window.setTimeout(
      () => {
        if (!shown) hud.hidden = true
      },
      reducedMotion() ? 0 : HUD_FADE_MS,
    )
  }

  return {
    setPrompt,
    setCompass,
    setCompassLabel(text: string) {
      if (compassName && compassName.textContent !== text) compassName.textContent = text
    },
    setCompassAside,
    setTimeOfDay,
    setClock,
    onDayNight(cb: (mode: TimeOfDay) => void) {
      dayCbs.push(cb)
    },
    show,
    hide,
  }
}

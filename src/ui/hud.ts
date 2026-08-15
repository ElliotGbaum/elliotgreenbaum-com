/// <reference types="vite/client" />
/**
 * The HUD — the only chrome that is on screen while you are moving.
 *
 * Three things and no more: a compass that points at the projector and says so,
 * a prompt line that tells you what to do about it, and a switch for the time
 * of day.
 *
 * It was four. The fourth was a picture of the four arrow keys, tapping
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
   *   0 points at the top of the screen, positive turns clockwise.
   *   `null` hides the needle.
   * @param distance world units to the projector. The compass fades out as
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
  /** repoint the time-of-day switch at whatever it will do next */
  setTimeOfDay(mode: TimeOfDay): void
  /** the time-of-day switch was thrown; `mode` is the one being asked for */
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
    setTimeOfDay() {},
    onDayNight() {},
    show() {},
    hide() {},
  }
}

export function createHud(): Hud {
  const hud = document.getElementById('hud')
  if (!hud) return noopHud()

  const dayBtn = document.getElementById('day-btn')
  const compass = document.getElementById('compass')
  const needle = compass?.querySelector<HTMLElement>('span') ?? null
  const compassName = compass?.querySelector<HTMLElement>('em') ?? null
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

  // called every frame — write to the DOM only when something actually moved
  let lastDeg = Number.NaN
  let lastOpacity = Number.NaN

  const setCompass = (angle: number | null, distance: number) => {
    if (!compass) return

    let opacity = 0
    if (angle !== null && Number.isFinite(angle)) {
      const d = Number.isFinite(distance) ? distance : COMPASS_FAR
      opacity = ease(clamp((d - COMPASS_NEAR) / (COMPASS_FAR - COMPASS_NEAR)))

      if (needle) {
        const deg = Math.round((angle * 180) / Math.PI / 0.5) * 0.5
        if (deg !== lastDeg) {
          needle.style.transform = `rotate(${deg}deg)`
          lastDeg = deg
        }
      }
    }

    const o = Math.round(opacity * 100) / 100
    if (o !== lastOpacity) {
      compass.style.opacity = String(o)
      compass.dataset.on = o > 0.02 ? 'true' : 'false'
      lastOpacity = o
    }
  }

  setCompass(null, 0)

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
    setTimeOfDay,
    onDayNight(cb: (mode: TimeOfDay) => void) {
      dayCbs.push(cb)
    },
    show,
    hide,
  }
}

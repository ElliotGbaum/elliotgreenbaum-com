/// <reference types="vite/client" />
/**
 * The HUD — the only chrome that is on screen while you are moving.
 *
 * Three things and no more: a compass that points at the projector so nobody
 * gets lost, a prompt line that appears when the world has something to say,
 * and two controls. The Résumé control is the important one: a recruiter with
 * eleven tabs open should never have to learn how to move.
 */
import './ui.css'
import { clamp, ease } from '../core/contract'
import { reducedMotion } from './panel'

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
  onResume(cb: () => void): void
  onPlaces(cb: () => void): void
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
    onResume() {},
    onPlaces() {},
    show() {},
    hide() {},
  }
}

export function createHud(): Hud {
  const hud = document.getElementById('hud')
  if (!hud) return noopHud()

  const resumeBtn = document.getElementById('resume-btn')
  const placesBtn = document.getElementById('places-btn')
  const compass = document.getElementById('compass')
  const needle = compass?.querySelector<HTMLElement>('span') ?? null
  const prompt = document.getElementById('prompt')

  // The markup ships `aria-hidden` on #world for the pre-boot state. The HUD
  // existing means the world is live and everything in it is real.
  document.getElementById('world')?.removeAttribute('aria-hidden')

  resumeBtn?.setAttribute('aria-haspopup', 'dialog')
  placesBtn?.setAttribute('aria-haspopup', 'dialog')
  placesBtn?.setAttribute('aria-expanded', 'false')
  compass?.setAttribute('aria-hidden', 'true')

  if (prompt) {
    prompt.setAttribute('role', 'status')
    prompt.setAttribute('aria-live', 'polite')
    prompt.setAttribute('aria-atomic', 'true')
    prompt.dataset.on = 'false'
  }

  const resumeCbs: Array<() => void> = []
  const placesCbs: Array<() => void> = []
  resumeBtn?.addEventListener('click', () => {
    for (const cb of resumeCbs.slice()) cb()
  })
  placesBtn?.addEventListener('click', () => {
    for (const cb of placesCbs.slice()) cb()
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
    onResume(cb: () => void) {
      resumeCbs.push(cb)
    },
    onPlaces(cb: () => void) {
      placesCbs.push(cb)
    },
    show,
    hide,
  }
}

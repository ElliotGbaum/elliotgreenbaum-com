/**
 * The interaction badge — "Press E to turn on", hanging in the air at the
 * switch you would press.
 *
 * Every game has this and they all build it the same way, because the same way
 * is right: a key glyph and two words, pinned in screen space to the *part of
 * the object your hand goes to* rather than parked at the bottom of the frame,
 * arriving when you are close enough to reach it and leaving when you are not.
 * Anchoring is the whole trick — a line at the bottom of the screen tells you
 * that something is interactive, and a label floating at the switch tells you
 * WHICH THING, which is the question you actually have when you are standing
 * in front of a machine.
 *
 * IT IS DELIBERATELY THE QUIETEST THING ON SCREEN. 0.63rem mono, ink-3, no
 * panel behind it — the only piece carrying any weight at all is the keycap,
 * because the keycap is the information. It breathes on a three-and-a-half
 * second cycle, which is slow enough to find peripherally and too slow to
 * nag. If you are tempted to make it bigger, the thing to make bigger is the
 * object, not the label.
 *
 * WHY IT IS NOT IN hud.ts: everything in the HUD is fixed to an edge of the
 * viewport and written to when its value changes. This is the one piece that
 * lives at a moving point in the world and is repositioned every frame off the
 * camera. It shares the #hud layer — so it fades with the rest of the chrome
 * when the film takes over, for free — and nothing else.
 *
 * KEYBOARDS ONLY, AND THAT IS NOT THE SAME AS "DESKTOP ONLY" ANY MORE. A phone
 * has no E to press, so the CSS takes the badge off screen at `(hover: none)`
 * — but the field itself now answers a finger: tapping the ground walks the
 * figure there and tapping an object uses it, both resolved by a raycast in
 * main.ts. So the badge going away costs a touch visitor nothing except the
 * name of a key they do not have. It is `aria-hidden` because it is a picture
 * of a keyboard rather than information; the readable version of this
 * instruction is #prompt, which is live text and says the same thing in words.
 */

import * as THREE from 'three'
import { reducedMotion } from '../core/contract'

/** how long the cap stays down after the key is actually hit, ms */
const HIT_MS = 190

export interface InteractPrompt {
  /**
   * Once a frame.
   *
   * @param point world position the badge hangs over — the switch, the handle,
   *   the thing you reach for. Not the object's centre and never its anchor on
   *   the ground: both put the label somewhere your hand does not go.
   * @param verb completes "Press E to …" — "turn on", "play it again". Two or
   *   three words, lower case, no full stop.
   *
   * `null`/empty for either takes it off screen.
   */
  update(camera: THREE.Camera, point: THREE.Vector3 | null, verb?: string): void
  /** the key was pressed — knock the cap down, so the badge answers */
  hit(): void
  dispose(): void
}

function noopPrompt(): InteractPrompt {
  return { update() {}, hit() {}, dispose() {} }
}

/**
 * Keyboards only, and asked live rather than at boot so a tablet that gains a
 * keyboard gains the badge. The CSS hides it at the same breakpoint — this is
 * here so a phone is not also paying for a projection and a style write sixty
 * times a second to position something it will never draw.
 */
const TOUCH =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(hover: none)')
    : null

export function createInteractPrompt(): InteractPrompt {
  const el = document.getElementById('interact')
  const verbEl = el?.querySelector<HTMLElement>('.interact__verb') ?? null
  if (!el || !verbEl) return noopPrompt()

  let on = false
  let shownVerb = ''
  // the last position written to the DOM — a projected point moves by a
  // fraction of a pixel most frames, and a style write that changes nothing
  // still costs a style recalculation
  let lastX = Number.NaN
  let lastY = Number.NaN
  let hitTimer = 0

  const hide = () => {
    if (!on) return
    on = false
    el.dataset.on = 'false'
  }

  /** scratch, so a per-frame projection allocates nothing */
  const p = new THREE.Vector3()

  return {
    update(camera: THREE.Camera, point: THREE.Vector3 | null, verb = '') {
      if (!point || !verb || TOUCH?.matches) return hide()

      p.copy(point).project(camera)

      // Behind the camera (project puts those past z=1, mirrored), or far
      // enough outside the frame that the badge would be jammed against an
      // edge pointing at nothing. Either way it has stopped being a label
      // attached to an object, which is the only thing it is for.
      if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) return hide()

      const x = Math.round(((p.x + 1) / 2) * window.innerWidth)
      const y = Math.round(((1 - p.y) / 2) * window.innerHeight)
      if (x !== lastX || y !== lastY) {
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`
        lastX = x
        lastY = y
      }

      if (verb !== shownVerb) {
        verbEl.textContent = verb
        shownVerb = verb
      }

      if (!on) {
        on = true
        el.dataset.on = 'true'
      }
    },

    hit() {
      if (!on) return
      el.dataset.hit = 'true'
      window.clearTimeout(hitTimer)
      hitTimer = window.setTimeout(
        () => {
          el.dataset.hit = 'false'
        },
        reducedMotion() ? 1 : HIT_MS,
      )
    },

    dispose() {
      window.clearTimeout(hitTimer)
      el.dataset.hit = 'false'
      hide()
    },
  }
}

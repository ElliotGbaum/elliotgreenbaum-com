/**
 * Camera rig — a lagging follow cam with no user rotation.
 *
 * Deliberately not an orbit control. In a dark world with few landmarks, a
 * free camera is a reliable way to make people lost and slightly nauseous.
 * The trade is that we owe them a good default angle, so this one sits high
 * enough to read the field and leads slightly in the direction of travel.
 */

import * as THREE from 'three'
import { ease, clamp } from '../core/contract'

// Tuned by eye against shots/. The first pass sat at (0,17,21) looking at the
// player's feet, which pitched the camera ~39° down: no sky, no horizon, and
// the projector beacon — the entire navigation model — was off the top of the
// frame. Lower and flatter, looking at a point above the light, so the field
// and its landmarks are what you actually see.
const BASE_OFFSET = new THREE.Vector3(0, 8.5, 26)
/** look at a point above the light rather than at it, to lift the horizon */
const BASE_LOOK_LIFT = 4.2
const LAG = 3.1 // higher = tighter follow

export interface Rig {
  camera: THREE.PerspectiveCamera
  update(dt: number, focus: THREE.Vector3, velocity: THREE.Vector3): void
  /** glide to a fixed vantage — used for the projector push-in */
  cutTo(position: THREE.Vector3, lookAt: THREE.Vector3, seconds: number): Promise<void>
  /** hand control back to the follow cam */
  release(seconds?: number): void
  resize(w: number, h: number): void
}

export function createRig(): Rig {
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400)
  camera.position.set(0, 17, 67)

  const desired = new THREE.Vector3()
  const lookTarget = new THREE.Vector3()
  const lead = new THREE.Vector3()
  const offset = BASE_OFFSET.clone()
  let lookLift = BASE_LOOK_LIFT

  // scripted-move state
  let scripted = false
  let sFrom = new THREE.Vector3()
  let sTo = new THREE.Vector3()
  let sLookFrom = new THREE.Vector3()
  let sLookTo = new THREE.Vector3()
  let sT = 0
  let sDur = 1
  let sResolve: (() => void) | null = null
  let releasing = 0

  function update(dt: number, focus: THREE.Vector3, velocity: THREE.Vector3) {
    if (scripted) {
      sT = Math.min(sDur, sT + dt)
      const k = ease(sDur <= 0 ? 1 : sT / sDur)
      camera.position.lerpVectors(sFrom, sTo, k)
      lookTarget.lerpVectors(sLookFrom, sLookTo, k)
      camera.lookAt(lookTarget)
      if (sT >= sDur && sResolve) {
        const r = sResolve
        sResolve = null
        r()
      }
      return
    }

    // lead the camera slightly into the direction of travel — small, but it's
    // most of the difference between "following" and "chasing"
    lead.copy(velocity).multiplyScalar(0.34)
    lead.y = 0

    desired.copy(focus).add(offset).add(lead)

    const k = 1 - Math.exp(-LAG * dt)
    // when returning from a scripted move, ease back in rather than snapping
    const blend = releasing > 0 ? Math.min(1, k * (1 - releasing)) : k
    if (releasing > 0) releasing = Math.max(0, releasing - dt * 0.9)

    camera.position.lerp(desired, blend)

    lead.copy(focus).addScaledVector(velocity, 0.22)
    lead.y += lookLift
    lookTarget.lerp(lead, Math.min(1, k * 1.3))
    camera.lookAt(lookTarget)
  }

  return {
    camera,
    update,
    cutTo(position, lookAt, seconds) {
      scripted = true
      releasing = 0
      sFrom = camera.position.clone()
      sTo = position.clone()
      sLookFrom = lookTarget.clone()
      sLookTo = lookAt.clone()
      sT = 0
      sDur = Math.max(0.001, seconds)
      return new Promise<void>((res) => {
        sResolve = res
      })
    },
    release(seconds = 1.1) {
      scripted = false
      sResolve = null
      releasing = clamp(seconds, 0, 3)
    },
    resize(w: number, h: number) {
      const aspect = w / h
      camera.aspect = aspect
      // On a phone the field of view has to work harder — pull back and up so
      // the player can still see where they're going in portrait.
      const portrait = clamp((1.0 - aspect) / 0.55)

      // Portrait is fought two ways, and only one of them is fov. Widening the
      // vertical fov buys very little horizontally on a tall viewport but adds
      // a great deal of near foreground, so most of the work is done by pulling
      // the camera back instead.
      camera.fov = 50 + portrait * 8
      offset.set(0, BASE_OFFSET.y + portrait * 2, BASE_OFFSET.z + portrait * 16)

      // …and by aiming higher, which pushes the light down the frame. The first
      // portrait pass left the bottom 40% as empty ground; raising the look
      // target fills that with world instead.
      lookLift = BASE_LOOK_LIFT + portrait * 5
      camera.updateProjectionMatrix()
    },
  }
}

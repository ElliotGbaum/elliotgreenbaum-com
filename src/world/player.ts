/**
 * The player — you are a light.
 *
 * No vehicle, no avatar, no physics engine. A point light, an additive glow
 * sprite and about forty lines of velocity integration. Movement is
 * hold-pointer-to-drift with damping; arrows and WASD are an equal-status
 * alternative, not a fallback.
 */

import * as THREE from 'three'
import { PALETTE, clamp } from '../core/contract'
import { FIELD_RADIUS } from './field'

const HEIGHT = 1.9 // how high the light floats — tuned so the ground pool reads
const ACCEL = 34
const MAX_SPEED = 15
const DAMPING = 2.4
const ARRIVE_RADIUS = 2.2 // stop fussing once this close to an auto-travel target
const GLOW_SIZE = 5.4
const LAMP_BASE = 74

/** soft radial falloff used for the glow sprite — additive, so it blooms
 *  without a postprocessing pass costing us a full-screen render target */
function glowTexture(): THREE.CanvasTexture {
  const S = 128
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const c = cv.getContext('2d')!
  // Tight falloff. The first pass reached far too wide and additive-blended
  // the middle of the frame into a featureless blob — the glow should read as
  // a source, not as weather.
  const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0.0, 'rgba(255,232,196,0.95)')
  g.addColorStop(0.10, 'rgba(255,205,132,0.42)')
  g.addColorStop(0.28, 'rgba(233,175,88,0.12)')
  g.addColorStop(0.62, 'rgba(227,169,74,0.025)')
  g.addColorStop(1.0, 'rgba(227,169,74,0)')
  c.fillStyle = g
  c.fillRect(0, 0, S, S)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export interface Player {
  object: THREE.Group
  /** live reference — read it, don't reassign it */
  readonly position: THREE.Vector3
  readonly speed: number
  /** how strongly this light reaches a point, 0..1 */
  litAt(p: THREE.Vector3): number
  travelTo(target: THREE.Vector3): void
  cancelTravel(): void
  setEnabled(on: boolean): void
  update(dt: number, elapsed: number): void
  dispose(): void
}

export function createPlayer(
  scene: THREE.Scene,
  camera: THREE.Camera,
  dom: HTMLElement,
): Player {
  const group = new THREE.Group()
  group.position.set(0, HEIGHT, 46)

  // the visible core — deliberately small; the glow does the work
  const coreGeo = new THREE.SphereGeometry(0.34, 20, 14)
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff0d6, fog: false })
  const core = new THREE.Mesh(coreGeo, coreMat)
  group.add(core)

  const glowTex = glowTexture()
  const glowMat = new THREE.SpriteMaterial({
    map: glowTex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    fog: false,
  })
  const glow = new THREE.Sprite(glowMat)
  glow.scale.setScalar(GLOW_SIZE)
  group.add(glow)

  // r155+ lights are physically based — intensity is candela — but decay 2 is
  // too aggressive here: the point of this light is to *reveal a field*, and
  // inverse-square puts everything past twenty units in the dark. 1.6 keeps a
  // hot centre while still reaching the middle distance.
  const lamp = new THREE.PointLight(PALETTE.glow, LAMP_BASE, 85, 1.6)
  lamp.castShadow = false
  group.add(lamp)

  scene.add(group)

  /* ---------------- movement state ---------------- */
  const vel = new THREE.Vector3()
  const target = new THREE.Vector3()
  let hasPointerTarget = false
  let autoTravel = false
  let enabled = true
  const keys = new Set<string>()

  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const hit = new THREE.Vector3()

  function pointToGround(clientX: number, clientY: number): boolean {
    const r = dom.getBoundingClientRect()
    ndc.x = ((clientX - r.left) / r.width) * 2 - 1
    ndc.y = -((clientY - r.top) / r.height) * 2 + 1
    ray.setFromCamera(ndc, camera)
    return ray.ray.intersectPlane(plane, hit) !== null
  }

  /* ---------------- input ---------------- */
  const onPointerDown = (e: PointerEvent) => {
    if (!enabled || e.button !== 0) return
    // ignore drags that start on HUD chrome
    if ((e.target as HTMLElement)?.closest('#hud, #places, #panel, #film')) return
    dom.setPointerCapture?.(e.pointerId)
    autoTravel = false
    if (pointToGround(e.clientX, e.clientY)) {
      target.copy(hit)
      hasPointerTarget = true
    }
  }
  const onPointerMove = (e: PointerEvent) => {
    if (!enabled || !hasPointerTarget || autoTravel) return
    if (pointToGround(e.clientX, e.clientY)) target.copy(hit)
  }
  const onPointerUp = () => {
    hasPointerTarget = false
  }

  const MOVE_KEYS = new Set([
    'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd',
  ])
  const onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase()
    if (!MOVE_KEYS.has(k)) return
    if (!enabled) return
    keys.add(k)
    autoTravel = false
    e.preventDefault()
  }
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase())

  dom.addEventListener('pointerdown', onPointerDown)
  dom.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  /* ---------------- integration ---------------- */
  const accel = new THREE.Vector3()
  const toTarget = new THREE.Vector3()

  function update(dt: number, elapsed: number) {
    accel.set(0, 0, 0)

    // keyboard takes priority — if you're holding a key you mean it
    let kx = 0
    let kz = 0
    if (keys.has('arrowleft') || keys.has('a')) kx -= 1
    if (keys.has('arrowright') || keys.has('d')) kx += 1
    if (keys.has('arrowup') || keys.has('w')) kz -= 1
    if (keys.has('arrowdown') || keys.has('s')) kz += 1

    if (kx || kz) {
      accel.set(kx, 0, kz).normalize().multiplyScalar(ACCEL)
    } else if ((hasPointerTarget || autoTravel) && enabled) {
      toTarget.subVectors(target, group.position)
      toTarget.y = 0
      const d = toTarget.length()
      if (autoTravel && d < ARRIVE_RADIUS) {
        autoTravel = false
      } else if (d > 0.35) {
        // ease off as we arrive so auto-travel doesn't overshoot and oscillate
        const gain = autoTravel ? clamp(d / 9, 0.25, 1) : 1
        accel.copy(toTarget).divideScalar(d).multiplyScalar(ACCEL * gain)
      }
    }

    vel.addScaledVector(accel, dt)

    // exponential damping — frame-rate independent, unlike v *= 0.96
    const damp = Math.exp(-DAMPING * dt)
    vel.multiplyScalar(damp)

    const sp = vel.length()
    if (sp > MAX_SPEED) vel.multiplyScalar(MAX_SPEED / sp)

    group.position.addScaledVector(vel, dt)

    // soft boundary — a spring, not a wall, so it never feels like a fence
    const flat = Math.hypot(group.position.x, group.position.z)
    if (flat > FIELD_RADIUS) {
      const over = flat - FIELD_RADIUS
      const push = Math.min(over * 0.16, 3)
      group.position.x -= (group.position.x / flat) * push
      group.position.z -= (group.position.z / flat) * push
      vel.multiplyScalar(0.9)
    }

    group.position.y = HEIGHT

    // a slow breath so the light reads as alive while you're standing still,
    // plus a small kick with speed so movement feels like it costs something
    const breath = 1 + Math.sin(elapsed * 1.35) * 0.045
    const rush = 1 + clamp(sp / MAX_SPEED) * 0.16
    glow.scale.setScalar(GLOW_SIZE * breath * rush)
    lamp.intensity = LAMP_BASE * breath
    core.scale.setScalar(breath)
  }

  const tmp = new THREE.Vector3()
  return {
    object: group,
    position: group.position,
    get speed() {
      return vel.length()
    },
    litAt(p: THREE.Vector3) {
      const d = tmp.copy(p).sub(group.position).length()
      return clamp(1 - d / 34)
    },
    travelTo(t: THREE.Vector3) {
      target.copy(t)
      target.y = HEIGHT
      autoTravel = true
      hasPointerTarget = false
      keys.clear()
    },
    cancelTravel() {
      autoTravel = false
    },
    setEnabled(on: boolean) {
      enabled = on
      if (!on) {
        keys.clear()
        hasPointerTarget = false
      }
    },
    update,
    dispose() {
      dom.removeEventListener('pointerdown', onPointerDown)
      dom.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      coreGeo.dispose()
      coreMat.dispose()
      glowMat.dispose()
      glowTex.dispose()
      scene.remove(group)
    },
  }
}

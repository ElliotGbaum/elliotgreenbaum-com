/**
 * The field — ground, sky, fog and the small amount of ambient light that
 * keeps the world dusk-blue rather than black.
 *
 * Design note: darkness here is doing double duty. It's the concept (nothing
 * is visible until you look at it) and it's the performance budget (fog kills
 * draw distance for free). The one thing it must never become is *murk* —
 * hence the lifted ambient and the horizon tint below.
 */

import * as THREE from 'three'
import { PALETTE, rand } from '../core/contract'

export const FIELD_RADIUS = 90

/** faint speckle so the ground has texture to move against — without it,
 *  drifting reads as standing still */
function groundTexture(): THREE.CanvasTexture {
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const c = cv.getContext('2d')!

  c.fillStyle = PALETTE.nightCss
  c.fillRect(0, 0, S, S)

  for (let i = 0; i < 900; i++) {
    const x = rand(i * 2 + 1) * S
    const y = rand(i * 2 + 7) * S
    const r = 0.4 + rand(i + 31) * 1.5
    const a = 0.03 + rand(i + 97) * 0.10
    c.fillStyle = `rgba(158,184,180,${a})`
    c.beginPath()
    c.arc(x, y, r, 0, Math.PI * 2)
    c.fill()
  }

  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(46, 46)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** a shallow dome of faint stars — sits outside the fog so it stays visible
 *  and gives the eye something to reference while moving */
function stars(): THREE.Points {
  const N = 520
  const pos = new Float32Array(N * 3)
  const alpha = new Float32Array(N)

  for (let i = 0; i < N; i++) {
    // bias toward the horizon band; a full hemisphere reads as a planetarium
    const theta = rand(i + 3) * Math.PI * 2
    const h = 0.12 + Math.pow(rand(i + 41), 1.8) * 0.75
    const r = FIELD_RADIUS * (1.6 + rand(i + 77) * 0.5)
    pos[i * 3] = Math.cos(theta) * r
    pos[i * 3 + 1] = 12 + h * 95
    pos[i * 3 + 2] = Math.sin(theta) * r
    alpha[i] = 0.25 + rand(i + 131) * 0.6
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aOpacity', new THREE.BufferAttribute(alpha, 1))

  const mat = new THREE.PointsMaterial({
    color: PALETTE.buff,
    size: 1.15,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.55,
    fog: false,
    depthWrite: false,
  })

  const pts = new THREE.Points(geo, mat)
  pts.frustumCulled = false
  return pts
}

export interface Field {
  ground: THREE.Mesh
  dispose(): void
}

export function createField(scene: THREE.Scene): Field {
  // Fog is lifted well above the ground colour on purpose: distance should
  // fade to dusk, not to black. Density tuned so the projector beacon ~45
  // units out still reads clearly from the spawn point — if you can't see the
  // beacon, the whole navigation model is gone.
  const air = new THREE.Color(0x101f26)
  scene.background = air.clone()
  scene.fog = new THREE.FogExp2(air.getHex(), 0.0105)

  const tex = groundTexture()
  const geo = new THREE.PlaneGeometry(FIELD_RADIUS * 2.6, FIELD_RADIUS * 2.6, 1, 1)
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    roughness: 0.96,
    metalness: 0,
  })
  const ground = new THREE.Mesh(geo, mat)
  ground.rotation.x = -Math.PI / 2
  ground.name = 'ground'
  scene.add(ground)

  const sky = stars()
  scene.add(sky)

  // Just enough ambient that unlit geometry reads as silhouette rather than
  // absence. Two sources: a cool sky term and a slightly warmer bounce.
  const hemi = new THREE.HemisphereLight(0x2c4a55, 0x0d1a1e, 1.35)
  scene.add(hemi)

  const fill = new THREE.AmbientLight(PALETTE.horizon, 0.7)
  scene.add(fill)

  return {
    ground,
    dispose() {
      geo.dispose()
      mat.dispose()
      tex.dispose()
      sky.geometry.dispose()
      ;(sky.material as THREE.Material).dispose()
      scene.remove(ground, sky, hemi, fill)
    },
  }
}

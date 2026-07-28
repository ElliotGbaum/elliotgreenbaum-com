/**
 * The projector — the destination, and the whole reason the concept works.
 *
 * A projector without light is furniture. It sits dark in the middle of the
 * field with a vertical beacon so it can be found from anywhere; bring your
 * light and the beam swings onto the screen and the film starts.
 */

import * as THREE from 'three'
import { clamp, easeOut, type Landmark, type LandmarkContext } from '../../core/contract'

const SCREEN_Z = -30
const SCREEN_W = 30
const SCREEN_H = 17
const SCREEN_Y = 11
const PROJ_Z = 4

/** vertical gradient used for both beams — bright at the source, gone at the end */
function beamTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = 4
  cv.height = 128
  const c = cv.getContext('2d')!
  // Saturated on purpose. Additive blending over a dark sky drifts everything
  // toward white, so a "warm" beam authored at realistic saturation renders as
  // grey. Push the amber hard and keep the opacity low instead.
  const g = c.createLinearGradient(0, 128, 0, 0)
  g.addColorStop(0.0, 'rgba(255,178,74,0.62)')
  g.addColorStop(0.35, 'rgba(255,157,52,0.24)')
  g.addColorStop(1.0, 'rgba(226,132,40,0)')
  c.fillStyle = g
  c.fillRect(0, 0, 4, 128)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** soft-edged rectangle — what light on a screen actually looks like */
function screenTexture(): THREE.CanvasTexture {
  const W = 256
  const H = 144
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const c = cv.getContext('2d')!
  c.fillStyle = '#000'
  c.fillRect(0, 0, W, H)
  const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.62)
  g.addColorStop(0, 'rgba(255,247,229,1)')
  g.addColorStop(0.62, 'rgba(255,236,201,0.72)')
  g.addColorStop(1, 'rgba(227,169,74,0.08)')
  c.fillStyle = g
  c.fillRect(0, 0, W, H)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export interface Projector extends Landmark {
  /** where the camera should sit to watch the film, and what it looks at */
  readonly vantage: { position: THREE.Vector3; lookAt: THREE.Vector3 }
  /** 0 → dormant beacon, 1 → beam fully on the screen */
  setFiring(on: boolean): void
}

export function createProjector(): Projector {
  const group = new THREE.Group()

  const metal = new THREE.MeshStandardMaterial({
    color: 0x3d4a4a,
    roughness: 0.55,
    metalness: 0.65,
  })
  const dark = new THREE.MeshStandardMaterial({
    color: 0x1a2426,
    roughness: 0.9,
    metalness: 0.1,
  })

  /* ---------------- the screen ---------------- */
  const frameT = new THREE.Mesh(new THREE.BoxGeometry(SCREEN_W + 1.6, 0.8, 0.8), dark)
  frameT.position.set(0, SCREEN_Y + SCREEN_H / 2, SCREEN_Z)
  const frameB = frameT.clone()
  frameB.position.y = SCREEN_Y - SCREEN_H / 2
  const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.8, SCREEN_H + 1.6, 0.8), dark)
  frameL.position.set(-SCREEN_W / 2, SCREEN_Y, SCREEN_Z)
  const frameR = frameL.clone()
  frameR.position.x = SCREEN_W / 2
  group.add(frameT, frameB, frameL, frameR)

  for (const x of [-SCREEN_W / 2 + 1, SCREEN_W / 2 - 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.7, SCREEN_Y - SCREEN_H / 2, 0.7), dark)
    leg.position.set(x, (SCREEN_Y - SCREEN_H / 2) / 2, SCREEN_Z)
    group.add(leg)
  }

  const screenTex = screenTexture()
  const screenMat = new THREE.MeshBasicMaterial({
    map: screenTex,
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    fog: true,
    toneMapped: false,
  })
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), screenMat)
  screen.position.set(0, SCREEN_Y, SCREEN_Z + 0.05)
  group.add(screen)

  // the dark screen surface, so it reads as an object when unlit
  const backMat = new THREE.MeshStandardMaterial({ color: 0x121b1d, roughness: 1 })
  const back = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), backMat)
  back.position.set(0, SCREEN_Y, SCREEN_Z)
  group.add(back)

  /* ---------------- the projector itself ---------------- */
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 4.2), metal)
  body.position.set(0, 2.6, PROJ_Z)
  group.add(body)

  const lensHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.78, 1.5, 18),
    metal,
  )
  lensHousing.rotation.x = Math.PI / 2
  lensHousing.position.set(0, 2.6, PROJ_Z - 2.6)
  group.add(lensHousing)

  const lensMat = new THREE.MeshBasicMaterial({ color: 0x2a1f10, toneMapped: false })
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.58, 20), lensMat)
  lens.position.set(0, 2.6, PROJ_Z - 3.36)
  lens.rotation.y = Math.PI
  group.add(lens)

  // reels, because a projector without reels doesn't read as a projector
  for (const z of [PROJ_Z + 0.6, PROJ_Z + 1.7]) {
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.18, 22), metal)
    reel.rotation.z = Math.PI / 2
    reel.position.set(0, 4.1, z)
    group.add(reel)
  }

  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 1.7, 12), dark)
  stand.position.set(0, 0.85, PROJ_Z)
  group.add(stand)
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.22, 20), dark)
  foot.position.set(0, 0.11, PROJ_Z)
  group.add(foot)

  /* ---------------- beams ---------------- */
  const beamTex = beamTexture()

  // dormant beacon — the north star. Visible from anywhere in the field.
  const beaconMat = new THREE.MeshBasicMaterial({
    map: beamTex,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  })
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 0.9, 70, 14, 1, true),
    beaconMat,
  )
  beacon.position.set(0, 35 + 2.6, PROJ_Z)
  group.add(beacon)

  // the projection beam — lens to screen
  const throwDist = Math.abs(SCREEN_Z - (PROJ_Z - 3.4))
  const projMat = new THREE.MeshBasicMaterial({
    map: beamTex,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  })
  // Far radius stays *inside* the screen rectangle. At 0.52 the cone's end
  // circle cleared the top edge and you could see the beam silhouette spilling
  // into the sky above the frame, which instantly breaks the illusion that the
  // light is landing on anything.
  const throwBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(SCREEN_H * 0.44, 0.5, throwDist, 16, 1, true),
    projMat,
  )
  throwBeam.rotation.x = Math.PI / 2
  throwBeam.position.set(0, 2.6 + (SCREEN_Y - 2.6) * 0.5, (PROJ_Z - 3.4 + SCREEN_Z) / 2)
  throwBeam.lookAt(new THREE.Vector3(0, SCREEN_Y, SCREEN_Z))
  group.add(throwBeam)

  // light thrown back into the field from the screen
  const bounce = new THREE.PointLight(0xffe6bd, 0, 62, 2)
  bounce.position.set(0, SCREEN_Y, SCREEN_Z + 6)
  group.add(bounce)

  /* ---------------- behaviour ---------------- */
  let firing = 0
  let firingTarget = 0

  const anchor = new THREE.Vector3(0, 0, PROJ_Z + 12)
  const vantage = {
    position: new THREE.Vector3(0, SCREEN_Y - 1.5, SCREEN_Z + 30),
    lookAt: new THREE.Vector3(0, SCREEN_Y, SCREEN_Z),
  }

  return {
    id: 'projector',
    title: 'The projector',
    object: group,
    anchor,
    radius: 15,
    prompt: 'Bring your light',
    again: 'Enter to watch again',
    vantage,

    setFiring(on: boolean) {
      firingTarget = on ? 1 : 0
    },

    activate(ctx: LandmarkContext) {
      ctx.playFilm()
    },

    update(dt, elapsed, lit) {
      firing += (firingTarget - firing) * Math.min(1, dt * 2.6)

      // the beacon breathes while dormant, and gets out of the way once the
      // film is running — it has done its job by then
      const idle = 1 - firing
      const pulse = 0.30 + Math.sin(elapsed * 0.85) * 0.07
      beaconMat.opacity = idle * pulse * (0.62 + lit * 0.38)
      beacon.visible = beaconMat.opacity > 0.01

      // a projector lamp flicker: two frequencies so it never reads as a sine
      const flick = 1 + Math.sin(elapsed * 27) * 0.03 + Math.sin(elapsed * 8.3) * 0.02
      const f = easeOut(clamp(firing))
      projMat.opacity = f * 0.42 * flick
      throwBeam.visible = projMat.opacity > 0.01
      screenMat.opacity = f * flick
      bounce.intensity = f * 190 * flick
      lensMat.color.setRGB(0.16 + f * 0.84, 0.12 + f * 0.75, 0.06 + f * 0.55)

      // as you approach, the housing catches your light before the beam fires
      const warm = clamp(lit * 1.2) * (1 - f)
      metal.emissive.setRGB(warm * 0.06, warm * 0.045, warm * 0.02)
    },
  }
}

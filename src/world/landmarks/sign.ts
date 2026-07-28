/**
 * The lit sign — the recruiter's landmark.
 *
 * Everything else in this world is dark until you bring light to it. This one
 * is already on, deliberately: someone who has forty seconds should be able to
 * see where the résumé is within one of them, without exploring anything.
 * It's the in-world twin of the corner Résumé button, not a replacement for it.
 */

import * as THREE from 'three'
import { PALETTE, clamp, type Landmark, type LandmarkContext } from '../../core/contract'

// Pulled in toward the spawn axis so it sits fully inside the frame the moment
// anyone arrives — a résumé signpost you have to go looking for is not a
// résumé signpost. At x=27 it ran off the right edge of a 16:10 viewport.
const POS = new THREE.Vector3(19, 0, 21)
const SPAWN_Z = 46

function signTexture(): THREE.CanvasTexture {
  const W = 640
  const H = 320
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const c = cv.getContext('2d')!

  c.fillStyle = '#0F1A1C'
  c.fillRect(0, 0, W, H)

  c.strokeStyle = PALETTE.amberCss
  c.lineWidth = 5
  c.strokeRect(16, 16, W - 32, H - 32)
  c.globalAlpha = 0.35
  c.strokeRect(30, 30, W - 60, H - 60)
  c.globalAlpha = 1

  c.textAlign = 'center'
  c.textBaseline = 'middle'

  c.fillStyle = '#F3E9D2'
  c.font = '600 62px "Hoefler Text", "Iowan Old Style", Palatino, Georgia, serif'
  c.fillText('Elliot Greenbaum', W / 2, H / 2 - 42)

  c.fillStyle = PALETTE.amberLitCss
  c.font = '500 30px ui-monospace, "SF Mono", Menlo, monospace'
  c.letterSpacing = '6px'
  c.fillText('RÉSUMÉ', W / 2, H / 2 + 44)

  c.globalAlpha = 0.55
  c.fillStyle = PALETTE.sageCss
  c.font = '400 21px ui-monospace, "SF Mono", Menlo, monospace'
  c.letterSpacing = '2px'
  c.fillText('the short version', W / 2, H / 2 + 92)

  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

export function createSign(): Landmark {
  const group = new THREE.Group()
  group.position.copy(POS)
  // face the spawn point, so it's legible the moment anyone arrives
  group.rotation.y = Math.atan2(-POS.x, SPAWN_Z - POS.z)

  const post = new THREE.MeshStandardMaterial({
    color: 0x27343a,
    roughness: 0.85,
    metalness: 0.2,
  })

  const W = 11
  const H = 5.5
  const Y = 6.8

  for (const x of [-W / 2 + 1.2, W / 2 - 1.2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, Y - H / 2, 0.6), post)
    leg.position.set(x, (Y - H / 2) / 2, 0)
    group.add(leg)
  }

  const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.9, H + 0.9, 0.55), post)
  frame.position.set(0, Y, -0.14)
  group.add(frame)

  const tex = signTexture()
  const faceMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: true })
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), faceMat)
  face.position.set(0, Y, 0.18)
  group.add(face)

  // the sign lights its own patch of ground — proof it's powered, and a warm
  // pool that reads as somewhere to go
  const lamp = new THREE.PointLight(PALETTE.amberLit, 130, 34, 2)
  lamp.position.set(0, Y - 1.2, 2.6)
  group.add(lamp)

  const hood = new THREE.Mesh(new THREE.BoxGeometry(W + 0.9, 0.4, 1.5), post)
  hood.position.set(0, Y + H / 2 + 0.6, 0.6)
  group.add(hood)

  return {
    id: 'resume',
    title: 'The lit sign',
    object: group,
    anchor: new THREE.Vector3(POS.x - 6, 0, POS.z + 9),
    radius: 13,
    prompt: 'Read the short version',
    again: 'Enter to read again',

    activate(ctx: LandmarkContext) {
      ctx.openPanel('resume')
    },

    update(_dt, elapsed, lit) {
      // a slow mains hum in the tubes — small, but a perfectly steady sign
      // reads as a texture rather than an object
      const hum = 1 + Math.sin(elapsed * 3.1) * 0.012 + Math.sin(elapsed * 11.7) * 0.006
      lamp.intensity = 130 * hum * (1 + clamp(lit) * 0.35)
      faceMat.color.setScalar(hum * (0.9 + clamp(lit) * 0.1))
    },
  }
}

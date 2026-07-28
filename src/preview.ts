/**
 * Dev-only harness: the world with no chrome, no film, no panels.
 *
 * Exists so lighting, fog density and camera framing can be judged on their
 * own — those are the numbers most easily wrecked by a change somewhere else,
 * and hardest to judge with UI sitting on top of them. Not part of the build
 * output that matters; safe to delete.
 */

import * as THREE from 'three'
import { createField } from './world/field'
import { createPlayer } from './world/player'
import { createRig } from './world/camera'
import { createProjector } from './world/landmarks/projector'
import { createSign } from './world/landmarks/sign'

const canvas = document.getElementById('stage') as HTMLCanvasElement

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.28

const scene = new THREE.Scene()
const rig = createRig()
createField(scene)
const player = createPlayer(scene, rig.camera, canvas)

const projector = createProjector()
const sign = createSign()
scene.add(projector.object, sign.object)

// let the beam be inspected without needing to walk over and trigger it
let firing = false
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() !== 'f') return
  firing = !firing
  projector.setFiring(firing)
})

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  rig.resize(window.innerWidth, window.innerHeight)
}
window.addEventListener('resize', resize)
resize()

const clock = new THREE.Clock()
let elapsed = 0
const vel = new THREE.Vector3()
const last = new THREE.Vector3().copy(player.position)

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05)
  elapsed += dt

  player.update(dt, elapsed)
  vel.subVectors(player.position, last).divideScalar(Math.max(dt, 0.0001))
  last.copy(player.position)
  rig.update(dt, player.position, vel)

  projector.update?.(dt, elapsed, player.litAt(projector.anchor), null as never)
  sign.update?.(dt, elapsed, player.litAt(sign.anchor), null as never)

  renderer.render(scene, rig.camera)
  requestAnimationFrame(frame)
}
frame()

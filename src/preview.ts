/**
 * Dev-only harness: the world with no chrome and no film sequence.
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
import { createFilm } from './film/film'

const canvas = document.getElementById('stage') as HTMLCanvasElement

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.28

const scene = new THREE.Scene()
const rig = createRig()
createField(scene)
const player = createPlayer(scene)

// the film is the projector's screen, so the harness needs one even though
// nothing here plays it back — press F to strike the lamp, P to run it
const film = createFilm()
const projector = createProjector(film.canvas)
scene.add(projector.object)

// let the beam and the picture be inspected without walking over to trigger it
let firing = false
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase()
  if (k === 'f') {
    firing = !firing
    projector.setFiring(firing)
  } else if (k === 'p') {
    if (film.state.running) film.stop()
    else film.play()
  }
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

  if (film.state.running && film.update(dt)) projector.refreshScreen()

  projector.update?.(dt, elapsed, player.litAt(projector.anchor), null as never)

  renderer.render(scene, rig.camera)
  requestAnimationFrame(frame)
}
frame()

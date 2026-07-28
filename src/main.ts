/**
 * elliotgreenbaum.com — entry point.
 *
 * Boots the world only if WebGL is actually available. If it isn't, we do
 * nothing at all and the plain résumé already in index.html stays on screen —
 * that page is the fallback, the accessibility path and the indexable content,
 * so the correct failure mode here is silence.
 */

import * as THREE from 'three'
import './style.css'
import './ui/ui.css'
import './film/film.css'

import { PALETTE, REDUCED_MOTION, type Landmark, type LandmarkContext } from './core/contract'
import { createField } from './world/field'
import { createPlayer } from './world/player'
import { createRig } from './world/camera'
import { createProjector } from './world/landmarks/projector'
import { createSign } from './world/landmarks/sign'
import { createPanel, resumeContent } from './ui/panel'
import { createPlaces } from './ui/places'
import { createHud } from './ui/hud'
import { createFilm } from './film/film'

function webglAvailable(): boolean {
  try {
    const cv = document.createElement('canvas')
    return !!(
      window.WebGLRenderingContext &&
      (cv.getContext('webgl2') || cv.getContext('webgl'))
    )
  } catch {
    return false
  }
}

if (webglAvailable()) boot()

function boot() {
  const root = document.documentElement
  const world = document.getElementById('world') as HTMLDivElement
  const canvas = document.getElementById('stage') as HTMLCanvasElement
  root.classList.add('has-webgl')
  world.removeAttribute('aria-hidden')

  /* ---------------- renderer ---------------- */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: window.devicePixelRatio < 2,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.28

  const scene = new THREE.Scene()
  const rig = createRig()
  const field = createField(scene)
  const player = createPlayer(scene, rig.camera, canvas)

  /* ---------------- landmarks ---------------- */
  const projector = createProjector()
  const landmarks: Landmark[] = [projector, createSign()]
  for (const l of landmarks) scene.add(l.object)

  const visited = new Set<string>()

  /* ---------------- chrome ---------------- */
  const panel = createPanel()
  const places = createPlaces()
  const hud = createHud()
  const film = createFilm()

  // Panel titles are written here rather than taken from the landmark: the
  // landmark is "The lit sign", but the thing you're reading is a résumé.
  const panels: Record<string, { title: string; content: () => Node | string }> = {
    resume: { title: 'Résumé', content: resumeContent },
  }

  let suppressUntil = 0 // brief cooldown so closing a panel doesn't re-trigger it
  const now = () => performance.now() / 1000

  const ctx: LandmarkContext = {
    openPanel(id) {
      const p = panels[id]
      if (!p) return
      panel.open(id, p.title, p.content())
      player.setEnabled(false)
    },
    playFilm() {
      startFilm()
    },
    setPrompt(text) {
      hud.setPrompt(text)
    },
  }

  panel.onClose(() => {
    player.setEnabled(true)
    suppressUntil = now() + 1.2
  })

  hud.onResume(() => {
    if (film.running) film.stop()
    ctx.openPanel('resume')
  })
  hud.onPlaces(() => places.open())

  function refreshPlaces() {
    places.setItems(
      landmarks.map((l) => ({
        id: l.id,
        title: l.title,
        hint: l.prompt,
        visited: visited.has(l.id),
      })),
    )
  }
  refreshPlaces()

  places.onTravel((id) => {
    const lm = landmarks.find((l) => l.id === id)
    if (!lm) return
    places.close()
    player.travelTo(lm.anchor)
  })

  /* ---------------- the film ---------------- */
  let filmActive = false

  async function startFilm() {
    if (filmActive) return
    filmActive = true
    visited.add('projector')
    refreshPlaces()

    player.setEnabled(false)
    hud.setPrompt(null)
    projector.setFiring(true)

    // push in on the screen, then let the DOM layer take over. The world does
    // the theatre; real HTML does the reading.
    await rig.cutTo(projector.vantage.position, projector.vantage.lookAt, REDUCED_MOTION ? 0.01 : 1.7)
    film.play()
  }

  film.onEnd(() => {
    filmActive = false
    projector.setFiring(false)
    rig.release()
    player.setEnabled(true)
    suppressUntil = now() + 1.4
    hud.show()
  })

  /* ---------------- proximity + dwell activation ---------------- */
  // No "press E to interact" tutorial: stand still near something for a beat
  // and it opens. Enter/Space does it immediately for anyone who'd rather.
  //
  // A landmark disarms itself once used and only re-arms when you actually
  // leave its radius. Without this the dwell timer re-fires the moment the
  // panel closes — you are, after all, still standing there — so the film
  // restarts about two seconds after it ends and loops forever, and the
  // résumé panel reopens as fast as you can dismiss it.
  let dwell = 0
  let near: Landmark | null = null
  let shownPrompt: string | null = null
  const disarmed = new Set<string>()

  function fire(l: Landmark) {
    disarmed.add(l.id)
    visited.add(l.id)
    refreshPlaces()
    l.activate(ctx)
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ' ') return
    if (panel.isOpen || film.running || !near) return
    if ((e.target as HTMLElement)?.closest('button, a, [tabindex]')) return
    e.preventDefault()
    fire(near) // explicit intent always works, armed or not
  }
  window.addEventListener('keydown', onKey)

  /* ---------------- resize ---------------- */
  function resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    renderer.setSize(w, h, false)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    rig.resize(w, h)
  }
  window.addEventListener('resize', resize)
  resize()

  /* ---------------- loop ---------------- */
  const clock = new THREE.Clock()
  let elapsed = 0
  let running = true
  const vel = new THREE.Vector3()
  const last = new THREE.Vector3().copy(player.position)
  const toProjector = new THREE.Vector3()

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden
    if (running) {
      clock.getDelta() // discard the gap so nothing lurches on return
      requestAnimationFrame(frame)
    }
  })

  function frame() {
    if (!running) return
    const dt = Math.min(clock.getDelta(), 0.05)
    elapsed += dt

    player.update(dt, elapsed)
    vel.subVectors(player.position, last).divideScalar(Math.max(dt, 0.0001))
    last.copy(player.position)

    rig.update(dt, player.position, vel)

    /* landmark proximity */
    let closest: Landmark | null = null
    let closestD = Infinity
    for (const l of landmarks) {
      const lit = player.litAt(l.anchor)
      l.update?.(dt, elapsed, lit, ctx)
      const d = l.anchor.distanceTo(player.position)
      // re-arm on the way out, with hysteresis so hovering on the boundary
      // can't flicker between armed and not
      if (d > l.radius * 1.25) disarmed.delete(l.id)
      if (d < l.radius && d < closestD) {
        closest = l
        closestD = d
      }
    }

    if (!panel.isOpen && !filmActive) {
      if (closest !== near) {
        near = closest
        dwell = 0
      }

      const armed = !!near && !disarmed.has(near.id)
      const want = near ? (armed ? near.prompt : near.again) : null
      if (want !== shownPrompt) {
        shownPrompt = want
        hud.setPrompt(want)
      }

      if (near && armed && now() > suppressUntil) {
        // only count dwell while actually settled — drifting past shouldn't
        // trigger anything
        dwell = player.speed < 4.2 ? dwell + dt : 0
        if (dwell > 0.55) {
          dwell = 0
          fire(near)
        }
      }
    }

    /* compass toward the projector */
    if (!filmActive && !panel.isOpen) {
      toProjector.subVectors(projector.anchor, player.position)
      const dist = Math.hypot(toProjector.x, toProjector.z)
      hud.setCompass(Math.atan2(toProjector.x, -toProjector.z), dist)
    } else {
      hud.setCompass(null, 0)
    }

    renderer.render(scene, rig.camera)
    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
  requestAnimationFrame(() => world.classList.add('is-ready'))

  /* ---------------- teardown (dev/HMR hygiene) ---------------- */
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      running = false
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', onKey)
      player.dispose()
      field.dispose()
      renderer.dispose()
    })
  }

  // quiet nod to anyone who opens the console
  console.log(
    `%c bring a light `,
    `background:${PALETTE.nightCss};color:${PALETTE.amberCss};padding:4px 8px;border-radius:2px`,
  )
}

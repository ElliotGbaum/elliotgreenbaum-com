/**
 * A level, turned into something you can look at — in the field's world.
 *
 * The sky, the fog, the stars and the lights are world/field.ts's, not
 * Minecraft's: dusk-blue, exponential fog, a moon nowhere near strong enough
 * to see by, and the lantern in your hand doing the real work. The one thing
 * added on top is a rim light along every platform edge, because a matte dark
 * platform against a matte dark sky is a jump you cannot see, and a parkour
 * course you cannot read is not a course. The rim is the projector plaque's
 * amber, so the wayfinding belongs to the same place.
 *
 * Geometry is one merged, face-culled, ambient-occluded mesh per surface type
 * (see mesher.ts) — a handful of draw calls, and a crease in every corner.
 */

import * as THREE from 'three'
import { PALETTE, rand } from '../core/contract'
import {
  BLOCK_GEOMETRY,
  blockMaterial,
  rimMaterial,
  rimOf,
  slabGeometry,
  slabMaterial,
  type BlockId,
} from './blocks'
import { meshBlocks } from './mesher'
import type { Level } from './levels'
import type { Mover } from './course'

export interface LevelScene {
  scene: THREE.Scene
  /** everything solid, for the camera's collision ray */
  readonly solids: THREE.Object3D[]
  /** platforms follow the physics, not the other way round */
  syncMovers(movers: Mover[], part: number): void
  update(dt: number, lanternAt: THREE.Vector3): void
  dispose(): void
}

/** the field's shallow dome of faint stars, biased toward the horizon */
function stars(radius: number, count: number): THREE.Points {
  const pos = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const theta = rand(i + 3) * Math.PI * 2
    const h = 0.05 + Math.pow(rand(i + 41), 1.7) * 0.85
    const r = radius * (1.1 + rand(i + 77) * 0.5)
    pos[i * 3] = Math.cos(theta) * r
    pos[i * 3 + 1] = h * radius * 1.1
    pos[i * 3 + 2] = Math.sin(theta) * r
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    color: PALETTE.buff,
    size: 1.2,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.5,
    fog: false,
    depthWrite: false,
  })
  const pts = new THREE.Points(geo, mat)
  pts.frustumCulled = false
  return pts
}

export function buildScene(level: Level): LevelScene {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(level.sky)
  // exponential, like the field's: distance should dissolve, not clip
  scene.fog = new THREE.FogExp2(level.fog, level.fogDensity)

  const solids: THREE.Object3D[] = []
  const owned: Array<{ dispose(): void }> = []

  /* ---- lights ----
     The three the field runs on, at the same relative strengths: a hemisphere
     for the sky term, a flat ambient so nothing is ever pure black, and one
     directional standing in for the moon so geometry has a lit side.
     Everything else is the lantern. */
  /* Brighter than the field's, deliberately. Out there the dark IS the
     concept — things resolve as you approach them. In here you have to judge
     a jump to a platform twenty blocks away, so the tops have to be readable
     before you get there: the sky term carries the platform faces, the rim
     carries their edges, and the lantern is what makes the one you are
     standing on feel close. */
  const hemi = new THREE.HemisphereLight(level.hemiSky, level.hemiGround, 4.2)
  scene.add(hemi)
  const fill = new THREE.AmbientLight(PALETTE.horizon, 1.6)
  scene.add(fill)
  const moon = new THREE.DirectionalLight(0xa8c0d6, 1.1)
  moon.position.set(-40, 70, 30)
  scene.add(moon)

  /**
   * The lamp the figure carried in — why anything nearby is visible at all.
   *
   * A NOTE ON A WRONG FIX, SO NOBODY TRIES IT AGAIN. This light hangs near the
   * torso, so it used to bleach the figure into a lit mannequin the moment it
   * left the ground. The obvious answer — put the light on its own layer and
   * let the course opt in — DOES NOT WORK: three.js tests `object.layers`
   * against **the camera's** layers and never against a light's, so a light on
   * a layer the camera does not render is simply never submitted. It did not
   * stop lighting the figure, it stopped existing, and the courses went dark
   * for a whole revision with the emissive floor quietly carrying them.
   *
   * The figure is kept a silhouette in avatar.ts instead, by being made of
   * unlit material rather than by hiding from the light.
   */
  // …and modest. At 38 this was nearly three times the field's lamp, and it
  // flattened all five courses into the same gold deck with a black figure on
  // it — the lantern was contributing more colour than the level was.
  const lantern = new THREE.PointLight(PALETTE.glow, 15, 26, 1.7)
  scene.add(lantern)

  /* ---- static surfaces ---- */
  const full = new Set<number>()
  const key = (x: number, y: number, z: number) =>
    (((x + 512) & 1023) << 20) | (((y + 512) & 1023) << 10) | ((z + 512) & 1023)
  for (const b of level.blocks) if (!b.half) full.add(key(b.x, b.y, b.z))
  const solidAt = (x: number, y: number, z: number) => full.has(key(x, y, z))

  const types = new Set<BlockId>(level.blocks.map((b) => b.id))
  for (const id of types) {
    const geo = meshBlocks(level.blocks, id, solidAt)
    if (!geo) continue
    const mesh = new THREE.Mesh(geo, blockMaterial(id))
    scene.add(mesh)
    solids.push(mesh)
    owned.push(geo)

    /* …and the rim. EdgesGeometry over the merged, face-culled mesh is
       exactly the silhouette of the platforms and nothing inside them —
       which is the line you actually read a jump off. */
    const edges = new THREE.EdgesGeometry(geo, 40)
    scene.add(new THREE.LineSegments(edges, rimMaterial(rimOf(id))))
    owned.push(edges)
  }

  /* ---- backdrop slabs ---- */
  for (const sl of level.slabs) {
    const w = sl.x1 - sl.x0
    const h = sl.y1 - sl.y0
    const d = sl.z1 - sl.z0
    const geo = slabGeometry(w, h, d)
    const mesh = new THREE.Mesh(geo, slabMaterial(sl.id))
    mesh.position.set(sl.x0 + w / 2, sl.y0 + h / 2, sl.z0 + d / 2)
    scene.add(mesh)
    // in `solids` whether or not it is collidable: this list is what the
    // camera casts against, and a floor you fall through is still a floor the
    // camera must not end up underneath
    solids.push(mesh)
    owned.push(geo)
  }

  /* ---- moving platforms ---- */
  const moverMeshes: THREE.Object3D[] = []
  const m = new THREE.Matrix4()
  for (const spec of level.movers) {
    const group = new THREE.Group()
    const mesh = new THREE.InstancedMesh(
      BLOCK_GEOMETRY,
      blockMaterial(spec.id),
      spec.w * spec.len,
    )
    let i = 0
    for (let x = 0; x < spec.w; x++) {
      for (let z = 0; z < spec.len; z++) {
        m.makeTranslation(x + 0.5, 0.5, z + 0.5)
        mesh.setMatrixAt(i++, m)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.frustumCulled = false
    group.add(mesh)

    // the same rim, so a platform that moves reads like one that does not
    const box = new THREE.BoxGeometry(spec.w, 1, spec.len)
    const edges = new THREE.EdgesGeometry(box)
    const line = new THREE.LineSegments(edges, rimMaterial(rimOf(spec.id)))
    line.position.set(spec.w / 2, 0.5, spec.len / 2)
    group.add(line)
    owned.push(box, edges)

    scene.add(group)
    solids.push(mesh)
    moverMeshes.push(group)
  }

  /* ---- the goal and the checkpoints, as beacons ----
     Vertical shafts of light: the projector's own wayfinding language. The
     first version was an open-ended cylinder 70 blocks tall, which side-on is
     a hard-edged band crossing the entire frame — two diagonal streaks in
     every screenshot, reading as lens scratches rather than as signals. The
     projector's beacon works because it is a *gradient* cone that fades out
     along its length; this is that. */
  const beamTex = (() => {
    const cv = document.createElement('canvas')
    cv.width = 4
    cv.height = 128
    const c = cv.getContext('2d')!
    const g = c.createLinearGradient(0, 128, 0, 0)
    g.addColorStop(0.0, 'rgba(255,255,255,0.85)')
    g.addColorStop(0.35, 'rgba(255,255,255,0.3)')
    g.addColorStop(1.0, 'rgba(255,255,255,0)')
    c.fillStyle = g
    c.fillRect(0, 0, 4, 128)
    const t = new THREE.CanvasTexture(cv)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  })()
  owned.push(beamTex)
  const beams: Array<{ mat: THREE.MeshBasicMaterial; base: number }> = []
  const beacon = (
    x: number,
    y: number,
    z: number,
    colour: number,
    radius: number,
    height: number,
    strength: number,
  ) => {
    // wide at the base, gone at the top — a shaft of light, not a pipe
    const geo = new THREE.CylinderGeometry(radius * 1.5, radius * 0.6, height, 14, 1, true)
    const mat = new THREE.MeshBasicMaterial({
      map: beamTex,
      color: colour,
      transparent: true,
      opacity: strength,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x, y + height / 2, z)
    scene.add(mesh)
    owned.push(geo, mat)
    beams.push({ mat, base: strength })
  }
  /* The goal gets a tall one, because it is the only thing you are ultimately
     aiming at. Checkpoints get short ones — five full-height shafts on screen
     at once turned The Shaft into a row of parallel diagonal streaks, and a
     signal that is everywhere is not a signal. */
  beacon(level.goal.x, level.goal.y, level.goal.z, PALETTE.mint, 0.5, 26, 0.5)
  for (const cp of level.checkpoints) {
    beacon(cp.x, cp.y, cp.z, PALETTE.amber, 0.26, 7, 0.42)
  }

  /* ---- sky ---- */
  const sky = stars(150, 420)
  scene.add(sky)
  owned.push(sky.geometry, sky.material as THREE.Material)

  let age = 0

  return {
    scene,
    solids,

    syncMovers(movers, part) {
      // drawn between the last two ticks, exactly as the body is — otherwise
      // your feet slide on a deck stepping at 20 Hz under you at 144
      movers.forEach((mv, i) => {
        const mesh = moverMeshes[i]
        if (!mesh) return
        const d = mv.solid.mover
        const back = d ? 1 - part : 0
        mesh.position.set(
          mv.solid.x0 - (d ? d.dx * back : 0),
          mv.solid.y0 - (d ? d.dy * back : 0),
          mv.solid.z0 - (d ? d.dz * back : 0),
        )
      })
    },

    update(dt, lanternAt) {
      age += dt
      lantern.position.copy(lanternAt)
      // the field's two-frequency flicker, so the light in here is
      // recognisably the light you were carrying out there
      const flick = 1 + Math.sin(age * 11.3) * 0.045 + Math.sin(age * 27.7) * 0.03
      lantern.intensity = 15 * flick
      const pulse = 0.82 + Math.sin(age * 1.5) * 0.18
      for (const b of beams) b.mat.opacity = b.base * pulse
      // the stars ride with you, so they never get closer
      sky.position.set(lanternAt.x, 0, lanternAt.z)
    },

    dispose() {
      for (const o of owned) o.dispose()
      scene.clear()
    },
  }
}

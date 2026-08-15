/**
 * The trainyard you are looking at — and nothing else.
 *
 * This file draws a snapshot. It decides nothing: it is handed an interpolated
 * position, a live `SimState` to read flags off, and a list of entities the
 * generator has committed, and it turns them into a frame. If you ever find
 * yourself in here wanting to know whether the player *should* have died, you
 * are in the wrong file — that is sim.ts, and the seam between the two is the
 * only reason either of them is testable.
 *
 * WHAT IS IN HERE
 *  · the sky, the fog and the light rig, matched to the parkour's so the two
 *    minigames read as the same hand: a hemisphere carrying the faces, a flat
 *    ambient so nothing is ever pure black, a faint moon for a lit side, and
 *    the lantern you walked in with doing all the modelling;
 *  · the rail bed, as a ring buffer of real, jittered, instanced sleepers;
 *  · one InstancedMesh per entity kind, with the live set maintained by
 *    commit/release/pop and rewritten only when it changes;
 *  · one merged amber rim per kind, because a matte dark carriage against a
 *    matte dark sky is a lane you cannot read;
 *  · the camera rig, which is most of the feel of the game;
 *  · the dust, the speed lines, the guard and his light, and the death shot.
 *
 * THE CAMERA IS THE GAME. Three of its rules cost nothing and are worth more
 * than any amount of geometry, and all three are counter-intuitive enough that
 * they get "fixed" by well-meaning hands about once a project:
 *
 *  1. THE LATERAL FOLLOW IS SLOW ON PURPOSE (rate 9, which reaches only ~69 %
 *     of a 0.20 s lane change). The figure slides across the frame and the
 *     frame catches up afterwards. Track a lane change perfectly and it looks
 *     like *the world* moved sideways, which reads as nothing at all.
 *  2. THE VERTICAL FOLLOW IS SLOWER STILL (rate 5), so a jump lifts the figure
 *     WITHIN the frame. A camera that tracks a jump perfectly makes the jump
 *     invisible. This is the most common single mistake in runner cameras.
 *  3. THERE IS NO Z FOLLOW, EVER. A camera that lags on the forward axis
 *     changes how far ahead you can see, which makes difficulty a function of
 *     frame timing. The camera sits a fixed distance behind and that is that.
 *
 * WRONG TURNS, SO THEY ARE NOT RETAKEN
 *
 *  · Rotational shake. It looks spectacular in a clip and it destroys lane
 *    readability, and lane readability is the entire game. Shake is POSITION
 *    ONLY, 0.28 u at 18 Hz with a 0.35 s half-life, and a punch never exceeds
 *    0.15 u for 0.25 s.
 *  · Speed lines drawn radially from the centre of the screen. That is the
 *    tell of a runner that does not know where its own horizon is: the camera
 *    is pitched down and lags laterally, so the track's vanishing point is not
 *    the middle of the frame. The streaks here are aimed at the projected
 *    vanishing point, recomputed every frame.
 *  · Locking the vertical FOV. Phones are tall. A vertical FOV that reads
 *    beautifully on a laptop shows two thirds of the useful track on the
 *    device most people will open this on. The target is HORIZONTAL and is
 *    converted by aspect on every resize.
 *  · A scrolled ground texture. See props.ts — it is a treadmill and it
 *    strobes. The bed is real geometry in a ring buffer.
 *  · Rebasing by moving the world. `originZ` steps in 512-unit jumps and the
 *    only thing that carries the offset is the figure's rig; everything else
 *    is written in rebased coordinates in the first place, so no instance
 *    matrix ever holds a number large enough to lose a centimetre to float32.
 *
 * The scene never writes to `SimState` and never imports track.ts or sim.ts as
 * values — `import type` only, which is what keeps the renderer out of the
 * simulation's dependency graph and the simulation loadable in Node.
 */

import * as THREE from 'three'
import { PALETTE, clamp, rand, reducedMotion } from '../core/contract'
import {
  TILE,
  backdrop,
  disposeProps,
  entityGeometry,
  entityMaterial,
  entityRim,
  entityRimColour,
  flame,
  glowMaterial,
  guard,
  POLE_PITCH,
  pickupCoreGeometry,
  pickupGeometry,
  pickupMaterial,
  railTile,
  rimMaterial,
  stars,
  tunnelRing,
} from './props'
import type { EntityKind, PowerKind, TrackEntity } from './track'
import type { DeathCause, SimState } from './sim'

/* ------------------------------------------------------------------ *
 * §D.9 — the camera and the juice. This block is owned here.
 * ------------------------------------------------------------------ */

/** how far behind the figure the camera sits, at V0 and at VMAX */
export const CAM_BACK_NEAR = 6.2
export const CAM_BACK_FAR = 8.0
/** …and how high. The pull-back and the lift are what make acceleration
 *  legible once the legs cannot get any faster. */
export const CAM_UP_NEAR = 3.1
export const CAM_UP_FAR = 3.6
/** the look point sits AHEAD of the figure: the obstacle you are about to hit
 *  belongs in the middle of the frame, not the character. */
export const LOOK_AHEAD = 4.5
export const LOOK_Y = 1.35
/** horizontal FOV, converted by aspect. Matches parkour's 70 → 78 closely
 *  enough that the two minigames feel like the same lens. */
export const FOV_NEAR = 68
export const FOV_FAR = 78
/** the ceiling on the VERTICAL field, for portrait. See `applyFov`. */
export const FOV_V_MAX = 88
/** the gear kick: +5° in 0.25 s, back over 0.60 s, fourteen times a run */
export const FOV_GEAR = 5
export const FOV_STUMBLE = 4
/** see the header. Lateral faster than vertical, and neither of them perfect. */
export const FOLLOW_X_RATE = 9
export const FOLLOW_Y_RATE = 5
/** on a 2.20 roof the camera climbs 1.60 of it and looks further down, which
 *  is what lets you see the end of the carriage coming. */
export const ROOF_LIFT = 1.6
export const ROOF_REF = 2.2
export const ROOF_RATE = 3.0
/** deliberately slower coming down than going up: a camera that falls as fast
 *  as you do makes the fall invisible. 0.50 s. */
export const ROOF_FALL_RATE = 2.0
export const ROOF_PITCH = (-14 * Math.PI) / 180
export const BANK = (-3.2 * Math.PI) / 180
/** the lateral speed the bank is measured against — the smoothstep's peak */
export const BANK_REF = 22.5
export const SHAKE_AMP = 0.28
export const SHAKE_HZ = 18
export const SHAKE_HALF_LIFE = 0.35
export const PUNCH_AMP = 0.15
export const PUNCH_TIME = 0.25
/** §D.8. A HARD CONSTRAINT ON THE ART, asserted by tools/surf-check.mjs: above
 *  0.013 a fence at 48 u is not legible and VMAX is a lie. */
export const FOG_DENSITY = 0.011
/** speed lines start here */
export const STREAK_FROM = 15
/** a passing mote of dust is this long per unit of speed: 0.54 u at V0,
 *  1.17 u at VMAX. They pass the camera, so they read as the world moving —
 *  a truer speed cue than anything drawn in screen space. */
export const DUST_LEN_K = 0.045

/* ------------------------------------------------------------------ *
 * Restated from track.ts (§D.2/§D.3)
 *
 * The scene may only `import type` from track.ts — see the §B import DAG — so
 * the three numbers it needs to interpolate the rig against speed are written
 * out here. They are read-only decoration: nothing in this file feeds back
 * into the simulation, and if they drift from track.ts the camera pulls back a
 * little early and nothing else happens.
 * ------------------------------------------------------------------ */
const V0 = 12.0
const VMAX = 26.0

/** the rebase step. See the header. */
const REBASE = 512

/** how much bed is kept alive behind and ahead of the camera */
const BED_BEHIND = 40
const BED_AHEAD = 132
const BED_TILES = Math.ceil((BED_BEHIND + BED_AHEAD) / TILE)

/** per-kind instance capacity. WRITE_AHEAD is 96 u and DESPAWN_BEHIND 32, so
 *  128 units of track are live; 96 of any one kind is several times the worst
 *  case and the cost of an unused instance slot is one matrix. */
const CAP_DEFAULT = 96
const CAP: Partial<Record<EntityKind, number>> = { mote: 512, service: 4, crate: 8 }

const PICKUP_POOL = 4
const LETTER_POOL = 6
const BURSTS = 20
const DUST = 128
const STREAKS = 20

const POWERS: readonly PowerKind[] = ['flare', 'tally', 'boots', 'updraft', 'handcar']

/** the kinds drawn through an InstancedMesh. `bridge` is never drawn at all —
 *  it is an invisible collider in a coupling seam — and `pickup`/`letter` need
 *  a model or a texture per instance, so they come out of a small pool. */
const INSTANCED: readonly EntityKind[] = [
  'fence',
  'stack',
  'arch',
  'gantry',
  'box',
  'flatbed',
  'carriage',
  'coach',
  'ramp',
  'pylon',
  'beam',
  'service',
  'crate',
  'mote',
]
/** the ones whose position or `taken` flag can change without anybody telling
 *  us, so their matrices are rewritten every frame rather than on commit */
const VOLATILE = new Set<EntityKind>(['mote', 'crate', 'service'])

/** `1 - exp(-rate·dt)`, the only smoothing in the house. Never `min(1, dt·r)`:
 *  that one is frame-rate dependent and it is a different camera at 144 Hz. */
const approach = (dt: number, rate: number) => 1 - Math.exp(-rate * dt)

/* ------------------------------------------------------------------ *
 * The interface
 * ------------------------------------------------------------------ */

export interface SimSnapshot {
  x: number
  y: number
  z: number
  guardGap: number
  k: number
  readonly state: SimState
}

export interface SurfScene {
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly lanternAt: THREE.Vector3
  add(o: THREE.Object3D): void
  commit(entities: readonly TrackEntity[]): void
  release(entities: readonly TrackEntity[]): void
  /* §C.5 also declared `pop(entity)`, and it is GONE — deliberately, and it
     should not come back. No `SimEvent` variant carries the entity that was
     consumed, so surf.ts could never name the mote to pop; it was an interface
     method with no reachable caller from the day it was written. The scene
     spots its own pops off `TrackEntity.taken`, which §C.2 documents as the
     flag for exactly this, and fires the burst there. Re-adding `pop` means
     first adding an entity reference to `SimEvent`, and then two things pop
     each mote. */
  update(dt: number, snap: SimSnapshot): void
  death(t: number, cause: DeathCause): void
  resize(w: number, h: number): void
  reset(): void
  dispose(): void
}

/* ------------------------------------------------------------------ *
 * Small textures the scene cuts for itself
 * ------------------------------------------------------------------ */

/** a soft round falloff — the guard's thrown shadow and the burst quads */
function blobTexture(hard: number): THREE.CanvasTexture {
  const S = 64
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const c = cv.getContext('2d')!
  const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(hard, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  c.fillStyle = g
  c.fillRect(0, 0, S, S)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** the reduced-motion vignette: what the speed lines become when motion is
 *  not wanted. A static 40 % darkening of the frame edge, which still says
 *  "fast" and never moves. */
function vignetteTexture(): THREE.CanvasTexture {
  const S = 128
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const c = cv.getContext('2d')!
  const g = c.createRadialGradient(S / 2, S / 2, S * 0.22, S / 2, S / 2, S * 0.62)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,1)')
  c.fillStyle = g
  c.fillRect(0, 0, S, S)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const glyphs = new Map<string, THREE.CanvasTexture>()
function glyphTexture(ch: string): THREE.CanvasTexture {
  const cached = glyphs.get(ch)
  if (cached) return cached
  const S = 128
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const c = cv.getContext('2d')!
  c.clearRect(0, 0, S, S)
  c.fillStyle = PALETTE.buffCss
  c.font = `600 ${Math.round(S * 0.72)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif`
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillText(ch, S / 2, S * 0.54)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  glyphs.set(ch, t)
  return t
}

/* ------------------------------------------------------------------ *
 * Per-kind instancing
 * ------------------------------------------------------------------ */

interface KindSlot {
  kind: EntityKind
  mesh: THREE.InstancedMesh
  /** the merged amber outline, rebuilt in place whenever the live set changes */
  rim: THREE.LineSegments | null
  rimProto: Float32Array | null
  rimVerts: number
  live: TrackEntity[]
  dirty: boolean
}

interface PoolSlot<T extends THREE.Object3D> {
  obj: T
  entity: TrackEntity | null
}

export function createSurfScene(): SurfScene {
  const scene = new THREE.Scene()

  /* The sky is authored as what the fog LOOKS LIKE after the tone curve, not
     as the fog's own colour. Author them the same and the horizon grows a
     visible seam the moment ACES compresses one of them and not the other. */
  const SKY = 0x16272e
  const FOG = 0x13242a
  scene.background = new THREE.Color(SKY)
  const fog = new THREE.FogExp2(FOG, FOG_DENSITY)
  scene.fog = fog

  const camera = new THREE.PerspectiveCamera(FOV_NEAR, 1, 0.1, 400)
  scene.add(camera)

  const owned: Array<{ dispose(): void }> = []
  let aspect = 1

  /* ---- lights ---- *
     The parkour's rig at the parkour's strengths. Out in the field the dark IS
     the concept and things resolve as you walk up to them; in here you have to
     read a lane at 48 u before you can choose it, so the sky term carries the
     faces, the rim carries the edges, and the lantern makes the thing you are
     next to feel close. */
  const hemi = new THREE.HemisphereLight(0x3a5c69, 0x111f24, 4.2)
  scene.add(hemi)
  const fill = new THREE.AmbientLight(PALETTE.horizon, 1.6)
  scene.add(fill)
  const moon = new THREE.DirectionalLight(0xa8c0d6, 1.1)
  moon.position.set(-40, 70, 30)
  scene.add(moon)

  /* ---- the camera-side fill ---- *
     THE YARD IS UNREADABLE WITHOUT THIS, and the reason is geometric rather
     than artistic. You run towards +Z, so the camera sits at -Z and every face
     of every obstacle you are ever asked to read is a face whose normal points
     at -Z. The moon is at +Z, high and to the left, which is a lovely angle
     for the rails and the wrong side of every single hazard: the hemisphere's
     equator term is all those faces got, and it is nearly nothing.
     Measured off a real frame before this light existed: an iron gantry
     twenty units out came back #0d0d0b against a #16272e sky. Not "dark" —
     DARKER THAN THE SKY, and a shape darker than the sky is not an object,
     it is a hole punched in the picture. You cannot judge the height of a
     hole, and the height is the whole question.
     So: one more directional, from over the camera's shoulder, cool and well
     under the moon so it fills without flattening. It is a fill and not a key
     — turn it up and the tops and the fronts match, the modelling goes, and
     the yard is card scenery again. Directional and not a point, so it does
     not fall off: a piece at 48 u must read as well as a piece at 8 u, which
     is the assumption the entire difficulty ramp is derived from. */
  const faceFill = new THREE.DirectionalLight(0x7d9fb2, 1.7)
  faceFill.position.set(7, 24, -44)
  scene.add(faceFill)

  /**
   * The lamp the figure carries. Modest — at three times this it stops being a
   * lantern and becomes a gold wash over the whole yard, with the level
   * contributing less colour than the light.
   *
   * A NOTE ON A WRONG FIX, SO NOBODY TRIES IT AGAIN: to stop this light
   * bleaching the figure that carries it, do NOT put the light on its own
   * layer. three.js tests `object.layers` against **the camera's** layers and
   * never against a light's, so a light on a layer the camera does not render
   * is not excluded from the figure, it stops existing. runner.ts keeps the
   * figure a silhouette by being made of unlit material instead.
   */
  const lantern = new THREE.PointLight(PALETTE.glow, 15, 26, 1.7)

  /* ---- the rebase rig ---- *
     runner.ts is handed the raw, unbounded `z` and writes it straight onto its
     own object, which is correct: the figure should not have to know that the
     renderer moves the world back half a kilometre at a time. So the figure
     and the lantern hang off this group, whose Z offset is the rebase, and
     everything else in the scene is authored in rebased coordinates directly.
     Nothing then holds a coordinate big enough to lose precision. */
  const rig = new THREE.Group()
  scene.add(rig)

  /* The lamp and its halo are NOT in the rig, and the distinction matters.
     runner.ts derives its `lanternAt` from the flame's `matrixWorld`, which
     has already been through the rig's offset — so that vector is in rebased
     scene space, and anything that consumes it must be too. Put the light in
     the rig and the offset is applied twice, which parks it half a kilometre
     behind the yard and leaves you running in the dark. */
  scene.add(lantern)
  const lanternFlame = flame()
  scene.add(lanternFlame)

  let originZ = 0

  /* ---- the rail bed ---- *
     FOUR TILES, INSTANCED, AND THE COUNT IS THE WHOLE DESIGN. A tile is three
     meshes — ballast, sleepers, rails — because it is three materials, so one
     THREE.Group per tile is three draw calls, and the forty-three tiles it
     takes to cover the visible track is a hundred and thirty draw calls spent
     on gravel. That is a quarter of a frame on a mid-range phone before a
     single carriage is drawn.

     So: four DIFFERENT tiles, each with its own sleeper jitter, each drawn as
     an InstancedMesh. Twelve draw calls for the entire bed. A tile's variant
     is `index mod 4`, fixed in world space, so nothing ever pops as it comes
     into range — and the sleeper sequence runs twelve distinct offsets before
     it repeats, which is more than enough to break up the 18.6 Hz strobe the
     jitter exists for. The repeat itself lands at 1.6 Hz, which is a rhythm
     rather than a flicker, and a rhythm is what a railway is. */
  const BED_VARIANTS = 4
  /* A deterministic stream, because src/surf may not call Math.random and the
     scene may not import rng.ts. contract's `rand(i)` is an index hash, which
     is exactly right for decorating a mesh and wrong for anything else. */
  let jitterSeed = 0
  const jitter = () => rand(++jitterSeed * 3 + 11)
  const bedCap = Math.ceil(BED_TILES / BED_VARIANTS) + 2
  const bedMeshes: THREE.InstancedMesh[][] = []
  for (let v = 0; v < BED_VARIANTS; v++) {
    const proto = railTile(jitter)
    const per: THREE.InstancedMesh[] = []
    for (const child of proto.children) {
      const m = child as THREE.Mesh
      const im = new THREE.InstancedMesh(m.geometry, m.material as THREE.Material, bedCap)
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      im.frustumCulled = false
      im.count = 0
      scene.add(im)
      per.push(im)
    }
    // the prototype Group is thrown away; its geometries live on inside the
    // instanced meshes and are freed by disposeProps() with everything else
    bedMeshes.push(per)
  }

  /* the far scenery and the star dome. The buildings ride with the runner so
     they never arrive; the poles wrap on their own pitch, which is where all
     the horizon's motion comes from. */
  const far = backdrop()
  scene.add(far)
  const farBuildings = far.getObjectByName('far')
  const farPoles = far.getObjectByName('poles')
  const sky = stars()
  scene.add(sky)
  owned.push(sky.geometry, sky.material as THREE.Material)

  /* Tunnel mouths. Pure scenery on a fixed 640-unit march — the generator has
     no tunnel entity and the scene decides nothing about the track, so these
     are placed by arithmetic on Z and are wide enough that no lane could ever
     touch one. They exist because a yard that is all open sky for four minutes
     has no landmarks in it. */
  const TUNNEL_EVERY = 640
  const tunnels = [tunnelRing(), tunnelRing()]
  for (const t of tunnels) scene.add(t)

  /* ---- one instanced mesh per kind ---- */
  const kinds = new Map<EntityKind, KindSlot>()
  const _m = new THREE.Matrix4()
  const _q = new THREE.Quaternion()
  const _p = new THREE.Vector3()
  const _s = new THREE.Vector3(1, 1, 1)
  const UP = new THREE.Vector3(0, 1, 0)

  for (const kind of INSTANCED) {
    const geo = entityGeometry(kind)
    const cap = CAP[kind] ?? CAP_DEFAULT
    const mesh = new THREE.InstancedMesh(geo, entityMaterial(kind), cap)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // the instances are strewn over 128 units of track; culling the mesh as
    // one bounding sphere throws the whole track away as you turn into a bend
    mesh.frustumCulled = false
    mesh.count = 0
    mesh.visible = false
    scene.add(mesh)

    const proto = entityRim(kind)
    let rim: THREE.LineSegments | null = null
    let rimProto: Float32Array | null = null
    let rimVerts = 0
    if (proto) {
      const src = proto.attributes.position as THREE.BufferAttribute
      rimVerts = src.count
      rimProto = new Float32Array(src.array as ArrayLike<number>)
      const geoR = new THREE.BufferGeometry()
      geoR.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * rimVerts * 3), 3))
      geoR.setDrawRange(0, 0)
      rim = new THREE.LineSegments(geoR, rimMaterial(entityRimColour(kind)))
      rim.frustumCulled = false
      rim.visible = false
      scene.add(rim)
      owned.push(geoR)
    }
    kinds.set(kind, { kind, mesh, rim, rimProto, rimVerts, live: [], dirty: false })
  }

  /* ---- the pooled kinds ---- */

  /** every powerup model, prebuilt; one child of each pool entry is shown */
  const pickupPool: Array<PoolSlot<THREE.Group>> = []
  for (let i = 0; i < PICKUP_POOL; i++) {
    const g = new THREE.Group()
    for (const power of POWERS) {
      const holder = new THREE.Group()
      holder.name = power
      holder.visible = false
      holder.add(new THREE.Mesh(pickupGeometry(power), pickupMaterial()))
      const core = new THREE.Mesh(pickupCoreGeometry(power), glowMaterial(PALETTE.glow, 0.16))
      holder.add(core)
      g.add(holder)
    }
    g.visible = false
    scene.add(g)
    pickupPool.push({ obj: g, entity: null })
  }

  const letterGeo = new THREE.PlaneGeometry(0.9, 0.9)
  owned.push(letterGeo)
  const letterPool: Array<PoolSlot<THREE.Mesh>> = []
  for (let i = 0; i < LETTER_POOL; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: PALETTE.buff,
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
    const m = new THREE.Mesh(letterGeo, mat)
    m.visible = false
    scene.add(m)
    owned.push(mat)
    letterPool.push({ obj: m, entity: null })
  }

  /* ---- pops ---- *
     A collected mote leaves something behind. Twenty additive quads, recycled,
     because the reward for a collectable has to be visible in the two frames
     you are still looking at where it was. */
  const burstGeo = new THREE.PlaneGeometry(1, 1)
  const burstTex = blobTexture(0.45)
  owned.push(burstGeo, burstTex)
  const burstMat = new THREE.MeshBasicMaterial({
    map: burstTex,
    color: PALETTE.amberLit,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  })
  owned.push(burstMat)
  const bursts: Array<{ mesh: THREE.Mesh; life: number }> = []
  for (let i = 0; i < BURSTS; i++) {
    const mesh = new THREE.Mesh(burstGeo, burstMat.clone())
    mesh.visible = false
    scene.add(mesh)
    owned.push(mesh.material as THREE.Material)
    bursts.push({ mesh, life: 0 })
  }
  let burstNext = 0
  /** motes already seen taken, so a pop fires once and only once */
  const popped = new Set<TrackEntity>()

  /* ---- the dust ---- *
     Motes of lantern-light hanging in the yard air. They are WORLD space, not
     screen space: you pass them, so they carry the sensation of the world
     moving rather than of a filter over it. */
  const dustGeo = new THREE.BufferGeometry()
  const dustPos = new Float32Array(DUST * 6)
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
  const dustMat = new THREE.LineBasicMaterial({
    color: PALETTE.glow,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
    toneMapped: true,
  })
  const dust = new THREE.LineSegments(dustGeo, dustMat)
  dust.frustumCulled = false
  scene.add(dust)
  owned.push(dustGeo, dustMat)
  /** x, y, z per mote; z is rebased scene space */
  const dustAt = new Float32Array(DUST * 3)
  /** how many times each has wrapped — it goes into the hash, or every mote
   *  comes back to the same place it was and the dust reads as a tunnel */
  const dustWrap = new Int32Array(DUST)
  let dustReady = false

  /* ---- the speed lines ---- *
     Camera-attached, at one unit in front of the lens, aimed at the projected
     vanishing point of the track. See the header for why not radial. */
  const streakGeo = new THREE.BufferGeometry()
  const streakPos = new Float32Array(STREAKS * 6)
  streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3))
  const streakMat = new THREE.LineBasicMaterial({
    color: PALETTE.buff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  })
  const streaks = new THREE.LineSegments(streakGeo, streakMat)
  streaks.frustumCulled = false
  streaks.renderOrder = 10
  streaks.position.z = -1
  camera.add(streaks)
  owned.push(streakGeo, streakMat)

  const vigTex = vignetteTexture()
  const vigMat = new THREE.MeshBasicMaterial({
    map: vigTex,
    color: PALETTE.night,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  })
  const vignette = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), vigMat)
  vignette.position.z = -0.9
  vignette.renderOrder = 11
  vignette.visible = false
  camera.add(vignette)
  owned.push(vigTex, vigMat, vignette.geometry)

  /* ---- the guard ---- */
  const guardFig = guard()
  guardFig.visible = false
  scene.add(guardFig)
  const guardLamp = guardFig.getObjectByName('lamp')
  const shadowTex = blobTexture(0.3)
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    color: PALETTE.night,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: true,
    toneMapped: true,
  })
  /* THE ONLY READOUT THE GUARD HAS. There is no health bar and no HUD element
     for heat: as he closes, his lantern throws your shadow forward onto the
     track ahead of you, and that stretched shape arriving under your feet is
     the whole of "he is nearly on you". There is no shadow map on this
     renderer and there must not be one — this is a quad. */
  const thrown = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 5.5), shadowMat)
  thrown.rotation.x = -Math.PI / 2
  thrown.visible = false
  scene.add(thrown)
  owned.push(shadowTex, shadowMat, thrown.geometry)

  /* ---- the service's headlight ---- *
     Its own material rather than the shared cached one: it pulses, and the
     glow cache is keyed on colour and opacity, so animating a cached material
     would quietly animate everything else that asked for the same pair. */
  const headMat = glowMaterial(PALETTE.buff, 0.5).clone()
  owned.push(headMat)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), headMat)
  head.visible = false
  scene.add(head)
  owned.push(head.geometry)

  /* ------------------------------------------------------------------ *
   * Rig state — every one of these is eased, none of them per-frame lerped
   * ------------------------------------------------------------------ */
  const lanternAt = new THREE.Vector3()
  let age = 0
  let followX = 0
  let followAir = 0
  let roofEase = 0
  let fovNow = FOV_NEAR
  let fovKick = 0
  let shake = 0
  let punch = 0
  let bankNow = 0
  let deathT = -1
  let deathCause: DeathCause = 'headOn'

  const _look = new THREE.Vector3()
  const _dir = new THREE.Vector3()
  const _qi = new THREE.Quaternion()
  /** the fog's two colours, kept as objects so the death lift allocates none */
  const fogBase = new THREE.Color(FOG)
  const fogLift = new THREE.Color(FOG).lerp(new THREE.Color(SKY), 0.08)

  /** horizontal target → the vertical FOV three.js actually wants */
  function applyFov(fovH: number): void {
    const v = 2 * Math.atan(Math.tan((fovH * Math.PI) / 360) / Math.max(0.35, aspect))
    /* AND THEN CAPPED, because holding the horizontal constant is only right
       down to about square. A phone is 1125×2436 — aspect 0.46 — and 68°
       across converts to ONE HUNDRED AND ELEVEN DEGREES down. Measured off a
       real portrait frame: the horizon sat 42 % down the screen, everything
       above it was empty sky, the runner was a thumbnail at the bottom and the
       lane you had to read was a few dozen pixels of a wildly distorted
       perspective. Half the people who play this are on a phone.
       88 is the number because the constraint is horizontal, not vertical:
       three lanes are 9 u wide and have to fit, and at this aspect 88 down
       still buys 48 across, which holds them with room at the edges. Cap it
       tighter and the outside lanes leave the frame, which is worse than sky.
       Wide screens never reach the cap — 16:10 converts to 46 — so this
       changes nothing on a desktop. */
    const deg = Math.min((v * 180) / Math.PI, FOV_V_MAX)
    if (Math.abs(camera.fov - deg) > 0.02) {
      camera.fov = deg
      camera.updateProjectionMatrix()
    }
  }

  /* ------------------------------------------------------------------ *
   * Instance bookkeeping
   * ------------------------------------------------------------------ */

  /**
   * The surface an entity's art stands on.
   *
   * Every prototype in props.ts has its origin at the centre of its footprint
   * on whatever it is bolted to, which for a roof-mounted pylon is the roof —
   * `y0` is then 1.05 above that roof, and the art must come down by exactly
   * that much or a barrier floats three feet over the carriage.
   */
  function baseY(e: TrackEntity): number {
    if (e.kind === 'pylon') return e.y0 - 1.05
    if (e.collect) return (e.y0 + e.y1) / 2
    return 0
  }

  function writeSlot(slot: KindSlot): void {
    const { mesh, live } = slot
    const cap = CAP[slot.kind] ?? CAP_DEFAULT
    let n = 0
    const spin = slot.kind === 'mote' || slot.kind === 'crate'
    for (let i = 0; i < live.length && n < cap; i++) {
      const e = live[i]!
      if (e.taken) continue
      const z = (e.z0 + e.z1) / 2 - originZ
      _p.set(e.x, baseY(e), z)
      if (spin) {
        // a mote turning slowly is the difference between a light and a dot,
        // and the phase is keyed off its id so two neighbours never pulse in
        // step and read as one object
        _q.setFromAxisAngle(UP, age * 1.6 + e.id * 0.7)
        _p.y += Math.sin(age * 2.2 + e.id) * 0.06
      } else {
        _q.identity()
      }
      _m.compose(_p, _q, _s)
      mesh.setMatrixAt(n, _m)

      if (slot.rimProto && slot.rim) {
        const dst = (slot.rim.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array
        const off = n * slot.rimVerts * 3
        for (let v = 0; v < slot.rimVerts; v++) {
          dst[off + v * 3] = slot.rimProto[v * 3]! + _p.x
          dst[off + v * 3 + 1] = slot.rimProto[v * 3 + 1]! + _p.y
          dst[off + v * 3 + 2] = slot.rimProto[v * 3 + 2]! + _p.z
        }
      }
      n++
    }
    mesh.count = n
    mesh.visible = n > 0
    mesh.instanceMatrix.needsUpdate = true
    if (slot.rim) {
      slot.rim.geometry.setDrawRange(0, n * slot.rimVerts)
      ;(slot.rim.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
      slot.rim.visible = n > 0
    }
    slot.dirty = false
  }

  function poolFor(e: TrackEntity): PoolSlot<THREE.Object3D> | null {
    const pool: Array<PoolSlot<THREE.Object3D>> =
      e.kind === 'pickup' ? pickupPool : e.kind === 'letter' ? letterPool : []
    for (const s of pool) if (!s.entity) return s
    // no slot free. Drawing nothing is the right failure: drawing the wrong
    // model at the right place is a promise the simulation will not keep.
    return null
  }

  function assignPool(e: TrackEntity): void {
    const slot = poolFor(e)
    if (!slot) return
    slot.entity = e
    slot.obj.visible = true
    if (e.kind === 'pickup') {
      const g = slot.obj as THREE.Group
      for (const child of g.children) child.visible = child.name === (e.power ?? 'flare')
    } else {
      const m = slot.obj as THREE.Mesh
      const mat = m.material as THREE.MeshBasicMaterial
      mat.map = glyphTexture(e.glyph ?? '?')
      mat.needsUpdate = true
    }
  }

  function freePool(e: TrackEntity): void {
    for (const pool of [pickupPool, letterPool]) {
      for (const s of pool as Array<PoolSlot<THREE.Object3D>>) {
        if (s.entity === e) {
          s.entity = null
          s.obj.visible = false
        }
      }
    }
  }

  function fireBurst(x: number, y: number, z: number): void {
    const b = bursts[burstNext % BURSTS]!
    burstNext++
    b.mesh.position.set(x, y, z)
    b.mesh.visible = true
    b.life = 1
  }

  /* ------------------------------------------------------------------ *
   * The frame
   * ------------------------------------------------------------------ */

  const bedCounts = new Int32Array(BED_VARIANTS)

  function updateBed(camZ: number): void {
    const first = Math.floor((camZ - BED_BEHIND) / TILE)
    bedCounts.fill(0)
    for (let i = 0; i < BED_TILES; i++) {
      const idx = first + i
      // the variant is a property of the PLACE, not of the slot: a tile that
      // scrolls off the back and comes round again must be the same tile it
      // was, or the bed reshuffles itself under you every four seconds
      const v = ((idx % BED_VARIANTS) + BED_VARIANTS) % BED_VARIANTS
      const n = bedCounts[v]!
      if (n >= bedCap) continue
      bedCounts[v] = n + 1
      _m.makeTranslation(0, 0, idx * TILE - originZ)
      for (const im of bedMeshes[v]!) im.setMatrixAt(n, _m)
    }
    for (let v = 0; v < BED_VARIANTS; v++) {
      for (const im of bedMeshes[v]!) {
        im.count = bedCounts[v]!
        im.instanceMatrix.needsUpdate = true
      }
    }
  }

  function updateTunnels(camZRaw: number): void {
    const n = Math.floor(camZRaw / TUNNEL_EVERY)
    for (let i = 0; i < tunnels.length; i++) {
      tunnels[i]!.position.z = (n + i) * TUNNEL_EVERY - originZ
    }
  }

  function updateDust(camZ: number, camX: number, speed: number): void {
    const reduced = reducedMotion()
    const count = reduced ? DUST / 2 : DUST
    const len = reduced ? 0.35 : speed * DUST_LEN_K
    dustMat.opacity = reduced ? 0.14 : 0.22
    for (let i = 0; i < DUST; i++) {
      if (i >= count) {
        // parked behind the camera rather than deleted: the buffer is a fixed
        // size and a degenerate segment costs nothing
        dustPos[i * 6 + 2] = dustPos[i * 6 + 5] = camZ - 100
        continue
      }
      let x = dustAt[i * 3]!
      let y = dustAt[i * 3 + 1]!
      let z = dustAt[i * 3 + 2]!
      if (!dustReady || z < camZ - 8 || z > camZ + 70) {
        const h = i * 13 + dustWrap[i]! * 977 + 5
        x = camX + (rand(h) - 0.5) * 26
        y = 0.2 + rand(h * 3 + 9) * 8
        z = camZ + 4 + rand(h * 7 + 3) * 46
        dustWrap[i]!++
        dustAt[i * 3] = x
        dustAt[i * 3 + 1] = y
        dustAt[i * 3 + 2] = z
      }
      dustPos[i * 6] = x
      dustPos[i * 6 + 1] = y
      dustPos[i * 6 + 2] = z
      dustPos[i * 6 + 3] = x
      dustPos[i * 6 + 4] = y
      dustPos[i * 6 + 5] = z + len
    }
    dustReady = true
    ;(dustGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true
  }

  function updateStreaks(speed: number): void {
    if (reducedMotion()) {
      streaks.visible = false
      vignette.visible = true
      // sized to the frustum at the plane it sits on, with a little over so
      // there is never a lit edge between it and the corner of the frame
      const h = 2 * Math.tan((camera.fov * Math.PI) / 360) * 0.9 * 1.06
      vignette.scale.set(h * aspect, h, 1)
      return
    }
    vignette.visible = false
    const k = clamp((speed - STREAK_FROM) / (VMAX - STREAK_FROM))
    if (k <= 0.001) {
      streaks.visible = false
      return
    }
    streaks.visible = true
    streakMat.opacity = k * 0.35
    const n = Math.round(12 + k * (STREAKS - 12))

    // the vanishing point of the track, in the plane one unit in front of the
    // lens. A point at infinity along +Z projects to (d.x, d.y) / -d.z there.
    // Taken from the camera's own rotation rather than from
    // `matrixWorldInverse`, which the renderer has not refreshed yet this
    // frame — one frame of lag on the streak angle is small, and free to not
    // have.
    _qi.copy(camera.quaternion).invert()
    _dir.set(0, 0, 1).applyQuaternion(_qi)
    const vpx = _dir.z < -0.01 ? _dir.x / -_dir.z : 0
    const vpy = _dir.z < -0.01 ? _dir.y / -_dir.z : 0

    const halfH = Math.tan((camera.fov * Math.PI) / 360)
    const halfW = halfH * aspect
    for (let i = 0; i < STREAKS; i++) {
      if (i >= n) {
        streakPos[i * 6] = streakPos[i * 6 + 3] = 0
        streakPos[i * 6 + 1] = streakPos[i * 6 + 4] = 0
        continue
      }
      // scattered in the outer 22 % of the frame, on a phase that walks with
      // age so the same streak never sits in the same place twice
      const t = rand(i * 23 + 7) + age * 0.7
      const a = (t % 1) * Math.PI * 2
      const r = 0.78 + rand(i * 29 + 13) * 0.24
      const px = Math.cos(a) * halfW * r
      const py = Math.sin(a) * halfH * r
      let dx = px - vpx
      let dy = py - vpy
      const m = Math.hypot(dx, dy) || 1
      dx /= m
      dy /= m
      const L = (0.1 + rand(i * 31 + 17) * 0.16) * (0.5 + k)
      streakPos[i * 6] = px
      streakPos[i * 6 + 1] = py
      streakPos[i * 6 + 3] = px + dx * L
      streakPos[i * 6 + 4] = py + dy * L
    }
    ;(streakGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true
  }

  function updateGuard(snap: SimSnapshot): void {
    const st = snap.state
    const gap = snap.guardGap
    // GUARD_FAR is 14 and he is outside the fog there; nothing is gained by
    // drawing him, and a figure fading up out of nothing is more menacing than
    // one that was always there
    const near = clamp((14 - gap) / 12.5)
    if (near <= 0.01) {
      guardFig.visible = false
      thrown.visible = false
      return
    }
    guardFig.visible = true
    guardFig.position.set(followX * 0.7 + snap.x * 0.3, 0, snap.z - gap - originZ)
    // he leans into it as he closes
    guardFig.rotation.x = -0.05 - near * 0.09
    if (guardLamp) {
      const flick = 1 + Math.sin(age * 9.1) * 0.08
      ;(guardLamp as THREE.Mesh).scale.setScalar(0.9 + near * 0.4 * flick)
    }
    // …and the shadow he throws. It reaches further ahead of you the closer he
    // gets, which is why it arrives before he does.
    thrown.visible = true
    const reach = 1.6 + near * 3.4
    thrown.position.set(snap.x, 0.03 + st.groundY, snap.z + reach - originZ)
    thrown.scale.set(1, 0.7 + near * 0.8, 1)
    shadowMat.opacity = near * 0.55 * (st.groundY > 0.1 ? 0.6 : 1)
  }

  function updateHead(camZ: number): void {
    const slot = kinds.get('service')
    head.visible = false
    if (!slot) return
    let best: TrackEntity | null = null
    for (const e of slot.live) {
      const z = e.z0 - originZ
      if (z < camZ - 40) continue
      if (!best || e.z0 < best.z0) best = e
    }
    if (!best) return
    head.visible = true
    // on the cab end, which is the leading face of the rake
    head.position.set(best.x, 2.05, best.z0 - originZ - 0.2)
    const pulse = 0.8 + Math.sin(age * 6.5) * 0.2
    head.scale.setScalar(pulse)
    headMat.opacity = 0.5 * pulse
  }

  function rigCamera(dt: number, snap: SimSnapshot): void {
    const st = snap.state
    const reduced = reducedMotion()
    const speed = st.speed || V0
    const sp = clamp((speed - V0) / (VMAX - V0))

    /* ---- the lateral lag ---- */
    if (reduced) followX = snap.x
    else followX += (snap.x - followX) * approach(dt, FOLLOW_X_RATE)

    /* ---- the roof lift, up faster than down ---- */
    const wantRoof = st.groundY
    roofEase += (wantRoof - roofEase) * approach(dt, wantRoof > roofEase ? ROOF_RATE : ROOF_FALL_RATE)
    const roofK = clamp(roofEase / ROOF_REF)

    /* ---- the vertical lag, measured from whatever you are standing on ---- */
    const air = snap.y - st.groundY
    if (reduced) followAir = air
    else followAir += (air - followAir) * approach(dt, FOLLOW_Y_RATE)

    /* ---- the lens ---- */
    if (st.gear && !reduced) fovKick = FOV_GEAR
    // in 0.25 s, out over 0.60 s — the asymmetry is what makes a gear change
    // feel like a shove rather than a wobble
    fovKick += (0 - fovKick) * approach(dt, 1 / 0.6)
    const stumbleK = st.pose === 'stumble' ? 1 : 0
    let fovWant = FOV_NEAR + (FOV_FAR - FOV_NEAR) * sp + fovKick + FOV_STUMBLE * stumbleK
    if (reduced) fovWant = clamp(fovWant, FOV_NEAR - 3, FOV_NEAR + 3)
    fovNow += (fovWant - fovNow) * approach(dt, 6)

    /* ---- the shake ---- */
    if (!reduced) {
      if (st.justLanded && st.landedOnRoof) shake = Math.max(shake, 0.45)
      if (st.pose === 'stumble' && st.stumbleTicks > 12) shake = 1
      if (st.invuln > 10 && st.pose !== 'dead') punch = Math.max(punch, 1)
    }
    shake *= Math.pow(0.5, dt / SHAKE_HALF_LIFE)
    punch *= Math.pow(0.5, dt / (PUNCH_TIME / 2))

    /* ---- put it together ---- */
    const back = CAM_BACK_NEAR + (CAM_BACK_FAR - CAM_BACK_NEAR) * sp
    const up = CAM_UP_NEAR + (CAM_UP_FAR - CAM_UP_NEAR) * sp

    const camZ = snap.z - originZ
    let cx = followX
    let cy = up + roofK * ROOF_LIFT + followAir * 0.45
    let cz = camZ - back

    if (deathT >= 0) {
      // the death rig takes over the position and the lens entirely; the
      // easing above still runs, so that a revive hands back a camera that is
      // already where the running rig expects it to be
      const d = deathRig(cx, cy, cz, camZ, snap)
      cx = d.x
      cy = d.y
      cz = d.z
    } else if (!reduced) {
      const t = age * SHAKE_HZ * Math.PI * 2
      cx += Math.sin(t) * SHAKE_AMP * shake + Math.sin(t * 0.7) * PUNCH_AMP * punch
      cy += Math.sin(t * 1.13 + 1.7) * SHAKE_AMP * 0.7 * shake
    }

    camera.position.set(cx, cy, cz)

    /* The look point: 4.5 ahead of the figure, at chest height on whatever
       surface it is standing on — and, on a roof, wherever ROOF_PITCH says
       instead. Solved rather than nudged: the height that puts the view at
       −14° is `cy + tan(pitch) · dz`, so the constant in §D.9 is the angle
       you actually get, and it stays the angle you get when the camera pulls
       back with speed. On the ground that same sum comes out around −10°,
       which is the tilt the parkour's third person uses. */
    const dz = back + LOOK_AHEAD
    const flatLook = LOOK_Y + st.groundY
    const lookY =
      deathT >= 0
        ? 1.0 + st.groundY
        : flatLook + (cy + Math.tan(ROOF_PITCH) * dz - flatLook) * roofK
    _look.set(cx, lookY, camZ + (deathT >= 0 ? 0 : LOOK_AHEAD))
    camera.lookAt(_look)

    /* The bank, applied after the look — it is a roll about the view axis and
       it is the ONLY rotation anything is allowed to add to this camera. */
    const wantBank = reduced ? 0 : BANK * clamp(st.lateralV / BANK_REF, -1, 1)
    bankNow += (wantBank - bankNow) * approach(dt, 8)
    camera.rotateZ(bankNow)

    applyFov(fovNow)

    /* The fog draws IN as you speed up, which is the wrong way round until you
       think about it: what you feel as speed is the rate at which things
       emerge from the murk, and pulling the murk closer raises that rate
       without touching a single velocity. Capped so it can never cross the
       0.013 the reaction budget is derived from. */
    fog.density = FOG_DENSITY * (1 + 0.16 * sp)
  }

  /** the shot after the contact. §D.10, beat for beat. */
  function deathRig(
    cx: number,
    cy: number,
    cz: number,
    camZ: number,
    snap: SimSnapshot,
  ): { x: number; y: number; z: number } {
    const t = deathT
    const reduced = reducedMotion()
    // how far the camera has gone from the running rig to the eye-level shot
    const k = reduced ? 1 : clamp((t - 0.09) / 0.2)
    /* Which way the camera swings is which way you got it wrong, and that is
       the only question a player has in the second after a death. */
    const yaw =
      deathCause === 'sideLeft'
        ? 0.65
        : deathCause === 'sideRight'
          ? -0.65
          : deathCause === 'caught'
            ? 1.15
            : deathCause === 'service'
              ? -0.9
              : 0
    const back = 5.4 - k * 1.4
    const a = yaw * k
    // orbit the body rather than sliding: the swing has to read as the camera
    // going round to look at what hit you, not as a pan
    const x = snap.x + Math.sin(a) * back + (cx - snap.x) * (1 - k)
    /* THE DROP IS THE POINT. 3.1 → 1.1 turns an abstract failure into
       something that happened to a person standing on some gravel. */
    const y = cy + (1.1 - cy) * k
    const z = camZ - Math.cos(a) * back + (cz - (camZ - back)) * (1 - k)
    // …and the lens closes as it drops, 78 → 62. Written as a function of k
    // and not as a per-frame ease, so the shot is the same length at 30 fps.
    if (!reduced) fovNow = fovNow * (1 - k) + 62 * k
    return { x, y, z }
  }

  /* ------------------------------------------------------------------ *
   * The object
   * ------------------------------------------------------------------ */

  const api: SurfScene = {
    scene,
    camera,
    lanternAt,

    add(o) {
      // into the rebase rig: runner.ts writes the raw, unbounded z onto its
      // own object and must never have to know the renderer moves the world
      rig.add(o)
    },

    commit(entities) {
      for (const e of entities) {
        if (e.kind === 'bridge') continue
        if (e.kind === 'pickup' || e.kind === 'letter') {
          assignPool(e)
          continue
        }
        const slot = kinds.get(e.kind)
        if (!slot) continue
        if (slot.live.indexOf(e) >= 0) continue
        slot.live.push(e)
        slot.dirty = true
      }
    },

    release(entities) {
      for (const e of entities) {
        if (e.kind === 'pickup' || e.kind === 'letter') {
          freePool(e)
          popped.delete(e)
          continue
        }
        const slot = kinds.get(e.kind)
        if (!slot) continue
        const i = slot.live.indexOf(e)
        if (i >= 0) {
          slot.live.splice(i, 1)
          slot.dirty = true
        }
        popped.delete(e)
      }
    },

    update(dt, snap) {
      age += dt

      /* ---- the rebase ---- *
         In 512-unit steps, so the shift is always exactly representable and
         nothing accumulates. Every instance matrix is written in rebased
         coordinates, so a rebase is a full rewrite — twice a run, at about
         four hundred matrices, which is nothing. */
      while (snap.z - originZ > REBASE) {
        originZ += REBASE
        for (const slot of kinds.values()) slot.dirty = true
        for (let i = 0; i < DUST; i++) dustAt[i * 3 + 2]! -= REBASE
        for (const b of bursts) b.mesh.position.z -= REBASE
      }
      rig.position.z = -originZ

      const camZ = snap.z - originZ
      const st = snap.state

      /* A REVIVE DOES NOT CALL reset(). surf.ts rewinds the simulation twenty
         units and hands the controls back without rebuilding anything, so if
         the death shot were only ever cleared by reset() the camera would stay
         down at eye level, swung round, for the rest of the run. The phase is
         the authority: the moment it is running again, so is the rig. */
      if (deathT >= 0 && (st.phase === 'running' || st.phase === 'intro')) deathT = -1

      /* ---- the lantern ---- *
         runner.ts owns where the lamp hangs and writes it into its own
         `lanternAt`, in REBASED SCENE SPACE (it reads a matrixWorld, and the
         rig has already been applied by then); whoever owns the frame loop
         copies that vector into this one. If nothing ever has, we hang the
         light off the figure ourselves rather than leaving it at the origin —
         a lantern that stays behind at z = 0 is not a subtle bug, it is a
         completely unlit game, and it should not depend on a copy in a third
         file to not happen. */
      const wrote = lanternAt.lengthSq() > 0
      const lx = wrote ? lanternAt.x : snap.x - 0.34
      const ly = wrote ? lanternAt.y : snap.y + 1.15
      const lz = wrote ? lanternAt.z : camZ + 0.1
      lantern.position.set(lx, ly, lz)
      lanternFlame.position.set(lx, ly, lz)
      /* The camera's position is already in rebased scene space and the flame
         hangs off the rig, which carries the rebase — `lookAt` resolves the
         target through the parent for us, so it takes the camera's own vector
         and nothing else. Subtracting originZ here again was a bug: it aimed
         the flame at a point half a kilometre behind the yard. */
      lanternFlame.lookAt(camera.position)
      // the field's two-frequency flicker, so the light in here is
      // recognisably the light you were carrying out there
      const flick = 1 + Math.sin(age * 11.3) * 0.045 + Math.sin(age * 27.7) * 0.03
      // …and it blooms in the hit-stop, which with no white flash in the
      // palette is the whole of the impact
      /* WRONG TURN, DO NOT RETAKE, AND THE COMMENT BELOW IS WHY IT SURVIVED SO
         LONG. This was `1 + 2 * (…)` — a 3× peak — sitting under a line that
         swore there was no white flash in this game. There was. The lamp is
         two units from the near plane with a decay of 1.7, so tripling it does
         not "bloom", it saturates every surface inside the falloff at once:
         the death frame came back a flat #f8dfa8 across all 1280×800, the
         backdrop, the rails and the HUD included. The intent in the old
         comment was right and the number was fighting it.
         0.75 keeps the flare — the lamp visibly gutters on impact — and keeps
         the yard underneath it, which is the half you are supposed to be
         looking at while the figure tumbles through it. */
      const bloom = deathT >= 0 && deathT < 0.28 ? 1 + 0.75 * (1 - deathT / 0.28) : 1
      lantern.intensity = 15 * flick * bloom
      // no white flash: there is no white in this palette and there never will
      // be one. The impact is the lantern flaring and the fog lifting 8 %.
      fog.color.copy(deathT >= 0 && deathT < 0.28 ? fogLift : fogBase)

      /* ---- the world ---- */
      updateBed(camZ)
      updateTunnels(snap.z)
      if (farBuildings) farBuildings.position.z = camZ
      if (farPoles) farPoles.position.z = Math.floor(camZ / POLE_PITCH) * POLE_PITCH - 40
      sky.position.set(camera.position.x, 0, camZ)

      /* ---- the entities ---- */
      for (const slot of kinds.values()) {
        if (slot.dirty || VOLATILE.has(slot.kind)) {
          if (slot.kind === 'mote' || slot.kind === 'crate') {
            for (const e of slot.live) {
              if (e.taken && !popped.has(e)) {
                popped.add(e)
                fireBurst(e.x, baseY(e), (e.z0 + e.z1) / 2 - originZ)
              }
            }
          }
          writeSlot(slot)
        }
      }
      for (const s of pickupPool) {
        if (!s.entity) continue
        if (s.entity.taken) {
          if (!popped.has(s.entity)) {
            popped.add(s.entity)
            fireBurst(s.entity.x, baseY(s.entity), (s.entity.z0 + s.entity.z1) / 2 - originZ)
          }
          s.obj.visible = false
          continue
        }
        s.obj.visible = true
        s.obj.position.set(s.entity.x, baseY(s.entity), (s.entity.z0 + s.entity.z1) / 2 - originZ)
        s.obj.rotation.y = age * 1.1
        s.obj.position.y += Math.sin(age * 2 + s.entity.id) * 0.08
      }
      for (const s of letterPool) {
        if (!s.entity) continue
        s.obj.visible = !s.entity.taken
        s.obj.position.set(s.entity.x, baseY(s.entity), (s.entity.z0 + s.entity.z1) / 2 - originZ)
        // a letter faces you, always: it is a glyph and a glyph seen edge-on
        // is not a glyph
        s.obj.lookAt(camera.position)
      }

      /* ---- the pops ---- */
      for (const b of bursts) {
        if (b.life <= 0) continue
        b.life -= dt / 0.34
        if (b.life <= 0) {
          b.mesh.visible = false
          continue
        }
        const u = 1 - b.life
        b.mesh.scale.setScalar(0.5 + u * 1.9)
        ;(b.mesh.material as THREE.MeshBasicMaterial).opacity = b.life * 0.8
        b.mesh.quaternion.copy(camera.quaternion)
      }

      /* ---- the rig, and everything that hangs off where it ends up ---- */
      rigCamera(dt, snap)
      updateGuard(snap)
      updateHead(camZ)
      updateDust(camZ, camera.position.x, st.speed || V0)
      updateStreaks(st.speed || V0)
    },

    death(t, cause) {
      deathT = t
      deathCause = cause
    },

    resize(w, h) {
      aspect = Math.max(0.35, w / Math.max(1, h))
      camera.aspect = aspect
      applyFov(fovNow)
    },

    reset() {
      /* A retry must be under 400 ms to the first frame, so nothing here
         allocates: every array is emptied, every pool freed, every scalar put
         back. The world is not rebuilt, it is rewound. */
      originZ = 0
      rig.position.z = 0
      age = 0
      followX = 0
      followAir = 0
      roofEase = 0
      fovNow = FOV_NEAR
      fovKick = 0
      shake = 0
      punch = 0
      bankNow = 0
      deathT = -1
      dustReady = false
      popped.clear()
      fog.color.setHex(FOG)
      fog.density = FOG_DENSITY
      for (const slot of kinds.values()) {
        slot.live.length = 0
        slot.mesh.count = 0
        slot.mesh.visible = false
        if (slot.rim) {
          slot.rim.geometry.setDrawRange(0, 0)
          slot.rim.visible = false
        }
        slot.dirty = false
      }
      for (const pool of [pickupPool, letterPool]) {
        for (const s of pool as Array<PoolSlot<THREE.Object3D>>) {
          s.entity = null
          s.obj.visible = false
        }
      }
      for (const b of bursts) {
        b.life = 0
        b.mesh.visible = false
      }
      guardFig.visible = false
      thrown.visible = false
      head.visible = false
      camera.rotation.set(0, 0, 0)
    },

    dispose() {
      for (const o of owned) o.dispose()
      owned.length = 0
      for (const t of glyphs.values()) t.dispose()
      glyphs.clear()
      // the entity prototypes, the surfaces, the speckle and the rims all live
      // at module level in props.ts and are freed in one go
      disposeProps()
      scene.clear()
    },
  }

  api.reset()
  return api
}

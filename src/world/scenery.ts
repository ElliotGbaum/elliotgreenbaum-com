/**
 * Scenery — everything in the field that is simply *there*.
 *
 * None of this can be used, and none of it competes with the projector: it is
 * outside the walkable radius (the hills, the trees), under your feet by day
 * (the grass), or too faint to walk toward (the fireflies, the moon). It exists so
 * the field reads as a field — grass moving in a breeze, a horizon with a
 * shape, a sky that is darker overhead than at the edge — rather than as a
 * plane with a texture on it.
 *
 * Seven things live here, and each has the same two hooks the field itself
 * has: `setDaylight(k, dusk)` for the night→day crossfade (and how far into
 * the golden hour it is) and `update()` for the frame. Nothing here reads
 * the clock on its own.
 *
 *   sky      a dome with a vertical gradient and a moon, replacing the flat
 *            clear colour. Not fogged, not tone mapped — the horizon colour IS
 *            the field's `sky`, so the seam the field goes to such lengths to
 *            close stays closed. By day it carries a thin sheet of cloud,
 *            drifting downwind, and the cloud overhead is the same field the
 *            ground reads its shadows from (see weather.ts) — so a shadow
 *            crossing the grass has a cloud above it. At dusk the sun sits
 *            low on the dome as a warm disc. At night, now and then, a
 *            meteor: one streak, a second long, a minute or so apart.
 *   hills    a ring of low flat-shaded hills past the tree line, mostly
 *            swallowed by the night fog and plainly there by day.
 *   trees    a broken ring of dark broadleaf silhouettes between the field's
 *            edge and the hills. Their crowns lean downwind when a gust
 *            reaches them.
 *   grass    AT ALL HOURS. Tens of thousands of instanced blades that follow the
 *            figure around: each blade's position is wrapped onto a square
 *            centred on you, so the patch is always underfoot but no blade
 *            ever moves — it is fixed in the world until it drops off one edge
 *            of the square and reappears on the other. A second, sparser
 *            layer of bigger blades takes over past the middle of the shot
 *            and carries the meadow to the tree line. They sway, and they
 *            are bare under the machine. For a while (until 2026-09-15) the
 *            meadow was the day's only and shrank away with the light; Elliot
 *            wants the grass there at night too, so now only its colour
 *            follows the sun (NIGHT.grass → DAY.grass → DUSK.grass).
 *            It parts around the figure's legs, darkens under a passing
 *            cloud, and lies down in a gust — the gust is a front that rolls
 *            downwind across the meadow, so the wind reads as a thing
 *            crossing the field rather than a shimmer over all of it.
 *   fireflies a few dozen points drifting over the field at night, gone by day.
 *   birds    BY DAY. A small flock crossing the sky over the field, every
 *            minute and a half, and gone. While the film is on the screen
 *            they keep to the side of the sky behind you instead, so they
 *            are never in the watching shot.
 *   mist     AT NIGHT. A few low, faint banks lying out toward the trees,
 *            drifting downwind at nothing like a walking pace.
 *
 * Every number that describes an object's size is in the same units as the
 * figure, who is ~3.9 tall (see HEAD_Y in player.ts): grass to the shin, trees
 * three figures high, hills a good deal more.
 *
 * No Math.random anywhere — every placement comes off `rand()` so the field is
 * the same field on every load.
 */

import * as THREE from 'three'
import { PHONE, clamp, rand, reducedMotion } from '../core/contract'
import { FIELD_RADIUS } from './field'
import { WEATHER_GLSL, WIND, weatherUniforms } from './weather'

export interface Scenery {
  /** `k`: 0 = night, 1 = day — the field's crossfade value, pushed here once a
   *  frame. `dusk`: 0..1, how deep into the golden hour, on top of `k`. */
  setDaylight(k: number, dusk?: number): void
  /** how much of the clearing under the machine is open, 0..1 — the
   *  projector's rise, so the turf is whole until the rig breaks it */
  setClearing(k: number): void
  /** the film is on the screen and the camera is framed on it: the flock
   *  keeps out of that shot */
  setWatching(on: boolean): void
  /** `focus` is the figure's position; the grass patch and the sky centre on it */
  update(dt: number, elapsed: number, focus: THREE.Vector3): void
  dispose(): void
}

/* ------------------------------------------------------------------ *
 * Palette for the two times of day. Everything here is a tint that the
 * lights then act on, so "night" colours are the colour of the thing, not
 * the colour it looks in the dark.
 * ------------------------------------------------------------------ */
const NIGHT = {
  /** must equal the field's NIGHT.sky — that is the whole horizon trick */
  horizon: 0x182d36,
  zenith: 0x122631,
  moon: 0.9,
  grass: 0x2c4c42,
  tree: 0x0c1a1e,
  trunk: 0x0a1416,
  hill: 0x0f1e25,
  fireflies: 1,
}
const DAY = {
  horizon: 0xa9c8d9,
  zenith: 0x5f97bf,
  moon: 0,
  grass: 0xa6bd72,
  tree: 0x4e7a4a,
  trunk: 0x5a4a3a,
  hill: 0x7a9670,
  fireflies: 0,
}
/* The golden hour. Not a third state the field can be in, but a tint the
   crossfade passes THROUGH: everything is first mixed night→day by `k`, then
   pulled toward this by `dusk`. `horizon` must equal the field's DUSK.sky. */
const DUSK = {
  horizon: 0xe4b08c,
  zenith: 0x5878ae,
  moon: 0.2,
  grass: 0xa9c86e,
  tree: 0x3a4e3e,
  trunk: 0x3a2e28,
  hill: 0x686670,
  fireflies: 0.45,
}

/** the moon sits where the field's directional light comes from */
const MOON_DIR = new THREE.Vector3(-46, 62, 40).normalize()
/** the dusk sun: the same bearing, a hand's width over the hills. The field
 *  lowers its directional light to the same place as the sun goes down. */
const SUN_DIR = new THREE.Vector3(-46, 16, 40).normalize()

/* ------------------------------------------------------------------ *
 * A little value noise, for anything that needs a smooth random field
 * (hill profiles, tree clustering). Two octaves is plenty.
 * ------------------------------------------------------------------ */
const smooth = (t: number) => t * t * (3 - 2 * t)
function noise1(x: number, seed: number): number {
  const i = Math.floor(x)
  const f = smooth(x - i)
  const a = rand(i * 17 + seed)
  const b = rand((i + 1) * 17 + seed)
  return a + (b - a) * f
}

/* ================================================================== *
 * Sky
 * ================================================================== */
/** how high the cloud sheet hangs. Only its ratio to the drift speed shows:
 *  higher is slower-looking and flatter toward the horizon. */
const CLOUD_HEIGHT = 150
/** seconds between one meteor and the next, and how long a streak lasts */
const METEOR_EVERY = 52
const METEOR_LIFE = 1.1
function createSky(weather: ReturnType<typeof weatherUniforms>): {
  mesh: THREE.Mesh
  mat: THREE.ShaderMaterial
} {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...weather,
      uHorizon: { value: new THREE.Color(NIGHT.horizon) },
      uZenith: { value: new THREE.Color(NIGHT.zenith) },
      uMoonDir: { value: MOON_DIR.clone() },
      uMoonColor: { value: new THREE.Color(0xe4ecf2) },
      uMoon: { value: NIGHT.moon },
      uSunDir: { value: SUN_DIR.clone() },
      uSunColor: { value: new THREE.Color(0xffc48a) },
      uSun: { value: 0 },
      uCenter: { value: new THREE.Vector2(0, 0) },
      uCloud: { value: 0 },
      uCloudColor: { value: new THREE.Color(0xf3f6f8) },
      uMeteorA: { value: new THREE.Vector3(0, 1, 0) },
      uMeteorB: { value: new THREE.Vector3(0, 1, 0) },
      uMeteor: { value: -1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${WEATHER_GLSL}
      uniform vec3 uHorizon;
      uniform vec3 uZenith;
      uniform vec3 uMoonDir;
      uniform vec3 uMoonColor;
      uniform float uMoon;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uSun;
      uniform vec2 uCenter;
      uniform float uCloud;
      uniform vec3 uCloudColor;
      uniform vec3 uMeteorA;
      uniform vec3 uMeteorB;
      uniform float uMeteor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        // the gradient hugs the horizon: most of the change happens in the
        // first twenty degrees, which is where the eye is when walking
        vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
        float m = max(dot(d, uMoonDir), 0.0);
        float disc = pow(m, 2600.0);
        float halo = pow(m, 28.0) * 0.14 + pow(m, 6.0) * 0.035;
        col += uMoonColor * uMoon * (disc + halo);
        // the dusk sun: a bigger, softer disc low over the hills, and a glow
        // that warms the whole quarter of the sky it sits in
        float sm = max(dot(d, uSunDir), 0.0);
        float sdisc = pow(sm, 1400.0) * 1.6;
        float shalo = pow(sm, 12.0) * 0.32 + pow(sm, 3.0) * 0.10;
        col += uSunColor * uSun * (sdisc + shalo);
        // cloud: the ground-plane field lifted to CLOUD_HEIGHT and looked at
        // from below. Fades out into the horizon band, where the sheet would
        // be edge-on and alias, and where the fog would have eaten it anyway.
        if (d.y > 0.06 && uCloud > 0.001) {
          vec2 over = uCenter + d.xz / d.y * ${CLOUD_HEIGHT.toFixed(1)};
          float cover = cloudCover(over, uWeatherTime);
          // the band starts well up from the horizon: nearer than that the
          // sheet is edge-on and every cell is a streak
          float band = smoothstep(0.06, 0.3, d.y);
          // thinner in the middle of a cell than at its edge: the sheet has a
          // little depth to it without a second noise
          vec3 cloud = uCloudColor * (0.86 + 0.14 * (1.0 - cover));
          col = mix(col, cloud, cover * band * uCloud * 0.8);
        }
        // a meteor: a short bright streak from A toward B, progress uMeteor
        // in 0..1, with a tail that fades behind the head
        if (uMeteor >= 0.0) {
          vec3 ab = uMeteorB - uMeteorA;
          float lo = max(0.0, uMeteor - 0.22);
          float t = clamp(dot(d - uMeteorA, ab) / dot(ab, ab), lo, uMeteor);
          vec3 q = normalize(uMeteorA + ab * t);
          float dist = length(d - q);
          float core = exp(-dist * dist / (0.0028 * 0.0028));
          float glow = exp(-dist * dist / (0.011 * 0.011)) * 0.22;
          float along = (t - lo) / max(uMeteor - lo, 1e-4);
          float life = sin(uMeteor * 3.14159);
          col += vec3(0.95, 0.97, 1.0) * (core + glow) * along * along * life * uMoon;
        }
        // a hair of dither so a 16-bit gradient does not band across the sky
        float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        col += (n - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(360, 48, 24), mat)
  mesh.renderOrder = -10
  mesh.frustumCulled = false
  mesh.name = 'sky'
  return { mesh, mat }
}

/* ================================================================== *
 * Hills — an annulus with a height profile, flat shaded
 * ================================================================== */
const HILL_INNER = 118
const HILL_OUTER = 250
function createHills(): { mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial } {
  const AROUND = 180
  const ACROSS = 7
  const pos: number[] = []
  const idx: number[] = []

  const height = (a: number) => {
    // three octaves around the ring, in "turns" so the seam closes
    const u = a / (Math.PI * 2)
    const h =
      6 +
      noise1(u * 5, 3) * 14 +
      noise1(u * 13, 11) * 9 +
      noise1(u * 29, 23) * 4
    return h
  }

  for (let i = 0; i <= AROUND; i++) {
    const a = (i / AROUND) * Math.PI * 2
    const H = height(a)
    for (let j = 0; j < ACROSS; j++) {
      const t = j / (ACROSS - 1)
      const r = HILL_INNER + (HILL_OUTER - HILL_INNER) * t
      // the ridge line sits a third of the way in; the far side falls away
      // slowly so the hills have a back you never see the bottom of
      const ridge = t < 0.35 ? smooth(t / 0.35) : 1 - smooth((t - 0.35) / 0.65) * 0.7
      const jitter = (rand(i * 7 + j * 13) - 0.5) * 3
      pos.push(Math.cos(a) * r + jitter, H * ridge, Math.sin(a) * r + jitter)
    }
  }
  for (let i = 0; i < AROUND; i++) {
    for (let j = 0; j < ACROSS - 1; j++) {
      const a = i * ACROSS + j
      const b = a + ACROSS
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  const mat = new THREE.MeshLambertMaterial({ color: NIGHT.hill, flatShading: true })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'hills'
  mesh.frustumCulled = false
  return { mesh, mat }
}

/* ================================================================== *
 * Trees — a broken ring of broadleaf silhouettes
 * ================================================================== */
const TREE_MIN = FIELD_RADIUS + 8
const TREE_MAX = HILL_INNER + 6
function createTrees(weather: ReturnType<typeof weatherUniforms>): {
  group: THREE.Group
  canopy: THREE.MeshLambertMaterial
  trunk: THREE.MeshLambertMaterial
  dispose(): void
} {
  const N = PHONE ? 90 : 170
  const canopyGeo = new THREE.IcosahedronGeometry(1, 1)
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1, 6)
  trunkGeo.translate(0, 0.5, 0)
  const canopy = new THREE.MeshLambertMaterial({ color: NIGHT.tree, flatShading: true })
  // The crowns lean downwind as a gust reaches them — the top of the crown
  // more than the bottom, so it is a lean and not a slide. The gust is read
  // at the tree's foot (the instance's translation) so a whole crown moves
  // as one; the world-space push is turned back into the crown's own axes
  // through the instance matrix, whose columns are orthogonal, so the
  // inverse is a couple of dots. Trunks do not move: a trunk that bends is
  // a sapling, and these are three figures high.
  canopy.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, weather)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WEATHER_GLSL}`)
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        {
          mat3 im = mat3(instanceMatrix);
          vec2 foot = instanceMatrix[3].xz;
          float g = gust(foot, uWeatherTime);
          // a slow sway of its own on top, so a lull is not a freeze
          float idle = sin(uWeatherTime * 0.9 + foot.x * 0.13 + foot.y * 0.07) * 0.12 + 0.12;
          vec2 push = uWind * (g * 0.9 + idle) * (0.45 + 0.55 * clamp(position.y + 0.5, 0.0, 1.0));
          transformed.x += dot(push, im[0].xz) / dot(im[0], im[0]);
          transformed.z += dot(push, im[2].xz) / dot(im[2], im[2]);
        }`,
      )
  }
  canopy.customProgramCacheKey = () => 'canopy-wind'
  const trunk = new THREE.MeshLambertMaterial({ color: NIGHT.trunk })
  const canopies = new THREE.InstancedMesh(canopyGeo, canopy, N)
  const lobes = new THREE.InstancedMesh(canopyGeo, canopy, N)
  const trunks = new THREE.InstancedMesh(trunkGeo, trunk, N)
  canopies.frustumCulled = false
  lobes.frustumCulled = false
  trunks.frustumCulled = false

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const p = new THREE.Vector3()
  const yAxis = new THREE.Vector3(0, 1, 0)

  let placed = 0
  for (let i = 0; placed < N && i < N * 6; i++) {
    const a = rand(i * 3 + 5) * Math.PI * 2
    // clustering: a noise field around the ring decides how likely a tree is
    const u = a / (Math.PI * 2)
    const density = noise1(u * 9, 41) * 0.7 + noise1(u * 23, 43) * 0.3
    if (rand(i * 3 + 6) > density * 1.5) continue
    // thinner directly behind the screen so it reads clean against sky
    const behindScreen = Math.abs(Math.sin(a) + 1) < 0.35 && Math.abs(Math.cos(a)) < 0.45
    if (behindScreen && rand(i * 3 + 9) < 0.55) continue

    const r = TREE_MIN + Math.pow(rand(i * 3 + 7), 0.8) * (TREE_MAX - TREE_MIN)
    const h = 9 + rand(i * 3 + 8) * 7
    const w = h * (0.38 + rand(i + 51) * 0.14)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r

    q.setFromAxisAngle(yAxis, rand(i + 61) * Math.PI * 2)
    s.set(w, h * 0.42, w * (0.9 + rand(i + 71) * 0.2))
    p.set(x, h - h * 0.42 * 0.8, z)
    m.compose(p, q, s)
    canopies.setMatrixAt(placed, m)

    // a second, smaller lobe off to one side, so no two crowns are the same
    // blob and the ring reads as trees rather than a row of lollipops
    const la = rand(i + 81) * Math.PI * 2
    s.set(w * 0.62, h * 0.3, w * 0.62)
    p.set(x + Math.cos(la) * w * 0.55, h * 0.72 + rand(i + 91) * h * 0.15, z + Math.sin(la) * w * 0.55)
    m.compose(p, q, s)
    lobes.setMatrixAt(placed, m)

    s.set(h * 0.09, h * 0.75, h * 0.09)
    p.set(x, 0, z)
    m.compose(p, q, s)
    trunks.setMatrixAt(placed, m)
    placed++
  }
  canopies.count = placed
  lobes.count = placed
  trunks.count = placed
  canopies.instanceMatrix.needsUpdate = true
  lobes.instanceMatrix.needsUpdate = true
  trunks.instanceMatrix.needsUpdate = true

  const group = new THREE.Group()
  group.name = 'trees'
  group.add(canopies, lobes, trunks)
  return {
    group,
    canopy,
    trunk,
    dispose() {
      canopyGeo.dispose()
      trunkGeo.dispose()
      canopy.dispose()
      trunk.dispose()
      canopies.dispose()
      lobes.dispose()
      trunks.dispose()
    },
  }
}

/* ================================================================== *
 * Grass
 *
 * Two layers of the same instanced blade, each wrapped onto its own square
 * centred on the figure. The near layer is dense and life-size and thins out
 * past the middle of the shot; the far layer is a sixth as dense, its blades
 * half again as wide and a touch taller, and it thins in exactly where the
 * near one goes — so the meadow keeps its weight all the way to the tree line
 * for a fraction of the blades a single dense layer would cost. At that range
 * a blade is a pixel or two, so nobody can tell the far ones are bigger.
 * ================================================================== */
interface GrassLayer {
  /** blades in the layer */
  n: number
  /** side of the square the blades are wrapped onto, centred on the figure */
  span: number
  /** distance from the figure the layer grows in over [0..1], and out over [2..3] */
  fade: [number, number, number, number]
  /** width and height multipliers on the blade */
  blade: [number, number]
}
/** A fade here thins the layer out blade by blade, at full size — never by
 *  shrinking blades, which halved the meadow's weight wherever two fades
 *  overlapped and read as a thin band across the field. The near fade has to
 *  finish well past the middle of the shot: one that ended at 46 read as a
 *  line by day, because daylight fog is far too thin at that range to soften
 *  it. The far layer thins in over the same band the near one thins out, so
 *  the count stays level, and it runs on through the tree line (which starts
 *  at 98) so the last of it goes behind trunks rather than at an edge.
 *  The near fade-out starts only a few strides out, long before the far
 *  layer begins to fill in: perspective packs a flat field tighter with
 *  every unit of distance, so a layer held at full count to the middle of
 *  the shot read as a thick band behind Elliot with thinner grass either
 *  side of it. Thinning from close in keeps the count per screen inch level. */
const GRASS_NEAR: GrassLayer = PHONE
  ? { n: 19000, span: 116, fade: [-1, 0, 12, 56], blade: [1, 1] }
  : { n: 54000, span: 136, fade: [-1, 0, 14, 68], blade: [1, 1] }
const GRASS_FAR: GrassLayer = PHONE
  ? { n: 13000, span: 260, fade: [32, 56, 108, 128], blade: [1.5, 1.1] }
  : { n: 34000, span: 260, fade: [40, 68, 108, 128], blade: [1.5, 1.1] }
function bladeGeometry(): THREE.BufferGeometry {
  const SEG = 3
  const W = 0.16
  const pos: number[] = []
  const nrm: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG
    const half = (W / 2) * (1 - Math.pow(t, 1.4))
    pos.push(-half, t, 0, half, t, 0)
    nrm.push(0, 1, 0, 0, 1, 0)
  }
  for (let i = 0; i < SEG; i++) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  geo.setIndex(idx)
  return geo
}

function createGrass(
  layer: GrassLayer,
  clearing: THREE.Vector3,
  seed: number,
  weather: ReturnType<typeof weatherUniforms>,
): {
  mesh: THREE.Mesh
  mat: THREE.MeshLambertMaterial
  uniforms: Record<string, THREE.IUniform>
  dispose(): void
} {
  const geo = bladeGeometry()
  const inst = new THREE.InstancedBufferGeometry()
  inst.index = geo.index
  inst.attributes = geo.attributes

  const { n, span } = layer
  const offset = new Float32Array(n * 4)
  const lean = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const k = i * 4 + seed
    offset[i * 4] = rand(k + 1) * span
    offset[i * 4 + 1] = rand(k + 2) * span
    // height, in figure units: ankle-high, a few to the shin. The first cut
    // (0.55 to 1.65) came to the figure's thigh and read as wading; the mown
    // cut (0.2 to 0.55) read as stubble. This sits between, nearer the short
    // end. It only ever shows by day, which is why wading through it in the
    // dark stopped being a problem.
    offset[i * 4 + 2] = (0.38 + Math.pow(rand(k + 3), 2) * 0.72) * layer.blade[1]
    offset[i * 4 + 3] = rand(k + 4) * Math.PI * 2
    lean[i] = (rand(i + 9001 + seed) - 0.5) * 0.6
  }
  inst.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offset, 4))
  inst.setAttribute('aLean', new THREE.InstancedBufferAttribute(lean, 1))

  const uniforms: Record<string, THREE.IUniform> = {
    ...weather,
    uCenter: { value: new THREE.Vector2(0, 0) },
    uSpan: { value: span },
    uFade: { value: new THREE.Vector4(...layer.fade) },
    uWidth: { value: layer.blade[0] },
    // the radius is written each frame from the projector's rise, so it
    // starts at nothing: the field opens with no machine and no mark of one
    uClear: { value: new THREE.Vector3(clearing.x, clearing.z, 0) },
    uTime: { value: 0 },
    /** where the figure's feet are (x, z) and how far the grass parts round them */
    uFoot: { value: new THREE.Vector3(0, 0, 1.7) },
    /** how much of the sun a cloud can take: 1 by day, less in the golden hour */
    uCloudShade: { value: 0 },
  }

  const mat = new THREE.MeshLambertMaterial({ color: NIGHT.grass, side: THREE.DoubleSide })
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        ${WEATHER_GLSL}
        attribute vec4 aOffset;
        attribute float aLean;
        uniform vec2 uCenter;
        uniform float uSpan;
        uniform vec4 uFade;
        uniform float uWidth;
        uniform vec3 uClear;
        uniform float uTime;
        uniform vec3 uFoot;
        uniform float uCloudShade;
        varying float vH;
        varying float vShade;`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        // wrap the blade onto the square centred on the figure — it stays put
        // in the world until it falls off one edge and reappears on the other
        vec2 rel = aOffset.xy - uCenter;
        rel -= uSpan * floor(rel / uSpan + 0.5);
        vec2 base = uCenter + rel;
        float dist = length(rel);
        // thin the layer by dropping whole blades, never by shrinking them:
        // each blade has a fixed lot number (its angle, folded to 0..1) and
        // stands only while the fade at its distance is above that number
        float lot = fract(aOffset.w * 0.15915494);
        float fade = step(lot, smoothstep(uFade.x, uFade.y, dist)) * step(lot, 1.0 - smoothstep(uFade.z, uFade.w, dist));
        // bare ground under the machine
        float clear = uClear.z <= 0.0 ? 1.0 : smoothstep(uClear.z * 0.45, uClear.z, distance(base, uClear.xy));
        // the meadow stands day and night; only its colour follows the sun
        float s = aOffset.z * fade * clear;
        float t = position.y;
        vH = t;
        vec3 p = position * vec3(s * uWidth, s, s);
        // the wind: a gust front rolling downwind (weather.ts) sets how hard
        // the blade shivers and how far it lies over
        float g = gust(base, uWeatherTime);
        float sway = sin(uTime * 1.3 + base.x * 0.42 + base.y * 0.31) * 0.16
                   + sin(uTime * 2.1 + base.x * 0.9 - base.y * 0.6) * 0.05
                   + sin(uTime * 5.7 + base.x * 1.7 + base.y * 1.1) * 0.05 * g;
        p.x += (aLean + sway * (0.6 + 0.75 * g)) * t * t * s * 1.4;
        float c = cos(aOffset.w), sn = sin(aOffset.w);
        vec3 transformed = vec3(c * p.x - sn * p.z, p.y, sn * p.x + c * p.z) + vec3(base.x, 0.0, base.y);
        // lie over downwind by the gust, in world space so every blade in the
        // front leans the same way whatever way it happens to face
        float lay = g * g * 0.44 * t * t * s;
        transformed.xz += uWind * lay;
        transformed.y -= lay * 0.35;
        // part round the figure's legs: bend away from the feet, the tip
        // more than the root, and flatten a little, so the blades under and
        // beside a foot are pressed down and the ring round it leans out
        vec2 away = base - uFoot.xy;
        float near = 1.0 - smoothstep(0.0, uFoot.z, length(away));
        float press = near * near;
        vec2 dir = away / max(length(away), 0.05);
        transformed.xz += dir * press * t * t * s * 1.9;
        transformed.y -= press * t * s * 0.55;
        // the passing cloud
        vShade = 1.0 - (1.0 - cloudShade(base, uWeatherTime)) * uCloudShade;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;\nvarying float vShade;')
      // darker at the root, lighter at the tip — the one thing that makes a
      // field of identical quads read as blades
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.42, 1.12, vH) * vShade;',
      )
      // a blade's normal is "up" whichever side you see; the default chunk
      // would flip it on the back face and turn half the field black
      .replace(
        '#include <normal_fragment_begin>',
        'vec3 normal = normalize(vNormal);\nvec3 nonPerturbedNormal = normal;',
      )
  }
  // the injected attributes change the program, so the cache key has to say so
  mat.customProgramCacheKey = () => 'grass'

  // a plain Mesh over an instanced geometry, not an InstancedMesh: placement
  // is entirely in the shader, so there is no per-instance matrix to carry
  inst.instanceCount = n
  const mesh = new THREE.Mesh(inst, mat)
  mesh.frustumCulled = false
  mesh.name = 'grass'

  return {
    mesh,
    mat,
    uniforms,
    dispose() {
      geo.dispose()
      inst.dispose()
      mat.dispose()
    },
  }
}

/* ================================================================== *
 * Fireflies
 * ================================================================== */
function createFireflies(): { points: THREE.Points; mat: THREE.ShaderMaterial } {
  const N = PHONE ? 60 : 130
  const pos = new Float32Array(N * 3)
  const seed = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const a = rand(i * 5 + 1) * Math.PI * 2
    const r = 8 + Math.sqrt(rand(i * 5 + 2)) * (FIELD_RADIUS - 6)
    pos[i * 3] = Math.cos(a) * r
    pos[i * 3 + 1] = 0.8 + rand(i * 5 + 3) * 3.2
    pos[i * 3 + 2] = Math.sin(a) * r
    seed[i] = rand(i * 5 + 4) * 100
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uNight: { value: 1 },
      uScale: { value: 1 },
      uColor: { value: new THREE.Color(0xd9e07a) },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uNight;
      uniform float uScale;
      varying float vA;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.31 + aSeed * 1.7) * 2.6 + sin(uTime * 0.83 + aSeed) * 0.5;
        p.z += cos(uTime * 0.27 + aSeed * 2.3) * 2.6 + cos(uTime * 0.71 + aSeed) * 0.5;
        p.y += sin(uTime * 0.53 + aSeed * 3.1) * 0.7;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float blink = smoothstep(0.35, 1.0, sin(uTime * 1.9 + aSeed * 13.0) * 0.5 + 0.5);
        blink *= 0.35 + 0.65 * smoothstep(0.2, 0.9, sin(uTime * 0.23 + aSeed * 5.0) * 0.5 + 0.5);
        float d = -mv.z;
        // hand-rolled fog, since this material opts out of the scene's
        float far = exp(-pow(d * 0.011, 2.0));
        vA = blink * uNight * far;
        gl_PointSize = (30.0 + 26.0 * blink) * uScale / max(d, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, r);
        a = a * a;
        gl_FragColor = vec4(uColor * a * vA, a * vA);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  points.name = 'fireflies'
  return { points, mat }
}

/* ================================================================== *
 * Birds
 *
 * One flock, eleven birds, flat silhouettes that flap. It crosses the sky
 * on a straight line every minute and a half and is gone for the rest of
 * it — the gap is the point; a sky with birds in it all the time is
 * wallpaper. It alternates direction crossing to crossing.
 *
 * Two lines. The everyday one runs over the field in front of you as you
 * face Elliot and the screen: in from one side past your shoulder, over the
 * meadow and the screen, and out over the far hills, low enough to read as
 * birds rather than specks. The line used to run out past the hills on the
 * far side of the sky behind you, and nobody ever saw it. While the film is
 * on the screen the flock takes that old line instead — the +z half of the
 * world, behind you when you face the screen — so it is never in the
 * watching shot. The first crossing is already under way when you arrive,
 * far enough along that the flock comes into frame a few seconds after the
 * field does — the line runs edge to edge across the world and is only in
 * the camera for its middle stretch, so a crossing that started on arrival
 * would not show a bird for twenty seconds.
 * ================================================================== */
const FLOCK = 11
/** seconds from one crossing's start to the next */
const FLOCK_EVERY = 90
/** seconds a crossing takes */
const FLOCK_CROSS = 54
/** seconds the first crossing is already along when you arrive */
const FLOCK_HEAD = 13
function createBirds(): { mesh: THREE.Mesh; mat: THREE.ShaderMaterial } {
  // Flat silhouettes, body along z, wings out along x. Each wing is an
  // inner panel, shoulder to elbow, and an outer one that sweeps back to a
  // point — the elbow is what stops it reading as a triangle. The body is a
  // slim diamond, head forward.
  const pos: number[] = []
  const bird: number[] = []
  for (let i = 0; i < FLOCK; i++) {
    const tri = (...v: number[]) => {
      pos.push(...v)
      bird.push(i, i, i)
    }
    tri(0, 0, 0.95, -0.14, 0, 0.1, 0.14, 0, 0.1)
    tri(0, 0, -0.6, 0.14, 0, 0.1, -0.14, 0, 0.1)
    for (const s of [-1, 1]) {
      const sf = [0, 0, 0.3], sb = [0, 0, -0.12]
      const ef = [s * 1.0, 0, 0.38], eb = [s * 1.0, 0, 0.02]
      const tip = [s * 2.2, 0, -0.7]
      tri(...sf, ...sb, ...ef)
      tri(...sb, ...eb, ...ef)
      tri(...ef, ...eb, ...tip)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('aBird', new THREE.Float32BufferAttribute(bird, 1))

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uA: { value: new THREE.Vector3() },
      uB: { value: new THREE.Vector3() },
      uProgress: { value: -1 },
      uShow: { value: 0 },
      uColor: { value: new THREE.Color(0x2a3236) },
    },
    vertexShader: /* glsl */ `
      attribute float aBird;
      uniform float uTime;
      uniform vec3 uA;
      uniform vec3 uB;
      uniform float uProgress;
      varying float vFar;
      void main() {
        // a loose V: the lead in front, the rest fanned back on both sides,
        // each a little off its station and bobbing on its own beat
        float k = aBird - ${((FLOCK - 1) / 2).toFixed(1)};
        vec3 dir = normalize(uB - uA);
        vec3 side = normalize(cross(dir, vec3(0.0, 1.0, 0.0)));
        vec3 at = mix(uA, uB, uProgress)
                + side * (k * 3.4 + sin(uTime * 0.7 + aBird * 2.1) * 0.6)
                - dir * (abs(k) * 3.0 + sin(uTime * 0.5 + aBird * 1.3) * 1.2)
                + vec3(0.0, sin(uTime * 1.1 + aBird * 0.9) * 0.8, 0.0);
        // flap: the wing hinges at the shoulder, and the outer panel hinges
        // again at the elbow a beat behind it, so the tip trails the stroke
        // the way a wing does; the body does not move. Held slightly raised
        // so a wing never passes through dead flat and vanishes edge-on.
        float beat = uTime * 9.0 + aBird * 1.7;
        float flap = 0.15 + sin(beat) * 0.55;
        float trail = sin(beat - 0.9) * 0.7;
        vec3 p = position;
        float ax = abs(p.x);
        p.y += min(ax, 1.0) * flap + max(ax - 1.0, 0.0) * trail;
        // point the body along the line of flight
        vec3 world = at + side * p.x + dir * p.z + vec3(0.0, p.y, 0.0);
        vec4 mv = modelViewMatrix * vec4(world, 1.0);
        vFar = exp(-pow(-mv.z * 0.0032, 2.0));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uShow;
      varying float vFar;
      void main() {
        gl_FragColor = vec4(uColor, uShow * (0.35 + 0.65 * vFar));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.visible = false
  mesh.name = 'birds'
  return { mesh, mat }
}

/* ================================================================== *
 * Mist
 *
 * A dozen faint banks lying low out toward the trees at night: sprites with
 * a soft horizontal smear on them, a hand or two off the ground, drifting
 * downwind slower than anything else in the world. They are opaque enough
 * to notice from the spawn and not enough to read as an object; the fog
 * takes the far ones. Gone by day, when the air is meant to be clear.
 * ================================================================== */
const MIST_N = PHONE ? 8 : 13
/** how far a bank's bottom edge sits above the ground plane */
const MIST_CLEAR = 0.05
function mistTexture(): THREE.CanvasTexture {
  const W = 256
  const H = 64
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const img = g.createImageData(W, H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x / W) * 2 - 1
      const v = (y / H) * 2 - 1
      // an ellipse with a soft edge and a ragged top, so it is a bank and
      // not a pill
      const rag = 0.85 + 0.15 * Math.sin(u * 9.3 + 1.1) * Math.sin(u * 4.1)
      const r = Math.sqrt(u * u + (v * v) / (rag * rag))
      const a = Math.pow(clamp(1 - r), 1.6)
      const i = (y * W + x) * 4
      img.data[i] = 255
      img.data[i + 1] = 255
      img.data[i + 2] = 255
      img.data[i + 3] = Math.round(a * 255)
    }
  }
  g.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
function createMist(): {
  group: THREE.Group
  mat: THREE.SpriteMaterial
  banks: Array<{ sprite: THREE.Sprite; seed: number }>
  dispose(): void
} {
  const tex = mistTexture()
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color: 0x8ea6b0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: true,
  })
  const group = new THREE.Group()
  group.name = 'mist'
  const banks: Array<{ sprite: THREE.Sprite; seed: number }> = []
  for (let i = 0; i < MIST_N; i++) {
    const sprite = new THREE.Sprite(mat)
    const a = rand(i * 7 + 301) * Math.PI * 2
    const r = 30 + rand(i * 7 + 302) * 65
    const w = 12 + rand(i * 7 + 303) * 16
    sprite.scale.set(w, w * 0.16, 1)
    // seated on the ground, never in it: a bank taller than twice its centre
    // height dipped below the plane and the ground clipped it flat — a dead
    // straight line across the field, plainest from the low talking shot
    sprite.position.set(Math.cos(a) * r, sprite.scale.y / 2 + MIST_CLEAR, Math.sin(a) * r)
    group.add(sprite)
    banks.push({ sprite, seed: rand(i * 7 + 305) * 100 })
  }
  return {
    group,
    mat,
    banks,
    dispose() {
      tex.dispose()
      mat.dispose()
    },
  }
}

/* ================================================================== *
 * Assembly
 * ================================================================== */
/** how far from the machine's footprint the grass stands again, fully raised */
const CLEARING_R = 7.5

export interface SceneryOptions {
  /** world point the grass is bare around — the machine's footprint */
  clearing: THREE.Vector3
}

export function createScenery(scene: THREE.Scene, opts: SceneryOptions): Scenery {
  // one set of weather uniforms, shared by value: every material that reads
  // the wind or the clouds is handed these same objects, so one write a
  // frame moves all of them together
  const weather = weatherUniforms()
  const sky = createSky(weather)
  const hills = createHills()
  const trees = createTrees(weather)
  const grass = [
    createGrass(GRASS_NEAR, opts.clearing, 0, weather),
    createGrass(GRASS_FAR, opts.clearing, 500000, weather),
  ]
  const flies = createFireflies()
  const birds = createBirds()
  const mist = createMist()

  scene.add(
    sky.mesh,
    hills.mesh,
    trees.group,
    ...grass.map((g) => g.mesh),
    flies.points,
    birds.mesh,
    mist.group,
  )

  const cA = new THREE.Color()
  const cB = new THREE.Color()
  const cC = new THREE.Color()
  /** night→day by k, then toward dusk by d */
  const mix = (out: THREE.Color, a: number, b: number, c: number, k: number, d: number) => {
    cA.setHex(a)
    cB.setHex(b)
    cC.setHex(c)
    out.copy(cA).lerp(cB, k).lerp(cC, d)
  }
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const blend = (a: number, b: number, c: number, k: number, d: number) => lerp(lerp(a, b, k), c, d)

  let daylight = 0
  let dusk = 0
  let time = 0
  // the point size is in device pixels, so it has to know the ratio once
  flies.mat.uniforms.uScale.value = Math.min(window.devicePixelRatio || 1, 2) * 12

  const cloudDay = new THREE.Color(0xf3f6f8)
  const cloudDusk = new THREE.Color(0xf8cfae)

  function apply(k: number, d: number) {
    // the sky takes the whole of the golden hour, the things standing in
    // the field half of it — same split as the field's own apply()
    const dg = d * 0.5
    const u = sky.mat.uniforms
    mix(u.uHorizon.value, NIGHT.horizon, DAY.horizon, DUSK.horizon, k, d)
    mix(u.uZenith.value, NIGHT.zenith, DAY.zenith, DUSK.zenith, k, d)
    u.uMoon.value = blend(NIGHT.moon, DAY.moon, DUSK.moon, k, d)
    u.uSun.value = d
    // the cloud sheet belongs to the light: it is the day's, lit pink as the
    // sun goes, and gone with the dark — at night the sky is its stars
    u.uCloud.value = k * (1 - d * 0.7)
    ;(u.uCloudColor.value as THREE.Color).copy(cloudDay).lerp(cloudDusk, d)
    mix(hills.mat.color, NIGHT.hill, DAY.hill, DUSK.hill, k, dg)
    mix(trees.canopy.color, NIGHT.tree, DAY.tree, DUSK.tree, k, dg)
    mix(trees.trunk.color, NIGHT.trunk, DAY.trunk, DUSK.trunk, k, dg)
    for (const g of grass) {
      mix(g.mat.color, NIGHT.grass, DAY.grass, DUSK.grass, k, dg)
      // cloud shadows need a sun to cast them: full by day, softer at dusk
      g.uniforms.uCloudShade.value = k * (1 - d * 0.5)
    }
    flies.mat.uniforms.uNight.value = blend(NIGHT.fireflies, DAY.fireflies, DUSK.fireflies, k, d)
    flies.points.visible = flies.mat.uniforms.uNight.value > 0.01
    // birds are the day's, and at dusk they are silhouettes, which is better
    birds.mat.uniforms.uShow.value = Math.max(k, d * 0.9)
    // mist is the night's, and it lingers a little into the golden hour
    mist.mat.opacity = (1 - k) * 0.2 + d * 0.04
    mist.group.visible = mist.mat.opacity > 0.005
  }
  apply(0, 0)

  /* ---------------- the meteor clock ----------------
     One streak every METEOR_EVERY seconds, give or take, each from a
     different patch of sky. The start and end are drawn off rand() from the
     event number, so the fourth meteor is always the fourth meteor. Only at
     night: the shader multiplies by the moon. */
  let meteorAt = METEOR_EVERY * 0.45
  let meteorN = 0
  const mA = sky.mat.uniforms.uMeteorA.value as THREE.Vector3
  const mB = sky.mat.uniforms.uMeteorB.value as THREE.Vector3
  function meteor() {
    if (time < meteorAt) {
      sky.mat.uniforms.uMeteor.value = -1
      return
    }
    const p = (time - meteorAt) / METEOR_LIFE
    if (p >= 1) {
      meteorN++
      meteorAt = time + METEOR_EVERY * (0.7 + rand(meteorN * 3 + 900) * 0.6)
      sky.mat.uniforms.uMeteor.value = -1
      return
    }
    if (p === 0 || sky.mat.uniforms.uMeteor.value < 0) {
      // high in the sky, a short arc, falling
      const az = rand(meteorN * 3 + 901) * Math.PI * 2
      const el = 0.45 + rand(meteorN * 3 + 902) * 0.35
      mA.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el))
      const az2 = az + (rand(meteorN * 3 + 903) - 0.5) * 0.5
      const el2 = el - 0.16 - rand(meteorN * 3 + 904) * 0.12
      mB.set(Math.cos(az2) * Math.cos(el2), Math.sin(el2), Math.sin(az2) * Math.cos(el2))
    }
    sky.mat.uniforms.uMeteor.value = p
  }

  /* ---------------- the flock clock ---------------- */
  let watching = false
  const fA = birds.mat.uniforms.uA.value as THREE.Vector3
  const fB = birds.mat.uniforms.uB.value as THREE.Vector3
  function flock() {
    const t = time + FLOCK_HEAD
    const n = Math.floor(t / FLOCK_EVERY)
    const p = (t - n * FLOCK_EVERY) / FLOCK_CROSS
    const show = t >= 0 && p < 1 && birds.mat.uniforms.uShow.value > 0.01
    birds.mesh.visible = show
    if (!show) return
    // one way or the other by turns
    const flip = n % 2 === 0 ? 1 : -1
    if (watching) {
      // a line across the +z half of the world, well past the hills and
      // above them: out of the watching shot
      const z = 190 + rand(n * 5 + 700) * 60
      const y = 58 + rand(n * 5 + 701) * 22
      fA.set(-300 * flip, y, z - 30)
      fB.set(300 * flip, y + 8, z + 30)
    } else {
      // a diagonal over the field: in past your shoulder on one side, over
      // the screen, out over the far hills on the other — or the reverse,
      // so every other flock comes toward you. The line climbs toward its
      // far end so it holds about ten degrees over the horizon from where
      // you stand — the camera's top edge is eighteen — and clears the ridge
      // line (~33 at its highest, ~7° up from here) the whole way, so the
      // flock is always against sky.
      const lift = rand(n * 5 + 704) * 4
      const near = new THREE.Vector3(0, 22 + lift, 40 + rand(n * 5 + 702) * 30)
      const far = new THREE.Vector3(0, 40 + lift, -150 + rand(n * 5 + 703) * 40)
      const toward = n % 4 >= 2
      fA.copy(toward ? far : near).setX(-190 * flip)
      fB.copy(toward ? near : far).setX(190 * flip)
    }
    birds.mat.uniforms.uProgress.value = p
    birds.mat.uniforms.uTime.value = time
  }

  /* ---------------- the mist drift ---------------- */
  const MIST_WRAP = 105
  function drift(dt: number) {
    if (!mist.group.visible) return
    for (const b of mist.banks) {
      const s = b.sprite
      s.position.x += WIND.x * 0.28 * dt
      s.position.z += WIND.y * 0.28 * dt
      // a slow breathing in the height and the width, each on its own beat —
      // measured up from the bank's own bottom edge, so it never sinks into
      // the ground and gets cut off flat (see createMist)
      s.position.y = s.scale.y / 2 + MIST_CLEAR + 0.3 * (1 + Math.sin(time * 0.11 + b.seed))
      s.scale.x = s.scale.y / 0.16 * (0.9 + 0.1 * Math.sin(time * 0.07 + b.seed * 2))
      // wrap on a square, so a bank that leaves downwind comes back upwind
      if (s.position.x > MIST_WRAP) s.position.x -= MIST_WRAP * 2
      if (s.position.z > MIST_WRAP) s.position.z -= MIST_WRAP * 2
    }
  }

  return {
    setDaylight(k, d = 0) {
      if (k === daylight && d === dusk) return
      daylight = k
      dusk = d
      apply(clamp(k), clamp(d))
    },
    setClearing(k) {
      const r = CLEARING_R * clamp(k)
      for (const g of grass) (g.uniforms.uClear.value as THREE.Vector3).z = r
    },
    setWatching(on) {
      watching = on
    },
    update(dt, _elapsed, focus) {
      // a settled frame for reduced motion: the grass still stands, it just
      // does not move, the fireflies hang where they are, the clouds stop,
      // the wind drops, and no meteor ever comes
      if (!reducedMotion()) time += dt
      weather.uWeatherTime.value = time
      for (const g of grass) {
        g.uniforms.uTime.value = time
        g.uniforms.uCenter.value.set(focus.x, focus.z)
        ;(g.uniforms.uFoot.value as THREE.Vector3).set(focus.x, focus.z, 1.7)
      }
      flies.mat.uniforms.uTime.value = time
      sky.mesh.position.set(focus.x, 0, focus.z)
      ;(sky.mat.uniforms.uCenter.value as THREE.Vector2).set(focus.x, focus.z)
      if (!reducedMotion()) meteor()
      flock()
      drift(dt)
    },
    dispose() {
      scene.remove(
        sky.mesh,
        hills.mesh,
        trees.group,
        ...grass.map((g) => g.mesh),
        flies.points,
        birds.mesh,
        mist.group,
      )
      sky.mesh.geometry.dispose()
      sky.mat.dispose()
      hills.mesh.geometry.dispose()
      hills.mat.dispose()
      trees.dispose()
      for (const g of grass) g.dispose()
      flies.points.geometry.dispose()
      flies.mat.dispose()
      birds.mesh.geometry.dispose()
      birds.mat.dispose()
      mist.dispose()
    },
  }
}

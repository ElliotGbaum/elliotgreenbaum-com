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
 * Five things live here, and each has the same two hooks the field itself
 * has: `setDaylight(k)` for the night→day crossfade and `update()` for the
 * frame. Nothing here reads the clock on its own.
 *
 *   sky      a dome with a vertical gradient and a moon, replacing the flat
 *            clear colour. Not fogged, not tone mapped — the horizon colour IS
 *            the field's `sky`, so the seam the field goes to such lengths to
 *            close stays closed.
 *   hills    a ring of low flat-shaded hills past the tree line, mostly
 *            swallowed by the night fog and plainly there by day.
 *   trees    a broken ring of dark broadleaf silhouettes between the field's
 *            edge and the hills.
 *   grass    BY DAY ONLY. Tens of thousands of instanced blades that follow the
 *            figure around: each blade's position is wrapped onto a square
 *            centred on you, so the patch is always underfoot but no blade
 *            ever moves — it is fixed in the world until it drops off one edge
 *            of the square and reappears on the other. They sway, and they
 *            are trodden thin along the line to the projector and bare under
 *            the machine. At night they are gone: a meadow round your legs in
 *            the dark felt like wading, and the ground under the lantern is
 *            better plain. The grass grows in with the daylight crossfade.
 *   fireflies a few dozen points drifting over the field at night, gone by day.
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

export interface Scenery {
  /** 0 = night, 1 = day — the field's crossfade value, pushed here once a frame */
  setDaylight(k: number): void
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
  grass: 0x94b164,
  tree: 0x4e7a4a,
  trunk: 0x5a4a3a,
  hill: 0x7a9670,
  fireflies: 0,
}

/** the moon sits where the field's directional light comes from */
const MOON_DIR = new THREE.Vector3(-46, 62, 40).normalize()

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
function createSky(): { mesh: THREE.Mesh; mat: THREE.ShaderMaterial } {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uHorizon: { value: new THREE.Color(NIGHT.horizon) },
      uZenith: { value: new THREE.Color(NIGHT.zenith) },
      uMoonDir: { value: MOON_DIR.clone() },
      uMoonColor: { value: new THREE.Color(0xe4ecf2) },
      uMoon: { value: NIGHT.moon },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uHorizon;
      uniform vec3 uZenith;
      uniform vec3 uMoonDir;
      uniform vec3 uMoonColor;
      uniform float uMoon;
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
function createTrees(): {
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
 * ================================================================== */
const GRASS_N = PHONE ? 12000 : 40000
/** side of the square the blades are wrapped onto, centred on the figure */
const GRASS_SPAN = PHONE ? 60 : 96
/** blades are scaled away between these two distances from the figure, so the
 *  square's edge is never seen — what you see is grass thinning into the dark */
const GRASS_FADE = PHONE ? [16, 28] : [28, 46]

function bladeGeometry(): THREE.BufferGeometry {
  const SEG = 3
  const W = 0.12
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

function createGrass(clearing: THREE.Vector3, pathFromZ: number, pathToZ: number): {
  mesh: THREE.Mesh
  mat: THREE.MeshLambertMaterial
  uniforms: Record<string, THREE.IUniform>
  dispose(): void
} {
  const geo = bladeGeometry()
  const inst = new THREE.InstancedBufferGeometry()
  inst.index = geo.index
  inst.attributes = geo.attributes

  const offset = new Float32Array(GRASS_N * 4)
  const lean = new Float32Array(GRASS_N)
  for (let i = 0; i < GRASS_N; i++) {
    offset[i * 4] = rand(i * 4 + 1) * GRASS_SPAN
    offset[i * 4 + 1] = rand(i * 4 + 2) * GRASS_SPAN
    // height, in figure units: a mown meadow, ankle-high at most. Shin-high
    // was tried and the figure waded through it.
    offset[i * 4 + 2] = 0.2 + Math.pow(rand(i * 4 + 3), 2) * 0.35
    offset[i * 4 + 3] = rand(i * 4 + 4) * Math.PI * 2
    lean[i] = (rand(i + 9001) - 0.5) * 0.4
  }
  inst.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offset, 4))
  inst.setAttribute('aLean', new THREE.InstancedBufferAttribute(lean, 1))

  const uniforms: Record<string, THREE.IUniform> = {
    uCenter: { value: new THREE.Vector2(0, 0) },
    uSpan: { value: GRASS_SPAN },
    uFade: { value: new THREE.Vector2(GRASS_FADE[0], GRASS_FADE[1]) },
    uClear: { value: new THREE.Vector3(clearing.x, clearing.z, 7.5) },
    uPath: { value: new THREE.Vector3(Math.min(pathFromZ, pathToZ), Math.max(pathFromZ, pathToZ), 3.2) },
    uTime: { value: 0 },
    uDay: { value: 0 },
  }

  const mat = new THREE.MeshLambertMaterial({ color: NIGHT.grass, side: THREE.DoubleSide })
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        attribute vec4 aOffset;
        attribute float aLean;
        uniform vec2 uCenter;
        uniform float uSpan;
        uniform vec2 uFade;
        uniform vec3 uClear;
        uniform vec3 uPath;
        uniform float uTime;
        uniform float uDay;
        varying float vH;`,
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
        float fade = 1.0 - smoothstep(uFade.x, uFade.y, dist);
        // bare ground under the machine, and a trodden line to it
        float clear = smoothstep(uClear.z * 0.45, uClear.z, distance(base, uClear.xy));
        float pz = clamp(base.y, uPath.x, uPath.y);
        float path = mix(0.22, 1.0, smoothstep(uPath.z * 0.3, uPath.z, distance(base, vec2(0.0, pz))));
        // the meadow belongs to the day: it grows in with the light and is
        // gone by night, when the ground under the lantern is plain
        float s = aOffset.z * fade * clear * path * uDay;
        float t = position.y;
        vH = t;
        vec3 p = position * s;
        float sway = sin(uTime * 1.3 + base.x * 0.42 + base.y * 0.31) * 0.16
                   + sin(uTime * 2.1 + base.x * 0.9 - base.y * 0.6) * 0.05;
        p.x += (aLean + sway) * t * t * s * 1.4;
        float c = cos(aOffset.w), sn = sin(aOffset.w);
        vec3 transformed = vec3(c * p.x - sn * p.z, p.y, sn * p.x + c * p.z) + vec3(base.x, 0.0, base.y);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;')
      // darker at the root, lighter at the tip — the one thing that makes a
      // field of identical quads read as blades
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.42, 1.12, vH);',
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
  inst.instanceCount = GRASS_N
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
 * Assembly
 * ================================================================== */
export interface SceneryOptions {
  /** world point the grass is bare around — the machine's footprint */
  clearing: THREE.Vector3
  /** the trodden line runs down x=0 between these two z values */
  pathFromZ: number
  pathToZ: number
}

export function createScenery(scene: THREE.Scene, opts: SceneryOptions): Scenery {
  const sky = createSky()
  const hills = createHills()
  const trees = createTrees()
  const grass = createGrass(opts.clearing, opts.pathFromZ, opts.pathToZ)
  const flies = createFireflies()

  scene.add(sky.mesh, hills.mesh, trees.group, grass.mesh, flies.points)

  const cA = new THREE.Color()
  const cB = new THREE.Color()
  const mix = (out: THREE.Color, a: number, b: number, t: number) => {
    cA.setHex(a)
    cB.setHex(b)
    out.copy(cA).lerp(cB, t)
  }
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t

  let daylight = 0
  let time = 0
  // the point size is in device pixels, so it has to know the ratio once
  flies.mat.uniforms.uScale.value = Math.min(window.devicePixelRatio || 1, 2) * 12

  function apply(k: number) {
    mix(sky.mat.uniforms.uHorizon.value, NIGHT.horizon, DAY.horizon, k)
    mix(sky.mat.uniforms.uZenith.value, NIGHT.zenith, DAY.zenith, k)
    sky.mat.uniforms.uMoon.value = lerp(NIGHT.moon, DAY.moon, k)
    mix(hills.mat.color, NIGHT.hill, DAY.hill, k)
    mix(trees.canopy.color, NIGHT.tree, DAY.tree, k)
    mix(trees.trunk.color, NIGHT.trunk, DAY.trunk, k)
    grass.uniforms.uDay.value = k
    grass.mesh.visible = k > 0.01
    flies.mat.uniforms.uNight.value = lerp(NIGHT.fireflies, DAY.fireflies, k)
    flies.points.visible = flies.mat.uniforms.uNight.value > 0.01
  }
  apply(0)

  return {
    setDaylight(k) {
      if (k === daylight) return
      daylight = k
      apply(clamp(k))
    },
    update(dt, _elapsed, focus) {
      // a settled frame for reduced motion: the grass still stands, it just
      // does not move, and the fireflies hang where they are
      if (!reducedMotion()) time += dt
      grass.uniforms.uTime.value = time
      grass.uniforms.uCenter.value.set(focus.x, focus.z)
      flies.mat.uniforms.uTime.value = time
      sky.mesh.position.set(focus.x, 0, focus.z)
    },
    dispose() {
      scene.remove(sky.mesh, hills.mesh, trees.group, grass.mesh, flies.points)
      sky.mesh.geometry.dispose()
      sky.mat.dispose()
      hills.mesh.geometry.dispose()
      hills.mat.dispose()
      trees.dispose()
      grass.dispose()
      flies.points.geometry.dispose()
      flies.mat.dispose()
    },
  }
}

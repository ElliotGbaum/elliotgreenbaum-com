/**
 * The field — ground, sky, fog and the light that decides what time it is.
 *
 * Design note: darkness here is doing double duty. It's the concept (nothing
 * is visible until you look at it) and it's the performance budget (fog kills
 * draw distance for free). The one thing it must never become is *murk* —
 * hence the lifted ambient and the horizon tint below.
 *
 * TWO TIMES OF DAY. Night is the default and the argument: you carry a lantern
 * because the field is dark and the projector needs light. Day exists because
 * that argument is only interesting if you can see the thing it costs you —
 * switch it and the lantern stops mattering, the beacon stops being the only
 * way to find anything, and the world turns out to have been a field the whole
 * time. Everything below is expressed as two `Look`s and a crossfade between
 * them, so there is exactly one place to tune either state.
 */

import * as THREE from 'three'
import { PALETTE, clamp, ease, rand } from '../core/contract'

export const FIELD_RADIUS = 90

export type TimeOfDay = 'night' | 'day'

/**
 * How far the floor keeps going, in world units across. Deliberately not
 * FIELD_RADIUS: that is how far you may *walk*, this is how far the ground has
 * to reach so that its edge dies in the fog instead of showing up as a hard
 * diagonal against the sky.
 *
 * It used to be 2.6× the field radius, which left only 27 units of floor past
 * the point you are allowed to walk to. Stand at the far boundary and that
 * edge is a hard diagonal line across the sky, well inside the fog. At ~200
 * units the fog is 99% opaque, so that is the clearance.
 *
 * Daylight thins the fog a long way — that is most of what daylight *is* here —
 * so the floor has to reach far enough that the edge is still out of sight at
 * the day density, not just the night one.
 */
const GROUND_SIZE = FIELD_RADIUS * 13
/**
 * World units per speckle tile. Coarser than it was, because the ground got
 * a lot bigger and this is held constant: at the old 5.1 the texture repeats
 * 229 times across the plane, which past the middle distance is finer than a
 * pixel and turns the daylight ground into television static. Grain you can
 * resolve is texture; grain you can't is noise.
 */
const SPECKLE_TILE = 7.6

/** seconds to cross between night and day */
const FADE = 1.5

/* ------------------------------------------------------------------ *
 * The two looks
 *
 * `sky` and `haze` are the same colour conceptually and different numbers on
 * purpose. Fog is shaded in the fragment shader and therefore goes through
 * ACES tone mapping; a flat background colour is a clear-buffer write and does
 * not. Give them one hex and the horizon grows a seam — the fogged ground
 * reads darker than the sky directly above it. So `sky` is authored as what
 * `haze` *looks like* after the tone curve, and the horizon closes up.
 * ------------------------------------------------------------------ */
interface Look {
  /** clear colour behind everything — NOT tone mapped */
  sky: number
  /** fog colour — IS tone mapped */
  haze: number
  fogDensity: number
  /** multiplied over the neutral speckle texture to make the ground's albedo */
  ground: number
  hemiSky: number
  hemiGround: number
  hemiIntensity: number
  fillColor: number
  fillIntensity: number
  sunColor: number
  sunIntensity: number
  /** star field opacity — 0 puts the whole thing away */
  stars: number
  exposure: number
}

/* Night. Lifted a step from the first pass, and a smaller step again after
   that: the fog is a touch bluer and thinner, the ground albedo and the
   ambient are both up. The brief was "slightly brighter", which means further
   to see and more shape in what you see — not a grey wash over the top.

   The lift is authored in LINEAR light and converted back to hex, not nudged
   in a colour picker — +12% on the air, +15% on the ground. Nudging the sRGB
   bytes instead lifts the shadows far more than the midtones and the field
   goes milky. `exposure` is deliberately NOT part of it: it multiplies before
   the tone curve, so raising it brightens the fog (tone mapped) without
   touching `sky` (a clear-buffer write, not tone mapped), and the horizon
   seam the two colours exist to close would open back up. */
const NIGHT: Look = {
  sky: 0x182d36,
  haze: 0x162a34,
  fogDensity: 0.0084,
  // dark enough that the ground is a suggestion, not a surface. Derived: the
  // hand-authored dusk texture this replaced sat at a linear (0.0030, 0.0097,
  // 0.0110), which over SPECKLE_BASE is #213E42 — this is that, half again
  // brighter, which is the "slightly brighter" of two passes of the brief.
  ground: 0x28494d,
  hemiSky: 0x3d616f,
  hemiGround: 0x111f24,
  hemiIntensity: 1.86,
  fillColor: PALETTE.horizon,
  fillIntensity: 1.06,
  // a moon: nowhere near enough to light the field, just enough that the
  // figure and the machine have a lit side and a dark one
  sunColor: 0xa8c0d6,
  sunIntensity: 0.38,
  stars: 0.55,
  exposure: 1.36,
}

/* Day. The fog does not go away — it opens up. Keeping a real density means
   distance still reads as distance and the ground's edge still dies in haze
   rather than ending, which is the one thing the night look must not lose on
   the way over. */
const DAY: Look = {
  sky: 0xa9c8d9,
  haze: 0xbcd6e4,
  fogDensity: 0.0042,
  // dry grass. Reads far lighter than it looks written down, because it is a
  // tint over SPECKLE_BASE rather than a colour: the ground's actual albedo
  // lands around 0.15, which is what real dry grass reflects.
  ground: 0xcbdcb1,
  hemiSky: 0xbcd8ea,
  hemiGround: 0x5b6150,
  hemiIntensity: 1.95,
  fillColor: 0xdfe7ee,
  fillIntensity: 0.42,
  sunColor: 0xfff1d6,
  sunIntensity: 2.35,
  stars: 0,
  exposure: 1.02,
}

/** linear 0…1 → the sRGB byte that encodes it */
function encode(linear: number): number {
  const v = clamp(linear)
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
  return Math.round(s * 255)
}

/**
 * How much brighter the brightest fleck is than the ground it sits on.
 * Night hides almost any value here; daylight hides none of it, and much past
 * 2 the field stops reading as ground with grain in it and starts reading as
 * gravel, or worse, as snow.
 */
const SPECKLE_CONTRAST = 2.15
/** the base tone of the neutral texture, in LINEAR light */
const SPECKLE_BASE = 0.22

/**
 * Faint speckle so the ground has texture to move against — without it,
 * drifting reads as standing still.
 *
 * Authored NEUTRAL — a mid-grey base with brighter flecks — so the material's
 * colour is the single thing deciding whether this is a dark field or a sunlit
 * one, and the crossfade between them is one colour lerp.
 *
 * THE VALUES ARE COMPUTED IN LINEAR LIGHT, not picked in the colour picker.
 * That distinction is the whole reason this function looks like this. The
 * renderer multiplies the material colour by the *linearised* texel, so a
 * fleck authored as "2.9× the base" in sRGB bytes lands as ten times the base
 * once it is linearised — which is invisible against a near-black night
 * ground and reads as television static against a lit one. Author the ratio
 * where the multiply happens and it means the same thing at both ends.
 */
function groundTexture(repeat: number): THREE.CanvasTexture {
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const c = cv.getContext('2d')!

  const base = encode(SPECKLE_BASE)
  c.fillStyle = `rgb(${base},${base},${base})`
  c.fillRect(0, 0, S, S)

  for (let i = 0; i < 900; i++) {
    const x = rand(i * 2 + 1) * S
    const y = rand(i * 2 + 7) * S
    const r = 0.4 + rand(i + 31) * 1.5
    const lift = 1 + rand(i + 97) * (SPECKLE_CONTRAST - 1)
    const g = encode(SPECKLE_BASE * lift)
    c.fillStyle = `rgb(${g},${g},${g})`
    c.beginPath()
    c.arc(x, y, r, 0, Math.PI * 2)
    c.fill()
  }

  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat, repeat)
  tex.colorSpace = THREE.SRGBColorSpace
  // the ground is seen almost entirely at grazing angles, which is the exact
  // case trilinear filtering handles worst — without this the middle distance
  // is a smear and the far ground shimmers
  tex.anisotropy = 8
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
  /** which look we are heading for — flips the instant the switch is thrown */
  readonly mode: TimeOfDay
  /** 0 = full night, 1 = full day. The live crossfade value, eased. Anything
   *  that has to know what time it is reads this, not `mode`. */
  readonly daylight: number
  /** what the renderer's tone-mapping exposure should be this frame */
  readonly exposure: number
  setMode(mode: TimeOfDay, instant?: boolean): void
  update(dt: number): void
  dispose(): void
}

export function createField(scene: THREE.Scene): Field {
  // Fog is lifted well above the ground colour on purpose: distance should
  // fade to dusk, not to black. Density tuned so the projector beacon ~45
  // units out still reads clearly from the spawn point — if you can't see the
  // beacon, the whole navigation model is gone.
  const air = new THREE.Color(NIGHT.haze)
  scene.background = new THREE.Color(NIGHT.sky)
  scene.fog = new THREE.FogExp2(air.getHex(), NIGHT.fogDensity)
  const fog = scene.fog as THREE.FogExp2
  const background = scene.background as THREE.Color

  const tex = groundTexture(Math.round(GROUND_SIZE / SPECKLE_TILE))
  const geo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 1, 1)
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    color: NIGHT.ground,
    roughness: 0.96,
    metalness: 0,
  })
  const ground = new THREE.Mesh(geo, mat)
  ground.rotation.x = -Math.PI / 2
  ground.name = 'ground'
  scene.add(ground)

  const sky = stars()
  const skyMat = sky.material as THREE.PointsMaterial
  scene.add(sky)

  // Just enough ambient that unlit geometry reads as silhouette rather than
  // absence. Two sources: a cool sky term and a slightly warmer bounce.
  const hemi = new THREE.HemisphereLight(NIGHT.hemiSky, NIGHT.hemiGround, NIGHT.hemiIntensity)
  scene.add(hemi)

  const fill = new THREE.AmbientLight(NIGHT.fillColor, NIGHT.fillIntensity)
  scene.add(fill)

  // The one directional in the scene: a moon at night, the sun by day. It is
  // what gives the figure a lit side — ambient alone makes a walking armature
  // look like a paper cutout. No shadow map; the fake contact darkening the
  // world already relies on is cheaper and this world is hazy anyway.
  const sun = new THREE.DirectionalLight(NIGHT.sunColor, NIGHT.sunIntensity)
  sun.position.set(-46, 62, 40)
  sun.castShadow = false
  scene.add(sun)
  scene.add(sun.target)

  /* ---------------- the crossfade ---------------- */

  let mode: TimeOfDay = 'night'
  let want = 0 // where we are going: 0 night, 1 day
  let raw = 0 // linear progress
  let k = 0 // eased — this is `daylight`
  let exposure = NIGHT.exposure

  // scratch, so a per-frame crossfade allocates nothing
  const cA = new THREE.Color()
  const cB = new THREE.Color()
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const mix = (out: THREE.Color, a: number, b: number, t: number) => {
    cA.setHex(a)
    cB.setHex(b)
    out.copy(cA).lerp(cB, t)
  }

  function apply(t: number) {
    mix(background, NIGHT.sky, DAY.sky, t)
    mix(fog.color, NIGHT.haze, DAY.haze, t)
    fog.density = lerp(NIGHT.fogDensity, DAY.fogDensity, t)

    mix(mat.color, NIGHT.ground, DAY.ground, t)

    mix(hemi.color, NIGHT.hemiSky, DAY.hemiSky, t)
    mix(hemi.groundColor, NIGHT.hemiGround, DAY.hemiGround, t)
    hemi.intensity = lerp(NIGHT.hemiIntensity, DAY.hemiIntensity, t)

    mix(fill.color, NIGHT.fillColor, DAY.fillColor, t)
    fill.intensity = lerp(NIGHT.fillIntensity, DAY.fillIntensity, t)

    mix(sun.color, NIGHT.sunColor, DAY.sunColor, t)
    sun.intensity = lerp(NIGHT.sunIntensity, DAY.sunIntensity, t)

    skyMat.opacity = lerp(NIGHT.stars, DAY.stars, t)
    sky.visible = skyMat.opacity > 0.01

    exposure = lerp(NIGHT.exposure, DAY.exposure, t)
  }

  apply(0)

  return {
    ground,

    get mode() {
      return mode
    },
    get daylight() {
      return k
    },
    get exposure() {
      return exposure
    },

    setMode(next: TimeOfDay, instant = false) {
      mode = next
      want = next === 'day' ? 1 : 0
      if (instant) {
        raw = want
        k = want
        apply(k)
      }
    },

    update(dt: number) {
      if (raw === want) return
      const step = dt / FADE
      raw = want > raw ? Math.min(want, raw + step) : Math.max(want, raw - step)
      k = ease(clamp(raw))
      apply(k)
    },

    dispose() {
      geo.dispose()
      mat.dispose()
      tex.dispose()
      sky.geometry.dispose()
      skyMat.dispose()
      scene.remove(ground, sky, hemi, fill, sun, sun.target)
    },
  }
}

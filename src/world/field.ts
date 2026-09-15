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
 *
 * AND THE HOUR BETWEEN. The crossfade is driven by the height of the sun
 * (`setSun`), not by a switch, and on its way from one look to the other it
 * passes through a third: the golden hour, `DUSK`, a warm tint the two-state
 * mix is pulled toward while the sun is near the horizon. It is not a state
 * the field can rest in — `dusk` rises and falls again over about twenty
 * minutes of real sun — so everything that reads the field still reads one
 * number, `daylight`, and the few things that care about the colour of the
 * light read `dusk` beside it. `setMode` is still here for the dev switch
 * and for anything that only knows day from night: it parks the sun high or
 * puts it as low as it goes.
 *
 * AS LOW AS IT GOES is not night any more. Since 2026-09-15 `setSun` clamps
 * the sun at `SUN_FLOOR` (core/sun.ts, three degrees over the hills), so the
 * darkest the field ever gets is the start of the golden hour: warm sky,
 * gold grass, lanterns lit.
 * Elliot asked for it — the full night looked worse to him every time. The
 * NIGHT look is still the far end of the crossfade and still tunes what the
 * dusk mix is pulled from, but no visitor sees it whole.
 */

import * as THREE from 'three'
import { PALETTE, clamp, ease, rand, reducedMotion } from '../core/contract'
import { WEATHER_GLSL, weatherUniforms } from './weather'
import { SUN_FLOOR } from '../core/sun'

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
  // lands around 0.15, which is what real dry grass reflects. Its hue is the
  // scenery's DAY.grass, pulled paler: by day the blades stand on this, and
  // where they thin out with distance the ground has to be the same colour
  // as the field of them, or their far edge draws a line across the shot.
  ground: 0xc4d69a,
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

/* The golden hour. Authored as where the day→night mix goes when the sun is
   on the horizon: the air goes warm and a little thicker, the light comes in
   low and orange, the ground loses its green. The sky here must equal the
   scenery's DUSK.horizon — same trick as the other two. */
const DUSK: Look = {
  sky: 0xe4b08c,
  haze: 0xe8c0a4,
  fogDensity: 0.0054,
  ground: 0xbcb07c,
  hemiSky: 0xdcb49c,
  hemiGround: 0x4a4038,
  hemiIntensity: 1.6,
  fillColor: 0xdcb89e,
  fillIntensity: 0.48,
  sunColor: 0xffbe80,
  sunIntensity: 2.0,
  stars: 0.12,
  exposure: 1.06,
}

/** where the sun is by day (and the moon by night), and where it drops to at dusk */
const SUN_HIGH = new THREE.Vector3(-46, 62, 40)
const SUN_LOW = new THREE.Vector3(-46, 16, 40)

/**
 * Sun elevation in degrees → how much day, and how much golden hour.
 * `daylight` climbs from nothing at seven degrees under the horizon to full at
 * five over it, which spans civil dusk (the old switch flipped at -4). `dusk`
 * is a bump over the same band: nothing well under, nothing well over, most
 * of it with the sun a degree or two either side of the hills.
 */
function sunToLook(elevation: number): { daylight: number; dusk: number } {
  const s = (a: number, b: number) => {
    const t = clamp((elevation - a) / (b - a))
    return t * t * (3 - 2 * t)
  }
  return {
    daylight: s(-7, 5),
    dusk: s(-7, -1) * (1 - s(1.5, 12)),
  }
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

/**
 * Large-scale tone variation across the ground, baked into vertex colours.
 *
 * The speckle texture gives the ground grain; this gives it *patches* — a
 * darker hollow here, a paler worn stretch there — at a scale of tens of
 * units, which is what stops the plane reading as a plane. It is a multiplier
 * around 1, authored in linear light like everything else on the ground, so
 * it changes the ground's shape and not its colour, and it costs nothing per
 * frame: the geometry is a grid instead of two triangles, and that is all.
 */
const MOTTLE_SEGS = 140
function mottle(geo: THREE.BufferGeometry): void {
  const pos = geo.getAttribute('position')
  const col = new Float32Array(pos.count * 3)
  const smooth = (t: number) => t * t * (3 - 2 * t)
  const value = (x: number, y: number, seed: number) => {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const fx = smooth(x - ix)
    const fy = smooth(y - iy)
    const h = (a: number, b: number) => rand(a * 131 + b * 17 + seed)
    const a = h(ix, iy) + (h(ix + 1, iy) - h(ix, iy)) * fx
    const b = h(ix, iy + 1) + (h(ix + 1, iy + 1) - h(ix, iy + 1)) * fx
    return a + (b - a) * fy
  }
  for (let i = 0; i < pos.count; i++) {
    // the plane is authored flat in x/y and rotated onto the ground later
    const x = pos.getX(i)
    const y = pos.getY(i)
    const n = value(x / 38, y / 38, 5) * 0.6 + value(x / 13, y / 13, 9) * 0.4
    const k = 0.72 + n * 0.56
    col[i * 3] = k
    col[i * 3 + 1] = k
    col[i * 3 + 2] = k
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
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
  /** 0..1, how far into the golden hour: the warm tint on top of `daylight` */
  readonly dusk: number
  /** what the renderer's tone-mapping exposure should be this frame */
  readonly exposure: number
  /** park the sun high (day) or well under (night) — the dev switch's verb */
  setMode(mode: TimeOfDay, instant?: boolean): void
  /** where the sun actually is, degrees over the horizon; the field crossfades toward it */
  setSun(elevation: number, instant?: boolean): void
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
  const geo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, MOTTLE_SEGS, MOTTLE_SEGS)
  mottle(geo)
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    vertexColors: true,
    color: NIGHT.ground,
    roughness: 0.96,
    metalness: 0,
  })
  // Cloud shadows: the same field the sky draws its clouds from and the
  // grass darkens under (weather.ts), sampled at the ground's world position.
  // `uCloudShade` is how much of the sun a cloud can take — all of it by day,
  // none at night when there is no sun to shade.
  const weather = weatherUniforms()
  const cloudShade = { value: 0 }
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, weather, { uCloudShade: cloudShade })
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCloudXZ;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvCloudXZ = (modelMatrix * vec4(transformed, 1.0)).xz;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${WEATHER_GLSL}\nuniform float uCloudShade;\nvarying vec2 vCloudXZ;`)
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb *= 1.0 - (1.0 - cloudShade(vCloudXZ, uWeatherTime)) * uCloudShade;',
      )
  }
  mat.customProgramCacheKey = () => 'ground-cloud'
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
  let wantDusk = 0 // how golden the hour we are going to is
  let d = 0 // the live value — this is `dusk`
  let exposure = NIGHT.exposure
  let time = 0 // the clouds' clock; runs with the scenery's

  // scratch, so a per-frame crossfade allocates nothing
  const cA = new THREE.Color()
  const cB = new THREE.Color()
  const cC = new THREE.Color()
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  /** night→day by t, then toward dusk by u */
  const blend = (a: number, b: number, c: number, t: number, u: number) => lerp(lerp(a, b, t), c, u)
  const mix = (out: THREE.Color, a: number, b: number, c: number, t: number, u: number) => {
    cA.setHex(a)
    cB.setHex(b)
    cC.setHex(c)
    out.copy(cA).lerp(cB, t).lerp(cC, u)
  }

  function apply(t: number, u: number) {
    // The sky goes all the way to the golden hour's colour — half-way between
    // a blue sky and a peach one is grey, which is an overcast, not a sunset.
    // The ground and the light take less of it: a field fully pulled into
    // the tint is a sepia photograph.
    const ug = u * 0.5
    const ul = u * 0.75
    mix(background, NIGHT.sky, DAY.sky, DUSK.sky, t, u)
    mix(fog.color, NIGHT.haze, DAY.haze, DUSK.haze, t, u)
    fog.density = blend(NIGHT.fogDensity, DAY.fogDensity, DUSK.fogDensity, t, u)

    mix(mat.color, NIGHT.ground, DAY.ground, DUSK.ground, t, ug)
    // a cloud can only shade what the sun lights: nothing at night, and less
    // in the golden hour, when the light comes in under the sheet
    cloudShade.value = t * (1 - u * 0.5)

    mix(hemi.color, NIGHT.hemiSky, DAY.hemiSky, DUSK.hemiSky, t, ul)
    mix(hemi.groundColor, NIGHT.hemiGround, DAY.hemiGround, DUSK.hemiGround, t, ul)
    hemi.intensity = blend(NIGHT.hemiIntensity, DAY.hemiIntensity, DUSK.hemiIntensity, t, ul)

    mix(fill.color, NIGHT.fillColor, DAY.fillColor, DUSK.fillColor, t, ul)
    fill.intensity = blend(NIGHT.fillIntensity, DAY.fillIntensity, DUSK.fillIntensity, t, ul)

    mix(sun.color, NIGHT.sunColor, DAY.sunColor, DUSK.sunColor, t, ul)
    sun.intensity = blend(NIGHT.sunIntensity, DAY.sunIntensity, DUSK.sunIntensity, t, ul)
    // the light comes in low as the sun goes down — the same place the
    // scenery draws the sun's disc
    sun.position.copy(SUN_HIGH).lerp(SUN_LOW, u)

    skyMat.opacity = blend(NIGHT.stars, DAY.stars, DUSK.stars, t, u)
    sky.visible = skyMat.opacity > 0.01

    exposure = blend(NIGHT.exposure, DAY.exposure, DUSK.exposure, t, u)
  }

  apply(0, 0)

  function aim(daylight: number, dusk: number, instant: boolean) {
    want = daylight
    wantDusk = dusk
    mode = daylight >= 0.5 ? 'day' : 'night'
    if (instant) {
      raw = want
      k = ease(clamp(raw))
      d = wantDusk
      apply(k, d)
    }
  }

  return {
    ground,

    get mode() {
      return mode
    },
    get daylight() {
      return k
    },
    get dusk() {
      return d
    },
    get exposure() {
      return exposure
    },

    setMode(next: TimeOfDay, instant = false) {
      this.setSun(next === 'day' ? 40 : SUN_FLOOR, instant)
    },

    setSun(elevation: number, instant = false) {
      const look = sunToLook(Math.max(SUN_FLOOR, elevation))
      aim(look.daylight, look.dusk, instant)
    },

    update(dt: number) {
      // the clouds hold still under reduced motion, like everything in the scenery
      if (!reducedMotion()) time += dt
      weather.uWeatherTime.value = time
      if (raw === want && d === wantDusk) return
      const step = dt / FADE
      raw = want > raw ? Math.min(want, raw + step) : Math.max(want, raw - step)
      d = wantDusk > d ? Math.min(wantDusk, d + step) : Math.max(wantDusk, d - step)
      k = ease(clamp(raw))
      apply(k, d)
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

/**
 * Weather — the two things that move ACROSS the field rather than in it.
 *
 * Everything else in the world sways in place. These are the two signals
 * that travel: a sheet of cloud drifting over the meadow, and gusts of wind
 * rolling through the grass and into the tree line a beat later. Both are
 * cheap noise functions evaluated in the shaders, and both are here rather
 * than in one material because more than one material has to agree on them —
 * the ground's shadow has to be the grass's shadow, the cloud overhead has to
 * be the shadow underfoot, and the gust that flattens the grass has to be
 * the one the canopies lean to.
 *
 * Nothing here is a draw call. It is one wind direction, two GLSL functions,
 * and a note on the units.
 *
 *   cloudShade(xz, t)  0..1, how much of the sun reaches this point on the
 *                      ground. 1 in the clear, ~0.6 under the middle of a
 *                      cloud. The same field, sampled overhead, is what the sky
 *                      draws as cloud.
 *   gust(xz, t)        0..1, how hard the wind is blowing here right now. Sits
 *                      near 0.15 in the lulls and climbs to 1 as a gust front
 *                      passes. Fronts are long bands across the wind and run
 *                      downwind at a walking pace, so you see a gust as a thing
 *                      that arrives, crosses you, and leaves.
 *
 * Units are the figure's (see scenery.ts). Time is the scenery's own clock,
 * which holds still under reduced motion — so under reduced motion the
 * clouds stop and the wind drops, and nothing here needs to know.
 */

import * as THREE from 'three'

/** which way the wind blows, in the ground plane (x, z); unit length */
export const WIND = new THREE.Vector2(0.83, 0.56).normalize()

/** how fast the cloud sheet drifts, units per second */
export const CLOUD_SPEED = 1.15

/** how fast a gust front travels, units per second — a brisk walk */
export const GUST_SPEED = 4.6

/**
 * The shared GLSL. Two-octave value noise on a hash — nothing fancy, and
 * nothing that has to match `rand()` on the CPU, because nothing on the CPU
 * ever needs to know where a cloud is. It only has to be the SAME function in
 * every shader that includes this string.
 */
export const WEATHER_GLSL = /* glsl */ `
  uniform vec2 uWind;
  uniform float uWeatherTime;

  float wHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float wNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = wHash(i);
    float b = wHash(i + vec2(1.0, 0.0));
    float c = wHash(i + vec2(0.0, 1.0));
    float d = wHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  // 0..1 cloud cover at a point of the ground plane. Big soft cells with a
  // finer octave ragging the edges, drifting downwind. Coverage is sparse on
  // purpose: a field mostly in sun with the odd shadow crossing it, not an
  // overcast.
  float cloudCover(vec2 xz, float t) {
    vec2 p = (xz - uWind * t * ${CLOUD_SPEED.toFixed(2)}) * 0.0065;
    float n = wNoise(p) * 0.64 + wNoise(p * 2.3 + 7.1) * 0.26 + wNoise(p * 5.1 + 3.3) * 0.10;
    return smoothstep(0.58, 0.80, n);
  }
  // how much sun reaches the ground here: 1 in the clear, dimmer under cloud.
  // Edges are soft because the sun is not a point and the cloud is high.
  float cloudShade(vec2 xz, float t) {
    return 1.0 - cloudCover(xz, t) * 0.42;
  }
  // 0..1 gust strength. Fronts are bands across the wind: a 1-D noise along
  // the downwind axis, moving at GUST_SPEED, and a slower, wider noise across
  // it so a front is not the same strength from one side of the field to the
  // other.
  float gust(vec2 xz, float t) {
    float along = dot(xz, uWind) - t * ${GUST_SPEED.toFixed(2)};
    float across = dot(xz, vec2(-uWind.y, uWind.x));
    float g = wNoise(vec2(along * 0.045, across * 0.012 + 11.0));
    float fine = wNoise(vec2(along * 0.16 + 5.0, across * 0.05));
    g = smoothstep(0.42, 0.82, g) * (0.7 + 0.3 * fine);
    return 0.15 + 0.85 * g;
  }
`

/** the uniforms WEATHER_GLSL reads — share ONE object so every material ticks together */
export function weatherUniforms(): { uWind: THREE.IUniform; uWeatherTime: THREE.IUniform } {
  return {
    uWind: { value: WIND.clone() },
    uWeatherTime: { value: 0 },
  }
}

/**
 * The lens — how every camera in this project answers "the window is a
 * different shape now".
 *
 * THE BUG THIS EXISTS TO KILL. three.js takes a VERTICAL field of view and
 * derives the horizontal one from the aspect ratio, so a camera left alone
 * holds its vertical angle and lets the horizontal do whatever the window
 * says. That is the "Hor+" rule, it is what Minecraft does, and for a
 * first-person game on a 16:9 monitor it is correct. Taken to the ends of the
 * range it falls apart in both directions, and both were on screen here:
 *
 *   · Maximised on a wide desktop (2.4:1) the horizontal angle opens to ~95°.
 *     Everything in the middle of the frame shrinks, the edges shear the way
 *     any rectilinear projection shears at that angle, and the composition —
 *     figure, projector, screen, two signs — spreads into a thin band with a
 *     dead black gutter under it. This is what "it goes super stretched
 *     fullscreen" was.
 *   · Dragged narrow (0.8:1) the same fixed vertical angle leaves ~43°
 *     horizontal. The signs at x = ±26 fall off both sides, the field becomes
 *     a corridor, and the shot reads as a zoom rather than a window. This is
 *     what "it goes narrow" was.
 *
 * WHAT REPLACES IT. The frame keeps the same amount of world in it, and only
 * its shape changes. Formally: `tan(h/2) · tan(v/2)` is held constant, which
 * fixes the area of the frustum's cross-section — widen the window and the
 * lens gives back a little height for the width it gains. It is the geometric
 * mean of the two naive rules (hold the vertical, hold the horizontal) and it
 * happens to hold the DIAGONAL angle nearly constant too, so lens distortion
 * at the corners barely moves across the whole range. A shot framed once at
 * 16:9 then reads at 21:9 and at 4:5 without being framed again.
 *
 * Everything is expressed against ONE reference shape. Author a shot at
 * `REFERENCE_ASPECT` — pick the vertical fov that looks right on a laptop —
 * and hand that number to `fitFov` on every resize. At 16:9 you get exactly
 * what you authored back.
 *
 * WHO DOES NOT USE THIS, and it is not an oversight: src/surf/scene.ts locks
 * its HORIZONTAL angle outright. A runner's whole game is three lanes and
 * what is coming down them, so the width of the track is not something to
 * trade away for height on a phone — see the note at the top of that file.
 * The rule here is for shots that are composed rather than aimed.
 */

/** the shape every fov in this project is authored against: a laptop, 16:9 */
export const REFERENCE_ASPECT = 16 / 9

const DEG = Math.PI / 180
const halfTan = (fovDeg: number) => Math.tan(fovDeg * DEG * 0.5)
const fromHalfTan = (t: number) => (2 * Math.atan(t)) / DEG

export interface LensLimits {
  /**
   * How hard the rule is applied. 1 holds the visible area exactly; 0 is the
   * old fixed-vertical behaviour. Below 1 the frame gives up some width on a
   * narrow window rather than swinging the lens all the way — which is what
   * you want when a camera can also solve the problem by backing off.
   */
  strength?: number
  /** never narrower than this vertically, whatever the aspect says */
  min?: number
  /** …and never wider. The rail that stops a phone getting a fisheye. */
  max?: number
  /**
   * A ceiling on the HORIZONTAL angle, for the ultrawide end. Past roughly
   * 100° a rectilinear projection smears anything near the left and right
   * edges badly enough to read as a rendering fault, and holding the visible
   * area constant is not enough to stop it on a 32:9 monitor.
   */
  maxHorizontal?: number
}

/**
 * The vertical fov to actually give three.js, for a shot authored at
 * `refFov` on a 16:9 window.
 *
 * The vertical clamp is the outer rail: if `maxHorizontal` and `min` ever
 * disagree — which takes something past 32:9 — the rail wins, because a lens
 * narrower than `min` is a shot nobody framed.
 */
export function fitFov(refFov: number, aspect: number, limits: LensLimits = {}): number {
  const { strength = 1, min = 20, max = 90, maxHorizontal = 0 } = limits
  // A zero-width window is not a shape, it is a window mid-drag or a tab that
  // has not been laid out yet, and dividing by it poisons the projection
  // matrix for every frame after.
  const a = aspect > 0.05 && Number.isFinite(aspect) ? aspect : REFERENCE_ASPECT

  let t = halfTan(refFov) * Math.pow(REFERENCE_ASPECT / a, strength * 0.5)
  if (maxHorizontal > 0) t = Math.min(t, halfTan(maxHorizontal) / a)

  return Math.min(max, Math.max(min, fromHalfTan(t)))
}

/**
 * How much width the clamps cost, as a multiplier ≥ 1: what `fitFov` wanted
 * to show against what it was allowed to.
 *
 * This is the other half of the answer at the ends of the range. The lens
 * alone cannot cover a phone — the honest fov for 9:19.5 is past 85°, which is
 * a fisheye — so it is clamped, and the camera makes up the difference by
 * standing further back. Multiply the rig's offset by this and the subject
 * keeps the size it had on a laptop instead of collapsing into the middle of
 * the frame. It is 1 whenever the lens got what it asked for, so a normal
 * desktop window never moves the camera at all.
 *
 * WHAT IT IS ANSWERING TODAY, in this project, is the ultrawide end and not
 * the tall one: the field rig floors the shape it fits at (see `ASPECT_FLOOR`
 * in src/world/camera.ts) so the vertical rail is never reached, and what is
 * left to move that camera is `maxHorizontal` biting past 3.19:1 — a 32:9
 * monitor stands it off by 0.7%. The tall window is answered by `fovSurplus`
 * below instead, and the note there says why standing off could not do it.
 */
export function fovShortfall(refFov: number, aspect: number, limits: LensLimits = {}): number {
  const a = aspect > 0.05 && Number.isFinite(aspect) ? aspect : REFERENCE_ASPECT
  const want = halfTan(refFov) * Math.pow(REFERENCE_ASPECT / a, (limits.strength ?? 1) * 0.5)
  const got = halfTan(fitFov(refFov, aspect, limits))
  return got > 0.0001 ? Math.max(1, want / got) : 1
}

/**
 * How much vertical the lens opened BEYOND the shape the shot was authored
 * at, as a fraction of the frame's half-height: 0 … 1.
 *
 * `fovShortfall`, above, answers "what did the clamps cost in width". This
 * answers a different question — "how much height did the fit hand me that
 * nobody framed for" — and they are two numbers because they are two problems.
 * Width can be bought back by standing further off. Height cannot be given
 * back at all: `fitFov` spends it through a SYMMETRIC frustum, so half of every
 * degree it opens goes below the axis the shot is aimed along, and if there is
 * nothing down there that half is a dead band across the bottom edge that
 * grows as the window narrows. Backing off cannot touch it — a similarity
 * transform about the subject changes how much world is in the frame and can
 * never change where in the frame anything sits.
 *
 * A camera that knows its own composition can spend this upward instead, by
 * shifting the frustum rather than re-aiming it: see `resize()` in
 * src/world/camera.ts. Hand it the SAME aspect the fov was fitted at or the
 * two disagree. It is exactly 0 at `REFERENCE_ASPECT` and at every window
 * wider than it, so a shot that spends it comes back bit-for-bit on a laptop.
 */
export function fovSurplus(refFov: number, aspect: number, limits: LensLimits = {}): number {
  const got = halfTan(fitFov(refFov, aspect, limits))
  return got > 0.0001 ? Math.max(0, 1 - halfTan(refFov) / got) : 0
}

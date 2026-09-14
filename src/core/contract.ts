/**
 * Shared contract — the only file every subsystem is allowed to depend on.
 *
 * If you are adding a landmark, a prop or a film act, you implement one of
 * the interfaces below and you do not reach into any other module.
 */

import type * as THREE from 'three'

/* ------------------------------------------------------------------ *
 * Palette
 *
 * One source of truth for colour, shared by the 3D world, the 2D film
 * canvas and the DOM chrome, so the whole thing reads as one object.
 * Dusk-blue, never black — murk is the failure mode of a dark world.
 * ------------------------------------------------------------------ */
export const PALETTE = {
  /** deep dusk ground/fog — the colour of "not looked at yet" */
  night: 0x0a1418,
  nightCss: '#0A1418',
  /** slightly lifted horizon so the world never reads as a void */
  horizon: 0x14262b,
  horizonCss: '#14262B',

  /** the player's light. warm, so everything it touches feels handled */
  glow: 0xffc46b,
  glowCss: '#FFC46B',
  /** the accent used for anything interactive or important */
  amber: 0xe3a94a,
  amberCss: '#E3A94A',
  amberLit: 0xf3c77e,
  amberLitCss: '#F3C77E',

  /** paper/screen white — film typography, lit surfaces */
  buff: 0xe9e4d6,
  buffCss: '#E9E4D6',
  /** muted supporting text */
  sage: 0x9faea6,
  sageCss: '#9FAEA6',
  /** the one cool accent, used sparingly against all the warmth */
  mint: 0x63c9a8,
  mintCss: '#63C9A8',
} as const

/* ------------------------------------------------------------------ *
 * Landmarks
 * ------------------------------------------------------------------ */

export interface LandmarkContext {
  /** start the film */
  playFilm(): void
  /**
   * Go through the portal, into the parkour — and OPTIONAL, along with the one
   * below it, because the field is not currently offering either door. Both
   * minigames are shelved; see the note at the top of src/main.ts.
   *
   * Optional rather than deleted, and optional rather than a no-op stub in
   * main: a landmark asking for a way out of the field that the world does not
   * have is a real state, and `?.()` at the two call sites is the honest way to
   * say so. It also keeps the shelved worlds' names out of the shipped bundle,
   * which a stub in main did not.
   */
  enterParkour?(): void
  /** …and out the other side of the projector, into the trainyard run */
  enterSurf?(): void
  /**
   * Walk up to Elliot and start a conversation — the second thing the field
   * offers, and the only one that talks back. See src/world/landmarks/elliot.ts
   * for the figure and src/ui/chat.ts for the panel it opens.
   */
  talk(): void
  /** show a transient line of text near the bottom of the screen */
  setPrompt(text: string | null): void
  /**
   * Where the visitor's figure is standing, in world units — a LIVE reference
   * to the player's position, never a copy, so reading it costs nothing and
   * it is never a frame stale. It is here for a landmark that has to know
   * where you are rather than merely how far away you are (`lit` in `update`
   * is a distance): a figure that turns to face you has to know which way.
   */
  readonly playerPosition: THREE.Vector3
}

/**
 * A world of its own that borrows the field's renderer and canvas.
 *
 * While `active` is true, main.ts's frame loop hands it the frame and the field
 * simply stops being drawn — not paused, not drawn. Two of these exist (the
 * parkour and the runner) and NEVER both at once: the loop picks one, and every
 * door into either checks that no other is already open.
 *
 * `Parkour` in src/parkour/parkour.ts already has exactly this shape and is NOT
 * modified to say so — structural typing is the whole reason this interface
 * lives here instead of being inherited. A minigame is a thing that answers
 * these seven questions; it is not a thing that imports this file to promise it
 * will. (It may, and the runner does, because being told at compile time that
 * the mount will still accept you is worth one type import.)
 */
export interface Minigame {
  readonly active: boolean
  enter(level?: number): void
  leave(): void
  /** called from the world's frame loop while active */
  update(dt: number): void
  render(renderer: THREE.WebGLRenderer): void
  resize(w: number, h: number): void
  onLeave(cb: () => void): void
  dispose(): void
}

export interface Landmark {
  readonly id: string
  /** what this is, for anything that has to name it out loud */
  readonly title: string
  /** the 3D object added to the scene. Positioned by the landmark itself. */
  readonly object: THREE.Object3D
  /** world-space point the player moves toward when travelling here */
  readonly anchor: THREE.Vector3
  /** how close the player must be for `prompt` to appear and activate to arm */
  readonly radius: number
  /** the line shown when the player is within radius, e.g. "Bring your light" */
  readonly prompt: string
  /**
   * Shown instead of `prompt` once this landmark has been used and you haven't
   * left its radius yet. It exists because a landmark disarms after firing —
   * otherwise standing at the projector would restart the film on a loop — and
   * without a line here there'd be no visible way to replay it on the spot.
   */
  readonly again: string
  /** fired when the player enters radius and confirms (click / Enter / E / dwell) */
  activate(ctx: LandmarkContext): void
  /**
   * The verb for the key badge that floats at this thing once you are close
   * enough to reach it — see src/ui/interact.ts. It completes "Press E to …"
   * on a keyboard and "Tap to …" on a touchscreen, so it is two or three
   * words, lower case, no full stop: `'turn on'`. One string for both: the
   * gesture is the half that changes with the device, never the action.
   *
   * It is NOT a shorter `prompt`. `prompt` is the sentence at the bottom of
   * the screen that says what the thing is *for*, readable from across the
   * field; this is the label on the switch, and it only ever names the
   * mechanical action. A landmark with no `verb` gets no badge, which is right
   * for anything that opens by being stood on rather than pressed.
   */
  readonly verb?: string
  /** …and the verb once it has been used and you have not left. See `again`. */
  readonly verbAgain?: string
  /**
   * World point the badge hangs over: the switch, the handle, the thing your
   * hand goes to. There is no default — `anchor` is a patch of ground several
   * units in front of the object, and a label floating over grass is a label
   * attached to nothing.
   */
  readonly reach?: THREE.Vector3
  /**
   * How close you have to be to the `reach` point, in world units, before the
   * badge appears — measured on the ground plane, so height never counts.
   * This is deliberately much tighter than `radius`: the radius is "the
   * projector is what you are near", and this is "you could put your hand on
   * it". Defaults to 9.
   */
  readonly reachRadius?: number
  /**
   * What a click on this landmark is allowed to land on: the meshes — or the
   * groups holding them, the cast is recursive — that mean "you pointed at
   * this thing". A landmark that publishes none takes no pointer at all.
   *
   * It is a published list rather than simply `object`, because most landmarks
   * carry something that is not the thing itself: the projector's beacon is a
   * seventy-unit column of light standing in the sky, and its invitation rings
   * are painted flat on the ground you would much rather be told to walk to.
   *
   * Pointing at one from across the field does not fire it — main.ts walks the
   * figure over first and uses it on arrival. See `onPointerDown` there.
   */
  readonly hitTargets?: THREE.Object3D[]
  /**
   * False when standing inside `radius` must NOT be enough to fire this — it
   * takes E, Enter or Space, or a click, or the arrival of a walk you asked
   * for with one. Defaults to true, which is right for a threshold you walk
   * through; all three landmarks in this field say no, because every one of
   * them takes the screen away from you and none of that is something to have
   * done TO you merely for standing somewhere.
   */
  readonly autoActivate?: boolean
  /**
   * False while this landmark is locked. Everything that iterates landmarks —
   * proximity, prompts, the dwell timer, clicks — skips one that says no, so a
   * locked landmark is not merely unusable, it is not there at all. The gate
   * past the projector uses it: before the film has been watched there is
   * nothing beyond the screen but field.
   */
  isEnabled?(): boolean
  /** release GPU resources. Only HMR and teardown call it. */
  dispose?(): void
  /**
   * Per-frame hook. `lit` is 0..1 — how strongly the player's light is
   * currently reaching this landmark. Use it to fade detail in and out
   * rather than popping.
   */
  update?(dt: number, elapsed: number, lit: number, ctx: LandmarkContext): void
  /**
   * 0 = night, 1 = daylight — the field's crossfade value, pushed here once a
   * frame. Implement it if this landmark carries anything that only makes
   * sense in the dark: a beacon, a warm pool on the ground, a glow that is
   * really a wayfinder. `lit` above is about *your lantern* and is unaffected
   * by the time of day, so activation and proximity behave the same in both.
   */
  setDaylight?(k: number): void
}

/* ------------------------------------------------------------------ *
 * Film
 * ------------------------------------------------------------------ */

export interface ActRenderContext {
  ctx: CanvasRenderingContext2D
  /** CSS pixel width/height of the canvas (already DPR-scaled by the caller) */
  w: number
  h: number
  /** 0..1 progress through this act */
  p: number
  /** seconds elapsed within this act */
  t: number
  /** true when prefers-reduced-motion is set — draw a settled frame, no motion */
  reduced: boolean
}

export interface Act {
  readonly id: string
  /** seconds this act runs for */
  readonly duration: number
  /**
   * Two or three words naming this stretch of the film. Printed on the
   * scrubber and in the hover tooltip, exactly like a chapter marker on a
   * video player — so it has to make sense out of context and read at 11px.
   */
  readonly chapter: string
  /** spoken-equivalent text, announced to screen readers as the act begins */
  readonly caption: string
  draw(c: ActRenderContext): void
}

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v)

/** cubic ease in/out — the default for anything that moves */
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** ease out — for things arriving */
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * Shortest signed turn from angle a to angle b, radians.
 *
 * Without it, anything that steers turns through π the long way round exactly
 * once per session and looks broken.
 */
export const angleDelta = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/** remap v from [a,b] to [0,1], clamped. The workhorse of act timing. */
export const range = (v: number, a: number, b: number) => clamp((v - a) / (b - a))

/** deterministic pseudo-random in [0,1) — no Math.random, so frames repeat */
export const rand = (i: number) => {
  const x = Math.sin(i * 127.1 + i * i * 0.013) * 43758.5453
  return x - Math.floor(x)
}

const RM_QUERY =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null

/** the answer at boot — good enough for anything built once */
export const REDUCED_MOTION = RM_QUERY?.matches === true

/**
 * …and the answer *now*, for anything that runs on a timer. Stays honest if
 * the OS setting changes mid-session, so the JS timings never drift out of
 * step with the `prefers-reduced-motion` rules in the stylesheets.
 */
export const reducedMotion = (): boolean => REDUCED_MOTION || RM_QUERY?.matches === true

/* ------------------------------------------------------------------ *
 * A PHONE
 *
 * A touch screen, and a small one. Two things read this, and both of them
 * are about the same fact — the film is a picture of text being thrown onto
 * a screen thirty units away, and on a phone that picture is four hundred
 * points wide however it is framed:
 *
 *   src/world/landmarks/projector.ts  frames the watching shot on what has
 *      to be in it rather than on a composed lens, so the picture is as big
 *      as the frame will let it be.
 *   src/film/timeline.ts  steps the whole type scale up, because framing
 *      alone cannot buy enough — the picture is already nearly as wide as
 *      the phone.
 *
 * IT IS THE DEVICE, NOT THE WINDOW, and that is the point of asking `screen`
 * rather than `innerWidth`. A window you can drag narrow is still a desktop
 * and must not have the film redrawn under it; a phone is a phone in both
 * orientations, so turning it never changes the answer. Decided once, at
 * boot, exactly like REDUCED_MOTION above.
 *
 * The cut is at 520 points, which is above every phone and below every
 * tablet: an iPad in portrait is 768 and gets the film as composed.
 * ------------------------------------------------------------------ */
const COARSE_QUERY =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(hover: none) and (pointer: coarse)')
    : null

export const PHONE = ((): boolean => {
  if (COARSE_QUERY?.matches !== true) return false
  const s = typeof window !== 'undefined' ? window.screen : null
  const short = s
    ? Math.min(s.width, s.height)
    : Math.min(window.innerWidth, window.innerHeight)
  return short > 0 && short <= 520
})()

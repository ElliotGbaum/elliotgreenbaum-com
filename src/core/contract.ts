/**
 * Shared contract — the only file every subsystem is allowed to depend on.
 *
 * If you are adding a landmark, a film act, or a panel, you implement one of
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
  /** open a takeover panel by id; resolves when it closes */
  openPanel(id: string): void
  /** start the film */
  playFilm(): void
  /** show a transient line of text near the bottom of the screen */
  setPrompt(text: string | null): void
}

export interface Landmark {
  readonly id: string
  /** shown in the Places menu and as the panel title */
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
  /** fired when the player enters radius and confirms (click / Enter / auto) */
  activate(ctx: LandmarkContext): void
  /**
   * Per-frame hook. `lit` is 0..1 — how strongly the player's light is
   * currently reaching this landmark. Use it to fade detail in and out
   * rather than popping.
   */
  update?(dt: number, elapsed: number, lit: number, ctx: LandmarkContext): void
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

/** remap v from [a,b] to [0,1], clamped. The workhorse of act timing. */
export const range = (v: number, a: number, b: number) => clamp((v - a) / (b - a))

/** deterministic pseudo-random in [0,1) — no Math.random, so frames repeat */
export const rand = (i: number) => {
  const x = Math.sin(i * 127.1 + i * i * 0.013) * 43758.5453
  return x - Math.floor(x)
}

export const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

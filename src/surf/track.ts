/**
 * The trainyard itself: what is on the track, where it came from, and the
 * proof that you can get through it.
 *
 * This file is written before anything is visible, for the same reason
 * `levels.ts` and `parkour-check.mjs` were written before the parkour had a
 * mesh: a runner is only as good as its generator, and a generator you cannot
 * *prove* things about is a generator you will spend a month tuning by feel.
 * So the track is authored as text, decoded into boxes, and then a solver
 * plays the real constants at the real 20 Hz against the real boxes and finds
 * a line through. If it cannot, the piece never ships.
 *
 * THE SHAPE OF THE THING
 *
 *   CHARS      one character per 4-unit tile, three rows, top row = lane +1.
 *   PATTERNS   twenty-five authored templates, each with a tier band, a
 *              decision cost, a family and a weight.
 *   decode()   template → TrackEntity[] in world space, with the roof-run
 *              merging and THE GAP RULE enforced as a decode-time error.
 *   solve()    a 20 Hz beam search over (lane, height, pose) against those
 *              boxes. Returns solvable/not, the witness line, and per-lethal
 *              -piece warning windows in seconds.
 *   createTrack() the cursor: tier ramp, weighted bag without replacement,
 *              rest quantised in seconds-of-tempo, reserved stretches, the
 *              mote layer laid along the witness, powerups, crates, pooling.
 *
 * A PIECE'S SILHOUETTE STATES ITS RESPONSE. NO DECEPTIVE GEOMETRY, EVER — NO
 * FENCE YOU CANNOT JUMP, NO ARCH YOU CANNOT ROLL, NO BOX THAT LOOKS LIKE A
 * FENCE. The checker cannot enforce this one; it is a rule about the art and
 * about which char goes in which cell, and it is the difference between a
 * player who lost and a player who was cheated.
 *
 * CONSTRUCT SOLVABLE, THEN PROVE ANYWAY — NEVER ONLY PROVE. Rejection
 * sampling ("generate, test, throw it away") gives you the right track and the
 * *wrong distribution*: the templates that survive the test are the easy ones,
 * and the difficulty ramp quietly flattens with nobody able to say when. So
 * the failure path here is a *tightening* loop — push the rest out by a tile
 * and re-measure — and only after that fails twice does the piece get replaced
 * by a breather.
 *
 * WRONG TURNS, DO NOT RETAKE
 *
 * • The movement constants below (JUMP_V, GRAVITY, LANE_TICKS, the hitboxes)
 *   are DELIBERATELY DUPLICATED from sim.ts and not imported. sim.ts imports
 *   track.ts; importing back is a cycle, and a cycle is fatal to the Node
 *   checker that loads these modules directly. `tools/surf-check.mjs` asserts
 *   the two copies agree field for field, so the duplication is checked even
 *   though it is not shared. If you change one, change both, or the checker
 *   will tell you in about four seconds.
 * • A roof gap of one tile (4 u) is a decode-time throw, not a warning. At
 *   26 u/s a 4-u hole is three ticks of air; nobody sees it coming, nobody
 *   learns from it, and it is indistinguishable on screen from a coupling
 *   seam. Gaps are 0 tiles (coupled, bridged) or ≥ 2 tiles (8 u, jumpable at
 *   V0 with 2.4 u of slack). There is no third option.
 * • Speed is a pure function of DISTANCE RUN, never of time and never of a
 *   powerup. That is what lets a generator writing 96 u ahead state every
 *   fairness guarantee in seconds and convert it to units without simulating.
 *   The moment a powerup changes the speed, the generator is guessing.
 * • Motes are laid on the witness path — the line the solver actually found,
 *   including the parabola of each jump evaluated at the speed you will
 *   actually be doing. An arc that is not the arc you fly is worse than no
 *   arc: it teaches the wrong thing, once, at the exact moment the player is
 *   deciding whether the game is honest.
 *
 * THE ONE THING THAT MOVES. Everything committed inside WRITE_AHEAD is
 * immutable — nothing is added, moved or removed ahead of the runner, which is
 * the single strongest anti-unfairness rule in the design and costs nothing.
 * The night service is the exception, and it has to be: a threat that
 * *overtakes you* cannot be committed in front of you. It spawns behind, moves
 * forward at its own absolute speed, and earns its place with four cues over
 * 1.9 seconds and a guaranteed clear adjacent lane. It is the only entity in
 * this file whose z changes after it is committed, and if you find a second
 * one, something has gone wrong.
 */

import { clamp } from '../core/contract'
import { createRng, type Rng } from './rng'

/* ================================================================== *
 * §D.2  The track's geometry
 * ================================================================== */

/** never four, never five. Three is the number a thumb can hold. */
export const LANES = 3
/**
 * Lane centres at −3, 0, +3. A carriage body is 2.80 wide, so a lane is a
 * carriage plus a hand's width: "there is a train in that lane" is a binary
 * read at 48 u, and the 0.20 between two adjacent bodies is visibly too narrow
 * to be a way through, which stops the player ever trying it.
 */
export const LANE_W = 3.0
/**
 * Lane index → world X, and back. THE MINUS SIGN IS THE WHOLE POINT, and it is
 * the only place in the runner that knows about it.
 *
 * The run goes down +Z and the camera goes with it, looking the same way. A
 * camera looking down +Z has world +X on its LEFT — three.js cameras look down
 * their own −Z, so facing the other way turns the X axis over with them. Lay
 * lane −1 out at x = −3 and it draws on the right of the frame: press left,
 * move right, which is exactly as bad as it sounds.
 *
 * Everything else in these files — the lanes in the pattern strings, the HUD's
 * service chevron, `left`/`right` in the input, the crash text — says "left"
 * and means the left of the SCREEN. This function is what makes that true.
 */
export const laneToX = (lane: number): number => -lane * LANE_W
/** …and the inverse, for the two places that read a lane back off a position. */
export const xToLane = (x: number): number => -x / LANE_W
/** the authoring grid, one sleeper bay. A carriage is four of these. */
export const TILE = 4.0
/** 16 tiles. An allocation unit and a pooled group; patterns straddle it freely. */
export const CHUNK = 64.0
/** everything inside this is committed and immutable. */
export const WRITE_AHEAD = 96.0
/** behind the runner, i.e. about 24 behind the camera. */
export const DESPAWN_BEHIND = 32.0
/**
 * Measured: a 1.0-u fence at 48 u subtends about 13 px at 800 px of height and
 * is a quarter fogged at FOG_DENSITY. VMAX is derived from this number, not
 * chosen — top speed is how far you can see divided by how long a person needs.
 */
export const LEGIBLE = 48.0
/** mote spacing along Z. */
export const MOTE_STEP = 1.6
/** chest height, so a line of motes reads as a line and not as floor texture. */
export const MOTE_Y = 1.05

/** visual body width of a carriage. The collider is inset from it. */
export const CARRIAGE_W = 2.8
/** four tiles. Reads as a real coach at 1.8-unit figure scale. */
export const CARRIAGE_L = 16.0
/** between two carriages in a consist. */
export const COUPLE_GAP = 0.6
/**
 * Any roof gap at or under this is filled with an invisible `bridge`. Falling
 * into a coupling seam is never a real outcome: at 26 u/s a 0.6 gap is 23 ms of
 * air and you would drop 2.4 cm — but a naive implementation still clears
 * `onGround`, breaks the run cycle and cancels the coyote window, and the
 * player feels all three.
 */
export const GAP_BRIDGE = 1.0
/**
 * A deliberate roof gap. NEVER 1–5: a 3-u hole at VMAX is 2.3 ticks and nobody
 * can see it coming. 6 u is jumpable at V0 (jump range 8.4 u) with 2.4 u of
 * slack; 10 u at tier 3's 20 u/s (14.0 u) with 4.0 u.
 */
export const GAP_MIN = 6.0
export const GAP_MAX = 10.0
/**
 * Lateral shrink of every collider from its art, per side. Lateral near-misses
 * are the whole game and a lateral death always feels stolen.
 */
export const OBST_INSET_X = 0.1
/**
 * A hurdle's art is this much TALLER than its collider, and an overhead beam's
 * art hangs this much LOWER than its collider. The y0/y1 in DIMS below are the
 * collider; props.ts adds these back when it draws.
 *
 * NEVER shrink a hurdle's base or a beam's top: that makes two obstacles that
 * look identical behave differently, which is worse than being strict.
 */
export const OBST_INSET_TOP = 0.06
export const OBST_INSET_UNDER = 0.06
/**
 * No collidable is thinner than this. Belt and braces — the swept box already
 * prevents tunnelling, but at 1.30 u/tick a thin plate is one typo away from
 * being missed, and a missed collider is an obstacle that does not exist.
 * (`bridge` is exempt: it is a floor, never a blocker.)
 */
export const MIN_DEPTH = 1.6

/* ================================================================== *
 * §D.3  Speed and the ramp
 * ================================================================== */

/** 0.60 u/tick. */
export const V0 = 12.0
/**
 * DERIVED, NOT CHOSEN: LEGIBLE / (WARN_CHOICE + t_action + margin)
 * = 48 / (0.90 + 0.70 + 0.25) = 25.9. If the art wants more fog, the game gets
 * slower — that is the trade, and it is not negotiable in the other direction.
 */
export const VMAX = 26.0
/** speed pinned to V0 for the opening, so the teaching stretch is unhurried. */
export const RAMP_FLAT = 200
/** the exponential's distance constant. */
export const RAMP_D = 1400

/**
 * v(d). Exported because sim.ts, the generator, solve() and the checker must
 * all agree to the last decimal, and three copies of an exponential is three
 * chances to typo it.
 *
 * Continuous at d = 200 by construction: exp(0) = 1, so the second branch
 * returns VMAX − (VMAX − V0) = V0 exactly. Monotone non-decreasing everywhere.
 */
export function speedAt(d: number): number {
  if (d < RAMP_FLAT) return V0
  return VMAX - (VMAX - V0) * Math.exp(-(d - RAMP_FLAT) / RAMP_D)
}

/**
 * The difficulty tier at a distance.
 *
 * The bands are 0–200, then every 700: 200, 700, 1400, 2100, 2800, 3500, 4200.
 * DIVERGENCE FROM §E.3, REPORTED: the spec's prose formula `floor(d/700)`
 * disagrees with its own table (which puts tier 2 at 700 u, where speedAt is
 * 16.2 — and the table's speed column matches speedAt at every band start).
 * The table is self-consistent, the formula is not, so the table wins and the
 * `1 +` below is the fix.
 */
export function tierAt(d: number): number {
  if (d < RAMP_FLAT) return 0
  return clamp(1 + Math.floor(d / 700), 0, 7)
}

/* ================================================================== *
 * §D.8  Reaction floor and pacing
 * ================================================================== */

/** 250 perceive + 200 decide + 120 execute + 60 display + 120 slack. */
export const WARN_SINGLE = 0.75
/** …plus 150 ms for a choice of two lanes. */
export const WARN_CHOICE = 0.9
/** measured window-close to window-open. An absolute floor over the per-tier budget. */
export const DECISION_GAP_MIN = 0.35
/** 14.3 u at VMAX. Below it the second obstacle lands inside the first one's
 *  reaction-and-execution window and the section is unfair regardless of skill. */
export const decisionSpacing = (v: number) => Math.max(v * 0.55, 8.0)
/**
 * FogExp2 density. A HARD CONSTRAINT ON THE ART: at or below 0.013, asserted by
 * the checker. Above it a fence at 48 u is not legible and VMAX is a lie.
 */
export const FOG_DENSITY = 0.011

/* ================================================================== *
 * §E.3  The tier ramp
 * ================================================================== */

/** rest between patterns, in SECONDS. Tempo, converted to units at speedAt. */
export const REST_S = [2.4, 2.0, 1.7, 1.45, 1.25, 1.1, 1.0, 0.9] as const
/** decisions permitted in any rolling 3-second window. */
export const BUDGET = [1, 2, 2, 3, 3, 4, 4, 5] as const
/** probability a `runner`-family pattern is drawn at all. */
export const SERVICE_CHANCE = [0, 0, 0.04, 0.08, 0.12, 0.16, 0.2, 0.24] as const
/** how many lanes may be blocked at once. Three is legal only from tier 5 and
 *  only when the survivor state is a roof. */
export const MAX_BLOCKED = [1, 1, 2, 2, 2, 2, 2, 2] as const
/** motes per 100 u. Fewer, worth more, as the run goes on. */
export const MOTE_DENSITY = [55, 52, 48, 45, 42, 39, 37, 35] as const

/* ================================================================== *
 * §D.4 (DUPLICATED — see the header). The solver's copy of the runner's
 * capability envelope. sim.ts owns the originals; surf-check asserts equality.
 * ================================================================== */

const SOLVE_TICK = 0.05
const SOLVE_JUMP_V = 14.7
const SOLVE_GRAVITY = 42.0
const SOLVE_LANE_TICKS = 4
const SOLVE_LANE_TICKS_AIR = 5
const SOLVE_COYOTE_TICKS = 4
const SOLVE_LEDGE_SNAP = 0.5
/**
 * A RAMP LIFTS YOU FASTER THAN A LEDGE, AND THAT IS THE WHOLE POINT OF IT.
 *
 * WRONG TURN, DO NOT RETAKE. A ramp rises 2.20 over one 4-unit tile — 0.55 per
 * unit of z. At VMAX you cover 1.30 units in a tick, so the ground under your
 * feet climbs 0.715 in that tick, and LEDGE_SNAP is 0.50. Held to the ledge
 * rule, every ramp in the game stopped working somewhere around 18 u/s: the
 * runner slid up the first few inches of the wedge, was refused the rest, and
 * ran into the face of the carriage it was supposed to be climbing onto. The
 * solver dodged it by JUMPING off the ramp, so the game was still provably
 * fair — it had just quietly replaced every roof approach with a leap of
 * faith, and the motes were laid on that leap. The mantle's job is to refuse
 * a coach roof you are running PAST; it has no business refusing the wedge
 * you are standing on. This must clear 0.715 with room, and only applies to
 * `ramp`.
 */
const SOLVE_RAMP_SNAP = 0.8
const SOLVE_ROLL_TICKS = 11
const SOLVE_ROLL_LOW_TICKS = 9
const SOLVE_STAND_HX = 0.3
const SOLVE_STAND_HZ = 0.28
const SOLVE_STAND_H = 1.75
const SOLVE_AIR_HX = 0.28
const SOLVE_AIR_HZ = 0.3
const SOLVE_AIR_H = 1.5
const SOLVE_ROLL_HX = 0.3
const SOLVE_ROLL_HZ = 0.55
const SOLVE_ROLL_H = 0.9

/** the constants the checker compares against sim.ts, in one greppable place. */
export const SOLVER_CONSTANTS = {
  TICK: SOLVE_TICK,
  JUMP_V: SOLVE_JUMP_V,
  GRAVITY: SOLVE_GRAVITY,
  LANE_TICKS: SOLVE_LANE_TICKS,
  LANE_TICKS_AIR: SOLVE_LANE_TICKS_AIR,
  COYOTE_TICKS: SOLVE_COYOTE_TICKS,
  LEDGE_SNAP: SOLVE_LEDGE_SNAP,
  RAMP_SNAP: SOLVE_RAMP_SNAP,
  ROLL_TICKS: SOLVE_ROLL_TICKS,
  ROLL_LOW_TICKS: SOLVE_ROLL_LOW_TICKS,
  STAND_HX: SOLVE_STAND_HX,
  STAND_HZ: SOLVE_STAND_HZ,
  STAND_H: SOLVE_STAND_H,
  AIR_HX: SOLVE_AIR_HX,
  AIR_HZ: SOLVE_AIR_HZ,
  AIR_H: SOLVE_AIR_H,
  ROLL_HX: SOLVE_ROLL_HX,
  ROLL_HZ: SOLVE_ROLL_HZ,
  ROLL_H: SOLVE_ROLL_H,
} as const

/** how far a jump carries at speed v — 14 ticks of airtime, exactly. */
export const jumpRange = (v: number) => v * ((2 * SOLVE_JUMP_V) / SOLVE_GRAVITY)

/* ================================================================== *
 * What a piece of track IS
 * ================================================================== */

/**
 * Every kind of thing that can stand on the track. The renderer switches on
 * this and nothing else; the simulation switches on the flags below it.
 */
export type EntityKind =
  | 'fence' // low hurdle, jump. 0 → 1.00
  | 'stack' // sleeper stack, jump. 0 → 1.25
  | 'arch' // duck arch, roll. 1.10 → 3.20
  | 'gantry' // gantry legs, roll. 1.10 → 4.00
  | 'box' // signal box, full height, change lane. 0 → 3.60
  | 'flatbed' // low wagon, roof 1.60, 16 long
  | 'carriage' // stalled carriage, roof 2.20, 16 long
  | 'coach' // high coach, roof 3.40, 16 long
  | 'ramp' // wedge 0 → 2.20 over 4 deep, run up it
  | 'pylon' // roof-mounted barrier, roll while riding
  | 'beam' // overhead gantry spanning all lanes, 3.20 → 3.80
  | 'service' // the night service: a moving rake closing from behind
  | 'bridge' // invisible collider filling a coupling gap. never drawn.
  | 'mote' // a mote of lantern-light
  | 'pickup' // a powerup
  | 'crate' // sealed lamp crate
  | 'letter' // the weekly word's letter

export type PowerKind = 'flare' | 'tally' | 'boots' | 'updraft' | 'handcar'

/** Solid entities are AABBs in track space. Collectables are points. */
export interface TrackEntity {
  /** stable within a run; the scene keys its instance slots off it */
  readonly id: number
  readonly kind: EntityKind
  /** -1 | 0 | 1. `beam` spans all three and reports lane 0. */
  lane: -1 | 0 | 1
  /** centre of the box in X. `laneToX(lane)` for everything but `service`. */
  x: number
  /** the box, in world units, feet-relative. y0 is the underside. */
  y0: number
  y1: number
  /** leading (nearest) and trailing (far) Z faces. z1 > z0 always. */
  z0: number
  z1: number
  /** half-width in X of the *collider* (already inset from the art) */
  hx: number
  /** contact with this is a run-ender rather than a stumble */
  lethal: boolean
  /** you may stand on y1 */
  standable: boolean
  /** a collectable: motes, pickups, crates, letters. Never collides. */
  collect: boolean
  /** for kind === 'pickup' only */
  power?: PowerKind
  /** for kind === 'letter' only */
  glyph?: string
  /** for kind === 'service' only — u/s ABSOLUTE, not relative */
  speed?: number
  /**
   * ADDITIVE FIELD, REPORTED. For kind === 'ramp' only: +1 climbs with Z
   * (`/`), −1 descends (`\`). Both the sim (which interpolates the wedge's top
   * surface under the runner's feet) and props.ts (which has to draw the wedge
   * the right way round) need to know, and there is no way to derive it from
   * the box — a wedge and its mirror occupy the same AABB.
   */
  rise?: 1 | -1
  /** set by sim.ts once this entity has been consumed/awarded. The generator
   *  never reads it; the scene uses it to stop drawing the mote. */
  taken?: boolean
}

/** the pool hands out mutable entities; everyone else sees them frozen-ish. */
type MutableEntity = { -readonly [K in keyof TrackEntity]: TrackEntity[K] }

interface Dim {
  y0: number
  y1: number
  depth: number
  hx: number
  lethal: boolean
  standable: boolean
}

/**
 * The dimensions table, straight out of §D.2. y0/y1 ARE THE COLLIDER — the art
 * is OBST_INSET_X wider on each side, OBST_INSET_TOP taller on a hurdle and
 * OBST_INSET_UNDER lower on a beam. hx is 2.80/2 − 0.10 = 1.30 for everything
 * that is carriage-width.
 *
 * `beam` sits at 3.20 and NOT 3.00, and this is load-bearing arithmetic:
 * rolling on a 2.20 roof puts your top at 2.20 + 0.90 = 3.10, which must clear
 * it. Standing on the ground puts you at 1.75, so a beam is free down there —
 * but a jump from the ground crosses 1.70 (= 3.20 − 1.50 tucked) between
 * t = 0.146 s and t = 0.554 s, so "do not jump under the gantry" is a real,
 * legible, non-lethal rule. Do not move this number without redoing both sums.
 */
export const DIMS: Readonly<Record<EntityKind, Dim>> = {
  fence: { y0: 0, y1: 1.0, depth: 1.6, hx: 1.3, lethal: false, standable: false },
  stack: { y0: 0, y1: 1.25, depth: 2.0, hx: 1.3, lethal: false, standable: false },
  arch: { y0: 1.1, y1: 3.2, depth: 1.6, hx: 1.3, lethal: false, standable: false },
  gantry: { y0: 1.1, y1: 4.0, depth: 2.0, hx: 1.3, lethal: false, standable: false },
  box: { y0: 0, y1: 3.6, depth: 2.4, hx: 1.3, lethal: true, standable: false },
  flatbed: { y0: 0, y1: 1.6, depth: CARRIAGE_L, hx: 1.3, lethal: true, standable: true },
  carriage: { y0: 0, y1: 2.2, depth: CARRIAGE_L, hx: 1.3, lethal: true, standable: true },
  coach: { y0: 0, y1: 3.4, depth: CARRIAGE_L, hx: 1.3, lethal: true, standable: true },
  ramp: { y0: 0, y1: 2.2, depth: 4.0, hx: 1.3, lethal: false, standable: true },
  pylon: { y0: 1.05, y1: 3.0, depth: 1.6, hx: 1.3, lethal: true, standable: false },
  beam: { y0: 3.2, y1: 3.8, depth: 2.0, hx: 4.6, lethal: false, standable: false },
  service: { y0: 0, y1: 3.4, depth: 32.0, hx: 1.3, lethal: true, standable: false },
  bridge: { y0: 0, y1: 0, depth: COUPLE_GAP, hx: 1.3, lethal: false, standable: true },
  mote: { y0: 0, y1: 0, depth: 0, hx: 0.6, lethal: false, standable: false },
  pickup: { y0: 0, y1: 0, depth: 0, hx: 0.9, lethal: false, standable: false },
  crate: { y0: 0, y1: 0, depth: 0, hx: 0.9, lethal: false, standable: false },
  letter: { y0: 0, y1: 0, depth: 0, hx: 0.9, lethal: false, standable: false },
}

/** the roof height of a body char, for the pylon and bridge maths. */
const ROOF_OF: Readonly<Record<string, number>> = {
  '=': DIMS.flatbed.y1,
  '#': DIMS.carriage.y1,
  H: DIMS.coach.y1,
}

/* ================================================================== *
 * §E.1  The authoring format
 * ================================================================== */

/**
 * char → what it puts on the track. Exported so the checker can print a
 * failing pattern back as the three rows the author actually wrote — the same
 * instinct as `levels.ts`'s `hop(3)`, and the reason a generator bug is a
 * two-minute fix instead of an afternoon.
 */
export const CHARS: Readonly<Record<string, EntityKind | null>> = {
  '.': null, // empty
  _: null, // RESERVED CLEAR — the generator may not write here, and neither
  //        may its neighbours. Updraft rails, post-event amnesty, the
  //        service's escape lane.
  j: 'fence', // 0 → 1.00       jump
  J: 'stack', // 0 → 1.25       jump
  d: 'arch', // 1.10 → 3.20    roll
  D: 'gantry', // 1.10 → 4.00    roll
  X: 'box', // 0 → 3.60       change lane. LETHAL.
  '=': 'flatbed', // roof 1.60
  '#': 'carriage', // roof 2.20
  H: 'coach', // roof 3.40
  '/': 'ramp', // wedge 0 → 2.20, run up it
  '\\': 'ramp', // …mirrored in Z, run down it
  O: 'pylon', // roof + 1.05 → roof + 3.00. LETHAL. roll while riding.
  '^': 'beam', // 3.20 → 3.80, spans all three lanes
  '>': 'service', // the night service enters here, in this lane
}

export type PatternFamily = 'breather' | 'barrier' | 'consist' | 'gantry' | 'roof' | 'runner'
export type Surface = 'ground' | 'roof' | 'any'

export interface Pattern {
  readonly id: string
  readonly family: PatternFamily
  /** [firstTier, lastTier], inclusive */
  readonly tier: readonly [number, number]
  /** decisions this costs. drives the pacing budget and the alternation rule */
  readonly cost: 0 | 1 | 2 | 3
  readonly entry: Surface
  readonly exit: 'ground' | 'roof' | 'either'
  /** three rows of EQUAL length, lane +1 first (top row = x +3). See CHARS. */
  readonly rows: readonly [string, string, string]
  /** may be emitted mirrored in X */
  readonly mirror: boolean
  readonly weight: number
  /**
   * The tunnel, and only the tunnel: emit a beam over ALL THREE lanes at every
   * tile of this pattern. One optional flag is cheaper than a second grammar
   * with a second layer of rows, and there is exactly one template that wants
   * it.
   */
  readonly beamRow?: boolean
}

/* ------------------------------------------------------------------ *
 * §E.2  The library
 *
 * Twenty-five templates. Read them as pictures: top row is lane +1, the
 * middle row is the lane you start in, one character is four units.
 * ------------------------------------------------------------------ */

export const PATTERNS: readonly Pattern[] = [
  /* ---- TIER 0 — teach. Nothing lethal before 60 u; speed pinned to V0. ---- */
  {
    id: 'open',
    family: 'breather',
    tier: [0, 7],
    cost: 0,
    entry: 'any',
    exit: 'either',
    rows: ['....', '....', '....'],
    mirror: false,
    weight: 30,
  },
  {
    id: 'firstFence',
    family: 'barrier',
    tier: [0, 1],
    cost: 1,
    entry: 'ground',
    exit: 'ground',
    rows: ['...', '.j.', '...'],
    mirror: false,
    weight: 10,
  },
  {
    id: 'firstArch',
    family: 'barrier',
    tier: [0, 1],
    cost: 1,
    entry: 'ground',
    exit: 'ground',
    rows: ['...', '.d.', '...'],
    mirror: false,
    weight: 10,
  },
  {
    id: 'firstBox',
    family: 'barrier',
    tier: [0, 1],
    cost: 1,
    entry: 'ground',
    exit: 'ground',
    rows: ['...', '.X.', '...'],
    mirror: false,
    weight: 10,
  },
  {
    id: 'firstRamp',
    family: 'consist',
    tier: [0, 2],
    cost: 0,
    entry: 'ground',
    exit: 'either',
    rows: ['....', '/##\\', '....'],
    mirror: false,
    weight: 10,
  },

  /* ---- TIER 1 — one decision, unhurried ---- */
  {
    id: 'fenceLine',
    family: 'barrier',
    tier: [1, 4],
    cost: 1,
    entry: 'ground',
    exit: 'ground',
    rows: ['j...', 'j...', '....'],
    mirror: true,
    weight: 20,
  },
  {
    id: 'archPair',
    family: 'barrier',
    tier: [1, 4],
    cost: 1,
    entry: 'ground',
    exit: 'ground',
    rows: ['d...', '....', 'd...'],
    mirror: false,
    weight: 18,
  },
  {
    id: 'sideStep',
    family: 'barrier',
    tier: [1, 4],
    cost: 1,
    entry: 'ground',
    exit: 'ground',
    rows: ['X...', 'X...', '....'],
    mirror: true,
    weight: 20,
  },
  {
    id: 'wagonPark',
    family: 'consist',
    tier: [1, 5],
    cost: 1,
    entry: 'ground',
    exit: 'either',
    rows: ['....', '....', '/==\\'],
    mirror: true,
    weight: 16,
  },
  {
    id: 'hopDuck',
    family: 'barrier',
    tier: [1, 5],
    cost: 2,
    entry: 'ground',
    exit: 'ground',
    rows: ['....', 'j..d', '....'],
    mirror: false,
    weight: 10,
  },
  {
    id: 'stackSlip',
    family: 'barrier',
    tier: [1, 5],
    cost: 1,
    entry: 'ground',
    exit: 'ground',
    rows: ['.J..', '....', '.J..'],
    mirror: true,
    weight: 14,
  },

  /* ---- TIER 2 — two lanes, roofs matter ---- */
  {
    id: 'zigzag',
    family: 'barrier',
    tier: [2, 7],
    cost: 3,
    entry: 'ground',
    exit: 'ground',
    rows: ['..j...', 'j.....', '....j.'],
    mirror: true,
    weight: 14,
  },
  {
    id: 'consistLow',
    family: 'consist',
    tier: [2, 7],
    cost: 2,
    entry: 'ground',
    exit: 'either',
    rows: ['/==\\..', '......', '/==\\..'],
    mirror: false,
    weight: 14,
  },
  {
    // free on the ground; a decision on a roof
    id: 'gantryRun',
    family: 'gantry',
    tier: [2, 7],
    cost: 1,
    entry: 'any',
    exit: 'either',
    rows: ['..^...', '..^...', '..^...'],
    mirror: false,
    weight: 10,
  },
  {
    id: 'boxWall',
    family: 'barrier',
    tier: [2, 7],
    cost: 2,
    entry: 'ground',
    exit: 'ground',
    rows: ['X..X..', '...X..', 'X.....'],
    mirror: true,
    weight: 12,
  },
  {
    id: 'archGate',
    family: 'gantry',
    tier: [2, 7],
    cost: 2,
    entry: 'ground',
    exit: 'ground',
    rows: ['d..D..', '....d.', 'D..d..'],
    mirror: true,
    weight: 12,
  },

  /* ---- TIER 3 — roof running ---- */
  {
    id: 'roofRun',
    family: 'roof',
    tier: [3, 7],
    cost: 2,
    entry: 'any',
    exit: 'either',
    rows: ['.......', '/##O##\\', '.......'],
    mirror: false,
    weight: 14,
  },
  {
    id: 'gapJump',
    family: 'roof',
    tier: [3, 7],
    cost: 2,
    entry: 'any',
    exit: 'either',
    rows: ['........', '/##..##\\', '........'],
    mirror: false,
    weight: 12,
  },
  {
    // Twenty-four tiles — 96 u — and every one of them RESERVED CLEAR, which is
    // the whole point of the template. The rake spawns ~2.2 s behind, closes at
    // v, and takes another 1.5 s to get past; the corridor has to outlive the
    // encounter or the escape lane you were promised turns into somebody else's
    // pattern halfway through. §E.2 draws it six tiles wide; six tiles is the
    // *picture*, not the guarantee. REPORTED.
    id: 'overtake1',
    family: 'runner',
    tier: [3, 7],
    cost: 1,
    entry: 'ground',
    exit: 'ground',
    rows: [
      '>_______________________',
      '________________________',
      '________________________',
    ],
    mirror: true,
    weight: 10,
  },
  {
    id: 'archBraid',
    family: 'barrier',
    tier: [3, 7],
    cost: 3,
    entry: 'ground',
    exit: 'ground',
    rows: ['d..d..', '..d..d', 'd....d'],
    mirror: false,
    weight: 10,
  },
  {
    // roll on the roof, or drop off it
    id: 'roofBeam',
    family: 'roof',
    tier: [3, 7],
    cost: 2,
    entry: 'any',
    exit: 'either',
    rows: ['......', '/##^#\\', '......'],
    mirror: false,
    weight: 10,
  },

  /* ---- TIER 4+ ---- */
  {
    id: 'overtakeSqueeze',
    family: 'runner',
    tier: [4, 7],
    cost: 2,
    entry: 'ground',
    exit: 'ground',
    // …and the same corridor, with one fence in the middle lane placed where
    // the rake is already level with you: the squeeze is "jump while you are
    // pinned out of that lane", not "guess".
    rows: [
      '>_______________________',
      '_________j______________',
      '________________________',
    ],
    mirror: true,
    weight: 10,
  },
  {
    id: 'doubleConsist',
    family: 'consist',
    tier: [4, 7],
    cost: 2,
    entry: 'ground',
    exit: 'either',
    rows: ['HHHH..', '/##O#\\', 'HHHH..'],
    mirror: false,
    weight: 12,
  },
  {
    // DIVERGENCE, REPORTED: §E.2 writes the bottom row as `X..j..`, six tiles
    // against the other rows' seven. Rows must be equal length or the tile grid
    // stops meaning anything, so it is padded here.
    id: 'sCurve',
    family: 'barrier',
    tier: [4, 7],
    cost: 3,
    entry: 'ground',
    exit: 'ground',
    rows: ['j..X..j', '..j..j.', 'X..j...'],
    mirror: true,
    weight: 10,
  },
  {
    id: 'tunnel',
    family: 'gantry',
    tier: [6, 7],
    cost: 2,
    entry: 'any',
    exit: 'either',
    rows: ['......', '/##O#\\', '......'],
    mirror: false,
    weight: 8,
    beamRow: true,
  },
]

const PATTERN_BY_ID = new Map<string, Pattern>()
for (const p of PATTERNS) PATTERN_BY_ID.set(p.id, p)

/* ================================================================== *
 * The entity pool
 *
 * The steady state must not allocate. A runner that garbage-collects mid-jump
 * is a runner that drops a frame at the worst possible moment, and the moment
 * is always the same one: the tick you commit to a lane.
 * ================================================================== */

function blankEntity(id: number): MutableEntity {
  return {
    id,
    kind: 'fence',
    lane: 0,
    x: 0,
    y0: 0,
    y1: 0,
    z0: 0,
    z1: 0,
    hx: 0,
    lethal: false,
    standable: false,
    collect: false,
    power: undefined,
    glyph: undefined,
    speed: undefined,
    rise: undefined,
    taken: false,
  }
}

/* ================================================================== *
 * §E.1  decode — a template becomes boxes
 * ================================================================== */

/**
 * Plain fields rather than TypeScript parameter properties, deliberately: Node
 * loads these files by *stripping* types, and a parameter property is the one
 * bit of TS syntax that emits code. `tools/surf-check.mjs` imports this module
 * directly, so anything the stripper cannot handle is a tool that does not run.
 */
export class DecodeError extends Error {
  pattern: string
  constructor(pattern: string, message: string) {
    super(`${pattern}: ${message}`)
    this.name = 'DecodeError'
    this.pattern = pattern
  }
}

/** everything decode needs from its caller, so it allocates nothing itself. */
interface DecodeSink {
  /** hand back a blank entity from the pool, already given a fresh id */
  take(): MutableEntity
  /** the row index a mirrored pattern reads from */
  out: MutableEntity[]
}

const BODY_CHARS = '=#H'

/**
 * Decode one pattern into world-space entities at `z0`.
 *
 * Returns the pattern's length in units. Throws `DecodeError` on any authoring
 * mistake — a ragged row, a one-tile roof gap, a pylon over open ballast. It
 * throws rather than warns because these are content bugs, they are caught by
 * `surf:check` before anything ships, and a generator that limps past a broken
 * template is a generator that hides the bug until a player finds it.
 */
export function decode(p: Pattern, mirrored: boolean, z0: number, sink: DecodeSink): number {
  const len = p.rows[0].length
  if (p.rows[1].length !== len || p.rows[2].length !== len) {
    throw new DecodeError(p.id, 'rows are not the same length')
  }

  // top row is lane +1. Mirroring in X swaps the outer two rows and leaves the
  // middle alone, which is the whole of what "mirrored" means here.
  const rows: readonly string[] = mirrored ? [p.rows[2], p.rows[1], p.rows[0]] : p.rows

  // beams span all three lanes, so a '^' in any row (or every tile, under
  // beamRow) yields exactly ONE entity. Collect the tiles first, emit after.
  const beamTiles: boolean[] = []
  for (let i = 0; i < len; i++) beamTiles.push(p.beamRow === true)

  for (let r = 0; r < 3; r++) {
    const row = rows[r] as string
    const lane = (1 - r) as -1 | 0 | 1
    const laneX = laneToX(lane)

    /* --- pass 1: what body char, if any, effectively occupies each tile --- */
    const body: (string | null)[] = []
    for (let i = 0; i < len; i++) {
      const c = row[i] as string
      if (BODY_CHARS.includes(c)) {
        body.push(c)
      } else if (c === 'O' || c === '^') {
        // An overlay is TRANSPARENT to the roof beneath it: `/##O##\` is one
        // sixteen-unit carriage with a pylon on it, not two eight-unit rakes
        // with an illegal four-unit hole between them. Getting this wrong is
        // how the gap rule fires on a template that is obviously fine.
        const before = i > 0 ? (row[i - 1] as string) : ''
        const after = i + 1 < len ? (row[i + 1] as string) : ''
        const inherited = BODY_CHARS.includes(before)
          ? before
          : BODY_CHARS.includes(after)
            ? after
            : null
        if (c === 'O' && inherited === null) {
          throw new DecodeError(p.id, `pylon at tile ${i} of row ${r} has no roof under it`)
        }
        body.push(inherited)
      } else {
        body.push(null)
      }
    }
    // an overlay chain (`O` next to `O`) resolves left-to-right; run it again so
    // `##OO##` inherits through rather than stopping at the first blank.
    for (let i = 0; i < len; i++) {
      if (body[i] !== null) continue
      const c = row[i] as string
      if (c !== 'O' && c !== '^') continue
      const prev = i > 0 ? body[i - 1] : null
      if (prev !== null && prev !== undefined) body[i] = prev
      else if (c === 'O') throw new DecodeError(p.id, `pylon at tile ${i} of row ${r} has no roof`)
    }

    /* --- pass 2: roof runs, coupling seams, bridges --- */
    // a "standable tile" is a body tile or a ramp tile; the gap rule reads this
    const standable: boolean[] = []
    for (let i = 0; i < len; i++) {
      const c = row[i] as string
      standable.push(body[i] !== null || c === '/' || c === '\\')
    }

    // THE GAP RULE, ENFORCED AT DECODE TIME. Between two standable spans the
    // hole is 0 tiles (coupled — handled below) or ≥ 2 tiles (8 u, inside
    // [GAP_MIN, GAP_MAX]). One tile is 4 u, sits in the forbidden 1–5 band, is
    // three ticks of air at VMAX, and nobody sees it coming.
    let firstStand = -1
    let lastStand = -1
    for (let i = 0; i < len; i++) {
      if (!standable[i]) continue
      if (firstStand < 0) firstStand = i
      lastStand = i
    }
    if (firstStand >= 0) {
      let i = firstStand
      while (i <= lastStand) {
        if (standable[i]) {
          i++
          continue
        }
        let j = i
        while (j <= lastStand && !standable[j]) j++
        const tiles = j - i
        const units = tiles * TILE
        if (units < GAP_MIN || units > GAP_MAX) {
          throw new DecodeError(
            p.id,
            `roof gap of ${tiles} tile(s) = ${units} u in row ${r}; legal gaps are 0 or ${GAP_MIN}–${GAP_MAX} u`,
          )
        }
        i = j
      }
    }

    // emit the body runs, merging a run of identical chars into one entity
    let i = 0
    let prevRunEnd = -1
    let prevRunRoof = 0
    while (i < len) {
      const c = body[i]
      if (c === null) {
        i++
        continue
      }
      let j = i
      while (j < len && body[j] === c) j++
      const kind = CHARS[c] as EntityKind
      const dim = DIMS[kind]
      let zStart = z0 + i * TILE
      let zEnd = z0 + j * TILE

      // Two different bodies nose to tail are a consist: take COUPLE_GAP out of
      // the two bodies rather than pushing the second one along, so the tile
      // grid keeps meaning what it says, and drop an invisible bridge in the
      // seam at the LOWER of the two roofs — the runner on the low roof must
      // not fall into it; the runner approaching the high one has to jump
      // anyway and the bridge is under his feet either way.
      const coupledBefore = prevRunEnd === i
      if (coupledBefore) zStart += COUPLE_GAP / 2
      const coupledAfter = j < len && body[j] !== null
      if (coupledAfter) zEnd -= COUPLE_GAP / 2

      const e = sink.take()
      e.kind = kind
      e.lane = lane
      e.x = laneX
      e.y0 = dim.y0
      e.y1 = dim.y1
      e.z0 = zStart
      e.z1 = zEnd
      e.hx = dim.hx
      e.lethal = dim.lethal
      e.standable = dim.standable
      e.collect = false
      sink.out.push(e)

      if (coupledBefore) {
        const b = sink.take()
        const roof = Math.min(prevRunRoof, dim.y1)
        b.kind = 'bridge'
        b.lane = lane
        b.x = laneX
        b.y0 = roof
        b.y1 = roof
        b.z0 = zStart - COUPLE_GAP
        b.z1 = zStart
        b.hx = DIMS.bridge.hx
        b.lethal = false
        b.standable = true
        b.collect = false
        sink.out.push(b)
      }

      prevRunEnd = j
      prevRunRoof = dim.y1
      i = j
    }

    /* --- pass 3: everything that is not a body --- */
    for (let t = 0; t < len; t++) {
      const c = row[t] as string
      const centre = z0 + (t + 0.5) * TILE

      if (c === '^') {
        beamTiles[t] = true
        continue
      }
      if (c === 'O') {
        const roof = ROOF_OF[body[t] as string] as number
        const dim = DIMS.pylon
        const e = sink.take()
        e.kind = 'pylon'
        e.lane = lane
        e.x = laneX
        e.y0 = roof + dim.y0
        e.y1 = roof + dim.y1
        e.z0 = centre - dim.depth / 2
        e.z1 = centre + dim.depth / 2
        e.hx = dim.hx
        e.lethal = true
        e.standable = false
        e.collect = false
        sink.out.push(e)
        continue
      }
      if (c === '/' || c === '\\') {
        const dim = DIMS.ramp
        const e = sink.take()
        e.kind = 'ramp'
        e.lane = lane
        e.x = laneX
        e.y0 = 0
        e.y1 = dim.y1
        e.z0 = z0 + t * TILE
        e.z1 = z0 + (t + 1) * TILE
        e.hx = dim.hx
        e.lethal = false
        e.standable = true
        e.collect = false
        e.rise = c === '/' ? 1 : -1
        sink.out.push(e)
        continue
      }
      if (c === '>') {
        // The night service. It is emitted BEHIND the pattern and moves; see
        // the header. Its speed is set by the caller, which is the only place
        // that knows what the runner will be doing when it arrives.
        const dim = DIMS.service
        const e = sink.take()
        e.kind = 'service'
        e.lane = lane
        e.x = laneX
        e.y0 = dim.y0
        e.y1 = dim.y1
        // placed provisionally; the cursor moves it once it knows the speed,
        // because the lead is a number of SECONDS and only the cursor knows how
        // fast the runner will be going when he gets here.
        e.z0 = z0 - dim.depth
        e.z1 = z0
        e.hx = dim.hx
        e.lethal = true
        e.standable = false
        e.collect = false
        e.speed = 0 // filled in by the cursor
        sink.out.push(e)
        continue
      }

      const kind = CHARS[c]
      if (!kind) continue // '.', '_' and anything else authored as empty
      if (kind === 'flatbed' || kind === 'carriage' || kind === 'coach') continue // handled above
      const dim = DIMS[kind]
      const e = sink.take()
      e.kind = kind
      e.lane = lane
      e.x = laneX
      e.y0 = dim.y0
      e.y1 = dim.y1
      e.z0 = centre - dim.depth / 2
      e.z1 = centre + dim.depth / 2
      e.hx = dim.hx
      e.lethal = dim.lethal
      e.standable = dim.standable
      e.collect = false
      sink.out.push(e)
    }
  }

  // the beams, once each, spanning all three lanes and reporting lane 0
  for (let t = 0; t < len; t++) {
    if (!beamTiles[t]) continue
    const dim = DIMS.beam
    const centre = z0 + (t + 0.5) * TILE
    const e = sink.take()
    e.kind = 'beam'
    e.lane = 0
    e.x = 0
    e.y0 = dim.y0
    e.y1 = dim.y1
    e.z0 = centre - dim.depth / 2
    e.z1 = centre + dim.depth / 2
    e.hx = dim.hx
    e.lethal = false
    e.standable = false
    e.collect = false
    sink.out.push(e)
  }

  return len * TILE
}

/**
 * How much faster than the runner the rake closes.
 *
 * 2.0 and not 1.3, and the difference matters more than it looks. At 1.3 the
 * closing speed is 0.3 v, so a 32-u rake takes five and a half seconds to get
 * past you and the whole encounter outlives the pattern that authored it: by
 * the time the rake is level you are three patterns downstream, in whatever
 * lane THOSE wanted, and the guaranteed clear escape lane is four hundred units
 * behind. It killed a witness-following bot on one seed in twenty, which is
 * exactly the kind of death nobody can explain.
 *
 * At 2.0 the closing speed is v, the pass takes 32/v ≈ 1.5 s, and the entire
 * encounter — approach and pass — fits inside the pattern's own reserved
 * corridor. A threat from behind has to be over before the geometry changes.
 */
export const SERVICE_OVERTAKE = 2.0
/**
 * Seconds from spawn to the nose reaching you. Over the 1.90 s floor in §E.8
 * with room to spare, and it is the number the four cues are timed against.
 */
export const SERVICE_APPROACH_S = 2.2
/** where the nose starts, behind the pattern, at speed v. */
export const serviceLead = (v: number) => SERVICE_APPROACH_S * (SERVICE_OVERTAKE - 1) * v

/* ================================================================== *
 * §E.5  solve — the proof
 * ================================================================== */

export interface WitnessSample {
  readonly z: number
  /** the lane the solver is in at this z */
  readonly lane: -1 | 0 | 1
  /** the height the solver's FEET are at */
  readonly y: number
  /** 'run' | 'air' | 'roll' — motes on an arc are drawn from 'air' samples */
  readonly pose: 'run' | 'air' | 'roll'
}

export interface SolveResult {
  readonly solvable: boolean
  readonly witness: readonly WitnessSample[]
  /** per lethal entity: when it first became visible and the last tick an
   *  input still avoided it, both in SECONDS from the pattern's start */
  readonly warnings: readonly {
    readonly id: number
    readonly visibleAt: number
    readonly lastAt: number
    readonly choice: boolean
  }[]
  /**
   * ADDITIVE FIELD, REPORTED. The times, in SECONDS from the window's start, at
   * which the surviving line actually presses something.
   *
   * §E asks that no two DECISIONS fall inside DECISION_GAP_MIN of each other,
   * and the first reading of that was "no two lethal pieces have deadlines that
   * close inside 0.35 s". That reading is wrong and it cost the game three
   * templates.
   *
   * WRONG TURN, DO NOT RETAKE. `doubleConsist` is a corridor: a coach either
   * side of you and a ramp up onto the rake down the middle. The line's answer
   * to all of it is to hold the centre lane and press NOTHING. Counted as
   * pieces, that is four decisions with deadlines 0.85, 0.85, 1.05 and 1.43 s —
   * two of them simultaneous — so `windowsOk` refused it, every time, on every
   * seed, and `coach` was a kind that existed only in the source. Scenery you
   * ride over and walls in lanes you never enter are not decisions.
   *
   * A decision is an INPUT. The beam already minimises inputs, so this is the
   * cheapest way through the window, and "there exists a line whose presses are
   * a third of a second apart" is the fairness claim actually worth making.
   */
  readonly inputs: readonly number[]
  /** the same presses, in Z. Parallel to `inputs`; the write path needs a
   *  position rather than a time so that the spacing rule can be carried
   *  across a pattern boundary, where the two windows have different origins. */
  readonly inputZ: readonly number[]
}

/*
 * The search is a beam over ticks. Its state is (lane, tween, feet, vy, roll,
 * coyote) and it expands five actions a tick: nothing, left, right, jump, roll.
 * Over a 48-u pattern at VMAX that is about 37 ticks and a few hundred live
 * states — tens of microseconds, cheap enough to run in the write path, which
 * is the entire reason the guarantee is a guarantee and not a nightly job.
 *
 * The arrays are module-scope and reused. solve() is called two or three times
 * per pattern and the pattern cadence is one per second or so; allocating a
 * thousand small objects each time is exactly the kind of thing that shows up
 * as a stutter forty seconds into a run and takes a day to find.
 */

const BEAM_MAX = 96
const SOLVE_MAX_TICKS = 640
const SLOTS = BEAM_MAX * SOLVE_MAX_TICKS

const sLane = new Int8Array(SLOTS)
const sFrom = new Float32Array(SLOTS)
const sLaneT = new Int8Array(SLOTS)
const sLaneSpan = new Int8Array(SLOTS)
const sY = new Float32Array(SLOTS)
const sVy = new Float32Array(SLOTS)
const sRoll = new Int8Array(SLOTS)
const sCoyote = new Int8Array(SLOTS)
const sGround = new Uint8Array(SLOTS)
/**
 * The cost of getting to a state, and the reason the witness reads as a line a
 * person would take rather than merely a line that survives.
 *
 * WRONG TURN, AND IT SURVIVED UNTIL THE DAY ROOFS STARTED WORKING: this was a
 * plain count of INPUTS. Every survivor with the same number of button presses
 * was equally good, so the chain the parent pointers happened to hold won —
 * and on `gapJump` that was a line that took off from open ballast, sailed
 * over an entire eight-unit carriage roof WITHOUT TOUCHING IT, dropped into
 * the coupling gap and hopped straight back up. Legal, provably survivable,
 * and nonsense: the motes are laid on this line, so it is also the line the
 * game TEACHES. Airborne ticks now cost, at a rate far below an input, so
 * among equally cheap lines the solver picks the one that keeps its feet on
 * something. AIR_COST must stay well under INPUT_COST or the solver starts
 * paying a whole button press to shave two ticks off an arc.
 */
const sCost = new Int32Array(SLOTS)
const INPUT_COST = 64
const AIR_COST = 1
/*
 * …and a press that lands inside DECISION_GAP_MIN of the last one costs extra.
 *
 * The beam minimises presses, not the SPACING between them, and those are not
 * the same line. Two inputs a quarter of a second apart and three inputs spread
 * over a second are four presses against three, so the old cost function picked
 * the crowded one every time — and the crowded one is the line the motes are
 * laid on, the line `windowsOk` measures and the line the game teaches. Half an
 * input is enough to break the tie without ever making a spaced line lose to a
 * line that presses more.
 */
const CROWD_COST = 32
/** DECISION_GAP_MIN in whole solver ticks — seven. */
const CROWD_TICKS = Math.round(DECISION_GAP_MIN / SOLVE_TICK)
/** the last tick this state pressed anything. −99 on the seed. */
const sLastIn = new Int16Array(SLOTS)
const sParent = new Int32Array(SLOTS)
const sAction = new Int8Array(SLOTS)

/** 0 none, 1 left, 2 right, 3 jump, 4 roll */
const ACT_NONE = 0
const ACT_LEFT = 1
const ACT_RIGHT = 2
const ACT_JUMP = 3
const ACT_ROLL = 4

const seenKeys = new Map<number, number>()
const witnessOut: WitnessSample[] = []
const warnOut: { id: number; visibleAt: number; lastAt: number; choice: boolean }[] = []
const inputsOut: number[] = []
const inputZOut: number[] = []
const emptyResult: SolveResult = {
  solvable: false,
  witness: [],
  warnings: [],
  inputs: [],
  inputZ: [],
}

/** smoothstep — peaks in the middle and reads as a hop sideways, which is what
 *  the animation is. Ease-out starts at 2Δ/T, teleports 0.6 u on the first tick
 *  and hands the sweep a huge first step. */
const smoothstep = (u: number) => u * u * (3 - 2 * u)

/**
 * Signed seconds to travel from `za` to `zb` along the ramp. Negative when
 * `zb` is behind `za`, which is the whole reason it exists: a piece 48 u into a
 * 12-u pattern was visible three seconds before that pattern started, and the
 * honest number for "how long did the player have" is a negative visibleAt.
 */
function travelTime(za: number, zb: number, speedFn: (d: number) => number): number {
  if (zb === za) return 0
  const lo = Math.min(za, zb)
  const hi = Math.max(za, zb)
  let z = lo
  let t = 0
  // bounded: the longest span anyone asks about is LEGIBLE, and at V0 that is
  // eighty ticks. The guard is there so a pathological speedFn cannot hang the
  // write path.
  for (let i = 0; z < hi && i < 4096; i++) {
    z += Math.max(speedFn(z), 0.01) * SOLVE_TICK
    t += SOLVE_TICK
  }
  return zb > za ? t : -t
}

/** the fractional lane the tween is at, given from/to/ticks-left/span */
function tweenLane(from: number, to: number, ticksLeft: number, span: number): number {
  if (ticksLeft <= 0 || span <= 0) return to
  const u = (span - ticksLeft) / span
  return from + (to - from) * smoothstep(u)
}

/*
 * The solver's per-tick active window.
 *
 * Every state expansion used to walk the whole entity slice. At 96 states × 5
 * actions × 100 ticks that is forty-six thousand walks of a fifty-entity list,
 * and it showed up as a seventeen-millisecond tick — one dropped frame every
 * few seconds, always while a long pattern was being written, never anywhere a
 * profiler would think to look. Everything within a couple of units of the
 * runner is at most two or three boxes; find them once per tick and hand the
 * expansions a list of three.
 */
const active: TrackEntity[] = []
let activeN = 0

/**
 * The height of a standable entity's top at a given z. Flat for everything
 * except a ramp, whose top is the wedge — read at the leading edge of the box
 * so you are never lifted, or blocked, by ground you have not reached yet.
 * Shared by `surfaceUnder` (what holds you up) and `hitAt` (what stops you),
 * which MUST agree or a ramp becomes a wall you also happen to stand on.
 */
function entryTop(e: TrackEntity, zLead: number): number {
  if (e.kind !== 'ramp') return e.y1
  const t = clamp((zLead - e.z0) / (e.z1 - e.z0))
  return e.y1 * (e.rise === -1 ? 1 - t : t)
}

/** how far this surface is allowed to lift you in one tick. See SOLVE_RAMP_SNAP. */
function solveSnapOf(e: TrackEntity): number {
  return e.kind === 'ramp' ? SOLVE_RAMP_SNAP : SOLVE_LEDGE_SNAP
}

/** the top of whatever is under (x, z), or 0 for ballast. Ramps interpolate. */
function surfaceUnder(
  x: number,
  z: number,
  hx: number,
  hz: number,
  ceilingY: number,
): number {
  let best = 0
  for (let i = 0; i < activeN; i++) {
    const e = active[i] as TrackEntity
    if (!e.standable || e.collect) continue
    if (e.z1 < z - hz || e.z0 > z + hz) continue
    if (Math.abs(e.x - x) > e.hx + hx) continue
    // the wedge under the leading edge of the box, so you are never lifted by
    // ground you have not reached yet
    const top = entryTop(e, z + hz)
    // …and a ramp gets its own, larger allowance: see SOLVE_RAMP_SNAP
    if (top > ceilingY + (solveSnapOf(e) - SOLVE_LEDGE_SNAP)) continue
    if (top > best) best = top
  }
  return best
}

/** does the box at (x, y, z) hit anything? returns the entity or null. */
function hitAt(
  x: number,
  xPrev: number,
  y: number,
  z: number,
  zPrev: number,
  hx: number,
  hz: number,
  h: number,
  yPrev: number,
): TrackEntity | null {
  const xLo = Math.min(x, xPrev) - hx
  const xHi = Math.max(x, xPrev) + hx
  const zLo = Math.min(z, zPrev) - hz
  const zHi = z + hz
  for (let i = 0; i < activeN; i++) {
    const e = active[i] as TrackEntity
    if (e.collect || e.kind === 'bridge') continue
    if (e.z1 <= zLo || e.z0 >= zHi) continue
    if (e.x - e.hx >= xHi || e.x + e.hx <= xLo) continue
    if (e.y1 <= y || e.y0 >= y + h) continue
    // landing on a roof is not a collision — the mantle. If the feet STARTED
    // the tick above (roof − LEDGE_SNAP) we are arriving from above and this is
    // a mount, not a face full of carriage.
    //
    // WRONG TURN, AND IT COST THE WHOLE ROOF GAME. This test used to read
    // `e.y1` for every standable entity, ramps included. A ramp's `y1` is the
    // top of the WEDGE — 2.20 — so the foot of an up-ramp demanded the feet
    // already be at 1.70 to count as a mount, and running into a ramp at
    // ground level was a collision. Every template with a `/` in it therefore
    // failed the solvability proof and was silently swapped for a breather:
    // no carriages, no coaches, no pylons, no roofs anywhere in the game, and
    // nothing in the generator complaining. The height that matters is the
    // wedge under the LEADING edge of the box, exactly as `surfaceUnder`
    // reads it — approach an up-ramp and it is 0, approach the high face of a
    // down-ramp and it is 2.20 and it is honestly a wall.
    if (e.standable && yPrev >= entryTop(e, zPrev + hz) - solveSnapOf(e)) continue
    return e
  }
  return null
}

/**
 * Plays the real constants against real committed geometry at 20 Hz.
 * `entities` need only be the slice overlapping [z0, z1].
 */
export function solve(
  entities: readonly TrackEntity[],
  z0: number,
  z1: number,
  speedFn: (d: number) => number,
  startLane: -1 | 0 | 1,
  startSurface: number,
): SolveResult {
  witnessOut.length = 0
  warnOut.length = 0
  inputsOut.length = 0
  inputZOut.length = 0

  // the z of every tick, precomputed — speed is a pure function of distance, so
  // the whole timeline is known before a single state is expanded
  let z = z0
  const zAt: number[] = [z]
  let ticks = 0
  while (z < z1 && ticks < SOLVE_MAX_TICKS - 1) {
    z += speedFn(z) * SOLVE_TICK
    ticks++
    zAt.push(z)
  }
  if (ticks < 1) return emptyResult

  // seed state
  let base = 0
  let count = 1
  sLane[0] = startLane
  sFrom[0] = startLane
  sLaneT[0] = 0
  sLaneSpan[0] = 0
  sY[0] = startSurface
  sVy[0] = 0
  sRoll[0] = 0
  sCoyote[0] = 0
  sGround[0] = 1
  sCost[0] = 0
  sLastIn[0] = -99
  sParent[0] = -1
  sAction[0] = ACT_NONE

  let survivor = -1
  // the moving head into the (sorted) entity slice — see `active` above
  let solveHead = 0

  for (let t = 0; t < ticks; t++) {
    const zPrev = zAt[t] as number
    const zNow = zAt[t + 1] as number
    const nextBase = base + count
    if (nextBase + BEAM_MAX > SLOTS) break
    let n = 0
    seenKeys.clear()

    // …rebuilt once per tick, not once per state. The 3-unit skirt covers the
    // deepest box half-depth plus the mantle's reach.
    activeN = 0
    for (let i = solveHead; i < entities.length; i++) {
      const e = entities[i] as TrackEntity
      if (e.z0 > zNow + 3) break
      if (e.z1 < zPrev - 3) {
        if (i === solveHead) solveHead++
        continue
      }
      active[activeN++] = e
    }

    for (let s = base; s < base + count; s++) {
      for (let a = ACT_NONE; a <= ACT_ROLL; a++) {
        let lane = sLane[s] as number
        let from = sFrom[s] as number
        let laneT = sLaneT[s] as number
        let laneSpan = sLaneSpan[s] as number
        let y = sY[s] as number
        let vy = sVy[s] as number
        let roll = sRoll[s] as number
        let coyote = sCoyote[s] as number
        let ground = sGround[s] as number
        let cost = sCost[s] as number
        let lastIn = sLastIn[s] as number
        const xPrev = laneToX(tweenLane(from, lane, laneT, laneSpan))
        if (a !== ACT_NONE) {
          if (t - lastIn < CROWD_TICKS) cost += CROWD_COST
          lastIn = t
        }

        if (a === ACT_LEFT || a === ACT_RIGHT) {
          const dir = a === ACT_LEFT ? -1 : 1
          const cur = tweenLane(from, lane, laneT, laneSpan)
          const to = clamp(lane + dir, -1, 1)
          if (to === lane && laneT === 0) continue // off the board, no-op
          if (laneT > 0 && to === lane) continue // same direction inside the lock
          from = cur
          lane = to
          const span = Math.max(
            2,
            Math.round(
              (ground ? SOLVE_LANE_TICKS : SOLVE_LANE_TICKS_AIR) * clamp(Math.abs(to - cur), 0.35, 2),
            ),
          )
          laneSpan = span
          laneT = span
          cost += INPUT_COST
        } else if (a === ACT_JUMP) {
          const canJump = ground === 1 || coyote > 0
          if (!canJump) continue
          if (roll > 0) continue // the solver never needs a roll-cancel to survive
          vy = SOLVE_JUMP_V
          ground = 0
          coyote = 0
          roll = 0
          cost += INPUT_COST
        } else if (a === ACT_ROLL) {
          if (roll > 0) continue
          if (ground === 1) {
            roll = SOLVE_ROLL_TICKS
          } else {
            // a dive: straight down, then a roll on contact. Modelled as the
            // dive velocity; the roll starts when the feet land.
            vy = Math.min(vy, -26.0)
            coyote = 0
          }
          cost += INPUT_COST
        }

        // integrate. Velocity-Verlet, which is EXACT for constant acceleration
        // and is why the apex is 2.5725 and the airtime is 14 whole ticks
        // rather than "about seven up and about seven down".
        const yPrev = y
        if (ground === 0) {
          y += vy * SOLVE_TICK - 0.5 * SOLVE_GRAVITY * SOLVE_TICK * SOLVE_TICK
          vy -= SOLVE_GRAVITY * SOLVE_TICK
          cost += AIR_COST // see sCost: a line that keeps its feet down wins
        }
        if (laneT > 0) laneT--
        const x = laneToX(tweenLane(from, lane, laneT, laneSpan))

        const low = roll > SOLVE_ROLL_TICKS - SOLVE_ROLL_LOW_TICKS
        const hx = low ? SOLVE_ROLL_HX : ground ? SOLVE_STAND_HX : SOLVE_AIR_HX
        const hz = low ? SOLVE_ROLL_HZ : ground ? SOLVE_STAND_HZ : SOLVE_AIR_HZ
        const h = low ? SOLVE_ROLL_H : ground ? SOLVE_STAND_H : SOLVE_AIR_H

        // ground resolution, including the mantle
        const gy = surfaceUnder(x, zNow, hx, hz, y + SOLVE_LEDGE_SNAP)
        if (y <= gy + 1e-6 && vy <= 0) {
          if (ground === 0 && roll === 0 && sVy[s] < -20) roll = SOLVE_ROLL_TICKS // dive lands rolling
          y = gy
          vy = 0
          ground = 1
          coyote = 0
        } else if (ground === 1 && gy < y - 1e-6) {
          ground = 0
          coyote = SOLVE_COYOTE_TICKS
        } else if (ground === 0 && vy > 0 && gy > y && gy - y <= SOLVE_LEDGE_SNAP) {
          y = gy
          vy = 0
          ground = 1
          coyote = 0
        }

        if (hitAt(x, xPrev, y, zNow, zPrev, hx, hz, h, yPrev)) continue

        if (roll > 0) roll--
        if (ground === 0 && coyote > 0) coyote--

        // dedupe. Quantise y and vy — the vertical is deterministic given the
        // tick a jump started on, so the buckets are exact in practice and
        // merely conservative when they are not.
        const key =
          ((lane + 1) << 26) |
          (laneT << 22) |
          (roll << 18) |
          (coyote << 15) |
          (ground << 14) |
          ((Math.round(y * 8) & 0x7f) << 7) |
          (Math.round(vy * 0.5 + 40) & 0x7f)
        const at = seenKeys.get(key)
        if (at !== undefined) {
          if (cost >= (sCost[at] as number)) continue
          sLane[at] = lane
          sFrom[at] = from
          sLaneT[at] = laneT
          sLaneSpan[at] = laneSpan
          sY[at] = y
          sVy[at] = vy
          sRoll[at] = roll
          sCoyote[at] = coyote
          sGround[at] = ground
          sCost[at] = cost
          sLastIn[at] = lastIn
          sParent[at] = s
          sAction[at] = a
          continue
        }
        if (n >= BEAM_MAX) continue
        const slot = nextBase + n
        seenKeys.set(key, slot)
        sLane[slot] = lane
        sFrom[slot] = from
        sLaneT[slot] = laneT
        sLaneSpan[slot] = laneSpan
        sY[slot] = y
        sVy[slot] = vy
        sRoll[slot] = roll
        sCoyote[slot] = coyote
        sGround[slot] = ground
        sCost[slot] = cost
        sLastIn[slot] = lastIn
        sParent[slot] = s
        sAction[slot] = a
        n++
      }
    }

    if (n === 0) return emptyResult
    base = nextBase
    count = n
  }

  // the survivor with the fewest inputs; ties go to whoever is sitting in the
  // lane they started in, because a line that stays put is a line a player can
  // read at a glance
  let bestInputs = Infinity
  for (let s = base; s < base + count; s++) {
    const inp = (sCost[s] as number) * 4 + Math.abs((sLane[s] as number) - startLane)
    if (inp < bestInputs) {
      bestInputs = inp
      survivor = s
    }
  }
  if (survivor < 0) return emptyResult

  /* ---- reconstruct the witness ---- */
  // walk back to the seed, then forward, sampling every MOTE_STEP of z
  const chain: number[] = []
  for (let s = survivor; s >= 0; s = sParent[s] as number) chain.push(s)
  chain.reverse()

  let nextSampleZ = z0
  for (let k = 0; k < chain.length; k++) {
    const s = chain[k] as number
    // the seed slot carries ACT_NONE by construction, so k === 0 never fires
    if ((sAction[s] as number) !== ACT_NONE) {
      inputsOut.push((k - 1) * SOLVE_TICK)
      inputZOut.push(zAt[Math.max(0, k - 1)] as number)
    }
    if (k === 0) continue
    // WRONG TURN, DO NOT RETAKE: this used to write chain[k]'s pose forward,
    // over [zAt[k], zAt[k+1]). That is one whole tick late. A state is REACHED
    // by moving from zAt[k-1] to zAt[k], and the pose stored on it — the roll
    // counter, `ground`, the tweened x — is exactly the pose `hitAt` tested
    // against the geometry on the way in. It protected the segment BEHIND the
    // state, not the one ahead of it. Written forward, the line reads `run`
    // for the first tick under a pylon and `roll` for a tick past the far
    // side of it, so anything that replays the line ducks late and takes the
    // ceiling. It killed the witness bot on 98 seeds in 200, always deep in
    // the run where the tick is longest, and it reads exactly like a
    // generator that emits unfair track. It is not: the line was right, the
    // transcript of it was off by one.
    const zTick = zAt[Math.min(k, zAt.length - 1)] as number
    const laneF = tweenLane(sFrom[s] as number, sLane[s] as number, sLaneT[s] as number, sLaneSpan[s] as number)
    const pose: 'run' | 'air' | 'roll' =
      (sRoll[s] as number) > 0 ? 'roll' : (sGround[s] as number) === 1 ? 'run' : 'air'
    while (nextSampleZ < zTick && nextSampleZ <= z1) {
      witnessOut.push({
        z: nextSampleZ,
        lane: Math.round(clamp(laneF, -1, 1)) as -1 | 0 | 1,
        y: sY[s] as number,
        pose,
      })
      nextSampleZ += MOTE_STEP
    }
    if (zTick >= z1) break
  }

  /* ---- the warning windows ---- */
  // visibleAt: when the piece came inside LEGIBLE. lastAt: the latest moment an
  // input still avoided it, which is contact minus the time the response takes
  // to EXECUTE — a lane change that finishes on the tick the nose arrives is a
  // lane change that did not happen.
  //
  // WRONG TURN, DO NOT RETAKE: this used to clamp `visibleAt` to the start of
  // the solve window, i.e. to the start of the pattern. That makes every piece
  // near the front of its own pattern look as though it appeared out of nowhere
  // — the window comes out at 0.2 s, the tightening loop cannot fix it because
  // nothing about the pattern is wrong, and after two attempts the piece is
  // replaced by a breather. The whole library quietly stopped being emitted and
  // the track was a mote line with a fence on it every four hundred units.
  // A piece 48 u into a 12-u pattern was visible LONG BEFORE the pattern began;
  // measure it where it really happened, and let the time be negative.
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i] as TrackEntity
    if (!e.lethal || e.collect) continue
    if (e.z0 < z0 || e.z0 > z1) continue
    const visibleAt = travelTime(z0, e.z0 - LEGIBLE, speedFn)
    let contactAt = 0
    for (let k = 0; k + 1 < zAt.length; k++) {
      const zk = zAt[k] as number
      if (zk + SOLVE_STAND_HZ >= e.z0) {
        contactAt = k * SOLVE_TICK
        break
      }
    }
    if (contactAt === 0) contactAt = ticks * SOLVE_TICK
    // how long the response takes to run to completion
    const exec =
      e.kind === 'pylon'
        ? SOLVE_ROLL_LOW_TICKS * SOLVE_TICK * 0.5
        : SOLVE_LANE_TICKS * SOLVE_TICK
    // is there more than one way out? if two lanes are open it is a choice, and
    // a choice costs the player another 150 ms of thinking
    let open = 0
    for (let l = -1; l <= 1; l++) {
      if (l === e.lane) continue
      let blocked = false
      for (let q = 0; q < entities.length; q++) {
        const o = entities[q] as TrackEntity
        if (o.collect || o.lane !== l || o.y0 > 0.5) continue
        if (o.z1 > e.z0 - 2 && o.z0 < e.z1 + 2) {
          blocked = true
          break
        }
      }
      if (!blocked) open++
    }
    warnOut.push({
      id: e.id,
      visibleAt,
      lastAt: contactAt - exec,
      choice: open >= 2,
    })
  }

  return {
    solvable: true,
    witness: witnessOut.slice(),
    warnings: warnOut.slice(),
    inputs: inputsOut.slice(),
    inputZ: inputZOut.slice(),
  }
}

/**
 * The solver's line, carried on in a straight line to the end of the rest.
 *
 * `solveEnd()` deliberately stops looking a jump's reach past the last box,
 * because proving a hundred ticks of nothing is forty-six thousand state
 * expansions and showed up as a fifteen-millisecond tick. But the motes are
 * laid along the witness, and the rest — two-and-a-bit seconds of empty track
 * between patterns — is exactly where the player expects the line to keep
 * going. Without this the track alternates between a pattern with motes and a
 * silent stretch with none, which reads as a bug and not as a breather.
 *
 * There is nothing to search for out here: no boxes, so the answer is "keep
 * running in the lane you finished in". Written rather than solved.
 *
 * Reuses one array, because this is called once per pattern write and the
 * steady state may not allocate. The samples it appends ARE new objects — they
 * are pushed into the track's own witness and outlive the call — but a handful
 * of small literals per pattern is not the allocation the rule is about.
 */
const lineOut: WitnessSample[] = []
function extendWitness(w: readonly WitnessSample[], end: number): readonly WitnessSample[] {
  lineOut.length = 0
  for (let i = 0; i < w.length; i++) lineOut.push(w[i] as WitnessSample)
  if (w.length === 0) return lineOut
  const last = w[w.length - 1] as WitnessSample
  // an airborne last sample means the solve window closed mid-arc; the empty
  // track beyond it is ballast, so the line comes down to the ground rather
  // than floating on at apex height for the whole rest
  const y = last.pose === 'air' ? 0 : last.y
  for (let z = last.z + MOTE_STEP; z < end; z += MOTE_STEP) {
    lineOut.push({ z, lane: last.lane, y, pose: 'run' })
  }
  return lineOut
}

/* ================================================================== *
 * The generator
 * ================================================================== */

export interface TrackConfig {
  readonly seed: number
  /** how far ahead of the runner track is committed. Default WRITE_AHEAD. */
  readonly writeAhead?: number
  /** how far behind the runner entities are released. Default DESPAWN_BEHIND. */
  readonly despawnBehind?: number
  /** dev only: force every draw to this pattern id */
  readonly forcePattern?: string
}

export interface Track {
  /** every live entity, ALWAYS sorted ascending by z0. sim.ts walks it with a
   *  moving head index and never sorts. */
  readonly entities: readonly TrackEntity[]
  /** committed to here. Nothing is ever added, moved or removed below it. */
  readonly writtenTo: number
  /** the solver's chosen line, as lane per unit of z, for the mote layer and
   *  the ghost. Sampled every MOTE_STEP units from 0. */
  readonly witness: readonly WitnessSample[]
  /** grow the track so it is committed to `z + writeAhead`, and release
   *  everything with z1 < z - despawnBehind. Call once per tick. */
  advance(z: number, speedFn: (d: number) => number): void
  /** the tier the generator is currently writing at, for the HUD and the checker */
  readonly tier: number
  /** entities released since the last call, so the scene can free their slots. */
  drainReleased(): TrackEntity[]
  /** entities committed since the last call, so the scene can claim slots. */
  drainCommitted(): TrackEntity[]
  /** reserve a clear stretch — used for updraft descents and post-event
   *  amnesty. Must be called BEFORE the generator writes into it. */
  reserve(z0: number, z1: number): boolean
  /** wipe and restart at z = 0 with a new seed. Allocates nothing. */
  reset(seed: number): void
}

/** the teaching opening, §E.7 — the first 400 units say the whole game out
 *  loud, in order, one idea at a time, with the motes drawing every answer. */
const OPENING: readonly { z: number; id: string }[] = [
  { z: 64, id: 'firstFence' }, // 60–110: jump, with the arc drawn over it
  { z: 112, id: 'firstArch' }, // 110–160: roll, motes ducking beneath
  // 160–240 in §E.7, but the signal box is the first LETHAL piece in the game
  // and §G.20 asserts the first 200 u contain none. Both cannot be true, so the
  // lesson moves out of the way rather than the promise: the teaching ORDER is
  // what §E.7 is really about, and "nothing can kill you for two hundred units"
  // is a promise worth more than eight units of pacing. REPORTED.
  { z: 208, id: 'firstBox' }, // change lane, and the choice is yours
  { z: 268, id: 'firstRamp' }, // roofs exist and pay 3×
  { z: 336, id: 'fenceLine' }, // the first two-lane pattern
]
const OPENING_END = 400

/** one attempt per this many units, firing with POWER_CHANCE. */
const POWER_WINDOW = 200
const POWER_CHANCE = 0.35
/** no repeat of a kind inside this. */
const POWER_REPEAT = 600
/** …and if nothing has dropped in this long, force one. */
const POWER_PITY = 900
const CRATE_WINDOW = 700

const POWER_KINDS: readonly PowerKind[] = ['flare', 'tally', 'boots', 'updraft', 'handcar']

export function createTrack(cfg: TrackConfig): Track {
  const writeAhead = cfg.writeAhead ?? WRITE_AHEAD
  const despawnBehind = cfg.despawnBehind ?? DESPAWN_BEHIND

  let rng: Rng = createRng(cfg.seed)
  let nextId = 1

  const entities: MutableEntity[] = []
  const pool: MutableEntity[] = []
  const released: MutableEntity[] = []
  const committed: MutableEntity[] = []
  let releasedDrained = false
  let committedDrained = false
  const EMPTY: TrackEntity[] = []

  const witness: WitnessSample[] = []

  // the cursor
  let writtenTo = 0
  let tier = 0
  let lastSurface: 'ground' | 'roof' = 'ground'
  let lastCost = 0
  const recentIds: string[] = []
  const recentFamilies: PatternFamily[] = []
  const reserved: { z0: number; z1: number }[] = []
  let lastServiceZ = -Infinity
  let serviceDraws = 99
  let lastMirror = 0
  let mirrorRun = 0
  /** false until the horizon has been filled once; see advance(). */
  let primed = false

  /*
   * THE RUN-UP, AND THE WRONG TURN THAT MADE IT NECESSARY.
   *
   * Every solve used to start at the pattern's own first tile, with the runner
   * standing exactly on it in lane 0 at ground level. A blocker authored into
   * tile 0 — `fenceLine`, `sideStep`, `boxWall`, half the tier-1 library — sits
   * 1.2 u inside its tile, so the proof was being asked whether a lane change
   * that takes five ticks fits inside the tenth of a second it takes to travel
   * 1.2 u. It does not, at any speed above a walk. Those patterns failed the
   * proof, the tightening loop pushed the rest out behind them (which cannot
   * help a piece at the FRONT), and after two attempts they were quietly
   * replaced by a breather: thirty-eight per cent of every track was a swap,
   * three templates never appeared at all, and `coach` — which only
   * `doubleConsist` emits — was not in the game.
   *
   * The player does not arrive at a pattern out of nowhere. He arrives down the
   * empty rest corridor the previous pattern left behind, at whatever lane and
   * height that pattern's line ended on. Solve from THERE. `clearBefore` is how
   * much guaranteed-empty track is behind the cursor, and `carryLane`/`carryY`
   * are where the last line left him; the witness is still trimmed to [z, end)
   * before it is published, so nothing before the cursor is rewritten.
   */
  let clearBefore = 0
  let carryLane: -1 | 0 | 1 = 0
  let carryY = 0
  /** where the previous window's last press happened, so that DECISION_GAP_MIN
   *  survives a pattern boundary — the two windows have different origins and a
   *  time measured from either of them is meaningless to the other. */
  let carryInputZ = -Infinity
  /**
   * Cap on the run-up handed to one solve, in SECONDS rather than units.
   *
   * Twelve ticks is twice the five a lane change takes and more than the four
   * of coyote — enough to answer anything authored into tile 0 — and because it
   * is a time it costs the beam the same twelve ticks at twelve units a second
   * as it does at twenty-six. The first cut of this was six tiles of DISTANCE,
   * which is forty ticks at V0: correct, and ten times slower.
   */
  const RUNUP_S = 0.6

  // powerup bookkeeping
  let nextPowerZ = POWER_WINDOW
  let lastPowerAnyZ = 0
  const lastPowerZ: Record<PowerKind, number> = {
    flare: -Infinity,
    tally: -Infinity,
    boots: -Infinity,
    updraft: -Infinity,
    handcar: -Infinity,
  }
  let nextCrateZ = CRATE_WINDOW

  // the weighted bag
  let bag: Pattern[] = []
  let bagTier = -1

  // scratch, reused
  const scratch: MutableEntity[] = []
  const sink: DecodeSink = {
    take() {
      const e = pool.pop()
      if (e) {
        e.power = undefined
        e.glyph = undefined
        e.speed = undefined
        e.rise = undefined
        e.taken = false
        // ids must be unique per emission: the scene keys instance slots off
        // them and a recycled id is a slot that draws last week's carriage
        e.id = nextId++
        return e
      }
      return blankEntity(nextId++)
    },
    out: scratch,
  }

  /* ---- the weighted bag without replacement ------------------------ *
   * Repeat each eligible template `weight` times, shuffle, draw, refill when
   * empty. Long-run frequency equals the weight and clumping is impossible.
   * Straight weighted-random gives you `fenceLine` three times in nine seconds
   * about once a minute, which is precisely the moment a runner stops feeling
   * generated and starts feeling broken.
   * ----------------------------------------------------------------- */
  function refillBag(t: number) {
    bag.length = 0
    for (const p of PATTERNS) {
      if (t < p.tier[0] || t > p.tier[1]) continue
      for (let i = 0; i < p.weight; i++) bag.push(p)
    }
    rng.shuffle(bag)
    bagTier = t
  }

  function eligible(p: Pattern, t: number, z: number): boolean {
    if (t < p.tier[0] || t > p.tier[1]) return false
    if (recentIds.includes(p.id)) return false
    if (recentFamilies.includes(p.family)) return false
    if (p.cost >= 2 && lastCost >= 2) return false
    if (p.cost >= 2 && z < 700) return false // §E.7: nothing heavy before 700 u
    if (p.entry === 'roof' && lastSurface !== 'roof') return false
    if (p.family === 'runner') {
      if (z < 700) return false
      if (serviceDraws < 3 || z - lastServiceZ < 240) return false
      if (!rng.chance(SERVICE_CHANCE[Math.min(t, 7)] as number)) return false
    }
    for (const r of reserved) {
      if (z < r.z1 && z + 64 > r.z0) return false
    }
    return true
  }

  function draw(t: number, z: number): Pattern {
    if (cfg.forcePattern) {
      const forced = PATTERN_BY_ID.get(cfg.forcePattern)
      if (forced) return forced
    }
    if (bagTier !== t || bag.length === 0) refillBag(t)
    // Skipped draws go into `held` and return to the bag, so the long-run
    // frequency still matches the weights — dropping them on the floor is how
    // a "weighted" bag quietly stops being weighted.
    const held: Pattern[] = []
    let chosen: Pattern | null = null
    for (let guard = 0; guard < 400; guard++) {
      if (bag.length === 0) refillBag(t)
      const p = bag.pop() as Pattern
      if (eligible(p, t, z)) {
        chosen = p
        break
      }
      held.push(p)
    }
    for (const p of held) bag.push(p)
    if (held.length) rng.shuffle(bag)
    return chosen ?? (PATTERN_BY_ID.get('open') as Pattern)
  }

  /* ---- committing --------------------------------------------------- */

  function recycle(e: MutableEntity) {
    pool.push(e)
  }

  /** merge the sorted scratch into `entities`, which stays sorted by z0. */
  function commitScratch() {
    if (scratch.length === 0) return
    scratch.sort((a, b) => a.z0 - b.z0)
    for (const e of scratch) {
      entities.push(e)
      committed.push(e)
    }
    // insertion pass over the tail. The array was sorted and the new run is
    // sorted, so this is O(inversions) — which is zero except for a night
    // service, which spawns behind everything and walks back a few dozen slots.
    for (let i = entities.length - scratch.length; i < entities.length; i++) {
      const e = entities[i] as MutableEntity
      let j = i - 1
      while (j >= 0 && (entities[j] as MutableEntity).z0 > e.z0) {
        entities[j + 1] = entities[j] as MutableEntity
        j--
      }
      entities[j + 1] = e
    }
    scratch.length = 0
  }

  function dropScratch() {
    for (const e of scratch) recycle(e)
    scratch.length = 0
  }

  /* ---- the mote layer, §E.6 ---------------------------------------- */

  function isLaneClear(lane: number, za: number, zb: number): boolean {
    for (const e of entities) {
      if (e.collect || e.lane !== lane) continue
      if (e.z1 > za && e.z0 < zb && e.y0 < 1.6) return false
    }
    for (const e of scratch) {
      if (e.collect || e.lane !== lane) continue
      if (e.z1 > za && e.z0 < zb && e.y0 < 1.6) return false
    }
    return true
  }

  function layMotes(w: readonly WitnessSample[], za: number, zb: number, t: number) {
    if (w.length === 0) return
    // A fractional credit rather than a "next z" cursor. The witness is sampled
    // every MOTE_STEP = 1.6 u, so a cursor can only ever place a mote every 1.6
    // or every 3.2 — 62 or 31 per 100 u, and the authored densities (55 down to
    // 35) sit between the two. The credit lets the phase drift and the long-run
    // density comes out exactly as authored.
    const stride = 100 / (MOTE_DENSITY[Math.min(t, 7)] as number)
    const perSample = MOTE_STEP / stride
    let credit = 1
    // baiting, tier-gated: the line is a suggestion, not a promise — but a
    // suggestion that is always right teaches nothing after tier 1
    let bait = 0
    let baitLane: -1 | 0 | 1 = 0
    for (const s of w) {
      if (s.z < za || s.z > zb) continue
      // an airborne sample always gets a mote: the arc IS the trajectory, and
      // nine over fourteen ticks is what makes the spacing stretch at speed
      const onArc = s.pose === 'air'
      const onRoof = s.y > 0.5
      credit += perSample
      // …but it is still SPENT, and the credit is allowed to go negative. The
      // exemption used to be free, and on a track with as much roof and arc in
      // it as this one now has, free means the authored density is a floor and
      // not an average: fifty-eight motes per hundred units against an authored
      // fifty-five falling to thirty-five. Spending it pays the arc back out of
      // the flat that follows, the arc still reads as one unbroken line, and
      // the long-run density is the number in the table.
      if (onArc || onRoof) {
        credit -= 1
      } else {
        if (credit < 1) continue
        credit -= 1
      }

      let lane = s.lane
      if (bait > 0) {
        lane = baitLane
        bait--
      } else if (t >= 2 && rng.chance(0.2)) {
        const alt = (s.lane === 0 ? (rng.chance(0.5) ? -1 : 1) : 0) as -1 | 0 | 1
        if (isLaneClear(alt, s.z - 2, s.z + 24)) {
          baitLane = alt
          bait = 6
          lane = alt
        }
      }

      const e = sink.take()
      e.kind = 'mote'
      e.lane = lane
      e.x = laneToX(lane)
      e.y0 = e.y1 = (onArc || onRoof ? s.y : 0) + MOTE_Y
      e.z0 = e.z1 = s.z
      e.hx = DIMS.mote.hx
      e.lethal = false
      e.standable = false
      e.collect = true
      scratch.push(e)

      // roof lines pay 3×: three times the motes, which is the whole
      // risk/reward axis and needs no extra field on the entity to say so
      if (onRoof) {
        for (let k = 1; k <= 2; k++) {
          const m = sink.take()
          m.kind = 'mote'
          m.lane = lane
          m.x = laneToX(lane)
          m.y0 = m.y1 = s.y + MOTE_Y
          m.z0 = m.z1 = s.z + (k * MOTE_STEP) / 3
          m.hx = DIMS.mote.hx
          m.lethal = false
          m.standable = false
          m.collect = true
          scratch.push(m)
        }
      }
    }
  }

  /* ---- powerups and crates ----------------------------------------- */

  function maybeSpawnPickup(z: number, w: readonly WitnessSample[], t: number) {
    if (z < nextPowerZ) return
    nextPowerZ = z + POWER_WINDOW
    const forced = z - lastPowerAnyZ >= POWER_PITY
    if (!forced && !rng.chance(POWER_CHANCE)) return

    const pool2: PowerKind[] = []
    for (const k of POWER_KINDS) {
      if (z - lastPowerZ[k] < POWER_REPEAT) continue
      if ((k === 'boots' || k === 'updraft') && t < 2) continue
      pool2.push(k)
    }
    if (pool2.length === 0) return
    const kind = rng.pick(pool2)
    const at = w.find((s) => s.z > z + 12) ?? w[w.length - 1]
    if (!at) return
    lastPowerZ[kind] = z
    lastPowerAnyZ = z
    const e = sink.take()
    e.kind = 'pickup'
    e.lane = at.lane
    e.x = laneToX(at.lane)
    e.y0 = e.y1 = at.y + MOTE_Y
    e.z0 = e.z1 = at.z
    e.hx = DIMS.pickup.hx
    e.lethal = false
    e.standable = false
    e.collect = true
    e.power = kind
    scratch.push(e)
  }

  function maybeSpawnCrate(z: number, w: readonly WitnessSample[]) {
    if (z < nextCrateZ) return
    nextCrateZ = z + CRATE_WINDOW
    const at = w.find((s) => s.z > z + 20) ?? w[w.length - 1]
    if (!at) return
    const e = sink.take()
    e.kind = 'crate'
    e.lane = at.lane
    e.x = laneToX(at.lane)
    e.y0 = e.y1 = at.y + MOTE_Y
    e.z0 = e.z1 = at.z
    e.hx = DIMS.crate.hx
    e.lethal = false
    e.standable = false
    e.collect = true
    scratch.push(e)
  }

  /**
   * …and it must also come out at the SLOWEST legal speed on the stretch, not
   * only at speedAt(d). A player who has just stumbled is doing 0.72× for the
   * next second and a bit, and a roof gap he can clear at full pelt is a roof
   * gap he undershoots at 0.72. Checking only the nominal speed is how a
   * generator ships a hole that only kills people who already made one mistake.
   */
  function slowOk(za: number, zb: number, speedFn: (d: number) => number): boolean {
    // …but only where there is something to overshoot. On a stretch with no
    // standable surface the 0.72× run is strictly easier than the full-speed
    // one — everything arrives later and you have longer to react — so proving
    // it again costs a solve and tells you nothing. Solves are the expensive
    // thing in this file and this halves them.
    let roofs = false
    for (const e of scratch) if (e.standable && !e.collect) roofs = true
    if (!roofs) return true
    const slow = (d: number) => speedFn(d) * 0.72
    return solve(buildSolveSet(za, zb), za, zb, slow, carryLane, carryY).solvable
  }

  /* ---- writing one pattern ------------------------------------------ */

  /**
   * The slice of the world the solver has to look at: everything already
   * committed that overlaps the stretch, plus what we have just decoded and not
   * committed yet. Reused, never reallocated — this runs a few times per
   * pattern and a pattern is written about once a second.
   */
  const solveSet: TrackEntity[] = []
  function buildSolveSet(za: number, zb: number): TrackEntity[] {
    solveSet.length = 0
    for (const e of entities) {
      if (e.z1 < za - 4 || e.z0 > zb + 4) continue
      solveSet.push(e)
    }
    for (const e of scratch) solveSet.push(e)
    // solve() walks this with a moving head, so it must be sorted by z0 — the
    // committed half already is, the freshly decoded half is not.
    solveSet.sort((a, b) => a.z0 - b.z0)
    return solveSet
  }

  function windowsOk(res: SolveResult, speedOf: (d: number) => number): boolean {
    // every lethal piece gets its reaction floor…
    for (const wn of res.warnings) {
      const need = wn.choice ? WARN_CHOICE : WARN_SINGLE
      if (wn.lastAt - wn.visibleAt < need) return false
    }
    // …and no two decisions may fall inside DECISION_GAP_MIN of each other, and
    // no rolling three seconds may hold more than the tier's budget. A DECISION
    // is a press the line actually has to make — see SolveResult.inputs for why
    // it is not "a lethal piece whose window closes". Both are measured off the
    // solver's own timings, so they are statements about what the player will
    // actually experience.
    const inputs = res.inputs
    for (let i = 1; i < inputs.length; i++) {
      const gap = (inputs[i] as number) - (inputs[i - 1] as number)
      // two presses on the SAME tick are one decision with two hands on it — a
      // lane change begun in the air is left+jump, and asking a player to space
      // those out is asking him not to do it at all
      if (gap > 1e-9 && gap < DECISION_GAP_MIN) return false
    }
    // …and the same rule across the seam. The run-up means consecutive windows
    // overlap, but each one is solved from a fresh state and knows nothing of
    // the press the last one ended on.
    const firstZ = res.inputZ[0]
    if (firstZ !== undefined && carryInputZ > -Infinity) {
      const gap = travelTime(carryInputZ, firstZ, speedOf)
      if (gap > 1e-9 && gap < DECISION_GAP_MIN) return false
    }
    const budget = BUDGET[Math.min(tier, 7)] as number
    for (let i = 0; i < inputs.length; i++) {
      let n = 0
      const t0 = inputs[i] as number
      for (let j = i; j < inputs.length; j++) {
        if ((inputs[j] as number) - t0 <= 3.0) n++
      }
      if (n > budget) return false
    }
    return true
  }

  function writeOne(speedFn: (d: number) => number) {
    const z = writtenTo
    tier = tierAt(z)

    // the teaching opening is scripted; after 400 u the tiers take over
    let p: Pattern | null = null
    if (z < OPENING_END) {
      for (const o of OPENING) {
        if (z <= o.z && o.z < z + TILE * 3) {
          p = PATTERN_BY_ID.get(o.id) ?? null
          break
        }
      }
      if (!p) {
        // empty teaching track: advance two tiles at a time, motes only. The
        // first sixty units carry a single line down the centre and nothing
        // else, because the very first thing to teach is that the line is
        // where you belong.
        const w = solve(buildSolveSet(z, z + TILE * 2), z, z + TILE * 2, speedFn, carryLane, carryY)
        layMotes(w.witness, z, z + TILE * 2, 0)
        commitScratch()
        for (const s of w.witness) if (s.z >= z && s.z < z + TILE * 2) witness.push(s)
        const tail = w.witness[w.witness.length - 1]
        if (tail) {
          carryLane = tail.lane
          carryY = tail.y
        }
        clearBefore += TILE * 2
        writtenTo = z + TILE * 2
        return
      }
    } else {
      p = draw(tier, z)
    }

    const mirrored = p.mirror && rng.chance(mirrorRun >= 2 ? 0.2 : 0.5)
    let length = 0
    try {
      length = decode(p, mirrored, z, sink)
    } catch (err) {
      dropScratch()
      if (import.meta.env?.DEV) console.warn('[surf] decode failed', err)
      p = PATTERN_BY_ID.get('open') as Pattern
      length = decode(p, false, z, sink)
    }

    // the night service needs its speed, which only the cursor knows
    if (p.family === 'runner') {
      const v = speedFn(z)
      const lead = serviceLead(v)
      for (const e of scratch) {
        if (e.kind !== 'service') continue
        e.speed = v * SERVICE_OVERTAKE
        e.z0 -= lead
        e.z1 -= lead
      }
      lastServiceZ = z
      serviceDraws = 0
    } else {
      serviceDraws++
    }

    // rest, authored in seconds of tempo and quantised up to a whole tile so
    // the ramp is felt as tempo — which is what it is — and does not
    // accidentally get easier as the speed rises
    let restTiles = Math.ceil(((REST_S[Math.min(tier, 7)] as number) * speedFn(z)) / TILE)

    /* --- CONSTRUCT SOLVABLE, THEN PROVE ANYWAY. And when the proof fails,
           TIGHTEN — push the rest out by one tile and measure again. Rejection
           ("throw it away and draw another") gives the right track and the
           wrong distribution: the templates that survive are the easy ones. --- */
    const zEndOf = (rt: number) => z + length + rt * TILE
    /*
     * Solve only as far as there is anything to solve.
     *
     * The rest is empty by construction and so, often, is most of a pattern:
     * `overtake1` is ninety-six units of reserved-clear corridor with one rake
     * coming up behind. Proving a hundred ticks of nothing costs forty-six
     * thousand state expansions and showed up as a fifteen-millisecond tick.
     * Everything past the last box plus a jump's reach is a straight line, and
     * the witness for a straight line is written below rather than searched for.
     */
    const solveEnd = (rt: number) => {
      let last = z + TILE * 2
      for (const e of scratch) {
        if (e.collect || e.kind === 'service') continue
        if (e.z1 > last) last = e.z1
      }
      return Math.min(zEndOf(rt), last + jumpRange(speedFn(z)) + 8)
    }
    // …and the run-up: the empty rest the previous pattern left behind, which
    // is where the player is actually coming from. See `clearBefore`.
    const zs = z - Math.min(clearBefore, RUNUP_S * speedFn(z))
    let res = solve(buildSolveSet(zs, solveEnd(restTiles)), zs, solveEnd(restTiles), speedFn, carryLane, carryY)
    let ok = res.solvable && windowsOk(res, speedFn) && slowOk(zs, solveEnd(restTiles), speedFn)
    let attempts = 0
    while (!ok && attempts < 2) {
      restTiles++
      res = solve(buildSolveSet(zs, solveEnd(restTiles)), zs, solveEnd(restTiles), speedFn, carryLane, carryY)
      ok = res.solvable && windowsOk(res, speedFn) && slowOk(zs, solveEnd(restTiles), speedFn)
      attempts++
    }
    if (!ok) {
      // two failures and the piece becomes a breather. This is the rarest path
      // in the file and it is still not allowed to be a surprise.
      dropScratch()
      if (import.meta.env?.DEV) console.warn('[surf] unsolvable pattern replaced', p.id)
      p = PATTERN_BY_ID.get('open') as Pattern
      length = decode(p, false, z, sink)
      restTiles = Math.ceil(((REST_S[Math.min(tier, 7)] as number) * speedFn(z)) / TILE)
      res = solve(buildSolveSet(zs, solveEnd(restTiles)), zs, solveEnd(restTiles), speedFn, carryLane, carryY)
    }

    const end = z + length + restTiles * TILE
    // …and the straight line over whatever the solver did not need to look at.
    // Empty track with no motes on it reads as a bug, not as a breather.
    const line = extendWitness(res.witness, end)
    layMotes(line, z, end, tier)
    maybeSpawnPickup(z, line, tier)
    maybeSpawnCrate(z, line)
    commitScratch()

    for (const s of line) if (s.z >= z && s.z < end) witness.push(s)

    // bookkeeping
    recentIds.push(p.id)
    while (recentIds.length > 5) recentIds.shift()
    recentFamilies.push(p.family)
    while (recentFamilies.length > 2) recentFamilies.shift()
    lastCost = p.cost
    lastSurface = p.exit === 'roof' ? 'roof' : 'ground'
    if (mirrored === (lastMirror === 1)) mirrorRun++
    else mirrorRun = 0
    lastMirror = mirrored ? 1 : 0
    while (reserved.length && (reserved[0] as { z1: number }).z1 < z) reserved.shift()

    // where the next solve starts from, and how much empty track it has to
    // start in. The rest is empty by construction; the pattern's own tail is
    // not, so only the rest counts.
    clearBefore = restTiles * TILE
    const lastPress = res.inputZ[res.inputZ.length - 1]
    if (lastPress !== undefined) carryInputZ = lastPress
    const tail = line[line.length - 1]
    if (tail) {
      carryLane = tail.lane
      carryY = tail.y
    }

    writtenTo = end
  }

  /* ---- the public face ---------------------------------------------- */

  const track: Track = {
    entities: entities as readonly TrackEntity[],
    get writtenTo() {
      return writtenTo
    },
    get tier() {
      return tier
    },
    witness: witness as readonly WitnessSample[],

    advance(z, speedFn) {
      if (releasedDrained) {
        released.length = 0
        releasedDrained = false
      }
      if (committedDrained) {
        committed.length = 0
        committedDrained = false
      }

      // THE ONE THING THAT MOVES. See the header — a threat that overtakes you
      // cannot be committed in front of you.
      for (const e of entities) {
        if (e.kind !== 'service' || !e.speed) continue
        const d = e.speed * SOLVE_TICK
        e.z0 += d
        e.z1 += d
      }
      // and it has to walk forward through the sorted array to stay sorted
      for (let i = 1; i < entities.length; i++) {
        const e = entities[i] as MutableEntity
        if ((entities[i - 1] as MutableEntity).z0 <= e.z0) continue
        let j = i - 1
        while (j >= 0 && (entities[j] as MutableEntity).z0 > e.z0) {
          entities[j + 1] = entities[j] as MutableEntity
          j--
        }
        entities[j + 1] = e
      }

      /*
       * AT MOST ONE PATTERN PER TICK, ONCE THE HORIZON IS FULL.
       *
       * Writing a pattern means decoding it and then solving it two to four
       * times, which is a few milliseconds. Doing that for two or three
       * patterns on the same tick is a ten-millisecond tick, and a
       * ten-millisecond tick is a dropped frame — reliably, about once every
       * eight seconds, which is exactly often enough to read as "this site is
       * janky" and never often enough to be caught in a profiler.
       *
       * The horizon does not need the burst: a pattern and its rest is forty to
       * sixty units and the runner covers 1.3 of them in a tick, so one write
       * every thirty ticks keeps 96 u committed with room to spare. The burst
       * is only for the cold start and the retry, where it is the whole budget
       * and nobody is looking at a frame yet.
       */
      let guard = 0
      const cap = primed ? 1 : 64
      while (writtenTo < z + writeAhead && guard++ < cap) writeOne(speedFn)
      if (writtenTo >= z + writeAhead) primed = true

      // release behind — and retire a night service that has got away. It moves
      // at twice your speed, so once it is past it never comes back and it will
      // never fall behind the despawn line on its own; left alone, every rake
      // of the run stays in the array forever, being re-sorted every tick.
      const cut = z - despawnBehind
      let keep = 0
      for (let i = 0; i < entities.length; i++) {
        const e = entities[i] as MutableEntity
        const gone = e.kind === 'service' && e.z0 > z + writeAhead
        if (e.z1 < cut || gone) {
          released.push(e)
          continue
        }
        entities[keep++] = e
      }
      entities.length = keep

      let wKeep = 0
      for (let i = 0; i < witness.length; i++) {
        const s = witness[i] as WitnessSample
        if (s.z < cut) continue
        witness[wKeep++] = s
      }
      witness.length = wKeep
    },

    drainReleased() {
      if (releasedDrained) return EMPTY
      releasedDrained = true
      // the caller reads these before the next advance(), which is when they
      // return to the pool. Handing them back any earlier means the scene is
      // freeing a slot for an entity the generator has already re-issued.
      for (const e of released) recycle(e)
      return released as TrackEntity[]
    },

    drainCommitted() {
      if (committedDrained) return EMPTY
      committedDrained = true
      return committed as TrackEntity[]
    },

    reserve(z0, z1) {
      // BEFORE the generator writes into it, or it is ignored. A reservation
      // that lands on committed track is a lie: the track is immutable there,
      // and pretending otherwise is how an updraft drops you into a coach.
      if (z0 < writtenTo) return false
      reserved.push({ z0, z1 })
      return true
    },

    reset(seed) {
      for (const e of entities) recycle(e)
      entities.length = 0
      for (const e of released) recycle(e)
      released.length = 0
      committed.length = 0
      releasedDrained = false
      committedDrained = false
      witness.length = 0
      scratch.length = 0
      rng = createRng(seed)
      writtenTo = 0
      tier = 0
      lastSurface = 'ground'
      lastCost = 0
      recentIds.length = 0
      recentFamilies.length = 0
      reserved.length = 0
      lastServiceZ = -Infinity
      serviceDraws = 99
      lastMirror = 0
      mirrorRun = 0
      clearBefore = 0
      carryLane = 0
      carryY = 0
      carryInputZ = -Infinity
      primed = false
      nextPowerZ = POWER_WINDOW
      lastPowerAnyZ = 0
      for (const k of POWER_KINDS) lastPowerZ[k] = -Infinity
      nextCrateZ = CRATE_WINDOW
      bag.length = 0
      bagTier = -1
    },
  }

  return track
}

/**
 * The simulation. Everything that decides anything lives here and nothing else
 * does — no three.js, no DOM, no `window`, no `performance.now()`. The tick's
 * clock arrives as an argument. Node can `await import()` this file, which is
 * what lets a headless checker drive a perfect bot through six thousand units
 * of track two hundred times and prove the game is fair before anyone has
 * drawn a carriage.
 *
 * FIXED 20 Hz, LIKE THE REST OF THE HOUSE. `TICK` is 0.05 and it never changes
 * — not for slow-motion (that scales the *accumulator*, which is a different
 * thing), not for a fast phone, not for a slow one. Render interpolates on
 * `k = acc / TICK` between the last two tick states, and `prev` is copied at
 * the very TOP of `step()` for exactly that. It has to be the top: copied at
 * the bottom, `prev` is the tick that just finished — the same numbers `state`
 * is holding — and the lerp between them is the identity. The game still runs
 * at 20 Hz, it just also *draws* at 20 Hz, on any monitor, and reads as a
 * dropped-frame stutter that no amount of GPU makes better.
 *
 * WRONG TURN, DO NOT RETAKE: someone will propose 60 Hz so the 200 ms lane
 * tween does not resolve in four coarse steps. Two minigames on two tick rates
 * is two physics to reason about, and the responsiveness 60 Hz was buying is
 * bought for nothing by three other things: the input queue is filled every
 * rAF frame rather than every tick, so no swipe is ever dropped; the vertical
 * channel is drained TWICE a tick, once before integration and once after a
 * landing; and the figure's lean is a render-side spring fed straight off the
 * input event, so the first pixel of lateral motion is on screen inside one
 * frame even though the authoritative position steps at 20 Hz.
 *
 * UNITS. Everything here is per SECOND or in integer TICKS. `physics.ts` next
 * door states its velocities per tick, because those constants are Minecraft's
 * and re-deriving them would be a mistake; none of these are anybody's but
 * ours, so they are stated the readable way and multiplied by TICK inside the
 * tick. Timers are integer ticks and are named `…Ticks`. The only milliseconds
 * in the file are `tickMs`, which exists to be handed straight to the input
 * buffer and is never arithmetic.
 *
 * THE INTEGRATOR IS VELOCITY-VERLET AND THAT IS NOT A FLOURISH.
 * `y += vy*dt − ½g dt²` is EXACT for constant acceleration, which is why the
 * apex is 2.5725 u and the airtime is fourteen whole ticks — seven up, seven
 * down — instead of "about 2.9" or "about 2.2" depending on whether you
 * happened to subtract gravity before or after the move. Every arithmetic
 * claim in the spec is literally true of this code, and that is only possible
 * because the integrator has no error to accumulate.
 *
 * THE TICK ORDER IS THE CONTRACT. Two of these steps swap places in the naive
 * version and each swap is a bug you can feel:
 *
 *   0  `prev` copied FIRST, before anything moves
 *   1  clear the one-tick flags
 *   2  advance the track (commit ahead, release behind)
 *   3  read LAST tick's ground state, the way physics.ts does
 *   4  lane channel: keep, abort, or take-and-discard
 *   5  vert channel, early drain
 *   6  integrate: speed → z, tween → x, gravity → y
 *   7  collide: swept box, classify, resolve
 *   8  landed? kill the coyote, start the dive-roll, LATE-drain a jump
 *   9  left the ground falling? arm the coyote
 *   10 collectables, the flare's pull, the near-miss test
 *   11 timers, heat, the guard, recovery, multiplier, score
 *   12 counters down
 *
 * WRONG TURNS, DO NOT RETAKE
 *
 * • An inapplicable lane intent (left, in the leftmost lane) is TAKEN AND
 *   DISCARDED on the tick it is seen. Leaving it to "expire naturally" means it
 *   fires 200 ms later in a completely different context, and a ghost input is
 *   worse than a dropped one by a wide margin — a dropped input feels like the
 *   game missed you, a ghost input feels like the game is playing itself.
 * • There is NO DOUBLE JUMP. Not with boots, not with the handcar, not off the
 *   coyote window, not at any tier. Subway Surfers has none and its absence is
 *   the only reason committing to a jump means anything.
 * • The lane tween NEVER scales with speed. At 12 u/s a lane change costs 2.4 u
 *   of track and at 26 it costs 5.2, and that growth *is* the difficulty curve
 *   — free, with not one constant changing. Clones that scale it flatten out
 *   around tier 4 and become boring, and nobody can ever say why.
 * • The low hitbox goes ON at tick 0 of the roll input and OFF at tick 9, while
 *   the animation runs 11. Instantly-on, lazily-off. Rolling slightly early
 *   must never punish you; the two-tick tail is animation and nothing else.
 * • Lethality is an AUTHORED FLAG on the entity, never derived from how deep
 *   you got into it. The real game does the same: failing to duck under a
 *   train-mounted barrier kills you, failing to duck under a signal light trips
 *   you, and the two look nearly identical on screen.
 * • There is NO FALL DAMAGE, at any height. The only way a roof exit kills you
 *   is landing into the rear face of something.
 * • A stumble takes NO CONTROL AWAY. Fourteen ticks of animation, a speed
 *   penalty, and full agency throughout. A game that removes the controls at
 *   the moment you most need them is a game people close the tab on.
 */

import { clamp } from '../core/contract'
import { createRng, type Rng } from './rng'
import { laneToX, speedAt, xToLane, type PowerKind, type Track, type TrackEntity } from './track'

/* ================================================================== *
 * §D.1  Tick and frame
 * ================================================================== */

/** seconds per simulation tick — 20 per second, house rule 3. */
export const TICK = 0.05
/**
 * A backgrounded tab must not simulate a hundred ticks on the frame it comes
 * back and fling you off the track. Past this many, the accumulator drops the
 * time on the floor: a stall is a pause, not a fast-forward.
 */
export const MAX_CATCHUP = 5

/* ================================================================== *
 * §D.4  The runner's capability envelope
 * ================================================================== */

/** with GRAVITY below → apex 2.5725 u, rise 0.35 s = 7 ticks, airtime 14. */
export const JUMP_V = 14.7
/** 4.3× earth. A realistic-gravity jump in a runner is floaty and costs you
 *  lane agency for far too long — the jump stops being a move and becomes a
 *  commitment you regret. */
export const GRAVITY = 42.0
/**
 * Swipe down while airborne: `vy = min(vy, −DIVE_V)`, then roll on contact.
 * From apex that is two ticks instead of seven — 6.5 u of track recovered at
 * VMAX. This is a core move, not a flourish, and it is the difference between
 * a jump being a decision and a jump being a 0.70-second sentence.
 */
export const DIVE_V = 26.0
/**
 * Feet within this below a roof lip and rising → you are on the roof. Widens
 * the mount window from 0.266 s (5.3 ticks) to 0.408 s (8.2 ticks). Without
 * it, mounting a carriage reads as luck, and a mechanic that reads as luck is
 * a mechanic nobody practises.
 */
export const LEDGE_SNAP = 0.5
/**
 * A RAMP LIFTS YOU FASTER THAN A LEDGE, AND THAT IS THE WHOLE POINT OF IT.
 *
 * WRONG TURN, DO NOT RETAKE. A ramp rises 2.20 over one 4-unit tile — 0.55 per
 * unit of z. At VMAX the ground under your feet climbs 0.715 in a single tick
 * and LEDGE_SNAP is 0.50, so held to the ledge rule every ramp stopped working
 * somewhere around 18 u/s: you slid up the first few inches of the wedge, were
 * refused the rest, and ran into the face of the carriage you were supposed to
 * be climbing onto. The mantle's job is to refuse a coach roof you are running
 * PAST; it has no business refusing the wedge you are standing on. Must clear
 * 0.715 with room, and applies to `ramp` and nothing else. track.ts carries
 * the same number as SOLVE_RAMP_SNAP and the two are asserted equal.
 */
export const RAMP_SNAP = 0.8
/** 0.55 s of animation. */
export const ROLL_TICKS = 11
/** 0.45 s of low box: ON at tick 0 of the input, OFF at tick 9. */
export const ROLL_LOW_TICKS = 9
/** 0.20 s on the ground. Peak lateral 22.5 u/s at the smoothstep's middle. */
export const LANE_TICKS = 4
/** 15 % slower in the air; a mid-air lane change is a real commitment. */
export const LANE_TICKS_AIR = 5
/** on the handcar. It drifts. */
export const LANE_TICKS_BOARD = 3
/** 0.20 s. Armed ONLY by leaving an edge with vy ≤ 0, zeroed by a jump or a
 *  dive, so it can never quietly become a double jump. */
export const COYOTE_TICKS = 4
/** twelve centimetres of hop during a grounded lane change. Invisible if you
 *  look for it, unmistakable if it is missing. */
export const MOUNT_HOP = 0.12

/**
 * Hitboxes. All AABBs, all inset from the visual mesh, always in the player's
 * favour. The figure is 0.60 wide and 1.80 tall and the capsule is narrower for
 * two independent reasons: players judge a collision by their torso and do not
 * count arms, shoulders or the lantern as *them*; and during a lane change the
 * body sweeps continuously across the boundary, so a full-width box clips the
 * corner of a barrier the player watched themselves clear.
 */
export const STAND_HX = 0.3
export const STAND_HZ = 0.28
export const STAND_H = 1.75
export const AIR_HX = 0.28
export const AIR_HZ = 0.3
export const AIR_H = 1.5
export const ROLL_HX = 0.3
export const ROLL_HZ = 0.55
export const ROLL_H = 0.9

/** how far a jump carries at speed v. The generator needs to know. */
export const jumpAirTicks = Math.round((2 * JUMP_V) / GRAVITY / TICK)

/* ================================================================== *
 * §D.5  Crash, stumble, the guard
 * ================================================================== */

/** 0.70 s of animation. NO CONTROL LOCKOUT, EVER. */
export const STUMBLE_TICKS = 14
export const STUMBLE_SPEED = 0.72
/** ~1.2 s to recover. `z` keeps accumulating, so the ramp target is untouched:
 *  you lose *time*, not progression. */
export const STUMBLE_RECOVER = 2.5
export const SCRAPE_SPEED = 0.85
export const SCRAPE_RECOVER = 3.5
/**
 * TWO STUMBLES INSIDE 2.5 SECONDS = CAUGHT = RUN OVER. The best single
 * mechanic in the genre: a small mistake becomes two and a half seconds of real
 * dread rather than a shrug, and there is no instant death the player could not
 * have seen coming.
 */
export const HEAT_DECAY = 2.5
/** at FAR he is outside the fog and invisible; at NEAR his lantern falls across
 *  your shoulders and casts your shadow forward onto the track ahead. That
 *  shadow is the entire readout — no health bar, no HUD element. */
export const GUARD_FAR = 14.0
export const GUARD_NEAR = 1.5
export const GUARD_RATE = 4.0
/**
 * Clipping the back corner of a blocker is a stumble, not a death. Fires maybe
 * once every two minutes; the player never knows it happened, and without it
 * they feel robbed twice as often as they actually are.
 */
export const CORNER_GRACE = 0.35
export const CORNER_PEN = 0.18
/** lateral overlap below this, while moving AWAY, is a stumble not a death. */
export const GRAZE = 0.12
/** a side slam drags you along the flank for this long before the camera takes
 *  over — do not let the tween quietly finish inside the geometry. */
export const SLAM_TICKS = 5

/* ================================================================== *
 * §D.6  Score
 * ================================================================== */

/** units of UNBROKEN running per +1 on the multiplier. */
export const MULT_STEP = 400
export const MULT_CAP = 30
/** our carriages are stalled, so a near-miss is a line you *choose* — which is
 *  why ours pays and the real game's does not. */
export const NEAR_GAP = 0.6
export const NEAR_TICKS = 2
export const NEAR_SPEED = 14
export const NEAR_POINTS = 25
export const NEAR_CHAIN_TICKS = 80

/* ================================================================== *
 * §D.7  Powerups
 * ================================================================== */

export const POWER_TICKS: Readonly<Record<PowerKind, number>> = {
  flare: 240, // 12 s
  tally: 400, // 20 s
  boots: 400, // 20 s
  updraft: 120, // 6 s
  handcar: 600, // 30 s
}

/** all lanes, and the pull is done in the RUNNER'S FRAME — at 26 u/s a mote
 *  pulled in world space chases you and loses. */
export const FLARE_RADIUS = 8.0
export const FLARE_REACH = 14.0
export const FLARE_ACCEL = 45.0
export const FLARE_VMAX = 30.0
/** apex 4.51 u, airtime 19 ticks. Clears a 3.40 coach from the ground. Still
 *  no double jump. */
export const BOOTS_JUMP_V = 19.0
export const BOOTS_GRAV = 40.0
export const UPDRAFT_ALT = 7.5
export const UPDRAFT_UP_TICKS = 18 // 0.90 s ease-out
export const UPDRAFT_DOWN_TICKS = 22 // 1.10 s ease-in
export const HANDCAR_CAP = 3
/** 5 s before it can be re-deployed… */
export const HANDCAR_RECHARGE = 100
/** …and 0.6 s of invulnerability after a detonation. */
export const HANDCAR_INVULN = 12
/** a mote in the bank every this many, and a handcar every this much survived. */
export const HANDCAR_PER_MOTES = 500
export const HANDCAR_PER_UNITS = 1000

/* ================================================================== *
 * §D.10  Death, retry, revive
 * ================================================================== */

/** the camera swoop is decoration you can play through: input is live from
 *  frame one and the sim runs normally throughout. */
export const INTRO_TICKS = 18
export const INTRO_TICKS_RETRY = 8
/** 1050 ms from the fatal contact to the panel. */
export const DEATH_TICKS = 21
export const RESPAWN_TICKS = 8
/** 1.2 s of invulnerability after a revive… */
export const REVIVE_INVULN = 24
/** …and the lane clear for this many units, which is bought as invulnerability
 *  because committed track is immutable and a revive that rewrote it would be
 *  the one place in the game where the world changes under you. */
export const REVIVE_CLEAR_U = 60
export const REVIVE_BACK_U = 20
/** banked motes, per revive within a run. */
export const REVIVE_COST = [250, 500, 1000] as const

/** post-event amnesty, §E.8. Attempted through `track.reserve()`, which only
 *  succeeds when the stretch is still unwritten; where it cannot reach, the
 *  same promise is kept with invulnerability ticks. */
export const AMNESTY_UPDRAFT_TICKS = 40 // 2.0 s
export const AMNESTY_HANDCAR_TICKS = 50 // 2.5 s
export const AMNESTY_REVIVE_TICKS = 60 // 3.0 s

/* ================================================================== *
 * What the sim consumes
 * ================================================================== */

/** The four intents. Nothing else is an input. There is no held state. */
export type Action = 'left' | 'right' | 'jump' | 'roll'

/**
 * What sim.ts needs from input.ts. input.ts implements it; surf.ts hands it in.
 * sim.ts does NOT import input.ts — this is the seam that keeps the sim
 * loadable in Node, where a test harness passes a scripted stub.
 */
export interface ActionSource {
  /** what is waiting on this channel at sim time `tickMs`. Never consumes. */
  peek(ch: 'lane' | 'vert', tickMs: number): Action | null
  /** …and consume it. Called ONLY on the tick the action actually starts. */
  take(ch: 'lane' | 'vert', tickMs: number): Action | null
  clear(): void
}

export type Pose = 'run' | 'air' | 'roll' | 'stumble' | 'board' | 'dead'
export type Phase = 'intro' | 'running' | 'dying' | 'over' | 'reviving'

/**
 * Why the run ended. The card says a different sentence for each and the
 * camera swings to a different angle, because the player's question after a
 * death is always *which way did I get it wrong*.
 */
export type DeathCause =
  | 'headOn' // into the front or rear face of something
  | 'sideLeft' // into a flank, lane-changing left
  | 'sideRight'
  | 'ceiling' // failed to roll under a lethal beam
  | 'service' // the night service got you
  | 'caught' // two stumbles inside HEAT_DECAY — the guard has you

export interface PowerState {
  readonly kind: PowerKind
  /** ticks remaining */
  ticks: number
  /** total ticks it started with, for the ring's dasharray */
  total: number
}

/**
 * Everything the renderer, the figure and the HUD are allowed to read. It is a
 * live object, mutated in place by the sim; the scene copies out of it and
 * never writes to it.
 */
export interface SimState {
  phase: Phase
  pose: Pose

  /* --- position. The three fields surf.ts interpolates on k. --- */
  /** distance run, world units. Also the score's distance term. */
  z: number
  /** lateral position, world units. NOT a lane index — this is the tween's
   *  current value, and it is fractional for LANE_TICKS ticks at a time. */
  x: number
  /** the FEET, world units above the rail bed */
  y: number

  /* --- lanes --- */
  lane: -1 | 0 | 1
  laneFrom: number
  laneTicks: number
  laneSpan: number
  /** u/s, read out of the tween for the camera bank and the figure's lean */
  lateralV: number

  /* --- vertical --- */
  vy: number
  onGround: boolean
  /** the surface the feet are resting on, or would land on. 0 = ballast. */
  groundY: number
  coyoteTicks: number
  justLanded: boolean
  landedOnRoof: boolean
  /** a dive is a state-machine consequence, not a queued intent. It fires on
   *  the landing tick unconditionally and never goes through the buffer. */
  diveRoll: boolean

  /* --- roll --- */
  rollTicks: number
  low: boolean

  /* --- speed --- */
  targetSpeed: number
  speed: number
  gear: boolean

  /* --- the guard, and the two-strike rule --- */
  heat: number
  guardGap: number
  stumbleTicks: number

  /* --- score --- */
  score: number
  motes: number
  mult: number
  multBase: number
  unbroken: number
  nearMisses: number
  chain: number
  chainTicks: number
  nearMiss: 0 | 1

  /* --- powerups --- */
  powers: PowerState[]
  handcars: number
  handcarCooldown: number
  invuln: number

  /* --- death --- */
  cause: DeathCause | null
  deadTicks: number
  revivesUsed: number

  /* --- bookkeeping the HUD reads --- */
  ticks: number
  letters: string[]
}

export interface SimConfig {
  readonly seed: number
  readonly input: ActionSource
  readonly track: Track
  /** 1 + completed mission sets, from progress.ts. Defaults to 1. */
  readonly multBase?: number
  /** handcars in the bank at the start of the run. Defaults to 0. */
  readonly handcars?: number
  /** a running start: begin at this distance and this speed. Defaults 0. */
  readonly headstart?: number
  readonly onEvent?: (e: SimEvent) => void
}

export type SimEvent =
  | { kind: 'lane'; dir: -1 | 1 }
  | { kind: 'jump' }
  | { kind: 'land'; roof: boolean; hard: boolean }
  | { kind: 'roll' }
  | { kind: 'dive' }
  | { kind: 'mote'; streak: number; x: number; y: number; z: number }
  | { kind: 'power'; power: PowerKind; ticks: number; x: number; y: number; z: number }
  | { kind: 'crate'; reward: string }
  | { kind: 'letter'; glyph: string }
  | { kind: 'near'; side: -1 | 1; chain: number; points: number }
  | { kind: 'stumble'; dir: 'fwd' | 'left' | 'right' }
  | { kind: 'gear'; gear: number }
  | { kind: 'mult'; mult: number }
  | { kind: 'boardOn' }
  | { kind: 'boardPop'; x: number; y: number; z: number }
  | { kind: 'serviceWarn'; lane: -1 | 0 | 1; ttc: number }
  | { kind: 'servicePass'; side: -1 | 1 }
  | { kind: 'death'; cause: DeathCause }

export interface Sim {
  readonly state: SimState
  /** the last tick's copy of z/x/y/guardGap, for render interpolation */
  readonly prev: { z: number; x: number; y: number; guardGap: number }
  /** one 20 Hz tick. `tickMs` is the wall-clock instant this tick REPRESENTS,
   *  not `performance.now()` — the input buffer's not-from-the-future rule
   *  depends on the difference. */
  step(tickMs: number): void
  /** deploy the handcar, if one is banked and the cooldown is clear. Returns
   *  whether it fired, so the HUD can shake the button if it did not. */
  deployHandcar(): boolean
  /** spend a revive. Returns false if the phase is wrong. */
  revive(): boolean
  /** a fresh run on the same allocations. Nothing here may allocate. */
  restart(seed: number, multBase: number, handcars: number, headstart: number): void
}

/* ================================================================== *
 * Helpers
 * ================================================================== */

/** smoothstep. Ease-out starts at 2Δ/T, teleports 0.6 u on the first tick and
 *  reads as a snap; smoothstep peaks in the middle and reads as a hop
 *  sideways, which is what the animation actually is. */
const smoothstep = (u: number) => u * u * (3 - 2 * u)
/** the only correct way to smooth toward a target at a fixed rate. Never
 *  `min(1, dt*rate)` — that one is frame-rate dependent by construction. */
const approach = (dt: number, rate: number) => 1 - Math.exp(-rate * dt)
/** ease-out for the updraft's climb, ease-in for its fall */
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInCubic = (t: number) => t * t * t

const CRATE_TABLE: readonly { reward: string; p: number }[] = [
  { reward: 'motes50', p: 0.4 },
  { reward: 'motes250', p: 0.2 },
  { reward: 'tally', p: 0.2 },
  { reward: 'handcar', p: 0.15 },
  { reward: 'motes1000', p: 0.05 },
]

export function createSim(cfg: SimConfig): Sim {
  const track = cfg.track
  const src = cfg.input
  let rng: Rng = createRng(cfg.seed)
  const emit = (e: SimEvent) => cfg.onEvent?.(e)

  const st: SimState = {
    phase: 'intro',
    pose: 'run',
    z: 0,
    x: 0,
    y: 0,
    lane: 0,
    laneFrom: 0,
    laneTicks: 0,
    laneSpan: 0,
    lateralV: 0,
    vy: 0,
    onGround: true,
    groundY: 0,
    coyoteTicks: 0,
    justLanded: false,
    landedOnRoof: false,
    diveRoll: false,
    rollTicks: 0,
    low: false,
    targetSpeed: speedAt(0),
    speed: speedAt(0),
    gear: false,
    heat: 0,
    guardGap: GUARD_FAR,
    stumbleTicks: 0,
    score: 0,
    motes: 0,
    mult: 1,
    multBase: cfg.multBase ?? 1,
    unbroken: 0,
    nearMisses: 0,
    chain: 0,
    chainTicks: 0,
    nearMiss: 0,
    powers: [],
    handcars: cfg.handcars ?? 0,
    handcarCooldown: 0,
    invuln: 0,
    cause: null,
    deadTicks: 0,
    revivesUsed: 0,
    ticks: 0,
    letters: [],
  }
  const prev = { z: 0, x: 0, y: 0, guardGap: GUARD_FAR }

  /* the score's distance term is kept as an exact running integral of
     `mult · dz`. `mult` is piecewise constant, so the sum IS the integral and
     there is nothing to drift — which is what test 28 is checking. */
  let scoreDist = 0
  let scoreEvents = 0
  let introTicks = INTRO_TICKS
  let slamTicks = 0
  let moteStreak = 0
  let handcarMoteMark = HANDCAR_PER_MOTES
  let handcarDistMark = HANDCAR_PER_UNITS
  let lastGear = Math.floor(st.speed)
  let scrapeRecovering = false
  /**
   * True on the tick the coyote window was armed, and only that tick.
   *
   * WRONG TURN, DO NOT RETAKE: without it the counter is armed in step 7 and
   * decremented in step 12 of the SAME tick, so `COYOTE_TICKS = 4` buys three
   * ticks of grace and the acceptance test ("a jump 4 ticks after leaving an
   * edge fires; at 5 it does not") comes out at 3 and 4. It reads as a fine
   * game and it is a fifty-millisecond lie: paired with `BUF_JUMP_MS = 200` the
   * window around a roof edge is meant to be 350 ms and was 300. The two are
   * reasoned about together — see §D.11 — so an off-by-one here quietly retunes
   * the input buffer as well.
   */
  let coyoteArmed = false

  // near-miss bookkeeping. Two tiny rings rather than a field on the entity:
  // the generator owns those objects and the sim only borrows them.
  const nearIds = new Int32Array(8)
  const nearHold = new Int8Array(8)
  const awarded = new Int32Array(24)
  let awardedAt = 0

  /**
   * ONE OBSTACLE, ONE STUMBLE.
   *
   * A fence is 1.6 u deep and the standing box is 0.56, so at 12 u/s you are
   * inside it for four consecutive ticks. Without this ring every hurdle fired
   * four stumbles, the second of them landed inside HEAT_DECAY, and clipping a
   * *single fence* was an instant death by `caught` — which is not a difficulty
   * setting, it is a broken game. The heat rule is about two separate mistakes,
   * not about how many ticks one mistake lasts.
   *
   * A ring of ids rather than a flag on the entity, because the generator owns
   * those objects, `taken` means "consumed, stop drawing it", and a fence you
   * ran through is still very much there.
   */
  const struck = new Int32Array(12)
  let struckAt = 0
  /** services we have already cried wolf about */
  const svcIds = new Int32Array(4)
  function alreadyStruck(id: number): boolean {
    for (let i = 0; i < struck.length; i++) if (struck[i] === id) return true
    return false
  }
  function markStruck(id: number) {
    struck[struckAt] = id
    struckAt = (struckAt + 1) % struck.length
  }

  /* ---- the world, read-only ---------------------------------------- */

  /** first index worth looking at. `entities` is sorted by z0 and the deepest
   *  thing on the track is 32 u long, so 40 u of slack is exact. */
  function headIndex(z: number): number {
    const ents = track.entities
    let lo = 0
    let hi = ents.length
    const want = z - 40
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if ((ents[mid] as TrackEntity).z0 < want) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  /** how far ahead the collision pass has to look: the far edge of a jump. */
  const lookahead = () => st.speed * ((2 * JUMP_V) / GRAVITY) + 6

  function boxHX() {
    return st.low ? ROLL_HX : st.onGround ? STAND_HX : AIR_HX
  }
  function boxHZ() {
    return st.low ? ROLL_HZ : st.onGround ? STAND_HZ : AIR_HZ
  }
  function boxH() {
    return st.low ? ROLL_H : st.onGround ? STAND_H : AIR_H
  }

  /**
   * The top of whatever is under the box, or 0 for ballast. A ramp is read at
   * the LEADING edge of the box, so you are never lifted by ground you have not
   * reached yet. `ceiling` refuses surfaces above the mantle's reach, which is
   * what stops a coach roof teleporting you upward when you are running past
   * its flank.
   */
  /**
   * The height of a standable entity's top at a given z. Flat for everything
   * but a ramp, whose top is the wedge, read at the leading edge of the box.
   * `surfaceUnder` (what holds you up) and the collision sweep (what stops
   * you) BOTH go through this, because when they disagree a ramp is a wall
   * you also happen to be standing on. See the wrong turn recorded on the
   * mount test below.
   */
  function entryTop(e: TrackEntity, zLead: number): number {
    if (e.kind !== 'ramp') return e.y1
    const t = clamp((zLead - e.z0) / (e.z1 - e.z0))
    return e.y1 * (e.rise === -1 ? 1 - t : t)
  }

  /** how far this surface is allowed to lift you in one tick. See RAMP_SNAP. */
  function snapOf(e: TrackEntity): number {
    return e.kind === 'ramp' ? RAMP_SNAP : LEDGE_SNAP
  }

  function surfaceUnder(x: number, z: number, hx: number, hz: number, ceiling: number): number {
    const ents = track.entities
    let best = 0
    for (let i = headIndex(z); i < ents.length; i++) {
      const e = ents[i] as TrackEntity
      if (e.z0 > z + hz) break
      if (!e.standable || e.collect || e.taken) continue
      if (e.z1 < z - hz) continue
      if (Math.abs(e.x - x) > e.hx + hx) continue
      const top = entryTop(e, z + hz)
      // …and a ramp gets its own, larger allowance: see RAMP_SNAP
      if (top > ceiling + (snapOf(e) - LEDGE_SNAP)) continue
      if (top > best) best = top
    }
    return best
  }

  /** the same `canEnterPose` test vanilla uses: is there room to stand up here?
   *  A jump pressed under a lintel must NOT fire until there is. */
  function roomToStand(): boolean {
    const ents = track.entities
    const hx = STAND_HX
    const hz = STAND_HZ
    for (let i = headIndex(st.z); i < ents.length; i++) {
      const e = ents[i] as TrackEntity
      if (e.z0 > st.z + hz) break
      if (e.collect || e.taken || e.standable || e.kind === 'bridge') continue
      if (e.z1 < st.z - hz) continue
      if (Math.abs(e.x - st.x) > e.hx + hx) continue
      if (e.y1 <= st.y || e.y0 >= st.y + STAND_H) continue
      return false
    }
    return true
  }

  /* ---- moves --------------------------------------------------------- */

  function hasPower(k: PowerKind): PowerState | null {
    for (const p of st.powers) if (p.kind === k) return p
    return null
  }

  function onBoard() {
    return hasPower('handcar') !== null
  }

  function startLane(dest: -1 | 0 | 1, from: number) {
    const base = onBoard() ? LANE_TICKS_BOARD : st.onGround ? LANE_TICKS : LANE_TICKS_AIR
    // fully interruptible, and the span shrinks with the distance left to
    // travel: aborting two ticks into a change is a two-tick correction, not
    // another full one. The 0.35 floor stops a hair-width abort being free.
    const span = Math.max(2, Math.round(base * clamp(Math.abs(dest - from), 0.35, 2)))
    st.laneFrom = from
    st.lane = dest
    st.laneSpan = span
    st.laneTicks = span
  }

  function doJump() {
    const boots = hasPower('boots') !== null
    st.vy = boots ? BOOTS_JUMP_V : JUMP_V
    st.onGround = false
    st.coyoteTicks = 0
    st.rollTicks = 0
    st.low = false
    st.diveRoll = false
    emit({ kind: 'jump' })
  }

  function startRoll() {
    st.rollTicks = ROLL_TICKS
    st.low = true
    st.diveRoll = false
    emit({ kind: 'roll' })
  }

  function die(cause: DeathCause) {
    if (st.phase === 'dying' || st.phase === 'over') return
    st.phase = 'dying'
    st.pose = 'dead'
    st.cause = cause
    st.deadTicks = 0
    emit({ kind: 'death', cause })
  }

  function stumble(dir: 'fwd' | 'left' | 'right') {
    // the handcar disables the stumble state entirely: non-lethal obstacles are
    // smashed with a spark and no speed loss, which is what makes the board
    // feel like a board and not like a shield
    if (onBoard()) return
    if (st.heat > 0) {
      die('caught')
      return
    }
    st.heat = 1
    st.stumbleTicks = STUMBLE_TICKS
    st.speed *= STUMBLE_SPEED
    st.pose = 'stumble'
    st.unbroken = 0
    scrapeRecovering = false
    emit({ kind: 'stumble', dir })
  }

  function scrape() {
    if (onBoard()) return
    st.speed *= SCRAPE_SPEED
    scrapeRecovering = true
  }

  /* ---- powerups ------------------------------------------------------ */

  function grant(kind: PowerKind) {
    const total = POWER_TICKS[kind]
    const live = hasPower(kind)
    if (live) {
      // a second pickup RESETS the timer. It does not stack, and tally applied
      // twice is ×2 for another twenty seconds, never ×4.
      live.ticks = total
      live.total = total
      return
    }
    st.powers.push({ kind, ticks: total, total })
    if (kind === 'updraft') startUpdraft()
    if (kind === 'handcar') emit({ kind: 'boardOn' })
  }

  let updraftBaseY = 0
  function startUpdraft() {
    updraftBaseY = st.y
    st.invuln = Math.max(st.invuln, POWER_TICKS.updraft + AMNESTY_UPDRAFT_TICKS)
    // reserve the descent NOW, while the landing zone is still unwritten.
    // Killing a player two frames after handing control back is the worst thing
    // a powerup can do, and the only moment it can be prevented is this one.
    let zEst = st.z
    for (let i = 0; i < POWER_TICKS.updraft; i++) zEst += speedAt(zEst) * TICK
    const v = speedAt(zEst)
    track.reserve(zEst - v * (UPDRAFT_DOWN_TICKS * TICK) - 6, zEst + 1.1 * v + 6)
  }

  /* ---- the tick ------------------------------------------------------ */

  function step(tickMs: number): void {
    /* 0 — where the figure was when this tick began. Every frame between this
           tick and the next is drawn somewhere on the line from here to where
           it ends up, so this copy is the whole of the game's smoothness: it
           belongs above the phase returns as much as above the integrator,
           because a frozen sim must interpolate a frozen figure rather than a
           stale one. */
    prev.z = st.z
    prev.x = st.x
    prev.y = st.y
    prev.guardGap = st.guardGap

    /* the death sequence is driven by surf.ts; the sim only counts. */
    if (st.phase === 'dying') {
      st.deadTicks++
      if (st.deadTicks >= DEATH_TICKS) st.phase = 'over'
      return
    }
    if (st.phase === 'over') {
      st.deadTicks++
      return
    }
    if (st.phase === 'reviving') {
      st.deadTicks++
      if (st.deadTicks >= RESPAWN_TICKS) {
        st.phase = 'running'
        st.pose = 'run'
        st.deadTicks = 0
      }
      return
    }

    /* 1 — the one-tick flags. Everything below may set them; nothing may
           assume they survived from last tick. */
    st.justLanded = false
    st.landedOnRoof = false
    st.gear = false
    st.nearMiss = 0
    coyoteArmed = false

    /* 2 — commit ahead, release behind. Before anything reads the world. */
    track.advance(st.z, speedAt)

    /* 3 — LAST tick's ground answer, exactly as physics.ts does it. The tick
           you jump on still counts as grounded, and that is load-bearing: it is
           what lets a jump taken on the last tick of a roof still leave from
           the roof. */
    const grounded = st.onGround

    /* 4 — the lane channel. */
    const laneWant = src.peek('lane', tickMs)
    if (laneWant === 'left' || laneWant === 'right') {
      const dir = laneWant === 'left' ? -1 : 1
      const cur = xToLane(st.x)
      const dest = clamp(st.lane + dir, -1, 1) as -1 | 0 | 1
      if (dest === st.lane && st.laneTicks === 0) {
        // off the board. TAKE AND DISCARD NOW — an inapplicable intent left to
        // expire fires 200 ms later in a different context, and a ghost input
        // is worse than a dropped one.
        src.take('lane', tickMs)
      } else if (st.laneTicks > 0 && Math.sign(st.lane - st.laneFrom) === dir) {
        // same direction inside the lock: KEEP it. Three right swipes inside a
        // lane change produce the one in flight plus one more, not three.
      } else {
        src.take('lane', tickMs)
        startLane(dest, cur)
        emit({ kind: 'lane', dir: dir as -1 | 1 })
      }
    }

    /* 5 — the vertical channel, early drain. */
    const vertWant = src.peek('vert', tickMs)
    if (vertWant === 'jump') {
      if (st.rollTicks > 0) {
        // a roll cancels into a jump immediately IF THERE IS HEADROOM, and is
        // buffered otherwise. Buffering under a lintel means a player who
        // mashes jump pops out the far side at full height on the correct tick,
        // every single time, instead of losing the input.
        if (roomToStand()) {
          src.take('vert', tickMs)
          doJump()
        }
      } else if (grounded || st.coyoteTicks > 0) {
        src.take('vert', tickMs)
        doJump()
      }
      // airborne with no coyote: KEEP it. There is no double jump; the late
      // drain on the landing tick is where this one goes.
    } else if (vertWant === 'roll') {
      src.take('vert', tickMs)
      if (grounded) {
        startRoll()
      } else {
        st.vy = Math.min(st.vy, -DIVE_V)
        st.coyoteTicks = 0
        st.diveRoll = true
        emit({ kind: 'dive' })
      }
    }

    /* 6 — integrate. */
    st.targetSpeed = speedAt(st.z)
    if (st.speed < st.targetSpeed) {
      const rate = scrapeRecovering ? SCRAPE_RECOVER : STUMBLE_RECOVER
      st.speed += (st.targetSpeed - st.speed) * approach(TICK, rate)
      if (st.targetSpeed - st.speed < 0.01) {
        st.speed = st.targetSpeed
        scrapeRecovering = false
      }
    } else {
      st.speed = st.targetSpeed
      scrapeRecovering = false
    }
    const g = Math.floor(st.speed)
    if (g > lastGear) {
      lastGear = g
      st.gear = true
      emit({ kind: 'gear', gear: g })
    }

    const zPrev = st.z
    const xPrev = st.x
    const yPrev = st.y
    st.z += st.speed * TICK
    const dz = st.z - zPrev

    if (st.laneTicks > 0) st.laneTicks--
    const laneF =
      st.laneTicks > 0 && st.laneSpan > 0
        ? st.laneFrom +
          (st.lane - st.laneFrom) * smoothstep((st.laneSpan - st.laneTicks) / st.laneSpan)
        : st.lane
    st.x = laneToX(laneF)
    st.lateralV = (st.x - xPrev) / TICK

    const up = hasPower('updraft')
    if (up) {
      // the updraft removes you from the track onto a reserved rail: altitude
      // is authored, lane control is kept, and you are invulnerable for the
      // whole flight including both ends.
      const elapsed = POWER_TICKS.updraft - up.ticks
      if (elapsed < UPDRAFT_UP_TICKS) {
        st.y = updraftBaseY + (UPDRAFT_ALT - updraftBaseY) * easeOutCubic(elapsed / UPDRAFT_UP_TICKS)
      } else if (up.ticks <= UPDRAFT_DOWN_TICKS) {
        const t = 1 - up.ticks / UPDRAFT_DOWN_TICKS
        st.y = UPDRAFT_ALT * (1 - easeInCubic(t))
      } else {
        st.y = UPDRAFT_ALT
      }
      st.vy = 0
      st.onGround = false
    } else if (!st.onGround) {
      // velocity-Verlet: exact for constant acceleration, which is the whole
      // reason the numbers in the spec are the numbers in the game.
      const gr = hasPower('boots') ? BOOTS_GRAV : GRAVITY
      st.y += st.vy * TICK - 0.5 * gr * TICK * TICK
      st.vy -= gr * TICK
    }

    /* 7 — collide. */
    resolve(xPrev, zPrev, yPrev, grounded)
    if (st.phase !== 'running' && st.phase !== 'intro') return

    /* 8 / 9 — landing and the coyote window are folded into `resolve`, which
           is the only place that knows whether the feet found anything. The
           late drain has to happen here, after the resolution, or it is a full
           50 ms late on the most-felt input in the game. */
    if (st.justLanded) {
      st.coyoteTicks = 0
      if (st.diveRoll) {
        st.diveRoll = false
        startRoll()
      }
      const late = src.peek('vert', tickMs)
      if (late === 'jump') {
        src.take('vert', tickMs)
        doJump()
      }
    }

    /* 10 — collectables, the flare, near misses, the rake behind you. */
    collect()
    nearMissPass()
    servicePass()

    /* 11 — timers, heat, the guard, the multiplier, the score. */
    for (let i = st.powers.length - 1; i >= 0; i--) {
      const p = st.powers[i] as PowerState
      p.ticks--
      if (p.ticks <= 0) {
        st.powers.splice(i, 1)
        if (p.kind === 'updraft') {
          // hand control back onto reserved ground, with the amnesty already
          // paid for in invulnerability
          st.onGround = false
          st.vy = 0
          st.invuln = Math.max(st.invuln, AMNESTY_UPDRAFT_TICKS)
        }
      }
    }

    if (st.heat > 0) st.heat = Math.max(0, st.heat - TICK / HEAT_DECAY)
    const guardTarget = GUARD_FAR + (GUARD_NEAR - GUARD_FAR) * st.heat
    st.guardGap += (guardTarget - st.guardGap) * approach(TICK, GUARD_RATE)

    if (st.stumbleTicks > 0) {
      st.stumbleTicks--
      if (st.stumbleTicks === 0 && st.pose === 'stumble') st.pose = 'run'
    } else {
      st.unbroken += dz
    }

    const tally = hasPower('tally') !== null
    const base = Math.min(MULT_CAP, st.multBase + Math.floor(st.unbroken / MULT_STEP))
    const mult = tally ? base * 2 : base
    if (mult !== st.mult) {
      st.mult = mult
      emit({ kind: 'mult', mult })
    }
    scoreDist += dz * st.mult
    st.score = Math.floor(scoreDist + scoreEvents)

    // a handcar every 500 banked motes and every 1000 units survived
    while (st.motes >= handcarMoteMark && st.handcars < HANDCAR_CAP) {
      st.handcars++
      handcarMoteMark += HANDCAR_PER_MOTES
    }
    while (st.z >= handcarDistMark && st.handcars < HANDCAR_CAP) {
      st.handcars++
      handcarDistMark += HANDCAR_PER_UNITS
    }

    /* 12 — counters down. */
    if (st.rollTicks > 0) {
      st.rollTicks--
      // `>=` and not `>`, and the extra tick is deliberate. Read the flag after
      // step N and it tells you about tick N: true for ticks 0…8, gone at tick
      // 9, animation still running to 11. INSTANTLY-ON, LAZILY-OFF — rolling
      // slightly early must never punish you, and the whole fairness of the
      // mechanic is that the box outlives the input rather than the reverse.
      st.low = st.rollTicks >= ROLL_TICKS - ROLL_LOW_TICKS
    }
    // the tick it was armed on does not count against it — see `coyoteArmed`
    if (!st.onGround && st.coyoteTicks > 0 && !coyoteArmed) st.coyoteTicks--
    if (st.invuln > 0) st.invuln--
    if (st.handcarCooldown > 0) st.handcarCooldown--
    if (st.chainTicks > 0) {
      st.chainTicks--
      if (st.chainTicks === 0) st.chain = 0
    }
    if (slamTicks > 0) slamTicks--
    if (st.phase === 'intro') {
      introTicks--
      if (introTicks <= 0) st.phase = 'running'
    }
    st.ticks++

    // pose, derived last so nothing has to remember to set it
    if (st.pose !== 'stumble' && st.pose !== 'dead') {
      st.pose = onBoard()
        ? 'board'
        : st.rollTicks > 0
          ? 'roll'
          : st.onGround
            ? 'run'
            : 'air'
    }
  }

  /* ---- collision ----------------------------------------------------- */

  function resolve(xPrev: number, zPrev: number, yPrev: number, wasGrounded: boolean) {
    const flying = hasPower('updraft') !== null

    /* --- the floor --- */
    if (!flying) {
      const hx = boxHX()
      const hz = boxHZ()
      const gy = surfaceUnder(st.x, st.z, hx, hz, st.y + LEDGE_SNAP)
      st.groundY = gy
      if (st.y <= gy + 1e-6 && st.vy <= 0) {
        land(gy, yPrev)
      } else if (!st.onGround && st.vy > 0 && gy > st.y && gy - st.y <= LEDGE_SNAP) {
        // THE MANTLE. Rising, feet within half a unit of the lip: you are on the
        // roof. This is what turns a 5-tick mount window into an 8-tick one and
        // what stops riding a carriage reading as luck.
        land(gy, yPrev)
      } else if (st.onGround && gy < st.y - 1e-6) {
        // walked off the edge. The coyote is armed HERE and only here, and only
        // falling, which is why it can never become a second jump.
        st.onGround = false
        st.coyoteTicks = COYOTE_TICKS
        coyoteArmed = true
        st.vy = 0
      } else if (st.onGround) {
        st.y = gy
      }
    }

    /* --- everything solid --- */
    if (st.invuln > 0 && !flying) {
      // still worth walking the list for near-misses, but nothing here can
      // touch us this tick
    }
    const ents = track.entities
    const far = st.z + lookahead()
    const hx = boxHX()
    const hz = boxHZ()
    const h = boxH()
    const xLo = Math.min(st.x, xPrev) - hx
    const xHi = Math.max(st.x, xPrev) + hx
    const zLo = Math.min(st.z, zPrev) - hz
    const zHi = st.z + hz

    for (let i = headIndex(st.z); i < ents.length; i++) {
      const e = ents[i] as TrackEntity
      if (e.z0 > far) break
      if (e.collect || e.taken || e.kind === 'bridge') continue
      if (e.z1 <= zLo || e.z0 >= zHi) continue
      if (e.x - e.hx >= xHi || e.x + e.hx <= xLo) continue
      if (e.y1 <= st.y + 1e-6 || e.y0 >= st.y + h - 1e-6) continue
      // arriving from above onto a standable roof is a mount, not a face full
      // of carriage. `yPrev` is the honest test: where the feet STARTED.
      //
      // WRONG TURN: this used to read `e.y1` for every standable entity. A
      // ramp's `y1` is the top of the wedge (2.20), so the foot of an up-ramp
      // demanded the feet already be at 1.70 to count as a mount — every ramp
      // in the game was a wall, and no roof was reachable. Go through
      // `entryTop` so the thing that stops you and the thing that holds you up
      // are reading the same surface.
      if (e.standable && yPrev >= entryTop(e, zPrev + hz) - snapOf(e)) continue

      if (flying || st.invuln > 0) continue

      /* --- classify. The table is AUTHORED, never derived from penetration
             depth: the real game does not derive it either, and a rule you can
             read off the entity is a rule the level author can trust. --- */
      const overlap = hx + e.hx - Math.abs(st.x - e.x)
      const fromFront = zPrev + hz <= e.z0 + 1e-6
      const movingAway = Math.sign(st.lateralV) === Math.sign(e.x - st.x) ? false : true

      // the handcar absorbs EXACTLY ONE crash, then detonates
      if (onBoard()) {
        const board = hasPower('handcar')
        if (board) {
          if (e.lethal) {
            for (let k = st.powers.length - 1; k >= 0; k--) {
              if ((st.powers[k] as PowerState).kind === 'handcar') st.powers.splice(k, 1)
            }
            st.handcarCooldown = HANDCAR_RECHARGE
            st.invuln = HANDCAR_INVULN
            track.reserve(st.z + 60, st.z + 60 + st.speed * (AMNESTY_HANDCAR_TICKS * TICK))
            emit({ kind: 'boardPop', x: st.x, y: st.y, z: st.z })
          }
          // lethal or not, the obstacle is gone and the speed is unchanged
          e.taken = true
          continue
        }
      }

      // one obstacle, one stumble — see `struck`. A lethal contact ends the run
      // on the tick it happens, so only the survivable outcomes need this.
      const repeat = alreadyStruck(e.id)

      // clipping the back corner of a blocker is a STUMBLE, not a death
      const nearTrailing = zPrev - hz > e.z1 - CORNER_GRACE
      if (nearTrailing && overlap < CORNER_PEN) {
        if (!repeat) {
          markStruck(e.id)
          stumble('fwd')
        }
        continue
      }
      // …and so is a lateral graze taken while already moving away from it
      if (overlap < GRAZE && movingAway) {
        if (!repeat) {
          markStruck(e.id)
          scrape()
        }
        continue
      }

      if (!e.lethal) {
        if (!repeat) {
          markStruck(e.id)
          // `st.x > e.x` is the LEFT of the frame — see `laneToX` in track.ts
          stumble(e.y0 > 0.6 ? 'fwd' : fromFront ? 'fwd' : st.x > e.x ? 'left' : 'right')
        }
        // a non-lethal blocker is run through, not stopped at — the stumble IS
        // the cost, and stopping dead would be a second, invisible one
        continue
      }

      let cause: DeathCause
      if (e.kind === 'service') cause = 'service'
      else if (e.y0 > 0.6) cause = 'ceiling'
      else if (fromFront) cause = 'headOn'
      // a POSITIVE lateral velocity is travel toward the left of the frame,
      // because lanes run backwards along X — see `laneToX` in track.ts
      else if (st.lateralV > 0) cause = 'sideLeft'
      else cause = 'sideRight'

      if (cause === 'sideLeft' || cause === 'sideRight') {
        // pin to the flank. Do NOT let the tween quietly finish inside the
        // geometry: the figure hits the side, is dragged along it, and then the
        // camera takes over. A body that ends up inside a carriage is a body
        // the player cannot make sense of.
        st.x = e.x + (st.x < e.x ? -1 : 1) * (e.hx + hx)
        st.laneTicks = 0
        st.laneFrom = xToLane(st.x)
        slamTicks = SLAM_TICKS
      }
      die(cause)
      return
    }

    void wasGrounded
  }

  function land(gy: number, yPrev: number) {
    const hard = st.vy < -18
    const wasAir = !st.onGround
    st.y = gy
    st.vy = 0
    st.onGround = true
    st.groundY = gy
    if (wasAir) {
      st.justLanded = true
      st.landedOnRoof = gy > 0.25
      emit({ kind: 'land', roof: st.landedOnRoof, hard })
    }
    // the twelve-centimetre hop of a grounded lane change. It is added to the
    // feet, so it only ever makes a hurdle easier — which is the right
    // direction for a purely cosmetic flourish to err in.
    if (st.laneTicks > 0 && st.laneSpan > 0) {
      const u = (st.laneSpan - st.laneTicks) / st.laneSpan
      st.y += MOUNT_HOP * Math.sin(Math.PI * u)
    }
    void yPrev
  }

  /* ---- collectables --------------------------------------------------- */

  function collect() {
    const ents = track.entities
    const flare = hasPower('flare') !== null
    const boots = hasPower('boots') !== null
    const reachY = boots ? 2.6 : 1.5
    const far = st.z + (flare ? FLARE_REACH : 4)

    for (let i = headIndex(st.z); i < ents.length; i++) {
      const e = ents[i] as TrackEntity
      if (e.z0 > far) break
      if (!e.collect || e.taken) continue

      if (flare && e.kind === 'mote') {
        // the pull is done in the RUNNER'S FRAME: the target is where the
        // runner is *now*, after this tick's integration, so the closing speed
        // is genuinely relative and a mote 12 u ahead at 26 u/s still arrives.
        const dx = st.x - e.x
        const dy = st.y + 1.0 - e.y0
        const dzr = st.z - e.z0
        const dist = Math.hypot(dx, dy, dzr)
        if (dist < FLARE_RADIUS + FLARE_REACH && Math.abs(dx) < FLARE_RADIUS + 3) {
          // the speed you would have after accelerating at FLARE_ACCEL over
          // this distance, capped. No per-mote velocity to store, and it
          // behaves exactly like the thing it is modelling.
          const v = Math.min(FLARE_VMAX, Math.sqrt(2 * FLARE_ACCEL * Math.max(dist, 0.01)))
          const stepLen = Math.min(dist, v * TICK)
          const k = stepLen / dist
          e.x += dx * k
          e.y0 += dy * k
          e.y1 = e.y0
          e.z0 += dzr * k
          e.z1 = e.z0
        }
      }

      if (Math.abs(e.z0 - st.z) > 1.0) continue
      if (Math.abs(e.x - st.x) > e.hx + STAND_HX) continue
      const dy = e.y0 - (st.y + 0.9)
      if (dy > reachY || dy < -reachY) continue

      e.taken = true
      if (e.kind === 'mote') {
        moteStreak++
        st.motes++
        scoreEvents += st.mult
        emit({ kind: 'mote', streak: moteStreak, x: e.x, y: e.y0, z: e.z0 })
      } else if (e.kind === 'pickup' && e.power) {
        grant(e.power)
        emit({
          kind: 'power',
          power: e.power,
          ticks: POWER_TICKS[e.power],
          x: e.x,
          y: e.y0,
          z: e.z0,
        })
      } else if (e.kind === 'crate') {
        const reward = rollCrate()
        applyCrate(reward)
        emit({ kind: 'crate', reward })
      } else if (e.kind === 'letter' && e.glyph) {
        if (!st.letters.includes(e.glyph)) st.letters.push(e.glyph)
        emit({ kind: 'letter', glyph: e.glyph })
      }
    }
  }

  function rollCrate(): string {
    let r = rng.float()
    for (const row of CRATE_TABLE) {
      if (r < row.p) return row.reward
      r -= row.p
    }
    return 'motes50'
  }

  function applyCrate(reward: string) {
    if (reward === 'motes50') st.motes += 50
    else if (reward === 'motes250') st.motes += 250
    else if (reward === 'motes1000') st.motes += 1000
    else if (reward === 'tally') grant('tally')
    else if (reward === 'handcar') st.handcars = Math.min(HANDCAR_CAP, st.handcars + 1)
  }

  /* ---- near misses ---------------------------------------------------- */

  /**
   * Our carriages are stalled, so a near-miss is a line you *choose* — which is
   * exactly why ours pays and the real game's does not. Held for two ticks, so
   * a lane change that merely passes through the gap does not count; you have
   * to run the line.
   */
  function nearMissPass() {
    if (st.speed <= NEAR_SPEED) return
    const ents = track.entities
    const hx = boxHX()
    const hz = boxHZ()
    for (let s = 0; s < nearIds.length; s++) {
      if (nearIds[s] === 0) continue
      let stillThere = false
      for (let i = headIndex(st.z); i < ents.length; i++) {
        const e = ents[i] as TrackEntity
        if (e.z0 > st.z + 8) break
        if (e.id !== nearIds[s]) continue
        stillThere = e.z1 > st.z - hz && e.z0 < st.z + hz
        break
      }
      if (!stillThere) {
        nearIds[s] = 0
        nearHold[s] = 0
      }
    }

    for (let i = headIndex(st.z); i < ents.length; i++) {
      const e = ents[i] as TrackEntity
      if (e.z0 > st.z + hz) break
      if (e.collect || e.taken || !e.lethal) continue
      if (e.z1 <= st.z - hz) continue
      const gap = Math.abs(st.x - e.x) - (hx + e.hx)
      if (gap <= 0 || gap > NEAR_GAP) continue

      let already = false
      for (let k = 0; k < awarded.length; k++) if (awarded[k] === e.id) already = true
      if (already) continue

      let slot = -1
      for (let s = 0; s < nearIds.length; s++) {
        if (nearIds[s] === e.id) {
          slot = s
          break
        }
      }
      if (slot < 0) {
        for (let s = 0; s < nearIds.length; s++) {
          if (nearIds[s] === 0) {
            slot = s
            nearIds[s] = e.id
            nearHold[s] = 0
            break
          }
        }
      }
      if (slot < 0) continue
      nearHold[slot] = (nearHold[slot] as number) + 1
      if ((nearHold[slot] as number) < NEAR_TICKS) continue

      awarded[awardedAt] = e.id
      awardedAt = (awardedAt + 1) % awarded.length
      nearIds[slot] = 0
      nearHold[slot] = 0
      st.chain++
      st.chainTicks = NEAR_CHAIN_TICKS
      st.nearMisses++
      st.nearMiss = 1
      const points = NEAR_POINTS * st.chain * st.mult
      scoreEvents += points
      emit({ kind: 'near', side: st.x < e.x ? -1 : 1, chain: st.chain, points })
    }
  }

  /* ---- the night service ---------------------------------------------- */

  /**
   * The one threat that comes from behind, and the only entity on the track
   * that moves. §E.8 buys its fairness with four cues beginning at least 1.9 s
   * before contact, three of them forward-facing; this is where the sim says
   * *now* to all four. The klaxon, the headlight, the rail pulse and the HUD
   * chevron are somebody else's file — they all hang off `serviceWarn`.
   */
  function servicePass() {
    const ents = track.entities
    // it is behind us, so the head index is no use — walk back from it a little
    const start = Math.max(0, headIndex(st.z) - 24)
    for (let i = start; i < ents.length; i++) {
      const e = ents[i] as TrackEntity
      if (e.z0 > st.z + 40) break
      if (e.kind !== 'service' || !e.speed) continue
      const closing = e.speed - st.speed
      let slot = -1
      for (let s = 0; s < svcIds.length; s++) if (svcIds[s] === e.id) slot = s
      if (e.z1 < st.z && closing > 0.01) {
        const ttc = (st.z - e.z1) / closing
        if (ttc > 0 && ttc <= 2.6 && slot < 0) {
          for (let s = 0; s < svcIds.length; s++) {
            if (svcIds[s] !== 0) continue
            svcIds[s] = e.id
            emit({ kind: 'serviceWarn', lane: e.lane, ttc })
            break
          }
        }
      } else if (e.z0 > st.z + 1 && slot >= 0) {
        svcIds[slot] = 0
        emit({ kind: 'servicePass', side: e.x < st.x ? -1 : 1 })
      }
    }
  }

  /* ---- the public face ------------------------------------------------ */

  function deployHandcar(): boolean {
    if (st.phase !== 'running' && st.phase !== 'intro') return false
    if (st.handcars <= 0 || st.handcarCooldown > 0 || onBoard()) return false
    st.handcars--
    grant('handcar')
    return true
  }

  function revive(): boolean {
    if (st.phase !== 'dying' && st.phase !== 'over') return false
    const cost = REVIVE_COST[Math.min(st.revivesUsed, REVIVE_COST.length - 1)] as number
    if (st.motes < cost) return false
    st.motes -= cost
    st.revivesUsed++
    st.phase = 'reviving'
    st.pose = 'run'
    st.cause = null
    st.deadTicks = 0
    st.z = Math.max(0, st.z - REVIVE_BACK_U)
    st.x = 0
    st.lane = 0
    st.laneFrom = 0
    st.laneTicks = 0
    st.laneSpan = 0
    st.lateralV = 0
    st.y = 0
    st.vy = 0
    st.onGround = true
    st.groundY = 0
    st.rollTicks = 0
    st.low = false
    st.heat = 0
    st.stumbleTicks = 0
    st.speed = st.targetSpeed = speedAt(st.z)
    // "the lane cleared for 60 u" is bought as invulnerability rather than by
    // rewriting the track: committed geometry is immutable, and a revive that
    // deleted the carriage in front of you would be the one place in the game
    // where the world changes while you are looking at it.
    const clearTicks = Math.ceil(REVIVE_CLEAR_U / Math.max(st.speed, 1) / TICK)
    st.invuln = Math.max(REVIVE_INVULN, clearTicks, AMNESTY_REVIVE_TICKS)
    src.clear()
    return true
  }

  function restart(seed: number, multBase: number, handcars: number, headstart: number): void {
    track.reset(seed)
    rng = createRng(seed)
    st.phase = 'intro'
    st.pose = 'run'
    st.z = headstart
    st.x = 0
    st.y = 0
    st.lane = 0
    st.laneFrom = 0
    st.laneTicks = 0
    st.laneSpan = 0
    st.lateralV = 0
    st.vy = 0
    st.onGround = true
    st.groundY = 0
    st.coyoteTicks = 0
    st.justLanded = false
    st.landedOnRoof = false
    st.diveRoll = false
    st.rollTicks = 0
    st.low = false
    st.targetSpeed = st.speed = speedAt(headstart)
    st.gear = false
    st.heat = 0
    st.guardGap = GUARD_FAR
    st.stumbleTicks = 0
    st.score = 0
    st.motes = 0
    st.mult = multBase
    st.multBase = multBase
    st.unbroken = 0
    st.nearMisses = 0
    st.chain = 0
    st.chainTicks = 0
    st.nearMiss = 0
    st.powers.length = 0
    st.handcars = handcars
    st.handcarCooldown = 0
    st.invuln = 0
    st.cause = null
    st.deadTicks = 0
    st.revivesUsed = 0
    st.ticks = 0
    st.letters.length = 0
    scoreDist = 0
    scoreEvents = 0
    introTicks = INTRO_TICKS_RETRY
    slamTicks = 0
    moteStreak = 0
    handcarMoteMark = HANDCAR_PER_MOTES
    handcarDistMark = HANDCAR_PER_UNITS + headstart
    lastGear = Math.floor(st.speed)
    scrapeRecovering = false
    nearIds.fill(0)
    nearHold.fill(0)
    awarded.fill(0)
    awardedAt = 0
    struck.fill(0)
    struckAt = 0
    svcIds.fill(0)
    updraftBaseY = 0
    prev.z = st.z
    prev.x = 0
    prev.y = 0
    prev.guardGap = GUARD_FAR
    src.clear()
  }

  return { state: st, prev, step, deployHandcar, revive, restart }
}

/**
 * Trainyard Run — the game object.
 *
 * The runner, mounted. It borrows the renderer from the field exactly as the
 * parkour does — a second WebGL context is the most expensive thing you can
 * ask a browser for — owns its own scene, and while `active` is true main.ts
 * hands it the frame and simply stops drawing the field.
 *
 * THE TICK IS THE POINT, AGAIN. 20 Hz accumulator, hard cap on catch-up,
 * render interpolates between the last two tick states on `k = acc / TICK`.
 * Same discipline as parkour.ts and for the same reason: a jump has to measure
 * 2.5725 units on a 144 Hz monitor and on a throttled phone alike. Two
 * minigames on two tick rates would be two physics to reason about, and one of
 * them would be wrong.
 *
 * WHAT THIS FILE OWNS, AND ONLY THIS FILE: the accumulator, the timescale, the
 * run lifecycle, the death sequence's beats, the revive, the retry, and the
 * wiring between sim ↔ track ↔ scene ↔ runner ↔ hud ↔ input. Every one of
 * those six knows about at most one other; this is the only place that knows
 * about all of them. It decides nothing about physics (sim.ts), nothing about
 * geometry (track.ts) and nothing about how any of it looks (scene/runner/hud).
 *
 * ---------------------------------------------------------------------------
 * WRONG TURNS. Written down because every one of them is a whole afternoon.
 *
 * 1. SLOW MOTION MULTIPLIES THE ACCUMULATOR, NEVER `TICK`.
 *    `TICK *= 4` during the death slow-mo gives you a *different game* for a
 *    second — different gravity per tick, different lane spans, different
 *    everything — and the sim's constants stop meaning what the tables say.
 *    Multiplying `dt` on the render side instead gives you a slideshow: the
 *    camera and the particles slow down with the sim and the whole beat reads
 *    as a dropped frame. `acc += dt * timescale` is the only version where the
 *    physics is untouched and the frame rate is untouched.
 *
 * 2. TICK TIME IS ANCHORED TO THE WALL CLOCK, NOT COUNTED UP FROM THE START.
 *    `tickMs += 50` per tick looks right and is a time bomb. Every pause, every
 *    dropped catch-up, every hidden tab leaves sim time permanently behind
 *    `performance.now()` — and input.ts stamps its events with the real clock
 *    and refuses anything "from the future". Ten seconds in a background tab
 *    and every swipe for the rest of the session is silently discarded. So the
 *    instant a tick represents is derived from the frame's own clock:
 *    `nowMs - acc * 1000` after the tick is consumed. Drops resync instead of
 *    accumulating, which is exactly the behaviour you want from a drop.
 *
 * 3. NEVER SIMULATE A HUNDRED TICKS ON RETURN. A backgrounded tab hands you
 *    thirty seconds of `dt` in one frame. `MAX_CATCHUP` ticks, then the rest of
 *    the accumulator is thrown away — and on top of that the game *pauses* on
 *    blur and visibilitychange, so the usual case never reaches the cap at all.
 *
 * 4. THE RUN IS NOT BANKED UNTIL IT IS ACTUALLY OVER. A revive continues the
 *    same run. Recording on the death tick and then reviving banks the motes
 *    twice and pollutes `best` with a score the player went on to beat. So the
 *    panel is drawn from *provisional* numbers and `recordRun()` fires exactly
 *    once, when the revive window closes or the player asks for another run.
 *    The revive itself is priced against the *stored* bank, which is what makes
 *    "offered only if the bank can pay" a sentence with one meaning.
 *
 * 5. THE WORLD IS BUILT ONCE. `enter` on a cold start builds the scene, the
 *    runner, the track pool and the sim; every retry after that is
 *    `reset`/`restart` on the same allocations. Death → running again has to be
 *    under two seconds, and it is the emotional peak of the whole genre: every
 *    200 ms you add there lets reflection in, and reflection is where people
 *    close the tab.
 */

import type * as THREE from 'three'
import { clamp, reducedMotion } from '../core/contract'
import { seedFromTime } from './rng'
import { createTrack, type Track } from './track'
import {
  createSim,
  MAX_CATCHUP,
  TICK,
  type DeathCause,
  type Sim,
  type SimEvent,
  type SimState,
} from './sim'
import { createSurfScene, type SimSnapshot, type SurfScene } from './scene'
import { createRunner, type Runner } from './runner'
import { createSurfInput, type SurfInput } from './input'
import { createSurfHud, type PowerRing, type RunSummary } from './hud'
import { MISSIONS, loadSurf, recordRun, spend, type SurfProgress } from './progress'

/** Structurally a `Minigame` (see the contract). The extra field is what the
    field's HUD may show without importing this module. */
export interface Surf {
  readonly active: boolean
  readonly best: number
  enter(level?: number): void
  leave(): void
  update(dt: number): void
  render(renderer: THREE.WebGLRenderer): void
  resize(w: number, h: number): void
  onLeave(cb: () => void): void
  dispose(): void
}

/* ------------------------------------------------------------------ *
 * §D.10 — death, retry, revive. This file is the OWNER of these.
 *
 * Seconds from the fatal contact, in order. They are exported because the
 * checker asserts the panel arrives inside 1.2 s and the retry inside 2.0 s,
 * and a test that hard-codes its own copy of a timeline is a test that passes
 * after somebody changes the timeline.
 * ------------------------------------------------------------------ */

/** sim frozen, render live. The lantern blooms; there is no white flash,
 *  because there is no white in this palette. */
export const HITSTOP_AT = 0.09
/** …then the world resumes at full speed and slows to a quarter over 200 ms */
export const SLOW_AT = 0.29
/** …holds there while the figure tumbles… */
export const SLOW_HOLD_AT = 0.79
/** …and stops. */
export const STOP_AT = 1.05
/** the panel fades in on the same beat the world stops */
export const PANEL_AT = 1.05
/** how slow the slow gets. Below a quarter it reads as a hang, not a beat. */
export const SLOW_MIN = 0.25
/**
 * Reduced motion gets an 8-tick hold and a cut to the panel — no ramp, no
 * camera drop, no tumble in slow motion. §D.12: not one *timing* constant of
 * the game changes, and this is not one of them; it is the cinematography.
 */
export const REDUCED_HOLD = 0.4
/** the depleting ring on the revive button */
export const REVIVE_WINDOW = 4.0
/** first, second, third revive within a run. There is no fourth. */
export const REVIVE_COSTS: readonly number[] = [250, 500, 1000]

/**
 * The running start: 400 units already run, at the speed the ramp says.
 * Plumbed all the way through (`sim.restart` takes it) and currently always
 * zero — see the note at `startRun`.
 */
export const HEADSTART_UNITS = 400

/** How far to move toward a target this frame, at `rate` per second. The
 *  actual solution to the equation `min(1, dt*rate)` approximates, and the
 *  only form that is identical at 30 fps and at 144. */
const approach = (dt: number, rate: number) => 1 - Math.exp(-rate * dt)

/** the sentence the panel says. The player's question after a death is always
 *  *which way did I get it wrong*, and the cause is the only answer. */
const CAUSE_TEXT: Readonly<Record<DeathCause, string>> = {
  headOn: 'Straight into the buffers.',
  sideLeft: 'Into the flank, going left.',
  sideRight: 'Into the flank, going right.',
  ceiling: 'Still standing under the gantry.',
  service: 'The night service had the lane.',
  caught: 'Two slips too close together — the yard guard has you.',
}

/** which way the figure falls. A tumble that ignores the direction of the hit
 *  reads as a ragdoll; one that respects it reads as *you*. */
const CAUSE_DIR: Readonly<Record<DeathCause, -1 | 0 | 1>> = {
  headOn: 0,
  sideLeft: -1,
  sideRight: 1,
  ceiling: 0,
  service: 0,
  caught: 0,
}

/** the ring labels. Short enough for 44 px, and they are this world's words,
 *  not the genre's — a magnet is a flare and a hoverboard is a handcar. */
const POWER_LABEL: Readonly<Record<string, string>> = {
  flare: 'Flare',
  tally: 'Tally',
  boots: 'Boots',
  updraft: 'Updraft',
  handcar: 'Handcar',
}

export function createSurf(canvas: HTMLCanvasElement): Surf {
  const hud = createSurfHud()
  /* Bound to the CANVAS, not to `#sf`. The chrome layer is
     `pointer-events: none` so the game shows through it, which means a
     listener bound there receives precisely nothing — every touch goes to the
     canvas underneath. That bug shipped the parkour's phone build with a dead
     thumbstick and survived a suite that only checked the buttons were big
     enough. `root` is passed too, but only so the recogniser can tell a
     pointerdown on chrome from one on the game. */
  const input: SurfInput = createSurfInput(document.getElementById('sf'), canvas)

  /* Built on the first `enter`, then kept for the session. Building the
     instanced pools costs real GPU memory and most visitors never come out
     here; rebuilding them per run costs the retry budget, which is the one
     number in §D.10 that the whole feel of the genre hangs off. Lazy once,
     never again. */
  let scene: SurfScene | null = null
  let runner: Runner | null = null
  let track: Track | null = null
  let sim: Sim | null = null

  let progress: SurfProgress = loadSurf()
  let active = false
  let paused = false

  /** the 20 Hz accumulator, in seconds, and the frame's interpolation factor */
  let acc = 0
  /** what the world's clock is multiplied by before it reaches the accumulator */
  let timescale = 1
  /** seconds since the fatal contact. Real time, not sim time — the death
   *  sequence is cinematography and must not slow down with the thing it is
   *  slowing down. */
  let deathT = 0
  let cause: DeathCause | null = null
  /** raised inside `onEvent`, acted on after the tick loop. Restarting a sim
   *  from inside its own callback is how you get a half-stepped tick. */
  let deathFired = false
  /** the panel and the revive have been put up for this death */
  let panelUp = false
  let reviveOffer = 0
  /** `recordRun` has fired for this run. Exactly once, ever — see wrong turn 4. */
  let recorded = false
  /** …and what it said about the score, so the panel does not have to guess */
  let wasBest = false

  /** the black veil, eased. 1 on entry so the field does not flash past. */
  let fade = 1
  let fadeTo = 0
  /** what the HUD was last told about the thumb buttons */
  let touchShown = false
  /**
   * The last size main.ts told us about.
   *
   * It is REMEMBERED rather than asked for, because `resize` arrives from the
   * moment the page loads and the scene is not built until somebody walks out
   * to the sign. Without this the first frame of the first run is drawn at a
   * 1:1 aspect until the next window resize — which on a phone, where nothing
   * ever resizes, is the whole session.
   */
  let lastW = 1
  let lastH = 1

  /** the night service's lane, and when the warning goes stale */
  let serviceLane: -1 | 0 | 1 | null = null
  let serviceUntil = 0

  /** run totals the sim does not keep, because they are the *record's*
   *  business and not the simulation's */
  let jumps = 0
  let roofUnits = 0
  let stumbled = false
  let lastZ = 0

  const leaveCbs: Array<() => void> = []

  /* The snapshot handed to the scene every frame. ONE object, written in place
     and read once — a fresh one per frame is sixty allocations a second for
     nothing, and the GC pause it eventually buys lands during a run.
     `state` is filled in by `build()`; it is declared here so the shape is
     visible next to everything else the frame touches. */
  const snap = {
    x: 0,
    y: 0,
    z: 0,
    guardGap: 0,
    k: 0,
    state: null as unknown as SimState,
  } satisfies SimSnapshot
  const rings: PowerRing[] = []

  /* ---------------- events out of the simulation ---------------- */

  function onEvent(e: SimEvent): void {
    switch (e.kind) {
      case 'jump':
        jumps++
        break
      case 'near':
        hud.near(e.chain, e.points)
        break
      case 'stumble':
        stumbled = true
        break
      case 'crate':
        hud.toast(e.reward, 1600)
        break
      case 'letter':
        hud.toast(`${e.glyph} — a letter for the word`, 1800)
        break
      case 'power':
        hud.toast(POWER_LABEL[e.power] ?? e.power, 1200)
        break
      case 'boardOn':
        hud.toast('Handcar', 1200)
        break
      case 'serviceWarn':
        serviceLane = e.lane
        /* the chevron outlives the warning by half a second: a lane strip that
           blinks off the instant the rake arrives is a lane strip that was
           never there when you looked. */
        serviceUntil = e.ttc + 0.5
        break
      case 'servicePass':
        serviceLane = null
        serviceUntil = 0
        break
      case 'death':
        /* Do not touch the sim from in here. The tick that raised this event
           has not finished; the loop below reads the flag and stops. */
        deathFired = true
        cause = e.cause
        break
      default:
        /* mote, roll, dive, lane, gear, mult, boardPop — the scene reads those
           off `SimState` and the figure animates them. Nothing to do here. */
        break
    }
  }

  /* ---------------- the run lifecycle ---------------- */

  function build(): void {
    if (scene && runner && track && sim) return
    scene = createSurfScene()
    runner = createRunner()
    scene.add(runner.object)
    /* Seeded with 1 and immediately re-seeded by `startRun`. The constructor
       exists to allocate; `reset`/`restart` exist to be free. */
    track = createTrack({ seed: 1 })
    sim = createSim({ seed: 1, input, track, onEvent })
    snap.state = sim.state
    scene.resize(lastW, lastH)
  }

  /**
   * Start a run. Allocates nothing after the first one.
   *
   * `headstart` is 0 and stays 0 until there is somewhere to buy it: §C.8's
   * HUD has no affordance for the running start and inventing one here would
   * be redesigning another agent's file. The argument is plumbed end to end so
   * that adding the button is one line, not a refactor.
   */
  function startRun(): void {
    if (!scene || !runner || !track || !sim) return
    const seed = seedFromTime()
    progress = loadSurf()

    /* The track first, so the sim restarts against an empty world rather than
       the corpse of the last run. `reset` is idempotent for a given seed, so
       it costs nothing if `sim.restart` also asks for it. */
    track.reset(seed)
    sim.restart(seed, 1 + progress.sets, progress.handcars, 0)
    scene.reset()
    runner.reset()

    /* Re-sync the instance slots by hand exactly once, here. The per-frame
       drains below are a delta and a delta against a world that was just wiped
       is meaningless — `scene.reset()` has already freed every slot, so the
       drains are thrown away and whatever the track is holding is committed
       fresh. */
    track.drainReleased()
    track.drainCommitted()
    if (track.entities.length) scene.commit(track.entities)

    acc = 0
    timescale = 1
    deathT = 0
    deathFired = false
    cause = null
    panelUp = false
    reviveOffer = 0
    recorded = false
    wasBest = false
    serviceLane = null
    serviceUntil = 0
    jumps = 0
    roofUnits = 0
    stumbled = false
    lastZ = sim.state.z
    paused = false

    input.clear()
    input.setEnabled(true)
    hud.panel(null)
    hud.toast(null)
    hud.setBest(progress.best)

    /* The card is for somebody who has never done this. §F is explicit that
       tutorial text after the first run is deliberately absent — the genre's
       whole pitch is that you are running within a second of arriving, and a
       card you have already read is a second you did not need to spend. */
    if (progress.runs === 0) {
      hud.card(
        'The trainyard',
        'Trainyard Run',
        'Swipe or arrow left and right for the lanes, up to jump, down to roll.',
      )
    }
    /* No `else`. §C.8 gives the card no dismiss — it takes itself down on a
       timer, the way the parkour's does — so the way to not show a card is to
       not ask for one. */
  }

  /**
   * Bank the run. Idempotent, and it is the only call to `recordRun` there is.
   *
   * Called when the revive window closes, when the player asks for another
   * run, and when they leave — whichever comes first. Not on the death tick:
   * see wrong turn 4 in the header.
   */
  function finalise(): SurfProgress {
    if (recorded || !sim) return progress
    /* A run you did not have is not a run. Entering and immediately leaving
       must not bump `runs` — that counter is what decides whether somebody has
       seen the card, and burning it on a mis-click means the one player who
       needed the instructions never gets them. A death always carries real
       distance with it, so it is never caught by this. */
    if (sim.state.z < 1 && !deathFired) return progress
    recorded = true
    const s = sim.state
    const out = recordRun({
      score: Math.floor(s.score),
      distance: Math.floor(s.z),
      motes: s.motes,
      nearMisses: s.nearMisses,
      jumps,
      roofUnits: Math.floor(roofUnits),
      stumbled,
      letters: s.letters,
    })
    progress = out.progress
    wasBest = out.newBest
    hud.setBest(progress.best)
    return progress
  }

  /** the cost of the next revive, or null if there is not one to be had */
  function reviveCost(): number | null {
    if (!sim) return null
    const i = sim.state.revivesUsed
    if (i < 0 || i >= REVIVE_COSTS.length) return null
    const cost = REVIVE_COSTS[i]
    if (cost === undefined) return null
    /* Priced against the *stored* bank, never against this run's motes. Those
       are not banked yet (wrong turn 4) and pretending otherwise makes "the
       bank can pay" a sentence with two meanings. */
    return loadSurf().bank >= cost ? cost : null
  }

  /**
   * The panel, from whatever numbers are true right now.
   *
   * Before `finalise` it is *provisional*: the score is compared against the
   * stored best and the motes are shown as what the bank will say once the run
   * is in. After it, the record itself is the source and `wasBest` is the
   * answer `recordRun` already gave — recomputing it against a `best` that has
   * since been raised by this very run always says no.
   */
  function summary(offer: number | null): RunSummary {
    if (!sim) throw new Error('no run')
    const s = sim.state
    const score = Math.floor(s.score)
    const p = recorded ? progress : loadSurf()
    return {
      score,
      best: recorded ? p.best : Math.max(p.best, score),
      newBest: recorded ? wasBest : score > p.best && score > 0,
      distance: Math.floor(s.z),
      motes: s.motes,
      bank: recorded ? p.bank : p.bank + s.motes,
      mult: s.mult,
      nearMisses: s.nearMisses,
      cause: cause ? CAUSE_TEXT[cause] : 'Run over.',
      missions: p.missions.map((m) => {
        const def = MISSIONS.find((d) => d.id === m.id)
        return { text: def ? def.text : m.id, at: m.at, of: def ? def.of : 1 }
      }),
      revive: offer === null ? null : { cost: offer },
    }
  }

  function showPanel(): void {
    if (!sim) return
    panelUp = true
    const offer = reviveCost()
    reviveOffer = offer === null ? 0 : REVIVE_WINDOW
    /* With no revive on the table the run is over the moment the panel lands,
       so bank it now and let the panel show the real numbers — the missions
       row in particular, which is the only place mission progress is ever
       shown. */
    if (offer === null) finalise()
    hud.panel(summary(offer))
    hud.setReviveRing(offer === null ? 0 : 1)
    /* Input stays ENABLED on the panel, deliberately. R is another run and
       Escape leaves, and §F makes the whole path — field, landmark, game,
       death, retry, leave — a build break if it cannot be walked with no
       pointing device at all. Anything queued on the way is dropped by the
       `input.clear()` in `startRun`. */
  }

  function doRevive(): void {
    if (!sim || !runner || !panelUp || reviveOffer <= 0) return
    const cost = reviveCost()
    if (cost === null) {
      hud.toast('Not enough banked motes', 1400)
      return
    }
    /* Revive FIRST, then charge. The other order takes the money and then
       finds out the phase was wrong, and a game that charges you for nothing
       is a game you do not open again. */
    if (!sim.revive()) return
    /* The return is deliberately ignored. `reviveCost` has already proved the
       bank can pay; if storage has gone sideways underneath us between those
       two lines the run still continues and the motes stay put. In the
       player's favour, always — the alternative is standing them back up and
       then taking it away again. */
    spend(cost)
    progress = loadSurf()
    panelUp = false
    reviveOffer = 0
    deathT = 0
    deathFired = false
    cause = null
    timescale = 1
    acc = 0
    runner.reset()
    hud.panel(null)
    hud.setReviveRing(0)
    hud.toast('Back on your feet', 1400)
    input.clear()
    input.setEnabled(true)
  }

  /** another run, right now. This is the path that has to be under 400 ms. */
  function retry(): void {
    if (!active) return
    finalise()
    hud.setReviveRing(0)
    startRun()
  }

  /* ---------------- pause ---------------- */

  /**
   * Pausing is not a feature here, it is a safety rail. A hidden tab hands the
   * next frame thirty seconds of `dt`; the cap in the tick loop would eat five
   * ticks of that and throw the rest away, which is survivable but means the
   * game ran on without you for a quarter of a second. Stopping the clock
   * outright and dropping the accumulator on resume is the honest version.
   */
  function setPaused(on: boolean): void {
    if (!active || paused === on) return
    paused = on
    if (on) {
      acc = 0
      input.setEnabled(false)
      input.clear()
      if (!panelUp) hud.toast('Paused — press anything to run on', 60_000)
      window.addEventListener('keydown', wake, true)
      window.addEventListener('pointerdown', wake, true)
    } else {
      window.removeEventListener('keydown', wake, true)
      window.removeEventListener('pointerdown', wake, true)
      acc = 0
      hud.toast(null)
      /* A swipe issued 180 ms before you alt-tabbed must not fire when you come
         back — the buffer is cleared on the way in *and* on the way out. */
      input.clear()
      input.setEnabled(true)
    }
  }

  /* The "press anything" gate. It lives here rather than in input.ts because
     it is the pause, not an action: input is disabled while paused precisely
     so that the press which wakes the game is not also a jump. */
  function wake(): void {
    setPaused(false)
  }

  function onHidden(): void {
    if (document.hidden) setPaused(true)
  }

  /* ---------------- the frame ---------------- */

  /**
   * The timescale at `t` seconds after the fatal contact. §D.10, in one place.
   *
   * It is fed to the ACCUMULATOR (`acc += dt * timescale`) and nowhere else.
   * `TICK` never changes and `dt` never changes — see wrong turn 1.
   */
  function deathScale(t: number): number {
    if (reducedMotion()) return 0
    if (t < HITSTOP_AT) return 0
    if (t < SLOW_AT) return 1 - (1 - SLOW_MIN) * ((t - HITSTOP_AT) / (SLOW_AT - HITSTOP_AT))
    if (t < SLOW_HOLD_AT) return SLOW_MIN
    if (t < STOP_AT) return SLOW_MIN * (1 - (t - SLOW_HOLD_AT) / (STOP_AT - SLOW_HOLD_AT))
    return 0
  }

  function update(dt: number): void {
    if (!active || !scene || !runner || !track || !sim) return
    const state = sim.state
    const nowMs = performance.now()

    fade += (fadeTo - fade) * approach(dt, 6)
    hud.fade(fade)

    /* The pad is polled once per FRAME, never per tick: a stick read inside
       the tick loop is read five times on a catch-up frame and zero times on a
       fast one, which is a different game on every machine. */
    input.pollPad(nowMs)

    /* --- the death clock, which is real time and does not slow down --- */
    if (deathFired) {
      deathT += dt
      timescale = deathScale(deathT)
      scene.death(deathT, cause ?? 'headOn')
      const at = reducedMotion() ? REDUCED_HOLD : PANEL_AT
      if (!panelUp && deathT >= at) showPanel()
      if (panelUp && reviveOffer > 0) {
        reviveOffer -= dt
        hud.setReviveRing(clamp(reviveOffer / REVIVE_WINDOW))
        if (reviveOffer <= 0) {
          /* The window closed. Now — and only now — the run is over, so bank
             it and redraw the panel with the numbers that will still be true
             tomorrow. */
          hud.setReviveRing(0)
          finalise()
          hud.panel(summary(null))
        }
      }
    } else {
      timescale = 1
    }

    /* --- the simulation, at exactly 20 Hz whatever the frame rate is --- */
    if (!paused && timescale > 0) {
      acc += dt * timescale
      let n = 0
      while (acc >= TICK && n < MAX_CATCHUP) {
        acc -= TICK
        n++
        /* The instant this tick REPRESENTS, derived from the frame's own
           clock. See wrong turn 2: counting up from the start of the run puts
           sim time permanently behind the input timestamps and silently kills
           every swipe. */
        sim.step(nowMs - acc * 1000)
        /* Roof units are measured, not reported: `land` says you arrived, the
           distance run while standing on something says you rode it. */
        if (state.groundY > 0.5 && state.onGround) roofUnits += Math.max(0, state.z - lastZ)
        lastZ = state.z
        if (deathFired) break
      }
      /* A backgrounded tab must not simulate a hundred ticks the moment it
         comes back. Beyond the cap the time is dropped, not banked. */
      if (acc >= TICK) acc = 0
    }

    /* --- the frame, drawn between two ticks --- */
    const k = clamp(acc / TICK)
    snap.k = k
    snap.x = sim.prev.x + (state.x - sim.prev.x) * k
    snap.y = sim.prev.y + (state.y - sim.prev.y) * k
    snap.z = sim.prev.z + (state.z - sim.prev.z) * k
    snap.guardGap = sim.prev.guardGap + (state.guardGap - sim.prev.guardGap) * k

    /* Released before committed. A slot has to be free before it can be
       claimed, and the other order is an entity drawn at the last one's
       matrix for exactly one frame — which is a carriage flickering at the
       edge of vision, the single most reported artefact in this kind of
       renderer. */
    const gone = track.drainReleased()
    if (gone.length) scene.release(gone)
    const fresh = track.drainCommitted()
    if (fresh.length) scene.commit(fresh)

    /* The lean is fed from the input event, not from the lane tween, so the
       figure acknowledges a swipe within one frame even though the
       authoritative lane position steps at 20 Hz. It is cosmetic and the
       simulation never reads it. */
    runner.update(dt, snap.x, snap.y, snap.z, state, input.lean)
    if (deathFired) runner.die(deathT, cause ? CAUSE_DIR[cause] : 0)

    /* THE ONE WIRE BETWEEN THE FIGURE AND THE LIGHT. runner.ts writes where
       the lantern is; scene.ts puts the point light there. Neither imports the
       other — they are siblings — so the copy happens here, after the figure
       has posed and before the scene draws. A frame in the other order is a
       lantern lighting the pose it had last frame, which at 26 u/s is half a
       metre behind the hand holding it. */
    scene.lanternAt.copy(runner.lanternAt)
    scene.update(dt, snap)

    /* …and only now are the one-frame flags cleared, because the scene is the
       thing that reads them. Clearing before `scene.update` loses the FOV kick
       and the mote burst on exactly the frames they were raised for. */
    state.gear = false
    state.nearMiss = 0

    /* --- the chrome --- */
    hud.setScore(Math.floor(state.score))
    hud.setMult(state.mult)
    hud.setMotes(state.motes)
    hud.setDistance(state.z)
    hud.setHeat(state.heat)
    hud.setHandcars(state.handcars, state.handcarCooldown === 0 && state.handcars > 0)

    if (serviceLane !== null) {
      serviceUntil -= dt
      if (serviceUntil <= 0) serviceLane = null
    }
    hud.setService(serviceLane)

    /* `touch` is not a boot-time answer: a laptop with a touchscreen decides
       what it is on the first contact, and half the visitors are on a phone
       that has never sent a mouse event. Watched, not sampled once. */
    if (input.touch !== touchShown) {
      touchShown = input.touch
      hud.setTouch(touchShown)
    }

    rings.length = 0
    for (const p of state.powers) {
      if (p.ticks <= 0 || p.total <= 0) continue
      rings.push({
        kind: p.kind,
        at: clamp(p.ticks / p.total),
        label: POWER_LABEL[p.kind] ?? p.kind,
      })
    }
    hud.setRings(rings)
  }

  /* ---------------- entering and leaving ---------------- */

  function enter(level?: number): void {
    /* `level` exists so the signature matches `Minigame` exactly. There is one
       trainyard and it is endless. */
    void level
    if (active) return
    active = true
    build()
    progress = loadSurf()
    fade = 1
    fadeTo = 0
    hud.show()
    touchShown = input.touch
    hud.setTouch(touchShown)
    hud.fade(1)
    document.addEventListener('visibilitychange', onHidden)
    startRun()
  }

  function leave(): void {
    if (!active) return
    /* Whatever was on the board goes in the book. Leaving mid-run banks the
       run: the alternative is a player who ran 3000 units, pressed Leave and
       lost all of it, which is the meanest thing a game can do quietly. */
    finalise()
    active = false
    paused = false
    window.removeEventListener('keydown', wake, true)
    window.removeEventListener('pointerdown', wake, true)
    document.removeEventListener('visibilitychange', onHidden)
    input.setEnabled(false)
    input.clear()
    hud.panel(null)
    hud.toast(null)
    hud.hide()
    /* The scene is NOT disposed. It is rebuilt on nobody's frame budget and
       coming back out to the trainyard has to be as cheap as the retry is.
       `dispose()` below is the only thing that frees it. */
    fade = 1
    for (const cb of leaveCbs.slice()) cb()
  }

  /* ---------------- wiring ---------------- */

  input.onPause(() => setPaused(!paused))
  input.onRestart(() => retry())
  input.onLeave(() => leave())
  input.onDeploy(() => {
    if (!active || !sim || panelUp || paused) return
    if (sim.deployHandcar()) return
    hud.toast(sim.state.handcars > 0 ? 'The handcar is still charging' : 'No handcar banked', 1200)
  })

  hud.onAgain(() => retry())
  hud.onRevive(() => doRevive())
  hud.onLeave(() => leave())
  hud.onPause(() => setPaused(!paused))

  return {
    get active() {
      return active
    },
    get best() {
      return progress.best
    },
    enter,
    leave,
    update,
    render(renderer) {
      if (scene) renderer.render(scene.scene, scene.camera)
    },
    /* The scene owns the camera and the horizontal-FOV conversion that goes
       with the aspect — locking a vertical FOV is how you ship a runner that
       is unplayable on the device most people open it on. `renderer.setSize`
       belongs to main.ts and is never called from in here. */
    resize(w, h) {
      lastW = Math.max(1, w)
      lastH = Math.max(1, h)
      scene?.resize(lastW, lastH)
    },
    onLeave(cb) {
      leaveCbs.push(cb)
    },
    dispose() {
      window.removeEventListener('keydown', wake, true)
      window.removeEventListener('pointerdown', wake, true)
      document.removeEventListener('visibilitychange', onHidden)
      input.dispose()
      hud.dispose()
      runner?.dispose()
      scene?.dispose()
      scene = null
      runner = null
      track = null
      sim = null
    },
  }
}

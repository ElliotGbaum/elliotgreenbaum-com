/**
 * The runner's controls — four intents, two channels, one queue.
 *
 * A runner has no held input. You do not "hold left" in a lane game; you ask
 * for a lane and the simulation answers when it is able. So this module is not
 * shaped like the parkour's `Controls`, which is polled every tick for the
 * current state of the sticks. Here THE QUEUE IS THE INTERFACE: an intent is
 * stamped with the instant it happened, parked in a slot, and consumed by the
 * one tick that can act on it. `sim.ts` never learns that a keyboard exists.
 *
 * WRONG TURNS TAKEN HERE, WRITTEN DOWN SO THEY ARE NOT RETAKEN:
 *
 * 1. COPYING THE PARKOUR'S POLL-SHAPED CONTROLS. `input.left` read once per
 *    tick loses every press that begins and ends inside a 50 ms tick, which on
 *    a phone is most of them. The queue exists because 20 Hz sampling of an
 *    edge is not sampling at all.
 *
 * 2. ONE SHARED PENDING SLOT. Ship it and the bug report is "my jump ate my
 *    lane change" — because that is exactly what happens the moment both are
 *    needed, which is the only moment anybody notices. Two channels, `lane`
 *    and `vert`, and they never touch each other.
 *
 * 3. RECOGNISING THE SWIPE ON `pointerup`. It is the single largest avoidable
 *    latency in a browser runner: 60–150 ms of the player's finger still
 *    travelling while the game waits to be told. We fire mid-drag, on the
 *    frame the threshold is crossed.
 *
 * 4. NAIVE RE-ANCHORING AFTER A FIRE. Move the origin to the point of the fire
 *    and nothing else, and one 200 px flick fires eight lane changes. The rule
 *    is ONE FIRE PER DIRECTION PER CONTACT — the anchor moves so an L-shaped
 *    gesture (right, then up) still works, and the fired-direction set means
 *    the overshoot after the corner cannot repeat what already went.
 *
 * 5. TRUSTING `e.repeat` ALONE TO KILL AUTO-REPEAT. It is unreliable through
 *    remote desktops and some virtual keyboards, and the failure mode is not
 *    cosmetic — a held arrow becomes thirty lane changes and the game is
 *    unplayable. `e.repeat` is discarded AND a `held` set must see the keyup.
 *
 * 6. `preventDefault()` ON SPACE UNCONDITIONALLY. Then the keyboard-only
 *    player can never press Leave, because Space is how a focused button is
 *    pressed. Arrows and Space are only swallowed when focus is not on
 *    something interactive inside the chrome.
 *
 * 7. ASSUMING `preventDefault()` ON `touchmove` CAN REPLACE `touch-action`.
 *    Those listeners are passive by default and the call does nothing at all.
 *    The canvas carries `touch-action: none` from `src/style.css`; that is what
 *    stops the page rubber-banding under a swipe, not any code in here.
 *
 * 8. BINDING THE SWIPE LISTENERS TO THE CHROME. `#sf` is `pointer-events: none`
 *    so the game shows through it, which means a listener bound there receives
 *    precisely nothing — every touch goes to the canvas underneath. That bug
 *    shipped the parkour's phone build with a dead thumbstick and survived a
 *    suite that only checked the buttons were big enough. `surface` is THE
 *    CANVAS. `root` is used for two things only: finding the thumb buttons,
 *    and asking whether focus is sitting on a piece of chrome.
 *
 * The buffer ages are measured against TICK TIME — the instant the tick
 * represents — and never against `performance.now()`. Measuring against the
 * frame clock silently eats up to 50 ms of the window, and only on some
 * frames, which is the worst kind of wrong: it works on your machine.
 */

import { clamp } from '../core/contract'
import type { Action, ActionSource } from './sim'

export type Channel = 'lane' | 'vert'

export interface SurfInput extends ActionSource {
  /** peek/take/clear come from ActionSource — see §C.3. `tickMs` is TICK TIME,
      the instant the tick represents, never performance.now(). Two rules live
      inside peek and are not optional:
        NOT FROM THE FUTURE  if (p.at > tickMs) return null
        NOT FROM THE PAST    if (tickMs - p.at > BUF[kind]) { clear; return null }
      Measuring the buffer against the frame clock instead silently eats up to
      50 ms of the window, and only on some frames. */

  /** true if the last input came from a touch. Drives whether #sf-touch shows. */
  readonly touch: boolean
  /** −1..+1, a render-side spring fed by the input event itself. runner.ts
      reads it for the lean so the figure acknowledges a swipe within one
      frame. NOT simulation state. */
  readonly lean: number
  setEnabled(on: boolean): void
  /** poll the gamepad. Once per FRAME, never per tick. */
  pollPad(nowMs: number): void
  onPause(cb: () => void): void
  onRestart(cb: () => void): void
  onDeploy(cb: () => void): void
  onLeave(cb: () => void): void
  dispose(): void
}

/* ---------------------------------------------------------------------------
   §D.11, entire. Every number here is milliseconds or CSS pixels, because this
   is the one file in src/surf/ that lives on the DOM's clock.
   --------------------------------------------------------------------------- */

/** below this no axis is resolved at all */
const DEAD_ZONE_PX = 6
/** lower bar on the release fallback */
const RELEASE_MIN_PX = 16
/**
 * `|dy| >= 1.25·|dx|` reads as vertical. The split is at 51.3° and the bias is
 * deliberately toward horizontal: a thumb pivoting at the base of the hand
 * traces an arc, so a swipe the player experiences as "straight right" carries
 * real vertical travel with it.
 */
const VERT_BIAS = 1.25
/** release-path window; a contact older than GESTURE_MAX never fires at all */
const FLICK_MAX_MS = 300
const GESTURE_MAX_MS = 700
/** single tap = jump, and only when no swipe fired on that contact */
const TAP_MAX_MS = 220
const TAP_SLOP_PX = 10
/** a contact this wide is a palm on the bezel, not a thumb */
const PALM_PX = 40
/** how long an unanswered intent waits, per channel. §D.11. */
const BUF_LANE_MS = 250
const BUF_JUMP_MS = 200
const BUF_ROLL_MS = 200
/**
 * Pointer input swallowed after mounting, and again on the way out. Without it
 * the click that activated the landmark arrives as a tap-jump on frame one and
 * the player's first jump is one they did not ask for.
 */
const ENTRY_GRACE_MS = 250
/** gamepad hysteresis, or a held stick repeats */
const PAD_ON = 0.5
const PAD_OFF = 0.35
/** two Escapes inside this window leave. See the note on LEAVE below. */
const DOUBLE_ESC_MS = 600

/**
 * A CSS pixel is not a physical length, so the swipe threshold is a fraction of
 * the short edge with a floor and a ceiling. 24 px is about 6.3 mm — a third of
 * a thumb pad on a 390-wide phone. The formula gives 31 on a tablet, where the
 * hand moves further for everything. The ceiling stops a 4K touchscreen
 * demanding a shove.
 */
function swipeMinPx(): number {
  const vw = window.innerWidth || 390
  const vh = window.innerHeight || 844
  return clamp(0.03 * Math.min(vw, vh), 24, 44)
}

const BUF: Record<Action, number> = {
  left: BUF_LANE_MS,
  right: BUF_LANE_MS,
  jump: BUF_JUMP_MS,
  roll: BUF_ROLL_MS,
}

const CHANNEL: Record<Action, Channel> = {
  left: 'lane',
  right: 'lane',
  jump: 'vert',
  roll: 'vert',
}

/** physical positions. On AZERTY the key where W lives emits 'z'. */
const K_LEFT = ['ArrowLeft', 'KeyA']
const K_RIGHT = ['ArrowRight', 'KeyD']
const K_JUMP = ['Space', 'ArrowUp', 'KeyW']
const K_ROLL = ['ArrowDown', 'KeyS']
const K_DEPLOY = ['KeyE', 'ShiftLeft']
const K_PAUSE = ['Escape', 'KeyP']
const K_SWALLOW = new Set([...K_LEFT, ...K_RIGHT, ...K_JUMP, ...K_ROLL])

interface Pending {
  action: Action
  /** performance.now() at the instant the intent happened */
  at: number
}

interface Contact {
  /** the anchor. It moves on a fire, so an L-shaped gesture resolves twice. */
  x: number
  y: number
  /** when the contact started, for the tap and flick windows */
  t0: number
  /** furthest the finger has been from the ORIGINAL touch-down */
  travel: number
  ox: number
  oy: number
  /** one fire per direction per contact */
  fired: { left: boolean; right: boolean; up: boolean; down: boolean }
  any: boolean
}

/**
 * A short buzz, swallowed whole if the device has no motor or the browser has
 * decided we have not earned one. Never awaited, never checked: haptics that
 * throw are still haptics that do not matter.
 */
export function buzz(ms: number): void {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* no motor, no permission, no problem */
  }
}

export function createSurfInput(root: HTMLElement | null, surface: HTMLElement): SurfInput {
  const pending: { lane: Pending | null; vert: Pending | null } = { lane: null, vert: null }

  let enabled = false
  /** pointer input is ignored until this instant. See ENTRY_GRACE_MS. */
  let graceUntil = 0
  let isTouch =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(hover: none)').matches === true || 'ontouchstart' in window)

  /** the cosmetic lean: an impulse and the instant it was struck */
  let leanDir = 0
  let leanAt = -1e9
  /** the lean has decayed to nothing after about 320 ms */
  const LEAN_TAU = 0.11

  let minPx = swipeMinPx()

  const held = new Set<string>()
  const contacts = new Map<number, Contact>()

  const pauseCbs: Array<() => void> = []
  const restartCbs: Array<() => void> = []
  const deployCbs: Array<() => void> = []
  const leaveCbs: Array<() => void> = []
  const fire = (list: Array<() => void>) => {
    for (const cb of list.slice()) cb()
  }

  /* ----------------------------------------------------------------------
     the queue
     ---------------------------------------------------------------------- */

  /**
   * Replace, never append. Three right swipes inside a lane lock produce the
   * change in flight plus ONE more, not three. Right-then-left inside the lock
   * ends you where you started, resolved from the destination lane — the
   * correction lands, and that is the behaviour that makes the game feel like
   * it is listening.
   */
  function push(action: Action, at: number): void {
    if (!enabled) return
    pending[CHANNEL[action]] = { action, at }
    if (action === 'left' || action === 'right') {
      /* The lean is in WORLD X, not in screen terms, because runner.ts takes
         the larger of this and the tween's own lateral velocity and the two
         have to agree in sign — disagree and the figure fights itself for the
         first four ticks of every lane change. Left is +X: see `laneToX` in
         track.ts for why the lanes run backwards along that axis. */
      leanDir = action === 'left' ? 1 : -1
      leanAt = at
      if (isTouch) buzz(10)
    }
  }

  function peek(ch: Channel, tickMs: number): Action | null {
    const p = pending[ch]
    if (!p) return null
    // NOT FROM THE FUTURE. A press stamped after the instant this tick
    // represents belongs to the next tick, and a 5-tick catch-up burst must not
    // let one press be applied by all five.
    if (p.at > tickMs) return null
    // NOT FROM THE PAST. An intent nobody could act on inside its window is a
    // thing the player has already stopped expecting.
    if (tickMs - p.at > BUF[p.action]) {
      pending[ch] = null
      return null
    }
    return p.action
  }

  function take(ch: Channel, tickMs: number): Action | null {
    const a = peek(ch, tickMs)
    if (a !== null) pending[ch] = null
    return a
  }

  function clear(): void {
    pending.lane = null
    pending.vert = null
  }

  /* ----------------------------------------------------------------------
     keyboard
     ---------------------------------------------------------------------- */

  /**
   * True when the focus ring is sitting on a real control inside the chrome.
   * Space is how a focused button is pressed, so while it is there we neither
   * swallow the key nor turn it into a jump — otherwise the keyboard-only
   * player can see the Leave button, reach it with Tab, and never press it.
   */
  function focusOnChrome(): boolean {
    if (!root) return false
    const a = document.activeElement
    if (!a || a === document.body) return false
    if (!root.contains(a)) return false
    return !!(a as HTMLElement).matches?.('button, a[href], input, select, textarea, [tabindex]')
  }

  let lastEsc = -1e9

  const onKeyDown = (e: KeyboardEvent) => {
    if (!enabled) return
    const c = e.code
    // auto-repeat is discarded twice over: the flag, which lies through remote
    // desktops, and the held set, which cannot.
    if (e.repeat || held.has(c)) return
    held.add(c)

    const chrome = focusOnChrome()
    const now = performance.now()

    if (K_PAUSE.includes(c)) {
      // Escape always gets you out without a pointing device: one pauses, and
      // a second inside DOUBLE_ESC_MS leaves. The panel's Leave button is the
      // discoverable path; this is the one that works when you are panicking.
      if (c === 'Escape' && now - lastEsc < DOUBLE_ESC_MS) {
        lastEsc = -1e9
        fire(leaveCbs)
        return
      }
      lastEsc = now
      fire(pauseCbs)
      return
    }
    if (c === 'KeyR' && !e.metaKey && !e.ctrlKey) {
      fire(restartCbs)
      return
    }
    if (K_DEPLOY.includes(c)) {
      if (e.metaKey || e.ctrlKey) return
      fire(deployCbs)
      return
    }

    if (!K_SWALLOW.has(c)) return
    isTouch = false
    // Arrows would scroll the page; Space would press whatever has focus. Both
    // only when the focus is not on chrome — see focusOnChrome above.
    if (!chrome) e.preventDefault()
    if (c === 'Space' && chrome) return

    if (K_LEFT.includes(c)) push('left', now)
    else if (K_RIGHT.includes(c)) push('right', now)
    else if (K_JUMP.includes(c)) push('jump', now)
    else if (K_ROLL.includes(c)) push('roll', now)
  }

  const onKeyUp = (e: KeyboardEvent) => {
    held.delete(e.code)
  }

  /* ----------------------------------------------------------------------
     swipes, on the canvas
     ---------------------------------------------------------------------- */

  /** which way this displacement points, or null if it does not point */
  function resolve(dx: number, dy: number): Action | null {
    const ax = Math.abs(dx)
    const ay = Math.abs(dy)
    if (ax < DEAD_ZONE_PX && ay < DEAD_ZONE_PX) return null
    // The DOMINANT COMPONENT ALONE must reach the threshold. Using the
    // hypotenuse lets a 45° diagonal fire on 17 px of horizontal travel, which
    // is how a scroll-ish drift becomes a lane change.
    if (ay >= VERT_BIAS * ax) {
      if (ay < minPx) return null
      return dy < 0 ? 'jump' : 'roll'
    }
    if (ax < minPx) return null
    return dx < 0 ? 'left' : 'right'
  }

  function dirOf(a: Action): keyof Contact['fired'] {
    return a === 'left' ? 'left' : a === 'right' ? 'right' : a === 'jump' ? 'up' : 'down'
  }

  /**
   * Pointer events carry a timestamp on the same monotonic clock as
   * performance.now() in every browser that matters — but not all of them, and
   * a stamp from a different origin poisons the whole buffer. Trust it only
   * when it lands in a plausible place.
   */
  function stampOf(e: PointerEvent): number {
    const now = performance.now()
    const ts = e.timeStamp
    return ts > 0 && ts <= now + 4 && now - ts < 1000 ? ts : now
  }

  const onPointerDown = (e: PointerEvent) => {
    if (!enabled) return
    const now = performance.now()
    if (now < graceUntil) return
    // a palm on the bezel of a phone held in landscape
    if (e.width > PALM_PX || e.height > PALM_PX) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (e.pointerType === 'touch' || e.pointerType === 'pen') isTouch = true
    const t = stampOf(e)
    contacts.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      ox: e.clientX,
      oy: e.clientY,
      t0: t,
      travel: 0,
      fired: { left: false, right: false, up: false, down: false },
      any: false,
    })
  }

  const onPointerMove = (e: PointerEvent) => {
    const c = contacts.get(e.pointerId)
    if (!c || !enabled) return
    const t = stampOf(e)
    c.travel = Math.max(c.travel, Math.hypot(e.clientX - c.ox, e.clientY - c.oy))
    // A contact older than the gesture window is a hold, a rest or a palm, and
    // it must not become a lane change forty seconds later.
    if (t - c.t0 > GESTURE_MAX_MS) return
    const a = resolve(e.clientX - c.x, e.clientY - c.y)
    if (!a) return
    const d = dirOf(a)
    if (c.fired[d]) return
    c.fired[d] = true
    c.any = true
    // The anchor moves to here so the second leg of an L reads from the corner.
    // The fired flags are what stop the overshoot repeating.
    c.x = e.clientX
    c.y = e.clientY
    push(a, t)
  }

  const onPointerUp = (e: PointerEvent) => {
    const c = contacts.get(e.pointerId)
    contacts.delete(e.pointerId)
    if (!c || !enabled) return
    const t = stampOf(e)
    const dt = t - c.t0
    if (c.any) return
    const dx = e.clientX - c.ox
    const dy = e.clientY - c.oy
    const dist = Math.hypot(dx, dy)
    // a tap is a jump — the one gesture every runner player already knows
    if (dist <= TAP_SLOP_PX && dt <= TAP_MAX_MS) {
      push('jump', t)
      return
    }
    // the release fallback, for a flick short enough that the threshold was
    // never crossed mid-drag but fast enough to have meant something
    if (dist >= RELEASE_MIN_PX && dt <= FLICK_MAX_MS) {
      // resolve() would reject it on minPx, so ask the axes directly
      const ax = Math.abs(dx)
      const ay = Math.abs(dy)
      const a: Action =
        ay >= VERT_BIAS * ax ? (dy < 0 ? 'jump' : 'roll') : dx < 0 ? 'left' : 'right'
      push(a, t)
    }
  }

  /** a cancelled contact fires NOTHING. The browser took it away for a reason. */
  const onPointerCancel = (e: PointerEvent) => {
    contacts.delete(e.pointerId)
  }

  /* ----------------------------------------------------------------------
     the thumb buttons, and deploy
     ---------------------------------------------------------------------- */

  const btnCleanups: Array<() => void> = []

  /**
   * A thumb button fires on POINTERDOWN, not on click: waiting for the release
   * costs the same 60–150 ms the swipe recogniser exists to avoid, and a
   * button that is slower than the gesture it replaces is a button nobody uses
   * twice. `click` stays wired as well so the keyboard can reach it — Space and
   * Enter on a focused button dispatch click and never pointerdown.
   */
  function wireAction(id: string, action: Action): void {
    const b = root?.querySelector<HTMLElement>('#' + id)
    if (!b) return
    let fired = -1
    const down = (e: PointerEvent) => {
      if (!enabled) return
      e.preventDefault()
      isTouch = e.pointerType !== 'mouse'
      fired = performance.now()
      push(action, stampOf(e))
    }
    const click = () => {
      if (!enabled) return
      const now = performance.now()
      // the pointerdown already handled it; this is the keyboard's path only
      if (now - fired < 700) return
      push(action, now)
    }
    b.addEventListener('pointerdown', down)
    b.addEventListener('click', click)
    btnCleanups.push(() => {
      b.removeEventListener('pointerdown', down)
      b.removeEventListener('click', click)
    })
  }

  function wireFire(id: string, list: Array<() => void>): void {
    const b = root?.querySelector<HTMLElement>('#' + id)
    if (!b) return
    const go = () => {
      if (!enabled) return
      fire(list)
    }
    b.addEventListener('click', go)
    btnCleanups.push(() => b.removeEventListener('click', go))
  }

  wireAction('sf-left', 'left')
  wireAction('sf-right', 'right')
  wireAction('sf-jump', 'jump')
  wireAction('sf-roll', 'roll')
  // Double-tap is NOT a gameplay action. Mapping it to deploy while a single
  // tap jumps means two fast jump taps burn the handcar. The rare, non
  // time-critical action gets a real button instead: ≥44 px, focusable, and
  // readable by a screen reader.
  wireFire('sf-deploy', deployCbs)

  /* ----------------------------------------------------------------------
     losing the window
     ---------------------------------------------------------------------- */

  /**
   * Drop everything. A swipe issued 180 ms before you alt-tabbed must not fire
   * when you come back, and a key held at the moment focus left never sends its
   * keyup — so the held set would keep that key down forever and the next press
   * of it would be ignored for the rest of the session.
   */
  const dropAll = () => {
    held.clear()
    contacts.clear()
    clear()
  }

  const onBlur = () => {
    dropAll()
    if (enabled) fire(pauseCbs)
  }
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') onBlur()
  }
  const onResize = () => {
    minPx = swipeMinPx()
  }

  /* ----------------------------------------------------------------------
     the pad
     ---------------------------------------------------------------------- */

  /** which pad directions are currently "on", for hysteresis */
  const padOn = { left: false, right: false, up: false, down: false }
  const padBtn = new Set<number>()

  function pollPad(nowMs: number): void {
    if (!enabled) return
    let pads: (Gamepad | null)[]
    try {
      pads = navigator.getGamepads?.() ?? []
    } catch {
      return
    }
    let ax = 0
    let ay = 0
    const down = new Set<number>()
    let any = false
    for (const p of pads) {
      if (!p || !p.connected) continue
      any = true
      if (Math.abs(p.axes[0] ?? 0) > Math.abs(ax)) ax = p.axes[0] ?? 0
      if (Math.abs(p.axes[1] ?? 0) > Math.abs(ay)) ay = p.axes[1] ?? 0
      for (let i = 0; i < p.buttons.length; i++) if (p.buttons[i]?.pressed) down.add(i)
    }
    if (!any) return
    // the d-pad reads as buttons, and most players use it for a lane game
    if (down.has(14)) ax = -1
    if (down.has(15)) ax = 1
    if (down.has(12)) ay = -1
    if (down.has(13)) ay = 1

    // Two thresholds, not one. With a single threshold a stick resting a hair
    // over it repeats every frame and the runner strobes between two lanes.
    const edge = (
      key: keyof typeof padOn,
      v: number,
      action: Action,
    ) => {
      if (v >= PAD_ON) {
        if (!padOn[key]) {
          padOn[key] = true
          isTouch = false
          push(action, nowMs)
        }
      } else if (v < PAD_OFF) {
        padOn[key] = false
      }
    }
    edge('left', -ax, 'left')
    edge('right', ax, 'right')
    edge('up', -ay, 'jump')
    edge('down', ay, 'roll')

    // A (0) jumps, B (1) rolls, X (2) deploys, Start (9) pauses. Edge-triggered
    // off a set, because a held button is `pressed` on every single frame.
    const tap = (i: number, run: () => void) => {
      if (down.has(i)) {
        if (!padBtn.has(i)) {
          padBtn.add(i)
          run()
        }
      } else padBtn.delete(i)
    }
    tap(0, () => push('jump', nowMs))
    tap(1, () => push('roll', nowMs))
    tap(2, () => fire(deployCbs))
    tap(9, () => fire(pauseCbs))
  }

  /* ----------------------------------------------------------------------
     wiring
     ---------------------------------------------------------------------- */

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  window.addEventListener('resize', onResize)
  document.addEventListener('visibilitychange', onVisibility)
  // THE CANVAS. Not the chrome — see wrong turn 8 in the header.
  surface.addEventListener('pointerdown', onPointerDown)
  surface.addEventListener('pointermove', onPointerMove)
  surface.addEventListener('pointerup', onPointerUp)
  surface.addEventListener('pointercancel', onPointerCancel)

  return {
    peek,
    take,
    clear,

    get touch() {
      return isTouch
    },

    /**
     * Fed straight from the input event and decayed on the wall clock, so the
     * figure has begun to lean inside one frame of the swipe even though the
     * authoritative lane position does not move until the next 20 Hz tick.
     * Exponential, so it is frame-rate independent without an update() call
     * nobody would remember to make.
     */
    get lean() {
      const dt = (performance.now() - leanAt) / 1000
      if (dt > 1) return 0
      return leanDir * Math.exp(-dt / LEAN_TAU)
    },

    setEnabled(on) {
      if (on === enabled) return
      enabled = on
      dropAll()
      // Both ways: the click that activated the sign must not arrive as a
      // tap-jump on frame one, and the click that left must not arrive as a
      // step in the field.
      graceUntil = performance.now() + ENTRY_GRACE_MS
      if (!on) {
        leanDir = 0
        leanAt = -1e9
        for (const k of Object.keys(padOn) as (keyof typeof padOn)[]) padOn[k] = false
        padBtn.clear()
      }
    },

    pollPad,

    onPause(cb) {
      pauseCbs.push(cb)
    },
    onRestart(cb) {
      restartCbs.push(cb)
    },
    onDeploy(cb) {
      deployCbs.push(cb)
    },
    onLeave(cb) {
      leaveCbs.push(cb)
    },

    dispose() {
      enabled = false
      dropAll()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      surface.removeEventListener('pointerdown', onPointerDown)
      surface.removeEventListener('pointermove', onPointerMove)
      surface.removeEventListener('pointerup', onPointerUp)
      surface.removeEventListener('pointercancel', onPointerCancel)
      for (const off of btnCleanups.splice(0)) off()
      pauseCbs.length = 0
      restartCbs.length = 0
      deployCbs.length = 0
      leaveCbs.length = 0
    },
  }
}

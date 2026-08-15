/**
 * Controls — Minecraft's, plus a thumb-friendly version of them.
 *
 * KEYS ARE VANILLA, INCLUDING THE ONE THAT IS INCONVENIENT. WASD and the
 * arrows move relative to where you are looking, space jumps, the mouse turns
 * you once the pointer is captured — and **Shift is sneak, not sprint**.
 *
 * Binding Shift to sprint is what every other game has trained people to
 * expect, and it was the first thing this did. It is wrong. A Minecraft
 * player's left pinky crouches on that key, and crouching is not a garnish
 * here: sneaking up to the very lip of a block to set up a jump you otherwise
 * cannot make is the foundational technique of every parkour map worth
 * playing. Sprint gets Ctrl (vanilla) and double-tap-W (what most players
 * actually use), which between them cover everybody.
 *
 * KEYS ARE READ BY PHYSICAL POSITION. `event.code`, not `event.key`: on an
 * AZERTY keyboard the key where W lives emits 'z', and reading `key` means
 * WASD simply does not work in France. Minecraft binds physical scancodes.
 *
 * POINTER LOCK IS THE ONLY UNAVOIDABLE FRICTION. A third-person camera you
 * steer with the mouse cannot work without it, so the game asks for it with a
 * click and hands it straight back on Escape.
 *
 * TOUCH IS A FIRST-CLASS PATH, not a fallback. A left-thumb stick, a jump
 * button, a sprint toggle, and drag-anywhere-else to look. Half the people who
 * open this site are on a phone, and an unlocked area you cannot play on the
 * device you unlocked it with is worse than no area at all.
 */

export interface Controls {
  /** −1…1 along the way you are facing */
  readonly forward: number
  readonly strafe: number
  readonly jump: boolean
  readonly sprint: boolean
  readonly sneak: boolean
  /** mouse/finger movement since the last frame, in radians of turn */
  takeLook(): { yaw: number; pitch: number }
  readonly locked: boolean
  requestLock(): void
  releaseLock(): void
  /** Escape, or the pointer lock being dropped by the browser */
  onRelease(cb: () => void): void
  onRestart(cb: () => void): void
  /** F5 — cycle the camera, as Minecraft does */
  onView(cb: () => void): void
  setEnabled(on: boolean): void
  /** true if this device wants the on-screen controls */
  readonly touch: boolean
  dispose(): void
}

/**
 * Radians per pixel of mouse movement, at Minecraft's default sensitivity.
 * Derived rather than guessed: vanilla computes d = 0.5×0.6 + 0.2 = 0.5, then
 * d³×8 = 1.0, then yRot += dx × 0.15 degrees — which is 0.0026180 rad/px.
 */
const SENS = 0.002618
const TOUCH_SENS = 0.0055
/**
 * How long a second tap of W still counts as a double-tap.
 *
 * Vanilla's `sprintTriggerTime` is 7 ticks, and 7 × 50 ms is this number. It
 * was 260 here, which is a tap-and-a-half faster than the window every player
 * arrives already calibrated to — so the double-tap "did not work" for anyone
 * whose muscle memory came from the real game, which is everyone who would
 * think to try it.
 */
const DOUBLE_TAP_MS = 350

export function createControls(canvas: HTMLElement, root: HTMLElement): Controls {
  const keys = new Set<string>()
  let enabled = true
  let locked = false
  let yaw = 0
  let pitch = 0
  let sprintKey = false
  let sprintTap = false
  let sneakKey = false
  let lastW = 0
  const viewCbs: Array<() => void> = []

  const releaseCbs: Array<() => void> = []
  const restartCbs: Array<() => void> = []

  const wantsTouch =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(hover: none)').matches === true || 'ontouchstart' in window)

  /* ---------------- keyboard ---------------- */

  /** physical positions, so the layout underneath does not matter */
  const FORWARD = ['KeyW', 'ArrowUp']
  const BACK = ['KeyS', 'ArrowDown']
  const LEFT = ['KeyA', 'ArrowLeft']
  const RIGHT = ['KeyD', 'ArrowRight']
  const MOVE = new Set([...FORWARD, ...BACK, ...LEFT, ...RIGHT])
  const held = (list: string[]) => list.some((c) => keys.has(c))

  const onKeyDown = (e: KeyboardEvent) => {
    if (!enabled) return
    const c = e.code
    if (c === 'Escape') {
      // Chrome drops the lock itself on Escape, but ask anyway: nothing else
      // guarantees it, and a half-released lock is a game you cannot leave.
      if (document.pointerLockElement === canvas) document.exitPointerLock?.()
      for (const cb of releaseCbs.slice()) cb()
      return
    }
    if (c === 'KeyR' && !e.metaKey && !e.ctrlKey) {
      for (const cb of restartCbs.slice()) cb()
      return
    }
    if (c === 'F5') {
      // Minecraft's camera key, and it cycles rather than toggles
      e.preventDefault()
      for (const cb of viewCbs.slice()) cb()
      return
    }
    if (c === 'ShiftLeft' || c === 'ShiftRight') {
      sneakKey = true
      e.preventDefault()
      return
    }
    if (c === 'ControlLeft' || c === 'ControlRight') {
      sprintKey = true
      return
    }
    if (c === 'Space') {
      keys.add('Space')
      e.preventDefault()
      return
    }
    if (!MOVE.has(c)) return
    e.preventDefault()
    if (FORWARD.includes(c) && !keys.has(c)) {
      const now = performance.now()
      if (now - lastW < DOUBLE_TAP_MS) sprintTap = true
      lastW = now
    }
    keys.add(c)
  }

  const onKeyUp = (e: KeyboardEvent) => {
    const c = e.code
    if (c === 'ShiftLeft' || c === 'ShiftRight') {
      sneakKey = false
      return
    }
    if (c === 'ControlLeft' || c === 'ControlRight') {
      sprintKey = false
      return
    }
    keys.delete(c === 'Space' ? 'Space' : c)
    // a double-tap sprint survives until you stop asking to go forward, which
    // is exactly how it behaves in the real game
    if (FORWARD.includes(c) && !held(FORWARD)) sprintTap = false
  }

  /**
   * Everything the keyboard was holding, dropped.
   *
   * A key that goes down in this window and comes up in another one never
   * sends its keyup here, so the game believes it is still held. Alt-tab
   * mid-sprint and you come back sprinting, into whatever is in front of you;
   * Cmd-Tab away with Shift down and the figure is crouched for good. The
   * browser tells us the window went away, and the only sane reading of that
   * is that every key came up with it.
   */
  const dropKeys = () => {
    keys.clear()
    sprintKey = false
    sprintTap = false
    sneakKey = false
    lastW = 0
  }

  /* ---------------- mouse ---------------- */

  const onMouseMove = (e: MouseEvent) => {
    if (!locked || !enabled) return
    yaw -= e.movementX * SENS
    pitch -= e.movementY * SENS
  }

  const onLockChange = () => {
    const now = document.pointerLockElement === canvas
    if (now === locked) return
    locked = now
    if (!locked) for (const cb of releaseCbs.slice()) cb()
  }

  /* ---------------- touch ----------------
     Left thumb steers, right thumb looks. Buttons are real DOM so they can be
     sized for a thumb and read by a screen reader; the stick is a pointer
     region rather than an element, because a fixed stick position is wrong for
     every hand except the one it was designed for. */

  let stickId = -1
  let stickX = 0
  let stickY = 0
  let touchFwd = 0
  let touchStrafe = 0
  let lookId = -1
  let lookX = 0
  let lookY = 0
  let touchJump = false
  let touchSprint = false
  let touchSneak = false

  const stick = document.getElementById('pk-stick')
  const knob = document.getElementById('pk-knob')
  const jumpBtn = document.getElementById('pk-jump')
  const sprintBtn = document.getElementById('pk-sprint')

  const STICK_R = 46

  const onPointerDown = (e: PointerEvent) => {
    if (!enabled) return
    const t = e.target as HTMLElement
    if (t.closest('#pk-jump, #pk-sprint, #pk-exit, #pk-restart, #pk-panel')) return
    // A mouse that never got the pointer lock can still drag to look. It is a
    // worse way to play and it is far better than not being able to turn.
    if (e.pointerType === 'mouse') {
      if (!locked && lookId < 0) {
        lookId = e.pointerId
        lookX = e.clientX
        lookY = e.clientY
      }
      return
    }
    if (stickId < 0 && e.clientX < window.innerWidth * 0.45) {
      stickId = e.pointerId
      stickX = e.clientX
      stickY = e.clientY
      if (stick) {
        stick.style.left = `${stickX}px`
        stick.style.top = `${stickY}px`
        stick.dataset.on = 'true'
      }
    } else if (lookId < 0) {
      lookId = e.pointerId
      lookX = e.clientX
      lookY = e.clientY
    }
  }

  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerId === stickId) {
      const dx = e.clientX - stickX
      const dy = e.clientY - stickY
      const d = Math.hypot(dx, dy)
      const k = d > STICK_R ? STICK_R / d : 1
      touchStrafe = (dx * k) / STICK_R
      touchFwd = (-dy * k) / STICK_R
      if (knob) knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`
    } else if (e.pointerId === lookId) {
      yaw -= (e.clientX - lookX) * TOUCH_SENS
      pitch -= (e.clientY - lookY) * TOUCH_SENS
      lookX = e.clientX
      lookY = e.clientY
    }
  }

  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerId === stickId) {
      stickId = -1
      touchFwd = 0
      touchStrafe = 0
      if (stick) stick.dataset.on = 'false'
      if (knob) knob.style.transform = ''
    } else if (e.pointerId === lookId) {
      lookId = -1
    }
  }

  const hold = (el: HTMLElement | null, set: (on: boolean) => void) => {
    if (!el) return
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      set(true)
    })
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      el.addEventListener(ev, () => set(false))
    }
  }
  hold(jumpBtn, (on) => (touchJump = on))
  const sneakBtn = document.getElementById('pk-sneak')
  hold(sneakBtn, (on) => {
    touchSneak = on
    // and it lights, off the same flag: `:active` lets go the moment the
    // thumb slides off the button, while the sneak itself does not
    if (sneakBtn) sneakBtn.dataset.on = on ? 'true' : 'false'
  })
  sprintBtn?.addEventListener('click', () => {
    touchSprint = !touchSprint
    sprintBtn.dataset.on = touchSprint ? 'true' : 'false'
  })

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', dropKeys)
  window.addEventListener('mousemove', onMouseMove)
  document.addEventListener('pointerlockchange', onLockChange)
  root.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)

  return {
    get forward() {
      if (!enabled) return 0
      let f = touchFwd
      if (held(FORWARD)) f += 1
      if (held(BACK)) f -= 1
      return Math.max(-1, Math.min(1, f))
    },
    get strafe() {
      if (!enabled) return 0
      let s = touchStrafe
      if (held(RIGHT)) s += 1
      if (held(LEFT)) s -= 1
      return Math.max(-1, Math.min(1, s))
    },
    get jump() {
      return enabled && (keys.has('Space') || touchJump)
    },
    get sprint() {
      return enabled && (sprintKey || sprintTap || touchSprint)
    },
    get sneak() {
      return enabled && (sneakKey || touchSneak)
    },
    get locked() {
      return locked
    },
    get touch() {
      return wantsTouch
    },

    takeLook() {
      const out = { yaw, pitch }
      yaw = 0
      pitch = 0
      return out
    },

    requestLock() {
      if (wantsTouch) return
      // Pointer lock needs a user gesture, and there are real paths here that
      // do not have one — walking into the portal on the dwell timer, or the
      // `?parkour` shortcut. A refusal is not an error, it is the browser
      // asking to be clicked, so swallow it and let the game put the "click
      // to play" overlay up (see parkour.ts).
      try {
        const p = canvas.requestPointerLock?.() as unknown
        if (p && typeof (p as Promise<void>).catch === 'function') {
          void (p as Promise<void>).catch(() => {})
        }
      } catch {
        /* the overlay is the fallback */
      }
    },
    releaseLock() {
      if (document.pointerLockElement === canvas) document.exitPointerLock?.()
    },

    onRelease(cb) {
      releaseCbs.push(cb)
    },
    onRestart(cb) {
      restartCbs.push(cb)
    },
    onView(cb) {
      viewCbs.push(cb)
    },

    setEnabled(on) {
      enabled = on
      if (!on) {
        // sneak and the sprint toggle were the two this forgot, and they are
        // the two that are *held*: leaving the game with Shift down and
        // coming back to a figure that will not stand up is the bug that
        // makes a player think the crouch is broken rather than sticky
        dropKeys()
        touchFwd = 0
        touchStrafe = 0
        touchJump = false
        touchSneak = false
        touchSprint = false
        if (sneakBtn) sneakBtn.dataset.on = 'false'
        if (sprintBtn) sprintBtn.dataset.on = 'false'
        stickId = -1
        lookId = -1
      }
    },

    dispose() {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', dropKeys)
      window.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onLockChange)
      root.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    },
  }
}

/**
 * The player — you are a person carrying a lantern.
 *
 * WHAT CHANGED, AND WHY IT MATTERS: this used to be a point light and a glow
 * sprite. Now it is a figure and the light hangs off its arm. The physics
 * underneath is the same forty lines of velocity integration; everything added
 * here is the body that the physics moves and the walk that sells it.
 *
 * THE FIGURE IS DELIBERATELY NOBODY. No face, no hair, no clothing, no
 * silhouette cues that read as a gender, an age or a build — a jointed
 * cartoon armature and nothing else. Anyone arriving here is meant to be able
 * to read it as themselves, and every feature you add takes that away from
 * somebody. If you are tempted to give it a detail, the question to ask is
 * whether the detail describes a *person* or describes *walking*. Only the
 * second kind belongs.
 *
 * The lantern is the concept: the field is dark, the projector needs light,
 * and now you can see who is carrying it. It is parented to the hand, so it
 * swings when the arm swings, and it counter-rotates so it hangs level — a
 * lantern that pivots with the wrist reads as a torch welded to a stick.
 *
 * MOVEMENT IS THE KEYBOARD, AND ONLY THE KEYBOARD: arrows and WASD, held.
 * Top speed came down when the light became a body, because 15 units/second is
 * a drift for a spark and a dead sprint for something with legs.
 *
 * THE POINTER IS A THROTTLE, NOT A DESTINATION. Hold the button down on a patch
 * of ground and the figure walks toward the cursor for exactly as long as you
 * are holding it — `steerTo` below, re-aimed every time the cursor moves, so
 * dragging steers. Let go and it stops. It used to be a fire-and-forget errand:
 * one click sent the figure across the field and it kept going long after the
 * button was up, which is a thing you have to UNDO rather than a thing you are
 * doing, and it made the field feel like it was driving you.
 *
 * The stop is the damping, not a handbrake — a body with legs under it does not
 * halt on a frame. Three tenths of a second of slowing down is what "stop"
 * looks like on something that was walking.
 *
 * A LANDMARK IS STILL AN ERRAND, and that is the one exception. Clicking the
 * projector from across the field means *go and use that thing*, and it walks
 * you the whole way on a single click (`travelTo`) because releasing the button
 * halfway would strand you in the dark next to nothing. Clicking a THING is an
 * instruction; holding on the GROUND is steering. See `onPointerDown` in
 * main.ts, where the two are told apart.
 *
 * The keys always win over both: the first one held calls the errand off
 * mid-stride (`settle()` in `onKeyDown`), because if you are driving you mean it.
 *
 * KEYS ARE WORLD AXES, not camera-relative, because the camera does not turn
 * (see camera.ts). ↑ is always -Z, and it stays -Z whichever way the figure
 * happens to be facing. The figure still turns to face where it is going —
 * that part is the walk, not the controls — but the frame it is walking in
 * never moves under you.
 *
 * SCRIPTED MOVEMENT (`walkTo`, `press`, `faceTo`) is how the film sequence
 * gets the figure to the projector, has it reach out and switch the thing on,
 * and then walks it back to somewhere it can watch from. It runs even while
 * input is disabled — `setEnabled(false)` turns off *your* control, not the
 * body — which is the whole point: during the film you are not driving.
 */

import * as THREE from 'three'
import { PALETTE, clamp, ease, angleDelta } from '../core/contract'
import { FIELD_RADIUS } from './field'

/* ---------------- proportions ----------------
   Roughly 5.5 heads tall: enough that it reads as a figure rather than a
   doll next to a thirty-unit screen, short enough that the follow camera
   framing from the light-era still works. Everything below hangs off these,
   so the figure scales as a piece. */
const HIP_Y = 1.98
const SHOULDER_Y = 3.16
const HEAD_Y = 3.86
const HEAD_R = 0.36
const SHOULDER_X = 0.38
const HIP_X = 0.19

const THIGH = 1.02
const SHIN = 0.88
const UPPER_ARM = 0.74
const FOREARM = 0.68

/** where the lantern hangs, for the lighting maths */
const LANTERN_Y = SHOULDER_Y - UPPER_ARM - FOREARM - 0.16

const ACCEL = 30
const MAX_SPEED = 9
const DAMPING = 3.0
const ARRIVE_RADIUS = 1.6 // stop fussing once this close to a scripted target
/** how close the held cursor can get before the figure stops chasing it —
 *  smaller than ARRIVE_RADIUS, because you are steering rather than arriving,
 *  and a wide deadzone under a held cursor feels like a dropped input */
const STEER_DEADZONE = 0.5
/** metres of ground per half-cycle of the walk — sets the cadence */
const STRIDE = 2.0
const TURN_RATE = 7.5 // radians/second the figure can swing round

const LAMP_BASE = 74
const GLOW_SIZE = 3.4

/** soft radial falloff for the lantern's halo — additive, so it blooms
 *  without a postprocessing pass costing us a full-screen render target */
function glowTexture(): THREE.CanvasTexture {
  const S = 128
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const c = cv.getContext('2d')!
  // Tight falloff. The first pass reached far too wide and additive-blended
  // the middle of the frame into a featureless blob — the glow should read as
  // a source, not as weather.
  const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0.0, 'rgba(255,232,196,0.95)')
  g.addColorStop(0.1, 'rgba(255,205,132,0.42)')
  g.addColorStop(0.28, 'rgba(233,175,88,0.12)')
  g.addColorStop(0.62, 'rgba(227,169,74,0.025)')
  g.addColorStop(1.0, 'rgba(227,169,74,0)')
  c.fillStyle = g
  c.fillRect(0, 0, S, S)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export interface Player {
  object: THREE.Group
  /** live reference to the figure's feet — read it, don't reassign it */
  readonly position: THREE.Vector3
  readonly speed: number
  /**
   * Is a scripted walk under way — `walkTo`, `travelTo`, the film's own moves.
   * False the instant one arrives or is called off, including by you taking a
   * key, which is how main.ts knows an errand it sent the figure on is still
   * an errand and not something you have since overruled.
   */
  readonly travelling: boolean
  /** how strongly the lantern reaches a point, 0..1 */
  litAt(p: THREE.Vector3): number
  /** is the pointer currently holding the figure toward a point */
  readonly steering: boolean
  /** walk there and resolve on arrival. Runs with input disabled. */
  walkTo(target: THREE.Vector3): Promise<void>
  /** turn to face a point and reach out to it; resolves at the moment of
   *  contact, so a caller can switch something on exactly then */
  press(target: THREE.Vector3): Promise<void>
  /** turn to face a point, without moving */
  faceTo(point: THREE.Vector3): void
  travelTo(target: THREE.Vector3): void
  /**
   * The pointer is DOWN and aimed here. Call it on the press and again on every
   * move while the button is held — it is a heading, not a destination, and the
   * figure walks toward whatever the last call named.
   */
  steerTo(point: THREE.Vector3): void
  /** the pointer came up. Stop walking. */
  stopSteer(): void
  cancelTravel(): void
  /** enable *your* control. Scripted movement ignores this. */
  setEnabled(on: boolean): void
  /**
   * 0 = night, 1 = daylight. Fades the lantern out as the sun comes up — the
   * flame goes cold, the halo goes, and the point light drops to a trace.
   * The lantern itself stays in the hand, because taking it away mid-stride is
   * a prop vanishing from a person; and `litAt` is unchanged either way, so
   * nothing about how landmarks arm or reveal depends on what time it is.
   */
  setDaylight(k: number): void
  update(dt: number, elapsed: number): void
  dispose(): void
}

export function createPlayer(scene: THREE.Scene): Player {
  const group = new THREE.Group()
  group.position.set(0, 0, 46)

  /* ================= the figure =================
     Built facing +Z, so yaw is a plain atan2(dx, dz) with no offset to
     forget. Every joint is an empty Group at the pivot with the limb hung
     below it: rotating a group rotates about the joint, which is the only
     way a knee bends rather than slides. */

  const skin = new THREE.MeshStandardMaterial({
    color: 0x4a5a5e,
    roughness: 0.82,
    metalness: 0.06,
  })
  const dark = new THREE.MeshStandardMaterial({
    color: 0x1e2a2d,
    roughness: 0.9,
    metalness: 0.1,
  })

  const geo: THREE.BufferGeometry[] = []
  const keep = <T extends THREE.BufferGeometry>(g: T): T => {
    geo.push(g)
    return g
  }

  /** a limb: a capsule hung from a joint group, pointing down */
  function limb(parent: THREE.Object3D, length: number, radius: number): THREE.Group {
    const joint = new THREE.Group()
    const mesh = new THREE.Mesh(
      keep(new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 4, 10)),
      skin,
    )
    mesh.position.y = -length / 2
    joint.add(mesh)
    parent.add(joint)
    return joint
  }

  // the body carries the bob and the lean, so the walk cycle never has to
  // touch the root — the root is where the physics lives
  const body = new THREE.Group()
  group.add(body)

  const torso = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.3, 0.86, 5, 12)), skin)
  torso.position.y = (HIP_Y + SHOULDER_Y) / 2
  body.add(torso)

  const head = new THREE.Mesh(keep(new THREE.SphereGeometry(HEAD_R, 18, 14)), skin)
  head.position.y = HEAD_Y
  body.add(head)

  const neck = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.11, 0.13, 0.24, 10)), skin)
  neck.position.y = SHOULDER_Y + 0.16
  body.add(neck)

  /* legs — hip → knee → foot */
  const hips: THREE.Group[] = []
  const knees: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const hip = new THREE.Group()
    hip.position.set(side * HIP_X, HIP_Y, 0)
    body.add(hip)

    const thigh = limb(hip, THIGH, 0.155)
    thigh.position.y = 0
    const knee = limb(thigh, SHIN, 0.13)
    knee.position.y = -THIGH

    const foot = new THREE.Mesh(keep(new THREE.BoxGeometry(0.3, 0.13, 0.52)), dark)
    foot.position.set(0, -SHIN + 0.02, 0.11)
    knee.add(foot)

    hips.push(thigh)
    knees.push(knee)
  }

  /* arms — shoulder → elbow → hand */
  const shoulders: THREE.Group[] = []
  const elbows: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const anchor = new THREE.Group()
    anchor.position.set(side * SHOULDER_X, SHOULDER_Y, 0)
    body.add(anchor)

    const upper = limb(anchor, UPPER_ARM, 0.125)
    const elbow = limb(upper, FOREARM, 0.11)
    elbow.position.y = -UPPER_ARM

    shoulders.push(upper)
    elbows.push(elbow)
  }

  const leftArm = shoulders[0]!
  const leftElbow = elbows[0]!
  const rightArm = shoulders[1]!
  const rightElbow = elbows[1]!

  /* ================= the lantern =================
     Hung from the right hand. `swing` is the pendulum — it counter-rotates
     the arm's swing so the lantern stays upright in the world, then adds a
     little lag of its own, which is the whole trick: the light should look
     like it is being *carried*, not like it is bolted on. */

  const swing = new THREE.Group()
  swing.position.y = -FOREARM - 0.04
  rightElbow.add(swing)

  const brass = new THREE.MeshStandardMaterial({
    color: 0x8a6a34,
    roughness: 0.45,
    metalness: 0.75,
  })

  const bail = new THREE.Mesh(keep(new THREE.TorusGeometry(0.1, 0.02, 6, 14, Math.PI)), brass)
  bail.position.y = -0.02
  swing.add(bail)

  const cap = new THREE.Mesh(keep(new THREE.ConeGeometry(0.17, 0.14, 12)), brass)
  cap.position.y = -0.14
  swing.add(cap)

  const base = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.15, 0.16, 0.06, 12)), brass)
  base.position.y = -0.5
  swing.add(base)

  for (const a of [0.4, 2.5, 4.6]) {
    const post = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.014, 0.014, 0.32, 5)), brass)
    post.position.set(Math.cos(a) * 0.13, -0.32, Math.sin(a) * 0.13)
    swing.add(post)
  }

  // the flame. MeshBasic + toneMapped:false so it stays the brightest thing
  // in frame no matter what the exposure is doing. In daylight it crossfades
  // to FLAME_COLD, which is a dull wick behind glass rather than a light.
  const FLAME_LIT = new THREE.Color(0xfff0d2)
  const FLAME_COLD = new THREE.Color(0x4a4034)
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xfff0d2, fog: false, toneMapped: false })
  const flame = new THREE.Mesh(keep(new THREE.SphereGeometry(0.1, 12, 10)), flameMat)
  flame.position.y = -0.32
  swing.add(flame)

  const glowTex = glowTexture()
  const glowMat = new THREE.SpriteMaterial({
    map: glowTex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    fog: false,
  })
  const glow = new THREE.Sprite(glowMat)
  glow.scale.setScalar(GLOW_SIZE)
  glow.position.y = -0.32
  swing.add(glow)

  // r155+ lights are physically based — intensity is candela — but decay 2 is
  // too aggressive here: the point of this light is to *reveal a field*, and
  // inverse-square puts everything past twenty units in the dark. 1.6 keeps a
  // hot centre while still reaching the middle distance.
  const lamp = new THREE.PointLight(PALETTE.glow, LAMP_BASE, 85, 1.6)
  lamp.castShadow = false
  lamp.position.y = -0.32
  swing.add(lamp)

  scene.add(group)

  /* ---------------- movement state ---------------- */
  const vel = new THREE.Vector3()
  /** where a scripted walk is headed — only walkTo/travelTo ever set it */
  const target = new THREE.Vector3()
  let autoTravel = false
  /** where the HELD pointer is pointing, and whether it is held at all */
  const heading = new THREE.Vector3()
  let steering = false
  let enabled = true
  const keys = new Set<string>()

  /** resolved when a scripted walk arrives — or when it is called off, so a
   *  caller can never be left awaiting a walk that has been abandoned */
  let arrive: (() => void) | null = null

  let yaw = Math.PI // facing the projector at spawn: -Z
  let yawTarget = yaw
  group.rotation.y = yaw

  /* the reach gesture */
  let gestureT = -1
  const GESTURE_DUR = 1.15
  const GESTURE_CONTACT = 0.46
  let contact: (() => void) | null = null

  /* the walk cycle */
  let phase = 0
  let amp = 0

  /** 0 night, 1 day — how much the sun has taken the lantern's job */
  let daylight = 0

  /* Everything that stops the figure goes through here, INCLUDING the held
     pointer — so `cancelTravel()` at the top of the film, or a scripted walk
     taking over, drops a button that is still physically down rather than
     handing control back to it the moment the script lets go. main.ts arms the
     hold again on the next press. */
  function settle(): void {
    const done = arrive
    arrive = null
    autoTravel = false
    steering = false
    if (done) done()
  }

  function faceToward(x: number, z: number): void {
    const dx = x - group.position.x
    const dz = z - group.position.z
    if (Math.hypot(dx, dz) < 0.001) return
    yawTarget = Math.atan2(dx, dz)
  }

  /* ---------------- input ----------------
     Keys, and nothing else. See the header: the pointer does not drive. */

  const MOVE_KEYS = new Set([
    'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd',
  ])
  const onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase()
    if (!MOVE_KEYS.has(k)) return
    if (!enabled) return
    keys.add(k)
    settle()
    e.preventDefault()
  }
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase())

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  /* ---------------- integration ---------------- */
  const accel = new THREE.Vector3()
  const toTarget = new THREE.Vector3()

  function update(dt: number, elapsed: number) {
    accel.set(0, 0, 0)

    // your keys beat a scripted walk — if you're holding one you mean it
    // (onKeyDown has already called settle(), so the walk is called off too)
    let kx = 0
    let kz = 0
    if (enabled) {
      if (keys.has('arrowleft') || keys.has('a')) kx -= 1
      if (keys.has('arrowright') || keys.has('d')) kx += 1
      if (keys.has('arrowup') || keys.has('w')) kz -= 1
      if (keys.has('arrowdown') || keys.has('s')) kz += 1
    }

    if (kx || kz) {
      accel.set(kx, 0, kz).normalize().multiplyScalar(ACCEL)
    } else if (steering && enabled) {
      /* the held pointer. Same easing as a scripted walk on the way in, so
         parking the cursor on your own feet settles instead of shuffling —
         but it never `settle()`s on arrival, because the button being down is
         the only thing that says whether you are still walking. */
      toTarget.subVectors(heading, group.position)
      toTarget.y = 0
      const d = toTarget.length()
      if (d > STEER_DEADZONE) {
        const gain = clamp(d / 7, 0.3, 1)
        accel.copy(toTarget).divideScalar(d).multiplyScalar(ACCEL * gain)
      }
    } else if (autoTravel) {
      toTarget.subVectors(target, group.position)
      toTarget.y = 0
      const d = toTarget.length()
      if (d < ARRIVE_RADIUS) {
        settle()
      } else {
        // ease off as we arrive so a scripted walk doesn't overshoot the mark
        // and then jog back to it
        const gain = clamp(d / 7, 0.3, 1)
        accel.copy(toTarget).divideScalar(d).multiplyScalar(ACCEL * gain)
      }
    }

    vel.addScaledVector(accel, dt)

    // exponential damping — frame-rate independent, unlike v *= 0.96
    const damp = Math.exp(-DAMPING * dt)
    vel.multiplyScalar(damp)

    const sp = vel.length()
    if (sp > MAX_SPEED) vel.multiplyScalar(MAX_SPEED / sp)

    group.position.addScaledVector(vel, dt)

    // soft boundary — a spring, not a wall, so it never feels like a fence
    const flat = Math.hypot(group.position.x, group.position.z)
    if (flat > FIELD_RADIUS) {
      const over = flat - FIELD_RADIUS
      const push = Math.min(over * 0.16, 3)
      group.position.x -= (group.position.x / flat) * push
      group.position.z -= (group.position.z / flat) * push
      vel.multiplyScalar(0.9)
    }

    group.position.y = 0

    /* ---------------- facing ---------------- */
    // steer toward travel while moving; a gesture pins the facing so the
    // figure doesn't drift off its mark mid-reach
    if (sp > 0.6 && gestureT < 0) yawTarget = Math.atan2(vel.x, vel.z)
    const turn = angleDelta(yaw, yawTarget)
    yaw += turn * Math.min(1, TURN_RATE * dt)
    group.rotation.y = yaw

    /* ---------------- the walk ---------------- */
    // cadence is speed over stride, so the feet keep up with the ground and
    // the figure never moonwalks. Amplitude follows speed too: a slow drift
    // gets a small step, a run gets a full one.
    const want = clamp(sp / (MAX_SPEED * 0.62))
    amp += (want - amp) * Math.min(1, dt * 8)
    phase += (sp / STRIDE) * Math.PI * dt

    const A = amp * 0.62

    const s = Math.sin(phase)
    const bend = Math.max(0, Math.cos(phase))

    hips[0]!.rotation.x = -s * A
    hips[1]!.rotation.x = s * A
    knees[0]!.rotation.x = bend * A * 1.5
    knees[1]!.rotation.x = Math.max(0, -Math.cos(phase)) * A * 1.5

    // breath, so standing still is not standing dead
    const breath = Math.sin(elapsed * 1.35)

    // The free arm counter-swings; the lantern arm is damped, because you
    // don't swing the hand with the light in it. The free arm is also the one
    // that reaches out to press things, so the walk only writes to it when no
    // gesture is running.
    if (gestureT < 0) {
      leftArm.rotation.x = s * A * 0.85 + breath * 0.03
      leftElbow.rotation.x = -0.22 - Math.max(0, s) * A * 0.5
    }
    rightArm.rotation.x = -s * A * 0.26 - breath * 0.03
    rightElbow.rotation.x = -0.16
    // a little splay, away from the body on each side
    leftArm.rotation.z = -0.07
    rightArm.rotation.z = 0.07

    /* the reach — turn on the projector */
    if (gestureT >= 0) {
      gestureT += dt
      const k = clamp(gestureT / GESTURE_DUR)
      // out fast, hold, back slow: the shape of actually pressing something
      const reach = k < 0.42 ? ease(k / 0.42) : 1 - ease(clamp((k - 0.58) / 0.42))
      leftArm.rotation.x = -1.42 * reach - 0.02
      leftElbow.rotation.x = -0.55 + 0.42 * reach
      if (contact && gestureT >= GESTURE_DUR * GESTURE_CONTACT) {
        const fire = contact
        contact = null
        fire()
      }
      if (k >= 1) gestureT = -1
    }

    // bob twice a cycle, lean into the run
    body.position.y = -Math.abs(Math.cos(phase)) * 0.07 * amp + breath * 0.012
    body.rotation.x = clamp(sp / MAX_SPEED) * 0.11
    body.rotation.z = Math.sin(phase) * 0.03 * amp
    head.position.y = HEAD_Y + breath * 0.01

    /* the lantern hangs level whatever the arm does, plus a little lag */
    const carried = -(rightArm.rotation.x + rightElbow.rotation.x + body.rotation.x)
    const lag = Math.sin(phase - 0.7) * 0.12 * amp
    swing.rotation.x = carried + lag
    swing.rotation.z = -body.rotation.z - Math.sin(phase * 0.5) * 0.05 * amp

    /* flame. Two frequencies so it never reads as a sine, and a kick with
       speed so moving costs the flame something. Daylight takes all of it
       away except a trace of warm bounce — a lantern at noon is an object
       you are carrying, not a light you are working by. */
    const flick =
      1 + Math.sin(elapsed * 11.3) * 0.045 + Math.sin(elapsed * 27.7) * 0.03 + amp * 0.08
    const lit = 1 - daylight
    glow.scale.setScalar(GLOW_SIZE * flick * (0.3 + lit * 0.7))
    glowMat.opacity = lit * lit
    glow.visible = glowMat.opacity > 0.01
    lamp.intensity = LAMP_BASE * flick * (0.035 + lit * 0.965)
    flame.scale.setScalar(0.94 + flick * 0.08)
    flameMat.color.copy(FLAME_COLD).lerp(FLAME_LIT, lit)
  }

  const tmp = new THREE.Vector3()
  const lanternAt = new THREE.Vector3()

  return {
    object: group,
    position: group.position,
    get speed() {
      return vel.length()
    },
    get travelling() {
      return autoTravel
    },
    get steering() {
      return steering
    },

    litAt(p: THREE.Vector3) {
      lanternAt.copy(group.position)
      lanternAt.y += LANTERN_Y
      const d = tmp.copy(p).sub(lanternAt).length()
      return clamp(1 - d / 34)
    },

    walkTo(t: THREE.Vector3) {
      settle()
      target.copy(t)
      target.y = 0
      autoTravel = true
      keys.clear()
      faceToward(t.x, t.z)
      return new Promise<void>((res) => {
        arrive = res
      })
    },

    press(t: THREE.Vector3) {
      settle()
      keys.clear()
      // a second press before the first has landed would strand the first
      // caller waiting on a promise nothing will ever resolve
      contact?.()
      contact = null
      faceToward(t.x, t.z)
      gestureT = 0
      return new Promise<void>((res) => {
        contact = res
      })
    },

    faceTo(p: THREE.Vector3) {
      faceToward(p.x, p.z)
    },

    travelTo(t: THREE.Vector3) {
      settle()
      target.copy(t)
      target.y = 0
      autoTravel = true
      keys.clear()
      faceToward(t.x, t.z)
    },

    steerTo(p: THREE.Vector3) {
      /* An errand does not survive you taking the wheel — same rule the keys
         follow. `settle()` clears `steering` too, so this order matters: cancel
         first, then arm. */
      settle()
      heading.copy(p)
      heading.y = 0
      steering = true
      // faceToward is left to `update`, which turns the figure toward wherever
      // it is actually moving — a drag that swings the cursor round the body
      // should turn the walk, not snap the shoulders
    },

    stopSteer() {
      steering = false
    },

    cancelTravel() {
      settle()
    },

    setEnabled(on: boolean) {
      enabled = on
      if (!on) {
        keys.clear()
        steering = false
      }
    },

    setDaylight(k: number) {
      daylight = clamp(k)
    },

    update,

    dispose() {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      for (const g of geo) g.dispose()
      skin.dispose()
      dark.dispose()
      brass.dispose()
      flameMat.dispose()
      glowMat.dispose()
      glowTex.dispose()
      scene.remove(group)
    },
  }
}

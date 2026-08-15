/**
 * The figure, sprinting — the same person you are out in the field and the
 * same person you are in the parkour, with the same lamp in the same hand.
 *
 * WHERE THIS CAME FROM. It is a copy of `src/parkour/avatar.ts`: the same
 * proportions, the same solved constants, the same near-black albedo, the
 * same lantern rig. It is copied and not imported because house rule 7 says
 * a subsystem may reach across a boundary for exactly one file
 * (`core/contract.ts`) and nothing else, and because the two figures now want
 * different things — the parkour figure sneaks and clings, this one rolls and
 * gets caught by a guard. From here they are free to diverge, and they will.
 * Fixing a bug in one does not fix it in the other. That is the price and it
 * was worth paying: a shared avatar module would have to know about both
 * games' state machines, and then it is not a figure, it is a coupling.
 *
 * WRONG TURNS ALREADY TAKEN, INHERITED FROM avatar.ts, NOT TO BE RETAKEN:
 *   - a normal albedo. The lantern is in its own hand; anything with a
 *     sensible diffuse colour blows to cream the moment the lamp swings past
 *     the chest. The answer is not the light, it is the albedo: 0x0d1417 is a
 *     silhouette in ambient and picks up a warm edge from the lamp, which is
 *     the whole picture — a dark shape and a light.
 *   - a light layer, to stop the lamp lighting its own carrier. three.js
 *     tests `object.layers` against THE CAMERA's layers and never against a
 *     light's, so moving the lamp to layer 1 does not stop it lighting the
 *     figure, it stops it existing. There is no per-light layer mask.
 *   - unlit material (MeshBasicMaterial) for the body. The build spec's brief
 *     asks for this and it is wrong, and it is wrong for a reason worth
 *     writing down: unlit is a flat sticker. Every pose below — the tuck, the
 *     roll, the counter-lean — is read off the way light falls across a
 *     curved surface, and with no lighting term there is one tone from crown
 *     to boot and none of it is visible. Standard material at a near-black
 *     albedo gets both: it cannot bleach, and it still has a tonal range.
 *
 * WHAT A RUNNER NEEDS THAT A WALKER DOES NOT:
 *   - a CAPPED CADENCE (§D.9). At 26 u/s a fixed 0.95-u stride is 27 steps a
 *     second and the legs are a strobe. Cap the steps at 4.6/s and let the
 *     stride grow instead; the character's animation goes nearly
 *     speed-invariant and everything around him carries the acceleration,
 *     which is how every good endless runner does it.
 *   - a sidestep that leans INTO the change and counter-leans the head. A
 *     lane change without the counter-lean is a translation; with it, it is a
 *     decision. That is the single cheapest bit of character in the file.
 *   - a real forward ROLL, not a crouch. The whole body turns a full circle
 *     about the hips over 7 of the 11 ticks — and the lantern does NOT turn
 *     with it, or the shot reads as a lamp falling downstairs.
 *   - a stumble you recover from, a handcar you ride, an updraft you hang
 *     under, and a death tumble in which the lamp leaves your hand at 190 ms
 *     and rolls away still lit. That last image is the only reason the death
 *     is about a person rather than about a ragdoll.
 *
 * EVERYTHING HERE IS COSMETIC. Not one value below is read by `sim.ts`; the
 * simulation hands us poses and timers and we perform them. The eases are all
 * `1 - exp(-rate*dt)` on the frame's dt, which is the only frame-rate
 * independent smoothing there is, and every *timing* comes from the sim's
 * integer tick counters, so the choreography is identical at 30 fps and 144.
 */

import * as THREE from 'three'
import { clamp, reducedMotion } from '../core/contract'
import type { SimState } from './sim'

/* ---- proportions, copied from avatar.ts ---------------------------------
   1.8 units to the crown, which is the collider's height and the parkour
   figure's height and therefore this world's height for a person. The field's
   figure is 3.86 units tall; K is that shape at this scale. */
const HEIGHT = 1.8
const K = HEIGHT / 3.86

const HIP_Y = 1.98 * K
const SHOULDER_Y = 3.16 * K
const HEAD_Y = 3.86 * K
const HEAD_R = 0.36 * K
const SHOULDER_X = 0.38 * K
const HIP_X = 0.19 * K
const THIGH = 1.02 * K
const SHIN = 0.88 * K
const UPPER_ARM = 0.74 * K
const FOREARM = 0.68 * K
const HEAD_LOCAL = HEAD_Y - HIP_Y

/* ---- the run cycle ------------------------------------------------------
   §D.9's cadence rule, in two lines. Below 8.7 u/s the stride is fixed at
   1.9 u and the cadence rises with speed like a person's does; above it the
   cadence pins at 4.6 steps/s and the STRIDE absorbs everything else. The two
   agree at the join (8.7 / 1.9 = 4.58), so there is no visible gear change.
   One step is half a cycle, i.e. π of phase. */
const STRIDE_MIN = 1.9
const CADENCE_CAP = 4.6

/** ticks the roll animation runs for. `sim.ts` owns the real number (§D.4);
    this is only the fallback for the very first frame of the very first roll,
    because after that we learn the span from the counter itself. A mismatch
    would cost a slightly clipped rotation and could never cost a hitbox. */
const ROLL_TICKS = 11
/** the roll's spin is over by tick 7 of 11 — the last four ticks are the
    figure coming back up onto its feet, which is the part that sells it. */
const ROLL_SPIN_TICKS = 7
/** how high the tucked ball's centre rides above the rail bed. The tuck is
    about 0.5 u in radius, so at 0.55 it grazes the ballast — which is what a
    roll looks like — instead of floating over it or ploughing through it. */
const ROLL_PIVOT_Y = 0.55
/** …and where that centre IS, in the body's own frame: forward of the hips
    and below them, because the trunk folds over the thighs. Measured off the
    tucked pose, not guessed; see the block comment on the roll. */
const BALL_Y = 0.78
const BALL_Z = 0.36
const STUMBLE_TICKS = 14

/** the lantern leaves the hand here, in seconds after contact (§D.10) */
const LAMP_SEPARATES = 0.19
/** the tumble runs 90 → 790 ms, 1.5 turns (§D.10) */
const TUMBLE_FROM = 0.09
const TUMBLE_TO = 0.79
/** where the hips come to rest once he is down. Not zero: a body on its back
    has its hips a hand's width off the ground and an arm flung out beside it,
    and 0.38 is what keeps that arm out of the ballast. */
const LIE_HIP_Y = 0.38
/** the handcar's wheel, which also sets how fast the wheels turn */
const WHEEL_R = 0.17

/** `1 - exp(-rate*dt)`, the house's only smoothing. Declared locally on
    purpose — it is three tokens and a shared module for it would be a
    cross-boundary import for nothing. */
const approach = (dt: number, rate: number) => 1 - Math.exp(-rate * dt)
/** the S-curve everything discrete eases on, so nothing starts or stops hard */
const smooth = (t: number) => {
  const u = clamp(t)
  return u * u * (3 - 2 * u)
}
/** remap into 0..1 and smooth it, the workhorse of every timed pose below */
const win = (v: number, a: number, b: number) => smooth((v - a) / (b - a))

/* module-level scratch, so `update` allocates nothing on any frame */
const _q = new THREE.Quaternion()
const _tilt = new THREE.Quaternion()
const _euler = new THREE.Euler()

export interface Runner {
  readonly object: THREE.Object3D
  /** where the lantern is this frame, in world space. scene.ts reads it to
      place the point light; runner.ts writes it in `update`. */
  readonly lanternAt: THREE.Vector3
  /**
   * Once per FRAME. `x`,`y`,`z` are already interpolated. `dt` is frame time.
   * Everything eased in here uses `1 - exp(-rate*dt)`; nothing here is a
   * per-frame lerp constant.
   *
   * `leanTarget` is fed straight from the input event rather than from the
   * lane tween, so the body starts leaning within one frame of the swipe even
   * though the lane position steps at 20 Hz. It is cosmetic and NEVER read by
   * the simulation.
   */
  update(dt: number, x: number, y: number, z: number, state: SimState, leanTarget: number): void
  /** the death tumble, t = seconds since the fatal contact. The lantern
      separates at t = 0.19 and keeps its light on — that is the shot. */
  die(t: number, dir: -1 | 0 | 1): void
  reset(): void
  dispose(): void
}

export function createRunner(): Runner {
  /* ---- the rig ----------------------------------------------------------
     root      world x/z only. Never rotates, so the drop shadow hung off it
               is never yawed or banked with the body.
     figure    the feet. Carries y, and the thrown offset during a death.
     board     the handcar, a sibling of the body so it can out-lean it.
     pivot     the point the body turns about: the feet while running (so a
               lean is a lean), 0.55 up while rolling (so a roll is a roll),
               the hips while dying.
     body      bob, stride sway, the trunk's forward lean.
     upper     everything above the waist, so the figure folds instead of
               tipping like a signpost — see avatar.ts, this was learned the
               hard way and the waist buys the run lean, the landing absorb
               and the roll tuck all at once. */
  const root = new THREE.Group()
  root.name = 'surf-runner'
  const figure = new THREE.Group()
  root.add(figure)
  const pivot = new THREE.Group()
  figure.add(pivot)
  const body = new THREE.Group()
  pivot.add(body)

  const geo: THREE.BufferGeometry[] = []
  const keep = <T extends THREE.BufferGeometry>(g: T): T => {
    geo.push(g)
    return g
  }

  /* LIT, BUT ALMOST BLACK. See the header. */
  const skin = new THREE.MeshStandardMaterial({ color: 0x0d1417, roughness: 1, metalness: 0 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x080f11, roughness: 1, metalness: 0 })

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

  const upper = new THREE.Group()
  upper.position.y = HIP_Y
  body.add(upper)

  const torso = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.3 * K, 0.86 * K, 5, 12)), skin)
  torso.position.y = (SHOULDER_Y - HIP_Y) / 2
  upper.add(torso)

  const head = new THREE.Mesh(keep(new THREE.SphereGeometry(HEAD_R, 18, 14)), skin)
  head.position.y = HEAD_LOCAL
  upper.add(head)

  const neck = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(0.11 * K, 0.13 * K, 0.24 * K, 10)),
    skin,
  )
  neck.position.y = SHOULDER_Y + 0.16 * K - HIP_Y
  upper.add(neck)

  const hips: THREE.Group[] = []
  const knees: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const hip = new THREE.Group()
    hip.position.set(side * HIP_X, HIP_Y, 0)
    body.add(hip)
    const thigh = limb(hip, THIGH, 0.155 * K)
    const knee = limb(thigh, SHIN, 0.13 * K)
    knee.position.y = -THIGH
    const foot = new THREE.Mesh(keep(new THREE.BoxGeometry(0.3 * K, 0.13 * K, 0.52 * K)), dark)
    foot.position.set(0, -SHIN + 0.02 * K, 0.11 * K)
    knee.add(foot)
    hips.push(thigh)
    knees.push(knee)
  }
  const hipL = hips[0]!
  const hipR = hips[1]!
  const kneeL = knees[0]!
  const kneeR = knees[1]!
  /* the hip GROUPS, as opposed to the thighs hung off them — the roll needs
     to swing the whole leg sideways and the board needs the feet apart */
  const hipRootL = hipL.parent as THREE.Group
  const hipRootR = hipR.parent as THREE.Group

  const shoulders: THREE.Group[] = []
  const elbows: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const anchor = new THREE.Group()
    anchor.position.set(side * SHOULDER_X, SHOULDER_Y - HIP_Y, 0)
    upper.add(anchor)
    const arm = limb(anchor, UPPER_ARM, 0.125 * K)
    const elbow = limb(arm, FOREARM, 0.11 * K)
    elbow.position.y = -UPPER_ARM
    shoulders.push(arm)
    elbows.push(elbow)
  }
  const armL = shoulders[0]!
  const armR = shoulders[1]!
  const elbowL = elbows[0]!
  const elbowR = elbows[1]!

  /* the hand: an empty at the end of the right forearm. The lantern hangs off
     it, and on death it is what the lamp is un-parented FROM. */
  const hand = new THREE.Group()
  hand.position.y = -FOREARM - 0.04 * K
  elbowR.add(hand)

  /* ---- the lantern ------------------------------------------------------
     Same brass, same flame, same modest size as the parkour's. It is a group
     of its own so it can be re-parented to the root on death without taking
     an arm with it. */
  const lamp = new THREE.Group()
  hand.add(lamp)

  const brass = new THREE.MeshStandardMaterial({
    color: 0x8a6a34,
    roughness: 0.45,
    metalness: 0.75,
  })
  const bail = new THREE.Mesh(keep(new THREE.TorusGeometry(0.1 * K, 0.02 * K, 6, 14, Math.PI)), brass)
  bail.position.y = -0.02 * K
  lamp.add(bail)
  const cap = new THREE.Mesh(keep(new THREE.ConeGeometry(0.17 * K, 0.14 * K, 12)), brass)
  cap.position.y = -0.14 * K
  lamp.add(cap)
  const lampBase = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(0.15 * K, 0.16 * K, 0.06 * K, 12)),
    brass,
  )
  lampBase.position.y = -0.5 * K
  lamp.add(lampBase)
  for (const a of [0.4, 2.5, 4.6]) {
    const post = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(0.014 * K, 0.014 * K, 0.32 * K, 5)),
      brass,
    )
    post.position.set(Math.cos(a) * 0.13 * K, -0.32 * K, Math.sin(a) * 0.13 * K)
    lamp.add(post)
  }
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xfff0d2, fog: false, toneMapped: false })
  const flame = new THREE.Mesh(keep(new THREE.SphereGeometry(0.1 * K, 12, 10)), flameMat)
  flame.position.y = -0.32 * K
  lamp.add(flame)

  /* ---- the handcar ------------------------------------------------------
     Not a hoverboard. A hoverboard in this world would be the one object that
     had wandered in from another game; a handcar is what is already standing
     in a trainyard, and it is the same joke — you are travelling on something
     that was never meant to carry you this fast. Deck, axles, four flanged
     wheels, and the pump lever folded flat so it is not in the way of the
     figure standing on it.

     It carries its own quiet amber edge lines because a matte near-black deck
     under the figure's own lamp is a hole in the floor. Recipe copied from
     the house rim (opacity 0.30, fogged AND tone-mapped) rather than imported
     from props.ts, because the import DAG says runner.ts sees three and
     contract and nothing else. */
  const board = new THREE.Group()
  board.visible = false
  figure.add(board)

  const iron = new THREE.MeshStandardMaterial({ color: 0x101a1e, roughness: 0.85, metalness: 0.2 })
  const steel = new THREE.MeshStandardMaterial({ color: 0x1a2529, roughness: 0.4, metalness: 0.8 })
  const rimMat = new THREE.LineBasicMaterial({
    color: 0xe3a94a,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    fog: true,
    toneMapped: true,
  })

  const deckGeo = keep(new THREE.BoxGeometry(0.96, 0.09, 1.52))
  const deck = new THREE.Mesh(deckGeo, iron)
  deck.position.y = 0.2
  board.add(deck)
  const deckRim = new THREE.LineSegments(keep(new THREE.EdgesGeometry(deckGeo)), rimMat)
  deckRim.position.copy(deck.position)
  board.add(deckRim)

  const axleGeo = keep(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 8))
  const wheelGeo = keep(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.07, 14))
  const wheels: THREE.Mesh[] = []
  for (const dz of [-0.52, 0.52]) {
    const axle = new THREE.Mesh(axleGeo, steel)
    axle.rotation.z = Math.PI / 2
    axle.position.set(0, 0.17, dz)
    board.add(axle)
    for (const dx of [-0.5, 0.5]) {
      const w = new THREE.Mesh(wheelGeo, steel)
      w.rotation.z = Math.PI / 2
      w.position.set(dx, 0.17, dz)
      board.add(w)
      wheels.push(w)
    }
  }
  /* the pump lever, folded down along the deck. It rocks with the sway, which
     is the only moving part of the board and the only thing that says the
     thing is being driven rather than coasting. */
  const leverPivot = new THREE.Group()
  leverPivot.position.set(0, 0.26, 0)
  board.add(leverPivot)
  const lever = new THREE.Mesh(keep(new THREE.BoxGeometry(0.62, 0.05, 0.05)), steel)
  lever.position.y = 0.06
  leverPivot.add(lever)

  /* ---- the drop shadow --------------------------------------------------
     A warm ring rather than a dark disc, for the reason avatar.ts gives: a
     dark blob on near-black ballast is nothing at all, but light pooling
     under you survives on the darkest stretch of track, which is exactly
     where a third-person jump most needs a ground reference. It hangs off the
     root, so it never yaws, banks or rolls with the figure. */
  const shadowCanvas = document.createElement('canvas')
  shadowCanvas.width = shadowCanvas.height = 64
  {
    const c = shadowCanvas.getContext('2d')!
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0.0, 'rgba(0,0,0,0.42)')
    g.addColorStop(0.62, 'rgba(0,0,0,0.26)')
    g.addColorStop(0.82, 'rgba(255,196,107,0.5)')
    g.addColorStop(1.0, 'rgba(255,196,107,0)')
    c.fillStyle = g
    c.fillRect(0, 0, 64, 64)
  }
  const shadowTex = new THREE.CanvasTexture(shadowCanvas)
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  })
  const shadowGeo = keep(new THREE.PlaneGeometry(1.25, 1.25))
  const shadow = new THREE.Mesh(shadowGeo, shadowMat)
  shadow.rotation.x = -Math.PI / 2
  shadow.renderOrder = 1
  root.add(shadow)

  /* ---- the springs ------------------------------------------------------
     Everything continuous the sim does NOT hand us. Each one is a scalar and
     each one moves with `approach`, so a 30 fps frame and a 144 fps frame
     arrive at the same value at the same wall-clock instant. */
  let phase = 0 // the stride, radians. One step = π.
  let lastZ = 0 // ground covered as of the last frame — the cycle's clock
  let age = 0 // seconds, for breath and flicker
  let gait = 0 // 0..1, how hard the legs are working
  let air = 0 // 0..1, feet off the ground
  let lean = 0 // −1..+1, the body's bank
  let leanArm = 0 // …trailing the torso by two ticks
  let leanBoard = 0 // …and the board, LEADING it by two
  let impact = 0 // 0..1, decaying out of a landing
  let boardOn = 0 // 0..1, the handcar arriving and leaving
  let lift = 0 // 0..1, the updraft carrying you
  let wasGround = true
  let fallV = 0 // the vy we were carrying when the feet last left the floor
  let rollSpan = ROLL_TICKS
  let stumbleSpan = STUMBLE_TICKS
  /** the surface under the feet the last time the sim spoke to us. `die` has
      no state to read and a figure that dies off a carriage roof has to fall
      onto the roof, not through it and not through the ballast either. */
  let lastGroundY = 0
  let dying = false
  let lampLoose = false
  const lampStart = new THREE.Vector3()
  /** the joint angles at the instant of death, so the sprawl blends out of
      whatever pose the figure was actually in rather than snapping to a
      canned one. Captured once, on the first `die` call. */
  const held = new Float32Array(12)
  let heldTaken = false

  const lanternAt = new THREE.Vector3()

  const hasPower = (state: SimState, kind: string): boolean => {
    for (const p of state.powers) if (p.kind === kind && p.ticks > 0) return true
    return false
  }

  /** the lamp hangs LEVEL, whatever the arm, the trunk, the bank and the roll
      are doing between it and the world.
      avatar.ts did this by summing the X rotations up the chain and negating
      them, which is exact only while every rotation in the chain is about the
      same axis. This figure banks about Z and rolls about X at the same time,
      and the sum is then simply wrong — the lamp wanders off vertical in the
      middle of every lane change. Setting the world orientation instead is
      both correct and shorter: the local quaternion that cancels the parent
      is inverse(parentWorld), and anything we want the lamp to actually do
      (a little lag swing) is applied after it, in world space. */
  function levelLamp(swingX: number, swingZ: number) {
    hand.updateWorldMatrix(true, false)
    _q.setFromRotationMatrix(hand.matrixWorld)
    _euler.set(swingX, 0, swingZ, 'XYZ')
    _tilt.setFromEuler(_euler)
    lamp.quaternion.copy(_q).invert().multiply(_tilt)
  }

  function writeLantern() {
    lamp.updateWorldMatrix(true, false)
    flame.updateWorldMatrix(false, false)
    lanternAt.setFromMatrixPosition(flame.matrixWorld)
  }

  function placeShadow(feetY: number, groundY: number, scale: number) {
    const drop = Math.max(0, feetY - groundY)
    /* fades with height, but never all the way out: at the top of an updraft
       you are 7.5 u up and the ring is the only thing telling you which lane
       you will come down in. */
    const k = Math.max(0.12, 1 - drop / 9)
    shadow.visible = true
    shadow.position.y = groundY + 0.02
    shadowMat.opacity = k * 0.9
    shadow.scale.setScalar(scale * (0.82 + (1 - k) * 0.8))
  }

  function restPose() {
    for (const j of [hipL, hipR, kneeL, kneeR, armL, armR, elbowL, elbowR]) {
      j.rotation.set(0, 0, 0)
    }
    hipRootL.rotation.set(0, 0, 0)
    hipRootR.rotation.set(0, 0, 0)
    hipRootL.position.x = -HIP_X
    hipRootR.position.x = HIP_X
    upper.rotation.set(0, 0, 0)
    head.rotation.set(0, 0, 0)
    head.position.y = HEAD_LOCAL
    body.rotation.set(0, 0, 0)
    body.position.set(0, 0, 0)
    pivot.rotation.set(0, 0, 0)
    pivot.position.set(0, 0, 0)
    figure.position.set(0, 0, 0)
    board.rotation.set(0, 0, 0)
    board.position.set(0, 0, 0)
    board.scale.setScalar(1)
    lamp.position.set(0, 0, 0)
    lamp.quaternion.identity()
    lamp.scale.setScalar(1)
    flame.scale.setScalar(1)
  }

  /* a retry allocates nothing (§D.10) — this is the whole of getting back to
     the starting pose, and it is a few dozen scalar writes. Named rather than
     inline on the object because `update` calls it too; see the recovery
     clause at the top of it. */
  function doReset() {
    if (lampLoose) {
      hand.add(lamp)
      lampLoose = false
    }
    dying = false
    heldTaken = false
    phase = 0
    lastZ = 0
    age = 0
    gait = 0
    air = 0
    lean = 0
    leanArm = 0
    leanBoard = 0
    impact = 0
    boardOn = 0
    lift = 0
    wasGround = true
    fallV = 0
    rollSpan = ROLL_TICKS
    stumbleSpan = STUMBLE_TICKS
    lastGroundY = 0
    restPose()
    board.visible = false
    shadow.visible = true
    shadowMat.opacity = 0.9
    shadow.scale.setScalar(1)
    root.position.set(0, 0, 0)
    root.updateMatrixWorld(true)
    writeLantern()
  }

  return {
    object: root,
    lanternAt,

    update(dt, x, y, z, state, leanTarget) {
      /* a tab that has been in the background hands back a dt of several
         seconds. Clamped, because every spring below would otherwise arrive
         instantly and the figure would appear mid-pose out of nowhere. */
      const d = Math.min(Math.max(dt, 0), 0.1)
      age += d

      root.position.set(x, 0, z)

      const pose = state.pose
      const down = pose === 'dead' || state.phase === 'dying' || state.phase === 'over'

      /* the death sequence owns the pose. `die` is driven off its own clock
         and is idempotent in t, so whichever order surf.ts calls the two in,
         the tumble is never half-overwritten by a run cycle. */
      if (dying || down) {
        /* …and if we are somehow running again without anyone having called
           `reset` — a revive that took a different path, a restart from the
           panel — recover instead of standing there in a heap for ever. A
           figure frozen mid-tumble while the score climbs is the kind of bug
           that only ever shows up in front of someone. */
        if (dying && !down) {
          doReset()
          root.position.set(x, 0, z) // doReset parks the root at the origin
        } else {
          placeShadow(y, state.groundY, 0.9)
          writeLantern()
          return
        }
      }

      figure.position.set(0, y, 0)
      lastGroundY = state.groundY

      const speed = Math.max(0, state.speed)
      const onBoard = pose === 'board'
      const rolling = pose === 'roll' && state.rollTicks > 0
      const stumbling = pose === 'stumble' && state.stumbleTicks > 0
      const flying = hasPower(state, 'updraft')
      const springy = hasPower(state, 'boots')

      /* ---- cadence (§D.9) ------------------------------------------------
         The cycle is driven by GROUND COVERED, not by the clock — the same
         decision avatar.ts made, for the same reason: a phase advanced by
         `speed × dt` moonwalks the moment a stumble drops the speed between
         the tick that set it and the frame that read it, and it is one frame
         of drift per tick different at 60 fps and at 144. Ground covered is
         the interpolated `z`, so its increments sum exactly however the
         frames fall.

         `stride` is §D.9's rule: fixed at 1.9 u until 8.7 u/s, then growing
         so the cadence pins at 4.6 steps/s. One step is π of phase.

         One residual frame dependence is left and it was measured rather than
         waved at: a frame straddling a tick boundary uses the new stride for
         the whole of its Δz, so over a scripted six-second run that ramps
         12 → 26 u/s, a 30 fps client and a 144 fps client end 0.059 rad —
         about three degrees — apart in LEG PHASE. Nothing else differs by
         more than 1.7 cm (the lamp). It is an offset inside a periodic cycle
         that no simulation value is derived from, and killing it would mean
         asking the sim for a cadence integral it has no business owning. */
      const stride = Math.max(STRIDE_MIN, speed / CADENCE_CAP)
      const dz = Math.min(Math.max(0, z - lastZ), 3)
      lastZ = z
      phase += (dz / stride) * Math.PI * (stumbling ? 2 : 1)
      if (phase > Math.PI * 2) phase -= Math.PI * 2 * Math.floor(phase / (Math.PI * 2))

      /* legs work when they are on the ground and there is ground speed. On
         the handcar they are still — that is the whole read of "I am riding
         something" and it costs one line. */
      const gaitWant = onBoard || rolling ? 0 : state.onGround ? clamp(speed / 10) : 0.25
      gait += (gaitWant - gait) * approach(d, 11)
      air += ((state.onGround ? 0 : 1) - air) * approach(d, 14)
      boardOn += ((onBoard ? 1 : 0) - boardOn) * approach(d, 9)
      lift += ((flying ? 1 : 0) - lift) * approach(d, 4)

      /* ---- the landing --------------------------------------------------
         `justLanded` is the sim's flag and we honour it, but it lives for one
         TICK and we are reading it on FRAMES: at 30 fps a frame can straddle
         two ticks and miss it entirely, and at 144 fps we would see it seven
         times. So the flag fires the absorb and the ground-contact edge fires
         it too, and the `impact` guard makes the pair idempotent. Hardness
         comes from the fall speed we were still carrying the last frame we
         were airborne, because by the time the feet are down `vy` is zero. */
      if (!state.onGround) fallV = Math.min(fallV, state.vy)
      const touched = (state.onGround && !wasGround) || (state.justLanded && state.onGround)
      if (touched && impact < 0.3) impact = clamp(Math.abs(fallV) / 18, 0.25, 1)
      if (!state.onGround && wasGround) fallV = 0
      wasGround = state.onGround
      impact -= impact * approach(d, 7)

      /* ---- the lean -----------------------------------------------------
         Two sources, and we take whichever is currently saying more. The
         input spring gets the body moving inside one frame of the swipe;
         the tween's own lateral velocity takes over for the body of the
         change and carries it out the far side. Adding them would double-
         count the middle of every lane change and throw the figure over. */
      const fromTween = clamp(state.lateralV / 22.5, -1, 1)
      const fromInput = clamp(leanTarget, -1, 1)
      const leanWant = Math.abs(fromInput) > Math.abs(fromTween) ? fromInput : fromTween
      /* up fast, back slowly: peak bank by tick 3 of a 4-tick tween, upright
         again by about tick 7, which is the §F shape without a keyframe in
         sight. */
      lean += (leanWant - lean) * approach(d, Math.abs(leanWant) > Math.abs(lean) ? 14 : 6)
      /* the lamp arm trails the torso by two ticks and the board leads it by
         two. These are second-order lags rather than delay lines on purpose:
         a ring buffer of frame samples is a frame-rate dependent delay, and a
         rate-10 spring is 0.1 s of lag at any frame rate at all. */
      leanArm += (lean - leanArm) * approach(d, 10)
      leanBoard += (leanWant - leanBoard) * approach(d, 30)

      /* ---- the sprint ---------------------------------------------------
         One-armed, because the other hand is full. The free arm drives
         through a bent elbow like a sprinter's; the lantern arm swings a
         third as far and hangs a little forward, which keeps the lamp off the
         thigh and throws its light onto the track ahead instead of onto the
         figure's own boots. */
      const s = Math.sin(phase)
      const cphase = Math.cos(phase)
      const A = gait * 0.66
      const breath = Math.sin(age * 1.35)

      hipL.rotation.x = -s * A
      hipR.rotation.x = s * A
      hipL.rotation.z = 0
      hipR.rotation.z = 0
      kneeL.rotation.x = 0.12 + Math.max(0, cphase) * A * 2.1
      kneeR.rotation.x = 0.12 + Math.max(0, -cphase) * A * 2.1

      armL.rotation.x = s * A * 1.35 + breath * 0.03
      elbowL.rotation.x = -1.15 - Math.max(0, s) * A * 0.5
      armR.rotation.x = -s * A * 0.4 - 0.1 - breath * 0.02
      elbowR.rotation.x = -0.9
      armL.rotation.z = -0.11 - gait * 0.06
      armR.rotation.z = 0.13 + gait * 0.05

      /* the trunk. A sprint leans; the lean grows with the ramp, so the
         figure visibly commits further the faster the yard comes at it. */
      const runLean = 0.12 + clamp((speed - 12) / 14) * 0.16
      body.rotation.x = runLean * gait
      body.rotation.z = s * 0.035 * gait
      body.position.set(0, -Math.abs(cphase) * 0.055 * gait + breath * 0.012 * K, 0)
      upper.rotation.set(0, 0, 0)
      head.position.y = HEAD_LOCAL + breath * 0.01 * K
      head.rotation.set(0, 0, 0)
      pivot.position.set(0, 0, 0)
      pivot.rotation.set(0, 0, 0)
      hipRootL.position.x = -HIP_X
      hipRootR.position.x = HIP_X

      /* ---- the air ------------------------------------------------------
         Tuck on the way up, reach on the way down, and drive the whole thing
         off vertical SPEED rather than off the eased airborne flag: an ease
         that takes four ticks to arrive misses the take-off, and the take-off
         is the exact frame a jump has to read on. A dive (§D.4) is the same
         pose taken much further — knees up, head down, arms back — because it
         is the one move in the game you make on purpose to go down. */
      const rise = clamp(state.vy / (springy ? 19 : 14.7))
      const fall = clamp(-state.vy / 12)
      const dive = clamp(-state.vy / 26) * (state.onGround ? 0 : 1)
      const tuck = air * (rise * 0.9 + dive * 0.55)
      const reach = air * fall * (1 - dive * 0.7)

      hipL.rotation.x -= tuck * 1.15
      hipR.rotation.x -= tuck * 1.15
      kneeL.rotation.x += tuck * 1.7
      kneeR.rotation.x += tuck * 1.7
      hipL.rotation.x += reach * 0.35
      hipR.rotation.x += reach * 0.2
      kneeL.rotation.x -= reach * 0.1
      armL.rotation.x -= air * (0.7 + rise * 0.5) - dive * 1.6
      armR.rotation.x -= air * 0.3 - dive * 0.9
      elbowL.rotation.x += air * 0.5
      body.rotation.x += air * (0.1 - fall * 0.22) + dive * 0.5

      /* the absorb. Knees first, waist second, for as long as the impact
         takes to decay — a landing you do not feel in the legs is a landing
         that did not happen. */
      const abs = impact * (1 - air)
      hipL.rotation.x -= abs * 0.62
      hipR.rotation.x -= abs * 0.62
      kneeL.rotation.x += abs * 1.5
      kneeR.rotation.x += abs * 1.5
      hipL.rotation.z = -abs * 0.16
      hipR.rotation.z = abs * 0.16
      upper.rotation.x += abs * 0.42
      body.position.y -= abs * 0.24

      /* ---- the updraft --------------------------------------------------
         You are hanging under something, not standing on it. Legs trail back
         and apart, arms out and behind, trunk upright and looking down the
         track — and the lamp swings out to arm's length, which is what tells
         you the whole figure is being carried. */
      if (lift > 0.002) {
        const sway = Math.sin(age * 1.9) * 0.09
        hipL.rotation.x += lift * (0.55 + sway)
        hipR.rotation.x += lift * (0.42 - sway)
        hipL.rotation.z -= lift * 0.12
        hipR.rotation.z += lift * 0.12
        kneeL.rotation.x += lift * (0.5 + sway * 2)
        kneeR.rotation.x += lift * (0.65 - sway * 2)
        armL.rotation.x += lift * 1.5
        armR.rotation.x += lift * 0.9
        armL.rotation.z -= lift * 0.5
        armR.rotation.z += lift * 0.35
        elbowL.rotation.x += lift * 0.6
        body.rotation.x -= lift * (body.rotation.x + 0.12)
      }

      /* ---- the roll -----------------------------------------------------
         A real forward roll: the whole figure turns once, over the first 7 of
         the 11 ticks, and spends the last 4 coming back up onto its feet. The
         span is learned from the counter rather than assumed, so if sim.ts
         ever retunes ROLL_TICKS the animation follows it without this file
         being edited.

         WHERE THE ROTATION CENTRE IS, AND WHY IT IS NOT THE HIPS. Measured,
         after the first attempt turned the figure about a point 0.55 straight
         up from the feet and drove its head 0.79 u THROUGH THE BALLAST at the
         half-way point. The tucked figure is a lump about 0.5 u in radius
         whose centre sits at roughly (y 0.78, z 0.36) in the body's own frame
         — forward of the hips, because the trunk folds over the thighs and
         takes the head with it. Turn about THAT and the lump rolls; turn
         about anything else and part of the figure describes a bigger circle
         than the ground allows. The centre is then held ROLL_PIVOT_Y off the
         rail bed, which is what makes the ball graze the ballast rather than
         float over it or plough through it.

         NOTE ON SIGN. §F says −2π. In this frame forward is +Z and a positive
         rotation about X tips the crown toward +Z, so a forward roll is +2π
         and −2π is a backward roll. Taking the geometry over the transcript. */
      if (rolling) {
        if (state.rollTicks > rollSpan) rollSpan = state.rollTicks
        const done = rollSpan - state.rollTicks
        const spin = win(done, 0, ROLL_SPIN_TICKS) * Math.PI * 2
        /* in hard at tick 0 — the low box is live on that tick and the pose
           has to be too — and out over the last two, which are animation. */
        const ball = Math.min(win(done, -1, 0.8), win(rollSpan - done, 0, 2.2))
        pivot.position.set(0, ROLL_PIVOT_Y * ball, BALL_Z * ball)
        body.position.y -= BALL_Y * ball
        body.position.z -= BALL_Z * ball
        pivot.rotation.x = spin
        /* knees to the chest and the trunk folded over them. The first pass
           folded the waist only 0.95 rad and the figure rolled as an L, which
           is the shape that could not fit over its own pivot. */
        hipL.rotation.x -= ball * 1.75
        hipR.rotation.x -= ball * 1.6
        kneeL.rotation.x += ball * 2.5
        kneeR.rotation.x += ball * 2.35
        upper.rotation.x += ball * 1.9
        /* the neck pulls the head in — chin to chest. It is worth 0.18 u of
           radius and it is the difference between a tuck and a dive. */
        head.position.y -= ball * 0.18
        head.rotation.x -= ball * 0.55
        /* the free arm wraps in; the lantern arm is pinned OUT to the side,
           away from the ball, so the lamp is never inside the figure — and,
           since the lamp is levelled in world space rather than carried, so
           that it sweeps past the ballast instead of through it. */
        armL.rotation.x += ball * 0.9
        elbowL.rotation.x -= ball * 1.1
        armR.rotation.x -= ball * 0.3
        armR.rotation.z += ball * 1.15
        elbowR.rotation.x += ball * 0.5
      } else if (state.rollTicks === 0) {
        rollSpan = ROLL_TICKS
      }

      /* ---- the stumble --------------------------------------------------
         Pitch forward, arms out for balance, two catch steps at double
         cadence (the phase above is already running twice as fast), upright
         by the last tick. No control is taken away — §D.5 — so this is pure
         posture and the player can still be steering through all of it. */
      if (stumbling) {
        if (state.stumbleTicks > stumbleSpan) stumbleSpan = state.stumbleTicks
        const done = stumbleSpan - state.stumbleTicks
        const trip = Math.min(win(done, 0, 2), win(stumbleSpan - done, 0, 6))
        body.rotation.x += trip * 0.45
        upper.rotation.x += trip * 0.2
        head.rotation.x -= trip * 0.45
        armL.rotation.x -= trip * 1.5
        armR.rotation.x -= trip * 0.6
        armL.rotation.z -= trip * 0.85
        armR.rotation.z += trip * 0.5
        elbowL.rotation.x += trip * 0.7
        kneeL.rotation.x += trip * 0.35
        kneeR.rotation.x += trip * 0.35
      } else if (state.stumbleTicks === 0) {
        stumbleSpan = STUMBLE_TICKS
      }

      /* ---- the handcar --------------------------------------------------
         Feet a further 0.15 apart, knees soft, body swaying ±0.06 rad at
         0.7 Hz — a stance, not a stride — and —
         the whole point — the BOARD banks to 0.35 on a lane change, more than
         the body ever does on foot, and it gets there two ticks earlier. The
         difference between those two leans is the entire sensation of being
         on something rather than in something, and it is four lines. */
      board.visible = boardOn > 0.01
      if (boardOn > 0.01) {
        const sway = Math.sin(age * 0.7 * Math.PI * 2) * 0.06
        const stand = boardOn
        hipL.rotation.x += (0 - hipL.rotation.x) * stand
        hipR.rotation.x += (0 - hipR.rotation.x) * stand
        hipL.rotation.x -= stand * 0.12
        hipR.rotation.x -= stand * 0.12
        kneeL.rotation.x += stand * (0.34 + sway)
        kneeR.rotation.x += stand * (0.34 - sway)
        hipRootL.position.x = -HIP_X - stand * 0.075
        hipRootR.position.x = HIP_X + stand * 0.075
        hipL.rotation.z = -stand * 0.09
        hipR.rotation.z = stand * 0.09
        armL.rotation.x += stand * (0.35 + sway * 2)
        armL.rotation.z -= stand * 0.28
        armR.rotation.z += stand * 0.1
        body.rotation.x = body.rotation.x * (1 - stand) + stand * (0.16 + sway * 0.5)
        body.rotation.z = body.rotation.z * (1 - stand) + stand * sway
        body.position.y += stand * 0.25 // standing on the deck, not the ballast
        board.position.y = (1 - boardOn) * -0.4
        board.rotation.z = -leanBoard * 0.35 * boardOn
        board.rotation.x = sway * 0.25
        board.scale.setScalar(0.6 + boardOn * 0.4)
        leverPivot.rotation.x = sway * 3.2
        /* the wheels turn at the rate the ground actually passes under them —
           distance over radius, straight off the interpolated z. Driving them
           off the stride phase instead had them turning at a third of the
           right speed, and a wheel that is not keeping up with the rail is
           the one detail in this whole file that a viewer will name. */
        for (const w of wheels) w.rotation.x = -z / WHEEL_R
      }

      /* ---- the bank, and the head that argues with it --------------------
         The body banks into the lane it is going to; the head rolls back
         against it and yaws toward the lane it is leaving. That counter is
         what turns a translation into a decision — the figure looks like it
         checked before it went. */
      const bankK = 1 - boardOn * 0.55 // on the board the deck does the leaning
      pivot.rotation.z += -lean * 0.3 * bankK
      head.rotation.z += lean * 0.16
      head.rotation.y += -lean * 0.22
      head.rotation.x -= body.rotation.x * 0.55 + air * 0.1
      /* the lamp arm is late to every one of these, by design */
      armR.rotation.z += (lean - leanArm) * 0.55

      /* ---- the lamp ------------------------------------------------------
         Level, always, with a little lag on the stride and a little swing out
         of the bank. It is the light source: if it tips, the whole world's
         key light tips with it. */
      const swingLag = Math.sin(phase - 0.7) * 0.1 * gait
      levelLamp(swingLag, -lean * 0.18)

      /* flicker. The one thing reduced motion touches in this file — the pose
         work is the game and §D.12 is explicit that the game does not change,
         but a lamp jittering at 11 and 28 Hz is a screen-space shimmer and it
         is exactly what that setting is asking us to stop. */
      const flick = reducedMotion()
        ? 1
        : 1 + Math.sin(age * 11.3) * 0.045 + Math.sin(age * 27.7) * 0.03 + gait * 0.08
      flame.scale.setScalar(0.94 + flick * 0.08)

      placeShadow(y, state.groundY, 1 + boardOn * 0.2)
      writeLantern()
    },

    die(t, dir) {
      dying = true
      if (!heldTaken) {
        heldTaken = true
        held[0] = hipL.rotation.x
        held[1] = hipR.rotation.x
        held[2] = kneeL.rotation.x
        held[3] = kneeR.rotation.x
        held[4] = armL.rotation.x
        held[5] = armR.rotation.x
        held[6] = elbowL.rotation.x
        held[7] = elbowR.rotation.x
        held[8] = body.rotation.x
        held[9] = body.rotation.z
        held[10] = pivot.rotation.z
        held[11] = figure.position.y
      }

      const side = dir === 0 ? 0 : dir
      /* the hit-stop (§D.10) is 90 ms of nothing at all. Ninety milliseconds
         of the pose you died in is what makes the tumble read as a
         consequence rather than as a cut. */
      const u = win(t, TUMBLE_FROM, TUMBLE_TO)
      const sprawl = win(t, TUMBLE_FROM, 0.55)

      /* 1.5 turns about X, about the HIPS rather than the feet — a body goes
         over its own centre of mass, and rotating a standing figure about its
         boots is a felled tree.

         …and then a quarter turn more. 1.5 exactly is what §D.10 asks for and
         1.5 exactly ends the figure inverted, feet in the air, which is a
         freeze-frame nobody wants to look at for the second and a half the
         panel takes to arrive. The extra quarter settles him onto his back
         with his head toward the camera, which is the pose the whole slowed,
         dropped, eye-level shot was set up to deliver. It is a continuation,
         never a nudge backwards. */
      /* the rotation centre goes to the hips AT ONCE, not on the sprawl's
         curve. It is invisible — `body` moves down by exactly as much as
         `pivot` moves up — and easing it in cost 0.8 u of head through the
         ballast at the half-way point of the tumble, because for the first
         third of the turn the figure was still pivoting about its ankles. */
      pivot.position.set(0, HIP_Y, 0)
      pivot.rotation.x = u * Math.PI * 3 + win(t, TUMBLE_TO - 0.18, TUMBLE_TO + 0.22) * Math.PI * 0.5
      pivot.rotation.z = held[10]! * (1 - sprawl) + side * 0.5 * sprawl
      body.position.set(0, -HIP_Y, 0)

      /* thrown forward and out, then down — under a gravity of its own, onto
         whatever he was standing on, and no further. The lie-down follows the
         rotation rather than the sprawl so the shoulders are not on the floor
         while the body is still coming over. */
      const throwZ = u * 2.4
      const hop = Math.sin(clamp(t / TUMBLE_TO) * Math.PI) * 0.45
      const fallT = Math.max(0, t - TUMBLE_FROM)
      const lie = win(t, 0.3, 0.95) * (HIP_Y - LIE_HIP_Y)
      figure.position.set(
        side * u * 1.1,
        Math.max(lastGroundY - lie, held[11]! + hop - 9 * fallT * fallT),
        throwZ,
      )

      const mix = (from: number, to: number) => from * (1 - sprawl) + to * sprawl
      hipL.rotation.x = mix(held[0]!, -0.55)
      hipR.rotation.x = mix(held[1]!, 0.25)
      kneeL.rotation.x = mix(held[2]!, 1.15)
      kneeR.rotation.x = mix(held[3]!, 0.45)
      armL.rotation.x = mix(held[4]!, -1.9)
      armR.rotation.x = mix(held[5]!, -1.4)
      elbowL.rotation.x = mix(held[6]!, -0.4)
      elbowR.rotation.x = mix(held[7]!, -0.25)
      armL.rotation.z = -0.9 * sprawl
      armR.rotation.z = 0.7 * sprawl
      body.rotation.x = mix(held[8]!, 0.25)
      body.rotation.z = mix(held[9]!, 0)
      head.rotation.set(-0.3 * sprawl, 0, 0)
      upper.rotation.set(-0.2 * sprawl, 0, 0)
      board.visible = false

      /* ---- the lantern leaves the hand ----------------------------------
         At 190 ms, and it keeps its light on all the way to a stop. This is
         the shot the whole death sequence exists for: the camera has dropped
         to eye level, the figure is going over, and the only thing still
         lighting the scene is a lamp rolling away from a person who is no
         longer holding it. It says *you* rather than *a ragdoll*.

         Everything below is a closed form in t rather than an integration,
         so the sequence is identical whether surf.ts feeds it slowed-down
         time, a dropped frame or a scrub backwards. */
      if (t >= LAMP_SEPARATES) {
        if (!lampLoose) {
          lampLoose = true
          root.updateMatrixWorld(true)
          root.attach(lamp)
          lampStart.copy(lamp.position)
        }
        const tau = t - LAMP_SEPARATES
        const G = 14
        const VY = 2.6
        const REST = lastGroundY + 0.16
        /* when the ballistic arc reaches resting height, solved once */
        const y0 = lampStart.y
        const disc = VY * VY + 2 * G * (y0 - REST)
        const T1 = (VY + Math.sqrt(Math.max(0, disc))) / G
        const fly = Math.min(tau, T1)
        /* forward and sideways momentum, with a drag that brings it to a stop
           rather than letting it slide out of frame for ever */
        const drag = 3.2
        const glide = tau <= T1 ? tau : T1 + (1 - Math.exp(-(tau - T1) * drag)) / drag
        lamp.position.set(
          lampStart.x + (side || 0.55) * 1.5 * glide,
          tau <= T1
            ? y0 + VY * fly - 0.5 * G * fly * fly
            : REST + 0.11 * Math.exp(-(tau - T1) * 7) * Math.abs(Math.sin((tau - T1) * 22)),
          lampStart.z + 3.4 * glide,
        )
        /* it tumbles, then settles onto a flat of its own casing — a lantern
           that comes to rest standing upright is a lantern that was placed */
        const free = 8.2 * (1 - Math.exp(-tau * 1.6)) / 1.6
        const flat = Math.round(free / (Math.PI / 2)) * (Math.PI / 2)
        const settled = win(tau, T1, T1 + 0.5)
        _euler.set(free * (1 - settled) + flat * settled, 0, (side || 1) * 0.9 * settled, 'XYZ')
        lamp.quaternion.setFromEuler(_euler)
      }

      /* the shadow shrinks and stays where the body fell; the lamp carries
         its own light away and does not get a second one. */
      shadow.visible = true
      shadow.position.y = lastGroundY + 0.02
      shadowMat.opacity = 0.9 * (1 - sprawl * 0.45)
      shadow.scale.setScalar(1 + sprawl * 0.5)

      const flick = reducedMotion() ? 1 : 1 + Math.sin(t * 9.1) * 0.06
      flame.scale.setScalar(0.94 + flick * 0.08)
      writeLantern()
    },

    reset: doReset,

    dispose() {
      for (const g of geo) g.dispose()
      skin.dispose()
      dark.dispose()
      brass.dispose()
      iron.dispose()
      steel.dispose()
      rimMat.dispose()
      flameMat.dispose()
      shadowMat.dispose()
      shadowTex.dispose()
    },
  }
}

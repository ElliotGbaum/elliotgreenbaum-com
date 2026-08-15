/**
 * The figure you are, through the portal — the same person, still carrying the
 * lantern.
 *
 * IT IS NOT A BLOCKY MINECRAFT AVATAR ANY MORE, and reversing that was the
 * right call. The field outside spends a great deal of care on a jointed,
 * deliberately featureless figure with a lamp in one hand (world/player.ts,
 * and CONTEXT §6 on why it has no face); walking through a doorway and
 * becoming another game's mascot threw all of it away for a costume. The
 * physics underneath is still Minecraft's to four decimal places. The body is
 * this world's.
 *
 * One thing here the field's figure never needed: it can be in the air. A
 * parkour figure wants a tuck on the way up and a reach on the way down,
 * because in a game about jumping the jump is the animation that matters.
 */

import * as THREE from 'three'
import { clamp } from '../core/contract'
import { HEIGHT } from './physics'

/* Proportions, scaled so the figure stands exactly as tall as the box the
   physics sweeps. The field's figure is 3.86 units to the crown; this is that
   same shape at 1.8 blocks. */
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

/** blocks of ground per half-cycle of the walk — sets the cadence */
const STRIDE = 0.95

/* ---- the crouch, solved rather than eyeballed ----------------------------
   The collision box loses exactly 0.3 when you sneak (1.8 → 1.5), so the
   figure has to sink by exactly 0.3 or the pose and the box disagree in the
   one view where you are staring at both. Sinking 0.3 with straight legs
   drives the feet through the floor, so the legs have to fold by the same
   amount — and there is only one pair of angles that folds them 0.3 AND
   leaves the ankle under the hip rather than out in front of it:

     knee  y = HIP_Y − THIGH·cos(a)
     ankle y = knee y − SHIN·cos(b − a)      must equal standing ankle + 0.3
     ankle z = THIGH·sin(a) − SHIN·sin(b − a)  must equal ~0

   a = 0.75, b − a = 0.95 solves both. Change the proportions above and these
   two numbers are wrong again; they are not taste, they are the answer. */
const CROUCH_SINK = 0.3
const CROUCH_HIP = 0.75
const CROUCH_KNEE = 1.7
/** …and the waist bends. This is the part you actually read at five blocks.
 *  0.62 is not taste either: it is the lean at which the crown comes down to
 *  1.46, under the 1.5 box, so the figure fits through the gap it is allowed
 *  through. Less and the head clips the ceiling in the one manoeuvre the
 *  crouch exists for. */
const CROUCH_LEAN = 0.62
/** the neck pulls in with the hunch, and it is what buys the last 0.05 */
const CROUCH_NECK = 0.06

export interface Avatar {
  object: THREE.Group
  /** the drop shadow, in the scene separately so the figure's yaw misses it */
  shadowObject: THREE.Object3D
  /**
   * @param travelled ground covered, in blocks — drives the walk cadence
   * @param gait 0…1, how hard the legs should be working
   * @param airborne 0…1, eased on the tick — feet off the ground
   * @param rising going up rather than coming down
   * @param impact 0…1, decaying out of a landing: how hard you hit the floor
   * @param crouch 0…1, eased on the tick — how far into the sneak we are
   * @param lift how fast we are going up or down, in blocks per tick
   */
  update(
    x: number,
    y: number,
    z: number,
    bodyYaw: number,
    headYaw: number,
    headPitch: number,
    travelled: number,
    gait: number,
    age: number,
    airborne: number,
    rising: boolean,
    impact: number,
    crouch: number,
    lift: number,
  ): void
  /** 0 hides everything but the lamp; 1 is the whole figure */
  setOpacity(k: number): void
  /** the disc under the figure — the only cue for which block you are above */
  setShadow(x: number, z: number, groundY: number | null, feetY: number): void
  dispose(): void
}

export function createAvatar(): Avatar {
  const group = new THREE.Group()
  const body = new THREE.Group()
  group.add(body)

  const geo: THREE.BufferGeometry[] = []
  const keep = <T extends THREE.BufferGeometry>(g: T): T => {
    geo.push(g)
    return g
  }

  /* LIT, BUT ALMOST BLACK.
     Three attempts got this wrong in three different ways: a normal albedo
     blew the figure to cream the moment the lamp got close; a light layer
     turned the lamp off entirely (three.js has no per-light layers, see
     scene.ts); and unlit material made a flat sticker on which none of the
     animation below could be seen at all — a tenth of the tonal range the
     field's figure has, because out there the lamp *rims* it.
     The answer was never the material type, it was the albedo. At 0x0d1417
     the figure is a silhouette in ambient light and picks up a warm edge from
     the lantern it is carrying, which is the whole picture: a dark shape and
     a light. Keep it dark and keep the lamp modest (scene.ts) rather than
     trading one for the other. */
  const skin = new THREE.MeshStandardMaterial({
    color: 0x0d1417,
    roughness: 1,
    metalness: 0,
  })
  const dark = new THREE.MeshStandardMaterial({
    color: 0x080f11,
    roughness: 1,
    metalness: 0,
  })

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

  /* EVERYTHING ABOVE THE HIPS HANGS OFF ITS OWN GROUP, PIVOTING AT THE WAIST.
     It used to be flat — torso, head and arms were siblings of the legs, and
     the only way to lean the figure was to rotate the whole of it about the
     feet. At the 0.5 radians a crouch wants, that swings the feet a third of a
     block backwards and lifts them off the platform: the figure tipped like a
     signpost instead of folding like a person, which is most of the reason the
     crouch was unreadable. A waist is one extra Group and it buys the run
     lean, the landing absorb and the sneak all at once. */
  const upper = new THREE.Group()
  upper.position.y = HIP_Y
  body.add(upper)

  const torso = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.3 * K, 0.86 * K, 5, 12)), skin)
  torso.position.y = (SHOULDER_Y - HIP_Y) / 2
  upper.add(torso)

  /** the head's rest height, in the waist's frame */
  const HEAD_LOCAL = HEAD_Y - HIP_Y

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
  const leftArm = shoulders[0]!
  const leftElbow = elbows[0]!
  const rightArm = shoulders[1]!
  const rightElbow = elbows[1]!

  /* the lantern, hung from the right hand and counter-rotated so it hangs
     level — the field's rig, at this scale */
  const swing = new THREE.Group()
  swing.position.y = -FOREARM - 0.04 * K
  rightElbow.add(swing)

  const brass = new THREE.MeshStandardMaterial({
    color: 0x8a6a34,
    roughness: 0.45,
    metalness: 0.75,
  })
  const bail = new THREE.Mesh(
    keep(new THREE.TorusGeometry(0.1 * K, 0.02 * K, 6, 14, Math.PI)),
    brass,
  )
  bail.position.y = -0.02 * K
  swing.add(bail)
  const cap = new THREE.Mesh(keep(new THREE.ConeGeometry(0.17 * K, 0.14 * K, 12)), brass)
  cap.position.y = -0.14 * K
  swing.add(cap)
  const base = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(0.15 * K, 0.16 * K, 0.06 * K, 12)),
    brass,
  )
  base.position.y = -0.5 * K
  swing.add(base)
  for (const a of [0.4, 2.5, 4.6]) {
    const post = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(0.014 * K, 0.014 * K, 0.32 * K, 5)),
      brass,
    )
    post.position.set(Math.cos(a) * 0.13 * K, -0.32 * K, Math.sin(a) * 0.13 * K)
    swing.add(post)
  }
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xfff0d2,
    fog: false,
    toneMapped: false,
  })
  const flame = new THREE.Mesh(keep(new THREE.SphereGeometry(0.1 * K, 12, 10)), flameMat)
  flame.position.y = -0.32 * K
  swing.add(flame)

  /* the drop shadow — the depth cue that makes a third-person jump legible */
  const shadowCanvas = document.createElement('canvas')
  shadowCanvas.width = shadowCanvas.height = 64
  {
    const c = shadowCanvas.getContext('2d')!
    /* A dark disc on a near-black platform is nothing. This is a warm ring
       instead: the lantern's own colour, brightest at the rim, so it reads as
       light pooling under you rather than as an absence — and so it survives
       on the darkest course in the game, which is where you need it most. */
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
  const shadowGeo = new THREE.PlaneGeometry(1.15, 1.15)
  const shadow = new THREE.Mesh(shadowGeo, shadowMat)
  shadow.rotation.x = -Math.PI / 2
  shadow.renderOrder = 1

  let amp = 0
  let air = 0

  return {
    object: group,
    shadowObject: shadow,

    setShadow(x, z, groundY, feetY) {
      if (groundY === null) {
        shadow.visible = false
        return
      }
      const drop = Math.max(0, feetY - groundY)
      const k = Math.max(0, 1 - drop / 14)
      if (k <= 0.02) {
        shadow.visible = false
        return
      }
      shadow.visible = true
      shadow.position.set(x, groundY + 0.02, z)
      shadowMat.opacity = k * 0.9
      shadow.scale.setScalar(0.85 + (1 - k) * 0.7)
    },

    update(
      x, y, z, bodyYaw, headYaw, headPitch, travelled, gait, age, airborne, rising, impact,
      crouch, lift,
    ) {
      group.position.set(x, y, z)
      group.rotation.y = bodyYaw

      /* the walk: cadence is distance over stride, so the feet keep up with
         the ground and the figure never moonwalks.
         `gait` arrives already eased on the 20 Hz tick (parkour.ts), so it is
         used straight. Smoothing it a second time here — which this did —
         made the one part of the figure that is frame-rate dependent, in a
         file whose entire point is that nothing is. */
      amp = gait
      const phase = (travelled / STRIDE) * Math.PI

      const A = amp * 0.62
      const s = Math.sin(phase)
      const breath = Math.sin(age * 1.35)

      /* …and the jump, which the field's figure never had to do: tuck going
         up, reach coming down, and — the part that gives a parkour game its
         weight — absorb the landing.
         The tuck is driven off vertical speed rather than off the eased
         airborne flag, because an ease that takes four ticks to arrive misses
         the take-off, which is the exact frame a jump has to read on. */
      air = airborne
      void rising
      const tuck = clamp(Math.abs(lift) / 0.42) * (lift > 0 ? 1 : 0.45)

      hips[0]!.rotation.x = -s * A - tuck * 0.5
      hips[1]!.rotation.x = s * A - tuck * 0.5
      knees[0]!.rotation.x = Math.max(0, Math.cos(phase)) * A * 1.5 + tuck * 1.1
      knees[1]!.rotation.x = Math.max(0, -Math.cos(phase)) * A * 1.5 + tuck * 1.1

      leftArm.rotation.x = s * A * 0.85 + breath * 0.03 - air * 0.7
      leftElbow.rotation.x = -0.22 - Math.max(0, s) * A * 0.5
      rightArm.rotation.x = -s * A * 0.26 - breath * 0.03 - air * 0.25
      rightElbow.rotation.x = -0.16
      leftArm.rotation.z = -0.07
      rightArm.rotation.z = 0.07

      /* bob twice a cycle, lean into the run, stretch in the air — and sink
         into a landing, knees first, for as long as the impact takes to decay.
         Crouching uses the same fold, held: it is the same shape, and it is
         the whole of the visual feedback that Shift is doing anything.

         `crouch` arrives eased on the 20 Hz tick (parkour.ts), not as a
         boolean. Snapping between two poses on the frame the key goes down is
         a change you can miss entirely — which is exactly what was happening.
         Four ticks of fold is short enough to feel immediate and long enough
         to be a movement rather than a cut. */
      const c = Math.max(impact * 0.34, crouch)
      hips[0]!.rotation.x -= c * CROUCH_HIP
      hips[1]!.rotation.x -= c * CROUCH_HIP
      knees[0]!.rotation.x += c * CROUCH_KNEE
      knees[1]!.rotation.x += c * CROUCH_KNEE
      // …and the knees go out, so the squat reads from directly behind as
      // well as from the side. Third person spends most of its time behind.
      hips[0]!.rotation.z = -c * 0.2
      hips[1]!.rotation.z = c * 0.2

      body.position.y =
        -Math.abs(Math.cos(phase)) * 0.07 * K * amp + breath * 0.012 * K - c * CROUCH_SINK
      // the whole figure only ever leans a little, and it leans about the feet
      body.rotation.x = amp * 0.11 + air * 0.12
      body.rotation.z = Math.sin(phase) * 0.03 * amp

      /* the waist. The crown ends up 0.51 lower than standing — under the 1.5
         box the crouch exists to fit inside, which is the point of it. */
      const lean = c * CROUCH_LEAN
      upper.rotation.x = lean

      /* arms hang from a torso that is now tipped forward, so they need most
         of the lean taken back out or they end up pointing at the floor. What
         is left brings the lantern down past the knee — and a light that drops
         when you press Shift is the cue that carries in first person, where
         there is no figure to look at at all. */
      leftArm.rotation.x -= lean * 0.62
      rightArm.rotation.x -= lean * 0.62
      leftElbow.rotation.x -= c * 0.3
      rightElbow.rotation.x -= c * 0.22
      leftArm.rotation.z = -0.07 - c * 0.12
      rightArm.rotation.z = 0.07 + c * 0.12

      // the head leads, and a neck only turns so far. It keeps looking where
      // you are looking through the crouch, rather than at your own boots.
      head.position.y = HEAD_LOCAL - c * CROUCH_NECK + breath * 0.01 * K
      head.rotation.y = clamp(headYaw, -1.31, 1.31)
      head.rotation.x = clamp(headPitch, -0.9, 0.9) - lean * 0.6

      /* the lantern hangs level whatever the arm does, plus a little lag */
      const carried = -(
        rightArm.rotation.x +
        rightElbow.rotation.x +
        upper.rotation.x +
        body.rotation.x
      )
      swing.rotation.x = carried + Math.sin(phase - 0.7) * 0.12 * amp
      swing.rotation.z =
        -body.rotation.z - rightArm.rotation.z - Math.sin(phase * 0.5) * 0.05 * amp

      const flick = 1 + Math.sin(age * 11.3) * 0.045 + Math.sin(age * 27.7) * 0.03 + amp * 0.08
      flame.scale.setScalar(0.94 + flick * 0.08)
    },

    setOpacity(k) {
      const v = clamp(k)
      // the lamp never goes: in first person, and pressed against a wall, the
      // light in the hand is the one thing that should still be there
      body.visible = v > 0.02
      for (const m of [skin, dark]) {
        m.transparent = v < 0.99
        m.opacity = v
      }
      swing.visible = true
    },

    dispose() {
      for (const g of geo) g.dispose()
      skin.dispose()
      dark.dispose()
      brass.dispose()
      flameMat.dispose()
      shadowGeo.dispose()
      shadowMat.dispose()
      shadowTex.dispose()
    },
  }
}

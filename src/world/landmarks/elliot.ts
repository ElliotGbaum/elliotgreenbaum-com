/**
 * Elliot — the other person in the field.
 *
 * A second figure, standing off to the left of the path between the spawn and
 * the projector, carrying a lantern of his own, with a nametag over his head.
 * Walk up and he turns to face you; press E and the field hands you a panel
 * to talk to him in (src/ui/chat.ts). What answers is an AI that has been
 * given Elliot's own notes about himself (server/persona.ts) — the nametag,
 * the greeting and the panel all say so, because a visitor must never be
 * left to wonder whether they are talking to a script, a person, or a model.
 *
 * WHY HE IS BUILT LIKE THE PLAYER. The visitor's figure is deliberately
 * nobody — a jointed armature with no face — so that anyone can read it as
 * themselves (see the header of src/world/player.ts). Elliot is built from
 * the same vocabulary, and on purpose: two different kinds of figure in one
 * field would read as two different games. What makes this one somebody is
 * not a face, it is the nametag, and the fact that he is the one who stands
 * still and turns to look at you. The armature is duplicated rather than
 * imported from player.ts, because the contract is the only module a landmark
 * is allowed to share — the same rule the two signs keep between themselves.
 *
 * WHY HE CARRIES A LANTERN. The field is dark and the lantern is the concept:
 * you can see what you bring light to. A second lantern across the field is a
 * second thing you can see from anywhere, which is the whole of how a visitor
 * finds him at night without a compass pointing at him. It also makes him the
 * one landmark that is lit the same way you are, which is the visual argument
 * that he is a person and not a machine. One light per landmark, as always.
 *
 * WHERE HE STANDS, and why. Off the centre line for the reason the signs are
 * (see the long note in gate.ts): the film's watching shot is a cone out of a
 * camera at z = 50 and nothing may stand in it. At x = −16, z = 28 he is
 * about 41° off that shot's axis against a half-frame of 19°, clear of the
 * picture on every window shape. From the spawn he is twenty degrees to the
 * left, lit, with his name over his head — findable without being in the
 * way of the one thing the field is for.
 */

import * as THREE from 'three'
import { PALETTE, clamp, angleDelta, type Landmark, type LandmarkContext } from '../../core/contract'

const EX = -16
const EZ = 28

/** where the visitor's figure starts, so Elliot can face it before anyone arrives */
const SPAWN_Z = 46

/**
 * Which way he looks at rest — toward the spawn, so the first thing you see
 * is his front and his tag rather than a shoulder.
 */
const FACE_Y = Math.atan2(-EX, SPAWN_Z - EZ)
/** his facing as a vector, for putting the talking spot in front of him */
const FACE = new THREE.Vector3(Math.sin(FACE_Y), 0, Math.cos(FACE_Y))
/** …and his right-hand axis, for framing the conversation off the pair */
const RIGHT = new THREE.Vector3(Math.cos(FACE_Y), 0, -Math.sin(FACE_Y))

/* ---------------- proportions ----------------
   The player's, exactly (src/world/player.ts), so the two figures are the
   same height standing next to each other. A conversation between a person
   and a doll is not a conversation. */
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

/** the lantern's light at night. Dimmer than the visitor's: it is a marker
 *  you can see across the field, not the light you are working by */
const LAMP_BASE = 34
const GLOW_SIZE = 2.6

/** how fast he turns to face you — slower than the player, because he is
 *  turning his head to look, not swinging round to walk */
const TURN_RATE = 3.2

/** the same tight falloff the player's halo uses, for the same reason */
function glowTexture(): THREE.CanvasTexture {
  const S = 128
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const c = cv.getContext('2d')!
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

/**
 * The nametag. A sprite, so it always faces the camera and reads from every
 * side, drawn once to a canvas in the field's own type: the name in the
 * display serif, and under it, in the mono every label out here uses, what
 * he is — because "Elliot" over the head of a figure in a field with Elliot's
 * name on the door would otherwise claim to be him. It says AI before you have
 * pressed anything, and that is the first of three places it is said.
 */
function tagTexture(): THREE.CanvasTexture {
  const S = (window.devicePixelRatio || 1) >= 2 ? 3 : 2
  const W = 512
  const H = 200
  const cv = document.createElement('canvas')
  cv.width = W * S
  cv.height = H * S
  const c = cv.getContext('2d')!
  c.scale(S, S)

  c.textAlign = 'center'
  c.textBaseline = 'middle'

  // a soft dark halo behind the words, not a panel — the badge and the
  // compass label do the same with text-shadow, and a rectangle hanging in
  // the field is a rectangle
  c.shadowColor = 'rgba(0,0,0,0.95)'
  c.shadowBlur = 18
  c.fillStyle = '#F3E9D2'
  c.font = '600 84px "Hoefler Text", "Iowan Old Style", Palatino, Georgia, serif'
  c.fillText('Elliot', W / 2, H / 2 - 26)
  c.fillText('Elliot', W / 2, H / 2 - 26)

  c.shadowBlur = 10
  c.fillStyle = PALETTE.amberLitCss
  c.font = '500 26px ui-monospace, "SF Mono", Menlo, monospace'
  c.letterSpacing = '6px'
  c.fillText('AI · ASK ME ANYTHING', W / 2, H / 2 + 52)

  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

export interface Elliot extends Landmark {
  /** where the visitor's figure stands to talk — in front of him, close */
  readonly talkSpot: THREE.Vector3
  /** the point the visitor's figure turns to face once it is there */
  readonly facePoint: THREE.Vector3
  /**
   * He is being talked to: keep facing the talking spot rather than tracking
   * the figure, and let the lantern hang still. Off again when the panel
   * closes.
   */
  setEngaged(on: boolean): void
  /**
   * The two-shot the conversation is watched from, framed for this viewport.
   * A tall window gets the pair from further back and lower, because the
   * panel is going to take the bottom of the frame and the figures have to
   * stay above it.
   */
  talkVantage(aspect: number): { position: THREE.Vector3; lookAt: THREE.Vector3; fov: number }
}

export function createElliot(): Elliot {
  const group = new THREE.Group()
  group.position.set(EX, 0, EZ)
  group.rotation.y = FACE_Y

  const owned: Array<{ dispose(): void }> = []
  const keep = <T extends { dispose(): void }>(g: T): T => {
    owned.push(g)
    return g
  }

  /* ================= the figure =================
     The player's armature, standing. A slightly warmer skin than the
     visitor's grey-blue — the one hint that this figure is somebody — and
     the same dark for the feet. */
  const skin = keep(
    new THREE.MeshStandardMaterial({ color: 0x5c5650, roughness: 0.84, metalness: 0.06 }),
  )
  const dark = keep(new THREE.MeshStandardMaterial({ color: 0x1e2a2d, roughness: 0.9, metalness: 0.1 }))

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

  // legs, planted: a little apart, one knee a touch softer than the other,
  // which is what standing looks like as opposed to being stood up
  for (const side of [-1, 1]) {
    const hip = new THREE.Group()
    hip.position.set(side * HIP_X, HIP_Y, 0)
    body.add(hip)
    const thigh = limb(hip, THIGH, 0.155)
    thigh.rotation.z = side * -0.06
    thigh.rotation.x = side > 0 ? 0.04 : -0.03
    const knee = limb(thigh, SHIN, 0.13)
    knee.position.y = -THIGH
    knee.rotation.x = side > 0 ? 0.06 : 0.02
    const foot = new THREE.Mesh(keep(new THREE.BoxGeometry(0.3, 0.13, 0.52)), dark)
    foot.position.set(0, -SHIN + 0.02, 0.11)
    knee.add(foot)
  }

  const arms: THREE.Group[] = []
  const elbows: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const anchor = new THREE.Group()
    anchor.position.set(side * SHOULDER_X, SHOULDER_Y, 0)
    body.add(anchor)
    const upper = limb(anchor, UPPER_ARM, 0.125)
    const elbow = limb(upper, FOREARM, 0.11)
    elbow.position.y = -UPPER_ARM
    upper.rotation.z = side * -0.09
    arms.push(upper)
    elbows.push(elbow)
  }
  const leftArm = arms[0]!
  const leftElbow = elbows[0]!
  const rightArm = arms[1]!
  const rightElbow = elbows[1]!

  // the free hand rests; the lantern hand hangs a little forward of the hip
  leftArm.rotation.x = 0.05
  leftElbow.rotation.x = -0.28
  rightArm.rotation.x = -0.12
  rightElbow.rotation.x = -0.14

  /* ================= the lantern =================
     The player's, hung from the right hand and counter-rotated to hang level.
     It is the light you find him by. */
  const swing = new THREE.Group()
  swing.position.y = -FOREARM - 0.04
  rightElbow.add(swing)

  const brass = keep(new THREE.MeshStandardMaterial({ color: 0x8a6a34, roughness: 0.45, metalness: 0.75 }))
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

  const FLAME_LIT = new THREE.Color(0xfff0d2)
  const FLAME_COLD = new THREE.Color(0x4a4034)
  const flameMat = keep(new THREE.MeshBasicMaterial({ color: 0xfff0d2, fog: false, toneMapped: false }))
  const flame = new THREE.Mesh(keep(new THREE.SphereGeometry(0.1, 12, 10)), flameMat)
  flame.position.y = -0.32
  swing.add(flame)

  const glowTex = keep(glowTexture())
  const glowMat = keep(
    new THREE.SpriteMaterial({
      map: glowTex,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      fog: false,
    }),
  )
  const glow = new THREE.Sprite(glowMat)
  glow.scale.setScalar(GLOW_SIZE)
  glow.position.y = -0.32
  swing.add(glow)

  const lamp = new THREE.PointLight(PALETTE.glow, LAMP_BASE, 46, 1.6)
  lamp.position.y = -0.32
  swing.add(lamp)

  /* ================= the nametag ================= */
  const tagTex = keep(tagTexture())
  const tagMat = keep(
    new THREE.SpriteMaterial({
      map: tagTex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      fog: true,
    }),
  )
  const tag = new THREE.Sprite(tagMat)
  // 512 × 200 texels, drawn at world size — the name is about a head and a
  // half tall from where you approach, and it sits clear above the head
  tag.scale.set(5.6, 5.6 * (200 / 512), 1)
  tag.position.set(0, HEAD_Y + 1.85, 0)
  group.add(tag)

  /* ---------------- state ---------------- */
  let daylight = 0
  let engaged = false
  let yaw = FACE_Y
  let yawTarget = FACE_Y

  const origin = new THREE.Vector3(EX, 0, EZ)
  const talkSpot = origin.clone().addScaledVector(FACE, 3.6)
  const anchor = origin.clone().addScaledVector(FACE, 5.5)
  const facePoint = new THREE.Vector3(EX, 0, EZ)

  /** turned to face a point on the ground, the long way round never */
  function lookToward(p: THREE.Vector3): void {
    const dx = p.x - EX
    const dz = p.z - EZ
    if (Math.hypot(dx, dz) < 0.5) return
    yawTarget = Math.atan2(dx, dz)
  }

  return {
    id: 'elliot',
    title: 'Elliot',
    object: group,
    anchor,
    /* Wide, the way the projector's is: the line at the bottom of the screen
       should be up before you have to decide whether to stop. He turns to
       look at you at the same distance, which is the other half of the
       invitation. */
    radius: 12,
    /* One sentence, the same from thirty units out as from three, and it
       carries the disclosure in the half after the dash. main.ts uses this
       string as the standing line once the film has been watched, so it has
       to read as an instruction from across the field as well as a label at
       his feet. */
    prompt: 'Walk over to Elliot and ask him anything — an AI answers with his notes',
    again: 'Ask Elliot something else',
    verb: 'talk',
    verbAgain: 'talk again',
    /* The badge hangs over his chest rather than over his head, because the
       nametag is over his head and two labels stacked on one figure is a
       figure wearing a menu. 2.9 puts PRESS [E] TO TALK across his shoulders,
       under the name, pointing at the person. */
    reach: new THREE.Vector3(EX, 2.9, EZ),
    reachRadius: 8,
    /* the whole figure, and the tag: you point at a person, not at an arm,
       and the name over his head is the most likely thing to be pointed at */
    hitTargets: [body, tag],
    /* Standing next to somebody is not talking to them. A conversation is a
       thing you start — press E, or tap him — never a thing that happens to
       you for walking past. Same argument the projector makes. */
    autoActivate: false,

    talkSpot,
    facePoint,
    talkVantage(aspect: number) {
      const k = clamp((1.0 - aspect) / 0.55)
      /* THE PANEL DECIDES THE FRAMING. On a window it is a column down the
         right third, so the shot is taken from his side of the pair — that
         puts him on the LEFT of frame with the visitor's figure beside him,
         and the look-at is nudged toward the visitor so the pair sit in the
         clear two-thirds rather than under the panel. On a phone it is a
         sheet over the bottom three-fifths, so the shot looks well below the
         ground line and the pair ride up into the top third, tag and all. */
      const mid = origin.clone().addScaledVector(FACE, 1.8)
      const d = 20 + k * 8
      const position = mid
        .clone()
        .addScaledVector(RIGHT, -d)
        .addScaledVector(FACE, d * 0.22)
      position.y = 3.4 + k * 0.6
      const lookAt = mid.clone().addScaledVector(FACE, 2.4 * (1 - k))
      lookAt.y = 2.3 - k * 7.2
      return { position, lookAt, fov: 30 + k * 22 }
    },

    setEngaged(on: boolean) {
      engaged = on
      if (on) lookToward(talkSpot)
    },

    setDaylight(k: number) {
      daylight = clamp(k)
    },

    activate(ctx: LandmarkContext) {
      ctx.talk()
    },

    update(dt, elapsed, lit, ctx) {
      /* who he is looking at: you, once you are near enough to be worth
         turning for; the spot in front of him while you are talking; the
         spawn otherwise, which is where the next visitor comes from */
      if (engaged) lookToward(talkSpot)
      else {
        const p = ctx.playerPosition
        const d = Math.hypot(p.x - EX, p.z - EZ)
        if (d < 12 + 2) lookToward(p)
        else if (d > 12 * 1.6) yawTarget = FACE_Y
      }
      yaw += angleDelta(yaw, yawTarget) * Math.min(1, TURN_RATE * dt)
      group.rotation.y = yaw

      // breath, and a lantern that hangs level and sways a little — he is
      // standing still, which is not the same as standing dead
      const breath = Math.sin(elapsed * 1.25 + 0.8)
      body.position.y = breath * 0.012
      head.position.y = HEAD_Y + breath * 0.01
      leftArm.rotation.x = 0.05 + breath * 0.025
      rightArm.rotation.x = -0.12 - breath * 0.02
      const carried = -(rightArm.rotation.x + rightElbow.rotation.x)
      swing.rotation.x = carried + Math.sin(elapsed * 0.9) * 0.05
      swing.rotation.z = Math.sin(elapsed * 0.7 + 1.1) * 0.04

      const flick = 1 + Math.sin(elapsed * 10.7 + 2) * 0.045 + Math.sin(elapsed * 26.1) * 0.03
      const night = 1 - daylight
      glow.scale.setScalar(GLOW_SIZE * flick * (0.3 + night * 0.7))
      glowMat.opacity = night * night
      glow.visible = glowMat.opacity > 0.01
      // …and it warms a touch when your own light reaches him, the way every
      // landmark out here answers the lantern
      lamp.intensity = LAMP_BASE * flick * (0.035 + night * 0.965) * (1 + clamp(lit) * 0.3)
      flame.scale.setScalar(0.94 + flick * 0.08)
      flameMat.color.copy(FLAME_COLD).lerp(FLAME_LIT, night)
      // the tag is self-lit — it has to read at midnight — but in daylight
      // a glowing label over a sunlit field is a sticker, so it settles
      tagMat.opacity = 0.72 + night * 0.28
    },

    dispose() {
      for (const o of owned) o.dispose()
    },
  }
}

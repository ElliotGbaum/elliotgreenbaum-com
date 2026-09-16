/**
 * Elliot — the other person in the field.
 *
 * A second figure, standing off to the right of the path between the spawn and
 * the projector, carrying a lantern of his own, with a nametag over his head.
 * Walk up and he turns to face you; press E and the field hands you a panel
 * to talk to him in (src/ui/chat.ts). What answers is an AI that has been
 * given Elliot's own notes about himself (server/persona.ts) — the greeting
 * says so once, in his voice, and the model says so again if asked; the tag
 * over his head is the invitation, not the disclaimer, and it goes out for
 * as long as the panel is up.
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
 * you can see what you bring light to. It makes him the one landmark that is
 * lit the same way you are, which is the visual argument that he is a person
 * and not a machine. One light per landmark, as always — but his is turned
 * DOWN until you come to him or the film has been watched, because a second
 * full lantern across the field is a second thing to look at, and the field
 * has one. Embers are enough to find him by; after the film the compass and
 * the standing line do the rest.
 *
 * WHERE HE STANDS, and why. At night the eye goes to light first, then to a
 * person, then to words, then to the middle of the frame. He used to stand
 * beside the projector at its own depth (x = 16, z = 28) with his own pool
 * of light and the biggest type in the field over his head — three of the
 * four, against the projector's one — and the field read as two headline
 * attractions. Then he stood up by the screen, off its right edge (x = 27,
 * z = -8), and that overshot: from the spawn he was a few pixels tall at the
 * treeline, and a figure that small with a tag over its head reads as a
 * stray, not a second thing to do. Then x = 19, z = 14 — a little ahead of
 * the projector's depth — and from the spawn, thirty-two units off, he was
 * still a figure you had to squint for. Now he stands halfway up the path
 * between the spawn and the projector, off its right, facing the screen: an
 * audience member, plainly in the shot from the first frame at the size a
 * person twenty units away is, and plainly not the thing the compass and
 * the standing line point at. His height is the visitor's and stays so;
 * how big he reads is a matter of where he stands, never of scale. AT REST HE IS
 * SECOND, NOT HIDDEN: the lantern at half, his name and the invitation over
 * his head, so anyone who reads it knows he is a thing you can do — this is
 * not a game with secrets in it. Hierarchy comes from place, not from
 * hiding: he is off to the side of the machine, smaller than the screen,
 * and his light is turned down. He comes up to full as you come to him (see
 * `reveal` below), and once the film has been watched, which is the moment
 * the standing line starts naming him.
 *
 * That is where he stands UNTIL THE FILM IS SWITCHED ON. Once the camera has
 * cut to the screen he is placed at a spot off the screen's left, unseen,
 * and watches from there, so that when the film ends he is in the shot —
 * see WHERE HE STANDS ONCE THE FILM IS ON, over `WATCH_DESK` below.
 *
 * Off the centre line for the reason the signs are (see the long note in
 * gate.ts): the film's watching shot is a cone out of a camera at z = 50 and
 * nothing may stand in it. At x = 13, z = 25 he is 27° off that shot's axis
 * against a half-frame of 19° on a 16:9 window and about 25° on a 21:9, so
 * he is clear of the picture on both.
 */

import * as THREE from 'three'
import { PALETTE, PHONE, REDUCED_MOTION, clamp, angleDelta, type Landmark, type LandmarkContext } from '../../core/contract'

/* Where he stands, until the film is switched on — see WHERE HE STANDS in
   the header */
/**
 * On a phone held upright the shot is a horizontal crop of the 4:3 frame
 * (ASPECT_FLOOR in camera.ts), a half-frame of about fourteen units at his
 * depth, so at x = 13 he and his nametag were cut off by the right edge
 * (2026-09-16). Seven keeps the whole tag inside a 375px frame with a
 * margin; the desktop keeps the wider stance.
 */
const EX = PHONE ? 7 : 13
const EZ = 25
/** how fast he walks in beside the visitor, world units a second */
const WALK_SPEED = 7.5

/**
 * WHERE HE STANDS ONCE THE FILM IS OVER: beside the visitor. The watching
 * spot is chosen to be out of the film's shot, and out of the film's shot
 * is a long way off — when the camera swung home he was a small figure
 * thirty degrees left of the lens, forty units off, which read as "too far
 * away and too far left" rather than as company. So the moment the film
 * ends (`comeCloser`, called from `finishFilm` in main.ts) he walks in to
 * the visitor's side, fifteen units left and a step ahead, both of them
 * facing the screen: twenty degrees off the follow cam's axis, a figure
 * the visitor's own size. He is inside his own talking radius here, which
 * is fine — main.ts only lets him take the prompt off the projector once
 * the visitor is walking toward him — but he must stay outside his REACH
 * (`reachRadius`, measured from his anchor, which sits 5.5 in front of
 * him), or E at the machine opens his panel instead of the replay. On a
 * replay he stands here while the visitor walks to the switch, and is put
 * back at the watching spot once the camera has cut to the screen
 * (`comeToWatch` again, from `startFilm`), out of a frame that no longer
 * holds where he stood.
 */
const NEAR = [-21, 0] as const
/**
 * On a phone held upright the follow frame is a horizontal crop of the 4:3
 * floor (ASPECT_FLOOR in camera.ts): about a quarter of the depth to the
 * half-frame, so from the follow cam at (−6, 31) the desktop spot, fifteen
 * units left, is a long way past the edge and the visitor came out of the
 * film to an empty field with "walk over to Elliot" under it (2026-09-16).
 * Four units left and eleven ahead puts him and the whole nametag inside a
 * 375px frame with a unit to spare, still outside the projector's press
 * spot by his reach. Sideways the frame is the desktop's and so is the spot.
 */
const NEAR_PHONE_UP = [-10, -6] as const

/**
 * WHERE HE STANDS ONCE THE FILM IS ON: off the screen's left, twenty-odd
 * units from where the visitor watches, facing the screen like the rest of
 * the audience. He is put there the moment the film's camera has cut to the
 * screen (`comeToWatch`, called from `startFilm` in main.ts) and stays.
 *
 * Why he moves at all. The path-side spot is south-east of the watching
 * spot, and the follow cam sits due south of the figure, so when the film
 * ended he was BEHIND THE LENS: the standing line said "walk over to
 * Elliot" over a field with nobody in it. Nowhere in the film's own shot is
 * also visible from the follow cam's, so he cannot simply be put somewhere
 * both can see; he goes once the picture is up, which is the one stretch
 * where the field off the screen's cone is unseen — and he goes in a
 * single step, because a walk from the path-side spot crosses the cone.
 *
 * Where, exactly, is two constraints. He must be OUTSIDE the watching shot,
 * for the replay: the desktop shot is a 22° lens at (3.5, 50) aimed at the
 * screen, 19° to the half-frame at 16:9 and 24° at 21:9, so at z = −5 that
 * needs x < −24. He must be INSIDE the follow shot from the watching spot
 * (−6, 5) — the camera at (−6, 15, 31) — and far enough off not to be a
 * surprise when the shot swings home: at (−27, −5) he is 30° left of that
 * axis against a 40° half-frame, twenty-three units from the visitor,
 * about two-thirds the visitor's height.
 *
 * A phone is two answers, by how it is held, because its watching shot is
 * measured to the screen rather than composed (see phoneVantage in
 * projector.ts). Upright, the picture is 11° to the half-frame and the
 * follow frame is narrow too, so he stands close to the centre line — at
 * (−12, −10) he is a few units clear of the picture and well inside the
 * exit shot; at −16 he was cut in half by the left edge. Sideways, the
 * picture is 21° to the half-frame and the follow frame is wide, so he
 * stands further out, past the desktop's line. Chosen when he moves, from
 * how the phone is held then; turning it during the film is the one case
 * this does not cover, and it costs a figure beside the screen, not on it.
 */
const WATCH_DESK = [-27, -5] as const
const WATCH_PHONE_UP = [-12, -10] as const
const WATCH_PHONE_WIDE = [-26, -8] as const

/** where the visitor's figure starts, so Elliot can face it before anyone arrives */
const SPAWN_Z = 46

/** the screen, so his resting look can be turned part-way toward it */
const SCREEN_Z = -30
/**
 * Which way he looks AT REST, before anyone is near: at the screen, like
 * anyone else out here — not square at the path like a greeter waiting on
 * you. He still turns to you when you come close.
 */
const restYawAt = (x: number, z: number) => Math.atan2(-x, SCREEN_Z - z)
/**
 * How far off you have to be for him to be at rest, and how close before he
 * is fully up: between the two the lantern comes up and the name fades in.
 * `REVEAL_FAR` is a little past his talking radius, so he has answered you
 * before the prompt line does.
 */
const REVEAL_FAR = 28
const REVEAL_NEAR = 18
/** the lantern at rest, as a share of full: lit and readable, not a beacon */
const AT_REST = 0.5
/**
 * WHERE THE VISITOR STANDS TO TALK, and why it is not in front of him.
 * The follow cam sits due south of the figure (src/world/camera.ts,
 * BASE_OFFSET), and the talking shot has him on the LEFT of frame with the
 * visitor beside him, clear of the panel down the right third. Seen from
 * the south, whoever stands further EAST is on the right — so the visitor
 * has to stand off his east side, not on the spawn side where the path
 * arrives. Taking the shot from wherever would put a spawn-side visitor on
 * the right meant sliding the camera a third of the way round the pair in
 * a second — a swing wide enough to make people dizzy. Move the spot, not
 * the camera: he turns to face the spot when you arrive, as he would.
 */
const TALK_Y = (55 * Math.PI) / 180
/** from him toward the visitor, once the two are talking */
const TALK_FACE = new THREE.Vector3(Math.sin(TALK_Y), 0, Math.cos(TALK_Y))
/**
 * Where the talking shot is taken from: OVER THE VISITOR'S SHOULDER. The
 * camera stands behind the visitor's figure and off its right side, looking
 * past it at Elliot — the two-shot every filmed conversation uses to say
 * who is listening and who is talking. The near figure is the visitor: a
 * touch larger, back three-quarters to the lens, exactly where you would be
 * if it were you. The far one is Elliot: face on, lit, the one the shot is
 * about. That is the whole of how the two are told apart, and it is the
 * same cue a viewer reads without knowing they are reading it. The pair
 * used to stand side by side in profile, seen from the path, and with two
 * identical armatures that shot answered the question "which is me?" with
 * nothing at all.
 *
 * The axis runs from Elliot through the visitor, swung this far round
 * toward the visitor's right, so the visitor lands on the RIGHT of Elliot
 * in frame — beside the panel, not under it — and Elliot sits in the clear
 * left two-thirds. Swung this far the pair are seen nearly side-on, the
 * two of them across the frame from each other: Elliot's near profile is
 * turned a touch toward the lens, the visitor's a touch away. A tighter
 * swing (45°, then 32°) read as both of them talking at the lens on a
 * diagonal rather than to each other.
 */
const TALK_SWING = (-70 * Math.PI) / 180
const TALK_DIR = new THREE.Vector3(Math.sin(TALK_Y + TALK_SWING), 0, Math.cos(TALK_Y + TALK_SWING))
/** frame-right from that camera, on the ground: the way the look-at is
 *  nudged so Elliot sits left of centre and the pair clear the panel */
const TALK_RIGHT = new THREE.Vector3(Math.cos(TALK_Y + TALK_SWING), 0, -Math.sin(TALK_Y + TALK_SWING))

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
 * side, drawn once to a canvas in the mono every label out here uses — the
 * same voice as PROJECTOR under the compass — the name, and under it the
 * invitation, TALK TO HIM, because a name over a head is a label and
 * this figure is a thing to do. It used to be a display-serif heading
 * floating well above him, and it read as a UI overlay, not a thing in the
 * world; now it is small, close to his head, and his.
 *
 * It is up while he is somebody to walk to, and it goes out while you are
 * talking to him: the invitation has been taken up, the panel has his name
 * on it, and a caption hanging over the person you are talking to reads as
 * a label on a chatbot. It comes back when you leave.
 */
/** the invitation under the name: what he is for, and when */
const TAG_LINE = 'TALK TO HIM'

function tagTexture(mode: 'night' | 'day'): THREE.CanvasTexture {
  const S = (window.devicePixelRatio || 1) >= 2 ? 3 : 2
  const W = 640
  const H = 240
  const cv = document.createElement('canvas')
  cv.width = W * S
  cv.height = H * S
  const c = cv.getContext('2d')!
  c.scale(S, S)

  c.textAlign = 'center'
  c.textBaseline = 'middle'

  // At night, a soft dark halo behind the words, not a panel — the badge
  // and the compass label do the same with text-shadow, and a rectangle
  // hanging in the dark field is a rectangle. By day the halo has nothing
  // to bite on — cream words over sunlit grass are the value of the grass.
  // The night ink in a dark pill was tried and it hung there like a road
  // sign: the one solid black thing in a sunlit field. So by day the tag
  // does what the compass label does (ui.css, "HUD, in daylight"): the ink
  // inverts to dark, the amber deepens to keep its contrast, and the pill
  // is a pale frosted one — buff at two-thirds, with a hairline rim — that
  // reads as part of the sunlit world rather than a piece of the chrome.
  const day = mode === 'day'
  const NAME_FONT = '600 104px "Hoefler Text", "Iowan Old Style", Palatino, Georgia, serif'
  const SUB_FONT = '600 34px ui-monospace, "SF Mono", Menlo, monospace'
  const SUB_SPACING = 6
  const NAME_Y = H / 2 - 22
  const SUB_Y = H / 2 + 58
  if (day) {
    // the pill is measured off the words — the wider line plus a clear
    // margin each side — so the rounded ends never bite the first and last
    // letters of the longer line, and it hugs the name instead of hanging
    // wide of it
    c.font = SUB_FONT
    c.letterSpacing = `${SUB_SPACING}px`
    const subW = c.measureText(TAG_LINE).width
    c.font = NAME_FONT
    c.letterSpacing = '0px'
    const nameW = c.measureText('Elliot').width
    const pw = Math.min(W - 16, Math.max(subW, nameW) + 2 * 72)
    c.fillStyle = 'rgba(236,231,218,0.84)'
    c.strokeStyle = 'rgba(10,20,24,0.18)'
    c.lineWidth = 2
    c.beginPath()
    c.roundRect((W - pw) / 2, 10, pw, H - 20, 999)
    c.fill()
    c.stroke()
  }
  // by night the words get a soft dark halo; by day none at all — a blur
  // behind dark type on a pale pill only muddies the edges
  c.shadowColor = 'rgba(0,0,0,0.95)'
  c.shadowBlur = day ? 0 : 18
  c.fillStyle = day ? '#0A1418' : '#F3E9D2'
  c.font = NAME_FONT
  c.letterSpacing = '0px'
  c.fillText('Elliot', W / 2, NAME_Y)
  if (!day) c.fillText('Elliot', W / 2, NAME_Y)

  c.shadowBlur = day ? 0 : 12
  c.fillStyle = day ? '#8A5A14' : PALETTE.amberLitCss
  c.font = SUB_FONT
  c.letterSpacing = `${SUB_SPACING}px`
  c.fillText(TAG_LINE, W / 2, SUB_Y)
  if (!day) c.fillText(TAG_LINE, W / 2, SUB_Y)

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
   * The film has been switched on and the camera is on the screen: he is
   * placed at his watching spot, unseen, so he is in the shot when the film
   * ends. Call it once the cut is done. `aspect` is the
   * viewport's width over its height, which on a phone decides the spot.
   */
  comeToWatch(aspect: number): void
  /**
   * The film is over: come in and stand beside the visitor. See WHERE HE
   * STANDS ONCE THE FILM IS OVER, over `NEAR`. Nothing, if the film was
   * never watched.
   */
  comeCloser(aspect: number): void
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
  group.rotation.y = restYawAt(EX, EZ)

  const owned: Array<{ dispose(): void }> = []
  const keep = <T extends { dispose(): void }>(g: T): T => {
    owned.push(g)
    return g
  }

  /* ================= the figure =================
     The player's armature, standing. A slightly warmer skin than the
     visitor's grey-blue — the one hint that this figure is somebody — and
     the same dark for the feet. */
  const SKIN_NIGHT = new THREE.Color(0x5c5650)
  // by day a mid-brown figure is grass-coloured from thirty units away. He
  // crosses to the visitor's own daylight white (player.ts SKIN_DAY): a warm
  // cream was tried and beside the visitor it read as dingy, and the
  // nametag is what makes him somebody, not a tint
  const SKIN_DAY = new THREE.Color(0xd6dfe2)
  const skin = keep(
    new THREE.MeshStandardMaterial({ color: SKIN_NIGHT, roughness: 0.82, metalness: 0.06 }),
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
  // which is what standing looks like as opposed to being stood up. Kept,
  // because he walks (to his watching spot, and back to the visitor's side)
  // and the stride in `update` is laid over these rest poses.
  const thighs: THREE.Group[] = []
  const knees: THREE.Group[] = []
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
    thighs.push(thigh)
    knees.push(knee)
  }
  const REST_THIGH = thighs.map((t) => t.rotation.x)
  const REST_KNEE = knees.map((k) => k.rotation.x)

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
  // two of them, night ink and day ink, crossfaded on `daylight`
  const tagFor = (mode: 'night' | 'day') => {
    const mat = keep(
      new THREE.SpriteMaterial({
        map: keep(tagTexture(mode)),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        fog: true,
      }),
    )
    const sprite = new THREE.Sprite(mat)
    // 640 × 240 texels, drawn at world size — the name is about two heads
    // tall from where you approach, and it sits clear above the head — and
    // clear above the PRESS [E] badge too, which hangs just over his head
    // (`reach`) and tops out under the tag's lower edge
    sprite.scale.set(8.4, 8.4 * (240 / 640), 1)
    sprite.position.set(0, HEAD_Y + 3.7, 0)
    group.add(sprite)
    return { mat, sprite }
  }
  const tagNight = tagFor('night')
  const tagDay = tagFor('day')
  const tagMat = tagNight.mat
  const tagDayMat = tagDay.mat
  const tag = tagNight.sprite

  /* ---------------- state ---------------- */
  let daylight = 0
  let engaged = false
  let restY = restYawAt(EX, EZ)
  let yaw = restY
  let yawTarget = restY
  /** 0 at rest, 1 fully up; eased over time so he never pops */
  let reveal = 0
  /** the nametag: 1 while he is somebody to walk to, 0 while you are talking */
  let tagUp = 1

  /* Where he is, and the points main.ts holds by reference that hang off
     it. All of them are UPDATED IN PLACE by `standAt`, never replaced, so
     the compass, the badge and the walk-to-talk keep pointing at him after
     he has moved. */
  const origin = new THREE.Vector3(EX, 0, EZ)
  const talkSpot = new THREE.Vector3()
  const anchor = new THREE.Vector3()
  const facePoint = new THREE.Vector3()
  const reach = new THREE.Vector3()
  /** scratch: from him toward the spawn, which is the side you approach on */
  const approach = new THREE.Vector3()

  function standAt(x: number, z: number): void {
    origin.set(x, 0, z)
    group.position.copy(origin)
    facePoint.copy(origin)
    talkSpot.copy(origin).addScaledVector(TALK_FACE, 3.6)
    /* the anchor is 5.5 in front of him on the side the path arrives from —
       toward the spawn — so the radius reaches the way you come */
    approach.set(-x, 0, SPAWN_Z - z).normalize()
    anchor.copy(origin).addScaledVector(approach, 5.5)
    // the badge hangs just over his head — see `reach` below
    reach.set(x, HEAD_Y + HEAD_R + 0.15, z)
    restY = restYawAt(x, z)
  }
  standAt(EX, EZ)
  let watching = false
  /** where he is walking to, while he is; null once he has arrived */
  let goal: THREE.Vector3 | null = null
  /** the stride's clock, in radians */
  let stride = 0

  /** set off for (x, z) at walking pace — or, under reduced motion, be there */
  function walkTo(x: number, z: number): void {
    if (goal ? goal.x === x && goal.z === z : origin.x === x && origin.z === z) return
    if (REDUCED_MOTION) {
      goal = null
      standAt(x, z)
      yaw = yawTarget = restY
      group.rotation.y = yaw
      return
    }
    goal = new THREE.Vector3(x, 0, z)
    lookToward(goal)
  }

  /** turned to face a point on the ground, the long way round never */
  function lookToward(p: THREE.Vector3): void {
    const dx = p.x - origin.x
    const dz = p.z - origin.z
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
    /* Shown only once you are near him (or walking at him): the far line in
       main.ts names him itself. So this is a label at his feet, not an
       instruction from across the field. */
    prompt: 'Talk to Elliot',
    again: 'Ask Elliot something else',
    verb: 'talk',
    verbAgain: 'talk again',
    /* The badge hangs just over his head, in the gap under the nametag. It
       lived at his hips for a while so the two labels would not stack, but
       a badge rising from the hips lands on his chest, and from the two-shot
       after a conversation — close, the visitor's figure right beside him —
       it sat across both bodies and read as pinned to the wrong one (Elliot,
       2026-09-15). Over the head it is unambiguously his; the tag starts
       3.7 above the head, which leaves it room at every distance the badge
       is shown from (`reachRadius`). */
    reach,
    reachRadius: 8,
    /* the whole figure, and the tag: you point at a person, not at an arm,
       and the name over his head is the most likely thing to be pointed at */
    hitTargets: [body, tag, tagDay.sprite],
    /* Standing next to somebody is not talking to them. A conversation is a
       thing you start — press E, or tap him — never a thing that happens to
       you for walking past. Same argument the projector makes. */
    autoActivate: false,

    talkSpot,
    facePoint,
    talkVantage(aspect: number) {
      const k = clamp((1.0 - aspect) / 0.55)
      /* THE PANEL DECIDES THE FRAMING. On a window it is a column down the
         right third, so the shot is taken from TALK_DIR — behind the
         visitor's shoulder, see above — with the look-at pushed a little
         frame-right of Elliot: he sits in the left third, the visitor's
         back beside him nearer the lens, both clear of the panel. On a
         phone it is a sheet over the bottom three-fifths, so the shot pulls
         back, widens, and looks well below the ground line so the pair
         ride up into the top third. */
      const d = 18 + k * 10
      const position = origin.clone().addScaledVector(TALK_DIR, d)
      position.y = 3.2 + k * 0.8
      /* the push was 3.0 until 2026-09-15; at that the visitor's figure
         stood on the panel's fade and read through the live lines. And the
         look-at is the midpoint between them, not Elliot: centred on him
         alone the visitor falls off the right edge */
      const lookAt = origin.clone().addScaledVector(TALK_RIGHT, 4.4 * (1 - k)).addScaledVector(TALK_FACE, 1.8 * k)
      lookAt.y = 2.6 - k * 7.5
      return { position, lookAt, fov: 33 + k * 19 }
    },

    comeToWatch(aspect: number) {
      watching = true
      const [x, z] = !PHONE ? WATCH_DESK : aspect < 1 ? WATCH_PHONE_UP : WATCH_PHONE_WIDE
      /* He is placed, not walked. Until 2026-09-15 he set off the moment
         the film was picked and the visitor watched him hurry fifty units
         across the field on their way to the switch, which read as a man
         bolting rather than an audience settling. Now main.ts calls this
         only once the camera has cut to the film's shot, and both where he
         was and where he goes are outside that shot, so the move is unseen:
         he stands by the screen while the visitor walks up, and is simply
         at his watching spot when the picture comes up. */
      goal = null
      standAt(x, z)
      yaw = yawTarget = restY
      group.rotation.y = yaw
    },

    comeCloser(aspect: number) {
      if (!watching) return
      const [x, z] = PHONE && aspect < 1 ? NEAR_PHONE_UP : NEAR
      walkTo(x, z)
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
      /* the walk, when there is one: a straight line to the goal at walking
         pace, facing the way he is going, legs swinging. He arrives, faces
         the screen, and the stride settles back to the standing pose. */
      if (goal) {
        const dx = goal.x - origin.x
        const dz = goal.z - origin.z
        const left = Math.hypot(dx, dz)
        const step = WALK_SPEED * dt
        if (left <= step) {
          standAt(goal.x, goal.z)
          goal = null
          yawTarget = restY
        } else {
          standAt(origin.x + (dx / left) * step, origin.z + (dz / left) * step)
          lookToward(goal)
          stride += dt * 8.6
        }
      }
      const walking = goal ? 1 : 0
      const gait = Math.sin(stride)
      for (let i = 0; i < thighs.length; i++) {
        const sign = i === 0 ? 1 : -1
        const tgtT = REST_THIGH[i]! + walking * gait * sign * 0.55
        const tgtK = REST_KNEE[i]! + walking * Math.max(0, -gait * sign) * 0.9
        thighs[i]!.rotation.x += (tgtT - thighs[i]!.rotation.x) * Math.min(1, dt * 14)
        knees[i]!.rotation.x += (tgtK - knees[i]!.rotation.x) * Math.min(1, dt * 14)
      }

      if (goal) {
        // already facing the way he is going
      } else if (engaged) lookToward(talkSpot)
      else {
        const p = ctx.playerPosition
        const d = Math.hypot(p.x - origin.x, p.z - origin.z)
        if (d < 12 + 2) lookToward(p)
        else if (d > 12 * 1.6) yawTarget = restY
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
      swing.rotation.x = carried + Math.sin(elapsed * 0.9) * 0.05 + walking * gait * 0.12
      swing.rotation.z = Math.sin(elapsed * 0.7 + 1.1) * 0.04

      /* How much of him is up. At rest — nobody near, film not yet watched —
         the lantern is at half and the name is on, so he reads as a person
         you can go to without outshining the projector. He comes up to full
         as you close the last stretch to him, and he stays up once the film
         has been watched: that is when the standing line starts sending
         people to him. Eased, so the lantern is raised, not switched. */
      {
        const p = ctx.playerPosition
        const d = Math.hypot(p.x - origin.x, p.z - origin.z)
        const byDistance = clamp((REVEAL_FAR - d) / (REVEAL_FAR - REVEAL_NEAR))
        const target = engaged || ctx.filmSeen() ? 1 : byDistance
        reveal += (target - reveal) * Math.min(1, 2.2 * dt)
      }
      const up = AT_REST + (1 - AT_REST) * reveal

      const flick = 1 + Math.sin(elapsed * 10.7 + 2) * 0.045 + Math.sin(elapsed * 26.1) * 0.03
      const night = 1 - daylight
      skin.color.lerpColors(SKIN_NIGHT, SKIN_DAY, daylight)
      glow.scale.setScalar(GLOW_SIZE * flick * (0.3 + night * 0.7) * (0.55 + 0.45 * reveal))
      glowMat.opacity = night * night * up
      glow.visible = glowMat.opacity > 0.01
      // …and it warms a touch when your own light reaches him, the way every
      // landmark out here answers the lantern
      lamp.intensity = LAMP_BASE * up * flick * (0.035 + night * 0.965) * (1 + clamp(lit) * 0.3)
      flame.scale.setScalar((0.94 + flick * 0.08) * (0.7 + 0.3 * reveal))
      flameMat.color.copy(FLAME_COLD).lerp(FLAME_LIT, night)
      // the tag is self-lit — it has to read at midnight — and by day it
      // hands over to its twin in the pill. A little dimmer at rest, full
      // once he is up, and out while the panel is open: the invitation has
      // been taken up, and the panel carries his name.
      /* …and down for the length of the film: on a phone held upright his
         watching spot is close enough to the picture that the tag's edge
         reached into it, and an invitation over a stranger's head is not
         part of the show anyway. It comes up as the shot swings home. */
      tagUp += ((engaged || ctx.filmOn() ? 0 : 1) - tagUp) * Math.min(1, 4 * dt)
      tagMat.opacity = night * (0.78 + 0.22 * reveal) * tagUp
      tagDayMat.opacity = daylight * tagUp
      tag.visible = tagDay.sprite.visible = tagUp > 0.01
      // no lantern in daylight: it is a thing you carry at night
      swing.visible = night > 0.5
    },

    dispose() {
      for (const o of owned) o.dispose()
    },
  }
}

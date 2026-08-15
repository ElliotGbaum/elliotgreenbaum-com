/**
 * The other sign — the one out past the projector on the left, which is a
 * trainyard running-order board on a signal mast.
 *
 * IT IS NOT THERE UNTIL IT IS, for exactly the reason the parkour sign is not:
 * a lock you can see is a promise, and a promise you can see is a second thing
 * to do in a world whose whole argument is that there is one. Start the film,
 * and when it lets you go this builds itself out of the ground along with the
 * other one and stays lit from then on, on this visit and every one after.
 *
 * IT IS DELIBERATELY THE SAME OBJECT AS THE GATE, MIRRORED. Two unlocks that
 * look like two different kinds of thing read as two different systems, and
 * the field only has one vocabulary: posts out of the ground, a board with a
 * double rule on it, a hooded lamp throwing a pool you can aim at from further
 * out than you can read the words from. What makes this one a *trainyard* sign
 * is the signal head bolted to the near post: two lenses, the standby holding
 * cool and the upper one striking amber when the board comes on — a signal
 * clearing, which is the only pun this field is going to make.
 *
 * IT GETS ITS OWN BEAT OF THE UNLOCK, and it did not use to. The camera read
 * the parkour board and handed straight back, on the argument that one reveal
 * is a gift and two is a cutscene, and this thing built itself off-frame during
 * those same two seconds. It was the wrong call for a simple reason: a reward
 * you were never shown is a reward you have to go and find. So the camera holds
 * on the first board, travels, and holds on this one — the beat every game
 * gives a level it has just unlocked — and `revealVantage()` below is this
 * board's half of it. main.ts owns the timing; it also holds this sign's switch
 * back until the camera is already moving, so the strike happens on frame
 * rather than four seconds before anyone is looking at it.
 *
 * DO NOT IMPORT gate.ts FROM HERE. The two are siblings and they duplicate the
 * strike table and the build easing on purpose: the contract is the only module
 * either of them is allowed to share, and a `signage.ts` helper pulled out of
 * the pair would be a third module that both of them have to be read against
 * before either can be changed.
 */

import * as THREE from 'three'
import { PALETTE, clamp, ease, type Landmark, type LandmarkContext } from '../../core/contract'

/**
 * Where it stands: out to the left, level with the parkour sign.
 *
 * THE MIRROR IS NOT THE MIRROR IMAGE. gate.ts has the arithmetic in full: the
 * watching shot sits at x = +3.5 and looks at x = 0, so the film's frame reaches
 * about two units further right of centre than left, which is why the parkour
 * sign is at +22 and this one is at −20. Same clearance, two units cheaper,
 * because the camera leans away from this side.
 *
 * z = 24 is shared with the gate on purpose, and it is what pays for the pair
 * standing as close together as they do — the picture's frame is a cone out of
 * a camera at z = 50, so coming forward narrows the cone the boards have to
 * stay outside of, and it narrows the gap between them from the spawn as well.
 * gate.ts works the whole sum; do not move either board without reading it.
 * The other half of sharing z is composition: the two are the same distance in
 * front of you when you step back from the projector, so finding one is finding
 * both, and neither is the reward for having explored harder.
 */
const GX = -20
const GZ = 24

/** where the figure starts, so the sign can be turned to face it */
const SPAWN_Z = 46

/** the board */
const BOARD_W = 12
const BOARD_H = 5
/** height of the board's centre — head height plus a bit, the way signs are hung */
const BOARD_Y = 7.2

/**
 * Which way it looks. Turned to the spawn point rather than square to the
 * world: a sign you have to walk around to read is a sign you do not read. The
 * formula reads GX, so the same line that aims the gate at +22 aims this at
 * −20 without a sign flip anywhere.
 */
const FACE_Y = Math.atan2(-GX, SPAWN_Z - GZ)
/** the board's normal, for pushing the anchor and the badge out in front of it */
const FACE = new THREE.Vector3(Math.sin(FACE_Y), 0, Math.cos(FACE_Y))
/** …and its right-hand axis, for framing the reveal shot off the board's face */
const RIGHT = new THREE.Vector3(Math.cos(FACE_Y), 0, -Math.sin(FACE_Y))

/**
 * The face. Two lines and a double rule — the same double rule the projector's
 * floor rings, the screen's frame and the parkour board are drawn with, which
 * is the whole vocabulary this field has for "this is one of ours".
 *
 * THE BOARD NAMES THE GAME IT IS. It read `Trainyard Run` for two versions —
 * this build's own name for its own runner, deliberately not the name of the
 * game that inspired it. It says `Subway Surfers` now because that is what
 * Elliot asked the sign to say, and it is worth knowing what that costs: it is
 * somebody else's trademark, lettered eight feet high, in a field with his name
 * on it. The runner behind the sign still calls itself the trainyard everywhere
 * else — its own opening card, its own prose — so this is the one surface the
 * borrowed name appears on, and src/surf keeps its own vocabulary.
 *
 * `ENDLESS` is a statement of the format, not a boast — it is the one fact
 * about this game a person needs before they decide whether to press it,
 * because a run with no end is a different commitment from five levels with a
 * finish on the last one.
 */
function faceTexture(): THREE.CanvasTexture {
  // Drawn at `S` times the design size, for the reason set out over the
  // parkour board's own face in gate.ts: 768 texels is not enough resolution
  // for a sign whose entire job is to be read from across a field, and the
  // bigger the window the worse it got. The drawing below is unchanged — the
  // scale is on the canvas, so these are still the same 768 × 320 coordinates.
  const S = (window.devicePixelRatio || 1) >= 2 ? 3 : 2
  const W = 768
  const H = 320
  const cv = document.createElement('canvas')
  cv.width = W * S
  cv.height = H * S
  const c = cv.getContext('2d')!
  c.scale(S, S)

  c.fillStyle = '#0F1A1C'
  c.fillRect(0, 0, W, H)

  c.strokeStyle = PALETTE.amberCss
  c.lineWidth = 5
  c.strokeRect(16, 16, W - 32, H - 32)
  c.globalAlpha = 0.35
  c.strokeRect(30, 30, W - 60, H - 60)
  c.globalAlpha = 1

  c.textAlign = 'center'
  c.textBaseline = 'middle'

  c.fillStyle = '#F3E9D2'
  c.font = '600 76px "Hoefler Text", "Iowan Old Style", Palatino, Georgia, serif'
  c.fillText('Subway Surfers', W / 2, H / 2 - 22)

  c.fillStyle = PALETTE.amberLitCss
  c.font = '500 26px ui-monospace, "SF Mono", Menlo, monospace'
  c.letterSpacing = '7px'
  c.fillText('ENDLESS', W / 2, H / 2 + 62)

  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  // turned to face the spawn, read from everywhere else — see gate.ts
  t.anisotropy = 8
  return t
}

/**
 * The strike. A lit sign coming on is not a dimmer sweep — it stutters, holds,
 * stutters once more and then stays. Discrete beats rather than a curve,
 * because a smooth ramp reads as a fade-in and a fade-in reads as UI. Same
 * table as the gate's, deliberately: the two boards are one pair of lights on
 * one circuit and they come on the same way.
 */
const BEATS = [0, 0.85, 0.06, 1, 0.22, 1, 1]
function strike(s: number): number {
  if (s <= 0) return 0
  if (s >= 1) return 1
  return BEATS[Math.min(BEATS.length - 1, Math.floor(s * (BEATS.length - 1)))]
}

export interface Signal extends Landmark {
  isOpen(): boolean
  /**
   * Light it. `instant` is for a returning visitor who unlocked it on an
   * earlier visit — the ceremony belongs to the moment it is earned, and a
   * build animation on page load is a cutscene for nothing.
   */
  open(instant?: boolean): void
  /** where the camera watches the unlock from, framed for this viewport */
  revealVantage(aspect: number): { position: THREE.Vector3; lookAt: THREE.Vector3; fov: number }
}

export function createSignal(): Signal {
  const group = new THREE.Group()
  group.position.set(GX, 0, GZ)
  group.rotation.y = FACE_Y
  group.visible = false

  const owned: Array<{ dispose(): void }> = []

  /* ---- the posts ----
     Their own material instance, not shared with the board: the build raises
     the posts first and brings the board up on top of them, so the two fade on
     different clocks. */
  const postMat = new THREE.MeshStandardMaterial({
    color: 0x27343a,
    roughness: 0.85,
    metalness: 0.2,
    transparent: true,
    opacity: 0,
  })
  const boardMat = postMat.clone()
  owned.push(postMat, boardMat)

  const legH = BOARD_Y - BOARD_H / 2
  const legGeo = new THREE.BoxGeometry(0.6, legH, 0.6)
  // origin at the foot, so scaling y grows the post out of the ground instead
  // of stretching it about its middle and sinking half of it
  legGeo.translate(0, legH / 2, 0)
  owned.push(legGeo)

  const legs: THREE.Mesh[] = []
  for (const x of [-BOARD_W / 2 + 1.2, BOARD_W / 2 - 1.2]) {
    const leg = new THREE.Mesh(legGeo, postMat)
    leg.position.set(x, 0, 0)
    group.add(leg)
    legs.push(leg)
  }

  /* ---- the signal mast ----
     The one thing that makes this a trainyard sign rather than a second
     parkour sign. It rides on the same clock as the legs — it is a post, it
     comes out of the ground with the posts — and it carries the head, which
     is on the board's clock, because the head is the lit part. */
  const mastH = BOARD_Y + BOARD_H / 2 + 2.6
  const mastGeo = new THREE.BoxGeometry(0.45, mastH, 0.45)
  mastGeo.translate(0, mastH / 2, 0)
  owned.push(mastGeo)
  const mast = new THREE.Mesh(mastGeo, postMat)
  mast.position.set(-BOARD_W / 2 - 1.4, 0, 0)
  group.add(mast)
  legs.push(mast)

  /* ---- the board ----
     One group so the whole head of the sign can ride up the posts as they
     grow. Everything inside it is positioned relative to the board's centre. */
  const board = new THREE.Group()
  group.add(board)

  const frameGeo = new THREE.BoxGeometry(BOARD_W + 0.9, BOARD_H + 0.9, 0.55)
  const frame = new THREE.Mesh(frameGeo, boardMat)
  frame.position.z = -0.14
  board.add(frame)
  owned.push(frameGeo)

  const faceTex = faceTexture()
  const faceGeo = new THREE.PlaneGeometry(BOARD_W, BOARD_H)
  // Basic, not standard: the words have to be legible at midnight with no
  // lantern anywhere near them, and at noon, and they are the one thing on
  // this object that is not allowed to depend on how it is lit.
  const faceMat = new THREE.MeshBasicMaterial({
    map: faceTex,
    toneMapped: false,
    transparent: true,
    opacity: 0,
    fog: true,
  })
  const face = new THREE.Mesh(faceGeo, faceMat)
  face.position.z = 0.18
  board.add(face)
  owned.push(faceTex, faceGeo, faceMat)

  const hoodGeo = new THREE.BoxGeometry(BOARD_W + 0.9, 0.4, 1.5)
  const hood = new THREE.Mesh(hoodGeo, boardMat)
  hood.position.set(0, BOARD_H / 2 + 0.6, 0.6)
  board.add(hood)
  owned.push(hoodGeo)

  /* ---- the signal head ----
     Two lenses on a plate at the top of the mast. The lower one is the cool
     standby and it is on the moment the sign has power at all; the upper one
     strikes amber with the words. That is the whole gag and it is played once:
     a signal that clears. It is lenses, not lights — two more point lights out
     here would be two more shadowless warm blobs competing with the pool the
     hood already throws, and the field's rule is one light per landmark. */
  const headGroup = new THREE.Group()
  headGroup.position.set(-BOARD_W / 2 - 1.4, mastH - 1.9, 0.35)
  group.add(headGroup)

  const plateGeo = new THREE.BoxGeometry(1.5, 3.2, 0.4)
  const plate = new THREE.Mesh(plateGeo, boardMat)
  headGroup.add(plate)
  owned.push(plateGeo)

  const lensGeo = new THREE.CircleGeometry(0.44, 20)
  owned.push(lensGeo)
  // toneMapped: false for the same reason the words are — a lens is a source,
  // and a source that gets tone-mapped down to the ambient level is a sticker
  const clearMat = new THREE.MeshBasicMaterial({
    color: PALETTE.amberLit,
    toneMapped: false,
    transparent: true,
    opacity: 0,
    fog: true,
  })
  const standbyMat = new THREE.MeshBasicMaterial({
    color: PALETTE.sage,
    toneMapped: false,
    transparent: true,
    opacity: 0,
    fog: true,
  })
  owned.push(clearMat, standbyMat)

  const clearLens = new THREE.Mesh(lensGeo, clearMat)
  clearLens.position.set(0, 0.78, 0.22)
  headGroup.add(clearLens)

  const standbyLens = new THREE.Mesh(lensGeo, standbyMat)
  standbyLens.position.set(0, -0.78, 0.22)
  headGroup.add(standbyLens)

  /* The lamp under the hood. It is the proof the sign is powered, and — more
     usefully at night — it throws a warm pool on the ground in front of it, so
     the landmark has a footprint you can aim at from further out than you can
     read the words from. Short range on purpose: this is a sign, not a street
     light, and it must not reach the projector's floor rings. */
  const lamp = new THREE.PointLight(PALETTE.amberLit, 0, 34, 2)
  lamp.position.set(0, -BOARD_H / 2 + 0.4, 2.8)
  board.add(lamp)

  /* ---------------- state ---------------- */
  let open = false
  /** 0 → nothing there, 1 → built and lit */
  let build = 0
  let daylight = 0
  /** how far the face has come on — 0 until the sign strikes, then 1 */
  let power = 0

  const anchor = new THREE.Vector3(GX, 0, GZ).addScaledVector(FACE, 6.5)

  function applyBuild(): void {
    // two beats: the frame goes up out of the ground, and then the sign is
    // switched on. That is all the ceremony a signpost can carry.
    const raise = ease(clamp(build / 0.6))
    power = strike(clamp((build - 0.68) / 0.32))

    const h = 0.04 + raise * 0.96
    for (const leg of legs) leg.scale.y = h
    board.position.y = BOARD_Y * h
    board.scale.setScalar(0.55 + raise * 0.45)
    headGroup.position.y = (mastH - 1.9) * h
    headGroup.scale.setScalar(0.55 + raise * 0.45)
    postMat.opacity = raise
    boardMat.opacity = raise

    faceMat.opacity = power
    // the standby lens is on as soon as there is a mast to hang it on; the
    // clear one waits for the words, so the head reads as a state change
    // rather than as two bulbs on a timer
    standbyMat.opacity = raise * (1 - power * 0.75)
    clearMat.opacity = power
    lamp.intensity = power * 130
  }

  applyBuild()

  return {
    id: 'signal',
    title: 'The trainyard sign',
    object: group,
    anchor,
    // Wide enough that the prompt is up before you are close enough to have to
    // stop walking, the way the projector's and the gate's are.
    radius: 13,
    // "Press", not "Click": this is a line half the people reading it will read
    // on a phone. Same discipline as every other prompt in the field.
    prompt: 'Press the sign to run — the trainyard, until you drop',
    again: 'Press the sign again to run',
    /**
     * …and the badge on the object itself once you are standing at it, the same
     * one the projector and the gate wear. `reach` is under the board rather
     * than on it: the board is words, and a key badge floated over the middle
     * of them is a label sitting on top of a label.
     */
    verb: 'run',
    verbAgain: 'run again',
    /* …and what a click on the sign can land on: the posts, the mast, the
       board and the signal head. Whole groups rather than picked meshes, for
       the reason the gate gives — you point at a signpost, not at a part of
       one. Pointing at it from out in the field walks the figure over and
       presses it on arrival; see `onPointerDown` in main.ts. */
    hitTargets: [...legs, board, headGroup],
    reach: new THREE.Vector3(GX, BOARD_Y - BOARD_H / 2 - 2.1, GZ).addScaledVector(FACE, 0.6),
    // wider than the projector's, because this is a board you read from a few
    // paces back rather than a knob you put a hand on
    reachRadius: 11,
    /**
     * Standing near a sign is reading it, not pressing it. Walking past the
     * thing must never be enough to be thrown into an endless runner — the
     * same argument the projector makes about the film, and it is just as true
     * of a game that only ends when you die. It takes an ask: press E (or
     * Enter, or Space) at the board, or click the board and be walked to it.
     * See gate.ts's header.
     */
    autoActivate: false,

    isEnabled() {
      return open && build > 0.9
    },

    isOpen() {
      return open
    },

    open(instant = false) {
      if (open) return
      open = true
      group.visible = true
      build = instant ? 1 : 0
      applyBuild()
    },

    /**
     * The second half of the unlock. Deliberately the same shot as the gate's,
     * mirrored: same 34 units off the face, same low eye height, same lens —
     * because the two boards are one reward shown twice and a second shot with
     * a character of its own would read as a second *place*.
     *
     * The one flip is the six units of offset. The gate's shot steps to the
     * board's right, which on that side of the field is outward; this one steps
     * to its left for the same outward three-quarter view, so the pair are
     * mirror images and the camera's travel between them is a straight slide
     * with the projector passing through the middle of the pan.
     */
    revealVantage(aspect: number) {
      const k = clamp((1.0 - aspect) / 0.55)
      const d = 34 + k * 14
      const position = new THREE.Vector3(GX, 6 + k * 1.5, GZ)
        .addScaledVector(FACE, d)
        .addScaledVector(RIGHT, -6)
      return {
        position,
        lookAt: new THREE.Vector3(GX, BOARD_Y, GZ),
        fov: 34 + k * 16,
      }
    },

    setDaylight(k: number) {
      daylight = clamp(k)
    },

    activate(ctx: LandmarkContext) {
      ctx.enterSurf?.()
    },

    update(dt, elapsed, lit) {
      if (open && build < 1) {
        build = Math.min(1, build + dt * 0.5)
        applyBuild()
      }
      if (!open || power < 0.01) return

      const night = 1 - daylight

      // a slow mains hum in the tubes — small, but a perfectly steady sign
      // reads as a texture rather than as an object. Offset from the gate's
      // phase by the odd frequency below so the pair never pulse in unison,
      // which would turn two signs into one animated thing.
      const hum = 1 + Math.sin(elapsed * 2.7 + 1.9) * 0.012 + Math.sin(elapsed * 10.3) * 0.006

      // The pool on the ground is the night half of this landmark and does
      // nothing at noon, so it mostly goes with the dark — same call the
      // projector's beacon and the gate's lamp make.
      lamp.intensity = power * 130 * hum * (0.18 + night * 0.82) * (1 + clamp(lit) * 0.35)
      faceMat.color.setScalar(hum * (0.92 + clamp(lit) * 0.08))
      // The lens breathes a little harder than the board does — a lamp behind
      // glass is one filament, and one filament is where mains hum shows. It
      // is done on opacity, NOT on `color`: the lens has a colour of its own
      // (unlike the board, whose white multiplies a texture), and scaling that
      // colour towards grey is how you get an amber lamp that goes silver
      // twice a second.
      clearMat.opacity = power * clamp(0.86 + (hum - 1) * 6, 0.62, 1)
    },

    dispose() {
      for (const o of owned) o.dispose()
    },
  }
}

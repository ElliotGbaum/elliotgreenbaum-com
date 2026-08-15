/**
 * The sign — what watching the film unlocks.
 *
 * IT IS NOT THERE UNTIL IT IS. Before the film has been watched there is
 * nothing out there but field: no locked door, no grey button, no "come back
 * later". A lock you can see is a promise, and a promise you can see is a
 * second thing to do in a world whose entire argument is that there is one.
 * Start the film — starting is enough, see the unlock note in main.ts — and
 * when it lets you go this builds itself out of the ground, the camera goes to
 * read it, and it stays lit from then on, on this visit and every one after.
 *
 * WHAT IT IS, AND WHAT IT USED TO BE. Three versions ago this was a doorway: a
 * cobblestone arch with a purple nether portal in it, which read as a
 * screenshot from a different website pasted over this one. Then the same arch
 * in the field's own materials, which was still a thirteen-unit silhouette
 * competing with the projector. Then no structure at all — a ring of light set
 * flush into the ground with a narrow shaft standing out of it, walked into
 * rather than clicked.
 *
 * The shaft is gone because a column of light does not say what it is. It said
 * "something happens here" and left the rest to a prompt line you only saw
 * once you were already standing in it, and stepping in was enough to fire it,
 * so the way to find out what it did was to have it already done to you. This
 * says it: it is a sign, and it reads PARKOUR CHALLENGE from across the field.
 *
 * AND YOU HAVE TO GET TO IT. It took a click from anywhere in the field once,
 * and that version dropped you into a platformer from thirty units away, which
 * is the one thing the pointer must never do: a click is the gesture in this
 * world that carries no intent — you click to look, you click to dismiss, you
 * click because the pointer happened to be over the only object in the frame.
 * Clicking the board now sends the figure to it and presses it on arrival, so
 * the walk still happens and the game still begins where you are standing in
 * front of the sign. Or walk over yourself, and the badge that floats under the
 * board names the key. One verb, and it is the same verb the machine has.
 *
 * It is still called the gate in code, and its id is still `gate`, because what
 * it does has not changed: it is the thing the film gates.
 */

import * as THREE from 'three'
import { PALETTE, clamp, ease, type Landmark, type LandmarkContext } from '../../core/contract'

/**
 * Where it stands: out to the right, between the spawn and the projector.
 *
 * IT CANNOT BE ON THE CENTRE LINE, and it is worth writing down why, because
 * the centre line is the obvious answer and all of its versions fail. Straight
 * down the middle puts the sign between the camera and the picture for the
 * length of every replay — the exact geometry that killed the projector's
 * throw beam, see the note in projector.ts. Behind the screen it is occluded by
 * the screen. And behind the spawn, which is the one spot that is never in
 * shot, the follow cam trails the figure by 26 units and up to 42 in portrait:
 * standing at the spawn puts the camera *inside* it.
 *
 * SO IT IS OFF TO ONE SIDE — AND HOW FAR TO ONE SIDE IS BOUGHT WITH Z, which
 * is the whole reason this pair moved and the one non-obvious thing on the
 * page. The requirement is absolute: nothing of this board may ever be painted
 * over the picture. But the picture's frame is a CONE out of a camera parked at
 * z = 50, so how far out the sign has to stand is a function of how DEEP it is,
 * not a fixed number of units. The pair used to sit at ±27 on z = 10, thirty-
 * nine units down the cone, where the inner edge cleared the frame by about two
 * degrees and there was no room to bring them in at all. Walking them forward
 * to z = 24 halves the distance to the camera and halves the width of the cone
 * with it, and that is what pays for the six units they came in by: at x = 22
 * the inside edge of a twelve-unit board sits ~27° off the shot's axis, against
 * a half-frame of 19° at 16:9 and ~25° on a 21:9 ultrawide. Closer together,
 * and further clear of the film than they were.
 *
 * (On a 32:9 the boards are in frame, and they were before this too — that
 * shape's half-frame is 35°. They are nowhere near the PICTURE, which is what
 * the rule is about: the screen only reaches 10° off axis at any aspect, and
 * the boards stand at 27°.)
 *
 * BRINGING THEM FORWARD ALSO NARROWS THE PAIR FROM THE SPAWN, which is not
 * obvious and is worth keeping: the reveal camera is not the only shot they
 * have to work in. The gap you see walking up the field goes as x/(72 − z) and
 * the film's clearance pins x to (50 − z), so every unit forward buys a real
 * narrowing on both counts. Moving them in on z = 10 alone would have bought
 * nothing — the clearance would not allow it.
 *
 * THE TWO SIDES ARE STILL NOT THE SAME DISTANCE. The watching shot is not
 * square to the world: the camera sits at x = +3.5 and looks at x = 0 (see
 * projector.ts), so the frame reaches about two units further right of centre
 * than it does left. This board is the right-hand one, so it is the one that
 * stands the extra two units out — the sign opposite is at −20, not −22, and
 * neither is a typo.
 */
const GX = 22
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
 * world: a sign you have to walk around to read is a sign you do not read.
 */
const FACE_Y = Math.atan2(-GX, SPAWN_Z - GZ)
/** the board's normal and its right-hand axis, for framing the reveal shot */
const FACE = new THREE.Vector3(Math.sin(FACE_Y), 0, Math.cos(FACE_Y))
const RIGHT = new THREE.Vector3(Math.cos(FACE_Y), 0, -Math.sin(FACE_Y))

/**
 * The face. Two lines and a double rule — the same double rule the projector's
 * floor rings and the screen's frame are drawn with, which is the whole
 * vocabulary this field has for "this is one of ours".
 *
 * The words are the words: it says what it is, in the same plain register as
 * every other line on screen. No exclamation mark, no "READY?", nothing that
 * would read as arcade cabinet in a field with one lit screen in it.
 */
/**
 * The design size of the face, and how many texels it is actually drawn at.
 *
 * IT IS DRAWN LARGER THAN IT USED TO BE, because 768 texels was not enough to
 * read. The board is twelve units wide and the reveal shot puts it across
 * roughly a third of the frame: on a maximised 2× window that is over a
 * thousand device pixels of board, and stretching 768 across them made a
 * lettered sign whose lettering was soft — worse the bigger the window, which
 * is precisely backwards for the one object in this field whose entire job is
 * to be read from a distance.
 *
 * The scale multiplies the canvas and nothing else: everything below draws in
 * the same 768 × 320 coordinates it always did, so the type is still 76 units
 * tall and the rules are still 5 wide. 12:5 is the board's own shape — change
 * one and the words stretch.
 */
const FACE_W = 768
const FACE_H = 320

function faceTexture(): THREE.CanvasTexture {
  // A one-off static texture, so this is a memory question rather than a frame
  // budget one: 3× on a Retina display is 8MB of atlas for a sign you are
  // meant to be able to read, and 2× is plenty of resolution for a 1× screen.
  const S = (window.devicePixelRatio || 1) >= 2 ? 3 : 2
  const W = FACE_W
  const H = FACE_H
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
  c.fillText('Parkour Challenge', W / 2, H / 2 - 22)

  // the one supporting line, and it is the same promise the prompt makes when
  // you are close enough to read the prompt
  c.fillStyle = PALETTE.amberLitCss
  c.font = '500 26px ui-monospace, "SF Mono", Menlo, monospace'
  c.letterSpacing = '7px'
  c.fillText('FIVE LEVELS', W / 2, H / 2 + 62)

  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  // The board is never square to the camera — it is turned to face the spawn
  // and read from everywhere else — so the mip chain alone blurs the words
  // along whichever axis is foreshortened. three clamps this to whatever the
  // hardware allows, so asking for more than there is costs nothing.
  t.anisotropy = 8
  return t
}

/**
 * The strike. A lit sign coming on is not a dimmer sweep — it stutters, holds,
 * stutters once more and then stays. Discrete beats rather than a curve,
 * because a smooth ramp reads as a fade-in and a fade-in reads as UI.
 */
const BEATS = [0, 0.85, 0.06, 1, 0.22, 1, 1]
function strike(s: number): number {
  if (s <= 0) return 0
  if (s >= 1) return 1
  return BEATS[Math.min(BEATS.length - 1, Math.floor(s * (BEATS.length - 1)))]
}

export interface Gate extends Landmark {
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

export function createGate(): Gate {
  const group = new THREE.Group()
  group.position.set(GX, 0, GZ)
  group.rotation.y = FACE_Y
  group.visible = false

  const owned: Array<{ dispose(): void }> = []

  /* ---- the posts ----
     Their own material instance, not shared with the board: the build raises
     the posts first and brings the board up on top of them, so the two fade
     on different clocks. */
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

  /* The lamp under the hood. It is the proof the sign is powered, and — more
     usefully at night — it throws a warm pool on the ground in front of it, so
     the landmark has a footprint you can aim at from further out than you can
     read the words from. Short range on purpose: at 60 it lit an ellipse most
     of the way to the projector, which is a street light, not a sign. */
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
    postMat.opacity = raise
    boardMat.opacity = raise

    faceMat.opacity = power
    lamp.intensity = power * 130
  }

  applyBuild()

  return {
    id: 'gate',
    title: 'The parkour sign',
    object: group,
    anchor,
    // Wide enough that the prompt is up before you are close enough to have to
    // stop walking, the way the projector's is. It is not a threshold you stand
    // on any more, so there is no reason for it to be tight.
    radius: 13,
    // "Press", not "Click": this is the one line in the field that names an
    // input device, and half the people reading it are on a phone. The
    // projector's line has the same discipline — "switch it on", never "click".
    prompt: 'Press the sign to play — five levels of parkour',
    again: 'Press the sign again to play',
    /**
     * …and the badge on the object itself once you are standing at it, the same
     * one the projector wears. `reach` is under the board rather than on it:
     * the board is words, and a key badge floated over the middle of them is a
     * label sitting on top of a label.
     */
    verb: 'play',
    verbAgain: 'play again',
    /* …and what a click on the sign can land on: the posts and the board. The
       whole board group, so the frame, the words and the hood are all "the
       sign" — you point at a signpost, not at a part of one. Pointing at it
       from out in the field walks the figure over and presses it on arrival;
       main.ts owns that, see `onPointerDown` there. */
    hitTargets: [...legs, board],
    // …and low enough to clear the board's bottom rail in perspective. At 1.1
    // below it the badge sat on the rule and the two amber things fought.
    reach: new THREE.Vector3(GX, BOARD_Y - BOARD_H / 2 - 2.1, GZ).addScaledVector(FACE, 0.6),
    // wider than the projector's, because this is a board you read from a few
    // paces back rather than a knob you put a hand on
    reachRadius: 11,
    /**
     * Standing near a sign is reading it, not pressing it. The light shaft this
     * replaced fired on proximity, which meant walking past the thing was
     * enough to be thrown into a platformer — the same argument the projector
     * makes about the film, and it was always just as true here. It takes an
     * ask: press E (or Enter, or Space) at the board, or click the board and be
     * walked to it. Being near it is never the ask.
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

    revealVantage(aspect: number) {
      // Square-ish to the face, because the whole point of the reveal is that
      // the new thing in the field says what it is: if the words are not
      // readable in this shot the shot has failed. Pushed a little off the
      // normal and kept low so it is a sign standing in a field rather than a
      // billboard filling a frame.
      const k = clamp((1.0 - aspect) / 0.55)
      // 25 units put the board edge-to-edge across the frame, which is the
      // billboard shot this thing is not: the sign is ten units tall counting
      // its legs, and at 34 it takes a bit under half the height and stands in
      // something.
      const d = 34 + k * 14
      const position = new THREE.Vector3(GX, 6 + k * 1.5, GZ)
        .addScaledVector(FACE, d)
        .addScaledVector(RIGHT, 6)
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
      ctx.enterParkour?.()
    },

    update(dt, elapsed, lit) {
      if (open && build < 1) {
        build = Math.min(1, build + dt * 0.5)
        applyBuild()
      }
      if (!open || power < 0.01) return

      const night = 1 - daylight

      // a slow mains hum in the tubes — small, but a perfectly steady sign
      // reads as a texture rather than as an object
      const hum = 1 + Math.sin(elapsed * 3.1) * 0.012 + Math.sin(elapsed * 11.7) * 0.006

      // The pool on the ground is the night half of this landmark and does
      // nothing at noon, so it mostly goes with the dark — same call the
      // projector's beacon makes.
      lamp.intensity = power * 130 * hum * (0.18 + night * 0.82) * (1 + clamp(lit) * 0.35)
      faceMat.color.setScalar(hum * (0.92 + clamp(lit) * 0.08))
    },

    dispose() {
      for (const o of owned) o.dispose()
    },
  }
}

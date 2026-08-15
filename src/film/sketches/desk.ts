/**
 * DESK — him at a laptop, teaching himself to build with it.
 *
 * IT IS THE SAME BOY AS THE CHESS DRAWING, FIFTEEN YEARS LATER, and that is the
 * whole idea of putting him in profile again rather than inventing a second
 * figure. The film has already spent four seconds on a small person with his
 * chin on his hand working something out; this is that person, at a desk, with
 * the thing he is working out on a screen in front of him. The rhyme does more
 * than any amount of drawing could.
 *
 * WHAT MAKES HIM OLDER IS ONE RATIO, and it is the same one that made him five.
 * CHIN TO TABLETOP = 1.23 HEAD HEIGHTS, where the chess boy's is 0.80. A small
 * child at an adult table has the top of it crossing near his armpit; a grown
 * man clears it by a head and a quarter. The head strokes are literally the
 * chess drawing's, run through `xform` — scaled down about the chin and lifted
 * — because the face is not what changed and redrawing it would only mean
 * drawing a different person.
 *
 * THE POSE IS THE OTHER HALF. Chin on hand is thinking; both hands down on a
 * keyboard is WORKING, and this act is about the second thing. The arm comes
 * forward out of the shoulder and lands on the keys — one closed contour, so it
 * arrives as a gesture rather than as four unrelated lines, and so it is
 * unambiguously in front of the torso instead of being a seam on it.
 *
 * THE LAPTOP IS TWO QUADS AND IT HAS TO BE. A screen alone is a picture frame;
 * a keyboard alone is a mat. The HINGE between them — the far edge of the base
 * IS the bottom edge of the screen, one shared pair of corners — is the joint
 * that makes them one object, and it is why the base and the screen are
 * authored off the same two points rather than sketched separately.
 *
 * The screen LEANS BACK, away from him. Drawn upright it is a monitor, and a
 * monitor on a desk with a keyboard in front of it is a different decade.
 *
 * FOUR RAGGED LINES ON THE SCREEN. Not a chart, not a window with a title bar:
 * short runs of different lengths at different indents, which is what code
 * looks like from across a room and is not what anything else looks like. They
 * are the lightest marks in the drawing and they drop out first at small sizes,
 * which is correct — the silhouette is the picture.
 *
 * See src/film/sketches/kit.ts.
 */

import type { SketchData, SketchStroke } from '../sketch'
import type { A } from './kit'
import { W, curve, dot, fit, hand, line, poly, xform } from './kit'

/* ==================================================================== *
 * The room
 * ==================================================================== */

/** where the desk is, and therefore where everything stands */
const TOP = 0.845
/** the desk is BOUNDED. Two rules running off both edges of the frame are a
 *  strikethrough, not a surface. */
const L = 0.015
const R = 0.99

/* ==================================================================== *
 * The head — the chess drawing's, at fifteen years older
 *
 * Authored at the chess file's own coordinates and then moved as one, so
 * the two faces are the same face and stay that way if either is touched.
 * ==================================================================== */

const FACE: SketchStroke[] = [
  /* the profile, one stroke: hairline, forehead, brow, nose, lip, chin */
  hand(
    curve(W.edge, [
      [0.383, 0.402],
      [0.372, 0.424],
      [0.394, 0.462],
      [0.411, 0.487],
      [0.388, 0.502],
      [0.381, 0.518],
      [0.394, 0.53],
      [0.384, 0.542],
      [0.392, 0.554],
      [0.372, 0.57],
      [0.375, 0.59],
    ]),
    0.0022,
    1.4,
  ),

  /* the hair, one mass, carrying on from where the profile started */
  hand(
    curve(W.edge, [
      [0.383, 0.402],
      [0.379, 0.362],
      [0.386, 0.336],
      [0.352, 0.312],
      [0.316, 0.29],
      [0.272, 0.277],
      [0.232, 0.284],
      [0.2, 0.272],
      [0.16, 0.298],
      [0.126, 0.336],
      [0.108, 0.382],
      [0.103, 0.432],
      [0.111, 0.484],
      [0.129, 0.53],
      [0.152, 0.566],
      [0.171, 0.598],
    ]),
    0.003,
    2.6,
  ),

  /* the eye — a wedge, with the pupil pushed into the front corner and low,
     which is the whole of "looking at the screen" for two marks */
  curve(
    W.fine,
    [
      [0.343, 0.452],
      [0.359, 0.444],
      [0.372, 0.453],
      [0.357, 0.458],
    ],
    { closed: true },
  ),
  dot(1.9, 0.3665, 0.4535, 0.0055),
  curve(W.line, [
    [0.337, 0.431],
    [0.357, 0.4245],
    [0.377, 0.4295],
  ]),

  /* under the jaw and down the throat */
  hand(
    curve(W.edge, [
      [0.375, 0.59],
      [0.352, 0.601],
      [0.316, 0.607],
      [0.286, 0.617],
      [0.277, 0.649],
      [0.269, 0.687],
    ]),
    0.002,
    3.8,
  ),
]

/** the chess head, scaled about its own chin and lifted clear of the desk */
const HEAD = xform(FACE, { about: [0.375, 0.59], scale: 0.83, dy: -0.09 })

/* ==================================================================== *
 * The rest of him
 * ==================================================================== */

/** the back of him: nape, spine, and down to the desk in one */
const SPINE = hand(
  curve(W.edge, [
    [0.1905, 0.5065],
    [0.1885, 0.5645],
    [0.1665, 0.6345],
    [0.1405, 0.7205],
    [0.1225, 0.8005],
    [0.1185, TOP],
  ]),
  0.0035,
  5.0,
)

/** the front of him, from the throat to the desk. In front of the spine and
 *  BEHIND the arm, which is drawn after it and closes over it. */
const CHEST = hand(
  curve(W.edge, [
    [0.2822, 0.5849],
    [0.3105, 0.6405],
    [0.3205, 0.7205],
    [0.3165, 0.7905],
    [0.3225, TOP],
  ]),
  0.003,
  7.4,
)

/**
 * THE ARM AND THE HAND, ONE CLOSED CONTOUR, for the same three reasons the
 * chess drawing's is: authoring both edges in the same path is what forces the
 * taper, a closed contour is unambiguously an object IN FRONT of the torso
 * rather than a seam on it, and in the reveal it arrives as a whole gesture.
 *
 * It TAPERS — wrist 0.55 of the shoulder — and it lands with the knuckles
 * PROUD of the wrist, which is the one mark that turns the end of a limb into a
 * hand resting on something.
 */
const ARM = hand(
  curve(
    W.edge,
    [
      [0.2545, 0.5905],
      [0.3025, 0.6485],
      [0.3545, 0.7085],
      [0.4185, 0.7565],
      [0.4885, 0.7885],
      [0.5285, 0.8025],
      [0.5445, 0.8185],
      [0.5145, 0.8295],
      [0.4645, 0.8175],
      [0.3985, 0.7925],
      [0.3305, 0.7505],
      [0.2745, 0.6925],
      [0.2265, 0.6405],
    ],
    { closed: true },
  ),
  0.0022,
  6.2,
)

/* ==================================================================== *
 * The laptop
 *
 * One-point perspective, near edge horizontal and parallel to the desk, so
 * the machine is LOCKED to it. The base's far edge and the screen's bottom
 * edge are the same two points — that shared hinge is what makes the two
 * quads one object instead of a mat with a frame standing behind it.
 * ==================================================================== */

/** the four corners of the base, near pair then far pair */
const BASE_NL: A = [0.455, 0.83]
const BASE_NR: A = [0.815, 0.83]
const HINGE_L: A = [0.515, 0.778]
const HINGE_R: A = [0.8, 0.778]
/** the top of the screen, leaning back and away from him */
const SCREEN_L: A = [0.585, 0.548]
const SCREEN_R: A = [0.87, 0.562]

/** a point on the face of the screen: `u` across from its top left, `v` down */
const onScreen = (u: number, v: number): A => [
  SCREEN_L[0] + (SCREEN_R[0] - SCREEN_L[0]) * u + (HINGE_L[0] - SCREEN_L[0]) * v,
  SCREEN_L[1] + (SCREEN_R[1] - SCREEN_L[1]) * u + (HINGE_L[1] - SCREEN_L[1]) * v,
]

/** a rule across the base, `d` of the way back from its near edge */
const acrossBase = (d: number, from: number, to: number): SketchStroke => {
  const at = (u: number): A => [
    BASE_NL[0] + (BASE_NR[0] - BASE_NL[0]) * u + (HINGE_L[0] - BASE_NL[0]) * d,
    BASE_NL[1] + (BASE_NR[1] - BASE_NL[1]) * u + (HINGE_L[1] - BASE_NL[1]) * d,
  ]
  const a = at(from)
  const b = at(to)
  return line(W.fine, a[0], a[1], b[0], b[1])
}

/** one run of code on the screen */
const code = (v: number, from: number, to: number): SketchStroke => {
  const a = onScreen(from, v)
  const b = onScreen(to, v)
  return line(W.hair, a[0], a[1], b[0], b[1])
}

const LAPTOP: SketchStroke[] = [
  /* the base AND its near thickness, one closed mark — without the thickness
     the keyboard is a pattern painted on the desk */
  poly(W.edge, [
    HINGE_L,
    HINGE_R,
    BASE_NR,
    [BASE_NR[0], BASE_NR[1] + 0.012],
    [BASE_NL[0], BASE_NL[1] + 0.012],
    BASE_NL,
    HINGE_L,
  ]),

  /* the screen, hinged on the base's own far edge */
  poly(W.edge, [HINGE_L, SCREEN_L, SCREEN_R, HINGE_R, HINGE_L]),

  /* two rules across the keys. Three and it is a spreadsheet. */
  acrossBase(0.34, 0.08, 0.94),
  acrossBase(0.66, 0.14, 0.9),

  /* and what is on the screen */
  code(0.18, 0.1, 0.62),
  code(0.34, 0.18, 0.8),
  code(0.5, 0.18, 0.52),
  code(0.66, 0.1, 0.44),
]

const STROKES: SketchStroke[] = [
  /* ---- the head, complete, so there is a person on screen from the first
     mark, and the desk under it so he has somewhere to be ---- */
  ...HEAD,

  poly(W.edge, [
    [L, 0.9],
    [L, TOP],
    [R, TOP],
    [R, 0.9],
  ]),

  /* ---- the pose ---- */
  SPINE,
  CHEST,
  ARM,

  /* ---- and the front face of the desk ---- */
  poly(W.line, [
    [L, 0.9],
    [R, 0.9],
  ]),

  /* ---- the machine, last. A man at a desk is a picture without a laptop; a
     laptop is not a picture without the man. ---- */
  ...LAPTOP,
]

export const DESK: SketchData = fit(STROKES)

/**
 * SAX — him on the alto at the Greenwich Town Party, act 2 right.
 *
 * IT IS HIM, NOT THE INSTRUMENT — the same change its neighbour made, for the
 * same reason. The caption under it used to name a thing ("Alto sax · jazz
 * band"), and a label naming a thing wants a picture of the thing. It says
 * "This is me" now, and that wants the person.
 *
 * THE TWO DRAWINGS IN THIS ACT ARE THE SAME BOY AT THE SAME SCALE. They stand
 * side by side for four seconds with nothing between them, so a half-figure
 * next to a full one is not a composition, it is a mistake. Same head at the
 * top, same feet at the bottom. The dress is what differs, and it is doing real
 * work: a school-stage polo on the left, a suit and lapels on the right,
 * because one of these was a talent show and the other was a town paying him to
 * be there.
 *
 * ── WHY THIS FILE WAS REBUILT ────────────────────────────────────────────
 *
 * The pass before this one hung the whole horn ON HIS CHEST: the body tube ran
 * down the middle of the torso, the bow sat on the waistline and the bell
 * crossed his own outline on the way up. Every line in the instrument therefore
 * landed within a few points of a line in the boy, and at act-2 size the two
 * merged into one busy shape. Reviewers read a megaphone, a bugle and a cone on
 * a stick; nobody read a saxophone. The instrument was drawn correctly and
 * placed impossibly.
 *
 * THE HORN HANGS OUTBOARD NOW, off his right side, with open frame between it
 * and his ribs. That single move is most of the fix: the tube, the bow and the
 * bell are all read against black rather than against him, so the silhouette
 * that says "saxophone" is the only thing in that part of the picture. His
 * arms then have somewhere to go — they reach ACROSS the gap to the keys, and
 * the reach is itself a saxophone cue, because no other instrument is held out
 * to one side and played with both hands crossing to it.
 *
 * THE HORN IS BUILT, NOT TYPED. It used to be thirty hand-placed anchors, and
 * hand-placed anchors are how the bow ends up not leaving at the angle its own
 * tube arrives at — a kink at the joint, every time, which reads as a dent.
 * Here there is ONE AXIS for the whole hook (the bow's arc, then the bell's
 * curve) and one radius function along it, and the two walls are swept off it.
 * The tube cannot kink, the bow cannot pinch, and the flare is one number.
 *
 * WHAT MAKES IT READ AS A SAXOPHONE, in order of how much it matters:
 *
 *   THE BELL, WHICH HAS TO BE ENORMOUS AND SHORT, and which has to open into
 *   EMPTY FRAME. Its walls flare late — nearly all of it in the last third,
 *   because a taper spread evenly over a long run is a taper nobody notices,
 *   and that is how the old bell read as pipe.
 *
 *   THE MOUTH IS A HOLE. The outline goes round the far rim and a second mark
 *   comes back across the near one, so you are looking INTO it. A single closed
 *   curve on the end of a tube is a cap, and a cap is a funnel.
 *
 *   THE BOW: a tight U at the bottom, well clear of both legs. It is what turns
 *   two tubes into one instrument.
 *
 *   THE CROOK REACHING HIS MOUTH. The long diagonal from the top of the horn up
 *   across to his face is the mark that says he is PLAYING it rather than
 *   holding it. The mouthpiece ends INSIDE the face outline — a mouthpiece
 *   stopping a hair short of the lips is a man about to sneeze. There is no
 *   mouth drawn on this face and there must not be: the mouthpiece is in it.
 *
 *   THE KEYS. Three pearls down the near wall of the body tube. They cost three
 *   marks and they are the difference between a tube and a woodwind.
 *
 * See src/film/sketches/kit.ts.
 */

import type { SketchData, SketchStroke } from '../sketch'
import type { A } from './kit'
import { W, curve, fit, hand, line, poly, ring } from './kit'

/* ==================================================================== *
 * The horn, built off one axis
 *
 * Everything below is solved from four numbers: where the bow is, how big
 * it is, how far the body tube leans off vertical, and where the mouth of
 * the bell ends up. Move any of them and the whole instrument follows
 * without a single joint coming apart.
 * ==================================================================== */

/** the centre of the bow, its radius, and the lean of the body tube in radians */
const BOW_C: A = [0.3, 0.556]
const BOW_R = 0.04
const BOW_LEAN = 0.057

/** a point on the bow's circle */
const onBow = (a: number): A => [BOW_C[0] + Math.cos(a) * BOW_R, BOW_C[1] + Math.sin(a) * BOW_R]

/**
 * Where the body tube hands over to the bow, and where the bow hands over to
 * the bell. Taking them off the SAME circle at antipodal angles is what makes
 * the bow leave each tube at exactly the angle that tube arrives at.
 */
const JOINT: A = onBow(BOW_LEAN)
const BELL_0: A = onBow(BOW_LEAN + Math.PI)
/**
 * The top of the body tube, where the crook joins it.
 *
 * IT IS HIGH — level with his chest, not his waist. The first build of this
 * geometry stopped the tube at 0.30 and left the crook to cover the whole
 * distance from there up to his mouth, which is a third of the figure's height:
 * a fat tube on a long diagonal across his shoulder, and it read as a strap or
 * a lasso. An alto's neck is SHORT. Give the body tube the length and the crook
 * becomes what it is on the instrument — a little hook at the top.
 */
const BODY_TOP: A = [JOINT[0] + Math.sin(BOW_LEAN) * 0.3, JOINT[1] - Math.cos(BOW_LEAN) * 0.3]

/** the mouth of the bell, out in open frame where nothing is behind it */
const MOUTH: A = [0.124, 0.322]
/** the bell leaves the bow going straight up and swings out from there */
const BELL_CTRL: A = [BELL_0[0] + Math.sin(BOW_LEAN) * 0.1, BELL_0[1] - Math.cos(BOW_LEAN) * 0.1]

const qbez = (p0: A, p1: A, p2: A, s: number): A => {
  const u = 1 - s
  return [
    u * u * p0[0] + 2 * u * s * p1[0] + s * s * p2[0],
    u * u * p0[1] + 2 * u * s * p1[1] + s * s * p2[1],
  ]
}

/** the axis of the whole hook — the bow, then the bell — and its radius along it */
const HOOK: A[] = []
const HOOK_R: number[] = []
{
  const BOW_STEPS = 14
  for (let i = 0; i <= BOW_STEPS; i++) {
    HOOK.push(onBow(BOW_LEAN + Math.PI * (i / BOW_STEPS)))
    HOOK_R.push(0.024)
  }
  const BELL_STEPS = 18
  for (let i = 1; i <= BELL_STEPS; i++) {
    const s = i / BELL_STEPS
    HOOK.push(qbez(BELL_0, BELL_CTRL, MOUTH, s))
    // late flare — see the note at the top
    HOOK_R.push(0.024 + 0.062 * Math.pow(s, 2.3))
  }
}

/** the unit tangent of a sampled axis at `i`, by difference with its neighbours */
const tangent = (axis: ReadonlyArray<A>, i: number): A => {
  const a = axis[Math.max(0, i - 1)] as A
  const b = axis[Math.min(axis.length - 1, i + 1)] as A
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const m = Math.hypot(dx, dy) || 1
  return [dx / m, dy / m]
}

/** one wall of a swept tube. `side` is +1 for the left of travel, −1 for the right. */
const wall = (axis: ReadonlyArray<A>, rad: ReadonlyArray<number>, side: number): A[] =>
  axis.map((p, i) => {
    const [tx, ty] = tangent(axis, i)
    const r = (rad[i] as number) * side
    return [p[0] - ty * r, p[1] + tx * r] as A
  })

/** both walls of a swept tube, as one closed outline */
const tube = (axis: ReadonlyArray<A>, rad: ReadonlyArray<number>): A[] => [
  ...wall(axis, rad, -1),
  ...wall(axis, rad, 1).reverse(),
]

/* ---- the mouth of the bell, as an ellipse about the axis's last tangent ---- */
const MOUTH_R = HOOK_R[HOOK_R.length - 1] as number
/** how far the rim bulges past the centre of the mouth — the foreshortening */
const MOUTH_D = 0.03
const [MUX, MUY] = tangent(HOOK, HOOK.length - 1)
/** θ = 0 is the near rim, θ = π the far one, θ = π/2 the bulge past the mouth */
const rimAt = (th: number): A => [
  MOUTH[0] + -MUY * MOUTH_R * Math.cos(th) + MUX * MOUTH_D * Math.sin(th),
  MOUTH[1] + MUX * MOUTH_R * Math.cos(th) + MUY * MOUTH_D * Math.sin(th),
]
const rim = (from: number, to: number): A[] => {
  const out: A[] = []
  for (let i = 0; i <= 14; i++) out.push(rimAt(from + (to - from) * (i / 14)))
  return out
}

/* ---- the body tube: parallel walls are pipe, so it diverges on the way down ---- */
const BODY_AXIS: A[] = []
const BODY_R: number[] = []
for (let i = 0; i <= 8; i++) {
  const s = i / 8
  BODY_AXIS.push([
    BODY_TOP[0] + (JOINT[0] - BODY_TOP[0]) * s,
    BODY_TOP[1] + (JOINT[1] - BODY_TOP[1]) * s,
  ])
  BODY_R.push(0.017 + 0.007 * s)
}

/* ---- the crook: up out of the body, then over toward his mouth ---- */
const CROOK_AXIS = curve(W.line, [
  BODY_TOP,
  [0.3596, 0.2168],
  [0.3886, 0.1898],
  [0.4266, 0.1788],
]).c as A[]
const CROOK_R = CROOK_AXIS.map((_, i) => 0.013 - 0.005 * (i / (CROOK_AXIS.length - 1)))

/** a pearl key, `s` of the way down the body tube and a hair to its near side */
const key = (s: number): SketchStroke =>
  ring(
    W.fine,
    BODY_TOP[0] + (JOINT[0] - BODY_TOP[0]) * s + 0.004,
    BODY_TOP[1] + (JOINT[1] - BODY_TOP[1]) * s,
    0.0085,
  )

const STROKES: SketchStroke[] = [
  /* ================================================================ *
   * The boy — the same figure as the guitar, in a suit
   * ================================================================ */

  hand(
    curve(
      W.edge,
      [
        [0.505, 0.026],
        [0.556, 0.048],
        [0.56, 0.098],
        [0.535, 0.145],
        [0.505, 0.158],
        [0.475, 0.145],
        [0.45, 0.098],
        [0.454, 0.048],
      ],
      { closed: true },
    ),
    0.003,
    1.4,
  ),

  curve(W.line, [
    [0.451, 0.07],
    [0.456, 0.028],
    [0.492, 0.01],
    [0.532, 0.015],
    [0.556, 0.036],
    [0.561, 0.072],
  ]),

  /* ---- eyes only. The mouth is the mouthpiece's job. ---- */
  curve(W.fine, [
    [0.47, 0.086],
    [0.482, 0.078],
    [0.494, 0.086],
  ]),
  curve(W.fine, [
    [0.518, 0.086],
    [0.53, 0.078],
    [0.542, 0.086],
  ]),

  line(W.line, 0.482, 0.152, 0.478, 0.196),
  line(W.line, 0.528, 0.152, 0.532, 0.196),

  hand(
    curve(
      W.edge,
      [
        [0.478, 0.196],
        [0.424, 0.222],
        [0.412, 0.3],
        [0.418, 0.4],
        [0.428, 0.5],
        [0.434, 0.56],
        [0.505, 0.572],
        [0.576, 0.56],
        [0.582, 0.5],
        [0.592, 0.4],
        [0.598, 0.3],
        [0.586, 0.222],
        [0.532, 0.196],
      ],
      { closed: true },
    ),
    0.0035,
    2.6,
  ),

  /* ---- the lapels. Two marks, and the polo on the left becomes a suit.
     SHORT ones, ending above his own forearm: below 0.28 the arm is crossing
     the chest on its way to the keys, and a lapel running under an arm is a
     bandolier — which, with a diagonal arm over it, is exactly what the pair
     of them drew last pass. ---- */
  curve(W.line, [
    [0.474, 0.202],
    [0.462, 0.238],
    [0.468, 0.276],
  ]),
  curve(W.line, [
    [0.54, 0.202],
    [0.554, 0.238],
    [0.55, 0.278],
  ]),

  hand(
    curve(
      W.edge,
      [
        [0.434, 0.56],
        [0.424, 0.68],
        [0.428, 0.8],
        [0.434, 0.93],
        [0.43, 0.962],
        [0.474, 0.966],
        [0.478, 0.93],
        [0.482, 0.8],
        [0.492, 0.69],
        [0.505, 0.62],
        [0.518, 0.69],
        [0.528, 0.8],
        [0.532, 0.93],
        [0.536, 0.966],
        [0.58, 0.962],
        [0.576, 0.93],
        [0.582, 0.8],
        [0.586, 0.68],
        [0.576, 0.56],
      ],
      { closed: true },
    ),
    0.003,
    3.8,
  ),

  /* ================================================================ *
   * The horn — the hook first, because it is the biggest shape in the
   * drawing and every intermediate state of bottom-up is a picture of
   * something. Top down there is a long beat holding a bare tube with a
   * beak on it, which is a periscope.
   * ================================================================ */

  /** the bow and the bell, ONE outline: down the far side, round the bow, up
   *  the bell's far wall, round the rim, and back down the near wall */
  hand(
    poly(W.edge, [
      ...wall(HOOK, HOOK_R, -1),
      ...rim(Math.PI, 0),
      ...wall(HOOK, HOOK_R, 1).reverse(),
    ]),
    0.0035,
    1.1,
  ),

  /* ---- the near rim, closing the ellipse. Without it the mouth is a paddle,
     and a paddle on a tube is what we are drawing our way out of. ---- */
  poly(W.line, rim(0, -Math.PI)),

  /* ---- the body tube ---- */
  hand(poly(W.edge, tube(BODY_AXIS, BODY_R)), 0.003, 7.3),

  /* ---- the crook ---- */
  hand(poly(W.line, tube(CROOK_AXIS, CROOK_R)), 0.0022, 9.7),

  /* ---- the mouthpiece: a beak, in straight lines, because it is a machined
     part — and it ENDS INSIDE THE FACE. ---- */
  poly(W.line, [
    [0.4236, 0.1688],
    [0.4796, 0.1308],
    [0.4856, 0.1428],
    [0.4306, 0.1888],
    [0.4236, 0.1688],
  ]),

  /* ---- three pearls, on the near wall. Down the middle of the tube they are
     a recorder; on the far wall they are holes punched through it. ---- */
  key(0.22),
  key(0.44),
  key(0.66),

  /* ================================================================ *
   * The arms, last, so both hands land on the horn
   *
   * ONE CLOSED LOOP EACH, out and back, exactly the way the guitar's arms are
   * drawn — and it took two passes to come back to that. Left as two open
   * edges running into the instrument, each arm is a pair of long, gently
   * curved, near-parallel lines with nothing closing either end, and that is
   * not a limb, it is a strap. His left one in particular read as a sash
   * across the chest. Closed, with a rounded end at the wrist and a real bend
   * at the elbow, the same path is unmistakably an arm.
   *
   * His LEFT crosses his chest to the upper stack and his RIGHT comes down his
   * own side to the low keys, which is the way round a saxophone is actually
   * played. It is also the reach that says saxophone: nothing else is held out
   * to one side and played with both hands crossing to it. The elbows are
   * pushed outside the torso — an arm that never leaves the body's silhouette
   * is a fold in a coat.
   * ================================================================ */

  curve(
    W.line,
    [
      [0.5885, 0.2405],
      [0.5985, 0.2905],
      [0.5645, 0.3465],
      [0.4805, 0.3765],
      [0.4025, 0.3745],
      [0.3925, 0.3505],
      [0.4785, 0.3465],
      [0.5485, 0.3185],
      [0.5745, 0.2745],
    ],
    { closed: true },
  ),

  curve(
    W.line,
    [
      [0.4235, 0.2265],
      [0.3985, 0.2765],
      [0.3885, 0.3505],
      [0.3845, 0.4185],
      [0.3765, 0.4685],
      [0.4085, 0.4885],
      [0.4325, 0.4285],
      [0.4445, 0.3565],
      [0.4525, 0.2905],
      [0.4585, 0.2505],
    ],
    { closed: true },
  ),
]

export const SAX: SketchData = fit(STROKES)

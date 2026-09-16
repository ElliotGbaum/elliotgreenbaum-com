/**
 * PORTRAIT — the face that draws itself under the title.
 *
 * Thirty-two marks, measured off refs/face.png. It is not a tracing: at the
 * size act 0 hangs it, thrown on a screen thirty units away, a tracing is four
 * hundred strokes that resolve into a smudge. It is the handful of things
 * about him a person who knows him would name from across a room: a big soft
 * sweep of hair lofting to the viewer's left, a long oval face with a rounded
 * chin, narrow eyes under heavy flat brows, an easy closed smile, and an open
 * white collar.
 *
 * ── WHAT THIS PASS CHANGED, AND WHY ──────────────────────────────────────
 *
 * The drawing before this one had spent fourteen passes fighting one bug —
 * every attempt at a hairline read as a HAT — and had settled it by deleting
 * the hairline altogether: one contour round the head, the hair implied by
 * the loft of the silhouette and one lock. Honest, and it did not read as a
 * hat. It read as a BALD MAN WITH A COMB-OVER, which against the photograph
 * is the single most wrong thing a drawing of him can be. He has a lot of
 * hair. The point of this pass is to draw it.
 *
 * WHY THE HAIRLINE IS BACK AND IS NOT A HAT. The earlier hairlines were all
 * one thing: a smooth arch running PARALLEL to the skull, and two parallel
 * contours bound a band, and a band round a cranium is headgear whatever else
 * is drawn. What says "hair" instead of "brim" is DIRECTION: two sweep
 * strokes inside the mass, both bowed the way the hair is actually combed
 * (his left to his right, low to high, so on screen they climb to the
 * viewer's left), each starting near the hairline and ending free in the
 * mass, plus one tuft that breaks the outline at the wave. A hat has no
 * grain. Hair is nothing but grain. They are two, not three, and not the
 * same length: three near-parallel strokes read as the ribs of a cap. The hairline itself
 * is not an arch either — it dips lowest over the viewer's-left brow where the
 * wave comes forward and rises to the right where the hair lies flat back —
 * so it is not parallel to anything.
 *
 * THE HEAD GOT WIDER — 0.41 across against 0.51 tall, a ratio of 0.80 (the
 * photograph measures 0.78; it was drawn at 0.72). All of the width is hair:
 * the face itself is 0.32 across at the cheekbone, which is the 0.62 of head
 * height a long oval face has. The hair mass reaches down past the eye line
 * on both sides, which is where his sits, so the cheek contour hands off to
 * the hair at EYE level, not at the temple.
 *
 * THE JAW IS SOFT. The gonial corner is gone — he does not have one you can
 * see — and the chin is a rounded 0.09 across, flat only for 0.03 of it.
 *
 * THE NECK IS SHORTER (0.10 chin to yoke, was 0.104 but the head is larger
 * now so it reads shorter) and the collar is a COLLAR: two leaves with real
 * points either side of a V, the near one a little larger because it is
 * nearer, the V closing at the sternum and the placket carrying on down with
 * two buttons. The old near leaf was a single diagonal from the shoulder to
 * the chest and read as a lapel or a cape.
 *
 * ── STANDING RULES, kept from the passes before ──────────────────────────
 *
 *   NO TWO HEAVY LINES RUNNING NEAR-PARALLEL. The hairline is W.line under a
 *   W.edge silhouette and its shape diverges from it everywhere.
 *   NOTHING MAY CONVERGE THAT IS NOT MEANT TO CLOSE. The collar closes at the
 *   V on purpose; nothing else does.
 *   NO TERMINAL IN OPEN SPACE except a hair tip, which is supposed to.
 *   NOTHING SHORTER THAN 0.04.
 *   THE EAR IS ATTACHED AT BOTH ENDS to the head's contour (see EAR); drawn
 *   free it was read as a hoop, a bracket and a hook.
 *   THE IRIS TOUCHES THE UPPER LID. White over an iris is a startled face.
 *   THE FACE GOES DOWN FIRST — cheeks, chin, eyes, nose, brows, mouth — and
 *   the hair arrives on a finished face. A hairdo with no eyes is a hat; a
 *   face with no mouth is a mask. Each eye is followed by its own iris so no
 *   frame winks, and the brows land as a pair.
 *   SHOULDERS ARE SYMMETRIC AT EVERY CUT: inner pair, then outer pair.
 *
 * ── SYMMETRY ─────────────────────────────────────────────────────────────
 *
 * The features are authored on the left and mirrored so the file can be read
 * back, and the life comes from TILT: the whole head turns six degrees about
 * the base of the neck, crown to the viewer's left, which is the way it sits
 * in the photograph (his is nearer nine). The hair is authored whole, because
 * its asymmetry is the most characterful thing in the drawing.
 *
 * ── PROPORTION, as fractions of the authored frame ───────────────────────
 *
 *   hair top 0.09 · hairline 0.23 · brow 0.29 · eye 0.34 · nose base 0.445 ·
 *   mouth 0.495 · chin 0.60 · yoke 0.70 · V 0.84
 *   Off the photograph, as fractions of top-to-chin: hairline 0.25, brow
 *   0.39, eye 0.48, nose 0.69, mouth 0.78 — this file is 0.27, 0.39, 0.49,
 *   0.70, 0.79.
 *
 * See src/film/sketches/kit.ts.
 */

import type { SketchData, SketchStroke } from '../sketch'
import { W, curve, dot, fit, hand, mirror, poly, xform } from './kit'

/* ---- the landmarks every measurement above is quoted against ---- */
const EYE = 0.34
const CHIN = 0.6
const YOKE = 0.7
const AXIS = 0.5

/* ---- the parts that come in pairs, authored once on the left ---- */

/**
 * The side of the FACE, chin corner to where the hair takes over at eye
 * level. CONVEX all the way and still OPENING at the eye line — no gonial
 * corner, because the photograph has none to show, and no waist either: the
 * cheek used to turn back in at 0.35 and the hair flared out again above it,
 * which made the head a peanut. Now cheek and hair are one oval, widest a
 * little above the eyes, and the join is invisible. Its top anchor is shared
 * with HAIR_L / HAIR_R so the two are one contour.
 */
const CHEEK = curve(W.edge, [
  [0.445, 0.583],
  [0.413, 0.558],
  [0.382, 0.52],
  [0.357, 0.475],
  [0.338, 0.43],
  [0.325, 0.39],
  [0.316, 0.35],
])

/** The chin, sharing both of CHEEK's lower endpoints. Rounded, and flat for
 *  only 0.03 along the bottom. */
const CHIN_S = curve(W.edge, [
  [0.445, 0.583],
  [0.465, 0.596],
  [0.485, CHIN],
  [0.515, CHIN],
  [0.535, 0.596],
  [0.555, 0.583],
])

/**
 * Brow: heavy, flat, low, peaking at the outer third and dropping at the
 * tail. Authored separately from its opposite number — his are out of level.
 */
const BROW_L = curve(2.2, [
  [0.462, 0.297],
  [0.44, 0.288],
  [0.415, 0.284],
  [0.39, 0.293],
])

const BROW_R = curve(2.2, [
  [0.538, 0.293],
  [0.56, 0.284],
  [0.585, 0.281],
  [0.61, 0.29],
])

/**
 * Upper lid — a wave, not an arch: it rises hard off the inner corner, peaks
 * a third of the way along, then runs shallow to an outer corner that rides
 * a shade above the inner one.
 */
const LID_UPPER = curve(W.line, [
  [0.44, 0.339],
  [0.415, 0.328],
  [0.393, 0.333],
  [0.375, 0.345],
])

/** Lower lid: light, starting on the upper lid's outer corner and stopping
 *  well short of the nose, so the two never close into a lens. */
const LID_LOWER = curve(W.fine, [
  [0.375, 0.345],
  [0.39, 0.354],
  [0.415, 0.356],
])

/** The iris, 40% of the eye's width, its top cut by the upper lid, and DEAD
 *  CENTRE between the corners (0.375 and 0.44). Mirrored, a hundredth either
 *  way is a squint: 0.405 read wall-eyed and 0.418 read cross-eyed. */
const IRIS = dot(1.8, 0.408, EYE + 0.001, 0.0105)

/**
 * The neck. Starts ON the jaw and converges upward — 0.095 of half-width at
 * the jaw against 0.108 at the yoke — and stops where the collar's stand
 * takes over.
 */
const NECK = curve(W.edge, [
  [0.405, 0.542],
  [0.4, 0.6],
  [0.396, 0.65],
  [0.392, YOKE],
])

/**
 * The collar, near leaf: the outer edge leaves the neck line, turns out to a
 * real point, and the inner edge runs back in to the V. The far leaf is the
 * mirror but a little smaller, because it is further from the camera.
 */
const COLLAR_OUT = curve(W.line, [
  [0.392, YOKE],
  [0.36, 0.716],
  [0.328, 0.768],
])
const COLLAR_IN = poly(W.line, [
  [0.328, 0.768],
  [0.41, 0.812],
  [0.49, 0.855],
])

/**
 * The shoulder, in two: the trapezius from the collar out to the deltoid,
 * and the arm, which changes rate at the shoulder tip and runs off the
 * bottom of the frame. Two head-widths across, which is the narrowest a man
 * reads as.
 */
const TRAP = curve(W.edge, [
  [0.36, 0.716],
  [0.295, 0.735],
  [0.225, 0.762],
  [0.16, 0.8],
])
const ARM = curve(1.6, [
  [0.16, 0.8],
  [0.128, 0.85],
  [0.118, 0.915],
  [0.122, 0.985],
])

/* ==================================================================== *
 * The hair — the argument of this pass. See the header.
 * ==================================================================== */

/**
 * The outline, viewer's left half: the upper half of ONE ellipse, centred
 * at (0.5, 0.35), 0.184 across by 0.245 tall, from eye level over the crown.
 * It used to loft into a wave that peaked left of the axis with a seam at
 * the crown and a tuft breaking through the top, and Elliot read the top of
 * the head as uneven, "not a proper shaped head" (2026-09-16). So the dome
 * is a true oval now, jittered only lightly, and the lean of his hair is
 * carried by the hairline and the sweeps inside it instead of the silhouette.
 */
const HAIR_L = curve(W.edge, [
  [0.316, 0.350],
  [0.325, 0.274],
  [0.351, 0.206],
  [0.392, 0.152],
  [0.443, 0.117],
  [0.500, 0.105],
])

/** The right half: the same ellipse on, from the crown back down to eye
 *  level. It starts where HAIR_L ends, at the top of the dome. */
const HAIR_R = curve(W.edge, [
  [0.500, 0.105],
  [0.557, 0.117],
  [0.608, 0.152],
  [0.649, 0.206],
  [0.675, 0.274],
  [0.684, 0.350],
])

/**
 * THE HAIRLINE. Lowest over the viewer's-left brow, where the wave comes
 * forward, and rising to the right where the hair is combed flat and back.
 * It stops at the crown, well short of the right temple, and starts ON the
 * left contour — one attached end, one loose one, so it bounds nothing. Run
 * out to the far temple it spanned the head, and a line across the whole
 * head is a brim whatever its shape: the head read as cut in two.
 */
const HAIRLINE = curve(W.line, [
  [0.318, 0.305],
  [0.34, 0.268],
  // the wave comes forward here: one lock's worth of dip over the near brow
  [0.378, 0.262],
  [0.41, 0.243],
  [0.46, 0.23],
  [0.495, 0.224],
])

/**
 * Three sweeps, the grain of the hair. All run the way it is combed — up
 * and to the viewer's left — each starting near the hairline and ending
 * free inside the mass, the longest one climbing toward the wave. Nothing
 * here closes against anything, which is what keeps it hair — the long one
 * used to land ON the outline beside the tuft, and a stroke that meets the
 * contour is a seam: it closed a wedge off the front of the head.
 */
const SWEEP_A = curve(W.line, [
  [0.565, 0.215],
  [0.515, 0.155],
  [0.46, 0.138],
  [0.418, 0.146],
])
const SWEEP_B = curve(W.fine, [
  [0.63, 0.25],
  [0.595, 0.2],
  [0.562, 0.172],
])
/**
 * One tuft climbing toward the crown and ending free a hundredth INSIDE the
 * outline. It used to break through the top, and the break was the
 * unevenness Elliot pointed at; the grain it gives is enough on its own.
 */
const TUFT = curve(W.fine, [
  [0.43, 0.2],
  [0.41, 0.178],
  [0.395, 0.163],
])

/**
 * THE EAR — asked for on 2026-09-16, after years of the file swearing there
 * would not be one. Drawn so it cannot be read as a hoop or a hook: a single
 * C that starts ON the head contour at the eye line, bows out a hundredth
 * and a half, and lands back ON the cheek contour below. Both ends attached,
 * nothing terminal in open space, and the hair mass still covers its top.
 */
const EAR = curve(W.line, [
  [0.318, 0.34],
  [0.303, 0.352],
  [0.298, 0.372],
  [0.306, 0.394],
  [0.322, 0.405],
])

/* ==================================================================== *
 * The order IS the drawing. See the header.
 * ==================================================================== */
const HEAD: SketchStroke[] = [
  /* ---- the whole face first ---- */
  hand(mirror(CHEEK), 0.002, 1.3),
  hand(CHEEK, 0.002, 3.9),
  hand(CHIN_S, 0.0028, 2.1),

  LID_UPPER,
  IRIS,
  mirror(LID_UPPER, AXIS),
  mirror(IRIS, AXIS),

  // The nose: long, down the shadow side, one hook at the base. It starts
  // under the lid — joined to the brow it reads as a three-quarter turn.
  curve(W.line, [
    [0.525, 0.365],
    [0.522, 0.405],
    [0.53, 0.432],
    [0.52, 0.447],
    [0.5, 0.452],
    [0.487, 0.445],
  ]),

  BROW_L,
  BROW_R,

  LID_LOWER,
  mirror(LID_LOWER, AXIS),

  // The mouth: closed, nearly level, lifted a shade more at his left. A
  // symmetric smile on a symmetric face is a mascot.
  curve(W.line, [
    [0.44, 0.496],
    [0.46, 0.504],
    [0.5, 0.507],
    [0.54, 0.502],
    [0.565, 0.492],
  ]),

  /* ---- then the hair, on a finished face ---- */
  hand(HAIR_L, 0.0012, 2.7),
  hand(HAIR_R, 0.0012, 5.3),
  hand(HAIRLINE, 0.002, 9.4),
  hand(SWEEP_A, 0.002, 4.4),
  SWEEP_B,
  TUFT,

  hand(EAR, 0.0015, 2.9),
  hand(mirror(EAR, AXIS), 0.0015, 6.1),

  hand(mirror(NECK), 0.0024, 1.7),
  hand(NECK, 0.0024, 3.3),
]

const BODY: SketchStroke[] = [
  /* ---- shirt first, arms last: at any cut both sides are in the same
     state, which is a bust crop rather than a sash ---- */
  hand(mirror(COLLAR_OUT), 0.002, 1.1),
  hand(COLLAR_OUT, 0.002, 2.6),
  hand(mirror(COLLAR_IN), 0.0024, 4.1),
  hand(COLLAR_IN, 0.0024, 6.8),

  hand(mirror(TRAP), 0.003, 4.1),
  hand(TRAP, 0.003, 6.8),

  // The placket, carried on from the V as the same line, with two buttons.
  curve(W.line, [
    [0.49, 0.855],
    [0.484, 0.92],
    [0.48, 0.985],
  ]),
  dot(W.fine, 0.5, 0.9, 0.009),
  dot(W.fine, 0.496, 0.965, 0.009),

  hand(mirror(ARM), 0.004, 2.2),
  hand(ARM, 0.004, 5.6),
]

/**
 * Six degrees about the base of the neck, crown to the viewer's left, the
 * last thing that happens to the head. The shoulders stay level.
 */
const STROKES: SketchStroke[] = [...xform(HEAD, { about: [AXIS, YOKE], tilt: -6 }), ...BODY]

export const PORTRAIT: SketchData = fit(STROKES)

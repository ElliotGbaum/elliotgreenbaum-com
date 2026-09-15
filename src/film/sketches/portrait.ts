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
 *   THERE IS NO EAR. Half under hair in the photograph; drawn, it was read as
 *   a hoop, a bracket and a hook.
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
 * level. Widest at the cheekbone (0.34 at y 0.40) and CONVEX all the way —
 * no gonial corner, because the photograph has none to show. Its top anchor
 * is shared with HAIR_L / HAIR_R so the two are one contour.
 */
const CHEEK = curve(W.edge, [
  [0.445, 0.583],
  [0.415, 0.56],
  [0.385, 0.525],
  [0.362, 0.48],
  [0.347, 0.43],
  [0.341, 0.39],
  [0.3435, 0.35],
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

/** The iris, 40% of the eye's width, and its top is cut by the upper lid. */
const IRIS = dot(1.8, 0.405, EYE + 0.003, 0.0105)

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
 * The outline, viewer's left half: down past the eye line where the mass
 * covers the ear, out to its widest at 0.19 and up into ONE big wave that
 * peaks left of the axis. The wave is the whole likeness — the hair lofts on
 * his right and lies flat on his left, so the silhouette leans.
 */
const HAIR_L = curve(W.edge, [
  [0.3435, 0.35],
  [0.324, 0.31],
  [0.305, 0.26],
  [0.298, 0.205],
  [0.31, 0.15],
  [0.338, 0.108],
  [0.378, 0.086],
  [0.422, 0.092],
  [0.455, 0.115],
])

/** The right half: no wave, a longer flatter run, carrying the mass out a
 *  little less far and back down past the ear. */
const HAIR_R = curve(W.edge, [
  [0.455, 0.115],
  [0.5, 0.106],
  [0.555, 0.112],
  [0.612, 0.134],
  [0.655, 0.172],
  [0.68, 0.225],
  [0.68, 0.285],
  [0.668, 0.328],
  [0.6565, 0.35],
])

/**
 * THE HAIRLINE. Lowest over the viewer's-left brow, where the wave comes
 * forward, and rising to the right where the hair is combed flat and back.
 * It ends short of the right temple, free in the mass, and it starts ON the
 * left contour — one attached end, one loose one, so it bounds nothing.
 */
const HAIRLINE = curve(W.line, [
  [0.32, 0.305],
  [0.348, 0.268],
  // the wave comes forward here: one lock's worth of dip over the near brow
  [0.378, 0.262],
  [0.41, 0.243],
  [0.465, 0.229],
  [0.53, 0.222],
  [0.595, 0.229],
  [0.64, 0.252],
])

/**
 * Three sweeps, the grain of the hair. All run the way it is combed — up
 * and to the viewer's left — each starting near the hairline and ending
 * free inside the mass, the longest one climbing into the wave. Nothing
 * here closes against anything, which is what keeps it hair.
 */
const SWEEP_A = curve(W.line, [
  [0.55, 0.205],
  [0.495, 0.143],
  [0.428, 0.108],
  [0.368, 0.104],
])
const SWEEP_B = curve(W.fine, [
  [0.605, 0.235],
  [0.568, 0.19],
  [0.535, 0.165],
])
/**
 * One tuft that leaves the mass and comes out through the top of the wave,
 * overshooting the outline by under a hundredth. A mark that stops at a
 * boundary is a crease in a cap; a mark that goes through it is the one thing
 * that proves the boundary is a mass and not a rim.
 */
const TUFT = curve(W.fine, [
  [0.405, 0.16],
  [0.375, 0.118],
  [0.36, 0.093],
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
  hand(HAIR_L, 0.003, 2.7),
  hand(HAIR_R, 0.003, 5.3),
  hand(HAIRLINE, 0.002, 9.4),
  hand(SWEEP_A, 0.002, 4.4),
  SWEEP_B,
  TUFT,

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

/**
 * PORTRAIT — the face that draws itself under the title.
 *
 * Thirty-one marks, measured against refs/face.png. It is not a likeness in the
 * sense that a tracing is: at the size act 0 hangs it — thrown onto a screen
 * thirty units away — a likeness is four hundred strokes that resolve into a
 * smudge. What it is trying to be is the handful of things about him a person
 * who knows him would name from across a room.
 *
 * ── THE ONE RULE THIS FILE IS ORGANISED AROUND ───────────────────────────
 *
 * THE MOST EXPENSIVE ERROR IN ART THIS SPARSE IS A MARK THE VIEWER READS AS A
 * DIFFERENT OBJECT. Not a wrong proportion — a wrong noun. Fourteen passes of
 * this drawing wore things nobody meant to draw, every one invisible to the
 * person moving the anchors and obvious to somebody seeing it cold:
 *
 *   A BERET, A SWIM CAP, A NEWSBOY CAP, A KNIT BEANIE, A SLOUCH HAT, A BOWL-CUT
 *     HELMET, A SOFT CAP WITH A HEADBAND, A BALACLAVA, A BALD CAP. Nine hats,
 *     and then a tenth after the "fringe" rewrite, which is the pass that
 *     finally worked out why.
 *   HEADPHONES — the hair run down the sides to nose level, plus the ear.
 *   TWO HOOP EARRINGS — a mirrored pair of ear-brackets.
 *   A DETACHED HOOK — the single ear, drawn as a deep C off the jaw.
 *   A NECKTIE, a BIB, a KITE, a PENDANT, HOODIE DRAWSTRINGS, AN OPEN BATHROBE
 *     — the same handful of marks under the chin, six times.
 *   A NECKLACE, twice: once as a line across the throat, and once — after that
 *     was deleted — as two heavy shoulder terminals dying INSIDE the neck,
 *     which the eye reads as the clasp of the same necklace.
 *   A CHIN STRAP — the neck starting inside the jaw and forking over it.
 *   A BANDOLIER — the trapezius crossing the collar at the yoke.
 *   AN ANTENNA, A CRACK IN THE SHELL, A BANDAGE — interior hair marks.
 *   A SPADE and A HEART — the chin, four times.
 *   A COAT HANGER, a SASH, an AVOCADO — the 35% and 70% frames.
 *   A GREY ALIEN, and A YOUNG WOMAN — the whole head, and fairly, both times.
 *   A LOAF OF BREAD, A MILK CARTON, A MINIFIG — the cranium, once the second
 *     contour was gone and nobody was looking at the first one any more.
 *
 * ── AND THEN THE CRANIUM WAS A SLAB ──────────────────────────────────────
 *
 * Deleting the second contour was right and it is still right. What it did not
 * do was make the remaining contour a head, and for one pass it was a ROUNDED
 * RECTANGLE: the sides ran dead vertical for 0.06 of height, turned a corner
 * inside 0.02, and the top was FLAT for 0.09 of width. A vertical side reads at
 * its full width for its entire length, where a curved one reads full width at
 * a single point — which is why the same 0.35 of head measured as a wall looks
 * enormous and measured as a dome looks right.
 *
 * SO THE TEST IS ON THE RATE, NOT THE WIDTH. Walk the anchors from the widest
 * point to the crown and take dx/dy at each: it must increase EVERY step. Any
 * two consecutive steps at about the same rate are a straight run, and two
 * straight runs with a turn between them are a corner. Nothing else in this
 * file needs measuring to four decimals; this does.
 *
 * AND THE TEST HAS TO CROSS THE MIDLINE. Run only to the crown anchor it
 * certifies the two shoulders of the dome and says NOTHING about the span
 * between them — which is how the next pass shipped rounded corners with a flat
 * top still between them and read as the same slab. Measure the SAG: from the
 * apex out to each shoulder, against the head's width. Under about 3% is a
 * plateau. It was 2.5%.
 *
 * AND THE FACE WAS WIDEST AT THE TEMPLE, 0.144 against the cheekbone's 0.140,
 * which is the same bug at the other end — the jaw's taper ran straight on into
 * the wall with nothing to stop it. But see CHEEK: the fix is NOT to put the
 * widest point back at the cheekbone, because a face that narrows into the
 * temple hands the hair a line running the other way, and a contour that
 * reverses inside one anchor is a CUSP. Two passes shipped that: the first as a
 * wall, the second as a notch bitten out of the side of the head.
 *
 * ── WHY IT KEPT BEING A HAT, AND WHAT FINALLY STOPPED IT ─────────────────
 *
 * THE SECOND CONTOUR IS THE HAT. That is the whole finding, it took fourteen
 * passes, and every one of the failed fixes was a way of keeping the second
 * contour while hoping it would stop meaning what it means.
 *
 * The construction was always the same: draw the skull, then draw the hair
 * round it. Two boundaries round one cranium bound a region between them, and
 * a bounded region sitting on a head is headgear — the eye picks whichever hat
 * the shape most resembles and there is no arrangement of the pair that gets
 * out of it. The drawing tried, in order: making the band thicker (a beanie),
 * putting a part through it (a bandana), breaking it at the temples (a band
 * with a nick in it, which the eye shuts unasked), running the hairline
 * DIAGONALLY instead of as an arch (a headscarf — worse, because a wrapped
 * cloth is exactly what a diagonal band is), and giving it LEGS down both
 * cheeks (a turban, and now with three near-parallel lines down each side).
 * Five plausible fixes, five hats.
 *
 * THE FIX IS TO DELETE THE SECOND CONTOUR. CHEEK now stops at the temple and
 * the hair carries the same line straight on, out past where a skull would be
 * and over the crown. There is ONE line down each side of the head and the
 * region it bounds is the head. The hair is not drawn at all: the hair is the
 * SHAPE — it is why the silhouette is wider above the cheekbone than at it, why
 * the crown sits 0.10 higher than a skull's would, and why there is a wave in
 * the top left of it.
 *
 * AND THE LOFT IS VERTICAL, which the measurements said all along and nobody
 * believed. The mass adds about 0.10 of HEIGHT over the skull and barely 0.03
 * of width. Every pass that tried to sell "big hair" by pushing the sides out
 * was widening a hat.
 *
 * WHAT IS LEFT TO SAY IT IS NOT A SHAVED HEAD: the loft, the wave, one TUFT
 * that crosses the top edge and comes out the other side, and the FRINGE — one
 * lock falling across the forehead from his right, which touches the head at
 * ONE end only and stops dead in the middle of the mass at the other. A bald
 * head has no marks crossing its outline; a hat has no marks crossing it
 * either. That is the entire remaining argument and it costs two strokes.
 *
 * ── THE OTHER STANDING RULES, all learned the same way ───────────────────
 *
 *   ONE WAVE IN THE SILHOUETTE, NOT THREE. Two little 0.007 scallops are the
 *   scalloping on a bathing cap — too small to be clumps and too big to be the
 *   hand. Ten thousandths is the window; at 0.016 it is a horn.
 *
 *   THERE IS NO EAR. There was, for nine passes, and it was read as a hoop, a
 *   bracket and finally a detached hook. In the photograph the ear is half
 *   under hair and it carries no part of the likeness; drawn, it is a heavy C
 *   hanging off a jaw with both ends free. The cheapest fix for a mark that has
 *   failed nine times is to stop making it.
 *
 *   NOTHING MAY CONVERGE THAT IS NOT MEANT TO CLOSE, and NOTHING MAY RUN DOWN
 *   AN EMPTY CHEST IN PAIRS. Two collar leaves both turning back to the axis
 *   close a wedge, which is a necktie; un-mirrored but both still running to the
 *   bottom of the frame, they are two converging verticals on bare skin, which
 *   is a bathrobe. The far leaf now LANDS ON THE SHOULDER and stops, so it is a
 *   yoke seam; only the near leaf carries a placket down, because in an open
 *   shirt only the near panel has a visible edge.
 *
 *   NO TWO HEAVY LINES RUNNING NEAR-PARALLEL. Contours that cross must diverge.
 *
 *   NO TERMINAL IN OPEN SPACE, except a hair tip, which is the one mark in the
 *   drawing that is SUPPOSED to end in the air. A floating cap anywhere else is
 *   a tick, a comma, a spike, a hinge.
 *
 *   NOTHING SHORTER THAN 0.04. Below that it is grain at full size and gone at
 *   thumbnail, and it still costs a stroke.
 *
 * ── SYMMETRY, AND THE FOUR DEGREES THAT FIX IT ───────────────────────────
 *
 * The features are still authored on the left and mirrored, because a face file
 * nobody can read back is a face nobody can correct — six passes were spent
 * chasing an 0.008 "head turn" that was too small to see and left the cheeks
 * mirrored about one axis and the features about another.
 *
 * The mascot problem is real all the same, and it is solved at the END instead:
 * the whole head is TILTED FOUR DEGREES about the base of the neck. His is
 * tilted twelve in the photograph, with the crown leaning to the viewer's left
 * and his far eye riding higher than his near one, and four is enough to break
 * the mirror without looking like a man falling over. It costs one number.
 *
 * On top of that the drawing keeps the asymmetries that are genuinely his and
 * are worth their strokes: the two halves of the head, which are NOT mirrored —
 * the left lofts high and carries the wave, the right runs 0.021 further out
 * and lies flat to the skull; the fringe, which falls from his right and stops
 * in the middle; the brows, which are 0.010 out of level; and the mouth, which
 * is closed, nearly level, and lifted only at HIS left.
 *
 * ── THE FACE ─────────────────────────────────────────────────────────────
 *
 * THE FACE IS 0.60 OF THE HEAD'S HEIGHT ACROSS, which is narrower than it has
 * ever been drawn here — it was 0.68, and a face two-thirds as wide as it is
 * tall is a dome whatever is inside it. The JAW is narrower than the CHEEKBONE
 * by 0.030, and a jaw that is widest at the jaw is a box — but the cheekbone
 * is not a point on the silhouette, it is a RATE. See CHEEK.
 *
 * THE JAW HAS A GONIAL CORNER, at 0.386/0.464, and that is the difference
 * between a head and a leaf. For five passes CHEEK was one monotone taper from
 * temple to chin — a silhouette with no mandible in it — and a pointed chin
 * under no jaw, with wide round eyes and no nose, is why it read androgynous
 * however many other numbers were right.
 *
 * AND THE CORNER IS NOT MADE BY DOUBLING THE ANCHOR. It was doubled for five
 * passes and there was no corner, because a Catmull–Rom break at [G,G] takes
 * its two tangents from (G−A) and (B−G) — so if the jaw ARRIVES near-vertical,
 * doubling changes nothing at all. The mandible has to arrive at 33° off
 * vertical and the ramus leave at 15°, and it can only do that if the body of
 * the jaw RUNS STRAIGHT into the corner instead of curving into it. Convexity
 * belongs at the chin end. The break is 18°, and it is the doubled anchor plus
 * three collinear ones that buy it.
 *
 * THE CHIN is 0.107 across and 0.0285 deep, and it is FLAT for 0.023 along the
 * bottom — two anchors at the same y, which is what a jaw looks like from the
 * front. Under a jaw that is CONVEX from about mid-body down to it. It has been
 * 0.108 (a shovel), 0.068 (a spade), and 0.104 with a single low anchor between
 * two rounded corners, which is a spade again however wide it is measured.
 * DEPTH makes a point, not width — and so does a lone bottom anchor.
 *
 * THE EYES ARE NARROW — 0.055 across and 0.019 open, which is a ratio of three
 * and a half to one. Drawn rounder they were doll's eyes, and the reason was
 * never the lids: THE IRIS WAS FLOATING. A dark iris with white above it as
 * well as below is the face of somebody who has just been startled, in every
 * drawing ever made. His is cut by the upper lid, so the pip is authored to
 * TOUCH it — 0.0088 of radius under a lid 0.0088 above the pupil — and the eye
 * goes quiet at once. Upper lid at W.line over a shorter, lighter lower lid; a
 * closed almond gives both the same weight and renders as a bright lens.
 *
 * THE BROWS sit 0.029 clear of the lid, which is closer than they have been —
 * at 0.049 the face was startled and at 0.039 it was merely polite. They are
 * nearly FLAT, heavy, and drop only at the tail. A brow with an arch in the
 * middle of it is a woman's brow or a surprised one.
 *
 * THE NOSE RUNS LONG — 0.092 of the face, from under the lid to the base. At
 * 0.045 it was not a small nose, it was an absent one, and it vanished entirely
 * at thumbnail. It starts BELOW the lid, never at the brow, because a nose
 * joined to a brow reads as a three-quarter turn.
 *
 * ── PROPORTION, as ratios so they survive being re-fitted ────────────────
 *
 *   Crown 0.100 (apex 0.0975), widest 0.215, fringe 0.2225, brow 0.298, eye
 *   0.334, nose base 0.438, mouth 0.480, chin 0.5745 — which puts the eye 49%
 *   of the way down the head and the front of the hair 26%, both as measured
 *   off the photograph.
 *   Head 0.343 across against 0.477 tall — a ratio of 0.72, near enough the
 *   canonical 0.74. It was 0.83, and that is a balloon.
 *   Cranium 1.5 to 1 above the widest point. At 2.45 to 1 the top is flat.
 *   Eye 0.055 wide, 0.062 between inner corners, five eyes to the face.
 *   Neck 0.199 across at the jaw against a 0.343 head — 58%, and under about
 *   half that is a stalk. Chin to yoke 0.1035.
 *   Deltoid span 0.731 — two head-widths, which is the narrowest a man reads
 *   as. It was 1.95, and that is a bottle.
 *
 * ── ORDER ────────────────────────────────────────────────────────────────
 *
 * A JAW WITH EYES AND A NOSE IN IT IS A FACE; A HAIRDO WITH NO EYES IS A HAT;
 * AND A FACE WITH NO MOUTH IN IT IS A MASK, which is the one the last pass
 * shipped. The whole face goes down first — cheeks, chin, lids, irises, nose,
 * brows, lower lids, MOUTH — and the top of the head arrives on a finished face,
 * carrying on from exactly where the cheeks stopped.
 *
 * The schedule pays by PEN LENGTH, not by stroke count, and the two halves of
 * the cranium are a fifth of the pen in the file between them, so anything
 * scheduled after them is late. The thirteen marks that make this a face cost
 * about what the two that make it a head do, which is why the order works.
 *
 * Every intermediate frame has to be a picture of the SAME NOUN, and the test
 * that catches it is cheap: render 20, 35, 50, 70 and 85 per cent and name each
 * one in a single word. Any word that is not "man" is a bug at that index. The
 * pass before this one passed at 35 and failed at 70 and 100 — the strokes it
 * added were DESTROYING meaning, which is the worst possible shape for a
 * drawing whose entire point is that you watch it arrive.
 *
 * Each eye is followed at once by its own iris, because drawn as two pairs
 * there is a frame where the face is winking, and a wink is a bug. The brows
 * land as a PAIR for the same reason.
 *
 * THE TRAPEZIUS IS SPLIT IN TWO and drawn inner-pair first, so a schedule cut
 * always lands on a SYMMETRIC pair. Drawn as one stroke a side, the 70% frame
 * caught one shoulder down and the other not: a sash.
 *
 * THIRTY-ONE IS OVER THE HOUSE LIMIT IN kit.ts, and that is a real cost, paid
 * deliberately. What bought it: the chin and the second lid (corners and
 * weights unobtainable inside one stroke); the fringe and the tuft, which are
 * the only two marks in the file that say the head has hair on it; the two
 * brows, which cost one stroke more than a mirrored pair and buy the single
 * most-read asymmetry a human face has; the split trapezius (the 70% frame);
 * and the button, which with the collar and the placket is what makes this HIS
 * shirt rather than a bust in a robe.
 *
 * See src/film/sketches/kit.ts.
 */

import type { SketchData, SketchStroke } from '../sketch'
import { W, curve, dot, fit, hand, mirror, poly, xform } from './kit'

/* ---- the landmarks every measurement above is quoted against ---- */
const CROWN = 0.1
const EYE = 0.334
const CHIN = 0.5745
/** where the neck stops and the shoulders start */
const YOKE = 0.678
/**
 * The features mirror about the centre line, and the life comes from TILT
 * instead — see the header. It was 0.508 for six passes, described in this
 * comment as "a few degrees of head turn": 0.008 against a 0.283 face is not a
 * turn, it is a registration error too small to see.
 */
const AXIS = 0.5

/* ---- the parts that come in pairs, authored once on the left ---- */

/**
 * The side of the FACE, chin corner to temple: widest at the CHEEKBONE at
 * 0.360/0.351, with a GONIAL CORNER at 0.386/0.472. See the header — one
 * monotone taper from temple to chin is a leaf, and a face 0.68 of its own
 * height across is a dome.
 *
 * It STOPS at 0.306, which is where the hair takes the contour over. The two
 * are one line and the join is deliberately collinear: everywhere else in this
 * file two strokes meeting on a shared tangent is a bug, and here it is the
 * whole construction.
 */
const CHEEK = curve(W.edge, [
  [0.4465, 0.546],
  [0.4295, 0.534],
  // the body of the mandible, and it runs STRAIGHT — three anchors at a steady
  // 31° off vertical. Curved all the way to the corner it arrives near-vertical,
  // the ramus leaves near-vertical too, and there is no corner however many
  // times the anchor is doubled. Convexity belongs at the chin end only.
  [0.4145, 0.5085],
  [0.4, 0.4855],
  [0.386, 0.464],
  [0.386, 0.464],
  // THE RAMUS RUNS MONOTONICALLY OUTWARD, at a DECREASING rate — 0.28, 0.22,
  // 0.12 — and hands the hair a line that is still widening. The cheekbone had
  // its own anchor 0.0045 proud of the temple for fifteen passes, so the cheek
  // arrived at the join narrowing while the hair left it widening: a REVERSAL
  // inside one anchor, which is a cusp, and a cusp on a silhouette is a notch
  // bitten out of the side of the head. At this size the cheekbone cannot be a
  // silhouette event at all. It is carried by the RATE — fast off the gonial,
  // slow at the temple — and the jaw is narrower than it by 0.030, which is
  // the entire content of "widest at the cheekbone" and all a viewer reads.
  [0.3715, 0.412],
  [0.3595, 0.357],
  [0.3535, 0.306],
])

/** The chin, sharing both of CHEEK's lower endpoints so its corners are real.
 *  0.107 across, 0.0285 deep, and FLAT for 0.023 along the bottom. Two anchors
 *  at the same y is what a jaw looks like from the front; a single low anchor
 *  between two rounded corners is a spade whatever its depth. */
const CHIN_S = curve(W.edge, [
  [0.4465, 0.546],
  [0.4665, 0.5665],
  [0.4885, CHIN],
  [0.5115, CHIN],
  [0.5335, 0.5665],
  [0.5535, 0.546],
])

/**
 * Brow: heavy, flat, low, PEAKING AT THE OUTER THIRD and dropping only at the
 * tail. An arch peaking in the middle is a woman's brow or a surprised one, and
 * it was the shape here for thirteen passes.
 *
 * The two are authored separately rather than mirrored, and that is the point:
 * his are visibly out of level in the photograph, a brow-height difference is
 * the most universally read asymmetry a human face has, and a mirrored pair of
 * marks with two free ends each is a FASTENING — this drawing has already
 * shipped that pair once, as spectacle hinges.
 */
const BROW_L = curve(2.1, [
  [0.464, 0.299],
  [0.442, 0.292],
  [0.422, 0.288],
  [0.402, 0.3],
])

/** The far brow, 0.005 higher and a shade flatter than its opposite number. On
 *  top of the four degrees of tilt that is 0.010 of daylight between them. */
const BROW_R = curve(2.1, [
  [0.536, 0.294],
  [0.558, 0.288],
  [0.578, 0.285],
  [0.598, 0.294],
])

/**
 * Upper lid, the heaviest mark inside the face, and it is a WAVE rather than an
 * arch: it rises hard off the inner corner, peaks 37% along, then runs shallow
 * all the way to the outer one. A peak in the middle is a symmetric arc over a
 * dot, which is the cartoon eye — the same failure as an arch over a forehead
 * being a brim.
 *
 * THE OUTER CORNER RIDES 0.005 ABOVE THE INNER ONE. It sat 0.002 below for
 * thirteen passes, which is the canthal tilt backwards, and a drooping outer
 * corner reads sad, elderly or hound-like whatever the rest of the face does.
 */
const LID_UPPER = curve(W.line, [
  [0.414, 0.331],
  [0.4487, 0.3215],
  [0.469, 0.336],
])

/**
 * Lower lid: light, and OPEN AT THE NOSE. It starts ON the upper lid's outer
 * terminal and stops 60% across.
 *
 * Closed at both corners the two lids bound a region, and a bounded region
 * between two similar arcs is a lens, a leaf or a logo — the hat failure again
 * at a twentieth of the size. This is the mark that rendered the eyes as two
 * bright almonds.
 */
const LID_LOWER = curve(W.fine, [
  [0.414, 0.331],
  [0.428, 0.3415],
  [0.452, 0.3425],
])

/**
 * The iris, and two things about it were wrong.
 *
 * IT IS 0.021 ACROSS IN A 0.055 EYE — 38%, which is what the anatomy says. It
 * was 24%, and a small dark pip adrift in a large pale aperture is the doll's
 * eye in every drawing that has ever been made.
 *
 * AND THE LID CUTS IT. Centred 0.003 under the eye line, its top quarter goes
 * behind a lid running at 0.322 and its bottom is tangent to the lower one, so
 * there is no white above it and none below. Sclera showing over an iris is the
 * face of somebody who has just been startled; nothing else in a drawing this
 * sparse is louder. A hundredth of a unit is the whole difference between a
 * stare and a look.
 */
const IRIS = dot(1.8, 0.444, EYE - 0.003, 0.0105)

/**
 * The neck. Its first anchor sits ON the jaw between the gonial corner and the
 * chin — started inside it, both neck strokes fork over the jaw and draw a chin
 * strap; started below it, the head rests on a post.
 *
 * And it CONVERGES UPWARD, 0.0945 of half-width at the jaw against 0.114 at the
 * yoke. Two parallel verticals under a head are a column, a post or a bolster;
 * a neck is a truncated cone and has to be drawn as one. It was 0.095 against
 * 0.104 — a ninth of a taper, which at this size is a tube with a rounding
 * error in it. The flare has to be big enough to see: a fifth, and most of it
 * spent in the bottom third, where the sterno-mastoid actually spreads.
 */
const NECK = curve(W.edge, [
  [0.4005, 0.4855],
  [0.3965, 0.555],
  [0.389, 0.622],
  [0.379, YOKE],
])

/**
 * The shoulder, in three strokes: two halves of the trapezius and the arm.
 *
 * TRAP_IN starts at 0.386 — OUTSIDE the neck line, which ends at 0.4 — so the
 * heavy stroke begins at the junction and runs away from it. Started inside, it
 * died with a W.edge cap in the middle of the throat, and a matched pair of
 * those is the clasp of a necklace.
 *
 * The split also protects the 70% frame: with both inner halves drawn before
 * either outer half, a cut in the schedule lands on a symmetric pair instead of
 * leaving one shoulder down and the other not.
 */
const TRAP_IN = curve(W.edge, [
  [0.379, 0.6775],
  [0.343, 0.6905],
  [0.3015, 0.708],
])

/**
 * And it STEEPENS: 0.36 of fall per unit of run on the inner half against 0.58
 * on the outer. Drawn at one constant slope the trapezius and the arm are a
 * single straight diagonal from the ear to the elbow, which is a bottle — the
 * shoulder has no corner in it because there is no change of rate to make one.
 */
const TRAP_OUT = curve(1.6, [
  [0.3015, 0.708],
  [0.252, 0.73],
  [0.205, 0.756],
  [0.172, 0.7845],
])

/** The arm, hanging OUTBOARD of the shoulder tip and running off the bottom of
 *  the frame. Inboard and stopping short, it was a hanger with a hook.
 *
 *  It leaves the trapezius at 1.53 against the 0.58 it arrived at, and THAT
 *  break is the deltoid. Span 0.731 across, against 0.680 — two head-widths
 *  even, which is the narrowest a man reads as. */
const ARM_UP = curve(1.6, [
  [0.172, 0.7845],
  [0.142, 0.8305],
  [0.1345, 0.8725],
])

const ARM_DOWN = curve(1.6, [
  [0.1345, 0.8725],
  [0.1355, 0.9285],
  [0.1395, 0.985],
])

/* ==================================================================== *
 * The hair
 *
 * Four marks and the whole argument of the file. See the header: the mass
 * is 0.109 deep at the crown, it has LEGS down past the eye line on both
 * sides, the outer edge is LOBED, and the loft is vertical.
 * ==================================================================== */

/**
 * THE HAIR IS THE TOP OF THE HEAD. There is no second contour anywhere in this
 * drawing, and that is the fourteenth pass's whole idea.
 *
 * Every version before this one drew the skull and then drew the hair round it,
 * and every one of them was headgear, because THE SECOND CONTOUR IS THE HAT.
 * Two boundaries round one cranium bound a region between them, and a bounded
 * region sitting on a head is a beret, a swim cap, a bandana or a turban — the
 * eye picks whichever one the shape most resembles and there is no arrangement
 * of the pair that escapes it. Thicken it, part it, break it, run it diagonally,
 * give it legs: the drawing shipped all five and got a hat every time. It is not
 * a proportion bug and it never was. It is a topology bug, and the fix is to
 * delete the second contour rather than to keep re-cutting it.
 *
 * So CHEEK stops at the temple and this carries straight on from where it ends,
 * out past where a skull would be and up over the crown. There is only ever ONE
 * line down each side of the head, and the region it bounds is the head. The
 * hair is not drawn. The hair is the SHAPE — it is why the silhouette is wider
 * above the cheekbone than at it, why the crown is 0.10 higher than a skull's
 * would be, and why there is a wave in the top-left of it.
 *
 * WHAT IS LEFT TO SAY IT IS NOT A BALD MAN: the loft, the wave, and the two
 * locks below, which cross the line and come out the other side. A bald head has
 * no marks crossing its outline.
 *
 * The left half. The widest point is at 0.215 — ABOVE the ear, where a parietal
 * eminence is, which is near BROW level and not near the crown. It went to
 * 0.172 for a pass, chasing a rounder dome, and a head whose widest point sits
 * a fifth of the way down from the top is a MUSHROOM: pinched at the temples,
 * bulging high, capped flat. Nothing else moved and the whole drawing changed
 * nouns.
 *
 * From the widest point to the crown, dx/dy goes 0.16, 0.52, 1.36, 2.51, 6.25.
 * That sequence is the whole shape and it is the only thing in this file worth
 * checking with a calculator: it must increase at EVERY step. Two steps at the
 * same rate are a straight run, and two straight runs with a turn between them
 * are a corner.
 *
 * AND IT MUST BE WALKED ALL THE WAY ACROSS, not just up to the crown anchor.
 * The pass that fixed the corners left 0.108, 0.1055, 0.0995, 0.1005, 0.1045
 * running across the top — 0.0085 of sag over 57% of the head's width, which is
 * a PLATEAU, and a plateau between two rounded corners is the same slab it was
 * before with the edges filed off. The rule the corners satisfy says nothing
 * about the middle. Sag from the apex is now 0.017 at the near shoulder of the
 * dome and 0.026 at the far one, which is what an ellipse 1.5 to 1 gives, and
 * 1.5 to 1 is a cranium. It was 2.45 to 1.
 */
const HAIR_L = curve(W.edge, [
  [0.3535, 0.306],
  // and it picks the line up STILL WIDENING — 0.23 against the 0.12 the cheek
  // arrived at. Same sign, mild acceleration, no cusp. The swell that says
  // "hair" is not a step out at the join; it is the 0.022 the contour gains
  // between here and the widest point, spent smoothly over 0.13 of height.
  [0.3455, 0.2735],
  [0.3385, 0.2415],
  [0.335, 0.215],
  [0.3405, 0.181],
  // ONE wave, and a real one. Two little 0.007 scallops here read as the
  // scalloping on a bathing cap: too small to be clumps of hair and too big to
  // be the hand. Hair breaks its own silhouette in ones, not in ripples. Ten
  // thousandths is the whole window — at 0.016 it was a horn. This anchor sits
  // 0.0065 PROUD of the arc its neighbours describe.
  [0.3555, 0.152],
  [0.393, 0.1245],
  [0.437, 0.107],
  [0.462, CROWN + 0.003],
])

/**
 * The right half, and it is NOT the mirror of the left. It carries further out
 * — 0.178 off the axis against 0.157 — and it has no wave in it, because on his
 * right the mass lies flat to the skull and runs long and back past the ear,
 * while on his left it lofts. That asymmetry is the one thing about his hair a
 * person who knows him would draw first, and mirroring the two halves throws
 * away the only characterful mark in the file.
 */
const HAIR_R = curve(W.edge, [
  [0.6465, 0.306],
  [0.6595, 0.2725],
  [0.6715, 0.2405],
  [0.678, 0.213],
  [0.6745, 0.179],
  [0.6635, 0.152],
  [0.6425, 0.1275],
  [0.6055, 0.1085],
  [0.5555, 0.0995],
  [0.508, 0.0975],
  [0.462, CROWN + 0.003],
])

/**
 * Two tufts, and they are the only marks in the head that are allowed to be
 * hair. Each leaves a free end low in the mass, sweeps up in the direction the
 * hair actually lies — his right to his left, which is the way it is combed —
 * and comes OUT THROUGH THE TOP EDGE, overshooting it by under a hundredth.
 *
 * The crossing is the point. A mark that stops at a boundary divides nothing —
 * it is a crease in a cap; a mark that goes through it is the one thing that
 * proves the boundary is a mass and not a rim. A bald head has no marks
 * crossing its outline. The tolerance is narrow: 0.008 is a lock, and past about
 * 0.015 it is a wire poking out of a skull, which has shipped twice.
 *
 * THEY USED TO RUN FROM THE TWO TEMPLES UP TO THE CROWN, and that drew a
 * WIDOW'S PEAK — the two of them plus the arc between their exits enclosed a
 * triangle over the middle of the forehead, which is the hat bug at a third of
 * the size and reads as a man of fifty. Two marks that both start on a contour
 * and both end on it have made a region, whatever the marks are called. These
 * two start in mid-mass, so nothing closes; they run the same way rather than
 * converging; and they are 0.13 apart, which is too far to pair.
 */
const TUFT_A = curve(W.fine, [
  [0.3925, 0.174],
  [0.4085, 0.1405],
  [0.4305, 0.1025],
])

/**
 * THE FRINGE, and it is ONE lock falling across the forehead from his right —
 * on the contour at the left temple, dipping to its lowest at 0.212 over the
 * near brow, then RISING BACK UP INTO THE MASS and stopping dead at 0.528.
 *
 * The free end is the whole reason this is a fringe and not the tenth hat. A
 * hairline that reaches the other temple has closed a band round the cranium,
 * and it does not matter in the slightest whether it arches, runs diagonally or
 * has legs on it: two contours that meet at both temples bound a region, and a
 * bounded region round a skull is headgear. This one only meets the head ONCE.
 * Where it stops, it stops in the middle of the hair with nothing to close
 * against, and it stops CLIMBING — a free end pointing at the far contour gets
 * joined to it by the eye whatever the gap is, and a free end pointing away
 * does not.
 *
 * It also has to be lighter than the silhouette. Two lines of the same weight
 * near one another are a pair, and a pair is a strap.
 */
const FRINGE = curve(W.line, [
  [0.3355, 0.2125],
  [0.386, 0.2255],
  [0.4485, 0.2225],
  [0.4975, 0.203],
  [0.522, 0.169],
])

/* ==================================================================== *
 * The order IS the drawing. See the header.
 * ==================================================================== */
const HEAD: SketchStroke[] = [
  /* ---- THE WHOLE FACE FIRST, all thirteen marks of it, and they cost less pen
     between them than the two hair strokes do. The old order put the hair third
     and the mouth twentieth, and the 35% frame was a head of hair with no mouth
     in it — which is a mask, and a mask is worse than an unfinished face. A
     mouth is the cheapest expression in the drawing and it was arriving last of
     the face marks. ---- */
  hand(mirror(CHEEK), 0.002, 1.3),
  hand(CHEEK, 0.002, 3.9),
  hand(CHIN_S, 0.0028, 2.1),

  LID_UPPER,
  mirror(LID_UPPER, AXIS),
  IRIS,
  mirror(IRIS, AXIS),

  // The nose: long, down the shadow side, one hook at the base. It starts 0.016
  // under the lid — run it up towards the brow and the two marks read as one
  // continuous edge, which turns a flat-on face into a three-quarter one.
  curve(W.line, [
    [0.527, 0.356],
    [0.523, 0.396],
    [0.529, 0.422],
    [0.52, 0.438],
    [0.5005, 0.443],
    [0.488, 0.4365],
  ]),

  // The brows land TOGETHER, whatever else is true about them. They are the most
  // diagnostic marks in the drawing — take the brows off a photograph of a
  // famous face and it is harder to name than with the eyes taken off — and at
  // 35% one brow complete with its opposite number two points in is a lone dash
  // on a cheekbone, which is a wink at brow height.
  BROW_L,
  BROW_R,

  LID_LOWER,
  mirror(LID_LOWER, AXIS),

  // The mouth. Closed, nearly level, and lifted only at HIS left — 0.008 of sag
  // and the near corner 0.014 higher than the far one. Both corners lifted
  // equally over a symmetric sag is a cartoon smile, and a symmetric smile on
  // an otherwise symmetric face is a mascot.
  curve(W.line, [
    [0.465, 0.48],
    [0.482, 0.487],
    [0.505, 0.488],
    [0.532, 0.483],
    [0.556, 0.474],
    [0.572, 0.466],
  ]),

  /* ---- and only now the top of the head, which is the same contour the cheeks
     are and picks up exactly where they stopped ---- */
  hand(HAIR_L, 0.0032, 2.7),
  hand(HAIR_R, 0.0032, 5.3),
  hand(FRINGE, 0.002, 9.4),
  TUFT_A,

  hand(mirror(NECK), 0.0026, 1.7),
  hand(NECK, 0.0026, 3.3),
]

const BODY: SketchStroke[] = [
  /* ---- THE ARMS COME LAST, after the whole shirt. Splitting the trapezius was
     supposed to protect the 70% frame and only moved the cut inside the outer
     pair — same one-shoulder-down sash, one pass later. With the arms last, 70%
     is both shoulders and a collar, and the arms are symmetrically absent,
     which is a bust crop rather than a bandolier. ---- */
  // different seeds either side, so the two are not the same line reflected —
  // which is the thing that reads as generated
  hand(mirror(TRAP_IN), 0.003, 4.1),
  hand(TRAP_IN, 0.003, 6.8),
  // The near collar leaf, with a real point, turning in towards the placket.
  poly(W.line, [
    [0.379, YOKE],
    [0.3525, 0.7095],
    [0.334, 0.7445],
    [0.324, 0.7735],
    [0.404, 0.8285],
    [0.46, 0.879],
  ]),
  // The far leaf, which LANDS ON THE SHOULDER and stops. Carried down to the
  // frame like the near one, it was the second of two converging verticals
  // running down an empty chest, which is a bathrobe.
  //
  // LANDING MEANS LANDING ON THE LINE. It used to stop at 0.702/0.717 with the
  // trapezius passing 0.006 below it, and a terminal that near a contour without
  // touching it is not a seam — it is a spike standing on a shoulder, which is
  // what it read as: a dog-ear, a paper flag, a pen clip. The last anchor is now
  // a point ON the mirrored trapezius, so the two marks meet instead of one
  // hovering over the other.
  //
  // AND IT LANDS SHORT. Carried all the way to the trapezius' outer end it met
  // it there, correctly, and the region it closed against the shoulder was 0.085
  // long and 0.055 deep — a wedge two to one, which is a sliver, and a sliver
  // lying along a shoulder is a flag, a pennant, an epaulette. A collar leaf is
  // about as deep as it is wide. Landing 0.024 further in costs nothing and the
  // wedge comes out square.
  poly(W.line, [
    [0.621, YOKE],
    [0.6435, 0.7135],
    [0.6635, 0.7495],
    [0.6805, 0.7005],
  ]),

  hand(mirror(TRAP_OUT), 0.0035, 1.9),
  hand(TRAP_OUT, 0.0035, 5.2),

  // THERE IS NO POCKET. It was a poly with no top edge, sized off the
  // photograph, and it still read as a box stuck on the chest — a name badge, a
  // lanyard tag, a phone in a pocket. A three-sided rectangle floating on bare
  // cloth with nothing touching it has no way to say which of those it is.
  // The button and the placket carry the shirt on their own.

  // The shirt front — ONE edge, carried on from the end of the near leaf as the
  // same line, with one button on it. A placket in an open shirt is one edge;
  // the far panel is behind the chest and has none.
  curve(W.line, [
    [0.46, 0.879],
    [0.446, 0.926],
    [0.436, 0.985],
  ]),
  dot(W.fine, 0.462, 0.921, 0.011),
  hand(mirror(ARM_UP), 0.004, 2.2),
  hand(ARM_UP, 0.004, 5.6),
  hand(mirror(ARM_DOWN), 0.004, 7.4),
  hand(ARM_DOWN, 0.004, 3.1),
]

/**
 * FOUR DEGREES, about the base of the neck, and it is the last thing that
 * happens to the head. Everything above is authored square and mirrored so the
 * file can be read back and corrected; the tilt is what stops that costing a
 * mascot. The shoulders stay level — a tilted head on tilted shoulders is a
 * whole body leaning, which is a different picture.
 *
 * Turn about the point the head is ATTACHED to or it detaches: the two ends of
 * the neck sit on the yoke, so they swing by 0.007 and the trapezius still
 * meets them inside the width of the hand's own wobble.
 */
const STROKES: SketchStroke[] = [...xform(HEAD, { about: [AXIS, YOKE], tilt: -4 }), ...BODY]

export const PORTRAIT: SketchData = fit(STROKES)

/**
 * GUITAR — a sixth-grader on a school stage, singing "Dream On", act 2 left.
 *
 * IT IS HIM NOW, NOT THE INSTRUMENT. The drawing used to be a bare electric
 * guitar standing on end, which was the right call while the caption under it
 * read "Guitar · age 5" — a label naming a thing wants a picture of the thing.
 * The caption is a story now ("6th grade School Talent show, performing 'Dream
 * On' by Aerosmith") and a story wants the person in it. A floating guitar
 * cannot be at a talent show.
 *
 * THREE MARKS CARRY THE WHOLE PICTURE and everything else is confirmation:
 *
 *   THE MIC ON ITS BOOM. This is the one that says STAGE. Without it the
 *   drawing is a boy holding a guitar in a bedroom, which is a different and
 *   much less interesting fact. It comes in on a boom from a stand off to his
 *   right, the way every school-auditorium stand is rigged, rather than on a
 *   straight post — a straight post in front of a singer hides him.
 *
 *   THE OPEN MOUTH. Two closed eyes and an open oval, and he is not holding a
 *   guitar, he is SINGING. It is four strokes and it is the difference between
 *   a portrait and a performance.
 *
 *   THE ANGLE OF THE NECK. Body low on his right, neck up across his body to
 *   the left — which is a right-handed player seen from the front, and is what
 *   the photograph shows. Drawn level, a guitar is a canoe.
 *
 * THE GUITAR IS DRAWN BEFORE THE ARMS, so the hands land ON it. Arms first and
 * there is a beat holding a boy reaching into empty air, and then a guitar
 * arrives underneath his hands, which reads as the guitar being handed to him.
 * Contact is an event.
 *
 * See src/film/sketches/kit.ts.
 */

import type { SketchData, SketchStroke } from '../sketch'
import { W, curve, fit, hand, line, poly, ring } from './kit'

/** where the neck meets the body — the one point the body and the neck share */
const JOINT: readonly [number, number] = [0.436, 0.492]

const STROKES: SketchStroke[] = [
  /* ================================================================ *
   * The boy
   * ================================================================ */

  // the head, with a jaw that tapers — a circle on a neck is a lollipop
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

  // hair, sitting ABOVE the skull rather than on it. Flat to the head it is a
  // swimming cap, which is the note this drawing's older sibling kept getting.
  curve(W.line, [
    [0.451, 0.07],
    [0.456, 0.028],
    [0.492, 0.01],
    [0.532, 0.015],
    [0.556, 0.036],
    [0.561, 0.072],
  ]),

  /* ---- the face, and it is SINGING ---- */
  curve(W.fine, [
    [0.47, 0.089],
    [0.482, 0.082],
    [0.494, 0.089],
  ]),
  curve(W.fine, [
    [0.518, 0.089],
    [0.53, 0.082],
    [0.542, 0.089],
  ]),
  // the open mouth. A tall oval, not a wide one: a wide one is a grin.
  ring(W.line, 0.505, 0.127, 0.015, 0.023),

  line(W.line, 0.482, 0.152, 0.478, 0.196),
  line(W.line, 0.528, 0.152, 0.532, 0.196),

  /* ---- the torso, closed, so it is a body from the moment it lands ---- */
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

  // the collar. One V, and the torso is wearing a shirt rather than being one.
  poly(W.line, [
    [0.478, 0.2],
    [0.505, 0.246],
    [0.532, 0.2],
  ]),

  /* ---- the legs, as ONE closed silhouette: two shapes and there is a beat
     holding a single leg, which is a man on a pogo stick ---- */
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
   * The guitar — body, then neck, then the arms that hold it
   * ================================================================ */

  /**
   * THE BODY, and what makes it read as ELECTRIC is the two horns at the
   * joint. An earlier sibling of this file had horns barely proud of the neck
   * and a waist barely narrower than the bout, and it came out a pear with a
   * stick in it. The horns have to be nubs you could hang the thing on.
   */
  hand(
    curve(
      W.edge,
      [
        JOINT,
        [0.41, 0.444],
        [0.386, 0.452],
        [0.372, 0.482],
        [0.336, 0.486],
        [0.288, 0.502],
        [0.256, 0.548],
        [0.256, 0.6],
        [0.288, 0.638],
        [0.34, 0.648],
        [0.392, 0.63],
        [0.428, 0.596],
        [0.452, 0.56],
        [0.48, 0.544],
        [0.47, 0.516],
      ],
      { closed: true },
    ),
    0.0035,
    5.0,
  ),

  /* Neck and headstock as ONE stroke: up the low side, round the paddle, back
     down the high side. Drawn as three separate marks there is always a beat
     holding either two bare parallel rules (a slingshot) or a paddle on a
     single stick (a hand mirror). Drawn as one outline it is a neck the whole
     way through. */
  poly(W.edge, [
    [0.443, 0.505],
    [0.742, 0.353],
    [0.788, 0.35],
    [0.814, 0.331],
    [0.806, 0.304],
    [0.762, 0.304],
    [0.728, 0.327],
    [0.429, 0.479],
  ]),
  // the nut, which is the mark that stops the neck being a plank
  line(W.line, 0.742, 0.353, 0.728, 0.327),

  /* ---- the arms, LAST of the three, so both hands land on something ----
     Each is a closed loop out and back rather than a single line, because a
     one-stroke arm on an outlined body is a piece of string. */

  // his right, strumming: down and forward, hand over the bridge
  curve(
    W.line,
    [
      [0.424, 0.226],
      [0.386, 0.268],
      [0.362, 0.34],
      [0.372, 0.42],
      [0.392, 0.484],
      [0.416, 0.496],
      [0.424, 0.47],
      [0.408, 0.412],
      [0.398, 0.344],
      [0.414, 0.276],
    ],
    { closed: true },
  ),

  // his left, fretting: up and across, hand ON the neck
  curve(
    W.line,
    [
      [0.586, 0.226],
      [0.626, 0.264],
      [0.648, 0.33],
      [0.668, 0.372],
      [0.682, 0.398],
      [0.656, 0.41],
      [0.642, 0.386],
      [0.622, 0.348],
      [0.6, 0.288],
      [0.578, 0.252],
    ],
    { closed: true },
  ),

  /* ---- the small confirming marks ----
     Two strings, not six. Six crossed with frets turns the centreline into a
     grey ladder that reviewers of the old file called a barcode, a radiator
     grille and a zip — and at act-2 size it collapsed into a solid bar. Nobody
     counts the strings on a drawn guitar. They count the ladder. */
  line(W.hair, 0.732, 0.343, 0.368, 0.552),
  line(W.hair, 0.736, 0.35, 0.376, 0.564),

  // pickup and bridge, both ACROSS the body's axis. Drawn along it they are
  // two more strings.
  line(W.line, 0.332, 0.525, 0.368, 0.596),
  line(W.line, 0.28, 0.543, 0.316, 0.614),

  // the strap, over his far shoulder. One line, and the guitar stops being
  // balanced on his hands.
  line(W.fine, 0.408, 0.448, 0.578, 0.24),

  /* ================================================================ *
   * The stand — the mark that says STAGE
   * ================================================================ */
  /* THE STAND CLEARS THE GUITAR, and that took a pass to learn. The boom used
     to be clutched low, at chest height, so it ran up across the whole
     instrument — and a long diagonal crossing another long diagonal (the
     strap) turned the middle of the drawing into a lattice. Clutched high, at
     0.30, the boom passes ABOVE the body and lands on the mouth with nothing
     in between. The post moved left for the same reason: at 0.30 it stood
     through the lower bout. */
  line(W.line, 0.156, 0.972, 0.246, 0.972),
  line(W.line, 0.198, 0.97, 0.208, 0.302),
  line(W.line, 0.206, 0.298, 0.398, 0.19),
  // the capsule, angled up at his mouth, ending a hair clear of his cheek —
  // a mic touching the face is a dentist's mirror
  curve(
    W.line,
    [
      [0.39, 0.196],
      [0.412, 0.166],
      [0.434, 0.132],
      [0.452, 0.142],
      [0.432, 0.176],
      [0.408, 0.212],
    ],
    { closed: true },
  ),
]

export const GUITAR: SketchData = fit(STROKES)

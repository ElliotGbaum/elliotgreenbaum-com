/**
 * Camera rig — a lagging follow cam with no rotation at all.
 *
 * Deliberately not an orbit control, and deliberately not a rig that swings
 * round behind your heading either. Both were tried; both make people lost and
 * slightly nauseous in a dark world with few landmarks, and a camera that
 * re-frames itself every time you change direction is *worse* than a free one,
 * because you didn't ask for the move. The horizon here holds still. You turn,
 * the figure turns, the shot does not.
 *
 * The trade is that we owe them a good default angle, so this one sits high
 * enough to read the field and leads slightly in the direction of travel.
 *
 * It also owns the lens, and the frame the lens is pointed through. A scripted
 * move can ask for a different focal length — the film is watched on a long
 * one, from across the field — and `resize()` has to know not to stamp its own
 * field of view over the top while that is running, which it will happily do
 * the moment anyone turns their phone. The frame is a vertical frustum shift
 * for windows taller than the shot was composed on: see `ASPECT_FLOOR` below
 * and the frame paragraph at the bottom of `resize()`.
 */

import * as THREE from 'three'
import { ease, clamp } from '../core/contract'
import { fitFov, fovShortfall, fovSurplus, type LensLimits } from '../core/lens'

// Tuned by eye against shots/. The first pass sat at (0,17,21) looking at the
// player's feet, which pitched the camera ~39° down: no sky, no horizon, and
// the projector beacon — the entire navigation model — was off the top of the
// frame. Lower and flatter, looking at a point above the figure, so the field
// and its landmarks are what you actually see.
//
// The offsets are measured from the ground now rather than from a light
// floating at 1.9, which is where the extra 1.9 in both numbers went when the
// player became a person standing on the field.
const BASE_OFFSET = new THREE.Vector3(0, 10.4, 26)
/** look at a point above the figure's head, to lift the horizon */
const BASE_LOOK_LIFT = 6.1
const LAG = 3.1 // higher = tighter follow

/**
 * The lens the shot is framed on, at 16:9. Every other window shape is
 * derived from this one by src/core/lens.ts — read the note at the top of
 * that file before changing either number, because this used to be a fixed
 * vertical fov and that is exactly what made the field spread out fullscreen
 * and close in when the window was dragged narrow.
 */
const REF_FOV = 50
/**
 * `max` is the rail that stops the lens turning into a fisheye: the honest fov
 * for a phone held upright is past 85°, which puts the figure's head at the
 * very top of the frame. It is no longer what a tall window actually meets —
 * `ASPECT_FLOOR` below stops the fit at 56.6° first — and it stays here as the
 * outer guard for anyone who lowers that floor or raises `REF_FOV`.
 *
 * `maxHorizontal` is the clamp that is still live, at the other end, and it is
 * the only one that still makes this rig stand off: it bites past 3.19:1, and
 * a 32:9 monitor backs the camera up by 0.7%.
 */
const FIELD_LENS: LensLimits = { min: 36, max: 62, maxHorizontal: 96 }

/**
 * THE FLOOR. Below this window shape the shot stops being re-derived at all:
 * the lens holds the angle it has here and the rig holds the distance it has
 * here, so a narrower window is a horizontal CROP of this composition rather
 * than a new one. That is the plain answer to "as the page shrinks the
 * dimensions get messed up" — below 4:3 they stop changing.
 *
 * WHY THERE HAS TO BE A FLOOR. `fitFov` trades height for width, and on the
 * way down that trade stops paying: past `FIELD_LENS.max` the lens cannot open
 * any further, so `fovShortfall` grows and the rig answers by backing off —
 * and backing off is a similarity transform, which cannot move anything in the
 * frame. It buys world units and spends the subject. At 500 × 950 the old rig
 * stood 33.4 out instead of 28 and the figure was 4.6% of the frame height
 * against 6.8% on a laptop: the field did not so much get wider as the whole
 * shot recede.
 *
 * WHY 4:3, AND NOT THE RAIL AT 1.071. Stopping at the rail hands every
 * portrait window a 62° lens — the fisheye the rail exists to forbid, kept
 * only because it is the last legal value. 4:3 stops one step earlier, at
 * 56.6°, which is the widest this shot still reads as a window rather than a
 * lens, and it is the last shape anybody ever composed a picture for. It costs
 * about a quarter of the visible field width on a phone (21.1 world units at
 * 500 × 950 down to 15.9) and buys back a third of the figure. Nothing wider
 * than 4:3 moves at all.
 */
const ASPECT_FLOOR = 4 / 3

export interface Rig {
  camera: THREE.PerspectiveCamera
  update(dt: number, focus: THREE.Vector3, velocity: THREE.Vector3): void
  /** glide to a fixed vantage — used for the projector's watching shot */
  cutTo(position: THREE.Vector3, lookAt: THREE.Vector3, seconds: number, fov?: number): Promise<void>
  /** re-aim a scripted shot with no animation, for resize mid-take */
  snapTo(position: THREE.Vector3, lookAt: THREE.Vector3, fov?: number): void
  /** hand control back to the follow cam */
  release(seconds?: number): void
  resize(w: number, h: number): void
}

export function createRig(): Rig {
  // The 1 and the REF_FOV are both placeholders: main.ts calls `resize` once
  // before the first frame and both are replaced by what the window actually
  // is. They are the reference values rather than arbitrary ones so that a
  // rig somebody forgets to resize is at least framed for a laptop.
  const camera = new THREE.PerspectiveCamera(REF_FOV, 1, 0.1, 400)
  camera.position.set(0, 17, 67)

  const desired = new THREE.Vector3()
  const lookTarget = new THREE.Vector3()
  const lead = new THREE.Vector3()
  const offset = BASE_OFFSET.clone()
  let lookLift = BASE_LOOK_LIFT

  // scripted-move state
  let scripted = false
  let sFrom = new THREE.Vector3()
  let sTo = new THREE.Vector3()
  let sLookFrom = new THREE.Vector3()
  let sLookTo = new THREE.Vector3()
  let sT = 0
  let sDur = 1
  let sResolve: (() => void) | null = null
  let releasing = 0

  // the lens: what the follow cam wants, and what a scripted shot has asked
  // for instead
  let baseFov = REF_FOV
  let fovFrom = REF_FOV
  let fovTo = 0 // 0 = no override

  // the frame: how far the frustum is panned UP, in half-frame-heights, so a
  // window taller than the shot was composed on spends its surplus vertical on
  // sky instead of on unlit ground. `viewW/viewH` are the last window size,
  // because setViewOffset offsets inside a full frame it has to be told about
  // — and it derives camera.aspect from that pair, so they have to be the real
  // ones, not the floored shape the lens is fitted at.
  let viewW = 1
  let viewH = 1
  let baseShift = 0 // what the follow cam wants for this window
  let shift = 0 // what is on the camera right now
  let shiftFrom = 0 // its value when a scripted shot took over

  function applyFov(v: number) {
    if (Math.abs(camera.fov - v) < 0.01) return
    camera.fov = v
    camera.updateProjectionMatrix()
  }

  /* NEGATIVE offsetY, because three.js does `top -= offsetY * height /
     fullHeight`: a positive offset pushes the frustum's top edge DOWN and
     rides the world UP the frame, and we want the opposite — the frustum
     panned up, the surplus landing in sky, the dead ground pushed off the
     bottom. The zero test is a fifth of a pixel on a 900-tall window; under
     that there is no shift, only rounding, and leaving a view rectangle
     enabled for it is how `clearViewOffset` stops being reachable. Both
     branches call updateProjectionMatrix for us. */
  function writeView() {
    if (Math.abs(shift) < 0.0005) camera.clearViewOffset()
    else camera.setViewOffset(viewW, viewH, 0, (-shift * viewH) / 2, viewW, viewH)
  }

  function applyShift(v: number) {
    if (v === shift) return
    shift = v
    writeView()
  }

  function update(dt: number, focus: THREE.Vector3, velocity: THREE.Vector3) {
    if (scripted) {
      sT = Math.min(sDur, sT + dt)
      const k = ease(sDur <= 0 ? 1 : sT / sDur)
      camera.position.lerpVectors(sFrom, sTo, k)
      lookTarget.lerpVectors(sLookFrom, sLookTo, k)
      camera.lookAt(lookTarget)
      if (fovTo > 0) applyFov(fovFrom + (fovTo - fovFrom) * k)
      /* A scripted shot is framed by whoever wrote it, so the frame comes back
         to centre — but over the same glide, not on the first frame of it. A
         hard clear here is a jump cut at the top of the move into the film. */
      applyShift(shiftFrom * (1 - k))
      if (sT >= sDur && sResolve) {
        const r = sResolve
        sResolve = null
        r()
      }
      return
    }

    // lead the camera slightly into the direction of travel — small, but it's
    // most of the difference between "following" and "chasing"
    lead.copy(velocity).multiplyScalar(0.34)
    lead.y = 0

    desired.copy(focus).add(offset).add(lead)

    const k = 1 - Math.exp(-LAG * dt)
    // When returning from a scripted move, ease back in rather than snapping.
    // `releasing` starts ABOVE 1 (the default hand-back is 1.1s), so the naive
    // `1 - releasing` is negative for the first tenth of a second and lerps the
    // camera *away* from where it is going — a visible kick at the exact moment
    // the film ends and everyone is looking. Clamp it: the first frames of the
    // hand-back are simply a hold, which is what was wanted anyway.
    const blend = releasing > 0 ? k * clamp(1 - releasing) : k
    if (releasing > 0) {
      releasing = Math.max(0, releasing - dt * 0.9)
      // the lens comes home at the same rate the framing does, and so does the
      // frame — otherwise the shift snaps back on the frame the film ends, in
      // front of everyone, which is the one moment nobody is looking away
      applyFov(camera.fov + (baseFov - camera.fov) * Math.min(1, dt * 2.2))
      applyShift(shift + (baseShift - shift) * Math.min(1, dt * 2.2))
    } else {
      applyFov(baseFov)
      applyShift(baseShift)
    }

    camera.position.lerp(desired, blend)

    lead.copy(focus).addScaledVector(velocity, 0.22)
    lead.y += lookLift
    lookTarget.lerp(lead, Math.min(1, k * 1.3))
    camera.lookAt(lookTarget)
  }

  return {
    camera,
    update,

    cutTo(position, lookAt, seconds, fov) {
      scripted = true
      releasing = 0
      sFrom = camera.position.clone()
      sTo = position.clone()
      sLookFrom = lookTarget.clone()
      sLookTo = lookAt.clone()
      sT = 0
      sDur = Math.max(0.001, seconds)
      fovFrom = camera.fov
      fovTo = fov ?? 0
      shiftFrom = shift
      return new Promise<void>((res) => {
        sResolve = res
      })
    },

    snapTo(position, lookAt, fov) {
      if (!scripted) return
      // a scripted re-frame owns the whole frame, offset included, and it has
      // just recomputed itself for the new window shape
      shiftFrom = 0
      applyShift(0)
      sFrom.copy(position)
      sTo.copy(position)
      sLookFrom.copy(lookAt)
      sLookTo.copy(lookAt)
      sT = sDur
      camera.position.copy(position)
      lookTarget.copy(lookAt)
      camera.lookAt(lookTarget)
      if (fov) {
        fovFrom = fov
        fovTo = fov
        applyFov(fov)
      }
    },

    release(seconds = 1.1) {
      scripted = false
      sResolve = null
      fovTo = 0
      releasing = clamp(seconds, 0, 3)
    },

    resize(w: number, h: number) {
      const aspect = Math.max(1, w) / Math.max(1, h)
      camera.aspect = aspect
      viewW = Math.max(1, w)
      viewH = Math.max(1, h)

      /* ONE SHAPE DRIVES THE WHOLE SHOT, and past the floor it stops moving.
         Everything below reads `shape`, never `aspect` — that is what makes a
         tall window a crop of a composition somebody framed rather than a
         composition nobody framed. `camera.aspect` above is still the real
         one: the frustum has to match the canvas or the picture stretches. */
      const shape = Math.max(ASPECT_FLOOR, aspect)

      /* THE LENS FIRST. `fitFov` holds the amount of world in frame constant
         and lets its shape follow the window — a wide desktop gives back a
         little height for the width it gains instead of opening to 95°, and a
         window dragged in from 16:9 gets that height back instead of turning
         the field into a corridor. At 16:9 it hands REF_FOV straight back; at
         the floor it reaches 56.6° and holds there. */
      baseFov = fitFov(REF_FOV, shape, FIELD_LENS)

      /* …THEN THE CAMERA, for what the lens was not allowed to do. That is the
         ULTRAWIDE end now, and only that: the floor keeps `shape` clear of the
         62° rail, so the tall window this used to answer never reaches it and
         what is left is `maxHorizontal` biting past 3.19:1 — a 32:9 monitor
         stands the rig off by 0.7%. It is kept because it is still the right
         answer there, not out of sentiment.

         AND IT IS ONLY TAKEN HALFWAY, which is the one number here that is a
         judgement rather than geometry. Backing off by the whole shortfall
         restores the width exactly, and it is the wrong trade: it spends the
         figure and the machine to buy it, on the screen with the fewest pixels
         to draw them with. That is the lesson the floor generalises — standing
         further off is a similarity transform about the figure, so it cannot
         move anything IN the frame, it only makes everything in the frame
         smaller. The old code did this with three hand-tuned ramps (+2 up, +16
         back, +5 of look lift) and they only agreed with each other at the one
         aspect they were tuned at. */
      const back = Math.sqrt(fovShortfall(REF_FOV, shape, FIELD_LENS))
      offset.set(0, BASE_OFFSET.y * back, BASE_OFFSET.z * back)
      lookLift = BASE_LOOK_LIFT * back

      /* …AND THEN THE FRAME, which is the part neither the lens nor the
         distance can do. The rig never rolls or yaws, so the frustum is
         symmetric about an axis pitched a fixed 9.4° down, and the figure's
         feet sit a fixed 12.4° below that axis at EVERY window shape — the
         back-off scales offset and look lift together, and a similarity
         transform cannot re-aim anything. So the share of the frame underneath
         the feet is a function of the vertical fov alone,

             below the feet = (tan(fov/2) − tan 12.4°) / (2 · tan(fov/2))

         and every extra degree the lens opens for a taller window is split
         evenly above and below that axis. Half of each degree is spent
         downward, into ground that has nothing on it: the lantern pool is
         about seven units across and everything past it is unlit dirt. That
         was the black gutter — 31.7% of the frame at 500 × 950 against 26.4%
         on a laptop.

         `fovSurplus` is exactly that surplus and the shift spends all of it
         upward. Zero at 16:9 and wider, so those windows come back bit for
         bit; 2.6% of the frame height at 1440 × 900; and held by the floor at
         6.7% for every window from 4:3 down, where it puts the bottom edge of
         the frame on the same patch of ground the 16:9 shot ends on — 10.8
         units behind the figure, at every one of them. The sky takes the whole
         surplus, which is the right way round: up there are the beacon column,
         the stars and the fog gradient, and down there is nothing. All of it
         rather than a fraction, because a fraction is a ramp nobody can name
         and this is an invariant that can be stated in one sentence. */
      baseShift = fovSurplus(REF_FOV, shape, FIELD_LENS)

      /* Never stamp the base lens — or the base frame — over a shot that is
         already mid-move. A scripted shot is re-framed by whoever owns it (see
         main.ts's resize, which calls snapTo straight after this), and a
         hand-back is a second and a bit of easing that an assignment here
         would cut clean through. `writeView` runs either way, because whatever
         offset is live has to be re-expressed for the new window size. */
      if (!scripted && releasing <= 0) {
        applyFov(baseFov)
        shift = baseShift
      }
      writeView()
    },
  }
}

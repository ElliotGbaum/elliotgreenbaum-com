/**
 * The minigame: five courses, in a world of their own.
 *
 * It borrows the renderer from the field — a second WebGL context is the most
 * expensive thing you can ask a browser for — and owns everything else. While
 * it is running, main.ts draws this scene instead of the field's and hands it
 * the frame; when it exits, the field is exactly where it was left.
 *
 * THE TICK IS THE POINT. The physics runs at a fixed 20 Hz because Minecraft's
 * does (see physics.ts), and the frame you actually see interpolates between
 * the last two ticks. That is not an optimisation, it is the reason a jump
 * measures 1.2522 blocks on a 144 Hz monitor and on a throttled phone alike.
 *
 * THE CAMERA IS F5. Third person, four blocks back, pointer-locked mouse-look,
 * and it pulls in when there is a wall behind you. It also breaks the field's
 * one camera rule — out there the horizon never turns, in here it has to,
 * because a course that turns a corner cannot be played on a fixed heading.
 * The change of rule is deliberate and it is part of the change of world.
 */

import * as THREE from 'three'
import { clamp } from '../core/contract'
import { fitFov, type LensLimits } from '../core/lens'
import { LEVELS, type Level } from './levels'
import { buildCourse, touching, groundUnder, pointBlocked, type CourseWorld } from './course'
import { buildScene, type LevelScene } from './scene'
import { createAvatar } from './avatar'
import { createControls } from './input'
import { createParkourHud } from './hud'
import { loadProgress, saveProgress, type Progress } from './progress'
import {
  createBody,
  tickBody,
  TICK,
  EYE_HEIGHT,
  SNEAK_EYE_HEIGHT,
  type Body,
  type Input,
} from './physics'

export interface Parkour {
  readonly active: boolean
  /** how many of the five have been finished */
  readonly cleared: number
  enter(level?: number): void
  leave(): void
  /** called from the world's frame loop while active */
  update(dt: number): void
  render(renderer: THREE.WebGLRenderer): void
  resize(w: number, h: number): void
  onLeave(cb: () => void): void
  dispose(): void
}

/**
 * How far behind the figure the camera sits, in blocks. Minecraft's F5 is 4;
 * this is a little further and a little higher, because Minecraft's third
 * person is for looking at yourself and this one has to show you the jump.
 */
const CAM_DIST = 5.2
/**
 * THE SIGN HERE WAS WRONG FOR A LONG TIME AND IT COST TWO REVIEWS.
 *
 * The camera sits behind the look point along the *reverse* of the view
 * direction, so pitching down (a negative pitch) must move the camera UP.
 * The offset used `+sin(pitch)`, which moved it DOWN — a −0.42 pitch put the
 * eye 2.2 blocks under the deck. That got patched with a constant height
 * offset, which lifted the camera back up and, in doing so, cancelled the
 * tilt: the shipped view direction came out at 0.36° below horizontal, so a
 * flat course at your own height was a three-pixel ribbon on the horizon.
 *
 * With the sign right, one number does one job: `START_PITCH` is the view
 * angle, and the camera's height above the deck falls out of it as
 * `LOOK_Y + |sin(pitch)|·CAM_DIST`. No compensating constant, nothing to
 * cancel.
 */
const LOOK_Y = 1.15
/**
 * …and it starts tilted down. A level horizon puts the course off the bottom
 * of the frame, which is the single most common way a third-person platformer
 * gets this wrong.
 */
/** ≈17° down: enough to see the next three platforms, not so much that the
 *  figure is a hat. First person keeps the same value and reads beautifully. */
const START_PITCH = -0.3
/**
 * …and it drops when you crouch, by the same 0.35 vanilla drops the eye by.
 * A crouch you cannot see is a crouch nobody uses, and in first person there
 * is no figure to look at: the camera sinking IS the feedback. Third person
 * gets the same drop on its look point, which takes the whole camera down
 * with it — so the cue is the same gesture in all three views.
 */
const CROUCH_DROP = EYE_HEIGHT - SNEAK_EYE_HEIGHT
/** the camera never comes closer than this: see the squeeze note below */
const CAM_MIN = 1.1
/**
 * How much air the camera keeps under it, and how big a box it checks itself
 * against. THE CLEARANCE HAS TO BE THE LARGER OF THE TWO. They were 0.4 and
 * 0.45, so a camera lifted to the legal height above a deck was still, by half
 * a decimal place, "inside" that deck — the two guards disagreed about the
 * same position and the walk-in loop lost every argument.
 */
const CAM_CLEAR = 0.5
const CAM_PROBE = 0.45
/** F5 cycles these, in this order, exactly as vanilla does */
const VIEW_FIRST = 0
const VIEW_BACK = 1
const VIEW_FRONT = 2
const PITCH_LIMIT = Math.PI / 2 - 0.02
/** the fov the lens opens to while sprinting, as Minecraft's does */
const FOV = 70
const FOV_SPRINT = 78
/** …and how far it closes while sneaking. Small: it is the third crouch cue
 *  behind the pose and the camera drop, and three subtle ones read better
 *  than one loud one. */
const FOV_SNEAK_CLOSE = 3

/**
 * All three of those are authored for a 16:9 window and refitted for whatever
 * shape the real one is — see src/core/lens.ts.
 *
 * Vanilla holds the vertical fov and lets the horizontal go wherever the
 * window says, which is right up to about 2:1 and wrong past it: a maximised
 * ultrawide reaches 117° across, and at that angle a rectilinear projection
 * shears everything near the left and right edges hard enough that players
 * read it as a bug rather than as a wide shot. Tall windows have the mirror
 * problem — a phone in portrait ends up looking down a 36° tunnel, which is
 * not a fair place to line up a jump from.
 *
 * `maxHorizontal` governs the RESTING lens only; the sprint kick is applied
 * on top of the fitted angle and is allowed to punch past it for as long as
 * you hold the sprint, because a speed cue that vanishes on wide monitors is
 * not a speed cue.
 */
const PARKOUR_LENS: LensLimits = { min: 46, max: 82, maxHorizontal: 106 }

/**
 * `y`, but never less than CAM_CLEAR above whatever floor is under (x, z).
 *
 * Pitching all the way down used to put the camera under the deck, where the
 * whole frame is the underside of the platform you are standing on — and
 * `pointBlocked` cannot see that, because open air below a floor is not inside
 * anything. `from` is the height the search starts at: the player's look
 * point, not the camera's own y, so a camera that has already dipped below a
 * deck still finds the deck it needs to climb back over.
 */
function overFloor(
  world: CourseWorld,
  x: number,
  y: number,
  z: number,
  from: number,
): number {
  const floor = groundUnder(world, x, from, z)
  return floor === null ? y : Math.max(y, floor + CAM_CLEAR)
}

export function createParkour(canvas: HTMLCanvasElement): Parkour {
  const hud = createParkourHud()
  /* Bound to the CANVAS, not to `#pk`. The chrome layer is
     `pointer-events: none` so that the game shows through it, which meant a
     listener on it received precisely nothing: every touch went to the canvas
     underneath, the thumbstick never armed, and the phone build was a picture
     of somebody who could jump but could not walk or turn. The buttons worked
     throughout — they have their own listeners — which is exactly why it
     survived a suite that only checked the buttons were big enough. */
  const controls = createControls(canvas, canvas)
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 600)
  const avatar = createAvatar()

  let progress: Progress = loadProgress()
  let active = false
  let index = 0
  let level: Level = LEVELS[0]!
  let world: CourseWorld | null = null
  let view: LevelScene | null = null
  let body: Body = createBody(0, 0, 0)

  /** the previous tick's position, for the interpolation the frame draws */
  const prev = { x: 0, y: 0, z: 0 }
  let acc = 0
  let elapsed = 0
  let clock = 0
  let falls = 0
  let finished = false
  let paused = false
  let respawn = { x: 0, y: 0, z: 0, yaw: 0 }

  /** how far the figure has walked, and how hard it is working */
  let travelled = 0
  let gait = 0
  /** eased on the tick, not the frame */
  let airEase = 0
  /** …and so is the crouch: 0 standing, 1 folded, four ticks between them */
  let crouchEase = 0
  /** decays out of a landing — the weight of hitting the floor */
  let impact = 0
  /** simulation ticks since the level began — the movers' only clock */
  let ticks = 0
  let bodyYaw = 0
  let camYaw = 0
  let camPitch = START_PITCH
  /**
   * The animated lens, in REFERENCE degrees — what this shot would be on a
   * 16:9 window. `applyFov` is the only thing that turns it into an angle the
   * camera is given, so the sprint kick and the aspect refit can never end up
   * fighting each other over `camera.fov`.
   */
  let fov = FOV
  /** the window's shape, remembered so the lens can be refitted on demand */
  let camAspect = 16 / 9

  /**
   * Fit the reference lens to the window, then scale it by however far the
   * animated fov has moved off neutral. Sprinting therefore opens the lens by
   * the same proportion on every monitor rather than by a fixed number of
   * degrees that reads as a lurch on one shape and as nothing on another.
   */
  function applyFov(): void {
    const want = fitFov(FOV, camAspect, PARKOUR_LENS) * (fov / FOV)
    if (Math.abs(camera.fov - want) < 0.05) return
    camera.fov = want
    camera.updateProjectionMatrix()
  }

  /**
   * Which camera. Vanilla starts in first person and most parkour is played
   * there; this starts behind the figure because half the reason the minigame
   * exists is that you can see it — but F5 cycles, and first person is one
   * press away.
   */
  let camView = VIEW_BACK

  /** seconds to allow for pointer lock to be granted before asking for it */
  let lockGrace = 0
  /** how many times we have asked. After two, stop asking and play anyway. */
  let lockAsks = 0
  let fade = 0
  let fadeTo = 0
  const leaveCbs: Array<() => void> = []

  const input: Input = { forward: 0, strafe: 0, jump: false, sprint: false, sneak: false }

  /** shortest signed angle, in radians */
  const wrap = (a: number) => {
    let d = (a + Math.PI) % (Math.PI * 2)
    if (d < 0) d += Math.PI * 2
    return d - Math.PI
  }

  /* ---------------- level lifecycle ---------------- */

  function load(i: number): void {
    view?.dispose()
    index = clamp(i, 0, LEVELS.length - 1) | 0
    level = LEVELS[index]!
    world = buildCourse(level)
    view = buildScene(level)
    view.scene.add(avatar.object)
    view.scene.add(avatar.shadowObject)

    respawn = { ...level.spawn }
    place(respawn)
    elapsed = 0
    clock = 0
    falls = 0
    finished = false
    paused = false
    travelled = 0
    gait = 0
    airEase = 0
    crouchEase = 0
    impact = 0
    ticks = 0
    camYaw = level.spawn.yaw
    camPitch = START_PITCH
    hud.crosshair(camView === VIEW_FIRST)

    hud.setLevel(index, LEVELS.length, level.name)
    hud.setFalls(0)
    hud.setTimer(0)
    hud.hidePanel()
    hud.card(level.name, index, level.hint)
  }

  function place(at: { x: number; y: number; z: number; yaw?: number }): void {
    body = createBody(at.x, at.y, at.z, at.yaw ?? bodyYaw)
    prev.x = at.x
    prev.y = at.y
    prev.z = at.z
    acc = 0
    if (at.yaw !== undefined) {
      bodyYaw = at.yaw
      camYaw = at.yaw
    }
  }

  function fell(): void {
    falls++
    hud.setFalls(falls)
    hud.toast('Fell — back to the last checkpoint')
    place(respawn)
  }

  function reachedGoal(): void {
    if (finished) return
    finished = true
    paused = true
    controls.releaseLock()

    const best = progress.best[level.id]
    const isBest = best === undefined || clock < best
    if (isBest) progress.best[level.id] = clock
    if (!progress.cleared.includes(level.id)) progress.cleared.push(level.id)
    saveProgress(progress)

    const time = `${clock.toFixed(1)}s`
    const last = index === LEVELS.length - 1
    hud.complete({
      title: last ? 'All five' : `${level.name} — clear`,
      lines: last
        ? [
            `Every course finished. Last one in ${time}, ${falls} fall${falls === 1 ? '' : 's'}.`,
            'Inspired by my Minecraft parkour days.',
          ]
        : [
            `${time}, ${falls} fall${falls === 1 ? '' : 's'}.${isBest && best !== undefined ? ' A new best.' : ''}`,
          ],
      nextLabel: last ? null : `Level ${index + 2}`,
      onNext: last ? null : () => start(index + 1),
      onRetry: () => start(index),
      onLeave: () => leave(),
    })
  }

  function start(i: number): void {
    hud.hidePanel()
    hud.setLockPrompt(false)
    load(i)
    controls.setEnabled(true)
    if (!controls.touch) {
      lockGrace = 0.9
      lockAsks = 0
      controls.requestLock()
    }
  }

  /* ---------------- the tick ---------------- */

  function step(): void {
    if (!world) return
    prev.x = body.x
    prev.y = body.y
    prev.z = body.z

    /* Tick time, not wall-clock. `elapsed` advances once per FRAME, so every
       tick inside a multi-tick frame saw the same platform position: the first
       got the whole frame's delta and the rest got none, which on a 30 Hz
       display is a 1.3-tick shove and on a stutter is three ticks in one. In a
       file whose thesis is that nothing is frame-rate dependent. */
    ticks++
    world.setTime(ticks * TICK)

    // WASD is relative to where the camera is looking, which is what makes
    // this Minecraft rather than the field outside
    input.forward = controls.forward
    input.strafe = controls.strafe
    input.jump = controls.jump
    input.sprint = controls.sprint
    input.sneak = controls.sneak
    body.yaw = camYaw

    tickBody(body, input, world.collider)

    /* The walk cadence is ground covered, so the feet keep up with the floor.
       `gait` is how hard the legs are working, eased toward the speed the way
       the field's figure does it — full at a sprint, gentle at a walk. */
    const moved = Math.hypot(body.x - prev.x, body.z - prev.z)
    travelled += moved
    const want = Math.min(moved / 0.28, 1)
    // eased HERE, inside the fixed tick, not in the frame: everything else in
    // this game is frame-rate independent and the figure has to be too
    gait += (want - gait) * 0.35
    airEase += ((body.onGround ? 0 : 1) - airEase) * 0.25
    // the fold, and the camera drop that rides on it. On the tick with
    // everything else, so a crouch takes the same 0.2s on every machine.
    crouchEase += ((body.sneaking ? 1 : 0) - crouchEase) * 0.4
    // how hard we hit the floor, which is the whole of a landing
    if (body.landed > 0.12) impact = Math.min(1, body.landed / 0.9)
    impact *= 0.72

    /* The body turns to follow where you are going — but vanilla flips that
       target by 180° when it is more than 95° off your current facing, which
       is why holding S in Minecraft walks you backwards rather than spinning
       you round. Without it the figure pirouettes every time you back up. */
    if (moved > 0.004) {
      let target = Math.atan2(body.x - prev.x, body.z - prev.z)
      let off = wrap(target - bodyYaw)
      const deg = Math.abs(off) * (180 / Math.PI)
      if (deg > 95 && deg < 265) target += Math.PI
      off = wrap(target - bodyYaw)
      bodyYaw += off * 0.3 // LivingEntity#tickHeadTurn uses 0.3
    }
    // …and the neck only turns so far. Vanilla clamps at 75°.
    const NECK = (75 * Math.PI) / 180
    const lead = wrap(camYaw - bodyYaw)
    if (lead > NECK) bodyYaw = camYaw - NECK
    if (lead < -NECK) bodyYaw = camYaw + NECK

    /* checkpoints, the goal, and the void */
    for (const cp of level.checkpoints) {
      if (
        touching(body.x, body.y, body.z, cp) &&
        (respawn.x !== cp.x || respawn.z !== cp.z || respawn.y !== cp.y)
      ) {
        respawn = { x: cp.x, y: cp.y, z: cp.z, yaw: bodyYaw }
        hud.toast('Checkpoint')
      }
    }
    if (!finished && touching(body.x, body.y, body.z, level.goal)) reachedGoal()
    if (body.y < level.voidY) fell()
  }

  /* ---------------- the frame ---------------- */

  const camTarget = new THREE.Vector3()
  const camWant = new THREE.Vector3()
  const lanternAt = new THREE.Vector3()
  const ray = new THREE.Raycaster()
  const back = new THREE.Vector3()

  /**
   * How far to move toward a target this frame, at `rate` per second.
   *
   * `min(1, dt · rate)` — which every smoothed value here used to use — is not
   * the same curve at 30 fps as at 144, and it is not a curve at all below
   * 1/rate seconds a frame: it clamps to 1 and the value teleports. The
   * exponential is the actual solution to the differential equation those two
   * lines were approximating, and it is identical at every frame rate. In a
   * game whose whole thesis is that the physics does not care how fast you
   * draw, the camera should not either.
   */
  const approach = (dt: number, rate: number) => 1 - Math.exp(-rate * dt)

  function update(dt: number): void {
    if (!active || !world || !view) return

    fade += (fadeTo - fade) * approach(dt, 6)
    hud.fade(fade)

    /* The mouse has to be captured for any of this to be steerable, and the
       browser will only hand it over off a real click. Rather than trusting
       the request, watch for the answer: if it has not arrived, stop the
       world and ask. This also covers Escape, a tab switch, and a browser
       that simply declines. */
    if (!controls.touch && !finished && lockAsks < 1) {
      if (lockGrace > 0) lockGrace -= dt
      else if (!controls.locked && !paused) {
        lockAsks++
        paused = true
        hud.setLockPrompt(true)
      }
    }

    /* look */
    const look = controls.takeLook()
    if (!paused) {
      camYaw += look.yaw
      // third person cannot look straight down — there is nothing under the
      // floor worth seeing, and the camera has to go somewhere
      // the camera is clamped above the floor below it now, so third person
      // can look most of the way down — at the block you are standing on,
      // which is the thing you most want to see before a drop
      const down = camView === VIEW_FIRST ? -PITCH_LIMIT : -1.25
      camPitch = clamp(camPitch + look.pitch, down, PITCH_LIMIT)
    }

    /* physics, at exactly 20 Hz whatever the frame rate is */
    if (!paused) {
      elapsed += dt
      clock += dt
      acc += dt
      // a hard cap, so a backgrounded tab does not simulate a hundred ticks
      // the moment it comes back and fling the player off the course
      let n = 0
      while (acc >= TICK && n < 5) {
        step()
        acc -= TICK
        n++
      }
      if (acc >= TICK) acc = 0
      hud.setTimer(clock)
    }

    /* the frame is drawn between two ticks, exactly as Minecraft draws it */
    const k = clamp(acc / TICK)
    const px = prev.x + (body.x - prev.x) * k
    const py = prev.y + (body.y - prev.y) * k
    const pz = prev.z + (body.z - prev.z) * k

    const headYaw = wrap(camYaw - bodyYaw)
    // …and the walk is interpolated for the part-tick too, or the body glides
    // at 120 Hz while the legs step at 20 and the two visibly disagree
    avatar.update(
      px, py, pz,
      bodyYaw,
      headYaw,
      -camPitch,
      travelled - gait * 0.28 * (1 - k),
      gait,
      elapsed,
      airEase,
      body.vy > 0,
      impact,
      crouchEase,
      body.vy,
    )
    avatar.setShadow(px, pz, groundUnder(world, px, py, pz), py)

    // sneaking, sprinting, or neither — said once, in the corner of the eye
    hud.setState(body.sneaking ? 'sneaking' : body.sprinting ? 'sprinting' : null)

    /* the camera, in whichever of the three it is on — and it sinks with the
       crouch, which is the cue that works in every view including the one
       with no figure in it */
    const eye = (camView === VIEW_FIRST ? EYE_HEIGHT : LOOK_Y) - CROUCH_DROP * crouchEase
    camTarget.set(px, py + eye, pz)
    if (camView === VIEW_FIRST) {
      camera.position.copy(camTarget)
      camera.lookAt(
        camTarget.x + Math.sin(camYaw) * Math.cos(camPitch),
        camTarget.y + Math.sin(camPitch),
        camTarget.z + Math.cos(camYaw) * Math.cos(camPitch),
      )
      // the arm and the lamp stay: "a dark shape and a light" loses half of
      // itself if first person hides the light
      avatar.setOpacity(0)
    } else {
      const sign = camView === VIEW_FRONT ? -1 : 1
      // the reverse of the view direction: looking down puts the camera up
      back.set(
        -Math.sin(camYaw) * Math.cos(camPitch) * sign,
        -Math.sin(camPitch) * sign,
        -Math.cos(camYaw) * Math.cos(camPitch) * sign,
      )
      /* Keep the camera out of the scenery. A single backwards ray is not
         enough — it misses a wall that the camera slides sideways into — so
         after the ray, walk the distance in and stop at the first position
         that is not inside anything. The collider makes that four AABB
         tests, which is cheaper than the ray was.

         A FLOOR IS NOT A WALL, AND THE ORDER OF THOSE TWO RULES IS THE WHOLE
         FIX. The lift ("never below the floor") used to run last, after the
         walk-in had already surrendered the distance — so a camera line that
         merely grazed the deck was treated as a camera line into a wall, and
         it walked all the way in to CAM_MIN. That is the worst place it can
         stop: the fade below hides the figure at exactly CAM_MIN, so the
         frame contained neither the player nor the course, which is precisely
         what the note on CAM_MIN says must not happen. Crouching in the front
         camera did it every time, because a look point 0.35 lower is a camera
         line 0.35 deeper into the deck.

         Lifting FIRST and testing after costs nothing and answers correctly:
         the camera rises over the platform it was skimming and keeps its five
         blocks, and only something it cannot rise over pulls it in. */
      let dist = CAM_DIST
      const farY = overFloor(
        world,
        camTarget.x + back.x * CAM_DIST,
        camTarget.y + back.y * CAM_DIST,
        camTarget.z + back.z * CAM_DIST,
        camTarget.y,
      )
      // from the same point the walk-in loop tests, offset included, or the
      // ray and the loop disagree about where the camera is
      camWant.copy(camTarget)
      ray.set(camWant, back)
      ray.far = CAM_DIST
      const hit = ray.intersectObjects(view.solids, false)[0]
      // …and the ray only counts if it hit something the lift does not already
      // clear. Otherwise the deck under the camera reads as a wall in front of
      // it and costs four blocks of distance for nothing.
      if (hit && hit.point.y > farY - CAM_PROBE) dist = Math.max(CAM_MIN, hit.distance - 0.4)
      let camY = farY
      for (let n = 0; n < 9; n++) {
        const cx = camTarget.x + back.x * dist
        const cz = camTarget.z + back.z * dist
        camY = overFloor(world, cx, camTarget.y + back.y * dist, cz, camTarget.y)
        // Never squeeze past the point where the figure is drawn. Below this
        // the avatar gets hidden AND the camera is inside a block, so the
        // frame contains neither the player nor the course — which is worse
        // than a camera that clips a corner.
        if (!pointBlocked(world, cx, camY, cz, CAM_PROBE) || dist <= CAM_MIN) break
        dist = Math.max(CAM_MIN, dist - CAM_DIST / 8)
      }
      camWant.copy(camTarget).addScaledVector(back, dist)
      camWant.y = camY
      camera.position.lerp(camWant, approach(dt, 18))
      camera.lookAt(camTarget)
      // squeezed against a wall the camera ends up inside the figure, and a
      // torso filling the frame hides the very jump you are lining up
      /* …and fade, properly. This used to compare the distance against
         `CAM_MIN * 0.7`, which is below the floor the walk-in loop clamps to —
         so it was always true, the figure was never hidden, and squeezing
         against a wall (which is what happens every time you fall past a
         ledge) filled the frame with a black torso and no course at all. */
      avatar.setOpacity(clamp((camera.position.distanceTo(camTarget) - 1.1) / 1.5))
    }

    /* sprinting opens the lens, which is the oldest speed cue there is — and
       crouching closes it a little past neutral, the same move in reverse */
    const wantFov = body.sprinting ? FOV_SPRINT : FOV - FOV_SNEAK_CLOSE * crouchEase
    fov += (wantFov - fov) * approach(dt, 6)
    applyFov()

    // the platforms interpolate too, or your feet slide on a deck that is
    // stepping at 20 Hz under a body that is gliding at 144
    view.syncMovers(world.movers, k)
    // the lantern hangs off the figure's right hand at about hip height, and
    // it is what lights the course — so it goes down with the hand when the
    // figure folds, and the pool of light on the deck closes in with it
    lanternAt.set(px, py + 1.0 - 0.34 * crouchEase, pz)
    view.update(dt, lanternAt)
  }

  /* ---------------- entering and leaving ---------------- */

  function enter(i = 0): void {
    if (active) return
    active = true
    progress = loadProgress()
    fade = 1
    fadeTo = 0
    hud.show()
    hud.setTouch(controls.touch)
    hud.setLockPrompt(false)
    start(i)
  }

  function leave(): void {
    if (!active) return
    active = false
    paused = true
    controls.releaseLock()
    controls.setEnabled(false)
    hud.hidePanel()
    hud.hide()
    view?.dispose()
    view = null
    world = null
    for (const cb of leaveCbs.slice()) cb()
  }

  controls.onRelease(() => {
    if (!active) return
    // Escape hands the pointer back; the game holds still and asks for it
    // again rather than carrying on with a camera nobody is steering
    if (!finished) {
      paused = true
      hud.setLockPrompt(true)
    }
  })
  /* R wipes a run, and your hand is already on WASD. It takes two presses
     within a second and a half, with the HUD saying so in between — the same
     amount of friction as a confirm dialog and none of the interruption. */
  let armedRestart = 0
  controls.onRestart(() => {
    if (!active || finished) return
    const t = performance.now()
    if (t - armedRestart < 1500) {
      armedRestart = 0
      start(index)
      return
    }
    armedRestart = t
    hud.toast('Press R again to restart')
  })
  controls.onView(() => {
    if (!active) return
    /* back → first → front, so one press reaches the most readable camera in
       the game. Vanilla's order starts at first person; starting behind the
       figure is deliberate here (half the reason the minigame exists is that
       you can see it), but burying first person two presses deep was not. */
    camView = camView === VIEW_BACK ? VIEW_FIRST : camView === VIEW_FIRST ? VIEW_FRONT : VIEW_BACK
    hud.crosshair(camView === VIEW_FIRST)
  })
  hud.onLockRequest(() => {
    hud.setLockPrompt(false)
    paused = false
    // give the browser a moment to answer before the guard above decides it
    // has not — and if it never does, `lockAsks` runs out and the game plays
    // on with drag-to-look instead of nagging forever
    lockGrace = 1.2
    if (!controls.touch) controls.requestLock()
  })
  hud.onExit(() => leave())
  hud.onRestart(() => {
    if (active) start(index)
  })

  // on touch there is no lock to take, so play starts as soon as it loads
  if (controls.touch) paused = false

  return {
    get active() {
      return active
    },
    get cleared() {
      return progress.cleared.length
    },
    enter,
    leave,
    update,
    render(renderer) {
      if (view) renderer.render(view.scene, camera)
    },
    resize(w, h) {
      camAspect = Math.max(1, w) / Math.max(1, h)
      camera.aspect = camAspect
      applyFov()
      // …and unconditionally, because `applyFov` bails when the angle has not
      // moved enough to be worth a matrix rebuild — and the aspect just did
      camera.updateProjectionMatrix()
    },
    onLeave(cb) {
      leaveCbs.push(cb)
    },
    dispose() {
      controls.dispose()
      hud.dispose()
      avatar.dispose()
      view?.dispose()
    },
  }
}

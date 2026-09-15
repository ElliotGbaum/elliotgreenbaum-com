/**
 * The projector — the destination, and the whole reason the concept works.
 *
 * A projector without light is furniture. It sits dark in the middle of the
 * field — the HUD compass and the floor rings say where it is; walk over
 * with your lantern, switch it on, and it throws the film at the screen.
 *
 * THE FILM PLAYS HERE, ON THE SCREEN, and you watch it from out in the field
 * with the projector and the sky still in frame. That is a deliberate reversal
 * of how this used to work — the camera used to push in and hand over to a
 * full-screen DOM layer — and it costs something: text thirty units away is
 * text thirty units away. Three things pay that back, and if you change any of
 * them, check the film is still readable at 375px before you ship:
 *
 *   1. `watchVantage()` below frames the shot on a long lens from far back,
 *      which is what lets the screen be large in frame while the figure in
 *      the foreground stays a figure and not a wall.
 *   2. The picture texture is 1280 across (see src/film/film.ts) — sized so
 *      body copy survives the mapping.
 *   3. The screen material opts out of fog. At this distance the fog would
 *      eat half the contrast, and a lit screen punching through haze is more
 *      believable than a hazy one anyway.
 *
 * The words also exist as subtitles in the DOM, under the controls, which is
 * the path that actually works on a phone.
 *
 * IT ALSO HAS TO ASK. There is exactly one thing to do in this world and it
 * is done to this object, so the machine carries its own call to action —
 * rings pinging out across the ground under it, built further down under
 * "the invitation". Everything else here is atmosphere; that part is the
 * interface.
 */

import * as THREE from 'three'
import {
  PALETTE,
  PHONE,
  clamp,
  easeOut,
  type Landmark,
  type LandmarkContext,
} from '../../core/contract'

const SCREEN_Z = -30
const SCREEN_W = 30
/** Height of the screen's centre. Raised from 11 when the film moved onto it:
 *  you now watch from behind the projector, and at 11 the machine's silhouette
 *  sat squarely in the bottom third of the picture. */
const SCREEN_Y = 13
const PROJ_Z = 4

/** a cylinder's own axis — what the reels spin about */
const SPIN = new THREE.Vector3(0, 1, 0)

/* ---------------- the invitation ----------------
 * A dark machine in a big empty field is furniture until somebody tells you
 * it is a switch. This is that: a pair of rings pinging outward across the
 * ground under it, answering *where do I go* without a tutorial, a modal or a
 * line of onboarding copy.
 *
 * There used to be a plaque hanging over it as well, reading SWITCH IT ON and
 * then WATCH IT AGAIN. It is gone on purpose. Floating type in world space is
 * the loudest thing in a frame this dark — it sat over the screen, said what
 * the HUD prompt already says on approach, and turned the one object in the
 * field into a billboard. The rings point at the machine without shouting.
 *
 * They retire the instant the lamp strikes: the invitation has done its job.
 */

/** where the camera sits to watch, what it aims at, and on what lens */
export interface Vantage {
  position: THREE.Vector3
  lookAt: THREE.Vector3
  fov: number
}

export interface Projector extends Landmark {
  /** stand here to reach the switch */
  readonly pressSpot: THREE.Vector3
  /** …and reach for this */
  readonly pressPoint: THREE.Vector3
  /**
   * The OUTER TOP-RIGHT CORNER OF THE SCREEN FRAME, and the one thing that
   * hangs off it is the TLDR VERSION button — main.ts projects
   * this point through the camera every frame of the film so the button stays
   * pinned there as the shot breathes, and the chrome hangs the button up and
   * to the left of it (see `place` in src/film/controls.ts).
   *
   * IT USED TO BE THE TOP OF THE MACHINE, and that was wrong in a way that was
   * only obvious once the card behind it grew. The projector stands a long way
   * in FRONT of the screen, so a point above it projects into the middle of
   * the picture however mean you are with the height — the button ended up
   * sitting on top of whatever the act was drawing, which is the one place a
   * control offering to skip the film must never be. The corner of the screen
   * is the opposite: it is off the picture by construction, it is where a
   * viewer already looks for the controls of a thing they are watching, and it
   * moves with the screen rather than with the machine.
   *
   * The numbers are the frame's own: the top bar sits at the screen's top edge
   * and is 0.8 deep, the side bars are 0.8 wide, and the top bar overhangs
   * them by the same, so this is the outside corner of the woodwork and not a
   * guess at it.
   */
  readonly screenCorner: THREE.Vector3
  /** stand here to watch, once it's running */
  readonly watchSpot: THREE.Vector3
  /** the third-person shot, framed for this viewport shape */
  watchVantage(aspect: number): Vantage
  /**
   * How wide the picture actually lands, in device pixels, on a viewport of
   * this shape and this many device pixels tall — which is how many texels
   * the film is worth painting.
   *
   * It is the projector's answer to give because the projector owns both
   * halves of it: the size of the screen and the shot it is watched from.
   * src/film/film.ts sizes its buffer from this.
   */
  pictureTexels(aspect: number, viewportDevicePxHigh: number): number
  /** 0 → dormant, 1 → beam fully on the screen */
  setFiring(on: boolean): void
  /** 0 = night, 1 = daylight. */
  setDaylight(k: number): void
  /** the picture canvas changed; push it to the GPU */
  refreshScreen(): void
  /**
   * The picture canvas changed SIZE. That is a different job from a refresh:
   * the texture on the card is the old shape and re-uploading into it is at
   * best wasted and at worst a driver error, so the old one is thrown away
   * and the next frame allocates a new one.
   */
  resizeScreen(): void
  /**
   * Where a ray lands on the picture, in picture coordinates: 0…1 across and
   * 0…1 DOWN, matching the film canvas rather than the plane's own UVs. Null
   * if the ray misses the screen. This is how the card's links are clicked —
   * see src/film/acts/act6.ts.
   */
  hitScreen(ray: THREE.Raycaster): { u: number; v: number } | null
}

/**
 * @param picture the film's canvas. Its aspect sets the screen's shape, so the
 *   picture lands edge to edge with no letterboxing of its own.
 */
export function createProjector(picture: HTMLCanvasElement): Projector {
  const group = new THREE.Group()

  const SCREEN_H = SCREEN_W / (picture.width / picture.height)

  /* Two colours for everything solid, and `daylight` crosses between them in
     update(). The night values are the ones that were always here: a dark
     machine and a darker screen, chosen so they read as silhouettes against
     a field that is darker still, with the lantern and the pilot lamp doing
     the modelling. By day the same values are three black slabs in a sunlit
     meadow. The housing went blackest of all, and for a reason worth
     keeping: a metallic surface has no diffuse colour, only reflections, and
     there is no environment map here, so the sun is the only thing it can
     reflect. The day look is painted machinery — most of the metalness goes
     with the dark — a charcoal frame and stand, and a canvas screen. The
     grey housing sits a step lighter than the grass and the trim a step
     darker, which is the least it takes to keep the machine from dissolving
     into the field at thirty units. */
  const METAL_NIGHT = new THREE.Color(0x3d4a4a)
  const METAL_DAY = new THREE.Color(0xb4afa3)
  const DARK_NIGHT = new THREE.Color(0x1a2426)
  const DARK_DAY = new THREE.Color(0x3a3733)
  const SCREEN_NIGHT = new THREE.Color(0x121b1d)
  const SCREEN_DAY = new THREE.Color(0xe4dfd1)

  const metal = new THREE.MeshStandardMaterial({
    color: METAL_NIGHT,
    roughness: 0.55,
    metalness: 0.65,
  })
  const dark = new THREE.MeshStandardMaterial({
    color: DARK_NIGHT,
    roughness: 0.9,
    metalness: 0.1,
  })

  /* ---------------- the screen ---------------- */
  const frameT = new THREE.Mesh(new THREE.BoxGeometry(SCREEN_W + 1.6, 0.8, 0.8), dark)
  frameT.position.set(0, SCREEN_Y + SCREEN_H / 2, SCREEN_Z)
  const frameB = frameT.clone()
  frameB.position.y = SCREEN_Y - SCREEN_H / 2
  const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.8, SCREEN_H + 1.6, 0.8), dark)
  frameL.position.set(-SCREEN_W / 2, SCREEN_Y, SCREEN_Z)
  const frameR = frameL.clone()
  frameR.position.x = SCREEN_W / 2
  group.add(frameT, frameB, frameL, frameR)

  for (const x of [-SCREEN_W / 2 + 1, SCREEN_W / 2 - 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.7, SCREEN_Y - SCREEN_H / 2, 0.7), dark)
    leg.position.set(x, (SCREEN_Y - SCREEN_H / 2) / 2, SCREEN_Z)
    group.add(leg)
  }

  // the film itself. LinearFilter with no mipmaps: the texture is re-uploaded
  // 30 times a second and regenerating a mip chain each time costs more than
  // the shimmer it saves — and the buffer is now sized for the screen it
  // lands on (see pictureTexels below), so 1:1 is the case being filtered.
  const screenTex = new THREE.CanvasTexture(picture)
  screenTex.colorSpace = THREE.SRGBColorSpace
  screenTex.minFilter = THREE.LinearFilter
  screenTex.magFilter = THREE.LinearFilter
  screenTex.generateMipmaps = false
  screenTex.anisotropy = 4

  const screenMat = new THREE.MeshBasicMaterial({
    map: screenTex,
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    fog: false,
    toneMapped: false,
  })
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), screenMat)
  screen.position.set(0, SCREEN_Y, SCREEN_Z + 0.05)
  group.add(screen)

  // the dark screen surface, so it reads as an object when unlit
  const backMat = new THREE.MeshStandardMaterial({ color: SCREEN_NIGHT, roughness: 1 })
  const back = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), backMat)
  back.position.set(0, SCREEN_Y, SCREEN_Z)
  group.add(back)

  /* ---------------- the projector itself ---------------- */
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 4.2), metal)
  body.position.set(0, 2.6, PROJ_Z)
  group.add(body)

  const lensHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.78, 1.5, 18),
    metal,
  )
  lensHousing.rotation.x = Math.PI / 2
  lensHousing.position.set(0, 2.6, PROJ_Z - 2.6)
  group.add(lensHousing)

  const lensMat = new THREE.MeshBasicMaterial({ color: 0x2a1f10, toneMapped: false })
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.58, 20), lensMat)
  lens.position.set(0, 2.6, PROJ_Z - 3.36)
  lens.rotation.y = Math.PI
  group.add(lens)

  // Reels, because a projector without reels doesn't read as a projector —
  // and turned to face back down the throw, because that is where you now
  // stand to watch. Edge-on (which is how a real projector carries them) they
  // resolve into a single thin post rising out of the housing, and the eye
  // reads that as a mast, not as a machine doing something.
  //
  // TWO EQUAL DISCS SIDE BY SIDE ON TOP OF A ROUNDED BODY IS A CARTOON MOUSE.
  // That is not a joke about the silhouette, it is what it was: same radius,
  // same height, symmetric about the body, and in a dark shot where all you
  // get is the outline the head reads before the machine does. Real projectors
  // aren't symmetric anyway — feed reel high and back, take-up reel low and
  // forward, different sizes, each on its own arm — so the fix and the truth
  // are the same shape. Keep them unequal and off-axis if you touch this.
  const reels: THREE.Mesh[] = []
  const REELS: Array<[number, number, number, number]> = [
    // x, y, z, radius
    [-0.6, 4.15, PROJ_Z + 1.2, 0.62],
    [0.95, 3.3, PROJ_Z - 0.1, 0.44],
  ]
  for (const [x, y, z, r] of REELS) {
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.14, 22), metal)
    reel.rotation.x = Math.PI / 2
    // a few degrees off square, so the two never line up into one shape
    reel.rotation.z = 0.12
    reel.position.set(x, y, z)
    group.add(reel)
    reels.push(reel)

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.22, 10), dark)
    hub.rotation.x = Math.PI / 2
    hub.position.set(x, y, z + 0.1)
    group.add(hub)

    // the arm it hangs off — the thing that makes it machinery rather than
    // a disc floating above a box
    const armLen = Math.hypot(x - 0.1, y - 2.9)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, armLen, 0.22), dark)
    arm.position.set((x + 0.1) / 2, (y + 2.9) / 2, z)
    arm.rotation.z = Math.atan2(x - 0.1, y - 2.9) * -1
    group.add(arm)
  }

  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 1.7, 12), dark)
  stand.position.set(0, 0.85, PROJ_Z)
  group.add(stand)
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.22, 20), dark)
  foot.position.set(0, 0.11, PROJ_Z)
  group.add(foot)

  // The switch. It exists so that "turn it on" is a thing you can see happen
  // to a specific object rather than an event that occurs near the projector.
  const switchMat = new THREE.MeshStandardMaterial({
    color: 0x8a3f26,
    roughness: 0.5,
    metalness: 0.3,
    emissive: 0x000000,
  })
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 12), switchMat)
  knob.rotation.z = Math.PI / 2
  knob.position.set(1.32, 3.1, PROJ_Z + 0.6)
  group.add(knob)

  /* NO THROW BEAM — deliberately, and it is not coming back.
   *
   * There used to be a cone of amber light from the lens to the screen. It
   * belonged to the version where you watched the film in a DOM takeover and
   * the beam was scenery you saw for a second and a half on the way in. Now
   * that the film plays on the screen and you sit behind the machine for
   * the length of the film, the beam is between the camera and the picture, and
   * *anything* between the camera and the picture is painted over the picture.
   * It washed a bright wedge across the middle of every act.
   *
   * There is no version of this that works. A beam that fades before the
   * screen is closer to the camera, so it projects *larger*; a dimmer one is
   * a fainter wedge, not no wedge. The geometry is the problem.
   *
   * The machine still reads as running without it: the screen is lit, the
   * reels turn, the switch glows, and `bounce` below throws the screen's
   * light back across the field and onto whoever is standing in it.
   */

  // The pilot lamp. There used to be a seventy-unit amber column above the
  // machine so it could be found from anywhere; it was a smear on the sky and
  // it went. Without it a dormant machine thirty units away at night was a
  // black box on a black field — the compass named it
  // and the rings circled it, but nothing said "lamp" until you were close
  // enough for the lantern to catch it. This is a small warm light that lives
  // on the housing while it waits: enough to model the box, warm the reels
  // and lay a faint pool at its foot, in the lantern's own language, so it
  // reads as a machine with a lamp in it from wherever you spawn. It hands
  // off to the screen's bounce the moment the lamp strikes, and daylight
  // retires it along with everything else that only makes sense in the dark.
  const pilot = new THREE.PointLight(0xffc98a, 0, 18, 1.7)
  pilot.position.set(0, 3.6, PROJ_Z - 0.4)
  group.add(pilot)

  // light thrown back into the field from the screen
  const bounce = new THREE.PointLight(0xffe6bd, 0, 62, 2)
  bounce.position.set(0, SCREEN_Y, SCREEN_Z + 6)
  group.add(bounce)

  /* ---------------- the invitation ---------------- */

  // Rings pinging out across the ground. Normal blending rather than additive:
  // additive amber is beautiful at night and completely invisible over sunlit
  // grass, and this is the one cue that has to work at both times of day.
  const ringGeo = new THREE.RingGeometry(0.93, 1, 56)
  const rings = [0, 1].map(() => {
    const mat = new THREE.MeshBasicMaterial({
      color: PALETTE.amber,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(ringGeo, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(0, 0.07, PROJ_Z)
    group.add(mesh)
    return { mesh, mat }
  })
  const RING_MIN = 2.2
  const RING_MAX = 8.5

  /* ---------------- what a click on "the projector" means ----------------
     Every solid part of it: the machine, its stand, the screen and the frame
     the screen hangs in. Pointing at any of them is pointing at the thing.

     NOT the rings, which is the whole reason this is a published list rather
     than `group` itself. They are painted flat on the ground, where a click
     already means the one thing it should mean out here: walk there. They are
     the invitation to walk over, so they must not swallow the walk. */
  const hitTargets = group.children.filter(
    (o) =>
      (o as THREE.Mesh).isMesh && !rings.some((r) => r.mesh === (o as THREE.Mesh)),
  )

  /* ---------------- behaviour ---------------- */
  let firing = 0
  let firingTarget = 0
  let daylight = 0

  const anchor = new THREE.Vector3(0, 0, PROJ_Z + 12)
  const screenCentre = new THREE.Vector3(0, SCREEN_Y, SCREEN_Z)

  /* ---------------- the third-person shot ----------------
     Two rigs, blended by how portrait the viewport is, then widened if it
     has to be to keep the screen inside the frame.

     THIS IS THE SHOT ON ANYTHING WITH A WINDOW. A phone takes the measured
     one below it instead — same field, same figure, no composed lens — and
     `watchVantage` is the one-line switch between them.

     Landscape is a long lens from a long way back. That is the entire trick:
     a 22° lens at fifty units compresses the figure, the projector and the
     screen into one plane, so all three read at once — which is what "you are
     still standing in the field watching it" has to mean visually. Move the
     camera closer and widen the lens to compensate and the figure becomes a
     foreground obstruction.

     Portrait cannot have that. A 30-unit screen in a frame twice as tall as
     it is wide has to be far away to fit, so the shot opens up and the film
     gets smaller — which is why the subtitles in the DOM are not optional. */
  const LAND = {
    position: new THREE.Vector3(3.5, 3.0, 50),
    lookAt: new THREE.Vector3(0, 11.2, SCREEN_Z),
    fov: 22,
  }
  const PORT = {
    position: new THREE.Vector3(1.5, 3.0, 50),
    lookAt: new THREE.Vector3(0, 9.5, SCREEN_Z),
    fov: 47,
  }

  function deskVantage(aspect: number): Vantage {
    const k = clamp((1.0 - aspect) / 0.55)
    const position = LAND.position.clone().lerp(PORT.position, k)
    const lookAt = LAND.lookAt.clone().lerp(PORT.lookAt, k)

    const dist = position.distanceTo(screenCentre)
    // widen until the screen fits, with a margin — a cropped film is worse
    // than a small one, and at some aspect ratios the blend alone won't do it
    const half = (m: number) => (2 * Math.atan(m / dist) * 180) / Math.PI
    const needW = half((SCREEN_W / 2) * 1.07 / Math.max(0.2, aspect))
    const needH = half((SCREEN_H / 2) * 1.09)

    return {
      position,
      lookAt,
      fov: Math.max(LAND.fov + (PORT.fov - LAND.fov) * k, needW, needH),
    }
  }

  /* ---------------- and the same shot on a phone ----------------
   * THE LENS IS NOT COMPOSED, IT IS MEASURED. The two rigs above start from a
   * focal length somebody chose and open up only if the screen would not fit;
   * this one starts from what has to be in the frame — the top of the screen
   * and the ground the figure is standing on — and takes the tightest frame
   * that holds both, plus a tenth for air.
   *
   * The difference is what the composed lens was spending on nothing. At 22°
   * a landscape phone put the top of the screen 7.2° above the axis and the
   * figure's feet 9.6° below it, in a frame whose half is 11° — four degrees
   * of spare sky at one end, one and a half of spare ground at the other, and
   * an axis aimed at neither. Aim at the middle of the pair and the same two
   * things fit in 18.8°, which is a sixth off the frame and a sixth onto every
   * word on the screen.
   *
   * NOTHING IS CROPPED TO PAY FOR IT. The figure keeps its feet, the machine
   * keeps its stand, the screen keeps its frame — the same three things are in
   * shot, with the dead sky over them and the dead ground under them gone.
   *
   * In portrait it is the WIDTH that binds, and it binds almost immediately:
   * the screen is ninety per cent of a phone held upright whatever you do, so
   * the margin below is the whole of what is available and the film's own type
   * carries the rest (see PHONE_TYPE in src/film/timeline.ts).
   */
  const PHONE_POS = new THREE.Vector3(2.0, 3.0, 50)
  /** the top of the screen's frame — the highest thing that has to be in shot */
  const KEEP_TOP = new THREE.Vector3(0, SCREEN_Y + SCREEN_H / 2 + 0.9, SCREEN_Z)
  /** …and the lowest: the ground the figure stands on to watch */
  const KEEP_FOOT = new THREE.Vector3(-6, 0, PROJ_Z + 1)
  /** how much of the frame is air rather than either of those */
  const PHONE_AIR = 1.1
  /**
   * …and how much over the screen's own width the frame keeps.
   *
   * It is 1.06 because the screen's FRAME is 1.053 times the picture — the bar
   * across the top runs SCREEN_W + 1.6 — and at anything tighter a phone held
   * upright, where this is the constraint that binds, ran the picture out to
   * both edges of the glass and cut the posts off it. Four per cent of the
   * type buys the object back: it is a screen standing in a field, and a
   * screen with its edges outside the frame is just a wall with a film on it.
   */
  const PHONE_FILL = 1.06

  function phoneVantage(aspect: number): Vantage {
    const p = PHONE_POS
    /** how high a world point sits from the shot, as an angle off the level */
    const pitch = (v: THREE.Vector3) =>
      Math.atan2(v.y - p.y, Math.hypot(v.x - p.x, v.z - p.z))
    const hi = pitch(KEEP_TOP)
    const lo = pitch(KEEP_FOOT)

    /* Aimed at the middle of the pair, which is the whole trick: a frame is
       symmetric about its axis, so it is only ever as small as twice the
       further of the two things it has to hold. */
    const run = Math.hypot(p.x, p.z - SCREEN_Z)
    const lookAt = new THREE.Vector3(0, p.y + Math.tan((hi + lo) / 2) * run, SCREEN_Z)

    const deg = (r: number) => (r * 180) / Math.PI
    const forContent = deg(hi - lo) * PHONE_AIR

    // …and the width, as the vertical angle a frame this shape would need to
    // show the screen edge to edge: tan(h/2) = aspect · tan(v/2)
    const dist = p.distanceTo(screenCentre)
    const halfW = Math.atan(((SCREEN_W / 2) * PHONE_FILL) / dist)
    const forWidth = deg(2 * Math.atan(Math.tan(halfW) / Math.max(0.2, aspect)))

    return { position: p.clone(), lookAt, fov: Math.max(forContent, forWidth) }
  }

  function watchVantage(aspect: number): Vantage {
    return PHONE ? phoneVantage(aspect) : deskVantage(aspect)
  }

  /**
   * The same shot, measured rather than framed: how many device pixels wide
   * the thirty-unit screen comes out at.
   *
   * Straight perspective — the visible world height at the screen's distance
   * is `2·d·tan(fov/2)`, the screen takes `SCREEN_H` of it, and the viewport
   * is `deviceHigh` pixels for the whole of it. The shot is square enough to
   * the screen that the tilt is not worth a term; measured against real
   * frames this lands within half a percent.
   */
  function pictureTexels(aspect: number, deviceHigh: number): number {
    const v = watchVantage(aspect)
    const dist = v.position.distanceTo(screenCentre)
    const visibleH = 2 * dist * Math.tan((v.fov * Math.PI) / 360)
    if (!(visibleH > 0) || !(deviceHigh > 0)) return 0
    return (SCREEN_W / visibleH) * deviceHigh
  }

  return {
    id: 'projector',
    title: 'The projector',
    object: group,
    anchor,
    // Wide, because this is the only interactive thing in the field and the
    // cost of arming it a beat early is nothing. It was 17, which put the
    // switch in reach about four strides short of the machine; 21 lets the
    // walk from the spawn end that much sooner, and the figure still covers
    // the rest itself once E is pressed (see `startFilm` in main.ts).
    radius: 21,
    /**
     * THE SAME SENTENCE AT EVERY DISTANCE, and that is the point. This used to
     * read "Switch on the projector — it plays the film" while the standing
     * line at the bottom of the screen said "Walk to the projector and switch
     * it on to play the film", so the instruction rewrote itself under you as
     * you walked. Two phrasings of one idea is not extra information, it is a
     * flicker: the eye goes back to re-read a line it had already finished.
     * main.ts takes its standing line from this string (`LEAD`), so the two
     * cannot drift apart again — edit it here and it changes in both places.
     */
    prompt: 'Walk to the projector and switch it on to play the film',
    again: 'Switch it on again to replay the film',
    /**
     * …and up at the machine itself, once you are within arm's reach of it,
     * the badge every game puts on an interactable: PRESS [E] TO TURN ON on a
     * keyboard, TAP TO TURN ON on a phone — same words after the gesture, and
     * the gesture is the only part that knows what device it is on.
     * It is not a third phrasing of the sentence above
     * — that one says what the projector is for, from across a field, and this
     * one names the mechanical action while you are standing at the knob it
     * happens to. Different job, different register, and it is small and mono
     * and grey precisely so the two are never read as one instruction.
     *
     * `reach` stands in the knob's own column — same x and z as the switch, so
     * the badge is over the thing it names rather than over "the projector"
     * generally, which you already knew the position of. Its height is the
     * one part that is not the switch: the badge hangs *above* the point it is
     * given, and at the knob's own 3.1 it would be pinned across the reels.
     * 5.5 clears the tallest of them (4.15 + its 0.62 radius) with room for
     * the gap, so the label sits in clean sky and still points down the
     * switch's column. Move the reels and this moves with them.
     */
    verb: 'turn on',
    verbAgain: 'play it again',
    reach: new THREE.Vector3(1.32, 5.5, PROJ_Z + 0.6),
    hitTargets,
    /**
     * Standing here is not consent. The film is a two-minute commitment and it
     * takes the camera off you to make it, so it starts when someone asks for
     * it — walk up and press E, or tap the machine — and never merely because
     * they wandered into the radius. See the dwell block in main.ts.
     *
     * A CLICK ON THE MACHINE IS AN ERRAND, NOT A SWITCH, and the distinction is
     * the whole of how the pointer is allowed to work here. Pointing at it from
     * across the field used to start the film outright, which is two minutes of
     * commitment entered from thirty units away by the one gesture that carries
     * no intent — you click to look around, you click to dismiss, you click
     * because the cursor was already there. Now it sends the figure over and the
     * film starts when the figure arrives, which is the same bargain walking
     * there on the keys has always made. See `hitTargets` above and the note over
     * `onPointerDown` in main.ts.
     */
    autoActivate: false,

    // beside the body, within arm's reach of the switch
    pressSpot: new THREE.Vector3(2.6, 0, PROJ_Z + 2.1),
    pressPoint: new THREE.Vector3(1.32, 3.1, PROJ_Z + 0.6),
    screenCorner: new THREE.Vector3(SCREEN_W / 2 + 0.8, SCREEN_Y + SCREEN_H / 2 + 0.4, SCREEN_Z),
    // off to one side and behind the lens, so the figure is in the shot and
    // not in the beam
    watchSpot: new THREE.Vector3(-6, 0, PROJ_Z + 1),
    watchVantage,
    pictureTexels,

    setFiring(on: boolean) {
      firingTarget = on ? 1 : 0
    },

    setDaylight(k: number) {
      daylight = clamp(k)
    },

    refreshScreen() {
      screenTex.needsUpdate = true
    },

    resizeScreen() {
      // dispose drops the GPU texture and its properties; the next frame that
      // wants the screen allocates one the size the canvas is now
      screenTex.dispose()
      screenTex.needsUpdate = true
    },

    hitScreen(ray: THREE.Raycaster) {
      const hit = ray.intersectObject(screen, false)[0]
      if (!hit?.uv) return null
      // the texture is uploaded flipped (three's default), so the plane's v
      // counts up from the bottom while the canvas counts down from the top
      return { u: hit.uv.x, v: 1 - hit.uv.y }
    },

    activate(ctx: LandmarkContext) {
      ctx.playFilm()
    },

    update(dt, elapsed, lit) {
      firing += (firingTarget - firing) * Math.min(1, dt * 2.6)

      const night = 1 - daylight
      const idle = 1 - firing

      // the day colours, see the materials above
      metal.color.lerpColors(METAL_NIGHT, METAL_DAY, daylight)
      metal.metalness = 0.65 - daylight * 0.5
      metal.roughness = 0.55 + daylight * 0.1
      dark.color.lerpColors(DARK_NIGHT, DARK_DAY, daylight)
      backMat.color.lerpColors(SCREEN_NIGHT, SCREEN_DAY, daylight)

      // a projector lamp flicker: two frequencies so it never reads as a sine.
      // This is the *only* flicker in the film now — it used to be a CSS layer
      // over the picture, and there is no picture in the DOM to cover.
      const flick = 1 + Math.sin(elapsed * 27) * 0.03 + Math.sin(elapsed * 8.3) * 0.02
      const f = easeOut(clamp(firing))

      // Opacity strikes the lamp; colour carries the brightness and the
      // flicker. Two separate jobs that were one before, and they have to be
      // separate now: with no beam washing over the picture, the only thing
      // making the screen read as *lit* rather than as a dark board is the
      // picture's own gain. Above 1 is deliberate — the material is
      // toneMapped:false, so this multiplies the texture straight through.
      screenMat.opacity = f
      // A screen has to out-punch whatever is falling on it. The picture is
      // toneMapped:false, so this gain goes straight through. It used to be
      // 1.3 rising to 1.65 by day, when the picture was dusk-blue and needed
      // the lift; since the picture became the cream the screen already is
      // (src/film/palette.ts), anything over 1 clips it to pure white and
      // loses the ink's warmth, so it sits at 1 and the flicker does the rest.
      screenMat.color.setScalar(f * (1 + daylight * 0.04) * flick)
      screen.visible = screenMat.opacity > 0.004
      bounce.intensity = f * 190 * flick * (1 - daylight * 0.72)
      // the pilot lamp and the ember in the lens: on while dormant at night,
      // gone once the picture is the light
      const standing = night * (1 - f)
      pilot.intensity = standing * 30 * (1 + Math.sin(elapsed * 0.85) * 0.08)
      lensMat.color.setRGB(
        0.16 + standing * 0.34 + f * 0.84,
        0.12 + standing * 0.22 + f * 0.75,
        0.06 + standing * 0.08 + f * 0.55,
      )
      switchMat.emissive.setRGB(f * 0.5, f * 0.14, 0.02)

      // The reels turn while it's running — nothing else in the shot says
      // "this machine is doing something". rotateOnAxis, not rotation.y: the
      // reels are already tipped on their side, and adding to an Euler
      // component after that spins them about the wrong axis.
      for (const r of reels) r.rotateOnAxis(SPIN, dt * f * 2.4)

      // as you approach, the housing catches your light before the beam fires
      // — which is only a thing that happens when your light is the light
      // — and a lower, steady warmth of its own at night, so the housing is a
      // warm grey object rather than a hole in the field before you get there
      const warm = clamp(lit * 1.2) * (1 - f) * night
      metal.emissive.setRGB(
        standing * 0.09 + warm * 0.06,
        standing * 0.065 + warm * 0.045,
        standing * 0.03 + warm * 0.02,
      )

      /* the invitation. It has done its job the moment the lamp strikes, so
         `idle` takes it off screen for the length of the film. */
      const invited = idle * idle

      for (let i = 0; i < rings.length; i++) {
        const r = rings[i]!
        // two rings, half a cycle apart, each expanding and fading as it goes
        const phase = (elapsed * 0.42 + i * 0.5) % 1
        const s = RING_MIN + (RING_MAX - RING_MIN) * phase
        r.mesh.scale.setScalar(s)
        // fade in off the floor as well as out at the edge, so a ring never
        // pops into existence at full strength on top of the machine
        const shape = Math.min(1, phase * 6) * (1 - phase) * (1 - phase)
        r.mat.opacity = invited * shape * 0.75
        r.mesh.visible = r.mat.opacity > 0.01
      }
    },
  }
}

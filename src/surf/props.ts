/**
 * The trainyard, as objects — every mesh and every material the runner passes.
 *
 * This is the same world as the field outside and the parkour next door: matte
 * near-black slate and rusted iron, a single fine speckle shared by everything,
 * real lights doing the modelling, and a quiet amber line along the edges
 * because a dark shape against a dark sky is not a shape. Nothing here is a
 * saturated colour, nothing here is a wireframe, and nothing here is pixel art.
 * A stalled carriage at forty units has to read as "there is a train in that
 * lane" in about a fifth of a second, and it has to do it without leaving the
 * dusk.
 *
 * A DELIBERATE COPY, AND WHY. The speckle texture, the standard-material recipe
 * with its low emissive floor, the anti-Tron rim material and the UV-per-unit
 * slab geometry are lifted out of src/parkour/blocks.ts rather than imported
 * from it. House rule 7 says the only module any subsystem may reach across for
 * is src/core/contract.ts, and the rule is worth more than the forty lines it
 * costs: the parkour is free to retune its own surfaces for a voxel course
 * without silently retuning a trainyard, and this file is free to give iron a
 * little metalness without anybody's cobblestone changing. The two are the same
 * recipe today and are allowed to drift tomorrow. If you change one, read the
 * other and decide on purpose.
 *
 * WRONG TURNS, SO THEY ARE NOT RETAKEN.
 *
 *  · Scrolling a sleeper texture along Z. It is one draw call and it is a
 *    treadmill — no parallax, no landmark, and at 26 u/s the repeat beats
 *    against the frame rate. Sleepers are real geometry, jittered ±0.06 u and
 *    yawed ±2°, laid on a 1.40 pitch with a 0.37 ballast speckle underneath, so
 *    there are two beats and neither of them is 18.6 Hz for long.
 *
 *  · Bright rim lines. An un-tone-mapped line drawn over an ACES-compressed
 *    face keeps the same ratio at every distance, so fog cannot save it and the
 *    yard reads as a neon grid floating in black. The rim is fogged AND tone
 *    mapped AND quiet — see rimMaterial, whose comment is the house recipe and
 *    is reproduced whole.
 *
 *  · vertexColors. The parkour bakes ambient occlusion per vertex because it
 *    meshes voxels. Nothing here is a voxel; leaving vertexColors on with no
 *    colour attribute renders everything black, which cost a revision once.
 *
 *  · Art that matches the collider exactly. Every visual box here is
 *    OBST_INSET_X (0.10 u) wider on each side than the box the simulation
 *    tests, a hurdle's art stands 0.06 taller than its collider, and an
 *    overhead beam's art hangs 0.06 lower than its. All three errors are in the
 *    player's favour, which is the only direction an error may point.
 *
 * Everything cached at module level is freed by disposeProps(), which the scene
 * calls on teardown. Nothing in here allocates per frame.
 */

import * as THREE from 'three'
import { PALETTE, rand } from '../core/contract'
import type { EntityKind, PowerKind } from './track'

/* ------------------------------------------------------------------ *
 * Dimensions
 *
 * track.ts owns the authoritative copy of every one of these (§D.2) and the
 * scene may only `import type` from it, so the handful this file needs to cut
 * geometry with are restated here. They are art dimensions in the end — the
 * simulation never reads this file — but if track.ts moves LANE_W or TILE and
 * these do not follow, the sleepers stop lining up with the lanes and you will
 * see it immediately.
 * ------------------------------------------------------------------ */

/** lane centres at −3, 0, +3 */
const LANE_W = 3.0
/** the authoring grid, one sleeper bay */
export const TILE = 4.0
/** visual body width of a carriage. Collider is 2.80/2 − 0.10 = 1.30. */
const CARRIAGE_W = 2.8
const CARRIAGE_L = 16.0
/** half-width of the art for anything that fills a lane */
const HALF_W = CARRIAGE_W / 2
/** a hurdle's art stands this much above its collider */
const INSET_TOP = 0.06
/** standard gauge, near enough. Two rails per lane, 1.435 apart. */
const GAUGE = 1.435
/** sleeper pitch. 1.40 strobes at 18.6 Hz at VMAX on its own — see the header */
const SLEEPER_PITCH = 1.4

/* ------------------------------------------------------------------ *
 * The surfaces
 * ------------------------------------------------------------------ */

export type SurfaceId =
  | 'ballast'
  | 'rail'
  | 'sleeper'
  | 'carriage'
  | 'iron'
  | 'tunnel'
  | 'lamp'

export interface SurfaceSpec {
  readonly color: number
  readonly rim: number
  readonly roughness?: number
  readonly metalness?: number
  readonly emissive?: number
  /** self-light as a fraction of `color`, when `emissive` is not given. See
      `surfaceMaterial` — it is not one number for the whole yard. */
  readonly lift?: number
}

/** the cool rim, for steel and stone. Everything else takes the amber. */
const RIM_COOL = 0x6f93a0

export const SURFACES: Readonly<Record<SurfaceId, SurfaceSpec>> = {
  /* crushed stone. Greyer and a shade greener than the carriages so the bed
     never reads as part of the thing standing on it. */
  ballast: { color: 0x2c3a3c, rim: RIM_COOL, roughness: 1 },
  /* the one thing in the yard with any metalness: a rail is polished by use,
     and a thin cold highlight running away into the fog is the strongest
     perspective cue the whole scene has. */
  rail: { color: 0x5a6a70, rim: 0x9ec0cc, roughness: 0.42, metalness: 0.65 },
  /* creosote timber, nearly black and very matte */
  sleeper: { color: 0x2a2b28, rim: 0xb99f72, roughness: 0.98 },
  /* rolling stock. A touch bluer than the ballast: it is the colour of a thing
     that has been standing out in the dusk all night. */
  carriage: { color: 0x33434a, rim: PALETTE.amber, roughness: 0.9, metalness: 0.1, lift: 0.62 },
  /* gantries, buffer stops, signal boxes — rust, pushed warm but never orange */
  iron: { color: 0x3d3833, rim: PALETTE.amber, roughness: 0.95, metalness: 0.12, lift: 0.68 },
  /* tunnel lining. The darkest surface here and the least rimmed: a tunnel
     mouth should feel like the absence of the yard rather than an object in it. */
  tunnel: { color: 0x1d2529, rim: RIM_COOL, roughness: 1, lift: 0.3 },
  /* anything that is its own light and is not a mote */
  lamp: { color: 0x5a4a2a, rim: PALETTE.amberLit, emissive: 0x7a5316 },
}

/* ------------------------------------------------------------------ *
 * Texture
 *
 * One neutral speckle, shared by everything and tinted by each material's own
 * colour — the same trick the field's ground and the parkour's blocks use, for
 * the same reason: grain for the light to catch, authored once.
 * ------------------------------------------------------------------ */

let speckle: THREE.CanvasTexture | null = null

export function speckleTexture(): THREE.CanvasTexture {
  if (speckle) return speckle
  const S = 128
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const c = cv.getContext('2d')!
  c.fillStyle = '#808080'
  c.fillRect(0, 0, S, S)
  // fine. One turn of this covers half a world unit, so anything much bigger
  // than a pixel or two reads as blotches rather than as grain.
  for (let i = 0; i < 1400; i++) {
    const x = rand(i * 2 + 1) * S
    const y = rand(i * 2 + 7) * S
    const r = 0.4 + rand(i + 31) * 1.1
    const v = 118 + ((rand(i + 97) * 34) | 0)
    c.fillStyle = `rgb(${v},${v},${v})`
    c.beginPath()
    c.arc(x, y, r, 0, Math.PI * 2)
    c.fill()
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  // mipmaps on, and this is not the default you can take for granted: the
  // ballast is seen at a grazing angle out to the fog, and without mips it
  // aliases into a shimmering carpet that is exactly the moiré the sleeper
  // jitter exists to avoid.
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  speckle = tex
  return tex
}

/* ------------------------------------------------------------------ *
 * Materials
 * ------------------------------------------------------------------ */

const surfaceMats = new Map<SurfaceId, THREE.MeshStandardMaterial>()

export function surfaceMaterial(id: SurfaceId): THREE.MeshStandardMaterial {
  const cached = surfaceMats.get(id)
  if (cached) return cached
  const s = SURFACES[id]
  const mat = new THREE.MeshStandardMaterial({
    color: s.color,
    map: speckleTexture(),
    // OFF, deliberately. Nothing here is meshed voxels, there is no baked
    // ambient occlusion attribute, and leaving this on renders black.
    vertexColors: false,
    roughness: s.roughness ?? 0.94,
    metalness: s.metalness ?? 0.04,
    /* A FLOOR OF SELF-LIGHT, AND IT IS NOT ONE NUMBER FOR THE WHOLE YARD.
       Real lights plus ACES put a carriage forty units away at pure black, and
       a lane you cannot see is a lane you cannot choose — the whole difficulty
       curve is derived from being able to read a thing at 48 u.

       WRONG TURN, DO NOT RETAKE: this was a flat 0.2 for every surface, on the
       reasoning that every point of emissive is a point of shading lost and
       that at 0.4 the yard went to card scenery. Both halves of that are true
       and the conclusion was still wrong, because the two surfaces it applies
       to have opposite jobs. Measured off a real frame at 0.2: an iron gantry
       came back #0d0d0b against a #16272e sky. The albedos here are around 4%
       linear, so no sane amount of LIGHT can lift them — 1.7 of extra
       directional moved that gantry by three values. The floor is the only
       lever there is.

       So the bed keeps 0.2 and the things you have to READ get about 0.65. It
       is not the flattening the old comment feared, for a reason worth
       writing down: the yard's modelling is carried almost entirely by the
       ballast, the sleepers and the rails, which are wide, near, well lit and
       still at 0.2. A carriage is a slab with four visible faces; it does not
       have modelling to lose, it has a SILHOUETTE and an EDGE, and both of
       those get sharper the further it climbs off the black.
       Raise the bed to match and the contrast that makes an obstacle an
       obstacle goes with it — the gap between the two numbers is the point,
       not either number on its own. */
    emissive: s.emissive ?? s.color,
    emissiveIntensity: s.emissive ? 1 : (s.lift ?? 0.2),
  })
  surfaceMats.set(id, mat)
  return mat
}

const rims = new Map<number, THREE.LineBasicMaterial>()

export function rimMaterial(colour: number): THREE.LineBasicMaterial {
  const cached = rims.get(colour)
  if (cached) return cached
  const mat = new THREE.LineBasicMaterial({
    color: colour,
    transparent: true,
    /* Fogged AND tone-mapped, like everything else, and quiet.
       Fog alone did not fix the wireframe problem: fog scales the line and the
       face equally, so an un-tone-mapped line over an ACES-compressed face
       keeps the same ratio at every distance and the course still reads as a
       Tron grid over empty black. The rim has to go through the same curve as
       the surface it is drawn on. It is wayfinding, not neon. */
    /* Quiet. The faces carry the shapes and the rim only sharpens their edge —
       the other way round is the wireframe failure: fog scales a line and a
       face equally, so if the line is the brighter of the two up close it is
       still the brighter of the two at distance, and the yard reads as an
       outline drawing over black. */
    opacity: 0.3,
    fog: true,
    toneMapped: true,
    depthWrite: false,
  })
  rims.set(colour, mat)
  return mat
}

const glows = new Map<string, THREE.MeshBasicMaterial>()

export function glowMaterial(colour: number, opacity: number): THREE.MeshBasicMaterial {
  const k = `${colour}:${opacity.toFixed(3)}`
  const cached = glows.get(k)
  if (cached) return cached
  const mat = new THREE.MeshBasicMaterial({
    color: colour,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    // a mote is a point of light, not a lit object: it must not dim with
    // distance the way a surface does, and it must survive the tone curve, or
    // the one thing you are trying to collect is the one thing you cannot see.
    fog: false,
    toneMapped: false,
  })
  glows.set(k, mat)
  return mat
}

/* ------------------------------------------------------------------ *
 * Geometry helpers
 *
 * Every prototype below is one merged, non-indexed BufferGeometry built by
 * appending boxes (and the odd wedge) through `Parts`. One geometry per entity
 * kind means one InstancedMesh per entity kind, which is the whole draw-call
 * budget of the endless track.
 * ------------------------------------------------------------------ */

interface Parts {
  pos: number[]
  nor: number[]
  uv: number[]
}

const parts = (): Parts => ({ pos: [], nor: [], uv: [] })

/** half a turn of speckle per world unit — the same grain as the parkour's */
const UV_PER_UNIT = 0.5

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _v = new THREE.Vector3()
const _n = new THREE.Vector3()

interface BoxOpts {
  /** yaw about Y, radians */
  yaw?: number
  /** roll about Z, radians */
  roll?: number
  /** pitch about X, radians */
  pitch?: number
}

/**
 * Append a box, centred on (x, y, z), into `p`.
 *
 * UVs are scaled by the span of each face so the speckle is the same size on a
 * 16-unit carriage flank as on a 0.2-unit handrail. This is the whole reason a
 * naive BoxGeometry looks wrong: three.js gives every face a 0..1 UV, so
 * stretching the box stretches the grain and the carriage reads as plastic.
 */
function pushBox(p: Parts, w: number, h: number, d: number, x: number, y: number, z: number, o?: BoxOpts): void {
  const geo = new THREE.BoxGeometry(w, h, d)
  const uv = geo.attributes.uv as THREE.BufferAttribute
  // BoxGeometry's face order: +X, −X, +Y, −Y, +Z, −Z
  const span: Array<[number, number]> = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ]
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v
      uv.setXY(i, uv.getX(i) * span[f]![0]! * UV_PER_UNIT, uv.getY(i) * span[f]![1]! * UV_PER_UNIT)
    }
  }
  uv.needsUpdate = true

  _q.setFromEuler(new THREE.Euler(o?.pitch ?? 0, o?.yaw ?? 0, o?.roll ?? 0))
  _m.compose(_v.set(x, y, z), _q, new THREE.Vector3(1, 1, 1))
  geo.applyMatrix4(_m)

  const flat = geo.toNonIndexed()
  const fp = flat.attributes.position as THREE.BufferAttribute
  const fn = flat.attributes.normal as THREE.BufferAttribute
  const fu = flat.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < fp.count; i++) {
    p.pos.push(fp.getX(i), fp.getY(i), fp.getZ(i))
    p.nor.push(fn.getX(i), fn.getY(i), fn.getZ(i))
    p.uv.push(fu.getX(i), fu.getY(i))
  }
  geo.dispose()
  flat.dispose()
}

/** one triangle, normals computed from the winding */
function pushTri(
  p: Parts,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  uvScale: number,
): void {
  _v.subVectors(b, a)
  _n.subVectors(c, a).cross(_v).normalize().negate()
  const tri = [a, b, c]
  for (const v of tri) {
    p.pos.push(v.x, v.y, v.z)
    p.nor.push(_n.x, _n.y, _n.z)
    // planar projection is good enough for a wedge's cheeks: it is speckle,
    // not a decal, and nobody reads its orientation
    p.uv.push(v.x * uvScale, (v.z + v.y) * uvScale)
  }
}

function build(p: Parts): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(p.nor, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2))
  geo.computeBoundingSphere()
  return geo
}

/**
 * A box of w×h×d with the speckle held at a constant scale — the standalone
 * version of the UV loop above, for anything the scene wants to cut itself.
 */
export function slabGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const p = parts()
  pushBox(p, w, h, d, 0, 0, 0)
  return build(p)
}

/* ------------------------------------------------------------------ *
 * The entity prototypes
 *
 * One per EntityKind, at its canonical size, ORIGIN AT THE CENTRE OF ITS
 * FOOTPRINT ON THE GROUND: x centre, y = 0 at the feet, z centre. The scene
 * places an instance by writing exactly that point and nothing else, which is
 * what keeps it from having to know what any of these things are.
 *
 * "The feet" for a pylon is the roof it is bolted to, not the ballast.
 * ------------------------------------------------------------------ */

interface Proto {
  geo: THREE.BufferGeometry
  /** the silhouette the rim is drawn from — the outer shell only. A rim on
      every window mullion is not wayfinding, it is a technical drawing. */
  rim: THREE.BufferGeometry | null
  surface: SurfaceId
}

const protos = new Map<EntityKind, Proto>()
/** geometry the module made and must free, over and above the prototypes */
const owned: Array<{ dispose(): void }> = []

/** the amber the shell of a rake is drawn in, and the cool one for iron */
export function entityRimColour(kind: EntityKind): number {
  return SURFACES[proto(kind).surface].rim
}

/** a rusted lattice: two rails and a run of diagonals. Reads at 40 u, cheap. */
function lattice(p: Parts, x: number, y0: number, y1: number, z: number, t: number): void {
  const h = y1 - y0
  pushBox(p, t, h, t, x, (y0 + y1) / 2, z - t, {})
  pushBox(p, t, h, t, x, (y0 + y1) / 2, z + t, {})
  const bays = Math.max(2, Math.round(h / 0.7))
  const step = h / bays
  const len = Math.sqrt(step * step + (t * 2) * (t * 2)) + t
  for (let i = 0; i < bays; i++) {
    const cy = y0 + step * (i + 0.5)
    pushBox(p, t * 0.7, t * 0.7, len, x, cy, z, {
      pitch: (i % 2 === 0 ? 1 : -1) * Math.atan2(step, t * 2) - Math.PI / 2,
    })
  }
}

/** the flank of a rake: body, skirt, window band, roof ribs */
function rakeBody(p: Parts, rim: Parts, len: number, roof: number): void {
  const w = CARRIAGE_W
  // the shell, which is what the rim is taken from
  pushBox(rim, w, roof, len, 0, roof / 2, 0)
  pushBox(p, w, roof - 0.22, len, 0, (roof - 0.22) / 2 + 0.11, 0)
  // a skirt that is narrower than the body, so the shape is not one extruded
  // brick — at speed the step is what tells you the thing has a bottom
  pushBox(p, w - 0.5, 0.34, len - 0.3, 0, 0.17, 0)
  // roof cap, very slightly proud: this is the surface you land on and it
  // wants a visible lip you can aim at
  pushBox(p, w + 0.06, 0.1, len, 0, roof - 0.05, 0)
  // ribs along the roof, on the sleeper pitch so the roof scrolls under you at
  // the same rate the ground does and the ride reads as motion
  const ribs = Math.max(2, Math.round(len / 2.4))
  for (let i = 0; i < ribs; i++) {
    const z = -len / 2 + (len / ribs) * (i + 0.5)
    pushBox(p, w - 0.2, 0.06, 0.16, 0, roof + 0.01, z)
  }
  // the window band, if the body is tall enough to have one. Recessed, dark,
  // and NOT emissive: a stalled rake at night has nobody in it, and the one
  // thing the yard must not look like is a lit commuter train.
  if (roof >= 2.0) {
    const wy = roof - 0.85
    const bays = Math.max(2, Math.round(len / 2.6))
    for (let i = 0; i < bays; i++) {
      const z = -len / 2 + (len / bays) * (i + 0.5)
      pushBox(p, w + 0.02, 0.62, (len / bays) * 0.6, 0, wy, z)
    }
  }
  // bogies. Two per body, inset from the ends, with a wheel disc each side.
  for (const s of [-1, 1]) {
    const bz = s * (len / 2 - 2.2)
    pushBox(p, w - 0.9, 0.3, 2.6, 0, 0.42, bz)
    for (const t of [-1, 1]) {
      pushBox(p, 0.16, 0.66, 0.66, t * (w / 2 - 0.22), 0.35, bz - 0.8, { roll: 0 })
      pushBox(p, 0.16, 0.66, 0.66, t * (w / 2 - 0.22), 0.35, bz + 0.8, { roll: 0 })
    }
  }
}

function makeProto(kind: EntityKind): Proto {
  const p = parts()
  const r = parts()

  switch (kind) {
    /* ---- the two you jump ---- */
    case 'fence': {
      // a permanent-way fence: two rails between four posts. Low, open, and
      // unmistakably not a thing you can stand on.
      const top = 1.0 + INSET_TOP
      for (const s of [-1, 1]) pushBox(p, 0.14, top, 0.14, s * (HALF_W - 0.08), top / 2, 0)
      pushBox(p, HALF_W * 2, 0.12, 0.1, 0, top - 0.06, 0)
      pushBox(p, HALF_W * 2, 0.1, 0.09, 0, top * 0.52, 0)
      pushBox(r, HALF_W * 2, top, 0.16, 0, top / 2, 0)
      return { geo: build(p), rim: new THREE.EdgesGeometry(build(r), 40), surface: 'iron' }
    }
    case 'stack': {
      // spare sleepers, stacked and slightly out of true. Solid, waist high,
      // and the timber rim tells you at a glance it is the other jump.
      const top = 1.25 + INSET_TOP
      const rows = 5
      for (let i = 0; i < rows; i++) {
        const y = (top / rows) * (i + 0.5)
        const yaw = (rand(i * 7 + 3) - 0.5) * 0.09
        const off = (rand(i * 11 + 5) - 0.5) * 0.14
        pushBox(p, HALF_W * 2 - 0.1, top / rows - 0.04, 1.6, off, y, 0, { yaw })
      }
      pushBox(r, HALF_W * 2, top, 1.8, 0, top / 2, 0)
      return { geo: build(p), rim: new THREE.EdgesGeometry(build(r), 40), surface: 'sleeper' }
    }

    /* ---- the two you roll under ---- */
    case 'arch': {
      // a signal head slung across the lane. The header is the collider,
      // 1.10 → 3.20, and it hangs 0.06 lower than the collider does.
      const y0 = 1.1 - INSET_TOP
      const y1 = 3.2
      pushBox(p, HALF_W * 2, y1 - y0, 1.5, 0, (y0 + y1) / 2, 0)
      for (const s of [-1, 1]) pushBox(p, 0.14, y1, 0.14, s * (HALF_W - 0.07), y1 / 2, 0)
      // the lamp glass, dark: unlit, because the yard is closed
      pushBox(p, 0.3, 0.3, 0.06, 0, (y0 + y1) / 2, 0.78)
      pushBox(r, HALF_W * 2, y1 - y0, 1.6, 0, (y0 + y1) / 2, 0)
      return { geo: build(p), rim: new THREE.EdgesGeometry(build(r), 40), surface: 'iron' }
    }
    case 'gantry': {
      // the real thing: a lattice leg each side and a deep box girder over the
      // lane, 1.10 → 4.00. Taller and heavier than the arch on purpose — the
      // response is the same roll, and two obstacles that ask the same thing
      // should look related without looking identical.
      const y0 = 1.1 - INSET_TOP
      const y1 = 4.0
      pushBox(p, HALF_W * 2, 0.5, 1.9, 0, y1 - 0.25, 0)
      pushBox(p, HALF_W * 2 - 0.3, y1 - 0.5 - y0, 1.2, 0, (y0 + y1 - 0.5) / 2, 0)
      for (const s of [-1, 1]) lattice(p, s * (HALF_W - 0.16), 0, y1, 0, 0.12)
      pushBox(r, HALF_W * 2, y1 - y0, 2.0, 0, (y0 + y1) / 2, 0)
      return { geo: build(p), rim: new THREE.EdgesGeometry(build(r), 40), surface: 'iron' }
    }

    /* ---- the ones you go round ---- */
    case 'box': {
      // a signal box on the bed: full height, lethal, and the only obstacle
      // with a lit window in it. That one warm rectangle is what makes "this
      // one you cannot jump" legible at 48 u without a colour that is not in
      // the palette.
      const h = 3.6 + INSET_TOP
      pushBox(p, HALF_W * 2, h - 0.5, 2.3, 0, (h - 0.5) / 2, 0)
      pushBox(p, HALF_W * 2 + 0.24, 0.24, 2.6, 0, h - 0.62, 0)
      pushBox(p, HALF_W * 2 - 0.2, 0.4, 2.4, 0, h - 0.2, 0, { pitch: 0 })
      pushBox(r, HALF_W * 2, h, 2.4, 0, h / 2, 0)
      return { geo: build(p), rim: new THREE.EdgesGeometry(build(r), 40), surface: 'iron' }
    }

    /* ---- the rakes ---- */
    case 'flatbed': {
      // a low wagon: a deck at 1.60 with stakes down the sides. The stakes are
      // inside the roof line, so the thing you land on is unambiguous.
      const roof = 1.6
      pushBox(r, CARRIAGE_W, roof, CARRIAGE_L, 0, roof / 2, 0)
      pushBox(p, CARRIAGE_W, 0.5, CARRIAGE_L, 0, roof - 0.25, 0)
      pushBox(p, CARRIAGE_W - 0.4, 0.5, CARRIAGE_L - 0.4, 0, roof - 0.8, 0)
      for (const s of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          const z = -CARRIAGE_L / 2 + (CARRIAGE_L / 5) * (i + 0.5)
          pushBox(p, 0.16, 0.55, 0.16, s * (CARRIAGE_W / 2 - 0.1), roof + 0.27, z)
        }
      }
      for (const s of [-1, 1]) {
        const bz = s * (CARRIAGE_L / 2 - 2.2)
        pushBox(p, CARRIAGE_W - 0.9, 0.3, 2.6, 0, 0.42, bz)
        for (const t of [-1, 1]) {
          pushBox(p, 0.16, 0.66, 0.66, t * (CARRIAGE_W / 2 - 0.22), 0.35, bz - 0.8)
          pushBox(p, 0.16, 0.66, 0.66, t * (CARRIAGE_W / 2 - 0.22), 0.35, bz + 0.8)
        }
      }
      return { geo: build(p), rim: new THREE.EdgesGeometry(build(r), 40), surface: 'carriage' }
    }
    case 'carriage': {
      rakeBody(p, r, CARRIAGE_L, 2.2)
      return { geo: build(p), rim: new THREE.EdgesGeometry(build(r), 40), surface: 'carriage' }
    }
    case 'coach': {
      rakeBody(p, r, CARRIAGE_L, 3.4)
      // and a roof vent run, so a coach is readable as the tall one from
      // behind as well as from the side
      for (let i = 0; i < 4; i++) {
        const z = -CARRIAGE_L / 2 + (CARRIAGE_L / 4) * (i + 0.5)
        pushBox(p, 0.7, 0.2, 0.7, 0, 3.5, z)
      }
      return { geo: build(p), rim: new THREE.EdgesGeometry(build(r), 40), surface: 'carriage' }
    }
    case 'service': {
      // the night service. Same body language as a carriage so it is obviously
      // rolling stock, but with a cab end and a headlight — and it is the one
      // rake in the yard that is moving, which is the whole of its threat.
      const len = 32
      rakeBody(p, r, len, 3.4)
      // the cab: a raked front at the leading (−Z, nearest) end
      pushBox(p, CARRIAGE_W - 0.1, 1.1, 1.2, 0, 2.5, -len / 2 + 0.3, { pitch: 0.22 })
      pushBox(p, CARRIAGE_W - 0.5, 0.5, 0.3, 0, 1.1, -len / 2 - 0.05)
      return { geo: build(p), rim: new THREE.EdgesGeometry(build(r), 40), surface: 'carriage' }
    }

    /* ---- the ones that change your height ---- */
    case 'ramp': {
      // a loading ramp: a wedge from 0 to 2.20 over 4 deep. You run up it, so
      // it is the one obstacle with no rim across its top edge — a bright line
      // where the slope meets the roof would read as a lip to trip on.
      const h = 2.2
      const d = 4.0
      const w = CARRIAGE_W
      const A = new THREE.Vector3(-w / 2, 0, -d / 2)
      const B = new THREE.Vector3(w / 2, 0, -d / 2)
      const C = new THREE.Vector3(w / 2, h, d / 2)
      const D = new THREE.Vector3(-w / 2, h, d / 2)
      const E = new THREE.Vector3(-w / 2, 0, d / 2)
      const F = new THREE.Vector3(w / 2, 0, d / 2)
      // the running surface
      pushTri(p, A, C, B, UV_PER_UNIT)
      pushTri(p, A, D, C, UV_PER_UNIT)
      // the back
      pushTri(p, D, F, C, UV_PER_UNIT)
      pushTri(p, D, E, F, UV_PER_UNIT)
      // the cheeks
      pushTri(p, A, E, D, UV_PER_UNIT)
      pushTri(p, B, C, F, UV_PER_UNIT)
      // the underside
      pushTri(p, A, B, F, UV_PER_UNIT)
      pushTri(p, A, F, E, UV_PER_UNIT)
      // rim: the two cheeks only, which is the silhouette from the side and
      // nothing across the line you are running along
      const rg = new THREE.BufferGeometry()
      const line: number[] = []
      for (const s of [-1, 1]) {
        const x = (s * w) / 2
        line.push(x, 0, -d / 2, x, h, d / 2)
        line.push(x, h, d / 2, x, 0, d / 2)
        line.push(x, 0, d / 2, x, 0, -d / 2)
      }
      rg.setAttribute('position', new THREE.Float32BufferAttribute(line, 3))
      return { geo: build(p), rim: rg, surface: 'iron' }
    }
    case 'pylon': {
      // a barrier bolted to a carriage roof: two short stanchions at the very
      // edge of the body and a lattice arm across at 1.05 → 3.00. The gap
      // underneath is 1.05 and a roll is 0.90 tall, so ducking it while riding
      // is the answer and the art has to make that gap obvious from a distance.
      const y0 = 1.05 - INSET_TOP
      const y1 = 3.0
      pushBox(p, HALF_W * 2, 0.34, 1.5, 0, y1 - 0.17, 0)
      pushBox(p, HALF_W * 2 - 0.2, y1 - 0.34 - y0, 1.0, 0, (y0 + y1 - 0.34) / 2, 0)
      for (const s of [-1, 1]) pushBox(p, 0.14, y1, 0.14, s * (HALF_W - 0.07), y1 / 2, 0)
      pushBox(r, HALF_W * 2, y1 - y0, 1.6, 0, (y0 + y1) / 2, 0)
      return { geo: build(p), rim: new THREE.EdgesGeometry(build(r), 40), surface: 'iron' }
    }
    case 'beam': {
      // the full-width gantry: 3.20 → 3.80 across all three lanes, with its
      // legs at ±4.70 — outside every lane, because a leg standing in a lane
      // that the collider does not know about is a lie the player pays for.
      const y0 = 3.2 - INSET_TOP
      const y1 = 3.8
      const half = 4.7
      pushBox(p, half * 2, y1 - y0, 1.9, 0, (y0 + y1) / 2, 0)
      pushBox(p, half * 2, 0.14, 2.2, 0, y1, 0)
      for (const s of [-1, 1]) lattice(p, s * (half - 0.2), 0, y1, 0, 0.14)
      // three lamp hoods, one over each lane, so the beam reads as a signal
      // bridge and not as scaffolding
      for (const lane of [-1, 0, 1]) pushBox(p, 0.34, 0.34, 0.1, lane * LANE_W, y0 + 0.3, 0.98)
      pushBox(r, half * 2, y1 - y0, 2.0, 0, (y0 + y1) / 2, 0)
      return { geo: build(p), rim: new THREE.EdgesGeometry(build(r), 40), surface: 'iron' }
    }

    /* ---- the collectables ---- */
    case 'mote': {
      // a mote of lantern-light. An octahedron rather than a sphere: at three
      // pixels across a sphere is a dot and an octahedron catches the camera
      // as it turns, which is the difference between "a light" and "a pixel".
      const g = new THREE.OctahedronGeometry(0.22, 0)
      return { geo: g, rim: null, surface: 'lamp' }
    }
    case 'crate': {
      // a sealed lamp crate. Banded, with a glowing seam — the seam is drawn
      // by the scene as a separate additive shell, not baked in here.
      pushBox(p, 0.9, 0.9, 0.9, 0, 0, 0)
      for (const s of [-1, 1]) pushBox(p, 0.98, 0.12, 0.12, 0, 0, s * 0.34)
      pushBox(r, 0.9, 0.9, 0.9, 0, 0, 0)
      return { geo: build(p), rim: new THREE.EdgesGeometry(build(r), 40), surface: 'sleeper' }
    }
    case 'letter': {
      // the weekly word's letter rides on a plate; the glyph itself is a
      // texture the scene swaps per instance, so the prototype is the plate.
      return { geo: new THREE.PlaneGeometry(0.8, 0.8), rim: null, surface: 'lamp' }
    }
    case 'pickup': {
      // the generic canister. Every real powerup has its own model — see
      // pickupGeometry — and this is what a pickup of unknown kind falls back
      // to, which should never happen and must still draw something.
      return { geo: new THREE.IcosahedronGeometry(0.42, 0), rim: null, surface: 'lamp' }
    }

    /* ---- the one that is never drawn ---- *
     * `bridge` — an invisible collider filling a coupling seam. It exists so
     * that a 0.6-u gap between two carriages does not clear onGround, break
     * the run cycle and eat the coyote window over 23 milliseconds. There is
     * nothing to draw and the scene must never try. It falls out of the switch
     * rather than taking a case of its own, so that this function returns on
     * every path even while track.ts's EntityKind is still being written next
     * door and TypeScript cannot yet prove the switch exhaustive.
     */
    default:
      break
  }
  return { geo: new THREE.BufferGeometry(), rim: null, surface: 'iron' }
}

function proto(kind: EntityKind): Proto {
  let p = protos.get(kind)
  if (!p) {
    p = makeProto(kind)
    protos.set(kind, p)
  }
  return p
}

export function entityGeometry(kind: EntityKind): THREE.BufferGeometry {
  return proto(kind).geo
}

export function entityMaterial(kind: EntityKind): THREE.Material {
  if (kind === 'mote') return glowMaterial(PALETTE.glow, 0.95)
  if (kind === 'letter' || kind === 'pickup') return glowMaterial(PALETTE.amberLit, 0.85)
  return surfaceMaterial(proto(kind).surface)
}

export function entityRim(kind: EntityKind): THREE.BufferGeometry | null {
  return proto(kind).rim
}

/* ------------------------------------------------------------------ *
 * The powerups
 *
 * Five things, five silhouettes, readable in the half second between seeing
 * one and deciding whether it is worth a lane change. They share a colour
 * (there is one accent in this world and it is amber) so they must not share a
 * shape — the shape is the whole readout.
 *
 * §C.4 keys geometry off EntityKind, which has a single `pickup`. These three
 * additional accessors are the smallest thing that satisfies "a visually
 * distinct model per powerup" without changing the declared interface.
 * ------------------------------------------------------------------ */

const pickups = new Map<PowerKind, { geo: THREE.BufferGeometry; core: THREE.BufferGeometry }>()

function makePickup(power: PowerKind): { geo: THREE.BufferGeometry; core: THREE.BufferGeometry } {
  const p = parts()
  /* A COLLECTABLE IS A POINT, NOT A FOOTPRINT. Everything solid in here has
     its origin on the ground it stands on; a mote, a crate, a letter and a
     pickup have theirs at the centre of the thing itself, because that is the
     point the simulation tests against and the scene should not be applying a
     different offset per kind to find it. */
  const y = 0
  switch (power) {
    case 'flare':
      // a lantern flare: the lamp glass with four spokes of light off it. The
      // one that pulls things toward you looks like a thing that radiates.
      pushBox(p, 0.34, 0.46, 0.34, 0, y, 0)
      pushBox(p, 0.1, 0.12, 0.1, 0, y + 0.32, 0)
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        pushBox(p, 0.5, 0.05, 0.05, Math.cos(a) * 0.36, y, Math.sin(a) * 0.36, { yaw: -a })
      }
      break
    case 'tally':
      // the tally: four strokes and the fifth through them. It is the only
      // pickup that is a *mark* rather than an object, which is right for the
      // one that multiplies a number.
      for (let i = 0; i < 4; i++) pushBox(p, 0.07, 0.62, 0.07, -0.27 + i * 0.18, y, 0)
      pushBox(p, 0.78, 0.07, 0.07, 0, y, 0, { roll: 0.5 })
      break
    case 'boots':
      // ballast boots: two soles, toes up, one behind the other.
      for (const s of [-1, 1]) {
        pushBox(p, 0.26, 0.14, 0.62, s * 0.19, y - 0.1, 0)
        pushBox(p, 0.26, 0.3, 0.2, s * 0.19, y + 0.04, -0.2)
        pushBox(p, 0.3, 0.08, 0.7, s * 0.19, y - 0.19, 0.02)
      }
      break
    case 'updraft':
      // the updraft: a cone pointing up out of a ring. Everything about it
      // says the direction it is going to take you.
      pushBox(p, 0.4, 0.5, 0.4, 0, y + 0.1, 0, { yaw: Math.PI / 4 })
      pushBox(p, 0.62, 0.08, 0.62, 0, y - 0.26, 0)
      for (let i = 0; i < 3; i++) pushBox(p, 0.5 - i * 0.14, 0.05, 0.5 - i * 0.14, 0, y - 0.42 - i * 0.13, 0)
      break
    case 'handcar':
      // the handcar: a deck, four wheels and the see-saw pump arm. It is the
      // only pickup that is a vehicle and it is the only one shaped like one.
      pushBox(p, 0.8, 0.1, 0.5, 0, y - 0.2, 0)
      for (const s of [-1, 1])
        for (const t of [-1, 1]) pushBox(p, 0.08, 0.24, 0.24, s * 0.34, y - 0.34, t * 0.18)
      pushBox(p, 0.07, 0.42, 0.07, 0, y + 0.03, 0)
      pushBox(p, 0.07, 0.07, 0.66, 0, y + 0.24, 0, { pitch: 0.35 })
      break
  }
  // the core: a small additive shell every pickup carries, so it is a light in
  // the fog long before it is a shape
  return { geo: build(p), core: new THREE.IcosahedronGeometry(0.5, 1) }
}

function pickupProto(power: PowerKind) {
  let p = pickups.get(power)
  if (!p) {
    p = makePickup(power)
    pickups.set(power, p)
  }
  return p
}

/** the solid model for one powerup, origin on the ground beneath it */
export function pickupGeometry(power: PowerKind): THREE.BufferGeometry {
  return pickupProto(power).geo
}
/** …and the additive halo that makes it visible out at the fog line */
export function pickupCoreGeometry(power: PowerKind): THREE.BufferGeometry {
  return pickupProto(power).core
}
export function pickupMaterial(): THREE.Material {
  return surfaceMaterial('lamp')
}

/* ------------------------------------------------------------------ *
 * The standing set
 * ------------------------------------------------------------------ */

/**
 * One tile of track bed, TILE long: ballast, six rails (two per lane) and the
 * sleepers that carry them.
 *
 * THE JITTER IS NOT DECORATION. At 26 u/s a 1.40-u sleeper pitch crosses the
 * eye at 18.6 Hz, which is inside the flicker-fusion band: a perfectly regular
 * bed strobes, moirés against the frame rate, and is a genuine photosensitivity
 * concern rather than an aesthetic one. Each sleeper is displaced ±0.06 u along
 * Z and yawed ±2°, and the ballast underneath carries its own speckle at 0.37,
 * so there are two beats and neither survives as a single frequency. The
 * scene's ring buffer of these is what gives real parallax; never scroll a
 * texture for this, it reads as a treadmill.
 *
 * One merged geometry, one draw call per tile.
 */
export function railTile(rng: () => number): THREE.Group {
  const g = new THREE.Group()
  const p = parts()

  // ballast: the full three-lane bed plus a shoulder, with a shallow crown so
  // the light rakes across it instead of flooding it flat
  const bedW = LANE_W * 3 + 3.2
  pushBox(p, bedW, 0.3, TILE, 0, -0.15, 0)
  pushBox(p, bedW - 1.4, 0.12, TILE, 0, -0.04, 0)

  const bed = new THREE.Mesh(build(p), surfaceMaterial('ballast'))
  owned.push(bed.geometry)
  bed.frustumCulled = false
  g.add(bed)

  // sleepers, jittered
  const sp = parts()
  const n = Math.max(1, Math.round(TILE / SLEEPER_PITCH))
  for (let i = 0; i < n; i++) {
    const z = -TILE / 2 + (TILE / n) * (i + 0.5) + (rng() - 0.5) * 0.12
    const yaw = (rng() - 0.5) * 0.07
    for (const lane of [-1, 0, 1]) {
      pushBox(sp, 2.5, 0.14, 0.26, lane * LANE_W, 0.03, z, { yaw })
    }
  }
  const sleepers = new THREE.Mesh(build(sp), surfaceMaterial('sleeper'))
  owned.push(sleepers.geometry)
  sleepers.frustumCulled = false
  g.add(sleepers)

  // rails. Continuous through the tile and slightly proud of the sleepers —
  // two cold highlights per lane running away into the fog, which is the best
  // perspective cue in the scene and the reason `rail` is the one surface here
  // allowed any metalness.
  const rp = parts()
  for (const lane of [-1, 0, 1]) {
    for (const s of [-1, 1]) {
      const x = lane * LANE_W + (s * GAUGE) / 2
      pushBox(rp, 0.1, 0.16, TILE + 0.02, x, 0.14, 0)
      pushBox(rp, 0.16, 0.05, TILE + 0.02, x, 0.2, 0)
    }
  }
  const rails = new THREE.Mesh(build(rp), surfaceMaterial('rail'))
  owned.push(rails.geometry)
  rails.frustumCulled = false
  g.add(rails)

  return g
}

/**
 * A tunnel ring. Wide enough that the outer lanes are not scraping it — the
 * lining is scenery, not a collider, and a wall the simulation does not know
 * about must never look like one you could hit.
 */
export function tunnelRing(): THREE.Group {
  const g = new THREE.Group()
  const p = parts()
  const half = 6.4
  const top = 6.0
  const t = 0.9
  pushBox(p, half * 2 + t * 2, top + t, t, 0, (top + t) / 2, 0)
  for (const s of [-1, 1]) pushBox(p, t, top, 1.2, s * (half + t / 2), top / 2, 0)
  pushBox(p, half * 2 + t * 2, t, 1.2, 0, top + t / 2, 0)
  const mesh = new THREE.Mesh(build(p), surfaceMaterial('tunnel'))
  owned.push(mesh.geometry)
  mesh.frustumCulled = false
  g.add(mesh)
  const rim = new THREE.BufferGeometry()
  const line: number[] = []
  const corners: Array<[number, number]> = [
    [-half, 0],
    [-half, top],
    [half, top],
    [half, 0],
  ]
  for (let i = 0; i < corners.length - 1; i++) {
    line.push(corners[i]![0], corners[i]![1], 0.62, corners[i + 1]![0], corners[i + 1]![1], 0.62)
  }
  rim.setAttribute('position', new THREE.Float32BufferAttribute(line, 3))
  g.add(new THREE.LineSegments(rim, rimMaterial(SURFACES.tunnel.rim)))
  owned.push(rim)
  return g
}

/**
 * The far scenery: sheds, a water tower, a signal box on stilts, and a march
 * of telegraph poles. Flat, unlit, and deliberately without detail — it sits
 * beyond the fog's useful range and its only job is to stop the horizon being
 * an empty band.
 *
 * TWO CHILDREN, AND THE SPLIT MATTERS. `far` is the buildings, and it rides
 * with the runner so it never arrives: a shed you can outrun is a shed that
 * pops out of existence, and out at that distance nobody expects parallax
 * anyway. `poles` is regularly spaced, so it can be wrapped on its own pitch
 * without a visible seam — and that is where all the near-horizon motion comes
 * from. A horizon with no rhythm in it reads as a painted flat.
 */
export const POLE_PITCH = 18

export function backdrop(): THREE.Group {
  const g = new THREE.Group()
  const p = parts()
  // two rows, near and far, so there is one parallax step out there
  for (let i = 0; i < 26; i++) {
    const s = rand(i * 3 + 1) < 0.5 ? -1 : 1
    const x = s * (16 + rand(i * 5 + 2) * 26)
    const z = -40 + rand(i * 7 + 3) * 220
    const kind = rand(i * 11 + 4)
    if (kind < 0.55) {
      // a shed
      const w = 6 + rand(i + 21) * 10
      const h = 3 + rand(i + 33) * 3
      pushBox(p, w, h, 8 + rand(i + 41) * 6, x, h / 2, z)
      pushBox(p, w + 0.6, 0.4, 9, x, h + 0.2, z)
    } else if (kind < 0.8) {
      // a water tower on legs
      const h = 7 + rand(i + 51) * 3
      pushBox(p, 4.4, 2.6, 4.4, x, h, z)
      for (const a of [-1, 1])
        for (const b of [-1, 1]) pushBox(p, 0.3, h - 1.3, 0.3, x + a * 1.7, (h - 1.3) / 2, z + b * 1.7)
    } else {
      // a signal box on stilts
      const h = 4.5 + rand(i + 61) * 2
      pushBox(p, 4, 2.4, 3, x, h, z)
      pushBox(p, 4.6, 0.3, 3.6, x, h + 1.3, z)
      for (const a of [-1, 1]) pushBox(p, 0.34, h - 1.2, 0.34, x + a * 1.5, (h - 1.2) / 2, z)
    }
  }
  const mat = new THREE.MeshBasicMaterial({
    // authored as what the fog does to a shape at that distance: a silhouette
    // one step above the sky, never a lit object. Basic, because a directional
    // light on scenery this far out only ever produces a seam at the horizon.
    color: 0x16272d,
    fog: true,
    toneMapped: true,
  })
  const mesh = new THREE.Mesh(build(p), mat)
  owned.push(mesh.geometry)
  mesh.name = 'far'
  mesh.frustumCulled = false
  mesh.renderOrder = -1
  g.add(mesh)
  owned.push(mat)

  // the poles, on an exact pitch and on both sides, so the whole run of them
  // is periodic in POLE_PITCH and the scene can wrap it invisibly
  const pp = parts()
  const span = Math.round(260 / POLE_PITCH)
  for (let i = 0; i < span; i++) {
    const z = i * POLE_PITCH
    for (const s of [-1, 1]) {
      const x = s * 12.5
      pushBox(pp, 0.24, 7.2, 0.24, x, 3.6, z)
      pushBox(pp, 1.8, 0.12, 0.12, x, 6.6, z)
      pushBox(pp, 1.4, 0.12, 0.12, x, 6.1, z)
    }
  }
  const poles = new THREE.Mesh(build(pp), mat)
  owned.push(poles.geometry)
  poles.name = 'poles'
  poles.frustumCulled = false
  poles.renderOrder = -1
  g.add(poles)
  return g
}

/** the field's shallow dome of faint stars, biased toward the horizon */
export function stars(): THREE.Points {
  const count = 420
  const radius = 150
  const pos = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const theta = rand(i + 3) * Math.PI * 2
    const h = 0.05 + Math.pow(rand(i + 41), 1.7) * 0.85
    const r = radius * (1.1 + rand(i + 77) * 0.5)
    pos[i * 3] = Math.cos(theta) * r
    pos[i * 3 + 1] = h * radius * 1.1
    pos[i * 3 + 2] = Math.sin(theta) * r
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    color: PALETTE.buff,
    size: 1.2,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.5,
    fog: false,
    depthWrite: false,
  })
  const pts = new THREE.Points(geo, mat)
  pts.frustumCulled = false
  return pts
}

/**
 * A soft round falloff, for anything that has to read as light rather than as
 * a surface. One channel of alpha over a white disc, so a single texture tints
 * to whatever the material's colour is.
 *
 * It exists because of the wrong turn below and is worth its 64×64: an
 * additive quad with NO map is a rectangle of solid colour, and a rectangle of
 * solid colour is exactly what a glow must never be.
 */
let radial: THREE.CanvasTexture | null = null
function radialTexture(): THREE.CanvasTexture {
  if (radial) return radial
  const S = 64
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const c = cv.getContext('2d')!
  const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  // squared falloff, not linear: a linear ramp still has a visible disc edge
  // where it reaches zero, because the eye finds the discontinuity in the
  // FIRST derivative long before it finds the one in the value.
  for (let i = 0; i <= 8; i++) {
    const t = i / 8
    g.addColorStop(t, `rgba(255,255,255,${((1 - t) * (1 - t)).toFixed(3)})`)
  }
  c.fillStyle = g
  c.fillRect(0, 0, S, S)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  radial = tex
  owned.push(tex)
  return tex
}

/**
 * The lantern flame: a soft additive halo with a small hot core inside it. It
 * is where the point light lives, and it exists so that the light has a
 * visible source — a moving pool of warmth with no lamp in the middle of it
 * reads as a rendering bug.
 *
 * WRONG TURN, DO NOT RETAKE. This was two crossed `PlaneGeometry` quads on a
 * plain additive material with no map. A quad with no map is not a glow, it is
 * a CARD: it renders as a hard-edged amber rectangle sixty pixels across,
 * stuck to the runner's hip for the whole game, and it is the first thing
 * anybody notices about the trainyard. Measured off a real frame at
 * `#c39552` — brighter than the motes you are trying to collect. The falloff
 * has to be in a texture; there is nowhere else for it to live.
 *
 * One camera-facing billboard now, not a cross. `scene.ts` already calls
 * `lookAt(camera.position)` on the group every frame, and once the quad has a
 * radial falloff the second one only doubles the additive weight at the
 * centre and clips through the first at grazing angles.
 */
export function flame(): THREE.Object3D {
  const g = new THREE.Group()
  const geo = new THREE.PlaneGeometry(1.15, 1.15)
  const mat = glowMaterial(PALETTE.glow, 0.5).clone()
  mat.map = radialTexture()
  mat.needsUpdate = true
  owned.push(mat)
  g.add(new THREE.Mesh(geo, mat))
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), glowMaterial(PALETTE.amberLit, 0.9))
  g.add(core)
  owned.push(geo, core.geometry)
  return g
}

/**
 * The yard guard: a silhouette with a lantern, seen from in front, always in
 * the murk. Low detail on purpose — he is a shape and a light, never a
 * character, and the moment you can see his face he stops being dread and
 * starts being a model you can judge.
 */
export function guard(): THREE.Group {
  const g = new THREE.Group()
  const p = parts()
  // 1.9 tall, heavier than the runner. Legs mid-stride, coat flaring.
  pushBox(p, 0.52, 0.72, 0.3, 0, 1.35, 0)
  pushBox(p, 0.62, 0.5, 0.36, 0, 0.95, 0)
  pushBox(p, 0.26, 0.28, 0.26, 0, 1.85, 0)
  pushBox(p, 0.44, 0.08, 0.34, 0, 1.96, 0.02)
  pushBox(p, 0.2, 0.78, 0.22, -0.16, 0.4, 0.1, { pitch: 0.18 })
  pushBox(p, 0.2, 0.78, 0.22, 0.16, 0.4, -0.1, { pitch: -0.18 })
  pushBox(p, 0.16, 0.6, 0.16, -0.4, 1.28, 0.06, { pitch: 0.5 })
  pushBox(p, 0.16, 0.56, 0.16, 0.4, 1.3, 0, {})
  const mat = new THREE.MeshBasicMaterial({
    // unlit and nearly the fog's own colour: he emerges as an absence rather
    // than as an object, which is the only way a chaser at 14 units reads as
    // menace instead of as a prop that failed to load.
    color: 0x101c21,
    fog: true,
    toneMapped: true,
  })
  const body = new THREE.Mesh(build(p), mat)
  owned.push(body.geometry)
  g.add(body)
  owned.push(mat)

  // his lantern, held out at arm's length in the left hand
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), glowMaterial(PALETTE.glow, 0.85))
  lamp.position.set(-0.62, 1.02, 0.18)
  lamp.name = 'lamp'
  g.add(lamp)
  owned.push(lamp.geometry)
  return g
}

/* ------------------------------------------------------------------ *
 * Teardown
 * ------------------------------------------------------------------ */

export function disposeProps(): void {
  for (const p of protos.values()) {
    p.geo.dispose()
    p.rim?.dispose()
  }
  protos.clear()
  for (const p of pickups.values()) {
    p.geo.dispose()
    p.core.dispose()
  }
  pickups.clear()
  for (const m of surfaceMats.values()) m.dispose()
  surfaceMats.clear()
  for (const m of rims.values()) m.dispose()
  rims.clear()
  for (const m of glows.values()) m.dispose()
  glows.clear()
  for (const o of owned) o.dispose()
  owned.length = 0
  speckle?.dispose()
  speckle = null
}

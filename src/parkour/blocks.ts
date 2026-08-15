/**
 * The surfaces the course is built from — in the field's language, not
 * Minecraft's.
 *
 * WHAT CHANGED, AND WHY. This file used to paint 16×16 pixel-art textures and
 * shade them with Minecraft's flat directional constants. It was accurate and
 * it was wrong: the field outside is a dusk-blue world of matte silhouettes,
 * warm lantern light and thin amber rules, and a wall of pixel cobblestone
 * next to it read as a different website — a costume, which §4 of CONTEXT
 * already rejected once. The parkour is still parkour and the physics is still
 * Minecraft's to four decimal places. You just play it in *this* world, lit by
 * the lantern you carried in.
 *
 * So a platform here is:
 *  · a matte, nearly-black slate surface with a very fine speckle, so it
 *    catches the lantern the way the field's ground does;
 *  · lit by real lights — a hemisphere, a moon and the lamp in your hand —
 *    rather than by baked face constants;
 *  · edged in amber, which is the one thing here that is not realism. A dark
 *    platform against a dark sky is invisible, and a parkour course you cannot
 *    read is not a parkour course. The rim is the same amber as the
 *    projector's plaque and the sign's frame, so it belongs to the place.
 *
 * Ambient occlusion is still baked per vertex (see mesher.ts) — that is
 * geometry rather than costume, and it is what stops a stack of blocks reading
 * as one extruded silhouette.
 */

import * as THREE from 'three'
import { PALETTE, rand } from '../core/contract'
import { alphaOf, type BlockId } from './blockmeta'

export type { BlockId }

/* ------------------------------------------------------------------ *
 * The palette
 *
 * Every surface is a dark slate with its hue pushed a few degrees one way or
 * another, so five courses read as five places without any of them leaving
 * the dusk the rest of the site lives in. `rim` is the colour its edges are
 * picked out in; `emissive` is for the handful that are their own light.
 * ------------------------------------------------------------------ */

interface Surface {
  color: number
  /** what its edges are drawn in — this is the wayfinding */
  rim: number
  /** self-lit: checkpoints, the goal */
  emissive?: number
  roughness?: number
  metalness?: number
}

const SLATE = 0x455860
const RIM = PALETTE.amber
const RIM_COOL = 0x6f93a0

export const SURFACES: Record<BlockId, Surface> = {
  /* course 1 — the field after dark. Greener slate: the colour of the ground
     you have just walked across to get here. */
  grass: { color: 0x39544f, rim: 0x8fb9a8 },
  dirt: { color: 0x3a4448, rim: RIM },

  /* course 2 — cut stone */
  stone: { color: SLATE, rim: RIM_COOL },
  cobble: { color: 0x4d646d, rim: RIM_COOL },
  mossy: { color: 0x3f5b52, rim: 0x8fb9a8 },

  /* course 3 — timber */
  planks: { color: 0x47483f, rim: 0xb99f72 },
  log: { color: 0x33342e, rim: 0xb99f72 },
  leaves: { color: 0x27403a, rim: 0x8fb9a8 },

  /* course 4 — pale, warm, open */
  sand: { color: 0x5f5946, rim: RIM },
  sandstone: { color: 0x6a634d, rim: RIM },
  quartz: { color: 0x74807f, rim: 0xd8dfe0 },

  /* course 5 — the deep end */
  obsidian: { color: 0x24273a, rim: 0x8f9ad0 },
  netherrack: { color: 0x3a2426, rim: 0xc86a5a },
  endstone: { color: 0x5e5a47, rim: RIM },
  purpur: { color: 0x3f4257, rim: 0x8f9ad0 },
  bedrock: { color: 0x1a2226, rim: RIM_COOL },

  /* the ones that carry meaning */
  glowstone: { color: 0x5a4a2a, rim: PALETTE.amberLit, emissive: 0x7a5316 },
  gold: { color: 0x554a2c, rim: PALETTE.amberLit, emissive: 0x6a4a12, metalness: 0.5 },
  emerald: { color: 0x2a4a40, rim: PALETTE.mint, emissive: 0x1c5c46 },
  diamond: { color: 0x2c4a4e, rim: 0x8fe0e8, emissive: 0x175055 },
  redstone: { color: 0x4a2424, rim: 0xc86a5a, emissive: 0x5a1414 },

  /* the two that change how you move */
  slime: { color: 0x3f6d57, rim: PALETTE.mint },
  ice: { color: 0x4a6d7d, rim: 0x9ed2e8 },
}

/* ------------------------------------------------------------------ *
 * Texture
 *
 * One neutral speckle, shared by everything and tinted by the material's own
 * colour — the same trick field.ts uses on the ground, for the same reason:
 * it gives a surface grain to catch the light without any of it having to be
 * authored per material.
 * ------------------------------------------------------------------ */

let speckle: THREE.CanvasTexture | null = null

function speckleTexture(): THREE.CanvasTexture {
  if (speckle) return speckle
  const S = 128
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const c = cv.getContext('2d')!
  c.fillStyle = '#808080'
  c.fillRect(0, 0, S, S)
  // fine: one turn of this covers a single block face, so anything much
  // bigger than a pixel or two reads as blotches rather than as grain
  for (const i of Array.from({ length: 1400 }, (_, n) => n)) {
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
  speckle = tex
  return tex
}

/* ------------------------------------------------------------------ *
 * Geometry and materials
 * ------------------------------------------------------------------ */

/** a plain unit cube — the mesher builds its own faces; this is for movers */
export const BLOCK_GEOMETRY = new THREE.BoxGeometry(1, 1, 1)

const materials = new Map<BlockId, THREE.MeshStandardMaterial>()

export function blockMaterial(id: BlockId): THREE.MeshStandardMaterial {
  const cached = materials.get(id)
  if (cached) return cached
  const s = SURFACES[id]
  const alpha = alphaOf(id)
  /* EVERY SURFACE IS SLIGHTLY SELF-LIT, and it is not a cheat.
     The field can afford true darkness because darkness there is the concept —
     you walk toward things and they resolve. A parkour course cannot: you have
     to judge a jump to a platform twenty blocks away, in the dark, before you
     leave the ground. Real lights plus ACES tone mapping put those platforms
     at pure black, so each surface carries a floor of its own colour. The
     lantern still does all the *modelling* — it is what makes the block you
     are standing on feel close — this only stops the far ones vanishing. */
  const mat = new THREE.MeshStandardMaterial({
    color: s.color,
    map: speckleTexture(),
    vertexColors: true, // the mesher bakes ambient occlusion into these
    roughness: s.roughness ?? 0.94,
    metalness: s.metalness ?? 0.04,
    /* A floor of self-light so a platform twenty blocks away is not pure
       black — but a LOW one. three.js adds emissive after the vertex colours
       are multiplied in, so every point of it dilutes the ambient occlusion
       the mesher bakes: at 0.42 the creases were gone and every platform was
       one flat shape. This is enough to see by and not enough to erase them. */
    emissive: s.emissive ?? s.color,
    emissiveIntensity: s.emissive ? 1 : 0.2,
    transparent: alpha !== undefined,
    opacity: alpha ?? 1,
  })
  materials.set(id, mat)
  return mat
}

/** the colour this surface's edges are picked out in */
export const rimOf = (id: BlockId): number => SURFACES[id].rim

/** one shared line material per rim colour */
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
    /* Quiet. The faces carry the platforms and the rim only sharpens their
       edge — the other way round is the wireframe failure: fog scales a line
       and a face equally, so if the line is the brighter of the two up close
       it is still the brighter of the two at distance, and the course reads
       as an outline drawing over black. */
    opacity: 0.3,
    fog: true,
    toneMapped: true,
    depthWrite: false,
  })
  rims.set(colour, mat)
  return mat
}

/* ---- slabs: the backdrop geometry, same materials, tiled ---- */

const slabs = new Map<BlockId, THREE.MeshStandardMaterial>()

export function slabMaterial(id: BlockId): THREE.MeshStandardMaterial {
  const cached = slabs.get(id)
  if (cached) return cached
  const s = SURFACES[id]
  const tex = speckleTexture().clone()
  tex.needsUpdate = true
  const mat = new THREE.MeshStandardMaterial({
    color: s.color,
    map: tex,
    vertexColors: true,
    roughness: 0.98,
    metalness: 0,
    // the backdrop gets less of it than the platforms: it is scenery, and it
    // should sit behind the thing you are actually trying to land on
    emissive: s.color,
    emissiveIntensity: 0.07,
  })
  slabs.set(id, mat)
  return mat
}

/** a box of `w`×`h`×`d` blocks, with the speckle kept at a constant scale */
export function slabGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d)
  const uv = geo.attributes.uv as THREE.BufferAttribute
  const count = uv.count
  const col = new Float32Array(count * 3)
  const SPAN: Array<[number, number]> = [
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
      // half a turn per block on the backdrop, so its grain reads as the same
      // material as the platforms without tiling into a visible grid
      uv.setXY(i, uv.getX(i) * SPAN[f]![0]! * 0.5, uv.getY(i) * SPAN[f]![1]! * 0.5)
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 1
    }
  }
  uv.needsUpdate = true
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return geo
}

export function disposeBlocks(): void {
  for (const m of materials.values()) m.dispose()
  for (const m of slabs.values()) {
    m.map?.dispose()
    m.dispose()
  }
  for (const m of rims.values()) m.dispose()
  materials.clear()
  slabs.clear()
  rims.clear()
  speckle?.dispose()
  speckle = null
}

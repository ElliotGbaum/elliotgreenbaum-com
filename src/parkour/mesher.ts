/**
 * Turning a pile of blocks into geometry, the way Minecraft does.
 *
 * This replaced one InstancedMesh per block type, and the reason is the two
 * things instancing cannot do:
 *
 *  1. HIDDEN FACES. A face with another block against it is never visible, and
 *     in a solid mass that is most of them. A shaft wall three blocks thick is
 *     drawn as one surface here instead of as thousands of buried cubes, which
 *     is what makes it affordable to build walls out of real blocks at all —
 *     and real blocks are what give a wall the seams you can count from thirty
 *     metres away.
 *
 *  2. AMBIENT OCCLUSION. Each *vertex* is darkened by how many of the three
 *     blocks touching that corner are solid — the dark crease in every inside
 *     corner. It is what stops a stack of blocks reading as one extruded
 *     silhouette, and in a world this dark it is doing most of the work of
 *     describing shape. Instances share one geometry, so per-vertex anything
 *     is impossible; a merged mesh can bake it.
 *
 * The *directional* face shading that used to live here has gone with the
 * pixel textures: these surfaces are lit by real lights now (see scene.ts), so
 * baking a constant per face would darken everything twice.
 *
 * The cost is that a level's geometry is built once, at load, instead of being
 * a hundred matrices. A course is a few thousand faces and it takes under a
 * millisecond.
 *
 * The AO rule is vanilla's: for each vertex of a face, look at the two edge
 * neighbours and the corner between them. Three solid → darkest. Two solid
 * edges → darkest regardless of the corner (that is the famous special case
 * which stops the crease breaking on a diagonal).
 */

import * as THREE from 'three'
import type { BlockId } from './blockmeta'

/** the four levels of vanilla smooth lighting, brightest to darkest */
const AO = [1.0, 0.8, 0.65, 0.5]

/** the six faces, as normal + the four corner offsets that decide their AO */
interface Face {
  /** face normal */
  n: [number, number, number]
  /** the four corners of the quad, in unit-cube space */
  corner: Array<[number, number, number]>
  /** the two in-plane axes, for the AO neighbour lookups */
  u: [number, number, number]
  v: [number, number, number]
}

const FACES: Face[] = [
  {
    n: [1, 0, 0],
    corner: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
    u: [0, 0, -1],
    v: [0, 1, 0],
  },
  {
    n: [-1, 0, 0],
    corner: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
    u: [0, 0, 1],
    v: [0, 1, 0],
  },
  {
    n: [0, 1, 0],
    corner: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
    u: [1, 0, 0],
    v: [0, 0, -1],
  },
  {
    n: [0, -1, 0],
    corner: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
    u: [1, 0, 0],
    v: [0, 0, 1],
  },
  {
    n: [0, 0, 1],
    corner: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
    u: [1, 0, 0],
    v: [0, 1, 0],
  },
  {
    n: [0, 0, -1],
    corner: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
    u: [-1, 0, 0],
    v: [0, 1, 0],
  },
]

export interface MeshInput {
  x: number
  y: number
  z: number
  id: BlockId
  /** half-height, like a Minecraft slab */
  half?: boolean
}

/**
 * @param blocks every block in the level
 * @param wanted only mesh blocks of this type
 * @param solidAt is there a full block here? (used for face culling and AO)
 */
export function meshBlocks(
  blocks: MeshInput[],
  wanted: BlockId,
  solidAt: (x: number, y: number, z: number) => boolean,
): THREE.BufferGeometry | null {
  const pos: number[] = []
  const nrm: number[] = []
  const uv: number[] = []
  const col: number[] = []
  const idx: number[] = []

  for (const b of blocks) {
    if (b.id !== wanted) continue
    const top = b.half ? 0.5 : 1

    for (const f of FACES) {
      const [nx, ny, nz] = f.n
      // A face buried against another block is never seen. A slab's top is
      // always seen, and its sides always are too, because the block above
      // does not cover them.
      if (!b.half && solidAt(b.x + nx, b.y + ny, b.z + nz)) continue
      if (b.half && ny <= 0 && solidAt(b.x + nx, b.y + ny, b.z + nz)) continue

      const base = pos.length / 3
      for (let c = 0; c < 4; c++) {
        nrm.push(nx, ny, nz)
        const [cx, cy, cz] = f.corner[c]!
        const vy = cy === 1 ? top : 0
        pos.push(b.x + cx, b.y + vy, b.z + cz)

        /* Vanilla smooth lighting: the two edge neighbours of this corner and
           the corner block between them. Two solid edges means darkest even
           if the corner is open — without that special case the crease breaks
           apart along diagonals. */
        const su = cx * f.u[0] + cy * f.u[1] + cz * f.u[2] > 0 ? 1 : -1
        const sv = cx * f.v[0] + cy * f.v[1] + cz * f.v[2] > 0 ? 1 : -1
        const at = (au: number, av: number) =>
          solidAt(
            b.x + nx + f.u[0] * au + f.v[0] * av,
            b.y + ny + f.u[1] * au + f.v[1] * av,
            b.z + nz + f.u[2] * au + f.v[2] * av,
          )
        const side1 = at(su, 0)
        const side2 = at(0, sv)
        const corner = at(su, sv)
        const level = side1 && side2 ? 3 : (side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner ? 1 : 0)
        const k = AO[Math.min(3, level)]!
        col.push(k, k, k)

        // one turn of the speckle per block face; a half block gets half of it
        // so the grain stays the same size on a slab as on a full block
        const ru = c === 1 || c === 2 ? 1 : 0
        const rv = c === 2 || c === 3 ? (ny === 0 ? top : 1) : 0
        uv.push(ru, rv)
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }

  if (pos.length === 0) return null
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.setIndex(idx)
  geo.computeBoundingSphere()
  return geo
}

/**
 * Trace a photograph into the line data the film draws.
 *
 *   npm run sketch            # re-trace all of them
 *   npm run sketch portrait   # just one, while you tune it
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  ELLIOT — HOW TO CHANGE A SKETCH                                     │
 * │                                                                      │
 * │    1. put the photo in  refs/  (gitignored — the photos stay off     │
 * │       GitHub, only the traced lines ship)                            │
 * │    2. point the entry below at it and set `crop`                     │
 * │    3. npm run sketch <name>                                          │
 * │    4. LOOK AT  shots/sketch-<name>.png — it shows the crop you        │
 * │       actually gave it next to the lines that came out. Nearly       │
 * │       every bad trace is a bad crop.                                 │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * WHY THIS AND NOT THE OLD tools/portrait.mjs: that one traced luminance
 * ISOLINES — the contours of a topographic map. On anything with a face in it
 * that gives you concentric blobs around the bright parts, which is why the
 * portrait it produced never looked like a person and the film shipped with a
 * hand-typed cartoon instead.
 *
 * This traces EDGES, the way a person drawing from a photo does — it finds
 * where tone changes, not where tone is. One pass, in order:
 *
 *   normalise   stretch the exposure so `thresh` means the same thing on a
 *               dark stage photo and a bright one
 *   difference  two gaussian blurs subtracted (a band-pass). Ink goes on the
 *               DARK side of each edge, which is where a pencil goes, and the
 *               result doesn't care how dark the region around it is — so a
 *               black background stays empty instead of filling in solid
 *   quieten     drop ink anywhere the local contrast is below `contrast`.
 *               This is the grain gate, and it is the knob that decides
 *               whether an out-of-focus background becomes scribble
 *   thin        Zhang–Suen, down to a one-pixel skeleton, so a thick edge is
 *               one line and not a long thin loop around itself
 *   trace       walk the skeleton into polylines
 *   simplify    Ramer–Douglas–Peucker, drop anything under `minLen`, keep the
 *               `keep` longest
 *
 * AND THEN, OPTIONALLY, A SECOND PASS OVER A SMALL BOX — `detail`. This is
 * here because of one specific failure: a face lit evenly by a flash has less
 * local contrast across the eyes and mouth than the hair around it has against
 * the background, so any single setting that keeps the background quiet also
 * erases every feature, and you get a bald oval. Nothing about the first pass
 * can fix that, because it is one threshold trying to serve two jobs. So the
 * face gets its own, more sensitive, inside its own rectangle. That is also
 * what a person does: broad strokes for the body, then lean in for the eyes.
 *
 * The strokes come out LONGEST FIRST, and that is the drawing order the film
 * animates: the big shapes that carry the likeness arrive first and heaviest,
 * the detail lands on top. It is the order a person sketches in, and it is the
 * only reason a sketch is worth animating rather than fading up.
 */

import { chromium } from 'playwright-core'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

/* ==================================================================== *
 * The sketches.
 *
 * `crop` and `detail.box` are [x, y, w, h] as fractions — crop of the photo,
 * box of the crop. Everything else is a tuning knob, and where one is doing
 * something non-obvious the comment says what it was fighting.
 * ==================================================================== */
const SKETCHES = [
  {
    name: 'portrait',
    src: 'refs/face.png',
    /** head and shoulders, clear of the phone's own chrome top and bottom */
    crop: [0.115, 0.185, 0.78, 0.53],
    work: 480,
    sigma: 1.5,
    thresh: 0.5,
    contrast: 0.035,
    rdp: 0.9,
    minLen: 0.05,
    keep: 40,
    /** the tent seams and a string light, either side of his head */
    exclude: [
      [0, 0, 0.2, 0.22],
      [0.8, 0, 0.2, 0.3],
    ],
    /** the face. Everything above lets the hair and the collar carry it; this
     *  is the pass that puts eyes in the head. */
    detail: {
      box: [0.16, 0.16, 0.56, 0.52],
      sigma: 0.9,
      thresh: 0.3,
      contrast: 0.012,
      rdp: 0.7,
      minLen: 0.028,
      keep: 34,
    },
  },
  {
    name: 'chess',
    src: 'refs/chess.jpg',
    /** HIM AT THE TABLE — not the board.
     *
     *  The first crop took the whole photo, and what came back was fourteen
     *  horizontal lines: the near board is a metre from the lens and out of
     *  focus, so its rows are the longest, softest, most confident edges in
     *  the frame and they beat every other mark by length. The act draws its
     *  own chessboard anyway — a real one, in code, that a game plays across
     *  — so the sketch has exactly one job the board can't do, which is to
     *  put a nine-year-old with his chin on his fist behind it. */
    /* THE HARDEST OF THE FOUR, and the settings are nothing like the others.
       The source photograph is 628px wide, so cropping to a third of it leaves
       about two hundred pixels to work with; and the subject is a dark-haired
       boy in a dark shirt in front of a dark padded wall, which is the exact
       case a difference-of-gaussians is worst at. `work` therefore stays near
       the native size (upsampling invents nothing), and both gates come down
       by roughly a factor of three — at the settings the sax uses, this traces
       as eleven disconnected fragments. */
    crop: [0.0, 0.035, 0.44, 0.6],
    work: 380,
    sigma: 1.1,
    thresh: 0.36,
    contrast: 0.014,
    rdp: 0.8,
    minLen: 0.05,
    keep: 44,
    /** the padded wall's seams, which run horizontally right behind his head
     *  and are longer than anything in the drawing */
    exclude: [
      [0.45, 0, 0.55, 0.3],
      [0, 0, 1, 0.05],
    ],
    detail: {
      box: [0.08, 0.06, 0.48, 0.5],
      sigma: 0.75,
      thresh: 0.22,
      contrast: 0.007,
      rdp: 0.6,
      minLen: 0.028,
      keep: 30,
    },
  },
  {
    name: 'guitar',
    src: 'refs/guitar.jpg',
    /** the figure on the stage. The curtain either side is nearly black and
     *  traces as nothing, which is the whole reason this crop is this wide. */
    crop: [0.16, 0.16, 0.58, 0.78],
    work: 460,
    sigma: 1.4,
    thresh: 0.5,
    contrast: 0.03,
    rdp: 0.9,
    minLen: 0.05,
    keep: 44,
  },
  {
    name: 'sax',
    src: 'refs/sax.png',
    /** him and the horn. Cropped in hard on both sides: the players behind
     *  him are dark suits on a dark backdrop and trace as scribble. */
    crop: [0.245, 0.115, 0.35, 0.8],
    work: 460,
    sigma: 1.5,
    thresh: 0.55,
    contrast: 0.04,
    rdp: 0.9,
    minLen: 0.05,
    keep: 40,
    /** the bandshell's awning, which passes behind his head and is the
     *  longest edge in the crop, and the mic stand at the right edge */
    exclude: [
      [0, 0, 0.37, 0.14],
      [0.68, 0, 0.32, 0.14],
      [0.92, 0.3, 0.08, 0.7],
    ],
    detail: {
      box: [0.3, 0.02, 0.46, 0.28],
      sigma: 0.85,
      thresh: 0.3,
      contrast: 0.014,
      rdp: 0.7,
      minLen: 0.03,
      keep: 26,
    },
  },
]

/* ==================================================================== *
 * The tracer. Runs inside Chrome, because Chrome is the image decoder.
 * ==================================================================== */
async function trace(page, cfg) {
  const bytes = await readFile(path.join(root, cfg.src))
  const ext = path.extname(cfg.src).slice(1).toLowerCase()
  const dataUrl = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${bytes.toString('base64')}`

  return page.evaluate(
    async ({ dataUrl, cfg }) => {
      const img = new Image()
      img.src = dataUrl
      await img.decode()

      /* ---------- crop and downsample ---------- */
      const [cx, cy, cw, ch] = cfg.crop
      const sx = Math.round(img.width * cx)
      const sy = Math.round(img.height * cy)
      const sw = Math.round(img.width * cw)
      const sh = Math.round(img.height * ch)

      const W = cfg.work
      const H = Math.max(1, Math.round((sh / sw) * W))
      const cv = document.createElement('canvas')
      cv.width = W
      cv.height = H
      const c = cv.getContext('2d')
      c.drawImage(img, sx, sy, sw, sh, 0, 0, W, H)
      const px = c.getImageData(0, 0, W, H).data

      const N = W * H
      const lum = new Float32Array(N)
      for (let i = 0; i < N; i++) {
        lum[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255
      }

      /* ---------- normalise exposure (2nd…98th percentile) ---------- */
      {
        const hist = new Int32Array(256)
        for (let i = 0; i < N; i++) hist[Math.min(255, Math.max(0, Math.round(lum[i] * 255)))]++
        let lo = 0
        let hi = 255
        let acc = 0
        for (let v = 0; v < 256; v++) {
          acc += hist[v]
          if (acc > N * 0.02) {
            lo = v / 255
            break
          }
        }
        acc = 0
        for (let v = 255; v >= 0; v--) {
          acc += hist[v]
          if (acc > N * 0.02) {
            hi = v / 255
            break
          }
        }
        const span = Math.max(0.02, hi - lo)
        for (let i = 0; i < N; i++) lum[i] = Math.min(1, Math.max(0, (lum[i] - lo) / span))
      }

      /* ---------- separable gaussian ---------- */
      const gauss = (a, sigma) => {
        const r = Math.max(1, Math.ceil(sigma * 3))
        const kern = new Float32Array(r * 2 + 1)
        let sum = 0
        for (let i = -r; i <= r; i++) {
          const v = Math.exp(-(i * i) / (2 * sigma * sigma))
          kern[i + r] = v
          sum += v
        }
        for (let i = 0; i < kern.length; i++) kern[i] /= sum

        const tmp = new Float32Array(N)
        const out = new Float32Array(N)
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            let v = 0
            for (let i = -r; i <= r; i++) {
              const xx = Math.min(W - 1, Math.max(0, x + i))
              v += a[y * W + xx] * kern[i + r]
            }
            tmp[y * W + x] = v
          }
        }
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            let v = 0
            for (let i = -r; i <= r; i++) {
              const yy = Math.min(H - 1, Math.max(0, y + i))
              v += tmp[yy * W + x] * kern[i + r]
            }
            out[y * W + x] = v
          }
        }
        return out
      }

      const idx = (x, y) => y * W + x
      const D8 = [-W, -W + 1, 1, W + 1, W, W - 1, -1, -W - 1]
      const diag = Math.hypot(W, H)

      const rdp = (pts, eps) => {
        if (pts.length < 3) return pts
        let maxD = 0
        let at = 0
        const [ax, ay] = pts[0]
        const [bx, by] = pts[pts.length - 1]
        const dx = bx - ax
        const dy = by - ay
        const len = Math.hypot(dx, dy) || 1e-6
        for (let i = 1; i < pts.length - 1; i++) {
          const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len
          if (d > maxD) {
            maxD = d
            at = i
          }
        }
        if (maxD <= eps) return [pts[0], pts[pts.length - 1]]
        return [...rdp(pts.slice(0, at + 1), eps).slice(0, -1), ...rdp(pts.slice(at), eps)]
      }

      /* ================================================================ *
       * One pass: tone → ink → skeleton → strokes, in pixel coordinates.
       * ================================================================ */
      const runPass = (P) => {
        const g1 = gauss(lum, P.sigma)
        const g2 = gauss(lum, P.sigma * 1.6)
        const E = new Float32Array(N)
        for (let i = 0; i < N; i++) E[i] = g1[i] - g2[i]

        let mean = 0
        for (let i = 0; i < N; i++) mean += E[i]
        mean /= N
        let variance = 0
        for (let i = 0; i < N; i++) variance += (E[i] - mean) * (E[i] - mean)
        const sd = Math.sqrt(variance / N) || 1e-6

        /* local contrast, as a noise gate */
        const sq = new Float32Array(N)
        for (let i = 0; i < N; i++) sq[i] = lum[i] * lum[i]
        const mA = gauss(lum, P.sigma * 2.2)
        const mB = gauss(sq, P.sigma * 2.2)

        const ink = new Uint8Array(N)
        const cut = -P.thresh * sd
        for (let i = 0; i < N; i++) {
          if (E[i] >= cut) continue
          const local = Math.sqrt(Math.max(0, mB[i] - mA[i] * mA[i]))
          if (local > P.contrast) ink[i] = 1
        }

        /* the box this pass is allowed to work in */
        const bx0 = P.box ? Math.round(P.box[0] * W) : 0
        const by0 = P.box ? Math.round(P.box[1] * H) : 0
        const bx1 = P.box ? Math.round((P.box[0] + P.box[2]) * W) : W
        const by1 = P.box ? Math.round((P.box[1] + P.box[3]) * H) : H
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            // never ink the outermost ring or outside the box: either traces
            // as a rectangle, which is the one shape a sketch must not have
            if (x < Math.max(1, bx0) || x >= Math.min(W - 1, bx1)) ink[idx(x, y)] = 0
            else if (y < Math.max(1, by0) || y >= Math.min(H - 1, by1)) ink[idx(x, y)] = 0
          }

        /* …and the boxes it is not.
           This exists for one specific and very visible failure. A long
           architectural edge behind the subject — a marquee, a tent seam, a
           wall line — is often the LONGEST edge in the frame, so it sorts to
           the front, and the first mark of the drawing, at the heaviest
           weight, is a horizontal line across the background. The film draws
           these longest-first on purpose, so the fix has to be to not trace
           the thing at all. */
        for (const [ex, ey, ew, eh] of P.exclude ?? []) {
          const x0e = Math.round(ex * W)
          const y0e = Math.round(ey * H)
          const x1e = Math.round((ex + ew) * W)
          const y1e = Math.round((ey + eh) * H)
          for (let y = Math.max(0, y0e); y < Math.min(H, y1e); y++)
            for (let x = Math.max(0, x0e); x < Math.min(W, x1e); x++) ink[idx(x, y)] = 0
        }

        /* ---------- Zhang–Suen thinning ---------- */
        const nbr = (a, x, y) => [
          a[idx(x, y - 1)], // P2  N
          a[idx(x + 1, y - 1)], // P3  NE
          a[idx(x + 1, y)], // P4  E
          a[idx(x + 1, y + 1)], // P5  SE
          a[idx(x, y + 1)], // P6  S
          a[idx(x - 1, y + 1)], // P7  SW
          a[idx(x - 1, y)], // P8  W
          a[idx(x - 1, y - 1)], // P9  NW
        ]
        for (let pass = 0; pass < 40; pass++) {
          let removed = 0
          for (const step of [0, 1]) {
            const kill = []
            for (let y = 1; y < H - 1; y++) {
              for (let x = 1; x < W - 1; x++) {
                if (!ink[idx(x, y)]) continue
                const p = nbr(ink, x, y)
                let B = 0
                for (const v of p) B += v
                if (B < 2 || B > 6) continue
                let A = 0
                for (let i = 0; i < 8; i++) if (p[i] === 0 && p[(i + 1) % 8] === 1) A++
                if (A !== 1) continue
                const P2 = p[0]
                const P4 = p[2]
                const P6 = p[4]
                const P8 = p[6]
                if (step === 0) {
                  if (P2 * P4 * P6 !== 0 || P4 * P6 * P8 !== 0) continue
                } else {
                  if (P2 * P4 * P8 !== 0 || P2 * P6 * P8 !== 0) continue
                }
                kill.push(idx(x, y))
              }
            }
            for (const i of kill) ink[i] = 0
            removed += kill.length
          }
          if (!removed) break
        }

        /* ---------- degree, and despeckle ---------- */
        const degree = new Uint8Array(N)
        for (let y = 1; y < H - 1; y++)
          for (let x = 1; x < W - 1; x++) {
            const i = idx(x, y)
            if (!ink[i]) continue
            let n = 0
            for (const d of D8) if (ink[i + d]) n++
            degree[i] = n
          }
        for (let i = 0; i < N; i++) if (ink[i] && degree[i] === 0) ink[i] = 0

        /* ---------- trace the skeleton ----------
           Each pixel-to-pixel step is walked once.

           THE ONE THING THAT MATTERS HERE: what the walk does at a junction.
           The obvious rule — stop — is wrong, and produces exactly the failure
           this tool was written to fix. An edge map of a face is a thicket of
           little T-joins where an eyelash meets a lid or a hair crosses a
           temple, so stopping at each one chops the jaw into eleven
           three-pixel dashes, they all fall under the length filter, and
           thirteen strokes survive out of three thousand. Instead the walk
           CARRIES ON along whichever untravelled branch best continues the
           direction it was already going, and only gives up when the only way
           on is a hairpin. That is also what a hand does: the pen follows the
           line it is on and ignores what crosses it. */
        const seen = new Set()
        const ekey = (a, b) => (a < b ? a * N + b : b * N + a)
        const dirOf = (a, b) => {
          const dx = (b % W) - (a % W)
          const dy = Math.floor(b / W) - Math.floor(a / W)
          const l = Math.hypot(dx, dy) || 1
          return [dx / l, dy / l]
        }
        /** cos of the sharpest turn a stroke may take through a junction (~72°) */
        const KEEP_GOING = 0.31

        const stepFrom = (cur, prev) => {
          let best = -1
          let bestDot = -2
          const [pxd, pyd] = prev >= 0 ? dirOf(prev, cur) : [0, 0]
          for (const d of D8) {
            const j = cur + d
            if (j < 0 || j >= N || !ink[j]) continue
            if (seen.has(ekey(cur, j))) continue
            if (prev < 0) return j
            const [qx, qy] = dirOf(cur, j)
            const dot = pxd * qx + pyd * qy
            if (dot > bestDot) {
              bestDot = dot
              best = j
            }
          }
          if (prev >= 0 && bestDot < KEEP_GOING) return -1
          return best
        }

        const walk = (start, first) => {
          const pts = [start, first]
          let prev = start
          let cur = first
          seen.add(ekey(start, first))
          for (;;) {
            const next = stepFrom(cur, prev)
            if (next < 0) break
            seen.add(ekey(cur, next))
            pts.push(next)
            prev = cur
            cur = next
          }
          return pts
        }

        const raw = []
        // endpoints first, then junctions, then whatever is left (closed loops)
        for (const wantDeg of [1, 3, 2]) {
          for (let i = 0; i < N; i++) {
            if (!ink[i]) continue
            const d = degree[i]
            if (wantDeg === 1 && d !== 1) continue
            if (wantDeg === 3 && d < 3) continue
            if (wantDeg === 2 && d !== 2) continue
            for (;;) {
              const j = stepFrom(i, -1)
              if (j < 0) break
              raw.push(walk(i, j))
            }
          }
        }

        const measured = raw
          .map((line) => line.map((i) => [i % W, Math.floor(i / W)]))
          .map((line) => rdp(line, P.rdp))
          .map((line) => {
            let len = 0
            for (let i = 1; i < line.length; i++) {
              len += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1])
            }
            return { line, len }
          })
          .filter((s) => s.line.length > 1 && s.len / diag > P.minLen)
          .sort((a, b) => b.len - a.len)
          .slice(0, P.keep)

        return { measured, found: raw.length }
      }

      const structure = runPass(cfg)
      const detail = cfg.detail ? runPass({ ...cfg, ...cfg.detail }) : { measured: [], found: 0 }

      /* Longest first across BOTH passes, which is the drawing order. The face
         detail sorts itself to the end for free — it is short by definition. */
      const measured = [...structure.measured, ...detail.measured].sort((a, b) => b.len - a.len)

      /* ---------- normalise into the unit box ----------
         y runs 0…1 and x is centred on 0.5 at the true aspect, so the act can
         hand this any rectangle and the drawing keeps its proportions. */
      let x0 = Infinity
      let y0 = Infinity
      let x1 = -Infinity
      let y1 = -Infinity
      for (const s of measured)
        for (const [x, y] of s.line) {
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
      const bw = Math.max(1e-6, x1 - x0)
      const bh = Math.max(1e-6, y1 - y0)
      const scale = 1 / bh
      const aspect = bw / bh

      const strokes = measured.map((s, i) => ({
        // longest first, heaviest first: the marks that carry the likeness
        // arrive first, and they arrive with weight
        w: i === 0 ? 1.5 : i < 4 ? 1.3 : i < 12 ? 1.05 : i < 26 ? 0.85 : 0.7,
        c: s.line.map(([x, y]) => [
          Number((0.5 + (x - (x0 + x1) / 2) * scale).toFixed(3)),
          Number(((y - y0) * scale).toFixed(3)),
        ]),
      }))

      /* ---------- the grayscale crop, for the preview ---------- */
      const gray = document.createElement('canvas')
      gray.width = W
      gray.height = H
      const gc = gray.getContext('2d')
      const gi = gc.createImageData(W, H)
      for (let i = 0; i < N; i++) {
        const v = Math.round(lum[i] * 255)
        gi.data[i * 4] = v
        gi.data[i * 4 + 1] = v
        gi.data[i * 4 + 2] = v
        gi.data[i * 4 + 3] = 255
      }
      gc.putImageData(gi, 0, 0)

      let points = 0
      for (const s of strokes) points += s.c.length

      return {
        strokes,
        aspect: Number(aspect.toFixed(4)),
        W,
        H,
        found: structure.found + detail.found,
        detail: detail.measured.length,
        points,
        source: gray.toDataURL(),
      }
    },
    { dataUrl, cfg },
  )
}

/* ==================================================================== *
 * Output
 * ==================================================================== */

function moduleSource(cfg, result) {
  const body = result.strokes
    .map((s) => `  { w: ${s.w}, c: [${s.c.map(([x, y]) => `[${x},${y}]`).join(',')}] },`)
    .join('\n')

  return `/**
 * ${cfg.name} — traced from ${path.basename(cfg.src)} by tools/sketch.mjs.
 *
 * GENERATED. Re-run \`npm run sketch ${cfg.name}\` to change it; the crop and
 * the tuning live in tools/sketch.mjs, which is the only place they should.
 *
 * ${result.strokes.length} strokes, ${result.points} points, drawn longest first.
 * Coordinates: y runs 0…1, x is centred on 0.5 at aspect ${result.aspect}.
 */

import type { SketchData } from '../sketch'

export const ${cfg.name.toUpperCase()}: SketchData = {
  aspect: ${result.aspect},
  strokes: [
${body}
  ],
}
`
}

/* ==================================================================== *
 * Run
 * ==================================================================== */

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const chosen = only.length ? SKETCHES.filter((s) => only.includes(s.name)) : SKETCHES
if (!chosen.length) {
  console.error(`no such sketch. known: ${SKETCHES.map((s) => s.name).join(', ')}`)
  process.exit(1)
}

await mkdir(path.join(root, 'shots'), { recursive: true })
await mkdir(path.join(root, 'src/film/sketches'), { recursive: true })

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } })
page.on('pageerror', (e) => console.error('page error:', e.message))

for (const cfg of chosen) {
  const result = await trace(page, cfg)
  console.log(
    `${cfg.name.padEnd(9)} ${String(result.found).padStart(5)} traced → ` +
      `${String(result.strokes.length).padStart(3)} strokes ` +
      `(${String(result.detail).padStart(2)} detail), ${String(result.points).padStart(4)} points, ` +
      `aspect ${result.aspect}`,
  )

  /* preview: the crop it was given, next to the lines that came out */
  const PW = 540
  const PH = Math.round(PW / result.aspect)
  await page.setContent(`<body style="margin:0;background:#0A1418">
    <canvas id="p" width="${PW * 2 + 24}" height="${PH}"></canvas>
    <script>
    ;(() => {
      const S = ${JSON.stringify(result.strokes)}
      const cv = document.getElementById('p')
      const c = cv.getContext('2d')
      c.fillStyle = '#0A1418'; c.fillRect(0, 0, cv.width, cv.height)
      const img = new Image()
      img.onload = () => {
        c.globalAlpha = 0.85
        c.drawImage(img, 0, 0, ${PW}, ${PH})
        c.globalAlpha = 1
        c.strokeStyle = '#E9E4D6'; c.lineCap = 'round'; c.lineJoin = 'round'
        const ox = ${PW + 24}
        for (const s of S) {
          c.lineWidth = s.w * 1.5
          c.beginPath()
          s.c.forEach(([x, y], i) => {
            const px = ox + (x - 0.5) * ${PH} + ${PW / 2}, py = y * ${PH}
            i ? c.lineTo(px, py) : c.moveTo(px, py)
          })
          c.stroke()
        }
        document.body.dataset.done = '1'
      }
      img.src = ${JSON.stringify(result.source)}
    })()
    </script>
  </body>`)
  await page.waitForSelector('body[data-done="1"]', { timeout: 5000 }).catch(() => {})
  await page.locator('#p').screenshot({ path: path.join(root, `shots/sketch-${cfg.name}.png`) })
  console.log(`          → shots/sketch-${cfg.name}.png`)

  await writeFile(
    path.join(root, `src/film/sketches/${cfg.name}.ts`),
    moduleSource(cfg, result),
    'utf8',
  )
}

await browser.close()

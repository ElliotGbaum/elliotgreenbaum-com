/**
 * Dev-only contact sheet for the four drawings.
 *
 * `npm run sketch` shoots this. It shows each drawing part-way and finished,
 * because the half-drawn state is the one the film spends most of its time in
 * and it is the one that goes wrong: a stroke order that looks fine at 100%
 * can spend two seconds looking like a hand with no arm.
 *
 * Not shipped. Safe to delete along with sketches.html.
 *
 *   ?only=guitar   one drawing, big
 *   ?w=420         cell width
 */

import { PALETTE } from './core/contract'
import type { SketchData } from './film/sketch'
import { drawSketch, prepare } from './film/sketch'
import { PORTRAIT } from './film/sketches/portrait'
import { CHESS } from './film/sketches/chess'
import { GUITAR } from './film/sketches/guitar'
import { SAX } from './film/sketches/sax'
import { DESK } from './film/sketches/desk'

const SHEET: ReadonlyArray<readonly [string, SketchData]> = [
  ['portrait', PORTRAIT],
  ['chess', CHESS],
  ['guitar', GUITAR],
  ['sax', SAX],
  ['desk', DESK],
]

const params = new URLSearchParams(location.search)
const only = params.get('only')
const chosen = only ? SHEET.filter(([n]) => n === only) : SHEET
const STEPS = only ? [0.35, 0.7, 1] : [0.4, 0.75, 1]
const W = Math.max(160, Number(params.get('w') ?? (only ? 520 : 340)))

const root = document.getElementById('sheet') as HTMLDivElement
const dpr = Math.min(window.devicePixelRatio || 1, 2)

for (const [name, data] of chosen) {
  const s = prepare(data)
  const section = document.createElement('section')
  const h = document.createElement('h2')
  const pts = data.strokes.reduce((n, k) => n + k.c.length, 0)
  h.textContent = `${name} · aspect ${data.aspect} · ${data.strokes.length} strokes · ${pts} points`
  section.appendChild(h)

  const row = document.createElement('div')
  row.className = 'row'

  for (const p of STEPS) {
    const cv = document.createElement('canvas')
    const H = Math.round(W / Math.max(0.62, data.aspect))
    cv.width = Math.round(W * dpr)
    cv.height = Math.round(H * dpr)
    cv.style.width = `${W}px`
    cv.style.height = `${H}px`
    const ctx = cv.getContext('2d')
    if (!ctx) continue
    ctx.scale(dpr, dpr)

    // the film's own hairline, scaled the way an act would scale it
    const hair = Math.max(1, H / 300)
    const pad = W * 0.05
    drawSketch(ctx, s, { x: pad, y: pad, w: W - pad * 2, h: H - pad * 2 }, p, {
      alpha: 1,
      hair,
      color: PALETTE.buffCss,
    })

    const fig = document.createElement('figure')
    fig.appendChild(cv)
    const cap = document.createElement('figcaption')
    cap.textContent = `${Math.round(p * 100)}%`
    fig.appendChild(cap)
    row.appendChild(fig)
  }

  section.appendChild(row)
  root.appendChild(section)
}

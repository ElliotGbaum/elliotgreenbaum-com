/**
 * Dev-only contact sheet: every act sampled across its runtime, in a grid.
 *
 * Reviewing a 77-second film by watching it is a 77-second feedback loop and
 * you still miss the half-second dips between beats — which is exactly the
 * bug it was built to catch. This renders the whole thing as stills in one
 * screenshot. Not shipped; safe to delete.
 *
 * ?samples=8   how many frames per act
 * ?act=3       show only one act, sampled densely
 */

import type { Act } from './core/contract'
import { act0 } from './film/acts/act0'
import { act1 } from './film/acts/act1'
import { act2 } from './film/acts/act2'
import { act3 } from './film/acts/act3'
import { act4 } from './film/acts/act4'
import { act5 } from './film/acts/act5'
import { act6 } from './film/acts/act6'
import { act7 } from './film/acts/act7'
import { act8 } from './film/acts/act8'
import { act9 } from './film/acts/act9'
import { act10 } from './film/acts/act10'
import { act11 } from './film/acts/act11'
import { digest } from './film/acts/digest'

const ACTS: Act[] = [
  act0,
  act1,
  act2,
  act3,
  act4,
  act5,
  act6,
  act7,
  act8,
  act9,
  act10,
  act11,
]

const params = new URLSearchParams(location.search)
const samples = Math.max(2, Number(params.get('samples') ?? 7))
const only = params.get('act')

const root = document.getElementById('strip') as HTMLDivElement
// ?w= to review at something nearer the real 1280-wide picture; the default is
// contact-sheet size, which is deliberately the harshest legibility test
const W = Math.max(240, Number(params.get('w') ?? 384))
const H = Math.round((W * 9) / 16)
const dpr = Math.min(window.devicePixelRatio || 1, 2)

/* `?act=3` for an act, `?act=digest` for the TL;DR card — which is not in the
   film and so is never on the default sheet, but is drawn by the same kit and
   is the one frame most worth checking at contact-sheet size. */
const chosen = only
  ? [...ACTS, digest].filter((a) => a.id === `act${only}` || a.id === only)
  : ACTS

// cumulative start time, so labels show the position in the finished film
let clock = 0
const starts = new Map<string, number>()
for (const a of ACTS) {
  starts.set(a.id, clock)
  clock += a.duration
}

for (const act of chosen) {
  const section = document.createElement('section')
  const h = document.createElement('h2')
  h.textContent = `${act.id} · ${act.duration}s · starts ${starts.get(act.id)}s`
  section.appendChild(h)

  const row = document.createElement('div')
  row.className = 'row'

  for (let i = 0; i < samples; i++) {
    // bias samples toward beat boundaries by sampling inclusive of both ends
    const p = i / (samples - 1)
    const t = p * act.duration

    const cell = document.createElement('figure')
    const cv = document.createElement('canvas')
    cv.width = W * dpr
    cv.height = H * dpr
    cv.style.width = `${W}px`
    cv.style.height = `${H}px`
    const ctx = cv.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    try {
      act.draw({ ctx, w: W, h: H, p, t, reduced: false })
    } catch (err) {
      ctx.fillStyle = '#D9645A'
      ctx.font = '12px monospace'
      ctx.fillText(`ERROR: ${(err as Error).message}`.slice(0, 60), 8, 20)
      console.error(act.id, t, err)
    }

    const cap = document.createElement('figcaption')
    cap.textContent = `t=${t.toFixed(1)}s`
    cell.append(cv, cap)
    row.appendChild(cell)
  }

  section.appendChild(row)
  root.appendChild(section)
}

console.log(`filmstrip: ${chosen.length} act(s), total runtime ${clock}s`)

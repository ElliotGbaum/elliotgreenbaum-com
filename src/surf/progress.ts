/**
 * What the trainyard remembers between visits.
 *
 * The same shape and the same discipline as src/parkour/progress.ts — its own
 * key, memoised, and every path swallows the throw. It does NOT import that
 * file: the two games keep separate stores and the only thing they share is
 * the unlock flag, which lives in the parkour's record and is read by main.ts.
 * Copying thirty lines is cheaper than a dependency between two subsystems
 * that have no other reason to know about each other (house rule 7).
 *
 * localStorage can throw — Safari in private mode, storage disabled, a full
 * quota, a value some other tab corrupted. All of those get the same answer:
 * an in-memory copy that is correct for this session. Losing a high score is
 * not worth breaking the page over.
 *
 * WHY NOTHING IS IMPORTED HERE. §B's DAG gives this file no arrows at all, so
 * it cannot reach rng.ts — which is why the three live missions are chosen by
 * *rotation* rather than by a draw. `sets` is the cursor, the stride is 3 and
 * the pool is 7, which are coprime: you see every mission before you see one
 * twice, with no randomness to seed and nothing to persist beyond the number
 * of sets you have already finished. Deterministic, and it reads the same on
 * every device.
 */

const KEY = 'eg.surf.v1'

/**
 * Mirrors `HANDCAR_CAP` in sim.ts. It is duplicated rather than imported
 * because this file may import nothing — see the header. If sim.ts ever moves
 * it, this line moves with it; there is a checker assertion that the two agree.
 */
const HANDCAR_CAP = 3

/** how many missions are live at once. Three fits the panel and finishes. */
const LIVE = 3

export interface SurfProgress {
  /** best score, the number on the panel */
  best: number
  /** best distance in units, for the `best 0 m` line */
  bestDistance: number
  /** motes banked across all runs. The revive and the running start spend it. */
  bank: number
  runs: number
  /** completed mission sets → multBase is 1 + this */
  sets: number
  /** the three live missions, by id, with progress */
  missions: { id: string; at: number }[]
  /** letters of the weekly word collected so far */
  letters: string[]
  /** handcars in inventory, 0..HANDCAR_CAP */
  handcars: number
}

export interface Mission {
  readonly id: string
  readonly text: string // 'Collect 400 motes'
  readonly of: number
}

/**
 * How a mission's progress accrues.
 *
 * 'add'  — every run contributes. Grind missions: motes, jumps, near misses.
 * 'best' — the record stands, so a run is only progress if it beat the last.
 *          A "2000 units in one go" mission that summed across runs would be
 *          the motes mission again with a different sentence on it.
 */
type Accrual = 'add' | 'best'

interface MissionDef extends Mission {
  readonly how: Accrual
  readonly from: (r: RunRecord) => number
}

interface RunRecord {
  score: number
  distance: number
  motes: number
  nearMisses: number
  jumps: number
  roofUnits: number
  stumbled: boolean
  letters: string[]
}

/**
 * Seven, so a set of three never repeats a mission and the rotation takes
 * seven sets to come back round. The numbers are sized off a real run: a good
 * one banks 250–450 motes and covers 1800–2600 units, so a grind mission is
 * about two runs and a record mission is one good one.
 */
const DEFS: readonly MissionDef[] = [
  { id: 'motes', text: 'Collect 400 motes', of: 400, how: 'add', from: (r) => r.motes },
  { id: 'far', text: 'Run 2000 units in one go', of: 2000, how: 'best', from: (r) => r.distance },
  { id: 'close', text: 'Pass 20 carriages close', of: 20, how: 'add', from: (r) => r.nearMisses },
  { id: 'jump', text: 'Jump 60 times', of: 60, how: 'add', from: (r) => r.jumps },
  { id: 'roof', text: 'Ride 600 units of roof', of: 600, how: 'add', from: (r) => r.roofUnits },
  { id: 'clean', text: 'Finish a run without stumbling', of: 1, how: 'add', from: (r) => (r.stumbled ? 0 : 1) },
  { id: 'score', text: 'Score 20000 in one run', of: 20000, how: 'best', from: (r) => r.score },
]

export const MISSIONS: readonly Mission[] = DEFS

const defOf = (id: string): MissionDef | undefined => DEFS.find((d) => d.id === id)

/** the three that are live after `sets` completed sets. See the header. */
function setAt(sets: number): { id: string; at: number }[] {
  const out: { id: string; at: number }[] = []
  const start = ((sets * LIVE) % DEFS.length + DEFS.length) % DEFS.length
  for (let i = 0; i < LIVE; i++) out.push({ id: DEFS[(start + i) % DEFS.length]!.id, at: 0 })
  return out
}

const empty = (): SurfProgress => ({
  best: 0,
  bestDistance: 0,
  bank: 0,
  runs: 0,
  sets: 0,
  missions: setAt(0),
  letters: [],
  handcars: 0,
})

/** a finite, non-negative integer, or the fallback. Anything else in the store
 *  is somebody else's bug and must not become ours. */
const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

let memory: SurfProgress | null = null

export function loadSurf(): SurfProgress {
  if (memory) return memory
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<SurfProgress>
      const sets = num(p.sets)
      /* The live set is REBUILT from `sets` rather than trusted, and only the
         progress numbers survive. A record written by an older build — or by
         hand — can name a mission that no longer exists, and a panel row with
         no text on it is worse than a mission you have to start again. */
      const saved = Array.isArray(p.missions) ? p.missions : []
      const missions = setAt(sets).map((m) => {
        const was = saved.find((s) => s && typeof s === 'object' && s.id === m.id)
        return { id: m.id, at: was ? num(was.at) : 0 }
      })
      memory = {
        best: num(p.best),
        bestDistance: num(p.bestDistance),
        bank: num(p.bank),
        runs: num(p.runs),
        sets,
        missions,
        letters: strings(p.letters),
        handcars: Math.min(HANDCAR_CAP, num(p.handcars)),
      }
      return memory
    }
  } catch {
    /* private mode, or a quota, or a value that is not JSON — same answer */
  }
  memory = empty()
  return memory
}

export function saveSurf(p: SurfProgress): void {
  memory = p
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* the in-memory copy above is still correct for this session */
  }
}

/**
 * Fold one finished run in and persist.
 *
 * Handcars are earned here rather than in the sim because both triggers are
 * about the record, not the run: one per 500 motes the *bank* crosses, and one
 * per 1000 units survived in the run. Computing the bank ones from the
 * before/after thresholds means no extra counter to persist and no way for a
 * corrupted record to award a hundred of them.
 */
export function recordRun(r: RunRecord): {
  progress: SurfProgress
  newBest: boolean
  setsCompleted: number
} {
  const p = loadSurf()
  const score = num(r.score)
  const distance = num(r.distance)
  const motes = num(r.motes)

  const newBest = score > p.best
  if (newBest) p.best = score
  if (distance > p.bestDistance) p.bestDistance = distance
  p.runs++

  const bankBefore = p.bank
  p.bank = bankBefore + motes
  const earned =
    Math.floor(p.bank / 500) - Math.floor(bankBefore / 500) + Math.floor(distance / 1000)
  if (earned > 0) p.handcars = Math.min(HANDCAR_CAP, p.handcars + earned)

  for (const g of r.letters) if (typeof g === 'string' && g && !p.letters.includes(g)) p.letters.push(g)

  for (const m of p.missions) {
    const def = defOf(m.id)
    if (!def) continue
    const got = Math.max(0, Math.floor(def.from(r)))
    m.at = def.how === 'add' ? Math.min(def.of, m.at + got) : Math.max(m.at, Math.min(def.of, got))
  }

  /* A set completes all at once, which is the point of a set: three small
     things you were doing anyway, and then the multiplier's floor goes up for
     good and stays up. At most one set can complete per run — a fresh set
     starts empty and this run has already been counted into the old one — so
     this is an `if` and `setsCompleted` is 0 or 1. It is a count rather than a
     boolean because §C.9 says so and because a future set of three one-run
     missions could plausibly need more. */
  let setsCompleted = 0
  const done = p.missions.every((m) => {
    const def = defOf(m.id)
    return def ? m.at >= def.of : true
  })
  if (done) {
    p.sets++
    setsCompleted = 1
    p.missions = setAt(p.sets)
  }

  saveSurf(p)
  return { progress: p, newBest, setsCompleted }
}

/** spend from the bank. Returns false and changes nothing if it cannot pay. */
export function spend(n: number): boolean {
  const p = loadSurf()
  const cost = Math.max(0, Math.floor(n))
  if (p.bank < cost) return false
  p.bank -= cost
  saveSurf(p)
  return true
}

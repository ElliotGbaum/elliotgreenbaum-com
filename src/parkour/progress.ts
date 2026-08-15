/**
 * What the game remembers between visits.
 *
 * Three things, and no more: whether the film has been watched (which is what
 * opens the gate), which courses have been finished, and the best time on each.
 * A level you unlocked yesterday should still be unlocked today — that is what
 * unlocking means — and nobody should have to sit through the film again to
 * get back to a course they were most of the way through.
 *
 * localStorage can throw: Safari in private mode, storage disabled, a full
 * quota. Every path here swallows that and carries on with an in-memory copy,
 * because losing your best time is not worth breaking the page over.
 */

const KEY = 'eg.parkour.v1'

export interface Progress {
  /** the film has been watched at least once */
  unlocked: boolean
  /** level ids finished, in the order they were first finished */
  cleared: string[]
  /** best time in seconds, by level id */
  best: Record<string, number>
}

const empty = (): Progress => ({ unlocked: false, cleared: [], best: {} })

let memory: Progress | null = null

export function loadProgress(): Progress {
  if (memory) return memory
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Progress>
      memory = {
        unlocked: parsed.unlocked === true,
        cleared: Array.isArray(parsed.cleared) ? parsed.cleared.filter((x) => typeof x === 'string') : [],
        best: parsed.best && typeof parsed.best === 'object' ? parsed.best : {},
      }
      return memory
    }
  } catch {
    /* private mode, or a quota, or a corrupted value — all the same answer */
  }
  memory = empty()
  return memory
}

export function saveProgress(p: Progress): void {
  memory = p
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* the in-memory copy above is still correct for this session */
  }
}

/** called when the film finishes. Idempotent. */
export function markUnlocked(): void {
  const p = loadProgress()
  if (p.unlocked) return
  p.unlocked = true
  saveProgress(p)
}

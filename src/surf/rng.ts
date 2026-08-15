/**
 * The one source of randomness in the trainyard.
 *
 * Everything in src/surf/ that needs a number it did not compute asks this
 * file for it, and this file is a seeded xorshift32 — same seed, same run,
 * every time, forever. That is not a nicety. It is the whole reason
 * `npm run surf:check` can walk two hundred seeds of track and *prove* things
 * about the generator: if the track were drawn from Math.random there would be
 * nothing to assert, only something to hope.
 *
 * WRONG TURN, DO NOT RETAKE: `contract.rand(i)` is already in the house and it
 * is tempting. It is an index hash — `rand(3)` is the same number in every
 * session and in every subsystem — which is exactly right for jittering the
 * ballast under a sleeper and exactly wrong for a stream, because consecutive
 * indices are visibly correlated and the "sequence" repeats between two runs
 * that happen to draw at the same index. Use `rand()` for decoration in
 * props.ts. Use this for anything the game reads back.
 *
 * xorshift32 rather than a fancier generator because the properties we need
 * are: cheap (this is called in the write path, a few hundred times per chunk),
 * seedable from one 32-bit integer, and long enough not to loop inside a run.
 * Its period is 2^32 − 1, which at a few thousand draws a minute is four
 * thousand years. The low bits of a bare xorshift are the weak ones, so
 * `float()` takes the top 24 by unsigned-shifting rather than masking — that
 * one line is the difference between an even distribution and a subtly striped
 * one you would only find by plotting it.
 */

export interface Rng {
  /** raw 32-bit unsigned */
  next(): number
  /** [0, 1) */
  float(): number
  /** integer in [0, n) */
  int(n: number): number
  /** float in [lo, hi) */
  range(lo: number, hi: number): number
  /** true with probability p */
  chance(p: number): boolean
  /** Fisher-Yates, in place, returns the same array */
  shuffle<T>(a: T[]): T[]
  /** uniform pick */
  pick<T>(a: readonly T[]): T
  /** current state, so a run can be resumed or replayed */
  readonly state: number
}

/**
 * Seed 0 is the one state xorshift cannot leave — it maps to itself and the
 * generator returns zero forever. Rather than refuse the seed (a caller who
 * passes 0 gets a silently dead game, which is the worst possible failure) we
 * scramble it first, so every 32-bit input including 0 lands somewhere alive.
 */
export function createRng(seed: number): Rng {
  // one round of a mix constant, then a guard, so the first few draws off a
  // small seed (1, 2, 3 — exactly what a test writes) are not near-identical.
  let s = (seed | 0) ^ 0x9e3779b9
  s = (Math.imul(s ^ (s >>> 16), 0x45d9f3b) | 0) >>> 0
  if (s === 0) s = 0x1a2b3c4d

  const rng: Rng = {
    next() {
      // xorshift32, Marsaglia's 13/17/5 triple
      s ^= s << 13
      s >>>= 0
      s ^= s >>> 17
      s ^= s << 5
      s >>>= 0
      return s
    },
    float() {
      // top 24 bits over 2^24. The low bits of xorshift are the poor ones and
      // `next() / 2^32` hands them straight to the caller.
      return (rng.next() >>> 8) / 0x1000000
    },
    int(n) {
      if (n <= 1) return 0
      return (rng.float() * n) | 0
    },
    range(lo, hi) {
      return lo + rng.float() * (hi - lo)
    },
    chance(p) {
      // `<` and not `<=`, so chance(0) is never true
      return rng.float() < p
    },
    shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) {
        const j = rng.int(i + 1)
        const t = a[i] as (typeof a)[number]
        a[i] = a[j] as (typeof a)[number]
        a[j] = t
      }
      return a
    },
    pick(a) {
      return a[rng.int(a.length)] as (typeof a)[number]
    },
    get state() {
      return s
    },
  }
  return rng
}

/**
 * A seed for a fresh run.
 *
 * THIS IS THE ONLY NON-DETERMINISTIC NUMBER IN src/surf/, it enters exactly
 * once per run, and nothing downstream of it may reach for the clock again.
 * The mix is there because `Date.now()` changes in its *low* bits between two
 * runs a second apart, and an unmixed seed one apart produces two tracks whose
 * first chunk is recognisably the same — which a player notices immediately
 * after a fast retry, and which reads as "the generator is broken".
 */
export function seedFromTime(): number {
  const t = Date.now() >>> 0
  let s = Math.imul(t ^ (t >>> 15), 0x2c1b3c6d) | 0
  s = Math.imul(s ^ (s >>> 12), 0x297a2d39) | 0
  return (s ^ (s >>> 15)) >>> 0
}

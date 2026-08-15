/**
 * What a block *is*, as opposed to what it looks like.
 *
 * Split out from blocks.ts so that the physics, the courses and the headless
 * validator in tools/parkour-check.mjs can all know that ice is slippery
 * without any of them importing three.js. blocks.ts owns the pixels; this owns
 * the behaviour, and the block list itself lives here because everything else
 * keys off it.
 */

/** every block in the game, and the two properties that change how it plays */
export const BLOCK_META = {
  grass: {},
  dirt: {},
  stone: {},
  cobble: {},
  mossy: {},
  planks: {},
  log: {},
  leaves: {},
  sand: {},
  sandstone: {},
  quartz: {},
  obsidian: {},
  netherrack: {},
  glowstone: {},
  gold: {},
  emerald: {},
  diamond: {},
  redstone: {},
  endstone: {},
  purpur: {},
  bedrock: {},
  /**
   * The springboard. Vanilla's SlimeBlock#bounceUp reverses velocity in full
   * for a LivingEntity — 0.8 is the value for everything that is not a
   * creature, and using it made this a crash mat instead of a trampoline.
   * Slime's friction is 0.8, not the 0.6 everything else has.
   */
  slime: { alpha: 0.78, bounce: 1.0, slip: 0.8 },
  /** slipperiness 0.98 against everything else's 0.6 */
  ice: { alpha: 0.72, slip: 0.98 },
} as const satisfies Record<string, { alpha?: number; bounce?: number; slip?: number }>

export type BlockId = keyof typeof BLOCK_META

type Meta = { alpha?: number; bounce?: number; slip?: number }

export const slipOf = (id: BlockId): number => (BLOCK_META[id] as Meta).slip ?? 0.6
export const bounceOf = (id: BlockId): number => (BLOCK_META[id] as Meta).bounce ?? 0
export const alphaOf = (id: BlockId): number | undefined => (BLOCK_META[id] as Meta).alpha

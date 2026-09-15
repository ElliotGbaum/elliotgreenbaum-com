/**
 * The film's own colours: ink on a lit screen.
 *
 * The world's PALETTE (src/core/contract.ts) is dusk-blue with pale type,
 * and until 2026-09-15 the film borrowed it wholesale — a dark picture on a
 * screen that, by day, stood in the field as a pale board. The cut from a
 * cream screen to a near-black one the instant the lamp struck read as the
 * screen going *off*. So the picture is now the colour of the idle screen
 * (SCREEN_DAY in src/world/landmarks/projector.ts) and everything drawn on
 * it is ink. Every act reaches for these names and none for PALETTE; the
 * world's colours stay the world's.
 *
 * Names say what the colour is for, not what it looks like, because what it
 * looks like is exactly what changed.
 */
export const INK = {
  /** the screen itself — the same cream it is before the lamp strikes */
  screen: '#E4DFD1',
  /** the lit centre of the screen: `wash()` lifts toward this */
  wash: '#FBF6EA',

  /** primary type and line work */
  text: '#16211F',
  /** muted supporting text */
  muted: '#5A6863',

  /** the accent for anything emphasised: rules, hot letters, cursors */
  amber: '#B5741A',
  /** the accent pressed harder — darker, because on a light screen emphasis is weight, not light */
  amberLit: '#8C5A0C',
  /** the warm smudge behind a nib or a landing point; a halo, never a fill */
  glow: '#E9A93F',

  /** addresses and links: the palette's one cool colour */
  link: '#1C7A5F',
  /** …lit under the pointer */
  linkLit: '#0F5A44',
} as const

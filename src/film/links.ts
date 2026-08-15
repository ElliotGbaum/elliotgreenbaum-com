/**
 * The picture's clickable rectangles.
 *
 * The film is a texture on a screen thirty units away, so there is no anchor
 * tag to click. Instead an act publishes, in canvas pixels, the box it just
 * drew a link into; main.ts casts a ray at the screen, turns the hit into a UV,
 * turns the UV into canvas pixels, and looks the point up in `LINKS`.
 *
 * This lives in its own module rather than inside the card, because the card is
 * no longer the only act with something to click on — act 3 publishes a project
 * URL too. A leaf module with no imports is also the only shape that lets both
 * acts and the player reach it without an import cycle.
 *
 * Three rules for anything that publishes here:
 *   1. Publish the rect in the SAME frame you draw the text, from the same
 *      numbers. A hit box computed anywhere else drifts the moment the type is
 *      refitted for a new aspect ratio.
 *   2. Publish the alpha with it. A link that has not faded in yet is not
 *      clickable, or the picture is a minefield for the second before it
 *      appears.
 *   3. Never clear the list yourself. film.ts clears it once per painted frame,
 *      before the act draws, so a link can never outlive the picture that drew
 *      it — including when you seek out of an act.
 */

/** a hit box in canvas pixels, republished every frame the act draws */
export interface FilmLink {
  readonly href: string
  readonly label: string
  x: number
  y: number
  w: number
  h: number
  /** 0…1 — below 0.5 the link is still arriving and does not accept a click */
  alpha: number
}

/**
 * What is currently clickable on the picture. Empty except while an act that
 * publishes links is the act being painted.
 */
export const LINKS: FilmLink[] = []

/** film.ts, once per painted frame, before the act draws. Nobody else. */
export function clearLinks(): void {
  LINKS.length = 0
}

export function publishLink(link: FilmLink): void {
  LINKS.push(link)
}

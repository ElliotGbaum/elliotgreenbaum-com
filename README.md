# elliotgreenbaum.com

A dark field you walk through carrying a lantern. At the centre is a projector that needs your light; switch it on and a short film about Elliot plays on the screen while you stand there and watch it.


## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build into dist/
npm run preview  # serve the production build locally
```

## Checking it still works

```bash
npm run preview            # in one terminal
npm run verify             # in another — 54 checks, must be 54/54
```

`npm run verify` is the gate. It runs the publish checklist: the fallback
card is in the served HTML and no résumé is, the site works with JavaScript disabled and with WebGL
blocked, reduced-motion is honoured, everything is keyboard-operable with focus
trapped and returned, tap targets clear 44px at 375px, landmarks disarm after
use so the film can't loop, and the film's transport actually transports —
clicking the projector starts it, pause holds, the scrubber seeks, space runs it
at 2×, and the TL;DR button winds forward to the card and back out again.
**Do not ship on a red.**

Three more tools, all driving real Chrome on the real GPU:

```bash
npm run flow                # walk the whole site, screenshot every stage
npm run film                # the film as framed in the world, plus every control state
npm run filmstrip           # contact sheet: every act as stills, in one image
npm run sketch [name]       # contact sheet of the four drawings, part-way and done
npm run shoot -- <url> <outdir> [--only phone] [--no-webgl] [--full]
```

`filmstrip` and `film` answer different questions and neither can answer for the
other. **`filmstrip` reviews the picture:** every act sampled across its runtime
at full size, because watching the film is a two-minute feedback loop and you
still miss the half-second dips between beats. Each cell is 384×216, close to
the film's picture area on a phone — if it collides in the contact sheet, it
collides on a phone. **`film` reviews the shot:** the picture as it actually
arrives, mapped onto a screen thirty units away with the projector's silhouette
in front of it and the transport bar under it. Type that is perfect in the
contact sheet can still be unreadable in the shot, and vice versa.

---

## Editing content — start here

You should never need to touch TypeScript to change what the site says.

### The fallback card → `index.html`

Everything inside `<main class="card" id="card">` is the fallback: a name, one line, three links. That is the whole of it.

**There is no résumé on this site.** There used to be a full one in this block, and it meant the visitor the world could not serve got handed the least interesting version of the thing — bullets and dates — as if that were the point. It is deleted. The film the projector throws is the long version, and the card is the short one.

The card is what no-JS, no-WebGL, a dead bundle, a screen reader and every crawler get, so it has to stay real HTML in the first response. It does **not** grow back into a CV: `npm run verify` §1 asserts the absence and goes red if experience bullets, dated entries or the word "résumé" reappear in the markup. If the film is ever unreachable, fix the film.

Because there is no second place for detail to go, a number either earns a line in an act or does not ship at all.

**The TL;DR card is not a hole in this.** There is now one frame in the film that
is a page of bullets — press SKIP VIDEO, TLDR VERSION above the projector and the
reel winds forward to it. It is drawn on the canvas by `src/film/acts/digest.ts`,
it is reachable only from inside the film, and it is not in the served HTML, not
in the DOM, and not linked from anywhere. Verify §1 still asserts the absence and
still goes red if bullets or dated entries reappear in the markup, which is the
fence that was always the point: the visitor the world cannot serve gets a name
and three ways to reach him, not the least interesting version of the thing.
What the card changes is that a visitor who CAN be served but does not have two
minutes now gets a second answer, out of the same projector, in the film's own
type — instead of leaving.

### The film's words → `src/content/film.json`

One entry per act, plus one for the TL;DR card. Change the text, not the code.

Two keys in each entry do double duty and are worth knowing about:

- **`chapter`** — the section name on the scrubber, the way chapter markers work
  on a video player. Two or three words; it has to read at 11px and make sense
  out of context.
- **`caption`** — what a screen reader announces when the act begins. It is no
  longer printed anywhere: the subtitle strip under the picture is gone, because
  a line of browser text under a projector screen was the one element in the
  build that admitted this was a web page, and it repeated words the picture was
  already showing. The picture carries all of its own words now — which is also
  why every act's closing line has to be legible ON the screen. Keep the caption
  to one or two plain sentences; nobody sees it, somebody hears it.

The TL;DR card's copy is the **`digest`** entry: a heading, then sections of
bullets laid out in two columns in the order they appear there. Its "Next Steps"
foot is read straight off `act11` — the roles, the three addresses and the
invitation — so the film and the card can never end up offering two different
email addresses. Adding a bullet costs type size on every row rather than
running the last section off the bottom: the card measures itself and scales to
the frame (see the fitting pass in `src/film/acts/digest.ts`).

### Things to keep

- **"no client-reported quality loss"** — keep that hedge exactly. Never shorten it to "no quality loss."
- No customer names, no numbers, nothing that isn't already public. Naming Cassidy, E&B and EAS Advisors is fine.

---

## Structure

```
index.html            shell + the fallback card (name, one line, three links — no résumé)
src/
  main.ts             boot, the frame loop, proximity/activation
  core/contract.ts    palette, shared interfaces, easing helpers — the only shared import
  world/
    field.ts          ground, stars, fog, ambient
    scenery.ts        what is simply there: treeline, hills, sky dome, fireflies, daytime grass
    player.ts         you: a figure with a lantern, a walk cycle and damping
    camera.ts         lagging follow rig, and the lens for the watching shot
    landmarks/        projector.ts — the one interactive thing in the field
    filmstage.ts      the depth cues a few acts throw off the screen (3D / `d`)
  film/
    film.ts           the act list, the picture buffer, the transport
    controls.ts       the player chrome: chaptered scrubber, pause, 2×, 3D,
                      and the TL;DR button that floats above the projector
    timeline.ts       the drawing kit the acts share
    sketch.ts         line art, and the pen that draws it
    sketches/         the four drawings, by hand — kit.ts is what they are drawn with
    acts/             one file per act, each drawing to a 2D canvas
                      …plus digest.ts, the TL;DR card, which is NOT in ACTS —
                      the whole film on one slide, reached only by the button
  ui/
    hud.ts            compass, prompt line, key hint, time-of-day switch
  content/
    film.json
```

### Adding a landmark

`src/core/contract.ts` has the shape. A **`Landmark`** is something you can walk up to and use: geometry, an anchor, a radius, a prompt, and what `activate()` does — add it to the `landmarks` array in `main.ts`.

Scenery — an object that is simply *there* — had its own `Prop` type, and it went with the lit billboard that was the only one. If something comes back that can't be used, add the type back rather than giving a `Landmark` an empty `activate()`: everything that can be activated competes with the projector, and the projector is the point.

---

## House rules

- **The film plays in the world; the words are still HTML.** You watch from where you are standing, in third person, on a shot framed by `watchVantage()` in `projector.ts`. That only works because the shot is framed for it — change the camera, the screen height or the picture size and re-check the film is readable at 375px. The film's captions are announced to screen readers act by act; anyone the world cannot serve at all gets the card in `index.html`.
- **The figure is nobody.** No face, no hair, no clothing, no cue that reads as a gender, an age or a build. If you are tempted to add a detail, ask whether it describes a *person* or describes *walking*. Only the second kind belongs.
- **One thing to do, and the world says so unprompted.** No menu, no corner buttons, no second route to the same content. Three things carry the instruction and all three are checked by `npm run verify`: the standing line at the bottom of the screen, the compass naming the projector, and the plaque and floor rings on the machine itself. If you add chrome, ask what it is competing with.
- **Nothing half-finished ships.** Each milestone should look complete on its own.
- **375px is a hard requirement**, checked before a milestone ships rather than after.
- No `Math.random()` in anything that renders — use `rand()` from the contract so frames are reproducible.


---

## Shelved: the two minigames

There were two of them — five courses of Minecraft parkour east of the
projector, and an endless trainyard run west of it — each behind a sign that
built itself out of the ground once the film had been watched. **Neither is in
the world at the moment.** No sign, no ceremony, no compass label, no URL, and
nothing in the shipped bundle: the field is back to one thing to do.

Every line of both is still here and still typechecked. What was unwired:

| | |
|---|---|
| `src/parkour/`, `src/surf/` | the two worlds, untouched |
| `src/world/landmarks/gate.ts`, `signal.ts` | the two signs that opened them |
| `src/parkour/chrome.html`, `src/surf/chrome.html` | their DOM, lifted verbatim out of `index.html` |
| `tools/parkour-*.mjs`, `tools/surf-*.mjs`, `tools/signs.mjs` | their harnesses — see the note in `package.json` |

The wiring that came out of `src/main.ts` is listed at the top of that file, and
that list is the whole of what putting them back costs. CONTEXT §8 and PLAN §9
are the design record and still describe how the parkour works.

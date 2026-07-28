# elliotgreenbaum.com

A dark field you move through as a point of light. At the centre is a projector that needs your light; bring it and a short film about Elliot plays.

- **`PLAN.md`** — what we're building and in what order.
- **`CONTEXT.md`** — why it's built this way. Read this before changing anything structural.

---

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
npm run verify             # in another — 29 checks, must be 29/29
```

`npm run verify` is the gate. It runs the checklist from `PLAN.md`: the résumé is
in the served HTML, the site works with JavaScript disabled and with WebGL
blocked, reduced-motion is honoured, everything is keyboard-operable with focus
trapped and returned, tap targets clear 44px at 375px, and landmarks disarm after
use so the film can't loop. **Do not ship on a red.**

Two more tools, both driving real Chrome on the real GPU:

```bash
npm run flow                # walk the whole site, screenshot every stage
npm run filmstrip           # contact sheet: every act as stills, in one image
npm run shoot -- <url> <outdir> [--only phone] [--no-webgl] [--full]
```

The filmstrip is how the film gets reviewed. Watching it is a 94-second feedback
loop and you still miss the half-second dips between beats. Each cell is 384×216,
which is close to the film's real picture area on a phone in portrait — **if it
collides in the contact sheet, it collides on a phone.**

---

## Editing content — start here

You should never need to touch TypeScript to change what the site says.

### The résumé → `index.html`

Everything inside `<main class="plain" id="resume-source">` is the résumé. It's plain HTML with comments, and it is the **single source of truth**: the panel that opens inside the world clones this exact node, so editing it once updates both places.

It's also what gets served to anyone without JavaScript or WebGL, what search engines index, and what screen readers read. It is never allowed to fall out of date.

Anything marked `[like this]` needs your input.

### The film's words → `src/content/film.json`

One entry per act. Change the text, not the code.

### Things to keep

- **"no client-reported quality loss"** — keep that hedge exactly. Never shorten it to "no quality loss."
- No customer names, no numbers, nothing that isn't already public. Naming Cassidy and E&B is fine.

---

## Structure

```
index.html            shell + the plain résumé (the fallback and the source of truth)
src/
  main.ts             boot, the frame loop, proximity/activation
  core/contract.ts    palette, shared interfaces, easing helpers — the only shared import
  world/
    field.ts          ground, stars, fog, ambient
    player.ts         you: a point light with velocity and damping
    camera.ts         lagging follow rig
    landmarks/        projector.ts, sign.ts
  film/
    timeline.ts       act sequencing, skip, progress
    acts/             one file per act, each drawing to a 2D canvas
  ui/
    panel.ts places.ts hud.ts
  content/
    film.json
```

### Adding a landmark

Implement `Landmark` from `src/core/contract.ts` — geometry, an anchor, a radius, a prompt, and what `activate()` does — then add it to the `landmarks` array in `main.ts`. Nothing else needs to change.

---

## House rules

- **Screens are doorways, not containers.** Never render readable content inside 3D geometry at doll-house scale. The world does the theatre; real DOM does the reading.
- **The résumé is one click from anywhere, always.** The corner button is the most important control on screen after movement.
- **Nothing half-finished ships.** Each milestone should look complete on its own.
- **375px is a hard requirement**, checked before a milestone ships rather than after.
- No `Math.random()` in anything that renders — use `rand()` from the contract so frames are reproducible.

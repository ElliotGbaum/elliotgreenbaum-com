# elliotgreenbaum.com

My personal site. A dark field you walk through carrying a lantern. At the
centre is a projector that needs your light; switch it on and a short film
about me plays on the screen while you stand there and watch it.

**Live at [elliotgreenbaum.com](https://elliotgreenbaum.com).**

Built with TypeScript, [Three.js](https://threejs.org) and [Vite](https://vite.dev).
The film is drawn frame by frame on a 2D canvas and projected into the 3D
world. If WebGL or JavaScript is unavailable you get a plain HTML card instead.

## Running it locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build into dist/
```

`npm run og` re-renders the link preview (`public/og.png`) from a live
build — run it after anything that changes how the opening shot looks.

## Analytics

The site reports how it is used — where in the walk-to-the-projector-and-
watch funnel visitors drop off, how much of the film gets seen, what gets
clicked — through [PostHog](https://posthog.com). Nothing is sent unless
`VITE_POSTHOG_KEY` is set at build time (in Vercel: Settings → Environment
Variables; `VITE_POSTHOG_HOST` overrides the US cloud default). Do Not Track
and Global Privacy Control are honoured, there are no cookies, and nobody is
identified. The event list and what each one means is at the top of
`src/core/analytics.ts`.

Three switches on the URL: `?analytics=off` opts your own browser out for
good (so your edits do not count as traffic), `?analytics=on` reverses it, and
`?analytics=debug` prints every event to the console.

`npm run verify` runs the site's own checklist (accessibility, keyboard,
phone width, the film's transport) against a preview build in real Chrome.

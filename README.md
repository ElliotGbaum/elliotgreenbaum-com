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

### Knowing where a visitor came from

Every event carries a `source`. It is read off the address first and the
referrer second, and referrers are weak: the LinkedIn app and every PDF send
none, so a click from a résumé and a typed address both arrive as `direct`.
Tag the address wherever you hand it out and the question answers itself:

| Where the link lives          | Use                                        |
| ----------------------------- | ------------------------------------------ |
| the résumé PDF                | `elliotgreenbaum.com/?src=resume`          |
| the LinkedIn profile          | `elliotgreenbaum.com/?src=linkedin`        |
| the X bio                     | `elliotgreenbaum.com/?src=x`               |
| an email signature            | `elliotgreenbaum.com/?src=email`           |
| one application in particular | `elliotgreenbaum.com/?src=app-<company>`   |

In PostHog, break any chart down by `source` (this visit) or `first_source`
(how this browser first found the site). Standard `utm_*` parameters work
too, and `src` is stored as a campaign parameter alongside them.

### The film, in words

Everything the film says is also in the served HTML — folded under the
contact card as "The film, in words" — and at [`/llms.txt`](https://elliotgreenbaum.com/llms.txt),
so an assistant handed the address gets the story rather than a name and
three links. Both are generated from `src/content/film.json` at build time by
`tools/agent-layer.ts`; there is no second copy to keep in step.

`npm run verify` runs the site's own checklist (accessibility, keyboard,
phone width, the film's transport) against a preview build in real Chrome.

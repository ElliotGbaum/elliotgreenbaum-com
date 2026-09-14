# elliotgreenbaum.com

My personal site. A dark field you walk through carrying a lantern. At the
centre is a projector that needs your light; switch it on and a short film
about me plays on the screen while you stand there and watch it. Off to one
side stands a figure with my name over his head: walk up and you can ask him
anything. He is an AI that has been given my notes about myself, and he says
so before you type.

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

`npm run verify` runs the site's own checklist (accessibility, keyboard,
phone width, the film's transport, the conversation) against a preview build
in real Chrome.

## The conversation

The figure in the field answers through `POST /api/chat`, a Vercel function
(`api/chat.ts`) around `server/chat.ts`, which calls the Claude API with the
notes in `server/persona.ts` as its system prompt and streams the reply back.
`npm run dev` and `npm run preview` mount the same function at the same path
(see `vite.config.ts`), so it works locally exactly as deployed.

It needs one secret:

```bash
# .env (gitignored) for local runs; the same variable in Vercel's project
# settings for the deployed site
ANTHROPIC_API_KEY=sk-ant-...
# optional — the model, if not claude-opus-5
ELLIOT_MODEL=claude-sonnet-5
```

Without a key the world runs as before and the figure says he has lost his
voice and gives the real email, which is the intended failure.

He also knows a few things that are true right now. `GET /api/live`
(`api/live.ts` around `server/live.ts`) gathers them, the panel shows them
under its header, and the chat hands the same facts to the model, so what
you see and what he says agree. Each one is off until its variables exist,
and silently absent when it cannot be read:

```bash
# Spotify — the track playing now or last played, plus the last few and the
# month's top artists when you tap the line. Run once; it opens Spotify's
# consent page and writes both into .env; copy the same two into Vercel.
SPOTIFY_CLIENT_ID=<from developer.spotify.com/dashboard> node tools/spotify-auth.mjs

# GitHub — the last public push. No login; only public activity is read.
GITHUB_USER=ElliotGbaum          # default
GITHUB_TOKEN=github_pat_...      # optional, no permissions needed: lifts the rate limit

# Strava — miles run this month, since the 1st. Create an app at strava.com/settings/api
# (callback domain: localhost), then run once and copy the three into Vercel.
STRAVA_CLIENT_ID=... STRAVA_CLIENT_SECRET=... node tools/strava-auth.mjs

# WHOOP — this morning's recovery score. Create an app at developer-dashboard.whoop.com
# (redirect URL: https://localhost:8890/callback; scope: read:recovery), run once,
# copy the three into Vercel. WHOOP refresh tokens are single-use, so the deployed site
# keeps the rotated one in the Upstash store below — set that up first, and put the same
# two store values in .env so the dev server and the site share one token.
WHOOP_CLIENT_ID=... WHOOP_CLIENT_SECRET=... node tools/whoop-auth.mjs

# Calendly — the booking link, and with a token the next open slots.
CALENDLY_URL=https://calendly.com/<you>/<event>
CALENDLY_TOKEN=...               # optional: calendly.com → Integrations → API & Webhooks

# The week and the clock are in this zone (default America/New_York).
ELLIOT_ZONE=America/New_York

# Rate limiting for /api/chat counts in a shared store when one exists, and the
# WHOOP token lives there — a free Upstash Redis from the Vercel marketplace
# (Storage → Upstash for Redis → connect to the project) sets both of these.
# Without it each function instance counts on its own.
KV_REST_API_URL=...              # the names the Vercel integration writes;
KV_REST_API_TOKEN=...            # UPSTASH_REDIS_REST_URL/_TOKEN are read too
```

`vercel.json` sets the security headers, including a Content-Security-Policy
that allows the one inline script in `index.html` by hash. Edit that script
and the hash must change: `node tools/csp-hash.mjs` prints it, and `verify`
fails if `vercel.json` disagrees.

The login uses PKCE, so there is no client secret. Spotify gives the refresh
token 180 days for an app in development mode; when it stops working, run the
script again and replace the token in Vercel. Without the variables the line
is simply absent and the figure does not know. What he knows
is `server/persona.ts`; what the panel says on its own — the greeting, the
suggested questions, the standing note that every answer is generated — is
`src/content/talk.json`.

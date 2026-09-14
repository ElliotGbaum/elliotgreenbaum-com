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
voice and gives the real email, which is the intended failure. What he knows
is `server/persona.ts`; what the panel says on its own — the greeting, the
suggested questions, the standing note that every answer is generated — is
`src/content/talk.json`.

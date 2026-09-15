/**
 * The agent layer — the film, in words, for whoever cannot watch it.
 *
 * Two readers get this instead of the world: a visitor with no WebGL, and a
 * machine. The second is the newer one and the reason this exists. A recruiter
 * pastes the address into ChatGPT or Claude and asks "who is this"; the
 * assistant fetches the page, and until now the page it fetched said a name
 * and three addresses, because everything the film says is painted on a
 * canvas thirty units away. The 3D world is invisible to anything that does
 * not run it.
 *
 * So the film's own words go into the served HTML, and into /llms.txt — the
 * plain-markdown convention assistants look for — BOTH GENERATED FROM
 * src/content/film.json AT BUILD TIME. Not a second copy of the story: the
 * captions in that file are already the plain-spoken version of each act
 * (they are what a screen reader hears), and this reads them in running
 * order. Change a word in the film and the transcript changes with it. There
 * is still exactly one place the words live.
 *
 * WHAT IT IS NOT. It is not a résumé, and the fence in tools/verify.mjs still
 * says so: no bullets, no dates, no lane of specifics the film does not say.
 * It is a transcript. If the film does not say it, this does not either.
 *
 * Wiring: a Vite plugin. `transformIndexHtml` swaps the `<!--@transcript-->`
 * marker in index.html for the markup; `/llms.txt` is served by the dev
 * server and emitted into dist/ by the build. The JSON is imported rather
 * than read off disk, so editing it means restarting `vite` — the config is
 * bundled once.
 */

import type { Plugin } from 'vite'
import film from '../src/content/film.json'

const SITE = 'https://elliotgreenbaum.com/'
const ACT_IDS = ['act0', 'act1', 'act2', 'act3', 'act4', 'act5', 'act6', 'act7', 'act8', 'act9', 'act10', 'act11'] as const

interface ActCopy {
  chapter: string
  caption: string
  index?: string
}
interface ContactLink {
  label: string
  href: string
}

const copy = film as unknown as Record<string, ActCopy> & {
  digest: ActCopy & { title: string }
  act11: ActCopy & { email: string; links: ContactLink[] }
}

const acts = (): ActCopy[] => ACT_IDS.map((id) => copy[id])

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** the description every machine-facing surface shares — see index.html's meta */
export const DESCRIPTION =
  'Elliot Greenbaum — product, deployment and AI solutions. Philosophy, Politics and Economics at Penn. elliotgreenbaum@gmail.com'

/**
 * The markup that goes into index.html. A <section> inside the card that is
 * in the page but not on the screen — the sr-only pattern, see .transcript
 * in index.html — so a screen reader and a fetcher that strips the page to
 * its text both get all of it, and the sighted no-WebGL visitor sees a name
 * and three links. NO ANCHORS in here: the card's three contact links are
 * counted by verify, and the addresses are already in the last act's
 * caption as text. Not `hidden` and not `aria-hidden`: those take it off
 * screen readers too, and verify checks neither is on it.
 */
export function transcriptHtml(): string {
  const parts = acts().map((a) => {
    const head = a.index ? `${esc(a.index)} · ${esc(a.chapter)}` : esc(a.chapter)
    return `    <h3>${head}</h3>\n    <p>${esc(a.caption)}</p>`
  })
  parts.push(`    <h3>${esc(copy.digest.chapter)}</h3>\n    <p>${esc(copy.digest.caption)}</p>`)
  return [
    `<section id="transcript" class="transcript" aria-labelledby="transcript-title">`,
    `    <h2 id="transcript-title">The film, in words</h2>`,
    `    <p class="transcript__note">What the projector plays, as text — the same words in the same order. Also at /llms.txt.</p>`,
    ...parts,
    `  </section>`,
  ].join('\n')
}

/** /llms.txt — the same words as markdown, with the addresses as links */
export function llmsTxt(): string {
  const lines: string[] = []
  lines.push('# Elliot Greenbaum', '', `> ${DESCRIPTION}`, '')
  lines.push(
    `This is the personal site of Elliot Greenbaum (${SITE}). In a browser it is a 3D field at night: you walk to a projector, switch it on, and a short film about him plays. This file is that film in words, in running order, generated from the film's own copy.`,
    '',
  )
  lines.push('## The film', '')
  for (const a of acts()) {
    lines.push(`### ${a.index ? `${a.index} · ` : ''}${a.chapter}`, '', a.caption, '')
  }
  lines.push(`## ${copy.digest.chapter}`, '', copy.digest.caption, '')
  lines.push('## Contact', '')
  lines.push(`- Email: ${copy.act11.email}`)
  for (const l of copy.act11.links) lines.push(`- ${l.label}: ${l.href}`)
  lines.push('', '## About this site', '')
  lines.push(
    'Built by hand in TypeScript with Three.js and Vite. The film is drawn frame by frame on a 2D canvas and projected into the 3D world. Visitors without WebGL get a plain HTML card; this transcript is in that page for screen readers and fetchers.',
    '',
  )
  return lines.join('\n')
}

export function agentLayer(): Plugin {
  const MARK = '<!--@transcript-->'
  return {
    name: 'agent-layer',
    transformIndexHtml(html, ctx) {
      // the dev-only pages (sketches.html, filmstrip.html, preview.html) have
      // no card and no marker; only the real page has to carry the transcript
      if (!ctx.filename.endsWith('index.html')) return html
      if (!html.includes(MARK)) throw new Error(`[agent-layer] index.html is missing ${MARK}`)
      return html.replace(MARK, transcriptHtml())
    },
    configureServer(server) {
      server.middlewares.use('/llms.txt', (_req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(llmsTxt())
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'llms.txt', source: llmsTxt() })
    },
  }
}

/**
 * WHAT THE AI KNOWS ABOUT ELLIOT — where it comes from.
 *
 * The notes themselves are not in this repository. The system prompt behind
 * the figure in the field is a page of prose Elliot wrote about himself plus
 * the rules for answering in his voice, and it is kept out of the public
 * tree on purpose: the film says everything the notes say, but the notes are
 * addressed to a model, not to a visitor, and the wording is his to keep.
 *
 * Two places it can live, checked in this order:
 *
 *   ELLIOT_PERSONA        the environment variable — what production uses.
 *                         Set it in Vercel from the local file:
 *                           npx vercel env add ELLIOT_PERSONA production < server/persona.md
 *   server/persona.md     a gitignored file beside this one — what the dev
 *                         and preview servers use. Read on every question, so
 *                         editing it takes effect without a restart.
 *
 * With neither, the figure has no notes and says so, the same way he does
 * without an API key (chat.ts treats an empty brief as unconfigured).
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export function persona(): string {
  const fromEnv = (process.env.ELLIOT_PERSONA ?? '').trim()
  if (fromEnv) return fromEnv
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    return readFileSync(join(here, 'persona.md'), 'utf8').trim()
  } catch {
    return ''
  }
}

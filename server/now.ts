/**
 * What Elliot is into this week — the one live line with no feed behind it.
 *
 * He does not read books and nothing he does leaves a public trail that says
 * what he is thinking about, so this is written by hand in
 * src/content/now.json and shipped with the site: editing the file and
 * pushing IS the update. The panel shows how long ago it was written, which
 * is what keeps a hand-written line honest — three weeks old, it says three
 * weeks old.
 *
 * If it ever gets a feed — a Notion page, a pinned note, a Google Doc — this
 * is the only file that changes; `interest()` keeps its shape.
 */

import now from '../src/content/now.json' with { type: 'json' }

export interface Interest {
  text: string
  /** ISO date it was written */
  since: string
  link: string | null
}

/** the note, or null when the file is empty */
export function interest(): Interest | null {
  const text = (now.interested ?? '').trim()
  if (!text) return null
  const since = /^\d{4}-\d{2}-\d{2}$/.test(now.since ?? '') ? now.since : new Date().toISOString().slice(0, 10)
  const link = typeof now.link === 'string' && /^https:\/\//.test(now.link) ? now.link : null
  return { text, since, link }
}

/** one plain sentence for the model, or nothing */
export function describeInterest(i: Interest | null): string | null {
  if (!i) return null
  return `What Elliot is into this week (his own note, written ${i.since}): ${i.text}.`
}

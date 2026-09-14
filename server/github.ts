/**
 * The last thing Elliot shipped — read from GitHub's public event feed.
 *
 * The chat and the panel both use it (server/live.ts): "he pushed to
 * upstreamit six hours ago" is a truer proof of building things than any
 * bullet in the notes, and it costs nothing to read.
 *
 * WHAT IT READS: the PUBLIC repository of GITHUB_USER (default: ElliotGbaum)
 * that was pushed to most recently, by its push time. Private repositories
 * are never in that list, so nothing private can leak through here by
 * construction — and they are not wanted: the line is about what he ships
 * in the open. The push time is the repository's own, so a push made by a
 * tool on his behalf counts (the public event feed only lists pushes made
 * by the account itself, and missed one that way). GITHUB_TOKEN is optional
 * and changes nothing about what is read; it only lifts the anonymous rate
 * limit (60 an hour per address). A token with NO permissions is enough.
 */

export interface Shipped {
  /** owner/name */
  repo: string
  url: string
  /** ISO time of the push */
  at: string
}

const USER = process.env.GITHUB_USER || 'ElliotGbaum'
const TTL_MS = 5 * 60_000
let cached: { at: number; shipped: Shipped | null } | null = null

async function fetchShipped(): Promise<Shipped | null> {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'elliotgreenbaum.com',
  }
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const r = await fetch(
    `https://api.github.com/users/${encodeURIComponent(USER)}/repos?type=owner&sort=pushed&direction=desc&per_page=5`,
    { headers },
  )
  if (!r.ok) {
    console.error('[github] repos failed', r.status)
    return null
  }
  const repos = (await r.json()) as { full_name: string; html_url: string; private: boolean; fork: boolean; pushed_at: string }[]
  const top = repos.find((x) => !x.private && !x.fork)
  return top ? { repo: top.full_name, url: top.html_url, at: top.pushed_at } : null
}

/** the newest public push, or null when there is none or it cannot be read */
export async function lastShipped(): Promise<Shipped | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.shipped
  let shipped: Shipped | null = null
  try {
    shipped = await fetchShipped()
  } catch (err) {
    console.error('[github]', err)
  }
  cached = { at: Date.now(), shipped }
  return shipped
}

/** one plain sentence for the model, or nothing */
export function describeShipped(s: Shipped | null, ago: (iso: string) => string): string | null {
  if (!s) return null
  return `Elliot last pushed code to his public GitHub repository ${s.repo} ${ago(s.at)} (private work is not counted).`
}

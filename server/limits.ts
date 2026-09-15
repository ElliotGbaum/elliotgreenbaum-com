/**
 * Counting things per window — requests per minute, bookings per day.
 *
 * One function, `count(key, windowMs)`: how many times this key has been
 * seen in the current window, this call included. The callers compare it to
 * their own ceiling. It counts in a shared store when one is configured
 * (KV_REST_API_URL and _TOKEN, the names Vercel's Upstash integration
 * writes, or UPSTASH_REDIS_REST_URL and _TOKEN — a free Upstash Redis from
 * the Vercel marketplace), because a serverless function runs as many
 * instances as there is load and memory in one of them means nothing to the
 * others. Without a store it counts in memory, which blunts a loop from one
 * instance and is not a wall.
 *
 * WHEN THE STORE IS DOWN it answers Infinity: closed, not open. A minute of
 * "busy" beats a bill, and a day without bookings beats a calendar someone
 * else filled.
 *
 * The key is whatever the caller hands over; callers hash addresses before
 * they get here (see `hash` in chat.ts), so nothing in the store is a raw IP.
 */

const memory = new Map<string, number[]>()

async function shared(key: string, windowMs: number): Promise<number | null> {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  const slot = `${key}:${Math.floor(Date.now() / windowMs)}`
  try {
    const r = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify([
        ['INCR', slot],
        ['EXPIRE', slot, Math.ceil(windowMs / 1000)],
      ]),
    })
    if (!r.ok) throw new Error(`upstash ${r.status}`)
    const [{ result }] = (await r.json()) as { result: number }[]
    return result
  } catch (err) {
    console.error('[limits] store', key.split(':')[0], err)
    return Infinity
  }
}

function local(key: string, windowMs: number): number {
  const now = Date.now()
  const recent = (memory.get(key) ?? []).filter((t) => now - t < windowMs)
  recent.push(now)
  memory.set(key, recent)
  // keep the map from growing for the life of a warm instance
  if (memory.size > 2000) {
    for (const [k, v] of memory) if (v.every((t) => now - t >= windowMs)) memory.delete(k)
  }
  return recent.length
}

/** how many times `key` has been counted in the current window, this one included */
export async function count(key: string, windowMs: number): Promise<number> {
  return (await shared(key, windowMs)) ?? local(key, windowMs)
}

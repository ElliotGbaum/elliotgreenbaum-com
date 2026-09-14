/**
 * What Elliot is listening to — read live from his Spotify account.
 *
 * Two things ask this: the chat (server/chat.ts) hands the answer to the
 * model so "what are you listening to?" is answered with the truth, and the
 * panel shows the same line under its header (api/spotify.ts → src/ui/chat.ts),
 * so the visitor can see it whether or not they ask.
 *
 * HOW IT GETS IN: Elliot authorised the site once (tools/spotify-auth.mjs),
 * which produced a refresh token — a long-lived credential this module trades
 * for a short-lived access token whenever it needs one. Both live in the
 * environment: SPOTIFY_CLIENT_ID and SPOTIFY_REFRESH_TOKEN. The login used
 * PKCE, so there is no client secret anywhere. Spotify says the refresh token
 * lasts 180 days for an app in development mode; when it stops working, run
 * the auth script again and replace the token in Vercel.
 *
 * WHAT IT READS: the track playing right now if there is one, else the last
 * one played. Read-only scopes, nothing else about the account.
 *
 * WHEN IT CANNOT: no variables, a dead token, Spotify down — it answers null
 * and says nothing. The chat then simply does not know, which is the honest
 * state, and the panel shows no line. Nothing about the world changes.
 *
 * CACHED for a minute per warm instance, because the panel and the chat both
 * ask and a visitor can ask many times; the access token is kept until it is
 * about to expire.
 */

export interface Track {
  title: string
  artists: string
  album: string
  url: string
  /** a small album image, if Spotify supplied one */
  image: string | null
  /** ISO time it was played, or started; `playing` says which */
  at: string
  playing: boolean
}

/**
 * The longer answer, for a visitor who taps the line: the last few tracks
 * and the artists and tracks Spotify says he has played most in the last
 * four weeks. Read with `user-top-read`, which the auth script asks for; a
 * token from before that scope was added answers null for the two top lists
 * and the panel simply shows the recent ones. Nothing else is read — not
 * playlists, not the library, not who he follows.
 */
export interface Detail {
  recent: Track[]
  topArtists: { name: string; url: string; image: string | null }[]
  topTracks: Track[]
}

const RESULT_TTL_MS = 60_000
const DETAIL_TTL_MS = 10 * 60_000
let cached: { at: number; track: Track | null } | null = null
let cachedDetail: { at: number; detail: Detail | null } | null = null
let access: { token: string; expires: number } | null = null

type Item = {
  name: string
  artists: { name: string }[]
  album: { name: string; images?: { url: string; width: number }[] }
  external_urls: { spotify: string }
}

function shape(t: Item, at: string, playing: boolean): Track {
  const images = t.album.images ?? []
  const small = images.length ? images.reduce((a, b) => (b.width < a.width ? b : a)) : null
  return {
    title: t.name,
    artists: t.artists.map((a) => a.name).join(', '),
    album: t.album.name,
    url: t.external_urls.spotify,
    image: small?.url ?? null,
    at,
    playing,
  }
}

async function accessToken(): Promise<string | null> {
  const id = process.env.SPOTIFY_CLIENT_ID
  const refresh = process.env.SPOTIFY_REFRESH_TOKEN
  if (!id || !refresh) return null
  if (access && access.expires > Date.now() + 30_000) return access.token
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, grant_type: 'refresh_token', refresh_token: refresh }),
  })
  if (!r.ok) {
    console.error('[spotify] refresh failed', r.status, await r.text().catch(() => ''))
    return null
  }
  const j = (await r.json()) as { access_token: string; expires_in: number }
  access = { token: j.access_token, expires: Date.now() + j.expires_in * 1000 }
  return j.access_token
}

async function fetchLatest(): Promise<Track | null> {
  const token = await accessToken()
  if (!token) return null
  const headers = { authorization: `Bearer ${token}` }

  const now = await fetch('https://api.spotify.com/v1/me/player/currently-playing', { headers })
  if (now.status === 200) {
    const j = (await now.json()) as { is_playing: boolean; item: Item | null; currently_playing_type: string }
    if (j.is_playing && j.item && j.currently_playing_type === 'track') {
      return shape(j.item, new Date().toISOString(), true)
    }
  }

  const recent = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=1', { headers })
  if (!recent.ok) {
    console.error('[spotify] recently-played failed', recent.status)
    return null
  }
  const j = (await recent.json()) as { items: { track: Item; played_at: string }[] }
  const first = j.items?.[0]
  return first ? shape(first.track, first.played_at, false) : null
}

/** the track now, or last — null when there is none or it cannot be read */
export async function latestTrack(): Promise<Track | null> {
  if (cached && Date.now() - cached.at < RESULT_TTL_MS) return cached.track
  let track: Track | null = null
  try {
    track = await fetchLatest()
  } catch (err) {
    console.error('[spotify]', err)
  }
  cached = { at: Date.now(), track }
  return track
}

async function fetchDetail(): Promise<Detail | null> {
  const token = await accessToken()
  if (!token) return null
  const headers = { authorization: `Bearer ${token}` }
  const [recent, artists, tracks] = await Promise.all([
    fetch('https://api.spotify.com/v1/me/player/recently-played?limit=8', { headers }),
    fetch('https://api.spotify.com/v1/me/top/artists?time_range=short_term&limit=5', { headers }),
    fetch('https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=5', { headers }),
  ])
  if (!recent.ok) {
    console.error('[spotify] recently-played failed', recent.status)
    return null
  }
  const rj = (await recent.json()) as { items: { track: Item; played_at: string }[] }
  // the same song on repeat is one line, not five
  const seen = new Set<string>()
  const recentTracks: Track[] = []
  for (const it of rj.items ?? []) {
    if (seen.has(it.track.external_urls.spotify)) continue
    seen.add(it.track.external_urls.spotify)
    recentTracks.push(shape(it.track, it.played_at, false))
    if (recentTracks.length === 5) break
  }
  type Artist = { name: string; external_urls: { spotify: string }; images?: { url: string; width: number }[] }
  let topArtists: Detail['topArtists'] = []
  if (artists.ok) {
    const aj = (await artists.json()) as { items: Artist[] }
    topArtists = (aj.items ?? []).map((a) => {
      const imgs = a.images ?? []
      const small = imgs.length ? imgs.reduce((x, y) => (y.width < x.width ? y : x)) : null
      return { name: a.name, url: a.external_urls.spotify, image: small?.url ?? null }
    })
  }
  let topTracks: Track[] = []
  if (tracks.ok) {
    const tj = (await tracks.json()) as { items: Item[] }
    topTracks = (tj.items ?? []).map((t) => shape(t, '', false))
  }
  return { recent: recentTracks, topArtists, topTracks }
}

/** the longer answer, or null when it cannot be read */
export async function listeningDetail(): Promise<Detail | null> {
  if (cachedDetail && Date.now() - cachedDetail.at < DETAIL_TTL_MS) return cachedDetail.detail
  let detail: Detail | null = null
  try {
    detail = await fetchDetail()
  } catch (err) {
    console.error('[spotify] detail', err)
  }
  cachedDetail = { at: Date.now(), detail }
  return detail
}

/** GET /api/spotify — the track, as JSON, for the panel; ?detail for the longer answer */
export async function handleSpotify(req: Request): Promise<Response> {
  if (req.method !== 'GET') return new Response(null, { status: 405 })
  const url = new URL(req.url, 'http://localhost')
  if (url.searchParams.has('detail')) {
    const detail = await listeningDetail()
    return new Response(JSON.stringify({ detail }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=300, s-maxage=300',
      },
    })
  }
  const track = await latestTrack()
  return new Response(JSON.stringify({ track }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60, s-maxage=60',
    },
  })
}

/** the top artists as one clause for the model, or nothing */
export function describeDetail(d: Detail | null): string | null {
  if (!d || !d.topArtists.length) return null
  return `The artists he has played most in the last four weeks are ${d.topArtists.map((a) => a.name).join(', ')}.`
}

/** one plain sentence for the model, or nothing */
export function describe(track: Track | null): string | null {
  if (!track) return null
  const when = track.playing ? 'right now' : ago(track.at)
  return track.playing
    ? `Elliot is listening to "${track.title}" by ${track.artists} (from ${track.album}) ${when}.`
    : `The last thing Elliot listened to was "${track.title}" by ${track.artists} (from ${track.album}), ${when}.`
}

export function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (mins < 2) return 'a moment ago'
  if (mins < 60) return `${mins} minutes ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

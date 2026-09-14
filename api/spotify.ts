/**
 * GET /api/spotify — the Vercel door into server/spotify.ts.
 *
 * Same shape as api/chat.ts: nothing lives here, the implementation is one
 * function mounted at the same path by the Vite dev and preview servers.
 */

import { handleSpotify } from '../server/spotify'

export default function handler(req: Request): Promise<Response> {
  return handleSpotify(req)
}

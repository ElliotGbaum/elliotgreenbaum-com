/**
 * GET /api/live — the Vercel door into server/live.ts.
 *
 * Same shape as api/chat.ts: nothing lives here, the implementation is one
 * function mounted at the same path by the Vite dev and preview servers.
 */

import { handleLive } from '../server/live'

export default function handler(req: Request): Promise<Response> {
  return handleLive(req)
}

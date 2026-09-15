/**
 * GET /api/spotify — the Vercel door into server/spotify.ts.
 *
 * Same shape as api/chat.ts: nothing lives here, the implementation is one
 * function mounted at the same path by the Vite dev and preview servers.
 */

import { handleSpotify } from '../server/spotify.js'

// Named by method, not `export default`: Vercel only hands a web `Request`
// (and sends the `Response` back) to method-named exports. A default export
// gets Node's (req, res) pair instead, the Response goes nowhere, and the
// function hangs until it times out — which is how it shipped on 2026-09-15.
export function GET(req: Request): Promise<Response> {
  return handleSpotify(req)
}

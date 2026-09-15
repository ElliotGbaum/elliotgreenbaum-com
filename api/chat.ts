/**
 * POST /api/chat — the Vercel door into server/chat.ts.
 *
 * Nothing lives here on purpose. Vercel turns every file in api/ into a
 * function, and this one exists so that the conversation has a URL in
 * production; the same `handleChat` is mounted at the same path by the Vite
 * dev server (vite.config.ts), so there is exactly one implementation.
 *
 * It uses the web-standard signature (a Request in, a Response out), which
 * streams by default on Vercel's Node runtime — and streaming is the whole
 * reason the reply reads as typing rather than as a wait.
 */

import { handleChat } from '../server/chat.js'

// Named by method, not `export default`: Vercel only hands a web `Request`
// (and sends the `Response` back) to method-named exports. A default export
// gets Node's (req, res) pair instead, the Response goes nowhere, and the
// function hangs until it times out — which is how it shipped on 2026-09-15.
export function POST(req: Request): Promise<Response> {
  return handleChat(req)
}

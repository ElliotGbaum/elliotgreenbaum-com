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

export default function handler(req: Request): Promise<Response> {
  return handleChat(req)
}

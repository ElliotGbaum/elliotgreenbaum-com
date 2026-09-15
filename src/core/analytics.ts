/**
 * Analytics — what the site learns about how it is used.
 *
 * WHAT IT IS FOR. The site has one funnel and it wants to know where it
 * leaks: arrive → see the world (or the card) → touch something → reach the
 * projector → switch it on → watch → finish (or wind forward) → reach out.
 * Every event below is a step of that path or a reason a step failed. There
 * is no third-party tag manager and nothing loads from a <script src>; the
 * transport is posthog-js, pulled in as its own chunk a moment AFTER the
 * world is up, so it never competes with three.js for the wire.
 *
 * HOW IT LEAVES THE PAGE. Nothing here is sent unless VITE_POSTHOG_KEY is set
 * at build time (set it in Vercel's environment variables; `.env*` is
 * gitignored on purpose). Without a key every call is a no-op in production
 * and a console line on the dev server, so the instrumentation is always
 * exercised and never reports to nobody. The host defaults to PostHog's US
 * cloud; VITE_POSTHOG_HOST overrides it.
 *
 * WHAT IT REFUSES TO DO. It honours Do Not Track and Global Privacy Control
 * and loads nothing when either is set. It sets no cookies (localStorage
 * only, first-party) and never identifies anyone — there is no login, so
 * every visitor is an anonymous distinct id. Autocapture is off: the world is
 * one <canvas>, so DOM clicks mean nothing here, and the film's controls are
 * reported by intent below rather than by which button element got the
 * click. The card lane (no WebGL) is the one place a DOM click is the event,
 * and its three links are reported by hand.
 *
 * THE OWNER'S OWN VISITS. `?analytics=off` opts this browser out, persisted,
 * so the person editing the site does not become a third of its traffic;
 * `?analytics=on` reverses it. `?analytics=debug` prints every event to the
 * console, key or no key.
 *
 * WHERE A VISITOR CAME FROM. Every event carries `source`: the `?src=`
 * (or `?ref=`, or `utm_source`) on the address they arrived by, else a
 * classification of the referrer (linkedin, x, google, github, email…), else
 * 'direct'. The first source this browser ever arrived by is kept as
 * `first_source`, so a visitor who came from LinkedIn on Monday and typed the
 * address on Thursday is still LinkedIn's. Referrers are weak on their own —
 * the LinkedIn app and every PDF send none, so a résumé click and a typed
 * address both read as 'direct' — which is why the address on the résumé
 * should carry `?src=resume`, the one on the LinkedIn profile `?src=linkedin`,
 * and so on; the README has the list. PostHog also stores `src` and `ref` as
 * campaign parameters alongside the standard utm_* set.
 *
 * THE EVENTS, in funnel order. Every one carries the context registered at
 * boot (lane, device, reduced motion, time of day, GPU, viewport, visit
 * number, source) so any of them can be cut by any of those.
 *
 *   lane_shown            { lane: 'world' | 'card', reason }
 *   world_ready           { boot_ms }
 *   first_input           { method: 'keys' | 'pointer' | 'touch', after_ms }
 *   projector_reached     { zone: 'radius' | 'reach', after_ms, walked }
 *   projector_pressed     { via: 'key' | 'badge' | 'click' | 'walk' | 'dwell', viewing }
 *   film_started          { after_ms, viewing }
 *   film_act_reached      { act, chapter, film_t, from_act, spent_s, jumped, rate }
 *   film_seek             { via: 'scrub' | 'key' | 'chapter', from_t, to_t, act }
 *   film_pause            { on, via: 'button' | 'key' | 'picture', film_t, act }
 *   film_rate             { rate, via: 'picker' | 'shuttle', film_t }
 *   film_tldr             { via: 'button' | 'key' | 'panel', film_t, act }
 *   film_digest_shown     { film_t }
 *   film_link_click       { href, label, act }
 *   film_ended            { watched_s, acts_seen, coverage }
 *   film_exit             { via: 'button' | 'key', film_t, act, completed, watched_s, acts_seen, coverage }
 *   contact_click         { channel: 'email' | 'linkedin' | 'x', where: 'film' | 'card' }
 *   fullscreen            { on }
 *   tab_hidden            { after_ms, film_active, film_t }
 *   tab_shown             { hidden_ms }
 *   perf_sample           { fps_avg, fps_p10, long_frames, frames }  every 30 s on screen
 *   context_lost          { after_ms, film_active }
 *   session_summary       everything above, totalled — sent on every hide and
 *                         on pagehide, `summary_n` counting up, so the LAST one
 *                         per session is the true one. Beacon transport, so it
 *                         survives the tab closing.
 *
 * plus PostHog's own $pageview, $pageleave, web vitals (LCP, CLS, INP, FCP),
 * and $exception for anything uncaught. Session replay is governed by the
 * project settings, not here; note that the WebGL canvas records black unless
 * the renderer is built with preserveDrawingBuffer, which it is not — the
 * film's 2D controls and the HUD replay fine.
 */

import type { PostHog } from 'posthog-js'
import { PHONE, REDUCED_MOTION } from './contract'

type Prop = string | number | boolean | null | undefined | readonly string[] | readonly number[]
export type Props = Record<string, Prop>

type InputMethod = 'keys' | 'pointer' | 'touch'
export type PressVia = 'key' | 'badge' | 'click' | 'walk' | 'dwell'
export type SeekVia = 'scrub' | 'key' | 'chapter'
export type PauseVia = 'button' | 'key' | 'picture'
export type RateVia = 'picker' | 'shuttle'
export type TldrVia = 'button' | 'key' | 'panel'
export type ExitVia = 'button' | 'key'

/** the slice of the film's state the instrumentation reads — see FilmState */
export interface FilmSnapshot {
  readonly running: boolean
  readonly paused: boolean
  readonly time: number
  readonly rate: number
  readonly chapter: number
  readonly rushing: boolean
  readonly digest: boolean
  readonly ended: boolean
}

const KEY = (import.meta.env.VITE_POSTHOG_KEY as string | undefined) || ''
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com'
const OPT_OUT_FLAG = 'eg:analytics-off'
const VISITS_KEY = 'eg:visits'
const FIRST_SEEN_KEY = 'eg:first-seen'
const FIRST_SOURCE_KEY = 'eg:first-source'
const PERF_EVERY_MS = 30_000

const t0 = performance.now()
const since = () => Math.round(performance.now() - t0)

/* ---------------- the transport ---------------- */

let ph: PostHog | null = null
let debug = import.meta.env.DEV
let disabled = false
let loading = false
/** events captured before the library arrived, replayed with their real timestamps */
const backlog: Array<{ event: string; props: Props; at: number }> = []
/** the context every event carries; kept here so the backlog gets it too */
let context: Props = {}

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function privacySignal(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string }
  return (
    nav.doNotTrack === '1' ||
    nav.doNotTrack === 'yes' ||
    nav.msDoNotTrack === '1' ||
    (window as Window & { doNotTrack?: string }).doNotTrack === '1' ||
    nav.globalPrivacyControl === true
  )
}

function readSwitch(): void {
  const want = new URLSearchParams(location.search).get('analytics')
  const s = storage()
  if (want === 'debug') debug = true
  if (want === 'off') s?.setItem(OPT_OUT_FLAG, '1')
  if (want === 'on') s?.removeItem(OPT_OUT_FLAG)
  if (s?.getItem(OPT_OUT_FLAG) === '1') disabled = true
  if (privacySignal()) disabled = true
}

function visitNumber(): { visit_n: number; days_since_first: number } {
  const s = storage()
  if (!s) return { visit_n: 1, days_since_first: 0 }
  const n = Number(s.getItem(VISITS_KEY) ?? 0) + 1
  s.setItem(VISITS_KEY, String(n))
  let first = Number(s.getItem(FIRST_SEEN_KEY) ?? 0)
  if (!first) {
    first = Date.now()
    s.setItem(FIRST_SEEN_KEY, String(first))
  }
  return { visit_n: n, days_since_first: Math.floor((Date.now() - first) / 86_400_000) }
}

/**
 * Where this visit came from. A tag on the address wins; the referrer is the
 * fallback; the absence of both is 'direct', which is also what a PDF or the
 * LinkedIn app sends, so tag the address wherever you can.
 */
function sourceOf(): { source: string; source_tagged: boolean; referrer_host: string | null; first_source: string } {
  const q = new URLSearchParams(location.search)
  const tag = (q.get('src') ?? q.get('ref') ?? q.get('utm_source') ?? '').trim().toLowerCase().slice(0, 40)
  let host: string | null = null
  try {
    host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : null
  } catch {
    host = null
  }
  const own = host === location.hostname.replace(/^www\./, '')
  let source = tag
  if (!source) {
    if (!host || own) source = 'direct'
    else if (/(^|\.)linkedin\.com$|^lnkd\.in$/.test(host)) source = 'linkedin'
    else if (/(^|\.)(x|twitter)\.com$|^t\.co$/.test(host)) source = 'x'
    else if (/(^|\.)google\./.test(host)) source = 'google'
    else if (/(^|\.)(bing|duckduckgo|yahoo|ecosia)\./.test(host)) source = 'search'
    else if (/(^|\.)github\.com$/.test(host)) source = 'github'
    else if (/mail\.google\.com|outlook\.|mail\.yahoo|superhuman|hey\.com/.test(host)) source = 'email'
    else if (/(^|\.)(chatgpt|openai|claude|anthropic|perplexity)\./.test(host)) source = 'assistant'
    else source = host
  }
  const s = storage()
  let first = s?.getItem(FIRST_SOURCE_KEY) ?? ''
  if (!first) {
    first = source
    s?.setItem(FIRST_SOURCE_KEY, first)
  }
  return { source, source_tagged: !!tag, referrer_host: own ? null : host, first_source: first }
}

async function load(): Promise<void> {
  if (ph || loading || disabled || !KEY) return
  loading = true
  try {
    const mod = await import('posthog-js')
    const instance = mod.default
    instance.init(KEY, {
      api_host: HOST,
      defaults: '2026-08-30',
      persistence: 'localStorage',
      respect_dnt: true,
      custom_campaign_params: ['src', 'ref'],
      person_profiles: 'identified_only',
      autocapture: false,
      capture_heatmaps: false,
      capture_dead_clicks: false,
      disable_surveys: true,
      capture_pageview: true,
      capture_pageleave: true,
      capture_exceptions: true,
      capture_performance: { web_vitals: true, network_timing: true },
      session_recording: {
        maskAllInputs: true,
        captureCanvas: { recordCanvas: true, canvasFps: 3, canvasQuality: '0.4' },
      },
      debug: false,
    })
    instance.register(context)
    ph = instance
    for (const { event, props, at } of backlog.splice(0)) {
      ph.capture(event, props, { timestamp: new Date(at) })
    }
  } catch (err) {
    // analytics failing to load is not a thing the visitor should ever notice
    loading = false
    if (debug) console.warn('[analytics] failed to load', err)
  }
}

function send(event: string, props: Props = {}, opts?: { beacon?: boolean }): void {
  if (disabled) return
  if (debug) console.debug(`[analytics] ${event}`, props)
  if (!KEY) return
  if (!ph) {
    backlog.push({ event, props, at: Date.now() })
    if (backlog.length > 200) backlog.shift()
    return
  }
  ph.capture(event, props, opts?.beacon ? { transport: 'sendBeacon', send_instantly: true } : undefined)
}

/* ---------------- the tallies ----------------
   Everything the summary reports, kept as plain counters so the summary is
   one object literal at the end rather than a reconstruction. */

const tally = {
  lane: 'card' as 'world' | 'card',
  inputs: { keys: 0, pointer: 0, touch: 0 } as Record<InputMethod, number>,
  firstInputAt: 0,
  walked: 0,
  reachedRadius: false,
  reachedReach: false,
  reachedAt: 0,
  pressed: 0,
  viewings: 0,
  filmStartedAt: 0,
  /** wall seconds with the picture running, unpaused, on screen */
  watchedS: 0,
  /** film seconds actually seen (paused time and speed accounted for), by act */
  seenByAct: new Map<number, number>(),
  maxAct: -1,
  seeks: 0,
  pauses: 0,
  rateChanges: 0,
  tldr: 0,
  digestShown: 0,
  ended: 0,
  exits: 0,
  completed: false,
  links: 0,
  contacts: [] as string[],
  fullscreen: 0,
  hides: 0,
  hiddenMs: 0,
  contextLost: 0,
  frames: 0,
  longFrames: 0,
  summaries: 0,
}

/* ---------------- the frame loop's share ---------------- */

let lastX = NaN
let lastZ = NaN
/** wall-clock frame intervals, ms — NOT the loop's dt, which is capped at 50 ms
 *  and so can never report a frame rate under twenty */
const perfFrames: number[] = []
let lastFrameAt = 0
let perfAt = 0
let hiddenAt = 0

function fpsStats(samples: number[]): { fps_avg: number; fps_p10: number } {
  if (samples.length === 0) return { fps_avg: 0, fps_p10: 0 }
  const sorted = samples.slice().sort((a, b) => a - b)
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length
  // p10 of frame TIME is the slow tail; report it as the fps a bad frame gets
  const slow = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]
  return { fps_avg: Math.round(1000 / mean), fps_p10: Math.round(1000 / Math.max(slow, 1)) }
}

/* ---------------- the film's share ---------------- */

let film: FilmSnapshot | null = null
let lastAct = -1
let actEnteredAt = 0
let lastFilmT = 0
let wasDigest = false
let runtime = 0
let chapterNames: readonly string[] = []

function actName(i: number): string {
  return chapterNames[i] ?? `act${i}`
}

function coverage(): number {
  if (!runtime) return 0
  let seen = 0
  for (const s of tally.seenByAct.values()) seen += s
  return Math.min(1, Math.round((seen / runtime) * 1000) / 1000)
}

function filmFacts(): Props {
  return {
    film_t: film ? Math.round(film.time * 10) / 10 : 0,
    act: film ? actName(film.chapter) : null,
    watched_s: Math.round(tally.watchedS),
    acts_seen: tally.seenByAct.size,
    coverage: coverage(),
  }
}

function summary(): Props {
  const { fps_avg, fps_p10 } = fpsStats(perfFrames)
  return {
    summary_n: ++tally.summaries,
    total_ms: since(),
    hidden_ms: Math.round(tally.hiddenMs),
    lane: tally.lane,
    inputs_keys: tally.inputs.keys,
    inputs_pointer: tally.inputs.pointer,
    inputs_touch: tally.inputs.touch,
    first_input_ms: tally.firstInputAt,
    walked: Math.round(tally.walked),
    reached_projector: tally.reachedReach || tally.reachedRadius,
    reached_projector_ms: tally.reachedAt,
    projector_pressed: tally.pressed,
    film_viewings: tally.viewings,
    film_started_ms: tally.filmStartedAt,
    film_watched_s: Math.round(tally.watchedS),
    film_coverage: coverage(),
    film_acts_seen: tally.seenByAct.size,
    film_max_act: tally.maxAct >= 0 ? actName(tally.maxAct) : null,
    film_seeks: tally.seeks,
    film_pauses: tally.pauses,
    film_rate_changes: tally.rateChanges,
    film_tldr: tally.tldr,
    film_digest_shown: tally.digestShown,
    film_ended: tally.ended,
    film_exits: tally.exits,
    film_completed: tally.completed,
    film_links: tally.links,
    contact_clicks: tally.contacts.length,
    contact_channels: tally.contacts,
    fullscreen_toggles: tally.fullscreen,
    tab_hides: tally.hides,
    context_lost: tally.contextLost,
    frames: tally.frames,
    long_frames: tally.longFrames,
    fps_avg,
    fps_p10,
  }
}

function channelOf(href: string): 'email' | 'linkedin' | 'x' | 'other' {
  if (href.startsWith('mailto:')) return 'email'
  if (/linkedin\.com/i.test(href)) return 'linkedin'
  if (/(^|\/\/)(www\.)?(x|twitter)\.com/i.test(href)) return 'x'
  return 'other'
}

/* ---------------- the public face ---------------- */

export const analytics = {
  /**
   * Once, from main.ts, before anything else — it needs to be listening
   * before the first key goes down. Registers the context every event
   * carries and arms the document-level listeners. The library itself is
   * loaded later (see `load` below) so the world's own bundle is never
   * waiting on it.
   */
  init(lane: 'world' | 'card', reason?: string): void {
    readSwitch()
    tally.lane = lane
    const touch =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(hover: none) and (pointer: coarse)').matches
    context = {
      lane,
      device: PHONE ? 'phone' : touch ? 'tablet' : 'desktop',
      touch,
      reduced_motion: REDUCED_MOTION,
      dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
      viewport_w: window.innerWidth,
      viewport_h: window.innerHeight,
      lang: navigator.language,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
      ...visitNumber(),
      ...sourceOf(),
    }
    if (debug) console.debug('[analytics] context', JSON.stringify(context))
    send('lane_shown', { lane, reason: reason ?? null })

    // the first touch of anything, and the mix of inputs after it
    const onInput = (method: InputMethod) => {
      tally.inputs[method]++
      if (!tally.firstInputAt) {
        tally.firstInputAt = since()
        send('first_input', { method, after_ms: tally.firstInputAt })
      }
    }
    window.addEventListener('keydown', (e) => !e.repeat && onInput('keys'), { capture: true, passive: true })
    window.addEventListener(
      'pointerdown',
      (e) => onInput(e.pointerType === 'touch' ? 'touch' : 'pointer'),
      { capture: true, passive: true },
    )

    // the card lane's three links are the whole page, so the click is the event
    document.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement | null)?.closest?.('#card a[href]')
      if (a instanceof HTMLAnchorElement) analytics.contact(a.href, 'card')
    })

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        hiddenAt = performance.now()
        tally.hides++
        send('tab_hidden', {
          after_ms: since(),
          film_active: !!film?.running,
          film_t: film ? Math.round(film.time) : null,
        })
        send('session_summary', summary(), { beacon: true })
      } else if (hiddenAt) {
        const gap = performance.now() - hiddenAt
        tally.hiddenMs += gap
        hiddenAt = 0
        send('tab_shown', { hidden_ms: Math.round(gap) })
      }
    })
    window.addEventListener('pagehide', () => send('session_summary', summary(), { beacon: true }))

    // the library, once the page has had a moment to itself
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void })
      .requestIdleCallback
    const kick = () => (idle ? idle(load) : setTimeout(load, 0))
    setTimeout(kick, lane === 'world' ? 2500 : 500)
  },

  /** anything the context learns after init — the GPU, the time of day */
  setContext(props: Props): void {
    context = { ...context, ...props }
    ph?.register(props)
  },

  track(event: string, props?: Props): void {
    send(event, props)
  },

  worldReady(): void {
    send('world_ready', { boot_ms: since() })
  },

  /** the renderer, once it exists — what the world is actually running on */
  renderer(gl: WebGLRenderingContext | WebGL2RenderingContext, webgl2: boolean): void {
    let gpu: string | null = null
    try {
      const info = gl.getExtension('WEBGL_debug_renderer_info')
      if (info) gpu = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
    } catch {
      /* some browsers refuse; the field is just null then */
    }
    analytics.setContext({ gpu, webgl2 })
  },

  /**
   * Once a frame from the world's loop: distance walked, frame times, and the
   * film's clock while it is running.
   */
  frame(x: number, z: number): void {
    tally.frames++
    const now = performance.now()
    // a gap over a second is the tab coming back, not a slow frame
    const ms = lastFrameAt && now - lastFrameAt < 1000 ? now - lastFrameAt : 0
    lastFrameAt = now
    if (ms > 0) {
      if (ms > 50) tally.longFrames++
      perfFrames.push(ms)
      if (perfFrames.length > 1800) perfFrames.splice(0, perfFrames.length - 1800)
    }

    if (!Number.isNaN(lastX)) tally.walked += Math.hypot(x - lastX, z - lastZ)
    lastX = x
    lastZ = z

    if (!perfAt) perfAt = now
    if (now - perfAt > PERF_EVERY_MS && !document.hidden) {
      const { fps_avg, fps_p10 } = fpsStats(perfFrames)
      send('perf_sample', {
        fps_avg,
        fps_p10,
        long_frames: tally.longFrames,
        frames: tally.frames,
        film_active: !!film?.running,
      })
      perfAt = now
    }

    if (film?.running) analytics.film.tick(film, ms / 1000)
  },

  projector: {
    /** the prompt's radius — "you are near the thing" */
    near(): void {
      if (tally.reachedRadius) return
      tally.reachedRadius = true
      tally.reachedAt = since()
      send('projector_reached', { zone: 'radius', after_ms: tally.reachedAt, walked: Math.round(tally.walked) })
    },
    /** the badge's radius — "you could put your hand on it" */
    reach(): void {
      if (tally.reachedReach) return
      tally.reachedReach = true
      send('projector_reached', { zone: 'reach', after_ms: since(), walked: Math.round(tally.walked) })
    },
    pressed(via: PressVia): void {
      tally.pressed++
      send('projector_pressed', { via, viewing: tally.viewings + 1, after_ms: since() })
    },
  },

  film: {
    /** the film's clock and chapter list, once, so acts can be named */
    describe(runtimeSeconds: number, chapters: readonly string[]): void {
      runtime = runtimeSeconds
      chapterNames = chapters
    },
    /** the picture is up and playing */
    started(state: FilmSnapshot): void {
      film = state
      tally.viewings++
      if (!tally.filmStartedAt) tally.filmStartedAt = since()
      lastAct = -1
      lastFilmT = 0
      wasDigest = false
      actEnteredAt = performance.now()
      send('film_started', { after_ms: since(), viewing: tally.viewings })
    },
    /** once a frame while the picture is up; `wall` is real seconds since the last frame */
    tick(state: FilmSnapshot, wall: number): void {
      film = state
      const step = state.time - lastFilmT
      const jumped = Math.abs(step) > Math.max(1, wall * state.rate * 4)
      const advancing = !state.paused && !state.digest && !state.ended && !state.rushing
      if (advancing) {
        tally.watchedS += wall
        if (!jumped && step > 0) {
          const seen = tally.seenByAct.get(state.chapter) ?? 0
          tally.seenByAct.set(state.chapter, seen + step)
        }
      }
      // the wind-forward passes through every act on its way to the card; none of them was reached
      if (state.chapter !== lastAct && !state.digest && !state.rushing) {
        const now = performance.now()
        send('film_act_reached', {
          act: actName(state.chapter),
          index: state.chapter,
          film_t: Math.round(state.time * 10) / 10,
          from_act: lastAct >= 0 ? actName(lastAct) : null,
          spent_s: lastAct >= 0 ? Math.round((now - actEnteredAt) / 100) / 10 : 0,
          jumped,
          rate: state.rate,
        })
        lastAct = state.chapter
        actEnteredAt = now
        if (state.chapter > tally.maxAct) tally.maxAct = state.chapter
      }
      if (state.digest !== wasDigest) {
        wasDigest = state.digest
        if (state.digest) {
          tally.digestShown++
          send('film_digest_shown', { film_t: Math.round(state.time), n: tally.digestShown })
        }
      }
      if (state.ended && !tally.completed) {
        tally.completed = true
        tally.ended++
        send('film_ended', { ...filmFacts() })
      }
      lastFilmT = state.time
    },
    seek(via: SeekVia, from: number, to: number): void {
      tally.seeks++
      send('film_seek', {
        via,
        from_t: Math.round(from),
        to_t: Math.round(to),
        act: film ? actName(film.chapter) : null,
      })
    },
    pause(on: boolean, via: PauseVia): void {
      if (on) tally.pauses++
      send('film_pause', { on, via, film_t: film ? Math.round(film.time) : null, act: film ? actName(film.chapter) : null })
    },
    rate(rate: number, via: RateVia): void {
      tally.rateChanges++
      send('film_rate', { rate, via, film_t: film ? Math.round(film.time) : null })
    },
    tldr(via: TldrVia): void {
      tally.tldr++
      send('film_tldr', { via, film_t: film ? Math.round(film.time) : null, act: film ? actName(film.chapter) : null })
    },
    link(href: string, label: string): void {
      tally.links++
      const channel = channelOf(href)
      if (channel !== 'other') analytics.contact(href, 'film')
      else send('film_link_click', { href, label, act: film ? actName(film.chapter) : null })
    },
    /** the visitor left the film, by button or by Escape */
    exit(via: ExitVia): void {
      tally.exits++
      send('film_exit', { via, completed: !!film?.ended || !!film?.digest, ...filmFacts() })
    },
  },

  contact(href: string, where: 'film' | 'card'): void {
    const channel = channelOf(href)
    tally.contacts.push(channel)
    send('contact_click', { channel, where, href })
  },

  fullscreen(on: boolean): void {
    tally.fullscreen++
    send('fullscreen', { on })
  },

  contextLost(): void {
    tally.contextLost++
    send('context_lost', { after_ms: since(), film_active: !!film?.running })
    send('session_summary', summary(), { beacon: true })
  },
}

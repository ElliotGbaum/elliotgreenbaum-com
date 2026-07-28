/// <reference types="vite/client" />
/**
 * The takeover panel — where someone actually reads about Elliot.
 *
 * The world is theatre; this is the part that does the work. It is real DOM
 * on top of the canvas, it traps focus, it closes on Escape, and the résumé
 * variant CLONES `#resume-source` so there is exactly one copy of that text
 * in the project — the one search engines and no-JS visitors get.
 *
 * This module also owns the small amount of overlay plumbing shared with
 * `places.ts` (focus trap, scroll lock, background inerting), because both
 * surfaces must agree about which one is on top.
 */
import './ui.css'
import { REDUCED_MOTION } from '../core/contract'

/* ================================================================== *
 * Shared overlay plumbing
 * ================================================================== */

const RM_QUERY =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null

/**
 * `REDUCED_MOTION` is the answer at boot. This stays honest if the OS
 * setting changes mid-session, so the JS timings never drift out of step
 * with the `prefers-reduced-motion` rules in ui.css.
 */
export const reducedMotion = (): boolean => REDUCED_MOTION || RM_QUERY?.matches === true

/** panel enter/exit, ms — matches the transition in ui.css */
export const PANEL_MS = 260
/** places sheet enter/exit, ms */
export const SHEET_MS = 220

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  'summary',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex^="-"])',
].join(',')

function isReachable(el: HTMLElement): boolean {
  if (el.hidden) return false
  if (el.closest('[inert]')) return false
  return el.getClientRects().length > 0
}

/** every focusable descendant, in document order, that is actually reachable */
export function focusablesIn(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isReachable)
}

function focusSafely(el: HTMLElement | null | undefined): void {
  if (!el || !el.isConnected) return
  try {
    el.focus({ preventScroll: true })
  } catch {
    el.focus()
  }
}

/* ---------- body scroll lock (ref-counted: overlays can overlap) ---------- */

let scrollLocks = 0

export function lockScroll(): () => void {
  scrollLocks++
  if (scrollLocks === 1) document.documentElement.classList.add('ui-locked')
  let released = false
  return () => {
    if (released) return
    released = true
    scrollLocks = Math.max(0, scrollLocks - 1)
    if (scrollLocks === 0) document.documentElement.classList.remove('ui-locked')
  }
}

/* ---------- background inerting ---------- */

const INERT_MARK = 'data-ui-inert'
const ARIA_MARK = 'data-ui-aria-hidden'
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'NOSCRIPT'])

function setInert(el: HTMLElement, on: boolean): void {
  const owned = el.hasAttribute(INERT_MARK)
  if (on) {
    if (owned || el.hasAttribute('inert')) return
    el.setAttribute('inert', '')
    el.setAttribute(INERT_MARK, '')
    // belt and braces for browsers without `inert`: the Tab trap below is the
    // real guard, this is what a screen reader listens to.
    if (!el.hasAttribute('aria-hidden')) {
      el.setAttribute('aria-hidden', 'true')
      el.setAttribute(ARIA_MARK, '')
    }
  } else if (owned) {
    el.removeAttribute('inert')
    el.removeAttribute(INERT_MARK)
    if (el.hasAttribute(ARIA_MARK)) {
      el.removeAttribute('aria-hidden')
      el.removeAttribute(ARIA_MARK)
    }
  }
}

/**
 * The overlay stack. `#panel`, `#places` (and anything else that behaves as a
 * modal) register here so only the topmost one traps focus.
 */
const stack: HTMLElement[] = []
const topOverlay = (): HTMLElement | null => stack[stack.length - 1] ?? null

/**
 * Everything behind the topmost overlay goes inert.
 *
 * Note: `#panel` and `#places` are *children* of `#world`, so putting `inert`
 * on `#world` itself would inert the overlay too. We inert `#world`'s other
 * children instead — same intent, correct result.
 */
function applyIsolation(): void {
  const top = topOverlay()
  const world = document.getElementById('world')
  const targets: HTMLElement[] = []

  for (const child of Array.from(document.body.children)) {
    if (child === world || SKIP_TAGS.has(child.tagName)) continue
    targets.push(child as HTMLElement)
  }
  if (world) {
    for (const child of Array.from(world.children)) {
      if (SKIP_TAGS.has(child.tagName)) continue
      targets.push(child as HTMLElement)
    }
  }

  for (const el of targets) setInert(el, !!top && el !== top && !el.contains(top))
}

/**
 * Make `el` the active modal: background inert, body scroll locked, focus
 * trapped inside it, Escape routed to `onEscape`. Returns the release fn.
 */
export function mountOverlay(el: HTMLElement, onEscape: () => void): () => void {
  stack.push(el)
  applyIsolation()
  const unlock = lockScroll()

  const onKeyDown = (e: KeyboardEvent) => {
    if (topOverlay() !== el) return

    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault()
      e.stopPropagation()
      onEscape()
      return
    }
    if (e.key !== 'Tab') return

    const items = focusablesIn(el)
    if (items.length === 0) {
      e.preventDefault()
      focusSafely(el)
      return
    }
    const first = items[0]!
    const last = items[items.length - 1]!
    const active = document.activeElement as HTMLElement | null
    const inside = !!active && el.contains(active) && active !== el

    if (e.shiftKey) {
      if (!inside || active === first) {
        e.preventDefault()
        focusSafely(last)
      }
    } else if (!inside || active === last) {
      e.preventDefault()
      focusSafely(first)
    }
  }

  // If focus escapes some other way (browser chrome, a stray programmatic
  // focus call from the world), pull it straight back.
  const onFocusIn = (e: FocusEvent) => {
    if (topOverlay() !== el) return
    const target = e.target as Node | null
    if (!target || el.contains(target)) return
    focusSafely(focusablesIn(el)[0] ?? el)
  }

  // Capture phase, so the overlay wins over any world-level key handling.
  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('focusin', onFocusIn)

  return () => {
    const i = stack.indexOf(el)
    if (i >= 0) stack.splice(i, 1)
    document.removeEventListener('keydown', onKeyDown, true)
    document.removeEventListener('focusin', onFocusIn)
    unlock()
    applyIsolation()
  }
}

/* ================================================================== *
 * The résumé, cloned
 * ================================================================== */

/**
 * A live clone of `#resume-source` — the plain résumé that is already in the
 * page. Never a second copy of the text: edit index.html and both the plain
 * lane and this panel change together.
 *
 * The clone is returned as a `<div>` rather than a `<main>` (a document gets
 * one main landmark) and every `id` inside it is stripped, so nothing in the
 * clone can collide with the real document.
 */
export function resumeContent(): Node {
  const src = document.getElementById('resume-source')
  if (!src) {
    const fallback = document.createElement('p')
    fallback.textContent = 'The résumé is available at /elliot-greenbaum-resume.pdf.'
    return fallback
  }

  const clone = src.cloneNode(true) as HTMLElement

  // "It needs WebGL" is a strange thing to read from inside the WebGL.
  const note = clone.querySelector('#fallback-note')
  if (note) {
    const holder = note.closest('footer')
    note.remove()
    if (holder && holder.children.length === 0 && !holder.textContent?.trim()) holder.remove()
  }

  const root = document.createElement('div')
  root.className = clone.className
  root.classList.add('resume')
  while (clone.firstChild) root.appendChild(clone.firstChild)

  root.removeAttribute('id')
  for (const el of Array.from(root.querySelectorAll('[id]'))) el.removeAttribute('id')

  return root
}

/* ================================================================== *
 * Panel
 * ================================================================== */

export interface Panel {
  /**
   * Show the panel. `content` is either a live Node (preferred — see
   * `resumeContent()`) or a string of authored, trusted HTML.
   * Calling `open` while already open swaps the content in place.
   */
  open(id: string, title: string, content: Node | string): void
  close(): void
  readonly isOpen: boolean
  onClose(cb: () => void): void
}

function noopPanel(): Panel {
  return {
    open() {},
    close() {},
    get isOpen() {
      return false
    },
    onClose() {},
  }
}

export function createPanel(): Panel {
  const el = document.getElementById('panel')
  const titleEl = document.getElementById('panel-title')
  const bodyEl = document.getElementById('panel-body')
  const closeBtn = document.getElementById('panel-close')

  // The chrome must never be the thing that breaks the page.
  if (!el || !titleEl || !bodyEl) return noopPanel()

  el.setAttribute('tabindex', '-1')
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-modal', 'true')
  if (!el.hasAttribute('aria-labelledby')) el.setAttribute('aria-labelledby', 'panel-title')
  closeBtn?.setAttribute('aria-label', 'Close panel')

  const closeCbs: Array<() => void> = []
  let opened = false
  let trigger: HTMLElement | null = null
  let release: (() => void) | null = null
  let hideTimer = 0

  /**
   * A long panel scrolls. Safari will not focus an overflow container on its
   * own, so a keyboard user could not scroll it — give it a tab stop, but
   * only when there is genuinely something to scroll.
   */
  const syncScrollAffordance = () => {
    if (!opened) return
    const scrolls = bodyEl.scrollHeight - bodyEl.clientHeight > 2
    if (scrolls) bodyEl.setAttribute('tabindex', '0')
    else bodyEl.removeAttribute('tabindex')
  }

  const setContent = (content: Node | string) => {
    const doc = document.createElement('article')
    doc.className = 'panel__doc'
    if (typeof content === 'string') {
      // authored content only (markdown/JSON in src/content), never user input
      doc.innerHTML = content
    } else {
      doc.appendChild(content)
    }
    bodyEl.replaceChildren(doc)
    bodyEl.scrollTop = 0
  }

  const open = (id: string, title: string, content: Node | string) => {
    const wasOpen = opened
    if (!wasOpen) {
      const active = document.activeElement as HTMLElement | null
      trigger = active && active !== document.body && active.isConnected ? active : null
    }

    el.dataset.panel = id
    // the dialog is labelled by this element, so it is never allowed to be empty
    titleEl.textContent = title.trim() || id.replace(/[-_]+/g, ' ').trim() || 'Panel'
    setContent(content)

    if (wasOpen) {
      syncScrollAffordance()
      return
    }

    window.clearTimeout(hideTimer)
    el.hidden = false
    void el.offsetWidth // commit the pre-transition frame
    el.classList.add('is-open')
    opened = true
    release = mountOverlay(el, close)
    focusSafely(el)
    syncScrollAffordance()
  }

  const close = () => {
    if (!opened) return
    opened = false
    el.classList.remove('is-open')

    // release isolation before restoring focus, or the trigger is still inert
    release?.()
    release = null

    const back = trigger
    trigger = null
    if (back && back.isConnected) focusSafely(back)
    else focusSafely(document.getElementById('resume-btn'))

    window.clearTimeout(hideTimer)
    hideTimer = window.setTimeout(
      () => {
        if (opened) return
        el.hidden = true
        el.removeAttribute('data-panel')
        bodyEl.replaceChildren()
        bodyEl.removeAttribute('tabindex')
      },
      reducedMotion() ? 0 : PANEL_MS,
    )

    for (const cb of closeCbs.slice()) cb()
  }

  closeBtn?.addEventListener('click', close)
  // click the scrim, not the sheet
  el.addEventListener('click', (e) => {
    if (e.target === el) close()
  })
  window.addEventListener('resize', syncScrollAffordance, { passive: true })

  return {
    open,
    close,
    get isOpen() {
      return opened
    },
    onClose(cb: () => void) {
      closeCbs.push(cb)
    },
  }
}

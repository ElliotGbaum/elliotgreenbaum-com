/**
 * The parkour chrome.
 *
 * A course needs to answer four questions without ever being read: which level
 * is this, how long have I been on it, how many times have I fallen, and how
 * do I get out. Everything else — the level card on arrival, the completion
 * panel, the "click to play" overlay that pointer lock requires — appears when
 * it is the only thing on screen and goes away again.
 *
 * The markup lives in index.html so it is styled without JS having to build it
 * (same arrangement as the film's transport). This module only wires it.
 */

import { reducedMotion } from '../core/contract'

export interface ParkourHud {
  show(): void
  hide(): void
  setLevel(index: number, total: number, name: string): void
  setTimer(seconds: number): void
  setFalls(n: number): void
  /**
   * What the body is doing, or null when it is just walking.
   *
   * Sneaking and sprinting are the two states with no permanent mark on the
   * screen — the pose, the camera height and the lens all say so, but all
   * three are analogue and none of them names the thing. One word does, and
   * it is the difference between "the camera feels low" and "I am crouching".
   */
  setState(text: string | null): void
  /** the card that names the course on arrival */
  card(name: string, index: number, hint: string): void
  toast(text: string): void
  /** the "you finished it" panel. `onNext` is null on the last level. */
  complete(opts: {
    title: string
    lines: string[]
    nextLabel: string | null
    onNext: (() => void) | null
    onRetry: () => void
    onLeave: () => void
  }): void
  hidePanel(): void
  /** pointer lock has gone; ask for it back */
  setLockPrompt(on: boolean): void
  onLockRequest(cb: () => void): void
  onExit(cb: () => void): void
  onRestart(cb: () => void): void
  /** Minecraft's crosshair. It is the aiming reticle for a jump. */
  crosshair(on: boolean): void
  /** black veil, for the trip in and out */
  fade(to: number): void
  setTouch(on: boolean): void
  dispose(): void
}

const fmt = (s: number) => {
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${m}:${String(r).padStart(2, '0')}`
}

function noop(): ParkourHud {
  return {
    show() {}, hide() {}, setLevel() {}, setTimer() {}, setFalls() {}, setState() {},
    card() {}, toast() {}, complete() {}, hidePanel() {}, setLockPrompt() {}, crosshair() {},
    onLockRequest() {}, onExit() {}, onRestart() {}, fade() {}, setTouch() {},
    dispose() {},
  }
}

export function createParkourHud(): ParkourHud {
  const root = document.getElementById('pk')
  if (!root) return noop()

  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null
  const levelNo = el('pk-level-no')
  const levelName = el('pk-level-name')
  const timer = el('pk-timer')
  const falls = el('pk-falls')
  const card = el('pk-card')
  const cardNo = el('pk-card-no')
  const cardName = el('pk-card-name')
  const cardHint = el('pk-card-hint')
  const toastEl = el('pk-toast')
  const state = el('pk-state')
  const panel = el('pk-panel')
  const panelTitle = el('pk-panel-title')
  const panelBody = el('pk-panel-body')
  const nextBtn = el<HTMLButtonElement>('pk-next')
  const retryBtn = el<HTMLButtonElement>('pk-retry')
  const leaveBtn = el<HTMLButtonElement>('pk-leave')
  const lock = el('pk-lock')
  const exitBtn = el('pk-exit')
  const restartBtn = el('pk-restart')
  const fadeEl = el('pk-fade')
  const touch = el('pk-touch')

  const lockCbs: Array<() => void> = []
  const exitCbs: Array<() => void> = []
  const restartCbs: Array<() => void> = []

  let onNext: (() => void) | null = null
  let onRetry: (() => void) | null = null
  let onLeave: (() => void) | null = null

  const fire = (list: Array<() => void>) => {
    for (const cb of list.slice()) cb()
  }

  lock?.addEventListener('click', () => fire(lockCbs))
  exitBtn?.addEventListener('click', () => fire(exitCbs))
  restartBtn?.addEventListener('click', () => fire(restartCbs))
  nextBtn?.addEventListener('click', () => onNext?.())
  retryBtn?.addEventListener('click', () => onRetry?.())
  leaveBtn?.addEventListener('click', () => onLeave?.())

  let cardTimer = 0
  let toastTimer = 0
  let lastTime = -1
  let lastFalls = -1
  let lastState: string | null = null

  return {
    show() {
      root.hidden = false
      void root.offsetWidth
      root.classList.add('is-on')
    },
    hide() {
      root.classList.remove('is-on')
      window.setTimeout(() => {
        if (!root.classList.contains('is-on')) root.hidden = true
      }, reducedMotion() ? 0 : 260)
    },

    setLevel(index, total, name) {
      if (levelNo) levelNo.textContent = `${index + 1} / ${total}`
      if (levelName) levelName.textContent = name
    },

    setTimer(seconds) {
      // called every frame; only touch the DOM when the second changes
      const s = Math.floor(seconds)
      if (s === lastTime || !timer) return
      lastTime = s
      timer.textContent = fmt(s)
    },

    setFalls(n) {
      if (n === lastFalls || !falls) return
      lastFalls = n
      falls.textContent = `${n} fall${n === 1 ? '' : 's'}`
    },

    setState(text) {
      // called every frame, and it changes about twice a minute
      if (text === lastState || !state) return
      lastState = text
      // the word stays through the fade out, so it does not blink to empty
      if (text) state.textContent = text
      state.dataset.on = text ? 'true' : 'false'
    },

    card(name, index, hint) {
      if (!card) return
      if (cardNo) cardNo.textContent = `Level ${index + 1}`
      if (cardName) cardName.textContent = name
      if (cardHint) cardHint.textContent = hint
      card.dataset.on = 'true'
      window.clearTimeout(cardTimer)
      cardTimer = window.setTimeout(() => {
        card.dataset.on = 'false'
        // short: it names the course and gets out of the way, because where it
        // sits is also where the first jumps are
      }, 2300)
    },

    toast(text) {
      if (!toastEl) return
      toastEl.textContent = text
      toastEl.dataset.on = 'true'
      window.clearTimeout(toastTimer)
      toastTimer = window.setTimeout(() => {
        toastEl.dataset.on = 'false'
      }, 1600)
    },

    complete(opts) {
      if (!panel) return
      if (panelTitle) panelTitle.textContent = opts.title
      if (panelBody) {
        panelBody.replaceChildren(
          ...opts.lines.map((line) => {
            const p = document.createElement('p')
            p.textContent = line
            return p
          }),
        )
      }
      onNext = opts.onNext
      onRetry = opts.onRetry
      onLeave = opts.onLeave
      if (nextBtn) {
        nextBtn.hidden = !opts.nextLabel
        if (opts.nextLabel) nextBtn.textContent = opts.nextLabel
      }
      panel.hidden = false
      void panel.offsetWidth
      panel.dataset.on = 'true'
      nextBtn && !nextBtn.hidden ? nextBtn.focus() : retryBtn?.focus()
    },

    hidePanel() {
      if (!panel) return
      panel.dataset.on = 'false'
      window.setTimeout(() => {
        if (panel.dataset.on === 'false') panel.hidden = true
      }, reducedMotion() ? 0 : 220)
    },

    setLockPrompt(on) {
      if (lock) lock.hidden = !on
    },

    onLockRequest(cb) {
      lockCbs.push(cb)
    },
    onExit(cb) {
      exitCbs.push(cb)
    },
    onRestart(cb) {
      restartCbs.push(cb)
    },

    crosshair(on) {
      const cross = el('pk-cross')
      if (cross) cross.hidden = !on
    },

    fade(to) {
      if (fadeEl) fadeEl.style.opacity = String(to)
    },

    setTouch(on) {
      if (touch) touch.hidden = !on
    },

    dispose() {
      window.clearTimeout(cardTimer)
      window.clearTimeout(toastTimer)
    },
  }
}

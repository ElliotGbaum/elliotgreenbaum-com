/// <reference types="vite/client" />
/**
 * The Places menu — a bottom sheet on a phone, a centred card on a desktop.
 *
 * This is not a convenience. It is the keyboard and screen-reader route to
 * every landmark in the world, so it is built out of real buttons, it is
 * fully operable with Tab and Enter, and "visited" is carried by a shape and
 * by text, never by colour alone.
 */
import './ui.css'
import { mountOverlay, reducedMotion, SHEET_MS } from './panel'

export interface PlaceItem {
  id: string
  title: string
  hint: string
  visited: boolean
}

export interface Places {
  setItems(items: PlaceItem[]): void
  open(): void
  close(): void
  onTravel(cb: (id: string) => void): void
}

function noopPlaces(): Places {
  return { setItems() {}, open() {}, close() {}, onTravel() {} }
}

export function createPlaces(): Places {
  const root = document.getElementById('places')
  const list = document.getElementById('places-list')
  if (!root || !list) return noopPlaces()

  const sheet = root.querySelector<HTMLElement>('.sheet')
  const closeBtn = document.getElementById('places-close')
  const titleEl = root.querySelector<HTMLElement>('.sheet__title')

  // The markup is a <nav>, but the behaviour is modal: it covers the world,
  // traps focus and closes on Escape. Announce it as what it does.
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  if (!root.hasAttribute('aria-label')) root.setAttribute('aria-label', 'Places')
  if (titleEl && !titleEl.id) {
    titleEl.id = 'places-title'
    root.removeAttribute('aria-label')
    root.setAttribute('aria-labelledby', 'places-title')
  }
  sheet?.setAttribute('tabindex', '-1')
  list.setAttribute('role', 'list')
  closeBtn?.setAttribute('aria-label', 'Close places')

  const travelCbs: Array<(id: string) => void> = []
  let items: PlaceItem[] = []
  let opened = false
  let release: (() => void) | null = null
  let trigger: HTMLElement | null = null
  let hideTimer = 0

  const buttons = (): HTMLButtonElement[] =>
    Array.from(list.querySelectorAll<HTMLButtonElement>('button.place'))

  const render = () => {
    const focusedId =
      document.activeElement instanceof HTMLElement
        ? (document.activeElement.closest<HTMLElement>('button.place')?.dataset.id ?? null)
        : null

    const rows = items.map((item) => {
      const li = document.createElement('li')

      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'place'
      btn.dataset.id = item.id
      if (item.visited) btn.dataset.visited = 'true'

      // filled vs hollow — a shape difference, not just a colour one
      const mark = document.createElement('span')
      mark.className = 'place__mark'
      mark.setAttribute('aria-hidden', 'true')

      const text = document.createElement('span')
      text.className = 'place__text'

      const title = document.createElement('span')
      title.className = 'place__title'
      title.textContent = item.title

      const hint = document.createElement('span')
      hint.className = 'place__hint'
      hint.textContent = item.hint

      // ...and in words, for anyone who cannot see either
      const state = document.createElement('span')
      state.className = 'u-sr'
      state.textContent = item.visited ? '. Visited.' : '. Not visited yet.'

      text.append(title, hint, state)
      btn.append(mark, text)
      li.append(btn)
      return li
    })

    list.replaceChildren(...rows)

    if (opened && focusedId) {
      const again = list.querySelector<HTMLElement>(`button.place[data-id="${CSS.escape(focusedId)}"]`)
      if (again) again.focus({ preventScroll: true })
      else (buttons()[0] ?? closeBtn)?.focus({ preventScroll: true })
    }
  }

  const travel = (id: string) => {
    close()
    for (const cb of travelCbs.slice()) cb(id)
  }

  const open = () => {
    if (opened) return
    const active = document.activeElement as HTMLElement | null
    trigger = active && active !== document.body && active.isConnected ? active : null

    window.clearTimeout(hideTimer)
    root.hidden = false
    void root.offsetWidth
    root.classList.add('is-open')
    opened = true
    release = mountOverlay(root, close)

    document.getElementById('places-btn')?.setAttribute('aria-expanded', 'true')

    const first = buttons()[0] ?? (closeBtn as HTMLElement | null) ?? sheet
    first?.focus({ preventScroll: true })
  }

  const close = () => {
    if (!opened) return
    opened = false
    root.classList.remove('is-open')

    release?.()
    release = null

    document.getElementById('places-btn')?.setAttribute('aria-expanded', 'false')

    const back = trigger ?? document.getElementById('places-btn')
    trigger = null
    if (back && back.isConnected) back.focus({ preventScroll: true })

    window.clearTimeout(hideTimer)
    hideTimer = window.setTimeout(
      () => {
        if (!opened) root.hidden = true
      },
      reducedMotion() ? 0 : SHEET_MS,
    )
  }

  /* ---- wiring ---- */

  list.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>('button.place')
    const id = btn?.dataset.id
    if (id) travel(id)
  })

  // Tab and Enter already work — arrows are the extra courtesy.
  list.addEventListener('keydown', (e) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
    if (!keys.includes(e.key)) return
    const all = buttons()
    if (all.length === 0) return
    const active = document.activeElement as HTMLElement | null
    const i = active ? all.indexOf(active.closest('button.place') as HTMLButtonElement) : -1
    let next = 0
    if (e.key === 'ArrowDown') next = i < 0 ? 0 : (i + 1) % all.length
    else if (e.key === 'ArrowUp') next = i < 0 ? all.length - 1 : (i - 1 + all.length) % all.length
    else if (e.key === 'End') next = all.length - 1
    e.preventDefault()
    all[next]?.focus()
  })

  closeBtn?.addEventListener('click', close)
  root.addEventListener('click', (e) => {
    if (e.target === root) close()
  })

  return {
    setItems(next: PlaceItem[]) {
      items = next.slice()
      render()
    },
    open,
    close,
    onTravel(cb: (id: string) => void) {
      travelCbs.push(cb)
    },
  }
}

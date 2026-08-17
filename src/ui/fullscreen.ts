/**
 * FULL SCREEN — the one control on this site that is about the browser rather
 * than about the field.
 *
 * A phone turned on its side is the best shape this world has: the shot is
 * framed for it, the film lands wide, and the transport bar tucks into the
 * bottom. And then the browser puts its address bar across the top of it. On a
 * desktop that is the visitor's own window and none of our business; on a phone
 * there is no window to resize and no way to ask, except this.
 *
 * IT IS ONLY THERE WHEN ALL THREE OF THESE ARE TRUE, and that is the whole of
 * what this file decides:
 *
 *   the pointer is a finger   a mouse already has a window it can size, and a
 *                             third pill in the corner of a desktop is furniture
 *   the phone is on its side  upright, the bar is at the far end of a tall
 *                             picture and taking it costs more than it buys
 *   the browser will do it    the Fullscreen API is recent on the iPhone and
 *                             absent before it — and a button that does nothing
 *                             when pressed is worse than no button at all
 *
 * …plus one exception, which is the reason the visibility is computed rather
 * than left to a media query: WHILE THE PAGE IS ACTUALLY FULL SCREEN THE BUTTON
 * STAYS, whatever the phone is doing. Turning a full-screen phone upright would
 * otherwise take away the only way back out of it.
 *
 * The styles are in src/ui/ui.css under "full screen". This file writes two
 * things and no more: `hidden` on the button, and `has-fs-btn` on <html> so the
 * time-of-day switch can move out of the corner it has just taken.
 */

/* The prefixed halves. Safari's are not in lib.dom, and they are what an iPad
   answers to — the standard names arrived on the iPhone years after the
   feature did. */
interface WebkitElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void
}
interface WebkitDocument extends Document {
  webkitExitFullscreen?: () => Promise<void> | void
  webkitFullscreenElement?: Element | null
}

/** the three facts, as one query. Orientation is live; the rest never change. */
const HANDHELD = '(hover: none) and (pointer: coarse) and (orientation: landscape)'

export interface Fullscreen {
  dispose(): void
}

function noopFullscreen(): Fullscreen {
  return { dispose() {} }
}

export function createFullscreen(): Fullscreen {
  const btn = document.getElementById('fs-btn')
  if (!(btn instanceof HTMLButtonElement)) return noopFullscreen()

  const root = document.documentElement as WebkitElement
  const doc = document as WebkitDocument

  const request = root.requestFullscreen ?? root.webkitRequestFullscreen
  const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen
  /* No API, no button — and nothing else in this file ever runs. The markup
     ships `hidden`, so this is already the state of the page. */
  if (typeof request !== 'function' || typeof exit !== 'function') return noopFullscreen()

  const mq = typeof window.matchMedia === 'function' ? window.matchMedia(HANDHELD) : null

  // re-bound, because the narrowing above does not survive into the hoisted
  // function below — the same reason, and the same fix, as in film/controls.ts
  const button: HTMLButtonElement = btn

  const isFull = () => !!(doc.fullscreenElement ?? doc.webkitFullscreenElement)

  function update(): void {
    const on = isFull()
    const show = on || mq?.matches === true
    button.hidden = !show
    button.dataset.on = on ? 'true' : 'false'
    button.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen')
    document.documentElement.classList.toggle('has-fs-btn', show)
  }

  const onClick = (e: Event) => {
    e.preventDefault()
    try {
      /* A browser is allowed to say no — a permissions policy, a phone that
         only does this for video, a gesture it did not believe. The promise
         rejecting IS that answer, and it is not an error: the picture is still
         there, at the size it already was. */
      void Promise.resolve(isFull() ? exit.call(doc) : request.call(root)).catch(() => {})
    } catch {
      /* same answer, from a browser that throws instead of rejecting */
    }
  }

  /* Both spellings of the same event, because the button's own state is read
     off the document — and the way OUT of full screen is very often not this
     button at all: it is the swipe, or the Escape key, or the phone deciding
     for itself. Whatever ends it, the icon has to turn back over. */
  btn.addEventListener('click', onClick)
  document.addEventListener('fullscreenchange', update)
  document.addEventListener('webkitfullscreenchange', update)
  mq?.addEventListener('change', update)

  update()

  return {
    dispose() {
      btn.removeEventListener('click', onClick)
      document.removeEventListener('fullscreenchange', update)
      document.removeEventListener('webkitfullscreenchange', update)
      mq?.removeEventListener('change', update)
      document.documentElement.classList.remove('has-fs-btn')
    },
  }
}

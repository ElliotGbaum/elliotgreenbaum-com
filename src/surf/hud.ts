/**
 * The runner's chrome.
 *
 * The markup lives in index.html so it is styled without JS having to build it,
 * the same arrangement the film's transport and the parkour's bar use. This
 * module only wires it, and it degrades to a complete no-op when `#sf` is not
 * there — preview.html, filmstrip.html and sketches.html all load this bundle
 * without the world's markup and none of them may throw.
 *
 * WHAT IS ON SCREEN, AND WHY SO LITTLE.
 *
 * The centre 60 % of a runner's screen is the game and the bottom 30 % is
 * thumbs. That leaves two corners and a left edge, and everything that wants to
 * live in them has to earn it: score top-left with the multiplier under it,
 * this run's motes top-right, the powerup rings down the left edge, a pause
 * button, and the handcar. That is all.
 *
 * DELIBERATELY ABSENT, every one of which the real game could have had and did
 * not: a health bar (you have one life), lives, a minimap, a distance readout
 * (the score IS the distance), a speedometer, a joystick, a combo meter,
 * tutorial text after the first run, and ads. Mission progress appears ONLY on
 * the run-over panel, never during the run — a progress bar you cannot act on
 * is a thing pulling your eye off the only three lanes that matter.
 *
 * THE RINGS ARE RINGS, NOT BARS. A depleting circle is the only timer form
 * that survives peripheral vision: the eye reads "most of a circle" without
 * fixating, and a bar reads as nothing at all unless you look straight at it.
 * Amber while it is healthy, sage under a quarter, and it blinks near the end.
 *
 * THE SCORE LERPS. It is fed the true value every frame and eases toward it at
 * rate 12, so it is always climbing rather than stepping — a number that ticks
 * up is felt as reward and a number that jumps is felt as arithmetic. This is
 * the ONLY value that is smoothed; the motes, the multiplier and the distance
 * are facts and are shown as facts.
 *
 * WRONG TURNS, WRITTEN DOWN:
 *
 * 1. WRITING THE DOM EVERY FRAME. Setting `textContent` to the string it
 *    already holds still invalidates layout on some engines, and at 60 fps with
 *    eight readouts that is 480 pointless style recalcs a second on the device
 *    least able to afford them. Every setter compares first and returns.
 * 2. `:active` FOR A BUTTON'S LIT STATE. A thumb that slides off the button
 *    still holds the input, so `:active` and the game come apart at exactly the
 *    moment the player is mid-jump looking for reassurance. Lit state is driven
 *    by the same flag the simulation reads, through `data-on`.
 * 3. `aria-live="assertive"` ON THE TOAST. At a runner's event rate a screen
 *    reader talks continuously over itself and the game becomes unusable for
 *    the person the attribute was added for. It is `polite`, and nothing on
 *    this screen is assertive.
 * 4. FORGETTING THAT A STYLESHEET `display` BEATS THE `hidden` ATTRIBUTE. Any
 *    element surf.css gives a display must restate `[hidden] { display: none }`
 *    or an invisible full-screen panel sits over the game eating every click.
 *    That is a CSS fix, but the bug is found here, so it is written here too.
 */

import { clamp, reducedMotion } from '../core/contract'

export interface RunSummary {
  readonly score: number
  readonly best: number
  readonly newBest: boolean
  readonly distance: number
  readonly motes: number
  readonly bank: number
  readonly mult: number
  readonly nearMisses: number
  readonly cause: string // the sentence, already chosen by surf.ts
  readonly missions: readonly { readonly text: string; readonly at: number; readonly of: number }[]
  /** null when no revive is affordable or offered */
  readonly revive: { readonly cost: number } | null
}

export interface PowerRing {
  readonly kind: string // PowerKind, stringly so hud imports nothing
  /** 0..1 remaining */
  readonly at: number
  readonly label: string
}

export interface SurfHud {
  show(): void
  hide(): void
  /** every frame; each setter must no-op when the value has not changed */
  setScore(score: number): void
  setMult(mult: number): void
  setMotes(n: number): void
  setDistance(units: number): void
  setBest(score: number): void
  setRings(rings: readonly PowerRing[]): void
  setHandcars(n: number, ready: boolean): void
  /** the guard's proximity, 0..1, for the shadow warning strip */
  setHeat(heat: number): void
  /** the lane strip chevron when the night service is coming */
  setService(lane: -1 | 0 | 1 | null): void
  /** the `close ×3` tick under the score */
  near(chain: number, points: number): void
  /** the opening card: 'The trainyard' / 'Trainyard Run' / one line of hint */
  card(no: string, name: string, hint: string): void
  /** transient line, auto-clears. Clear any pending timeout before re-arming. */
  toast(text: string | null, ms?: number): void
  /** the run-over panel. `null` hides it. */
  panel(s: RunSummary | null): void
  /** the revive ring's remaining fraction, 1 → 0 over REVIVE_WINDOW */
  setReviveRing(at: number): void
  /** 0..1 black veil, driven by an eased value in surf.ts */
  fade(to: number): void
  /** show/hide the thumb buttons */
  setTouch(on: boolean): void
  onAgain(cb: () => void): void
  onRevive(cb: () => void): void
  onLeave(cb: () => void): void
  onPause(cb: () => void): void
  dispose(): void
}

/** how fast the displayed score chases the real one, per second */
const SCORE_RATE = 12
/** the card names the place and gets out of the way */
const CARD_MS = 2600
const TOAST_MS = 1600
/** a near-miss tick is a flash, not a message */
const NEAR_MS = 800
/** r=19 in a 44-box, so the 3px stroke sits inside the edge */
const RING_R = 19
const RING_C = 2 * Math.PI * RING_R
const SVG_NS = 'http://www.w3.org/2000/svg'

/** the distance readout, and the panel's `best 0 m` line */
const metres = (u: number) => `${Math.max(0, Math.floor(u))} m`

function noop(): SurfHud {
  return {
    show() {}, hide() {}, setScore() {}, setMult() {}, setMotes() {}, setDistance() {},
    setBest() {}, setRings() {}, setHandcars() {}, setHeat() {}, setService() {}, near() {},
    card() {}, toast() {}, panel() {}, setReviveRing() {}, fade() {}, setTouch() {},
    onAgain() {}, onRevive() {}, onLeave() {}, onPause() {}, dispose() {},
  }
}

/** one powerup's ring, pooled — a run can hold five at once and drop to none */
interface Ring {
  slot: HTMLElement
  arc: SVGCircleElement
  label: HTMLElement
  kind: string
  at: number
  low: boolean
}

export function createSurfHud(): SurfHud {
  const root = document.getElementById('sf')
  if (!root) return noop()

  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null
  const scoreEl = el('sf-score')
  const multEl = el('sf-mult')
  const motesEl = el('sf-motes')
  const distEl = el('sf-dist')
  const bestEl = el('sf-best')
  const ringsEl = el('sf-rings')
  const heatEl = el('sf-heat')
  const lanesEl = el('sf-lanes')
  const nearEl = el('sf-near')
  const cardEl = el('sf-card')
  const cardNo = el('sf-card-no')
  const cardName = el('sf-card-name')
  const cardHint = el('sf-card-hint')
  const toastEl = el('sf-toast')
  const stateEl = el('sf-state')
  const keysEl = el('sf-keys')
  const panelEl = el('sf-panel')
  const panelTitle = el('sf-panel-title')
  const panelBody = el('sf-panel-body')
  const againBtn = el<HTMLButtonElement>('sf-again')
  const reviveBtn = el<HTMLButtonElement>('sf-revive')
  const leaveBtn = el<HTMLButtonElement>('sf-leave')
  const restartBtn = el<HTMLButtonElement>('sf-restart')
  const exitBtn = el<HTMLButtonElement>('sf-exit')
  const pauseBtn = el<HTMLButtonElement>('sf-pause')
  const deployBtn = el<HTMLButtonElement>('sf-deploy')
  const touchEl = el('sf-touch')
  const fadeEl = el('sf-fade')

  const againCbs: Array<() => void> = []
  const reviveCbs: Array<() => void> = []
  const leaveCbs: Array<() => void> = []
  const pauseCbs: Array<() => void> = []
  const fire = (list: Array<() => void>) => {
    for (const cb of list.slice()) cb()
  }

  // #sf-restart is the bar's version of Again and #sf-exit is the bar's version
  // of Leave — the same two verbs in the two places you want them, wired to the
  // one pair of callback lists so surf.ts never has to know there are four
  // buttons. (#sf-deploy belongs to input.ts, not here: it is a gameplay
  // action and it goes through the same queue every other intent does.)
  againBtn?.addEventListener('click', () => fire(againCbs))
  restartBtn?.addEventListener('click', () => fire(againCbs))
  reviveBtn?.addEventListener('click', () => fire(reviveCbs))
  leaveBtn?.addEventListener('click', () => fire(leaveCbs))
  exitBtn?.addEventListener('click', () => fire(leaveCbs))
  pauseBtn?.addEventListener('click', () => fire(pauseCbs))

  /* ---- the caches. Nothing below writes the DOM twice for one value. ---- */
  let shownScore = 0 // the lerped number actually on screen
  let trueScore = 0
  let lastScoreTxt = ''
  let lastScoreAt = 0
  let lastMult = -1
  let lastMotes = -1
  let lastDist = -1
  let lastBest = -1
  let lastHeat = -1
  let lastService: -1 | 0 | 1 | null | undefined
  let lastHandcars = -1
  let lastReady: boolean | undefined
  let lastTouch: boolean | undefined
  let lastFade = -1
  let lastRevive = -1
  let panelOpen = false

  let cardTimer = 0
  let toastTimer = 0
  let nearTimer = 0

  const rings: Ring[] = []

  /** build one ring. The container is markup; the rings are content, and the
      count changes several times a run, so they are made here and pooled. */
  function makeRing(): Ring {
    const slot = document.createElement('div')
    slot.className = 'sf-ring'
    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('viewBox', '0 0 44 44')
    svg.setAttribute('aria-hidden', 'true')
    const bg = document.createElementNS(SVG_NS, 'circle')
    bg.setAttribute('class', 'sf-ring-bg')
    bg.setAttribute('cx', '22')
    bg.setAttribute('cy', '22')
    bg.setAttribute('r', String(RING_R))
    const arc = document.createElementNS(SVG_NS, 'circle')
    arc.setAttribute('class', 'sf-ring-arc')
    arc.setAttribute('cx', '22')
    arc.setAttribute('cy', '22')
    arc.setAttribute('r', String(RING_R))
    arc.setAttribute('stroke-dasharray', String(RING_C))
    svg.append(bg, arc)
    const label = document.createElement('span')
    label.className = 'sf-ring-label'
    slot.append(svg, label)
    ringsEl?.append(slot)
    return { slot, arc, label, kind: '', at: -1, low: false }
  }

  return {
    show() {
      root.hidden = false
      // a forced reflow, or the browser batches the unhide and the opacity
      // transition together and the fade in never happens
      void root.offsetWidth
      root.classList.add('is-on')
    },

    hide() {
      root.classList.remove('is-on')
      window.setTimeout(
        () => {
          if (!root.classList.contains('is-on')) root.hidden = true
        },
        reducedMotion() ? 0 : 260,
      )
    },

    setScore(score) {
      trueScore = score
      if (!scoreEl) return
      const now = performance.now()
      // dt from the last call, clamped: a tab that was in the background for
      // ten seconds must not make the number teleport, it must catch up in the
      // same fifth of a second everything else does
      const dt = lastScoreAt > 0 ? Math.min(0.1, (now - lastScoreAt) / 1000) : 0
      lastScoreAt = now
      // A score never falls inside a run, so a fall means a new run started.
      // Easing down from the last run's total looks like a penalty.
      if (trueScore < shownScore) shownScore = trueScore
      // 1 - exp(-rate*dt), never min(1, dt*rate) — house rule 3
      shownScore += (trueScore - shownScore) * (1 - Math.exp(-SCORE_RATE * dt))
      // within a point of the truth it stops chasing and states it, or the last
      // 0.4 of a point crawls forever and the readout is permanently one short
      if (Math.abs(trueScore - shownScore) < 1) shownScore = trueScore
      const txt = String(Math.floor(shownScore))
      if (txt === lastScoreTxt) return
      lastScoreTxt = txt
      scoreEl.textContent = txt
    },

    setMult(mult) {
      if (mult === lastMult || !multEl) return
      lastMult = mult
      multEl.textContent = `×${mult}`
      // at ×1 there is no multiplier to speak of and the slot goes quiet
      multEl.dataset.on = mult > 1 ? 'true' : 'false'
    },

    setMotes(n) {
      if (n === lastMotes || !motesEl) return
      lastMotes = n
      motesEl.textContent = String(n)
    },

    setDistance(units) {
      const m = Math.max(0, Math.floor(units))
      if (m === lastDist || !distEl) return
      lastDist = m
      distEl.textContent = metres(m)
    },

    setBest(score) {
      if (score === lastBest || !bestEl) return
      lastBest = score
      bestEl.textContent = `best ${Math.floor(score)}`
      bestEl.dataset.on = score > 0 ? 'true' : 'false'
    },

    setRings(list) {
      if (!ringsEl) return
      while (rings.length < list.length) rings.push(makeRing())
      for (let i = 0; i < rings.length; i++) {
        const r = rings[i]!
        const p = list[i]
        if (!p) {
          if (r.slot.dataset.on !== 'false') r.slot.dataset.on = 'false'
          continue
        }
        if (r.slot.dataset.on !== 'true') r.slot.dataset.on = 'true'
        if (p.kind !== r.kind) {
          r.kind = p.kind
          r.slot.dataset.kind = p.kind
          r.label.textContent = p.label
        }
        const at = clamp(p.at)
        // a hundredth of a ring is a third of a pixel of arc — below that the
        // write is invisible and it happens sixty times a second
        if (Math.abs(at - r.at) > 0.005) {
          r.at = at
          r.arc.setAttribute('stroke-dashoffset', (RING_C * (1 - at)).toFixed(2))
        }
        // sage under a quarter, and it starts blinking there too: the colour
        // shift is for the eye that is looking, the blink for the one that is
        // not
        const low = at < 0.25
        if (low !== r.low) {
          r.low = low
          r.slot.dataset.low = low ? 'true' : 'false'
        }
      }
    },

    setHandcars(n, ready) {
      if (!deployBtn) return
      if (n !== lastHandcars) {
        lastHandcars = n
        deployBtn.textContent = n > 1 ? `Handcar ×${n}` : 'Handcar'
        deployBtn.hidden = n <= 0
      }
      if (ready !== lastReady) {
        lastReady = ready
        // the same flag the simulation reads — never :active
        deployBtn.dataset.on = ready ? 'true' : 'false'
        deployBtn.disabled = !ready
      }
    },

    setHeat(heat) {
      if (!heatEl) return
      const h = clamp(heat)
      if (Math.abs(h - lastHeat) < 0.01) return
      lastHeat = h
      // the strip is the guard's lantern coming up behind you; it is a
      // brightness, not a bar, because a bar would be a second thing to read
      heatEl.style.opacity = h.toFixed(2)
      heatEl.dataset.on = h > 0.02 ? 'true' : 'false'
    },

    setService(lane) {
      if (lane === lastService || !lanesEl) return
      lastService = lane
      lanesEl.dataset.lane = lane === null ? '' : lane === -1 ? 'l' : lane === 0 ? 'c' : 'r'
      lanesEl.dataset.on = lane === null ? 'false' : 'true'
    },

    near(chain, points) {
      if (!nearEl) return
      nearEl.textContent = chain > 1 ? `close ×${chain}  +${points}` : `close  +${points}`
      nearEl.dataset.on = 'true'
      window.clearTimeout(nearTimer)
      nearTimer = window.setTimeout(() => {
        nearEl.dataset.on = 'false'
      }, NEAR_MS)
    },

    card(no, name, hint) {
      if (!cardEl) return
      if (cardNo) cardNo.textContent = no
      if (cardName) cardName.textContent = name
      if (cardHint) cardHint.textContent = hint
      cardEl.dataset.on = 'true'
      window.clearTimeout(cardTimer)
      cardTimer = window.setTimeout(() => {
        cardEl.dataset.on = 'false'
      }, CARD_MS)
    },

    toast(text, ms) {
      if (!toastEl) return
      // clear first, always: two toasts in a second and the first one's timer
      // would take the second one off the screen early
      window.clearTimeout(toastTimer)
      if (text === null) {
        toastEl.dataset.on = 'false'
        return
      }
      toastEl.textContent = text
      toastEl.dataset.on = 'true'
      toastTimer = window.setTimeout(() => {
        toastEl.dataset.on = 'false'
      }, ms ?? TOAST_MS)
    },

    panel(s) {
      if (!panelEl) return
      if (s === null) {
        if (!panelOpen) return
        panelOpen = false
        panelEl.dataset.on = 'false'
        window.setTimeout(
          () => {
            if (panelEl.dataset.on === 'false') panelEl.hidden = true
          },
          reducedMotion() ? 0 : 220,
        )
        return
      }

      if (panelTitle) panelTitle.textContent = s.newBest ? 'A new best' : 'Run over'
      if (panelBody) {
        const kids: HTMLElement[] = []
        const line = (cls: string, ...parts: string[]) => {
          const p = document.createElement('p')
          p.className = cls
          p.textContent = parts.join('')
          kids.push(p)
        }
        // the cause first, because after a death the player's only question is
        // which way they got it wrong
        line('sf-cause', s.cause)
        const big = document.createElement('p')
        big.className = 'sf-big'
        big.textContent = String(Math.floor(s.score))
        kids.push(big)
        line('sf-sub', `best ${Math.floor(s.best)}`, s.newBest ? ' — beaten' : '')
        line(
          'sf-sub',
          `${metres(s.distance)}  ·  ${s.motes} motes  ·  ×${s.mult}`,
          s.nearMisses > 0 ? `  ·  ${s.nearMisses} close` : '',
        )
        line('sf-sub', `${s.bank} banked`)
        // mission progress lives here and nowhere else
        for (const m of s.missions) {
          const p = document.createElement('p')
          p.className = 'sf-mission'
          p.dataset.done = m.at >= m.of ? 'true' : 'false'
          const t = document.createElement('span')
          t.textContent = m.text
          const n = document.createElement('b')
          n.textContent = `${Math.min(m.at, m.of)}/${m.of}`
          const bar = document.createElement('i')
          bar.style.setProperty('--sf-at', String(clamp(m.of > 0 ? m.at / m.of : 0)))
          p.append(t, n, bar)
          kids.push(p)
        }
        panelBody.replaceChildren(...kids)
      }

      if (reviveBtn) {
        reviveBtn.hidden = s.revive === null
        if (s.revive) reviveBtn.textContent = `Carry on — ${s.revive.cost}`
      }

      panelEl.hidden = false
      void panelEl.offsetWidth
      panelEl.dataset.on = 'true'
      panelOpen = true
      // Focus goes to the thing you are most likely to want, so the whole death
      // → retry → leave path is Tab-free from a keyboard. It is never the
      // revive: a paid button that is focused when the panel appears is a
      // button somebody buys by pressing Space out of habit.
      ;(againBtn ?? leaveBtn)?.focus()
    },

    setReviveRing(at) {
      if (!reviveBtn) return
      const v = clamp(at)
      if (Math.abs(v - lastRevive) < 0.01) return
      lastRevive = v
      reviveBtn.style.setProperty('--sf-rev', v.toFixed(3))
    },

    fade(to) {
      if (!fadeEl) return
      const v = clamp(to)
      if (Math.abs(v - lastFade) < 0.004) return
      lastFade = v
      fadeEl.style.opacity = v.toFixed(3)
    },

    setTouch(on) {
      if (on === lastTouch) return
      lastTouch = on
      if (touchEl) touchEl.hidden = !on
      // One device, one set of instructions. #sf-keys is the keyboard legend
      // and #sf-state is the thumb one; showing both at once is how a player
      // ends up reading the half that does not apply to the thing in their
      // hand. They are static lines of markup — this only chooses which.
      if (keysEl) keysEl.hidden = on
      if (stateEl) stateEl.hidden = !on
    },

    onAgain(cb) {
      againCbs.push(cb)
    },
    onRevive(cb) {
      reviveCbs.push(cb)
    },
    onLeave(cb) {
      leaveCbs.push(cb)
    },
    onPause(cb) {
      pauseCbs.push(cb)
    },

    dispose() {
      window.clearTimeout(cardTimer)
      window.clearTimeout(toastTimer)
      window.clearTimeout(nearTimer)
      for (const r of rings.splice(0)) r.slot.remove()
      againCbs.length = 0
      reviveCbs.length = 0
      leaveCbs.length = 0
      pauseCbs.length = 0
    },
  }
}

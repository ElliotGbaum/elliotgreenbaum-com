/**
 * elliotgreenbaum.com — entry point.
 *
 * Boots the world only if WebGL is actually available — which index.html has
 * already decided, before the first paint. If it isn't, we do nothing at all
 * and the card already in index.html stays on screen: that block is the
 * fallback, the accessibility path and the indexable content, so the correct
 * failure mode here is silence.
 *
 * ONE THING TO DO. There is no menu, no résumé button and no takeover panel:
 * the story *is* the film, the film is thrown by the projector, and the
 * projector is switched on by GETTING TO IT AND ASKING. Everything below exists
 * to make that single sentence impossible to miss — the compass names the
 * projector, the prompt line says what switching it on gets you, the machine
 * pings a set of rings out across the floor, and a key badge floats at the
 * switch once you are close enough to reach it.
 *
 * TWO WAYS TO GET THERE AND ONE RULE ABOUT ARRIVING. You drive with the keys
 * and press E at the machine, or you HOLD the button down on the ground and the
 * figure walks toward the cursor for as long as you hold it — let go and it
 * stops — or you point at the machine itself, and that last one does NOT throw
 * the switch from where you are standing. It sends the figure over and the film
 * starts when the figure arrives. The distinction is the whole reason the
 * pointer is allowed back at all: a click is the one gesture here that carries
 * no intent — you click to look, you click to dismiss, you click because the
 * pointer happened to be over the one object in the field — and an earlier
 * version let it start two minutes of film from thirty units away, before the
 * visitor had arrived at the thing they had supposedly asked for. Walking over
 * is still the asking; the pointer is now a second way to say "walk over".
 *
 * It is asked for, never assumed. Walking into the projector's radius used to
 * start the film on its own after half a second of standing still, which meant
 * the one thing this site is for could happen to somebody who was only walking
 * past it — and it could happen before they had read the line telling them it
 * was about to. Two minutes of film is a commitment; it waits to be asked.
 */

import * as THREE from 'three'
import './style.css'
import './ui/ui.css'
import './film/film.css'

import {
  PALETTE,
  REDUCED_MOTION,
  type Landmark,
  type LandmarkContext,
} from './core/contract'
import { timeOfDayFor, sunElevation, elliotPlace, elliotClock } from './core/sun'
import { createField, FIELD_RADIUS } from './world/field'
import { createScenery } from './world/scenery'
import { createPlayer } from './world/player'
import { createRig } from './world/camera'
import { createProjector } from './world/landmarks/projector'
import { createElliot } from './world/landmarks/elliot'
import { createHud } from './ui/hud'
import { createInteractPrompt } from './ui/interact'
import { createChat } from './ui/chat'
import { createFullscreen } from './ui/fullscreen'
import { CANVAS_H, CANVAS_W, CHAPTERS, createFilm } from './film/film'
import { createFilmControls } from './film/controls'
import { LINKS } from './film/links'
import { createFilmStage } from './world/filmstage'

/* ---------------- THE TWO OTHER WORLDS ARE SHELVED ----------------
 * There were two minigames out here — a parkour course through a portal east
 * of the projector, and an endless trainyard run west of it — each behind a
 * sign that built itself out of the ground when the film had been watched.
 * None of that is wired up any more, and the whole of it is a *deliberate*
 * absence rather than a removal: every module is still on disk, untouched and
 * still typechecked, in src/parkour/, src/surf/, src/world/landmarks/gate.ts
 * and src/world/landmarks/signal.ts, with their harnesses in tools/.
 *
 * WHAT WAS TAKEN OUT OF THIS FILE, which is the whole of what it costs to put
 * them back: the six imports above; both signs in `landmarks`; the two doors in
 * `ctx`; the unlock ceremony and its `REVEAL_*` timings; `began`, which was the
 * flag that earned it; the two "have you played it yet" flags and the compass's
 * choice between them; the `?unlock`/`?parkour`/`?surf` shortcuts; and the
 * `inGame()` guard that every pointer, key and resize path asked before it
 * assumed the field was what is on screen.
 *
 * The field is back to ONE THING TO DO, which is what the header above
 * describes and what it described before the games existed.
 */

/* The two things index.html's probe leaves on `window` for this file: whether
   the machine can run WebGL at all, and the way to tell the watchdog it can
   stop watching. Both are set before this bundle is parsed. */
declare global {
  interface Window {
    __webgl?: boolean
    __worldBooted?: () => void
  }
}

/** how long the world gets to fade up before the standing instruction appears */
const LEAD_DELAY = 1.8

/* The WebGL probe itself is the inline script in index.html: it has to run
   before the first paint, or the card flashes up for as long as this
   bundle takes to arrive and then disappears. All that is left here is to
   read the answer it left behind.

   The answer is `window.__webgl` and NOT the class on <html>. The class is
   what the page is currently showing, and index.html's watchdog is allowed
   to take it away while this bundle is still in flight — so reading the
   class meant a slow load could arrive to find its own permission revoked
   and quietly decline to boot at all, on a machine that runs the world
   fine. The flag is the fact; boot() puts the class back. */
if (window.__webgl) {
  try {
    boot()
    // the world is up: stand the watchdog down, whatever it was about to do
    window.__worldBooted?.()
  } catch (err) {
    // the probe said yes and the renderer said no — back to the card
    document.documentElement.classList.remove('has-webgl')
    console.error(err)
  }
}

/**
 * Device pixels per CSS pixel, capped.
 *
 * ONE ANSWER, ASKED IN THREE PLACES — the renderer's buffer, the resize
 * handler, and the size of the film's picture. They have to agree: a picture
 * painted for three device pixels per unit and displayed on a canvas drawn at
 * two is a picture being thrown away, and the other way round is a picture
 * being magnified. The cap at 2 is the usual bargain, and it is why a phone
 * at 3× is not asked to fill nine pixels for every one it can show you.
 */
function pixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, 2)
}

function boot() {
  const root = document.documentElement
  const world = document.getElementById('world') as HTMLDivElement
  const canvas = document.getElementById('stage') as HTMLCanvasElement
  // normally already there; this re-arms it if the boot watchdog gave up first
  root.classList.add('has-webgl')
  world.removeAttribute('aria-hidden')

  /* ---------------- renderer ---------------- */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: window.devicePixelRatio < 2,
    powerPreference: 'high-performance',
  })
  /* ---------------- the context can be taken away ----------------
     A phone browser under memory pressure — a backgrounded tab, Low Power
     Mode, another app asking for the GPU — drops the WebGL context out from
     under a live page, and iOS Safari does it readily. Left alone the result
     is the worst screen this site can show: the world stops painting mid-frame
     and the HUD stays exactly where it was, so a visitor is left looking at an
     empty rectangle with a compass pointing at a projector that is no longer
     drawn and a line of text telling them to walk to it. It never recovers,
     and nothing on screen admits anything happened.

     There is already a lane for a machine that cannot run the world, and this
     is a machine that can no longer run the world: drop the class and the card
     in index.html comes back — the name and three ways to reach him, which is
     the honest floor here as much as it is at boot. Same move index.html's own
     script-error handler makes.

     preventDefault is not optional: without it the browser never bothers to
     fire `webglcontextrestored`, which forecloses ever rebuilding the world
     in place. */
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    running = false
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    root.classList.remove('has-webgl')
    world.setAttribute('aria-hidden', 'true')
  })

  renderer.setPixelRatio(pixelRatio())
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  // exposure belongs to the time of day, so the field owns it and the frame
  // loop below reads it back off `field.exposure` every frame
  renderer.toneMappingExposure = 1.36

  const scene = new THREE.Scene()
  const rig = createRig()
  const field = createField(scene)
  const player = createPlayer(scene)

  /* ---------------- the film ----------------
     Built first, because the projector's screen is made of it: the film owns
     a canvas, the projector hangs that canvas on the screen as a texture, and
     the picture plays out in the world rather than over the top of it. */
  const film = createFilm()
  const controls = createFilmControls(film)

  /* ---------------- what is out there ----------------
     ONE landmark, and nothing else: everything in this field is something you
     can walk up to and use. There was scenery as well — a lit billboard that
     said hello, on from the first frame — and it is gone, along with the `Prop`
     type that existed for it alone.

     The list stays a list. It was three for a while (see the shelf note at the
     top of this file) and everything downstream — proximity, prompts, the
     badge, the raycast — iterates it rather than naming the projector, so
     putting a landmark back is one push and no other edit. */
  const projector = createProjector(film.canvas)
  /* …and one more, since: Elliot himself, standing up by the screen with a
     lantern, off to its right, quiet until you come to him or the film has
     been watched. He is the one thing out here that talks back — an AI with
     his notes answers for him (see the header of
     src/world/landmarks/elliot.ts). He is a landmark like the projector is:
     walk up, press E, and the field hands you a panel. He never fires for
     being walked past. */
  const elliot = createElliot()
  const landmarks: Landmark[] = [projector, elliot]

  // what is simply there: a horizon, a sky, fireflies, and by day a meadow —
  // bare under the machine
  const scenery = createScenery(scene, {
    clearing: new THREE.Vector3(0, 0, 4),
  })

  /* The standing instruction, shown until the film has been watched once — and
     it is LITERALLY the projector's own prompt, not a second sentence that
     means the same thing. The two used to be different phrasings, so the line
     rewrote itself as you closed the distance and you re-read an instruction
     you had already followed. Sharing the string means `say()`'s
     already-showing check swallows the hand-off entirely: the words on screen
     when you are thirty units out are the same words, unmoved, when you arrive. */
  const LEAD = projector.prompt
  for (const l of landmarks) scene.add(l.object)

  /* ---------------- the film's third dimension ----------------
     A few acts reach off the screen into the band of field under it. It is an
     enhancement and it is on; `d` turns it off, so the flat cut can always be
     compared against it without anything in the transport bar asking. */
  const stage = createFilmStage()
  scene.add(stage.object)
  controls.onDepth((on) => stage.setEnabled(on))

  /* ---------------- chrome ---------------- */
  const hud = createHud()
  /* …and the one piece of chrome that is not fixed to an edge of the screen:
     the key badge that floats at the switch on the projector when you are
     close enough to touch it. It lives in the #hud layer, so the film takes it
     away with everything else, and it is positioned every frame down in the
     loop off whatever landmark you are standing at. */
  const badge = createInteractPrompt()
  /** how close to a landmark's `reach` point the badge appears, world units */
  const REACH = 10

  /* …and the one piece of chrome that is not about the world at all: the
     full-screen button, which exists only on a phone held sideways and only
     where the browser has an API for it. It decides that for itself — see
     src/ui/fullscreen.ts — and it is deliberately outside #hud, because the
     HUD goes away for the length of the film and that is when the top inch of
     the picture is worth most. Everything downstream is free: going full
     screen changes the canvas box, the box is what the resize below measures,
     and the shot re-frames itself on the way. */
  const fullscreen = createFullscreen()

  /* …and the panel you talk to Elliot in. It is DOM, at the film bar's layer,
     and it knows nothing about the world: `startTalk` below walks the figure
     over, frames the pair, and only then opens it; closing it — the Leave
     button or Escape — hands the field back through `finishTalk`. */
  const chat = createChat()

  let suppressUntil = 0 // brief cooldown so leaving the film doesn't re-trigger it
  const now = () => performance.now() / 1000

  /* The prompt line, and the only thing allowed to write to it. It is asked
     for once a frame from the loop below, so it has to be free to call and it
     has to remember what it last said — otherwise the film's `say(null)` on
     the way in leaves the loop believing the line is still up, and it never
     puts it back. */
  let shownPrompt: string | null = null
  function say(text: string | null): void {
    if (text === shownPrompt) return
    shownPrompt = text
    hud.setPrompt(text)
  }

  const ctx: LandmarkContext = {
    playFilm() {
      startFilm()
    },
    /* `enterParkour` and `enterSurf` are NOT here, and they are optional on the
       contract for exactly that reason — see there, and the shelf note at the
       top of this file. Stubbing them to no-ops was the first attempt and it
       was worse in the one way that counts: it minified to `enterParkour(){}`
       in the shipped bundle, which is the name of a thing that is supposed to
       not exist. Not answering a door is how you say there is no door. */
    talk() {
      startTalk()
    },
    setPrompt: say,
    playerPosition: player.position,
    filmSeen: () => seenFilm,
  }

  /* ---------------- time of day ----------------
     Elliot's sky decides, not the visitor's: the sun's height over where he
     lives (src/core/sun.ts), so the field is dark when it is dark for him,
     and the clock in the top-right corner says what time it is there. It is
     set before the first frame, with no crossfade, and re-read once a minute
     so a visitor who stays through his sunset watches the field go dark.

     The field owns the crossfade; everything that has to know what time it is
     reads `field.daylight` off it once a frame (see the loop). Nothing here
     stores a second copy of the answer. `hud.onDayNight` only ever fires on
     the dev server, where the switch still exists; throwing it takes the
     field off the clock until the sky itself changes its answer. */
  const where = elliotPlace()
  // The field takes the sun's actual height, so it passes through the golden
  // hour on the way between day and night (see field.ts). On the dev server
  // `?sun=<degrees>` pins it, for looking at that hour without waiting for it.
  const pin = import.meta.env.DEV ? new URLSearchParams(location.search).get('sun') : null
  const elevation = () => (pin ? Number(pin) : sunElevation(where))
  let sky = timeOfDayFor(where)
  if (pin) sky = Number(pin) > -4 ? 'day' : 'night'
  field.setSun(elevation(), true)
  hud.setTimeOfDay(sky)
  hud.setClock(elliotClock())
  // thrown, the dev switch takes the field off the clock until the sky
  // itself changes its answer
  let offClock = false
  hud.onDayNight((mode) => {
    offClock = true
    field.setMode(mode, REDUCED_MOTION)
    hud.setTimeOfDay(mode)
  })
  const tick = () => {
    hud.setClock(elliotClock())
    // a pinned sun stays pinned: the class on <html> follows the field
    const next = pin ? sky : timeOfDayFor(where)
    if (next !== sky) {
      sky = next
      offClock = false
      hud.setTimeOfDay(sky)
    }
    if (!offClock) field.setSun(elevation(), REDUCED_MOTION)
  }
  // land the first tick on the minute, so the clock never shows a stale one
  window.setTimeout(() => {
    tick()
    setInterval(tick, 60_000)
  }, 60_000 - (Date.now() % 60_000))

  /* ---------------- the film sequence ----------------
   * The reversal that everything else in this file is arranged around: the
   * camera does NOT push into the screen and hand over to a DOM takeover. The
   * figure walks up to the projector, reaches out, switches it on, and steps
   * aside to watch; the camera pulls round to a wide third-person shot with
   * the sky, the figure, the projector and the screen all in it, and the film
   * plays on the screen from there.
   *
   * So this is a cutscene, and cutscenes need a way out of every state they
   * can be interrupted in. `seq` is that: every await checks it is still the
   * sequence that started, because Escape and Skip can land between any two
   * lines below.
   */
  const SCREEN_CENTRE = new THREE.Vector3(0, 11, -30)
  const aspect = () => {
    const v = viewSize()
    return v.w / v.h
  }

  let filmActive = false
  let watching = false
  /** has the film been played through, or at least started, once */
  let seenFilm = false
  let seq = 0
  /** the shot the film is being watched on, before the drift is added */
  let vantage = projector.watchVantage(aspect())
  const shot = new THREE.Vector3()
  /** scratch, so projecting the screen's corner once a frame allocates nothing */
  const corner = new THREE.Vector3()

  async function startFilm() {
    if (filmActive) return
    filmActive = true
    const mine = ++seq

    player.setEnabled(false)
    say(null)
    // the world is putting on a show; the instruments can sit this one out
    hud.hide()

    // walk the last few units in — from wherever in the radius it was pressed
    await player.walkTo(projector.pressSpot)
    if (mine !== seq) return

    // …reach out and turn it on. The promise resolves on contact, so the lamp
    // strikes on the frame the hand arrives rather than a beat either side.
    await player.press(projector.pressPoint)
    if (mine !== seq) return
    /* Every viewing starts from black. The lamp comes up HERE, a couple of
       seconds before `film.play()` down there — and the film leaves its last
       frame on the canvas when it stops (deliberately: it fades out over a
       picture). Without the wipe, a second viewing faded up on the frame the
       last one ended on, held it while the figure walked clear, and only then
       cut to the film building itself from nothing. */
    film.blank()
    projector.refreshScreen()
    projector.setFiring(true)

    // step out of the beam, and pull the camera round while they do it
    const stepped = player.walkTo(projector.watchSpot)
    watching = true
    const v = projector.watchVantage(aspect())
    vantage = v
    await rig.cutTo(v.position, v.lookAt, REDUCED_MOTION ? 0.01 : 1.9, v.fov)
    if (mine !== seq) return
    /* Elliot comes round to watch. The camera is on the screen now and he is
       not in that shot — nothing off its cone is — so this is the one moment
       he can cross the field unseen, and when the shot swings home at the
       end he is standing off to the left, an audience member, twenty-odd
       units away, rather than behind the lens where his path-side spot left
       him. Behind the lens is where the visitor found him nowhere at all,
       and the standing line was naming a person who was not on screen. He
       stays there; see `comeToWatch` in src/world/landmarks/elliot.ts. */
    elliot.comeToWatch()
    await stepped
    if (mine !== seq) return

    player.faceTo(SCREEN_CENTRE)
    film.play()
    controls.show()
  }

  /** the one way out, wherever we are in the sequence */
  function stopFilm() {
    if (!filmActive) return
    if (film.state.running) film.stop() // → onEnd → finishFilm
    else finishFilm()
  }

  function finishFilm() {
    if (!filmActive) return
    filmActive = false
    watching = false
    seq++ // anything still awaiting up there is now nobody's sequence
    controls.hide()
    projector.setFiring(false)
    // the picture is going; whatever the cursor was promising is going with it
    setPointing(false)
    rig.release()
    player.cancelTravel()
    player.setEnabled(true)
    suppressUntil = now() + 1.4
    hud.show()
  }

  film.onEnd(finishFilm)
  controls.onSkip(stopFilm)

  /* ---------------- the conversation ----------------
   * The same shape as the film sequence, smaller: your figure walks the last
   * few units over to him and turns to face him, he turns to face you, the
   * camera pulls round to a two-shot with the pair of you in the clear half
   * of the frame, and the panel comes up. Everything about the world is
   * suspended for as long as it is — proximity, the badge, the compass, the
   * keys — and everything comes back when it goes.
   *
   * `talkSeq` is this sequence's own cancellation token, for the same reason
   * the film has `seq`: Escape can land between any two awaits.
   */
  let talking = false
  /** has a conversation been opened at least once this visit */
  let talked = false
  let talkSeq = 0

  async function startTalk() {
    if (talking || filmActive) return
    talking = true
    talked = true
    const mine = ++talkSeq

    // the live lines go on the wire now, so they are drawn when the panel
    // opens rather than a beat after it (usually already here: see below)
    chat.warm()
    player.setEnabled(false)
    say(null)
    hud.hide()
    badge.update(rig.camera, null)

    await player.walkTo(elliot.talkSpot)
    if (mine !== talkSeq) return
    player.faceTo(elliot.facePoint)
    elliot.setEngaged(true)

    const v = elliot.talkVantage(aspect())
    await rig.cutTo(v.position, v.lookAt, REDUCED_MOTION ? 0.01 : 1.4, v.fov)
    if (mine !== talkSeq) return

    chat.open()
  }

  /** the one way out — the panel closing, whoever closed it */
  function finishTalk() {
    if (!talking) return
    talking = false
    talkSeq++
    elliot.setEngaged(false)
    rig.release()
    player.cancelTravel()
    player.setEnabled(true)
    suppressUntil = now() + 1.4
    hud.show()
  }

  chat.onClose(finishTalk)

  /* ---------------- proximity + dwell activation ---------------- */
  // Press E — or Enter, or Space — while standing at the thing, AND THAT IS
  // THE ONLY WAY INTO ANY OF IT. There is no tutorial: the badge that floats at
  // the switch when you get close IS the tutorial, and it is only ever on
  // screen while it is true. Landmarks that opt in — see `autoActivate` in the
  // contract — also open on their own after a beat of standing still, which is
  // right for a threshold you walk through and wrong for anything that takes
  // the screen off you; the one thing out here says no.
  //
  // A landmark disarms itself once used and only re-arms when you actually
  // leave its radius. Without this the dwell timer re-fires the moment the
  // film ends — you are, after all, still standing there — so the film
  // restarts about two seconds later and loops forever. It still matters with
  // the projector's dwell gone: `armed` is what picks `prompt` over `again`.
  let dwell = 0
  let near: Landmark | null = null
  const disarmed = new Set<string>()

  /* Elliot stands off the path, but his radius reaches it: walked straight at
     the projector you brush the edge of his zone, and for a few strides he is
     the nearer of the two, so the line at the bottom swapped to him under
     somebody who had not so much as glanced his way. So he only becomes the
     thing you are near if you are ACTUALLY GOING TO HIM — your step points at
     him, within a cone — or you are already close enough to touch him.
     Once he has you, he keeps you until you leave his radius, so stopping in
     front of him does not hand the line back to the projector. */
  const lastPos = player.position.clone()
  const stepped = new THREE.Vector3()
  const toward = new THREE.Vector3()
  /** how square-on a step has to be to count as walking to him: cos 40° */
  const HEADING_COS = 0.77
  function headedTo(l: Landmark, d: number, moved: boolean): boolean {
    if (near === l) return true
    if (d < (l.reachRadius ?? REACH)) return true
    if (!moved) return false
    toward.subVectors(l.anchor, player.position)
    const len = Math.hypot(toward.x, toward.z)
    const step = Math.hypot(stepped.x, stepped.z)
    if (len < 1e-3 || step < 1e-6) return false
    return (toward.x * stepped.x + toward.z * stepped.z) / (len * step) > HEADING_COS
  }

  /**
   * A landmark that was clicked from outside its own radius: the figure is
   * walking there, and this is what it is going to do when it arrives. See
   * `onPointerDown` for why a click at a distance is an errand rather than a
   * switch, and the arrival check in the frame loop for the other end of it.
   *
   * It lasts exactly as long as the walk does. `player.travelling` goes false
   * the moment you take a key — which is you overruling the errand — and the
   * loop drops it then, so the figure never resumes a walk you interrupted and
   * never opens a thing you changed your mind about on the way over.
   */
  let pending: Landmark | null = null

  function fire(l: Landmark) {
    // whatever the figure was being sent to do, this is what it is doing now
    pending = null
    disarmed.add(l.id)
    if (l.id === 'projector' && !seenFilm) {
      seenFilm = true
    }
    l.activate(ctx)
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && filmActive) {
      // reachable before the controls exist — during the walk over
      e.preventDefault()
      stopFilm()
      return
    }
    if (e.key === 'Escape' && talking) {
      e.preventDefault()
      // the panel may not be up yet — mid-walk, mid-cut — and finishTalk is
      // the way out of every one of those states; closing the panel calls it
      // too, so a panel that is up goes down and one that is not never opens
      if (chat.isOpen) chat.close()
      else finishTalk()
      return
    }
    /* E, because that is the key this genre reaches for and the badge floating
       at the switch says so. Enter and Space still work — they are what a
       keyboard visitor tabbing around will try, and they cost nothing. */
    const isE = e.key === 'e' || e.key === 'E'
    if (!isE && e.key !== 'Enter' && e.key !== ' ') return
    // ⌘E, ⌃E and ⌥E belong to the browser, and a held key is one press
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
    if (filmActive || talking || !near) return

    /* Whose keypress is it. Enter and Space are how you press a FOCUSED
     * BUTTON, so if one has focus they belong to it and not to the world —
     * otherwise throwing the time-of-day switch with the keyboard would also
     * start the film.
     *
     * E is not, and that distinction is the whole reason this is two rules
     * rather than one. Clicking the time switch with a mouse leaves it focused
     * in every browser, so a single blanket guard here meant: toggle to
     * daylight, walk to the projector, press the key the badge is telling you
     * to press, and nothing happens — with no way to find out why. E is only
     * ever handed over to something you can genuinely type into. */
    const target = e.target as HTMLElement | null
    if (target?.isContentEditable || target?.closest('input, textarea, select')) return
    if (!isE && target?.closest('button, a, [tabindex]')) return

    e.preventDefault()
    badge.hit() // the cap goes down, whether or not the badge is up to see it
    fire(near) // explicit intent always works, armed or not
  }
  window.addEventListener('keydown', onKey)

  /* ---------------- POINTING AT THE FIELD ----------------
   * One ray, asked three questions in a fixed order, and the order is the
   * design:
   *
   *   1. While the film is up — is there a LINK on the picture. Nothing else
   *      is asked; the field is not what is on screen.
   *   2. Is there a LANDMARK under the cursor. If there is, it wins, always,
   *      whatever ground is behind it.
   *   3. Otherwise it is the GROUND, and the figure walks toward it FOR AS LONG
   *      AS THE BUTTON IS DOWN. Ground is a throttle; a landmark is an errand.
   *
   * Landmarks beat the ground because a landmark is always standing ON ground:
   * ask the other way round and every click on the projector is also an order
   * to walk to the patch of grass behind it, which is the exact failure the
   * old click-to-walk had and the reason it was taken out.
   *
   * AND A LANDMARK CLICKED FROM A DISTANCE IS AN ERRAND, NOT A SWITCH — see
   * `pending` below. It walks the figure over and uses the thing on arrival.
   * That is what keeps the pointer honest: everything out here takes the screen
   * away from you for a while, and none of it may begin from across the field
   * on a gesture that might only have meant "look at that".
   */
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  /** scratch for the ground hit — this runs on every pointer move */
  const spot = new THREE.Vector3()

  /**
   * Point the ray at whatever is under a pointer event. False if the canvas
   * has no size yet, in which case there is nothing to point at.
   */
  function aimAt(e: PointerEvent): boolean {
    const r = canvas.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return false
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1
    ray.setFromCamera(ndc, rig.camera)
    return true
  }

  /**
   * Which landmark is under the cursor, if any — the NEAREST one, so anything
   * standing in front of the screen is that thing and not the screen.
   *
   * A landmark that answers `isEnabled()` with false is not there, and that
   * check earns its keep even with one landmark in the list: an invisible
   * object still takes a raycast (three deliberately does not test `visible`),
   * so anything that hides itself until it is ready would otherwise be
   * clickable from the first frame.
   */
  function landmarkAt(e: PointerEvent): Landmark | null {
    if (!aimAt(e)) return null
    let found: Landmark | null = null
    let bestD = Infinity
    for (const l of landmarks) {
      if (l.isEnabled?.() === false || !l.hitTargets?.length) continue
      const hit = ray.intersectObjects(l.hitTargets, true)[0]
      if (hit && hit.distance < bestD) {
        bestD = hit.distance
        found = l
      }
    }
    return found
  }

  /**
   * Where on the ground the cursor is. Null for anything above the horizon —
   * a ray that never meets the floor is a click on the sky, and the honest
   * answer to that is nothing at all.
   *
   * The ground mesh runs to thirteen times the field's radius so the horizon
   * dies in fog rather than at an edge; the walk does not get to use any of
   * that. Past the boundary the click is pulled back onto it, which is the
   * same soft wall player.ts holds you to anyway — it just means a click out
   * in the haze walks you as far as the world goes and stops, instead of
   * pressing the figure into the boundary spring for ever.
   */
  function groundAt(e: PointerEvent): THREE.Vector3 | null {
    if (!aimAt(e)) return null
    const hit = ray.intersectObject(field.ground, false)[0]
    if (!hit) return null
    spot.copy(hit.point)
    spot.y = 0
    const flat = Math.hypot(spot.x, spot.z)
    if (flat > FIELD_RADIUS) spot.multiplyScalar(FIELD_RADIUS / flat)
    return spot
  }

  /* ---------------- clicking a link ON the picture ----------------
   * The card at the end of the film carries an address and two profiles, and
   * the projects act carries a URL — and they are real links, but there is no
   * anchor tag anywhere near them: they are pixels on a texture on a screen
   * thirty units away. So the click is resolved geometrically. Cast at the
   * screen, turn the hit into a UV, turn the UV into canvas pixels, and ask
   * the picture what it drew there (see src/film/links.ts, which the drawing
   * act refills every frame and film.ts empties before every frame).
   *
   * No check on which act is running: an empty list IS the answer for an act
   * that draws no links, and it is the drawing code's answer rather than a
   * second copy of the act order kept over here.
   *
   * A keyboard or a screen reader never gets here at all: the film is a
   * picture, so those visitors are on the card in index.html instead. The card
   * carries the contact links as ordinary anchors — it does NOT carry the
   * project links, so anything the film is the only route to (Newsglide) is
   * mouse-only. If that list ever grows past one, it needs anchors on the card.
   */
  function linkAt(e: PointerEvent): { href: string } | null {
    if (!film.state.running || LINKS.length === 0) return null
    if (!aimAt(e)) return null
    const uv = projector.hitScreen(ray)
    if (!uv) return null
    const px = uv.u * CANVAS_W
    const py = uv.v * CANVAS_H
    for (const l of LINKS) {
      if (l.alpha <= 0.5) continue
      if (px >= l.x && px <= l.x + l.w && py >= l.y && py <= l.y + l.h) return l
    }
    return null
  }

  function openLink(href: string): void {
    // a mail client is not a tab
    if (href.startsWith('mailto:')) window.location.href = href
    else window.open(href, '_blank', 'noopener,noreferrer')
  }

  /* The cursor is the only thing that says any of this is pointable, so it has
     to be right: a hand over a link on the picture, a hand over anything in the
     field you can use, and the plain arrow over grass — which is walkable, but
     everywhere is walkable, and a page that is a pointing hand from edge to
     edge has told you nothing. */
  let pointing = false
  function setPointing(on: boolean): void {
    if (on === pointing) return
    pointing = on
    canvas.style.cursor = on ? 'pointer' : ''
  }

  /* ---------------- walking is a HELD gesture ----------------
   * The button going down on grass starts it, every move while it is down
   * re-aims it, and the button coming up stops it. See the header of
   * src/world/player.ts for why it is a throttle rather than a destination.
   *
   * `dragging` is main's half of that: the player has its own `steering` flag,
   * but this side has to know whether the moves it is being handed are a drag
   * or just a cursor wandering over the field. They can disagree in exactly one
   * direction — the player drops steering on its own when a script takes the
   * body (`settle()`), and the checks below are what stop this side from
   * quietly re-arming it under a button that never came up.
   */
  let dragging = false

  function endDrag(): void {
    if (!dragging) return
    dragging = false
    player.stopSteer()
  }

  function onPointerMove(e: PointerEvent) {
    if (dragging) {
      // the film taking the screen mid-drag ends the drag; it does not want the
      // figure walking underneath it — and neither does a conversation
      if (filmActive || talking) return endDrag()
      const ground = groundAt(e)
      if (ground) player.steerTo(ground)
      return
    }
    if (e.target !== canvas) return setPointing(false)
    setPointing(filmActive ? !!linkAt(e) : talking ? false : !!landmarkAt(e))
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true })

  /* Up ANYWHERE ends it, not just up over the canvas — a drag that finishes
     with the cursor over the HUD, or off the window entirely, has still
     finished, and a figure that keeps walking because you released two pixels
     outside the viewport is the exact bug this replaced. */
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
  window.addEventListener('blur', endDrag)

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return

    /* THE BADGE IS ITSELF A BUTTON ON A TOUCHSCREEN, and it has to be. On a
       phone it reads TAP TO TURN ON, floating a little above the machine —
       and a finger goes to the words, which hang in the sky where the raycast
       below finds no landmark and only grass behind them. The figure would
       walk sideways and the label would look broken. So the label answers for
       the thing it names. It is the same press E makes: `fire` does not care
       which gesture asked, and the badge is only ever on screen while you are
       within arm's reach of the switch it is pinned to. On a keyboard the pin
       is `pointer-events: none` and none of this is reachable — see the
       `(hover: none)` block in src/ui/ui.css. */
    if (!filmActive && !talking && near && (e.target as HTMLElement | null)?.closest('#interact')) {
      e.preventDefault()
      pending = null
      fire(near)
      return
    }

    if (e.target !== canvas) return

    /* a conversation is up: the panel takes the clicks and the field does not.
       The way out is the panel's own button, or Escape. */
    if (talking) return

    /* the film is up: the picture takes clicks and the field does not. Walking
       is not a thing you are doing right now, and the machine is mid-sentence. */
    if (filmActive) {
      e.preventDefault()
      e.stopPropagation()
      const link = linkAt(e)
      if (link) {
        openLink(link.href)
        return
      }
      /* Anywhere else on the picture is the pause, the way a tap on a
         short-video feed is: one tap holds, the next lets go. It is the same
         press the transport's button and `k` make — see the key table at the
         top of src/film/controls.ts. */
      film.togglePaused()
      return
    }

    const l = landmarkAt(e)
    if (l) {
      e.preventDefault()
      /* Standing at it already? Then this is the press, and it is the same
         press E makes — `fire` does not care which gesture asked. Otherwise the
         click is an errand: walk over, and use it on arrival. The radius is the
         distance the badge and the prompt already treat as "you are at this
         thing", so the two ways in agree about where the thing begins. */
      pending = null
      if (l.anchor.distanceTo(player.position) < l.radius) fire(l)
      else {
        pending = l
        player.travelTo(l.anchor)
      }
      return
    }

    /* grass. Walk toward it for as long as the button is down — and call off
       whatever the last click asked for, because a new instruction replaces the
       old one rather than queueing behind it. */
    const ground = groundAt(e)
    if (!ground) return
    pending = null
    dragging = true
    player.steerTo(ground)
  }
  window.addEventListener('pointerdown', onPointerDown, { capture: true })

  /* ---------------- resize ----------------
   *
   * MEASURED OFF THE CANVAS, NOT OFF THE WINDOW, and that is the whole fix for
   * a phone that comes back from landscape with the world stretched sideways.
   *
   * The canvas is sized by CSS — `inset: 0` inside a fixed #world — and its
   * buffer is set with `updateStyle: false`, so the browser stretches whatever
   * buffer we allocate to fill whatever box CSS gave it. The two are the same
   * picture only while they are the same shape. Give the box a buffer a third
   * taller than it is and the world is drawn a third too wide: the screen goes
   * squat, the beam splays, the figure gets fat.
   *
   * WHICH IS WHAT `window.innerHeight` HANDS YOU ON A PHONE. iOS reports the
   * window as the viewport the page would have if the browser's bars were not
   * there, and it lays a fixed element out inside the part you can actually
   * see — so the two disagree by the height of the address bar and the toolbar,
   * which on an iPhone is about a third of the screen. Turning the phone is
   * only what makes it visible: the pair agree at whatever the page loaded at,
   * and after a turn and a turn back they no longer do, which is exactly the
   * bug — go to landscape, come back, and the field is stretched sideways.
   *
   * The element's own box cannot disagree with itself.
   */
  /**
   * The viewport, in CSS pixels — and it is the canvas's box, not the window's.
   *
   * Rounded, because a fractional box (a 390.5px viewport on a 3× phone) would
   * otherwise report a new size on every call and reallocate the film's texture
   * for a third of a pixel. The window is the fallback and only the fallback:
   * a canvas that has not been laid out yet measures zero, and the first resize
   * runs before the first frame.
   */
  function viewSize(): { w: number; h: number } {
    const box = canvas.getBoundingClientRect()
    return {
      w: Math.max(1, Math.round(box.width) || window.innerWidth),
      h: Math.max(1, Math.round(box.height) || window.innerHeight),
    }
  }

  let lastW = 0
  let lastH = 0
  let lastRatio = 0

  function resize() {
    const { w, h } = viewSize()
    const ratio = pixelRatio()
    if (w === lastW && h === lastH && ratio === lastRatio) return
    lastW = w
    lastH = h
    lastRatio = ratio

    renderer.setPixelRatio(ratio)
    renderer.setSize(w, h, false)
    rig.resize(w, h)

    /* THE PICTURE IS SIZED FOR THE WINDOW, and this is the only place that
       knows how big the window is. The film's buffer is a texture that lands
       on a rectangle out in the world, and the watching shot fits that
       rectangle to the viewport — so a maximised window puts the picture on
       half again the device pixels a half-width one does, and a buffer that
       did not follow was a film that went soft exactly when there was most
       room to show it. The projector works out the number, because it owns
       both the screen and the shot: see pictureTexels there, and fitTo in
       src/film/film.ts for what it costs. */
    if (film.fitTo(projector.pictureTexels(w / h, h * ratio))) projector.resizeScreen()

    // a scripted shot is framed for one viewport shape; turning the phone
    // needs it framed again, or the film hangs off the side
    if (watching) {
      vantage = projector.watchVantage(w / h)
      rig.snapTo(vantage.position, vantage.lookAt, vantage.fov)
    }
    // …and the two-shot is framed for one window shape too: a phone turned
    // with the panel up needs the pair re-framed above it
    if (talking && chat.isOpen) {
      const v = elliot.talkVantage(w / h)
      rig.snapTo(v.position, v.lookAt, v.fov)
    }
  }

  /* WHAT ACTUALLY ASKS FOR THE RESIZE: the canvas telling us its box changed.
     A ResizeObserver fires after layout and only when there is something to
     answer, which makes it right where the resize event is wrong — a rotation
     that settles late is still caught, because settling IS the box changing.
     The window event stays as well: a display whose scaling changes, or a
     browser zoom, moves the pixel ratio without moving the box. Both land in
     the same guarded function, so an event that reports nothing new costs a
     rectangle measurement. */
  const boxWatch =
    typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null
  boxWatch?.observe(canvas)
  window.addEventListener('resize', resize)
  resize()

  /* A window dragged from a Retina display onto a 1× one — or a display whose
     scaling is changed under it — changes devicePixelRatio without changing
     its size, and fires no resize event at all. Left alone, the canvas keeps
     the buffer it was given for the old display: half the pixels it wants on
     the way up, twice the cost it needs on the way down. A media query on the
     ratio is the only thing that reports the change, and it has to be re-armed
     every time, because the query names the ratio it was built for. */
  let dprQuery: MediaQueryList | null = null
  function onPixelRatioChange() {
    resize()
    watchPixelRatio()
  }
  function watchPixelRatio() {
    dprQuery?.removeEventListener('change', onPixelRatioChange)
    dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    dprQuery.addEventListener('change', onPixelRatioChange)
  }
  watchPixelRatio()

  /* ---------------- loop ---------------- */
  const clock = new THREE.Clock()
  let elapsed = 0
  let running = true
  /** the pending frame, so nothing can ever schedule a second loop */
  let raf = 0
  const vel = new THREE.Vector3()
  const last = new THREE.Vector3().copy(player.position)
  /** scratch for the compass — reused, because this runs sixty times a second */
  const toTarget = new THREE.Vector3()

  /* Backgrounding the tab used to double the frame rate, and every hide/show
     cycle doubled it again: rAF is not cancelled when a tab is hidden, it is
     merely not serviced, so resuming scheduled a second loop alongside the one
     already queued. Cancel on the way out, and only ever schedule from a state
     where nothing is pending. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      running = false
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      return
    }
    resume()
  })

  /* …and the same door, openable from anywhere.
     `visibilitychange` alone is not enough: a tab that *begins* hidden — a
     background load, a restored session, a headless run — is never told it
     became visible, so it stopped at the first frame with the load veil still
     at full black and the clock reading zero. Anything that notices the page
     is visible again can call this. */
  function resume(): void {
    if (running || document.hidden) return
    running = true
    clock.getDelta() // discard the gap so nothing lurches on return
    raf = requestAnimationFrame(frame)
  }
  window.addEventListener('focus', resume)
  window.addEventListener('pageshow', resume)

  function frame() {
    raf = 0
    if (!running) return
    const dt = Math.min(clock.getDelta(), 0.05)
    elapsed += dt

    // the sun, first — the lantern and every landmark that carries a light of
    // its own spend the rest of the frame reacting to how much of it there is
    field.update(dt)
    renderer.toneMappingExposure = field.exposure
    player.setDaylight(field.daylight)
    for (const l of landmarks) l.setDaylight?.(field.daylight)

    player.update(dt, elapsed)
    scenery.setDaylight(field.daylight, field.dusk)
    scenery.update(dt, elapsed, player.position)
    vel.subVectors(player.position, last).divideScalar(Math.max(dt, 0.0001))
    last.copy(player.position)

    rig.update(dt, player.position, vel)

    // the film runs on the world's clock, not one of its own — it is being
    // thrown by a projector that is right there in the same frame
    if (film.state.running) {
      if (film.update(dt)) projector.refreshScreen()
      controls.sync()

      /* TLDR VERSION sits above the top-right corner of the
         screen, so it has to be told where that corner is on screen — every
         frame, because the watching shot breathes. Same projection the key
         badge does (src/ui/interact.ts); the clamping and the not-writing-a-
         style-that-has-not-changed both live in the chrome, which is the only
         thing that knows how big the button is. */
      corner.copy(projector.screenCorner).project(rig.camera)
      controls.place(
        ((corner.x + 1) / 2) * window.innerWidth,
        ((1 - corner.y) / 2) * window.innerHeight,
      )

      /* The depth cues run off the same clock as the act they belong to — and
         the TL;DR card is not one of them. It is not in ACTS, nothing in
         src/world/filmstage.ts is keyed to it, and the last act's cue would
         otherwise be lit under it by whatever `state.chapter` happens to say.
         -1 is a chapter no cue claims. */
      const digest = film.state.digest
      const chapter = CHAPTERS[film.state.chapter]
      stage.update(
        dt,
        digest ? -1 : film.state.chapter,
        !digest && chapter ? film.state.time - chapter.start : 0,
        true,
      )

      // …and the shot breathes, so the picture is being watched from a place
      // rather than from a tripod. Barely, on purpose: this is a long lens
      // from fifty units back, aimed at a fixed point, so any move here reads
      // as the whole screen pivoting. The first cut of this was ten times the
      // size and made Elliot dizzy; keep it at the edge of perception.
      if (watching && !REDUCED_MOTION) {
        shot.copy(vantage.position)
        shot.x += Math.sin(elapsed * 0.12) * 0.08
        shot.y += Math.sin(elapsed * 0.09 + 1.3) * 0.03
        rig.snapTo(shot, vantage.lookAt, vantage.fov)
      }
    } else if (stage.isEnabled()) {
      stage.update(dt, 0, 0, false)
    }

    /* landmarks: their own animation runs whatever else is happening */
    for (const l of landmarks) l.update?.(dt, elapsed, player.litAt(l.anchor), ctx)

    /* …but proximity and arming are suspended for the length of the film.
     *
     * They have to be. "Re-arm once you have actually left" is measured off
     * distance, and the film sequence WALKS THE FIGURE — so starting the film
     * from the edge of the radius re-armed it on the first frame (the walk to
     * the switch crosses the re-arm threshold), and the dwell timer then fired
     * again a second and a half after the film ended, with the figure parked
     * in front of the machine. The film restarted, for ever. Nothing you do
     * during a cutscene is you leaving. */
    if (!filmActive && !talking) {
      /* Which way the figure is going, from where it was last frame. Only a
         real step counts: below a hair's width the heading is noise. */
      stepped.subVectors(player.position, lastPos)
      const moved = Math.hypot(stepped.x, stepped.z) > 0.002
      lastPos.copy(player.position)

      let closest: Landmark | null = null
      let closestD = Infinity
      for (const l of landmarks) {
        if (l.isEnabled?.() === false) continue
        const d = l.anchor.distanceTo(player.position)
        // re-arm on the way out, with hysteresis so hovering on the boundary
        // can't flicker between armed and not
        if (d > l.radius * 1.25) disarmed.delete(l.id)
        if (d < l.radius && d < closestD && (l !== elliot || headedTo(l, d, moved))) {
          closest = l
          closestD = d
        }
      }

      if (closest !== near) {
        near = closest
        dwell = 0
        // turning toward Elliot is the earliest sign of a conversation, and
        // the panel's live lines are fetched on it (a minute's cache, so a
        // visitor who wanders in and out does not fetch again and again)
        if (near === elliot) chat.warm()
      }

      /* …and the other end of a click on something across the field: the
         figure has been walking there, and this is the arrival.
         `radius` is the line rather than the anchor itself, because the radius
         is what everything else out here already means by "at the thing" — the
         prompt is up, the badge is up, E works. Waiting for the anchor would
         make the click stricter than the key.
         A walk that stopped without getting there is a walk you took over: the
         errand goes with it. */
      if (pending) {
        if (!player.travelling || pending.isEnabled?.() === false) pending = null
        else if (pending.anchor.distanceTo(player.position) < pending.radius) fire(pending)
      }

      // The prompt has two things to say, and DISTANCE IS NOT ONE OF THEM: the
      // standing line and the projector's own prompt are the same string (see
      // LEAD above), so closing the distance changes nothing on screen. What
      // does change it is state — having already done the thing, which is what
      // `again` is for.
      // …with one addition since: the film having been watched, the standing
      // line hands over to Elliot's own prompt, until he has been talked to.
      // Same rule — it is HIS string, so closing the distance to him changes
      // nothing on screen — and then the field goes quiet, as it did before.
      const armed = !!near && !disarmed.has(near.id)
      say(
        near
          ? armed
            ? near.prompt
            : near.again
          : elapsed > LEAD_DELAY
            ? !seenFilm
              ? LEAD
              : !talked
                ? elliot.prompt
                : null
            : null,
      )

      /* …and up at the object itself, the key badge — PRESS [E] TO TURN ON,
       * floating at the switch. See src/ui/interact.ts.
       *
       * It has its own, much tighter radius, and that separation is the point.
       * `radius` is wide (seventeen units at the projector) because it means
       * "this is the thing you are near", and it arms the prompt line early on
       * purpose. A key badge means "you could put your hand on this", and a
       * label hanging over a machine you are still nine seconds of walking
       * away from is a label about nothing. So: same landmark, two distances,
       * and the sentence at the bottom of the screen hands over to the switch
       * as you arrive rather than competing with it.
       */
      const reach = near?.verb ? near.reach : null
      const inReach =
        !!reach &&
        Math.hypot(reach.x - player.position.x, reach.z - player.position.z) <
          (near?.reachRadius ?? REACH)
      badge.update(
        rig.camera,
        inReach ? reach : null,
        (armed ? near?.verb : (near?.verbAgain ?? near?.verb)) ?? '',
      )

      // …and standing there does not press it. `autoActivate: false` opts a
      // landmark out of this entirely — the projector does, because two
      // minutes of film is not something to start on somebody's behalf — and
      // its only way in is E, Enter or Space, all handled above.
      if (near && armed && near.autoActivate !== false && now() > suppressUntil) {
        // only count dwell while actually settled — walking past shouldn't
        // trigger anything
        dwell = player.speed < 2.6 ? dwell + dt : 0
        if (dwell > 0.55) {
          dwell = 0
          fire(near)
        }
      }
    } else {
      // the world is putting on a show — or a conversation — and there is
      // nothing to press. The HUD is fading out over the top of this anyway,
      // but the badge is the one piece that would otherwise come back still
      // lit, in the wrong place, on the frame the film ends.
      badge.update(rig.camera, null)
    }

    /* the compass, which names one thing and points at it — and there is one
     * thing out here to name, so it always says the same word.
     *
     * IT GOES ON NAMING THE PROJECTOR AFTER THE FILM HAS BEEN WATCHED. When
     * there is nothing left to find, the thing this field is actually for is
     * still the film, and a needle spinning at nothing is a broken instrument.
     *
     * THE LABEL IS WHAT THE THING SAYS, not what the code calls it — the needle
     * is naming something you are about to walk up to and read. Rename the
     * machine, rename it here.
     */
    if (!filmActive && !talking) {
      /* The needle used to swing to Elliot once the film had been watched
         and he had not been met. Now the compass is a strip with a marker
         for each of them, so this one names the projector, always, and his
         names him, always: two things to walk to, both said out loud from
         the first frame, each sitting on the strip where it sits in the field. */
      hud.setCompassLabel('Projector')
      toTarget.subVectors(projector.anchor, player.position)
      hud.setCompass(Math.atan2(toTarget.x, -toTarget.z), Math.hypot(toTarget.x, toTarget.z))
      toTarget.subVectors(elliot.anchor, player.position)
      hud.setCompassAside(Math.atan2(toTarget.x, -toTarget.z), Math.hypot(toTarget.x, toTarget.z))
    } else {
      hud.setCompass(null, 0)
      hud.setCompassAside(null, 0)
    }

    renderer.render(scene, rig.camera)
    raf = requestAnimationFrame(frame)
  }

  /* There were three query shortcuts here — `?unlock`, `?parkour` and `?surf`,
     which lit the two signs and went straight through them without sitting
     through a film. They went with the games (see the shelf note at the top),
     and they went ON PURPOSE rather than by omission: a URL is not a private
     door, and leaving one in would be the one way left to find a game that is
     supposed to not be here. */

  raf = requestAnimationFrame(frame)
  // one real frame on the canvas before the load screen lifts (index.html)
  requestAnimationFrame(() => root.classList.add('is-ready'))

  /* ---------------- teardown (dev/HMR hygiene) ---------------- */
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      running = false
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      boxWatch?.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('focus', resume)
      window.removeEventListener('pageshow', resume)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointerDown, { capture: true })
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
      window.removeEventListener('blur', endDrag)
      badge.dispose()
      fullscreen.dispose()
      chat.dispose()
      controls.dispose()
      player.dispose()
      stage.dispose()
      scenery.dispose()
      field.dispose()
      renderer.dispose()
    })
  }

  // quiet nod to anyone who opens the console
  console.log(
    `%c bring a light `,
    `background:${PALETTE.nightCss};color:${PALETTE.amberCss};padding:4px 8px;border-radius:2px`,
  )
}

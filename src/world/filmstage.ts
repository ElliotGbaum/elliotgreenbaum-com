/**
 * THE STAGE — the film's third dimension.
 *
 * The picture is flat, and that is not a defect: it is a film, thrown at a
 * screen, and the screen is the point. But the moment you first spawn into the
 * field you are looking at real depth, and cutting from that to a rectangle of
 * vector art is a step down. So every act reaches off the screen: the three
 * fields of the degree drift out into the air as volumes, the instruments of
 * the Cassidy act stand up as bars of light, the blueprint stands a row of
 * nodes in front of the picture with light running through them, and the card
 * at the end lights a rail across the dark in front of you.
 *
 * ONE RULE, AND IT IS THE SAME RULE THAT KILLED THE PROJECTOR'S THROW BEAM:
 * nothing in here may sit between the camera and the picture. Anything that
 * does is painted over the type, and no amount of dimming fixes it — a fainter
 * wedge is still a wedge. So every cue lives in the BAND BELOW THE SCREEN,
 * between the bottom of the frame and the ground, which in the watching shot
 * is empty dark field. The cues read as light spilling out of the picture into
 * the world in front of it, which is what they are.
 *
 * Everything is additive, depth-write off, unlit and unfogged, because all of
 * it is light rather than matter. There are exactly two real lights in here
 * (the travelling head of the blueprint pass, and the pre-sales lamp) and both
 * are switched off between cues.
 *
 * Cues are keyed by CHAPTER INDEX. Reorder the acts in film.ts and you must
 * re-key them here; there is a guard for the count but none for the meaning.
 * That guard has already been earned once: cutting two acts out of the middle
 * of the film left the loop cue pointing at the card.
 *
 * They are also keyed by SECONDS INTO THE ACT, and every one of those numbers
 * is a copy of a number in src/film/acts/actN.ts. Re-time an act and you must
 * re-time its cue, or the world plays the beat the picture has already left.
 * Each function below says which act's numbers it is tracking.
 */

import * as THREE from 'three'
import { PALETTE, clamp, ease, easeOut, range } from '../core/contract'

/** the screen's geometry, mirrored from world/landmarks/projector.ts */
const SCREEN_Z = -30
const SCREEN_Y = 13
const SCREEN_H = 17

/**
 * The empty band under the picture, where every cue is allowed to live.
 *
 * There is less room here than it looks: the screen's bottom edge is at 4.5
 * and the ground is at 0, so the whole band is four units tall. The first pass
 * put the cues at 1.1 with a four-unit radius, which meant every one of them
 * was a hemisphere — sliced flat by the ground plane — and they read as three
 * frosted domes parked in the field. Anything here has to be SMALL and it has
 * to sit clear of both edges.
 */
const BAND_Y = SCREEN_Y - SCREEN_H / 2 - 1.2

export interface FilmStage {
  readonly object: THREE.Object3D
  /** depth cues on or off — the film is complete either way */
  setEnabled(on: boolean): void
  isEnabled(): boolean
  /**
   * @param chapter index into film.ts's ACTS
   * @param local seconds into that act
   * @param live false when the film is not running, which hides everything
   */
  update(dt: number, chapter: number, local: number, live: boolean): void
  dispose(): void
}

/** Chapter indices the cues are keyed to. See the note at the top.
 *
 *  ACTS is [act0 … act11] and the index IS the act number, which it has not
 *  always been — an earlier cut left a gap at 5 and these constants drifted off
 *  by one, so the rail of addresses lit under the wrong act and the card itself
 *  got no cue at all. That is the exact failure the note at the top is about,
 *  and it is why these are named after what they light rather than numbered.
 *
 *  FIVE CUES, TWELVE ACTS. Most acts have none and the film is complete either
 *  way; these are the five whose pictures have something worth throwing out
 *  into the field. Three of them moved when real estate was inserted at 4 and
 *  the old act 5 was split into three — the numbers below are the only place
 *  that had to be edited by hand, because nothing else in the codebase keys off
 *  chapter position. */
const CH_PENN = 3
const CH_FLAT = 5
const CH_NEWS = 8
const CH_BUILD = 9
const CH_CARD = 11

/**
 * A soft round falloff, drawn once and shared.
 *
 * Additive spheres are flat discs with a hard rim — at this size the eye reads
 * them as coins, not as light. A sprite of this texture behind each one is
 * what turns a coin into a glow, and it costs one 128px texture for the whole
 * module.
 */
function haloTexture(): THREE.CanvasTexture {
  const S = 128
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const c = cv.getContext('2d')!
  const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.28, 'rgba(255,255,255,0.42)')
  g.addColorStop(0.62, 'rgba(255,255,255,0.1)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  c.fillStyle = g
  c.fillRect(0, 0, S, S)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function glowMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  })
}

export function createFilmStage(): FilmStage {
  const group = new THREE.Group()
  group.visible = false

  const disposables: Array<{ dispose(): void }> = []
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x)
    return x
  }

  const haloTex = track(haloTexture())
  /** a camera-facing bloom, for anything that is supposed to be a light */
  const halo = (color: number, opacity: number, size: number): THREE.Sprite => {
    const mat = track(
      new THREE.SpriteMaterial({
        map: haloTex,
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    )
    const s = new THREE.Sprite(mat)
    s.scale.setScalar(size)
    return s
  }

  /* ================================================================ *
   * Cue one — the three fields, as volumes
   *
   * They come out of the picture and toward you, overlap in mid-air the
   * way they overlap on the screen, and go. The overlap is the whole
   * idea of the act, so the spheres are additive: where two of them
   * cross is brighter than either, for free.
   * ================================================================ */
  const curious = new THREE.Group()
  const FIELD_COLOURS = [PALETTE.buff, PALETTE.amber, PALETTE.mint]
  const FIELD_X = [-4.6, 0, 4.6]
  const shellGeo = track(new THREE.SphereGeometry(1, 26, 18))
  const fields = FIELD_COLOURS.map((colour, i) => {
    const shellMat = track(glowMaterial(colour, 0.1))
    const coreMat = track(glowMaterial(colour, 0.34))
    const shell = new THREE.Mesh(shellGeo, shellMat)
    const core = new THREE.Mesh(shellGeo, coreMat)
    core.scale.setScalar(0.2)
    const bloom = halo(colour, 0.5, 5.2)
    const node = new THREE.Group()
    node.add(bloom, shell, core)
    node.position.set(FIELD_X[i] ?? 0, BAND_Y, SCREEN_Z + 2)
    curious.add(node)
    return { node, shellMat, coreMat, bloomMat: bloom.material }
  })
  group.add(curious)

  /* ================================================================ *
   * Cue two — the ranks levelling
   *
   * Three bars of light in the band at three different heights, which all
   * settle to the same height at the moment the pyramid in the picture
   * becomes one rank. Nothing is destroyed and nothing falls over — they
   * just end up level, which is the entire argument act 4 is making,
   * restated in the field in front of the screen.
   * ================================================================ */
  const flatten = new THREE.Group()
  /** [x, from, to, rising] — the tallest comes down, the shortest comes up */
  const BARS: Array<[number, number, number, boolean]> = [
    [-7.5, 0.92, 0.55, false],
    [0, 0.66, 0.55, false],
    [7.5, 0.24, 0.55, true],
  ]
  const BAR_MAX = 3.1
  const BAR_BASE = BAND_Y - 1.5
  const BAR_Z = SCREEN_Z + 7
  // Thin. A wide additive box out here is not a bar, it is a pale slab with no
  // edges and no shading, and it reads as a rendering fault parked in front of
  // the screen — which is exactly what the first version of this cue was. What
  // survives at thirty units is a narrow column with a bright head on it.
  const barGeo = track(new THREE.BoxGeometry(0.42, 1, 0.42))
  const rangeGeo = track(new THREE.BoxGeometry(0.05, BAR_MAX, 0.05))
  const capGeo = track(new THREE.SphereGeometry(0.22, 14, 10))
  const bars = BARS.map(([x, from, to, up]) => {
    const colour = up ? PALETTE.mint : PALETTE.amber
    const mat = track(glowMaterial(colour, 0.35))
    const mesh = new THREE.Mesh(barGeo, mat)
    mesh.position.set(x, BAR_BASE, BAR_Z)

    // the whole range it could be at, left standing — the same dashed box the
    // picture leaves behind
    const rangeMat = track(glowMaterial(PALETTE.sage, 0.1))
    const range3 = new THREE.Mesh(rangeGeo, rangeMat)
    range3.position.set(x, BAR_BASE + BAR_MAX / 2, BAR_Z)

    const capMat = track(glowMaterial(up ? PALETTE.mint : PALETTE.amberLit, 0.9))
    const cap = new THREE.Mesh(capGeo, capMat)
    const bloom = halo(up ? PALETTE.mint : PALETTE.glow, 0.5, 2.6)
    cap.add(bloom)

    flatten.add(mesh, range3, cap)
    return { mesh, mat, rangeMat, cap, capMat, bloomMat: bloom.material, x, from, to, up }
  })
  group.add(flatten)

  /* ================================================================ *
   * Cue three — the lamp and the panel
   *
   * A small source throwing light at a small screen, out in the field, at
   * the moment act 5 puts the one piece of checkable evidence in the film
   * on the screen. It is this whole site's own premise, one throw closer
   * to you: something is being shown to somebody.
   * ================================================================ */
  const wave = new THREE.Group()
  const lampMat = track(glowMaterial(PALETTE.glow, 0.95))
  const lamp = new THREE.Mesh(track(new THREE.SphereGeometry(0.34, 16, 12)), lampMat)
  const lampHalo = halo(PALETTE.glow, 0.6, 4.2)
  lamp.add(lampHalo)
  lamp.position.set(-9, BAND_Y, SCREEN_Z + 12)
  wave.add(lamp)

  /** a rectangle drawn as four thin bars — an outline, not a pane of haze */
  const frameGeoH = track(new THREE.BoxGeometry(7.2, 0.07, 0.07))
  const frameGeoV = track(new THREE.BoxGeometry(0.07, 4.2, 0.07))
  const panelMat = track(glowMaterial(PALETTE.amber, 0.5))
  const panel = new THREE.Group()
  for (const [geo, px, py] of [
    [frameGeoH, 0, 2.1],
    [frameGeoH, 0, -2.1],
    [frameGeoV, -3.6, 0],
    [frameGeoV, 3.6, 0],
  ] as Array<[THREE.BoxGeometry, number, number]>) {
    const edge = new THREE.Mesh(geo, panelMat)
    edge.position.set(px, py, 0)
    panel.add(edge)
  }
  // turned toward the lamp, which is what makes it a panel and not a rectangle
  panel.position.set(5.5, BAND_Y, SCREEN_Z + 12)
  panel.rotation.y = -0.5
  wave.add(panel)

  const lampLight = new THREE.PointLight(0xffd9a0, 0, 30, 2)
  lampLight.position.copy(lamp.position)
  wave.add(lampLight)
  group.add(wave)

  /* ================================================================ *
   * Cue three — the blueprint, standing up
   *
   * Five nodes in a row in front of the screen and one point of light
   * that runs through them, lighting each as it arrives. It is the same
   * pass the picture is making at the same moment, half a second's throw
   * closer to you. Then the pass ends, the nodes go, and two plates rise
   * where the two project cards are landing on the screen.
   * ================================================================ */
  const build = new THREE.Group()
  const nodeGeo = track(new THREE.BoxGeometry(0.95, 0.95, 0.95))
  const NODE_X = [-11, -5.5, 0, 5.5, 11]
  const nodes = NODE_X.map((x, i) => {
    const mat = track(glowMaterial(i === 2 ? PALETTE.amberLit : PALETTE.amber, 0.14))
    const box = new THREE.Mesh(nodeGeo, mat)
    box.position.set(x, BAND_Y, SCREEN_Z + 6)
    box.rotation.set(0.4, 0.6, 0)
    if (i === 2) box.scale.setScalar(1.5)
    build.add(box)
    return { box, mat }
  })
  const railGeo = track(new THREE.BoxGeometry(24, 0.06, 0.06))
  const railMat = track(glowMaterial(PALETTE.sage, 0.2))
  const rail = new THREE.Mesh(railGeo, railMat)
  rail.position.set(0, BAND_Y, SCREEN_Z + 6)
  build.add(rail)

  const sparkGeo = track(new THREE.SphereGeometry(0.3, 16, 12))
  const sparkMat = track(glowMaterial(PALETTE.glow, 0.95))
  const spark = new THREE.Mesh(sparkGeo, sparkMat)
  spark.position.set(0, BAND_Y, SCREEN_Z + 6)
  const sparkHalo = halo(PALETTE.glow, 0.55, 3.4)
  spark.add(sparkHalo)
  build.add(spark)

  // the one real light in this cue — it makes the pass touch the field
  const sparkLight = new THREE.PointLight(0xffd9a0, 0, 26, 2)
  sparkLight.position.copy(spark.position)
  build.add(sparkLight)

  // one rail per project card, each with a bead at its head. Rails, not
  // plates: a 9×2.4 additive plane out here is a pale slab with no edges, and
  // two of them read as smudges on the lens rather than as anything in the
  // field. The card cue at the end of the film is the shape that works.
  const cardRailGeo = track(new THREE.BoxGeometry(11, 0.05, 0.05))
  const cardHeadGeo = track(new THREE.SphereGeometry(0.24, 14, 10))
  // Heads OUTBOARD, and the two rails at different heights. Both heads at the
  // same end put one of them behind the projector's silhouette, where a bead
  // is a bead nobody ever sees.
  const plates = [-6, 7].map((x, i) => {
    const mat = track(glowMaterial(i === 0 ? PALETTE.amberLit : PALETTE.mint, 0.3))
    const plate = new THREE.Group()
    const bar = new THREE.Mesh(cardRailGeo, mat)
    const headMat = track(glowMaterial(i === 0 ? PALETTE.amberLit : PALETTE.mint, 0.9))
    const head = new THREE.Mesh(cardHeadGeo, headMat)
    // clear of the figure on the left and of the projector in the middle —
    // both of which are silhouettes, and a bead behind a silhouette is a bead
    // nobody sees
    head.position.x = i === 0 ? -3 : 5.5
    const bloom = halo(i === 0 ? PALETTE.glow : PALETTE.mint, 0.45, 2.6)
    head.add(bloom)
    plate.add(bar, head)
    plate.position.set(x, BAND_Y + (i === 0 ? 0.7 : -0.7), SCREEN_Z + 9)
    build.add(plate)
    return { plate, mat, headMat, bloomMat: bloom.material, y: BAND_Y + (i === 0 ? 0.7 : -0.7) }
  })
  group.add(build)

  /* ================================================================ *
   * Cue four — the card
   *
   * The act holds still, so this does too: one long rail of light lying
   * across the dark in front of you, and a bead on it for each address
   * as that address arrives. It is the picture's own floor, continued
   * out of the picture — which is the entire idea of this module stated
   * as plainly as it can be.
   * ================================================================ */
  const cardCue = new THREE.Group()
  const cardRailMat = track(glowMaterial(PALETTE.amber, 0.18))
  const cardRail = new THREE.Mesh(track(new THREE.BoxGeometry(30, 0.05, 0.05)), cardRailMat)
  cardRail.position.set(0, BAND_Y - 0.6, SCREEN_Z + 10)
  cardCue.add(cardRail)

  const beadGeo = track(new THREE.SphereGeometry(0.26, 14, 10))
  const cardBeads = [-8, 0, 8].map((x, i) => {
    const mat = track(glowMaterial(i === 0 ? PALETTE.amberLit : PALETTE.amber, 0.5))
    const bead = new THREE.Mesh(beadGeo, mat)
    bead.position.set(x, BAND_Y - 0.6, SCREEN_Z + 10)
    const bloom = halo(i === 0 ? PALETTE.amberLit : PALETTE.amber, 0.45, 3.0)
    bead.add(bloom)
    cardCue.add(bead)
    // one bead per address, at the second the address arrives in the picture
    return { bead, mat, bloomMat: bloom.material, at: 5.4 + i * 0.9 }
  })
  group.add(cardCue)

  /* ---------------------------------------------------------------- */

  let enabled = true

  function hideAll(): void {
    curious.visible = false
    flatten.visible = false
    wave.visible = false
    build.visible = false
    cardCue.visible = false
    sparkLight.intensity = 0
    lampLight.intensity = 0
  }
  hideAll()

  /** cue one — tracking act3: OPEN_A 0.9, OPEN_B 2.7, act ends at 14 */
  function updateCurious(t: number): void {
    const out = easeOut(range(t, 1.0, 4.5))
    const fade = ease(range(t, 0.8, 1.8)) * (1 - ease(range(t, 12.6, 13.8)))
    curious.visible = fade > 0.01
    if (!curious.visible) return

    let i = 0
    for (const f of fields) {
      const phase = i * 0.7
      // it comes toward you, and it grows because it is closer — not because
      // it is inflating. The scale barely moves.
      const swell = 0.62 + 0.38 * out
      f.node.position.z = SCREEN_Z + 3 + out * 13
      f.node.position.y = BAND_Y + Math.sin(t * 0.6 + phase) * 0.28 * out
      f.node.scale.setScalar(swell)
      f.shellMat.opacity = 0.18 * fade
      f.coreMat.opacity = 0.75 * fade
      f.bloomMat.opacity = 0.44 * fade
      i++
    }
  }

  /** cue two — tracking act5, banking: the boxes are up by ~3.2 and FLAT runs 8.2→9.6 */
  function updateFlatten(t: number): void {
    const fade = ease(range(t, 2.4, 3.2)) * (1 - ease(range(t, 12.6, 13.6)))
    flatten.visible = fade > 0.01
    if (!flatten.visible) return

    // the same 8.2→9.6 travel the picture's ranks make
    const move = ease(range(t, 8.2, 9.6))
    for (const b of bars) {
      const v = b.from + (b.to - b.from) * move
      const bh = Math.max(0.06, BAR_MAX * v)
      b.mesh.scale.set(1, bh, 1)
      b.mesh.position.y = BAR_BASE + bh / 2
      b.mat.opacity = (b.up ? 0.45 : 0.34) * fade
      b.rangeMat.opacity = 0.1 * fade
      b.cap.position.set(b.x, BAR_BASE + bh, BAR_Z)
      b.capMat.opacity = 0.9 * fade
      b.bloomMat.opacity = 0.5 * fade
    }
  }

  /** cue three — tracking act8, the NewsGlide card: CARD_A 0.6, LINK_A 3.1, and
   *  nothing leaves before the act cuts at 12.4.
   *
   *  It used to track the old act 5, where the card was the back half of a
   *  thirteen-second act and did not arrive until six seconds in; the card has
   *  an act of its own now and is up almost immediately, so the whole cue moved
   *  five and a half seconds earlier and stopped fading out. */
  function updateWave(t: number): void {
    const fade = ease(range(t, 0.4, 1.2))
    wave.visible = fade > 0.01
    if (!wave.visible) {
      lampLight.intensity = 0
      return
    }

    // the lamp strikes, then the panel catches it — the same beat the picture
    // is playing, one throw closer to you
    const strike = easeOut(range(t, 0.6, 1.6))
    lampMat.opacity = 0.95 * fade * (0.55 + 0.45 * strike)
    lampHalo.material.opacity = 0.6 * fade * strike
    lampLight.intensity = 130 * fade * strike
    panelMat.opacity = (0.05 + 0.22 * easeOut(range(t, 1.2, 2.2))) * fade
    panel.rotation.y = -0.5 + Math.sin(t * 0.5) * 0.05
  }

  /** cue four — tracking act9, E&B: boxes from 0.8, PASS [4.2, 5.3], HAND 7.6→8.2,
   *  CARD_IN 8.0 every 0.95, and LINE_IN 13.05 which the cue clears out of */
  function updateBuild(t: number): void {
    const boardFade = ease(range(t, 1.2, 2.2)) * (1 - ease(range(t, 7.6, 8.2)))
    const cardFade = ease(range(t, 8.1, 8.9)) * (1 - ease(range(t, 12.8, 13.5)))
    build.visible = boardFade > 0.01 || cardFade > 0.01
    if (!build.visible) {
      sparkLight.intensity = 0
      return
    }

    const boardOn = boardFade > 0.01
    rail.visible = boardOn
    for (const n of nodes) n.box.visible = boardOn

    let i = 0
    for (const n of nodes) {
      const born = easeOut(range(t, 1.4 + i * 0.22, 2.0 + i * 0.22))
      n.box.rotation.y = 0.6 + t * 0.25
      n.box.scale.setScalar((i === 2 ? 1.5 : 1) * (0.4 + 0.6 * born))
      i++
    }

    // two passes, matching the picture's own
    let u = -1
    for (const start of [4.2, 5.3]) {
      const k = range(t, start, start + 1.05)
      if (k > 0 && k < 1) u = k
    }
    const on = u >= 0 && boardOn
    spark.visible = on
    sparkLight.intensity = on ? 150 * boardFade : 0
    if (on) {
      const x = -12 + 24 * u
      spark.position.x = x
      sparkLight.position.x = x
      // each node lights as the pass reaches it
      let j = 0
      for (const n of nodes) {
        const d = Math.abs((NODE_X[j] ?? 0) - x)
        j++
        n.mat.opacity = (0.12 + 0.55 * clamp(1 - d / 3.2)) * boardFade
      }
    } else {
      for (const n of nodes) n.mat.opacity = 0.14 * boardFade
    }
    railMat.opacity = 0.18 * boardFade
    sparkMat.opacity = 0.95 * boardFade
    sparkHalo.material.opacity = 0.5 * boardFade

    // the rails: one per card, rising and drawing out as its card lands
    let pi = 0
    for (const p of plates) {
      const at = 8.1 + pi * 0.95
      const k = easeOut(range(t, at, at + 0.9))
      pi++
      p.plate.visible = cardFade > 0.01
      p.plate.position.y = p.y - 0.9 + 0.9 * k
      p.plate.scale.x = 0.15 + 0.85 * k
      p.mat.opacity = 0.35 * k * cardFade
      p.headMat.opacity = 0.9 * k * cardFade
      p.bloomMat.opacity = 0.45 * k * cardFade
    }
  }

  /** cue five — tracking act11, the card: the addresses arrive at 4.0, 4.9, 5.8 */
  function updateCard(t: number): void {
    const fade = ease(range(t, 0.9, 2.0))
    cardCue.visible = fade > 0.01
    if (!cardCue.visible) return

    cardRailMat.opacity = 0.16 * fade
    for (const b of cardBeads) {
      const k = ease(range(t, b.at, b.at + 0.8))
      // a slow shift along the rail, so the row is never quite static
      const breathe = 1 + Math.sin(t * 0.7 + b.at) * 0.12
      b.bead.scale.setScalar((0.4 + 0.6 * k) * breathe)
      b.mat.opacity = 0.65 * k * fade
      b.bloomMat.opacity = 0.5 * k * fade
    }
  }

  return {
    object: group,

    setEnabled(on: boolean) {
      enabled = on
      if (!on) {
        hideAll()
        group.visible = false
      }
    },

    isEnabled: () => enabled,

    update(_dt, chapter, local, live) {
      if (!enabled || !live) {
        if (group.visible) {
          hideAll()
          group.visible = false
        }
        return
      }
      group.visible = true
      hideAll()
      if (chapter === CH_PENN) updateCurious(local)
      else if (chapter === CH_FLAT) updateFlatten(local)
      else if (chapter === CH_NEWS) updateWave(local)
      else if (chapter === CH_BUILD) updateBuild(local)
      else if (chapter === CH_CARD) updateCard(local)
    },

    dispose() {
      for (const d of disposables) d.dispose()
    },
  }
}

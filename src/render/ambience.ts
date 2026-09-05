import { BATTLEGROUNDS } from '../sim/battleground'
import { DT } from '../sim/constants'
import { ENCOUNTERS } from '../sim/encounters'
import { Rng } from '../sim/rng'
import { SPEC_OPTIONS, randomAround } from '../sim/classes'
import { createBattlegroundState, createState, unattended } from '../sim/state'
import { step } from '../sim/sim'
import { COLORS, L, zoomFactor } from './theme'
import { Effects } from './effects'
import { drawWorld } from './draw'
import type { PlayerInput, SimState } from '../sim/types'

/**
 * A fight going on behind the menus.
 *
 * The game already has everything this needs: a simulation that runs without a
 * screen, a party that plays itself, and a renderer that draws a state rather
 * than a session. So the background is not a video or a loop of sprites — it
 * is an actual fight, stepped at the same rate as a real one, with nobody
 * playing it. The party is rolled fresh each time and the AI does what it does
 * in a pull, which means it is never quite the same scene twice and none of it
 * had to be animated by hand.
 *
 * It is decoration, and it is treated as decoration: it never touches the
 * player's state, never makes a sound, never records anything, and the first
 * thing it does when the tab is not keeping up is give up its frame.
 */

const KEY = 'abyss.backdrop'

/**
 * Whether the fight behind the menus is wanted.
 *
 * Defaults to on, except where the device has asked for less movement — a
 * running battle behind every screen is exactly what that setting is about,
 * and honouring it by default is cheaper than apologising for it afterwards.
 */
export function loadBackdrop(): boolean {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw !== null) return raw === '1'
  } catch {
    // Private browsing has no storage and no opinion.
  }
  return !prefersStillness()
}

export function saveBackdrop(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    // As above: not worth failing over.
  }
}

function prefersStillness(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** How long a scene runs before cutting to another, in seconds. */
const CUT = 40

/**
 * Simulated seconds skipped before a scene is shown.
 *
 * The opening of a pull is five people walking in, which is the least
 * interesting part of a fight and the part a background would show most of.
 * Fast-forwarding is free — the harness runs thousands of whole pulls in a few
 * seconds — so every scene opens in the middle of something.
 */
const WARMUP = 22

/** Frames are dropped rather than caught up on: this is not the game. */
const MAX_TICKS = 3

/**
 * How much of the next scene's warm-up is done per frame.
 *
 * Twenty-two seconds of fight is eight milliseconds on a desktop and several
 * times that on a phone — a whole frame or three, spent every time the
 * background cut to a new fight, which is a hitch in the menu the player is
 * reading. Preparing the next one a second at a time while the current one is
 * still on screen costs a tenth of a millisecond a frame and nothing is ever
 * waited for.
 */
const SLICE = 30

const IDLE: PlayerInput = { moveX: 0, moveY: 0, pressed: [] }

/**
 * How much closer the background sits than the game does.
 *
 * At the playing scale the whole arena fits on screen, which is right when you
 * are the one dodging and wrong here: dimmed to a third and read out of the
 * corner of an eye, a party at that size is a scatter of moving dots. Twice in
 * gives up the edges of the arena — there is nothing there to lose behind a
 * menu — and gets back figures that are recognisably swinging at something.
 */
export const ZOOM = 2

/**
 * What the scene multiplies the current world scale by.
 *
 * Divided by the player's own camera setting, so the background sits the same
 * distance away whatever the fight is set to. Left multiplied, somebody who
 * likes the game close would get the menus at three and a half times, which
 * is past the point where both teams walk out of frame.
 *
 * Exported because the checks have to measure this rather than assume it: an
 * assumption that the background is at ZOOM times the world scale was true
 * only while the world scale had no camera in it.
 */
export function backdropZoom(): number {
  return ZOOM / zoomFactor()
}

/** A scene being got ready off screen. */
interface Pending {
  state: SimState
  rng: Rng
  /** Ticks of warm-up still owed. */
  left: number
}

interface Scene {
  kind: 'raid' | 'battleground'
  index: number
}

function scenes(): Scene[] {
  return [
    ...ENCOUNTERS.map((_, index) => ({ kind: 'raid' as const, index })),
    ...BATTLEGROUNDS.map((_, index) => ({ kind: 'battleground' as const, index })),
  ]
}

export class Ambience {
  private state: SimState
  private rng: Rng
  private effects = new Effects(false)
  private accumulator = 0
  private clock = 0
  private age = 0
  private queue: Scene[] = []
  private enabled = true

  private pending: Pending | null = null

  constructor() {
    this.rng = new Rng(1)
    this.state = this.take()
  }

  /** Off means off: no stepping, no drawing, no cost beyond a flat fill. */
  setEnabled(on: boolean): void {
    if (on === this.enabled) return
    this.enabled = on
    // A scene resumed after ten minutes on the settings screen would jump.
    if (on) this.state = this.take()
  }

  isEnabled(): boolean {
    return this.enabled
  }

  private next(): Scene {
    // Shuffled in whole rounds, so every fight is shown once before any is
    // shown twice and the same boss never follows itself.
    if (this.queue.length === 0) {
      const pool = scenes()
      while (pool.length > 0) {
        this.queue.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!)
      }
    }
    return this.queue.shift()!
  }

  /** Rolls the next scene and puts it in the queue to be warmed up. */
  private prepare(): void {
    const scene = this.next()
    const seed = Math.floor(Math.random() * 0xffffff) + 1
    const rng = new Rng(seed)

    const lead = SPEC_OPTIONS[Math.floor(Math.random() * SPEC_OPTIONS.length)]!
    const s =
      scene.kind === 'battleground'
        ? createBattlegroundState(
            seed,
            BATTLEGROUNDS[scene.index]!.kind,
            randomAround(5, lead, Math.random),
          )
        : createState(
            seed,
            0,
            randomAround(scene.index === 0 ? 5 : 10, lead, Math.random),
            'normal',
            scene.index,
          )

    unattended(s)
    // Nobody is waiting for this one to start.
    s.countdown = 0
    this.pending = { state: s, rng, left: Math.round(WARMUP / DT) }
  }

  /**
   * Runs some of the waiting scene's warm-up.
   *
   * The opening of a pull is five people walking in, which is the least
   * interesting part of a fight and the part a background would otherwise show
   * most of. Skipping it is free in the sense that matters — it is the same
   * fight either way — but not free in the frame it happens on, hence a slice
   * at a time.
   */
  private warm(slice: number): void {
    let rerolls = 3
    let done = 0
    while (done < slice) {
      if (!this.pending) this.prepare()
      const p = this.pending!
      if (p.left <= 0) return
      // A warm-up that ran the whole fight leaves a scene with nothing to
      // show. Rare — most pulls last several times as long as the skip — but
      // a background is not worth a frozen frame, so it rolls another one.
      if (p.state.outcome !== 'ongoing') {
        if (rerolls-- <= 0) return
        this.prepare()
        continue
      }
      step(p.state, IDLE, p.rng)
      p.left--
      done++
    }
  }

  /** Finishes the waiting scene, takes it, and starts on the one after. */
  private take(): SimState {
    this.warm(Number.POSITIVE_INFINITY)
    const ready = this.pending
    this.pending = null
    if (!ready) {
      // Unreachable: warm() prepares one if there is none. Rolling forward
      // with the scene already on screen beats throwing out of a background.
      return this.state
    }

    // Whatever happened during the skipped part happened off screen.
    ready.state.effects.length = 0
    ready.state.sounds.length = 0
    this.rng = ready.rng
    this.age = 0
    this.prepare()
    return ready.state
  }

  /** One frame's worth of fight. Wall-clock seconds, like everything else. */
  advance(elapsed: number): void {
    if (!this.enabled) return
    this.clock += elapsed
    this.age += elapsed
    this.accumulator += elapsed

    let ticks = 0
    while (this.accumulator >= DT && ticks < MAX_TICKS) {
      step(this.state, { moveX: 0, moveY: 0, pressed: [] }, this.rng)
      this.effects.ingest(this.state)
      this.accumulator -= DT
      ticks++
    }
    // A menu makes no noise, and now it cannot.
    //
    // Nothing plays this state's channel, so silence here was already true —
    // but it was true by nobody looking rather than by anything saying so, and
    // what the fight happened to be doing on the last tick of a frame decided
    // whether the queue was empty when somebody did. Draining it after the
    // stepping makes the property the code's rather than the timing's.
    this.state.sounds.length = 0
    // Behind after three ticks means the tab was away or the machine is busy.
    // The fight skips ahead rather than the menu stuttering to catch it up.
    if (this.accumulator >= DT) this.accumulator = 0
    this.effects.age(elapsed)
    // The next fight gets ready while this one is still on screen, so a cut
    // costs nothing on the frame it happens.
    this.warm(SLICE)

    // Checked after the stepping rather than before it. A fight that ends
    // inside this call is a fight the very next frame would otherwise draw:
    // one frozen frame of a corpse, which is exactly the thing a background
    // must never do.
    if (this.state.outcome !== 'ongoing' || this.age > CUT) {
      this.accumulator = 0
      this.state = this.take()
    }
  }

  /**
   * Draws the scene, then most of the way back to the background colour.
   *
   * The wash is what makes this usable rather than clever: a menu is read, and
   * a fight at full brightness behind text is a fight instead of a menu. What
   * survives it is movement and colour at the edge of attention, which is all
   * a background is for.
   */
  draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = COLORS.bg
    ctx.fillRect(0, 0, L.w, L.h)
    if (!this.enabled) return

    // Zoomed about the middle of the screen, and inside a save: the menu drawn
    // over the top has to land in screen coordinates like everything else.
    const close = backdropZoom()
    ctx.save()
    ctx.translate(L.cx, L.cy)
    ctx.scale(close, close)
    ctx.translate(-L.cx, -L.cy)
    ctx.globalAlpha = 0.55
    drawWorld(ctx, this.state, 1, this.clock, this.effects)
    ctx.restore()

    ctx.fillStyle = 'rgba(10, 10, 15, 0.72)'
    ctx.fillRect(0, 0, L.w, L.h)
  }

  /** What is on screen, for the checks. */
  get showing(): SimState {
    return this.state
  }
}

/**
 * The one the menus draw, installed by the game at startup.
 *
 * The screens before the fight ask for a backdrop rather than for a fight, so
 * nothing but this module knows there is a simulation behind them — and with
 * none installed they fill flat, which is what the checks and the first frame
 * of a cold start both get.
 */
let current: Ambience | null = null

export function setAmbience(next: Ambience | null): void {
  current = next
}

export function drawBackdrop(ctx: CanvasRenderingContext2D): void {
  if (current) {
    current.draw(ctx)
    return
  }
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, L.w, L.h)
}

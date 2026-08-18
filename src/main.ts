import { Input } from './input'
import { drawWorld } from './render/draw'
import { drawHud } from './render/hud'
import { COLORS, L, updateLayout } from './render/theme'
import { DT } from './sim/constants'
import { Rng } from './sim/rng'
import { step } from './sim/sim'
import { createState } from './sim/state'
import type { SimState } from './sim/types'

const BASE_SEED = 0x51ed

const canvas = document.getElementById('stage') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

function fitCanvas(): void {
  // The canvas fills the viewport instead of being letterboxed at a fixed
  // aspect ratio. A letterboxed canvas on a portrait phone leaves most of the
  // screen outside the element, and touches there never reach the game.
  const w = Math.max(320, window.innerWidth)
  const h = Math.max(320, window.innerHeight)
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  updateLayout(w, h)
}

fitCanvas()

const input = new Input(window, canvas)

function onViewportChange(): void {
  fitCanvas()
  // Layout moved, so the parked stick and buttons have to move with it.
  input.recentre()
}

window.addEventListener('resize', onViewportChange)
window.addEventListener('orientationchange', onViewportChange)

let attempt = 0
let state: SimState = createState(BASE_SEED, attempt)
// The RNG lives outside the state but is derived from it, so a given
// (seed, attempt) pair always replays identically.
let rng = new Rng(BASE_SEED + attempt * 7919)

function restart(): void {
  attempt++
  state = createState(BASE_SEED, attempt)
  rng = new Rng(BASE_SEED + attempt * 7919)
}

let accumulator = 0
let last = performance.now()
let clock = 0

function frame(now: number): void {
  // Clamping protects against the tab being backgrounded: rAF stops, and
  // without this the sim would try to catch up on minutes of missed time.
  const elapsed = Math.min((now - last) / 1000, 0.25)
  last = now
  clock += elapsed
  accumulator += elapsed

  // Tapping anywhere on the end-of-fight overlay retries, since a phone has
  // no R key. takeTap is consumed every frame so it cannot queue up.
  const tapped = input.takeTap()
  if (input.takeRestart() || (tapped && state.outcome !== 'ongoing')) restart()

  let ticks = 0
  while (accumulator >= DT && ticks < 6) {
    step(state, input.consume(), rng)
    accumulator -= DT
    ticks++
  }

  const alpha = Math.min(1, accumulator / DT)

  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, L.w, L.h)
  drawWorld(ctx, state, alpha, clock)
  drawHud(ctx, state, {
    active: input.isTouchMode(),
    joystick: input.joystick(),
    heldSlots: input.heldSlots(),
  })

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)

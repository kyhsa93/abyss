import { Input } from './input'
import { drawWorld } from './render/draw'
import { drawHud } from './render/hud'
import { CANVAS_H, CANVAS_W, COLORS } from './render/theme'
import { DT } from './sim/constants'
import { Rng } from './sim/rng'
import { step } from './sim/sim'
import { createState } from './sim/state'
import type { SimState } from './sim/types'

const BASE_SEED = 0x51ed

const canvas = document.getElementById('stage') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

/** The arena is wider than it is tall, so a portrait phone shrinks it badly. */
let portrait = false

function fitCanvas(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = CANVAS_W * dpr
  canvas.height = CANVAS_H * dpr

  // Letterbox to fit the viewport without distorting the arena.
  portrait = window.innerHeight > window.innerWidth
  const scale = Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H)
  canvas.style.width = `${CANVAS_W * scale}px`
  canvas.style.height = `${CANVAS_H * scale}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

fitCanvas()
window.addEventListener('resize', fitCanvas)

const input = new Input(window, canvas)

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
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  drawWorld(ctx, state, alpha, clock)
  drawHud(ctx, state, {
    active: input.isTouchMode(),
    joystick: input.joystick(),
    heldSlots: input.heldSlots(),
  })

  if (input.isTouchMode() && portrait) drawRotateHint()

  requestAnimationFrame(frame)
}

function drawRotateHint(): void {
  const text = 'rotate your device for a larger view'
  ctx.fillStyle = 'rgba(15, 17, 26, 0.85)'
  ctx.fillRect(CANVAS_W / 2 - 190, 8, 380, 26)
  ctx.strokeStyle = COLORS.panelEdge
  ctx.lineWidth = 1
  ctx.strokeRect(CANVAS_W / 2 - 189.5, 8.5, 379, 25)
  ctx.fillStyle = COLORS.textDim
  ctx.font = '12px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.fillText(text, CANVAS_W / 2, 25)
}

requestAnimationFrame(frame)

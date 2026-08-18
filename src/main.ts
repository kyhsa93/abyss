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

function fitCanvas(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = CANVAS_W * dpr
  canvas.height = CANVAS_H * dpr

  // Letterbox to fit the viewport without distorting the arena.
  const scale = Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H)
  canvas.style.width = `${CANVAS_W * scale}px`
  canvas.style.height = `${CANVAS_H * scale}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

fitCanvas()
window.addEventListener('resize', fitCanvas)

const input = new Input(window)

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

  if (input.takeRestart()) restart()

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
  drawHud(ctx, state)

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)

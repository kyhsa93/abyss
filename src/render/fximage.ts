/**
 * The hit effects, if they are there.
 *
 * Same contract as every other sheet: absent is an ordinary state — a cold
 * start, a refused fetch, the harness drawing in Node — and the caller falls
 * back to the drawn burst, which is what shipped for months and what
 * `rendercheck` asserts on.
 *
 * These go over the burst rather than instead of it. The burst takes its
 * colour from the ability's own icon and a sprite has its colour baked in, so
 * replacing one with the other would trade a fact — which school just hit you
 * — for a flourish.
 */

import { FX, FX_CELL, FX_SRC } from './fx'

type Sheet = CanvasImageSource & { width: number; height: number }

let sheet: Sheet | null = null
let started = false

function begin(): void {
  if (started || typeof Image === 'undefined') return
  started = true
  const image = new Image()
  image.decoding = 'async'
  image.onload = () => {
    sheet = image as unknown as Sheet
  }
  image.src = FX_SRC
}

/**
 * Draw effect `name` at its `t` — nought to one across the animation.
 *
 * Clamped rather than wrapped: these are one-shots, and a hit that loops reads
 * as a thing that is still happening.
 */
export function drawFx(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  size: number,
  t: number,
  alpha: number,
): boolean {
  begin()
  if (!sheet) return false

  const fx = FX[name]
  if (!fx) return false

  // Clamped rather than wrapped: these are one-shots. A hit is over, and a
  // sprite that looped would keep detonating after the thing that caused it
  // had finished. `drawFxLoop` is the door for the things that do repeat.
  const frame = Math.min(fx.frames - 1, Math.max(0, Math.floor(t * fx.frames)))

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(
    sheet,
    frame * FX_CELL,
    fx.row * FX_CELL,
    FX_CELL,
    FX_CELL,
    x - size / 2,
    y - size / 2,
    size,
    size,
  )
  ctx.restore()
  return true
}

/**
 * The same sheet, played on a loop.
 *
 * For the things on the floor that are still happening rather than the ones
 * that have happened: a pool is burning for as long as it is there, and a
 * sprite that ran once and stopped would say it had gone out.
 *
 * `cycles` is turns a second, so the caller says how fast a thing burns rather
 * than knowing how many frames it was drawn with.
 */
export function drawFxLoop(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  size: number,
  clock: number,
  cycles: number,
  alpha: number,
  /** So two pools side by side are not the same picture twice. */
  offset = 0,
): boolean {
  const t = ((clock * cycles + offset) % 1 + 1) % 1
  return drawFx(ctx, name, x, y, size, t, alpha)
}

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

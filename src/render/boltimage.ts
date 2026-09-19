/**
 * The projectile bodies, if they are there.
 *
 * Same contract as the icon sheet and the walking bodies: absent is an
 * ordinary state — the first frames of a cold start, a fetch the browser
 * refused, and the harness, which draws in Node where there is no `Image` —
 * and the caller falls back to the drawn bolt that shipped for months.
 * `rendercheck` asserts on that bolt and can keep doing so.
 */

import type { ProjectileKind } from '../sim/types'
import { BOLT_CELL, BOLT_FRAMES, BOLT_ROW, BOLT_SRC } from './bolt'

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
  image.src = BOLT_SRC
}

export function hasBolt(kind: ProjectileKind): boolean {
  begin()
  return sheet !== null && kind in BOLT_ROW
}

/**
 * How much white the sprite picks up on top of its tint.
 *
 * Small, and smaller than it started, because of what the art turned out to
 * be. The idea was to lift highlights: add the greyscale back in proportion to
 * its own luminance, so bright pixels go toward white and dark ones stay
 * coloured. That works on art with a luminance range. These, once the packer
 * has normalised them, sit between 225 and 255 — nearly flat — so the pass
 * adds almost the same amount everywhere and reads as desaturation rather than
 * as a hot core.
 *
 * Separability says it is nearly free: the closest pair of school colours stays
 * 53 units apart from nought to 0.28, and only collapses at 0.40 where the
 * channels clip. So this is a choice about how it looks rather than about what
 * it costs, and saturated wins — the arena floor is dark, the halo under the
 * bolt is already doing the glowing, and a washed-out bolt gives up the one
 * thing the sprite was kept greyscale to protect.
 */
const HIGHLIGHT = 0.12

/** Frames a second. Fast enough to shimmer, slow enough not to strobe. */
const RATE = 12

/**
 * Tinted copies of the whole sheet, one per colour.
 *
 * Tinting is four compositing passes and a projectile is drawn every frame, so
 * doing it per draw would mean redoing that work for a bolt whose colour has
 * not changed since it was thrown. The colours come from the icon table rather
 * than from anywhere open-ended, so this stays small on its own; the cap is
 * only here so that a future ability colouring itself per hit cannot grow it
 * without bound.
 */
const tinted = new Map<string, Sheet>()
const CACHE = 64

function sheetFor(colour: string): Sheet | null {
  if (!sheet) return null
  const had = tinted.get(colour)
  if (had) return had
  if (typeof document === 'undefined') return null

  const canvas = document.createElement('canvas')
  canvas.width = sheet.width
  canvas.height = sheet.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = false

  ctx.drawImage(sheet, 0, 0)
  // Colour times luminance: the shape and its shading survive, the hue is the
  // ability's. Over the whole canvas rather than the sprite, because a
  // composite operation cannot be masked; the alpha is put back at the end.
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = colour
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = HIGHLIGHT
  ctx.drawImage(sheet, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(sheet, 0, 0)

  const made = canvas as unknown as Sheet
  if (tinted.size >= CACHE) tinted.delete(tinted.keys().next().value as string)
  tinted.set(colour, made)
  return made
}

/**
 * Draw a projectile body, pointing where it is going.
 *
 * `time` is the simulation's clock rather than the wall's, so a replay of the
 * same fight animates identically — the frame is a fact about the fight, not
 * about how fast the machine drew it.
 */
export function drawBolt(
  ctx: CanvasRenderingContext2D,
  kind: ProjectileKind,
  x: number,
  y: number,
  size: number,
  angle: number,
  colour: string,
  time: number,
): boolean {
  begin()
  const row = BOLT_ROW[kind]
  if (row === undefined) return false
  const art = sheetFor(colour)
  if (!art) return false

  const frame = Math.floor(time * RATE) % BOLT_FRAMES

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  // Pixel art scaled with smoothing turns to mush.
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(
    art,
    frame * BOLT_CELL,
    row * BOLT_CELL,
    BOLT_CELL,
    BOLT_CELL,
    -size / 2,
    -size / 2,
    size,
    size,
  )
  ctx.restore()
  return true
}

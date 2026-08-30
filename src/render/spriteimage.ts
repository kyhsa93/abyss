/**
 * The field sprites, if they are there.
 *
 * Same contract as the other two sheets: "not loaded" is an ordinary state —
 * the first frames of a cold start, a fetch the browser refused, and the
 * harness, which draws in Node where there is no `Image` — and the caller
 * falls back to the disc that shipped for months. `rendercheck` asserts on
 * that disc, and still can.
 */

import { SPRITES, SPRITE_CELL, SPRITE_SRC } from './sprites'

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
  image.src = SPRITE_SRC
}

/**
 * Whether there is art for this actor, asked before the disc under it is
 * drawn.
 *
 * The disc changes job when a body stands on it: without art it is the body
 * and carries the class colour, and with art it is the shadow the body stands
 * in, with the colour moved out to the ring. The fill happens before the
 * sprite, so it has to know in advance.
 */
export function hasSprite(id: string): boolean {
  begin()
  return sheet !== null && id in SPRITES
}

/** How tall a body stands, in footprint radii. */
export const BODY_HEIGHT = 4.4


/**
 * A body standing on the footprint at (x, y).
 *
 * The disc is the hitbox and is what position is read off, so the sprite is
 * anchored to it rather than replacing it: the feet sit just below the centre,
 * and everything else is drawn upwards out of it. Move the anchor and you move
 * where the game looks like it is without moving where it is.
 *
 * `lift` is the procedural motion the caller worked out — a walk bob, a cast
 * rise. It moves the body and never the disc, because a hitbox that bobs is
 * one nobody can read.
 *
 * `flip` turns the figure to face its bearing. One sprite and a mirror rather
 * than two drawings: these are generated, and a generator asked for the same
 * character twice returns two different people.
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  r: number,
  lift: number,
  flip: boolean,
  alpha: number,
): boolean {
  begin()
  if (!sheet) return false

  const at = SPRITES[id]
  if (!at) return false

  // Square, because the cell is square. The packer trims to the figure and
  // squares the box around its taller side, so a standing body spans the full
  // height of its cell with transparent margin at the sides — drawing that
  // into anything but a square stretches the person.
  const size = r * BODY_HEIGHT
  // Feet a little below the middle of the disc, so a body looks like it is
  // standing in its footprint rather than balanced on the back edge of it.
  const feet = y + r * 0.35 + lift

  ctx.save()
  ctx.globalAlpha = alpha
  if (flip) {
    ctx.translate(x, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(sheet, at[0], at[1], SPRITE_CELL, SPRITE_CELL, -size / 2, feet - size, size, size)
  } else {
    ctx.drawImage(sheet, at[0], at[1], SPRITE_CELL, SPRITE_CELL, x - size / 2, feet - size, size, size)
  }
  ctx.restore()
  return true
}

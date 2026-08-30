/**
 * The portrait sheet, if it is there.
 *
 * Same shape as `atlasimage`, and for the same reason: "not loaded" is three
 * ordinary states — the first frames of a cold start, a fetch the browser
 * refused, and the harness, which draws in Node where there is no `Image` —
 * and in all of them the caller falls back to what it drew before. A roster
 * card without a portrait is the card that shipped for months.
 */

import { PORTRAITS, PORTRAIT_CELL, PORTRAIT_SRC } from './portraits'

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
  image.src = PORTRAIT_SRC
}

/**
 * Fill the rect with the portrait, cropped to cover rather than squashed.
 *
 * A card is much wider than it is tall and a portrait is square, so fitting it
 * would letterbox a face into a stripe. Cover keeps the head at the right
 * proportions and throws away the sides, which on a bust is background.
 *
 * `alpha` is the caller's, because the two places this is used want opposite
 * things: a card wants it far enough back that the text on top stays legible,
 * and the panel under the grid wants it at full strength.
 */
export function drawPortrait(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha: number,
): boolean {
  begin()
  if (!sheet) return false

  const at = PORTRAITS[id]
  if (!at) return false

  // Cover, anchored to the top of the cell. A bust puts the face in the upper
  // half, so a crop taken from the middle cuts the chin off every one of them.
  const srcW = PORTRAIT_CELL
  const srcH = Math.min(PORTRAIT_CELL, (PORTRAIT_CELL * h) / w)

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.drawImage(sheet, at[0], at[1], srcW, srcH, x, y, w, h)
  ctx.restore()
  return true
}

/**
 * The portrait inside the actor's own disc.
 *
 * Clipped to the circle rather than drawn over it, which is what makes this
 * possible at all: the generator returns JPEG and JPEG has no alpha, so a
 * sprite cut out of its background is not on offer. A circle needs no cut-out
 * — whatever the portrait had behind it becomes the token's own field, and the
 * ring the caller strokes afterwards closes it.
 *
 * It also keeps the one thing that must not change. The disc is the hitbox and
 * is what position is read off; this draws inside it and never past it, so a
 * body is exactly where it always was.
 *
 * A bust is framed for a card, so the face sits high in the cell. Taking the
 * square from the top of the cell puts the face in the middle of the circle
 * instead of the collar.
 */
export function drawToken(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  r: number,
): boolean {
  begin()
  if (!sheet) return false

  const at = PORTRAITS[id]
  if (!at) return false

  const src = PORTRAIT_CELL * 0.82

  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.drawImage(sheet, at[0], at[1], src, src, x - r, y - r, r * 2, r * 2)
  ctx.restore()
  return true
}

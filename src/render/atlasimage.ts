/**
 * The icon sheet, if it is there.
 *
 * Everything about this is written so that "not loaded" is an ordinary state
 * rather than an error, because it is three different ordinary states: the
 * first frames of a cold start before the image arrives, a browser that
 * refused the fetch, and the harness, which draws through a recorder in Node
 * where there is no `Image` at all.
 *
 * In every one of those the caller falls back to the glyph it drew before, so
 * the buttons are never empty and `rendercheck` keeps asserting on the shapes
 * it always asserted on. The art is an improvement layered on something that
 * already worked, not a replacement that can fail.
 *
 * The path is relative on purpose: this ships under `/abyss/` on Pages and `/`
 * locally, and a relative URL resolves against the document either way without
 * the render layer having to know which.
 */

import { ATLAS, ATLAS_CELL, ATLAS_SRC } from './atlas'

type Sheet = CanvasImageSource & { width: number; height: number }

let sheet: Sheet | null = null
let started = false

/**
 * Begin loading, once.
 *
 * Called from the draw path rather than at module scope so that importing this
 * — which the harness does, transitively, on every check — does not try to
 * fetch anything.
 */
function begin(): void {
  if (started || typeof Image === 'undefined') return
  started = true

  const image = new Image()
  image.decoding = 'async'
  // A missing or corrupt sheet leaves `sheet` null forever, which is the
  // fallback path, so there is nothing to handle here beyond not throwing.
  image.onload = () => {
    sheet = image as unknown as Sheet
  }
  image.src = ATLAS_SRC
}

/**
 * Draw ability `id` centred on (cx, cy), reporting whether it managed to.
 *
 * The boolean is the whole interface: a caller that gets `false` draws its own
 * glyph, and one that gets `true` is done. Nothing else needs to know whether
 * there is art in this build.
 */
export function drawAtlasIcon(
  ctx: CanvasRenderingContext2D,
  id: string,
  cx: number,
  cy: number,
  size: number,
): boolean {
  begin()
  if (!sheet) return false

  const at = ATLAS[id]
  if (!at) return false

  ctx.drawImage(
    sheet,
    at[0],
    at[1],
    ATLAS_CELL,
    ATLAS_CELL,
    cx - size / 2,
    cy - size / 2,
    size,
    size,
  )
  return true
}

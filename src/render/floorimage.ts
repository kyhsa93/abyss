/**
 * The arena floor picture, if it is there.
 *
 * Same contract as the sprite and icon sheets: absent is ordinary — a cold
 * start, a refused fetch, the harness drawing in Node — and the caller falls
 * back to the flat fill the arena has always had. `rendercheck` asserts on
 * that fill and still can.
 */

const SRC = 'art/floor.webp'

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
  image.src = SRC
}

/**
 * Fill the arena with the floor, reporting whether it managed to.
 *
 * Drawn to the arena's own square rather than tiled. The arena is a circle of
 * fixed world size and the caller has already clipped to it, so one stretched
 * picture has no repeat to give itself away — and no seam to line up.
 */
export function drawFloor(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
): boolean {
  begin()
  if (!sheet) return false
  ctx.drawImage(sheet, cx - radius, cy - radius, radius * 2, radius * 2)
  return true
}

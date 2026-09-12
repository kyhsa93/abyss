/**
 * The player's body, put together out of what he is wearing.
 *
 * Everyone else in this world is one picture with their clothes on, which is
 * right: a townsman never takes his off.  The player is the one who does, and
 * that costs a whole way of making art — the shirt has to be a separate image
 * from the body, lining up with it pixel for pixel in all eight directions and
 * every frame of every clip.  `pipeline/render_paperdoll.py` gets that for
 * free by photographing one rig one slot at a time; this is the other half,
 * which puts the photographs back together.
 *
 * The layers are composited **once, into an offscreen canvas**, and not drawn
 * one on top of another every frame.  Seven draw calls a character would be
 * seven times the work for a thing that changes when someone opens a bag, and
 * the scene already knows how to draw a person out of one sheet.  So the
 * output here is the same shape as a packed actor sheet, and `drawActor` never
 * learns that the hero is made of parts.
 */

/** What `pipeline/pack_paperdoll.py` writes. */
export type Doll = {
  cols: number
  who: Record<string, {
    cell: number
    anchor: number
    dirs: number
    /** A clip with an `alias` shares another's cells — see `walk` and `run`. */
    clips: Record<string, { first: number; count: number; alias?: string }>
    layers: Record<string, { w: number; h: number; dx: number; dy: number }>
  }>
}

/** Slot to variant: `{ chest: 'medium', feet: 'bare' }`. */
export type Worn = Record<string, string>

/**
 * Back to front, which is the order they were photographed in.
 *
 * `chest` before `hands` so a gauntlet crossing the belly lands on top of the
 * breastplate rather than under it, and `helm` last because it covers
 * everything it touches.  The rest of the occlusion is already in the pixels:
 * every layer was rendered with the bare body as a holdout, so an arm swinging
 * across the chest cut an arm-shaped hole in the armour before it ever got
 * here.  That is the table a drawn paperdoll has to keep per direction and
 * this one does not.
 */
export const ORDER = ['body', 'feet', 'chest', 'hands', 'head', 'hair', 'helm']

/** A helmet is worn instead of hair, not over it. */
const HIDES: Record<string, string> = { helm: 'hair' }

/** Every layer image a look needs, as `<who>_<slot>_<variant>`. */
export function needed(who: string, worn: Worn): string[] {
  const out: string[] = []
  for (const slot of ORDER) {
    const hidden = Object.entries(HIDES).some(
      ([by, gone]) => gone === slot && worn[by] && worn[by] !== 'bare')
    if (hidden) continue
    const variant = worn[slot]
    if (variant) out.push(`${who}_${slot}_${variant}`)
  }
  return out
}

/** How many cells a sheet of this character has. */
export function cells(art: Doll['who'][string]): number {
  let n = 0
  for (const c of Object.values(art.clips)) {
    if (c.alias) continue
    n = Math.max(n, c.first + art.dirs * c.count)
  }
  return n
}

/**
 * Composite one look into a sheet the scene can draw from.
 *
 * `images` is keyed the way `needed` names them; a layer that is missing is
 * skipped rather than thrown over, because a look with no boots in it is a
 * barefoot person and not a broken one.
 */
export function dress(
  doll: Doll, art: Doll['who'][string], who: string, worn: Worn,
  images: Record<string, HTMLImageElement>,
): HTMLCanvasElement {
  const n = cells(art)
  const cols = doll.cols
  const rows = Math.ceil(n / cols)
  const cv = document.createElement('canvas')
  cv.width = cols * art.cell
  cv.height = rows * art.cell
  const ctx = cv.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  for (const name of needed(who, worn)) {
    const box = art.layers[name]
    const img = images[name]
    if (!box || !img) continue
    for (let i = 0; i < n; i++) {
      const sx = (i % cols) * box.w, sy = Math.floor(i / cols) * box.h
      const dx = (i % cols) * art.cell + box.dx
      const dy = Math.floor(i / cols) * art.cell + box.dy
      ctx.drawImage(img, sx, sy, box.w, box.h, dx, dy, box.w, box.h)
    }
  }
  return cv
}

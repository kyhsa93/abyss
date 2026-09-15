/**
 * Where each hit effect sits in `public/art/fx.webp`.
 *
 * Cut from the ICC prototype's sheet (tag `icc-final`, packed there by
 * `scripts/fx.ts`), keeping only the eight rows a hit plays: the prototype's
 * other seventeen were effects that loop on a boss's floor, and this game has
 * no boss floor for them to loop on — they were 2.3 MB of the phone's 24 MB of
 * decoded sheets and nothing would draw them.  One effect per row, frames
 * across, left to right.
 *
 * The art is from the Superpowers asset packs and is CC0: no attribution
 * required, no share-alike — see `pipeline/sources.py`.
 */

export const FX_CELL = 64
export const FX_SRC = './art/fx.webp'

export const FX: Record<string, { row: number; frames: number }> = {
  burst: { row: 0, frames: 6 },
  flame: { row: 1, frames: 4 },
  holy: { row: 2, frames: 3 },
  bolt: { row: 3, frames: 6 },
  slash: { row: 4, frames: 5 },
  heal: { row: 5, frames: 7 },
  blast: { row: 6, frames: 3 },
  gust: { row: 7, frames: 5 },
}

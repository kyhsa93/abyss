/**
 * What the player is drawn wearing, out of what he is wearing.
 *
 * `hero.png` used to have a breastplate and plate sleeves composited into the
 * body, so every class of six was drawn in plate — and nobody in this game
 * starts in plate, or can buy any: of the chest pieces this slice reaches, not
 * one is `subclass` 4.  A warrior is made in a shirt and a mage in a robe.
 *
 * So the torso is an overlay chosen from the items, and **the rule reads the
 * item's own columns and never the class**: a class is who is wearing it, and
 * a leather jerkin put on a priest later is a priest in leather.
 *
 *   * `InventoryType` 4 is a shirt, under everything.
 *   * `InventoryType` 20 is a robe, whatever its `subclass` says — twenty of
 *     this slice's robes are subclass 0, *miscellaneous*, and a robe is still
 *     the shape of the thing.
 *   * `InventoryType` 5 is a chest piece and `subclass` says what it is made
 *     of: 1 cloth, 2 leather, 3 mail, 4 plate (`ItemSubclassArmor` in the
 *     core's `ItemTemplate.h`).  0 is miscellaneous and draws nothing rather
 *     than the nearest material, because the nearest material to a costume is
 *     not a tunic.
 *
 * Read by `main.ts` for the world, the screen that makes a character, and the
 * character sheet, so the three cannot disagree — and by `simcheck` in Node.
 */
import { I_INV, I_SLOT, I_SUB, type Item } from './gear.ts'

/** `InventoryType` for the three shapes a torso can be. */
export const INV_SHIRT = 4, INV_CHEST = 5, INV_ROBE = 20

/** `item_template.subclass` for armour, as the picture it is drawn as. */
export const MATERIAL: Record<number, string> = {
  1: 'tunic', 2: 'leather', 3: 'mail', 4: 'plate',
}

/**
 * The overlay one item is drawn as, or null for anything that is not a torso.
 */
export function outfitOf(it: Item | null | undefined): string | null {
  if (!it) return null
  const inv = it[I_INV] as number | undefined
  if (inv === INV_SHIRT) return 'shirt'
  if (inv === INV_ROBE) return 'robe'
  if (inv === INV_CHEST) return MATERIAL[it[I_SUB] as number] ?? null
  return null
}

/**
 * Every torso overlay for what is worn, back to front: the shirt, then
 * whatever is over it.
 *
 * Two rather than the top one, because a leather jerkin has no sleeves and a
 * man in one over a shirt shows the shirt's.  Keyed on the slot rather than on
 * the order the items come in, so a gear table that happens to list the chest
 * first still draws the shirt under it.
 */
export function outfitFor(worn: (Item | null | undefined)[]): string[] {
  let shirt: string | null = null, over: string | null = null
  for (const it of worn) {
    const word = outfitOf(it)
    if (!word) continue
    if (word === 'shirt' && it![I_SLOT] === 'shirt') shirt = word
    else if (word !== 'shirt') over = word
  }
  return [shirt, over].filter((w): w is string => !!w)
}

/**
 * Which of the paperdoll's three chest weights an overlay is.
 *
 * The doll's layers are drawn light, medium and heavy, and `doll.ts` used to
 * pick one off the armour value alone.  Measured over this slice that
 * disagrees with the material: leather runs 31 to 92 armour and mail 67 to
 * 198, so a leather jerkin at 70 came out heavy in the doll while the world
 * drew it as leather.  One rule, two pictures: the weight is the material's.
 */
export const WEIGHT: Record<string, 'light' | 'medium' | 'heavy'> = {
  shirt: 'light', tunic: 'light', robe: 'light',
  leather: 'medium', mail: 'heavy', plate: 'heavy',
}

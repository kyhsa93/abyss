/**
 * Things you can hold, and what holding them does.
 *
 * The bag was `{our word: [how many, what it is worth]}` — eleven bits of
 * cloth could be counted, a sword could not be held, because an item lost its
 * id on the way in and became a noun.  So nothing could be worn and nothing
 * changed a stat, and the fifty-eight paperdoll renders in `public/art/doll/`
 * had nobody to call them.
 *
 * `pipeline/items.py` bakes what the slice can reach — 1,424 rows, not the
 * 46,096 in the table — with the columns that decide whether a human warrior
 * can wear a thing and what it does for him.  Names never leave the pipeline.
 */
import { AGI, INT, SPI, STA, STR, type Stats } from './stats.ts'

/**
 * One item: `[word, slot, quality, item level, required level,
 * min damage, max damage, swing ms, armour, buy price, sell price,
 * two-handed, [[stat, amount], …]]`.
 */
export type Item = (string | number | (string | number)[][])[]
export const I_WORD = 0, I_SLOT = 1, I_QUALITY = 2, I_ILVL = 3, I_NEED = 4,
  I_LO = 5, I_HI = 6, I_DELAY = 7, I_ARMOUR = 8, I_BUY = 9, I_SELL = 10,
  I_BOTH_HANDS = 11, I_STATS = 12

/**
 * A row of `player.json`'s `kit` — what a new character is created holding,
 * out of `CharStartOutfit.dbc`.
 *
 * `[entry, word, min damage, max damage, swing ms, armour, slot]`, and the
 * names exist because the shape changed once and the two places that read it
 * did not change together.  The entry was added on the front so the items
 * could actually be put in his hands, `main.ts` was updated, and `simcheck`
 * went on summing field four — which had been armour and was now the swing.
 * It gave a level-one warrior 2,900 armour and an unkillable character, and
 * the only reason anybody noticed is that a check said `100% vs 100%` where
 * it had said `4% vs 69%`.
 */
export const K_ID = 0, K_WORD = 1, K_LO = 2, K_HI = 3, K_DELAY = 4,
  K_ARMOUR = 5, K_SLOT = 6

export type Shelf = {
  items: Record<string, Item>
  /** What each vendor stocks: `[item, how many at once, seconds to restock]`. */
  stock: Record<string, number[][]>
  /** What each trainer teaches: `[spell, cost, level, skill, prerequisite]`. */
  trainers: Record<string, { of: number; teaches: number[][] }>
}

/** The slots a paperdoll has a layer for, in the order they are drawn. */
export const SLOTS = ['back', 'legs', 'feet', 'chest', 'shirt', 'belt',
  'wrist', 'hands', 'shoulder', 'head', 'weapon', 'offhand', 'ranged'] as const
export type Slot = (typeof SLOTS)[number]

/** Which stat index one of our words moves. */
const STAT_INDEX: Record<string, number> = {
  str: STR, agi: AGI, sta: STA, int: INT, spi: SPI,
}

/**
 * Can he wear it?
 *
 * The class and race masks were already applied by the bake — everything here
 * is something a human warrior could hold — so what is left is the level.
 */
export const canWear = (it: Item, level: number): boolean =>
  !!it[I_SLOT] && (it[I_NEED] as number) <= level

/**
 * What is worn, added to what he is.
 *
 * Returns a fresh array: the level's own stats are a shared row out of
 * `player.json` and adding to it in place would make a breastplate permanent.
 */
export function withGear(base: Stats, worn: Item[]): Stats {
  const out = base.slice()
  for (const it of worn) {
    for (const [word, amount] of (it[I_STATS] as (string | number)[][]) ?? []) {
      const at = STAT_INDEX[word as string]
      if (at !== undefined) out[at] = (out[at] ?? 0) + (amount as number)
    }
  }
  return out
}

/** The armour on his back, which `armourOf` adds to the agility part. */
export const wornArmour = (worn: Item[]): number =>
  worn.reduce((n, it) => n + (it[I_ARMOUR] as number), 0)

/**
 * Putting something on, and what comes off to make room.
 *
 * A two-handed weapon takes the off hand with it, and putting something in the
 * off hand takes a two-handed weapon off — which is the only rule in this that
 * is not simply "one thing a slot".
 */
export function wear(gear: Record<string, number>, it: Item, id: number):
  { gear: Record<string, number>; off: number[] } {
  const slot = it[I_SLOT] as string
  const next = { ...gear }
  const off: number[] = []
  const drop = (s: string) => {
    if (next[s] !== undefined) { off.push(next[s]!); delete next[s] }
  }
  drop(slot)
  if (slot === 'weapon' && it[I_BOTH_HANDS]) drop('offhand')
  next[slot] = id
  return { gear: next, off }
}

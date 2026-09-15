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
import type { RepairTables } from './durability.ts'

/**
 * One item: `[word, slot, quality, item level, required level,
 * min damage, max damage, swing ms, armour, buy price, sell price,
 * two-handed, [[stat, amount], …], which weapon it is drawn as]`.
 *
 * `I_ARM` is empty for everything that is not a weapon, and for the eight
 * kinds of weapon nothing here draws — a bow is carried across the back and
 * there is no sheet for that.  It is `item_template.subclass` through
 * `spawn_npcs.WEAPON_SUBCLASS`, which is the same table that decides what an
 * NPC is holding: one vocabulary, two readers.
 *
 * `I_SUB` and `I_INV` are `item_template.subclass` and `InventoryType` as they
 * are, and they travel because `I_SLOT` folds away the one difference the
 * picture needs: a robe (20) and a breastplate (5) both go in `chest`.  What a
 * man is drawn wearing is read off these two — see `sim/outfit.ts`.
 */
export type Item = (string | number | (string | number)[][])[]
export const I_WORD = 0, I_SLOT = 1, I_QUALITY = 2, I_ILVL = 3, I_NEED = 4,
  I_LO = 5, I_HI = 6, I_DELAY = 7, I_ARMOUR = 8, I_BUY = 9, I_SELL = 10,
  I_BOTH_HANDS = 11, I_STATS = 12, I_ARM = 13, I_CLASSES = 14, I_USE = 15,
  /**
   * `item_template.MaxDurability`, and the column of `DurabilityCosts.dbc`
   * mending it is charged by — see `src/sim/durability.ts`.  Nought for a
   * thing that does not wear.
   */
  I_DURA = 16, I_DURA_COST = 17,
  I_SUB = 18, I_INV = 19

/**
 * What quality looks like.
 *
 * `I_QUALITY` was defined on the line above and read **nowhere else in this
 * repository** — 353 green items, 34 blue and 8 purple looked exactly like the
 * 976 white ones, and in the original the colour is the first thing you read
 * about an item, before the name.  This game does not use the names at all, so
 * the colour has to do more work here and not less.
 *
 * The colours are ours.  The original's come out of an engine function
 * (`GetItemQualityColor`) rather than out of `FrameXML`, so there is no number
 * to read — these are the six the interface already uses for everything else,
 * pushed apart far enough to tell at a glance on the dark panels this game
 * draws.  Index is `item_template.Quality`.
 */
export const QUALITY = [
  '#8a8a8a',  // 0 — worth less than the walk back
  '#e8e4d8',  // 1 — the ordinary thing, and the panels' own text colour
  '#6fc25b',  // 2 — 353 of them, and the commonest upgrade at these levels
  '#4d90d9',  // 3 — 34
  '#a95fd0',  // 4 — 8
  '#d9803a',  // 5
  '#d9b23a',  // 6
  '#c9a86a',  // 7 — one row has this, and it is the panels' own gold
] as const

/** The colour for one item, falling back to the ordinary. */
export function tintOf(it: Item): string {
  return QUALITY[it[I_QUALITY] as number] ?? QUALITY[1]!
}

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
  trainers: Record<string, {
    of: number
    /**
     * Which class it teaches — `trainer.Requirement` for a type 0 trainer.
     *
     * `of` beside it is the trainer's *type*, which is nought on every row
     * that reaches here because only type 0 does: a field computed once and
     * never able to differ.  With six classes in the game the question a
     * trainer answers is "is this one mine", and this is the column that says.
     */
    for?: number
    teaches: number[][]
  }>
  /**
   * Whose side each shopkeeper and trainer is on: `{creature: faction}`.
   *
   * Reputation changes a price and *whose* price it changes is the person
   * behind the counter — `Player::GetReputationPriceDiscount` reads the
   * creature's faction.  Two hops in the bake, because `creature_template`
   * holds a faction *template* and `FactionTemplate.dbc` holds the faction.
   */
  of?: Record<string, number>
  /**
   * Who mends and what it costs — `UNIT_NPC_FLAG_REPAIR` and the client's two
   * durability tables.  Absent from a world baked without a client, and then
   * nothing is offered, because a repair with no price is not one.
   */
  repair?: RepairTables
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
 * Three questions and the bake can only answer one of them now.  With one
 * class in the game "in this world" and "for me" were the same sentence, so
 * the mask was applied in `items.py` and nothing here had to ask again; with
 * six, a mage's robe passes the bake and is still not a warrior's.  So
 * `items.py` ships the column and this asks it for the character who is
 * actually standing there.
 *
 * `cls` defaults to nought, which means "do not ask" — that is what the
 * checks and the simulation pass, because a duel has no wardrobe.
 */
export const canWear = (it: Item, level: number, cls = 0): boolean =>
  !!it[I_SLOT] && (it[I_NEED] as number) <= level
  && forClass(it, cls)

/**
 * Whether this class may hold it at all — `item_template.AllowableClass`.
 *
 * **Nought is anybody, and it is the only spelling of anybody there is**,
 * because `items.py`'s `only_some` folds the dump's three — `0`, `-1` and all
 * fifteen bits — into it before shipping. Reading all three here instead
 * would work and would still be wrong: the shop's own check asks whether two
 * rows are the same item by comparing the whole shipped row, and two ways of
 * writing the same permission made one trade good into two.
 */
export const forClass = (it: Item, cls: number): boolean => {
  if (!cls) return true
  const mask = (it[I_CLASSES] as number) ?? 0
  return mask === 0 || !!(mask & (1 << (cls - 1)))
}

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

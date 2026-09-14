/**
 * What a person can learn to make, and whether this attempt teaches them
 * anything.
 *
 * The data is `public/world/trades.json`, which `pipeline/trades.py` derives
 * from `SkillLineAbility.dbc`, `Spell.dbc` and the world database's trainers.
 * Nothing in this file decides *what* exists — it decides what the numbers on
 * a row mean when somebody presses it.
 */

/** `[skill, spell, rank, how, cost, makes, count, needs, yellow, grey]`. */
export type Recipe = [number, number, number, number, number, number, number,
  [number, number][], number, number]

export const R_SKILL = 0, R_SPELL = 1, R_RANK = 2, R_HOW = 3, R_COST = 4,
  R_MAKES = 5, R_COUNT = 6, R_NEEDS = 7, R_YELLOW = 8, R_GREY = 9

/** `R_HOW`: nought is handed over with the rank, one is bought, else a recipe. */
export const GIVEN = 0, SOLD = 1

/** `[spell, cost, rank it asks for, level it asks for, ceiling it sets]`. */
export type Rank = [number, number, number, number, number]

export type Trade = {
  word: string
  /** Creature entries that teach it, inside this slice. */
  at: number[]
  /** The highest this game can take it — see `ceiling` in the bake. */
  cap: number
  /** The trade's own action: 2550 Cooking, 2575 Mining, 8613 Skinning. */
  does: number
  ranks: Rank[]
}

export type Trades = {
  trades: Record<string, Trade>
  recipes: Recipe[]
  /** Why a thing this world yields has nothing here to be made into. */
  unused: Record<string, number>
}

/**
 * The chance in a thousand that making this raises the skill.
 *
 * `Player::CraftSkillGainChance` (PlayerUpdates.cpp:766) and not an
 * approximation of it: the chance falls linearly from full at the yellow
 * threshold to nothing at the grey one, and the green threshold everybody
 * talks about is just the midpoint of that line.
 *
 * The two ends are the only numbers the server takes from its own config, and
 * they are the ends *by definition* — orange is "always a chance" and grey is
 * "no chance left" — so the ratio between them needs nothing this machine has
 * not got.
 */
export const ORANGE = 1000, GREY = 0

export function riseChance(skill: number, yellow: number, grey: number): number {
  if (grey <= yellow) return skill < grey ? ORANGE : GREY
  if (skill <= yellow) return ORANGE
  if (skill >= grey) return GREY
  return GREY + Math.floor((grey - skill) * (ORANGE - GREY) / (grey - yellow))
}

/** Orange, yellow, green, grey — what the row's colour says about it. */
export type Heat = 'orange' | 'yellow' | 'green' | 'grey'

export function heatOf(skill: number, yellow: number, grey: number): Heat {
  if (skill >= grey) return 'grey'
  if (skill <= yellow) return 'orange'
  return skill >= (yellow + grey) / 2 ? 'green' : 'yellow'
}

/**
 * What the recipe asks for that the bag has not got.
 *
 * The bag is keyed on the item id, which is the whole reason issue 200 could
 * be built at all: a tally of *words* can say "eleven cloth" and can never
 * say "two linen".
 */
export function short(needs: [number, number][],
  bag: Record<string, number>): [number, number][] {
  const out: [number, number][] = []
  for (const [item, many] of needs) {
    const has = bag[String(item)] ?? 0
    if (has < many) out.push([item, many - has])
  }
  return out
}

/**
 * How much skinning a corpse of this level asks for.
 *
 * `Spell::EffectSkinning` (SpellEffects.cpp:4914), which is the line this game
 * looked for once and did not find.  It reached instead for `Unit.cpp:3334`,
 * where a *weapon* skill is level times five, concluded that a level five wolf
 * wants twenty-five, and decided the gate was unopenable and dropped it.  The
 * real rule asks **nothing at all below level ten** and then climbs in tens —
 * which is exactly the shape a starting zone needs.
 */
export function skinAsks(level: number): number {
  if (level < 10) return 0
  if (level < 20) return (level - 10) * 10
  return level * 5
}

/** The next rank a person of this skill and level could buy, or nothing. */
export function nextRank(trade: Trade, rank: number, max: number,
  level: number): Rank | null {
  for (const r of trade.ranks) {
    if (r[4] <= max) continue
    if (rank < r[2] || level < r[3]) continue
    return r
  }
  return null
}

/** And the one after that, whatever is in the way, so a person can be told. */
export function afterThis(trade: Trade, max: number): Rank | null {
  for (const r of trade.ranks) if (r[4] > max) return r
  return null
}

import { RAID_SIZES, type DifficultyId, type RaidSize } from './sim/classes'
import { ENCOUNTERS, encounterIndex, encounterKit, type MechanicId } from './sim/encounters'

/**
 * What is open, and in what order it opens.
 *
 * The raid used to be three locked doors and nothing else: a boss opened when
 * the one before it died, and the size and the difficulty were free from the
 * first pull. Which meant the first thing a new player could do was walk a
 * twenty-five man heroic into the Drowned Warden, and the ladders made that
 * worse rather than better — the whole point of them is that a size and a
 * difficulty each buy a mechanic, and a game that hands you all five rungs
 * before you have seen the first two is a game that hands you the top of a
 * ladder and no rungs.
 *
 * So there is one chain, and it runs through every setting rather than past
 * them. Six rungs per boss, in the order the fight gets harder, and the last
 * of one boss opens the first of the next:
 *
 *   Warden 5N → 5H → 10N → 10H → 25N → 25H → Choir 5N → …
 *
 * Clearing a rung opens the one after it. Nothing else does — not reaching it,
 * not clearing something harder elsewhere — so what is open is always a prefix
 * of this list and a single number describes it.
 */
export interface Tier {
  encounter: number
  size: RaidSize
  difficulty: DifficultyId
}

/**
 * The six settings of one boss, hardest last.
 *
 * Size before difficulty at each step rather than all the sizes and then all
 * the difficulties, because that is the order they actually get harder in:
 * heroic at one size is measured below normal at the next in every cell of the
 * harness table, and a chain that ran 5N-10N-25N-5H would ask a raid to go
 * back down to five to carry on.
 */
const RUNGS: ReadonlyArray<{ size: RaidSize; difficulty: DifficultyId }> = [
  { size: 5, difficulty: 'normal' },
  { size: 5, difficulty: 'heroic' },
  { size: 10, difficulty: 'normal' },
  { size: 10, difficulty: 'heroic' },
  { size: 25, difficulty: 'normal' },
  { size: 25, difficulty: 'heroic' },
]

export const RUNGS_PER_BOSS = RUNGS.length

/** Every setting in the game, in the order it opens. */
export const LADDER: readonly Tier[] = ENCOUNTERS.flatMap((_, encounter) =>
  RUNGS.map((rung) => ({ encounter, size: rung.size, difficulty: rung.difficulty })),
)

/** The first rung, which is open before anything has been cleared. */
export const FIRST_TIER = 0

export function tierAt(index: number): Tier {
  return LADDER[Math.max(0, Math.min(LADDER.length - 1, Math.round(index)))]!
}

/**
 * Where a setting sits on the chain, or -1 for one that is not on it.
 *
 * A size outside the three is not a raid setting at all — a battleground is
 * five a side and does not belong here — so it is answered with -1 rather than
 * clamped onto the nearest rung.
 */
export function tierOf(encounter: number, size: number, difficulty: DifficultyId): number {
  if (!RAID_SIZES.includes(size as RaidSize)) return -1
  const rung = RUNGS.findIndex((r) => r.size === size && r.difficulty === difficulty)
  if (rung < 0) return -1
  return encounterIndex(encounter) * RUNGS_PER_BOSS + rung
}

/** Whether tonight's setting is one the player has earned. */
export function isOpen(unlocked: number, encounter: number, size: number, difficulty: DifficultyId): boolean {
  const tier = tierOf(encounter, size, difficulty)
  return tier >= 0 && tier <= unlocked
}

/**
 * What a kill opens.
 *
 * Only ever forward: clearing a rung already behind you opens nothing, which
 * is what lets a player go back and farm the first boss without the rest of
 * the game closing behind them.
 */
export function cleared(
  unlocked: number,
  encounter: number,
  size: number,
  difficulty: DifficultyId,
): number {
  const tier = tierOf(encounter, size, difficulty)
  if (tier < 0) return unlocked
  return Math.max(unlocked, Math.min(LADDER.length - 1, tier + 1))
}

/** Whether the whole boss is reachable at all, for the row of boss buttons. */
export function bossOpen(unlocked: number, encounter: number): boolean {
  return encounterIndex(encounter) * RUNGS_PER_BOSS <= unlocked
}

/**
 * The setting to fall back to when the one you are on is not open.
 *
 * Reached from a saved setup that predates the chain, from an invitation to a
 * boss you have not climbed, and from pressing a boss whose top rungs are
 * still locked. Always a real rung of that boss rather than the nearest legal
 * anything: dropping a player onto a different boss because their difficulty
 * was locked would be a stranger answer than dropping their difficulty.
 */
export function bestOpen(unlocked: number, encounter: number): Tier {
  const at = encounterIndex(encounter)
  const first = at * RUNGS_PER_BOSS
  if (first > unlocked) return tierAt(0)
  return tierAt(Math.min(first + RUNGS_PER_BOSS - 1, unlocked))
}

/** Whether anything follows this setting at all. */
export function hasNextTier(encounter: number, size: number, difficulty: DifficultyId): boolean {
  const tier = tierOf(encounter, size, difficulty)
  return tier >= 0 && tier < LADDER.length - 1
}

/**
 * What opening a rung buys, in mechanics.
 *
 * The chain's whole argument is that a size and a difficulty each buy a
 * mechanic, and until now the only place that was ever said out loud was a
 * count on the setup screen -- so a player who cleared a rung was told a
 * harder setting had opened and never told what was in it. This is the
 * difference between the kit the rung above throws and the kit the one just
 * cleared threw, which for every rung inside a boss is exactly one mechanic.
 *
 * Empty at the top of a boss, where what opens is a different fight and the
 * mechanics it owns are its own rather than one more of these.
 */
export function rungBuys(tier: number): MechanicId[] {
  if (tier <= 0 || tier >= LADDER.length) return []
  const here = tierAt(tier)
  const before = tierAt(tier - 1)
  if (before.encounter !== here.encounter) return []
  const fight = ENCOUNTERS[here.encounter]
  if (!fight) return []
  const had = encounterKit(fight, before.size, before.difficulty)
  return encounterKit(fight, here.size, here.difficulty).filter((id) => !had.includes(id))
}

/** What a rung is called, for the button that walks onto it. */
export function tierLabel(tier: Tier): string {
  return `${tier.size}-MAN ${tier.difficulty === 'heroic' ? 'HEROIC' : 'NORMAL'}`
}

/**
 * What the setup screen is currently pointed at.
 *
 * The three rows of that screen are one answer, not three: pressing a boss can
 * move the size, and pressing a size can move the difficulty. Kept here rather
 * than as three assignments in the screen's own code, because every one of
 * those rules is a rule about what is open — and a rule about what is open
 * that lives in a click handler is a rule nothing can check.
 */
export interface Setting {
  encounter: number
  size: RaidSize
  difficulty: DifficultyId
}

function same(a: Setting, b: Setting): boolean {
  return a.encounter === b.encounter && a.size === b.size && a.difficulty === b.difficulty
}

/**
 * Drops a setting onto the best rung of its own boss that is actually open.
 *
 * Reached from a save written before the chain existed, from an invitation to
 * somebody else's fight, from coming back out of a battleground, and from
 * pressing a boss whose top rungs are still locked. It moves the size and the
 * difficulty and, unless the boss itself is unreached, never the boss — a
 * player who pressed the Choir and got moved to the Warden because their
 * difficulty was locked would be reading a stranger answer than one who got
 * moved to normal.
 */
export function settle(unlocked: number, setting: Setting): Setting {
  if (isOpen(unlocked, setting.encounter, setting.size, setting.difficulty)) return setting
  return bestOpen(unlocked, setting.encounter)
}

/** A locked boss does nothing; an open one may still bring the rows down. */
export function pressBoss(unlocked: number, setting: Setting, index: number): Setting {
  if (!bossOpen(unlocked, index)) return setting
  return settle(unlocked, { ...setting, encounter: encounterIndex(index) })
}

/**
 * A size is a door, and its own normal is what the door is.
 *
 * Stepping up lands on normal when heroic there is a rung further on, which it
 * is exactly when the size was only just opened — the rung that opens a size
 * is that size on normal.
 */
export function pressSize(unlocked: number, setting: Setting, size: RaidSize): Setting {
  if (!isOpen(unlocked, setting.encounter, size, 'normal')) return setting
  const difficulty = isOpen(unlocked, setting.encounter, size, setting.difficulty)
    ? setting.difficulty
    : 'normal'
  return { ...setting, size, difficulty }
}

export function pressDifficulty(unlocked: number, setting: Setting, id: DifficultyId): Setting {
  if (!isOpen(unlocked, setting.encounter, setting.size, id)) return setting
  return { ...setting, difficulty: id }
}

/** The rung above this one, or this one where the chain ends. */
export function nextSetting(setting: Setting): Setting {
  const here = tierOf(setting.encounter, setting.size, setting.difficulty)
  if (here < 0 || here >= LADDER.length - 1) return setting
  return tierAt(here + 1)
}

/** Whether a press or an advance actually moved anything. */
export function moved(before: Setting, after: Setting): boolean {
  return !same(before, after)
}

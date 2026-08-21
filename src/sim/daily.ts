import { DIFFICULTIES, RAID_SIZES, type DifficultyId, type Pick, type RaidSize, randomParty } from './classes'
import { ENCOUNTERS } from './encounters'
import { Rng } from './rng'

/**
 * One run a day, the same one for everybody.
 *
 * This simulation reproduces exactly from a seed — that is what the harness
 * leans on, and until now it was only ever a testing property. Keyed off the
 * date instead, it becomes the one thing a game with no server can still offer:
 * a run somebody else played too, on the same boss with the same rolls, where
 * the only difference is how it was played.
 *
 * What the day fixes: the boss, the size, the difficulty, the seed the fight
 * runs on and the party rolled around you. What it does not fix is which class
 * you bring — that is the choice the game is about, and taking it away to make
 * the comparison tidier would be trading the game for the scoreboard.
 */

export interface Daily {
  /** YYYYMMDD in UTC, which is also the key the record is stored under. */
  key: number
  seed: number
  encounter: number
  size: RaidSize
  difficulty: DifficultyId
  /** The four slots around the player, rolled from the day's seed. */
  party: Pick[]
}

/** UTC so that two people in different places get the same day's run. */
export function dailyKey(at: Date): number {
  return at.getUTCFullYear() * 10000 + (at.getUTCMonth() + 1) * 100 + at.getUTCDate()
}

/**
 * The day, expanded into a fight.
 *
 * Everything is drawn from one number in a fixed order, so the same date is
 * the same run on any machine — and adding a boss to the end of `ENCOUNTERS`
 * changes what past dates would have been, which is why the record stores what
 * it played rather than trying to recompute it.
 */
export function dailyFor(key: number, player: Pick): Daily {
  const rng = new Rng(key)
  const encounter = rng.int(ENCOUNTERS.length)
  const size = RAID_SIZES[rng.int(RAID_SIZES.length)]!
  // Heroic about one day in three: often enough to be a real week, rare enough
  // that a bad draw is not most of the month.
  const difficulty: DifficultyId = rng.chance(0.34) ? 'heroic' : 'normal'
  const party = randomParty(size, () => rng.range(0, 1))

  return {
    key,
    // Not the key itself: a date makes a poor seed, since consecutive days
    // differ by one and would produce neighbouring fights.
    seed: (key * 2654435761) % 2147483647,
    encounter,
    size,
    difficulty,
    party: [{ ...player }, ...party.slice(1)],
  }
}

/** One line of what today is, for the screen that offers it. */
export function dailyLabel(daily: Daily): string {
  const boss = ENCOUNTERS[daily.encounter]
  return `${boss?.name ?? 'Unknown'} · ${daily.size} player · ${DIFFICULTIES[daily.difficulty].name.toLowerCase()}`
}

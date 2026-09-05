import { DIFFICULTIES, type DifficultyId, type Pick, type RaidSize, randomParty } from './classes'
import { AFFIXES, affixById, type AffixId } from './affix'
import { ENCOUNTERS } from './encounters'
import { rollDaily, type FloorPlan } from './floor'
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
  /** The day's twist. Every daily has one; ordinary raids have none. */
  affix: AffixId
  /** YYYYMMDD in UTC, which is also the key the record is stored under. */
  key: number
  seed: number
  encounter: number
  size: RaidSize
  difficulty: DifficultyId
  /** The four slots around the player, rolled from the day's seed. */
  party: Pick[]
  /**
   * The boss's whole vocabulary, at cadences this day rolled.
   *
   * The day already picks which boss stands there; this picks what it does.
   * An authored boss throws the part of its ladder the size and difficulty
   * paid for — six mechanics at the top, and the same six every time you meet
   * it — which is right for a fight you are learning and wrong for the one
   * pull a day nobody gets to practise. So the daily takes the whole
   * catalogue, and what the day decides is how often each of the fourteen
   * comes.
   */
  plan: FloorPlan
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
  // Always the full raid.
  //
  // The size used to be rolled with everything else, and it was the one roll
  // that changed what the day was rather than what it contained. A five-player
  // daily and a twenty-five-player daily are not the same fight at two scales:
  // the mechanics that divide their damage among the people standing in them
  // ask a different question of four bodies than of twenty-four, and a
  // scoreboard comparing the two is comparing nothing.
  //
  // Twenty-five rather than five because the daily is the one run that is
  // supposed to be the whole game — the room at its widest, every mechanic at
  // the size it was written for.
  const size: RaidSize = 25
  // Heroic about one day in three: often enough to be a real week, rare enough
  // that a bad draw is not most of the month.
  const difficulty: DifficultyId = rng.chance(0.34) ? 'heroic' : 'normal'
  const party = randomParty(size, () => rng.range(0, 1))
  // Drawn last, so adding an affix does not change which boss past dates were.
  const affix = AFFIXES[rng.int(AFFIXES.length)]!.id
  // Off its own seed rather than the shared roll, so that adding a mechanic to
  // the catalogue changes what today throws and not which boss today is.
  const plan = rollDaily(key * 2246822519 + 7)

  return {
    affix,
    key,
    // Not the key itself: a date makes a poor seed, since consecutive days
    // differ by one and would produce neighbouring fights.
    seed: (key * 2654435761) % 2147483647,
    encounter,
    size,
    difficulty,
    party: [{ ...player }, ...party.slice(1)],
    plan,
  }
}

/** One line of what today is, for the screen that offers it. */
export function dailyLabel(daily: Daily): string {
  const boss = ENCOUNTERS[daily.encounter]
  return `${boss?.name ?? 'Unknown'} · ${daily.size} player · ${DIFFICULTIES[daily.difficulty].name.toLowerCase()}`
}

/** The twist, as two lines: what it is called and what it does. */
export function dailyAffix(daily: Daily): { name: string; detail: string } {
  const affix = affixById(daily.affix)
  return affix
    ? { name: affix.name.toUpperCase(), detail: affix.detail }
    : { name: '', detail: '' }
}

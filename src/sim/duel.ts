/**
 * One fight, start to finish, with nothing on screen.
 *
 * The harness design says four of its six kinds of check should not need a
 * browser — data, rules, geometry, determinism — and two of those had nowhere
 * to live: every rule in this game was inside `main()`, in the same closure as
 * the canvas, so "is the combat arithmetic right" could only be asked by
 * starting Chromium and playing.
 *
 * This is the same arithmetic the scene runs, in a function that takes numbers
 * and returns numbers.  `scripts/simcheck.mjs` calls it from Node; `main.ts`
 * calls it too, so there is one fight in this repository rather than two that
 * are supposed to agree.
 */
import { swing, rageFrom, type Fight, ARMOUR, HP, SWING } from './fight.ts'
import { roll } from './roll.ts'
import {
  critChance, damageAfter, dodgeChance, rollMelee,
  CREATURE_BLOCK, CREATURE_CRIT, CREATURE_DODGE, CREATURE_PARRY_HUMANOID,
  PARRY_WITH_WEAPON, type Stats, type Who,
} from './stats.ts'

export type Side = {
  level: number
  line: Fight
  stats: Stats
}

export type Duel = {
  /** How many of them there are. */
  many: number
  /** How many fights to run. */
  runs: number
  /**
   * What the player does.
   *
   * `auto` presses nothing at all.  `rota` spends rage on the one thing a
   * level one warrior has the moment it can, which is the simplest fixed
   * order anybody could write on a macro.  The gap between them is how much of
   * this game is a decision.
   */
  policy?: 'auto' | 'rota'
  /** What that one thing costs and adds, if the policy presses it. */
  opener?: { rage: number; adds: number }
}

export type Result = {
  runs: number
  won: number
  survived: number
  seconds: number
  presses: number
}

/** How long a step of the fight is, in milliseconds — the world's own. */
const STEP = 100
/** No fight in this game is an hour long; a runaway is a bug, not a stalemate. */
const LONGEST = 60_000

/**
 * Run it.
 *
 * The blow-by-blow is the scene's: one roll through the hit table, the armour
 * curve on the damage, the swing timer from the weapon.  Nothing here is a
 * second implementation — every function called is the one the game calls.
 */
export function duel(mine: Side, theirs: Side, who: Who | null,
  opts: Duel): Result {
  const { many, runs, policy = 'auto', opener } = opts
  let won = 0, ticks = 0, presses = 0
  for (let r = 0; r < runs; r++) {
    let hp = mine.line[HP]!
    let rage = 0, extra = 0, pressed = 0
    const foes = Array.from({ length: many }, () => theirs.line[HP]!)
    const theirNext = foes.map(() => 0)
    let myNext = 0
    for (let t = 0; t < LONGEST && hp > 0 && foes.some((h) => h > 0); t += STEP) {
      const target = foes.findIndex((h) => h > 0)
      if (target >= 0 && t >= myNext) {
        myNext = t + mine.line[SWING]!
        const fate = rollMelee(
          { level: mine.level, humanoid: true,
            crit: who ? critChance(mine.level, mine.stats, who) : 5 },
          { level: theirs.level, dodge: CREATURE_DODGE,
            parry: CREATURE_PARRY_HUMANOID, block: CREATURE_BLOCK },
          roll() * 10000)
        const dealt = damageAfter(fate,
          swing(mine.line, theirs.level, theirs.line[ARMOUR]!, roll()) + extra,
          theirs.level - mine.level)
        extra = 0
        foes[target]! -= dealt
        rage = Math.min(100,
          rage + rageFrom(dealt, mine.level, mine.line[SWING]! / 1000, true))
        if (policy === 'rota' && opener && rage >= opener.rage) {
          rage -= opener.rage
          extra += opener.adds
          pressed += 1
        }
      }
      for (let i = 0; i < many; i++) {
        if (foes[i]! <= 0 || t < theirNext[i]!) continue
        theirNext[i] = t + theirs.line[SWING]!
        const fate = rollMelee(
          { level: theirs.level, crit: CREATURE_CRIT },
          { level: mine.level, parry: PARRY_WITH_WEAPON, block: 0, player: true,
            dodge: who ? dodgeChance(mine.level, mine.stats, who) : 5 },
          roll() * 10000)
        const took = damageAfter(fate,
          swing(theirs.line, mine.level, mine.line[ARMOUR]!, roll()),
          theirs.level - mine.level)
        hp -= took
        rage = Math.min(100,
          rage + rageFrom(took, mine.level, mine.line[SWING]! / 1000, false))
      }
      ticks += 1
    }
    if (hp > 0) won += 1
    presses += pressed
  }
  return {
    runs, won, survived: won / runs,
    seconds: (ticks / runs) * (STEP / 1000),
    presses: presses / runs,
  }
}

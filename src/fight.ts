/**
 * What a swing is worth, by the rules the server uses.
 *
 * The numbers come out of AzerothCore and `pipeline/spawn_npcs.py` writes them
 * into the spawn file: health, a damage range, how long a swing takes and how
 * much armour is in the way, for every distinct (kind, level) in the slice.
 * None of that is invented here — this file is the arithmetic that turns those
 * numbers into a hit, and it is kept apart from the scene because it is the
 * part that has to be right rather than the part that has to look right.
 */

/** `[health, min damage, max damage, swing ms, armour, hostile]`. */
export type Fight = number[]

export const HP = 0, LO = 1, HI = 2, SWING = 3, ARMOUR = 4, FOE = 5

/**
 * How much of a hit the armour eats.
 *
 * The server's own curve: armour is compared against a number that grows with
 * the attacker's level, so the same breastplate is worth less against someone
 * bigger.  Capped at three quarters, which is where the server caps it — an
 * uncapped ratio makes a plate-wearing guard immortal rather than tough.
 */
export function mitigate(armour: number, level: number): number {
  const at = armour / (armour + 400 + 85 * level)
  return Math.max(0, Math.min(0.75, at))
}

/**
 * One swing: a roll inside the range, then the armour.
 *
 * Never less than one. A hit that lands for nothing reads as a bug in the
 * game rather than as a tough opponent, and the server rounds the same way.
 */
export function swing(f: Fight, level: number, armour: number, roll: number): number {
  const raw = f[LO]! + (f[HI]! - f[LO]!) * roll
  return Math.max(1, Math.round(raw * (1 - mitigate(armour, level))))
}

/**
 * How far a hostile notices you from.
 *
 * The server's is a level difference plus a base, which is why a level 1 rat
 * ignores a grown adventurer walking past.  Kept to the same shape: twenty
 * yards at parity, shrinking by a yard a level in either direction, and never
 * outside five to twenty-five.
 */
export function noticeAt(mine: number, theirs: number): number {
  return Math.max(5, Math.min(25, 20 - (mine - theirs)))
}

/** Melee reach, in yards. Two bodies and an arm. */
export const MELEE = 3.0

/**
 * The level at which something stops being worth killing.
 *
 * AzerothCore's `GetGrayLevel`, which is the server's, which is the game's.
 * Below this a kill is worth nothing at all — it is what stops a level 40
 * adventurer farming the rabbits outside the abbey.
 */
export function greyAt(level: number): number {
  if (level <= 5) return 0
  if (level <= 39) return level - 5 - Math.floor(level / 10)
  if (level <= 59) return level - 1 - Math.floor(level / 5)
  return level - 9
}

/** `GetZeroDifference`: how many levels below you a kill fades out over. */
function fadeOver(level: number): number {
  const steps: [number, number][] = [[8, 5], [10, 6], [12, 7], [16, 8],
    [20, 9], [30, 11], [40, 12], [45, 13], [50, 14], [55, 15], [60, 16]]
  for (const [under, diff] of steps) if (level < under) return diff
  return 17
}

/**
 * What a kill is worth.
 *
 * `Acore::XP::BaseGain`, arithmetic for arithmetic.  Forty-five is the base
 * for everything in the first sixty levels — the two later expansions have
 * their own and this forest is not in them.  Something above your level is
 * worth more, up to four levels of more; something below is worth less on a
 * straight line down to nothing at the grey level.  An elite is worth twice
 * whatever it would have been.
 */
export function xpFor(mine: number, theirs: number, elite: boolean): number {
  const base = 45
  let gain: number
  if (theirs >= mine) {
    const over = Math.min(4, theirs - mine)
    gain = Math.floor((Math.floor((mine * 5 + base) * (20 + over) / 10) + 1) / 2)
  } else if (theirs > greyAt(mine)) {
    const zd = fadeOver(mine)
    gain = Math.floor((mine * 5 + base) * (zd + theirs - mine) / zd)
  } else {
    gain = 0
  }
  return elite ? gain * 2 : gain
}

/**
 * How much rage a blow is worth.
 *
 * The server's own curve, which is a quadratic in level and then a different
 * multiplier depending on which end of the blow you were on.  Dealing damage
 * pays more than taking it, and the swing's own length is half of what dealing
 * it pays — which is why a slow weapon feels like it generates more.
 *
 * Nothing here is tuned.  At level 5 the conversion is 20.6, so a seven-damage
 * swing on a 1.9 second weapon comes to about four and a half rage, and a
 * fifteen-rage blow is every third swing.  That is the shape the game has.
 */
export function rageFrom(damage: number, level: number,
  swingSeconds: number, dealing: boolean): number {
  const convert = 0.0091107836 * level * level + 3.225598133 * level + 4.2652911
  if (!dealing) return (damage / convert) * 2.5
  const fromDamage = (damage / convert) * 7.5
  const fromSpeed = swingSeconds * 3.5
  return Math.min((fromDamage + fromSpeed) / 2, fromDamage * 2)
}

/** What the bar holds. */
export const MAX_RAGE = 100

/**
 * One ability, as `pipeline/spells.py` writes it.
 *
 * `does` is the client's three effect slots, each `[effect, amount, dieSides,
 * aura, period]`.  The engine implements the handful of effects it can and
 * ignores the rest, which is honest: an ability whose effect nothing here
 * understands simply does not appear on the bar.
 */
export type Spell = {
  id: number
  level: number
  rage: number
  cool: number
  reach: [number, number]
  holds: number
  does: number[][]
}

/** The effect numbers this engine knows what to do with. */
export const E_DAMAGE = 2, E_ENERGIZE = 3, E_AURA = 6, E_WEAPON_ADD = 58
/** And the auras. */
export const A_PERIODIC_DAMAGE = 3, A_ATTACK_POWER = 99

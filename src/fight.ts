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

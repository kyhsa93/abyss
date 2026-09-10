import { PARTY_RADIUS, YARD } from './constants'

/**
 * What one creature of the raid's trash is, off AzerothCore's own rows.
 *
 * A corridor used to be one creature repeated: every body a "Watchman" with
 * the same health, the same size, the same speed and one swing. The building
 * is not that. Thirty-six kinds stand in it, they are between a quarter of
 * each other's size and forty times each other's health, a third of them shoot
 * rather than close, and three of them keep the rest up.
 *
 * Four numbers a kind, and every one of them is a column:
 *
 *   `hp`     `creature_template.HealthModifier` against
 *            `creature_classlevelstats` for its own class at level 83, as a
 *            share of The Damned's — the creature the first corridor was
 *            built out of, so one is "ordinary trash".
 *   `reach`  `creature_model_info.CombatReach`. A player's is 1.5, so this is
 *            how many bodies wide the thing is. Nought is the source's word
 *            for "no row", and it reads as ordinary.
 *   `run`    `creature_template.speed_run`, a multiplier of the source's base
 *            seven yards a second — the unit this game's speeds are in.
 *   the two flags, off the scripts rather than the tables: `shoots` is a kind
 *            whose own attack is a bolt (`smart_scripts` and the C++ AIs), and
 *            `mends` is one that heals its side.
 *
 * `BoundingRadius` is the column this *should* have used for size and cannot:
 * six thousand of the twenty-four thousand models carry nought and eleven
 * hundred carry exactly 2.00, and this raid's rows are in both piles — a
 * Frostwing Whelp is nought and a Rotting Frost Giant is 0.54, which would
 * make the biggest thing on the rampart smaller than a cultist. Combat reach
 * has its own defaults but it orders them correctly, which is what a size is
 * for here.
 */
export interface TrashKind {
  hp: number
  reach: number
  run: number
  shoots?: boolean
  mends?: boolean
}

/** A player's combat reach, which is what the rest are measured against. */
const BODY_REACH = 1.5

export const TRASH_KINDS: Record<string, TrashKind> = {
  'The Damned': { hp: 1, reach: 3.75, run: 1.1905 },
  'Servant of the Throne': { hp: 0.7895, reach: 2.0, run: 0.99206, shoots: true },
  'Ancient Skeletal Soldier': { hp: 0.6579, reach: 1.5, run: 1.1429 },
  'Deathbound Ward': { hp: 3.289, reach: 6.0, run: 1.4286 },
  "Nerub'ar Broodkeeper": { hp: 0.6579, reach: 3.0, run: 0.99206, shoots: true, mends: true },
  'Deathspeaker Zealot': { hp: 0.7895, reach: 3.0, run: 1.7143 },
  'Deathspeaker Disciple': { hp: 0.5263, reach: 2.0, run: 1.7143, shoots: true, mends: true },
  'Deathspeaker Attendant': { hp: 0.5263, reach: 3.0, run: 1.7143, shoots: true },
  'Deathspeaker Servant': { hp: 0.4211, reach: 3.0, run: 1.7143, shoots: true },
  'Deathspeaker High Priest': { hp: 1.974, reach: 4.0, run: 1.7143 },
  'Spire Gargoyle': { hp: 0.6579, reach: 3.0, run: 0.57143, shoots: true },
  'Spire Minion': { hp: 0.6579, reach: 2.0, run: 0.99206 },
  'Frenzied Abomination': { hp: 1.316, reach: 4.5, run: 1.1429 },
  'Rotting Frost Giant': { hp: 43.42, reach: 7.875, run: 0.99206 },
  'Blighted Abomination': { hp: 1.974, reach: 4.5, run: 1.1429 },
  'Plague Scientist': { hp: 0.9211, reach: 2.415, run: 1.4286, shoots: true },
  'Pustulating Horror': { hp: 1.316, reach: 1.5, run: 1.2897 },
  'Vengeful Fleshreaper': { hp: 0.3289, reach: 3.0, run: 1.5 },
  'Decaying Colossus': { hp: 3.289, reach: 5.85, run: 0.99206 },
  Stinky: { hp: 6.579, reach: 9.0, run: 1.7143 },
  Precious: { hp: 6.579, reach: 9.0, run: 1.7143 },
  'Darkfallen Archmage': { hp: 0.8421, reach: 2.4, run: 1.1429, shoots: true },
  'Darkfallen Blood Knight': { hp: 0.8421, reach: 2.4, run: 1.1429 },
  'Darkfallen Noble': { hp: 0.8421, reach: 2.475, run: 1.1429, shoots: true },
  'Darkfallen Advisor': { hp: 1.053, reach: 3.0, run: 1.1429, mends: true },
  'Darkfallen Commander': { hp: 1.263, reach: 2.475, run: 1.1429 },
  'Darkfallen Lieutenant': { hp: 1.263, reach: 2.475, run: 1.1429 },
  'Darkfallen Tactician': { hp: 1.579, reach: 2.475, run: 1.1429 },
  'Ymirjar Huntress': { hp: 0.9211, reach: 1.0, run: 1.2857, shoots: true },
  'Ymirjar Battle-Maiden': { hp: 1.184, reach: 1.5, run: 1.1429 },
  'Ymirjar Warlord': { hp: 1.316, reach: 1.5, run: 1.4286 },
  'Ymirjar Frostbinder': { hp: 0.9474, reach: 1.3, run: 1.1429, shoots: true },
  'Ymirjar Deathbringer': { hp: 1.184, reach: 1.3, run: 1.1429, shoots: true },
  'Frostwing Whelp': { hp: 0.2632, reach: 0.0, run: 1.1429 },
  'Frostwarden Handler': { hp: 2.368, reach: 1.5, run: 1.4286 },
  Spinestalker: { hp: 6.316, reach: 9.0, run: 2 },
  Rimefang: { hp: 6.316, reach: 9.0, run: 2 },
}

/**
 * What a body of this kind is worth, against a body of ordinary trash.
 *
 * The square root of the source's ratio rather than the ratio, for the reason
 * it has always been: the spread is forty to one between the lightest trash in
 * this raid and the heaviest, and a body worth forty is a boss standing in a
 * corridor. The root keeps every ordering and brings the spread to about seven
 * to one, which is the range these corridors are built for.
 */
export function trashWeight(kind: string): number {
  return Math.sqrt(TRASH_KINDS[kind]?.hp ?? 1)
}

/** How wide it is, in world units, off its combat reach against a player's. */
export function trashRadius(kind: string): number {
  const reach = TRASH_KINDS[kind]?.reach ?? 0
  return Math.round((PARTY_RADIUS * (reach > 0 ? reach : BODY_REACH)) / BODY_REACH)
}

/** And how fast, off `speed_run` against the source's base seven yards. */
export function trashPace(kind: string): number {
  return Math.round((TRASH_KINDS[kind]?.run ?? 1) * 7 * YARD)
}

/** Whether its own attack is a bolt rather than a swing. */
export function trashShoots(kind: string): boolean {
  return TRASH_KINDS[kind]?.shoots === true
}

/** And whether it is the body in the pack worth killing first. */
export function trashMends(kind: string): boolean {
  return TRASH_KINDS[kind]?.mends === true
}

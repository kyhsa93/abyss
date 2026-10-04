import { PARTY_RADIUS, YARD } from './constants'

/**
 * What one creature of the raid's trash is, off AzerothCore's own rows.
 *
 * A corridor used to be one creature repeated: every body a "Watchman" with
 * the same health, the same size, the same speed and one swing. The building
 * is not that. Thirty-seven kinds stand in it, they are between a quarter of
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
  'The Unburied': { hp: 1, reach: 3.75, run: 1.1905 },
  'Servant of the Stair': { hp: 0.7895, reach: 2.0, run: 0.99206, shoots: true },
  'Barrow Legionary': { hp: 0.6579, reach: 1.5, run: 1.1429 },
  'Graven Sentinel': { hp: 3.289, reach: 6.0, run: 1.4286 },
  "Carapace Broodtender": { hp: 0.6579, reach: 3.0, run: 0.99206, shoots: true, mends: true },
  'Hushed Zealot': { hp: 0.7895, reach: 3.0, run: 1.7143 },
  'Hushed Disciple': { hp: 0.5263, reach: 2.0, run: 1.7143, shoots: true, mends: true },
  'Hushed Attendant': { hp: 0.5263, reach: 3.0, run: 1.7143, shoots: true },
  'Hushed Servant': { hp: 0.4211, reach: 3.0, run: 1.7143, shoots: true },
  'Hushed High Priest': { hp: 1.974, reach: 4.0, run: 1.7143 },
  'Belfry Gargoyle': { hp: 0.6579, reach: 3.0, run: 0.57143, shoots: true },
  'Belfry Minion': { hp: 0.6579, reach: 2.0, run: 0.99206 },
  'Raving Stitchwork': { hp: 1.316, reach: 4.5, run: 1.1429 },
  'Thawing Giant': { hp: 43.42, reach: 7.875, run: 0.99206 },
  'Soured Stitchwork': { hp: 1.974, reach: 4.5, run: 1.1429 },
  'Vat Chemist': { hp: 0.9211, reach: 2.415, run: 1.4286, shoots: true },
  'Blistered Wretch': { hp: 1.316, reach: 1.5, run: 1.2897 },
  'Spiteful Gnawer': { hp: 0.3289, reach: 3.0, run: 1.5 },
  'Sagging Colossus': { hp: 3.289, reach: 5.85, run: 0.99206 },
  Gristle: { hp: 6.579, reach: 9.0, run: 1.7143 },
  Sweetmeat: { hp: 6.579, reach: 9.0, run: 1.7143 },
  'Red Court Archmage': { hp: 0.8421, reach: 2.4, run: 1.1429, shoots: true },
  'Red Court Bladesman': { hp: 0.8421, reach: 2.4, run: 1.1429 },
  'Red Court Noble': { hp: 0.8421, reach: 2.475, run: 1.1429, shoots: true },
  'Red Court Advisor': { hp: 1.053, reach: 3.0, run: 1.1429, mends: true },
  'Red Court Commander': { hp: 1.263, reach: 2.475, run: 1.1429 },
  'Red Court Lieutenant': { hp: 1.263, reach: 2.475, run: 1.1429 },
  'Red Court Tactician': { hp: 1.579, reach: 2.475, run: 1.1429 },
  'Snowborn Huntress': { hp: 0.9211, reach: 1.0, run: 1.2857, shoots: true },
  'Snowborn Shieldmaiden': { hp: 1.184, reach: 1.5, run: 1.1429 },
  'Snowborn Warlord': { hp: 1.316, reach: 1.5, run: 1.4286 },
  'Snowborn Frostcaller': { hp: 0.9474, reach: 1.3, run: 1.1429, shoots: true },
  'Snowborn Bonecaster': { hp: 1.184, reach: 1.3, run: 1.1429, shoots: true },
  'Hoarwing Whelp': { hp: 0.2632, reach: 0.0, run: 1.1429 },
  'Hoarwing Handler': { hp: 2.368, reach: 1.5, run: 1.4286 },
  Thornback: { hp: 6.316, reach: 9.0, run: 2 },
  Sleetjaw: { hp: 6.316, reach: 9.0, run: 2 },
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

/**
 * The looks that are a person, and are therefore a person's width.
 *
 * `reach` orders the raid's bodies correctly and that ordering is what a size
 * is for here -- but it is a *reach*, and a cultist holding something long is
 * not a wide cultist. Measured, that put twenty of the thirty-seven between a
 * third and two thirds wider than the player standing beside them, and the
 * three Deathspeakers at exactly twice.
 *
 * The source has no width to put in its place. Nine derivations were tried
 * against it and every one failed; `docs/reading-the-source.md` lists them.
 * The short of it: `creature_model_info.BoundingRadius` is defaulted on the
 * rows that matter and reads a frost giant as narrower than a vampire, the
 * client's `CreatureDisplayInfo` scale is a multiplier on a model rather than
 * a size, and `CreatureModelData`'s extents are either gapped or order a
 * skeleton above a noble.
 *
 * What did survive is already in this file: `TRASH_LOOK` groups the raid by
 * what each creature *is*, and its own note says so -- bone, cult, risen,
 * San'layn, vrykul for the people, and the nearest silhouette LPC has for
 * everything that is not one. Four of those are people end to end, so a body
 * drawn with one of them is drawn a person's width.
 *
 * `bone` is not among them and that is the whole of why this is a list rather
 * than "every person-shaped look": it holds an Ancient Skeletal Soldier at one
 * player, The Damned at two and a half and a Deathbound Ward at four, and the
 * last of those is a construct rather than a man.
 */
const PERSON_LOOKS = new Set(['cult', 'blood', 'vrykul', 'ghoul'])

/** How wide it is, in world units: a person's width, or off its combat reach. */
export function trashRadius(kind: string): number {
  if (PERSON_LOOKS.has(TRASH_LOOK[kind] ?? '')) return PARTY_RADIUS
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

/**
 * Which of the nine bodies this kind is drawn as.
 *
 * Thirty-seven creatures and one sprite between them: a corridor of the same
 * person at thirty-seven sizes. Size is a real difference and it is not the one
 * a player reads first -- a skeleton, a robed cultist and a rotting giant are
 * three silhouettes at any size, and one of them repeated is a corridor with no
 * information in it.
 *
 * Nine rather than thirty-seven, because a look is a row of the sprite atlas
 * and the atlas is decoded whole: each costs about six hundred kilobytes of
 * memory on a phone whether or not it is on screen. So they are grouped by what
 * the source's creature *is* -- bone, cult, risen, stitched, San'layn, vrykul,
 * gargoyle, nerubian, drake -- which is the same axis the names are grouped on,
 * because the raid names its creatures after what they are.
 *
 * Where the source's creature is not a person, the sprite is the nearest
 * silhouette Liberated Pixel Cup has. The set draws no spiders and no
 * quadrupeds at all, so a Nerub'ar Broodkeeper is a carapace with a tail and a
 * Spire Gargoyle is stone with bat's wings. See `ADD` in `scripts/lpc.ts`.
 */
const TRASH_LOOK: Record<string, string> = {
  'The Unburied': 'bone',
  'Barrow Legionary': 'bone',
  'Graven Sentinel': 'bone',
  'Servant of the Stair': 'ghoul',
  'Belfry Minion': 'ghoul',
  'Blistered Wretch': 'ghoul',
  'Spiteful Gnawer': 'ghoul',
  "Carapace Broodtender": 'crawler',
  'Hushed Zealot': 'cult',
  'Hushed Disciple': 'cult',
  'Hushed Attendant': 'cult',
  'Hushed Servant': 'cult',
  'Hushed High Priest': 'cult',
  'Vat Chemist': 'cult',
  'Belfry Gargoyle': 'stone',
  'Raving Stitchwork': 'hulk',
  'Soured Stitchwork': 'hulk',
  'Thawing Giant': 'hulk',
  'Sagging Colossus': 'hulk',
  Gristle: 'hulk',
  Sweetmeat: 'hulk',
  'Red Court Archmage': 'blood',
  'Red Court Bladesman': 'blood',
  'Red Court Noble': 'blood',
  'Red Court Advisor': 'blood',
  'Red Court Commander': 'blood',
  'Red Court Lieutenant': 'blood',
  'Red Court Tactician': 'blood',
  'Snowborn Huntress': 'vrykul',
  'Snowborn Shieldmaiden': 'vrykul',
  'Snowborn Warlord': 'vrykul',
  'Snowborn Frostcaller': 'vrykul',
  'Snowborn Bonecaster': 'vrykul',
  'Hoarwing Handler': 'vrykul',
  'Hoarwing Whelp': 'drake',
  Thornback: 'drake',
  Sleetjaw: 'drake',
}

/** Which sheet a body of this kind is drawn from. */
export function trashLook(kind: string): string {
  return TRASH_LOOK[kind] ?? 'thrall'
}

/** Every look the building uses, for a check that has to know them all. */
export const TRASH_LOOKS = [...new Set(Object.values(TRASH_LOOK))].sort()

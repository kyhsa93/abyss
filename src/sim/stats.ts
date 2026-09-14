/**
 * What the player is made of, and what happens when he swings.
 *
 * Every formula here is AzerothCore's, with the file and line it came from.
 * The source is not in this repository and does not need to be — what is
 * copied is arithmetic, the same way `fight.ts` copies `BaseGain` — but it was
 * not on this machine at all until it was fetched, which is why the hit table
 * did not exist and every blow in this game landed.
 *
 * The numbers the arithmetic runs on are `pipeline/player.py`'s, out of
 * `player_class_stats`, `player_race_stats`, `player_xp_for_level` and the
 * three `gt*` interpolation tables, all of them AzerothCore's own dump.
 */

/**
 * `[strength, agility, stamina, intellect, spirit, base health, base mana]`.
 *
 * `BASE_MANA` was read past for as long as this game had one class, because
 * `player_class_stats.BaseMana` is nought on every line of the warrior's — and
 * a column that is always nought is indistinguishable from a column nobody
 * reads.  It is the whole of five of the six classes.
 */
export type Stats = number[]
export const STR = 0, AGI = 1, STA = 2, INT = 3, SPI = 4, BASE_HP = 5,
  BASE_MANA = 6

/** One class's half of what `pipeline/player.py` writes. */
export type Who = {
  stats: Record<string, Stats>
  critBase: number
  critRatio: Record<string, number>
  /** `[entry, word, min damage, max damage, swing ms, armour, slot]`. */
  kit: (string | number)[][]
  /** `rage`, `mana` or `energy` — `ChrClasses.dbc`'s `DisplayPower`. */
  power: string
  /**
   * What a point of spirit is worth in mana a second, per level.  Only the
   * classes that cast have one, because the table's row for a warrior is
   * nought and shipping it would be a number that means nothing.
   */
  spirit?: Record<string, number>
}

/**
 * And the whole of it: what is the world's, and one `Who` a class.
 *
 * The split is the thing.  Where a man wakes up when he dies is a fact about
 * Elwynn; how much health he has is a fact about being a warrior — and while
 * this game had one class the two were the same eight keys in one object,
 * which reads as a game whose stats belong to the world.
 */
export type Roster = {
  start: number[]
  levels: [number, number]
  xp: Record<string, number>
  /** Which graveyards each zone sends a dead man to, `[x, y, z]` each. */
  graveyards?: Record<string, number[][]>
  /** `{zone: [[rain, snow, storm] per season]}` — `game_weather`. */
  weather?: Record<string, number[][]>
  classes: Record<string, Who>
}

/**
 * Health from stamina — `Player::GetHealthBonusFromStamina`, StatSystem.cpp:293.
 *
 * The first twenty points are worth one each and everything after is worth
 * ten, which is why a level one warrior has sixty health and not forty-two:
 * twenty base, twenty for the first twenty stamina, twenty more for the two
 * over.  `player.py` checks that sixty comes out, because sixty is a fact
 * about this game that is in no column of any table.
 */
export function healthFromStamina(stamina: number): number {
  const base = Math.min(stamina, 20)
  return base + (stamina - base) * 10
}

/** `Player::UpdateMaxHealth`, StatSystem.cpp:313. */
export const maxHealth = (s: Stats): number =>
  Math.floor(s[BASE_HP]! + healthFromStamina(s[STA]!))

/**
 * Mana from intellect — `Player::GetManaBonusFromIntellect`, StatSystem.cpp:303.
 *
 * The same shape as the stamina curve and different numbers: the first twenty
 * points are worth one each and the rest are worth **fifteen**.  A level one
 * human mage has twenty-three intellect and a hundred base, which is a hundred
 * and sixty-five — and 165 is the figure `player.py` checks, for the same
 * reason it checks the warrior's sixty.
 */
export function manaFromIntellect(intellect: number): number {
  const base = Math.min(intellect, 20)
  return base + (intellect - base) * 15
}

/** `Player::UpdateMaxPower`, StatSystem.cpp:330 — nought for a warrior. */
export const maxMana = (s: Stats): number =>
  s[BASE_MANA]! > 0
    ? Math.floor(s[BASE_MANA]! + manaFromIntellect(s[INT]!)) : 0

/**
 * What a bar of rage or energy holds.
 *
 * `Player::SetCreatePowers` sets both to a flat hundred; only mana is a curve,
 * which is why only mana has one above.
 */
export const MAX_RAGE = 100, MAX_ENERGY = 100

/**
 * Energy back per second — `Player::Regenerate`, Player.cpp:1941.
 *
 * Ten a second, flat, and the only thing that changes it at these levels is a
 * talent.  Written out because it is a rate rather than a curve and because
 * it is the one number that makes a rogue's bar feel different from a
 * warrior's: energy comes back whether you are fighting or not.
 */
export const ENERGY_PER_SECOND = 10

/**
 * Mana back per second — `Player::UpdateManaRegen`, StatSystem.cpp:950, and
 * `Player::OCTRegenMPPerSpirit`, Player.cpp:5400.
 *
 * The square root of intellect, times spirit, times the class's own ratio for
 * the level out of `gtRegenMPPerSpt`.  Then the boost the server gives
 * everybody under fifteen — `CONFIG_LOW_LEVEL_REGEN_BOOST`, Player.cpp:1917,
 * `2.066 - level * 0.066` — which is not a detail here: **every level this
 * game has is under fifteen**, so leaving it out would halve the mana of the
 * only classes that use any.
 *
 * And nought while the five-second rule is running.  With no talents there is
 * no `MOD_MANA_REGEN_INTERRUPT` aura anywhere, so the interrupted modifier the
 * core computes is exactly zero: spending mana stops it coming back, and that
 * — rather than the size of the bar — is what makes a caster's fight a
 * sequence of decisions.
 */
export function manaPerSecond(level: number, s: Stats,
  ratio: number, casting = false): number {
  if (casting) return 0
  const boost = level < 15 ? 2.066 - level * 0.066 : 1
  return Math.sqrt(s[INT]!) * s[SPI]! * ratio * boost
}

/** How long spending mana holds the regeneration off — `Unit::IsUnderLastManaUseEffect`. */
export const FIVE_SECOND_RULE = 5

/**
 * Attack power — `Player::UpdateAttackPowerAndDamage`, StatSystem.cpp:398.
 *
 * A warrior, a paladin and a death knight share the line: three a level and
 * two a point of strength, less twenty.
 */
export const attackPower = (level: number, s: Stats): number =>
  level * 3 + s[STR]! * 2 - 20

/**
 * Armour — `Player::UpdateArmor`, StatSystem.cpp:269.
 *
 * Two a point of agility, plus whatever is worn.  With nothing worn that is
 * the whole of it, which at level one is forty.
 */
export const armourOf = (s: Stats, worn = 0): number => worn + s[AGI]! * 2

/**
 * Critical chance — `Player::GetMeleeCritFromAgility`, Player.cpp:5255.
 *
 * A base per class and a ratio per level, both out of the client's own
 * interpolation tables, which AzerothCore ships as SQL: `gtChanceToMeleeCritBase`
 * is eleven rows and `gtChanceToMeleeCrit` is eleven hundred, one per class and
 * level.  At level one a warrior with twenty agility crits 8.4% of the time.
 */
export const critChance = (level: number, s: Stats, who: Who): number =>
  (who.critBase + s[AGI]! * (who.critRatio[String(level)] ?? 0)) * 100

/**
 * Dodge — `Player::GetDodgeFromAgility`, Player.cpp:5272.
 *
 * Proportional to crit per point of agility, which is why it reads off the
 * same table; the warrior's constants are the core's.  With no gear there is
 * no diminishing half, so this is the whole of it.
 */
const DODGE_BASE_WARRIOR = 0.036640
const CRIT_TO_DODGE_WARRIOR = 0.85 / 1.15
export const dodgeChance = (level: number, s: Stats, who: Who): number =>
  100 * (DODGE_BASE_WARRIOR
    + s[AGI]! * (who.critRatio[String(level)] ?? 0) * CRIT_TO_DODGE_WARRIOR)

/**
 * Parry — `Player::UpdateParryPercentage`, StatSystem.cpp:753.
 *
 * Five per cent flat for anybody holding a weapon who can parry, and a warrior
 * can.  Nothing scales it at these levels.
 */
export const PARRY_WITH_WEAPON = 5.0

/**
 * What a creature does about being hit — `Unit::GetUnit*Chance`, Unit.cpp:3795
 * onwards.  Five per cent each, and parry only if it is a humanoid: a wolf
 * does not parry, a kobold does.
 */
export const CREATURE_DODGE = 5.0, CREATURE_BLOCK = 5.0
export const CREATURE_PARRY_HUMANOID = 5.0
export const CREATURE_CRIT = 5.0
/** `Unit::GetUnitMissChance`, Unit.cpp:3842 — five, before skill. */
export const BASE_MISS = 5.0

/** Skill is five a level for everybody without a trainer's help. */
export const skillFor = (level: number): number => level * 5

/** What can come of one swing. */
export const HIT = 0, MISS = 1, DODGE = 2, PARRY = 3, BLOCK = 4,
  GLANCING = 5, CRUSHING = 6, CRIT = 7
export type Outcome = number

export const OUTCOME_WORD: Record<number, string> = {
  1: '빗나감', 2: '피함', 3: '막아냄', 4: '막음',
  5: '빗맞음', 6: '으스러짐', 7: '치명타',
}

/**
 * One swing, one roll — `Unit::RollMeleeOutcomeAgainst`, Unit.cpp:2972.
 *
 * **The whole point is that it is a single roll.**  Nought to ten thousand,
 * once, and then miss, dodge, parry, block, glancing, crushing and critical
 * are laid end to end as cumulative bands; the first band the roll falls in
 * wins.  So the outcomes take probability from each other — a target that
 * dodges more is a target you crit less — and building it as a sequence of
 * independent rolls makes every number slightly wrong in a way nothing on
 * screen would ever show.
 *
 * `skillBonus` is four hundredths of a per cent a point of weapon skill over
 * the defender's defence, which at these levels is twenty per level of
 * difference, and it is subtracted from dodge, parry and block.
 */
export function rollMelee(a: {
  level: number
  /** Attacker's chance to crit, in per cent. */
  crit: number
  /** True for the player and for anything that can parry. */
  humanoid?: boolean
}, d: {
  level: number
  dodge: number
  parry: number
  block: number
  /** True when the defender is the player, which changes the miss curve. */
  player?: boolean
}, roll: number): Outcome {
  const attackerSkill = skillFor(a.level)
  const victimSkill = skillFor(d.level)
  const skillBonus = 4 * (attackerSkill - victimSkill)

  // Miss.  `Unit::MeleeSpellMissChance`, Unit.cpp:3745: five per cent, then
  // the skill gap — gentle against a player, steep against a creature, which
  // is the rule that makes fighting something four levels up feel different
  // rather than just slower.
  const diff = victimSkill - attackerSkill
  let miss = BASE_MISS
  miss += d.player
    ? (diff > 0 ? diff * 0.04 : diff * 0.02)
    : (diff > 10 ? 1 + (diff - 10) * 0.4 : diff * 0.1)

  let sum = 0
  const band = (chance: number) => {
    if (chance <= 0) return false
    sum += chance
    return roll < sum * 100
  }
  if (band(miss)) return MISS
  if (band(d.dodge - skillBonus / 100)) return DODGE
  if (band(d.parry - skillBonus / 100)) return PARRY
  if (band(d.block - skillBonus / 100)) return BLOCK
  // Glancing: only a player, only against something above him, and it is
  // where most of the damage goes when you punch above your weight.  Up to
  // forty per cent of swings — Unit.cpp:3086.
  if (a.humanoid && d.level > a.level) {
    const tmp = Math.min(40, 10 + (victimSkill - attackerSkill))
    if (band(tmp)) return GLANCING
  }
  // Crushing: a creature four or more levels over you, when it out-skills
  // your defence by fifteen or more — two per cent a point past fifteen.
  if (!a.humanoid && a.level >= d.level + 4) {
    const lack = attackerSkill - victimSkill
    if (lack >= 15 && band(lack * 2 - 15)) return CRUSHING
  }
  if (band(a.crit)) return CRIT
  return HIT
}

/**
 * What the outcome does to the damage — `Unit::CalculateMeleeDamage`,
 * Unit.cpp:2300 onwards.
 *
 * A critical hit is double.  A glancing blow loses a tenth a level, up to
 * three levels.  A crushing blow is half again.  A block takes a flat amount
 * off, which without a shield is nothing, so it is the defender's block value.
 */
export function damageAfter(outcome: Outcome, damage: number,
  levelGap: number, blockValue = 0): number {
  switch (outcome) {
    case MISS: case DODGE: case PARRY: return 0
    case CRIT: return damage * 2
    case GLANCING: return Math.floor(damage * (1 - Math.min(3, levelGap) * 0.1))
    case CRUSHING: return damage + Math.floor(damage / 2)
    case BLOCK: return Math.max(0, damage - blockValue)
    default: return damage
  }
}

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

/** `[health, min damage, max damage, swing ms, armour, stance]`. */
export type Fight = number[]

export const HP = 0, LO = 1, HI = 2, SWING = 3, ARMOUR = 4, STANCE = 5

/**
 * Where a creature stands to the player, and why it is not a boolean.
 *
 * The server's reaction is asymmetric and `pipeline/spawn_npcs.py` asks it in
 * both directions: `ENEMY` starts the fight, `QUARRY` only finishes one, and
 * `FRIEND` never fights at all.  Read as a boolean it made the starting valley
 * unplayable — a Kobold Vermin does not charge you and neither does a Diseased
 * Young Wolf, so with one flag driving both "does it attack me" and "may I
 * attack it", 131 of Northshire's 220 inhabitants were scenery you could walk
 * through a level in front of.
 */
export const FRIEND = 0, QUARRY = 1, ENEMY = 2

/** Can be attacked: everything that is not on your side. */
export const fightable = (f: Fight | null | undefined): boolean =>
  !!f && f[STANCE]! >= QUARRY

/** Attacks first, which is a narrower thing. */
export const aggressive = (f: Fight | null | undefined): boolean =>
  !!f && f[STANCE] === ENEMY

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
 * The server's is the creature's own sight, moved by the level difference,
 * which is why a level 1 rat ignores a grown adventurer walking past.  The
 * base was a flat twenty here and it is a column —
 * `creature_template.detection_range`, eighteen for most of this forest and
 * twenty for the rest — so it is passed in.  The rest of the shape is the
 * core's: a yard a level either way, and never under five.
 */
export function noticeAt(mine: number, theirs: number, sight: number): number {
  return Math.max(5, Math.min(sight + 5, sight - (mine - theirs)))
}

/**
 * Melee reach, in yards.
 *
 * It was 3.0 with a comment saying "two bodies and an arm", which is a guess.
 * `SpellRange.dbc` states it: entry 2 is the game's own combat range and it is
 * five.  `pipeline/spells.py` reads it and `main.ts` passes it in; this is the
 * fallback for a world baked without a client.
 */
export let MELEE = 5.0
export function setMelee(yards: number) { MELEE = yards }

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
  swingSeconds: number, dealing: boolean, crit = false): number {
  const convert = 0.0091107836 * level * level + 3.225598133 * level + 4.2652911
  if (!dealing) return (damage / convert) * RAGE_TAKEN
  const fromDamage = (damage / convert) * RAGE_DEALT
  // **A whole number, and doubled on a critical.**  `weaponSpeedHitFactor` is
  // a `uint32` in `Unit::DealDamage` (Unit.cpp:1106) and comes out of
  // `Unit::GetRageWeaponSpeedHitFactor` (Unit.h:921), which is
  // `GetAttackTime()/1000 * 3.5` — so a 2.9 second weapon contributes **10**
  // and not 10.15, and a critical contributes twenty.  The doubling is the
  // half of this that a player would notice: it is why a crit is worth more
  // than its damage.
  const fromSpeed = Math.floor(swingSeconds * RAGE_PER_SECOND_OF_SWING)
    * (crit ? 2 : 1)
  return Math.min((fromDamage + fromSpeed) / 2, fromDamage * 2)
}

/**
 * The three numbers in the line above, named where the source names them.
 *
 * `Unit::RewardRage` (Unit.cpp:16071) for the first two — 7.5 when you deal
 * it and 2.5 when you take it — and `Unit::GetRageWeaponSpeedHitFactor`
 * (Unit.h:923) for the third, which is 3.5 for the main hand and 1.75 for the
 * off-hand this game has not got.  `npm run corecheck` reads all three back
 * out of the server's own files.
 */
export const RAGE_DEALT = 7.5, RAGE_TAKEN = 2.5, RAGE_PER_SECOND_OF_SWING = 3.5


/**
 * How much attention a blow buys.
 *
 * `ThreatManager::AddThreat` (ThreatManager.cpp:392): damage is threat, one
 * for one, and a spell's own row in `spell_threat` moves it — a flat amount
 * on top, a multiplier over the whole, and a share of attack power.
 *
 * With one player and no pets there is only ever one name on a creature's
 * list, so nothing *chooses* differently yet.  It is here because the list is
 * the thing taunt acts on and because "who is it hitting" should be a rule
 * before it is a question — and because without it, `spell_threat`'s hundred
 * and six rows are another table nobody reads.
 */
export function threatFrom(damage: number, mods: number[] | undefined,
  attackPower = 0): number {
  if (!mods) return damage
  const [flat, pct, apPct] = mods
  return (damage + (flat ?? 0) + (attackPower * (apPct ?? 0)) / 100)
    * (pct ?? 1)
}

/**
 * One ability, as `pipeline/spells.py` writes it.
 *
 * `does` is the client's three effect slots, each `[effect, amount, dieSides,
 * aura, period, triggers, misc]`.  The engine implements the handful of effects it can and
 * ignores the rest, which is honest: an ability whose effect nothing here
 * understands simply does not appear on the bar.
 */
export type Spell = {
  id: number
  level: number
  /**
   * What it is paid for with, and how much of it.
   *
   * This was one field called `rage`, because the only class in the game paid
   * for everything in rage — `powerType` was parsed by `spells.py` and thrown
   * away, so every cost in the file was divided by ten whether or not it was
   * stored at ten times its face value.  A rogue's forty-five energy came out
   * as four.
   *
   * `pct` is the other half and it cannot be resolved in the pipeline: in this
   * expansion a caster's cost is a **share of the caster's own base mana**, so
   * it is a fact about the cast rather than about the spell.  `costOf` below
   * puts the two together.
   */
  power: number
  cost: number
  pct?: number
  cool: number
  reach: [number, number]
  holds: number
  /** Whether a new character is created holding it, rather than taught it. */
  free?: number
  /**
   * What pressing it makes you wait before pressing anything else.
   *
   * `Spell.dbc`'s `StartRecoveryTime`, which is nought for the abilities that
   * go off your next swing — so it is a column and not the flat second and a
   * half everybody quotes.
   */
  gcd: number
  /** How long it takes to go off — `SpellCastTimes.dbc`, ms. */
  cast: number
  /** How wide each effect goes off — `SpellRadius.dbc`, yards per slot. */
  wide: number[]
  /** Which shared cooldown it belongs to, if any. */
  category?: number
  /**
   * What it buys you in attention — `spell_threat`'s `[flat, multiplier,
   * share of attack power]`.
   *
   * A heavier blow is worth five more threat than the damage it does, which
   * is the whole reason it is the thing you open with rather than an
   * expensive auto-attack.
   */
  threat?: number[]
  does: number[][]
  /**
   * Which shapeshift this is, if it is one.  17 Battle, 18 Defensive — the
   * client's own numbers, out of the `MOD_SHAPESHIFT` aura's `EffectMiscValue`.
   */
  stance?: number
  /** How deep the same thing may sit on one target.  Sunder Armor's five. */
  stack?: number
  /**
   * What a combo point adds, per effect slot — `EffectPointsPerComboPoint`.
   *
   * A float in an integer column, which is why `spells.py` unpacks it the way
   * it unpacks a radius.  Only a rogue's finishers have one, and without it
   * Eviscerate is a five-point finisher that hits for one.
   */
  combo?: number[]
}

/**
 * `POWER_*` as `Spell.dbc` spells them, and our word for each.
 *
 * `-2` is not in the core's `Powers` enum: it is the client's own spelling of
 * "this costs health", which is what Bloodrage and Life Tap are.
 */
export const P_HEALTH = -2, P_MANA = 0, P_RAGE = 1, P_ENERGY = 3
export const POWER_WORD: Record<number, string> = {
  [P_HEALTH]: 'health', [P_MANA]: 'mana', [P_RAGE]: 'rage',
  [P_ENERGY]: 'energy',
}

/**
 * What one press costs, given who is pressing it.
 *
 * `Spell::CalculatePowerCost` (Spell.cpp): the flat cost plus the percentage
 * of the caster's *base* power — which for mana is `GetCreateMana()`, the
 * class's `BaseMana` for the level, and **not** the bar's maximum.  A mage's
 * bar is base mana plus the intellect curve; charging a percentage of the bar
 * would make every spell dearer the better his hat is.
 */
export function costOf(sp: Spell, basePower: number): number {
  return sp.cost + Math.floor(((sp.pct ?? 0) * basePower) / 100)
}

/**
 * The effect numbers this engine knows what to do with.
 *
 * `E_SCHOOL_DAMAGE` is the plain one — a number of damage, here and now — and
 * it was not in the list, which is why a thunderclap could not be pressed: its
 * first effect is 2 and nothing here could run a 2.  With a radius resolved as
 * well, it is what makes the first area attack in this game work.
 */
export const E_DAMAGE = 2, E_AURA = 6

/**
 * The four that are a swing rather than a spell — `Spell::EffectWeaponDmg`,
 * SpellEffects.cpp:3617.
 *
 * The core points 17, 58 and 121 at the same function and they all do the
 * same thing: **add a fixed amount to the damage of the weapon you are
 * holding**.  31 is the multiplier in the same loop, applied after.  This was
 * `E_WEAPON_ADD = 58` alone, which is the only one of the four a warrior has;
 * 121 is Sinister Strike and Backstab, and 31 is what makes Backstab a hundred
 * and fifty per cent of the weapon rather than ten damage.
 */
export const E_WEAPON_ADD = 58, E_WEAPON_NOSCHOOL = 17,
  E_WEAPON_NORMALIZED = 121, E_WEAPON_PCT = 31
export const WEAPON_FLAT = new Set([E_WEAPON_ADD, E_WEAPON_NOSCHOOL,
  E_WEAPON_NORMALIZED])

/**
 * Power given back, and the two spellings of it.
 *
 * `E_ENERGIZE` is 30 — `Spell::EffectEnergize` — and it is Bloodrage.  What
 * was called `E_ENERGIZE` here was **3, which is `SPELL_EFFECT_DUMMY`**, and
 * it was right about exactly one spell: Charge's nine rage back is a dummy the
 * core handles in a script.  A rogue made that wrong, because Eviscerate's
 * second effect is a dummy too — read as energy it hands a rogue a hundred
 * energy for finishing.  So a dummy is only power when the spell it sits on is
 * a charge, and that is a shape in the row rather than a list of ids.
 */
export const E_ENERGIZE = 30, E_DUMMY = 3, E_CHARGE = 96
/** A heal — `Spell::EffectHeal`, SpellEffects.cpp:82. */
export const E_HEAL = 10
/** And a rogue's book-keeping — `Spell::EffectAddComboPoints`. */
export const E_COMBO = 80
/**
 * And the two that name another spell rather than doing anything themselves.
 *
 * `E_TRIGGER` is Sunder Armor's only effect — fifteen rage and one column
 * pointing at 58567 — and `E_ATTACK_ME` is Taunt's.  Neither could be run
 * while `spells.py` was reading the trigger out of `EffectMiscValue`, so both
 * abilities were a cost with nothing on the other side of it.
 */
export const E_TRIGGER = 64, E_ATTACK_ME = 114
/** And the auras. */
export const A_PERIODIC_DAMAGE = 3, A_ATTACK_POWER = 99
/**
 * And the four the other five classes are made of.
 *
 * A renew is a periodic heal, a fortitude is `MOD_STAT` with the stat in
 * `EffectMiscValue`, a devotion aura and a demon skin are `MOD_RESISTANCE`
 * with armour as resistance nought, and a power word: shield is an absorb —
 * a pool of damage that is eaten before health is.
 */
export const A_PERIODIC_HEAL = 8, A_MOD_STAT = 29, A_MOD_RESISTANCE = 22,
  A_ABSORB = 69
/**
 * Which resistance armour is, for `A_MOD_RESISTANCE`'s `EffectMiscValue`.
 *
 * A **mask** rather than an index, which is worth knowing because reading it
 * as an index makes armour resistance number one — the holy one — and every
 * frost armour in the game stops doing anything.  Bit nought is the physical
 * school, which is armour; a devotion aura, a frost armour and a demon skin
 * all state exactly 1.
 */
export const SCHOOL_PHYSICAL = 1
/** And which stat is which, for `A_MOD_STAT`'s — `Stats` in the core. */
export const STAT_OF: Record<number, number> = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4 }
/**
 * The three a stance is made of, and the one Sunder Armor is.
 *
 * A stance spell says only which form it is; the numbers live in a hidden
 * passive the core names per form (SpellAuraEffects.cpp:1382-1387), and
 * `spells.py` follows that and appends the passive's effects to the stance's
 * own.  Battle Stance is one of these, Defensive Stance is three.
 */
export const A_THREAT_PCT = 10, A_DAMAGE_PCT_DONE = 79, A_DAMAGE_PCT_TAKEN = 87
export const A_BASE_RESISTANCE_PCT = 101, A_SHAPESHIFT = 36

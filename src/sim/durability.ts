/**
 * What wears out, what it costs to mend, and what a broken thing is worth.
 *
 * Issue 83 was closed with durability left out, and the argument for leaving it
 * out was the wrong line of the core.  `Player::ResurrectPlayer` (Player.cpp:4605)
 * says characters from level one to ten are not affected by resurrection
 * *sickness* — and that is all it says.  `Unit::Kill` (Unit.cpp:14187) calls
 * `DurabilityLossAll` on a player killed by a creature with no level condition
 * anywhere near it, so a level three warrior's sword loses a tenth on every
 * death in the original and lost nothing here.
 *
 * Every number in this file is the core's or its default configuration's
 * (`worldserver.conf.dist` at the commit `~/src/acore-src` is checked out at).
 * None of it knows what a `document` is.
 */

/**
 * `DurabilityLoss.OnDeath = 10`, as a share.
 *
 * The core divides the rate by `100.0f` — a float — and hands the result to a
 * `double` parameter, so the share is 0.1 as a float32 and not 0.1.  It changes
 * no answer for any item in this world; it is written the core's way so that
 * the day it would, it does not.
 */
export const DEATH_SHARE = Math.fround(10 / 100)

/**
 * `DurabilityLossChance.Damage = 0.5` — in per cent, rolled once a blow.
 *
 * `Unit::DealDamage` rolls it twice for every blow a player is part of: once
 * for the victim if he is a player (HIT TAKEN, Unit.cpp:1266) and once for the
 * attacker if he is one (HIT DONE, Unit.cpp:1283).  Both sit in the branch
 * where the victim **survives** the blow (the `else` of `health <= damage` at
 * Unit.cpp:1232), and neither runs for a blow of nought, which returns at
 * Unit.cpp:1125 before either.
 */
export const HIT_CHANCE = 0.5

/**
 * `EQUIPMENT_SLOT_END` (Player.h:681): the roll picks one of nineteen slots
 * whether or not anything is in it.  This game draws thirteen of them, so a
 * roll that lands on the neck, a ring, a trinket or the tabard wears nothing
 * — which is what it does in the core for a player who is not wearing one.
 */
export const EQUIPMENT_SLOTS = 19

/** Our slot words, at the core's `EquipmentSlots` index (Player.h:661). */
export const EQUIPMENT_SLOT: Record<string, number> = {
  head: 0, shoulder: 2, shirt: 3, chest: 4, belt: 5, legs: 6, feet: 7,
  wrist: 8, hands: 9, back: 14, weapon: 15, offhand: 16, ranged: 17,
}

/** `Rate.RepairCost = 1`. */
export const REPAIR_RATE = 1

/**
 * `Item::IsBroken` (Item.h:257): it has durability and none of it is left.
 *
 * A broken item stays on and stops counting: `Player::_ApplyItemMods` returns
 * before applying anything for one (Player.cpp:6749), and
 * `GetWeaponForAttack` will not hand a broken weapon to a swing
 * (PlayerStorage.cpp:521) — so a broken sword is a bare hand.
 */
export const broken = (max: number, now: number): boolean => max > 0 && now === 0

/**
 * `Player::DurabilityPointsLoss` (Player.cpp:4867): take points off, never
 * below nought and never above the maximum.
 */
export const losePoints = (max: number, now: number, points: number): number =>
  Math.max(0, Math.min(max, now - points))

/**
 * `Player::DurabilityLoss` (Player.cpp:4823): a share of the **maximum**, not
 * of what is left, truncated, and never less than one point.
 *
 * An item with no durability loses nothing (Player.cpp:4830) — and the
 * floor-of-one is why a death still costs a five-point item a point.
 */
export const lossFor = (max: number, share: number): number => {
  if (!max || share === 0) return 0
  return Math.max(1, Math.trunc(max * share))
}

/**
 * One death's worth off one item.
 *
 * `DurabilityLossAll(rate, false)` (Player.cpp:4797): the `false` is
 * *equipped only*, so what is in the bag comes through a death untouched.
 */
export const afterDeath = (max: number, now: number): number =>
  losePoints(max, now, lossFor(max, DEATH_SHARE))

/**
 * Whether a blow wears something, and which slot.
 *
 * `roll_chance_f(chance)` is `chance > rand_chance()` (Random.h:57) with the
 * roll in nought to a hundred, and then `urand(0, EQUIPMENT_SLOT_END - 1)` —
 * two draws, in that order, and the second only when the first came up.
 * `draw` is the game's one stream of chance, so a fight stays reproducible.
 * Returns the core's slot index, or null for no wear.
 */
export const wearFromBlow = (draw: () => number): number | null => {
  if (!(HIT_CHANCE > draw() * 100)) return null
  return Math.min(EQUIPMENT_SLOTS - 1, Math.floor(draw() * EQUIPMENT_SLOTS))
}

/** The tables `pipeline/items.py` ships as `items.json`'s `repair`. */
export type RepairTables = {
  /** Item level -> `DurabilityCosts.dbc`'s 29 multipliers. */
  costs: Record<string, number[]>
  /** `DurabilityQuality.dbc` id -> multiplier, a float32 widened. */
  quality: Record<string, number>
  /** The creatures with `UNIT_NPC_FLAG_REPAIR`. */
  by: number[]
}

/**
 * What mending one item costs, or null when the tables cannot price it.
 *
 * `Player::DurabilityRepair` (Player.cpp:4919), line for line:
 *
 *   * the cost row is the **item level** and the column is the one
 *     `ItemSubClassToDurabilityMultiplierId` picked (the bake ships it);
 *   * the quality row is `(Quality + 1) * 2`;
 *   * `uint32(lost * multiplier * double(quality))`, then
 *     `uint32(that * discount * Rate.RepairCost)` — **two truncations**, and
 *     the discount goes on after the first, so it is not the same number as
 *     one truncation of the whole product;
 *   * and a cost of nought is one copper (`//fix for ITEM_QUALITY_ARTIFACT`).
 *
 * Nothing lost is nothing charged, because the whole block is inside
 * `if (LostDurability > 0)`.  `discount` is
 * `Player::GetReputationPriceDiscount` against the mender
 * (NPCHandler.cpp:780) — the same number a shop's prices take off.
 */
export const repairCost = (tables: RepairTables, lost: number, level: number,
  quality: number, column: number, discount: number): number | null => {
  if (lost <= 0) return 0
  const row = tables.costs[String(level)]
  const mod = tables.quality[String((quality + 1) * 2)]
  if (!row || mod === undefined) return null
  const first = Math.trunc(lost * (row[column] ?? 0) * mod)
  const cost = Math.trunc(first * Math.fround(discount) * REPAIR_RATE)
  return cost === 0 ? 1 : cost
}

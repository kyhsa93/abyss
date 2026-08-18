import type { Personality, Role } from './types'

/**
 * The eight classes.
 *
 * Rotations are shared per role; what differs is the numbers and the cast
 * times, which is enough to make each one play differently. A hunter with an
 * instant finisher keeps damaging while it repositions, a mage with a long
 * one has to choose between the cast and the puddle, and a rogue has to be in
 * melee to do anything at all.
 */
export type ClassId =
  | 'warrior'
  | 'mage'
  | 'priest'
  | 'paladin'
  | 'hunter'
  | 'rogue'
  | 'shaman'
  | 'druid'

export interface ClassAbilities {
  /** No cooldown, the thing it presses when nothing else is up. */
  filler: string
  /** Damage or healing over time. */
  overTime: string | null
  /** The expensive button: a finisher, or an emergency heal. */
  finisher: string | null
  /** Tanks only: the button that answers a telegraphed hit. */
  defensive: string | null
  /** Tanks only: the high-threat strike. */
  threat: string | null
  /** Healers only: what to press when nobody is hurt. */
  attack: string | null
}

export type ArmorType = 'plate' | 'mail' | 'leather' | 'cloth'

/**
 * Diminishing returns on armour, so stacking it never reaches immunity and
 * the gap between plate and cloth stays meaningful at every damage level.
 *
 *   reduction = armor / (armor + K)
 */
export const ARMOR_K = 9000

export function mitigation(armor: number): number {
  return armor / (armor + ARMOR_K)
}

export interface ClassDef {
  id: ClassId
  name: string
  role: Role
  /** Melee classes have to stand next to the boss to do anything. */
  melee: boolean
  hp: number
  mana: number
  moveSpeed: number
  armorType: ArmorType
  /** Flat armour rating, fed through the mitigation curve. */
  armor: number
  /**
   * Flat damage removed before mitigation, for classes carrying a shield.
   * Flat reduction is worth more against many small hits than one big one,
   * which is exactly the shape of a tank's job.
   */
  block: number
  abilities: ClassAbilities
}

const none = { overTime: null, finisher: null, defensive: null, threat: null, attack: null }

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: 'warrior',
    name: 'Warrior',
    role: 'tank',
    melee: true,
    hp: 6200,
    mana: 0,
    moveSpeed: 155,
    armorType: 'plate',
    armor: 9200,
    block: 260,
    abilities: {
      ...none,
      filler: 'cleave',
      threat: 'shield_slam',
      defensive: 'shield_wall',
    },
  },

  priest: {
    id: 'priest',
    name: 'Priest',
    role: 'healer',
    melee: false,
    hp: 2900,
    mana: 1000,
    moveSpeed: 155,
    armorType: 'cloth',
    armor: 900,
    block: 0,
    abilities: {
      ...none,
      filler: 'heal',
      overTime: 'renew',
      finisher: 'flash_heal',
      attack: 'smite',
    },
  },

  paladin: {
    id: 'paladin',
    name: 'Paladin',
    role: 'healer',
    melee: false,
    hp: 4600,
    mana: 1100,
    moveSpeed: 155,
    armorType: 'plate',
    armor: 6400,
    block: 150,
    // Bigger, slower, more expensive heals than the priest, and no HoT.
    abilities: {
      ...none,
      filler: 'holy_light',
      overTime: null,
      finisher: 'lay_on_hands',
      attack: 'holy_shock',
    },
  },

  mage: {
    id: 'mage',
    name: 'Mage',
    role: 'dps',
    melee: false,
    hp: 2900,
    mana: 0,
    moveSpeed: 165,
    armorType: 'cloth',
    armor: 900,
    block: 0,
    abilities: {
      ...none,
      filler: 'frostbolt',
      overTime: 'living_bomb',
      finisher: 'pyroblast',
    },
  },

  hunter: {
    id: 'hunter',
    name: 'Hunter',
    role: 'dps',
    melee: false,
    hp: 3600,
    mana: 0,
    moveSpeed: 170,
    armorType: 'mail',
    armor: 3300,
    block: 0,
    // Everything is instant: the hunter keeps its damage up while moving.
    abilities: {
      ...none,
      filler: 'steady_shot',
      overTime: 'serpent_sting',
      finisher: 'aimed_shot',
    },
  },

  rogue: {
    id: 'rogue',
    name: 'Rogue',
    role: 'dps',
    melee: true,
    hp: 3400,
    mana: 0,
    moveSpeed: 175,
    armorType: 'leather',
    armor: 2300,
    block: 0,
    // Highest sustained damage, paid for by having to stand in melee.
    abilities: {
      ...none,
      filler: 'sinister_strike',
      overTime: 'rupture',
      finisher: 'eviscerate',
    },
  },

  shaman: {
    id: 'shaman',
    name: 'Shaman',
    role: 'dps',
    melee: false,
    hp: 3600,
    mana: 0,
    moveSpeed: 165,
    armorType: 'mail',
    armor: 3300,
    block: 0,
    abilities: {
      ...none,
      filler: 'lightning_bolt',
      overTime: 'flame_shock',
      finisher: 'chain_lightning',
    },
  },

  druid: {
    id: 'druid',
    name: 'Druid',
    role: 'dps',
    melee: false,
    hp: 3400,
    mana: 0,
    moveSpeed: 165,
    armorType: 'leather',
    armor: 2300,
    block: 0,
    abilities: {
      ...none,
      filler: 'wrath',
      overTime: 'moonfire',
      finisher: 'starfire',
    },
  },
}

export const CLASS_ORDER: ClassId[] = [
  'warrior',
  'paladin',
  'priest',
  'druid',
  'shaman',
  'mage',
  'hunter',
  'rogue',
]

/** Five slots. The first is the one you play; the rest are AI. */
export const PARTY_SIZE = 5

export interface Slot {
  name: string
  personality: Personality
  x: number
  y: number
}

/** Names and temperaments belong to the slot, not the class you put in it. */
export const SLOTS: Slot[] = [
  { name: 'You', personality: 'steady', x: 60, y: 130 },
  { name: 'Bastion', personality: 'steady', x: 0, y: -55 },
  { name: 'Wren', personality: 'timid', x: -70, y: 150 },
  { name: 'Kestrel', personality: 'greedy', x: 120, y: 100 },
  { name: 'Vale', personality: 'steady', x: -120, y: 115 },
]

export const DEFAULT_PARTY: ClassId[] = ['mage', 'warrior', 'priest', 'hunter', 'rogue']

/** Action bar for a class, in press order. Three slots at most. */
export function abilityBar(classId: ClassId): string[] {
  const a = CLASSES[classId].abilities
  return [a.filler, a.threat, a.overTime, a.finisher, a.defensive].filter(
    (id): id is string => id !== null,
  )
}

export interface RoleCount {
  tank: number
  healer: number
  dps: number
}

export function countRoles(party: ClassId[]): RoleCount {
  const count: RoleCount = { tank: 0, healer: 0, dps: 0 }
  for (const id of party) count[CLASSES[id].role]++
  return count
}

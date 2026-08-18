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

export type RaidSize = 5 | 10 | 25
export const RAID_SIZES: RaidSize[] = [5, 10, 25]

export type DifficultyId = 'normal' | 'heroic'

export interface Difficulty {
  id: DifficultyId
  name: string
  /** Boss health multiplier. */
  health: number
  /** Everything the boss does hits this much harder. */
  damage: number
  /** Below 1 means mechanics come round faster. */
  cadence: number
  /** Heroic doubles up the ground it denies you. */
  extraPuddle: number
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  normal: { id: 'normal', name: 'Normal', health: 1, damage: 1, cadence: 1, extraPuddle: 0 },
  // Not just bigger numbers: the floor fills faster, which is what actually
  // separates a heroic pull from a normal one.
  // Four multipliers compound fast; these are deliberately mild individually.
  // An extra puddle per cast turned out to dwarf everything else, especially
  // once raid-size scaling multiplied it as well. Heroic hits harder and comes
  // round faster instead.
  // Cadence is the strongest lever by far: time spent dodging is damage not
  // dealt, which lengthens the fight, which brings more mechanics. It gets the
  // gentlest nudge of the three.
  heroic: { id: 'heroic', name: 'Heroic', health: 1.22, damage: 1.0, cadence: 1.0, extraPuddle: 0 },
}

/**
 * Boss health per raid size.
 *
 * Not linear with headcount: bigger groups lose proportionally more time to
 * mechanics and overlap their cooldowns worse, so a flat multiple would make
 * 25 the easy option.
 */
export const SIZE_HEALTH: Record<RaidSize, number> = {
  5: 1,
  10: 2.05,
  25: 5.4,
}

export function sizeHealth(count: number): number {
  if (count <= 5) return SIZE_HEALTH[5]
  if (count <= 10) return SIZE_HEALTH[10]
  return SIZE_HEALTH[25]
}

export interface Slot {
  name: string
  personality: Personality
  x: number
  y: number
}

const NAMES = [
  'Bastion', 'Wren', 'Kestrel', 'Vale', 'Orin',
  'Nara', 'Elm', 'Pike', 'Rook', 'Sable',
  'Thane', 'Iris', 'Corvid', 'Ash', 'Bram',
  'Fen', 'Gale', 'Hollow', 'Juno', 'Lark',
  'Mire', 'Ovid', 'Quill', 'Reed',
]

const PERSONALITIES: Personality[] = ['steady', 'timid', 'greedy']

/**
 * Slots for a raid of the given size.
 *
 * Names and temperaments belong to the slot rather than the class put in it,
 * so swapping a mage for a rogue does not also swap who is reckless.
 */
export function makeSlots(size: RaidSize): Slot[] {
  const slots: Slot[] = [{ name: 'You', personality: 'steady', x: 60, y: 150 }]

  for (let i = 1; i < size; i++) {
    // Fan the raid out behind the pull point rather than stacking it.
    const ring = i <= 8 ? 0 : i <= 16 ? 1 : 2
    const indexInRing = ring === 0 ? i - 1 : ring === 1 ? i - 9 : i - 17
    const perRing = ring === 0 ? 8 : 8
    const spread = Math.PI * 1.15
    const angle = Math.PI / 2 - spread / 2 + (indexInRing / Math.max(1, perRing - 1)) * spread
    const radius = 140 + ring * 62

    slots.push({
      name: NAMES[(i - 1) % NAMES.length]!,
      personality: PERSONALITIES[(i - 1) % PERSONALITIES.length]!,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    })
  }
  return slots
}

/** A balanced composition for a given size: tanks, then healers, then damage. */
export function autoParty(size: RaidSize, playerClass: ClassId): ClassId[] {
  const tanks = size === 5 ? 1 : size === 10 ? 2 : 3
  // Healer ratios follow the damage ratio; three healers in a ten-man made it
  // strictly easier than a five-man, which defeats the point of the size.
  const healers = size === 5 ? 1 : size === 10 ? 2 : 5

  const party: ClassId[] = [playerClass]
  const tankPool: ClassId[] = ['warrior']
  const healPool: ClassId[] = ['priest', 'paladin']
  const dpsPool: ClassId[] = ['rogue', 'mage', 'hunter', 'shaman', 'druid']

  const playerRole = CLASSES[playerClass].role
  let needTank = tanks - (playerRole === 'tank' ? 1 : 0)
  let needHeal = healers - (playerRole === 'healer' ? 1 : 0)

  for (let i = 1; i < size; i++) {
    if (needTank > 0) {
      party.push(tankPool[(i - 1) % tankPool.length]!)
      needTank--
    } else if (needHeal > 0) {
      party.push(healPool[(i - 1) % healPool.length]!)
      needHeal--
    } else {
      party.push(dpsPool[(i - 1) % dpsPool.length]!)
    }
  }
  return party
}

export const DEFAULT_PARTY: ClassId[] = ['mage', 'warrior', 'priest', 'hunter', 'rogue']

/** Kept for the five-man default; larger raids build theirs from autoParty. */
export const SLOTS = makeSlots(5)

/** Action bar for a class, in press order. Three slots at most. */
export function abilityBar(classId: ClassId): string[] {
  const a = CLASSES[classId].abilities
  return [a.filler, a.threat, a.overTime, a.finisher, a.defensive].filter(
    (id): id is string => id !== null,
  )
}

/**
 * A random raid that is still a raid.
 *
 * Drawing all five classes freely leaves you without a tank about half the
 * time — there is only one tanking class in eight — and a pull that cannot be
 * won is a penalty, not a surprise. So the role counts are kept and everything
 * else is rolled: which classes fill them, and where they stand.
 *
 * The generator takes its randomness as an argument. Nothing under sim/ is
 * allowed to reach for Math.random, because the fight itself must stay
 * reproducible from its seed.
 */
export function randomParty(size: RaidSize, random: () => number): ClassId[] {
  const tanks = size === 5 ? 1 : size === 10 ? 2 : 3
  const healers = size === 5 ? 1 : size === 10 ? 2 : 5

  const byRole: Record<Role, ClassId[]> = { tank: [], healer: [], dps: [] }
  for (const id of CLASS_ORDER) byRole[CLASSES[id].role].push(id)

  const roles: Role[] = []
  for (let i = 0; i < tanks; i++) roles.push('tank')
  for (let i = 0; i < healers; i++) roles.push('healer')
  while (roles.length < size) roles.push('dps')

  // Fisher-Yates, so the tank is not always in slot two.
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[roles[i], roles[j]] = [roles[j]!, roles[i]!]
  }

  return roles.map((role) => {
    const pool = byRole[role]
    return pool[Math.floor(random() * pool.length)] ?? 'mage'
  })
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

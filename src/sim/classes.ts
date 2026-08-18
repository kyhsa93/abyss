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

/**
 * A class filling a particular role.
 *
 * A protection warrior and an arms warrior are not the same character: they
 * carry different abilities and different amounts of health and armour, which
 * is the whole reason a class can tank at all. So the stats live on the spec,
 * not the class.
 */
export interface Spec {
  role: Role
  /** Melee specs have to close to the boss to use anything. */
  melee: boolean
  hp: number
  armor: number
  block: number
  mana: number
  abilities: ClassAbilities
}

export interface ClassDef {
  id: ClassId
  name: string
  armorType: ArmorType
  moveSpeed: number
  specs: Spec[]
}

const kit = (a: Partial<ClassAbilities> & { filler: string }): ClassAbilities => ({
  overTime: null,
  finisher: null,
  defensive: null,
  threat: null,
  attack: null,
  ...a,
})

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: 'warrior',
    name: 'Warrior',
    armorType: 'plate',
    moveSpeed: 155,
    specs: [
      {
        role: 'tank',
        melee: true,
        hp: 6200,
        armor: 9200,
        block: 260,
        mana: 0,
        abilities: kit({ filler: 'cleave', threat: 'shield_slam', defensive: 'shield_wall' }),
      },
      {
        role: 'dps',
        melee: true,
        hp: 4200,
        armor: 5200,
        block: 0,
        mana: 0,
        abilities: kit({ filler: 'mortal_strike', overTime: 'rend', finisher: 'execute' }),
      },
    ],
  },

  paladin: {
    id: 'paladin',
    name: 'Paladin',
    armorType: 'plate',
    moveSpeed: 155,
    specs: [
      {
        role: 'tank',
        melee: true,
        hp: 5800,
        armor: 8600,
        block: 240,
        mana: 0,
        abilities: kit({
          filler: 'consecration',
          threat: 'avengers_shield',
          defensive: 'divine_protection',
        }),
      },
      {
        role: 'healer',
        melee: false,
        hp: 3400,
        armor: 4200,
        block: 0,
        mana: 1100,
        abilities: kit({ filler: 'holy_light', finisher: 'lay_on_hands', attack: 'holy_shock' }),
      },
      {
        role: 'dps',
        melee: true,
        hp: 4000,
        armor: 5000,
        block: 0,
        mana: 0,
        abilities: kit({
          filler: 'crusader_strike',
          overTime: 'judgement',
          finisher: 'hammer_of_wrath',
        }),
      },
    ],
  },

  priest: {
    id: 'priest',
    name: 'Priest',
    armorType: 'cloth',
    moveSpeed: 155,
    specs: [
      {
        role: 'healer',
        melee: false,
        hp: 3000,
        armor: 900,
        block: 0,
        mana: 1000,
        abilities: kit({
          filler: 'heal',
          overTime: 'renew',
          finisher: 'flash_heal',
          attack: 'smite',
        }),
      },
      {
        role: 'dps',
        melee: false,
        hp: 3000,
        armor: 900,
        block: 0,
        mana: 0,
        abilities: kit({
          filler: 'mind_flay',
          overTime: 'shadow_word_pain',
          finisher: 'mind_blast',
        }),
      },
    ],
  },

  druid: {
    id: 'druid',
    name: 'Druid',
    armorType: 'leather',
    moveSpeed: 165,
    specs: [
      {
        role: 'tank',
        melee: true,
        // Bear form has no shield, and a flat block is worth a great deal
        // against a fast weapon, so it pays for that in a much larger health
        // pool: harder to spike down, more of a drain on the healers.
        hp: 9200,
        armor: 11500,
        block: 0,
        mana: 0,
        abilities: kit({ filler: 'swipe', threat: 'maul', defensive: 'frenzied_regen' }),
      },
      {
        role: 'healer',
        melee: false,
        hp: 3200,
        armor: 1800,
        block: 0,
        mana: 1050,
        abilities: kit({
          filler: 'healing_touch',
          overTime: 'rejuvenation',
          finisher: 'swiftmend',
          attack: 'starsurge',
        }),
      },
      {
        role: 'dps',
        melee: false,
        hp: 3300,
        armor: 2300,
        block: 0,
        mana: 0,
        abilities: kit({ filler: 'wrath', overTime: 'moonfire', finisher: 'starfire' }),
      },
    ],
  },

  shaman: {
    id: 'shaman',
    name: 'Shaman',
    armorType: 'mail',
    moveSpeed: 165,
    specs: [
      {
        role: 'healer',
        melee: false,
        hp: 3300,
        armor: 2600,
        block: 0,
        mana: 1050,
        abilities: kit({
          filler: 'healing_wave',
          overTime: 'riptide',
          finisher: 'chain_heal',
          attack: 'lava_burst',
        }),
      },
      {
        role: 'dps',
        melee: false,
        hp: 3200,
        armor: 3300,
        block: 0,
        mana: 0,
        abilities: kit({
          filler: 'lightning_bolt',
          overTime: 'flame_shock',
          finisher: 'chain_lightning',
        }),
      },
    ],
  },

  mage: {
    id: 'mage',
    name: 'Mage',
    armorType: 'cloth',
    moveSpeed: 165,
    specs: [
      {
        role: 'dps',
        melee: false,
        hp: 2900,
        armor: 900,
        block: 0,
        mana: 0,
        abilities: kit({ filler: 'frostbolt', overTime: 'living_bomb', finisher: 'pyroblast' }),
      },
    ],
  },

  hunter: {
    id: 'hunter',
    name: 'Hunter',
    armorType: 'mail',
    moveSpeed: 170,
    specs: [
      {
        role: 'dps',
        melee: false,
        hp: 3600,
        armor: 3300,
        block: 0,
        mana: 0,
        abilities: kit({
          filler: 'steady_shot',
          overTime: 'serpent_sting',
          finisher: 'aimed_shot',
        }),
      },
    ],
  },

  rogue: {
    id: 'rogue',
    name: 'Rogue',
    armorType: 'leather',
    moveSpeed: 175,
    specs: [
      {
        role: 'dps',
        melee: true,
        hp: 3400,
        armor: 2300,
        block: 0,
        mana: 0,
        abilities: kit({
          filler: 'sinister_strike',
          overTime: 'rupture',
          finisher: 'eviscerate',
        }),
      },
    ],
  },
}

/** One class filling one role. */
export interface Pick {
  classId: ClassId
  role: Role
}

export function specOf(pick: Pick): Spec {
  const cls = CLASSES[pick.classId]
  return cls.specs.find((s) => s.role === pick.role) ?? cls.specs[0]!
}

export function canFill(classId: ClassId, role: Role): boolean {
  return CLASSES[classId].specs.some((s) => s.role === role)
}

/** Every class/role combination, in the order the picker lists them. */
export const SPEC_OPTIONS: Pick[] = CLASS_ORDER.flatMap((classId) =>
  CLASSES[classId].specs.map((spec) => ({ classId, role: spec.role })),
)

export function specLabel(pick: Pick): string {
  const cls = CLASSES[pick.classId]
  if (cls.specs.length === 1) return cls.name
  const suffix = pick.role === 'tank' ? 'Tank' : pick.role === 'healer' ? 'Heal' : 'DPS'
  return `${cls.name} ${suffix}`
}

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
function roleTargets(size: RaidSize): { tanks: number; healers: number } {
  // Healer ratios follow the damage ratio; three healers in a ten-man made it
  // strictly easier than a five-man, which defeats the point of the size.
  return {
    tanks: size === 5 ? 1 : size === 10 ? 2 : 3,
    healers: size === 5 ? 1 : size === 10 ? 2 : 5,
  }
}

const POOLS: Record<Role, Pick[]> = {
  tank: [
    { classId: 'warrior', role: 'tank' },
    { classId: 'paladin', role: 'tank' },
    { classId: 'druid', role: 'tank' },
  ],
  healer: [
    { classId: 'priest', role: 'healer' },
    { classId: 'paladin', role: 'healer' },
    { classId: 'druid', role: 'healer' },
    { classId: 'shaman', role: 'healer' },
  ],
  dps: [
    { classId: 'rogue', role: 'dps' },
    { classId: 'mage', role: 'dps' },
    { classId: 'hunter', role: 'dps' },
    { classId: 'shaman', role: 'dps' },
    { classId: 'druid', role: 'dps' },
    { classId: 'warrior', role: 'dps' },
    { classId: 'paladin', role: 'dps' },
    { classId: 'priest', role: 'dps' },
  ],
}

export function autoParty(size: RaidSize, player: Pick): Pick[] {
  const { tanks, healers } = roleTargets(size)
  const party: Pick[] = [player]

  let needTank = tanks - (player.role === 'tank' ? 1 : 0)
  let needHeal = healers - (player.role === 'healer' ? 1 : 0)

  for (let i = 1; i < size; i++) {
    const role: Role = needTank > 0 ? 'tank' : needHeal > 0 ? 'healer' : 'dps'
    if (role === 'tank') needTank--
    if (role === 'healer') needHeal--
    const pool = POOLS[role]
    party.push(pool[(i - 1) % pool.length]!)
  }
  return party
}

export const DEFAULT_PARTY: Pick[] = [
  { classId: 'mage', role: 'dps' },
  { classId: 'warrior', role: 'tank' },
  { classId: 'priest', role: 'healer' },
  { classId: 'hunter', role: 'dps' },
  { classId: 'rogue', role: 'dps' },
]

/** Kept for the five-man default; larger raids build theirs from autoParty. */
export const SLOTS = makeSlots(5)

/** Action bar for a spec, in press order. Three slots at most. */
export function abilityBar(pick: Pick): string[] {
  const a = specOf(pick).abilities
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
export function randomParty(size: RaidSize, random: () => number): Pick[] {
  const { tanks, healers } = roleTargets(size)

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
    const pool = POOLS[role]
    return pool[Math.floor(random() * pool.length)] ?? POOLS.dps[0]!
  })
}

export interface RoleCount {
  tank: number
  healer: number
  dps: number
}

export function countRoles(party: Pick[]): RoleCount {
  const count: RoleCount = { tank: 0, healer: 0, dps: 0 }
  for (const pick of party) count[pick.role]++
  return count
}

import { MELEE_RANGE, SPELL_RANGE } from './constants'
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
  /** Tanks only: takes the boss back off whoever it wandered to. */
  taunt: string | null
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
/**
 * The weapon, swinging on its own.
 *
 * Abilities are the decisions; this is the damage that happens while you make
 * them. Only classes that carry a weapon into range have one — a caster
 * plinking with a wand is neither the fantasy nor worth the numbers it would
 * put on screen.
 */
export interface AutoAttack {
  damage: number
  /** Seconds between swings. */
  speed: number
  range: number
}

/**
 * Everyone in melee swings the same weapon; the hunter shoots instead.
 *
 * Sized against what the party actually does rather than against the ability
 * tooltips: the AI loses damage to reaction delay and to walking out of
 * puddles, a weapon loses none, so white damage lands at close to a hundred
 * percent uptime and is worth far more per point than it looks. At a swing
 * every three seconds this is about a sixth of an auto-attacker's own output
 * and a seventh of the raid's — a real reason to stand in range, and not a
 * second rotation running itself.
 */
const SWING: AutoAttack = { damage: 50, speed: 3, range: MELEE_RANGE }
const SHOT: AutoAttack = { damage: 48, speed: 3, range: SPELL_RANGE }

export interface Spec {
  role: Role
  /** Melee specs have to close to the boss to use anything. */
  melee: boolean
  /** Absent for the classes that fight entirely through their spell list. */
  auto?: AutoAttack
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
  taunt: null,
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
        auto: SWING,
        hp: 6200,
        armor: 9200,
        block: 260,
        mana: 0,
        abilities: kit({ filler: 'cleave', threat: 'shield_slam', defensive: 'shield_wall', taunt: 'taunt' }),
      },
      {
        role: 'dps',
        melee: true,
        auto: SWING,
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
        auto: SWING,
        hp: 5800,
        armor: 8600,
        block: 240,
        mana: 0,
        abilities: kit({
          filler: 'consecration',
          threat: 'avengers_shield',
          taunt: 'hand_of_reckoning',
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
        auto: SWING,
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
        auto: SWING,
        // Bear form has no shield, and a flat block is worth a great deal
        // against a fast weapon, so it pays for that in a much larger health
        // pool: harder to spike down, more of a drain on the healers.
        hp: 9200,
        armor: 11500,
        block: 0,
        mana: 0,
        abilities: kit({ filler: 'swipe', threat: 'maul', defensive: 'frenzied_regen', taunt: 'growl' }),
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
        auto: SHOT,
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
        auto: SWING,
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

/** A raid is built from parties of five: 10 is two, 25 is five. */
export const PARTY_UNIT = 5

export function partyCount(size: number): number {
  return Math.max(1, Math.ceil(size / PARTY_UNIT))
}

export function partyIndex(slot: number): number {
  return Math.floor(slot / PARTY_UNIT)
}

/**
 * Role limits for the whole raid, not per party.
 *
 * More than two tanks is wasted on a single-target encounter, and the healer
 * ceiling is what keeps a larger raid from simply out-healing everything.
 */
export const ROLE_LIMITS: Record<Role, { min: number; max: number }> = {
  tank: { min: 1, max: 2 },
  healer: { min: 1, max: 3 },
  dps: { min: 0, max: 25 },
}

/**
 * The one composition a five-man may field.
 *
 * Bigger raids have slack — a second tank or a third healer is a real choice
 * there — but at five slots there is exactly one arrangement that works, and
 * every other one is a wipe wearing a costume. So the five-man is exact
 * rather than capped.
 */
export const FIVE_MAN: RoleCount = { tank: 1, healer: 1, dps: 3 }

export function isFixedComposition(size: number): boolean {
  return size === 5
}

/**
 * Whether a hand-built raid is one we will pull with.
 *
 * The generated rosters have always honoured this, but the party screen did
 * not: it warned about a wall of tanks and then pulled with it anyway. Three
 * tanks is not a composition, it is a raid that cannot kill anything before
 * the enrage, and a raid that is mostly healers just outlasts the encounter
 * without ever beating it.
 */
export function isLegalComposition(party: Pick[]): boolean {
  const roles = countRoles(party)
  if (roles.tank > ROLE_LIMITS.tank.max || roles.healer > ROLE_LIMITS.healer.max) return false
  if (isFixedComposition(party.length)) {
    return (
      roles.tank === FIVE_MAN.tank &&
      roles.healer === FIVE_MAN.healer &&
      roles.dps === FIVE_MAN.dps
    )
  }
  return true
}

/**
 * The party screen's only way to change a slot, so the rules cannot be
 * enforced in the drawing and forgotten in the input.
 *
 * At a fixed size a tap that changes a slot's *role* is read as a trade: the
 * slot that was holding that role takes the one being given up. Refusing it
 * instead would leave the composition unchangeable — there is no legal
 * intermediate state to pass through, so the player in slot one could never
 * become the tank without rolling a random raid until it happened.
 */
export function selectInto(party: Pick[], slot: number, pick: Pick): Pick[] | null {
  const current = party[slot]
  if (!current) return null

  const swapped = party.map((p, i) => (i === slot ? { ...pick } : p))
  if (isLegalComposition(swapped)) return swapped

  if (isFixedComposition(party.length) && current.role !== pick.role) {
    const donor = party.findIndex((p, i) => i !== slot && p.role === pick.role)
    if (donor >= 0) {
      const traded = party.map((p, i) =>
        i === slot ? { ...pick } : i === donor ? { ...current } : p,
      )
      if (isLegalComposition(traded)) return traded
    }
  }
  return null
}

/**
 * Whether `slot` may be changed to `pick`.
 *
 * Answered by asking for the change, so the party screen can never draw an
 * entry as available that the tap then refuses.
 */
export function canSelect(party: Pick[], slot: number, pick: Pick): boolean {
  return selectInto(party, slot, pick) !== null
}

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
  const slots: Slot[] = []
  const parties = partyCount(size)

  for (let i = 0; i < size; i++) {
    if (i === 0) {
      slots.push({ name: 'You', personality: 'steady', x: 60, y: 150 })
      continue
    }

    // Parties stand together and are spread across the back of the arena.
    // Grouping them matters: a puddle on one party is a puddle on five
    // people, which is what makes the raid layout worth thinking about.
    const party = partyIndex(i)
    const within = i % PARTY_UNIT
    const partyAngle =
      parties === 1
        ? Math.PI / 2
        : Math.PI / 2 - 0.85 + (party / (parties - 1)) * 1.7
    const partyRadius = 165 + (party % 2) * 55

    const cx = Math.cos(partyAngle) * partyRadius
    const cy = Math.sin(partyAngle) * partyRadius
    const spread = 46
    const local = within - (PARTY_UNIT - 1) / 2

    slots.push({
      name: NAMES[(i - 1) % NAMES.length]!,
      personality: PERSONALITIES[(i - 1) % PERSONALITIES.length]!,
      x: cx + Math.cos(partyAngle + Math.PI / 2) * local * spread,
      y: cy + Math.sin(partyAngle + Math.PI / 2) * local * spread,
    })
  }
  return slots
}

/** A balanced composition for a given size: tanks, then healers, then damage. */
function roleTargets(size: RaidSize): { tanks: number; healers: number } {
  // Capped by ROLE_LIMITS: a bigger raid gets more damage, not more support.
  return {
    tanks: size === 5 ? 1 : 2,
    healers: size === 5 ? 1 : size === 10 ? 2 : 3,
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

/**
 * Action bar for a spec, in press order.
 *
 * The order is the contract: slot i is pressed with key i+1, and each
 * ability's own `key` has to agree with where it lands here. A tank fills all
 * four; everyone else leaves the tail empty.
 */
export function abilityBar(pick: Pick): string[] {
  const a = specOf(pick).abilities
  return [a.filler, a.threat, a.overTime, a.finisher, a.defensive, a.taunt].filter(
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

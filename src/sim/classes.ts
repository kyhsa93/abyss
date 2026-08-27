import { MELEE_RANGE, SHOT_MIN_RANGE, SPELL_RANGE } from './constants'
import type { Personality, ResourceId, Role } from './types'

/**
 * The nine classes.
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
  | 'warlock'
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
  /** Closing a gap the class is expected to close on its own. */
  mobility: string | null
  /**
   * The button a spec pays for its own damage with, out of its health bar.
   *
   * Its own slot rather than borrowed from the tanks' `defensive`, which is
   * the opposite thing: that one is pressed because something is about to
   * land, and this one is pressed because nothing is.
   */
  pact: string | null
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
  'warlock',
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
  /** A bow cannot be drawn on something standing on top of you. */
  minRange?: number
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
const SHOT: AutoAttack = {
  damage: 48,
  speed: 3,
  range: SPELL_RANGE,
  minRange: SHOT_MIN_RANGE,
}

/**
 * Which of a class's specs, by name.
 *
 * Names repeat across classes — two of them protect, two restore — which is
 * fine because a pick always carries the class alongside. What it can never
 * be is the role: the druid deals damage two different ways, so "druid, dps"
 * stopped being an answer.
 */
export type SpecId =
  | 'protection'
  | 'arms'
  | 'holy'
  | 'retribution'
  | 'discipline'
  | 'shadow'
  | 'guardian'
  | 'restoration'
  | 'balance'
  | 'feral'
  | 'elemental'
  | 'frost'
  | 'marksmanship'
  | 'assassination'
  | 'destruction'

/**
 * The one rule that is this spec's and nobody else's.
 *
 * Every damage spec used to be filler + dot + finisher with the numbers moved
 * ten percent, which is fifteen names for three specs. A trait is what makes a
 * rotation have an opinion: something to build, something to keep up, or
 * somewhere to stand.
 */
export type Trait =
  /** Rogue, feral: the filler banks a point, the finisher spends the bank. */
  | 'combo'
  /** Mage: casting without moving compounds; moving spends the compound. */
  | 'momentum'
  /** Balance: the finisher opens a window its filler hits harder inside. */
  | 'eclipse'
  /** Hunter: paid for the distance it keeps. */
  | 'distance'
  /** Priest, paladin: the filler is worth more on a target already marked. */
  | 'affliction'
  /** Warrior: rage past the point of spending it makes the next swing land harder. */
  | 'overflow'
  /** Shaman: the finisher, damage or healing, jumps to whatever is near. */
  | 'chain'
  /** Priest: puts the reduction on before the hit rather than the heal after. */
  | 'ward'
  /** Druid healer: a direct heal on somebody already mending bursts. */
  | 'bloom'
  /** Paladin healer: everything it does is worth more on the tank. */
  | 'anchor'
  /** Warrior tank: rage is spent being hit less rather than hitting more. */
  | 'guard'
  /** Paladin tank: a small reduction on a clock, so a healer can plan around it. */
  | 'cadence'
  /** Druid tank: gives back a slice of what it takes, over time. */
  | 'thick'
  /** Warlock: buys a window of harder fillers with its own health. */
  | 'pact'

export interface Spec {
  id: SpecId
  role: Role
  /** See `Trait`. Tanks and healers have none: their job is the trait. */
  trait?: Trait
  /**
   * What this spec spends.
   *
   * On the spec rather than the class because a bear tank runs on rage while
   * the same druid healing runs on mana: what you are playing decides it, not
   * what you picked on the roster.
   */
  resource: ResourceId
  /** Melee specs have to close to the boss to use anything. */
  melee: boolean
  /** Absent for the classes that fight entirely through their spell list. */
  auto?: AutoAttack
  hp: number
  armor: number
  block: number
  /** Size of the class's resource pool. */
  power: number
  abilities: ClassAbilities
}

export interface ClassDef {
  id: ClassId
  name: string
  armorType: ArmorType
  moveSpeed: number
  specs: Spec[]
}

/**
 * How each resource behaves.
 *
 * The three non-mana ones are the reason this is a table rather than a flag:
 * energy and focus tick back on their own and rage does not tick at all, so
 * "can I press this" is a different question for a rogue, a hunter and a
 * warrior even when the number on the bar is the same.
 */
export interface ResourceRules {
  /** Per second, on its own. */
  regen: number
  /** Earned when one of your own weapon swings lands. */
  onSwing: number
  /** Earned when something lands on you. */
  onHit: number
  /** Mana is a budget you start with; rage is earned from an empty bar. */
  startsFull: boolean
}

export const RESOURCES: Record<ResourceId, ResourceRules> = {
  // A budget for the whole fight: the healer's real constraint is the 240s
  // enrage arriving before the mana does not.
  mana: { regen: 9, onSwing: 0, onHit: 0, startsFull: true },
  // Earned, never given. Twenty a swing is a third of a filler, so a warrior
  // opens a pull with nothing and a tank being hit every couple of seconds
  // ends up with more than it can spend — which is the point of the resource.
  rage: { regen: 0, onSwing: 30, onHit: 12, startsFull: false },
  // Fast enough to cover a filler roughly every global cooldown, so the
  // question is never "can I afford anything" but "can I afford the big one".
  energy: { regen: 25, onSwing: 0, onHit: 0, startsFull: true },
  focus: { regen: 19, onSwing: 0, onHit: 0, startsFull: true },
}

const kit = (a: Partial<ClassAbilities> & { filler: string }): ClassAbilities => ({
  overTime: null,
  finisher: null,
  defensive: null,
  threat: null,
  taunt: null,
  mobility: null,
  pact: null,
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
        id: 'protection',
        role: 'tank',
        trait: 'guard',
        resource: 'rage',
        melee: true,
        auto: SWING,
        hp: 6200,
        armor: 9200,
        block: 260,
        power: 100,
        abilities: kit({
          filler: 'cleave',
          threat: 'shield_slam',
          defensive: 'shield_wall',
          taunt: 'taunt',
          mobility: 'charge',
        }),
      },
      {
        id: 'arms',
        role: 'dps',
        trait: 'overflow',
        resource: 'rage',
        melee: true,
        auto: SWING,
        hp: 4200,
        armor: 5200,
        block: 0,
        power: 100,
        abilities: kit({
          filler: 'mortal_strike',
          overTime: 'rend',
          finisher: 'execute',
          mobility: 'charge',
          defensive: 'die_by_the_sword',
        }),
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
        id: 'protection',
        role: 'tank',
        trait: 'cadence',
        resource: 'mana',
        melee: true,
        auto: SWING,
        hp: 6100,
        armor: 8600,
        block: 240,
        power: 1000,
        abilities: kit({
          filler: 'consecration',
          threat: 'avengers_shield',
          taunt: 'hand_of_reckoning',
          defensive: 'divine_protection',
          mobility: 'divine_steed',
        }),
      },
      {
        id: 'holy',
        role: 'healer',
        trait: 'anchor',
        resource: 'mana',
        melee: false,
        hp: 3400,
        armor: 4200,
        block: 0,
        power: 1100,
        abilities: kit({
          filler: 'holy_light',
          overTime: 'beacon_of_light',
          finisher: 'lay_on_hands',
          defensive: 'divine_shield',
          attack: 'holy_shock',
        }),
      },
      {
        id: 'retribution',
        role: 'dps',
        trait: 'affliction',
        resource: 'mana',
        melee: true,
        auto: SWING,
        hp: 4000,
        armor: 5000,
        block: 0,
        power: 900,
        abilities: kit({
          filler: 'crusader_strike',
          overTime: 'judgement',
          finisher: 'hammer_of_wrath',
          defensive: 'shield_of_vengeance',
          attack: 'exorcism',
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
        id: 'discipline',
        role: 'healer',
        trait: 'ward',
        resource: 'mana',
        melee: false,
        hp: 3000,
        armor: 900,
        block: 0,
        power: 1050,
        abilities: kit({
          filler: 'heal',
          overTime: 'renew',
          finisher: 'flash_heal',
          defensive: 'fade',
          attack: 'smite',
        }),
      },
      {
        id: 'shadow',
        role: 'dps',
        trait: 'affliction',
        resource: 'mana',
        melee: false,
        hp: 3000,
        armor: 900,
        block: 0,
        power: 950,
        abilities: kit({
          filler: 'mind_flay',
          overTime: 'shadow_word_pain',
          finisher: 'mind_blast',
          defensive: 'dispersion',
          attack: 'shadow_word_death',
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
        id: 'guardian',
        role: 'tank',
        trait: 'thick',
        resource: 'rage',
        melee: true,
        auto: SWING,
        // Bear form has no shield, and a flat block is worth a great deal
        // against a fast weapon, so it pays for that in a much larger health
        // pool: harder to spike down, more of a drain on the healers.
        hp: 9200,
        armor: 11500,
        block: 0,
        power: 100,
        abilities: kit({
          filler: 'swipe',
          threat: 'maul',
          defensive: 'frenzied_regen',
          taunt: 'growl',
          mobility: 'wild_charge',
        }),
      },
      {
        id: 'restoration',
        role: 'healer',
        trait: 'bloom',
        resource: 'mana',
        melee: false,
        hp: 3200,
        armor: 1800,
        block: 0,
        power: 1000,
        abilities: kit({
          filler: 'healing_touch',
          overTime: 'rejuvenation',
          finisher: 'swiftmend',
          defensive: 'barkskin',
          attack: 'starsurge',
        }),
      },
      {
        id: 'balance',
        role: 'dps',
        trait: 'eclipse',
        resource: 'mana',
        melee: false,
        hp: 3300,
        armor: 2300,
        block: 0,
        power: 950,
        abilities: kit({
          filler: 'wrath',
          overTime: 'moonfire',
          finisher: 'starfire',
          defensive: 'barkskin',
          attack: 'sunfire',
        }),
      },
      {
        // The other half of the same role. Cat form trades the spell list and
        // its range for a weapon and a rogue's economy, which is the reason
        // the resource lives on the spec rather than the class.
        id: 'feral',
        role: 'dps',
        trait: 'combo',
        resource: 'energy',
        melee: true,
        auto: SWING,
        hp: 3500,
        armor: 2400,
        block: 0,
        power: 100,
        abilities: kit({
          filler: 'shred',
          overTime: 'rake',
          finisher: 'ferocious_bite',
          mobility: 'dash',
          defensive: 'survival_instincts',
        }),
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
        id: 'restoration',
        role: 'healer',
        trait: 'chain',
        resource: 'mana',
        melee: false,
        hp: 3300,
        armor: 2600,
        block: 0,
        power: 1050,
        abilities: kit({
          filler: 'healing_wave',
          overTime: 'riptide',
          finisher: 'chain_heal',
          defensive: 'astral_shift',
          attack: 'lava_burst',
        }),
      },
      {
        id: 'elemental',
        role: 'dps',
        trait: 'chain',
        resource: 'mana',
        melee: false,
        hp: 3200,
        armor: 3300,
        block: 0,
        power: 950,
        abilities: kit({
          filler: 'lightning_bolt',
          overTime: 'flame_shock',
          finisher: 'chain_lightning',
          defensive: 'astral_shift',
          attack: 'earth_shock',
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
        id: 'frost',
        role: 'dps',
        trait: 'momentum',
        resource: 'mana',
        melee: false,
        hp: 2900,
        armor: 900,
        block: 0,
        power: 1000,
        abilities: kit({
          filler: 'frostbolt',
          overTime: 'living_bomb',
          finisher: 'pyroblast',
          defensive: 'ice_barrier',
          attack: 'ice_lance',
        }),
      },
    ],
  },

  warlock: {
    id: 'warlock',
    name: 'Warlock',
    armorType: 'cloth',
    moveSpeed: 155,
    specs: [
      {
        id: 'destruction',
        role: 'dps',
        trait: 'pact',
        resource: 'mana',
        melee: false,
        // The largest bar of the three cloth wearers, and it is not a
        // survivability statement: this is the one spec that spends the bar on
        // purpose, so a mage's would leave it two taps from being a problem
        // for somebody else. It ends most fights the softest thing in the raid
        // regardless, since the health is going out whether the boss asks for
        // it or not.
        hp: 3300,
        armor: 900,
        block: 0,
        power: 950,
        abilities: kit({
          filler: 'shadow_bolt',
          overTime: 'immolate',
          finisher: 'chaos_bolt',
          pact: 'life_tap',
          defensive: 'unending_resolve',
        }),
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
        id: 'marksmanship',
        role: 'dps',
        trait: 'distance',
        resource: 'focus',
        melee: false,
        auto: SHOT,
        hp: 3600,
        armor: 3300,
        block: 0,
        power: 100,
        abilities: kit({
          filler: 'steady_shot',
          overTime: 'serpent_sting',
          finisher: 'aimed_shot',
          defensive: 'deterrence',
          mobility: 'cheetah',
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
        id: 'assassination',
        role: 'dps',
        trait: 'combo',
        resource: 'energy',
        melee: true,
        auto: SWING,
        hp: 3400,
        armor: 2300,
        block: 0,
        power: 100,
        abilities: kit({
          filler: 'sinister_strike',
          overTime: 'rupture',
          finisher: 'eviscerate',
          mobility: 'sprint',
          defensive: 'evasion',
        }),
      },
    ],
  },
}

/** One class filling one role. */
export interface Pick {
  classId: ClassId
  spec: SpecId
}

export function specOf(pick: Pick): Spec {
  const cls = CLASSES[pick.classId]
  return cls.specs.find((s) => s.id === pick.spec) ?? cls.specs[0]!
}

/** The role a pick fills. Derived, never stored: the two cannot drift apart. */
export function roleOf(pick: Pick): Role {
  return specOf(pick).role
}

/** The pick for a class's first spec in a role, for callers that only care about the role. */
export function pickFor(classId: ClassId, role: Role): Pick | null {
  const spec = CLASSES[classId].specs.find((s) => s.role === role)
  return spec ? { classId, spec: spec.id } : null
}

export function canFill(classId: ClassId, role: Role): boolean {
  return CLASSES[classId].specs.some((s) => s.role === role)
}

/** Every spec, in the order the picker lists them. */
export const SPEC_OPTIONS: Pick[] = CLASS_ORDER.flatMap((classId) =>
  CLASSES[classId].specs.map((spec) => ({ classId, spec: spec.id })),
)

export function specLabel(pick: Pick): string {
  const cls = CLASSES[pick.classId]
  if (cls.specs.length === 1) return cls.name
  const spec = specOf(pick)
  // Role is what the label is for, until a class fills the same role twice —
  // then "Druid DPS" names two different characters and the spec has to.
  const sameRole = cls.specs.filter((other) => other.role === spec.role)
  if (sameRole.length > 1) {
    return `${cls.name} ${spec.id[0]!.toUpperCase()}${spec.id.slice(1)}`
  }
  const suffix = spec.role === 'tank' ? 'Tank' : spec.role === 'healer' ? 'Heal' : 'DPS'
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
 *
 * The ceiling was three, which the twenty-five man then read as its target
 * rather than as its limit — one healer per eight bodies where the smaller
 * sizes run one per five. Four is what `roleTargets` now asks for there, so
 * the ceiling has to be at least that or a legal raid would be an illegal
 * composition. Still a ceiling: five is where overhealing leaves the 1-6%
 * the other sizes sit at and the role stops having to choose.
 */
export const ROLE_LIMITS: Record<Role, { min: number; max: number }> = {
  tank: { min: 1, max: 2 },
  healer: { min: 1, max: 4 },
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
 * How many healers a raid of this size fields. Exactly, not at most.
 *
 * One per five bodies at every size, which is the ratio five and ten already
 * ran and the one twenty-five was missing — it had three for twenty-five, and
 * that was not a harder fight but a different one: healing covered 30% of
 * what the raid took against 49% at the smaller sizes, and the first death
 * landed at 37% of the fight instead of 71-89%.
 *
 * Exact rather than capped, the way the five-man already was. A ceiling reads
 * as a target the moment anyone works out that more is safer, and then the
 * choice it was meant to open is only the choice to bring the same thing
 * everybody else brings. Measured: a ten-man at a ceiling of three covers 62%
 * against the standard two's 50%, and four covers 75% with a fifth of the
 * healing landing on nobody. None of that is a decision worth offering.
 *
 * `ROLE_LIMITS.healer.max` stays as the ceiling over all sizes, for anything
 * that needs one number rather than a curve.
 */
export function healerCount(size: number): number {
  if (isFixedComposition(size)) return FIVE_MAN.healer
  return size <= 10 ? 2 : 4
}

/**
 * What this size fixes exactly, as opposed to caps. Null means capped.
 *
 * The five-man fixes everything — at five slots there is one arrangement that
 * works. Bigger raids fix the healers and leave the tank a real choice between
 * one and two.
 */
export function fixedCount(role: Role, size: number): number | null {
  if (isFixedComposition(size)) return FIVE_MAN[role]
  return role === 'healer' ? healerCount(size) : null
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
  if (roles.tank > ROLE_LIMITS.tank.max) return false
  for (const role of ['tank', 'healer', 'dps'] as Role[]) {
    const exact = fixedCount(role, party.length)
    if (exact !== null && roles[role] !== exact) return false
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

  // A tap that changes a slot's role is read as a trade wherever the size
  // fixes that role's count — five, where everything is fixed, and the healer
  // slots at ten and twenty-five. Refusing instead would leave the role
  // unmovable: there is no legal intermediate state to pass through, so the
  // player could never decide which of the ten is the one healing.
  const fixesRole =
    fixedCount(roleOf(current), party.length) !== null ||
    fixedCount(roleOf(pick), party.length) !== null
  if (fixesRole && roleOf(current) !== roleOf(pick)) {
    const donor = party.findIndex((p, i) => i !== slot && roleOf(p) === roleOf(pick))
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
  // No health bonus. It was 1.12 from before the ladders existed, when heroic
  // was twenty-two percent more health and nothing else -- and the note that
  // introduced the rungs says as much, that a rung costs a raid something a
  // health bar never can. The bonus stayed anyway, so heroic was buying a rung
  // *and* a longer fight, and the two compounded: measured across the five
  // bosses at ten and twenty-five, every heroic ceiling was between three and
  // fifty-seven percent with it and between ten and ninety without. Heroic
  // buys one more mechanic. That is the whole of it.
  heroic: { id: 'heroic', name: 'Heroic', health: 1.0, damage: 1.0, cadence: 1.0, extraPuddle: 0 },
}

/**
 * Boss health per raid size.
 *
 * Not linear with headcount: bigger groups lose proportionally more time to
 * mechanics and overlap their cooldowns worse, so a flat multiple would make
 * 25 the easy option. 5.7 was not enough of a bend and 25 was the easy option
 * anyway — measured, the step from a ten-man heroic to a twenty-five normal
 * gave back thirty points of win rate, which is more than any rung above it
 * takes away.
 *
 * That step is the reason this number moved. `kitCount` runs 2, 3, 3, 4, 4, 5
 * across the six rungs, so two of them add no mechanic at all and change only
 * the headcount — and the headcount, on its own, is help. The ladder was a
 * sawtooth: every heroic rung cost 13 to 30 points and every size rung handed
 * 17 to 30 straight back.
 */
export const SIZE_HEALTH: Record<RaidSize, number> = {
  5: 1,
  10: 2.2,
  25: 6.7,
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
  // A bigger raid gets more damage than support, but not none: five and ten
  // both run one healer per five bodies, and twenty-five ran one per eight.
  //
  // That was not a harder fight, it was a different one. Healing covered 49%
  // of what the raid took at five and ten and 30% at twenty-five, the first
  // death landed at 37% of the fight instead of 71-89%, and from there each
  // loss left fewer healers holding the same mechanics — seventeen of the
  // twenty-five died on normal and the healers themselves died 68% of the
  // time. A fourth brings coverage to 41% and the first death back to where
  // the other sizes have it.
  //
  // Four rather than five, which would put it at 47% and level with the rest:
  // overhealing is the tell, and it runs 1-6% wherever a healer is working at
  // the edge of what it can cover. Three healers waste 7%, four waste 10%,
  // five waste 14% — five is where the role stops having to choose. The
  // biggest raid is allowed to be the tightest one.
  return {
    tanks: size === 5 ? 1 : 2,
    healers: size === 5 ? 1 : size === 10 ? 2 : 4,
  }
}

/**
 * What AUTO and RANDOM draw from, listed by spec.
 *
 * Named one by one rather than derived from the class list, so a new spec is
 * something a generated roster fields on purpose. Deriving it by role would
 * have quietly picked whichever spec happened to be written first and left
 * the other one reachable only by hand.
 */
const POOLS: Record<Role, Pick[]> = {
  tank: [
    { classId: 'warrior', spec: 'protection' },
    { classId: 'paladin', spec: 'protection' },
    { classId: 'druid', spec: 'guardian' },
  ],
  healer: [
    { classId: 'priest', spec: 'discipline' },
    { classId: 'paladin', spec: 'holy' },
    { classId: 'druid', spec: 'restoration' },
    { classId: 'shaman', spec: 'restoration' },
  ],
  dps: [
    { classId: 'rogue', spec: 'assassination' },
    { classId: 'mage', spec: 'frost' },
    { classId: 'hunter', spec: 'marksmanship' },
    { classId: 'shaman', spec: 'elemental' },
    { classId: 'druid', spec: 'balance' },
    { classId: 'druid', spec: 'feral' },
    { classId: 'warrior', spec: 'arms' },
    { classId: 'paladin', spec: 'retribution' },
    { classId: 'priest', spec: 'shadow' },
    { classId: 'warlock', spec: 'destruction' },
  ],
}

export function autoParty(size: RaidSize, player: Pick): Pick[] {
  const { tanks, healers } = roleTargets(size)
  const party: Pick[] = [player]

  let needTank = tanks - (roleOf(player) === 'tank' ? 1 : 0)
  let needHeal = healers - (roleOf(player) === 'healer' ? 1 : 0)

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
  pickFor('mage', 'dps')!,
  pickFor('warrior', 'tank')!,
  pickFor('priest', 'healer')!,
  pickFor('hunter', 'dps')!,
  pickFor('rogue', 'dps')!,
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
  // Five slots, and the fifth is always the one that answers the floor. Every
  // spec fills the first four with what it is -- what it presses, what it
  // keeps up, what it saves for, and the one thing that is only its own -- and
  // the last with what it does when none of that is the question any more.
  // A player who changes class keeps one finger where it was.
  return [
    a.filler,
    a.threat,
    a.overTime,
    a.finisher,
    a.pact,
    a.attack,
    a.taunt,
    a.mobility,
    a.defensive,
  ].filter((id): id is string => id !== null)
}

/**
 * A random raid that is still a raid.
 *
 * Drawing freely from the spec list leaves you without a tank most of the
 * time — three of the seventeen tank, and a five-man that rolls none of them
 * is a pull that cannot be won rather than a surprise. So the role counts are
 * kept and everything else is rolled: which classes fill them, and where they
 * stand.
 *
 * The generator takes its randomness as an argument. Nothing under sim/ is
 * allowed to reach for Math.random, because the fight itself must stay
 * reproducible from its seed.
 */
/**
 * A random raid built around one fixed pick.
 *
 * The player chooses what they are playing and nothing else; everyone else is
 * rolled. Their role comes out of the raid's target counts first, so a raid
 * that already needs one tank does not end up with two because the player
 * wanted to be it.
 */
export function randomAround(size: RaidSize, player: Pick, random: () => number): Pick[] {
  const { tanks, healers } = roleTargets(size)

  const roles: Role[] = []
  for (let i = 0; i < tanks; i++) roles.push('tank')
  for (let i = 0; i < healers; i++) roles.push('healer')
  while (roles.length < size) roles.push('dps')

  // The player takes one of the slots the raid was going to need anyway.
  // Damage is always available, since it is whatever the counts did not use.
  const taken = roles.indexOf(roleOf(player))
  roles.splice(taken >= 0 ? taken : roles.indexOf('dps'), 1)

  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[roles[i], roles[j]] = [roles[j]!, roles[i]!]
  }

  return [
    { ...player },
    ...roles.map((role) => {
      const pool = POOLS[role]
      return pool[Math.floor(random() * pool.length)] ?? POOLS.dps[0]!
    }),
  ]
}

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
  for (const pick of party) count[roleOf(pick)]++
  return count
}

import { SPELL_RANGE } from './constants'
import type { AuraId, Role } from './types'

export type AbilityKind = 'damage' | 'heal' | 'defensive' | 'taunt' | 'charge'

export interface Ability {
  id: string
  name: string
  role: Role
  kind: AbilityKind
  /** 0 means instant. */
  castTime: number
  cooldown: number
  /**
   * Paid out of whatever the class runs on.
   *
   * Free is a deliberate answer rather than a default: defensives and taunts
   * are the reply to a mechanic, and a reply that is sometimes unaffordable
   * for reasons the button cannot show is worse than no resource at all.
   */
  cost: number
  /** Direct damage or heal, before modifiers. */
  amount: number
  /**
   * Threat multiplier applied on top of the damage dealt.
   *
   * Taunts ignore this: they do not scale off a number they never deal.
   */
  threatMult: number
  /** Aura applied to the target on a successful cast. */
  aura: AuraId | null
  /** Maximum distance to the target. */
  range: number
  /**
   * Minimum distance, for the one ability that exists to cross a gap. Being
   * already there is not a reason to spend a cooldown.
   */
  minRange?: number
  /**
   * Off the global cooldown, like a defensive in the game this apes: it can
   * be pressed mid-rotation without losing the press you already made.
   */
  offGcd?: boolean
}

const MELEE = 52
const SPELL = SPELL_RANGE
const HEAL_RANGE = 390

/**
 * As far as a warrior will run at something.
 *
 * Short of a spell's range: this is a sprint, not a leap across the arena.
 */
const CHARGE_RANGE = 260

/**
 * Taunts reach further than a swing.
 *
 * A taunt that only worked in melee would be useless for the case it exists
 * for: the boss has already walked off to eat somebody else, and the tank is
 * the one thing that is not next to it.
 */
const TAUNT_RANGE = 260

/**
 * Long enough that losing the boss twice in a row is a real failure rather
 * than a button press, short enough to answer one bad pull.
 */
const TAUNT_COOLDOWN = 10

const list: Ability[] = [
  // --- warrior (tank) -------------------------------------------------------
  { id: 'cleave', name: 'Cleave', role: 'tank', kind: 'damage', castTime: 0, cooldown: 0, cost: 15, amount: 60, threatMult: 4, aura: null, range: MELEE },
  { id: 'shield_slam', name: 'Shield Slam', role: 'tank', kind: 'damage', castTime: 0, cooldown: 6, cost: 20, amount: 110, threatMult: 6, aura: null, range: MELEE },
  { id: 'shield_wall', name: 'Shield Wall', role: 'tank', kind: 'defensive', castTime: 0, cooldown: 40, cost: 0, amount: 0, threatMult: 0, aura: 'shield', range: 0, offGcd: true },
  { id: 'taunt', name: 'Taunt', role: 'tank', kind: 'taunt', castTime: 0, cooldown: TAUNT_COOLDOWN, cost: 0, amount: 0, threatMult: 0, aura: null, range: TAUNT_RANGE },

  // --- priest (healer): sustained, leans on its heal-over-time -------------
  { id: 'heal', name: 'Heal', role: 'healer', kind: 'heal', castTime: 2, cooldown: 0, cost: 26, amount: 430, threatMult: 0, aura: null, range: HEAL_RANGE },
  { id: 'renew', name: 'Renew', role: 'healer', kind: 'heal', castTime: 0, cooldown: 10, cost: 18, amount: 0, threatMult: 0, aura: 'renew', range: HEAL_RANGE },
  { id: 'flash_heal', name: 'Flash Heal', role: 'healer', kind: 'heal', castTime: 0, cooldown: 7, cost: 40, amount: 280, threatMult: 0, aura: null, range: HEAL_RANGE },

  // --- paladin (healer): slower, bigger, with a panic button ---------------
  { id: 'holy_light', name: 'Holy Light', role: 'healer', kind: 'heal', castTime: 2.5, cooldown: 0, cost: 32, amount: 620, threatMult: 0, aura: null, range: HEAL_RANGE },
  { id: 'lay_on_hands', name: 'Lay on Hands', role: 'healer', kind: 'heal', castTime: 0, cooldown: 45, cost: 90, amount: 1500, threatMult: 0, aura: null, range: HEAL_RANGE },

  // Healers contribute damage when nobody needs them, which is the only thing
  // that makes a two-healer party viable rather than a slow loss.
  { id: 'smite', name: 'Smite', role: 'healer', kind: 'damage', castTime: 0, cooldown: 0, cost: 14, amount: 78, threatMult: 1, aura: null, range: SPELL },
  { id: 'holy_shock', name: 'Holy Shock', role: 'healer', kind: 'damage', castTime: 0, cooldown: 6, cost: 20, amount: 210, threatMult: 1, aura: null, range: SPELL },

  // --- mage: burst, and a long cast that fights the movement ---------------
  { id: 'frostbolt', name: 'Frostbolt', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, cost: 20, amount: 95, threatMult: 1, aura: null, range: SPELL },
  { id: 'living_bomb', name: 'Living Bomb', role: 'dps', kind: 'damage', castTime: 0, cooldown: 14, cost: 25, amount: 40, threatMult: 1, aura: 'living_bomb', range: SPELL },
  { id: 'pyroblast', name: 'Pyroblast', role: 'dps', kind: 'damage', castTime: 2.5, cooldown: 20, cost: 60, amount: 700, threatMult: 1, aura: null, range: SPELL },

  // --- hunter: everything instant, so it never stops damaging --------------
  { id: 'steady_shot', name: 'Steady Shot', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, cost: 30, amount: 88, threatMult: 1, aura: null, range: SPELL },
  { id: 'serpent_sting', name: 'Serpent Sting', role: 'dps', kind: 'damage', castTime: 0, cooldown: 16, cost: 20, amount: 30, threatMult: 1, aura: 'serpent_sting', range: SPELL },
  { id: 'aimed_shot', name: 'Aimed Shot', role: 'dps', kind: 'damage', castTime: 0, cooldown: 12, cost: 35, amount: 380, threatMult: 1, aura: null, range: SPELL },

  // --- rogue: highest sustained damage, paid for in melee range ------------
  { id: 'sinister_strike', name: 'Sinister Strike', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, cost: 40, amount: 115, threatMult: 1, aura: null, range: MELEE },
  { id: 'rupture', name: 'Rupture', role: 'dps', kind: 'damage', castTime: 0, cooldown: 14, cost: 25, amount: 40, threatMult: 1, aura: 'rupture', range: MELEE },
  { id: 'eviscerate', name: 'Eviscerate', role: 'dps', kind: 'damage', castTime: 0, cooldown: 15, cost: 35, amount: 420, threatMult: 1, aura: null, range: MELEE },

  // --- warrior, as damage: bleeds and an execute -----------------------------
  { id: 'charge', name: 'Charge', role: 'dps', kind: 'charge', castTime: 0, cooldown: 15, cost: 0, amount: 0, threatMult: 0, aura: null, range: CHARGE_RANGE, minRange: MELEE + 40 },
  { id: 'mortal_strike', name: 'Mortal Strike', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, cost: 20, amount: 112, threatMult: 1, aura: null, range: MELEE },
  { id: 'rend', name: 'Rend', role: 'dps', kind: 'damage', castTime: 0, cooldown: 14, cost: 10, amount: 35, threatMult: 1, aura: 'rend', range: MELEE },
  { id: 'execute', name: 'Execute', role: 'dps', kind: 'damage', castTime: 0, cooldown: 14, cost: 25, amount: 400, threatMult: 1, aura: null, range: MELEE },

  // --- paladin, as tank ------------------------------------------------------
  { id: 'avengers_shield', name: "Avenger's Shield", role: 'tank', kind: 'damage', castTime: 0, cooldown: 6, cost: 28, amount: 105, threatMult: 6, aura: null, range: 200 },
  { id: 'consecration', name: 'Consecration', role: 'tank', kind: 'damage', castTime: 0, cooldown: 0, cost: 22, amount: 58, threatMult: 4, aura: null, range: MELEE },
  { id: 'divine_protection', name: 'Divine Protection', role: 'tank', kind: 'defensive', castTime: 0, cooldown: 40, cost: 0, amount: 0, threatMult: 0, aura: 'shield', range: 0, offGcd: true },
  { id: 'hand_of_reckoning', name: 'Hand of Reckoning', role: 'tank', kind: 'taunt', castTime: 0, cooldown: TAUNT_COOLDOWN, cost: 0, amount: 0, threatMult: 0, aura: null, range: TAUNT_RANGE },

  // --- paladin, as damage ----------------------------------------------------
  { id: 'crusader_strike', name: 'Crusader Strike', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, cost: 18, amount: 104, threatMult: 1, aura: null, range: MELEE },
  { id: 'judgement', name: 'Judgement', role: 'dps', kind: 'damage', castTime: 0, cooldown: 13, cost: 22, amount: 38, threatMult: 1, aura: 'judgement', range: 200 },
  { id: 'hammer_of_wrath', name: 'Hammer of Wrath', role: 'dps', kind: 'damage', castTime: 0, cooldown: 13, cost: 45, amount: 395, threatMult: 1, aura: null, range: 200 },

  // --- druid, as tank --------------------------------------------------------
  { id: 'maul', name: 'Maul', role: 'tank', kind: 'damage', castTime: 0, cooldown: 6, cost: 22, amount: 118, threatMult: 6, aura: null, range: MELEE },
  { id: 'swipe', name: 'Swipe', role: 'tank', kind: 'damage', castTime: 0, cooldown: 0, cost: 16, amount: 62, threatMult: 4, aura: null, range: MELEE },
  { id: 'frenzied_regen', name: 'Frenzied Regen', role: 'tank', kind: 'defensive', castTime: 0, cooldown: 40, cost: 0, amount: 0, threatMult: 0, aura: 'shield', range: 0, offGcd: true },
  { id: 'growl', name: 'Growl', role: 'tank', kind: 'taunt', castTime: 0, cooldown: TAUNT_COOLDOWN, cost: 0, amount: 0, threatMult: 0, aura: null, range: TAUNT_RANGE },

  // --- druid, as healer: heal-over-time first ---------------------------------
  { id: 'healing_touch', name: 'Healing Touch', role: 'healer', kind: 'heal', castTime: 2.2, cooldown: 0, cost: 28, amount: 470, threatMult: 0, aura: null, range: HEAL_RANGE },
  { id: 'rejuvenation', name: 'Rejuvenation', role: 'healer', kind: 'heal', castTime: 0, cooldown: 9, cost: 20, amount: 0, threatMult: 0, aura: 'rejuvenation', range: HEAL_RANGE },
  { id: 'swiftmend', name: 'Swiftmend', role: 'healer', kind: 'heal', castTime: 0, cooldown: 8, cost: 38, amount: 300, threatMult: 0, aura: null, range: HEAL_RANGE },
  { id: 'starsurge', name: 'Starsurge', role: 'healer', kind: 'damage', castTime: 0, cooldown: 8, cost: 22, amount: 195, threatMult: 1, aura: null, range: SPELL },

  // --- priest, as damage -----------------------------------------------------
  { id: 'mind_blast', name: 'Mind Blast', role: 'dps', kind: 'damage', castTime: 0, cooldown: 8, cost: 45, amount: 330, threatMult: 1, aura: null, range: SPELL },
  { id: 'shadow_word_pain', name: 'Shadow Word: Pain', role: 'dps', kind: 'damage', castTime: 0, cooldown: 15, cost: 22, amount: 36, threatMult: 1, aura: 'shadow_word_pain', range: SPELL },
  { id: 'mind_flay', name: 'Mind Flay', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, cost: 18, amount: 94, threatMult: 1, aura: null, range: SPELL },

  // --- shaman, as healer -----------------------------------------------------
  { id: 'healing_wave', name: 'Healing Wave', role: 'healer', kind: 'heal', castTime: 2.1, cooldown: 0, cost: 27, amount: 450, threatMult: 0, aura: null, range: HEAL_RANGE },
  { id: 'riptide', name: 'Riptide', role: 'healer', kind: 'heal', castTime: 0, cooldown: 9, cost: 21, amount: 0, threatMult: 0, aura: 'riptide', range: HEAL_RANGE },
  { id: 'chain_heal', name: 'Chain Heal', role: 'healer', kind: 'heal', castTime: 0, cooldown: 8, cost: 42, amount: 320, threatMult: 0, aura: null, range: HEAL_RANGE },
  { id: 'lava_burst', name: 'Lava Burst', role: 'healer', kind: 'damage', castTime: 0, cooldown: 7, cost: 24, amount: 215, threatMult: 1, aura: null, range: SPELL },

  // --- shaman --------------------------------------------------------------
  { id: 'lightning_bolt', name: 'Lightning Bolt', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, cost: 20, amount: 92, threatMult: 1, aura: null, range: SPELL },
  { id: 'flame_shock', name: 'Flame Shock', role: 'dps', kind: 'damage', castTime: 0, cooldown: 13, cost: 24, amount: 45, threatMult: 1, aura: 'flame_shock', range: SPELL },
  { id: 'chain_lightning', name: 'Chain Lightning', role: 'dps', kind: 'damage', castTime: 1.5, cooldown: 14, cost: 55, amount: 470, threatMult: 1, aura: null, range: SPELL },

  // --- druid ---------------------------------------------------------------
  { id: 'wrath', name: 'Wrath', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, cost: 20, amount: 90, threatMult: 1, aura: null, range: SPELL },
  { id: 'moonfire', name: 'Moonfire', role: 'dps', kind: 'damage', castTime: 0, cooldown: 15, cost: 24, amount: 42, threatMult: 1, aura: 'moonfire', range: SPELL },
  { id: 'shred', name: 'Shred', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, cost: 35, amount: 106, threatMult: 1, aura: null, range: MELEE },
  { id: 'rake', name: 'Rake', role: 'dps', kind: 'damage', castTime: 0, cooldown: 14, cost: 26, amount: 38, threatMult: 1, aura: 'rake', range: MELEE },
  { id: 'ferocious_bite', name: 'Ferocious Bite', role: 'dps', kind: 'damage', castTime: 0, cooldown: 15, cost: 38, amount: 405, threatMult: 1, aura: null, range: MELEE },
  { id: 'starfire', name: 'Starfire', role: 'dps', kind: 'damage', castTime: 2, cooldown: 18, cost: 55, amount: 560, threatMult: 1, aura: null, range: SPELL },
]

export const ABILITIES: Record<string, Ability> = Object.fromEntries(
  list.map((a) => [a.id, a]),
)

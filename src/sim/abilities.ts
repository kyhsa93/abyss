import type { AuraId, Role } from './types'

export type AbilityKind = 'damage' | 'heal' | 'defensive'

export interface Ability {
  id: string
  name: string
  /** Key shown in the action bar; only meaningful for the player. */
  key: string
  role: Role
  kind: AbilityKind
  /** 0 means instant. */
  castTime: number
  cooldown: number
  manaCost: number
  /** Direct damage or heal, before modifiers. */
  amount: number
  /** Threat multiplier applied on top of the damage dealt. */
  threatMult: number
  /** Aura applied to the target on a successful cast. */
  aura: AuraId | null
  /** Maximum distance to the target. */
  range: number
}

const MELEE = 46
const SPELL = 260
const HEAL_RANGE = 300

const list: Ability[] = [
  // --- warrior (tank) -------------------------------------------------------
  { id: 'cleave', name: 'Cleave', key: '1', role: 'tank', kind: 'damage', castTime: 0, cooldown: 0, manaCost: 0, amount: 60, threatMult: 4, aura: null, range: MELEE },
  { id: 'shield_slam', name: 'Shield Slam', key: '2', role: 'tank', kind: 'damage', castTime: 0, cooldown: 6, manaCost: 0, amount: 110, threatMult: 6, aura: null, range: MELEE },
  { id: 'shield_wall', name: 'Shield Wall', key: '3', role: 'tank', kind: 'defensive', castTime: 0, cooldown: 40, manaCost: 0, amount: 0, threatMult: 0, aura: 'shield', range: 0 },

  // --- priest (healer): sustained, leans on its heal-over-time -------------
  { id: 'heal', name: 'Heal', key: '1', role: 'healer', kind: 'heal', castTime: 2, cooldown: 0, manaCost: 26, amount: 430, threatMult: 0, aura: null, range: HEAL_RANGE },
  { id: 'renew', name: 'Renew', key: '2', role: 'healer', kind: 'heal', castTime: 0, cooldown: 10, manaCost: 18, amount: 0, threatMult: 0, aura: 'renew', range: HEAL_RANGE },
  { id: 'flash_heal', name: 'Flash Heal', key: '3', role: 'healer', kind: 'heal', castTime: 0, cooldown: 7, manaCost: 40, amount: 280, threatMult: 0, aura: null, range: HEAL_RANGE },

  // --- paladin (healer): slower, bigger, with a panic button ---------------
  { id: 'holy_light', name: 'Holy Light', key: '1', role: 'healer', kind: 'heal', castTime: 2.5, cooldown: 0, manaCost: 32, amount: 620, threatMult: 0, aura: null, range: HEAL_RANGE },
  { id: 'lay_on_hands', name: 'Lay on Hands', key: '3', role: 'healer', kind: 'heal', castTime: 0, cooldown: 45, manaCost: 90, amount: 1500, threatMult: 0, aura: null, range: HEAL_RANGE },

  // Healers contribute damage when nobody needs them, which is the only thing
  // that makes a two-healer party viable rather than a slow loss.
  { id: 'smite', name: 'Smite', key: '4', role: 'healer', kind: 'damage', castTime: 0, cooldown: 0, manaCost: 14, amount: 78, threatMult: 1, aura: null, range: SPELL },
  { id: 'holy_shock', name: 'Holy Shock', key: '4', role: 'healer', kind: 'damage', castTime: 0, cooldown: 6, manaCost: 20, amount: 210, threatMult: 1, aura: null, range: SPELL },

  // --- mage: burst, and a long cast that fights the movement ---------------
  { id: 'frostbolt', name: 'Frostbolt', key: '1', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, manaCost: 0, amount: 95, threatMult: 1, aura: null, range: SPELL },
  { id: 'living_bomb', name: 'Living Bomb', key: '2', role: 'dps', kind: 'damage', castTime: 0, cooldown: 14, manaCost: 0, amount: 40, threatMult: 1, aura: 'living_bomb', range: SPELL },
  { id: 'pyroblast', name: 'Pyroblast', key: '3', role: 'dps', kind: 'damage', castTime: 2.5, cooldown: 20, manaCost: 0, amount: 700, threatMult: 1, aura: null, range: SPELL },

  // --- hunter: everything instant, so it never stops damaging --------------
  { id: 'steady_shot', name: 'Steady Shot', key: '1', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, manaCost: 0, amount: 88, threatMult: 1, aura: null, range: SPELL },
  { id: 'serpent_sting', name: 'Serpent Sting', key: '2', role: 'dps', kind: 'damage', castTime: 0, cooldown: 16, manaCost: 0, amount: 30, threatMult: 1, aura: 'serpent_sting', range: SPELL },
  { id: 'aimed_shot', name: 'Aimed Shot', key: '3', role: 'dps', kind: 'damage', castTime: 0, cooldown: 12, manaCost: 0, amount: 380, threatMult: 1, aura: null, range: SPELL },

  // --- rogue: highest sustained damage, paid for in melee range ------------
  { id: 'sinister_strike', name: 'Sinister Strike', key: '1', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, manaCost: 0, amount: 115, threatMult: 1, aura: null, range: MELEE },
  { id: 'rupture', name: 'Rupture', key: '2', role: 'dps', kind: 'damage', castTime: 0, cooldown: 14, manaCost: 0, amount: 40, threatMult: 1, aura: 'rupture', range: MELEE },
  { id: 'eviscerate', name: 'Eviscerate', key: '3', role: 'dps', kind: 'damage', castTime: 0, cooldown: 15, manaCost: 0, amount: 420, threatMult: 1, aura: null, range: MELEE },

  // --- shaman --------------------------------------------------------------
  { id: 'lightning_bolt', name: 'Lightning Bolt', key: '1', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, manaCost: 0, amount: 92, threatMult: 1, aura: null, range: SPELL },
  { id: 'flame_shock', name: 'Flame Shock', key: '2', role: 'dps', kind: 'damage', castTime: 0, cooldown: 13, manaCost: 0, amount: 45, threatMult: 1, aura: 'flame_shock', range: SPELL },
  { id: 'chain_lightning', name: 'Chain Lightning', key: '3', role: 'dps', kind: 'damage', castTime: 1.5, cooldown: 14, manaCost: 0, amount: 470, threatMult: 1, aura: null, range: SPELL },

  // --- druid ---------------------------------------------------------------
  { id: 'wrath', name: 'Wrath', key: '1', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, manaCost: 0, amount: 90, threatMult: 1, aura: null, range: SPELL },
  { id: 'moonfire', name: 'Moonfire', key: '2', role: 'dps', kind: 'damage', castTime: 0, cooldown: 15, manaCost: 0, amount: 42, threatMult: 1, aura: 'moonfire', range: SPELL },
  { id: 'starfire', name: 'Starfire', key: '3', role: 'dps', kind: 'damage', castTime: 2, cooldown: 18, manaCost: 0, amount: 560, threatMult: 1, aura: null, range: SPELL },
]

export const ABILITIES: Record<string, Ability> = Object.fromEntries(
  list.map((a) => [a.id, a]),
)

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

const list: Ability[] = [
  // --- damage dealer (the slot the human plays) ---
  {
    id: 'strike',
    name: 'Strike',
    key: '1',
    role: 'dps',
    kind: 'damage',
    castTime: 0,
    cooldown: 0,
    manaCost: 0,
    amount: 90,
    threatMult: 1,
    aura: null,
    range: 46,
  },
  {
    id: 'ignite',
    name: 'Ignite',
    key: '2',
    role: 'dps',
    kind: 'damage',
    castTime: 0,
    cooldown: 12,
    manaCost: 0,
    amount: 40,
    threatMult: 1,
    aura: 'ignite',
    range: 260,
  },
  {
    id: 'burst',
    name: 'Burst',
    key: '3',
    role: 'dps',
    kind: 'damage',
    // The long cast is the point: it competes with dodging the puddle.
    castTime: 2,
    cooldown: 18,
    manaCost: 0,
    amount: 420,
    threatMult: 1,
    aura: null,
    range: 260,
  },

  // --- tank ---
  {
    id: 'cleave',
    name: 'Cleave',
    key: '-',
    role: 'tank',
    kind: 'damage',
    castTime: 0,
    cooldown: 0,
    manaCost: 0,
    amount: 60,
    threatMult: 4,
    aura: null,
    range: 46,
  },
  {
    id: 'shield_slam',
    name: 'Shield Slam',
    key: '-',
    role: 'tank',
    kind: 'damage',
    castTime: 0,
    cooldown: 6,
    manaCost: 0,
    amount: 110,
    threatMult: 6,
    aura: null,
    range: 46,
  },
  {
    id: 'shield_wall',
    name: 'Shield Wall',
    key: '-',
    role: 'tank',
    kind: 'defensive',
    castTime: 0,
    cooldown: 40,
    manaCost: 0,
    amount: 0,
    threatMult: 0,
    aura: 'shield',
    range: 0,
  },

  // --- healer ---
  {
    id: 'heal',
    name: 'Heal',
    key: '-',
    role: 'healer',
    kind: 'heal',
    castTime: 2,
    cooldown: 0,
    manaCost: 22,
    amount: 380,
    threatMult: 0,
    aura: null,
    range: 300,
  },
  {
    id: 'flash',
    name: 'Flash Heal',
    key: '-',
    role: 'healer',
    kind: 'heal',
    castTime: 0,
    cooldown: 8,
    manaCost: 40,
    amount: 180,
    threatMult: 0,
    aura: null,
    range: 300,
  },
  {
    id: 'renew',
    name: 'Renew',
    key: '-',
    role: 'healer',
    kind: 'heal',
    castTime: 0,
    cooldown: 10,
    manaCost: 18,
    amount: 0,
    threatMult: 0,
    aura: 'renew',
    range: 300,
  },
]

export const ABILITIES: Record<string, Ability> = Object.fromEntries(
  list.map((a) => [a.id, a]),
)

/** Ability ids the human player has bound, in action-bar order. */
export const PLAYER_BAR = ['strike', 'ignite', 'burst'] as const

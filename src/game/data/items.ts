import { EquipSlot } from '../../types';

export interface ItemBase {
  id: string;
  name: string;
  slot: EquipSlot;
  baseAttack: number;
  baseDefense: number;
  minLevel: number;
}

export const ITEM_BASES: ItemBase[] = [
  // Weapons
  { id: 'short_sword', name: 'Short Sword', slot: 'weapon', baseAttack: 5, baseDefense: 0, minLevel: 1 },
  { id: 'long_sword', name: 'Long Sword', slot: 'weapon', baseAttack: 10, baseDefense: 0, minLevel: 5 },
  { id: 'broad_sword', name: 'Broad Sword', slot: 'weapon', baseAttack: 16, baseDefense: 0, minLevel: 10 },
  { id: 'claymore', name: 'Claymore', slot: 'weapon', baseAttack: 24, baseDefense: 0, minLevel: 18 },
  { id: 'hand_axe', name: 'Hand Axe', slot: 'weapon', baseAttack: 7, baseDefense: 0, minLevel: 1 },
  { id: 'battle_axe', name: 'Battle Axe', slot: 'weapon', baseAttack: 18, baseDefense: 0, minLevel: 12 },
  { id: 'great_axe', name: 'Great Axe', slot: 'weapon', baseAttack: 30, baseDefense: 0, minLevel: 22 },
  // Helmets
  { id: 'cap', name: 'Cap', slot: 'helmet', baseAttack: 0, baseDefense: 3, minLevel: 1 },
  { id: 'helm', name: 'Helm', slot: 'helmet', baseAttack: 0, baseDefense: 7, minLevel: 8 },
  { id: 'great_helm', name: 'Great Helm', slot: 'helmet', baseAttack: 0, baseDefense: 14, minLevel: 18 },
  // Armor
  { id: 'quilted_armor', name: 'Quilted Armor', slot: 'armor', baseAttack: 0, baseDefense: 5, minLevel: 1 },
  { id: 'chain_mail', name: 'Chain Mail', slot: 'armor', baseAttack: 0, baseDefense: 12, minLevel: 10 },
  { id: 'plate_mail', name: 'Plate Mail', slot: 'armor', baseAttack: 0, baseDefense: 22, minLevel: 20 },
  // Gloves
  { id: 'gloves', name: 'Gloves', slot: 'gloves', baseAttack: 0, baseDefense: 2, minLevel: 1 },
  { id: 'gauntlets', name: 'Gauntlets', slot: 'gloves', baseAttack: 0, baseDefense: 6, minLevel: 12 },
  // Boots
  { id: 'boots', name: 'Boots', slot: 'boots', baseAttack: 0, baseDefense: 2, minLevel: 1 },
  { id: 'greaves', name: 'Greaves', slot: 'boots', baseAttack: 0, baseDefense: 6, minLevel: 12 },
  // Rings
  { id: 'ring', name: 'Ring', slot: 'ring1', baseAttack: 0, baseDefense: 0, minLevel: 1 },
  // Necklace
  { id: 'amulet', name: 'Amulet', slot: 'necklace', baseAttack: 0, baseDefense: 0, minLevel: 1 },
];

export const PREFIXES = [
  { id: 'strong', name: 'Strong', stat: 'attack' as const, value: 5 },
  { id: 'sharp', name: 'Sharp', stat: 'critChance' as const, value: 3 },
  { id: 'sturdy', name: 'Sturdy', stat: 'defense' as const, value: 5 },
  { id: 'vital', name: 'Vital', stat: 'maxHp' as const, value: 20 },
  { id: 'arcane', name: 'Arcane', stat: 'maxMana' as const, value: 20 },
  { id: 'accurate', name: 'Accurate', stat: 'accuracy' as const, value: 8 },
];

export const SUFFIXES = [
  { id: 'power', name: 'of Power', stat: 'attack' as const, value: 8 },
  { id: 'fury', name: 'of Fury', stat: 'critChance' as const, value: 5 },
  { id: 'protection', name: 'of Protection', stat: 'defense' as const, value: 8 },
  { id: 'vitality', name: 'of Vitality', stat: 'maxHp' as const, value: 30 },
  { id: 'warding', name: 'of Warding', stat: 'evasion' as const, value: 10 },
  { id: 'the_wolf', name: 'of the Wolf', stat: 'accuracy' as const, value: 12 },
];

export const RARITY_WEIGHTS = [
  { rarity: 'Normal' as const, weight: 60 },
  { rarity: 'Magic' as const, weight: 25 },
  { rarity: 'Rare' as const, weight: 10 },
  { rarity: 'Set' as const, weight: 4 },
  { rarity: 'Unique' as const, weight: 1 },
];

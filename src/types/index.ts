export type ItemRarity = 'Normal' | 'Magic' | 'Rare' | 'Set' | 'Unique';
export type EquipSlot = 'weapon' | 'helmet' | 'armor' | 'gloves' | 'boots' | 'ring1' | 'ring2' | 'necklace';
export type MonsterVariant = 'normal' | 'elite' | 'boss';
export type AffixStat = 'attack' | 'defense' | 'critChance' | 'maxHp' | 'maxMana' | 'accuracy' | 'evasion' | 'gold';
export type SkillTarget = 'single' | 'aoe' | 'self';

export interface Attributes {
  strength: number;
  dexterity: number;
  vitality: number;
  energy: number;
}

export interface Affix {
  id: string;
  name: string;
  stat: AffixStat;
  value: number;
}

export interface Item {
  id: string;
  baseType: string;
  name: string;
  rarity: ItemRarity;
  itemLevel: number;
  slot: EquipSlot;
  affixes: Affix[];
  baseAttack: number;
  baseDefense: number;
  value: number;
  enhanceLevel: number;
}

export interface Equipment {
  weapon?: Item;
  helmet?: Item;
  armor?: Item;
  gloves?: Item;
  boots?: Item;
  ring1?: Item;
  ring2?: Item;
  necklace?: Item;
}

export interface PlayerData {
  id: string;
  name: string;
  level: number;
  exp: number;
  attributes: Attributes;
  statPoints: number;
  skillPoints: number;
  learnedSkills: string[];
  equippedSkills: (string | null)[];
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  gold: number;
  attack: number;
  defense: number;
  accuracy: number;
  evasion: number;
  critChance: number;
}

export interface SkillData {
  id: string;
  name: string;
  description: string;
  requiredLevel: number;
  manaCost: number;
  cooldown: number;
  target: SkillTarget;
  multiplier: number;
  range?: number;
  healPercent?: number;
  executeThreshold?: number;
  executeBonusMultiplier?: number;
}

export interface MonsterBase {
  id: string;
  name: string;
  baseHp: number;
  baseAttack: number;
  baseDefense: number;
  baseAccuracy: number;
  baseEvasion: number;
  baseExp: number;
  baseGold: number;
  color: number;
  radius: number;
}

export interface SaveData {
  version: string;
  player: PlayerData;
  equipment: Equipment;
  inventory: Item[];
  floor: number;
  timestamp: number;
}

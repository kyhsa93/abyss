import { create } from 'zustand';
import { Attributes, Equipment, Item } from '../types';

function calcDerivedStats(
  attrs: Attributes,
  equipment: Equipment,
  baseHp: number,
  baseMana: number,
) {
  let attack = attrs.strength * 2;
  let defense = 0;
  let accuracy = attrs.dexterity * 2;
  let evasion = attrs.dexterity;
  let critChance = 5;
  let maxHp = baseHp + attrs.vitality * 10;
  let maxMana = baseMana + attrs.energy * 10;

  for (const item of Object.values(equipment).filter(Boolean) as Item[]) {
    attack += item.baseAttack;
    defense += item.baseDefense;
    for (const affix of item.affixes) {
      if (affix.stat === 'attack') attack += affix.value;
      if (affix.stat === 'defense') defense += affix.value;
      if (affix.stat === 'critChance') critChance += affix.value;
      if (affix.stat === 'maxHp') maxHp += affix.value;
      if (affix.stat === 'maxMana') maxMana += affix.value;
      if (affix.stat === 'accuracy') accuracy += affix.value;
      if (affix.stat === 'evasion') evasion += affix.value;
    }
  }

  return { attack, defense, accuracy, evasion, critChance, maxHp, maxMana };
}

interface PlayerStore {
  id: string;
  name: string;
  level: number;
  exp: number;
  attributes: Attributes;
  statPoints: number;
  skillPoints: number;
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

  gainExp: (amount: number) => void;
  gainGold: (amount: number) => void;
  takeDamage: (amount: number) => void;
  heal: (amount: number) => void;
  fullHeal: () => void;
  spendStatPoint: (attr: keyof Attributes) => void;
  recalcStats: (equipment: Equipment) => void;
  loadData: (data: import('../types').PlayerData) => void;
  setName: (name: string) => void;
}

function requiredExp(level: number): number {
  return Math.floor(100 * Math.pow(1.15, level));
}

const BASE_HP = 50;
const BASE_MANA = 30;

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  id: crypto.randomUUID(),
  name: 'Warrior',
  level: 1,
  exp: 0,
  attributes: { strength: 10, dexterity: 5, vitality: 8, energy: 4 },
  statPoints: 0,
  skillPoints: 0,
  hp: BASE_HP + 8 * 10,
  maxHp: BASE_HP + 8 * 10,
  mana: BASE_MANA + 4 * 10,
  maxMana: BASE_MANA + 4 * 10,
  gold: 0,
  attack: 10 * 2,
  defense: 0,
  accuracy: 5 * 2,
  evasion: 5,
  critChance: 5,

  gainExp: (amount) => {
    const s = get();
    let newExp = s.exp + amount;
    let newLevel = s.level;
    let statPoints = s.statPoints;
    let skillPoints = s.skillPoints;
    let attrs = { ...s.attributes };

    while (newLevel < 100 && newExp >= requiredExp(newLevel)) {
      newExp -= requiredExp(newLevel);
      newLevel++;
      statPoints += 5;
      skillPoints += 1;
    }

    const derived = calcDerivedStats(attrs, {}, BASE_HP, BASE_MANA);
    set({
      exp: newExp,
      level: newLevel,
      statPoints,
      skillPoints,
      maxHp: derived.maxHp,
      maxMana: derived.maxMana,
    });
  },

  gainGold: (amount) => set((s) => ({ gold: s.gold + amount })),

  takeDamage: (amount) =>
    set((s) => ({ hp: Math.max(0, s.hp - amount) })),

  heal: (amount) =>
    set((s) => ({ hp: Math.min(s.maxHp, s.hp + amount) })),

  fullHeal: () => set((s) => ({ hp: s.maxHp, mana: s.maxMana })),

  spendStatPoint: (attr) => {
    const s = get();
    if (s.statPoints <= 0) return;
    const newAttrs = { ...s.attributes, [attr]: s.attributes[attr] + 1 };
    const derived = calcDerivedStats(newAttrs, {}, BASE_HP, BASE_MANA);
    const hpIncrease = attr === 'vitality' ? 10 : 0;
    const manaIncrease = attr === 'energy' ? 10 : 0;
    set({
      attributes: newAttrs,
      statPoints: s.statPoints - 1,
      ...derived,
      hp: s.hp + hpIncrease,
      mana: s.mana + manaIncrease,
    });
  },

  recalcStats: (equipment) => {
    const s = get();
    const derived = calcDerivedStats(s.attributes, equipment, BASE_HP, BASE_MANA);
    set({ ...derived });
  },

  loadData: (data) => {
    set({
      id: data.id,
      name: data.name,
      level: data.level,
      exp: data.exp,
      attributes: data.attributes,
      statPoints: data.statPoints,
      skillPoints: data.skillPoints,
      hp: data.hp,
      maxHp: data.maxHp,
      mana: data.mana,
      maxMana: data.maxMana,
      gold: data.gold,
      attack: data.attack,
      defense: data.defense,
      accuracy: data.accuracy,
      evasion: data.evasion,
      critChance: data.critChance,
    });
  },

  setName: (name) => set({ name }),
}));

export { requiredExp };

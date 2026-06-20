import { Item, ItemRarity, Affix } from '../../types';
import { ITEM_BASES, PREFIXES, SUFFIXES, RARITY_WEIGHTS } from '../data/items';

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickRarity(floor: number): ItemRarity {
  const floorBonus = Math.min(floor * 0.5, 10);
  const weights = RARITY_WEIGHTS.map((r) => {
    let w = r.weight;
    if (r.rarity === 'Rare') w += floorBonus;
    if (r.rarity === 'Set') w += floorBonus * 0.4;
    if (r.rarity === 'Unique') w += floorBonus * 0.1;
    if (r.rarity === 'Normal') w = Math.max(10, w - floorBonus * 1.5);
    return { rarity: r.rarity, weight: w };
  });

  const total = weights.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const { rarity, weight } of weights) {
    roll -= weight;
    if (roll <= 0) return rarity;
  }
  return 'Normal';
}

function affixCount(rarity: ItemRarity): number {
  switch (rarity) {
    case 'Normal': return 0;
    case 'Magic': return Math.random() < 0.5 ? 1 : 2;
    case 'Rare': return 3 + Math.floor(Math.random() * 4);
    case 'Set': return 3;
    case 'Unique': return 4;
    default: return 0;
  }
}

function buildName(baseName: string, rarity: ItemRarity, affixes: Affix[]): string {
  if (rarity === 'Normal') return baseName;
  if (rarity === 'Magic') {
    const prefix = affixes.find((a) => PREFIXES.some((p) => p.id === a.id));
    const suffix = affixes.find((a) => SUFFIXES.some((s) => s.id === a.id));
    const pre = prefix ? prefix.name + ' ' : '';
    const suf = suffix ? ' ' + suffix.name : '';
    return `${pre}${baseName}${suf}`;
  }
  if (rarity === 'Rare') return `${baseName} [Rare]`;
  if (rarity === 'Set') return `${baseName} [Set]`;
  if (rarity === 'Unique') return `${baseName} [Unique]`;
  return baseName;
}

export function generateItem(floor: number, forceSlot?: import('../../types').EquipSlot): Item {
  const itemLevel = Math.max(1, floor);
  const eligible = ITEM_BASES.filter(
    (b) => b.minLevel <= itemLevel && (!forceSlot || b.slot === forceSlot),
  );
  const base = randomFrom(eligible.length > 0 ? eligible : ITEM_BASES);
  const rarity = pickRarity(floor);
  const count = affixCount(rarity);

  const usedPrefixes = new Set<string>();
  const usedSuffixes = new Set<string>();
  const affixes: Affix[] = [];

  for (let i = 0; i < count; i++) {
    const usePrefix = affixes.length === 0 || (affixes.length < Math.ceil(count / 2) && Math.random() < 0.5);
    if (usePrefix) {
      const pool = PREFIXES.filter((p) => !usedPrefixes.has(p.id));
      if (pool.length > 0) {
        const pick = randomFrom(pool);
        usedPrefixes.add(pick.id);
        affixes.push({
          id: pick.id,
          name: pick.name,
          stat: pick.stat,
          value: pick.value + Math.floor(Math.random() * floor),
        });
        continue;
      }
    }
    const pool = SUFFIXES.filter((s) => !usedSuffixes.has(s.id));
    if (pool.length > 0) {
      const pick = randomFrom(pool);
      usedSuffixes.add(pick.id);
      affixes.push({
        id: pick.id,
        name: pick.name,
        stat: pick.stat,
        value: pick.value + Math.floor(Math.random() * floor),
      });
    }
  }

  const name = buildName(base.name, rarity, affixes);

  return {
    id: crypto.randomUUID(),
    baseType: base.id,
    name,
    rarity,
    itemLevel,
    slot: base.slot,
    affixes,
    baseAttack: base.baseAttack,
    baseDefense: base.baseDefense,
  };
}

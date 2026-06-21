import { Item, ItemRarity } from '../../types';

const RARITY_VALUE_MULT: Record<ItemRarity, number> = {
  Normal: 1,
  Magic: 2.2,
  Rare: 4.5,
  Set: 7,
  Unique: 12,
};

export function getItemSellValue(item: Pick<Item, 'itemLevel' | 'rarity' | 'baseAttack' | 'baseDefense' | 'affixes'>): number {
  const base = (10 + item.itemLevel * 4) * RARITY_VALUE_MULT[item.rarity];
  const statBonus = (item.baseAttack + item.baseDefense) * 2;
  const affixBonus = item.affixes.length * 15;
  return Math.round(base + statBonus + affixBonus);
}

export function getUpgradeCost(item: Item): number {
  return Math.round((25 + item.itemLevel * 6) * Math.pow(1.35, item.enhanceLevel));
}

export function getUpgradeIncrement(item: Item): number {
  return Math.max(1, Math.round(2 + item.itemLevel * 0.25));
}

export function normalizeItem(item: Item): Item {
  const enhanceLevel = item.enhanceLevel ?? 0;
  const withLevel = { ...item, enhanceLevel };
  const value = item.value ?? getItemSellValue(withLevel);
  return { ...withLevel, value };
}

export function applyUpgrade(item: Item): Item {
  const inc = getUpgradeIncrement(item);
  return {
    ...item,
    baseAttack: item.baseAttack > 0 ? item.baseAttack + inc : item.baseAttack,
    baseDefense: item.baseDefense > 0 ? item.baseDefense + inc : item.baseDefense,
    enhanceLevel: item.enhanceLevel + 1,
  };
}

import { create } from 'zustand';
import { Equipment, EquipSlot, Item } from '../types';
import { usePlayerStore } from './playerStore';
import { applyUpgrade, getUpgradeCost, normalizeItem } from '../game/systems/BlacksmithSystem';

interface InventoryStore {
  inventory: Item[];
  equipment: Equipment;

  addItem: (item: Item) => void;
  removeItem: (id: string) => void;
  equipItem: (item: Item) => void;
  unequipItem: (slot: EquipSlot) => void;
  sellItem: (id: string) => void;
  upgradeItem: (id: string) => boolean;
  loadData: (inventory: Item[], equipment: Equipment) => void;
}

export const useInventoryStore = create<InventoryStore>((set, get) => ({
  inventory: [],
  equipment: {},

  addItem: (item) => {
    set((s) => ({ inventory: [...s.inventory, item] }));
  },

  removeItem: (id) => {
    set((s) => ({ inventory: s.inventory.filter((i) => i.id !== id) }));
  },

  equipItem: (item) => {
    const s = get();
    const slot = item.slot;
    const current = s.equipment[slot];
    const newEquipment = { ...s.equipment, [slot]: item };
    const newInventory = s.inventory.filter((i) => i.id !== item.id);
    if (current) newInventory.push(current);
    set({ equipment: newEquipment, inventory: newInventory });
    usePlayerStore.getState().recalcStats(newEquipment);
  },

  unequipItem: (slot) => {
    const s = get();
    const item = s.equipment[slot];
    if (!item) return;
    const newEquipment = { ...s.equipment };
    delete newEquipment[slot];
    set({ equipment: newEquipment, inventory: [...s.inventory, item] });
    usePlayerStore.getState().recalcStats(newEquipment);
  },

  sellItem: (id) => {
    const s = get();
    const item = s.inventory.find((i) => i.id === id);
    if (!item) return;
    set({ inventory: s.inventory.filter((i) => i.id !== id) });
    usePlayerStore.getState().gainGold(item.value);
  },

  upgradeItem: (id) => {
    const s = get();
    const equippedSlot = (Object.keys(s.equipment) as EquipSlot[]).find((slot) => s.equipment[slot]?.id === id);
    const item = equippedSlot ? s.equipment[equippedSlot] : s.inventory.find((i) => i.id === id);
    if (!item) return false;

    const cost = getUpgradeCost(item);
    if (!usePlayerStore.getState().spendGold(cost)) return false;

    const upgraded = applyUpgrade(item);
    if (equippedSlot) {
      const newEquipment = { ...s.equipment, [equippedSlot]: upgraded };
      set({ equipment: newEquipment });
      usePlayerStore.getState().recalcStats(newEquipment);
    } else {
      set({ inventory: s.inventory.map((i) => (i.id === id ? upgraded : i)) });
    }
    return true;
  },

  loadData: (inventory, equipment) => {
    const normInventory = inventory.map(normalizeItem);
    const normEquipment: Equipment = {};
    for (const slot of Object.keys(equipment) as EquipSlot[]) {
      const item = equipment[slot];
      if (item) normEquipment[slot] = normalizeItem(item);
    }
    set({ inventory: normInventory, equipment: normEquipment });
    usePlayerStore.getState().recalcStats(normEquipment);
  },
}));

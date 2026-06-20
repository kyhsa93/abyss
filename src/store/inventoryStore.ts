import { create } from 'zustand';
import { Equipment, EquipSlot, Item } from '../types';
import { usePlayerStore } from './playerStore';

interface InventoryStore {
  inventory: Item[];
  equipment: Equipment;

  addItem: (item: Item) => void;
  removeItem: (id: string) => void;
  equipItem: (item: Item) => void;
  unequipItem: (slot: EquipSlot) => void;
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

  loadData: (inventory, equipment) => {
    set({ inventory, equipment });
    usePlayerStore.getState().recalcStats(equipment);
  },
}));

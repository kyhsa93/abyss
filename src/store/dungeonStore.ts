import { create } from 'zustand';

interface DungeonStore {
  floor: number;
  monstersKilled: number;
  totalMonstersKilled: number;
  scene: 'town' | 'dungeon';

  setFloor: (floor: number) => void;
  setScene: (scene: 'town' | 'dungeon') => void;
  incrementKills: () => void;
  resetFloor: () => void;
  loadData: (floor: number) => void;
}

export const useDungeonStore = create<DungeonStore>((set) => ({
  floor: 1,
  monstersKilled: 0,
  totalMonstersKilled: 0,
  scene: 'town',

  setFloor: (floor) => set({ floor }),
  setScene: (scene) => set({ scene }),
  incrementKills: () =>
    set((s) => ({
      monstersKilled: s.monstersKilled + 1,
      totalMonstersKilled: s.totalMonstersKilled + 1,
    })),
  resetFloor: () => set({ monstersKilled: 0 }),
  loadData: (floor) => set({ floor }),
}));

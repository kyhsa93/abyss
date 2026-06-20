import { create } from 'zustand';

interface PlayerState {
  level: number;
  exp: number;
  hp: number;
  setExp: (exp: number) => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  level: 1,
  exp: 0,
  hp: 100,
  setExp: (exp) => set({ exp }),
}));

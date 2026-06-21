import { create } from 'zustand';

interface JoystickStore {
  active: boolean;
  dx: number;
  dy: number;
  setVector: (dx: number, dy: number) => void;
  reset: () => void;
}

export const useJoystickStore = create<JoystickStore>((set) => ({
  active: false,
  dx: 0,
  dy: 0,
  setVector: (dx, dy) => set({ active: true, dx, dy }),
  reset: () => set({ active: false, dx: 0, dy: 0 }),
}));

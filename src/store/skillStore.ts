import { create } from 'zustand';

interface SkillStore {
  cooldownUntil: Record<string, number>;
  setCooldown: (id: string, durationMs: number) => void;
  isReady: (id: string) => boolean;
}

export const useSkillStore = create<SkillStore>((set, get) => ({
  cooldownUntil: {},

  setCooldown: (id, durationMs) =>
    set((s) => ({ cooldownUntil: { ...s.cooldownUntil, [id]: Date.now() + durationMs } })),

  isReady: (id) => Date.now() >= (get().cooldownUntil[id] ?? 0),
}));

import { SaveData } from '../types';
import { usePlayerStore } from '../store/playerStore';
import { useInventoryStore } from '../store/inventoryStore';
import { useDungeonStore } from '../store/dungeonStore';

const SAVE_KEY = 'abyss_save';
const SAVE_VERSION = '0.1.0';

export const SaveService = {
  save(): void {
    const player = usePlayerStore.getState();
    const inventory = useInventoryStore.getState();
    const dungeon = useDungeonStore.getState();

    const data: SaveData = {
      version: SAVE_VERSION,
      player: {
        id: player.id,
        name: player.name,
        level: player.level,
        exp: player.exp,
        attributes: player.attributes,
        statPoints: player.statPoints,
        skillPoints: player.skillPoints,
        hp: player.hp,
        maxHp: player.maxHp,
        mana: player.mana,
        maxMana: player.maxMana,
        gold: player.gold,
        attack: player.attack,
        defense: player.defense,
        accuracy: player.accuracy,
        evasion: player.evasion,
        critChance: player.critChance,
      },
      equipment: inventory.equipment,
      inventory: inventory.inventory,
      floor: dungeon.floor,
      timestamp: Date.now(),
    };

    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  },

  load(): boolean {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;

    try {
      const data: SaveData = JSON.parse(raw);
      usePlayerStore.getState().loadData(data.player);
      useInventoryStore.getState().loadData(data.inventory, data.equipment);
      useDungeonStore.getState().loadData(data.floor);
      return true;
    } catch {
      return false;
    }
  },

  hasSave(): boolean {
    return !!localStorage.getItem(SAVE_KEY);
  },

  deleteSave(): void {
    localStorage.removeItem(SAVE_KEY);
  },
};

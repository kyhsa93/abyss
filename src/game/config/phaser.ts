import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { TownScene } from '../scenes/TownScene';
import { DungeonScene } from '../scenes/DungeonScene';

export const phaserConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 1280,
  height: 720,
  backgroundColor: '#0a0a0f',
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: [BootScene, PreloadScene, TownScene, DungeonScene],
};

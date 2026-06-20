import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {}

  create() {
    this.scene.start('TownScene');
  }
}

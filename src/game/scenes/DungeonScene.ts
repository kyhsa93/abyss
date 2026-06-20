import Phaser from 'phaser';

export class DungeonScene extends Phaser.Scene {
  constructor() {
    super('DungeonScene');
  }

  create() {
    this.add.text(100, 100, 'Abyss Prototype');

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      console.log('move target', pointer.worldX, pointer.worldY);
    });
  }
}

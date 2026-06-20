import Phaser from 'phaser';

export class DungeonScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Arc;
  private targetX = 400;
  private targetY = 300;

  constructor() {
    super('DungeonScene');
  }

  create() {
    this.add.text(20, 20, 'Abyss Prototype');

    this.player = this.add.circle(400, 300, 16, 0x00ff00);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.targetX = pointer.worldX;
      this.targetY = pointer.worldY;
    });
  }

  update() {
    const speed = 3;

    const dx = this.targetX - this.player.x;
    const dy = this.targetY - this.player.y;

    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 2) {
      this.player.x += (dx / distance) * speed;
      this.player.y += (dy / distance) * speed;
    }
  }
}

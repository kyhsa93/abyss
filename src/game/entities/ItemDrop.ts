import Phaser from 'phaser';
import { Item } from '../../types';

const RARITY_COLORS: Record<string, number> = {
  Normal: 0xcccccc,
  Magic: 0x4488ff,
  Rare: 0xffee22,
  Set: 0x22ee88,
  Unique: 0xffaa44,
};

export class ItemDropEntity extends Phaser.GameObjects.Container {
  item: Item;
  private gem: Phaser.GameObjects.Polygon;
  private label: Phaser.GameObjects.Text;
  picked = false;

  constructor(scene: Phaser.Scene, x: number, y: number, item: Item) {
    super(scene, x, y);
    this.item = item;

    const color = RARITY_COLORS[item.rarity] ?? 0xffffff;
    const size = 8;
    this.gem = scene.add.polygon(0, 0, [0, -size, size, 0, 0, size, -size, 0], color);

    this.label = scene.add.text(0, size + 3, item.name, {
      fontSize: '9px',
      color: `#${color.toString(16).padStart(6, '0')}`,
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0);

    this.add([this.gem, this.label]);
    scene.add.existing(this);
    this.setDepth(3);
    this.setInteractive(new Phaser.Geom.Circle(0, 0, 16), Phaser.Geom.Circle.Contains);

    scene.tweens.add({
      targets: this,
      y: y - 4,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  pickup() {
    this.picked = true;
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      y: this.y - 20,
      duration: 200,
      onComplete: () => this.destroy(),
    });
  }
}

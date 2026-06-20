import Phaser from 'phaser';
import { usePlayerStore } from '../../store/playerStore';
import { useDungeonStore } from '../../store/dungeonStore';
import { SaveService } from '../../services/SaveService';

export class TownScene extends Phaser.Scene {
  private playerCircle!: Phaser.GameObjects.Arc;
  private targetX = 0;
  private targetY = 0;
  private speed = 200;

  constructor() {
    super('TownScene');
  }

  create() {
    useDungeonStore.getState().setScene('town');
    usePlayerStore.getState().fullHeal();

    const W = this.scale.width;
    const H = this.scale.height;

    // Ground
    this.add.rectangle(W / 2, H / 2, W, H, 0x2d4a1e);

    // Buildings
    this.add.rectangle(150, 200, 180, 140, 0x8b6914).setDepth(1);
    this.add.text(150, 200, 'INN', { fontSize: '16px', color: '#fff' }).setOrigin(0.5).setDepth(2);
    this.add.rectangle(600, 200, 180, 140, 0x6b4514).setDepth(1);
    this.add.text(600, 200, 'BLACKSMITH', { fontSize: '12px', color: '#fff' }).setOrigin(0.5).setDepth(2);

    // Dungeon portal
    const portal = this.add.circle(W - 120, H / 2, 50, 0x220066).setDepth(2);
    const portalGlow = this.add.circle(W - 120, H / 2, 50, 0x6600ff, 0.4).setDepth(3);
    this.add.text(W - 120, H / 2 + 65, 'DUNGEON', { fontSize: '14px', color: '#bb88ff' })
      .setOrigin(0.5).setDepth(3);
    this.tweens.add({ targets: portalGlow, alpha: 0.1, duration: 800, yoyo: true, repeat: -1 });

    portal.setInteractive();
    portal.on('pointerdown', () => this.enterDungeon());

    // Inn - heal text
    const innCircle = this.add.circle(150, 200, 90).setInteractive();
    innCircle.setAlpha(0.01);
    innCircle.on('pointerdown', () => {
      usePlayerStore.getState().fullHeal();
      const t = this.add.text(150, 140, 'Rested! Full HP/MP', { fontSize: '13px', color: '#aaffaa' })
        .setOrigin(0.5).setDepth(10);
      this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, duration: 1200, onComplete: () => t.destroy() });
    });

    // Player
    const cx = W / 2;
    const cy = H / 2;
    this.targetX = cx;
    this.targetY = cy;
    this.playerCircle = this.add.circle(cx, cy, 16, 0x00dd44).setDepth(10);

    // HUD info
    const floor = useDungeonStore.getState().floor;
    this.add.text(16, 16, `Town — Next: Floor ${floor}`, { fontSize: '18px', color: '#fff', stroke: '#000', strokeThickness: 3 })
      .setScrollFactor(0).setDepth(20);
    this.add.text(16, 44, 'Click portal to enter dungeon  |  Click Inn to rest', { fontSize: '12px', color: '#aaa' })
      .setScrollFactor(0).setDepth(20);

    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      this.targetX = ptr.worldX;
      this.targetY = ptr.worldY;
    });

    // Auto-save on town return
    SaveService.save();
  }

  private enterDungeon() {
    const floor = useDungeonStore.getState().floor;
    this.scene.start('DungeonScene', { floor });
  }

  update(_time: number, delta: number) {
    const dx = this.targetX - this.playerCircle.x;
    const dy = this.targetY - this.playerCircle.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 3) {
      const step = (this.speed * delta) / 1000;
      this.playerCircle.x += (dx / dist) * Math.min(step, dist);
      this.playerCircle.y += (dy / dist) * Math.min(step, dist);
    }
  }
}

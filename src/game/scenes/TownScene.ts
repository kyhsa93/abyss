import Phaser from 'phaser';
import { usePlayerStore } from '../../store/playerStore';
import { useDungeonStore } from '../../store/dungeonStore';
import { SaveService } from '../../services/SaveService';
import { addPortalSparkle, addVignette } from '../systems/VisualEffects';
import { gameEvents } from '../gameEvents';
import { useJoystickStore } from '../../store/joystickStore';

export class TownScene extends Phaser.Scene {
  private playerCircle!: Phaser.GameObjects.Arc;
  private targetX = 0;
  private targetY = 0;
  private speed = 200;
  private worldW = 0;
  private worldH = 0;

  constructor() {
    super('TownScene');
  }

  create() {
    useDungeonStore.getState().setScene('town');
    usePlayerStore.getState().fullHeal();

    const W = this.scale.width;
    const H = this.scale.height;
    this.worldW = W;
    this.worldH = H;

    // Ground
    this.drawGround(W, H);
    this.addProps();

    // Buildings
    this.drawBuilding(150, 200, 180, 140, 0x8b6914, 0xc9a227, 'INN');
    this.drawBuilding(600, 200, 180, 140, 0x6b4514, 0x9c6b2e, 'BLACKSMITH', '12px');

    // Dungeon portal
    const portal = this.add.circle(W - 120, H / 2, 50, 0x220066).setDepth(2);
    const portalGlow = this.add.circle(W - 120, H / 2, 50, 0x6600ff, 0.4).setDepth(3);
    this.add.text(W - 120, H / 2 + 65, 'DUNGEON', { fontSize: '14px', color: '#bb88ff' })
      .setOrigin(0.5).setDepth(3);
    this.tweens.add({ targets: portalGlow, alpha: 0.1, duration: 800, yoyo: true, repeat: -1 });
    addPortalSparkle(this, W - 120, H / 2, 0xaa66ff);

    portal.setInteractive();
    portal.on('pointerdown', () => this.enterDungeon());

    addVignette(this, 15);

    // Inn - heal text
    const innCircle = this.add.circle(150, 200, 90).setInteractive();
    innCircle.setAlpha(0.01);
    innCircle.on('pointerdown', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
      usePlayerStore.getState().fullHeal();
      const t = this.add.text(150, 140, 'Rested! Full HP/MP', { fontSize: '13px', color: '#aaffaa' })
        .setOrigin(0.5).setDepth(10);
      this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, duration: 1200, onComplete: () => t.destroy() });
      event.stopPropagation();
    });

    // Blacksmith - open shop/upgrade window
    const blacksmithCircle = this.add.circle(600, 200, 90).setInteractive();
    blacksmithCircle.setAlpha(0.01);
    blacksmithCircle.on('pointerdown', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
      gameEvents.emit('open-blacksmith');
      event.stopPropagation();
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

    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      this.targetX = ptr.worldX;
      this.targetY = ptr.worldY;
    });

    // Keyboard shortcuts
    this.input.keyboard?.on('keydown-I', () => {
      gameEvents.emit('toggle-inventory');
    });
    this.input.keyboard?.on('keydown-C', () => {
      gameEvents.emit('toggle-character');
    });
    this.input.keyboard?.on('keydown-ESC', () => {
      gameEvents.emit('close-windows');
    });

    // Auto-save on town return
    SaveService.save();
  }

  private enterDungeon() {
    const floor = useDungeonStore.getState().floor;
    this.scene.start('DungeonScene', { floor });
  }

  private drawGround(W: number, H: number) {
    const gfx = this.add.graphics().setDepth(0);

    gfx.fillStyle(0x2d4a1e);
    gfx.fillRect(0, 0, W, H);

    // Grass blotches to break up the flat fill
    for (let i = 0; i < 90; i++) {
      const x = Phaser.Math.Between(0, W);
      const y = Phaser.Math.Between(0, H);
      const shade = Math.random() < 0.5 ? 0x355524 : 0x254018;
      gfx.fillStyle(shade, 0.4);
      gfx.fillCircle(x, y, Phaser.Math.Between(15, 40));
    }

    // Dirt paths from the spawn point to each landmark
    const cx = W / 2;
    const cy = H / 2;
    gfx.fillStyle(0x6b5a3a, 0.55);
    this.drawPath(gfx, cx, cy, 150, 200);
    this.drawPath(gfx, cx, cy, 600, 200);
    this.drawPath(gfx, cx, cy, W - 120, H / 2);
  }

  private drawPath(gfx: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number) {
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Phaser.Math.Linear(x1, x2, t);
      const y = Phaser.Math.Linear(y1, y2, t);
      gfx.fillCircle(x, y, 14 + Math.sin(t * Math.PI) * 5);
    }
  }

  private drawBuilding(cx: number, cy: number, w: number, h: number, wallColor: number, roofColor: number, label: string, fontSize = '16px') {
    const gfx = this.add.graphics().setDepth(1);

    // Shadow
    gfx.fillStyle(0x000000, 0.25);
    gfx.fillEllipse(cx + 10, cy + h / 2 + 6, w * 0.9, 24);

    // Wall
    gfx.fillStyle(wallColor);
    gfx.fillRect(cx - w / 2, cy - h / 2, w, h);
    gfx.lineStyle(2, 0x000000, 0.3);
    gfx.strokeRect(cx - w / 2, cy - h / 2, w, h);

    // Roof
    const roofH = 40;
    gfx.fillStyle(roofColor);
    gfx.beginPath();
    gfx.moveTo(cx - w / 2 - 10, cy - h / 2);
    gfx.lineTo(cx + w / 2 + 10, cy - h / 2);
    gfx.lineTo(cx, cy - h / 2 - roofH);
    gfx.closePath();
    gfx.fillPath();
    gfx.lineStyle(2, 0x000000, 0.3);
    gfx.strokePath();

    // Door
    gfx.fillStyle(0x2a1a0a);
    gfx.fillRect(cx - 14, cy + h / 2 - 40, 28, 40);

    this.add.text(cx, cy, label, { fontSize, color: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(2);
  }

  private addProps() {
    const gfx = this.add.graphics().setDepth(1);
    const spots: [number, number, 'tree' | 'rock'][] = [
      [100, 560, 'tree'], [950, 560, 'rock'], [350, 620, 'tree'],
      [1080, 160, 'tree'], [250, 600, 'rock'], [820, 480, 'tree'],
    ];
    for (const [x, y, kind] of spots) {
      if (kind === 'tree') this.drawTree(gfx, x, y);
      else this.drawRock(gfx, x, y);
    }
  }

  private drawTree(gfx: Phaser.GameObjects.Graphics, x: number, y: number) {
    gfx.fillStyle(0x000000, 0.2);
    gfx.fillEllipse(x + 4, y + 6, 30, 10);
    gfx.fillStyle(0x4a3220);
    gfx.fillRect(x - 4, y - 10, 8, 20);
    gfx.fillStyle(0x2f5c2a);
    gfx.fillCircle(x, y - 24, 20);
    gfx.fillStyle(0x3c7536, 0.8);
    gfx.fillCircle(x - 6, y - 30, 12);
  }

  private drawRock(gfx: Phaser.GameObjects.Graphics, x: number, y: number) {
    gfx.fillStyle(0x000000, 0.2);
    gfx.fillEllipse(x + 3, y + 4, 22, 8);
    gfx.fillStyle(0x666666);
    gfx.fillCircle(x, y, 12);
    gfx.fillStyle(0x808080, 0.6);
    gfx.fillCircle(x - 3, y - 3, 6);
  }

  update(_time: number, delta: number) {
    const joystick = useJoystickStore.getState();
    if (joystick.active && (joystick.dx !== 0 || joystick.dy !== 0)) {
      const step = (this.speed * delta) / 1000;
      this.playerCircle.x += joystick.dx * step;
      this.playerCircle.y += joystick.dy * step;
      this.targetX = this.playerCircle.x;
      this.targetY = this.playerCircle.y;
    } else {
      const dx = this.targetX - this.playerCircle.x;
      const dy = this.targetY - this.playerCircle.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 3) {
        const step = (this.speed * delta) / 1000;
        this.playerCircle.x += (dx / dist) * Math.min(step, dist);
        this.playerCircle.y += (dy / dist) * Math.min(step, dist);
      }
    }

    this.playerCircle.x = Phaser.Math.Clamp(this.playerCircle.x, 20, this.worldW - 20);
    this.playerCircle.y = Phaser.Math.Clamp(this.playerCircle.y, 20, this.worldH - 20);
  }
}

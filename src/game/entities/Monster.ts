import Phaser from 'phaser';
import { MonsterBase, MonsterVariant } from '../../types';
import { addDeathBurst } from '../systems/VisualEffects';

export class MonsterEntity extends Phaser.GameObjects.Container {
  private circle: Phaser.GameObjects.Arc;
  private hpBar: Phaser.GameObjects.Rectangle;
  private hpBarBg: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;

  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  accuracy: number;
  evasion: number;
  expReward: number;
  goldReward: number;
  base: MonsterBase;
  variant: MonsterVariant;

  private aiState: 'idle' | 'chase' | 'attack' = 'idle';
  private attackCooldown = 0;
  attackInterval = 1500;
  attackRange = 65;
  aggroRange = 350;
  speed = 90;

  private dead = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    base: MonsterBase,
    variant: MonsterVariant,
    scaledStats: { hp: number; attack: number; defense: number; exp: number; gold: number },
  ) {
    super(scene, x, y);

    this.base = base;
    this.variant = variant;
    this.hp = scaledStats.hp;
    this.maxHp = scaledStats.hp;
    this.attack = scaledStats.attack;
    this.defense = scaledStats.defense;
    this.accuracy = base.baseAccuracy;
    this.evasion = base.baseEvasion;
    this.expReward = scaledStats.exp;
    this.goldReward = scaledStats.gold;

    let color = base.color;
    let radius = base.radius;
    let nameText = base.name;

    if (variant === 'elite') {
      color = 0xffaa00;
      radius = base.radius + 4;
      nameText = 'Elite ' + base.name;
      this.speed = 110;
    } else if (variant === 'boss') {
      radius = base.radius;
      nameText = base.name;
      this.attackInterval = 2000;
      this.speed = 70;
    }

    this.hpBarBg = scene.add.rectangle(0, -radius - 8, 50, 6, 0x440000);
    this.hpBar = scene.add.rectangle(-25, -radius - 8, 50, 6, 0xff3333);
    this.hpBar.setOrigin(0, 0.5);
    this.hpBarBg.setOrigin(0, 0.5);
    this.hpBarBg.x = -25;

    this.circle = scene.add.arc(0, 0, radius, 0, 360, false, color);
    this.label = scene.add.text(0, radius + 4, nameText, {
      fontSize: '10px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0);

    this.add([this.hpBarBg, this.hpBar, this.circle, this.label]);
    scene.add.existing(this);
    this.setDepth(5);
    (this as Phaser.GameObjects.GameObject).setInteractive(
      new Phaser.Geom.Circle(0, 0, radius + 8),
      Phaser.Geom.Circle.Contains,
    );
  }

  takeDamage(amount: number): boolean {
    this.hp = Math.max(0, this.hp - amount);
    this.updateHpBar();
    this.flashHit();
    return this.hp <= 0;
  }

  private updateHpBar() {
    const ratio = this.hp / this.maxHp;
    this.hpBar.width = 50 * ratio;
  }

  private flashHit() {
    const origColor = this.variant === 'elite' ? 0xffaa00 : this.base.color;
    this.circle.setFillStyle(0xffffff);
    this.scene.time.delayedCall(80, () => {
      if (!this.dead) this.circle.setFillStyle(origColor);
    });
  }

  isDead(): boolean {
    return this.dead || this.hp <= 0;
  }

  die() {
    this.dead = true;
    const tint = this.variant === 'elite' ? 0xffaa00 : this.base.color;
    addDeathBurst(this.scene, this.x, this.y, tint);
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scaleX: 1.4,
      scaleY: 1.4,
      duration: 300,
      onComplete: () => this.destroy(),
    });
  }

  update(delta: number, playerX: number, playerY: number, onAttackPlayer: () => void) {
    if (this.dead) return;
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);

    const dist = Phaser.Math.Distance.Between(this.x, this.y, playerX, playerY);

    if (dist < this.aggroRange) {
      this.aiState = 'chase';
    }

    if (this.aiState === 'chase') {
      if (dist > this.attackRange) {
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const step = (this.speed * delta) / 1000;
        this.x += (dx / dist) * Math.min(step, dist - this.attackRange + 5);
        this.y += (dy / dist) * Math.min(step, dist - this.attackRange + 5);
      } else if (this.attackCooldown <= 0) {
        this.attackCooldown = this.attackInterval;
        onAttackPlayer();
      }
    }
  }
}

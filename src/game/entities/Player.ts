import Phaser from 'phaser';

export class PlayerEntity extends Phaser.GameObjects.Container {
  private circle: Phaser.GameObjects.Arc;
  private indicator: Phaser.GameObjects.Arc;
  targetX: number;
  targetY: number;
  targetMonsterRef: import('./Monster').MonsterEntity | null = null;
  private attackCooldown = 0;
  attackInterval = 1000;
  attackRange = 100;
  speed = 220;
  private moveMarker: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    this.targetX = x;
    this.targetY = y;

    this.circle = scene.add.arc(0, 0, 16, 0, 360, false, 0x00dd44);
    this.indicator = scene.add.arc(0, -20, 4, 0, 360, false, 0xffffff);
    this.indicator.setAlpha(0.8);

    this.add([this.circle, this.indicator]);
    scene.add.existing(this);

    this.moveMarker = scene.add.arc(0, 0, 6, 0, 360, false, 0xffffff, 0.5);
    this.moveMarker.setVisible(false);

    this.setDepth(10);
    this.moveMarker.setDepth(1);
  }

  setMoveTarget(wx: number, wy: number) {
    this.targetX = wx;
    this.targetY = wy;
    this.targetMonsterRef = null;
    this.moveMarker.setPosition(wx, wy);
    this.moveMarker.setVisible(true);
    this.scene.time.delayedCall(600, () => this.moveMarker.setVisible(false));
  }

  setTargetMonster(monster: import('./Monster').MonsterEntity | null) {
    this.targetMonsterRef = monster;
  }

  update(delta: number, onAttack: () => void) {
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);

    if (this.targetMonsterRef) {
      if (this.targetMonsterRef.isDead()) {
        this.targetMonsterRef = null;
        return;
      }
      const mx = this.targetMonsterRef.x;
      const my = this.targetMonsterRef.y;
      const dist = Phaser.Math.Distance.Between(this.x, this.y, mx, my);

      if (dist > this.attackRange) {
        this.moveToward(mx, my, delta);
      } else if (this.attackCooldown <= 0) {
        this.attackCooldown = this.attackInterval;
        onAttack();
      }
    } else {
      this.moveToward(this.targetX, this.targetY, delta);
    }
  }

  private moveToward(tx: number, ty: number, delta: number) {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 3) return;
    const step = (this.speed * delta) / 1000;
    this.x += (dx / dist) * Math.min(step, dist);
    this.y += (dy / dist) * Math.min(step, dist);
  }

  flash(color = 0xffffff) {
    this.circle.setFillStyle(color);
    this.scene.time.delayedCall(80, () => this.circle.setFillStyle(0x00dd44));
  }
}

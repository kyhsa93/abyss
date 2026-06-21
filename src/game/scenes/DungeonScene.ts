import Phaser from 'phaser';
import { PlayerEntity } from '../entities/Player';
import { MonsterEntity } from '../entities/Monster';
import { ItemDropEntity } from '../entities/ItemDrop';
import { MONSTER_DATA, BOSS_DATA, scaleMonster } from '../data/monsters';
import { generateItem } from '../generators/ItemGenerator';
import { resolveAttack } from '../systems/CombatSystem';
import { usePlayerStore } from '../../store/playerStore';
import { useInventoryStore } from '../../store/inventoryStore';
import { useDungeonStore } from '../../store/dungeonStore';
import { useSkillStore } from '../../store/skillStore';
import { SaveService } from '../../services/SaveService';
import { addPortalSparkle, addSkillBurst, addTorchGlow, addVignette } from '../systems/VisualEffects';
import { SKILL_DATA } from '../data/skills';
import { gameEvents } from '../gameEvents';

const WORLD_W = 2400;
const WORLD_H = 1600;
const WALL = 48;

interface Rect { x: number; y: number; w: number; h: number }

interface FloorPalette {
  bg: number;
  bgAlt: number;
  tile: number;
  wall: number;
  wallBorder: number;
  glow: number;
}

export class DungeonScene extends Phaser.Scene {
  private player!: PlayerEntity;
  private monsters: MonsterEntity[] = [];
  private itemDrops: ItemDropEntity[] = [];
  private obstacles: Rect[] = [];
  private floor = 1;
  private bossSpawned = false;
  private portalSpawned = false;
  private portal: Phaser.GameObjects.Container | null = null;
  private combatTexts: Phaser.GameObjects.Text[] = [];
  private floorText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private monsterCount = 0;
  private deadCount = 0;
  private graphics!: Phaser.GameObjects.Graphics;
  private palette!: FloorPalette;

  constructor() {
    super('DungeonScene');
  }

  init(data: { floor?: number }) {
    this.floor = data?.floor ?? useDungeonStore.getState().floor;
    this.bossSpawned = false;
    this.portalSpawned = false;
    this.portal = null;
    this.monsters = [];
    this.itemDrops = [];
    this.combatTexts = [];
    this.deadCount = 0;
  }

  create() {
    useDungeonStore.getState().setFloor(this.floor);
    useDungeonStore.getState().setScene('dungeon');
    useDungeonStore.getState().resetFloor();

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

    this.drawRoom();
    this.spawnPlayer();
    this.spawnMonsters();
    this.setupInput();
    this.setupHUD();

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
  }

  private computePalette(): FloorPalette {
    // Hue slowly cycles across floors so each stretch of the dungeon reads as a
    // distinct biome; saturation creeps up every 10 floors to feel more dangerous.
    const hue = (0.62 + this.floor * 0.015) % 1;
    const sat = 0.4 + (Math.floor(this.floor / 10) % 3) * 0.12;
    const c = (s: number, v: number) => Phaser.Display.Color.HSVToRGB(hue, s, v).color;
    return {
      bg: c(sat, 0.1),
      bgAlt: c(sat, 0.14),
      tile: c(sat + 0.1, 0.22),
      wall: c(sat, 0.3),
      wallBorder: c(Math.min(sat + 0.2, 1), 0.58),
      glow: c(0.7, 0.95),
    };
  }

  private drawRoom() {
    this.palette = this.computePalette();
    const { bg, bgAlt, tile, wall, wallBorder, glow } = this.palette;

    this.graphics = this.add.graphics();

    // Floor base
    this.graphics.fillStyle(bg);
    this.graphics.fillRect(0, 0, WORLD_W, WORLD_H);

    // Floor blotches to break up the flat fill
    for (let i = 0; i < 160; i++) {
      const bx = Phaser.Math.Between(WALL, WORLD_W - WALL);
      const by = Phaser.Math.Between(WALL, WORLD_H - WALL);
      this.graphics.fillStyle(bgAlt, 0.25);
      this.graphics.fillCircle(bx, by, Phaser.Math.Between(20, 60));
    }

    // Tiles pattern
    this.graphics.lineStyle(1, tile, 0.35);
    for (let tx = 0; tx < WORLD_W; tx += 64) {
      this.graphics.lineBetween(tx, 0, tx, WORLD_H);
    }
    for (let ty = 0; ty < WORLD_H; ty += 64) {
      this.graphics.lineBetween(0, ty, WORLD_W, ty);
    }

    // Walls
    this.graphics.fillStyle(wall);
    this.graphics.fillRect(0, 0, WORLD_W, WALL);
    this.graphics.fillRect(0, WORLD_H - WALL, WORLD_W, WALL);
    this.graphics.fillRect(0, 0, WALL, WORLD_H);
    this.graphics.fillRect(WORLD_W - WALL, 0, WALL, WORLD_H);

    // Wall border: soft outer glow + crisp inner line
    this.graphics.lineStyle(10, wallBorder, 0.15);
    this.graphics.strokeRect(WALL, WALL, WORLD_W - WALL * 2, WORLD_H - WALL * 2);
    this.graphics.lineStyle(3, wallBorder, 1);
    this.graphics.strokeRect(WALL, WALL, WORLD_W - WALL * 2, WORLD_H - WALL * 2);

    // Floor label
    this.add.text(WORLD_W / 2, WALL / 2, `FLOOR ${this.floor}`, {
      fontSize: '18px', color: '#8888cc', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(0);

    // Pillars / obstacles
    this.obstacles = [];
    const pillarCount = 8 + Math.min(this.floor * 2, 20);
    const minX = WALL + 100;
    const maxX = WORLD_W - WALL - 100;
    const minY = WALL + 100;
    const maxY = WORLD_H - WALL - 100;

    for (let i = 0; i < pillarCount; i++) {
      let px: number, py: number;
      let attempts = 0;
      do {
        px = Phaser.Math.Between(minX, maxX);
        py = Phaser.Math.Between(minY, maxY);
        attempts++;
      } while (
        attempts < 30 &&
        (Math.abs(px - 200) < 150 && Math.abs(py - WORLD_H / 2) < 150)
      );

      const pw = Phaser.Math.Between(40, 80);
      const ph = Phaser.Math.Between(40, 80);
      this.obstacles.push({ x: px, y: py, w: pw, h: ph });

      // Drop shadow for a pseudo-3D feel
      this.graphics.fillStyle(0x000000, 0.25);
      this.graphics.fillEllipse(px + 6, py + ph / 2 + 4, pw * 0.9, ph * 0.35);

      this.graphics.fillStyle(wall);
      this.graphics.fillRect(px - pw / 2, py - ph / 2, pw, ph);

      // Top-edge highlight
      this.graphics.fillStyle(wallBorder, 0.3);
      this.graphics.fillRect(px - pw / 2, py - ph / 2, pw, 4);

      this.graphics.lineStyle(2, wallBorder, 0.9);
      this.graphics.strokeRect(px - pw / 2, py - ph / 2, pw, ph);
    }

    this.graphics.setDepth(0);

    this.addTorches(glow);
    addVignette(this);
  }

  private addTorches(glowColor: number) {
    const spacing = 360;
    const margin = WALL + 36;
    for (let x = margin + 100; x < WORLD_W - margin; x += spacing) {
      addTorchGlow(this, x, margin, glowColor);
      addTorchGlow(this, x, WORLD_H - margin, glowColor);
    }
  }

  private spawnPlayer() {
    const spawnX = WALL + 120;
    const spawnY = WORLD_H / 2;
    this.player = new PlayerEntity(this, spawnX, spawnY);
    this.player.targetX = spawnX;
    this.player.targetY = spawnY;
  }

  private spawnMonsters() {
    const count = 5 + Math.min(this.floor * 2, 20);
    this.monsterCount = count;

    for (let i = 0; i < count; i++) {
      const baseData = MONSTER_DATA[i % MONSTER_DATA.length];
      const isElite = Math.random() < 0.1;
      const variant = isElite ? 'elite' : 'normal';
      const scaled = scaleMonster(baseData, this.floor, variant);

      let mx: number, my: number;
      let attempts = 0;
      do {
        mx = Phaser.Math.Between(WALL + 400, WORLD_W - WALL - 200);
        my = Phaser.Math.Between(WALL + 100, WORLD_H - WALL - 100);
        attempts++;
      } while (attempts < 20 && this.isInsideObstacle(mx, my, 30));

      const monster = new MonsterEntity(this, mx, my, baseData, variant, scaled);
      this.monsters.push(monster);
      monster.on('pointerdown', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
        if (!monster.isDead()) this.player.setTargetMonster(monster);
        event.stopPropagation();
      });
    }
  }

  private spawnBoss() {
    const bossX = WORLD_W - WALL - 200;
    const bossY = WORLD_H / 2;
    const scaled = scaleMonster(BOSS_DATA, this.floor, 'boss');
    scaled.hp = Math.floor(BOSS_DATA.baseHp * 20 * (1 + (this.floor - 1) * 0.08));
    scaled.attack = Math.floor(BOSS_DATA.baseAttack * (1 + (this.floor - 1) * 0.05));
    scaled.exp = Math.floor(BOSS_DATA.baseExp * (1 + (this.floor - 1) * 0.06));
    scaled.gold = Math.floor(BOSS_DATA.baseGold * (1 + (this.floor - 1) * 0.05));

    const boss = new MonsterEntity(this, bossX, bossY, BOSS_DATA, 'boss', scaled);
    boss.aggroRange = 800;
    boss.attackInterval = 2000;
    boss.speed = 60;
    this.monsters.push(boss);
    boss.on('pointerdown', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
      if (!boss.isDead()) this.player.setTargetMonster(boss);
      event.stopPropagation();
    });

    this.showStatusMessage('Boss Appeared! Defeat it to proceed!', '#ff66ff');
  }

  private spawnPortal() {
    this.portalSpawned = true;
    const px = WORLD_W - WALL - 80;
    const py = WORLD_H / 2;

    const gfx = this.add.graphics();
    gfx.fillStyle(0x0044ff, 0.8);
    gfx.fillCircle(0, 0, 40);
    gfx.lineStyle(3, 0x88aaff);
    gfx.strokeCircle(0, 0, 40);

    const label = this.add.text(0, 50, 'NEXT FLOOR', { fontSize: '13px', color: '#88aaff', stroke: '#000', strokeThickness: 2 })
      .setOrigin(0.5);

    this.portal = this.add.container(px, py, [gfx, label]).setDepth(8);

    this.tweens.add({
      targets: this.portal,
      alpha: 0.6,
      duration: 700,
      yoyo: true,
      repeat: -1,
    });

    addPortalSparkle(this, px, py);

    this.showStatusMessage('Portal opened! Proceed to next floor!', '#88aaff');
    SaveService.save();
  }

  private setupInput() {
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      const wx = ptr.worldX;
      const wy = ptr.worldY;

      // Check item pickups
      for (const drop of this.itemDrops) {
        if (drop.picked) continue;
        const dist = Phaser.Math.Distance.Between(wx, wy, drop.x, drop.y);
        if (dist < 24) {
          this.pickupItem(drop);
          return;
        }
      }

      // Check portal click
      if (this.portal) {
        const dist = Phaser.Math.Distance.Between(wx, wy, this.portal.x, this.portal.y);
        if (dist < 48) {
          this.advanceFloor();
          return;
        }
      }

      // Move to position
      this.player.setMoveTarget(wx, wy);
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
    this.input.keyboard?.on('keydown-T', () => {
      this.returnToTown();
    });

    (['ONE', 'TWO', 'THREE', 'FOUR'] as const).forEach((key, slot) => {
      this.input.keyboard?.on(`keydown-${key}`, () => this.useSkill(slot));
    });

    // Bridge for on-screen mobile skill buttons (React HUD has no direct scene access)
    const onUseSkillEvent = (slot: number) => this.useSkill(slot);
    gameEvents.on('use-skill', onUseSkillEvent);
    this.events.once('shutdown', () => gameEvents.off('use-skill', onUseSkillEvent));
  }

  private setupHUD() {
    this.floorText = this.add.text(16, 16, `Floor ${this.floor}`, {
      fontSize: '20px', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
    }).setScrollFactor(0).setDepth(100);

    this.statusText = this.add.text(
      this.scale.width / 2, 40, '', {
        fontSize: '16px', color: '#ffff88', stroke: '#000', strokeThickness: 3,
      },
    ).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100);

    const townBtn = this.add.text(this.scale.width - 16, 16, 'Town [T]', {
      fontSize: '14px', color: '#ffffff', backgroundColor: '#222244', padding: { x: 8, y: 4 },
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(100).setInteractive({ useHandCursor: true });

    townBtn.on('pointerdown', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
      this.returnToTown();
      event.stopPropagation();
    });
  }

  private returnToTown() {
    SaveService.save();
    this.scene.start('TownScene');
  }

  private showStatusMessage(msg: string, color = '#ffff88') {
    this.statusText.setText(msg);
    this.statusText.setColor(color);
    this.time.delayedCall(3000, () => {
      if (this.statusText) this.statusText.setText('');
    });
  }

  private spawnFloatingText(x: number, y: number, text: string, color: string) {
    const t = this.add.text(x, y, text, {
      fontSize: '16px', color, stroke: '#000', strokeThickness: 3, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(50);

    this.combatTexts.push(t);
    this.tweens.add({
      targets: t,
      y: y - 60,
      alpha: 0,
      duration: 900,
      onComplete: () => {
        this.combatTexts = this.combatTexts.filter((c) => c !== t);
        t.destroy();
      },
    });
  }

  private isInsideObstacle(x: number, y: number, margin = 0): boolean {
    for (const obs of this.obstacles) {
      if (
        x > obs.x - obs.w / 2 - margin &&
        x < obs.x + obs.w / 2 + margin &&
        y > obs.y - obs.h / 2 - margin &&
        y < obs.y + obs.h / 2 + margin
      ) return true;
    }
    return false;
  }

  private clampToRoom(x: number, y: number): { x: number; y: number } {
    return {
      x: Phaser.Math.Clamp(x, WALL + 20, WORLD_W - WALL - 20),
      y: Phaser.Math.Clamp(y, WALL + 20, WORLD_H - WALL - 20),
    };
  }

  private handlePlayerAttack() {
    const target = this.player.targetMonsterRef;
    if (!target || target.isDead()) return;

    const pState = usePlayerStore.getState();
    const result = resolveAttack({
      attack: pState.attack,
      accuracy: pState.accuracy,
      critChance: pState.critChance,
      defense: target.defense,
      evasion: target.evasion,
    });

    if (!result.hit) {
      this.spawnFloatingText(target.x, target.y - 20, 'MISS', '#aaaaaa');
      return;
    }

    const killed = target.takeDamage(result.damage);
    const color = result.isCrit ? '#ffdd00' : '#ffffff';
    const label = result.isCrit ? `${result.damage}!` : `${result.damage}`;
    this.spawnFloatingText(target.x, target.y - 20, label, color);

    if (killed) {
      this.onMonsterDied(target);
    }
  }

  private useSkill(slotIndex: number) {
    const pState = usePlayerStore.getState();
    const skillId = pState.equippedSkills[slotIndex];
    if (!skillId) return;

    const skill = SKILL_DATA.find((sk) => sk.id === skillId);
    if (!skill) return;

    if (!useSkillStore.getState().isReady(skillId)) {
      this.spawnFloatingText(this.player.x, this.player.y - 40, 'Not Ready', '#888888');
      return;
    }

    if (skill.target === 'self') {
      if (!usePlayerStore.getState().spendMana(skill.manaCost)) {
        this.spawnFloatingText(this.player.x, this.player.y - 40, 'No Mana', '#6688ff');
        return;
      }
      useSkillStore.getState().setCooldown(skillId, skill.cooldown);
      const healAmount = Math.floor(pState.maxHp * (skill.healPercent ?? 0));
      usePlayerStore.getState().heal(healAmount);
      this.spawnFloatingText(this.player.x, this.player.y - 30, `+${healAmount}`, '#66ff88');
      this.showStatusMessage(`${skill.name}!`, '#66ff88');
      return;
    }

    if (skill.target === 'aoe') {
      const range = skill.range ?? 160;
      const targets = this.monsters.filter(
        (m) => !m.isDead() && Phaser.Math.Distance.Between(this.player.x, this.player.y, m.x, m.y) <= range,
      );
      if (targets.length === 0) {
        this.spawnFloatingText(this.player.x, this.player.y - 40, 'No Target', '#888888');
        return;
      }
      if (!usePlayerStore.getState().spendMana(skill.manaCost)) {
        this.spawnFloatingText(this.player.x, this.player.y - 40, 'No Mana', '#6688ff');
        return;
      }
      useSkillStore.getState().setCooldown(skillId, skill.cooldown);
      addSkillBurst(this, this.player.x, this.player.y, 0x66ddff, range);
      for (const target of targets) {
        this.resolveSkillHit(target, skill.multiplier);
      }
      this.showStatusMessage(`${skill.name}!`, '#66ddff');
      return;
    }

    // Single-target skill
    const target = this.player.targetMonsterRef;
    if (!target || target.isDead()) {
      this.spawnFloatingText(this.player.x, this.player.y - 40, 'No Target', '#888888');
      return;
    }
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, target.x, target.y);
    if (dist > this.player.attackRange) {
      this.spawnFloatingText(this.player.x, this.player.y - 40, 'Out of Range', '#888888');
      return;
    }
    if (!usePlayerStore.getState().spendMana(skill.manaCost)) {
      this.spawnFloatingText(this.player.x, this.player.y - 40, 'No Mana', '#6688ff');
      return;
    }
    useSkillStore.getState().setCooldown(skillId, skill.cooldown);

    let multiplier = skill.multiplier;
    if (skill.executeThreshold && target.hp / target.maxHp <= skill.executeThreshold) {
      multiplier += skill.executeBonusMultiplier ?? 0;
    }
    this.resolveSkillHit(target, multiplier);
    this.showStatusMessage(`${skill.name}!`, '#ffaa44');
  }

  private resolveSkillHit(target: MonsterEntity, multiplier: number) {
    const pState = usePlayerStore.getState();
    const result = resolveAttack({
      attack: pState.attack,
      skillMultiplier: multiplier,
      accuracy: pState.accuracy,
      critChance: pState.critChance,
      defense: target.defense,
      evasion: target.evasion,
    });

    if (!result.hit) {
      this.spawnFloatingText(target.x, target.y - 20, 'MISS', '#aaaaaa');
      return;
    }

    const killed = target.takeDamage(result.damage);
    const color = result.isCrit ? '#ffdd00' : '#ffcc66';
    const label = result.isCrit ? `${result.damage}!` : `${result.damage}`;
    this.spawnFloatingText(target.x, target.y - 20, label, color);

    if (killed) {
      this.onMonsterDied(target);
    }
  }

  private handleMonsterAttack(monster: MonsterEntity) {
    const pState = usePlayerStore.getState();
    const result = resolveAttack({
      attack: monster.attack,
      accuracy: monster.accuracy,
      critChance: 3,
      defense: pState.defense,
      evasion: pState.evasion,
    });

    if (!result.hit) {
      this.spawnFloatingText(this.player.x, this.player.y - 30, 'EVADE', '#88ffff');
      return;
    }

    usePlayerStore.getState().takeDamage(result.damage);
    this.player.flash(0xff4444);
    this.spawnFloatingText(this.player.x, this.player.y - 30, `-${result.damage}`, '#ff4444');

    if (usePlayerStore.getState().hp <= 0) {
      this.onPlayerDied();
    }
  }

  private onMonsterDied(monster: MonsterEntity) {
    const pState = usePlayerStore.getState();
    const prevLevel = pState.level;

    useDungeonStore.getState().incrementKills();
    usePlayerStore.getState().gainExp(monster.expReward);
    usePlayerStore.getState().gainGold(monster.goldReward);

    if (usePlayerStore.getState().level > prevLevel) {
      this.spawnFloatingText(this.player.x, this.player.y - 50, 'LEVEL UP!', '#ffff00');
      SaveService.save();
    }

    // Loot drop
    if (Math.random() < 0.3) {
      const item = generateItem(this.floor);
      const drop = new ItemDropEntity(this, monster.x, monster.y + 10, item);
      this.itemDrops.push(drop);
    }

    if (this.player.targetMonsterRef === monster) {
      this.player.setTargetMonster(null);
    }

    monster.die();
    this.deadCount++;

    const aliveNonBoss = this.monsters.filter((m) => !m.isDead() && m.variant !== 'boss');
    if (!this.bossSpawned && aliveNonBoss.length === 0 && this.deadCount >= Math.floor(this.monsterCount * 0.8)) {
      this.bossSpawned = true;
      this.time.delayedCall(500, () => this.spawnBoss());
    }

    const aliveAll = this.monsters.filter((m) => !m.isDead());
    if (this.bossSpawned && aliveAll.length === 0 && !this.portalSpawned) {
      this.time.delayedCall(800, () => this.spawnPortal());
    }
  }

  private onPlayerDied() {
    this.add.rectangle(this.scale.width / 2, this.scale.height / 2, 400, 120, 0x000000, 0.85)
      .setScrollFactor(0).setDepth(200);
    this.add.text(this.scale.width / 2, this.scale.height / 2 - 20, 'YOU DIED', {
      fontSize: '36px', color: '#ff3333', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
    this.add.text(this.scale.width / 2, this.scale.height / 2 + 24, 'Returning to town...', {
      fontSize: '16px', color: '#aaaaaa',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201);

    this.time.delayedCall(2500, () => {
      usePlayerStore.getState().fullHeal();
      useDungeonStore.getState().setFloor(1);
      this.scene.start('TownScene');
    });
  }

  private advanceFloor() {
    const nextFloor = this.floor + 1;
    useDungeonStore.getState().setFloor(nextFloor);
    SaveService.save();
    this.scene.restart({ floor: nextFloor });
  }

  private pickupItem(drop: ItemDropEntity) {
    if (drop.picked) return;
    const pState = usePlayerStore.getState();
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, drop.x, drop.y);
    if (dist > 120) {
      this.player.setMoveTarget(drop.x, drop.y);
      return;
    }
    drop.pickup();
    this.itemDrops = this.itemDrops.filter((d) => d !== drop);
    useInventoryStore.getState().addItem(drop.item);
    this.spawnFloatingText(drop.x, drop.y - 10, `+${drop.item.name}`, '#ffd700');
    void pState;
  }

  update(_time: number, delta: number) {
    if (!this.player || usePlayerStore.getState().hp <= 0) return;

    // Update player
    this.player.update(delta, () => this.handlePlayerAttack());

    // Clamp player to room
    const clamped = this.clampToRoom(this.player.x, this.player.y);
    this.player.x = clamped.x;
    this.player.y = clamped.y;

    // Check auto-pickup (walk near items)
    for (const drop of this.itemDrops) {
      if (drop.picked) continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, drop.x, drop.y);
      if (dist < 40) {
        this.pickupItem(drop);
      }
    }

    // Update monsters
    for (const monster of this.monsters) {
      if (monster.isDead()) continue;
      monster.update(delta, this.player.x, this.player.y, () => this.handleMonsterAttack(monster));
    }

    // Check portal proximity
    if (this.portal) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.portal.x, this.portal.y);
      if (dist < 60) {
        this.advanceFloor();
      }
    }

    // Update HUD
    const pState = usePlayerStore.getState();
    this.floorText.setText(`Floor ${this.floor}  |  Lv.${pState.level}  |  Gold: ${pState.gold}`);

    // Passive mana regen, boosted by Energy
    const regenPerSecond = 2 + pState.attributes.energy * 0.3;
    pState.regenMana((regenPerSecond * delta) / 1000);
  }
}

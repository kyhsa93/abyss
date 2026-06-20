export class Monster {
  hp = 30;
  maxHp = 30;
  attack = 5;

  constructor(
    public x: number,
    public y: number,
  ) {}

  isDead() {
    return this.hp <= 0;
  }
}

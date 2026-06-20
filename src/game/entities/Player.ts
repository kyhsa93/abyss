export class Player {
  level = 1;
  exp = 0;
  hp = 100;
  maxHp = 100;
  attack = 10;

  x = 0;
  y = 0;

  moveTo(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

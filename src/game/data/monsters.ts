import { MonsterBase } from '../../types';

export const MONSTER_DATA: MonsterBase[] = [
  {
    id: 'slime',
    name: 'Slime',
    baseHp: 30,
    baseAttack: 4,
    baseDefense: 1,
    baseAccuracy: 40,
    baseEvasion: 5,
    baseExp: 10,
    baseGold: 3,
    color: 0x44ff44,
    radius: 12,
  },
  {
    id: 'goblin',
    name: 'Goblin',
    baseHp: 50,
    baseAttack: 8,
    baseDefense: 3,
    baseAccuracy: 55,
    baseEvasion: 12,
    baseExp: 18,
    baseGold: 6,
    color: 0xaaff55,
    radius: 13,
  },
  {
    id: 'skeleton',
    name: 'Skeleton',
    baseHp: 70,
    baseAttack: 12,
    baseDefense: 5,
    baseAccuracy: 60,
    baseEvasion: 8,
    baseExp: 28,
    baseGold: 10,
    color: 0xddddcc,
    radius: 14,
  },
];

export const BOSS_DATA: MonsterBase = {
  id: 'boss',
  name: 'Abyss Guardian',
  baseHp: 300,
  baseAttack: 20,
  baseDefense: 10,
  baseAccuracy: 70,
  baseEvasion: 10,
  baseExp: 150,
  baseGold: 80,
  color: 0xaa00ff,
  radius: 28,
};

export function scaleMonster(base: MonsterBase, floor: number, variant: 'normal' | 'elite' | 'boss') {
  const floorMult = floor - 1;
  let hp = Math.floor(base.baseHp * (1 + floorMult * 0.08));
  let attack = Math.floor(base.baseAttack * (1 + floorMult * 0.05));
  const defense = Math.floor(base.baseDefense * (1 + floorMult * 0.04));
  const exp = Math.floor(base.baseExp * (1 + floorMult * 0.06));
  const gold = Math.floor(base.baseGold * (1 + floorMult * 0.05));

  if (variant === 'elite') {
    hp = Math.floor(hp * 5);
    attack = Math.floor(attack * 2);
  } else if (variant === 'boss') {
    hp = Math.floor(hp * 20);
  }

  return { hp, attack, defense, exp, gold };
}

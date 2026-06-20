export interface AttackParams {
  attack: number;
  skillMultiplier?: number;
  accuracy: number;
  critChance: number;
  defense: number;
  evasion: number;
  resistance?: number;
}

export interface AttackResult {
  hit: boolean;
  damage: number;
  isCrit: boolean;
}

export function resolveAttack(params: AttackParams): AttackResult {
  const {
    attack,
    skillMultiplier = 1,
    accuracy,
    critChance,
    defense,
    evasion,
    resistance = 0,
  } = params;

  const rawHitChance = accuracy / (accuracy + evasion);
  const hitChance = Math.min(0.95, Math.max(0.05, rawHitChance));

  if (Math.random() > hitChance) {
    return { hit: false, damage: 0, isCrit: false };
  }

  const isCrit = Math.random() < critChance / 100;
  let damage = Math.max(1, Math.floor(attack * skillMultiplier - defense));
  if (isCrit) damage = Math.floor(damage * 2);

  const cappedResistance = Math.min(0.75, Math.max(0, resistance));
  damage = Math.max(1, Math.floor(damage * (1 - cappedResistance)));

  return { hit: true, damage, isCrit };
}

export function requiredExp(level: number): number {
  return Math.floor(100 * Math.pow(1.15, level));
}

export function expToNextLevel(level: number, currentExp: number): number {
  return requiredExp(level) - currentExp;
}

export function expPercent(level: number, currentExp: number): number {
  return Math.min(1, currentExp / requiredExp(level));
}

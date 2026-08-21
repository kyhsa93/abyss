import type { Actor } from './types'

/**
 * Something you pick up on the way down, and lose at the bottom.
 *
 * The rest of this game refuses power growth on purpose: what improves between
 * attempts is the player, and a character sheet that creeps upward turns a
 * fight you failed into a fight you wait out. A descent is the one place that
 * argument does not apply, because the whole run is one attempt — a boon is
 * strong for the next twenty minutes and gone the moment you die, so it can be
 * felt without ever being banked.
 *
 * Three offered per floor, one taken. What makes them a decision rather than a
 * queue is that they are not interchangeable: the same floor is a different
 * problem depending on whether you took health, damage or a shorter cooldown.
 */
export type BoonId =
  | 'vigour'
  | 'edge'
  | 'mending'
  | 'quickstep'
  | 'readiness'
  | 'thrift'
  | 'ward'
  | 'fervour'

export interface Boon {
  id: BoonId
  name: string
  detail: string
}

export const BOONS: Boon[] = [
  { id: 'vigour', name: 'Vigour', detail: 'the whole party has a tenth more health' },
  { id: 'edge', name: 'Edge', detail: 'everything the party deals hits 12% harder' },
  { id: 'mending', name: 'Mending', detail: 'healing lands for 18% more' },
  { id: 'quickstep', name: 'Quickstep', detail: 'the party moves a tenth faster' },
  { id: 'readiness', name: 'Readiness', detail: 'cooldowns come back 15% sooner' },
  { id: 'thrift', name: 'Thrift', detail: 'abilities cost a fifth less' },
  { id: 'ward', name: 'Ward', detail: 'the party takes 8% less of everything' },
  { id: 'fervour', name: 'Fervour', detail: 'crits land half again as often' },
]

export function boonById(id: BoonId): Boon | undefined {
  return BOONS.find((b) => b.id === id)
}

/** How many of a boon are held. They stack: taking Edge twice is 24%. */
export function stacksOf(held: BoonId[], id: BoonId): number {
  return held.filter((b) => b === id).length
}

export function boonHealth(held: BoonId[]): number {
  return 1 + stacksOf(held, 'vigour') * 0.1
}

export function boonDamage(held: BoonId[]): number {
  return 1 + stacksOf(held, 'edge') * 0.12
}

export function boonHealing(held: BoonId[]): number {
  return 1 + stacksOf(held, 'mending') * 0.18
}

export function boonSpeed(held: BoonId[]): number {
  return 1 + stacksOf(held, 'quickstep') * 0.1
}

export function boonCooldown(held: BoonId[]): number {
  // Multiplied into how fast cooldowns tick down, so it can never divide by
  // zero however many are stacked.
  return 1 + stacksOf(held, 'readiness') * 0.15
}

export function boonCost(held: BoonId[]): number {
  return Math.max(0.3, 1 - stacksOf(held, 'thrift') * 0.2)
}

export function boonMitigation(held: BoonId[]): number {
  return Math.max(0.4, 1 - stacksOf(held, 'ward') * 0.08)
}

export function boonCrit(held: BoonId[]): number {
  return 1 + stacksOf(held, 'fervour') * 0.5
}

/**
 * Three to choose from, drawn without repeating within an offer.
 *
 * Deterministic from the floor and the run's seed, so the same descent offers
 * the same choices — a run that reshuffles when you back out of the screen is
 * a run that rewards backing out of the screen.
 */
export function offerFor(seed: number, floor: number): BoonId[] {
  const pool = [...BOONS]
  const picked: BoonId[] = []
  let n = (seed ^ (floor * 2654435761)) >>> 0
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    n = (n * 1664525 + 1013904223) >>> 0
    const at = n % pool.length
    picked.push(pool[at]!.id)
    pool.splice(at, 1)
  }
  return picked
}

/** Applied to a fresh actor when a floor starts. */
export function applyBoons(actor: Actor, held: BoonId[]): void {
  if (actor.faction !== 'party') return
  const health = boonHealth(held)
  actor.maxHp = Math.round(actor.maxHp * health)
  actor.hp = Math.min(actor.hp, actor.maxHp)
  actor.moveSpeed = Math.round(actor.moveSpeed * boonSpeed(held))
}

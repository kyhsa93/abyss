// Whether the player is playing or watching.
//
// This game's promise is that the party reads as people and the fight is
// learned by repeating it. Both of those assume the player's own slot decides
// something. Nothing here has ever measured that: every table in the harness
// is a raid with the player's slot driven by a scripted stand-in, so what they
// report is how the *fight* is doing, not how much of it is yours.
//
// Four hands on the same slot, same seeds, same everybody else:
//
//   idle     stands still, presses nothing
//   dodge    walks out of what is under it, presses nothing
//   press    presses on a fixed cadence, never moves
//   both     the harness's stand-in: dodges and presses
//   ai       the party AI plays it, which is the ceiling this game aims at
//
// The gap between `idle` and `both` is the size of the player.
import { Rng } from '../src/sim/rng'
import { createState, unattended } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { ENCOUNTERS, encounterAt } from '../src/sim/encounters'
import { autoParty, pickFor, specOf, type ClassId, type DifficultyId, type Pick, type RaidSize } from '../src/sim/classes'
import type { PlayerInput, SimState } from '../src/sim/types'

const dps = (classId: Pick['classId']): Pick => pickFor(classId, 'dps')!
type Hand = 'idle' | 'dodge' | 'press' | 'both' | 'greedy' | 'oracle' | 'ai'

function inputFor(hand: Hand, s: SimState, ticks: number): PlayerInput {
  const pressed: number[] = []
  if (hand !== 'idle' && hand !== 'dodge') {
    if (ticks % 45 === 0) pressed.push(0)
    if (ticks % 360 === 0) pressed.push(1)
    if (ticks % 540 === 0) pressed.push(2)
  }
  if (hand === 'idle' || hand === 'press') return { moveX: 0, moveY: 0, pressed }
  const p = s.actors.find((a) => a.isPlayer)
  if (!p) return { moveX: 0, moveY: 0, pressed }
  let moveX = 0
  let moveY = 0
  for (const g of s.ground) {
    const d = Math.hypot(p.pos.x - g.pos.x, p.pos.y - g.pos.y)
    if (d <= g.radius + 20) {
      moveX += (p.pos.x - g.pos.x) / (d || 1)
      moveY += (p.pos.y - g.pos.y) / (d || 1)
    }
  }
  return { moveX, moveY, pressed }
}

/**
 * When a raid-wide hit lands, found by running the pull once.
 *
 * The simulation is deterministic, which is what makes an oracle possible at
 * all: the same seed lands the same hits at the same seconds, so a first pass
 * can write down where they were and a second can spend the raid's cooldowns
 * on the biggest of them. It is an approximation — softening a hit changes who
 * lives and therefore what the rest of the pull looks like — and it is
 * approximate in the conservative direction, which is what an upper bound
 * wants to be.
 */
function biggestMoments(seed: number, e: number, party: Pick[]): number[] {
  const s = createState(seed, ATTEMPT, party, DIFF, e)
  s.countdown = 0
  const rng = new Rng(seed + ATTEMPT * 7919)
  const moments: { at: number; lost: number }[] = []
  const before = new Map<number, number>()
  let ticks = 0
  while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
    for (const a of s.actors) before.set(a.id, a.hp)
    const at = s.time
    step(s, inputFor('both', s, ticks), rng)
    ticks++
    let lost = 0
    for (const a of s.actors) {
      if (a.faction !== 'party') continue
      lost += Math.max(0, (before.get(a.id) ?? a.hp) - a.hp)
    }
    if (lost > 0) moments.push({ at, lost })
  }
  // Biggest first, and never two inside one window: a cooldown already open
  // covers the hit on its heels for free, so spending a second on it is the
  // waste the oracle exists not to make.
  moments.sort((a, b) => b.lost - a.lost)
  const picked: number[] = []
  for (const m of moments) {
    if (picked.some((p) => Math.abs(p - m.at) < 8)) continue
    picked.push(m.at)
    // No cap worth having: an oracle that skips a moment it could still
    // have covered is not an upper bound on anything. The 8s spacing is the
    // only limit, and it is the real one.
    if (picked.length >= 30) break
  }
  return picked.sort((a, b) => a - b)
}

/** Which classes are in this roster and could be asked for something. */
function callable(s: SimState): ClassId[] {
  const out = new Set<ClassId>()
  for (const a of s.actors) {
    if (a.faction !== 'party' || !a.alive) continue
    const id = specOf({ classId: a.classId, spec: a.spec }).abilities.raid
    if (id && (a.cooldowns[id] ?? 0) <= 0 && !a.castId) out.add(a.classId)
  }
  return [...out]
}

const RUNS = Number(process.argv[6] ?? 24)
const [, , sizeArg, diffArg, attemptArg] = process.argv
const SIZE = Number(sizeArg ?? 10) as RaidSize
const DIFF = (diffArg ?? 'normal') as DifficultyId
const ATTEMPT = Number(attemptArg ?? 8)
const party = autoParty(SIZE, dps('mage'))
const HANDS: Hand[] = ['both', 'greedy', 'oracle']

console.log(`${SIZE}-player ${DIFF}, pull ${ATTEMPT + 1}, ${RUNS} pulls a cell`)
console.log('  won% / raid died%')
console.log('boss'.padEnd(14) + HANDS.map((h) => h.padStart(9)).join('') + '   timing worth')

for (let e = 0; e < ENCOUNTERS.length; e++) {
  const wins: Record<Hand, number> = { idle: 0, dodge: 0, press: 0, both: 0, greedy: 0, oracle: 0, ai: 0 }
  // Win rate has no room left in a cell that already wins nearly always, and
  // most of the ladder is such a cell. What a lever moves there shows up in
  // how many bodies it took to get through, which always has room.
  const deaths: Record<Hand, number> = { idle: 0, dodge: 0, press: 0, both: 0, greedy: 0, oracle: 0, ai: 0 }
  for (const hand of HANDS) {
    for (let n = 0; n < RUNS; n++) {
      const seed = 1000 + n * 137
      let s = createState(seed, ATTEMPT, party, DIFF, e)
      if (hand === 'ai') s = unattended(s, ATTEMPT)
      s.countdown = 0
      const rng = new Rng(seed + ATTEMPT * 7919)
      let ticks = 0
      // A moment is worth a call a beat before it lands, not on it: half of
      // these soften a hit and a shield called after one is a shield spent on
      // nothing.
      const wanted = hand === 'oracle' ? biggestMoments(seed, e, party) : []
      let next = 0
      while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
        const input = inputFor(hand, s, ticks)
        if (hand === 'greedy') {
          input.call = callable(s)[0] ?? null
        } else if (hand === 'oracle') {
          while (next < wanted.length && wanted[next]! < s.time - 0.5) next++
          const due = next < wanted.length && wanted[next]! - s.time <= 1.2
          if (due) {
            const ready = callable(s)
            if (ready.length > 0) {
              input.call = ready[0]!
              next++
            }
          }
        }
        step(s, input, rng)
        ticks++
      }
      if (s.outcome === 'victory') wins[hand]++
      const bodies = s.actors.filter((a) => a.faction === 'party')
      deaths[hand] += bodies.filter((a) => !a.alive).length / bodies.length
    }
  }
  const cell = (h: Hand) =>
    `${Math.round((wins[h] / RUNS) * 100)}/${Math.round((deaths[h] / RUNS) * 100)}`.padStart(9)
  // What the timing is worth: bodies the oracle saved that pressing on
  // cooldown did not.
  const gap = Math.round(((deaths.greedy - deaths.oracle) / RUNS) * 100)
  console.log(
    ENCOUNTERS[e]!.short.padEnd(14) +
      HANDS.map(cell).join('') +
      `   ${gap >= 0 ? '+' : ''}${gap}pp`.padStart(11),
  )
}

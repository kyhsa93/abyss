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
import { autoParty, pickFor, type DifficultyId, type Pick, type RaidSize } from '../src/sim/classes'
import type { PlayerInput, SimState } from '../src/sim/types'

const dps = (classId: Pick['classId']): Pick => pickFor(classId, 'dps')!
type Hand = 'idle' | 'dodge' | 'press' | 'both' | 'ai'

function inputFor(hand: Hand, s: SimState, ticks: number): PlayerInput {
  const pressed: number[] = []
  if (hand === 'press' || hand === 'both') {
    if (ticks % 45 === 0) pressed.push(0)
    if (ticks % 360 === 0) pressed.push(1)
    if (ticks % 540 === 0) pressed.push(2)
  }
  if (hand !== 'dodge' && hand !== 'both') return { moveX: 0, moveY: 0, pressed }
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

const RUNS = Number(process.argv[6] ?? 24)
const [, , sizeArg, diffArg, attemptArg] = process.argv
const SIZE = Number(sizeArg ?? 10) as RaidSize
const DIFF = (diffArg ?? 'normal') as DifficultyId
const ATTEMPT = Number(attemptArg ?? 8)
const HANDS: Hand[] = ['idle', 'dodge', 'press', 'both', 'ai']

console.log(`${SIZE}-player ${DIFF}, pull ${ATTEMPT + 1}, ${RUNS} pulls a cell`)
console.log('  won% / raid died%')
console.log('boss'.padEnd(14) + HANDS.map((h) => h.padStart(9)).join('') + '   idle→both')

for (let e = 0; e < ENCOUNTERS.length; e++) {
  const wins: Record<Hand, number> = { idle: 0, dodge: 0, press: 0, both: 0, ai: 0 }
  // Win rate has no room left in a cell that already wins nearly always, and
  // most of the ladder is such a cell. What a lever moves there shows up in
  // how many bodies it took to get through, which always has room.
  const deaths: Record<Hand, number> = { idle: 0, dodge: 0, press: 0, both: 0, ai: 0 }
  for (const hand of HANDS) {
    for (let n = 0; n < RUNS; n++) {
      const seed = 1000 + n * 137
      let s = createState(seed, ATTEMPT, autoParty(SIZE, dps('mage')), DIFF, e)
      if (hand === 'ai') s = unattended(s, ATTEMPT)
      s.countdown = 0
      const rng = new Rng(seed + ATTEMPT * 7919)
      let ticks = 0
      while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
        step(s, inputFor(hand, s, ticks), rng)
        ticks++
      }
      if (s.outcome === 'victory') wins[hand]++
      const party = s.actors.filter((a) => a.faction === 'party')
      deaths[hand] += party.filter((a) => !a.alive).length / party.length
    }
  }
  const cell = (h: Hand) =>
    `${Math.round((wins[h] / RUNS) * 100)}/${Math.round((deaths[h] / RUNS) * 100)}`.padStart(9)
  const gap = Math.round(((wins.both - wins.idle) / RUNS) * 100)
  console.log(
    ENCOUNTERS[e]!.short.padEnd(14) +
      HANDS.map(cell).join('') +
      `   ${gap >= 0 ? '+' : ''}${gap}pp`.padStart(11),
  )
}

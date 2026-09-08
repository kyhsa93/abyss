// What is actually billing a raid, and whether its answers are being made.
//
// `cellprobe` says a cell reads 53% and nothing about why. This says what the
// health went to, mechanic by mechanic, and how each pull ended -- a wipe at
// two hundred seconds with the boss at five percent and a wipe at forty with
// it at ninety are the same number in a win column and two different bugs.
//
// It also counts the one thing a win rate cannot show: how often a mechanic
// with an answer actually got one. A wound that is always closed costs
// nothing and a wound that is never closed is a bill rather than a mechanic,
// and both of those read as "some damage happened" everywhere else.
//
//   npx tsx scripts/billprobe.ts <encounter> [size] [difficulty] [runs]
import { Rng } from '../src/sim/rng'
import { createState } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { encounterAt } from '../src/sim/encounters'
import { autoParty, pickFor, type DifficultyId, type RaidSize } from '../src/sim/classes'
import type { AuraId, PlayerInput, SimState } from '../src/sim/types'

/**
 * The same player the harness runs, which is not a detail.
 *
 * A pull with nobody in the player's slot is a pull a raid size short of
 * damage, and it loses fights that are fine -- read once as a fight killing
 * everybody when what it was doing was running out of clock.
 */
function playerInput(s: SimState, pressed: number[]): PlayerInput {
  const p = s.actors.find((a) => a.isPlayer)!
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
 * The marks whose whole point is that somebody takes them off early.
 *
 * Only the ones answered by *removal*. A spill is answered by walking and goes
 * off either way, so counting it here would report a mechanic working
 * perfectly as a mechanic nobody ever answers.
 */
const ANSWERED: AuraId[] = ['festering']

const [, , encArg, sizeArg, diffArg, runsArg] = process.argv
const encounter = Number(encArg ?? 3)
const size = Number(sizeArg ?? 10) as RaidSize
const difficulty = (diffArg ?? 'heroic') as DifficultyId
const RUNS = Number(runsArg ?? 12)

const party = autoParty(size, pickFor('mage', 'dps')!)
const bill: Record<string, number> = {}
const held = new Map<string, number>()
const early: Record<string, number> = {}
const term: Record<string, number> = {}
const outcomes: string[] = []
let deaths = 0
let gauge = 0
let ticks = 0
let wins = 0

for (let n = 0; n < RUNS; n++) {
  const seed = 1000 + n * 137
  const s = createState(seed, 0, party, difficulty, encounter)
  s.countdown = 0
  const rng = new Rng(seed)
  let t = 0
  while (s.outcome === 'ongoing' && s.time < encounterAt(encounter).enrage + 60) {
    const pressed: number[] = []
    if (t % 45 === 0) pressed.push(0)
    if (t % 360 === 0) pressed.push(1)
    if (t % 540 === 0) pressed.push(2)
    step(s, playerInput(s, pressed), rng)
    for (const a of s.actors) {
      for (const id of ANSWERED) {
        const key = `${id}:${a.id}`
        const mark = a.auras.find((au) => au.id === id)
        if (mark) held.set(key, mark.remaining)
        else if (held.has(key)) {
          // Half a second of slack: an aura removed on the tick it would have
          // expired anyway is not an answer, it is arithmetic.
          if (held.get(key)! > 0.5) early[id] = (early[id] ?? 0) + 1
          else term[id] = (term[id] ?? 0) + 1
          held.delete(key)
        }
      }
    }
    gauge += s.gauge
    ticks++
    t++
  }
  const boss = s.actors.find((a) => a.faction === 'boss')!
  outcomes.push(`${s.outcome}@${s.time.toFixed(0)}s boss ${Math.round((boss.hp / boss.maxHp) * 100)}%`)
  if (s.outcome === 'victory') wins++
  for (const tally of Object.values(s.tally)) {
    for (const [id, hits] of Object.entries(tally.byMechanic)) {
      bill[id] = (bill[id] ?? 0) + (hits as number)
    }
  }
  deaths += s.actors.filter((a) => a.faction === 'party' && !a.alive).length
}

console.log(
  `${encounterAt(encounter).short} ${size} ${difficulty}: ` +
    `${Math.round((wins / RUNS) * 100)}% won, ${(deaths / RUNS).toFixed(1)} dead a pull, ` +
    `gauge ${(gauge / ticks).toFixed(2)} on average`,
)
console.log('  ' + outcomes.join(' | '))
for (const [id, hits] of Object.entries(bill).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${id.padEnd(12)} ${(hits / RUNS).toFixed(1)} hits a pull`)
}
for (const id of ANSWERED) {
  const answered = (early[id] ?? 0) / RUNS
  const ran = (term[id] ?? 0) / RUNS
  if (answered + ran === 0) continue
  console.log(`  ${id.padEnd(12)} ${answered.toFixed(1)} answered, ${ran.toFixed(1)} ran to term`)
}

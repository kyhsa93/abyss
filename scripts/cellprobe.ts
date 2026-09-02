// One row of the harness's size/difficulty table, on its own.
//
// The harness costs an hour and prints the whole game. When a change moves one
// cell of it, that hour is spent re-reading twenty-nine cells that did not
// move, and the loop between a guess and its answer is long enough that the
// guessing gets sloppy. This is the same forty pulls at the same two attempts
// with the same seeds, for whichever cells are asked for — a minute instead of
// an hour — and it prints the death rate beside the win rate, because a cell
// that lost ten points of win rate has a reason and the reason is usually
// visible there.
//
// It is not a substitute for the harness: the bands are checked against the
// full run, and a change is not finished until that has been read.
//
//   npx tsx scripts/cellprobe.ts <encounter> <size> <difficulty>
import { Rng } from '../src/sim/rng'
import { createState } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { ENCOUNTERS, encounterAt } from '../src/sim/encounters'
import { autoParty, pickFor, type DifficultyId, type Pick, type RaidSize } from '../src/sim/classes'
import type { PlayerInput, SimState } from '../src/sim/types'

const dps = (classId: Pick['classId']): Pick => pickFor(classId, 'dps')!

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

function run(seed: number, attempt: number, party: Pick[], difficulty: DifficultyId, encounter: number) {
  const s = createState(seed, attempt, party, difficulty, encounter, null, 0)
  s.countdown = 0
  const rng = new Rng(seed + attempt * 7919)
  let ticks = 0
  while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
    const pressed: number[] = []
    if (ticks % 45 === 0) pressed.push(0)
    if (ticks % 360 === 0) pressed.push(1)
    if (ticks % 540 === 0) pressed.push(2)
    step(s, playerInput(s, pressed), rng)
    ticks++
  }
  const party0 = s.actors.filter((a) => a.faction === 'party')
  return {
    won: s.outcome === 'victory',
    deaths: party0.filter((a) => !a.alive).length / party0.length,
  }
}

const SIZE_RUNS = 40
const [, , encArg, sizeArg, diffArg] = process.argv
const encs = encArg === undefined || encArg === 'all' ? ENCOUNTERS.map((_, i) => i) : [Number(encArg)]
const sizes = (sizeArg === undefined ? [5, 10, 25] : [Number(sizeArg)]) as RaidSize[]
const diffs = (diffArg === undefined ? ['normal', 'heroic'] : [diffArg]) as DifficultyId[]

for (const e of encs) {
  for (const size of sizes) {
    for (const difficulty of diffs) {
      const party = autoParty(size, dps('mage'))
      const cells: string[] = []
      for (const attempt of [0, 8]) {
        let wins = 0
        let deaths = 0
        for (let n = 0; n < SIZE_RUNS; n++) {
          const r = run(1000 + n * 137, attempt, party, difficulty, e)
          if (r.won) wins++
          deaths += r.deaths
        }
        cells.push(
          `${Math.round((wins / SIZE_RUNS) * 100)}%`.padEnd(6) +
            `(${Math.round((deaths / SIZE_RUNS) * 100)}% died)`.padEnd(13),
        )
      }
      console.log(`${ENCOUNTERS[e]!.short} ${size} ${difficulty}`.padEnd(26), cells.join(''))
    }
  }
}

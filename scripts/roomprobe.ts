// What the rooms a raid rolls actually look like, and whether anyone is stuck.
import { Rng } from '../src/sim/rng'
import { createState } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { inTerrain } from '../src/sim/battleground'
import { ENCOUNTERS, encounterAt } from '../src/sim/encounters'
import { autoParty, pickFor, type Pick, type RaidSize } from '../src/sim/classes'
import type { PlayerInput } from '../src/sim/types'

const dps = (classId: Pick['classId']): Pick => pickFor(classId, 'dps')!
function playerInput(): PlayerInput {
  return { moveX: 0, moveY: 0, pressed: [] }
}

const RUNS = 40
const counts: number[] = []
let stuckTicks = 0
let ticks = 0
for (let e = 0; e < ENCOUNTERS.length; e++) {
  for (let n = 0; n < RUNS; n++) {
    const seed = 1000 + n * 137
    const s = createState(seed, 8, autoParty(10 as RaidSize, dps('mage')), 'normal', e)
    s.countdown = 0
    counts.push(s.obstacles.length)
    const rng = new Rng(seed + 7919)
    while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
      step(s, playerInput(), rng)
      for (const a of s.actors) {
        if (!a.alive) continue
        ticks++
        // Nine tenths, so a body brushing a rock is not counted as inside it.
        if (inTerrain(s.obstacles, a.pos, a.radius * 0.9)) stuckTicks++
      }
    }
  }
}
const hist: Record<number, number> = {}
for (const c of counts) hist[c] = (hist[c] ?? 0) + 1
console.log('rocks a room:', Object.entries(hist).map(([k, v]) => `${k}: ${((v / counts.length) * 100).toFixed(0)}%`).join('  '))
console.log(`bodies inside a rock: ${((stuckTicks / ticks) * 100).toFixed(3)}% of body-ticks`)

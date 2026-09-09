// Where a raid actually stands, and whether it ever gives ground.
//
// Every other probe here reads what a fight took off a raid. This reads what
// the raid *did* with the room -- how far from the boss each role settles, and
// what share of a pull is spent outside a named radius. It exists because a
// mechanic answered by walking away turned out to be unanswerable at the
// radius it was written with, and nothing in the repo could have said so: the
// win rate said the fight was too hard, and the reason was that the raid
// stands two hundred from the boss and casts three hundred and forty.
//
//   npx tsx scripts/standprobe.ts <encounter> [size] [difficulty] [radius]
import { Rng } from '../src/sim/rng'
import { createState } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { encounterAt } from '../src/sim/encounters'
import { autoParty, pickFor, type DifficultyId, type RaidSize } from '../src/sim/classes'
import { BUFFET_REACH } from '../src/sim/constants'

const [, , encArg, sizeArg, diffArg, reachArg] = process.argv
const encounter = Number(encArg ?? 0)
const size = Number(sizeArg ?? 25) as RaidSize
const difficulty = (diffArg ?? 'heroic') as DifficultyId
const reach = Number(reachArg ?? BUFFET_REACH)
const party = autoParty(size, pickFor('mage', 'dps')!)
let deepest = 0
let inside = 0
let outside = 0
let sum = 0
let n = 0
let dsum = 0, dn = 0, hsum = 0, hn = 0, msum = 0, mn = 0
for (let r = 0; r < 4; r++) {
  const seed = 1000 + r * 137
  const s = createState(seed, 8, party, difficulty, encounter)
  s.countdown = 0
  const rng = new Rng(seed)
  while (s.outcome === 'ongoing' && s.time < encounterAt(encounter).enrage + 60) {
    step(s, { moveX: 0, moveY: 0, pressed: s.tick % 45 === 0 ? [0, 1, 2] : [] }, rng)
    const b = s.actors.find((a) => a.faction === 'boss')!
    for (const a of s.actors) {
      if (a.faction !== 'party' || !a.alive) continue
      const cold = a.auras.find((au) => au.id === 'buffeted')
      if (cold) { deepest = Math.max(deepest, cold.stacks); sum += cold.stacks; n++ }
      const away = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y)
      if (away <= reach) inside++
      else outside++
      dsum += away
      dn++
      if (a.role === 'healer') { hsum += away; hn++ }
      else if (a.melee) { msum += away; mn++ }
    }
  }
  process.stdout.write(`${s.outcome}@${s.time.toFixed(0)} `)
}
console.log(`\ndeepest ${deepest}, mean ${(sum / Math.max(1, n)).toFixed(1)}, outside ${(outside / (inside + outside) * 100).toFixed(0)}%`)
console.log(`mean distance to boss ${(dsum / dn).toFixed(0)}, healers ${(hsum / Math.max(1, hn)).toFixed(0)}, melee ${(msum / Math.max(1, mn)).toFixed(0)}`)

// How often a healer is standing too far away to heal the body that needs it.
//
// The one thing about a healer that nothing in the fight ever asked. Where a
// party member stands is decided against the boss — a bearing and a range --
// and healing is the only job whose target is not the boss, so a body thrown
// to the far wall by a mechanic could sit there under the heal it was owed
// with a healer that never took a step. It does not show up in a death rate
// as anything but bad luck, which is why it needs its own number.
//
// The number is the share of healer-ticks, while somebody is under 80% and
// needs one, spent further from that body than a heal will reach, and the
// same again restricted to the ticks where that body was under the line a
// healer drops everything for. The second is the one that costs lives:
//
//              out of range   ...while dying   raid died   won
//   before        10.06%          12.88%        21.90%    93.3%
//   after          5.94%            5.83%        15.73%    97.3%
//
// The remainder is mostly the mechanics that separate the raid on purpose —
// a healer on the wrong side of a split is out of range because the fight
// says so, and closing that gap would be answering the mechanic wrongly.
//
//   npx tsx scripts/healprobe.ts [runs] [size] [difficulty]
import { Rng } from '../src/sim/rng'
import { createState, unattended } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { ENCOUNTERS, encounterAt } from '../src/sim/encounters'
import { autoParty, pickFor, type DifficultyId, type Pick, type RaidSize } from '../src/sim/classes'
import { mostHurt } from '../src/sim/combat'

const dps = (classId: Pick['classId']): Pick => pickFor(classId, 'dps')!

const [, , runsArg, sizeArg, diffArg] = process.argv
const RUNS = Number(runsArg ?? 60)
const SIZE = Number(sizeArg ?? 10) as RaidSize
const DIFF = (diffArg ?? 'heroic') as DifficultyId
const HEAL_RANGE = 390

let ticks = 0
let outOfRange = 0
let dying = 0
let dyingOutOfRange = 0
let deaths = 0
let bodies = 0
let wins = 0

for (let e = 0; e < ENCOUNTERS.length; e++) {
  for (let n = 0; n < RUNS; n++) {
    const seed = 3000 + n * 7919
    const s = unattended(createState(seed, 4, autoParty(SIZE, dps('mage')), DIFF, e))
    s.countdown = 0
    const rng = new Rng(seed + 7919)
    while (s.outcome === 'ongoing' && s.time < encounterAt(e).enrage + 60) {
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
      const hurt = mostHurt(s)
      if (!hurt || hurt.hp / hurt.maxHp >= 0.8) continue
      const critical = hurt.hp / hurt.maxHp < 0.45
      for (const a of s.actors) {
        if (a.faction !== 'party' || a.role !== 'healer' || !a.alive) continue
        ticks++
        if (critical) dying++
        const d = Math.hypot(a.pos.x - hurt.pos.x, a.pos.y - hurt.pos.y)
        if (a.id !== hurt.id && d > HEAL_RANGE + hurt.radius) {
          outOfRange++
          if (critical) dyingOutOfRange++
        }
      }
    }
    const party = s.actors.filter((a) => a.faction === 'party')
    deaths += party.filter((a) => !a.alive).length
    bodies += party.length
    if (s.outcome === 'victory') wins++
  }
}

console.log(
  `healer-ticks ${ticks}`,
  ` out of range of the worst-hurt body ${((outOfRange / ticks) * 100).toFixed(2)}%`,
)
console.log(
  `of those, while that body was under the emergency line ${dying}`,
  ` out of range ${((dyingOutOfRange / Math.max(1, dying)) * 100).toFixed(2)}%`,
)
console.log(
  `raid deaths ${((deaths / bodies) * 100).toFixed(2)}%`,
  ` wins ${((wins / (RUNS * ENCOUNTERS.length)) * 100).toFixed(1)}%`,
)

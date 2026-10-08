/**
 * Whether a boss fight is the fight it was (#316).
 *
 * The walking rules (`src/sim/spacing.ts`) are on the path of `travel` mode
 * only, and a fight is not `travel` mode -- `sim.ts` hands a fight to
 * `updatePartyAi` and `updateBoss`, which never reach them. This is the proof
 * that is cheaper than the balance sweep: the same seeds, the same fights, a
 * hash of every body's every number, to be run on the commit before a change
 * and the commit after it. Equal means the change did not touch a fight.
 *
 *   npm run bosscanary            # prints one hash a line
 *
 * It is a comparison between two runs on one machine, not a number to be
 * checked in: the platforms do not agree to the last bit on `Math.cos`.
 */
import { Rng } from '../src/sim/rng'
import { createState } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { ENCOUNTERS } from '../src/sim/encounters'
import { autoParty, pickFor, type DifficultyId, type RaidSize } from '../src/sim/classes'
import type { SimState } from '../src/sim/types'

const SEEDS = [1, 7, 1000]
const CELLS: Array<[RaidSize, DifficultyId]> = [
  [10, 'heroic'],
  [25, 'normal'],
]
const TICKS = 2400

const view = new DataView(new ArrayBuffer(8))
/** FNV-1a over the bits of every number, so that a difference in the last place is a difference. */
function fold(hash: number, value: number): number {
  view.setFloat64(0, value)
  for (let i = 0; i < 8; i++) {
    hash ^= view.getUint8(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

function hashOf(s: SimState, hash: number): number {
  for (const a of s.actors) {
    hash = fold(hash, a.id)
    hash = fold(hash, a.pos.x)
    hash = fold(hash, a.pos.y)
    hash = fold(hash, a.hp)
    hash = fold(hash, a.power)
    hash = fold(hash, a.facing)
    hash = fold(hash, a.alive ? 1 : 0)
  }
  hash = fold(hash, s.time)
  hash = fold(hash, s.phase)
  return hash
}

const legs = [
  { moveX: 0, moveY: -1 },
  { moveX: 1, moveY: 0 },
  { moveX: 0, moveY: 1 },
  { moveX: -1, moveY: 0 },
]
let all = 0x811c9dc5
for (let e = 0; e < ENCOUNTERS.length; e++) {
  for (const [size, difficulty] of CELLS) {
    for (const seed of SEEDS) {
      const s = createState(seed, 4, autoParty(size, pickFor('warrior', 'tank')!), difficulty, e)
      const rng = new Rng(seed)
      let hash = 0x811c9dc5
      for (let t = 0; t < TICKS && s.outcome === 'ongoing'; t++) {
        const leg = legs[Math.floor(t / 90) % 4]!
        step(s, { ...leg, pressed: t % 45 === 0 ? [0] : t % 360 === 0 ? [1] : [] }, rng)
        if (t % 30 === 0) hash = hashOf(s, hash)
      }
      hash = hashOf(s, hash)
      all = fold(all, hash)
      console.log(`${ENCOUNTERS[e]!.id.padEnd(14)} ${String(size).padStart(2)} ${difficulty.padEnd(7)} seed ${String(seed).padStart(4)}  ${s.outcome.padEnd(8)} t=${s.time.toFixed(1).padStart(6)}  ${hash.toString(16).padStart(8, '0')}`)
    }
  }
}
console.log(`bosscanary: ${(all >>> 0).toString(16).padStart(8, '0')} over ${ENCOUNTERS.length} fights x ${CELLS.length} cells x ${SEEDS.length} seeds`)

// How many moments in a pull are worth a raid cooldown.
//
// A raid cooldown is only a decision if there are more moments worth spending
// it on than there are cooldowns to spend. This counts them: every tick the
// fight lands damage on most of the raid at once, which is what `raidFlash`
// already marks, and how big each one was.
import { Rng } from '../src/sim/rng'
import { createState } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { ENCOUNTERS, encounterAt } from '../src/sim/encounters'
import { autoParty, pickFor, type DifficultyId, type Pick, type RaidSize } from '../src/sim/classes'
import type { PlayerInput } from '../src/sim/types'

const dps = (classId: Pick['classId']): Pick => pickFor(classId, 'dps')!
const idle: PlayerInput = { moveX: 0, moveY: 0, pressed: [] }

const [, , sizeArg, diffArg] = process.argv
const SIZE = Number(sizeArg ?? 10) as RaidSize
const DIFF = (diffArg ?? 'normal') as DifficultyId
const RUNS = 20

console.log(`${SIZE}-player ${DIFF}, ${RUNS} pulls a row`)
console.log('boss'.padEnd(14) + 'moments'.padStart(9) + 'biggest'.padStart(9) + 'median'.padStart(8) + '  share of a bar')

for (let e = 0; e < ENCOUNTERS.length; e++) {
  const counts: number[] = []
  const hits: number[] = []
  let maxShare = 0
  for (let n = 0; n < RUNS; n++) {
    const seed = 1000 + n * 137
    const s = createState(seed, 8, autoParty(SIZE, dps('mage')), DIFF, e)
    s.countdown = 0
    const rng = new Rng(seed + 7919)
    let flash = 0
    let moments = 0
    const before = new Map<number, number>()
    while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
      for (const a of s.actors) before.set(a.id, a.hp)
      step(s, idle, rng)
      // A raid-wide hit is the tick the fight flashes the screen: it is the
      // marker the game already uses for "that landed on everybody".
      if (s.raidFlash > flash + 0.01) {
        moments++
        let worst = 0
        let bar = 1
        for (const a of s.actors) {
          if (a.faction !== 'party') continue
          const lost = (before.get(a.id) ?? a.hp) - a.hp
          if (lost > worst) { worst = lost; bar = a.maxHp }
        }
        if (worst > 0) {
          hits.push(worst)
          maxShare = Math.max(maxShare, worst / bar)
        }
      }
      flash = s.raidFlash
    }
    counts.push(moments)
  }
  hits.sort((a, b) => a - b)
  const avg = counts.reduce((t, c) => t + c, 0) / counts.length
  console.log(
    ENCOUNTERS[e]!.short.padEnd(14) +
      avg.toFixed(1).padStart(9) +
      String(hits.length ? Math.round(hits[hits.length - 1]!) : 0).padStart(9) +
      String(hits.length ? Math.round(hits[Math.floor(hits.length / 2)]!) : 0).padStart(8) +
      `  worst = ${(maxShare * 100).toFixed(0)}% of a health bar`,
  )
}

/**
 * How often each mechanic actually lands on somebody.
 *
 * A mechanic nobody is ever hit by is not a hard mechanic, it is furniture: it
 * costs a cadence slot, a rung, a line of chat and a shape on the floor, and
 * what it buys is nothing a player could notice if it were deleted. The
 * teaching table in the harness answers a neighbouring question -- whether
 * practice changes what it costs -- and cannot see this one, because a
 * mechanic that never connects has nothing to get better at.
 *
 * Read off `byMechanic`, which the fight writes for exactly this and never
 * reads back.
 */
import { Rng } from '../src/sim/rng'
import { createState, unattended } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { ENCOUNTERS, MECHANIC_NAMES, encounterKit, encounterAt, type MechanicId } from '../src/sim/encounters'
import { autoParty, pickFor, type DifficultyId, type RaidSize } from '../src/sim/classes'

const SIZE = Number(process.argv[2] ?? 25) as RaidSize
const DIFF = (process.argv[3] ?? 'heroic') as DifficultyId
const RUNS = Number(process.argv[4] ?? 6)

interface Seen {
  hits: number
  pulls: number
  boss: string
}
const found = new Map<MechanicId, Seen>()

for (let e = 0; e < ENCOUNTERS.length; e++) {
  const kit = encounterKit(ENCOUNTERS[e]!, SIZE, DIFF)
  for (let n = 0; n < RUNS; n++) {
    const seed = 900 + n * 137
    const s = unattended(createState(seed, 8, autoParty(SIZE, pickFor('mage', 'dps')!), DIFF, e))
    s.countdown = 0
    const rng = new Rng(seed)
    while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    }
    for (const id of kit) {
      const seen = found.get(id) ?? { hits: 0, pulls: 0, boss: ENCOUNTERS[e]!.short }
      for (const a of s.actors) {
        if (a.faction !== 'party') continue
        seen.hits += s.tally[a.id]?.byMechanic?.[id] ?? 0
      }
      seen.pulls++
      found.set(id, seen)
    }
  }
}

const rows = [...found.entries()]
  .map(([id, seen]) => ({
    name: MECHANIC_NAMES[id] ?? id,
    boss: seen.boss,
    each: seen.hits / seen.pulls,
  }))
  .sort((a, b) => a.each - b.each)

console.log(`${SIZE}-player ${DIFF}, ${RUNS} pulls a boss, played by the roster`)
console.log('mechanic'.padEnd(22) + 'boss'.padStart(13) + 'hits a pull'.padStart(13))
for (const r of rows) {
  console.log(
    r.name.padEnd(22) + r.boss.padStart(13) + r.each.toFixed(1).padStart(13) +
      (r.each < 1 ? '   <- barely lands' : ''),
  )
}

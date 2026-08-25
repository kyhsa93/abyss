// Every mechanic on one host, at every size.
//
// The figures gathered so far each came from whichever boss the mechanic was
// written against, and a boss is not a neutral instrument: the pool measures
// 0.5pp on the Choir and 35pp on the Warden, same code, because one multiplies
// mechanic damage by 1.15 and the other by 1.7. Comparing those two numbers
// compares the fights, not the mechanics.
//
// So: one host for all of them. The ladder and the cadence are both overridden
// in memory -- the phase tables are sparse, so a boss does not name a mechanic
// it never throws, and putting one on a ladder without lending it a cadence
// leaves it silent and reads as a dead mechanic.
import { ENCOUNTERS, encounterAt, MECHANIC_IDS } from '../src/sim/encounters'
import type { Encounter, MechanicId, PhaseTiming } from '../src/sim/encounters'
import { createState, unattended } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { Rng } from '../src/sim/rng'
import { autoParty, pickFor, type RaidSize } from '../src/sim/classes'

const RUNS = Number(process.argv[2] ?? 120)
const host = ENCOUNTERS[0]!
const basePhases: Encounter['phases'] = { 1: host.phases[1]!, 2: host.phases[2]!, 3: host.phases[3]! }
const baseOpening = host.opening
const baseLadder = host.ladder
const baseLines = host.lines

/** The cadence some boss actually gives this mechanic, or null if none does. */
function donorOf(mech: MechanicId): Encounter | null {
  return ENCOUNTERS.find((e) => (e.phases[1]![mech] ?? 0) > 0) ?? null
}

function pull(seed: number, attempt: number, size: RaidSize, mech: MechanicId): number {
  const s = unattended(createState(seed, attempt, autoParty(size, pickFor('mage', 'dps')!), 'heroic', 0))
  s.only = mech
  s.countdown = 0
  const rng = new Rng(seed + 7919)
  while (s.outcome === 'ongoing' && s.time < encounterAt(0).enrage + 60) {
    step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  }
  const party = s.actors.filter((a) => a.faction === 'party')
  return party.filter((a) => !a.alive).length / party.length
}

console.log(`mechanic         5-man             10-man            25-man     (${RUNS} pairs, Warden host, heroic)`)
for (const mech of MECHANIC_IDS) {
  const donor = donorOf(mech)
  if (donor === null) {
    console.log(mech.padEnd(16), 'no boss gives it a cadence to borrow')
    continue
  }
  const phases: Encounter['phases'] = {}
  for (const n of [1, 2, 3]) phases[n] = { ...basePhases[n]!, [mech]: donor.phases[n]![mech] } as PhaseTiming
  host.phases = phases
  host.opening = { ...baseOpening, [mech]: donor.opening[mech] }
  // The cast line too, when the mechanic has one -- not every mechanic is
  // announced, and `lines` only carries the ones that are. A host with
  // nothing to say still throws it; the raid is just not told.
  const spoken = mech in donor.lines
  host.lines = spoken
    ? { ...baseLines, [mech]: (donor.lines as Record<string, string>)[mech]! }
    : baseLines
  host.ladder = [mech, ...baseLadder.filter((m) => m !== mech)]

  const cells: string[] = []
  for (const size of [5, 10, 25] as RaidSize[]) {
    const diffs: number[] = []
    let green = 0
    let vet = 0
    for (let n = 0; n < RUNS; n++) {
      const seed = 3000 + n * 7919
      const a = pull(seed, 0, size, mech)
      const b = pull(seed, 8, size, mech)
      diffs.push(a - b)
      green += a
      vet += b
    }
    const mean = diffs.reduce((t, d) => t + d, 0) / RUNS
    const varr = diffs.reduce((t, d) => t + (d - mean) ** 2, 0) / (RUNS - 1)
    const se = Math.sqrt(varr / RUNS)
    const real = (mean - 2 * se) * 100 > 0
    const share = green > 0 ? `${Math.round(((green - vet) / green) * 100)}%` : 'nobody died'
    cells.push(`${(mean * 100).toFixed(1)}+-${(2 * se * 100).toFixed(1)} ${share}${real ? '' : '?'}`.padEnd(18))
  }
  console.log(mech.padEnd(16), cells.join(''))
}
host.phases = basePhases
host.opening = baseOpening
host.ladder = baseLadder
host.lines = baseLines

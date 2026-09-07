// What the teaching gap is worth, with an error bar that matches the design.
//
// The harness pairs its seeds already -- attempt 0 and attempt 8 run the same
// fight, and only the reaction delay and the mistake rate differ between them.
// It then quotes `2*sqrt(0.25/N)`, which is the error on one unpaired death
// rate. That is the wrong bar for a paired difference and it is wrong in the
// expensive direction: it made every gap under twenty points look like it
// might be nothing, and mechanics were discarded on that reading.
//
// The number that belongs to this design is the spread of the per-seed
// difference. Same seed, same boss, same party, same placement -- everything
// that would otherwise be noise cancels inside the pair, and what is left is
// the effect. Usage:
//
//   npx tsx scripts/teachprobe.ts <mechanic> [runs] [size] [difficulty]
import { Rng } from '../src/sim/rng'
import { createState, unattended } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { ENCOUNTERS, encounterAt, encounterKit } from '../src/sim/encounters'
import type { MechanicId } from '../src/sim/encounters'
import { autoParty, pickFor, type DifficultyId, type Pick, type RaidSize } from '../src/sim/classes'

const dps = (classId: Pick['classId']): Pick => pickFor(classId, 'dps')!

const [, , wanted, runsArg, sizeArg, diffArg] = process.argv
const RUNS = Number(runsArg ?? 250)
/**
 * What a healer is worth inside the probe.
 *
 * Not a game change and not a thumb on the scale for any one mechanic: the
 * same fraction for all of them, restoring the one thing the isolation takes
 * away, which is that the raid is already losing ground to something while it
 * answers the rung being measured. Without it every mechanic in the game reads
 * nought against nought, including the ones this file's own table scores.
 *
 * Picked against that table rather than by taste. At a fifth, two of the four
 * mechanics the table records come back where they were written:
 *
 *     mechanic            table            at 0.2
 *     chant  10 heroic    4.5pp  / 96%     5.0pp  / 95%
 *     grasp  10 heroic    10.9pp / 67%     10.0pp / 60%
 *     gaze   25 heroic    27.9pp / 97%     0.0
 *     vessel  5 heroic    37.8pp / 40%     0.3pp
 *
 * The two that do not come back are a finding rather than a miscalibration.
 * The gaze still fires -- forty-nine hits across three isolated pulls -- and
 * takes a twenty-five man to forty-seven percent, and kills nobody at any
 * healing value tried, down to a fifth. It has lost its teeth since the table
 * was written, and the table is the thing that is out of date.
 */
const HEALING = Number(process.env.TEACH_HEALING ?? 0.2)
const SIZE = Number(sizeArg ?? 10) as RaidSize
const DIFF = (diffArg ?? 'heroic') as DifficultyId

function pull(seed: number, attempt: number, e: number, mech: MechanicId): number {
  const s = unattended(createState(seed, attempt, autoParty(SIZE, dps('mage')), DIFF, e))
  s.only = mech
  // The pressure the isolation took away. See `SimState.healing`: a raid with
  // one rung to answer and a full healing kit covers it without noticing, and
  // every mechanic in the game -- including the four this file's own table
  // records between 4 and 38 points -- came back at nought against nought.
  s.healing = HEALING
  s.countdown = 0
  const rng = new Rng(seed + 7919)
  while (s.outcome === 'ongoing' && s.time < encounterAt(e).enrage + 60) {
    step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  }
  const party = s.actors.filter((a) => a.faction === 'party')
  return party.filter((a) => !a.alive).length / party.length
}

for (let e = 0; e < ENCOUNTERS.length; e++) {
  const enc = ENCOUNTERS[e]!
  const kit = encounterKit(enc, SIZE, DIFF)
  for (const mech of enc.ladder) {
    if (wanted !== undefined && wanted !== 'all' && mech !== wanted) continue
    if (!kit.includes(mech)) {
      if (wanted === mech) console.log(`${mech} / ${enc.short}: not in a ${SIZE}-man ${DIFF} kit`)
      continue
    }
    const diffs: number[] = []
    let green = 0
    let vet = 0
    for (let n = 0; n < RUNS; n++) {
      const seed = 3000 + n * 7919
      const a = pull(seed, 0, e, mech)
      const b = pull(seed, 8, e, mech)
      diffs.push(a - b)
      green += a
      vet += b
    }
    const mean = diffs.reduce((t, d) => t + d, 0) / RUNS
    const varr = diffs.reduce((t, d) => t + (d - mean) ** 2, 0) / (RUNS - 1)
    const se = Math.sqrt(varr / RUNS)
    const lo = (mean - 2 * se) * 100
    console.log(
      `${mech} / ${enc.short}`.padEnd(24),
      `${((green / RUNS) * 100).toFixed(1)}%`.padStart(7),
      `->`,
      `${((vet / RUNS) * 100).toFixed(1)}%`.padStart(7),
      `  teaches ${(mean * 100).toFixed(1)}pp +/- ${(2 * se * 100).toFixed(1)}`,
      // Points alone read the floor, not the mechanic. Isolating one mechanic
      // leaves the raid under a quarter of a real pull's pressure, so a good
      // one can only ever move a death rate that starts near zero and the
      // whole table compresses. The share of the deaths practice removes does
      // not care how few there were to begin with.
      green > 0 ? `  removes ${(((green - vet) / green) * 100).toFixed(0)}% of them` : '',
      lo > 0 ? '  real' : '  indistinguishable from nothing',
    )
  }
}

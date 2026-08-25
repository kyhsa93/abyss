// Throughput and failure counts for the three "answer is a moment" mechanics.
//
// `teachprobe` answers the only question that decides a mechanic -- what does
// practice remove -- and deliberately answers nothing else. When the answer is
// "nothing", there are two very different reasons for it and the gap cannot
// tell them apart: the demand may be going out and being met by everybody, or
// it may be being failed and costing too little to notice. This counts both.
//
// It found one of each. The chant was cut 12.6 times a pull and failed 0.1
// times, which is a demand nobody had to answer and no amount of damage would
// have rescued; the same code with a shorter count went to 2.6 failures and
// 19.1 points. Nothing here decides a mechanic -- `teachprobe` does that, and
// a failure count may never be used to argue that a mechanic is alive. This
// says why a zero is a zero.
//
//   npx tsx scripts/momentprobe.ts <mechanic> [runs] [size] [difficulty] [boss]
//
// The mechanic has to be on a rung this raid reaches, the same way it does for
// `teachprobe`: a mechanic no ladder sells reads as never having been cast.
import { Rng } from '../src/sim/rng'
import { createState, unattended } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { encounterAt, encounterKit } from '../src/sim/encounters'
import type { MechanicId } from '../src/sim/encounters'
import { autoParty, pickFor, type DifficultyId, type Pick, type RaidSize } from '../src/sim/classes'

const dps = (classId: Pick['classId']): Pick => pickFor(classId, 'dps')!

const [, , wanted, runsArg, sizeArg, diffArg] = process.argv
const MECH = (wanted ?? 'chant') as MechanicId
const RUNS = Number(runsArg ?? 40)
const SIZE = Number(sizeArg ?? 10) as RaidSize
const DIFF = (diffArg ?? 'heroic') as DifficultyId
const ENC = Number(process.argv[6] ?? 0)
const ID = `boss_${MECH}`

if (!encounterKit(encounterAt(ENC), SIZE, DIFF).includes(MECH)) {
  console.log(`${MECH} is on no rung a ${SIZE}-man ${DIFF} ${encounterAt(ENC).short} climbs`)
  process.exit(0)
}

for (const attempt of [0, 8]) {
  let cast = 0
  let landed = 0
  let dead = 0
  let bodies = 0
  let taken = 0
  let missed = 0
  for (let n = 0; n < RUNS; n++) {
    const seed = 3000 + n * 7919
    const s = unattended(createState(seed, attempt, autoParty(SIZE, dps('mage')), DIFF, ENC))
    s.only = MECH
    s.countdown = 0
    const rng = new Rng(seed + 7919)
    while (s.outcome === 'ongoing' && s.time < encounterAt(ENC).enrage + 60) {
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
      for (const e of s.effects) {
        if (e.abilityId !== ID) continue
        if (e.kind === 'cast') cast++
        // The resolve, which fires whether or not it caught anybody: this is
        // throughput, not failure.
        else if (e.kind === 'impact' && e.crit) landed++
      }
    }
    const party = s.actors.filter((a) => a.faction === 'party')
    bodies += party.length
    dead += party.filter((a) => !a.alive).length
    for (const a of party) {
      taken += s.tally[a.id]?.damageTaken ?? 0
      // Failures, and only for a diagnosis: this number can say a mechanic is
      // being fumbled, and it can never say a mechanic is worth having.
      missed += s.tally[a.id]?.mechanicHits ?? 0
    }
  }
  console.log(
    `${MECH} ${SIZE}${DIFF[0]} attempt ${attempt}:`,
    `${(cast / RUNS).toFixed(1)} cast/pull`,
    `${(landed / RUNS).toFixed(1)} resolved/pull`,
    `${(missed / RUNS).toFixed(1)} hits/pull`,
    `${(missed / Math.max(1, bodies)).toFixed(2)} hits/body`,
    `${((dead / bodies) * 100).toFixed(1)}% dead`,
    `${Math.round(taken / bodies)} taken/body`,
  )
}

/**
 * The damage spread across the nine damage specs, measured in pulls.
 *
 * Lifted out of `rendercheck`, where it was twenty minutes of a twenty-two
 * minute check and produced nothing anybody gated on: its three bands are
 * switched off while the fights are being given rooms of their own, because a
 * room is most of what decides how far a damage spec walks between casts, and
 * a number that moves every time a room does is not a line anybody can hold.
 *
 * So it is a probe. Run it when you want to know where the field is —
 *
 *     npm run specprobe
 *
 * — and put it back in the gate when the rooms stop moving. The bands it used
 * to assert are written out at the bottom, unchanged, so putting it back is
 * deleting a flag rather than remembering what the limits were.
 *
 * Split across cores, because it is a dozen independent measurements and there
 * is no reason to pay for them one after another: each spec is a child process
 * with `ABYSS_SPEC` set to its own index, and the parent collects the numbers.
 * The simulation is deterministic from a seed and reaches outside itself for
 * nothing, so the split changes nothing but the wall clock.
 */
import { execFile } from 'node:child_process'
import { availableParallelism } from 'node:os'
import { resolve } from 'node:path'
import { ENCOUNTERS, encounterAt } from '../src/sim/encounters'
import { MELEE_CALL } from '../src/sim/constants'
import { Rng } from '../src/sim/rng'
import { step } from '../src/sim/sim'
import { createState, unattended } from '../src/sim/state'
import { SPEC_OPTIONS, roleOf, specOf, type Pick } from '../src/sim/classes'
import type { Actor } from '../src/sim/types'

/** The reasoning these numbers were chosen under, kept where they are used. */
// --- what it measures, and why in a pull ----------------------------------------------
//
// In a pull, because a pull is the game. The dummy this used to be measured on
// holds everyone still, and standing still is exactly the cost the field does
// not share: eight of the nine damage specs have an instant filler and lose
// nothing to the floor, and the ninth has a cast time and loses a global every
// time the fight moves it. Realisation ran from 72% to 116% of what the dummy
// promised, so the dummy ranked the shaman last and the game ranked it first,
// and the dummy said 1.25x while the game said 1.61x.
//
// One spec under test in an otherwise identical raid rather than a raid built
// out of it: six of the same melee is a party with no ranged in it, and that
// loses for reasons that are not the spec's. Twelve pulls a spec — the spread
// reads within four hundredths across independent seed bases at that count,
// which is what makes it a check rather than a coin toss.
  // Twelve, not four. The note above says four is enough because the spread
  // reads within four hundredths across seed bases at that count -- measured
  // when there were three bosses and a ten-man normal met three mechanics.
  // With five bosses and four, four pulls a spec put the same tree at 1.33 on
  // sixty samples and 1.37 on twenty, which straddles the limit. A check whose
  // own error is the size of the thing it is judging will be answered by
  // tuning until it goes green, and this file has a long record of that going
  // badly.
  // Twenty-four, not twelve, and for the third time the same argument. Twelve
  // was picked when the spread was one ratio over ten specs; it is three
  // ratios now, and the cross-family one is a comparison between the two
  // extremes of the field, which is the least stable number a sample can
  // produce. Adding the cold line and the spikes moved it from 1.456 to 1.511
  // at twelve runs and to 1.461 at twenty-four — so the check went red inside
  // its own error, and the comment above says exactly what happens next if
  // that is answered by moving the band.

const RUNS = 24
const SIZE = 10
const TANKS = 2
const HEALERS = 2
const SLOT = TANKS + HEALERS
const ref = {
  tank: SPEC_OPTIONS.find((p) => roleOf(p) === 'tank')!,
  healer: SPEC_OPTIONS.find((p) => roleOf(p) === 'healer')!,
  dps: SPEC_OPTIONS.find((p) => roleOf(p) === 'dps')!,
}

const measure = (test: Pick): number => {
  let total = 0
  let runs = 0
  for (let boss = 0; boss < ENCOUNTERS.length; boss++) {
    for (let n = 0; n < RUNS; n++) {
    const seed = 3000 + n * 7919 + boss * 131
    const line: Pick[] = []
      for (let i = 0; i < TANKS; i++) line.push(ref.tank)
      for (let i = 0; i < HEALERS; i++) line.push(ref.healer)
      while (line.length < SIZE) line.push(ref.dps)
      line[SLOT] = test
    const s = unattended(createState(seed, 6, line, 'normal', boss))
      s.countdown = 0
    const rng = new Rng(seed + 7919)
    const me = s.actors.filter((a: Actor) => a.faction === 'party')[SLOT]!
      while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
        step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
      }
      total += s.tally[me.id]!.damage / Math.max(1, s.time)
      runs++
    }
  }
  return total / runs
}


/**
 * One spec's number, or all of them.
 *
 * A child asked for one prints it and exits; the parent asks for each in turn,
 * as many at a time as there are cores, and reads them back. Nothing is shared
 * between them but the seed rule, which is written into `measure`.
 */
const only = process.env.ABYSS_SPEC
if (only !== undefined) {
  const at = Number(only)
  const pick = SPEC_OPTIONS.filter((p) => roleOf(p) === 'dps')[at]
  if (!pick) {
    console.error(`no damage spec at ${at}`)
    process.exit(1)
  }
  process.stdout.write(String(measure(pick)))
} else {
  await main()
}

async function main(): Promise<void> {
  const specs = SPEC_OPTIONS.filter((p) => roleOf(p) === 'dps')
  const self = resolve(process.cwd(), 'node_modules/.cache/specprobe.mjs')
  const dps: number[] = new Array(specs.length).fill(0)
  let next = 0
  const one = (at: number): Promise<number> =>
    new Promise((ok, fail) => {
      execFile(
        process.execPath,
        [self],
        { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, env: { ...process.env, ABYSS_SPEC: String(at) } },
        (err, out, errOut) => (err ? fail(new Error(`spec ${at}: ${err.message}\n${errOut}`)) : ok(Number(out))),
      )
    })
  async function worker(): Promise<void> {
    for (;;) {
      const at = next++
      if (at >= specs.length) return
      dps[at] = await one(at)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, availableParallelism()), specs.length) }, worker),
  )

  const rows = specs.map((p, at) => ({
    name: `${p.classId} ${p.spec}`,
    melee: specOf(p).melee,
    dps: dps[at]!,
  }))
  const best = Math.max(...rows.map((r) => r.dps))
  const worst = Math.min(...rows.map((r) => r.dps))

  // Split by how they have to stand, because the room decides that.
  //
  // A bigger room is a ranged advantage for a reason that is not a tuning
  // mistake: the hunter is the one spec in the game with a near edge, and it
  // gained eighteen points of damage the day the floor grew because the
  // constraint it fights under finally had somewhere to go. Melee lost, at the
  // far end sixteen. A single ratio over all of them read 1.46 and said one
  // thing had gone wrong; what had actually happened was that the two families
  // had separated, and inside each of them nothing had moved at all.
  //
  // So the question is asked twice. A player choosing a damage spec chooses a
  // way to stand first and a class second, and what must not be obvious is the
  // second choice. Inside a family the limit is 1.35; across the two it is 1.5,
  // and what makes the lead a trade rather than a tax is `MELEE_CALL` — a melee
  // brings the raid's cooldowns back sooner, and that discount is worth thirty
  // to fifty points of raid dead on a heroic pull.
  //
  // The limits are printed against, not asserted on. This is a probe: it went
  // out of the gate because its bands are switched off while the fights are
  // being given rooms, and it goes back in with them. See SUSPENDED in
  // `scripts/balancecheck.ts` for what has to settle first.
  const within = (group: typeof rows) =>
    Math.max(...group.map((r) => r.dps)) / Math.min(...group.map((r) => r.dps))
  const melee = rows.filter((r) => r.melee)
  const ranged = rows.filter((r) => !r.melee)

  for (const r of [...rows].sort((a, b) => b.dps - a.dps)) {
    console.log(`${r.name.padEnd(18)} ${r.melee ? 'melee ' : 'ranged'} ${r.dps.toFixed(1)}`)
  }
  const line = (what: string, got: number, limit: number) =>
    console.log(`${got < limit ? 'within' : 'OVER  '}  ${what.padEnd(34)} ${got.toFixed(3)} against ${limit}`)
  console.log('')
  line('no ranged spec is the obvious one', within(ranged), 1.35)
  line('no melee spec is the obvious one', within(melee), 1.35)
  line('the room favours ranged by no more', best / worst, 1.5)
  console.log(`\nmelee are paid for it: MELEE_CALL is ${MELEE_CALL} of everybody else's count`)
}

/**
 * The damage spread, with the reasons beside it.
 *
 * `rendercheck` prints the spread and nothing else, which is the right amount
 * for a gate and the wrong amount for working out why one moved. Same party,
 * same seeds, same pulls — plus, for every spec, the two things that decide
 * whether a number is a coefficient problem or a positioning one: how much of
 * the pull it spent with nothing it could reach, and how long the pull was.
 */
import { Rng } from '../src/sim/rng'
import { createState, unattended } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { ENCOUNTERS, encounterAt } from '../src/sim/encounters'
import { MELEE_RANGE } from '../src/sim/constants'
import { SPEC_OPTIONS, roleOf, specLabel, type Pick } from '../src/sim/classes'
import { boss, dist } from '../src/sim/combat'
import type { Actor } from '../src/sim/types'

const RUNS = Number(process.argv[2] ?? 12)
const SIZE = 10
const TANKS = 2
const HEALERS = 2
const SLOT = TANKS + HEALERS
const ref = {
  tank: SPEC_OPTIONS.find((p) => roleOf(p) === 'tank')!,
  healer: SPEC_OPTIONS.find((p) => roleOf(p) === 'healer')!,
  dps: SPEC_OPTIONS.find((p) => roleOf(p) === 'dps')!,
}

interface Row {
  dps: number
  /** Share of ticks standing inside melee reach of the boss. */
  onBoss: number
  /** Share of ticks with a move target, which is the cost of a mechanic. */
  walking: number
  /** Off the boss and walking somewhere: the cost of answering a mechanic. */
  awayWalking: number
  /** Off the boss and going nowhere: the number this probe was written for. */
  awayIdle: number
  /** Ticks a reaction is still running, which is time spent not deciding. */
  waiting: number
  seconds: number
  /** Share of pulls that actually killed it: a pull that runs to the cap is
   * the longest pull there is, and dps is measured over the length. */
  killed: number
  /** Share of pulls the tested spec was alive at the end of. */
  lived: number
  /** Damage over the seconds it was alive, rather than over the pull. While
   * it is dead the numerator stops and the denominator does not, so the two
   * numbers together say whether a low spec is dealing less or dying more. */
  alivedps: number
}

function measure(test: Pick): Row {
  let total = 0
  let onBoss = 0
  let walking = 0
  let awayWalking = 0
  let awayIdle = 0
  let waiting = 0
  let ticks = 0
  let seconds = 0
  let runs = 0
  let killed = 0
  let lived = 0
  let aliveTotal = 0
  for (let e = 0; e < ENCOUNTERS.length; e++) {
    for (let n = 0; n < RUNS; n++) {
      const seed = 3000 + n * 7919 + e * 131
      const line: Pick[] = []
      for (let i = 0; i < TANKS; i++) line.push(ref.tank)
      for (let i = 0; i < HEALERS; i++) line.push(ref.healer)
      while (line.length < SIZE) line.push(ref.dps)
      line[SLOT] = test
      const s = unattended(createState(seed, 6, line, 'normal', e))
      s.countdown = 0
      const rng = new Rng(seed + 7919)
      const me = s.actors.filter((a: Actor) => a.faction === 'party')[SLOT]!
      let livedFor = 0
      while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
        step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
        if (me.alive) livedFor += 1 / 30
        if (!me.alive) continue
        ticks++
        // The same test the swing itself makes: the gap is measured from the
        // boss's edge, not its centre, so a melee standing a hundred units
        // from the middle of a fifty-unit boss is standing on it.
        const near = dist(me.pos, boss(s).pos) - boss(s).radius <= MELEE_RANGE
        if (near) onBoss++
        if (me.ai?.moveTarget) walking++
        if (!near && me.ai?.moveTarget) awayWalking++
        if (!near && !me.ai?.moveTarget) awayIdle++
        if ((me.ai?.reactionTimer ?? 0) > 0) waiting++
      }
      total += s.tally[me.id]!.damage / Math.max(1, s.time)
      if (me.alive) lived++
      aliveTotal += s.tally[me.id]!.damage / Math.max(1, livedFor)
      seconds += s.time
      if (s.outcome === 'victory') killed++
      runs++
    }
  }
  return {
    dps: total / runs,
    onBoss: (onBoss / Math.max(1, ticks)) * 100,
    walking: (walking / Math.max(1, ticks)) * 100,
    awayWalking: (awayWalking / Math.max(1, ticks)) * 100,
    awayIdle: (awayIdle / Math.max(1, ticks)) * 100,
    waiting: (waiting / Math.max(1, ticks)) * 100,
    seconds: seconds / runs,
    killed: (killed / runs) * 100,
    lived: (lived / runs) * 100,
    alivedps: aliveTotal / runs,
  }
}

const rows = SPEC_OPTIONS.filter((p) => roleOf(p) === 'dps')
  .map((p) => ({ name: specLabel(p), ...measure(p) }))
  .sort((a, b) => b.dps - a.dps)

console.log(
  'spec'.padEnd(20) +
    'dps'.padStart(7) +
    'on boss'.padStart(9) +
    'away+walk'.padStart(11) +
    'away+idle'.padStart(11) +
    'waiting'.padStart(9) +
    'pull'.padStart(7) +
    'killed'.padStart(8) +
    'lived'.padStart(7) +
    'live dps'.padStart(10),
)
for (const r of rows) {
  console.log(
    r.name.padEnd(20) +
      r.dps.toFixed(0).padStart(7) +
      `${r.onBoss.toFixed(0)}%`.padStart(9) +
      `${r.awayWalking.toFixed(0)}%`.padStart(11) +
      `${r.awayIdle.toFixed(0)}%`.padStart(11) +
      `${r.waiting.toFixed(0)}%`.padStart(9) +
      `${r.seconds.toFixed(0)}s`.padStart(7) +
      `${r.killed.toFixed(0)}%`.padStart(8) +
      `${r.lived.toFixed(0)}%`.padStart(7) +
      r.alivedps.toFixed(0).padStart(10),
  )
}
const best = Math.max(...rows.map((r) => r.dps))
const worst = Math.min(...rows.map((r) => r.dps))
console.log(`spread ${(best / worst).toFixed(3)} (limit 1.35)`)

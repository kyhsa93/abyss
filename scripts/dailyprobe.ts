/**
 * Is the daily a fight or a formality?
 *
 * It is the one pull in the game nobody gets to practise -- one a day, and
 * tomorrow is a different boss under a different twist -- so the usual answer
 * of "winnable by the ninth attempt" does not apply to it. What it has to be
 * is winnable on the first, by a raid playing well, often enough that a
 * person who turns up every day is not being handed a loss.
 *
 * The fight itself is now the boss's own kit, so what this measures is the
 * affix: what a day is, on top of a fight the ladder already tuned, is the
 * twist and the twenty-five bodies. A twist that makes a boss unwinnable at a
 * size the ladder cleared is the twist being a wall rather than a variation.
 */
import { Rng } from '../src/sim/rng'
import { createState, unattended } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { encounterAt } from '../src/sim/encounters'
import { dailyFor, dailyKey } from '../src/sim/daily'
import { pickFor, specOf, type ClassId } from '../src/sim/classes'
import type { SimState } from '../src/sim/types'

const DAYS = Number(process.argv[2] ?? 30)
const from = new Date(Date.UTC(2026, 8, 5))
let won = 0
const rows: string[] = []

for (let d = 0; d < DAYS; d++) {
  const at = new Date(from.getTime() + d * 86400000)
  const daily = dailyFor(dailyKey(at), pickFor('mage', 'dps')!)
  const party = daily.party.map((p) => ({ ...p }))
  let wins = 0
  const RUNS = 8
  for (let n = 0; n < RUNS; n++) {
    const s = unattended(
      createState(daily.seed + n * 7919, 0, party, daily.difficulty, daily.encounter, daily.affix),
    )
    s.countdown = 0
    const rng = new Rng(daily.seed + n)
    while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
      // With the raid's cooldowns spent, because a daily is a run somebody
      // plays and that is the one input a player has that the roster does not.
      // Pressed as they come up rather than on the biggest hit -- the crude
      // hand, so the number is a floor and not a ceiling.
      step(s, { moveX: 0, moveY: 0, pressed: [], call: ready(s) }, rng)
    }
    if (s.outcome === 'victory') wins++
  }
  if (wins > 0) won++
  rows.push(
    `${daily.key}  ${encounterAt(daily.encounter).name.padEnd(22)} ${daily.difficulty.padEnd(7)} ` +
      `${daily.affix.padEnd(10)} ${((wins / RUNS) * 100).toFixed(0).padStart(3)}% won`,
  )
}

function ready(s: SimState): ClassId | null {
  for (const a of s.actors) {
    if (a.faction !== 'party' || !a.alive || a.castId) continue
    const id = specOf({ classId: a.classId, spec: a.spec }).abilities.raid
    if (id && (a.cooldowns[id] ?? 0) <= 0) return a.classId
  }
  return null
}

for (const row of rows) console.log(row)
console.log(`${won} of ${DAYS} days winnable at all`)

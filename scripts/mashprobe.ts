/**
 * Why the rotation is or is not worth turning on.
 *
 * `rendercheck` compares autocast against a stand-in that presses one button
 * on a loop and prints two totals. Two totals cannot say whether the rotation
 * got worse or the loop got better, and those want opposite fixes.
 */
import { Rng } from '../src/sim/rng'
import { createState } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { encounterAt } from '../src/sim/encounters'
import { autoPress } from '../src/sim/autocast'
import { autoParty, pickFor } from '../src/sim/classes'

const played = (auto: boolean) => {
  let damage = 0
  let started = 0
  let finished = 0
  let alive = 0
  let seconds = 0
  let presses = 0
  // Ticks where a press was possible and the hand made none: the whole
  // difference between a rotation and a loop is supposed to be here.
  let idle = 0
  let landed = 0
  const picked: Record<number, number> = {}
  let dry = 0
  let powerTicks = 0
  const perPull: string[] = []
  const idleWhy: Record<string, number> = {}
  for (let n = 0; n < 6; n++) {
    const seed = 1000 + n * 137
    const run = createState(seed, 8, autoParty(5, pickFor('mage', 'dps')!), 'normal', 0)
    run.countdown = 0
    const runRng = new Rng(seed)
    let tick = 0
    let casting: string | null = null
    while (run.outcome === 'ongoing' && run.time < encounterAt(run.encounter).enrage + 60) {
      const pressed = auto ? autoPress(run) : tick % 45 === 0 ? [0] : []
      presses += pressed.length
      for (const p of pressed) picked[p] = (picked[p] ?? 0) + 1
      {
        const me = run.actors.find((a) => a.isPlayer)!
        if (me.alive) {
          powerTicks++
          if (me.power < 55) dry++
        }
      }
      const own = run.actors.find((a) => a.isPlayer)!
      if (pressed.length > 0 && own.alive && own.gcd <= 0 && !own.castId) landed++
      if (pressed.length === 0 && own.alive && own.gcd <= 0 && !own.castId) {
        idle++
        const moving =
          Math.hypot(own.pos.x - own.prevPos.x, own.pos.y - own.prevPos.y) > 0.5
        const key = moving ? 'walking' : own.power < own.maxPower * 0.2 ? 'no power' : 'other'
        idleWhy[key] = (idleWhy[key] ?? 0) + 1
      }
      const target = run.actors[run.actors.length - 1]!
      const dx = target.pos.x - own.pos.x
      const dy = target.pos.y - own.pos.y
      const gap = Math.hypot(dx, dy) || 1
      const closing = gap > 200
      step(run, { moveX: closing ? dx / gap : 0, moveY: closing ? dy / gap : 0, pressed }, runRng)
      if (own.castId && own.castId !== casting) started++
      if (casting && !own.castId && own.castRemaining <= 0) finished++
      casting = own.castId
      if (own.alive) alive += 1 / 30
      tick++
    }
    const own = run.actors.find((a) => a.isPlayer)!
    const mine = run.tally[own.id]?.damage ?? 0
    perPull.push(`${mine.toFixed(0)}@${run.time.toFixed(0)}s/${run.outcome}`)
    damage += mine
    seconds += run.time
  }
  return { damage, started, finished, alive, seconds, presses, idle, idleWhy, landed, picked, dry, powerTicks, perPull }
}

for (const [name, hand] of [['mashing', false], ['autocast', true]] as const) {
  const r = played(hand)
  console.log(
    `${name.padEnd(9)} damage ${r.damage.toFixed(0).padStart(6)}` +
      `  presses ${String(r.presses).padStart(5)}` +
      `  casts ${r.finished}/${r.started}` +
      `  alive ${r.alive.toFixed(0)}s of ${r.seconds.toFixed(0)}s` +
      `\n          per second alive ${(r.damage / Math.max(1, r.alive)).toFixed(0)}` +
      `  slots ${JSON.stringify(r.picked)}` +
      `\n          pulls ${r.perPull.join('  ')}` +
      `  too dry for a pyroblast ${((r.dry / Math.max(1, r.powerTicks)) * 100).toFixed(0)}% of the time`,
  )
}

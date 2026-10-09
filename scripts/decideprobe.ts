/**
 * Whether a fight's decision can be got wrong.
 *
 * The same seeds, played by several policies. Three every fight gets:
 *
 * - `idle` presses nothing and stands still;
 * - `rotate` presses the rotation and never moves -- throughput with no
 *   judgement at all, the control that tells a decision from a damage check;
 * - `played` is the harness's stand-in: rotation, and out of anything on the
 *   floor.
 *
 * And whatever `scripts/decisions.ts` gives the fight: `judge`, and the rules
 * judge has to beat (always, never, a fixed threshold). A fight with no entry
 * is probed with `played` as its judge, which is the baseline -- what judgement
 * is worth in a fight that does not ask for any yet.
 *
 * What is read is not one number but the gaps, each with its noise:
 *
 *   judge - idle    >= 20   playing is worth something here
 *   judge - X       >= 20   for every rule X that does not look
 *   judge - rotate  >= 10   and what it is worth is not just damage
 *
 * Ninety pulls a policy by default. Forty was tried on paper and rejected: the
 * gap between two win rates near one half carries about twenty-two points of
 * noise at forty pulls, which is wider than the line it would be judged by.
 *
 *   npm run decideprobe -- gift                     # 10 heroic and 25 normal
 *   npm run decideprobe -- gift 10 heroic 90        # one cell, pulls a policy
 *   npm run decideprobe -- 7                        # by index
 */
import { Rng } from '../src/sim/rng'
import { createState } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { bossOrNone } from '../src/sim/combat'
import { ENCOUNTERS, encounterAt } from '../src/sim/encounters'
import { autoParty, pickFor, type DifficultyId, type RaidSize } from '../src/sim/classes'
import type { PlayerInput, SimState } from '../src/sim/types'
import { DECISIONS, type Policy } from './decisions'

const [fightArg, sizeArg, diffArg, pullsArg] = process.argv.slice(2)
const index = /^\d+$/.test(fightArg ?? '') ? Number(fightArg) : ENCOUNTERS.findIndex((e) => e.id === fightArg)
if (index < 0 || index >= ENCOUNTERS.length) {
  console.error(`no fight "${fightArg}" -- one of: ${ENCOUNTERS.map((e) => e.id).join(', ')}`)
  process.exit(1)
}
const FIGHT = ENCOUNTERS[index]!
const CELLS: Array<[RaidSize, DifficultyId]> = sizeArg
  ? [[Number(sizeArg) as RaidSize, (diffArg ?? 'heroic') as DifficultyId]]
  : [[10, 'heroic'], [25, 'normal']]
const PULLS = Number(pullsArg ?? 90)
/** Attempt nought is a first pull. Eight is the ninth, a party that has learned the fight's hands. */
const ATTEMPTS = [0, 8]

const rotation = (tick: number): number[] => {
  const pressed: number[] = []
  if (tick % 45 === 0) pressed.push(0)
  if (tick % 360 === 0) pressed.push(1)
  if (tick % 540 === 0) pressed.push(2)
  return pressed
}

/** Out of anything on the floor -- the harness's own stand-in. */
export function dodge(s: SimState, pressed: number[]): PlayerInput {
  const p = s.actors.find((a) => a.isPlayer)!
  let moveX = 0
  let moveY = 0
  for (const g of s.ground) {
    const d = Math.hypot(p.pos.x - g.pos.x, p.pos.y - g.pos.y)
    if (d <= g.radius + 20) {
      moveX += (p.pos.x - g.pos.x) / (d || 1)
      moveY += (p.pos.y - g.pos.y) / (d || 1)
    }
  }
  return { moveX, moveY, pressed }
}

const BASE: Record<string, Policy> = {
  idle: () => ({ moveX: 0, moveY: 0, pressed: [] }),
  rotate: (_s, _t, pressed) => ({ moveX: 0, moveY: 0, pressed }),
  played: (s, _t, pressed) => dodge(s, pressed),
}

const decision = DECISIONS[FIGHT.id]
const POLICIES: Record<string, Policy> = { ...BASE, ...(decision?.policies ?? { judge: BASE.played! }) }

interface Pull {
  won: boolean
  died: boolean
  /** The player's own damage a minute, which is the throughput column. */
  dealt: number
  /**
   * Moments the decision came up: a raider's aura that marks it -- `souring`
   * for the gift -- starting. A decision that arrives once a pull is a coin
   * toss, not a thing to get better at.
   */
  moments: number
  /** Crimson bills that landed on the raid: the cast ran out, it was not cut. */
  crimson: number
}

/** The aura whose arrival is the decision coming up, per fight. */
const MOMENT: Record<string, string> = { gift: 'souring' }

function pull(seed: number, attempt: number, size: RaidSize, diff: DifficultyId, policy: Policy): Pull {
  const s = createState(seed, attempt, autoParty(size, pickFor('mage', 'dps')!), diff, index)
  s.countdown = 0
  const rng = new Rng(seed + attempt * 7919)
  let tick = 0
  let moments = 0
  let crimson = 0
  let casting = false
  let cutBefore = 0
  const marked = new Set<number>()
  const mark = MOMENT[FIGHT.id]
  while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
    step(s, policy(s, tick, rotation(tick)), rng)
    tick++
    // A crimson cast that ends without `stopped.crimson` moving was paid.
    const now = bossOrNone(s)?.castId === 'boss_crimson'
    if (casting && !now && (s.stopped.crimson ?? 0) === cutBefore) crimson++
    if (now && !casting) cutBefore = s.stopped.crimson ?? 0
    casting = now
    if (mark) {
      for (const a of s.actors) {
        const on = a.auras.some((au) => au.id === mark)
        if (on && !marked.has(a.id)) moments++
        if (on) marked.add(a.id)
        else marked.delete(a.id)
      }
    }
  }
  const me = s.actors.find((a) => a.isPlayer)!
  return {
    won: s.outcome === 'victory',
    died: !me.alive,
    dealt: ((s.tally[me.id]?.damage ?? 0) / Math.max(1, s.time)) * 60,
    moments,
    crimson,
  }
}

interface Row {
  win: number
  death: number
  dealt: number
  moments: number
  crimson: number
}

/** Two standard errors on the gap between two rates over n pulls each. */
const noise = (a: number, b: number, n: number): number =>
  2 * Math.sqrt((a * (1 - a)) / n + (b * (1 - b)) / n) * 100

const pct = (x: number): string => `${Math.round(x * 100)}`.padStart(4)

console.log(`\n${FIGHT.name} — ${decision ? decision.what : 'no decision registered; played stands in for judge'}`)
console.log(`${PULLS} pulls a policy, the same seeds for every policy\n`)

for (const [size, diff] of CELLS) {
  for (const attempt of ATTEMPTS) {
    const rows: Record<string, Row> = {}
    for (const [name, policy] of Object.entries(POLICIES)) {
      let won = 0
      let died = 0
      let dealt = 0
      let moments = 0
      let crimson = 0
      for (let n = 0; n < PULLS; n++) {
        const r = pull(1000 + n * 137, attempt, size, diff, policy)
        if (r.won) won++
        if (r.died) died++
        dealt += r.dealt
        moments += r.moments
        crimson += r.crimson
      }
      rows[name] = { win: won / PULLS, death: died / PULLS, dealt: dealt / PULLS, moments: moments / PULLS, crimson: crimson / PULLS }
    }

    console.log(`${size} ${diff}, attempt ${attempt + 1}`)
    console.log('  policy        win%  died%  dealt/min  moments/pull  crimson/pull')
    for (const [name, r] of Object.entries(rows)) {
      console.log(
        `  ${name.padEnd(12)} ${pct(r.win)}  ${pct(r.death)}   ${Math.round(r.dealt).toString().padStart(8)}  ${r.moments.toFixed(1).padStart(8)}  ${r.crimson.toFixed(1).padStart(8)}`,
      )
    }
    const judge = rows.judge!
    const gap = (other: string, line: number): string => {
      const o = rows[other]!
      const d = (judge.win - o.win) * 100
      const e = noise(judge.win, o.win, PULLS)
      return `  judge - ${other.padEnd(10)} ${d >= 0 ? '+' : ''}${d.toFixed(0).padStart(3)}  ±${e.toFixed(0).padStart(2)}  ` +
        `${d >= line ? `>= ${line}` : `under ${line}`}`
    }
    console.log(gap('idle', 20))
    for (const name of Object.keys(rows)) {
      if (name in BASE || name === 'judge') continue
      console.log(gap(name, 20))
    }
    console.log(gap('rotate', 10))
    console.log('')
  }
}

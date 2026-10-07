/**
 * Whether being in the fight is worth anything: the player's own bill, and for
 * a melee spec the three ways of standing next to the Bonegrinder (#267, PR A).
 *
 * Two tables, both on the same seeds the harness's `reward` table uses:
 *
 * 1. `played` against `idle` for a caster, at normal and heroic -- the pair the
 *    reward table asks, reproduced here so the numbers #267 quotes (7.6 hits a
 *    minute played against 6.6 idle, at eight pulls, normal) can be read off a
 *    command rather than off an issue.
 * 2. A melee spec (rogue, assassination) under three policies:
 *    - `stayClose` walks up to the boss and never leaves it;
 *    - `stayFar` never goes inside the storm's reach;
 *    - `judge` leaves when the storm is up and the body cannot carry what the
 *      storm bills, and walks back in when it is down.
 *    The line read is `judge - max(stayClose, stayFar)` in win rate. #267's
 *    design needs it at 20 points or better; if it is already there, the
 *    premise ("closeness is a pure loss") is wrong and the design goes back to
 *    the creative director before any window is built.
 *
 * The policies measure the fight, they are not tuned to it. `judge` does what
 * a person would: out while the storm runs, in once it is over, and stays
 * through the storm while it is healthy enough to take the next bite. That
 * threshold is written once, below, and not moved to widen a gap.
 *
 *   npm run idleprobe                    # 90 pulls a row
 *   npm run idleprobe -- 8               # 8 pulls a row (the issue's baseline)
 *   npm run idleprobe -- 90 marrow       # another fight by id or index
 */
import { Rng } from '../src/sim/rng'
import { createState } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { ENCOUNTERS, encounterAt } from '../src/sim/encounters'
import { autoParty, pickFor, type DifficultyId, type Pick, type RaidSize } from '../src/sim/classes'
import { MELEE_RANGE, STORM_REACH } from '../src/sim/constants'
import { boss as bossOf } from '../src/sim/combat'
import type { Actor, PlayerInput, SimState } from '../src/sim/types'

const [pullsArg, fightArg] = process.argv.slice(2)
const PULLS = Number(pullsArg ?? 90)
const fightKey = fightArg ?? 'marrow'
const FIGHT_INDEX = /^\d+$/.test(fightKey) ? Number(fightKey) : ENCOUNTERS.findIndex((e) => e.id === fightKey)
if (FIGHT_INDEX < 0 || FIGHT_INDEX >= ENCOUNTERS.length) {
  console.error(`no fight "${fightKey}" -- one of: ${ENCOUNTERS.map((e) => e.id).join(', ')}`)
  process.exit(1)
}
const FIGHT = ENCOUNTERS[FIGHT_INDEX]!
const SIZE: RaidSize = 10
/** The harness's seeds, so a row here is a row there. */
const seedOf = (n: number): number => 1000 + n * 137

type Policy = (s: SimState, tick: number, pressed: number[]) => PlayerInput

const rotation = (tick: number): number[] => {
  const pressed: number[] = []
  if (tick % 45 === 0) pressed.push(0)
  if (tick % 360 === 0) pressed.push(1)
  if (tick % 540 === 0) pressed.push(2)
  return pressed
}

const me = (s: SimState): Actor => s.actors.find((a) => a.isPlayer)!

/** Out of anything on the floor, or null when nothing is under the player. */
function outOfPuddle(s: SimState): { x: number; y: number } | null {
  const p = me(s)
  let moveX = 0
  let moveY = 0
  for (const g of s.ground) {
    const d = Math.hypot(p.pos.x - g.pos.x, p.pos.y - g.pos.y)
    if (d <= g.radius + 20) {
      moveX += (p.pos.x - g.pos.x) / (d || 1)
      moveY += (p.pos.y - g.pos.y) / (d || 1)
    }
  }
  return moveX === 0 && moveY === 0 ? null : { x: moveX, y: moveY }
}

const toward = (from: Actor, to: Actor): { x: number; y: number } => {
  const d = Math.hypot(to.pos.x - from.pos.x, to.pos.y - from.pos.y) || 1
  return { x: (to.pos.x - from.pos.x) / d, y: (to.pos.y - from.pos.y) / d }
}

const gapTo = (p: Actor, b: Actor): number => Math.hypot(b.pos.x - p.pos.x, b.pos.y - p.pos.y)
const storming = (b: Actor): boolean => b.auras.some((a) => a.id === 'storming')
/** Close enough to hit: the melee reach past both bodies' edges. */
const hitting = (p: Actor, b: Actor): boolean => gapTo(p, b) <= MELEE_RANGE + p.radius + b.radius

/** Puddles first, then whatever the policy wants for its feet. */
function steer(s: SimState, pressed: number[], want: (p: Actor, b: Actor) => { x: number; y: number }): PlayerInput {
  const dodge = outOfPuddle(s)
  if (dodge) return { moveX: dodge.x, moveY: dodge.y, pressed }
  const v = want(me(s), bossOf(s))
  return { moveX: v.x, moveY: v.y, pressed }
}

const still = { x: 0, y: 0 }

/** The reach plus a margin, so "outside" means outside after the next step. */
const SAFE = STORM_REACH + 60

const close = (p: Actor, b: Actor) => (hitting(p, b) ? still : toward(p, b))
const away = (p: Actor, b: Actor) => {
  const t = toward(p, b)
  return gapTo(p, b) < SAFE + p.radius ? { x: -t.x, y: -t.y } : still
}

/**
 * How much of its health the player must have to take the storm's next bite.
 * Half: the bite at the middle is a tenth or two of a rogue's health, so
 * under half it is time to go. Written once; not a knob.
 */
const CARRY = 0.5

const POLICIES: Record<string, Policy> = {
  idle: () => ({ moveX: 0, moveY: 0, pressed: [] }),
  played: (s, _t, pressed) => steer(s, pressed, () => still),
  stayClose: (s, _t, pressed) => steer(s, pressed, close),
  stayFar: (s, _t, pressed) => steer(s, pressed, away),
  judge: (s, _t, pressed) =>
    steer(s, pressed, (p, b) => {
      if (!storming(b)) return close(p, b)
      return p.hp / p.maxHp > CARRY ? close(p, b) : away(p, b)
    }),
}

interface Pull {
  won: boolean
  died: boolean
  time: number
  hits: number
  taken: number
  bossPct: number
}

function pull(seed: number, attempt: number, party: Pick[], diff: DifficultyId, policy: Policy): Pull {
  const s = createState(seed, attempt, party, diff, FIGHT_INDEX)
  s.countdown = 0
  const rng = new Rng(seed + attempt * 7919)
  let tick = 0
  while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
    step(s, policy(s, tick, rotation(tick)), rng)
    tick++
  }
  const p = me(s)
  const b = bossOf(s)
  const bill = s.tally[p.id]
  return {
    won: s.outcome === 'victory',
    died: !p.alive,
    time: s.time,
    hits: bill?.mechanicHits ?? 0,
    taken: bill?.damageTaken ?? 0,
    bossPct: (b.hp / b.maxHp) * 100,
  }
}

interface Row {
  win: number
  died: number
  time: number
  hitsMin: number
  takenMin: number
  bossPct: number
  wins: number
}

function row(party: Pick[], diff: DifficultyId, policy: Policy, attempt = 0, attemptStep = 0): Row {
  let wins = 0
  let died = 0
  let seconds = 0
  let hits = 0
  let taken = 0
  let left = 0
  for (let n = 0; n < PULLS; n++) {
    const r = pull(seedOf(n), attempt + n * attemptStep, party, diff, policy)
    if (r.won) wins++
    if (r.died) died++
    seconds += r.time
    hits += r.hits
    taken += r.taken
    left += r.bossPct
  }
  return {
    win: wins / PULLS,
    wins,
    died: died / PULLS,
    time: seconds / PULLS,
    hitsMin: seconds > 0 ? (hits / seconds) * 60 : 0,
    takenMin: seconds > 0 ? (taken / seconds) * 60 : 0,
    bossPct: left / PULLS,
  }
}

const pct = (x: number): string => `${Math.round(x * 100)}%`.padStart(5)
const noise = (a: number, b: number): number => 2 * Math.sqrt((a * (1 - a)) / PULLS + (b * (1 - b)) / PULLS) * 100
const line = (name: string, r: Row): string =>
  `  ${name.padEnd(10)} ${pct(r.win)}  ${pct(r.died)}  ${r.time.toFixed(0).padStart(5)}s  ${r.bossPct.toFixed(0).padStart(4)}%  ` +
  `${r.hitsMin.toFixed(1).padStart(8)}  ${r.takenMin.toFixed(0).padStart(9)}`
const HEAD = '  policy        win%  died%   avgTime  bossHP%  hits/min  taken/min'

console.log(`\n${FIGHT.name}, ${SIZE}-man, ${PULLS} pulls a row, the same seeds for every policy`)

console.log('\n== 1. is playing worth it: a caster (frost mage), played against idle ==')
const caster = autoParty(SIZE, pickFor('mage', 'dps')!)
for (const diff of ['normal', 'heroic'] as DifficultyId[]) {
  console.log(`${diff}\n${HEAD}`)
  const played = row(caster, diff, POLICIES.played!)
  const idle = row(caster, diff, POLICIES.idle!)
  console.log(line('played', played))
  console.log(line('idle', idle))
  console.log(
    `  hits/min played ${played.hitsMin.toFixed(1)} vs idle ${idle.hitsMin.toFixed(1)}: ` +
      `${played.hitsMin > idle.hitsMin ? 'REVERSED (playing is billed more)' : 'ok'}`,
  )
}

console.log('\n== 2. a melee spec (rogue, assassination): close, far, judged ==')
const melee = autoParty(SIZE, { classId: 'rogue', spec: 'assassination' })
for (const diff of ['normal', 'heroic'] as DifficultyId[]) {
  console.log(`${diff}\n${HEAD}`)
  const rows: Record<string, Row> = {}
  for (const name of ['idle', 'stayClose', 'stayFar', 'judge']) {
    rows[name] = row(melee, diff, POLICIES[name]!)
    console.log(line(name, rows[name]!))
  }
  const judge = rows.judge!
  const best = rows.stayClose!.win >= rows.stayFar!.win ? 'stayClose' : 'stayFar'
  const rival = rows[best]!
  const d = (judge.win - rival.win) * 100
  console.log(
    `  judge - max(stayClose, stayFar) [${best}]  ${d >= 0 ? '+' : ''}${d.toFixed(0)}  ±${noise(judge.win, rival.win).toFixed(0)}  ` +
      `${d >= 20 ? '>= 20: PREMISE WRONG, back to creative-director before B' : 'under 20: the premise holds'}`,
  )
}

// The issue's "budget of ten rooms, zero wins" is a browser plan; this is its
// nearest sim stand-in: eight consecutive pulls of the walking-in melee, which
// is `stayClose`, each one attempt further on.
console.log('\n== 3. budget stand-in: stayClose, normal, eight pulls on attempts 0..7 ==')
{
  let wins = 0
  for (let n = 0; n < 8; n++) if (pull(seedOf(0), n, melee, 'normal', POLICIES.stayClose!).won) wins++
  console.log(`  ${wins}/8 won`)
}

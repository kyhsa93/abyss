/**
 * The stand-in for the player's own slot, and the pull it drives.
 *
 * Lifted out of `harness.ts` so that a script which is not the harness can run
 * the same pull the harness runs. `harness.ts` is a gate: it prints every table
 * when it is imported, takes its shard from the environment, and anything added
 * to it moves the shard counts and the CI time. A diagnostic that needs `run`
 * has to get it from somewhere that prints nothing.
 *
 * Nothing in here changed on the way out: same arithmetic, same order, same
 * bytes of output from the harness tables that call it.
 */
import { Rng } from '../src/sim/rng'
import { createState, unattended } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { encounterAt } from '../src/sim/encounters'
import { autoParty, pickFor, type DifficultyId, type Pick } from '../src/sim/classes'
import type { PlayerInput, SimState } from '../src/sim/types'
import { boss as bossOf } from '../src/sim/combat'

/** Compositions a player might actually build, including bad ones. */
export const dps = (classId: Pick['classId']): Pick => pickFor(classId, 'dps')!
export const heal = (classId: Pick['classId']): Pick => pickFor(classId, 'healer')!
export const tank = (classId: Pick['classId']): Pick => pickFor(classId, 'tank')!

/**
 * The raid the stand-in is dropped into: `autoParty` with the player's slot
 * given to `lead`, and the other slots filled by role in its fixed order.
 *
 * The default is the mage every table here has always put in slot zero. It is a
 * parameter so that a table can ask the same question of another lead without
 * copying the call; the default is what keeps the tables that do not ask
 * byte-for-byte what they were.
 */
export const standinParty = (size: number, lead: Pick = dps('mage')): Pick[] => autoParty(size, lead)

/** The rotation on cooldown: slot 0 every 45 ticks, slot 1 every 360, slot 2 every 540. */
export const rotation = (tick: number): number[] => {
  const pressed: number[] = []
  if (tick % 45 === 0) pressed.push(0)
  if (tick % 360 === 0) pressed.push(1)
  if (tick % 540 === 0) pressed.push(2)
  return pressed
}

/** Crude stand-in for a competent human: run out of any puddle, else stand still. */
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

export interface Report {
  outcome: string
  time: number
  bossPct: number
  inPuddle: Record<string, number>
  /** Metres walked per second of fight. */
  travel: Record<string, number>
  /** Same, but only while no ground effect exists — pure wasted motion. */
  idleTravel: Record<string, number>
  deaths: Record<string, number>
  /**
   * The player's own bill, which is the one thing every other row here averages
   * away. The party's numbers say whether the raid coped; these say whether the
   * body a person steers was doing anything.
   */
  playerHits: number
  playerTaken: number
  playerDied: boolean
  /** Party bodies dead at the end of the pull, the player's slot included. */
  partyDeaths: number
  /**
   * The lowest the raid's pooled health got during the pull, as a percentage of
   * its pooled maximum (sum of hp over sum of maxHp across the whole party side,
   * the dead counted as zero), to one decimal. Pooled: one body at the floor is
   * averaged into everyone else.
   */
  minRaidHp: number
  minMemberHp: number
}

/**
 * How the player's own slot is driven.
 *
 * `played` is the stand-in above: out of any puddle, rotation on cooldown. `idle`
 * is a body that is still the player's and does nothing at all -- no movement, no
 * presses. The pair is the only way to ask whether a fight is worth playing, and
 * it is deliberately not `unattended`, which hands the slot to the AI.
 *
 * `unattended` is that third thing, named so a diagnostic can set it beside
 * `idle` in the very same pull: same party, same seed, same stream, and the only
 * difference is whether the slot's body is standing there or being run by the AI.
 * No table the harness prints asks for it.
 */
export type RaidDrive = 'played' | 'idle' | 'unattended'

export function run(
  seed: number,
  attempt: number,
  party?: Pick[],
  difficulty: DifficultyId = 'normal',
  encounter = 0,
  drive: RaidDrive = 'played',
): Report {
  const s = createState(seed, attempt, party, difficulty, encounter)
  // The attempt goes in again on purpose: `unattended` defaults to attempt 6,
  // which is not the attempt the slot's body was built at, and the AI that takes
  // the slot would be a different one from the AI around it.
  if (drive === 'unattended') unattended(s, attempt)
  // The pull's opening countdown is skipped rather than waited out. No time
  // passes during it, so the fight is identical either way — this is only
  // ninety ticks per run of nobody doing anything, times several thousand.
  s.countdown = 0
  const rng = new Rng(seed + attempt * 7919)
  const ticksIn: Record<string, number> = {}
  const deaths: Record<string, number> = {}
  const walked: Record<string, number> = {}
  const walkedQuiet: Record<string, number> = {}
  let ticks = 0
  let minRaidHp = 100
  let minMemberHp = 100

  while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
    // Fire abilities roughly on cooldown.
    const pressed: number[] = drive === 'played' ? rotation(ticks) : []

    // A tick with nothing on the floor is a tick nobody should be running.
    const quiet = s.ground.length === 0
    const before = new Map(s.actors.map((a) => [a.id, { x: a.pos.x, y: a.pos.y }]))

    step(s, drive === 'played' ? dodge(s, pressed) : { moveX: 0, moveY: 0, pressed }, rng)
    ticks++

    let hpNow = 0
    let hpMax = 0
    for (const a of s.actors) {
      if (a.faction !== 'party') continue
      hpNow += a.alive ? a.hp : 0
      hpMax += a.maxHp
      if (a.maxHp > 0) minMemberHp = Math.min(minMemberHp, ((a.alive ? a.hp : 0) / a.maxHp) * 100)
    }
    if (hpMax > 0) minRaidHp = Math.min(minRaidHp, (hpNow / hpMax) * 100)

    for (const a of s.actors) {
      if (a.faction !== 'party' || a.isPlayer || !a.alive) continue
      const p = before.get(a.id)
      if (!p) continue
      const d = Math.hypot(a.pos.x - p.x, a.pos.y - p.y)
      walked[a.name] = (walked[a.name] ?? 0) + d
      if (quiet) walkedQuiet[a.name] = (walkedQuiet[a.name] ?? 0) + d
    }

    for (const a of s.actors) {
      if (a.faction !== 'party' || a.isPlayer) continue
      if (!a.alive) {
        if (deaths[a.name] === undefined) deaths[a.name] = Math.round(s.time * 10) / 10
        continue
      }
      // Anything on the floor that has gone off. It used to name the pool,
      // because a growing ring is also "detonated" and its radius covers the
      // arena, which marked the whole party as standing in fire. Both of those
      // shapes are gone: what is left is floor that burns where it landed.
      const inside = s.ground.some(
        (g) =>
          g.detonated &&
          Math.hypot(a.pos.x - g.pos.x, a.pos.y - g.pos.y) <= g.radius,
      )
      if (inside) ticksIn[a.name] = (ticksIn[a.name] ?? 0) + 1
    }
  }

  // `boss(s)` by id, not the last actor: adds and the stalker are appended to
  // the roster as they spawn, so the tail of it is whatever was summoned most
  // recently. Every row for a boss with `adds` or `hunt` in its kit — which is
  // the Choir's and the Tidebreaker's — has been reporting an add's health as
  // the boss's, and reading a won pull as one that left a third of the boss
  // standing.
  const fought = bossOf(s)
  const pct: Record<string, number> = {}
  for (const a of s.actors) {
    if (a.faction !== 'party' || a.isPlayer) continue
    pct[a.name] = Math.round(((ticksIn[a.name] ?? 0) / ticks) * 1000) / 10
  }

  const travel: Record<string, number> = {}
  const idleTravel: Record<string, number> = {}
  for (const a of s.actors) {
    if (a.faction !== 'party' || a.isPlayer) continue
    travel[a.name] = (walked[a.name] ?? 0) / Math.max(1, s.time)
    idleTravel[a.name] = (walkedQuiet[a.name] ?? 0) / Math.max(1, s.time)
  }

  // The player's slot, by the ledger the fight writes and never reads back.
  const me = s.actors.find((a) => a.isPlayer)
  const bill = me ? s.tally[me.id] : undefined
  return {
    outcome: s.outcome,
    time: Math.round(s.time * 10) / 10,
    bossPct: Math.round((fought.hp / fought.maxHp) * 1000) / 10,
    inPuddle: pct,
    travel,
    idleTravel,
    deaths,
    playerHits: bill?.mechanicHits ?? 0,
    playerTaken: Math.round(bill?.damageTaken ?? 0),
    playerDied: me !== undefined && !me.alive,
    partyDeaths: Object.keys(deaths).length + (me !== undefined && !me.alive ? 1 : 0),
    minRaidHp: Math.round(minRaidHp * 10) / 10,
    minMemberHp: Math.round(minMemberHp * 10) / 10,
  }
}

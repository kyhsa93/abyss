/**
 * Which seconds of a pull ask nothing.
 *
 * The complaint this exists to answer is the owner's, and it is not "too hard"
 * or "too fast": it is that the fight is the same fight every time and there is
 * nothing in it to decide. What was measured so far only reaches the edge of
 * that -- a body that presses nothing wins ten-normal outright, and four fights
 * on the roster come out the same whether anybody plays them or not. Both say
 * *the pull* asks nothing. Neither says *which part of it*.
 *
 * Six probes already sit next to this one and none of them asks this. `paceprobe`
 * asks whether there is time to read a thing; `teachprobe` what practice removes;
 * `momentprobe2` how many moments are worth a raid cooldown; `mashprobe` whether
 * the rotation is worth turning on; `aiprobe` whether the party plays its classes;
 * `momentprobe` what one mechanic throws. All of them are about a thing the fight
 * does. This is about a thing the fight does *not* do.
 *
 * The method is the determinism. Same seed, same fight, down to the tick -- so
 * the pull can be run twice, identical in every respect except that the player
 * does nothing for one ten-second window, and the difference is exactly what
 * those ten seconds were worth. Do that for every window and the empty ones name
 * themselves.
 *
 * **Throughput is not a decision, and the two numbers are kept apart.** Idling
 * through any window costs some boss health, because a body not pressing is a
 * body not dealing damage; that is uptime, and a fight made only of it is a fight
 * with nothing to decide however much damage it wants. What makes a window a
 * decision is that letting go of it can *lose* something -- the player dies, or
 * the pull does. So `cost` is printed and `risk` is what is read.
 *
 *   npm run deadprobe                 # the reference fight, 10 heroic
 *   npm run deadprobe -- 3 25 normal  # a boss index, a size, a difficulty
 *   npm run deadprobe -- all          # every fight, one line each
 */
import { Rng } from '../src/sim/rng'
import { createState } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { ENCOUNTERS, encounterAt } from '../src/sim/encounters'
import { autoParty, pickFor, RAID_SIZES, type DifficultyId, type Pick, type RaidSize } from '../src/sim/classes'
import type { PlayerInput, SimState } from '../src/sim/types'

const ALL = process.argv[2] === 'all'
const ONE = ALL ? 0 : Number(process.argv[2] ?? 0)
const SIZE = Number(process.argv[3] ?? RAID_SIZES[0]) as RaidSize
const DIFF = (process.argv[4] ?? 'heroic') as DifficultyId
/** Seeds per window. Eight is enough to tell "never" from "sometimes". */
const SEEDS = Number(process.argv[5] ?? 8)
/** Ten seconds: long enough to contain a mechanic, short enough to locate one. */
const WINDOW = 10

const dps = (classId: Pick['classId']): Pick => pickFor(classId, 'dps')!

/** The harness's own stand-in for a competent player, so the rows compare. */
function played(s: SimState, pressed: number[]): PlayerInput {
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

interface Pull {
  won: boolean
  bossPct: number
  died: boolean
  time: number
}

/**
 * One pull, with the player's hands taken away between `from` and `to`.
 *
 * `from` past the end of the fight is the baseline: nothing is taken away and
 * the run is the one every window is compared against.
 */
function pull(seed: number, encounter: number, from: number, to: number): Pull {
  const party = autoParty(SIZE, dps('mage'))
  const s = createState(seed, 0, party, DIFF, encounter)
  s.countdown = 0
  const rng = new Rng(seed + 7919)
  let ticks = 0

  while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
    const quiet = s.time >= from && s.time < to
    const pressed: number[] = []
    if (!quiet) {
      if (ticks % 45 === 0) pressed.push(0)
      if (ticks % 360 === 0) pressed.push(1)
      if (ticks % 540 === 0) pressed.push(2)
    }
    step(s, quiet ? { moveX: 0, moveY: 0, pressed } : played(s, pressed), rng)
    ticks++
  }

  const me = s.actors.find((a) => a.isPlayer)!
  const boss = s.actors.find((a) => a.faction === 'boss')
  return {
    won: s.outcome === 'victory',
    bossPct: boss ? (boss.hp / boss.maxHp) * 100 : 0,
    died: !me.alive,
    time: s.time,
  }
}

function look(encounter: number): { windows: number; dead: number; line: string } {
  const seeds = Array.from({ length: SEEDS }, (_, n) => 1000 + n * 137)
  // The baseline, and how long the fight runs when it is played.
  const base = seeds.map((seed) => pull(seed, encounter, Infinity, Infinity))
  const span = Math.max(...base.map((b) => b.time))

  const rows: string[] = []
  let dead = 0
  let windows = 0
  for (let from = 0; from < span; from += WINDOW) {
    // Only the seeds whose fight was still going in this window. The span is the
    // longest pull of the set, so the late windows exist in one slow seed and not
    // in the rest -- and counting a window nobody was still fighting in as one
    // that "asks nothing" is how this probe would have reported half the first
    // boss as empty when the last fifty seconds of it were simply over.
    const live = base.map((b, i) => ({ b, i })).filter(({ b }) => b.time > from)
    if (live.length === 0) break
    windows++
    let slower = 0
    let risk = 0
    for (const { b, i } of live) {
      const idled = pull(seeds[i]!, encounter, from, from + WINDOW)
      // Seconds the pull took longer for letting go, not boss health left at the
      // end. Health saturates the moment the pull is winnable: the boss dies
      // either way, so the end state is nought both times and ten seconds of a
      // player not pressing reads as free. Time does not saturate.
      slower += idled.time - b.time
      // Something was lost that the played run kept. Either is a decision.
      if ((idled.died && !b.died) || (!idled.won && b.won)) risk++
    }
    if (risk === 0) dead++
    rows.push(
      `${String(from).padStart(4)}-${String(from + WINDOW).padEnd(4)} ` +
        `cost ${(slower / live.length).toFixed(1).padStart(5)}s  ` +
        `risk ${risk}/${live.length}` +
        `${live.length < seeds.length ? `  (${live.length} of ${seeds.length} still fighting)` : ''}` +
        `${risk === 0 ? '   <- asks nothing' : ''}`,
    )
  }

  if (!ALL) {
    console.log(`\n${ENCOUNTERS[encounter]!.name} — ${SIZE} ${DIFF}, ${SEEDS} seeds a window`)
    console.log('  cost is seconds the pull took longer for letting go: that is uptime, not a decision.')
    console.log('  risk is how many seeds lost the player or the pull for letting go. That is one.\n')
    for (const r of rows) console.log(`  ${r}`)
  }
  return {
    windows,
    dead,
    line:
      `${ENCOUNTERS[encounter]!.name}`.padEnd(23) +
      `${dead}/${windows}`.padEnd(8) +
      `${Math.round((dead / windows) * 100)}%`.padEnd(7) +
      `${Math.round(span)}s`,
  }
}

if (ALL) {
  console.log(
    `\nfight                  dead    share  pull    (${SEEDS} seeds a window, ${WINDOW}s windows, ${SIZE} ${DIFF})` +
      `\n(dead = windows where letting go of the controls lost nothing, ever)`,
  )
  for (let i = 0; i < ENCOUNTERS.length; i++) console.log(look(i).line)
} else {
  const { dead, windows } = look(ONE)
  console.log(
    `\n  ${dead} of ${windows} windows ask nothing — ${Math.round((dead / windows) * 100)}% of the pull.`,
  )
}

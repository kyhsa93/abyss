/**
 * How much time the fight gives a person to see a thing and answer it.
 *
 * The complaint this exists to answer is that the fight is too fast to read:
 * not too hard, too fast. Those are different failures with different fixes,
 * and the difference is measurable. A mechanic that kills you because you
 * could not get out in time is a tuning problem. A mechanic that kills you
 * before you had finished noticing it is a legibility problem, and no amount
 * of nerfing the damage fixes it — the player still cannot see what happened,
 * so they still cannot learn it.
 *
 * Two numbers separate them.
 *
 * The first is warning: seconds from the moment a thing becomes visible to the
 * moment it lands. The bar to clear is not reaction time. Simple reaction to a
 * light is a quarter second, but this is not that task — a player has to
 * notice something appeared, work out which of a dozen things it is, decide
 * where the answer is, and then travel there. The recognise-and-choose part
 * alone runs half a second before a foot moves, and the travel is on top.
 *
 * The second is spacing: seconds between one thing appearing and the next.
 * A fight can give generous warning on every single mechanic and still be
 * unreadable if three of them are always in the air at once, because the
 * player never gets to finish reading one before the next arrives.
 *
 * Both are counted in events rather than in objects. Twelve puddles that
 * appear on the same tick are one thing to read and one place to stand, and
 * counting them as twelve says a fight throws a hundred and forty-seven
 * mechanics a minute when it throws eleven. The first draft of this did
 * exactly that, and the number it produced was so large it hid the real one.
 */
import { autoParty, pickFor, type DifficultyId, type Pick, type RaidSize } from '../src/sim/classes'
import { ENCOUNTERS, encounterAt } from '../src/sim/encounters'
import { DT, GLOBAL_COOLDOWN } from '../src/sim/constants'
import { createState } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { Rng } from '../src/sim/rng'

const SIZE = Number(process.argv[2] ?? 10) as RaidSize
const DIFF = (process.argv[3] ?? 'normal') as DifficultyId
const ATTEMPT = Number(process.argv[4] ?? 8)
const RUNS = Number(process.argv[5] ?? 8)

const party = autoParty(SIZE, pickFor('mage', 'dps') as Pick)

interface Seen {
  /** Seconds of warning, one entry per appearance. */
  warning: number[]
  /** Seconds since the previous thing of any kind appeared. */
  after: number[]
}

function blank(): Seen {
  return { warning: [], after: [] }
}

console.log(`${SIZE}-player ${DIFF}, pull ${ATTEMPT + 1}, ${RUNS} pulls a boss`)
console.log(`the game's own unit of action is one global: ${GLOBAL_COOLDOWN}s`)

for (let e = 0; e < ENCOUNTERS.length; e++) {
  const kinds = new Map<string, Seen>()
  let onScreen = 0
  let ticks = 0
  let crowded = 0

  for (let n = 0; n < RUNS; n++) {
    const seed = 1000 + n * 137
    const s = createState(seed, ATTEMPT, party, DIFF, e)
    s.countdown = 0
    const rng = new Rng(seed + ATTEMPT * 7919)
    const known = new Set<number>()
    let castWas: string | null = null
    let last = 0

    while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)

      // Anything on the floor that has not gone off yet is a thing the player
      // is being asked to read. The telegraph it was born with is the warning.
      let live = 0
      const fresh = new Map<string, number>()
      for (const g of s.ground) {
        if (g.telegraph > 0) live++
        if (known.has(g.id)) continue
        known.add(g.id)
        if (g.telegraph <= 0) continue
        // One entry a kind a tick: a cast that drops eleven pools drops one
        // shape, and the player reads the shape.
        // Plus the tick that has already run: the floor is sampled after the
        // step that created it, and reporting 1.47 for a 1.5 makes every
        // number here a hair short of the truth.
        fresh.set(g.kind, Math.max(fresh.get(g.kind) ?? 0, g.telegraph + DT))
      }
      for (const [kind, warning] of fresh) {
        const seen = kinds.get(kind) ?? blank()
        seen.warning.push(warning)
        seen.after.push(s.time - last)
        kinds.set(kind, seen)
        last = s.time
      }

      // A boss cast is the other kind of warning, and the only one for the
      // mechanics that land on a person rather than on a patch of floor.
      const b = s.actors.find((a) => a.id === 100)
      const casting = b?.alive ? b.castId : null
      if (casting && casting !== castWas) {
        const seen = kinds.get(casting) ?? blank()
        seen.warning.push(b!.castTotal)
        seen.after.push(s.time - last)
        kinds.set(casting, seen)
        last = s.time
      }
      castWas = casting ?? null
      if (casting) live++

      onScreen += live
      if (live >= 2) crowded++
      ticks++
    }
  }

  const rows = [...kinds.entries()].sort(
    (a: [string, Seen], b: [string, Seen]) => median(a[1].warning) - median(b[1].warning),
  )
  console.log(`\n${encounterAt(e).name}`)
  console.log('  ' + 'what'.padEnd(18) + 'warning'.padStart(9) + 'gap'.padStart(8) + '  per minute')
  for (const [kind, seen] of rows) {
    const warn = median(seen.warning)
    const flag = warn < GLOBAL_COOLDOWN ? '  <- under one global' : ''
    console.log(
      '  ' +
        kind.padEnd(18) +
        `${warn.toFixed(2)}s`.padStart(9) +
        `${median(seen.after).toFixed(1)}s`.padStart(8) +
        `${(seen.warning.length / RUNS).toFixed(1)}`.padStart(12) +
        flag,
    )
  }
  const events = [...kinds.values()].reduce((n, seen) => n + seen.warning.length, 0)
  const seconds = ticks / RUNS / 30
  console.log(
    `  ${(events / RUNS / seconds * 60).toFixed(0)} things to read a minute, ` +
      `one every ${(seconds / (events / RUNS)).toFixed(1)}s; ` +
      `${(crowded / ticks * 100).toFixed(0)}% of the pull has two or more in the air`,
  )
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

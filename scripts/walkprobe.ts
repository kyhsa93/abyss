/**
 * Every corridor in the citadel, walked by a player who heads for the far door.
 *
 * Each passage that has ground is built on its own (`groundFor`) and walked
 * with the player steering straight at the door it leads to and pressing the
 * rotation; the party follows as it does in the game. Printed: whether it got
 * through, how long it took, the most bodies awake at once, and how far from
 * the door the player ended.
 *
 * What it is not: the walk the game actually plays. An evening is one walk
 * across the whole building (`TravelState.building`), and which room the party
 * is in, and when a doorway hands it to the next, is decided frame by frame in
 * `main.ts` (`roomUnderfoot`, `harvest`, `stepped`). That is where #281 stalls
 * and it is not reachable from here -- built from the same pieces outside
 * `main.ts`, the player stands against the first room's wall and never leaves
 * it. This prints the per-corridor times a walking budget can be read against;
 * the stall wants that logic out of `main.ts` first (#297).
 *
 *   npm run walkprobe           # 240 seconds a corridor
 *   npm run walkprobe -- 400
 *   npm run walkprobe -- 240 25  # and a raid of twenty-five instead of ten
 *   npm run walkprobe -- 240 10 5  # five seeds a corridor (1000 to 1004): the mean, and how many won
 */
import { Rng } from '../src/sim/rng'
import { createCorridorState } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { PASSAGES, groundFor, chamberAt } from '../src/dungeon'
import { autoParty, pickFor } from '../src/sim/classes'
import { awake } from '../src/sim/travel'

const LIMIT = Number(process.argv[2] ?? 240)
const SIZE = Number(process.argv[3] ?? 10) as 5 | 10 | 25
const SEEDS = Number(process.argv[4] ?? 1)
for (const p of PASSAGES) {
  const corridor = groundFor(p.from, p.to)
  if (!corridor) continue
  const way = corridor.ways.find((w) => w.to === p.to) ?? corridor.ways[0]!
  const times: number[] = []
  let won = 0
  let last = ''
  for (let k = 0; k < SEEDS; k++) {
    const s = createCorridorState(1000 + k, autoParty(SIZE, pickFor('warrior', 'tank')!), corridor, 'normal', 4)
    const rng = new Rng(1000 + k)
    let tick = 0
    let peak = 0
    while (s.outcome === 'ongoing' && s.time < LIMIT) {
      const me = s.actors.find((a) => a.isPlayer)!
      const dx = way.at.x - me.pos.x
      const dy = way.at.y - me.pos.y
      step(s, { moveX: dx, moveY: dy, pressed: tick % 45 === 0 ? [0] : [] }, rng)
      peak = Math.max(peak, awake(s).length)
      tick++
    }
    const me = s.actors.find((a) => a.isPlayer)!
    times.push(s.time)
    if (s.outcome === 'victory') won++
    last =
      `${s.outcome.padEnd(8)} ${s.time.toFixed(1).padStart(6)}s  ` +
      `awake peak ${peak}  left ${Math.round(Math.hypot(way.at.x - me.pos.x, way.at.y - me.pos.y))}u from the door`
  }
  const head = `${p.from} -> ${p.to}`.padEnd(32) + `${(chamberAt(p.to)?.wing ?? '?').padEnd(10)} `
  if (SEEDS === 1) console.log(head + last)
  else {
    const mean = times.reduce((a, b) => a + b, 0) / times.length
    console.log(head + `won ${won}/${SEEDS}  mean ${mean.toFixed(1).padStart(6)}s  (${times.map((x) => x.toFixed(0)).join(' ')})`)
  }
}

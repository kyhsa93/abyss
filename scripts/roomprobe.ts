// What the rooms a raid fights in actually look like, and whether anyone is
// stuck in one.
//
// Two questions now, not one. The first is the one it always asked: is any
// body standing inside a rock. The second only became askable when a room
// stopped being a constant — is any body standing outside the room at all,
// which is the failure a rectangle can have and a disc cannot. A candidate
// ring sampled around a body, an idle ring drawn around the boss and a
// terrain roll written in polar coordinates were all, until now, allowed to
// assume that "inside the arena" meant "within 920 of the middle".
import { Rng } from '../src/sim/rng'
import { createState } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { inTerrain } from '../src/sim/battleground'
import { ENCOUNTERS, encounterAt } from '../src/sim/encounters'
import { insideRoom, onEdge, type RoomShape } from '../src/sim/room'
import { autoParty, pickFor, type Pick, type RaidSize } from '../src/sim/classes'
import type { PlayerInput } from '../src/sim/types'

const dps = (classId: Pick['classId']): Pick => pickFor(classId, 'dps')!
function playerInput(): PlayerInput {
  return { moveX: 0, moveY: 0, pressed: [] }
}

/**
 * The shapes, and why these two are the ones the probe invents.
 *
 * No fight names a room of its own yet — the first ones to do it are the
 * chambers being written against this — so the shapes that are not the disc
 * have to be handed to a boss here. Sized as the specifications they are for:
 * a hall about as much floor as the disc and twice as long as it is wide, and
 * a platform at the disc's own radius. A room the probe has never run is a
 * room whose first player is the first player.
 */
const SHAPES: Array<{ name: string; room: RoomShape | null }> = [
  { name: 'as written', room: null },
  { name: 'hall', room: { kind: 'hall', halfWidth: 560, front: 1560, back: 720 } },
  { name: 'platform', room: { kind: 'platform', radius: 880 } },
]

const RUNS = 40

/**
 * How much brushing against a rock is allowed.
 *
 * Not zero, and the number is measured rather than chosen: the disc as it
 * stands sits at 0.12% of body-ticks, because a body can be pushed into a rock
 * by a step it did not choose — a knockback, a crowd — and is slid back out on
 * the tick after. What would be a failure is a body that stays, and at this
 * scale a body that stays reads as whole percent.
 *
 * The room test below has no such allowance. Nobody is ever outside the room,
 * because every step is pushed back in, and a single tick outside means some
 * new code moved a body without asking the room.
 */
const STUCK_BAR = 0.2
let failed = false

for (const shape of SHAPES) {
  const counts: number[] = []
  let stuckTicks = 0
  let outsideTicks = 0
  let edgeTicks = 0
  let falls = 0
  let ticks = 0

  for (let e = 0; e < ENCOUNTERS.length; e++) {
    const fight = ENCOUNTERS[e]!
    const written = fight.room
    // Handed to the encounter rather than to the state, so that everything
    // derived from a room at build time — the terrain roll above all — is
    // derived from this one.
    if (shape.room) fight.room = shape.room

    for (let n = 0; n < RUNS; n++) {
      const seed = 1000 + n * 137
      const s = createState(seed, 8, autoParty(10 as RaidSize, dps('mage')), 'normal', e)
      s.countdown = 0
      counts.push(s.obstacles.length)
      const rng = new Rng(seed + 7919)
      while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
        step(s, playerInput(), rng)
        for (const a of s.actors) {
          if (!a.alive) continue
          ticks++
          // Nine tenths, so a body brushing a rock is not counted as inside it.
          if (inTerrain(s.obstacles, a.pos, a.radius * 0.9)) stuckTicks++
          if (!insideRoom(s.room, a.pos, a.radius * 0.9)) outsideTicks++
          if (onEdge(s.room, a.pos, a.radius)) edgeTicks++
        }
        // The one death this room can deal that nothing else can. Counted off
        // the word the fall writes on the floor rather than off the tally,
        // because what is being asked is "did anybody go over the side",
        // which is a different question from "did anybody die".
        for (const text of s.texts) {
          if (text.text === 'FELL' && text.age === 0) falls++
        }
      }
    }

    if (written) fight.room = written
    else delete fight.room
  }

  const hist: Record<number, number> = {}
  for (const c of counts) hist[c] = (hist[c] ?? 0) + 1
  const stuck = (stuckTicks / ticks) * 100
  const outside = (outsideTicks / ticks) * 100
  console.log(`\n${shape.name}`)
  console.log(
    '  rocks a room:',
    Object.entries(hist)
      .map(([k, v]) => `${k}: ${((v / counts.length) * 100).toFixed(0)}%`)
      .join('  '),
  )
  console.log(`  bodies inside a rock: ${stuck.toFixed(3)}% of body-ticks`)
  console.log(`  bodies outside the room: ${outside.toFixed(3)}% of body-ticks`)
  console.log(`  bodies on the brink: ${((edgeTicks / ticks) * 100).toFixed(3)}% of body-ticks`)
  console.log(`  bodies that fell off: ${falls}`)
  // Falls are the bar the platform is held to. Nothing in the game pushes a
  // body yet, and the party is never handed a target off the floor, so a fall
  // here is the AI walking over the side on its own -- a death nobody could
  // have answered, which rule 1 in the mechanic doc says is not a mechanic.
  if (stuck > STUCK_BAR || outside > 0 || falls > 0) failed = true
}

if (failed) {
  console.error(
    `\nroomprobe: a body fell, stood outside its room, or sat inside a rock past ${STUCK_BAR}% of body-ticks`,
  )
  process.exit(1)
}
console.log('\nroomprobe: nobody outside a room, nobody over the side, nobody held in a rock')

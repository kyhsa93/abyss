/**
 * What stands around the floor.
 *
 * Same contract as the bodies' sheet: absent is an ordinary state — the first
 * frames of a cold start, a fetch the browser refused, and the harness, which
 * draws in Node where there is no `Image` — and the arena is a complete
 * picture without it.
 *
 * Everything here is outside the wall, and that is the whole design rather
 * than a placement detail. The floor is the one surface in this game that must
 * not have opinions: every mechanic is drawn on it, and those are the things a
 * player is reading. So the scenery does not go on it. It goes in the ring
 * beyond it, where it can say what kind of room this is without ever competing
 * with a telegraph.
 *
 * Nothing stands taller than a person, for the reason the wall is low: height
 * here is screen taken off the top of the fight, and on a phone that is the
 * half the raid is standing in.
 */

import { ARENA_RADIUS } from '../sim/constants'
import { Rng } from '../sim/rng'
import { PROPS, PROPS_SRC, PROP_IDS } from './props'
import type { Vec2 } from '../sim/types'

type Sheet = CanvasImageSource & { width: number; height: number }

let sheet: Sheet | null = null
let started = false

function begin(): void {
  if (started || typeof Image === 'undefined') return
  started = true
  const image = new Image()
  image.decoding = 'async'
  image.onload = () => {
    sheet = image as unknown as Sheet
  }
  image.src = PROPS_SRC
}

/**
 * How many pieces a room is furnished with.
 *
 * Enough that the ring is not empty and few enough that it is not a fence.
 * Rolled, like everything else about the room, so two fights are not the same
 * place.
 */
const FEWEST = 7
const MOST = 13

/** How far beyond the wall a piece stands, at its closest and its furthest. */
const NEAR = 14
const FAR = 96

/**
 * How many world units a pixel of this art is worth.
 *
 * Under one, and the number is picked against a body rather than against the
 * art. LPC draws its terrain on the same grid as its people — a headstone and
 * a raider are the same handful of pixels tall — but a raider on this floor is
 * drawn at about a third of the size it would be in the game these tiles were
 * cut for, because this camera is looking at a raid rather than at one person
 * walking down a road. At one-to-one the graveyard came out taller than the
 * people standing in it.
 */
const PIXEL = 0.52

interface Piece {
  id: string
  at: Vec2
  /** Drawn a little smaller further out, which is all the depth this needs. */
  scale: number
}

let planned: { key: string; pieces: Piece[] } | null = null

/**
 * The room, rolled from the fight's own seed.
 *
 * Not from `Math.random`, and the reason is not tidiness. A pull replays from
 * its seed, and a fight can be handed to somebody else as a link — so a room
 * that rolled itself fresh on every load would be a different room for the
 * person you sent it to, and a different one again when you watched your own
 * fight back. Off the seed it is random between fights and fixed within one,
 * which is what "random" has to mean in a game that can replay itself.
 *
 * Cached on the seed for the same reason it is derived from it: the plan is
 * the same every frame, so it is made once.
 */
function plan(seed: number, encounter: number): Piece[] {
  const key = `${seed}:${encounter}`
  if (planned?.key === key) return planned.pieces

  // Off the encounter as well as the seed, so the same party rolling the same
  // number does not get the same room on every boss of a ladder.
  const rng = new Rng(seed * 31 + encounter * 7919 + 104729)
  const count = FEWEST + rng.int(MOST - FEWEST + 1)
  const pieces: Piece[] = []

  // Spread round the whole circle rather than scattered freely: a ring with
  // every piece in one quarter is a ring the player never turns to look at.
  // Each takes a slice and stands somewhere inside it.
  for (let i = 0; i < count; i++) {
    const slice = (Math.PI * 2) / count
    const angle = i * slice + rng.range(0.15, 0.85) * slice
    const out = ARENA_RADIUS + rng.range(NEAR, FAR)
    pieces.push({
      id: PROP_IDS[rng.int(PROP_IDS.length)]!,
      at: { x: Math.cos(angle) * out, y: Math.sin(angle) * out },
      scale: rng.range(0.85, 1.15),
    })
  }

  planned = { key, pieces }
  return pieces
}

/**
 * @param project The renderer's own world-to-screen, passed in rather than
 *   imported: it depends on the camera, and the camera lives with the drawing.
 */
export function drawScenery(
  ctx: CanvasRenderingContext2D,
  project: (p: Vec2) => Vec2,
  scale: number,
  seed: number,
  encounter: number,
): void {
  begin()
  if (!sheet) return

  const pieces = plan(seed, encounter)

  // Back to front, by where each one meets the ground on screen. The floor is
  // tipped away from the camera, so two pieces at the same world radius are at
  // different depths once the view turns, and the one lower on the glass is
  // the one in front.
  const drawn = pieces
    .map((piece) => ({ piece, at: project(piece.at) }))
    .sort((a, b) => a.at.y - b.at.y)

  ctx.save()
  ctx.imageSmoothingEnabled = false
  for (const { piece, at } of drawn) {
    const rect = PROPS[piece.id]
    if (!rect) continue
    const [sx, sy, sw, sh] = rect
    const w = sw * PIXEL * scale * piece.scale
    const h = sh * PIXEL * scale * piece.scale
    // Its foot on the ground it is standing on, like a body.
    ctx.drawImage(sheet, sx, sy, sw, sh, at.x - w / 2, at.y - h, w, h)
  }
  ctx.restore()
}

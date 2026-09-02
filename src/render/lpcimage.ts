/**
 * The walking bodies, if they are there.
 *
 * Same contract as the icon sheet: absent is an ordinary state — the first
 * frames of a cold start, a fetch the browser refused, and the harness, which
 * draws in Node where there is no `Image` — and the caller falls back to the
 * disc that shipped for months. `rendercheck` asserts on that disc and can
 * keep doing so.
 */

import {
  LPC_ACTION,
  LPC_ANIMATIONS,
  LPC_ARMS,
  LPC_BODY,
  LPC_CELLS,
  LPC_GUARD,
  LPC_OFF,
  LPC_DOWN,
  LPC_FRAMES,
  LPC_LEFT,
  LPC_RIGHT,
  LPC_ROW,
  LPC_SRC,
  LPC_UP,
  LPC_WALK,
} from './lpc'

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
  image.src = LPC_SRC
}

export function hasBody(id: string): boolean {
  begin()
  return sheet !== null && id in LPC_ROW
}

/**
 * How tall a body stands, in footprint radii.
 *
 * A cell is 64 and a body fills rather less than that, so this is picked
 * against how the result reads over its own footprint rather than against the
 * cell. Big enough to be a person, small enough that the ellipse under it
 * still reads as the ground it is standing on: at the size this was first set
 * to, a body overhung its own patch of floor on every side and the patch
 * stopped looking like something anybody was standing in.
 */
const BODY = 4.6

/**
 * How much shorter a body stands than its own proportions.
 *
 * Height only — the width comes off the same scale, so a body keeps its
 * footing and loses a little of its head. The sprites are
 * drawn at a human proportion and the camera here looks down at a shallow
 * angle, which foreshortens height and not width; standing them at their full
 * drawn height made them read as taller than the space they occupy.
 *
 * Small on purpose. Past about this the faces start to flatten, and these are
 * sixteen pixels of face to begin with.
 */
const SQUASH = 0.81

/**
 * How far up a body its chest sits, as a fraction of how tall it stands.
 *
 * Exported because two other things aim at it. An actor's position is a point
 * on the ground — it is the centre of the footprint the body stands in — so
 * anything drawn at an actor's position is drawn at its feet. That is right
 * for a footprint and wrong for everything that is supposed to hit the person:
 * bolts flew to the floor in front of somebody and landed between their ankles.
 */
const CHEST = 0.58

/** How far above its feet a body's chest is, for a footprint of radius `r`. */
export function chestHeight(r: number): number {
  return r * BODY * SQUASH * CHEST
}

/**
 * Which way a body is facing, out of an angle.
 *
 * The sprite has four sides and `facing` is continuous, so the only honest
 * answer is the nearest of the four. The comparison is on which component is
 * larger rather than on angle ranges, which keeps it correct without caring
 * where the angle was measured from.
 */
function directionOf(facing: number): number {
  const dx = Math.cos(facing)
  const dy = Math.sin(facing)
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? LPC_LEFT : LPC_RIGHT
  // Screen y grows downward, so a positive y component is walking towards the
  // camera, which is LPC's "down".
  return dy < 0 ? LPC_UP : LPC_DOWN
}

/**
 * Draw the body standing in its footprint.
 *
 * `phase` is a number that grows while the actor is moving and stops when it
 * is not. It is distance walked rather than time, so a body's feet keep pace
 * with the ground it is crossing instead of running on the spot when something
 * slows it down — and standing still lands on frame zero, which is the pose
 * LPC draws for standing.
 */
export function drawBody(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  r: number,
  facing: number,
  phase: number,
  moving: boolean,
  /**
   * How far through a cast, nought to one, or null when not casting.
   *
   * A cast has a length the simulation already knows and the animation should
   * take exactly that long — a swing that finishes early and then stands there
   * reads as the cast having been cancelled. So the caller passes progress
   * rather than a flag, and the frame is read off it.
   */
  casting: number | null,
  alpha: number,
  /**
   * Which body this is, so that two of the same spec need not be carrying the
   * same sword. Any stable number does; the actor's id is the one to hand.
   */
  who: number,
): boolean {
  begin()
  if (!sheet) return false

  const row = LPC_ROW[id]
  if (row === undefined) return false

  // Casting wins over walking. Both can be true — the simulation lets a spec
  // walk while a channel runs — and of the two, the one worth showing is the
  // one the player is waiting on.
  const block = casting !== null ? LPC_ACTION : LPC_WALK
  const frame =
    casting !== null
      ? Math.min(LPC_FRAMES - 1, Math.floor(casting * LPC_FRAMES))
      : // Frame zero is the standing pose, so a body that is not walking must
        // not land on the cycle by accident.
        moving
        ? 1 + (Math.floor(phase) % (LPC_FRAMES - 1))
        : 0
  const direction = directionOf(facing)

  // One source pixel, on screen.
  //
  // Off the body's own square rather than off the cell, because the cell is
  // room around the body rather than the body: as wide as a longsword at the
  // far end of a swing, when there is a longsword, and no wider than a staff
  // when there is not. What has to come out at the intended size is
  // `LPC_BODY`, which every cell holds centred whatever its width, and the
  // rest of the cell is drawn at whatever scale that implies.
  const scale = (r * BODY * SQUASH) / LPC_BODY

  ctx.save()
  ctx.globalAlpha = alpha
  // Pixel art scaled with smoothing turns to mush; this is the one place in
  // the renderer that must not be interpolated.
  ctx.imageSmoothingEnabled = false

  const cell = (which: number): void => {
    const at = LPC_CELLS[which * LPC_ANIMATIONS + block]
    if (!at) return
    const [bx, by, bw, bh, foot] = at
    ctx.drawImage(
      sheet!,
      bx + (direction * LPC_FRAMES + frame) * bw,
      by,
      bw,
      bh,
      x - (bw * scale) / 2,
      // Feet on the actor's own position, which is the centre of the footprint
      // ellipse. The simulation's `pos` is a point on the ground and the
      // ellipse is drawn around it, so standing anywhere else would put the
      // body beside the patch of floor it is meant to be occupying.
      //
      // The block's own foot line rather than the bottom of its cell, which
      // are not the same: a sword swings below the ground the swinger is
      // standing on, and how far below is a fact about that block.
      y - foot * scale,
      bw * scale,
      bh * scale,
    )
  }

  // The body in the middle of what it is carrying, because a thing held is on
  // both sides of the person holding it and which side depends on which way
  // they are facing. The set draws the halves apart for exactly that reason,
  // and they are rows of their own here rather than baked into the body so
  // that a seventh shield costs one row instead of one row a spec.
  //
  // The shield inside the weapon, which is the order they were in when both
  // were painted onto the body: an arm is closer to its owner than the thing
  // at the end of it.
  const arm = pickOf(LPC_ARMS[id], who)
  const off = pickOf(LPC_OFF[id], who)
  const shield = pickOf(LPC_GUARD[id], who)
  // The second blade of a pair outside the first, which is arbitrary — they
  // are in opposite hands and never overlap — but consistent.
  if (off) cell(off[0])
  if (arm) cell(arm[0])
  if (shield) cell(shield[0])
  cell(row)
  if (shield) cell(shield[1])
  if (arm) cell(arm[1])
  if (off) cell(off[1])

  ctx.restore()
  return true
}

/**
 * Which of a list this body gets.
 *
 * Off its own id and nothing else, so it is decided without asking anybody,
 * stays the same for the whole of a fight, and comes out different for the
 * body standing next to it. Plain modulo rather than a hash for that last
 * reason: a hash would sometimes give two neighbours the same sword, and
 * neighbours are the only place anyone can compare.
 *
 * The weapon and the shield are drawn from the same number, so a raid of
 * shields runs through them in step with the swords. Six against five means
 * the pairing takes thirty bodies to repeat, which is more than are ever on
 * the floor at once.
 */
function pickOf(
  list: [number, number][] | undefined,
  who: number,
): [number, number] | undefined {
  if (!list || list.length === 0) return undefined
  return list[((who % list.length) + list.length) % list.length]
}

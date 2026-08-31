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
  LPC_CELL_H,
  LPC_CELL_W,
  LPC_DIRECTIONS,
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
 * Height only — the width is taken from the cell ratio before this applies, so
 * a body keeps its footing and loses a little of its head. The sprites are
 * drawn at a human proportion and the camera here looks down at a shallow
 * angle, which foreshortens height and not width; standing them at their full
 * drawn height made them read as taller than the space they occupy.
 *
 * Small on purpose. Past about this the faces start to flatten, and these are
 * sixteen pixels of face to begin with.
 */
const SQUASH = 0.81

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

  // The cell is taller than it is wide — the packer crops the empty sides off
  // and keeps the full height — so the width is taken from that ratio. Height
  // is then taken from the width rather than the other way round, which is
  // what lets SQUASH shorten a body without narrowing it.
  const w = (r * BODY * LPC_CELL_W) / LPC_CELL_H
  const h = r * BODY * SQUASH
  // Feet on the actor's own position, which is the centre of the footprint
  // ellipse. The simulation's `pos` is a point on the ground and the ellipse is
  // drawn around it, so standing anywhere else would put the body beside the
  // patch of floor it is meant to be occupying.
  const feet = y

  ctx.save()
  ctx.globalAlpha = alpha
  // Pixel art scaled with smoothing turns to mush; this is the one place in
  // the renderer that must not be interpolated.
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(
    sheet,
    frame * LPC_CELL_W,
    ((row * LPC_ANIMATIONS + block) * LPC_DIRECTIONS + direction) * LPC_CELL_H,
    LPC_CELL_W,
    LPC_CELL_H,
    x - w / 2,
    feet - h,
    w,
    h,
  )
  ctx.restore()
  return true
}

import { ARENA_RADIUS } from './constants'
import type { Vec2 } from './types'

/**
 * The shape of the room a fight is fought in.
 *
 * Every fight in this game was fought in the same circle: one constant,
 * `ARENA_RADIUS`, read directly by the clamp, the camera, the AI's candidate
 * sampling, the idle ring and the terrain roll. That constant is still the
 * default and always will be — the first room is the room every number in
 * `docs/mechanic-rules.md` was measured in — but it is no longer the only
 * thing a room is allowed to be.
 *
 * Three kinds, and no more without a reason written here:
 *
 *   round      a disc. What every fight had, and the yardstick for the rest.
 *   hall       a rectangle. A long room has an axis, and an axis is something
 *              a mechanic can point along.
 *   platform   a disc with an outside. Falling is not implemented here — it
 *              pushes in exactly like `round` — because a new cause of death
 *              is a change to the AI rather than to the geometry. The kind
 *              exists now so that a room specified as a platform does not
 *              have to be re-specified when the fall arrives.
 *
 * All three are convex. That is not an accident of what has been needed so
 * far: everything that moves in this game walks straight at where it wants to
 * be, so a convex room is left by walking out of it and re-entered by being
 * pushed back, and a concave one needs path-finding. The same rule is why
 * `Obstacle` is a circle.
 *
 * The frame every room is written in: the boss stands at the origin and the
 * raid comes in from `+y` — which is where `makeSlots` already puts it, at a
 * bearing of about π/2. So `front` is the way out and `back` is behind the
 * boss.
 */
export type RoomShape =
  | { kind: 'round'; radius: number }
  | { kind: 'hall'; halfWidth: number; front: number; back: number }
  | { kind: 'platform'; radius: number }

/**
 * The room every fight was fought in before rooms existed.
 *
 * Declared once, here, so that `ARENA_RADIUS` is read in one place instead of
 * in the twenty that used to assume it. A fight with no room of its own gets
 * this one, and a battleground is always this one.
 */
export const ROUND_ARENA: RoomShape = { kind: 'round', radius: ARENA_RADIUS }

/**
 * How wide the strip of floor next to an outside is.
 *
 * One lane, the same distance everything else in this game keeps off a wall. A
 * rule that only bites at the line itself is a rule half a step behind it does
 * not notice, and the bodies here are steered by an AI that is deliberately
 * late: what it needs is somewhere to start being wrong, not a cliff that is
 * safe until it is not.
 */
export const EDGE_LAP = 64

/**
 * Whether stepping off the edge of this room is a fall rather than a wall.
 *
 * The one thing that makes a platform a platform. Kept as a question about the
 * room rather than a check on `kind` at every call site, because the answer is
 * what callers actually want to know and a fourth shape may answer it too.
 */
export function roomHasOutside(room: RoomShape): boolean {
  return room.kind === 'platform'
}

/**
 * Whether this is the strip of floor a fall is one step away from.
 *
 * False in a room with no outside: a wall is not a hazard, it is furniture.
 */
export function onEdge(room: RoomShape, pos: Vec2, radius = 0): boolean {
  return roomHasOutside(room) && wallGap(room, pos, radius) < EDGE_LAP
}

/**
 * How far inside the wall a point is, in units, for a body of that radius.
 *
 * Negative outside. This is the one question the room is actually asked —
 * "is this legal, and how comfortably" — and both the test and the push are
 * written off it so that a room can never answer the two differently.
 */
export function wallGap(room: RoomShape, pos: Vec2, radius = 0): number {
  if (room.kind === 'hall') {
    return Math.min(
      room.halfWidth - radius - Math.abs(pos.x),
      room.front - radius - pos.y,
      pos.y - (radius - room.back),
    )
  }
  return room.radius - radius - Math.hypot(pos.x, pos.y)
}

/** Whether a body of that radius fits here without touching a wall. */
export function insideRoom(room: RoomShape, pos: Vec2, radius = 0): boolean {
  return wallGap(room, pos, radius) >= 0
}

/**
 * Moves a point back inside the room, in place.
 *
 * The disc pulls along the radius, which is what `clampToArena` did and what
 * every mechanic that places something was written against. The rectangle
 * clamps each axis on its own: pulling toward the middle instead would drag a
 * body along the wall it was walking into, which reads as being sucked
 * sideways by nothing.
 *
 * A room smaller than the body — nothing builds one, but a shrinking room
 * will — collapses to the middle rather than turning inside out.
 */
export function pushInside(room: RoomShape, pos: Vec2, radius = 0): void {
  if (room.kind === 'hall') {
    const wide = Math.max(0, room.halfWidth - radius)
    const far = room.front - radius
    const near = radius - room.back
    pos.x = Math.max(-wide, Math.min(wide, pos.x))
    pos.y = far < near ? (far + near) / 2 : Math.max(near, Math.min(far, pos.y))
    return
  }
  const limit = Math.max(0, room.radius - radius)
  const dist = Math.hypot(pos.x, pos.y)
  if (dist > limit) {
    const scale = limit / dist
    pos.x *= scale
    pos.y *= scale
  }
}

/**
 * The furthest the room reaches from the origin.
 *
 * What "the whole room" means to anything drawn or thrown from the middle: the
 * wedge that has to cross the floor from wherever the boss is standing, the
 * ring that is finished when it has passed the wall, the scale that decides
 * how much world fits on the glass. A rectangle reaches furthest at a corner,
 * which is the number all three of those want.
 */
export function roomReach(room: RoomShape): number {
  if (room.kind === 'hall') {
    return Math.hypot(room.halfWidth, Math.max(room.front, room.back))
  }
  return room.radius
}

/**
 * How much floor there is.
 *
 * Rule 5 in `docs/mechanic-rules.md` — area denial super-scales — is written
 * against a fixed floor, so a room that is not the yardstick quietly changes
 * what every area mechanic is worth. Anything that wants to say "this room is
 * two thirds of a room" says it with this.
 */
export function roomArea(room: RoomShape): number {
  if (room.kind === 'hall') return room.halfWidth * 2 * (room.front + room.back)
  return Math.PI * room.radius * room.radius
}

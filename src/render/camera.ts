/**
 * Which way the view is turned.
 *
 * The camera sits behind the player and looks at whatever the mode is about —
 * the boss in a raid, the objective the player's own orders point at in a
 * battleground. Walking around that thing walks the camera around it too, so
 * the player is seen from behind and the thing they are working on stays at
 * the top of the screen.
 *
 * It lives in its own module because two sides need it and they are on
 * opposite ends of the frame: the renderer turns the world by it, and the
 * input layer turns the stick by it so that pushing up means "away from the
 * camera" rather than "north". Neither of them owns it.
 *
 * The simulation does not see it at all, and that is deliberate. The stick is
 * rotated into world space before `step` is ever called, so what the fight
 * receives is the same world-space vector it has always received — which is
 * what keeps a replay a replay. A camera that could change where a body walked
 * would be a camera that had to be recorded.
 */

const view = { angle: 0, last: 0, started: false }

/**
 * How fast the view swings, in radians a second.
 *
 * Slower than a body turns. The world turning is a much larger claim on the
 * eye than one figure turning in it, and this is a game read off the floor:
 * every mechanic in it is a shape drawn there, and a floor that whips around
 * is a floor nobody can learn.
 */
const SWING = 1.9

export function viewAngle(): number {
  return view.angle
}

/**
 * Swing the view toward a bearing, at the rate it turns.
 *
 * `clock` is the wall clock in seconds; the step is taken against however long
 * the last frame actually was, so the swing takes the same time on a slow
 * machine as on a fast one. The first frame takes no step at all — there is no
 * previous time to measure against, and a frame of unknown length is the one
 * frame most likely to be enormous.
 */
export function turnView(want: number, clock: number, authority = 1): void {
  const dt = view.started ? Math.min(0.05, Math.max(0, clock - view.last)) : 0
  view.last = clock
  view.started = true

  let delta = want - view.angle
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  // `authority` is how much the caller trusts the bearing it is asking for.
  // The renderer lowers it as the anchor gets close, where a step swings the
  // true bearing further than the eye can follow.
  const step = SWING * dt * Math.max(0, Math.min(1, authority))
  view.angle += Math.max(-step, Math.min(step, delta))
}

/** Forget where the view was pointed, for a fight that is starting fresh. */
export function resetView(): void {
  view.angle = 0
  view.started = false
}

/**
 * A stick push, in world units.
 *
 * The stick is read in screen space — up is up on the glass, whichever way the
 * world is turned underneath it — so it has to be turned back before the
 * simulation sees it. This is the only place that conversion happens, and it
 * happens before `step`, which is why the fight never learns there is a
 * camera.
 */
export function stickToWorld(x: number, y: number): { x: number; y: number } {
  const c = Math.cos(-view.angle)
  const s = Math.sin(-view.angle)
  return { x: x * c - y * s, y: x * s + y * c }
}

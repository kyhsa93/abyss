/**
 * Fixed-timestep bookkeeping.
 *
 * Split out of the frame loop so it can be tested: getting this wrong does not
 * throw, it just makes the game run at the wrong speed, which is exactly the
 * kind of bug that ships.
 */

/**
 * Most ticks one frame may run.
 *
 * Beyond this the backlog is discarded rather than caught up. A simulation
 * that has fallen behind cannot be replayed into the present without the
 * player watching it happen at several times speed, which is worse than
 * quietly losing the time.
 */
export const MAX_CATCHUP_TICKS = 6

export interface Clock {
  /** Unconsumed simulation time, in seconds. */
  accumulator: number
  /** Wall-clock seconds since start, for animation. */
  elapsedTotal: number
}

/**
 * Advances the clock by one frame.
 *
 * `simulating` is false whenever the fight is not the thing on screen. Time
 * spent on menus must not bank: with it accumulating behind the raid screen,
 * a minute spent picking a party turned into eighteen hundred ticks that the
 * fight then burned through at six times speed the moment it started.
 */
export function advance(
  clock: Clock,
  frameSeconds: number,
  simulating: boolean,
  dt: number,
): Clock {
  // A backgrounded tab stops firing frames entirely; the first one back
  // reports the whole gap.
  const elapsed = Math.max(0, Math.min(frameSeconds, 0.25))

  return {
    elapsedTotal: clock.elapsedTotal + elapsed,
    accumulator: simulating ? Math.min(clock.accumulator + elapsed, dt * MAX_CATCHUP_TICKS) : 0,
  }
}

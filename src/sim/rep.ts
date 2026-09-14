/**
 * Where you stand with somebody, and what standing there buys.
 *
 * Two facts and one formula, and all three are the server's:
 *
 *   * **The ranks are eight spans, not eight thresholds.**
 *     `ReputationMgr::ReputationToRank` (ReputationMgr.cpp:32) walks down from
 *     the cap taking one span off at a time, so the boundaries fall out of the
 *     spans rather than being written beside them.
 *   * **A standing starts somewhere.** `Faction.dbc` gives four race/class
 *     slots and the first that fits wins — `pipeline/player.py` does that half
 *     and ships the answer for this game's race.
 *   * **A rank above neutral is money off.**
 *     `Player::GetReputationPriceDiscount` (Player.cpp:12607) is
 *     `1 - 0.05 * (rank - neutral)` and nothing else.
 */

/** The eight, in the order the server counts them. */
export const HATED = 0, HOSTILE = 1, UNFRIENDLY = 2, NEUTRAL = 3,
  FRIENDLY = 4, HONORED = 5, REVERED = 6, EXALTED = 7

/** What `player.json` ships about standings. */
export type Sides = {
  /** `ReputationMgr::PointsInRank` — eight spans, hated first. */
  points: number[]
  cap: number
  /** Where a new character of this race stands, by faction. */
  start: Record<string, number>
  /** `reputation_spillover_template`: `[into, share, ceiling]` a row. */
  spills: Record<string, [number, number, number][]>
}

/**
 * Which of the eight a standing is.
 *
 * The server's own loop rather than a table of boundaries: start one past the
 * cap, take a span off for each rank from the top down, and the first rank
 * whose floor you are above is yours.
 */
export function rankOf(standing: number, sides: Sides): number {
  let limit = sides.cap + 1
  for (let i = sides.points.length - 1; i >= 0; i--) {
    limit -= sides.points[i]!
    if (standing >= limit) return i
  }
  return 0
}

/** And where that rank begins, so a bar can be drawn across it. */
export function rankFloor(rank: number, sides: Sides): number {
  let floor = sides.cap + 1
  for (let i = sides.points.length - 1; i >= rank; i--) floor -= sides.points[i]!
  return floor
}

/** What a shopkeeper of that side charges, as a multiplier. */
export function discountOf(rank: number): number {
  return rank <= NEUTRAL ? 1 : 1 - 0.05 * (rank - NEUTRAL)
}

/**
 * Handing in an errand, as `[faction, how much]` pairs including the spill.
 *
 * A quarter of what Stormwind is given is also given to Ironforge, Gnomeregan,
 * Darnassus and the Exodar — one row of `reputation_spillover_template`, and
 * the only one this slice touches.  The ceiling on the row is a *rank*: once
 * you are at it, the spill stops rather than the gain.
 */
export function paidBy(rep: [number, number][], standing: Record<string, number>,
  sides: Sides): [number, number][] {
  const out: [number, number][] = []
  for (const [faction, amount] of rep) {
    out.push([faction, amount])
    for (const [into, share, ceiling] of sides.spills[String(faction)] ?? []) {
      const at = standing[String(into)] ?? sides.start[String(into)] ?? 0
      if (rankOf(at, sides) >= ceiling) continue
      const spilt = Math.floor(amount * share)
      if (spilt) out.push([into, spilt])
    }
  }
  return out
}

/**
 * Adding it up, with the server's two stops on it.
 *
 * The bottom is not a third number: `Reputation_Bottom` is -42000 and the cap
 * is 42999, and taking every span off one past the cap lands on exactly
 * -42000.  So it is `rankFloor(0)` and the two agree by construction rather
 * than by somebody keeping them in step.
 */
export function standAfter(was: number, gain: number, sides: Sides): number {
  return Math.max(rankFloor(HATED, sides), Math.min(sides.cap, was + gain))
}

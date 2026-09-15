/**
 * Which members of a shared slot are standing, and when that changes.
 *
 * `pool_creature` and `pool_gameobject` say that several spawn points share
 * one slot and `pool_template.max_limit` says how many of them stand at once.
 * Both were already read — a pooled herb node is how gathering works at all —
 * but *which* members stood was `the first `most` in file order`, which is a
 * constant: **the same forest, every time the page is opened, for ever.**
 *
 * The rule here is that the standing set is a **function of the clock**, and
 * three things follow from that which are worth saying out loud:
 *
 *   * **It is not `Math.random`.**  This repository has one stream of chance
 *     and a save that carries its position, precisely so that a reload cannot
 *     re-roll something; a world that rolled itself at load would be the same
 *     bug one level up.
 *   * **The period is the data's.**  A slot turns over when its occupant comes
 *     back, so the period is `creature.spawntimesecs` — two hours for three of
 *     this slice's four creature pools and six for the fourth, five minutes
 *     for most of the fifty herb and ore pools.  Nothing here chooses a
 *     number.
 *   * **The clock is the wall clock, so it runs while the tab is closed.**
 *     That is the wiki's own open question — *"부활 시간이 탭을 닫은 동안
 *     흐르는가"* — and this is the answer: it does, because the alternative is
 *     that coming back tomorrow finds the world exactly as it was left, which
 *     is the thing being fixed.
 *
 * Same clock, same world: two people opening this page in the same minute see
 * the same rare spawn standing in the same place.  **The pool's own id and the
 * cycle number are the whole of it**, and for a round that sentence was false:
 * the ordering mixed the member's *index within its pool* with the turn, and
 * never the pool, so every two pools of the same size on the same period stood
 * up the same indices every cycle — the third member of one herb pool rose
 * exactly when the third member of the next did, all over the forest, in
 * lockstep.  Issue 88 had specified `(world seed, pool id, respawn cycle)`,
 * and the pool id is in the key now; `simcheck` walks a day of same-shaped
 * pools and fails if any two of them agree on every turn.
 *
 * **The world seed is not**, because this game has none that holds still.
 * `roll.ts`'s state is a *position* in a stream — it moves with every roll and
 * the save writes it down — so mixing it in would make the standing set
 * change every time anything was rolled, which is re-rolling on load one
 * level removed.  A seed that is fixed per world would be a new thing to
 * invent and a new thing to save, for a difference nobody can see: two worlds
 * baked from one slice are the same world.
 */

/**
 * A 32-bit mix of two integers, for ordering members without a stream.
 *
 * A *sort key* rather than a shuffle, so nothing has to remember where it
 * was: `standing` can be asked about any moment, in any order, for ever, and
 * it answers the same thing.  A shuffle needs a generator and a generator has
 * a position, and a position is a thing that has to be saved.
 */
export function mix(a: number, b: number): number {
  // `Math.imul`, not `*`.  This was `(a | 0) * 0x9e3779b1`, a float product,
  // and a herb pool's turn number is six million: six million times the
  // constant is past 2^53, so the low bits the xor keeps were rounding.  It was
  // deterministic and it was not a mix.
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  return (h ^ (h >>> 15)) >>> 0
}

/**
 * Which turn of a pool a moment falls in.
 *
 * `at` is seconds since the epoch and `period` is the members' own respawn.  A
 * pool with no period — nothing in this slice, but the column is allowed to be
 * nought — never turns, which is the honest reading of "comes back instantly".
 */
export const cycleOf = (period: number, at: number): number =>
  period > 0 ? Math.floor(at / period) : 0

/**
 * The members standing at a moment, as a sorted list of their own indices.
 *
 * Ordered by the mix of the pool, the member and the cycle, which means the
 * answer is stable for the whole of a cycle, unrelated to the answer for the
 * next one, and unrelated to the answer of the pool beside it.  Ties broken by
 * the member's own number, which is only ever a tie in the hash.
 *
 * `pool` comes first and is checked, because it was the argument that was
 * missing: every caller passed `members.map((_m, i) => i)`, and a caller that
 * still passes the old four arguments would hand an array in as the pool,
 * which `| 0` turns into nought without a word.
 */
export function standing(pool: number, members: number[], most: number,
  period: number, at: number): number[] {
  if (!Number.isInteger(pool)) throw new TypeError(`standing: pool ${pool} is not an id`)
  const many = Math.max(0, Math.min(most || members.length, members.length))
  const turn = cycleOf(period, at)
  const key = (m: number) => mix(mix(pool, m), turn)
  return members.slice()
    .sort((a, b) => (key(a) - key(b)) || (a - b))
    .slice(0, many)
    .sort((a, b) => a - b)
}

/**
 * How many different sets a pool shows over a stretch of time.
 *
 * Written for the check issue 193 asked for — *"하루를 돌렸을 때 서 있는
 * 스폰의 집합이 두 번 이상 달라진다"* — and kept here rather than in the check
 * because it is the question the design has to answer, not a detail of how it
 * is asked.  A pool whose members all stand at once has one set for ever and
 * that is correct, not a failure: `max_limit` is the data's.
 */
export function setsOver(pool: number, members: number[], most: number,
  period: number, from: number, to: number): number {
  const seen = new Set<string>()
  const step = Math.max(1, period || (to - from))
  for (let at = from; at <= to; at += step) {
    seen.add(standing(pool, members, most, period, at).join(','))
  }
  return seen.size
}

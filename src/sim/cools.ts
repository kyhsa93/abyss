/**
 * Cooldowns coming back out of a save.
 *
 * A save carries what each cooldown has **left**, in seconds — since 0d7962d
 * (2026-09-14 18:31, issue 206).  Before that commit it carried the moment
 * each one would be ready, on `clock`, and `clock` starts at nought on every
 * load.  The commit changed what the number means and **did not bump
 * `SAVE_VERSION`**: version 4 had been introduced at ab9c4f4 the same
 * afternoon, four hours earlier, so a v4 save written in between holds a
 * moment where `restore` now reads a remainder — an ability used an hour into
 * that session comes back on cooldown for an hour.  Both are non-negative
 * numbers under the same version, so no migrate step can tell them apart.
 *
 * What *can* be said is that **a remainder is never longer than the ability's
 * own cooldown**.  So every restored cooldown is held to that: a correct save
 * is untouched, and an old moment costs at most one ordinary cooldown.  An id
 * with no cooldown of its own — an ability this class does not have, or one
 * whose cooldown is nought — has nothing left to wait for, and is dropped.
 *
 * Deliberately not a migrate step.  Migrating walks a save's version forward
 * and this is not about a version: the v4 → v5 step leaves `cools` alone, and
 * the clamp runs on every load, whatever version the save came from.
 */
export function coolsLeft(saved: Record<string, number> | undefined,
  wholeOf: (id: number) => number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [id, left] of Object.entries(saved ?? {})) {
    const whole = wholeOf(Number(id))
    if (!(whole > 0) || !(left > 0)) continue
    out[id] = Math.min(left, whole)
  }
  return out
}

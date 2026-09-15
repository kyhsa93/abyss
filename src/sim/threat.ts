/**
 * Who a creature is hitting, out of its threat list.
 *
 * Issue 73 put the list in — `n.threat`, fed by damage through
 * `spell_threat` — and nothing chose from it: a creature that was angry hit
 * the player because the player was the only thing there, and taunt was the
 * one line that read the numbers.  A list nothing reads a victim off is the
 * shape this repository keeps finding, so this is the reading, as
 * `ThreatManager::ReselectVictim` (ThreatManager.cpp:632) does it.
 *
 * **What it changes in a game with one player and no pets**, because that is
 * the honest question.  Nothing here stands beside the player: the warlock's
 * book ships Summon Imp (688, `SPELL_EFFECT_SUMMON_PET`) and the scene's
 * `CAN_DO` does not run effect 56, so no pet is ever on the ground.  A
 * creature's list therefore holds one name and the pull-over thresholds never
 * have a second name to compare — `simcheck` runs them on lists of two and
 * three, which is where they bite, and the day a pet stands they need no more
 * code.  What changes now is the half of the rule that is not a comparison: a
 * list whose only entry has gone offline has **no victim**, and a creature with
 * no victim leaves the fight (`Creature::SelectVictim`, Unit.cpp:11491, falls
 * through to `EnterEvadeMode` at Unit.cpp:11565).  Dying is what takes the player offline — a dead target
 * fails `_IsTargetAcceptable` (ThreatReference::ShouldBeOffline,
 * ThreatManager.cpp:112) — so a pack that killed you now goes home instead of
 * standing on your corpse angry until you walk back into it.  And taunt stops
 * inventing a point of threat, below.
 *
 * None of it knows what a `document` is.
 */

/** `ThreatReference::OnlineState`, in the order it outranks: ONLINE > SUPPRESSED > OFFLINE. */
export const OFFLINE = 0, SUPPRESSED = 1, ONLINE = 2
/** `ThreatReference::TauntState`, likewise: TAUNT > NONE > DETAUNT. */
export const DETAUNT = 0, NONE = 1, TAUNT = 2

/**
 * `THREAT_UPDATE_INTERVAL` (ThreatManager.h:94): the list is re-read once a
 * second, and in between only when the victim has gone offline
 * (`GetCurrentVictim`, ThreatManager.cpp:250) or a taunt lands
 * (`TauntUpdate`, ThreatManager.cpp:526, which reselects at once).
 */
export const UPDATE_INTERVAL = 1000

/**
 * How far past the current victim somebody else has to get to take it.
 *
 * ThreatManager.cpp:657 and :660.  A hundred and ten per cent from inside
 * melee reach, a hundred and thirty from outside it — which is why a healer
 * standing back can out-threat the warrior by a quarter and still not be the
 * one hit.
 */
export const PULL_MELEE = 1.1, PULL_RANGED = 1.3

/** One entry of a creature's list. */
export type Ref = {
  threat: number
  online: number
  taunt: number
  /** `IsWithinMeleeRange` from the creature to this victim. */
  melee: boolean
}

/**
 * `ThreatManager::CompareReferencesLT` (ThreatManager.cpp:699): whether `a`
 * sits **lower** on the list than `b`, with `a`'s threat weighted.
 *
 * Online state first, taunt state second, and only then the number — which is
 * what makes a taunt a taunt: a taunting entry outranks every untaunting one
 * whatever either of them has done.
 */
export const lowerThan = (a: Ref, b: Ref, weight = 1): boolean => {
  if (a.online !== b.online) return a.online < b.online
  if (a.taunt !== b.taunt) return a.taunt < b.taunt
  return a.threat * weight < b.threat
}

/**
 * The list in the order the core's heap keeps it, highest first.
 *
 * Ties keep the order the entries were put on the list, because a heap has
 * no order for them and a sort that shuffled them would make the same fight
 * pick two different victims.
 */
export const ordered = (list: Record<string, Ref>): string[] =>
  Object.keys(list)
    .map((k, i) => ({ k, i }))
    .sort((x, y) => {
      const a = list[x.k]!, b = list[y.k]!
      if (lowerThan(a, b)) return 1
      if (lowerThan(b, a)) return -1
      return x.i - y.i
    })
    .map((x) => x.k)

/**
 * `ThreatManager::ReselectVictim` (ThreatManager.cpp:632), step for step.
 *
 * `current` is who it was hitting; the answer is who it hits now, or null for
 * nobody — in which case the caller evades.  Fixation is left out: it is set
 * only by boss scripts, and none of them is in this slice.
 */
export function reselect(list: Record<string, Ref>, current: string | null):
  string | null {
  const order = ordered(list)
  if (!order.length) return null
  const old = current !== null && list[current]
    && list[current]!.online !== OFFLINE ? current : null
  const highest = order[0]!
  // The top is offline, so every entry is: nobody.
  if (list[highest]!.online === OFFLINE) return null
  if (old === null || highest === old) return highest
  const was = list[old]!
  // Not past 110% of the old victim: nothing below it is either.
  if (!lowerThan(was, list[highest]!, PULL_MELEE)) return old
  // Past 130%: it takes it from anywhere.
  if (lowerThan(was, list[highest]!, PULL_RANGED)) return highest
  // Between the two, only from melee reach.
  if (list[highest]!.melee) return highest
  // The top is ranged and under 130% — somebody in melee further down may
  // still be past 110%.
  for (const next of order) {
    if (next === old) return old
    if (!lowerThan(was, list[next]!, PULL_MELEE)) return old
    if (list[next]!.melee) return next
  }
  return old
}

/**
 * What Taunt does to the numbers: `ThreatManager::MatchUnitThreatToHighestThreat`
 * (ThreatManager.cpp:506), reached from `Spell::EffectTaunt`
 * (SpellEffects.cpp:3348) only when the taunter is **not** already the victim.
 *
 * It raises the taunter to the highest threat on the list — to it, not past
 * it — skipping a taunting top entry for the one under it if that one holds
 * more.  What puts the taunter on top is the taunt *state* the aura sets,
 * which `lowerThan` reads; the threat is what is left when the aura runs out,
 * so that the creature does not go straight back to whoever it was hitting.
 * This game used to add one on top, which is a number nobody wrote.
 */
export function matchHighest(list: Record<string, Ref>, who: string): number {
  const order = ordered(list)
  const mine = list[who]?.threat ?? 0
  if (!order.length) return mine
  let top = list[order[0]!]!
  if (top.online === OFFLINE) return mine
  if (top.taunt === TAUNT && order.length > 1) {
    const next = list[order[1]!]!
    if (next.online !== OFFLINE && next.threat > top.threat) top = next
  }
  return Math.max(mine, top.threat)
}

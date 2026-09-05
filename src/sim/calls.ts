/**
 * The raid's cooldowns, as a thing the player can ask for.
 *
 * Every other input in this game is about the player's own body. This one is
 * not: it is the raid leader's half of the game, one press that spends
 * somebody else's minute-and-a-half to make the next four seconds survivable.
 *
 * It is the only input with a real decision in it, and the measurement is
 * unusually clear about why. Pressing these on cooldown is worth almost
 * nothing on some fights — Warden loses 17% of the raid without them and 17%
 * with them pressed carelessly — while spending the same presses on the
 * biggest incoming hits loses 11%, and on a 25-player heroic pull the same
 * gap is thirty points of raid dead. The button is not the lever. The moment
 * is.
 *
 * The bar is built per class rather than per ability because a roster brings
 * duplicates: three priests are three answers to one call, and a raid leader
 * asks the class, not the person. Which of them answers is the simulation's
 * problem (`answerCall` picks the nearest living one that is ready), so a
 * player who calls for Priest while one is dead and one is mid-cast still
 * gets the third.
 */
import { ABILITIES } from './abilities'
import { CLASS_ORDER, specOf, type ClassId } from './classes'
import { MELEE_CALL } from './constants'
import type { SimState } from './types'

export interface CallSlot {
  classId: ClassId
  /** The ability that answers, for its name and icon. */
  abilityId: string
  /** Seconds until somebody in the roster can answer; 0 means now. */
  ready: number
  /**
   * The longest that wait can be, for drawing the sweep.
   *
   * Read off the carrier rather than off the ability, because a melee gets it
   * back sooner — see `MELEE_CALL` — and a sweep drawn against everybody's
   * count would show a melee's slot as fuller than it is.
   */
  cooldown: number
  /** False once every carrier is dead: the call is gone for the pull. */
  alive: boolean
}

/**
 * What the player can ask for, in class order so the bar never reshuffles
 * under a thumb already travelling towards a button.
 */
export function callBar(s: SimState): CallSlot[] {
  const best = new Map<ClassId, CallSlot>()
  for (const a of s.actors) {
    if (a.faction !== 'party') continue
    const abilityId = specOf({ classId: a.classId, spec: a.spec }).abilities.raid
    if (!abilityId) continue
    const prev = best.get(a.classId)
    // A dead carrier still holds the slot open, greyed: seeing that the raid's
    // last shaman died is the information the call bar owes a player, and a
    // slot that vanishes takes it away at the moment it matters most.
    const ready = a.alive ? Math.max(0, a.cooldowns[abilityId] ?? 0) : Infinity
    if (prev && prev.ready <= ready) continue
    const full = ABILITIES[abilityId]!.cooldown * (a.melee ? MELEE_CALL : 1)
    best.set(a.classId, {
      classId: a.classId,
      abilityId,
      ready: Number.isFinite(ready) ? ready : 0,
      cooldown: full,
      alive: a.alive || (prev?.alive ?? false),
    })
  }
  return CLASS_ORDER.filter((c) => best.has(c)).map((c) => best.get(c)!)
}

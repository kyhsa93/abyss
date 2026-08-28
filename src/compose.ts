import {
  FIVE_MAN,
  ROLE_LIMITS,
  autoParty,
  countRoles,
  fixedCount,
  isFixedComposition,
  isLegalComposition,
  SPEC_OPTIONS,
  randomAround,
  roleOf,
  selectInto,
  specOf,
  type Pick,
  type RaidSize,
} from './sim/classes'
import type { Role } from './sim/types'

/**
 * Building the raid by hand.
 *
 * The raid used to be rolled at the door: you chose what you were playing and
 * the other four, nine or twenty-four were drawn from a pool. The reason
 * written on the screen at the time was that "a board of twenty-four
 * strangers you did not choose and cannot change is a readout nobody needs" —
 * which was true of a board you could not change, and is the argument for
 * making it changeable rather than for hiding it.
 *
 * It matters more now than it did. The one decision this game asks before a
 * pull is what you are playing, made once and saved, so a night of pulls has
 * a single choice in it and then a counter. Who the other twenty-four are is
 * a second decision, it has wrong answers, and it is the one the genre
 * actually argues about.
 *
 * All of it is here rather than in the screen that draws it, for the same
 * reason the unlock chain is: a rule about what a raid may be, kept in a
 * click handler, is a rule nothing can check. The screen owns pixels and this
 * owns answers.
 */

export interface Composing {
  /** The raid as it stands. Slot zero is always the player. */
  party: Pick[]
  /** Whose list is open, or null when the board is. */
  selected: number | null
  /** Why the last press did nothing, in the words to say it in. */
  refused: string | null
}

export function begin(party: Pick[]): Composing {
  return { party: party.map((p) => ({ ...p })), selected: null, refused: null }
}

/**
 * Why a raid would not be one, or null if it would.
 *
 * `isLegalComposition` answers yes or no, which is all a pull needs and less
 * than a player does: a tap that quietly does nothing is indistinguishable
 * from a tap that missed. So the same rules are read back out as the sentence
 * to put under the board.
 */
export function refusal(party: Pick[]): string | null {
  const roles = countRoles(party)
  const size = party.length

  if (isFixedComposition(size)) {
    for (const role of ['tank', 'healer', 'dps'] as Role[]) {
      if (roles[role] !== FIVE_MAN[role]) {
        return `a five needs ${FIVE_MAN.tank} tank, ${FIVE_MAN.healer} healer and ${FIVE_MAN.dps} damage`
      }
    }
    return null
  }

  if (roles.tank > ROLE_LIMITS.tank.max) {
    return `${size} fields at most ${ROLE_LIMITS.tank.max} tanks`
  }
  const healers = fixedCount('healer', size)
  if (healers !== null && roles.healer !== healers) {
    return `${size} needs exactly ${healers} healers`
  }
  return null
}

/** Whether this raid may be pulled with at all. */
export function legal(c: Composing): boolean {
  return isLegalComposition(c.party)
}

/**
 * Opening and closing a slot's list.
 *
 * Pressing the open one closes it, so the board is always one press away and
 * the screen never needs a second dismiss target next to the first.
 */
export function pressSlot(c: Composing, index: number): Composing {
  if (index < 0 || index >= c.party.length) return c
  return { ...c, selected: c.selected === index ? null : index, refused: null }
}

export function close(c: Composing): Composing {
  return c.selected === null ? c : { ...c, selected: null, refused: null }
}

/**
 * Giving the open slot something to play.
 *
 * Through `selectInto`, which is the only thing allowed to change a slot: it
 * carries the trade rule that lets a fixed count move at all — at five there
 * is no legal intermediate state to pass through, so a tank becoming a healer
 * has to be read as a swap with whoever was healing or it can never happen.
 *
 * A refusal keeps the slot open. Closing it would look like the change went
 * through, and the player would be reading a board that disagreed with the
 * one press they remember making.
 */
export function pressSpec(c: Composing, pick: Pick): Composing {
  if (c.selected === null) return c
  const traded = selectInto(c.party, c.selected, pick)
  if (traded === null) {
    // Say what the rule is, from the raid the press would have made, rather
    // than from the one that is still on screen — the second one is legal by
    // definition and has nothing to explain.
    const naive = c.party.map((p, i) => (i === c.selected ? { ...pick } : p))
    return { ...c, refused: refusal(naive) ?? 'that leaves a raid that cannot pull' }
  }
  return { ...c, party: traded, selected: null, refused: null }
}

/** The raid the game would have built for you, around what you are playing. */
export function pressAuto(c: Composing): Composing {
  const you = c.party[0]
  if (!you) return c
  return {
    party: autoParty(c.party.length as RaidSize, you),
    selected: null,
    refused: null,
  }
}

/** And a fresh roll of it, which is what the door used to do every time. */
export function pressReroll(c: Composing, random: () => number): Composing {
  const you = c.party[0]
  if (!you) return c
  return {
    party: randomAround(c.party.length as RaidSize, you, random),
    selected: null,
    refused: null,
  }
}

/**
 * What the raid is made of, for the line above the board.
 *
 * Plural-aware, because "1 tanks" on a five-man is the kind of thing that
 * reads as a bug in everything else on the screen.
 */
export function summary(party: Pick[]): string {
  const roles = countRoles(party)
  const say = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  return [
    say(roles.tank, 'tank', 'tanks'),
    say(roles.healer, 'healer', 'healers'),
    `${roles.dps} damage`,
  ].join('  ·  ')
}

/** The role a slot is currently filling, for the board's own colouring. */
export function slotRole(pick: Pick): Role {
  return roleOf(pick)
}


/**
 * The smallest change that makes a raid legal again.
 *
 * `selectInto` refuses a press it cannot make legal by trading, and the class
 * screen's answer to a refusal was to roll the whole raid again. That was free
 * when the raid was rolled anyway; it is not free now. A player who has just
 * placed twenty-five people and then changes their own spec should not lose
 * the twenty-four they placed, and "your raid is gone" is a strange reply to
 * "I would like to tank".
 *
 * So the pick is taken and everyone else is left alone except the few who have
 * to move: surplus roles are converted to whatever is short, newest slots
 * first, and slot zero is never touched because slot zero is the press.
 */
export function repair(party: Pick[], pick: Pick): Pick[] {
  const size = party.length
  const next = party.map((p, i) => (i === 0 ? { ...pick } : { ...p }))

  const want: Record<Role, number> = {
    tank: fixedCount('tank', size) ?? Math.min(ROLE_LIMITS.tank.max, countRoles(next).tank),
    healer: fixedCount('healer', size) ?? countRoles(next).healer,
    dps: 0,
  }
  // At least one of each of the two that a raid cannot do without, and damage
  // is whatever the other two did not spend.
  want.tank = Math.max(1, Math.min(want.tank, ROLE_LIMITS.tank.max))
  want.healer = Math.max(1, want.healer)
  want.dps = size - want.tank - want.healer
  if (want.dps < 0) return autoParty(size as RaidSize, pick)

  // Slot zero's role is spent first: it is the one thing this may not move.
  const left: Record<Role, number> = { ...want }
  left[roleOf(next[0]!)]--
  if (left[roleOf(next[0]!)] < 0) return autoParty(size as RaidSize, pick)

  // Keep whoever still fits their own role, in place. Only what is left over
  // gets converted, which is what makes this the smallest change rather than
  // a re-roll wearing a different name.
  const surplus: number[] = []
  for (let i = 1; i < size; i++) {
    const role = roleOf(next[i]!)
    if (left[role] > 0) left[role]--
    else surplus.push(i)
  }

  for (const i of surplus) {
    const role = (['tank', 'healer', 'dps'] as Role[]).find((r) => left[r] > 0)
    if (role === undefined) break
    left[role]--
    // Anything that plays the role. Picked by the slot's own index rather than
    // rolled, so the same press twice gives the same raid.
    const options = SPEC_OPTIONS.filter((option) => specOf(option).role === role)
    next[i] = { ...(options[i % options.length] ?? next[i]!) }
  }

  return isLegalComposition(next) ? next : autoParty(size as RaidSize, pick)
}

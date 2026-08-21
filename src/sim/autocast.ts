import { ABILITIES } from './abilities'
import { abilityBar, specOf } from './classes'
import { canCast, getAura, livingParty } from './combat'
import { playerTarget } from './sim'
import type { Actor, AuraId, SimState } from './types'

/**
 * The player's rotation, pressed for them.
 *
 * On a phone the thumbs are already spoken for — one steers and the other is
 * on the buttons — and a fight that asks you to dodge a ring while keeping a
 * three-button rotation going is a fight where one of the two silently stops
 * happening. This presses the rotation so the other thumb can be about
 * position, which is the half of the game the screen is actually showing.
 *
 * It reads the same state the buttons do, so it can never press something the
 * bar would have drawn as unusable. It also picks nothing on a global
 * cooldown, mid-cast or out of range, which means holding it on is strictly
 * worse than perfect play and strictly better than a thumb that is busy.
 */
export function autoPress(s: SimState): number[] {
  const player = s.actors.find((a) => a.isPlayer)
  if (!player || !player.alive || player.castId) return []
  if (s.countdown > 0 || s.outcome !== 'ongoing') return []

  const bar = abilityBar({ classId: player.classId, spec: player.spec })
  const kit = specOf({ classId: player.classId, spec: player.spec }).abilities
  const slotOf = (id: string | null): number => (id === null ? -1 : bar.indexOf(id))

  // Priority, highest first. Same shape as the party AI's, and for the same
  // reasons — keep the expensive button for when it lands, keep the debuff up,
  // fill with the cheap one — but written against slots rather than an actor's
  // own idea of a target, because the player's target is whatever the bar is
  // already aimed at.
  const order: number[] = []
  if (player.role === 'healer') {
    const hurt = mostHurt(s)
    const dire = hurt !== null && hurt.hp / hurt.maxHp < 0.45
    if (dire) order.push(slotOf(kit.finisher))
    // The over-time heal, which this never pressed at all: it was on the bar,
    // it was in the kit, and the priority list simply had no line for it.
    // Three of the four healers were playing with a button switched off and
    // nothing on screen said which one.
    if (
      hurt !== null &&
      hurt.hp / hurt.maxHp < 0.95 &&
      kit.overTime &&
      !getAura(hurt, kit.overTime as AuraId)
    ) {
      order.push(slotOf(kit.overTime))
    }
    if (hurt !== null && hurt.hp / hurt.maxHp < 0.9) order.push(slotOf(kit.filler))
    // A healer with nobody to heal presses nothing. The AI's healers fill
    // with damage at this point, but that ability is not on the player's bar
    // at all (`abilityBar`), and autocast presses the bar — it does not reach
    // for buttons the screen never offered.
  } else if (player.role === 'tank') {
    order.push(slotOf(kit.taunt), slotOf(kit.overTime), slotOf(kit.finisher))
    order.push(slotOf(kit.threat), slotOf(kit.filler))
  } else {
    const target = s.actors.find((a) => a.id === playerTarget(s)) ?? null
    for (const id of damageOrder(player, target)) order.push(slotOf(id))
  }

  // Whether the player is on the move, read off the last tick rather than
  // taken as an argument: a cast started while walking is cancelled by the
  // walking, and starting one every tick to cancel it every tick is how an AI
  // healer once healed for nothing at all. Instants only, while moving.
  const walking =
    Math.hypot(player.pos.x - player.prevPos.x, player.pos.y - player.prevPos.y) > 0.5

  for (const slot of order) {
    if (slot < 0) continue
    const id = bar[slot]
    const ability = id ? ABILITIES[id] : undefined
    if (!id || !ability) continue
    if (walking && ability.castTime > 0) continue

    // A dot is worth a global only when it is nearly gone; several presses of
    // the same debuff is the classic way an autocast wastes a rotation.
    if (kit.overTime === id) {
      const target = s.actors.find((a) => a.id === playerTarget(s))
      const dot = target ? getAura(target, id as AuraId) : undefined
      if (dot && dot.remaining > 3) continue
    }

    const targetId = healing(ability.kind) ? (mostHurt(s)?.id ?? player.id) : playerTarget(s)
    if (!canCast(s, player, ability, targetId)) continue
    return [slot]
  }
  return []
}

/**
 * What a damage spec should press, best first, as ability ids.
 *
 * Shared with the party AI on purpose. The order *is* the trait — bank the
 * points and spend a full bank, open the window before filling it, keep the
 * mark up because everything under it is worth more — and a spec whose
 * priority the AI does not know is a spec the AI plays as though it were any
 * other. Nine dealers all pressing filler-dot-finisher is what made them one
 * spec with nine names in the first place.
 */
export function damageOrder(actor: Actor, target: Actor | null): string[] {
  const spec = specOf({ classId: actor.classId, spec: actor.spec })
  const kit = spec.abilities
  const order: Array<string | null> = []

  switch (spec.trait) {
    case 'combo': {
      // A finisher at two points is most of a finisher thrown away.
      const points = getAura(actor, 'combo')?.stacks ?? 0
      if (points >= 4) order.push(kit.finisher)
      order.push(kit.overTime, kit.filler, kit.finisher)
      break
    }
    case 'eclipse':
      // The finisher opens the window; the filler is what the window is for.
      order.push(kit.finisher, kit.overTime, kit.filler)
      break
    case 'affliction': {
      const dot = kit.overTime && target ? getAura(target, kit.overTime as AuraId) : undefined
      if (!dot) order.push(kit.overTime)
      // Above the filler even though the filler is what the mark improves: a
      // filler with no cooldown is always available, so anything under it is
      // never reached.
      order.push(kit.finisher, kit.filler, kit.overTime)
      break
    }
    case 'overflow':
      // Rage near the top is rage about to be wasted, and only the filler
      // spends it fast enough.
      if (actor.power >= actor.maxPower * 0.8) order.push(kit.filler)
      order.push(kit.overTime, kit.finisher, kit.filler)
      break
    case 'momentum':
    default:
      order.push(kit.overTime, kit.finisher, kit.filler)
      break
  }

  return order.filter((id): id is string => id !== null)
}

function healing(kind: string): boolean {
  return kind === 'heal'
}

function mostHurt(s: SimState): Actor | null {
  let best: Actor | null = null
  let ratio = Infinity
  for (const a of livingParty(s)) {
    const r = a.hp / a.maxHp
    if (r < ratio) {
      ratio = r
      best = a
    }
  }
  return best
}

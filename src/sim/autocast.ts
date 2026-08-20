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
    if (hurt !== null && hurt.hp / hurt.maxHp < 0.9) order.push(slotOf(kit.filler))
    // A healer with nobody to heal presses nothing. The AI's healers fill
    // with damage at this point, but that ability is not on the player's bar
    // at all (`abilityBar`), and autocast presses the bar — it does not reach
    // for buttons the screen never offered.
  } else {
    if (player.role === 'tank') order.push(slotOf(kit.taunt))
    order.push(slotOf(kit.overTime), slotOf(kit.finisher))
    if (player.role === 'tank') order.push(slotOf(kit.threat))
    order.push(slotOf(kit.filler))
  }

  for (const slot of order) {
    if (slot < 0) continue
    const id = bar[slot]
    const ability = id ? ABILITIES[id] : undefined
    if (!id || !ability) continue

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

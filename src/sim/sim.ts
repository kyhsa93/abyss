import { ABILITIES } from './abilities'
import { RESOURCES, abilityBar, specOf } from './classes'
import { updatePartyAi } from './ai'
import { affixRot } from './affix'
import { updateBattlegroundAi, updateBattlegroundPlans } from './bgai'
import {
  CARRIER_SPEED,
  carrying,
  clearTerrain,
  teamOf,
  other as otherTeam,
  updateBattleground,
} from './battleground'
import { resolveBossCast, updateBoss, updateGround, burnBrand } from './boss'
import {
  AURA_TICK,
  addThreat,
  applyDamage,
  applyHeal,
  boss,
  detonateSpread,
  interruptCast,
  dist,
  gainPower,
  pushEffect,
  landAbility,
  livingParty,
  mostHurt,
  hasteOf,
  pushText,
  spawnBolt,
  resolveAbility,
  beginCast,
  castBlocker,
  rotBite,
  breakRot,
  fightScale,
} from './combat'
import { CRIT_CHANCE, CRIT_MULTIPLIER, DT, MELEE_RANGE, TICK_RATE } from './constants'
import type { Rng } from './rng'
import { BOSS_ID, clampToArena } from './state'
import type { Ability } from './abilities'
import type { Actor, PlayerInput, SimState } from './types'

/**
 * Advances the fight by exactly one fixed tick.
 *
 * Order matters and must stay stable: timers, player, party AI, boss, ground,
 * then resolution. Changing the order changes replays.
 */
export function step(s: SimState, input: PlayerInput, rng: Rng): void {
  // Drained before the guard, not after: leaving the last tick's events in
  // place meant the renderer kept replaying them over the results screen.
  s.sounds.length = 0
  s.effects.length = 0
  if (s.outcome !== 'ongoing') return

  // The pull has not started yet.
  //
  // Nothing below this runs: no timers, no boss script, no clock. That is the
  // point — a countdown that let the fight age would push the first mechanic
  // three seconds earlier relative to everything the party can do about it,
  // and every balance number here was measured without one. Input is dropped
  // for the same reason the boss is: standing still is the position everyone
  // agreed to start from.
  if (s.countdown > 0) {
    s.countdown--
    // On each whole second, and a different one when it runs out.
    if (s.countdown % TICK_RATE === 0) {
      s.sounds.push(s.countdown > 0 ? 'countdown' : 'pull')
    }
    return
  }

  s.tick++
  s.time += DT

  for (const a of s.actors) {
    a.prevPos.x = a.pos.x
    a.prevPos.y = a.pos.y
  }

  for (const a of s.actors) updateTimers(s, a)

  updatePlayer(s, input, rng)

  // What each side is trying to do, before anybody acts on it. A plan belongs
  // to the team, so it is made once rather than five times.
  if (s.mode === 'battleground') updateBattlegroundPlans(s)

  // Both sides run in the same pass. The direction alternates by tick, because
  // acting first is worth something — reaching a flag, standing on a point —
  // and a fixed order hands that to whichever team happens to be built first.
  const thinkers = s.mode === 'battleground' && s.tick % 2 === 1 ? [...s.actors].reverse() : s.actors
  for (const a of thinkers) {
    if (!a.ai) continue
    if (s.mode === 'battleground') updateBattlegroundAi(s, a, rng)
    else if (a.faction === 'party') updatePartyAi(s, a, rng)
  }

  updateAutoAttacks(s, rng)

  if (s.mode === 'battleground') updateBattleground(s)
  else updateBoss(s, rng)
  updateGround(s)
  updateProjectiles(s, rng)

  for (const a of s.actors) advanceCast(s, a, rng)

  ageEphemera(s)
  if (s.mode === 'raid') resolveOutcome(s)
}

/**
 * Weapons, swinging on their own.
 *
 * The boss and its thralls have always had this; the party fought with
 * nothing but its spell list, so a rogue standing in melee doing nothing was
 * a rogue doing literally nothing. Melee specs swing, the hunter shoots, and
 * everyone else has no weapon to speak of.
 *
 * It costs no global cooldown and asks for no press: the whole point of white
 * damage is that it is what happens while you are busy deciding.
 */
function updateAutoAttacks(s: SimState, rng: Rng): void {
  for (const a of s.actors) {
    if (!a.alive) continue
    // In a raid the boss swings on its own script, so only the party's
    // weapons are handled here. In a battleground both sides are the party.
    if (s.mode === 'raid' ? a.faction !== 'party' : a.ai === null && !a.isPlayer) continue
    const auto = specOf({ classId: a.classId, spec: a.spec }).auto
    if (!auto) continue

    if (a.swingTimer > 0) {
      a.swingTimer -= DT
      continue
    }

    // Whatever the weapon can actually reach, nearest first. Adds walk into
    // the melee on their own, so "closest" and "what the rotation is aimed
    // at" are the same thing nearly all the time, and picking by distance
    // means a tank never stands beside the boss swinging at nothing because
    // its target was a thrall across the floor.
    // Nearest thing the weapon can actually be used on. A bow shoots past
    // whatever is standing on the hunter rather than at it.
    const target = nearestHostile(s, a, auto.range, auto.minRange ?? 0)
    if (!target) continue

    a.swingTimer = auto.speed
    // Physical, so it answers armour and block the way a weapon should. The
    // boss carries neither, which is a decision it can change without this
    // needing to know.
    // A weapon crits like anything else the party throws.
    const crit = rng.chance(CRIT_CHANCE)
    applyDamage(s, target, auto.damage, 'physical', { sourceId: a.id, crit })

    // A weapon swing had no picture at all: damage arrived every three
    // seconds from a token standing still. Melee get an arc where the swing
    // went, everyone gets the hit landing, and the hunter already has a bolt.
    const facing = Math.atan2(target.pos.y - a.pos.y, target.pos.x - a.pos.x)
    if (auto.range <= MELEE_RANGE) pushEffect(s, 'swing', a.pos, { angle: facing })
    pushEffect(s, 'impact', target.pos, {
      angle: facing,
      power: auto.damage * (crit ? CRIT_MULTIPLIER : 1),
      crit,
    })
    if (target.id === BOSS_ID) addThreat(s, a.id, auto.damage)
    // Rage is earned here rather than handed out, which is why a warrior
    // that cannot reach anything cannot do anything either.
    gainPower(a, RESOURCES[a.resource].onSwing)
    // A shot with nothing in the air between the two of them reads as the
    // hunter standing still doing nothing, same as the ranged abilities.
    if (auto.range > MELEE_RANGE) spawnBolt(s, a, target.id, 'bolt')
  }
}

function nearestHostile(
  s: SimState,
  from: Actor,
  range: number,
  minRange: number,
): Actor | null {
  let best: Actor | null = null
  let bestGap = Infinity
  const hostile =
    s.mode === 'battleground'
      ? (a: Actor) => teamOf(a) === otherTeam(teamOf(from))
      : (a: Actor) => a.faction === 'boss'
  for (const other of s.actors) {
    if (!hostile(other) || !other.alive) continue
    // Clamped at zero: standing inside something's radius is a gap of none,
    // not a negative one. Without this every melee stopped swinging the
    // moment a near edge existed anywhere, because a melee stands closer to
    // the boss's centre than the boss's own radius.
    const gap = Math.max(0, dist(from.pos, other.pos) - other.radius)
    if (gap >= minRange && gap <= range && gap < bestGap) {
      bestGap = gap
      best = other
    }
  }
  return best
}

function updateTimers(s: SimState, a: Actor): void {
  if (!a.alive) return

  a.gcd = Math.max(0, a.gcd - DT)
  for (const key of Object.keys(a.cooldowns)) {
    const value = a.cooldowns[key]!
    if (value > 0) a.cooldowns[key] = Math.max(0, value - DT)
  }

  const regen = RESOURCES[a.resource].regen
  if (a.maxPower > 0 && regen > 0) {
    a.power = Math.min(a.maxPower, a.power + regen * DT)
  }

  // Iterate backwards so expiry removal does not skip entries. A tick can
  // kill the actor mid-loop (DoT, or a spread detonating on its carrier),
  // which clears the array underneath us — hence the guards.
  for (let i = a.auras.length - 1; i >= 0; i--) {
    if (!a.alive) break
    const aura = a.auras[i]
    if (!aura) continue
    if (aura.id === 'enrage') continue

    aura.remaining -= DT
    aura.tickTimer += DT

    while (aura.tickTimer >= 1) {
      aura.tickTimer -= 1
      const tick = AURA_TICK[aura.id]
      if (!tick) continue
      if (tick.damage !== undefined) {
        // The boss's own dot is the one an affix can sharpen; the party's are
        // theirs and stay as they are.
        const bite =
          aura.id === 'rot'
            ? rotBite(aura, tick.damage) * affixRot(s.affix) * fightScale(s)
            : tick.damage
        applyDamage(s, a, bite, 'none', { sourceId: aura.sourceId, silent: true })
        if (a.faction === 'boss') addThreat(s, aura.sourceId, bite)
      }
      if (tick.heal !== undefined) applyHeal(s, a, tick.heal, aura.sourceId)
    }

    if (aura.remaining <= 0) {
      a.auras.splice(i, 1)
      if (aura.id === 'spread') detonateSpread(s, a)
      if (aura.id === 'brand' && a.alive) burnBrand(s, aura.at ?? a.pos)
      if (aura.id === 'rot' && a.alive) breakRot(s, a)
    }
  }
}

function updatePlayer(s: SimState, input: PlayerInput, rng: Rng): void {
  const player = s.actors.find((a) => a.isPlayer)
  if (!player || !player.alive) return

  const len = Math.hypot(input.moveX, input.moveY)
  if (len > 0.01) {
    const stepLen =
      player.moveSpeed * DT * (carrying(s, player) ? CARRIER_SPEED : 1) * hasteOf(player)
    const stepX = (input.moveX / len) * stepLen
    const stepY = (input.moveY / len) * stepLen
    player.pos.x += stepX
    player.pos.y += stepY
    clampToArena(player.pos, player.radius)
    clearTerrain(s.bg, player.pos, player.radius, stepX, stepY)
    // Moving breaks your own cast — the core tension with Burst.
    if (player.castId) interruptCast(s, player, 'moved')
  }

  const bar = abilityBar({ classId: player.classId, spec: player.spec })
  for (const slot of input.pressed) {
    const abilityId = bar[slot]
    const ability = ABILITIES[abilityId ?? '']
    if (!abilityId || !ability) continue
    const target = pressTarget(s, ability, player)

    // A press that goes nowhere used to be silent, which reads as the button
    // being broken. Cooldowns and empty mana are already on the button; being
    // too far away is the one reason nothing on screen was saying.
    const blocked = castBlocker(s, player, ability, target)
    if (blocked === 'range' || blocked === 'close') {
      // A charge is the one ability with a near edge, and "out of range" is
      // exactly the wrong thing to say about being on top of something.
      reportReach(s, player, blocked === 'close' ? TOO_CLOSE : OUT_OF_RANGE)
      continue
    }
    beginCast(s, player, abilityId, target, rng)
  }
}

const OUT_OF_RANGE = 'Out of range'
const TOO_CLOSE = 'Too close'

/**
 * One notice at a time.
 *
 * Three fingers on three buttons is three presses in a tick, and stacking
 * three copies of the same words on top of each other is how you make a
 * message unreadable.
 */
function reportReach(s: SimState, player: Actor, text: string): void {
  if (s.texts.some((t) => t.text === text && t.age < 0.5)) return
  pushText(s, player.pos, text, 'miss')
  s.sounds.push('blocked')
}

/**
 * What a press aims at.
 *
 * Every press used to aim at `playerTarget`, with one exception carved out
 * for a taunt. That is right for everything that hurts something and wrong
 * for the one kind that does not: a healer's every button was aimed at the
 * boss, so the bolt flew at it, `landAbility` healed it on arrival, and the
 * player was credited for the healing. Measured at 473 health handed to the
 * Drowned Warden per press of a discipline priest's filler.
 *
 * Kept here, next to the press it answers for, and used by the action bar as
 * well — the light that says whether a button can reach has to be asking the
 * same question the press does, or it is a light about something else.
 */
export function pressTarget(s: SimState, ability: Ability, player: Actor): number {
  // Adds keep no threat table, so aiming a taunt at one is a wasted cooldown
  // on the button whose whole job is the boss.
  if (ability.kind === 'taunt') return BOSS_ID
  // A heal goes where the AI healers send theirs: whoever is furthest from
  // full. There is no friendly targeting in this game and there should not
  // be — the whole thing is one button and no target frame.
  if (ability.kind === 'heal') return mostHurt(s)?.id ?? player.id
  return playerTarget(s)
}

/**
 * Adds are the priority target while they are alive.
 *
 * Exported because the action bar has to answer the same question to know
 * whether a slot is in range of anything, and two answers to "what are you
 * aiming at" is one too many.
 */
export function playerTarget(s: SimState): number {
  const player = s.actors.find((a) => a.isPlayer)

  // A battleground has no boss to fall back on, so the target is whoever is
  // nearest on the other side — the same thing the weapon already swings at,
  // rather than a second answer to the same question.
  if (s.mode === 'battleground') {
    let best = BOSS_ID
    let bestGap = Infinity
    for (const a of s.actors) {
      if (!a.alive || a.faction !== 'boss') continue
      const gap = player ? dist(player.pos, a.pos) : 0
      if (gap < bestGap) {
        bestGap = gap
        best = a.id
      }
    }
    return best
  }

  let best: number = BOSS_ID
  let bestHp = Infinity
  for (const a of s.actors) {
    if (a.faction !== 'boss' || !a.alive || a.id === BOSS_ID) continue
    if (a.hp < bestHp) {
      bestHp = a.hp
      best = a.id
    }
  }
  return best
}

function advanceCast(s: SimState, a: Actor, rng: Rng): void {
  if (!a.alive || !a.castId) return

  a.castRemaining -= DT
  if (a.castRemaining > 0) return

  const castId = a.castId
  const targetId = a.castTargetId
  // The moment it goes off, at the caster. What the ability then does to
  // whoever it was aimed at is drawn where that lands, which for anything
  // thrown is a bolt-flight later.
  pushEffect(s, 'cast', a.pos, { abilityId: castId })
  a.castId = null
  a.castRemaining = 0
  a.castTotal = 0
  a.castTargetId = null

  // Only in a raid does that side cast boss abilities. In a battleground the
  // faction means "the other team", and sending their finished casts here
  // dropped every one of them on the floor: they were playing instants only,
  // which is most of a caster's damage gone.
  if (s.mode === 'raid' && a.faction === 'boss') {
    resolveBossCast(s, castId, targetId)
    return
  }

  const ability = ABILITIES[castId]
  if (ability && targetId !== null) resolveAbility(s, a, ability, targetId, rng)
}

/** Homes on the target so a bolt still lands if its victim walks away. */
/**
 * A bolt arriving.
 *
 * Only the ones carrying something resolve: a hunter's auto shot is drawn
 * after the fact and has nothing left to do. The caster is not required to
 * still be alive — a shot that was in the air when its owner died still
 * lands, which is the same rule every game this apes uses.
 */
function land(s: SimState, p: SimState['projectiles'][number], rng: Rng): void {
  if (!p.abilityId || p.sourceId === null) return
  const ability = ABILITIES[p.abilityId]
  const source = s.actors.find((a) => a.id === p.sourceId)
  if (!ability || !source) return
  landAbility(s, source, ability, p.targetId, rng)
}

function updateProjectiles(s: SimState, rng: Rng): void {
  for (const p of s.projectiles) {
    p.prevPos.x = p.pos.x
    p.prevPos.y = p.pos.y

    const target = s.actors.find((a) => a.id === p.targetId)
    if (!target) {
      // Whatever it was aimed at is gone. A carried ability goes with it.
      p.arrived = true
      continue
    }

    const dx = target.pos.x - p.pos.x
    const dy = target.pos.y - p.pos.y
    const d = Math.hypot(dx, dy)
    const stepLen = p.speed * DT

    if (d <= stepLen + target.radius) {
      p.pos.x = target.pos.x
      p.pos.y = target.pos.y
      p.arrived = true
      land(s, p, rng)
      continue
    }

    p.pos.x += (dx / d) * stepLen
    p.pos.y += (dy / d) * stepLen
  }

  s.projectiles = s.projectiles.filter((p) => !p.arrived)
}

function ageEphemera(s: SimState): void {
  s.raidFlash = Math.max(0, s.raidFlash - DT)
  for (const t of s.texts) t.age += DT
  s.texts = s.texts.filter((t) => t.age < 1.1)

  for (const c of s.chat) c.age += DT
  s.chat = s.chat.filter((c) => c.age < 6)
}

function resolveOutcome(s: SimState): void {
  const b = boss(s)
  if (!b.alive || b.hp <= 0) {
    s.outcome = 'victory'
    s.sounds.push('victory')
    return
  }
  if (livingParty(s).length === 0) {
    s.outcome = b.auras.some((a) => a.id === 'enrage') ? 'enrage' : 'wipe'
    s.sounds.push('wipe')
  }
}

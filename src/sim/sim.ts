import { ABILITIES } from './abilities'
import { RESOURCES, SWING_BASELINE_DAMAGE, abilityBar, specOf, type ClassId, makeSlots, type RaidSize } from './classes'
import { mayStrike, updatePartyAi } from './ai'
import { updateBattlegroundAi, updateBattlegroundPlans } from './bgai'
import {
  CARRIER_SPEED,
  carrying,
  clearTerrain,
  teamOf,
  other as otherTeam,
  updateBattleground,
} from './battleground'
import {
  resolveBossCast,
  updateBoss,
  updateGround,
  billWalking,
  birthOoze,
  dropGift,
  landFlight,
  burstSpore,
  detonateSpill,
  freeSpiked,
  siphonFeed,
  spitOut,
  turnToward,
  SIPHON_PER_FESTER_TICK,
} from './boss'
import {
  holdOrFall,
  AURA_MECHANIC,
  AURA_TICK,
  addAura,
  addThreat,
  applyDamage,
  applyHeal,
  boss,
  bossOrNone,
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
  spikeBite,
  fightScale,
  urgencyOf,
  getAura,
} from './combat'
import {
  CRIT_CHANCE,
  CRIT_MULTIPLIER,
  DT,
  MELEE_RANGE,
  REEK_REACH,
  TICK_RATE,
  FESTER_LINE,
  INFECTION_FLUSH, MUSTER_PACE } from './constants'
import type { Rng } from './rng'
import { roomAt } from './room'
import { updateTravel, updateTravelAi } from './travel'
import { BOSS_ID } from './state'
import type { Ability } from './abilities'
import type { Actor, PlayerInput, SimState } from './types'

/**
 * Advances the fight by exactly one fixed tick.
 *
 * Order matters and must stay stable: timers, player, party AI, boss, ground,
 * then resolution. Changing the order changes replays.
 */
/**
 * Somebody in the raid is asked for the thing only they have.
 *
 * The player does not press it — they name it, and whoever is carrying it
 * answers. Which is the whole shape of the input: a raid cooldown belongs to a
 * class rather than to the body playing it, so what a roster can answer with is
 * decided on the composition screen and what it answers is decided here, in the
 * fight, by somebody watching.
 *
 * The nearest living carrier with it off cooldown. Nearest rather than first,
 * so a raid with three paladins spends the one standing in it rather than the
 * one who happens to hold the lowest id — and if none of them has it up, the
 * call is simply not answered. That is not a failure state to report; a raid
 * leader calling for something nobody has is a raid leader who has lost count,
 * and losing count is the cost of spending them badly.
 */
function answerCall(s: SimState, classId: ClassId, rng: Rng): void {
  const player = s.actors.find((a) => a.isPlayer)
  let best: Actor | null = null
  let closest = Infinity
  for (const a of s.actors) {
    if (a.faction !== 'party' || !a.alive || a.classId !== classId) continue
    const id = specOf({ classId: a.classId, spec: a.spec }).abilities.raid
    if (!id || (a.cooldowns[id] ?? 0) > 0 || a.castId) continue
    const away = player ? dist(a.pos, player.pos) : 0
    if (away < closest) {
      closest = away
      best = a
    }
  }
  if (!best) return
  const id = specOf({ classId: best.classId, spec: best.spec }).abilities.raid
  if (id) beginCast(s, best, id, best.id, rng)
}

/**
 * The raid taking its position, during the count.
 *
 * A fight the party walked into starts with everybody wherever the walk left
 * them, which is the whole of what makes arriving at a boss an arrival rather
 * than a scene change. But every number in `docs/mechanic-rules.md` was
 * measured from the opening formation, so a fight that simply began from a
 * doorway would be a fight measured against a raid that no longer stands where
 * the measurements assumed.
 *
 * So they walk to it, during the three seconds the boss is not moving either.
 * A pull that already starts in formation — the harness, a daily, a link — has
 * nobody more than a hair from their slot and this does nothing at all, which
 * is a property the build checks rather than a hope.
 *
 * Walking and nothing else: no timers, no abilities, no clock. The count is
 * still the count.
 */
function muster(s: SimState): void {
  if (s.mode !== 'raid') return
  const slots = makeSlots(s.party.length as RaidSize)
  const c = roomAt(s.room)
  for (const a of s.actors) {
    if (a.faction !== 'party' || !a.alive) continue
    // Party bodies are made in slot order and numbered from one, so a body
    // knows which place is its own without being told.
    const slot = slots[a.id - 1]
    if (slot === undefined) continue
    const want = { x: slot.x + c.x, y: slot.y + c.y }
    const away = dist(a.pos, want)
    if (away < 1) continue
    a.prevPos.x = a.pos.x
    a.prevPos.y = a.pos.y
    const stride = Math.min(away, a.moveSpeed * MUSTER_PACE * DT)
    a.pos.x += ((want.x - a.pos.x) / away) * stride
    a.pos.y += ((want.y - a.pos.y) / away) * stride
    turnToward(a, Math.atan2(want.y - a.pos.y, want.x - a.pos.x))
  }
}

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
    muster(s)
    return
  }

  s.tick++
  s.time += DT

  for (const a of s.actors) {
    a.prevPos.x = a.pos.x
    a.prevPos.y = a.pos.y
  }

  // Who has already breathed the reek this tick. Held for the whole pass
  // rather than per body, because the point of it is that two clouds over one
  // person are still one lungful — see the reek inside `updateTimers`.
  const breathed = new Set<number>()
  for (const a of s.actors) updateTimers(s, a, breathed)

  if (input.call) answerCall(s, input.call, rng)

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
    else if (s.mode === 'travel') updateTravelAi(s, a, rng)
    else if (a.faction === 'party') updatePartyAi(s, a, rng)
  }

  updateAutoAttacks(s, rng)

  if (s.mode === 'battleground') updateBattleground(s)
  else if (s.mode === 'travel') updateTravel(s, rng)
  else updateBoss(s, rng)
  updateGround(s)
  updateProjectiles(s, rng)

  // What a step cost, for the one mechanic billed on movement. After the
  // walking and before the resolution, because what it reads is the difference
  // between where a body was at the top of this tick and where it is now, and
  // this is the only place both are known.
  if (s.mode === 'raid') for (const a of s.actors) if (a.faction === 'party' && a.alive) billWalking(s, a)

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
    // A held swing is still a decision, and the two mechanics answered by not
    // hitting something would be answered by nobody if the weapon carried on
    // regardless. The swing timer is deliberately left where it is rather
    // than reset: holding fire costs the swing, not the next one.
    if (!mayStrike(a, target)) continue

    a.swingTimer = auto.speed
    // Physical, so it answers armour and block the way a weapon should. The
    // boss carries neither, which is a decision it can change without this
    // needing to know.
    // A weapon crits like anything else the party throws.
    const crit = rng.chance(CRIT_CHANCE)
    const hit = auto.damage * urgencyOf(a) * (crit ? CRIT_MULTIPLIER : 1)
    applyDamage(s, target, Math.round(auto.damage * urgencyOf(a)), 'physical', { sourceId: a.id, crit })

    // A weapon swing had no picture at all: damage arrived every three
    // seconds from a token standing still. Melee get an arc where the swing
    // went, everyone gets the hit landing, and the hunter already has a bolt.
    const facing = Math.atan2(target.pos.y - a.pos.y, target.pos.x - a.pos.x)
    if (auto.range <= MELEE_RANGE) pushEffect(s, 'swing', a.pos, { angle: facing })
    pushEffect(s, 'impact', target.pos, {
      angle: facing,
      power: hit,
      crit,
    })
    if (target.id === BOSS_ID) addThreat(s, a.id, auto.damage)
    // Rage is earned here rather than handed out, which is why a warrior that
    // cannot reach anything cannot do anything either. What is new is only how
    // much a swing is worth: what it hit for.
    //
    // A flat thirty was right while there was one weapon in the game and every
    // melee swung it every three seconds. The moment a poleaxe swung every
    // four and a half, a flat rate was a thirty-two percent pay cut for the
    // one spec carrying it — a warrior with a third less rage presses a third
    // fewer buttons — and `rendercheck` found it as the damage specs spreading
    // from 1.34 to 1.45.
    //
    // Off the damage rather than off the swing timer, though the two would
    // come to the same thing for the two weapons in the game today, because
    // only one of them stays true of a weapon that is not a straight trade of
    // speed for size. It also makes a crit worth what a crit is: a heavier
    // blow, and heavier blows are what rage is.
    gainPower(a, (RESOURCES[a.resource].onSwing * hit) / SWING_BASELINE_DAMAGE)
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
  // Whose side this body is on, which is a question with an answer that can
  // change. A turned mind keeps its faction — the tally, the party frames and
  // the win condition all read that, and a body that left the raid for twelve
  // seconds would have left all of them — and swings at the raid instead.
  //
  // And can be swung at back. This said the opposite for as long as the
  // mechanic existed: the raid aimed only at the other faction, so a turned
  // body was untouchable, and "do not kill them" was a rule the game enforced
  // rather than a demand it made. That reads as tidy and it empties the rung.
  // The whole of this mechanic is that the thing you must not kill is wearing
  // the face of somebody you were relying on a second ago, and a demand
  // nobody can fail is not a demand -- the boss's own page says the raid
  // killing its own healer has to be possible.
  //
  // So it is a target like any other, and stopping is the decision. It costs
  // a reaction delay to reach, through `hold:` in `targetCall`, which is what
  // makes noticing late cost something.
  const turned = getAura(from, 'turned') !== undefined
  const hostile =
    s.mode === 'battleground'
      ? (a: Actor) => teamOf(a) === otherTeam(teamOf(from))
      : turned
        ? // A turned body swings at whoever is still the raid, not at the
          // other bodies the fight has taken.
          (a: Actor) => a.faction === 'party' && a.id !== from.id && !getAura(a, 'turned')
        : (a: Actor) => a.faction === 'boss' || (a.faction === 'party' && getAura(a, 'turned') !== undefined)
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

function updateTimers(s: SimState, a: Actor, breathed: Set<number>): void {
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

    // The one aura in the game taken off by something other than time.
    //
    // A festering wound closes the moment the body wearing it is back over the
    // line, which is what makes it a mechanic rather than a bill: a healer who
    // is early stops the rest of it, and a healer who waits until the body is
    // in trouble has already paid every tick. Checked before the tick rather
    // than after it, so being over the line when the second comes round is
    // worth the tick it saves.
    if (aura.id === 'festering' && a.hp > a.maxHp * FESTER_LINE) {
      a.auras.splice(i, 1)
      continue
    }

    // And the infection burning out in a chosen place rather than a found one.
    //
    // The same shape read the other way round: a wound is answered by getting
    // a body *out of* trouble, and this one is answered by getting a body that
    // is not in trouble all the way to the top. What it buys is not the
    // carrier's health, it is where the thing it leaves behind will stand.
    if (aura.id === 'infected' && a.hp >= a.maxHp * INFECTION_FLUSH) {
      a.auras.splice(i, 1)
      birthOoze(s, a)
      continue
    }

    aura.remaining -= DT
    aura.tickTimer += DT

    while (aura.tickTimer >= 1) {
      aura.tickTimer -= 1
      const tick = AURA_TICK[aura.id]
      if (!tick) continue
      // A shade bills only while it has caught up, which `updateShades` keeps
      // on the mark. Without this it is a dot with a long name and standing
      // still is as good an answer as running.
      if (aura.id === 'haunted' && aura.stacks === 0) continue
      if (tick.damage !== undefined) {
        const bite =
          aura.id === 'spiked' ? spikeBite(aura, tick.damage) * fightScale(s) : tick.damage
        // Named where the fight is what put it there, so the page and every
        // probe that reads the per-mechanic split can see it. A dot the boss
        // applied is
        // as much a mechanic hit as a pool stood in, and leaving it anonymous is
        // why a sweep of "what actually lands on people" reported zero for three
        // mechanics that land every pull.
        const from = AURA_MECHANIC[aura.id]
        applyDamage(s, a, bite, 'none', {
          sourceId: aura.sourceId,
          silent: true,
          ...(from ? { mechanic: from } : {}),
        })
        // The reek does not stay where it was put. Everybody standing near the
        // marked body pays the same tick, which is what makes the answer
        // distance rather than a dispel — and what puts it at odds with the
        // spore on the same boss, which asks the raid to come together.
        //
        // Once a second whoever it came from, which is the difference between
        // a mechanic and a wall. A bigger raid carries more marks and stands
        // closer together, so a body inside two clouds was paying twice: at
        // twenty-five that was seventy-one ticks each against a ten-man's
        // thirty-five, and the fight read 0% won at that size and 100% at ten.
        // It is one bad air rather than three, and one lungful is one lungful.
        if (aura.id === 'reek' && a.faction === 'party') {
          for (const other of s.actors) {
            if (other.faction !== 'party' || !other.alive || other.id === a.id) continue
            if (breathed.has(other.id)) continue
            if (dist(other.pos, a.pos) > REEK_REACH) continue
            breathed.add(other.id)
            applyDamage(s, other, bite, 'none', {
              sourceId: aura.sourceId,
              silent: true,
              mechanic: 'vilegas',
            })
          }
        }
        // Every tick of the boss's own wound is a deposit, on the boss that
        // keeps a gauge. It is what turns the healers' throughput problem into
        // a timing one: the wound is unavoidable and running it to term is not.
        if (aura.id === 'festering' && a.faction === 'party') {
          siphonFeed(s, SIPHON_PER_FESTER_TICK, a.pos)
        }
        if (a.faction === 'boss') addThreat(s, aura.sourceId, bite)
      }
      if (tick.heal !== undefined) applyHeal(s, a, tick.heal, aura.sourceId)
    }

    if (aura.remaining <= 0) {
      a.auras.splice(i, 1)
      // The pin running out on its own, which takes the spike with it: a
      // spike still standing over somebody who is free again is a target the
      // raid would keep answering for nothing.
      if (aura.id === 'spiked') freeSpiked(s, aura.sourceId)
      // The spore going, which is the moment everybody who came to stand in
      // it is covered against a mechanic that has not happened yet.
      if (aura.id === 'spore' && a.alive) burstSpore(s, a)
      // Blood going off where the body it was put on is standing, which is why
      // the carrier cannot dodge it and everybody else can.
      if (aura.id === 'spilling' && a.alive) detonateSpill(s, a)
      // And the boss putting somebody back, with everything it took.
      if (aura.id === 'swallowed' && a.alive) spitOut(s, a)
      // And a small thing standing exactly where the body carrying it was.
      // This is the only place in the game where an expiry is a *location*:
      // the carrier chose it by walking and the healer chose the moment by
      // deciding whether to take the dot off early.
      if (aura.id === 'infected' && a.alive) birthOoze(s, a)
      // A gift that ran out of warning, which is the raid losing one of its
      // own -- and a gift that has only run out of its good half, which is
      // the warning starting.
      if (aura.id === 'gifted' && a.alive) addAura(a, 'souring', BOSS_ID)
      if (aura.id === 'souring' && a.alive) dropGift(s, a)
      // And the boss coming down.
      if (aura.id === 'aloft' && a.alive) landFlight(s, a)
    }
  }
}

function updatePlayer(s: SimState, input: PlayerInput, rng: Rng): void {
  const player = s.actors.find((a) => a.isPlayer)
  if (!player || !player.alive) return

  // Swallowed, and the whole controller does nothing. The same rule the roster
  // plays under, and it has to be here as well or the mechanic would be one
  // only other people are subject to -- a player who kept playing from inside
  // the boss would be a player the fight had handed four free seconds to.
  if (getAura(player, 'swallowed')) return

  const len = Math.hypot(input.moveX, input.moveY)
  // Pinned, and the stick does nothing. The same rule the roster plays under,
  // and it has to be here rather than only in the AI or the mechanic would be
  // a mechanic only other people are subject to.
  if (len > 0.01 && !getAura(player, 'spiked')) {
    const stepLen =
      player.moveSpeed *
      DT *
      (carrying(s, player) ? CARRIER_SPEED : 1) *
      hasteOf(player)
    const stepX = (input.moveX / len) * stepLen
    const stepY = (input.moveY / len) * stepLen
    player.pos.x += stepX
    player.pos.y += stepY
    // A person may walk off a platform. That is the difference between the
    // player and the party: the AI is never handed a target off the floor, and
    // the player is handed the floor itself.
    holdOrFall(s, player)
    clearTerrain(s.obstacles, player.pos, player.radius, stepX, stepY)
    // Moving breaks your own cast — the core tension with Burst.
    if (player.castId) interruptCast(s, player, 'moved')
  }

  // Which way the player is turned, which is the one thing on an actor that
  // the party AI decides deliberately and a player cannot be asked to.
  //
  // There is no button for it and there is not going to be one: a keyboard
  // that turns you is a keyboard with a camera on it, and this game is played
  // from above. So a player faces where they are walking, and faces the boss
  // when they are standing still.
  //
  // Nothing is decided by a bearing today. This is kept because the drawing
  // reads it -- a raid all pointing one way regardless of what any of them
  // was doing looks like a row of cardboard -- and because the day something
  // asks for a bearing again, a player who has to be told which way they are
  // facing has already lost the mechanic.
  //
  // Standing still with nothing to face is a real state now: a room the party
  // is only crossing has no boss in it. There the bearing is left alone. It
  // used to be pointed at the way out, and a body that turns to the nearest
  // door the moment it stops walking is a body arranged around the door —
  // cross a hub with five of them and the whole raid pivots as you go, for a
  // thing nobody is looking at. Where there is nothing to face, nothing turns.
  const look = bossOrNone(s)?.pos ?? null
  if (len > 0.01) {
    turnToward(player, Math.atan2(input.moveY, input.moveX))
  } else if (look) {
    turnToward(player, Math.atan2(look.y - player.pos.y, look.x - player.pos.x))
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
 * after the fact and has nothing left to do, and so is every bolt a boss
 * throws — its mechanic was billed where it was thrown. The caster is not
 * required to still be alive — a shot that was in the air when its owner died
 * still lands, which is the same rule every game this apes uses.
 *
 * Read off the ability rather than off the thrower. A boss's bolts name their
 * mechanic so the renderer can colour them, and a mechanic is not an ability,
 * so the lookup below is what says they are scenery.
 */
function land(s: SimState, p: SimState['projectiles'][number], rng: Rng): void {
  if (!p.abilityId) return
  const ability = ABILITIES[p.abilityId]
  const source = p.sourceId === null ? undefined : s.actors.find((a) => a.id === p.sourceId)
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

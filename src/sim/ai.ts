import { ABILITIES } from './abilities'
import {
  ARENA_RADIUS,
  BURDEN_REACH,
  CRUSH_TELEGRAPH,
  DT,
  FAULT_TELEGRAPH,
  MELEE_RANGE,
  PUDDLE_TELEGRAPH,
  SCHISM_MUSTER_ROOM,
  SCHISM_ROOM,
  SCHISM_TELEGRAPH,
  SHALLOWS_TELEGRAPH,
  SOAK_TELEGRAPH,
  SPREAD_RADIUS,
  YOKE_REACH,
} from './constants'
import {
  BREATH_CAST,
  ECHO_TELEGRAPH,
  HAND_BEAT,
  condemned,
  insideCone,
  inShockwaveGap,
  onShallows,
  schismClash,
  schismMuster,
  underHand,
  verdictLine,
} from './boss'
import { specOf } from './classes'
import { damageOrder } from './autocast'
import {
  adds,
  beginCast,
  boss,
  burdenTaker,
  carryDrag,
  dist,
  getAura,
  hasteOf,
  interruptCast,
  livingParty,
  mostHurt,
  say,
  topThreatTarget,
} from './combat'
import type { Rng } from './rng'
import { clampToArena } from './state'
import type { Actor, AuraId, GroundEffect, SimState, Vec2 } from './types'

/**
 * Party AI.
 *
 * Three layers, evaluated in order: stay alive, do your job, fill with damage.
 * On top of that sits a "humanity" layer — reaction delay, fumble rolls and a
 * pull toward the rest of the group — because an AI that always picks the
 * optimal tile at frame zero reads as a robot, not a raider.
 */

/** How much room a brand looks for before it burns out. */
const BRAND_ROOM = 130

/**
 * How far under the judgement's line a healer starts worrying, as a share of
 * the bar. Roughly one cast: waiting until somebody is actually under it is
 * waiting until the answer no longer fits in the count.
 */
const VERDICT_MARGIN = 0.12

/**
 * How much slower answering a call is than stepping out of fire.
 *
 * This is the number the whole mechanic turned on, and it is the only honest
 * finding in it. `reactionDelay` is calibrated for movement — a quarter of a
 * second for a steady raider, six tenths for a greedy one, and 40% off both
 * by the ninth pull. Against a puddle that is decisive, because the answer to
 * a puddle is a step and a step costs nothing else. Against a judgement the
 * answer is a heal, and in front of every heal sits a global cooldown of a
 * second and a half and a cast of two seconds more. A tenth of a second of
 * extra hesitation in front of three and a half seconds of machinery changes
 * nothing: measured, an unpractised raid and a practised one both lost 3% of
 * their judgements, and the mechanic taught 3.8 points, which is noise.
 *
 * So the delay is scaled to the size of the thing being delayed. Reading a
 * raid frame, deciding whose problem it is, and re-aiming is not a sidestep,
 * and the same two numbers that separate the pulls — the delay and the fumble
 * — separate them by thirty points once they are expressed at the scale of
 * the answer rather than at the scale of a step.
 */
const VERDICT_NOTICE = 6

/**
 * The same again, for a change of target.
 *
 * `reactionDelay` is a quarter of a second for a steady raider and a tenth
 * off that by the ninth pull, which is the right scale for a sidestep and the
 * wrong one for everything else. Stepping out of a pool is one decision with
 * nothing in front of it. Deciding what to hit is noticing a thing arrived,
 * reading which of two kinds it is, and then re-aiming a rotation that is
 * already mid-global — and a global cooldown is a second and a half on its
 * own. A tenth of a second of extra hesitation in front of that machinery
 * changes nothing, which is exactly the finding the judgement produced.
 *
 * So the delay is expressed at the scale of the answer, and the two numbers
 * that separate a first pull from a ninth separate them by an amount the
 * mechanic can actually be built around. Five rather than the judgement's
 * six: a target call has one cast in front of it, not a cast and a heal
 * landing in time.
 */
const SWITCH_NOTICE = 5

const DANGER_MARGIN = 14

/** Casters stay inside ability range but out of the boss's lap. */
const CASTER_MIN_RANGE = 95
const CASTER_MAX_RANGE = 320
const CASTER_IDEAL_RANGE = 225
const HEAL_REACH = 360

export function updatePartyAi(s: SimState, actor: Actor, rng: Rng): void {
  const ai = actor.ai
  if (!ai || !actor.alive) return

  ai.chatCooldown = Math.max(0, ai.chatCooldown - DT)

  // The one call that is not about where to stand, so it is made before the
  // one that is and kept in its own pair of fields.
  if (actor.role === 'healer') watchTheLine(s, actor, rng)

  // And the one that is not about where to stand either, for the same reason
  // and kept in its own third pair of fields.
  readTheField(s, actor, rng)

  const danger = currentDanger(s, actor)

  // Reaction time is rolled once per distinct danger, not per tick, so the
  // AI does not "re-notice" the same puddle every frame.
  if (danger === null) {
    ai.reactingTo = null
    ai.reactionTimer = 0
    ai.fumbled = false
  } else if (ai.reactingTo === null) {
    // Noticing danger at all is what costs reaction time.
    ai.reactingTo = danger
    ai.fumbled = false
    ai.reactionTimer = ai.reactionDelay * rng.range(0.7, 1.4)
    // A fumble means it reacts far too late — the AI equivalent of
    // tunnel-visioning on your rotation.
    if (rng.chance(ai.mistakeChance)) {
      ai.fumbled = true
      ai.reactionTimer += rng.range(0.8, 1.6)
    }
  } else if (danger !== ai.reactingTo) {
    // Already alert: switching threats does not buy another delay, or a party
    // caught between two mechanics would freeze between them. The destination
    // is deliberately kept — isSpotSafe re-validates it against every hazard,
    // and clearing it here made the AI re-pick every tick and jitter in place.
    ai.reactingTo = danger
  }

  if (ai.reactionTimer > 0) ai.reactionTimer -= DT

  const reacting = danger !== null && ai.reactionTimer <= 0

  if (reacting) {
    // Recompute only when there is no destination or the chosen one went bad.
    // Re-picking every tick makes the AI jitter in place and never escape.
    if (!ai.moveTarget || !isSpotSafe(s, actor, ai.moveTarget)) {
      ai.moveTarget = findSafeSpot(s, actor, rng)
    }
    if (actor.castId) {
      // Greedy players try to squeeze the cast out; timid ones bail instantly.
      const nearlyDone = actor.castRemaining < 0.35
      const greedy = ai.personality === 'greedy'
      if (!(greedy && nearlyDone)) interruptCast(s, actor, 'moved')
    }
    if (danger.startsWith('schism')) {
      say(s, actor, 'Groups, break up')
    } else if (danger.startsWith('wave')) {
      say(s, actor, 'Inside, get in!')
    } else if (danger.startsWith('fault')) {
      say(s, actor, 'Across the crack!')
    } else if (danger.startsWith('shallows')) {
      say(s, actor, 'Onto the shallows!')
    } else if (danger.startsWith('breath')) {
      say(s, actor, 'Out of the front')
    } else if (danger.startsWith('spread')) {
      say(s, actor, 'Spreading out')
    } else if (danger.startsWith('hand')) {
      say(s, actor, 'Behind it, follow it round')
    } else if (danger.startsWith('echo')) {
      say(s, actor, 'It is under me again')
    } else if (danger === 'burden:self') {
      say(s, actor, 'Take this off me')
    } else if (danger.startsWith('burden:')) {
      say(s, actor, 'Bring it here')
    } else if (danger === 'yoke:self') {
      say(s, actor, 'On me — I cannot hold this alone')
    } else if (danger.startsWith('yoke:')) {
      say(s, actor, 'Going to help carry')
    } else if (ai.personality === 'timid') {
      say(s, actor, 'Moving!')
    }
  } else if (ai.moveTarget && isSpotSafe(s, actor, actor.pos) && !outOfPosition(s, actor)) {
    // The danger passed and here is fine. Stop; do not walk back to some
    // nominal home. Chasing a home position that is itself defined relative
    // to a moving boss is what made the party pace back and forth.
    ai.moveTarget = null
  } else if (!ai.moveTarget && outOfPosition(s, actor)) {
    // Home, unless home is the floor that is about to cave in.
    //
    // Nothing checked this before, because until the crush no mechanic
    // covered the place a role wants to *be*: a puddle lands where somebody
    // is standing, and by the time anyone walks back it has already gone off.
    // The crush covers the melee's own ground for a second, so a melee that
    // finished its step out early turned round, walked back in, and was
    // caught by the thing it had already dodged.
    //
    // Narrow on purpose rather than a general "is home safe". Run through
    // `isSpotSafe` instead, an unpractised raid stops walking back into
    // anything at all — measured, that alone took the brand from seventeen
    // points of teaching to six, because most of what the brand teaches is
    // not walking onto your own. One mechanic's fix is not a licence to make
    // every other mechanic easier.
    const home = idlePosition(s, actor)
    // The wedge gets the same narrow guard as the caving band, and for the
    // same reason: home is a bearing off the boss, the wedge covers bearings,
    // and a melee that finished its step and walked back is a melee that
    // dodged the pulse and stood in the next one.
    //
    // The echo deliberately gets none. Home for the one carrying it is the
    // ground it just left, and walking back onto your own floor is not a bug
    // in this mechanic, it is the thing it is asking about — the brand
    // measured ten of its seventeen points of teaching in that habit alone.
    if (!caving(s, home) && !swept(s, home) && !stillSplit(s, actor, home))
      ai.moveTarget = home
  }

  moveToward(s, actor, ai.moveTarget)
  useAbilities(s, actor, rng)
}

/**
 * The healer's half of a judgement, and the only place skill reaches healing.
 *
 * Everything else a party member does about a mechanic runs through
 * `currentDanger` above, where noticing late and fumbling outright already
 * live. Healing does not go anywhere near that path — `healerRotation` reads
 * a health bar and casts, with no notion of having spotted anything — so a
 * mechanic answered by healing would be answered identically by a raid on its
 * first pull and its ninth. That is not a property of healing, it is a
 * property of the rotation having no reaction in it. This puts one there, out
 * of the same two numbers and rolled the same way: notice once per mark, wait
 * out the delay, and sometimes miss it entirely.
 *
 * It cannot share `reactingTo` with the movement path. Answering a judgement
 * means standing still and casting, and a healer that had spent its danger
 * slot on one would then be told to go and find a safe tile.
 */
function watchTheLine(s: SimState, actor: Actor, rng: Rng): void {
  const ai = actor.ai!
  const marked = livingParty(s).filter((a) => getAura(a, 'verdict') !== undefined)

  const shaky = (a: Actor): boolean => a.hp <= verdictLine(a) + a.maxHp * VERDICT_MARGIN

  // A claim is kept until the body it was made about is out of danger, one
  // way or the other. Re-deciding every tick is what a raid calling targets
  // out loud exists to prevent, and an AI that does it drops the cast it was
  // halfway through every time somebody else's health bar moves.
  let mine = marked.find((a) => ai.callTo === `verdict:${a.id}` && shaky(a))

  if (!mine) {
    // Anything another healer has already called is somebody else's.
    const spoken = new Set(
      livingParty(s)
        .filter((a) => a.role === 'healer' && a.id !== actor.id)
        .map((a) => a.ai?.callTo),
    )
    mine = marked
      .filter((a) => shaky(a) && !spoken.has(`verdict:${a.id}`))
      .sort((a, b) => getAura(a, 'verdict')!.remaining - getAura(b, 'verdict')!.remaining)[0]
  }

  if (!mine) {
    ai.callTo = null
    ai.callTimer = 0
    ai.answering = null
    return
  }

  const key = `verdict:${mine.id}`
  if (ai.callTo !== key) {
    ai.callTo = key
    ai.callTimer = ai.reactionDelay * VERDICT_NOTICE * rng.range(0.7, 1.4)
    if (rng.chance(ai.mistakeChance)) ai.callTimer += rng.range(0.8, 1.6)
  }
  if (ai.callTimer > 0) ai.callTimer -= DT
  ai.answering = ai.callTimer > 0 ? null : mine.id
}

/**
 * What this one has decided to hit, and how long it took to decide.
 *
 * The third reaction channel, and the last thing in the fight that was not
 * going through one. Everything answered by walking runs through
 * `currentDanger`, healing a judgement runs through `watchTheLine`, and
 * choosing a target ran through neither: a rotation read `adds(s)`, took the
 * lowest health bar in it, and did that identically on a first pull and a
 * ninth. Anything answered by the choice of target was therefore unteachable
 * however lethal it was, which is most of why the thralls measure at nothing.
 *
 * It cannot share either of the other two slots. An actor that spent its
 * danger slot on a target call would then be sent to find a safe tile, and
 * one that spent its healer slot on it would stop answering judgements — and
 * a real pull asks all three at once, which is the whole point of them being
 * three.
 */
function readTheField(s: SimState, actor: Actor, rng: Rng): void {
  const ai = actor.ai!
  const want = targetCall(s, actor)

  if (want === null) {
    ai.switchTo = null
    ai.switchTimer = 0
    ai.striking = null
    return
  }

  if (ai.switchTo !== want) {
    ai.switchTo = want
    ai.switchTimer = ai.reactionDelay * SWITCH_NOTICE * rng.range(0.7, 1.4)
    if (rng.chance(ai.mistakeChance)) ai.switchTimer += rng.range(0.8, 1.6)
  }
  if (ai.switchTimer > 0) ai.switchTimer -= DT

  const held = ai.striking
  ai.striking = ai.switchTimer > 0 ? null : want
  if (ai.striking !== null && ai.striking !== held) {
    if (ai.striking === 'hush') say(s, actor, 'Stop — everything comes back')
    else if (ai.striking.startsWith('knell:')) say(s, actor, 'Onto the bell, all of you')
    else say(s, actor, 'Leave that one alone')
  }
}

/**
 * The one call worth making, as a stable key.
 *
 * Ranked rather than merged, the way `currentDanger` is: while the surface is
 * closed nothing is hit at all, so a bell and a vessel on the field at the
 * same time are both answered by the same silence. Below that the bell comes
 * first because it is the one with a deadline on it — hitting the bell is
 * already not hitting the vessel, so ranking that way costs the second call
 * nothing.
 *
 * A key rather than a target, so the reaction delay is rolled once per
 * decision instead of once per tick. The id is in it deliberately: a second
 * bell is a second decision and has to be paid for again.
 */
function targetCall(s: SimState, actor: Actor): string | null {
  if (actor.role === 'healer' && actor.ai?.answering !== null) return null

  const b = boss(s)
  if (getAura(b, 'mirror') || b.castId === 'boss_mirror') return 'hush'

  const bell = s.actors.find((a) => a.faction === 'boss' && a.spawn === 'knell' && a.alive)
  if (bell) return `knell:${bell.id}`

  const jar = s.actors.find((a) => a.faction === 'boss' && a.spawn === 'vessel' && a.alive)
  if (jar) return `spare:${jar.id}`

  return null
}

/** The id in a call of the form `something:42`, or null if there is none. */
function calledId(call: string | null, prefix: string): number | null {
  if (call === null || !call.startsWith(prefix)) return null
  const id = Number(call.slice(prefix.length))
  return Number.isFinite(id) ? id : null
}

/**
 * Whether this body is willing to land a hit on that one right now.
 *
 * Asked by the weapons as well as by the rotations, because a mechanic
 * answered by not hitting something is answered by nobody if the auto-attack
 * carries on regardless — a melee standing in the boss's lap swings at it
 * every couple of seconds without anyone deciding anything, and a rule that
 * only reaches the buttons would have left every melee in the raid marked
 * whatever it did.
 */
export function mayStrike(s: SimState, actor: Actor, target: Actor): boolean {
  const call = actor.ai?.striking ?? null
  if (call === null) return true
  if (call === 'hush') return target.id !== boss(s).id
  const spared = calledId(call, 'spare:')
  return spared === null || target.id !== spared
}

/**
 * What a rotation should be aimed at, given whatever it has decided.
 *
 * The default is untouched and has to be: summons that walk in and hit
 * somebody are picked the way they always were, lowest health bar first, so
 * the thralls and the stalker are the same mechanic they were measured as.
 * What is new is the two exceptions, and both of them cost a reaction delay
 * to reach — the bell is invisible to a rotation until somebody decides to
 * look at it, and the vessel stops being a target only once somebody decides
 * to leave it alone.
 */
function strikeTarget(s: SimState, actor: Actor, pool: Actor[]): Actor {
  const b = boss(s)
  const call = actor.ai?.striking ?? null

  const ringing = calledId(call, 'knell:')
  if (ringing !== null) {
    // By faction as well as by id: one counter numbers every object in the
    // fight and the raid's own ids start at one, so a body summoned early
    // enough can share an id with a raider standing in front of it.
    const bell = s.actors.find((a) => a.faction === 'boss' && a.id === ringing)
    if (bell && bell.alive) return bell
  }

  const spared = calledId(call, 'spare:')
  // A summon that is not hurting anybody is not what a rotation aimed at
  // whatever is hurting the raid would ever pick. That is the read the bell
  // is built on, so it is a rule about the party rather than a rule about the
  // bell: nothing here knows what a bell is, only that this one is standing
  // still doing nothing.
  const summoned = pool.filter((a) => a.spawn !== 'knell' && a.id !== spared)
  if (summoned.length === 0) return b

  let focus = summoned[0]!
  for (const a of summoned) if (a.hp < focus.hp) focus = a
  return focus
}

/** Whoever this healer has decided to save, if it has decided at all. */
function rescueTarget(s: SimState, actor: Actor): Actor | null {
  const id = actor.ai?.answering
  if (id === null || id === undefined) return null
  const target = s.actors.find((a) => a.id === id)
  return target && target.alive && getAura(target, 'verdict') ? target : null
}

/**
 * The single most urgent thing to run from, as a stable key.
 *
 * Returning merely the first hazard found meant an AI reacting to the breath
 * would not notice the puddle detonating under its feet. Rank them instead:
 * already burning beats about to burn beats everything else.
 */
function currentDanger(s: SimState, actor: Actor): string | null {
  let bestKey: string | null = null
  let bestUrgency = -1

  const consider = (key: string, urgency: number): void => {
    if (urgency > bestUrgency) {
      bestUrgency = urgency
      bestKey = key
    }
  }

  if (getAura(actor, 'spread')) consider('spread:self', 62)

  // Branded, and standing where the raid needs the floor. The urgency sits
  // just under a spread's: getting this wrong costs ground rather than
  // health, and ground is paid for later.
  if (getAura(actor, 'brand')) consider('brand:self', 58)

  // Holding a weight that only somebody else can take off. The urgency
  // climbs with the fuse, and it climbs from below the floor rather than
  // above it: the answer to this one is a walk into another body, and a
  // carrier that valued the handoff over the fire would walk through a puddle
  // to make it. That trade was already measured once on the stalker, where
  // the mechanic's real damage turned out to be the deaths it caused by
  // outranking the ground, and it is not being made again here.
  const weight = getAura(actor, 'burden')
  if (weight) {
    const spent = 1 - Math.max(0, weight.remaining) / Math.max(0.01, weight.duration)
    consider('burden:self', 64 + spent * 20)
  }

  // Being the one it is being brought to. This is the half of the handoff
  // that makes it a handoff at all: the carrier walking is only half a
  // meeting, and a raid where nobody comes out to take it is a raid that
  // drops every weight on the last leg.
  const bringing = burdenBringer(s, actor)
  if (bringing) {
    const mark = getAura(bringing, 'burden')!
    const spent = 1 - Math.max(0, mark.remaining) / Math.max(0.01, mark.duration)
    consider(`burden:${bringing.id}`, 64 + spent * 20)
  }

  // A debt somebody is about to pay, and having been named to go and halve
  // it. Ranked with the gathering rather than with the marks, and for the
  // gathering's reason: everything else in this list costs the person who got
  // it wrong, and this costs the person who got it right and was left
  // standing on their own.
  //
  // The one who owes it reacts too. It cannot fetch its own bearer, but it
  // can stop walking away from the rest of them while one is on the way —
  // which is the only answer available to it.
  const owed = getAura(actor, 'yoke')
  if (owed) {
    const spent = 1 - Math.max(0, owed.remaining) / Math.max(0.01, owed.duration)
    consider('yoke:self', 80 + spent * 8)
  } else {
    const join = yokeToJoin(s, actor)
    if (join) {
      const mark = getAura(join, 'yoke')!
      const spent = 1 - Math.max(0, mark.remaining) / Math.max(0.01, mark.duration)
      consider(`yoke:${join.id}`, 80 + spent * 8)
    }
  }

  // Something is walking over. It is slower than anyone it picks, so the
  // answer is simply to keep moving — but only for the one it picked, and
  // only while it is close enough to matter. Urgency below a puddle: fire on
  // the floor kills faster than a thing that is still ten paces away.
  const stalker = hunterOf(s, actor)
  if (stalker && dist(actor.pos, stalker.pos) < STALK_ROOM) {
    consider(`hunted:${stalker.id}`, 66)
  }

  for (const g of s.ground) {
    if (g.kind === 'breath') {
      if (!g.detonated && insideCone(actor.pos, g)) {
        consider(`breath:${g.id}`, 70 + (BREATH_CAST - g.telegraph) * 8)
      }
      continue
    }

    // The floor under the melee, about to cave in. Ranked above everything
    // that is merely on fire, and rising as the second runs out: this is the
    // one hazard here that is a single enormous hit at a known instant rather
    // than a place that keeps hurting, so being late by a tenth of a second
    // is the whole of the mechanic.
    //
    // It has to outrank the melee's own reason to stand there, which is
    // `findSafeSpot`'s job rather than this one's — but nothing gets that far
    // until this returns the crush as the thing worth reacting to, and a
    // mechanic that never becomes the *most* urgent thing is a mechanic the
    // reaction delay never gets applied to.
    if (g.kind === 'crush') {
      if (!g.detonated && dist(actor.pos, g.pos) <= g.radius + DANGER_MARGIN) {
        consider(`crush:${g.id}`, 92 + (CRUSH_TELEGRAPH - g.telegraph) * 12)
      }
      continue
    }

    // The pulse about to land, and only that one. Ranked with the caving
    // band, which is the same kind of thing: one enormous hit at a known
    // instant, where being a tenth of a second late is the whole mechanic.
    //
    // The beat *after* it is deliberately not a danger here. It was, and it
    // cost the mechanic everything: an actor that starts walking as soon as
    // the wedge is pointed anywhere near it gets two beats of warning rather
    // than one, and two beats is a stroll — measured, the hand caught four
    // bodies in eighty-two pulses and taught nothing at either end of the
    // practice curve. Where the wedge is going still belongs in `isSpotSafe`
    // and in the scoring, because walking out of one pulse and into the next
    // is not an answer either. Knowing where to go is free. Going in time is
    // the part that has to be practised.
    if (g.kind === 'hand') {
      if (underHand(actor.pos, g)) {
        consider(`hand:${g.id}`, 92 + (HAND_BEAT - g.telegraph) * 12)
      }
      continue
    }

    // The half of the floor that is about to stop being floor, and the floor
    // that is about to stop being floor everywhere but three patches. Both sit
    // beside the crush and just under it, and rise the same way as the count
    // runs out: they are single instants rather than places that keep hurting,
    // so being late by a tenth of a second is the whole mechanic.
    //
    // Under the crush rather than over it because the crush is the shorter
    // count of the three. A raid holding both should answer the one that lands
    // first, and the walk out of a band is a step where a crossing is a walk.
    if (g.kind === 'fault') {
      if (!g.detonated && onFault(actor.pos, g)) {
        consider(`fault:${g.id}`, 88 + (FAULT_TELEGRAPH - g.telegraph) * 12)
      }
      continue
    }

    // Stone about to come up, and then stone. Its own arm rather than the
    // pools' below, and a shade over a pool at the same distance: a pool is
    // ground that will be ground again in five seconds and this is not, so
    // being here when it lands costs the hit now and the floor afterwards.
    //
    // Deliberately here and not in `isSpotSafe` alone. Reaction delay and the
    // fumble roll live on this path and nowhere else, so a mechanic answered
    // only by the spot check is one practice cannot improve, however lethal.
    //
    // It gets no `caving`-style guard on the walk home. Home for anybody who
    // just left one is the ground they left, and walking back onto your own
    // stone is not a bug in this mechanic, it is the thing it asks about —
    // the brand measured ten of its seventeen points in that habit alone.
    if (g.kind === 'spire') {
      if (dist(actor.pos, g.pos) <= g.radius + DANGER_MARGIN) {
        consider(`spire:${g.id}`, g.detonated ? 100 : 82 + (PUDDLE_TELEGRAPH - g.telegraph) * 9)
      }
      continue
    }

    // The floor under whoever it marked, about to answer. Ranked just under
    // live fire: it is a bigger hit than a pool tick and there is less time
    // to be somewhere else, but a pool that has already gone off is burning
    // right now.
    if (g.kind === 'echo') {
      if (!g.detonated && dist(actor.pos, g.pos) <= g.radius + DANGER_MARGIN) {
        consider(`echo:${g.id}`, 88 + (ECHO_TELEGRAPH - g.telegraph) * 10)
      }
      continue
    }

    // The one hazard here whose danger is *not* being somewhere. Everything
    // else on this list is read by asking whether a body is inside a shape;
    // this asks whether it is inside any of three, and answers yes to the
    // whole rest of the arena.
    if (g.kind === 'shallows') {
      if (!g.detonated && !onShallows(actor.pos, g)) {
        consider(`shallows:${g.id}`, 86 + (SHALLOWS_TELEGRAPH - g.telegraph) * 10)
      }
      continue
    }

    // Not yet with your own group. The only danger on this list that is not
    // about a place, and the only one that stays live after the immediate
    // problem has gone.
    //
    // Both halves are load-bearing. Reading only the clash — somebody wearing
    // another mark standing on you — made the mechanic answerable by one step
    // sideways, because a step is all it takes to stop clashing with the body
    // that happened to be nearest. This AI keeps the smallest correction that
    // works and drops the walk the moment its spot is clear, so a raid told to
    // come apart into groups came apart by about a pace each and stayed one
    // crowd: measured, it was still two hundred and thirty-five units from its
    // own muster point when the count ran out.
    //
    // A formation is not a step, so the danger is not over until the formation
    // exists. What that costs is the walk, which is the whole price of the
    // mechanic and the reason it belongs to a boss with room in its table for
    // one — the same price the gathering charges, paid outward instead of in.
    if (g.kind === 'schism') {
      if (!g.detonated) {
        const muster = musterFor(s, actor)
        const adrift = muster !== null && dist(actor.pos, muster) > SCHISM_MUSTER_ROOM
        if (adrift || clashingWith(s, actor, actor.pos, g.radius + DANGER_MARGIN)) {
          consider(`schism:${g.id}`, 86 + (SCHISM_TELEGRAPH - g.telegraph) * 8)
        }
      }
      continue
    }

    if (g.kind === 'shockwave') {
      // Only a ring that has not reached you yet. One that has already swept
      // past is still on the floor — it lingers for the length of the fight —
      // and reading it as live made the whole arena dangerous forever.
      if (dist(actor.pos, g.pos) >= g.radius - g.band && !inShockwaveGap(actor.pos, g)) {
        consider(`wave:${g.id}`, 78)
      }
      continue
    }

    // Being outside the circle is the danger, and it gets worse as the timer
    // runs down. Urgency above the cone's: everything else here costs the one
    // who got it wrong, and this one costs everybody who got it right.
    if (g.kind === 'soak') {
      if (!g.detonated && dist(actor.pos, g.pos) > g.radius - actor.radius) {
        consider(`soak:${g.id}`, 84 + (SOAK_TELEGRAPH - g.telegraph) * 6)
      }
      continue
    }

    const d = dist(actor.pos, g.pos)
    if (d <= g.radius + DANGER_MARGIN) {
      // Standing in live fire is the most urgent state there is.
      consider(`puddle:${g.id}`, g.detonated ? 100 : 80 + (PUDDLE_TELEGRAPH - g.telegraph) * 9)
    }
  }

  // Standing next to someone about to detonate is just as lethal.
  for (const other of livingParty(s)) {
    if (other.id === actor.id) continue
    if (getAura(other, 'spread') && dist(actor.pos, other.pos) <= SPREAD_RADIUS + DANGER_MARGIN) {
      consider(`spread:${other.id}`, 55)
    }
  }

  return bestKey
}

/**
 * The thing following this actor, if anything is.
 *
 * Read off the aura rather than searched for by proximity: a stalker that has
 * walked past somebody else is still not their problem.
 */
function hunterOf(s: SimState, actor: Actor): Actor | null {
  const mark = getAura(actor, 'hunted')
  if (!mark) return null
  const stalker = s.actors.find((a) => a.id === mark.sourceId)
  return stalker && stalker.alive ? stalker : null
}

/**
 * The carrier that is bringing a weight to this one, if any.
 *
 * Read off `burdenTaker` rather than kept as a second piece of state, so the
 * body walking over and the body walking out are answering the same question
 * and cannot disagree about it.
 */
function burdenBringer(s: SimState, actor: Actor): Actor | null {
  if (getAura(actor, 'burden')) return null
  for (const other of livingParty(s)) {
    if (other.id === actor.id) continue
    if (!getAura(other, 'burden')) continue
    if (burdenTaker(s, other)?.id === actor.id) return other
  }
  return null
}

/**
 * The one this actor has been named to go and stand with, if any.
 *
 * Read off the mark the boss wrote when it landed, so the body walking over
 * and the thing deciding whether it arrived are reading one name and cannot
 * disagree about it. See `Aura.bearer` for why the name is written down
 * rather than worked out.
 *
 * It keeps answering from inside the radius too, which is not an oversight.
 * The first version returned nothing once the bearer was in reach — which
 * reads correctly, since standing there is the answer — and it made the
 * mechanic worse than useless: the danger cleared the instant anybody
 * arrived, the AI stopped reacting, walked back to whatever it considers home,
 * and was outside again by the time the yoke matured. A commitment that ends
 * the moment it is met is not a commitment.
 */
function yokeToJoin(s: SimState, actor: Actor): Actor | null {
  if (actor.role === 'tank') return null
  if (getAura(actor, 'yoke')) return null
  for (const other of livingParty(s)) {
    if (other.id === actor.id) continue
    if (getAura(other, 'yoke')?.bearer === actor.id) return other
  }
  return null
}

/** How close the thing chasing you has to be before it is worth running. */
const STALK_ROOM = 110

/**
 * Whether a spot is on the half a fault is taking, with room to spare.
 *
 * The mechanic itself has no forgiveness at all — a body is on one side of
 * the line or the other when it lands. What the AI reads is the same line
 * pushed a stride into the safe half, so that standing on it counts as
 * standing in it: a raider who answers by putting one foot across has not
 * answered anything, and the margin is what makes the answer a crossing
 * rather than a lean.
 */
function onFault(spot: Vec2, g: GroundEffect): boolean {
  const nudged = {
    x: spot.x + Math.cos(g.angle) * DANGER_MARGIN,
    y: spot.y + Math.sin(g.angle) * DANGER_MARGIN,
  }
  return condemned(nudged, g)
}

/**
 * Is this spot on floor that has been announced and has not gone yet?
 *
 * Only ever asked about the place a role wants to *be*, which is why it is
 * this narrow list rather than `isSpotSafe`. A pool lands where somebody is
 * standing and has gone off by the time anyone walks back; these three cover
 * ground the fight was already using, so an actor that finished its step out
 * early would otherwise turn round, walk home, and be caught by the thing it
 * had just dodged.
 *
 * Narrow on purpose, and it stays narrow. Run home through `isSpotSafe`
 * instead and an unpractised raid stops walking back into anything at all —
 * measured, that alone took the brand from seventeen points of teaching to
 * six, because most of what the brand teaches is not walking onto your own.
 */
function caving(s: SimState, spot: Vec2): boolean {
  return s.ground.some((g) => {
    if (g.detonated) return false
    if (g.kind === 'crush') return dist(spot, g.pos) <= g.radius + DANGER_MARGIN
    if (g.kind === 'fault') return onFault(spot, g)
    if (g.kind === 'shallows') return !onShallows(spot, g)
    return false
  })
}

/** Is this spot under the wedge, on the pulse coming or the one after it? */
function swept(s: SimState, spot: Vec2): boolean {
  return s.ground.some(
    (g) => g.kind === 'hand' && (underHand(spot, g) || underHand(spot, g, 1)),
  )
}

/** Whether anybody wearing another mark is this close to the given spot. */
function clashingWith(s: SimState, actor: Actor, spot: Vec2, room: number): boolean {
  return livingParty(s).some(
    (other) => other.id !== actor.id && schismClash(actor, other) && dist(spot, other.pos) <= room,
  )
}

/** The split the party is currently being asked to make, if it is being asked. */
function liveSchism(s: SimState): SimState['ground'][number] | null {
  return s.ground.find((g) => g.kind === 'schism' && !g.detonated) ?? null
}

/** Where this actor's group is supposed to be standing. */
function musterFor(s: SimState, actor: Actor): Vec2 | null {
  const split = liveSchism(s)
  if (!split) return null
  const mark = getAura(actor, 'schism')
  if (!mark) return null
  return schismMuster(split, mark.stacks - 1)
}

/**
 * Would going home put this one back among the other groups?
 *
 * The third narrow case of the same trap. Home is a bearing off the boss and
 * a split sends the groups to bearings of their own, so a body that stepped
 * just far enough to be clear had its danger go quiet, was told it was out of
 * position, and walked back into the middle of everybody.
 *
 * Narrow like the other two, and worth about as little on its own: it stops
 * the walk back, and it does nothing to make the walk out happen. What made
 * this mechanic work is two rules further down — the danger staying live
 * until the group exists, and a muster point being read as a place worth
 * going even while the group that has to leave it is still standing there.
 */
function stillSplit(s: SimState, actor: Actor, spot: Vec2): boolean {
  return s.ground.some(
    (g) =>
      g.kind === 'schism' &&
      !g.detonated &&
      clashingWith(s, actor, spot, g.radius + DANGER_MARGIN),
  )
}

/** Cheap re-check of an already chosen destination. */
function isSpotSafe(s: SimState, actor: Actor, spot: Vec2): boolean {
  for (const g of s.ground) {
    if (g.kind === 'breath') {
      if (!g.detonated && insideCone(spot, g)) return false
      continue
    }
    if (g.kind === 'shockwave') {
      if (dist(spot, g.pos) >= g.radius - g.band && !inShockwaveGap(spot, g)) return false
      continue
    }
    if (g.kind === 'crush') {
      if (!g.detonated && dist(spot, g.pos) <= g.radius + DANGER_MARGIN) return false
      continue
    }
    // Both the pulse that is coming and the one after it. A destination that
    // is merely safe from the pulse about to land is a destination the wedge
    // turns onto while the walk there is still happening.
    if (g.kind === 'hand') {
      if (underHand(spot, g) || underHand(spot, g, 1)) return false
      continue
    }
    if (g.kind === 'echo') {
      if (!g.detonated && dist(spot, g.pos) <= g.radius + DANGER_MARGIN) return false
      continue
    }
    if (g.kind === 'fault') {
      if (!g.detonated && onFault(spot, g)) return false
      continue
    }
    // Inverted, like the circle: three patches are the only floor there is.
    if (g.kind === 'shallows') {
      if (!g.detonated && !onShallows(spot, g)) return false
      continue
    }
    // Whether the spot is safe depends on who else is standing near it, so it
    // is re-read every tick rather than decided once: a destination that was
    // clear when it was picked stops being clear the moment somebody wearing
    // the other mark walks toward it.
    //
    // Except the place this one was sent. A muster point is read as safe even
    // while the group that has to leave it is still standing there, and that
    // is the difference between a raid that comes apart and a raid that
    // shuffles. Scored instant by instant, the far side of the arena is
    // *unsafe* at the moment a split lands — everybody is still in one crowd,
    // so every point two hundred units out has the other group inside its
    // circle — and an AI that believes that rejects the one destination that
    // solves the mechanic and re-picks a new spot every tick instead. Going
    // where you were told is a plan, and a plan is allowed to be wrong for the
    // second it takes everybody else to leave.
    if (g.kind === 'schism') {
      if (g.detonated) continue
      const muster = musterFor(s, actor)
      if (muster && dist(spot, muster) <= SCHISM_MUSTER_ROOM) continue
      if (clashingWith(s, actor, spot, g.radius + DANGER_MARGIN)) return false
      continue
    }
    // Inverted: this is the one piece of ground that is only safe from the
    // inside.
    if (g.kind === 'soak') {
      if (!g.detonated && dist(spot, g.pos) > g.radius - actor.radius) return false
      continue
    }
    if (dist(spot, g.pos) <= g.radius + DANGER_MARGIN) return false
  }

  const chaser = hunterOf(s, actor)
  if (chaser && dist(spot, chaser.pos) < STALK_ROOM * 0.8) return false

  // A brand is walked to the edge of what the fight is using, not into the
  // middle of it. Anywhere the party is standing is somewhere the ground will
  // be missed.
  if (getAura(actor, 'brand')) {
    for (const other of livingParty(s)) {
      if (other.id === actor.id) continue
      if (dist(spot, other.pos) < BRAND_ROOM) return false
    }
  }

  // A spot that cannot hand the weight on is not a spot to stand on, which is
  // the brand's rule pointed the other way: the brand wants floor nobody is
  // using and this wants a body nobody has used. Written as a safety check
  // rather than only as a score so the carrier keeps re-picking until it is
  // actually standing on somebody, instead of settling for a candidate that
  // scored well and was still two paces short.
  const weight = getAura(actor, 'burden')
  if (weight) {
    const taker = burdenTaker(s, actor)
    if (taker && dist(spot, taker.pos) > BURDEN_REACH) return false
  }
  const bringer = burdenBringer(s, actor)
  if (bringer && dist(spot, bringer.pos) > BURDEN_REACH) return false

  // And a spot out of reach of a live yoke is not one either, while there is
  // one to reach.
  const join = yokeToJoin(s, actor)
  if (join && dist(spot, join.pos) > YOKE_REACH) return false

  const carrying = getAura(actor, 'spread') !== undefined
  for (const other of livingParty(s)) {
    if (other.id === actor.id) continue
    const otherCarries = getAura(other, 'spread') !== undefined
    if (!carrying && !otherCarries) continue
    if (dist(spot, other.pos) < SPREAD_RADIUS + DANGER_MARGIN) return false
  }
  return true
}

/**
 * True only when the actor genuinely cannot do its job from where it stands.
 *
 * Anything looser than this produces fidgeting: a party that drifts back to a
 * nominal formation every time the floor clears looks busy, not competent.
 */
function outOfPosition(s: SimState, actor: Actor): boolean {
  const b = boss(s)
  const d = dist(actor.pos, b.pos)

  if (actor.role === 'tank' || actor.melee) return d > MELEE_RANGE + b.radius * 0.6

  if (d > CASTER_MAX_RANGE || d < CASTER_MIN_RANGE) return true

  // Its own near edge is wider than the distance a caster is happy at, so a
  // shooter has to be asked about its own rule rather than the shared one.
  //
  // Only about the boss. A thrall standing on a hunter is not worth running
  // from: it shoots past it at the boss instead, and running would cost more
  // uptime than the thrall does.
  if (tooClose(actor, b)) return true

  if (actor.role === 'healer') {
    // A healer also has to be able to reach whoever is hurt.
    const wounded = mostHurt(s)
    if (wounded && wounded.id !== actor.id && dist(actor.pos, wounded.pos) > HEAL_REACH) {
      return true
    }
  }
  return false
}

/**
 * The smallest correction that fixes the problem: keep the actor's current
 * bearing from the boss and only adjust distance. Returning to a shared home
 * tile would also stack the whole party on one spot for the next puddle.
 */
function idlePosition(s: SimState, actor: Actor): Vec2 {
  const b = boss(s)
  const d = dist(actor.pos, b.pos) || 1
  const want = actor.role === 'tank' || actor.melee ? MELEE_RANGE * 0.8 : CASTER_IDEAL_RANGE

  const bearingX = (actor.pos.x - b.pos.x) / d
  const bearingY = (actor.pos.y - b.pos.y) / d
  return { x: b.pos.x + bearingX * want, y: b.pos.y + bearingY * want }
}

/**
 * Samples positions around the actor and scores them. The clustering term is
 * what makes the result look human: real players regroup toward the pack
 * instead of scattering to mathematically ideal corners.
 */
function findSafeSpot(s: SimState, actor: Actor, rng: Rng): Vec2 {
  const centroid = partyCentroid(s, actor)
  const b = boss(s)
  const ai = actor.ai!

  const candidates: Vec2[] = [{ x: actor.pos.x, y: actor.pos.y }]

  // Rings around the actor cover ordinary sidestepping.
  const rings = [80, 160, 260]
  // Rotate the sample ring a little each time so movement is not perfectly grid-like.
  const offset = rng.range(0, Math.PI / 8)
  for (let i = 0; i < 16; i++) {
    const angle = offset + (i / 16) * Math.PI * 2
    for (const r of rings) {
      candidates.push({
        x: actor.pos.x + Math.cos(angle) * r,
        y: actor.pos.y + Math.sin(angle) * r,
      })
    }
  }

  // Some mechanics have their answer somewhere specific and far away, which
  // sampling around the actor will almost never land on. Offer those directly.
  for (const g of s.ground) {
    if (g.kind === 'shockwave') {
      // Along the gap, at the spread of ranges the raid already stands at.
      // Sampling around the actor almost never lands inside a wedge, so the
      // answer is offered rather than searched for.
      for (let i = 0; i < 8; i++) {
        const along = g.angle + (i / 8 - 0.5) * g.halfWidth * 1.2
        const reach = 90 + (i % 4) * 55 + offset * 8
        candidates.push({
          x: g.pos.x + Math.cos(along) * reach,
          y: g.pos.y + Math.sin(along) * reach,
        })
      }
    } else if (g.kind === 'soak' && !g.detonated) {
      // Sampling around the actor will not find a circle two hundred units
      // away, so it is offered directly — the same problem the ring's pocket
      // has, and the same answer.
      candidates.push({ x: g.pos.x, y: g.pos.y })
      for (let i = 0; i < 8; i++) {
        const angle = offset + (i / 8) * Math.PI * 2
        candidates.push({
          x: g.pos.x + Math.cos(angle) * g.radius * 0.55,
          y: g.pos.y + Math.sin(angle) * g.radius * 0.55,
        })
      }
    } else if (g.kind === 'hand') {
      // Behind the turn, at the range this one is already standing at. The
      // answer here is a bearing rather than a distance, and the rings
      // sampled around the body find it only sideways: out where the casters
      // stand the wedge covers two hundred and eighty units of arc and the
      // beat after it covers another hundred and seventy, so the samples
      // that clear both are the ones that have also left the fight.
      const reach = Math.max(70, dist(actor.pos, g.pos))
      const back = g.turn >= 0 ? -1 : 1
      for (let i = 1; i <= 4; i++) {
        const bearing = g.angle + back * (g.halfWidth + 0.3 * i)
        for (const out of [reach, reach * 0.7]) {
          candidates.push({
            x: g.pos.x + Math.cos(bearing) * out,
            y: g.pos.y + Math.sin(bearing) * out,
          })
        }
      }
    } else if (g.kind === 'fault' && !g.detonated) {
      // Straight across, at a few depths. Sampling around the actor does find
      // the far side of a line eventually, but only on the rings that happen
      // to point the right way — and a mechanic answered by one bearing out of
      // sixteen is a mechanic answered late.
      const across = (actor.pos.x - g.pos.x) * Math.cos(g.angle) +
        (actor.pos.y - g.pos.y) * Math.sin(g.angle)
      for (const depth of [40, 90, 170]) {
        const step = across + depth
        candidates.push({
          x: actor.pos.x - Math.cos(g.angle) * step,
          y: actor.pos.y - Math.sin(g.angle) * step,
        })
      }
    } else if (g.kind === 'shallows' && !g.detonated) {
      // Every patch, and a ring inside each of them. The same problem the
      // gathering has — the answer is a specific place rather than a direction
      // — and the same answer: offer it rather than search for it.
      for (const spot of g.spots ?? []) {
        candidates.push({ x: spot.x, y: spot.y })
        for (let i = 0; i < 6; i++) {
          const angle = offset + (i / 6) * Math.PI * 2
          candidates.push({
            x: spot.x + Math.cos(angle) * g.radius * 0.5,
            y: spot.y + Math.sin(angle) * g.radius * 0.5,
          })
        }
      }
    } else if (g.kind === 'schism' && !g.detonated) {
      // The muster point for this actor's own group, and a ring of places
      // around it. Offered rather than searched for, the same way the circle
      // and the ring's pocket are: the answer to a split is an agreed place,
      // and a raid that each works out its own spacing from scratch produces
      // two groups that never quite finish separating.
      const muster = musterFor(s, actor)
      if (muster) {
        candidates.push({ x: muster.x, y: muster.y })
        for (let i = 0; i < 8; i++) {
          const angle = offset + (i / 8) * Math.PI * 2
          candidates.push({
            x: muster.x + Math.cos(angle) * 55,
            y: muster.y + Math.sin(angle) * 55,
          })
        }
      }
    } else if (g.kind === 'breath' && !g.detonated) {
      // Behind and beside the cone. The short ring matters for melee, which
      // has to end up behind the boss rather than away from it.
      for (const side of [Math.PI, Math.PI * 0.6, -Math.PI * 0.6]) {
        for (const r of [60, 150, 250]) {
          candidates.push({
            x: g.pos.x + Math.cos(g.angle + side) * r,
            y: g.pos.y + Math.sin(g.angle + side) * r,
          })
        }
      }
    }
  }

  // The two answers that are another person rather than a piece of floor.
  // Sampling rings around the actor finds ground; it does not reliably find a
  // body two hundred units away, which is the same problem the ring's pocket
  // and the gathering's circle have and it gets the same fix — offer the
  // answer instead of hoping to stumble onto it.
  const meeting = getAura(actor, 'burden') ? burdenTaker(s, actor) : burdenBringer(s, actor)
  if (meeting) {
    candidates.push({ x: meeting.pos.x, y: meeting.pos.y })
    for (let i = 0; i < 8; i++) {
      const angle = offset + (i / 8) * Math.PI * 2
      candidates.push({
        x: meeting.pos.x + Math.cos(angle) * BURDEN_REACH * 0.6,
        y: meeting.pos.y + Math.sin(angle) * BURDEN_REACH * 0.6,
      })
    }
  }
  const joining = yokeToJoin(s, actor)
  if (joining) {
    candidates.push({ x: joining.pos.x, y: joining.pos.y })
    for (let i = 0; i < 8; i++) {
      const angle = offset + (i / 8) * Math.PI * 2
      candidates.push({
        x: joining.pos.x + Math.cos(angle) * YOKE_REACH * 0.55,
        y: joining.pos.y + Math.sin(angle) * YOKE_REACH * 0.55,
      })
    }
  }
  const owing = getAura(actor, 'yoke') !== undefined

  const chasing = hunterOf(s, actor)

  let best: Vec2 = { x: actor.pos.x, y: actor.pos.y }
  let bestScore = -Infinity

  for (const candidate of candidates) {
    clampToArena(candidate, actor.radius)

    let score = 0

    // 1. Ground danger dominates everything else.
    let ringActive = false
    let soakActive = false
    let crushActive = false
    let schismActive = false
    let strandedActive = false
    for (const g of s.ground) {
      if (g.kind === 'breath') {
        if (!g.detonated && insideCone(candidate, g)) score -= 1400
        continue
      }
      if (g.kind === 'soak') {
        if (g.detonated) continue
        soakActive = true
        const d = dist(candidate, g.pos)
        // Worth more than the cone is worth avoiding: a party that trickles
        // in one at a time divides the hit by one and takes it five times.
        if (d > g.radius - actor.radius) score -= 1600
        else score += Math.min(240, (g.radius - d) * 2)
        continue
      }
      if (g.kind === 'fault') {
        if (g.detonated) continue
        // The crush's weight, because it is the crush's kind of hit: the whole
        // of it in one frame rather than a health bar over five seconds.
        // Depth into the safe half is worth a little, which keeps a crowd from
        // lining up along the line it just crossed and stepping back over it.
        if (onFault(candidate, g)) score -= 1800
        else {
          const across = (candidate.x - g.pos.x) * Math.cos(g.angle) +
            (candidate.y - g.pos.y) * Math.sin(g.angle)
          score += Math.min(160, -across * 1.2)
        }
        continue
      }
      if (g.kind === 'shallows') {
        if (g.detonated) continue
        strandedActive = true
        let nearest = Infinity
        for (const spot of g.spots ?? []) nearest = Math.min(nearest, dist(candidate, spot))
        if (nearest > g.radius - actor.radius) score -= 1800
        else score += Math.min(220, (g.radius - nearest) * 2)
        continue
      }
      if (g.kind === 'schism') {
        if (g.detonated) continue
        schismActive = true
        continue
      }
      if (g.kind === 'crush') {
        if (g.detonated) continue
        crushActive = true
        // Above what fire is worth avoiding, because it is worth more: a pool
        // is a health bar over five and a half seconds and this is most of one
        // in a single frame.
        if (dist(candidate, g.pos) <= g.radius + DANGER_MARGIN) score -= 1800
        continue
      }
      if (g.kind === 'hand') {
        // Three deep, and falling away: where it is about to be is worth
        // most of what where it is is worth, and the beat after that is
        // worth a nudge. A raid that only priced the pulse in front of it
        // would answer this mechanic by stepping into it.
        if (underHand(candidate, g)) score -= 1800
        else if (underHand(candidate, g, 1)) score -= 900
        else if (underHand(candidate, g, 2)) score -= 300
        continue
      }
      if (g.kind === 'echo') {
        if (g.detonated) continue
        if (dist(candidate, g.pos) <= g.radius + DANGER_MARGIN) score -= 1200
        continue
      }
      if (g.kind === 'shockwave') {
        ringActive = true
        // The gap is safe and the rest of the floor is not, so the score is
        // read off the bearing rather than off the distance. Deeper into the
        // wedge is better, which keeps a crowd from lining its very edge.
        let delta = Math.atan2(candidate.y - g.pos.y, candidate.x - g.pos.x) - g.angle
        while (delta > Math.PI) delta -= Math.PI * 2
        while (delta < -Math.PI) delta += Math.PI * 2
        const outside = Math.abs(delta) - g.halfWidth
        const ahead = dist(candidate, g.pos) >= g.radius - g.band
        if (ahead && outside > 0) score -= 1400
        else if (ahead) score += Math.min(200, -outside * 300)
        continue
      }
      const d = dist(candidate, g.pos)
      if (d <= g.radius + DANGER_MARGIN) score -= 1000
      else score -= Math.max(0, 200 - d) * 0.5
    }

    // 2. Whatever is chasing this one. Distance is the whole answer, but
    // only up to a point — running to the far wall to escape something that
    // walks costs more uptime than the thing does.
    if (chasing) {
      const d = dist(candidate, chasing.pos)
      // Below what fire costs, deliberately. The first version weighted this
      // above the floor, so the one being chased would stand in a puddle to
      // put eight paces between itself and something walking — and the
      // mechanic's real damage turned out to be the deaths that caused, not
      // anything the stalker landed itself.
      if (d < STALK_ROOM * 0.8) score -= 700
      else score += Math.min(180, (d - STALK_ROOM * 0.8) * 1.2)
    }

    // 3a. The other groups, and this one's own place to be.
    //
    // Two terms rather than one, because a split has two halves to it. The
    // repulsion is what the mechanic actually checks, and on its own it
    // produces a raid that shuffles until it happens to be sorted; the pull
    // toward the muster point is what makes that shuffling into a plan, and
    // it is weighted above the cost of walking so a group commits to going
    // rather than settling for the first spot that is barely clear.
    if (schismActive) {
      const muster = musterFor(s, actor)
      const gathered = muster !== null && dist(candidate, muster) <= SCHISM_MUSTER_ROOM
      if (muster) score -= dist(candidate, muster) * 1.1
      // The other groups are worth avoiding everywhere except at the place
      // this one was sent, for the reason `isSpotSafe` says above: at the
      // instant a split lands the crowd is still one crowd, so every muster
      // point in the arena has somebody else's group inside its circle, and a
      // term that reads that literally argues against all of them at once.
      if (!gathered) {
        for (const other of livingParty(s)) {
          if (other.id === actor.id) continue
          if (!schismClash(actor, other)) continue
          const d = dist(candidate, other.pos)
          if (d < SCHISM_ROOM + DANGER_MARGIN) score -= 900
          else score += Math.min(d, 280) * 0.3
        }
      }
    }

    // 3. Spread separation.
    const carryingSpread = getAura(actor, 'spread') !== undefined
    for (const other of livingParty(s)) {
      if (other.id === actor.id) continue
      const d = dist(candidate, other.pos)
      const otherCarries = getAura(other, 'spread') !== undefined
      if (carryingSpread || otherCarries) {
        if (d < SPREAD_RADIUS + DANGER_MARGIN) score -= 900
        else score += Math.min(d, 260) * 0.4
      }
    }

    // 3b. The weight, and the body that can take it. Scored below what fire
    // costs on purpose, for the reason the stalker's term is: a carrier that
    // valued the handoff above the floor would walk a chain straight through
    // a puddle, and the mechanic's damage would stop being its own.
    if (meeting) {
      const d = dist(candidate, meeting.pos)
      if (d <= BURDEN_REACH) score += 620
      else score -= Math.min(700, (d - BURDEN_REACH) * 1.6)
    }

    // 3c. Somebody else's yoke, which is worth walking to for the same reason
    // the gathering is: the alternative is that they pay all of it, and this
    // party cannot afford anybody paying all of it.
    if (joining) {
      const d = dist(candidate, joining.pos)
      if (d <= YOKE_REACH) score += 820
      else score -= Math.min(900, (d - YOKE_REACH) * 1.8)
    }

    // 3d. Owing one. It cannot fetch its own bearer, so the only thing it can
    // do is be somewhere findable — which is toward the rest of them rather
    // than out at the edge where the last mechanic sent it. Weak on purpose:
    // it is a preference, not an answer, and a carrier that chased the raid
    // would be answering with the one move the mechanic does not ask for.
    if (owing) {
      let close = 0
      for (const other of livingParty(s)) {
        if (other.id === actor.id) continue
        if (dist(candidate, other.pos) <= YOKE_REACH) close++
      }
      score += Math.min(4, close) * 150
    }

    // 4. Role positioning.
    const bossDist = dist(candidate, b.pos)
    if (soakActive || strandedActive) {
      // Standing in it beats standing in range of anything. Suspended the
      // same way the ring suspends the casters' spacing, and for melee too:
      // the boss is not going anywhere in five seconds.
      //
      // The same for the three patches, and it is not the same reason. The
      // circle is one place and being in range of the fight from it is luck;
      // the patches are three, and a term that pays for standing near the boss
      // would pick the nearest one for everybody — which is a mechanic
      // answered by walking wherever the fight already was.
    } else if (actor.role === 'tank' || actor.melee) {
      // A tank does not stand in fire to keep melee range; it drags the boss
      // out instead. The boss chases threat, so walking away relocates it.
      //
      // Suspended while the floor around the boss is caving in, the way the
      // gathering suspends it. This is the one mechanic whose answer is
      // *away from the boss specifically*, so a term that pays for being
      // close is a term arguing directly against it — and the melee's whole
      // reason to be there is the thing the mechanic is asking them to give
      // up for a second.
      if (crushActive) score -= Math.max(0, 260 - bossDist) * 0.2
      else if (bossDist > 200) score -= (bossDist - 200) * 3
      else score -= bossDist * 0.35
    } else if (!ringActive) {
      // Casters want to stay in range but out of the boss's lap. Suspended
      // while a ring is out, because hugging the boss is then the answer.
      if (bossDist < 90) score -= (90 - bossDist) * 4
      if (bossDist > 280) score -= (bossDist - 280) * 4
    }

    // 5. Humanity: drift toward the group.
    //
    // Whichever group that is. While the raid is cut into groups, the pull
    // toward the middle of everybody is a pull back into the other one, and
    // an instinct that is right for every other mechanic here is exactly
    // wrong for this one.
    score -= dist(candidate, schismActive ? sideCentroid(s, actor) : centroid) * ai.clustering

    // 6. Do not run further than necessary.
    score -= dist(candidate, actor.pos) * 0.35

    // 7. Hugging the wall is bad; puddles there trap you.
    score -= Math.max(0, Math.hypot(candidate.x, candidate.y) - (ARENA_RADIUS - 60)) * 2

    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }

  return best
}

/**
 * The middle of the actor's own group, for as long as it has one.
 *
 * Falls back to the whole party, which is what it is when nobody is marked:
 * the split is the only thing that ever makes "the group" mean less than
 * everybody.
 */
function sideCentroid(s: SimState, actor: Actor): Vec2 {
  let x = 0
  let y = 0
  let n = 0
  for (const a of livingParty(s)) {
    if (a.id === actor.id) continue
    if (schismClash(actor, a)) continue
    x += a.pos.x
    y += a.pos.y
    n++
  }
  return n === 0 ? { x: actor.pos.x, y: actor.pos.y } : { x: x / n, y: y / n }
}

function partyCentroid(s: SimState, exclude: Actor): Vec2 {
  let x = 0
  let y = 0
  let n = 0
  for (const a of livingParty(s)) {
    if (a.id === exclude.id) continue
    x += a.pos.x
    y += a.pos.y
    n++
  }
  return n === 0 ? { x: 0, y: 0 } : { x: x / n, y: y / n }
}

function moveToward(s: SimState, actor: Actor, target: Vec2 | null): void {
  if (!target) return
  const d = dist(actor.pos, target)
  if (d < 6) {
    actor.ai!.moveTarget = null
    return
  }

  const stepLen = actor.moveSpeed * DT * hasteOf(actor) * carryDrag(actor)
  actor.pos.x += ((target.x - actor.pos.x) / d) * stepLen
  actor.pos.y += ((target.y - actor.pos.y) / d) * stepLen
  clampToArena(actor.pos, actor.radius)

  if (actor.castId) interruptCast(s, actor, 'moved')
}

// --- ability priorities -----------------------------------------------------

function useAbilities(s: SimState, actor: Actor, rng: Rng): void {
  // A count that is running is worth dropping a cast for, and only this one
  // is: every other heal in the fight can be finished and then re-aimed,
  // because what it was answering is damage that has already landed.
  const rescue = rescueTarget(s, actor)
  // Only a cast with real time left on it: one that is about to land is
  // faster to finish than to start again.
  if (rescue && actor.castId && actor.castTargetId !== rescue.id && actor.castRemaining > 0.4) {
    interruptCast(s, actor, 'switching')
  }
  if (actor.castId) return
  // Off-GCD defensives are still worth checking while the global is running.
  if (actor.gcd > 0 && !canUseOffGcd(s, actor)) return
  // While relocating, only instants are available — exactly the constraint a
  // human healer plays under. Without this the AI starts a cast every tick and
  // movement cancels it every tick, so it heals for nothing.
  const moving = actor.ai!.moveTarget !== null
  if (actor.role === 'tank') tankRotation(s, actor, rng, moving)
  else if (actor.role === 'healer') healerRotation(s, actor, rng, moving)
  else dpsRotation(s, actor, rng, moving)
}

/** The spec an actor is playing. */
function specFor(actor: Actor) {
  return specOf({ classId: actor.classId, spec: actor.spec })
}

/** Is there anything worth pressing that ignores the global cooldown? */
function canUseOffGcd(s: SimState, actor: Actor): boolean {
  const kit = specFor(actor).abilities
  if (!kit.defensive) return false
  const ability = ABILITIES[kit.defensive]
  if (!ability?.offGcd) return false
  if ((actor.cooldowns[kit.defensive] ?? 0) > 0) return false
  const b = boss(s)
  return b.castId === 'boss_slam' && b.castRemaining < 1.2
}

/** beginCast, but refuses cast-time abilities while the actor is on the move. */
function tryCast(
  s: SimState,
  actor: Actor,
  id: string,
  targetId: number,
  rng: Rng,
  moving: boolean,
): boolean {
  const ability = ABILITIES[id]
  if (!ability) return false
  if (moving && ability.castTime > 0) return false
  return beginCast(s, actor, id, targetId, rng)
}

/**
 * Inside the near edge of everything this actor could point at it.
 *
 * Read off the kit rather than the class: whatever the widest near edge among
 * its abilities is, that is the distance at which it is useless.
 */
function tooClose(actor: Actor, target: Actor): boolean {
  const kit = specFor(actor).abilities
  const ids = [kit.filler, kit.overTime, kit.finisher].filter((id): id is string => id !== null)
  const near = Math.max(0, ...ids.map((id) => ABILITIES[id]?.minRange ?? 0))
  if (near === 0) return false
  return dist(actor.pos, target.pos) < near + target.radius
}

/**
 * Closing a gap the class can close itself.
 *
 * Melee spend the opening seconds walking, and a warrior has a button for
 * exactly that. Tried before the rotation, since nothing else it presses will
 * land from out there anyway.
 */
function tryCharge(s: SimState, actor: Actor, target: Actor, rng: Rng, moving: boolean): boolean {
  const kit = specFor(actor).abilities
  if (!kit.mobility) return false
  return tryCast(s, actor, kit.mobility, target.id, rng, moving)
}

/** Stacks of armour break that make handing the boss over the right call. */
const SWAP_AT = 3

function tankRotation(s: SimState, actor: Actor, rng: Rng, moving: boolean): void {
  const b = boss(s)
  const ai = actor.ai!
  const kit = specFor(actor).abilities

  if (mayStrike(s, actor, b) && tryCharge(s, actor, b, rng, moving)) return

  // The swap.
  //
  // The rule below deliberately refuses to taunt off another tank, because a
  // pair that trades on cooldown drags the boss through the melee all fight.
  // A stack of armour breaks is the one reason to do it anyway: the holder is
  // taking nearly double by the top of it, and the answer is the other tank,
  // not the healer. Only downward — taunting a fresher stack onto a heavier
  // one is the trade backwards.
  const mine = getAura(actor, 'sunder')?.stacks ?? 0
  if (kit.taunt && mine < SWAP_AT) {
    const holder = topThreatTarget(s)
    const theirs = holder ? (getAura(holder, 'sunder')?.stacks ?? 0) : 0
    if (holder && holder.id !== actor.id && holder.role === 'tank' && theirs >= SWAP_AT && theirs > mine) {
      if (!rng.chance(ai.mistakeChance) && tryCast(s, actor, kit.taunt, b.id, rng, moving)) {
        say(s, actor, `Swapping — you are at ${theirs}`)
        return
      }
    }
  }

  // Defensive on the incoming slam. The fumble roll is what makes the tank
  // occasionally eat it, which is exactly what a real tank does.
  if (kit.defensive && b.castId === 'boss_slam' && b.castRemaining < 1.2) {
    const ready = (actor.cooldowns[kit.defensive] ?? 0) <= 0
    if (ready && !rng.chance(ai.mistakeChance)) {
      if (tryCast(s, actor, kit.defensive, actor.id, rng, moving)) {
        say(s, actor, 'Wall up')
        return
      }
    }
  }

  // Take the boss back off whoever it wandered to.
  //
  // Only when the holder is not a tank: with two tanks in a raid, a rule that
  // says "taunt whenever you are not the target" makes them trade the boss
  // back and forth on cooldown for the whole fight, which drags it through
  // the melee and looks like a bug.
  if (kit.taunt) {
    const holder = topThreatTarget(s)
    if (holder && holder.id !== actor.id && holder.role !== 'tank') {
      if (!rng.chance(ai.mistakeChance) && tryCast(s, actor, kit.taunt, b.id, rng, moving)) {
        say(s, actor, `Taunting off ${holder.name}`)
        return
      }
    }
  }

  // And a tank is a body that hits things too. Only the damage is held: the
  // taunt and the wall above are answers to other mechanics, and dropping the
  // boss on the raid to answer this one is answering it with a worse mistake.
  if (!mayStrike(s, actor, b)) return

  if (kit.threat && tryCast(s, actor, kit.threat, b.id, rng, moving)) return
  tryCast(s, actor, kit.filler, b.id, rng, moving)
}

/**
 * Who this healer wants under its heal, which is not always who is worst off.
 *
 * Two of the four healer traits are conditional in both directions — the
 * paladin is paid 1.45x on a tank and charged 0.85x on anybody else, the
 * druid 1.5x on somebody already mending and 0.9x on somebody who is not —
 * and a rotation that always answers whoever is lowest sets up neither. It
 * showed: 37% of the paladin's healing reached a tank, the lowest share of
 * the four despite being the one spec paid for it, and 16% of the druid's
 * landed on a primed target. Both traits netted out to roughly 1.0x, which is
 * to say they were not there, and the two healers whose traits have no
 * penalty branch won a third more often.
 *
 * So the choice is made here rather than left to a threshold: a spec that is
 * paid to heal one kind of person has to be willing to heal them.
 */
/**
 * How hurt a tank has to be before its healer stops watching the raid.
 *
 * Below the personalities' own top-off thresholds on purpose. Reading those
 * instead meant a timid paladin claimed the tank at 95% health — every press,
 * all fight — and the raid died behind a tank that was never in danger.
 */
const ANCHOR_CEILING = 0.75

function healTarget(s: SimState, actor: Actor, wounded: Actor, ceiling: number): Actor {
  const spec = specFor(actor)
  const kit = spec.abilities

  // A healer with nobody beside it covers everybody, whatever it would rather
  // be paid for. Both conditional traits ask the healer to look away from
  // somebody, and in a five-man there is nobody else to look instead: the two
  // specs that specialise lost twenty points of win rate there while the two
  // with unconditional traits did not.
  if (livingParty(s).filter((a) => a.role === 'healer').length < 2) return wounded

  if (spec.trait === 'anchor') {
    // The tank, unless the tank is fine and somebody else is not.
    const tanks = livingParty(s).filter((a) => a.role === 'tank')
    let worst: Actor | null = null
    for (const t of tanks) if (!worst || t.hp / t.maxHp < worst.hp / worst.maxHp) worst = t
    if (worst && worst.hp / worst.maxHp < ANCHOR_CEILING) return worst
    return wounded
  }

  if (spec.trait === 'bloom' && kit.overTime) {
    // Somebody already mending, if one of them needs it. The over-time is the
    // setup, so healing through it is the whole rotation rather than a bonus
    // that happens when the two coincide.
    let best: Actor | null = null
    for (const a of livingParty(s)) {
      if (!getAura(a, kit.overTime as AuraId)) continue
      if (a.hp / a.maxHp >= ceiling) continue
      if (!best || a.hp / a.maxHp < best.hp / best.maxHp) best = a
    }
    if (best) return best
  }

  return wounded
}

function healerRotation(s: SimState, actor: Actor, rng: Rng, moving: boolean): void {
  const ai = actor.ai!
  const kit = specFor(actor).abilities

  // Above everything, including the emergency below it. The emergency is
  // about who is lowest and this is about who is out of time, and the marked
  // are hardly ever the lowest — that is the whole difficulty of the
  // mechanic. Fastest first rather than biggest: what the line needs is a
  // heal that has landed, and a bigger one that lands afterwards has not.
  const rescue = rescueTarget(s, actor)
  if (rescue) {
    if (kit.finisher && (actor.cooldowns[kit.finisher] ?? 0) <= 0) {
      if (tryCast(s, actor, kit.finisher, rescue.id, rng, moving)) {
        say(s, actor, `${rescue.name} — getting you up`)
        return
      }
    }
    if (tryCast(s, actor, kit.filler, rescue.id, rng, moving)) return
  }

  const wounded = mostHurt(s)
  if (!wounded) return

  const ratio = wounded.hp / wounded.maxHp
  const powerLeft = actor.maxPower > 0 ? actor.power / actor.maxPower : 1

  // Timid healers panic earlier and burn mana; greedy ones let people ride low.
  const emergency = ai.personality === 'timid' ? 0.55 : ai.personality === 'greedy' ? 0.35 : 0.45
  const topOff = ai.personality === 'timid' ? 0.95 : 0.82

  if (kit.finisher && ratio < emergency && (actor.cooldowns[kit.finisher] ?? 0) <= 0) {
    // An emergency is answered on whoever is in it, whatever the spec would
    // rather be doing. A trait is worth less than a body.
    if (tryCast(s, actor, kit.finisher, wounded.id, rng, moving)) {
      say(s, actor, `${wounded.name} is low!`)
      return
    }
  }

  if (kit.overTime) {
    // A bloom druid seeds whoever it is about to heal; everyone else keeps it
    // on the tank, where an over-time is worth the most for the least attention.
    const seed = specFor(actor).trait === 'bloom' ? wounded : livingParty(s).find((a) => a.role === 'tank') ?? wounded
    if (!getAura(seed, kit.overTime as AuraId) && seed.hp / seed.maxHp < 0.95 && powerLeft > 0.2) {
      if (tryCast(s, actor, kit.overTime, seed.id, rng, moving)) return
    }
  }

  const on = healTarget(s, actor, wounded, topOff)
  if (on.hp / on.maxHp < topOff) {
    if (powerLeft < 0.15 && on.hp / on.maxHp > 0.6) {
      say(s, actor, 'Low mana')
      return
    }
    tryCast(s, actor, kit.filler, on.id, rng, moving)
    return
  }

  // Nobody needs healing: help kill it, but keep enough mana in reserve to
  // answer the next spike.
  if (kit.attack && powerLeft > 0.55 && actor.ai?.striking !== 'hush') {
    const target = strikeTarget(s, actor, adds(s))
    tryCast(s, actor, kit.attack, target.id, rng, moving)
  }
}

function dpsRotation(s: SimState, actor: Actor, rng: Rng, moving: boolean): void {
  const b = boss(s)
  if (!b.alive) return
  const kit = specFor(actor).abilities

  // Nothing at all goes out while the surface is closed. A dealer has no
  // second job to fall back on, which is the cost of the mechanic.
  if (actor.ai?.striking === 'hush') return

  // Adds first: they beeline for whoever is closest and shred a healer. The
  // two exceptions to that are decisions, and they are made in `readTheField`.
  let target = strikeTarget(s, actor, adds(s))

  // A bow has a near edge, and a thrall's whole plan is to stand on you. The
  // one it cannot shoot is not a target, so it shoots past it at the boss
  // rather than standing there doing nothing at all.
  if (tooClose(actor, target)) target = tooClose(actor, b) ? target : b

  if (tryCharge(s, actor, target, rng, moving)) return

  // The priority comes from the spec's trait, and it is the same one the
  // player's autocast uses: an AI that does not know a rogue banks points
  // plays a rogue as a warrior with different words on the buttons.
  const ai = actor.ai!
  const dangerNear = s.ground.some(
    (g) =>
      (g.kind === 'puddle' || g.kind === 'brand' || g.kind === 'crush') &&
      !g.detonated &&
      dist(actor.pos, g.pos) < g.radius + 130,
  )

  for (const id of damageOrder(actor, target)) {
    // Keep the dot up, but only refresh near the end so several dealers do not
    // all spend a global on the same debuff.
    if (id === kit.overTime) {
      const dot = getAura(target, kit.overTime as AuraId)
      if (dot && dot.remaining >= 3) continue
    }

    // A long cast roots you. Steady dealers refuse it with a telegraph nearby;
    // greedy ones gamble roughly half the time, which is where their deaths
    // come from — and why they read as a specific kind of player.
    // Only a long cast is a gamble worth refusing. A mage's filler is a cast
    // now, and refusing every cast near a telegraph left it pressing nothing
    // at all for the parts of a fight that have anything on the floor.
    const ability = ABILITIES[id]
    if (ability && ability.castTime > 1.5 && dangerNear) {
      if (!(ai.personality === 'greedy' && rng.chance(0.5))) continue
    }

    if (tryCast(s, actor, id, target.id, rng, moving)) return
  }
}

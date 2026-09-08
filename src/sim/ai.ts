import { ABILITIES } from './abilities'
import {
  COLDFLAME_TELEGRAPH,
  DT,
  MELEE_RANGE,
  PUDDLE_TELEGRAPH,
  NOTICE_GRANT,
  BLOAT_SWAP_AT,
  REEK_REACH,
  SHADE_REACH,
  SLIGHT_MAX,
  STORM_REACH,
  GORGE_RADIUS,
  SPILL_RADIUS,
  FESTER_LINE,
  INFECTION_FLUSH,
  SPRAY_CAST,
  MERGE_REACH,
  HOUND_REACH,
  CAUSTIC_TELEGRAPH,
  DECANT_COUNT,
} from './constants'
import {
  turnToward,
  MARK_REACH,
  insideCone,
} from './boss'
import { specOf } from './classes'
import { damageOrder } from './autocast'
import { clearTerrain, inTerrain } from './battleground'
import {
  adds,
  beginCast,
  boss,
  dist,
  getAura,
  hasteOf,
  interruptCast,
  livingParty,
  mostHurt,
  say,
  holdOrFall,
  topThreatTarget,
} from './combat'
import { EDGE_LAP, onEdge, pushInside, roomHasOutside, wallGap } from './room'
import type { Rng } from './rng'
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
/** How much of the boss's lap a body at range keeps out of when it dodges. */
const CASTER_LAP = 90
const CASTER_MAX_RANGE = 320
const CASTER_IDEAL_RANGE = 225
const HEAL_REACH = 360

/**
 * How close a healer walks to somebody it cannot reach.
 *
 * Inside `HEAL_REACH` rather than at it, and the gap between the two is the
 * whole design. `HEAL_REACH` is when a healer is asked to walk; this is where
 * it walks to. Collapsing them into one number is the obvious tidy-up and it
 * is wrong in both directions: at the loose number the healer settles exactly
 * on the line it was failing, and steps back off it the moment either body
 * moves; at the tight one it is out of position for anybody more than this
 * far away, which is most of the raid most of the time.
 *
 * Measured, because it did not read as a tuning question at all. Asking to
 * walk at this distance rather than at `HEAL_REACH` gives back a third of
 * what the whole change bought — 16.3% of a raid dying becomes 17.4% — for a
 * reason that has nothing to do with range: a walking healer may only cast
 * instants, so a rule that puts one on its feet more often heals less with
 * every body it can now reach.
 */
const HEAL_STAND = HEAL_REACH * 0.8

/**
 * How far gone somebody has to be before a healer leaves its post to reach
 * them.
 *
 * Two questions live in this file and they are easy to run together. Keeping
 * a body in range while dodging is free — it aims a step that was being taken
 * anyway — and that one is asked at the rotation's own emergency line, which
 * is where a healer starts caring. Walking there is not free: a healer on its
 * feet may cast instants only, so every walk is a few seconds of the raid's
 * healing turned down, and on a boss that leans on steady damage that is paid
 * by everybody rather than by the one being fetched.
 *
 * So the walk is priced separately, and low. At the emergency line the
 * Tidebreaker's twenty-five-man normal won 57% of its ninth pulls; here it
 * wins 65%, and the number this whole change exists to move did not budge —
 * a body under a third is a body that dies out there, and one at forty
 * percent is a body somebody will reach in time anyway.
 *
 * A judgement is exempt: that one has a clock rather than a health bar, and
 * `watchTheLine` has already decided it is this healer's to answer.
 */
const WALK_LINE = 0.3

export function updatePartyAi(s: SimState, actor: Actor, rng: Rng): void {
  const ai = actor.ai
  if (!ai || !actor.alive) return

  // A body inside the boss does nothing at all. It is not standing anywhere,
  // it cannot be reached and it cannot reach anything -- the four seconds are
  // the raid's problem rather than its own, which is the mechanic.
  if (getAura(actor, 'swallowed')) return

  ai.chatCooldown = Math.max(0, ai.chatCooldown - DT)

  // The one call that is not about where to stand, so it is made before the
  // one that is and kept in its own pair of fields.
  watchTheLine(s, actor, rng)

  // And the one that is not about where to stand either, for the same reason
  // and kept in its own third pair of fields.
  readTheField(s, actor, rng)

  // And the fourth, for the demands that resolve on one tick.

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
    // Plus the time the telegraphs were lengthened by, which is owed back.
    //
    // `NOTICE_GRANT` widened every warning in the game so that a person could
    // read it. This roster does not need it: it recognises a shape the instant
    // it appears and starts walking, so a longer count did not make it safer —
    // it made it leave earlier and stand outside for the difference. Measured,
    // that cost the warrior fifteen percent of its damage and blew the spread
    // between damage specs from 1.32 to 1.54, because standing off the boss is
    // free for a caster and is the whole job for melee.
    //
    // Handing the roster the same slowness restores the fight to exactly what
    // every sweep in this file measured — the party reacts the same number of
    // seconds before a hit lands as it always did — and leaves the widened
    // count doing the one thing it was added for, which is being long enough
    // for a person to see.
    ai.reactionTimer = ai.reactionDelay * rng.range(0.7, 1.4) + NOTICE_GRANT
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
    } else if (danger.startsWith('toll')) {
      say(s, actor, 'I have got the plate')
    } else if (danger.startsWith('grasp')) {
      say(s, actor, 'Off that ground, it is reaching')
    } else if (danger.startsWith('refuge')) {
      say(s, actor, 'Taking my stone')
    } else if (danger === 'yoke:self') {
      say(s, actor, 'On me — I cannot hold this alone')
    } else if (danger.startsWith('yoke:')) {
      say(s, actor, 'Going to help carry')
    } else if (danger.startsWith('gather')) {
      say(s, actor, 'On them, going')
    } else if (danger === 'hound:self') {
      say(s, actor, 'It is on me — moving')
    } else if (danger.startsWith('caustic')) {
      say(s, actor, 'Off the glass')
    } else if (danger.startsWith('decant')) {
      say(s, actor, 'Clearing the flask early')
    } else if (danger.startsWith('spray')) {
      say(s, actor, 'Behind the arm')
    } else if (danger === 'infection:self') {
      say(s, actor, 'Carrying — taking it wide')
    } else if (danger === 'spill:self') {
      say(s, actor, 'It is on me — clear off')
    } else if (danger.startsWith('spill:')) {
      say(s, actor, 'Away from them')
    } else if (danger.startsWith('mark:')) {
      say(s, actor, 'Not standing on the marked one')
    } else if (danger.startsWith('gorge:')) {
      say(s, actor, 'Off the boss, it is about to spit')
    } else if (ai.personality === 'timid') {
      say(s, actor, 'Moving!')
    }
  } else if (ai.moveTarget && isSpotSafe(s, actor, actor.pos) && !outOfPosition(s, actor)) {
    // The danger passed and here is fine. Stop; do not walk back to some
    // nominal home. Chasing a home position that is itself defined relative
    // to a moving boss is what made the party pace back and forth.
    ai.moveTarget = null
  } else if (!ai.moveTarget && actor.castId === null && outOfPosition(s, actor)) {
    // Tidying waits for the cast; running does not.
    //
    // A walk cancels whatever was being cast, and the two reasons a body walks
    // are not worth the same. Getting out of the way is worth a cast and then
    // some — that is the trade the fights are made of, and the branch above
    // makes it. Fixing a position is worth nothing at all, and it was being
    // paid for at the same price: a fifth of every cast this raid threw away
    // went with nothing on the floor to run from, a caster a stride out of its
    // band cancelling two seconds of work to step back into it. The band will
    // still be there in two seconds.
    //
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
    ai.moveTarget = home
  }

  turnBody(s, actor)
  moveToward(s, actor, ai.moveTarget)
  useAbilities(s, actor, rng)
}

/**
 * What a body is looking at, when nothing is making it look elsewhere.
 *
 * Whatever it is working on: the thing its rotation is aimed at, or for a
 * healer the body it is keeping alive. Both are read from the same functions
 * the rotation itself uses rather than worked out again here, so what a body
 * is looking at cannot disagree with what it is doing — which is the whole
 * point of drawing it.
 *
 * A healer's is the coarser of the two. `healTarget` refines `mostHurt` by the
 * spec's trait and needs the rotation's own ceiling to do it, so this stops at
 * the input both of them start from: who is hurt. A paladin looking at the
 * worst-off raider while casting on the tank beside them is a smaller lie than
 * a healer facing a wall.
 */
/**
 * What this body may aim at.
 *
 * The fight's own summons, and any of the raid's own the fight has turned. The
 * second half is the point: a turned body is hostile and is hitting the raid,
 * and it used to be invisible to every rotation in it -- so "do not kill them"
 * was a rule the engine enforced rather than a demand the fight made.
 *
 * It goes in the same pool the thralls are in and is picked by the same rule,
 * and comes back out through `hold:` once somebody has noticed. Leaving it to
 * the weapon alone was tried first and is not enough: what a turned body walks
 * up to is whoever is nearest, which is usually somebody with a bow and a near
 * edge, so almost nothing landed and the numbers came out the same as not
 * being able to hit them at all.
 */
function quarry(s: SimState, actor: Actor): Actor[] {
  // Everything the fight has put on the floor, except the small things that
  // nobody has called for.
  //
  // This is the one place a summon is *not* a target by default, and it is the
  // whole of what makes the confluence a fight rather than a chore. A small
  // thing alone is almost harmless and dies in a second; a raid that turns and
  // kills every one of them has spent its damage on nothing and still lost to
  // the pair it did not watch. What is worth hitting is the one `targetCall`
  // has named -- half of a pair about to become one thing -- and everything
  // else on this floor is left alone, which is the answer being made rather
  // than a rotation defaulting into it.
  const called = actor.ai?.striking ?? null
  const summoned = adds(s).filter(
    (a) => a.spawn !== 'ooze' || called === `ooze:${a.id}`,
  )
  if (summoned.length > 0) return summoned
  return livingParty(s).filter((a) => a.id !== actor.id && getAura(a, 'turned'))
}

function lookTarget(s: SimState, actor: Actor): Actor | null {
  if (actor.role === 'healer') {
    const saving = rescueTarget(s, actor)
    if (saving) return saving
    const hurt = mostHurt(s)
    return hurt && hurt.id !== actor.id ? hurt : null
  }
  return strikeTarget(s, actor, quarry(s, actor))
}

/**
 * Which way a body is turned.
 *
 * At what it is working on, which is what a fight looks like from above: a
 * raid all facing one way regardless of what any of them was doing read as a
 * row of cardboard, and the adds nobody appeared to be looking at were the
 * worst of it.
 *
 */
function turnBody(s: SimState, actor: Actor): void {
  const b = boss(s)
  const at = lookTarget(s, actor) ?? b
  turnToward(actor, Math.atan2(at.pos.y - actor.pos.y, at.pos.x - actor.pos.x))
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
    if (ai.striking.startsWith('spike:')) say(s, actor, 'Break the spike — get them out')
    else if (ai.striking.startsWith('hold:')) say(s, actor, 'That is one of ours — off them')
    else if (ai.striking.startsWith('first:')) say(s, actor, 'That one came back wrong — it first')
    else say(s, actor, 'Leave that one alone')
  }
}

/**
 * The one call worth making, as a stable key.
 *
 * Ranked rather than merged, the way `currentDanger` is: a body can be aiming
 * at one thing, so two calls at once have to be settled here rather than left
 * to whichever was written last.
 *
 * A key rather than a target, so the reaction delay is rolled once per
 * decision instead of once per tick. The id is in it deliberately: a second
 * spike is a second decision and has to be paid for again.
 */
function targetCall(s: SimState, actor: Actor): string | null {

  // Above the count, because a body that cannot move is losing health now and
  // a count has not cost anybody anything yet. Nearest first: the walk is what
  // the mechanic charges, so the raid splitting itself across three spikes by
  // distance is the answer working rather than the AI being clever.
  //
  // Only the ones actually holding somebody. A spike is worth the raid's whole
  // damage for exactly as long as a body cannot move, and not one second
  // longer — and this is the second guard on that, deliberately. The first is
  // that a spike dies when its victim does; if that ever misses again, the
  // cost of this rule missing too is a raid that spends a pull hitting a thing
  // standing over a corpse.
  const pinned = new Set(
    livingParty(s)
      .map((a) => getAura(a, 'spiked')?.sourceId)
      .filter((id): id is number => id !== undefined),
  )
  const spikes = s.actors.filter(
    (a) => a.faction === 'boss' && a.spawn === 'spike' && a.alive && pinned.has(a.id),
  )
  if (spikes.length > 0) {
    let near = spikes[0]!
    for (const spike of spikes) {
      if (dist(actor.pos, spike.pos) < dist(actor.pos, near.pos)) near = spike
    }
    return `spike:${near.id}`
  }

  // A beast that has picked somebody, and is walking at them.
  //
  // Below the spike because a pinned body is losing health now and this one is
  // only about to, and above everything under it for the reason the mechanic
  // exists: every hit a beast lands is a deposit, so the raid that turns and
  // meets it pays nothing and the raid that finishes its rotation first pays
  // for a minute. Nearest first, which splits a wave across the raid the same
  // way the spikes split it.
  //
  // It needs saying at all because the default rule works against it exactly
  // as it does for the empowered one: a rotation aims at the summon with the
  // least health left, and a beast that has just walked in has all of its.
  const beasts = adds(s).filter((a) => a.spawn === 'beast' && a.quarry !== undefined)
  if (beasts.length > 0) {
    let near = beasts[0]!
    for (const beast of beasts) {
      if (dist(actor.pos, beast.pos) < dist(actor.pos, near.pos)) near = beast
    }
    return `beast:${near.id}`
  }

  // Two small things about to become one, which is the only target call in
  // this game that is about where the enemy is rather than what it is.
  //
  // The rule is not "kill the small things": most of the time the answer is to
  // leave them alone, because each one alone is almost harmless and killing
  // one that was going nowhere is damage spent on nothing. What has to be
  // answered is a *pair* -- two of them closing on each other -- and the way
  // to answer it is to put one of them down before they touch.
  //
  // The bigger of the pair, because what a merging is worth is what it has
  // already eaten: letting a four take a one is the instant the mechanic is
  // about, and letting two ones meet is a body with a two on it.
  {
    const here = adds(s).filter((a) => a.spawn === 'ooze')
    let pair: [Actor, Actor] | null = null
    let closest = OOZE_WATCH
    for (let i = 0; i < here.length; i++) {
      for (let j = i + 1; j < here.length; j++) {
        const gap = dist(here[i]!.pos, here[j]!.pos)
        if (gap < closest) {
          closest = gap
          pair = [here[i]!, here[j]!]
        }
      }
    }
    if (pair) {
      const bigger = (pair[0].eaten ?? 0) >= (pair[1].eaten ?? 0) ? pair[0] : pair[1]
      return `ooze:${bigger.id}`
    }
  }

  // One of the raid's own, turned. The only one of these calls about a body
  // that was an ally a second ago, which is the whole of what it costs. Last,
  // because the spike is a thing standing still that stops mattering the
  // moment somebody breaks it, and this one is hitting the raid for its whole
  // count whatever anybody does.
  const taken = livingParty(s).find((a) => a.id !== actor.id && getAura(a, 'turned'))
  if (taken) return `hold:${taken.id}`

  // The one out of the wave that came back wrong, and below the turned body
  // because the two mistakes are not worth the same: letting this one live
  // costs damage for as long as it lives, and killing one of your own costs
  // that body for the rest of the pull.
  //
  // It needs saying at all because the default rule works against it. A
  // rotation picks the summon with the least health left, and empowering one
  // gives it more health and fills it -- so the instant the fight marks the
  // dangerous one, it also marks it as the last one anybody will aim at.
  // Measured: of the empowered bodies that died, every one died after every
  // other body in its wave.
  const wrong = adds(s).find((a) => getAura(a, 'empowered'))
  if (wrong) return `first:${wrong.id}`

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
export function mayStrike(actor: Actor, target: Actor): boolean {
  const call = actor.ai?.striking ?? null
  if (call === null) return true
  // The weapon has to obey this one too, and for the reason above: a raid
  // that stops casting at its own turned healer and keeps swinging at it has
  // not stopped.
  const held = calledId(call, 'hold:')
  return held === null || target.id !== held
}

/**
 * What a rotation should be aimed at, given whatever it has decided.
 *
 * The default is untouched and has to be: summons that walk in and hit
 * somebody are picked the way they always were, lowest health bar first, so
 * the thralls and the stalker are the same mechanic they were measured as.
 * What is new is the exceptions, and each of them costs a reaction delay to
 * reach: a spike is invisible to a rotation aimed at whatever is hurting the
 * raid until somebody decides to look at it.
 */
function strikeTarget(s: SimState, actor: Actor, pool: Actor[]): Actor {
  const b = boss(s)
  const call = actor.ai?.striking ?? null

  // A turned mind aims at the raid, and at whoever is nearest: it is not
  // playing, it is being played, so nothing about target priority applies. The
  // rotation itself is untouched — it presses the same buttons it always did,
  // which is what makes a turned dealer dangerous rather than merely absent.
  if (getAura(actor, 'turned')) {
    let near: Actor | null = null
    for (const a of livingParty(s)) {
      if (a.id === actor.id) continue
      if (!near || dist(actor.pos, a.pos) < dist(actor.pos, near.pos)) near = a
    }
    if (near) return near
  }

  const pinning = calledId(call, 'spike:')
  if (pinning !== null) {
    const spike = s.actors.find((a) => a.faction === 'boss' && a.id === pinning)
    if (spike && spike.alive) return spike
  }

  // Spikes are left out of the ordinary sweep below: a spike is worth hitting
  // exactly while it holds somebody, and the call above is what knows that.
  // Picked up by the sweep as well, a raid would keep hitting whichever spike
  // had least health left rather than the one nearest the body it is freeing.

  // The one that came back wrong, ahead of the rule that would pick it last.
  const wrong = calledId(call, 'first:')
  if (wrong !== null) {
    const one = s.actors.find((a) => a.faction === 'boss' && a.id === wrong)
    if (one && one.alive) return one
  }

  // The small thing that was called, which is one half of a pair that is about
  // to stop being two things.
  const closing = calledId(call, 'ooze:')
  if (closing !== null) {
    const one = s.actors.find((a) => a.faction === 'boss' && a.id === closing)
    if (one && one.alive) return one
  }

  // The beast that was called, which is a body with all of its health that the
  // ordinary sweep below would put last.
  const chosen = calledId(call, 'beast:')
  if (chosen !== null) {
    const one = s.actors.find((a) => a.faction === 'boss' && a.id === chosen)
    if (one && one.alive) return one
  }

  const held = calledId(call, 'hold:')
  const summoned = pool.filter((a) => a.spawn !== 'spike' && a.id !== held)
  if (summoned.length === 0) return b

  let focus = summoned[0]!
  for (const a of summoned) if (a.hp < focus.hp) focus = a
  return focus
}

/** Whoever this healer has decided to save, if it has decided at all. */

/**
 * The body this healer is about to press a button on, when that body is
 * somebody else.
 *
 * The one question the movement layer never asked. Everything about where a
 * healer stands was written off the boss — a bearing and a range, the same
 * two numbers every caster gets — and healing is the one job in the fight
 * whose target is not the boss. So a body that a mechanic had thrown to the
 * far wall was simply never healed: the rotation asked for a cast, the cast
 * came back out of range, and nothing anywhere turned that into a walk. It
 * read as a healer watching somebody die, which is exactly what it was.
 *
 * The answer has to be the same body the rotation will actually aim at, not
 * merely whoever is lowest, or the walk and the cast disagree: an anchor
 * paladin holding its tank would have been sent across the room after a
 * damage dealer it was never going to heal. So it runs the rotation's own
 * choice — the rescue first, because that one is on a timer, then whatever
 * `healTarget` would pick out of `mostHurt`.
 *
 * And it asks the emergency threshold rather than the top-off one, which is
 * the difference between a rule that fires now and then and a rule that fires
 * always. Somebody is under a top-off in a raid at essentially every moment of
 * a fight, so reading that number left every healer permanently owing
 * somebody, and the whole party moved: the healers sat a little nearer
 * whoever was lowest, the clustering pull dragged everyone else after them,
 * and `rendercheck` called it as the damage specs spreading from 1.32 to 1.39
 * — a check about damage, three layers away from anything here. What this is
 * for is a body that will die out there, not one that will finish the fight
 * at eighty percent, and the emergency line is the rotation's own word for
 * the difference.
 *
 * That is the answer for keeping somebody in reach, which is free. Leaving
 * your position to go and get them is not, and is priced again in `walkFor`.
 */
function patientOf(s: SimState, actor: Actor): Actor | null {
  if (actor.role !== 'healer' || !actor.ai) return null

  const rescue = rescueTarget(s, actor)
  if (rescue) return rescue.id === actor.id ? null : rescue

  const wounded = mostHurt(s)
  if (!wounded) return null

  const on = healTarget(s, actor, wounded, topOffFor(actor))
  if (on.id === actor.id || on.hp / on.maxHp >= emergencyFor(actor)) return null
  return on
}

/**
 * The same body, but only for the healer that owes them a walk.
 *
 * Two questions that look like one and are not. Keeping somebody in range is
 * free — it aims a step that was already being taken — so every healer in the
 * raid should want it, and `patientOf` answers for all of them. Leaving your
 * position to go and get them is not free, and `mostHurt` is a question about
 * the raid rather than about the healer, so every healer gets the same answer
 * and a raid with five of them sent all five after the same body. That is not
 * five healers being helpful: it is the raid's spread collapsing onto whoever
 * is lowest, which is a spread mechanic landing on five people and a brand
 * burning in the middle of them. Found on the Tidebreaker's twenty-five-man
 * normal, where it was worth forty-five points of win rate back when a walk
 * fired at the emergency line — more than the bug this exists to fix was
 * worth anywhere.
 *
 * So the walk is claimed the way a raid claims a target out loud, the shape
 * `watchTheLine` uses for a judgement: if anybody else can already reach them
 * it is covered, and if nobody can it belongs to whoever is nearest. Ids break
 * the tie, because two healers that each decided the other one had it are the
 * same failure written the other way round. Worth ten points of ninth-pull win
 * rate on both of the cells this change was hardest on.
 *
 * A rescue is not claimed here because it is claimed already, by name, in
 * `watchTheLine` — and it is the one heal in the fight with a clock on it, so
 * a second healer walking to a body somebody else has called is the raid
 * insuring the only mechanic it cannot afford to drop.
 */
function walkFor(s: SimState, actor: Actor): Actor | null {
  const on = patientOf(s, actor)
  if (!on) return null
  if (on.hp / on.maxHp >= WALK_LINE) return null

  // And not while somebody here needs the same thing.
  //
  // A walk is a few seconds of instants only, so it is not paid by the one
  // being fetched — it is paid by whoever was relying on this healer's next
  // cast. When that is another body already under the line, the trade is one
  // rescue for one death, and this raid cannot spend healers that way.
  const line = emergencyFor(actor)
  for (const near of livingParty(s)) {
    if (near.id === actor.id || near.id === on.id) continue
    if (near.hp / near.maxHp >= line) continue
    if (dist(actor.pos, near.pos) <= HEAL_REACH) return null
  }

  let nearest = actor
  for (const other of livingParty(s)) {
    if (other.id === actor.id || other.role !== 'healer') continue
    const gap = dist(other.pos, on.pos)
    if (gap <= HEAL_REACH) return null
    const mine = dist(nearest.pos, on.pos)
    if (gap < mine || (gap === mine && other.id < nearest.id)) nearest = other
  }
  return nearest.id === actor.id ? on : null
}

/**
 * The health a healer of this temperament stops topping people up at, and the
 * health at which it stops everything else to answer.
 *
 * Shared with `healerRotation` rather than written twice, because the reading
 * and the walk have to agree: a walk taken for somebody the rotation would
 * not have dropped what it was doing for is a walk out of position for
 * nothing.
 */
function topOffFor(actor: Actor): number {
  return actor.ai?.personality === 'timid' ? 0.95 : 0.82
}

function emergencyFor(actor: Actor): number {
  const personality = actor.ai?.personality
  return personality === 'timid' ? 0.55 : personality === 'greedy' ? 0.35 : 0.45
}

/**
 * How low a marked body has to be before a healer claims it.
 *
 * High, and for the reason the wound's line is high: a mark is answered by
 * never arriving at an instant rather than at one, so a healer that waited for
 * a marked body to be in trouble would be a healer answering it late by
 * construction -- which is the shape rule 3 says measures nothing. A claim on
 * somebody who is *fine* is the only version of this a reaction delay can be
 * late for.
 */
const CHAMPION_LINE = 0.92

/**
 * How much longer noticing a named body takes than noticing a floor.
 *
 * Longer than a puddle by a lot. A shape on the floor announces itself; a
 * health bar that is going to matter in ten seconds does not, and the whole
 * difference between a practised healer and a new one is how long it takes to
 * see that.
 */
const LINE_NOTICE = 6

/**
 * The healer's half of the two demands that name a body.
 *
 * Everything else a party member does about a mechanic runs through
 * `currentDanger`, where noticing late and fumbling outright already live.
 * Healing does not go anywhere near that path -- `healerRotation` reads a
 * health bar and casts, with no notion of having spotted anything -- so a
 * mechanic answered by healing would be answered identically by a raid on its
 * first pull and its ninth. That is not a property of healing, it is a
 * property of the rotation having no reaction in it. This puts one there, out
 * of the same two numbers and rolled the same way: notice once per body, wait
 * out the delay, and sometimes miss it entirely.
 *
 * Two kinds of body belong here and they are the same problem: somebody the
 * fight has named, who has to be above a line by a moment that is not the
 * healer's to choose. A wound has to be closed by taking them over it; a mark
 * has no count at all -- it is a body that must simply never reach zero, for
 * the rest of the pull.
 *
 * It cannot share `reactingTo` with the movement path. Answering either of
 * these means standing still and casting, and a healer that had spent its
 * danger slot on one would then be told to go and find a safe tile.
 */
function watchTheLine(s: SimState, actor: Actor, rng: Rng): void {
  const ai = actor.ai!
  if (actor.role !== 'healer') return

  const named = livingParty(s).filter(
    (a) =>
      getAura(a, 'championed') !== undefined ||
      getAura(a, 'festering') !== undefined ||
      getAura(a, 'infected') !== undefined,
  )

  const claim = (a: Actor): string =>
    getAura(a, 'festering') !== undefined
      ? `fester:${a.id}`
      : getAura(a, 'infected') !== undefined
        ? `infection:${a.id}`
        : `champion:${a.id}`
  // Three lines, and the third is the odd one: a wound and a mark are answered
  // by keeping somebody off the bottom, and a carrier is answered by taking
  // them all the way to the top -- which is a heal aimed at a body that is
  // nowhere near dying, and the only reason to aim one there in this game.
  const shaky = (a: Actor): boolean =>
    getAura(a, 'festering') !== undefined
      ? a.hp <= a.maxHp * FESTER_LINE
      : getAura(a, 'infected') !== undefined
        ? a.hp < a.maxHp * INFECTION_FLUSH
        : a.hp <= a.maxHp * CHAMPION_LINE

  // A claim is kept until the body it was made about is out of danger, one way
  // or the other. Re-deciding every tick is what a raid calling targets out
  // loud exists to prevent, and an AI that does it drops the cast it was
  // halfway through every time somebody else's health bar moves.
  let mine = named.find((a) => ai.callTo === claim(a) && shaky(a))

  if (!mine) {
    // Anything another healer has already called is somebody else's.
    const spoken = new Set(
      livingParty(s)
        .filter((a) => a.role === 'healer' && a.id !== actor.id)
        .map((a) => a.ai?.callTo),
    )
    mine = named
      .filter((a) => shaky(a) && !spoken.has(claim(a)))
      // Lowest first. Neither of these has a clock on it: both are answered by
      // a health bar, and the one nearest the bottom of its own is the one
      // nearest being answered too late.
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
  }

  if (!mine) {
    ai.callTo = null
    ai.callTimer = 0
    ai.answering = null
    return
  }

  const key = claim(mine)
  if (ai.callTo !== key) {
    ai.callTo = key
    ai.callTimer = ai.reactionDelay * LINE_NOTICE * rng.range(0.7, 1.4)
    if (rng.chance(ai.mistakeChance)) ai.callTimer += rng.range(0.8, 1.6)
  }
  if (ai.callTimer > 0) ai.callTimer -= DT
  ai.answering = ai.callTimer > 0 ? null : mine.id
}

/** The body this healer has called, once it has finished noticing. */
function calledBody(s: SimState, actor: Actor): Actor | null {
  const id = actor.ai?.answering
  if (id === null || id === undefined) return null
  const target = s.actors.find((a) => a.id === id)
  return target && target.alive ? target : null
}

/**
 * A body that will die if this heal does not land, which is two of the three.
 *
 * A wound and a mark are answered above everything, including whoever is
 * lowest: both are bodies the fight has named and neither is answered by the
 * rotation's own habits.
 */
function rescueTarget(s: SimState, actor: Actor): Actor | null {
  const target = calledBody(s, actor)
  if (!target) return null
  return getAura(target, 'championed') || getAura(target, 'festering') ? target : null
}

/**
 * A body that will leave something behind, which is the third and is not
 * urgent.
 *
 * Deliberately not a rescue. A carrier is in no danger -- what the heal buys
 * is *where* the thing it leaves will stand -- so answering it above somebody
 * who is actually dying is the raid trading a life for a tidier floor. Read
 * after the emergency rather than before it, which is the whole difference
 * between this and the two above.
 *
 * It was written as a rescue first and every cell of the fight wiped: healers
 * poured a pull's worth of casting into bodies at ninety percent while the
 * rest of the raid went down behind them.
 */
function flushTarget(s: SimState, actor: Actor): Actor | null {
  const target = calledBody(s, actor)
  if (!target) return null
  return getAura(target, 'infected') ? target : null
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

  // Inside a storming boss, which is the only danger in this game whose shape
  // is the boss. Above a pool and under a spread: it is a walk rather than a
  // step, and it is already on you rather than about to be.
  {
    const b = boss(s)
    if (getAura(b, 'storming') && dist(actor.pos, b.pos) <= STORM_REACH + DANGER_MARGIN) {
      consider('storm:self', 84)
    }
  }

  // Something walking at this body that cannot be killed. Ranked below the
  // shapes on the floor and above the marks that are answered by somebody
  // else: it is a walk that has to be kept up rather than a step, and being
  // late by a second costs a tick rather than a life.
  {
    const mark = getAura(actor, 'hounded')
    if (mark?.at && dist(actor.pos, mark.at) <= HOUND_REACH + DANGER_MARGIN) {
      consider('hound:self', 66)
    }
  }

  // Carrying something that will be a body when it stops. Answered by walking
  // rather than by anything the carrier can do about the dot itself: what the
  // walk buys is that the thing is born somewhere the raid can afford, which
  // is the only half of this mechanic the carrier owns.
  if (getAura(actor, 'infected')) consider('infection:self', 60)

  // Blood on this body, which is the one hazard here nobody can dodge: it goes
  // off where they are standing. What the carrier can do is be standing
  // somewhere nobody else is, so it is ranked above every mark that is
  // answered by somebody else moving.
  if (getAura(actor, 'spilling')) consider('spill:self', 62)

  // The ground under the boss, while it has somebody inside it. Ranked with
  // the floor rather than with the marks: it is a circle at a known place with
  // a known count, and the melee are standing in it already.
  if (s.actors.some((a) => getAura(a, 'swallowed'))) {
    const b = boss(s)
    if (dist(actor.pos, b.pos) <= GORGE_RADIUS + DANGER_MARGIN) consider('gorge:boss', 78)
  }

  // Something closing on this body, which is answered by not being where it is
  // going. Ranked with the mark it most resembles: it is a walk rather than a
  // step, and being a second late costs a tick rather than a life.
  {
    const mark = getAura(actor, 'haunted')
    if (mark?.at && dist(actor.pos, mark.at) <= SHADE_REACH + DANGER_MARGIN) {
      consider('shade:self', 64)
    }
  }


  for (const g of s.ground) {
    // The cone off the big arm, which is answered by being behind it. Its
    // urgency climbs as the cast runs out, the way the cold line's does: what
    // is being priced is a walk that gets less possible every tenth of a
    // second.
    if (g.kind === 'spray') {
      if (!g.detonated && insideCone(actor.pos, g)) {
        consider(`spray:${g.id}`, 70 + (SPRAY_CAST - g.telegraph) * 8)
      }
      continue
    }
    // The flood is deliberately answered by nobody. It costs no health, so a
    // party that treated it as danger would drop what it was doing to walk out
    // of a thing that does not hurt -- and what it is for is that fixing a
    // geometry late is slow, which is a cost the raid should pay rather than
    // dodge.
    if (g.kind === 'flood') {
      continue
    }















    // Glass on the floor, which is a step off a patch and climbs as the count
    // runs out -- the cold line's shape, and priced the same way.
    if (g.kind === 'caustic') {
      if (dist(actor.pos, g.pos) <= g.radius + DANGER_MARGIN) {
        consider(`caustic:${g.id}`, g.detonated ? 88 : 80 + (CAUSTIC_TELEGRAPH - g.telegraph) * 9)
      }
      continue
    }

    // The circle everybody has to be *inside*, which is the one entry on this
    // list that is not answered by leaving. It is the most urgent thing in the
    // fight while it counts: everything else costs a body and this one costs
    // the raid, divided.
    if (g.kind === 'gather') {
      if (!g.detonated && dist(actor.pos, g.pos) > g.radius - DANGER_MARGIN) {
        consider(`gather:${g.id}`, 90)
      }
      continue
    }

    // A flask, and the reason it is here is that it will not be urgent until
    // it is too late. Its urgency is written off the count rather than off
    // distance, so a body standing on one starts walking while there is still
    // time to walk.
    if (g.kind === 'decant') {
      if (!g.detonated && dist(actor.pos, g.pos) <= g.radius + DANGER_MARGIN) {
        consider(`decant:${g.id}`, 58 + (DECANT_COUNT - g.telegraph) * 1.6)
      }
      continue
    }

    const d = dist(actor.pos, g.pos)
    if (d <= g.radius + DANGER_MARGIN) {
      // Standing in live fire is the most urgent state there is.
    // The cold line, on its own channel rather than in the pool's.
    //
    // Not a nicety. A hazard answered only by `isSpotSafe` is answered by code
    // that cannot be late — the spot is refused the instant it exists, on a
    // first pull exactly as on a ninth — so the mechanic measures at zero
    // whatever it costs, and this one measured at exactly that. The reaction
    // delay and the fumble live on this path; a mechanic that never becomes
    // the most urgent thing is a mechanic practice cannot touch.
    //
    // Above a pool and under a spread: a step rather than a walk, and being a
    // beat late costs one patch rather than a life.
    if (g.kind === 'coldflame') {
      if (!g.detonated && dist(actor.pos, g.pos) <= g.radius + DANGER_MARGIN) {
        consider(`coldflame:${g.id}`, 84 + (COLDFLAME_TELEGRAPH - g.telegraph) * 10)
      }
      continue
    }
      consider(`puddle:${g.id}`, g.detonated ? 100 : 80 + (PUDDLE_TELEGRAPH - g.telegraph) * 9)
    }
  }

  // Standing next to someone about to detonate is just as lethal.
  for (const other of livingParty(s)) {
    if (other.id === actor.id) continue
    // Somebody about to be stood on by their own blood. Just under the
    // carrier's own reading of it: they cannot leave it and everybody else
    // can, so the walk is worth slightly less to the person taking it.
    if (
      getAura(actor, 'spilling') === undefined &&
      getAura(other, 'spilling') &&
      dist(actor.pos, other.pos) <= SPILL_RADIUS + DANGER_MARGIN
    ) {
      consider(`spill:${other.id}`, 55)
    }
    // Standing with somebody the gorged one has marked, which is the same
    // shape and permanent. Below the spill because the hit is a share of a
    // slam rather than the whole of a detonation, and above the reek because
    // it arrives all at once.
    if (
      getAura(other, 'championed') &&
      dist(actor.pos, other.pos) <= MARK_REACH + DANGER_MARGIN
    ) {
      consider(`mark:${other.id}`, 48)
    }
    // Standing next to a body that reeks, which costs the same and is quieter
    // about it. Below the spread's urgency: that one is one hit at a known
    // instant, and this is a tick you will pay a few of while you walk.
    if (
      getAura(actor, 'reek') === undefined &&
      getAura(other, 'reek') &&
      dist(actor.pos, other.pos) <= REEK_REACH + DANGER_MARGIN
    ) {
      consider(`reek:${other.id}`, 48)
    }
  }

  return bestKey
}

/**
 * How close two small things have to be before the raid is watching them.
 *
 * Three times the distance at which they merge. Nearer than this and a raid
 * that has not already started is too late; further and every pair in the room
 * is a pair, which is a call that names something every tick and therefore
 * names nothing.
 */
const OOZE_WATCH = MERGE_REACH * 3

/** How close the thing chasing you has to be before it is worth running. */

/** Is this spot under the wedge, on the pulse coming or the one after it? */

/** Whether anybody wearing another mark is this close to the given spot. */

/** The split the party is currently being asked to make, if it is being asked. */

/** Where this actor's group is supposed to be standing. */

/** Cheap re-check of an already chosen destination. */
function isSpotSafe(s: SimState, actor: Actor, spot: Vec2): boolean {
  // Not a hazard, and the first thing checked anyway: a spot inside a rock is
  // not a spot. Walking at one is not fatal — the terrain slides a body round
  // it — but it is a dodge that does not arrive, which against a telegraph is
  // the same as not dodging.
  if (inTerrain(s.obstacles, spot, actor.radius)) return false
  for (const g of s.ground) {
    if (g.kind === 'spray') {
      if (!g.detonated && insideCone(spot, g)) return false
      continue
    }
    // Slow ground is still ground. A spot refused for being inside it would be
    // a party that never stands in the one hazard here it is supposed to have
    // to stand in.
    if (g.kind === 'flood') {
      continue
    }
    // The one shape in the game that makes a spot safe rather than unsafe: a
    // tile outside the circle is a tile that pays the whole bill.
    if (g.kind === 'gather') {
      if (!g.detonated && dist(spot, g.pos) > g.radius - DANGER_MARGIN) return false
      continue
    }
    if (dist(spot, g.pos) <= g.radius + DANGER_MARGIN) return false
  }

  // The boss itself, while it is storming. Nothing is on the floor to leave —
  // the dangerous ground is the thing that is normally the safest place to
  // stand — so a party that only reads `s.ground` walks into it and stays
  // there. This is the one moment in the game where being on the boss is the
  // mistake.
  {
    const b = boss(s)
    if (getAura(b, 'storming') && dist(spot, b.pos) < STORM_REACH + DANGER_MARGIN) return false
  }

  // A shade closing on this body. The one thing here answered by moving away
  // from a point that is not on the floor's list: what is following is a fact
  // about the person rather than about the room, so it is kept on the mark.
  const shade = getAura(actor, 'haunted')
  if (shade?.at && dist(spot, shade.at) < SHADE_REACH + DANGER_MARGIN) return false

  // And the hound, which is the same rule with a longer memory: it does not
  // expire when the raid does something about it, because there is nothing to
  // do about it. A spot inside its reach is a spot that bills every tick it is
  // stood in, so the body it picked keeps choosing new ones -- which is what
  // "keep walking" means when the walking is done by a rule rather than by a
  // person.
  const hound = getAura(actor, 'hounded')
  if (hound?.at && dist(spot, hound.at) < HOUND_REACH + DANGER_MARGIN * 2) return false

  // A spill, which is the reek's louder cousin and wants the same answer with
  // one difference: the carrier has to move as well. It goes off where they
  // are standing, so the spot that is safe for them is one nobody else is
  // near, and the spot that is safe for everybody else is one they are not.
  {
    const carrying = getAura(actor, 'spilling') !== undefined
    for (const other of livingParty(s)) {
      if (other.id === actor.id) continue
      if (!carrying && getAura(other, 'spilling') === undefined) continue
      if (dist(spot, other.pos) < SPILL_RADIUS + DANGER_MARGIN) return false
    }
  }

  // The floor under the boss while it is holding somebody. The one hazard in
  // this game centred on the thing the raid is standing around by design, so a
  // party that reads only `s.ground` stays in it and takes the whole bill.
  if (s.actors.some((a) => getAura(a, 'swallowed'))) {
    const b = boss(s)
    if (dist(spot, b.pos) < GORGE_RADIUS + DANGER_MARGIN) return false
  }

  // The reek, which is the spread's slower cousin and wants the same answer.
  //
  // It was written without one, and a mechanic with no answer is not a hard
  // mechanic, it is a bill: a raid gathered at twenty-five had three marks in
  // it and every one of them reached most of the room, so the fight read 0%
  // won at that size and 100% at ten. What is different from the spread is
  // only who has to move -- the mark ticks on its carrier either way, so the
  // carrier gains nothing by walking and everybody else gains everything.
  if (getAura(actor, 'reek') === undefined) {
    for (const other of livingParty(s)) {
      if (other.id === actor.id) continue
      if (getAura(other, 'reek') === undefined) continue
      if (dist(spot, other.pos) < REEK_REACH + DANGER_MARGIN) return false
    }
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

  // The edge of a platform, before anything else and for everybody including
  // the tank. Every other line in this function is about doing your job from
  // the wrong distance; this one is about standing somewhere one push from
  // being out of the fight, and there is no job that is worth that.
  if (onEdge(s.room, actor.pos, actor.radius)) return true

  // Standing on somebody counts as being out of position.
  //
  // Nothing here used to say so, so a raid that started in a heap stayed in
  // one: `idlePosition` keeps whatever bearing a body already has and only
  // fixes its range, and a heap is a range that is already correct. This is
  // the one thing that ever asks for the lean in `idlePosition`.
  //
  // Ahead of the melee rule rather than after it, which is where this was
  // first written and was dead code — melee and tanks return on the line
  // below, and melee are the half of the raid that actually piles up.
  //
  // A tank is exempt, because where a tank stands is a job rather than a
  // preference: it is holding the thing everybody else is arranged around.
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
    // A healer also has to be able to reach whoever it is about to heal, and
    // this is the one rule here that its home does not already answer. Every
    // other line in this function is a distance off the boss, and `home` is a
    // bearing off the boss, so being out of position and walking home are the
    // same sentence. The body that needs the heal is wherever the last
    // mechanic put it, which is why the walk had to be taught separately --
    // see `withinReach`.
    const hurt = walkFor(s, actor)
    if (hurt && dist(actor.pos, hurt.pos) > HEAL_REACH) return true
  }

  return false
}

/**
 * The smallest correction that fixes the problem: keep the actor's current
 * bearing from the boss and only adjust distance. Returning to a shared home
 * tile would also stack the whole party on one spot for the next puddle.
 */
/**
 * How much room a body wants around it when nothing is happening.
 *
 * Well under `SPREAD_RADIUS`, and that is the number this one is chosen
 * against rather than against how it looks. The spread marks somebody and asks
 * the rest to be a hundred and ten units clear of them; a raid that idles at
 * anything near that has answered the mechanic before it was cast. At this
 * distance a spread still costs everybody a real walk, which is what it is
 * for.
 *
 * Above two body widths, so it is a raid standing apart rather than a raid
 * overlapping. Between the two there is a lot of room, and this sits low in
 * it: the point is to stop bodies occupying the same pixel, not to hold a
 * formation.
 */
const SPACING = 46

/**
 * How close to a wall counts as hugging it.
 *
 * Sixty units, which is what the wall term was written with when it was a
 * radius: a body inside the last sixty of the floor is scored down, harder
 * the closer it gets, and the arithmetic is unchanged for a disc.
 */
const WALL_LAP = 60

/**
 * What a body standing exactly on top of you is worth, in score.
 *
 * Small on the scale this function works at. A cone is fourteen hundred and
 * standing in fire is sixteen; this is a nudge, and it has to stay one — the
 * moment personal space can outvote a mechanic, it is killing people to look
 * tidy.
 */
const CROWD_COST = 350

/**
 * What a candidate spot costs for being on top of somebody.
 *
 * Counted per neighbour inside `SPACING` and scaled by how far inside, so a
 * spot with three bodies on it is worse than a spot with one and a spot that
 * merely brushes somebody is nearly free.
 *
 * Only the ones at range are pushed apart, and only away from each other. A
 * tank has a job where it stands, and melee have no room to take: their ring
 * is about forty units off the boss, which is two hundred and sixty units of
 * circumference for eight bodies, so asking them to hold this spacing asks
 * them to leave melee. Measured when they were included, it took the warrior
 * from parity with a hunter to three quarters of one.
 */
function elbowRoom(s: SimState, actor: Actor, spot: Vec2): number {
  if (!spreads(actor)) return 0
  let cost = 0
  for (const other of livingParty(s)) {
    if (other.id === actor.id || !spreads(other)) continue
    const d = dist(spot, other.pos)
    if (d >= SPACING) continue
    cost += (1 - d / SPACING) * CROWD_COST
  }
  return cost
}

/**
 * Standing apart is a preference, so it never asks anybody to walk.
 *
 * This is the whole shape of the thing and it took three goes to find. A raid
 * clusters because `idlePosition` keeps whatever bearing a body already has
 * and only fixes its range — a heap is a range that is already correct — so
 * the obvious fix was to call being crowded a reason to reposition.
 *
 * That fix cost more than it bought, three different ways, and `balancecheck`
 * and `rendercheck` between them caught all three: the hard-casting specs fell
 * to two thirds of a hunter because a walk breaks a cast; melee lost a quarter
 * of their damage because their ring is two hundred and sixty units around and
 * cannot hold eight bodies apart; and three raid cells dropped under their win
 * floor because the raid was spending the fight on its feet.
 *
 * Every one of those is the same charge: a walk. So this does not ask for one.
 * The lean is applied only inside `idlePosition`, which is reached when a body
 * is already going somewhere — back from a dodge, or into range after the boss
 * moved — and all it does is aim that walk a little off whoever is standing
 * there. A raid in this game moves every few seconds because a mechanic makes
 * it, so the decongestion rides along on movement that was happening anyway
 * and costs nothing at all.
 *
 * It is slower than pushing them apart, and it stops short of a formation.
 * That is the trade, and it is the right way round: the pile was a look, and
 * the fights are the game.
 */

/**
 * Whether this one has room to stand apart, and can afford to.
 *
 * Only the ones at range. A tank's position is a job rather than a preference,
 * and melee turned out to have no room: their ring sits about forty units off
 * the boss, which is two hundred and sixty units of circumference for eight
 * bodies. Asked to hold this spacing they cannot, so they walk, and they were
 * still walking when the swing timer came up — measured, it took the warrior
 * from parity to three quarters of a hunter, and made the spread between best
 * and worst damage spec wide enough that `rendercheck` called it.
 *
 * Melee stacked on a boss is also simply what melee do. What reads as a heap
 * is the whole raid in one, and the raid is mostly the people at range.
 */
function spreads(actor: Actor): boolean {
  return actor.role !== 'tank' && !actor.melee
}

/**
 * Which way this one should lean to stop standing on somebody.
 *
 * The sum of the pushes away from everyone inside `SPACING`, so a body in a
 * crowd leans away from the crowd rather than away from whichever neighbour it
 * happened to look at first. Null when there is nobody close, which is the
 * usual answer and the cheap one.
 *
 * Weighted by how close each neighbour is, so the nearest matters most and one
 * at the edge of the radius barely counts. Without that, a body with three
 * distant neighbours moved as urgently as one standing inside somebody.
 */
function crowding(s: SimState, actor: Actor, within: number): Vec2 | null {
  let x = 0
  let y = 0
  let found = false
  for (const other of livingParty(s)) {
    if (other.id === actor.id) continue
    const d = dist(actor.pos, other.pos)
    if (d >= within) continue
    found = true
    // Two bodies exactly on top of each other have no direction between them.
    // Break it by id, which is stable, rather than randomly — a tie resolved a
    // different way each tick is two bodies shuffling on the spot forever.
    const away = d > 0.01 ? 1 / d : 0
    const dx = d > 0.01 ? actor.pos.x - other.pos.x : (actor.id < other.id ? -1 : 1)
    const dy = d > 0.01 ? actor.pos.y - other.pos.y : 0
    const weight = (1 - d / within) * (d > 0.01 ? away : 1)
    x += dx * weight
    y += dy * weight
  }
  if (!found) return null
  const len = Math.hypot(x, y)
  if (len < 0.001) return null
  return { x: x / len, y: y / len }
}

/**
 * How far off its own ring this body stands.
 *
 * The cheapest spacing there is, and the only one that turned out to be free.
 * A raid piles up because every body at range wants the same distance from the
 * boss — one ring, and a bearing nobody ever changes — so bodies that start
 * near each other stay near each other forever. Fanning them across a few
 * rings separates them without asking anyone to take a single extra step: it
 * is the same walk they were already making, aimed a little short or a little
 * long.
 *
 * That matters more than it sounds. Every version of this that spread bodies
 * *around* the ring had to pay for a walk, and the walk is what broke things —
 * casts, melee uptime, three raid cells under their win floor. This one has no
 * walk to pay for.
 *
 * Off the actor's id, so it is fixed for the whole fight: a body that re-drew
 * its own preferred range would wander in and out for no reason anybody could
 * see.
 *
 * Tanks are exempt. Where a tank stands is a job.
 */
function ringOffset(actor: Actor, spread: number): number {
  if (actor.role === 'tank') return 0
  // Five bands, centred on nought, so the ring the fight was tuned around is
  // still the middle one and the raid still averages the range it always had.
  return ((actor.id % 5) - 2) * spread
}

function idlePosition(s: SimState, actor: Actor): Vec2 {
  const b = boss(s)
  const d = dist(actor.pos, b.pos) || 1
  const want =
    actor.role === 'tank' || actor.melee
      ? MELEE_RANGE * 0.8 + ringOffset(actor, 9)
      : CASTER_IDEAL_RANGE + ringOffset(actor, 26)

  let bearingX = (actor.pos.x - b.pos.x) / d
  let bearingY = (actor.pos.y - b.pos.y) / d

  // Lean off whoever is standing too close, then come back to the ring.
  //
  // The lean is applied to the bearing rather than to the position, so what it
  // actually buys is a step around the ring rather than a step off it. That
  // matters: the ring is the range this role fights at, and a body that solved
  // crowding by backing away would have solved it by leaving melee.
  //
  // It also means a ring that cannot hold everybody at `SPACING` does not
  // thrash. Everyone pushes, everyone slides, and the pushes cancel when the
  // gaps are even — a ring too small to fit the crowd settles at evenly
  // squeezed rather than oscillating.
  const lean = spreads(actor) ? crowding(s, actor, SPACING) : null
  if (lean) {
    // Sized so the step along the ring is about one spacing, whatever the ring
    // is. This was a flat fraction of the bearing first, which is not a
    // distance at all — a bearing nudged by that much swings through a third
    // of a turn, and a third of a turn at caster range is a hundred and thirty
    // units of walking to gain forty. `balancecheck` found it as three raid
    // cells dropping under their win floor, because the raid was spending the
    // fight on its feet.
    const step = SPACING / want
    bearingX += lean.x * step
    bearingY += lean.y * step
    const len = Math.hypot(bearingX, bearingY) || 1
    bearingX /= len
    bearingY /= len
  }

  // Not pushed into the room, deliberately.
  //
  // Part of this ring is outside any room the boss is standing near the edge
  // of, and in a rectangle it can be outside while the boss is nowhere near a
  // wall. Clamping the target here is the right answer to that and it is not
  // free: it moves where the casters stand on the yardstick disc too, and
  // measured across the whole balance table it moved every cell — the descent
  // ran a floor deeper, a healerless party went from 68% to 100%. That is a
  // tuning change wearing a refactor's clothes, so it belongs with the first
  // room that needs it and the pull it is measured in, not here.
  //
  // Nothing walks out of the room in the meantime: the step itself is pushed
  // back in, so what an unreachable target costs is a body standing against
  // the wall nearest it rather than a body outside.
  const home = { x: b.pos.x + bearingX * want, y: b.pos.y + bearingY * want }
  // Pushed in wherever the ring can leave the room, which is every room that
  // is not the yardstick disc.
  //
  // On a disc it is left alone deliberately: the ring only escapes when the
  // boss is against the wall, and clamping it there moved every cell of the
  // balance table — a tuning change wearing a refactor's clothes, measured and
  // backed out when the rooms were built. In a rectangle the ring leaves the
  // room with the boss standing in the middle of it, and what an unreachable
  // target costs is a body pressed into a wall for as long as it stands, which
  // is a raid queued along the sides of a hall.
  if (s.room.kind !== 'round') pushInside(s.room, home, actor.radius)
  return withinReach(s, actor, home, want)
}

/**
 * A home a healer can actually heal from.
 *
 * A step around the ring rather than off it, which is the same shape as the
 * crowding lean above and chosen for the same reason. The ring is the range
 * this role fights at and the rest of the fight is written against it: a
 * healer that answered this by walking in a straight line at the body it
 * wanted ended up wherever that body was standing, which on a boss whose main
 * mechanic sweeps the floor is the melee's ground. Measured, that version
 * doubled the share of a raid's healers that died, 24% to 47%, and they were
 * not dying to anything they had walked into — their mechanic hits went
 * *down*. They were dying because a healer that leaves the range it was tuned
 * at takes the fight's ordinary damage somewhere it was never built to stand.
 *
 * So the ring is kept and the bearing is turned: where the ring and the reach
 * of a heal cross, that is the spot, and of the two crossings the one nearer
 * where it was already going. Only when they do not cross at all — a body far
 * enough out that no point at this range reaches it — does it give ground, and
 * then along the line, as little as the geometry allows.
 *
 * Left exactly where it was when the patient is already in reach, which is
 * nearly always, so nearly always this costs nothing.
 *
 * And it is a fixed point, which is what stops the pacing. The spot it returns
 * is in range, so the reach rule in `outOfPosition` is satisfied there; if the
 * walk took the healer off the caster band the range rule fires instead, asks
 * for a home, and gets this same spot back rather than the ring that put the
 * patient out of reach in the first place.
 */
function withinReach(s: SimState, actor: Actor, home: Vec2, want: number): Vec2 {
  const hurt = walkFor(s, actor)
  if (!hurt) return home
  const gap = dist(home, hurt.pos)
  if (gap <= HEAL_STAND) return home

  const closer = onRing(boss(s).pos, want, hurt.pos, home) ?? {
    x: hurt.pos.x + (home.x - hurt.pos.x) * (HEAL_STAND / gap),
    y: hurt.pos.y + (home.y - hurt.pos.y) * (HEAL_STAND / gap),
  }
  // And never into something.
  //
  // Home used to be a ring around the boss, which is why the one place this is
  // read guards it so narrowly: a ring cannot wander into a hazard, so the
  // only checks it needed were the two mechanics that cover the ring itself.
  // A home aimed at a body can go wherever that body is, and the fight has
  // mechanics whose whole point is that it should not follow — a fault takes
  // half the floor, and the half the dying one is standing on is exactly the
  // half it is dying on.
  //
  // Refusing rather than looking for somewhere else in range. Where a mechanic
  // has cut the raid in two, the body across the line has an answer of its own
  // and this one is not it; a healer that went anyway arrived as a second
  // corpse. It was worth twenty-eight points of the Tidebreaker's ten-man
  // heroic when the walk was a straight line at the body; against the ring it
  // measures at nothing, because a spot on the ring is rarely a spot in a
  // hazard. Kept at nothing: what it refuses has not stopped being fatal, it
  // has only stopped being common.
  return isSpotSafe(s, actor, closer) ? closer : home
}

/**
 * Where a circle of radius `want` about `centre` comes within `HEAL_STAND` of
 * `hurt`, nearest to `near`. Null when it never does.
 *
 * Two circles: the ring the healer wants to stand on, and the reach of its
 * heal. Their crossings are the only two spots that answer both, and the
 * nearer of the two to where the healer was already headed is the one that
 * costs the shortest walk.
 */
function onRing(centre: Vec2, want: number, hurt: Vec2, near: Vec2): Vec2 | null {
  const dx = hurt.x - centre.x
  const dy = hurt.y - centre.y
  const d = Math.hypot(dx, dy)
  // Concentric, or one circle wholly inside the other with no edge in common.
  if (d < 0.001 || d > want + HEAL_STAND || d < Math.abs(want - HEAL_STAND)) return null

  // How far along the line between the centres the crossings sit, and half the
  // chord they lie on.
  const along = (d * d + want * want - HEAL_STAND * HEAL_STAND) / (2 * d)
  const half = Math.sqrt(Math.max(0, want * want - along * along))
  const mid = { x: centre.x + (dx / d) * along, y: centre.y + (dy / d) * along }
  const px = -dy / d
  const py = dx / d

  const one = { x: mid.x + px * half, y: mid.y + py * half }
  const other = { x: mid.x - px * half, y: mid.y - py * half }
  return dist(one, near) <= dist(other, near) ? one : other
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


  const patient = patientOf(s, actor)

  // How close this one wants to get to the boss: out of its lap, and outside
  // its own near edge when it has one.
  //
  // The larger of the two, and the first version of this dropped the ninety
  // and kept only the second — which is nothing at all for a staff, because a
  // staff has no near edge. Casters lost the rule that had been keeping them
  // out of melee entirely, and the hunter got pushed past where it needed to
  // stand and spent the difference cornered against the wall. Both showed up
  // in the same two columns: more time inside the near edge, and more time
  // standing in fire.
  const nearEdge = Math.max(CASTER_LAP, nearEdgeOn(actor, b))

  // Whether the thing every other term here pulls a body towards is currently
  // the hazard. See the block that scores it, below.
  const storming = getAura(b, 'storming') !== undefined

  // The two the gorged one asks for, read once rather than per candidate: a
  // sweep is a few dozen spots and both of these are facts about the field.
  const spillActive = livingParty(s).some((a) => getAura(a, 'spilling') !== undefined)
  const swallowActive = s.actors.some((a) => getAura(a, 'swallowed') !== undefined)

  let best: Vec2 = { x: actor.pos.x, y: actor.pos.y }
  let bestScore = -Infinity

  for (const candidate of candidates) {
    pushInside(s.room, candidate, actor.radius)

    let score = 0

    // 1. Ground danger dominates everything else.
    let ringActive = false
    let soakActive = false
    let crushActive = false
    let schismActive = false
    let strandedActive = false
    let sentActive = false
    let gathering: GroundEffect | null = null
    for (const g of s.ground) {
      // Ground that costs nothing to stand in is not a reason to stand
      // anywhere else. Scored as a hazard it pushed the whole raid off a third
      // of the room to avoid something that does not hurt.
      if (g.kind === 'flood') {
        continue
      }
      // And the cone is a wedge rather than a disc: priced as a circle of its
      // own length it condemned the floor behind the boss as well as in front
      // of it, which is most of the room.
      if (g.kind === 'spray') {
        if (!g.detonated && insideCone(candidate, g)) score -= 1000
        continue
      }
      // The circle to be inside, kept for the term below rather than priced
      // here: it is the one shape a body should be walking towards.
      if (g.kind === 'gather') {
        if (!g.detonated) gathering = g
        continue
      }
      const d = dist(candidate, g.pos)
      if (d <= g.radius + DANGER_MARGIN) score -= 1000
      else score -= Math.max(0, 200 - d) * 0.5
    }

    // Being inside the circle beats everything except being on fire. The bill
    // is divided by whoever came, so a body that stays out does not merely
    // fail to help -- it makes everybody else's share larger.
    if (gathering) {
      const d = dist(candidate, gathering.pos)
      if (d <= gathering.radius - DANGER_MARGIN) score += 900
      else score -= Math.min(1400, (d - gathering.radius) * 2.2)
    }

    // 3e. And the body this healer is about to heal, which is the burden's
    // term and the yoke's in the same shape, for the same reason: a dodge is
    // free to land anywhere the floor is clear, and one that lands out of
    // heal range answers a mechanic by causing a death somewhere else. The
    // out-of-position rule catches that afterwards and walks it back, but
    // afterwards is a second of walking, and the body waiting on the heal is
    // usually the one that does not have a second.
    //
    // Capped under what fire costs, like the rest of this block. A healer
    // that would stand in a puddle to keep somebody in range has traded one
    // death for two.
    if (patient) {
      const d = dist(candidate, patient.pos)
      if (d <= HEAL_STAND) score += 700
      else score -= Math.min(800, (d - HEAL_STAND) * 1.7)
    }

    // 3b. The boss itself, while it is storming.
    //
    // The one hazard in the game that is not on the floor, and the only one
    // whose shape is the thing every other term in this function argues for
    // standing near. `isSpotSafe` already refuses a spot inside it -- and
    // refusing is not choosing. This function had never heard of the storm,
    // so every tick the destination was rejected and this function handed
    // back another spot inside it. Measured over thirty thousand body-frames
    // burning in the storm: the body knew what it was standing in 96% of the
    // time, held a destination on 23% of those frames, and on 73% of those
    // the destination it had picked was itself inside the storm -- re-picked
    // on 56% of them, which is the jitter this file warns about twice
    // elsewhere. A raid that is running and not leaving is a raid whose
    // scoresheet is missing a row, not one that is reacting too slowly.
    //
    // Weighted above a pool and below the instants, which is where the same
    // mechanic already sits in `currentDanger`: it is a walk out of a wide
    // thing that bills every tick, not a step off a patch and not a hit that
    // arrives whole.
    if (storming) {
      const d = dist(candidate, b.pos)
      if (d <= STORM_REACH + DANGER_MARGIN) score -= 1500
      else score += Math.min(220, (d - STORM_REACH) * 1.4)
    }

    // Separation, for the one mechanic here that is answered by it.
    //
    // Refusing a spot inside somebody's blood is not enough on its own: it
    // makes a body stop where it stops rather than take itself somewhere, and
    // a raid that only just cleared a hundred and twenty units is a raid that
    // is back inside it as soon as anybody drifts. Scored as well as refused,
    // so what a spill produces is real distance for the six seconds it exists.
    if (spillActive) {
      const carrying = getAura(actor, 'spilling') !== undefined
      for (const other of livingParty(s)) {
        if (other.id === actor.id) continue
        if (!carrying && getAura(other, 'spilling') === undefined) continue
        const d = dist(candidate, other.pos)
        if (d < SPILL_RADIUS + DANGER_MARGIN) score -= 900
        else score += Math.min(260, d) * 0.4
      }
    }

    // The circle the boss is about to throw somebody out of. Scored above the
    // floor for the reason it is refused above: it is centred on the one place
    // the raid is standing around anyway, so a body that merely stops being in
    // it drifts back the moment anything else pulls at it.
    if (swallowActive) {
      const d = dist(candidate, b.pos)
      if (d <= GORGE_RADIUS + DANGER_MARGIN) score -= 1200
      else score += Math.min(180, (d - GORGE_RADIUS) * 1.4)
    }

    // 4. Role positioning.
    const bossDist = dist(candidate, b.pos)
    if (storming || soakActive || strandedActive || sentActive) {
      // Standing in it beats standing in range of anything. Suspended the
      // same way the ring suspends the casters' spacing, and for melee too:
      // the boss is not going anywhere in five seconds.
      //
      // The same for the three patches, and it is not the same reason. The
      // circle is one place and being in range of the fight from it is luck;
      // the patches are three, and a term that pays for standing near the boss
      // would pick the nearest one for everybody — which is a mechanic
      // answered by walking wherever the fight already was.
      //
      // And the same again for a body that has been sent somewhere by name:
      // the plate it has to pay at and the stone it was given are both places
      // rather than distances, and a term that argues for standing where the
      // role wants to stand argues against the only spot that answers.
      //
      // And once more for the storm, which is the sharpest case of it in the
      // game and the reason the melee branch below already carries the
      // argument in its own words. The role terms are written against the
      // boss's position -- melee are paid for being inside two hundred of it,
      // casters for being inside two hundred and eighty -- and while it is
      // storming those are payments for standing in the fire. Penalising the
      // storm without suspending them leaves the two arguing, and what the
      // raid does then is stand at the edge of the reach splitting the
      // difference. There is no distance a role wants to hold from a thing
      // that is chasing somebody.
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
      //
      // Melee spend about a quarter of a fight with nothing in reach — a spot
      // between their own reach and two hundred scores as well as standing on
      // the boss and cannot be hit from, and `aiprobe` reads it straight off.
      // Scoring that gap the way the casters' near edge is scored fixes it,
      // and costs something somewhere else: with melee holding tighter the
      // hunter ends up inside its own near edge half again as often and stands
      // in fire twice as often, which three attempts at guessing the mechanism
      // did not shift. It is a trade rather than a fix, and it is left out
      // until it is understood.
      if (crushActive) score -= Math.max(0, 260 - bossDist) * 0.2
      else if (bossDist > 200) score -= (bossDist - 200) * 3
      else score -= bossDist * 0.35
    } else if (!ringActive) {
      // Casters want to stay in range but out of the boss's lap. Suspended
      // while a ring is out, because hugging the boss is then the answer.
      //
      // The near edge is the actor's own where that is further out than the
      // shared one, because one of them is holding a bow. Ninety is what a
      // staff wants and it is only about being out of the way; a bow cannot be
      // drawn on anything closer than ninety *plus the width of what it is
      // drawn on*, which for the boss is another fifty. Between those two
      // figures was a hunter standing in a dodge it had scored perfectly,
      // unable to fire.
      if (bossDist < nearEdge) score -= (nearEdge - bossDist) * 4
      if (bossDist > 280) score -= (bossDist - 280) * 4
    }

    // 5. Humanity: drift toward the group.
    //
    // Whichever group that is. While the raid is cut into groups, the pull
    // toward the middle of everybody is a pull back into the other one, and
    // an instinct that is right for every other mechanic here is exactly
    // wrong for this one.
    score -= dist(candidate, schismActive ? sideCentroid(s, actor) : centroid) * ai.clustering

    // 5b. And not onto somebody's head.
    //
    // The pull above is toward the middle of the raid and nothing was pushing
    // back, so every dodge ended a little tighter than the last and a
    // twenty-five man spent the fight as one body. This is the push back, and
    // it is deliberately weaker than everything above it: standing on a
    // friend is untidy, standing in fire is fatal, and a spacing term that
    // could outvote a mechanic would be a spacing term that killed people.
    //
    // It rides on the walk rather than asking for one, which is the whole
    // reason it is here and not in `outOfPosition`. Every version that made
    // crowding its own reason to move paid for the walk, and the walk is what
    // broke things — casts, melee uptime, three raid cells under their win
    // floor. A raid moves every few seconds anyway because a mechanic makes
    // it. This just aims that move a body's width off the nearest neighbour.
    score -= elbowRoom(s, actor, candidate)

    // 6. Do not run further than necessary.
    score -= dist(candidate, actor.pos) * 0.35

    // 7. Hugging the wall is bad; puddles there trap you.
    //
    // Measured off the room rather than off a radius. The two were the same
    // number while every fight was a disc, and in a long room they are not:
    // read as a distance from the middle, a body pressed against the side of
    // a hall is comfortably "inside the arena" and a body in the middle of it,
    // far down the long axis, is not. What the term means is how much floor
    // there is between here and the nearest wall, which is what `wallGap`
    // answers for any room. Candidates are pushed inside before they are
    // scored, so this measures the wall a body would actually end up against.
    const gap = wallGap(s.room, candidate)
    if (roomHasOutside(s.room)) {
      // On a platform the last lane is not an untidy place to stand, it is one
      // step from the end of the fight. Weighted with the shapes that kill --
      // the cone, the caving floor -- rather than with the wall, and graded
      // across the lane so a body pushed to the edge walks in rather than
      // along it.
      score -= Math.max(0, (EDGE_LAP - gap) / EDGE_LAP) * 1700
    } else {
      score -= Math.max(0, WALL_LAP - gap) * 2
    }

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
  // Nothing the party is steered by ever aims at a point off the floor.
  //
  // The rule the whole platform rests on: the fight may push a body over the
  // side, and the body may walk over it if a person is driving, but the AI
  // never chooses it. Without this an idle ring drawn around a boss standing
  // near the edge is a queue of casters walking into the air, and a death
  // nobody could have answered is not a mechanic.
  if (roomHasOutside(s.room)) pushInside(s.room, target, actor.radius)
  // Pinned bodies do not walk. The one mechanic in the game whose answer is
  // not a step, because it takes the step away.
  if (getAura(actor, 'spiked')) return
  const d = dist(actor.pos, target)
  if (d < 6) {
    actor.ai!.moveTarget = null
    return
  }

  const stepLen = actor.moveSpeed * DT * hasteOf(actor)
  const stepX = ((target.x - actor.pos.x) / d) * stepLen
  const stepY = ((target.y - actor.pos.y) / d) * stepLen
  actor.pos.x += stepX
  actor.pos.y += stepY
  // Held in, or dropped. In a room with a wall this is the clamp it always
  // was; on a platform a body that has walked off the floor falls, and the
  // party never walks off on purpose because the targets it is given are
  // pushed inside before the step is taken -- see below.
  holdOrFall(s, actor)
  // And out of anything it walked into. The step is handed over as well as
  // the position, because being pushed back along the radius costs the whole
  // step and leaves a body re-walking into the same rock forever; what it does
  // with it is slide.
  clearTerrain(s.obstacles, actor.pos, actor.radius, stepX, stepY)

  if (actor.castId) interruptCast(s, actor, 'moved')
}

// --- ability priorities -----------------------------------------------------

function useAbilities(s: SimState, actor: Actor, rng: Rng): void {
  // A body the fight has named is worth dropping a cast for, and only that is:
  // every other heal in the fight can be finished and then re-aimed, because
  // what it was answering is damage that has already landed.
  const rescue = rescueTarget(s, actor)
  // Only a cast with real time left on it: one that is about to land is faster
  // to finish than to start again.
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

/**
 * The health at which a body that is not holding the boss reaches for its
 * brace.
 *
 * By personality, since it is the same decision the reaction delay and the
 * mistake roll already model: the timid one presses it early and wastes it,
 * the greedy one presses it late and sometimes not at all. A single number
 * here would have been one more thing every party member does identically.
 */
function braceLine(actor: Actor): number {
  const personality = actor.ai?.personality
  if (personality === 'timid') return 0.55
  if (personality === 'greedy') return 0.3
  return 0.42
}

/**
 * Whether this one wants its brace up now.
 *
 * Read off its own health rather than off what the boss is casting. A tank
 * knows what is coming for it -- the slam is aimed at whoever is holding the
 * boss -- and nobody else does: what lands on a dealer is a floor it failed
 * to leave or a beat that hits everybody, and neither announces itself to one
 * body in particular. So the brace answers the thing that is already
 * happening, which is the health bar going down.
 */
function wantsBrace(actor: Actor): boolean {
  if (actor.role === 'tank') return false
  const kit = specFor(actor).abilities
  if (!kit.defensive) return false
  const ability = ABILITIES[kit.defensive]
  if (!ability?.offGcd) return false
  if ((actor.cooldowns[kit.defensive] ?? 0) > 0) return false
  return actor.alive && actor.hp < actor.maxHp * braceLine(actor)
}

/** Is there anything worth pressing that ignores the global cooldown? */
function canUseOffGcd(s: SimState, actor: Actor): boolean {
  const kit = specFor(actor).abilities
  // A brace is worth having up during a global as much as between two.
  if (wantsBrace(actor)) return true
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
  const near = nearEdgeOn(actor, target)
  if (near === 0) return false
  return dist(actor.pos, target.pos) < near
}

/**
 * The closest this one can stand to that one and still point something at it.
 *
 * Off the kit rather than the class, and measured to the target's centre,
 * because that is what the distance checks everywhere else are measured to: a
 * bow with a near edge of ninety cannot be drawn from ninety-one when the
 * thing it is aimed at is fifty wide.
 */
function nearEdgeOn(actor: Actor, target: Actor): number {
  const kit = specFor(actor).abilities
  const ids = [kit.filler, kit.overTime, kit.finisher].filter((id): id is string => id !== null)
  const near = Math.max(0, ...ids.map((id) => ABILITIES[id]?.minRange ?? 0))
  return near === 0 ? 0 : near + target.radius
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

function tankRotation(s: SimState, actor: Actor, rng: Rng, moving: boolean): void {
  const b = boss(s)
  const ai = actor.ai!
  const kit = specFor(actor).abilities

  if (mayStrike(actor, b) && tryCharge(s, actor, b, rng, moving)) return

  // The swap.
  //
  // The rule below deliberately refuses to taunt off another tank, because a
  // pair that trades on cooldown drags the boss through the melee all fight.
  // A stack of armour breaks is the one reason to do it anyway: the holder is
  // taking nearly double by the top of it, and the answer is the other tank,
  // not the healer. Only downward — taunting a fresher stack onto a heavier
  // one is the trade backwards.
  //
  // Two things stack on a tank now and the swelling is the sharper of them.
  // The armour break is a trade -- the holder takes nearly double and the
  // other tank is a better answer than the healer -- and missing it costs
  // health. The swelling is not a trade: the tenth kills whoever is holding it
  // and everybody standing near them, so nine is not a preference, it is the
  // last beat the swap can happen on. Both are read here because a tank
  // deciding to take the boss should be looking at everything already on the
  // body it is taking it from.
  const load = (
    a: Actor | null,
  ): { stacks: number; at: number; of: 'swelling' | 'slighted' } => {
    const swelling = a ? (getAura(a, 'swelling')?.stacks ?? 0) : 0
    // The slight is a count now, and reads like the other two: a tank three
    // slights in is most of the way to holding nothing, and the swap wants to
    // happen before the fifth rather than after the first.
    const slighted = a ? (getAura(a, 'slighted')?.stacks ?? 0) : 0
    // Whichever is nearest its own line, not whichever number is bigger: five
    // armour breaks and five swellings are not the same amount of trouble.
    const reads: Array<{ stacks: number; at: number; of: 'swelling' | 'slighted' }> = [
      { stacks: swelling, at: BLOAT_SWAP_AT, of: 'swelling' },
      { stacks: slighted, at: SLIGHT_MAX, of: 'slighted' },
    ]
    let worst = reads[0]!
    for (const read of reads) if (read.stacks / read.at > worst.stacks / worst.at) worst = read
    return worst
  }
  const mineNow = load(actor)
  if (kit.taunt && mineNow.stacks < mineNow.at) {
    const holder = topThreatTarget(s)
    const theirs = load(holder)
    const mine = getAura(actor, theirs.of)?.stacks ?? 0
    if (holder && holder.id !== actor.id && holder.role === 'tank' && theirs.stacks >= theirs.at && theirs.stacks > mine) {
      if (!rng.chance(ai.mistakeChance) && tryCast(s, actor, kit.taunt, b.id, rng, moving)) {
        say(s, actor, `Swapping — you are at ${theirs.stacks}`)
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
  if (!mayStrike(actor, b)) return

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

  // Its own skin first, and only when its own skin is the problem. A healer
  // that dies is every other health bar going down as well.
  if (wantsBrace(actor) && kit.defensive && !rng.chance(ai.mistakeChance)) {
    if (tryCast(s, actor, kit.defensive, actor.id, rng, moving)) return
  }

  // Above everything, including the emergency below it. The emergency is about
  // who is lowest and this is about who has been named, and the named are
  // hardly ever the lowest -- that is the whole difficulty of both mechanics
  // that use this channel. Fastest first rather than biggest: what a line
  // needs is a heal that has landed, and a bigger one that lands afterwards
  // has not.
  const called = rescueTarget(s, actor)
  if (called) {
    if (kit.finisher && (actor.cooldowns[kit.finisher] ?? 0) <= 0) {
      if (tryCast(s, actor, kit.finisher, called.id, rng, moving)) {
        say(s, actor, `${called.name} — getting you up`)
        return
      }
    }
    if (tryCast(s, actor, kit.filler, called.id, rng, moving)) return
  }

  const wounded = mostHurt(s)
  if (!wounded) return

  const ratio = wounded.hp / wounded.maxHp
  const powerLeft = actor.maxPower > 0 ? actor.power / actor.maxPower : 1

  // Timid healers panic earlier and burn mana; greedy ones let people ride low.
  const emergency = emergencyFor(actor)
  const topOff = topOffFor(actor)

  // The carrier, and only while nobody is actually in trouble. This is the one
  // heal in the game aimed at somebody who is fine, and it stays behind every
  // heal aimed at somebody who is not.
  const carrier = flushTarget(s, actor)
  if (carrier && ratio >= emergency) {
    if (tryCast(s, actor, kit.filler, carrier.id, rng, moving)) return
  }

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
  if (kit.attack && powerLeft > 0.55) {
    const target = strikeTarget(s, actor, quarry(s, actor))
    tryCast(s, actor, kit.attack, target.id, rng, moving)
  }
}

function dpsRotation(s: SimState, actor: Actor, rng: Rng, moving: boolean): void {
  const b = boss(s)
  if (!b.alive) return
  const kit = specFor(actor).abilities

  // The brace, before anything it might rather be doing. It is off the global
  // and free, so the only thing pressing it costs is the tick -- and a dealer
  // that dies at forty percent deals nothing for the rest of the pull.
  if (wantsBrace(actor) && kit.defensive && !rng.chance(actor.ai!.mistakeChance)) {
    if (tryCast(s, actor, kit.defensive, actor.id, rng, moving)) return
  }

  // Adds first: they beeline for whoever is closest and shred a healer. The
  // two exceptions to that are decisions, and they are made in `readTheField`.
  let target = strikeTarget(s, actor, quarry(s, actor))

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

import {
  readable,
  BLIGHT_RELIEF,
  BLIGHT_TICK,
  COLDFLAME_ARMS,
  COLDFLAME_CRAWL,
  COLDFLAME_LINGER,
  COLDFLAME_SPIN,
  COLDFLAME_STORM_BEAT,
  COLDFLAME_STORM_LINGER,
  COLDFLAME_RADIUS,
  COLDFLAME_REACH,
  COLDFLAME_STEP,
  COLDFLAME_TELEGRAPH,
  BLOAT_BURST,
  BLOAT_POWER,
  BLOAT_BURST_AT,
  BLOAT_SPLASH,
  INHALE_HASTE,
  DECAY_DAMAGE,
  DECAY_LINGER,
  DECAY_RADIUS,
  EMPOWER_HEALTH,
  EMPOWER_POWER,
  FROSTBOLT_CAST,
  FROSTBOLT_DAMAGE,
  SHADE_REACH,
  SHADE_SPEED,
  SLIGHT_MAX,
  STORM_BITE,
  STORM_REACH,
  STORM_REPICK,
  VOLLEY_DAMAGE,
  STORM_SPEED,
  STORM_TICK,
  INHALE_HELD_ALONE,
  INHALE_MAX,
  INHALE_POWER,
  INOCULATED_SHARE,
  SPORE_REACH,
  PUNGENT_PER_BREATH,
  DT,
  MELEE_RANGE,
  PUDDLE_TELEGRAPH,
  TURN_RATE,
  SPILL_RADIUS,
  SPILL_DAMAGE,
  HEALTH,
  SLIME_PATCH,
  SLIME_ARC,
  SLIME_DRY,
  SLIME_TELEGRAPH,
  SLIME_LINGER,
  SLIME_TICK,
  CAUSTIC_RADIUS,
  CAUSTIC_TELEGRAPH,
  CAUSTIC_LANDING,
  CAUSTIC_TICK,
  CAUSTIC_LINGER,
  HOUND_REACH,
  HOUND_TICK,
  HOUND_SPEED,
  GATHER_RADIUS,
  GATHER_TELEGRAPH,
  GATHER_PER_BODY,
  DECANT_RADIUS,
  DECANT_COUNT,
  DECANT_DAMAGE,
  DECANT_TICK,
  REAGENT_POWER,
  REAGENT_MAX,
  REAGENT_BURST,
  REAGENT_BURST_REACH,
  SPRAY_HALF_WIDTH,
  SPRAY_RANGE,
  SPRAY_DAMAGE,
  SPRAY_CAST,
  OOZE_DAMAGE,
  OOZE_HP_PER_BODY,
  OOZE_SPEED,
  MERGE_REACH,
  MERGE_BURST_AT,
  MERGE_BURST_REACH,
  MERGE_BURST_DAMAGE,
  OOZE_CAP,
  FLOOD_REACH,
  FLOOD_SPREAD,
  FLOOD_LINGER,
  ENGULF_REACH,
  ENGULF_POWER,
  ENGULF_MAX,
  ENGULF_BURST,
  ENGULF_BURST_REACH,
  FESTER_BITE,
  GORGE_RADIUS,
  GORGE_BURST,
} from './constants'
import { clearTerrain } from './battleground'
import {
  AURA_DURATION,
  addAura,
  adds,
  getAura,
  pushEffect,
  applyDamage,
  spawnBolt,
  PROJECTILE_SPEED,
  boss,
  dist,
  livingParty,
  say,
  stackAura,
  topThreatTarget,
  fightScale,
  mechanicScale,
  heraldUp,
  holdOrFall,
  hasteOf,
} from './combat'
import { pushInside, roomReach } from './room'
import type { Rng } from './rng'
import { BOSS_ID } from './state'
import { DIFFICULTIES } from './classes'
import {
  encounterAt,
  encounterKit,
  gated,
  lineFor,
  MECHANIC_IDS,
  openDoors,
  type Encounter,
  type MechanicId,
  type PhaseTiming,
} from './encounters'
import { affixAddWave, affixEnrage, affixLinger, affixTiming } from './affix'
import type { Actor, GroundEffect, ProjectileKind, SimState, Vec2 } from './types'

/**
 * The boss is deliberately NOT an AI.
 *
 * A raid boss that improvises cannot be learned, and learning the script is
 * the entire point of the genre. So this is a fixed timeline with hard phase
 * transitions; the only randomness is *who* gets targeted, which keeps pulls
 * from being identical without making them unlearnable.
 *
 * Each mechanic asks for a different thing, which is what stops the fight
 * being one dodge repeated: puddles ask you to leave where you stand, the
 * breath asks you to get behind, the shockwave asks you to come *in*, spread
 * asks you to separate, adds ask the dealers to switch targets, and the tide
 * asks nothing of you at all except that the healer kept up.
 *
 * Which of them a given boss leans on, and how hard, is the table in
 * `encounters.ts`. This file stays the one copy of what each mechanic does:
 * a second boss written as a second script would be a second shockwave rule
 * to keep correct, and that one took three attempts.
 */
function fight(s: SimState): Encounter {
  return encounterAt(s.encounter)
}

/** Applies the difficulty's cadence to a phase's timers. */
/**
 * Worked out once a fight rather than once a tick.
 *
 * Everything `scaled` reads is fixed for the length of a pull — the roster's
 * size, the difficulty, the plan, the mechanic a measurement narrowed to — and
 * the only thing that moves is which phase's table it was handed, which is one
 * of three objects that already exist. So the answer is a pure function of a
 * pair that changes three times in two hundred seconds, and it was being
 * rebuilt six thousand times: two fresh thirty-key records and two object
 * spreads, every tick, for a number that had not moved.
 *
 * Measured at four percent of the simulation's whole running time, before
 * counting what the garbage collector was doing with the wreckage. It is the
 * only entry on the profile that buys nothing at all — every other cost up
 * there is the fight actually being fought.
 *
 * Keyed off the state object rather than stored on it, so nothing about the
 * shape of a `SimState` changes and nothing has to remember to clear it: a
 * pull that ends takes its cache with it when it is collected.
 */
const timings = new WeakMap<SimState, Map<PhaseTiming, PhaseTiming>>()

function scaled(base: PhaseTiming, s: SimState): PhaseTiming {
  let mine = timings.get(s)
  if (!mine) {
    mine = new Map()
    timings.set(s, mine)
  }
  const had = mine.get(base)
  if (had) return had
  const made = computeScaled(base, s)
  mine.set(base, made)
  return made
}

/**
 * A table of cadences laid over a boss's own, for `SimState.imposed`.
 *
 * Everything not named is switched off, so an imposed fight is exactly what
 * was asked for and none of the boss's own -- the check that asks for the
 * drowning wants the drowning, not the drowning plus whatever the Bonegrinder
 * throws in the same second. The swing and the slam are left alone: those are
 * not mechanics, they are the boss hitting whoever is holding it.
 *
 * Later phases tighten the way an authored boss's own tables do.
 */
function impose(
  base: PhaseTiming,
  every: Partial<Record<MechanicId, number>>,
  phase: number,
): PhaseTiming {
  const tighten = phase === 1 ? 1 : phase === 2 ? 0.84 : 0.7
  const cadence = {} as Record<MechanicId, number>
  for (const id of MECHANIC_IDS) cadence[id] = (every[id] ?? 0) * tighten
  return { ...base, ...cadence }
}

function computeScaled(base: PhaseTiming, s: SimState): PhaseTiming {
  // A boss owns more mechanics than any one raid meets, and how many of them
  // tonight is a question of who turned up and what they picked at the door.
  // That is the ladder, and every fight in the game climbs it now -- the
  // day's run included, which used to roll its own kit instead.
  //
  // `imposed` is what is left of that path. Nothing in the game sets it; the
  // render check does, to reach a mechanic no boss owns any more, and it goes
  // when the last of those does. See `SimState.imposed`.
  const bought = encounterKit(fight(s), s.party.length, s.difficulty)
  const kit = s.only ? bought.filter((m) => m === s.only) : bought
  // `bought.length`, not `kit.length` -- narrowing to one mechanic is a filter
  // on what fires, not a discount on how many rungs the raid paid for.
  const timing = s.imposed ? impose(base, s.imposed, s.phase) : gated(base, kit, bought.length)
  const cadence = DIFFICULTIES[s.difficulty].cadence
  if (cadence === 1) return timing
  // Over every mechanic, plus the two timers that are not mechanics. This was
  // a list of five that nobody extended as mechanics were added, which no
  // fight noticed only because heroic's cadence is currently 1 and the whole
  // branch is skipped. Left as it was it would have come back as a difficulty
  // that speeds up a third of a boss.
  const faster = {} as Record<MechanicId, number>
  for (const id of MECHANIC_IDS) faster[id] = timing[id] * cadence
  return { ...timing, ...faster, slam: timing.slam * cadence, raid: timing.raid * cadence }
}

/**
 * How fast the floor gives back what it took.
 *
 * One place rather than at each of the twenty `lingering:` values, because
 * what lengthens ground is every hazard rather than a chosen few -- and
 * because a rule written into twenty literals is a rule that gets half applied
 * the next time somebody adds a hazard. The count runs slower, so the same
 * cast holds the same ground for longer.
 *
 * The day's twist rides here too, for exactly that reason. It was multiplied
 * into three `lingering:` values at the point the hazard was made -- the pool,
 * the spire and the brand -- and all three are retiring, so an affix whose
 * whole content is "ground stays" had quietly stopped touching anything the
 * live roster throws.
 */
function lingerStep(s: SimState): number {
  return DT / (DIFFICULTIES[s.difficulty].linger * affixLinger(s.affix))
}

/** Every point of boss damage passes through here. */
function hit(s: SimState, amount: number): number {
  return amount * fightScale(s)
}

/** The same, for anything the floor does. */
function mechanic(s: SimState, amount: number): number {
  return amount * mechanicScale(s)
}

/**
 * Swings a body's bearing toward the one it wants, at the rate it turns.
 *
 * A general helper that lived inside a mechanic's section because that
 * mechanic was what made bearings matter. It outlives it: the adds read it,
 * the party AI reads it, and a body that snapped instantly to a new facing
 * would make the turn free wherever one is ever asked for again.
 */
export function turnToward(actor: Actor, want: number): void {
  let delta = want - actor.facing
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  actor.facing += Math.max(-TURN_RATE * DT, Math.min(TURN_RATE * DT, delta))
}


const SLAM_CAST = readable(2)


export const BREATH_CAST = readable(1.9)


/** How far off the stalker starts. See `spawnStalker`. */
export const SHOCKWAVE_START = 40


/** Whether this spot is in the ring's gap, and so safe from it. */

/**
 * How much wider a fixed shape has to be aimed at a bigger raid.
 *
 * Everything dropped *on people* already scales with the roster — puddles per
 * cast, spread marks, add waves — because a fixed number of them across
 * twenty-five means any one player is almost never the target. The two shapes
 * aimed at the *arena* rather than at anybody had no such rule: a cone of a
 * fixed angle catches roughly the same fraction of a raid whatever its size.
 *
 * That is not "slightly easier", because everything else about a bigger raid
 * is slack. A ten-man fields the same one healer per five bodies a five-man
 * does and *two tanks*, and the boss's weapon and its slam are one target's
 * worth of damage whoever is holding it — so a ten-man covers the same raid
 * damage with the same healing and half the tank load.
 *
 * Measured, that made the one boss built entirely out of arena shapes — the
 * Tidebreaker, a cone and a ring — the boss that got *easier* the more people
 * turned up: every ten-man and twenty-five-man pull on normal won, against
 * fifty-five in a hundred at five. Its ten-man was eating sixty-three
 * mechanic hits a pull, losing one body to them, and finishing with the
 * healers on eleven percent of their mana. Nothing about the boss's own
 * numbers moved it — the health, the weapon, the unavoidable damage and the
 * floor multiplier were each tried and each moved all three sizes together.
 *
 * So the shapes grow with the raid — but only the cone does, now.
 *
 * The ring was given the same treatment and it was the wrong instrument. A
 * band is answered by running *in*, so a wider one only shrinks the pocket,
 * and a pocket has a floor nobody can tune past: the raid operates at a
 * spread of about ninety whatever its size, and twenty-five bodies of radius
 * seventeen need ninety-four of floor before they are standing on each other.
 * The table had ten at 96 and twenty-five at 104 — pockets of 104 and 96,
 * both of them at or under that number — and the result was not difficulty,
 * it was a coin landing on its edge. Measured, moving the ten-man's band from
 * 96 to 80 took its heroic pull from 30% to 100%, and the twenty-five's from
 * 104 to 85 took it from 5% to 80%. Neither is a dial; both are a cliff, and
 * a cliff cannot be the thing a difficulty rests on.
 *
 * Nor could the two knobs beside it. The telegraph moved the ten-man heroic
 * between 20 and 40 percent and no further, and halving the ring's damage
 * outright moved it from 30 to 50 — while deleting the mechanic moved it to
 * 100. Most of what the ring costs is not its damage, it is the running: two
 * healers who have to move are two healers not casting, which is why the
 * ten-man felt it hardest.
 *
 * So the ring is one number for every size, set wide enough that being caught
 * by it is a mistake rather than a seating problem, and the Tidebreaker's
 * difficulty was moved into its own `mechanicDamage`, where it can be turned
 * a percent at a time.
 *
 * The cone keeps its table, because it has the opposite shape: past about
 * 0.85 radians it stops being a cone and becomes a raid-wide hit — twenty-five
 * bodies do not spread far enough to get out of one — so it is banded rather
 * than interpolated, the sizes being three fixed rosters rather than a slider.
 *
 * And not the sweep, which already scales and by a better rule than either: it
 * catches whoever is in reach, and who is in reach is the melee, and a bigger
 * raid brings more of them. Multiplying its range as well took it past the
 * arena's own radius, which is not a wider sweep, it is a sweep with no
 * outside.
 */





/**
 * A thrall's health, against the raid that has to kill it.
 *
 * The wave count already grows with the roster; each body in it did not. A
 * five-man puts about five hundred damage a second into its one thrall and a
 * twenty-five man two and a half thousand into its four, so the wave is the
 * same two seconds of work either way — the mechanic grew in number and
 * stayed the same size, which is the same thing as not growing.
 *
 * Gently, and not by headcount: the count already carries that, and scaling
 * both would square it.
 */
const ADD_HP = 1200
const ADD_HP_SCALE = 0.3

function addHealth(s: SimState): number {
  return Math.round(ADD_HP * (livingParty(s).length / 5) ** ADD_HP_SCALE)
}

const ADD_DAMAGE = 70

/**
 * What the interlude's elite hits for.
 *
 * More than a thrall and less than the boss whose place it is taking. It has
 * one job the thralls do not: while it stands, it is the only thing on the
 * floor still doing damage that a tank has to answer.
 */
const HERALD_DAMAGE = 150

/** How far from the boss the interlude's elite walks in, in world units. */
const HERALD_WALK_IN = 150
const ADD_SWING = 1.8

export function updateBoss(s: SimState, rng: Rng): void {
  const b = boss(s)
  if (!b.alive) return

  const encounter = fight(s)
  advancePhase(s, b)
  // The day's twist lands on the timers before anything reads them, so every
  // mechanic downstream sees one set of numbers rather than each remembering
  // to ask.
  const timing = affixTiming(scaled(encounter.phases[s.phase]!, s), s.affix)

  const enrageAt = encounter.enrage - affixEnrage(s.affix)
  if (s.time >= enrageAt && !b.auras.some((a) => a.id === 'enrage')) {
    addAura(b, 'enrage', b.id)
    s.chat.push({ id: s.nextObjectId++, speaker: b.name, text: 'ENRAGE', age: 0 })
  }

  // Nothing is holding it while it storms, which is the mechanic: it has let
  // go, so the tank has nothing to hold and the raid has no front to stand
  // behind. `updateStorm` does the walking for that stretch.
  const storming = getAura(b, 'storming') !== undefined
  const target = storming ? null : topThreatTarget(s)
  faceTarget(s, b, target)

  if (target && !b.castId) {
    const d = dist(b.pos, target.pos)
    if (d > MELEE_RANGE) {
      b.pos.x += ((target.pos.x - b.pos.x) / d) * b.moveSpeed * DT
      b.pos.y += ((target.pos.y - b.pos.y) / d) * b.moveSpeed * DT
      pushInside(s.room, b.pos, b.radius)
    }
  }

  // While its herald stands, the boss is doing nothing but waiting.
  //
  // This is what makes the interlude a change of shape rather than a tax. The
  // first version left every scheduler running, so the floor kept filling
  // while the raid had somewhere else to be, and the raid simply lost: across
  // the four bosses that have one, twenty-five heroic fell from a 70-98% pull
  // to 0-43%. Nothing about that was the elite being hard. It was sixty
  // seconds of a boss fight happening beside a fight the raid was told to have
  // instead.
  //
  // Turned away, the beat is the one the fight did not have: the floor goes
  // quiet, and what is left is bodies that walk at you. Whatever else it is
  // worth, it is a different thirty seconds from the two hundred around it.
  //
  // The swing stays. A boss that stopped hitting the tank would be a boss that
  // handed the raid a rest, and the tank standing in front of it is the one
  // thing about this fight that has not changed.
  autoAttack(s, b, target, timing)
  if (heraldUp(s)) {
    // The steady raid-wide damage stays; the floor is what goes quiet.
    //
    // Silencing everything was the other end of the same mistake as silencing
    // nothing. With the whole boss switched off, the interlude was a rest — a
    // minute with no floor and nothing for a healer to do — and the four
    // fights that have one went to 90-100% at every size, including two that
    // were meant to be walls. What the beat should change is what the raid is
    // being asked, not whether it is being asked anything.
    scheduleRaidHit(s, timing)
    updateAdds(s)
    return
  }

  scheduleSlam(s, b, target, timing)
  scheduleBlight(s, b, timing)
  scheduleInhale(s, b, timing)
  schedulePungent(s, b, timing)
  scheduleDecay(s, b, rng, timing)
  scheduleFrostbolt(s, b, timing)
  scheduleVolley(s, b, timing)
  scheduleShade(s, b, rng, timing)
  updateShades(s)
  scheduleSlight(s, b, timing)
  scheduleEmpower(s, b, rng, timing)
  scheduleDominate(s, b, rng, timing)
  scheduleStorm(s, b, timing)
  updateStorm(s, b)
  scheduleSpore(s, b, rng, timing)
  scheduleVileGas(s, b, rng, timing)
  scheduleBloat(s, b, timing)
  scheduleColdflame(s, b, rng, timing)
  scheduleSpikes(s, b, rng, timing)
  scheduleRaidHit(s, timing)
  scheduleAdds(s, b, rng, timing)
  scheduleSpill(s, b, rng, timing)
  scheduleFester(s, b, rng, timing)
  scheduleGorge(s, b, target, timing)
  scheduleChampion(s, b, rng, timing)
  scheduleSpray(s, b, timing)
  scheduleInfection(s, b, rng, timing)
  scheduleFlood(s, b, timing)
  scheduleEngulf(s, b, timing)
  scheduleCaustic(s, b, rng, timing)
  scheduleHound(s, b, rng, timing)
  scheduleGather(s, b, timing)
  scheduleDecant(s, b, rng, timing)
  scheduleReagent(s, b, timing)
  scheduleSlime(s, b, rng, timing)
  updateHounds(s)

  updateAdds(s)
  updateOozes(s)
}

/**
 * What a phase break looks like.
 *
 * It had a line and a sound and nothing else, which made the moment the fight
 * changes the quietest thing in it. A crit-weight ring off the boss, in the
 * boss's own colour by way of its cast.
 */
function phaseBreak(s: SimState, b: Actor): void {
  // Sized off the room rather than off a number, so the fight's one signposted
  // turn stayed the same share of the floor when the floor doubled.
  pushEffect(s, 'impact', b.pos, { abilityId: 'boss_phase', power: roomReach(s.room) * 2, crit: true })
  s.raidFlash = 0.5
  s.phaseAt = s.time
}

/**
 * The interlude, at the moment the boss first gives ground.
 *
 * Hung on the phase break rather than on a timer of its own because the break
 * is already the fight's one signposted turn — it has a line, a sound and a
 * ring, and a second beat that needs all three would be competing with it.
 *
 * Alone, and that was decided for us. It first walked in with a handful of
 * thralls for company, which read well and broke the rule this game is built
 * on: no fight repeats another fight's idea, and a thrall on the floor is the
 * Watcher's. Two checks said so on the same run — one that the Warden had
 * fired an `adds` it does not own, one that a `boss_thrall` had been drawn on
 * a boss with no thralls. They are right. The elite is the new thing here; it
 * does not need to borrow somebody else's.
 */
function summonHerald(s: SimState, b: Actor): void {
  const plan = fight(s).herald
  if (!plan) return

  s.chat.push({ id: s.nextObjectId++, speaker: b.name, text: plan.line, age: 0 })
  s.sounds.push('telegraph')

  // Off to one side rather than on top of the raid, and not so far off that
  // reaching it is the mechanic. It first arrived at the arena's edge, which
  // reads well and quietly taxes exactly one half of the raid: melee walk to
  // it while everything at range opens fire from where it already stood.
  // Measured, that alone pushed the gap between the best and worst damage spec
  // past what `rendercheck` allows, with both melee specs at the bottom.
  const away = Math.atan2(b.pos.y, b.pos.x) + Math.PI
  const at = { x: Math.cos(away) * HERALD_WALK_IN, y: Math.sin(away) * HERALD_WALK_IN }
  pushInside(s.room, at, 30)

  // Read back off the boss rather than recomputed from the encounter. What
  // `createState` took off is a share of a number scaled by the size and the
  // difficulty, and the boss's own bar is the one place that share is
  // guaranteed to still be true of.
  const hp = Math.round((b.maxHp * plan.share) / (1 - plan.share))
  const herald = makeHerald(s.nextObjectId++, at.x, at.y, plan.name, Math.max(1, hp))
  s.actors.push(herald)

}

function advancePhase(s: SimState, b: Actor): void {
  const encounter = fight(s)
  const ratio = b.hp / b.maxHp

  if (s.phase === 1 && ratio <= encounter.phaseTwoHp) {
    s.phase = 2
    s.sounds.push('phase')
    phaseBreak(s, b)
    s.chat.push({ id: s.nextObjectId++, speaker: b.name, text: encounter.lines.phaseTwo, age: 0 })
    // Pulled in rather than reset: a phase break whose new cadence waits out
    // the old timers is a phase break nobody notices.
    s.nextSlam = Math.min(s.nextSlam, 5)
    // Only for what this boss actually does *tonight*. Handing a timer to a
    // fight that has no such mechanic is harmless today, since the scheduler
    // checks the cadence, and is exactly the kind of thing that stops being
    // harmless. Read through `scaled` rather than off the table, so a mechanic
    // the ladder did not buy is as absent here as it is there.
    //
    // Over every mechanic rather than the two that used to be named here. Both
    // of those were retired with the fights that sold them, which left this
    // pulling in nothing at all -- and a hand-written list of ids in this file
    // has been wrong every time it has been written.
    //
    // Clamped to the new cadence and no further. The first version of this
    // halved it, which is not what the note above asks for: it says a timer
    // left running past the new cadence is a phase break nobody notices, not
    // that the fight should speed up twice at every break. Halved, the wave
    // arrived often enough that a second one landed on the first, and the
    // raid's call to kill the empowered body kept being replaced by the next
    // one -- thirteen of fifteen of them died after their whole wave, which
    // is the exact failure the call exists to prevent.
    const next = scaled(encounter.phases[2]!, s)
    for (const id of MECHANIC_IDS) {
      if (next[id] > 0) s.next[id] = Math.min(s.next[id], next[id])
    }
    summonHerald(s, b)
    return
  }

  if (s.phase === 2 && ratio <= encounter.phaseThreeHp) {
    s.phase = 3
    s.sounds.push('phase')
    phaseBreak(s, b)
    s.chat.push({ id: s.nextObjectId++, speaker: b.name, text: encounter.lines.phaseThree, age: 0 })
    const next = scaled(encounter.phases[3]!, s)
    for (const id of MECHANIC_IDS) {
      if (next[id] > 0) s.next[id] = Math.min(s.next[id], next[id])
    }
  }
}

/** Turns toward the threat leader. */
function faceTarget(s: SimState, b: Actor, target: Actor | null): void {
  if (!target) return
  const want = Math.atan2(target.pos.y - b.pos.y, target.pos.x - b.pos.x)
  let delta = want - s.bossFacing
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  // Turning slowly is what makes getting behind it possible at all.
  s.bossFacing += Math.max(-2.6 * DT, Math.min(2.6 * DT, delta))
  // The same bearing, written where every other body keeps it.
  //
  // The boss's is held on the state rather than on the actor because the cone
  // mechanics were written against it, and the renderer asks each body for its
  // own `facing` — so the boss answered nought for every fight it has ever
  // been in, and stood facing right while walking anywhere else. Worse than
  // ugly: getting behind it is a thing the player is asked to do, and the body
  // was disagreeing with the cone about where its back was.
  b.facing = s.bossFacing
}

function autoAttack(s: SimState, b: Actor, target: Actor | null, timing: PhaseTiming): void {
  b.swingTimer -= DT
  if (b.swingTimer > 0 || !target || b.castId) return

  if (dist(b.pos, target.pos) <= MELEE_RANGE + target.radius) {
    // Everything the boss has drunk, and everything the body in front of it is
    // swollen with, lands here. Both are trades the fight makes without asking
    // anybody's permission: the breath in buys the raid relief and pays for it
    // out of the tank, and the swelling buys the tank damage and pays for it
    // with the tank. Neither would be a mechanic if it only showed up as a
    // number on a screen -- it has to arrive as the tank's health bar moving
    // faster than the healers expected.
    const breaths = getAura(b, 'gorged')?.stacks ?? 0
    const swollen = getAura(target, 'swelling')?.stacks ?? 0
    const damage = hit(
      s,
      fight(s).swingDamage *
        (1 + breaths * INHALE_POWER) *
        (1 + swollen * BLOAT_POWER) *
        gaugePower(s) *
        engulfPower(s) *
        reagentPower(s),
    )
    applyDamage(s, target, damage, 'physical', { sourceId: b.id })
    // And a share of it onto whoever is wearing the mark, wherever they are
    // standing. This is what makes the mark something the healers hold rather
    // than a label: it is a second tank's worth of attrition on a body that is
    // not tanking, and it does not stop.
    markShare(s, b, target, damage, CHAMPION_SPLASH, false)
    // The party's weapons have always drawn their swing and their landing.
    // The boss's did neither, which is most of why a fight it was winning
    // looked like nothing was happening.
    const facing = Math.atan2(target.pos.y - b.pos.y, target.pos.x - b.pos.x)
    pushEffect(s, 'swing', b.pos, { angle: facing })
    pushEffect(s, 'impact', target.pos, { power: damage, angle: facing })
    // And faster for every breath, which is the other half of the trade.
    b.swingTimer = timing.swing / (1 + (getAura(b, 'gorged')?.stacks ?? 0) * INHALE_HASTE)
  } else {
    b.swingTimer = 0.2
  }
}

function scheduleSlam(s: SimState, b: Actor, target: Actor | null, timing: PhaseTiming): void {
  if (timing.slam <= 0) return
  s.nextSlam -= DT
  if (s.nextSlam > 0 || b.castId) return

  // Not at nobody.
  //
  // `target` is whoever holds the boss, and it is null for exactly one reason:
  // the boss has let go and is storming. The cast went out anyway -- twice a
  // storm, measured -- so the bar over a thing that had stopped tanking read
  // SABER LASH at a body it was not looking at, and then landed on nothing.
  // The original casts nothing at all while it whirls, and a cast bar naming
  // an attack that cannot arrive is worse than the silence.
  if (!target) return

  b.castId = 'boss_slam'
  // The same gathering ring every caster in the game gets when it starts a
  // cast. The boss was setting its cast bar by hand and never got one.
  pushEffect(s, 'cast', b.pos, { abilityId: 'boss_slam' })
  b.castRemaining = SLAM_CAST
  b.castTotal = SLAM_CAST
  b.castTargetId = target ? target.id : null
  s.nextSlam = timing.slam
}

/**
 * A line of cold laid outward from the boss, lit one patch at a time.
 *
 * The whole line is placed in one go and the crawl is written into the
 * telegraphs: patch `i` counts down `COLDFLAME_CRAWL` seconds later than the
 * one inside it, so what the floor shows is a flame walking out along a
 * bearing. Placed at once rather than emitted over time because a hazard that
 * does not exist yet is a hazard the AI cannot path around and the player
 * cannot read ahead of -- and reading ahead of it is the entire answer.
 *
 * Circles, not a swept rectangle. The floor already knows how to draw a
 * circle, the AI already knows how to leave one, and `isSpotSafe` already
 * refuses one; a new shape would have wanted all three written again to say
 * the same thing. What a person answers here is one patch about to reach
 * them, and a line is only what a row of those looks like from above.
 */
/**
 * The room, the boss drinking it, and the boss giving it back.
 *
 * One idea in three mechanics, and they are scheduled together because they
 * only mean anything together. The blight is the air: a steady bill on
 * everybody that the raid cannot dodge and is not meant to, which makes it the
 * only thing on this boss that is a clock rather than an event. Each breath in
 * takes a share of that bill off the raid and puts it on whoever the boss is
 * hitting. The breath out hands back everything taken, to everybody, and is
 * lethal to a raid that never stood in a spore.
 */
function scheduleBlight(s: SimState, b: Actor, timing: PhaseTiming): void {
  if (timing.blight <= 0) return
  s.next.blight -= DT
  if (s.next.blight > 0) return
  s.next.blight = timing.blight

  // Thinner for every breath the boss has taken. The raid feels the fight get
  // easier while the thing in front of it gets worse, which is the trade the
  // whole boss is built on -- and it has to be felt on the healers rather than
  // announced, or it is a line of chat instead of a mechanic.
  const breaths = getAura(b, 'gorged')?.stacks ?? 0
  const share = Math.max(0, 1 - breaths * BLIGHT_RELIEF)
  if (share <= 0) return

  for (const a of livingParty(s)) {
    const bite = mechanic(s, BLIGHT_TICK * share)
    applyDamage(s, a, bite, 'magic', { sourceId: b.id, mechanic: 'blight' })
    // Drawn on every body it touches, which is everybody. Without this the
    // air was the one mechanic in the game that left no mark at all: a
    // health bar sliding with nothing on screen saying why, and a check that
    // asks whether a boss throws what it sells could not see it either.
    pushEffect(s, 'impact', a.pos, { abilityId: 'boss_blight', power: bite })
  }
  s.sounds.push('raid')
}

function scheduleInhale(s: SimState, b: Actor, timing: PhaseTiming): void {
  if (timing.inhale <= 0) return
  s.next.inhale -= DT
  if (s.next.inhale > 0) return
  s.next.inhale = timing.inhale

  // Full is full, and how full depends on whether tonight's kit sold the
  // breath out. See `INHALE_HELD_ALONE`.
  const cap = encounterKit(fight(s), s.party.length, s.difficulty).includes('pungent')
    ? INHALE_MAX
    : INHALE_HELD_ALONE
  if ((getAura(b, 'gorged')?.stacks ?? 0) >= cap) return
  stackAura(b, 'gorged', b.id)
  say(s, b, lineFor(fight(s), 'inhale'))
  s.sounds.push('telegraph')
  pushEffect(s, 'cast', b.pos, { abilityId: 'boss_inhale' })
}

/**
 * The breath out, driven by the count rather than by a clock of its own.
 *
 * It used to have its own cadence, and the two timers could not be made to
 * agree: the ratio between them sat a hair over two in every phase, so the
 * third breath never happened — not rarely, never — and `INHALE_MAX = 3` was a
 * ceiling nobody could reach. Every comment on this fight, including the one
 * on this mechanic, describes a count that fills to three and empties; the
 * fight itself was a fixed bill on a fixed clock wearing a stack's clothes.
 *
 * So the stack is the clock. It goes off when the boss is full, and the row on
 * the phase table is a ceiling under it rather than a cadence: if a raid is
 * somehow still short of full after that long, it goes anyway, so a short pull
 * cannot miss the mechanic the fight is about. In practice the count gets
 * there first — the check downstairs measures that every breath out is a
 * breath out at three.
 */
function schedulePungent(s: SimState, b: Actor, timing: PhaseTiming): void {
  if (timing.pungent <= 0) return
  s.next.pungent -= DT

  const breaths = getAura(b, 'gorged')?.stacks ?? 0
  const full = breaths >= INHALE_MAX
  if (!full && s.next.pungent > 0) return
  s.next.pungent = timing.pungent

  // Nothing taken, nothing to give back. Not a wasted cast: it is the raid
  // having outrun the mechanic, which is a thing the fight should let happen.
  if (breaths <= 0) return

  say(s, b, lineFor(fight(s), 'pungent'))
  s.sounds.push('raid')
  const bill = mechanic(s, PUNGENT_PER_BREATH * breaths)
  for (const a of livingParty(s)) {
    // What standing in somebody's spore was for, forty seconds ago.
    const covered = getAura(a, 'inoculated') !== undefined
    applyDamage(s, a, covered ? bill * INOCULATED_SHARE : bill, 'magic', {
      sourceId: b.id,
      mechanic: 'pungent',
    })
    pushEffect(s, 'impact', a.pos, { abilityId: 'boss_pungent', power: bill })
  }
  // Emptied. The count starts again, which is what makes the breaths in
  // between a thing to count rather than a thing that happened once.
  b.auras = b.auras.filter((au) => au.id !== 'gorged')
}

/**
 * A spore on somebody, and the raid coming to stand in it.
 *
 * The only demand in this game answered by arriving. Everything else the fight
 * puts on a person is answered by that person leaving, or by everybody else
 * leaving them alone; this one is answered by walking toward the marked body
 * and being there when it goes.
 *
 * What it hands back is not survival now. It is survival forty seconds from
 * now, against a mechanic that has not happened yet -- which is why the two of
 * them are linked in `REQUIRES` and why a fight is not allowed to sell the
 * breath out without this.
 */
/**
 * The boss letting go and wandering.
 *
 * For as long as it is up there is no tank and no front: it drops whoever was
 * holding it, walks a circuit of its own, and bills everybody it passes. That
 * is the whole of it, and being the whole of it is the point -- this is the
 * first thing a raid meets in this game, and what it teaches is the one rule
 * everything else is built on top of. A big thing is coming; be somewhere
 * else.
 */
/**
 * Ground that has gone over, and stays gone.
 *
 * The plainest mechanic in the game and the reason it is on this boss: every
 * other thing this one does is about who is holding what, so without this
 * there would be nothing here a player answers by looking at the floor.
 */
function scheduleDecay(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.decay <= 0) return
  s.next.decay -= DT
  if (s.next.decay > 0) return
  s.next.decay = timing.decay

  const victims = livingParty(s)
  if (victims.length === 0) return
  const at = rng.pick(victims)
  const pos = { x: at.pos.x + rng.range(-30, 30), y: at.pos.y + rng.range(-30, 30) }
  pushInside(s.room, pos, DECAY_RADIUS)
  s.ground.push({
    ...blankGround(s),
    kind: 'decay',
    pos,
    radius: DECAY_RADIUS,
    telegraph: PUDDLE_TELEGRAPH,
    // It stays, which is what separates it from a pool. A pool is a moment to
    // be elsewhere; by the third of these the fight is being had in a smaller
    // room than it started in.
    lingering: DECAY_LINGER,
    damage: DECAY_DAMAGE,
    detonated: false,
  })
  say(s, b, lineFor(fight(s), 'decay'))
  s.sounds.push('telegraph')
}

/**
 * A shard aimed at whoever is holding it, which somebody has to cut.
 *
 * The same shape as the note the Choir sings, and a different question. That
 * one names a body at random and asks whether the raid noticed; this one
 * always goes to the same place and asks whether anybody is watching the
 * health bar everybody is already watching. Uncut it is most of a tank.
 */
function scheduleFrostbolt(s: SimState, b: Actor, timing: PhaseTiming): void {
  if (timing.frostbolt <= 0) return
  if (b.castId) return
  s.next.frostbolt -= DT
  if (s.next.frostbolt > 0) return
  s.next.frostbolt = timing.frostbolt

  const held = topThreatTarget(s)
  if (!held) return
  b.castId = 'boss_frostbolt'
  b.castRemaining = FROSTBOLT_CAST
  b.castTotal = FROSTBOLT_CAST
  b.castTargetId = held.id
  say(s, b, lineFor(fight(s), 'frostbolt'))
  s.sounds.push('telegraph')
  pushEffect(s, 'cast', b.pos, { abilityId: 'boss_frostbolt' })
}

/**
 * A boss's shot, in the air.
 *
 * The rule for which mechanics get one, because most must not: a bolt is owed
 * where the boss bills a body it is not touching, and the bill is the boss's
 * own act rather than the floor's. Five of the forty pass that -- the tide,
 * the shard, the volley, the rot and the turned mind, and the tide is on all
 * eight bosses, so this is a thing the game does rather than a thing one boss
 * does. Everything else this game throws is
 * either the ground going bad under somebody or the boss arriving in person,
 * and both of those already draw the thing that is happening; a pool that also
 * threw a bolt would be claiming to be two mechanics, and a cone with a bolt
 * in it would be telling the raid to dodge the wrong shape.
 *
 * Scenery, always, and that is not a shortcut. The mechanic is billed where it
 * is thrown; the bolt is the tell that says where the bill came from. Damage
 * that waited on a flight time would be a different fight, and every number in
 * the harness was measured against this one. It names its mechanic so the
 * renderer can colour it, and `land` reads the name not being an ability's as
 * "this one carries nothing".
 */
function throwBolt(s: SimState, targetId: number, kind: ProjectileKind, mechanic: string): void {
  const b = boss(s)
  const at = s.actors.find((a) => a.id === targetId)
  // Long enough to be seen, however short the gap is.
  //
  // A tell that is over before anybody looks up is not a tell, and at the
  // ranges this game actually stands at it was. The raid rings the boss at
  // ninety to a hundred and twenty-five, so the kind's own speed put most of
  // a volley's flight inside a quarter of a second, and the bodies nearest --
  // which is most of a twenty-five man -- got two or three frames. Measured,
  // a full volley of twenty-five was on screen for between 0.08 and 0.67
  // seconds depending on who it was aimed at: the mechanic whose whole point
  // is that it goes to everybody looked like it went to the far half.
  //
  // So the gap sets the speed rather than the kind, and the kind's speed is
  // the ceiling: nothing arrives sooner than half a second, and anything far
  // enough away to take longer than that still takes longer.
  const gap = at ? dist(b.pos, at.pos) : 0
  const speed = Math.min(PROJECTILE_SPEED[kind], Math.max(gap, 1) / BOLT_TELL)
  spawnBolt(s, b, targetId, kind, mechanic, b.id, speed)
}

/** How long a boss's shot is in the air at the least. See `throwBolt`. */
const BOLT_TELL = 0.5

/** The shard landing, on whoever it was aimed at. */
function loose(s: SimState, targetId: number | null): void {
  const b = boss(s)
  const at = s.actors.find((a) => a.faction === 'party' && a.id === targetId)
  if (!at || !at.alive) return
  const damage = mechanic(s, FROSTBOLT_DAMAGE)
  applyDamage(s, at, damage, 'magic', { sourceId: b.id, mechanic: 'frostbolt' })
  pushEffect(s, 'impact', at.pos, { abilityId: 'boss_frostbolt', power: damage })
  // Something in the air between the two of them. See `throwBolt`.
  throwBolt(s, at.id, 'heavy', 'boss_frostbolt')
  s.sounds.push('raid')
}

/**
 * The same cold, spread thin over everybody.
 *
 * The floor of this fight: a bill that arrives whatever the raid does, so the
 * healers have something to be losing ground to while the rest of it happens.
 * Deliberately less each than the shard costs one body — the two are the same
 * idea at two sizes, and a raid that lets the shard land is paying the volley
 * again in one place.
 */
function scheduleVolley(s: SimState, b: Actor, timing: PhaseTiming): void {
  if (timing.volley <= 0) return
  s.next.volley -= DT
  if (s.next.volley > 0) return
  s.next.volley = timing.volley

  say(s, b, lineFor(fight(s), 'volley'))
  s.sounds.push('raid')
  for (const a of livingParty(s)) {
    const bite = mechanic(s, VOLLEY_DAMAGE)
    applyDamage(s, a, bite, 'magic', { sourceId: b.id, mechanic: 'volley' })
    pushEffect(s, 'impact', a.pos, { abilityId: 'boss_volley', power: bite })
    // One each, which is what the word means. See `throwBolt`.
    throwBolt(s, a.id, 'bolt', 'boss_volley')
  }
}

/**
 * Something that picks a body and follows it.
 *
 * The one demand on this boss that belongs entirely to the person it picked.
 * Everything else here is somebody else's problem to solve; this is answered
 * by walking, and by nobody but them.
 */
function scheduleShade(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.shade <= 0) return
  s.next.shade -= DT
  if (s.next.shade > 0) return
  s.next.shade = timing.shade

  const free = livingParty(s).filter((a) => !getAura(a, 'haunted'))
  if (free.length === 0) return
  const count = Math.max(1, Math.round(s.party.length / 10))
  say(s, b, lineFor(fight(s), 'shade'))
  s.sounds.push('telegraph')
  for (let i = 0; i < count && free.length > 0; i++) {
    const marked = free.splice(rng.int(free.length), 1)[0]!
    addAura(marked, 'haunted', b.id)
    pushEffect(s, 'cast', marked.pos, { abilityId: 'boss_shade' })
  }
}

/**
 * One tick of every shade on the field.
 *
 * The aura alone would be a dot with a long name: it would tick on somebody
 * standing perfectly still, and the mechanic is that standing still is the one
 * thing that does not work. So the thing following is a place, kept on the
 * aura, and it closes at most of a body's speed — outrun by walking and never
 * outrun by being somewhere clever.
 */
function updateShades(s: SimState): void {
  for (const a of livingParty(s)) {
    const mark = getAura(a, 'haunted')
    if (!mark) continue
    // It starts where the body was when it was picked, which is what gives the
    // first second of it a head start to spend.
    if (!mark.at) mark.at = { x: a.pos.x, y: a.pos.y }
    const away = dist(mark.at, a.pos)
    if (away > 0.001) {
      const step = a.moveSpeed * SHADE_SPEED * DT
      mark.at.x += ((a.pos.x - mark.at.x) / away) * step
      mark.at.y += ((a.pos.y - mark.at.y) / away) * step
    }
    // Only while it is actually on them. The aura's own tick is what bills it,
    // so this decides whether that tick is paid rather than paying it twice.
    mark.stacks = away <= SHADE_REACH ? 1 : 0
    pushEffect(s, 'cast', mark.at, { abilityId: 'boss_shade' })
  }
}

/**
 * The hold taken off the tank without taking the tank.
 *
 * It leaves them standing there and stops them being the thing the boss is
 * looking at. The answer is the other tank, and it is on this boss because
 * this one already asks the raid to keep changing what it is hitting — a
 * fight that also changes who is being hit is one idea rather than two.
 */
function scheduleSlight(s: SimState, b: Actor, timing: PhaseTiming): void {
  if (timing.insignificance <= 0) return
  s.next.insignificance -= DT
  if (s.next.insignificance > 0) return
  s.next.insignificance = timing.insignificance

  const held = topThreatTarget(s)
  if (!held) return
  // Stacked rather than refreshed. See `SLIGHT_SHARE`: what the original does
  // is count up to a tank that cannot hold anything at all, which is a clock
  // the other tank reads and answers on a beat it can see coming. Applied as
  // one fact every twenty-four seconds it was answered once and forgotten.
  if ((getAura(held, 'slighted')?.stacks ?? 0) >= SLIGHT_MAX) {
    getAura(held, 'slighted')!.remaining = AURA_DURATION.slighted
  } else {
    stackAura(held, 'slighted', b.id)
  }
  say(s, b, lineFor(fight(s), 'insignificance'))
  pushEffect(s, 'cast', held.pos, { abilityId: 'boss_insignificance' })
}

/**
 * One of the wave, come back wrong.
 *
 * What it costs is not the body, it is the ordering. A raid that kills a wave
 * left to right reaches the empowered one somewhere in the middle, and
 * everything it did until then it did at full strength.
 */
function scheduleEmpower(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.empower <= 0) return
  s.next.empower -= DT
  if (s.next.empower > 0) return

  // The wave first, and the beat is only spent if there is one.
  //
  // This is a fact about a summon that was already coming, and it was written
  // as a clock of its own that happened to run alongside the summoning one --
  // forty-seven seconds against forty-four, independent, so the two almost
  // never lined up. When the beat came round to an empty floor it reset
  // anyway and waited another forty-seven. Measured over five pulls of a
  // twenty-five man heroic, where fifteen were due: it fired twice.
  //
  // Held instead of spent, so it goes off within a tick of the next wave
  // landing. Same shape as the third breath that never arrives on the boss
  // two rungs along -- two timers that were meant to be one.
  const wave = s.actors.filter(
    (a) => a.faction === 'boss' && a.id !== BOSS_ID && a.alive && !getAura(a, 'empowered'),
  )
  if (wave.length === 0) return
  s.next.empower = timing.empower

  const one = rng.pick(wave)
  addAura(one, 'empowered', b.id)
  one.maxHp = Math.round(one.maxHp * EMPOWER_HEALTH)
  one.hp = one.maxHp
  say(s, b, lineFor(fight(s), 'empower'))
  s.sounds.push('telegraph')
  pushEffect(s, 'cast', one.pos, { abilityId: 'boss_empower' })
}

/**
 * One of the raid, turned around.
 *
 * The only mechanic in this game whose answer is a person. It does not take
 * them away — a body removed for twelve seconds is a headcount problem, and
 * this game already has those — it points them at the people who were counting
 * on them, and makes them better at it while it does.
 *
 * The raid cannot kill them out of it, and nothing had to be written to stop
 * it: a party only ever aims at the other faction, so the one rule the mechanic
 * needs is the one the game already had. What is left is the thing that is
 * actually hard, which is carrying on without somebody for twelve seconds
 * while they are hurting you.
 */
function scheduleDominate(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.dominate <= 0) return
  s.next.dominate -= DT
  if (s.next.dominate > 0) return
  s.next.dominate = timing.dominate

  // Never the tank. Turning the body that is holding the boss hands the raid a
  // loose boss and a hostile tank at once, which is two mechanics arriving as
  // one and neither of them the one being asked.
  const free = livingParty(s).filter((a) => a.role !== 'tank' && !getAura(a, 'turned'))
  if (free.length === 0) return

  // One at a time until a raid is very large, and even then not many. Two
  // turned dealers at twenty-five is not twice the mechanic: the raid loses
  // both of them and is hit by both of them, and the cell went from 98% won to
  // 30% on that alone while the same fight without it read a hundred. What is
  // being asked is "carry on without somebody", and that question does not get
  // better by being asked twice at once.
  const count = Math.max(1, Math.round(s.party.length / 22))
  say(s, b, lineFor(fight(s), 'dominate'))
  s.sounds.push('raid')
  for (let i = 0; i < count && free.length > 0; i++) {
    const taken = free.splice(rng.int(free.length), 1)[0]!
    addAura(taken, 'turned', b.id)
    pushEffect(s, 'cast', taken.pos, { abilityId: 'boss_dominate' })
    // The only one of these that bills nothing, and the one that most needs
    // the line drawn: what a raid has to know here is which of its own, and a
    // burst appearing on a body says one turned without saying which.
    throwBolt(s, taken.id, 'dot', 'boss_dominate')
  }
}

function scheduleStorm(s: SimState, b: Actor, timing: PhaseTiming): void {
  if (timing.bonestorm <= 0) return
  if (getAura(b, 'storming')) return
  s.next.bonestorm -= DT
  if (s.next.bonestorm > 0) return
  s.next.bonestorm = timing.bonestorm

  addAura(b, 'storming', b.id)
  say(s, b, lineFor(fight(s), 'bonestorm'))
  s.sounds.push('shockwave')
  pushEffect(s, 'cast', b.pos, { abilityId: 'boss_bonestorm', power: STORM_REACH })
}

/**
 * One tick of the storm, and the wandering that makes it one.
 *
 * Its own function rather than part of the schedule above, because a storm is
 * a stretch rather than an event: what it does happens on every tick it is up,
 * and the movement is as much the mechanic as the damage.
 */
function updateStorm(s: SimState, b: Actor): void {
  if (!getAura(b, 'storming')) return

  // At the body furthest from it, re-picked every few seconds.
  //
  // This is the line the mechanic is. Wandering on a circuit of its own is
  // answered by "run from the big thing" and nothing else — a reaction, and
  // the same reaction from everybody. Charging at whoever is furthest out
  // turns the same damage and the same clock into a placement decision the
  // raid makes together: somebody volunteers to be the far one, and the room
  // decides which way the charge is dragged. It can be pulled across floor a
  // cold line has already been through, and if nobody decides anything the
  // pick ping-pongs between clumps of ranged and sweeps a few each time.
  //
  // Re-picked on a beat rather than every tick, so a body walking one step
  // does not turn it. What it is aiming at has to stay legible for long enough
  // to be worth reacting to.
  //
  // On `beat` rather than on `tickTimer`, which is the aura system's and is
  // drained back under one every second -- written on that, this never once
  // reached five, and the whole mechanic was a single charge at a frozen
  // coordinate followed by twenty-two seconds of standing still.
  //
  // And at the body rather than at where the body was when it was picked. A
  // remembered point is answered by walking off it once; a body is answered
  // for as long as the storm lasts, which is what makes the pick worth the
  // raid's attention. The one held is re-picked early if it dies, so the
  // storm never spends the rest of its count chasing a corpse.
  const mark = getAura(b, 'storming')!
  mark.beat = (mark.beat ?? STORM_REPICK) + DT
  let held = livingParty(s).find((a) => a.id === mark.bearer)
  if (!held || mark.beat >= STORM_REPICK) {
    mark.beat = 0
    let far: Actor | null = null
    for (const a of livingParty(s)) {
      if (!far || dist(a.pos, b.pos) > dist(far.pos, b.pos)) far = a
    }
    if (far) {
      mark.bearer = far.id
      held = far
    }
  }
  if (held) {
    const gap = dist(b.pos, held.pos) || 1
    const step = b.moveSpeed * STORM_SPEED * DT
    b.pos.x += ((held.pos.x - b.pos.x) / gap) * step
    b.pos.y += ((held.pos.y - b.pos.y) / gap) * step
    pushInside(s.room, b.pos, b.radius)
  }

  // Billed on the same beat as everything else, so the healers read it the way
  // they read the rest of the fight.
  s.stormTimer = (s.stormTimer ?? 0) + DT
  if (s.stormTimer < 1) return
  s.stormTimer -= 1
  for (const a of livingParty(s)) {
    const gap = dist(a.pos, b.pos)
    if (gap > STORM_REACH + a.radius) continue
    // Worst at the middle. See `STORM_BITE`: outside is still nothing, and
    // inside it now says how far inside.
    const close = 1 - Math.min(1, gap / STORM_REACH)
    const bite = mechanic(s, STORM_TICK * (STORM_BITE + (1 - STORM_BITE) * close))
    applyDamage(s, a, bite, 'physical', { sourceId: b.id, mechanic: 'bonestorm' })
    pushEffect(s, 'impact', a.pos, { abilityId: 'boss_bonestorm', power: bite })
  }
}

function scheduleSpore(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.spore <= 0) return
  s.next.spore -= DT
  if (s.next.spore > 0) return
  s.next.spore = timing.spore

  const free = livingParty(s).filter((a) => !getAura(a, 'spore'))
  if (free.length === 0) return

  say(s, b, lineFor(fight(s), 'spore'))
  s.sounds.push('telegraph')
  const count = Math.max(1, Math.round(s.party.length / 9))
  for (let i = 0; i < count && free.length > 0; i++) {
    const carrier = free.splice(rng.int(free.length), 1)[0]!
    addAura(carrier, 'spore', b.id)
    pushEffect(s, 'cast', carrier.pos, { abilityId: 'boss_spore' })
  }
}

/**
 * A spore going, and whoever was standing in it being covered.
 *
 * Exported because the aura running out is what bursts it, and aura expiry
 * lives in `sim.ts` beside the others that resolve that way. The carrier is
 * covered whatever happens -- they could hardly walk away from themselves --
 * and everybody else is covered only if they came.
 */
export function burstSpore(s: SimState, carrier: Actor): void {
  addAura(carrier, 'inoculated', BOSS_ID)
  for (const a of livingParty(s)) {
    if (a.id === carrier.id) continue
    if (dist(a.pos, carrier.pos) > SPORE_REACH) continue
    addAura(a, 'inoculated', BOSS_ID)
  }
  pushEffect(s, 'impact', carrier.pos, { abilityId: 'boss_spore', radius: SPORE_REACH })
}

/**
 * A rot that will not stay on the body it was put on.
 *
 * The spore's opposite number and deliberately on the same boss. One asks the
 * raid to gather and the other punishes it for being gathered, on two clocks
 * that do not line up -- so the answer is not a formation, it is knowing which
 * of the two is running right now.
 */
function scheduleVileGas(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.vilegas <= 0) return
  s.next.vilegas -= DT
  if (s.next.vilegas > 0) return
  s.next.vilegas = timing.vilegas

  const free = livingParty(s).filter((a) => !getAura(a, 'reek'))
  if (free.length === 0) return

  say(s, b, lineFor(fight(s), 'vilegas'))
  const count = Math.max(1, Math.round(s.party.length / 9))
  for (let i = 0; i < count && free.length > 0; i++) {
    const marked = free.splice(rng.int(free.length), 1)[0]!
    addAura(marked, 'reek', b.id)
    pushEffect(s, 'cast', marked.pos, { abilityId: 'boss_vilegas' })
  }
}

/**
 * The swelling on whoever is holding the boss.
 *
 * Public, stacking, and lethal on the tenth. The answer is the other tank
 * taking it at nine, which makes this the one mechanic in the game whose
 * answer is a job rather than a place -- and the reason a fight carrying it
 * cannot be sold to a raid that brings a single tank. The armour break already
 * has that rule written down and this one shares it.
 */
function scheduleBloat(s: SimState, b: Actor, timing: PhaseTiming): void {
  if (timing.bloat <= 0) return
  s.next.bloat -= DT
  if (s.next.bloat > 0) return
  s.next.bloat = timing.bloat

  const held = topThreatTarget(s)
  if (!held) return
  stackAura(held, 'swelling', b.id)
  const stacks = getAura(held, 'swelling')?.stacks ?? 0
  // Every stack, not only the tenth. The count is the mechanic and a count
  // nobody can see climbing is a count nobody swaps on.
  pushEffect(s, 'cast', held.pos, { abilityId: 'boss_bloat', power: stacks })
  if (stacks < BLOAT_BURST_AT) {
    if (stacks === BLOAT_BURST_AT - 1) say(s, b, lineFor(fight(s), 'bloat'))
    return
  }

  // The tenth. Whoever was holding it goes, and whoever was standing with them
  // pays for having been there.
  s.sounds.push('raid')
  applyDamage(s, held, mechanic(s, BLOAT_BURST), 'magic', { sourceId: b.id, mechanic: 'bloat' })
  for (const a of livingParty(s)) {
    if (a.id === held.id) continue
    if (dist(a.pos, held.pos) > BLOAT_SPLASH) continue
    applyDamage(s, a, mechanic(s, BLOAT_BURST * 0.4), 'magic', {
      sourceId: b.id,
      mechanic: 'bloat',
    })
  }
  pushEffect(s, 'impact', held.pos, { abilityId: 'boss_bloat', radius: BLOAT_SPLASH })
  held.auras = held.auras.filter((au) => au.id !== 'swelling')
}

function scheduleColdflame(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.coldflame <= 0) return
  s.next.coldflame -= DT
  if (s.next.coldflame > 0) return

  // While it is storming, the same patch is a different mechanic. See
  // `COLDFLAME_ARMS`: all the bearings at once, on a beat shorter than a patch
  // holds, turning between casts -- so what the floor becomes is a lattice
  // laid across itself rather than one line at a time.
  const storming = getAura(b, 'storming') !== undefined
  s.next.coldflame = storming ? COLDFLAME_STORM_BEAT : timing.coldflame
  s.sounds.push('telegraph')
  // Said once, when it is a line somebody has to step off. In a storm it is
  // the floor rather than an event, and the storm has its own line for that.
  if (!storming) say(s, b, lineFor(fight(s), 'coldflame'))

  // Aimed at a body rather than rolled.
  //
  // The two look alike in a screenshot and are not the same mechanic. A rolled
  // bearing is a fact about nothing — nobody can change it, and where the raid
  // stands has no bearing on where the line goes. A bearing taken from a body
  // is a function of where the raid is standing: bunched at range and the line
  // only ever comes at them; spread out and it divides the room evenly. That
  // is a placement decision the raid can make, bought for one line.
  //
  // And not at melee, while anybody else is out there. Melee are already safe
  // by construction — the first patch starts outside the boss's own edge — so
  // aiming at one spends the cast on nobody. It falls back to whoever is there
  // if nobody has left melee, which on this boss means the tank.
  const bearings: number[] = []
  if (storming) {
    // Off the clock rather than off a body, because it is not aiming at
    // anybody -- and off the clock rather than rolled, so the fan turns
    // instead of landing on itself.
    const turn = s.time * COLDFLAME_SPIN
    for (let a = 0; a < COLDFLAME_ARMS; a++) {
      bearings.push(turn + (a / COLDFLAME_ARMS) * Math.PI * 2)
    }
  } else {
    const away = livingParty(s).filter((a) => dist(a.pos, b.pos) > b.radius + COLDFLAME_RADIUS)
    const at = rng.pick(away.length > 0 ? away : livingParty(s))
    if (!at) return
    bearings.push(Math.atan2(at.pos.y - b.pos.y, at.pos.x - b.pos.x))
  }

  for (const bearing of bearings) {
    for (let i = 0; i < COLDFLAME_REACH; i++) {
      // Outside the boss's own edge, so the hitbox is the safe spot.
      const out = b.radius + COLDFLAME_RADIUS + i * COLDFLAME_STEP
      const pos = { x: b.pos.x + Math.cos(bearing) * out, y: b.pos.y + Math.sin(bearing) * out }
      pushInside(s.room, pos, COLDFLAME_RADIUS)
      s.ground.push({
        ...blankGround(s),
        kind: 'coldflame',
        pos,
        radius: COLDFLAME_RADIUS,
        telegraph: COLDFLAME_TELEGRAPH + i * COLDFLAME_CRAWL,
        lingering: storming ? COLDFLAME_STORM_LINGER : COLDFLAME_LINGER,
        damage: COLDFLAME_DAMAGE,
        detonated: false,
      })
    }
    pushEffect(s, 'cast', b.pos, {
      abilityId: 'boss_coldflame',
      power: COLDFLAME_REACH * COLDFLAME_STEP,
      angle: bearing,
    })
  }
}

function scheduleRaidHit(s: SimState, timing: PhaseTiming): void {
  if (timing.raid <= 0) return
  s.nextRaidHit -= DT
  if (s.nextRaidHit > 0) return

  // Unavoidable, so it is not counted as a mechanic anyone failed.
  s.sounds.push('raid')
  const damage = hit(s, fight(s).raidDamage)
  for (const a of livingParty(s)) {
    applyDamage(s, a, damage, 'magic', { sourceId: BOSS_ID })
    pushEffect(s, 'impact', a.pos, { abilityId: 'boss_raid', power: damage })
    // One each, from the boss, which is the whole of what this needed. The
    // note below says an unavoidable hit with no tell reads as a broken
    // hitbox; the flash it got says something happened, and a line from the
    // boss to every body says the something was the boss and not the puddle
    // they had just stepped out of. It is not a dodge cue and cannot be
    // mistaken for one -- it arrives on the same frame as the number.
    throwBolt(s, a.id, 'bolt', 'boss_raid')
  }
  s.nextRaidHit = timing.raid
  // Unavoidable damage with no tell reads as a broken hitbox: the player
  // dodges, loses health anyway, and blames the puddle they just left.
  s.raidFlash = 0.45
}

/**
 * How far inside the room a body starts, measured from the door it came through.
 *
 * One lane, which is the same distance everything else in this game keeps off
 * a wall. It is what makes the arrival read as walking in rather than
 * appearing: a body exactly on the wall is a body standing in the doorway, and
 * a body a lane inside it has already taken a step.
 */
const DOOR_STEP = 64

/**
 * Where the next thing this fight summons comes from.
 *
 * A door if the fight has any open at this size, taken in turn; the old ring
 * of 230 at a rolled bearing if it has none. Both are pushed inside the room,
 * because a door sits on the wall and a body has a width.
 *
 * The counter lives on the state rather than here so that two waves in one
 * pull continue the rotation, and so that the same seed replays the same
 * order — which is the point of not rolling it.
 */
function spawnSpot(s: SimState, rng: Rng, radius: number): Vec2 {
  const doors = openDoors(fight(s), s.party.length)
  if (doors.length > 0) {
    const door = doors[s.nextDoor % doors.length]!
    s.nextDoor++
    // A step inward, along the line to the middle of the room. Every room here
    // is convex, so that line never leaves it.
    const away = Math.hypot(door.pos.x, door.pos.y) || 1
    const pos = {
      x: door.pos.x - (door.pos.x / away) * DOOR_STEP,
      y: door.pos.y - (door.pos.y / away) * DOOR_STEP,
    }
    pushInside(s.room, pos, radius)
    return pos
  }
  const angle = rng.range(0, Math.PI * 2)
  const pos = { x: Math.cos(angle) * 230, y: Math.sin(angle) * 230 }
  pushInside(s.room, pos, radius)
  return pos
}

function scheduleAdds(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.adds <= 0) return
  s.next.adds -= DT
  if (s.next.adds > 0) return

  s.next.adds = timing.adds
  say(s, b, lineFor(fight(s), 'adds'))

  // Proportional rather than banded, and floored at one rather than two.
  //
  // Three thralls against ten and five against twenty-five is not the same
  // ask: the ten-man has two tanks and fewer dealers, so the middle band was
  // carrying roughly half again the weight the top one did — measured, a
  // ten-man heroic Tidebreaker lost every pull on the rung that buys them
  // while a twenty-five man won three in four.
  //
  // The floor of two then put the same over-weighting back at the bottom: a
  // five-man fields three dealers, so two thralls is two-thirds of a target
  // each against a twenty-five man's fifth, and the sizes that buy this rung
  // at all are the heroic ones with the least room to pay for it.
  const waves =
    Math.max(1, Math.round(livingParty(s).length / 6)) * affixAddWave(s.affix)
  for (let i = 0; i < waves; i++) {
    // Spread across the open doors rather than all through one: a wave that
    // arrives in a single doorway is one pack with extra steps.
    const pos = spawnSpot(s, rng, 16)
    const thrall = makeAdd(s.nextObjectId++, pos.x, pos.y)
    thrall.maxHp = addHealth(s)
    thrall.hp = thrall.maxHp
    // On the fight whose gauge these fill, a wave picks somebody and walks at
    // them. Which body it picks is half of how fast the bar moves, and that is
    // the difference between a wave that is a thing to survive and one that is
    // a decision: sent at whoever is nearest it dies in the melee where the
    // damage already is, and the raid never had to do anything.
    //
    // Never the tank, for the reason the mark is never the tank: a beast sent
    // at the body already standing in front of the boss changes nothing.
    if (timing.siphon > 0) {
      const quarry = livingParty(s).filter((a) => a.role !== 'tank')
      if (quarry.length > 0) {
        thrall.spawn = 'beast'
        thrall.quarry = rng.pick(quarry).id
      }
    }
    s.actors.push(thrall)
  }
}

/**
 * Physical damage to everyone standing in reach.
 *
 * The only thing a boss throws that armour answers. Everything else it does is
 * magic and ignores armour entirely, which meant a melee dealer's plate was a
 * line in a table: it took the same mechanic damage as a mage in cloth, died
 * at the same rate, and paid for the privilege by standing where the boss was
 * aiming. This is what makes the armour worth the walk.
 *
 * It is telegraphed by the swing itself rather than by a circle on the floor:
 * being in reach is the tell, and getting out is the answer.
 */

/**
 * The floor around the boss, announced and then caved in.
 *
 * The sweep's opposite number, and the only reason it was built. Both land on
 * the same band — whoever is within reach of the boss, which is the melee —
 * and the sweep measures at exactly zero points of teaching, because the
 * question it asks is *are you melee*, and a role is not a skill. Nothing a
 * raid can practise moves that number.
 *
 * The difference here is one second. It says it is coming, and then it lands,
 * and at that instant you are either inside the band or you are not: no ticks,
 * no partial credit, no proportional loss to be washed out by an average. So
 * the same band that was a seating chart becomes a moment of judgement, and
 * what it costs the melee is not the hit — a practised melee is never hit at
 * all — it is the walk out and the walk back, paid for in uptime.
 *
 * Magic rather than physical, which is the one thing it deliberately does not
 * borrow from the sweep. Armour answering it would hand the answer back to
 * the role, and that is the thing being tested.
 *
 * Anchored where the boss stood when it announced, not where the boss ends up.
 * The boss moves for two percent of a fight so the two are nearly the same
 * spot, and the shape a raid is reading has to be the shape that goes off.
 */
/**
 * A puddle's, exactly, and for the same reason a puddle's is what it is: this
 * is one mechanic's worth of damage at one instant, and the puddle is the
 * measured shape of that. Heavier read as forty-five percent of a first pull
 * dead rather than twenty-three, which is a wipe mechanic rather than a
 * teaching one.
 */
const COLDFLAME_DAMAGE = 430



/** How many groups a raid this size is cut into. */

/** Whether these two were told to be in different places. */


export const HAND_BEAT = readable(1.1)

/**
 * The floor split down the middle, and one half of it condemned.
 *
 * The crush asks the melee whether they noticed in time, which is a question
 * only half the raid is ever asked — it is a band of a fixed radius and the
 * ranged are outside it every cast. This asks everybody the same question at
 * once. A line is drawn across the arena through the boss, the half on one
 * side of it gives way about a second later, and at that instant a body is on
 * one side or the other with nothing in between.
 *
 * The bearing is rolled every time. That is the whole of what makes it a
 * mechanic rather than a seating chart: a fixed line would be learnt once and
 * then answered by standing on the correct side forever, which is the failure
 * the sweep already demonstrates — a mechanic whose answer is where your role
 * stands teaches nothing, because a role is not a skill. Rolled, the answer is
 * the same shape and never the same direction, so it has to be read off the
 * floor while the count runs.
 *
 * Anchored on the boss where it was announced, for the reason the crush is:
 * the boss moves for two percent of a fight, and the shape a raid reads has to
 * be the shape that goes off.
 *
 * What it is worth, alone, on heroic, in points of survival between a first
 * pull and a ninth and then the share of the deaths that practice removes:
 *
 *   five        21.3pp +/- 6.3    75%
 *   ten          8.3   +/- 1.5    96%
 *   twenty-five 24.6   +/- 2.7    95%
 *
 * The ends are where the mechanic is, and the dip in the middle is the boss
 * rather than the line: a ten-man Warden fields two tanks and the same healer
 * per five bodies a five-man does, so it is the size with the most slack to
 * absorb a hit somebody ate. It is worth reading as area denial super-scaling
 * — the arena is 460 whatever the headcount — except that this one denies a
 * fixed half of it rather than a share per body, so what grows with the raid
 * is the number of chances to be the one who was late.
 */
/** A crush's, and a puddle's: one mechanic's worth of damage at one instant. */

/** Which half a fault condemns: the one its bearing points into. */

/**
 * The arena going under, except for the few patches it leaves standing.
 *
 * Every other piece of hazardous ground in this game says *leave where you
 * are*: a pool, a brand, the band round the boss, the half a fault takes.
 * This one says *be somewhere specific*, and there is exactly one other
 * mechanic here that does — the gathering, which asks the whole party into a
 * single circle and therefore gets easier the more bodies there are to divide
 * the hit between. Three patches ask each body the same question whatever the
 * headcount.
 *
 * The patches are rolled a third of a turn apart rather than freely. Three
 * free rolls land on top of one another often enough to be a coin flip
 * between a mechanic and a formality, and what this is supposed to ask is
 * which patch, not whether there happened to be one underfoot.
 *
 * Alone, on heroic, in points and then the share of deaths practice removes:
 *
 *   five         2.8pp +/- 2.3    94%
 *   ten          2.4   +/- 0.7    98%
 *   twenty-five  8.7   +/- 1.3    97%
 *
 * Three patches are three patches at any headcount, so the growth is the same
 * one the split has: more bodies, more chances that one of them noticed late.
 * The share column is the honest one here — this mechanic empties a first
 * pull's deaths almost completely — and the points column is low because most
 * of what it costs a raid is the walk, which the probe cannot see at all.
 */

/** Whether this spot is on ground the shallows leave standing. */


/**
 * The armour break, on whoever is holding the boss.
 *
 * The only mechanic here aimed at the tanks rather than at the raid. Every
 * other one is answered by moving; this one is answered by deciding who is
 * standing there, which is a decision a party of five does not get to make —
 * so at five it is a healing problem that gets worse for sixteen seconds, and
 * at ten and twenty-five it is the reason to bring a second tank.
 */
/** How deep the break goes. */
export const SUNDER_MAX = 5



/**
 * How long the floor takes to answer.
 *
 * Shorter than a pool's and longer than the caving band's. A pool is walked
 * away from and this is standing on top of you, so the pool's second and a
 * half is a stroll; the band's one and a tenth is measured against a step of
 * fifty units and this asks for sixty-six with a reaction in front of it.
 *
 * It is the shallowest dial the mechanic has, which is worth writing down:
 * at one mark per ten bodies, a tenth of a second here is 24 points of
 * teaching against 13 at a full second. The volume dials — how many carry it
 * and how fast the drum runs — move it four times as far.
 */
export const ECHO_TELEGRAPH = readable(0.9)

/** One beat of it: the ground under this body, about to answer. */

/**
 * A judgement, which is the one thing here no amount of walking answers.
 *
 * Every other mechanic on every boss is a question about where you are
 * standing. This one picks somebody, counts to itself, and then takes them
 * outright unless their health is above a line when it lands. There is
 * nowhere to take that. The only thing that moves a health bar upward is a
 * healer, so the answer is a healer's — and unlike every heal in the game,
 * which is paid after the damage has landed, it has to be paid before the
 * count runs out rather than after.
 *
 * The line rather than a number of damage decides it. A fixed lethal hit
 * would have made this a question about class: plate lives through it and
 * cloth does not, and neither of them had a decision to make. A share of the
 * bar asks the same thing of everybody.
 *
 * Two things about it are measurements rather than taste, and both were
 * surprises.
 *
 * It passes over rather than hurting. The first version dealt a heavy but
 * survivable hit to anyone above the line — which is the obvious shape, and
 * which measured at 2 points against 29 for the same mechanic dealing
 * nothing. Damage is what makes somebody the most hurt person in the raid,
 * and the most hurt person in the raid is who `healerRotation` already heals.
 * A mechanic that wounds the people it marks is a mechanic the ordinary
 * rotation answers by accident, and there is no skill anywhere in that rule.
 * It only teaches while the answer is something the healers would not have
 * done anyway.
 *
 * And it does not mark anybody already under the line. Left to pick freely it
 * spent most of its judgements on bodies no healer could have lifted in time
 * — three casts short, not one — and those die at exactly the same rate on a
 * ninth pull as on a first. A mechanic teaches nothing through the cases that
 * had no answer.
 */
export const VERDICT_LINE = 0.85

/** How high a healer has to get somebody before the count runs out. */

/** The count reaching zero: above the line it passes over, below it takes. */






/** Where a brand burned out, the floor keeps it. */

// --- the gorged one -------------------------------------------------------
//
// One boss on this roster does not bill at the instant it judges. Everything
// it throws is survivable and most of it is trivial; what is not trivial is
// that each thing the raid lets happen is a deposit, and the deposits buy
// something that never goes away. A fight lost at three minutes was lost at
// forty seconds.
//
// The gauge itself is deliberately not a rung. Rule 1 in
// `docs/mechanic-rules.md` says failure has to be binary at an instant, and a
// bar filling is a slope -- the wind that pushed bodies a tick at a time
// measured at exactly nothing for this reason. What the ladder sells is the
// mark the gauge buys, which is an instant on a named body.

/**
 * What each thing the raid could have prevented puts into the gauge.
 *
 * Three sources and no others, and the omission is the design: the boss's own
 * swing does not fill it. A gauge that filled from being in the fight would be
 * a second enrage clock wearing a bar, and the raid could do nothing about it.
 * Filled only by what somebody let happen, it is a bill.
 *
 * The three are not equal, and the ordering is an argument about how much
 * warning each mistake came with. A beast has to cross the room to land its
 * hit and the raid has the whole of that walk to stop it, so connecting is the
 * largest of the three. A body caught in a spill had six seconds to walk a
 * hundred and twenty units. A wound left festering is the smallest per tick
 * and the largest if it is ignored, which is the shape of a thing answered by
 * being early.
 */
export const SIPHON_PER_CAUGHT = 0.04
const SIPHON_PER_ADD_HIT = 0.015
export const SIPHON_PER_FESTER_TICK = 0.005

/**
 * What a full gauge is worth to the boss's own hands, as a multiplier.
 *
 * The gauge's continuous half, and it is deliberately the half that teaches
 * nothing: rule 1 says failure has to be binary at an instant, and this is a
 * slope. What it is for is that the raid *feels* the fight getting heavier
 * before the mark arrives -- the tank's health bar moving faster than the
 * healers expected is the only warning the design gives.
 */
const SIPHON_POWER = 0.5

/** The cadence at which the gauge fills exactly as fast as it is written. */
const SIPHON_REFERENCE = 20

/**
 * Puts something into the gauge, if this fight has one.
 *
 * Every caller is somewhere the raid made a mistake, and none of them knows or
 * needs to know whether the boss on the floor sells a gauge -- a fight without
 * one has `siphon` at zero on every phase and this does nothing.
 */
export function siphonFeed(s: SimState, amount: number, at?: Vec2): void {
  if (s.mode !== 'raid' || s.gauge >= 1) return
  const base = fight(s).phases[s.phase]
  if (!base) return
  // Through the same door the schedulers read their cadences through, rather
  // than off the boss's own table. What is on the table is what the fight owns;
  // what comes out of here is what tonight's raid bought and what a check has
  // imposed -- and a gauge that read the table would fill on a rung that had
  // not sold it, and refuse to fill for the probe that isolates it.
  const seconds = scaled(base, s).siphon
  if (seconds <= 0) return
  // The row on the phase table is written as a cadence like every other row --
  // how long a bar takes to fill at a reference rate of mistakes -- so that a
  // later phase asking for it *sooner* is the same sentence here as it is
  // everywhere else. What the fight actually needs is a multiplier, and that
  // is this ratio rather than a second column that reads backwards.
  const before = s.gauge
  s.gauge = Math.min(1, s.gauge + (amount * SIPHON_REFERENCE) / seconds)
  // Where it came from, drawn for four tenths of a second. Without this the
  // bar goes up and the raid has no idea which of the three things it is doing
  // wrong -- a mechanic whose only feedback is a number moving somewhere else
  // is a mechanic nobody can be taught by.
  if (at && s.gauge > before) {
    pushEffect(s, 'impact', at, { abilityId: 'boss_siphon', power: (s.gauge - before) * 1000 })
  }
}

/** What the gauge is worth to a hit, which is nothing at all until it fills. */
export function gaugePower(s: SimState): number {
  return 1 + s.gauge * SIPHON_POWER
}

/** Bodies wearing the mark, which is the only aura in the game that stays. */
export function marked(s: SimState): Actor[] {
  return livingParty(s).filter((a) => getAura(a, 'championed') !== undefined)
}

/**
 * How many marks may be out at once, whatever the headcount.
 *
 * Rule 5, applied to a bill that never expires: one instant may write one
 * near-lethal bill, and a mark is worse than that -- it is a bill the healers
 * carry for the rest of the pull. Three at twenty-five would be three bodies
 * nobody may lose and no hands left for the fight. The roster is allowed to
 * make each one heavier instead; it is not allowed to make them more numerous.
 */
const CHAMPION_CAP = 2

/**
 * What share of the boss's hands lands on each marked body, swing and slam.
 *
 * Two numbers because the mechanic needs both halves and they do different
 * jobs. The swing is attrition: it puts a marked body permanently on the
 * healers' list, which is what makes the mark a thing carried rather than a
 * thing survived. The slam is the moment: most of a tank's own hit landing on
 * somebody who is not a tank, every sixteen seconds, which can take a body
 * that was not already being watched from comfortable to dead.
 */
const CHAMPION_SPLASH = 0.12
const CHAMPION_SLAM = 0.35

/**
 * How far the mark's own hit carries, and what it costs to be inside that.
 *
 * The half of this mechanic that can be measured. As pure healing pressure a
 * mark cannot teach anything: at a splash small enough to survive nobody dies,
 * at one large enough to kill nobody survives, and there is no coefficient in
 * between -- which is rule 5's own note read from the other end, that a bill
 * spread over time is a rate and a rate is what healing is.
 *
 * So the mark is also a place. What lands on the marked body lands again on
 * whoever is standing with them, which asks a question a reaction delay can be
 * late for: the marked body has to take itself away from the raid, and the
 * raid has to stop standing where it was.
 */
const CHAMPION_REACH = 130
const CHAMPION_NEAR = 0.5

/** How far the mark's hit carries to whoever is standing with it. */
export const MARK_REACH = CHAMPION_REACH

/** What the boss gets back if a marked body goes down. */
export const CHAMPION_HEAL = 0.05

/**
 * The mark, which is bought rather than scheduled.
 *
 * Every other thing on this list is a timer coming round. This one waits for
 * the raid to fill something, which is why it is the only mechanic in the game
 * whose cadence is a *value* -- and why the boss it belongs to is the only one
 * whose fight can be made to go quiet by playing well.
 *
 * `timing.champion` is a floor under that, not a cadence: a raid answering
 * everything perfectly still meets the mechanic its ladder sold it, eventually.
 */
function scheduleChampion(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  // Either half of it is enough to be here: a fight can sell the gauge without
  // the mark, and `teachprobe` narrows a fight to the mark without the gauge --
  // which is the only way to measure a mechanic whose clock is a value rather
  // than a timer.
  if (timing.siphon <= 0 && timing.champion <= 0) return
  const floor = timing.champion
  if (floor > 0) {
    s.next.champion -= DT
    if (s.next.champion <= 0) {
      s.gauge = 1
      s.next.champion = floor
    }
  }
  if (s.gauge < 1) return

  // A fight that has not bought the mark still spends the gauge.
  //
  // Left to sit full it would be a permanent half-again on every swing, which
  // makes the rung that buys the mark *easier* than the rung below it -- the
  // ladder's one rule broken by the mechanic that is supposed to be its spine.
  // What the gorged one does with a full gauge and nobody to mark is take a
  // breath and start again.
  if (timing.champion <= 0) {
    s.gauge = 0
    say(s, b, lineFor(fight(s), 'siphon'))
    return
  }

  // Full and already at the cap: the gauge stays full and everything the raid
  // does wrong from here is free. That is not a mercy -- it is what stops a
  // twenty-five man collecting a mark a body until the healers have nothing
  // left that is not already spoken for.
  if (marked(s).length >= CHAMPION_CAP) return

  // Never the tank and never twice on one body. The first because a tank is
  // already taking every swing, so a mark on one changes nothing; the second
  // because a mark never falls off, so a body picked twice would carry double
  // for the rest of the pull with no answer available to anybody.
  const pool = livingParty(s).filter(
    (a) => a.role !== 'tank' && getAura(a, 'championed') === undefined,
  )
  if (pool.length === 0) return
  const victim = rng.pick(pool)
  addAura(victim, 'championed', b.id)
  s.gauge = 0
  if (floor > 0) s.next.champion = floor
  say(s, b, lineFor(fight(s), 'champion'))
  s.sounds.push('telegraph')
  pushEffect(s, 'cast', victim.pos, { abilityId: 'boss_champion', power: 400, crit: true })
}

/**
 * What each marked body takes off one of the boss's hits.
 *
 * Called from the swing and from the slam with the share each is worth, so the
 * two halves of the mark are one piece of code and cannot drift apart.
 */
function markShare(s: SimState, b: Actor, struck: Actor | null, damage: number, share: number, near: boolean): void {
  for (const carrier of marked(s)) {
    if (struck && carrier.id === struck.id) continue
    const bill = damage * share
    applyDamage(s, carrier, bill, 'physical', { sourceId: b.id, mechanic: 'champion' })
    pushEffect(s, 'impact', carrier.pos, { abilityId: 'boss_champion', power: bill, crit: near })
    if (!near) continue
    // And on whoever is standing with them. This is the part of the mark that
    // is answered by walking rather than by healing, and the only part of it a
    // raid can be practised at.
    for (const other of livingParty(s)) {
      if (other.id === carrier.id || (struck && other.id === struck.id)) continue
      if (dist(other.pos, carrier.pos) > CHAMPION_REACH) continue
      applyDamage(s, other, bill * CHAMPION_NEAR, 'physical', {
        sourceId: b.id,
        mechanic: 'champion',
      })
    }
  }
}

/**
 * Blood put on somebody, six seconds from going off.
 *
 * The carrier cannot dodge their own -- it is judged where they are standing
 * when the count ends -- so what the mechanic asks is that they be standing
 * somewhere nobody else is, and that everybody else notice which body to be
 * away from. Never on the melee: they stand shoulder to shoulder in front of
 * the boss, so a spill dropped there catches all of them however well they
 * play, which is a bill on a role rather than a decision.
 */
function scheduleSpill(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.spill <= 0) return
  s.next.spill -= DT
  if (s.next.spill > 0) return
  s.next.spill = timing.spill

  const free = livingParty(s).filter((a) => !a.melee && !getAura(a, 'spilling'))
  if (free.length === 0) return

  say(s, b, lineFor(fight(s), 'spill'))
  s.sounds.push('telegraph')
  const count = Math.max(1, Math.round(s.party.length / 9))
  for (let i = 0; i < count && free.length > 0; i++) {
    const carrier = free.splice(rng.int(free.length), 1)[0]!
    addAura(carrier, 'spilling', b.id)
    pushEffect(s, 'cast', carrier.pos, { abilityId: 'boss_spill' })
  }
}

/**
 * A spill going off, and everybody it caught.
 *
 * Exported because the aura running out is what detonates it, and aura expiry
 * lives in `sim.ts` beside the others that resolve that way.
 *
 * Everyone past the first is a deposit. The carrier is not counted -- they
 * could not have moved out of themselves -- which is what makes the mechanic
 * a question for the raid rather than a punishment for whoever was named.
 */
export function detonateSpill(s: SimState, carrier: Actor): void {
  const bill = mechanic(s, SPILL_DAMAGE)
  let caught = 0
  for (const a of livingParty(s)) {
    if (dist(a.pos, carrier.pos) > SPILL_RADIUS) continue
    caught++
    applyDamage(s, a, bill, 'magic', { sourceId: BOSS_ID, mechanic: 'spill' })
    pushEffect(s, 'impact', a.pos, { abilityId: 'boss_spill', power: bill })
  }
  pushEffect(s, 'impact', carrier.pos, {
    abilityId: 'boss_spill',
    radius: SPILL_RADIUS,
    power: bill,
    crit: true,
  })
  if (caught > 1) siphonFeed(s, (caught - 1) * SIPHON_PER_CAUGHT, carrier.pos)
}

/**
 * A wound that fills the gauge while nobody closes it.
 *
 * The one dot in this game that must not be ridden out, and the only mechanic
 * on this boss aimed squarely at the healers. Never on the tank: a tank is
 * being healed continuously anyway, so a wound there would come off before
 * anybody decided anything.
 */
function scheduleFester(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.fester <= 0) return
  s.next.fester -= DT
  if (s.next.fester > 0) return
  s.next.fester = timing.fester

  const free = livingParty(s).filter((a) => a.role !== 'tank' && !getAura(a, 'festering'))
  if (free.length === 0) return

  say(s, b, lineFor(fight(s), 'fester'))
  const count = Math.max(1, Math.round(s.party.length / 12))
  for (let i = 0; i < count && free.length > 0; i++) {
    const carrier = free.splice(rng.int(free.length), 1)[0]!
    addAura(carrier, 'festering', b.id)
    // The wound opens, which is what puts them under the line.
    //
    // It comes off above the line, so landed on a body at full health it came
    // off on the tick it landed -- a mechanic that measured a tenth of a tick
    // a pull and asked nobody for anything. What it costs is not this bite; it
    // is the heal that has to follow it, and which was going somewhere else.
    // Divided by `HEALTH` on the way in because everything the fight deals is
    // written in the units that funnel scales, and this one is written as a
    // share of a bar that has already been scaled.
    applyDamage(s, carrier, (carrier.maxHp * FESTER_BITE) / HEALTH, 'magic', {
      sourceId: b.id,
      mechanic: 'fester',
    })
    pushEffect(s, 'cast', carrier.pos, { abilityId: 'boss_fester' })
  }
}

/**
 * The boss taking whoever is holding it inside itself.
 *
 * What it costs is not the damage. For four seconds the raid's front rank is
 * gone -- nothing is holding the boss, nothing can be healed into that body,
 * and whoever is second in line has to be standing in the right place when it
 * looks up. It is this fight's tank swap, and it is the reason the rung it
 * sits on is one a five-man never reaches: a raid with one tank cannot answer
 * it at all.
 */
function scheduleGorge(s: SimState, b: Actor, target: Actor | null, timing: PhaseTiming): void {
  if (timing.gorge <= 0) return
  s.next.gorge -= DT
  if (s.next.gorge > 0) return
  // Nobody in front of it, or the last one is still inside: the clock waits
  // rather than resets, so a fight that has just handed the boss back does not
  // get the next swallowing a full cadence later than the raid was told.
  if (!target || s.actors.some((a) => getAura(a, 'swallowed'))) return
  s.next.gorge = timing.gorge

  addAura(target, 'swallowed', b.id)
  say(s, b, lineFor(fight(s), 'gorge'))
  s.sounds.push('telegraph')
  pushEffect(s, 'cast', b.pos, { abilityId: 'boss_gorge', power: 500, crit: true })
}

/**
 * The boss putting somebody back, and what that costs whoever came close.
 *
 * Exported for the same reason `burstSpore` is: the aura running out is the
 * mechanic, and expiry lives in `sim.ts`.
 *
 * The body lands where the boss is standing, which is the whole answer to it:
 * the raid has four seconds to know that the ground under the boss is about to
 * be the mechanic, and the melee are already standing on it.
 */
export function spitOut(s: SimState, victim: Actor): void {
  const b = boss(s)
  victim.pos.x = b.pos.x
  victim.pos.y = b.pos.y
  pushInside(s.room, victim.pos, victim.radius)
  const bill = mechanic(s, GORGE_BURST)
  for (const a of livingParty(s)) {
    if (dist(a.pos, b.pos) > GORGE_RADIUS) continue
    applyDamage(s, a, bill, 'magic', { sourceId: b.id, mechanic: 'gorge' })
    pushEffect(s, 'impact', a.pos, { abilityId: 'boss_gorge', power: bill })
  }
  pushEffect(s, 'impact', b.pos, {
    abilityId: 'boss_gorge',
    radius: GORGE_RADIUS,
    power: bill,
    crit: true,
  })
}

// --- the confluence -------------------------------------------------------
//
// The one boss on this roster whose demand is not about where the raid is
// standing. Everything else here asks a body about its own position; this asks
// the raid about the geometry between the fight's own bodies -- which small
// things are near which other small things, and what that will be in six
// seconds.

/**
 * The cone off the big arm, and the only ordinary thing this fight does.
 *
 * Its facing is locked for the cast, which is what makes walking round it an
 * answer rather than a race: a cone that tracked would be a cone answered by
 * nobody, and one that is aimed and then committed to is answered by everybody
 * who noticed in time.
 */
function scheduleSpray(s: SimState, b: Actor, timing: PhaseTiming): void {
  if (timing.spray <= 0) return
  s.next.spray -= DT
  if (s.next.spray > 0 || b.castId) return
  s.next.spray = timing.spray

  s.sounds.push('telegraph')
  say(s, b, lineFor(fight(s), 'spray'))
  b.castId = 'boss_spray'
  b.castRemaining = SPRAY_CAST
  b.castTotal = SPRAY_CAST
  b.castTargetId = null
  pushEffect(s, 'cast', b.pos, { abilityId: 'boss_spray' })

  // On the floor for the whole cast, at the bearing it is committed to.
  s.ground.push({
    ...blankGround(s),
    kind: 'spray',
    pos: { x: b.pos.x, y: b.pos.y },
    radius: SPRAY_RANGE,
    telegraph: SPRAY_CAST,
    lingering: 0,
    damage: SPRAY_DAMAGE,
    angle: s.bossFacing,
    halfWidth: SPRAY_HALF_WIDTH,
  })
}

/**
 * Something on a body that will be a body when it stops.
 *
 * Never the tank: the answer to this is a walk of a few hundred units, and a
 * tank that takes it drags the fight along behind them -- which turns a
 * decision into a role. Never twice on the same body, because two of these
 * ending in the same place is the geometry the fight is asking about, arriving
 * without anybody having chosen it.
 */
function scheduleInfection(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.infection <= 0) return
  s.next.infection -= DT
  if (s.next.infection > 0) return
  s.next.infection = timing.infection

  // And never past the cap. The count of small things is capped rather than
  // the rate they are made at, so a fight already at eight simply does not
  // hand out another -- see `OOZE_CAP`.
  if (oozes(s).length >= OOZE_CAP) return

  const free = livingParty(s).filter((a) => a.role !== 'tank' && !getAura(a, 'infected'))
  if (free.length === 0) return

  say(s, b, lineFor(fight(s), 'infection'))
  s.sounds.push('telegraph')
  // One per six bodies rather than per eight, and the difference is the whole
  // mechanic at the sizes in between: at eight a ten-man was handed exactly
  // one at a time, and one small thing on a floor cannot merge with anything.
  const count = Math.max(1, Math.round(s.party.length / 6))
  for (let i = 0; i < count && free.length > 0; i++) {
    const carrier = free.splice(rng.int(free.length), 1)[0]!
    addAura(carrier, 'infected', b.id)
    pushEffect(s, 'cast', carrier.pos, { abilityId: 'boss_infection' })
  }
}

/**
 * A small thing, born where the body carrying it was standing.
 *
 * Exported because what makes it is an aura ending, and aura expiry lives in
 * `sim.ts` beside the others that resolve that way. The place is the whole
 * mechanic: the carrier chose it by walking, and the healer chose when by
 * deciding whether to take the dot off early.
 */
export function birthOoze(s: SimState, carrier: Actor): void {
  if (s.mode !== 'raid') return
  // The cap is absolute and is checked here as well as at the infection,
  // because an infection applied under the cap can still end over it.
  if (oozes(s).length >= OOZE_CAP) return
  const born = makeAdd(s.nextObjectId++, carrier.pos.x, carrier.pos.y)
  born.spawn = 'ooze'
  born.eaten = 0
  born.name = 'Ooze'
  born.radius = 16
  born.moveSpeed = Math.round(carrier.moveSpeed * OOZE_SPEED)
  born.maxHp = OOZE_HP_PER_BODY * livingParty(s).length
  born.hp = born.maxHp
  // It walks at whoever made it rather than at whoever is nearest, and that is
  // half of this fight. Sent at the nearest body they all converge on the
  // melee and kill themselves for nothing; sent at their maker, where the
  // infected chose to stand decides the geometry a minute later.
  born.quarry = carrier.id
  s.actors.push(born)
  pushEffect(s, 'impact', carrier.pos, { abilityId: 'boss_ooze', power: 200 })
}

/** The small things, which are the only bodies in the game that combine. */
export function oozes(s: SimState): Actor[] {
  return s.actors.filter((a) => a.faction === 'boss' && a.alive && a.spawn === 'ooze')
}

/** What one of them is worth in a swing, which is what it has eaten. */
function oozeDamage(s: SimState, one: Actor): number {
  return mechanic(s, OOZE_DAMAGE * (1 + (one.eaten ?? 0)))
}

/**
 * The small things walking, touching, and becoming one another.
 *
 * The whole of the fight's own half of the mechanic. They are slow by design
 * -- a body can walk away from one -- because the demand is not that anybody
 * survive them; it is that the raid decide which of them to kill, which to let
 * live, and which two must not be allowed to meet.
 */
function updateOozes(s: SimState): void {
  const here = oozes(s)
  if (here.length === 0) return

  for (const one of here) {
    // Whoever made it, for as long as they are standing. After that it is an
    // ordinary body walking at whoever is nearest, which is what stops a small
    // thing outliving its own reason to exist.
    let target: Actor | null = null
    if (one.quarry !== undefined) {
      const maker = s.actors.find((a) => a.id === one.quarry)
      if (maker && maker.alive) target = maker
      else delete one.quarry
    }
    if (!target) {
      let best = Infinity
      for (const p of livingParty(s)) {
        const d = dist(one.pos, p.pos)
        if (d < best) {
          best = d
          target = p
        }
      }
    }
    if (!target) continue

    const away = dist(one.pos, target.pos)
    turnToward(one, Math.atan2(target.pos.y - one.pos.y, target.pos.x - one.pos.x))
    if (away > MELEE_RANGE) {
      // Through `hasteOf`, so the flood slows these exactly as it slows the
      // raid. A flood that only slowed the people answering it would be a tax
      // rather than a fact about the room.
      const step = one.moveSpeed * DT * hasteOf(one)
      const stepX = ((target.pos.x - one.pos.x) / away) * step
      const stepY = ((target.pos.y - one.pos.y) / away) * step
      one.pos.x += stepX
      one.pos.y += stepY
      holdOrFall(s, one)
      clearTerrain(s.obstacles, one.pos, one.radius, stepX, stepY)
    }

    one.swingTimer -= DT
    if (one.swingTimer <= 0 && away <= MELEE_RANGE + target.radius) {
      const damage = hit(s, oozeDamage(s, one))
      applyDamage(s, target, damage, 'physical', { sourceId: one.id, mechanic: 'ooze' })
      pushEffect(s, 'impact', target.pos, {
        abilityId: 'boss_ooze',
        power: damage,
        angle: Math.atan2(target.pos.y - one.pos.y, target.pos.x - one.pos.x),
      })
      one.swingTimer = ADD_SWING
    }
  }

  mergeOozes(s)
}

/**
 * Two of them touching, and the fifth touching being an event.
 *
 * Resolved after everything has moved rather than during the walk, so which
 * two of three meet is decided by where they all ended up and not by which of
 * them the loop happened to reach first. Determinism is not a nicety here: the
 * whole mechanic is a raid predicting this, and a prediction that depends on
 * iteration order is a prediction nobody can make.
 */
function mergeOozes(s: SimState): void {
  for (;;) {
    const here = oozes(s)
    let pair: [Actor, Actor] | null = null
    let closest = MERGE_REACH
    for (let i = 0; i < here.length; i++) {
      for (let j = i + 1; j < here.length; j++) {
        const gap = dist(here[i]!.pos, here[j]!.pos)
        if (gap < closest) {
          closest = gap
          pair = [here[i]!, here[j]!]
        }
      }
    }
    if (!pair) return

    const [one, other] = pair
    // The bigger of the two takes the smaller, so a chain of them reads as one
    // thing growing rather than as bodies swapping identities.
    const [keep, gone] = (one.eaten ?? 0) >= (other.eaten ?? 0) ? [one, other] : [other, one]
    keep.eaten = (keep.eaten ?? 0) + (gone.eaten ?? 0) + 1
    keep.maxHp += gone.maxHp
    keep.hp += gone.hp
    keep.pos.x = (keep.pos.x + gone.pos.x) / 2
    keep.pos.y = (keep.pos.y + gone.pos.y) / 2
    gone.alive = false
    pushEffect(s, 'impact', keep.pos, { abilityId: 'boss_merge', power: 300 })

    if (keep.eaten >= MERGE_BURST_AT) {
      // Not a body any more. Everything within reach pays, and the thing that
      // ate them is gone with it -- a fifth merging that left something
      // standing would be a mechanic the raid could only ever be behind.
      const bill = mechanic(s, MERGE_BURST_DAMAGE)
      for (const a of livingParty(s)) {
        if (dist(a.pos, keep.pos) > MERGE_BURST_REACH) continue
        applyDamage(s, a, bill, 'magic', { sourceId: BOSS_ID, mechanic: 'merge' })
        pushEffect(s, 'impact', a.pos, { abilityId: 'boss_merge', power: bill })
      }
      pushEffect(s, 'impact', keep.pos, {
        abilityId: 'boss_merge',
        radius: MERGE_BURST_REACH,
        power: bill,
        crit: true,
      })
      s.sounds.push('raid')
      keep.alive = false
    }
  }
}

/**
 * Ground that spreads from the boss and hurts nobody.
 *
 * The one hazard in this game with no damage on it at all. What it takes is
 * speed, from the raid and from the small things alike, and what that buys is
 * that a geometry seen late cannot be fixed -- which is the difference between
 * a mechanic about watching and a mechanic about reacting.
 */
function scheduleFlood(s: SimState, b: Actor, timing: PhaseTiming): void {
  if (timing.flood <= 0) return
  s.next.flood -= DT
  if (s.next.flood > 0) return
  s.next.flood = timing.flood

  say(s, b, lineFor(fight(s), 'flood'))
  s.ground.push({
    ...blankGround(s),
    kind: 'flood',
    pos: { x: b.pos.x, y: b.pos.y },
    // It starts at nothing and grows: `growth` is how fast the edge travels,
    // and the floor loop widens it. A patch that appeared at full width would
    // be a patch nobody watched spread, and watching it spread is the warning.
    radius: 0,
    growth: FLOOD_REACH / FLOOD_SPREAD,
    telegraph: 0,
    detonated: true,
    lingering: FLOOD_LINGER,
    damage: 0,
  })
  pushEffect(s, 'cast', b.pos, { abilityId: 'boss_flood' })
}

/**
 * The boss eating what nobody cleared, and the tank paying for it.
 *
 * This fight's tank swap, made out of its own material. Every other stack in
 * the game arrives on a clock the dealers cannot touch; this one is their
 * mistake, delivered to somebody else -- so the swap is a consequence rather
 * than a chore, and a raid that clears the floor never sees it at all.
 */
function scheduleEngulf(s: SimState, b: Actor, timing: PhaseTiming): void {
  if (timing.engulf <= 0) return
  s.next.engulf -= DT
  if (s.next.engulf > 0) return

  // Nothing to eat: the beat is held rather than reset, so a raid that cleared
  // the floor is not handed the next one early for having done so.
  const near = oozes(s).filter((a) => dist(a.pos, b.pos) <= ENGULF_REACH)
  if (near.length === 0) return
  s.next.engulf = timing.engulf

  const eaten = near[0]!
  eaten.alive = false
  pushEffect(s, 'impact', eaten.pos, { abilityId: 'boss_engulf', power: 260 })

  const holder = topThreatTarget(s)
  if (!holder) return
  stackAura(holder, 'engulfed', b.id)
  say(s, b, lineFor(fight(s), 'engulf'))
  const count = getAura(holder, 'engulfed')?.stacks ?? 0
  if (count < ENGULF_MAX) return

  // The eighth, which is the instant this mechanic is. Public on the tank all
  // the way up, so the swap is a decision made against a number the raid can
  // read rather than a surprise it can only learn by dying to.
  const bill = mechanic(s, ENGULF_BURST)
  applyDamage(s, holder, bill, 'magic', { sourceId: b.id, mechanic: 'engulf' })
  for (const a of livingParty(s)) {
    if (a.id === holder.id || dist(a.pos, holder.pos) > ENGULF_BURST_REACH) continue
    applyDamage(s, a, bill / 2, 'magic', { sourceId: b.id, mechanic: 'engulf' })
  }
  pushEffect(s, 'impact', holder.pos, {
    abilityId: 'boss_engulf',
    radius: ENGULF_BURST_REACH,
    power: bill,
    crit: true,
  })
  s.sounds.push('raid')
  holder.auras = holder.auras.filter((au) => au.id !== 'engulfed')
}

/** What the boss has eaten, as a multiplier on its own hands. */
function engulfPower(s: SimState): number {
  const holder = topThreatTarget(s)
  const count = holder ? (getAura(holder, 'engulfed')?.stacks ?? 0) : 0
  return 1 + count * ENGULF_POWER
}

// --- the two flasks -------------------------------------------------------
//
// Two demands on one clock. Everybody inside one circle, and the circle is a
// body that has to keep walking away from something it cannot kill. Each half
// is ordinary; together neither of them is, because the quarry has to be
// moving and reachable at the same instant and the raid has to walk to a point
// rather than to a place.

/**
 * Glass on the floor, which is the one familiar thing this fight does.
 *
 * Billed in two parts on purpose. What lands at the instant the count ends is
 * large and binary -- rule 1 -- and what it leaves is a rate for anybody who
 * stayed. The residue is twelve seconds because the other two demands are
 * about *where the raid can be*, and floor that stays is what makes three
 * questions into one.
 */
function scheduleCaustic(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.caustic <= 0) return
  s.next.caustic -= DT
  if (s.next.caustic > 0) return
  s.next.caustic = timing.caustic

  say(s, b, lineFor(fight(s), 'caustic'))
  s.sounds.push('telegraph')
  const count = Math.max(1, Math.round(s.party.length / 8))
  const victims = livingParty(s)
  for (let i = 0; i < count && victims.length > 0; i++) {
    // Under somebody rather than at a rolled bearing: a pool that lands where
    // nobody is standing is a pool nobody has to walk out of.
    const under = victims.splice(rng.int(victims.length), 1)[0]!
    s.ground.push({
      ...blankGround(s),
      kind: 'caustic',
      pos: { x: under.pos.x, y: under.pos.y },
      radius: CAUSTIC_RADIUS,
      telegraph: CAUSTIC_TELEGRAPH,
      lingering: CAUSTIC_LINGER,
      damage: CAUSTIC_LANDING,
    })
  }
}

/**
 * Something that has picked one body and cannot be killed.
 *
 * It has no health for a reason: a killable one would be answered by turning
 * the raid's damage round, and this fight already asks for that nowhere. What
 * it is worth is that one named body has to keep walking for twenty-two
 * seconds -- and that those twenty-two seconds are where the gathering lands.
 *
 * Never the tank: a tank walking for that long takes the fight with them, and
 * a circle centred on the tank is a circle centred on the boss, which is a
 * different mechanic and a much easier one.
 */
function scheduleHound(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.hound <= 0) return
  s.next.hound -= DT
  if (s.next.hound > 0) return

  // One at a time, whatever the headcount -- rule 5, and the beat is held
  // rather than reset so a fight whose tempo has been shortened does not hand
  // out a second before the first has run out. At three rungs the tempo
  // multiplier put the next one twenty seconds after the last on a
  // twenty-two second hound, so the smallest raid was never not being chased.
  if (livingParty(s).some((a) => getAura(a, 'hounded'))) return
  const free = livingParty(s).filter((a) => a.role !== 'tank' && !getAura(a, 'hounded'))
  if (free.length === 0) return
  const quarry = rng.pick(free)
  s.next.hound = timing.hound
  addAura(quarry, 'hounded', b.id)
  const mark = getAura(quarry, 'hounded')
  // It comes out of the wall behind the boss and walks in, so the first thing
  // the quarry does is put distance between them rather than discover it
  // already standing on them.
  const from = spawnSpot(s, rng, HOUND_REACH)
  if (mark) mark.at = { x: from.x, y: from.y }
  say(s, b, lineFor(fight(s), 'hound'))
  s.sounds.push('telegraph')
  pushEffect(s, 'cast', from, { abilityId: 'boss_hound' })
}

/**
 * The hound walking, and billing whoever it has caught up with.
 *
 * Its position lives on the mark rather than as a body on the field, which is
 * what makes it unkillable without needing a rule that says so: there is
 * nothing there to aim at. Slower than a person, so walking opens the gap and
 * standing closes it.
 */
function updateHounds(s: SimState): void {
  for (const a of livingParty(s)) {
    const mark = getAura(a, 'hounded')
    if (!mark?.at) continue
    const away = dist(mark.at, a.pos)
    if (away > 1) {
      const step = a.moveSpeed * HOUND_SPEED * DT
      mark.at.x += ((a.pos.x - mark.at.x) / away) * step
      mark.at.y += ((a.pos.y - mark.at.y) / away) * step
    }
    if (away <= HOUND_REACH) {
      applyDamage(s, a, mechanic(s, HOUND_TICK) * DT, 'magic', {
        sourceId: BOSS_ID,
        mechanic: 'hound',
        silent: true,
      })
    }
  }
}

/** Whoever the hound is walking at, if anybody. */
export function houndedBody(s: SimState): Actor | null {
  return livingParty(s).find((a) => getAura(a, 'hounded') !== undefined) ?? null
}

/**
 * Everybody inside one circle, and the bill divided by whoever came.
 *
 * The centre is the mechanic. Without the chase it lands on the middle of the
 * raid, which is a circle a crowd is standing in already; with it, it lands on
 * the body the hound is walking at and follows them for the whole count -- so
 * the quarry has to keep moving and stay reachable, and everybody else has to
 * walk to a point rather than to a place.
 *
 * Five seconds, which is the longest count in the game and is measured against
 * exactly that: twenty-five people can reach a moving point in five, cannot in
 * three, and in eight the quarry has crossed the room and the circle means
 * nothing.
 */
function scheduleGather(s: SimState, b: Actor, timing: PhaseTiming): void {
  if (timing.gather <= 0) return
  s.next.gather -= DT
  if (s.next.gather > 0) return
  s.next.gather = timing.gather

  const chased = timing.chase > 0 ? houndedBody(s) : null
  const at = chased ? { x: chased.pos.x, y: chased.pos.y } : partyMiddle(s)
  say(s, b, lineFor(fight(s), 'gather'))
  s.sounds.push('telegraph')
  s.ground.push({
    ...blankGround(s),
    kind: 'gather',
    pos: at,
    radius: GATHER_RADIUS,
    telegraph: GATHER_TELEGRAPH,
    lingering: 0,
    // The pot, which is the roster's size rather than a number: what the
    // circle asks is that everybody came, and what it costs when they did has
    // to be the same bill at five as at twenty-five.
    damage: GATHER_PER_BODY * s.party.length,
    // Whose feet it is following, or nobody. Read every tick by the floor
    // loop, which is what makes the circle slide.
    ...(chased ? { named: chased.id } : {}),
  })
}

/** The middle of the raid, for a circle with nobody to follow. */
function partyMiddle(s: SimState): Vec2 {
  const here = livingParty(s)
  if (here.length === 0) return { x: 0, y: 0 }
  let x = 0
  let y = 0
  for (const a of here) {
    x += a.pos.x
    y += a.pos.y
  }
  return { x: x / here.length, y: y / here.length }
}

/**
 * Two flasks on the floor, with a long count and a small radius.
 *
 * The one demand on this boss answered by being early. Twenty seconds is long
 * enough that nothing about it is urgent until it is too late to walk, which
 * is the whole point and is also the thing a reaction channel cannot express
 * -- see `walkEarly` in `ai.ts`.
 *
 * Standing on one holds its count, which makes it a place somebody has to
 * spend time in rather than a timer everybody walks away from and forgets.
 */
function scheduleDecant(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.decant <= 0) return
  s.next.decant -= DT
  if (s.next.decant > 0) return
  s.next.decant = timing.decant
  // Two still standing is two the raid has not dealt with; a third would be a
  // fight adding to a problem rather than repeating one.
  if (s.ground.some((g) => g.kind === 'decant')) return

  say(s, b, lineFor(fight(s), 'decant'))
  const reach = roomReach(s.room)
  for (let i = 0; i < 2; i++) {
    const bearing = rng.range(0, Math.PI * 2)
    const away = reach * rng.range(0.35, 0.7)
    const at = { x: b.pos.x + Math.cos(bearing) * away, y: b.pos.y + Math.sin(bearing) * away }
    pushInside(s.room, at, DECANT_RADIUS)
    s.ground.push({
      ...blankGround(s),
      kind: 'decant',
      pos: at,
      radius: DECANT_RADIUS,
      telegraph: DECANT_COUNT,
      lingering: 0,
      damage: DECANT_DAMAGE,
    })
    pushEffect(s, 'cast', at, { abilityId: 'boss_decant' })
  }
}

/**
 * The boss drinking its own work, and the tank paying for it.
 *
 * A public count from the first draught, so the swap is a decision made
 * against a number rather than a surprise learned by dying to it.
 */
function scheduleReagent(s: SimState, b: Actor, timing: PhaseTiming): void {
  if (timing.reagent <= 0) return
  s.next.reagent -= DT
  if (s.next.reagent > 0) return
  s.next.reagent = timing.reagent

  const holder = topThreatTarget(s)
  if (!holder) return
  stackAura(holder, 'dosed', b.id)
  // The boss brightens for a frame, so the count on the tank has a visible
  // cause rather than appearing to come from the tank.
  pushEffect(s, 'cast', b.pos, { abilityId: 'boss_reagent' })
  const count = getAura(holder, 'dosed')?.stacks ?? 0
  if (count < REAGENT_MAX) {
    say(s, b, lineFor(fight(s), 'reagent'))
    return
  }

  const bill = mechanic(s, REAGENT_BURST)
  applyDamage(s, holder, bill, 'magic', { sourceId: b.id, mechanic: 'reagent' })
  for (const a of livingParty(s)) {
    if (a.id === holder.id || dist(a.pos, holder.pos) > REAGENT_BURST_REACH) continue
    applyDamage(s, a, bill / 2, 'magic', { sourceId: b.id, mechanic: 'reagent' })
  }
  pushEffect(s, 'impact', holder.pos, {
    abilityId: 'boss_reagent',
    radius: REAGENT_BURST_REACH,
    power: bill,
    crit: true,
  })
  s.sounds.push('raid')
  holder.auras = holder.auras.filter((au) => au.id !== 'dosed')
}

/** What the boss has drunk, as a multiplier on its own hands. */
function reagentPower(s: SimState): number {
  const holder = topThreatTarget(s)
  const count = holder ? (getAura(holder, 'dosed')?.stacks ?? 0) : 0
  return 1 + count * REAGENT_POWER
}

/**
 * The room rising, which is the one mechanic here that belongs to a room.
 *
 * An arc of the wall goes under and the middle never does. Both halves are the
 * rule rather than the flavour: floor taken away super-scales -- rule 5 -- and
 * a room with merging bodies in it and nowhere dry to put them is a moment
 * with no answer, so the inner circle is guaranteed and the arc is capped.
 *
 * Circles along an arc rather than a shape of its own, for the reason the cold
 * line is circles: the floor already knows how to draw one, the party already
 * knows how to leave one, and what a person answers is one patch reaching
 * them. An arc is only what a row of them looks like from above -- and an arc
 * is concave, which is a shape terrain may not be and ground may.
 */
function scheduleSlime(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.slime <= 0) return
  s.next.slime -= DT
  if (s.next.slime > 0) return
  s.next.slime = timing.slime

  // The lane the patches sit in: far enough out that the dry middle is
  // guaranteed by arithmetic rather than by hope, and inside the wall by their
  // own radius so none of them is half outside the room.
  const reach = roomReach(s.room)
  const lane = Math.max(SLIME_DRY + SLIME_PATCH, reach - SLIME_PATCH)
  if (lane + SLIME_PATCH > reach + SLIME_PATCH * 0.5) {
    // A room too small to have an outside without swallowing its middle keeps
    // its floor. Nothing in the citadel is that small today; the day one is,
    // this is the line that decides it rather than a wipe nobody expected.
  }
  say(s, b, lineFor(fight(s), 'slime'))
  s.sounds.push('telegraph')
  const from = rng.range(0, Math.PI * 2)
  // A fixed number of patches whatever the headcount. The room is the room.
  const step = (Math.PI * 2) / (SLIME_ARC * 2.4)
  for (let i = 0; i < SLIME_ARC; i++) {
    const bearing = from + (i - (SLIME_ARC - 1) / 2) * step
    const at = { x: Math.cos(bearing) * lane, y: Math.sin(bearing) * lane }
    pushInside(s.room, at, SLIME_PATCH)
    // And never over the middle, whatever the room's shape did to the point
    // above: a hall is not a circle, and pushing a patch inside one can walk
    // it inwards.
    if (Math.hypot(at.x, at.y) < SLIME_DRY + SLIME_PATCH) continue
    s.ground.push({
      ...blankGround(s),
      kind: 'slime',
      pos: at,
      radius: SLIME_PATCH,
      telegraph: SLIME_TELEGRAPH,
      lingering: SLIME_LINGER,
      damage: SLIME_TICK,
    })
  }
}

function makeAdd(id: number, x: number, y: number): Actor {
  return {
    id,
    name: 'Thrall',
    classId: 'rogue',
    spec: 'assassination',
    role: 'dps',
    melee: true,
    armor: 0,
    block: 0,
    faction: 'boss',
    pos: { x, y },
    prevPos: { x, y },
    radius: 20,
    moveSpeed: 130,
    hp: ADD_HP,
    maxHp: ADD_HP,
    resource: 'mana',
    power: 0,
    maxPower: 0,
    alive: true,
    gcd: 0,
    cooldowns: {},
    auras: [],
    castId: null,
    castRemaining: 0,
    castTotal: 0,
    castTargetId: null,
    isPlayer: false,
    ai: null,
    swingTimer: 1.5,
    facing: 0,
  }
}

/**
 * The elite that walks in at the first phase break.
 *
 * A thrall's shape with a thrall's rules — it chases whoever is nearest and
 * hits them — and everything else about it larger. It is deliberately not a
 * second boss: a boss is a script of mechanics, and a script the raid meets
 * once per pull halfway through is a script nobody can learn without spending
 * the first half of the fight to reach it. What this is instead is a target
 * that moves, in a fight whose target has never moved much, standing between
 * the raid and the thing it came for.
 */
function makeHerald(id: number, x: number, y: number, name: string, hp: number): Actor {
  const a = makeAdd(id, x, y)
  a.name = name
  a.spawn = 'herald'
  a.hp = hp
  a.maxHp = hp
  // Big enough to read as the thing the fight stopped for, and slower than the
  // thralls around it so the escort arrives first.
  a.radius = 30
  a.moveSpeed = 105
  a.swingTimer = 2.5
  return a
}

/** Adds simply chase the nearest living party member. */
function updateAdds(s: SimState): void {
  for (const add of adds(s)) {
    // A spike does not walk and does not swing: it stands on the body it
    // pinned, and what the raid does about it is break it.
    if (add.spawn === 'spike') continue
    // And a small thing walks by its own rules, in `updateOozes`: it goes for
    // whoever made it rather than whoever is nearest, and it can become
    // another one. Walking it here as well moved it twice a tick.
    if (add.spawn === 'ooze') continue

    let nearest: Actor | null = null
    let best = Infinity

    // A blood beast has chosen, and the choice is the mechanic.
    //
    // Its hits are what fills the gorged one's gauge, so *who* it walks at
    // decides how fast the bar moves. Sent at whoever is nearest it dies in
    // the melee where the damage already is, which is no decision at all --
    // the raid would have killed it standing still. Sent at a named body, that
    // body has to bring it to the damage, and the raid has to stop what it is
    // doing and meet it.
    //
    // It is not a stalker: when the body it chose goes down it carries on with
    // whoever is nearest, because it is an ordinary thrall that happens to
    // have chosen.
    if (add.spawn === 'beast' && add.quarry !== undefined) {
      const quarry = s.actors.find((a) => a.id === add.quarry)
      if (quarry && quarry.alive) {
        nearest = quarry
        best = dist(add.pos, quarry.pos)
      } else {
        delete add.quarry
      }
    }

    if (!nearest) {
      for (const p of livingParty(s)) {
        const d = dist(add.pos, p.pos)
        if (d < best) {
          best = d
          nearest = p
        }
      }
    }
    if (!nearest) continue

    // Which way it is turned. Nothing but the drawing reads this on an add,
    // so it was never set, and every thrall in the game spent the whole fight
    // facing right. One chasing somebody to its left walked there backwards.
    turnToward(add, Math.atan2(nearest.pos.y - add.pos.y, nearest.pos.x - add.pos.x))

    if (best > MELEE_RANGE) {
      const stepX = ((nearest.pos.x - add.pos.x) / best) * add.moveSpeed * DT
      const stepY = ((nearest.pos.y - add.pos.y) / best) * add.moveSpeed * DT
      add.pos.x += stepX
      add.pos.y += stepY
      // Whatever the fight summoned is held to the same floor the raid is. It
      // walks at a body and bodies are on the floor, so this is the fall the
      // room does rather than one it chooses.
      holdOrFall(s, add)
      clearTerrain(s.obstacles, add.pos, add.radius, stepX, stepY)
    }

    add.swingTimer -= DT
    if (add.swingTimer <= 0 && best <= MELEE_RANGE + nearest.radius) {
      const damage = hit(
        s,
        (add.spawn === 'herald' ? HERALD_DAMAGE : ADD_DAMAGE) *
          (getAura(add, 'empowered') ? EMPOWER_POWER : 1),
      )
      applyDamage(s, nearest, damage, 'physical', {
        sourceId: add.id,
        // A beast landing a hit is a named mistake rather than the wave
        // arriving: the raid had the whole of its walk across the room to stop
        // it, and every one of these is a deposit.
        ...(add.spawn === 'beast' ? { mechanic: 'adds' as const } : {}),
      })
      if (add.spawn === 'beast') siphonFeed(s, SIPHON_PER_ADD_HIT, nearest.pos)
      pushEffect(s, 'impact', nearest.pos, {
        abilityId:
          add.spawn === 'herald' ? 'boss_herald' : 'boss_thrall',
        power: damage,
        angle: Math.atan2(nearest.pos.y - add.pos.y, nearest.pos.x - add.pos.x),
      })
      add.swingTimer = ADD_SWING
    }
  }

  // Corpses are dropped once they stop being useful to draw.
  s.actors = s.actors.filter((a) => a.faction !== 'boss' || a.alive || a.id === boss(s).id)
}

function blankGround(s: SimState): GroundEffect {
  return {
    id: s.nextObjectId++,
    kind: 'coldflame',
    pos: { x: 0, y: 0 },
    radius: 0,
    telegraph: 0,
    lingering: 0,
    damage: 0,
    detonated: false,
    angle: 0,
    halfWidth: 0,
    growth: 0,
    band: 0,
    caught: [],
    turn: 0,
    pulses: 0,
  }
}

/** Resolves the boss cast that just finished. */
export function resolveBossCast(s: SimState, castId: string, targetId: number | null): void {
  const b = boss(s)

  if (castId === 'boss_slam') {
    const target = s.actors.find((a) => a.id === targetId)
    if (target && target.alive && dist(b.pos, target.pos) <= MELEE_RANGE + target.radius + 20) {
      const damage = hit(s, fight(s).slamDamage * gaugePower(s))
      applyDamage(s, target, damage, 'physical', { sourceId: b.id })
      // And a third of it again on whoever is wearing the mark, and on whoever
      // is standing with them. This is the instant the mark is: a body that is
      // not tanking taking a share of a tank's hit, far enough from the raid
      // that a healer who was not already watching has to notice and answer
      // inside one cast.
      markShare(s, b, target, damage, CHAMPION_SLAM, true)
      pushEffect(s, 'impact', target.pos, {
        abilityId: 'boss_slam',
        power: damage,
        angle: Math.atan2(target.pos.y - b.pos.y, target.pos.x - b.pos.x),
      })
    }
    return
  }

  if (castId === 'boss_spray') {
    const cone = s.ground.find((g) => g.kind === 'spray' && !g.detonated)
    if (!cone) return
    cone.detonated = true
    cone.lingering = 0.3
    for (const a of livingParty(s)) {
      if (!insideCone(a.pos, cone)) continue
      const damage = mechanic(s, cone.damage)
      applyDamage(s, a, damage, 'magic', { sourceId: b.id, mechanic: 'spray' })
      // Along the cone rather than along the line to the boss, so the streak
      // reads as the spray going through them.
      pushEffect(s, 'impact', a.pos, { abilityId: 'boss_spray', power: damage, angle: cone.angle })
    }
    pushEffect(s, 'impact', b.pos, {
      abilityId: 'boss_spray',
      power: cone.damage,
      angle: cone.angle,
      crit: true,
    })
    return
  }

  if (castId === 'boss_frostbolt') {
    loose(s, targetId)
    return
  }

}

export function insideCone(p: { x: number; y: number }, cone: GroundEffect): boolean {
  const dx = p.x - cone.pos.x
  const dy = p.y - cone.pos.y
  const d = Math.hypot(dx, dy)
  if (d > cone.radius) return false

  let delta = Math.atan2(dy, dx) - cone.angle
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  return Math.abs(delta) <= cone.halfWidth
}

/**
 * Whether the flood takes anything from this body.
 *
 * The raid and the fight's own small bodies, and nothing else. It is a
 * function rather than two lines inside the floor's own arm because a hazard
 * arm that names another mechanic is a hazard arm doing two jobs, and there is
 * a check downstairs that says so.
 */
function slowable(a: Actor): boolean {
  return a.faction === 'party' || a.spawn === 'ooze'
}

/** Ground damage is applied once per second while standing in a live puddle. */
export function updateGround(s: SimState): void {
  for (const g of s.ground) {
    // A cone is a telegraph and nothing else: what it costs lands when the
    // cast resolves, and the shape on the floor is only what the raid reads to
    // be somewhere else by then.
    if (g.kind === 'spray') {
      if (!g.detonated) g.telegraph -= DT
      else g.lingering -= lingerStep(s)
      continue
    }

    // Glass on the floor: one large hit at the instant it lands, and a rate
    // for whoever is still standing in it after. The two halves are different
    // mechanics wearing one shape -- the instant is what practice answers, and
    // the rate is what standing there costs.
    if (g.kind === 'caustic') {
      if (!g.detonated) {
        g.telegraph -= DT
        if (g.telegraph <= 0) {
          g.detonated = true
          pushEffect(s, 'impact', g.pos, {
            radius: g.radius,
            abilityId: 'boss_caustic',
            power: g.damage,
            crit: true,
          })
          for (const a of livingParty(s)) {
            if (dist(a.pos, g.pos) > g.radius - a.radius * 0.6) continue
            const bill = mechanic(s, g.damage)
            applyDamage(s, a, bill, 'magic', { sourceId: BOSS_ID, mechanic: 'caustic' })
            pushEffect(s, 'impact', a.pos, { abilityId: 'boss_caustic', power: bill })
          }
        }
        continue
      }
      g.lingering -= lingerStep(s)
      for (const a of livingParty(s)) {
        if (dist(a.pos, g.pos) > g.radius - a.radius * 0.6) continue
        applyDamage(s, a, mechanic(s, CAUSTIC_TICK * DT), 'magic', {
          sourceId: BOSS_ID,
          mechanic: 'caustic',
          silent: true,
        })
      }
      continue
    }

    // The circle everybody has to be inside, sliding after whoever it named.
    //
    // The slide is the fight. A circle on a fixed point is a place, and a
    // crowd is standing in a place already; a circle on a body that is
    // walking away from something it cannot kill is a point, and reaching a
    // point takes everybody deciding to.
    if (g.kind === 'gather') {
      if (g.named !== undefined) {
        const chased = s.actors.find((a) => a.id === g.named)
        if (chased && chased.alive) {
          g.pos.x = chased.pos.x
          g.pos.y = chased.pos.y
        }
      }
      g.telegraph -= DT
      if (g.telegraph > 0) continue
      g.detonated = true
      // Divided by whoever came, and paid in full by everybody if nobody did.
      // The division is the mechanic: what it asks is not that anyone survive
      // it, it is that everyone arrive.
      const came = livingParty(s).filter((a) => dist(a.pos, g.pos) <= g.radius)
      const bill = mechanic(s, g.damage) / Math.max(1, came.length)
      for (const a of came.length > 0 ? came : livingParty(s)) {
        applyDamage(s, a, came.length > 0 ? bill : mechanic(s, g.damage), 'magic', {
          sourceId: BOSS_ID,
          mechanic: 'gather',
        })
      }
      pushEffect(s, 'impact', g.pos, {
        radius: g.radius,
        abilityId: 'boss_gather',
        power: bill,
        crit: true,
      })
      s.sounds.push('raid')
      continue
    }

    // A flask, which is the only piece of ground here that is a thing rather
    // than a hazard. Its count runs for twenty seconds and stops while
    // somebody is standing on it -- so it is a place to be spent time in, and
    // the demand is to leave it long before leaving matters.
    if (g.kind === 'decant') {
      if (g.detonated) {
        g.lingering -= lingerStep(s)
        continue
      }
      const holding = livingParty(s).filter((a) => dist(a.pos, g.pos) <= g.radius)
      for (const a of holding) {
        applyDamage(s, a, mechanic(s, DECANT_TICK * DT), 'magic', {
          sourceId: BOSS_ID,
          mechanic: 'decant',
          silent: true,
        })
      }
      // Held rather than slowed: one body is enough, and a second adds
      // nothing, because what stops the count is that the place is occupied.
      g.held = holding.length > 0
      if (g.held) continue
      g.telegraph -= DT
      if (g.telegraph > 0) continue
      g.detonated = true
      g.lingering = 0.4
      const bill = mechanic(s, g.damage)
      for (const a of livingParty(s)) {
        if (dist(a.pos, g.pos) > g.radius) continue
        applyDamage(s, a, bill, 'magic', { sourceId: BOSS_ID, mechanic: 'decant' })
      }
      pushEffect(s, 'impact', g.pos, {
        radius: g.radius,
        abilityId: 'boss_decant',
        power: bill,
        crit: true,
      })
      s.sounds.push('raid')
      continue
    }

    // The room going under, which behaves like a pool and is not one: what it
    // costs is the same every tick it is stood in, and what it is for is that
    // the outside of the room stops being floor for a while.
    if (g.kind === 'slime') {
      if (!g.detonated) {
        g.telegraph -= DT
        if (g.telegraph <= 0) {
          g.detonated = true
          pushEffect(s, 'impact', g.pos, {
            radius: g.radius,
            abilityId: 'boss_slime',
            power: g.radius * 6,
          })
        }
        continue
      }
      g.lingering -= lingerStep(s)
      for (const a of livingParty(s)) {
        if (dist(a.pos, g.pos) > g.radius - a.radius * 0.6) continue
        applyDamage(s, a, mechanic(s, g.damage * DT), 'magic', {
          sourceId: BOSS_ID,
          mechanic: 'slime',
          silent: true,
        })
      }
      continue
    }

    // The flood, which is the one piece of hazardous floor in this game that
    // is not hazardous. It spreads, it lingers, and everything standing on it
    // -- the raid and the fight's own small bodies alike -- is slowed while it
    // stands there. Nothing is billed at all: what it takes is the option of
    // fixing a geometry late.
    if (g.kind === 'flood') {
      g.radius = Math.min(FLOOD_REACH, g.radius + g.growth * DT)
      g.lingering -= lingerStep(s)
      for (const a of s.actors) {
        if (!a.alive || !slowable(a)) continue
        if (dist(a.pos, g.pos) > g.radius) continue
        // Refreshed rather than applied, so it ends when the body leaves
        // rather than on a clock of its own.
        addAura(a, 'mired', BOSS_ID)
      }
      continue
    }












    if (!g.detonated) {
      g.telegraph -= DT
      if (g.telegraph <= 0) {
        g.detonated = true
        // Its own name, so a boss that owns one kind of hazardous floor is not
        // reported as owning the other. The two look different on the screen
        // and they have to read differently in the effect log as well.
        // Its own name. A boss that owns one kind of hazardous floor must not
        // be reported as owning another: they look different on the screen and
        // they have to read differently in the effect log as well.
        const mark = `boss_${g.kind}`
        // The floor going off, at the size it went off at. Everything that
        // followed used to be the only sign it had.
        pushEffect(s, 'impact', g.pos, {
          radius: g.radius,
          abilityId: mark,
          power: g.radius * 12,
          crit: true,
        })
        for (const a of livingParty(s)) {
          if (dist(a.pos, g.pos) <= g.radius - a.radius * 0.6) {
            const damage = mechanic(s, g.damage)
            applyDamage(s, a, damage, 'magic', { sourceId: BOSS_ID, mechanic: g.kind })
            pushEffect(s, 'impact', a.pos, { abilityId: mark, power: damage })
          }
        }
      }
      continue
    }

    g.lingering -= lingerStep(s)
    for (const a of livingParty(s)) {
      if (dist(a.pos, g.pos) <= g.radius - a.radius * 0.6) {
        // Per-tick residue: silent, and not a separate "mechanic hit" each frame.
        applyDamage(s, a, mechanic(s, 110 * DT), 'magic', { sourceId: BOSS_ID, silent: true })
      }
    }
  }

  // Both of the two kinds left are floor: they go off, they keep burning for
  // as long as they were given, and then they are gone. Fifteen other kinds
  // each had a line here saying which part of that they skipped.
  s.ground = s.ground.filter((g) => !g.detonated || g.lingering > 0)
}

/** Everyone close enough to be paying a share of this one's yoke right now. */

// --- what the raid is hitting, rather than where it is standing ------------
//
// One mechanic that asks a different kind of question from every other on this
// table: not "where do I stand" but "what do I hit". It exists because the one
// thing here that already claimed to ask it — the thralls — measured at
// nothing, and it is worth writing down why. A wave of thralls walks in and
// hits somebody, so every rule the party already has aims it at them: there is
// no instant at which a raid either did the thing or did not, and a mechanic
// with no such instant has nothing a reaction delay can be charged against. It
// is a damage check wearing a mechanic's clothes.
//
// The spike has such an instant. A body is pinned and stays pinned until
// somebody stops hitting the boss and breaks it, and the raid either did that
// or it did not. It is answered through the target call in `ai.ts`, which is
// where the reaction delay and the fumble roll live.

/**
 * Spikes: how many go up, how much each holds, and how far off the victim.
 *
 * Per body rather than flat, like every other summon here, so a bigger raid is
 * not the raid where nobody is ever pinned. Small health on purpose: the
 * demand is that somebody stops and turns, not that the raid brings a second
 * damage phase — measured, an add that takes real seconds to kill stops being
 * a target call and becomes a second boss.
 *
 * The first draft said all of that and then set the number at 210 a body,
 * which at twenty-five is three spikes of five thousand every twenty seconds —
 * about a quarter of everything the raid deals, taken off the boss. The
 * Watcher went to 3% won by a ninth pull against a floor of 50 and
 * `balancecheck` said so. Sixty-two is a spike that costs the raid a second
 * and a half of its damage, which is a turn rather than a phase.
 */
const SPIKE_HP_PER_BODY = 62
const SPIKE_PER_BODIES = 9

function spikeHealth(s: SimState): number {
  return Math.round(SPIKE_HP_PER_BODY * livingParty(s).length)
}

/**
 * Bodies pinned where they stand, until somebody else breaks what holds them.
 *
 * The one mechanic in this game whose answer is not a step. Everything else
 * the floor does is answered by walking off it, which is a thing the person in
 * trouble does for themselves; this takes their feet, so the answer has to
 * come from the rest of the raid — and it has to come as damage aimed
 * somewhere other than the boss, which is the only target call the fight makes
 * that costs the raid its own damage to obey.
 *
 * The spike stands on the victim rather than beside them. Where it is is not
 * a question the mechanic asks: it is on the person, so finding it is reading
 * a party frame, and the walk to it is whatever the raid's positions already
 * were.
 */
function scheduleSpikes(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.spike <= 0) return
  s.next.spike -= DT
  if (s.next.spike > 0) return
  s.next.spike = timing.spike

  // Not while it is storming.
  //
  // The one stretch of this fight where the boss is doing a single thing, and
  // it was doing three: the original pins nobody while it whirls, because
  // pinning is what it does *instead* of whirling. Two spikes a storm, and
  // each of them asked the raid to stop and turn round at the exact moment
  // the rest of the fight is telling it to keep moving -- two demands that
  // cannot both be answered, which is not difficulty, it is noise.
  if (getAura(b, 'storming')) return

  // Never onto somebody already held, and never onto the tank.
  //
  // The first is arithmetic: two spikes on one body is one mechanic charged
  // twice and a second body left alone, which is the opposite of what it is
  // for. The second is the same argument the reach already makes in its own
  // comment — a tank pinned leaves the boss standing loose in the middle of
  // the raid, so what arrives is not a decision, it is an accident. The
  // original pins tanks; this engine cannot afford to.
  const free = livingParty(s).filter((a) => a.role !== 'tank' && !getAura(a, 'spiked'))
  if (free.length === 0) return

  say(s, b, lineFor(fight(s), 'spike'))
  s.sounds.push('telegraph')

  const count = Math.max(1, Math.round(s.party.length / SPIKE_PER_BODIES))
  for (let i = 0; i < count && free.length > 0; i++) {
    const victim = free.splice(rng.int(free.length), 1)[0]!
    const spike = makeAdd(s.nextObjectId++, victim.pos.x, victim.pos.y)
    spike.name = 'Spike'
    spike.spawn = 'spike'
    // It does not walk and it does not swing; `updateAdds` leaves it alone.
    spike.moveSpeed = 0
    spike.maxHp = spikeHealth(s)
    spike.hp = spike.maxHp
    s.actors.push(spike)

    addAura(victim, 'spiked', spike.id)
    pushEffect(s, 'cast', victim.pos, { abilityId: 'boss_spike' })
  }
}

/**
 * The spike that was holding somebody, taken off the field.
 *
 * By the spike's own id rather than by looking the aura up on the victim,
 * which is what this did and why it never once worked: the only caller is the
 * aura running out, and `updateTimers` splices the aura off before it calls
 * anything about it. So the lookup always missed, the function always returned
 * on its first line, and every spike whose pin expired stayed standing —
 * seven of them at the end of a pull, each one still a body the raid would
 * stop and hit if the target call had not been taught to check.
 */
export function freeSpiked(s: SimState, spikeId: number): void {
  const spike = s.actors.find((a) => a.id === spikeId && a.spawn === 'spike')
  if (spike) spike.alive = false
}

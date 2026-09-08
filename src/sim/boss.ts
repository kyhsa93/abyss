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

  updateAdds(s)
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
      fight(s).swingDamage * (1 + breaths * INHALE_POWER) * (1 + swollen * BLOAT_POWER),
    )
    applyDamage(s, target, damage, 'physical', { sourceId: b.id })
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

    let nearest: Actor | null = null
    let best = Infinity

    {
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
      applyDamage(s, nearest, damage, 'physical', { sourceId: add.id })
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
      const damage = hit(s, fight(s).slamDamage)
      applyDamage(s, target, damage, 'physical', { sourceId: b.id })
      pushEffect(s, 'impact', target.pos, {
        abilityId: 'boss_slam',
        power: damage,
        angle: Math.atan2(target.pos.y - b.pos.y, target.pos.x - b.pos.x),
      })
    }
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

/** Ground damage is applied once per second while standing in a live puddle. */
export function updateGround(s: SimState): void {
  for (const g of s.ground) {












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

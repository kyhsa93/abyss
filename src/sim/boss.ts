import {
  ARENA_RADIUS,
  BURDEN_HANDS,
  BURDEN_REACH,
  readable,
  ECHO_BEAT,
  CRUSH_TELEGRAPH,
  BLIGHT_RELIEF,
  BLIGHT_TICK,
  COLDFLAME_CRAWL,
  COLDFLAME_RADIUS,
  COLDFLAME_REACH,
  COLDFLAME_STEP,
  COLDFLAME_TELEGRAPH,
  BLOAT_BURST,
  BLOAT_POWER,
  BLOAT_BURST_AT,
  BLOAT_SPLASH,
  INHALE_HASTE,
  INHALE_MAX,
  INHALE_POWER,
  INOCULATED_SHARE,
  SPORE_REACH,
  PUNGENT_PER_BREATH,
  DT,
  CHANT_CAST,
  FAULT_TELEGRAPH,
  GAZE_ARC,
  GAZE_TELEGRAPH,
  GLOBAL_COOLDOWN,
  GRASP_DAMAGE,
  GRASP_REACH,
  GRASP_TELEGRAPH,
  MELEE_RANGE,
  PUDDLE_TELEGRAPH,
  REFUGE_DAMAGE,
  REFUGE_RADIUS,
  REFUGE_RING,
  REFUGE_TELEGRAPH,
  SHALLOWS_COUNT,
  SHALLOWS_RADIUS,
  SHALLOWS_TELEGRAPH,
  SCHISM_APART,
  SCHISM_ROOM,
  SCHISM_TELEGRAPH,
  SOAK_RADIUS,
  SOAK_EACH,
  SOAK_MAX_SHARE,
  SOAK_TELEGRAPH,
  STALKER_DAMAGE,
  STALKER_HP,
  STALKER_SPEED,
  STALKER_SWING,
  TURN_RATE,
  TOLL_PRICE,
  TOLL_RADIUS,
  TOLL_RANGE,
  TOLL_TELEGRAPH,
  TOLL_UNPAID,
  HEALTH,
  VIGIL_HELD,
  VIGIL_TELEGRAPH,
  YOKE_REACH,
} from './constants'
import { clearTerrain } from './battleground'
import {
  AURA_DURATION,
  addAura,
  adds,
  clearAura,
  getAura,
  interruptCast,
  pushEffect,
  applyDamage,
  type DamageOptions,
  boss,
  dist,
  livingParty,
  burdenFuse,
  burdenTaker,
  graspBill,
  tollPayer,
  say,
  stackAura,
  topThreatTarget,
  fightScale,
  mechanicScale,
  heraldUp,
} from './combat'
import type { Rng } from './rng'
import { BOSS_ID, clampToArena } from './state'
import { DIFFICULTIES, specOf } from './classes'
import {
  encounterAt,
  encounterKit,
  gated,
  lineFor,
  MECHANIC_IDS,
  type Encounter,
  type MechanicId,
  type PhaseTiming,
} from './encounters'
import { affixAddWave, affixEnrage, affixLinger, affixTiming } from './affix'
import { planned } from './floor'
import type { Actor, GroundEffect, SimState, Vec2 } from './types'

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

function computeScaled(base: PhaseTiming, s: SimState): PhaseTiming {
  // A floor replaces what the boss asks for and keeps its swings and its
  // slam: the shape of the fight is the boss's, the sentence is the floor's.
  //
  // The ladder is the same idea one step earlier, and only the authored bosses
  // get it: a boss owns more mechanics than any one raid meets, and how many
  // of them tonight is a question of who turned up and what they picked at the
  // door. A floor already rolled its own answer to that.
  const bought = encounterKit(fight(s), s.party.length, s.difficulty)
  const kit = s.only ? bought.filter((m) => m === s.only) : bought
  // `bought.length`, not `kit.length` -- narrowing to one mechanic is a filter
  // on what fires, not a discount on how many rungs the raid paid for.
  const timing = s.plan ? planned(base, s.plan, s.phase) : gated(base, kit, bought.length)
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

/** Every point of boss damage passes through here. */
function hit(s: SimState, amount: number): number {
  return amount * fightScale(s)
}

/** The same, for anything the floor does. */
function mechanic(s: SimState, amount: number): number {
  return amount * mechanicScale(s)
}


const SLAM_CAST = readable(2)

const PUDDLE_RADIUS = 92
const PUDDLE_DAMAGE = 1000

export const BREATH_CAST = readable(1.9)
const BREATH_RANGE = 390
const BREATH_HALF_WIDTH = 0.62
const BREATH_DAMAGE = 700

// The ring expands faster than anyone can run, so escaping outward is not an
// option and the answer has to be to already be inside it. That only works if
// there is time to get there first, hence the telegraph and the generous
// starting radius: the safe pocket is everything within START - BAND.
const SHOCKWAVE_TELEGRAPH = readable(2.4)

/** How far off the stalker starts. See `spawnStalker`. */
const STALKER_WALK = 368
export const SHOCKWAVE_START = 40
const SHOCKWAVE_GROWTH = 250
const SHOCKWAVE_BAND = 58

/**
 * The safe arc, as a half-width in radians.
 *
 * The ring used to be answered by running *in*, and that answer stopped
 * working for a reason no tuning could reach: a raid stands on its boss to
 * fight it, so the pocket the mechanic asked them to reach was the ground
 * they were already on. Measured at every size, 98% of the raid was inside it
 * when the ring went off, and the mechanic hit nobody.
 *
 * Widening the band to shrink the pocket does not fix it either, because the
 * pocket has a floor: twenty-two bodies of radius seventeen need about a
 * hundred and four of floor to stand on, and any pocket small enough to catch
 * a raid at twenty-five is one it cannot fit inside. The old table sat on that
 * edge and the twenty-five man lost 95 pulls in a hundred.
 *
 * A gap has no such floor. It is a wedge rather than a disc, so it grows with
 * the radius the ring has reached, and what it asks is *where* to stand rather
 * than *how close* — which is a question a raid of any size can answer.
 */
const SHOCKWAVE_GAP = 1.9

/** Whether this spot is in the ring's gap, and so safe from it. */
export function inShockwaveGap(p: Vec2, g: GroundEffect): boolean {
  let delta = Math.atan2(p.y - g.pos.y, p.x - g.pos.x) - g.angle
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  return Math.abs(delta) <= g.halfWidth
}
const SHOCKWAVE_DAMAGE = 600

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


const CONE_HALF_WIDTH: Record<number, number> = { 5: BREATH_HALF_WIDTH, 10: 0.88, 25: 0.80 }

function bySize(table: Record<number, number>, s: SimState): number {
  const count = s.party.length
  if (count <= 5) return table[5]!
  if (count <= 10) return table[10]!
  return table[25]!
}


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

  const target = topThreatTarget(s)
  faceTarget(s, b, target)

  if (target && !b.castId) {
    const d = dist(b.pos, target.pos)
    if (d > MELEE_RANGE) {
      b.pos.x += ((target.pos.x - b.pos.x) / d) * b.moveSpeed * DT
      b.pos.y += ((target.pos.y - b.pos.y) / d) * b.moveSpeed * DT
      clampToArena(b.pos, b.radius)
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
    passBurdens(s)
    updateAdds(s)
    return
  }

  scheduleSlam(s, b, target, timing)
  schedulePuddles(s, rng, timing)
  scheduleBlight(s, b, timing)
  scheduleInhale(s, b, timing)
  schedulePungent(s, b, timing)
  scheduleSpore(s, b, rng, timing)
  scheduleVileGas(s, b, rng, timing)
  scheduleBloat(s, b, timing)
  scheduleColdflame(s, b, rng, timing)
  scheduleSpikes(s, b, rng, timing)
  scheduleRaidHit(s, timing)
  scheduleSpread(s, b, rng, timing)
  scheduleBreath(s, b, timing)
  scheduleShockwave(s, b, rng, timing)
  scheduleAdds(s, b, rng, timing)
  scheduleCrush(s, b, timing)
  scheduleSchism(s, b, rng, timing)
  scheduleHand(s, b, rng, timing)
  scheduleFault(s, b, rng, timing)
  scheduleShallows(s, b, rng, timing)
  scheduleBrand(s, rng, timing)
  scheduleSpire(s, b, rng, timing)
  scheduleEcho(s, rng, timing)
  scheduleVerdict(s, rng, timing)
  scheduleSunder(s, b, target, timing)
  scheduleRot(s, rng, timing)
  scheduleSoak(s, b, rng, timing)
  scheduleHunt(s, b, rng, timing)
  scheduleBurden(s, b, rng, timing)
  scheduleYoke(s, b, rng, timing)
  scheduleVigil(s, b, timing)
  scheduleChant(s, b, rng, timing)
  scheduleGaze(s, b, timing)
  scheduleKnell(s, b, rng, timing)
  scheduleVessel(s, b, rng, timing)
  scheduleToll(s, b, rng, timing)
  scheduleGrasp(s, rng, timing)
  scheduleRefuge(s, b, rng, timing)
  passBurdens(s)

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
  pushEffect(s, 'impact', b.pos, { abilityId: 'boss_phase', power: ARENA_RADIUS * 2, crit: true })
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
  clampToArena(at, 30)

  // Read back off the boss rather than recomputed from the encounter. What
  // `createState` took off is a share of a number that this fight may not be
  // using — a descent rolls its own health — and the boss's own bar is the one
  // place that share is guaranteed to still be true of.
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
    s.next.puddle = Math.min(s.next.puddle, 3)
    s.nextSlam = Math.min(s.nextSlam, 5)
    // Only for what this boss actually does *tonight*. Handing a shockwave
    // timer to a fight with no shockwave is harmless today, since the
    // scheduler checks the cadence, and is exactly the kind of thing that
    // stops being harmless. Read through `scaled` rather than off the table,
    // so a mechanic the ladder did not buy is as absent here as it is there.
    const next = scaled(encounter.phases[2]!, s)
    if (next.shockwave > 0) s.next.shockwave = 8
    if (next.adds > 0) s.next.adds = 16
    summonHerald(s, b)
    return
  }

  if (s.phase === 2 && ratio <= encounter.phaseThreeHp) {
    s.phase = 3
    s.sounds.push('phase')
    phaseBreak(s, b)
    s.chat.push({ id: s.nextObjectId++, speaker: b.name, text: encounter.lines.phaseThree, age: 0 })
    const next = scaled(encounter.phases[3]!, s)
    if (next.breath > 0) s.next.breath = Math.min(s.next.breath, 4)
    if (next.shockwave > 0) s.next.shockwave = Math.min(s.next.shockwave, 7)
  }
}

/** Turns toward the threat leader, but locks while casting its cone. */
function faceTarget(s: SimState, b: Actor, target: Actor | null): void {
  if (!target || b.castId === 'boss_breath') return
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

  b.castId = 'boss_slam'
  // The same gathering ring every caster in the game gets when it starts a
  // cast. The boss was setting its cast bar by hand and never got one.
  pushEffect(s, 'cast', b.pos, { abilityId: 'boss_slam' })
  b.castRemaining = SLAM_CAST
  b.castTotal = SLAM_CAST
  b.castTargetId = target ? target.id : null
  s.nextSlam = timing.slam
}

function scheduleBreath(s: SimState, b: Actor, timing: PhaseTiming): void {
  if (timing.breath <= 0) return
  s.next.breath -= DT
  if (s.next.breath > 0 || b.castId) return

  s.sounds.push('telegraph')
  b.castId = 'boss_breath'
  pushEffect(s, 'cast', b.pos, { abilityId: 'boss_breath' })
  b.castRemaining = BREATH_CAST
  b.castTotal = BREATH_CAST
  b.castTargetId = null
  s.next.breath = timing.breath

  // The cone is telegraphed on the floor for the whole cast.
  s.ground.push({
    ...blankGround(s),
    kind: 'breath',
    pos: { x: b.pos.x, y: b.pos.y },
    radius: BREATH_RANGE,
    telegraph: BREATH_CAST,
    lingering: 0,
    damage: BREATH_DAMAGE,
    angle: s.bossFacing,
    halfWidth: bySize(CONE_HALF_WIDTH, s),
  })
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

  // Full is full. See `INHALE_MAX`.
  if ((getAura(b, 'gorged')?.stacks ?? 0) >= INHALE_MAX) return
  stackAura(b, 'gorged', b.id)
  say(s, b, lineFor(fight(s), s.plan !== null, 'inhale'))
  s.sounds.push('telegraph')
  pushEffect(s, 'cast', b.pos, { abilityId: 'boss_inhale' })
}

function schedulePungent(s: SimState, b: Actor, timing: PhaseTiming): void {
  if (timing.pungent <= 0) return
  s.next.pungent -= DT
  if (s.next.pungent > 0) return
  s.next.pungent = timing.pungent

  const breaths = getAura(b, 'gorged')?.stacks ?? 0
  // Nothing taken, nothing to give back. Not a wasted cast: it is the raid
  // having outrun the mechanic, which is a thing the fight should let happen.
  if (breaths <= 0) return

  say(s, b, lineFor(fight(s), s.plan !== null, 'pungent'))
  s.sounds.push('raid')
  const full = mechanic(s, PUNGENT_PER_BREATH * breaths)
  for (const a of livingParty(s)) {
    // What standing in somebody's spore was for, forty seconds ago.
    const covered = getAura(a, 'inoculated') !== undefined
    applyDamage(s, a, covered ? full * INOCULATED_SHARE : full, 'magic', {
      sourceId: b.id,
      mechanic: 'pungent',
    })
    pushEffect(s, 'impact', a.pos, { abilityId: 'boss_pungent', power: full })
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
function scheduleSpore(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.spore <= 0) return
  s.next.spore -= DT
  if (s.next.spore > 0) return
  s.next.spore = timing.spore

  const free = livingParty(s).filter((a) => !getAura(a, 'spore'))
  if (free.length === 0) return

  say(s, b, lineFor(fight(s), s.plan !== null, 'spore'))
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

  say(s, b, lineFor(fight(s), s.plan !== null, 'vilegas'))
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
    if (stacks === BLOAT_BURST_AT - 1) say(s, b, lineFor(fight(s), s.plan !== null, 'bloat'))
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

  s.next.coldflame = timing.coldflame
  s.sounds.push('telegraph')
  say(s, b, lineFor(fight(s), s.plan !== null, 'coldflame'))

  const bearing = rng.range(0, Math.PI * 2)
  for (let i = 0; i < COLDFLAME_REACH; i++) {
    // Outside the boss's own edge, so the hitbox is the safe spot.
    const out = b.radius + COLDFLAME_RADIUS + i * COLDFLAME_STEP
    const pos = { x: b.pos.x + Math.cos(bearing) * out, y: b.pos.y + Math.sin(bearing) * out }
    clampToArena(pos, COLDFLAME_RADIUS)
    s.ground.push({
      ...blankGround(s),
      kind: 'coldflame',
      pos,
      radius: COLDFLAME_RADIUS,
      telegraph: COLDFLAME_TELEGRAPH + i * COLDFLAME_CRAWL,
      // Long enough to be a line rather than a row of moments, short enough
      // that the floor it took comes back before the next one is due.
      lingering: 1.6,
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

function scheduleShockwave(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.shockwave <= 0) return
  s.next.shockwave -= DT
  if (s.next.shockwave > 0) return

  s.next.shockwave = timing.shockwave
  s.sounds.push('shockwave')
  say(s, b, lineFor(fight(s), s.plan !== null, 'shockwave'))
  s.ground.push({
    ...blankGround(s),
    kind: 'shockwave',
    pos: { x: b.pos.x, y: b.pos.y },
    radius: SHOCKWAVE_START,
    telegraph: SHOCKWAVE_TELEGRAPH,
    lingering: 99,
    damage: SHOCKWAVE_DAMAGE,
    detonated: false,
    growth: SHOCKWAVE_GROWTH,
    band: SHOCKWAVE_BAND,
    // Rolled, so the answer is read off the floor rather than remembered.
    angle: rng.range(0, Math.PI * 2),
    halfWidth: SHOCKWAVE_GAP,
  })
}

function schedulePuddles(s: SimState, rng: Rng, timing: PhaseTiming): void {
  if (timing.puddle <= 0) return
  s.next.puddle -= DT
  if (s.next.puddle > 0) return

  // Not onto a party that has been told to stand in one place.
  //
  // Puddles are dropped on people, so a raid gathered into a circle gets the
  // whole set inside it — and then the floor says leave and the circle says
  // stay. That is not a hard mechanic, it is two mechanics cancelling, and it
  // took the Choir from a fight to a wipe at seventy seconds. The timer is
  // held rather than skipped: the puddles land the moment the circle does.
  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    // A tick's grace rather than the spread's three. Puddles telegraph before
    // they hurt anyone, so they only have to miss the moment the raid is
    // standing still — and holding the whole floor for eight seconds of every
    // twenty-four turned out to be a bigger gift than the mechanic was a
    // cost, worth thirty-seven points of first-pull win rate on its own.
    s.next.puddle = FLOOR_AFTER_SOAK
    return
  }

  const victims = livingParty(s)
  // Mechanics scale with the raid. A fixed number of puddles across a
  // twenty-five man means any given player is almost never targeted, so the
  // bigger raid would be the easier one.
  const spread = Math.max(1, Math.ceil(s.party.length / 8))
  const count = (timing.puddleCount + DIFFICULTIES[s.difficulty].extraPuddle) * spread
  for (let i = 0; i < count && victims.length > 0; i++) {
    const victim = rng.pick(victims)
    const pos = { x: victim.pos.x + rng.range(-20, 20), y: victim.pos.y + rng.range(-20, 20) }
    clampToArena(pos, PUDDLE_RADIUS * 0.5)
    s.sounds.push('telegraph')
    s.ground.push({
      ...blankGround(s),
      kind: 'puddle',
      pos,
      radius: PUDDLE_RADIUS,
      telegraph: PUDDLE_TELEGRAPH,
      lingering: 5.5 * affixLinger(s.affix),
      damage: PUDDLE_DAMAGE,
    })
  }
  s.next.puddle = timing.puddle
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
  }
  s.nextRaidHit = timing.raid
  // Unavoidable damage with no tell reads as a broken hitbox: the player
  // dodges, loses health anyway, and blames the puddle they just left.
  s.raidFlash = 0.45
}

function scheduleSpread(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.spread <= 0) return
  s.next.spread -= DT
  if (s.next.spread > 0) return

  // And never into a circle the party is already running to — nor into the
  // second after one resolves.
  //
  // The tick's grace is the whole of it. A spread detonates on its carrier
  // and catches everyone within a hundred and ten units, and a party that has
  // just been told to stand inside a circle of a hundred and thirty five is
  // every one of them. Deferring only while the circle was live moved the
  // contradiction one tick later instead of removing it, and the Choir wiped
  // at ninety seconds every single pull.
  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    s.next.spread = AFTER_SOAK
    return
  }

  const victims = livingParty(s)
  const marks = Math.max(1, Math.round(s.party.length / 6))
  for (let i = 0; i < marks && victims.length > 0; i++) {
    const victim = rng.pick(victims)
    if (getAura(victim, 'spread')) continue
    addAura(victim, 'spread', b.id)
    if (victim.ai && i === 0) say(s, victim, 'Spread on me, moving out')
  }
  s.next.spread = timing.spread
}

function scheduleAdds(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.adds <= 0) return
  s.next.adds -= DT
  if (s.next.adds > 0) return

  s.next.adds = timing.adds
  say(s, b, lineFor(fight(s), s.plan !== null, 'adds'))

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
    const angle = rng.range(0, Math.PI * 2)
    const pos = { x: Math.cos(angle) * 230, y: Math.sin(angle) * 230 }
    clampToArena(pos, 16)
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

const CRUSH_DAMAGE = 1000

function scheduleCrush(s: SimState, b: Actor, timing: PhaseTiming): void {
  if (timing.crush <= 0) return
  s.next.crush -= DT
  if (s.next.crush > 0) return

  // Not onto a party that has been told to stand in one place. The gathering
  // is placed near the raid and the raid stands near the boss, so a circle
  // and a caving floor at once is the same contradiction the puddles are held
  // for — one says all of you here and the other says not there.
  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    s.next.crush = FLOOR_AFTER_SOAK
    return
  }

  s.next.crush = timing.crush
  s.sounds.push('telegraph')
  say(s, b, lineFor(fight(s), s.plan !== null, 'crush'))

  s.ground.push({
    ...blankGround(s),
    kind: 'crush',
    pos: { x: b.pos.x, y: b.pos.y },
    // Exactly what the melee can reach the boss from, which is what makes it
    // the melee's band rather than a circle that happens to contain them.
    //
    // The sweep's own reach was the first version, since the comparison is
    // supposed to be the same floor with a warning in front of it — and the
    // sweep reaches almost twice as far as melee range. Measured at the
    // moment it is announced, the melee are all inside eighty of the boss and
    // the ranged start at ninety-seven, so a band that wide caught six
    // ranged a pull against seven melee and the split the mechanic exists to
    // make was not there. At melee range and the boss's own radius it is
    // fourteen melee against one ranged.
    radius: MELEE_RANGE + b.radius,
    telegraph: CRUSH_TELEGRAPH,
    // Nothing at all afterwards. A residue would make it a place to avoid
    // rather than a moment to be somewhere else, and a moment is the point.
    lingering: 0,
    damage: CRUSH_DAMAGE,
    detonated: false,
  })
  // The shape it actually covers. It borrowed the sweep's reach, which is
  // nearly twice this, so the flash was drawn well outside the ground that
  // was about to give way — and the sweep is gone now anyway.
  pushEffect(s, 'cast', b.pos, { abilityId: 'boss_crush', power: MELEE_RANGE + b.radius })
}
/**
 * The raid cut into groups that must not touch.
 *
 * The one demand on any of these tables that is not about a place. Everything
 * else here moves one person, or moves every person separately; this moves
 * them apart from *each other*, and it is the only thing in the game that a
 * body standing perfectly still can fail — what catches you is not where you went, it is that
 * somebody wearing another mark was close enough when the count ran out.
 *
 * Which is why it is the one mechanic here whose answer is a *plan*. The
 * sides are marked and the muster points are shown; what the party has to do
 * is come apart into them before the count ends, and a raid that starts late
 * is a raid still standing in one blob when it does.
 *
 * A third group once there are enough bodies to need one, and that is the
 * rule that keeps it from going limp at size. Everything else in this game
 * that measures the distance between people gets *easier* with more of them —
 * a crowd already satisfies "stay near somebody" and a wider arena share
 * already satisfies "stay away from somebody", which is why the last mechanic
 * built out of proximity was answered by 97 percent of twenty-five mans and
 * none of the five. Sorting does not: twenty-five bodies into three groups is
 * more sorting than ten into two, and the number of shapes the raid has to
 * become is the thing that grows with it.
 *
 * Measured, it teaches 19.4 points at ten and 36.2 at twenty-five.
 */
const SCHISM_DAMAGE = 950

/** How many groups a raid this size is cut into. */
export function schismSides(living: number): number {
  return living >= 20 ? 3 : 2
}

/**
 * Where the group wearing this mark is supposed to end up.
 *
 * The ring they stand on is derived from how far apart they have to be, not
 * chosen: `SCHISM_APART` is a chord of it, so adding a third group pushes the
 * ring out rather than crowding the gap between the two that were there.
 */
export function schismMuster(g: GroundEffect, side: number): Vec2 {
  const sides = g.sides ?? 2
  const reach = SCHISM_APART / (2 * Math.sin(Math.PI / sides))
  const bearing = g.angle + (side / sides) * Math.PI * 2
  return {
    x: g.pos.x + Math.cos(bearing) * reach,
    y: g.pos.y + Math.sin(bearing) * reach,
  }
}

/** Whether these two were told to be in different places. */
export function schismClash(a: Actor, other: Actor): boolean {
  const mine = getAura(a, 'schism')
  const theirs = getAura(other, 'schism')
  if (!mine || !theirs) return false
  return mine.stacks !== theirs.stacks
}

function scheduleSchism(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.schism <= 0) return
  s.next.schism -= DT
  if (s.next.schism > 0) return

  // Never against a gathering, which is the exact opposite instruction, and
  // never against itself.
  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    s.next.schism = FLOOR_AFTER_SOAK
    return
  }
  if (s.ground.some((g) => g.kind === 'schism')) {
    s.next.schism = 0.5
    return
  }

  // Never the tanks, which is the same rule the stalker keeps and for the
  // same reason: whoever is holding the boss cannot walk two hundred units to
  // a muster point without taking the fight with them, and a mechanic whose
  // answer is "drag the boss across the arena" breaks every other mechanic on
  // the table while it is being answered. The raid comes apart around the
  // people holding it in place.
  const party = livingParty(s).filter((a) => a.role !== 'tank')
  if (party.length < 2) return
  s.next.schism = timing.schism

  const sides = schismSides(party.length)
  const shape: GroundEffect = {
    ...blankGround(s),
    kind: 'schism',
    pos: { x: b.pos.x, y: b.pos.y },
    // The distance the groups have to keep, which is also the circle each of
    // them has to end up outside of the others'.
    radius: SCHISM_ROOM,
    // Filled in below, once the cut has been made: the muster points are put
    // where the groups already are rather than anywhere in the arena.
    angle: 0,
    sides,
    telegraph: SCHISM_TELEGRAPH,
    lingering: 0,
    damage: SCHISM_DAMAGE,
    detonated: false,
  }
  s.ground.push(shape)

  // Cut where the raid already stands, not dealt at random.
  //
  // This is the difference between a mechanic a raid can perform and one it
  // cannot, and it was measured rather than reasoned. Marks handed out at
  // random send half the party across the arena to reach the group they were
  // put in — at twenty-five, past two other groups walking the other way —
  // and the count is not long enough for that at any setting that is not also
  // long enough to make the whole thing a formality. Measured, a practised
  // twenty-five man was still a hundred and ninety units from its own muster
  // point when the count ran out, and was losing nearly nine pulls in ten.
  //
  // Sorted by bearing and cut into equal blocks, every group is already most
  // of the way to being a group, and what the mechanic asks is the thing it
  // was written to ask: the raid pulls apart into a shape it does not
  // normally hold. The walk is then about the same length for everybody and
  // the same length at every raid size, which is the property a formation
  // mechanic has to have and a proximity one never does.
  //
  // The cut still moves. Where the first block starts is rolled, so a party
  // cannot stand in the arrangement before the cast has said anything — an
  // answer that can be taken in advance is one an unpractised raid gives as
  // readily as a practised one, which is what the brand measured at nothing
  // for until its ground stopped landing where the marked ended up.
  const bearings = party
    .map((a) => ({ a, bearing: Math.atan2(a.pos.y - b.pos.y, a.pos.x - b.pos.x) }))
    .sort((one, two) => one.bearing - two.bearing)
  const cut = rng.int(bearings.length)
  const order = [...bearings.slice(cut), ...bearings.slice(0, cut)]
  const per = Math.ceil(order.length / sides)
  order.forEach((entry, i) => {
    addAura(entry.a, 'schism', BOSS_ID)
    const mark = getAura(entry.a, 'schism')
    if (mark) mark.stacks = Math.min(sides, Math.floor(i / per) + 1)
    pushEffect(s, 'cast', entry.a.pos, { abilityId: 'boss_schism' })
  })
  // The first group's muster goes where the middle of it is standing, and the
  // rest are spaced evenly round from there — so each group walks outward
  // along the bearing it already held instead of across everybody else.
  shape.angle = order[Math.min(order.length - 1, Math.floor(per / 2))]!.bearing

  s.sounds.push('telegraph')
  say(s, b, lineFor(fight(s), s.plan !== null, 'schism'))
}


/**
 * The wedge that turns, and the reason it is not another cone.
 *
 * Every shape this game already throws is answered by finding the ground it
 * is not on. The pool says leave where you stand, the cone says get behind,
 * the ring says come in, the caving band says step out of it — and in all
 * four the answer, once taken, is taken. The floor stops asking.
 *
 * This one moves onto the answer. It fires, turns by a little less than its
 * own width, and fires again, five times to a cast, so the ground that was
 * safe a beat ago is the ground it is standing on now. What it asks for is
 * not a place, it is a bearing: the floor behind the turn is about to be
 * safe and the floor ahead of it is about to stop being floor, so a raid
 * that reads the wedge without reading which way it is going steps out of
 * one pulse and into the next.
 *
 * Anchored on the boss and reaching past the wall, so it is a question of
 * bearing rather than of distance and nobody answers it by being far away.
 * Which way it turns is rolled, because a hand that always goes the same way
 * is a fact to be memorised once rather than a thing to be read.
 *
 * The beat is the crush's telegraph, and it lands on the same number for the
 * same reason. Measured at a ten-man heroic, the cliff is as steep here as
 * it is there: a beat of 1.2 is 17 points of teaching and 19 percent of a
 * first pull dead, 1.1 is 26 and 28, and 1.0 is 33 and 38 — which is a wipe
 * mechanic rather than a teaching one.
 *
 * The width is the other half of the shape, and it is the half that turned
 * out not to be a dial. A wedge is an angle, so what it costs to leave grows
 * with how far out you are standing: this one is sixty-four units across at
 * melee range and two hundred and seventy-nine where the casters stand. And
 * widening it from 0.42 to this moved the bodies it caught over a whole
 * fight from ten to eleven on a first pull and six to five on a ninth, which
 * is nothing. What moved the mechanic was the beat and the size of the hit.
 */
const HAND_HALF_WIDTH = 0.62
export const HAND_BEAT = readable(1.1)
/**
 * How far it turns between pulses, in radians.
 *
 * Less than its own full width on purpose. Turn it further and consecutive
 * pulses leave a strip of floor nobody was ever asked about, which is a
 * mechanic that can be stood still through; turn it exactly its width and
 * the trailing edge is a coin toss. At three quarters of it, the ground the
 * hand has just left is safe for the next pulse and the ground a pace ahead
 * of it is not, which is the whole sentence this is trying to say.
 */
const HAND_TURN = HAND_HALF_WIDTH * 1.5
const HAND_PULSES = 5
/**
 * A pool's, a brand's and a crush's, because it is the same kind of event:
 * one mechanic's worth of damage arriving at one instant. Seven hundred was
 * the first number and it was the wrong shape of wrong — the wedge still
 * caught the same bodies, the healers simply covered it, and a mechanic
 * whose mistakes are covered by the ordinary rotation teaches nothing at
 * either end of the practice curve.
 */
const HAND_DAMAGE = 1000

function scheduleHand(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.hand <= 0) return
  s.next.hand -= DT
  if (s.next.hand > 0) return

  // Never two at once. Two wedges turning together is not a harder question,
  // it is an unreadable one: the answer to this is a bearing, and there is
  // no bearing that answers both.
  if (s.ground.some((g) => g.kind === 'hand')) {
    s.next.hand = HAND_BEAT
    return
  }

  // Held while a gathering is live, for the reason the crush and the brand
  // are held: one mechanic says all of you here and this one says nobody
  // stands anywhere for long.
  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    s.next.hand = FLOOR_AFTER_SOAK
    return
  }

  s.next.hand = timing.hand
  s.sounds.push('telegraph')
  say(s, b, lineFor(fight(s), s.plan !== null, 'hand'))

  s.ground.push({
    ...blankGround(s),
    kind: 'hand',
    pos: { x: b.pos.x, y: b.pos.y },
    // Past the far wall, so the wedge is a slice of the whole arena however
    // far off centre the boss is standing when it starts turning.
    radius: ARENA_RADIUS * 2,
    telegraph: HAND_BEAT,
    lingering: 0,
    damage: HAND_DAMAGE,
    detonated: false,
    angle: rng.range(0, Math.PI * 2),
    halfWidth: HAND_HALF_WIDTH,
    turn: rng.chance(0.5) ? HAND_TURN : -HAND_TURN,
    pulses: HAND_PULSES,
  })
  pushEffect(s, 'cast', b.pos, { abilityId: 'boss_hand', power: ARENA_RADIUS })
}

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
const FAULT_DAMAGE = 1000

/** Which half a fault condemns: the one its bearing points into. */
export function condemned(p: Vec2, g: GroundEffect): boolean {
  return (p.x - g.pos.x) * Math.cos(g.angle) + (p.y - g.pos.y) * Math.sin(g.angle) > 0
}

function scheduleFault(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.fault <= 0) return
  s.next.fault -= DT
  if (s.next.fault > 0) return

  // Held while a gathering is live, for the reason every other piece of
  // hazardous floor is: one mechanic says all of you here and the other says
  // half of that is about to stop being floor.
  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    s.next.fault = FLOOR_AFTER_SOAK
    return
  }

  s.next.fault = timing.fault
  s.sounds.push('telegraph')
  say(s, b, lineFor(fight(s), s.plan !== null, 'fault'))

  s.ground.push({
    ...blankGround(s),
    kind: 'fault',
    pos: { x: b.pos.x, y: b.pos.y },
    // The whole floor, because the half of it that is condemned reaches the
    // wall. What decides a hit is the bearing, not this.
    radius: ARENA_RADIUS,
    telegraph: FAULT_TELEGRAPH,
    // Nothing afterwards: a moment to be on the right side of, not a place to
    // avoid for the rest of the fight. Half an arena that stays dangerous is
    // not a mechanic, it is a smaller arena.
    lingering: 0,
    damage: FAULT_DAMAGE,
    detonated: false,
    angle: rng.range(0, Math.PI * 2),
  })
  pushEffect(s, 'cast', b.pos, { abilityId: 'boss_fault', power: ARENA_RADIUS })
}

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
/**
 * A crush's, in the end, and not by choice.
 *
 * It was set under one — eight hundred and fifty — on the argument that this
 * mechanic already charges for the walk and should not also hit like the
 * floor caving in. Measured, that argument is wrong about how this game
 * kills people: deaths are a step function of what a mechanic totals per body
 * over a pull — the measured line is 1937 for none and 2645 for a wipe — and
 * under it nothing happens at all. See `SHALLOWS_TELEGRAPH`. The walk is
 * charged for in uptime, which is real and which the death rate cannot see.
 */
const SHALLOWS_DAMAGE = 1000

/** Whether this spot is on ground the shallows leave standing. */
export function onShallows(p: Vec2, g: GroundEffect): boolean {
  const spots = g.spots ?? []
  for (const spot of spots) {
    if (Math.hypot(p.x - spot.x, p.y - spot.y) <= g.radius) return true
  }
  return false
}

function scheduleShallows(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.shallows <= 0) return
  s.next.shallows -= DT
  if (s.next.shallows > 0) return

  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    s.next.shallows = FLOOR_AFTER_SOAK
    return
  }

  s.next.shallows = timing.shallows
  s.sounds.push('telegraph')
  say(s, b, lineFor(fight(s), s.plan !== null, 'shallows'))

  // Around the boss rather than around the arena. The raid operates between
  // ninety and a hundred and twenty-five of it, so patches rolled across four
  // hundred and sixty of floor would be a mechanic answered by a walk nobody
  // can finish — and the gathering already measured what a long walk costs:
  // this party heals standing still, so the seconds spent crossing the arena
  // come out of the healing rather than out of anybody's attention.
  const base = rng.range(0, Math.PI * 2)
  const spots: Vec2[] = []
  for (let i = 0; i < SHALLOWS_COUNT; i++) {
    const angle = base + (i / SHALLOWS_COUNT) * Math.PI * 2 + rng.range(-0.4, 0.4)
    const away = rng.range(85, 195)
    const spot = { x: b.pos.x + Math.cos(angle) * away, y: b.pos.y + Math.sin(angle) * away }
    clampToArena(spot, SHALLOWS_RADIUS)
    spots.push(spot)
  }

  s.ground.push({
    ...blankGround(s),
    kind: 'shallows',
    // The middle of the arena, since what it condemns is all of it. The
    // patches are the exception and they are carried in `spots`.
    pos: { x: 0, y: 0 },
    // One patch's, which is the only length this mechanic measures anything
    // against.
    radius: SHALLOWS_RADIUS,
    telegraph: SHALLOWS_TELEGRAPH,
    lingering: 0,
    damage: SHALLOWS_DAMAGE,
    detonated: false,
    spots,
  })
  for (const spot of spots) {
    pushEffect(s, 'cast', spot, { abilityId: 'boss_shallows', power: SHALLOWS_RADIUS })
  }
}

/**
 * The circle the whole party has to be standing in.
 *
 * The inverse of spread, and the only thing here that asks the party to do
 * something together rather than each get themselves out of the way. What
 * lands is divided by however many stood in it and then dealt to everybody,
 * so being outside is not an escape — it is a cost passed to the people who
 * went.
 *
 * Placed away from the boss on purpose. Dropped on the party it would already
 * be solved, and dropped on the boss it would be free for the melee and a
 * long walk for everyone else.
 */
/**
 * How long the party gets to break up again before the floor resumes.
 *
 * Long enough to be out of each other's spread radius at a walk, which is the
 * only thing this number has to buy.
 */
const AFTER_SOAK = 3
const FLOOR_AFTER_SOAK = 0.6

function scheduleSoak(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  // The Warden's top rung, and a floor that rolled it.
  const every = timing.soak
  if (every <= 0) return
  s.next.soak -= DT
  if (s.next.soak > 0) return

  // Never on top of a spread. One says get apart and the other says get
  // together, and a party asked both at once is not being asked a question,
  // it is being handed a contradiction — the spread would detonate into the
  // stack. The soak waits; the spread is the shorter timer.
  if (livingParty(s).some((a) => getAura(a, 'spread'))) return

  // Nor on top of a floor that has not gone off yet.
  //
  // The other half of the same rule, and it was missing: the floor holds
  // itself back while a circle is live, but nothing held the circle back while
  // the floor was still in the air. A pool with a second left on it detonates
  // and then lingers for five and a half, which is most of the walk into a
  // circle the party has just been told to stand in — one mechanic says leave
  // where you stand and the other says all of you here, and the ground between
  // them is the same ground.
  //
  // The telegraph only, not the residue: waiting out every pool on the floor
  // would be waiting out the fight.
  if (
    s.ground.some(
      (g) =>
        (g.kind === 'puddle' ||
          g.kind === 'brand' ||
          g.kind === 'crush' ||
          g.kind === 'fault' ||
          g.kind === 'shallows') &&
        !g.detonated,
    )
  )
    return

  s.next.soak = every

  // Placed near the party rather than out in the arena.
  //
  // Two hundred and fifty units from the boss was the first version, and it
  // did not cost what it looked like it cost. Healing in this game is cast at
  // range from a standing position, so a mechanic that walks the whole raid
  // across the floor takes the healer's output away in the same seconds it
  // deals damage to everybody — the party arrived, took it, and had nobody
  // casting. Measured, that was the difference between a boss killed at 154s
  // and a wipe at 167s with the boss still at 39%.
  //
  // Close in, the cost is what it should be: everyone has to be in one place
  // at one moment, and the floor is held while they do it.
  const party = livingParty(s)
  const centre = party.reduce(
    (acc, a) => ({ x: acc.x + a.pos.x / party.length, y: acc.y + a.pos.y / party.length }),
    { x: 0, y: 0 },
  )
  const angle = rng.range(0, Math.PI * 2)
  const away = rng.range(90, 170)
  const pos = { x: centre.x + Math.cos(angle) * away, y: centre.y + Math.sin(angle) * away }
  clampToArena(pos, SOAK_RADIUS)

  s.ground.push({
    id: s.nextObjectId++,
    kind: 'soak',
    pos,
    radius: SOAK_RADIUS,
    turn: 0,
    pulses: 0,
    telegraph: SOAK_TELEGRAPH,
    lingering: 0,
    // Flat, where every other mechanic here is multiplied by the difficulty.
    // The circle is a positional demand with a tax attached, and multiplying
    // the tax compounds with the one thing heroic has none of — a healer with
    // room to spare. Left scaling, it took heroic from twelve percent to two.
    damage: SOAK_EACH,
    detonated: false,
    angle: 0,
    halfWidth: 0,
    growth: 0,
    band: 0,
    caught: [],
  })
  s.sounds.push('telegraph')
  say(s, b, lineFor(fight(s), s.plan !== null, 'soak'))
}

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

function scheduleSunder(s: SimState, b: Actor, target: Actor | null, timing: PhaseTiming): void {
  if (timing.sunder <= 0) return
  s.next.sunder -= DT
  if (s.next.sunder > 0) return

  s.next.sunder = timing.sunder
  // A party that brought one tank never sees it.
  //
  // The mechanic is a question about who is standing there, and a five-man is
  // not allowed to answer it — it fields one tank and one healer, and asking
  // anyway is not a decision, it is a tax on the size that can least afford
  // one. Measured: the same break that a ten-man answers by swapping took
  // five-man heroic from twelve percent to five. So it is what the second
  // tank is *for*, and the fight simply does not have it without one.
  // Counted from the roster rather than from who is still alive, so losing
  // the second tank does not switch the mechanic off at the worst moment.
  const tanks = s.actors.filter((a) => a.faction === 'party' && a.role === 'tank').length
  if (tanks < 2) return

  // Nobody in reach is nobody to break: it lands on the melee target rather
  // than on whoever happens to lead threat from across the arena.
  if (!target || !target.alive) return
  if (dist(b.pos, target.pos) > MELEE_RANGE + target.radius + 20) return

  const held = getAura(target, 'sunder')
  if (held && held.stacks >= SUNDER_MAX) {
    // Refreshed rather than deepened: it stays on, it stops growing.
    held.remaining = held.duration
  } else {
    stackAura(target, 'sunder', b.id)
  }
  s.sounds.push('telegraph')
  say(s, b, lineFor(fight(s), s.plan !== null, 'sunder'))
  pushEffect(s, 'impact', target.pos, {
    abilityId: 'boss_sunder',
    power: 260,
    angle: Math.atan2(target.pos.y - b.pos.y, target.pos.x - b.pos.x),
  })
}

/**
 * A dot on somebody, which armour does not answer.
 *
 * The counterweight to the sweep: one mechanic that plate solves and one it
 * cannot touch, so no single stat block is the right answer to the fight.
 */
function scheduleRot(s: SimState, rng: Rng, timing: PhaseTiming): void {
  if (timing.rot <= 0) return
  s.next.rot -= DT
  if (s.next.rot > 0) return

  s.next.rot = timing.rot
  const victims = livingParty(s).filter((a) => !getAura(a, 'rot'))
  if (victims.length === 0) return

  const victim = rng.pick(victims)
  addAura(victim, 'rot', BOSS_ID)
  pushEffect(s, 'impact', victim.pos, { abilityId: 'boss_rot', power: 220 })
  s.sounds.push('telegraph')
  if (victim.ai) say(s, victim, lineFor(fight(s), s.plan !== null, 'rot'))
}


/**
 * A mark that leaves ground where it burns out.
 *
 * Ground is the thing that teaches — measured, a puddle is worth thirty-four
 * points of survival between a raid's first pull and its ninth and the next
 * best is twenty-nine, while everything else in the game clears six. A
 * telegraph is dodged once and then known; a floor is failed again and again
 * until it is not.
 *
 * The ground lands where the mark *was applied*, not where the marked ends up.
 * Placing it at the end was the first version and it taught nothing: the
 * answer was taken before the ground existed — walk somewhere useless, wait —
 * and a pre-emptive answer is one an unpractised raid gives as readily as a
 * practised one. Measured at 0.0 points either way.
 *
 * Anchored to the spot, the question is the one a puddle asks and a puddle
 * cannot: the floor you are standing on is about to stop being floor, and it
 * is floor the fight was using.
 */
const BRAND_RADIUS = 74
const BRAND_DAMAGE = 780
const BRAND_LINGER = 7

function scheduleBrand(s: SimState, rng: Rng, timing: PhaseTiming): void {
  if (timing.brand <= 0) return
  s.next.brand -= DT
  if (s.next.brand > 0) return

  // Held while a gathering is live, for the reason the puddle is: one
  // mechanic says leave where you stand and the other says all of you here.
  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    s.next.brand = FLOOR_AFTER_SOAK
    return
  }

  s.next.brand = timing.brand
  const free = livingParty(s).filter((a) => !getAura(a, 'brand'))
  if (free.length === 0) return

  // One per five bodies, which is what it took. The first three cadences of
  // this mechanic taught nothing and I went looking for the reason in its
  // shape — the window, where the ground anchors, whether the answer is taken
  // before or after it lands. It was none of those. A puddle lands 0.45 times
  // a second across a ten-man and this was landing 0.16, and a mechanic a
  // third as often is a mechanic a third as often. At parity it teaches 36
  // points against the puddle's 34.
  const marks = Math.max(1, Math.round(livingParty(s).length / 5))
  for (let i = 0; i < marks && free.length > 0; i++) {
    const marked = free.splice(rng.int(free.length), 1)[0]!
    addAura(marked, 'brand', BOSS_ID)
    const mark = getAura(marked, 'brand')
    if (mark) mark.at = { x: marked.pos.x, y: marked.pos.y }
    pushEffect(s, 'cast', marked.pos, { abilityId: 'boss_brand' })
    if (marked.ai) say(s, marked, lineFor(fight(s), s.plan !== null, 'brand'))
  }
  s.sounds.push('telegraph')
}

/**
 * The floor answering a beat late, under whoever it picked.
 *
 * The brand asks for one walk: the ground you are standing on is about to
 * stop being ground, so take it somewhere the fight was not using. That is a
 * decision made once and then done with, and most of what it teaches is not
 * walking back onto your own.
 *
 * This asks for the walk again before the last one has been paid for. A mark
 * that lasts five seconds and a drum that beats every second: wherever the
 * one carrying it is standing when the drum falls, that floor goes out from
 * under them, and then it does it again. There is no spot to reach. Standing
 * still is the one answer that is always wrong, and the place worth being is
 * wherever the next beat will not find them — which is a thing to be chosen
 * five times rather than once.
 *
 * Deliberately without the guard the crush has. An actor that has stepped
 * off its own floor and is then sent home walks back onto the ground it just
 * left, and for the crush that was the mechanic dodging itself. Here it *is*
 * the mechanic: the brand measured ten points of its teaching in exactly
 * that habit, and a mark that follows the body is the same lesson asked on a
 * beat.
 */
const ECHO_RADIUS = 66
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
const ECHO_DAMAGE = 620

/** One beat of it: the ground under this body, about to answer. */
function dropEcho(s: SimState, actor: Actor): void {
  s.ground.push({
    ...blankGround(s),
    kind: 'echo',
    pos: { x: actor.pos.x, y: actor.pos.y },
    radius: ECHO_RADIUS,
    telegraph: ECHO_TELEGRAPH,
    // Nothing afterwards, the way the crush leaves nothing. A residue would
    // make this a trail to be walked around, and what it asks about is the
    // next beat rather than the last one.
    lingering: 0,
    damage: ECHO_DAMAGE,
    detonated: false,
  })
  pushEffect(s, 'cast', actor.pos, { abilityId: 'boss_echo' })
}

function scheduleEcho(s: SimState, rng: Rng, timing: PhaseTiming): void {
  if (timing.echo <= 0) return
  s.next.echo -= DT
  if (s.next.echo > 0) return

  // The drum, while anybody is still carrying it. One timer does both jobs
  // because the mechanic is one thing, and two of them would have to agree
  // with each other about the beat a mark runs out on.
  const carrying = livingParty(s).filter((a) => getAura(a, 'echo') !== undefined)
  if (carrying.length > 0) {
    for (const marked of carrying) dropEcho(s, marked)
    s.sounds.push('telegraph')
    const longest = carrying.reduce((most, a) => Math.max(most, getAura(a, 'echo')!.remaining), 0)
    // The table's number is the gap between one echo and the next, so the
    // beats it spends carrying come out of it rather than being added on.
    s.next.echo =
      longest > ECHO_BEAT ? ECHO_BEAT : Math.max(ECHO_BEAT, timing.echo - AURA_DURATION.echo)
    return
  }

  // Held while a gathering is live: one says all of you here, this says none
  // of you stay anywhere.
  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    s.next.echo = FLOOR_AFTER_SOAK
    return
  }

  // One per ten bodies, and this is the one number here that had to go the
  // other way from the brand's.
  //
  // The brand needed one per five before it taught anything, because a mark
  // that lands is one demand and a pool lands 0.45 times a second across a
  // ten-man. This is not one demand: a mark is five beats, so one mark at a
  // ten-man is already a piece of floor going out from under somebody every
  // second, and the boss re-casts as soon as the last beat has run out. At
  // one per five it measured 65 points of teaching and 77 percent of a first
  // pull dead — which is not a hard mechanic, it is a wall, and the rung
  // above it is unplayable rather than unpractised. At one per ten it is 25
  // points and 25 percent.
  const free = livingParty(s)
  const marks = Math.max(1, Math.round(free.length / 10))
  for (let i = 0; i < marks && free.length > 0; i++) {
    const marked = free.splice(rng.int(free.length), 1)[0]!
    addAura(marked, 'echo', BOSS_ID)
    dropEcho(s, marked)
    if (marked.ai) say(s, marked, lineFor(fight(s), s.plan !== null, 'echo'))
  }
  s.sounds.push('telegraph')
  s.next.echo = ECHO_BEAT
}

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
export function verdictLine(actor: Actor): number {
  return actor.maxHp * VERDICT_LINE
}

function scheduleVerdict(s: SimState, rng: Rng, timing: PhaseTiming): void {
  if (timing.verdict <= 0) return
  s.next.verdict -= DT
  if (s.next.verdict > 0) return

  s.next.verdict = timing.verdict

  // It judges the whole and not the broken: see above.
  const free = livingParty(s).filter(
    (a) => !getAura(a, 'verdict') && a.hp > verdictLine(a),
  )
  if (free.length === 0) return

  const marks = Math.max(1, Math.round(livingParty(s).length / 5))
  for (let i = 0; i < marks && free.length > 0; i++) {
    const marked = free.splice(rng.int(free.length), 1)[0]!
    addAura(marked, 'verdict', BOSS_ID)
    pushEffect(s, 'cast', marked.pos, { abilityId: 'boss_verdict' })
    if (marked.ai) say(s, marked, lineFor(fight(s), s.plan !== null, 'verdict'))
  }
  s.sounds.push('telegraph')
}

/** The count reaching zero: above the line it passes over, below it takes. */
export function passJudgement(s: SimState, marked: Actor): void {
  if (marked.hp > verdictLine(marked)) {
    pushEffect(s, 'impact', marked.pos, { abilityId: 'boss_verdict', power: 260 })
    return
  }

  // Whatever is left, and then some. Written as the whole bar rather than as
  // a big number so that it stays lethal at every size and difficulty the
  // fight is played at: a mechanic whose promise is "this takes you" cannot
  // be a mechanic that sometimes does not.
  applyDamage(s, marked, marked.maxHp / HEALTH, 'none', {
    sourceId: BOSS_ID,
    mechanic: 'verdict',
    crit: true,
  })
  pushEffect(s, 'impact', marked.pos, {
    abilityId: 'boss_verdict',
    power: marked.maxHp,
    crit: true,
  })
  s.sounds.push('raid')
}

/**
 * Stone coming up through the floor, six spots at a time.
 *
 * The spots are telegraphed and the stone erupts all at once: standing on one
 * is the whole hit and standing beside it is none of it. That shape is not a
 * preference, it is the only one that has ever measured as teaching anything
 * here — a hazard that costs a raid in proportion to how wrong it was is one
 * whose mistakes come out in the average.
 *
 * It was designed around what happens next: the stone stays, so the floor is a
 * smaller and more awkward shape at the end of a pull than at the start, and
 * the raid is being asked which of the floor it can afford to spend. That is
 * the part that did not survive measurement — `SPIRE_LINGER` moves the
 * teaching by less than its own error bar over a four-fold range. What is left
 * is a good instant rather than a new question, and it is worth what a good
 * instant is worth.
 *
 * It is not a wall, and it cannot be. The raid's movement has no collision of
 * any kind — `clearTerrain` exists, but only a battleground ever passes it an
 * obstacle list and a raid's is empty by construction — so a spire that
 * blocked would have to invent one, and a collision system is a bigger thing
 * than a mechanic. It denies ground the way everything else here does: by
 * hurting whoever stands in it.
 */
const SPIRE_RADIUS = 62
const SPIRE_DAMAGE = 2200

/**
 * How long the stone stands, and the dial that turned out not to matter.
 *
 * This is the mechanic's whole idea — floor that does not come back — so it
 * was tuned first and hardest, and at the doubled cadence an isolated mechanic
 * used to be handed it read as the dominant dial: twenty-four seconds looked
 * worth half again what ten was. At the cadence the mechanic actually runs at,
 * 250 pairs a row:
 *
 *     6s   8.7pp    10s   9.0pp    16s   7.8pp    24s   10.0pp
 *
 * which is one number four times over. What teaches here is the eruption, not
 * the leftovers. Worth saying plainly because it is the opposite of what the
 * mechanic was designed around: the second question it was built to ask —
 * which of this floor will still be floor in a minute — is not one the raid is
 * measurably answering.
 *
 * So the value is chosen on what the long version costs everything else, which
 * is real. Ground that never expires is load-bearing for the rest of the game
 * in a way no other hazard is: the rendercheck stand-ins flee anything within
 * `radius + 20` and flee forever when it never clears, pressing nothing, and a
 * five-man opening built out of two such mechanics is a fight nobody can cast
 * in. Ten seconds is about twice a pool's five and a half — long enough to be
 * in the way of the next eruption, short enough that the arena still recovers.
 */
const SPIRE_LINGER = 10

/**
 * How many come up at once, per eight bodies.
 *
 * Clumping is a lever of its own, separately from the rate, and it does not
 * point the way the first measurement of it said. Held at 0.30 eruptions a
 * second across a ten-man and changing only the grain, 250 pairs a row:
 *
 *     2 every 6.7s   19.8pp      6 every 20s   9.0pp      12 every 40s   5.9pp
 *
 * Monotone, not the hump an earlier pass found at the doubled cadence. The
 * likely reason is arithmetic rather than psychology: twelve circles dropped
 * at one instant onto a raid that stands ninety to a hundred and twenty-five
 * from the boss overlap each other heavily, so the same stone per second
 * denies far less distinct ground when it arrives together. The share of
 * deaths practice removes barely moves across that row -- 61, 67, 57 -- which
 * says the grain is changing how much pressure there is rather than how
 * learnable it is.
 *
 * Three is kept anyway, which is a design choice made against the number. Two
 * at a time is a pool that stays a while; six at a time is an eruption, and
 * the eruption is the mechanic. The finer setting is a real and measured
 * option if the rung ever needs to be worth more.
 */
const SPIRE_BURST = 3

/**
 * And how many may come up in one eruption, whatever the size of the raid.
 *
 * Everything else in this game counts its volume per body for a good reason —
 * a fixed number of spots across twenty-five means no one person is ever on
 * one — but what this spends is floor, and the floor is the same 460 across
 * whoever turns up. Counted per body a twenty-five man met twelve at once,
 * into a footprint no wider than a ten-man's, and wiped on every first pull
 * while the ten-man measured fine. The volume still scales; it stops scaling
 * before it stops being answerable.
 */
const SPIRE_AT_ONCE = 6

/**
 * The one piece of floor the fight cannot be asked to give up.
 *
 * The boss stands still for ninety-eight percent of a pull and the melee stand
 * on top of it, so a hazard that permanently denies the ring at melee range
 * does not make the fight harder, it makes it unperformable — and an
 * unperformable mechanic measures as a flat wipe at every level of practice,
 * which is the same as measuring nothing. The eruption is pushed out to the
 * near edge of where the floor can be afforded.
 */
const SPIRE_MELEE_ROOM = MELEE_RANGE + SPIRE_RADIUS

function scheduleSpire(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.spire <= 0) return
  s.next.spire -= DT
  if (s.next.spire > 0) return

  // Held while a gathering is live, for the reason every other piece of floor
  // is: one mechanic saying all of you here and another saying not there is
  // two mechanics cancelling rather than one hard one.
  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    s.next.spire = FLOOR_AFTER_SOAK
    return
  }

  s.next.spire = timing.spire

  const victims = livingParty(s)
  if (victims.length === 0) return

  // Where people are, because where people are not is floor nobody was going
  // to miss.
  const count = Math.min(SPIRE_AT_ONCE, SPIRE_BURST * Math.max(1, Math.ceil(s.party.length / 8)))
  for (let i = 0; i < count; i++) {
    const victim = rng.pick(victims)
    const pos = { x: victim.pos.x + rng.range(-26, 26), y: victim.pos.y + rng.range(-26, 26) }
    const away = Math.hypot(pos.x - b.pos.x, pos.y - b.pos.y)
    if (away < SPIRE_MELEE_ROOM) {
      // Pushed straight out along its own bearing rather than re-rolled, so
      // the spot still belongs to the body it was aimed at.
      const bearing =
        away < 0.001 ? rng.range(0, Math.PI * 2) : Math.atan2(pos.y - b.pos.y, pos.x - b.pos.x)
      pos.x = b.pos.x + Math.cos(bearing) * SPIRE_MELEE_ROOM
      pos.y = b.pos.y + Math.sin(bearing) * SPIRE_MELEE_ROOM
    }
    clampToArena(pos, SPIRE_RADIUS)
    s.ground.push({
      ...blankGround(s),
      kind: 'spire',
      pos,
      radius: SPIRE_RADIUS,
      telegraph: PUDDLE_TELEGRAPH,
      lingering: SPIRE_LINGER * affixLinger(s.affix),
      damage: SPIRE_DAMAGE,
    })
    pushEffect(s, 'cast', pos, { abilityId: 'boss_spire' })
  }
  s.sounds.push('telegraph')
  say(s, b, lineFor(fight(s), s.plan !== null, 'spire'))
}

/** Where a brand burned out, the floor keeps it. */
export function burnBrand(s: SimState, at: Vec2): void {
  s.ground.push({
    ...blankGround(s),
    kind: 'brand',
    pos: { x: at.x, y: at.y },
    radius: BRAND_RADIUS,
    telegraph: PUDDLE_TELEGRAPH,
    lingering: BRAND_LINGER * affixLinger(s.affix),
    damage: BRAND_DAMAGE,
    detonated: false,
  })
  pushEffect(s, 'impact', at, { abilityId: 'boss_brand', power: BRAND_DAMAGE })
}

/**
 * Something picks one of you and walks after it.
 *
 * The only mechanic here aimed at one person, and the only one with two
 * answers at once. The one it picked has to keep moving, which costs them
 * every cast they would have made standing still; everybody else has to
 * decide whether to break off and kill it or leave them to it. Every other
 * hostile in this game goes for whoever is nearest — a rule the party answers
 * by standing somewhere else, which is no answer at all here.
 *
 * Never the tank. A tank that runs takes the boss with it, and a mechanic
 * whose answer is "drag the fight across the arena" is a mechanic that breaks
 * every other one at the same time.
 */
function scheduleHunt(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  // The Choir's second rung, the Tidebreaker's last, and a floor that rolled it.
  const every = timing.hunt
  if (every <= 0) return
  s.next.hunt -= DT
  if (s.next.hunt > 0) return
  s.next.hunt = every

  // Never a tank, and never a healer.
  //
  // A tank that runs takes the boss with it. A healer that runs stops
  // healing, and in this party that is the whole fight — measured, hunting
  // the healer one pull in four raised deaths across every role, including
  // the tank, who is never picked. What is left is a damage dealer, which is
  // the role that can afford to spend a while doing nothing but walking.
  const quarry = livingParty(s).filter((a) => a.role === 'dps' && !getAura(a, 'hunted'))
  if (quarry.length === 0) return
  const victim = rng.pick(quarry)

  // Spawned away from whoever it wants, so the first thing that happens is a
  // walk rather than a hit.
  //
  // A distance, not a fraction of the room. It was written as four fifths of
  // the arena, which read the same while the arena was one size and became a
  // different mechanic when the floor doubled: the walk doubled with it, the
  // stalker took twice as long to arrive and twice as long to die, and pulls
  // grew by ten to twenty seconds. That is invisible in a win rate and it is
  // most of a damage spread, because damage is measured over the length of the
  // pull — the two specs whose pulls grew most lost fourteen and nine points
  // of it while their uptime on the boss went up.
  //
  // The number is what four fifths of the old arena came to, so the mechanic
  // is the one that was tuned.
  const away = Math.atan2(victim.pos.y, victim.pos.x) + Math.PI
  const pos = { x: Math.cos(away) * STALKER_WALK, y: Math.sin(away) * STALKER_WALK }
  clampToArena(pos, 20)

  const stalker = makeAdd(s.nextObjectId++, pos.x, pos.y)
  stalker.name = 'Stalker'
  stalker.hp = STALKER_HP
  stalker.maxHp = STALKER_HP
  stalker.moveSpeed = STALKER_SPEED
  stalker.hunting = victim.id
  s.actors.push(stalker)

  addAura(victim, 'hunted', stalker.id)
  s.sounds.push('telegraph')
  say(s, b, lineFor(fight(s), s.plan !== null, 'hunt'))
  pushEffect(s, 'cast', pos, { abilityId: 'boss_stalk' })
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
    hunting: null,
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
    // The one summon that does nothing at all. It does not walk and it does
    // not swing: what it does is finish, and the only thing on the field that
    // can stop it is somebody deciding to hit it. That is the read, so it has
    // to be true of the thing and not only of its description.
    if (add.spawn === 'knell' || add.spawn === 'spike') continue

    let nearest: Actor | null = null
    let best = Infinity

    // A stalker has already chosen. It walks past everybody else to get to
    // the one it wants, and stops existing when that one is no longer marked
    // — killed, or simply outlasted it.
    if (add.hunting !== null) {
      const quarry = s.actors.find((a) => a.id === add.hunting)
      if (!quarry || !quarry.alive || !getAura(quarry, 'hunted')) {
        add.alive = false
        pushEffect(s, 'impact', add.pos, { abilityId: 'boss_stalk', power: 300 })
        continue
      }
      nearest = quarry
      best = dist(add.pos, quarry.pos)
    } else {
      for (const p of livingParty(s)) {
        const d = dist(add.pos, p.pos)
        if (d < best) {
          best = d
          nearest = p
        }
      }
    }
    if (!nearest) continue

    // Which way it is turned. Nothing but the drawing reads this on an add —
    // the gaze only ever asks the party — so it was never set, and every
    // thrall in the game spent the whole fight facing right. One chasing
    // somebody to its left walked there backwards.
    turnToward(add, Math.atan2(nearest.pos.y - add.pos.y, nearest.pos.x - add.pos.x))

    if (best > MELEE_RANGE) {
      const stepX = ((nearest.pos.x - add.pos.x) / best) * add.moveSpeed * DT
      const stepY = ((nearest.pos.y - add.pos.y) / best) * add.moveSpeed * DT
      add.pos.x += stepX
      add.pos.y += stepY
      clampToArena(add.pos, add.radius)
      clearTerrain(s.obstacles, add.pos, add.radius, stepX, stepY)
    }

    const stalking = add.hunting !== null
    add.swingTimer -= DT
    if (add.swingTimer <= 0 && best <= MELEE_RANGE + nearest.radius) {
      const damage = hit(
        s,
        add.spawn === 'herald' ? HERALD_DAMAGE : stalking ? STALKER_DAMAGE : ADD_DAMAGE,
      )
      const blame: DamageOptions = { sourceId: add.id }
      // Being caught by the thing following you is a mistake with a name.
      // An ordinary thrall in melee is not one: it is there to be killed.
      if (stalking) blame.mechanic = 'hunt'
      applyDamage(s, nearest, damage, 'physical', blame)
      pushEffect(s, 'impact', nearest.pos, {
        abilityId:
          add.spawn === 'herald' ? 'boss_herald' : stalking ? 'boss_stalk' : 'boss_thrall',
        power: damage,
        angle: Math.atan2(nearest.pos.y - add.pos.y, nearest.pos.x - add.pos.x),
      })
      add.swingTimer = stalking ? STALKER_SWING : ADD_SWING
    }
  }

  // Before the corpses go, since one kind of corpse is a bill.
  shatterVessels(s)

  // Corpses are dropped once they stop being useful to draw.
  s.actors = s.actors.filter((a) => a.faction !== 'boss' || a.alive || a.id === boss(s).id)
}

function blankGround(s: SimState): GroundEffect {
  return {
    id: s.nextObjectId++,
    kind: 'puddle',
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

  if (castId === 'boss_knell') {
    toll(s, targetId)
    return
  }

  if (castId === 'boss_vessel') {
    sink(s, targetId)
    return
  }

  if (castId === 'boss_breath') {
    const cone = s.ground.find((g) => g.kind === 'breath' && !g.detonated)
    if (!cone) return
    cone.detonated = true
    cone.lingering = 0.3
    for (const a of livingParty(s)) {
      if (!insideCone(a.pos, cone)) continue
      const damage = mechanic(s, cone.damage)
      applyDamage(s, a, damage, 'magic', { sourceId: b.id, mechanic: 'breath' })
      // Along the cone rather than along the line to the boss, so the streak
      // reads as the breath going through them.
      pushEffect(s, 'impact', a.pos, {
        abilityId: 'boss_breath',
        power: damage,
        angle: cone.angle,
      })
    }
    // And the mouth it came out of.
    pushEffect(s, 'impact', b.pos, {
      abilityId: 'boss_breath',
      power: cone.damage,
      angle: cone.angle,
      crit: true,
    })
  }
}

/**
 * Whether a spot is under the turning wedge, now or on a beat still to come.
 *
 * `ahead` of zero is the pulse about to land; one is the pulse after that.
 * The second is the mechanic. Every other shape in the game can be answered
 * by asking whether a spot is dangerous, and this one has to be answered by
 * asking whether it is *about to be* — the ground the hand has just left is
 * the ground worth standing on, and it looks exactly like the ground a pace
 * ahead of it, which is worth a health bar.
 */
export function underHand(p: Vec2, g: GroundEffect, ahead = 0): boolean {
  if (ahead > g.pulses - 1) return false
  const dx = p.x - g.pos.x
  const dy = p.y - g.pos.y
  if (Math.hypot(dx, dy) > g.radius) return false

  let delta = Math.atan2(dy, dx) - (g.angle + g.turn * ahead)
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  return Math.abs(delta) <= g.halfWidth
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
    if (g.kind === 'shockwave') {
      if (!g.detonated) {
        g.telegraph -= DT
        if (g.telegraph <= 0) g.detonated = true
        continue
      }
      g.radius += g.growth * DT
      for (const a of livingParty(s)) {
        if (g.caught.includes(a.id)) continue
        const d = dist(a.pos, g.pos)
        // The ring outruns everyone, so the answer is to be inside it, not
        // ahead of it: run toward the boss, not away.
        if (d >= g.radius - g.band && d <= g.radius + g.band && !inShockwaveGap(a.pos, g)) {
          g.caught.push(a.id)
          const damage = mechanic(s, g.damage)
          applyDamage(s, a, damage, 'magic', { sourceId: BOSS_ID, mechanic: g.kind })
          // Outward from the centre, which is the direction it ran them down
          // from — and the opposite of the way they should have gone.
          pushEffect(s, 'impact', a.pos, {
            abilityId: 'boss_shockwave',
            power: damage,
            angle: Math.atan2(a.pos.y - g.pos.y, a.pos.x - g.pos.x),
          })
        }
      }
      if (g.radius > ARENA_RADIUS + g.band) g.lingering = 0
      continue
    }

    if (g.kind === 'soak') {
      if (g.detonated) continue
      g.telegraph -= DT
      if (g.telegraph > 0) continue
      g.detonated = true

      // Divided by however many stood in it, and then dealt to everyone. A
      // party that sends nobody pays the whole thing each, which is what
      // makes it a decision rather than an optional errand.
      const party = livingParty(s)
      const inside = party.filter((a) => dist(a.pos, g.pos) <= g.radius)
      // Against the living headcount, not a flat pool: see SOAK_EACH.
      const missing = party.length / Math.max(1, inside.length)
      // Not through `mechanic`, which is the boss's floor multiplier.
      //
      // Same reason the damage is flat against the difficulty (see where the
      // circle is placed): the gathering is a positional demand with a tax
      // attached, and the tax compounds badly with everything else. Run
      // through the floor multiplier it would cost nearly three times as much
      // on the Tidebreaker as on the Warden, for a mechanic whose whole
      // question — is everybody standing here — is the same on both.
      const share = hit(s, g.damage * Math.min(SOAK_MAX_SHARE, missing))
      for (const a of party) {
        const blame: DamageOptions = { sourceId: BOSS_ID }
        // Only the ones who were not there failed anything.
        if (!inside.includes(a)) blame.mechanic = 'soak'
        applyDamage(s, a, share, 'magic', blame)
        pushEffect(s, 'impact', a.pos, { abilityId: 'boss_soak', power: share })
      }
      pushEffect(s, 'impact', g.pos, {
        radius: g.radius,
        abilityId: 'boss_soak',
        power: g.radius * 9,
        crit: true,
      })
      s.sounds.push('raid')
      continue
    }

    if (g.kind === 'breath') {
      // Purely a telegraph; the damage lands when the cast resolves.
      if (!g.detonated) g.telegraph -= DT
      else g.lingering -= DT
      continue
    }

    // The wedge, which is not finished when it goes off: it fires, turns,
    // and waits out the next beat. Each pulse is all of it or none of it at
    // one instant, the way the caving band is — what makes it a different
    // mechanic is that the next instant asks about different ground.
    if (g.kind === 'hand') {
      g.telegraph -= DT
      if (g.telegraph > 0) continue

      s.sounds.push('raid')
      pushEffect(s, 'impact', g.pos, {
        radius: g.radius,
        abilityId: 'boss_hand',
        power: ARENA_RADIUS * 4,
        angle: g.angle,
        crit: true,
      })
      for (const a of livingParty(s)) {
        // The wedge's own edge, with nothing forgiven on the body's radius,
        // for the crush's reason: a mechanic answered by a step out cannot
        // also be one that lets a shoulder hang over the line.
        if (!underHand(a.pos, g)) continue
        const damage = mechanic(s, g.damage)
        applyDamage(s, a, damage, 'magic', { sourceId: BOSS_ID, mechanic: g.kind })
        pushEffect(s, 'impact', a.pos, {
          abilityId: 'boss_hand',
          power: damage,
          angle: Math.atan2(a.pos.y - g.pos.y, a.pos.x - g.pos.x),
        })
      }

      g.pulses -= 1
      g.angle += g.turn
      g.telegraph = HAND_BEAT
      continue
    }

    // A beat of the echo. The same instant as the band and the wedge, and
    // the same lack of a residue: what it leaves behind is nothing, because
    // the question it asks is about the next beat.
    if (g.kind === 'echo') {
      if (g.detonated) continue
      g.telegraph -= DT
      if (g.telegraph > 0) continue
      g.detonated = true
      pushEffect(s, 'impact', g.pos, {
        radius: g.radius,
        abilityId: 'boss_echo',
        power: g.radius * 12,
        crit: true,
      })
      for (const a of livingParty(s)) {
        if (dist(a.pos, g.pos) > g.radius - a.radius * 0.6) continue
        const damage = mechanic(s, g.damage)
        applyDamage(s, a, damage, 'magic', { sourceId: BOSS_ID, mechanic: g.kind })
        pushEffect(s, 'impact', a.pos, { abilityId: 'boss_echo', power: damage })
      }
      continue
    }

    // The floor splitting, and the floor going under. Both are the crush's
    // shape rather than a pool's — announced, and then the whole of it in one
    // frame — so they are resolved here beside it rather than with the ground
    // that keeps burning afterwards. What differs is only the question asked
    // of a position: which side of a line, and whether it is on one of the
    // patches left standing.
    if (g.kind === 'fault' || g.kind === 'shallows') {
      if (g.detonated) continue
      g.telegraph -= DT
      if (g.telegraph > 0) continue
      g.detonated = true
      s.sounds.push('raid')
      s.raidFlash = 0.35
      const mark = g.kind === 'fault' ? 'boss_fault' : 'boss_shallows'
      pushEffect(s, 'impact', g.pos, {
        radius: g.radius,
        abilityId: mark,
        power: g.radius * 12,
        crit: true,
        angle: g.angle,
      })
      for (const a of livingParty(s)) {
        // No forgiveness on the actor's radius, the same as the crush: a
        // mechanic answered by crossing a line cannot also be a mechanic that
        // lets a shoulder hang over it.
        const caught = g.kind === 'fault' ? condemned(a.pos, g) : !onShallows(a.pos, g)
        if (!caught) continue
        const damage = mechanic(s, g.damage)
        applyDamage(s, a, damage, 'magic', { sourceId: BOSS_ID, mechanic: g.kind })
        pushEffect(s, 'impact', a.pos, { abilityId: mark, power: damage, angle: g.angle })
      }
      continue
    }

    // The split, counted once. What it reads is not where anybody is but who
    // is standing next to whom, so it is the one shape here whose answer is
    // in the party rather than on the floor.
if (g.kind === 'schism') {
      if (g.detonated) continue
      g.telegraph -= DT
      if (g.telegraph > 0) continue
      g.detonated = true

      s.sounds.push('raid')
      const party = livingParty(s)
      const caught = party.filter((a) =>
        party.some((other) => other.id !== a.id && schismClash(a, other) && dist(a.pos, other.pos) <= g.radius),
      )
      for (const a of caught) {
        const damage = mechanic(s, g.damage)
        applyDamage(s, a, damage, 'magic', { sourceId: BOSS_ID, mechanic: g.kind })
        pushEffect(s, 'impact', a.pos, { abilityId: 'boss_schism', power: damage })
      }
      // Cleared here rather than left to run out, so the marks are gone the
      // moment they stop meaning anything and nobody keeps walking away from
      // a group that is no longer a group.
      for (const a of party) clearAura(a, 'schism')
      pushEffect(s, 'impact', g.pos, {
        radius: g.radius,
        abilityId: 'boss_schism',
        power: g.radius * 5,
        crit: true,
      })
      continue
    }

    // The plate coming due, and which of the two bad outcomes the raid
    // bought. Somebody stood on it and one body pays, or nobody did and all
    // of them do. There is no third answer and there is deliberately no
    // partial one: a price that could be half paid is a price that comes out
    // in the average, and an average is the one thing measurement here has
    // never been able to see a difference in.
    if (g.kind === 'toll') {
      if (g.detonated) continue
      g.telegraph -= DT
      if (g.telegraph > 0) continue
      g.detonated = true
      s.sounds.push('raid')
      pushEffect(s, 'impact', g.pos, {
        radius: g.radius,
        abilityId: 'boss_toll',
        power: g.radius * 12,
        crit: true,
      })

      const standing = livingParty(s).filter((a) => dist(a.pos, g.pos) <= g.radius)
      if (standing.length === 0) {
        // The body the raid named, and nobody else.
        //
        // This was a raid-wide hit first, and it is the mechanic's one real
        // mistake. A bill written to the whole roster is a rate, and healing
        // is a rate, so a bigger raid absorbs it and a smaller one is wiped
        // by it with no size in between: measured at three sizes, the same
        // code taught 13.0 points at twenty-five, 7.6 at ten and nothing at
        // all at five. Billed to the one body that was asked to go and did
        // not, it is the same question with the answer landing where the
        // choosing did -- and it writes one bill an instant instead of
        // twenty-five, which is the other half of the same rule.
        const named = tollPayer(s, g)
        if (named) {
          const owed = mechanic(s, TOLL_UNPAID)
          applyDamage(s, named, owed, 'magic', { sourceId: BOSS_ID, mechanic: g.kind })
          pushEffect(s, 'impact', named.pos, {
            abilityId: 'boss_toll',
            power: owed,
            crit: true,
          })
          s.raidFlash = 0.35
        }
        continue
      }

      // One body, and not a share each. Whoever is nearest the middle of it
      // pays the whole thing and everyone else who wandered in pays nothing,
      // which is what keeps a crowd from being an answer -- turning up in
      // numbers does not make it cheaper, it only changes whose bill it is.
      let payer = standing[0]!
      for (const a of standing) {
        if (dist(a.pos, g.pos) < dist(payer.pos, g.pos)) payer = a
      }
      const damage = mechanic(s, g.damage)
      applyDamage(s, payer, damage, 'magic', { sourceId: BOSS_ID, mechanic: g.kind })
      pushEffect(s, 'impact', payer.pos, { abilityId: 'boss_toll', power: damage, crit: true })
      continue
    }

    // The reach closing. It takes hold of one body and charges it for
    // everybody who was still inside, so there is no safety in a crowd and
    // none in a line either -- only in somebody else being nearer.
    if (g.kind === 'grasp') {
      if (g.detonated) continue
      g.telegraph -= DT
      if (g.telegraph > 0) continue
      g.detonated = true
      pushEffect(s, 'impact', g.pos, {
        radius: g.radius,
        abilityId: 'boss_grasp',
        power: g.radius * 8,
        crit: true,
      })

      // Whoever is holding the boss is not reachable by this, which is the
      // rule the stalker and the split both keep. A tank cannot walk a
      // hundred units without taking the fight with it, so a mechanic that
      // could bill one is a mechanic answered by a role rather than by a
      // decision -- and the tank would be nearest on every single cast.
      const caught = livingParty(s).filter(
        (a) => a.role !== 'tank' && dist(a.pos, g.pos) <= g.radius,
      )
      if (caught.length === 0) continue
      let taken = caught[0]!
      for (const a of caught) {
        if (dist(a.pos, g.pos) < dist(taken.pos, g.pos)) taken = a
      }
      const damage = mechanic(s, g.damage * graspBill(caught.length))
      applyDamage(s, taken, damage, 'magic', { sourceId: BOSS_ID, mechanic: g.kind })
      pushEffect(s, 'impact', taken.pos, { abilityId: 'boss_grasp', power: damage, crit: true })
      s.sounds.push('raid')
      continue
    }

    // The stones, counted out. Read off where the marked are standing rather
    // than off what they were told, so a body that walked onto somebody
    // else's has not saved itself: the nearest of the marked keeps it and the
    // other one is standing on ground that is not theirs with nowhere left to
    // go.
    if (g.kind === 'refuge') {
      if (g.detonated) continue
      g.telegraph -= DT
      if (g.telegraph > 0) continue
      g.detonated = true
      s.sounds.push('raid')

      const marked = livingParty(s).filter((a) => getAura(a, 'refuge') !== undefined)
      const kept = new Set<number>()
      for (const spot of g.spots ?? []) {
        let holder: Actor | null = null
        for (const a of marked) {
          if (dist(a.pos, spot) > g.radius) continue
          if (holder === null || dist(a.pos, spot) < dist(holder.pos, spot)) holder = a
        }
        if (holder) kept.add(holder.id)
      }

      pushEffect(s, 'impact', g.pos, {
        radius: g.radius,
        abilityId: 'boss_refuge',
        power: g.radius * 10,
        crit: true,
      })
      for (const a of marked) {
        // Cleared here rather than left to run out, the way the split's marks
        // are: they say which stone is yours, and the moment the stones are
        // gone they say nothing.
        clearAura(a, 'refuge')
        if (kept.has(a.id)) continue
        const damage = mechanic(s, g.damage)
        applyDamage(s, a, damage, 'magic', { sourceId: BOSS_ID, mechanic: g.kind })
        pushEffect(s, 'impact', a.pos, { abilityId: 'boss_refuge', power: damage })
      }
      continue
    }

    // A pool's shape with a longer memory: it announces, takes everything
    // inside it at one instant, and then the stone stays. Written as its own
    // arm rather than folded into the pools below, even though the sequence is
    // the same one, because the two differ in the only place it would matter —
    // the effect it draws — and a shared arm that picks a name off `g.kind` is
    // a line every future kind has to remember to edit.
    if (g.kind === 'spire') {
      if (!g.detonated) {
        g.telegraph -= DT
        if (g.telegraph <= 0) {
          g.detonated = true
          s.sounds.push('raid')
          pushEffect(s, 'impact', g.pos, {
            radius: g.radius,
            abilityId: 'boss_spire',
            power: g.radius * 12,
            crit: true,
          })
          for (const a of livingParty(s)) {
            if (dist(a.pos, g.pos) > g.radius - a.radius * 0.6) continue
            const damage = mechanic(s, g.damage)
            applyDamage(s, a, damage, 'magic', { sourceId: BOSS_ID, mechanic: g.kind })
            pushEffect(s, 'impact', a.pos, { abilityId: 'boss_spire', power: damage })
          }
        }
        continue
      }
      // Standing stone. The same silent residue a pool leaves, which is what
      // makes the ground denied rather than decorative — nobody is meant to be
      // in here, and the AI treats it as live fire for as long as it stands.
      g.lingering -= DT
      for (const a of livingParty(s)) {
        if (dist(a.pos, g.pos) <= g.radius - a.radius * 0.6) {
          applyDamage(s, a, mechanic(s, 110 * DT), 'magic', { sourceId: BOSS_ID, silent: true })
        }
      }
      continue
    }

    // Nothing to leave, and nothing to be inside of. What this arm reads at
    // the instant the count runs out is whether a body was still working --
    // mid-cast, or with most of a global still on it -- which is the resting
    // state of every rotation in the game and therefore the failing one.
    if (g.kind === 'vigil') {
      if (g.detonated) continue
      g.telegraph -= DT
      if (g.telegraph > 0) continue
      g.detonated = true
      s.sounds.push('raid')
      s.raidFlash = 0.3
      pushEffect(s, 'impact', g.pos, { radius: g.radius, abilityId: 'boss_vigil', power: 320, crit: true })
      for (const a of livingParty(s)) {
        if (!stillWorking(a)) continue
        const damage = mechanic(s, g.damage)
        applyDamage(s, a, damage, 'magic', { sourceId: BOSS_ID, mechanic: g.kind })
        pushEffect(s, 'impact', a.pos, { abilityId: 'boss_vigil', power: damage })
      }
      continue
    }

    // The note landing, which happens only because the body it named did not
    // cut it. Everybody pays, and exactly one of them failed: the mark is
    // what says which, and it is the only place in the ground loop where the
    // hit and the failure are recorded against different people.
    if (g.kind === 'chant') {
      if (g.detonated) continue
      g.telegraph -= DT
      if (g.telegraph > 0) continue
      g.detonated = true
      s.sounds.push('raid')
      s.raidFlash = 0.45
      pushEffect(s, 'impact', g.pos, { radius: g.radius, abilityId: 'boss_chant', power: 900, crit: true })
      const named = chantNamed(s)
      for (const a of livingParty(s)) {
        const mine = named !== null && a.id === named.id
        const damage = mechanic(s, mine ? g.damage : CHANT_SHARE)
        // The named one is the only one who could have done anything about
        // it; the share everybody else pays is the mechanic working, not
        // them failing it.
        const blame: DamageOptions = { sourceId: BOSS_ID }
        if (mine) blame.mechanic = g.kind
        applyDamage(s, a, damage, 'magic', blame)
        pushEffect(s, 'impact', a.pos, { abilityId: 'boss_chant', power: damage })
      }
      if (named) clearAura(named, 'chant')
      continue
    }

    // A bearing rather than a place. It takes whoever is still turned toward
    // where it opened, wherever they happen to be standing -- and since a
    // party fights what it is looking at, that is everybody who did nothing.
    if (g.kind === 'gaze') {
      if (g.detonated) continue
      g.telegraph -= DT
      if (g.telegraph > 0) continue
      g.detonated = true
      s.sounds.push('raid')
      s.raidFlash = 0.3
      pushEffect(s, 'impact', g.pos, { radius: g.radius, abilityId: 'boss_gaze', power: 460, crit: true })
      for (const a of livingParty(s)) {
        if (!watched(a, g)) continue
        const damage = mechanic(s, g.damage)
        applyDamage(s, a, damage, 'magic', { sourceId: BOSS_ID, mechanic: g.kind })
        pushEffect(s, 'impact', a.pos, { abilityId: 'boss_gaze', power: damage })
      }
      continue
    }

    // All of it or none of it, at one instant. Handled apart from the pools
    // below rather than folded into them: those keep burning after they go
    // off and the whole of this one is the frame it lands on.
    if (g.kind === 'crush') {
      if (g.detonated) continue
      g.telegraph -= DT
      if (g.telegraph > 0) continue
      g.detonated = true
      s.sounds.push('raid')
      s.raidFlash = 0.35
      pushEffect(s, 'impact', g.pos, {
        radius: g.radius,
        abilityId: 'boss_crush',
        power: g.radius * 12,
        crit: true,
      })
      for (const a of livingParty(s)) {
        // The band's own edge, with no forgiveness on the actor's radius: a
        // mechanic whose answer is a step out cannot also be a mechanic that
        // lets a shoulder hang over the line.
        if (dist(a.pos, g.pos) > g.radius) continue
        const damage = mechanic(s, g.damage)
        applyDamage(s, a, damage, 'magic', { sourceId: BOSS_ID, mechanic: g.kind })
        pushEffect(s, 'impact', a.pos, { abilityId: 'boss_crush', power: damage })
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
        const mark =
          g.kind === 'brand' ? 'boss_brand' : g.kind === 'coldflame' ? 'boss_coldflame' : 'boss_puddle'
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

    g.lingering -= DT
    for (const a of livingParty(s)) {
      if (dist(a.pos, g.pos) <= g.radius - a.radius * 0.6) {
        // Per-tick residue: silent, and not a separate "mechanic hit" each frame.
        applyDamage(s, a, mechanic(s, 110 * DT), 'magic', { sourceId: BOSS_ID, silent: true })
      }
    }
  }

  s.ground = s.ground.filter((g) => {
    // Nothing to linger: it is a place to be at a moment, not a place to
    // avoid afterwards.
    if (g.kind === 'soak') return !g.detonated
    if (g.kind === 'breath') return !g.detonated || g.lingering > 0
    if (g.kind === 'shockwave') return g.lingering > 0
    // The same rule as the circle, for the same reason: a moment, not a place.
    if (g.kind === 'crush') return !g.detonated
    // And the same again for the three that are nothing but a moment. There is
    // no ground under any of them to hand back.
    if (g.kind === 'vigil') return !g.detonated
    if (g.kind === 'chant') return !g.detonated
    if (g.kind === 'gaze') return !g.detonated
    // Unlike every other one-instant hazard above, it leaves something, so it
    // is kept until the stone is gone rather than dropped on the frame it
    // lands. Spelt out beside the others instead of falling through to the
    // pools' rule at the bottom, which is the same rule by coincidence.
    if (g.kind === 'spire') return !g.detonated || g.lingering > 0
    if (g.kind === 'fault' || g.kind === 'shallows') return !g.detonated
    // The same rule for all three of the ones about who pays: each of them is
    // a moment the raid arrives at or does not, and none of them leaves
    // anything on the floor afterwards.
    if (g.kind === 'toll' || g.kind === 'grasp' || g.kind === 'refuge') return !g.detonated
    if (g.kind === 'echo') return !g.detonated
    // The same rule again: a split is a count rather than a place, and what
    // keeps it on the floor is having something still to ask.
    if (g.kind === 'schism') return !g.detonated
    // It is done when it has finished turning, not when it has gone off: a
    // pulse is one of five, and `detonated` would have to mean "the last one"
    // for this shape and "the only one" for every other.
    if (g.kind === 'hand') return g.pulses > 0
    return !g.detonated || g.lingering > 0
  })
}

/**
 * The weight, and who is holding it.
 *
 * Every other mark in this game is a job for the person wearing it. A brand
 * is walked to empty floor by the one who is branded, a spread is walked away
 * from the raid by the one who is marked, a stalker is kited by the one it
 * picked. In each case the rest of the raid answers by leaving them room, and
 * leaving room is something a party does by standing still.
 *
 * This one cannot be answered by its carrier at all. The only thing that
 * takes it off is another body, and the body has to be one that has not held
 * it yet, so the raid does not get to nominate a volunteer and be done: it
 * has to keep producing fresh ones while the fight goes on underneath. Three
 * legs and the weight is spent. Miss a leg and it goes off in the hands it
 * was left in, for more the further it got.
 *
 * One per five bodies, which is the brand's rate and it is the brand's rate
 * for the brand's reason. The first cadence tried here was one weight every
 * twelve seconds, and the pull it produced had four of them in it — a raid
 * meets that mechanic four times, decides it four times, and there is not
 * enough of it in a fight to be worth learning. Rate is the first dial, not
 * the last.
 */
function scheduleBurden(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.burden <= 0) return
  s.next.burden -= DT
  if (s.next.burden > 0) return
  s.next.burden = timing.burden

  // Held while the party is being told to stand in one circle, the same way
  // the floor mechanics are. A gathering puts every body inside a hundred and
  // thirty five units of every other, which hands the whole chain over for
  // free — and a mechanic that solves itself during another mechanic is a
  // mechanic that reads as luck.
  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    s.next.burden = FLOOR_AFTER_SOAK
    return
  }

  const free = livingParty(s).filter((a) => !getAura(a, 'burden'))
  if (free.length === 0) return

  // One weight per five bodies, and never more than two at once.
  //
  // Without the cap a twenty-five man carried five chains and each chain ties
  // up three bodies -- the carrier, whoever is being walked to, and whoever
  // just handed it on -- so fifteen of twenty-five were mid-handoff at any
  // moment. Measured, that killed eighty percent of *practised* raids, which
  // leaves nothing for practice to remove and stops it being a mechanic at
  // all. The same crowding is what made this the one boss where the spec with
  // no instant in its rotation fell to two fifths of the best: a raid this
  // busy is a raid that is walking, and walking is the whole cost.
  //
  // Two is the roster raising the size of the demand rather than the count of
  // it, which is the rule that came out of the round that built these.
  const weights = Math.min(2, Math.max(1, Math.round(livingParty(s).length / 5)))
  for (let i = 0; i < weights && free.length > 0; i++) {
    const first = free.splice(rng.int(free.length), 1)[0]!
    addAura(first, 'burden', b.id)
    const weight = getAura(first, 'burden')
    if (weight) {
      weight.stacks = 1
      weight.held = [first.id]
    }
    pushEffect(s, 'cast', first.pos, { abilityId: 'boss_burden' })
    if (first.ai && i === 0) say(s, first, lineFor(fight(s), s.plan !== null, 'burden'))
  }
  s.sounds.push('telegraph')
}

/**
 * A weight changing hands, checked every tick rather than announced.
 *
 * There is no button for it and there deliberately is not one. An ability
 * would make the handoff a thing you press when you are already standing
 * there, and the standing there is the entire mechanic; keying it off
 * position means the answer is the walk, which is the only currency this
 * simulation actually charges anybody.
 *
 * Nearest fresh body rather than any fresh body, so two carriers crossing do
 * not swap chains in a way nobody could have read.
 */
function passBurdens(s: SimState): void {
  // One leg a tick, per weight. Without this the pass is worth however far
  // down the actor list the receiver happens to sit: a weight handed to
  // somebody with a higher id is picked up again later in the same loop and
  // can travel two legs in a single frame, and a chain that runs at a speed
  // decided by roster order is not a chain anybody can read.
  const moved = new Set<number>()
  for (const carrier of livingParty(s)) {
    const weight = getAura(carrier, 'burden')
    if (!weight || moved.has(carrier.id)) continue
    const taker = burdenTaker(s, carrier)
    if (!taker || dist(carrier.pos, taker.pos) > BURDEN_REACH) continue

    const held = weight.held ?? [carrier.id]
    const hands = weight.stacks + 1
    // Off the old hands before it is on the new ones, or the next tick sees a
    // chain of length one.
    const at = carrier.auras.findIndex((au) => au.id === 'burden')
    if (at >= 0) carrier.auras.splice(at, 1)

    if (hands > BURDEN_HANDS) {
      // Spent, and worth a look of its own: a mechanic that ends by quietly
      // not being there is one nobody knows they answered.
      pushEffect(s, 'cast', taker.pos, { abilityId: 'boss_burden' })
      s.sounds.push('telegraph')
      continue
    }

    addAura(taker, 'burden', BOSS_ID)
    const next = getAura(taker, 'burden')
    if (next) {
      next.stacks = hands
      next.held = [...held, taker.id]
      next.remaining = burdenFuse(hands - 1)
      next.duration = next.remaining
    }
    moved.add(taker.id)
    pushEffect(s, 'cast', taker.pos, { abilityId: 'boss_burden' })
  }
}

/**
 * A debt one person owes, and the question of who came to help pay it.
 *
 * The gathering read the other way round. A gathering is a circle drawn on
 * the floor and the raid walks to a place; this is a circle drawn on a person
 * who is still trying to answer everything else, and the raid has to walk to
 * *them*. What that changes is that the destination moves and there is more
 * than one of it: at ten bodies there are two of these at once, which is a
 * raid deciding how to divide itself rather than a raid going somewhere.
 *
 * Divided rather than dealt per head — see `shareYoke`. Turning up has to be
 * worth something to the people who turn up, not only to the one who owed it.
 */
function scheduleYoke(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.yoke <= 0) return
  s.next.yoke -= DT
  if (s.next.yoke > 0) return
  s.next.yoke = timing.yoke

  // Never on top of a gathering, for the reason the spread is not: one of them
  // says all of you in this circle and the other says all of you around this
  // person, and a party told both at once is a party told nothing.
  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    s.next.yoke = FLOOR_AFTER_SOAK
    return
  }

  // Never the tank. A tank that has to be surrounded drags the raid into the
  // boss's melee band, which is where the crush and the sweep already live,
  // and the mechanic would be answered by whichever of those happened not to
  // be up rather than by anybody's decision.
  const free = livingParty(s).filter((a) => a.role !== 'tank' && !getAura(a, 'yoke'))
  if (free.length === 0) return

  const marks = Math.max(1, Math.round(livingParty(s).length / 6))
  // Nobody is named twice. A ten-man carries two of these at once and two
  // carriers choosing independently choose the same body — whoever is furthest
  // from one of them is usually furthest from the other — which is not a hard
  // mechanic but an unanswerable one: the second yoke fails before it is
  // thrown, every time.
  const named = new Set<number>()
  for (let i = 0; i < marks && free.length > 0; i++) {
    const owed = free.splice(rng.int(free.length), 1)[0]!
    addAura(owed, 'yoke', b.id)
    const mark = getAura(owed, 'yoke')

    // Anybody far enough that going is a journey, chosen at random among them
    // rather than the single furthest.
    //
    // It was the furthest, on the reasoning that a nearer body is already
    // standing there -- a raid at rest is a blob about ninety units across, so
    // a yoke a neighbour can answer is one that was answered before it was
    // thrown. The reasoning is right and the implementation named a role.
    // Melee stand at the boss and ranged at three hundred and forty, so "the
    // furthest from that body" is a question with the same answer nearly every
    // cast, and the spec it kept picking paid for it: measured across the
    // dealers, the one with no instant in its rotation ended up at two fifths
    // of the best on this boss, because every yoke was its walk.
    //
    // A floor on the distance keeps the journey; the roll keeps it from being
    // the same person's journey every time. If nobody clears the floor -- a
    // raid stacked tighter than usual -- it falls back to the furthest, since
    // a short walk is still better than no answer at all.
    const eligible = livingParty(s).filter(
      (a) => a.id !== owed.id && a.role !== 'tank' && !getAura(a, 'yoke') && !named.has(a.id),
    )
    const travelled = eligible.filter((a) => dist(owed.pos, a.pos) >= YOKE_REACH * 2)
    let bearer: Actor | null = null
    if (travelled.length > 0) {
      bearer = travelled[rng.int(travelled.length)]!
    } else {
      let furthest = -1
      for (const a of eligible) {
        const d = dist(owed.pos, a.pos)
        if (d > furthest) {
          furthest = d
          bearer = a
        }
      }
    }
    if (mark && bearer) {
      mark.bearer = bearer.id
      named.add(bearer.id)
      if (bearer.ai) say(s, bearer, lineFor(fight(s), s.plan !== null, 'yoke'))
    }

    pushEffect(s, 'cast', owed.pos, { abilityId: 'boss_yoke' })
  }
  s.sounds.push('telegraph')
}

/**
 * A price the boss names and the raid has to put a body against.
 *
 * The judgement read backwards. A judgement picks somebody and the raid
 * answers for them; this picks nobody at all -- it lays a plate on the far
 * side of the arena, starts counting, and what it is asking for is a name.
 * Somebody has to be standing on it when the count runs out, and if nobody is
 * then the whole raid pays instead, for more than the one would have.
 *
 * Two things make it a decision rather than a dodge. The plate is out past
 * where anybody has business being, so going costs the fight a body for two
 * seconds and coming back costs another; and the price is flat, so it is a
 * scratch on whoever still has most of a bar and it finishes whoever does
 * not. The raid is not being asked to move, it is being asked who it can
 * afford to send.
 *
 * The nomination is made once, here, and written onto the plate. See
 * `tollPayer` for why it cannot be worked out again later.
 */
function scheduleToll(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.toll <= 0) return
  s.next.toll -= DT
  if (s.next.toll > 0) return
  s.next.toll = timing.toll

  // Never against a gathering, which is the same instruction pointed at
  // everybody: one says all of you into this circle and this says exactly one
  // of you into that one, and a party told both at once is a party told
  // nothing.
  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    s.next.toll = FLOOR_AFTER_SOAK
    return
  }
  // And never two plates at once. Two nominations is not twice the mechanic,
  // it is a raid with two people walking away from the fight at the same
  // time, which is a tax rather than a question.
  if (s.ground.some((g) => g.kind === 'toll')) {
    s.next.toll = 0.5
    return
  }

  // Never a tank, for the reason nothing else that asks for a journey names
  // one: the boss follows whoever is holding it, so a tank sent two hundred
  // units out does not pay a toll, it drags the fight across the arena and
  // every other mechanic on the table is answered wrong while it does.
  const free = livingParty(s).filter((a) => a.role !== 'tank')
  if (free.length === 0) return

  // Whoever has most of their bar left, which is the raid making the call
  // rather than the boss making it. Read once, out loud, and then it is that
  // person's walk -- the shape a raid uses for anything that has to be decided
  // faster than it can be discussed.
  //
  // The share of a bar and not the number on it, which was the first version
  // and turned the whole mechanic into a role. Plate carries the biggest bar
  // in the raid, so "most left" named a melee dealer on two hundred and
  // ninety-two casts out of two hundred and ninety-three -- and a melee dealer
  // stands at the boss, which is the furthest anybody in the raid is from the
  // plate. Measured, it was eighty units short every time it failed and just
  // as short on a ninth pull as on a first. That is not a mechanic with a
  // window in it; it is a tax on whoever wears the heaviest armour.
  //
  // The rotation is rolled so that a raid at full health does not name the
  // same body every cast. Ties are the normal case at the start of a pull and
  // an untied rule would answer them by actor order, which is a nomination
  // nobody made.
  const start = rng.int(free.length)
  let named = free[start]!
  for (let i = 1; i < free.length; i++) {
    const a = free[(start + i) % free.length]!
    if (a.hp / a.maxHp > named.hp / named.maxHp) named = a
  }

  // Laid out along the bearing the nominee already holds, with a roll on it.
  //
  // Not anywhere in the arena, which was the first version and made the walk
  // a different length on every cast -- sometimes a step and sometimes three
  // hundred units, which is not a mechanic with a window in it, it is a
  // mechanic that is free or impossible depending on where the last one left
  // everybody. Out along their own line the journey is about a hundred units
  // every time, so the count has one job: to be long enough for the walk and
  // short enough that noticing late does not fit inside it too.
  const held = Math.atan2(named.pos.y - b.pos.y, named.pos.x - b.pos.x)
  const bearing = held + rng.range(-0.5, 0.5)
  const plate: GroundEffect = {
    ...blankGround(s),
    kind: 'toll',
    pos: { x: b.pos.x + Math.cos(bearing) * TOLL_RANGE, y: b.pos.y + Math.sin(bearing) * TOLL_RANGE },
    radius: TOLL_RADIUS,
    telegraph: TOLL_TELEGRAPH,
    lingering: 0,
    damage: TOLL_PRICE,
    detonated: false,
    named: named.id,
  }
  clampToArena(plate.pos, TOLL_RADIUS)
  s.ground.push(plate)

  pushEffect(s, 'cast', plate.pos, { abilityId: 'boss_toll' })
  if (named.ai) say(s, named, lineFor(fight(s), s.plan !== null, 'toll'))
  s.sounds.push('telegraph')
}

/**
 * A reach that closes on a piece of floor and bills one body for everybody
 * who was slow.
 *
 * Every other hazard on this table charges each person it caught. That is a
 * bill that grows with how badly the raid played and lands spread across it,
 * and spread is how a mistake disappears -- five bodies each losing a fifth
 * of a bar is a healer's afternoon, not a lesson. This charges one, and it
 * raises what that one owes for each of the others still inside, so the raid
 * failing together is a single body's death rather than five people's dents.
 *
 * It is also the one shape here with no safe side to be on. Being outside a
 * radius is not the answer, because the radius takes whoever is nearest
 * whatever the distance; the answer is that somebody else is nearer than you,
 * which means the raid is choosing who pays by choosing who it leaves.
 */
function scheduleGrasp(s: SimState, rng: Rng, timing: PhaseTiming): void {
  if (timing.grasp <= 0) return
  s.next.grasp -= DT
  if (s.next.grasp > 0) return
  s.next.grasp = timing.grasp

  // Dropped on a body rather than on the arena, the way a pool is. Ground
  // chosen at random is ground the raid was not using, and a mechanic aimed
  // at floor nobody wanted is a mechanic nobody has to answer.
  const free = livingParty(s).filter((a) => a.role !== 'tank')
  if (free.length === 0) return

  // One, whatever the headcount, and this is the second half of the area
  // denial rule rather than a shrug at scaling. A reach writes a bill near
  // the top of a health bar in a single instant; three of them at
  // twenty-five write three, in the one second the healers have to answer
  // any of them. Measured, one per ten bodies took a twenty-five man from
  // 36.7% of unpractised raids dead to 66.3%, and it took the *practised*
  // rate to 24.3% -- which is the burden's failure exactly, a mechanic with
  // nothing left for practice to remove.
  //
  // What scales instead is the multiplier: a bigger raid puts more bodies
  // inside one circle, so the single bill it writes is a larger one. That is
  // the roster making the mechanic harder without the instant making it
  // unanswerable.
  const reaches = 1
  for (let i = 0; i < reaches && free.length > 0; i++) {
    const anchor = free.splice(rng.int(free.length), 1)[0]!
    const shape: GroundEffect = {
      ...blankGround(s),
      kind: 'grasp',
      pos: { x: anchor.pos.x, y: anchor.pos.y },
      radius: GRASP_REACH,
      telegraph: GRASP_TELEGRAPH,
      lingering: 0,
      damage: GRASP_DAMAGE,
      detonated: false,
    }
    s.ground.push(shape)
    pushEffect(s, 'cast', shape.pos, { abilityId: 'boss_grasp' })
    if (anchor.ai && i === 0) say(s, anchor, lineFor(fight(s), s.plan !== null, 'grasp'))
  }
  s.sounds.push('telegraph')
}

/**
 * Ground rationed one body to a piece, and exactly enough of it.
 *
 * The shallows with the crowding put back in. Three patches of shallow water
 * hold the whole raid at any size, deliberately, because nothing in this game
 * collides and a patch that could not hold everybody would be a lie the
 * picture told. These hold one each -- not by physics but by the rule that
 * resolves them, which keeps a stone for the nearest of the marked and gives
 * the rest of it to nobody.
 *
 * So the question stops being where the floor is and becomes which piece of
 * it is yours. A body that walks to the nearest stone without asking who else
 * was walking there has not answered the mechanic, it has taken somebody's
 * place, and the two of them end the count standing on one stone with another
 * one empty.
 *
 * There are as many stones as marks. That is the part that makes it
 * measurable rather than merely cruel: a raid that divides itself correctly
 * pays nothing at all, so everything this mechanic costs is something
 * practice can remove. One stone short and it kills somebody on every cast
 * however well it is answered, which is a fixed bill, and a fixed bill is the
 * shape that has already been thrown away twice here.
 */
function scheduleRefuge(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.refuge <= 0) return
  s.next.refuge -= DT
  if (s.next.refuge > 0) return
  s.next.refuge = timing.refuge

  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    s.next.refuge = FLOOR_AFTER_SOAK
    return
  }
  if (s.ground.some((g) => g.kind === 'refuge')) {
    s.next.refuge = 0.5
    return
  }

  // The tanks are out, for the journey's reason again.
  const free = livingParty(s).filter((a) => a.role !== 'tank')
  const marks = Math.min(free.length, Math.max(2, Math.round(free.length / 3)))
  if (marks < 2) return

  // The stones, spaced evenly on a ring the raid already operates near, from
  // a bearing that is rolled every cast. Fixed bearings would let a party
  // stand in the answer before the cast said anything, which is what the
  // brand measured at nothing for until its ground stopped landing where the
  // marked already were.
  const start = rng.range(0, Math.PI * 2)
  const spots: Vec2[] = []
  for (let i = 0; i < marks; i++) {
    const bearing = start + (i / marks) * Math.PI * 2
    const spot = {
      x: b.pos.x + Math.cos(bearing) * REFUGE_RING,
      y: b.pos.y + Math.sin(bearing) * REFUGE_RING,
    }
    clampToArena(spot, REFUGE_RADIUS)
    spots.push(spot)
  }

  const chosen: Actor[] = []
  const pool = [...free]
  for (let i = 0; i < marks && pool.length > 0; i++) {
    chosen.push(pool.splice(rng.int(pool.length), 1)[0]!)
  }

  // The division, made once and written down.
  //
  // Nearest free stone, closest pair first, which is the arrangement that
  // asks the shortest total walk -- and, more to the point, the one every
  // marked body computes the same answer to. Left to be worked out on the
  // way, "the nearest stone nobody better has claimed" is a different stone
  // the moment anybody starts walking, and two bodies trade places for the
  // whole count and neither of them arrives. The yoke paid for that lesson
  // once already.
  const pairs: Array<{ a: Actor; at: number; d: number }> = []
  for (const a of chosen) {
    for (let at = 0; at < spots.length; at++) pairs.push({ a, at, d: dist(a.pos, spots[at]!) })
  }
  pairs.sort((one, two) => one.d - two.d || one.a.id - two.a.id || one.at - two.at)
  const spoken = new Set<number>()
  const claimed = new Set<number>()
  for (const pair of pairs) {
    if (spoken.has(pair.a.id) || claimed.has(pair.at)) continue
    spoken.add(pair.a.id)
    claimed.add(pair.at)
    addAura(pair.a, 'refuge', b.id)
    const mark = getAura(pair.a, 'refuge')
    if (mark) mark.stacks = pair.at + 1
    pushEffect(s, 'cast', pair.a.pos, { abilityId: 'boss_refuge' })
  }

  s.ground.push({
    ...blankGround(s),
    kind: 'refuge',
    pos: { x: b.pos.x, y: b.pos.y },
    radius: REFUGE_RADIUS,
    telegraph: REFUGE_TELEGRAPH,
    lingering: 0,
    damage: REFUGE_DAMAGE,
    detonated: false,
    spots,
  })
  s.sounds.push('telegraph')
  say(s, b, lineFor(fight(s), s.plan !== null, 'refuge'))
}

/** Everyone close enough to be paying a share of this one's yoke right now. */
export function yokeSharers(s: SimState, carrier: Actor): number {
  return livingParty(s).filter((a) => dist(a.pos, carrier.pos) <= YOKE_REACH).length
}

// --- the three whose answer is an instant -----------------------------------
//
// Every mechanic above this line is a shape and a step. The pool says leave
// where you stand, the cone says get behind, the ring says come in, the
// shallows say be on one of these three, the schism says be with your own. All
// of them are answered by a position, and all of them can be answered early:
// the floor a raid walked to at the start of the count is still the floor it
// wants at the end of it.
//
// These three take the shape out and keep the count. What they read at the
// instant they land is not where a body is but what it was doing -- working,
// waiting, or turned the wrong way -- and none of those is a thing that can be
// arranged in advance and left. A raid that answers one of these has to answer
// it again for every cast, at the moment of the cast, and cannot bank it.
//
// They also bill something no other mechanic here bills. The price of a pool
// is the walk; the price of these is the part of a rotation that fits inside
// the count, paid by everybody at once. That is deliberate: a fight made
// entirely of floor teaches a raid to read floor, and there is nothing in it
// for the half of raiding that is knowing when to do nothing.

/**
 * What the vigil takes off whoever was still working when it sealed.
 *
 * A puddle's, less a tenth, and for the reason the crush's own number is a
 * puddle's: this is one mechanic's worth of damage at one instant, and the
 * puddle is the measured shape of that. It lands on everybody who failed
 * rather than on whoever happened to be standing somewhere, so it is set low
 * enough that a raid which misses one cast has lost a piece of a bar and not
 * the pull.
 */
const VIGIL_DAMAGE = 900

/**
 * What the note costs the body it named, and what it costs everybody else.
 *
 * The first version billed the whole raid a flat 210 each and nobody else at
 * all, which is the shape the rules doc now has a name for. It measured 19.1
 * points at a ten-man and 0.2 at a twenty-five: healing is a rate and a
 * raid-wide bill is a rate, so a total thin enough to be survivable at the
 * size it was tuned for is absorbed outright by a raid with more healers, and
 * one step heavier it wipes the raid it was tuned for. There is no number
 * between the two, and a rung sold at every size has to exist at every size.
 *
 * So the weight moved onto the body that earned it. Nothing about a bigger
 * raid makes one raider harder to kill, so an individual bill near the top of
 * a health bar reads the same at five and at twenty-five. The raid keeps a
 * share, because a note nobody cut has to be felt by the people who could not
 * cut it -- but it is a share, not the mechanic.
 *
 * Exactly one heavy bill per cast, which is also the cap rule 5 asks for:
 * whatever the headcount, one instant of this writes one near-lethal number.
 *
 * Which makes it a small-raid mechanic by construction, and that is worth
 * stating rather than discovering again. One death out of twenty-five barely
 * moves a win rate: measured by silencing it, this rung is worth 29 points to
 * a five-man heroic, 8 to a ten and 4 to a twenty-five. The other twenty-nine
 * rungs are worth between 17 and 96 wherever they are reached, so this is the
 * one that leans on a size.
 *
 * The number is 3600 rather than the 1350 it was fitted at because it was
 * fitted on a boss that multiplies mechanics by 1.7 and it lives on one that
 * multiplies them by 0.5. At 1350 the note landed for about half a bar, the
 * raid answered it or did not with no consequence either way, and silencing
 * the whole rung changed a fight by four points. Placement is tuning; this is
 * the bill for having moved it.
 */
const CHANT_DAMAGE = 3600

/** What everybody else pays for it. Felt, and not the thing that kills. */
const CHANT_SHARE = 110

/** The vigil's, for the same reason: one instant, and everybody who failed. */
const GAZE_DAMAGE = 900

/**
 * Whether a body was still working when the count ran out.
 *
 * Read off the global cooldown rather than off a flag of its own, because the
 * global already is the thing that says "this one pressed something recently"
 * -- every rotation in the game presses the moment it comes up, so a body
 * whose global still has most of its length left has not stopped. A cast in
 * progress counts on its own: the whole of a cast is working.
 *
 * And the weapon counts too, which is the half that had to be added rather
 * than the half that was obvious. A swing costs no global and asks for no
 * press: it is what happens while you are busy deciding, and about a ninth of
 * what a raid lands arrives that way. A demand to stop that a weapon can
 * ignore is a demand every melee in the game answers by doing nothing
 * different -- so a body that swung inside the same window has not stopped
 * either, and `mayStrike` holds the swing for anyone who has.
 *
 * The swing timer is read rather than a timestamp kept, because it already
 * says this: it is set to the weapon's speed when a swing lands and counts
 * down, so anything above `speed - VIGIL_HELD` is a swing inside the window.
 * A body with no weapon at all has nothing to hold and is judged on its
 * buttons alone.
 */
export function stillWorking(actor: Actor): boolean {
  if (actor.castId !== null) return true
  if (actor.gcd > GLOBAL_COOLDOWN - VIGIL_HELD) return true
  const auto = specOf({ classId: actor.classId, spec: actor.spec }).auto
  return auto !== undefined && auto !== null && actor.swingTimer > auto.speed - VIGIL_HELD
}

function scheduleVigil(s: SimState, b: Actor, timing: PhaseTiming): void {
  if (timing.vigil <= 0) return
  s.next.vigil -= DT
  if (s.next.vigil > 0) return

  s.next.vigil = timing.vigil
  s.sounds.push('telegraph')
  say(s, b, lineFor(fight(s), s.plan !== null, 'vigil'))

  s.ground.push({
    ...blankGround(s),
    kind: 'vigil',
    pos: { x: b.pos.x, y: b.pos.y },
    // The arena, because there is no outside to it. Every other radius on
    // this list is a test; this one is only the picture, and it is drawn at
    // the full width of the floor so nobody reads it as somewhere to leave.
    radius: ARENA_RADIUS,
    telegraph: VIGIL_TELEGRAPH,
    lingering: 0,
    damage: VIGIL_DAMAGE,
    detonated: false,
  })
  pushEffect(s, 'cast', b.pos, { abilityId: 'boss_vigil', power: ARENA_RADIUS })
}

/**
 * Whoever the note has named, if it has named anybody still alive.
 *
 * Read off the mark rather than worked out again, which is the thing the yoke
 * had to learn twice: a name that is recomputed is not a name. The mark is
 * written once when the note opens and never moved, so the body that has to
 * answer at the end of the count is the body that was told at the start of it.
 */
export function chantNamed(s: SimState): Actor | null {
  return livingParty(s).find((a) => getAura(a, 'chant') !== undefined) ?? null
}

/**
 * The note cut, by the one it named.
 *
 * Costs a global cooldown, because it is an action and not a decision. That
 * is the only part of the price a raid feels when the mechanic goes right --
 * one body loses a beat of its rotation -- and it is what stops a perfectly
 * answered chant from being free.
 */
export function breakChant(s: SimState, breaker: Actor): void {
  if (getAura(breaker, 'chant') === undefined) return
  const note = s.ground.find((g) => g.kind === 'chant' && !g.detonated)
  if (!note) return
  note.detonated = true
  clearAura(breaker, 'chant')
  breaker.gcd = Math.max(breaker.gcd, GLOBAL_COOLDOWN)
  if (breaker.castId) interruptCast(s, breaker, 'moved')
  s.sounds.push('telegraph')
  pushEffect(s, 'impact', note.pos, { abilityId: 'boss_chant', power: 340 })
}

function scheduleChant(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.chant <= 0) return
  s.next.chant -= DT
  if (s.next.chant > 0) return

  // One note at a time. Two open at once and the mark stops naming anybody in
  // particular, since there is only one place a name can be kept.
  if (s.ground.some((g) => g.kind === 'chant')) {
    s.next.chant = CHANT_CAST
    return
  }

  s.next.chant = timing.chant

  const free = livingParty(s)
  if (free.length === 0) return
  // Anybody at all, and deliberately not the nearest or the one holding it.
  // What the mechanic asks is whether the raid is quick, and a raid is exactly
  // as quick as whoever it happens to be tonight -- naming the body best
  // placed to answer would be naming the answer.
  const named = free[rng.int(free.length)]!
  addAura(named, 'chant', BOSS_ID)
  if (named.ai) say(s, named, lineFor(fight(s), s.plan !== null, 'chant'))
  s.sounds.push('telegraph')

  s.ground.push({
    ...blankGround(s),
    kind: 'chant',
    pos: { x: b.pos.x, y: b.pos.y },
    radius: 130,
    telegraph: CHANT_CAST,
    lingering: 0,
    damage: CHANT_DAMAGE,
    detonated: false,
  })
  pushEffect(s, 'cast', b.pos, { abilityId: 'boss_chant', power: 260 })
}

/** Whether a body is still turned toward the thing about to look at it. */
export function watched(actor: Actor, g: GroundEffect): boolean {
  const toward = Math.atan2(g.pos.y - actor.pos.y, g.pos.x - actor.pos.x)
  let delta = actor.facing - toward
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  return Math.abs(delta) < GAZE_ARC
}

/** Swings a body's bearing toward the one it wants, at the rate it turns. */
export function turnToward(actor: Actor, want: number): void {
  let delta = want - actor.facing
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  actor.facing += Math.max(-TURN_RATE * DT, Math.min(TURN_RATE * DT, delta))
}

function scheduleGaze(s: SimState, b: Actor, timing: PhaseTiming): void {
  if (timing.gaze <= 0) return
  s.next.gaze -= DT
  if (s.next.gaze > 0) return

  s.next.gaze = timing.gaze
  s.sounds.push('telegraph')
  say(s, b, lineFor(fight(s), s.plan !== null, 'gaze'))

  s.ground.push({
    ...blankGround(s),
    // Anchored where the boss stood when it opened rather than read off the
    // boss every tick, for the crush's reason: the shape a raid turns away
    // from has to be the shape that judges it. The boss moves for two percent
    // of a fight, so the two are nearly the same bearing -- and nearly is the
    // wrong word to have anywhere in a mechanic decided by an angle.
    kind: 'gaze',
    pos: { x: b.pos.x, y: b.pos.y },
    radius: 104,
    telegraph: GAZE_TELEGRAPH,
    lingering: 0,
    damage: GAZE_DAMAGE,
    detonated: false,
  })
  pushEffect(s, 'cast', b.pos, { abilityId: 'boss_gaze', power: 220 })
}

// --- what the raid is hitting, rather than where it is standing ------------
//
// Three mechanics that ask the same kind of question, and no other mechanic on
// this table asks it: not "where do I stand" but "what do I hit, and when do I
// stop". They exist because the one thing here that already claimed to ask it
// — the thralls — measured at nothing, and it is worth writing down why. A
// wave of thralls walks in and hits somebody, so every rule the party already
// has aims it at them: there is no instant at which a raid either did the
// thing or did not, and a mechanic with no such instant has nothing a
// reaction delay can be charged against. It is a damage check wearing a
// mechanic's clothes.
//
// So each of these three has an instant, and the instant is not a place:
//
//   the knell   finishes a count, and the raid pays unless it was broken
//   the vessel  breaks, and whoever broke it pays
//   the mirror  opens, and everything put into it while it was closed is
//               handed back at that moment
//
// And each of them is answered through the third reaction channel in `ai.ts`,
// which is the only reason any of them can be practised at all. Reaction
// delay and the fumble roll live there and nowhere else.

/**
 * How long the count runs before it finishes.
 *
 * Long enough that a raid which reads it can cross the gap between deciding
 * and landing — a global cooldown is a second and a half, so a count much
 * shorter than this is answered by whoever happened to be off cooldown rather
 * than by whoever noticed.
 */
const KNELL_FUSE = 6

/**
 * What it takes to break, per body that could be hitting it.
 *
 * Per body rather than flat, and linear rather than the thralls' gentle
 * curve, because what this measures is *seconds of the raid's damage* and a
 * raid's damage is very nearly linear in its headcount. A flat number would
 * make the same count a formality at twenty-five and impossible at five,
 * which is a mechanic that only exists at one raid size.
 */
const KNELL_HP_PER_BODY = 150

/** What the note costs everybody, when nobody silenced it. */
const KNELL_DAMAGE = 170

/** How far off the boss it surfaces. */
const KNELL_REACH = 74

/**
 * A summoned body, by id.
 *
 * The faction is half of the lookup and not decoration. `nextObjectId` is one
 * counter for every object in the fight -- actors, ground, chat lines,
 * floating numbers -- and it starts at one, while the raid's own ids are one
 * up to the headcount. So a body summoned in the first seconds of a pull can
 * carry the same id as a raider, and `find` walks the party first because the
 * party is at the front of `actors`. Everything summoned so far arrives forty
 * seconds in, by which time the counter is in the hundreds and the collision
 * cannot happen; that is luck, not a rule, and a check that starts a mechanic
 * at t=0 finds it immediately.
 */
function spawned(s: SimState, id: number | null): Actor | undefined {
  if (id === null) return undefined
  return s.actors.find((a) => a.faction === 'boss' && a.id === id)
}

/**
 * Spikes: how many go up, how much each holds, and how far off the victim.
 *
 * Per body rather than flat, like every other summon here, so a bigger raid is
 * not the raid where nobody is ever pinned. Small health on purpose: the
 * demand is that somebody stops and turns, not that the raid brings a second
 * damage phase — measured against the knell, an add that takes real seconds to
 * kill stops being a target call and becomes a second boss.
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

  // Never onto somebody already held. Two spikes on one body is one mechanic
  // charged twice and a second body left alone, which is the opposite of what
  // it is for.
  const free = livingParty(s).filter((a) => !getAura(a, 'spiked'))
  if (free.length === 0) return

  say(s, b, lineFor(fight(s), s.plan !== null, 'spike'))
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
 * A spike broken, or a spike that outlasted the raid's attention.
 *
 * Both ends are here because both have to leave the field in the same state:
 * the body walks again and the thing holding it is gone. Called from the aura
 * expiring and from the add dying, and it is written to be safe run twice.
 */
export function freeSpiked(s: SimState, victim: Actor): void {
  const held = getAura(victim, 'spiked')
  if (!held) return
  const spike = s.actors.find((a) => a.id === held.sourceId && a.spawn === 'spike')
  if (spike) spike.alive = false
  victim.auras = victim.auras.filter((au) => au.id !== 'spiked')
}

function knellHealth(s: SimState): number {
  return Math.round(KNELL_HP_PER_BODY * livingParty(s).length)
}

/**
 * Something that has to be broken before it finishes.
 *
 * The read is that it is not hurting anybody. Every other hostile in this
 * game walks at the nearest body and swings, which is a rule the party
 * answers without deciding anything; this one stands where it surfaced and
 * counts, so a rotation aimed at whatever is currently dealing damage has no
 * reason ever to look at it. Leaving the health bar you are on for one that
 * is not asking to be left for is the whole mechanic, and the count is what
 * gives the decision a deadline.
 */
function scheduleKnell(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.knell <= 0) return
  s.next.knell -= DT
  if (s.next.knell > 0) return
  s.next.knell = timing.knell

  // One at a time. Two counts running together is not two reads, it is one
  // read and a damage check — and a raid that cannot break both was never
  // being asked which to break.
  if (s.actors.some((a) => a.faction === 'boss' && a.spawn === 'knell' && a.alive)) return

  say(s, b, lineFor(fight(s), s.plan !== null, 'knell'))
  s.sounds.push('telegraph')

  const angle = rng.range(0, Math.PI * 2)
  const pos = {
    x: b.pos.x + Math.cos(angle) * KNELL_REACH,
    y: b.pos.y + Math.sin(angle) * KNELL_REACH,
  }
  clampToArena(pos, 20)

  const bell = makeAdd(s.nextObjectId++, pos.x, pos.y)
  bell.name = 'Knell'
  bell.spawn = 'knell'
  // It does not walk and it does not swing; `updateAdds` leaves it alone.
  bell.moveSpeed = 0
  bell.maxHp = knellHealth(s)
  bell.hp = bell.maxHp
  // The count is a cast bar on the thing itself, which is the most literal
  // telegraph in the game: it is drawn where the answer has to go, it is
  // cancelled by the thing that answers it, and `advanceCast` already owns
  // every rule about how a cast finishes.
  bell.castId = 'boss_knell'
  bell.castRemaining = KNELL_FUSE
  bell.castTotal = KNELL_FUSE
  bell.castTargetId = bell.id
  s.actors.push(bell)
  pushEffect(s, 'cast', pos, { abilityId: 'boss_knell' })
}

/** The note the raid pays for, at the instant the count runs out. */
function toll(s: SimState, ringer: number | null): void {
  const b = boss(s)
  const bell = spawned(s, ringer)
  if (bell) bell.alive = false

  for (const a of livingParty(s)) {
    const damage = mechanic(s, KNELL_DAMAGE)
    applyDamage(s, a, damage, 'magic', { sourceId: b.id, mechanic: 'knell' })
    pushEffect(s, 'impact', a.pos, { abilityId: 'boss_knell', power: damage })
  }
  s.raidFlash = 0.4
  s.sounds.push('raid')
}

/** How long it floats before it sinks on its own and costs nothing. */
const VESSEL_FUSE = 9

/**
 * What it takes to break open, per body that could be hitting it.
 *
 * Sits where the raid's damage sits after about a second, which is the whole
 * dial: what separates a raid that held off from one that did not is roughly
 * the difference between two reaction delays, and this number is what turns
 * that difference into a body either breaking it or not.
 */
const VESSEL_HP_PER_BODY = 120

/** What comes out of it, and only onto whoever opened it. */
const VESSEL_BREAK = 1500

/**
 * Something that must not be killed.
 *
 * The knell read backwards, and the reason both are here. This one does walk
 * in and swing, so every rule the party has says kill it — and killing it is
 * the failure. Left alone it sinks on its own clock and costs the raid
 * nothing but the swings it landed on the way.
 *
 * What it asks for is restraint, and restraint is the one thing a damage
 * rotation has no vocabulary for at all. The bill goes to the bodies that
 * actually struck it rather than to the raid, which is deliberate: billed
 * raid-wide it would be a coin flip on the greediest dealer in the party, and
 * nothing a practised body did for itself would show.
 */
function scheduleVessel(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.vessel <= 0) return
  s.next.vessel -= DT
  if (s.next.vessel > 0) return
  s.next.vessel = timing.vessel

  // One at a time, for the knell's reason and one of its own: the mark that
  // remembers who struck it is carried by the striker and names the thing it
  // was struck on, so two alive at once is one memory for two bills.
  if (s.actors.some((a) => a.faction === 'boss' && a.spawn === 'vessel' && a.alive)) return

  say(s, b, lineFor(fight(s), s.plan !== null, 'vessel'))
  s.sounds.push('telegraph')

  // Where the thralls come from, and walking in the way they do. It has to be
  // the thing the party's own rules would pick, or there is nothing to hold
  // off from.
  const angle = rng.range(0, Math.PI * 2)
  const pos = { x: Math.cos(angle) * 230, y: Math.sin(angle) * 230 }
  clampToArena(pos, 16)

  const jar = makeAdd(s.nextObjectId++, pos.x, pos.y)
  jar.name = 'Vessel'
  jar.spawn = 'vessel'
  jar.maxHp = Math.round(VESSEL_HP_PER_BODY * livingParty(s).length)
  jar.hp = jar.maxHp
  jar.castId = 'boss_vessel'
  jar.castRemaining = VESSEL_FUSE
  jar.castTotal = VESSEL_FUSE
  jar.castTargetId = jar.id
  s.actors.push(jar)
  pushEffect(s, 'cast', pos, { abilityId: 'boss_vessel' })
}

/** It reached the end of its own clock. Nothing happens, which is the point. */
function sink(s: SimState, floated: number | null): void {
  const jar = spawned(s, floated)
  if (!jar) return
  // Cleared off everyone who struck it, so a body that held off on the next
  // one is not still carrying a bill for this one.
  for (const a of livingParty(s)) {
    const mark = getAura(a, 'spoil')
    if (mark && mark.sourceId === jar.id) clearAura(a, 'spoil')
  }
  jar.alive = false
  pushEffect(s, 'impact', jar.pos, { abilityId: 'boss_vessel', power: 0 })
}

/**
 * Everything that was broken open, and the bill for it.
 *
 * Read off the corpses rather than hooked into the damage funnel, because
 * what has to happen is one bill at one instant and the funnel is called from
 * half a dozen places a tick. Every dead summon passes through here exactly
 * once — the corpse filter at the bottom of `updateAdds` drops it in the same
 * call — so the bill cannot be paid twice.
 */
function shatterVessels(s: SimState): void {
  for (const broken of s.actors) {
    if (broken.faction !== 'boss' || broken.spawn !== 'vessel' || broken.alive) continue
    for (const a of livingParty(s)) {
      const mark = getAura(a, 'spoil')
      if (!mark || mark.sourceId !== broken.id) continue
      clearAura(a, 'spoil')
      const damage = mechanic(s, VESSEL_BREAK)
      applyDamage(s, a, damage, 'magic', { sourceId: BOSS_ID, mechanic: 'vessel' })
      pushEffect(s, 'impact', a.pos, { abilityId: 'boss_vessel', power: damage })
    }
    s.sounds.push('raid')
  }
}


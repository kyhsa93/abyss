import {
  ARENA_RADIUS,
  BURDEN_HANDS,
  BURDEN_REACH,
  CRUSH_TELEGRAPH,
  DT,
  FAULT_TELEGRAPH,
  MELEE_RANGE,
  PUDDLE_TELEGRAPH,
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
  HEALTH,
  YOKE_REACH,
} from './constants'
import {
  AURA_DURATION,
  addAura,
  adds,
  clearAura,
  getAura,
  pushEffect,
  applyDamage,
  boss,
  dist,
  livingParty,
  burdenFuse,
  burdenTaker,
  say,
  stackAura,
  topThreatTarget,
  fightScale,
  mechanicScale,
} from './combat'
import type { Rng } from './rng'
import { BOSS_ID, clampToArena } from './state'
import { DIFFICULTIES } from './classes'
import {
  encounterAt,
  encounterKit,
  gated,
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
function scaled(base: PhaseTiming, s: SimState): PhaseTiming {
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


const SLAM_CAST = 2

const PUDDLE_RADIUS = 92
const PUDDLE_DAMAGE = 1000

export const BREATH_CAST = 1.9
const BREATH_RANGE = 390
const BREATH_HALF_WIDTH = 0.62
const BREATH_DAMAGE = 700

// The ring expands faster than anyone can run, so escaping outward is not an
// option and the answer has to be to already be inside it. That only works if
// there is time to get there first, hence the telegraph and the generous
// starting radius: the safe pocket is everything within START - BAND.
const SHOCKWAVE_TELEGRAPH = 2.4
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
 * How far a sweep reaches past the boss's own edge.
 *
 * Wide enough to catch the ranged as well, which is the whole point of it:
 * a melee-only physical hit is a tax on the people whose armour was supposed
 * to be the reward. Everybody takes it and armour decides what it costs, so
 * plate is finally worth the walk rather than a line in a table.
 */
/**
 * How far a sweep reaches past the boss's own edge.
 *
 * Tied to melee range, because that is what it is for. It was a flat 300,
 * which with the boss's own radius is 350 — and a raid stands between ninety
 * and a hundred and twenty-five from the boss, so measured, *every* body was
 * inside it, every cast, a hundred percent of the time. The mechanic below
 * says a tank barely notices and a caster that wandered into melee should not
 * survive the habit; what it actually did was hit the whole raid and call it
 * a melee check.
 *
 * At melee range and a bit, a practised ranged takes six hits a pull against
 * a melee's thirty. That is the distinction it was written to make.
 *
 * It does not teach, and it is not supposed to: the answer is where your role
 * stands, and a role check is not a skill check. `soak` and `sunder` are the
 * same kind. What the harness's teaching table is for is telling those apart
 * from the ones that are meant to be learnt and are not being.
 */
const SWEEP_RANGE = MELEE_RANGE * 1.9
/**
 * As a share of the boss's weapon swing, which armour already answers.
 *
 * 0.34 while the sweep reached everybody. Once it stopped — see
 * `SWEEP_RANGE` — the ranged half of the raid simply stopped paying it, and
 * the damage specs came apart: a shadow priest at 160 against a rogue at 113,
 * which the parity check caught. Melee were not made worse; ranged were made
 * better, and a mechanic only melee pay has to cost less per hit than one
 * everybody paid.
 */
const SWEEP_SHARE = 0.24

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

  autoAttack(s, b, target, timing)
  scheduleSlam(s, b, target, timing)
  schedulePuddles(s, rng, timing)
  scheduleRaidHit(s, timing)
  scheduleSpread(s, b, rng, timing)
  scheduleBreath(s, b, timing)
  scheduleShockwave(s, b, rng, timing)
  scheduleAdds(s, b, rng, timing)
  scheduleSweep(s, b, timing)
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
  pushEffect(s, 'impact', b.pos, { abilityId: 'boss_phase', power: 900, crit: true })
  s.raidFlash = 0.5
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
    s.nextPuddle = Math.min(s.nextPuddle, 3)
    s.nextSlam = Math.min(s.nextSlam, 5)
    // Only for what this boss actually does *tonight*. Handing a shockwave
    // timer to a fight with no shockwave is harmless today, since the
    // scheduler checks the cadence, and is exactly the kind of thing that
    // stops being harmless. Read through `scaled` rather than off the table,
    // so a mechanic the ladder did not buy is as absent here as it is there.
    const next = scaled(encounter.phases[2]!, s)
    if (next.shockwave > 0) s.nextShockwave = 8
    if (next.adds > 0) s.nextAdds = 16
    return
  }

  if (s.phase === 2 && ratio <= encounter.phaseThreeHp) {
    s.phase = 3
    s.sounds.push('phase')
    phaseBreak(s, b)
    s.chat.push({ id: s.nextObjectId++, speaker: b.name, text: encounter.lines.phaseThree, age: 0 })
    const next = scaled(encounter.phases[3]!, s)
    if (next.breath > 0) s.nextBreath = Math.min(s.nextBreath, 4)
    if (next.shockwave > 0) s.nextShockwave = Math.min(s.nextShockwave, 7)
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
}

function autoAttack(s: SimState, b: Actor, target: Actor | null, timing: PhaseTiming): void {
  b.swingTimer -= DT
  if (b.swingTimer > 0 || !target || b.castId) return

  if (dist(b.pos, target.pos) <= MELEE_RANGE + target.radius) {
    const damage = hit(s, fight(s).swingDamage)
    applyDamage(s, target, damage, 'physical', { sourceId: b.id })
    // The party's weapons have always drawn their swing and their landing.
    // The boss's did neither, which is most of why a fight it was winning
    // looked like nothing was happening.
    const facing = Math.atan2(target.pos.y - b.pos.y, target.pos.x - b.pos.x)
    pushEffect(s, 'swing', b.pos, { angle: facing })
    pushEffect(s, 'impact', target.pos, { power: damage, angle: facing })
    b.swingTimer = timing.swing
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
  s.nextBreath -= DT
  if (s.nextBreath > 0 || b.castId) return

  s.sounds.push('telegraph')
  b.castId = 'boss_breath'
  pushEffect(s, 'cast', b.pos, { abilityId: 'boss_breath' })
  b.castRemaining = BREATH_CAST
  b.castTotal = BREATH_CAST
  b.castTargetId = null
  s.nextBreath = timing.breath

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

function scheduleShockwave(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.shockwave <= 0) return
  s.nextShockwave -= DT
  if (s.nextShockwave > 0) return

  s.nextShockwave = timing.shockwave
  s.sounds.push('shockwave')
  say(s, b, fight(s).lines.shockwave)
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
  s.nextPuddle -= DT
  if (s.nextPuddle > 0) return

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
    s.nextPuddle = FLOOR_AFTER_SOAK
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
  s.nextPuddle = timing.puddle
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
  s.nextSpread -= DT
  if (s.nextSpread > 0) return

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
    s.nextSpread = AFTER_SOAK
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
  s.nextSpread = timing.spread
}

function scheduleAdds(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.adds <= 0) return
  s.nextAdds -= DT
  if (s.nextAdds > 0) return

  s.nextAdds = timing.adds
  say(s, b, fight(s).lines.adds)

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
function scheduleSweep(s: SimState, b: Actor, timing: PhaseTiming): void {
  if (timing.sweep <= 0) return
  s.nextSweep -= DT
  if (s.nextSweep > 0) return

  s.nextSweep = timing.sweep
  s.sounds.push('raid')
  say(s, b, fight(s).lines.sweep)

  const reach = SWEEP_RANGE + b.radius
  for (const a of livingParty(s)) {
    if (dist(a.pos, b.pos) > reach) continue
    // Physical, so armour and block both answer it. A tank barely notices; a
    // caster that wandered into melee should not survive making a habit of it.
    const damage = hit(s, fight(s).swingDamage * SWEEP_SHARE)
    applyDamage(s, a, damage, 'physical', { sourceId: b.id, mechanic: true })
    pushEffect(s, 'impact', a.pos, {
      abilityId: 'boss_sweep',
      power: damage,
      angle: Math.atan2(a.pos.y - b.pos.y, a.pos.x - b.pos.x),
    })
  }
  pushEffect(s, 'swing', b.pos, { power: SWEEP_RANGE, angle: 0 })
}

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
const CRUSH_DAMAGE = 1000

function scheduleCrush(s: SimState, b: Actor, timing: PhaseTiming): void {
  if (timing.crush <= 0) return
  s.nextCrush -= DT
  if (s.nextCrush > 0) return

  // Not onto a party that has been told to stand in one place. The gathering
  // is placed near the raid and the raid stands near the boss, so a circle
  // and a caving floor at once is the same contradiction the puddles are held
  // for — one says all of you here and the other says not there.
  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    s.nextCrush = FLOOR_AFTER_SOAK
    return
  }

  s.nextCrush = timing.crush
  s.sounds.push('telegraph')
  say(s, b, fight(s).lines.crush)

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
  pushEffect(s, 'cast', b.pos, { abilityId: 'boss_crush', power: SWEEP_RANGE + b.radius })
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
  s.nextSchism -= DT
  if (s.nextSchism > 0) return

  // Never against a gathering, which is the exact opposite instruction, and
  // never against itself.
  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    s.nextSchism = FLOOR_AFTER_SOAK
    return
  }
  if (s.ground.some((g) => g.kind === 'schism')) {
    s.nextSchism = 0.5
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
  s.nextSchism = timing.schism

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
  say(s, b, fight(s).lines.schism)
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
export const HAND_BEAT = 1.1
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
  s.nextHand -= DT
  if (s.nextHand > 0) return

  // Never two at once. Two wedges turning together is not a harder question,
  // it is an unreadable one: the answer to this is a bearing, and there is
  // no bearing that answers both.
  if (s.ground.some((g) => g.kind === 'hand')) {
    s.nextHand = HAND_BEAT
    return
  }

  // Held while a gathering is live, for the reason the crush and the brand
  // are held: one mechanic says all of you here and this one says nobody
  // stands anywhere for long.
  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    s.nextHand = FLOOR_AFTER_SOAK
    return
  }

  s.nextHand = timing.hand
  s.sounds.push('telegraph')
  say(s, b, fight(s).lines.hand)

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
  s.nextFault -= DT
  if (s.nextFault > 0) return

  // Held while a gathering is live, for the reason every other piece of
  // hazardous floor is: one mechanic says all of you here and the other says
  // half of that is about to stop being floor.
  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    s.nextFault = FLOOR_AFTER_SOAK
    return
  }

  s.nextFault = timing.fault
  s.sounds.push('telegraph')
  say(s, b, fight(s).lines.fault)

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
  s.nextShallows -= DT
  if (s.nextShallows > 0) return

  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    s.nextShallows = FLOOR_AFTER_SOAK
    return
  }

  s.nextShallows = timing.shallows
  s.sounds.push('telegraph')
  say(s, b, fight(s).lines.shallows)

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
  s.nextSoak -= DT
  if (s.nextSoak > 0) return

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

  s.nextSoak = every

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
  say(s, b, fight(s).lines.soak)
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
  s.nextSunder -= DT
  if (s.nextSunder > 0) return

  s.nextSunder = timing.sunder
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
  say(s, b, fight(s).lines.sunder)
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
  s.nextRot -= DT
  if (s.nextRot > 0) return

  s.nextRot = timing.rot
  const victims = livingParty(s).filter((a) => !getAura(a, 'rot'))
  if (victims.length === 0) return

  const victim = rng.pick(victims)
  addAura(victim, 'rot', BOSS_ID)
  pushEffect(s, 'impact', victim.pos, { abilityId: 'boss_rot', power: 220 })
  s.sounds.push('telegraph')
  if (victim.ai) say(s, victim, fight(s).lines.rot)
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
  s.nextBrand -= DT
  if (s.nextBrand > 0) return

  // Held while a gathering is live, for the reason the puddle is: one
  // mechanic says leave where you stand and the other says all of you here.
  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    s.nextBrand = FLOOR_AFTER_SOAK
    return
  }

  s.nextBrand = timing.brand
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
    if (marked.ai) say(s, marked, fight(s).lines.brand)
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
export const ECHO_TELEGRAPH = 0.9
const ECHO_BEAT = 1.05
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
  s.nextEcho -= DT
  if (s.nextEcho > 0) return

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
    s.nextEcho =
      longest > ECHO_BEAT ? ECHO_BEAT : Math.max(ECHO_BEAT, timing.echo - AURA_DURATION.echo)
    return
  }

  // Held while a gathering is live: one says all of you here, this says none
  // of you stay anywhere.
  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    s.nextEcho = FLOOR_AFTER_SOAK
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
    if (marked.ai) say(s, marked, fight(s).lines.echo)
  }
  s.sounds.push('telegraph')
  s.nextEcho = ECHO_BEAT
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
  s.nextVerdict -= DT
  if (s.nextVerdict > 0) return

  s.nextVerdict = timing.verdict

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
    if (marked.ai) say(s, marked, fight(s).lines.verdict)
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
    mechanic: true,
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
  s.nextSpire -= DT
  if (s.nextSpire > 0) return

  // Held while a gathering is live, for the reason every other piece of floor
  // is: one mechanic saying all of you here and another saying not there is
  // two mechanics cancelling rather than one hard one.
  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    s.nextSpire = FLOOR_AFTER_SOAK
    return
  }

  s.nextSpire = timing.spire

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
  say(s, b, fight(s).lines.spire)
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
  s.nextHunt -= DT
  if (s.nextHunt > 0) return
  s.nextHunt = every

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

  // Spawned on the far side of the arena from whoever it wants, so the first
  // thing that happens is a walk rather than a hit.
  const away = Math.atan2(victim.pos.y, victim.pos.x) + Math.PI
  const pos = { x: Math.cos(away) * ARENA_RADIUS * 0.8, y: Math.sin(away) * ARENA_RADIUS * 0.8 }
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
  say(s, b, fight(s).lines.hunt)
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
    hunting: null,
  }
}

/** Adds simply chase the nearest living party member. */
function updateAdds(s: SimState): void {
  for (const add of adds(s)) {
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

    if (best > MELEE_RANGE) {
      add.pos.x += ((nearest.pos.x - add.pos.x) / best) * add.moveSpeed * DT
      add.pos.y += ((nearest.pos.y - add.pos.y) / best) * add.moveSpeed * DT
      clampToArena(add.pos, add.radius)
    }

    const stalking = add.hunting !== null
    add.swingTimer -= DT
    if (add.swingTimer <= 0 && best <= MELEE_RANGE + nearest.radius) {
      const damage = hit(s, stalking ? STALKER_DAMAGE : ADD_DAMAGE)
      applyDamage(s, nearest, damage, 'physical', {
        sourceId: add.id,
        // Being caught by the thing following you is a mistake with a name.
        mechanic: stalking,
      })
      pushEffect(s, 'impact', nearest.pos, {
        abilityId: stalking ? 'boss_stalk' : 'boss_thrall',
        power: damage,
        angle: Math.atan2(nearest.pos.y - add.pos.y, nearest.pos.x - add.pos.x),
      })
      add.swingTimer = stalking ? STALKER_SWING : ADD_SWING
    }
  }

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

  if (castId === 'boss_breath') {
    const cone = s.ground.find((g) => g.kind === 'breath' && !g.detonated)
    if (!cone) return
    cone.detonated = true
    cone.lingering = 0.3
    for (const a of livingParty(s)) {
      if (!insideCone(a.pos, cone)) continue
      const damage = mechanic(s, cone.damage)
      applyDamage(s, a, damage, 'magic', { sourceId: b.id, mechanic: true })
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
          applyDamage(s, a, damage, 'magic', { sourceId: BOSS_ID, mechanic: true })
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
        applyDamage(s, a, share, 'magic', {
          sourceId: BOSS_ID,
          // Only the ones who were not there failed anything.
          mechanic: !inside.includes(a),
        })
        pushEffect(s, 'impact', a.pos, { abilityId: 'boss_soak', power: share })
      }
      pushEffect(s, 'impact', g.pos, {
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
        applyDamage(s, a, damage, 'magic', { sourceId: BOSS_ID, mechanic: true })
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
        abilityId: 'boss_echo',
        power: g.radius * 12,
        crit: true,
      })
      for (const a of livingParty(s)) {
        if (dist(a.pos, g.pos) > g.radius - a.radius * 0.6) continue
        const damage = mechanic(s, g.damage)
        applyDamage(s, a, damage, 'magic', { sourceId: BOSS_ID, mechanic: true })
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
        applyDamage(s, a, damage, 'magic', { sourceId: BOSS_ID, mechanic: true })
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
        applyDamage(s, a, damage, 'magic', { sourceId: BOSS_ID, mechanic: true })
        pushEffect(s, 'impact', a.pos, { abilityId: 'boss_schism', power: damage })
      }
      // Cleared here rather than left to run out, so the marks are gone the
      // moment they stop meaning anything and nobody keeps walking away from
      // a group that is no longer a group.
      for (const a of party) clearAura(a, 'schism')
      pushEffect(s, 'impact', g.pos, {
        abilityId: 'boss_schism',
        power: g.radius * 5,
        crit: true,
      })
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
            abilityId: 'boss_spire',
            power: g.radius * 12,
            crit: true,
          })
          for (const a of livingParty(s)) {
            if (dist(a.pos, g.pos) > g.radius - a.radius * 0.6) continue
            const damage = mechanic(s, g.damage)
            applyDamage(s, a, damage, 'magic', { sourceId: BOSS_ID, mechanic: true })
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
        applyDamage(s, a, damage, 'magic', { sourceId: BOSS_ID, mechanic: true })
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
        const mark = g.kind === 'brand' ? 'boss_brand' : 'boss_puddle'
        // The floor going off, at the size it went off at. Everything that
        // followed used to be the only sign it had.
        pushEffect(s, 'impact', g.pos, {
          abilityId: mark,
          power: g.radius * 12,
          crit: true,
        })
        for (const a of livingParty(s)) {
          if (dist(a.pos, g.pos) <= g.radius - a.radius * 0.6) {
            const damage = mechanic(s, g.damage)
            applyDamage(s, a, damage, 'magic', { sourceId: BOSS_ID, mechanic: true })
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
    // Unlike every other one-instant hazard above, it leaves something, so it
    // is kept until the stone is gone rather than dropped on the frame it
    // lands. Spelt out beside the others instead of falling through to the
    // pools' rule at the bottom, which is the same rule by coincidence.
    if (g.kind === 'spire') return !g.detonated || g.lingering > 0
    if (g.kind === 'fault' || g.kind === 'shallows') return !g.detonated
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
  s.nextBurden -= DT
  if (s.nextBurden > 0) return
  s.nextBurden = timing.burden

  // Held while the party is being told to stand in one circle, the same way
  // the floor mechanics are. A gathering puts every body inside a hundred and
  // thirty five units of every other, which hands the whole chain over for
  // free — and a mechanic that solves itself during another mechanic is a
  // mechanic that reads as luck.
  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    s.nextBurden = FLOOR_AFTER_SOAK
    return
  }

  const free = livingParty(s).filter((a) => !getAura(a, 'burden'))
  if (free.length === 0) return

  const weights = Math.max(1, Math.round(livingParty(s).length / 5))
  for (let i = 0; i < weights && free.length > 0; i++) {
    const first = free.splice(rng.int(free.length), 1)[0]!
    addAura(first, 'burden', b.id)
    const weight = getAura(first, 'burden')
    if (weight) {
      weight.stacks = 1
      weight.held = [first.id]
    }
    pushEffect(s, 'cast', first.pos, { abilityId: 'boss_burden' })
    if (first.ai && i === 0) say(s, first, fight(s).lines.burden)
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
  s.nextYoke -= DT
  if (s.nextYoke > 0) return
  s.nextYoke = timing.yoke

  // Never on top of a gathering, for the reason the spread is not: one of them
  // says all of you in this circle and the other says all of you around this
  // person, and a party told both at once is a party told nothing.
  if (s.ground.some((g) => g.kind === 'soak' && !g.detonated)) {
    s.nextYoke = FLOOR_AFTER_SOAK
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

    // The furthest body that can go, which is what makes the answer a journey.
    // Anything nearer is already standing there: a raid at rest is a blob
    // about ninety units across, so a yoke answered by whoever is close enough
    // is a yoke answered before it was thrown.
    let bearer: Actor | null = null
    let furthest = -1
    for (const a of livingParty(s)) {
      if (a.id === owed.id || a.role === 'tank') continue
      if (getAura(a, 'yoke') || named.has(a.id)) continue
      const d = dist(owed.pos, a.pos)
      if (d > furthest) {
        furthest = d
        bearer = a
      }
    }
    if (mark && bearer) {
      mark.bearer = bearer.id
      named.add(bearer.id)
      if (bearer.ai) say(s, bearer, fight(s).lines.yoke)
    }

    pushEffect(s, 'cast', owed.pos, { abilityId: 'boss_yoke' })
  }
  s.sounds.push('telegraph')
}

/** Everyone close enough to be paying a share of this one's yoke right now. */
export function yokeSharers(s: SimState, carrier: Actor): number {
  return livingParty(s).filter((a) => dist(a.pos, carrier.pos) <= YOKE_REACH).length
}

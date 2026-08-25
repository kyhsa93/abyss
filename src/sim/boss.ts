import {
  ARENA_RADIUS,
  CRUSH_TELEGRAPH,
  DT,
  MELEE_RANGE,
  PUDDLE_TELEGRAPH,
  SOAK_RADIUS,
  SOAK_EACH,
  SOAK_MAX_SHARE,
  SOAK_TELEGRAPH,
  STALKER_DAMAGE,
  STALKER_HP,
  STALKER_SPEED,
  STALKER_SWING,
  HEALTH,
} from './constants'
import {
  addAura,
  adds,
  getAura,
  pushEffect,
  applyDamage,
  boss,
  dist,
  livingParty,
  say,
  stackAura,
  topThreatTarget,
  fightScale,
  mechanicScale,
} from './combat'
import type { Rng } from './rng'
import { BOSS_ID, clampToArena } from './state'
import { DIFFICULTIES } from './classes'
import { encounterAt, encounterKit, gated, type Encounter, type PhaseTiming } from './encounters'
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
  const kit = s.only
    ? encounterKit(fight(s), s.party.length, s.difficulty).filter((m) => m === s.only)
    : encounterKit(fight(s), s.party.length, s.difficulty)
  const timing = s.plan ? planned(base, s.plan, s.phase) : gated(base, kit)
  const cadence = DIFFICULTIES[s.difficulty].cadence
  if (cadence === 1) return timing
  return {
    ...timing,
    puddle: timing.puddle * cadence,
    spread: timing.spread * cadence,
    slam: timing.slam * cadence,
    raid: timing.raid * cadence,
    breath: timing.breath * cadence,
    shockwave: timing.shockwave * cadence,
    adds: timing.adds * cadence,
  }
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
  scheduleBrand(s, rng, timing)
  scheduleVerdict(s, rng, timing)
  scheduleSunder(s, b, target, timing)
  scheduleRot(s, rng, timing)
  scheduleSoak(s, b, rng, timing)
  scheduleHunt(s, b, rng, timing)

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
      (g) => (g.kind === 'puddle' || g.kind === 'brand' || g.kind === 'crush') && !g.detonated,
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
    return !g.detonated || g.lingering > 0
  })
}

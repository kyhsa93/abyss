import type { DifficultyId, RaidSize } from './classes'
import type { RoomShape } from './room'
import type { Obstacle, Vec2 } from './types'

/**
 * The bosses, in the order they are fought.
 *
 * A boss here is a table rather than a class: the timeline code in `boss.ts`
 * is the same for all of them and only the numbers differ. That is deliberate.
 * A second boss written as a second script would double the code that decides
 * what a mechanic does, and the two copies would drift — the shockwave that
 * has to be entered rather than fled is a rule that took three attempts to get
 * right, and it is not being written twice.
 *
 * What separates them is *which* mechanics they lean on, since each one asks
 * for something different: puddles say leave where you stand, the breath says
 * get behind, the shockwave says come in, spread says separate, adds say
 * change target, and the raid hit says nothing at all except that the healer
 * kept up. A boss is a sentence made of those.
 */

/**
 * The whole vocabulary, named once.
 *
 * `boss.ts` schedules them and every ladder is written out of them; this is
 * the list all of it agrees on. Everything a boss can ask for is here, and
 * nothing else is.
 */
export type MechanicId =
  | 'coldflame'
  | 'spike'
  | 'blight'
  | 'inhale'
  | 'pungent'
  | 'spore'
  | 'vilegas'
  | 'bloat'
  | 'bonestorm'
  | 'decay'
  | 'frostbolt'
  | 'volley'
  | 'shade'
  | 'insignificance'
  | 'empower'
  | 'dominate'
  | 'adds'
  | 'siphon'
  | 'spill'
  | 'fester'
  | 'champion'
  | 'gorge'
  | 'spray'
  | 'infection'
  | 'ooze'
  | 'flood'
  | 'merge'
  | 'engulf'
  | 'caustic'
  | 'hound'
  | 'gather'
  | 'decant'
  | 'reagent'
  | 'chase'
  | 'slime'
  | 'rotation'
  | 'thirst'
  | 'ballast'
  | 'nuclei'
  | 'prison'
  | 'gift'
  | 'bond'
  | 'stain'
  | 'flight'
  | 'crimson'
  | 'turning'
  | 'bleed'
  | 'kin'
  | 'portal'
  | 'suppress'
  | 'chill'
  | 'instability'
  | 'haul'
  | 'cover'
  | 'buffet'

/** What each is called anywhere it has to be read rather than dodged. */
/**
 * Whether a mechanic grows with the roster or catches a fixed share of it.
 *
 * The distinction was in `boss.ts` all along, one implementation at a time,
 * and never written down — which is why the consequence took a round of
 * tuning to find. Something dropped *on people* asks more of a bigger raid
 * because there is more of it: puddles per cast, spread marks, add waves, a
 * gathering split among whoever stands in it. Something aimed at the *arena*
 * does not: a cone of a fixed angle catches roughly the same fraction of five
 * bodies as of twenty-five, and so does a ring of a fixed radius, and so does
 * whatever happens to be within reach of the boss.
 *
 * Read across a boss's ladder it predicts how that boss behaves at size, and
 * it is the reason `sizeMechanic` exists:
 *
 *   Choir        5/5 scale — a bigger raid gets more of everything
 *   Warden       4/5       — balances itself, and carries no weights
 *   Tidebreaker  2/5, and 0/2 at its opening — a bigger raid gets it free
 */
export const MECHANIC_SCALES: Record<MechanicId, boolean> = {
  // The one entry here that is false for a reason the column was not built
  // for. What a spire spends is floor, and the arena is 460 across whoever
  // turns up — counted per body a twenty-five man met twelve eruptions at
  // once, into a footprint no wider than a ten-man's, and wiped on every
  // first pull while the ten-man never noticed. Area denial super-scales.
  adds: true, // a wave of `living / 6`
  coldflame: false, // a line of a fixed length, wherever it happens to point
  spike: true, // one spike per so many bodies, so nobody is safe by headcount
  blight: false, // the whole room, so the room is the same room at any size
  inhale: false, // the boss, and there is one of it
  pungent: false, // everybody at once, which is everybody at any size
  spore: true, // one spore per so many bodies, so a bigger raid gathers more often
  vilegas: true, // one mark per so many bodies, and it spreads to whoever is near
  bloat: false, // whoever is holding it, and one body holds it
  bonestorm: false, // the boss itself, and there is one of it
  decay: false, // a patch of a fixed size, wherever it lands
  frostbolt: false, // one cast at whoever is holding it
  volley: false, // everybody at once, which is everybody at any size
  shade: true, // one shade per so many bodies, so nobody is safe by headcount
  insignificance: false, // whoever is holding it, and one body holds it
  empower: false, // one body of the wave, and a wave is a wave
  dominate: true, // one mind per so many bodies, so a bigger raid loses more
  // A gauge is not dealt to anybody: it is a number on the boss, filled by
  // events that are each one event whatever the headcount. A bigger raid puts
  // more bodies inside a spill and brings more hands to stop what is filling
  // it, and which of those wins is a thing to measure rather than assume.
  siphon: false,
  spill: true, // one spill per so many bodies, and it catches whoever stayed
  fester: true, // one wound per so many bodies, so a bigger raid carries more
  // One mark per so many bodies would be the usual reading and it is the
  // wrong one here: a mark never falls off, so scaling the count would leave a
  // twenty-five man holding three of them for the rest of the pull. What
  // scales is the weight of one -- rule 5's "one bill an instant, and the
  // roster is allowed to make the bill bigger".
  champion: true,
  gorge: false, // one body swallowed and one circle of fixed radius under it
  spray: false, // a cone of a fixed angle, which catches a share rather than a count
  infection: true, // one carrier per so many bodies, and each becomes a body
  ooze: true, // as many as there were carriers, which is the same thing said twice
  flood: false, // a circle from the boss, and the room is the room at any size
  // Not the count -- the count is capped at eight whatever the headcount, for
  // the reason `OOZE_CAP` gives. What scales is how often the raid is handed
  // one, which is rule 5's "a harder geometry, not an unanswerable one".
  merge: true,
  engulf: false, // one body is holding it, and there is one of that body
  caustic: true, // one pool per so many bodies, so a bigger raid is given more floor to lose
  hound: false, // one body is followed, and the fight follows one at a time
  // The bill is divided by whoever came, so the arithmetic already carries the
  // roster -- and rule 4 says the demand itself gets *easier* with bodies,
  // because standing together is what a crowd does anyway. What is supposed to
  // hold that up is the five-second count on a circle that is moving; whether
  // it does is a thing to measure rather than assume.
  gather: false,
  decant: false, // always two, whatever the headcount
  reagent: false, // one body is holding it
  // Not dealt to anybody: it is a rule about where the circle above lands. It
  // changes the same instant from "walk to a place" into "walk to a person who
  // is still walking", and one moving point is one moving point at any size.
  chase: false,
  // The room, and a room is the same room at any headcount. It is also the one
  // entry here that is not the boss's doing at all.
  slime: false,
  rotation: false, // three bodies are three bodies at any headcount
  thirst: false, // two mouths, and each drinks from one body at a time
  ballast: false, // always two, whatever the roster -- rule 5
  nuclei: false, // one errand at a time, and one body goes on it
  prison: false, // everybody at once, which is everybody at any size
  gift: true, // a bigger raid has more bodies to cover and less time to do it
  bond: true, // one pair per so many bodies
  stain: false, // one per doubling, and the doublings already carry the roster
  flight: false, // one boss, one landing, one circle
  crimson: false, // everybody at once
  turning: false, // one body, and the raid chose which by dropping it
  // A wound on the thing in the middle. It is one wound whatever the
  // headcount -- what the roster changes is how fast it can be closed, which
  // is the one place in this game the size answers with *speed* rather than
  // meeting a larger demand.
  bleed: false,
  kin: true, // more of the wave means more of the ones that came to help
  portal: false, // one way out, and anybody may take it
  suppress: true, // one per so many bodies, so a bigger raid has more to clear
  // A tax on a place rather than a thing thrown at people: it lands on
  // whoever is swinging, so a bigger raid brings more melee and pays more of
  // it. Nothing about it is aimed, and nothing about it is answered.
  chill: true,
  // One mark per so many bodies, half of them healers. See the encounter.
  instability: true,
  // The band is the band. Twenty-five people dragged into it are twenty-five
  // people in a band that was never measured in bodies.
  haul: false,
  // The shadows are cast by the coffins, and the coffins already scale: what
  // is capped here is how many bodies one shadow will hold, which is rule 5
  // written as a ceiling rather than as a scale.
  cover: false,
  // A radius round the boss, and a radius is the same radius at any headcount.
  buffet: false,
  // A group per body, and a third group once there are enough bodies to need
  // one: what it asks grows with the roster twice over, in how many people
  // have to be sorted and in how many places they have to be sorted into.
  // The three below are the same question asked of every body at once, so a
  // bigger raid meets exactly the fight a smaller one does. Nothing is
  // dropped *on* anybody and nothing is aimed at the arena either: what they
  // cover is an instant, and an instant is the same width at any headcount.
  // With one exception, and it is the mechanic's whole shape. One body is
  // named and everybody pays for it, so a bigger raid does not bring more
  // hands to the problem -- it brings more people to be let down by the one
  // pair that were already there.
  // The three that are answered by what the raid is hitting rather than by
  // where it is standing, and all three are aimed at the roster rather than
  // at the arena: every extra body is another pair of hands that has to stop,
  // switch or hold, and pays for itself when it does not.
  // One plate, one nominee, one bill. A bigger raid does not get a second
  // toll and does not get a discount on the one it has -- what changes with
  // the roster is only how many bodies there are to nominate from, which
  // makes it easier rather than more, and that is what `false` means here.
  // One reach, whatever the headcount, and it writes one bill. What a bigger
  // raid changes is how many bodies are inside the circle when it closes,
  // which makes the single bill larger rather than making a second one -- so
  // the demand on any one body is the same at every size.
  // Marks per body, and a stone per mark. Both halves scale together, which
  // is the property that keeps it the same question at every size: a quarter
  // of the raid is sorting itself onto its own ground whether that is two
  // people or six.
}

/**
 * Every mechanic there is.
 *
 * Read off a table the compiler already forces to be complete, so that code
 * which has to touch all of them cannot quietly miss one. Every hand-written
 * copy of this list in the repo's history has ended up missing a name.
 */
export const MECHANIC_IDS = Object.keys(MECHANIC_SCALES) as MechanicId[]

/**
 * A phase's mechanic cadences, with everything it does not throw left out.
 *
 * These tables used to be written in full -- every mechanic in the game named
 * on every row of every boss, and all but a handful of them zero. That is 288
 * characters of mostly nothing per row, and worse, it meant adding one
 * mechanic rewrote all twelve rows of all three bosses. Two mechanics written
 * at the same time therefore collided on every row, every time, and merging
 * them by hand is how a deleted cast line came back from the dead.
 *
 * A boss now names what it throws. Absent is zero, which is what zero already
 * meant.
 */
function beats(some: Partial<Record<MechanicId, number>>): Record<MechanicId, number> {
  const all = {} as Record<MechanicId, number>
  for (const id of MECHANIC_IDS) all[id] = some[id] ?? 0
  return all
}

/** Every mechanic's first cast, read off a boss's opening table. */
export function openingTimers(opening: Record<MechanicId, number>): Record<MechanicId, number> {
  const next = {} as Record<MechanicId, number>
  for (const id of MECHANIC_IDS) next[id] = opening[id] ?? 0
  return next
}

/** All of them at zero, for a state that has not started a fight. */
export function noTimers(): Record<MechanicId, number> {
  const next = {} as Record<MechanicId, number>
  for (const id of MECHANIC_IDS) next[id] = 0
  return next
}

export const MECHANIC_NAMES: Record<MechanicId, string> = {
  chill: 'the chill',
  instability: 'the unstable',
  haul: 'the haul',
  cover: 'the shadow',
  buffet: 'the cold',
  caustic: 'the caustic',
  slime: 'the rising',
  bleed: 'the wound',
  kin: 'the kindred',
  portal: 'the way out',
  suppress: 'the blocking',
  gift: 'the gift',
  turning: 'the turning',
  bond: 'the bond',
  stain: 'the stain',
  flight: 'the flight',
  crimson: 'the crimson',
  rotation: 'the crown',
  thirst: 'the thirst',
  ballast: 'the ballast',
  nuclei: 'the grain',
  prison: 'the stillness',
  chase: 'the chase',
  hound: 'the hound',
  gather: 'the gathering',
  decant: 'the flasks',
  reagent: 'the reagent',
  spray: 'the spray',
  infection: 'the infection',
  ooze: 'the small things',
  flood: 'the flood',
  merge: 'the merging',
  engulf: 'the engulfing',
  siphon: 'the gorging',
  spill: 'the spill',
  fester: 'the festering',
  champion: 'the mark',
  gorge: 'the swallowing',
  adds: 'thralls',
  coldflame: 'the cold line',
  spike: 'the spikes',
  blight: 'the blight',
  inhale: 'the breath in',
  pungent: 'the breath out',
  spore: 'the spore',
  vilegas: 'the reek',
  bloat: 'the swelling',
  bonestorm: 'the storm',
  decay: 'the rotting ground',
  frostbolt: 'the shard',
  volley: 'the volley',
  shade: 'the shade',
  insignificance: 'the slight',
  empower: 'the empowered',
  dominate: 'the turned',
}

export interface PhaseTiming {
  swing: number
  slam: number
  puddleCount: number
  /** Unavoidable party-wide damage; the healer's actual test. */
  raid: number
  /** 0 disables the mechanic for that phase. */
  /**
   * Seconds between one cold line and the next.
   *
   * A bearing off the boss, lit patch by patch outward, each one a step
   * further and a beat later than the one before. It is the ring's opposite
   * number and answers a different question with the same floor: the ring
   * asks everybody to come in, and this asks one wedge of the room to step
   * aside while the rest of it carries on.
   *
   * The hitbox is the safe spot, which is the whole shape of it. The line
   * starts outside the boss's own edge, so melee standing where melee stand
   * are already clear and everybody at range has a step to take -- the
   * inverse of the sweep, which was deleted for asking melee to pay for
   * standing where their job is and showing them nothing while it did.
   */
  coldflame: number
  /**
   * Seconds between one set of spikes and the next.
   *
   * The only mechanic here whose answer is somebody else's. Everything else on
   * this table is a place to be or not to be, and the person in trouble solves
   * it by walking; this takes their feet, so it is solved by the raid aiming
   * damage away from the boss at a thing that is not hurting anybody.
   *
   * That is what it costs and what it is for. A rotation that only ever points
   * at the biggest health bar answers most of this game; it does not answer
   * this, and the seconds spent turning are the mechanic.
   */
  spike: number
  /**
   * Seconds between one thickening of the blight and the next.
   *
   * The room itself, which is the only mechanic here that is not an event.
   * Everything else on this table arrives, is answered, and is over; this is
   * the air, and what it asks is that the fight be finished before the air
   * is. It is also what the two below it are made of — the boss drinks it and
   * then gives it back — so a fight that throws either of those without this
   * is a fight throwing something out of nothing. See `REQUIRES`.
   */
  blight: number
  /**
   * Seconds between one breath in and the next.
   *
   * The boss takes the room's air into itself. The raid stops choking and
   * starts being hit harder, which is the trade and the whole of it: every
   * breath is the fight getting easier to stand in and harder to survive, and
   * nobody is asked to do anything about it. What it is for is the breath out.
   */
  inhale: number
  /**
   * The longest the breath out will wait, which is not a cadence.
   *
   * Everything it took, returned at once. Lethal at three breaths to a raid
   * that has not been inoculated, which is what makes the spore a mechanic
   * rather than a chore — and why it will not be thrown without one.
   *
   * The count is what drives it: the boss breathes out when it is full, and
   * this is only the ceiling under that — a raid somehow still short of three
   * after this long gets it anyway, so a short pull cannot miss the mechanic
   * the fight is about. Kept well above three inhales on purpose. Sat a hair
   * under them once, and the third breath then never happened at all.
   */
  pungent: number
  /**
   * Seconds between one spore and the next.
   *
   * A body is marked and the rest have to come and stand with it. The only
   * demand in this game that asks the raid to gather for something other than
   * a circle on the floor, and unlike the circle what it hands back is not
   * survival now but survival later.
   */
  spore: number
  /**
   * Seconds between one reek and the next.
   *
   * A rot that does not stay where it was put: it spreads to whoever is
   * standing near the body wearing it. The answer is distance, which makes it
   * the exact opposite of the spore — and a fight that throws both is a fight
   * asking the raid to come together and stay apart on two different clocks.
   */
  vilegas: number
  /**
   * Seconds between one swelling and the next.
   *
   * Stacks on whoever is holding the boss, and every stack makes them hit
   * harder until the tenth kills them and everybody near. The answer is a
   * second tank taking it at nine, which is the only mechanic here whose
   * answer is a job rather than a place — and the reason a fight that has it
   * cannot be sold to a raid that brings one tank. See the armour break for
   * the same rule already written down.
   */
  bloat: number
  /**
   * Seconds between one storm and the next.
   *
   * The boss stops being a thing you stand behind and becomes a thing you
   * stay away from: it lets go of whoever was holding it, wanders, and bills
   * everybody it passes. For half a minute the fight has no tank and no
   * front, which is the only stretch in this game where where-you-stand is
   * the whole of what you are doing.
   *
   * It is the first boss's one idea about movement, and it is deliberately
   * the crudest one: run from the big thing. Everything else the raid learns
   * about floors and shapes is built on knowing that first.
   */
  bonestorm: number
  /**
   * Seconds between one patch of rotting ground and the next.
   *
   * The plainest thing on this table and deliberately so: it lands, it stays,
   * and standing in it is bad. No count to read, nobody named, nothing to
   * decide beyond noticing. Every boss wants one demand that is only about
   * where your feet are, and this fight's other six are all about who is
   * holding what.
   */
  decay: number
  /**
   * Seconds between one shard and the next.
   *
   * A cast at whoever is holding the boss, big enough to matter, and the
   * answer is to cut it. The same shape as the note the Choir sings and a
   * different question: that one names somebody at random and asks the raid
   * whether it noticed, this one always goes to the same body and asks
   * whether anybody is watching a health bar that is already the one being
   * watched.
   */
  frostbolt: number
  /**
   * Seconds between one volley and the next.
   *
   * Everybody, for less each than the shard costs one. It is the fight's
   * floor: a bill that arrives whatever the raid does, so that the healers
   * have something to lose ground to while the rest of this is happening.
   */
  volley: number
  /**
   * Seconds between one shade and the next.
   *
   * A thing that picks a body and follows it. The answer is to keep walking,
   * which is the only answer in this fight that belongs entirely to the person
   * who was picked — everything else here is somebody else's problem to solve.
   */
  shade: number
  /**
   * Seconds between one slight and the next.
   *
   * It takes the hold rather than the health: the tank keeps standing there
   * and stops being the thing the boss is looking at. The answer is the other
   * tank, and the reason it is on this boss rather than another is that this
   * one already asks the raid to keep changing what it is hitting — so a
   * fight that also changes who is being hit is one idea, not two.
   */
  insignificance: number
  /**
   * Seconds between one empowered body and the next.
   *
   * A wave arrives and one of them comes back wrong. What it costs is not the
   * body, it is the ordering: a raid that kills the wave left to right kills
   * the empowered one somewhere in the middle, and everything it did until
   * then it did at full strength.
   */
  empower: number
  /**
   * Seconds between one turned mind and the next.
   *
   * The fight taking one of the raid's own and pointing it back. It is the
   * only mechanic in this game where the thing that has to be answered is a
   * person the raid was relying on a moment ago — and the answer is to stop
   * relying on them without killing them, which nothing else here asks.
   */
  dominate: number
  adds: number
  /**
   * How long the gorged one's gauge takes to fill, at a reference rate of
   * mistakes.
   *
   * A cadence like every other row here, and it is written that way on
   * purpose: the thing it belongs to has no cast and no timer, so the honest
   * shape would be a multiplier -- and a multiplier is the one row on this
   * table that would read backwards, growing where every other number shrinks.
   * `siphonFeed` divides by it.
   *
   * Zero is a fight with no gauge, which is every other fight.
   */
  siphon: number
  /**
   * Seconds between one spill and the next.
   *
   * Blood put on a body with six seconds on it, judged where that body is
   * standing when the count ends. The carrier cannot dodge their own -- what
   * they can do is be somewhere alone -- so what this asks for is the one
   * thing a raid stops doing when it is concentrating, which is looking at
   * where everybody else is.
   */
  spill: number
  /**
   * Seconds between one festering wound and the next.
   *
   * The dot that must not be ridden out. Every tick of it is a deposit, and it
   * comes off the moment the body wearing it is taken back over a line, so it
   * is the one mechanic here answered by a healer being early rather than by a
   * healer being enough.
   */
  fester: number
  /**
   * The most seconds between two marks, whatever the gauge is doing.
   *
   * A floor rather than a cadence, and it exists so that a raid answering
   * everything perfectly still meets the mechanic its ladder sold it. Left at
   * zero the mark is entirely the gauge's, which is the design; a number here
   * is the safety line under it.
   */
  champion: number
  /**
   * Seconds between one swallowing and the next.
   *
   * The boss takes whoever is holding it inside itself for four seconds and
   * then puts them back with everything it took. A fight with one tank cannot
   * answer it at all, which is why it sits on the rung a five-man never
   * reaches.
   */
  gorge: number
  /**
   * Seconds between one spray and the next.
   *
   * A cone off the big arm, and the one demand this fight makes that a player
   * has met before. It is here on purpose: five of the six rungs are about
   * what the fight's own bodies are doing to each other, and a boss with
   * nothing familiar on it is a boss nobody has a way into.
   */
  spray: number
  /**
   * Seconds between one infection and the next.
   *
   * A dot that ends in a body rather than in a number. Where that body is
   * standing when it ends is what the mechanic asks, which makes it the only
   * demand here answered by two people at once -- the carrier picks the place
   * and the healer picks the moment.
   */
  infection: number
  /**
   * Seconds between one flood and the next.
   *
   * Ground that spreads from the boss, hurts nobody, and slows everything
   * standing on it. On its own it teaches nothing and is not meant to: what it
   * does is make a geometry expensive to fix late.
   */
  flood: number
  /**
   * Seconds between one swallowing of a small thing and the next.
   *
   * Held rather than reset when there is nothing to swallow, so a raid that
   * cleared the floor is not handed the next one early for having done so.
   */
  engulf: number
  /**
   * The two rungs in this game with no clock at all, and they are always zero.
   *
   * A small thing is born when an infection ends, and two of them become one
   * when they touch. Neither is a thing the fight decides to do at a moment;
   * both are consequences of where bodies were standing, which is the whole
   * reason the boss that owns them is worth building.
   *
   * They are here because every mechanic needs a row -- `gated` reads one per
   * name -- and they stay at nought because a number in either would be a
   * cadence for something that does not have one.
   */
  ooze: number
  merge: number
  /**
   * Seconds between one round of broken flasks and the next.
   *
   * The ordinary demand on a fight that has none: a pool to walk out of. Its
   * residue is what makes the other two answerable in the same room, by
   * deciding where they can happen.
   */
  caustic: number
  /**
   * Seconds between one hound and the next.
   *
   * Something that cannot be killed, walking at one named body for
   * twenty-two seconds. Read against `gather` rather than on its own: the
   * ratio of the two is the fight, because the gathering lands on whoever is
   * being followed.
   */
  hound: number
  /**
   * Seconds between one gathering and the next.
   *
   * Everybody inside one circle, and the bill divided by whoever came. It is
   * written slower than the hound on purpose, so that more than half of them
   * land while somebody is still being followed -- which is the only reason
   * this boss exists.
   */
  gather: number
  /**
   * Seconds between one pair of flasks and the next.
   *
   * The one demand here answered by being early rather than by reacting. Its
   * count is twenty seconds and its radius is small: what it asks is that
   * somebody leave a place long before leaving it is urgent.
   */
  decant: number
  /**
   * Seconds between one draught and the next.
   *
   * The boss drinking its own work. A public count on the tank, and the swap
   * is at six of seven.
   */
  reagent: number
  /**
   * Not seconds. Any number above nought means the gathering is a chase.
   *
   * The chase has no clock of its own -- it is a rule about where the circle
   * above lands -- but every mechanic needs a row on this table, and the
   * switch a row already has is "is this number above nought". So the row is
   * read as a flag, and it is written as the gathering's own cadence so that
   * anybody reading the table sees which beat it belongs to.
   *
   * `siphon` is the precedent: a row whose units are not really seconds, kept
   * on this table anyway because one table of cadences that everything is
   * gated through beats two tables with two rules.
   */
  chase: number
  /**
   * Seconds between one rising of the sludgeworks and the next.
   *
   * The floor of one room, carried at every size rather than sold on a rung:
   * what it does is take the outside of the room away for a while, and a room
   * that is smaller for a five-man than for a twenty-five is a different room
   * rather than an easier one.
   */
  slime: number
  /**
   * Seconds between one moving of the crown and the next.
   *
   * Which of the three bodies can be hurt at all. Everything without it takes
   * nothing -- not less, nothing -- so what this asks is the one question no
   * other fight here asks: is the thing I am hitting the thing I should be
   * hitting?
   */
  rotation: number
  /**
   * Seconds between one ballast and the next.
   *
   * Two things that must not reach the floor, answered by damage rather than
   * by movement -- which is what makes them fight the crown for the same
   * hands. Splitting the damage is the answer and how to split it is the
   * decision.
   */
  ballast: number
  /**
   * Seconds between one grain and the next.
   *
   * An errand, and it belongs to the tank: the body whose job is to stand
   * still is the only one in the raid that has to keep going somewhere.
   */
  nuclei: number
  /**
   * Seconds between one stillness and the next.
   *
   * Ten seconds in which every step costs more than the one before it. The
   * fight does not stop asking for steps while it runs; what it asks is which
   * of them are worth paying for.
   */
  prison: number
  /**
   * The thirst has no row of its own -- it is a state rather than a beat --
   * but every mechanic needs one, so this is the switch: above nought and the
   * two bodies without the crown are drinking.
   */
  thirst: number
  /**
   * Seconds before the first gift, and nothing after that.
   *
   * The only row on this table that is an opening rather than a cadence: once
   * one is out, what schedules the next is the raid passing this one, which
   * doubles it. A fight that kept handing them out on a clock would be a fight
   * where the raid's own passing did not matter.
   */
  gift: number
  /**
   * Seconds between one pair being bound and the next.
   *
   * It pulls against the gift on purpose: one says go and find somebody who
   * has never held it, the other says do not leave your partner. A body with
   * both has two demands pointing in different directions, which is the
   * hardest moment in that fight.
   */
  bond: number
  /**
   * Seconds -- and it is always nought. Blood is left where a gift was
   * doubled, so what schedules it is the raid.
   */
  stain: number
  /**
   * Seconds between one flight and the next.
   *
   * Fourteen seconds with nothing to hit at all. Read against the enrage
   * rather than on its own: four of them is fifty-six seconds of a raid doing
   * no damage, which is why that fight's clock is the shortest here.
   */
  flight: number
  /**
   * Seconds between one crimson and the next.
   *
   * A raid-wide hit whose size is the number of gifts in play. It is what
   * closes that fight: the first rung says passing doubles it and this one
   * says every doubling is on the bill, so how many to run is a decision the
   * raid makes and then pays for.
   */
  crimson: number
  /**
   * Seconds -- and always nought, like the stain and the two on the
   * confluence.
   *
   * What turns a body here is the raid dropping a gift, so there is no clock
   * to write. It is a rung of its own rather than the Whisper's `dominate`
   * because the two are different sentences said with the same aura: there a
   * clock takes somebody, and here the raid lost one. A single id would have
   * meant one line of dialogue for both, and `REQUIRES` is global -- an entry
   * saying the turned body needs a gift would have handed the gift to the
   * Whisper.
   */
  turning: number
  /**
   * Seconds between one wound and the next.
   *
   * The first bill in this game charged to the boss rather than to the raid:
   * nobody is hurt by it at all, and what it takes is the thing the raid is
   * trying to raise. It is answered by walking into the middle and standing
   * there, which is where everything else in that fight is happening.
   */
  bleed: number
  /**
   * Seconds between one of the wave being one of *theirs*.
   *
   * A body that came to help, mixed in with the ones that came to bite. The
   * answer is not hitting it, which means the answer is looking -- and it is
   * deliberately not weak, because a body that dies to a stray cleave is an
   * accident rather than a decision.
   */
  kin: number
  /**
   * Seconds between one way out and the next, and it does not move.
   *
   * Fixed at forty-five whatever the phase, so it drifts against everything
   * else on this table. That is the design: the way out is always open at the
   * worst possible moment.
   */
  portal: number
  /**
   * Seconds between one blocking thing and the next.
   *
   * It hurts nobody and it is the most dangerous thing on the floor: while it
   * stands, most of what the raid is doing does not arrive. The first mechanic
   * here where what to hit is decided by the boss's bar rather than by what is
   * hurting the raid.
   */
  suppress: number
  /**
   * Seconds a body that has just been chilled is safe from being chilled again.
   *
   * A cadence in name only, and the one on this table that is not a beat the
   * boss keeps: nothing schedules the chill, a melee swing does, and what
   * this holds is how long after one lands the next may. It is written here
   * rather than as a constant because it is the one dial that decides how
   * much a melee place costs, and a dial that decides that belongs on the
   * table that decides everything else about a phase.
   */
  chill: number
  /**
   * Seconds between one round of marks and the next.
   *
   * The mark itself is fifteen seconds of debt: every cast the marked body
   * starts while it is on adds one, and the bill at the end is the square of
   * what it counted. The answer is to press nothing, which is why half of
   * them go on healers -- a dealer that stops has spent the enrage timer, and
   * a healer that stops has spent somebody else.
   */
  instability: number
  /**
   * Seconds between one drag and the next.
   *
   * Three stages on one clock: everybody is pulled in for a second and a
   * fifth, a band round the boss reddens for one and a tenth, and then it
   * falls in on whoever is still inside it. The pull is what makes every cast
   * of it a question -- without it the melee are already in and the ranged
   * are already out, and nobody is asked anything.
   */
  haul: number
  /**
   * Seconds between one wash of the room and the next.
   *
   * The only place in this game where the answer to a mechanic is the wreck
   * another one left: what is safe is the shadow behind a coffin, and the
   * coffins are the thing the raid has been breaking all fight. It needs
   * them, so `REQUIRES` says so.
   */
  cover: number
  /**
   * Seconds between one turn of the cold and the next, in the last phase only.
   *
   * A refresh rather than a cast: standing inside the boss's reach adds a
   * stack, standing outside it drops one more slowly, and every stack is nine
   * percent more magic damage taken. There is no moment it goes off. What it
   * asks is that a raid which is winning walks away from the thing it is
   * winning against, which nothing else in this game asks for.
   */
  buffet: number
  /**
   * Physical damage to everyone standing in reach.
   *
   * The only thing the boss does that armour answers — everything else it
   * throws is magic, which is why plate on a melee dealer was a line in a
   * table rather than a reason to bring one.
   */
  /** A dot on somebody. Slow, unavoidable, and the healer's to solve. */
}

export interface Encounter {
  id: string
  name: string
  /** For tabs and anywhere else the full name does not fit. */
  short: string
  /** One line on what this one asks of you, shown before the pull. */
  demand: string
  /**
   * The room this fight is fought in, or omitted for the circle everything
   * used to be fought in.
   *
   * A room is a property of the encounter for the same reason the ladder is:
   * what separates two bosses is what they ask for, and where you are standing
   * is most of the answer to everything they ask. Three fights that light
   * lines out of the middle, throw shards down a hall and thicken the air in a
   * small room have three different rooms in the source and one circle here.
   *
   * Omitting it is not a placeholder — the first fight is deliberately the
   * yardstick room, and every "narrow" or "wide" written on another one is a
   * claim about this one. See `RoomShape` for the frame the coordinates are
   * written in, and `roomArea` for the budget.
   */
  room?: RoomShape
  /**
   * What is standing in that room, written out, or omitted to roll it.
   *
   * Terrain used to be rolled for every pull: a third of rooms came up empty
   * and the rest got one to four rocks wherever they landed. That made the
   * floor a fact about the attempt rather than about the fight — the same boss
   * twice was two different rooms — and a room nobody can learn is the one
   * part of a fight that is learned by nobody.
   *
   * So a fight names its own, and it is the same list every pull. `terrain: []`
   * is a room with nothing in it, said on purpose, which is not the same as
   * omitting the field: the first boss wants an empty floor because its lines
   * reach the wall, and that is a decision rather than a roll that came up
   * empty.
   *
   * Rolled floors keep rolling — see `createState`. A descent floor is a
   * different room every time by design, and that is the one place where a
   * floor nobody can learn is the right answer.
   *
   * Every rock here is checked at build time against the rules the roll
   * applies: off the middle, a lane off the wall, a lane off every other rock,
   * and clear of where the raid stands at the pull. See `terrainFaults`.
   */
  terrain?: Obstacle[]
  /**
   * Where whatever this fight summons walks in from, or omitted to roll it.
   *
   * A wave used to appear at a random bearing on a ring of 230. A random
   * bearing is not a decision: whichever way it came from, the answer was the
   * same, and the room said nothing about where things come from. Two doors
   * make "which side first" a question, and that is a decision bought with no
   * new mechanic at all — the cheapest kind this game has.
   *
   * Doors are used in turn, never rolled. The only randomness in this game is
   * *who* gets picked, and a door order that is rolled as well takes away the
   * one thing about a wave that can be learned: left, then right.
   *
   * `from` is the smallest raid a door opens for. It is not difficulty — it is
   * the room being bigger for a bigger raid. `adds` scales with the roster
   * (see `MECHANIC_SCALES`), so a room whose doors do not scale with it puts
   * two and a half times the wave through the same two doorways.
   */
  doors?: Door[]
  /**
   * Which of the floor grains this room is laid with, or omitted to roll one.
   *
   * The same problem the terrain had, one layer down: the grain under the
   * slabs is picked from the seed, so the same boss twice is the same shape of
   * room with a different surface. A room somebody is meant to learn should
   * look the way it looked last time.
   *
   * A prop id — the ids beginning `floor-` in `PROPS`. The colour of the tile
   * is thrown away and only its grain is kept (see `floorTexture`), so what
   * this picks is how coarse the ground reads, not what colour it is. That
   * stays the encounter's accent.
   */
  floor?: string
  hp: number
  /** Seconds before the fight is lost outright. */
  enrage: number
  /**
   * The thing that arrives at the first phase break, or null for a fight that
   * is only ever its boss.
   *
   * A raid here has always been one large thing in the middle of a circle for
   * its whole length, and four of the five never had anything else on the
   * floor to hit. This is the interlude: at the break the boss turns away, a
   * named elite walks in with an escort, and nothing gets through to the boss
   * until it is down.
   *
   * It is not a rung. The ladders are full — thirty mechanics across thirty
   * rungs, one owner each — and a seventh rung would be content no cell ever
   * buys. This sits outside them, so every difficulty and every raid size gets
   * the same interlude, which is also the right answer for a beat whose job is
   * to change the shape of the fight rather than its difficulty.
   */
  herald: HeraldPlan | null
  /**
   * Mechanics this fight throws at every size, on top of what the rungs buy.
   *
   * The ladder is six long because a rung is a size-and-difficulty setting and
   * there are exactly six of those — three sizes by two difficulties — so six
   * was the most any boss could own. That was a limit on the shape of the
   * progression leaking into a limit on how much a fight is allowed to be.
   *
   * What belongs here is what is not a rung: a thing that is true of the fight
   * from the first pull rather than something a bigger or harder raid buys.
   * The blight is the worked example — it is the room, not an event, and a
   * five-man meeting a different room from a twenty-five would be two fights
   * sharing a name.
   *
   * Everything a rung buys still has to be one mechanic, and the checks still
   * say so. This is beside that rule rather than a hole in it.
   */
  always?: MechanicId[]
  /** Health fractions the phases turn on. */
  phaseTwoHp: number
  phaseThreeHp: number
  swingDamage: number
  slamDamage: number
  raidDamage: number
  /**
   * Multiplier on everything the floor does — puddles, the cone, the ring.
   *
   * The shapes are the same for every boss, so this is what says whether
   * standing in one is a mistake or a death. It is the difference between a
   * fight that asks for attention and one that asks for precision, and it is a
   * multiplier rather than three numbers because a boss whose puddles hurt and
   * whose cone does not is a boss nobody can read.
   */
  mechanicDamage: number

  /**
   * What that multiplier is worth at each raid size, for this boss alone.
   *
   * `SIZE_HEALTH` is the raid-size dial the whole game shares, and sharing it
   * is the problem: the five bosses do not sit the same way at the same size.
   * A twenty-five man walks over the Tidebreaker and loses to the Choir, and
   * one global number cannot move one without moving the other.
   *
   * `MECHANIC_SCALES` says why they differ, and it is not a fudge for it: a
   * boss made of things dropped on people asks more of a bigger raid on its
   * own, and one made of arena shapes asks the same of any raid, so the same
   * roster is worth different amounts against each. The Warden sits at four
   * fifths and needs no line here at all.
   *
   * It went unnoticed because the Tidebreaker had a second, accidental dial —
   * a shockwave band so wide at twenty-five that the pocket could not hold the
   * raid. That was not difficulty, it was an unperformable mechanic, and
   * taking it out left the boss with no size scaling at all.
   *
   * Omitted means one. A boss that reads the same at every size does not need
   * a line here.
   */
  sizeMechanic?: Partial<Record<RaidSize, number>>
  /**
   * What this one asks for, in the order it starts asking.
   *
   * The tables below hold the cadence of every mechanic a boss *can* throw;
   * this says how many of them it actually throws tonight, and which. A
   * five-man on normal gets the first two rungs, and every step up the raid
   * size or across to heroic buys one more — see `kitCount`.
   *
   * The order is the whole design. Two bosses whose first rungs overlap are
   * two bosses that open the same way, and the opening is the only part of a
   * fight everybody sees: a party that wipes at forty percent has met three
   * mechanics and no more. So the first rungs are disjoint across all
   * three — the brand and the crush, marks and the stalker, the cone and the ring
   * — and the sets only begin to rhyme at the sizes where a raid has the
   * bodies to notice. No boss's ladder is a prefix or a subset of another's at
   * any rung, which is the thing that stops the second boss being the first
   * one wearing a different colour.
   */
  ladder: MechanicId[]
  phases: Record<number, PhaseTiming>
  /**
   * Seconds to the first of each mechanic.
   *
   * Separate from the phase timers because an opening is not a cadence: the
   * first puddle wants to land while the pull still feels calm, and a boss
   * whose first shockwave arrives on its normal interval has spent a third of
   * phase one doing nothing.
   */
  opening: {
    coldflame: number
    spike: number
    blight: number
    inhale: number
    pungent: number
    spore: number
    vilegas: number
    bloat: number
    bonestorm: number
    decay: number
    frostbolt: number
    volley: number
    shade: number
    insignificance: number
    empower: number
    dominate: number
    slam: number
    raid: number
    adds: number
    /**
     * How long the gauge takes to fill at the reference rate, on the way in.
     *
     * A gauge has no first cast -- it is filling from the first mistake -- so
     * what this says is the same thing the phase rows say, and it is here
     * because the shape of the table is the shape of the table.
     */
    siphon: number
    spill: number
    fester: number
    /** Nor the mark, which is bought rather than scheduled. */
    champion: number
    gorge: number
    spray: number
    infection: number
    flood: number
    engulf: number
    /** Nought, and see `PhaseTiming`: neither of these has a clock. */
    ooze: number
    merge: number
    caustic: number
    hound: number
    gather: number
    decant: number
    reagent: number
    /** A flag rather than a beat: see `PhaseTiming`. */
    chase: number
    slime: number
    rotation: number
    thirst: number
    ballast: number
    nuclei: number
    prison: number
    gift: number
    bond: number
    stain: number
    flight: number
    crimson: number
    turning: number
    bleed: number
    kin: number
    portal: number
    suppress: number
    /** Nought: a swing is what starts the chill, so it has no first cast. */
    chill: number
    instability: number
    haul: number
    cover: number
    buffet: number
  }
  /**
   * Whether this fight is won by the bar going up rather than down.
   *
   * The one inversion in this game, and it is a parameter rather than a
   * special case: the thing in the middle is not an enemy, it starts halfway,
   * and everything on its ladder is something taking away the mending it is
   * already doing. It swings at nobody, it holds nobody, and its phases turn
   * on the clock rather than on its health -- which is the other half of the
   * same idea, since a bar that rises would otherwise run the phases
   * backwards.
   *
   * Absent everywhere else, which is every other fight.
   */
  saving?: boolean
  /**
   * Where a fight with more than one body puts them.
   *
   * A room's fact rather than a boss's. One fight here is three bodies of
   * which only one can be hurt, and what makes that a mechanic instead of a
   * label is how far apart they stand: three stations a step from each other
   * would make moving between them free, and free is not a mechanic. The room
   * owns the distance and the fight stands where it is told.
   *
   * Absent everywhere else, which is every other fight.
   */
  stands?: Vec2[]
  /**
   * The colour this one is drawn in.
   *
   * Three bosses that differ in what they ask for still read as one boss when
   * they are the same red disc casting the same two spells. The tables were
   * always different — the Choir throws no cone and no ring at all, the
   * Tidebreaker no spread and no rot — but nothing the player *reads* said so.
   */
  accent: string
  /**
   * What each of the boss's casts is called. Empty where it never casts it.
   *
   * One entry per cast rather than a pair plus a default, which is what this
   * was and what let the second boss announce its shard as its tank slam --
   * see the label in `hud.ts`. A cast with no line here is a cast the player
   * is told the wrong name for, so a new one has to add a field and be made
   * to say so.
   */
  names: {
    slam: string
    shard: string
    /**
     * The unavoidable one, which every boss has and which every boss called by
     * the same name until this existed.
     *
     * `CRUSHING TIDE` is the drowned one's word and it was printed over the
     * countdown on all eight, including the lich whose tide is deliberately
     * the smallest in the game. It is the only thing the fight does that
     * arrives whatever anybody does, so it is also the one a player reads most
     * often -- eight fights saying it the same way is eight fights sounding
     * like one.
     */
    raid: string
  }
  lines: {
    phaseTwo: string
    phaseThree: string
    adds: string
    coldflame: string
    spike: string
    blight: string
    inhale: string
    pungent: string
    spore: string
    vilegas: string
    bloat: string
    bonestorm: string
    decay: string
    frostbolt: string
    volley: string
    shade: string
    insignificance: string
    empower: string
    dominate: string
    /**
     * What the gorged one says as its gauge tips over, and what it says when
     * it takes somebody.
     *
     * The gauge itself is silent by design: a bar that announced every deposit
     * would be a bar nobody could hear over. What is announced is the moment
     * it buys something, which is the only instant in it that is a mechanic.
     */
    siphon: string
    spill: string
    fester: string
    champion: string
    gorge: string
    spray: string
    infection: string
    flood: string
    engulf: string
    caustic: string
    slime: string
    rotation: string
    thirst: string
    gift: string
    bond: string
    bleed: string
    kin: string
    suppress: string
    instability: string
    haul: string
    cover: string
    // The chill and the cold have no key, which is the absence this table
    // already allows twice over. Neither is an event: one is what a swing
    // costs and the other is what standing costs, and both are read off the
    // floor under a body rather than off a cast bar. A boss announcing either
    // would be a boss announcing a rate.
    // The way out has no key here, which is the same absence the stain and the
    // merging have: it is not an event the fight announces, it is a hole that
    // is either open or not, and the picture says so. It is also the one
    // cadence on this table that deliberately does not move with the phases,
    // and a key here would put it under a rule that says every announced
    // mechanic comes round sooner as a fight goes on.
    flight: string
    crimson: string
    // The stain has no key: what leaves it is the raid's own pass, and a boss
    // announcing the raid's success would be a boss doing the reading.
    ballast: string
    nuclei: string
    prison: string
    hound: string
    gather: string
    decant: string
    reagent: string
    // The two this fight never announces have no key here at all, which is the
    // one legitimate absence the check downstairs allows. A small thing is
    // born where a body was standing and the raid watched it happen; a merging
    // is two of them touching, which the raid is either watching for or has
    // already lost. A boss that called either would be a boss doing the
    // looking for them.
    /** Empty where the boss does not use the mechanic. */
    /** Unplaced too, and for the same reason. See `fault` above. */
  }
}

/**
 * A way into the room, and the smallest raid it opens for.
 *
 * On the wall — the build checks it — because a door in the middle of the
 * floor is a spawn point wearing a door's name, and the whole value of a door
 * is that the raid can see where it is before anything comes out of it.
 */
export interface Door {
  pos: Vec2
  /** Omitted means always open. */
  from?: RaidSize
}

/** The doors this fight opens for a raid of that size, in the order they are used. */
export function openDoors(fight: Encounter, size: number): Door[] {
  return (fight.doors ?? []).filter((door) => door.from === undefined || size >= door.from)
}

/** A fight's interlude: what walks in at the first phase break. */
export interface HeraldPlan {
  name: string
  /** What the boss says as it turns away. */
  line: string
  /**
   * The elite's health, as a share of the boss's own.
   *
   * Carved out of the boss rather than added to it — `createState` takes this
   * off the boss's bar when it builds the fight. The raid therefore has the
   * same total health to chew through and the enrage clock keeps meaning what
   * it meant; what changed is that some of that health walks around and hits
   * back. A fight that simply grew an elite would be a fight with a longer
   * enrage timer wearing a costume.
   *
   * Enough to buy about half a minute out of a fight that runs two and a half.
   * Twice this was tried and it was not an interlude, it was an intermission:
   * a minute and a half of the fight the raid came for simply not happening,
   * and every cell that has one swung twenty points or more.
   */
  share: number
}

export const ENCOUNTERS: Encounter[] = [
  {
    // The first thing a raid meets, and it is built to teach one rule.
    //
    // Three mechanics and no more, which is a thing a boss is allowed to be
    // now: every setting sells all three, so a five-man on normal meets the
    // whole fight and a twenty-five man on heroic meets the same fight with
    // more of it landing. There is nothing here to unlock, because what is
    // being unlocked is the player.
    //
    // All three are about where your feet are, in increasing order of how far
    // they have to go. A line you step off. A body you cannot step at all,
    // that somebody else has to come and free. And a thing that stops being
    // tanked and comes at the room, which is answered by not being anywhere
    // for half a minute.
    //
    // No interlude. Nothing about a first boss should be an aside.
    herald: null,
    id: 'marrow',
    name: 'The Bonegrinder',
    short: 'Marrow',
    demand: 'get off the line, break the bone, and run when it lets go',
    // Short for a boss and long enough to be a fight, which for this one is a
    // hard floor rather than taste: the storm is its third idea and its
    // longest count, so a pull that ends before the first one is a pull that
    // taught two thirds of what this boss is for. At nineteen thousand a
    // five-man was done in thirty-four seconds and never saw it. The floor
    // holds here -- every pull still meets a storm, and still at forty-eight
    // seconds.
    //
    // Down from fifty-two thousand, which was the number a health bar wants
    // when the storm costs the raid nothing. Once the raid could actually
    // answer it, the answer was thirty seconds a pull of running instead of
    // casting, and a bar sized against the old fight became a clock: a third
    // of pulls ended on the enrage, against twelve percent for the worst of
    // the other seven bosses and nothing at all for four of them. Losing a
    // first boss to a timer teaches less than losing it to the thing that
    // killed you, so the bar pays for the damage the mechanic now costs.
    // The room, and it is the one every other room in this game is described
    // against. Round nine hundred and twenty, which is what every fight was
    // fought in and what every number in `docs/mechanic-rules.md` was measured
    // in, so it is left unwritten: `room` omitted *is* this room.
    //
    // Nothing standing in it, said on purpose rather than rolled empty. The
    // three things this fight does all reach the wall — a line out of the
    // middle, a storm crossing the floor, a body pinned where it stood — and a
    // rock in the way turns "step off the line" into "walk around the rock".
    // The first boss teaches one rule and the floor has to be saying one
    // thing.
    terrain: [],
    // Flagstone rather than whatever the seed picked. What is kept from the
    // tile is its grain and not its colour, so this is how coarse the ground
    // reads: the coarsest of the five, for a hall that has been ground down.
    floor: 'floor-cobble',
    hp: 46000,
    enrage: 240,
    phaseTwoHp: 0.66,
    phaseThreeHp: 0.33,
    swingDamage: 520,
    slamDamage: 1050,
    raidDamage: 120,
    mechanicDamage: 0.9,
    sizeMechanic: { 5: 1.0, 10: 1.0, 25: 1.0 },
    accent: '#e7e5e4',
    names: { slam: 'SABER LASH', shard: '', raid: 'THE GRINDING' },
    ladder: ['coldflame', 'spike', 'bonestorm'],
    phases: {
      1: { swing: 2.2, slam: 19, puddleCount: 1, raid: 12, ...beats({ coldflame: 13, spike: 27, bonestorm: 62 }) },
      2: { swing: 2.0, slam: 17, puddleCount: 1, raid: 11, ...beats({ coldflame: 11, spike: 24, bonestorm: 56 }) },
      3: { swing: 1.8, slam: 15, puddleCount: 1, raid: 10, ...beats({ coldflame: 9.5, spike: 21, bonestorm: 50 }) },
    },
    opening: { slam: 14, raid: 13, ...beats({ coldflame: 11, spike: 22, bonestorm: 48 }) },
    lines: {
      phaseTwo: 'The floor is bone now',
      phaseThree: 'GRIND THEM ALL',
      instability: '',
      haul: '',
      cover: '',
      caustic: '',
      slime: '',
      rotation: '',
      gift: '',
      bleed: '',
      kin: '',
      suppress: '',
      bond: '',
      flight: '',
      crimson: '',
      thirst: '',
      ballast: '',
      nuclei: '',
      prison: '',
      hound: '',
      gather: '',
      decant: '',
      reagent: '',
      spray: '',
      infection: '',
      flood: '',
      engulf: '',
      siphon: '',
      spill: '',
      fester: '',
      champion: '',
      gorge: '',
      adds: '',
      coldflame: 'Cold on the floor — off the line',
      spike: 'Bone through the floor — break it, get them out',
      blight: '',
      inhale: '',
      pungent: '',
      spore: '',
      vilegas: '',
      bloat: '',
      bonestorm: 'IT HAS LET GO — RUN',
      decay: '',
      frostbolt: '',
      volley: '',
      shade: '',
      insignificance: '',
      empower: '',
      dominate: '',
    },
  },
  {
    // The boss that takes things you were relying on.
    //
    // Not places — the rotting ground is the only demand here about where your
    // feet are, and it is here so that there is one. What this fight removes
    // is the tank's hold, the harmlessness of a body in the wave, the ground
    // under the raid, and finally one of the raid. Every one of them is a
    // thing that was working a second ago.
    //
    // Seven, which is one more than there are settings to sell them on, and
    // that is the whole reason the kit count stopped being a fixed six. Its
    // steps buy two at a time in the middle of the ladder.
    herald: null,
    id: 'whisper',
    name: 'The Last Whisper',
    short: 'Whisper',
    demand: 'cut the shard, swap the hold, and hold off your own',
    /**
     * A long room instead of a round one — the first in the game.
     *
     * Everything this fight throws travels in a straight line: the shard, the
     * shade, the mind it turns and sends back. In a disc every bearing is the
     * same bearing and a line is a line wherever it points; in a hall there is
     * an axis, and "am I on it" becomes a thing to know. That is the whole
     * reason this room is not round.
     *
     * The floor is 1120 by 2280, which is two and a half million square units
     * against the yardstick's two and two thirds — the same amount of room,
     * differently shaped. A long room that was also a smaller one would be two
     * changes measured as one.
     *
     * The frame is `RoomShape`'s: the boss at the origin, the raid coming in
     * from `+y`. So `front` is the length of hall the raid fights down and
     * `back` is what is behind the lich.
     */
    room: { kind: 'hall', halfWidth: 560, front: 1560, back: 720 },
    /**
     * Two rows of seats down the sides, and a clear middle.
     *
     * Five blocks a side rather than a wall, because a wall is a concave shape
     * and this game does not buy path-finding — the gaps between them are what
     * that decision costs, and they read as the aisles between benches. The
     * middle is left empty on purpose: it is where the straight lines travel
     * and where the rotting floor is laid.
     *
     * Against the rules the terrain roll obeys: 75 units off the side wall
     * (a lane is 64), 382 off the middle at the nearest (the melee ring is
     * 210), 200 between neighbours, and clear of every starting mark at all
     * three raid sizes. `rendercheck` measures all four.
     */
    terrain: [
      { pos: { x: -415, y: -520 }, radius: 70 },
      { pos: { x: -415, y: -180 }, radius: 70 },
      { pos: { x: -415, y: 160 }, radius: 70 },
      { pos: { x: -415, y: 500 }, radius: 70 },
      { pos: { x: -415, y: 840 }, radius: 70 },
      { pos: { x: 415, y: -520 }, radius: 70 },
      { pos: { x: 415, y: -180 }, radius: 70 },
      { pos: { x: 415, y: 160 }, radius: 70 },
      { pos: { x: 415, y: 500 }, radius: 70 },
      { pos: { x: 415, y: 840 }, radius: 70 },
    ],
    /**
     * Four side doors, and two of them only open for a big raid.
     *
     * This fight's wave used to arrive at a rolled bearing, which is not a
     * place. Now it walks in through a door, the doors are taken in turn, and
     * "which side first" is a decision bought with no new mechanic.
     *
     * The back pair opens at twenty-five, which is the room being bigger for a
     * bigger raid rather than a difficulty setting. `adds` scales with the
     * roster, so two doorways at twenty-five would put two and a half times
     * the wave through the same two gaps; four keeps what arrives at one door
     * roughly what a ten-man meets. A five and a ten fight the front half of
     * the hall and never look behind them.
     */
    doors: [
      { pos: { x: -560, y: 240 } },
      { pos: { x: 560, y: 240 } },
      { pos: { x: -560, y: -420 }, from: 25 },
      { pos: { x: 560, y: -420 }, from: 25 },
    ],
    /** Cut stone, laid in courses: a room that is still in use. */
    floor: 'floor-slate',
    hp: 58000,
    enrage: 240,
    phaseTwoHp: 0.7,
    phaseThreeHp: 0.36,
    swingDamage: 580,
    slamDamage: 1150,
    raidDamage: 95,
    mechanicDamage: 0.66,
    // Not monotone, and that is the finding rather than a slip. The ten-man
    // is the size this ladder was written for and pays full; both ends need
    // relief, for opposite reasons. A five-man fields one tank and one
    // healer, so every demand aimed at one body lands on a third of the
    // people who can answer it -- the shade at four rungs took five heroic to
    // 15% while a ten-man with the same four kit sat at 100%. A twenty-five
    // man on heroic is the only cell that buys the whole ladder, and the last
    // rung arrives on top of six others rather than on its own: 28%, against
    // 100% for the twenty-five man normal one rung below it.
    //
    // At 0.95/1.0/0.82, forty pulls a cell: 100, 65, 100, 98, 100, 75, with
    // the two that were broken now killing about half the raid on the way to
    // the kill and the twenty-five heroic climbing 50 to 75 between a first
    // pull and a ninth. Taking them further -- 0.85/1.0/0.72 -- puts all six
    // cells at 95 or better, which is the fight being handed over.
    sizeMechanic: { 5: 0.95, 10: 1.0, 25: 0.82 },
    accent: '#38bdf8',
    names: { slam: 'A WORD OF ENDING', shard: 'WINTER SHARD', raid: 'SETTLING COLD' },
    // Cheapest idea first, and the two that need somebody else to act on them
    // last. The turned mind is the top rung on purpose: it is the only thing
    // in this game that asks a raid to stop hitting one of its own, and a raid
    // that has not already learned to change targets twice will read it as the
    // fight cheating.
    // The wave is not one of this fight's ideas, it is the thing one of its ideas
    // happens to be about — the empowered body is a fact about a summon that was
    // already coming, and the Watcher is the boss that owns summoning. So it is
    // carried rather than sold: every setting has a wave, and what the ladder
    // sells is the one that comes back wrong.
    always: ['adds'],
    ladder: ['volley', 'decay', 'frostbolt', 'shade', 'insignificance', 'empower', 'dominate'],
    phases: {
      1: { swing: 2.1, slam: 16, puddleCount: 1, raid: 14, ...beats({ adds: 44, volley: 12, decay: 15, frostbolt: 21, shade: 26, insignificance: 10, empower: 47, dominate: 38 }) },
      2: { swing: 1.9, slam: 14, puddleCount: 1, raid: 13, ...beats({ adds: 39, volley: 10.5, decay: 13, frostbolt: 18, shade: 23, insignificance: 9, empower: 41, dominate: 33 }) },
      3: { swing: 1.7, slam: 12, puddleCount: 1, raid: 12, ...beats({ adds: 34, volley: 9, decay: 11, frostbolt: 16, shade: 20, insignificance: 8, empower: 36, dominate: 29 }) },
    },
    opening: { slam: 13, raid: 15, ...beats({ adds: 40, volley: 11, decay: 14, frostbolt: 19, shade: 24, insignificance: 11, empower: 44, dominate: 36 }) },
    lines: {
      phaseTwo: 'The chorus falters',
      phaseThree: 'I HAVE HELD THIS PLACE FOR CENTURIES',
      instability: '',
      haul: '',
      cover: '',
      caustic: '',
      slime: '',
      rotation: '',
      gift: '',
      bleed: '',
      kin: '',
      suppress: '',
      bond: '',
      flight: '',
      crimson: '',
      thirst: '',
      ballast: '',
      nuclei: '',
      prison: '',
      hound: '',
      gather: '',
      decant: '',
      reagent: '',
      spray: '',
      infection: '',
      flood: '',
      engulf: '',
      siphon: '',
      spill: '',
      fester: '',
      champion: '',
      gorge: '',
      adds: 'The faithful answer',
      coldflame: '',
      spike: '',
      blight: '',
      inhale: '',
      pungent: '',
      spore: '',
      vilegas: '',
      bloat: '',
      bonestorm: '',
      decay: 'The ground is going over — off it',
      frostbolt: 'Shard on the tank — cut it',
      volley: 'Cold, all of it, all of you',
      shade: 'Something is following you — keep walking',
      insignificance: 'It has stopped looking at me — take it',
      empower: 'That one came back wrong — kill it first',
      dominate: 'One of ours is turned — hold off them',
    },
  },
  {
    // The boss that changes the question while you are answering it.
    //
    // Every other fight here throws things at a raid standing in a room. This
    // one is the room: the air is a bill nobody can dodge, the boss drinks the
    // air, and every mouthful it takes makes the room kinder and the thing in
    // front of you worse. Nothing about that is a demand -- there is no step,
    // no target call, nothing to refuse -- and it is the spine of the fight,
    // because what it is building toward is one moment that kills a raid which
    // was not preparing for it forty seconds ago.
    //
    // The other three are the preparation and its price. A spore asks the raid
    // to gather, and gathering is the one thing the reek punishes; the
    // swelling asks the tanks to hand the boss back and forth on a public
    // count. So the raid is being asked to come together, stay apart and swap
    // over, on three clocks that do not line up, while the air gets thinner
    // and the swings get harder.
    //
    // No interlude. The fight already has a beat that changes its shape and it
    // is the breath: a summoned body to kill in the middle of that would be a
    // second answer to a question the fight is not asking.
    herald: null,
    id: 'host',
    name: 'The Reeking Host',
    short: 'Host',
    demand: 'share the air, and know who is holding it',
    // Sixty thousand, and the number it replaces was defending something that
    // could not happen.
    //
    // Sixty-six was argued as "at forty thousand a five-man pull was over
    // before the first breath out had ever landed". A five-man never buys the
    // breath out: its kit is the first three rungs, and the breath out is the
    // sixth. The smallest raid that meets it is a twenty-five man on heroic.
    // No amount of health puts that mechanic in a five-man pull.
    //
    // What the health actually decides is how long everyone stands in the
    // room, which for this boss is the whole bill -- see `sizeMechanic` below.
    // Measured across all six cells at forty pulls each, sixty thousand is
    // where the smallest raid clears at 95% and the twenty-five man normal,
    // which is the longest fight on the roster, sits at 65% with seven in ten
    // of the raid dead at the end of it.
    hp: 60000,
    enrage: 240,
    phaseTwoHp: 0.68,
    phaseThreeHp: 0.35,
    swingDamage: 560,
    slamDamage: 1200,
    // Low, because the air is already a raid-wide bill running the whole
    // fight. A tide on top of the blight is the same mechanic twice and the
    // healers cannot tell them apart.
    raidDamage: 70,
    mechanicDamage: 0.62,
    // Weighted toward the small rosters, which is the opposite of every other
    // boss here and is a fact about this one's kit. Three of its demands are
    // paid per body — the mark, the spore, the swelling — so a bigger raid
    // brings more hands to each of them, while the air and the breath out are
    // the same bill whoever turned up.
    //
    // The twenty-five is far below one, and that is the entry in this table
    // with a different meaning from every other. `MECHANIC_SCALES` says the
    // air is `false`: the room is the same room at any headcount. That is true
    // of one tick and false of one pull. The air is billed per body per
    // second, and a boss's health grows with the roster, so a twenty-five man
    // stands in it for 165 seconds where a five-man stands in it for 104. The
    // same room for sixty percent longer is not the same bill.
    //
    // Which is why the first attempt to fix this cell did nothing. Taking the
    // twenty-five from 1.0 to 0.85 -- a sixth off every mechanic it meets --
    // moved a nought percent cell to five. It is 0.65 because that is roughly
    // 104/165, and at 0.65 the cell reads 65%.
    //
    // The old row was 1.6/1.45/1.0 and no measurement of it existed: the
    // harness never printed a size table for this boss. See `SHARDS`.
    sizeMechanic: { 5: 1.25, 10: 1.1, 25: 0.65 },
    accent: '#84cc16',
    names: { slam: 'GORGE', shard: '', raid: 'BAD AIR' },
    // The air is the first rung rather than something outside the ladder, and
    // that is a compromise worth writing down.
    //
    // It is not really a rung: it is the room, and a five-man breathing
    // cleaner air than a twenty-five is a different fight wearing the same
    // name. `always` exists for exactly that and this fight was built on it —
    // but a ladder one short makes the last two settings identical, and
    // measured, twenty-five normal and twenty-five heroic came out the same
    // fight to the percentage point. Six rungs is three sizes by two
    // difficulties; a boss with five things to sell has nothing to sell on the
    // sixth.
    //
    // So the air is sold on the first rung, where the smallest raid buys it
    // anyway, and the fight every raid meets is the same fight. Getting a
    // seventh mechanic onto a boss needs the rung count itself to stop being
    // the same number for everybody, which is a change to how the whole
    // progression is indexed rather than a change to this fight.
    ladder: ['blight', 'bloat', 'vilegas', 'spore', 'inhale', 'pungent'],
    /**
     * Two thirds of the yardstick's radius, which is 45% of its floor.
     *
     * The only room in this game that is itself the mechanic. What this fight
     * does is drink the room's air and give it back, and "there is less of it
     * in here" has to be readable as a shape before it is readable as a
     * number. Every other room is described against the first one; this one is
     * *small*, and that word is the fight.
     *
     * The consequence is not free and is written here so it is not discovered
     * later: rule 5 in `docs/mechanic-rules.md` — area denial super-scales —
     * is written against a fixed floor, and at 45% of one, anything that eats
     * ground is worth about twice what the table says. This fight's ladder has
     * nothing on it that takes floor, which is why it is the one that can
     * afford to be small.
     */
    room: { kind: 'round', radius: 620 },
    /**
     * Two tables, behind the boss.
     *
     * Somewhere for a gathering to happen against. In a room this size,
     * "spread out" is expensive — rule 4, proximity mechanics anti-scale — and
     * what this fight asks for instead is that people come together, which
     * needs a place to come to.
     *
     * Behind rather than in front: the raid comes in at +y and a table between
     * the door and the boss narrows the one room in the game that is already
     * narrow. The numbers are up against the rules and deliberately so — 320
     * out with a radius of 95 leaves 225 to the middle, against a floor of
     * 210, and 205 to the wall against a lane of 64. `rendercheck` measures
     * both at all three raid sizes.
     */
    terrain: [
      { pos: { x: -320, y: -60 }, radius: 95 },
      { pos: { x: 320, y: -60 }, radius: 95 },
    ],
    /** Fine and flat: a room that is worked in rather than fought over. */
    floor: 'floor-slate',
    phases: {
      1: { swing: 2.1, slam: 17, puddleCount: 1, raid: 13, ...beats({ blight: 3.2, bloat: 11, vilegas: 17, spore: 24, inhale: 33, pungent: 116 }) },
      2: { swing: 1.9, slam: 15, puddleCount: 1, raid: 12, ...beats({ blight: 2.8, bloat: 10, vilegas: 15, spore: 21, inhale: 29, pungent: 102 }) },
      3: { swing: 1.7, slam: 13, puddleCount: 1, raid: 11, ...beats({ blight: 2.4, bloat: 9, vilegas: 13, spore: 18, inhale: 25, pungent: 88 }) },
    },
    opening: { slam: 12, raid: 14, ...beats({ blight: 3.5, bloat: 10, vilegas: 16, spore: 20, inhale: 30, pungent: 112 }) },
    lines: {
      phaseTwo: 'The air thickens',
      phaseThree: 'BREATHE IT ALL',
      instability: '',
      haul: '',
      cover: '',
      caustic: '',
      slime: '',
      rotation: '',
      gift: '',
      bleed: '',
      kin: '',
      suppress: '',
      bond: '',
      flight: '',
      crimson: '',
      thirst: '',
      ballast: '',
      nuclei: '',
      prison: '',
      hound: '',
      gather: '',
      decant: '',
      reagent: '',
      spray: '',
      infection: '',
      flood: '',
      engulf: '',
      siphon: '',
      spill: '',
      fester: '',
      champion: '',
      gorge: '',
      adds: '',
      coldflame: '',
      spike: '',
      blight: 'The room is going bad',
      inhale: 'It is drinking the air',
      pungent: 'IT IS GIVING IT BACK — GET COVERED',
      spore: 'Spore — get to them, all of you',
      vilegas: 'That reek spreads — off them',
      bloat: 'Nine on the tank — swap now',
      bonestorm: '',
      decay: '',
      frostbolt: '',
      volley: '',
      shade: '',
      insignificance: '',
      empower: '',
      dominate: '',
    },
  },
  {
    // The fourth fight, and the first one the raid can make worse.
    //
    // Everything else in this game bills at the instant it judges: a pool
    // takes what is standing in it and hands the floor back, a line of cold
    // takes what is on it and is over. Practice pays because a body that
    // reacted a tenth of a second sooner is outside the shape.
    //
    // This one bills later. Standing too close when a spill goes, letting what
    // walked in land a hit, leaving a wound to fester -- none of those kills
    // anybody. Each is a deposit into a bar on the boss, and when the bar
    // fills it buys something permanent: a mark on one of the raid that never
    // falls off, and five percent of the boss's health back if that body ever
    // goes down. A fight lost at three minutes was lost at forty seconds by
    // four people standing a little too close together.
    //
    // The warning that shaped it, from `docs/mechanic-rules.md` rule 1:
    // failure has to be binary at a single moment, and a gauge is a slope. So
    // the gauge is *not* a rung and must never be sold as one -- what the
    // ladder sells is the mark, which is an instant on a named body, and the
    // gauge is a modifier under the whole fight. The swelling is the
    // precedent: the stack is not the mechanic, what the top of the stack does
    // is.
    id: 'gorged',
    name: 'The Bloodgorged',
    short: 'Gorged',
    demand: 'give it nothing, and carry what it takes',
    /**
     * A little tighter than the yardstick, and open at the top of the spire.
     *
     * Two hundred and twenty-two thousand square units against the yardstick's
     * two hundred and sixty-six, which is 83% of a floor. The reason is the
     * gauge: one of the things that fills it is bodies standing together when
     * a spill goes, and a slightly tighter room makes that mistake slightly
     * more available. It is the last room of the lower spire and the one every
     * evening walks through, so it is also the room a player will know best.
     */
    room: { kind: 'round', radius: 840 },
    /**
     * Nothing standing in it, and that is the mechanic's doing.
     *
     * What walks in is the fight's clock -- every hit a beast lands fills the
     * gauge -- so how long it takes to reach somebody has to be a distance
     * rather than an accident of where a rock was rolled.
     */
    terrain: [],
    /**
     * Behind the boss, so what it summons has ground to cross.
     *
     * Coming in behind means a wave has to walk the length of the room to
     * reach the raid, and that walk is the only thing standing between the
     * gauge and the people filling it.
     */
    doors: [
      { pos: { x: -355, y: -761 } },
      { pos: { x: 355, y: -761 } },
    ],
    /** Open stone, worn smooth: the top of a spire rather than a hall. */
    floor: 'floor-cobble',
    hp: 56000,
    enrage: 240,
    phaseTwoHp: 0.7,
    // Lower than the usual third, because the last phase of this fight is
    // whatever the gauge has already bought. A boss that starts hitting harder
    // at forty percent on top of two marks it has been paid for is a fight
    // that ends in a wall rather than in a mistake.
    phaseThreeHp: 0.3,
    swingDamage: 600,
    slamDamage: 1250,
    raidDamage: 125,
    mechanicDamage: 0.9,
    // Lightest at five, and that is measured rather than reasoned.
    //
    // The argument for the other order was that the gauge's sources are events
    // a raid meets a fixed number of times, so a bigger roster brings more
    // hands to each of them. True, and outweighed by the thing this fight does
    // that no other does: nearly all of its bill lands on one named body at a
    // time -- a wound, a spill, a mark -- and a five-man has one healer to
    // answer all of them while a twenty-five has five. At 1.15 the five-man
    // heroic wiped with the boss at five percent in twelve pulls out of twelve
    // and the ten-man won every pull it played.
    sizeMechanic: { 5: 0.9, 10: 1.0, 25: 0.8 },
    // The gauge is the second rung rather than the first, and the reason is
    // worth writing down because the first draft had it the other way round.
    //
    // A gauge sold on rung one is a rung that asks nothing: it fills from
    // spills, from beasts and from wounds, and a five-man on normal has bought
    // none of those -- so the smallest raid met a boss that swings and does
    // nothing else, which is not a fight, and two bosses with nothing on the
    // floor at rung one are the same fight with different names.
    //
    // Sold on rung two it is the better version of its own idea. The raid
    // meets the spill first and learns to walk out of it; then it learns that
    // the ones it did not walk out of have been counted all along. Every rung
    // above adds another thing that pays into the same bar, which is the
    // escalation the fight is about.
    //
    // The swallowing is last for a reason that is not difficulty: it is
    // answered by a second tank, and a five-man does not have one. A rung
    // `kitCount(5, 'heroic')` cannot reach is the only honest place for a
    // mechanic the smallest roster cannot answer at all.
    ladder: ['spill', 'siphon', 'fester', 'adds', 'champion', 'gorge'],
    herald: null,
    accent: '#7f1d1d',
    names: { slam: 'RENDING BLOW', shard: '', raid: 'THE TAKING' },
    phases: {
      1: { swing: 2.0, slam: 16, puddleCount: 1, raid: 12, ...beats({ siphon: 20, spill: 14, fester: 30, adds: 42, champion: 75, gorge: 26 }) },
      2: { swing: 1.8, slam: 14, puddleCount: 1, raid: 11, ...beats({ siphon: 17, spill: 12, fester: 26, adds: 37, champion: 68, gorge: 23 }) },
      3: { swing: 1.6, slam: 12, puddleCount: 1, raid: 10, ...beats({ siphon: 15, spill: 10, fester: 22, adds: 32, champion: 60, gorge: 20 }) },
    },
    // The mark's opening is the floor under the gauge rather than a first
    // cast: nothing marks anybody in the first minute unless the raid fills
    // the bar, which is the whole point of it.
    opening: { slam: 13, raid: 13, ...beats({ siphon: 20, spill: 12, fester: 24, adds: 38, champion: 75, gorge: 30 }) },
    lines: {
      phaseTwo: 'It is heavier now',
      phaseThree: 'IT HAS TAKEN ENOUGH',
      instability: '',
      haul: '',
      cover: '',
      caustic: '',
      slime: '',
      rotation: '',
      gift: '',
      bleed: '',
      kin: '',
      suppress: '',
      bond: '',
      flight: '',
      crimson: '',
      thirst: '',
      ballast: '',
      nuclei: '',
      prison: '',
      hound: '',
      gather: '',
      decant: '',
      reagent: '',
      spray: '',
      infection: '',
      flood: '',
      engulf: '',
      siphon: 'It has had enough for now',
      spill: 'Blood on them — everybody off',
      fester: 'That wound is feeding it — close it',
      champion: 'That one is mine now',
      gorge: 'It has swallowed them — somebody else, hold it',
      adds: 'Blood beasts — put them down before they land a hit',
      coldflame: '',
      spike: '',
      blight: '',
      inhale: '',
      pungent: '',
      spore: '',
      vilegas: '',
      bloat: '',
      bonestorm: '',
      decay: '',
      frostbolt: '',
      volley: '',
      shade: '',
      insignificance: '',
      empower: '',
      dominate: '',
    },
  },
  {
    // The fifth fight, and the first one whose demand is not about where the
    // raid is standing.
    //
    // Every requirement in this game so far has been a fact about a body's own
    // position: off the line, behind it, inside the circle, away from each
    // other. Nothing has ever asked the raid to care where the things it is
    // fighting are standing relative to one another.
    //
    // This one is that and nothing else. Small things are born out of the raid
    // -- each one where a body was standing when its infection ended -- and two
    // that touch become one that is worth both. The fifth merging is not a body
    // any more; it is a radius. What the raid answers is not its own geometry
    // but theirs, and the two are connected by exactly one thing: where the
    // infected chose to be standing.
    id: 'confluence',
    name: 'The Confluence',
    short: 'Confluence',
    demand: 'mind where you are healed, and keep the small things apart',
    /**
     * Issue #30's room: two thirds of the yardstick's floor.
     *
     * Narrow on purpose, and the reason is the mechanic rather than the
     * scenery. What this fight asks is that two small things do not reach each
     * other, and in a wide room that does not happen by itself -- keeping them
     * apart in a big room is not a decision, it is a stroll. At 68% of a floor
     * the geometry closes on its own and the raid has to open it again.
     */
    room: { kind: 'round', radius: 760 },
    /**
     * One tank, against the wall.
     *
     * One rather than several, and that is the mechanic again: what the small
     * things are is a set of distances between each other, and a room full of
     * rocks decides those distances with its furniture. A single obstacle
     * gives the floor a direction without giving it a maze.
     */
    terrain: [{ pos: { x: 0, y: -560 }, radius: 110 }],
    /**
     * Two, on the raid's own side, and this is the only room in the citadel
     * where that is true.
     *
     * Everywhere else a wave comes in behind the boss so it has ground to
     * cross. Here the small things have to be born *among* the raid, because
     * two of them that walk the length of a room have already found each other
     * by the time anybody could have done anything about it.
     */
    doors: [
      { pos: { x: -540, y: 540 } },
      { pos: { x: 540, y: 540 } },
    ],
    /** A workshop floor: laid, drained, and about to be ruined. */
    floor: 'floor-clay',
    hp: 54000,
    enrage: 245,
    phaseTwoHp: 0.7,
    phaseThreeHp: 0.38,
    swingDamage: 580,
    slamDamage: 1180,
    raidDamage: 130,
    mechanicDamage: 0.92,
    // Lightest at five, which is the opposite of what this table usually says
    // and follows from where the fight's weight sits. Most of what this boss
    // does lands on one named body at a time -- a carrier, a small thing
    // walking at whoever made it -- and a five-man answers all of it with one
    // healer and three dealers. Written the other way round the smallest raid
    // won a pull in six while the ten-man won every one of them.
    sizeMechanic: { 5: 1.15, 10: 1.3, 25: 0.85 },
    // The spray is first because it is the only thing here a player has met
    // before, and a fight whose every rung is a new idea is a fight with no
    // way in. Everything above it is the one idea this boss is made of, added
    // a piece at a time: something to be born, something for it to walk to,
    // ground that makes fixing it late expensive, the merging itself, and
    // finally the boss eating what nobody cleared and handing the bill to the
    // tank.
    ladder: ['spray', 'infection', 'ooze', 'flood', 'merge', 'engulf'],
    /**
     * The room rises, at every size and difficulty.
     *
     * Carried rather than sold, because it is not this boss's idea -- it is
     * the sludgeworks, and the room is the room whoever walks into it. The
     * ladder is what the fight asks; this is where the fight happens.
     */
    always: ['slime'],
    herald: null,
    accent: '#4d7c0f',
    names: { slam: 'THE BIG ARM', shard: '', raid: 'THE SEEPING' },
    phases: {
      1: { swing: 2.1, slam: 17, puddleCount: 1, raid: 13, ...beats({ spray: 11, infection: 21, flood: 27, engulf: 7, slime: 24 }) },
      2: { swing: 1.9, slam: 15, puddleCount: 1, raid: 12, ...beats({ spray: 10, infection: 18, flood: 24, engulf: 6.5, slime: 21 }) },
      3: { swing: 1.7, slam: 13, puddleCount: 1, raid: 11, ...beats({ spray: 8, infection: 16, flood: 21, engulf: 6, slime: 18 }) },
    },
    // The infection is written slower than it plays, on purpose and against
    // the rule of thumb that a cadence is what a raid meets. A short kit is
    // paid back as tempo -- `kitCadence` runs a three-rung fight at five
    // eighths of the interval -- and this boss's three-rung kit is the
    // infection and two things that answer it, so the amplifier lands on the
    // one mechanic that carries the fight. Written at eighteen the smallest
    // raid met it every eleven seconds and lost nine pulls in ten.
    // Every row here is written about a fifth tighter than the numbers this
    // fight was first measured at, and the reason is the room rather than the
    // fight. Carrying the sludgeworks adds a mechanic to every kit, and a
    // longer kit runs at a slower tempo -- so the day the floor started rising
    // the whole boss slowed down by a fifth and went to a hundred percent at
    // every size with nobody dying. What `kitCadence` gives back for variety
    // has to be taken out of the table, or a room becomes a discount.
    opening: { slam: 13, raid: 14, ...beats({ spray: 10, infection: 19, flood: 26, engulf: 8, slime: 22 }) },
    lines: {
      phaseTwo: 'It is coming apart',
      phaseThree: 'ALL OF IT AT ONCE',
      instability: '',
      haul: '',
      cover: '',
      caustic: '',
      slime: 'The floor is coming up — off the edge',
      rotation: '',
      gift: '',
      bleed: '',
      kin: '',
      suppress: '',
      bond: '',
      flight: '',
      crimson: '',
      thirst: '',
      ballast: '',
      nuclei: '',
      prison: '',
      hound: '',
      gather: '',
      decant: '',
      reagent: '',
      spray: 'The arm is coming round — get behind it',
      infection: 'One of you is carrying it — pick your ground',
      flood: 'It is spreading — the floor is going slow',
      engulf: 'It is eating them — swap before eight',
      adds: '',
      coldflame: '',
      spike: '',
      blight: '',
      inhale: '',
      pungent: '',
      spore: '',
      vilegas: '',
      bloat: '',
      bonestorm: '',
      decay: '',
      frostbolt: '',
      volley: '',
      shade: '',
      insignificance: '',
      empower: '',
      dominate: '',
      siphon: '',
      spill: '',
      fester: '',
      champion: '',
      gorge: '',
    },
  },
  {
    // The sixth fight, and the first that asks for two answers on one clock.
    //
    // Both demands are ordinary on their own. Everybody stand in one circle is
    // a mechanic this game has had in one form or another since the start; one
    // of you keep walking, because the thing following you cannot be killed,
    // is not much stranger. Put them on the same clock and neither is ordinary
    // any more: the circle lands on the body being followed and slides after
    // them while it counts, so the quarry has to keep moving *and* stay
    // somewhere twenty-five people can reach, and the raid has to walk to a
    // point rather than to a place.
    //
    // Nothing else in this game asks for two answers at once. Everything
    // arrives one at a time, is answered, and is over.
    id: 'flasks',
    name: 'The Two Flasks',
    short: 'Flasks',
    demand: 'two answers at once, and neither of them waits',
    /**
     * Issue #32's room: wide, shallow, and with straight walls.
     *
     * The shape is the mechanic. In a circle the two answers push each other
     * to opposite sides and end up using the diameter, which is one number and
     * therefore one answer; in a hall that is wider than it is deep, splitting
     * left and right is the natural thing to do, and *which* side is a
     * different answer every time.
     */
    room: { kind: 'hall', halfWidth: 700, front: 1150, back: 700 },
    /**
     * Four benches, in two rows.
     *
     * The most terrain in the game, and it is here because this is the fight
     * with the most places a body may not be standing: a circle to reach, a
     * pool that stays for twelve seconds, and a flask nobody may be next to
     * when it goes. Furniture is what stops "walk to the middle" being the
     * answer to all three.
     */
    terrain: [
      { pos: { x: -400, y: -260 }, radius: 85 },
      { pos: { x: 400, y: -260 }, radius: 85 },
      { pos: { x: -400, y: 320 }, radius: 85 },
      { pos: { x: 400, y: 320 }, radius: 85 },
    ],
    /** A workshop, and the brightest room in the building. */
    floor: 'floor-slate',
    hp: 58000,
    enrage: 250,
    phaseTwoHp: 0.68,
    phaseThreeHp: 0.34,
    swingDamage: 560,
    slamDamage: 1150,
    raidDamage: 105,
    mechanicDamage: 0.72,
    // Lightest at five, the way the last two bosses' rows are and for the same
    // reason: nearly everything here lands on one named body -- a pool under
    // somebody, a thing following somebody -- and a five-man answers all of it
    // with one healer. Written at 1.2 the smallest raid wiped in every pull
    // with the boss at a quarter, while the ten-man won every one of them.
    sizeMechanic: { 5: 0.85, 10: 1.25, 25: 1.0 },
    // The order is the argument. The pool is first because it is the only
    // familiar thing here; the hound second, because the fight's idea needs
    // something to be followed before it can put a circle on it; the gathering
    // third, which is an ordinary circle until the fourth rung arrives.
    //
    // The fourth is the fight. Bought, the circle stops landing on the middle
    // of the raid and lands on the body being followed, and slides after them
    // for the whole five-second count -- so the quarry has to keep walking and
    // stay reachable at the same time, and everybody else has to walk to a
    // point rather than to a place. It has no cadence: it is the same instant
    // as the rung below it, asking for something else.
    //
    // Above that: the flasks, which are the one demand here answered by being
    // early rather than by reacting, and the reagent, which is the swap.
    ladder: ['caustic', 'hound', 'gather', 'chase', 'decant', 'reagent'],
    herald: null,
    accent: '#a3e635',
    names: { slam: 'THE HEAVY FLASK', shard: '', raid: 'FUMES' },
    phases: {
      1: { swing: 2.1, slam: 17, puddleCount: 1, raid: 12, ...beats({ caustic: 15, hound: 38, gather: 38, chase: 38, decant: 46, reagent: 10 }) },
      2: { swing: 1.9, slam: 15, puddleCount: 1, raid: 11, ...beats({ caustic: 13, hound: 34, gather: 34, chase: 34, decant: 41, reagent: 9 }) },
      3: { swing: 1.7, slam: 13, puddleCount: 1, raid: 10, ...beats({ caustic: 11, hound: 30, gather: 30, chase: 30, decant: 36, reagent: 8 }) },
    },
    opening: { slam: 14, raid: 13, ...beats({ caustic: 14, hound: 36, gather: 36, chase: 36, decant: 44, reagent: 11 }) },
    lines: {
      phaseTwo: 'The second flask',
      phaseThree: 'BOTH OF THEM, THEN',
      instability: '',
      haul: '',
      cover: '',
      slime: '',
      rotation: '',
      gift: '',
      bleed: '',
      kin: '',
      suppress: '',
      bond: '',
      flight: '',
      crimson: '',
      thirst: '',
      ballast: '',
      nuclei: '',
      prison: '',
      caustic: 'Glass on the floor — off it',
      hound: 'It has picked one of you — keep walking',
      gather: 'On them, all of you, now',
      decant: 'Two on the floor — do not be standing there',
      reagent: 'It is drinking — swap at six',
      adds: '',
      coldflame: '',
      spike: '',
      blight: '',
      inhale: '',
      pungent: '',
      spore: '',
      vilegas: '',
      bloat: '',
      bonestorm: '',
      decay: '',
      frostbolt: '',
      volley: '',
      shade: '',
      insignificance: '',
      empower: '',
      dominate: '',
      siphon: '',
      spill: '',
      fester: '',
      champion: '',
      gorge: '',
      spray: '',
      infection: '',
      flood: '',
      engulf: '',
    },
  },
  {
    // The seventh fight, and the first that asks what the raid is hitting.
    //
    // Every target demand in this game has been "hit that as well" -- a wave,
    // a spike -- or "do not hit that" -- one of your own, turned. This one is
    // *is the thing I am hitting the thing I should be hitting*, and the
    // answer changes every forty-five seconds.
    //
    // Three bodies and one of them is real. The other two take nothing at all
    // -- not less, nothing -- because a ninety percent cut is answered by
    // carrying on and losing a tenth, and nothing at all is answered by
    // looking up. And the two that cannot be hurt are not idle: they drink
    // from whoever stands near them and give it to the shared bar, so where
    // the raid may stand moves with the crown.
    id: 'crowns',
    name: 'The Three Crowns',
    short: 'Crowns',
    demand: 'only one is real, and it is not the one you are hitting',
    /**
     * Issue #33's room: a long hall with three stations in it.
     *
     * The distance between the stations is the mechanic and it belongs to the
     * room. Nine hundred units apart is four times a caster's reach and about
     * five seconds of walking, which is what makes moving between them a cost
     * rather than a turn of the head.
     */
    room: { kind: 'hall', halfWidth: 620, front: 1400, back: 560 },
    // An equal triangle with a side of seven hundred, which is what the
    // measurement left of the room's first answer.
    //
    // Nine hundred apart is four times a caster's reach and about five seconds
    // of walking, and at three rungs the crown comes round every twenty-eight
    // seconds -- so a five-man spent a fifth of the fight on its feet, casting
    // nothing, and won none of forty pulls. Seven hundred is still a crossing
    // and still costs a cast; it is not a fight spent walking.
    //
    // Equal sides rather than the room's own shape, because which of the three
    // it moves to is rolled: two that are close and one that is far would make
    // a third of the rotations free and a third of them brutal.
    stands: [
      { x: -350, y: 202 },
      { x: 350, y: 202 },
      { x: 0, y: -404 },
    ],
    /** Coffins stood on end, two rows down the sides. */
    terrain: [
      { pos: { x: -470, y: -180 }, radius: 75 },
      { pos: { x: 470, y: -180 }, radius: 75 },
      { pos: { x: -470, y: 700 }, radius: 75 },
      { pos: { x: 470, y: 700 }, radius: 75 },
    ],
    /** Dark stone under red cloth. */
    floor: 'floor-slate',
    // Five thousand under the roster's usual, and it buys the same fight in less
    // time on purpose. Much of this fight's damage is spent walking between
    // three stations or thrown at a body that cannot be hurt, so a bar sized
    // like everybody else's is a bar the raid is still chewing when the enrage
    // arrives -- the sweep found it as a pull that neither won nor wiped at
    // three hundred and ten seconds.
    //
    // It is a steep number: at forty-six thousand every cell came out at 93%
    // or better, because a shorter fight is also fewer seconds of standing in
    // the thirst. Fifty-one is where the top rung still costs something.
    hp: 51000,
    enrage: 250,
    phaseTwoHp: 0.7,
    phaseThreeHp: 0.35,
    swingDamage: 560,
    slamDamage: 1150,
    raidDamage: 110,
    mechanicDamage: 0.75,
    // Far lighter at the small sizes than any other row on the roster, and it
    // is the fight's shape rather than its numbers that asks for it. A crossing
    // costs a caster its cast whatever the headcount, so a five-man loses a
    // fifth of its damage to the same walk a twenty-five man loses a
    // twenty-fifth of -- and then has one healer to answer everything the walk
    // did not stop. At the usual weights the smallest raid won one pull in ten.
    sizeMechanic: { 5: 0.55, 10: 0.75, 25: 0.95 },
    // The crown is first because without it there is no fight here, only three
    // statues; the thirst second because it is what makes the other two
    // bodies places rather than scenery. Then the ballast, which is the first
    // thing in this fight to want the same hands the crown does; the grain,
    // which is the tank's errand; the stillness, which is the one demand in
    // the game answered by not walking; and the wave, which is this fight's
    // fourth target call.
    ladder: ['rotation', 'thirst', 'ballast', 'nuclei', 'prison', 'adds'],
    herald: null,
    accent: '#be123c',
    names: { slam: 'THE RED HOUR', shard: '', raid: 'THE COURT' },
    phases: {
      1: { swing: 2.1, slam: 17, puddleCount: 1, raid: 12, ...beats({ rotation: 50, thirst: 45, ballast: 40, nuclei: 20, prison: 55, adds: 48 }) },
      2: { swing: 1.9, slam: 15, puddleCount: 1, raid: 11, ...beats({ rotation: 45, thirst: 40, ballast: 36, nuclei: 18, prison: 49, adds: 43 }) },
      3: { swing: 1.7, slam: 13, puddleCount: 1, raid: 10, ...beats({ rotation: 40, thirst: 35, ballast: 32, nuclei: 16, prison: 43, adds: 38 }) },
    },
    // The first crown comes at thirty rather than at forty-five, because a
    // raid that has not seen one does not know what fight it is in -- and a
    // short pull would end without it ever having moved.
    opening: { slam: 14, raid: 13, ...beats({ rotation: 35, thirst: 45, ballast: 38, nuclei: 19, prison: 52, adds: 46 }) },
    lines: {
      phaseTwo: 'Another of us, then',
      phaseThree: 'ALL THREE, AND NONE OF YOU',
      instability: '',
      haul: '',
      cover: '',
      gift: '',
      bleed: '',
      kin: '',
      suppress: '',
      bond: '',
      flight: '',
      crimson: '',
      rotation: 'The crown is moving — look up',
      thirst: 'It drinks from whoever is close',
      ballast: 'It is coming down — put it back up',
      nuclei: 'A grain — somebody take it',
      prison: 'Be still',
      adds: 'The court answers',
      coldflame: '',
      spike: '',
      blight: '',
      inhale: '',
      pungent: '',
      spore: '',
      vilegas: '',
      bloat: '',
      bonestorm: '',
      decay: '',
      frostbolt: '',
      volley: '',
      shade: '',
      insignificance: '',
      empower: '',
      dominate: '',
      siphon: '',
      spill: '',
      fester: '',
      champion: '',
      gorge: '',
      spray: '',
      infection: '',
      flood: '',
      engulf: '',
      caustic: '',
      slime: '',
      hound: '',
      gather: '',
      decant: '',
      reagent: '',
    },
  },
  {
    // The eighth fight, and the first handoff in this game with its sign
    // flipped.
    //
    // Every weight that has ever changed hands here was a debt: somebody takes
    // it because it has to be taken. This one makes the body holding it
    // stronger, and passing it leaves *both* of them holding one -- so the
    // raid's own success is what fills the room, and the last rung charges for
    // exactly that. How many to run is a decision the raid makes and then pays
    // for on a thirty-three second clock.
    //
    // And if one is dropped, it does not explode. One of the raid turns.
    id: 'gift',
    name: 'The Crimson Gift',
    short: 'Gift',
    demand: 'pass it and it doubles; drop it and it is one of you',
    /**
     * Issue #34's room: a plain circle with nothing standing in it.
     *
     * The one room in the citadel with no terrain at all, and the absence is
     * the point: this fight is about where bodies are relative to each other
     * -- who is near enough to be passed to, who is too far from their partner
     * -- and furniture in the middle of that is a third party deciding the
     * distances.
     */
    room: { kind: 'round', radius: 800 },
    terrain: [],
    /** Red stone, and a balcony that is a painting rather than a place. */
    floor: 'floor-slate',
    hp: 52000,
    // The shortest clock on the roster, and it is the flight that decides it:
    // fourteen seconds with nothing to hit, four times a pull, is fifty-six
    // seconds of a raid doing no damage at all.
    enrage: 230,
    phaseTwoHp: 0.7,
    phaseThreeHp: 0.35,
    swingDamage: 570,
    slamDamage: 1180,
    // High, because the aura this fight runs on is always up and cannot be
    // dodged: what the healers are answering here is a floor rather than a
    // series of instants.
    // Low, and it is the second fight here to want that for the same reason the
    // Host does: the floor under the healers is already a mechanic. Fourteen
    // seconds of flight is a raid-wide bill nobody can dodge, and the crimson
    // is another one on a thirty-three second clock -- a tide on top of those
    // is the same demand three times, and the healers cannot tell them apart.
    raidDamage: 70,
    mechanicDamage: 0.7,
    sizeMechanic: { 5: 1.25, 10: 1.0, 25: 0.85 },
    // The gift first, because nothing else here means anything without it. The
    // bond second, because it is what makes the gift a decision rather than a
    // walk: one says go and find somebody clean, the other says do not leave
    // your partner. Then the floor the raid's own passing leaves, the flight,
    // the body that turns when a gift is dropped -- which is the same mechanic
    // the Whisper owns saying a different sentence, because there a clock
    // takes somebody and here *the raid lost one* -- and finally the bill for
    // all of it.
    ladder: ['gift', 'bond', 'stain', 'flight', 'turning', 'crimson'],
    herald: null,
    accent: '#e11d48',
    names: { slam: 'THE RED HAND', shard: '', raid: 'THE COURT BLEEDS' },
    phases: {
      1: { swing: 2.1, slam: 17, puddleCount: 1, raid: 13, ...beats({ gift: 18, bond: 26, flight: 52, crimson: 33 }) },
      2: { swing: 1.9, slam: 15, puddleCount: 1, raid: 12, ...beats({ gift: 17, bond: 23, flight: 46, crimson: 29 }) },
      3: { swing: 1.7, slam: 13, puddleCount: 1, raid: 11, ...beats({ gift: 16, bond: 20, flight: 40, crimson: 25 }) },
    },
    // The crimson opens well before the first flight rather than on top of it.
    //
    // Two unavoidable raid-wide bills in the same second is not a harder
    // fight, it is a wipe with two names: at thirty-one the first crimson
    // landed inside the first landing and took a twenty-five man from
    // fifty-four percent to twenty-eight in one tick.
    opening: { slam: 14, raid: 14, ...beats({ gift: 18, bond: 24, flight: 50, crimson: 22 }) },
    lines: {
      phaseTwo: 'Take it, all of you',
      phaseThree: 'IT IS EVERYWHERE NOW',
      instability: '',
      haul: '',
      cover: '',
      bleed: '',
      kin: '',
      suppress: '',
      gift: 'A gift — carry it, then give it away',
      bond: 'Two of you are bound — stay together',
      flight: 'She is up — nothing to hit',
      crimson: 'All of it back at once',
      dominate: '',
      adds: '',
      coldflame: '',
      spike: '',
      blight: '',
      inhale: '',
      pungent: '',
      spore: '',
      vilegas: '',
      bloat: '',
      bonestorm: '',
      decay: '',
      frostbolt: '',
      volley: '',
      shade: '',
      insignificance: '',
      empower: '',
      siphon: '',
      spill: '',
      fester: '',
      champion: '',
      gorge: '',
      spray: '',
      infection: '',
      flood: '',
      engulf: '',
      caustic: '',
      slime: '',
      hound: '',
      gather: '',
      decant: '',
      reagent: '',
      rotation: '',
      thirst: '',
      ballast: '',
      nuclei: '',
      prison: '',
    },
  },
  {
    // The ninth fight, and the only one in this game that is not a fight.
    //
    // The thing in the middle is not an enemy. It is dying, and the pull is
    // won when its bar reaches the top rather than the bottom -- so everything
    // that walks in is a wave, and the boss is a clock running the other way.
    //
    // It is the one encounter here that could not have been made by adding
    // mechanics to the table: the victory condition itself had to become a
    // parameter, and the phases had to stop reading health and start reading
    // the clock. Both are small changes and both were worth making -- nothing
    // else on this roster gets harder because time passed.
    id: 'saved',
    name: 'The One You Save',
    short: 'Saved',
    demand: 'the thing in the middle is not the enemy, and it is running out of time',
    saving: true,
    /**
     * Issue #35's room: a circle with something in the middle of it.
     *
     * Every other room in this game is empty in the centre because the centre
     * is where the boss stands and the raid stands around it. Here the centre
     * is the fight -- the wound opens on it and the raid has to walk *in* --
     * so the room is written around a middle that is occupied.
     */
    room: { kind: 'round', radius: 700 },
    terrain: [],
    /** Wet stone and moss, which is the first green floor in the citadel. */
    floor: 'floor-earth',
    // What it has left, and it starts at half of it. See `MENDING_START`.
    hp: 40000,
    // Shorter than the issue asked for, and the shortest on the roster.
    //
    // This fight has no wipe in it -- nothing here kills anybody, and every
    // cell of it ends with the raid standing -- so the clock is the entire
    // difficulty. At two hundred and sixty seconds against a climb that takes
    // about a hundred and thirty, every size finished with a minute to spare
    // and the six cells read a hundred percent. What the raid is actually
    // racing is how much of the climb the wound takes back, and the clock is
    // what makes that a race rather than an arithmetic exercise.
    enrage: 190,
    // Unused: the phases here turn on the clock. Kept at the roster's usual
    // values rather than at nought so that nothing reading them divides by
    // zero, and `advancePhase` never asks.
    phaseTwoHp: 0.7,
    phaseThreeHp: 0.35,
    // It does not swing and it does not slam. Nothing about this fight is the
    // thing in the middle doing something to the raid.
    swingDamage: 0,
    slamDamage: 0,
    // The room bills instead, and it is the only thing here that does: what
    // the healers are answering is the place rather than the patient.
    raidDamage: 90,
    mechanicDamage: 0.85,
    // Steep from five to ten and then almost flat, which is not what it was
    // written as and is what it had to become. The intention was a race in
    // which a bigger raid answers with speed -- more hands in the wound -- so
    // the same drain could be sold four times over at twenty-five. It cannot:
    // `BLEED_HANDS` caps the wound at four pairs of hands on purpose, so a
    // twenty-five man closes it at exactly a ten-man's rate. What the extra
    // fifteen bodies actually buy is more of the ones that came to help and
    // more damage on the thing blocking the mending, and both are small.
    //
    // At 1.2 the twenty-five man climbed to eighty-two percent and stopped:
    // the drain ate the whole climb, and both of its cells read nought over
    // forty pulls. Read against the ten-man's climb rate the ceiling is about
    // 0.85, and this sits on it rather than under it -- at 0.78 both cells
    // came back at a hundred percent, and the top of the ladder should cost
    // something. It does: the heroic twenty-five is the one cell of the six
    // that a first pull does not always take.
    sizeMechanic: { 5: 0.3, 10: 0.7, 25: 0.85 },
    // The wave is the first rung and it is deliberately cheap: it is the only
    // thing in this fight that touches the raid at all, and it is documented
    // as teaching nothing on its own -- which is right here, because it is the
    // floor the rest of the ladder stands on rather than an idea of its own.
    //
    // Then the one that came back wrong, the wound, the one that came to help
    // and must not be killed, the way out, and the thing that stops the
    // mending. The last two rungs are the fight's argument: one asks the raid
    // to spend a body's existence for later, and the other moves "what should
    // I be hitting" from what is hurting the raid to what is stopping the bar.
    // The wound first, not the wave -- and that is a change from what the
    // issue asked for, made by a rule the issue could not see.
    //
    // No two fights here may open on the same thing: the first rungs are what
    // the smallest raid meets, and a five-man that met the same wave on two
    // bosses would be playing one boss twice. The Whisper carries a wave at
    // every setting, so this one cannot start with one. What it starts with
    // instead is better anyway: the wound is this fight's own idea, and the
    // smallest raid now meets the inversion on its first pull rather than
    // meeting a wave and waiting.
    ladder: ['bleed', 'kin', 'portal', 'adds', 'empower', 'suppress'],
    herald: null,
    accent: '#22c55e',
    names: { slam: '', shard: '', raid: 'THE WELL' },
    phases: {
      1: { swing: 2, slam: 0, puddleCount: 1, raid: 13, ...beats({ adds: 30, empower: 62, bleed: 48, kin: 70, portal: 45, suppress: 58 }) },
      2: { swing: 2, slam: 0, puddleCount: 1, raid: 12, ...beats({ adds: 26, empower: 55, bleed: 41, kin: 60, portal: 45, suppress: 50 }) },
      3: { swing: 2, slam: 0, puddleCount: 1, raid: 11, ...beats({ adds: 22, empower: 45, bleed: 34, kin: 48, portal: 45, suppress: 42 }) },
    },
    // The wound is written half again as slow as it plays, and the reason is
    // the tempo rather than the wound. A short kit is paid back as speed --
    // `kitCadence` runs a three-rung fight at five eighths of the interval --
    // and the three rungs the smallest raid buys here are the wave, the one
    // that came back wrong, and the wound. So the amplifier lands on the one
    // mechanic that drains the bar, and at thirty-four the five-man met it
    // every twenty-one seconds and finished no pull at all.
    opening: { slam: 0, raid: 14, ...beats({ adds: 20, empower: 50, bleed: 42, kin: 55, portal: 30, suppress: 55 }) },
    lines: {
      phaseTwo: 'It is fading',
      phaseThree: 'HOLD ON',
      instability: '',
      haul: '',
      cover: '',
      adds: 'They are coming for it',
      empower: 'One of them is wrong — that one first',
      bleed: 'It is bleeding — get in there',
      kin: 'That one is with us — leave it',
      suppress: 'That thing is stopping us — kill it',
      coldflame: '',
      spike: '',
      blight: '',
      inhale: '',
      pungent: '',
      spore: '',
      vilegas: '',
      bloat: '',
      bonestorm: '',
      decay: '',
      frostbolt: '',
      volley: '',
      shade: '',
      insignificance: '',
      dominate: '',
      siphon: '',
      spill: '',
      fester: '',
      champion: '',
      gorge: '',
      spray: '',
      infection: '',
      flood: '',
      engulf: '',
      caustic: '',
      slime: '',
      hound: '',
      gather: '',
      decant: '',
      reagent: '',
      rotation: '',
      thirst: '',
      ballast: '',
      nuclei: '',
      prison: '',
      gift: '',
      bond: '',
      flight: '',
      crimson: '',
    },
  },
  {
    // The tenth, and the two things it asks for are things this game has
    // never asked for.
    //
    // Everything else here is answered by where a body is standing: get off
    // the line, get behind it, come in, spread out. This one asks a body to
    // *stop pressing buttons* while a mark is on it, and it asks a raid that
    // is winning to walk out of the fight it is winning and come back later.
    // Neither is a place. Both are decisions about time.
    id: 'cold',
    name: 'The Long Cold',
    short: 'Cold',
    demand: 'do nothing while it is on you, and know when to walk out of a fight that is going well',
    /**
     * Issue #36's room, and the room is the premise of two of the rungs.
     *
     * Eight hundred and forty across, which is the widest circle on the
     * roster. A fight that tells the raid to withdraw needs somewhere to
     * withdraw *to*, and the wash needs room for shadows four hundred long to
     * fall into. A mechanic whose answer does not fit in the room is not a
     * hard mechanic, it is an unanswerable one -- and the reach the last rung
     * asks a body to step outside of is three hundred rather than the four
     * hundred and twenty it was written as, for a reason that is about this
     * game's own numbers rather than about this fight. See `BUFFET_REACH`.
     */
    room: { kind: 'round', radius: 840 },
    terrain: [],
    /** Pale grit under frost, and the only floor on the roster nothing uses. */
    floor: 'floor-sand',
    hp: 45000,
    enrage: 280,
    phaseTwoHp: 0.65,
    // The last third is where the cold bites -- it turns every six seconds
    // there against every twenty in the first phase -- so the last third is
    // the fight's actual question and the first two are where the raid learns
    // enough to answer it.
    phaseThreeHp: 0.35,
    swingDamage: 620,
    slamDamage: 1300,
    // The floor of this fight. Written at a hundred and sixty on the argument
    // that the last rung multiplies magic damage taken and a multiplier on
    // nothing is nothing -- which is true and was still forty too high: at a
    // hundred and sixty the five-man died in a hundred seconds with the boss
    // at a quarter, before any of that ever came up.
    raidDamage: 88,
    mechanicDamage: 0.68,
    // Anti-scaled, which is what a fight made of a radius and a band should
    // be: neither the drag nor the cold is measured in bodies, so a bigger
    // raid meets the same two of them with more people to spare. Steeper than
    // it was written, and the reason is the two rungs a twenty-five man is the
    // only raid to buy: the wash bills whoever is not in a shadow, and there
    // are three shadows at that size whatever anybody does.
    sizeMechanic: { 5: 1.1, 10: 1.0, 25: 0.7 },
    // The chill, the mark, the drag, the coffin, the shadow it casts, and the
    // cold. The coffin is the one borrowed rung on this ladder and it is
    // borrowed for the rung above it: here a coffin is a prison and a wall,
    // and when to break one is the fight's only target call.
    ladder: ['chill', 'instability', 'haul', 'spike', 'cover', 'buffet'],
    always: [],
    herald: null,
    accent: '#a5f3fc',
    names: { slam: 'THE COLD HAND', shard: '', raid: 'THE LONG WINTER' },
    phases: {
      1: { swing: 2.1, slam: 16, puddleCount: 1, raid: 14, ...beats({ chill: 2.4, instability: 26, haul: 19, spike: 26, cover: 40, buffet: 20 }) },
      2: { swing: 1.9, slam: 14, puddleCount: 1, raid: 13, ...beats({ chill: 2.0, instability: 22, haul: 16, spike: 23, cover: 30, buffet: 12 }) },
      3: { swing: 1.7, slam: 12, puddleCount: 1, raid: 12, ...beats({ chill: 1.6, instability: 19, haul: 13, spike: 20, cover: 26, buffet: 6 }) },
    },
    // The cold turns every fourteen seconds in the first phase and every six
    // in the last, which is also not what the issue asked for -- it asked for
    // nothing at all until the third. Two separate checks in this repo take
    // the same line about that, and they are right: a rung a raid *bought* and
    // never meets is a rung that was not sold. So it is there from the start
    // and slow, and the last third is still where it decides the fight, since
    // six seconds is two and a third times the rate of fourteen.
    //
    // The wash opens at thirty-four and runs at forty in the first phase,
    // which is not what the issue asked for -- it asked for nothing at all
    // until the second. A mechanic this table announces has to have a cadence
    // in every phase, or the check that says "every announced mechanic comes
    // round sooner as the fight goes on" has a hole in it exactly where a
    // phase-gated mechanic sits. So it is rare rather than absent, and the
    // opening is what keeps the first two minutes recognisably the fight the
    // issue described.
    opening: { slam: 12, raid: 15, ...beats({ chill: 0, instability: 20, haul: 17, spike: 22, cover: 34, buffet: 8 }) },
    lines: {
      phaseTwo: 'The cold gets in',
      instability: 'You are coming apart — hands off',
      haul: 'It is dragging us in',
      cover: 'Behind the ice, all of you',
      phaseThree: 'NOTHING WARM LEAVES HERE',
      spike: 'Ice through the floor — cut them out',
      adds: '',
      coldflame: '',
      blight: '',
      inhale: '',
      pungent: '',
      spore: '',
      vilegas: '',
      bloat: '',
      bonestorm: '',
      decay: '',
      frostbolt: '',
      volley: '',
      shade: '',
      insignificance: '',
      empower: '',
      dominate: '',
      siphon: '',
      spill: '',
      fester: '',
      champion: '',
      gorge: '',
      spray: '',
      infection: '',
      flood: '',
      engulf: '',
      caustic: '',
      slime: '',
      rotation: '',
      thirst: '',
      ballast: '',
      nuclei: '',
      prison: '',
      gift: '',
      bond: '',
      flight: '',
      crimson: '',
      bleed: '',
      kin: '',
      suppress: '',
      hound: '',
      gather: '',
      decant: '',
      reagent: '',
    },
  },
]

export const FIRST_ENCOUNTER = 0

/**
 * How many rungs of a boss's ladder tonight's raid actually meets.
 *
 * Two axes, one rung each, and both of them monotone: a bigger raid meets
 * more of the fight, and heroic meets one more than normal at the same size.
 *
 *   5 normal 2 · 5 heroic 3 · 10 normal 3 · 10 heroic 4 · 25 normal 4 · 25 heroic 5
 *
 * The size rungs are the honest half. Every mechanic in here already scales
 * its *volume* with the headcount — puddles per cast, spread marks, add waves
 * — which made a twenty-five man the same fight arriving in bigger pieces. It
 * is not: a raid of twenty-five has the bodies to answer a mechanic a
 * five-man cannot even be asked, which is the reason the size exists at all.
 *
 * Heroic is the half that was missing outright. It was twenty-two percent more
 * health and nothing else, so the honest description of it was "the same fight
 * for longer" — and the difficulty button said so, in those words. A rung
 * costs the raid something a health bar never can.
 */
export function kitCount(size: number, difficulty: DifficultyId, owns = 6): number {
  // Three, so that the smallest fight anybody can buy is still a fight. Two
  // rungs meant a five-man on normal met one mechanic and its pair, and the
  // ladder above it was five steps of adding one thing to a fight that had
  // barely started -- which is also why two of the six rungs used to buy
  // bodies without buying an idea.
  //
  // `owns` is how many the boss has, and it used to be six for everybody
  // because six is how many settings there are: three sizes by two
  // difficulties. That made the number of ideas a fight is allowed to hold a
  // fact about the progression rather than about the fight, and it cut both
  // ways -- a boss with seven had nowhere to put the seventh, and a boss with
  // four had two settings that sold nothing.
  //
  // So what a step buys scales with what there is to sell. The three axes
  // still buy the same three steps in the same order; each step is just worth
  // a third of whatever is above the floor of three. At six that is one a
  // step, which is exactly what this returned before and returns still. At
  // nine it is two, and at three it is none -- a fight small enough that
  // everyone meets all of it, which is the right shape for the boss a raid
  // meets first.
  //
  // Three, or the whole boss if it has fewer.
  //
  // Three was a cap wearing a floor's clothes while it was written as the
  // constant: a fight with two ideas had one setting selling both and five
  // selling nothing. Taking the constant out is right; replacing it with half
  // the boss was not, and the first boss is where that showed. It owns three
  // and its own spec says every setting sells all three — a five-man meets the
  // whole fight, because what is being unlocked there is the player — and half
  // of three is two, so the smallest raid stopped being sold the storm, which
  // is the third of its three ideas.
  //
  // Bounded by what there is rather than fixed at what there used to be. A
  // fight with one sells it to everybody; a fight with twelve still opens on
  // three and climbs to twelve.
  const floor = Math.min(owns, 3)
  const step = (owns - floor) / 3
  let bought = floor
  if (size >= 10) bought += step
  if (size >= 25) bought += step
  if (difficulty === 'heroic') bought += step
  return Math.min(owns, Math.round(bought))
}

/**
 * Mechanics that are half a mechanic without another one.
 *
 * Most of this game's vocabulary is independent: a pool and a cone know
 * nothing about each other, and a fight that buys one and not the other is
 * still a fight. Three of the blight's are not like that. The breath in is the
 * boss drinking the room's air, so without the air it drinks nothing; the
 * breath out is everything it drank, so without the breath in it returns
 * nothing; and the breath out is lethal to a raid that was never inoculated,
 * so without the spore it is not a mechanic, it is a wipe on a timer.
 *
 * Written here rather than left to the ladder's ordering. A ladder is
 * arranged so the prerequisite comes first -- these ones are -- but a ladder
 * is not bought whole: `kitCount` buys the first few rungs by size and
 * difficulty, and `always` adds mechanics from outside the ordering
 * altogether. Neither of those can see that the breath out needs the air.
 */
const REQUIRES: Partial<Record<MechanicId, MechanicId[]>> = {
  inhale: ['blight'],
  // The gathering without something to gather *on* is an ordinary circle
  // dropped on the middle of the raid, which is a mechanic a crowd answers by
  // standing still. What makes it this fight's is that its centre is the body
  // being followed -- so a kit that bought the circle and not the hound would
  // be a kit that bought half of the only idea here.
  gather: ['hound'],
  // And the chase is a rule about that circle, so it needs both halves of it.
  chase: ['hound', 'gather'],
  // The gift's two consequences -- blood where it was doubled, and a body that
  // turns when it was dropped -- are deliberately *not* here, though the issue
  // asked for them. `REQUIRES` is global: an entry saying the turned body
  // needs the gift would hand the gift to the Whisper, which owns the turned
  // body and has never seen a gift in its life. What guarantees it instead is
  // the ladder's own order, which is what guarantees it for every other pair
  // of rungs in this game: a kit is a prefix, so a raid that bought the fifth
  // rung bought the first.
  pungent: ['blight', 'inhale', 'spore'],
  // One of the wave, come back wrong. Without a wave there is nothing for it
  // to be one of: it is not a summon of its own, it is a fact about one that
  // was already coming.
  empower: ['adds'],
  // The shadow is cast by a coffin, so a kit with the wash and no coffins is
  // a room-wide bill with nowhere to stand. This is safe in the direction
  // `REQUIRES` is dangerous in: an entry pulls a prerequisite *in*, so the
  // first boss, which owns coffins and has never seen the cold, is untouched.
  cover: ['spike'],
}

/**
 * A set of mechanics with everything they lean on pulled in beside them.
 *
 * Applied wherever a kit is decided, so there is one answer to "what does this
 * fight throw" rather than one per caller.
 */
export function withRequired(kit: readonly MechanicId[]): MechanicId[] {
  const out = [...kit]
  // A queue rather than a pass, so a prerequisite that has prerequisites of
  // its own is pulled in too. Nothing here is more than one deep today, and a
  // rule that only works while that is true is a rule that breaks silently
  // the day somebody adds a third breath.
  for (let i = 0; i < out.length; i++) {
    for (const need of REQUIRES[out[i]!] ?? []) {
      if (!out.includes(need)) out.push(need)
    }
  }
  return out
}

/** Which mechanics this boss throws at this size and difficulty. */
export function encounterKit(
  encounter: Encounter,
  size: number,
  difficulty: DifficultyId,
): MechanicId[] {
  return withRequired([
    ...(encounter.always ?? []),
    ...encounter.ladder.slice(0, kitCount(size, difficulty, encounter.ladder.length)),
  ])
}

/**
 * The part of the kit a pull that got this far has been shown.
 *
 * The kit is what the fight would throw given the whole timeline; a raid that
 * wiped in the first phase has not been shown the thing that only turns up in
 * the third, and a page that told them they had met it would be teaching the
 * fight wrong. So the phase reached is the second half of the question, and a
 * mechanic counts as met once the fight has reached a phase that names it.
 *
 * Read off the same tables the scheduler reads, so it cannot claim a mechanic
 * the boss has no cadence for.
 */
export function kitThrough(
  encounter: Encounter,
  size: number,
  difficulty: DifficultyId,
  phase: number,
): MechanicId[] {
  const kit = encounterKit(encounter, size, difficulty)
  return kit.filter((id) =>
    Object.entries(encounter.phases).some(
      ([at, timing]) => Number(at) <= phase && (timing[id] ?? 0) > 0,
    ),
  )
}

/**
 * How much faster a short kit comes round.
 *
 * Two mechanics on the boss's own cadence is not an easier fight, it is a
 * quieter one — measured, a five-man normal Warden went from winning a fifth
 * of its first pulls to winning all of them, and the pulls were shorter and
 * emptier rather than gentler. Which is the wrong trade: what a small raid
 * should meet is a narrower fight, not a slack one.
 *
 * So the rungs a raid did not buy are paid back as tempo. A kit of two runs
 * its two ideas at about five-eighths of the interval, and by the full five it
 * is on the table's own numbers. The pressure still rises with the rungs —
 * five mechanics at full cadence ask for more per second than two at
 * five-eighths, and they ask for five different things — but the bottom of the
 * ladder is a fight rather than a wait.
 */
export function kitCadence(rungs: number): number {
  return Math.min(1, 1 - (kitCount(25, 'heroic') - rungs) * 0.127)
}

/**
 * Makes tonight's fight out of the boss's full table.
 *
 * Two things at once, because they are one decision: everything the kit did
 * not buy is switched off, and everything it did comes round at the tempo the
 * kit's size earns. Zeroing is the same switch the tables already use — every
 * scheduler in `boss.ts` reads a cadence of zero as "not this fight" — so
 * there is one rule for a mechanic being absent rather than two.
 */
export function gated(
  timing: PhaseTiming,
  kit: readonly MechanicId[],
  /**
   * How many rungs the raid actually bought, when that is not `kit.length`.
   *
   * Measuring one mechanic at a time narrows the kit to it, and the tempo
   * would then be a one-rung tempo -- five eighths of the interval, so the
   * mechanic under measurement arrives about twice as often as it ever does
   * in the fight it belongs to. Every teaching figure taken that way was
   * quietly reading a boss nobody plays. The caller says what the kit really
   * is and the filtering stays a filter.
   */
  rungs = kit.length,
): PhaseTiming {
  const tempo = kitCadence(rungs)
  const on = (id: MechanicId, every: number): number => (kit.includes(id) ? every * tempo : 0)
  const cadence = {} as Record<MechanicId, number>
  for (const id of MECHANIC_IDS) cadence[id] = on(id, timing[id])
  return { ...timing, ...cadence }
}

/**
 * What gets shouted when a mechanic goes off.
 *
 * A boss speaks for the mechanics on its own ladder and is silent about the
 * rest, which is the rule that stops the fights sounding like one another.
 * Silence is the right answer for a mechanic it does not own, because there
 * is now nothing that can hand a boss one: every fight in the game throws its
 * own kit and only that.
 */
export function lineFor(encounter: Encounter, key: MechanicId): string {
  return key in encounter.lines ? (encounter.lines as Record<string, string>)[key]! : ''
}

/** Clamped rather than checked: a saved index outliving its boss is not fatal. */
export function encounterIndex(index: number): number {
  return Math.max(0, Math.min(ENCOUNTERS.length - 1, Math.round(index)))
}

export function encounterAt(index: number): Encounter {
  return ENCOUNTERS[encounterIndex(index)]!
}

/** Whether anything follows this one. */
export function hasNext(index: number): boolean {
  return index < ENCOUNTERS.length - 1
}

/**
 * Whether the boss owns this mechanic at all, at any size.
 *
 * The ladder rather than the phase tables: a table may carry a cadence for a
 * rung no raid ever reaches, and the question this answers — does this fight
 * have a cone in it — is about the boss, not about tonight.
 */
export function usesMechanic(encounter: Encounter, key: MechanicId): boolean {
  return encounter.ladder.includes(key)
}

export type { DifficultyId }

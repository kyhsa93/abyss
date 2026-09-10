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
 *
 * Where the numbers come from: every one of them is the interval the fight's
 * own script schedules the matching event at, midpoint where the source gives
 * a range, and `opening` is that event's first cast rather than its repeat.
 * Phases two and three are not in the source -- most of these fights have no
 * phases there at all -- so they keep the ratio to phase one that this game
 * had already tuned. `docs/reading-the-source.md` has the mechanic-by-mechanic
 * mapping, including the two numbers that were taken and put back because the
 * source's number describes something this game does not have.
 *
 * They were all written by hand before that, and two of them were backwards:
 * Deathwhisper's volley came round twice as often here as in the fight it was
 * copied from, and her shades half as often.
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
  caustic: 'the caustic',
  slime: 'the rising',
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
  /**
   * The bar, and where this fight sits against the other seven.
   *
   * The *order* is the source's and the *values* are this game's own, which is
   * not a compromise -- it is the only reading the data supports. In the
   * source these eight bosses carry between five and a half and fourteen
   * million, and the raid that fights them is a different raid each week: it
   * gears up between the wings, so a boss at the back of the building may ask
   * two and a half times what the first one did and still take four minutes.
   * Here it is the same roster on the same night against one enrage, so health
   * *is* fight length, and the source's spread would put two fights past their
   * enrage and two under two minutes.
   *
   * What the source can settle is which fight is bigger than which. Ascending,
   * with the mana barrier counted as the Watcher's bar (it is what has to be
   * taken off her) and the council counted as its Blood Orb Controller's pool
   * (the three princes share one, `newPrince->SetHealth(me->GetHealth())`):
   *
   *   the three crowns    5,647,725   0.81
   *   the last whisper    6,611,600   0.95
   *   the bonegrinder     6,972,500   1.00
   *   the confluence      7,321,125   1.05
   *   the bloodgorged     8,785,350   1.26
   *   the reeking host    9,412,875   1.35
   *   the two flasks      9,761,500   1.40
   *   the crimson gift   14,154,175   2.03
   *
   * The order was dealt out here for one round, on the reasoning that the
   * eight numbers the sweep arrived at were a set and the source could say
   * which fight got which. The sweep said otherwise, and it is worth writing
   * down why: a fight's health is not a number from a shared pool, it is that
   * fight's own answer to that fight's own damage. Permuted, four cells went
   * out of band in one pass -- the crimson gift, given the largest bar because
   * the source's queen carries it, went to nought percent at twenty-five and
   * the three crowns went to a hundred at every setting.
   *
   * So the numbers are each fight's own again and the order above is a fact
   * about the source rather than a fact about this game. It is the one thing
   * on this list that was taken and then given back.
   */
  /**
   * How fast it walks, as `creature_template.speed_run`.
   *
   * A multiplier of the source's base seven yards a second, which is the same
   * unit the party's speeds are in. Every boss in this raid carries its own
   * and they are not close: the Watcher moves at 1.14 and the professor at
   * 1.71, half again as fast, which is most of the difference between a fight
   * you can walk away from and one you cannot.
   *
   * This was one number — the first boss's — given to all eight, so a raid
   * that learned it could outrun the bonegrinder learned something untrue
   * about every fight after it.
   */
  pace: number
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
  /**
   * What share of a wave stands off and casts instead of walking in.
   *
   * One fight has one, and it is the fight the source builds its waves out of
   * two creatures: Cult Fanatics walk at somebody, Cult Adherents stop at
   * range and cast. `SummonWaveP1` alternates which of the two it summons more
   * of, two to one and then one to two, so over a fight it is half and half.
   *
   * Absent everywhere else, because everywhere else a wave is one creature in
   * the source as well. A field rather than a fight's name in `boss.ts`: the
   * next fight that wants casters in its wave says so here.
   */
  casters?: number
  /**
   * Mechanics the source only throws at some settings, and which.
   *
   * This game had a ladder of its own once -- a fight sold its mechanics one
   * at a time as a raid got bigger or braver -- and it was retired, because a
   * fight with a mechanic taken out of it is not easier, it is emptier. What
   * is here is not that. It is the *source's* own gating, four lines of it
   * across the whole instance, each of which reads as a fight being a
   * different fight at a different setting rather than a cheaper one:
   *
   *   `if (IsHeroic()) events.ScheduleEvent(EVENT_UNBOUND_PLAGUE, 20s)`
   *   `if (IsHeroic()) DoCastSelf(SPELL_SHADOW_PRISON, true)`
   *   `if (GetDifficulty() != RAID_DIFFICULTY_10MAN_NORMAL)` around Dominate Mind
   *   `if (IsHeroic())` around the Watcher's second-phase waves
   *
   * `heroic` is the first two shapes; `beyond-ten-normal` is the third, which
   * is the one setting in the source that is neither a difficulty nor a size
   * on its own.
   *
   * Nothing else in the instance gates a whole mechanic. Everything else it
   * varies by setting it varies by *number* -- how many spores, how many
   * targets a blight needs, how long a storm runs -- and that is what
   * `sizeMechanic` and the difficulty table already do here.
   */
  gates?: Partial<Record<MechanicId, 'heroic' | 'beyond-ten-normal'>>
  /**
   * Health fractions the phases turn on.
   *
   * Three phases at set shares of the bar is this game's own device, and it
   * had to be, because the source mostly has no phases: five of these eight
   * fights escalate on something else entirely -- a bone storm on a clock, a
   * third inhale, an invocation passed between three bodies, an air phase two
   * minutes in -- and simply get harder because more of them are up at once.
   * Two do state a trigger and are written to it: Putricide's eighty and
   * thirty-five, and the wall of mana that ends Deathwhisper's first phase.
   * Saurfang's frenzy at thirty is a third, and the number here already
   * matched it.
   *
   * So: where the script says a number, this is that number. Where it says
   * nothing, this is pacing, and the fight's own comment says so.
   */
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
   * The mechanics this boss owns, in the order it teaches them.
   *
   * All of them, at every size and every difficulty. It was a ladder — the
   * first three at five normal, one more per step up to six at twenty-five
   * heroic — and the source does not work that way. Its own scripts schedule
   * every ability a fight has whatever the setting, and what the setting
   * changes is the numbers: how many people a spell picks (`RAID_MODE(3, 8,
   * 3, 8)`), which rank of it lands, how long until the berserk (`IsHeroic()
   * ? 360s : 480s`). Nobody there meets a smaller fight, only a gentler one.
   *
   * So a five-man on normal meets the whole boss. What still scales with the
   * roster is volume, through `MECHANIC_SCALES`, which is the same rule the
   * source's own target counts are.
   *
   * The order is still the design. It is what the fight opens with and
   * therefore what everybody sees: a party that wipes at forty percent has met
   * the first few and no more. Two bosses whose openings overlap are two
   * bosses that open the same way, so the first few are disjoint across all
   * three of the early fights — the brand and the crush, marks and the
   * stalker, the cone and the ring.
   */
  kit: MechanicId[]
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
  }
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
    // The room, and half of it is a cliff.
    //
    // The circle on the client's own map of this floor is drawn in two
    // colours: a red near half with the boss marker on it, and a blue-green
    // far half with an ice texture. Only the red is floor.
    //
    // The numbers are the instance's own, not the picture's. Its script fences
    // this fight with a circle of radius ninety-five about (-428, 2211) and a
    // rectangle that cuts everything past x = -430 — a half-disc, cut two
    // yards behind that circle's middle — and the boss spawns at (-401.4,
    // 2211.1), twenty-nine yards in front of the cut. Built at `BUILD_SCALE`
    // like every other measured room, that is a floor ninety-five yards wide
    // and forty-eight deep with the drop along the straight side.
    //
    // It is no longer the yardstick, and `ARENA_RADIUS` still is: every number
    // in `docs/mechanic-rules.md` was measured in that disc and this room is
    // half of one. What that costs is real and is the point — a line out of
    // the middle reaches the drop in twenty-three yards, and a raid that backs
    // away from the storm has somewhere it must not back into.
    // The apse is the boundary's, and both numbers are right: the circle is
    // `CircleBoundary(-428, 2211) r95` and the cut is `RectangleBoundary` at
    // x -430.
    //
    // `back` is measured from the *boss*, not from the circle's centre, and
    // that is the whole of what makes it fifteen yards rather than two. Lord
    // Marrowgar stands at x -401.4 and the circle's middle is at -428, so he is
    // twenty-six and a half yards in front of it: the drop behind him is 28.6
    // yards of floor, which at `BUILD_SCALE` is the 335 this was already built
    // at. Read off the circle instead it comes out as two, which puts the boss
    // on the wall — and `dungeoncheck` says so in three places at once, because
    // a room whose middle is within a body's width of its own edge is a room
    // with no middle.
    room: { kind: 'apse', radius: 1099, back: 335 },
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
    pace: 1.21429,
    hp: 46000,
    enrage: 240,
    phaseTwoHp: 0.66,
    phaseThreeHp: 0.33,
    swingDamage: 520,
    slamDamage: 1050,
    raidDamage: 120,
    mechanicDamage: 0.9,
    // Flat was right while the cadence was this game's own. It is not now:
    // the cold line comes round every five seconds off the source's schedule
    // instead of every thirteen, and a twenty-five-man rings a bigger circle
    // and eats more of it. Twenty-five heroic was the one cell under the floor.
    // 0.85 was an overcorrection: the cell that was at 43% went to 98%, which
    // is the fight handed over rather than fixed. Between the two.
    sizeMechanic: { 10: 1.0, 25: 0.92 },
    accent: '#e7e5e4',
    names: { slam: 'SABER LASH', shard: '', raid: 'THE GRINDING' },
    kit: ['coldflame', 'spike', 'bonestorm'],
    phases: {
      1: { swing: 2.2, slam: 19, puddleCount: 1, raid: 12, ...beats({ coldflame: 5, spike: 17.5, bonestorm: 92.5 }) },
      2: { swing: 2.0, slam: 17, puddleCount: 1, raid: 11, ...beats({ coldflame: 4.2, spike: 15.6, bonestorm: 83.5 }) },
      3: { swing: 1.8, slam: 15, puddleCount: 1, raid: 10, ...beats({ coldflame: 3.7, spike: 13.6, bonestorm: 74.6 }) },
    },
    opening: { slam: 14, raid: 13, ...beats({ coldflame: 5, spike: 12.5, bonestorm: 47.5 }) },
    lines: {
      phaseTwo: 'The floor is bone now',
      phaseThree: 'GRIND THEM ALL',
      caustic: '',
      slime: '',
      rotation: '',
      gift: '',
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
     * A straight-walled room instead of a round one — the first in the game.
     *
     * Everything this fight throws travels in a straight line: the shard, the
     * shade, the mind it turns and sends back. In a disc every bearing is the
     * same bearing and a line is a line wherever it points; between two
     * colonnades there is an axis, and "am I on it" becomes a thing to know.
     * That is the whole reason this room is not round.
     *
     * It was twice as long as it was wide, which the source's own plan of this
     * floor says it is not: the room is very nearly square and no bigger than
     * the first fight's chamber, entered down a stair at one end with a
     * gallery up either side and the lich in an apse at the far one. The
     * photographs agree — you look down it between two rows of pillars and the
     * far wall is not far.
     *
     * A hundred and fourteen and a half yards by a hundred and ten, which is
     * the plan's — measured, not proportioned. The two reshapings before this
     * one held the floor's area on purpose, because the shape was being
     * corrected against a picture and the size was not known; the sheet has a
     * scale now, calibrated against a distance in the source's own scripts
     * (the adds walk into this very room through doors at y=2154.5 and
     * y=2269.0, so it is 114.5 yards wall to wall), and the size is known. It
     * is nearly twice the floor it had.
     *
     * The frame is `RoomShape`'s: the boss at the origin, the raid coming in
     * from `+y`. So `front` is the floor the raid fights across and `back` is
     * the apse behind the lich.
     */
    // A hundred and fifty yards across the walk by a hundred and thirty-five
    // along it, off `RectangleBoundary(-670, -520, 2145, 2280)` at
    // `BUILD_SCALE`. A rectangle boundary is a bound rather than a shape, and
    // this is the one room where that costs nothing: the room is a hall and a
    // hall is a rectangle.
    //
    // It was a hundred and sixteen square, which the plan and the doors its
    // adds come out of agreed on -- they stand 115.7 yards apart in the
    // source. Two measurements agreeing is not two measurements: they were the
    // same reading of the same picture. Built, that is 2198 units square going
    // to 1562 across by 1735 deep: narrower than it was, and deeper.
    //
    // And she is not in the middle of it, which is the second correction and
    // the one a boundary cannot make on its own. A boundary says where the
    // walls are; where the boss stands inside them is a `creature` row, and
    // hers is x -634.69 against walls at -670 and -520. So the floor is
    // thirty-five yards behind her and a hundred and fifteen in front: 408 and
    // 1327, against the 578 and 1157 this was built at -- one third and two
    // thirds, which is the split every hall in this building was given because
    // nobody had looked up where its boss stands. The room is the same size;
    // what moved is her place in it, and that is most of what a hall is.
    room: { kind: 'hall', halfWidth: 781, front: 1327, back: 408 },
    /**
     * Two rows of seats down the sides, and a clear middle.
     *
     * Five blocks a side rather than a wall, because a wall is a concave shape
     * and this game does not buy path-finding — the gaps between them are what
     * that decision costs, and they read as the aisles between benches. The
     * middle is left empty on purpose: it is where the straight lines travel
     * and where the rotting floor is laid.
     *
     * Re-laid when the room stopped being a long one. Same five a side and the
     * same clearances; what changed is that the walls they stand 75 units off
     * are further apart and the floor they run down is shorter, so the rows
     * are further out and closer together.
     *
     * Seventy-five is the gap from the rock's *edge* to the wall, not from its
     * middle — the first attempt at re-laying these subtracted it from the
     * half-width as though it were a centre offset and stood every one of them
     * five units off the wall. The build said so, ten times a raid size.
     *
     * Against the rules the terrain roll obeys: 75 units off the side wall
     * (a lane is 64), well off the middle (the melee ring is 210), a lane
     * between neighbours, and clear of every starting mark at all three raid
     * sizes. `rendercheck` measures all four.
     */
    // Re-spaced when the lich took her own place in her own hall: the row ran
    // from -440 to 1020 in a room whose back wall was at -578, and the back
    // wall is at -408 now, so the first pair of seats was standing outside the
    // building.
    //
    // Searched rather than nudged, against the four rules a rolled rock obeys
    // and the four doorways -- five a side, evenly spaced, the widest mouth
    // the room will give both pairs of doors. It comes out ahead of her rather
    // than around her, which is what an oratory is: the pews face the altar
    // and the altar is at the back.
    terrain: [
      { pos: { x: -640, y: 25 }, radius: 70 },
      { pos: { x: -640, y: 315 }, radius: 70 },
      { pos: { x: -640, y: 605 }, radius: 70 },
      { pos: { x: -640, y: 895 }, radius: 70 },
      { pos: { x: -640, y: 1185 }, radius: 70 },
      { pos: { x: 640, y: 25 }, radius: 70 },
      { pos: { x: 640, y: 315 }, radius: 70 },
      { pos: { x: 640, y: 605 }, radius: 70 },
      { pos: { x: 640, y: 895 }, radius: 70 },
      { pos: { x: 640, y: 1185 }, radius: 70 },
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
      { pos: { x: -781, y: 496 } },
      { pos: { x: 781, y: 496 } },
      { pos: { x: -781, y: -263 }, from: 25 },
      { pos: { x: 781, y: -263 }, from: 25 },
    ],
    /** Cut stone, laid in courses: a room that is still in use. */
    floor: 'floor-slate',
    pace: 1.14286,
    hp: 58000,
    enrage: 240,
    /**
     * The wall of mana, as a share of what has to be taken off her.
     *
     * Not a health percentage in the source at all: her barrier absorbs damage
     * until it is spent, and the phase ends on the hit that outlasts it
     * (`damage > me->GetPower(POWER_MANA)`). Which is a health percentage once
     * the two bars are one bar, and the share is in the database:
     * `creature_template` gives her a health and a mana modifier for each of
     * the four settings, and `creature_classlevelstats` the level-83 base both
     * are multiplied by.
     *
     *   ten normal   3,264,800 mana / 6,611,600 total = 49%
     *   ten heroic  11,193,600 / 24,580,800 = 46%
     *   twenty-five normal 3,264,800 / 9,958,400 = 33%
     *   twenty-five heroic 13,992,000 / 40,766,400 = 34%
     *
     * A fight here has one threshold rather than four, so it is their mean:
     * two fifths of her is the wall. It was 0.7, hand-tuned.
     */
    phaseTwoHp: 0.6,
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
    // Twenty-five heroic landed on exactly the fifty percent the band asks
    // for, which is a cell that passes and has no margin -- and a band read
    // off forty pulls a cell carries about sixteen points of noise. Enough
    // room to be measured rather than guessed at.
    // And down again when the volley came off AzerothCore's own script at
    // fourteen seconds rather than TrinityCore's twenty. Twenty-five heroic
    // went from 70% of its pulls to 38 on that one number: a bill that lands
    // on everybody is the one mechanic whose cost is the size of the raid.
    sizeMechanic: { 10: 1.0, 25: 0.62 },
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
    // Half of every wave stands off and casts. See `casters`.
    casters: 0.5,
    kit: ['volley', 'decay', 'frostbolt', 'shade', 'insignificance', 'empower', 'dominate'],
    // The one mechanic in the source that a ten-man on normal never sees:
    // `if (GetDifficulty() != RAID_DIFFICULTY_10MAN_NORMAL)` is written round
    // Dominate Mind and round nothing else in the instance.
    gates: { dominate: 'beyond-ten-normal' },
    /**
     * Two fights rather than one boss getting faster, which is the only place
     * in this game a phase changes *what* is thrown rather than how often.
     *
     * It is what the source does. Her first phase is a wall of mana she stands
     * behind: waves of cultists, one of them empowered, a plague on the floor
     * and a mind turned, and no direct damage at all. The wall comes down and
     * she starts casting -- frostbolt, the volley, the mark on her tank, and
     * shades pulled out of the raid -- and every one of the first phase's own
     * ideas is cancelled on the spot (`scheduler.CancelGroup(GROUP_ONE)`).
     * Two things cross the break, because the source schedules them outside
     * both phases: the plague and the turned mind.
     *
     * Written as one kit of eight, which is what this was, it is eight
     * mechanics at once from the first second, and the fight won nought to
     * five percent of its pulls at every size and difficulty. It is not that
     * they were too hard. It is that they were all of them, always.
     *
     * The wave carries into the second phase because heroic's script does
     * (`SummonWaveP2` every 45s); on normal the source stops summoning and
     * this does not, which is the one place this table is knowingly the
     * heroic script at both difficulties.
     */
    phases: {
      1: { swing: 2.1, slam: 16, puddleCount: 1, raid: 14, ...beats({ adds: 60, decay: 26, empower: 21.5, dominate: 42.5 }) },
      2: { swing: 1.9, slam: 14, puddleCount: 1, raid: 13, ...beats({ adds: 45, volley: 14, decay: 22.5, frostbolt: 12, shade: 12, insignificance: 7.5, dominate: 36.9 }) },
      3: { swing: 1.7, slam: 12, puddleCount: 1, raid: 12, ...beats({ adds: 39.2, volley: 12.2, decay: 19.1, frostbolt: 10.4, shade: 10.4, insignificance: 6.5, dominate: 32.4 }) },
    },
    // Each mechanic's own first cast in the source. The second phase's four
    // sit here as well and are simply never reached in the first, because a
    // scheduler whose cadence is nought does not spend its timer -- so what
    // they mean is "this long after the wall comes down".
    opening: { slam: 13, raid: 15, ...beats({ adds: 5, volley: 20, decay: 10, frostbolt: 11, shade: 13.5, insignificance: 7.5, empower: 25, dominate: 30 }) },
    lines: {
      phaseTwo: 'The chorus falters',
      phaseThree: 'I HAVE HELD THIS PLACE FOR CENTURIES',
      caustic: '',
      slime: '',
      rotation: '',
      gift: '',
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
    pace: 1.5873,
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
    // Raised because the source's schedule is slower than the one it replaced
    // -- the bloat every sixteen seconds instead of eleven, the vile gas every
    // thirty-one instead of seventeen -- and the fight went to a hundred
    // percent at every setting, which is not a fight.
    mechanicDamage: 0.9,
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
    sizeMechanic: { 10: 1.1, 25: 0.65 },
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
    kit: ['blight', 'bloat', 'vilegas', 'spore', 'inhale', 'pungent'],
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
    // A hundred and three yards across. The plagueworks plan covers a known
    // rectangle of the world, which makes it 1.1465 yards to the pixel, and
    // this room draws ninety. It was sixty-four — two thirds of the yardstick
    // room on the argument that a fight about running out of air can afford to
    // be small, which is a fine argument and not a measurement.
    room: { kind: 'round', radius: 674 },
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
      { pos: { x: -348, y: -65 }, radius: 95 },
      { pos: { x: 348, y: -65 }, radius: 95 },
    ],
    /** Fine and flat: a room that is worked in rather than fought over. */
    floor: 'floor-slate',
    phases: {
      1: { swing: 2.1, slam: 17, puddleCount: 1, raid: 13, ...beats({ blight: 3.2, bloat: 16.2, vilegas: 31.5, spore: 42.5, inhale: 34, pungent: 116 }) },
      2: { swing: 1.9, slam: 15, puddleCount: 1, raid: 12, ...beats({ blight: 2.8, bloat: 14.8, vilegas: 27.8, spore: 37.2, inhale: 29.9, pungent: 102 }) },
      3: { swing: 1.7, slam: 13, puddleCount: 1, raid: 11, ...beats({ blight: 2.4, bloat: 13.3, vilegas: 24.1, spore: 31.9, inhale: 25.7, pungent: 88 }) },
    },
    opening: { slam: 12, raid: 14, ...beats({ blight: 3.5, bloat: 13.8, vilegas: 35, spore: 22.5, inhale: 27.5, pungent: 112 }) },
    lines: {
      phaseTwo: 'The air thickens',
      phaseThree: 'BREATHE IT ALL',
      caustic: '',
      slime: '',
      rotation: '',
      gift: '',
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
    // A hundred and sixteen yards across, off
    // `RectangleBoundary(4205, 4325, 3082, 3195)` at `BUILD_SCALE` — 120 by
    // 113, and a round room takes the mean of a rectangle's two sides for its
    // diameter. It was a hundred and three, off the plan of this floor at
    // 0.592 yards a pixel.
    //
    // Built, 1952 units across going to 1348 -- a room that lost half its
    // floor. The note above still holds and holds harder: what is small here
    // is small against the yardstick, and the yardstick grew while this
    // shrank.
    // A hundred yards across, off `RectangleBoundary(-565, -465, 2160, 2260)`
    // at `BUILD_SCALE`: a hundred by a hundred, the one boundary in the
    // building that is square, so the mean a round room takes of it is the
    // thing itself.
    //
    // It was 78 -- the mean of a balcony measured 92 wide and 65 deep off the
    // map tile -- and 103 before that, off a sheet read three times too
    // coarse. Three readings of one balcony, and the boundary is the only one
    // of them that is not somebody looking at a picture. Built, 1478 units
    // across going to 1156.
    room: { kind: 'round', radius: 578 },
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
      { pos: { x: -244, y: -524 } },
      { pos: { x: 244, y: -524 } },
    ],
    /** Open stone, worn smooth: the top of a spire rather than a hall. */
    floor: 'floor-cobble',
    pace: 1.42857,
    hp: 56000,
    enrage: 240,
    // Nothing in the source ends a phase here: what escalates is the bar, and
    // the mark it buys. This is this game's own pacing, and it is left alone
    // for that reason -- with one number that turned out to agree with the
    // script by accident and is now written down as deliberate.
    phaseTwoHp: 0.7,
    // Lower than the usual third, because the last phase of this fight is
    // whatever the gauge has already bought. A boss that starts hitting harder
    // at forty percent on top of two marks it has been paid for is a fight
    // that ends in a wall rather than in a mistake.
    //
    // And it is where the source frenzies -- `HealthBelowPct(31) // AT 30%,
    // not below`, which is the only health threshold in that script.
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
    // The ten-man is the *harder* size here and the table said otherwise for
    // a long time. What the mark does is take a body out of the raid and hand
    // the boss a fifth of its health if it dies, and a ten-man has ten bodies
    // to spare it from: measured, 23% and 10% against the twenty-five's 90%
    // and 78%. The number below is that gap closed rather than a preference.
    // 0.7 took the ten-man from 23% to 95%, which is the same mistake in the
    // other direction. Two thirds of the way back.
    sizeMechanic: { 10: 0.8, 25: 0.8 },
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
    // answered by a second tank, and a five-man does not have one. It was put
    // last so the smallest raid never met it — and nothing hides it any more,
    // because every setting meets the whole fight the way the source's do. A
    // five-man's answer to it is the one the source gives a raid short a tank:
    // burn the thing holding the body, faster.
    kit: ['spill', 'siphon', 'fester', 'adds', 'champion', 'gorge'],
    herald: null,
    accent: '#7f1d1d',
    names: { slam: 'RENDING BLOW', shard: '', raid: 'THE TAKING' },
    phases: {
      1: { swing: 2.0, slam: 16, puddleCount: 1, raid: 12, ...beats({ siphon: 22.5, spill: 17.5, fester: 22.5, adds: 40, champion: 75, gorge: 26 }) },
      2: { swing: 1.8, slam: 14, puddleCount: 1, raid: 11, ...beats({ siphon: 19.1, spill: 15, fester: 19.5, adds: 35.2, champion: 68, gorge: 23 }) },
      3: { swing: 1.6, slam: 12, puddleCount: 1, raid: 10, ...beats({ siphon: 16.9, spill: 12.5, fester: 16.5, adds: 30.5, champion: 60, gorge: 20 }) },
    },
    // The mark's opening is the floor under the gauge rather than a first
    // cast: nothing marks anybody in the first minute unless the raid fills
    // the bar, which is the whole point of it.
    opening: { slam: 13, raid: 13, ...beats({ siphon: 17, spill: 15.5, fester: 20, adds: 30, champion: 75, gorge: 30 }) },
    lines: {
      phaseTwo: 'It is heavier now',
      phaseThree: 'IT HAS TAKEN ENOUGH',
      caustic: '',
      slime: '',
      rotation: '',
      gift: '',
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
    // A hundred and sixteen yards across, off
    // `RectangleBoundary(4385, 4505, 3082, 3195)` at `BUILD_SCALE` — the same
    // 120 by 113 as the airless room next door, which is what the plagueworks
    // is: two chambers off one corridor, built the same. It was a hundred, off
    // that floor's plan.
    //
    // Built, 1894 units across going to 1348: close to half the floor gone,
    // and it cost this fight twenty points of win rate at ten heroic in one
    // pass. That is the clearest case in the building of a room being a
    // difficulty dial -- a fight whose whole mechanic is two things not
    // reaching each other is a fight where floor *is* the answer. The mechanic
    // share below was cut to pay for it.
    room: { kind: 'round', radius: 674 },
    /**
     * One tank, against the wall.
     *
     * One rather than several, and that is the mechanic again: what the small
     * things are is a set of distances between each other, and a room full of
     * rocks decides those distances with its furniture. A single obstacle
     * gives the floor a direction without giving it a maze.
     */
    terrain: [{ pos: { x: 0, y: -497 }, radius: 110 }],
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
      { pos: { x: -477, y: 477 } },
      { pos: { x: 477, y: 477 } },
    ],
    /** A workshop floor: laid, drained, and about to be ruined. */
    floor: 'floor-clay',
    pace: 1.5873,
    hp: 54000,
    enrage: 245,
    phaseTwoHp: 0.7,
    phaseThreeHp: 0.38,
    swingDamage: 580,
    slamDamage: 1180,
    raidDamage: 130,
    mechanicDamage: 0.92,
    // Heaviest at ten, which follows from where the fight's weight sits: most
    // of what this boss does lands on one named body at a time -- a carrier, a
    // small thing walking at whoever made it -- and the fewer bodies there are
    // the more often that one is somebody who cannot afford it.
    //
    // These two are what paid for the room. Taking the source's boundary
    // halved this floor, and a fight whose mechanic is two things not reaching
    // each other felt all of it: ten heroic fell from 57% to 35% on the room
    // alone. 1.3 and 0.85 went to 1.05, which put ten heroic at 88% -- the
    // fight handed over rather than fixed, the same overcorrection the first
    // boss's comment records. 1.18 lands it at 73%.
    sizeMechanic: { 10: 1.18, 25: 0.8 },
    // The spray is first because it is the only thing here a player has met
    // before, and a fight whose every rung is a new idea is a fight with no
    // way in. Everything above it is the one idea this boss is made of, added
    // a piece at a time: something to be born, something for it to walk to,
    // ground that makes fixing it late expensive, the merging itself, and
    // finally the boss eating what nobody cleared and handing the bill to the
    // tank.
    kit: ['spray', 'infection', 'ooze', 'flood', 'merge', 'engulf'],
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
      1: { swing: 2.1, slam: 17, puddleCount: 1, raid: 13, ...beats({ spray: 20, infection: 14, flood: 25, engulf: 7, slime: 15 }) },
      2: { swing: 1.9, slam: 15, puddleCount: 1, raid: 12, ...beats({ spray: 18.2, infection: 12, flood: 22.2, engulf: 6.5, slime: 13.1 }) },
      3: { swing: 1.7, slam: 13, puddleCount: 1, raid: 11, ...beats({ spray: 14.5, infection: 10.7, flood: 19.4, engulf: 6, slime: 11.2 }) },
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
    opening: { slam: 13, raid: 14, ...beats({ spray: 20, infection: 14, flood: 8, engulf: 8, slime: 5 }) },
    lines: {
      phaseTwo: 'It is coming apart',
      phaseThree: 'ALL OF IT AT ONCE',
      caustic: '',
      slime: 'The floor is coming up — off the edge',
      rotation: '',
      gift: '',
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
     *
     * And for a year it was the other way round. Fourteen hundred across
     * against eighteen hundred and fifty deep is a hall that is deeper than it
     * is wide — the exact shape this note says it must not be, sitting under
     * the note saying so. The plan of the floor settles it in the same
     * direction: the wing runs left off the crossing, so the wall this room is
     * entered through is one of the short ones, and measured across the walk
     * it is wider than it is deep by about a seventh.
     *
     * 1726 by 1501, and the floor is the two and a half million it already
     * was — the same rule the second fight's room is held to. Turning a room
     * and shrinking it at once is two changes measured as one.
     */
    // Twice turned, and the source settles it.
    //
    // The note above says this room must be wider than it is deep and gives a
    // shape that is. What was actually here was 1686 across by 2349 deep --
    // turned back the way the note forbids, by a later round that measured the
    // plan by eye and read a long diamond off it. So the file has carried its
    // own argument against its own numbers for a while, which is what happens
    // when a shape is settled twice by looking at pictures.
    //
    // `instance_icecrown_citadel.cpp` ends it. The fight's floor is a
    // parallelogram -- `ParallelogramBoundary((4356, 3290), (4435, 3194),
    // (4280, 3194))` -- a hundred and fifty-five yards across the walk and
    // ninety-six along it, which is wider than deep by a little over half. The
    // raid comes in through the Scientist Entrance at (4356.8, 3155.9), which
    // is the long wall, so the width is the x span and the depth is the y one.
    //
    // At that ratio, keeping the floor it already had to the square unit:
    // 2530 across by 1566 deep. The benches move with it.
    //
    // And then the size came off the same parallelogram rather than off the
    // floor it happened to have: 155 yards across the walk by 96 along it at
    // `BUILD_SCALE`, which is 1794 by 1111. Smaller in both directions than
    // the area-preserving version above, because the area it was preserving
    // was itself a guess.
    //
    // And the professor's place in it off his own row: he stands at y 3262.90
    // between walls at 3194 and 3290, which is 69 yards of floor in front of
    // him and 27 behind -- 797 and 313, against the 741 and 370 this was
    // built at. He is at his table at the back of his laboratory, which is
    // where the source puts him and is not a two-to-one split.
    room: { kind: 'hall', halfWidth: 897, front: 797, back: 313 },
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
      { pos: { x: -582, y: -140 }, radius: 85 },
      { pos: { x: 582, y: -140 }, radius: 85 },
      { pos: { x: -582, y: 222 }, radius: 85 },
      { pos: { x: 582, y: 222 }, radius: 85 },
    ],
    /** A workshop, and the brightest room in the building. */
    floor: 'floor-slate',
    pace: 1.71429,
    hp: 58000,
    enrage: 250,
    /**
     * Eighty and thirty-five, off the script rather than off a feel.
     *
     * The one fight in this wing whose phases the source states outright, and
     * as health shares rather than as anything else: `DamageTaken` watches for
     * `HealthAbovePct(80)` in the first and `HealthAbovePct(35)` in the
     * second, and each break stops the boss dead while it runs to a table and
     * drinks. They were 0.68 and 0.34, which is this game's house default.
     *
     * The long first phase is the point of it. Eighty percent is a fifth of a
     * fight, not a third, so what the raid meets first is nearly the whole of
     * one idea before a second is added -- which is the shape every other
     * fight here reaches for by hand.
     */
    phaseTwoHp: 0.8,
    phaseThreeHp: 0.35,
    swingDamage: 560,
    slamDamage: 1150,
    raidDamage: 105,
    mechanicDamage: 0.72,
    // Lightest at five, the way the last two bosses' rows are and for the same
    // reason: nearly everything here lands on one named body -- a pool under
    // somebody, a thing following somebody -- and a five-man answers all of it
    // with one healer. Written at 1.2 the smallest raid wiped in every pull
    // with the boss at a quarter, while the ten-man won every one of them.
    // And the same correction the bloodgorged needed, for the same reason
    // read backwards: this asks for two answers at once, and a raid of ten has
    // two answers' worth of bodies and no more. Written at 1.25 the ten-man
    // won 18% of its pulls on normal and 3% on heroic against the
    // twenty-five's 55% and 63%.
    // 0.8 took the ten-man from 18% to 100%. Most of the way back.
    sizeMechanic: { 10: 0.95, 25: 1.0 },
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
    kit: ['caustic', 'hound', 'gather', 'chase', 'decant', 'reagent'],
    // Unbound Plague is heroic-only there -- `if (IsHeroic())` in the
    // professor's `Reset` -- and the chase is what this game made of it.
    gates: { chase: 'heroic' },
    herald: null,
    accent: '#a3e635',
    names: { slam: 'THE HEAVY FLASK', shard: '', raid: 'FUMES' },
    phases: {
      1: { swing: 2.1, slam: 17, puddleCount: 1, raid: 12, ...beats({ caustic: 37.5, hound: 27.5, gather: 35, chase: 90, decant: 37.5, reagent: 10 }) },
      2: { swing: 1.9, slam: 15, puddleCount: 1, raid: 11, ...beats({ caustic: 32.5, hound: 24.6, gather: 31.3, chase: 80.5, decant: 33.4, reagent: 9 }) },
      3: { swing: 1.7, slam: 13, puddleCount: 1, raid: 10, ...beats({ caustic: 27.5, hound: 21.8, gather: 27.6, chase: 71.1, decant: 29.3, reagent: 8 }) },
    },
    opening: { slam: 14, raid: 13, ...beats({ caustic: 32.5, hound: 27.5, gather: 10, chase: 20, decant: 37.5, reagent: 11 }) },
    lines: {
      phaseTwo: 'The second flask',
      phaseThree: 'BOTH OF THEM, THEN',
      slime: '',
      rotation: '',
      gift: '',
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
     * Issue #33's room: a hall with three stations in it.
     *
     * The distance between the stations is the mechanic and it belongs to the
     * room. Seven hundred units apart is three times a caster's reach and
     * about four seconds of walking, which is what makes moving between them a
     * cost rather than a turn of the head — and that triangle is written down
     * below in its own coordinates, so it survives the room being reshaped
     * around it. Which is what happened.
     *
     * It was long: twelve hundred across against nineteen hundred and sixty
     * deep. The plan of this floor draws it very nearly square and a little
     * deeper than wide — a lobed room with a dais across the far end and a
     * balcony curving out either side above it — so 1500 by 1626, at the two
     * and a half million square units of floor it already had.
     */
    // Two hundred and thirty yards wide by a hundred and sixty long, and the
    // biggest floor in the building — which the source's own hall is. Its map
    // tile puts it at 0.373 yards to the pixel and the inner wall draws 618 by
    // 430; the two triggers at either end of it stand 205 yards apart, which
    // is the same hall measured a second way.
    //
    // It was 77 by 84, a fifth of the area. The round chamber in the middle of
    // the real hall is not in this shape: this game draws it as the room next
    // door, which is where the fight in it happens.
    //
    // The size is now `EllipseBoundary(4660.95, 2769.194)` with radii 85 and
    // 60 -- 120 yards across the walk by 170 along it at `BUILD_SCALE`, so
    // 1388 by 1967. Built, 4358 across by 3031 deep going to that: a third of
    // the width and two thirds of the depth. The biggest correction in the
    // building, and the fight did not notice -- it was at a hundred percent
    // before and it is at a hundred percent now, which says what this one is
    // decided by and it is not floor.
    //
    // And the three of them stand at x 4680.3 against an ellipse reaching from
    // 4575.95 to 4745.95, so the dais is past the middle of the hall rather
    // than at its end: 104 yards of floor in front of them and 66 behind, or
    // 1207 and 760. It was 1311 and 656, which is the two-to-one split this
    // building gave every hall before anybody read where its boss stands.
    room: { kind: 'hall', halfWidth: 694, front: 1207, back: 760 },
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
      { pos: { x: -545, y: -218 }, radius: 75 },
      { pos: { x: 545, y: -218 }, radius: 75 },
      { pos: { x: -545, y: 774 }, radius: 75 },
      { pos: { x: 545, y: 774 }, radius: 75 },
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
    pace: 1.42857,
    hp: 51000,
    enrage: 250,
    phaseTwoHp: 0.7,
    phaseThreeHp: 0.35,
    swingDamage: 560,
    slamDamage: 1150,
    raidDamage: 110,
    // The same correction the reeking host needed, and the same cause: the
    // crown moves every forty-six seconds off `EVENT_INVOCATION_OF_BLOOD`
    // rather than the fifty this game had guessed, but everything it empowers
    // slowed right down. A hundred percent at three settings of four.
    mechanicDamage: 1.0,
    // Far lighter at the small sizes than any other row on the roster, and it
    // is the fight's shape rather than its numbers that asks for it. A crossing
    // costs a caster its cast whatever the headcount, so a five-man loses a
    // fifth of its damage to the same walk a twenty-five man loses a
    // twenty-fifth of -- and then has one healer to answer everything the walk
    // did not stop. At the usual weights the smallest raid won one pull in ten.
    sizeMechanic: { 10: 0.75, 25: 0.95 },
    // The crown is first because without it there is no fight here, only three
    // statues; the thirst second because it is what makes the other two
    // bodies places rather than scenery. Then the ballast, which is the first
    // thing in this fight to want the same hands the crown does; the grain,
    // which is the tank's errand; the stillness, which is the one demand in
    // the game answered by not walking; and the wave, which is this fight's
    // fourth target call.
    kit: ['rotation', 'thirst', 'ballast', 'nuclei', 'prison', 'adds'],
    // Shadow Prison is the aura this game calls the binding, and all three
    // princes cast it on themselves with `if (IsHeroic())` and never
    // otherwise. It is the fight's own answer to a raid that runs from
    // everything, which is a thing to ask of a raid that has already won here
    // once rather than of one meeting the crowns for the first time.
    gates: { prison: 'heroic' },
    herald: null,
    accent: '#be123c',
    names: { slam: 'THE RED HOUR', shard: '', raid: 'THE COURT' },
    phases: {
      1: { swing: 2.1, slam: 17, puddleCount: 1, raid: 12, ...beats({ rotation: 46, thirst: 20, ballast: 21, nuclei: 12.5, prison: 17.5, adds: 48 }) },
      2: { swing: 1.9, slam: 15, puddleCount: 1, raid: 11, ...beats({ rotation: 41.4, thirst: 17.8, ballast: 18.9, nuclei: 11.2, prison: 15.6, adds: 43 }) },
      3: { swing: 1.7, slam: 13, puddleCount: 1, raid: 10, ...beats({ rotation: 36.8, thirst: 15.6, ballast: 16.8, nuclei: 10, prison: 13.7, adds: 38 }) },
    },
    // The first crown comes at thirty rather than at forty-five, because a
    // raid that has not seen one does not know what fight it is in -- and a
    // short pull would end without it ever having moved.
    opening: { slam: 14, raid: 13, ...beats({ rotation: 45, thirst: 20, ballast: 21, nuclei: 12.5, prison: 17.5, adds: 46 }) },
    lines: {
      phaseTwo: 'Another of us, then',
      phaseThree: 'ALL THREE, AND NONE OF YOU',
      gift: '',
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
    // A hundred and twenty-eight yards across, off
    // `CircleBoundary(4595.93, 2769.365)` with a radius of 64 at
    // `BUILD_SCALE`. A circle boundary is the one kind that needs no
    // interpretation at all: the shape is a circle and the room is a circle.
    //
    // It was 77 off a sheet where this chamber draws 210 by 205 pixels, and 82
    // before that. Built, this is the one room the picture had right: 1458
    // units across going to 1480, eleven units of radius. Seven rooms moved by
    // up to a third and this one moved by one and a half percent.
    room: { kind: 'round', radius: 740 },
    terrain: [],
    /** Red stone, and a balcony that is a painting rather than a place. */
    floor: 'floor-slate',
    pace: 1.42857,
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
    // Cut again when the bolt came off AzerothCore at twelve and a half
    // seconds rather than the twenty-two and a half this game had invented for
    // it. That is nearly twice the mechanic, and the fight went from 95% and
    // 65% at twenty-five to 13% and nought.
    mechanicDamage: 0.48,
    // Every cell of this fight was under the floor -- 33, 15, 3 and nought --
    // and the reason is the cadence rather than the size: the source throws
    // Twilight Bloodbolt every twenty-two and a half seconds where this game
    // had written thirty-three, and the bite every fifteen where it had
    // eighteen. Cadences are facts now; this is where the fight is tuned.
    // The most sensitive dial on the roster, and it is worth writing the
    // three measurements down rather than the reasoning: at 0.85 this cell won
    // nought percent of its pulls, at 0.65 it won 83, and at 0.78 it won 15.
    // Twenty-five bodies bound to each other in pairs is a mechanic whose cost
    // is the square of how many people are in it, so a tenth on this dial is
    // not a tenth of anything.
    // The twenty-five side of this fight is the most sensitive number on the
    // roster and it is worth writing the ladder down rather than the argument:
    // 0.58 wins 98% and 100%, 0.60 wins 78% and 70%, 0.63 wins 57% and 50%,
    // 0.66 wins 65% and 40%. Twenty-five bodies bound to each other in pairs
    // costs the square of how many are in it, and a band read off forty pulls
    // carries sixteen points of noise — so the last two of those are the same
    // measurement twice, and the number to stand on is the one with room.
    sizeMechanic: { 10: 0.9, 25: 0.6 },
    // The gift first, because nothing else here means anything without it. The
    // bond second, because it is what makes the gift a decision rather than a
    // walk: one says go and find somebody clean, the other says do not leave
    // your partner. Then the floor the raid's own passing leaves, the flight,
    // the body that turns when a gift is dropped -- which is the same mechanic
    // the Whisper owns saying a different sentence, because there a clock
    // takes somebody and here *the raid lost one* -- and finally the bill for
    // all of it.
    kit: ['gift', 'bond', 'stain', 'flight', 'turning', 'crimson'],
    herald: null,
    accent: '#e11d48',
    names: { slam: 'THE RED HAND', shard: '', raid: 'THE COURT BLEEDS' },
    phases: {
      1: { swing: 2.1, slam: 17, puddleCount: 1, raid: 13, ...beats({ gift: 15, bond: 30, flight: 52, crimson: 12.5 }) },
      2: { swing: 1.9, slam: 15, puddleCount: 1, raid: 12, ...beats({ gift: 14.2, bond: 26.6, flight: 46, crimson: 11 }) },
      3: { swing: 1.7, slam: 13, puddleCount: 1, raid: 11, ...beats({ gift: 13.3, bond: 23.1, flight: 40, crimson: 9.4 }) },
    },
    // The crimson opens well before the first flight rather than on top of it.
    //
    // Two unavoidable raid-wide bills in the same second is not a harder
    // fight, it is a wipe with two names: at thirty-one the first crimson
    // landed inside the first landing and took a twenty-five man from
    // fifty-four percent to twenty-eight in one tick.
    opening: { slam: 14, raid: 14, ...beats({ gift: 15, bond: 20, flight: 52, crimson: 20 }) },
    lines: {
      phaseTwo: 'Take it, all of you',
      phaseThree: 'IT IS EVERYWHERE NOW',
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
]



export const FIRST_ENCOUNTER = 0



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
 * Written here rather than left to the kit's ordering. The order a boss
 * teaches its ideas in puts the prerequisite first -- these ones do -- but
 * order is not dependency: `always` adds mechanics from outside the ordering
 * altogether, and `SimState.only` narrows a kit to one mechanic for
 * measurement. Neither can see that the breath out needs the air.
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

/**
 * Which mechanics this boss throws, which is all of them.
 *
 * The size and the difficulty are still asked for, because the source's own
 * answer to this question reads them — but its answer is the same list every
 * time and so is this one. See `kit`.
 */
export function encounterKit(
  encounter: Encounter,
  size: number,
  difficulty: DifficultyId,
): MechanicId[] {
  const shown = (id: MechanicId): boolean => {
    const gate = encounter.gates?.[id]
    if (gate === undefined) return true
    if (gate === 'heroic') return difficulty === 'heroic'
    return difficulty === 'heroic' || size > 10
  }
  return withRequired([...(encounter.always ?? []), ...encounter.kit].filter(shown))
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
 * How much faster a narrow kit comes round.
 *
 * A boss with three ideas throwing them on the same intervals as a boss with
 * seven is not an easier fight, it is a quieter one — measured, a five-man
 * normal Warden went from winning a fifth of its first pulls to winning all of
 * them, and the pulls were shorter and emptier rather than gentler. What a
 * narrow fight should be is narrow, not slack.
 *
 * So a kit shorter than `KIT_WIDE` gets the difference back as tempo: three
 * ideas run at about five-eighths of the table's intervals, and by six they
 * are on the table's own numbers. It used to be read as "the rungs a raid did
 * not buy", which is gone — nobody buys rungs now, every setting throws the
 * whole fight — but the number is the same one the eight fights are tuned at,
 * and what it is really about was never the progression: it is how many ideas
 * the boss owns.
 *
 * The second use is measurement. `SimState.only` cuts a kit to the mechanic
 * under test, and a boss throwing one idea on the table's cadence is a boss
 * nobody plays; every teaching figure in `docs/mechanic-rules.md` taken before
 * this existed was reading a mechanic arriving about twice as often as it does
 * in the fight it belongs to.
 */
const KIT_WIDE = 6

export function kitCadence(rungs: number): number {
  return Math.min(1, 1 - (KIT_WIDE - rungs) * 0.127)
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
  return encounter.kit.includes(key)
}

export type { DifficultyId }

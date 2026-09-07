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
  | 'brand'
  | 'verdict'
  | 'crush'
  | 'spire'
  | 'fault'
  | 'shallows'
  | 'puddle'
  | 'spread'
  | 'breath'
  | 'shockwave'
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
  | 'rot'
  | 'sunder'
  | 'soak'
  | 'hunt'
  | 'hand'
  | 'echo'
  | 'burden'
  | 'yoke'
  | 'schism'
  | 'vigil'
  | 'chant'
  | 'gaze'
  | 'knell'
  | 'vessel'
  | 'toll'
  | 'grasp'
  | 'refuge'

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
  brand: true, // one mark per so many bodies
  verdict: true, // one judgement per so many bodies
  crush: false, // a band of a fixed radius, which is where the melee stand
  // The one entry here that is false for a reason the column was not built
  // for. What a spire spends is floor, and the arena is 460 across whoever
  // turns up — counted per body a twenty-five man met twelve eruptions at
  // once, into a footprint no wider than a ten-man's, and wiped on every
  // first pull while the ten-man never noticed. Area denial super-scales.
  spire: false,
  fault: false, // half the arena, which is half of it at any headcount
  shallows: false, // a fixed number of patches, and nothing collides on them
  puddle: true, // `puddleCount` per cast
  spread: true, // one mark per so many bodies
  adds: true, // a wave of `living / 6`
  soak: true, // split among whoever stands in it
  rot: true, // applied to each of them
  sunder: true, // the tank's, and a bigger raid brings a second
  hunt: true, // one stalker per quarry
  breath: false, // a cone of a fixed angle
  shockwave: false, // a ring of a fixed radius
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
  hand: false, // a wedge of a fixed angle, whoever it happens to turn onto
  echo: true, // one mark per so many bodies
  burden: true, // one weight per so many bodies, and a bigger raid has more hands
  yoke: true, // one yoke per so many bodies, and the share is split among who came
  // A group per body, and a third group once there are enough bodies to need
  // one: what it asks grows with the roster twice over, in how many people
  // have to be sorted and in how many places they have to be sorted into.
  schism: true,
  // The three below are the same question asked of every body at once, so a
  // bigger raid meets exactly the fight a smaller one does. Nothing is
  // dropped *on* anybody and nothing is aimed at the arena either: what they
  // cover is an instant, and an instant is the same width at any headcount.
  vigil: false,
  // With one exception, and it is the mechanic's whole shape. One body is
  // named and everybody pays for it, so a bigger raid does not bring more
  // hands to the problem -- it brings more people to be let down by the one
  // pair that were already there.
  chant: false,
  gaze: false,
  // The three that are answered by what the raid is hitting rather than by
  // where it is standing, and all three are aimed at the roster rather than
  // at the arena: every extra body is another pair of hands that has to stop,
  // switch or hold, and pays for itself when it does not.
  knell: true, // its health is dealt by whoever came, so its health is per body
  vessel: true, // one more body is one more hand that can break it
  // One plate, one nominee, one bill. A bigger raid does not get a second
  // toll and does not get a discount on the one it has -- what changes with
  // the roster is only how many bodies there are to nominate from, which
  // makes it easier rather than more, and that is what `false` means here.
  toll: false,
  // One reach, whatever the headcount, and it writes one bill. What a bigger
  // raid changes is how many bodies are inside the circle when it closes,
  // which makes the single bill larger rather than making a second one -- so
  // the demand on any one body is the same at every size.
  grasp: false,
  // Marks per body, and a stone per mark. Both halves scale together, which
  // is the property that keeps it the same question at every size: a quarter
  // of the raid is sorting itself onto its own ground whether that is two
  // people or six.
  refuge: true,
}

/**
 * Every mechanic there is.
 *
 * Read off a table the compiler already forces to be complete, so that code
 * which has to touch all of them cannot quietly miss one. Every hand-written
 * copy of this list in the repo's history has ended up missing a name.
 */
/**
 * The vocabulary no boss sells any more, on its way out.
 *
 * Five fights were removed and their rungs went with them, which leaves
 * twenty-seven names still in the type, still implemented, and belonging to
 * nobody. They are being retired a family at a time rather than in one sweep:
 * each is a scheduler, a floor kind, a stretch of the party AI and a run of
 * checks, and a single edit that took all of them out at once produced six
 * thousand deleted lines nobody could review.
 *
 * The list exists so the rule that guards the ladders keeps running while that
 * happens. "Every mechanic belongs to a boss" is what this game is built on
 * and it is not being relaxed -- what is written here is the exception, by
 * name, and the check reads it rather than being widened. When the last family
 * is gone this is an empty array and the rule is what it always was.
 *
 * Nothing may be added to it. A mechanic with no boss is either on its way out
 * or an oversight, and the only thing that tells them apart is that somebody
 * wrote it down here on purpose.
 */
export const RETIRING: MechanicId[] = [
  'brand', 'verdict', 'crush', 'spire', 'fault', 'shallows', 'puddle',
  'spread', 'soak', 'rot', 'sunder', 'hunt', 'breath', 'shockwave', 'hand',
  'echo', 'burden', 'yoke', 'schism', 'vigil', 'chant', 'gaze', 'knell',
  'vessel', 'toll', 'grasp', 'refuge',
]

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
  brand: 'the brand',
  verdict: 'the judgement',
  crush: 'the crush',
  spire: 'the spires',
  fault: 'the fault',
  shallows: 'the shallows',
  puddle: 'pools',
  spread: 'marks',
  breath: 'the cone',
  shockwave: 'the ring',
  adds: 'thralls',
  rot: 'rot',
  sunder: 'the armour break',
  soak: 'the gathering',
  hunt: 'the stalker',
  hand: 'the hand',
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
  echo: 'the echo',
  burden: 'the burden',
  yoke: 'the yoke',
  schism: 'the schism',
  vigil: 'the vigil',
  chant: 'the chant',
  gaze: 'the gaze',
  knell: 'the knell',
  vessel: 'the vessel',
  toll: 'the toll',
  grasp: 'the grasp',
  refuge: 'the refuge',
}

export interface PhaseTiming {
  swing: number
  /**
   * Seconds between one brand and the next.
   *
   * A mark that leaves ground where it burns out. The two things measured to
   * teach in this game are both about the floor — a puddle is worth 34 points
   * of survival between a first pull and a ninth and a cone 29, and nothing
   * else clears 6 — because a telegraph is dodged once and learnt while a
   * floor is failed again and again.
   *
   * What a puddle does not ask is *where* the ground goes. This does: the
   * marked choose the spot by standing in it, so the fight is over which part
   * of the floor the raid is willing to give up. Ground the melee needs is a
   * different price from ground nobody was using.
   */
  brand: number
  /**
   * Seconds between one eruption of spires and the next.
   *
   * Stone comes up on telegraphed spots — you are on one or you are not, and
   * there is no half of it — and then it stands there while the next casts
   * land on whatever floor is left. Every other hazard here is a place to not
   * be for a few seconds and then the arena is whole again; this one hands
   * back less than it took.
   *
   * It was built to ask a second question on top of a pool's — not "where do I
   * stand now" but "which of this floor will still be floor in a minute" —
   * and measurement does not support that it does. How long the stone stands
   * barely moves the teaching at all; see `SPIRE_LINGER`. What it is worth, it
   * is worth at the instant it comes up.
   */
  spire: number
  /**
   * Seconds between one judgement and the next.
   *
   * The one thing on any of these tables that is not answered by standing
   * somewhere else. It picks somebody, counts, and then kills them outright
   * unless they are above a line when it lands — so the answer belongs to
   * whoever can move a health bar, and it has to be paid before the count
   * runs out rather than after the hit, which is where healing normally sits.
   *
   * What that costs a healer is not throughput, it is attention: the marked
   * are rarely the most hurt person in the raid, so answering means looking
   * away from the body the rotation would otherwise pick.
   */
  verdict: number
  /**
   * Seconds between one crush and the next.
   *
   * The band of floor the melee stand in, announced and then caved in.
   *
   * It was written as the answer to a mechanic that is no longer here. The
   * sweep hit the same band with no warning at all and measured at exactly
   * zero points of teaching, because the question it asked was "are you melee"
   * and a role is not a skill; this announced itself a second ahead and turned
   * the same band into a moment of judgement. The sweep has since been deleted
   * for the same reason it taught nothing — it could not be seen — and this
   * one is now simply the mechanic, rather than the reply to one.
   */
  crush: number
  /**
   * Seconds between one pass of the hand and the next.
   *
   * A wedge anchored on the boss that fires, turns, and fires again, five
   * times to a cast. Every other shape in this game is answered by finding
   * the spot it is not: the pool says leave where you stand, the cone says
   * get behind, the ring says come in, and once the answer is taken it is
   * taken. This one moves onto the answer.
   *
   * What that costs is not a step, it is the *direction* of the step. The
   * floor the hand has just left is the floor that is safe next, and the
   * floor a pace ahead of it is the floor that is about to stop being floor,
   * so a raid that reads the shape and not its bearing walks into the pulse
   * after the one it dodged. There is no place to end up: there is only
   * being behind it, again, on every beat.
   */
  hand: number
  /**
   * Seconds between one echo and the next.
   *
   * A mark that answers itself, a beat late. The floor under whoever carries
   * it gives way on the boss's drum for as long as it lasts, so standing
   * still is the one thing that cannot be done with it — and unlike the
   * brand, which asks for one walk to somewhere the raid was not using, this
   * asks for the walk again before the last one has finished being paid for.
   */
  echo: number
  /**
   * Seconds between one fault and the next.
   *
   * A line drawn across the arena, and the half of the floor on one side of
   * it is condemned. The crush asks the melee whether they noticed; this asks
   * the whole raid, because a half-plane through the boss does not care where
   * anybody's role stands — the tank at fifty-two and a caster at two hundred
   * are on one side of it or the other on the same terms.
   *
   * The bearing is rolled every cast, so it is read off the floor rather than
   * remembered. What it costs is the crossing: the answer is always the same
   * shape and never the same direction.
   */
  fault: number
  /**
   * Seconds between one drowning of the floor and the next.
   *
   * The inverse of every other piece of hazardous ground here. A pool says
   * leave where you stand and a fault says leave that half; this condemns the
   * arena and leaves a few patches of it standing, so the answer is not a
   * step off something but a walk to somewhere, chosen from three.
   *
   * It is the gathering's opposite as well, and deliberately: the circle asks
   * the whole party into one place, which is a mechanic that gets easier the
   * more bodies there are to divide it between. Three patches ask each body
   * the same question whatever the headcount, and nothing here collides, so a
   * raid of twenty-five is not punished for being a crowd.
   */
  shallows: number
  /**
   * Seconds between one schism and the next.
   *
   * The other half of the same question. Instead of moving the whole party at
   * once it cuts the party into groups and asks that the groups do not touch,
   * which is the one demand on this table a body standing perfectly still can
   * fail — what catches you is that somebody else walked toward you.
   */
  schism: number
  /**
   * Seconds between one vigil and the next.
   *
   * The first thing on any of these tables whose answer is not a place at
   * all. Everything above it is a shape and a step: be over there, be behind
   * it, be inside it, be apart from them. This is a shape nobody can leave --
   * it covers the arena -- and what it judges is not where a body is but
   * whether it was *doing* anything at the instant it seals.
   *
   * So the answer is to stop. Hold the button, let the global run out, and
   * stand there hitting nothing while the count finishes. What it costs is
   * the one currency no dodge has ever billed here: not the walk out and back
   * but the seconds of a rotation, paid by everybody at once, and paid
   * whether or not the raid was standing anywhere in particular.
   */
  vigil: number
  /**
   * Seconds between one chant and the next.
   *
   * The vigil turned over, and the only demand in the game that asks one
   * person to act rather than everybody to refrain. The boss begins a long
   * note, names one body, and that body has to cut it -- and if it does not,
   * the note lands on the whole raid.
   *
   * Nobody else has an answer. Every other mechanic that involves a second
   * person hands them a job as well: the weight has to be taken, the yoke has
   * to be joined, the split has to be sorted into. This hands twenty-four
   * people nothing to do but find out, a beat later, whether the
   * twenty-fifth was quick. That is the mechanic -- a raid is only as fast as
   * the one it happened to name, and it is a different one every time.
   */
  chant: number
  /**
   * Seconds between one gaze and the next.
   *
   * The third of the same family, and the one that cannot be answered by
   * stopping or by starting. It opens, and at the instant it opens it takes
   * everyone still turned toward the boss.
   *
   * Which is everybody, always: a party fights what it is looking at, so the
   * default state of every body in this game is the failing one. There is no
   * ground to read and no shape to leave -- the whole of it is a bearing held
   * by a person rather than by the floor, and the only way to hold the right
   * one is to have started turning before the count ran out.
   */
  gaze: number
  puddle: number
  spread: number
  slam: number
  puddleCount: number
  /** Unavoidable party-wide damage; the healer's actual test. */
  raid: number
  /** 0 disables the mechanic for that phase. */
  breath: number
  shockwave: number
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
   * Seconds between one breath out and the next.
   *
   * Everything it took, returned at once. Lethal at three breaths to a raid
   * that has not been inoculated, which is what makes the spore a mechanic
   * rather than a chore — and why it will not be thrown without one.
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
   * Physical damage to everyone standing in reach.
   *
   * The only thing the boss does that armour answers — everything else it
   * throws is magic, which is why plate on a melee dealer was a line in a
   * table rather than a reason to bring one.
   */
  /** A dot on somebody. Slow, unavoidable, and the healer's to solve. */
  rot: number
  /**
   * How often the armour break lands on whoever is holding the boss.
   *
   * The one mechanic aimed at the tanks rather than at the raid: it stacks on
   * the current target and makes everything physical hurt more, so a party
   * with two of them trades the boss and a party with one has to survive the
   * top of the stack. Every other mechanic here is answered by moving; this
   * one is answered by deciding who is standing there — which is why no boss
   * puts it on its ladder before the fourth rung, since a five-man fields one
   * tank and is not allowed to answer it.
   */
  sunder: number
  /**
   * How often the whole party has to stand in one circle.
   *
   * The inverse of spread, and the only mechanic here that asks the party to
   * do something *together* rather than each get themselves out of the way.
   * What lands is divided by however many stood in it and then dealt to
   * everybody, so being outside does not save you — it costs the people who
   * went.
   */
  soak: number
  /**
   * How often something picks one of you and walks after it.
   *
   * The only mechanic here aimed at a single person, and the only one with
   * two answers: the one it picked runs, and everybody else decides whether
   * to chase it down or keep hitting the boss. Every other hostile in this
   * game goes for whoever is nearest, which the party answers by standing
   * somewhere else.
   */
  hunt: number
  /**
   * Seconds between one burden and the next.
   *
   * A weight that has to change hands. It lands on a fraction of the raid,
   * counts down, and the only way it comes off is by being walked into
   * somebody who has not held it yet — three fresh pairs of hands and it is
   * spent. Miss the window and it goes off on whoever is still holding it,
   * for more the further along the chain it got.
   *
   * The whole mechanic is the handoff. Every other mark in this game is
   * answered by the person wearing it and nobody else: a brand is walked to
   * empty floor, a spread is walked away from the raid, a stalker is kited.
   * This one cannot be answered alone at all, because the answer is another
   * body, and the body has to be one that has not already taken its turn.
   */
  burden: number
  /**
   * Seconds between one yoke and the next.
   *
   * The other half of the same idea, with the debt shared instead of passed.
   * It matures on the one it picked and the damage is divided among everyone
   * standing close enough to take a piece of it. Alone it kills them; four
   * deep it is a heavy hit nobody remembers.
   *
   * It is the gathering read the other way round. The gathering is a circle
   * on the floor and the raid walks to a place; this is a circle on a person
   * and the raid walks to *them*, while they are still trying to answer
   * everything else the fight is asking. That is the difference between
   * standing somewhere and being met.
   */
  yoke: number
  /**
   * Seconds between one knell and the next.
   *
   * Something surfaces that has to be broken before it finishes, and it is
   * the one hostile in this game that is not hurting anybody. That is the
   * whole read. A rotation aimed at whatever is currently doing damage has no
   * reason to look at it, so the raid has to decide to leave the health bar
   * it was working on for one that is not asking to be worked on — and it has
   * to decide inside the count, because what the count ends in is a note the
   * whole raid pays for.
   *
   * The thralls are the same sentence with the read taken out: they walk in
   * and hit somebody, so the party is already aimed at them and there is no
   * instant at which a raid either did the thing or did not. Measured, that
   * is worth nothing. This one has an instant.
   *
   * And measured, it is the one of the three that does not earn a rung.
   * Against a Warden over paired seeds:
   *
   *     5 heroic     0.0pp
   *    10 heroic     7.0 +/- 3.0, removes 41%
   *    25 heroic     0.0pp
   *
   * It fires perfectly well at the sizes where it reads zero -- a twenty-five
   * man pull hung nine bells, broke seven and let two finish -- and nobody
   * died of either of them. The reason is the shape of the bill rather than
   * anything about the read: what a finished count costs is one hit spread
   * across the whole raid, and a hit spread across a raid is a rate, which is
   * what healing is. Thin enough to be survivable at ten, a bigger raid's
   * healers absorb it outright; one step heavier and the ten-man wipes. There
   * is no number between the two, so this wants a per-size weight on the boss
   * carrying it rather than a rung of its own. See `docs/mechanic-rules.md`.
   */
  knell: number
  /**
   * Seconds between one vessel and the next.
   *
   * The knell read backwards, and the reason both exist. This one *does* walk
   * in and hit somebody, so every rule the party has says kill it — and
   * killing it is the failure. It carries what the boss swallowed, it gives
   * it back to whoever broke it open, and if it is left alone it sinks on its
   * own clock and costs nothing but the swings it landed.
   *
   * What it asks for is restraint, which is the one thing a damage rotation
   * has no vocabulary for. The bill goes to the bodies that actually struck
   * it rather than to the raid, so the mechanic is not a coin flip on the
   * greediest dealer in the party: everyone who held off is clear, and
   * everyone who did not pays for themselves.
   *
   * Measured against a Warden over paired seeds:
   *
   *     5 heroic    37.8pp +/- 8.9, removes 40%
   *    10 heroic     7.5   +/- 2.5, removes 39%
   *    25 heroic    33.3   +/- 2.6, removes 76%
   *
   * Real at every size, and three or four times the mechanic at the sizes
   * either side of the one it was tuned at -- 94% of unpractised five-mans
   * die to it. A near-lethal bill per body caught super-scales the way area
   * denial does, so this wants a cap on how many bills one instant may write,
   * or a rung a five-man cannot reach.
   */
  vessel: number
  /**
   * Seconds between one toll and the next.
   *
   * A plate laid out past where the raid stands, a count, and a price that is
   * paid by exactly one body or by all of them. Nobody is marked and nothing
   * is aimed: what the boss asks for is a name, and the raid has to produce
   * one before the count runs out.
   *
   * It is the judgement's opposite number. The judgement picks somebody and
   * the raid answers; this picks nobody and the raid has to do the picking,
   * which is the one demand on this table that is a decision before it is a
   * walk. The choice is real because the price is flat: it is a scratch on
   * whoever still has most of a bar and it finishes whoever does not.
   */
  toll: number
  /**
   * Seconds between one grasp and the next.
   *
   * A reach that closes on a piece of floor and takes hold of the single body
   * left nearest to it. Everything else here that lands on ground bills
   * everyone standing in it; this bills one, and it bills them for the others
   * as well -- the more of the raid that was still inside when it closed, the
   * more the one it caught pays.
   *
   * So there is no safety in a crowd and none in being outside a line either.
   * There is only being further out than somebody else, and the raid decides
   * who that is by who it leaves behind.
   */
  grasp: number
  /**
   * Seconds between one refuge and the next.
   *
   * Stones enough for exactly the bodies it marks, and one body to a stone.
   * The shallows leave three patches and every one of them holds the whole
   * raid; these hold one each, so the question is not where the floor is, it
   * is which piece of it is yours -- and a body that walks to the nearest one
   * without asking who else was walking there has taken somebody's place
   * rather than found its own.
   *
   * Nobody has to pay it. That is the design rather than a softness: a
   * mechanic one stone short kills somebody on every cast however well it is
   * answered, which is a fixed bill and not a lesson.
   */
  refuge: number
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
    brand: number
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
    spire: number
    verdict: number
    crush: number
    schism: number
    vigil: number
    chant: number
    gaze: number
    hand: number
    echo: number
    fault: number
    shallows: number
    puddle: number
    spread: number
    slam: number
    raid: number
    breath: number
    shockwave: number
    adds: number
    rot: number
    sunder: number
    soak: number
    hunt: number
    burden: number
    yoke: number
    knell: number
    vessel: number
    toll: number
    grasp: number
    refuge: number
  }
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
    breath: string
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
    shockwave: string
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
    /** Empty where the boss does not use the mechanic. */
    rot: string
    sunder: string
    brand: string
    verdict: string
    crush: string
    /**
     * Every boss has one of these, where most lines are empty on the bosses
     * that do not own the mechanic.
     *
     * The floor giving way is not on anybody's ladder — where it belongs on
     * one is a question about the shape of a fight rather than about the
     * mechanic — so nothing says these lines today. They are kept because the
     * mechanic is kept: the day it is put on a ladder, the fight that gets it
     * has to have a word for it, and an empty string is a mechanic that goes
     * off in silence.
     */
    fault: string
    shallows: string
    /** Unplaced too, and for the same reason. See `fault` above. */
    spire: string
    soak: string
    hunt: string
    hand: string
    echo: string
    burden: string
    yoke: string
    /**
     * Authored on every boss rather than on the one that throws it.
     *
     * The rule everywhere else on this table is that a boss has a line for a
     * mechanic exactly when its ladder has a rung for it, and that rule is
     * checked. This one is on no ladder at all yet — where it belongs is a
     * question about which fight wants the demand, and it is not answered
     * here — so every boss carries a key for it, empty, the way the fault and
     * the shallows do.
     */
    schism: string
    /**
     * The three whose answer is an instant rather than a place.
     *
     * On no ladder, for the reason the fault and the shallows are on none:
     * which fight wants which demand is a question about the shape of a
     * boss, and it is not answered here. Keyed and empty everywhere.
     */
    vigil: string
    chant: string
    gaze: string
    /**
     * The two that are answered by target rather than by footing. On no
     * ladder either, and empty everywhere for the reason above.
     */
    knell: string
    vessel: string
    /**
     * The three that belong to the round about who pays. Authored on every
     * boss for the schism's reason above: none of them has a rung anywhere
     * yet, where they belong is a question about the shape of a fight rather
     * than about the mechanic, and a fight that takes one on should not also
     * have to be given a voice for it.
     */
    toll: string
    grasp: string
    refuge: string
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
    names: { slam: 'SABER LASH', breath: '', shard: '', raid: 'THE GRINDING' },
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
      adds: '',
      shockwave: '',
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
      rot: '',
      sunder: '',
      brand: '',
      verdict: '',
      crush: '',
      fault: '',
      shallows: '',
      spire: '',
      soak: '',
      hunt: '',
      hand: '',
      echo: '',
      burden: '',
      yoke: '',
      schism: '',
      vigil: '',
      chant: '',
      gaze: '',
      knell: '',
      vessel: '',
      toll: '',
      grasp: '',
      refuge: '',
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
    names: { slam: 'A WORD OF ENDING', breath: '', shard: 'WINTER SHARD', raid: 'SETTLING COLD' },
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
      adds: 'The faithful answer',
      shockwave: '',
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
      rot: '',
      sunder: '',
      brand: '',
      verdict: '',
      crush: '',
      fault: '',
      shallows: '',
      spire: '',
      soak: '',
      hunt: '',
      hand: '',
      echo: '',
      burden: '',
      yoke: '',
      schism: '',
      vigil: '',
      chant: '',
      gaze: '',
      knell: '',
      vessel: '',
      toll: '',
      grasp: '',
      refuge: '',
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
    names: { slam: 'GORGE', breath: '', shard: '', raid: 'BAD AIR' },
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
      1: { swing: 2.1, slam: 17, puddleCount: 1, raid: 13, ...beats({ blight: 3.2, bloat: 11, vilegas: 17, spore: 24, inhale: 33, pungent: 99 }) },
      2: { swing: 1.9, slam: 15, puddleCount: 1, raid: 12, ...beats({ blight: 2.8, bloat: 10, vilegas: 15, spore: 21, inhale: 29, pungent: 87 }) },
      3: { swing: 1.7, slam: 13, puddleCount: 1, raid: 11, ...beats({ blight: 2.4, bloat: 9, vilegas: 13, spore: 18, inhale: 25, pungent: 75 }) },
    },
    opening: { slam: 12, raid: 14, ...beats({ blight: 3.5, bloat: 10, vilegas: 16, spore: 20, inhale: 30, pungent: 90 }) },
    lines: {
      phaseTwo: 'The air thickens',
      phaseThree: 'BREATHE IT ALL',
      adds: '',
      shockwave: '',
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
      rot: '',
      sunder: '',
      brand: '',
      verdict: '',
      crush: '',
      fault: '',
      shallows: '',
      spire: '',
      soak: '',
      hunt: '',
      hand: '',
      echo: '',
      burden: '',
      yoke: '',
      schism: '',
      vigil: '',
      chant: '',
      gaze: '',
      knell: '',
      vessel: '',
      toll: '',
      grasp: '',
      refuge: '',
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

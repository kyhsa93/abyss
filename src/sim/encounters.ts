import type { DifficultyId, RaidSize } from './classes'

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
 * `floor.ts` prices these and `boss.ts` schedules them; this is the list both
 * of them agree on. Everything a boss or a floor can ask for is here, and
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
  | 'adds'
  | 'sweep'
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
  | 'mirror'
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
  sweep: false, // whoever is in reach, which is the melee
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
  mirror: true, // one more body is one more mouth that has to shut
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
 * which has to touch all of them cannot quietly miss one. It used to be spelt
 * out by hand in `planned()` and `brand` was left off, which meant a descent
 * floor threw a mark nobody had paid for.
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
  sweep: 'the sweep',
  rot: 'rot',
  sunder: 'the armour break',
  soak: 'the gathering',
  hunt: 'the stalker',
  hand: 'the hand',
  echo: 'the echo',
  burden: 'the burden',
  yoke: 'the yoke',
  schism: 'the schism',
  vigil: 'the vigil',
  chant: 'the chant',
  gaze: 'the gaze',
  knell: 'the knell',
  vessel: 'the vessel',
  mirror: 'the mirror',
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
   * The sweep's opposite number, and the reason it exists. Both hit the band
   * of floor the melee stand in; the sweep does it with no warning at all and
   * measures at exactly zero points of teaching, because the question it asks
   * is "are you melee" and a role is not a skill. This one announces itself
   * and lands about a second later, so the same band becomes a moment of
   * judgement instead — step out, and pay for it in the walk back.
   */
  crush: number
  /**
   * Seconds between one sweep of the hand and the next.
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
   * The mirror of the vigil, and the only demand in the game that asks one
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
  adds: number
  /**
   * Physical damage to everyone standing in reach.
   *
   * The only thing the boss does that armour answers — everything else it
   * throws is magic, which is why plate on a melee dealer was a line in a
   * table rather than a reason to bring one.
   */
  sweep: number
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
   * Seconds between one mirror and the next.
   *
   * The boss goes still, and for as long as it does, everything landed on it
   * is landed on whoever landed it. Nothing here is a place, so nothing here
   * is answered by a step: the answer is to stop, and then to start again,
   * and the cost of reading it early is the same seconds of uptime the crush
   * charges for the walk out.
   *
   * It judges at the instant the surface breaks rather than as the hits go
   * in, which is deliberate. A reflection paid out per hit is proportional
   * damage, and proportional damage averages skill out — a raid a tenth of a
   * second late takes a tenth of a second's worth and nobody dies of it. One
   * bill at one moment for everybody who touched it is a moment a raid either
   * passed or did not.
   *
   * Measured against a Warden over paired seeds:
   *
   *     5 heroic    49.0pp +/- 6.1, removes 49%
   *    10 heroic    19.8   +/- 1.0, removes 62%
   *    25 heroic    51.5   +/- 1.6, removes 53%
   *
   * The strongest thing on this table except the cone, and it carries the
   * vessel's caveat twice over: every unpractised five-man and 96.5% of
   * unpractised twenty-fives die to it. It also depends on the hold reaching
   * the weapons rather than only the buttons -- with auto-attacks left
   * ungated it is worth exactly 0.0 points and both ends of the practice
   * curve wipe, because a swing nobody decided on marks everybody anyway.
   */
  mirror: number
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
  hp: number
  /** Seconds before the fight is lost outright. */
  enrage: number
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
   * is the problem: the three bosses do not sit the same way at the same size.
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
   * The order is the whole design. Three bosses whose first two rungs overlap
   * are three bosses that open the same way, and the opening is the only part
   * of a fight everybody sees: a party that wipes at forty percent has met
   * two mechanics and no more. So the first rungs are disjoint across all
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
    sweep: number
    rot: number
    sunder: number
    soak: number
    hunt: number
    burden: number
    yoke: number
    knell: number
    vessel: number
    mirror: number
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
  /** What the two casts are called. Empty where the boss never casts it. */
  names: {
    slam: string
    breath: string
  }
  lines: {
    phaseTwo: string
    phaseThree: string
    adds: string
    shockwave: string
    /** Empty where the boss does not use the mechanic. */
    sweep: string
    rot: string
    sunder: string
    brand: string
    verdict: string
    crush: string
    /**
     * Every boss has one of these, where most lines are empty on the bosses
     * that do not own the mechanic.
     *
     * The floor giving way is not on anybody's ladder yet — where it belongs
     * on one is a question about the shape of a fight rather than about the
     * mechanic — but a descent floor can already be handed it, and a descent
     * borrows whichever boss it likes for its shape. A mechanic that any of
     * the three can throw needs a line from all three.
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
     * here — so every boss carries a voice for it, the way the fault and the
     * shallows do, and it already has something to say if it takes a rung.
     */
    schism: string
    /**
     * The three whose answer is an instant rather than a place.
     *
     * On no ladder, for the reason the fault and the shallows are on none:
     * which fight wants which demand is a question about the shape of a
     * boss, and it is not answered here. Every boss carries a voice for them
     * so that whichever one takes a rung already has something to say.
     */
    vigil: string
    chant: string
    gaze: string
    /**
     * The three that are answered by target rather than by footing.
     *
     * On no ladder either, and authored on every boss for the reason the
     * fault and the shallows are: a descent can be handed any of them
     * tomorrow, and a mechanic three bosses can all throw needs a voice from
     * all three.
     */
    knell: string
    vessel: string
    mirror: string
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

export const ENCOUNTERS: Encounter[] = [
  {
    // The ground fight. Nothing to get behind and nothing to run into: what it
    // does is make the floor unusable and then punish whoever is still
    // standing in reach of it, and at the sizes that field a second tank it
    // starts asking who that is.
    id: 'warden',
    name: 'The Drowned Warden',
    short: 'Warden',
    demand: 'the floor, and whoever is standing on it',
    /**
     * Raised from 36,000 when the party got weapons.
     *
     * Auto-attacks add about eleven percent to what the raid actually lands —
     * measured rather than assumed, because their theoretical uptime is
     * nothing like their real one: melee walk out of puddles, lose range and
     * die. Left alone that turned a 43% first pull into a 73% one. The health
     * follows the damage, and by the same fraction at five, ten and
     * twenty-five, so one number covers every size.
     *
     * Raised again from 40,000 for crits, which add about seven and a half
     * percent at a chance of fifteen and a multiplier of one and a half. The
     * encounter should be the length it was: what a crit changes is how a hit
     * looks, not how long the fight runs.
     *
     * Cut back to 41,000 when the ladders arrived. A five-man on normal used
     * to meet eight mechanics here and now meets two, and a health bar tuned
     * against the eight is a health bar the two cannot chew through before the
     * enrage — the fight would have become long rather than easy, which is the
     * worse of the two failures.
     */
    hp: 58000,
    enrage: 240,
    phaseTwoHp: 0.7,
    phaseThreeHp: 0.4,
    swingDamage: 621,
    slamDamage: 1322,
    raidDamage: 168,
    mechanicDamage: 0.75,
    // The floor is the one demand that gets strictly worse with bodies: more
    // people means more ground given away per cast, into an arena that does
    // not grow. Six rungs of it wiped every practised twenty-five man.
    sizeMechanic: { 25: 0.8 },
    accent: '#ef4444',
    // No cone and nothing to run into: the only thing it casts is the one
    // that lands on whoever is holding it.
    names: { slam: 'ABYSSAL SLAM', breath: '' },
    // Six rungs, and the sixth is not sold to anybody: `kitCount` tops out at
    // five, so the hand is a mechanic this boss owns, names and can throw
    // without any raid meeting it tonight.
    //
    // That is on purpose rather than for want of a decision. Every reachable
    // rung on all three ladders is already load-bearing — the armour break
    // has to sit above the size that fields one tank, the pool has to sit
    // where a ten-man meets it, and no boss's kit may be another's — so
    // putting a new mechanic where a raid meets it means taking one of those
    // out, and the thirteen that are there were each measured into place.
    // What the hand is worth is measured and written down where it lives; a
    // rung for it is a separate decision about the other thirteen.
    ladder: ['puddle', 'grasp', 'rot', 'brand', 'sunder', 'soak'],
    phases: {
      1: { swing: 2.0, slam: 16, puddleCount: 1, raid: 9, ...beats({ brand: 8, grasp: 11, puddle: 9, rot: 33, sunder: 11, soak: 40 }) },
      2: { swing: 1.7, slam: 13, puddleCount: 2, raid: 8, ...beats({ brand: 7, grasp: 9.5, puddle: 8, rot: 27, sunder: 9, soak: 34 }) },
      3: { swing: 1.5, slam: 11, puddleCount: 2, raid: 7, ...beats({ brand: 6, grasp: 8.5, puddle: 7, rot: 22, sunder: 8, soak: 28 }) },
    },
    opening: { slam: 13, raid: 11, ...beats({ brand: 8, grasp: 8, puddle: 9, rot: 22, sunder: 14, soak: 34 }) },
    lines: {
      phaseTwo: 'The tide rises!',
      phaseThree: 'DROWN WITH ME',
      adds: '',
      shockwave: '',
      sweep: '',
      rot: 'Rot on me — need a heal',
      sunder: 'Your guard breaks',
      brand: 'It is burning through me — clear ground',
      verdict: '',
      crush: '',
      fault: '',
      shallows: '',
      spire: '',
      soak: 'The undertow gathers — all of you',
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
      mirror: '',
      toll: '',
      grasp: 'Something is reaching up — off that ground',
      refuge: '',
    },
  },
  {
    // Nothing to dodge that a healer can dodge for you. The floor is quiet and
    // the raid damage never stops, so this is the one that ends on mana — and
    // everything it does lands on one person at a time.
    id: 'choir',
    name: 'The Choir Beneath',
    short: 'Choir',
    demand: 'stay apart, and out-heal the singing',
    hp: 46000,
    enrage: 230,
    phaseTwoHp: 0.65,
    phaseThreeHp: 0.35,
    swingDamage: 540,
    slamDamage: 1127,
    raidDamage: 138,
    // 1.35 while the spread — this boss's own signature — was not reading
    // this number at all. `detonateSpread` applied its damage straight, so the
    // dial reached the rungs that buy a puddle and missed the two that are a
    // spread and a rot. Now that everything goes through one funnel the same
    // fight is harder at the same number, and this is where it lands.
    mechanicDamage: 0.5,
    // The opposite problem: this is the boss a twenty-five man loses to. Its
    // last rung buys `adds`, and a wave of them against a raid already holding
    // a spread, a hunt and a puddle is the one place the size stops helping.
    // The five-man weight came up with the ladder. 0.82 was set while this
    // boss's first three rungs were a spread, a rot and a stalker — nothing
    // that punishes a mistake — so the number was holding down a fight that
    // was not going to hurt anybody anyway. With a puddle on the third rung it
    // was holding down a fight that could, and both five-man rungs were won as
    // often on a first pull as a ninth.
    sizeMechanic: { 5: 0.94, 25: 0.7 },
    accent: '#e879f9',
    names: { slam: 'DISCORDANT CHORD', breath: '' },
    // `puddle` third rather than fourth, and quicker than it was.
    //
    // Measured one mechanic at a time against a raid that has never seen the
    // fight, only two of the thirteen mechanic-and-boss pairs in this game
    // teach anything: the Warden's puddle costs an unpractised raid 31 points
    // of survival over a practised one, and the Tidebreaker's cone 29. Every
    // other pair lands between 0 and 5, which is to say the rung is passed or
    // failed on arrival and practice does not move it.
    //
    // The Choir held one of the two and had it on the fourth rung, where only
    // a ten-man heroic and above ever met it — and set so gently that the same
    // mechanic taught 2 points here against the Warden's 31. Its first three
    // rungs were a spread, a rot and a stalker, worth 2, 0 and 0. There was
    // nothing in them to learn, and the win rate said so: the ten-man normal
    // was won as often on a first pull as on a ninth.
    //
    // Third is as early as it can go. The three bosses must open on nothing in
    // common and the Warden opens with this, so the first two rungs are spoken
    // for whatever they hold.
    // The echo on a sixth rung, for the reason the Warden's hand is on one:
    // owned and named and thrown by the descent, and not yet taking a rung
    // away from the four that a ten-man heroic already meets here.
    ladder: ['verdict', 'chant', 'spread', 'echo', 'refuge', 'schism'],
    phases: {
      1: { swing: 2.1, slam: 18, puddleCount: 1, raid: 7, ...beats({ verdict: 19, echo: 13, spread: 11, schism: 12.0, chant: 12, refuge: 16 }) },
      2: { swing: 1.9, slam: 16, puddleCount: 1, raid: 6, ...beats({ verdict: 16, echo: 11, spread: 9, schism: 10.5, chant: 10.5, refuge: 14 }) },
      3: { swing: 1.8, slam: 14, puddleCount: 1, raid: 5.5, ...beats({ verdict: 13.5, echo: 9.5, spread: 8, schism: 9.0, chant: 9, refuge: 12 }) },
    },
    opening: { slam: 15, raid: 9, ...beats({ echo: 10, verdict: 11, spread: 8, schism: 8.0, chant: 10, refuge: 11.5 }) },
    lines: {
      phaseTwo: 'Sing louder',
      phaseThree: 'THE CHOIR TAKES YOU',
      adds: '',
      shockwave: '',
      sweep: '',
      rot: '',
      sunder: '',
      brand: '',
      verdict: 'It has judged me — heal through it',
      crush: '',
      fault: '',
      shallows: '',
      spire: '',
      soak: '',
      hunt: '',
      hand: '',
      echo: 'The floor is answering me — I cannot stand still',
      burden: '',
      yoke: '',
      schism: 'Take your parts — apart',
      vigil: '',
      chant: 'The note is mine to break',
      gaze: '',
      knell: '',
      vessel: '',
      mirror: '',
      toll: '',
      grasp: '',
      refuge: 'Take a stone and hold it alone',
    },
  },
  {
    // The opposite problem: nothing on the floor to stand in, and almost no
    // time standing anywhere. Rings to run into, a cone to get behind, and
    // something new to hit every time you have settled on a target.
    id: 'tidebreaker',
    name: 'The Tidebreaker',
    short: 'Tidebreaker',
    demand: 'come in, get behind, change target',
    hp: 54000,
    enrage: 250,
    phaseTwoHp: 0.75,
    phaseThreeHp: 0.4,
    swingDamage: 730,
    slamDamage: 1700,
    raidDamage: 265,
    // 2.55 while the shockwave was carrying the whole fight on its own. Once
    // the ring stopped deciding it — see `SHOCKWAVE_BAND` — every rung came
    // out at 95-100%, because the rest of the boss had never had to do
    // anything. This is what the rest of it is worth.
    mechanicDamage: 1.15,
    // A twenty-five man walked over this fight once the shockwave stopped
    // deciding it — 97% at the top of the practice curve. Five percent is all
    // it takes: healing covers about two fifths of what a raid takes, and past
    // that line the first death starts a spiral no dial can catch. Fifteen
    // percent put the same rung at zero.
    // Re-cut once the ring started working. The old line was fitted while the
    // shockwave hit nobody, so it was paying for a boss with four mechanics
    // rather than five; the five-man felt it worst, because a two-rung kit is
    // paid back as tempo and the rung that comes round fastest is the one a
    // live ring punishes hardest.
    // The twenty-five entry came with the sixth rung. Six mechanics at full
    // cadence against a raid that big wiped every practised pull; at 0.85 it
    // is a fight that is lost on a first attempt and won by the ninth, and at
    // 0.7 it is not a fight at all. Another cliff, and the usable width of it
    // is about a tenth.
    sizeMechanic: { 10: 1.1, 25: 0.85 },
    accent: '#22d3ee',
    names: { slam: 'SHATTERING BLOW', breath: 'RIPTIDE BREATH' },
    // The ring ahead of the sweep, which is the one change here that is not
    // a number. A five-man on normal buys the first three rungs, and with the
    // sweep among them it bought a mechanic measured at zero -- the fight was
    // won on a first pull as reliably as on a ninth at every weight, because
    // there was nothing in it to learn. The sweep is a fourth-rung mechanic:
    // real enough to be in the fight, not enough to be an opening.
    ladder: ['breath', 'shockwave', 'hunt', 'sweep', 'fault', 'shallows'],
    phases: {
      1: { swing: 1.9, slam: 14, puddleCount: 1, raid: 11, ...beats({ breath: 11, shockwave: 16, sweep: 32, fault: 10, shallows: 10, hunt: 44 }) },
      2: { swing: 1.7, slam: 12, puddleCount: 1, raid: 10, ...beats({ breath: 9.5, shockwave: 13, sweep: 28, fault: 9, shallows: 9, hunt: 38 }) },
      3: { swing: 1.5, slam: 10, puddleCount: 1, raid: 9, ...beats({ breath: 8, shockwave: 10.5, sweep: 23, fault: 8, shallows: 8, hunt: 32 }) },
    },
    opening: { slam: 11, raid: 13, ...beats({ breath: 10, shockwave: 15, sweep: 23, fault: 10, shallows: 9, hunt: 45 }) },
    lines: {
      phaseTwo: 'The water turns',
      phaseThree: 'NOTHING STANDS',
      adds: '',
      shockwave: 'The undertow',
      sweep: 'Wide swing — out of reach',
      rot: '',
      sunder: '',
      brand: '',
      verdict: '',
      crush: '',
      fault: 'The seabed breaks open',
      shallows: 'The tide takes the ground',
      spire: '',
      soak: '',
      hunt: 'It has your scent',
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
      mirror: '',
      toll: '',
      grasp: '',
      refuge: '',
    },
  },
  {
    // The boss that reads what you were doing rather than where you were
    // standing. Nothing it throws is answered by a step: the raid stops, or
    // turns away, or leaves something alone, and every one of those is a
    // refusal rather than a movement. It is the only fight here a body can
    // fail without moving an inch, and the only one where the price of
    // getting it right is paid in uptime instead of in health.
    id: 'watcher',
    name: 'The Unblinking Watch',
    short: 'Watcher',
    demand: 'stop, look away, and leave it whole',
    hp: 36000,
    enrage: 240,
    phaseTwoHp: 0.7,
    phaseThreeHp: 0.38,
    swingDamage: 600,
    slamDamage: 1250,
    raidDamage: 150,
    // Its whole kit was written and measured against the Warden's 1.7, and
    // three of the six were brutal there -- the reflection wipes every
    // unpractised five-man on that number. This is the dial that decides
    // whether a mechanic exists at all, so it starts a full notch under the
    // host they were fitted on and is moved from measurement rather than
    // from taste.
    mechanicDamage: 0.6,
    // Its bar is short because its kit is paid for in uptime -- a raid
    // fighting this one deals about two thirds of what the same raid deals
    // elsewhere, because half of what it is told to do is stop -- and the
    // weight at twenty-five is there because six of those demands at once
    // took the fight past the enrage rather than past the healers.
    sizeMechanic: { 25: 0.85 },
    accent: '#c084fc',
    names: { slam: 'UNBLINKING BLOW', breath: '' },
    ladder: ['mirror', 'gaze', 'vessel', 'vigil', 'adds', 'knell'],
    phases: {
      1: { swing: 2.0, slam: 15, puddleCount: 1, raid: 10, ...beats({ mirror: 19, gaze: 11, vessel: 23, vigil: 10, adds: 46, knell: 21 }) },
      2: { swing: 1.8, slam: 13, puddleCount: 1, raid: 9, ...beats({ mirror: 16.5, gaze: 9.5, vessel: 20, vigil: 9, adds: 40, knell: 18 }) },
      3: { swing: 1.6, slam: 11, puddleCount: 1, raid: 8, ...beats({ mirror: 14, gaze: 8, vessel: 17, vigil: 8, adds: 34, knell: 15 }) },
    },
    opening: { slam: 12, raid: 12, ...beats({ mirror: 10, gaze: 9, vessel: 14, vigil: 9, adds: 42, knell: 12 }) },
    lines: {
      phaseTwo: 'It has not looked away',
      phaseThree: 'IT SEES ALL OF YOU',
      adds: 'More eyes open',
      shockwave: '',
      sweep: '',
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
      vigil: 'IT IS COUNTING — PUT IT DOWN',
      chant: '',
      gaze: 'EYES DOWN',
      knell: 'Something is winding up — end it',
      vessel: 'That one is watching back — leave it',
      mirror: 'THE SURFACE CLOSES — HANDS OFF',
      toll: '',
      grasp: '',
      refuge: '',
    },
  },
  {
    // The boss that makes the raid choose a loser. Every rung asks the same
    // question in a different shape -- a plate one body has to stand on, a
    // debt somebody has to come and halve, a reach that bills whoever was
    // left nearest, a weight that has to reach fresh hands -- and none of
    // them can be answered by the body that was picked. What it costs is not
    // a reaction, it is a decision, and the fight is over whose it was.
    id: 'ledger',
    name: 'The Long Ledger',
    short: 'Ledger',
    demand: 'decide who pays, then pay it',
    hp: 52000,
    enrage: 245,
    phaseTwoHp: 0.72,
    phaseThreeHp: 0.4,
    swingDamage: 615,
    slamDamage: 1290,
    raidDamage: 158,
    // Its kit is the mildest in the game per cast -- five of the six bill one
    // body rather than the roster, which is the property that made them
    // teach at every size and also the property that makes them small. So it
    // sits above the Watcher and under the Warden, and the number is a
    // starting point rather than a finding.
    mechanicDamage: 0.45,
    // Both ends needed holding down and for opposite reasons. A five-man
    // meets three bills and has three bodies to nominate from, so the same
    // weight that a ten-man absorbs is most of a small raid; a twenty-five
    // man meets six and every one of them sends somebody out of the fight.
    // The ten is the size this boss was fitted at and it carries no weight.
    sizeMechanic: { 5: 0.75, 25: 0.6 },
    accent: '#f59e0b',
    names: { slam: 'CALLING IT IN', breath: '' },
    ladder: ['yoke', 'crush', 'burden', 'toll', 'spire', 'hand'],
    phases: {
      1: { swing: 2.0, slam: 15, puddleCount: 1, raid: 10, ...beats({ toll: 15, yoke: 10, crush: 9, burden: 4.6, spire: 20, hand: 14 }) },
      2: { swing: 1.8, slam: 13, puddleCount: 1, raid: 9, ...beats({ toll: 13, yoke: 8.5, crush: 8, burden: 4.0, spire: 18, hand: 12 }) },
      3: { swing: 1.6, slam: 11, puddleCount: 1, raid: 8, ...beats({ toll: 11, yoke: 7.5, crush: 7, burden: 3.5, spire: 16, hand: 10 }) },
    },
    opening: { slam: 12, raid: 12, ...beats({ toll: 10, yoke: 8.5, crush: 9, burden: 4.5, spire: 16, hand: 12 }) },
    lines: {
      phaseTwo: 'The account runs on',
      phaseThree: 'EVERY DEBT AT ONCE',
      adds: '',
      shockwave: '',
      sweep: '',
      rot: '',
      sunder: '',
      brand: '',
      verdict: '',
      crush: 'THE LEDGER COMES DOWN',
      fault: '',
      shallows: '',
      spire: 'The ground is standing up',
      soak: '',
      hunt: '',
      hand: 'THE LEDGER TURNS — KEEP BEHIND IT',
      echo: '',
      burden: 'This is on me — somebody take it off',
      yoke: 'They are carrying that alone — going to them',
      schism: '',
      vigil: '',
      chant: '',
      gaze: '',
      knell: '',
      vessel: '',
      mirror: '',
      toll: 'It wants one of us on the plate',
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
export function kitCount(size: number, difficulty: DifficultyId): number {
  // Three, so that the smallest fight anybody can buy is still a fight. Two
  // rungs meant a five-man on normal met one mechanic and its pair, and the
  // ladder above it was five steps of adding one thing to a fight that had
  // barely started -- which is also why two of the six rungs used to buy
  // bodies without buying an idea. Five bosses of six now, one mechanic to
  // each rung and no mechanic on two bosses, so a raid that climbs the whole
  // thing meets all thirty and meets each of them in exactly one fight.
  let rungs = 3
  if (size >= 10) rungs++
  if (size >= 25) rungs++
  if (difficulty === 'heroic') rungs++
  return rungs
}

/** Which mechanics this boss throws at this size and difficulty. */
export function encounterKit(
  encounter: Encounter,
  size: number,
  difficulty: DifficultyId,
): MechanicId[] {
  return encounter.ladder.slice(0, kitCount(size, difficulty))
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
 * A boss speaks for the six mechanics on its own ladder and is silent about
 * the other twenty-four, which is the rule that stops five fights sounding
 * like one. A descent floor is not one of the five: it borrows a boss for its
 * shape and then buys its own sentence out of the whole vocabulary, so it can
 * and does throw mechanics that boss has never had a word for. Left to read
 * the borrowed table it threw them in silence.
 *
 * So a floor announces from the mechanic's own name instead. It reads plainer
 * than an authored line, which is right: a floor is a fight nobody wrote.
 */
export function lineFor(encounter: Encounter, onAFloor: boolean, key: MechanicId): string {
  if (!onAFloor) return key in encounter.lines ? (encounter.lines as Record<string, string>)[key]! : ''
  if (encounter.ladder.includes(key)) {
    const own = key in encounter.lines ? (encounter.lines as Record<string, string>)[key]! : ''
    if (own !== '') return own
  }
  return `Here comes ${MECHANIC_NAMES[key]}`
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

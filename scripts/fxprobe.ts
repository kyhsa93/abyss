/**
 * What each mechanic actually shows you.
 *
 * A mechanic the player cannot see is a mechanic the player cannot learn, and
 * "cannot see" has three different shapes: nothing is drawn at all, something
 * is drawn for a handful of frames, or something is drawn but only on the
 * floor where a body standing on it hides it. This prints all three side by
 * side so the missing ones can be counted rather than guessed at.
 *
 * One mechanic at a time, through `only`, which is how the harness measures
 * teaching too -- a fight throwing six things at once cannot say which of them
 * emitted what.
 */
import { Rng } from '../src/sim/rng'
import { createState, unattended } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { ENCOUNTERS, MECHANIC_IDS, MECHANIC_NAMES, encounterKit, type MechanicId } from '../src/sim/encounters'
import { autoParty, pickFor } from '../src/sim/classes'

/** Under this, a person is looking at something that was already gone. */
const BLINK = 0.35

interface Seen {
  /** Seconds of floor telegraph, longest seen. */
  telegraph: number
  /** Effect kinds the boss pushed while it was the only thing firing. */
  fx: Set<string>
  sounds: Set<string>
  /** Auras it put on somebody, which the party frames and the token draw. */
  auras: Set<string>
  /** Seconds of boss cast bar, which is a warning that stands still. */
  cast: number
  /** A body walked onto the floor, which is the most visible thing there is. */
  bodies: boolean
  /** How many times it fired at all. */
  fired: number
}

/**
 * Auras a fight puts on a person rather than on the floor.
 *
 * Read off what the mechanics actually apply rather than listed by hand: an
 * aura the party gives itself is not the fight showing you anything.
 */
const BOSS_AURAS = new Set([
  'rot', 'sunder', 'spread', 'brand', 'echo', 'verdict', 'chant', 'burden', 'yoke',
  'vessel', 'gaze', 'vigil', 'toll', 'grasp', 'mirror', 'knell', 'refuge', 'schism',
])

const found = new Map<MechanicId, Seen>()

for (let e = 0; e < ENCOUNTERS.length; e++) {
  const kit = encounterKit(ENCOUNTERS[e]!, 25, 'heroic')
  for (const id of kit) {
    if (found.has(id)) continue
    const seen: Seen = { telegraph: 0, fx: new Set(), sounds: new Set(), auras: new Set(), cast: 0, bodies: false, fired: 0 }
    for (let n = 0; n < 3; n++) {
      const seed = 700 + n * 137
      const s = unattended(createState(seed, 8, autoParty(25, pickFor('mage', 'dps')!), 'heroic', e))
      s.only = id
      s.countdown = 0
      const rng = new Rng(seed)
      const known = new Set<number>()
      while (s.outcome === 'ongoing' && s.time < 150) {
        step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
        for (const g of s.ground) {
          if (known.has(g.id)) continue
          known.add(g.id)
          seen.fired++
          seen.telegraph = Math.max(seen.telegraph, g.telegraph)
        }
        // Only what the fight emitted, not what the party did to it. The
        // channel carries both, and the party's rotation is most of it: the
        // first draft of this counted a rogue's rupture as the mechanic's own
        // effect and reported that every mechanic in the game was covered.
        //
        // The boss's own swing and slam are dropped too. They run whatever the
        // kit is, so they are not evidence about the mechanic under test.
        for (const fx of s.effects) {
          const id = fx.abilityId ?? ''
          if (!id.startsWith('boss_')) continue
          // The herald is not evidence about anything. It is summoned by the
          // phase break, so it is standing in almost every run whatever the
          // kit is, and counting it made every mechanic in the game look like
          // it had a body attached.
          if (id === 'boss_slam' || id === 'boss_swing' || id === 'boss_herald') continue
          seen.fx.add(id)
        }
        // The channel a mechanic can speak on is narrow: of the twelve sounds
        // this game has, the ones that are not the party's own or the fight's
        // bookkeeping are `telegraph`, `shockwave` and `raid`.
        for (const sound of s.sounds) {
          if (sound === 'telegraph' || sound === 'shockwave' || sound === 'raid') {
            seen.sounds.add(sound)
          }
        }
        for (const a of s.actors) {
          if (a.faction !== 'party') continue
          for (const au of a.auras) if (BOSS_AURAS.has(au.id)) seen.auras.add(au.id)
        }
        // The fourth channel, and the one the first draft of this missed. A
        // boss cast bar is a warning that stands still and counts down where
        // the eye already is, which is a different and better thing than a
        // burst that is over in a fifth of a second.
        const boss = s.actors.find((a) => a.id === 100)
        if (boss?.castId && boss.castId !== 'boss_slam') {
          seen.cast = Math.max(seen.cast, boss.castTotal)
        }
        if (
          s.actors.some(
            (a) => a.faction === 'boss' && a.id !== 100 && a.alive && a.spawn !== 'herald',
          )
        ) {
          seen.bodies = true
        }
      }
    }
    found.set(id, seen)
  }
}

type Row = { telegraph: number; cast: number; auras: Set<string>; bodies: boolean }

/**
 * Where the evidence is, which matters as much as how long it lasts.
 *
 * A cast bar is counted apart from everything else on purpose. It lasts -- it
 * is not a flash -- but it is drawn on the boss frame at the top of the glass,
 * and this is a game played by reading the floor: every mechanic in it is a
 * shape under somebody's feet, so that is where the eye is. A warning that
 * only ever appears at the top of the screen is a warning aimed away from
 * where the player is looking.
 */
function channel(r: Row): 'field' | 'cast' | 'flash' {
  if (r.bodies || r.auras.size > 0 || r.telegraph > 0) return 'field'
  if (r.cast > 0) return 'cast'
  return 'flash'
}

/** The longest-lived thing this mechanic puts in front of a person. */
function standing(r: Row): number {
  if (r.bodies) return Infinity
  if (r.auras.size > 0) return Infinity
  return Math.max(r.telegraph, r.cast)
}

const rows = MECHANIC_IDS.filter((id) => found.has(id)).map((id) => {
  const seen = found.get(id)!
  return { id, name: MECHANIC_NAMES[id] ?? id, ...seen }
})

// What a person can look at while it is happening, as opposed to what flashes
// once and is gone. A floor shape lasts its telegraph; a cast bar lasts its
// cast; an aura sits on a frame until it expires; a summoned body stands there.
// A burst is 0.22 to 0.5 seconds, which is under the half second it takes to
// notice a thing and work out what it is -- so a mechanic whose only evidence
// is a burst is a mechanic that happened to you rather than one you saw.
console.log(
  'mechanic'.padEnd(22) + 'standing'.padStart(11) + 'where'.padStart(8) + '  what stays on screen',
)
let silent = 0
let brief = 0
for (const r of rows.sort((a, b) => standing(a) - standing(b))) {
  const shows =
    [
      ...[...r.fx].map((f) => f.replace('boss_', '')),
      ...[...r.auras].map((a) => `${a}(aura)`),
      ...(r.cast > 0 ? [`cast bar ${r.cast.toFixed(1)}s`] : []),
      ...(r.bodies ? ['a body'] : []),
    ].join(' ') || '—'
  const flag =
    r.fx.size === 0 && r.telegraph === 0
      ? '   <- nothing drawn'
      : r.telegraph > 0 && r.telegraph < BLINK
        ? '   <- gone in a blink'
        : ''
  if (channel(r) === 'flash') silent++
  else if (channel(r) === 'cast') brief++
  console.log(
    r.name.padEnd(22) +
      (standing(r) === Infinity
        ? 'stays'
        : standing(r) > 0
          ? `${standing(r).toFixed(2)}s`
          : 'a flash'
      ).padStart(11) +
      channel(r).padStart(8) +
      '  ' +
      shows.slice(0, 60) +
      flag,
  )
}
console.log(
  `\n${rows.length} mechanics: ${silent} leave nothing standing, ` +
    `${brief} leave nothing on the floor — ${silent + brief} a person has to be told about ` +
    `somewhere other than where they are looking`,
)

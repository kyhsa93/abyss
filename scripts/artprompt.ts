/**
 * What each piece of art is, derived from what the thing actually is.
 *
 * Written out by hand, a portrait for every spec would be seventeen chances to
 * describe a class differently from the one the simulation runs, and the drift
 * would be invisible — a plate tank drawn in robes still draws. So the prompts
 * are built from `classes.ts`, `abilities.ts` and `encounters.ts`, the same
 * tables the game reads, and a spec that changes armour or role gets a
 * different prompt on the next run with nobody editing a string.
 *
 * The art direction is one constant, deliberately. Every portrait sits in the
 * same grid on the same screen, and a set that drifts in lighting or palette
 * reads as a set of mistakes rather than a set. It is also the only place a
 * style decision lives, so changing the look of all of them is one edit.
 *
 * On style: the direction asks for a look, and a look is not anybody's
 * property. It deliberately names no game, franchise, artist or character —
 * what it asks for is the exaggerated, heavy-outlined, high-saturation
 * treatment that is a genre rather than a title.
 */

import { ABILITIES } from '../src/sim/abilities'
import { CLASSES, CLASS_ORDER } from '../src/sim/classes'
import type { ClassId } from '../src/sim/classes'

/**
 * The style words, and they go last.
 *
 * Order is the whole trick, found the expensive way: the first twenty-two
 * portraits led with five sentences of art direction and the model answered
 * almost none of the brief. A frost mage came back as a bearded man in plate
 * with no frost and no blue, an orc shaman came back as a human, and cloth and
 * leather classes were all wearing plate. Moving the subject to the front and
 * cutting the direction to one short tail fixed every one of them.
 *
 * So this is deliberately thin. A long preamble is not stronger direction — it
 * is a longer thing for the subject to compete with, and the subject is the
 * part that has to be right.
 */
export const STYLE = 'stylized cel-shaded fantasy game art, thick outlines, dark background, no text'

export interface IconJob {
  id: string
  name: string
}

/**
 * The element an ability plainly is, read off its own name.
 *
 * A heuristic, and it is meant to be one: the rules below are ordered, the
 * first match wins, and anything unmatched returns null so the caller can fall
 * back. That is the right failure — a warrior's "Wide Swing" has no school and
 * should take its class's steel, while a frost bolt has one no matter who is
 * holding it.
 *
 * Two orderings are load-bearing and both were wrong first: "Chain Lightning"
 * contains `light` and was coming back holy, and "Moonfire" contains `fire` and
 * was coming back as embers.
 *
 * Reviewable on purpose. If an icon comes out the wrong colour, the fix is a
 * line here.
 */
const BY_ELEMENT: Array<[RegExp, string]> = [
  [/moonfire|moonbrand|lunar/, 'lunar magic, pale violet and silver, cold starlight'],
  [/frost|ice|chill|icicle|rime/, 'ice magic, pale cyan and white, sharp crystalline shards'],
  [/lightning|thunder|storm|astral|spark/, 'storm magic, electric blue and white arcs'],
  [/holy|divine|light|consecrat|verdict|zealot|radiance|beacon|sanctuary|rite/,
   'holy magic, white and gold, radiant beams'],
  [/pyro|fire|flame|immolate|burn|lava|ember|cinder|kindle|magma/,
   'fire magic, orange and red, embers and heat haze'],
  [/shadow|void|dispersion|fade|gloom|creeping/,
   'shadow magic, violet-black and cold purple, creeping dark'],
  [/earth|quake|stone/, 'earth magic, brown and slate, cracked rock'],
  [/moon|star|sun|nature|rejuven|regen|growth|bark|bloom|green|quicken/,
   'nature magic, deep green and gold, leaves and moonlight'],
  [/chaos|fel|demon|ruin|blood price/, 'fel magic, sickly green and purple, corrupted energy'],
  [/poison|venom|wound|gut|stab/, 'poison and steel, toxic green on a dark blade'],
  [/water|wave|tide|undertow/, 'water magic, deep blue and foam white, flowing'],
]

export function elementOf(id: string, name: string): string | null {
  const hay = `${id} ${name}`.toLowerCase()
  for (const [pattern, palette] of BY_ELEMENT) if (pattern.test(hay)) return palette
  return null
}

/**
 * Every ability the bar can show, in a fixed order.
 *
 * Sorted by id rather than by declaration, so the atlas built from these is the
 * same file when `abilities.ts` gets a new entry in the middle.
 *
 * No prompt any more: the icons are picked out of game-icons.net by
 * `iconmatch` rather than generated, and all that is needed from here is the
 * list and what each ability is called.
 */
export function iconJobs(): IconJob[] {
  return Object.values(ABILITIES)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((ability) => ({ id: ability.id, name: ability.name }))
}

/* ------------------------------------------------------------------------ *
 * Portraits
 * ------------------------------------------------------------------------ */

/** What the class is made of, before the spec narrows it. */
const CLASS_LOOK: Record<ClassId, string> = {
  warrior: 'a scarred human soldier, blood-red and gunmetal steel',
  paladin: 'a solemn human knight, white and burnished gold',
  // Neutral on purpose: this class runs a holy spec and a shadow one, and a
  // base colour here fought the shadow spec and won — it came back gold.
  priest: 'a hollow-eyed human cleric in heavy hooded robes',
  druid: 'a weathered elf shaped by the wild, bark brown and deep green',
  shaman: 'a broad orc elementalist, ochre hide and storm-blue totems',
  mage: 'a pale human spellcaster, cobalt blue and pale violet',
  warlock: 'a gaunt human occultist, sickly fel green and bruised purple',
  hunter: 'a hooded elf tracker, forest green and tanned leather',
  rogue: 'a masked human cutthroat, charcoal grey and dull steel',
}

/** What the spec does with it, which is the half a player picks on. */
const SPEC_LOOK: Record<string, string> = {
  protection: 'braced behind an enormous tower shield',
  arms: 'hefting a two-handed greatsword across the shoulder',
  holy: 'haloed in golden light, hands open',
  retribution: 'wreathed in righteous fire, blade raised',
  discipline: 'in bone-white and gold, shielded by a shimmering white ward',
  shadow: 'in black and bruised violet, face half-swallowed by writhing shadow',
  guardian: 'shifting into a massive armoured bear',
  restoration: 'crowned with green light and new growth',
  balance: 'lit by a bright full moon behind the head, silver moonlight on the face',
  feral: 'mid-shift into a lean stalking cat, claws out',
  elemental: 'crackling with forked lightning',
  frost: 'exhaling frost, ice shards hanging in the air',
  destruction: 'holding a churning ball of green fel fire',
  marksmanship: 'drawing an enormous recurve bow',
  assassination: 'holding two crossed poisoned daggers, sickly green venom dripping from the blades',
}

/**
 * The bosses, described by what they demand rather than by a name.
 *
 * `demand` is the one line the game already shows a player before a pull, so
 * a portrait built from it cannot promise a fight the encounter does not run.
 */
const BOSS_LOOK: Record<string, string> = {
  warden: 'a colossal drowned jailer, waterlogged plate, kelp and black water pouring off it',
  choir: 'a many-mouthed singing horror, pale robed figures fused into one chorus',
  tidebreaker: 'a towering armoured leviathan-knight, barnacled shell and a great hooked blade',
  watcher: 'an enormous unblinking eye set in a stone idol, ringed with smaller staring eyes',
  ledger: 'a towering skeletal undead judge in a tattered magistrate robe, holding a huge chained ledger book, cold blue flames in the eye sockets',
}

export interface ArtJob {
  id: string
  label: string
  prompt: string
}

/**
 * Every portrait the game can show, in a fixed order.
 *
 * Specs first, then bosses, each sorted, so a run that regenerates part of the
 * set writes the same filenames it wrote last time.
 */
export function portraitJobs(): ArtJob[] {
  const jobs: ArtJob[] = []

  for (const classId of CLASS_ORDER) {
    for (const spec of CLASSES[classId].specs) {
      const look = SPEC_LOOK[spec.id] ?? ''
      jobs.push({
        id: `${classId}-${spec.id}`,
        label: `${CLASSES[classId].name} ${spec.id}`,
        prompt: `${CLASS_LOOK[classId]}, ${look}, bust portrait, ${STYLE}`,
      })
    }
  }

  for (const [id, look] of Object.entries(BOSS_LOOK)) {
    jobs.push({
      id: `boss-${id}`,
      label: `boss ${id}`,
      // A boss is not a hero bust: it has to read as the thing on the other
      // side of the room, so the framing word changes and nothing else does.
      prompt: `${look}, menacing head-and-torso view, ${STYLE}`,
    })
  }

  return jobs
}

/* ------------------------------------------------------------------------ *
 * Field sprites
 * ------------------------------------------------------------------------ */

/**
 * A body standing on the floor, which is a different picture from a portrait.
 *
 * Two constraints drive every word here and neither is taste.
 *
 * The background must be white. The cutout that gives these an alpha channel
 * is a flood fill inwards from the edges, and it can only separate what it can
 * see a difference at: a hooded rogue on the dark background these were first
 * asked for came back as one dark mass the fill walked straight through.
 * Fantasy characters are mostly mid to dark, so white is the one ground that
 * contrasts with nearly all of them.
 *
 * And one figure, whole, standing. Asked without "single character, one figure
 * only" the model returns a character sheet — two views of the same person
 * side by side — which cuts out as two half people.
 */
const SPRITE_FRAME =
  'single character, one figure only, full body head to feet, standing, front view, ' +
  'on a pure plain white background, isolated, no ground, no shadow, no scenery, ' +
  'stylized cel-shaded fantasy game art, thick black outlines, flat saturated colors'

export function spriteJobs(): ArtJob[] {
  const jobs: ArtJob[] = []

  for (const classId of CLASS_ORDER) {
    for (const spec of CLASSES[classId].specs) {
      jobs.push({
        id: `${classId}-${spec.id}`,
        label: `${CLASSES[classId].name} ${spec.id}`,
        prompt: `${CLASS_LOOK[classId]}, ${SPEC_LOOK[spec.id] ?? ''}, ${SPRITE_FRAME}`,
      })
    }
  }

  for (const [id, look] of Object.entries(BOSS_LOOK)) {
    jobs.push({
      id: `boss-${id}`,
      label: `boss ${id}`,
      prompt: `${look}, colossal and monstrous, ${SPRITE_FRAME}`,
    })
  }

  return jobs
}

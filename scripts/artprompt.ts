/**
 * What to ask for, derived from what the ability actually is.
 *
 * Eighty-two icons written by hand would be eighty-two chances to describe a
 * button differently from the thing it presses, and the drift would be
 * invisible: a wrong picture on a right button still draws. So the prompt is
 * built from `abilities.ts` and `classes.ts` — the same tables the simulation
 * reads — and an ability that changes its role or its school gets a different
 * prompt on the next run without anybody editing a string.
 *
 * The art direction is one constant, deliberately. Every icon has to sit in the
 * same row on the same bar, and a set that drifts in lighting or palette reads
 * as a set of mistakes. It is also the only place a style decision lives, so
 * changing the look of all eighty-two is one edit.
 *
 * On style and names: the direction below asks for a look, and a look is not
 * anybody's property. It deliberately does not name a game, a franchise, an
 * artist, or any character — the request is for heavy-outlined, high-contrast
 * fantasy iconography, which is a genre.
 */

import { ABILITIES, type Ability } from '../src/sim/abilities'
import { CLASSES, CLASS_ORDER } from '../src/sim/classes'
import type { ClassId } from '../src/sim/classes'

/**
 * One paragraph, applied to all of them.
 *
 * The constraints here are not taste, they are the render surface: an icon is
 * drawn at about forty CSS pixels inside a round button, on `#0a0a0f`, next to
 * a label. Anything that relies on fine detail, on a light background, or on
 * text inside the image is invisible or wrong at that size.
 */
export const DIRECTION = [
  'A single fantasy game ability icon, square, filling the whole frame.',
  'Painted style: heavy dark outline, high contrast, saturated colours,',
  'strong rim light from the upper left, chunky simplified forms.',
  'One clear subject, centred, readable as a silhouette at 40 pixels.',
  'Dark background inside the frame; no white or light backgrounds.',
  'No text, no letters, no numbers, no watermark, no border decoration,',
  'no user interface, no frame, no character faces, no hands holding it.',
].join(' ')

/**
 * The picture each kind of button wants.
 *
 * A defensive and a heal are both "friendly" and look nothing alike: one is a
 * thing put between you and a hit, the other is the hit already undone.
 */
const BY_KIND: Record<Ability['kind'], string> = {
  damage: 'an offensive strike or projectile, aggressive and in motion',
  heal: 'restorative light mending a wound, warm and calm',
  defensive: 'a protective barrier or ward absorbing a blow, braced',
  taunt: 'a challenging roar or beckoning gesture drawing attention',
  charge: 'explosive forward motion, a rush closing distance',
}

/**
 * What the class fights with, as the fallback.
 *
 * Only the fallback, because a class is the wrong unit: the frost mage's kit
 * contains Pyroblast, and asking for that one in "icy blue" produces an icon
 * that lies about what the button does. Colour is the fastest channel on a
 * crowded bar, so being wrong here is worse than the glyphs it replaces.
 */
const BY_CLASS: Record<ClassId, string> = {
  warrior: 'steel weapons, blood red and gunmetal, martial and physical',
  paladin: 'golden holy light, white and gold, radiant and consecrated',
  priest: 'holy white-gold light or void shadow, sacred',
  druid: 'nature magic, deep green and amber, claws bark and moonlight',
  shaman: 'elemental fire earth and lightning, orange and stormy blue',
  mage: 'arcane frost and fire, icy blue and violet, crystalline',
  warlock: 'fel and shadow magic, sickly green and purple, corrupted',
  hunter: 'bow arrows and beasts, leather brown and forest green',
  rogue: 'daggers poison and shadow, muted grey-green, sharp and quick',
}

/**
 * The element an ability plainly is, read off its own name.
 *
 * A heuristic, and it is meant to be one: the rules below are ordered, the
 * first match wins, and anything unmatched falls back to the class. That is
 * the right failure — a Warrior's "Cleave" has no school and should take the
 * class's steel, while "Frostbolt" has one no matter who is holding it.
 *
 * Reviewable on purpose. If an icon comes back the wrong colour, the fix is a
 * line here rather than a hand-written prompt that then drifts on its own.
 */
const BY_ELEMENT: Array<[RegExp, string]> = [
  // Two orderings here are load-bearing, and both were wrong first:
  // "Chain Lightning" contains `light` and was coming back holy, and
  // "Moonfire" contains `fire` and was coming back as embers.
  [/moonfire|lunar/, 'lunar magic, pale violet and silver, cold starlight'],
  [/frost|ice|chill/, 'ice magic, pale cyan and white, sharp crystalline shards'],
  [/lightning|thunder|storm|astral/, 'storm magic, electric blue and white arcs'],
  [/holy|divine|light|consecrat|judgement|crusader|exorcism|beacon|smite/,
   'holy magic, white and gold, radiant beams'],
  [/pyro|fire|flame|immolate|burn|lava/, 'fire magic, orange and red, embers and heat haze'],
  [/shadow|void|dispersion|fade/, 'shadow magic, violet-black and cold purple, creeping dark'],
  [/earth|quake|stone/, 'earth magic, brown and slate, cracked rock'],
  [/moon|star|sun|wrath|nature|rejuven|regen|growth|barkskin|swiftmend/,
   'nature magic, deep green and gold, leaves and moonlight'],
  [/chaos|fel|demon|life_tap/, 'fel magic, sickly green and purple, corrupted energy'],
  [/poison|rupture|eviscerate|sinister|serpent/, 'poison and steel, toxic green on a dark blade'],
  [/water|wave|tide|riptide/, 'water magic, deep blue and foam white, flowing'],
]

function element(id: string, name: string): string | null {
  const hay = `${id} ${name}`.toLowerCase()
  for (const [pattern, palette] of BY_ELEMENT) if (pattern.test(hay)) return palette
  return null
}

/** Where every ability is used, so the prompt can say which school it is. */
function ownership(): Map<string, ClassId> {
  const owner = new Map<string, ClassId>()
  for (const id of CLASS_ORDER) {
    for (const spec of CLASSES[id].specs) {
      for (const value of Object.values(spec.abilities) as (string | null)[]) {
        // An ability shared by two classes keeps the first, which is stable
        // because CLASS_ORDER is. A prompt that flipped between runs would
        // quietly redraw icons that nobody changed.
        if (typeof value === 'string' && !owner.has(value)) owner.set(value, id)
      }
    }
  }
  return owner
}

export interface IconJob {
  id: string
  name: string
  prompt: string
}

/**
 * Every icon the bar can show, in a fixed order.
 *
 * Sorted by id rather than by declaration, so the atlas built from these is
 * the same file when `abilities.ts` gets a new entry in the middle.
 */
export function iconJobs(): IconJob[] {
  const owner = ownership()

  return Object.values(ABILITIES)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((ability) => {
      const school =
        element(ability.id, ability.name) ?? BY_CLASS[owner.get(ability.id) ?? 'warrior']
      // The name is a hint, not the subject: "Shield Wall" should be drawn as
      // a braced wall of shields, but the model must not letter it.
      const subject = `${BY_KIND[ability.kind]}, evoking "${ability.name}"`
      return {
        id: ability.id,
        name: ability.name,
        prompt: `${DIRECTION} Subject: ${subject}. Palette and materials: ${school}.`,
      }
    })
}

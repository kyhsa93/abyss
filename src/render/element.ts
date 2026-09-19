/**
 * What school an ability plainly belongs to, read off its own name.
 *
 * Lives in `src/` rather than beside the packers because both sides need it:
 * `atlas` tints an icon by it at build time, and the hit effects pick a sprite
 * by it at run time. Two copies would drift, and the drift would show up as an
 * icon and its own impact disagreeing about what school just landed.
 */

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
  [
    /holy|divine|light|consecrat|verdict|zealot|radiance|beacon|sanctuary|rite/,
    'holy magic, white and gold, radiant beams',
  ],
  [
    /pyro|fire|flame|immolate|burn|lava|ember|cinder|kindle|magma/,
    'fire magic, orange and red, embers and heat haze',
  ],
  [
    /shadow|void|dispersion|fade|gloom|creeping/,
    'shadow magic, violet-black and cold purple, creeping dark',
  ],
  [/earth|quake|stone/, 'earth magic, brown and slate, cracked rock'],
  [
    /moon|star|sun|nature|rejuven|regen|growth|bark|bloom|green|quicken/,
    'nature magic, deep green and gold, leaves and moonlight',
  ],
  [/chaos|fel|demon|ruin|blood price/, 'fel magic, sickly green and purple, corrupted energy'],
  [/poison|venom|wound|gut|stab/, 'poison and steel, toxic green on a dark blade'],
  [/water|wave|tide|undertow/, 'water magic, deep blue and foam white, flowing'],
]

export function elementOf(id: string, name: string): string | null {
  const hay = `${id} ${name}`.toLowerCase()
  for (const [pattern, palette] of BY_ELEMENT) if (pattern.test(hay)) return palette
  return null
}

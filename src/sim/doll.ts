/**
 * The character, drawn wearing what he is wearing.
 *
 * `public/art/doll/` holds fifty-eight layer sheets — a bare body, and for
 * every slot a light, medium and heavy version — and `public/art/doll.json`
 * says how each one lines up.  All of it was committed, `CLAUDE.md` claimed a
 * `src/doll.ts` composed them, and **that file did not exist**.  Nothing in
 * `src/` had ever mentioned the word.
 *
 * What decides which layer: the item's own `armor` value against the slot's,
 * because "is this leather or is it plate" is not a column — `subclass` says
 * so for armour and says something else entirely for a weapon, and the layers
 * are drawn as light, medium and heavy rather than by material.  So the
 * heaviest thing in a slot gets the heaviest layer that exists for it, which
 * is the honest reading of a set of pictures that only has three.
 */

export type DollMeta = {
  cols: number
  who: Record<string, {
    cell: number
    anchor: number
    dirs: number
    clips: Record<string, { first: number; count: number }>
    layers: Record<string, { w: number; h: number; dx: number; dy: number }>
  }>
}

/** The order the layers stack in, back to front. */
export const ORDER = ['body', 'feet', 'legs', 'chest', 'hands', 'head',
  'hair', 'helm', 'weapon'] as const

/**
 * The slots whose layers are told apart by what the thing *is* rather than by
 * how heavy it is.
 *
 * There are three pictures of a breastplate and five of a weapon, and they are
 * not three of the same sort of thing: a sword is not a heavier dagger.  So
 * `weightOf` has nothing to say here, and neither does the fallback chain
 * under it — a kind with no picture draws nothing rather than drawing the
 * nearest one, because the nearest weapon to a bow is not a bow.
 */
const BY_KIND = new Set<string>(['weapon'])

/** Which of the three weights a piece of armour is drawn as. */
export function weightOf(armour: number): string {
  // Three pictures and one number.  A shirt is nothing, a leather jerkin is a
  // handful, a mail hauberk is tens: the steps are where the pictures are, not
  // where a table says.
  //
  // And nothing worn is ever drawn bare.  This is only ever asked about a
  // slot with something in it, so `bare` here meant "you are wearing boots
  // that show as bare feet" — which is what the starting outfit's boots did
  // the day they were first put on somebody, since the client gives them no
  // armour at all.  `bare` belongs to an empty slot, and an empty slot never
  // reaches this function.
  if (armour < 20) return 'light'
  if (armour < 60) return 'medium'
  return 'heavy'
}

/**
 * Which layer file to draw for a slot, given what is worn there.
 *
 * Falls back down the weights and then to bare, because the set is not
 * complete: there are four light chests and one heavy, and asking for a
 * medium helm that nobody drew should put a light one on rather than nothing.
 * A slot in `BY_KIND` takes the kind instead and falls back to nothing.
 */
export function layerFor(meta: DollMeta, who: string, slot: string,
  armour: number, kind?: string | null, weight?: string | null): string | null {
  const have = meta.who[who]?.layers ?? {}
  if (BY_KIND.has(slot)) {
    const name = kind ? `${who}_${slot}_${kind}` : null
    return name && have[name] ? name : null
  }
  // `weight` is the material's when the caller knows it — `outfit.ts`'s
  // `WEIGHT`, off `subclass` — and the armour value is only the fallback.
  // The header above said material "is not a column", which was never true
  // of armour: it is `subclass`, and reading the armour instead drew a
  // leather jerkin at 70 as the heavy layer while the world drew it leather.
  const want = weight ?? weightOf(armour)
  for (const weight of [want, 'medium', 'light', 'bare']) {
    const name = `${who}_${slot}_${weight}`
    if (have[name]) return name
    // The numbered variants are the same weight drawn differently.
    const numbered = Object.keys(have)
      .find((k) => k.startsWith(`${who}_${slot}_${weight}_`))
    if (numbered) return numbered
  }
  return null
}

/** Which cell of a layer sheet is the standing, facing-forward pose. */
export function still(meta: DollMeta, who: string): number {
  const clips = meta.who[who]?.clips ?? {}
  // `stand` if there is one, and the first frame of walking if not — an
  // animal sheet has no separate standing pose and a person's does.
  const clip = clips['stand'] ?? clips['walk'] ?? clips['run']
  return clip ? clip.first : 0
}

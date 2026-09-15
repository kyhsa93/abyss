/**
 * What colour a spell is, and what flash it lands with — out of its school.
 *
 * The ICC prototype coloured a bolt by its ability's *icon*, because its
 * abilities were its own and each one had a picture with a colour picked for
 * it.  This game's abilities are `Spell.dbc`'s and the client says the thing
 * the icon colour was standing in for: `SchoolMask`, one bit a school.  So a
 * frostbolt is frost-blue because it is frost, and a kobold's fireball and a
 * mage's are the same orange without anybody having chosen that twice.
 *
 * A mask can carry more than one bit (a spellfire, a frostfire); none of this
 * slice's do, and the lowest bit wins so the answer is still one colour.
 */

import type { ProjectileKind } from './bolt.ts'

/** Physical, holy, fire, nature, frost, shadow, arcane — the client's bits. */
export const SCHOOL_COLOUR: Record<number, string> = {
  1: '#e2e8f0',
  2: '#fde68a',
  4: '#fb923c',
  8: '#86efac',
  16: '#7dd3fc',
  32: '#c084fc',
  64: '#f0abfc',
}

/** The heal's own green, which no school is: a holy light is still a heal. */
export const HEAL_COLOUR = '#bbf7d0'

const lowest = (mask: number): number => mask & -mask

export function schoolColour(mask: number | undefined): string {
  return SCHOOL_COLOUR[lowest(mask ?? 1)] ?? SCHOOL_COLOUR[1]!
}

/**
 * Which picture of `fx.webp` a landing plays.
 *
 * The prototype's table, keyed on the client's school instead of its own
 * element words: fire is a flame, holy is holy, nature is the gust, a heal is
 * the heal and a critical is the biggest thing in the set whatever it was.
 * Frost, shadow and arcane had no picture of their own there either, and get
 * the plain burst in their own colour.
 */
export function landingFx(mask: number | undefined, crit: boolean, heal: boolean): string {
  if (heal) return 'heal'
  if (crit) return 'blast'
  switch (lowest(mask ?? 1)) {
    case 1: return 'slash'
    case 2: return 'holy'
    case 4: return 'flame'
    case 8: return 'gust'
    default: return 'burst'
  }
}

/**
 * Which body a flight wears — the prototype's `projectileKind`, asked of a
 * `Spell.dbc` row: a heal is a heal, anything with a cast bar is the heavy
 * one, anything that leaves something behind is the dot, and the rest is a
 * bolt.  A kobold's spells carry no cast time in `creature_template_spell`,
 * so theirs are bolts and dots.
 */
export function flightKind(heals: boolean, castMs: number, leavesAura: boolean): ProjectileKind {
  if (heals) return 'heal'
  if (castMs > 0) return 'heavy'
  if (leavesAura) return 'dot'
  return 'bolt'
}

/** `#rrggbb` at an alpha, for strokes and gradients. */
export function tint(colour: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(colour)) return colour
  const r = parseInt(colour.slice(1, 3), 16)
  const g = parseInt(colour.slice(3, 5), 16)
  const b = parseInt(colour.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`
}

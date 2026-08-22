import type { SimState } from './sim/types'

/**
 * What the player is called.
 *
 * Cosmetic, and kept out of the simulation on purpose: a name changes nothing
 * about a fight, the harness must not depend on what is in storage, and a
 * replay from a seed has to be the same fight whoever is playing it. So the
 * slot is still built as `You` and the actor is renamed on the way out.
 */

export const DEFAULT_NAME = 'You'

/**
 * Twelve characters.
 *
 * Long enough for a name and short enough to sit over a token without
 * covering the two people either side of it, which is what the label is for.
 */
export const NAME_MAX = 12

const KEY = 'abyss.name'

/**
 * What a typed name becomes.
 *
 * Anything at all can be typed into a text field, and all of it ends up drawn
 * over a token and written into a record: control characters, a hundred
 * spaces, an empty string, a line longer than the arena. What comes out is
 * one line, trimmed, capped, or the default.
 */
export function cleanName(raw: string): string {
  let flattened = ''
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0
    // Anything below a space — newlines, tabs, the rest — becomes a space
    // rather than being dropped, so "a\nb" stays two words.
    flattened += code < 0x20 || code === 0x7f ? ' ' : ch
  }
  const single = flattened.replace(/\s+/g, ' ').trim()
  if (single === '') return DEFAULT_NAME
  return [...single].slice(0, NAME_MAX).join('')
}

export function loadName(): string {
  try {
    const raw = localStorage.getItem(KEY)
    return raw === null ? DEFAULT_NAME : cleanName(raw)
  } catch {
    return DEFAULT_NAME
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(KEY, cleanName(name))
  } catch {
    // Private browsing keeps its own counsel.
  }
}

/** Puts the name on whoever the player is, in whatever fight this is. */
export function nameThePlayer(s: SimState, name: string): void {
  const player = s.actors.find((a) => a.isPlayer)
  if (player) player.name = cleanName(name)
}

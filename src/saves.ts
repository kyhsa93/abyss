/**
 * Everything this game has written down, and the press that unwrites it.
 *
 * By prefix rather than by list. Nineteen keys live in twelve files -- the
 * citadel's vault, the bests, the awards, the daily, the history, the notes,
 * the name, the roster, the difficulty, the tier, the unlocked bosses, the
 * mode, the sound, the volume, the zoom, the backdrop, the autocast toggle
 * and which hints have been seen -- and a reset written as a list of nineteen
 * is a reset that stops being true the day a twentieth is added, silently and
 * in the one direction nobody checks. The prefix is the fact. A list is a
 * copy of it, and copies rot.
 *
 * Preferences go with progress. This button sits on the settings screen, so
 * sparing the volume and the zoom would be the defensible half of a line the
 * player cannot see -- and then every new key needs somebody to decide which
 * side it is on. "Everything" is a promise that can be kept and checked; "the
 * progress, but not the preferences" is a promise that needs maintaining.
 *
 * The two resets that already exist are narrower on purpose and stay: this
 * evening's rooms (`resetInstance`) and this week's (`resetWeek`). This is the
 * one that was missing -- the one that puts the game back to the state it is
 * in for somebody who has never opened it.
 */
export const SAVE_PREFIX = 'abyss.'

/**
 * What is saved right now.
 *
 * Read rather than assumed, because the button has to say what it is about to
 * destroy and a number that is not the real number is worse than no number.
 */
export function savedKeys(): string[] {
  const keys: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key !== null && key.startsWith(SAVE_PREFIX)) keys.push(key)
    }
  } catch {
    // A browser with storage switched off has nothing saved and nothing to
    // clear, which is the same answer as an empty list.
    return []
  }
  return keys
}

/**
 * And unwrites all of it.
 *
 * The keys are collected before anything is removed: removing while walking
 * the index shifts everything after it down, so a straight loop over
 * `localStorage.key(i)` skips every other one. That is the bug this shape
 * exists to avoid rather than a style preference.
 */
export function wipeSaves(): void {
  const keys = savedKeys()
  try {
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    // Nothing to do and nothing to report: a store that will not be written
    // to is a store that had nothing in it to begin with.
  }
}

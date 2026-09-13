/**
 * What survives closing the tab.
 *
 * Nothing did.  There was no `localStorage` and no `indexedDB` anywhere in
 * `src/`, so shutting the tab was deleting the character — which in a browser
 * game is the only kind of logging out there is.
 *
 * Three rules, and each one is a mistake somebody else has already made:
 *
 *   * **IndexedDB, and the game works without it.** Every read and write is
 *     wrapped, because in a private window some browsers throw on the *access*
 *     rather than on the write. A game that will not start because it could
 *     not save is worse than a game that does not save.
 *   * **Derived things are not saved.** Maximum health comes from stamina and
 *     stamina comes from the level; saving it means a save that disagrees with
 *     the rules the moment the rules change.
 *   * **The save carries the world's hash.** `public/manifest.json` names the
 *     AzerothCore commit and the hash of every baked file. A save that does
 *     not know which world it was made in is a save whose item ids might mean
 *     something else — so it is checked, and a mismatch is reported rather
 *     than quietly loaded.
 */

/** Bumped whenever the shape below changes; `migrate` walks v1 → v2 → v3. */
export const SAVE_VERSION = 1

export type Save = {
  version: number
  /** Which baked world this was made in — see `public/manifest.json`. */
  world: string
  at: number
  hero: { x: number; y: number; dir: number }
  you: {
    level: number; xp: number; hp: number; rage: number; purse: number
    kills: number
    bag: Record<string, [number, number]>
    trades: Record<string, number>
    cools: Record<number, number>
    /** Held by id, worn by slot, and what a trainer has taught. */
    items: number[]
    gear: Record<string, number>
    taught: number[]
  }
  /** Where the stream of chance is, so loading cannot re-roll a drop. */
  seed: number
  /** Quest progress, as `quest.ts` writes it. */
  quests: unknown
}

const DB = 'abyss', STORE = 'save', KEY = 'current'

/** Open the store, or nothing at all if this browser will not have it. */
function open(): Promise<IDBDatabase | null> {
  return new Promise((done) => {
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB, 1)
    } catch {
      done(null)
      return
    }
    req.onupgradeneeded = () => {
      try {
        req.result.createObjectStore(STORE)
      } catch { /* already there */ }
    }
    req.onsuccess = () => done(req.result)
    req.onerror = () => done(null)
    // A browser that never answers is a browser with no storage.
    setTimeout(() => done(null), 2000)
  })
}

export async function write(save: Save): Promise<boolean> {
  const db = await open()
  if (!db) return false
  return new Promise((done) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(save, KEY)
      tx.oncomplete = () => done(true)
      tx.onerror = () => done(false)
    } catch {
      done(false)
    }
  })
}

export async function read(): Promise<Save | null> {
  const db = await open()
  if (!db) return null
  return new Promise((done) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const got = tx.objectStore(STORE).get(KEY)
      got.onsuccess = () => done((got.result as Save) ?? null)
      got.onerror = () => done(null)
    } catch {
      done(null)
    }
  })
}

export async function wipe(): Promise<void> {
  const db = await open()
  if (!db) return
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY)
  } catch { /* nothing to delete */ }
}

/**
 * Bring an older save forward, one version at a time.
 *
 * A chain and never a jump: `v1 → v2 → v3`, so a save two versions behind goes
 * through the same steps the one version behind it did.  There is one version
 * so far and the chain is empty, which is the right time to write the loop.
 */
export function migrate(save: Save): Save | null {
  let now = save
  while (now.version < SAVE_VERSION) {
    const step = STEPS[now.version]
    if (!step) return null
    now = step(now)
  }
  return now.version === SAVE_VERSION ? now : null
}

const STEPS: Record<number, (s: Save) => Save> = {}

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
export const SAVE_VERSION = 2

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
    /** Banked experience, and whether the tab was closed in an inn. */
    rest: number
    restedIn: number
    /** When the ceiling was reached, and when the character was made. */
    finished: number
    born: number
    /**
     * Who he is, as the screen that made him left it.
     *
     * `race` and `cls` are the client's own ids — `ChrRaces` and `ChrClasses`
     * — and `sex` is 0 male, 1 female, which is how `CharacterCreate.xml`
     * numbers its two buttons.  A save from before there was a screen has
     * none of this and `migrate` fills it with what the game used to be.
     */
    who?: { name: string; race: number; sex: number; cls: number }
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
 * through the same steps the one version behind it did.  The loop was written
 * while the chain was empty, which is the right time to write one.
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

const STEPS: Record<number, (s: Save) => Save> = {
  /**
   * 1 → 2: before there was a screen, every character was the same one.
   *
   * A human warrior called 주인공, which is what the game was: one race in
   * `slice.json`, one class, one starting point.  Filled in rather than
   * thrown away — a save is somebody's hours, and the thing it is missing is
   * the thing it never had a way to be different about.
   */
  1: (s) => ({
    ...s,
    version: 2,
    you: { ...s.you, who: { name: '주인공', race: 1, sex: 0, cls: 1 } },
  }),
}

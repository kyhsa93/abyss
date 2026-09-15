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

/** Bumped whenever the shape below changes; `migrate` walks v1 → … → v5. */
export const SAVE_VERSION = 5

export type Save = {
  version: number
  /** Which baked world this was made in — see `public/manifest.json`. */
  world: string
  at: number
  hero: { x: number; y: number; dir: number }
  you: {
    level: number; xp: number; hp: number; purse: number
    /**
     * What is in the bar, whichever bar the class has.
     *
     * This was `rage`, and the rename is the point rather than tidying: a
     * number called rage on a rogue's save is a number somebody will one day
     * put into a rage bar.  Which bar it is is not stored — it is the class's,
     * out of `player.json`, and storing it would be a second copy that can
     * disagree with the character.
     */
    power: number
    kills: number
    /** Item id -> how many.  Was word -> [how many, worth]; see STEPS. */
    bag: Record<string, number>
    /** `SkillLine` id -> [where he is, how far it goes]. */
    trades: Record<string, [number, number]>
    /**
     * How long each cooldown has **left**, in seconds — not when it ends.
     *
     * It was when it ends, against `clock`, and `clock` starts at nought every
     * time the page loads.  A character saved five minutes into a session came
     * back with every ability he had used on cooldown for another five
     * minutes; one saved an hour in was unable to press anything at all.  A
     * time saved against a clock that restarts is not a time.
     */
    cools: Record<number, number>
    /**
     * What is still on him: the buffs and the wounds, with the seconds they
     * have left.
     *
     * Thrown away, until issue 206 asked what that means.  **A debuff that a
     * reload clears is not a rule, it is the shape of a bug** — and the way a
     * player finds that out is by using it.  Saving them is the honest half:
     * come back and the three seconds of bleeding are still three seconds of
     * bleeding.
     *
     * Three are deliberately not in here.  A **cast in flight** is interrupted
     * by closing the tab, which is what the server does too.  **Combo points**
     * belong to a target that is not there when you come back.  And the
     * **global cooldown** is shorter than the load.
     */
    auras?: {
      /** `[left, every, each]` — a renew, a bandage, a meal, a wound. */
      mend?: [number, number, number]
      using?: [number, number, number, number, string]
      bleed?: [number, number, number]
      /** `[left, attack power]` — a shout. */
      shout?: [number, number]
      /** `[left, which stat, how much]`. */
      blessed?: [number, string, number]
      /** What is left of a shield, which has no clock on it. */
      absorb?: number
      /** Which stance he is standing in — a state, and it was not saved. */
      stance?: number
    }
    /** Held by id, worn by slot, and what a trainer has taught. */
    items: number[]
    gear: Record<string, number>
    /**
     * How much wear is left, where it is less than whole — issue 83.
     *
     * `worn` is by slot and `held` by item id, and only what has lost
     * something is written: a whole item is its own `MaxDurability`, which is
     * the bake's, and a save that copied it would disagree with the item the
     * day the column did.  By id for what is carried because a carried thing
     * has nothing else to be known by here; two copies of one item in the bag
     * share the number, and the one that shows is the more worn.
     */
    dura: { worn: Record<string, number>; held: Record<string, number> }
    taught: number[]
    /**
     * The recipes he knows, by the spell that makes the thing.
     *
     * Separate from `taught` because they are bought from different people for
     * different reasons and only one of them goes on the bar — see the note on
     * `recipes` in `main.ts`.  Optional, because every save made before issue
     * 200 has none and "none" is the right answer for all of them.
     */
    recipes?: number[]
    /**
     * Where he stands with each side, by faction id.
     *
     * Only what he has *earned* — where a character begins is a fact about his
     * race and lives in `player.json`, and saving it would be a second copy
     * that stops agreeing the day the bake reads the column better.  Optional,
     * because every save made before issue 201 has none.
     */
    stands?: Record<string, number>
    /**
     * What is on each of the sixteen squares, by ability id, `null` for empty.
     *
     * Saved because it is a *decision* — what to keep within reach — and
     * because issue 224 made the order of it the fighting order as well.  It
     * was not saved and could not have been: the bar was the spellbook in the
     * order things were learned, rebuilt every frame.
     *
     * Pruned against what the character actually knows on load, so an id from
     * another class or an older bake cannot sit there unpressable — see
     * `fitBar`.  The save already carries the world's hash, which is the other
     * half of that.
     */
    bar?: (number | null)[]
    /** Whether the automatic hand is on — see `autoCast`. */
    auto?: number
    /**
     * What has been bought off a limited shelf — `"<vendor>:<item>"` to
     * `[which turn of that shelf's clock, how many]`.
     *
     * `npc_vendor.maxcount` and `incrtime` say a shopkeeper holds three of
     * something and puts another out every two hours.  The turn is stored
     * beside the count so nothing has to be cleared and nothing has to tick:
     * a count from an older turn is a count of nothing.
     */
    bought?: Record<string, [number, number]>
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
    who?: { name: string; race: number; sex: number; cls: number
      /** What he chose to look like — `hair/<style>` and `beards/beard/<n>`. */
      hair?: string; beard?: string }
  }
  /** Where the stream of chance is, so loading cannot re-roll a drop. */
  seed: number
  /** Quest progress, as `quest.ts` writes it. */
  quests: unknown
}

const DB = 'abyss', STORE = 'save'

/**
 * Where the one save used to live.
 *
 * One key, because there was one character.  A screen that *chooses* between
 * characters cannot be built on one key, so the store is keyed on a slot now
 * and this is the key the first of them came out of — `list` moves it into
 * slot one and deletes it, once, and after that nothing here mentions it
 * again.  A migration in the store rather than in `migrate`: that walks a
 * save's *version* forward and this moves a save's *address*, and running the
 * two through one function is how a save ends up in two places.
 */
const WAS = 'current'

/** How a slot is addressed in the store.  Slots count from one. */
const keyOf = (slot: number) => `slot${slot}`

/**
 * One line of the screen that chooses, which is what that screen is made of.
 *
 * `where` is not stored: it is worked out from `hero` when the list is drawn,
 * because it is a fact about the world rather than about the save, and a word
 * kept beside the coordinates it came from is a word that can disagree with
 * them.  `world` is stored, and a card whose world is not the one that is
 * loaded is shown and refused rather than deleted — see `playable`.
 */
export type Card = {
  slot: number
  save: Save
}

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

export async function write(save: Save, slot: number): Promise<boolean> {
  const db = await open()
  if (!db) return false
  return new Promise((done) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(save, keyOf(slot))
      tx.oncomplete = () => done(true)
      tx.onerror = () => done(false)
    } catch {
      done(false)
    }
  })
}

export async function read(slot: number): Promise<Save | null> {
  const db = await open()
  if (!db) return null
  return new Promise((done) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const got = tx.objectStore(STORE).get(keyOf(slot))
      got.onsuccess = () => done((got.result as Save) ?? null)
      got.onerror = () => done(null)
    } catch {
      done(null)
    }
  })
}

export async function wipe(slot: number): Promise<void> {
  const db = await open()
  if (!db) return
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete(keyOf(slot))
  } catch { /* nothing to delete */ }
}

/**
 * Every character there is, in slot order.
 *
 * One pass over the store rather than `slots` reads, because a browser that
 * is slow about opening the database is slow about it ten times.  A save that
 * will not come forward through `migrate` is **left in the store and left out
 * of the list**: it belongs to somebody, and a list that quietly loses a name
 * is worse than one that is short.
 *
 * The legacy key is moved on the way past, once.
 */
export async function list(slots: number): Promise<Card[]> {
  const db = await open()
  if (!db) return []
  const at = (key: string): Promise<Save | null> => new Promise((done) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const got = tx.objectStore(STORE).get(key)
      got.onsuccess = () => done((got.result as Save) ?? null)
      got.onerror = () => done(null)
    } catch { done(null) }
  })
  const out: Card[] = []
  const old = await at(WAS)
  for (let slot = 1; slot <= slots; slot++) {
    let save = await at(keyOf(slot))
    if (!save && slot === 1 && old) {
      // The one character this game used to have, moved rather than asked
      // for again.  Written before the delete, so a browser that dies between
      // the two has the save twice rather than not at all.
      save = old
      await write(old, 1)
      await wipe(0).catch(() => {})
      try {
        const db2 = await open()
        db2?.transaction(STORE, 'readwrite').objectStore(STORE).delete(WAS)
      } catch { /* it will be moved again, harmlessly */ }
    }
    if (!save) continue
    const fresh = migrate(save)
    if (fresh) out.push({ slot, save: fresh })
  }
  return out
}

/**
 * The first slot nobody is in, or nothing when they are all full.
 *
 * Ten is the client's number — `MAX_CHARACTERS_PER_REALM` in
 * `CharacterSelect.lua`, which `pipeline/layout.py` reads — so "how many
 * characters may there be" is a question this game does not answer for
 * itself, the same as how many rows a shop shows at once.
 */
export const freeSlot = (cards: Card[], slots: number): number | null => {
  for (let slot = 1; slot <= slots; slot++) {
    if (!cards.some((c) => c.slot === slot)) return slot
  }
  return null
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
    you: { ...s.you,
           who: { name: '주인공', race: 1, sex: 0, cls: 1,
                  hair: 'plain', beard: '' } },
  }),
  /**
   * 2 → 3: the bar stopped being a rage bar.
   *
   * Every save that exists was made by a warrior, so what was in `rage` is
   * exactly what belongs in `power` — this is a rename with a character
   * behind it rather than a conversion.  It is a step anyway, because the
   * field is gone and a save that keeps answering `undefined` for the bar is
   * a character who logs in empty and cannot tell you why.
   */
  2: (s) => {
    const was = s.you as unknown as { rage?: number }
    const you = { ...s.you, power: was.rage ?? 0 }
    delete (you as unknown as { rage?: number }).rage
    return { ...s, version: 3, you }
  },
  /**
   * 3 → 4: the bag learned what it was carrying, and a trade got a ceiling.
   *
   * The bag was `word -> [how many, what the lot is worth]`, and the word was
   * the item's *class* — a tally of eleven `cloth` that cannot say how much of
   * it is linen.  A recipe asks for linen, so the tally had to start holding
   * ids, and **there is no way back from a word to an id**: eleven cloth was
   * eleven of several things and the save does not say which.
   *
   * So the old bag is sold rather than converted.  Its second number is
   * exactly what a shopkeeper would have paid for the lot — it was put there
   * for that and nothing else read it — so the purse is the honest landing
   * place, and the alternative, guessing an id per word, would put linen in a
   * bag that held wool.
   *
   * The trades convert cleanly and keep what they had: the three a character
   * used to be born with become three learned trades at apprentice, which is
   * the ceiling their old unbounded number never had.  182 herbalism, 186
   * mining, 393 skinning are the `SkillLine` ids the world database files them
   * under and the ids everything speaks now.
   */
  3: (s) => {
    const was = s.you as unknown as {
      bag?: Record<string, [number, number] | number>
      trades?: Record<string, number | [number, number]>
    }
    let paid = 0
    for (const v of Object.values(was.bag ?? {})) {
      if (Array.isArray(v)) paid += v[1] ?? 0
    }
    const WAS_CALLED: Record<string, number> = {
      herbs: 182, mining: 186, skinning: 393,
    }
    const APPRENTICE = 75
    const trades: Record<string, [number, number]> = {}
    for (const [k, v] of Object.entries(was.trades ?? {})) {
      const id = WAS_CALLED[k] ?? Number(k)
      if (!id) continue
      const rank = Array.isArray(v) ? v[0] : v
      trades[String(id)] = [Math.max(1, rank), APPRENTICE]
    }
    return { ...s, version: 4, you: { ...s.you, bag: {}, trades,
                                      purse: s.you.purse + paid } }
  },
  /**
   * 4 → 5: things wear out.
   *
   * Every save before this was made in a game where nothing lost durability,
   * so everything in it is whole — which is not a guess about the save but
   * the only thing that could have happened to it.  Empty is whole.
   */
  4: (s) => ({
    ...s,
    version: 5,
    you: { ...s.you, dura: { worn: {}, held: {} } },
  }),
}

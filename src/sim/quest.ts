/**
 * Errands: what somebody asks for, how far along you are, and what it pays.
 *
 * Everything here is arithmetic over the numbers `pipeline/quests.py` reads
 * out of AzerothCore and the client — a creature id, a count, an experience
 * figure.  None of Blizzard's prose is involved at any point: a quest has no
 * title in this file and no description, and `src/talk.ts` writes the sentence
 * from the shape.  That is the same bargain the spells make with `Spell.dbc`
 * and the doodads make with a model path.
 *
 * The rules are the server's, and they are short:
 *
 *   * somebody offers you a quest if you are at least its `min` level, you
 *     have not got it and have not done it, and whatever it comes `after` is
 *     done;
 *   * a kill counts if the thing you killed is the entry the quest names —
 *     the *entry*, not the kind, because all three of Northshire's kobolds are
 *     `kobold` and the quests want eight of each in turn;
 *   * an errand that asks for an item is paid by the thing that drops it, at
 *     the chance the loot table states;
 *   * and it is handed in to the creature the table says, which is not always
 *     the one who gave it.
 */

/** One quest, exactly as the bake writes it. */
export type Errand = {
  id: number
  level: number
  min: number
  from: number
  to: number
  /** `[creature entry, how many]`. */
  kill: [number, number][]
  /** `[item, how many, our word for it, [[dropped by, per cent]]]`. */
  fetch: [number, number, string, [number, number][]][]
  /**
   * Places it wants you to stand in: `[x, y, how wide]`, from
   * `areatrigger_involvedrelation` and the client's `AreaTrigger.dbc`.
   *
   * The fifth kind of objective, and the only one of the three that were
   * missing that this slice actually uses — five of its hundred and two
   * quests finish by walking somewhere rather than by killing or carrying.
   */
  walk?: number[][]
  /**
   * Which classes may be offered it — `quest_template_addon.AllowableClasses`.
   *
   * Nought is everybody, which is most of them; nineteen of this slice's
   * fifty-one name a mask.  It travels now because it has to: with one class
   * in the game the mask was a filter in the bake and there was nothing left
   * to ask, and with six a paladin's errand passing the bake does not put it
   * in a rogue's log.
   */
  classes?: number
  xp: number
  coin: number
  /**
   * What handing it in is worth to a side: `[faction, how much]`.
   *
   * The quest's own column is an *index* into `QuestFactionReward.dbc` rather
   * than an amount, which is why 37 of this game's 51 errands looked for a
   * long time as though they paid nothing at all — see `standings_paid` in
   * `pipeline/quests.py`.
   */
  rep?: [number, number][]
  /**
   * What handing it in pays besides the two above: `[item, how many]`.
   *
   * `gives` is unconditional and `pick` is one of several.  The second is the
   * more interesting half — nine of this slice's thirty-one errands offer a
   * choice of up to five, and choosing one of five things you cannot take
   * back is the shape of decision this game was short of.  At these levels an
   * errand's reward is also where most equipment comes from: the only other
   * ways in are the shirt you were made in and a shopkeeper.
   */
  gives: [number, number][]
  pick: [number, number][]
  /** The quest this one follows, or 0. */
  after: number
  /**
   * A positive `ExclusiveGroup`: one of these, and then no more of them.
   *
   * Nought in this slice — all twelve belonged to another class or sat
   * outside these levels — and the rule ships anyway, because a rule that
   * arrives with the quest is a rule nobody has to remember to add later.
   */
  group: number
  /**
   * `RewardNextQuest`: hand this in and the next one is offered on the spot.
   *
   * Not the same thing as `after`, which is "that one unlocks this one".
   * This is the difference between a chain you walk and a chain you are
   * handed, and fourteen of the thirty-one are handed.
   */
  leads: number
  /** `BreadcrumbForQuestId`: a signpost that vanishes once you have the thing
   * it points at. */
  instead: number
}

/** How far along one held quest is. */
export type Held = { id: number; kill: number[]; fetch: number[]
  /** Which of the quest's places have been stood in. */
  walk?: number[] }

export type Book = {
  all: Map<number, Errand>
  held: Held[]
  done: Set<number>
}

export function book(list: Errand[]): Book {
  return { all: new Map(list.map((q) => [q.id, q])), held: [], done: new Set() }
}

/** Everything still wanted on a held quest, as counts still short. */
export function short(b: Book, h: Held): number {
  const q = b.all.get(h.id)
  if (!q) return 0
  let n = 0
  q.kill.forEach(([, want], i) => { n += Math.max(0, want - (h.kill[i] ?? 0)) })
  q.fetch.forEach(([, want], i) => { n += Math.max(0, want - (h.fetch[i] ?? 0)) })
  ;(q.walk ?? []).forEach((_, i) => { n += (h.walk?.[i] ? 0 : 1) })
  return n
}

/**
 * Standing somewhere a quest wanted you to stand.
 *
 * Called with where you are; marks off every place, on every held quest, that
 * you are now inside.  Returns the ones that were newly reached, so the log
 * can say so — a quest that finishes with no line about it is a quest that
 * looks broken.
 */
export function walked(b: Book, x: number, y: number): Errand[] {
  const news: Errand[] = []
  for (const h of b.held) {
    const q = b.all.get(h.id)
    if (!q?.walk?.length) continue
    h.walk ??= q.walk.map(() => 0)
    q.walk.forEach((spot, i) => {
      if (h.walk![i]) return
      const [sx, sy, wide] = spot as number[]
      if ((sx! - x) ** 2 + (sy! - y) ** 2 <= wide! * wide!) {
        h.walk![i] = 1
        news.push(q)
      }
    })
  }
  return news
}

export const done = (b: Book, h: Held) => short(b, h) === 0

export const holding = (b: Book, id: number) => b.held.find((h) => h.id === id)

/**
 * What this creature will give you now.
 *
 * The order is the table's, which puts the chain in the order it is meant to
 * be walked: a quest that follows another cannot appear until that one is in
 * the finished pile.
 */
export function offers(b: Book, entry: number, level: number,
  cls = 0): Errand[] {
  const out: Errand[] = []
  for (const q of b.all.values()) {
    if (q.from !== entry || b.done.has(q.id) || holding(b, q.id)) continue
    if (level < q.min) continue
    if (cls && q.classes && !(q.classes & (1 << (cls - 1)))) continue
    if (q.after && !b.done.has(q.after)) continue
    if (shut(b, q)) continue
    if (spent(b, q)) continue
    out.push(q)
  }
  return out.sort((a, c) => a.min - c.min || a.id - c.id)
}

/**
 * Whether a sibling of this one has already been chosen.
 *
 * `ExclusiveGroup` positive is the table saying "one of these".  Taking one
 * shuts the rest, and *finishing* one shuts them for good — which is the
 * difference between a decision and a menu, and it is the reason the rule is
 * here rather than in the panel that draws it.
 */
export function shut(b: Book, q: Errand): boolean {
  if (q.group <= 0) return false
  for (const other of b.all.values()) {
    if (other === q || other.group !== q.group) continue
    if (b.done.has(other.id) || !!holding(b, other.id)) return true
  }
  return false
}

/**
 * Whether a signpost has nothing left to point at.
 *
 * `BreadcrumbForQuestId` names the errand this one exists to send you towards.
 * Once you have that errand — or have finished it — the signpost is somebody
 * telling you about a place you are standing in.
 */
export function spent(b: Book, q: Errand): boolean {
  return !!q.instead && (b.done.has(q.instead) || !!holding(b, q.instead))
}

/** What this creature will take off you, finished or not. */
export function wants(b: Book, entry: number): Held[] {
  return b.held.filter((h) => b.all.get(h.id)?.to === entry)
}

export function take(b: Book, q: Errand): Held {
  const h: Held = { id: q.id, kill: q.kill.map(() => 0), fetch: q.fetch.map(() => 0) }
  b.held.push(h)
  return h
}

/**
 * Credit a kill against everything held, and say what moved.
 *
 * Both halves at once, because one dead kobold can be both: the quest that
 * wants eight of them counts it, and the quest that wants eight linen scraps
 * rolls for one off the same body.  `roll` is passed in so a check can drive
 * this without waiting for luck.
 */
export function killed(b: Book, entry: number, roll: () => number): string[] {
  const news: string[] = []
  for (const h of b.held) {
    const q = b.all.get(h.id)
    if (!q || done(b, h)) continue
    q.kill.forEach(([who, want], i) => {
      if (who !== entry || (h.kill[i] ?? 0) >= want) return
      h.kill[i] = (h.kill[i] ?? 0) + 1
      news.push(`kill:${h.id}:${i}`)
    })
    q.fetch.forEach(([, want, , from], i) => {
      if ((h.fetch[i] ?? 0) >= want) return
      const hit = from.find(([who]) => who === entry)
      if (!hit || roll() * 100 > hit[1]) return
      h.fetch[i] = (h.fetch[i] ?? 0) + 1
      news.push(`fetch:${h.id}:${i}`)
    })
  }
  return news
}

/** Hand one in.  Returns what it paid. */
/**
 * Handing one in.
 *
 * `chose` is an index into the quest's `pick`, and -1 when there is nothing to
 * choose or nothing was chosen.  What comes back is everything the hand-in
 * pays, so the caller has one list to put in a bag rather than two rules.
 */
export function hand(b: Book, h: Held, chose = -1):
{ xp: number; coin: number; items: [number, number][];
  rep: [number, number][] } {
  const q = b.all.get(h.id)
  b.held = b.held.filter((x) => x !== h)
  b.done.add(h.id)
  const items: [number, number][] = [...(q?.gives ?? [])]
  const one = q?.pick?.[chose]
  if (one) items.push(one)
  return { xp: q?.xp ?? 0, coin: q?.coin ?? 0, items, rep: q?.rep ?? [] }
}

/**
 * What to put over somebody's head.
 *
 * The original's three marks and nothing else: a full mark for work on offer,
 * a full question for work that is finished, a hollow one for work that is
 * not.  Offers win over a half-done errand, because a player standing in front
 * of somebody with both wants to see that there is something new.
 */
export function mark(b: Book, entry: number, level: number):
'!' | '?' | '?.' | null {
  const taking = wants(b, entry)
  if (taking.some((h) => done(b, h))) return '?'
  if (offers(b, entry, level).length) return '!'
  return taking.length ? '?.' : null
}

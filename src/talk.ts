/**
 * What the people of Elwynn say, and why none of it came out of a database.
 *
 * AzerothCore knows everything about a conversation except the conversation.
 * It has `npc_text`, `broadcast_text`, `gossip_menu_option.OptionText` and a
 * title and a body for every quest — all of it Blizzard's prose, and none of
 * it usable here (the wiki page is 저작권과 배포 경계).  What it also has is
 * the shape: a row in `creature_queststarter`, sixteen item ids in
 * `npc_vendor`, a trainer whose spells all require skill line 164, a quest
 * whose `RequiredNpcOrGoCount1` is eight.
 *
 * So the pipeline carries out the numbers and this file writes the sentences.
 * That split is the whole design, and it has a pleasant side effect: because
 * every line is assembled from what the NPC can actually do, an NPC cannot
 * claim something the data does not support.  The smith says eighty-six
 * lessons because there are eighty-six rows.
 *
 * The words are deliberately plain.  A shopkeeper who says "I deal in
 * provisions — seventeen lines, a copper to forty silver" is telling the
 * player something they can act on; the flavour that would sit in its place is
 * exactly the part we are not allowed to borrow and have no business inventing
 * a substitute for.
 */

export type Quest = {
  lv: number
  coin: number
  kill: [string, number][]
  take: [string, number][]
  find: [string | null, number][]
}

export type Topic = {
  gives?: Quest[]
  takes?: number
  /** class, how many lines, cheapest, dearest — all in copper. */
  shop?: [string, number, number, number][]
  train?: { of: string; who: string | null; n: number; lo: number; hi: number }
  directs?: number
}

export type Option = { label: string; lines: string[] }
export type Speech = { who: string; greet: string; options: Option[] }

/** Where the nearest of a role is, for the ones who give directions. */
export type Direction = { role: string; yards: number; bearing: string }

const ANIMALS = new Set(['wolf', 'bear', 'boar', 'spider', 'deer', 'rabbit',
  'cow', 'sheep', 'chicken', 'cat', 'horse'])

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']

/** Counts a person would say out loud, and digits once they would not. */
function count(n: number): string {
  return n >= 0 && n < WORDS.length ? WORDS[n]! : String(n)
}

function plural(kind: string, n: number): string {
  if (n === 1) return single(kind)
  if (kind === 'sheep' || kind === 'deer' || kind === 'townsfolk') return kind
  if (kind === 'wolf') return 'wolves'
  return kind + 's'
}

/**
 * One of a kind, which is not always the kind word with the s taken off.
 *
 * `townsfolk` is the kind for everybody the world database calls a citizen,
 * and it has no singular — the first build had a quest that wanted "something
 * off a townsfolk".
 */
function single(kind: string): string {
  return kind === 'townsfolk' ? 'townsman' : kind
}

/** Copper the way a till would read it. */
export function coin(c: number): string {
  if (c <= 0) return 'nothing'
  const g = Math.floor(c / 10000), s = Math.floor((c % 10000) / 100), k = c % 100
  return [g && `${g}g`, s && `${s}s`, k && `${k}c`].filter(Boolean).join(' ')
}

/** Deterministic pick, so an NPC greets you the same way twice. */
function pick<T>(list: T[], seed: number): T {
  const n = Math.abs(Math.sin(seed * 12.9898) * 43758.5453)
  return list[Math.floor((n - Math.floor(n)) * list.length) % list.length]!
}

/**
 * What to call somebody, out of their kind and what they do.
 *
 * The role comes from `npcflag`, which is why a blacksmith is "a trainer" and
 * not "a blacksmith": the database says he teaches, and the sign over his door
 * is a sentence somebody wrote.
 */
const TITLE: Record<string, string> = {
  vendor: 'a trader', trainer: 'a teacher', questgiver: 'someone with work',
  stablemaster: 'a stablehand', spirithealer: 'a spirit',
  elite: 'something dangerous',
}

/**
 * What somebody is when their role does not say.
 *
 * `talker` is deliberately absent from `TITLE`: the role is the `npcflag`
 * gossip bit and nothing else, which means "will speak to you", not a trade.
 * Titling on it announced eleven of the slice's city guards as "a talker,
 * level 65" while the kind field beside it said `guard` the whole time.
 */
function noun(kind: string): string {
  return kind === 'guard' ? 'a guard' : kind === 'ghost' ? 'a shade' : 'a townsman'
}

const GREET: Record<string, string[]> = {
  vendor: ['Come in, come in.', 'Looking for anything in particular?',
    'Everything here is honest and priced so.'],
  trainer: ['You want teaching, then.', 'Stand there and listen.',
    'I have time, if you have the patience.'],
  questgiver: ['You look like you can carry something heavy.',
    'Good — somebody who is not busy.', 'There is work, if you want it.'],
  stablemaster: ['Your beast is safe with me.', 'I keep them fed.'],
  spirithealer: ['Not yet, I think.', 'You are still warm. Go on, then.'],
  talker: ['Quiet day.', 'You are new here.', 'Mind the road after dark.'],
  guard: ['Move along.', 'All quiet.', 'Keep to the road.'],
  idle: ['Hm.', 'Morning.', 'Was there something?'],
  prey: ['', ''],
}

/**
 * An animal the database hands a quest to.
 *
 * Nine chickens in the slice are `creature_queststarter` rows, and they are
 * not a mistake in the dump — a chicken really is how that errand starts.  It
 * still cannot say "Good — somebody who is not busy", which is what it said
 * until this bank existed: `who` knew it was an animal and the greeting did
 * not.
 */
const BEAST_GREET = ['It looks at you, and keeps looking.',
  'It will not leave you alone.', 'It follows you a step, and waits.']

function greeting(kind: string, role: string, seed: number): string {
  if (ANIMALS.has(kind)) return pick(BEAST_GREET, seed)
  const bank = GREET[role] ?? (kind === 'guard' ? GREET['guard']! : GREET['idle']!)
  return pick(bank.filter(Boolean), seed) ?? 'Hm.'
}

function objective(q: Quest): string {
  const parts: string[] = []
  for (const [k, n] of q.kill) parts.push(`${count(n)} ${plural(k, n)} dead`)
  for (const [k, n] of q.take)
    parts.push(n === 1 ? `something off a ${single(k)}`
      : `${count(n)} taken off the ${plural(k, n)}`)
  for (const [cls, n] of q.find)
    // The class words are plurals with no singular — `armour`, `provisions`,
    // `materials` — so they are counted in pieces.  Counted directly they come
    // out as "one provisions", which is how this was found.
    parts.push(cls === null
      ? (n === 1 ? 'one thing found' : `${count(n)} things found`)
      : `${count(n)} ${n === 1 ? 'piece' : 'pieces'} of ${cls}`)
  return parts.join(', and ')
}

/**
 * Everything one person is willing to talk about.
 *
 * `nearby` is asked only by the ones the database says hold a real gossip menu
 * — a menu whose options open other menus — which in this slice is sixteen
 * people, eleven of them city guards.  Where they point is worked out from our
 * own spawn list rather than from `points_of_interest`, because a POI row's
 * only useful field beyond its coordinates is a name.
 */
export function speak(
  kind: string, role: string, level: number, seed: number,
  topic: Topic | null, nearby: () => Direction[],
): Speech {
  const who = ANIMALS.has(kind)
    ? `a ${kind}, level ${level}`
    : `${TITLE[role] ?? noun(kind)}, level ${level}`

  if (!topic) {
    // Nothing in the database says this one has anything to offer, and that is
    // most of them: 703 of the 777 are animals, kobolds, bandits and murlocs.
    // Saying so plainly beats inventing a personality for a wolf.
    const idle = ANIMALS.has(kind)
      ? [`The ${kind} does not look up.`, `The ${kind} keeps its distance.`]
      : kind === 'ghost' ? ['It looks through you.']
        : ['Nothing to say to you.', 'They turn away.']
    return { who, greet: pick(idle, seed), options: [] }
  }

  const options: Option[] = []

  if (topic.shop) {
    // "40s to 40s" is what a range prints when the shelf holds one price.
    const price = (n: number, lo: number, hi: number) =>
      hi <= 0 ? '' : lo < hi ? ` — ${coin(lo)} to ${coin(hi)}`
        : n === 1 ? ` — ${coin(lo)}` : ` — ${coin(lo)} each`
    const lines = topic.shop.map(([cls, n, lo, hi]) =>
      `${count(n)} ${n === 1 ? 'line' : 'lines'} of ${cls}` + price(n, lo, hi))
    const total = topic.shop.reduce((a, r) => a + r[1], 0)
    options.push({
      label: 'What are you selling?',
      lines: [`${count(total)} ${total === 1 ? 'thing' : 'things'} on the shelf.`, ...lines],
    })
  }

  if (topic.train) {
    const t = topic.train
    const subject = t.who ?? (t.of === 'mounts' ? 'riding' : t.of === 'beasts' ? 'beasts' : 'a trade')
    const range = t.n === 0 ? 'Nothing at the moment.'
      : t.lo >= t.hi ? `${count(t.n)} ${t.n === 1 ? 'lesson' : 'lessons'}, all of them open to you now.`
        : `${count(t.n)} lessons — the first at level ${Math.max(1, t.lo)}, the last at ${t.hi}.`
    options.push({
      label: 'What can you teach?',
      lines: [t.of === 'class' ? `I take ${subject}.` : `${subject[0]!.toUpperCase()}${subject.slice(1)}.`, range],
    })
  }

  for (const q of topic.gives ?? []) {
    const need = objective(q)
    const lines = [need ? `${need[0]!.toUpperCase()}${need.slice(1)}.` : 'Something that needs doing.']
    lines.push(q.lv > 0 ? `It is work for about level ${q.lv}.` : 'Anyone could do it.')
    lines.push(q.coin > 0 ? `${coin(q.coin)} when it is done.` : 'No coin in it. Somebody has to.')
    options.push({ label: `Is there work? (level ${q.lv > 0 ? q.lv : '—'})`, lines })
  }

  if (topic.takes) {
    options.push({
      label: 'Someone sent me.',
      lines: [`Then you have found the end of it.`,
        `${count(topic.takes)} ${topic.takes === 1 ? 'errand ends' : 'errands end'} with me.`],
    })
  }

  if (topic.directs) {
    const to = nearby()
    options.push({
      label: 'Where do I find anyone?',
      lines: to.length === 0
        ? ['Nobody worth walking to, not from here.']
        : to.map((d) => `${TITLE[d.role] ?? d.role}: ${Math.round(d.yards)} yards ${d.bearing}.`),
    })
  }

  return { who, greet: greeting(kind, role, seed), options }
}

/**
 * Which way that is, in words.
 *
 * North is +x and west is +y — the server's convention, kept rather than
 * converted, because every other coordinate in this project is in it and one
 * translation somewhere in the middle is how a bearing ends up mirrored.
 */
export function bearing(dx: number, dy: number): string {
  const ns = dx > 0 ? 'north' : 'south'
  const ew = dy > 0 ? 'west' : 'east'
  const ax = Math.abs(dx), ay = Math.abs(dy)
  if (ax > ay * 2.4) return ns
  if (ay > ax * 2.4) return ew
  return `${ns}-${ew}`
}

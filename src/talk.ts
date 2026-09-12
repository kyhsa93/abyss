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
 * claim something the data does not support.  The smith offers eighty-six
 * lessons because there are eighty-six rows.
 *
 * **The sentences are Korean and the ids are not.**  `wolf`, `provisions`,
 * `smithing`, `questgiver` come out of the pipeline and stay English for their
 * whole life, because they are keys — into the sprite atlas, into these
 * tables, into a JSON file that is already written — and a key that is also a
 * word is a key that changes when somebody rewords it.  Every Korean noun in
 * this file is looked up from one of those ids, which is also why a missing
 * translation shows up as the id rather than as nothing.
 *
 * The words are deliberately plain.  A shopkeeper who says "식료품 열일곱 가지
 * — 25동에서 40은까지" is telling the player something they can act on; the
 * flavour that would sit in its place is exactly the part we are not allowed
 * to borrow and have no business inventing a substitute for.
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

export type Option = {
  label: string
  lines: string[]
  /**
   * An option that *does* something, rather than one that says something.
   *
   * Called once, the first time it is opened, and what it returns becomes its
   * lines.  Everything `speak` builds is a line of text worked out in advance;
   * selling is not, because it depends on what is in a bag this file has never
   * heard of.
   */
  act?: () => string[]
}
export type Speech = { who: string; greet: string; options: Option[] }

/** Where the nearest of a role is, for the ones who give directions. */
export type Direction = { role: string; yards: number; bearing: string }

const ANIMALS = new Set(['wolf', 'bear', 'boar', 'spider', 'deer', 'rabbit',
  'cow', 'sheep', 'chicken', 'cat', 'horse'])

/**
 * The kinds, in Korean.
 *
 * Two of these are deliberately not the words a Korean client would use.
 * `murloc` is Blizzard's own coinage, and `bandit` would collide with the
 * rogue class, which is 도적 as well — so they are 어인 and 산적, which are
 * ordinary words that were here before the game was.
 */
/** The word for a kind, for anything outside this file that needs one. */
export function nameOf(kind: string): string {
  return KIND[kind] ?? kind
}

const KIND: Record<string, string> = {
  townsfolk: '마을 사람', guard: '경비병', bandit: '산적', kobold: '코볼트',
  murloc: '어인', ghost: '망령', wolf: '늑대', bear: '곰', boar: '멧돼지',
  gnoll: '놀', orc: '오크', troll: '트롤',
  spider: '거미', deer: '사슴', rabbit: '토끼', cow: '소', sheep: '양',
  chicken: '닭', cat: '고양이', horse: '말',
}

/** Whoever is counted in 명 rather than in 마리. */
// Who speaks like a person.  A gnoll, an orc and a troll are people in the
// database's sense — they are humanoids — and none of them is going to answer
// you, so they stay out of this and get the same silence a wolf gets.
const PEOPLE = new Set(['townsfolk', 'guard', 'bandit', 'ghost'])

/** `item_template.class`, the way somebody behind a counter would say it. */
const GOODS: Record<string, string> = {
  provisions: '식료품', bags: '가방', weapons: '무기', gems: '보석',
  armour: '방어구', reagents: '시약', ammunition: '탄약', materials: '재료',
  recipes: '도면', quivers: '화살통', 'errand goods': '심부름 물건',
  keys: '열쇠', oddments: '잡동사니', glyphs: '문양',
  // What comes out of a body's pockets, which `spawn_npcs.py` words the same
  // way it words a shop's stock: the database says which drawer an item lives
  // in and the noun is ours, because every item name in that dump is
  // Blizzard's prose.
  potion: '물약', food: '식량', bandage: '붕대', bag: '가방',
  weapon: '무기', cloth: '천', leather: '가죽',
  ore: '광석', meat: '고기', herb: '약초', material: '재료',
  recipe: '도면', quiver: '화살통', errand: '심부름 물건',
  oddment: '잡동사니',
}

/**
 * Our word for an ability.
 *
 * The client's `Spell.dbc` has a name for every one of these and it is
 * Blizzard's prose, so `pipeline/spells.py` never reads the string block and
 * the words are here instead — named for what the thing does, which is the
 * same bargain the creature kinds and the shop's stock make.
 */
const ABILITY: Record<number, [string, string]> = {
  78: ['내려치기', '분노를 실어 다음 일격을 더 무겁게 한다'],
  6673: ['외침', '한동안 더 세게 친다'],
  100: ['달려들기', '멀리 있는 적에게 달려들며 분노가 붙는다'],
  772: ['찢기', '상처가 한동안 계속 벌어진다'],
}

/** The word and the sentence for an ability, or nothing if it has none. */
export function abilityOf(id: number): [string, string] | null {
  return ABILITY[id] ?? null
}

/** The word for a thing you are carrying. */
export function goodsOf(word: string): string {
  return GOODS[word] ?? word
}

/**
 * The trades, in plain words rather than in a client's coined ones.
 *
 * 대장일 and 마법 걸기 say what the person does.  The terms a Korean client
 * uses for those are somebody's invention, and the rule about not borrowing
 * Blizzard's words does not stop being the rule in translation.
 */
const TRADE: Record<string, string> = {
  'first aid': '응급 치료', smithing: '대장일', leatherworking: '가죽일',
  alchemy: '연금술', herbalism: '약초 캐기', cooking: '요리', mining: '채광',
  tailoring: '바느질', engineering: '기계 다루기', enchanting: '마법 걸기',
  fishing: '낚시', skinning: '가죽 벗기기', jewelcrafting: '보석 세공',
  riding: '말타기', inscription: '글씨 새기기',
}

const CLASS: Record<string, string> = {
  warriors: '전사', paladins: '성기사', hunters: '사냥꾼', rogues: '도적',
  priests: '사제', 'death knights': '죽음의 기사', shamans: '주술사',
  mages: '마법사', warlocks: '흑마법사', druids: '드루이드',
}

/**
 * Native numerals in the form that stands in front of a counter.
 *
 * 스물 becomes 스무 there and 열둘 becomes 열두, which is why this is a table
 * and not arithmetic.  Past twenty a person says the digits, which is the line
 * the English drew as well.
 */
const NATIVE = ['0', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟',
  '아홉', '열', '열한', '열두', '열세', '열네', '열다섯', '열여섯', '열일곱',
  '열여덟', '열아홉', '스무']

function many(n: number): string {
  return n > 0 && n < NATIVE.length ? NATIVE[n]! : String(n)
}

/**
 * A number with its counter.
 *
 * 맞춤법 제43항: a counter is a noun and stands apart from the numeral — 네 가지,
 * 여덟 개, 한 명 — except after digits, where it may be joined, and joining is
 * what everybody actually writes: 46가지.  Both rules are the same rule here,
 * because the digits only start where the words run out.  The first version
 * had no space in either case and offered 네가지.
 */
function count(n: number, unit: string): string {
  const word = many(n)
  return n > 0 && n < NATIVE.length ? `${word} ${unit}` : `${word}${unit}`
}

/**
 * 을/를, 은/는 — which one it is depends on the syllable in front of it.
 *
 * A Korean particle agrees with the final consonant of the word it attaches
 * to, so it cannot be written into the sentence: 전사 takes 를 and 사냥꾼 takes
 * 을, and both arrive from the same table lookup.  The final consonant is the
 * remainder of the syllable's code point over 28.
 *
 * Only words, deliberately.  A number agrees with how it is *read* — 74 is
 * 칠십사 and takes 가, 76 is 칠십육 and takes 이 — and every sentence here that
 * could have put a particle after a count was written to want a counter
 * instead, which needs none.
 */
export function josa(word: string, withFinal: string, without: string): string {
  const c = word.charCodeAt(word.length - 1)
  const final = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0
  return word + (final ? withFinal : without)
}

function kindOf(k: string): string {
  return KIND[k] ?? k
}

function unit(k: string): string {
  return PEOPLE.has(k) ? '명' : '마리'
}

/** Copper the way a till would read it. */
export function coin(c: number): string {
  if (c <= 0) return '없음'
  const g = Math.floor(c / 10000), s = Math.floor((c % 10000) / 100), k = c % 100
  return [g && `${g}금`, s && `${s}은`, k && `${k}동`].filter(Boolean).join(' ')
}

/** Deterministic pick, so an NPC greets you the same way twice. */
function pick<T>(list: T[], seed: number): T {
  const n = Math.abs(Math.sin(seed * 12.9898) * 43758.5453)
  return list[Math.floor((n - Math.floor(n)) * list.length) % list.length]!
}

/**
 * What to call somebody, out of their kind and what they do.
 *
 * The role comes from `npcflag`, which is why a blacksmith is 스승 and not
 * 대장장이: the database says he teaches, and the sign over his door is a
 * sentence somebody wrote.
 */
const TITLE: Record<string, string> = {
  vendor: '상인', trainer: '스승', questgiver: '일거리를 가진 사람',
  stablemaster: '마구간지기', spirithealer: '영혼', elite: '위험한 것',
}

/**
 * What somebody is when their role does not say.
 *
 * `talker` is deliberately absent from `TITLE`: the role is the `npcflag`
 * gossip bit and nothing else, which means "will speak to you", not a trade.
 * Titling on it announced eleven of the slice's city guards as 말 거는 사람
 * while the kind field beside it said `guard` the whole time.
 */
function noun(kind: string): string {
  return kind === 'guard' ? '경비병' : kind === 'ghost' ? '망령' : '마을 사람'
}

/**
 * How they open.
 *
 * 하오체 throughout, which is the register a village of strangers speaks in:
 * polite without being deferential, and it does not have to decide whether the
 * player outranks a guard.
 */
const GREET: Record<string, string[]> = {
  vendor: ['어서 오시오.', '뭘 찾으시오?', '여기 물건은 값이 정직하오.'],
  trainer: ['배우러 왔구려.', '거기 서서 듣기나 하시오.',
    '시간은 있소. 그쪽이 참을성만 있다면.'],
  questgiver: ['무거운 것 좀 나를 수 있겠구려.', '마침 한가한 사람이 왔군.',
    '일거리가 있소. 하겠다면.'],
  stablemaster: ['짐승은 내가 맡겠소.', '먹이는 내가 챙기오.'],
  spirithealer: ['아직은 아니지.', '아직 따뜻하군. 가 보시오.'],
  guard: ['지나가시오.', '별일 없소.', '길에서 벗어나지 마시오.'],
  idle: ['음.', '안녕하시오.', '무슨 일이오?'],
}

/**
 * An animal the database hands a quest to.
 *
 * Nine chickens in the slice are `creature_queststarter` rows, and they are
 * not a mistake in the dump — a chicken really is how that errand starts.  It
 * still cannot say 마침 한가한 사람이 왔군, which is what it said until this
 * bank existed: `who` knew it was an animal and the greeting did not.
 */
const BEAST_GREET = ['쳐다보고는 눈을 떼지 않는다.', '자꾸 따라붙는다.',
  '한 걸음 따라오다 멈춰 선다.']

function greeting(kind: string, role: string, seed: number): string {
  if (ANIMALS.has(kind)) return pick(BEAST_GREET, seed)
  const bank = GREET[role] ?? (kind === 'guard' ? GREET['guard']! : GREET['idle']!)
  return pick(bank, seed)
}

/**
 * What the errand wants, as the list of things it is.
 *
 * Each part is its own short clause rather than one conjugated sentence: the
 * three kinds of objective take three different verbs, and a Korean sentence
 * that has to end in all of them at once ends in none of them well.
 */
function objective(q: Quest): string {
  const parts: string[] = []
  for (const [k, n] of q.kill) parts.push(`${kindOf(k)} ${count(n, unit(k))} 잡기`)
  for (const [k, n] of q.take)
    parts.push(n === 1
      ? `${kindOf(k)}에게서 뭔가 하나 얻기`
      : `${kindOf(k)}에게서 ${count(n, '개')} 거두기`)
  for (const [cls, n] of q.find)
    parts.push(cls === null
      ? `뭔가 ${count(n, '개')} 찾기`
      : `${GOODS[cls] ?? cls} ${count(n, '개')} 찾기`)
  return parts.join(', ')
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
    ? `${kindOf(kind)}, ${level}레벨`
    : `${TITLE[role] ?? noun(kind)}, ${level}레벨`

  if (!topic) {
    // Nothing in the database says this one has anything to offer, and that is
    // most of them: 703 of the 777 are animals, kobolds, bandits and murlocs.
    // Saying so plainly beats inventing a personality for a wolf.
    const k = kindOf(kind)
    const idle = ANIMALS.has(kind)
      ? [`${josa(k, '은', '는')} 고개도 들지 않는다.`,
        `${josa(k, '은', '는')} 거리를 둔다.`]
      : kind === 'ghost' ? ['당신을 지나쳐 바라본다.']
        : ['할 말 없소.', '고개를 돌린다.']
    return { who, greet: pick(idle, seed), options: [] }
  }

  const options: Option[] = []

  if (topic.shop) {
    // "40은에서 40은까지" is what a range prints when the shelf holds one price.
    const price = (n: number, lo: number, hi: number) =>
      hi <= 0 ? '' : lo < hi ? ` — ${coin(lo)}에서 ${coin(hi)}까지`
        : n === 1 ? ` — ${coin(lo)}` : ` — 모두 ${coin(lo)}`
    const lines = topic.shop.map(([cls, n, lo, hi]) =>
      `${GOODS[cls] ?? cls} ${count(n, '가지')}` + price(n, lo, hi))
    const total = topic.shop.reduce((a, r) => a + r[1], 0)
    options.push({
      label: '뭘 파시오?',
      lines: [`선반에 ${count(total, '개')} 있소.`, ...lines],
    })
  }

  if (topic.train) {
    const t = topic.train
    const name = t.who ? (t.of === 'class' ? CLASS[t.who] : TRADE[t.who]) ?? t.who : null
    const head = t.of === 'class'
      ? (name ? `${josa(name, '을', '를')} 받소.` : '제자를 받소.')
      : `${josa(name ?? (t.of === 'mounts' ? '말타기'
        : t.of === 'beasts' ? '짐승 다루기' : '손기술'), '을', '를')} 가르치오.`
    const range = t.n === 0 ? '지금은 가르칠 게 없소.'
      : t.lo >= t.hi ? `${count(t.n, '가지')}, 전부 지금 배울 수 있소.`
        : `가르칠 것이 ${count(t.n, '가지')}. 첫째는 ${Math.max(1, t.lo)}레벨, 마지막은 ${t.hi}레벨.`
    options.push({ label: '뭘 가르치시오?', lines: [head, range] })
  }

  for (const q of topic.gives ?? []) {
    const need = objective(q)
    const lines = [need ? `${need}.` : '해야 할 일이 있소.']
    lines.push(q.lv > 0 ? `${q.lv}레벨쯤 되는 일이오.` : '누구나 할 수 있는 일이오.')
    lines.push(q.coin > 0 ? `끝나면 ${coin(q.coin)}.`
      : '삯은 없소. 그래도 누군가는 해야 하오.')
    options.push({ label: `일거리가 있소? (${q.lv > 0 ? `${q.lv}레벨` : '—'})`, lines })
  }

  if (topic.takes) {
    options.push({
      label: '누가 보내서 왔소.',
      lines: ['그럼 여기가 그 끝이오.', `나로 끝나는 일이 ${count(topic.takes, '건')} 있소.`],
    })
  }

  if (topic.directs) {
    const to = nearby()
    options.push({
      label: '사람을 어디서 찾소?',
      lines: to.length === 0
        ? ['여기서 걸어갈 만한 사람은 없소.']
        : to.map((d) => `${TITLE[d.role] ?? d.role} — ${d.bearing}쪽 ${Math.round(d.yards)}야드.`),
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
 * Korean names the north half of a diagonal first, the same order English does.
 */
export function bearing(dx: number, dy: number): string {
  const ns = dx > 0 ? '북' : '남'
  const ew = dy > 0 ? '서' : '동'
  const ax = Math.abs(dx), ay = Math.abs(dy)
  if (ax > ay * 2.4) return ns
  if (ay > ax * 2.4) return ew
  return `${ns}${ew}`
}

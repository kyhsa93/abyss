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

export type Topic = {
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
 * Whether a thing has hands, which is the only reason the fight cares.
 *
 * `Unit::GetUnitParryChance` (Unit.cpp:3812) gives a creature five per cent to
 * parry **only if it is a humanoid**.  A wolf cannot parry and a kobold can,
 * and with the hit table in it that is the difference between two fights.
 */
export const parries = (kind: string): boolean => !ANIMALS.has(kind)

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
  return KIND[kind] ?? THING[kind] ?? kind
}

const KIND: Record<string, string> = {
  townsfolk: '마을 사람', guard: '경비병', bandit: '산적', kobold: '코볼트',
  murloc: '어인', ghost: '망령', wolf: '늑대', bear: '곰', boar: '멧돼지',
  gnoll: '놀', orc: '오크', troll: '트롤',
  spider: '거미', deer: '사슴', rabbit: '토끼', cow: '소', sheep: '양',
  chicken: '닭', cat: '고양이', horse: '말',
}

/**
 * What is standing there that is not a person.
 *
 * `pipeline/objects.py`'s words for the world's objects, which are the
 * terrain classifier's words plus the two the lock decides — a node the lock
 * calls a herb is a herb whatever its model is named after.
 */
const THING: Record<string, string> = {
  herb: '약초', vein: '광맥', crate: '상자', barrel: '통', campfire: '모닥불',
  prop: '살림살이', post: '이정표', sign: '표지판', vine: '포도덩굴',
  grave: '무덤', bush: '덤불', flower: '꽃', rock: '바위', hay: '건초',
  crop: '작물', firewood: '장작', mailbox: '우편함', anvil: '모루',
  forge: '용광로',
}

/** Where a thing goes, for the shop and the paperdoll. */
export const SLOT_WORD: Record<string, string> = {
  head: '머리', shoulder: '어깨', shirt: '속옷', chest: '가슴', belt: '허리',
  legs: '다리', feet: '발', wrist: '손목', hands: '손', back: '등',
  weapon: '무기', offhand: '보조', ranged: '원거리',
}

/** And the five things a stat can be. */
export const STAT_WORD: Record<string, string> = {
  str: '힘', agi: '민첩', sta: '체력', int: '지능', spi: '정신력',
}

/** And the trades that open them, which `Lock.dbc` names by number. */
export const TRADE_WORD: Record<string, string> = {
  herbs: '약초 채집', mining: '채광', skinning: '무두질',
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
  // Everything below needed `SpellRadius.dbc` and `SpellCastTimes.dbc`
  // resolved before it could do anything — a thunderclap with no radius is a
  // spell that hits nobody, so there was no point giving it a word.
  6343: ['천둥벼락', '둘레의 모두를 한꺼번에 후려친다'],
  284: ['내려치기 2', '더 무거운 일격'],
  1715: ['다리 걸기', '한동안 절게 만든다'],
  2687: ['피의 욕망', '제 피를 태워 분노를 얻는다'],
  6546: ['달려들기 2', '더 멀리서 달려든다'],
  6603: ['맨손 공격', '무기 없이 친다'],
  3127: ['막기 자세', '방패를 세운다'],
  34428: ['승리의 예감', '쓰러뜨린 직후 한 번 크게 친다'],
  59752: ['정신 집중', '붙잡힌 것을 떨쳐낸다'],
  // The four nobody sells.  A warrior is given these rather than taught them
  // — `SkillLineAbility.dbc` files them under the three skill lines
  // `playercreateinfo_skills` hands him at creation — which is why they were
  // missing from a book built out of `trainer_spell` alone.
  2457: ['전투 자세', '공격에 무게를 싣는다. 자세를 바꾸면 분노가 사라진다'],
  71: ['방어 자세', '맞는 것이 가벼워지고 때리는 것도 가벼워진다. '
    + '자세를 바꾸면 분노가 사라진다'],
  355: ['도발', '무슨 수를 쓰든 이쪽을 보게 만든다'],
  7386: ['방어구 부수기', '방어도를 깎는다. 겹쳐 쌓인다'],
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

  // Work used to be described here and not handed over: a line saying what
  // somebody wanted, with nothing behind it.  `src/quest.ts` does the real
  // thing now — it offers, it counts and it pays — so the two sat side by side
  // in the same panel and one of them was scenery.  It is gone; `takes` went
  // with it, because the thing that knows what somebody is waiting for is the
  // quest book and not a count in a topic.

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

/**
 * Where you are, by the client's own area id.
 *
 * The bake writes one id a 33-yard chunk and never a name — an area name is
 * Blizzard's prose like everything else — so the words are here, and they are
 * ours.  Each one is a description of what the slice actually holds in that
 * area, read off the data rather than remembered: area 91 has a mage's tower
 * standing in it and nothing else, 120 has a barracks and fourteen guards,
 * 4411 has three dock sections, two ships and a pair of harbour towers, 57
 * has a gold mine and forty-eight kobolds.  That is why they can be written
 * down here at all.
 *
 * Eighteen of the thirty-five are named and seventeen are not, and **the ones
 * that are not have to look like it**.  They used to fall back to "엘윈 숲",
 * so standing on the shore of Westfall or in a corner of the Burning Steppes
 * said you were in the forest — the silent-default mistake this repository
 * keeps finding, in the one place a player can actually see it.  `zoneOf`
 * says whose ground it is and shows the id instead.
 */
/**
 * A place, and the kind of place it claims to be.
 *
 * The word is ours and always will be.  **Which place it is, is a fact**, and
 * that half was being guessed off a map: ten of the thirty-six came out
 * wrong, and four of them were wearing a neighbour's name — the hillside the
 * abbey stands on was called "the abbey" while the abbey's own id is 24, and
 * a lake was called "the quarry" while the quarry's own id is 54.  Names had
 * slid sideways onto the places next door.
 *
 * The giveaway was in our own water mask the whole time.  The three wettest
 * places in Elwynn were called a logging camp, a quarry and an abbey.
 *
 * So each word now states the kind of place it believes it is describing, and
 * `zone_kinds` in `pipeline/bake_terrain.py` derives that kind from the world
 * we baked — how much of it is water, what stands in it, at what density.
 * `bordercheck` puts the two side by side.  Where the ground cannot see what
 * makes a place what it is — a mine is underground, a bandit camp is fourteen
 * bandits and no buildings — the claim names the people instead, and the
 * check counts them in `npcs.json`.  Nothing here is a guess any more; it is
 * a claim with somewhere to check it.
 */
const ZONE: Record<number, [string, string]> = {
  // Named, and the kind holds.
  9: ['노스샤이어 계곡', 'wood'],
  12: ['엘윈 숲', 'wood'],
  62: ['제리프의 농장', 'farm'],
  63: ['스톤필드 농장', 'farm'],
  87: ['골드샤이어', 'town'],
  88: ['벌목장 마을', 'town'],
  916: ['웨스트폴 농가', 'farm'],
  4411: ['스톰윈드 항구', 'town'],
  120: ['서부 주둔지', 'camp'],
  61: ['삼거리', 'wood'],
  54: ['광부의 언덕', 'wood'],
  2421: ['검은바위 산', 'open'],
  // Named for who lives there, because the ground cannot see it.  A mine is a
  // hole under the hill and a camp is people with no buildings, so the claim
  // is the people and the check counts them.
  56: ['도적 숙영지', 'wood:bandit'],
  57: ['코볼트 광산', 'wood:kobold'],
  60: ['다리목 초소', 'wood:guard'],
  798: ['숲길 초소', 'wood:guard'],
  797: ['무법자 숲', 'wood:bandit'],
  // The zones in their own right, which reach into this box and are not
  // places inside it.  Their names are not a guess about a corner of a
  // forest; a sliver of Westfall is still Westfall, and what the box catches
  // of it is beach.
  40: ['웨스트폴', '*'],
  46: ['불타는 평원', '*'],
  10: ['어둠의 숲', '*'],
  1519: ['스톰윈드', '*'],
  // And the ones the derivation contradicted.  Our words, from the kind the
  // world says they are and where they sit: this is the step that used to be
  // a person squinting at a map.
  18: ['서쪽 호수', 'water'],          // 25% water, called a logging camp
  92: ['남쪽 호수', 'water'],          // 29% water, called a quarry
  1617: ['성 앞 물길', 'water'],       // 28% water, called a wall
  799: ['바위 여울', 'water'],         // 33% water and the rockiest ground here
  86: ['동쪽 언덕', 'town'],           // the hill the abbey stands on; 24 is the abbey itself
  64: ['서쪽 밭', 'farm'],             // hay and fences, called a quarry
  89: ['성 밖 마을', 'town'],          // houses, called a farm
  91: ['뼈 무덤가', 'graves'],         // bones outnumber everything, called a tower
  34: ['북쪽 등성이', 'wood'],         // no water at all, called a river
  59: ['노스샤이어 남쪽 숲', 'wood'],  // no crop, no fence, called a vineyard
  2: ['서쪽 모래밭', 'open'],          // nothing stands on it, called a wreck
  1002: ['남쪽 어귀', 'open'],         // six chunks, nothing in them, called a bridge
  253: ['평원 어귀', 'open'],          // two chunks, called a barracks
  // Indoors, which the client keeps a separate table for: the hillside the
  // abbey stands on is 86 and its nave is 24.  No kind — the derivation reads
  // the terrain grid and there is no terrain in a nave.
  24: ['수도원 안', '*'],
}

/** What each word claims the place is, for the check that it is true. */
export const ZONE_CLAIMS: Record<number, string> =
  Object.fromEntries(Object.entries(ZONE).map(([k, v]) => [k, v[1]]))

/**
 * The word for an area, and what to say when there is not one.
 *
 * `inside` is the area's parent out of `AreaTable.dbc` — an integer, not a
 * name — so an unnamed corner can say whose ground it is standing on and then
 * admit it has no word of its own.  A place with no name and no named parent
 * shows the bare id, which is what `nameOf` does for a creature nobody has
 * written a word for: **a thing this repository has not named must not come
 * out looking like a thing it has.**
 */
export function zoneOf(area: number, inside = 0): string {
  const mine = ZONE[area]
  if (mine) return mine[0]
  if (!area) return '엘윈 숲'
  const over = ZONE[inside]
  return over ? `${over[0]} · 지역 ${area}` : `지역 ${area}`
}

/**
 * An errand, in words.
 *
 * The database has a title and a description for every one of these and both
 * are Blizzard's, so neither is read.  What is read is the shape — kill eight
 * of creature 6, fetch eight of item 752 — and the shape is enough to say what
 * the job is, because the job *is* the shape.  The creature's kind comes from
 * the spawn table and the item's word from its class, both already ours.
 */
export function errand(
  job: { kill: [string, number][]; fetch: [string, number][] },
): string[] {
  const out: string[] = []
  for (const [what, n] of job.kill) {
    // 마리 for a beast and 명 for a person: eight bandits are not eight head
    // of anything, and the counter is the word that says which.
    out.push(`${josa(nameOf(what), '을', '를')} ${n}${unit(what)} 처치`)
  }
  for (const [word, n] of job.fetch) {
    out.push(`${josa(goodsOf(word), '을', '를')} ${n}개 수집`)
  }
  return out.length ? out : ['전하는 말을 가져가기']
}

/** How far along, as `3 / 8`. */
export const tally = (got: number, want: number) => `${got} / ${want}`

/** What an errand pays, in words. */
export function reward(xp: number, copper: number): string {
  const bits: string[] = []
  if (xp) bits.push(`경험치 ${xp}`)
  if (copper) bits.push(coin(copper))
  return bits.length ? bits.join(', ') : '사례 없음'
}

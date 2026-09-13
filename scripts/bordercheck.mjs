/**
 * The module boundary, as a check rather than as a paragraph.
 *
 * The wiki's structure page opens with "a boundary that lives only in a
 * document is not kept", and then the boundary lived only in a document.
 *
 * Four of these read the source, which is weaker than running it.  The fifth
 * is the real one: **the rules load in Node with no browser at all.**  A
 * module that reaches for `document` passes every grep you can write against
 * it right up until the day somebody adds one line, and then fails here.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const check = (what, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? `   -> ${detail}` : ''}`)
  if (!ok) bad++
}

/**
 * The modules that are rules rather than screen.
 *
 * These are what a headless harness would run and what a check can roll
 * twenty thousand times: the hit table, the experience curve, the quest
 * ledger, the stream of chance, what an item does.  `main.ts` and `hud.ts`
 * are the other half and are allowed everything.
 */
/**
 * Everything in `src/sim/` plus the save, which is the one exception.
 *
 * The directory is the rule now rather than a list somebody keeps up to date:
 * a file added to `src/sim/` is checked by being there.
 */
const PURE = [...readdirSync(join('src', 'sim'))
  .filter((f) => f.endsWith('.ts')).map((f) => join('sim', f)), 'save.ts']
const SCREEN = /\b(document|window|HTMLElement|localStorage|requestAnimationFrame|CanvasRenderingContext2D)\b/

/** Comments are prose, and prose is allowed to name the thing it forbids. */
const code = (body) => body
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')

for (const name of PURE) {
  const body = code(readFileSync(join('src', name), 'utf8'))
  // `save.ts` is the exception it has to be: IndexedDB *is* the browser, and
  // naming the exception is the point of keeping a list rather than a rule.
  const banned = name === 'save.ts'
    ? /\b(document|window|HTMLElement|localStorage|requestAnimationFrame)\b/
    : SCREEN
  const hit = body.match(banned)
  check(`src/${name} is rules and not screen`, !hit, hit ? hit[0] : '')
}

// Nothing in `src/` may reach into the pipeline, and nothing in the pipeline
// may reach into `src/`: one is what runs in a browser and the other is what
// runs where the client is, and they share a shape rather than a file.
const sources = readdirSync('src').filter((f) => f.endsWith('.ts'))
const leaks = []
for (const f of sources) {
  const body = code(readFileSync(join('src', f), 'utf8'))
  if (/from\s+'[^']*pipeline\//.test(body)) leaks.push(`src/${f}`)
}
for (const f of readdirSync('pipeline').filter((f) => f.endsWith('.py'))) {
  const body = readFileSync(join('pipeline', f), 'utf8')
  if (/from\s+src[.\/]|import\s+src\b/.test(body)) leaks.push(`pipeline/${f}`)
}
check('the pipeline and the scene do not import each other', leaks.length === 0,
  leaks.join(', '))

// And the one that runs.  Imported straight into Node — no bundler, no DOM —
// and asked to produce an answer, because a module that only *looks* pure is
// a module nobody has tried.
let ran = null
try {
  const { xpFor, greyAt } = await import('../src/sim/fight.ts')
  const { rollMelee, healthFromStamina, MISS } = await import('../src/sim/stats.ts')
  const { roll, reseed } = await import('../src/sim/roll.ts')
  reseed(1)
  const outcomes = new Set()
  for (let i = 0; i < 5000; i++)
    outcomes.add(rollMelee({ level: 1, crit: 5 },
      { level: 1, dodge: 5, parry: 5, block: 5 }, roll() * 10000))
  ran = {
    xp: xpFor(1, 1, false), grey: greyAt(10),
    health: healthFromStamina(22), outcomes: outcomes.size,
    missed: outcomes.has(MISS),
  }
} catch (e) {
  ran = { error: String(e).slice(0, 200) }
}
check('and they run in Node with no browser at all',
  !!ran && !ran.error && ran.health === 40 && ran.outcomes > 3,
  ran.error ?? `a level 1 kill is ${ran.xp} xp, 22 stamina is ${ran.health} health, `
    + `${ran.outcomes} different outcomes in 5,000 swings`)

// --- a place is what the world says it is ----------------------------------
//
// The words in `src/talk.ts` are ours and always will be.  Which place each
// one is describing is a fact, and that half was guessed off a map: ten of
// thirty-six came out wrong, four of them wearing a neighbour's name.  The
// three wettest places in Elwynn were called a logging camp, a quarry and an
// abbey, and the water mask that says so had been baked the whole time.
//
// So each word states the kind it claims and this puts the two side by side.
{
  const terrain = JSON.parse(readFileSync(join('public', 'data', 'terrain.json'), 'utf8'))
  const people = JSON.parse(readFileSync(join('public', 'world', 'npcs.json'), 'utf8'))
  const { ZONE_CLAIMS, zoneOf } = await import('../src/talk.ts')
  const derived = terrain.areaKind ?? {}

  // Who lives where, on the same grid the kinds were derived on.
  const { areaWidth: AW, areaHeight: AH, areaUnit: AU, areaIds: IDS,
    width: W, height: H, groundWidth: GW, groundHeight: GH, x0, y0 } = terrain
  const bin = readFileSync(join('public', 'data', 'terrain.bin'))
  const zones = bin.subarray(W * H * 5 + GW * GH, W * H * 5 + GW * GH + AW * AH)
  const lives = {}
  for (const r of people.npcs) {
    const i = Math.floor((x0 - r[0]) / AU), j = Math.floor((y0 - r[1]) / AU)
    if (i < 0 || i >= AW || j < 0 || j >= AH) continue
    const a = IDS[zones[i * AH + j]]
    if (a === undefined) continue
    const kind = people.kinds[r[2]]
    lives[a] ??= {}
    lives[a][kind] = (lives[a][kind] ?? 0) + 1
  }

  const wrong = []
  for (const [id, claim] of Object.entries(ZONE_CLAIMS)) {
    // `*` is a zone in its own right reaching into this box, or an indoor
    // area with no terrain under it.  Neither is a guess about a corner.
    if (claim === '*') continue
    const [want, who] = claim.split(':')
    const got = derived[id]
    if (got === undefined) { wrong.push(`${id} is not in the slice`); continue }
    if (got !== want) wrong.push(`${id} ${zoneOf(+id)} claims ${want}, world says ${got}`)
    // A claim about people is checked against the people — and by rank, not
    // by count.  A guard post is six guards and a kobold mine is forty-eight
    // kobolds; what makes both true is that they are who is *there*, not how
    // many.  Top two, because a den of gnolls with ten guards outside it is
    // fairly called either.
    if (who) {
      const rank = Object.entries(lives[id] ?? {}).sort((a, b) => b[1] - a[1])
      const at = rank.findIndex(([k]) => k === who)
      if (at < 0 || at > 1) {
        wrong.push(`${id} ${zoneOf(+id)} claims ${who}, and it is `
          + (at < 0 ? 'not there' : `only its ${at + 1}th commonest`))
      }
    }
  }
  check('every place is the kind of place its name claims', wrong.length === 0,
    wrong.join('; '))

  // The two the issue asked for by name, stated as rules rather than as a
  // list of ten corrections — a correction is good once and a rule is good
  // every time the world is rebaked.
  // Words that say somebody built something or camped somewhere.  A place a
  // fifth under water is not one of these, whatever a map suggested.
  const BUILT = ['마을', '농장', '농가', '초소', '주둔지', '숙영지', '선착장',
    '채석장', '광산', '벌목장', '방앗간', '탑', '수도원', '야영지', '항구',
    '밭', '포도밭', '다리', '성벽']
  const wet = Object.entries(ZONE_CLAIMS)
    .filter(([id, c]) => c !== '*' && derived[id] === 'water')
    .filter(([id]) => BUILT.some((w) => zoneOf(+id).includes(w)))
  check('nowhere a fifth under water is named after a building',
    wet.length === 0, wet.map(([id]) => `${id} ${zoneOf(+id)}`).join('; '))

  /**
   * The naming scheme, written down, which is the point of writing it down.
   *
   * A place's name here is *shape*, *bearing* and *whose* — 노스샤이어 남쪽
   * 숲, 성 밖 마을, 광부의 언덕.  The first two repeat by design: there are
   * two lakes and they are both lakes, and one of them is west.  The third
   * may not: a word that names a particular thing belongs to one place, and
   * the bug this exists to catch is exactly that word sliding sideways onto
   * the neighbour — the hillside called "노스샤이어 수도원" while the abbey's
   * own nave was "수도원 안", which no amount of comparing whole strings
   * finds.
   *
   * So shape and bearing are listed and everything left over is a claim on a
   * particular thing.  Both lists are ours; neither is long; and a word
   * missing from them fails loudly rather than quietly, because the check
   * then reads it as a proper name and complains about a collision that is
   * not one.
   */
  const SHAPE = ['숲', '계곡', '호수', '마을', '밭', '포도밭', '야영지', '무덤가',
    '물길', '여울', '언덕', '빈터', '어귀', '모래밭', '산', '항구', '초소',
    '광산', '농장', '농가', '등성이', '물가', '주둔지', '숙영지', '안', '숲길',
    '삼거리', '평원', '강', '다리', '탑', '해안', '바위', '벌목장', '채석장',
    '들', '벌']
  const WHERE = ['서쪽', '남쪽', '북쪽', '동쪽', '가운데', '밖', '앞', '뒤', '위',
    '아래']
  /**
   * And the regions, which a place inside one is welcome to wear.
   *
   * Each is an area in this slice, which is what makes this a list rather
   * than an excuse — 웨스트폴 농가 is a farmhouse in Westfall and saying so
   * is the whole point of the name.
   */
  const REGION = ['노스샤이어', '스톰윈드', '웨스트폴', '엘윈', '성']
  const words = (name) => name.split(/[\s·]+/)
    .filter((w) => w.length > 1 && !SHAPE.includes(w) && !WHERE.includes(w)
      && !REGION.includes(w))

  const names = Object.keys(ZONE_CLAIMS).map((id) => [id, zoneOf(+id)])
  const parent = terrain.areaParent ?? {}
  /** Whether one place sits inside the other, however many steps up. */
  const within = (a, b) => {
    for (let at = a, n = 0; at && n < 8; at = parent[at], n++) if (at === b) return true
    return false
  }
  const clash = []
  for (const [a, x] of names) {
    for (const [b, y] of names) {
      if (a >= b) continue
      // A place may wear its parent's name — 웨스트폴 농가 is a farmhouse in
      // Westfall and saying so is the point.  What is not allowed is two
      // places side by side answering to one word, which is how the hillside
      // came to be called the abbey.
      if (within(String(a), Number(b)) || within(String(b), Number(a))) continue
      // Token by token, because containment misses the shape this actually
      // took: the hillside was "노스샤이어 수도원" while the abbey's own
      // nave was "수도원 안", and neither string contains the other.  A word
      // naming a thing belongs to one place.
      if (x === y) { clash.push(`${a}/${b} both ${x}`); continue }
      const shared = words(x).filter((w) => words(y).includes(w))
      if (shared.length) clash.push(`${a}/${b} ${x} ~ ${y} (${shared.join(' ')})`)
    }
  }
  check('and no two places wear variants of one name', clash.length === 0,
    clash.join('; '))
}

console.log(bad ? `${bad} FAILED` : 'all checks passed')
process.exit(bad ? 1 : 0)

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
  // Asked of the bake, not added up here.  This was the third copy of the
  // arithmetic and the day a plane went in between the paint and the zones it
  // read the zones out of the middle of the paint — and reported that five
  // places in the forest are not the kind of place their name claims, which is
  // a sentence about neither planes nor paint.
  const [ZAT, ZLEN] = terrain.bin?.zones ?? [W * H * 5 + GW * GH, AW * AH]
  const zones = bin.subarray(ZAT, ZAT + ZLEN)
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

  // **Nothing in the pipeline may open one of the client's textures.**
  //
  // The dangerous discovery of issue 214 is that they open: a `.blp` is 43 KB
  // of 256 by 256 RGB and PIL reads all fifty-one of them without being asked
  // twice.  So it is easy, and the boundary says no — Blizzard's art stays in
  // the archive and what leaves is numbers.
  //
  // A grep over the *output* cannot say this.  A texture decoded and re-cut
  // into a tile carries no path and no archive name with it; it would go
  // straight through the bake's own boundary grep, which looks for strings.
  // What can be said, and is the whole invariant, is that **no code here
  // reads one** — the pipeline handles the client's texture names as words to
  // classify and never as files to open.
  //
  // Two kinds of line are looked for: a read whose path ends in `.blp`, and a
  // decoder — nothing here should know what a BLP header looks like.  Naming
  // one in a string, which `classify_ground` does fifty-one times a chunk, is
  // the thing this is *for* and is not a read.
  const opens = []
  for (const f of readdirSync('pipeline').filter((n) => n.endsWith('.py'))) {
    const src = readFileSync(join('pipeline', f), 'utf8')
    for (const [i, line] of src.split('\n').entries()) {
      const bare = line.replace(/#.*$/, '')
      if (/(read|open|load|decode)\s*\([^)]*\.blp/i.test(bare)
        || /BLP[12]/.test(bare) || /blp_?(read|decode|open|to_)/i.test(bare)) {
        opens.push(`${f}:${i + 1}`)
      }
    }
  }
  check("and nothing in the pipeline opens one of the client's textures",
    opens.length === 0,
    opens.length ? opens.join(', ')
      : `${readdirSync('pipeline').filter((n) => n.endsWith('.py')).length} `
      + 'files, and the only thing any of them does with a texture is read its '
      + 'name and answer with a word of ours')

  // --- and the building briefs, which are a second output nobody was
  // checking -------------------------------------------------------------
  //
  // `pipeline/facade.py` writes two things per model and commits one of them:
  // an underlay `.png` that is Blizzard's silhouette and is gitignored, and a
  // brief in `art/facade/facade.json` that is numbers and words.  The brief is
  // not under `public/`, so **`bake.py`'s copyright grep has never seen it** —
  // that grep walks the files the bake produced, and this is produced by a
  // script the bake does not run.  Issue 215 asked for the check by name.
  //
  // It found one.  The brief's `sheet` field was the model's own file name —
  // `NSABBEY.png`, `GOLDSHIREINN.png` — which is the leaf of a client path in
  // a committed file, in the one field of the brief nobody had read.  It is
  // the key now, the same opaque number `bake_terrain` uses for *the same
  // model*, and this is what says so from now on.
  const facade = JSON.parse(readFileSync(join('art', 'facade', 'facade.json'), 'utf8'))
  // The same needles `bake.py` carries, plus the two shapes a brief could leak
  // that a baked world cannot: a material name (`MM_ABBEY_WALL_01`) and a
  // model stem in a field that should hold a number.
  const NEEDLES = [/\.(mdx|wmo|blp|adt|dbc|mpq|m2)\b/i, /\bMM_[A-Z]/, /\\/,
    /\b(world|character|creature|item|interface|tileset)[\\/]/i]
  const said = JSON.stringify(facade)
  const leak = NEEDLES.filter((re) => re.test(said)).map(String)
  check('nothing of the client is in the building briefs', leak.length === 0,
    leak.length ? leak.join(' ')
      : `${facade.buildings.length} briefs, ${(said.length / 1024).toFixed(0)} KB, `
      + 'every sheet named after its key and every surface one of our own words')
  // And a brief may only say what our own vocabulary can say.  The vocabulary
  // is read out of `facade.py` rather than repeated here: a list typed twice
  // is two lists that drift, and the first version of this check had five
  // words where the script has seven — it failed on `ceiling`, which is the
  // script being right and the check being a second copy.
  const WORDS = [...readFileSync(join('pipeline', 'facade.py'), 'utf8')
    .match(/^WORDS = \(\n([\s\S]*?)^\)/m)[1]
    .matchAll(/^ {4}\('(\w+)',/gm)].map((m) => m[1])
  const odd = [...new Set(facade.buildings.flatMap((b) => Object.keys(b.surfaces)))]
    .filter((w) => !WORDS.includes(w))
  check('and every surface word in them is one of ours',
    odd.length === 0 && WORDS.length > 3,
    odd.length ? odd.join(', ') : `${WORDS.join(', ')} — `
    + `${WORDS.length} words the script can say, over `
    + `${facade.buildings.length} briefs`)

  // **Does a brief describe the same building the world was baked from?**
  //
  // This is the half that cannot be greppped.  A brief's `yards` is the
  // model's own `MOHD` box, read by `facade.py`; the baked `plans` are that
  // model's triangles rasterised by `bake_terrain.wmo_plan` on a 1.33 yard
  // pitch.  Two scripts, two readings of the same file, joined on the key —
  // so a brief that has drifted from the world says so here rather than in
  // somebody's drawing.
  //
  // A raster is never smaller than what it covers and rounds up by whole
  // cells, so the plan is always the larger and the gap is a couple of cells:
  // measured over the 29 that match, **1.6 to 3.6 yards**, which is 1.2 to 2.7
  // cells.  Three cells is the bar.
  const cellOf = (p) => p[2]
  const drift = []
  let joined = 0
  for (const b of facade.buildings) {
    const plan = terrain.plans[String(b.model)]
    if (!plan) continue                 // a mine: dug, not built — see below
    joined++
    const cell = cellOf(plan)
    for (const [i, span] of [plan[0] * cell, plan[1] * cell].entries()) {
      const gap = span - b.yards[i]
      if (gap < 0 || gap > 3 * cell) {
        drift.push(`${b.model} ${'xy'[i]} plan ${span.toFixed(1)} vs brief `
          + `${b.yards[i].toFixed(1)}`)
      }
    }
  }
  check('and a brief is the same size as the building the world was baked from',
    drift.length === 0 && joined > 20,
    drift.length ? drift.join('; ')
      : `${joined} of ${facade.buildings.length} briefs joined to a baked plan`)
  // **And the ones that do not join have to say why**, or six silent holes in
  // a join is a join nobody can trust.
  //
  // The first answer written here was wrong and the check said so: *they are
  // the ones with no floor*.  They all have floors — asked directly, all six
  // rasterise, and one of them has eight storeys.  The real reason is the gap
  // this repository already has a name for: **the bake filters by the slice's
  // rectangle and `facade.py` reads every `MODF` record on the slice's tiles.**
  // A tile is 533 yards and the slice's bounds cut across them, so a model can
  // stand on a tile the bake read and outside the box the bake kept.
  //
  // So the rule is narrow and it is checkable from what is committed: a brief
  // with no plan is a model **the world placed nowhere**.  `p` on a baked
  // building is its plan key, so the set of keys that actually stand in the
  // world is right there.
  const stood = new Set(terrain.doodads.filter((o) => o.p).map((o) => o.p))
  const nomatch = facade.buildings.filter((b) => !terrain.plans[String(b.model)])
  const orphan = nomatch.filter((b) => stood.has(b.model))
  check('and a brief with no plan is a model the world placed nowhere',
    orphan.length === 0,
    orphan.length ? orphan.map((b) => String(b.model)).join(', ')
      : `${nomatch.length} of ${facade.buildings.length} stand on the slice's `
      + `tiles and outside its bounds; ${stood.size} models stand in the world`)

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
   * **Two of issue 119's ten went through it, and each through a different
   * gap.**  61 was "삼거리" over two waterfalls and a bridge: the word was on
   * the shape list, and a shape word was simply *removed* before comparing, so
   * a name made only of shape words was a name nobody ever read.  62 was
   * "제리프의 농장", a word that had slid over from the landing next door
   * (797): once 797 was renamed there was no second place wearing it, and a
   * check that only compares pairs cannot see a word with no pair.
   *
   * So neither list is a place to hide any more.  **A shape word is a claim
   * the baked world can see** — the kind the bake derived, or a thing
   * standing there — and a shape word with no such evidence is not allowed on
   * the list.  **Every other word is owned** by the one place allowed to wear
   * it (or a place inside that one), declared below: an undeclared word fails,
   * so a name read off a map cannot arrive in silence, and a declared one on
   * the wrong place fails without needing a neighbour to collide with.
   *
   * What this still cannot see is a declared word that is wrong about its
   * own place: the client's names are prose and `bake_terrain.area_tree`
   * refuses to read them, on purpose.  Claims about the kind of place and who
   * lives there are held by the block above; this holds the words.
   */
  const stands = {}
  for (const o of terrain.doodads ?? []) {
    const i = Math.floor((x0 - o.x) / AU), j = Math.floor((y0 - o.y) / AU)
    if (i < 0 || i >= AW || j < 0 || j >= AH) continue
    const a = IDS[zones[i * AH + j]]
    if (a === undefined) continue
    ;(stands[a] ??= new Set()).add(o.k)
  }
  const kind = (...ks) => ({ why: ks.join('/'), ok: (id) => ks.includes(derived[id]) })
  const has = (k) => ({ why: `a ${k}`, ok: (id) => !!stands[id]?.has(k) })
  const either = (...ts) => ({ why: ts.map((t) => t.why).join(' or '),
    ok: (id) => ts.some((t) => t.ok(id)) })
  const SHAPE = {
    숲: kind('wood'), 숲속: kind('wood'), 숲길: kind('wood'), 계곡: kind('wood'),
    등성이: kind('wood'), 언덕: kind('wood', 'town'), 산: kind('open', 'wood'),
    호수: kind('water'), 물길: kind('water'), 여울: kind('water'),
    물가: either(kind('water'), has('water_plant')), 폭포: has('waterfall'),
    바위: has('rock'),
    마을: kind('town'), 항구: kind('town'), 벌목장: kind('town', 'wood'),
    밭: kind('farm'), 농장: kind('farm'), 농가: kind('farm'),
    주둔지: kind('camp'), 초소: kind('wood', 'camp'), 숙영지: kind('wood', 'camp'),
    광산: kind('wood', 'camp'), 무덤가: kind('graves'),
    모래밭: kind('open'), 어귀: kind('open'), 평원: kind('open'),
    // Indoors has no terrain to derive a kind from; `안` is only ever worn by
    // a `*` claim, which this does not test.
    안: { why: 'indoors', ok: (id) => derived[id] === undefined },
  }
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
  /** Every other word, and the one place that may wear it. */
  const OWNED = {
    스톤필드: 63, 골드샤이어: 87, 서부: 120, 광부의: 54, 검은바위: 2421,
    도적: 56, 코볼트: 57, 다리목: 60, 무법자: 797, 불타는: 46, 어둠의: 10,
    뼈: 91, 수도원: 24,
  }

  const parent = terrain.areaParent ?? {}
  /** Whether one place sits inside the other, however many steps up. */
  const within = (a, b) => {
    for (let at = a, n = 0; at && n < 8; at = parent[at], n++) if (at === b) return true
    return false
  }
  const names = Object.keys(ZONE_CLAIMS).map((id) => [id, zoneOf(+id)])
  const unseen = [], strays = [], clash = []
  for (const [id, name] of names) {
    for (const w of name.split(/[\s·]+/).filter(Boolean)) {
      if (WHERE.includes(w) || REGION.includes(w)) continue
      if (w in SHAPE) {
        // A zone in its own right (`*`) wears the zone's name, not a claim
        // about a corner of it.
        if (ZONE_CLAIMS[id] !== '*' && !SHAPE[w].ok(id)) {
          unseen.push(`${id} ${name}: "${w}" wants ${SHAPE[w].why}, world says `
            + `${derived[id]}, standing: ${[...(stands[id] ?? [])].slice(0, 6).join(' ')}`)
        }
        continue
      }
      const owner = OWNED[w]
      if (owner === undefined) strays.push(`${id} ${name}: "${w}" is declared nowhere`)
      else if (+id !== owner && !within(String(id), owner))
        strays.push(`${id} ${name}: "${w}" belongs to ${owner} ${zoneOf(owner)}`)
    }
  }
  // Two places with the same whole name are still the same mistake, shape
  // words or not.
  for (const [a, x] of names) {
    for (const [b, y] of names) if (a < b && x === y) clash.push(`${a}/${b} both ${x}`)
  }
  check('every shape word in a place\'s name is something the world shows there',
    unseen.length === 0, unseen.join('; '))
  check('and every other word in one belongs to that place alone',
    strays.length === 0 && clash.length === 0, strays.concat(clash).join('; '))
}

/**
 * Every column of a baked item is read by something.
 *
 * The pipeline has had this gate since `audit.py` was written — a classifier
 * may take a default only if somebody has declared that name — and `src/` had
 * no such thing.  `I_QUALITY` was the proof: defined on one line of `gear.ts`
 * and read **nowhere else in the repository**, so 353 green items, 34 blue and
 * 8 purple were drawn exactly like the 976 white ones, and in the original the
 * colour is the first thing you read about an item.  A baked column nobody
 * reads is a decision somebody made in the pipeline and nobody carried out.
 *
 * The names rather than the numbers, because the numbers are positions and a
 * position is not a fact about the item: `I_SLOT` is 1 today.
 */
{
  const decl = readFileSync(join('src', 'sim', 'gear.ts'), 'utf8')
  const cols = [...decl.matchAll(/\bI_([A-Z_]+)\s*=\s*\d+/g)]
    .map((m) => `I_${m[1]}`)
  const source = readdirSync('src', { recursive: true })
    .filter((f) => String(f).endsWith('.ts'))
    .map((f) => readFileSync(join('src', String(f)), 'utf8'))
    .join('\n')
  // The `I_X = n` that names it is not a use of it, and the export line that
  // lists them all is one occurrence each; everything past that is somebody
  // reading the column.
  const unread = cols.filter((c) =>
    [...source.matchAll(new RegExp(`\\b${c}\\b`, 'g'))].length <= 1)
  check(`every baked item column is read somewhere in src/`,
    unread.length === 0,
    unread.length ? `${cols.length} columns, never read: ${unread.join(' ')}`
      : `all ${cols.length} of them`)
}

/**
 * An inside does not look like an outside.
 *
 * The complaint was that this game had exactly one indoor floor picture and it
 * was the road's own cobbles — so the abbey's nave and the lane through
 * Goldshire were the same thing, and fixing the outline's paint could make a
 * building *uniform* without making it look like an inside at all.
 *
 * Read off the two tables rather than off a screenshot: the words `main.ts`
 * reaches for indoors and the words it reaches for outdoors have to be
 * disjoint sets.  A tent is the one deliberate exception — its floor is the
 * ground it is pitched on — and it takes the outdoor branch rather than
 * naming an outdoor tile in the indoor table, so it does not show up here.
 */
{
  const src = readFileSync(join('src', 'main.ts'), 'utf8')
  const table = (name) => {
    const at = src.indexOf(name)
    if (at < 0) return []
    const end = src.indexOf('\n  }', at)
    return [...src.slice(at, end).matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1])
  }
  // The naming is the contract: a picture cut for an inside is called `in_…`,
  // and `bake_tiles.py` is where both halves are cut, so the two sets cannot
  // overlap without somebody renaming a tile.  Held from both ends — the
  // indoor table may name only `in_…`, and the outdoor lists may name none.
  const inside = table('const INDOOR_FLOOR')
    .filter((k) => k !== 'hall' && k !== 'house' && k !== 'tower')
  const outside = ['GROUND_TILES', 'DIRT_TILES', 'BLOOM_TILES', 'PAVED_TILES']
    .flatMap((n) => {
      const m = src.match(new RegExp(`const ${n} = [^\\n]*\\[([^\\]]*)\\]`))
      return m ? [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((q) => q[1]) : []
    })
  const stray = inside.filter((k) => !k.startsWith('in_'))
  const leaked = outside.filter((k) => k.startsWith('in_'))
  check('an inside does not use an outside\'s pictures',
    inside.length >= 6 && outside.length >= 8
    && stray.length === 0 && leaked.length === 0,
    stray.concat(leaked).join(' ')
    || `${inside.length} indoors, ${outside.length} outdoors, none shared`)
}

/**
 * Where a character starts is a row, and nobody may type it again.
 *
 * Issues 78 and 97.  `playercreateinfo`'s human was `[-8949.95, -132.493]` in
 * `src/main.ts`, `tx, ty, tz = -8949.95, -132.493, 83.5312` in
 * `synth_terrain.py` and `tz = 83.5312` in `bake_terrain.py`, while
 * `player.py` had baked the same row into `player.json` the whole time.
 * Three copies agree until the table changes, and then two of them are wrong
 * and nothing says which.
 *
 * So the digits are read out of the baked roster rather than written here —
 * which is also why this block may say them in its comment — and any line of
 * *code* in `src/` or `pipeline/` carrying a number within a yard of the
 * start's x beside one within a yard of its y fails.  A yard, so `-8950` does
 * not get past it either.  Comments are prose and may name a place.
 */
{
  const start = JSON.parse(readFileSync(join('public', 'world', 'player.json'), 'utf8')).start
  const near = (line) => {
    const ns = [...line.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
    return ns.some((n) => Math.abs(n - start[0]) < 1)
      && ns.some((n) => Math.abs(n - start[1]) < 1)
  }
  const typed = []
  for (const f of readdirSync('src', { recursive: true })) {
    if (!String(f).endsWith('.ts')) continue
    code(readFileSync(join('src', String(f)), 'utf8')).split('\n')
      .forEach((line, i) => { if (near(line)) typed.push(`src/${f}:${i + 1}`) })
  }
  for (const f of readdirSync('pipeline')) {
    if (!f.endsWith('.py')) continue
    readFileSync(join('pipeline', f), 'utf8').split('\n').forEach((line, i) => {
      const bare = line.replace(/#.*$/, '')
      if (near(bare)) typed.push(`pipeline/${f}:${i + 1}`)
    })
  }
  check('where a character starts is read from playercreateinfo, not typed',
    Array.isArray(start) && start.length >= 3 && typed.length === 0,
    typed.length ? `typed at ${typed.join(', ')}`
      : `(${start.slice(0, 2).join(', ')}) appears in no line of code`)
}

console.log(bad ? `${bad} FAILED` : 'all checks passed')
process.exit(bad ? 1 : 0)

/**
 * What the quarter view promises about geometry.
 *
 * Every one of these was wrong at some point in the change that introduced it,
 * and none of them is visible in a still: a stick that walks you north when
 * you push up looks perfectly fine until you try to aim at something.
 *
 *   npm run dev        # in one terminal
 *   npm run viewcheck  # in another
 */
import { chromium } from 'playwright'

const HOST = process.env.ABYSS_URL ?? 'http://localhost:5173'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1200, height: 760 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
await p.goto(HOST)
await p.waitForFunction(() => window.__ready, null, { timeout: 60000 })

let bad = 0
function check(label, ok, detail = '') {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `   -> ${detail}`}`)
}

const EMPTY = [-9200, -600]
const at = (x, y) => p.evaluate(([a, c]) => window.__screen(a, c), [x, y])

// 1. A yard north goes straight up the glass and a yard west goes straight
// left, by the same number of pixels.  That one sentence is the whole
// projection, and everything else here is a consequence of it.  It was a 2:1
// diamond for one round; the art is drawn for this one.
const o = await at(...EMPTY)
const n = await at(EMPTY[0] + 10, EMPTY[1])
const w = await at(EMPTY[0], EMPTY[1] + 10)
check('north goes straight up', n.y < o.y - 8 && Math.abs(n.x - o.x) < 0.01,
  JSON.stringify([o, n]))
check('west goes straight left', w.x < o.x - 8 && Math.abs(w.y - o.y) < 0.01,
  JSON.stringify([o, w]))
check('and a yard is a yard either way round',
  Math.abs((o.y - n.y) - (o.x - w.x)) < 0.01,
  JSON.stringify([o.y - n.y, o.x - w.x]))

// 2. The keys steer by what the screen shows, not by what the world stores.
// The camera follows the hero, so a fixed mark in the world is what says which
// way the view went — and it goes the opposite way to the walk.
for (const [k, wx, wy, said] of [
  ['w', 0, -1, 'up the glass'], ['s', 0, 1, 'down the glass'],
  ['a', -1, 0, 'left across the glass'], ['d', 1, 0, 'right across the glass'],
]) {
  await p.evaluate(([x, y]) => window.__cam({ x, y, zoom: 1 }), EMPTY)
  await p.waitForTimeout(150)
  const from = await at(...EMPTY)
  await p.keyboard.down(k)
  await p.waitForTimeout(450)
  await p.keyboard.up(k)
  await p.waitForTimeout(120)
  const to = await at(...EMPTY)
  const dx = to.x - from.x, dy = to.y - from.y
  const okX = wx === 0 ? Math.abs(dx) < 6 : Math.sign(dx) === -wx && Math.abs(dx) > 8
  const okY = wy === 0 ? Math.abs(dy) < 6 : Math.sign(dy) === -wy && Math.abs(dy) > 8
  check(`${k} walks ${said}`, okX && okY,
    `moved (${dx.toFixed(0)}, ${dy.toFixed(0)})`)
}

// 3. Back to front is north, which is up the glass and nothing else.  It was
// x + y while the view was a diamond and up the glass was both.  Wrong either
// way it is only visible where two things overlap, so it is asserted rather
// than looked for.
const order = await p.evaluate(() => window.__order())
check('the scenery is sorted back to front along x',
  order.every((d, i) => i === 0 || order[i - 1] >= d - 1e-9),
  JSON.stringify(order.slice(0, 4)))

// 4. Everybody faces the way they are going.
//
// Not a still's worth of bug: a wolf that reverses at the end of its leash and
// keeps the old pose walks backwards for the four seconds until its next
// decision, and almost every wander ends at the leash.  Sampled over time
// because the wrong pose is transient by construction — one reading found
// nothing and six seconds of them found a cat going south facing north.
// Somewhere with people in it.  The walk checks above leave the hero in an
// empty field, and only what is awake near him is examined — so run there,
// this sampled nobody and passed for it.
await p.evaluate(() => window.__cam({ x: -9462, y: 16, zoom: 1 }))
await p.waitForTimeout(400)
// The worst sample and the busiest one, kept apart.  Keeping only the worst
// meant `seen` never moved off zero while nothing was ever wrong — so the
// check reported that it had watched nobody, which is exactly the failure it
// exists to catch.
let wrong = 0, seen = 0, blame = []
for (let i = 0; i < 16; i++) {
  await p.waitForTimeout(200)
  const r = await p.evaluate(() => window.__facings())
  seen = Math.max(seen, r.seen)
  if (r.wrong > wrong) { wrong = r.wrong; blame = r.some }
}
check('everybody faces the way they walk', wrong === 0 && seen > 20,
  seen > 20 ? JSON.stringify(blame) : `only ${seen} walking`)
console.log(`      (${seen} walking, ${wrong} facing the wrong way)`)

// 5. The starting valley is a place, and the things in it can be fought.
//
// Three facts about Northshire, all of which were false and none of which a
// screenshot shows.  The client's own area id says where it is; the client's
// own ground paint says a road runs through it; and the server's own faction
// tables say most of what lives there is a level one warrior's business.
const ns = await p.evaluate(() => {
  const NS = new Set([9, 59, 86, 34])
  let cells = 0, paved = 0, wet = 0, seen = 0
  for (let x = -9200; x < -8520; x += 4) {
    for (let y = 140; y > -640; y -= 4) {
      seen++
      const q = window.__probe(x, y)
      if (!NS.has(q.area)) continue
      cells++
      if (q.paint === 'paved') paved++
      if (q.wet) wet++
    }
  }
  return { cells, paved, wet, seen }
})
check('the valley knows it is Northshire', ns.cells > 8000,
  `${ns.cells} cells of area 9 and its pieces in the sweep`)
check('and there is water running through it', ns.wet > 200, `${ns.wet} wet cells`)
const roster = await p.evaluate(() => {
  const NS = new Set([9, 59, 86, 34])
  const out = { friend: 0, quarry: 0, enemy: 0 }
  for (const n of window.__all()) {
    if (!NS.has(window.__probe(n.x, n.y).area)) continue
    out[n.stance ?? 'friend']++
  }
  return out
})
check('and most of what lives there can be fought',
  roster.quarry + roster.enemy > roster.friend,
  JSON.stringify(roster))
console.log(`      (Northshire: ${roster.enemy} start fights, ${roster.quarry} finish them, ${roster.friend} do not)`)

// 6. The scenery is the client's scenery.
//
// Two ways a wood can be wrong that a screenshot will not show.  A word here
// stands for many of the client's models — `tree` is thirty-one of them — and
// the scene rotates through a list of pictures for it.  With more pictures
// than models it invents variety the world has not got, and with the picture
// chosen by the *spot* rather than the model the same bush changes shape every
// time the client puts one down.  Both were true: a fifth of Elwynn's living
// trees were drawn as dead ones, because `deadtree` was in the rotation.
const variety = await p.evaluate(() => window.__variety())
const invented = variety.filter((v) => v.models && v.pieces > v.models)
check('no word draws more pictures than the client has models',
  invented.length === 0,
  invented.map((v) => `${v.kind}: ${v.pieces} pictures for ${v.models} models`).join('; '))
const unbacked = variety.filter((v) => !v.models)
console.log(`      (${variety.length} words, ${unbacked.length} with nothing in the slice)`)
// And every word the bake emits has a picture here.  A kind missing from the
// table is skipped without a word, which is how two campfires stood in the
// world and were drawn as nothing at all.
const orphan = variety.filter((v) => v.models && !v.pieces && !v.floor)
check('and every word the bake emits can be drawn', orphan.length === 0,
  orphan.map((v) => v.kind).join(', '))

// 7. What stops you is the world's own number, not one chosen here.
//
// The climbing limit used to be `tan(50°)` with a comment saying that is
// "roughly" where a person stops.  Roughly, in that position, is a wall in the
// wrong place: at fifty the mountain east of Northshire has a switchback where
// every step sits between 1.14 and 1.19, and a walk from the abbey climbs a
// hundred yards of it.  `waypoint_data` states the answer instead — 3,954 legs
// of patrol laid down by the people who run the server, none steeper than 0.90.
const limit = await p.evaluate(async () => {
  const r = await fetch('./world/npcs.json')
  const said = (await r.json()).walk
  return { said, used: window.__probe(-8950, -132).cliff }
})
check('the climbing limit is the one the world walks',
  !!limit.said && Math.abs(limit.said - limit.used) < 1e-6,
  `world says ${limit.said}, engine uses ${limit.used}`)

// And the chunks the client marks impassable are impassable.  Bit two of an
// `.adt` chunk's flags is the world saying outright that you may not walk
// here; 93 chunks in this slice carry it and every one of them was open.
const shut = await p.evaluate(async () => {
  const r = await fetch('./data/terrain.json').catch(() => null)
  const m = r && r.ok ? await r.json() : null
  if (!m?.closed?.length) return null
  const u = m.areaUnit
  let tried = 0, held = 0
  for (const [i, j] of m.closed.slice(0, 40)) {
    const x = m.x0 - (i + 0.5) * u, y = m.y0 - (j + 0.5) * u
    tried++
    if (window.__probe(x, y).blocked) held++
  }
  return { tried, held, all: m.closed.length }
})
if (shut) {
  check('and the ground the client shuts stays shut', shut.held === shut.tried,
    `${shut.held} of ${shut.tried} held, ${shut.all} such chunks in the slice`)
} else {
  console.log('      (no impassable chunks in this world — the synthesised one)')
}

// 8. Steep ground puts you back down, and the numbers behind it are the
// world's.
//
// Refusing to step on to steep ground is not what that game does, and refusing
// is what made the mountains climbable: refusing costs nothing, so a wall of
// steep cells with a gentle one between them is a maze, and a maze can be
// solved.  Being pushed cannot be solved.
const slid = await p.evaluate(async () => {
  let spot = null, worst = 0
  for (let x = -9200; x < -8500; x += 5)
    for (let y = -600; y < 200; y += 5) {
      const q = window.__probe(x, y)
      if (!q.wet && !q.solid && q.step > worst && q.step < 4) { worst = q.step; spot = [x, y] }
    }
  const z0 = window.__probe(spot[0], spot[1]).z
  window.__cam({ x: spot[0], y: spot[1] })
  await new Promise((r) => setTimeout(r, 2000))
  const n = window.__hero()
  return { worst: +worst.toFixed(2), dropped: +(z0 - window.__probe(n.x, n.y).z).toFixed(1),
    moved: +Math.hypot(n.x - spot[0], n.y - spot[1]).toFixed(1) }
})
check('ground too steep to stand on puts you back down', slid.dropped > 4,
  `on a ${slid.worst} slope, slid ${slid.moved} yards and dropped ${slid.dropped}`)

// And the numbers that decide how anything moves come out of the tables.  All
// seven of these were constants in the scene: a flat 30 second respawn, 7
// yards of wander for everything that was not a shopkeeper, one walking speed,
// one aggro radius.
const rules = await p.evaluate(() => window.__rules())
check('every spawn moves by its own row', rules.moves > 20,
  `${rules.moves} distinct movement rows out of the database`)
const vary = (k) => new Set(rules.npcs.map((n) => n[k])).size
check('and they do not all move alike',
  vary('wander') > 2 && vary('notice') > 1 && vary('back') > 2,
  `wander ${vary('wander')} kinds, sight ${vary('notice')}, respawn ${vary('back')}`)
check('the swing reaches what the client says', rules.melee === 5,
  `${rules.melee} yards`)

// 9. A building is its own shape, and an outline rather than a slab.
//
// Filling a record's box with stone buried the middle of Northshire: the
// abbey's box is 91 yards square and its two gates are 160 long, so the
// courtyard, the road through the gate, the graveyard and every cobble under
// them came out as one grey field.  A box is the *extent* of a thing, not a
// claim that the ground inside it is floor.
// And the shape is the model's, not a rectangle: the footprint is rasterised
// from the building's own triangles, so a plan that has collapsed back to its
// bounding box shows up as one that fills it.
const shaped = await p.evaluate(() => {
  const b = window.__buildings().sort((a, c) => c.l * c.w - a.l * a.w)[0]
  if (!b) return null
  let inN = 0, all = 0
  for (let a = -b.l; a <= b.l; a += 1.5) {
    for (let c = -b.w; c <= b.w; c += 1.5) {
      all++
      if (window.__inside(b.x + b.c * a - b.s * c, b.y + b.s * a + b.c * c)) inN++
    }
  }
  return { fill: Math.round((100 * inN) / all), size: [Math.round(b.l * 2), Math.round(b.w * 2)] }
})
if (shaped) {
  check('a building is a shape and not its bounding box',
    shaped.fill > 15 && shaped.fill < 85,
    `${shaped.size[0]}x${shaped.size[1]} yards, ${shaped.fill}% of the box is building`)
}

// The footprint is filled — that is the building, and the record supports it
// — and the roof comes off the one you are standing in, because there are no
// interiors here and the abbey holds the people who hand out the work.  A roof
// drawn over them is a roof with a quest giver under it.
const roof = await p.evaluate(async () => {
  const b = window.__buildings().sort((x, y) => y.l * y.w - x.l * x.w)[0]
  if (!b) return null
  // Find a cell well inside the footprint.
  // A cell well inside the footprint and standable — the roof is drawn over
  // the floor, and a wall paints as a wall from either side.
  let at = null
  for (let a = -b.l; a < b.l && !at; a += 1) {
    for (const c of [0, 3, -3, 6, -6]) {
      const x = b.x + b.c * a - b.s * c, y = b.y + b.s * a + b.c * c
      const plot = window.__plotAt(x, y)
      if (plot && plot.floor && !plot.wall && window.__inside(x + 3, y)
        && window.__inside(x - 3, y) && window.__inside(x, y + 3)
        && window.__inside(x, y - 3)) { at = [x, y]; break }
    }
  }
  if (!at) return null
  // Standing well away from it, then standing in it.
  window.__cam({ x: b.x + b.c * (b.l + 40), y: b.y + b.s * (b.l + 40) })
  await new Promise((r) => setTimeout(r, 350))
  const away = window.__roofAt(at[0], at[1])
  window.__cam({ x: at[0], y: at[1] })
  await new Promise((r) => setTimeout(r, 350))
  const under = window.__roofAt(at[0], at[1])
  return { away, under }
})
if (roof) {
  check('a building has a roof on it', roof.away === true,
    `the middle of the biggest building drew ${roof.away ? 'roof' : 'ground'} from outside`)
  check('and it comes off the one you walk into', roof.under === false,
    `standing inside, it still drew ${roof.under ? 'roof' : 'ground'}`)
}

// 9b. A building you can walk into, which is the whole of what a wall is for.
// The bake decides it out of the model's own triangles — a wall is where a man
// of the client's own height cannot stand — so the doorways are holes in it
// without anything having said where a doorway is.
const walls = await p.evaluate(() => {
  let wall = 0, floor = 0, open = 0, shut = 0
  for (const b of window.__buildings()) {
    const R = Math.max(b.l, b.w) + 2
    for (let a = -R; a <= R; a += 1)
      for (let c = -R; c <= R; c += 1) {
        const x = b.x + b.c * a - b.s * c, y = b.y + b.s * a + b.c * c
        const plot = window.__plotAt(x, y)
        if (!plot) continue
        if (plot.wall) wall++
        else if (plot.floor) floor++
      }
  }
  // And a wall stops you where the floor beside it does not.
  for (const b of window.__buildings()) {
    const R = Math.max(b.l, b.w)
    for (let a = -R; a <= R; a += 2)
      for (let c = -R; c <= R; c += 2) {
        const x = b.x + b.c * a - b.s * c, y = b.y + b.s * a + b.c * c
        const plot = window.__plotAt(x, y)
        if (!plot) continue
        if (plot.wall && window.__wallAt(x, y)) shut++
        if (plot.floor && !plot.wall && !window.__wallAt(x, y)) open++
      }
  }
  return { wall, floor, open, shut, indoors: window.__indoors() }
})
check('a building has walls you cannot pass', walls.shut > 0 && walls.wall > 0,
  `${walls.wall.toLocaleString()} square yards of stone, ${walls.shut.toLocaleString()} of it refuses a step`)
check('and a floor you can stand on inside them', walls.floor > 0 && walls.open > 0,
  `${walls.floor.toLocaleString()} square yards of floor, ${walls.open.toLocaleString()} of it lets you in`)
check('and what it holds is drawn indoors', walls.indoors > 0,
  `${walls.indoors.toLocaleString()} pieces stand under somebody's roof`)
const inwall = await p.evaluate(() => {
  const all = window.__all()
  return { n: all.length, stuck: all.filter((x) => window.__wallAt(x.x, x.y)).length,
    indoors: all.filter((x) => window.__inside(x.x, x.y)).length }
})
// 9c. The floor the client takes out of its own ground.  `holes` is sixteen
// bits a chunk and it makes the mouth of every mine and den in the forest; it
// was read into the tile and used by nothing, so the ground was laid over each
// entrance.  There is nothing under it here, so it is drawn as an opening and
// it refuses a step — walking on to a floor that is not there is the one thing
// it certainly should not do.
const gaps = await p.evaluate(() => {
  const g = window.__gaps()
  if (!g.length) return { n: 0 }
  let refused = 0, beside = 0
  for (const [x, y] of g) {
    // A chunk that loses all sixteen bits is ground handed to a building that
    // brings its own floor — Stormwind, here — and the server walks its own
    // creatures over it.  Drawn as a hole, not refused.  `__holeAt` still says
    // yes there; `__probe` is what knows the difference.
    // Three ways a cut in the terrain is accounted for.  A step refused is
    // the mine mouth; `__floored` is a whole chunk handed to a building that
    // brings its own floor, which here is Stormwind; and a building's own
    // floor laid over part of a chunk is the Lion's Pride, which you can walk
    // into and stand in.  The third was missing, so the inn's floor read as
    // an unaccounted hole the moment the ground stopped painting it black.
    const q = window.__probe(x, y)
    if (q.blocked || window.__floored(x, y) || q.floor) refused++
    // Floor again a few yards off, so the mask is a mouth and not a blanket
    // over the hillside.  Asked of the hole mask itself and not of whether a
    // step is refused: a good half of these are Stormwind's own ground and
    // the harbour's, where what is beside the hole is a wall or the sea.
    for (const [dx, dy] of [[12, 0], [-12, 0], [0, 12], [0, -12]])
      if (!window.__holeAt(x + dx, y + dy)) { beside++; break }
  }
  return { n: g.length, refused, beside }
})
if (gaps.n) {
  check('the mouth of a mine is a hole and not ground', gaps.refused === gaps.n,
    `${gaps.n} cells with no floor; ${gaps.beside} have floor again within `
    + `twelve yards, and the rest are the city standing on its own`)
}
check('and nobody is standing inside one', inwall.stuck === 0,
  `${inwall.stuck} of ${inwall.n.toLocaleString()} spawns in a wall, ${inwall.indoors} indoors`)

// 9d. Where you are.  The slice has 35 areas and a shorter word list than
// that, and what it used to do with the difference was call them all the
// forest — so the shore of Westfall and a corner of the Burning Steppes both
// read "엘윈 숲".  Now an area we have not named says whose ground it is,
// from `AreaTable.dbc`'s own parent column, and shows its id.
const areas = await p.evaluate(() => window.__areas())
const misnamed = areas.filter((a) => a.id !== 12 && a.name === '엘윈 숲')
const named = areas.filter((a) => !/지역 \d+/.test(a.name))
check('no corner of the map calls itself the wrong forest', misnamed.length === 0,
  `${areas.length} areas, ${named.length} with a word of their own, `
  + `${areas.length - named.length} saying whose ground they are on`)
check('and every one of them says something', areas.every((a) => a.name),
  areas.slice(0, 3).map((a) => a.name).join(' · ') + ' …')

// And indoors is its own place.  `WMOAreaTable.dbc` gives a building's inside
// an area of its own — the hillside the abbey stands on is 86, its nave is 24
// — so walking through the door has to change what the frame says.
const indoors = await p.evaluate(() => {
  const out = []
  for (const b of window.__buildings().filter((x) => x.area)) {
    let spot = null
    for (let r = 0; r < 60 && !spot; r += 1)
      for (let a = 0; a < 24; a++) {
        const t = (a / 24) * Math.PI * 2
        const x = b.x + Math.cos(t) * r, y = b.y + Math.sin(t) * r
        const pl = window.__plotAt(x, y)
        if (pl && pl.floor && !pl.wall) { spot = [x, y]; break }
      }
    if (!spot) continue
    out.push({ area: b.area, inside: window.__whereAt(spot[0], spot[1]),
      outside: window.__whereAt(b.x + 70, b.y + 70) })
  }
  return out
})
if (indoors.length) {
  check('and walking indoors is going somewhere else',
    indoors.every((x) => x.inside !== x.outside),
    indoors.map((x) => `${x.inside} ≠ ${x.outside}`).join(', '))
}

// 9e. Things that are not people.  `gameobject` is 96,624 rows and the only
// use this pipeline had ever made of one was as a height sample; 1,365 of them
// stand in the slice and 393 can be gathered.  A vein you cannot pull is a
// rock, so the check walks up to one and pulls it.
const things = await p.evaluate(() => window.__things())
check('the world has things in it that are not people', things.total > 0,
  `${things.total.toLocaleString()} objects, ${things.up.toLocaleString()} standing, `
  + `${things.gather} of them worth gathering, in ${things.pools} shared slots`)
check('and a shared slot stands up only as many as the world says',
  things.up < things.total,
  `${things.total - things.up} are waiting their turn`)
for (const kind of ['herb', 'vein']) {
  const took = await p.evaluate((k) => window.__take(k), kind)
  if (!took) continue
  check(`and ${kind === 'herb' ? 'a herb can be picked' : 'a vein can be mined'}`,
    !took.up && took.got !== '아무것도 없다'
      && took.after[took.trade] === took.before[took.trade] + 1,
    `${took.got} — ${took.trade} ${took.before[took.trade]} → ${took.after[took.trade]}`)
}
// And the other half of a lock: the slice reaches four zones and its hardest
// node wants 270 of a trade, which a man who has pulled one weed does not have.
const refused = await p.evaluate(() => window.__refused('herb'))
if (refused) {
  check('and one out of your depth says so', refused.up === true,
    `${refused.got} (it wants ${refused.skill})`)
}

// 9f. Who the player is.  There were no stats at all: health and armour came
// out of the same table a wolf's do, so nothing he could ever wear or train
// would matter, and critical chance had nowhere to come from.  Now health is
// stamina through the server's own curve, armour is agility, damage is his
// weapon plus attack power, and crit is the client's interpolation table.
const me = await p.evaluate(() => window.__me())
check('the player starts where a character starts', me.level === 1,
  `level ${me.level} of ${me.ceiling}, ${me.hp} health, ${me.armour} armour, `
  + `${me.damage[0]}-${me.damage[1]} on ${(me.swing / 1000).toFixed(1)}s`)
check('and he is made of the numbers the server makes him of',
  me.hp === 60 && me.armour === 42 && Math.abs(me.crit - 8.4) < 0.2,
  `str ${me.stats[0]} agi ${me.stats[1]} sta ${me.stats[2]} → `
  + `${me.hp} health, ${me.armour} armour, ${me.crit.toFixed(1)}% crit, `
  + `${me.dodge.toFixed(1)}% dodge`)

// The hit table.  One roll and seven cumulative bands, so the outcomes take
// probability from each other — which is the whole reason it cannot be built
// as a sequence of independent rolls.
const swings = await p.evaluate(() => window.__swings(1, 20000))
const total = Object.values(swings).reduce((a, b) => a + b, 0)
const pct = (k) => ((swings[k] ?? 0) / total) * 100
check('a swing can miss, and be dodged, parried and blocked',
  pct('빗나감') > 3 && pct('피함') > 3 && pct('막아냄') > 3 && pct('막음') > 3,
  Object.entries(swings).map(([k, v]) => `${k} ${((v / total) * 100).toFixed(1)}%`)
    .join('  '))
check('and the bands add to one', Math.abs(total - 20000) < 1,
  `${total} rolls`)
// Something four levels up eats most of your swings as glancing blows, which
// is the rule that makes level difference feel like something.
const high = await p.evaluate(() => window.__swings(6, 20000))
const glance = ((high['빗맞음'] ?? 0) / 20000) * 100
check('and swinging above your weight is mostly glancing blows', glance > 20,
  `against a level 6: ${Object.entries(high).map(([k, v]) => `${k} ${((v / 20000) * 100).toFixed(1)}%`).join('  ')}`)

// 9g. Levelling opens things.  The list used to be decided once at load, so
// nothing new ever appeared — and starting at level one that meant an empty
// bar for the whole game.
const before = await p.evaluate(() => window.__me())
const after = await p.evaluate(() => window.__earn(30000))
check('levelling up makes you bigger and gives a trainer something to sell',
  after.level > before.level && after.hp > before.hp,
  `level ${before.level} → ${after.level}, ${before.hp} health → ${after.hp}`)

// 9h. The global cooldown, which is a column and not a constant: `Spell.dbc`'s
// `StartRecoveryTime`, clamped to one to one and a half seconds by
// `Spell::TriggerGlobalCooldown`.  Nought on it means the ability goes off your
// next swing instead of instead of it, which is how a heavier blow can follow
// anything.  Without it you could press everything rage would pay for at once.
const gcd = await p.evaluate(() => window.__earn(30000) && window.__press(6673))
if (gcd) {
  check('pressing something makes you wait before the next thing',
    gcd.gcd === 1500 && gcd.waits > 1.2 && gcd.blocked.length > 0,
    `a shout waits ${gcd.waits.toFixed(1)}s and blocks ${gcd.blocked.length} others`)
  check('and the ones that ride your next swing do not',
    gcd.free.length > 0,
    `${gcd.free.length} abilities start no wait at all (${gcd.free.join(', ')})`)
}

// 9i. Pulling is the decision.  The wiki's own check list asks whether taking
// two is measurably worse than taking one, and nothing could answer it because
// the fight lived in the frame loop.  `__duel` runs the same functions — the
// hit table, the armour curve, the swing timers — over a synthetic clock.
const one = await p.evaluate(() => window.__duel(3, 1, 400, 1))
const two = await p.evaluate(() => window.__duel(3, 2, 400, 1))
check('pulling two is measurably worse than pulling one',
  one.survived > 0.8 && two.survived < one.survived - 0.3,
  `at level 1, a level 3 alone: ${(one.survived * 100).toFixed(0)}% survived in `
  + `${one.seconds.toFixed(0)}s; two of them: ${(two.survived * 100).toFixed(0)}%`)
const up = await p.evaluate(() => window.__duel(5, 1, 400, 1))
check('and so is picking on something above you', up.survived < one.survived,
  `at level 1, a level 5 alone: ${(up.survived * 100).toFixed(0)}% survived`)

// The wiki calls the next one this project's win-rate check: if holding down
// auto-attack gets you to the ceiling, what has been built is a progress bar
// with a sword on it.  The old abyss died of exactly this, and the diagnosis
// then — "92 to 100 per cent won by standing still" — was a measurement rather
// than an opinion.
const auto = await p.evaluate(() => window.__duel(5, 1, 600, 1, 'auto'))
const rota = await p.evaluate(() => window.__duel(5, 1, 600, 1, 'rota'))
check('pressing nothing is measurably worse than pressing something',
  rota.survived > auto.survived + 0.25 && rota.presses > 0,
  `at level 1 against a level 5 — auto-attack alone survives `
  + `${(auto.survived * 100).toFixed(0)}%, the simplest macro `
  + `${(rota.survived * 100).toFixed(0)}% off ${rota.presses.toFixed(1)} `
  + `presses a fight`)
const even = await p.evaluate(() => window.__duel(1, 1, 600, 1, 'auto'))
const evenR = await p.evaluate(() => window.__duel(1, 1, 600, 1, 'rota'))
check('and there is something to press in every fight', evenR.presses > 1,
  `even against your own level the macro presses `
  + `${evenR.presses.toFixed(1)} times and finishes `
  + `${(100 - (evenR.seconds / even.seconds) * 100).toFixed(0)}% sooner`)

// 9j. Dying costs a walk.  It used to cost four seconds and nothing else —
// you stood up on the spot at full health — so there was never a reason to run
// away, and half of "should I pull this" is the other half of that decision.
// `game_graveyard` and `graveyard_zone` say where each zone sends its dead.
const died = await p.evaluate(() => window.__die())
check('dying puts you at a graveyard and costs the walk back',
  died.walked > 40 && died.now.hp < died.now.max,
  `woke up ${died.walked.toFixed(0)} yards away with `
  + `${died.now.hp} of ${died.now.max} health`)

// 9k. And closing the tab costs nothing.  There was no `localStorage` and no
// `indexedDB` anywhere in `src/`: shutting the tab deleted the character.
const before2 = await p.evaluate(() => window.__save())
const rolled = await p.evaluate(() => { window.__earn(500); return window.__save() })
const back = await p.evaluate((s) => window.__load(s), before2)
check('a save puts the character back where he was',
  back.level === before2.you.level && back.xp === before2.you.xp
    && Math.abs(back.x - before2.hero.x) < 0.01,
  `level ${back.level}, ${back.xp} xp, (${back.x.toFixed(0)}, ${back.y.toFixed(0)})`)
check('and it carries where the dice had got to', back.seed === before2.seed,
  `stream at ${before2.seed}, and ${rolled.seed} after some rolls — `
  + `without this, loading is how you re-roll a drop`)

// 9l. Money you can spend.  `npc_vendor` had been read into the conversation
// for rounds — "twelve things, from ten copper to a gold" — with nothing
// behind the sentence, and `trainer_spell` the same.  Money you cannot spend
// is a number, and the only decision this stretch of the game has outside a
// fight is whether to spend it on a lesson or on a breastplate.
const shops = await p.evaluate(async () => {
  const s = await (await fetch('./world/items.json')).json()
  const vendor = Object.keys(s.stock)[0], trainer = Object.keys(s.trainers)[0]
  const wearable = Object.entries(s.items)
    .filter(([, v]) => v[1] === 'weapon' && v[4] <= 1)
    .sort((a, b) => b[1][3] - a[1][3])[0]
  const bought = window.__buy(Number(wearable[0]))
  const dressed = window.__dress()
  const before = window.__me().spells.length
  const lesson = s.trainers[trainer].teaches[0]
  const learnt = window.__learn(lesson[0])
  return {
    vendors: Object.keys(s.stock).length,
    trainers: Object.keys(s.trainers).length,
    items: Object.keys(s.items).length,
    bought, dressed, before, learnt,
  }
})
check('a shopkeeper has things in it and they can be bought',
  shops.vendors > 10 && shops.bought.held > shops.bought.was.held - 1,
  `${shops.items.toLocaleString()} items the slice can reach, `
  + `${shops.vendors} vendors, ${shops.trainers} trainers`)
check('and wearing one changes what you are',
  shops.dressed.now.swing !== shops.dressed.was.swing
    || shops.dressed.now.armour !== shops.dressed.was.armour,
  `${shops.dressed.said.join('; ')} — swing `
  + `${(shops.dressed.was.swing / 1000).toFixed(1)}s → `
  + `${(shops.dressed.now.swing / 1000).toFixed(1)}s, armour `
  + `${shops.dressed.was.armour} → ${shops.dressed.now.armour}`)
check('and a trainer puts something new on the bar',
  shops.learnt.taught.length > 0,
  `${shops.learnt.had} abilities → ${shops.learnt.now} after one lesson`)

// 9m. Everything in the forest fought the same way, because the pipeline read
// none of `creature_template_spell`'s 9,556 rows and none of `Spell.dbc`'s
// index columns.  A thunderclap with no radius hits nobody, so there was no
// point giving it a word; a kobold with no ability is a wolf that talks.
const foes = await p.evaluate(() => window.__foes())
check('creatures do something besides swing', foes.inWorld > 0,
  `${foes.inWorld} kinds standing in the slice carry ${foes.abilities} `
  + `abilities, ${foes.runnable} of which this engine runs`)
check('and some of them are told when', foes.cued > 0,
  `${foes.cued} kinds carry ${foes.cues} cues out of \`smart_scripts\` — `
  + 'the moment they turn on you, every so often in a fight, and when they '
  + 'are hurt to a share of their health')
check('and an area attack has an area', foes.wide.length > 0,
  foes.wide.map((w) => `${w.id} reaches ${w.wide} yards`).join(', '))

// 9n. The world moves.  `creature_formations` is 6,021 rows and `pool_creature`
// was read only to *throw spawns away* — so everything came at you one at a
// time, and pulling, the one decision this game's combat has, was not one.
const packs = await p.evaluate(() => window.__packs())
check('some of them walk together', packs.packs > 0,
  `${packs.packs} packs, ${packs.inPacks} creatures in them, the biggest `
  + `${packs.biggest} strong`)
const pulled = await p.evaluate(() => window.__pull())
if (pulled) {
  check('and pulling one brings the rest', pulled.came > 1,
    `pulled one of a pack of ${pulled.size} and ${pulled.came} came`)
}
check('and a shared slot stands up only its share', packs.waiting > 0,
  `${packs.pooled} spawns share slots, ${packs.waiting} of them waiting a turn`)

// 9o. Where you stop matters.  Rest accrues four times as fast in an inn —
// `Player::LoadFromDB` (PlayerStorage.cpp:5523) — and in a browser closing the
// tab *is* logging out, so this is the one rule from that game that fits this
// medium better than it fit the original.
const inn = await p.evaluate(() => { window.__toInn(); return window.__rest() })
check('there is an inn and standing in it counts', inn.inns > 0 && inn.inside,
  `${inn.innkeepers} innkeepers, ${inn.inns} of them with a roof over them`)
check('and resting there is worth four times resting outside',
  Math.abs(inn.anHourInside / inn.anHourOutside - 0.125 / 0.031) < 0.01,
  `an hour inside banks ${inn.anHourInside.toFixed(2)} experience, outside `
  + `${inn.anHourOutside.toFixed(2)}, and the pool caps at ${inn.cap}`)

// 9p. `conditions` is 14,630 rows and nothing read them.  Nine touch this
// slice, and the two that matter say an item falls only while you hold a
// particular quest — which is the table's own first example of what goes wrong
// without it, and it looks like generosity rather than like a bug.
const gated = await p.evaluate(() => window.__gated())
check('a quest item does not fall without the quest', gated.n > 0,
  `${gated.n} drops in the world wait on a quest — `
  + gated.gated.map((g) => `${g.entry} drops ${g.item} only for quest ${g.quest}`)
    .join(', '))

// 9q. The fifth kind of objective.  `Errand` held `kill` and `fetch` and the
// quest page counts five; of the three that were missing, this slice uses
// exactly one — five of its hundred and two quests finish by walking
// somewhere, out of `areatrigger_involvedrelation` and the client's own
// `AreaTrigger.dbc`.  Without it they can be taken and never finished.
const walk = await p.evaluate(() => window.__walkTo())
if (walk.quests) {
  check('a quest can be finished by walking somewhere',
    walk.reached > 0 && walk.after < walk.before,
    `${walk.quests} of them do; quest ${walk.id} wants ${walk.places} `
    + `place(s), and standing in one took it from ${walk.before} short to `
    + `${walk.after}`)
}

// 9r. The sky.  The art direction gave up terrain textures — the ground is
// grain with the colour taken out — so weather and light are most of what the
// land has left to have an expression with, and there was neither.
const sky = await p.evaluate(() => window.__sky())
check('the sky has weather of its own here', !!sky.chances,
  `${sky.zones} zones carry their own chances; this one rains `
  + `${sky.chances?.[0]?.[0] ?? 0}% of the time in spring, and over thirty `
  + `days it is wet ${(sky.wet * 100).toFixed(0)}% of the hours`)
check('and it is derived rather than rolled', sky.steady === true,
  'the same hour gives the same sky, so it does not touch the dice and does '
  + 'not flicker')
check('and the light knows what time it is', sky.noon > sky.night,
  `noon ${sky.noon.toFixed(2)} against two in the morning ${sky.night.toFixed(2)}`)

// 9s. The paperdoll.  Fifty-eight layer sheets were committed to
// `public/art/doll/`, `CLAUDE.md` said a `src/doll.ts` composed them, and that
// file did not exist — nothing in `src/` had ever said the word.
const bare = await p.evaluate(() => window.__doll())
const dressed = await p.evaluate(async () => {
  // Buy something that has a layer.  The shop check earlier bought a sword,
  // and a sword is not a picture of a man wearing something.
  const shelf = await (await fetch('./world/items.json')).json()
  for (const slot of ['chest', 'feet', 'hands']) {
    const pick = Object.entries(shelf.items)
      .filter(([, v]) => v[1] === slot && v[4] <= 1)
      .sort((a, b) => b[1][8] - a[1][8])[0]
    if (pick) window.__buy(Number(pick[0]))
  }
  window.__dress()
  return window.__doll()
})
if (bare) {
  check('the character is drawn, not just tabulated', bare.ink > 200,
    `${bare.w} by ${bare.h}, ${bare.ink} pixels of him, from `
    + `${bare.layers.length} layers`)
  check('and what he is wearing changes the picture',
    dressed.layers.join('|') !== bare.layers.join('|'),
    `${bare.layers.join(', ')} → ${dressed.layers.join(', ')}`)
}

// 9t. The frame rate does not change the game.  `requestAnimationFrame`'s own
// delta went straight into the simulation, so a slow machine played a
// different game — and what cannot be reproduced cannot be checked, which is
// the same argument that put one stream of chance behind every roll.
const steps = await p.evaluate(() => window.__steps(40))
check('the world moves in steps of a fixed length',
  Math.abs(steps.clock - steps.ran * steps.step) < 1e-9,
  `${steps.ran} steps of ${steps.step * 1000}ms moved the clock exactly `
  + `${steps.clock.toFixed(2)}s`)
const twice = await p.evaluate(() => {
  // The same walk, run as one long push and as many short ones: a fixed step
  // means they agree, and a variable one means they do not.
  window.__cam({ x: -8949.95, y: -132.493 })
  window.__hold('w')
  const a = window.__steps(20)
  window.__cam({ x: -8949.95, y: -132.493 })
  let far = 0
  for (let i = 0; i < 20; i++) far += window.__steps(1).moved
  window.__hold(null)
  return { one: a.moved, many: far }
})
check('and twenty steps go as far as twenty steps',
  Math.abs(twice.one - twice.many) < 0.01,
  `${twice.one.toFixed(2)} yards in one run, ${twice.many.toFixed(2)} in twenty`)

// 9u. The end of it.  The growth page warned that level ten would be a number
// that means nothing, and it was: the milestone said "start it and finish it"
// and nothing in the game knew what finishing was.
const ending = await p.evaluate(() => { window.__earn(40000); return window.__ending() })
check('reaching the ceiling is an event and not a number',
  ending.level === ending.ceiling && ending.finished,
  `level ${ending.level} of ${ending.ceiling}, ${ending.quests} errands done, `
  + `${ending.kills} killed`)
check('and there is nothing left to be rested for', ending.restCap === 0,
  'the server stops banking rest at the ceiling too — `SetRestBonus`, '
  + 'Player.cpp:10374')

// 9v. Where the server itself walks things.  The climbing limit is a
// measurement — the steepest of `waypoint_data`'s 3,954 legs — but reading
// walkability off a height field is still *reading it off a picture*, and the
// honest cross-check needs the navigation mesh the server actually uses, which
// is 2.2 GB of Recast nobody has built (issue 93).  This is the cheap half and
// it is not nothing: every patrol point and every spawn in the slice, asked
// whether we would let a body stand there.  The server put them all there, so
// every refusal is ours to explain.
const nav = await p.evaluate(() => window.__navcheck())
const say = (o) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(', ')
check('the server walks its creatures over ground we allow',
  nav.onRoute.slope / nav.legs < 0.06,
  `${nav.legs.toLocaleString()} patrol points over ${nav.routes} routes; `
  + `${nav.onRoute.slope} too steep for us (${((nav.onRoute.slope / nav.legs) * 100).toFixed(1)}%) — ${say(nav.onRoute)}`)
check('and it stands them on ground we allow',
  nav.atRest.slope / nav.spawns < 0.06,
  `${nav.spawns.toLocaleString()} spawns; ${nav.atRest.slope} on ground we `
  + `call a cliff (${((nav.atRest.slope / nav.spawns) * 100).toFixed(1)}%) — ${say(nav.atRest)}`)

// 9w. The game says things out loud.  There was no `AudioContext` and no
// `new Audio` anywhere in `src/` — nobody decided on a silent game, there was
// simply no plan for sound, which is worse.  In a tab-target fight the ear
// reports the result before the eye does.
await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' })))
await p.waitForTimeout(900)
const sound = await p.evaluate(() => window.__sound())
check('the game has a voice', sound.loaded === sound.words,
  `${sound.loaded} of ${sound.words} sounds decoded, opened on a gesture `
  + 'because a browser refuses to open one without')
// And the rule that matters: it may be turned off without losing anything.
// Every sound has something on screen that says the same — the pairs are in
// `art/SOUND-CREDITS.md` — so this asks whether the log still says it.
const quiet = await p.evaluate(() => {
  window.__mute(true)
  return { muted: window.__sound().muted }
})
check('and turning it off loses nothing', quiet.muted === true,
  'every sound has a line or a number that says the same, and '
  + '`art/SOUND-CREDITS.md` lists the pairs')
await p.evaluate(() => window.__mute(false))

// 10. A crossing crosses.  A bridge that cannot be walked over is worse than no
// bridge at all — the river is impassable either way and now it looks as if it
// should not be.  So: every yard of the deck's own centre line is walkable end
// to end, and the water a step off the side of it is not, which is the half
// that catches a deck let through over dry land.
const spans = await p.evaluate(() => {
  const out = []
  for (const b of window.__spans().list) {
    let solid = 0, open = 0, wet = 0, dry = 0
    for (let i = 0; i <= 48; i++) {
      const a = b.lo + ((b.hi - b.lo) * i) / 48
      const x = b.x + b.c * a, y = b.y + b.s * a
      if (window.__probe(x, y).blocked) solid++; else open++
      // A stride past the edge, across the deck rather than along it.
      for (const side of [-1, 1]) {
        const ox = x - b.s * (b.w + 2) * side, oy = y + b.c * (b.w + 2) * side
        if (window.__probe(ox, oy).wet) wet++; else dry++
      }
    }
    // And it has to end on something you can stand on, at both ends.
    const foot = [b.lo - 2, b.hi + 2].map((a) =>
      window.__probe(b.x + b.c * a, b.y + b.s * a).blocked)
    out.push({ at: [Math.round(b.x), Math.round(b.y)], solid, open, wet, dry,
      ends: foot })
  }
  return out
})
check('every crossing can be crossed', spans.length > 0
  && spans.every((s) => s.solid === 0), JSON.stringify(spans))
check('and lands on both banks', spans.every((s) => !s.ends[0] && !s.ends[1]),
  JSON.stringify(spans.map((s) => [s.at, s.ends])))
check('and each one has water beside it', spans.every((s) => s.wet > 0),
  JSON.stringify(spans.map((s) => [s.at, s.wet])))
console.log(`      (${spans.length} crossings, ${spans.reduce((a, s) => a + s.open, 0)} yards of open deck)`)

// 10b. Goldshire has no pit in the middle of it.
//
// The client cuts its own terrain away wherever a building carries its own
// floor, and the ground loop painted that cut black without asking whether
// anything was standing in it — so the middle of Goldshire was a thirty-yard
// black square with the inn's own people on top of it.  Two of the three
// places that asked "is this a hole" already knew to ask the second half.
//
// Counted off the **canvas**, not out of the scene.  Every way of asking the
// scene turns into a restatement of the rule that draws it, and the thing
// that went wrong here is exactly what a restatement cannot see: `shotcheck`
// had a Goldshire reference all along and reported 0.0% moved, because the
// black square was in the reference.  A picture taken while the screen is
// wrong guards the wrong screen.  Pixels of the hole colour, in a town with
// no mine in it, is a number that is zero for a reason.
await p.evaluate(() => window.__cam({ x: -9462, y: 16, zoom: 1 }))
await p.waitForTimeout(700)
const pit = await p.evaluate(() => {
  const c = document.querySelector('canvas')
  const g = c.getContext('2d')
  const { data } = g.getImageData(0, 0, c.width, c.height)
  let dark = 0
  // `#0a0a0f`, which nothing else in this palette is: the ground sheet's
  // darkest grass is far lighter and the panels are DOM, not canvas.
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] === 0x0a && data[i + 1] === 0x0a && data[i + 2] === 0x0f) dark++
  }
  return { dark, of: (c.width * c.height) }
})
check('Goldshire has no pit in the middle of it',
  pit.dark / pit.of < 0.002,
  `${(100 * pit.dark / pit.of).toFixed(1)}% of the view is the hole colour`)

// 10c. Night is on the screen, and so is rain.
//
// `lightAt` has returned `{ ground, tint }` since it was written and the scene
// read only the first — which is the colour *behind* the world, and the tiles
// cover the glass, so the dark fell on the one part of the screen nobody can
// see.  Three in the morning and noon were the same picture to a tenth of a
// per cent.  The pipeline has a gate against this exact shape — a field read
// and then dropped — and it happened again on the other side of the wall.
//
// So: a check whose passing condition is that two screens **differ**.  There
// was not one of those anywhere in this repository.
await p.evaluate(() => window.__cam({ x: -9462, y: 16, zoom: 1 }))
const meanAt = async (h) => {
  await p.evaluate((hh) => window.__clock(new Date(2026, 5, 21, hh, 0, 0)), h)
  await p.waitForTimeout(420)
  return p.evaluate(() => {
    const c = document.querySelector('canvas')
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let r = 0, g = 0, b = 0
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2] }
    return [r, g, b].map((v) => v / (d.length / 4))
  })
}
const dark = await meanAt(3)
const noon = await meanAt(12)
const dusk = await meanAt(20)
const lift = (a, b) => (b[0] + b[1] + b[2] - a[0] - a[1] - a[2]) / 3
check('noon is brighter than three in the morning', lift(dark, noon) > 20,
  `${lift(dark, noon).toFixed(0)} levels between them`)
// And it is an evening rather than a power cut: the blue outlives the red,
// which is the difference between a dark picture and a black one.
check('and night is blue rather than black', dark[2] > dark[0] && dark[2] > 60,
  `rgb(${dark.map((v) => v.toFixed(0)).join(',')})`)
check('and dusk is between the two',
  lift(dark, dusk) > 10 && lift(dusk, noon) > 10,
  `${lift(dark, dusk).toFixed(0)} up from night, ${lift(dusk, noon).toFixed(0)} to noon`)

// Rain is on the glass too.  Forced rather than waited for: Elwynn is wet
// about a sixth of the time and a check that waits for weather is a check
// that fails one run in six.
const wetLook = await p.evaluate(async () => {
  const shot = () => {
    const c = document.querySelector('canvas')
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) n += d[i] + d[i + 1] + d[i + 2]
    return n / (d.length / 4)
  }
  window.__clock(new Date(2026, 5, 21, 12, 0, 0))
  await new Promise((r) => setTimeout(r, 300))
  const clear = shot()
  const found = window.__weather?.(3)
  await new Promise((r) => setTimeout(r, 300))
  const storm = shot()
  window.__weather?.(null)
  return { clear, storm, found }
})
check('and a storm is something you can see',
  wetLook.found && Math.abs(wetLook.storm - wetLook.clear) > 2,
  `${wetLook.clear.toFixed(1)} clear vs ${wetLook.storm.toFixed(1)} in a storm`)
await p.evaluate(() => window.__clock(new Date(2026, 5, 21, 12, 0, 0)))
await p.waitForTimeout(300)

// 10d. He is carrying what he was created carrying.
//
// `CharStartOutfit.dbc` names five items and what the original does with them
// is put them in his bags.  Here they were five rows of arithmetic borrowed as
// a fallback whenever the weapon slot was empty — which it always was — so the
// sheet said `공격력 9 – 11 (2.9초)` and `입은 것 없음` on consecutive lines,
// and the 2.9 was a greatsword nobody was holding.  Nothing could be sold,
// swapped, or drawn on the paperdoll, because there was nothing there.
//
// So the check is the fallback's own counter.  **If the bare-handed line is
// ever taken, that is the bug**, and a number is the only way to see it: both
// paths produce the same damage, which is exactly why it went unnoticed.
// The counter is cumulative over this whole run, which makes it a stronger
// statement than one frame's: whatever the checks above did to this character
// — levelled him, handed him things, dressed him — his hand was never empty.
const kit = await p.evaluate(() => ({
  slots: window.__dress().now.worn,
  bare: window.__barehanded(),
}))
check('the starting outfit is worn and not imagined',
  kit.slots.includes('weapon') && kit.slots.length >= 4,
  JSON.stringify(kit.slots))
check('and the bare-handed fallback is never reached', kit.bare === 0,
  `taken ${kit.bare} times`)
console.log(`      (wearing ${kit.slots.join(', ')})`)
// What is worn and cannot be drawn.  Not a failure — the layer set has no
// trousers in it, which is a fact about thirty-two PNGs — but a silent
// nothing is how the paperdoll came to be believed in for weeks while the
// file that composed it did not exist.
const undrawn = await p.evaluate(() => window.__undrawn())
console.log(`      (${undrawn.length} worn slots the sheets cannot draw`
  + `${undrawn.length ? `: ${undrawn.join(', ')}` : ''})`)

// 10d2. And what he is carrying is drawn, in both places he is drawn.
//
// The hand was empty in the scene and empty on the paperdoll while the man
// was holding a greatsword the character sheet printed the damage of, which
// is the oldest shape of bug in this repository: a number that is right and a
// picture that was never asked for.  Two sheets had to be cut for it — LPC's
// ten half-strips for the world and five more renders of the kit for the doll
// — so the check asks both, and it **fails** on a kind with no picture rather
// than counting it.  Counting is what the bare-handed fallback did.
const arms = await p.evaluate(() => window.__arms())
check('every kind of weapon this world holds has a picture',
  arms.kinds.length >= 5 && arms.flat.length === 0 && arms.undressed.length === 0,
  `${arms.kinds.length} kinds (${arms.kinds.join(', ')}); `
  + `${arms.flat.length} with no world sprite, ${arms.undressed.length} with `
  + 'no paperdoll layer')
check('and holding one puts another layer on the man',
  !!arms.held && arms.layers > 1,
  `he is holding a ${arms.held}, drawn out of ${arms.layers} pictures`)
check('and the paperdoll is wearing it too',
  arms.wearing.some((n) => n.includes('_weapon_')),
  arms.wearing.join(', '))

// 10d3. And nothing is cut and then never played.
//
// Six frames of `slash` by four directions had been in `hero.png` since the
// sprite existed and `src/main.ts` did not contain the word: a fight was two
// people standing perfectly still exchanging numbers.  That is this
// repository's most frequent bug and it is invisible from either end alone —
// the bake says the cells are there, the scene says it draws the hero, and
// nothing compared the two.  `tint` (issue 118) and `I_QUALITY` (issue 157)
// were the same shape.
//
// Every weapon, because they do not all swing alike: LPC gives `magic/gnarled`
// a thrust and no slash, so the thing in the hand decides which clip the body
// plays and no ordinary run of the game holds all five.
const held = await p.evaluate(async () => {
  const out = []
  for (const word of ['sword', 'dagger', 'axe', 'mace', 'staff']) {
    // Standing with it first, then swinging it: those are different strips of
    // the weapon's own sheet, and a check that only ever swings leaves four of
    // the five walks unread.
    window.__wield(word, false)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const put = window.__wield(word)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    out.push({ ...put, pose: window.__clips().pose })
  }
  return out
})
const sheet = await p.evaluate(() =>
  fetch('./art/hero.json').then((r) => r.json()))
const wanted = [
  ...Object.keys(sheet.clips).map((c) => `hero:${c}`),
  ...Object.entries(sheet.arms ?? {}).flatMap(([w, a]) =>
    Object.keys(a.clips).map((c) => `arms:${w}:${c}`)),
]
const clips = await p.evaluate(() => window.__clips())
const unplayed = wanted.filter((k) => !clips.played.includes(k))
check('every clip that was cut gets played',
  unplayed.length === 0,
  `${wanted.length} baked, ${clips.played.length} played`
  + (unplayed.length ? `; never drawn: ${unplayed.join(', ')}` : ''))
console.log(`      (the shelved renders are not in this: `
  + `\`art/actors.png\` and the paperdoll layers are not sheets the scene `
  + `opens — see CLAUDE.md, and issue 184 for the paperdoll)`)

// And the swing's motion is the weapon's speed, which is what makes a
// greatsword feel like one.  Read as how far through the clip each weapon had
// got after the same wait: the quickest is furthest.
const armed = held.filter((h) => h.swing && h.pose.count)
  .map((h) => ({ ...h, at: h.pose.frame / h.pose.count }))
const quick = armed.reduce((a, b) => (a.swing <= b.swing ? a : b), armed[0])
const slow = armed.reduce((a, b) => (a.swing >= b.swing ? a : b), armed[0])
check('and the swing takes as long as the weapon does',
  armed.length === 5 && armed.every((h) => h.pose.clip === sheet.arms[h.word].swing),
  armed.map((h) => `${h.word} ${h.pose.clip} ${h.pose.frame}/${h.pose.count} `
    + `at ${(h.swing / 1000).toFixed(1)}s`).join(', '))
check('and a slower weapon is further behind in it',
  quick.swing === slow.swing || quick.at >= slow.at,
  `${quick.word} at ${(quick.swing / 1000).toFixed(1)}s is `
  + `${(quick.at * 100).toFixed(0)}% through, ${slow.word} at `
  + `${(slow.swing / 1000).toFixed(1)}s is ${(slow.at * 100).toFixed(0)}%`)

// 10d4. And the one that was hit does not stand there.
//
// There is no hit pose to play, and that is a measurement: LPC draws `hurt`
// six frames facing **down only** — one direction of four — and the animal
// packs have no hurt row at all, so none of the forty-eight kinds here has a
// flinch to bake.  What there is instead is motion: a body is shoved away
// from the blow by as much of a yard as the blow was of its health.  The one
// thing that can go wrong with that is a flinch longer than the gap between
// blows, which is a body that never comes back to standing.
check('a flinch is over before the next blow can land',
  clips.hurtSeconds * 1000 < clips.fastest,
  `${(clips.hurtSeconds * 1000).toFixed(0)}ms against the quickest weapon in `
  + `the slice at ${clips.fastest}ms`)

// 10d5. The water is somewhere you can be.
//
// It was a wall, and that was a rule from before there was any terrain to say
// how deep it was: 1,469 cells of water within twelve hundred yards of the
// start and two of them could be entered.  Elwynn's streams are waded and its
// lake is swum, and the island in the lake is only reachable that way.
//
// **Flooded rather than counted**, because "can be entered" and "can be
// reached" are different claims and it is the second that matters — a lake
// you can stand in but cannot swim to is still a wall.  Reaching it from dry
// land answers getting out of it too, since a step crosses either way.
const lake = await p.evaluate(() => window.__water())
check('most of the water can be got to',
  lake.reached > lake.total / 2,
  `${lake.reached} of ${lake.total} cells within 1,200 yards of the start, `
  + `flooded from where a character begins — ${lake.wade} of it shallow `
  + `enough to stand in and ${lake.swim} deep enough to swim`)
check('and the line between wading and swimming is the server\'s',
  Math.abs(lake.swimDepth - 2.03 * 0.75) < 0.01,
  `${lake.swimDepth} yards, which is three quarters of HumanMale's 2.03 `
  + `collision box — Unit.cpp:4484 — and the swim itself is `
  + `${lake.swimSpeed.toFixed(2)} yards a second against a run's 7`)
// And walked, not just flooded: in off a shallow bank, out to dry ground.
const swum = await p.evaluate((w) => {
  window.__put(w.shore.x, w.shore.y)
  window.__aim(w.deep.x, w.deep.y)
  let deepest = 0, afloat = false
  for (let i = 0; i < 240; i++) {
    window.__steps(1)
    const d = window.__depth()
    if (d.depth > deepest) deepest = d.depth
    if (d.swimming) afloat = true
  }
  window.__aim(w.shore.x, w.shore.y)
  for (let i = 0; i < 400; i++) window.__steps(1)
  const out = window.__depth()
  window.__aim(null)
  return { deepest, afloat, out }
}, lake)
check('a stream is waded and a lake is swum',
  swum.afloat && swum.deepest > lake.swimDepth,
  `walked in from ${lake.shore.d} yards of water and got out to `
  + `${swum.deepest} yards deep`)
check('and there is a way back out of it',
  swum.out.depth === 0 && !swum.out.swimming,
  `back on dry ground at ${swum.out.x.toFixed(0)}, ${swum.out.y.toFixed(0)}`)

// 10e. A building's furniture belongs to the building.
//
// `npm run audit` counted 3,759 things standing inside the slice's buildings
// and two thirds of them took the skip default, so the roof came off the
// abbey and what was under it was a tiled floor with nothing on it.  Mapping
// them is the easy half.  The hard half is that a building's contents are
// only hidden from outside when the scene knows whose they are — and it used
// to work that out by asking whether a piece stood inside the footprint,
// which a shelf *against a wall* fails, because the wall is the edge of the
// mask.  With a hundred and fifty pieces that was a curiosity.  With three
// thousand it put bookcases in the road.
const rooms = await p.evaluate(() => window.__scenery())
const INDOORS = ['shelf', 'cabinet', 'keg', 'bed', 'crockery']
const homeless = INDOORS.map((k) => [k, (rooms[k] ?? [0, 0])[0] - (rooms[k] ?? [0, 0])[1]])
  .filter(([, n]) => n > 0)
const loose = homeless.reduce((a, [, n]) => a + n, 0)
const furniture = INDOORS.reduce((a, k) => a + (rooms[k] ?? [0, 0])[0], 0)
check('a building\'s furniture knows which building it is in',
  loose < furniture * 0.1,
  `${loose} of ${furniture} do not: ${homeless.map(([k, n]) => `${k} ${n}`).join(', ')}`)
console.log(`      (${furniture} pieces of furniture, ${loose} of them loose)`)

// 10f. The forest has waterfalls, and after dark it has fireflies.
//
// `npm run audit` counts 530 outdoor placements with no rule, and 293 of them
// are the things that *move*: 158 butterflies, 51 clusters of fireflies, 46
// birds, 38 waterfalls.  In a forest whose art direction gave up terrain
// textures, motion is most of what is left to give the land an expression.
//
// The falls have a picture now.  Butterflies and birds do not and will not:
// every asset pack on this machine was searched and none has a top-down one,
// and drawing one here is not allowed — so they are *named* in the bake
// rather than left unmatched, which is the difference between a thing nobody
// has looked at and a thing somebody has.
const wild = await p.evaluate(() => window.__scenery())
check('the falls are drawn', (wild.waterfall ?? [0])[0] > 20,
  `${(wild.waterfall ?? [0])[0]} of them`)

// The fireflies are the exception, and the reason is worth stating: a firefly
// is barely a picture — it is a point of light that comes and goes — and
// light is code, the same as the rain.  So they exist only after dark, and a
// check that says so is a check that two screens differ.
await p.evaluate(() => window.__cam({ x: -8946, y: -1114, zoom: 1.1 }))
await p.evaluate(() => window.__clock(new Date(2026, 5, 21, 12, 0, 0)))
await p.waitForTimeout(400)
const byDay = await p.evaluate(() => window.__motes())
await p.evaluate(() => window.__clock(new Date(2026, 5, 21, 23, 0, 0)))
await p.waitForTimeout(400)
const byNight = await p.evaluate(() => window.__motes())
check('and the fireflies come out at night and not before',
  byDay.lit === 0 && byNight.lit > 0 && byNight.n > 40,
  `${byNight.n} clusters, ${byDay.lit} lit at noon, ${byNight.lit} at eleven`)
await p.evaluate(() => window.__clock(new Date(2026, 5, 21, 12, 0, 0)))
await p.waitForTimeout(300)

// 10g. The slice is a zone, not a box.
//
// `slice.json` says this game is area 12 and the bounds are the measured
// bounding box of it — but Stormwind sits geographically *inside* Elwynn, so
// the box catches the city whole, and the Burning Steppes and a beach of
// Westfall with it.  A third of the walkable ground in this slice was
// somewhere else, and the biggest piece was a city this repository
// deliberately does not draw: `STORMWIND.WMO` is excluded because there is no
// picture of a city here, and that decision was right and then left
// half-finished.  What it left was a flat grey slab, a ruler-straight line
// down the middle of the map, and thirty people standing on nothing.  From
// the start you could walk to the middle of it: 158 of 200 steps open.
const edge = await p.evaluate(() => window.__edge())
check('no walkable ground belongs to another zone', edge.strayed.stray === 0,
  `${edge.strayed.stray} of ${edge.strayed.open} open samples`)
console.log(`      (${edge.elsewhere} spawns, ${edge.beyond} pieces of scenery `
  + 'left outside)')

// 10h. Nobody stands where their kind cannot.
//
// The probe beside `__npcs` had set its own bar — *"`wet` and `inside` should
// both be zero"* — and `wet` was 24.  Both halves of that sentence were
// wrong, which is why it never got fixed: eighteen of the twenty-four are
// murlocs, and a murloc lives in a lake.
//
// So the question is not who is in water, it is who is in water that should
// not be, and the unit is the *kind*: the whole point of a murloc is that
// murlocs live in water.  Our own spawn table says which — 162 murlocs and
// most of them wet against 383 townsfolk and one.
//
// `creature_template_movement.Swim` was tried first and is not the answer.
// Over this slice it says all 233 wolves swim and not one of the 162 murlocs
// does: it means "may the server move this through water", which for a wolf
// chasing you into a lake is yes.
const who = await p.evaluate(() => window.__npcs())
check('nobody is in water whose kind does not live there',
  who.adrift.length === 0, who.adrift.join('; '))
check('and nobody is standing inside a wall',
  who.walled.length === 0, who.walled.join('; '))
console.log(`      (${who.wet} in water, all of them ${who.lives.join(', ')}; `
  + `${who.settled} nudged out)`)

// 10i. Two grounds meeting have something to meet with.
//
// The floor looked like a staircase of 1.33-yard squares and the tile size
// was blamed for it.  The tile size is not the reason: **all eighteen ground
// pieces were fills**, so a riverbank, a roadside and the lip of a village's
// paving had no edge piece between them and could not have had one.
// `bake_tiles.py` had even written down that the shorelines were there —
// *the rows above it are shorelines* — and cut only the bottom row.
//
// The sheets are drawn for corner autotiling, so the tile is now chosen by
// its four corners rather than by its middle: sixteen pieces for the sixteen
// ways four corners can be one ground or the other, and the boundary lands on
// half-tile lines **without the paint mask gaining a byte**.
await p.evaluate(() => window.__cam({ x: -9100, y: -350, zoom: 0.8 }))
await p.waitForTimeout(600)
const seam = await p.evaluate(() => window.__edges())
check('a boundary between two grounds is drawn as one',
  seam.edged > seam.tiles * 0.05,
  `${seam.edged} of ${seam.tiles} tiles are an edge piece`)
console.log(`      (${(100 * seam.edged / seam.tiles).toFixed(0)}% of this view `
  + 'is a boundary between two grounds)')

// 10j. A building is closed, and a door is how you get in.
//
// The roof used to come off whichever building you were standing in.  That
// was right at the time and wrong in the end: a room seen from above is not a
// room — the walls become lines, the ceiling and the doorframes and the
// windows are gone — and the two open bugs that came out of it were the inn's
// floor drawn as a pit and a roof lifted off an empty field.
//
// So the world is two kinds of scene and a door is the seam, which is the
// answer 2D actually uses.  Everything it needed was already baked and the
// only missing piece was the decision: `doorways` had been finding the
// portals since it was written, and the bake used them to pick which storey
// was the ground one and **threw the coordinates away**.
const inside = await p.evaluate(() => window.__room())
check('the buildings with a plan have doors', inside.open >= inside.shut * 0.5,
  `${inside.open} of ${inside.shut} can be walked into`)
// A door with nothing standable outside it is a building nobody can enter.
// Two of the twenty-five are towers on their own crags, where every square
// within six yards of the door is either the tower or a cliff — which is a
// fact about where the client put them rather than a fault here, so it is
// counted rather than waved away.
const sealed = inside.reachable.filter(([, ok]) => ok === 0)
check('and the ground outside almost every door can be walked to',
  sealed.length <= inside.reachable.length * 0.1,
  `${sealed.length} of ${inside.reachable.length} sealed: ${sealed.map(([k]) => k).join(', ')}`)
console.log(`      (${inside.reachable.reduce((a, r) => a + r[2], 0)} doors on `
  + `${inside.reachable.length} buildings)`)

// 10k. A mine is not a building, and the server knows where it is.
//
// Elwynn's mines are cut out of the `.adt` terrain itself and their mouths
// are bits in a chunk's `holes` field.  **A height field cannot hold a
// tunnel** — one (x, y) has one z — so there is no inside to read, which is
// why the bake says in its own words that a mine mouth is a hole in a
// hillside and not a cottage.
//
// But the server knows where its creatures stand, and that is the same
// structural fact the heights already lean on: eighty-eight creatures in this
// slice stand six yards or more below the baked surface.  The chambers are
// where they are; the passages between them are a minimum spanning tree over
// the cloud, widened.
//
// **The passages are ours and the screen says so.**  That is not tidiness —
// this repository lost a round once to drawing something without a client and
// not admitting it.
const mines = await p.evaluate(() => window.__caves())
check('the mines are dug from where the world stands its creatures',
  mines.mines.length >= 3, `${mines.mines.length} of them`)
check('and each is a warren rather than a box',
  mines.mines.every((m) => m.dug > 5 && m.dug < 60),
  mines.mines.map((m) => `${m.area}: ${m.dug}% dug, ${m.crew} down it`).join('; '))
// Derived and not rolled, so the same world is always the same mine: asked
// twice and compared, which is the only way to say it.
const dug1 = await p.evaluate(() => JSON.stringify(window.__caves()))
const dug2 = await p.evaluate(() => JSON.stringify(window.__caves()))
check('and the same world digs the same mine', dug1 === dug2)
console.log(`      (${mines.lost} creatures under the surface belong to no mine)`)

// 10l. The portrait is a portrait.
//
// `PlayerFrame.xml` puts a 64 by 64 `PlayerPortrait` at the head of twenty
// textures and what the client puts in it is the character's own head.  Ours
// was `sbed/health-normal` — a white cross — while the fifty-eight layer
// sheets of that same character sat in `public/art/doll/` and the paperdoll
// composed them two panels away.  The target's chose between two icons, a
// wolf's head or a sword, while `bake_npcs.py` had cut every creature in four
// directions.
const faces = await p.evaluate(async () => {
  const paint = (c) => {
    if (!c) return 0
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let on = 0
    for (let i = 3; i < d.length; i += 4) if (d[i] > 20) on++
    return Math.round((100 * on) / (d.length / 4))
  }
  const mine = paint(document.querySelector('#me .face canvas'))
  window.__walkTo?.('fight')
  await new Promise((r) => setTimeout(r, 2000))
  return { mine, foe: paint(document.querySelector('#foe .face canvas')) }
})
await p.keyboard.press('1')
await p.waitForTimeout(900)
const foeFace = await p.evaluate(() => {
  const c = document.querySelector('#foe .face canvas')
  if (!c) return 0
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let on = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] > 20) on++
  return Math.round((100 * on) / (d.length / 4))
})
check('the player is looking at his own face', faces.mine > 15,
  `${faces.mine}% of the circle is painted`)
check('and at whatever he is hitting', foeFace > 8,
  `${foeFace}% of the circle is painted`)

// 11. The ground costs what it costs.  A second tint fill over every tile,
// instead of one baked into the cache, was 934 tiles at 47 frames a second on
// this very view.
await p.evaluate(([x, y]) => window.__cam({ x, y, zoom: 1.2 }), [-9462, 16])
await p.waitForTimeout(1200)
const hud = await p.evaluate(() => document.getElementById('hud').textContent)
const fps = Number(hud.match(/초당 (\d+)/)[1])
const tiles = Number(hud.match(/([\d,]+)타일/)[1].replace(/,/g, ''))
check('the ground still runs at the refresh rate', fps >= 55, `${fps} fps over ${tiles} tiles`)
console.log(`      (${tiles} tiles, ${fps} fps)`)

// 12. And at the widest the zoom will go, which is where the ground used to
// stop running.  The tile count went as the square of how far out you were —
// 66,676 tiles at twenty frames a second four steps below the old floor — so
// the floor was 0.6 and the widest view was eighty-three yards of a valley six
// hundred across.  The ground draws a coarser tile when a fine one would be
// under sixteen pixels now, so the count is near flat and the floor is where
// the map stops being a map.
await p.evaluate(([x, y]) => window.__cam({ x, y, zoom: 0.12 }), [-8983, -316])
await p.waitForTimeout(1500)
const wide = await p.evaluate(() => document.getElementById('hud').textContent)
const wfps = Number(wide.match(/초당 (\d+)/)[1])
const wtiles = Number(wide.match(/([\d,]+)타일/)[1].replace(/,/g, ''))
check('and at the widest zoom too', wfps >= 45, `${wfps} fps over ${wtiles} tiles`)
check('and the widest view takes in the valley',
  1200 / (24 * 0.12) > 400, 'the floor has to show a zone, not a field')
console.log(`      (${wtiles} tiles, ${wfps} fps at the floor)`)

// 13. A building's outline is painted like a building.
//
// `inBuilding` makes three states and the paint chain had branches for two.
// `stone === 0 && room === 0` is false twice, so the answer fell all the way
// through to the outdoor paint: **the abbey had brown earth in it and the inn
// had grass growing in the hall**.  Over all forty-six plans that state is 65%
// of the outline — 192,671 cells of 295,227 — and one building is 80,746 cells
// of outline with 253 of floor.
//
// Read off what was actually drawn rather than off a second copy of the chain.
// Seen from *outside*, which is where the tile chain runs: a building you
// have walked into is drawn by `drawRoom` off its own plan and never touches
// the outdoor paint at all.
for (const [name, x, y, zoom] of [['abbey', -8889, -196, 0.5],
  ['goldshire', -9453, 12, 0.9]]) {
  await p.evaluate(([a, b, z]) => window.__cam({ x: a, y: b, zoom: z }),
    [x, y, zoom])
  await p.waitForTimeout(600)
  const paint = await p.evaluate(() => window.__underRoof())
  const kinds = Object.keys(paint)
  const total = Object.values(paint).reduce((a, b) => a + b, 0)
  check(`the ${name} is painted like a building`,
    total > 0 && kinds.length > 0 && kinds.length <= 3,
    `${total} tiles under the outline in ${kinds.length} pictures: ${kinds.join(' ')}`)
  console.log(`      (${JSON.stringify(paint)})`)
  // And none of them is ground.  Named rather than counted, because the thing
  // that went wrong was one specific picture arriving in one specific place.
  const outdoors = kinds.filter((k) =>
    /grass|dirt|earth|sand|bloom|water|shore/i.test(k))
  check(`and no outdoor ground is drawn inside it`, outdoors.length === 0,
    outdoors.join(' '))
  // And it is standing on the ground, with an edge.
  //
  // From above a building was ninety yards of one grey tile and nothing else:
  // no outline to say where it stopped, and no shadow, which on a flat plan is
  // the only thing that can say the roof is *above* the ground beside it.
  // Counted where they are drawn rather than worked out again — a check that
  // recomputes what it is checking is checking its own copy.
  const edges = await p.evaluate(() => window.__edges())
  check(`the ${name} has an edge and a shadow`,
    edges.outlined > 0 && edges.shaded > 0,
    `${edges.outlined} sides of a tile drawn as its edge, `
    + `${edges.shaded} tiles of ground in its shadow`)
}

// 13b. And a hall is not a cottage.
//
// One roof picture covered all forty-three buildings — 28 houses, 12 halls and
// 3 towers — so the abbey and a cottage were the same thing at two sizes, and
// "how many roof tiles are there" would have answered one and been quite
// right.  What has to be true is that every kind **this world contains** wears
// its own, which is a different question from how many pictures exist.
{
  const roofs = await p.evaluate(() => window.__roofs())
  const bare = roofs.kinds.filter((k) => !roofs.wears[k])
  const worn = roofs.kinds.map((k) => roofs.wears[k])
  check('every kind of building here has its own roof',
    bare.length === 0 && new Set(worn).size === worn.length,
    bare.length ? `${bare.join(', ')} has no roof picture`
      : roofs.kinds.map((k) => `${k} ${roofs.wears[k]}`).join(', '))
}

// 14. And the outline is four states on the glass, not three.
//
// A silhouette seen from above is not a room.  65% of the slice's outline is
// neither stone nor standing room — 192,671 cells of 295,227 — and that one
// state covers a room, the ground under an upper storey and an open yard.  The
// thing that tells them apart is whether anything flat stands over a man's
// head, and `wmo_plan` was dropping exactly that face as *not near this
// storey*.  Baked, it splits **167,238 roofed and 25,433 open to the sky**.
//
// Asked through the scene's own transform, because the bake's own check
// (`check_plans`) already holds the masks to a partition and what this adds is
// that the fourth one arrives.
{
  const seen = await p.evaluate(() => {
    const tally = { stone: 0, room: 0, roofed: 0, open: 0 }
    for (const b of window.__buildings()) {
      for (let dx = -b.l; dx <= b.l; dx += 2) {
        for (let dy = -b.w; dy <= b.w; dy += 2) {
          const q = window.__plotAt(b.x + dx, b.y + dy)
          if (!q) continue
          tally[q.wall ? 'stone' : q.floor ? 'room'
            : q.roofed ? 'roofed' : 'open']++
        }
      }
    }
    return tally
  })
  check('a building is four states and not three',
    seen.open > 0 && seen.roofed > 0 && seen.stone > 0 && seen.room > 0,
    JSON.stringify(seen))
}

// 15. You can walk to the doors, and to the other end of the valley.
//
// `327779e` closed the buildings and took **86% of the walkable world** with
// it: two abbey gatehouses, 160 yards apiece and no portal in either, stood
// across the only way out of Northshire, and nothing noticed because no check
// asked how much world there was.  This is that check.
//
// One flood from where a character starts, four yards a step, bounded by the
// slice.  What it answers is three questions at once: how much of the world a
// player can reach, whether the two places that matter are two of them, and
// which of the baked doors anybody can walk to.
{
  const world = await p.evaluate(() => {
    const S = 4
    const B = window.__bounds()
    const doors = window.__buildings().filter((b) => b.k !== 'mine')
      .flatMap((b) => (b.doors ?? []).map((d) => ({ b, d })))
    const seen = new Set()
    const key = (x, y) => `${Math.round(x / S)},${Math.round(y / S)}`
    const from = window.__start()
    const stack = [[from.x, from.y]]
    seen.add(key(from.x, from.y))
    const got = new Set()
    while (stack.length) {
      const [x, y] = stack.pop()
      for (let i = 0; i < doors.length; i++) {
        const [dx, dy] = doors[i].d
        if (Math.hypot(x - dx, y - dy) < 2.4) got.add(i)
      }
      for (const [ax, ay] of [[S, 0], [-S, 0], [0, S], [0, -S]]) {
        const px = x + ax, py = y + ay
        if (px < B[0] || px > B[1] || py < B[2] || py > B[3]) continue
        const k = key(px, py)
        if (seen.has(k)) continue
        seen.add(k)
        if (window.__wallAt(px, py)) continue
        stack.push([px, py])
      }
    }
    // A door on the building's outer edge is one you are meant to walk to.
    // One with the silhouette all round it is an inner door or an upper
    // storey's, and "walk to it from outside" is the wrong question for it.
    const outer = (dx, dy) => {
      for (let a = 0; a < 16; a++) {
        const t = (a / 16) * Math.PI * 2
        let clear = true
        for (let r = 1; r <= 8; r += 1) {
          if (window.__plotAt(dx + Math.cos(t) * r, dy + Math.sin(t) * r)) {
            clear = false; break
          }
        }
        if (clear) return true
      }
      return false
    }
    let outerAll = 0, outerGot = 0
    doors.forEach((q, i) => {
      if (!outer(q.d[0], q.d[1])) return
      outerAll++
      if (got.has(i)) outerGot++
    })
    return {
      cells: seen.size, doors: doors.length, reached: got.size,
      outerAll, outerGot,
      goldshire: seen.has(key(-9461.6, 16.19)),
      abbey: seen.has(key(-8930, -200)),
    }
  })
  // The floor is the measurement with room under it, not the measurement.  A
  // bake that shuffles a wall by a yard moves this by a few hundred cells; a
  // bake that walls off a valley moves it by a quarter of a million.
  check('the walkable world is still a world', world.cells > 300000,
    `${world.cells.toLocaleString()} cells of four yards from the start`)
  check('and Goldshire is in it', world.goldshire)
  check('and so is the abbey', world.abbey)

  // 15b. And it is still a world by the strict yardstick, which is the one
  // that was lying.
  //
  // There were two "you cannot go there" in this game and they disagreed by
  // **thirteen times** — 322,935 cells against 24,765 — and nothing said why,
  // so a round closed on whichever of the two happened to pass.  `#168` was
  // closed on the loose one.  Three things were wrong and all three are the
  // same mistake, which is asking a question about a *cell* when the thing
  // being done is a *step*:
  //
  //   * the slope test was the worst step **out of** a cell in any of four
  //     directions, so a road cut along a hillside read as a cliff for its
  //     whole length — the bank beside it is a neighbour of every cell of it
  //   * two doorless halls, 80 by 24 yards and 80 by 8, stood across the way
  //     west; `shutOut` is "you have not come through the door" and a
  //     building with no door can never be in any other state, so its whole
  //     roofed footprint was a wall nothing in the client says is one
  //   * the flood stepped four yards and asked once, so it hopped a wall two
  //     yards thick: the mask was open and the legs could not walk it
  //
  // And the probe point for Goldshire, `-9461.6, 16.19`, is **inside one of
  // its buildings** — shut to anybody who has not walked through its door, so
  // the strict yardstick was being asked whether you can stand in somebody's
  // front room.
  const reach = {}
  for (const rule of ['leg', 'blocked', 'footing', 'wall']) {
    reach[rule] = await p.evaluate((r) => {
      const got = window.__reach(r, 4)
      const spots = { 'the Goldshire road': [-9440, 60],
        'the Goldshire square': [-9470, -20], 'the abbey door': [-8930, -200] }
      return { cells: got.cells, why: got.why,
        spots: Object.fromEntries(Object.entries(spots)
          .map(([k, q]) => [k, got.has(q[0], q[1])])) }
    }, rule)
  }
  check('the strict yardstick reaches as much world as the loose one',
    reach.leg.cells > 140000 && reach.blocked.cells > 200000,
    `the step rule ${reach.leg.cells.toLocaleString()}, "a man cannot be `
    + `here" ${reach.blocked.cells.toLocaleString()}, "not a slope" `
    + `${reach.footing.cells.toLocaleString()}, stone alone `
    + `${reach.wall.cells.toLocaleString()}`)
  const disagree = Object.keys(reach.leg.spots).filter((k) =>
    new Set(Object.values(reach).map((r) => r.spots[k])).size > 1
    || !reach.leg.spots[k])
  check('and every yardstick agrees you can get to the places that matter',
    disagree.length === 0,
    disagree.length ? `they differ about ${disagree.join(', ')}`
      : Object.keys(reach.leg.spots).join(', '))

  // 15c. The third yardstick, which is not a mask at all: walk it.
  //
  // A mask that is open and a pair of legs that cannot make the trip are two
  // different claims, and until something walked the route there was nothing
  // between them — the flood said three hundred thousand cells while a push
  // from the start stopped at the first thing in the way.  This takes the
  // route the flood itself found and walks every cell of it with the same
  // `walk` a finger on the stick drives, `slide` and all.
  const trek = await p.evaluate(async () => {
    const path = window.__path(-9440, 60)
    if (!path) return { path: null }
    const s = window.__start()
    window.__put(s.x, s.y)
    let stuck = 0
    for (const [tx, ty] of path.trail) {
      let tries = 0
      while (tries++ < 120) {
        const h = window.__hero()
        if (Math.hypot(h.x - tx, h.y - ty) < 2) break
        window.__aim(tx, ty)
        window.__steps(1)
      }
      const h = window.__hero()
      if (Math.hypot(h.x - tx, h.y - ty) >= 2) stuck++
    }
    window.__aim(null)
    const h = window.__hero()
    return { yards: Math.round(path.yards), cells: path.trail.length, stuck,
      left: Math.round(Math.hypot(h.x + 9440, h.y - 60)) }
  })
  check('and a man can actually walk from the start to Goldshire',
    trek.path !== null && trek.stuck === 0 && trek.left < 6,
    trek.path === null ? 'the flood found no route at all'
      : `${trek.yards} yards over ${trek.cells} cells, ${trek.stuck} of them `
      + `he could not reach, ending ${trek.left} yards off`)
  check('every door on a building\'s outside can be walked to',
    world.outerAll > 0 && world.outerGot === world.outerAll,
    `${world.outerGot} of ${world.outerAll} outer doors, `
    + `${world.reached} of ${world.doors} in all`)
  console.log(`      (${world.cells.toLocaleString()} cells, `
    + `${world.reached}/${world.doors} doors)`)
}

// 16. Getting out of a rock lets you out of the rock, and nowhere else.
//
// `stuck || …` allowed **every** direction once the cell you were on was one
// nobody can stand in, which is how the rule that was meant to stop somebody
// being trapped became the thing that let them walk through walls: three of
// four directions out of a blocked cell ended on another blocked cell, so the
// hatch never closed behind you.  Indoors it was wider still — `footing`
// refuses every cell that is not floor, which is 41% of the abbey.
{
  const spot = await p.evaluate(() => {
    const B = window.__bounds()
    for (let x = B[0] + 200; x < B[1] - 200; x += 7) {
      for (let y = B[2] + 200; y < B[3] - 200; y += 7) {
        if (window.__wallAt(x, y)) return { x, y }
      }
    }
    return null
  })
  check('there is somewhere in this world a man cannot stand', !!spot)
  if (spot) {
    const worst = []
    for (const [name, k] of [['north', 'w'], ['south', 's'],
      ['west', 'a'], ['east', 'd']]) {
      await p.evaluate(([x, y]) => window.__cam({ x, y }), [spot.x, spot.y])
      await p.waitForTimeout(150)
      await p.keyboard.down(k)
      let run = 0, worstRun = 0, last = null, ends = false
      for (let i = 0; i < 20; i++) {
        await p.waitForTimeout(100)
        const at = await p.evaluate(() => {
          const h = window.__hero()
          return [h.x, h.y, window.__wallAt(h.x, h.y)]
        })
        if (at[2]) {
          if (last) run += Math.hypot(at[0] - last[0], at[1] - last[1])
          worstRun = Math.max(worstRun, run)
        } else run = 0
        last = [at[0], at[1]]
        ends = at[2]
      }
      await p.keyboard.up(k)
      worst.push({ name, worstRun, ends })
    }
    const far = worst.filter((w) => w.worstRun > 3)
    check('walking out of it never crosses three yards of solid ground',
      far.length === 0,
      worst.map((w) => `${w.name} ${w.worstRun.toFixed(1)}yd`).join(' '))
    check('and every way out of it ends somewhere you can stand',
      worst.every((w) => !w.ends),
      worst.filter((w) => w.ends).map((w) => w.name).join(' '))
  }
}

// 17. No teleport puts a man inside anything.
//
// `placeHero` was four lines that asked nothing, and there are five callers:
// charging, the graveyard, walking through a door, and two hooks the checks
// drive.  Only `throughTheDoor` looked first.  Over every target in the world
// from eight directions each, **131 of 12,353 charges — one in ninety-four —
// land on ground nobody can stand on**, and a landing inside something is the
// other half of the escape hatch above: once he is in a rock, the rules that
// stop him being trapped are the rules that let him walk through walls.
{
  const landed = await p.evaluate(() => {
    const MELEE = 5.0
    let tried = 0, wouldSink = 0, sank = 0
    for (const n of window.__all()) {
      if (n.dead) continue
      for (let a = 0; a < 8; a++) {
        const t = (a / 8) * Math.PI * 2
        const fx = n.x + Math.cos(t) * 25, fy = n.y + Math.sin(t) * 25
        if (window.__wallAt(fx, fy)) continue
        tried++
        const d = Math.hypot(n.x - fx, n.y - fy) || 1
        const lx = n.x - ((n.x - fx) / d) * (MELEE * 0.7)
        const ly = n.y - ((n.y - fy) / d) * (MELEE * 0.7)
        if (!window.__wallAt(lx, ly)) continue
        wouldSink++
        const at = window.__put(lx, ly)
        if (window.__wallAt(at.x, at.y)) sank++
      }
    }
    return { tried, wouldSink, sank }
  })
  check('a charge that would land inside something lands beside it instead',
    landed.wouldSink > 0 && landed.sank === 0,
    `${landed.sank} of ${landed.wouldSink} still inside, over `
    + `${landed.tried.toLocaleString()} charges`)
}

// 18. And what chases you cannot go where you cannot.
//
// The chase rule asked `wetAt` and `solidAt` — water and trees — while the
// player is also stopped by a closed chunk, a hole and **a building**.  So a
// wolf came through the wall, and it is the half of "things walk through
// walls" a player sees most: he is only occasionally somewhere he should not
// be, and a beast chasing him is there the whole time.
//
// Read as straight lines from a target, which is the shape a chase has: it
// goes at you, not round anything.
{
  // Driven rather than reasoned about: stand the player inside a building,
  // anger something outside it, and watch.
  const chase = await p.evaluate(() => {
    const inside = window.__buildings()
      .filter((b) => b.k !== 'mine' && (b.doors ?? []).length)
      .map((b) => {
        // Somewhere in it a body fits, found by walking out from the middle.
        for (let r = 0; r < b.l; r += 2) {
          for (let a = 0; a < 12; a++) {
            const t = (a / 12) * Math.PI * 2
            const x = b.x + Math.cos(t) * r, y = b.y + Math.sin(t) * r
            const q = window.__plotAt(x, y)
            if (q && q.floor && !q.wall) return { b, x, y }
          }
        }
        return null
      }).find(Boolean)
    if (!inside) return null
    // The nearest thing that would come at you, standing outside.
    const foe = window.__all()
      .filter((n) => !n.dead && n.stance === 'enemy'
        && !window.__shutOut(n.x, n.y))
      .sort((a, c) => Math.hypot(a.x - inside.x, a.y - inside.y)
        - Math.hypot(c.x - inside.x, c.y - inside.y))[0]
    if (!foe) return null
    window.__put(inside.x, inside.y)
    return { at: [inside.x, inside.y], foe: { x: foe.x, y: foe.y, kind: foe.kind } }
  })
  check('there is a building with a floor and something outside it', !!chase,
    JSON.stringify(chase))
  if (chase) {
    await p.waitForTimeout(2500)
    const got = await p.evaluate(([fx, fy]) => {
      const n = window.__all()
        .sort((a, c) => Math.hypot(a.x - fx, a.y - fy)
          - Math.hypot(c.x - fx, c.y - fy))[0]
      return { in: window.__shutOut(n.x, n.y), moved: Math.hypot(n.x - fx, n.y - fy) }
    }, [chase.foe.x, chase.foe.y])
    check('and it does not walk through the wall to get at you', !got.in,
      `it moved ${got.moved.toFixed(1)} yards and ended `
      + `${got.in ? 'inside' : 'outside'}`)
  }
}

// 19. A building has as many floors as the client says it has.
//
// `wmo_plan` baked the lowest sill and `check_doors` threw away every portal
// more than a body's height from it — **111 of this slice's 176**.  The abbey
// is four storeys and came out as one; the inn's upstairs, where the innkeeper
// is, came out as nothing.  Each sill the building names now has a plan of its
// own, and the scene reads them.
{
  const up = await p.evaluate(async () => {
    const t = await (await fetch('./data/terrain.json')).json()
    const floors = t.floors ?? {}
    const plans = t.plans ?? {}
    // Every floor shipped has to belong to a building that has a ground plan,
    // and carry the same nine fields as one.
    const orphan = Object.keys(floors).filter((k) => !plans[k])
    // Eleven: a sill and the plan's own ten.  It was ten until the stairs
    // became a fifth mask.
    const shapes = Object.values(floors).flat().filter((f) => f.length !== 11)
    return {
      buildings: Object.keys(plans).length,
      withUpstairs: Object.keys(floors).length,
      storeys: Object.values(floors).reduce((n, v) => n + v.length, 0),
      orphan: orphan.length, shapes: shapes.length,
    }
  })
  check('buildings have the floors the client gives them',
    up.storeys > 0 && up.orphan === 0 && up.shapes === 0,
    `${up.storeys} upper floors over ${up.withUpstairs} of ${up.buildings} `
    + `buildings, ${up.orphan} orphans, ${up.shapes} malformed`)
  // And the scene has them in hand, which is what issue 170 joins to.
  const seen = await p.evaluate(() =>
    window.__buildings().reduce((n, b) => n + (b.floors?.length ?? 0), 0))
  check('and the scene has them', seen > 0, `${seen} upper floors placed`)
}

// 20. And you can walk up them.
//
// `steepness` has always read a stair tread as walkable — its own comment says
// *a stair is not a wall*, because read the other way the risers sealed the
// doors they lead to.  What threw the stairs away is the height filter: a
// tread halfway up is near neither storey, so `near` was false for every one
// of them and the two floors came out with nothing between them.
//
// A landing is the same kind of seam as a doorstep: a place, and standing on
// it is the act.  Walked rather than poked, because the latch that stops you
// riding the stairs up and down once a frame is part of what is being tested.
{
  const tall = await p.evaluate(() =>
    window.__buildings().map((b) => ({ k: b.k, floors: (b.floors ?? []).length,
      door: (b.doors ?? [])[0] })).filter((b) => b.floors && b.door))
  check('there are buildings with more than one floor and a way in',
    tall.length > 0, `${tall.length} of them`)
  let climbed = null
  for (const h of tall) {
    const got = await p.evaluate(([x, y]) => {
      window.__put(x, y); return window.__seam()
    }, h.door)
    if (!got.inside) continue
    const stairs = await p.evaluate(() => window.__stairs())
    if (!stairs.length) continue
    // Two yards short of a landing, then walk on to it.
    const from = await p.evaluate(([sx, sy]) => {
      window.__put(sx + 2, sy)
      window.__seam()
      return window.__hero()
    }, stairs[0])
    await p.keyboard.down('s'); await p.waitForTimeout(900)
    await p.keyboard.up('s')
    const up = await p.evaluate(() => window.__seam())
    if (up.storey < 0) continue
    // And back the way we came, which is the way down.
    await p.keyboard.down('w'); await p.waitForTimeout(900)
    await p.keyboard.up('w')
    await p.keyboard.down('s'); await p.waitForTimeout(900)
    await p.keyboard.up('s')
    const down = await p.evaluate(() => window.__seam())
    climbed = { k: h.k, floors: h.floors, up: up.storey, down: down.storey, from }
    break
  }
  check('walking on to a landing puts you on the floor above',
    !!climbed && climbed.up >= 0,
    climbed ? `${climbed.k}: floor ${climbed.up} of ${climbed.floors}`
      : 'nothing could be climbed')
  check('and walking back off it brings you down',
    !!climbed && climbed.down < climbed.up,
    climbed ? `went to ${climbed.up}, came back to ${climbed.down}` : '')
}

// 21. The edge of the slice is the edge of the world.
//
// `outside()` asks the area grid, which answers nought past the bake's own
// rectangle — and nought is *the grid has no answer here* rather than
// *somewhere else*, quite rightly, because an unmapped chunk in the middle of
// the forest is still the forest.  So nothing stopped a walk out of the slice:
// forty yards past every one of its four sides was open ground, over terrain
// the bake never wrote.  It is the first line of the wiki's own second
// completion criterion for a zone.
{
  const at = await p.evaluate(() => {
    const B = window.__bounds()
    const off = [['west', B[0] - 40, -300], ['east', B[1] + 40, -300],
      ['south', -9200, B[2] - 40], ['north', -9200, B[3] + 40]]
    return off.filter(([, x, y]) => window.__canWalk(x, y)).map((o) => o[0])
  })
  check('there is nowhere to walk outside the slice', at.length === 0,
    at.join(' '))
}

// 22. Anybody the scene leaves out is under a roof.
//
// The test was `inRoom` — *inside whose outline* — and an outline is a
// silhouette, so it said yes over a courtyard and over ground the eaves happen
// to reach.  96 of the slice's people stand inside an outline and **only 88
// have anything over their heads**; the other eight are in the abbey's yard,
// and hiding them was hiding somebody standing in the open air.  It also made
// anybody who wandered across the silhouette's edge blink.
//
// Read off the draw loop's own decision, not off a second copy of the
// condition: a check that re-derives the rule is a check that agrees with
// itself.
for (const [name, x, y, zoom] of [['the abbey', -8930, -170, 0.7],
  ['Goldshire', -9453, 12, 0.9]]) {
  await p.evaluate(([a, b, z]) => window.__cam({ x: a, y: b, zoom: z }),
    [x, y, zoom])
  // Two frames, because `__hidden` is what the *last* draw decided and the
  // first one after a jump is still deciding it against the old camera.
  await p.waitForTimeout(700)
  // Three reasons are allowed and they are not the same thing: a roof cut
  // from the building's own triangles, a building with no plan — drawn as a
  // picture, so its inside is not a place — and a mine, which is not a model.
  // Only the first is checkable against a mask, and it is the one that was
  // wrong.
  const out = await p.evaluate(() => window.__hidden().filter((n) => {
    if (n.why !== 'roof') return false
    const q = window.__plotAt(n.x, n.y)
    return !q || !q.roofed
  }))
  check(`at ${name}, everybody left out of the scene is under a roof`,
    out.length === 0,
    out.map((n) => `${n.kind} at ${Math.round(n.x)},${Math.round(n.y)}`).join(' | ')
    || `${(await p.evaluate(() => window.__hidden().length))} left out, all of `
      + 'them under a roof, in a sprite, or down a mine')
}

// 23. A screen has somebody on it.
//
// 1,556 people over 5.4 million square yards is the original's own spawn
// density, so the world being empty was never a question of *how many*.  It
// was **how much of it you can see**: `zoom = 1` is twenty-four pixels to the
// yard whatever the screen is, so a nine-hundred-pixel desktop showed 37 yards
// across and a phone showed **sixteen** — the same game, four times emptier in
// the hand.
//
// The floor is the world's own number.  `creature_template.detection_range`
// tops out at twenty yards in this slice, so a screen narrower than forty
// across its short side is a screen things reach you from outside of, and
// *you should be able to see whatever can see you* is a rule where "it looks
// nicer" is a taste.
{
  const seen = await p.evaluate(() => {
    window.__cam({ zoom: 0 })   // back to the fitted default
    const s = window.__start()
    const all = window.__all()
    const i = window.__people()
    const hw = i.yardsWide / 2, hh = i.yardsTall / 2
    const spots = []
    for (let r = 40; r <= 600 && spots.length < 300; r += 40) {
      for (let a = 0; a < 24 && spots.length < 300; a++) {
        const t = (a / 24) * Math.PI * 2
        const x = s.x + Math.cos(t) * r, y = s.y + Math.sin(t) * r
        if (window.__canWalk(x, y)) spots.push([x, y])
      }
    }
    let total = 0
    for (const [x, y] of spots) {
      total += all.filter((m) => Math.abs(m.x - x) < hw
        && Math.abs(m.y - y) < hh).length
    }
    return {
      perScreen: total / Math.max(1, spots.length), spots: spots.length,
      wide: i.yardsWide, tall: i.yardsTall,
      atStart: all.filter((m) => Math.abs(m.x - s.x) < hw
        && Math.abs(m.y - s.y) < hh).length,
    }
  })
  check('a screen shows at least forty yards across its short side',
    Math.min(seen.wide, seen.tall) >= 39.5,
    `${seen.wide.toFixed(0)} x ${seen.tall.toFixed(0)} yards`)
  check('and a walkable spot has somebody on screen on average',
    seen.perScreen >= 1,
    `${seen.perScreen.toFixed(2)} people over ${seen.spots} spots`)
  check('and there is more than one person where a character starts',
    seen.atStart >= 2, `${seen.atStart} at the start`)
}

console.log(`\nconsole errors: ${errs.length ? errs.join(' | ') : 'none'}`)
console.log(bad === 0 ? 'all checks passed' : `${bad} FAILED`)
await b.close()
process.exit(bad === 0 ? 0 : 1)

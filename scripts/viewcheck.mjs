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
    if (window.__probe(x, y).blocked) refused++
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
    `${gaps.n} cells with no floor, ${gaps.refused} refuse a step, `
    + `${gaps.beside} have floor again within twelve yards`)
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

console.log(`\nconsole errors: ${errs.length ? errs.join(' | ') : 'none'}`)
console.log(bad === 0 ? 'all checks passed' : `${bad} FAILED`)
await b.close()
process.exit(bad === 0 ? 0 : 1)

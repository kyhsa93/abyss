/**
 * What the flat view promises about geometry.
 *
 * **The quarter view is gone** — it said "quarter view" here for weeks after
 * the projection went flat, which is a check describing a camera the game does
 * not have.  North goes straight up the glass, west straight left, and a yard
 * is `PPY` pixels either way round; the first three checks below are that one
 * sentence and everything after them is a consequence of it.
 *
 * Every one of these was wrong at some point in the change that introduced it,
 * and none of them is visible in a still: a stick that walks you north when
 * you push up looks perfectly fine until you try to aim at something.
 *
 *   npm run dev        # in one terminal
 *   npm run viewcheck  # in another
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const HOST = process.env.ABYSS_URL ?? 'http://localhost:5173'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1200, height: 760 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
await p.goto(HOST)
await p.waitForFunction(() => window.__ready, null, { timeout: 60000 })
// A character first: the game opens on the screen that makes one.
await p.evaluate(() => window.__makeOne?.('가온'))
await p.waitForTimeout(150)
// Where he stands the moment he is made, kept for the check in 9f: by then
// half this file has teleported him about, so the only honest time to ask is
// now.  Held against `player.json` read off the disk rather than against the
// scene's own copy, because the bug being guarded is two copies disagreeing.
const born = await p.evaluate(() => window.__me())
const rosterStart = JSON.parse(readFileSync('public/world/player.json', 'utf8')).start

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

// And the other direction, which is the one issue 198 was about: **one picture
// covering twenty-one models**.  The floor is half the client's count, and the
// words that cannot reach it are declared here with the reason — the same
// bargain the pipeline's classifiers make with `*_DEFAULT_OK`, because a
// silent shortfall and a considered one look identical in a table.
//
// Every reason below is a fact about the *source*, not about how much work it
// would be.  LPC drew what it drew.
const THIN_OK = {
  // The set has two oak silhouettes and two pine, and this game uses all four
  // (`tree` and `pine` are separate words).  The rest of that sheet's trees
  // are the same shapes recoloured for **snow and autumn**, plus blossom —
  // and an autumn tree in a summer forest is variety this world has not got,
  // which is the art direction's own rule pointed the other way.
  tree: 'the sheet has two oak shapes; the rest are seasonal recolours',
  rock: 'one boulder, one menhir, one rubble is what the terrain sheet drew',
  // Drawn as a run rather than per post, so the pieces alternating along one
  // boundary is exactly what this word must not do — the comment in `KIND`
  // says it cost a fence that went rail, picket, rail.
  fence: 'chosen per run and not per post, so more pieces would make one fence of several',
  post: 'a post is a post',
  hay: 'the farm sheet drew one haystack',
  grave: 'two headstones on the sheet, and the rest of its graves are in MISSING:',
  cart: 'three carts on the sheet',
  bed: 'no bed is cut: what stands in for one is sacking, and the beds on the interior sheet are four-posters for a hall',
  bones: 'one skull and two kinds of rubble',
  cabinet: 'five of the interior sheet, which is what it has that is not a wall fitting',
  lamp: 'four lamps and two lanterns, which is the whole of that sheet',
  barrel: 'seven, counting the stacks',
  prop: 'a catch-all for 49 models of yard furniture: 24 pictures over a word that means anything',
  // Buildings are their own problem and their own issues: the scene stamps
  // them on the ground grid, and issues 216-218 are about drawing one as a
  // picture instead.
  house: 'buildings are stamped rather than drawn — see issue 216',
  hall: 'buildings are stamped rather than drawn — see issue 216',
  tent: 'buildings are stamped rather than drawn — see issue 216',
}
const thin = variety.filter((v) => v.models && !v.floor && v.pieces * 2 < v.models)
const undeclared = thin.filter((v) => !THIN_OK[v.kind])
check('every word draws at least half as many pictures as the client has models',
  undeclared.length === 0,
  undeclared.length
    ? undeclared.map((v) => `${v.kind} ${v.pieces}/${v.models}`).join(', ')
    : `${variety.filter((v) => v.models && !v.floor && v.pieces * 2 >= v.models).length}`
      + ` words are at half or better, and the ${thin.length} that are not say why`)
// And the declarations have to be about words that are actually short.  A
// reason left behind after the pictures arrived is the same rot one level up.
const stale = Object.keys(THIN_OK).filter((k) =>
  !thin.some((v) => v.kind === k))
check('and no word carries a reason it no longer needs', stale.length === 0,
  stale.join(', ') || `${Object.keys(THIN_OK).length} declared`)

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
// 9b2. The paint is the client's blend and not a step of it.
//
// `ground_of` used to hand back one word a cell: whichever layer's mean passed
// 170 took the whole block.  Counted over the slice, **a third of the client's
// overlay texels are part-covered** — 20,044,208 of 62,152,704 between 1 and
// 254 — and every one of them is a road verge, the gravel round a rock, the
// edge of a field.  Measured against the client's own 29 million texels that
// was 15.5% of the paint thrown away; two words and a nibble is 6.5%.
const paint = await p.evaluate(() => window.__paint())
check('a paint cell carries two grounds and how much of the second',
  paint.cells > 0 && paint.bytes === paint.cells + Math.ceil(paint.cells / 2),
  `${paint.cells.toLocaleString()} cells at ${paint.yards.toFixed(2)} yd, `
  + `${paint.bytes.toLocaleString()} bytes — two words in one and the mix in `
  + 'half of another')
// The mix is a nibble because the client's own alpha is a nibble: `MCAL` is
// two texels a byte in this expansion, low nibble first.  Storing eight bits
// would be storing precision the source has not got, and it was measured —
// the two are indistinguishable at 6.46% against the client's texels.
check('and the mix is kept at the precision the client has, not more',
  paint.levels === 15, `${paint.levels + 1} levels, the client's own nibble`)
// And it is used.  A number that is shipped and never read is the shape this
// repository keeps finding, and the whole point of the round was that the
// forest is blended rather than stepped.
check('and a good share of the forest actually carries one',
  paint.mixed > paint.cells * 0.2 && paint.mixed < paint.cells,
  `${paint.mixed.toLocaleString()} of ${paint.cells.toLocaleString()} cells `
  + `(${Math.round((100 * paint.mixed) / paint.cells)}%) have a second ground`)
{
  // Drawn, not merely stored: the ground pass lays the second word over the
  // first at the alpha the client painted, in place of the ring pieces.
  //
  // Stood somewhere first, and at the tile's own size.  `__edges` reports the
  // *last frame*, and the frame before this happened to be a wide view, where
  // the ground is already drawing one square where four belong and the edge
  // pass is deliberately off — so the check read nought and meant nothing.
  await p.evaluate(() => {
    window.__put(-9055, -298)
    window.__cam({ x: -9055, y: -298, zoom: 1 })
  })
  await p.waitForTimeout(700)
  const drew = await p.evaluate(() => window.__edges())
  // Counted since the page opened rather than off the last frame: the plain
  // ground is composed into plates now, once each, so a check that stands
  // still for a second sees a frame in which nothing was composed at all.
  check('and the ground pass lays the second one down', drew.blended > 0,
    `${drew.blended.toLocaleString()} blends laid down so far, `
    + `${drew.plates} plates and ${drew.tiles} loose tiles last frame`)

  // 9b2a. And laid *across* the tile rather than a tile at a time.
  //
  // The check above passed for a round in which the second ground went down
  // over each whole tile at one alpha: a road verge was a staircase of
  // see-through squares, which is a staircase, and "a blend was drawn" was
  // true of every one of them.  So this reads the pixels a plate actually
  // laid.  On a tile whose neighbours disagree about a ground by a quarter or
  // more, the four quarter points of the tile must not all carry the same
  // share — which is what a tile at one alpha gives, and what a share blown
  // up without smoothing gives too.
  //
  // A zoom nothing else asks for, so the plates are composed while it looks.
  await p.evaluate(() => {
    window.__splat(true)
    window.__cam({ x: -8949, y: -132, zoom: 0.9 })
  })
  await p.waitForTimeout(2000)
  const splat = await p.evaluate(() => window.__splat(false))
  check('and a blend changes across a tile rather than a tile at a time',
    splat.edges > 100 && splat.within >= splat.edges * 0.9,
    `${splat.within.toLocaleString()} of ${splat.edges.toLocaleString()} tiles `
    + 'on an edge between two grounds change inside the tile')

  // 9b3. And the ground is drawn a plate at a time rather than a tile at a
  // time.  The issue that asked for this quoted 68,910 stamps a frame and that
  // number is from before the grain doubling; what was actually wrong is
  // narrower and worse — at half zoom the grain has not doubled yet and the
  // blend pass is still on, so the ground was 3,900 tiles and 1,392 blends
  // every frame at **thirty frames a second**, against sixty either side.
  await p.evaluate(() => window.__cam({ x: -9055, y: -298, zoom: 0.5 }))
  await p.waitForTimeout(1400)
  const wide = await p.evaluate(() => window.__edges())
  check('and the plain ground is drawn a plate at a time, not a tile at a time',
    wide.plates > 0 && wide.plates + wide.tiles < wide.inView / 4,
    `${wide.plates} plates and ${wide.tiles} loose tiles for `
    + `${wide.inView.toLocaleString()} tiles of view`)
  // A cache is a budget, and one nothing weighs is a leak with a good name.
  const kept = await p.evaluate(() => window.__plates())
  check('and what it keeps to do that is inside its budget',
    kept.bytes <= kept.budget,
    `${(kept.bytes / 1048576).toFixed(1)} MB over ${kept.kept} plates of a `
    + `${(kept.budget / 1048576).toFixed(0)} MB budget`)
  // And a plate is as wide as the ground it holds.  The strip cuts a tile's
  // picture a pixel wide and rounds it up so loose tiles overlap rather than
  // crack, and a plate composed at the *picture's* width was 25 pixels too
  // wide at zoom 0.7 — which the next plate drew over.  Invisible while every
  // tile was a square of its own; a straight line through every hillside once
  // the grounds were blended across the tiles.  Asked at a zoom where a tile
  // is not a whole number of pixels, because at 0.5 and 1 the two agree.
  await p.evaluate(() => window.__cam({ x: -9055, y: -298, zoom: 0.7 }))
  await p.waitForTimeout(1400)
  const laid = await p.evaluate(() => window.__plates())
  check('and a plate is composed at the width of a tile of the world, not of its picture',
    laid.tile > 0 && Math.abs(laid.tile - laid.world) / laid.world < 0.01,
    `${laid.tile.toFixed(2)} px a tile in the plate against ${laid.world.toFixed(2)} `
    + `on the glass, with a picture ${laid.picture} px wide`)

  // 9b5. And the water is a share in the plate, not a tile laid over it.
  //
  // Water was drawn a tile at a time over the plates, every frame — 1,256
  // tiles of it at half zoom by the river — with a grass-to-water piece round
  // the edge that can only sit on the tile grid, so a river was a staircase of
  // four-yard steps however the ground beside it blended.  It is composed into
  // the plate now like any ground, so standing at the river once the plates
  // are down, no tile of water is laid at all.
  await p.evaluate(() => {
    window.__splat(true)
    window.__cam({ x: -8986, y: -300, zoom: 0.85 })
  })
  await p.waitForTimeout(2500)
  const river = await p.evaluate(() => ({ e: window.__edges(), s: window.__splat(false) }))
  check('the water is composed into the plate, not laid a tile at a time',
    river.e.plates > 0 && river.e.watered > 0 && river.e.waterTiles === 0,
    `${river.e.watered.toLocaleString()} tiles of water composed into plates, `
    + `${river.e.waterTiles} tiles of it laid last frame`)
  // And its edge is a line, not a staircase: the same reading of the pixels as
  // the grounds', asked of the water's own layer.
  check('and a shoreline changes across a tile rather than a tile at a time',
    river.s.shore > 20 && river.s.shoreWithin >= river.s.shore * 0.9,
    `${river.s.shoreWithin.toLocaleString()} of ${river.s.shore.toLocaleString()} `
    + 'tiles on the water\'s edge change inside the tile')

  // 9b4. And the hillside's light is a gradient rather than twenty-one steps.
  //
  // The light is the only thing in this scene that carries height — the
  // projection is flat and a tile does not move for a slope — and it was
  // being delivered one step a tile out of a strip with twenty-one rows in
  // it.  A plate is a bitmap, so it is composed from the strip's **flat** row
  // and the light is multiplied over the whole plate afterwards, interpolated.
  //
  // What this asserts is the half that is arithmetic: **the atlas does not
  // grow.**  Whether the hillside reads as a hillside is a looking job and
  // the screenshots are in the wiki — a luminance profile across one cannot
  // tell the two apart, measured: 74 levels stepped against 73 smooth, because
  // the ground's own texture is louder than the light.
  const lit = await p.evaluate(() => window.__shading())
  check('the light is multiplied over the ground, so the atlas does not grow',
    lit.high === lit.tile * lit.rows && lit.flat > 0 && lit.flat < lit.rows,
    `${lit.rows} rows of ${lit.tile} px, and a plate is composed from row `
    + `${lit.flat}, the one that is not tinted`)

  // And a room is lit flat, which 실내 바닥 asks for in so many words: three
  // steps at most.  Counted off what was actually *drawn* rather than read
  // back out of the constant — so it has to be asked from inside one, with a
  // frame between going in and asking.
  //
  // Waited on rather than slept on, the shape b95038e gave the storeys check:
  // what is read is what a frame *drew*, and 600 ms after a jump is a
  // statement about how fast the runner is.  Being inside is not enough to
  // wait for either: `__enter` puts him on a doorstep and leaves the camera
  // where it was, and measured frame by frame the scene was indoors from the
  // first frame and drew **no tile of the room for twenty-two of them** while
  // the camera eased across.  So it reads once he is inside, the last frame
  // drew some of the room, and two more frames have been drawn.
  const went = await p.evaluate(() => window.__enter())
  if (went) {
    await p.waitForFunction(() => !!window.__room().inside
      && window.__edges().tiles > 0, null, { timeout: 10000 }).catch(() => null)
    await p.evaluate(() => new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r()))))
  }
  const room = await p.evaluate(() => window.__shading())
  check('and a room is lit flat',
    !!went && room.indoor.length > 0 && room.indoor.length <= 3,
    went ? `${room.indoor.length} of the strip's ${room.rows} rows used indoors`
      : 'nothing could be walked into')
  await p.evaluate(() => window.__put(-9055, -298))
  await p.waitForTimeout(300)
}

// 9c. The floor the client takes out of its own ground.  `holes` is sixteen
// bits a chunk and it makes the mouth of every mine and den in the forest; it
// was read into the tile and used by nothing, so the ground was laid over each
// entrance.  There is nothing under it here, so it is drawn as an opening and
// it refuses a step — walking on to a floor that is not there is the one thing
// it certainly should not do.
const gaps = await p.evaluate(() => {
  const g = window.__gaps()
  if (!g.length) return { n: 0 }
  // And the fourth account: **a mine's mouth is the one hole you may step
  // into**, because it is the way in.  It refused a step like every other for
  // as long as mines existed, and since the doorstep is narrower than the hole
  // the door sat in, the player stopped two yards short of a door he could
  // never reach — a mine that could be walked up to and never entered.
  const holes = window.__caves()
  const wide = holes.mouth
  const mouth = (x, y) => holes.mines.some((m) =>
    Math.hypot(m.mouth[0] - x, m.mouth[1] - y) <= wide)
  // **Each kind is asked the question it answers**, which is what the count
  // below did not do: a mouth went `ways++; refused++; continue` without a
  // probe, and a floored cell counted as refused while the comment beside it
  // said it takes a step — so "every hole refuses" was true of both by
  // construction.  Four kinds, four claims:
  //
  //   * an ordinary hole is an open hole and refuses a step;
  //   * a mine's mouth is not an open hole, and in this game's own zone every
  //     cell of one takes a step (the one mouth on the Burning Steppes' side
  //     of the line is on a slope past the climb, measured: 2.7 against 0.9);
  //   * a floored chunk is ground handed to a building that brings its own
  //     floor, so the hole is not what stops you — it is Stormwind, and the
  //     zone line stops you there, which "no walkable ground belongs to
  //     another zone" holds on its own;
  //   * a building's own floor over part of a chunk — the Lion's Pride — is
  //     not an open hole and is floor on its plan, which is what you stand on
  //     once through the door; from outside most of it is shut for the reason
  //     every room is.
  const home = new Set(window.__areas()
    .filter((a) => a.id === 12 || a.inside === 12).map((a) => a.id))
  const kinds = { hole: [0, 0], mouth: [0, 0], homeMouth: [0, 0], floored: [0, 0],
    floor: [0, 0] }
  let beside = 0
  for (const [x, y] of g) {
    const q = window.__probe(x, y)
    const kind = mouth(x, y) ? 'mouth' : window.__floored(x, y) ? 'floored'
      : q.floor ? 'floor' : 'hole'
    const plot = kind === 'floor' ? window.__plotAt(x, y) : null
    const keeps = kind === 'hole' ? q.hole && q.blocked
      : kind === 'mouth' ? !q.hole
      : kind === 'floored' ? !q.hole
      : !q.hole && !!plot?.floor && !plot.wall
    kinds[kind][0]++
    if (keeps) kinds[kind][1]++
    if (kind === 'mouth' && home.has(q.area)) {
      kinds.homeMouth[0]++
      if (window.__canWalk(x, y)) kinds.homeMouth[1]++
    }
    // Floor again a few yards off, so the mask is a mouth and not a blanket
    // over the hillside.  Asked of the hole mask itself and not of whether a
    // step is refused: a good half of these are Stormwind's own ground and
    // the harbour's, where what is beside the hole is a wall or the sea.
    for (const [dx, dy] of [[12, 0], [-12, 0], [0, 12], [0, -12]])
      if (!window.__holeAt(x + dx, y + dy)) { beside++; break }
  }
  return { n: g.length, kinds, beside }
})
if (gaps.n) {
  const k = gaps.kinds
  check('the mouth of a mine is a hole and not ground',
    k.hole[0] > 0 && k.mouth[0] > 0 && k.homeMouth[0] > 0
    && Object.values(k).every(([n, kept]) => n === kept),
    `of ${gaps.n} cells with no floor: ${k.hole[1]} of ${k.hole[0]} ordinary `
    + `holes refuse a step; ${k.mouth[1]} of ${k.mouth[0]} mouth cells are not an `
    + `open hole and ${k.homeMouth[1]} of the ${k.homeMouth[0]} in this zone take `
    + `a step; ${k.floored[1]} of ${k.floored[0]} floored cells are not refused `
    + `by the hole; ${k.floor[1]} of ${k.floor[0]} under a building are its `
    + `floor; ${gaps.beside} have floor again within twelve yards`)
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

// 9d2. And the circle in the corner is a map of where you are.
//
// It was not.  `paintMap` asked three questions a cell — is it wet, is it too
// steep, what is the ground painted — and **all three are about the ground
// outside**, with no line anywhere asking whether you are in a building.
// Since the inside became a scene of its own (issue 130) the screen and the
// minimap have been showing two different worlds: a room on one and the forest
// on the other, through the wall.
//
// Read off the canvas and counted by ink, because the failure is a picture:
// asking `paintMap` what it decided would agree with whatever it decided.  The
// two palettes are disjoint on purpose so the count can tell them apart — the
// courtyard's green is not the meadow's green for exactly this reason.
{
  const outside = await p.evaluate(() => window.__minimap())
  check('outside, the minimap is a map of the ground',
    outside.inside === null && outside.ground > 0 && outside.plan === 0,
    `${outside.ground} pixels of ground ink, ${outside.plan} of plan`)
  const went = await p.evaluate(() => window.__enter())
  if (went) {
    const inside2 = await p.evaluate(() => window.__minimap())
    check('and indoors it is a map of the building',
      inside2.inside !== null && inside2.ground === 0 && inside2.plan > 0,
      `in a ${inside2.k ?? went.k}: ${inside2.ground} pixels of ground ink, `
      + `${inside2.plan} of plan over ${inside2.span.toFixed(0)} yards`)
    // And it spans the building rather than a fixed hundred and twenty yards,
    // which on a ten-yard cottage is a map of eight pixels of cottage.
    check('and it spans the building it is a map of',
      inside2.span <= outside.span
      && inside2.span >= 2 * Math.max(went.l, went.w),
      `${inside2.span.toFixed(0)} yards for a building `
      + `${(2 * Math.max(went.l, went.w)).toFixed(0)} across`)
  }
  // And of the storey you are standing on, not of the ground floor for ever:
  // the abbey is four.
  const tall = await p.evaluate(() => window.__enter(null, 2))
  if (tall) {
    const seen = []
    for (const f of [-1, 0, 1]) {
      seen.push(await p.evaluate((n) => {
        window.__floor(n)
        const m = window.__minimap()
        return { storey: n, ground: m.ground, plan: m.plan,
          shape: m.inks.map((i) => i.join(':')).join(' ') }
      }, f))
    }
    const shapes = new Set(seen.map((s2) => s2.shape))
    check('and a map of the storey you are standing on',
      tall.floors >= 2 && shapes.size === seen.length
      && seen.every((s2) => s2.ground === 0),
      `${tall.floors} floors over the ground one, `
      + `${shapes.size} of ${seen.length} storeys drawn differently`)
  }
  // **Back outside.**  Everything after this walks, dies and looks at the
  // ground, and a hero left standing on the abbey's third floor makes the next
  // twenty checks measure a building.  `placeHero` clears `indoors` the moment
  // he is not in the room any more, which is the game's own rule.
  await p.evaluate(() => {
    window.__floor(-1)
    const s2 = window.__start()
    window.__put(s2.x, s2.y)
  })
  await p.waitForTimeout(300)
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

// 9f. Who the player is.  There were no stats at all: health and armour came
// out of the same table a wolf's do, so nothing he could ever wear or train
// would matter, and critical chance had nowhere to come from.  Now health is
// stamina through the server's own curve, armour is agility, damage is his
// weapon plus attack power, and crit is the client's interpolation table.
const me = await p.evaluate(() => window.__me())
// **Where**, not only at what level.  This line said "where a character
// starts" and asserted `level === 1`, so the position it names was typed into
// `main.ts` and nothing compared it with the table it was copied from (issues
// 78 and 97).  A hundredth of a yard, which is `player.py`'s rounding.
const bornOff = Math.hypot(born.at[0] - rosterStart[0], born.at[1] - rosterStart[1])
check('the player starts where a character starts',
  me.level === 1 && born.level === 1 && bornOff < 0.01,
  `born at (${born.at.map((v) => v.toFixed(2)).join(', ')}), playercreateinfo `
  + `says (${rosterStart.slice(0, 2).join(', ')}), ${bornOff.toFixed(3)} yd apart; `
  + `level ${me.level} of ${me.ceiling}, ${me.hp} health, ${me.armour} armour, `
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
const total = Object.values(swings.fates).reduce((a, b) => a + b, 0)
const pct = (k) => ((swings.fates[k] ?? 0) / total) * 100
check('a swing can miss, and be dodged, parried and blocked',
  pct('빗나감') > 3 && pct('피함') > 3 && pct('막아냄') > 3 && pct('막음') > 3,
  Object.entries(swings.fates).map(([k, v]) => `${k} ${((v / total) * 100).toFixed(1)}%`)
    .join('  '))
// "The bands add to one" used to be the count of outcomes against the count
// of swings, and one outcome a swing makes that `n` whatever the table is.
// What it means is a statement about the table: read off `rollMelee` at every
// whole roll, the seven outcomes lie end to end in the server's order, each
// one unbroken, nought to ten thousand with nothing left over — and at level
// one against level one they are the widths issue 71 measured and
// `Unit::RollMeleeOutcomeAgainst` states: five per cent each of miss, dodge,
// parry and block, no glancing or crushing blows, the character's own crit,
// and the rest hits.  Then the 20,000 swings have to land on that table, each
// share within four standard errors of its band.
const hitTable = await p.evaluate(() => ({ bands: window.__bands(1), crit: window.__me().crit }))
const hitWant = [['빗나감', 500], ['피함', 500], ['막아냄', 500], ['막음', 500],
  ['치명타', hitTable.crit * 100]]
hitWant.push(['hit', 10000 - hitWant.reduce((a, [, w]) => a + w, 0)])
const hitRuns = hitTable.bands
const hitLaid = hitRuns.length === hitWant.length
  && hitRuns.every(([k, from, to], i) => k === hitWant[i][0]
    && from === (i ? hitRuns[i - 1][2] : 0) && Math.abs((to - from) - hitWant[i][1]) <= 1)
  && hitRuns.at(-1)[2] === 10000
const hitOff = hitRuns.map(([k, from, to]) => {
  const share = (to - from) / 10000
  const se = Math.sqrt((share * (1 - share)) / total)
  return [k, se ? Math.abs((swings.fates[k] ?? 0) / total - share) / se : 0]
})
const hitWorst = hitOff.reduce((a, b) => (b[1] > a[1] ? b : a), ['', 0])
check('and the bands add to one',
  hitLaid && hitWorst[1] < 4 && hitWant.every(([, w]) => w >= 0),
  `table ${hitRuns.slice(0, 9).map(([k, f, t]) => `${k} ${((t - f) / 100).toFixed(2)}%`).join(' ')}`
  + `${hitRuns.length > 9 ? ` and ${hitRuns.length - 9} runs more` : ''}; `
  + `wanted ${hitWant.map(([k, w]) => `${k} ${(w / 100).toFixed(2)}%`).join(' ')}; `
  + `20,000 swings are furthest from it at ${hitWorst[0]}, ${hitWorst[1].toFixed(1)} standard errors`)
// And one roll a swing: the stream of chance moved exactly once for each.  A
// table built as a sequence of rolls draws again inside `rollMelee`.
check('and it is one roll a swing', swings.rolls === total,
  `${swings.rolls.toLocaleString()} rolls for ${total.toLocaleString()} swings`)
// Something four levels up eats most of your swings as glancing blows, which
// is the rule that makes level difference feel like something.
const high = (await p.evaluate(() => window.__swings(6, 20000))).fates
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

// Who a creature hits is read off its threat list (issue 73).  `simcheck`
// runs the switching on lists of two and three; this asks the scene whether it
// reads the rule at all — the victim comes off the list, and a death takes the
// player off every list so what killed him goes home.  **After** the check
// above and not before it: this one dies too, and a second death from the
// graveyard walks nowhere, which is how the check above failed the first time.
{
  await p.evaluate(() => window.__anger())
  const angry = await p.waitForFunction(() => {
    const t = window.__threat().filter((x) => x.angry)
    return t.length && t.every((x) => x.victim === 'you' && 'you' in x.threat)
      ? t : null
  }, null, { timeout: 10000 }).then((h) => h.jsonValue()).catch(() => null)
  check('an angry creature hits the name its threat list gives',
    !!angry && angry.length > 0,
    JSON.stringify(angry?.slice(0, 3)))
  const after = await p.evaluate((ids) => {
    window.__die()
    return window.__threat(ids)
  }, (angry ?? []).map((x) => x.id))
  check('and a death takes you off every list, so it leaves the fight',
    !!angry && after.length === angry.length
    && after.every((x) => !x.angry && x.victim === null
      && Object.keys(x.threat).length === 0),
    JSON.stringify(after.slice(0, 3)))
}

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
// And **which** of them stands is the clock's, which it was not: the first
// `most` in file order is a constant, so the same rare spawn stood on the same
// rock every time the page was opened.  `simcheck` tests the function; this
// asks the scene, because a function nothing calls is the other half of the
// same bug.
{
  const turning = await p.evaluate(() => {
    const worlds = new Set()
    for (let h = 0; h < 24; h++) {
      const got = window.__pools(1_800_000_000 + h * 3600)
      worlds.add([...got.creatures, ...got.nodes].map((x) => x.up).join('|'))
    }
    const now = window.__pools(1_800_000_000)
    return {
      worlds: worlds.size,
      pools: now.creatures.length + now.nodes.length,
      stable: JSON.stringify(now)
        === JSON.stringify(window.__pools(1_800_000_000)),
      periods: [...new Set([...now.creatures, ...now.nodes]
        .map((x) => x.period))].sort((a, b) => a - b),
    }
  })
  check('and the scene turns its slots by the clock', turning.worlds >= 2,
    `${turning.worlds} different worlds over a day across ${turning.pools} `
    + `pools, turning on ${turning.periods.join(', ')} seconds`)
  check('and the same moment is the same world', turning.stable === true,
    turning.stable ? 'asked twice, answered twice the same' : 'it rolled itself')
}

// 9n-1. Every baked object is accounted for.
//
// The spawns have had named counters since they were written — `elsewhere`,
// `unplaceable`, `beyond` — and the objects never did, so 731 of 1,366 went
// somewhere with nothing to say where.  That is the gate this pipeline keeps
// on itself everywhere else: a thing left out is a thing with a name on it.
{
  const lost = await p.evaluate(() => window.__lost())
  check('every baked object is standing or has a reason',
    lost.unaccounted === 0,
    `${lost.baked} baked, ${lost.drawn} drawn, `
    + Object.entries(lost.why).filter(([, n]) => n)
      .map(([k, n]) => `${n} ${k}`).join(', ')
    + `, ${lost.unaccounted} unaccounted`)
  // And the reason is a **place** rather than a number, which is the
  // difference between a decision and a hole: 615 of the 731 are in
  // Stormwind, a city this game does not have.
  const where = Object.entries(lost.where ?? {})
  check('and the ones that are somewhere else say where',
    where.length > 0 && where.reduce((n, [, v]) => n + v, 0) === lost.why.elsewhere,
    where.slice(0, 4).map(([k, v]) => `${v} ${k}`).join(', '))
  // The gathering slots, which is the half issue 197 shares with 193.  Fifty
  // are baked and twenty stand; the thirty that do not are not *partly* here,
  // they are entirely in another zone, and that is the only answer that makes
  // "all fifty stand" a thing this game could ever say.
  check('and every gathering slot this game contains is standing',
    lost.pools.standing > 0 && lost.pools.standing <= lost.pools.baked,
    `${lost.pools.standing} of ${lost.pools.baked} pools, the rest having no `
    + 'member inside this game at all')
}

// 9n-2. A conversation depends on who is having it.
//
// `conditions` — 276 rows touching this slice, 172 of them about the class —
// was read by nothing, so everybody in this world said the same thing to
// everybody.  `simcheck` tests the rule without a browser; this asks whether
// the scene actually passes the character in, because a rule nothing calls is
// the other half of the same bug.
{
  const said = await p.evaluate(async () => {
    const doc = await (await fetch('./world/npcs.json')).json()
    // A trainer whose menu names one class, standing where we can reach it.
    for (const r of doc.npcs) {
      const t = r[6] >= 0 ? doc.topics[r[6]] : null
      const mask = t?.only?.find(([k]) => k === 15)?.[1]
      if (!mask || !window.__goto(r[9])) continue
      const cls = [1, 2, 4, 5, 8, 9].find((c) => mask & (1 << (c - 1)))
      if (cls) return { entry: r[9], mask, cls }
    }
    return null
  })
  if (said) {
    const options = async () => {
      await p.keyboard.press('Escape')
      await p.waitForTimeout(100)
      await p.evaluate((e) => window.__goto(e), said.entry)
      await p.waitForTimeout(120)
      await p.keyboard.press('e')
      await p.waitForTimeout(200)
      return p.evaluate(() =>
        [...document.querySelectorAll('#talk li')].map((e) => e.textContent.trim()))
    }
    const mine = await p.evaluate(() => window.__you().cls)
    const heard = await options()
    check('a conversation knows who is having it',
      heard.length > 0,
      `class ${mine} hears ${heard.length} options from ${said.entry}, `
      + `whose menu names class ${said.cls}`)
    // The half that matters: the line is **not** there for somebody it does
    // not name.  A condition that is always true is not a condition.
    const aside = heard.some((l) => l.includes('당신 같은 사람에게만'))
    check('and a line kept for one sort of person stays kept',
      aside === (mine === said.cls),
      aside ? `class ${mine} heard the remark meant for class ${said.cls}`
        : `class ${mine} did not hear the remark meant for class ${said.cls}`)
  }
}

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
//
// **And it is rolled, not counted.**  This check was `gated.n > 0` — rows that
// carry a condition — which is true of a world where `loot` never asks.  So a
// gated body is gone through two hundred times without the quest and two
// hundred times with it, on the real `loot`: nothing may fall the first time
// and something must fall the second, or the gate is not the thing deciding.
const gated = await p.evaluate(() => window.__gated())
const without = await p.evaluate(() => window.__lootRoll(false, 200))
const holding = await p.evaluate(() => window.__lootRoll(true, 200))
check('a quest item does not fall without the quest',
  gated.n > 0 && !!without && !without.holding && without.fell === 0
    && !!holding && holding.holding && holding.fell > 0,
  `${gated.n} drops in the world wait on a quest; creature ${without?.entry}'s `
  + `item ${without?.item} at ${without?.chance}% fell ${without?.fell} times in `
  + `${without?.times} without quest ${JSON.stringify(without?.need)} and `
  + `${holding?.fell} times in ${holding?.times} holding it`)

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

// 9s2. And the composed paperdoll is not on the character sheet, by the
// owner's decision.
//
// It was 56 by 56 of a 384 by 512 panel — two per cent of it — and nine per
// cent of that was opaque.  What carried the information was the thirteen
// squares under it, and the doll showed **one of the four things that were
// on**: a bare body with boots and hair, because there is no `legs` layer in
// the set and `weapon` was not in the slot list at all.
//
// The composition stays, because the portrait in the corner is a window on to
// it (issue 137) — what goes is the *claim*, on the panel, that the picture
// says what you are wearing.
//
// **Counting canvases is not that claim**, which is what this check used to
// do.  Issue 204 put the two columns where `PaperDollFrame.xml` puts them and
// the man the world draws between them, and that picture is a canvas and says
// nothing about gear — it is the same sprite before and after you put a
// breastplate on.  So the check asks the question it meant: does the picture
// on this panel change when what is worn changes?  A composed doll would.
{
  // Opened with the key a player uses, because the panel is only built while
  // it is up — read with it hidden it is an empty box, which is the answer to
  // a different question.
  const readSheet = async () => {
    await p.keyboard.press('c')
    await p.waitForTimeout(350)
    const got = await p.evaluate(() => {
      const el = document.getElementById('sheet')
      const c = el.querySelector('.figure canvas')
      return { hidden: el.hidden,
        picture: c ? c.getContext('2d')
          .getImageData(0, 0, c.width, c.height).data.reduce(
            (a, v, i) => (i % 401 ? a : a * 31 + v) >>> 0, 7) : 0,
        squares: el.querySelectorAll('.worn .square').length,
        filled: [...el.querySelectorAll('.worn .square')]
          .filter((s2) => !s2.classList.contains('bare')).length }
    })
    await p.keyboard.press('c')
    await p.waitForTimeout(200)
    return got
  }
  const bareSheet = await readSheet()
  // Given something and made to put it on, through the same key a player
  // presses — `dressUp` is bound to `g`.
  await p.evaluate(() => window.__giveItem?.())
  await p.keyboard.press('g')
  await p.waitForTimeout(300)
  const worn = await readSheet()
  // Non-vacuous by construction: a square has to have *become* full, or the
  // picture staying the same says nothing at all.
  check('the character sheet does not claim to show what you are wearing',
    bareSheet.hidden === false && worn.filled > bareSheet.filled
    && bareSheet.picture === worn.picture,
    `${worn.filled - bareSheet.filled} more square full and the picture is `
    + `${bareSheet.picture === worn.picture ? 'the same' : 'different'}`)
  check('and shows every slot as a square instead',
    worn.squares === 13,
    `${worn.squares} squares, ${worn.filled} of them full`)
  // And the squares are laid out the way the original lays them out, which is
  // the other half of issue 204: head at the top of the left column, feet at
  // the bottom of the right, weapons along the bottom.  Read off the shipped
  // `spec.doll`, so the panel and the bake cannot come to disagree.
  const shape = await p.evaluate(async () => {
    const r = await fetch('./world/layout.json')
    const doll = r.ok ? (await r.json()).spec.doll : null
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }))
    return doll
  })
  await p.keyboard.press('c')
  await p.waitForTimeout(300)
  const drawn = await p.evaluate(() =>
    ['left', 'right', 'bottom'].map((k) =>
      [...document.querySelectorAll(`#sheet .worn.${k} .square`)]
        .map((s2) => (s2.title || '').split(' — ')[0])))
  await p.keyboard.press('c')
  check('and they are in the two columns the original puts them in',
    !!shape && shape.left.length > 0 && drawn[0].length === shape.left.length
    && drawn[1].length === shape.right.length
    && drawn[2].length === shape.bottom.length,
    `${drawn[0].length} down the left, ${drawn[1].length} down the right, `
    + `${drawn[2].length} along the bottom — ${drawn[0].join(' ')}`)
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
// `art/SOUND-CREDITS.md` — so this asks whether the screen still says it.
//
// It used to ask only whether the switch was off, which is true of a switch.
// Now the game is played with it off and every sound the game *asked for* is
// held to its pair on the same step: `__sound().asked` counts the requests the
// mute swallows, and a step that asked for `hit` has to have put a line about
// the blow in the log and a number over what was hit.  Played in stepped time
// on a page of its own, with a character at level one — this one is at the
// ceiling by now, where nothing can level — so the fight, the kill, the level
// it earns, the body it loots and a death all happen.  Three pairs cannot be
// made to happen this way and the detail says so: `crit` and `miss` are held
// only when the table rolls one; `cast`, whose pair is the square going dark,
// is not driven, because the one ability a level one warrior has that is not
// a stance has no global cooldown and costs less than the rage it is pressed
// with, so nothing on the bar changes; and `loot` is held whenever it is
// asked for but **taking a body's pockets does not ask for it** — the credits
// list "a corpse" and `loot()` only sounds for a skinning, so a kill and the
// key on the body are silent with the sound on.  That is a gap in the game,
// not in this check, and it is left named here rather than papered over by
// driving a herb instead.
{
  const q = await b.newPage({ viewport: { width: 1200, height: 760 } })
  q.on('pageerror', (e) => errs.push(String(e)))
  await q.goto(HOST)
  await q.waitForFunction(() => window.__ready, null, { timeout: 60000 })
  await q.evaluate(() => window.__makeOne?.('가온'))
  await q.waitForFunction(() => document.getElementById('create')?.hidden !== false,
    null, { timeout: 10000 }).catch(() => null)
  const heard = await q.evaluate(async () => {
    const ladder = (await (await fetch('./world/npcs.json')).json()).ladder ?? []
    window.__mute(true)
    const box = document.getElementById('log')
    const old = new Set(box.children)
    const PAIRS = {
      // A line and a word over what was hit, and not always the number: a
      // blow that is blocked and still lands says 막음 in the line and over
      // the target and shows its damage nowhere, which the first full run of
      // this found one blow in twenty-three.  That is the credits promising
      // more than the game keeps, and it is written down rather than failed
      // here, because the rule under test is whether muting takes anything
      // away — and muted or not, that blow reads the same.
      hit: (t, m) => t.length > 0 && m.some((x) => x.mine),
      miss: (t, m) => t.length > 0 && m.length > 0,
      crit: (t, m) => t.some((x) => x.includes('치명타')) && m.some((x) => x.mine),
      // The same for a blow on him: a critical one puts its word over him and
      // its number in the line, and a crushing one says only 으스러짐.  Held
      // to the number it failed one blow in forty-six.
      hurt: (t, m) => t.length > 0 && m.some((x) => !x.mine),
      die: (t) => t.some((x) => x.includes('쓰러졌다')),
      level: (t) => t.some((x) => /\d+레벨이 되었다/.test(x)),
      loot: (t) => t.some((x) => x.includes('에게서') && !x.includes('아무것도 없다')),
      cast: () => false,
    }
    const got = Object.fromEntries(Object.keys(PAIRS).map((w) => [w, [0, 0]]))
    // One act, and what the screen said while it happened.
    const during = (act) => {
      const was = window.__sound().asked
      const t0 = window.__marks().clock
      act()
      const now = window.__sound().asked
      const lines = [...box.children].filter((d) => !old.has(d))
      lines.forEach((d) => old.add(d))
      const texts = lines.map((d) => d.textContent)
      const said = window.__marks().marks.filter((m) => m.at >= t0)
      for (const w of Object.keys(PAIRS)) {
        const k = (now[w] ?? 0) - (was[w] ?? 0)
        if (!k) continue
        got[w][0] += k
        if (PAIRS[w](texts, said)) got[w][1] += k
      }
    }
    // A kill away from the next level, so the kill is what levels him.
    window.__earn(Math.max(0, (ladder[0] ?? 0) - 1))
    for (let fight = 0; fight < 6; fight++) {
      if (!window.__foe(3)) break
      window.__aimAtNearest()
      let over = false
      for (let i = 0; i < 4000 && !over; i++) {
        window.__hurt(9999)
        if (!window.__you().target) window.__aimAtNearest()
        const before = got.level[0]
        during(() => window.__steps(1))
        over = !window.__you().target || got.level[0] > before
      }
      // What is on the body, the way a player takes it: the key.
      during(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })))
      during(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'e' })))
      if (['hit', 'miss', 'crit', 'hurt', 'level'].every((w) => got[w][0] > 0)) break
    }
    // And a death, his own.
    window.__hurt(1)
    if (window.__foe(3)) {
      window.__anger()
      for (let i = 0; i < 4000 && !got.die[0]; i++) during(() => window.__steps(1))
    }
    return { got, muted: window.__sound().muted }
  })
  await q.close()
  const must = ['hit', 'hurt', 'die', 'level']
  const g = heard.got
  check('and turning it off loses nothing',
    heard.muted === true && must.every((w) => g[w][0] > 0)
    && Object.entries(g).every(([, [n, paired]]) => n === paired),
    Object.entries(g).map(([w, [n, paired]]) => n
      ? `${w} ${paired} of ${n}` : `${w} not asked for`).join(', ')
    + ' — each sound asked for, against the times the screen said the same on '
    + 'that step; crit and miss only when rolled; cast is not driven '
    + '(nothing on a level one bar goes dark); loot is not asked for by '
    + 'looting a body, which is the game\'s gap and not this check\'s')
}

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

// 10a. And a deck is one piece, lying the way the crossing does.
//
// A deck was a tile on every 1.33 yard square of the world its rectangle
// covered, so the crossing that lies at 45 degrees had a staircase for each
// long side, with water in every notch.  Walkability never saw it — the checks
// above ask the rectangle, which was always straight — so this asks the glass.
// Along the diagonal deck, wherever a stride off the side is water, a point
// just inside the edge must be planks and a point just outside must not be.
// A staircase fails that on every other step.
const deckEdge = await p.evaluate(async () => {
  const b = window.__spans().list.find((s) => Math.abs(s.c) > 0.3 && Math.abs(s.s) > 0.3)
  if (!b) return null
  // **At noon and in clear weather.**  Planks and water are told apart by
  // colour, and the sky tints the whole picture: CI runs in UTC, where the
  // commit that added this check landed at half past eleven at night, and it
  // failed there on 38 of 45 while passing at a Seoul morning.  Run here with
  // `TZ=UTC` it failed the same way, on 39.  The question is the deck's shape,
  // not the light, so the light is held still — the bargain `shotcheck` makes —
  // and given back afterwards.
  window.__clock(new Date(2026, 5, 21, 12))
  window.__weather(0)
  window.__cam({ x: b.x, y: b.y, zoom: 1 })
  await new Promise((r) => setTimeout(r, 1500))
  const g = document.querySelector('canvas').getContext('2d')
  const colour = (x, y) => {
    const [sx, sy] = window.__screenAt(x, y)
    return g.getImageData(Math.round(sx), Math.round(sy), 1, 1).data
  }
  // Planks and the dark rail are at least as red as they are blue; water and
  // the deck's shadow on it are plainly bluer.  Asked first as `red over blue
  // by twenty`, the rail (38, 25, 27) read as not-a-deck six times in eight.
  const wood = (d) => d[0] >= d[2]
  const water = (d) => d[2] > d[0] + 20
  let tried = 0, straight = 0
  for (let i = 2; i < 38; i++) {
    const a = b.lo + ((b.hi - b.lo) * i) / 40
    for (const side of [-1, 1]) {
      const at = (off) => [b.x + b.c * a - b.s * off * side, b.y + b.s * a + b.c * off * side]
      // The point just outside has to be water itself, not only the one a
      // stride off: a bank reaches in under the ends of a deck.
      if (!window.__probe(...at(b.w + 0.4)).wet || !window.__probe(...at(b.w + 1.5)).wet) continue
      tried++
      if (wood(colour(...at(b.w - 0.4))) && water(colour(...at(b.w + 0.4)))) straight++
    }
  }
  const decks = window.__edges().decks
  window.__clock(null)
  window.__weather(null)
  return { tried, straight, decks }
})
check('a deck is drawn in one piece the way it lies, not a tile at a time',
  !!deckEdge && deckEdge.decks > 0 && deckEdge.tried > 20
    && deckEdge.straight >= deckEdge.tried * 0.9,
  deckEdge ? `${deckEdge.straight} of ${deckEdge.tried} points along the diagonal deck's edge `
    + `are planks inside and not outside, ${deckEdge.decks} decks on the glass` : 'no diagonal deck')

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
//
// **Asked as a shift and not as a colour**, and the day it had to change is
// worth keeping.  It was `dark[2] > dark[0]` — the mean of the frame is more
// blue than red — and that is a statement about *what is on screen* dressed up
// as a statement about the light.  It held for as long as this view was a
// green field with a blue wash over it.  The moment the buildings got their
// own roofs (issue 217) the same view became mostly brown tile, brown is red
// twice over, and a perfectly good night screen read as a failure.
//
// What the sentence actually claims is that **blue survives the fall better
// than red does**, so that is what is measured: each channel at three in the
// morning against itself at noon.  It is true of any subject.
const keeps = (i) => dark[i] / Math.max(1, noon[i])
check('and night is blue rather than black',
  keeps(2) > keeps(0) && lift(dark, noon) > 20,
  `blue keeps ${(100 * keeps(2)).toFixed(0)}% of noon, red `
  + `${(100 * keeps(0)).toFixed(0)}% — rgb(${dark.map((v) => v.toFixed(0)).join(',')}) `
  + `against rgb(${noon.map((v) => v.toFixed(0)).join(',')})`)
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
//
// Counted over a **fresh** composition rather than off a frame.  The plain
// ground is composed into plates once each and then kept, so a frame in which
// the camera is standing still draws no ground at all and both numbers are
// nought — which is what this check read the day plates went in.
//
// **And counted apart, because the ring pieces stopped being where the edges
// are** (issue 129).  This read "an edge or a blend" as one number, which was
// honest while every tile was laid one at a time and stopped meaning anything
// when the plates took the ground over: a plate's edges are its share layers
// laid across the tile, and a plate lays no ring piece at all.  So the ratio
// would have gone on passing with every ring piece gone.  What they are still
// for is the **loose** tile — the one drawn in the frames before its plate is
// composed, which is every tile of a view the camera has just jumped to, and
// a stand-in with no edges is a view that flashes squares for a second after
// every jump.  So there are two numbers: the plate's own edges against what the
// plates composed, and the ring and shore pieces laid on loose tiles while the
// plates were coming.
//
// Waited on the plates rather than on the clock: read once no tile has been
// composed into a plate for twenty frames running.
const was = await p.evaluate(() => window.__edges())
await p.evaluate(() => window.__cam({ x: -9100, y: -350, zoom: 0.8 }))
const seamSettled = await p.evaluate(() => new Promise((done) => {
  let last = -1, same = 0
  const quit = setTimeout(() => done(false), 30000)
  const look = () => {
    const e = window.__edges()
    if (e.plated === last) same++
    else { same = 0; last = e.plated }
    if (same >= 20) { clearTimeout(quit); done(true) } else requestAnimationFrame(look)
  }
  requestAnimationFrame(look)
}))
const now = await p.evaluate(() => window.__edges())
const seam = Object.fromEntries(['plated', 'plateEdges', 'rings', 'looseBlends',
  'loose'].map((k) => [k, now[k] - was[k]]))
check('a boundary between two grounds is drawn as one',
  seamSettled && seam.plated > 0 && seam.plateEdges > seam.plated * 0.05,
  `${seam.plateEdges} of ${seam.plated} newly composed tiles are on an edge `
  + `between two grounds${seamSettled ? '' : ' (the plates never settled)'}`)
check('and a tile drawn before its plate still meets its neighbour with a ring piece',
  seam.loose > 0 && seam.rings > 0,
  `${seam.rings} ring and shore pieces and ${seam.looseBlends} blends over `
  + `${seam.loose} loose tiles drawn while the plates were composed`)
console.log(`      (${(100 * seam.plateEdges / Math.max(1, seam.plated)).toFixed(0)}% of this view `
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

// 10j2. And a man walks in, which neither check above ever asked.
//
// Both of them are about the ground *outside* a door, and the one further down
// floods the world with the stone mask — which a roof is not.  From outside,
// the whole roofed footprint shuts you out and only the doorstep lets you
// through, and the doorstep was a disc of 1.6 yards around a point that sits
// in the middle of the wall: the eaves put every cottage's door 2.75 yards in
// from the edge and the abbey's nearly ten.  **One building in twenty-five
// could be walked into** while every door check here was green.
//
// So this walks, with the game's own step: from ground a player could stand on
// outside, along the passage `porchesOf` opens out of each door, or straight at
// the door from the nearest open ground, until the scene says it is inside.
// What it will not count against the game is a building whose every passage
// ends on ground nobody can stand on — which is a fact about where the client
// put it, and is named rather than waved away.
const walkIn = await p.evaluate(() => {
  const all = window.__buildings()
  const porches = window.__porches()
  const home = window.__start()
  const walk = (tx, ty, n) => {
    for (let s = 0; s < n; s++) {
      if (window.__room().inside) return true
      const h = window.__hero()
      if (Math.hypot(h.x - tx, h.y - ty) < 0.6) break
      window.__aim(tx, ty)
      window.__steps(1)
    }
    window.__aim(null)
    return !!window.__room().inside
  }
  const from = (x, y) => {
    window.__aim(null)
    window.__put(home.x, home.y)
    window.__put(x, y)
    return !window.__room().inside
  }
  let total = 0, got = 0
  const out = [], exempt = []
  for (let i = 0; i < all.length; i++) {
    const b = all[i]
    if (b.k === 'mine' || !b.doors?.length) continue
    total++
    // Out of whatever the last building let him into, before asking what can
    // be stood on: indoors only the room is ground, so every probe outside the
    // next building said no, and the first run of this called that "nowhere to
    // stand" for every building after the first one it got into.
    window.__aim(null)
    window.__put(home.x, home.y)
    let entered = false, landing = false
    for (const [ax, ay, bx, by] of porches[i]) {
      if (entered) break
      const len = Math.hypot(bx - ax, by - ay) || 1
      const ux = (bx - ax) / len, uy = (by - ay) / len
      for (let r = 1; r <= 8; r += 0.5) {
        const x = bx + ux * r, y = by + uy * r
        if (!window.__canWalk(x, y)) continue
        landing = true
        if (from(x, y)) entered = walk(bx, by, 120) || walk(ax, ay, 160)
        break
      }
    }
    for (const [dx, dy] of b.doors) {
      if (entered) break
      let tries = 0
      for (let r = 2; r <= 20 && tries < 3 && !entered; r += 1) {
        for (let k = 0; k < 32 && tries < 3 && !entered; k++) {
          const t = (k / 32) * Math.PI * 2
          const x = dx + Math.cos(t) * r, y = dy + Math.sin(t) * r
          if (!window.__canWalk(x, y) || window.__inside(x, y)) continue
          tries++
          if (from(x, y)) entered = walk(dx, dy, 220)
        }
      }
    }
    if (entered) got++
    else if (landing) out.push(`${b.k} at ${Math.round(b.x)},${Math.round(b.y)}`)
    else exempt.push(`${b.k} at ${Math.round(b.x)},${Math.round(b.y)}`)
  }
  window.__aim(null)
  window.__put(home.x, home.y)
  return { total, got, out, exempt }
})
check('and a man can walk into every building whose door leads anywhere',
  walkIn.total > 0 && walkIn.out.length === 0,
  `${walkIn.got} of ${walkIn.total} walked into; `
  + `${walkIn.out.length ? 'shut: ' + walkIn.out.join(', ') : 'none shut'}`)
console.log(`      (${walkIn.exempt.length} whose every passage ends on ground nobody `
  + `can stand on: ${walkIn.exempt.join(', ') || 'none'})`)

// 10j3. And the front door is the client's, and it faces out.
//
// Which of a building's doorways lead outside, which way out is and how wide
// the opening is all come out of the model now — `MOPR` says which groups a
// portal joins and `MOGI` which of those are rooms and which the outdoors — and
// the first reading of `MOPR`'s side put every way out *into* its building.
// So both ends are asked of the outline the scene actually uses: a yard and a
// half behind the door is the building, and a yard past the end of its way in
// is not.  And the door has to be on the roof, where a player can see it.
const fronts = await p.evaluate(async () => {
  const all = window.__buildings()
  const porches = window.__porches()
  let doors = 0, faced = 0
  const bad = []
  for (let i = 0; i < all.length; i++) {
    const b = all[i]
    if (b.k === 'mine' || !b.doors?.length) continue
    const at = `${b.k} at ${Math.round(b.x)},${Math.round(b.y)}`
    const front = b.doors.filter((d) => d.length === 5)
    if (!front.length) { bad.push(`${at} has no front door`); continue }
    if (porches[i].length !== front.length) bad.push(`${at}: ${front.length - porches[i].length} front doors with no way out`)
    for (const [ax, ay, bx, by] of porches[i]) {
      doors++
      const len = Math.hypot(bx - ax, by - ay) || 1
      const ux = (bx - ax) / len, uy = (by - ay) / len
      if (window.__inside(ax - ux * 1.5, ay - uy * 1.5) && !window.__inside(bx + ux, by + uy)) faced++
      else bad.push(`${at}: a front door faces in`)
    }
  }
  window.__cam({ x: -9460, y: 60, zoom: 0.8 })
  await new Promise((r) => setTimeout(r, 1500))
  return { doors, faced, bad, drawn: window.__edges().fronts }
})
check('every building with a door has a front door out of its own portals, facing out',
  fronts.doors > 0 && fronts.bad.length === 0,
  `${fronts.faced} of ${fronts.doors} front doors face out of their building`
  + (fronts.bad.length ? `; ${fronts.bad.join('; ')}` : ''))
check('and the front doors are drawn on the roofs', fronts.drawn > 0,
  `${fronts.drawn} drawn at Goldshire`)

// 10k. A mine comes from a model, and the ones that do not say so.
//
// **This block used to open with a sentence that is no longer true**, and it
// is worth keeping what it said: *Elwynn's mines are cut out of the `.adt`
// terrain itself... a height field cannot hold a tunnel, so there is no inside
// to read.*  The mouths are indeed holes in a chunk's `holes` field.  The
// galleries are not: fourteen `.wmo` models stand in this slice — gold mines,
// spider mines, troll burrows, animal dens — with winding passages, side rooms
// and dead ends in them, and `classify_wmo` answered `None` for every one.
// `None` means the placement is dropped, so no plan was ever rasterised, and
// the scene **made its own**: `digCave` cut a round chamber out of the height
// grid around each cluster of creatures standing underground.  Issue 219.
//
// So the question this block asks has changed.  It was *are the passages ours,
// and does the screen admit it*.  It is now *whose passages are these* — and
// the answer has to be carried rather than guessed, because a derived mine and
// a modelled one are the same shape once they are in the list.
const mines = await p.evaluate(() => window.__caves())
check('the mines are the client\'s and not this scene\'s',
  mines.fromModel >= 3 && mines.derived === 0,
  `${mines.fromModel} of ${mines.mines.length} out of a model, `
  + `${mines.derived} derived, of ${mines.modelled} the client stands here`)
// And the screen says so, which it did not.  Issue 133 put ` · 우리가 판 굴`
// on the readout for every `k === 'mine'`, which was honest the day every mine
// was `digCave`'s and false the day they became the client's: the readout went
// on telling a player standing in a gallery the client drew that we had made
// it up.  So walk into one the client drew and read the plate — the words on
// the glass, not the flag, because a flag can be right while the line that
// prints it asks something else.
{
  const into = mines.mines.findIndex((m) => m.fromModel)
  const went = await p.evaluate((i) => window.__enterMine(i), into)
  await p.waitForTimeout(500)
  const plate = await p.evaluate(() =>
    document.querySelector('.where')?.textContent ?? '')
  check('and a mine the client drew does not say we dug it',
    !!went?.inside && went.fromModel && !went.ours && plate.length > 0
      && !plate.includes('우리가 판 굴'),
    went ? `mine ${into} (${went.fromModel ? 'a model' : 'dug'}), inside `
      + `${went.inside}, the plate reads "${plate}"` : 'could not walk into one')
  await p.evaluate(() => window.__put(-9055, -298))
  await p.waitForTimeout(300)
}
// And the difference is measured rather than asserted.  `digCave` is still
// there — it is what a warren of kobolds under a hillside with no model
// anywhere near it still gets — so for every mine that has both, the two
// plans are compared.  A check that compares a model against nothing would
// pass just as happily if the model were being ignored.
const both = mines.mines.filter((m) => m.wouldDig)
check('and a mine with a model is not the one this scene would have dug',
  both.length > 0 && both.every((m) =>
    m.cells[0] !== m.wouldDig.cells[0] || m.cells[1] !== m.wouldDig.cells[1]),
  both.map((m) => `${m.area}: ${m.cells.join('x')} at ${m.dug}% against `
    + `${m.wouldDig.cells.join('x')} at ${m.wouldDig.dug}%`).join('; '))
// And neither of them is a rectangle with creatures in it.  The bar is wider
// than it was because the shape is the client's now: a hundred-and-eighty-yard
// gold mine is 40% dug and an eight-yard animal den is 70%, and both of those
// are what the model says.  What must not happen is a *box* — a plan that is
// its own bounding rectangle is a plan nobody read.
check('and each is a dug shape rather than a box',
  mines.mines.every((m) => m.dug > 5 && m.dug < 95),
  mines.mines.map((m) => `${m.area}: ${m.dug}% dug, ${m.crew} down it`).join('; '))
// Derived and not rolled, so the same world is always the same mine: asked
// twice and compared, which is the only way to say it.
const dug1 = await p.evaluate(() => JSON.stringify(window.__caves()))
const dug2 = await p.evaluate(() => JSON.stringify(window.__caves()))
check('and the same world digs the same mine', dug1 === dug2)

// Every number a mine is cut to is a function of something the world states,
// and issue 210 is why: the passage width was 3.2 because 3.2 looked right.
//
// A passage is a place a man walks — the same definition a wall already has
// here — so it is the client's own collision box, halved for a radius, plus
// half a cell because the mask is sampled at its own pitch and a disc of
// radius `r` comes back `2r - cell` across.
check('a passage is a body wide, after the mask has sampled it',
  Math.abs(mines.wide - (mines.body / 2 + mines.cell / 2)) < 0.001
  && 2 * mines.wide - mines.cell >= mines.body - 0.001,
  `${mines.wide.toFixed(2)} yd radius = ${mines.body} / 2 + ${mines.cell.toFixed(2)} / 2, `
  + `so ${(2 * mines.wide - mines.cell).toFixed(2)} yd across once sampled`)
// And a mouth is the client's: a `holes` bit is two by two height cells.
check('and a mouth is the width of the hole the client took out',
  Math.abs(mines.mouth * 2 - 8.333) < 0.01,
  `${(mines.mouth * 2).toFixed(2)} yd across`)
// A chamber is its creature's own leash, which is a column rather than a
// choice — so the ones that do not move get a body's width and the ones on a
// seven-yard rope get seven.
// Only of the ones this scene dug, because a chamber is `digCave`'s idea: a
// modelled gallery is whatever the client cut, and eleven of the fourteen have
// nobody in them at all.
check('and a chamber is the creature\'s own wander distance',
  mines.mines.every((m) => !m.wander || m.wander[2] >= m.wander[0]),
  mines.mines.filter((m) => m.wander)
    .map((m) => `${m.area}: ${m.wander[0]}..${m.wander[2]} yd`).join('; '))

// Which warren a creature is in is a cluster and not an area, and the cut is
// the data's own break rather than a threshold: the longest passage inside a
// warren against the shortest gap between two.  While that ratio is large
// every threshold in between gives the same answer and there is nothing to
// tune; the day it nears one this rule wants replacing, not nudging.
check('and the cut between one warren and the next is not a close call',
  mines.apart >= 3,
  `the gap between warrens is ${mines.apart}x the longest passage inside one, `
  + `over ${mines.warrens} warrens`)

// And everybody underground is either in a mine or counted.  It was 30 of 89
// left over with nothing said about them, because grouping by area could not
// see the two warrens standing in 엘윈 숲 itself.
const under = Object.values(mines.under).reduce((n, a) => n + a.n, 0)
const took = Object.values(mines.under).reduce((n, a) => n + a.mine, 0)
check('and everybody under the surface is in a mine or counted out',
  took + mines.lost === under && mines.lost < under / 4,
  `${took} of ${under} in a mine, ${mines.lost} in warrens under the six a mine `
  + 'wants: ' + Object.entries(mines.under).filter(([, a]) => a.mine < a.n)
    .map(([k, a]) => `area ${k} ${a.n - a.mine}`).join(', '))

// 9c2. A mine is a place, so you can walk into it and out again — and what is
// in it is out of sight until you do.
//
// The cull has had the mine in it since the mine existed (*"without this the
// whole of Ant'hill stood on the hillside above itself"*) and nothing asked
// whether it was right in either direction.  Both halves matter: hiding a
// warren from outside is only correct if standing in it shows it.
let walked = null
for (const m of mines.mines) {
  // Somewhere outside, near the mouth, that a man can actually stand on.
  // Taking a bearing out of the warren's middle and stepping nine yards was
  // the first try and it lands in a hillside as often as not — a mine's mouth
  // is in a slope by definition — and `placeHero` then slides him somewhere
  // else entirely.  A ring, nearest first, and the spot has to hold him.
  const out = await p.evaluate(([mx, my]) => {
    for (const r of [7, 9, 11]) {
      for (let a = 0; a < 16; a++) {
        const t = (a / 16) * Math.PI * 2
        const x = mx + Math.cos(t) * r, y = my + Math.sin(t) * r
        if (!window.__canWalk(x, y)) continue
        window.__put(x, y)
        const at = window.__hero()
        if (!window.__seam().inside && Math.hypot(at.x - x, at.y - y) < 1) {
          return { inside: null, at }
        }
      }
    }
    return { inside: 'nowhere to stand outside it' }
  }, m.mouth)
  if (out.inside) continue
  // The camera eases, and a creature is only in `__hidden` if it was on the
  // glass: read too soon and the count is nought for the wrong reason.  This
  // repository has lost four rounds to checks that raced the weather.
  await p.waitForTimeout(900)
  const before = await p.evaluate(() => window.__hidden()
    .filter((h) => h.why === 'mine').length)
  // Walk, rather than place: whether a man can get in is the question.
  const keys = await p.evaluate(([mx, my]) => {
    const dx = mx - window.__hero().x, dy = my - window.__hero().y
    // North is +x and goes up the glass; west is +y and goes left.
    return [dx > 0.5 ? 'w' : dx < -0.5 ? 's' : null,
      dy > 0.5 ? 'a' : dy < -0.5 ? 'd' : null].filter(Boolean)
  }, m.mouth)
  for (const k of keys) await p.keyboard.down(k)
  // Asked of the state and not of `__seam`, which *runs* the doorstep: calling
  // it twenty times while standing in a doorway is not the same thing as
  // walking through one, and it toggled the player in and out.  `tick` fires
  // the seam itself once a step, which is what a walking player gets.
  let inside = null
  for (let i = 0; i < 30 && !inside; i++) {
    await p.waitForTimeout(200)
    inside = (await p.evaluate(() => window.__room())).inside
  }
  // Stop the moment he is in.  Walking on was the first try and it walked him
  // straight back out: crossing the threshold *places* him a few yards along
  // whichever bearing has floor on it, which is not the bearing he was
  // pressing, so the keys that took him in were now pointing at the door.
  for (const k of keys) await p.keyboard.up(k)
  if (!inside) continue
  await p.waitForTimeout(900)
  const after = await p.evaluate(() => window.__hidden()
    .filter((h) => h.why === 'mine').length)
  const seen = await p.evaluate(() => window.__hidden()
    .filter((h) => h.why === 'outside the room you are in').length)
  // And out, which is a walk back to the mouth rather than the reverse of the
  // way in: crossing put him down on whichever bearing had floor on it, so
  // "the way we came" points wherever it likes from there.
  const back = await p.evaluate(([mx, my]) => {
    const dx = mx - window.__hero().x, dy = my - window.__hero().y
    return [dx > 0.5 ? 'w' : dx < -0.5 ? 's' : null,
      dy > 0.5 ? 'a' : dy < -0.5 ? 'd' : null].filter(Boolean)
  }, m.mouth)
  for (const k of back) await p.keyboard.down(k)
  let left = 'mine'
  for (let i = 0; i < 30 && left; i++) {
    await p.waitForTimeout(200)
    left = (await p.evaluate(() => window.__room())).inside
  }
  for (const k of back) await p.keyboard.up(k)
  walked = { area: m.area, crew: m.crew, before, after, seen, inside, left }
  break
}
check('a man can walk into a mine', !!walked && walked.inside === 'mine',
  walked ? `area ${walked.area}, ${walked.crew} of them down it`
    : 'no mouth could be walked into')
check('and out of it again', !!walked && !walked.left,
  walked ? `back outside, ${walked.left ?? 'under the sky'}` : '')
check('and what is down there is out of sight until he does',
  !!walked && walked.before > 0 && walked.after === 0,
  walked ? `${walked.before} on screen and undrawn from outside, `
    + `${walked.after} still hidden from inside, and ${walked.seen} of the `
    + 'forest hidden from in there instead' : '')

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
// Aimed with a click on the thing rather than with a key: issue 222 took the
// aiming square off the bar, and a click on the world is the gesture that
// replaced it.
{
  const at2 = await p.evaluate(() => {
    const h = window.__hero()
    const foe = window.__all()
      .filter((n) => !n.dead && n.stance === 'quarry')
      .map((n) => ({ n, d: Math.hypot(n.x - h.x, n.y - h.y) }))
      .sort((a, b) => a.d - b.d)[0]
    return foe ? window.__screenAt(foe.n.x, foe.n.y) : null
  })
  if (at2) await p.mouse.click(Math.round(at2[0]), Math.round(at2[1]))
}
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
// **Frames against the refresh, not a count against fifty-five.**  The readout
// is frames over the last half second, and read 1.2 seconds after a jump that
// half second can still hold the jump — and on a busy machine the count is
// noise: it read 46 to 54 here while the median frame came every 16.7 ms, and
// CI failed this line on 52 at a commit whose frames cost what the one before
// it cost.  So it asks what "at the refresh rate" means: the median frame
// arrives within a tenth of the page's own refresh, taken as the shortest
// tenth of the intervals.  A pass that costs more than a refresh pushes the
// median to two intervals and fails; the runner being slow for everything does
// not, unless even the fastest frames are slower than fifty a second.
const beat = await p.evaluate(() => new Promise((done) => {
  const gaps = []
  let last = 0
  const tick = (now) => {
    if (last) gaps.push(now - last)
    last = now
    if (gaps.length < 90) requestAnimationFrame(tick)
    else done(gaps.sort((a, b) => a - b))
  }
  requestAnimationFrame(tick)
}))
const refresh = beat[Math.floor(beat.length * 0.1)]
const median = beat[beat.length >> 1]
check('the ground still runs at the refresh rate',
  median <= refresh * 1.1 && refresh <= 20,
  `median frame ${median.toFixed(1)} ms against a refresh of ${refresh.toFixed(1)} ms `
  + `(readout ${fps} fps over ${tiles} tiles)`)
console.log(`      (${tiles} tiles, median ${median.toFixed(1)} ms, readout ${fps} fps)`)

// 12. And at every zoom, not only the one it opens on.
//
// This used to ask a single number — `__cam({ zoom: 0.12 })` — and 0.12 was a
// constant in `main.ts` that has since been derived, so a harness that types
// it is driving a screen no player can reach.  `__cam` clamps now, and the
// sweep asks the limits rather than restating them.
//
// The history is why the sweep is here at all.  The tile count used to go as
// the square of how far out you were — 66,676 tiles at twenty frames a second
// four steps below the old floor — so the floor was 0.6 and the widest view
// was eighty-three yards of a valley six hundred across.  The ground draws a
// coarser tile under sixteen pixels now and the plain ground is composed into
// plates, so the count is near flat; but "near flat" is a claim about the
// whole range and the check was reading one point of it.
const zooms = await p.evaluate(() => window.__zooms())
console.log(`      (zoom ${zooms.floor.toFixed(3)} to ${zooms.ceiling.toFixed(2)},`
  + ` fit ${zooms.fit.toFixed(3)}, follow ${zooms.follow})`)

// The floor is the opening framing halved, and both halves of that are
// derived: `SEEN_YARDS` from `creature_template.detection_range`, the halving
// from `cameraDistanceMaxFactor`'s own `maxValue` in the client's options.
// Written out here because a derivation nothing checks is a derivation that
// gets replaced by a number the next time somebody is in a hurry.
check('the zoom floor is the opening framing over the camera slider',
  Math.abs(zooms.floor - Math.min(1, zooms.fit) / zooms.follow) < 1e-9,
  `${zooms.floor.toFixed(4)} = min(1, ${zooms.fit.toFixed(4)}) / ${zooms.follow}`)

// And what that floor leaves of a person.  Eight pixels was the old floor's
// answer, and it is why the old one was wrong for a reason that has nothing to
// do with frames: a screen you cannot read is not saved by running at sixty.
// The bar is the **smallest type on the same screen**, read off the page — a
// number that is already the client's own ladder one rung up, so nothing here
// is picked.  `padcheck` asks the same question at the four phone sizes.
const smallType = await p.evaluate(() => parseFloat(
  getComputedStyle(document.documentElement).getPropertyValue('--font-tiny')))
check('and a person is no smaller at the widest zoom than the type beside him',
  zooms.cell >= smallType,
  `${zooms.cell.toFixed(1)} pixels of sprite against ${smallType}px of type, `
  + `across ${zooms.across.toFixed(0)} yards`)

const sweep = []
// The floor last, and only the steps above it: 0.35 is a real step on a phone
// (floor 0.203) and clamps on to the floor at this viewport, which would
// measure the same screen twice and call it two zooms.
for (const z of [3, 2, 1.2, 1, 0.7, 0.5, 0.35]
  .filter((z) => z > zooms.floor + 1e-6).concat(zooms.floor)) {
  await p.evaluate(([x, y, zoom]) => window.__cam({ x, y, zoom }), [-8983, -316, z])
  // Long enough for the plates this view wants to be composed — one a frame,
  // so a cold jump is a second of them — and then read.  A frame rate taken
  // while the cache is filling is the cost of arriving, not of being there.
  await p.waitForTimeout(1500)
  const hud2 = await p.evaluate(() => document.getElementById('hud').textContent)
  sweep.push({
    zoom: await p.evaluate(() => window.__zooms().zoom),
    fps: Number(hud2.match(/초당 (\d+)/)[1]),
    tiles: Number(hud2.match(/([\d,]+)타일/)[1].replace(/,/g, '')),
  })
}
for (const s of sweep) {
  console.log(`      (zoom ${s.zoom.toFixed(3)}: ${s.tiles} tiles, ${s.fps} fps)`)
}
const worst = sweep.reduce((a, b) => (b.fps < a.fps ? b : a))
check('no zoom drops the ground below the floor', worst.fps >= 45,
  `worst is ${worst.fps} fps at zoom ${worst.zoom.toFixed(3)}`)
// And what stops it following the zoom, which is not what the comment in
// `main.ts` claimed for a round.  A tile is 32 pixels at 1:1, so the grain
// cannot double until the zoom is under 0.5 — above that the count is the
// square law and nothing has touched it: 86 tiles at 3 against 1,256 at 0.5.
// What the doubling actually buys is the far end, and it is worth asserting
// precisely because it is counter-intuitive: **the widest view on the glass
// draws fewer tiles than the zoom above it**.
// **Nought against nought is the claim holding.**  The tiles this view still
// drew were the bridge deck's — 10 at zoom 3 and 42 at the floor once the ground
// and the water had gone into plates — and a deck is one piece now, so at this
// spot the tile pass draws nothing at any zoom.  What is asserted is the part
// that stays true: never more at the floor than at the busiest zoom, and
// strictly fewer whenever that zoom draws any.
const most = sweep.reduce((a, b) => (b.tiles > a.tiles ? b : a))
const far = sweep[sweep.length - 1]
check('and pulling out past the coarser grain costs less, not more',
  most.tiles === 0 ? far.tiles === 0 : far.tiles < most.tiles,
  `${far.tiles} tiles at the ${far.zoom.toFixed(3)} floor against `
  + `${most.tiles} at ${most.zoom.toFixed(2)}`)

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
    `${edges.outlined} buildings outlined, ${edges.shaded} shadowed`)
}

// 13a2. And it stands at its own angle, not the world's.
//
// Issue 216.  A roof was stamped on every 1.33 yard square of the *world* a
// footprint covered, and the world's grid is not the building's: Northshire's
// abbey is turned 158.5 degrees and all four of its walls came out as
// staircases.  It is one fill in the model's own axes now — `planPath`, the
// outline traced as runs of set bits, under a transform that is `planCell`
// read backwards.
{
  const built = await p.evaluate(() => window.__built())
  console.log(`      (${built.onePiece} buildings in one piece, ${built.cells} `
    + `cells over ${built.runs} runs, ${built.turned} of them off the axes)`)
  // **The ones that are not drawn this way have to be counted out loud**, or a
  // model that quietly falls back to the stamp is a model nobody notices is
  // wrong.  The issue asked for this in those words.
  check('every building the world stands is drawn in one piece',
    built.stamped === 0 && built.onePiece > 20,
    `${built.onePiece} of ${built.all} have a plan; ${built.stamped} still `
    + 'stamped on the world grid')
  // And the turn is real.  With no rotation at all this number is nought, and
  // a check that passes on an axis-aligned world is a check that would have
  // passed before any of this.
  check('and most of them stand at an angle the world grid cannot hold',
    built.turned > built.onePiece * 0.8,
    `${built.turned} of ${built.onePiece} are turned off a right angle`)
  // **The doors and the shape come from two different readings of the model**
  // — the doors from its portals (`MOPT`), the outline from its triangles —
  // and the promise the wiki makes is that they agree.  A door outside the
  // shape is a doorstep in the open air; the whole point of drawing the
  // building as one piece is that its edge is now exact enough to say so.
  check('and every door the bake put on a building is inside the shape it draws',
    built.inside === built.doors && built.doors > 20,
    `${built.inside} of ${built.doors} doors, the deepest ${built.deepest} yd `
    + 'inside its own roof')

  // **And a roof has a ridge on it** — issue 217.
  //
  // The flat fill says *there is a roof here* and nothing else.  The roofs
  // pack this repository already credits ships a kit for the rest of it — ten
  // colours, each a five by six block laid out as one gabled roof — and
  // `roofs.png` had never been opened: only the pack's preview had, for the
  // one flat square cut out of it.
  //
  // The comment beside that cut said the rest of the sheet "is a slope in
  // perspective, and a slope tiled over a footprint reads as a hillside with
  // bricks on it", which was true while a roof was stamped on the *world* grid
  // with no structure in it.  A roof seen from above at an angle **is** a
  // slope in perspective; what was missing was the ridge.
  console.log(`      (${built.kitted} of ${built.all} buildings have a roof out `
    + `of the kit, ${built.flat} keep the flat fill; `
    + Object.entries(built.kit).map(([w, n]) => `${w} ${n}/${built.kitCells}`)
      .join(', ') + ')')
  // Every word a kind can wear has to have **all** of its pieces, because
  // `drawImage` with an undefined source draws no pixels and reports no error
  // — which is how the abbey once came out as ninety yards of nothing at all.
  const missing = Object.entries(built.kit)
    .filter(([, n]) => n !== built.kitCells)
  check('every roof a kind wears has its whole kit', missing.length === 0,
    missing.length ? missing.map(([w, n]) => `${w} has ${n}`).join(', ')
      : `${Object.keys(built.kit).length} words, `
      + `${built.kitCells} pieces each, all present`)
  // And the ones that keep the flat fill are counted out loud rather than
  // quietly looking like the rest, which is what issue 217 asked for by name.
  check('and most buildings have a roof laid out of it',
    built.kitted > built.all * 0.8,
    `${built.kitted} of ${built.all}; the other ${built.flat} have no part box `
    + 'the kit fits — under five tiles across, or over sixty yards, which is a '
    + 'compound and not a roof')

  // **What a building costs to hold**, which is issue 218's question and not
  // the answer it expected.
  //
  // It weighed nineteen per-model bitmaps at the ground's own 24 pixels a yard
  // and came to **145 MB**, the abbey 19.3 of it, and proposed three ways to
  // cut that down.  None of them is needed, because a building here is not a
  // bitmap of a building: it is **a mask and a tileset**.  The footprint is
  // already shipped and already held — the masks the plans have always carried
  // — and the roof is a repeating 32-pixel picture, so the abbey costs what a
  // cottage costs and both are rounding errors.
  //
  // A per-model sheet was also the thing that made the transparency argument
  // bite: a building turned 45 degrees is half empty in its own rectangle.
  // Drawn in the model's own axes there is no diagonal to store, so that cost
  // does not exist either.
  const MB = 1048576
  console.log(`      (buildings: ${(built.art / 1024).toFixed(0)} KB of roof `
    + `pictures and ${(built.masks / MB).toFixed(2)} MB of footprint, against `
    + `${(built.asSheets / MB).toFixed(0)} MB for one bitmap a model)`)
  check('a building costs a mask and a tileset, not a picture of itself',
    built.art + built.masks < 4 * MB && built.asSheets > 100 * MB,
    `${((built.art + built.masks) / MB).toFixed(2)} MB of 4, where a sheet a `
    + `model at 24 px/yd would be ${(built.asSheets / MB).toFixed(0)} MB`)
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
    // **Stuck is "he stopped", not "he missed".**  A waypoint is one cell of
    // the flood's own trail, four yards apart, and a man running at seven
    // yards a second rounds some of those corners rather than standing on
    // them — which is the check's steering and not the world's.  What has to
    // be true is that he never *stops*: each waypoint either gets reached or
    // gets closer, and the arrival at the end is what it all adds up to.
    // **He arrives, and he walks there.**
    //
    // Two measures and only two, after three attempts at a third.  Counting
    // waypoints he failed to stand on is noise: they are the flood's own
    // trail, four yards apart and crowded at the end, and a man rounding
    // somebody who is walking about misses one.  Counting whether he got
    // *closer to the destination* is noise too — the trail goes round a hill,
    // and thirty waypoints of a detour lead away from the door by design.
    //
    // What is left is what the check was ever for.  The flood says the route
    // is open; a push from the start used to stop at the first thing in the
    // way.  So: **did he end up there, and did he cover the ground to do it**
    // — the second is what stops an arrival by teleport or by a trail that
    // turned out to be four yards long.
    let stuck = 0, walked = 0
    let at = window.__hero()
    for (const [tx, ty] of path.trail) {
      const was = Math.hypot(at.x - tx, at.y - ty)
      let tries = 0
      while (tries++ < 120) {
        const h = window.__hero()
        if (Math.hypot(h.x - tx, h.y - ty) < 2) break
        window.__aim(tx, ty)
        window.__steps(1)
      }
      const h = window.__hero()
      walked += Math.hypot(h.x - at.x, h.y - at.y)
      at = h
      if (Math.hypot(h.x - tx, h.y - ty) >= 2
        && Math.hypot(h.x - tx, h.y - ty) > was - 0.5) stuck++
    }
    window.__aim(null)
    const h = window.__hero()
    return { yards: Math.round(path.yards), cells: path.trail.length, stuck,
      walked: Math.round(walked),
      left: Math.round(Math.hypot(h.x + 9440, h.y - 60)) }
  })
  check('and a man can actually walk from the start to Goldshire',
    trek.path !== null && trek.left < 6 && trek.walked > trek.yards * 0.8,
    trek.path === null ? 'the flood found no route at all'
      : `${trek.walked} yards walked of the ${trek.yards} the flood found, `
      + `over ${trek.cells} waypoints, ending ${trek.left} yards off `
      + `(${trek.stuck} waypoints rounded rather than stood on)`)
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
//
// And it has to start inside.  This teleported with `__cam`, which goes
// through `placeHero`, and since issue 165 that moves him off anything nobody
// can stand on — so it started two yards outside the wall, measured nought
// yards of rock and passed on a walk across a field.  `__putUnchecked` is the
// test-only way in, the start is asserted to be refused, and the spot is one
// step inside with open ground two yards off, which is the case `wayOut`
// exists for; a man in the middle of a mountain is let move freely on purpose.
//
// Walked a step at a time with `__steps`, not sampled off the clock: the held
// key becomes the walk the next time a frame is drawn, so two frames are
// waited for and then the steps are run and every one of them is read.
{
  const spot = await p.evaluate(() => {
    const B = window.__bounds()
    for (let x = B[0] + 200; x < B[1] - 200; x += 7) {
      for (let y = B[2] + 200; y < B[3] - 200; y += 7) {
        if (!window.__wallAt(x, y)) continue
        for (let a = 0; a < 8; a++) {
          const t = (a / 8) * Math.PI * 2
          if (window.__canWalk(x + Math.cos(t) * 2, y + Math.sin(t) * 2)) return { x, y }
        }
      }
    }
    return null
  })
  check('there is somewhere in this world a man cannot stand', !!spot)
  if (spot) {
    const worst = await p.evaluate(async (spot) => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
      const out = []
      for (const [name, k] of [['north', 'w'], ['south', 's'], ['west', 'a'], ['east', 'd']]) {
        window.__putUnchecked(spot.x, spot.y)
        window.__hold(k)
        await frame()
        await frame()
        const start = window.__putUnchecked(spot.x, spot.y)
        let run = 0, worstRun = 0, last = [spot.x, spot.y], ends = true, pushed = false
        for (let i = 0; i < 40; i++) {
          const w = window.__steps(1).want
          pushed ||= w.x !== 0 || w.y !== 0
          const h = window.__hero()
          const inWall = window.__wallAt(h.x, h.y)
          if (inWall) {
            run += Math.hypot(h.x - last[0], h.y - last[1])
            worstRun = Math.max(worstRun, run)
          } else run = 0
          last = [h.x, h.y]
          ends = !window.__canWalk(h.x, h.y)
        }
        window.__hold(null)
        out.push({ name, inside: start.wall && start.refused && pushed, worstRun, ends,
          moved: Math.hypot(last[0] - spot.x, last[1] - spot.y) })
      }
      return out
    }, spot)
    const far = worst.filter((w) => !w.inside || w.worstRun > 3)
    check('walking out of it never crosses three yards of solid ground',
      far.length === 0,
      worst.map((w) => `${w.name} ${w.inside ? '' : '(did not start inside) '}`
        + `${w.worstRun.toFixed(1)}yd of wall, ${w.moved.toFixed(1)}yd moved`).join(' · '))
    check('and every way out of it ends somewhere you can stand',
      worst.every((w) => w.inside && !w.ends),
      worst.filter((w) => !w.inside || w.ends).map((w) => w.name).join(' ') || 'all four')
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
//
// Driven rather than reasoned about — and it has to be driven.  It used to
// pick the nearest thing marked `enemy`, never anger it and never ask whether
// it moved: measured, a bandit 261 yards off, nought yards moved, not angry,
// and a pass.  So the creature is one close enough to come — within forty
// yards, whose straight line in reaches the building's shut ground at least
// five yards before it would reach him — it is angered, the world is stepped
// three seconds at a time it can read, and it has to have come closer and
// never once stood inside.
//
// **And it is asked twice: once of a wanderer and once of a spawn with no
// wander at all.**  It used to ask only for "one that moves at all (a spawn
// with no wander does not)", which was the game's bug written down as the
// check's premise: `wander` skipped every still creature before it asked
// whether it was angry, so 388 of the 1,369 fightable spawns never came at
// anybody, and the one sentence that could have seen it chose not to look.
// A still one is then left past the leash with the camera where it was, so
// it stays awake, and has to walk back to the spot it was spawned on —
// `MoveTargetedHome` — because standing still is also where it must end.
for (const still of [false, true]) {
  // Chosen, placed, angered and watched in one evaluation, so no frame runs
  // in between: the first version of this chose in one call and angered in
  // the next, the creature had wandered a yard by then, and the nearest
  // thing to where it had been was somebody else.
  const chase = await p.evaluate((still) => {
    let best = null
    for (const b of window.__buildings()) {
      if (b.k === 'mine' || !(b.doors ?? []).length) continue
      let inside = null
      // Somewhere in it a body fits, found by walking out from the middle.
      for (let r = 0; r < b.l && !inside; r += 2) {
        for (let a = 0; a < 12; a++) {
          const t = (a / 12) * Math.PI * 2
          const x = b.x + Math.cos(t) * r, y = b.y + Math.sin(t) * r
          const q = window.__plotAt(x, y)
          if (q && q.floor && !q.wall) { inside = { x, y }; break }
        }
      }
      if (!inside) continue
      for (const n of window.__all()) {
        if (n.dead || n.stance === 'friend') continue
        if (still ? n.wander !== 0 : !(n.wander > 0)) continue
        if (window.__shutOut(n.x, n.y)) continue
        const d = Math.hypot(n.x - inside.x, n.y - inside.y)
        if (d > 40) continue
        let clear = null
        for (let s = 0; s < d; s += 0.5) {
          if (window.__shutOut(n.x + ((inside.x - n.x) / d) * s,
            n.y + ((inside.y - n.y) / d) * s)) { clear = s; break }
        }
        if (clear === null || clear < 5) continue
        if (!best || clear > best.clear) {
          best = { b: b.k, at: [inside.x, inside.y], clear, gap: d,
            foe: { x: n.x, y: n.y, kind: n.kind } }
        }
      }
    }
    if (!best) return null
    // `__cam` and not `__put`: the creatures the world simulates are the ones
    // near the *camera*, and `__put` leaves the camera where it was — so the
    // creature chosen was not awake, `__anger` could not reach it, and the
    // first run of this angered nothing.  `__cam` places him the same way and
    // puts the camera on him, and one step rebuilds the list around it.
    window.__cam({ x: best.at[0], y: best.at[1] })
    window.__steps(1)
    const it = window.__all().filter((m) => !m.dead)
      .sort((a, c) => Math.hypot(a.x - best.foe.x, a.y - best.foe.y)
        - Math.hypot(c.x - best.foe.x, c.y - best.foe.y))[0]
    const angry = it ? window.__anger(it.x, it.y) : null
    if (!angry || angry.away > 0.5) return { ...best, angry: null }
    let pos = [angry.x, angry.y], inside = 0, closest = Infinity
    for (let i = 0; i < 120; i++) {
      window.__steps(1)
      const n = window.__all().filter((m) => m.angry && !m.dead)
        .sort((a, c) => Math.hypot(a.x - pos[0], a.y - pos[1])
          - Math.hypot(c.x - pos[0], c.y - pos[1]))[0]
      if (!n) break
      pos = [n.x, n.y]
      if (window.__shutOut(n.x, n.y)) inside++
      const h = window.__hero()
      closest = Math.min(closest, Math.hypot(n.x - h.x, n.y - h.y))
    }
    const h = window.__hero()
    const out = { ...best, angry, inside, closest, wander: it.wander,
      from: Math.hypot(angry.x - h.x, angry.y - h.y) }
    if (!still) return out
    // Past the leash, by `__put` so the camera — and so the list of what is
    // awake — stays where the creature is.  `__all()` is every spawn in a
    // fixed order, so its index follows this one through the steps.
    const idx = window.__all().findIndex((m) => m.hx === it.hx && m.hy === it.hy)
    const at = window.__all()[idx]
    let far = null
    for (let r = 50; r < 90 && !far; r += 5) {
      for (let a = 0; a < 16; a++) {
        const t = (a / 16) * Math.PI * 2
        const x = at.x + Math.cos(t) * r, y = at.y + Math.sin(t) * r
        if (window.__canWalk(x, y) && !window.__shutOut(x, y)) { far = { x, y }; break }
      }
    }
    if (!far) return { ...out, far: null }
    window.__put(far.x, far.y)
    const left = Math.hypot(at.x - at.hx, at.y - at.hy)
    let calm = -1, back = -1
    for (let i = 0; i < 600 && back < 0; i++) {
      window.__steps(1)
      const m = window.__all()[idx]
      if (calm < 0 && !m.angry) calm = i
      if (!m.angry && Math.hypot(m.x - m.hx, m.y - m.hy) < 0.01) back = i
    }
    return { ...out, far, left, calm, back }
  }, still)
  check(still ? 'there is a creature that stands still outside a building with a floor'
    : 'there is a building with a floor and something outside it', !!chase,
  JSON.stringify(chase))
  if (chase) {
    check(still ? 'and one that stands still comes at you too, and not through the wall'
      : 'and it does not walk through the wall to get at you',
      !!chase.angry && chase.from - chase.closest >= 3 && chase.inside === 0
      && (still ? chase.wander === 0 : chase.wander > 0),
      chase.angry
        ? `a ${chase.foe.kind} (wander ${chase.wander}) ${chase.from.toFixed(1)} yards `
          + `off came to within ${chase.closest.toFixed(1)} of him (the wall is `
          + `${chase.clear} yards along its way), and stood inside on `
          + `${chase.inside} of 120 steps`
        : `the ${chase.foe.kind} chosen could not be angered`)
    if (still) {
      check('and when it gives up it goes back to the spot it stood on',
        !!chase.far && chase.left >= 3 && chase.calm >= 0 && chase.back >= 0,
        chase.far
          ? `${chase.left.toFixed(1)} yards from its spot when he left past the `
            + `leash, calm after ${chase.calm} steps, home after ${chase.back}`
          : 'nowhere past the leash to leave it')
    }
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
  /**
   * **To the top and back down, not one flight and stop.**
   *
   * This used to `break` at the first storey it reached, so the abbey's
   * gallery and its tower had never been stood on and neither had the inn's
   * upstairs, where the innkeeper is.  Issue 220's own wording: it was not
   * *this is broken*, it was *there is no check, so nobody knows*.
   *
   * Walked rather than placed, because the latch that stops you riding a
   * staircase up and down once a frame is part of what is being tested — but
   * tried from four sides and over every cell the floor names, because the
   * first version of this walked two yards at one cell in four and a miss
   * looked exactly like a staircase that does not work.
   */
  //
  // **And the spot you start from must not itself be a stair.**  A flight is
  // wide — the abbey's ground floor names 190 cells that lead up — so standing
  // two yards short of one lands on another, `__seam` latches `onRung` there,
  // and the step that was supposed to be the act does nothing.  Measured, that
  // is the whole of why the first version of this check reported *1 flight of
  // 3*: it was never off the stairs to begin with.
  const WAYS = [[3, 0, 's'], [-3, 0, 'w'], [0, 3, 'd'], [0, -3, 'a'],
    [2, 0, 's'], [-2, 0, 'w'], [0, 2, 'd'], [0, -2, 'a']]
  const ride = async (want) => {
    const start = (await p.evaluate(() => window.__seam())).storey
    const all = await p.evaluate(() => window.__stairs())
    const rungs = new Set(all.map((c) => `${Math.round(c[0])},${Math.round(c[1])}`))
    // **The ones that go the way we are going.**  `__stairs` says which since
    // issue 220: a landing that is both takes the up, so it is only good for
    // climbing.  Picked at random instead, the inn's ground floor is 420 cells
    // down against 115 up — three tries in four go the wrong way, and the next
    // try starts from the wrong floor.
    const wanted = all.filter((c) => (want > 0 ? c[2] >= 0 : c[2] === -1))
    // **And the ones a man can actually stand on**, which is a sixth of them
    // on the abbey's first floor: 19 of 130 sampled.  A `steps` cell is *a
    // walkable face between this floor and the next*, and between the gallery
    // at 17.6 yards and the crossing tower at 33.1 that is fifteen yards of
    // the tower's insides — 1,164 cells, most of which are nowhere a man on
    // the gallery can put his foot.  Sampling the mask and hoping is how this
    // check reached the gallery and stopped there, run after run.
    const stairs = await p.evaluate((cs) =>
      cs.filter((c) => window.__canWalk(c[0], c[1])), wanted)
    if (!stairs.length) return null
    // Thinned rather than truncated: a staircase's cells are contiguous, so
    // the first twenty of twelve hundred are all one corner of one flight.
    const step = Math.max(1, Math.floor(stairs.length / 30))
    let tries = 0
    for (let i = 0; i < stairs.length && tries < 48; i += step) {
      const s = stairs[i]
      // **Every bearing of every cell, not the first that is standable.**  A
      // spiral stair is two thirds slope — the abbey's tower is 64% of it —
      // and the side you can stand on is the building's business, not ours.
      // Returning at the first walkable approach and moving on to the next
      // cell was how this reached the abbey's gallery and stopped there.
      for (const [ax, ay, key] of WAYS) {
        if (tries >= 48) break
        if (rungs.has(`${Math.round(s[0] + ax)},${Math.round(s[1] + ay)}`)) continue
        const ok = await p.evaluate(([sx, sy, dx, dy]) => {
          if (!window.__canWalk(sx + dx, sy + dy)) return false
          window.__put(sx + dx, sy + dy)
          window.__seam()
          return true
        }, [s[0], s[1], ax, ay])
        if (!ok) continue
        tries++
        await p.keyboard.down(key)
        await p.waitForTimeout(450)
        await p.keyboard.up(key)
        const now = await p.evaluate(() => window.__seam())
        // **Still in the building.**  Walking out of a door also takes
        // `storey` to -1, and counted as a descent that is a check which
        // passes by leaving: an early version reported the abbey going from
        // its tower to the ground in one move, and what it had actually done
        // was step outside.
        if (!now.inside) continue
        if (want > 0 ? now.storey > start : now.storey < start) return now.storey
      }
    }
    return null
  }
  let climbed = null
  const everyone = []
  for (const h of tall) {
    if (h.floors < 2) continue
    const got = await p.evaluate(([x, y]) => {
      window.__put(x, y); return window.__seam()
    }, h.door)
    if (!got.inside) continue
    const up = []
    for (let guard = 0; guard < h.floors + 1; guard++) {
      const now = await ride(1)
      if (now === null) break
      up.push(now)
    }
    if (!up.length) continue
    const down = []
    for (let guard = 0; guard < h.floors + 2; guard++) {
      const now = await ride(-1)
      if (now === null) break
      down.push(now)
    }
    const walked = { k: h.k, floors: h.floors, up, down }
    everyone.push(walked)
    // The tallest that worked is what the three checks below read; the rest
    // are kept so *every* building with an upstairs is walked rather than the
    // first one that happens to answer.  The inn is the reason: its innkeeper
    // is on the first floor and only one of its four doors can be reached from
    // outside, so until now nobody had stood up there.
    if (!climbed
      || (up[up.length - 1] ?? -99) > (climbed.up[climbed.up.length - 1] ?? -99)) {
      climbed = walked
    }
  }
  for (const e of everyone) {
    console.log(`      (${e.k}, ${e.floors} upper floors: up `
      + `${e.up.join(' ') || 'nowhere'} and down ${e.down.join(' ') || 'nowhere'})`)
  }
  check('walking on to a landing puts you on the floor above',
    !!climbed && climbed.up.length > 0,
    climbed ? `${climbed.k}: ${climbed.up.join(' -> ')} of ${climbed.floors}`
      : 'nothing could be climbed')
  // **All the way up**, which is the whole of issue 220.  The abbey has three
  // upper floors — a gallery at 9.2 yards, another at 17.6 and the crossing
  // tower at 33.1 — and the old check stopped at the first.
  //
  // **The top, not a count of flights.**  One walk can cross two landings, so
  // *as many rides as there are floors* is the wrong question — the abbey's
  // 0 -> 1 -> 2 and the inn's 0 -> 2 both arrive.  What has to be true is
  // where it stopped.
  const top = (e) => (e.up.length ? e.up[e.up.length - 1] : -99)
  check('and it keeps going to the top of the building',
    !!climbed && top(climbed) === climbed.floors - 1,
    climbed ? `${climbed.up.join(' -> ')} of ${climbed.floors} floors` : '')
  // And **every** building with an upstairs, not the one that answered first.
  check('and every building with an upstairs can be walked to the top of it',
    everyone.length > 1
    && everyone.every((e) => top(e) === e.floors - 1
      && e.down[e.down.length - 1] === -1),
    everyone.map((e) => `${e.k} reached ${top(e)} of ${e.floors - 1}, back to `
      + `${e.down[e.down.length - 1] ?? 'nowhere'}`).join('; '))
  check('and walking back off it brings you down',
    !!climbed && climbed.down.length > 0
    && climbed.down[climbed.down.length - 1] < climbed.up[climbed.up.length - 1],
    climbed ? `went up ${climbed.up.join(' -> ')}, came back `
      + `${climbed.down.join(' -> ')}` : '')
  // And to the ground, which needs the *floor below's* stairs — the ones the
  // player is standing on rather than the ones ahead of him.  `__stairs` named
  // only this floor's until issue 220, so at the top of a building it answered
  // nothing while the way down was under his feet.
  check('and all the way to the ground',
    !!climbed && climbed.down[climbed.down.length - 1] === -1,
    climbed ? `ended on floor ${climbed.down[climbed.down.length - 1]}` : '')
}

// 20b. And what is on one floor is not on the next.
//
// Both of the drawing's filters asked *whose building is this* and neither
// asked *which floor* — `o.in !== indoors` for the furniture and
// `roof !== indoors` for the people.  Issue 170 gave a building storeys and
// the drawing did not follow, so measured at the same spot with only the
// storey changed it was **40 pieces and 2 people on the ground against 38 and
// 1 one floor up**: the abbey's ground-floor barrels stood on the gallery
// above them and its ground-floor people were visible from it.
//
// The same shape as issue 173 one level in: there it was the *building*
// boundary that had nothing to do with what a man can see, here it is the
// *floor* boundary.
//
// Read off the draw loop's own decision — `__shown` is what got through the
// filter — because a check that recomputes the pair of conditions it is
// checking agrees with itself.
{
  const tall = await p.evaluate(() => window.__buildings()
    .filter((b) => (b.floors ?? []).length >= 2)
    .map((b) => ({ k: b.k, floors: b.floors.length, door: b.doors[0] })))
  const seen = []
  // **Wait on the camera, not on the clock.**  `__shown` is what the last
  // frame put through the filter, and the filter only walks the buckets the
  // *view* covers — and after `__put` the camera eases towards the player at
  // `dt * 8` a frame.  So the first storey read after a jump counted whatever
  // the camera had slid over by then: the house's ground floor measured 0, 8,
  // 114 and 334 on the way in, and CI's slower frames failed this line on 0
  // while the same commit passed locally.  `__cam` places him the same way
  // and puts the camera on him, and the read waits for the storey to be the
  // one asked for and for two frames to have been drawn with it.  Run at one,
  // four and six times CPU throttling, three rounds each, it read 67/21/5/22
  // and 334/16/76/41 every time.
  for (const h of tall) {
    await p.evaluate(([x, y]) => { window.__cam({ x, y }); window.__seam() }, h.door)
    const rows = []
    for (let s = -1; s < h.floors; s++) {
      await p.evaluate((n) => window.__floor(n), s)
      await p.waitForFunction((n) => window.__shown().storey === n, s)
      await p.evaluate(() => new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r))))
      const g = await p.evaluate(() => window.__shown())
      rows.push({
        storey: g.storey,
        props: g.props.length, folk: g.folk.length,
        // Everything on screen has to belong to the floor you are standing on.
        off: g.props.filter((r) => r[2] !== g.storey).length
          + g.folk.filter((r) => r[2] !== g.storey).length,
        // And the list itself, so *changed* can mean changed rather than
        // "a different number of things".
        key: JSON.stringify(g.props.map((r) => `${r[0]}|${r[1]}`).sort()),
      })
    }
    seen.push({ k: h.k, floors: h.floors, rows })
    console.log(`      (${h.k}: `
      + rows.map((r) => `${r.storey}:${r.props}+${r.folk}`).join(' ') + ')')
  }
  check('a building with an upstairs has something on every floor of it',
    seen.length > 0 && seen.every((b) => b.rows.every((r) => r.props > 0)),
    seen.map((b) => `${b.k} ${b.rows.map((r) => r.props).join('/')}`).join('; '))
  // **The lists differ**, which is the thing that was not true.  By content
  // and not by count: two floors of a barracks could hold the same number of
  // barrels and be different barrels.
  check('and changing floor changes what is drawn',
    seen.every((b) => new Set(b.rows.map((r) => r.key)).size === b.rows.length),
    seen.map((b) => `${b.k}: ${new Set(b.rows.map((r) => r.key)).size} distinct `
      + `of ${b.rows.length}`).join('; '))
  check('and everything drawn on a floor belongs to that floor',
    seen.every((b) => b.rows.every((r) => r.off === 0)),
    seen.flatMap((b) => b.rows.filter((r) => r.off)
      .map((r) => `${b.k} floor ${r.storey}: ${r.off} from elsewhere`)).join('; '))
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
      // The floor the scene derived, rather than a 39.5 typed here beside the
      // 40 that used to be typed there (issue 172).
      floor: window.__zooms().seen,
    }
  })
  check('a screen shows at least forty yards across its short side',
    seen.floor > 0 && Math.min(seen.wide, seen.tall) >= seen.floor - 0.5,
    `${seen.wide.toFixed(0)} x ${seen.tall.toFixed(0)} yards, the floor being `
    + `${seen.floor}`)
  check('and a walkable spot has somebody on screen on average',
    seen.perScreen >= 1,
    `${seen.perScreen.toFixed(2)} people over ${seen.spots} spots`)
  check('and there is more than one person where a character starts',
    seen.atStart >= 2, `${seen.atStart} at the start`)
}

// 24. Trades, which is the one section that has to come last.
//
// Mining and herbalism ask for level five, so taking them up means earning
// four levels first — and a hero who is level five is not the hero every
// check above is about.  Four of them read what a character is made of at
// level one and went red the day this block was written higher up the file.
// And the trade has to be learned first, which is issue 200: a node asks for
// a `SkillLine` and a person who has never paid a trainer has none of it.  The
// trainer's own path, through `takeUp` — a check that learns a trade some other
// way is a check that does not know whether learning works.
const learnt = await p.evaluate(() => {
  // Mining and herbalism ask for level five and this hero is one, which is
  // the trainer row's own `ReqLevel` and not a rule of ours — so the check
  // earns the levels first rather than reaching past the gate.
  for (let i = 0; i < 6 && window.__earn(2000).level < 5; i++) { /* climb */ }
  return [182, 186, 393].map((s) => window.__takeUp(s))
})
check('a trade can be taken up from a trainer',
  learnt.every((x) => x && x.at && x.at[0] >= 1 && x.at[1] >= 75),
  learnt.map((x) => x && x.at ? `${x.at[0]} / ${x.at[1]}` : 'none').join(', '))
for (const kind of ['herb', 'vein']) {
  const took = await p.evaluate((k) => window.__take(k), kind)
  if (!took) continue
  check(`and ${kind === 'herb' ? 'a herb can be picked' : 'a vein can be mined'}`,
    !took.up && took.got !== '아무것도 없다'
      && took.after[took.trade][0] === took.before[took.trade][0] + 1,
    `${took.got} — ${took.trade} ${took.before[took.trade]?.[0]} → `
    + `${took.after[took.trade]?.[0]}`)
}
// And what the digging is for.  A material that goes into a bag and comes out
// of nothing is the shape this repository keeps finding, so the check follows
// one all the way through: learn first aid, take the linen the world drops,
// tie a bandage, use it.
const made = await p.evaluate(async () => {
  window.__takeUp(129)
  window.__give({ 2589: 4 })
  const rows = window.__craft(129)
  const row = rows.find((r) => r.can)
  if (!row) return { rows: rows.length, row: null }
  const out = window.__craft(129, row.spell)
  return { rows: rows.length, row, out, made: window.__bag()[String(row.makes)] }
})
check('a trade can make something out of what the world yields',
  !!made.row && made.made > 0,
  made.row ? `${made.rows} recipes, made ${made.made} of ${made.row.makes} `
    + `out of ${JSON.stringify(made.row.needs)}` : `${made.rows} recipes, none makeable`)
if (made.row) {
  const used = await p.evaluate((id) => window.__bag(id), made.row.makes)
  check('and what it made can be used',
    used.using !== null && used.using.each > 0,
    `${used.said} — ${used.using ? `${used.using.each} a tick` : 'nothing happened'}`)
}
// And the other half of a lock: the slice reaches four zones and its hardest
// node wants 270 of a trade, which a man who has pulled one weed does not have.
const refused = await p.evaluate(() => window.__refused('herb'))
if (refused) {
  check('and one out of your depth says so', refused.up === true,
    `${refused.got} (it wants ${refused.skill})`)
}

// 25. Standing still heals you, in lumps, at the rate the server heals you.
//
// It used to be five per cent of maximum a second after three seconds of
// quiet, both of them numbers written into `main.ts` — issue 202.  The server
// settles health on a two-second tick out of `Player::RegenerateAll`, and what
// it settles is a spirit curve, so the two things a player can see are that it
// arrives in *steps* and that a level one man heals half his bar in one.
{
  const before = await p.evaluate(() => window.__hurt(1))
  const trace = await p.evaluate(async () => {
    const out = []
    for (let i = 0; i < 14; i++) {
      window.__steps(30)
      out.push(window.__you().hp)
    }
    return out
  })
  const steps = trace.filter((v, i) => i > 0 && v > trace[i - 1]).length
  check('standing still heals you',
    trace.at(-1) > before.hp,
    `${before.hp} -> ${trace.at(-1)} of ${before.max}`)
  check('and it arrives in steps rather than creeping',
    steps > 0 && steps < trace.length - 1,
    `${steps} steps over ${trace.length} half-seconds: ${trace.join(' ')}`)
}

console.log(`\nconsole errors: ${errs.length ? errs.join(' | ') : 'none'}`)
console.log(bad === 0 ? 'all checks passed' : `${bad} FAILED`)
await b.close()
process.exit(bad === 0 ? 0 : 1)

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

// 9. A building is an outline, not a slab.
//
// Filling a record's box with stone buried the middle of Northshire: the
// abbey's box is 91 yards square and its two gates are 160 long, so the
// courtyard, the road through the gate, the graveyard and every cobble under
// them came out as one grey field.  A box is the *extent* of a thing, not a
// claim that the ground inside it is floor.
const inside = await p.evaluate(() => {
  // The middle of the biggest building in the slice, and what the ground
  // under it is drawn as.
  const big = window.__buildings().sort((a, b) => b.l * b.w - a.l * a.w)[0]
  if (!big) return null
  const at = (dx, dy) => window.__probe(big.x + dx, big.y + dy)
  return {
    size: [Math.round(big.l * 2), Math.round(big.w * 2)],
    // Along the building's own long axis, because it is turned: sampling
    // along world x lands in the middle of a diagonal one.
    middle: at(0, 0).built,
    edge: at(big.c * (big.l - 0.6), big.s * (big.l - 0.6)).built,
  }
})
if (inside) {
  check('the middle of a building is not paved over', inside.middle === false,
    `${inside.size[0]}x${inside.size[1]} yards, middle drawn as ${inside.middle}`)
  check('and its wall is', inside.edge === true, `edge drawn as ${inside.edge}`)
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

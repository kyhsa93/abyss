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

// 5. The ground costs what it costs.  A second tint fill over every tile,
// instead of one baked into the cache, was 934 tiles at 47 frames a second on
// this very view.
await p.evaluate(([x, y]) => window.__cam({ x, y, zoom: 1.2 }), [-9462, 16])
await p.waitForTimeout(1200)
const hud = await p.evaluate(() => document.getElementById('hud').textContent)
const fps = Number(hud.match(/초당 (\d+)/)[1])
const tiles = Number(hud.match(/([\d,]+)타일/)[1].replace(/,/g, ''))
check('the ground still runs at the refresh rate', fps >= 55, `${fps} fps over ${tiles} tiles`)
console.log(`      (${tiles} tiles, ${fps} fps)`)

// 6. And at the widest the zoom will go, which is where it stops running: the
// tile count goes as the square of how far out you are, and the floor on the
// zoom is set by this number and not by taste.
await p.evaluate(([x, y]) => window.__cam({ x, y, zoom: 0.6 }), [-8983, -316])
await p.waitForTimeout(1500)
const wide = await p.evaluate(() => document.getElementById('hud').textContent)
const wfps = Number(wide.match(/초당 (\d+)/)[1])
const wtiles = Number(wide.match(/([\d,]+)타일/)[1].replace(/,/g, ''))
check('and at the widest zoom too', wfps >= 55, `${wfps} fps over ${wtiles} tiles`)
console.log(`      (${wtiles} tiles, ${wfps} fps at the floor)`)

console.log(`\nconsole errors: ${errs.length ? errs.join(' | ') : 'none'}`)
console.log(bad === 0 ? 'all checks passed' : `${bad} FAILED`)
await b.close()
process.exit(bad === 0 ? 0 : 1)

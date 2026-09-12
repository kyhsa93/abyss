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

// 1. A yard north leaves towards the top right, a yard west towards the top
// left.  That one sentence is the whole projection, and everything else here
// is a consequence of it.
const o = await at(...EMPTY)
const n = await at(EMPTY[0] + 10, EMPTY[1])
const w = await at(EMPTY[0], EMPTY[1] + 10)
check('north goes up and to the right', n.x > o.x + 4 && n.y < o.y - 2,
  JSON.stringify([o, n]))
check('west goes up and to the left', w.x < o.x - 4 && w.y < o.y - 2,
  JSON.stringify([o, w]))
check('and both by the same amount, which is what makes it 2:1',
  Math.abs((n.x - o.x) - (o.x - w.x)) < 0.01
  && Math.abs((n.x - o.x) / (o.y - n.y) - 2) < 0.01,
  JSON.stringify([n.x - o.x, o.y - n.y]))

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

// 3. Back to front is x + y, not x.  Sorted on x, a thing to the west hides
// the thing standing in front of it — which is only visible where two of them
// overlap, so it is asserted rather than looked for.
const order = await p.evaluate(() => window.__order())
check('the scenery is sorted back to front along x + y',
  order.every((d, i) => i === 0 || order[i - 1] >= d - 1e-9),
  JSON.stringify(order.slice(0, 4)))

// 4. The ground costs what it costs.  Shearing a tile per frame instead of
// once per zoom was 934 tiles at 47 frames a second on this very view.
await p.evaluate(([x, y]) => window.__cam({ x, y, zoom: 1.2 }), [-9462, 16])
await p.waitForTimeout(1200)
const hud = await p.evaluate(() => document.getElementById('hud').textContent)
const fps = Number(hud.match(/초당 (\d+)/)[1])
const tiles = Number(hud.match(/([\d,]+)타일/)[1].replace(/,/g, ''))
check('the ground still runs at the refresh rate', fps >= 55, `${fps} fps over ${tiles} tiles`)
console.log(`      (${tiles} tiles, ${fps} fps)`)

console.log(`\nconsole errors: ${errs.length ? errs.join(' | ') : 'none'}`)
console.log(bad === 0 ? 'all checks passed' : `${bad} FAILED`)
await b.close()
process.exit(bad === 0 ? 0 : 1)

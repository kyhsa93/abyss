/**
 * Drives the touch controls with real fingers.
 *
 * Chromium's own touch input over CDP, not synthesised PointerEvents: what is
 * under test includes the browser's hit testing, its pointer capture and the
 * `touch-action` that stops a drag scrolling the page, and a dispatched
 * `new PointerEvent(...)` tests none of those.
 *
 *   npm run dev          # in one terminal
 *   npm run padcheck     # in another; screenshots land in shots/
 *
 * It needs the server because the render path only runs in a browser, which is
 * the same reason it is a script and not a unit test.
 */
import { mkdirSync } from 'node:fs'
import { chromium, devices } from 'playwright'

const SP = process.argv[2] ?? 'shots'
mkdirSync(SP, { recursive: true })
const HOST = process.env.ABYSS_URL ?? 'http://localhost:5173'

const b = await chromium.launch()
const ctx = await b.newContext({ ...devices['iPhone 13'] })
const p = await ctx.newPage()
const errs = []
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
p.on('pageerror', (e) => errs.push(String(e)))
const cdp = await ctx.newCDPSession(p)

let bad = 0
const near = (a, b, tol) => Math.abs(a - b) <= tol
function check(label, ok, detail = '') {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `   -> ${detail}`}`)
}

/** One touch event with however many fingers are on the glass. */
async function touch(type, points) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map(([x, y], i) => ({ x, y, id: i })),
  })
  await p.waitForTimeout(40)
}

const hero = () => p.evaluate(() => window.__hero())
const pad = () => p.evaluate(() => window.__pad())

await p.goto(HOST)
await p.waitForFunction(() => window.__ready, null, { timeout: 60000 })
const L = await pad()
console.log(`viewport ${p.viewportSize().width}x${p.viewportSize().height}  ` +
  `stick r=${L.base.toFixed(0)} button r=${L.btnR.toFixed(0)} hit=${L.hit.toFixed(0)}`)

// 1. A phone shows its controls before being poked.
check('overlay on from the start', L.on === true)
check('body knows it is a phone', await p.evaluate(() => document.body.classList.contains('touch')))
check('help line is the touch one',
  (await p.evaluate(() => document.getElementById('help').textContent)).includes('끌어서 이동'))

// The stick is tested in an empty field on purpose.  The first version of
// this check started where the game does, walked the hero two yards north into
// a townsman, and then read "west is blocked" as a bug in the mapping — the
// keyboard does exactly the same thing from that spot.
await p.evaluate(() => window.__cam({ x: -9200, y: -600, zoom: 1 }))
await p.waitForTimeout(200)
check('the test field is empty',
  (await p.evaluate(() => window.__npcs(-9200, -600))).near.d > 12)

// 2. The stick goes where the thumb lands, and does not drift there.
const A = [110, 560]
await touch('touchStart', [A])
const before = await hero()
await p.waitForTimeout(300)
check('no drift inside the deadzone', JSON.stringify(await hero()) === JSON.stringify(before),
  JSON.stringify([before, await hero()]))

// 3. Up the screen is north and only north.  For one round it was north-west,
// because the view was a diamond and the world's +x left towards the top
// right; the stick is read in screen pixels and put through the projection, so
// it followed the camera round and follows it back.
await touch('touchMove', [[A[0], A[1] - L.base]])
await p.waitForTimeout(400)
let now = await hero()
check('drag up walks north and nothing else',
  now.x > before.x + 0.5 && Math.abs(now.y - before.y) < 0.5,
  JSON.stringify([before, now]))

// 4. And left is west, for the same reason and the other axis.
const mid = now
await touch('touchMove', [[A[0] - L.base, A[1]]])
await p.waitForTimeout(400)
now = await hero()
check('drag left walks west and nothing else',
  now.y > mid.y + 0.5 && Math.abs(now.x - mid.x) < 0.5,
  JSON.stringify([mid, now]))

// 5. Lifting stops the hero and parks the stick back in its corner.
await touch('touchEnd', [])
await p.waitForTimeout(200)
const still = await hero()
await p.waitForTimeout(300)
check('lifting stops the hero', JSON.stringify(await hero()) === JSON.stringify(still))

// 6. Two fingers are the camera, not a second stick.
//
// Up the screen, not across the bottom.  This used to pinch at y=600, which
// on a 390x664 phone is the button row — it worked while there was one button
// and stopped the day there were two, because the second one sits at x=277
// and a finger at (240, 600) is inside its hit radius.  What is being checked
// here is the camera, so it is checked somewhere no button will ever be.
const zoomOf = () => p.evaluate(() => Number(
  document.getElementById('hud').textContent.match(/배율 ([\d.]+)/)[1]))
const z0 = await zoomOf()
await touch('touchStart', [[140, 330], [240, 330]])
const held = await hero()
await touch('touchMove', [[100, 330], [300, 330]])
await p.waitForTimeout(200)
const z1 = await zoomOf()
check('pinch out zooms in', z1 > z0 * 1.3, `${z0} -> ${z1}`)
check('the pinch does not steer', JSON.stringify(await hero()) === JSON.stringify(held),
  JSON.stringify([held, await hero()]))
await touch('touchMove', [[180, 330], [220, 330]])
await p.waitForTimeout(200)
const z2 = await zoomOf()
check('pinch in zooms out', z2 < z1 * 0.8, `${z1} -> ${z2}`)
await touch('touchEnd', [])
await p.waitForTimeout(200)

// A finger left over from a pinch must not grab the stick from where it lies.
const after = await hero()
await p.waitForTimeout(400)
check('no stick left running after a pinch', JSON.stringify(await hero()) === JSON.stringify(after),
  JSON.stringify([after, await hero()]))

// 7. The button is dark with nobody in earshot and lit with somebody in it.
await p.evaluate(() => window.__cam({ x: -9200, y: -600, zoom: 1 }))
await p.waitForTimeout(200)
await p.screenshot({ path: `${SP}/pad-idle.png` })
const btn = L.slots[0]
await touch('touchStart', [[btn.x, btn.y]])
await touch('touchEnd', [])
await p.waitForTimeout(150)
check('the button does nothing with nobody there',
  await p.evaluate(() => document.getElementById('talk').hidden))

// 8. Beside a trader: the button opens the conversation.
await p.evaluate(() => window.__cam({ x: -9461.6, y: 16.19, zoom: 1.4 }))
await p.waitForTimeout(250)
await p.screenshot({ path: `${SP}/pad-ready.png` })
// A thumb landing beside the button still counts, up to the hit radius.
await touch('touchStart', [[btn.x - L.hit * 0.9, btn.y]])
await touch('touchEnd', [])
await p.waitForTimeout(150)
check('a thumb beside the button still presses it',
  !(await p.evaluate(() => document.getElementById('talk').hidden)))
const n = await p.evaluate(() => document.querySelectorAll('#talk li').length)
check('the options are there', n > 0, String(n))

// 9. While talking the pad is gone and the stick is inert.
const talking = await hero()
await touch('touchStart', [[A[0], A[1]]])
await touch('touchMove', [[A[0], A[1] - L.base]])
await p.waitForTimeout(300)
check('the stick is inert while talking',
  JSON.stringify(await hero()) === JSON.stringify(talking),
  JSON.stringify([talking, await hero()]))
await touch('touchEnd', [])

// The one you are talking to is above the panel, not behind it.
await p.waitForTimeout(700)
const seen = await p.evaluate(() => {
  const r = document.getElementById('talk').getBoundingClientRect()
  return { top: r.top, hero: window.__heroScreen() }
})
const hudBottom = await p.evaluate(() =>
  document.getElementById('hud').getBoundingClientRect().bottom)
check('the speaker is lifted clear of the panel',
  seen.hero.y < seen.top - 20, JSON.stringify(seen))
check('and clear of the readout', seen.hero.y > hudBottom, JSON.stringify([seen.hero.y, hudBottom]))

// The option rows are a finger tall.
const rows = await p.evaluate(() =>
  [...document.querySelectorAll('#talk li')].map((li) => Math.round(li.getBoundingClientRect().height)))
check('option rows are hittable', Math.min(...rows) >= 40, JSON.stringify(rows))
await p.screenshot({ path: `${SP}/pad-talking.png` })

// 10. A tap on the world — above the panel, which swallows its own taps —
// ends it.
const top = await p.evaluate(() => document.getElementById('talk').getBoundingClientRect().top)
check('there is world left to tap above the panel', top > 60, String(top))
await touch('touchStart', [[195, Math.round(top / 2)]])
await touch('touchEnd', [])
await p.waitForTimeout(150)
check('a tap on the world ends the conversation',
  await p.evaluate(() => document.getElementById('talk').hidden))

// 11. Landscape: the controls follow the corners.
await p.setViewportSize({ width: 844, height: 390 })
await p.waitForTimeout(300)
const land = await pad()
check('the stick stays in the bottom-left corner',
  land.home.x < 844 / 3 && land.home.y > 390 * 0.6, JSON.stringify(land.home))
check('the buttons stay in the bottom-right corner',
  land.slots[0].x > 844 * 0.8 && land.slots[0].y > 390 * 0.6, JSON.stringify(land.slots[0]))
await p.evaluate(() => window.__cam({ x: -9461.6, y: 16.19, zoom: 1.4 }))
await p.waitForTimeout(200)
await p.screenshot({ path: `${SP}/pad-landscape.png` })

// 12. A keyboard puts it all away again.
await p.setViewportSize({ width: 390, height: 844 })
await p.keyboard.press('w')
await p.waitForTimeout(120)
check('a key hides the overlay', (await pad()).on === false)
check('the help line goes back to the keys',
  (await p.evaluate(() => document.getElementById('help').textContent)).includes('WASD'))

// Nothing the player reads is left in English.
const shown = await p.evaluate(() => [
  document.getElementById('hud').textContent,
  document.getElementById('help').textContent,
].join(' '))
check('the readout and the help line are Korean',
  !/[A-Za-z]{4,}/.test(shown.replace('AzerothCore', '').replace('WASD', '')), shown)

console.log(`\nconsole errors: ${errs.length ? errs.join(' | ') : 'none'}`)
console.log(bad === 0 ? 'all checks passed' : `${bad} FAILED`)
await b.close()
process.exit(bad === 0 ? 0 : 1)

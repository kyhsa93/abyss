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
//
// Stood next to a *named* one rather than at a coordinate somebody once saw
// one at: the shopkeepers wander now, so a fixed spot is a check that fails
// one run in three for a reason that has nothing to do with the pad.
await p.evaluate(() => {
  // Somebody who stays put: `creature.wander_distance` is nought for anyone
  // behind a counter, and a conversation with somebody who walks off ends
  // itself halfway through the check.
  const who = window.__all()
    .filter((n) => n.kind === 'townsfolk' && !n.wander && n.r !== 'prey')
  const near = who.find((n) => Math.hypot(n.x + 9461.6, n.y - 16.19) < 40) ?? who[0]
  window.__cam({ x: near.x - 1.2, y: near.y, zoom: 1.4 })
})
await p.waitForTimeout(400)
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

// The one you are talking to is beside the panel, not behind it.
//
// **Beside and no longer above**, which is the axis changing with the panel:
// it used to lie along the bottom of the glass and the camera lifted the pair
// of you up out from behind it.  It stands down the left now — the corner
// `GossipFrame` takes and the one a thumb does not — so what it hides is a
// strip of the left, and the camera pushes the pair of you right.
await p.waitForTimeout(700)
const seen = await p.evaluate(() => {
  const r = document.getElementById('talk').getBoundingClientRect()
  return { right: r.right, top: r.top, hero: window.__heroScreen() }
})
const hudBottom = await p.evaluate(() =>
  document.getElementById('hud').getBoundingClientRect().bottom)
check('the speaker is pushed clear of the panel',
  seen.hero.x > seen.right + 10, JSON.stringify(seen))
check('and clear of the readout', seen.hero.y > hudBottom, JSON.stringify([seen.hero.y, hudBottom]))

// And nothing else that takes a press is on top of it.  The pad hands the
// screen over while somebody is talking, but the menu is DOM and knew nothing
// about that: five buttons sat over the answers, and every one of them
// answered a thumb.
const onPanel = await p.evaluate(() => {
  const r = document.getElementById('talk').getBoundingClientRect()
  return [...document.querySelectorAll('#ui .slot, #ui #micro button, #ui #bag li')]
    .filter((e) => {
      const b = e.getBoundingClientRect()
      return b.width > 0 && getComputedStyle(e).pointerEvents !== 'none'
        && b.right > r.left && b.left < r.right
        && b.bottom > r.top && b.top < r.bottom
    })
    .map((e) => `${e.parentElement.id || e.parentElement.className}:${e.textContent.trim()}`)
})
check('nothing but the answers takes a press while talking',
  onPanel.length === 0, onPanel.join(' '))

// The option rows are a finger tall.
const rows = await p.evaluate(() =>
  [...document.querySelectorAll('#talk li')].map((li) => Math.round(li.getBoundingClientRect().height)))
check('option rows are hittable', Math.min(...rows) >= 40, JSON.stringify(rows))
await p.screenshot({ path: `${SP}/pad-talking.png` })

// 10. A tap on the world — above the panel, which swallows its own taps —
// ends it.
const top = await p.evaluate(() => document.getElementById('talk').getBoundingClientRect().top)
const shape = await p.evaluate(() => {
  const t = document.getElementById('talk')
  const cs = getComputedStyle(t)
  return { maxH: cs.maxHeight, pos: cs.position, h: Math.round(t.getBoundingClientRect().height),
    inline: t.getAttribute('style') ?? '', n: t.querySelectorAll('li').length }
})
check('there is world left to tap above the panel', top > 60,
  `panel starts at ${Math.round(top)}px, ${shape.h}px tall, max ${shape.maxH}, `
  + `${shape.pos}, ${shape.n} options, inline "${shape.inline}"`)
// Just above the panel, and not halfway up the glass: a shopkeeper who is
// also a trainer has a taller panel, and halfway up from *its* top is the
// readout, which swallows its own taps and is not the world.
const hudLow = await p.evaluate(() =>
  document.getElementById('hud').getBoundingClientRect().bottom)
check('and it is world rather than the readout', top - 24 > hudLow,
  `${Math.round(top - 24)} against a readout ending at ${Math.round(hudLow)}`)
await touch('touchStart', [[195, Math.round(top - 24)]])
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

// 11b. A thumb can press what the character knows.
//
// `touch.ts` has laid out five slots since it was written — two offset rows,
// the shape the old prototype settled on because a column up the right edge
// is a shape a thumb travels rather than covers — and **two of them were
// used, both hard-coded**: attack and talk.  A character who had bought
// everything a trainer sells had ten abilities and could press none of them.
//
// There is no talk button now and there was not one in the original either.
// You tap the person.
await p.evaluate(() => {
  window.__earn(100000)
  for (const id of [78, 6673, 100, 772, 6343, 34428]) window.__learn(id)
})
await p.waitForTimeout(500)
const full = await pad()
const armed = await p.evaluate(() => window.__bar().spells.length)
check('the thumb can reach the abilities', full.slots.length === 5,
  `${full.slots.length} buttons for ${armed} abilities`)
// And the autocast toggle, which the old prototype had and this one lost.
check('and there is an autocast toggle above them',
  full.autoAt && full.autoAt.y < Math.min(...full.slots.map((s) => s.y)),
  JSON.stringify(full.autoAt))

// 11c. An ability says what it is, and the thumbs stay off the system's band.
//
// `body.touch #tip { display: none }` was the right call and half a decision:
// a hover tooltip on a screen with no pointer appears *under* the finger
// asking for it.  What it left behind is a phone where the only thing an
// ability says about itself is one word on its face, while the desktop
// tooltip carries the rage cost, the cooldown, the global cooldown and the
// reason it cannot be used right now.  A press and hold asks; the answer goes
// above the finger.
{
  const b1 = full.slots[1]
  await touch('touchStart', [[b1.x, b1.y]])
  await p.waitForTimeout(700)
  const held = await p.evaluate(() => window.__pad().held)
  check('holding a button asks what it is', held !== null && held.slot === 1,
    JSON.stringify(held))
  await touch('touchEnd', [])
  await p.waitForTimeout(100)
  check('and letting go stops asking',
    (await p.evaluate(() => window.__pad().held)) === null)
}

// 11d. And the thumbs rest where the phone will let them.
//
// Worked out by hand first: an iPhone 13 is 390 by 844, the buttons drew down
// to y 818 and their hit circles to 831, and the home indicator's band starts
// at 810.  Both thumbs' resting places sat eight to twenty-one pixels inside
// it, and the first push upward from there is a system gesture and not a
// step.  There was no `viewport-fit=cover` either, so `env(safe-area-inset-*)`
// answered nought to anybody who asked.
{
  const L3 = await pad()
  const { height: H3, width: W3 } = p.viewportSize()
  const safe = await p.evaluate(() => {
    const d = document.createElement('div')
    d.style.cssText = 'position:fixed;visibility:hidden;'
      + 'bottom:env(safe-area-inset-bottom);left:env(safe-area-inset-left)'
    document.body.appendChild(d)
    const cs = getComputedStyle(d)
    const out = { bottom: parseFloat(cs.bottom) || 0, left: parseFloat(cs.left) || 0 }
    d.remove()
    return out
  })
  const low = Math.max(L3.home.y + L3.base,
    ...L3.slots.map((s) => s.y + L3.hit))
  check('the thumbs rest above whatever the phone has taken',
    low <= H3 - safe.bottom + 1,
    `lowest ${Math.round(low)} of ${H3} with ${safe.bottom} taken`)
  void W3
}

// 12. Nothing the interface draws may sit on a thumb, or on anything else.
//
// This is the check that was missing.  `#micro`, `#xp` and `#swing` have no
// `position` of their own, and the phone branch of `place` used to remove
// every pin and let the stylesheet stand — so all three fell into normal flow
// inside a layer that covers the screen, and the menu came out as five
// full-width rows across the top half of the glass, over the minimap and the
// player's own frame.  Every behavioural check above passed the whole time,
// because a finger can still press a button that is in the wrong place.
//
// Three rules, and they are the ones the old prototype laid its phone screen
// out by: the corners are the interface, the middle is the game, and the
// bottom third is two thumbs and nothing else.
for (const [name, w, h] of [['portrait', 390, 844], ['landscape', 844, 390],
  ['small', 360, 640]]) {
  await p.setViewportSize({ width: w, height: h })
  await p.waitForTimeout(250)
  const L2 = await pad()
  const panels = await p.evaluate(() =>
    [...document.querySelectorAll('#ui > *, #hud, #help')]
      .filter((e) => !e.hidden && e.getBoundingClientRect().width > 0)
      .map((e) => {
        const r = e.getBoundingClientRect()
        return { id: e.id || e.className, x: r.x, y: r.y, w: r.width, h: r.height }
      })
      // The chrome that is always there.  A panel you opened is allowed to
      // cover things — that is what opening it is — so the modals are not in
      // this, and they are hidden anyway while nobody has asked for them.
      //
      // **`talk` and `shop` are not modals here and used to be excused as
      // ones.**  A conversation is something you have while standing in the
      // world, and on a phone the panel sat at the bottom of the glass with
      // its top edge at 494 against the stick's 528 — over the stick, all five
      // ability buttons and the autocast toggle.  You could neither walk nor
      // swing while somebody was talking to you, and this check said nothing
      // because the one panel that had to be in it was the one taken out.
      .filter((b) => !['ui', 'world', 'sheet', 'bag', 'tip', 'hud']
        .includes(b.id)))

  // A box and a disc.  The stick's ring at rest and each button, at the
  // radius a finger is actually caught at rather than the one drawn.
  const onDisc = (b, cx, cy, r) =>
    Math.hypot(Math.max(b.x, Math.min(cx, b.x + b.w)) - cx,
      Math.max(b.y, Math.min(cy, b.y + b.h)) - cy) < r
  const thumbs = [[L2.home.x, L2.home.y, L2.base],
    [L2.autoAt.x, L2.autoAt.y, L2.autoR * 1.3],
    ...L2.slots.map((sl) => [sl.x, sl.y, L2.hit])]
  const sat = panels.filter((b) => thumbs.some((t) => onDisc(b, t[0], t[1], t[2])))
  check(`${name}: nothing is drawn on a thumb`, sat.length === 0,
    sat.map((b) => `${b.id} ${Math.round(b.x)},${Math.round(b.y)} ` +
      `${Math.round(b.w)}x${Math.round(b.h)}`).join(' | '))

  // And no two panels are in the same place.  A pair that overlaps is a pair
  // where one of them is unreadable, which is how the menu covered the map.
  const hits = []
  for (let i = 0; i < panels.length; i++) {
    for (let j = i + 1; j < panels.length; j++) {
      const a = panels[i], c = panels[j]
      const over = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x)
      const down = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y)
      if (over > 2 && down > 2) hits.push(`${a.id}/${c.id}`)
    }
  }
  check(`${name}: no two panels share a place`, hits.length === 0, hits.join(' '))

  // And all of it is on the glass.  A panel pinned off the right edge of a
  // 360-wide phone is a panel nobody has.
  const off = panels.filter((b) =>
    b.x < -1 || b.y < -1 || b.x + b.w > w + 1 || b.y + b.h > h + 1)
  check(`${name}: all of it is on the glass`, off.length === 0,
    off.map((b) => `${b.id} ${Math.round(b.x)},${Math.round(b.y)} ` +
      `${Math.round(b.w)}x${Math.round(b.h)}`).join(' | '))
  await p.screenshot({ path: `${SP}/pad-layout-${name}.png` })
}

// 12a2. The five buttons come out of the map, and nothing that is always up
// takes a press.
//
// They sat at (266, 459) on a 390 by 664 screen: over the world, out of a
// thumb's reach, and in a place the original has nothing at all.  All five
// *open a panel* — none of them is a readout — so there is no reason for them
// to be on the glass while nobody is opening anything.  The original says
// where they come from: `MinimapCluster` carries `MiniMapTrackingButton` and
// `MinimapZoneTextButton`, so the edge of the map is already the place things
// open from, and ours was in reach and answered nothing.
await p.setViewportSize({ width: 390, height: 844 })
await p.waitForTimeout(250)
{
  const shut = await p.evaluate(() => document.getElementById('micro').hidden)
  check('the five buttons are not on the glass at rest', shut === true,
    `micro hidden: ${shut}`)
  const mapAt = await p.evaluate(() => {
    const r = document.getElementById('map').getBoundingClientRect()
    return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]
  })
  await p.touchscreen.tap(mapAt[0], mapAt[1])
  await p.waitForTimeout(250)
  const open = await p.evaluate(() => {
    const m = document.getElementById('micro')
    const r = m.getBoundingClientRect()
    return { hidden: m.hidden, n: m.querySelectorAll('button').length,
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }
  })
  check('pressing the map brings them out',
    open.hidden === false && open.n === 5, JSON.stringify(open))
  await p.touchscreen.tap(mapAt[0], mapAt[1])
  await p.waitForTimeout(250)
  check('and pressing it again puts them away',
    (await p.evaluate(() => document.getElementById('micro').hidden)) === true)

  // And what is left standing is a readout.  Not a list of ids — a rule: the
  // things that are always up are the ones that *say* something, and a thing
  // that says something takes no press.
  const pressy = await p.evaluate(() =>
    [...document.querySelectorAll('#ui > *, #hud, #help')]
      .filter((e) => !e.hidden && e.getBoundingClientRect().width > 0)
      .filter((e) => [e, ...e.querySelectorAll('*')].some((n) =>
        (n.tagName === 'BUTTON' || n.onclick)
        && getComputedStyle(n).pointerEvents !== 'none'
        && n.getBoundingClientRect().width > 0))
      .map((e) => e.id || e.className))
  check('and everything left standing is a readout', pressy.length === 0,
    pressy.join(' '))
}

// 12b. And the type is the client's own ladder, one rung up.
//
// The phone was 15px, which read back as 39 on the original's own 1024-wide
// screen — over three times its body text.  Scaled the other way, by width,
// the original's 12 comes to 4.6 pixels on a 390-wide phone, which nobody can
// read.  Neither is a rule.  The ladder is the client's (`spec.font`) and a
// phone stands one rung up it, which keeps every size a number the client
// states and puts the floor at 11 — clear of the 9 the wiki measured Hangul
// falling back to a substitute face below.
await p.setViewportSize({ width: 390, height: 844 })
await p.touchscreen.tap(200, 300)
await p.waitForTimeout(300)
{
  const type = await p.evaluate(async () => {
    const r = await fetch('./world/layout.json')
    const spec = r.ok ? (await r.json()).spec : null
    const cs = getComputedStyle(document.documentElement)
    const px = (n) => parseFloat(cs.getPropertyValue(n))
    return { ladder: spec?.font ?? [],
      sizes: ['--font-tiny', '--font-small', '--font-med', '--font-large'].map(px),
      talk: parseFloat(getComputedStyle(document.getElementById('talk')).fontSize) }
  })
  const onLadder = type.sizes.every((v) => type.ladder.includes(v))
  check('the phone type is the client\'s own ladder', onLadder,
    `${type.sizes.join(', ')} out of ${type.ladder.join(' ')}`)
  check('and its floor is above where Hangul falls back',
    Math.min(...type.sizes) >= 11,
    `smallest ${Math.min(...type.sizes)}px, and the wiki measured the fallback `
    + 'starting below 9')
}

// 13. A keyboard puts it all away again.
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

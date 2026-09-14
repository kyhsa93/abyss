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
import { MIN_SCREEN, PER_PAGE } from '../src/touch.ts'
import { abilityOf } from '../src/talk.ts'

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
// 0. The screen that makes a character, which every check below this used to
// step straight over.
//
// It is drawn before the game starts, so `padcheck` skipped it — and measured,
// **lying down three of its thirty-nine buttons were on the glass**.  The
// screen is twice as wide and half as tall in landscape, and a single column
// used none of the width and lost the height twice over.
//
// What is asked is the two things a phone decides: can you *see* what there is
// to choose, and can a finger *hit* it.
for (const [name, w, h] of [['standing', 390, 844], ['lying down', 844, 390]]) {
  await p.setViewportSize({ width: w, height: h })
  await p.waitForTimeout(400)
  const made = await p.evaluate(() => {
    const all = [...document.querySelectorAll(
      '#create .pick, #create .drop, #create .ok, #create .dice, #create .name')]
      // A control with no box is a control nobody can miss: the way back is
      // hidden on the first screen because there is nowhere to go back to.
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
    const on = all.filter((e) => {
      const r = e.getBoundingClientRect()
      return r.top >= -1 && r.bottom <= innerHeight + 1
    })
    const small = all.filter((e) => e.getBoundingClientRect().height < 44)
    const seen = document.querySelector('#create .seen')?.getBoundingClientRect()
    return { all: all.length, on: on.length, small: small.length,
      seen: !!seen && seen.top >= -1 && seen.bottom <= innerHeight + 1 }
  })
  check(`making a character ${name}: most of it is on the glass`,
    made.all > 0 && made.on >= made.all * 0.7,
    `${made.on} of ${made.all} without scrolling`)
  // Forty-four is what both phone platforms publish, and it is the floor this
  // file already holds the game's own controls to.  The numbers on this screen
  // are the client's own and come out at 38 — a number the client states is
  // not automatically a number a thumb can use.
  check(`making a character ${name}: every one of them takes a finger`,
    made.small === 0, `${made.all - made.small} of ${made.all} at 44 px or more`)
  // And what you are choosing *for* stays where you can see it.  It is 410
  // pixels of a 844-pixel screen and it used to scroll away, so by the time
  // you were choosing a beard you could not see what a beard did.
  check(`making a character ${name}: the preview is on the glass`, made.seen)
}
await p.setViewportSize({ width: 390, height: 844 })
await p.waitForTimeout(300)

// A character first.  The game opens on the screen that makes one now, and
// that screen covers the glass on purpose — so every check below it would be
// driving a stick nobody can reach.
await p.evaluate(() => window.__makeOne?.('가온'))
await p.waitForTimeout(200)
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

// 7. There is no talk button, and nothing happens on empty ground.
//
// These two checks were written for the corner square when it said 대화 —
// *dark with nobody in earshot, lit with somebody in it* — and issue 143 took
// that button away: the original has none, you press the person.  They went on
// pressing the corner and passing, because **a press on a square also lifted
// as a tap on the world**, and a tap anywhere with a shopkeeper in earshot
// opened him.  So the sentences were true and about nothing, and the thing
// issue 143 asked to have checked — that there is no such button — was not.
await p.evaluate(() => window.__cam({ x: -9200, y: -600, zoom: 1 }))
await p.waitForTimeout(200)
await p.screenshot({ path: `${SP}/pad-idle.png` })
const btn = L.slots[0]
{
  // Both halves of the screen that could carry one.  Every square the cluster
  // draws is an ability out of the spellbook — the pad draws from the same
  // list it fires from, so that is the whole of the canvas — and nothing on
  // the page that takes a press says it either.
  const talky = await p.evaluate(() => {
    const pad = window.__pad()
    return {
      notAbilities: pad.onPage.filter((id) => !pad.knows.includes(id)),
      squares: window.__bar().squares.filter((s) => s.label.includes('대화'))
        .map((s) => s.key),
      pressable: [...document.querySelectorAll('button, [role=button], .slot')]
        .filter((e) => e.getBoundingClientRect().width > 0
          && e.textContent.includes('대화'))
        .map((e) => `${e.parentElement?.id || e.parentElement?.className}:`
          + e.textContent.trim()),
    }
  })
  check('there is no talk button anywhere on the screen',
    talky.notAbilities.length === 0 && talky.squares.length === 0
    && talky.pressable.length === 0, JSON.stringify(talky))
}
await touch('touchStart', [[195, 330]])
await touch('touchEnd', [])
await p.waitForTimeout(150)
check('a tap with nobody there opens nothing',
  await p.evaluate(() => document.getElementById('talk').hidden))

// 8. Beside a trader: tapping *him* opens the conversation — and the ground
// beside him, and a square pressed beside him, do not.
//
// Stood next to a *named* one rather than at a coordinate somebody once saw
// one at: the shopkeepers wander now, so a fixed spot is a check that fails
// one run in three for a reason that has nothing to do with the pad.
const trader = await p.evaluate(() => {
  // Somebody who stays put: `creature.wander_distance` is nought for anyone
  // behind a counter, and a conversation with somebody who walks off ends
  // itself halfway through the check.
  const who = window.__all()
    .filter((n) => n.kind === 'townsfolk' && !n.wander && n.r !== 'prey')
  const near = who.find((n) => Math.hypot(n.x + 9461.6, n.y - 16.19) < 40) ?? who[0]
  window.__cam({ x: near.x - 1.2, y: near.y, zoom: 1.4 })
  return { x: near.x, y: near.y }
})
await p.waitForTimeout(400)
await p.screenshot({ path: `${SP}/pad-ready.png` })
const talkShut = () => p.evaluate(() => document.getElementById('talk').hidden)
/** A tap on a point of the world: down and up in the same place, by a finger. */
const tapWorld = async (x, y) => {
  const at = await p.evaluate(([wx, wy]) => window.__screenAt(wx, wy), [x, y])
  await touch('touchStart', [[Math.round(at[0]), Math.round(at[1])]])
  await touch('touchEnd', [])
  await p.waitForTimeout(150)
  return at.map(Math.round)
}
// The ground first: four yards past him, up the glass, which leaves the hero
// well inside earshot — and earshot was all the old rule asked.  Issue 143's
// table says what empty ground does, and it is nothing.
{
  const at = await tapWorld(trader.x + 4, trader.y)
  check('a tap on the ground beside a person does not open him', await talkShut(),
    `tapped ${at.join(',')}, four yards past him`)
}
// Then a square, pressed off-centre the way a thumb lands, up to the hit
// radius.  It has to ask for that square's own ability and nothing else: this
// press used to lift as a tap as well, and beside a shopkeeper that opened him
// — which is all this line used to watch for.
//
// **Off the corner's open side, to the right.**  The press used to land
// 0.9 of a hit radius to the *left*, and once the buttons were halved that is
// 18.9 pixels from the corner and 14.9 from the square beside it, so the pad
// quite rightly took the neighbour.  Nobody saw, because the line was
// watching a panel open and not which ability heard.
{
  const was = await p.evaluate(() => ({ heard: window.__bar().heard,
    first: window.__pad().onPage[0] }))
  await touch('touchStart', [[btn.x + L.hit * 0.9, btn.y]])
  await touch('touchEnd', [])
  await p.waitForTimeout(150)
  const got = await p.evaluate(() => ({ heard: window.__bar().heard,
    asked: window.__bar().asked,
    talking: !document.getElementById('talk').hidden }))
  check('a thumb beside the button still presses it',
    got.heard > was.heard && got.asked === was.first && !got.talking,
    `wanted ${was.first}: ${JSON.stringify(got)}`)
}
// And him.
{
  const at = await tapWorld(trader.x, trader.y)
  check('tapping a person opens a conversation', !(await talkShut()),
    `tapped him at ${at.join(',')}`)
}
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

// 10b. And a tap on something that will fight back aims at it.
//
// The other half of the same gesture, and the half nobody had checked: this
// page promised *"세계를 탭하면 겨눠지고"* and the harness only ever watched
// the conversation close.  There is no talk button and there is no target
// button either — the world is the button.
{
  // `__foe` walks the hero up to the nearest thing that will fight back, which
  // is the same call the fight checks use — one way to find a quarry rather
  // than a second one here that could find a different kind of thing.
  //
  // Two calls and a wait between them, because the camera eases: asking where
  // something is on the glass in the same breath as walking up to it answers
  // for the screen you were looking at before.  And **then it has to still be
  // alive** — the first version of this walked up to a one-health rabbit,
  // waited for the camera, and tapped a corpse.
  let shot = null
  for (let tries = 0; tries < 4 && !shot; tries++) {
    const foe = await p.evaluate(() => window.__foe())
    if (!foe) break
    await p.waitForTimeout(700)
    shot = await p.evaluate((f) => {
      const me = window.__hero()
      const here = window.__all().find((n) =>
        Math.hypot(n.x - f.x, n.y - f.y) < 0.2)
      if (!here || here.dead) return null
      void me
      // The world point rides along with the screen point, because what is
      // watched afterwards is the creature and not the pixel.
      return { kind: here.kind,
        at: [...window.__screenAt(here.x, here.y), here.x, here.y] }
    }, foe)
  }
  // Loudly when there is nobody to tap, rather than quietly skipped: a check
  // that does not run looks exactly like a check that passed.
  if (!shot || !shot.at) {
    check('and a tap on something that fights back aims at it', false,
      `nothing to tap: ${JSON.stringify(shot)}`)
  } else {
    await touch('touchStart', [[Math.round(shot.at[0]), Math.round(shot.at[1])]])
    await touch('touchEnd', [])
    // Watched rather than waited for, and **either outcome counts**: a level
    // ten character one-shots a chicken, so waiting a quarter of a second and
    // then asking what the target is answers "nothing" about a fight that
    // started and finished.  A corpse that was alive when it was tapped is
    // proof the tap aimed at it.
    let got = null
    for (let i = 0; i < 12 && !got; i++) {
      const now = await p.evaluate((f) => ({
        target: window.__you().target,
        gone: !!window.__all().find((n) =>
          Math.hypot(n.x - f.x, n.y - f.y) < 0.2)?.dead,
      }), { x: shot.at[2], y: shot.at[3] })
      if (now.target !== null || now.gone) got = now
      else await p.waitForTimeout(60)
    }
    check('and a tap on something that fights back aims at it',
      got !== null, `tapped a ${shot.kind} — ${JSON.stringify(got)}`)
  }
}

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

// And **all** of them, which is issue 203.  Five buttons was never the
// problem; five buttons and no way past them was.  The corner stays the
// attack and the other four turn, so a character with sixteen abilities is
// four pages deep.
{
  const seen = new Set()
  const start = await p.evaluate(() => window.__pad())
  for (const id of start.onPage) seen.add(id)
  const ring = await p.evaluate(() => window.__pad().pageAt)
  const walked = [start.page]
  for (let i = 0; i < start.pages; i++) {
    await touch('touchStart', [[ring.x, ring.y]])
    await p.waitForTimeout(120)
    await touch('touchEnd', [])
    await p.waitForTimeout(200)
    const now = await p.evaluate(() => window.__pad())
    walked.push(now.page)
    for (const id of now.onPage) seen.add(id)
  }
  const missed = start.knows.filter((id) => !seen.has(id))
  check('and every ability in the spellbook comes under a thumb',
    missed.length === 0 && start.pages > 1,
    `${seen.size} of ${start.knows.length} over ${start.pages} pages`
    + (missed.length ? `, missing ${missed.join(', ')}` : ''))
  // Wrapping, so going back one is one press rather than all of them minus
  // one — and so the ring cannot dead-end on the last page.
  check('and the page turn comes back round',
    walked.at(-1) === 0 && walked.length === start.pages + 1,
    `pages walked: ${walked.join(' -> ')}`)
}
// And the autocast toggle, which the old prototype had and this one lost.
check('and there is an autocast toggle above them',
  full.autoAt && full.autoAt.y < Math.min(...full.slots.map((s) => s.y)),
  JSON.stringify(full.autoAt))
// And a finger works it, which nothing asked.  Issue 226 reported tapping it
// and nothing happening, and could not tell whether the button was broken or
// the coordinate was — so this presses it through the pointer, twice, and
// watches the state it is supposed to carry.  A toggle that only a keyboard
// can reach is a toggle a phone has not got.
if (full.autoAt) {
  const was = (await pad()).auto
  await touch('touchStart', [[Math.round(full.autoAt.x), Math.round(full.autoAt.y)]])
  await touch('touchEnd', [])
  await p.waitForTimeout(250)
  const flipped = (await pad()).auto
  await touch('touchStart', [[Math.round(full.autoAt.x), Math.round(full.autoAt.y)]])
  await touch('touchEnd', [])
  await p.waitForTimeout(250)
  const back = (await pad()).auto
  check('and a finger turns it on and off again',
    flipped === !was && back === was,
    `${was} -> ${flipped} -> ${back} at `
    + `${Math.round(full.autoAt.x)},${Math.round(full.autoAt.y)}`)
}

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
  // **What is painted, not that something is held.**  This asked only
  // `held.slot === 1`, which is the pad knowing a finger is down — and that is
  // true of a tooltip that painted nothing, or painted another ability's
  // words, which is exactly what a turned page did once (`asked.slot + 1`).
  // So the scene hands back the lines it actually drew, and they are held
  // against the spellbook: the ability's own word, its cost, and its wait.
  //
  // On a square whose ability has a cost *and* a cooldown of its own, so both
  // numbers the promise names are read.  On this bar that square is on the
  // second page, so the ring is turned there by a finger and back after.
  const book = await p.evaluate(async () => {
    const r = await fetch('./world/spells.json')
    return r.ok ? Object.values((await r.json()).books).flat()
      .map((s) => ({ id: s.id, cost: s.cost, pct: s.pct ?? 0, cool: s.cool }))
      : []
  })
  const start = await pad()
  const onBar = (await p.evaluate(() => window.__bar().bar))
    .filter((id) => id !== null && start.knows.includes(id))
  const at = onBar.findIndex((id) => {
    const s = book.find((r) => r.id === id)
    return !!s && s.cost > 0 && s.cool > 0 && !s.pct
  })
  const page = Math.max(0, Math.floor(at / PER_PAGE))
  const slot = at >= 0 ? at % PER_PAGE : 1
  const turn = async (to) => {
    for (let i = 0; i < start.pages && (await pad()).page !== to; i++) {
      await touch('touchStart', [[start.pageAt.x, start.pageAt.y]])
      await p.waitForTimeout(120)
      await touch('touchEnd', [])
      await p.waitForTimeout(200)
    }
  }
  await turn(page)
  const b1 = start.slots[slot]
  await touch('touchStart', [[b1.x, b1.y]])
  await p.waitForTimeout(700)
  const asked = await p.evaluate(() => {
    const now = window.__pad()
    return { held: now.held, told: now.told, onPage: now.onPage, page: now.page }
  })
  const want = asked.onPage[slot]
  const sp = book.find((r) => r.id === want)
  const word = abilityOf(want)?.[0] ?? null
  const wait = sp?.cool ? `재사용 ${(sp.cool / 1000).toFixed(0)}초` : null
  const lines = asked.told?.lines ?? []
  check('holding a button asks what it is',
    at >= 0 && asked.page === page && asked.held?.slot === slot
    && asked.told?.id === want && word !== null
    && lines[0]?.startsWith(word) === true
    && lines[0]?.endsWith(` ${sp.cost}`) === true && lines.includes(wait),
    `page ${page} square ${slot} is ${want} (${word}, costs ${sp?.cost}, `
    + `${wait ?? 'no cooldown'}) — painted ${JSON.stringify(lines)}`)
  await touch('touchEnd', [])
  await p.waitForTimeout(100)
  const after = await p.evaluate(() => window.__pad())
  check('and letting go stops asking', after.held === null && after.told === null,
    JSON.stringify({ held: after.held, told: after.told }))
  await turn(0)
}

// 11c2. Each of the five squares, pressed, fires that square's ability.
//
// Issue 143 promised it, and the line that was claimed to keep it — *a thumb
// beside the button still presses it* — was watching a conversation open,
// left over from the day the corner was a talk button.  Asked beside a person
// on purpose: that is where a press used to turn into a conversation instead.
//
// "Fires" is two facts and both are read.  Every press has to reach `cast`
// with the square's own ability — refused or not, because whether there was
// rage for it is a different question — and every one that *could* go off has
// to have gone.  `__topUp` fills the bar and clears the global wait before
// each press, so "could" is as wide as it gets without aiming at somebody.  At
// least one has to have gone, or "every one that could" is a promise about
// nothing.
{
  await p.evaluate((t) => window.__cam({ x: t.x - 1.2, y: t.y, zoom: 1.4 }), trader)
  await p.waitForTimeout(500)
  const Lq = await pad()
  const rows = []
  for (let i = 0; i < Lq.slots.length; i++) {
    const want = Lq.onPage[i]
    const could = (await p.evaluate(() => window.__topUp())).includes(want)
    const was = await p.evaluate(() => window.__bar())
    const s = Lq.slots[i]
    await touch('touchStart', [[Math.round(s.x), Math.round(s.y)]])
    await touch('touchEnd', [])
    await p.waitForTimeout(150)
    const got = await p.evaluate(() => ({ ...window.__bar(),
      talking: !document.getElementById('talk').hidden }))
    const heard = got.heard > was.heard && got.asked === want
    const went = got.fired.n > was.fired.n && got.fired.id === want
    rows.push({ square: i, want, could, heard, went, talking: got.talking,
      ok: heard && (!could || went) && !got.talking })
  }
  check('and each of the five squares, pressed, fires its own ability',
    rows.length === 5 && Lq.onPage.length === 5
    && rows.every((r) => r.ok) && rows.some((r) => r.went),
    JSON.stringify(rows))
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
// The chat window's shares, out of the `layout.json` `placePhone` reads them
// from rather than typed here: the client's box over the client's screen.  The
// check used to type 0.42 and 0.031 and never read the height, so a window at
// the right width and the wrong depth passed it.
const logSpec = await p.evaluate(async () => {
  const r = await fetch('./world/layout.json')
  if (!r.ok) return null
  const spec = await r.json()
  const f = spec.frames?.log
  return f ? { w: f.w / spec.ref[0], h: f.h / spec.ref[1], x: f.x / spec.ref[0] } : null
})
const chats = {}
for (const [name, w, h] of [['portrait', 390, 844], ['landscape', 844, 390],
  // The floor, read off `touch.ts` rather than typed here: a minimum written
  // in a document and a minimum the layout is tested at are two numbers, and
  // two numbers drift — which is exactly how 1024 x 640 and 390 x 664 came to
  // disagree.  Issue 203.
  ['the floor', MIN_SCREEN.width, MIN_SCREEN.height],
  ['the floor, lying down', MIN_SCREEN.height, MIN_SCREEN.width]]) {
  await p.setViewportSize({ width: w, height: h })
  await p.waitForTimeout(250)
  const L2 = await pad()
  // **`#talk` is in this list by name because it is not inside `#ui`.**
  //
  // The note below says the conversation panel is the one that had to be in
  // this check — and the selector never reached it: `#talk` is a child of
  // `body`, beside `#hud` and `#help`, so `#ui > *` walked straight past it
  // and the exclusion list underneath was excusing something that was never
  // there.  A check that names what it leaves out can still be missing what
  // it meant to keep.
  const panels = await p.evaluate(() =>
    [...document.querySelectorAll('#ui > *, #hud, #help, #talk')]
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

  // The player's own frame is the old game's, at the old game's size and in
  // the old game's place: 2.9 : 1, never under fourteen pixels tall, at
  // `(6, topBand + 8)`.  Every number in it is a function of the glass — the
  // old `theme.ts` derived them and so does this — so the check is the ratio
  // and the floor rather than a pair of pixel counts that would only be true
  // on one phone.
  {
    const me = await p.evaluate(() => {
      const r = document.getElementById('me')?.getBoundingClientRect()
      return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null
    })
    check(`${name}: the player's frame is the old game's shape`,
      !!me && Math.abs(me.w / me.h - 2.9) < 0.12 && me.h >= 14,
      me ? `${Math.round(me.w)} x ${Math.round(me.h)} at `
        + `${Math.round(me.x)},${Math.round(me.y)} — `
        + `${(me.w / me.h).toFixed(2)} : 1` : 'no frame')
    // **And where, which is two places.**  Standing up the old game's band is
    // left empty and the frame sits at `(6, topBand + 8)` — 41 on every phone
    // this file lays out.  Lying down the owner decided the band is not kept
    // (issue 229), because 41 pixels is a tenth of a 390-tall screen, so the
    // frame is at (6, 8).  The band is worked out the way `placePhone` works
    // it out, because 41 is true of these phones and not of a tablet.  This
    // line did not exist, and the frame sat at (6, 41) lying down as well.
    const at = await p.evaluate(() => {
      const r = document.getElementById('units')?.getBoundingClientRect()
      return r ? [Math.round(r.x), Math.round(r.y)] : null
    })
    const band = Math.round(54 * Math.max(0.62, Math.min(1.15, Math.min(w, h) / 760)))
    const want = h >= w ? [6, band + 8] : [6, 8]
    check(`${name}: and it sits under the old band standing up and at the top lying down`,
      !!at && at[0] === want[0] && at[1] === want[1],
      `at ${at?.join(',')}, wanted ${want.join(',')}`)
  }

  // A box and a disc.  The stick's ring at rest and each button, at the
  // radius a finger is actually caught at rather than the one drawn.
  const onDisc = (b, cx, cy, r) =>
    Math.hypot(Math.max(b.x, Math.min(cx, b.x + b.w)) - cx,
      Math.max(b.y, Math.min(cy, b.y + b.h)) - cy) < r
  const thumbs = [[L2.home.x, L2.home.y, L2.base],
    [L2.autoAt.x, L2.autoAt.y, L2.autoR * 1.3],
    // And the page turn, which arrived with issue 203.  A control added to
    // this cluster and not added to this list is a control the check has
    // never heard of.
    [L2.pageAt.x, L2.pageAt.y, L2.pageR * 1.3],
    ...L2.slots.map((sl) => [sl.x, sl.y, L2.hit])]
  // The chat window is in the original's corner, at the original's shares of
  // the glass — `log BOTTOMLEFT (32, 95) 430 x 120` over a 1024 x 768 screen,
  // so 3.1% in and 42% by 15.6% — and **lying down that is a different box**,
  // twice as wide and a third as deep.  It was the same 160 x 88 at all three
  // sizes: the portrait box turned on its side, which is the blindness issue
  // 227 found on the screen that makes a character.
  //
  // The one number that is not the original's is how far up it sits.  At the
  // original's 12.4% it lands on the stick — 16% of it standing up and 78%
  // lying down — and unlike the experience bar this is read *and* covered by
  // the hand that is driving.  So: the original's corner and shape, and this
  // screen's own rule about the bottom third.
  {
    const box = await p.evaluate(() => {
      const r = document.getElementById('log')?.getBoundingClientRect()
      return r ? { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom } : null
    })
    const stickTop = L2.home.y - L2.base
    // Width, inset *and height*, each to the pixel the share rounds to.
    check(`${name}: the chat window is the original's shape`,
      !!box && !!logSpec && Math.abs(box.w - w * logSpec.w) <= 1.5
      && Math.abs(box.h - h * logSpec.h) <= 1.5
      && Math.abs(box.x - w * logSpec.x) <= 1.5,
      box && logSpec ? `${Math.round(box.w)} x ${Math.round(box.h)} at `
        + `${Math.round(box.x)},${Math.round(box.y)} — wanted `
        + `${Math.round(w * logSpec.w)} x ${Math.round(h * logSpec.h)} at `
        + `${Math.round(w * logSpec.x)} (${(100 * logSpec.w).toFixed(1)}% by `
        + `${(100 * logSpec.h).toFixed(1)}%, ${(100 * logSpec.x).toFixed(1)}% in)`
        : `${box ? '' : 'no chat window '}${logSpec ? '' : 'no layout.json'}`)
    if (box) chats[name] = box
    check(`${name}: and it stops above the stick`,
      !!box && box.b <= stickTop + 1,
      box ? `bottom ${Math.round(box.b)} of a stick starting at `
        + `${Math.round(stickTop)}` : '')
  }

  // **Two exceptions, each written down rather than quietly allowed.**
  //
  // The experience bar sits on the bottom edge, which is where the original
  // has it — `xp BOTTOM (0, 40) 1024 x 13` out of `FrameXML` — and the rule
  // above says the bottom third is two thumbs and nothing else.  It is
  // allowed because it is **reading and not pressing**: nobody taps it, so it
  // does not take a thumb's place.  What is checked instead is that it stays
  // that: a thin strip, *below* everything a thumb touches, and on the
  // physical bottom edge with nothing under it.
  //
  // **The swing bar is the second, and it is named on its own** rather than
  // let in on the first one's reason.  It went down with the experience bar by
  // the owner's decision (issue 228) because the original has it down there
  // too — `cast BOTTOM (0, 55)`, fifteen above the bar — and it is read and
  // never pressed for the same reason; but it is a different strip with a
  // different shape, three pixels rather than twelve and sitting on the bar
  // rather than on the edge of the glass, so it has its own assertions.  An
  // exception list that grows by an id with no sentence beside it is exactly
  // the silent loosening this paragraph exists to prevent.
  //
  // A rule loosened in silence is the same accident as a check that promised
  // less than it looked like — which this repository had again in issue 226.
  const READ_ONLY = {
    xp: { why: 'how far through the level, read and never pressed', thin: 14 },
    swing: { why: 'how far through the swing, read and never pressed', thin: 4 },
  }
  const sat = panels.filter((b) => !(b.id in READ_ONLY)
    && thumbs.some((t) => onDisc(b, t[0], t[1], t[2])))
  const lowest = Math.max(...thumbs.map((t) => t[1] + t[2]))
  // Read by id rather than out of `panels`, which drops whatever is hidden: a
  // strip that is not on the glass would skip its own assertions and look
  // exactly like one that passed them.
  const strips = await p.evaluate((ids) => Object.fromEntries(ids.map((id) => {
    const e = document.getElementById(id)
    const r = e?.getBoundingClientRect()
    return [id, e && !e.hidden && r.width > 0
      ? { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom,
        pinned: e.style.bottom, gap: Math.round(innerHeight - r.bottom) }
      : null]
  })), Object.keys(READ_ONLY))
  for (const [id, { why, thin }] of Object.entries(READ_ONLY)) {
    const b = strips[id]
    check(`${name}: the strip that is read and not pressed is under the thumbs (#${id})`,
      !!b && b.h <= thin && b.y >= lowest - 1,
      b ? `#${id}, ${why}: ${Math.round(b.h)} px tall at ${Math.round(b.y)}, `
        + `the lowest thumb ending at ${Math.round(lowest)}`
        : `#${id} is not on the glass`)
  }
  // And the experience bar is on the *physical* bottom, not the safe one — the
  // owner asked for no gap under it.  It used to be pinned to
  // `env(safe-area-inset-bottom)`, and a headless browser reports that inset
  // as nought, so the pixels alone looked flush while a real iPhone showed 34
  // pixels of world under the bar.  Both are read: the rule, which is the only
  // place that difference shows from here, and the box.
  {
    const xp = strips.xp
    check(`${name}: and it sits on the bottom edge with no gap`,
      !!xp && xp.pinned === '0px' && xp.gap === 0,
      xp ? `#xp bottom: ${xp.pinned || '(unset)'}, ${xp.gap} px under it` : 'no #xp')
  }
  // And the swing bar directly on top of it, in the original's order bottom
  // up — the bar, two pixels, the swing — and the full width, as the owner
  // asked in issue 228.  Stacked off the bar rather than off the glass, so if
  // the bar ever grows this still says whether the two touch.
  {
    const { xp, swing } = strips
    check(`${name}: and the swing bar sits on the experience bar, the full width`,
      !!xp && !!swing && swing.bottom <= xp.y + 0.5 && xp.y - swing.bottom <= 3
      && swing.x <= 0.5 && Math.abs(swing.w - w) <= 1,
      xp && swing ? `swing ${Math.round(swing.x)},${Math.round(swing.y)} `
        + `${Math.round(swing.w)}x${Math.round(swing.h)}, `
        + `${Math.round(xp.y - swing.bottom)} px above a bar at ${Math.round(xp.y)}`
        : 'a strip is missing')
  }
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
  // **How far this screen may pull back, and what it leaves of a person.**
  //
  // The far limit used to be the constant 0.12 with a comment defending a
  // frame-rate cliff that plates had already removed.  It is the opening
  // framing halved now — halved by `cameraDistanceMaxFactor`'s own `maxValue`
  // in the client's options, which is a slider from 1 to 2 — and because the
  // opening framing is a function of the glass, **a phone and a desktop get
  // different floors without either being typed**.  That is the good property
  // and it is also the risk: nobody ever sees the phone's number, so it is
  // asserted at every size this file lays out rather than written in a
  // paragraph.  On a 390-wide phone it is 0.406 down to 0.203, which leaves 13
  // pixels of sprite; `viewcheck` holds the desktop's 0.8 down to 0.4.
  //
  // How small a person may get is the **smallest type on the same screen**,
  // read off the page rather than typed: that number is already the client's
  // own ladder one rung up, and a person you cannot make out is the same
  // failure as a word you cannot read.  It is not slack — at `MIN_SCREEN` the
  // sprite comes to 12 pixels against a type floor of 11.
  const zs = await p.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    return { ...window.__zooms(),
      type: parseFloat(cs.getPropertyValue('--font-tiny')) }
  })
  check(`${name}: the zoom floor is the opening framing over the camera slider`,
    Math.abs(zs.floor - Math.min(1, zs.fit) / zs.follow) < 1e-9,
    `${zs.fit.toFixed(3)} open, ${zs.floor.toFixed(3)} at the widest, `
    + `${zs.across.toFixed(0)} yards across`)
  check(`${name}: and a person is no smaller there than the type beside him`,
    zs.cell >= zs.type,
    `${zs.cell.toFixed(1)} pixels of sprite against ${zs.type}px of type`)
  console.log(`      (${name}: ${zs.fit.toFixed(3)} open, `
    + `${zs.floor.toFixed(3)} widest, ${zs.across.toFixed(0)} yards, `
    + `${zs.cell.toFixed(1)}px sprite)`)
  await p.screenshot({ path: `${SP}/pad-layout-${name}.png` })
}
// And lying down the chat window is a different box and not the same one
// turned: **wider and lower** — lower as in less tall, the issue's own 낮다.
// It follows from the shares above on any screen wider than it is tall, and it
// is asserted anyway, because it is the sentence issue 230 wrote and the one a
// reader checks by eye: the window was once the same 160 x 88 both ways round.
for (const [up, side] of [['portrait', 'landscape'],
  ['the floor', 'the floor, lying down']]) {
  const a = chats[up], c = chats[side]
  check(`${side}: lying down the chat window is wider and lower than standing up`,
    !!a && !!c && c.w > a.w && c.h < a.h,
    a && c ? `${Math.round(a.w)} x ${Math.round(a.h)} standing, `
      + `${Math.round(c.w)} x ${Math.round(c.h)} lying down` : 'a size is missing')
}

// 12a2. The buttons come out of the map, and nothing that is always up takes a
// press.
//
// They sat at (266, 459) on a 390 by 664 screen: over the world, out of a
// thumb's reach, and in a place the original has nothing at all.  Every one of
// them *opens a panel* — none is a readout — so there is no reason for them to
// be on the glass while nobody is opening anything.  There were five; the
// workbench issue 200 added makes six, and the count is read off the bar
// rather than written down twice.  The original says
// where they come from: `MinimapCluster` carries `MiniMapTrackingButton` and
// `MinimapZoneTextButton`, so the edge of the map is already the place things
// open from, and ours was in reach and answered nothing.
await p.setViewportSize({ width: 390, height: 844 })
await p.waitForTimeout(250)
{
  // Nobody is being talked to first.  A conversation takes the menu away on
  // purpose — `body.touch.talking #micro` — and one was still going here,
  // which the attribute check below could not see and the glass check can.
  // Ended the way a thumb ends it, as in 10: **not with `Escape`**, because
  // any key turns the pad off and the page is a desktop from then on.
  const talkingNow = () => p.evaluate(() => document.body.classList.contains('talking'))
  if (await talkingNow()) {
    const top = await p.evaluate(() => document.getElementById('talk').getBoundingClientRect().top)
    await touch('touchStart', [[195, Math.round(top - 24)]])
    await touch('touchEnd', [])
    await p.waitForTimeout(250)
  }
  check('the menu is asked about with nobody being talked to', !(await talkingNow()),
    await p.evaluate(() => document.body.className))
  // **Asked of the glass, not of the attribute.**  This read `.hidden` and
  // passed for as long as the menu stood open over the world: the attribute
  // was set and `body.touch #micro { display: grid }` beat it.  What a player
  // sees is a box with a size, so that is what is measured.
  const onGlass = () => p.evaluate(() => {
    const m = document.getElementById('micro')
    const r = m.getBoundingClientRect()
    return getComputedStyle(m).display !== 'none' && r.width > 0 && r.height > 0
  })
  const shut = !(await onGlass())
  check('the buttons are not on the glass at rest', shut === true,
    `micro on the glass: ${!shut}`)
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
      display: getComputedStyle(m).display, body: document.body.className,
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }
  })
  check('pressing the map brings them out',
    open.hidden === false && open.n >= 5 && await onGlass(), JSON.stringify(open))
  // One switch for autocast on a phone, and it is the one beside the ability
  // buttons.  The menu carried a second, so the same flag had two places to
  // be turned and one of them was behind a press on the map.
  const autos = await p.evaluate(() => [...document.querySelectorAll('#micro button')]
    .filter((b) => b.textContent.includes('자동')).length)
  check('and autocast is not one of them — the cluster has it', autos === 0,
    `${autos} autocast buttons in the menu`)
  await p.touchscreen.tap(mapAt[0], mapAt[1])
  await p.waitForTimeout(250)
  check('and pressing it again puts them away', !(await onGlass()))

  // **And lying down they come out beside the map, not across the glass
  // from it.**  The row used to start at the player's frame in the top left,
  // so the corner you pressed and the menu you got were the width of the
  // screen apart.  Asked at the landscape floor and at a common phone, and
  // the menu must still clear the player's frame at both.
  for (const [lw, lh] of [[MIN_SCREEN.height, MIN_SCREEN.width], [844, 390]]) {
    await p.setViewportSize({ width: lw, height: lh })
    await p.waitForTimeout(300)
    const at = await p.evaluate(() => {
      const r = document.getElementById('map').getBoundingClientRect()
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]
    })
    await p.touchscreen.tap(at[0], at[1])
    await p.waitForTimeout(300)
    const side = await p.evaluate(() => {
      const box = (id) => document.getElementById(id).getBoundingClientRect()
      const m = box('micro'), map = box('map'), me = box('units')
      return { shown: m.width > 0, gap: Math.round(map.left - m.right),
        top: Math.round(m.top - map.top), clear: Math.round(m.left - me.right) }
    })
    check(`${lw}x${lh}: lying down the menu opens beside the map`,
      side.shown && side.gap >= 0 && side.gap <= 12 && Math.abs(side.top) <= 2
      && side.clear > 0, JSON.stringify(side))
    await p.touchscreen.tap(at[0], at[1])
    await p.waitForTimeout(250)
  }
  await p.setViewportSize({ width: 390, height: 844 })
  await p.waitForTimeout(300)

  // And what is left standing is a readout.  Not a list of ids — a rule: the
  // things that are always up are the ones that *say* something, and a thing
  // that says something takes no press.
  const pressy = await p.evaluate(() =>
    [...document.querySelectorAll('#ui > *, #hud, #help')]
      .filter((e) => getComputedStyle(e).display !== 'none'
        && e.getBoundingClientRect().width > 0)
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
  // And the floor applies to **what is on the screen**, not to four tokens.
  //
  // Issue 203 went looking for "9px Hangul in the reading panel" and found it
  // one panel over: `body.touch #hud` was a flat nine, keys in Korean and all,
  // and the ladder above it said nothing about that because the panel does not
  // use a token.  So the check reads every element that actually draws text
  // and asks the question the floor exists to answer.
  //
  // **Digits are exempt and that is the reason, not an excuse**: the floor is
  // where *Hangul* falls back to a substitute face, and `0 / 400` on a bar has
  // no Hangul in it.
  const HANGUL = /[\uac00-\ud7a3]/
  //
  // Hidden panels are walked too, and deliberately: a shop that is shut is
  // still a shop you open, and the panel this found was one nothing had
  // looked at because it is off until somebody presses a key.
  const small = await p.evaluate((floor) => {
    const out = []
    const walk = (e) => {
      const own = [...e.childNodes]
        .some((n) => n.nodeType === 3 && n.textContent.trim())
      const px = parseFloat(getComputedStyle(e).fontSize)
      if (own && px < floor) {
        out.push({ id: e.id || e.className || e.tagName, px,
          text: (e.textContent || '').trim().slice(0, 24) })
      }
      for (const c of e.children) walk(c)
    }
    for (const id of ['ui', 'hud', 'help']) {
      const e = document.getElementById(id)
      if (e) walk(e)
    }
    return out
  }, 11)
  const hangul = small.filter((r) => HANGUL.test(r.text))
  check('and nothing on the glass writes Hangul below it',
    hangul.length === 0,
    hangul.length
      ? hangul.slice(0, 3).map((r) => `${r.id} ${r.px}px "${r.text}"`).join(', ')
      : `${small.length} smaller than ${11}px and not one of them Hangul`
        + (small.length ? ` (${small.map((r) => r.id).join(', ')})` : ''))
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

// 14. And the screen that chooses a character, on a phone.
//
// It is one of only two full-screen layers in this game and the other one
// already caught this class of mistake twice: a `display: flex` that beat the
// `hidden` attribute made every touch land on an invisible layer, and every
// control on it computed `pointer-events: none` so nothing could be pressed
// at all.  Both were invisible to a check that clicked from script.
{
  await p.setViewportSize({ width: 390, height: 844 })
  await p.evaluate(() => window.__pickNew())
  await p.waitForTimeout(200)
  await p.evaluate(() => window.__makeOne('둘째', 5))
  await p.waitForTimeout(300)
  await p.reload()
  await p.waitForFunction(() => window.__picks !== undefined, null, { timeout: 60000 })
  await p.waitForTimeout(800)
  const list = await p.evaluate(() => window.__picks())
  check('two characters bring the list up on a phone',
    list.up === true && list.rows.length >= 2,
    `${list.rows.length} characters, list ${list.up ? 'up' : 'down'}`)
  // On the glass, which is the promise every other panel here makes.
  const box = await p.locator('#pick .stage').boundingBox()
  const { width: W4, height: H4 } = p.viewportSize()
  check('and the whole of it is on the glass',
    !!box && box.x >= 0 && box.y >= 0
    && box.x + box.width <= W4 + 1 && box.y + box.height <= H4 + 1,
    box ? `${Math.round(box.x)},${Math.round(box.y)} `
      + `${Math.round(box.width)}x${Math.round(box.height)} in ${W4}x${H4}`
      : 'no box')
  // And a real finger works it.  `Input.dispatchTouchEvent` goes through hit
  // testing, which is the whole point: a layer that is inert to a pointer
  // looks perfectly fine in a screenshot.
  const card = await p.locator('#pick .card').nth(1).boundingBox()
  await touch('touchStart', [[card.x + card.width / 2, card.y + card.height / 2]])
  await touch('touchEnd', [])
  const enter = await p.locator('#pick .ok').boundingBox()
  await touch('touchStart', [[enter.x + enter.width / 2, enter.y + enter.height / 2]])
  await touch('touchEnd', [])
  await p.waitForTimeout(500)
  const went = await p.evaluate(() => window.__picks())
  check('and a finger picks one and goes in',
    went.up === false && went.mine === 2, `slot ${went.mine}, `
    + `list ${went.up ? 'still up' : 'gone'}`)
  // And the layer is out of the way afterwards, which is the bug the other
  // screen had: `display: flex` beats `hidden`, so it stayed over the game.
  const overlay = await p.evaluate(() => {
    const el = document.getElementById('pick')
    const css = getComputedStyle(el)
    return { hidden: el.hidden, display: css.display }
  })
  check('and it is gone rather than merely invisible',
    overlay.hidden === true && overlay.display === 'none',
    JSON.stringify(overlay))
}

console.log(`\nconsole errors: ${errs.length ? errs.join(' | ') : 'none'}`)
console.log(bad === 0 ? 'all checks passed' : `${bad} FAILED`)
await b.close()
process.exit(bad === 0 ? 0 : 1)

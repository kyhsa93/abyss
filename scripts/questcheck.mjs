/**
 * The starting chain, walked end to end.
 *
 * Everything a quest system can get wrong is invisible from a screenshot: a
 * chain that never unlocks, a kill that counts for the wrong errand, a hand-in
 * that pays nothing.  So this walks Northshire's own chain against the numbers
 * AzerothCore and `QuestXP.dbc` state, and the numbers are the assertion.
 *
 *   npm run dev         # in one terminal
 *   npm run questcheck  # in another
 */
import { chromium } from 'playwright'

const HOST = process.env.ABYSS_URL ?? 'http://localhost:5173'

// Northshire's first three, out of `quest_template`:
//   783  carry word from Deputy Willem (823) to Marshal McBride (197), 40 xp
//   7    kill 8 of Kobold Vermin (6) for McBride, 170 xp and 25 copper
//   15   kill 8 of Kobold Worker (257), which only appears once 7 is done
const WILLEM = 823, MCBRIDE = 197, VERMIN = 6, WORKER = 257
const CARRY = 783, CAMP = 7, AFTER = 15

let bad = 0
const check = (what, ok, detail) => {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? `   -> ${detail}` : ''}`)
}

const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1100, height: 760 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
await p.goto(HOST)
await p.waitForFunction(() => window.__ready, null, { timeout: 60000 })

const state = () => p.evaluate(() => window.__quests())
const labels = () => p.evaluate(() =>
  [...document.querySelectorAll('#talk li')].map((e) => e.textContent.trim()))
async function talkTo(entry) {
  await p.keyboard.press('Escape')
  await p.waitForTimeout(120)
  const there = await p.evaluate((e) => window.__goto(e), entry)
  await p.waitForTimeout(200)
  await p.keyboard.press('e')
  await p.waitForTimeout(300)
  return there
}
const answer = async (n) => { await p.keyboard.press(String(n)); await p.waitForTimeout(250) }

const start = await state()
check('the errands came out of the sources', start.known > 50,
  `${start.known} of them`)
check('and somebody is marked as having work', start.marks.length > 0,
  `${start.marks.length} marked`)

await talkTo(WILLEM)
const first = await labels()
check('the first of the chain is on offer', first.length > 0, first.join(' | '))
await answer(1)
check('taking it puts it in the book',
  (await state()).held.some((h) => h.id === CARRY))

await talkTo(MCBRIDE)
const before = await state()
check('the next one is still locked', !before.marks.some(([e, m]) => e === MCBRIDE && m === '!')
  || (await labels()).some((l) => l.includes('마쳤')),
  'a chain step showed up before the one it follows')
await answer(1)
const paid = await state()
check('handing it in pays what the table says', paid.xp === 40,
  `${paid.xp} xp, wanted 40`)
check('and it goes in the finished pile', paid.done.includes(CARRY))

await talkTo(MCBRIDE)
check('which unlocks the next one', (await labels()).some((l) => l.includes('일거리')),
  (await labels()).join(' | '))
await answer(1)
const held = (await state()).held.find((h) => h.id === CAMP)
check('the kill errand is taken and empty', !!held && held.short === 8,
  JSON.stringify(held))

// Eight of the entry it names, and nothing else.
await p.evaluate((e) => window.__slay(e), WORKER)
const wrong = (await state()).held.find((h) => h.id === CAMP)
check('a different creature of the same kind does not count', wrong?.short === 8,
  `${wrong?.short} left after killing a worker instead of a vermin`)
for (let i = 0; i < 8; i++) await p.evaluate((e) => window.__slay(e), VERMIN)
await p.waitForTimeout(200)
const full = (await state()).held.find((h) => h.id === CAMP)
check('eight of the right one finishes it', full?.done === true, JSON.stringify(full))
check('and the tracker says so', /8 \/ 8/.test(
  await p.evaluate(() => document.getElementById('track')?.innerText ?? '')))

const was = await state()
await talkTo(MCBRIDE)
await answer(1)
const after = await state()
check('handing it in pays its experience', after.xp - was.xp >= 170,
  `${after.xp - was.xp} xp, wanted at least 170`)
check('and its money', after.purse - was.purse === 25,
  `${after.purse - was.purse} copper, wanted 25`)
await talkTo(MCBRIDE)
check('and the one after it is now on offer',
  (await state()).known > 0 && (await labels()).some((l) => l.includes('일거리')),
  (await labels()).join(' | '))
await answer(1)
check('which is the next link of the chain',
  (await state()).held.some((h) => h.id === AFTER),
  JSON.stringify((await state()).held))

// And the third gathering trade, which is the one you take off a body.
//
// 49 rows of `skinning_loot_template` touch this slice and there was no
// skinning at all — 207 herbs and 186 veins and nought leather, against the
// 448 carcasses that carry a hide.  The order is the game's own
// (`Creature::AllLootRemovedFromCorpse`, Creature.cpp:3152): the pockets
// first, the skin second, and a looted carcass is still worth walking back to.
{
  await p.evaluate(() => window.__earn(100000))
  const spot = await p.evaluate(() => {
    const all = window.__all()
    // Alone, so the check is about skinning and not about being eaten, and
    // something this character can actually finish: the first pick was a
    // level 26 bandit still standing after a hundred and twenty swings, which
    // fails four checks that have nothing to do with a knife.
    // The level cap is about how long this check takes rather than about
    // skinning: a level seven boar is two hundred health, which at one swing
    // a global cooldown is forty seconds of a check doing nothing.
    const it = all.find((n) => n.hide && n.stance !== 'friend' && n.level <= 3
      && all.every((m) => m === n || Math.hypot(m.x - n.x, m.y - n.y) > 22))
    if (it) window.__cam({ x: it.x - 1.2, y: it.y, zoom: 2 })
    return it ? { kind: it.kind, level: it.level, x: it.x, y: it.y } : null
  })
  check('something in this slice carries a hide', !!spot, JSON.stringify(spot))
  if (spot) {
    let dead = false
    for (let i = 0; i < 60 && !dead; i++) {
      await p.keyboard.press('1')
      await p.waitForTimeout(200)
      dead = await p.evaluate(() => {
        const h = window.__hero()
        return window.__all().some((n) => n.dead
          && Math.hypot(n.x - h.x, n.y - h.y) < 5)
      })
    }
    check('and it can be killed', dead)
    const state = () => p.evaluate(() => {
      const h = window.__hero()
      return window.__all().find((n) => n.dead
        && Math.hypot(n.x - h.x, n.y - h.y) < 5) ?? null
    })
    await p.keyboard.press('e')
    await p.waitForTimeout(300)
    const once = await state()
    check('one press empties its pockets', once?.looted === true,
      JSON.stringify(once))
    check('and the skin is still on it', once?.skinned === false)
    await p.keyboard.press('e')
    await p.waitForTimeout(300)
    const twice = await state()
    check('the next press takes the skin', twice?.skinned === true,
      JSON.stringify(twice))
    check('and skinning it taught the trade', await p.evaluate(() =>
      (window.__trades()?.skinning ?? 0) > 1))
  }
}

console.log(`\nconsole errors: ${errs.length ? errs.slice(0, 3).join(' | ') : 'none'}`)
console.log(bad === 0 ? 'all checks passed' : `${bad} FAILED`)
await b.close()
process.exit(bad === 0 ? 0 : 1)

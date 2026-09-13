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

console.log(`\nconsole errors: ${errs.length ? errs.slice(0, 3).join(' | ') : 'none'}`)
console.log(bad === 0 ? 'all checks passed' : `${bad} FAILED`)
await b.close()
process.exit(bad === 0 ? 0 : 1)

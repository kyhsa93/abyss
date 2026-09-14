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
// A character first: the game opens on the screen that makes one.
await p.evaluate(() => window.__makeOne?.('가온'))
await p.waitForTimeout(150)

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
/**
 * Take one named errand rather than whatever is at the top of the list.
 *
 * `answer(1)` was fine while every giver had one thing to offer.  The moment
 * the scaling quests came back Marshal McBride had several, and a check that
 * presses `1` and hopes was taking whichever the panel happened to list first
 * — it failed saying quest 3100 was not quest 15, which was true and was not
 * the bug.  `__quests().offering` is the panel's own list in the panel's own
 * order, so this presses the number of the quest it means.
 */
const takeQuest = async (id) => {
  const list = (await state()).offering
  const at = list.indexOf(id)
  if (at < 0) return false
  await answer(at + 1)
  return true
}

const start = await state()
// Against the file rather than against a number typed here.  This said
// `> 50`, which was standing in for "about a hundred, which is what the bake
// produced the day this was written" — so when the level filter took the bake
// from 102 to 35 the check failed for a reason that was the fix.  A threshold
// nobody can derive is a second copy of the bake's output.
const baked = await p.evaluate(async () =>
  (await (await fetch('./world/quests.json')).json()).quests.length)
check('the errands came out of the sources', start.known === baked,
  `${start.known} in the game, ${baked} in the file`)
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
check('which unlocks the next one', (await state()).offering.includes(CAMP),
  JSON.stringify((await state()).offering))
await takeQuest(CAMP)
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
  (await state()).offering.includes(AFTER),
  JSON.stringify((await state()).offering))
await takeQuest(AFTER)
check('which is the next link of the chain',
  (await state()).held.some((h) => h.id === AFTER),
  JSON.stringify((await state()).held))

// And the three shapes of chain that are not `PrevQuestID`.
//
// `after` was the only one this game knew, and it read that one correctly:
// the bake's `after` matches `PrevQuestID` on every quest.  The others are
// `RewardNextQuest` (hand this in and the next is offered on the spot — not
// the same thing as "that unlocks this"), `ExclusiveGroup` (one of these and
// then no more of them) and `BreadcrumbForQuestId` (a signpost that vanishes
// once you have the thing it points at).
{
  const shapes = await p.evaluate(async () => {
    const qs = (await (await fetch('./world/quests.json')).json()).quests
    return {
      after: qs.filter((q) => q.after).length,
      leads: qs.filter((q) => q.leads).length,
      group: qs.filter((q) => q.group > 0).length,
      instead: qs.filter((q) => q.instead).length,
    }
  })
  check('the bake carries every shape of chain, not just one',
    ['after', 'leads', 'group', 'instead'].every((k) => k in shapes),
    JSON.stringify(shapes))
  // Nought exclusive groups survive the class and level filters, so this is a
  // statement about the slice rather than about the rule — which ships
  // anyway, because a rule that arrives with the quest is a rule nobody has
  // to remember to add later.  Two of them at once must never be finishable.
  const clash = await p.evaluate(async () => {
    const qs = (await (await fetch('./world/quests.json')).json()).quests
    const by = {}
    for (const q of qs) if (q.group > 0) (by[q.group] ??= []).push(q.id)
    return Object.values(by).filter((v) => v.length > 1).length
  })
  check(`no two of one exclusive group are both on offer`,
    clash === 0 || shapes.group > 0, `${clash} groups with siblings`)
}

// And no chain dead-ends.
//
// `offers()` will not hand you a quest until whatever it comes `after` is
// **done**, so a shipped quest whose prerequisite is not shipped can never be
// offered at all — six of them were in the bake and nothing had noticed,
// because a quest nobody is offered looks exactly like a quest for somebody
// else.  Every link now points inside the game or nowhere.
{
  const links = await p.evaluate(async () => {
    const qs = (await (await fetch('./world/quests.json')).json()).quests
    const have = new Set(qs.map((q) => q.id))
    return qs.filter((q) => ['after', 'leads', 'instead']
      .some((k) => q[k] && !have.has(q[k]))).map((q) => q.id)
  })
  check('every link of every chain points inside this game',
    links.length === 0, links.join(' '))
  // And every one of them is reachable from a standing start: walk `after`
  // back from each quest and it has to end at one that follows nothing.
  const rootless = await p.evaluate(async () => {
    const qs = (await (await fetch('./world/quests.json')).json()).quests
    const by = new Map(qs.map((q) => [q.id, q]))
    const bad = []
    for (const q of qs) {
      let at = q, hops = 0
      while (at.after && hops++ < 64) at = by.get(at.after)
      if (!at || at.after) bad.push(q.id)
    }
    return bad
  })
  check('and every chain walks back to a quest that follows nothing',
    rootless.length === 0, rootless.join(' '))
}

// And what an errand pays besides the two numbers.
//
// Nine of this slice's thirty-one offer a choice of up to five things, and the
// game was taking none of them: `hand()` returned experience and coin and the
// three reward columns were read by nobody.  At these levels an errand is
// where most equipment comes from — the only other ways in are the shirt you
// were made in and a shopkeeper, and both of those cost money.
{
  const paying = await p.evaluate(async () => {
    const qs = (await (await fetch('./world/quests.json')).json()).quests
    return {
      gives: qs.filter((q) => q.gives.length).length,
      pick: qs.filter((q) => q.pick.length).length,
      widest: Math.max(0, ...qs.map((q) => q.pick.length)),
    }
  })
  check('errands pay in things as well as in numbers',
    paying.gives > 0 && paying.pick > 0, JSON.stringify(paying))
  check('and one of them is a choice of several', paying.widest >= 2,
    `widest is ${paying.widest}`)
}

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

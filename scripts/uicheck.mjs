/**
 * The interface, against the interface it copies.
 *
 * This check exists because of one bug and one complaint.  The bug: opening a
 * conversation drew the panel on top of the action bar, so talking hid the
 * thing you talk with.  The complaint, which is the one that matters, was
 * *why do I have to report these one at a time* — and the answer was that the
 * screen had no source and no check.  Every other part of this world is read
 * out of the client; the layout was written from memory, so it drifted, and
 * the only thing measuring it was somebody looking at it.
 *
 * `pipeline/layout.py` gave it a source: `FrameXML` states every frame's
 * anchor and size in plain numbers.  This is the gate on it.
 *
 *   npm run dev      # in one terminal
 *   npm run uicheck  # in another
 */
import { chromium } from 'playwright'

const HOST = process.env.ABYSS_URL ?? 'http://localhost:5173'

/** The panels, and how to open the ones that are not always there. */
const PANELS = ['units', 'talk', 'sheet', 'bag', 'map', 'log', 'world',
  'deck', 'xp', 'swing', 'help', 'tip',
  // Inside the deck as well as the deck itself: the buttons landed on top of
  // the last four action slots and checking only the deck's outer box saw
  // nothing at all.
  'bar', 'micro']

/** Pairs that are allowed to sit on each other, and why. */
const ALLOWED = [
  // The deck is the box the bar and the buttons sit in.
  ['deck', 'bar'], ['deck', 'micro'],
  // The tooltip is a tooltip: it follows the pointer over whatever it is
  // describing.
  ['tip', '*'],
  // The full map is a window opened on purpose and it covers the world, which
  // is what opening it is for.
  ['world', '*'],
]

const SIZES = [[1280, 820], [1100, 760], [960, 640]]

// The log has to have something in it: it is a box that is nought tall when
// empty, so an empty one is invisible to an overlap test and the key hints
// were printed straight through a full one for as long as this check existed.
const FILL_LOG = async (p) => p.evaluate(() => {
  for (let i = 0; i < 8; i++) window.__slay?.(6)
})

const STATES = [
  ['nothing open', async (p) => { await FILL_LOG(p) }],
  ['a conversation', async (p) => {
    await p.evaluate(() => window.__vendor())
    await p.waitForTimeout(250)
    await p.keyboard.press('e')
  }],
  ['the bag', async (p) => { await p.evaluate(() => window.__give()); await p.keyboard.press('b') }],
  ['the sheet', async (p) => { await p.keyboard.press('c') }],
  // And the combinations, which is where the bug was.  All four states above
  // open exactly one window, and every one of them starts with `Escape`, so
  // "no panel covers another" was a true statement about a screen that never
  // had two panels on it.  The gossip window and the character sheet had sat
  // on the same 418 by 129 rectangle since the day both were written.
  ['a conversation and the sheet', async (p) => {
    await p.evaluate(() => window.__vendor())
    await p.waitForTimeout(250)
    await p.keyboard.press('e')
    await p.waitForTimeout(250)
    await p.keyboard.press('c')
  }],
  ['the sheet and the bag', async (p) => {
    await p.evaluate(() => window.__give())
    await p.keyboard.press('c')
    await p.waitForTimeout(200)
    await p.keyboard.press('b')
  }],
  ['a conversation and the bag', async (p) => {
    await p.evaluate(() => window.__give())
    await p.evaluate(() => window.__vendor())
    await p.waitForTimeout(250)
    await p.keyboard.press('e')
    await p.waitForTimeout(200)
    await p.keyboard.press('b')
  }],
]

let bad = 0
const check = (what, ok, detail) => {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? `   -> ${detail}` : ''}`)
}

const overlap = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

const allowed = (a, b) => ALLOWED.some(([p, q]) =>
  (p === a || p === '*') && (q === b || q === '*')
  || (p === b || p === '*') && (q === a || q === '*'))

const b = await chromium.launch()
const errs = []

for (const [W, H] of SIZES) {
  const p = await b.newPage({ viewport: { width: W, height: H } })
  p.on('pageerror', (e) => errs.push(String(e)))
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  await p.goto(HOST)
  await p.waitForFunction(() => window.__ready, null, { timeout: 60000 })

  for (const [name, open] of STATES) {
    // Deterministically shut, and this is not housekeeping.  `Escape` closes
    // a conversation and the map and **not** the character sheet or the bag,
    // so each state inherited whatever the last one left open — and the
    // states that open two windows were toggling one of them back off.  The
    // first version of the combination check passed for exactly that reason,
    // on a screen that had one panel on it after all.
    await p.keyboard.press('Escape')
    await p.waitForTimeout(150)
    for (const [id, key] of [['sheet', 'c'], ['bag', 'b']]) {
      if (await p.evaluate((x) => !document.getElementById(x)?.hidden, id)) {
        await p.keyboard.press(key)
        await p.waitForTimeout(120)
      }
    }
    await open(p)
    await p.waitForTimeout(400)
    const boxes = await p.evaluate((ids) => {
      const out = []
      for (const id of ids) {
        const el = document.getElementById(id)
        if (!el || el.hidden) continue
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2) continue
        out.push({ id, x: r.x, y: r.y, w: r.width, h: r.height })
      }
      return out
    }, PANELS)

    const off = boxes.filter((v) =>
      v.x < -1 || v.y < -1 || v.x + v.w > W + 1 || v.y + v.h > H + 1)
    check(`${W}x${H}, ${name}: every panel is on the glass`, off.length === 0,
      off.map((v) => `${v.id} at ${Math.round(v.x)},${Math.round(v.y)} ${Math.round(v.w)}x${Math.round(v.h)}`).join('; '))

    const hits = []
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], c = boxes[j]
        if (!overlap(a, c) || allowed(a.id, c.id)) continue
        hits.push(`${a.id} over ${c.id}`)
      }
    }
    check(`${W}x${H}, ${name}: no panel covers another`, hits.length === 0,
      hits.join('; '))
  }

  // And the places themselves, against the numbers the client states.  Only
  // the anchor is checked: our panels hold our own content, so a gossip window
  // with three lines in it is three lines tall and not the original's 512.
  const said = await p.evaluate(async () => {
    const r = await fetch('./world/layout.json')
    if (!r.ok) return null
    const L = await r.json()
    const s = Math.max(0.62, Math.min(1, innerHeight / L.ref[1]))
    const out = []
    for (const [id, b] of Object.entries(L.frames)) {
      const el = document.getElementById(
        id === 'cast' ? 'swing' : id === 'bar' ? 'deck' : id)
      if (!el || el.hidden) continue
      const q = el.getBoundingClientRect()
      // The same clamp the placer uses: a negative offset in the original is
      // an inset into portrait art we do not have, not a place off the glass.
      const want = {
        left: b.at.includes('LEFT') ? Math.max(0, b.x) * s : null,
        right: b.at.includes('RIGHT') ? Math.max(0, b.x) * s : null,
        top: b.at.includes('TOP') ? b.y * s : null,
      }
      const got = {
        left: q.x, right: innerWidth - (q.x + q.width), top: q.y,
      }
      for (const k of ['left', 'right', 'top']) {
        if (want[k] === null) continue
        out.push([id, k, Math.round(want[k]), Math.round(got[k])])
      }
    }
    return out
  })
  if (said) {
    const wrong = said.filter(([, , w, g]) => Math.abs(w - g) > 6)
    check(`${W}x${H}: every panel is where the client puts it`, wrong.length === 0,
      wrong.map(([id, k, w, g]) => `${id}.${k} wants ${w} has ${g}`).join('; '))
  } else {
    check(`${W}x${H}: the layout came out of the client`, false,
      'public/world/layout.json is missing — run `npm run layout`')
  }
  // The screen that makes a character.
  //
  // There was none: the game opened with one human warrior standing in a
  // field, because `slice.json` names one race and one class.  Two of those
  // are the slice's shape — every other race's first step is outside this box
  // — and the class was not: `CharBaseInfo.dbc` says a human may be seven
  // things.
  //
  // **The pairs are the assertion and the table is 62 rows of them.**  A check
  // that only read the screen would agree with whatever the screen happened to
  // say; what has to be true is that the classes offered for the chosen race
  // are exactly the ones that table allows, and that a human hunter — which is
  // the pair it does *not* allow, and the one a hand-written list would get
  // wrong — is not among them.
  const made = await p.evaluate(() => window.__make())
  if (made.up) {
    const legal = made.pairs.filter(([r]) => r === made.race)
      .map(([, c]) => c).sort((a, b) => a - b)
    const shown = made.classes.map((c) => c.word).sort()
    const want = legal.map((c) => made.names[String(c)]).sort()
    check('the screen offers exactly what CharBaseInfo allows',
      shown.length === want.length && shown.every((w, i) => w === want[i]),
      `${shown.join(', ')} against ${want.join(', ')}`)
    check('and a human is not offered a hunter',
      !made.classes.some((c) => c.word === made.names['3']),
      `class 3 is ${made.names['3']}`)
    // And the reasons are two, because they are two: nine races start outside
    // this box, five classes have no spellbook yet, and a death knight begins
    // at 55 on another map.  *Show the difference between what is not here and
    // what was decided against* is the icons page's own rule.
    const reasons = new Set([...made.races, ...made.classes, ...made.sexes]
      .filter((c) => !c.can).map((c) => c.why))
    check('and each thing that cannot be picked says why',
      reasons.size >= 3 && !reasons.has(''),
      [...reasons].join(' | '))
    // Sizes out of `GlueXML`.  Where they go is ours and `CREATE` says so;
    // what they *are* is the client's, and this is the half that can be
    // checked.
    const sz = made.size
    const near = (got, want) => Math.abs(got - want) <= 1
    check('and every control is the size the client states',
      near(made.races[0].h, sz.race[1]) && near(made.classes[0].h, sz.class[1])
      && near(made.sexes[0].h, sz.sex[1]),
      `race ${made.races[0].h} of ${sz.race[1]}, `
      + `class ${made.classes[0].h} of ${sz.class[1]}, `
      + `sex ${made.sexes[0].h} of ${sz.sex[1]}`)
    // And what he is made to look like is what walks out.
    //
    // The preview is the world's own sheets painted into a canvas rather than
    // a second picture of a character, because a second picture is a picture
    // that drifts — so the thing to check is the other end: the sprite in the
    // world is wearing what the screen was asked for.
    //
    // **Clicked for real** — through the pointer, with hit testing — and not
    // with `element.click()` from script.  The difference is the whole of a
    // bug this check sat next to for three rounds: every control on this
    // screen computed `pointer-events: none`, because `#ui *` turns the
    // interface inert and nothing had said that a screen which replaces the
    // game is not the interface.  A script click does no hit testing, so the
    // check passed and the screen could not be used by a finger or a mouse.
    // *A check that reads the same side as the bug is blind to it.*
    //
    // The choices are drop-downs now, and the open list is the browser's own
    // window, which a page cannot click into.  So the pointer goes as far as
    // it can — a trial click, which runs the same hit test a real one does and
    // fails on a control under `pointer-events: none` — and the row is then
    // chosen the way the list would choose it.
    const choose = async (sel, index) => {
      await sel.click({ trial: true })
      await sel.selectOption({ index })
    }
    const hairs = p.locator('#create .looks').nth(0).locator('select')
    const beards = p.locator('#create .looks').nth(1).locator('select')
    const looked = {
      hairs: await hairs.locator('option').count(),
      beards: await beards.locator('option').count(),
    }
    await choose(hairs, looked.hairs - 1)
    await choose(beards, looked.beards - 1)
    // And the class row, which is the one that changes what walks out.
    // A *different* row, because pressing the one that is already chosen is a
    // check that passes whether or not the press arrived — which is the same
    // shape of blindness as clicking from script.
    const classes = p.locator('#create .classes select')
    const before = await p.evaluate(() => window.__make().cls)
    await choose(classes, 1)
    const heard = await p.evaluate(() => window.__make().cls)
    check('the screen answers a real press', heard !== before && heard > 0,
      `class ${before} -> ${heard} after choosing the second row`)
    await choose(classes, 0)
    check('there are appearances to choose from',
      looked.hairs >= 8 && looked.beards >= 3,
      `${looked.hairs} hairstyles, ${looked.beards} beards including none`)
    // And it makes one.
    const born = await p.evaluate(() => window.__makeOne('가온'))
    check('making one puts you in the world',
      born.made?.name === '가온' && born.made?.race === 1
      && born.made?.cls === 1,
      JSON.stringify(born.made))
    const gone = await p.evaluate(() => ({
      up: !document.getElementById('create').hidden,
      name: document.querySelector('#units .name')?.textContent ?? '',
    }))
    check('and the screen goes away', gone.up === false, JSON.stringify(gone))
    // Drawn, not just remembered, and drawn *by name*.  This counted layers
    // and wanted four, and a hero with a weapon is body, two halves of it and
    // a hair — the hair drawn as `hair-plain` when nothing is chosen — so it
    // passed with no beard and with the wrong hair.  `sheets` is the key of
    // every strip the last frame actually laid over him.  Waited on rather
    // than slept on: the sheet is fetched when it is chosen and is not drawn
    // until it has arrived.
    const looks = [`hair-${born.made?.hair}`, `beard-${born.made?.beard}`]
    await p.waitForFunction((keys) => {
      const got = window.__arms().sheets ?? []
      return keys.every((k) => got.includes(k))
    }, looks, { timeout: 8000 }).catch(() => null)
    const drawn = await p.evaluate(() => window.__arms())
    check('and the world draws what was chosen',
      !!born.made?.hair && !!born.made?.beard
      && looks.every((k) => (drawn.sheets ?? []).includes(k)),
      `wanted ${looks.join(' and ')}, drawn out of ${(drawn.sheets ?? []).join(', ')}`)
  } else {
    check('the screen that makes a character is up on a fresh start',
      false, 'it was not')
  }
  await p.close()
}

// --- several characters, and the screen that chooses between them ----------
//
// Issue 189's four conditions, and the last two are the ones that need a
// browser: a character that is made has to be in the list afterwards, and two
// slots must not mix.  One context for the whole block, because that is what
// makes the store survive a reload — `browser.newPage()` gives each page a
// context of its own, which is the right default for every other check here
// and exactly wrong for this one.
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(String(e)))
  const boot = async () => {
    await p.goto(HOST)
    await p.waitForFunction(() => window.__picks !== undefined)
    await p.waitForTimeout(700)
  }
  await boot()
  const empty = await p.evaluate(() => window.__picks())
  check('a browser with nobody in it goes straight to the maker',
    empty.rows.length === 0 && empty.up === false,
    `${empty.rows.length} characters, ${empty.slots} slots`)
  // **How many slots is the client's number**, the same as how many rows a
  // shop shows: `MAX_CHARACTERS_PER_REALM` in `CharacterSelect.lua`.
  check('and as many slots as the client says there are', empty.slots === 10,
    `${empty.slots}`)

  await p.evaluate(() => window.__makeOne('첫째', 1))
  await p.waitForTimeout(400)
  // The condition in the issue's own words: made, saved, and in the list.
  await boot()
  const one = await p.evaluate(() => window.__picks())
  check('a character that was made is there when you come back',
    one.rows.length === 1 && one.rows[0].name === '첫째' && one.rows[0].slot === 1,
    JSON.stringify(one.rows))
  // One is a list too.  It used to go straight in, and the owner asked for the
  // screen that chooses to be the first thing a returning player sees.
  check('and one character still opens on the list', one.up === true,
    `the list is ${one.up ? 'up' : 'not up'}`)

  await p.evaluate(() => window.__pickNew())
  await p.waitForTimeout(300)
  await p.evaluate(() => window.__makeOne('둘째', 5))
  await p.waitForTimeout(400)
  await boot()
  const two = await p.evaluate(() => window.__picks())
  check('two characters make a list, and it is up',
    two.rows.length === 2 && two.up === true,
    two.rows.map((r) => `${r.slot}:${r.name}`).join(', '))
  // Three lines a row, which is what `CharSelectCharacterButtonTemplate`
  // holds: the name, level and race and class, and where he is standing.
  const lines = await p.evaluate(() => [...document.querySelectorAll('#pick .card')]
    .map((el) => [el.querySelector('.who')?.textContent ?? '',
      el.querySelector('.what')?.textContent ?? '',
      el.querySelector('.where')?.textContent ?? '']))
  check('and each row is a name, a level with a race and a class, and a place',
    lines.length === 2 && lines.every(([who, what, where]) =>
      who && /레벨/.test(what) && where.length > 1),
    lines.map((l) => l.join(' | ')).join('  //  '))

  // **The slots do not mix**, which is the check that would catch the whole
  // class of bug this screen introduces: one store, several characters, and a
  // save written to the wrong key is a character overwritten by another.
  // Pressed for real through the screen's own buttons, because clicking from
  // script does no hit testing and the whole subtree was `pointer-events:
  // none` until this round.
  await p.locator('#pick .card').nth(1).click()
  await p.locator('#pick .ok').click()
  await p.waitForTimeout(600)
  const went = await p.evaluate(() => ({ ...window.__picks(), cls: window.__you().cls }))
  check('choosing the second one enters the second one',
    went.mine === 2 && went.cls === 5 && went.up === false,
    `slot ${went.mine}, class ${went.cls}`)
  // Play it a little, save, and look at the other one.
  await p.evaluate(() => { window.__earn(6000); window.__keep() })
  await p.waitForTimeout(400)
  await boot()
  const after = await p.evaluate(() => window.__picks())
  const first = after.rows.find((r) => r.slot === 1)
  const second = after.rows.find((r) => r.slot === 2)
  check('and playing one leaves the other alone',
    first?.level === 1 && first?.cls === 1 && (second?.level ?? 0) > 1
    && second?.cls === 5,
    after.rows.map((r) => `${r.slot}:${r.name} ${r.level}레벨 직업${r.cls}`).join(', '))

  // **And deleting asks for the name first.**  It was one press of a button
  // beside 새로 만들기, and on a phone that is where a thumb lands when it
  // misses.  Everything below is pressed through the pointer on the first
  // row, which is not the one the list opened on — pressing what is already
  // chosen passes whether or not the press arrived.
  const rowsNow = async () => (await p.evaluate(() => window.__picks()))
  await p.locator('#pick .card').nth(0).click()
  await p.locator('#pick .foot .erase').click()
  const pressed = await rowsNow()
  const label = await p.locator('#pick .foot .erase').textContent()
  check('pressing 캐릭터 삭제 alone deletes nothing, it asks',
    pressed.asking === true && pressed.rows.length === 2 && label === '캐릭터 삭제',
    `${pressed.rows.length} characters, question ${pressed.asking ? 'up' : 'not up'}, `
    + `button says ${label}`)
  const blank = await p.locator('#pick .confirm .really').isDisabled()
  await boot()
  const afterPress = await rowsNow()
  check('and that stays true after a reload, and the delete button starts dim',
    afterPress.rows.length === 2 && blank,
    `${afterPress.rows.length} characters, 삭제 ${blank ? 'disabled' : 'enabled'}`)
  // Cancel leaves everything.
  await p.locator('#pick .card').nth(0).click()
  await p.locator('#pick .foot .erase').click()
  await p.locator('#pick .confirm .dice').click()
  const cancelled = await rowsNow()
  check('and 취소 puts the list back with everybody on it',
    cancelled.asking === false && cancelled.rows.length === 2
    && await p.locator('#pick .foot').isVisible(),
    `${cancelled.rows.length} characters, question ${cancelled.asking ? 'up' : 'gone'}`)
  // A wrong name keeps the button dim — typed through the hook, which goes
  // through the question rather than round it.
  const wrong = await p.evaluate(() => window.__pickErase(1, '첫'))
  // Only if the question is still up: with the gate broken the wrong name
  // deletes him and there is nothing left to cancel, and a check that then
  // waits for a button that is gone reports a timeout instead of the rule.
  if (await p.locator('#pick .confirm').isVisible()) {
    await p.locator('#pick .confirm .dice').click()
  }
  await boot()
  const afterWrong = await rowsNow()
  check('and a name that is not his keeps 삭제 disabled and deletes nothing',
    wrong?.open === false && afterWrong.rows.length === 2,
    `typed 첫 for 첫째: button ${wrong?.open ? 'enabled' : 'disabled'}, `
    + `${afterWrong.rows.length} characters after a reload`)
  // The right name, typed into the box and confirmed by the pointer.
  await p.locator('#pick .card').nth(0).click()
  await p.locator('#pick .foot .erase').click()
  await p.locator('#pick .confirm .name').fill('첫째')
  await p.locator('#pick .confirm .really').click()
  const gone1 = await rowsNow()
  await p.waitForTimeout(300)
  await boot()
  const left = await p.evaluate(() => window.__picks())
  check('deleting takes one away and leaves the rest',
    gone1.rows.length === 1 && left.rows.length === 1 && left.rows[0].slot === 2,
    left.rows.map((r) => `${r.slot}:${r.name}`).join(', ') || 'nobody')
  await ctx.close()
}

// --- six classes, each one actually played ---------------------------------
//
// `classcheck` asks the baked files whether every class has a book, a trainer
// and a bar; this asks the *game*, by making one of each and looking at what
// the character came out as.  They are different questions and the second is
// the one issue 188 is about: "눌리는데 아무것도 못 배우는 직업이 없다" — no
// class that can be pressed and then cannot do anything.
//
// One page a class, because a character is made once.
{
  const made = []
  for (const cls of [1, 2, 4, 5, 8, 9]) {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } })
    p.on('pageerror', (e) => errs.push(String(e)))
    await p.goto(HOST)
    await p.waitForFunction(() => window.__makeOne !== undefined)
    await p.waitForTimeout(400)
    await p.evaluate((c) => window.__makeOne('가온', c), cls)
    await p.waitForTimeout(400)
    made.push(await p.evaluate(() => window.__you()))
    await p.close()
  }
  check('every class the screen offers can be made',
    made.length === 6 && made.every((m) => m.cls),
    made.map((m) => `${m.cls}`).join(', '))
  // Something to press from the first moment, which is the narrow promise.
  const mute = made.filter((m) => m.spells.length === 0)
  check('and every one of them has something to press at level one',
    mute.length === 0,
    mute.map((m) => m.cls).join(', ')
    || made.map((m) => `${m.cls}: ${m.spells.length}`).join(', '))
  // And a bar of its own kind, full or empty as the class's own rule says:
  // rage is earned and the other two are not.
  const bars = made.map((m) => `${m.cls} ${m.powerWord} ${m.power}/${m.powerMax}`)
  check('and a bar of the kind its class swings on',
    made.some((m) => m.powerWord === 'rage')
    && made.some((m) => m.powerWord === 'mana')
    && made.some((m) => m.powerWord === 'energy')
    && made.every((m) => m.powerWord === 'rage'
      ? m.power === 0 : m.power === m.powerMax && m.powerMax > 0),
    bars.join(', '))
  // And the six are not one class six times, which is the failure a check
  // written around `me.cls` alone would miss entirely.
  const books = new Set(made.map((m) => m.spells.join(',')))
  check('and no two of them are the same character',
    books.size === made.length, `${books.size} distinct books of ${made.length}`)
}

// --- the bar is the spellbook, and its letters are its keys -----------------
//
// Two bugs lived here at once and neither was visible from outside: the bar
// was rebuilt only when its length changed, and the length never changed
// (twelve squares, padded with empties), so eight abilities bought from a
// trainer went into the spellbook and never onto the screen.  And the letter
// drawn on a square was worked out separately from the key that fired it, so
// every square was labelled one higher than its own key.
//
// `uicheck` had checked where the bar *is* since it was written.  Nothing
// checked what is in it.
{
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } })
  p.on('pageerror', (e) => errs.push(String(e)))
  await p.goto(HOST)
  await p.waitForFunction(() => window.__ready, null, { timeout: 60000 })

  // Read off the *screen*, not out of the game.  The first version of this
  // asked `__bar()` for what the scene had computed and passed while the bar
  // was frozen, because the bug was never in the sum — it was that the DOM
  // did not follow it.  A check that reads the same side as the bug is blind
  // to it.
  const onScreen = () => p.evaluate(() => ({
    squares: [...document.querySelectorAll('#bar .slot')].map((el) => ({
      key: el.querySelector('.key')?.textContent ?? '',
      label: el.querySelector('.name')?.textContent ?? '',
      filled: !el.classList.contains('bare'),
    })),
    spells: window.__bar().spells,
    bar: window.__bar().bar,
  }))

  const before = await onScreen()
  const filled = (bar) => bar.squares.filter((sq) => sq.filled).length
  // **No `1 +` any more.**  Attack had the first square, and what that square
  // did was aim — `you.target ??= inSwing()`, one answer, never a choice.
  // Issue 222 took it off the bar; issue 225 made what is left an arrangement
  // the player owns rather than the order things were learned.
  //
  // A new character's arrangement is still that order, because dropping each
  // new thing into the first free square is what "the order they were learned"
  // *is* — it is a starting arrangement now and not a rule.
  check('the bar starts with what the character knows',
    filled(before) === before.spells.length && before.spells.length > 0,
    `${filled(before)} filled, ${before.spells.length} spells`)

  // Learn everything a trainer in this slice teaches, at the level that can
  // hold it, and look again.
  //
  // The whole book rather than a list typed here, because a list typed here is
  // what let the bar outgrow its keys unnoticed: it named ten abilities on the
  // day the book held thirteen, and when the book grew to seventeen this check
  // went on learning the same ten.
  await p.evaluate(async () => {
    // Level ten, by earning it, so the abilities that need a level are held.
    window.__earn(100000)
    // The book of the class this character actually is, which `__you` says.
    // One flat list here would learn a mage's frostbolt on to a warrior and
    // then assert that the bar did not grow, which is the check passing for
    // the wrong reason.
    const mine = window.__you().cls
    const doc = await (await fetch('./world/spells.json')).json()
    const book = doc.books[String(mine)] ?? []
    for (const sp of book) window.__learn(sp.id)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  })
  const after = await onScreen()
  check('and it grows when the character learns',
    filled(after) === after.spells.length && after.spells.length > before.spells.length,
    `${before.spells.length} -> ${after.spells.length} spells, ${filled(after)} filled`)
  // And there is a square for every one of them.  The count of squares is a
  // decision — the original's bar is twelve and ours is two rows of eight —
  // and the thing that must hold is that a character who has bought everything
  // can press all of it.
  check('and there is room for everything a character can hold',
    after.squares.length >= after.spells.length,
    `${after.squares.length} squares for ${after.spells.length}`)

  // And every square answers to the letter written on it.  Pressed for real
  // through the keyboard, because the bug was in the handler and a check that
  // calls the table would have passed while it was broken.
  // **Against the arrangement and not against the spellbook.**  The two were
  // the same list until issue 225 and are not any more: `bar` says what is in
  // square `i`, which is the thing pressing its key has to fire.
  const wrong = []
  for (let i = 0; i < after.squares.length; i++) {
    const sq = after.squares[i]
    if (!sq.filled) continue
    // A filled square with no letter on it is the same bug seen from the
    // other end: the keys ran out before the abilities did.
    if (!sq.key) { wrong.push(`${sq.label} has no key`); continue }
    await p.keyboard.press(sq.key)
    const heard = await p.evaluate(() => window.__bar().asked)
    if (heard !== after.bar[i]) {
      wrong.push(`${sq.key}=${sq.label} fired ${heard} not ${after.bar[i]}`)
    }
  }
  check('and every square answers to the letter on it', wrong.length === 0,
    wrong.join('; ') || `${after.spells.length} squares pressed`)

  // --- the book, the arrangement and the automatic hand --------------------
  //
  // Issues 222 to 225, which are one system: the bar stopped being the
  // spellbook, so there had to be a spellbook; the arrangement became a
  // decision, so it had to be saved; the first square stopped being the aim,
  // so aiming had to happen; and the toggle called autocast had to cast.

  // 222.  The square whose whole body was `you.target ??= inSwing()`.
  check('no square on the bar is the attack',
    after.squares.every((sq) => sq.label !== '공격'),
    after.squares.filter((sq) => sq.filled).map((sq) => sq.label).join(' '))
  check('and the first ability is on the first key',
    after.squares[0]?.key === '1' && after.squares[0]?.filled === true,
    `${after.squares[0]?.key} = ${after.squares[0]?.label}`)
  // And aiming happens by itself once something is angry.  Made angry the way
  // anything is: by being hit.
  {
    // Into the world first.  This page never made a character — the checks
    // above read the bar from behind the screen that makes one — and a click
    // that lands on that panel is a click the world never hears.  And the
    // shop the block above opened has to go with it.
    await p.evaluate(() => window.__openShopAt(0))
    const any = p.locator('#create button', { hasText: '무작위' })
    if (await any.count()) {
      // **A press is a look at random**, which is what the button is for: it
      // only rolled a name before.  Pressed several times, the hair and the
      // beard have to come out as more than one look — read off the drop-downs
      // the player sees rather than off a variable — and a name has to be
      // there so the character can walk out.
      const looks = new Set()
      for (let i = 0; i < 6; i++) {
        await any.click()
        await p.waitForTimeout(150)
        looks.add(await p.evaluate(() => [...document.querySelectorAll('#create select')]
          .slice(-2).map((s) => s.value).join('/')))
      }
      const named = await p.evaluate(() => document.querySelector('#create .name')?.value ?? '')
      check('the random button rolls what he looks like, and leaves him a name',
        looks.size > 1 && named.trim().length > 0,
        `${looks.size} looks in six presses (${[...looks].join(', ')}), named ${named}`)
      await p.waitForTimeout(350)
    }
    const go = p.locator('#create button', { hasText: '세상으로' })
    if (await go.count()) { await go.click(); await p.waitForTimeout(900) }
    await p.waitForTimeout(200)
    // **Something that survives being hit**, and followed rather than
    // remembered: `__foe` walks to the nearest, the nearest is usually a
    // rabbit with one health, and everything in this world wanders — so a
    // screen point worked out a moment ago is a yard out and three yards is
    // all the aim allows.  Both are handled by asking again each time.
    // Walked to it the way the other fight checks do, so the thing clicked is
    // near the middle of the glass and the camera has somewhere to settle —
    // and **level three or better**, because a rabbit dies on the first swing
    // and then there is nothing left angry to aim at.
    const what = await p.evaluate(() => window.__foe(3))
    await p.waitForTimeout(700)
    // Where it is *now*, each attempt: everything in this world wanders, and
    // three yards is all the aim allows.
    const nearest = () => p.evaluate(() => {
      const h = window.__hero()
      const foe = window.__all()
        .filter((n) => !n.dead && n.stance === 'quarry')
        .map((n) => ({ n, d: Math.hypot(n.x - h.x, n.y - h.y) }))
        .sort((a2, b2) => a2.d - b2.d)[0]
      return foe ? window.__screenAt(foe.n.x, foe.n.y) : null
    })
    let took = null
    for (let go = 0; go < 8 && !took; go++) {
      const now = await nearest()
      if (!now) break
      await p.mouse.click(Math.round(now[0]), Math.round(now[1]))
      await p.waitForTimeout(150)
      took = await p.evaluate(() => window.__you().target)
    }
    check('a click on the world is how a fight starts now',
      took !== null,
      `clicked a ${what?.kind} — the target is ${took}`)

    // And aiming comes back by itself at whatever is already angry, which is
    // the half of the old attack square that was never a decision.  Being
    // angry takes a blow, and the swing is nearly three seconds.
    // And aiming comes back by itself at whatever is already angry, which is
    // the half of the old attack square that was never a decision.
    //
    // **The anger is set, not fought for.**  `takeAim` is a rule about state —
    // something is angry and nothing is aimed at — and getting to that state by
    // actually fighting means waiting on a three-second swing while the thing
    // wanders out of reach, and the nearest thing is usually a rabbit that dies
    // before it can be angry at anybody.  A check that waits on the weather is
    // a check that fails for reasons that are not the rule.  `__anger` sets the
    // same field a landed blow sets, exactly as `__pull` does for a pack.
    const angry = await p.evaluate(() => {
      window.__unaim()
      const hot = window.__anger()
      return hot ? { ...hot, target: window.__you().target } : null
    })
    if (angry) {
      let back = null
      for (let i = 0; i < 20 && !back; i++) {
        await p.waitForTimeout(100)
        back = await p.evaluate(() => window.__you().target)
      }
      check('and something already angry is aimed at without being asked',
        angry.target === null && back !== null,
        `a ${angry.kind} ${angry.away.toFixed(1)} yards off, `
        + `cleared to ${angry.target}, came back as ${back}`)
    } else {
      check('and something already angry is aimed at without being asked',
        false, 'nothing fightable was near enough to anger')
    }
  }

  // 223.  The book, which did not exist.
  await p.keyboard.press('p')
  await p.waitForTimeout(300)
  const book = await p.evaluate(() => {
    const box = document.getElementById('book')
    return { up: box && !box.hidden,
      rows: [...box.querySelectorAll('li')].length,
      pages: (box.querySelector('.which')?.textContent ?? '').trim() }
  })
  check('there is a spellbook and a key that opens it',
    book.up === true && book.rows > 0,
    `${book.rows} rows, ${book.pages || 'one page'}`)
  // Every spell in it, over however many pages the original's twelve make.
  const seen = await p.evaluate(async () => {
    const doc = await (await fetch('./world/layout.json')).json()
    const per = doc.spec?.book?.page ?? 12
    const all = window.__bar().spells
    const out = new Set()
    const pages = Math.max(1, Math.ceil(all.length / per))
    for (let i = 0; i < pages; i++) {
      window.__book(i)
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      for (const id of window.__book()) out.add(id)
    }
    return { per, pages, seen: [...out], all }
  })
  check('and every spell the character knows is in it',
    seen.all.length > 0 && seen.all.every((id) => seen.seen.includes(id)),
    `${seen.seen.length} of ${seen.all.length} over ${seen.pages} pages of ${seen.per}`)
  await p.keyboard.press('p')

  // 225.  The arrangement, which has to be a choice and has to survive.
  {
    const moved = await p.evaluate(() => {
      const was = window.__bar().bar.slice()
      // Square 0 and square 3 swap, through the same call the drag makes.
      window.__place(3, was[0])
      return { was, now: window.__bar().bar.slice() }
    })
    check('an ability can be moved to another square',
      moved.now[3] === moved.was[0] && moved.now[0] === moved.was[3],
      `${moved.was.slice(0, 4)} -> ${moved.now.slice(0, 4)}`)
    const cleared = await p.evaluate(() => {
      window.__place(3, null)
      return window.__bar().bar.slice()
    })
    check('and a square can be emptied', cleared[3] === null,
      `${cleared.slice(0, 4)}`)
    // And it comes back.  Round-tripped through the save the game writes, so
    // this is the arrangement surviving *the thing that saves it* and not a
    // field being copied from one object to another.
    const kept = await p.evaluate(() => {
      window.__place(3, window.__bar().spells[1])
      const want = window.__bar().bar.slice()
      const raw = JSON.parse(JSON.stringify(window.__save()))
      // Scrambled first, so restoring cannot pass by leaving it alone.
      window.__place(3, null)
      window.__place(0, null)
      window.__load(raw)
      return { want, back: window.__bar().bar.slice() }
    })
    check('and the arrangement comes back out of the save',
      JSON.stringify(kept.want) === JSON.stringify(kept.back),
      `${kept.want.slice(0, 5)} -> ${kept.back.slice(0, 5)}`)
    // And a square holding something the character does not know comes back
    // empty — `fitBar`'s whole reason (issue 225): the bar and the spellbook
    // are two lists, and a save from before a re-bake, or with another class's
    // ability on it, is the drift they are pruned against.  Nothing checked
    // it.  Written into the save the game reads, beside an ability he does
    // know and placed himself, which has to survive the same load: a prune that
    // empties the whole bar passes the first half.  Another class's real
    // spell rather than an invented id, so it is a spell the world has and
    // this character does not.
    const pruned = await p.evaluate(async () => {
      const d = window.__bar()
      const books = (await (await fetch('./world/spells.json')).json()).books
      const foreign = Object.values(books).flat().map((sp) => sp.id)
        .find((id) => !d.spells.includes(id))
      const mine = d.spells.find((id) => !d.stances.includes(id)) ?? d.spells[0]
      const was = JSON.parse(JSON.stringify(window.__save()))
      const raw = JSON.parse(JSON.stringify(was))
      raw.you.bar = Array(16).fill(null)
      raw.you.bar[0] = mine
      raw.you.bar[2] = foreign
      window.__load(raw)
      const back = window.__bar().bar.slice()
      window.__load(was)
      return { foreign, mine, back }
    })
    check('and an ability the character does not know does not stay on the bar',
      pruned.foreign !== undefined && pruned.back[2] === null
      && !pruned.back.includes(pruned.foreign) && pruned.back[0] === pruned.mine,
      `saved ${pruned.mine} on square 1 and ${pruned.foreign} on square 3, `
      + `loaded ${pruned.back.slice(0, 4)}`)
  }

  // 224.  The toggle called autocast, which cast nothing.
  //
  // What it is worth is measured in `simcheck` and printed every run — 4%
  // against 68% at level five — and that number is the *outcome*.  What is
  // asked here is the **mechanism**, on the screen: with it on, the leftmost
  // thing on the bar that can be used goes off without anybody pressing a key;
  // with it off, nothing does.  A browser cannot run four hundred fights, and
  // a check that pretended to would be measuring its own patience.
  {
    const armed = await p.evaluate(() => {
      window.__earn(100000)
      window.__unaim()
      return { level: window.__you().level, bar: window.__bar().bar }
    })
    void armed
    // Something to fight that will not die on the first swing, **and actually
    // aimed at**: `inSwing` reads the list of who is nearby, which is built a
    // frame later than the walk, so asking once answers for where he was.
    const ready = await p.evaluate(() => window.__foe(3))
    await p.waitForTimeout(700)
    let aimedAt = null
    for (let i = 0; i < 20 && !aimedAt; i++) {
      aimedAt = await p.evaluate(() => {
        const h = window.__hero()
        const hot = window.__all()
          .filter((n) => !n.dead && n.stance === 'quarry')
          .map((n) => ({ n, d: Math.hypot(n.x - h.x, n.y - h.y) }))
          .sort((a2, b2) => a2.d - b2.d)[0]
        if (hot && hot.d > 2) window.__put(hot.n.x - 1.2, hot.n.y)
        return window.__aimAtNearest()
      })
      if (!aimedAt) await p.waitForTimeout(150)
    }
    check('and there is something to try it on', aimedAt !== null,
      `${ready?.kind ?? 'nothing'} — aimed at ${aimedAt}`)
    if (ready) {
      // Off first: aimed at something, full of rage, and nothing is cast.
      const quiet = await p.evaluate(async () => {
        window.__setAuto(false)
        window.__aimAtNearest()
        const before = window.__bar().asked
        await new Promise((r) => setTimeout(r, 2500))
        return { before, after: window.__bar().asked }
      })
      check('with the automatic hand off, nothing casts itself',
        quiet.before === quiet.after,
        `asked ${quiet.before} -> ${quiet.after}`)
      const loud = await p.evaluate(async () => {
        window.__setAuto(true)
        window.__aimAtNearest()
        const before = window.__bar().asked
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 100))
          if (window.__bar().asked !== before) break
        }
        return { before, after: window.__bar().asked, on: window.__bar().auto }
      })
      check('and with it on, the bar casts itself',
        loud.on === true && loud.after !== null && loud.after !== loud.before,
        `asked ${loud.before} -> ${loud.after} — `
        + await p.evaluate(() => {
          const d = window.__bar()
          return `target ${window.__you().target}, auto ${d.auto}, `
            + `usable ${d.usable} of bar ${d.bar.filter(Boolean)}`
        }))

      // 226.  **And it aims.**  Every check above this one calls
      // `__aimAtNearest()` first, so all of them were asking whether an
      // *aimed* character casts — and the line that took a target when the
      // toggle was on had been deleted.  Eleven places read `auto` and not
      // one of them aimed; `autoCast` returned on `!you.target`; the game did
      // nothing while the harness stayed green, because the harness was
      // putting the target in its hand.
      //
      // Both ways round, on the **same** creature and one that is not already
      // angry: `takeAim` takes whatever is angry at you whether the toggle is
      // on or not — that is the case where aiming is not a decision — so a
      // rabbit that has just been hit proves nothing about the toggle.
      // What is asked is the **aiming** and nothing else: that the bar then
      // fires is the check above, and asking for both at once put the weather
      // back in — a target taken and a global cooldown still running reads as
      // a failure of the aiming.
      const calm = await p.evaluate(async () => {
        const angryNow = () => new Set(window.__all()
          .filter((n) => n.angry && !n.dead).map((n) => n.kind))
        const h = window.__hero()
        const q = window.__all()
          .filter((n) => !n.dead && !n.angry && n.stance === 'quarry')
          .map((n) => ({ n, d: Math.hypot(n.x - h.x, n.y - h.y) }))
          .sort((a2, b2) => a2.d - b2.d)[0]
        if (!q) return null
        window.__setAuto(false)
        window.__put(q.n.x - 1.2, q.n.y)
        window.__unaim()
        await new Promise((r) => setTimeout(r, 1200))
        const off = window.__you().target
        // Whatever it took with the hand off has to be something already angry
        // — that is `takeAim`, and it runs whether the toggle is on or not.
        const offAngry = off === null || angryNow().has(off)
        window.__setAuto(true)
        let on = null
        for (let i = 0; i < 60 && !on; i++) {
          await new Promise((r) => setTimeout(r, 100))
          on = window.__you().target
        }
        // Put the world back the way it was found.  Leaving the automatic hand
        // on and a fight running changed the rage and the stance under the
        // check after this one, which is about which *square* fires and has
        // nothing to do with either.
        window.__setAuto(false)
        window.__unaim()
        return { kind: q.n.kind, off, offAngry, on }
      })
      check('and with it off it aims at nothing that is not already angry',
        !!calm && calm.offAngry,
        calm ? `a calm ${calm.kind} in reach and the target is `
          + `${calm.off ?? 'nobody'}` : 'nothing calm to stand next to')
      check('and it finds something to aim at without being handed one',
        !!calm && !!calm.on,
        calm ? `aimed at ${calm.on ?? 'nothing'} with nobody calling __aimAtNearest`
          : '')
      // And it is the leftmost thing it can use, which is the rule that makes
      // the arrangement the fighting order.
      // **Arranged rather than raced.**
      //
      // Three earlier shapes of this check were racing the clock: reading the
      // usable list after the cast answers `undefined` because the global
      // cooldown is running, reading it before answers for a bar that has
      // changed since, and half of it needs a target the fight keeps taking
      // away.
      //
      // The promise is not "it picked the leftmost of whatever list I happened
      // to sample" — it is **the arrangement is the fighting order**.  So the
      // arrangement is set twice, with the same two abilities the other way
      // round, and what fires has to follow it.
      const both = await p.evaluate(async () => {
        const cast = async (first, second, cooling = null) => {
          window.__setAuto(false)
          // Off any cooldown an earlier run left, and then, for the runs that
          // ask for it, the one square put on a long one.
          window.__cool(first, 0)
          window.__cool(second, 0)
          if (cooling !== null) window.__cool(cooling, 600)
          // Both runs start with the bar full.  Without this the first run
          // spends the rage the second one needs, and the second fires its
          // right-hand square for a reason that is true — it cannot use the
          // left one — which reads here as the rule being broken.  It failed
          // about one run in three and the failure was the weather.
          window.__fuel()
          // Everything off the bar but these two, so nothing else can fire.
          for (let i = 0; i < 16; i++) window.__place(i, null)
          window.__place(0, first)
          window.__place(4, second)
          // Aimed at something, because both of these need a target.
          for (let i = 0; i < 60; i++) {
            if (window.__you().target !== null) break
            if (i % 20 === 0) window.__foe(3)
            window.__aimAtNearest()
            await new Promise((r) => setTimeout(r, 50))
          }
          // What went off, counted by `fired` and not read off `asked`.
          // `asked` is the last id pressed, so a run whose answer is the
          // same id as the run before it could not tell firing from nothing
          // happening: the first full run with the cooling pair read "fired
          // 355" twice, and the second was ten seconds of nothing — the
          // rabbit it was aimed at had died — reported as the old answer.
          // And the squares this run is about have to be usable before the
          // hand goes on — the right-hand one always, the leftmost unless it
          // is the one put on a cooldown.  Taunt came back unusable for a
          // moment after the run before it (the pull it answers had moved
          // on), the hand quite rightly fired the next square, and the check
          // read that as the order being ignored.  Waited for, re-aimed, and
          // what was usable is returned so a failure says why.
          const need = cooling === null ? [first, second] : [second]
          for (let i = 0; i < 100; i++) {
            window.__fuel()
            if (window.__you().target === null && i % 20 === 0) window.__foe(3)
            window.__aimAtNearest()
            if (need.every((id) => window.__bar().usable.includes(id))) break
            await new Promise((r) => setTimeout(r, 50))
          }
          const usable = window.__bar().usable.slice()
          // Looked at every frame, and the hand is off the frame anything
          // goes off.  Polled every fifty milliseconds it was three frames
          // late, and two of these have no global cooldown: Taunt went off,
          // Heroic Strike went off the frame after because Taunt was now
          // cooling, and `fired` — which keeps only the last — said 78.  The
          // hand casts at most once a frame, so a count that moved by two is
          // said out loud rather than read as an answer.
          const was = window.__bar().fired.n
          window.__fuel()
          window.__setAuto(true)
          for (let i = 0; i < 600; i++) {
            await new Promise((r) => requestAnimationFrame(() => r()))
            if (window.__bar().fired.n !== was) break
            if (window.__you().target === null && i % 60 === 0) window.__foe(3)
            window.__aimAtNearest()
          }
          window.__setAuto(false)
          if (cooling !== null) window.__cool(cooling, 0)
          const now = window.__bar().fired
          const went = now.n - was
          return `${went === 0 ? 'nothing' : went > 1 ? `${went} casts, the last ${now.id}` : now.id}`
            + ` (usable ${usable})`
        }
        // Two the character has that are not stances: one costs rage and one
        // does not, and both want a target.
        const d = window.__bar()
        const pair = d.spells.filter((id) => !d.stances.includes(id)).slice(0, 2)
        if (pair.length < 2) return null
        const one = await cast(pair[0], pair[1])
        const two = await cast(pair[1], pair[0])
        // And the half the name is about, *it can use*.  Both runs above
        // start with the bar full, so every square is usable and the leftmost
        // fires whether or not anything is ever skipped — the check passed on
        // an automatic hand that took the leftmost square and nothing else.
        // So the leftmost is put on a cooldown, which no swing in the meantime
        // can undo the way rage would, and what fires has to be the next one
        // along, both ways round.
        const three = await cast(pair[0], pair[1], pair[0])
        const four = await cast(pair[1], pair[0], pair[1])
        return { pair, one, two, three, four }
      })
      check('and it is the leftmost square it can use',
        !!both && [[both.one, both.pair[0]], [both.two, both.pair[1]],
          [both.three, both.pair[1]], [both.four, both.pair[0]]]
          .every(([got, want]) => got.startsWith(`${want} `)),
        both ? `${both.pair} in that order fired ${both.one}, `
          + `the other way round fired ${both.two}; with the leftmost cooling `
          + `${both.three} and ${both.four}`
          : 'this character has fewer than two abilities that are not stances')
      await p.evaluate(() => window.__setAuto(false))
    }
  }
  await p.close()
}

// --- the numbers the client states, on the page --------------------------
//
// `layout.py` opened with the right principle — *a number tuned by hand twice
// is a number that should be derived* — and then carried thirteen boxes out
// of it, while `index.html` kept 229 hand-typed pixel values and 87
// hand-picked colours.  Some of those colours were in places the client
// states outright: the rage bar was `#a32d22` where `FrameXML` says (1, 0, 0)
// and the experience bar `#5b3fa8` where it says (0.58, 0, 0.55).
{
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } })
  p.on('pageerror', (e) => errs.push(String(e)))
  await p.goto(HOST)
  await p.waitForFunction(() => window.__ready, null, { timeout: 60000 })
  const said = await p.evaluate(async () => {
    const r = await fetch('./world/layout.json')
    const L = r.ok ? await r.json() : {}
    const css = getComputedStyle(document.documentElement)
    return {
      spec: L.spec ?? null,
      rage: css.getPropertyValue('--rage').trim(),
      xp: css.getPropertyValue('--xp').trim(),
      tiny: css.getPropertyValue('--font-tiny').trim(),
    }
  })
  check('the interface spec came out of the client', !!said.spec
    && said.spec.font.length > 8 && Object.keys(said.spec.colour).length > 8,
    said.spec ? `${said.spec.font.length} font sizes, `
      + `${Object.keys(said.spec.colour).length} colours, `
      + `${said.spec.edge.length} edge sizes` : 'no spec')
  // And it reached the page.  A spec nothing reads is `lightAt`'s tint again.
  check('and the page is using it', said.rage === 'rgb(255,0,0)'
    && said.xp === 'rgb(148,0,140)' && said.tiny === '10px',
    `rage ${said.rage}, xp ${said.xp}, tiny ${said.tiny}`)
  // What is *not* taken is declared, the same as the pipeline's
  // `*_DEFAULT_OK`: a number the client states is not automatically a number
  // we can use, and `edgeSize` is the proof — it is the width of a nine-slice
  // artwork frame and ours is a one-pixel CSS line.
  check('and what it does not take is written down',
    (said.spec?.unread ?? []).length >= 4,
    (said.spec?.unread ?? []).join('; '))

  // The shop, which was four lines of a conversation.
  //
  // `MerchantFrame` was not in `layout.py`'s `WANT`, so buying a thing was
  // four options of the gossip panel — and a shopkeeper with twenty-eight
  // things to sell had four of them on offer with no way to reach the rest.
  // The original states the window outright: 384 by 512 in the gossip
  // window's corner, a row 153 by 44, and `MERCHANT_ITEMS_PER_PAGE` is ten.
  //
  // **And no two lines of it look the same.**  That was the failure the icons
  // page printed — *"lines 4 and 5 have the same words and the same price"* —
  // and it is the one that matters here, because this game ships no item
  // names: a row is a picture, our word for the sort of thing it is, what it
  // does, and a price.  Two rows that match on all four are two rows nobody
  // can choose between.  What is allowed is two rows whose **items** are
  // identical in every column the bake ships; those are counted and named
  // rather than hidden, the same idea as the pipeline's `*_DEFAULT_OK`.
  const shops = await p.evaluate(() => window.__shops())
  check('a shop is the original\'s window', shops.per === 10,
    `${shops.per} to a page, ${shops.vendors} vendors, the longest stock `
    + `${shops.longest} rows, ${shops.paged} of them needing more than a page`)
  // A shelf that runs out is a decision, which is the whole of why
  // `npc_vendor.maxcount` is worth reading: 82 of this slice's 1,679 vendor
  // rows hold one, two or three of something and put another out on a clock.
  // Both columns were baked and neither was read.
  {
    const limited = await p.evaluate(async () => {
      const doc = await (await fetch('./world/items.json')).json()
      for (const [entry, rows] of Object.entries(doc.stock)) {
        const row = rows.find((r) => r[1] > 0 && window.__shop(Number(entry))
          .stock.some((s) => s.id === r[0] && s.left !== null))
        if (row) return { entry: Number(entry), id: row[0], most: row[1] }
      }
      return null
    })
    check('a shop can run out of something', !!limited,
      limited ? `vendor ${limited.entry} holds ${limited.most} of ${limited.id}`
        : 'no limited row reaches the shop')
    if (limited) {
      const after = await p.evaluate((w) => {
        window.__earn?.(100000)
        const before = window.__shop(w.entry).stock.find((s) => s.id === w.id)
        for (let i = 0; i < w.most + 2; i++) window.__buy(w.id)
        const now = window.__shop(w.entry).stock.find((s) => s.id === w.id)
        return { was: before.left, left: now.left, held: window.__bag?.() ?? null }
      }, limited)
      check('and buying it out leaves none', after.left === 0,
        `${after.was} -> ${after.left}`)
    }
  }
  check('and no two lines of one look the same',
    shops.muddled.length === 0,
    shops.muddled.length
      ? shops.muddled.slice(0, 2).map((v) => `vendor ${v.entry}: `
        + v.same.join(' / ')).join(' | ')
      : `${shops.twins} pairs are the same item twice — identical in every `
      + 'column this game ships, which is where the no-names rule lands')

  // The workbench, which is the shop's own window with a different list in it.
  // Pressed for real, through the DOM, because a check that calls `makeOne`
  // straight is a check that has never opened the window — and the window is
  // where three rounds of this game's bugs have been.
  {
    const set = await p.evaluate(() => {
      window.__takeUp(129)
      window.__give({ 2589: 8 })
      return { rows: window.__craft(129).length,
               bag: window.__bag()['2589'] ?? 0 }
    })
    check('a person who has learned a trade has something to make',
      set.rows > 0, `${set.rows} recipes, ${set.bag} linen in the bag`)
    await p.keyboard.press('t')
    await p.waitForTimeout(120)
    const open_ = await p.evaluate(() => {
      const box = document.querySelector('#shop')
      const rows = [...document.querySelectorAll('#shop li')]
      return { up: box && !box.hidden, rows: rows.length,
               title: document.querySelector('#shop h3, #shop .title')?.textContent
                 ?? '', first: rows[0]?.textContent ?? '' }
    })
    check('and pressing T opens the workbench on it',
      open_.up === true && open_.rows > 0,
      `${open_.rows} rows — ${open_.first}`)
    if (open_.rows) {
      const made = await p.evaluate(() => {
        const before = { ...window.__bag() }
        const li = document.querySelector('#shop li')
        li.click()
        return { before, after: { ...window.__bag() } }
      })
      const grew = Object.keys(made.after)
        .filter((k) => (made.after[k] ?? 0) > (made.before[k] ?? 0))
      const shrank = Object.keys(made.before)
        .filter((k) => (made.after[k] ?? 0) < (made.before[k] ?? 0))
      check('and pressing a row makes one out of what the bag held',
        grew.length === 1 && shrank.length >= 1,
        `${shrank.join(', ')} -> ${grew.join(', ')}`)
    }
  }
  // Standing, at the counter, where the only thing it does can be seen.
  //
  // Pressed through `priceAt` — which is what the row, the purchase and the
  // trainer all read — rather than worked out here.  A check with its own
  // copy of the formula agrees with itself and with nothing else.
  {
    const at = await p.evaluate(() => {
      const doc = window.__stands()
      return { sides: doc.sides, stormwind: doc.words['스톰윈드'] }
    })
    check('a character begins already standing somewhere',
      at.sides === true && at.stormwind.at > 0 && at.stormwind.rank === 4,
      `스톰윈드 ${at.stormwind?.at} — rank ${at.stormwind?.rank}`)
    const vendor = await p.evaluate(async () => {
      const doc = await (await fetch('./world/items.json')).json()
      const of = doc.of ?? {}
      const entry = Object.keys(doc.stock).find((e) => of[e] === 72)
      return entry ? Number(entry) : null
    })
    check('and a shopkeeper of that side is standing here',
      vendor !== null, `vendor ${vendor}`)
    if (vendor !== null) {
      const moved = await p.evaluate((v) => {
        const before = window.__stands(v)
        // What every errand in the slice is worth, handed over at once
        // through the same call the hand-in makes.
        window.__pay([[72, 5445]])
        const after = window.__stands(v)
        return { before, after }
      }, vendor)
      check('a price is already five per cent off at 우호',
        moved.before.price === 950, `1000 -> ${moved.before.price}`)
      check('and ten at 존경',
        moved.after.words['스톰윈드'].rank === 5 && moved.after.price === 900,
        `rank ${moved.before.words['스톰윈드'].rank} -> `
        + `${moved.after.words['스톰윈드'].rank}, `
        + `${moved.before.price} -> ${moved.after.price}`)
    }
  }
  // Quality, which was baked, shipped, and read in three places out of five.
  //
  // Issue 157 closed on *"it is baked and never read"* and nobody looked at
  // the screen afterwards.  353 green items, 34 blue and 8 purple against 976
  // white ones, and in the original the colour is the first thing you read
  // about an item — before the name.  **This game ships no names at all**, so
  // the colour has to do more work here and not less.
  {
    const spread = await p.evaluate(async () => {
      const doc = await (await fetch('./world/items.json')).json()
      const by = {}
      for (const v of Object.values(doc.items)) by[v[2]] = (by[v[2]] ?? 0) + 1
      return by
    })
    check('this world has items of more than one quality',
      Object.keys(spread).length > 1,
      Object.entries(spread).map(([q, n]) => `${q}:${n}`).join(' '))
    // Every place an item has a face.  Read as *colours on the glass* rather
    // than as calls to `tintOf`, because the failure this is for is a panel
    // that draws the item and forgets the colour — and a grep would not see it.
    await p.evaluate(() => window.__give({ 2589: 4, 1251: 1, 2302: 1 }))
    // The bag.
    await p.keyboard.press('b')
    await p.waitForTimeout(250)
    const bagTints = await p.evaluate(() =>
      [...document.querySelectorAll('#bag li *')]
        .map((e) => e.style.color).filter(Boolean))
    await p.keyboard.press('b')
    check('and the bag shows what quality a thing is',
      bagTints.length > 0, `${bagTints.length} coloured, e.g. ${bagTints[0]}`)
    // The character sheet.
    await p.keyboard.press('c')
    await p.waitForTimeout(250)
    const sheetTints = await p.evaluate(() =>
      [...document.querySelectorAll('#sheet .worn .square:not(.bare) .pic')]
        .map((e) => e.style.color).filter(Boolean))
    await p.keyboard.press('c')
    check('and the character sheet does', sheetTints.length > 0,
      `${sheetTints.length} coloured`)
    // The shop, which had it first — and read off the window rather than off
    // the row builder, for the same reason as the two above.
    const vendor = await p.evaluate(async () => {
      const doc = await (await fetch('./world/items.json')).json()
      const e = Object.keys(doc.stock).find((k) => doc.stock[k].length > 3)
      return e ? Number(e) : null
    })
    if (vendor !== null) {
      await p.evaluate((v) => window.__openShopAt?.(v), vendor)
      await p.waitForTimeout(250)
      const shopTints = await p.evaluate(() =>
        [...document.querySelectorAll('#shop li .pic')]
          .map((e) => e.style.color).filter(Boolean))
      check('and a shop row does', shopTints.length > 0,
        `${shopTints.length} of the rows carry a colour`)
    }
    // And the log, which is the one place a thing is met for the first time:
    // the moment it falls.
    const fell = await p.evaluate(() => {
      const got = window.__lootNearby?.()
      return got
    })
    await p.waitForTimeout(200)
    // Matched on the text that just fell, not on "some span somewhere is
    // coloured": the log holds seven lines and one of the others could have
    // put a colour there.
    const logTints = await p.evaluate((said) =>
      [...document.querySelectorAll('#log div span')]
        .filter((e) => e.style.color && said.includes(e.textContent))
        .map((e) => `${e.textContent}:${e.style.color}`), fell?.said ?? '')
    check('and the line that says a thing just fell does',
      !!fell && fell.tinted > 0 && logTints.length >= fell.tinted,
      `${logTints.join(' ')} — ${JSON.stringify(fell)}`)
  }
  // --- what a save is, and what it costs ------------------------------------
  //
  // Issue 206.  The save threw away everything that was still on the
  // character, which is not a rule — **a debuff a reload clears is the shape
  // of a bug**, and the way a player finds that out is by using it.  And the
  // cooldowns it did keep were stored as moments on a clock that starts at
  // nought every load, so a character saved an hour in came back unable to
  // press anything for an hour.
  {
    const put = await p.evaluate(() => window.__afflict())
    const back = await p.evaluate(() => {
      const raw = JSON.parse(JSON.stringify(window.__save()))
      // Washed off first, so restoring cannot pass by leaving things alone.
      window.__standing()
      window.__load(JSON.parse(JSON.stringify({ ...raw,
        you: { ...raw.you, auras: {}, cools: {} } })))
      const wiped = window.__standing()
      window.__load(raw)
      return { wiped, now: window.__standing(), saved: raw.you.auras,
        cools: raw.you.cools }
    })
    check('a reload does not wash off what is still on you',
      JSON.stringify(put) === JSON.stringify(back.now)
      && JSON.stringify(back.wiped) !== JSON.stringify(put),
      `${JSON.stringify(put)} -> ${JSON.stringify(back.now)}`)
    // And the times in the file are what is **left**, not when they end: the
    // save has to survive a clock that restarts.
    check('and the times in it are what is left rather than when it ends',
      (back.saved?.shout?.[0] ?? 0) > 0 && (back.saved?.shout?.[0] ?? 0) <= 101
      && Object.values(back.cools).every((v) => v > 0 && v <= 8),
      `shout ${back.saved?.shout?.[0]}s left, cools `
      + `${JSON.stringify(back.cools)}`)
    // What a cast in flight and a target's combo points do is nothing, on
    // purpose: closing the tab interrupts one and the other belongs to
    // somebody who is not there.
    check('and a cast in flight is not carried over',
      (await p.evaluate(() => window.__you().casting)) === null,
      'closing the tab interrupts a cast, which is what the server does')

    // The size, which the performance budget had no line for.
    const size = await p.evaluate(async () => {
      const one = JSON.stringify(window.__save())
      const qd = await (await fetch('./world/quests.json')).json()
      // The biggest a save gets: every errand in the world finished, which the
      // log keeps for ever.
      const big = JSON.parse(one)
      big.quests = { held: [], done: qd.quests.map((q) => q.id) }
      return { now: one.length, most: JSON.stringify(big).length,
        slots: window.__picks().slots }
    })
    // **A save grows with the character and not with the world**, which is
    // the rule the number follows from — everything in it is an id, a count or
    // a position, and the rows behind those ids are the bake's.  A thousand
    // bytes for a finished character in a world of 1,624 items and 51 errands
    // is that rule holding; a save that had started keeping rows would be the
    // first thing to break this line.
    check('a save fits in four kilobytes', size.most <= 4 * 1024,
      `${size.now} bytes now, ${size.most} with every errand in the world `
      + 'finished, of 4,096')
    check('and every slot of them in forty',
      size.most * size.slots <= 40 * 1024,
      `${size.slots} slots x ${size.most} = ${size.most * size.slots} of 40,960`)

  }
  // --- what wears out, and what mending it costs (issue 83) -----------------
  //
  // Closed with durability left out on the strength of a comment about
  // resurrection sickness; `Unit::Kill` wears everything worn on every death.
  // Every expected number is worked here from `items.json` and the core's
  // formula rather than asked of the scene, because a check that reads the
  // same side as the bug is blind to it.
  {
    // Into the world first.  This page opened on the screen that makes a
    // character, which replaces the game and covers the shop's foot — the
    // first run of this block pressed the mend button and hit that screen.
    await p.evaluate(() => window.__makeOne('수리공'))
    await p.waitForFunction(() => document.getElementById('create').hidden,
      null, { timeout: 10000 })
    await p.keyboard.press('Escape')
    const doc = await p.evaluate(async () =>
      (await fetch('./world/items.json')).json())
    const rowOf = (gear, slot) => doc.items[String(gear[slot])]
    const start = await p.evaluate(() => window.__dura())
    const wearing = Object.keys(start.worn)
    check('he starts wearing something that wears out', wearing.length > 0,
      JSON.stringify(start.worn))

    // Dying.  `uint32(max * 0.1f)`, never under one, off every worn thing.
    const died = await p.evaluate(() => { window.__die(); return window.__dura() })
    const expectDeath = (now, max) =>
      Math.max(0, now - Math.max(1, Math.trunc(max * Math.fround(0.1))))
    const wrong = wearing.filter((s) =>
      died.worn[s]?.[0] !== expectDeath(start.worn[s][0], start.worn[s][1]))
    check('dying wears a tenth off everything he is wearing', wrong.length === 0,
      wearing.map((s) => `${s} ${start.worn[s][0]} -> ${died.worn[s]?.[0]}`
        + ` of ${start.worn[s][1]}`).join(', '))

    // Broken.  Everything worn to nought, through the path a blow takes.
    const zero = Object.fromEntries(wearing.map((s) => [s, 0]))
    const bust = await p.evaluate((z) => window.__dura(z), zero)
    const armourLost = wearing.reduce((n, s) => n + rowOf(bust.gear, s)[8], 0)
    const weapon = bust.gear.weapon !== undefined && wearing.includes('weapon')
      ? rowOf(bust.gear, 'weapon') : null
    check('a broken thing stops counting: its armour goes',
      died.line[4] - bust.line[4] === armourLost,
      `armour ${died.line[4]} -> ${bust.line[4]}, the broken items carried `
      + `${armourLost}`)
    if (weapon) {
      // `GetWeaponForAttack` will not hand a broken weapon to a swing, so the
      // swing is the bare hand's two seconds, not the sword's.
      check('and a broken weapon swings like a bare hand',
        died.line[3] === weapon[7] && bust.line[3] === 2000,
        `swing ${died.line[3]} -> ${bust.line[3]}`)
    }
    await p.keyboard.press('c')
    await p.waitForFunction((n) =>
      document.querySelectorAll('#sheet .worn .square.broken').length === n,
      wearing.length, { timeout: 5000 }).catch(() => {})
    const marked = await p.evaluate(() =>
      document.querySelectorAll('#sheet .worn .square.broken').length)
    check('and the sheet marks each broken square', marked === wearing.length,
      `${marked} of ${wearing.length} marked`)
    await p.keyboard.press('c')

    // Saved and restored, with money enough to mend put in the same way.
    const saved = await p.evaluate(() => {
      const raw = JSON.parse(JSON.stringify(window.__save()))
      raw.you.purse = 100000
      window.__load(JSON.parse(JSON.stringify({ ...raw,
        you: { ...raw.you, dura: { worn: {}, held: {} } } })))
      const whole = window.__dura()
      window.__load(raw)
      return { raw: raw.you.dura, whole: whole.worn, back: window.__dura() }
    })
    check('wear is saved and comes back on a reload',
      Object.values(saved.whole).every(([n, m]) => n === m)
      && wearing.every((s) => saved.back.worn[s]?.[0] === 0)
      && wearing.every((s) => saved.raw.worn[s] === 0),
      `saved ${JSON.stringify(saved.raw)}`)

    // Mending, at somebody who mends, pressed through the pointer.
    const at = await p.evaluate(() => window.__mendAt())
    await p.waitForFunction(() => {
      const b = document.querySelector('#shop .mend')
      return b && !b.hidden && !b.disabled && b.getBoundingClientRect().width > 0
    }, null, { timeout: 5000 }).catch(() => {})
    const owed = wearing.reduce((sum, s) => {
      const it = rowOf(saved.back.gear, s)
      const lost = saved.back.worn[s][1] - saved.back.worn[s][0]
      const first = Math.trunc(lost * doc.repair.costs[String(it[3])][it[17]]
        * doc.repair.quality[String((it[2] + 1) * 2)])
      const cost = Math.trunc(first * Math.fround(at?.discount ?? 1))
      return sum + (lost > 0 ? (cost === 0 ? 1 : cost) : 0)
    }, 0)
    const button = await p.evaluate(() => {
      const b = document.querySelector('#shop .mend')
      if (!b || b.hidden) return null
      const r = b.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: b.textContent }
    })
    check('a shopkeeper who mends offers it in his window', !!at && !!button,
      `${JSON.stringify(at)} ${button?.text}`)
    if (button) {
      const purse = saved.back.purse
      await p.mouse.click(Math.round(button.x), Math.round(button.y))
      await p.waitForFunction((was) => window.__dura().purse !== was, purse,
        { timeout: 5000 }).catch(() => {})
      const mended = await p.evaluate(() => window.__dura())
      check('and mending costs what the rule says',
        purse - mended.purse === owed,
        `paid ${purse - mended.purse}, the rule says ${owed} `
        + `(discount ${at?.discount})`)
      check('and puts everything back to whole and counting',
        Object.values(mended.worn).every(([n, m]) => n === m)
        && mended.line[4] === died.line[4] && mended.line[3] === died.line[3],
        `armour ${mended.line[4]} (was ${died.line[4]}), swing ${mended.line[3]}`)
    }
    await p.evaluate(() => window.__openShopAt(0))
  }
  await p.close()
}

console.log(`\nconsole errors: ${errs.length ? errs.slice(0, 3).join(' | ') : 'none'}`)
console.log(bad === 0 ? 'all checks passed' : `${bad} FAILED`)
await b.close()
process.exit(bad === 0 ? 0 : 1)

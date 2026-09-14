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
    const hairs = p.locator('#create .looks').nth(0).locator('.pick')
    const beards = p.locator('#create .looks').nth(1).locator('.pick')
    const looked = { hairs: await hairs.count(), beards: await beards.count() }
    await hairs.nth(looked.hairs - 1).click()
    await beards.nth(looked.beards - 1).click()
    // And the class row, which is the one that changes what walks out.
    // A *different* row, because pressing the one that is already chosen is a
    // check that passes whether or not the press arrived — which is the same
    // shape of blindness as clicking from script.
    const classes = p.locator('#create .classes .pick')
    const before = await p.evaluate(() => window.__make().cls)
    await classes.nth(1).click()
    const heard = await p.evaluate(() => window.__make().cls)
    check('the screen answers a real press', heard !== before && heard > 0,
      `class ${before} -> ${heard} after pressing the second row`)
    await classes.nth(0).click()
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
    // Drawn, not just remembered: `heroLayers` counts where the pictures
    // actually land, so this says the hair and the beard reached the glass.
    await p.waitForTimeout(500)
    const drawn = await p.evaluate(() => window.__arms())
    check('and the world draws what was chosen',
      born.made?.hair && born.made?.beard && drawn.layers >= 4,
      `${born.made?.hair} and ${born.made?.beard}, `
      + `drawn out of ${drawn.layers} pictures`)
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
    one.rows.length === 1 && one.rows[0].name === '첫째' && one.mine === 1,
    JSON.stringify(one.rows))
  // One is not a list.  The original selects an account's only character
  // rather than asking which of the one you meant.
  check('and one character does not need choosing', one.up === false,
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

  // And deleting removes one and only one.
  await p.evaluate(() => window.__pickErase(1))
  await p.waitForTimeout(300)
  await boot()
  const left = await p.evaluate(() => window.__picks())
  check('deleting takes one away and leaves the rest',
    left.rows.length === 1 && left.rows[0].slot === 2,
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
  }))

  const before = await onScreen()
  const filled = (bar) => bar.squares.filter((sq) => sq.filled).length
  // `1 +` and not `2 +`: attack keeps the first square and **talk gave its up**
  // when the spellbook outgrew one row (issue 155).  Talking was never an
  // ability, the original has no button for it either — you click the person —
  // and the help line says `E`.
  check('the bar starts with what the character knows',
    filled(before) === 1 + before.spells.length,
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
    filled(after) === 1 + after.spells.length && after.spells.length > before.spells.length,
    `${before.spells.length} -> ${after.spells.length} spells, ${filled(after)} filled`)
  // And there is a square for every one of them.  The count of squares is a
  // decision — the original's bar is twelve and ours is two rows of eight —
  // and the thing that must hold is that a character who has bought everything
  // can press all of it.
  check('and there is room for everything a character can hold',
    after.squares.length >= 1 + after.spells.length,
    `${after.squares.length} squares for ${1 + after.spells.length}`)

  // And every square answers to the letter written on it.  Pressed for real
  // through the keyboard, because the bug was in the handler and a check that
  // calls the table would have passed while it was broken.
  const wrong = []
  for (let i = 1; i < after.squares.length; i++) {
    const sq = after.squares[i]
    if (!sq.filled) continue
    // A filled square with no letter on it is the same bug seen from the
    // other end: the keys ran out before the abilities did.
    if (!sq.key) { wrong.push(`${sq.label} has no key`); continue }
    await p.keyboard.press(sq.key)
    const heard = await p.evaluate(() => window.__bar().asked)
    if (heard !== after.spells[i - 1]) {
      wrong.push(`${sq.key}=${sq.label} fired ${heard} not ${after.spells[i - 1]}`)
    }
  }
  check('and every square answers to the letter on it', wrong.length === 0,
    wrong.join('; ') || `${after.spells.length} squares pressed`)
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
  await p.close()
}

console.log(`\nconsole errors: ${errs.length ? errs.slice(0, 3).join(' | ') : 'none'}`)
console.log(bad === 0 ? 'all checks passed' : `${bad} FAILED`)
await b.close()
process.exit(bad === 0 ? 0 : 1)

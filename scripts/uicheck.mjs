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
  await p.close()
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
    const book = (await (await fetch('./world/spells.json')).json()).spells
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
  await p.close()
}

console.log(`\nconsole errors: ${errs.length ? errs.slice(0, 3).join(' | ') : 'none'}`)
console.log(bad === 0 ? 'all checks passed' : `${bad} FAILED`)
await b.close()
process.exit(bad === 0 ? 0 : 1)

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

const STATES = [
  ['nothing open', async () => {}],
  ['a conversation', async (p) => {
    await p.evaluate(() => window.__vendor())
    await p.waitForTimeout(250)
    await p.keyboard.press('e')
  }],
  ['the bag', async (p) => { await p.evaluate(() => window.__give()); await p.keyboard.press('b') }],
  ['the sheet', async (p) => { await p.keyboard.press('c') }],
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
    await p.keyboard.press('Escape')
    await p.waitForTimeout(150)
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

console.log(`\nconsole errors: ${errs.length ? errs.slice(0, 3).join(' | ') : 'none'}`)
console.log(bad === 0 ? 'all checks passed' : `${bad} FAILED`)
await b.close()
process.exit(bad === 0 ? 0 : 1)

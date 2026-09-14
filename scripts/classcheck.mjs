#!/usr/bin/env node
/**
 * Every class this game offers can be played, and no browser is needed to say so.
 *
 *   npm run classcheck
 *
 * Issue 188 asked for six classes and stated the two conditions that decide
 * whether they are open rather than listed:
 *
 *   * **every class a player may pick has a spellbook** — no class that can be
 *     pressed and then cannot learn anything
 *   * **every class a player may pick has a trainer standing in the slice** —
 *     which passed while the game had one class, and is the sort of thing that
 *     stops passing quietly
 *
 * Neither is a question about the screen, so neither needs one: `slice.json`
 * says which classes this game has and the three baked files say what each of
 * them gets.  That is the same shape as `simcheck` — the rules run in Node,
 * and only the things that have to be *looked at* want a browser.
 *
 * It reads the baked world rather than the pipeline, on purpose.  The pipeline
 * has a client behind it and CI has not; what is committed is what a visitor
 * downloads, so what is committed is what gets checked.
 */
import { readFileSync } from 'node:fs'

let bad = 0
const check = (what, ok, note = '') => {
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${what}${note ? ` -> ${note}` : ''}`)
  if (!ok) bad++
}

const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const slice = read('slice.json')
const roster = read('public/world/player.json')
const book = read('public/world/spells.json')
const shelf = read('public/world/items.json')
const quests = read('public/world/quests.json')

/**
 * Word to id, and this is the one place in `scripts/` that needs the table.
 *
 * `pipeline/slice.py` owns it; everything baked is keyed on the id already,
 * which is why nothing else here has to know. What this file checks is the
 * join itself — that the words in `slice.json` and the ids in the three baked
 * files are talking about the same six classes — so it is the one place the
 * two vocabularies have to meet.
 */
const CLASS_ID = { Warrior: 1, Paladin: 2, Hunter: 3, Rogue: 4, Priest: 5,
  DeathKnight: 6, Shaman: 7, Mage: 8, Warlock: 9, Druid: 11 }

const want = (slice.classes ?? []).map((w) => [w, CLASS_ID[w]])
console.log(`what this game is: ${want.map(([w]) => w).join(', ')}\n`)
check('every class in slice.json has a number',
  want.every(([, id]) => id), want.filter(([, id]) => !id).map(([w]) => w).join(', ')
  || `${want.length} classes`)

// --- a book each ----------------------------------------------------------
const missing = want.filter(([, id]) => !(book.books?.[String(id)]?.length))
check('every class a player may pick has a spellbook',
  missing.length === 0,
  missing.map(([w]) => w).join(', ')
  || want.map(([w, id]) => `${w} ${book.books[String(id)].length}`).join(', '))

// And the book has to have something in it **at level one**, which is the
// narrower promise: a class whose first ability is at level four is a class
// that starts the game with nothing to press.
const empty = want.filter(([, id]) =>
  !(book.books?.[String(id)] ?? []).some((sp) => sp.level <= 1 && sp.free))
check('and something in it he is created holding', empty.length === 0,
  empty.map(([w]) => w).join(', ')
  || want.map(([w, id]) => `${w} ${(book.books[String(id)])
    .filter((sp) => sp.level <= 1 && sp.free).length}`).join(', '))

// --- a trainer each -------------------------------------------------------
//
// This one passed while the game had one class, which is exactly why it is
// written down: a check that has never been able to fail is a promise nobody
// has made.
const schools = Object.values(shelf.trainers ?? {})
const taught = want.map(([w, id]) =>
  [w, id, schools.filter((t) => t.for === id).length])
check('every class a player may pick has a trainer in the slice',
  taught.every(([, , n]) => n > 0),
  taught.map(([w, , n]) => `${w} ${n}`).join(', '))

// And what a trainer sells has to be in the book of the class it teaches.
// `items.py` asserts the same thing at bake time; this asserts it about what
// was committed, which is what a visitor actually gets.
const stray = []
for (const [who, t] of Object.entries(shelf.trainers ?? {})) {
  const mine = new Set((book.books?.[String(t.for)] ?? []).map((sp) => sp.id))
  for (const row of t.teaches ?? []) {
    if (!mine.has(row[0])) stray.push(`${who} sells ${row[0]}`)
  }
}
check('and nothing on a shelf that its own class cannot cast',
  stray.length === 0, stray.slice(0, 4).join('; ')
  || `${schools.length} trainers, ${schools.reduce((n, t) => n + t.teaches.length, 0)} rows`)

// --- what he is made of ---------------------------------------------------
const statless = want.filter(([, id]) => {
  const mine = roster.classes?.[String(id)]
  const [lo, hi] = roster.levels
  return !mine || Object.keys(mine.stats ?? {}).length !== hi - lo + 1
})
check('every class has stats at every level this game reaches',
  statless.length === 0, statless.map(([w]) => w).join(', ')
  || `${want.length} classes over levels ${roster.levels.join('-')}`)

// A class that casts needs a bar to cast out of, and one that does not must
// not have one: `player_class_stats.BaseMana` is the column that says, and a
// warrior's is nought on every line — which is what made it invisible for as
// long as this game had one class.
const wrongBar = want.filter(([, id]) => {
  const mine = roster.classes?.[String(id)]
  const one = mine?.stats?.[String(roster.levels[0])] ?? []
  return mine?.power === 'mana' ? !(one[6] > 0) : (one[6] ?? 0) !== 0
})
check('and mana exactly where the class casts on it', wrongBar.length === 0,
  wrongBar.map(([w]) => w).join(', ')
  || want.map(([w, id]) => `${w} ${roster.classes[String(id)].power}`).join(', '))

// And a class that casts needs the spirit ratio, or its bar never refills.
const dry = want.filter(([, id]) => {
  const mine = roster.classes?.[String(id)]
  return mine?.power === 'mana'
    && !((mine.spirit?.[String(roster.levels[1])] ?? 0) > 0)
})
check('and a way to get it back', dry.length === 0,
  dry.map(([w]) => w).join(', ')
  || want.filter(([, id]) => roster.classes[String(id)].power === 'mana')
    .map(([w]) => w).join(', ') + ' regenerate')

// --- what he is handed ----------------------------------------------------
const bare = want.filter(([, id]) =>
  !(roster.classes?.[String(id)]?.kit ?? []).some((k) => k[2] > 0))
check('every class leaves the door holding a weapon', bare.length === 0,
  bare.map(([w]) => w).join(', ')
  || want.map(([w, id]) => `${w} ${roster.classes[String(id)].kit.length}`).join(', '))

// --- the class filter, issue 151's, for all six ---------------------------
//
// A quest whose mask names some classes and not others has to be offerable to
// at least one of the ones this game has — otherwise it is a row nobody can
// ever see, which is the same waste the bake's own filter exists to stop.
const mask = want.reduce((m, [, id]) => m | (1 << (id - 1)), 0)
const orphan = (quests.quests ?? [])
  .filter((q) => q.classes && !(q.classes & mask))
check('no errand is shipped for a class this game has not got',
  orphan.length === 0, orphan.map((q) => `q${q.id}`).slice(0, 6).join(', ')
  || `${(quests.quests ?? []).filter((q) => q.classes).length} of `
    + `${(quests.quests ?? []).length} name a class`)

// And the other side of it: each class has to actually be offered something,
// or the filter is a wall rather than a sieve.
const noWork = want.filter(([, id]) =>
  (quests.quests ?? []).filter((q) => !q.classes || (q.classes & (1 << (id - 1))))
    .length === 0)
check('and every class is offered errands', noWork.length === 0,
  noWork.map(([w]) => w).join(', ')
  || want.map(([w, id]) => `${w} ${(quests.quests ?? [])
    .filter((q) => !q.classes || (q.classes & (1 << (id - 1)))).length}`).join(', '))

console.log(bad === 0 ? '\nall checks passed' : `\n${bad} failed`)
process.exit(bad === 0 ? 0 : 1)

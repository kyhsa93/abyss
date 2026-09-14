#!/usr/bin/env node
/**
 * The wiki's own bookkeeping, checked.
 *
 *   npm run wikicheck                              # what CI can do
 *   ABYSS_WIKI=~/src/abyss.wiki npm run wikicheck   # the whole of it
 *
 * Two sections of that wiki are lists that only work if somebody maintains
 * them, and issues 191 and 192 are the same complaint about the two: **붙일
 * 검사** is a promise that nobody counted, and **아직 답이 없는 것** is a
 * question nobody deletes once it is answered.  A hundred and two of the
 * first and a hundred and sixty-five of the second.
 *
 * Issue 191 opened with a number that looked like health and was not: *309
 * checks, 0 failures*, next to a list of things built recently with **no
 * checks at all**.  The wiki had been ending its pages with a 붙일 검사 table
 * for a year — a hundred and two lines of "we should check this" — and
 * nothing counted how many of them were attached.
 *
 * That is this repository's own recurring shape.  `tint` was computed and
 * never read; `I_QUALITY` was defined and read nowhere; twenty-four cells of
 * `slash` were cut and never played.  A promise nobody keeps is the same
 * thing one level up, and it is worse in exactly one way: **the promise is
 * what somebody reads when they want to know whether it is safe to change
 * something.**
 *
 * Two reaches on purpose.  The wiki is a different git repository and CI does
 * not have it — the same fact as the client, and handled the same way: the
 * half that can run everywhere runs everywhere, and the half that needs the
 * thing says so.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

let bad = 0
const check = (what, ok, note = '') => {
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${what}${note ? ` -> ${note}` : ''}`)
  if (!ok) bad++
}

const TABLE = 'docs/promised-checks.md'

/** The table, as `[promise, kept by]` in the order it is written. */
function rowsOf(text) {
  const out = []
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) continue
    const cells = line.slice(1).replace(/\|\s*$/, '').split('|').map((c) => c.trim())
    if (cells.length < 2) continue
    if (cells[0] === '약속' || /^-+$/.test(cells[0].replace(/[: ]/g, ''))) continue
    out.push([cells[0], cells[1].replace(/^`|`$/g, '')])
  }
  return out
}

const rows = rowsOf(readFileSync(TABLE, 'utf8'))
const kept = rows.filter(([, v]) => !v.startsWith('—'))
check('the table has the promises in it', rows.length > 50,
  `${rows.length} promises, ${kept.length} of them kept`)

// --- every check this table names actually exists --------------------------
//
// The half that catches the drift going the other way: a promise recorded as
// kept by a label somebody has since renamed is a row that reads as safety and
// is not.  Quoted strings are matched verbatim against the file's own source,
// which is the only thing that cannot be renamed out from under this.
const gone = []
for (const [promise, where] of kept) {
  const at = where.indexOf(': ')
  if (at < 0) { gone.push(`${promise}: "${where}" is not <file>: <check>`); continue }
  const file = where.slice(0, at).trim()
  const what = where.slice(at + 2).trim()
  if (!existsSync(file)) { gone.push(`${promise}: no ${file}`); continue }
  const src = readFileSync(file, 'utf8')
  if (what.startsWith('"')) {
    // A label, matched as written.  Some of them are built out of a template
    // — `${name}: nothing is drawn on a thumb` — so what is quoted here is
    // the part that is not the template.
    const label = what.slice(1, -1).replace(/\\'/g, "'")
    if (!src.includes(label) && !src.includes(label.replace(/'/g, "\\'"))) {
      gone.push(`${promise}: ${file} no longer says "${label}"`)
    }
  } else if (!new RegExp(`(^|\\n)\\s*(def |const |let |[A-Z_]+ *=)?${
    what.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(src)) {
    gone.push(`${promise}: ${file} has no ${what}`)
  }
}
check('and every check it names is still there', gone.length === 0,
  gone.slice(0, 4).join(' | ')
  || `${kept.length} named across ${new Set(kept.map(([, v]) =>
    v.split(':')[0])).size} files`)

// --- and the check names in the harness are not orphans --------------------
//
// The counterpart: how much of the harness nobody promised.  Not a failure —
// a check written because something broke is a good check with no wiki line
// behind it — but a number worth printing, because the day it is most of the
// harness the wiki has stopped describing this game.
{
  const labels = new Set()
  for (const f of readdirSync('scripts').filter((n) => n.endsWith('.mjs'))) {
    const src = readFileSync(join('scripts', f), 'utf8')
    for (const m of src.matchAll(/check\(\s*['"`]([^'"`]{8,})['"`]/g)) {
      labels.add(m[1])
    }
  }
  const promised = new Set(kept.map(([, v]) => v.slice(v.indexOf(': ') + 2))
    .filter((v) => v.startsWith('"')).map((v) => v.slice(1, -1)))
  const unasked = [...labels].filter((l) =>
    ![...promised].some((p) => l.includes(p) || p.includes(l)))
  console.log(`      (${labels.size} labels in the harness, `
    + `${labels.size - unasked.length} of them named by a promise; `
    + `${unasked.length} were written because something broke)`)
}

// --- and the table says the same thing the wiki does -----------------------
//
// Only where the wiki is. It is a second git repository — `abyss.wiki` — and
// CI has no more of it than it has of the game client, which is why this half
// announces itself rather than failing.
const WIKI = process.env['ABYSS_WIKI']
  ?? join(homedir(), 'src', 'abyss.wiki')
if (!existsSync(WIKI)) {
  console.log(`      (no wiki at ${WIKI}, so the promises themselves are not `
    + 'compared — set ABYSS_WIKI to a clone of abyss.wiki)')
} else {
  const said = []
  for (const f of readdirSync(WIKI).filter((n) => n.endsWith('.md'))) {
    let inside = false
    for (const line of readFileSync(join(WIKI, f), 'utf8').split('\n')) {
      if (/^#{2,3} .*붙일 검사/.test(line) || /^붙일 검사/.test(line)) {
        inside = true
        continue
      }
      if (inside && /^#{1,3} /.test(line)) inside = false
      if (!inside) continue
      if (line.trim().startsWith('|')) {
        const first = line.trim().replace(/^\||\|$/g, '').split('|')[0].trim()
        if (first && first !== '검사' && !/^[-: ]+$/.test(first)) said.push(first)
      } else if (/^\s*[-*] /.test(line)) said.push(line.trim().slice(2))
    }
  }
  const mine = new Set(rows.map(([p]) => p))
  const theirs = new Set(said)
  const missing = [...theirs].filter((p) => !mine.has(p))
  const stale = [...mine].filter((p) => !theirs.has(p))
  check('every promise the wiki makes is in this table',
    missing.length === 0 && stale.length === 0,
    [...missing.slice(0, 3).map((p) => `new: ${p}`),
      ...stale.slice(0, 3).map((p) => `gone: ${p}`)].join(' | ')
    || `${said.length} lines in the wiki, ${rows.length} rows here`)

  // --- and the other list nobody maintains ---------------------------------
  //
  // Issue 192: every page ends in **아직 답이 없는 것**, which is a good
  // section — writing down what you do not know is the point of it — and
  // nobody deletes a line once it is answered.  A hundred and sixty-five
  // questions accumulated that way, with the real ones mixed in, which makes
  // the list unusable as a map.
  //
  // **This does not fail.**  Not knowing something is allowed; the issue said
  // so outright. The rule it asks for is narrower and is about bookkeeping
  // rather than knowledge: *a question carries an answer or an issue number*.
  // One with neither is the thing that piles up, and the only thing that
  // stops it piling up again is a number somebody sees every time they run
  // the checks.
  const open = { answered: 0, issued: 0, bare: 0 }
  const bare = []
  for (const f of readdirSync(WIKI).filter((n) => n.endsWith('.md'))) {
    let inside = false
    // **A question is a bullet and everything wrapped under it**, which is how
    // a person reads one: the answer to a two-line question is usually on its
    // second line.  Counting line by line called every one of those unanswered
    // and every wrapped line a question of its own.
    const asked = []
    for (const line of readFileSync(join(WIKI, f), 'utf8').split('\n')) {
      if (/^#{2,4} .*아직 답이 없는 것/.test(line)) { inside = true; continue }
      if (inside && /^#{1,4} /.test(line)) inside = false
      if (!inside) continue
      if (/^\s*[-*] /.test(line)) asked.push(line.trim().slice(2))
      else if (asked.length && line.trim()) asked[asked.length - 1] += ' ' + line.trim()
    }
    for (const q of asked) {
      if (/#\d{1,4}/.test(q)) open.issued++
      else if (q.includes('→') || q.includes('**답') || q.startsWith('~~')) {
        open.answered++
      } else { open.bare++; bare.push(`${f.slice(0, -3)}: ${q.slice(0, 40)}`) }
    }
  }
  const asked = open.answered + open.issued + open.bare
  console.log(`      (${asked} open questions in the wiki: ${open.answered} `
    + `carry an answer, ${open.issued} carry an issue number, and `
    + `**${open.bare} carry neither** — that last number is the one that piles `
    + 'up, and nothing here fails on it)')
  if (open.bare) {
    console.log('       ' + bare.slice(0, 3).join(' | ')
      + (bare.length > 3 ? ` | …${bare.length - 3} more` : ''))
  }
}

console.log(bad === 0 ? '\nall checks passed' : `\n${bad} failed`)
process.exit(bad === 0 ? 0 : 1)

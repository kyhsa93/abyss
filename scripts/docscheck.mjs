/**
 * Do the documents still describe this repository?
 *
 * Three kinds of drift turned up when every page was read once: leftovers from
 * a 3D renderer that never shipped, claims written ahead of the code, and facts
 * that changed underneath a sentence.  From outside all three look identical —
 * a confident paragraph — and only one of them can be caught mechanically:
 * **a document naming a file, or a command, that does not exist.**
 *
 * That is the direction that actually misleads a reader.  `CLAUDE.md` said
 * `src/doll.ts` composited the paperdoll while nothing in `src/` had ever said
 * the word, and the wiki said `scripts/lpc.ts` was inherited whole when it was
 * not.  Both would have failed here the day they were written.
 *
 * The reverse — code with nothing written about it — is real drift too, but it
 * cannot be checked without a judgement about what deserves a paragraph, so it
 * stays a human job.
 *
 * **And there is a third kind, which issue 209 asked for: a decision that was
 * reversed, and a paragraph somewhere still keeping the old one.**  That reads
 * exactly like a rule — a confident sentence, every path in it resolving — and
 * the next person to open the file obeys a rule nobody holds any more.  It
 * cannot be checked in general; a sentence's meaning is not a string.  What
 * can be checked is narrower and is the whole of `REVERSED` below: **a
 * repository may declare that a particular sentence has stopped being true,
 * and then no file may say it without saying so.**  Same bargain as
 * `audit.py`'s `*_DEFAULT_OK` — the declaration is what makes the silence
 * mean something — and it caught four on the day it was written, in
 * `quests.py`, in this file's own neighbour `viewcheck.mjs`, in `CLAUDE.md`'s
 * own directory listing, and in the prompts.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'

let bad = 0
const check = (what, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? `   -> ${detail}` : ''}`)
  if (!ok) bad++
}

/**
 * Paths that live in someone else's tree.  CLAUDE.md quotes AzerothCore's
 * layout by name because that is where the numbers came from, and
 * `src/server/game/Entities` is theirs, not ours.
 */
const ELSEWHERE = ['src/server/']

/**
 * Decisions that were reversed, and the sentence each one left behind.
 *
 * `gone` is matched as written against every file this repository owns.  A
 * file may still carry the phrase — history is worth keeping, and half of
 * these paragraphs exist to say what changed — but only if it also carries
 * `mark`, which is the distinctive phrase that says the thing is over.  So the
 * rule reads: **say it and say it is finished, or do not say it.**
 *
 * Adding a row here is the cheap half.  The dear half is that somebody has to
 * notice a decision was reversed at all, which is what issue 209 was: the
 * owner decided on 2026-09-14 that quest prose would be translated and
 * shipped, three documents were updated, and `quests.py`'s own docstring went
 * on saying the opposite for a day.
 */
const REVERSED = [
  {
    when: '2026-09-14',
    what: "the swing bar is on the bottom edge with the experience bar — issue 228, the owner's",
    gone: ['swing bar stays where it is', 'swing bar stays under the frame'],
    mark: 'issue 228',
  },
  {
    when: '2026-09-14',
    what: "quest prose is translated and shipped — issue 190, the owner's",
    gone: ['Nothing of the prose comes out', 'not a word of the dialogue'],
    mark: 'issue 190',
  },
  {
    when: '2026-09-13',
    what: "the client's terrain is committed and deployed — the owner's",
    gone: ['public/data is not'],
    mark: '2026-09-13',
  },
  {
    when: '2026-09-12',
    what: 'the view is flat: north up the glass, west left, a yard a yard',
    gone: ['quarter view', '2:1 diamond', '2:1 아이소메트릭'],
    mark: 'The quarter view is gone',
  },
]

/**
 * What the ban is read against.  Everything this repository writes by hand.
 *
 * `prompts/` is out, and the reason is the interesting one: those 53 files are
 * **generated** by `make_prompt.py` and `promptcheck` already holds them to
 * it, so the place to mark an abandoned sentence is the generator.  Banning it
 * in the output would fail 53 files for one cause and tell you nothing about
 * which one to edit.
 */
const OWNED = ['CLAUDE.md', 'README.md', 'docs', 'pipeline', 'src', 'scripts']

/** Every path a document claims, in backticks, shaped like one of ours. */
const CLAIM = /`((?:src|pipeline|scripts|public|art)\/[\w./-]+)`/g
/** And every command it tells the reader to run. */
const RUN = /`npm run ([\w:]+)`/g
/**
 * Most of the pipeline is named bare — `bake_terrain.py`, not its directory —
 * so those are matched separately, and only for the three extensions this
 * repository writes.  A `.cpp` or a `.dbc` in backticks belongs to somebody
 * else and is not ours to keep honest.
 */
const BARE = /`([a-z][\w]*\.(?:py|ts|mjs))`/g

// Root and `docs/`.  It read the root alone for a while, which meant the two
// documents that carry the most paths — `promised-checks.md` and `budget.md` —
// were the two nothing checked.
const docs = [...readdirSync('.').filter((f) => f.endsWith('.md')),
  ...readdirSync('docs').filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`)]
const text = docs.map((d) => [d, readFileSync(d, 'utf8')])

const missing = []
const paths = new Set()
for (const [doc, body] of text) {
  for (const [, path] of body.matchAll(CLAIM)) {
    if (paths.has(path) || ELSEWHERE.some((p) => path.startsWith(p))) continue
    paths.add(path)
    if (path.includes('*')) continue          // a family, not a claim
    if (existsSync(path)) continue
    missing.push(`${doc}: ${path}`)
  }
}
/** Every file in the repository, by bare name, so a bare claim can be found. */
const here = new Set()
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue
    if (e.isDirectory()) walk(`${dir}/${e.name}`)
    else here.add(e.name)
  }
}
walk('.')

for (const [doc, body] of text) {
  for (const [, name] of body.matchAll(BARE)) {
    if (paths.has(name)) continue
    paths.add(name)
    if (!here.has(name)) missing.push(`${doc}: ${name}`)
  }
}
check('every file the documents name is there', missing.length === 0,
  missing.length ? missing.join(', ')
    : `${paths.size} paths named across ${docs.length} documents`)

const scripts = new Set(Object.keys(
  JSON.parse(readFileSync('package.json', 'utf8')).scripts ?? {}))
const unrunnable = []
const named = new Set()
for (const [doc, body] of text) {
  for (const [, cmd] of body.matchAll(RUN)) {
    if (named.has(cmd)) continue
    named.add(cmd)
    if (!scripts.has(cmd)) unrunnable.push(`${doc}: npm run ${cmd}`)
  }
}
check('every command they tell you to run exists', unrunnable.length === 0,
  unrunnable.length ? unrunnable.join(', ')
    : `${named.size} of ${scripts.size} scripts are written down`)

// --- and no file keeps a decision that was reversed -----------------------
const mine = []
const gather = (path) => {
  for (const e of readdirSync(path, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue
    const full = `${path}/${e.name}`
    if (e.isDirectory()) gather(full)
    else if (/\.(md|py|ts|mjs)$/.test(e.name)) mine.push(full.replace(/^\.\//, ''))
  }
}
for (const p of OWNED) {
  if (!existsSync(p)) continue
  if (p.endsWith('.md')) mine.push(p)
  else gather(p)
}

/**
 * Everything here is hard-wrapped at about eighty columns, so a phrase is as
 * likely to be split across two lines as not — `**The\n * quarter view is
 * gone**` is the marker and does not contain it.  Whitespace runs, and the
 * comment furniture that sits in them, collapse to one space before matching;
 * the first version of this check reported `CLAUDE.md` for saying the very
 * sentence that clears it.
 */
const flat = (s) => s.replace(/\s*(?:\n\s*(?:\*|\/\/|#|>)?)\s*/g, ' ')
  .replace(/\s+/g, ' ')

const unmarked = []
for (const rev of REVERSED) {
  const mark = flat(rev.mark).toLowerCase()
  for (const file of mine) {
    const body = flat(readFileSync(file, 'utf8'))
    const said = rev.gone.filter((g) => body.includes(flat(g)))
    if (!said.length || body.toLowerCase().includes(mark)) continue
    unmarked.push(`${file}: "${said[0]}" (${rev.when}: ${rev.what})`)
  }
}
check('and nothing still states a decision that was reversed',
  unmarked.length === 0,
  unmarked.length ? unmarked.join(' | ')
    : `${REVERSED.length} reversals declared, ${mine.length} files read`)

console.log(bad ? `${bad} FAILED` : 'all checks passed')
process.exit(bad ? 1 : 0)

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

const docs = readdirSync('.').filter((f) => f.endsWith('.md'))
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

console.log(bad ? `${bad} FAILED` : 'all checks passed')
process.exit(bad ? 1 : 0)

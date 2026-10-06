import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { PROPS } from '../src/render/props'
import { ART, listUrl } from '../src/credits'

/**
 * The art and its attribution have to agree, and the build has to say so.
 *
 * Two of the three licences this game's art is under make attribution a
 * condition, and the game threw an entire generated set away over the rule
 * that "no stated terms is worse than any stated terms". The pieces are cut by
 * `npm run lpc` and `npm run tiles`, both of which refuse a piece that names no
 * author — but both need the source sheets on the machine, so neither has ever
 * run in CI. Nothing checked the attribution in a build.
 *
 * This does, out of what is in the repository: the generated credit files, the
 * generated prop table, and the summary the game puts on a screen. It cannot
 * see the sheets, so it cannot know whether a name is the right name; what it
 * can prove is that nothing is drawn that nobody is credited for, that nothing
 * is credited that is not drawn, and that the screen says what the files say.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

let failures = 0
const expect = (label: string, ok: boolean, detail = ''): void => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok || !detail ? '' : `  -> ${detail}`}`)
}

// --- the sprite set, one line a layer ---------------------------------------

const SPRITES = 'art/LPC-CREDITS.md'
const sprite = read(SPRITES)
const spriteLines = [...sprite.matchAll(/^- `(.+?)` — (.+) \(([^()]*)\)$/gm)].map((m) => ({
  part: m[1]!,
  authors: m[2]!.split(',').map((n) => n.trim()).filter(Boolean),
  licences: m[3]!.split(',').map((n) => n.trim()).filter(Boolean),
}))
expect(`${SPRITES} lists ${spriteLines.length} layers`, spriteLines.length > 20, `${spriteLines.length}`)
expect(
  'and every one of them names an author',
  spriteLines.every((l) => l.authors.length > 0),
  spriteLines.filter((l) => l.authors.length === 0).map((l) => l.part).join(', '),
)
expect(
  'and a licence',
  spriteLines.every((l) => l.licences.length > 0),
  spriteLines.filter((l) => l.licences.length === 0).map((l) => l.part).join(', '),
)

/**
 * A name nobody can be credited by.
 *
 * The tilesets ship a `MISSING:` section — pieces whose author was never
 * recorded — and the sheet definitions carry the same hole in a smaller form:
 * an author field reading `??`. A CC-BY piece with an unknown author is a piece
 * whose licence cannot be complied with, so it may not be in the build, and a
 * credit line that admits it is the cheapest possible way to notice.
 */
const NAMELESS = /^(\?+|unknown|anonymous|n\/a|-+)$/i
const anonymous = spriteLines.filter((l) => l.authors.some((a) => NAMELESS.test(a)))
expect(
  'and nobody is credited as nobody',
  anonymous.length === 0,
  anonymous.map((l) => `${l.part}: ${l.authors.join(', ')}`).join('; '),
)

// --- the tilesets, one block an author, listing what they drew ---------------

const TERRAIN = 'art/LPC-TERRAIN-CREDITS.md'
const terrain = read(TERRAIN)
const blocks = [...terrain.matchAll(/^- \*\*(.+?)\*\* — (.+?)\n\s+<(.+?)>\n\s+(.+)$/gm)].map((m) => ({
  author: m[1]!,
  licences: m[2]!.split('/').map((n) => n.trim()).filter(Boolean),
  url: m[3]!,
  pieces: m[4]!.split(',').map((n) => n.trim()).filter(Boolean),
}))
expect(`${TERRAIN} names ${blocks.length} author(s)`, blocks.length > 0)
expect(
  'and each of them has a licence and a piece',
  blocks.every((b) => b.licences.length > 0 && b.pieces.length > 0),
  blocks.filter((b) => !b.licences.length || !b.pieces.length).map((b) => b.author).join(', '),
)
expect(
  'and none of them is nobody',
  blocks.every((b) => !NAMELESS.test(b.author)),
  blocks.filter((b) => NAMELESS.test(b.author)).map((b) => b.author).join(', '),
)

// The binding that only exists in the repository: what the renderer draws
// against what somebody is credited for. Both directions -- a prop with no
// credit is a licence the build breaks, and a credit with no prop is a claim
// about art that is not there.
const drawn = new Set(Object.keys(PROPS))
const credited = new Set(blocks.flatMap((b) => b.pieces))
const uncredited = [...drawn].filter((id) => !credited.has(id))
const unused = [...credited].filter((id) => !drawn.has(id))
expect(`${drawn.size} props are drawn and every one is credited`, uncredited.length === 0, uncredited.join(', '))
expect('and nothing is credited that is not drawn', unused.length === 0, unused.join(', '))

// --- and the screen says what the files say ----------------------------------

const summary = [
  { file: SPRITES, authors: new Set(spriteLines.flatMap((l) => l.authors)), licences: new Set(spriteLines.flatMap((l) => l.licences)) },
  { file: TERRAIN, authors: new Set(blocks.map((b) => b.author)), licences: new Set(blocks.flatMap((b) => b.licences)) },
]
for (const want of summary) {
  const set = ART.find((entry) => entry.file === want.file)
  if (!set) {
    expect(`the credits screen carries ${want.file}`, false, 'no entry for it in src/credits.ts')
    continue
  }
  const missingNames = [...want.authors].filter((a) => !set.authors.includes(a))
  const extraNames = set.authors.filter((a) => !want.authors.has(a))
  expect(
    `the credits screen names all ${want.authors.size} of ${want.file}`,
    missingNames.length === 0 && extraNames.length === 0,
    [...missingNames.map((n) => `missing ${n}`), ...extraNames.map((n) => `extra ${n}`)].join('; '),
  )
  const missingLicences = [...want.licences].filter((l) => !set.licences.includes(l))
  const extraLicences = set.licences.filter((l) => !want.licences.has(l))
  expect(
    `and every licence ${want.file} is under`,
    missingLicences.length === 0 && extraLicences.length === 0,
    [...missingLicences.map((l) => `missing ${l}`), ...extraLicences.map((l) => `extra ${l}`)].join('; '),
  )
  expect(`and points at ${want.file} for the piece-by-piece list`, set.file === want.file)
}

// --- the icons, one entry an ability ------------------------------------------

// The icon set used to be credited only in README and a comment, which is to
// say not in the build. The screen now carries it, and this is what keeps the
// screen honest about it: every author `art/icons.json` names, and nobody else.
const ICONS = 'art/icons.json'
const icons = Object.values(JSON.parse(read(ICONS)) as Record<string, { icon: string; author: string }>)
expect(`${ICONS} lists ${icons.length} icons and every one names an author`, icons.length > 0 && icons.every((i) => i.author && !NAMELESS.test(i.author)))
const iconSet = ART.find((entry) => entry.file === ICONS)
if (!iconSet) {
  expect(`the credits screen carries ${ICONS}`, false, 'no entry for it in src/credits.ts')
} else {
  const want = new Set(icons.map((i) => i.author))
  const missing = [...want].filter((a) => !iconSet.authors.includes(a))
  const extra = iconSet.authors.filter((a) => !want.has(a))
  expect(
    `the credits screen names all ${want.size} icon authors`,
    missing.length === 0 && extra.length === 0,
    [...missing.map((n) => `missing ${n}`), ...extra.map((n) => `extra ${n}`)].join('; '),
  )
  expect('and says CC-BY 3.0 for them', iconSet.licences.join() === 'CC-BY 3.0', iconSet.licences.join(', '))
  // README carries the same sentence the licence asks for; it is the one place
  // a person reading the repository sees it, so it may not fall behind either.
  const quoted = read('README.md').match(/> Icons made by ([^\n]+(?:\n> [^\n]+)*?)\.\n/)
  const named = quoted ? quoted[1]!.replace(/\n> /g, ' ').replace(/ and /g, ', ').split(',').map((n) => n.trim()).filter(Boolean) : []
  expect(
    'and README\'s attribution line names the same people',
    named.length === want.size && named.every((n) => want.has(n)),
    named.join(', '),
  )
}

// A piece-by-piece list is only a list if it opens. The screen is read off the
// deployed site, where a path into the repository is a 404.
for (const set of ART) {
  const url = listUrl(set)
  expect(
    `${set.set}: ${url ? 'the list is a link that opens from the build' : 'CC0, asks for no list'}`,
    url === null ? set.licences.every((l) => l === 'CC0') : /^https:\/\//.test(url),
    url ?? set.licences.join(', '),
  )
}

// --- and the licence file says what the screen says --------------------------

// `LICENSE` is MIT and covers the code; `art/LICENSE.md` is what keeps a reader
// from taking MIT to cover the art too. A set the screen credits that the file
// does not, or under different terms, is the file lying about what it covers.
const LICENCES = 'art/LICENSE.md'
const rows = [...read(LICENCES).matchAll(/^\| \[(.+?)\]\((.+?)\) \| .+? \| (.+?) \| .+? \| (.+?) \|$/gm)].map((m) => ({
  set: m[1]!,
  url: m[2]!,
  licences: m[3]!.split(',').map((l) => l.trim()),
  list: m[4]!.match(/\]\((.+?)\)/)?.[1] ?? null,
}))
expect(`${LICENCES} has a row for each of the ${ART.length} sets on the screen`, rows.length === ART.length, rows.map((r) => r.set).join(', '))
for (const set of ART) {
  const row = rows.find((r) => r.set === set.set)
  expect(
    `${LICENCES}: ${set.set} under the same licences, at the same url, with the same list`,
    !!row &&
      row.url === set.url &&
      row.licences.join() === set.licences.join() &&
      row.list === (set.file ? set.file.replace(/^art\//, '') : null),
    row ? `${row.url} ${row.licences.join(', ')} ${row.list}` : 'no row',
  )
}

// --- and no shipped atlas has drifted past the canvas budget -----------------

/**
 * The long side of a WebP's canvas, read off the VP8X extended-format header
 * rather than decoded -- this repo has no image library, and the header is
 * eleven fixed bytes. `lpc.webp` sat at 5247px, 1151 over the 4096 budget TD
 * sets for canvases (atlases included, per `teams/abyss/art-director.md`'s
 * own "atlas size" coordination with TD), for an unknown amount of time
 * before anyone measured it by hand (abyss#311) -- nothing in `npm run check`
 * had ever looked.
 */
function webpLongSide(path: string): number {
  const buf = readFileSync(path)
  if (buf.toString('ascii', 12, 16) !== 'VP8X') return 0 // simple/lossless format, not an atlas this repo builds
  const width = buf.readUIntLE(24, 3) + 1
  const height = buf.readUIntLE(27, 3) + 1
  return Math.max(width, height)
}

const ATLAS_BUDGET = 4096

// Already over budget on the day this check went in, untested on real
// hardware (abyss#311 asks for that test). Held rather than failed so this
// check does not block unrelated work on a pre-existing number -- lowered
// when the atlas is repacked, removed once it clears ATLAS_BUDGET on its
// own, and never raised.
const OVER_BUDGET: Record<string, number> = {
  'lpc.webp': 5247,
}

const ART_DIR = resolve(process.cwd(), 'public/art')
for (const name of readdirSync(ART_DIR).filter((f) => f.endsWith('.webp'))) {
  const long = webpLongSide(join(ART_DIR, name))
  const held = OVER_BUDGET[name]
  if (held === undefined) {
    expect(`art/${name}: long side (${long}px) is within the ${ATLAS_BUDGET}px canvas budget`, long <= ATLAS_BUDGET, `${long}px`)
  } else if (long <= ATLAS_BUDGET) {
    expect(`art/${name}: back within the ${ATLAS_BUDGET}px budget now -- take it off OVER_BUDGET`, false, `${long}px, held at ${held}px`)
  } else {
    expect(`art/${name}: no further over the ${ATLAS_BUDGET}px budget than the ${held}px it was held at`, long <= held, `${long}px`)
  }
}

if (failures > 0) {
  console.error(`artcheck: ${failures} check(s) failed`)
  process.exit(1)
}
console.log(`artcheck: ${drawn.size} props, ${spriteLines.length} layers, everything drawn is credited`)

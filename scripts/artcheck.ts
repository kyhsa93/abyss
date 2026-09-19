import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PROPS } from '../src/render/props'
import { ART } from '../src/credits'

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

if (failures > 0) {
  console.error(`artcheck: ${failures} check(s) failed`)
  process.exit(1)
}
console.log(`artcheck: ${drawn.size} props, ${spriteLines.length} layers, everything drawn is credited`)

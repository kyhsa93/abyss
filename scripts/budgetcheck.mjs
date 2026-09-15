/**
 * The performance budget, as a check rather than as a wiki page.
 *
 * "A budget is a check, not a document.  CI goes red."  Nothing was being
 * measured, so the one line of it that had already been overrun — the data
 * budget, written when the terrain was twelve tiles and now the whole of
 * Elwynn — had been overrun silently for rounds.
 *
 * What a visitor actually downloads is what is measured: the page, the script,
 * and **one** world.  `dist` carries two — the client's terrain and the
 * synthesised one — and that is deliberate, because the deployed page falls
 * back when a client bake is missing; it is counted separately so the fact
 * stays visible rather than becoming an excuse.
 */
import { gzipSync } from 'node:zlib'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const KB = 1024, MB = 1024 * 1024
let bad = 0
/**
 * Every line of the budget, as it is measured.
 *
 * Collected rather than only printed, because issue 207's complaint was not
 * that nothing was measured — this file has measured since it was written —
 * but that **the document was behind the harness**: the wiki opened with
 * *"every number above is a draft, not one of them is measured"* while CI was
 * already going red on four of them.
 *
 * So the document is written from here.  `npm run budgetcheck -- --write`
 * rewrites `docs/budget.md`, and a plain run fails when the file on disk is
 * not what it would write — the same bargain `manifestcheck` makes with the
 * baked world.  One list, and a document that cannot fall behind it.
 */
const rows = []
const check = (what, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}   -> ${detail}`)
  if (!ok) bad++
}
/** A measured line: what it is, what it came to, what it may not pass. */
const budget = (what, got, limit, unit, note) => {
  rows.push({ what, got, limit, unit, note })
  return got <= limit
}
const shown = (v, unit) => unit === 'MB' ? `${(v / MB).toFixed(2)} MB`
  : unit === 'KB' ? `${(v / KB).toFixed(0)} KB` : `${v}`

const gz = (path) => gzipSync(readFileSync(path)).length
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const dist = 'dist'
try { statSync(dist) } catch {
  console.log('no dist — run `npm run build` first')
  process.exit(1)
}
const files = walk(dist)

// The script, gzipped, which is what the browser is handed.
const js = files.filter((f) => f.endsWith('.js') && !f.endsWith('sw.js'))
const jsBytes = js.reduce((n, f) => n + gz(f), 0)
check('the script fits in the budget',
  budget('the script a browser is handed', jsBytes, 500 * KB, 'KB',
    'gzipped; `dist` less the service worker'),
  `${(jsBytes / KB).toFixed(0)} KB gzipped of 500`)

// One world.  The client's terrain if it is there, and everything that is not
// terrain — the spawns, the quests, the items, the objects — on top.
const shared = files.filter((f) => f.includes(`${join('public', 'world')}`)
  || (f.includes('world') && !f.includes('terrain')))
const oneWorld = files.filter((f) => /world[\\/](?!terrain)/.test(f))
const terrain = files.filter((f) => /data[\\/]terrain/.test(f))
const fallback = files.filter((f) => /world[\\/]terrain/.test(f))
const need = [...oneWorld, ...(terrain.length ? terrain : fallback)]
const dataBytes = need.reduce((n, f) => n + gz(f), 0)
check('and so does the world a visitor downloads',
  budget('the world a first visit downloads', dataBytes, 4 * MB, 'MB',
    'gzipped; one world — the client\'s terrain plus everything that is not '
    + 'terrain'),
  `${(dataBytes / MB).toFixed(2)} MB gzipped of 4 — `
  + `${need.length} files, the terrain being ${(terrain.length ? terrain : fallback)
    .reduce((n, f) => n + gz(f), 0) / MB > 0 ? ((terrain.length ? terrain : fallback)
      .reduce((n, f) => n + gz(f), 0) / MB).toFixed(2) : 0} MB of it`)

// And the second world, which is carried and not downloaded.  Counted so the
// fact stays visible: the page fetches one, `dist` ships both, and the reason
// is that a deploy with no client bake still has a world to fall back to.
const spare = fallback.length && terrain.length
  ? fallback.reduce((n, f) => n + gz(f), 0) : 0
console.log(`      (a second terrain rides along at ${(spare / MB).toFixed(2)} MB `
  + `gzipped — the synthesised world, which the page uses only when there is `
  + `no client bake)`)

// What the deploy carries, which is not what a visit downloads.
//
// The issue that asked for this counted `public` at 25.7 MB and the page said
// every number was a draft.  Both halves matter and they are different
// numbers: a visitor fetches one world and the sheets the scene opens, and the
// deploy carries every sheet, both worlds and every icon.  A budget that only
// watched the first would let the second grow until a deploy stopped fitting.
// Less the service worker, the same as the script above: it is written only
// when `vite.config.ts` sees `GITHUB_ACTIONS`, so counting it made CI's total
// a hundredth of a megabyte bigger than any build at a desk and the document
// could never say both.
const carried = files.filter((f) => !f.endsWith('sw.js'))
  .reduce((n, f) => n + statSync(f).size, 0)
check('and the whole deploy fits in what a Pages site may be',
  budget('everything the deploy carries', carried, 200 * MB, 'MB',
    'on disk, not gzipped, and every file — both worlds, all 157 sheets, '
    + 'every icon.  A Pages site may be a gigabyte; two hundred megabytes is '
    + 'where this repository would start thinking about `git lfs` again'),
  `${(carried / MB).toFixed(1)} MB on disk of 200`)

// The sounds, which were eight files nobody had weighed and are now eight
// files somebody has listened to.
//
// The ceiling is where the **music** decision lives, and that decision is the
// reason there is room to spare: the Superpowers collection ships 41 themes
// and one medieval one is **1.5 MB**, against a first visit that costs 3.37 MB
// altogether (the row above, as written to `docs/budget.md`; this comment said
// 1.57 until the ground blend doubled it).  A single loop adds nearly half again
// to what it costs to open this game, and the worker precaches what it ships —
// so an offline install would
// pay for it too.  Music goes in when this game has more than one place to be,
// streamed and out of the precache, and not before.  See `art/SOUND-CREDITS.md`
// for the eight and the wiki page 소리 for the argument.
const heard = files.filter((f) => f.endsWith('.wav') || f.endsWith('.ogg'))
check('and the sounds are a rounding error',
  budget('the sounds', heard.reduce((n, f) => n + statSync(f).size, 0),
    2 * MB, 'KB', `${heard.length} files, on disk, mono at 22,050 Hz and `
    + 'levelled to within a decibel of each other.  The headroom is not '
    + 'spare: one music track from the same collection is 1.5 MB'),
  `${(heard.reduce((n, f) => n + statSync(f).size, 0) / KB).toFixed(0)} KB `
  + `over ${heard.length} files of 2,048`)

/**
 * The sheets, by what they cost once decoded — which is not what they cost on
 * the wire.  A transparent pixel is free in a PNG and full price in memory, so
 * this is width times height times four, and a sheet that is mostly air is the
 * one that catches people out.
 *
 * **Only the ones the page actually opens.**  `dist` carries 119 images and
 * the scene loads three of them; the other 116 are the paperdoll layers, which
 * nothing has called yet (issue 82) and which would be composed one at a time
 * rather than held.  Counting all of them measures the repository rather than
 * the game.
 */
const size = (f) => {
  const b = readFileSync(f)
  // PNG: width and height are the first two big-endian words of IHDR.
  return (b.length > 24 && b.readUInt32BE(12) === 0x49484452)
    ? b.readUInt32BE(16) * b.readUInt32BE(20) : 0
}
const opened = readdirSync('src')
  .filter((f) => f.endsWith('.ts'))
  .flatMap((f) => [...readFileSync(join('src', f), 'utf8')
    .matchAll(/'\.\/(art\/[\w./-]+\.png)'/g)].map((m) => m[1]))
const loaded = [...new Set(opened)].map((rel) => join(dist, rel))
  .filter((f) => { try { statSync(f); return true } catch { return false } })
/**
 * And the one sheet whose name is not written anywhere in `src/`.
 *
 * `art/arms/<weapon>.png` is fetched by what he is holding, so the regex above
 * cannot see it — and a sheet that a check cannot see is a sheet that does not
 * count, which is how a budget stops being a budget.  Five files, one held at
 * a time, so what this pays is the heaviest of the five: the greatsword, whose
 * swing is the widest thing in the set.  `hero.json` carries the figure so the
 * sum is the bake's and not a second measurement of the same PNG.
 */
let inHand = 0, inHandName = ''
/**
 * And what he chose to look like, which is the same shape again.
 *
 * Twelve hairstyles and four beards under `art/look/`, one of each worn, so
 * what this pays is the heaviest of each kind.  All sixty-three of LPC's
 * styles would be nineteen megabytes against a budget of twenty-four for the
 * whole game, which is why there are twelve.
 *
 * And what he is wearing over his chest, which lives beside them for the
 * same reason and is two kinds rather than one: a `shirt`, and the `chest`
 * piece over it.  Both are worn at once, so both are paid — the heaviest of
 * each.  The breastplate that used to be composited into `hero.png` cost
 * nothing extra because it was in every frame; as an overlay it costs a sheet,
 * and this is the line that says how much.
 */
const worn = {}
try {
  const meta = JSON.parse(readFileSync(join(dist, 'art/hero.json'), 'utf8'))
  for (const [word, sheet] of Object.entries(meta.arms ?? {})) {
    if (sheet.px > inHand) { inHand = sheet.px; inHandName = word }
  }
  for (const [key, look] of Object.entries(meta.looks ?? {})) {
    const kind = look.kind ?? 'look'
    if (!worn[kind] || look.px > worn[kind].px) worn[kind] = { key, px: look.px }
  }
} catch { /* a bake without a hero sheet has no hand to fill */ }
const onHim = Object.values(worn).reduce((n, v) => n + v.px, 0)
const pixels = loaded.reduce((n, f) => n + size(f), 0) + (inHand + onHim) / 4
const all = files.filter((f) => f.endsWith('.png'))
// The phone's own column, which this budget did not have.
//
// Every figure above is a desktop's.  What a phone actually pays is a first
// visit over cellular — the world, gzipped — and the decoded sheets, on a
// device whose headroom is nowhere near 64 MB.  The canvas is the one place
// it is *ahead*: 390 x 844 is a third of 1280 x 800, because the canvas is
// sized in CSS pixels on purpose.
//
// Twenty-four rather than sixty-four, and the number is a ratchet rather than
// a device limit — nobody here can measure what a given phone will spare, and
// a bar invented to sound strict is a bar that gets raised the first time it
// fires.  This one is the three sheets as they stand (17.0 MB) plus room for
// one more, so what it actually guards is the atlas quietly doubling: a
// transparent pixel is free in a PNG and full price in memory, and this
// repository has already been caught by that once.
check('and the sheets do not creep',
  budget('the sheets the scene opens, decoded', pixels * 4, 24 * MB, 'MB',
    '`width × height × 4`, not the file size — a transparent pixel is free in '
    + 'a PNG and full price in memory.  A ratchet rather than a device limit'),
  `${(pixels * 4 / MB).toFixed(1)} MB of 24 — a phone's headroom is not `
  + `a desktop's, and the ratchet is what stops the atlas doubling`)
console.log(`      (of which ${(inHand / MB).toFixed(2)} MB is whatever is in `
  + `his hand — five sheets, one held, the heaviest being ${inHandName}; and `
  + `${(onHim / MB).toFixed(2)} MB is what he looks like — `
  + Object.entries(worn).map(([k, v]) =>
    `${k} ${v.key.replace(/^[a-z]+-/, '')} ${(v.px / MB).toFixed(2)}`).join(', ')
  + ')')
check('the sheets fit in memory once decoded',
  budget('and against the desktop ceiling', pixels * 4, 64 * MB, 'MB',
    'the same pixels against the figure the budget page has always carried'),
  `${((pixels * 4) / MB).toFixed(1)} MB of 64 over the ${loaded.length} the `
  + `scene opens (of ${all.length} shipped, `
  + `${((all.reduce((n, f) => n + size(f), 0) * 4) / MB).toFixed(0)} MB if all `
  + `were held at once)`)

// --- and the buildings, which are the row issue 218 asked for ------------
//
// It weighed nineteen per-model bitmaps at the ground's own 24 pixels a yard
// and came to **145 MB**, the abbey 19.3 of it — and proposed three ways to
// cut that down: draw the parts separately, drop the scale on the big ones,
// hold only what is on screen.
//
// None of them is needed, because a building here is not a picture of a
// building.  Since issue 216 it is **a mask and a tileset**: the footprint,
// which the plans have always carried and which ships inside the world
// already counted above, and a roof laid over it as a repeating 32-pixel
// picture under the model's own transform.  So the abbey costs what a cottage
// costs.  A per-model sheet was also what made the transparency argument bite
// — a building turned 45 degrees is half empty in its own rectangle — and in
// the model's own axes there is no diagonal to store.
//
// What is weighed here is the alternative that was rejected, against the
// footprints that were chosen, because a decision with no number under it goes
// back to being an opinion the next time somebody wants a sprite.
{
  const t = JSON.parse(readFileSync('public/data/terrain.json', 'utf8'))
  const stood = new Set((t.doodads ?? []).filter((o) => o.p).map((o) => o.p))
  let masks = 0, sheets = 0
  for (const [key, p] of Object.entries(t.plans ?? {})) {
    const [w, h, cell] = p
    // Five masks a storey — outline, stone, floor, roofed, stairs — at one bit
    // a cell, which is what a browser holds once it has unpacked them.
    masks += 5 * Math.ceil((w * h) / 8)
    if (stood.has(Number(key))) sheets += w * h * (cell * 24) ** 2 * 4
  }
  check('a building is a mask and a tileset, not a picture of itself',
    budget('the buildings, decoded', masks, 4 * MB, 'MB',
      'every footprint the world ships, unpacked to one bit a cell — five '
      + 'masks a storey.  The rejected alternative, one bitmap a model at the '
      + `ground's own 24 pixels a yard, is ${(sheets / MB).toFixed(0)} MB`),
    `${(masks / MB).toFixed(2)} MB of footprint against `
    + `${(sheets / MB).toFixed(0)} MB for one sheet a model`)
}

// --- and a save, which the document had no row for ------------------------
//
// Issues 106 and 206.  The save's budget — four kilobytes a character, forty
// for every slot — lived in the wiki and in `uicheck`, which weighs the save a
// live session writes, and not here, so the one document a check writes said
// nothing about it.  What is weighed is the largest realistic save: the newest
// sample in `scripts/fixtures/saves/`, a finished character built out of the
// world's own ids (`simcheck` holds it to what `restore` reads), with every
// errand in the world marked done — the same thing `uicheck` does to the save
// it gets, and the one part of a save that grows with the world rather than
// with the character.  JSON in UTF-8, because that is a thing a script can
// count; what IndexedDB's own clone costs on disk is not a number a page can
// ask for.
{
  const DIR = 'scripts/fixtures/saves'
  const newest = readdirSync(DIR).filter((f) => /^v\d+\.json$/.test(f))
    .sort((a, b) => Number(a.slice(1, -5)) - Number(b.slice(1, -5))).at(-1)
  const save = JSON.parse(readFileSync(join(DIR, newest), 'utf8'))
  const errands = JSON.parse(readFileSync(join(dist, 'world', 'quests.json'),
    'utf8')).quests ?? []
  save.quests = { held: [], done: errands.map((q) => q.id) }
  const bytes = Buffer.byteLength(JSON.stringify(save))
  // `MAX_CHARACTERS_PER_REALM`, as `layout.py` reads it out of the client.
  const slots = JSON.parse(readFileSync(join(dist, 'world', 'layout.json'),
    'utf8')).spec?.pick?.slots ?? 1
  check('a finished character is a save of four kilobytes or less',
    budget('a save, a character who has finished this game', bytes, 4 * KB,
      'KB', `JSON in UTF-8 — the newest sample in \`${DIR}/\`, level `
      + `${save.you.level}, with all ${errands.length} of the world's errands done`),
    `${bytes} bytes of 4,096 (${newest}, ${errands.length} errands done)`)
  check('and all the slots there are in forty',
    budget('and every slot holding one', bytes * slots, 40 * KB, 'KB',
      `${slots} slots, the client's \`MAX_CHARACTERS_PER_REALM\``),
    `${slots} x ${bytes} = ${bytes * slots} of 40,960`)
}

/**
 * And the document, written from the rows above rather than beside them.
 *
 * `--write` rewrites it; a plain run fails when what is on disk is not what
 * this would write.  The wiki keeps the *decisions* — why twenty-four and not
 * sixty-four, why one world and not two — and points here for the numbers,
 * because a number in two places is a number that goes stale in one of them.
 */
const DOC = 'docs/budget.md'
const table = [
  '# The performance budget, measured',
  '',
  '**Written by `npm run budgetcheck -- --write`.  Do not edit by hand** — a',
  'plain `npm run budgetcheck` fails when this file says something other than',
  'what the check would write: every word exactly, and every measured number to',
  'within its last shown digit, so a rounding step between two builds is not a',
  'failure and a real drift is.',
  '',
  'The wiki page [성능 예산] keeps the *decisions* — why the decoded-sheet',
  'ratchet is twenty-four and not sixty-four, why one world is counted and not',
  'two — and points here for the numbers.  A number written in two places is a',
  'number that goes stale in one of them, which is what issue 207 found: the',
  'page opened with *"every number above is a draft"* while this check had been',
  'going red on four of them for rounds.',
  '',
  '| what | measured | budget |',
  '| --- | ---: | ---: |',
  ...rows.map((r) => `| ${r.what} | ${shown(r.got, r.unit)} | `
    + `${shown(r.limit, r.unit)} |`),
  '',
  ...rows.flatMap((r) => [`* **${r.what}** — ${r.note}.`]),
  '',
]
const want = table.join('\n')
if (process.argv.includes('--write')) {
  writeFileSync(DOC, want)
  console.log(`wrote ${DOC}`)
} else {
  // **The words exactly, the numbers to their last digit.**  This compared
  // the whole file as text, so it failed whenever a number crossed a rounding
  // step: the base path CI builds with moves the script by a few hundred bytes,
  // and a commit that added a kilobyte of code turned CI red until somebody
  // ran `--write` — which is what happened on f5f7bbf and again on 613ec35,
  // each time on a document that was right to the megabyte.  A number is
  // allowed one step of its own last digit either way; anything more, a row
  // that is new or gone, or a word that changed, still fails.
  let had = null
  try { had = readFileSync(DOC, 'utf8') } catch { /* not written yet */ }
  const cells = (text) => new Map((text ?? '').split('\n')
    .map((line) => line.match(/^\| (.+?) \| ([\d.]+) (MB|KB) \| /))
    .filter(Boolean).map((m) => [m[1], [Number(m[2]), m[3]]]))
  const words = (text) => (text ?? '')
    .replace(/^(\| .+? \| )[\d.]+ (MB|KB)( \| )/gm, '$1# $2$3')
  const then = cells(had)
  const drift = rows.filter((r) => {
    const was = then.get(r.what)
    const now = Number(shown(r.got, r.unit).split(' ')[0])
    const step = r.unit === 'MB' ? 0.01 : 1
    return !was || was[1] !== r.unit || Math.abs(was[0] - now) > step + 1e-9
  })
  const same = had !== null && words(had) === words(want) && drift.length === 0
  check('and the budget document says what was just measured', same,
    same ? `${DOC}, ${rows.length} lines, every one of them within a digit of `
      + 'this run'
      : had === null
        ? `${DOC} is not there — run \`npm run budgetcheck -- --write\``
        : (drift.length
          ? `${drift.map((r) => `${r.what}: ${then.get(r.what)?.[0] ?? 'missing'} `
            + `on disk, ${shown(r.got, r.unit)} now`).join('; ')}`
          : 'the words on disk are not what this run would write')
          + '; run `npm run budgetcheck -- --write`')
}

console.log(bad ? `${bad} FAILED` : 'all checks passed')
process.exit(bad ? 1 : 0)

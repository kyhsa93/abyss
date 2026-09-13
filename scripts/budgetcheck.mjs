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
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const KB = 1024, MB = 1024 * 1024
let bad = 0
const check = (what, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}   -> ${detail}`)
  if (!ok) bad++
}

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
check('the script fits in the budget', jsBytes <= 500 * KB,
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
check('and so does the world a visitor downloads', dataBytes <= 4 * MB,
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
try {
  const meta = JSON.parse(readFileSync(join(dist, 'art/hero.json'), 'utf8'))
  for (const [word, sheet] of Object.entries(meta.arms ?? {})) {
    if (sheet.px > inHand) { inHand = sheet.px; inHandName = word }
  }
} catch { /* a bake without a hero sheet has no hand to fill */ }
const pixels = loaded.reduce((n, f) => n + size(f), 0) + inHand / 4
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
check('and the sheets do not creep', pixels * 4 <= 24 * MB,
  `${(pixels * 4 / MB).toFixed(1)} MB of 24 — a phone's headroom is not `
  + `a desktop's, and the ratchet is what stops the atlas doubling`)
console.log(`      (of which ${(inHand / MB).toFixed(2)} MB is whatever is in `
  + `his hand — five sheets, one held, the heaviest being ${inHandName})`)
check('the sheets fit in memory once decoded', pixels * 4 <= 64 * MB,
  `${((pixels * 4) / MB).toFixed(1)} MB of 64 over the ${loaded.length} the `
  + `scene opens (of ${all.length} shipped, `
  + `${((all.reduce((n, f) => n + size(f), 0) * 4) / MB).toFixed(0)} MB if all `
  + `were held at once)`)

console.log(bad ? `${bad} FAILED` : 'all checks passed')
process.exit(bad ? 1 : 0)

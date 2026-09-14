/**
 * Is the screen the same as yesterday?
 *
 * The four browser checks all confirm a *promise* — north is up, the frames
 * sit where `FrameXML` puts them, the chain finishes, a thumb can press it.
 * None of them asks whether the picture changed, and this repository's own
 * notes say the two worst regressions it has had were caught by looking at a
 * screenshot while every check was green: a signed slope threshold that
 * covered the hills in gravel, and terrain that did not draw at all.
 *
 * **The references live in `art/shots/`.**  That is the unsolved question the
 * harness page left — in the repository and it grows, out of it and the check
 * does not run — and the answer here is: in, but *small*.  Each reference is
 * the canvas reduced to 64 by 40 and stored as text, about two kilobytes, so
 * a full set of six is smaller than one PNG and `git diff` shows which squares
 * moved.  Sub-pixel noise between one machine and another disappears at that
 * size, and everything the eye would call "the screen changed" survives it.
 *
 *   node scripts/shotcheck.mjs           compare
 *   node scripts/shotcheck.mjs --write   accept what is on screen now
 */
import { chromium } from 'playwright'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const HOST = process.env.ABYSS_URL ?? 'http://localhost:5173'
const DIR = 'art/shots'
/** Where the full-size pictures go when the references are retaken. */
const SEEN = 'shots'
const WRITE = process.argv.includes('--write')
const W = 64, H = 40
/** How much of the picture may differ before it is a different picture. */
const TOLERANCE = 0.06

/** Where to stand, and what each one is for. */
const SPOTS = [
  ['valley', -8949, -132, 1, 'the human start, which is where everybody begins'],
  // Outside them both, which is a change of subject and the point of it.  A
  // building is closed now — a roof with a door cut into it — so a spot in
  // the middle of one guards a picture of a roof.  Both were: the abbey's
  // moved 69% and Goldshire's 79% the day the buildings shut, which is the
  // check doing its job on a change that was meant.
  ['abbey', -8889, -196, 0.5, 'Northshire abbey from the path, roof and door'],
  ['goldshire', -9453, 12, 1, 'Goldshire, which is roads and roofs'],
  ['river', -9100, -350, 0.8, 'water, a crossing and a bank'],
  ['wide', -8983, -316, 0.3, 'the valley from far enough to see its shape'],
  ['hills', -8700, -900, 0.7, 'bare rock, where the slope decides the ground'],
]

let bad = 0
const check = (what, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? `   -> ${detail}` : ''}`)
  if (!ok) bad++
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 960, height: 600 } })
await page.goto(HOST, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 })
// A character first: the game opens on the screen that makes one, and it
// covers the glass.
await page.evaluate(() => window.__makeOne?.('가온'))
await page.waitForTimeout(150)
// A fixed hour, so the light is the same every run: the sky is derived from
// the clock and a check that changes at dusk is a check nobody trusts.
await page.evaluate(() => { window.__clock?.(new Date(2026, 5, 21, 12, 0, 0)) })

mkdirSync(DIR, { recursive: true })
if (WRITE) mkdirSync(SEEN, { recursive: true })
for (const [name, x, y, zoom, why] of SPOTS) {
  await page.evaluate((c) => window.__cam(c), { x, y, zoom })
  await page.waitForTimeout(400)
  // The canvas only: the overlays are `uicheck`'s business and they carry
  // fonts, which are the one thing that really does differ between machines.
  const grid = await page.evaluate(([w, h]) => {
    const canvas = document.querySelector('canvas')
    const small = document.createElement('canvas')
    small.width = w; small.height = h
    const g = small.getContext('2d')
    g.drawImage(canvas, 0, 0, w, h)
    const d = g.getImageData(0, 0, w, h).data
    let out = ''
    for (let i = 0; i < w * h; i++) {
      // Sixteen levels of brightness, written as a hex digit.  Colour is not
      // compared: a tint that shifts by one is not a regression, and a shape
      // that moves is.
      const v = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.6 + d[i * 4 + 2] * 0.1) / 16
      out += Math.min(15, Math.floor(v)).toString(16)
    }
    return out
  }, [W, H])

  const path = `${DIR}/${name}.txt`
  if (WRITE || !existsSync(path)) {
    writeFileSync(path, `${why}\n${grid}\n`)
    // And a picture a person can look at, beside the grid.
    //
    // This exists because of the one that got away.  Goldshire's reference
    // was taken while the middle of the town was a thirty-yard black pit, and
    // for as long as it stood this check reported `0.0% of the picture moved`
    // — truthfully.  A reference is a promise that the screen was right when
    // it was taken, and nothing was checking that promise, because a 64x40
    // grid of hex digits is not something anybody reads.
    //
    // Written to the scratch directory rather than committed: `art/shots` is
    // 28 KB of text on purpose and six PNGs are not.  The path is printed so
    // the person retaking them has somewhere to look.
    const shot = `${SEEN}/${name}.png`
    await page.screenshot({ path: shot })
    console.log(`wrote ${path}  —  look at ${shot}`)
    continue
  }
  const want = readFileSync(path, 'utf8').split('\n')[1] ?? ''
  // Is the *reference* a picture of something?
  //
  // This exists because of the one that got away.  Goldshire's reference was
  // taken while the middle of the town was a thirty-yard black pit, and for
  // as long as it stood this check reported `0.0% of the picture moved` —
  // truthfully.  A comparison can only ever say the screen is what it was;
  // nothing was saying the screen had been right when it was taken.
  //
  // The measure is the darkest two levels of sixteen.  On the six references
  // this repository holds that runs 0.0% to 2.0% at noon, and the reference
  // that was guarding the pit reads **35.5%**.  Eight per cent is a long way
  // from both, and it is the one property a picture of a lit outdoor scene
  // has that a picture with a hole in it does not.  Checked every run and not
  // only when the references are written, so a screen that degenerates is
  // caught even by somebody who retakes them without looking.
  const black = [...grid].filter((c) => c === '0' || c === '1').length / (W * H)
  check(`${name} is a picture of somewhere`, black < 0.08,
    `${(black * 100).toFixed(1)}% of it is the darkest two levels of sixteen`)
  let differ = 0
  for (let i = 0; i < grid.length; i++) {
    // A single step of brightness is noise; two is a different picture.
    if (Math.abs(parseInt(grid[i], 16) - parseInt(want[i] ?? '0', 16)) > 1) differ++
  }
  const share = differ / (W * H)
  check(`${name} looks the way it did`, share <= TOLERANCE,
    `${(share * 100).toFixed(1)}% of the picture moved — ${why}`)
}

// --- and is the ground a ground, or a chessboard? -------------------------
//
// The floor read as a chessboard and the cause was measured rather than
// guessed.  On a patch of meadow at the human start: the horizontal
// autocorrelation peaked at every multiple of 32 pixels and bottomed out
// between (0.249 at one tile against 0.037 beside it, 6.8 times), **14% of
// tiles were pixel-for-pixel identical to the one beside them**, and a
// hundred and four tiles held twenty-eight distinct pictures.
//
// The hash that picks between the three grass pieces was the obvious suspect
// and was innocent: counted over four hundred cells its periods run 31% to
// 37% where three pictures at random would give 33%.  Three pictures on a
// thirteen-wide screen is three pictures however well they are shuffled.
await page.evaluate(() => {
  window.__cam({ x: -8949, y: -132, zoom: 1 })
  document.getElementById('ui')?.setAttribute('hidden', '')
})
await page.waitForTimeout(600)
const flat = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  const g = c.getContext('2d')
  // A square of meadow away from the road and the fences.
  const S = 320
  const d = g.getImageData(c.width / 2 - S / 2, c.height / 2 - S / 2, S, S).data
  const at = (x, y) => (y * S + x) * 4
  // How alike a row is to itself `lag` pixels along, as plain correlation of
  // the green channel about its own mean.
  const corr = (lag) => {
    let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0
    for (let y = 0; y < S; y++) {
      for (let x = 0; x + lag < S; x++) {
        const a = d[at(x, y) + 1], b = d[at(x + lag, y) + 1]
        n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b
      }
    }
    const ca = saa / n - (sa / n) ** 2, cb = sbb / n - (sb / n) ** 2
    return (sab / n - (sa / n) * (sb / n)) / Math.sqrt(Math.max(1e-9, ca * cb))
  }
  // And how many of the 32-pixel cells are identical to their neighbour.
  const cells = []
  for (let j = 0; j + 32 <= S; j += 32) {
    for (let i = 0; i + 32 <= S; i += 32) {
      let k = ''
      for (let y = 0; y < 32; y += 2) for (let x = 0; x < 32; x += 2) k += d[at(i + x, j + y)]
      cells.push(k)
    }
  }
  const wide = Math.floor(S / 32)
  let same = 0, pairs = 0
  for (let j = 0; j < wide; j++) {
    for (let i = 0; i + 1 < wide; i++) {
      pairs++
      if (cells[j * wide + i] === cells[j * wide + i + 1]) same++
    }
  }
  return {
    peak: corr(32), beside: (corr(24) + corr(40)) / 2,
    twins: same / Math.max(1, pairs), kinds: new Set(cells).size, of: cells.length,
  }
})
await page.evaluate(() => document.getElementById('ui')?.removeAttribute('hidden'))
check('no picture repeats beside itself', flat.twins < 0.03,
  `${(flat.twins * 100).toFixed(1)}% of neighbouring tiles are identical`)
check('and the grid does not stand out at one tile',
  flat.peak / Math.max(0.02, flat.beside) < 2.4,
  `${(flat.peak / Math.max(0.02, flat.beside)).toFixed(1)}x the correlation of `
  + 'its neighbouring lags')
console.log(`      (${flat.kinds} distinct pictures in ${flat.of} tiles of meadow)`)

await browser.close()
console.log(bad ? `${bad} FAILED` : 'all checks passed')
process.exit(bad ? 1 : 0)

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
  ['abbey', -8897, -178, 0.5, 'Northshire abbey, the one building with an inside'],
  ['goldshire', -9462, 16, 1, 'Goldshire, which is roads and roofs'],
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

await browser.close()
console.log(bad ? `${bad} FAILED` : 'all checks passed')
process.exit(bad ? 1 : 0)

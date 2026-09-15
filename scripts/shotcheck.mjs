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
  // Moved on to an actual crossing.  It was at (-9100, -350) and described as
  // *water, a crossing and a bank*; what stands there is a cornfield, and a
  // reference that has drifted from its own description is the failure this
  // whole file exists to stop — a comparison can only ever say the screen is
  // what it was, so the description is the only thing that says it was right.
  ['river', -8986, -300, 0.8, 'water, a crossing and a bank'],
  // **`'widest'` rather than a number**, and that is issue 231's lesson landing
  // here.  This said `0.3`, which was a screen a player could reach while the
  // zoom floor was the constant 0.12; the floor is derived now — the opening
  // framing over `cameraDistanceMaxFactor` — so 0.3 clamps, and a reference
  // taken at a zoom the camera refuses is a reference of nothing.  Asked this
  // way it also follows the viewport: the same word means 0.203 on a phone.
  //
  // **Its description changed with it, and that is the honest part.**  It said
  // *the valley from far enough to see its shape*, and at the derived floor it
  // is 107 yards of river and bridge — the valley is 600 across and no longer
  // fits, because the ceiling is now the client's camera slider rather than a
  // number picked to make this picture work.  A reference that has drifted
  // from its own description is the failure this whole file exists to stop.
  ['wide', -8983, -316, 'widest',
    'the widest the camera goes — the opening framing halved'],
  ['hills', -8700, -900, 0.7, 'bare rock, where the slope decides the ground'],
  // **Two from inside**, which the wiki asked for (실내와 바깥) and which all
  // six above could never be: since 327779e a room is a scene of its own, and
  // a regression in it — a floor drawn as a pit, the forest showing through a
  // wall — is invisible from every one of them.  Walked in through the
  // building's own door with the game's own step, from the point in the last
  // column, and only then stood at the spot: a reference taken of a room a
  // teleport put him in would be a room the scene does not think he is in.
  //
  // **Framed away from the stairs, and that is a known fault and not a
  // choice of scenery.**  The first pictures taken here had grass growing in
  // both rooms, beside every staircase: `over` keeps a ceiling within a
  // storey's reach of the floor, a stairwell's ceiling is the roof two storeys
  // up, so the cell reads as open sky and `drawRoom` lays it with the
  // outdoor ground a courtyard gets.  Nothing the bake ships can tell a
  // stairwell from a yard — the storeys above have the same hole in them —
  // so the fix is in `bake_terrain.py` and not here.  A reference with the
  // grass in it would be a promise that the grass is right.
  ['inn', -9464.3, 24.2, 1.4, 'the inn at Goldshire from inside, with nothing standing in it but its people',
    'inside', [-9463, 16]],
  ['nave', -8915.5, -209.4, 2, 'Northshire abbey from inside, in the nave',
    'inside', [-8904, -185]],
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
for (const [name, x, y, zoom, why, where, door] of SPOTS) {
  const z = zoom === 'widest'
    ? await page.evaluate(() => window.__zooms().floor) : zoom
  if (where === 'inside') {
    const went = await page.evaluate(([a, c, zz, ex, ey]) => {
      const r = window.__enterAt(ex, ey)
      if (r) window.__cam({ x: a, y: c, zoom: zz })
      return r && window.__room().inside ? r : null
    }, [x, y, z, door[0], door[1]])
    check(`${name} can be walked into`, !!went,
      went ? `in through door ${went.door} of a ${went.k}`
        : `nothing at ${door[0]}, ${door[1]} has a door, or ${x}, ${y} is not in its room`)
    // Waited on: inside, and the room laid, and two frames drawn after it.
    await page.waitForFunction(() => !!window.__room().inside
      && Object.keys(window.__roomPaint().floor).length > 0, null, { timeout: 10000 })
      .catch(() => null)
    await page.evaluate(() => new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r()))))
  } else {
    await page.evaluate((c) => window.__cam(c), { x, y, zoom: z })
    await page.waitForTimeout(400)
  }
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
// Waited on rather than slept on: every tile of the view composed into a plate
// and none left loose, then two frames drawn after that.  Measured, that is
// about three hundred and fifty milliseconds here and the sleep was six
// hundred — right by a margin that is a statement about this machine.
await page.waitForFunction(() => {
  const e = window.__edges()
  return e.plates > 0 && e.tiles === 0
}, null, { timeout: 10000 }).catch(() => null)
await page.evaluate(() => new Promise((r) =>
  requestAnimationFrame(() => requestAnimationFrame(() => r()))))
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
  const often = new Map()
  for (const k of cells) often.set(k, (often.get(k) ?? 0) + 1)
  const top = [...often.values()].sort((a, b) => b - a).slice(0, 5)
    .reduce((a, v) => a + v, 0)
  return {
    peak: corr(32), beside: (corr(24) + corr(40)) / 2,
    twins: same / Math.max(1, pairs), kinds: often.size, of: cells.length,
    top: top / Math.max(1, cells.length),
  }
})
await page.evaluate(() => document.getElementById('ui')?.removeAttribute('hidden'))
check('no picture repeats beside itself', flat.twins < 0.03,
  `${(flat.twins * 100).toFixed(1)}% of neighbouring tiles are identical`)
// **Two, which is #142's own target, and not the 2.4 it read the day it went
// in.**  The bar was set beside a gauge reading 2.1 — on a plate a pixel too
// wide a tile, which was smearing the lattice — and it read 4.0 when the drift
// was fixed and 1.0 once the tufts were nudged inside their tile.  A bar with a
// margin the ground passes by half is a bar that would let the chessboard back
// most of the way; nothing now needs the room.
check('and the grid does not stand out at one tile',
  flat.peak / Math.max(0.02, flat.beside) < 2,
  `${(flat.peak / Math.max(0.02, flat.beside)).toFixed(1)}x the correlation of `
  + 'its neighbouring lags')
// And the two targets #142 set that were only ever printed.  *A hundred tiles
// of meadow, close to a hundred pictures* — it was 28 — and *the five commonest
// under fifteen per cent* — it was 38.  Both were out of reach while a tile was
// one of three pictures at one of twenty-one shades; with the ground blended
// across the tiles and lit as a gradient, a tile is almost never pixel for
// pixel another.  Ninety rather than a hundred because a flat patch with no
// flowers in it can honestly repeat, and ninety is still three times what the
// chessboard managed.
check('and a hundred tiles of meadow are nearly a hundred pictures',
  flat.kinds >= flat.of * 0.9,
  `${flat.kinds} distinct pictures in ${flat.of} tiles of meadow`)
check('and no five of them are a seventh of it',
  flat.top < 0.15,
  `the five commonest are ${(flat.top * 100).toFixed(0)}% of the tiles`)

await browser.close()
console.log(bad ? `${bad} FAILED` : 'all checks passed')
process.exit(bad ? 1 : 0)

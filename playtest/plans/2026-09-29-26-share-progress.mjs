// Every prior test of the front page's own SHARE button (2026-09-25-19,
// 2026-09-26-44, 2026-09-28-27 with real clipboard permission) ran it against
// an empty `bests` record and read back gameMessage()'s "a player who has
// done nothing yet claims nothing" line -- the record-carrying half of the
// message ("N of M bosses down", "<boss> in <time>s") has never actually been
// exercised. This script gets a real kill on the board first (Bonegrinder
// 10-normal, idle style, the same zero-press kill hypothesis 1's own evidence
// already shows wins clean), lets it save to `bests` via src/main.ts's
// `beat()`/`saveBests()` call, reloads to the front page in the same origin,
// and reads what SHARE actually copies.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const OUT = '/tmp/pt-30-1-share-progress'
mkdirSync(OUT, { recursive: true })

const PORT = 5906
const child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
})
let log = ''
child.stdout.on('data', (b) => (log += b.toString()))
child.stderr.on('data', (b) => (log += b.toString()))

const url = `http://127.0.0.1:${PORT}/`
const deadline = Date.now() + 40000
let up = false
while (Date.now() < deadline) {
  try {
    const res = await fetch(url)
    if (res.ok) { up = true; break }
  } catch {}
  await new Promise((r) => setTimeout(r, 250))
}
if (!up) {
  console.log('vite never came up', log)
  process.exit(1)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 820, height: 1180 },
  hasTouch: true,
  permissions: ['clipboard-read', 'clipboard-write'],
})

async function toPage(page, x, y) {
  const box = await page.locator('#stage').boundingBox()
  const logical = await page.evaluate('({ w: window.innerWidth, h: window.innerHeight })')
  return { x: box.x + (x / logical.w) * box.width, y: box.y + (y / logical.h) * box.height }
}
async function tapLabel(page, label) {
  const all = await page.evaluate(() => window.__abyss.targets())
  const hit =
    all.find((t) => t.label === label) ??
    all.find((t) => t.label.startsWith(`${label}:`)) ??
    all.find((t) => t.label.includes(label))
  if (!hit) {
    console.log(`FAULT no-such-control: ${label}, saw`, all.map((t) => t.label))
    return null
  }
  const p = await toPage(page, hit.x, hit.y)
  await page.touchscreen.tap(p.x, p.y)
  await new Promise((r) => setTimeout(r, 150))
  return hit
}
async function readClip(page) {
  return await page.evaluate(async () => {
    try { return await navigator.clipboard.readText() } catch (e) { return `<read failed: ${e}>` }
  })
}

// Each phase gets its own fresh Page: direction.md's own hypothesis-1 lesson
// (2026-09-25) is that reusing one Page and only changing the #hash is a
// same-document navigation in real fragment-navigation semantics -- main.ts's
// invite-hash reader and its startup screen state never re-run. A brand new
// Page forces a real navigation each time, same as a player opening a new tab.

// ---- Baseline: front page SHARE before anything is on record. ----
const page1 = await ctx.newPage()
await page1.goto(url, { waitUntil: 'load' })
await page1.waitForFunction('window.__abyss !== undefined', null, { timeout: 20000 })
await page1.waitForTimeout(600)
await tapLabel(page1, 'share')
await page1.waitForTimeout(500)
const before = await readClip(page1)
console.log('BEFORE any kill, front-page share clipboard:', JSON.stringify(before))
await page1.screenshot({ path: `${OUT}/before.png` })

// ---- Get a real kill on the board: Bonegrinder 10-normal, idle style. ----
const page2 = await ctx.newPage()
await page2.goto(url + '#b=marrow&s=10&h=0', { waitUntil: 'load' })
await page2.waitForFunction('window.__abyss !== undefined', null, { timeout: 20000 })
await page2.waitForTimeout(600)
await tapLabel(page2, 'class:warrior:arms')
await page2.waitForTimeout(300)
await tapLabel(page2, 'pull')
await page2.waitForTimeout(600)
console.log('pull started, mode:', await page2.evaluate(() => window.__abyss.mode()))

const killDeadline = Date.now() + 180000
let outcome = 'ongoing'
while (Date.now() < killDeadline) {
  outcome = await page2.evaluate(() => window.__abyss.outcome())
  if (outcome !== 'ongoing') break
  await page2.waitForTimeout(2000)
}
console.log('fight outcome:', outcome, 'at', await page2.evaluate(() => window.__abyss.hud()?.time))
await page2.screenshot({ path: `${OUT}/kill.png` })

if (outcome !== 'victory') {
  console.log('did not reach a kill, aborting the front-page-share check')
} else {
  // ---- A fresh Page on the front page: bests was saved synchronously the ----
  // ---- instant outcome flipped (src/main.ts:2537-2540), same origin/context. ----
  const page3 = await ctx.newPage()
  await page3.goto(url, { waitUntil: 'load' })
  await page3.waitForFunction('window.__abyss !== undefined', null, { timeout: 20000 })
  await page3.waitForTimeout(600)
  console.log('back on:', await page3.evaluate(() => window.__abyss.screen()))
  await page3.screenshot({ path: `${OUT}/home-after-kill.png` })

  await tapLabel(page3, 'share')
  await page3.waitForTimeout(500)
  const after = await readClip(page3)
  console.log('AFTER a kill, front-page share clipboard:', JSON.stringify(after))
  await page3.screenshot({ path: `${OUT}/after.png` })
}

await browser.close()
try { process.kill(-child.pid, 'SIGTERM') } catch {}

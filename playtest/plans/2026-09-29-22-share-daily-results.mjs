// docs/playtest.md's own SHARE-clipboard lesson (2026-09-28-27) only ever
// re-tested the FRONT PAGE's share button with real clipboard permissions
// granted -- scripts/playbot.ts never grants clipboard-read/clipboard-write,
// so every session before that one was testing the driver's sandbox rather
// than the game, and the fix was to grant permissions and re-check. But
// that session's own script only pressed the front page's box
// (playtest/plans/2026-09-25-19.play's comment names all THREE share
// buttons README's "Sharing" section describes -- front page, daily,
// results -- and says none but the front page's had ever been pressed by
// any session). A grep of every .play file for `tap share` confirms it:
// two hits, both on the front page, zero on the daily screen or an
// outcome overlay. This script presses the other two, with real clipboard
// permission, and checks the README claims: the daily screen "shares the
// day, with whatever you have made of it so far attached" and the results
// screen "shares a kill, with the boss, the size, the difficulty and the
// time."
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const OUT = '/tmp/pt-22-share'
mkdirSync(OUT, { recursive: true })

const PORT = 5901
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

// The same coordinate mapping playbot.ts's Driver.toPage uses: canvas
// coordinates -> the page point a tap has to land on.
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

// ---- Phase 1: the DAILY screen's own SHARE, never pressed before. ----
const page1 = await ctx.newPage()
await page1.goto(url, { waitUntil: 'load' })
await page1.waitForFunction('window.__abyss !== undefined', null, { timeout: 20000 })
await page1.waitForTimeout(600)

console.log('phase1 screen before:', await page1.evaluate(() => window.__abyss.screen()))
const dailyHit = await tapLabel(page1, 'daily')
console.log('tapped', dailyHit?.label, 'now on', await page1.evaluate(() => window.__abyss.screen()))
await page1.screenshot({ path: `${OUT}/daily-before.png` })

const shareHit1 = await tapLabel(page1, 'share')
await page1.waitForTimeout(500)
await page1.screenshot({ path: `${OUT}/daily-after.png` })
const clip1 = await readClip(page1)
console.log('DAILY share clipboard:', JSON.stringify(clip1))

// ---- Phase 2: an actual kill, then the RESULTS overlay's own SHARE. ----
const page2 = await ctx.newPage()
await page2.goto(url + '#b=marrow&s=10&h=0', { waitUntil: 'load' })
await page2.waitForFunction('window.__abyss !== undefined', null, { timeout: 20000 })
await page2.waitForTimeout(600)
console.log('phase2 screen after hash open:', await page2.evaluate(() => window.__abyss.screen()))

await tapLabel(page2, 'class:warrior:arms')
await page2.waitForTimeout(300)
await tapLabel(page2, 'pull')
await page2.waitForTimeout(600)
console.log('phase2 screen after pull:', await page2.evaluate(() => window.__abyss.screen()), await page2.evaluate(() => window.__abyss.mode()))

// idle style: no input at all, exactly the way hypothesis-1's Bonegrinder
// tank pull won without a press. Poll until the outcome leaves 'ongoing'.
const killDeadline = Date.now() + 180000
let outcome = 'ongoing'
while (Date.now() < killDeadline) {
  outcome = await page2.evaluate(() => window.__abyss.outcome())
  if (outcome !== 'ongoing') break
  await page2.waitForTimeout(2000)
}
console.log('fight outcome:', outcome, 'at', await page2.evaluate(() => window.__abyss.hud()?.time))
await page2.screenshot({ path: `${OUT}/outcome.png` })

if (outcome === 'victory') {
  const shareHit2 = await tapLabel(page2, 'share')
  console.log('outcome share tap:', shareHit2)
  await page2.waitForTimeout(500)
  await page2.screenshot({ path: `${OUT}/outcome-after.png` })
  const clip2 = await readClip(page2)
  console.log('RESULTS share clipboard:', JSON.stringify(clip2))
} else {
  console.log('did not reach victory in time, outcome:', outcome, '-- no share button to test on this overlay (shareRect requires mode=raid && outcome=victory)')
}

await browser.close()
try { process.kill(-child.pid, 'SIGTERM') } catch {}

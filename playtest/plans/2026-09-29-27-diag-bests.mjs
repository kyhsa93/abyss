// Follow-up to 2026-09-30-1-share-progress.mjs: that script found the front
// page's SHARE reading identical text before and after a real kill. This
// reads `localStorage` directly, on the same Page with no navigation at all,
// to rule out a reload/origin artifact and confirm `abyss.bests` itself is
// what never gets written -- while `abyss.history` on the same pull does.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const PORT = 5907
const child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: process.cwd(), stdio: ['ignore','pipe','pipe'], detached: true,
})
const url = `http://127.0.0.1:${PORT}/`
const deadline = Date.now() + 40000
let up = false
while (Date.now() < deadline) {
  try { const res = await fetch(url); if (res.ok) { up = true; break } } catch {}
  await new Promise(r => setTimeout(r, 250))
}
if (!up) { console.log('vite never came up'); process.exit(1) }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true })
async function toPage(page, x, y) {
  const box = await page.locator('#stage').boundingBox()
  const logical = await page.evaluate('({ w: window.innerWidth, h: window.innerHeight })')
  return { x: box.x + (x / logical.w) * box.width, y: box.y + (y / logical.h) * box.height }
}
async function tapLabel(page, label) {
  const all = await page.evaluate(() => window.__abyss.targets())
  const hit = all.find(t=>t.label===label) ?? all.find(t=>t.label.startsWith(`${label}:`)) ?? all.find(t=>t.label.includes(label))
  if (!hit) { console.log('FAULT no-such-control:', label, all.map(t=>t.label)); return null }
  const p = await toPage(page, hit.x, hit.y)
  await page.touchscreen.tap(p.x, p.y)
  await new Promise(r=>setTimeout(r,150))
  return hit
}

const page = await ctx.newPage()
await page.goto(url + '#b=marrow&s=10&h=0', { waitUntil: 'load' })
await page.waitForFunction('window.__abyss !== undefined', null, { timeout: 20000 })
await page.waitForTimeout(600)
console.log('localStorage bests before pull:', await page.evaluate(() => localStorage.getItem('abyss.bests')))
await tapLabel(page, 'class:warrior:arms')
await page.waitForTimeout(300)
await tapLabel(page, 'pull')
await page.waitForTimeout(600)

const killDeadline = Date.now() + 180000
let outcome = 'ongoing'
while (Date.now() < killDeadline) {
  outcome = await page.evaluate(() => window.__abyss.outcome())
  if (outcome !== 'ongoing') break
  await page.waitForTimeout(2000)
}
console.log('outcome:', outcome)
await page.waitForTimeout(1000)
console.log('localStorage bests right after victory (same page, no nav):', await page.evaluate(() => localStorage.getItem('abyss.bests')))
console.log('localStorage history right after victory:', await page.evaluate(() => localStorage.getItem('abyss.history')))

await browser.close()
try { process.kill(-child.pid, 'SIGTERM') } catch {}

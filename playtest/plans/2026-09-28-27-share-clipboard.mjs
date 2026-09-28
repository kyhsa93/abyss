// The 2026-09-25 note on the front page's SHARE button reading "NO LUCK"
// closed with an open question: "worth a second look only if a session can
// first confirm the CDP context actually has clipboard-write and still sees
// NO LUCK." Nobody had done that -- scripts/playbot.ts never grants its
// browser context clipboard permissions at all, so every prior SHARE read
// was testing the driver's own sandbox, not the game. This grants
// clipboard-read/clipboard-write explicitly (chromium.launchPersistentContext
// does not accept permissions on construction for a fresh non-persistent
// context, so a regular launch + context.grantPermissions is used instead)
// and taps the exact box `targets` read off the live page a moment earlier
// (share@476,1132 120x40, at this session's assigned 820x1180 touch
// viewport) rather than guessing a coordinate.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const PORT = 5900
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
const page = await ctx.newPage()
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction('window.__abyss !== undefined', null, { timeout: 20000 })
await page.waitForTimeout(1000)

console.log('screen before tap:', await page.evaluate(() => window.__abyss.screen()))
await page.screenshot({ path: '/tmp/pt-27-share/before.png' })

// share@476,1132 120x40, read off `targets` on this exact viewport moments ago.
await page.touchscreen.tap(476, 1132)
await page.waitForTimeout(600)

await page.screenshot({ path: '/tmp/pt-27-share/after.png' })

const clip = await page.evaluate(async () => {
  try {
    return await navigator.clipboard.readText()
  } catch (e) {
    return `<read failed: ${e}>`
  }
})
console.log('clipboard contents:', JSON.stringify(clip))

await browser.close()
try { process.kill(-child.pid, 'SIGTERM') } catch {}

// One-off Playwright script, not a .play file. `playtest/plans/2026-10-01-9.play`
// (the .play version of this same probe) found that `tap refresh` on the
// SETTINGS screen's RELOAD FRESH button throws inside playbot's own `tap()`:
// `page.evaluate: TypeError: Cannot read properties of undefined (reading
// 'screen')`. `tap()` sleeps 80ms after the touch then reads `where().screen`
// back (scripts/playbot.ts:373-374) -- src/cache.ts's reloadFresh() calls
// `location.reload()` at the end of its async body, and that reload destroys
// the page's JS execution context out from under the 80ms-later read-back.
// grep of playtest/direction.md and sessions.jsonl for "reload fresh" /
// "reloadFresh" is empty: no session has ever pressed this button before
// today, under either vocabulary. Going around the .play vocabulary per
// docs/playtest.md's own instruction for exactly this shape (a reload
// mid-script), to see what actually happens rather than just that the
// wrapper throws: does a carried profile survive the reload, and does the
// page land back somewhere sane. mode=menus, 820x1180 touch, carried, this
// session's assigned cell.
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const port = 5200 + ((process.pid + 11 * 37) % 300)
const url = `http://127.0.0.1:${port}/`

const child = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
})
let log = ''
child.stdout.on('data', (b) => (log += b.toString()))
child.stderr.on('data', (b) => (log += b.toString()))

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

const deadline = Date.now() + 40_000
let up = false
while (Date.now() < deadline) {
  try {
    const res = await fetch(url)
    if (res.ok) {
      up = true
      break
    }
  } catch {}
  await sleep(250)
}
if (!up) {
  console.log('vite never came up:', log)
  process.exit(1)
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, deviceScaleFactor: 1 })
const page = await context.newPage()
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message.split('\n')[0]))
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const t = m.text()
  if (/\bws:\/\/|WebSocket|\[vite\]|HMR/i.test(t)) return
  console.log('CONSOLE ERROR:', t.slice(0, 300))
})

async function toPage(x, y) {
  const box = await page.locator('#stage').boundingBox()
  const logical = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
  return { x: box.x + (x / logical.w) * box.width, y: box.y + (y / logical.h) * box.height }
}

async function tapLabel(label) {
  const all = await page.evaluate(() => window.__abyss.targets())
  const hit = all.find((t) => t.label === label) ?? all.find((t) => t.label.startsWith(`${label}:`))
  if (!hit) {
    console.log(`NO SUCH CONTROL: ${label}, saw`, all.map((t) => t.label))
    return false
  }
  const p = await toPage(hit.x, hit.y)
  await page.touchscreen.tap(p.x, p.y)
  return true
}

await page.goto(url)
await page.waitForFunction(() => !!window.__abyss, { timeout: 15000 })

// Leave a fingerprint in the carried profile before reloading: a name no
// default save would have, so survival is a plain string comparison and not
// an inference from "nothing changed".
const before = await page.evaluate(() => {
  localStorage.setItem('abyss.name', JSON.stringify('ReloadProbe'))
  return {
    name: localStorage.getItem('abyss.name'),
    keys: Object.keys(localStorage).filter((k) => k.startsWith('abyss.')).sort(),
  }
})
console.log('before-reload', JSON.stringify(before))

// Reload so the name field actually reads the value just written (the app
// reads localStorage once at startup, per direction.md's own account of
// `main.ts`'s start-up reads), then confirm it shows on the real SETTINGS
// screen before touching RELOAD FRESH.
await page.reload()
await page.waitForFunction(() => !!window.__abyss, { timeout: 15000 })
await tapLabel('settings')
await sleep(150)
const settingsBefore = await page.evaluate(() => {
  const a = window.__abyss
  return { screen: a.screen(), targets: a.targets().map((t) => t.label) }
})
console.log('settings-before', JSON.stringify(settingsBefore))
await page.screenshot({ path: '/tmp/pt-9-settings-before.png' })

const swBefore = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return 'unsupported'
  return (await navigator.serviceWorker.getRegistrations()).length
})
console.log('service-workers-before', swBefore)

// The real press: RELOAD FRESH. `page.reload()`'s own semantics (navigation
// commit) are what `location.reload()` triggers, so watch for the navigation
// itself rather than polling `__abyss`, which disappears and reappears
// across it.
const navWait = page.waitForNavigation({ waitUntil: 'load', timeout: 15000 })
const tapped = await tapLabel('refresh')
console.log('tapped refresh:', tapped)
try {
  await navWait
  console.log('navigation completed')
} catch (e) {
  console.log('navigation wait threw:', e.message.split('\n')[0])
}
await page.waitForFunction(() => !!window.__abyss, { timeout: 15000 }).catch((e) => console.log('post-reload __abyss wait threw:', e.message.split('\n')[0]))
await sleep(300)

const after = await page.evaluate(() => {
  const a = window.__abyss
  return {
    hasAbyss: !!a,
    screen: a ? a.screen() : null,
    url: location.href,
    name: localStorage.getItem('abyss.name'),
  }
})
console.log('after-reload', JSON.stringify(after))
await page.screenshot({ path: '/tmp/pt-9-after-reload.png' })

const swAfter = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return 'unsupported'
  return (await navigator.serviceWorker.getRegistrations()).length
})
console.log('service-workers-after', swAfter)

// Confirm the name actually reads back through the real SETTINGS screen, not
// just localStorage directly.
if (after.screen === 'home') {
  await tapLabel('settings')
  await sleep(150)
  const settingsAfter = await page.evaluate(() => window.__abyss.targets().find((t) => t.label === 'name'))
  console.log('settings-name-control-after', JSON.stringify(settingsAfter))
  await page.screenshot({ path: '/tmp/pt-9-settings-after.png' })
}

await browser.close()
child.kill()
process.exit(0)

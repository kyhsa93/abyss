// One-off Playwright script, not a .play file: the .play vocabulary has no
// command for the browser's own back/forward buttons or a mid-session
// viewport resize, and docs/playtest.md says to go around the vocabulary
// rather than force it. Both are things a real touch-device player can
// trigger without meaning to -- an edge-swipe on most mobile browsers *is*
// "go back" -- and no session (grep of playtest/direction.md for
// "browser.back"/"goBack"/"resize" returns nothing) has ever tried either on
// this game. mode=menus, 820x1180,touch, matching this session's picked cell;
// save is irrelevant here since nothing here reaches a fight or a save write.
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
  await sleep(150)
  return true
}

async function snap(name) {
  const state = await page.evaluate(() => {
    const a = window.__abyss
    let screen = null
    let mode = null
    try {
      screen = a ? a.screen() : null
    } catch (e) {
      screen = `<throws: ${e.message}>`
    }
    try {
      mode = a ? a.mode() : null
    } catch (e) {
      mode = `<throws: ${e.message}>`
    }
    return { hasAbyss: !!a, screen, mode, url: location.href, title: document.title }
  })
  await page.screenshot({ path: `/tmp/pt-nav-${name}.png` })
  console.log(name, JSON.stringify(state))
  return state
}

async function measure(name) {
  const glass = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
  let all = []
  try {
    all = await page.evaluate(() => window.__abyss.targets(4))
  } catch (e) {
    console.log(name, 'targets() threw:', e.message)
  }
  const small = []
  const off = []
  const over = []
  for (const t of all) {
    const l = t.x - t.w / 2
    const top = t.y - t.h / 2
    if (Math.min(t.w, t.h) < 44) small.push(`${t.label} ${Math.round(t.w)}x${Math.round(t.h)}`)
    if (l < 0 || top < 0 || l + t.w > glass.w || top + t.h > glass.h) off.push(`${t.label} at ${Math.round(l)},${Math.round(top)}`)
  }
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]
      const b = all[j]
      if (Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h) over.push(`${a.label} / ${b.label}`)
    }
  }
  console.log(name, 'glass', `${glass.w}x${glass.h}`, 'controls', all.length, 'under44', small, 'offGlass', off, 'overlapping', over)
  await page.screenshot({ path: `/tmp/pt-nav-${name}.png` })
}

try {
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction('window.__abyss !== undefined', null, { timeout: 20_000 })
  await snap('01-front')

  // Four taps deep: front -> raid setup -> roster (class select) -> composition.
  // grep of src/ confirms the mechanism ahead of time: main.ts:2145-2146 is the
  // *only* history API call anywhere in src/, a one-shot replaceState that
  // strips the invite hash after reading it (README's "Sharing" section). There
  // is no pushState anywhere, so the app never records a screen change as a
  // history entry -- the prediction is that "back" does not know these four
  // taps happened at all, however deep they went.
  await tapLabel('raid')
  await tapLabel('next')
  await snap('02-roster')
  await tapLabel('compose')
  await snap('03-composition')

  // === Test A: the browser's own back button, four screens deep ===
  await page.goBack({ waitUntil: 'load' }).catch((e) => console.log('goBack threw:', e.message))
  await sleep(500)
  await snap('04-after-back')

  // === Test B: forward again ===
  await page.goForward({ waitUntil: 'load' }).catch((e) => console.log('goForward threw:', e.message))
  await sleep(500)
  await snap('05-after-forward')

  // Get back to known menu screens for the resize tests, richer control sets
  // than raid-setup's 4: roster has 20 (17 spec tiles + back/compose/pull),
  // composition has 13 (10 slot pickers + back/auto/reroll).
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction('window.__abyss !== undefined', null, { timeout: 20_000 })
  await tapLabel('raid')
  await tapLabel('next')
  await measure('06-roster-820x1180')
  await page.setViewportSize({ width: 390, height: 844 })
  await sleep(300)
  await measure('07-roster-resized-390x844')
  await page.setViewportSize({ width: 1280, height: 800 })
  await sleep(300)
  await measure('08-roster-resized-1280x800')
  await page.setViewportSize({ width: 820, height: 1180 })
  await sleep(300)
  await measure('09-roster-resized-back-820x1180')

  await tapLabel('compose')
  await measure('10-composition-820x1180')
  await page.setViewportSize({ width: 390, height: 844 })
  await sleep(300)
  await measure('11-composition-resized-390x844')
  await page.setViewportSize({ width: 1280, height: 800 })
  await sleep(300)
  await measure('12-composition-resized-1280x800')
  await page.setViewportSize({ width: 820, height: 1180 })
  await sleep(300)
  await measure('13-composition-resized-back-820x1180')
} finally {
  await context.close()
  await browser.close()
  try {
    if (child.pid !== undefined) process.kill(-child.pid, 'SIGTERM')
  } catch {}
}

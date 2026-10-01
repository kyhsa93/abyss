// One-off Playwright script, not a .play file: the .play vocabulary drives
// exactly one page, and this needs two at once. mode=menus, 820x1180 touch,
// save=carried (this session's picked cell) -- a thing no prior session has
// tried in 24 mode=menus sessions (grepped playtest/direction.md and
// sessions.jsonl for "second tab"/"newPage"/"two tabs": zero hits).
//
// src/main.ts's own comment on updateComposition/applyComposition says the
// design assumption straight out: "Every press goes through `compose`, and
// what comes back is written to the party and saved immediately -- there is
// no confirm step, because the board is already showing the answer." That
// sentence assumes one board. A phone easily ends up with the game open in
// two tabs (switch apps, come back via a stale tab; a PWA install plus a
// leftover browser tab) sharing one localStorage origin -- loadParty() reads
// `abyss.party` once at page load into each tab's own `party` variable, and
// saveSetup() overwrites the whole key on every single spec pick, so the
// prediction going in is a last-write-wins race: whichever tab presses last
// discards the other tab's pick with no error, no merge and no indication to
// either side.
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const port = 5200 + ((process.pid + 12 * 37) % 300)
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

async function mkPage(tag) {
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log(`[${tag}] PAGE ERROR:`, e.message.split('\n')[0]))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (/\bws:\/\/|WebSocket|\[vite\]|HMR/i.test(t)) return
    console.log(`[${tag}] CONSOLE ERROR:`, t.slice(0, 300))
  })
  return page
}

async function toPage(page, x, y) {
  const box = await page.locator('#stage').boundingBox()
  const logical = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
  return { x: box.x + (x / logical.w) * box.width, y: box.y + (y / logical.h) * box.height }
}

async function tapLabel(page, tag, label) {
  const all = await page.evaluate(() => window.__abyss.targets())
  const hit = all.find((t) => t.label === label) ?? all.find((t) => t.label.startsWith(`${label}:`))
  if (!hit) {
    console.log(`[${tag}] NO SUCH CONTROL: ${label}, saw`, all.map((t) => t.label))
    return false
  }
  const p = await toPage(page, hit.x, hit.y)
  await page.touchscreen.tap(p.x, p.y)
  await sleep(150)
  return true
}

async function tapContains(page, tag, needle) {
  const all = await page.evaluate(() => window.__abyss.targets())
  const hit = all.find((t) => t.label.includes(needle))
  if (!hit) {
    console.log(`[${tag}] NO CONTROL CONTAINING: ${needle}, saw`, all.map((t) => t.label))
    return false
  }
  const p = await toPage(page, hit.x, hit.y)
  await page.touchscreen.tap(p.x, p.y)
  await sleep(150)
  console.log(`[${tag}] tapped`, hit.label)
  return true
}

async function party(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('abyss.party') ?? 'null'))
}

async function screen(page) {
  return page.evaluate(() => (window.__abyss ? window.__abyss.screen() : null))
}

try {
  const a = await mkPage('A')
  await a.goto(url, { waitUntil: 'load' })
  await a.waitForFunction('window.__abyss !== undefined', null, { timeout: 20_000 })
  await tapLabel(a, 'A', 'raid')
  await tapLabel(a, 'A', 'next')
  await tapLabel(a, 'A', 'compose')
  console.log('A screen after compose:', await screen(a))
  console.log('A starting party:', await party(a))

  // Tab B opens the same origin fresh -- a second tab a player left open, or
  // reopened, on the exact state tab A started from.
  const b = await mkPage('B')
  await b.goto(url, { waitUntil: 'load' })
  await b.waitForFunction('window.__abyss !== undefined', null, { timeout: 20_000 })
  await tapLabel(b, 'B', 'raid')
  await tapLabel(b, 'B', 'next')
  await tapLabel(b, 'B', 'compose')
  console.log('B screen after compose:', await screen(b))
  console.log('B starting party (should match A):', await party(b))

  // Tab A changes slot 0 to a spec, with its own picker, and saves.
  await tapLabel(a, 'A', 'slot:0')
  await a.screenshot({ path: '/tmp/pt-race-a-picker.png' })
  await tapContains(a, 'A', 'warrior:arms')
  const partyAfterA = await party(a)
  console.log('localStorage after A picks warrior:arms into slot 0:', partyAfterA)
  await a.screenshot({ path: '/tmp/pt-race-a-after-pick.png' })

  // Tab B, never reloaded, still holds its own original in-memory party from
  // before A's write. It changes a *different* slot and saves -- predicted to
  // overwrite the whole key with its own (stale) copy of every other slot,
  // silently discarding A's slot-0 change.
  await tapLabel(b, 'B', 'slot:1')
  await b.screenshot({ path: '/tmp/pt-race-b-picker.png' })
  await tapContains(b, 'B', 'paladin:holy')
  const partyAfterB = await party(b)
  console.log('localStorage after B picks paladin:holy into slot 1:', partyAfterB)
  await b.screenshot({ path: '/tmp/pt-race-b-after-pick.png' })

  console.log(
    'DID B\'S WRITE KEEP A\'S SLOT-0 PICK?',
    partyAfterB?.[0]?.classId === 'warrior' && partyAfterB?.[0]?.spec === 'arms',
  )

  // Tab A, still sitting on the composition screen it never left, has no way
  // to know its own slot-0 pick is gone from disk. Screenshot it as a player
  // would actually see it (expected: still showing warrior:arms, since A's
  // own in-memory `composing`/`party` never changed) -- then reload it, the
  // way a phone would restore the tab from the background, and see what a
  // real reload actually hands back.
  await a.screenshot({ path: '/tmp/pt-race-a-still-showing.png' })
  await a.reload({ waitUntil: 'load' })
  await a.waitForFunction('window.__abyss !== undefined', null, { timeout: 20_000 })
  await tapLabel(a, 'A', 'raid')
  await tapLabel(a, 'A', 'next')
  await tapLabel(a, 'A', 'compose')
  const partyAfterAReload = await party(a)
  console.log('A, reloaded, party on disk now:', partyAfterAReload)
  await a.screenshot({ path: '/tmp/pt-race-a-after-reload.png' })
  console.log(
    'DOES RELOADED A SEE ITS OWN SLOT-0 PICK?',
    partyAfterAReload?.[0]?.classId === 'warrior' && partyAfterAReload?.[0]?.spec === 'arms',
  )
  console.log(
    'DOES RELOADED A SEE B\'S SLOT-1 PICK IT NEVER MADE?',
    partyAfterAReload?.[1]?.classId === 'paladin' && partyAfterAReload?.[1]?.spec === 'holy',
  )
} finally {
  await context.close()
  await browser.close()
  try {
    if (child.pid !== undefined) process.kill(-child.pid, 'SIGTERM')
  } catch {}
}

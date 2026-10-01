// One-off Playwright script, not a `.play` file. Picked cell: mode=menus,
// view=844x390,touch, save=carried.
//
// direction.md's line [[5]] (#273) blames `scripts/playbot.ts`'s pid-derived
// port for why a `carried` save never survives between two separate `playbot`
// invocations -- `localStorage` is scoped per origin, port included, so
// reusing `--profile`'s Chromium user-data dir does not reuse the storage
// bucket unless the port also repeats. That diagnosis has twice been tested
// from the *failure* side (seven invocations, seven different ports; two
// processes colliding on the same pid-derived port and resuming a stale
// evening by accident) but never from the *fix* side: nobody has actually
// held the port fixed across two genuinely separate invocations and watched
// state carry, which is the only way to know the port is the *whole* bug and
// not one of two. Its own "Disproved by" line names two candidate fixes --
// "a fixed port for a given --profile, or an explicit localStorage
// snapshot/restore step" -- and this picks between them.
//
// Phase 1 and phase 2 below are two fully independent runs: each starts its
// own `vite` child process on the same fixed port and fully tears it down
// (context closed, server killed) before the next one starts, the same
// lifecycle `playbot.ts`'s own `serve()`/`context.close()` goes through once
// per invocation. A scratch profile dir is used rather than
// `playtest/profile`, so this does not leave test data in the real carried
// save.
//
// Run: node playtest/plans/2026-10-02-4-fixed-port-carry.mjs

import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

const FIXED_PORT = 5900
const VIEWPORT = { width: 844, height: 390 }
const PROFILE = resolve(mkdtempSync(join(tmpdir(), 'pt-fixedport-profile-')))
const OUT = mkdtempSync(join(tmpdir(), 'pt-fixedport-shots-'))
console.log('scratch profile ->', PROFILE)
console.log('shots ->', OUT)

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function serve(port) {
  const child = spawn(
    'npx',
    ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], detached: true },
  )
  let log = ''
  let dead = false
  child.stdout?.on('data', (b) => (log += b.toString()))
  child.stderr?.on('data', (b) => (log += b.toString()))
  child.on('exit', () => (dead = true))
  const stop = () => {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGTERM')
    } catch {}
  }
  const url = `http://127.0.0.1:${port}/`
  const deadline = Date.now() + 40_000
  let up = false
  while (Date.now() < deadline && !dead) {
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
    stop()
    throw new Error(`vite did not come up on ${port}:\n${log}`)
  }
  return { url, stop }
}

async function toPage(page, x, y) {
  const box = await page.locator('#stage').boundingBox()
  const logical = await page.evaluate('({ w: window.innerWidth, h: window.innerHeight })')
  return { x: box.x + (x / logical.w) * box.width, y: box.y + (y / logical.h) * box.height }
}

async function tapLabel(page, label) {
  const targets = await page.evaluate('window.__abyss.targets()')
  const hit = targets.find((t) => t.label === label) ?? targets.find((t) => t.label.startsWith(`${label}:`))
  if (!hit) {
    console.log('NO-SUCH-CONTROL', label, 'saw', targets.map((t) => t.label).join(','))
    return null
  }
  const p = await toPage(page, hit.x, hit.y)
  await page.touchscreen.tap(p.x, p.y)
  await sleep(150)
  return hit
}

async function tapContains(page, needle) {
  const targets = await page.evaluate('window.__abyss.targets()')
  const hit = targets.find((t) => t.label.includes(needle))
  if (!hit) {
    console.log('NO-CONTROL-CONTAINING', needle, 'saw', targets.map((t) => t.label).join(','))
    return null
  }
  const p = await toPage(page, hit.x, hit.y)
  await page.touchscreen.tap(p.x, p.y)
  await sleep(150)
  return hit
}

async function readStorage(page) {
  return page.evaluate(
    '({ name: localStorage.getItem("abyss.name"), party: JSON.parse(localStorage.getItem("abyss.party") ?? "null") })',
  )
}

async function openContext(url) {
  const context = await chromium.launchPersistentContext(PROFILE, {
    viewport: VIEWPORT,
    hasTouch: true,
    deviceScaleFactor: 1,
    headless: true,
  })
  const page = context.pages()[0] ?? (await context.newPage())
  page.on('pageerror', (e) => console.log('PAGE-ERROR', e.message.split('\n')[0]))
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction('window.__abyss !== undefined', null, { timeout: 20_000 })
  return { context, page }
}

async function main() {
  // --- Phase 1: a first "playbot invocation" -- fresh vite, fresh context,
  // write a distinct name and a distinct party pick, then tear everything
  // down exactly as playbot.ts does at the end of a run. ---
  console.log('\n=== PHASE 1 (first invocation) ===')
  const server1 = await serve(FIXED_PORT)
  const { context: ctx1, page: p1 } = await openContext(server1.url)

  console.log('phase1 initial storage (expect nulls, fresh scratch profile):', await readStorage(p1))

  await tapLabel(p1, 'settings')
  await tapLabel(p1, 'name')
  await p1.keyboard.insertText('PORTFIX1')
  await p1.keyboard.press('Enter')
  await sleep(150)

  await tapLabel(p1, 'back')
  await tapLabel(p1, 'raid')
  await tapLabel(p1, 'next')
  await tapLabel(p1, 'compose')
  const defaultSlot0 = (await readStorage(p1)).party?.[0]
  console.log('phase1 default slot:0 before any pick (for contrast):', JSON.stringify(defaultSlot0))
  await tapLabel(p1, 'slot:0')
  await tapContains(p1, 'warrior:arms')

  const writtenStorage = await readStorage(p1)
  console.log('phase1 storage after writes:', JSON.stringify(writtenStorage))
  await p1.screenshot({ path: `${OUT}/phase1-after-writes.png` })

  await ctx1.close()
  server1.stop()
  await sleep(500)
  console.log('phase1 torn down (context closed, vite killed)')

  // --- Phase 2: a fully separate invocation -- a brand-new vite process on
  // the identical port, a brand-new launchPersistentContext call against the
  // same profile dir. If the port is really the whole bug, this should see
  // phase 1's name and party with no further action. ---
  console.log('\n=== PHASE 2 (second, separate invocation, same fixed port) ===')
  const server2 = await serve(FIXED_PORT)
  const { context: ctx2, page: p2 } = await openContext(server2.url)

  const rawStorage = await readStorage(p2)
  console.log('phase2 raw storage on load (before any tap):', JSON.stringify(rawStorage))

  await tapLabel(p2, 'settings')
  await p2.screenshot({ path: `${OUT}/phase2-settings-static.png` })
  await tapLabel(p2, 'name')
  const nameFieldValue = await p2.evaluate('document.querySelector("input")?.value ?? null')
  console.log('phase2 settings name field (while editing) reads:', JSON.stringify(nameFieldValue))
  await p2.keyboard.press('Escape')
  await sleep(150)

  await tapLabel(p2, 'back')
  await tapLabel(p2, 'raid')
  await tapLabel(p2, 'next')
  await tapLabel(p2, 'compose')
  await p2.screenshot({ path: `${OUT}/phase2-composition.png` })

  const nameCarried = rawStorage.name === 'PORTFIX1'
  const partyCarried = rawStorage.party?.[0]?.classId === 'warrior' && rawStorage.party?.[0]?.spec === 'arms'
  console.log('\n=== RESULT ===')
  console.log('name carried from phase1 to phase2 (same fixed port, separate invocations)?', nameCarried)
  console.log('party pick carried from phase1 to phase2?', partyCarried)

  await ctx2.close()
  server2.stop()
}

main().catch((e) => {
  console.error('SCRIPT-THREW', e)
  process.exit(1)
})

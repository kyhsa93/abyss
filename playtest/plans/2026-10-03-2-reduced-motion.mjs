// One-off: does the backdrop actually honour `prefers-reduced-motion`, and does
// a *carried* save's own already-stored abyss.backdrop key override it?
// mode=menus has no .play command for emulateMedia, so this goes around the
// vocabulary per docs/playtest.md's own instruction for exactly that case.
//
// src/render/ambience.ts:38-46 says the default is on, "except where the
// device has asked for less movement" -- but only when localStorage has no
// 'abyss.backdrop' key yet. Three conditions, three fresh contexts:
//   A. fresh profile,   prefers-reduced-motion: reduce         -> expect OFF
//   B. fresh profile,   prefers-reduced-motion: no-preference  -> expect ON
//   C. carried profile (playtest/profile), reduce               -> expect
//      whatever is already stored, overriding the OS preference either way
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

const PORT = 5881
const OUT = resolve('playtest/out/2026-10-03-2-reduced-motion')
mkdirSync(OUT, { recursive: true })
const journal = []
function say(ev, data) {
  const line = { t: Date.now(), ev, ...data }
  journal.push(line)
  console.log(JSON.stringify(line))
}

function serve() {
  return new Promise((res, rej) => {
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
    ;(async () => {
      while (Date.now() < deadline) {
        try {
          const r = await fetch(url)
          if (r.ok) return res({ url, stop: () => process.kill(-child.pid, 'SIGTERM') })
        } catch {}
        await new Promise((r) => setTimeout(r, 250))
      }
      rej(new Error('vite never came up: ' + log))
    })()
  })
}

async function readBackdropKey(page) {
  return await page.evaluate(() => localStorage.getItem('abyss.backdrop'))
}

async function tap(page, label, view) {
  const all = await page.evaluate(() => window.__abyss.targets())
  const hit =
    all.find((t) => t.label === label) ??
    all.find((t) => t.label.startsWith(`${label}:`)) ??
    all.find((t) => t.label.includes(label))
  if (!hit) throw new Error(`no control '${label}', saw: ${all.map((t) => t.label).join(',')}`)
  const box = await page.locator('#stage').boundingBox()
  const x = box.x + (hit.x / view.width) * box.width
  const y = box.y + (hit.y / view.height) * box.height
  await page.mouse.click(x, y)
  await new Promise((r) => setTimeout(r, 120))
}

async function run(label, { profileDir, reducedMotion, view, url }) {
  const context = await chromium.launchPersistentContext(profileDir, {
    viewport: view,
    hasTouch: view.touch ?? false,
    deviceScaleFactor: 1,
    headless: true,
  })
  const page = await context.newPage()
  await page.emulateMedia({ reducedMotion })
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction('window.__abyss !== undefined', null, { timeout: 20000 })

  const keyBefore = await readBackdropKey(page)
  await page.screenshot({ path: join(OUT, `${label}-front-1.png`) })
  await new Promise((r) => setTimeout(r, 600))
  await page.screenshot({ path: join(OUT, `${label}-front-2.png`) })

  await tap(page, 'settings', view)
  await page.screenshot({ path: join(OUT, `${label}-settings.png`) })

  say('condition', { label, reducedMotion, keyBefore })
  await context.close()
}

const server = await serve()
try {
  const view = { width: 844, height: 390, touch: true }

  await run('A-fresh-reduce', {
    profileDir: mkdtempSync(join(tmpdir(), 'abyss-pt-A-')),
    reducedMotion: 'reduce',
    view,
    url: server.url,
  })

  await run('B-fresh-nopref', {
    profileDir: mkdtempSync(join(tmpdir(), 'abyss-pt-B-')),
    reducedMotion: 'no-preference',
    view,
    url: server.url,
  })

  await run('C-carried-reduce', {
    profileDir: resolve('playtest/profile'),
    reducedMotion: 'reduce',
    view,
    url: server.url,
  })
} finally {
  server.stop()
  writeFileSync(join(OUT, 'journal.jsonl'), journal.map((j) => JSON.stringify(j)).join('\n') + '\n')
}

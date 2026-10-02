// One-off: README's "Installable and offline" section promises the built PWA
// is "fully playable in airplane mode" once cached. Nothing has ever played
// that claim -- `pwacheck` only asserts on the manifest, the precache list and
// the service-worker source text (scripts/pwacheck.ts), never on a real
// browser with the network actually cut. And `playbot` can't stand in for it:
// the debug hook it reads (`window.__abyss`) is compiled out in production
// (src/main.ts:3122, `if (import.meta.env.PROD && ...)` guards the only place
// sw.js is registered at all), so this has to drive `dist/` through
// `vite preview`, not the dev server every other play script uses, and read
// the screen by eye rather than through the hook.
//
// Sequence, matching a real player: build already done by the session
// (`npm run build`), first visit online (installs the worker, no bounce --
// README says the first visit is excluded), reload (now controlled), then
// `context.setOffline(true)` and reload again with zero network at all.
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

const PORT = 5882
const OUT = resolve('playtest/out/2026-10-03-7-offline-pwa')
mkdirSync(OUT, { recursive: true })
const journal = []
function say(ev, data) {
  const line = { t: Date.now(), ev, ...data }
  journal.push(line)
  console.log(JSON.stringify(line))
}

function serve() {
  return new Promise((res, rej) => {
    const child = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
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
      rej(new Error('vite preview never came up: ' + log))
    })()
  })
}

const server = await serve()
const failedRequests = []
const consoleErrors = []
const pageErrors = []
try {
  const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'abyss-pt-offline-')), {
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    deviceScaleFactor: 2,
    headless: true,
  })
  const page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  page.on('requestfailed', (r) => failedRequests.push({ when: 'unmarked', url: r.url(), failure: r.failure()?.errorText }))

  // First visit: online, installs the service worker.
  await page.goto(server.url, { waitUntil: 'load' })
  const swState1 = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    return { hasReg: Boolean(reg), controller: Boolean(navigator.serviceWorker.controller) }
  })
  say('first-visit', swState1)
  await page.screenshot({ path: join(OUT, '1-first-visit.png') })

  // Give the worker time to finish its install/precache before relying on it.
  await page.waitForFunction(
    async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      return Boolean(reg?.active)
    },
    null,
    { timeout: 15000 },
  )
  say('sw-active', {})

  // Reload so this navigation is actually controlled by the worker.
  await page.reload({ waitUntil: 'load' })
  const swState2 = await page.evaluate(() => ({ controller: Boolean(navigator.serviceWorker.controller) }))
  say('second-visit-online', swState2)
  await page.screenshot({ path: join(OUT, '2-second-visit-controlled.png') })

  // Airplane mode.
  await context.setOffline(true)
  failedRequests.length = 0
  let reloadError = null
  try {
    await page.reload({ waitUntil: 'load', timeout: 15000 })
  } catch (e) {
    reloadError = String(e)
  }
  say('offline-reload', { reloadError, failedRequests: [...failedRequests] })
  await page.screenshot({ path: join(OUT, '3-offline-reload.png') })

  // Is the canvas actually drawing something, not just a blank/black frame?
  const canvasInfo = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    if (!c) return { present: false }
    const ctx = c.getContext('2d')
    const data = ctx.getImageData(0, 0, c.width, c.height).data
    let nonBlack = 0
    for (let i = 0; i < data.length; i += 4 * 97) {
      if (data[i] > 8 || data[i + 1] > 8 || data[i + 2] > 8) nonBlack++
    }
    return { present: true, width: c.width, height: c.height, sampledNonBlack: nonBlack }
  })
  say('canvas-offline', canvasInfo)

  // Try to actually press something offline -- tap where RAID reliably sits
  // on the front page at this viewport (no __abyss hook to ask in production,
  // so this is a coordinate guess informed by prior menus sessions' front-page
  // shots, not a targets() lookup).
  await page.mouse.click(195, 520)
  await new Promise((r) => setTimeout(r, 500))
  await page.screenshot({ path: join(OUT, '4-offline-after-tap.png') })

  say('errors', { consoleErrors: consoleErrors.slice(0, 20), pageErrors: pageErrors.slice(0, 20) })

  await context.close()
} finally {
  server.stop()
  writeFileSync(join(OUT, 'journal.jsonl'), journal.map((j) => JSON.stringify(j)).join('\n') + '\n')
}

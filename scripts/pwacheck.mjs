/**
 * Installable, and the second visit works with no network.
 *
 * The wiki said "a single-player game that runs offline, and the old
 * repository already had a `pwacheck`" — and then there was neither a manifest
 * nor a registration, because the 196 files deleted in the rebuild took the
 * old icons and worker with them.
 *
 * The real check is the last one: load the page, let the worker install, then
 * **cut the network** and load it again.  A manifest that parses proves
 * nothing about whether the game opens on a train.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { chromium } from 'playwright'

/**
 * Where to look, and it starts its own server if nobody says.
 *
 * The default used to be `http://localhost:4173/abyss/`, which is the address
 * **only CI serves**: `vite.config.ts` sets the base to `/abyss/` when
 * `GITHUB_ACTIONS` is on and to `/` otherwise, so a local preview answers
 * `/abyss/` with the SPA fallback — `index.html` for the page, `index.html`
 * for the manifest, and a JSON parser reporting `Unexpected token '<'`.  So
 * the one check in this repository about whether the game opens on a train
 * could not be run at the desk where the game is written, and a check that
 * does not run is not a check.
 *
 * So it serves itself.  `ABYSS_URL` is gone from this one — it was the whole
 * cause — and the base is read out of `dist/index.html` rather than guessed,
 * because the build has already decided it and written it down.  This check
 * needs a build and nothing else, which is why it can now live in
 * `check:slow` beside the others: every one of them needs a server and this
 * one brings its own.
 */
const base = (() => {
  const page = 'dist/index.html'
  if (!existsSync(page)) return '/'
  const m = /(?:src|href)="(\/[^"]*?)assets\//.exec(readFileSync(page, 'utf8'))
  return m ? m[1] : '/'
})()

if (!existsSync('dist/index.html')) {
  console.log('FAIL  there is a build to check   -> run `npm run build` first')
  process.exit(1)
}
const PORT = 4173
// Asked before starting rather than after: a busy port answers the first
// request at once, before `vite` has even tried to bind and given up.
const free = await new Promise((res) => {
  const probe = createServer()
  probe.once('error', () => res(false))
  probe.once('listening', () => probe.close(() => res(true)))
  probe.listen(PORT, '127.0.0.1')
})
if (!free) {
  console.log(`FAIL  there is a preview of this build to check   -> port ${PORT} `
    + 'is taken by something else; stop it and run again')
  process.exit(1)
}
// **Its own server, or none.**  Without `--strictPort` a busy 4173 moves the
// preview to 4174 in silence while this goes on asking 4173 — somebody else's
// server — and five checks fail about a manifest this build has.  And the
// server is a group: `npx` starts `vite`, and killing `npx` alone left the
// preview running after every run, which is exactly what then held 4173.
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: 'ignore', detached: true })
const HOST = `http://localhost:${PORT}${base}`
process.on('exit', () => {
  try { process.kill(-server.pid) } catch { /* already gone */ }
})
let bad = 0
const check = (what, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? `   -> ${detail}` : ''}`)
  if (!ok) bad++
}

// And wait for it to answer.
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(HOST)
    if (r.ok) break
  } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 500))
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 900, height: 640 } })
const page = await context.newPage()
await page.goto(HOST, { waitUntil: 'networkidle' })

const manifest = await page.evaluate(async () => {
  const link = document.querySelector('link[rel=manifest]')
  if (!link) return null
  const r = await fetch(link.href)
  return r.ok ? r.json() : null
})
check('there is a manifest and it names the game', !!manifest?.name,
  manifest ? `${manifest.name}, ${manifest.icons?.length ?? 0} icons, ` +
    `display ${manifest.display}` : 'no manifest')
check('and the icons a browser asks for are there',
  (manifest?.icons ?? []).some((i) => i.sizes === '192x192')
  && (manifest?.icons ?? []).some((i) => i.sizes === '512x512'),
  (manifest?.icons ?? []).map((i) => i.sizes).join(', '))

// The worker, and what it decided to keep.
await page.waitForFunction(
  () => navigator.serviceWorker && navigator.serviceWorker.controller !== undefined,
  null, { timeout: 20000 }).catch(() => {})
const worker = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return null
  // Wait for it to finish installing before asking what it cached.
  for (let i = 0; i < 40 && !(reg.active); i++)
    await new Promise((r) => setTimeout(r, 250))
  const names = await caches.keys()
  const cache = names.length ? await caches.open(names[0]) : null
  const keys = cache ? (await cache.keys()).map((r) => new URL(r.url).pathname) : []
  return { scope: reg.scope, caches: names, kept: keys.length,
    worlds: keys.filter((k) => k.includes('terrain')) }
})
check('a worker is installed and has kept the page', !!worker && worker.kept > 0,
  worker ? `${worker.kept} files in ${worker.caches[0]}` : 'no worker')
// One world, not two.  `dist` carries both; a visitor opens one.
check('and it kept one world rather than both',
  !!worker && worker.worlds.length > 0 && worker.worlds.length <= 2,
  worker ? worker.worlds.join(', ') : '')

// And now the part that matters.
await context.setOffline(true)
const offline = await context.newPage()
offline.on('requestfailed', (r) => console.log('      miss', new URL(r.url()).pathname))
offline.on('pageerror', (e) => console.log('      error', String(e).slice(0, 140)))
let opened = true
try {
  await offline.goto(HOST, { waitUntil: 'domcontentloaded', timeout: 15000 })
  await offline.waitForFunction(() => !!window.__hero, null, { timeout: 30000 })
} catch (e) {
  opened = false
  console.log('      ' + String(e).split('\n')[0].slice(0, 120))
}
check('and the game opens again with the network cut', opened,
  opened ? await offline.evaluate(() => JSON.stringify(window.__hero())) : '')

await browser.close()
console.log(bad ? `${bad} FAILED` : 'all checks passed')
process.exit(bad ? 1 : 0)

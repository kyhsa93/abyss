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
import { chromium } from 'playwright'

const HOST = process.env.ABYSS_URL ?? 'http://localhost:4173/abyss/'
let bad = 0
const check = (what, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? `   -> ${detail}` : ''}`)
  if (!ok) bad++
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

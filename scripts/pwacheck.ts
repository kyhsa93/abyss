import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, posix, relative, sep } from 'node:path'

/**
 * Validates the built PWA against dist.
 *
 * A broken manifest reference or a stale precache list does not throw at
 * runtime — the app simply stops being installable, or serves a version of
 * itself that no longer exists. Both fail silently, so they are checked here.
 */
const DIST = 'dist'

let failures = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `  -> ${detail}`}`)
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(relative(DIST, full).split(sep).join(posix.sep))
  }
  return out
}

const files = new Set(walk(DIST))
const html = readFileSync(join(DIST, 'index.html'), 'utf8')

// The base the build actually used, taken from the emitted script tag.
const scriptSrc = /<script[^>]+src="([^"]+)"/.exec(html)?.[1] ?? ''
const base = scriptSrc.slice(0, scriptSrc.indexOf('assets/'))
check('index.html references a hashed bundle', scriptSrc.includes('assets/'), scriptSrc)

// --- manifest ---------------------------------------------------------------
check('manifest is present', files.has('manifest.webmanifest'))
const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.webmanifest'), 'utf8'))

check('manifest has a name and short_name', Boolean(manifest.name && manifest.short_name))
check('manifest declares a display mode', Boolean(manifest.display))
check('manifest colors are set', Boolean(manifest.background_color && manifest.theme_color))

// Relative start_url/scope keep the app working under a project subpath.
for (const key of ['start_url', 'scope'] as const) {
  check(`manifest ${key} is relative`, !String(manifest[key] ?? '').startsWith('/'), String(manifest[key]))
}

const icons: Array<{ src: string; sizes: string; purpose?: string }> = manifest.icons ?? []
check('manifest lists icons', icons.length >= 2, String(icons.length))
for (const icon of icons) {
  check(`icon exists: ${icon.src}`, files.has(icon.src), [...files].join(', '))
}
check(
  'a maskable icon is provided',
  icons.some((i) => (i.purpose ?? '').includes('maskable')),
)
check(
  'a 512px icon is provided',
  icons.some((i) => i.sizes === '512x512'),
)

// --- html wiring ------------------------------------------------------------
for (const [label, pattern] of [
  ['manifest link', /<link[^>]+rel="manifest"[^>]+href="([^"]+)"/],
  ['apple touch icon', /<link[^>]+rel="apple-touch-icon"[^>]+href="([^"]+)"/],
  ['favicon', /<link[^>]+rel="icon"[^>]+href="([^"]+)"/],
] as const) {
  const href = pattern.exec(html)?.[1]
  check(`${label} is declared`, Boolean(href), 'missing')
  if (href) check(`${label} target exists`, files.has(href.replace(/^\.?\//, '')), href)
}
check('theme-color meta is set', /<meta[^>]+name="theme-color"/.test(html))

// --- service worker ---------------------------------------------------------
check('service worker is emitted', files.has('sw.js'))
const sw = readFileSync(join(DIST, 'sw.js'), 'utf8')

const cacheName = /const CACHE = '([^']+)'/.exec(sw)?.[1] ?? ''
check('cache name is versioned', /^abyss-[0-9a-f]{12}$/.test(cacheName), cacheName)

const listed: string[] = JSON.parse(/const ASSETS = (\[[\s\S]*?\])\n/.exec(sw)?.[1] ?? '[]')
check('precache list is not empty', listed.length > 0)

const expected = [...files].filter((f) => f !== 'sw.js').map((f) => base + f).sort()
const missing = expected.filter((f) => !listed.includes(f))
const extra = listed.filter((f) => !expected.includes(f))
check('precache covers every built file', missing.length === 0, missing.join(', '))
check('precache has no stale entries', extra.length === 0, extra.join(', '))

check('navigations are network-first', sw.includes('freshShell(request)'), 'shell served cache-first')
check('shell response is written back to cache', sw.includes('cache.put(SHELL'), 'no revalidation')

const shell = /const SHELL = "([^"]+)"/.exec(sw)?.[1] ?? ''
check('offline shell points at index.html', shell === `${base}index.html`, shell)
check('precache paths use the build base', listed.every((f) => f.startsWith(base)), base)

if (failures > 0) throw new Error(`${failures} PWA check(s) failed`)
console.log('all PWA checks passed')

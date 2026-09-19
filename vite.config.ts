import { createHash } from 'node:crypto'
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, posix, relative, sep } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

// GitHub Pages serves this project from /abyss/
const base = process.env.GITHUB_ACTIONS ? '/abyss/' : '/'

/**
 * Emits a service worker that precaches the built output.
 *
 * Written by hand rather than pulled from a plugin: the asset list is simply
 * whatever ended up in dist, and the cache name is a hash of that list, so a
 * build with different output automatically invalidates the old cache.
 */
function serviceWorker(): Plugin {
  return {
    name: 'abyss-service-worker',
    apply: 'build',
    closeBundle() {
      const dist = 'dist'
      const files: string[] = []

      const walk = (dir: string): void => {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry)
          if (statSync(full).isDirectory()) walk(full)
          else files.push(base + relative(dist, full).split(sep).join(posix.sep))
        }
      }
      walk(dist)

      const assets = files.filter((f) => !f.endsWith('sw.js')).sort()
      const version = createHash('sha1').update(assets.join('|')).digest('hex').slice(0, 12)
      writeFileSync(join(dist, 'sw.js'), source(version, assets, `${base}index.html`))
    },
  }
}

function source(version: string, assets: string[], shell: string): string {
  return `// Generated at build time. Do not edit.
const CACHE = 'abyss-${version}'
const ASSETS = ${JSON.stringify(assets, null, 2)}
const SHELL = ${JSON.stringify(shell)}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  if (new URL(request.url).origin !== self.location.origin) return

  // Navigations go to the network first so a fresh deploy is picked up on the
  // next launch rather than whenever the cache happens to be evicted. The
  // cached shell is the fallback, which is what keeps it working offline.
  if (request.mode === 'navigate') {
    event.respondWith(freshShell(request))
    return
  }

  // Everything else is content-hashed by the build, so a cache hit can never
  // be stale: a changed file has a different name.
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request)))
})

const SHELL_TIMEOUT = 3000

function freshShell(request) {
  return new Promise((resolve) => {
    let settled = false

    const fallback = () => {
      if (settled) return
      settled = true
      caches.match(SHELL).then((hit) => resolve(hit || fetch(request)))
    }

    // Do not let a slow network hold the game hostage.
    const timer = setTimeout(fallback, SHELL_TIMEOUT)

    fetch(request)
      .then((response) => {
        clearTimeout(timer)
        if (settled) return
        settled = true
        const copy = response.clone()
        caches.open(CACHE).then((cache) => cache.put(SHELL, copy))
        resolve(response)
      })
      .catch(() => {
        clearTimeout(timer)
        fallback()
      })
  })
}
`
}

export default defineConfig({
  base,
  build: { target: 'es2022' },
  plugins: [serviceWorker()],
})

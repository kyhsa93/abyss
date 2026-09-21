/**
 * Throwing the cached site away, for a fix that has shipped and cannot be seen.
 *
 * The worker precaches every built asset under a name that is a hash of the
 * asset list — see `serviceWorker` in `vite.config.ts` — so a new build gets a
 * new cache and the old one is dropped on activation. Until that swap happens
 * the old site *is* the site, and a player looking for a change that went out
 * an hour ago has no way to ask for it. This is that way.
 *
 * The order is the whole of it. A worker that is still registered will refill
 * a cache it has just lost on the next fetch, so it goes first; the caches go
 * second; the reload goes last, when there is nothing left to serve a stale
 * copy. Written out rather than trusted to run in order by accident.
 *
 * Everything is guarded rather than assumed: a browser without service workers
 * or without Cache Storage still gets the reload, which is the part that
 * matters most and the part that always works.
 */
export async function reloadFresh(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const workers = await navigator.serviceWorker.getRegistrations()
      await Promise.all(workers.map((worker) => worker.unregister()))
    }
  } catch {
    // A refused unregister is not a reason to keep the stale cache.
  }
  try {
    if ('caches' in globalThis) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
  } catch {
    // Same: whatever is left, the reload below is still worth taking.
  }
  location.reload()
}

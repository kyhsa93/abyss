// One-off Playwright script, not a .play file: playbot's own vite port is
// pid-derived (5200 + (pid + attempt*37) % 300) with no override, so there is
// no way to *ask* the vocabulary to land on a specific port. But a
// --profile playtest/profile session this evening happened to land on 5458
// and, instead of showing a raid-setup screen, resumed a mid-evening walk
// directly into a live fight (THE WEST CLIMB, paladin retribution, a 10-body
// party) -- days after the only session that ever walked that far
// (2026-09-25, the idle paladin:retribution West Climb stall). That is only
// possible if this port's origin's localStorage was never cleared between
// then and now, which is a sharper, worse shape of #273 than "never carries"
// -- it means a stale evening from days ago can silently resurface and put a
// player straight into a live fight, with no setup screen, whenever the
// pid-derived port happens to repeat. Reconnect to that exact origin (same
// profile dir, same port, served by a vite instance started by hand) and read
// window.__abyss without pressing anything, to confirm what is actually
// sitting there rather than guess from one screenshot.
import { chromium } from 'playwright'

const url = 'http://127.0.0.1:5458/'
const ctx = await chromium.launchPersistentContext('playtest/profile', {
  viewport: { width: 820, height: 1180 },
  hasTouch: true,
})
const page = ctx.pages()[0] ?? (await ctx.newPage())
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(1500)

const readSnap = () => {
  const a = window.__abyss
  const hud = a.hud()
  return {
    screen: a.screen(), mode: a.mode(), chamber: a.chamber(),
    heroPos: a.hero(),
    fallen: a.fallen(), foes: a.foes(),
    time: hud.time, tick: hud.tick, phase: hud.phase, outcome: hud.outcome,
    me: hud.me, boss: hud.boss,
  }
}

const snap1 = await page.evaluate(readSnap)
console.log('snap1', JSON.stringify(snap1))
await page.screenshot({ path: '/tmp/pt-24-reconnect-1.png' })

// Wait 20 real seconds and read again -- if the room, time and position are
// frozen despite the fight visibly running (party tokens animating on
// screen), that is fight-outlasted-its-budget's own signature, the same stall
// [[#6]]/#281 already tracks; if time and position move, this is a live,
// ordinary pull that merely happened to be mid-flight when resumed, not a
// second stall.
await page.waitForTimeout(20000)
const snap2 = await page.evaluate(readSnap)
console.log('snap2', JSON.stringify(snap2))
await page.screenshot({ path: '/tmp/pt-24-reconnect-2.png' })

// snap1/snap2 read the home screen's own backdrop pull (a fresh Bonegrinder,
// player's slot on AI) -- not proof either way about a saved run underneath
// it. Press RAID for real, the same button playbot's own tap hit, and see
// whether it opens a setup screen or drops straight into a live fight the
// way the earlier playbot invocation on this exact port did.
const raid = await page.evaluate(() => window.__abyss.probe(412, 420))
console.log('probe(412,420) =', raid)
await page.touchscreen.tap(412, 420)
await page.waitForTimeout(800)
const snap3 = await page.evaluate(readSnap)
console.log('snap3 (after tapping raid)', JSON.stringify(snap3))
await page.screenshot({ path: '/tmp/pt-24-reconnect-3.png' })

await ctx.close()

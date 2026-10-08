/**
 * The raid walking, stopped and at the door, photographed (#316).
 *
 * Whether a raid walks "with a gap between each of them" is a thing the eye
 * decides and the checks only bound: `dungeoncheck` holds the numbers and its
 * history says they are not enough (a column that passed every one of them was
 * still a column on the screen). So this plays the first hall of the building
 * in a real browser and writes the frames a person judges it from, for ten and
 * for twenty-five, at the default camera:
 *
 *   walking     the raid crossing the hall behind the player
 *   walk-1..4   and four more of it, half a second apart, so that what changes
 *               while it walks (who is in front, who is beside) can be seen to
 *   stopped-*   the same raid, as it stops: the moment, two seconds, eight
 *   door        gathered at the doorway out, where the hall's way on is
 *   passage     through it and a way up the passage
 *   coming-out  and back down it into the hall
 *   regathered  and stopped again
 *
 * Every frame a judgement is asked to be made from has to exist, or this
 * exits non-zero: a set that is short a shot is a set that cannot be judged,
 * and the shot that is quietly missing is always the one that mattered.
 *
 * It drives the dev server, because the hook it reads (`window.__abyss`) is
 * compiled out of a build -- see `src/main.ts` -- and it opens the second raid
 * size by writing the tier that unlocks it into the page's own storage first,
 * which is a thing a player earns and a driver is allowed to skip.
 *
 *   npm run spacingshots -- 25 390x844 /tmp/shots       # size, viewport, directory
 *   npm run spacingshots -- 10 1280x800 /tmp/shots
 */
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function serve(): Promise<{ url: string; stop(): void }> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const port = 5200 + ((process.pid + attempt * 37) % 300)
    // Its own process group: `npx vite` is a shell that starts the server as a
    // grandchild, and signalling the child alone leaves the port held.
    const child = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      detached: true,
    })
    let dead = false
    child.on('exit', () => (dead = true))
    const stop = (): void => {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, 'SIGTERM')
      } catch {
        // Already gone.
      }
    }
    const url = `http://127.0.0.1:${port}/`
    const deadline = Date.now() + 40_000
    while (Date.now() < deadline && !dead) {
      try {
        if ((await fetch(url)).ok) return { url, stop }
      } catch {
        // Not up yet.
      }
      await sleep(250)
    }
    stop()
  }
  throw new Error('no free port for vite between 5200 and 5500')
}

const [sizeArg = '10', viewArg = '1280x800', outArg = 'shots'] = process.argv.slice(2)
const [vw = 1280, vh = 800] = viewArg.split('x').map(Number)
const SIZE = sizeArg === '25' ? 1 : 0
mkdirSync(outArg, { recursive: true })

async function main(): Promise<void> {
  const server = await serve()
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 })
    await context.addInitScript(() => {
      try {
        if (!localStorage.getItem('abyss.tier')) localStorage.setItem('abyss.tier', '3')
      } catch {
        // No storage: the first size only.
      }
    })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto(server.url)
    await page.waitForFunction('window.__abyss !== undefined', null, { timeout: 30_000 })

    const ask = <T>(expr: string): Promise<T> => page.evaluate(`(() => window.__abyss.${expr})()`) as Promise<T>
    const hero = (): Promise<{ x: number; y: number }> => ask('hero()')
    const tap = async (label: string): Promise<void> => {
      const all = await ask<Array<{ label: string; x: number; y: number }>>('targets()')
      const hit = all.find((t) => t.label === label) ?? all.find((t) => t.label.startsWith(`${label}:`))
      if (!hit) throw new Error(`no control "${label}" on screen; saw ${all.map((t) => t.label).join(', ')}`)
      const box = (await page.locator('#stage').boundingBox())!
      const glass = (await page.evaluate('({ w: window.innerWidth, h: window.innerHeight })')) as { w: number; h: number }
      await page.mouse.click(box.x + (hit.x / glass.w) * box.width, box.y + (hit.y / glass.h) * box.height)
      await sleep(500)
    }
    const held = new Set<string>()
    const hold = async (keys: string[]): Promise<void> => {
      for (const k of keys) {
        if (held.has(k)) continue
        await page.keyboard.down(k)
        held.add(k)
      }
      for (const k of [...held]) {
        if (keys.includes(k)) continue
        await page.keyboard.up(k)
        held.delete(k)
      }
    }
    const taken: string[] = []
    type Body = { id: number; name: string; classId: string; leader: boolean; alive: boolean; x: number; y: number; sx: number; sy: number }
    const raid = (): Promise<Body[]> => ask<Body[]>('party()')
    /**
     * How tightly the raid stands, as the numbers the eye is judging: the pairs
     * under the overlap and under the door's line in the game's own units, the
     * nearest pair on the glass in pixels, and the tick it was read at.
     */
    const crowding = (bodies: Body[]): string => {
      const alive = bodies.filter((b) => b.alive)
      let under18 = 0
      let under27 = 0
      let under34 = 0
      let nearest = Infinity
      let nearestPx = Infinity
      const near: number[] = []
      for (let i = 0; i < alive.length; i++) {
        let mine = Infinity
        for (let j = 0; j < alive.length; j++) {
          if (i === j) continue
          const d = Math.hypot(alive[i]!.x - alive[j]!.x, alive[i]!.y - alive[j]!.y)
          mine = Math.min(mine, d)
          if (j < i) continue
          if (d < 18) under18++
          if (d < 27) under27++
          if (d < 34) under34++
          nearest = Math.min(nearest, d)
          nearestPx = Math.min(nearestPx, Math.hypot(alive[i]!.sx - alive[j]!.sx, alive[i]!.sy - alive[j]!.sy))
        }
        near.push(mine)
      }
      const pairs = (alive.length * (alive.length - 1)) / 2
      const mean = near.reduce((a, b) => a + b, 0) / Math.max(1, near.length)
      const alone = near.filter((d) => d >= 27).length
      return (
        `nearest ${nearest.toFixed(1)} (${nearestPx.toFixed(0)}px)  pairs <18 ${under18} <27 ${under27} (${((100 * under27) / pairs).toFixed(1)}%) <34 ${under34}` +
        `  mean nearest-neighbour ${mean.toFixed(1)}  bodies with a neighbour inside 27: ${alive.length - alone}/${alive.length}`
      )
    }
    const shot = async (name: string): Promise<void> => {
      const tick = (await ask<{ tick: number }>('hud()')).tick
      await page.screenshot({ path: `${outArg}/${name}.png` })
      taken.push(name)
      const at = await hero()
      const bodies = await raid()
      console.log(`${name.padEnd(14)} tick ${tick}  player at ${Math.round(at.x)},${Math.round(at.y)}  ${crowding(bodies)}`)
    }
    const steerTo = async (tx: number, ty: number, ms: number, until?: () => Promise<boolean>): Promise<void> => {
      const t0 = Date.now()
      for (;;) {
        const at = await hero()
        const dx = tx - at.x
        const dy = ty - at.y
        if (Math.hypot(dx, dy) < 8 || Date.now() - t0 > ms) break
        await hold(await ask<string[]>(`keysFor(${dx}, ${dy})`))
        if (until && (await until())) break
        await sleep(60)
      }
    }

    /**
     * Shots on a timetable while the player keeps walking between two points,
     * with two bodies picked out by their class in the log so that a person
     * looking at the pictures can find them (#316): which place in the raid
     * each is in, front to back along the way the leader is going, and where
     * on the glass. Nothing is drawn on the pictures.
     */
    const follow = async (prefix: string, every: number, count: number, a: { x: number; y: number }, b: { x: number; y: number }): Promise<void> => {
      const first = await raid()
      const lead = first.find((x) => x.leader)!
      const pick: Body[] = []
      for (const body of first) {
        if (body.leader || !body.alive) continue
        if (body.classId === lead.classId || pick.some((p) => p.classId === body.classId)) continue
        pick.push(body)
        if (pick.length === 2) break
      }
      console.log(`${prefix}: following ${pick.map((p) => `${p.name} (${p.classId}, id ${p.id})`).join(' and ')}; leader is ${lead.name} (${lead.classId})`)
      let toward = b
      const t0 = Date.now()
      let was = lead
      for (let k = 0; k < count; k++) {
        const until = t0 + k * every
        while (Date.now() < until) {
          const at = await hero()
          if (Math.hypot(toward.x - at.x, toward.y - at.y) < 40) toward = toward === b ? a : b
          await hold(await ask<string[]>(`keysFor(${toward.x - at.x}, ${toward.y - at.y})`))
          await sleep(Math.min(40, Math.max(1, until - Date.now())))
        }
        const now = await raid()
        const me = now.find((x) => x.leader)!
        // Front to back along the way the leader went since the last frame.
        const hx = me.x - was.x
        const hy = me.y - was.y
        const along = (x: Body): number => (hx * (x.x - me.x) + hy * (x.y - me.y)) / (Math.hypot(hx, hy) || 1)
        const order = [...now].filter((x) => x.alive).sort((p, q) => along(q) - along(p))
        const where = pick.map((p) => {
          const cur = now.find((x) => x.id === p.id)!
          return `${p.classId} ${order.findIndex((x) => x.id === p.id) + 1}/${order.length} at ${Math.round(cur.sx)},${Math.round(cur.sy)}`
        })
        was = me
        await shot(`${prefix}-${k + 1}`)
        console.log(`  ${prefix}-${k + 1} place from the front: ${where.join('; ')}`)
      }
    }

    // The raid, of the size asked for, with the first class on the list.
    await tap('raid')
    await tap('open:size')
    await tap(`choose:size:${SIZE}`)
    // Past the open list, to somewhere that is not one of its rows.
    await page.mouse.click(15, Math.round(vh * 0.78))
    await sleep(400)
    await tap('next')
    await tap('class:warrior:arms')
    await tap('pull')
    for (let i = 0; i < 40 && (await ask<string>('screen()')) !== 'fight'; i++) await sleep(250)
    await sleep(1500)
    const party = (await ask<{ party: number }>('hud()')).party
    console.log(`${party} in the raid, walking ${await ask<string>('mode()')} in ${await ask<string>('chamber()')}`)
    await shot('start')

    // Across the hall and back, the shot taken part way over with the player still going.
    await steerTo(-330, -108, 6000)
    await steerTo(330, -108, 8000, async () => (await hero()).x > -100)
    // The walk in sequence: the first, and four more at half-second marks on the
    // wall clock, the player still steering all the while.
    const marks: number[] = []
    const t0 = Date.now()
    for (let k = 0; k < 5; k++) {
      const until = t0 + k * 500
      while (Date.now() < until) {
        const at = await hero()
        await hold(await ask<string[]>(`keysFor(${330 - at.x}, ${-108 - at.y})`))
        await sleep(Math.min(40, Math.max(1, until - Date.now())))
      }
      const at = await hero()
      await hold(await ask<string[]>(`keysFor(${330 - at.x}, ${-108 - at.y})`))
      await shot(k === 0 ? 'walking' : `walk-${k}`)
      marks.push(Date.now() - t0)
    }
    console.log(`walk shots at ${marks.map((m) => `${(m / 1000).toFixed(2)}s`).join(' ')}`)
    await steerTo(330, -108, 8000)
    // Who is in front, a second at a time: eight seconds of walking back and
    // forth across the hall, a picture a second.
    await follow('order', 1000, 8, { x: -190, y: -108 }, { x: 190, y: -108 })
    await steerTo(330, -108, 8000)
    // Stopped, in the open: the leader lets go in the middle of the hall, part
    // way across and still walking, and there is a shot every half second for
    // two seconds (a body is slow to notice, and what a person is asked to see
    // is the raid moving off its neighbours, which one frame cannot show), and
    // one more at eight. The earlier version stopped against the far wall, a
    // second or more after the raid had already come to rest, and every frame
    // after that was the same frame.
    await steerTo(-190, -108, 9000)
    await steerTo(190, -108, 9000, async () => (await hero()).x > -20)
    await hold([])
    const stop = Date.now()
    for (let k = 0; k <= 4; k++) {
      await sleep(Math.max(0, stop + k * 500 - Date.now()))
      await shot(`stop-${(k * 0.5).toFixed(1)}s`)
    }
    await sleep(Math.max(0, stop + 8000 - Date.now()))
    await shot('stopped')
    console.log(`stopped shots at 0s .. 2.0s every half second, and ${((Date.now() - stop) / 1000).toFixed(1)}s (the last)`)

    // Stopping while the raid is bunched, which the sequence above cannot show
    // when it is already spread out. The leader goes to a wall, the raid piles
    // up behind it, and the leader turns and walks back through it; it lets go
    // the first moment five pairs are under thirty (or after six seconds if
    // that never comes), and the log says how bunched it was at that moment.
    const stopped = async (prefix: string): Promise<void> => {
      await hold([])
      const at = Date.now()
      for (let k = 0; k <= 4; k++) {
        await sleep(Math.max(0, at + k * 500 - Date.now()))
        await shot(`${prefix}-${(k * 0.5).toFixed(1)}s`)
      }
    }
    const crowded = async (): Promise<number> => {
      const alive = (await raid()).filter((b) => b.alive)
      let n = 0
      for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
          if (Math.hypot(alive[i]!.x - alive[j]!.x, alive[i]!.y - alive[j]!.y) < 30) n++
        }
      }
      return n
    }
    for (const [name, wall, back] of [['bunch-wall', { x: -190, y: -108 }, { x: 190, y: -108 }]] as const) {
      await steerTo(wall.x, wall.y, 9000)
      for (let i = 0; i < 30; i++) {
        await hold(await ask<string[]>(`keysFor(-1000, 0)`))
        await sleep(100)
      }
      const t0 = Date.now()
      let seen = await crowded()
      let peak = seen
      while (Date.now() - t0 < 6000 && seen < 5) {
        const at = await hero()
        await hold(await ask<string[]>(`keysFor(${back.x - at.x}, ${back.y - at.y})`))
        await sleep(60)
        seen = await crowded()
        peak = Math.max(peak, seen)
      }
      console.log(`${name}: let go with ${seen} pairs under 30 (the most seen on the way ${peak}), ${((Date.now() - t0) / 1000).toFixed(1)}s after turning`)
      await stopped(name)
    }

    // The door, where the hall's way on is.
    await steerTo(0, -214, 9000)
    await hold([])
    await sleep(300)
    await shot('door-0s')
    await sleep(5000)
    await shot('door')

    // A way up the passage and back out of it into the hall.
    await steerTo(0, -420, 9000)
    await sleep(200)
    await shot('passage')
    await steerTo(0, -150, 9000, async () => (await hero()).y > -170)
    await sleep(500)
    await shot('coming-out')
    await steerTo(0, -150, 9000)
    await sleep(250)
    await shot('coming-out-2')
    await hold([])
    await sleep(6000)
    await shot('regathered')

    if (errors.length > 0) {
      console.error(`the page threw: ${errors.join(' | ')}`)
      process.exitCode = 1
    }
    const need = ['order-1', 'order-8', 'bunch-wall-0.0s', 'bunch-wall-2.0s', 'walking', 'walk-1', 'walk-2', 'walk-3', 'walk-4', 'stop-0.0s', 'stop-0.5s', 'stop-1.0s', 'stop-1.5s', 'stop-2.0s', 'stopped', 'door', 'passage', 'coming-out']
    const missing = need.filter((n) => !taken.includes(n))
    if (missing.length > 0) {
      console.error(`the set is short of: ${missing.join(', ')}`)
      process.exitCode = 1
    }
  } finally {
    await browser.close()
    server.stop()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

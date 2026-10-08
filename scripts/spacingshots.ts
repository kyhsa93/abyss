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
    const shot = async (name: string): Promise<void> => {
      await page.screenshot({ path: `${outArg}/${name}.png` })
      taken.push(name)
      const at = await hero()
      console.log(`${name.padEnd(12)} player at ${Math.round(at.x)},${Math.round(at.y)}`)
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
    // Stopped: the moment the stick is let go, then two seconds and eight after
    // it, measured from there on the wall clock.
    await hold([])
    const stop = Date.now()
    await shot('stopped-0s')
    await sleep(Math.max(0, stop + 2000 - Date.now()))
    await shot('stopped-2s')
    await sleep(Math.max(0, stop + 8000 - Date.now()))
    await shot('stopped')
    console.log(`stopped shots at 0s, ${((Date.now() - stop) / 1000).toFixed(1)}s (the last)`)

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
    const need = ['walking', 'walk-1', 'walk-2', 'walk-3', 'walk-4', 'stopped-0s', 'stopped-2s', 'stopped', 'door', 'passage', 'coming-out']
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

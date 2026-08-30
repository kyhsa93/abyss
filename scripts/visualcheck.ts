/**
 * The game, in a real browser, looked at.
 *
 * `canvasrec` and `screenshot` both open by saying that this machine has no
 * libraries for a headless browser, so the render path could only ever be
 * judged by deploying it and squinting at a phone. That stopped being true:
 * the libraries are installed, and this drives the built game in Chromium.
 *
 * It does not replace the recorder. The recorder draws through the same
 * functions the browser calls and can therefore run without a build, in a
 * second, against code that has never shipped — that is why `rendercheck`
 * asserts through it. This one boots `dist/`, which is slower and needs a
 * build, and in exchange sees the things the recorder cannot: real fonts, the
 * compositor, the service worker, and whether the whole thing survives being
 * started at all.
 *
 * So it does two jobs.
 *
 * The assertion is that a real fight runs without the page throwing. Nothing
 * else here checks that — every other check imports modules directly, so a
 * fight that dies on boot, on a missing asset or on a browser API the code
 * assumed would pass all of them. That failure mode is exactly the one the
 * player meets first.
 *
 * The rest is a contact sheet. Frames are captured on the wall clock, so two
 * runs are close but not identical: the simulation is deterministic per tick,
 * the number of ticks inside a real second is not. Read these the way you read
 * `sprites.png` — to judge how something looks, not to diff.
 *
 *   npm run visualcheck                       # shots/ , portrait phone
 *   npm run visualcheck -- out 1280 800       # a directory and a viewport
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'

const DIST = resolve(process.cwd(), 'dist')

const [outArg, wArg, hArg] = process.argv.slice(2)
const OUT = resolve(process.cwd(), outArg ?? 'shots')
const VIEW = { width: Number(wArg) || 390, height: Number(hArg) || 844 }

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

/**
 * The build is a set of files and the game is a single page, so anything that
 * is not a file on disk is the page. Serving it from here rather than asking
 * for a running `vite preview` keeps this a check rather than a procedure.
 */
function serve(): Promise<{ port: number; close(): Promise<void> }> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    // normalize() collapses `..`, and the join keeps the result under dist.
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
    let path = join(DIST, rel)
    if (!existsSync(path) || statSync(path).isDirectory()) path = join(DIST, 'index.html')

    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' })
    createReadStream(path).pipe(res)
  })

  return new Promise((ok) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      ok({
        port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      })
    })
  })
}

/**
 * Every failure the page reports, with the frame it happened on.
 *
 * Collected rather than thrown so one broken boss does not hide the state of
 * the other four — the run finishes and reports all of it.
 */
const failures: string[] = []

function watch(page: Page, where: string): void {
  page.on('pageerror', (e) => failures.push(`${where}: ${e.message.split('\n')[0]}`))
  page.on('console', (m) => {
    if (m.type() === 'error') failures.push(`${where}: console ${m.text().slice(0, 160)}`)
  })
}

/** Every boss, since a boss is the thing most likely to draw something new. */
const BOSSES = ['warden', 'choir', 'tidebreaker', 'watcher', 'ledger']

/** Seconds into the pull to capture. Early is positioning, later is mechanics. */
const AT = [3, 9]

async function shoot(browser: Browser, url: string, name: string): Promise<void> {
  const context = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  watch(page, name)

  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: join(OUT, `${name}.png`) })

  await context.close()
}

async function fight(browser: Browser, base: string, boss: string): Promise<void> {
  const context = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  watch(page, boss)

  // The invite link lands on the roster with the fight already chosen, which
  // is steadier than tapping through a menu whose buttons move when it does.
  await page.goto(`${base}#b=${boss}&s=5&h=0`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: join(OUT, `${boss}-0-roster.png`) })

  // Bottom right is the one button that leaves this screen.
  await page.mouse.click(Math.round(VIEW.width * 0.66), Math.round(VIEW.height * 0.955))
  await page.waitForTimeout(1200)

  let elapsed = 1.2
  for (const at of AT) {
    await page.waitForTimeout(Math.max(0, (at - elapsed) * 1000))
    elapsed = at
    await page.screenshot({ path: join(OUT, `${boss}-${at}s.png`) })
  }

  await context.close()
}

async function main(): Promise<void> {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('no dist/index.html — run `npm run build` first')
    process.exit(1)
  }
  mkdirSync(OUT, { recursive: true })

  const server = await serve()
  const base = `http://127.0.0.1:${server.port}/`
  const browser = await chromium.launch()

  try {
    await shoot(browser, base, 'menu')
    for (const boss of BOSSES) await fight(browser, base, boss)
  } finally {
    await browser.close()
    await server.close()
  }

  const frames = 1 + BOSSES.length * (1 + AT.length)
  if (failures.length > 0) {
    for (const f of failures) console.error(`  ${f}`)
    console.error(`\nvisualcheck: ${failures.length} page failures`)
    process.exit(1)
  }
  console.log(`visualcheck: ${frames} frames in ${OUT}, no page errors`)
}

main()

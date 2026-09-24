/**
 * The game, played, by something that is not a person.
 *
 * `visualcheck` boots the game and photographs it; the harness runs the
 * simulation with no browser at all. Neither plays: one presses 66% across and
 * 95% down hoping that is still PULL, and the other never touches the input
 * path or a menu. So the whole half of this game a player actually meets --
 * eleven screens, a joystick, five buttons, a map, an evening that saves
 * itself -- has only ever been tested by the person who owns the repo, one
 * session at a time, on a phone.
 *
 * This runs a *play script*: a list of presses and waits, driven through a real
 * browser on the real input path, against a real dev server. It decides
 * nothing. It plays what it is told, records everything that happened, and
 * flags the handful of things a machine can call wrong without taste -- a
 * thrown error, a control that is not there, a fight that stopped advancing.
 * Whether a session was any *fun* is a judgement, and judgement is the caller's
 * job; see `docs/playtest.md`.
 *
 *   npm run playbot -- plans/a.play                 # a script, portrait phone
 *   npm run playbot -- plans/a.play --view 1280x800 # a desktop
 *   npm run playbot -- - < plans/a.play             # from a pipe
 *
 * Options:
 *   --view WxH[,touch]  viewport, and whether the browser reports a touchscreen
 *   --out DIR           where the journal and the shots go  (default: a temp dir)
 *   --profile DIR       persist localStorage between sessions, so unlocks carry
 *   --keep              leave the browser open at the end (for a human to look)
 *   --quiet             journal only, no transcript on stdout
 *
 * The hook it reads is off in a production build -- see `src/main.ts` -- which
 * is why this drives `vite` rather than `dist/`. That is not a compromise: the
 * thing being tested is the game's own code, and the dev server serves exactly
 * that.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright'

/**
 * Which finger is which.
 *
 * Fixed ids rather than counting up, because the stick has to keep the same one
 * for as long as it is held: `Input` tracks it by pointer id and a new id each
 * frame would be a new hand grabbing the stick sixty times a second.
 */
const STICK_FINGER = 1
const BAR_FINGER = 2

/* ------------------------------------------------------------------ options */

const argv = process.argv.slice(2)
function flag(name: string): string | null {
  const at = argv.indexOf(`--${name}`)
  return at === -1 ? null : (argv[at + 1] ?? '')
}
function has(name: string): boolean {
  return argv.includes(`--${name}`)
}

const SCRIPT_ARG = argv.find((a) => !a.startsWith('--')) ?? '-'
const VIEW_ARG = flag('view') ?? '390x844,touch'
const QUIET = has('quiet')
const KEEP = has('keep')

const [size, ...viewOpts] = VIEW_ARG.split(',')
const [vw, vh] = (size ?? '').split('x').map(Number)
const VIEW = { width: vw || 390, height: vh || 844 }
const TOUCH = viewOpts.includes('touch')

const OUT = resolve(flag('out') ?? mkdtempSync(join(tmpdir(), 'playbot-')))
mkdirSync(join(OUT, 'shots'), { recursive: true })
const JOURNAL = join(OUT, 'journal.jsonl')
const PROFILE = flag('profile')

/* ------------------------------------------------------------------ journal */

type Entry = Record<string, unknown> & { at: number; kind: string }

const entries: Entry[] = []
const started = Date.now()

/**
 * One line per thing that happened, and the same line on stdout.
 *
 * Both, rather than one: the file is what a later session re-reads to check
 * whether a fixed bug stayed fixed, and stdout is what the caller reads while
 * it is still deciding what to do next. A journal nobody reads at the time is
 * how a session spends twenty minutes after the game had already stopped.
 */
function say(kind: string, fields: Record<string, unknown> = {}): void {
  // The two fixed fields go on last so a caller's field cannot shadow them. A
  // `walkto` reporting where it ended up called that `at` and overwrote the
  // clock with a pair of coordinates -- in the file a later session parses.
  const e: Entry = { ...fields, at: Math.round((Date.now() - started) / 100) / 10, kind }
  entries.push(e)
  appendFileSync(JOURNAL, `${JSON.stringify(e)}\n`)
  if (QUIET) return
  const rest = Object.entries(fields)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' ')
  process.stdout.write(`${String(e.at).padStart(6)}s ${kind}${rest ? ` ${rest}` : ''}\n`)
}

/** Things that are wrong without anybody having to have an opinion. */
const faults: Entry[] = []
function fault(what: string, fields: Record<string, unknown> = {}): void {
  const e: Entry = {
    ...fields,
    at: Math.round((Date.now() - started) / 100) / 10,
    kind: `fault:${what}`,
  }
  faults.push(e)
  appendFileSync(JOURNAL, `${JSON.stringify(e)}\n`)
  if (!QUIET) process.stdout.write(`${String(e.at).padStart(6)}s FAULT ${what} ${JSON.stringify(fields)}\n`)
}

/* ------------------------------------------------------------------- server */

/**
 * The dev server, started here rather than assumed to be running.
 *
 * Assuming one is how a session silently tests whatever build happened to be
 * left on port 5173 that morning. `--strictPort` on a port derived from the pid
 * means two sessions cannot quietly share one server either.
 */
async function serve(): Promise<{ url: string; stop(): void }> {
  // Tried in turn rather than fixed. This runs once an hour for as long as the
  // machine is up, so "the port was busy" has to be something it walks around
  // rather than a session lost.
  for (let attempt = 0; attempt < 6; attempt++) {
    const port = 5200 + ((process.pid + attempt * 37) % 300)
    // Its own process group. `npx vite` is a shell that starts the real server
    // as a grandchild, so signalling the child alone leaves a node process and
    // a held port behind -- every hour, forever, which is how a long-running job
    // takes a machine down rather than a test.
    const child: ChildProcess = spawn(
      'npx',
      ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], detached: true },
    )
    let log = ''
    let dead = false
    child.stdout?.on('data', (b: Buffer) => (log += b.toString()))
    child.stderr?.on('data', (b: Buffer) => (log += b.toString()))
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
    let up = false
    while (Date.now() < deadline && !dead) {
      try {
        const res = await fetch(url)
        if (res.ok) {
          up = true
          break
        }
      } catch {
        // Not up yet.
      }
      await sleep(250)
    }
    if (up) {
      // So a killed session does not leave the server running either.
      for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
        process.on(sig, () => {
          stop()
          process.exit(1)
        })
      }
      return { url, stop }
    }
    stop()
    if (!log.includes('in use') && !dead) throw new Error(`vite did not come up on ${port}:\n${log}`)
  }
  throw new Error('no free port between 5200 and 5500')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/* --------------------------------------------------------------- the driver */

interface Target {
  label: string
  x: number
  y: number
  w: number
  h: number
}

/**
 * Everything the script can do, and nothing else.
 *
 * Deliberately small. Every command here is something a player does with a
 * finger or a key; there is no command that sets a variable in the game, moves
 * the party or chooses a seed. A driver that could stage a situation would
 * produce evidence about the staging.
 */
class Driver {
  private held = new Set<string>()

  constructor(
    readonly page: Page,
    readonly base: string,
    readonly cdp: CDPSession,
  ) {}

  /** What the page knows. Null while the hook is not installed yet. */
  async ask<T>(expr: string): Promise<T> {
    return (await this.page.evaluate(`(() => window.__abyss.${expr})()`)) as T
  }

  async open(hash: string): Promise<void> {
    await this.page.goto(this.base + hash, { waitUntil: 'load' })
    // The hook goes on at module evaluation, so it is there or the page is
    // broken; waiting on it beats a fixed sleep that is too short on a cold
    // dev server and wasted on a warm one.
    await this.page.waitForFunction('window.__abyss !== undefined', null, { timeout: 20_000 })
    say('open', { hash: hash || '/', ...(await this.where()) })
  }

  async where(): Promise<{ screen: string; mode: string; outcome: string }> {
    return {
      screen: await this.ask<string>('screen()'),
      mode: await this.ask<string>('mode()'),
      outcome: await this.ask<string>('outcome()'),
    }
  }

  async targets(): Promise<Target[]> {
    return await this.ask<Target[]>('targets()')
  }

  /**
   * Fingers, plural, which is the whole reason this is not `page.mouse`.
   *
   * A phone is played with two thumbs at once: one holds the stick and the other
   * presses the bar, and `Input` is built for exactly that -- it keys held
   * buttons by pointer id so a finger lifting off a button does not also drop the
   * stick. Playwright's mouse has one pointer, so driving a phone with it can
   * only ever steer *or* press, and a session that had to let go of the stick to
   * cast would be measuring the driver rather than the game.
   *
   * CDP takes the active set and diffs it against the last event, so every call
   * sends every finger still down and names only what moved.
   */
  private fingers = new Map<number, { x: number; y: number }>()

  private async touch(type: 'touchStart' | 'touchMove' | 'touchEnd'): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: [...this.fingers].map(([id, p]) => ({ x: p.x, y: p.y, id })),
    })
  }

  async fingerDown(id: number, x: number, y: number): Promise<void> {
    const p = await this.toPage(x, y)
    this.fingers.set(id, p)
    await this.touch('touchStart')
  }

  async fingerMove(id: number, x: number, y: number): Promise<void> {
    if (!this.fingers.has(id)) return
    this.fingers.set(id, await this.toPage(x, y))
    await this.touch('touchMove')
  }

  async fingerUp(id: number): Promise<void> {
    if (!this.fingers.delete(id)) return
    // The set sent is what is *still* down, which is what CDP diffs against.
    await this.touch('touchEnd')
  }

  /** Canvas coordinates -> the page point a click has to land on. */
  private async toPage(x: number, y: number): Promise<{ x: number; y: number }> {
    const box = await this.page.locator('#stage').boundingBox()
    if (!box) throw new Error('no canvas on the page')
    const logical = await this.page.evaluate('({ w: window.innerWidth, h: window.innerHeight })')
    const l = logical as { w: number; h: number }
    return { x: box.x + (x / l.w) * box.width, y: box.y + (y / l.h) * box.height }
  }

  /**
   * Press a named control.
   *
   * A label that is not on the screen is a fault rather than a thrown error:
   * the interesting sessions are the ones where the way forward is missing, and
   * a script that died at that line would never reach the part that says what
   * the player would do instead.
   */
  async tap(label: string): Promise<boolean> {
    const all = await this.targets()
    const hit =
      all.find((t) => t.label === label) ??
      all.find((t) => t.label.startsWith(`${label}:`)) ??
      all.find((t) => t.label.includes(label))
    if (!hit) {
      fault('no-such-control', { want: label, on: (await this.where()).screen, saw: all.map((t) => t.label) })
      return false
    }
    const p = await this.toPage(hit.x, hit.y)
    if (TOUCH) await this.page.touchscreen.tap(p.x, p.y)
    else await this.page.mouse.click(p.x, p.y)
    // One frame is enough: the press is consumed on the next `frame`, and a
    // longer wait here hid a screen change behind the following command.
    await sleep(80)
    say('tap', { label: hit.label, box: [Math.round(hit.w), Math.round(hit.h)], ...(await this.where()) })
    return true
  }

  async tapAt(x: number, y: number): Promise<void> {
    const p = await this.toPage(x, y)
    if (TOUCH) await this.page.touchscreen.tap(p.x, p.y)
    else await this.page.mouse.click(p.x, p.y)
    await sleep(80)
    say('tapxy', { x, y, ...(await this.where()) })
  }

  /**
   * A keypress -- which on a phone-shaped session is a mistake.
   *
   * `Input` turns the touch overlay off on any keydown, deliberately: a person
   * who reaches for the keyboard has stopped using their thumbs. The driver used
   * not to know that, so every phone session pressed `1` in its first second and
   * spent the rest of the fight on the desktop control scheme with a phone's
   * viewport -- the joystick, the touch ability bar and the autocast toggle were
   * never once played. Found by asking `ui` before and after a single keypress:
   * the minimap and the toggle were on the screen and then were not.
   */
  async key(k: string): Promise<void> {
    if (TOUCH && !this.warnedKey) {
      this.warnedKey = true
      say('keyboard-on-a-phone', {
        note: 'a keypress turns the touch overlay off for the rest of the session',
      })
    }
    await this.page.keyboard.press(k)
    await sleep(60)
  }

  private warnedKey = false
  private stickDown: { x: number; y: number } | null = null

  /**
   * Steer with the stick instead of the keys, which is how a phone is played.
   *
   * The stick relocates under whatever grabbed it, and it only answers on ground
   * no control has claimed -- so the press point is found by asking `probe`
   * where nothing is, rather than by assuming the stick lives in a corner it has
   * not lived in for several rounds.
   *
   * Pointer events, not touch events: the game has no `TouchEvent` listeners at
   * all, only pointer ones, and the single thing a mouse press does differently
   * is not set the touch flag -- which `hasTouch` has already set at boot. The
   * path being exercised is the one the thumb uses.
   */
  async stick(dx: number, dy: number): Promise<void> {
    const push = await this.ask<{ x: number; y: number }>(`push(${dx}, ${dy})`)
    if (push.x === 0 && push.y === 0) return await this.stickUp()

    if (this.stickDown === null) {
      const glass = (await this.page.evaluate('({ w: window.innerWidth, h: window.innerHeight })')) as {
        w: number
        h: number
      }
      // Centre first, so a full tilt in any direction stays on the glass.
      const tries = [
        { x: glass.w * 0.5, y: glass.h * 0.5 },
        { x: glass.w * 0.3, y: glass.h * 0.45 },
        { x: glass.w * 0.7, y: glass.h * 0.45 },
        { x: glass.w * 0.25, y: glass.h * 0.7 },
      ]
      let at: { x: number; y: number } | null = null
      for (const t of tries) {
        if ((await this.ask<string | null>(`probe(${t.x}, ${t.y})`)) === null) {
          at = t
          break
        }
      }
      if (at === null) {
        fault('nowhere-to-put-the-stick', { note: 'every candidate point was a control' })
        return
      }
      await this.fingerDown(STICK_FINGER, at.x, at.y)
      this.stickDown = at
    }

    // Past the clamp on purpose: the game holds the knob to the base ring, so
    // overshooting is full tilt rather than an out-of-range push.
    await this.fingerMove(STICK_FINGER, this.stickDown.x + push.x * 90, this.stickDown.y + push.y * 90)
  }

  async stickUp(): Promise<void> {
    if (this.stickDown === null) return
    await this.fingerUp(STICK_FINGER)
    this.stickDown = null
  }

  async hold(keys: string[]): Promise<void> {
    for (const k of keys) {
      if (this.held.has(k)) continue
      await this.page.keyboard.down(k)
      this.held.add(k)
    }
    for (const k of [...this.held]) {
      if (keys.includes(k)) continue
      await this.page.keyboard.up(k)
      this.held.delete(k)
    }
  }

  async release(): Promise<void> {
    await this.hold([])
    await this.stickUp()
  }

  /**
   * Steer, by whichever control this session's device actually has.
   *
   * One call rather than two at each site, because the interesting mistake is
   * forgetting which scheme is in play -- and it is the same mistake whichever
   * way round it is made.
   */
  async steer(dx: number, dy: number): Promise<void> {
    if (TOUCH) await this.stick(dx, dy)
    else await this.hold(await this.ask<string[]>(`keysFor(${dx}, ${dy})`))
  }

  /**
   * Press an ability: a thumb on the button, or the number key above it.
   *
   * The button positions are found once and kept. Looking them up per press
   * would be a grid walk of the whole screen several times a second, and the bar
   * does not move inside a fight -- it is laid out from the viewport, which is
   * fixed for the session. Nor is this journalled: a four-minute fight is a
   * thousand presses and the interesting number is the count, which `play`
   * already carries.
   */
  async ability(slot: number): Promise<void> {
    if (!TOUCH) {
      await this.page.keyboard.press(String(slot))
      await sleep(40)
      return
    }
    if (this.buttons.size === 0) {
      for (const t of await this.targets()) {
        const at = /^ability:(\d)$/.exec(t.label)
        if (at) this.buttons.set(Number(at[1]), { x: t.x, y: t.y })
      }
      if (this.buttons.size === 0) {
        fault('no-ability-bar', { on: (await this.where()).screen })
        this.buttons.set(-1, { x: 0, y: 0 })
        return
      }
    }
    const at = this.buttons.get(slot)
    if (!at) return
    // A second finger, and its own id: `Input` latches a held button per pointer,
    // so a thumb lifting off the bar must not be read as the one on the stick
    // letting go. This is the whole point of driving a phone through CDP.
    await this.fingerDown(BAR_FINGER, at.x, at.y)
    await this.fingerUp(BAR_FINGER)
    await sleep(40)
  }

  private buttons = new Map<number, { x: number; y: number }>()

  async shot(name: string): Promise<void> {
    const file = join(OUT, 'shots', `${name}.png`)
    await this.page.screenshot({ path: file })
    say('shot', { file, ...(await this.where()) })
  }

  /**
   * The screen's controls, measured.
   *
   * Whether a layout is any *good* is a judgement and stays one -- it is made by
   * looking at the shot next to this. But three things about a layout are facts,
   * and a session arguing about convenience with only a screenshot has to say
   * "looks small" where it could have said 24 by 24 against a floor of 44:
   *
   *   - how big each control is, against the 44px `touchcheck` holds the rest of
   *     the game to
   *   - which controls overlap, because two things under one thumb means the
   *     player gets whichever one the dispatch order happens to test first
   *   - which controls are partly off the glass, which is the bug that made the
   *     phone unplayable twice
   *
   * Finer grid than `targets`: the boxes come out of a grid walk, so the step is
   * the error bar, and 4px is close enough to argue about a 44px floor with.
   */
  async ui(): Promise<void> {
    const all = await this.ask<Target[]>('targets(4)')
    const glass = (await this.page.evaluate('({ w: window.innerWidth, h: window.innerHeight })')) as {
      w: number
      h: number
    }
    const small: string[] = []
    const off: string[] = []
    const over: string[] = []
    for (const t of all) {
      const l = t.x - t.w / 2
      const top = t.y - t.h / 2
      if (Math.min(t.w, t.h) < 44) small.push(`${t.label} ${Math.round(t.w)}x${Math.round(t.h)}`)
      if (l < 0 || top < 0 || l + t.w > glass.w || top + t.h > glass.h) {
        off.push(`${t.label} at ${Math.round(l)},${Math.round(top)}`)
      }
    }
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]!
        const b = all[j]!
        if (
          Math.abs(a.x - b.x) * 2 < a.w + b.w &&
          Math.abs(a.y - b.y) * 2 < a.h + b.h
        ) {
          over.push(`${a.label} / ${b.label}`)
        }
      }
    }
    say('ui', {
      on: (await this.where()).screen,
      glass: `${glass.w}x${glass.h}`,
      controls: all.length,
      list: all.map((t) => `${t.label} ${Math.round(t.w)}x${Math.round(t.h)} at ${Math.round(t.x - t.w / 2)},${Math.round(t.y - t.h / 2)}`),
      under44: small,
      offGlass: off,
      overlapping: over,
    })
    if (off.length > 0) fault('control-off-glass', { on: (await this.where()).screen, which: off })
  }
}

/* -------------------------------------------------------- playing the fight */

/**
 * How to behave once a fight is actually running.
 *
 * These exist because an LLM cannot play a real-time raid. A press has to land
 * inside a one-and-a-half second cast window and a decision costs seconds, so
 * the twitch has to be code and the *choice of code* is what varies. Each style
 * is a hypothesis about a player: the one who never moves, the one who never
 * stops moving, the one who does everything right. A fight that plays the same
 * under all of them is a fight that is not asking anything.
 */
type Style = 'idle' | 'mash' | 'dodge' | 'good' | 'wander' | 'melee' | 'flee' | 'auto'

const STYLES: Style[] = ['idle', 'mash', 'dodge', 'good', 'wander', 'melee', 'flee', 'auto']

interface Hud {
  time: number
  tick: number
  phase: number
  outcome: string
  auto: boolean
  alive: number
  party: number
  me: null | {
    hp: number
    maxHp: number
    alive: boolean
    bar: Array<{ slot: number; id: string; status: string }>
  }
  boss: null | { name: string; hp: number; maxHp: number }
}

async function play(d: Driver, style: Style, seconds: number, rng: () => number): Promise<void> {
  const until = Date.now() + seconds * 1000
  let lastTick = -1
  let stalledSince = Date.now()
  let pressed = 0
  let steps = 0
  let inDanger = 0
  let samples = 0
  let slot = 0

  // What the style actually turns out to be. `auto` cannot be played where the
  // toggle is not drawn -- there is no key for it -- and a session that spent
  // four minutes not playing would be a session wasted on a thing already
  // known, so it says so and plays properly instead.
  let acting: Style = style
  if (style === 'auto') {
    const before = await d.ask<Hud>('hud()')
    if (!before.auto && !(await d.tap('auto'))) {
      say('no-autocast-toggle', { note: 'no toggle on screen and no key for it -- playing good instead' })
      acting = 'good'
    }
  }

  while (Date.now() < until) {
    const hud = await d.ask<Hud>('hud()')
    const hero = await d.ask<{ x: number; y: number } | null>('hero()')
    samples++

    if (hud.outcome !== 'ongoing') {
      say('fight-over', { outcome: hud.outcome, time: Math.round(hud.time), phase: hud.phase })
      break
    }
    if (!Number.isFinite(hero?.x ?? NaN) || !Number.isFinite(hud.me?.hp ?? NaN)) {
      fault('not-a-number', { hero, hp: hud.me?.hp })
      break
    }
    // A fight that has stopped advancing while it still says it is ongoing is
    // the one softlock a machine can call on its own.
    if (hud.tick !== lastTick) {
      lastTick = hud.tick
      stalledSince = Date.now()
    } else if (Date.now() - stalledSince > 5000) {
      fault('fight-stalled', { tick: hud.tick, seconds: 5 })
      break
    }

    const ground = await d.ask<Array<{ kind: string; x: number; y: number; r: number; telegraph: number; detonated: boolean }>>('ground()')
    const standing = hero
      ? ground.filter((g) => Math.hypot(g.x - hero.x, g.y - hero.y) <= g.r)
      : []
    if (standing.length > 0) inDanger++

    // Where to go, in world units, per style.
    let want: { x: number; y: number } | null = null
    const foes = await d.ask<Array<{ x: number; y: number; name: string }>>('foesAt()')
    // The nearest, not the first. `foesAt` is in whatever order the actor list
    // is, so on a trash pull the first entry can be a body across the room and
    // `melee` would walk past the thing hitting it.
    const boss = hero
      ? (foes
          .slice()
          .sort(
            (a, b) =>
              Math.hypot(a.x - hero.x, a.y - hero.y) - Math.hypot(b.x - hero.x, b.y - hero.y),
          )[0] ?? null)
      : (foes[0] ?? null)

    if (hero) {
      if (acting === 'dodge' || acting === 'good') {
        // Straight out of the nearest thing standing on, and nowhere otherwise:
        // a bot that keeps walking cancels its own casts, which is a bug this
        // repo has already shipped once.
        const worst = standing[0]
        if (worst) want = { x: hero.x - worst.x, y: hero.y - worst.y }
        else if (acting === 'good' && boss) {
          const far = Math.hypot(boss.x - hero.x, boss.y - hero.y)
          if (far > 24) want = { x: boss.x - hero.x, y: boss.y - hero.y }
        }
      } else if (acting === 'melee' && boss) {
        const far = Math.hypot(boss.x - hero.x, boss.y - hero.y)
        if (far > 4) want = { x: boss.x - hero.x, y: boss.y - hero.y }
      } else if (acting === 'wander') {
        if (steps % 12 === 0) want = { x: rng() * 2 - 1, y: rng() * 2 - 1 }
        else want = null
      } else if (acting === 'flee' && boss) {
        want = { x: hero.x - boss.x, y: hero.y - boss.y }
      }
    }

    if (want) {
      await d.steer(want.x, want.y)
      steps++
    } else if (acting !== 'wander') {
      await d.release()
    }

    if (acting === 'mash' || acting === 'wander') {
      // Round-robin rather than the first ready one: pressing slot 1 forever is
      // a rotation, and a rotation is not what these styles are for.
      slot = (slot % 5) + 1
      await d.ability(slot)
      pressed++
    } else if (acting === 'good' || acting === 'melee') {
      const ready = hud.me?.bar.find((b) => b.status === 'ready')
      if (ready) {
        await d.ability(ready.slot)
        pressed++
      }
    }

    await sleep(acting === 'idle' ? 400 : 160)
  }

  await d.release()
  const end = await d.ask<Hud>('hud()')
  say('played', {
    style: acting === style ? style : `${style}->${acting}`,
    seconds: Math.round((seconds * 1000 - Math.max(0, until - Date.now())) / 1000),
    outcome: end.outcome,
    fightTime: Math.round(end.time),
    phase: end.phase,
    aliveParty: `${end.alive}/${end.party}`,
    heroHp: end.me ? `${end.me.hp}/${end.me.maxHp}` : 'gone',
    bossHp: end.boss ? `${Math.round((end.boss.hp / end.boss.maxHp) * 100)}%` : 'down',
    presses: pressed,
    // The share of samples spent standing in something that hurts. The one
    // number that says whether a style actually played differently.
    inDanger: samples ? `${Math.round((inDanger / samples) * 100)}%` : 'n/a',
  })
}

/* ---------------------------------------------------------------- the script */

/**
 * A tiny line-based language, on purpose.
 *
 * The caller is an LLM writing a file, and every construct it could get subtly
 * wrong is a session spent debugging the script instead of the game. So: one
 * command per line, no nesting, no variables. `waitscreen` and `waitfight` are
 * the only control flow, because the two things worth waiting for are a screen
 * arriving and a fight ending.
 */
async function run(d: Driver, lines: string[], rng: () => number): Promise<void> {
  for (const raw of lines) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const [cmd, ...rest] = line.split(/\s+/)
    const arg = rest.join(' ')

    switch (cmd) {
      case 'open':
        await d.open(rest[0] ?? '')
        break
      case 'note':
        say('note', { text: arg })
        break
      case 'wait':
        await sleep(Number(rest[0] ?? 1) * 1000)
        break
      case 'tap':
        await d.tap(arg)
        break
      case 'tapxy':
        await d.tapAt(Number(rest[0]), Number(rest[1]))
        break
      case 'key':
        await d.key(arg)
        say('key', { key: arg, ...(await d.where()) })
        break
      case 'shot':
        await d.shot(rest[0] ?? `shot-${Date.now()}`)
        break
      case 'targets':
        say('targets', { on: (await d.where()).screen, list: (await d.targets()).map((t) => `${t.label}@${Math.round(t.x)},${Math.round(t.y)} ${Math.round(t.w)}x${Math.round(t.h)}`) })
        break
      case 'ui':
        await d.ui()
        break
      // Walking somewhere on purpose, which `play` cannot express: its styles
      // all steer relative to something that is hitting you. Getting onto a
      // teleporter, through a door, or into the corner of a room to see whether
      // the floor is drawn there is a destination, and every one of those has
      // been a bug in this repository.
      case 'walkto': {
        const tx = Number(rest[0])
        const ty = Number(rest[1])
        const secs = Number(rest[2] ?? 15)
        const deadline = Date.now() + secs * 1000
        let near = Infinity
        let hero = await d.ask<{ x: number; y: number } | null>('hero()')
        while (Date.now() < deadline && hero !== null) {
          const far = Math.hypot(tx - hero.x, ty - hero.y)
          near = Math.min(near, far)
          if (far <= 2) break
          await d.steer(tx - hero.x, ty - hero.y)
          await sleep(120)
          hero = await d.ask<{ x: number; y: number } | null>('hero()')
        }
        await d.release()
        say('walkto', {
          want: [tx, ty],
          landed: hero ? [Math.round(hero.x), Math.round(hero.y)] : null,
          // How close it ever got, which is the number that says whether
          // something was in the way rather than whether the walk was slow.
          closest: Math.round(near),
          ...(await d.where()),
        })
        if (near > 2) fault('could-not-walk-there', { want: [tx, ty], closest: Math.round(near) })
        break
      }
      case 'letgo':
        await d.release()
        break
      case 'state':
        say('state', { ...(await d.where()), chamber: await d.ask('chamber()'), hud: await d.ask('hud()') })
        break
      case 'says':
        say('says', { lines: await d.ask('says(20)') })
        break
      case 'waitscreen': {
        const want = rest[0] ?? 'home'
        const secs = Number(rest[1] ?? 20)
        const deadline = Date.now() + secs * 1000
        for (;;) {
          if ((await d.ask<string>('screen()')) === want) break
          if (Date.now() > deadline) {
            fault('screen-never-came', { want, saw: await d.where(), seconds: secs })
            break
          }
          await sleep(200)
        }
        say('waitscreen', { want, ...(await d.where()) })
        break
      }
      case 'play':
        await play(d, (rest[0] as Style) ?? 'good', Number(rest[1] ?? 60), rng)
        break
      default:
        fault('bad-command', { line })
    }
  }
}

/* ------------------------------------------------------------------- session */

async function main(): Promise<void> {
  const text =
    SCRIPT_ARG === '-' ? readFileSync(0, 'utf8') : readFileSync(resolve(SCRIPT_ARG), 'utf8')

  const server = await serve()
  let browser: Browser | null = null
  let context: BrowserContext | null = null

  // A seed in the journal, so a session that found something can be run again.
  const seed = Number(flag('seed') ?? Date.now() % 1_000_000)
  let s = seed >>> 0
  const rng = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }

  say('session', { out: OUT, view: `${VIEW.width}x${VIEW.height}`, touch: TOUCH, seed, url: server.url })

  try {
    const opts = { viewport: VIEW, hasTouch: TOUCH, deviceScaleFactor: 1 }
    if (PROFILE) {
      context = await chromium.launchPersistentContext(resolve(PROFILE), { ...opts, headless: !KEEP })
    } else {
      browser = await chromium.launch({ headless: !KEEP })
      context = await browser.newContext(opts)
    }
    const page = await context.newPage()

    // Anything the page says went wrong. Collected rather than thrown: one
    // broken sprite must not end a session that had forty more minutes of game
    // left to play.
    page.on('pageerror', (e) => fault('page-threw', { message: e.message.split('\n')[0] }))
    page.on('console', (m) => {
      if (m.type() === 'error') fault('console-error', { text: m.text().slice(0, 300) })
    })
    page.on('requestfailed', (r) => {
      const why = r.failure()?.errorText ?? ''
      // Aborts are the page cancelling its own work, not a failure.
      if (!why.includes('ABORTED')) fault('request-failed', { url: r.url().split('/').pop(), why })
    })

    const d = new Driver(page, server.url, await context.newCDPSession(page))
    await run(d, text.split('\n'), rng)
  } catch (e) {
    fault('driver-threw', { message: e instanceof Error ? e.message.split('\n')[0] : String(e) })
  } finally {
    if (KEEP) {
      process.stdout.write(`\nbrowser left open at ${server.url} -- ctrl-c to finish\n`)
      await sleep(600_000)
    }
    await context?.close()
    await browser?.close()
    server.stop()
  }

  const summary = {
    out: OUT,
    seed,
    view: `${VIEW.width}x${VIEW.height}${TOUCH ? ',touch' : ''}`,
    entries: entries.length,
    faults: faults.length,
  }
  writeFileSync(join(OUT, 'summary.json'), `${JSON.stringify({ ...summary, faults }, null, 2)}\n`)
  process.stdout.write(`\n${faults.length} faults, ${entries.length} entries -- ${OUT}\n`)
  for (const f of faults) process.stdout.write(`  ${f.kind} ${JSON.stringify({ ...f, kind: undefined, at: undefined })}\n`)
  // A fault is a finding, not a broken run: the caller decides what it means.
  process.exit(0)
}

export { STYLES }

void main()

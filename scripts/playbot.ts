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
 * `at` and `kind` belong to the journal, and a caller that uses one loses data.
 *
 * Twice now. A `walkto` called the place it ended up `at` and overwrote the
 * clock; the fix put the clock last, and then an `evening` called the room it was
 * in `at` and the clock overwrote the room. Picking a winner was the wrong fix
 * either way -- one of the two values was always quietly gone. So the clash is
 * renamed and reported, and nothing is lost while somebody gets round to it.
 */
function keep(fields: Record<string, unknown>): Record<string, unknown> {
  let clash = false
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'at' || k === 'kind') {
      out[`${k}_`] = v
      clash = true
    } else out[k] = v
  }
  if (clash) out.journalKeyClash = true
  return out
}

/**
 * One line per thing that happened, and the same line on stdout.
 *
 * Both, rather than one: the file is what a later session re-reads to check
 * whether a fixed bug stayed fixed, and stdout is what the caller reads while
 * it is still deciding what to do next. A journal nobody reads at the time is
 * how a session spends twenty minutes after the game had already stopped.
 */
function say(kind: string, fields: Record<string, unknown> = {}): void {
  const e: Entry = { ...keep(fields), at: Math.round((Date.now() - started) / 100) / 10, kind }
  entries.push(e)
  appendFileSync(JOURNAL, `${JSON.stringify(e)}\n`)
  if (QUIET) return
  const rest = Object.entries(fields)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' ')
  process.stdout.write(`${String(e.at).padStart(6)}s ${kind}${rest ? ` ${rest}` : ''}\n`)
}

/**
 * Things that are wrong without anybody having to have an opinion.
 *
 * Deduplicated by what they are, because they repeat. One ladder produced a
 * hundred and twenty-nine identical lines -- the dev server's own reload socket
 * retrying -- and the four findings in that run were somewhere inside them. A
 * fault that has been reported keeps its count and stops printing.
 */
const faults: Entry[] = []
const faultSeen = new Map<string, number>()

function fault(what: string, fields: Record<string, unknown> = {}): void {
  const same = `${what} ${JSON.stringify(fields)}`
  const before = faultSeen.get(same) ?? 0
  faultSeen.set(same, before + 1)
  if (before > 0) {
    // Counted, not printed. The tally goes out with the summary at the end.
    return
  }
  record(what, fields)
}

function record(what: string, fields: Record<string, unknown> = {}): void {
  const e: Entry = {
    ...keep(fields),
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

  private async touch(
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    points: Array<{ x: number; y: number; id: number }>,
  ): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points })
  }

  private active(): Array<{ x: number; y: number; id: number }> {
    return [...this.fingers].map(([id, p]) => ({ x: p.x, y: p.y, id }))
  }

  async fingerDown(id: number, x: number, y: number): Promise<void> {
    const p = await this.toPage(x, y)
    this.fingers.set(id, p)
    await this.touch('touchStart', this.active())
  }

  async fingerMove(id: number, x: number, y: number): Promise<void> {
    if (!this.fingers.has(id)) return
    this.fingers.set(id, await this.toPage(x, y))
    await this.touch('touchMove', this.active())
  }

  /**
   * Lift one finger.
   *
   * The set sent with a `touchEnd` is the point that **ended**, not the ones still
   * down -- Playwright's own tap ends with an empty list, which only makes sense
   * that way round. Sending the survivors instead told Chromium the stick had been
   * let go every time the other thumb pressed a button, so a walk that pressed ten
   * abilities in three seconds covered fifteen yards in a hundred and fifty and
   * looked for all the world like a corridor that could not be crossed.
   */
  async fingerUp(id: number): Promise<void> {
    const was = this.fingers.get(id)
    if (was === undefined) return
    this.fingers.delete(id)
    await this.touch('touchEnd', [{ x: was.x, y: was.y, id }])
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

  /**
   * Out of a fight and back to the party screen, by the route this device has.
   *
   * Not just `tap party`. The corner buttons hide themselves a few seconds after
   * the fight starts, and on a phone the thing that brings them back is the
   * minimap -- which is the game's own design and not a workaround. A ladder that
   * tapped `party` and gave up when it was not there reported that there was no
   * way out of a fight there plainly is a way out of.
   */
  async leaveFight(): Promise<boolean> {
    const here = (await this.targets()).map((t) => t.label)
    if (here.includes('party')) return await this.tap('party')
    if (TOUCH) {
      if (!(await this.tap('minimap'))) return false
      return await this.tap('party')
    }
    // No keyboard cost on a device that has one: escape is the documented way.
    await this.page.keyboard.press('Escape')
    await sleep(120)
    return (await this.ask<string>('screen()')) === 'roster'
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
type Style =
  | 'idle'
  | 'mash'
  | 'dodge'
  | 'good'
  | 'wander'
  | 'melee'
  | 'flee'
  | 'auto'
  | 'learn'

const STYLES: Style[] = ['idle', 'mash', 'dodge', 'good', 'wander', 'melee', 'flee', 'auto', 'learn']

/**
 * What a player has worked out so far -- and nothing they could not have.
 *
 * The other styles are fixed, which is the honest limit of driving a real-time
 * fight from code: `good` plays the ninth pull exactly as it played the first.
 * But the README's third law says the thing that improves between attempts is
 * *you*, and learning the fight is the whole genre -- so the one claim this game
 * makes that no check touches is that it can be learned at all. Something has to
 * try to learn it.
 *
 * The rule that makes this evidence rather than an oracle: **it may only learn
 * from what a player can see.** A patch is respected once it has actually taken
 * health off, never because the driver could read its radius out of the
 * simulation. So the first pull walks into everything, exactly like somebody's
 * first pull, and what it knows by the ninth is only what the fight taught it.
 *
 * A flat curve therefore means one of two things, and they are different
 * findings: the fight has nothing to teach, or it has something to teach and no
 * way to teach it -- a mechanic whose telegraph does not predict its damage
 * cannot be learned by anybody. `byMechanic` in the tally names which.
 */
interface Lesson {
  /** How many times this kind has taken health off, ever. */
  burned: number
  /** How many at the current answer -- what says the answer has stopped working. */
  since: number
  /**
   * Which answer is being tried. Not a tuned number: the three are the answers a
   * player actually has, in the order a player finds them.
   *
   *   0  nothing known -- move only once it has already gone off
   *   1  leave during the telegraph, earlier with each burn
   *   2  stop standing still while this is on the field
   *
   * Two answers matter because one is not enough, and finding that out is what
   * the first run of this ladder did: `coldflame` burned the learner fifty-four
   * times on a single pull and a hundred and eighty-five across four, while its
   * lead sat at the two-second ceiling the whole time. Leaving earlier is simply
   * not the answer to something that follows you -- a lesson this repository had
   * already written down about its own AI and had not applied to a driver.
   */
  answer: 0 | 1 | 2
  /** Seconds of telegraph it now leaves itself, at answer 1 and above. */
  lead: number
}

interface Learned {
  kinds: Map<string, Lesson>
  /**
   * Things the game said just before health came off, and how long to stay away
   * from the boss afterwards.
   *
   * Not every mechanic is a patch on the floor. The first boss's worst one --
   * `bonestorm`, top of the bill on every pull of the first ladder ever run --
   * is an aura on the boss that hurts everything near it while the boss wanders,
   * so it never appears in `ground()` and a learner watching only the floor is
   * blind to the thing actually killing it.
   *
   * What a player has instead is the shout. The boss says a line when the storm
   * starts, and the lesson a person takes is "when it says *that*, get out". So
   * that is the lesson here: the line that was on screen when the damage started
   * becomes a cue, and a cue that has burned us buys seconds of distance.
   *
   * This makes the ladder measure something better than a curve. If a fight's
   * announcements come early enough to act on, the cue works and the curve bends.
   * If they do not, no player could have learned it either, and the flat curve is
   * about the game rather than about the learner.
   */
  cues: Map<string, { burned: number; seconds: number }>
}

function nothingLearntYet(): Learned {
  return { kinds: new Map(), cues: new Map() }
}

/** A cue is worth a second and a half of standing off, up to a sensible ceiling. */
function cued(learned: Learned, line: string): void {
  const was = learned.cues.get(line) ?? { burned: 0, seconds: 0 }
  learned.cues.set(line, {
    burned: was.burned + 1,
    seconds: Math.min(6, (was.burned + 1) * 1.5),
  })
}

/**
 * One more burn, and possibly one more idea about what to do instead.
 *
 * Escalation is what makes this a model of learning rather than a tuned
 * constant: the answer changes when the current answer demonstrably is not
 * working, and "not working" is measured the only way a player could measure it
 * -- still being hit.
 */
function burnt(learned: Learned, kind: string): void {
  const was = learned.kinds.get(kind) ?? { burned: 0, since: 0, answer: 0 as const, lead: 0 }
  const burned = was.burned + 1
  const since = was.since + 1

  if (was.answer === 0) {
    // First burn: now it is known to hurt, and leaving early is the obvious try.
    learned.kinds.set(kind, { burned, since: 0, answer: 1, lead: 0.5 })
    return
  }
  if (was.answer === 1) {
    if (was.lead < 2) {
      learned.kinds.set(kind, { burned, since, answer: 1, lead: Math.min(2, was.lead + 0.5) })
      return
    }
    // Out of lead and still being hit: the answer is wrong, not too slow.
    if (since >= 8) {
      learned.kinds.set(kind, { burned, since: 0, answer: 2, lead: 2 })
      return
    }
  }
  learned.kinds.set(kind, { ...was, burned, since })
}

function shows(learned: Learned): string {
  const floor = [...learned.kinds].map(
    ([k, v]) => `${k}:${v.burned}burns/answer${v.answer}${v.answer >= 1 ? `/${v.lead}s` : ''}`,
  )
  const heard = [...learned.cues].map(([line, v]) => `"${line}":${v.burned}burns/${v.seconds}s away`)
  return [...floor, ...heard].join(' ') || 'nothing'
}

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
  boss: null | { name: string; hp: number; maxHp: number; x: number; y: number }
}

async function play(
  d: Driver,
  style: Style,
  seconds: number,
  rng: () => number,
  /** Carried between pulls by `ladder`; a single `play` starts knowing nothing. */
  learned: Learned = nothingLearntYet(),
  /**
   * Whether this `play` owns the feet.
   *
   * `cross` steers at a door and then calls in here for the presses, and every
   * style with nothing to dodge answers by letting go of the stick -- so the two
   * fought each other, eighteen times a second, and the party covered fifteen
   * yards in a hundred and fifty. Whoever is steering says so.
   */
  steers = true,
): Promise<void> {
  const until = Date.now() + seconds * 1000
  let lastTick = -1
  let stalledSince = Date.now()
  let pressed = 0
  let steps = 0
  let inDanger = 0
  let samples = 0
  let slot = 0
  // For spotting a burn: health at the previous sample, and what we were
  // standing in at the time. A patch is only credited with hurting us if we were
  // in it when the health went down.
  let lastHp: number | null = null
  let wasIn: string[] = []
  const burns: string[] = []
  // The last thing anybody said, and when. A burn with nothing underfoot is
  // blamed on the shout that was on screen when it happened -- which is exactly
  // what a person does, right or wrong.
  let lastLine = ''
  let heardAt = 0
  let standOffUntil = 0
  let bossName = ''

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

    // Being hurt while standing in something is the only way the learner is
    // allowed to find out that the something hurts. Checked before the move is
    // decided, so a lesson counts from the next tick rather than the next pull.
    const hp = hud.me?.hp ?? null
    if (acting === 'learn') {
      // Only what the *boss* said. The chat is one stream and the party talks in
      // it -- the first ladder to learn from lines came away believing "Moving!"
      // was a mechanic and ran from the boss thirty times because a healer had
      // said it. A person filters by who is speaking without noticing they do.
      if (hud.boss?.name) bossName = hud.boss.name
      const said = await d.ask<Array<{ speaker: string; text: string }>>('says(4)')
      const fromBoss = said.filter((c) => c.speaker === bossName)
      const newest = fromBoss[fromBoss.length - 1]?.text ?? ''
      if (newest !== '' && newest !== lastLine) {
        lastLine = newest
        heardAt = Date.now()
        // A cue already paid for: stand off now rather than after the next hit.
        const known = learned.cues.get(newest)
        if (known) standOffUntil = Date.now() + known.seconds * 1000
      }
      if (hp !== null && lastHp !== null && hp < lastHp - 1) {
        if (wasIn.length > 0) {
          for (const kind of wasIn) {
            burnt(learned, kind)
            burns.push(kind)
          }
        } else if (lastLine !== '' && Date.now() - heardAt < 8000) {
          // Nothing underfoot. Whatever was shouted just now gets the blame --
          // and if the blame is wrong the cue simply never pays, which is itself
          // the answer to whether the fight announces what it is doing.
          cued(learned, lastLine)
          burns.push(`said:${lastLine}`)
        }
      }
    }
    lastHp = hp
    wasIn = [...new Set(standing.map((g) => g.kind))]

    // Where to go, in world units, per style.
    let want: { x: number; y: number } | null = null
    // The one the HUD names, and only then the nearest of the rest.
    //
    // `foesAt` answers for the whole citadel, not the room: standing in the first
    // boss's chamber it offered Blighted Abominations nine thousand yards away in
    // the plagueworks, and a driver closing on "the nearest foe" walked at those
    // for four minutes while the boss it had come for stood untouched. What the
    // player has on screen is the health bar at the top, and that is this.
    const foes = await d.ask<Array<{ x: number; y: number; name: string }>>('foesAt()')
    const near = hero
      ? (foes
          .slice()
          .sort(
            (a, b) =>
              Math.hypot(a.x - hero.x, a.y - hero.y) - Math.hypot(b.x - hero.x, b.y - hero.y),
          )[0] ?? null)
      : (foes[0] ?? null)
    const boss = hud.boss ?? near

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
      } else if (acting === 'learn') {
        // Leave a patch only as early as it has earned. A kind never met has
        // lead 0, which means standing in its telegraph until it goes off and
        // then walking out of the mess -- a first pull, in other words.
        //
        // The most urgent thing first: what is already going off beats what is
        // still counting down, because there is no credit for dodging the second
        // while standing in the first.
        const urgent = standing
          .slice()
          .sort((a, b) => a.telegraph - b.telegraph)
          .find((g) => {
            const lead = learned.kinds.get(g.kind)?.lead ?? 0
            return g.detonated || g.telegraph <= lead
          })
        if (urgent) want = { x: hero.x - urgent.x, y: hero.y - urgent.y }
        else if (Date.now() < standOffUntil && boss) {
          // A cue is up. Away from the boss, and only until the seconds it has
          // earned run out -- a learner that backed off permanently would stop
          // playing the fight and its curve would mean nothing.
          want = { x: hero.x - boss.x, y: hero.y - boss.y }
        } else if (
          // The second answer: something it has learnt not to stand still for is
          // on the field. Away from the nearest of them rather than at random,
          // because a mechanic that follows you is escaped in a direction.
          ground.some((g) => (learned.kinds.get(g.kind)?.answer ?? 0) >= 2)
        ) {
          const chaser = ground
            .filter((g) => (learned.kinds.get(g.kind)?.answer ?? 0) >= 2)
            .sort(
              (a, b) =>
                Math.hypot(a.x - hero.x, a.y - hero.y) - Math.hypot(b.x - hero.x, b.y - hero.y),
            )[0]
          if (chaser) want = { x: hero.x - chaser.x, y: hero.y - chaser.y }
        } else if (boss) {
          const far = Math.hypot(boss.x - hero.x, boss.y - hero.y)
          if (far > 24) want = { x: boss.x - hero.x, y: boss.y - hero.y }
        }
      }
    }

    if (!steers) {
      // Somebody else has the stick. Leave it alone -- including not releasing it.
    } else if (want) {
      await d.steer(want.x, want.y)
      steps++
    } else if (acting !== 'wander') {
      await d.release()
    }

    // **Not while moving.** Casting and walking are exclusive here, so a body with
    // somewhere to be that presses every sixth of a second never gets there. It
    // cost a walked-in boss fight two hundred and forty seconds at a hundred per
    // cent: the party crossed into the room at its edge, `play` wanted to close a
    // hundred yards, and spent the whole budget casting at nothing instead. A
    // player runs and then casts, in that order.
    if (want !== null) {
      await sleep(acting === 'idle' ? 400 : 160)
      continue
    }
    if (acting === 'mash' || acting === 'wander') {
      // Round-robin rather than the first ready one: pressing slot 1 forever is
      // a rotation, and a rotation is not what these styles are for.
      slot = (slot % 5) + 1
      await d.ability(slot)
      pressed++
    } else if (acting === 'good' || acting === 'melee' || acting === 'learn') {
      const ready = hud.me?.bar.find((b) => b.status === 'ready')
      if (ready) {
        await d.ability(ready.slot)
        pressed++
      }
    }

    await sleep(acting === 'idle' ? 400 : 160)
  }

  if (steers) await d.release()
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
    ...(acting === 'learn'
      ? {
          burntBy: burns.length > 0 ? [...new Set(burns)].join(',') : 'nothing',
          knows: shows(learned),
        }
      : {}),
  })
}

/* ------------------------------------------------------------- the nine pulls */

function perMinute(n: number, seconds: number): number {
  return seconds > 0 ? Math.round((n / seconds) * 60 * 10) / 10 : 0
}

interface Rung {
  pull: number
  outcome: string
  fightTime: number
  mechanicHits: number
  damageTaken: number
  died: boolean
  worst: string
}

interface Bill {
  damage: number
  damageTaken: number
  mechanicHits: number
  byMechanic: Record<string, number>
  died: boolean
}

/**
 * The same fight, nine times, by something that is trying to learn it.
 *
 * `README.md` says what improves between attempts is you, and `docs/upkeep.md`
 * holds a band saying every fight is winnable by the ninth pull. Neither has ever
 * been measured against a player, because the harness's players are fixed
 * functions that play the ninth pull exactly as they played the first.
 *
 * Note what does *not* need controlling for: a raid keys its seed off the pull
 * count, so pull two is a different roll of the same script. That is the point --
 * a lesson that only works on one seed is memorisation, and this game's claim is
 * that the fight can be learned.
 *
 * The verdict is deliberately not a pass or a fail. A flat curve where `idle`
 * already wins means the fight had nothing to teach; a flat curve where it does
 * not means it had something to teach and no way to teach it. Only a person, or
 * the session reading this, can tell those apart -- so it prints both the curve
 * and the mechanic that never stopped landing, and says nothing about whether
 * that is good.
 */
async function ladder(d: Driver, pulls: number, seconds: number, rng: () => number): Promise<void> {
  const learned = nothingLearntYet()
  const rungs: Rung[] = []

  for (let pull = 1; pull <= pulls; pull++) {
    say('pull', { of: `${pull}/${pulls}`, knows: learned.kinds.size })
    await play(d, 'learn', seconds, rng, learned)

    const bill = await d.ask<Bill | null>('tally()')
    const hud = await d.ask<Hud>('hud()')
    const worst = bill
      ? (Object.entries(bill.byMechanic).sort((a, b) => b[1] - a[1])[0] ?? null)
      : null
    rungs.push({
      pull,
      outcome: hud.outcome,
      fightTime: Math.round(hud.time),
      mechanicHits: bill?.mechanicHits ?? 0,
      damageTaken: bill?.damageTaken ?? 0,
      died: bill?.died ?? false,
      worst: worst ? `${worst[0]}x${worst[1]}` : 'none',
    })

    if (pull === pulls) break

    // Back in for another go, the way a player gets there. RETRY is on the
    // report overlay; a pull that ran out of budget still says `ongoing` and has
    // no overlay, so that one goes out through the party screen and pulls again.
    // Never the `r` key: on a phone a keypress turns the touch controls off.
    if (hud.outcome !== 'ongoing') {
      if (!(await d.tap('outcome:retry'))) {
        fault('no-way-back-in', { after: hud.outcome, pull })
        break
      }
    } else {
      say('budget-ran-out', { pull, note: 'left through the party screen instead of RETRY' })
      if (!(await d.leaveFight())) {
        fault('no-way-out-of-a-fight', { pull })
        break
      }
      await d.tap('pull')
    }

    const deadline = Date.now() + 20_000
    for (;;) {
      const now = await d.where()
      if (now.screen === 'fight' && now.outcome === 'ongoing') break
      if (Date.now() > deadline) {
        fault('never-got-back-in', { pull, saw: now })
        break
      }
      await sleep(250)
    }
  }

  const first = rungs[0]
  const last = rungs[rungs.length - 1]
  // Which mechanics were still landing on the last pull having landed on the
  // first: the ones the fight never managed to teach.
  say('ladder', {
    pulls: rungs.length,
    // Per minute as well as raw. A pull that took longer eats more of everything
    // for free, and the learner's own standing off lengthens the fight -- so a
    // raw count would credit it for being slow or punish it for being thorough.
    curve: rungs.map(
      (r) =>
        `#${r.pull} ${r.outcome} ${r.fightTime}s hits=${r.mechanicHits}(${perMinute(r.mechanicHits, r.fightTime)}/min) taken=${r.damageTaken}(${perMinute(r.damageTaken, r.fightTime)}/min)${r.died ? ' DIED' : ''} worst=${r.worst}`,
    ),
    learnt: shows(learned),
    // Stated as two numbers rather than a verdict. Whether the difference is the
    // game teaching or the learner guessing is a judgement, and judgement is the
    // caller's.
    firstPull: first
      ? `${first.outcome} ${perMinute(first.mechanicHits, first.fightTime)}hits/min ${perMinute(first.damageTaken, first.fightTime)}taken/min`
      : 'none',
    lastPull: last
      ? `${last.outcome} ${perMinute(last.mechanicHits, last.fightTime)}hits/min ${perMinute(last.damageTaken, last.fightTime)}taken/min`
      : 'none',
    wins: `${rungs.filter((r) => r.outcome === 'won').length}/${rungs.length}`,
  })
}

/* --------------------------------------------------------- the whole evening */

/**
 * The citadel from the way in to as far as it goes, in one sitting.
 *
 * Nobody had ever done this. Three sessions in, the job had reached the *first*
 * boss once and fought two single dailies, and nothing had answered the only
 * question the walk exists to answer: can an evening be finished at all. The
 * history says it is the part most likely to be broken -- teleporters nobody
 * could stand on, buildings with no way in, doorways that came out as holes in
 * the roof, a walk that went blind for fifteen minutes -- and every one of those
 * was found by somebody walking it.
 *
 * A boss's room is a fight and the ground between two rooms is a walk, and the
 * difference is the whole of getting this right. The first attempt assumed a
 * corridor resolved like a fight and stood at the way in for two hundred seconds,
 * pressing six hundred and thirty-one abilities at nothing, 10/10 alive and never
 * scratched -- because the map is explicitly not a way through the building and
 * nothing was going to happen until somebody walked. So: in a `travel` section it
 * walks to a door, and in a `raid` one it fights and presses NEXT.
 *
 * It aims at the doors `ways()` reports rather than walking north and hoping. The
 * session that got through before this existed did the latter -- `walkto 0 -1000`
 * -- and left a `could-not-walk-there` in its own journal for the one that missed.
 *
 * What it reports is where it got to and what stopped it, because that is the
 * finding either way.
 */
interface Room {
  at: string
  mode: string
  outcome: string
  seconds: number
}

/**
 * Cross a stretch of ground and take a door out of it.
 *
 * Walks at the nearest door that leads somewhere, in short pushes with a look at
 * the fight in between, because the packs in a corridor wake as you pass them and
 * a body walking through one with its back turned is how a walk becomes a wipe.
 * It stops when the ground underfoot changes, which is the game saying the door
 * was taken.
 */
async function cross(d: Driver, seconds: number, been: Set<string>): Promise<void> {
  const from = (await d.ask<string | null>('chamber()')) ?? '?'
  const until = Date.now() + seconds * 1000
  let closest = Infinity
  let pressed = 0
  let waited = 0
  let step = 0
  let heading: { x: number; y: number } | null = null
  let was: number | null = null

  // Its own tight loop rather than a steer and then a `play`. Handing the slice
  // to `play` meant re-aiming once a second at best, and a body crosses thirty
  // yards in one: the same walk that `walkto` finishes in two and a half seconds
  // took a hundred and fifty to get within four. The cadence is the thing.
  while (Date.now() < until) {
    const where = await d.where()
    if (where.outcome !== 'ongoing') break
    if (((await d.ask<string | null>('chamber()')) ?? '?') !== from) break

    const ways = await d.ask<
      Array<{ to: string; x: number; y: number; away: number; onX: number; onY: number }>
    >('ways()')
    if (ways.length === 0) {
      fault('nowhere-to-go-from-here', { at: from })
      break
    }
    // By where it leads, not by how near it is. The vigil's nearest door faces
    // west into a wall seven hundred yards away; picking it walked there and
    // called the evening stuck. A room that branches has more than one, and the
    // one worth taking is the one that goes somewhere this walk has not been.
    const fresh = ways.filter((w) => !been.has(w.to))
    const door = (fresh.length > 0 ? fresh : ways).slice().sort((a, b) => a.away - b.away)[0]!
    closest = Math.min(closest, door.away)

    const hero = await d.ask<{ x: number; y: number } | null>('hero()')
    if (hero) {
      // **Through the door, not up to it.** A walk across the citadel never
      // resolves by arriving: the code says so out loud -- "a walk across the
      // whole building does not finish, there is nowhere it is trying to get to"
      // -- and the chamber underfoot changes as you cross into the next room. A
      // version of this stood on the door for a hundred and twenty seconds with
      // a hundred and eighty-six bodies asleep around it and called the evening
      // unfinishable. The session that got through before any of this existed
      // aimed a thousand yards past the door, and that is why it worked.
      // Fixed once, and on the corridor's own bearing rather than on the line
      // from this body to the door. Recomputed each tick it reverses the moment
      // the body is past the door and the party paces across the doorway forever;
      // taken off the body's own line it walks diagonally, because a raid comes in
      // off to one side. Both of those happened before this comment did.
      // **Steer at the door, and once it is close keep that heading.**
      //
      // The door a corridor reports is the far end of the stretch, not the line
      // where the next room begins -- and how far past it that line lies is not a
      // constant: crossing out of the way in happened about six hundred yards
      // beyond its door, and the vigil's nearest door is twenty yards off. So
      // "the door plus k" is the wrong model whatever k is, and all four values
      // tried for it are in the journal as failures, along with the corridor's own
      // `entry`, which is not the axis at all on a walk across a whole building.
      //
      // A heading is the right thing to keep. It is taken while the door is still
      // thirty yards off, where the subtraction is well conditioned -- taken at
      // the door it is two nearly equal points subtracted, which is noise, and
      // this walked twelve hundred yards west on it.
      const dx = door.x - hero.x
      const dy = door.y - hero.y
      const len = Math.hypot(dx, dy) || 1
      if (heading === null && door.away <= 30) heading = { x: dx / len, y: dy / len }
      if (heading === null) await d.steer(dx, dy)
      else await d.steer(heading.x, heading.y)
      if (door.away <= 6) waited++
    }

    // **Do not cast while crossing.** Casting and walking are exclusive in this
    // game -- a body that is casting is not moving -- so a walk that pressed an
    // ability every three quarters of a second covered a corridor's last twenty
    // yards in four minutes and never crossed. Pure walking does it in five
    // seconds. The same stall happens on the keyboard, which is how it was ruled
    // out as a driver problem: it is the rule, and a player crossing a corridor
    // keeps their hands off the bar for the same reason.
    //
    // So: fight only when something is actually on us. A pack woken on the way
    // past has to be answered, and nothing else does.
    if (step % 4 === 0) {
      const hud = await d.ask<Hud>('hud()')
      const hp = hud.me?.hp ?? null
      const hurt = hp !== null && was !== null && hp < was
      was = hp
      if (hurt || (hud.alive < hud.party && hud.outcome === 'ongoing')) {
        const ready = hud.me?.bar.find((b) => b.status === 'ready')
        if (ready) {
          await d.ability(ready.slot)
          pressed++
        }
      }
    }
    step++
    await sleep(140)
  }

  await d.release()
  const foes = await d.ask<Array<{ x: number; y: number; name: string }>>('foesAt()')
  say('crossed', {
    from,
    to: (await d.ask<string | null>('chamber()')) ?? '?',
    nearestDoorGot: closest === Infinity ? 'n/a' : closest,
    keptHeading: heading ? [Math.round(heading.x * 100) / 100, Math.round(heading.y * 100) / 100] : null,
    endedAt: await d.ask('hero()'),
    presses: pressed,
    // Seconds spent within reach of the door, and what is still alive in here.
    secondsAtTheDoor: Math.round((waited * 140) / 1000),
    stillAlive: foes.length,
    nearest: foes.length > 0 ? foes.map((f) => f.name).slice(0, 4).join(',') : 'none',
  })
}

async function evening(
  d: Driver,
  style: Style,
  seconds: number,
  fights: number,
  rng: () => number,
): Promise<void> {
  const visited: Room[] = []
  // Every chamber this evening has stood in, so a branching room is not re-entered
  // by the door it was left through.
  const been = new Set<string>()
  const learned = nothingLearntYet()
  let wipes = 0
  let idle = 0

  for (let n = 1; n <= fights; n++) {
    const before = await d.where()
    const at = (await d.ask<string | null>('chamber()')) ?? '?'
    been.add(at)
    const started = Date.now()
    say('room', { n: `${n}/${fights}`, room: at, mode: before.mode })

    if (before.mode === 'travel') {
      // Ground to cross, not a fight to win. Walk at the door, fighting whatever
      // wakes up on the way, until the chamber underfoot changes.
      await cross(d, seconds, been)
    } else {
      await play(d, style, seconds, rng, learned)
    }
    const after = await d.where()
    const standingIn = (await d.ask<string | null>('chamber()')) ?? '?'
    visited.push({
      at,
      mode: before.mode,
      outcome: after.outcome,
      seconds: Math.round((Date.now() - started) / 1000),
    })

    if (after.outcome === 'ongoing' && before.mode === 'travel' && standingIn !== at) {
      // Through a door and still walking: the normal way a corridor ends.
      say('walked-on', { from: at, to: standingIn })
      continue
    }
    if (after.outcome === 'ongoing') {
      // The budget ran out with the fight still going. Not a stuck evening -- a
      // slow one -- but it is the end of this run either way.
      //
      // With the bodies, because a fight that ran its whole budget at full health
      // on both sides is not slow, it is not happening, and the only thing that
      // tells them apart is where everybody was standing.
      fault('fight-outlasted-its-budget', {
        at,
        seconds,
        hero: await d.ask('hero()'),
        foes: (await d.ask<Array<{ x: number; y: number; name: string }>>('foesAt()')).slice(0, 3),
      })
      break
    }
    if (after.outcome !== 'victory') {
      wipes++
      say('wiped', { at, outcome: after.outcome, wipes })
      if (!(await d.tap('outcome:retry'))) {
        fault('no-way-back-in', { at, after: after.outcome })
        break
      }
    } else if (before.mode === 'raid') {
      // A boss's report has a NEXT on it; a corridor's victory does not stop.
      if (!(await d.tap('outcome:next'))) {
        fault('no-next-after-a-boss', { at })
        break
      }
    }

    // Wait to be somewhere, or fighting, again.
    const deadline = Date.now() + 30_000
    for (;;) {
      const now = await d.where()
      const here = (await d.ask<string | null>('chamber()')) ?? '?'
      if (now.outcome === 'ongoing' && (here !== at || now.mode !== before.mode)) break
      if (now.outcome === 'ongoing' && before.mode === 'travel' && here !== at) break
      if (Date.now() > deadline) break
      await sleep(400)
    }

    const here = (await d.ask<string | null>('chamber()')) ?? '?'
    const settled = await d.where()
    if (here === at && settled.outcome !== 'ongoing') {
      idle++
      if (idle >= 2) {
        // Twice in the same room with the fight over and no way on: this is the
        // evening being unfinishable from here, which is the whole point of
        // walking it.
        fault('evening-stuck', { at, after: settled.outcome, rooms: visited.length })
        break
      }
    } else idle = 0
  }

  say('evening', {
    rooms: visited.length,
    wipes,
    walked: visited.map((r) => `${r.at}(${r.mode},${r.outcome},${r.seconds}s)`),
    // Which rooms were actually reached, in order and once each: the answer to
    // "how far in does the building go before something stops you".
    reached: [...new Set(visited.map((r) => r.at))].join(' -> '),
    endedAt: (await d.ask<string | null>('chamber()')) ?? '?',
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
      // Where the doors out of here are, which is the one thing a walk needs and
      // the map will not give: pressing a room on the map does nothing unless you
      // are standing on a lit teleporter.
      case 'ways':
        say('ways', { hero: await d.ask('hero()'), doors: await d.ask('ways()') })
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
      case 'ladder':
        await ladder(d, Number(rest[0] ?? 9), Number(rest[1] ?? 240), rng)
        break
      case 'evening':
        await evening(
          d,
          (rest[0] as Style) ?? 'good',
          Number(rest[1] ?? 240),
          Number(rest[2] ?? 20),
          rng,
        )
        break
      // The player's own bill for the pull so far. The one comparable number
      // between a style that learns and a style that cannot: without it, the
      // ladder's curve has nothing to be a curve *against*.
      case 'bill': {
        const bill = await d.ask<Bill | null>('tally()')
        const hud = await d.ask<Hud>('hud()')
        say('bill', {
          fightTime: Math.round(hud.time),
          outcome: hud.outcome,
          hits: bill?.mechanicHits ?? 0,
          hitsPerMin: perMinute(bill?.mechanicHits ?? 0, hud.time),
          taken: bill?.damageTaken ?? 0,
          takenPerMin: perMinute(bill?.damageTaken ?? 0, hud.time),
          died: bill?.died ?? false,
          byMechanic: bill?.byMechanic ?? {},
        })
        break
      }
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
      if (m.type() !== 'error') return
      const text = m.text()
      // The dev server's own reload socket, not the game. It retries forever
      // when vite decides its websocket port is somewhere the page cannot reach,
      // and a ladder once turned that into a hundred and twenty-nine lines
      // around the four that mattered. Nothing here ships to a player: the
      // production build has no HMR at all.
      if (/\bws:\/\/|WebSocket|\[vite\]|HMR/i.test(text)) return
      fault('console-error', { text: text.slice(0, 300) })
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
  const repeats = [...faultSeen.values()].reduce((n, c) => n + c, 0)
  process.stdout.write(
    `\n${faults.length} distinct faults (${repeats} occurrences), ${entries.length} entries -- ${OUT}\n`,
  )
  for (const f of faults) {
    const same = `${String(f.kind).replace(/^fault:/, '')} ${JSON.stringify({ ...f, kind: undefined, at: undefined })}`
    const times = faultSeen.get(same) ?? 1
    process.stdout.write(
      `  ${f.kind}${times > 1 ? ` x${times}` : ''} ${JSON.stringify({ ...f, kind: undefined, at: undefined })}\n`,
    )
  }
  // A fault is a finding, not a broken run: the caller decides what it means.
  process.exit(0)
}

export { STYLES }

void main()

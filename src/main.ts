import { Input } from './input'
import { MAX_CATCHUP_TICKS, advance, type Clock } from './loop'
import { drawWorld } from './render/draw'
import { drawHud, outcomeButtons, partyButton, soundButton } from './render/hud'
import { append, load as loadHistory, record, save as saveHistory, type Attempt } from './history'
import { drawHistory, hitHistory } from './render/history'
import { Effects } from './render/effects'
import { Hints } from './render/hints'
import { drawRoster, hitRoster } from './render/roster'
import { Sfx } from './sfx'
import { COLORS, L, updateLayout } from './render/theme'
import { DT } from './sim/constants'
import { Rng } from './sim/rng'
import { step } from './sim/sim'
import {
  CLASSES,
  DEFAULT_PARTY,
  RAID_SIZES,
  pickFor,
  randomAround,
  selectInto,
  isLegalComposition,
  type DifficultyId,
  type Pick,
  type RaidSize,
} from './sim/classes'
import { createState } from './sim/state'
import type { SimState } from './sim/types'

const BASE_SEED = 0x51ed

const canvas = document.getElementById('stage') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

function fitCanvas(): void {
  // The canvas fills the viewport instead of being letterboxed at a fixed
  // aspect ratio. A letterboxed canvas on a portrait phone leaves most of the
  // screen outside the element, and touches there never reach the game.
  const w = Math.max(320, window.innerWidth)
  const h = Math.max(320, window.innerHeight)
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  updateLayout(w, h)
}

fitCanvas()

const input = new Input(window, canvas)
const sfx = new Sfx()
const hints = new Hints()
const effects = new Effects()

// Audio cannot start without a gesture, so the first one unlocks it.
for (const event of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(event, () => sfx.unlock(), { once: true })
}

function onViewportChange(): void {
  fitCanvas()
  // Layout moved, so the parked stick and buttons have to move with it.
  input.recentre()
}

window.addEventListener('resize', onViewportChange)
window.addEventListener('orientationchange', onViewportChange)

// --- party selection --------------------------------------------------------

const PARTY_KEY = 'abyss.party'
const DIFFICULTY_KEY = 'abyss.difficulty'

function loadParty(): Pick[] {
  const fallback = () => DEFAULT_PARTY.map((p) => ({ ...p }))
  try {
    const raw = localStorage.getItem(PARTY_KEY)
    if (!raw) return fallback()
    const parsed: unknown = JSON.parse(raw)
    // Anything unrecognised falls back rather than booting into a broken raid.
    // This also covers rosters saved before roles were stored alongside class.
    if (!Array.isArray(parsed)) return fallback()
    if (!RAID_SIZES.includes(parsed.length as RaidSize)) return fallback()

    const restored: Pick[] = []
    for (const entry of parsed) {
      if (typeof entry !== 'object' || entry === null) return fallback()
      const { classId, spec, role } = entry as {
        classId?: unknown
        spec?: unknown
        role?: unknown
      }
      if (typeof classId !== 'string' || !(classId in CLASSES)) return fallback()
      const cls = classId as Pick['classId']

      if (typeof spec === 'string' && CLASSES[cls].specs.some((sp) => sp.id === spec)) {
        restored.push({ classId: cls, spec: spec as Pick['spec'] })
        continue
      }

      // Saved before specs had names, when a class and a role were enough to
      // say which one you meant. The first spec in the role is the one that
      // existed at the time, so a roster survives the change rather than
      // being thrown away for a field it could not have had.
      if (role === 'tank' || role === 'healer' || role === 'dps') {
        const migrated = pickFor(cls, role)
        if (migrated) {
          restored.push(migrated)
          continue
        }
      }
      return fallback()
    }

    // A roster saved before the composition rules existed is not one we will
    // pull with, so it falls back like any other unrecognised save.
    return isLegalComposition(restored) ? restored : fallback()
  } catch {
    return fallback()
  }
}

function loadDifficulty(): DifficultyId {
  const raw = (() => {
    try {
      return localStorage.getItem(DIFFICULTY_KEY)
    } catch {
      return null
    }
  })()
  return raw === 'heroic' ? 'heroic' : 'normal'
}

function saveSetup(): void {
  try {
    localStorage.setItem(PARTY_KEY, JSON.stringify(party))
    localStorage.setItem(DIFFICULTY_KEY, difficulty)
  } catch {
    // Private browsing and full quotas are not worth failing over.
  }
}

/** Keeps the player's own pick and rolls the rest around the new size. */
function resize(size: RaidSize): void {
  party = randomAround(size, party[0] ?? DEFAULT_PARTY[0]!, Math.random)
  saveSetup()
}

let party = loadParty()
let difficulty = loadDifficulty()
let screen: 'roster' | 'fight' | 'history' = 'roster'

let history: Attempt[] = loadHistory()
/**
 * One row per pull, not one per frame.
 *
 * The frame loop sees a finished fight on every frame it draws the results
 * over, so without this the record would fill with the same pull forever.
 */
let recorded = false

let attempt = 0
let state: SimState = createState(BASE_SEED, attempt, party, difficulty)
// The RNG lives outside the state but is derived from it, so a given
// (seed, attempt) pair always replays identically.
let rng = new Rng(BASE_SEED + attempt * 7919)

function restart(): void {
  attempt++
  recorded = false
  state = createState(BASE_SEED, attempt, party, difficulty)
  rng = new Rng(BASE_SEED + attempt * 7919)
}

/** The composition the current run was started with. */
let fightingParty: Pick[] = party.map((p) => ({ ...p }))
let fightingDifficulty: DifficultyId = difficulty

/**
 * A changed party starts its own progression, since the AI's learning is
 * tied to how many times *these* five have pulled. Leaving the screen without
 * changing anything keeps the progress.
 */
function startFight(): void {
  const changed =
    party.length !== fightingParty.length ||
    difficulty !== fightingDifficulty ||
    party.some(
      (p, i) => p.classId !== fightingParty[i]?.classId || p.spec !== fightingParty[i]?.spec,
    )
  if (changed || state.outcome !== 'ongoing') {
    attempt = 0
    fightingParty = party.map((p) => ({ ...p }))
    fightingDifficulty = difficulty
    state = createState(BASE_SEED, attempt, party, difficulty)
    rng = new Rng(BASE_SEED)
  }
  recorded = false
  timing = { ...timing, accumulator: 0 }
  screen = 'fight'
}

function inside(r: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

/**
 * The only pick anyone makes is their own.
 *
 * Everyone else is rolled around it. Kept where it is when the raid it makes
 * is still a legal one — a five-man reads a role change as a trade with
 * whoever was holding that role — and rolled again when it is not, which is
 * what taking a role the raid already has enough of does.
 */
function chooseOwn(pick: Pick): void {
  const traded = selectInto(party, 0, pick)
  party = traded ?? randomAround(party.length as RaidSize, pick, Math.random)
  saveSetup()
}

function updateRoster(tap: { x: number; y: number } | null, clock: number): void {
  if (tap) {
    const hit = hitRoster(tap.x, tap.y)
    if (hit?.kind === 'class') {
      chooseOwn(hit.pick)
    } else if (hit?.kind === 'size') {
      if (hit.size !== party.length) resize(hit.size)
    } else if (hit?.kind === 'difficulty') {
      difficulty = hit.id
      saveSetup()
    } else if (hit?.kind === 'history') {
      screen = 'history'
      return
    } else if (hit?.kind === 'pull') {
      startFight()
      return
    }
  }
  drawRoster(ctx, party, difficulty, clock)
}

let timing: Clock = { accumulator: 0, elapsedTotal: 0 }
let last = performance.now()

function frame(now: number): void {
  const frameSeconds = (now - last) / 1000
  last = now

  // Simulation time only accrues while a fight is actually running: not on
  // menus, and not behind the results screen. See loop.ts.
  const simulating = screen === 'fight' && state.outcome === 'ongoing'
  timing = advance(timing, frameSeconds, simulating, DT)
  const clock = timing.elapsedTotal
  const elapsed = Math.min(Math.max(0, frameSeconds), 0.25)

  const tap = input.takeTapPoint()

  if (screen === 'roster') {
    input.setMenuMode(true)
    updateRoster(tap, clock)
    requestAnimationFrame(frame)
    return
  }

  if (screen === 'history') {
    input.setMenuMode(true)
    if (tap && hitHistory(tap.x, tap.y, history.map((e) => e.standings.length))) screen = 'roster'
    drawHistory(ctx, history)
    requestAnimationFrame(frame)
    return
  }

  input.setMenuMode(false)

  if (input.takeMuteRequest() || (tap && inside(soundButton(), tap.x, tap.y))) {
    sfx.toggleMute()
    requestAnimationFrame(frame)
    return
  }

  // Leaving mid-fight is always available: escape, or the corner button.
  if (input.takeMenuRequest() || (tap && inside(partyButton(), tap.x, tap.y))) {
    screen = 'roster'
    requestAnimationFrame(frame)
    return
  }

  // The overlay has explicit buttons, since a phone has no R key.
  if (state.outcome !== 'ongoing' && tap) {
    const buttons = outcomeButtons()
    if (inside(buttons.party, tap.x, tap.y)) {
      screen = 'roster'
      requestAnimationFrame(frame)
      return
    }
    restart()
  }
  if (input.takeRestart()) restart()

  let ticks = 0
  while (timing.accumulator >= DT && ticks < MAX_CATCHUP_TICKS) {
    step(state, input.consume(), rng)
    sfx.playAll(state.sounds)
    effects.ingest(state)
    timing.accumulator -= DT
    ticks++
  }

  // The moment a pull resolves, once.
  if (state.outcome !== 'ongoing' && !recorded) {
    recorded = true
    const entry = record(state, Date.now())
    if (entry) {
      history = append(history, entry)
      saveHistory(history)
    }
  }

  hints.observe(state, elapsed)
  effects.age(elapsed)

  const alpha = Math.min(1, timing.accumulator / DT)

  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, L.w, L.h)
  drawWorld(ctx, state, alpha, clock, effects)
  drawHud(
    ctx,
    state,
    {
      active: input.isTouchMode(),
      joystick: input.joystick(),
      heldSlots: input.heldSlots(),
    },
    sfx.isMuted(),
  )
  hints.draw(ctx)

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)

// Offline support. The whole game is static and simulated client-side, so
// once it is cached there is nothing left to be online for.
//
// Freshness is handled in two layers: the worker fetches the page itself
// network-first, and this reloads once when a new worker takes over, so a
// launch never leaves you on a build that has already been replaced.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller)
  let reloading = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // On a first visit the worker claims the page immediately; that is not an
    // update and must not bounce the player.
    if (!hadController || reloading) return
    reloading = true
    window.location.reload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker
      // updateViaCache: 'none' stops the browser serving sw.js from its own
      // HTTP cache, which would hide new deploys for up to a day.
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
      .then((registration) => {
        void registration.update()
      })
      .catch(() => {
        // A failed registration is not worth interrupting the game over.
      })
  })
}

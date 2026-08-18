import { Input } from './input'
import { drawWorld } from './render/draw'
import { drawHud, outcomeButtons, partyButton } from './render/hud'
import { drawRoster, hitRoster } from './render/roster'
import { COLORS, L, updateLayout } from './render/theme'
import { DT } from './sim/constants'
import { Rng } from './sim/rng'
import { step } from './sim/sim'
import { CLASSES, DEFAULT_PARTY, PARTY_SIZE, type ClassId } from './sim/classes'
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

function onViewportChange(): void {
  fitCanvas()
  // Layout moved, so the parked stick and buttons have to move with it.
  input.recentre()
}

window.addEventListener('resize', onViewportChange)
window.addEventListener('orientationchange', onViewportChange)

// --- party selection --------------------------------------------------------

const PARTY_KEY = 'abyss.party'

function loadParty(): ClassId[] {
  try {
    const raw = localStorage.getItem(PARTY_KEY)
    if (!raw) return [...DEFAULT_PARTY]
    const parsed: unknown = JSON.parse(raw)
    // Anything unrecognised falls back rather than booting into a broken party.
    if (!Array.isArray(parsed) || parsed.length !== PARTY_SIZE) return [...DEFAULT_PARTY]
    if (!parsed.every((id) => typeof id === 'string' && id in CLASSES)) return [...DEFAULT_PARTY]
    return parsed as ClassId[]
  } catch {
    return [...DEFAULT_PARTY]
  }
}

function saveParty(): void {
  try {
    localStorage.setItem(PARTY_KEY, JSON.stringify(party))
  } catch {
    // Private browsing and full quotas are not worth failing over.
  }
}

let party = loadParty()
let activeSlot = 0
let screen: 'roster' | 'fight' = 'roster'

let attempt = 0
let state: SimState = createState(BASE_SEED, attempt, party)
// The RNG lives outside the state but is derived from it, so a given
// (seed, attempt) pair always replays identically.
let rng = new Rng(BASE_SEED + attempt * 7919)

function restart(): void {
  attempt++
  state = createState(BASE_SEED, attempt, party)
  rng = new Rng(BASE_SEED + attempt * 7919)
}

/** The composition the current run was started with. */
let fightingParty: ClassId[] = [...party]

/**
 * A changed party starts its own progression, since the AI's learning is
 * tied to how many times *these* five have pulled. Leaving the screen without
 * changing anything keeps the progress.
 */
function startFight(): void {
  const changed = party.some((id, i) => id !== fightingParty[i])
  if (changed || state.outcome !== 'ongoing') {
    attempt = 0
    fightingParty = [...party]
    state = createState(BASE_SEED, attempt, party)
    rng = new Rng(BASE_SEED)
  }
  screen = 'fight'
}

function inside(r: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

function updateRoster(tap: { x: number; y: number } | null, clock: number): void {
  if (tap) {
    const hit = hitRoster(tap.x, tap.y)
    if (hit?.kind === 'slot') {
      activeSlot = hit.index
    } else if (hit?.kind === 'class') {
      party[activeSlot] = hit.classId
      saveParty()
      // Step to the next slot so a whole party can be set by tapping straight
      // down the class list.
      activeSlot = (activeSlot + 1) % PARTY_SIZE
    } else if (hit?.kind === 'pull') {
      startFight()
      return
    }
  }
  drawRoster(ctx, party, activeSlot, clock)
}

let accumulator = 0
let last = performance.now()
let clock = 0

function frame(now: number): void {
  // Clamping protects against the tab being backgrounded: rAF stops, and
  // without this the sim would try to catch up on minutes of missed time.
  const elapsed = Math.min((now - last) / 1000, 0.25)
  last = now
  clock += elapsed
  accumulator += elapsed

  const tap = input.takeTapPoint()

  if (screen === 'roster') {
    input.setMenuMode(true)
    updateRoster(tap, clock)
    requestAnimationFrame(frame)
    return
  }

  input.setMenuMode(false)

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
  while (accumulator >= DT && ticks < 6) {
    step(state, input.consume(), rng)
    accumulator -= DT
    ticks++
  }

  const alpha = Math.min(1, accumulator / DT)

  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, L.w, L.h)
  drawWorld(ctx, state, alpha, clock)
  drawHud(ctx, state, {
    active: input.isTouchMode(),
    joystick: input.joystick(),
    heldSlots: input.heldSlots(),
  })

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

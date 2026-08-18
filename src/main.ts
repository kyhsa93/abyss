import { Input } from './input'
import { drawWorld } from './render/draw'
import { drawHud, outcomeButtons, partyButton, soundButton } from './render/hud'
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
  autoParty,
  type ClassId,
  type DifficultyId,
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

function loadParty(): ClassId[] {
  try {
    const raw = localStorage.getItem(PARTY_KEY)
    if (!raw) return [...DEFAULT_PARTY]
    const parsed: unknown = JSON.parse(raw)
    // Anything unrecognised falls back rather than booting into a broken raid.
    if (!Array.isArray(parsed)) return [...DEFAULT_PARTY]
    if (!RAID_SIZES.includes(parsed.length as RaidSize)) return [...DEFAULT_PARTY]
    if (!parsed.every((id) => typeof id === 'string' && id in CLASSES)) return [...DEFAULT_PARTY]
    return parsed as ClassId[]
  } catch {
    return [...DEFAULT_PARTY]
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

/** Keeps the player's own slot and rebuilds the rest around the new size. */
function resize(size: RaidSize): void {
  party = autoParty(size, party[0] ?? 'mage')
  activeSlot = 0
  saveSetup()
}

let party = loadParty()
let difficulty = loadDifficulty()
let activeSlot = 0
let screen: 'roster' | 'fight' = 'roster'

let attempt = 0
let state: SimState = createState(BASE_SEED, attempt, party, difficulty)
// The RNG lives outside the state but is derived from it, so a given
// (seed, attempt) pair always replays identically.
let rng = new Rng(BASE_SEED + attempt * 7919)

function restart(): void {
  attempt++
  state = createState(BASE_SEED, attempt, party, difficulty)
  rng = new Rng(BASE_SEED + attempt * 7919)
}

/** The composition the current run was started with. */
let fightingParty: ClassId[] = [...party]
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
    party.some((id, i) => id !== fightingParty[i])
  if (changed || state.outcome !== 'ongoing') {
    attempt = 0
    fightingParty = [...party]
    fightingDifficulty = difficulty
    state = createState(BASE_SEED, attempt, party, difficulty)
    rng = new Rng(BASE_SEED)
  }
  screen = 'fight'
}

function inside(r: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

function updateRoster(tap: { x: number; y: number } | null, clock: number): void {
  if (tap) {
    const hit = hitRoster(tap.x, tap.y, party.length)
    if (hit?.kind === 'slot') {
      activeSlot = hit.index
    } else if (hit?.kind === 'class') {
      party[activeSlot] = hit.classId
      saveSetup()
      // Step to the next slot so a raid can be filled by tapping straight
      // down the class list.
      activeSlot = (activeSlot + 1) % party.length
    } else if (hit?.kind === 'size') {
      if (hit.size !== party.length) resize(hit.size)
    } else if (hit?.kind === 'difficulty') {
      difficulty = hit.id
      saveSetup()
    } else if (hit?.kind === 'auto') {
      // Filling 25 slots one tap at a time is nobody's idea of a game.
      party = autoParty(party.length as RaidSize, party[0] ?? 'mage')
      saveSetup()
    } else if (hit?.kind === 'pull') {
      startFight()
      return
    }
  }
  drawRoster(ctx, party, difficulty, activeSlot, clock)
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
  while (accumulator >= DT && ticks < 6) {
    step(state, input.consume(), rng)
    sfx.playAll(state.sounds)
    accumulator -= DT
    ticks++
  }

  hints.observe(state, elapsed)

  const alpha = Math.min(1, accumulator / DT)

  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, L.w, L.h)
  drawWorld(ctx, state, alpha, clock)
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

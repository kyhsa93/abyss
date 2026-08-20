import { Input } from './input'
import { MAX_CATCHUP_TICKS, advance, type Clock } from './loop'
import { drawWorld } from './render/draw'
import { drawHud, hitOutcome, partyButton } from './render/hud'
import {
  check as checkAwards,
  load as loadAwards,
  save as saveAwards,
  type Award,
  type Earned,
} from './achievements'
import { append, load as loadHistory, record, save as saveHistory, type Attempt } from './history'
import { drawAwardBanners, drawHistory, hitHistory, type HistoryTab } from './render/history'
import { Effects } from './render/effects'
import { Hints } from './render/hints'
import { drawRoster, hitRoster, sameMode, type RosterMode } from './render/roster'
import {
  drawBgSetup,
  drawHome,
  drawRaidSetup,
  drawSettings,
  hitBgSetup,
  hitHome,
  hitRaidSetup,
  hitSettings,
} from './render/menu'
import { Sfx } from './sfx'
import { COLORS, L, updateLayout } from './render/theme'
import { DT } from './sim/constants'
import { Rng } from './sim/rng'
import { step } from './sim/sim'
import { autoPress } from './sim/autocast'
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
import { createBattlegroundState, createState } from './sim/state'
import { encounterIndex, hasNext } from './sim/encounters'
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
const ENCOUNTER_KEY = 'abyss.encounter'
const UNLOCKED_KEY = 'abyss.unlocked'
const MODE_KEY = 'abyss.mode'

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

/**
 * Which boss you are on.
 *
 * Kept so a return visit opens where you left off rather than back at the
 * first boss, which is the whole point of there being an order. Clamped on
 * load: an index saved when the list was longer must not open a fight that
 * does not exist.
 */
function loadEncounter(): number {
  try {
    const raw = localStorage.getItem(ENCOUNTER_KEY)
    const parsed = raw === null ? NaN : Number.parseInt(raw, 10)
    return Number.isFinite(parsed) ? encounterIndex(parsed) : 0
  } catch {
    return 0
  }
}

/**
 * The furthest boss reached.
 *
 * Kept apart from which one you are on, because they answer different
 * questions: the first is progress and only ever goes up, the second is where
 * you are standing right now and can go back. Without the split, going back to
 * the first boss to farm it would lock the rest away again.
 */
function loadUnlocked(): number {
  try {
    const raw = localStorage.getItem(UNLOCKED_KEY)
    const parsed = raw === null ? NaN : Number.parseInt(raw, 10)
    return Number.isFinite(parsed) ? encounterIndex(parsed) : 0
  } catch {
    return 0
  }
}

/** Raid, or one of the battlegrounds. Remembered like everything else here. */
function loadMode(): RosterMode {
  try {
    const raw = localStorage.getItem(MODE_KEY)
    if (raw === 'conquest' || raw === 'flags') return { kind: 'bg', bg: raw }
    return { kind: 'raid' }
  } catch {
    return { kind: 'raid' }
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
    localStorage.setItem(ENCOUNTER_KEY, String(encounter))
    localStorage.setItem(UNLOCKED_KEY, String(unlocked))
    localStorage.setItem(MODE_KEY, mode.kind === 'raid' ? 'raid' : mode.bg)
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
let encounter = loadEncounter()
let unlocked = Math.max(loadUnlocked(), encounter)
let mode: RosterMode = loadMode()
/**
 * One question per screen.
 *
 * `home` asks what kind of thing you are doing, `raid` and `battleground` ask
 * the settings that kind has, `roster` asks who you are playing, and only then
 * is there a fight. All of it used to be on one screen, which meant a
 * battleground was chosen on a page that also offered a raid's difficulty and
 * a boss list, half of it hidden depending on what you had already picked.
 */
let screen: 'home' | 'raid' | 'battleground' | 'roster' | 'settings' | 'fight' | 'history' =
  'home'

let history: Attempt[] = loadHistory()
let awards: Earned = loadAwards()
let historyTab: HistoryTab = 'pulls'

/**
 * Awards earned by the pull just finished, waiting to be read.
 *
 * Announced over the results rather than mid-fight: an award is something you
 * did, and the moment to be told is when the doing has stopped.
 */
let announced: { award: Award; age: number }[] = []
/**
 * One row per pull, not one per frame.
 *
 * The frame loop sees a finished fight on every frame it draws the results
 * over, so without this the record would fill with the same pull forever.
 */
let recorded = false
/** The same, for the half of it that only a raid does. */
let graded = false

let attempt = 0
/** Every pull and every match is its own seed, so a rematch is not a replay. */
/**
 * How many battlegrounds have been started this session.
 *
 * A raid keys its seed off the pull count, because a raid is the same
 * encounter learned over attempts and the ninth pull has to be the same fight
 * as the first. A battleground is not learned — the terrain is rolled from the
 * seed, and a map you have already walked is not the point of rolling one. So
 * this counts entries rather than attempts, and going back to the party screen
 * and pulling again gets a new map rather than the same one.
 */
let bgRolls = 0

function newState(): SimState {
  if (mode.kind === 'bg') {
    return createBattlegroundState(BASE_SEED + bgRolls++ * 7919, mode.bg, party)
  }
  return createState(BASE_SEED, attempt, party, difficulty, encounter)
}

let state: SimState = newState()
/**
 * The RNG lives outside the state but is derived from it, so a given
 * (seed, attempt) pair always replays identically.
 *
 * A raid is keyed off the pull count and a battleground off its own seed,
 * which is the seed its map was rolled from — otherwise the map and the fight
 * on it would come from two different numbers and neither would reproduce the
 * other.
 */
function rngFor(fight: SimState): Rng {
  return new Rng(fight.mode === 'battleground' ? fight.seed : BASE_SEED + attempt * 7919)
}

let rng = rngFor(state)

function restart(): void {
  attempt++
  recorded = false
  graded = false
  announced = []
  state = newState()
  rng = rngFor(state)
}

/**
 * On to the next boss.
 *
 * The pull count goes back to zero with it. The AI's learning is learning
 * *this* fight — a party that has killed the first boss nine times has not
 * seen the second one's opening, and carrying the progress over would hand
 * them a ninth-pull execution of a script they have never watched.
 */
function nextBoss(): void {
  if (!hasNext(encounter)) return
  encounter = encounterIndex(encounter + 1)
  unlocked = Math.max(unlocked, encounter)
  attempt = 0
  recorded = false
  graded = false
  announced = []
  fightingEncounter = encounter
  state = newState()
  rng = rngFor(state)
  saveSetup()
}

/** The composition the current run was started with. */
let fightingParty: Pick[] = party.map((p) => ({ ...p }))
let fightingDifficulty: DifficultyId = difficulty
let fightingEncounter: number = encounter
let fightingMode: RosterMode = mode

/**
 * A changed party starts its own progression, since the AI's learning is
 * tied to how many times *these* five have pulled. Leaving the screen without
 * changing anything keeps the progress.
 */
function startFight(): void {
  const changed =
    party.length !== fightingParty.length ||
    difficulty !== fightingDifficulty ||
    encounter !== fightingEncounter ||
    !sameMode(mode, fightingMode) ||
    party.some(
      (p, i) => p.classId !== fightingParty[i]?.classId || p.spec !== fightingParty[i]?.spec,
    )
  if (changed || state.outcome !== 'ongoing') {
    attempt = 0
    fightingParty = party.map((p) => ({ ...p }))
    fightingDifficulty = difficulty
    fightingEncounter = encounter
    fightingMode = mode
    state = newState()
    rng = rngFor(state)
  }
  recorded = false
  graded = false
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

function updateHome(tap: { x: number; y: number } | null, clock: number): void {
  if (tap) {
    const hit = hitHome(tap.x, tap.y)
    if (hit === 'raid') {
      mode = { kind: 'raid' }
      saveSetup()
      screen = 'raid'
      return
    }
    if (hit === 'battleground') {
      screen = 'battleground'
      return
    }
    if (hit === 'settings') {
      screen = 'settings'
      return
    }
    if (hit === 'record') {
      screen = 'history'
      return
    }
  }
  drawHome(ctx, clock)
}

function updateRaidSetup(tap: { x: number; y: number } | null): void {
  if (tap) {
    const hit = hitRaidSetup(tap.x, tap.y)
    if (hit?.kind === 'back') {
      screen = 'home'
      return
    }
    if (hit?.kind === 'next') {
      screen = 'roster'
      return
    }
    if (hit?.kind === 'size') {
      if (hit.size !== party.length) resize(hit.size)
      saveSetup()
    } else if (hit?.kind === 'difficulty') {
      difficulty = hit.id
      saveSetup()
    } else if (hit?.kind === 'boss') {
      // A locked boss is drawn locked and does nothing when pressed, rather
      // than being absent: what is left down there is worth knowing.
      if (hit.index <= unlocked) {
        encounter = hit.index
        saveSetup()
      }
    }
  }
  drawRaidSetup(ctx, encounter, unlocked, party.length, difficulty)
}

function updateBgSetup(tap: { x: number; y: number } | null): void {
  if (tap) {
    const hit = hitBgSetup(tap.x, tap.y)
    if (hit?.kind === 'back') {
      screen = 'home'
      return
    }
    if (hit?.kind === 'map') {
      mode = { kind: 'bg', bg: hit.map }
      // A battleground is five a side, so a twenty-five man roster cannot walk
      // into one. The player's own pick survives; the rest is rolled again.
      if (party.length !== 5) resize(5)
      saveSetup()
      screen = 'roster'
      return
    }
  }
  drawBgSetup(ctx, mode.kind === 'bg' ? mode.bg : null)
}

function updateSettings(tap: { x: number; y: number } | null): void {
  if (tap) {
    const hit = hitSettings(tap.x, tap.y)
    if (hit?.kind === 'back') {
      screen = 'home'
      return
    }
    if (hit?.kind === 'sound') {
      sfx.toggleMute()
    } else if (hit?.kind === 'volume') {
      // Picking a level while muted is a request to hear it, and the sound it
      // plays is the answer: a setting you cannot hear is one you cannot set.
      if (sfx.isMuted()) sfx.toggleMute()
      sfx.setVolume(hit.level)
      sfx.play('countdown')
    }
  }
  drawSettings(ctx, sfx.isMuted(), sfx.volume())
}

function updateRoster(tap: { x: number; y: number } | null, clock: number): void {
  if (tap) {
    const hit = hitRoster(tap.x, tap.y)
    if (hit?.kind === 'class') {
      chooseOwn(hit.pick)
    } else if (hit?.kind === 'back') {
      screen = mode.kind === 'raid' ? 'raid' : 'battleground'
      return
    } else if (hit?.kind === 'pull') {
      startFight()
      return
    }
  }
  drawRoster(ctx, party, difficulty, clock, encounter, mode)
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

  if (screen !== 'fight' && screen !== 'history') {
    input.setMenuMode(true)
    if (screen === 'home') updateHome(tap, clock)
    else if (screen === 'raid') updateRaidSetup(tap)
    else if (screen === 'battleground') updateBgSetup(tap)
    else if (screen === 'settings') updateSettings(tap)
    else updateRoster(tap, clock)
    requestAnimationFrame(frame)
    return
  }

  if (screen === 'history') {
    input.setMenuMode(true)
    if (tap) {
      const hit = hitHistory(tap.x, tap.y, history.map((e) => e.standings.length))
      if (hit === 'back') screen = 'home'
      else if (hit) historyTab = hit
    }
    drawHistory(ctx, history, awards, historyTab)
    requestAnimationFrame(frame)
    return
  }

  input.setMenuMode(false)

  // Mute lives on the settings screen now, but the key still works mid-fight:
  // the reason to reach for it is usually something that just happened.
  if (input.takeMuteRequest()) {
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

  // The overlay has explicit buttons, since a phone has no R key. Only those
  // two answer: a tap anywhere else is somebody reading the report, and it
  // used to pull again under them.
  if (state.outcome !== 'ongoing' && tap) {
    const hit = hitOutcome(tap.x, tap.y, state)
    if (hit === 'party') {
      screen = 'roster'
      requestAnimationFrame(frame)
      return
    }
    if (hit === 'next') nextBoss()
    else if (hit === 'retry') restart()
  }
  if (input.takeRestart()) restart()

  let ticks = 0
  while (timing.accumulator >= DT && ticks < MAX_CATCHUP_TICKS) {
    const player = input.consume()
    // Autocast adds to what was pressed rather than replacing it: a thumb on a
    // button while it is on should still get that button, and pressing the
    // same slot twice in a tick is not a thing the simulation minds.
    if (input.isAuto()) player.pressed = [...player.pressed, ...autoPress(state)]
    step(state, player, rng)
    sfx.playAll(state.sounds)
    effects.ingest(state)
    timing.accumulator -= DT
    ticks++
  }

  // The moment a pull resolves, once.
  // The record and the awards are about killing bosses — placing on a raid
  // meter, a pull under a hundred and ten seconds. A battleground has no boss
  // to grade against, so it keeps its result on its own screen rather than
  // filing a pull that never happened. Note the outcome either way, or the
  // block runs again on every frame the results are drawn over.
  if (state.outcome !== 'ongoing' && !recorded) {
    recorded = true
  }
  if (state.outcome !== 'ongoing' && !graded && state.mode === 'raid') {
    graded = true
    // Pressing NEXT BOSS is not what opens the next boss; killing this one
    // is. Leaving through CHANGE PARTY after a kill must not cost the
    // progress that kill earned.
    if (state.outcome === 'victory' && hasNext(state.encounter)) {
      unlocked = Math.max(unlocked, encounterIndex(state.encounter + 1))
      saveSetup()
    }
    const at = Date.now()
    const entry = record(state, at)
    if (entry) {
      history = append(history, entry)
      saveHistory(history)
    }

    // Judged after the record is written, since some of them are about the
    // record rather than about the pull.
    const fresh = checkAwards(state, history, awards, at)
    if (fresh.length > 0) {
      saveAwards(awards)
      announced = fresh.map((award) => ({ award, age: 0 }))
    }
  }

  hints.observe(state, elapsed)
  effects.age(elapsed)
  for (const item of announced) item.age += elapsed
  announced = announced.filter((item) => item.age < 6)

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
      auto: input.isAuto(),
    },
  )
  hints.draw(ctx)
  drawAwardBanners(ctx, announced)

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

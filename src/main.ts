import { Input } from './input'
import { MAX_CATCHUP_TICKS, advance, type Clock } from './loop'
import { drawWorld } from './render/draw'
import { drawHud, hitOutcome, partyButton, setShareLabel, setTrendLine } from './render/hud'
import {
  check as checkAwards,
  load as loadAwards,
  save as saveAwards,
  type Award,
  type Earned,
} from './achievements'
import {
  append,
  load as loadHistory,
  record,
  save as saveHistory,
  trend,
  type Attempt,
} from './history'
import { drawAwardBanners, drawHistory, hitHistory, type HistoryTab } from './render/history'
import { beat, load as loadBests, save as saveBests, type Bests } from './bests'
import { Effects } from './render/effects'
import { loadName, nameThePlayer, saveName } from './name'
import { editName, isEditingName } from './render/nameinput'
import { Ambience, loadBackdrop, saveBackdrop, setAmbience } from './render/ambience'
import { Hints } from './render/hints'
import { drawRoster, hitRoster, sameMode, type RosterMode } from './render/roster'
import {
  drawBgSetup,
  drawDaily,
  drawHome,
  drawRaidSetup,
  drawSettings,
  hitBgSetup,
  hitDaily,
  hitHome,
  hitRaidSetup,
  hitSettings,
  settingsLayout,
} from './render/menu'
import { Sfx } from './sfx'
import {
  COLORS,
  L,
  classColor,
  saveZoom,
  setZoomLevel,
  updateLayout,
  zoomLevel,
} from './render/theme'
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
import { ENCOUNTERS, encounterIndex } from './sim/encounters'
import {
  FIRST_TIER,
  LADDER,
  RUNGS_PER_BOSS,
  cleared,
  moved,
  nextSetting,
  pressBoss,
  pressDifficulty,
  pressSize,
  settle,
  tierOf,
  type Setting,
} from './progress'
import { dailyAffix, dailyFor, dailyKey, dailyLabel, type Daily } from './sim/daily'
import { dailyMessage, gameMessage, killMessage, parseInvite, share } from './share'
import {
  fold as foldDaily,
  load as loadDaily,
  save as saveDaily,
  todays,
  type DailyResult,
} from './daily-record'
import { SPEC_OPTIONS, specLabel } from './sim/classes'
import { DESCENT_RECOVERY, DESCENT_REVIVE, descentEncounter } from './sim/descent'
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

/**
 * The fight behind the menus.
 *
 * Owned here rather than by the screens that show it, because it is one fight
 * shared by all of them: walking from the front page to the party screen
 * carries on the pull that was already going.
 */
let playerName = loadName()

const ambience = new Ambience()
ambience.setEnabled(loadBackdrop())
setAmbience(ambience)

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
/** The old key, read once to carry a save over. See `loadUnlocked`. */
const BOSSES_KEY = 'abyss.unlocked'
const UNLOCKED_KEY = 'abyss.tier'
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
 * The furthest rung reached, on the one chain that runs through every setting.
 *
 * Kept apart from which one you are on, because they answer different
 * questions: the first is progress and only ever goes up, the second is where
 * you are standing right now and can go back. Without the split, going back to
 * the first boss to farm it would lock the rest away again.
 *
 * A save from before the chain existed is carried over rather than reset. It
 * held a boss index, since a boss was the only thing that was ever locked, so
 * what it says is "these bosses were reachable" and nothing at all about the
 * sizes and difficulties — which were free. It is read as the *first* rung of
 * that boss: the progress that was actually earned is kept, and the axes that
 * were never a door become one. Taking away settings somebody had is the cost;
 * the alternative is handing them the top of a ladder the chain exists to make
 * them climb.
 */
function loadUnlocked(): number {
  try {
    const raw = localStorage.getItem(UNLOCKED_KEY)
    if (raw !== null) {
      const parsed = Number.parseInt(raw, 10)
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.min(LADDER.length - 1, parsed))
      }
    }
    const old = localStorage.getItem(BOSSES_KEY)
    const boss = old === null ? NaN : Number.parseInt(old, 10)
    if (!Number.isFinite(boss)) return FIRST_TIER
    return encounterIndex(boss) * RUNGS_PER_BOSS
  } catch {
    return FIRST_TIER
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

const DEEPEST_KEY = 'abyss.deepest'

function loadDeepest(): number {
  try {
    const raw = localStorage.getItem(DEEPEST_KEY)
    const parsed = raw === null ? NaN : Number.parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  } catch {
    return 0
  }
}

function saveDeepest(): void {
  try {
    localStorage.setItem(DEEPEST_KEY, String(deepest))
  } catch {
    // Not worth failing over.
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

/**
 * Drops the raid setting onto the best rung of this boss that is actually open.
 *
 * Called wherever the setting can arrive at something it has not earned: a
 * save written before the chain existed, an invitation to somebody else's
 * fight, and pressing a boss whose top rungs are still locked. It moves the
 * size and the difficulty and never the boss — a player who pressed the Choir
 * and got moved to the Warden because their difficulty was locked would be
 * reading a stranger answer than a player who got moved to normal.
 *
 * Battlegrounds are not on the chain at all: they are five a side and there is
 * nothing to unlock, so a setting is only settled while the raid is the mode.
 */
function settleSetting(): void {
  if (mode.kind !== 'raid') return
  apply(settle(unlocked, setting()))
}

/** The three rows of the setup screen, as the one answer they are. */
function setting(): Setting {
  return { encounter, size: party.length as RaidSize, difficulty }
}

/**
 * Puts an answer from `progress` back onto the game's own state.
 *
 * The boss and the difficulty before the size, because `resize` saves as it
 * goes: set the other two afterwards and what reaches storage is the pair that
 * was just corrected next to the one that was not.
 */
function apply(next: Setting): void {
  if (!moved(setting(), next)) return
  encounter = next.encounter
  difficulty = next.difficulty
  if (next.size !== party.length) resize(next.size)
  saveSetup()
}

/** Keeps the player's own pick and rolls the rest around the new size. */
function resize(size: RaidSize): void {
  party = randomAround(size, party[0] ?? DEFAULT_PARTY[0]!, Math.random)
  saveSetup()
}

let party = loadParty()
let difficulty = loadDifficulty()
let encounter = loadEncounter()
let unlocked = loadUnlocked()
let mode: RosterMode = loadMode()

// A saved setup can name a rung this save has not earned — every one of them
// could, before the chain existed, and a save carried over from then names one
// almost by definition.
settleSetting()

/**
 * Today's run, and what has been made of it so far.
 *
 * A daily is a raid with everything but the class already decided, so it rides
 * the raid path rather than being a mode of its own — what marks it is that
 * the seed, the boss and the party all came from the date.
 */
let dailyResults: DailyResult[] = loadDaily()
/**
 * What the share button last did, shown on the button for a moment.
 *
 * A share sheet says its own piece; a clipboard copy says nothing at all, and
 * a button that appears to do nothing is a button people press twice.
 */
let shareSaid: string | null = null
let shareSaidAt = 0

/** The confirmation is a moment, not a state: two seconds and it is gone. */
function fresh(said: string | null, at: number): string | undefined {
  return said !== null && performance.now() - at < 2000 ? said : undefined
}
let playingDaily = false

/**
 * The descent: how deep this attempt has got, and how deep any attempt ever
 * has. Zero means we are not on one.
 *
 * The party carries its state down rather than starting each floor fresh —
 * otherwise the depth is only a number on the boss's health bar.
 */
let depth = 0
let deepest = loadDeepest()
/** Set while the class screen is being used to start a descent rather than a pull. */
let startingDescent = false
let daily: Daily = dailyFor(dailyKey(new Date()), party[0] ?? DEFAULT_PARTY[0]!)
/**
 * One question per screen.
 *
 * `home` asks what kind of thing you are doing, `raid` and `battleground` ask
 * the settings that kind has, `roster` asks who you are playing, and only then
 * is there a fight. All of it used to be on one screen, which meant a
 * battleground was chosen on a page that also offered a raid's difficulty and
 * a boss list, half of it hidden depending on what you had already picked.
 */
let screen:
  | 'home'
  | 'raid'
  | 'battleground'
  | 'daily'
  | 'roster'
  | 'settings'
  | 'fight'
  | 'history' = 'home'

let history: Attempt[] = loadHistory()
let awards: Earned = loadAwards()
/**
 * Personal bests, which are the only thing in this game that gets stronger.
 *
 * Nothing on the character does, by design — so the evidence that anything is
 * improving has to be the record, and a record you only see on a screen opened
 * afterwards is one nobody notices beating.
 */
let bests: Bests = loadBests()
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
  // The name goes on afterwards rather than into the simulation: it changes
  // nothing about a fight, the harness must not depend on what is in storage,
  // and a replay from a seed has to be the same fight whoever is playing it.
  const named = (s: SimState): SimState => {
    nameThePlayer(s, playerName)
    return s
  }
  return named(buildState())
}

function buildState(): SimState {
  if (mode.kind === 'bg') {
    return createBattlegroundState(BASE_SEED + bgRolls++ * 7919, mode.bg, party)
  }
  // A daily runs on the day's seed and carries the day's twist; an ordinary
  // pull runs on the house seed and carries none, because a fight you are
  // learning has to be the same fight on the ninth attempt as on the first.
  if (playingDaily) {
    return createState(daily.seed, 0, party, difficulty, encounter, daily.affix)
  }
  if (depth > 0) {
    // Each floor is its own seed, so a descent is not the same fight three
    // times with more health — and the party gets better as it goes, because
    // they are the same five people who have now been through several fights
    // together. Without that a descent is played entirely by a party on its
    // first pull, which is the worst it ever is.
    return createState(
      BASE_SEED + depth * 7919,
      Math.min(8, depth + 1),
      party,
      difficulty,
      encounter,
      null,
      depth,
    )
  }
  return createState(BASE_SEED, attempt, party, difficulty, encounter)
}

/**
 * Starts a floor, carrying the party down in the state it finished the last
 * one in: whatever health it had, plus a little back, and one of the fallen on
 * their feet again.
 *
 * A full heal between floors would make every floor the first floor. Nothing
 * at all would mean a party that finished at ten percent has already lost the
 * next one and is only being told a minute later.
 */
function descendTo(floor: number, carry: SimState | null): void {
  depth = floor
  encounter = descentEncounter(floor)
  playingDaily = false
  mode = { kind: 'raid' }
  attempt = 0
  recorded = false
  graded = false
  announced = []
  state = newState()
  rng = rngFor(state)

  if (carry) {
    const survivors = carry.actors.filter((a) => a.faction === 'party')
    let revived = false
    state.actors
      .filter((a) => a.faction === 'party')
      .forEach((a, i) => {
        const was = survivors[i]
        if (!was) return
        if (was.alive) {
          a.hp = Math.min(a.maxHp, Math.round(was.hp + a.maxHp * DESCENT_RECOVERY))
          a.power = was.power
          return
        }
        // One of the fallen gets up per floor, and no more: a wipe has to stay
        // a wipe rather than being paid off one body at a time.
        if (!revived) {
          revived = true
          a.hp = Math.round(a.maxHp * DESCENT_REVIVE)
        } else {
          a.alive = false
          a.hp = 0
        }
      })
  }

  fightingParty = party.map((p) => ({ ...p }))
  fightingDifficulty = difficulty
  fightingEncounter = encounter
  fightingMode = mode
  timing = { ...timing, accumulator: 0 }
  screen = 'fight'
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
  // A descent has no retry: pressing it starts a fresh run from the first
  // floor, which is the whole point of there being a depth to lose.
  if (depth > 0) {
    descendTo(1, null)
    return
  }
  attempt++
  recorded = false
  graded = false
  announced = []
  state = newState()
  rng = rngFor(state)
}

/**
 * On to the next rung, which is usually this boss one setting harder.
 *
 * The pull count goes back to zero with it, and for a rung as much as for a
 * boss. The AI's learning is learning *this* fight — a party that has killed
 * the Warden nine times at five has not seen its rot, which is what the
 * heroic rung buys, and the roster is rolled again whenever the size changes,
 * so they are not even the same people. Carrying the progress over would hand
 * them a ninth-pull execution of a script they have never watched.
 */
function advanceTier(): void {
  const next = nextSetting(setting())
  if (!moved(setting(), next)) return
  // Moving on is leaving today's fight behind; a retry is not.
  playingDaily = false
  apply(next)
  unlocked = Math.max(unlocked, tierOf(next.encounter, next.size, next.difficulty))
  attempt = 0
  recorded = false
  graded = false
  announced = []
  fightingEncounter = encounter
  fightingDifficulty = difficulty
  fightingParty = party.map((p) => ({ ...p }))
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
  // The class screen is also where a descent begins, since the one thing a
  // descent still asks is what you are bringing into it.
  if (startingDescent) {
    startingDescent = false
    descendTo(1, null)
    return
  }

  // Anything started from the class screen is a normal pull, whatever was
  // played before it.
  playingDaily = false
  depth = 0
  // The last gate before the fight actually starts. Every path that can move
  // the setting settles it already, so this catches nothing today — which is
  // the point: it is the one place a rung that was never earned would become
  // a pull, and it is cheap to make that impossible rather than to keep every
  // path in mind.
  settleSetting()
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
      // A battleground forces the roster to five and leaves the difficulty
      // where it was, so coming back out of one can land on a rung this save
      // has not earned. Settled on the way in rather than on the way out, so
      // there is one place that has to remember.
      settleSetting()
      saveSetup()
      screen = 'raid'
      return
    }
    if (hit === 'battleground') {
      screen = 'battleground'
      return
    }
    if (hit === 'descent') {
      startingDescent = true
      mode = { kind: 'raid' }
      if (party.length !== 5) resize(5)
      saveSetup()
      screen = 'roster'
      return
    }

    if (hit === 'daily') {
      // Rolled fresh each time it is opened, so a session left running over
      // midnight offers the new day rather than yesterday's.
      daily = dailyFor(dailyKey(new Date()), party[0] ?? DEFAULT_PARTY[0]!)
      dailyResults = loadDaily()
      screen = 'daily'
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
    if (hit === 'share') {
      void share(gameMessage(bests)).then((how) => {
        shareSaid = how === 'copied' ? 'COPIED' : how === 'shared' ? 'SHARED' : 'NO LUCK'
        shareSaidAt = performance.now()
      })
      return
    }
  }
  drawHome(ctx, clock, fresh(shareSaid, shareSaidAt))
}

/**
 * Today's run.
 *
 * The day fixes the boss, the size, the difficulty, the seed and the four
 * people around you; the only thing left is what you bring. Retries are
 * allowed and counted — there is no server to cheat against, and a run you
 * cannot practise is one you only ever see once.
 */
function updateDaily(tap: { x: number; y: number } | null): void {
  if (tap) {
    const hit = hitDaily(tap.x, tap.y)
    if (hit?.kind === 'back') {
      screen = 'home'
      return
    }
    if (hit?.kind === 'class') {
      const pick = SPEC_OPTIONS[hit.index]
      if (pick) {
        party = [{ ...pick }, ...party.slice(1)]
        daily = dailyFor(daily.key, pick)
        saveSetup()
      }
    }
    if (hit?.kind === 'share') {
      void share(dailyMessage(daily, todays(dailyResults, daily.key))).then((how) => {
        shareSaid = how === 'copied' ? 'COPIED' : how === 'shared' ? 'SHARED' : 'NO LUCK'
        shareSaidAt = performance.now()
      })
      return
    }
    if (hit?.kind === 'start') {
      playingDaily = true
      mode = { kind: 'raid' }
      party = daily.party.map((p) => ({ ...p }))
      difficulty = daily.difficulty
      encounter = daily.encounter
      attempt = 0
      recorded = false
      graded = false
      announced = []
      state = newState()
      rng = rngFor(state)
      fightingParty = party.map((p) => ({ ...p }))
      fightingDifficulty = difficulty
      fightingEncounter = encounter
      fightingMode = mode
      timing = { ...timing, accumulator: 0 }
      screen = 'fight'
      return
    }
  }

  const best = todays(dailyResults, daily.key)
  drawDaily(
    ctx,
    { label: dailyLabel(daily), key: daily.key, affix: dailyAffix(daily) },
    best
      ? {
          line:
            best.outcome === 'victory'
              ? `best kill ${best.time.toFixed(1)}s as ${best.spec}`
              : `best attempt left the boss at ${best.bossLeft}%`,
          attempts: best.attempts,
        }
      : null,
    SPEC_OPTIONS.findIndex(
      (option) => option.classId === party[0]?.classId && option.spec === party[0]?.spec,
    ),
    (index) => {
      const option = SPEC_OPTIONS[index]!
      return { text: specLabel(option), colour: classColor(option.classId) }
    },
    fresh(shareSaid, shareSaidAt),
  )
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
    // All three rows are one answer, and the rules for what a press does live
    // with what is open rather than here: a press onto something locked comes
    // back unchanged — it is drawn locked rather than being absent, since what
    // is left up there is worth knowing — and a press that opens a row may
    // bring another one down with it.
    if (hit?.kind === 'size') {
      apply(pressSize(unlocked, setting(), hit.size))
    } else if (hit?.kind === 'difficulty') {
      apply(pressDifficulty(unlocked, setting(), hit.id))
    } else if (hit?.kind === 'boss') {
      apply(pressBoss(unlocked, setting(), hit.index))
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
    if (hit?.kind === 'name') {
      editName(settingsLayout().name, playerName, (value) => {
        if (value === null) return
        playerName = value
        saveName(value)
        // The fight already running behind the menus has a stranger in it
        // wearing the old name, and so does whatever pull is paused on the
        // results screen.
        nameThePlayer(state, playerName)
      })
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
    } else if (hit?.kind === 'camera') {
      // The canvas is not resized, so the layout has to be recomputed against
      // the size it already is.
      // The viewport has not changed, so the layout is recomputed against the
      // size it already has rather than through fitCanvas, which would also
      // reset the canvas backing store for nothing.
      if (setZoomLevel(hit.level, Math.max(320, window.innerWidth), Math.max(320, window.innerHeight))) {
        saveZoom(hit.level)
      }
    } else if (hit?.kind === 'backdrop') {
      const on = !ambience.isEnabled()
      ambience.setEnabled(on)
      saveBackdrop(on)
    }
  }
  drawSettings(
    ctx,
    sfx.isMuted(),
    sfx.volume(),
    ambience.isEnabled(),
    zoomLevel(),
    playerName,
  )
}

function updateRoster(tap: { x: number; y: number } | null, clock: number): void {
  if (tap) {
    const hit = hitRoster(tap.x, tap.y)
    if (hit?.kind === 'class') {
      chooseOwn(hit.pick)
    } else if (hit?.kind === 'back') {
      // Backing out of a descent is backing out: the flag must not survive to
      // turn somebody's next ordinary pull into floor one.
      screen = startingDescent ? 'home' : mode.kind === 'raid' ? 'raid' : 'battleground'
      startingDescent = false
      return
    } else if (hit?.kind === 'pull') {
      startFight()
      return
    }
  }
  drawRoster(ctx, party, difficulty, clock, encounter, mode)
}

/**
 * Somebody else's fight, arriving in the address bar.
 *
 * The simulation reproduces from a seed, so a link does not have to point at a
 * recording — it carries the fight itself, and opening one drops you straight
 * onto the screen that starts it rather than on the front page.
 */
{
  const invite = parseInvite(typeof window === 'undefined' ? '' : window.location.hash)
  if (invite?.day !== undefined) {
    // A day's run ends at midnight, and so does the comparison it was shared
    // for. An old link still opens the daily screen — it just opens today's,
    // which is the only one anybody can still be beaten at.
    daily = dailyFor(dailyKey(new Date()), party[0] ?? DEFAULT_PARTY[0]!)
    screen = 'daily'
  } else if (invite?.boss !== undefined) {
    const at = ENCOUNTERS.findIndex((e) => e.id === invite.boss)
    if (at >= 0) {
      encounter = at
      mode = { kind: 'raid' }
      if (invite.size && invite.size !== party.length) resize(invite.size)
      if (invite.difficulty) difficulty = invite.difficulty
      // Following an invitation opens the rung it points at, and keeps it.
      // The chain is there so a new player meets the game in order, not to
      // stop somebody being invited past it — and locking the retry button
      // after they have already fought it once would only be a puzzle. Every
      // rung below is opened with it, since what is open is a prefix.
      const invited = tierOf(encounter, party.length, difficulty)
      if (invited >= 0) unlocked = Math.max(unlocked, invited)
      // And if the link named a setting that is not a rung at all, the setup
      // falls back rather than opening on something the screen draws locked.
      settleSetting()
      saveSetup()
      screen = 'roster'
    }
  }
  // Spent once it has been read. The link decides where the game opens, not
  // where it lives: leaving it in the bar means every reload for the rest of
  // the session drags you back to somebody else's fight.
  // `history` here is the game's own attempt log, so the browser's is reached
  // through the window rather than by its bare name.
  if (invite && typeof window !== 'undefined' && window.history?.replaceState) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }
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

  // Taken either way so it cannot be delivered late, and dropped while the
  // name field is open: the tap that closes the field by blurring it would
  // otherwise also press whatever is under it.
  const tapped = input.takeTapPoint()
  const tap = isEditingName() ? null : tapped

  // The fight behind the menus is stepped here rather than inside each screen,
  // so every screen that is not the game gets the same one at the same point
  // in it: walking from the front page into the party screen carries on the
  // pull that was already going rather than starting another.
  if (screen !== 'fight') ambience.advance(elapsed)

  if (screen !== 'fight' && screen !== 'history') {
    input.setMenuMode(true)
    if (screen === 'home') updateHome(tap, clock)
    else if (screen === 'raid') updateRaidSetup(tap)
    else if (screen === 'battleground') updateBgSetup(tap)
    else if (screen === 'daily') updateDaily(tap)
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
    if (hit === 'share') {
      const boss = ENCOUNTERS[state.encounter]
      const you = state.actors.find((a) => a.isPlayer)

      void share(
        killMessage(
          boss?.name ?? 'Unknown',
          boss?.id ?? '',
          party.length as RaidSize,
          difficulty,
          state.time,
          specLabel(party[0] ?? DEFAULT_PARTY[0]!),
          you ? (state.tally[you.id]?.mechanicHits ?? 0) : 0,
        ),
      ).then((how) => {
        shareSaid = how === 'copied' ? 'COPIED' : how === 'shared' ? 'SHARED' : 'NO LUCK'
        shareSaidAt = performance.now()
      })
      requestAnimationFrame(frame)
      return
    }
    if (hit === 'party') {
      screen = 'roster'
      requestAnimationFrame(frame)
      return
    }
    if (hit === 'next') {
      if (depth > 0) descendTo(depth + 1, state)
      else advanceTier()
    }
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

    // A descent ends where it ends, and the only thing kept is how deep.
    if (depth > 0 && state.outcome !== 'victory') {
      if (depth > deepest) {
        deepest = depth
        saveDeepest()
      }
      depth = 0
    }

    // A daily keeps its own row: the best answer to the day, not every answer.
    if (playingDaily) {
      dailyResults = foldDaily(
        dailyResults,
        daily.key,
        state,
        ENCOUNTERS[state.encounter]?.name ?? 'Unknown',
        specLabel(party[0] ?? DEFAULT_PARTY[0]!),
      )
      saveDaily(dailyResults)
    }
    // Pressing the advance button is not what opens the next rung; killing
    // this one is. Leaving through CHANGE PARTY after a kill must not cost the
    // progress that kill earned.
    //
    // Read off the fight rather than off the setup screen: the player may
    // already have walked back and changed both while the corpse was still on
    // the floor, and what was cleared is what was fought.
    if (state.outcome === 'victory' && state.mode === 'raid' && state.depth === 0) {
      const opened = cleared(unlocked, state.encounter, state.party.length, state.difficulty)
      if (opened !== unlocked) {
        unlocked = opened
        saveSetup()
      }
    }
    const at = Date.now()
    const entry = record(state, at)
    if (entry) {
      history = append(history, entry)
      saveHistory(history)

      // Read after the record is written, so this pull is the latest one in it.
      const boss = ENCOUNTERS[state.encounter]
      const moving = boss ? trend(history, boss.id, state.difficulty) : null
      setTrendLine(
        moving
          ? moving.delta < -0.5
            ? `${Math.abs(moving.delta).toFixed(1)}s faster than your last kill — ${moving.kills} kills on this one`
            : moving.delta > 0.5
              ? `${moving.delta.toFixed(1)}s slower than your last kill — ${moving.kills} kills on this one`
              : `same pace as your last kill — ${moving.kills} kills on this one`
          : null,
      )
    }

    // Judged after the record is written, since some of them are about the
    // record rather than about the pull.
    const fresh = checkAwards(state, history, awards, at)
    if (fresh.length > 0) {
      saveAwards(awards)
      announced = fresh.map((award) => ({ award, age: 0 }))
    }

    // And anything that just beat its old number, announced the same way: the
    // difference between a record and a thing you notice is being told.
    const moved = beat(bests, state, depth)
    bests = moved.bests
    if (moved.beaten.length > 0) {
      saveBests(bests)
      announced = [
        ...announced,
        ...moved.beaten.map((item) => ({
          award: { id: item.name, name: item.name, detail: item.detail, earned: () => false },
          age: 0,
        })),
      ]
    }
  }

  setShareLabel(fresh(shareSaid, shareSaidAt) ?? null)

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

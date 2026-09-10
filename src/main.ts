import { Input } from './input'
import { resetView } from './render/camera'
import { MAX_CATCHUP_TICKS, advance, type Clock } from './loop'
import { drawWorld } from './render/draw'
import {
  callSlots,
  canAdvance,
  drawHud,
  hitOutcome,
  outcomeButtons,
  partyButton,
  setOpenedLine,
  setShareLabel,
  setTrendLine,
  shareRect,
} from './render/hud'
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
import {
  fold as foldNote,
  load as loadNotes,
  save as saveNotes,
  type Notes,
} from './notes'
import { beat, load as loadBests, save as saveBests, type Bests } from './bests'
import {
  begin as beginCompose,
  close as closeCompose,
  legal as legalCompose,
  pressAuto,
  pressReroll,
  pressSlot,
  pressSpec,
  repair,
  type Composing,
} from './compose'
import { drawComposition, hitComposition } from './render/composition'
import { Effects } from './render/effects'
import { loadName, nameThePlayer, saveName } from './name'
import { editName, isEditingName } from './render/nameinput'
import { Ambience, loadBackdrop, saveBackdrop, setAmbience } from './render/ambience'
import { Hints } from './render/hints'
import { drawRoster, hitRoster, sameMode, type RosterMode } from './render/roster'
import {
  DIFFICULTY_ORDER,
  drawBgSetup,
  drawDaily,
  drawHome,
  drawRaidSetup,
  drawCitadel,
  drawCredits,
  drawSettings,
  hitBgSetup,
  hitCitadel,
  hitDaily,
  hitHome,
  hitRaidSetup,
  hitCredits,
  hitSettings,
  settingsLayout,
  type RaidField,
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
import { createBattlegroundState, createCorridorState, createState } from './sim/state'
import { ENCOUNTERS, encounterIndex } from './sim/encounters'
import {
  FIRST_TIER,
  LADDER,
  RUNGS_PER_BOSS,
  cleared,
  doorSetting,
  moved,
  nextDoor,
  nextSetting,
  pressDifficulty,
  pressSize,
  settle,
  tierAt,
  tierLabel,
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
import {
  cleared as clearedRoom,
  enter as enterChamber,
  isCleared,
  stepTo,
  wayOpen,
  stepped,
  throughDoor,
  walkedTo,
  abandon as abandonRun,
  instanceAt,
  lockAt,
  load as loadRun,
  resetsAt,
  roomSeed,
  save as saveRun,
  startRun,
  wiped as wipedRoom,
  type Run,
} from './citadel'
import {
  CHAMBERS,
  PASSAGES,
  chamberAt,
  citadelPacks,
  citadelSprings,
  citadelWorld,
  standing as fightBuilt,
  groundFor,
  hallFor,
  passageKey,
  roomOf,
  placeOf,
} from './dungeon'
import type { Corridor } from './sim/travel'
import { insideRoom, type RoomShape } from './sim/room'
import type { SimState, Vec2 } from './sim/types'

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
function resize(size: number): void {
  party = randomAround(size, party[0] ?? DEFAULT_PARTY[0]!, Math.random)
  saveSetup()
}

let party = loadParty()

/**
 * The raid while it is being built.
 *
 * Held apart from `party` and copied back on every press rather than edited
 * in place, because the rules that say what a raid may be live in `compose`
 * and a half-applied press is a raid nothing checked. Seeded on the way into
 * the screen, so leaving and coming back reads the raid as it now stands.
 */
let composing: Composing = beginCompose(party)
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
 * What has been learned about each boss, and which page of it is open.
 *
 * Written after every raid pull and read by nothing in a fight: the record is
 * the only thing a kill pays out in a game where no stat on the character
 * moves.
 */
let notes: Notes = loadNotes()
let openNote: number | null = null
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
 * Whether the fight on screen is somebody else's, arriving by link.
 *
 * An invitation names one boss at one setting, so it is the one raid that is
 * still a single fight rather than an evening: the class screen it lands on
 * has to pull that fight, not walk into the building. Cleared the moment the
 * player chooses anything for themselves.
 */
let visiting = false

/**
 * The evening in the citadel, or null when there is not one.
 *
 * Held here rather than in the simulation for the same reason the setting is:
 * what the results screen does next is decided in this file, and this is the
 * answer to "what was this fight part of".
 */
let run: Run | null = loadRun()
/**
 * The building's own floor, which every state of an evening stands on.
 *
 * Built per evening rather than once, because it is not the same floor all
 * evening: a passage held shut by something still alive is not laid, so the
 * ground the party can stand on ends at the wall of the room they are in and
 * grows when the thing goes down. That is the only way a shut door can mean
 * anything on a floor this continuous — a door that is merely missing from a
 * list of ways out is a door you walk straight through, and the citadel was
 * one you could walk from the entrance to the crossing without fighting.
 *
 * Read off `run.cleared` every time it is handed over, so nothing has to
 * remember to rebuild it.
 */
function floorNow(): RoomShape[] {
  return citadelWorld(new Set(run?.cleared ?? [])).map((cell) => cell.room)
}

/** Which room the fight on screen is in, and what the party walked into it with. */
let roomId: string | null = null
/**
 * The room the party is standing in with nothing alive in it.
 *
 * Held apart from `roomId`, which means "there is a fight or a walk on
 * screen": standing in a cleared room is neither, and the difference decides
 * whether the button on the class screen pulls or opens a door.
 */
let standing: string | null = null
/** The door whose ground is being taken, when the fight on screen is a walk. */
let walkKey: string | null = null
let roomCarried: number[] = []

/**
 * The fight the door opens onto.
 *
 * Read off the map rather than assumed to be encounter zero: the way up is
 * single file until the crossing, so the first room with a built fight in it
 * is the first fight of every evening, and which index that is belongs to
 * `dungeon.ts`.
 */
function firstFight(): number {
  const first = CHAMBERS.find((c) => c.encounter !== null && c.encounter < ENCOUNTERS.length)
  return first?.encounter ?? 0
}
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
  | 'composition'
  | 'settings'
  | 'citadel'
  | 'credits'
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

function newState(at?: Vec2, standing?: Vec2[]): SimState {
  // Whatever the last pull opened, it opened it last pull. Cleared here
  // rather than at each of the five places a fight starts, since every one of
  // them comes through this.
  setOpenedLine(null)

  // The name goes on afterwards rather than into the simulation: it changes
  // nothing about a fight, the harness must not depend on what is in storage,
  // and a replay from a seed has to be the same fight whoever is playing it.
  const named = (s: SimState): SimState => {
    nameThePlayer(s, playerName)
    return s
  }
  return named(buildState(at, standing))
}

function buildState(at?: Vec2, standing?: Vec2[]): SimState {
  if (mode.kind === 'bg') {
    return createBattlegroundState(BASE_SEED + bgRolls++ * 7919, mode.bg, party)
  }
  // A daily runs on the day's seed and carries the day's twist; an ordinary
  // pull runs on the house seed and carries none, because a fight you are
  // learning has to be the same fight on the ninth attempt as on the first.
  if (playingDaily) {
    return createState(daily.seed, 0, party, difficulty, encounter, daily.affix)
  }
  if (run && roomId) {
    // The room's own seed rather than the pull count's: the same room in the
    // same evening is the same fight, so a wipe and the try after it are two
    // attempts at one thing.
    return createState(roomSeed(run, roomId), attempt, party, run.difficulty, encounter, null, at, standing)
  }
  return createState(BASE_SEED, attempt, party, difficulty, encounter)
}

/**
 * Pulling the fight in the room the party is standing in.
 *
 * The party carries what it walked out of the last room with: whatever health
 * it had plus a little back, and one of the fallen on their feet. What the
 * little back should be bought with is the walk between the two — see
 * `walkTo`, which is where the recovery will move when it is time-based.
 */
function enterRoom(id: string): void {
  const chamber = chamberAt(id)
  if (!run || !chamber || chamber.encounter === null) return
  standing = null
  // A room whose fight is down is a room to walk through. Pressing it again
  // used to re-pull it, which would let an evening farm its own first boss.
  if (isCleared(run, id)) return
  run = enterChamber(run, id)
  roomId = id
  walkKey = null
  roomCarried = [...run.carried]
  difficulty = run.difficulty
  playingDaily = false
  mode = { kind: 'raid' }
  attempt = 0
  recorded = false
  graded = false
  announced = []
  encounter = chamber.encounter
  // The fight happens in the room the party walked into, not in a copy of it
  // centred on the middle of the world.
  // Walked in rather than placed: the fight starts with everybody where the
  // walk left them, and the count is spent taking position.
  state = newState(placeOf(id), whereTheyStand())
  state.chamber = id
  // The room, and only the room. A fight's floor used to be the whole citadel,
  // which is what the walk needs and is the wrong answer the moment something
  // in the room is alive: a player could walk out of the boss's door and stand
  // in the corridor while the raid fought it. Nothing about that was a
  // decision — it was the walk's floor left switched on.
  //
  // Everybody walked in on their own feet and the doorway is a step behind
  // them, so what this costs is a straggler still in it being set down inside;
  // the countdown then walks the raid into formation, which it was already
  // doing.
  state.floor = [state.room]
  rng = rngFor(state)

  carryInto(state)

  fightingParty = party.map((p) => ({ ...p }))
  fightingDifficulty = difficulty
  fightingEncounter = encounter
  fightingMode = mode
  timing = { ...timing, accumulator: 0 }
  saveRun(run)
  screen = 'fight'
}

/**
 * The party, in the state the last room left it.
 *
 * Whatever health it had plus a little back, and one of the fallen on their
 * feet. A full heal between rooms would make every room the first room;
 * nothing at all would mean a party that finished at ten percent has already
 * lost the next one and is being told so a minute later.
 */
/**
 * The party, in the state the last room left it.
 *
 * Verbatim, with nothing given back. What a door gives back is the door's, in
 * `throughDoor` — a room is walked into and out of freely now, so a room that
 * healed on the way in would be a room you could stand in the doorway of.
 */
function carryInto(fight: SimState): void {
  fight.actors
    .filter((a) => a.faction === 'party')
    .forEach((a, i) => {
      const was = roomCarried[i]
      if (was === undefined) return
      if (was >= 0) {
        a.hp = Math.max(1, Math.min(a.maxHp, Math.round(a.maxHp * was)))
        return
      }
      a.alive = false
      a.hp = 0
    })
}

/**
 * Taking the ground behind a door.
 *
 * The same carry-over a room gets, because it is the same party arriving
 * somewhere in the state it left the last place in — and the same seed rule,
 * so a corridor walked twice in one evening is the same corridor.
 */
/**
 * Whether there is a door to this room on the floor of the one we are in.
 *
 * One question, and it is the citadel's: is that passage open. Asked through
 * `stepTo` rather than re-derived, because a door that is drawn by one rule
 * and opened by another is a door the party walks into and bounces off, and
 * the build caught exactly that: the plagueworks drew a door to the laboratory
 * that the step then refused.
 *
 * It used to ask the chain as well — whether this evening's size and
 * difficulty had been earned for the fight in there — and that made the
 * building unwalkable. The chain runs a boss's six settings before it reaches
 * the next boss at all, so the citadel's second room did not open until the
 * first had been cleared six times. A raid is a building you walk through, and
 * a building whose second door needs six evenings is a boss list with a
 * corridor drawn on it. What the chain is for is which settings an evening may
 * be *started* at; where the party may walk once it has started is the
 * building's own business, and the building already says it — the door to the
 * oratory is held by the thing standing in the spire.
 */
function canGoTo(to: string): boolean {
  return run !== null && wayOpen(run, to)
}

/** Whether the room the party is standing in still has something in it. */
function fightAwaits(id: string): boolean {
  const chamber = chamberAt(id)
  if (!run || !chamber || chamber.encounter === null) return false
  if (chamber.encounter >= ENCOUNTERS.length) return false
  return !isCleared(run, id)
}

/**
 * Standing in a room with nothing alive in it.
 *
 * Not a screen and not a pause: it is the room, walked in, with its doors on
 * the floor. Going on is walking to one — which is the whole of what this
 * change is for, since the alternative is a list of rooms with a picture
 * behind it.
 */
/**
 * The room the party is standing in, or null while they are between two.
 *
 * The middle of the raid rather than any one body, because half of them in a
 * doorway is not half an arrival: a room is somewhere the party is, and the
 * party is where most of it is.
 */
function roomUnderfoot(): string | null {
  const bodies = state.actors.filter((a) => a.faction === 'party' && a.alive)
  if (bodies.length === 0) return null
  const mid = {
    x: bodies.reduce((n, a) => n + a.pos.x, 0) / bodies.length,
    y: bodies.reduce((n, a) => n + a.pos.y, 0) / bodies.length,
  }
  for (const chamber of CHAMBERS) {
    if (insideRoom({ ...roomOf(chamber.id), at: placeOf(chamber.id) }, mid, 0)) return chamber.id
  }
  return null
}

/**
 * Where every body is standing, right now.
 *
 * Handed to whatever the party walks into next, so that walking into it is a
 * walk: the ground under them changes and they do not move. Null before an
 * evening has begun, which is the one time nobody is anywhere yet.
 */
function whereTheyStand(): Vec2[] | undefined {
  if (state.mode !== 'travel' || state.chamber === null) return undefined
  const bodies = state.actors.filter((a) => a.faction === 'party')
  if (bodies.length !== party.length) return undefined
  return bodies.map((a) => ({ x: a.pos.x, y: a.pos.y }))
}

function standIn(id: string, from: string | null): void {
  if (!run) return
  roomId = null
  walkKey = null
  standing = id
  roomCarried = [...run.carried]
  difficulty = run.difficulty
  playingDaily = false
  mode = { kind: 'raid' }
  attempt = 0
  recorded = false
  graded = false
  announced = []
  // Square to the world, because the walk will not turn it again. Crossing a
  // building the view is arranged around nothing, so whatever bearing the last
  // fight ended on would be the bearing the citadel is walked at — and the
  // building is laid out so that up the screen is the way on.
  resetView()
  const carried = from === null ? undefined : whereTheyStand()
  // One walk for the whole evening: the building's own floor, every pack in it
  // already standing where it stands, and the doors of the room the party is
  // in. Reaching one of them changes which room they are in and nothing else —
  // there is no end to a walk across a citadel.
  const ground: Corridor = {
    ...hallFor(id, from, canGoTo),
    id: 'citadel',
    // What is standing in the ground that exists tonight. A pack in a passage
    // that has not been laid is a pack standing on nothing, drawn in the dark
    // beyond a wall the party cannot reach.
    packs: citadelPacks(new Set(run.cleared)),
    springs: citadelSprings(new Set(run.cleared)),
  }
  state = createCorridorState(
    roomSeed(run, 'citadel'),
    party,
    ground,
    run.difficulty,
    4,
    carried,
    true,
  )
  state.chamber = id
  // The whole building is underfoot, not just this room: a doorway is floor,
  // which is what lets the party stand in one.
  state.floor = floorNow()
  rng = rngFor(state)
  carryInto(state)
  fightingParty = party.map((p) => ({ ...p }))
  fightingDifficulty = difficulty
  fightingMode = mode
  timing = { ...timing, accumulator: 0 }
  saveRun(run)
  screen = 'fight'
}

/**
 * Through a door and into the next room.
 *
 * What is on the other side decides what happens, and there are only two
 * answers: something alive, which is a pull, or nothing, which is a room to
 * stand in and walk out of the far side of. No menu in between either way —
 * the evening is one continuous walk until something stops it.
 */
function arriveAt(to: string, from: string): void {
  if (!run) return
  if (fightAwaits(to)) {
    enterRoom(to)
    return
  }
  standIn(to, from)
}

/**
 * A door taken: the walk if it has ground behind it, the step if it has not.
 *
 * The two used to be a press on a map and a press on a map. They are the same
 * act now — leaving by a door — and what is behind it is the door's business
 * rather than the player's.
 */
function goThrough(to: string, carried: number[]): void {
  if (!run) return
  const at = run.at
  const step = stepTo(run, to)
  if (step.kind === 'walk') {
    // The ground is the walk, so it is paid in the walking. What the party
    // crossed the room with is what it starts the corridor with.
    run = { ...run, carried }
    saveRun(run)
    walkTo(step.to, step.key, groundFor(at, step.to) ?? step.corridor)
    return
  }
  if (step.kind === 'shut') {
    // The door was open when it was drawn and is not now, which is a kill
    // somewhere else having closed it. Stay put rather than walk into a wall.
    standIn(at, null)
    return
  }
  // A pad skips the walk, so it skips what the walk was worth.
  run = stepped(run, to, step.kind === 'jump' ? carried : throughDoor(carried))
  saveRun(run)
  arriveAt(to, at)
}

function walkTo(to: string, key: string, walk: Corridor): void {
  if (!run) return
  standing = null
  roomId = to
  walkKey = key
  roomCarried = [...run.carried]
  difficulty = run.difficulty
  playingDaily = false
  mode = { kind: 'raid' }
  attempt = 0
  recorded = false
  graded = false
  announced = []
  state = createCorridorState(roomSeed(run, key), party, walk, run.difficulty, 4, whereTheyStand())
  state.chamber = to
  state.floor = floorNow()
  rng = rngFor(state)
  carryInto(state)
  fightingParty = party.map((p) => ({ ...p }))
  fightingDifficulty = difficulty
  fightingMode = mode
  timing = { ...timing, accumulator: 0 }
  saveRun(run)
  screen = 'fight'
}

/** What the party walked out with, as a fraction each, and -1 for the fallen. */
function carriedOut(fight: SimState): number[] {
  return fight.actors
    .filter((a) => a.faction === 'party')
    .map((a) => (a.alive ? Math.max(0, a.hp / a.maxHp) : -1))
}

/**
 * The map screen: the one question an evening asks, which is where next.
 *
 * A room only answers if the chain has opened it at the size and difficulty
 * the evening is being played at. The citadel is a place to walk the ladder
 * through, not a way around it.
 */
function updateCitadel(tap: { x: number; y: number } | null): void {
  if (!run) {
    screen = 'home'
    return
  }
  // Rooms with a fight in them that is actually built. It used to be the
  // rooms the chain had bought at tonight's setting, and that answer stopped
  // being true the day the walk stopped asking the chain: the map would call
  // an evening finished with six bosses still standing in it, because the
  // chain had not reached them yet and the party could walk to them anyway.
  // What ends an evening is nothing left alive that the party can reach.
  const allowed = new Set(CHAMBERS.filter((c) => fightBuilt(c.id)).map((c) => c.id))
  // Where to walk in next when this one has nothing left. The screen decides
  // whether to offer it — it only does when the map is genuinely stuck — and
  // this is only the answer to "at what".
  const climb = nextDoor(unlocked, run.size, run.difficulty)
  const again = climb ? tierLabel(climb) : null
  if (tap) {
    const hit = hitCitadel(run, tap.x, tap.y, allowed, again)
    if (hit?.kind === 'back') {
      screen = 'home'
      return
    }
    if (hit?.kind === 'abandon') {
      // Given up if it is still allowed to be given up, and otherwise only
      // stepped out of: the building is locked for the week the moment
      // something in it dies. `abandon` knows which of the two this is.
      abandonRun(run)
      run = null
      roomId = null
      standing = null
      screen = 'home'
      return
    }
    if (hit?.kind === 'again' && climb) {
      // The evening is over, and the next one is the same building one rung
      // up. Started here rather than sending the player back out to the two
      // fields, which would ask them to work out for themselves which rung
      // the one they just finished was.
      difficulty = climb.difficulty
      if (climb.size !== party.length) resize(climb.size)
      saveSetup()
      run = instanceAt(climb.size, climb.difficulty) ?? startRun(Date.now(), climb.size, climb.difficulty)
      roomId = null
      saveRun(run)
      // Straight back to the door of the new evening, in it.
      standIn(run.at, null)
      return
    }
    if (hit?.kind === 'room') {
      // The map is a map now, not the way through the building: what it still
      // does is the pads, which are the one thing on it that is travel rather
      // than a picture — a walk you earned the right not to make. Everywhere
      // else you go by walking, so a press does nothing.
      if (stepTo(run, hit.id).kind !== 'jump') return
      goThrough(hit.id, run.carried)
      return
    }
  }
  drawCitadel(ctx, run, allowed, again, resetsAt(lockAt(Date.now())) - Date.now())
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
  // A raid is keyed off the pull count, so the ninth attempt at a boss is not
  // the first one again. Everything else carries its own seed: a battleground
  // is the seed its map was rolled from, and a corridor is the room's, which
  // is what makes a second try at it the same corridor.
  return new Rng(fight.mode === 'raid' ? BASE_SEED + attempt * 7919 : fight.seed)
}

let rng = rngFor(state)

/**
 * Back into whatever the evening is standing in, room or held ground.
 *
 * One place rather than two. A retry after a wipe and a re-entry after a
 * class change ask the same question — what is this evening in the middle of
 * — and answering it in two places is how a corridor comes to be rebuilt as
 * the room at the far end of it. False when there is nothing to go back into,
 * so the caller can fall through to an ordinary pull.
 */
function reenter(): boolean {
  if (!run) return false
  // Standing in a cleared room: back into the room, not into a fight. It is
  // still somewhere the party is, so leaving the class screen has to put them
  // back in it rather than start the evening again.
  if (roomId === null) {
    if (standing === null) return false
    standIn(standing, null)
    return true
  }
  if (walkKey !== null) {
    const passage = PASSAGES.find((p) => passageKey(p.from, p.to) === walkKey)
    if (!passage?.corridor) return false
    walkTo(roomId, walkKey, groundFor(passage.from, passage.to) ?? passage.corridor)
    return true
  }
  const chamber = chamberAt(roomId)
  if (!chamber || chamber.encounter === null || isCleared(run, roomId)) return false
  enterRoom(roomId)
  return true
}

function restart(): void {
  // A room of the citadel is retried as a room: the evening keeps what it has
  // already killed, and the party goes back to what it walked in with rather
  // than to full.
  if (run && roomId !== null) {
    run = wipedRoom(run, roomCarried)
    saveRun(run)
    if (reenter()) return
  }
  // Standing in a cleared room and pressing retry: back into the room. A room
  // with nothing in it cannot be wiped in, so there is nothing to give back —
  // but the key is on the keyboard and it must not build a boss fight out of
  // whatever the setting happens to say.
  if (run && standing !== null) {
    standIn(standing, null)
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
 * Out of the class screen, which is no longer always into a fight.
 *
 * A battleground is one match and an invitation is one boss, so both of those
 * pull. A raid is a building: the party walks in at the threshold and the
 * next press is on the map. This is the whole of the change the front page
 * advertises — the class screen used to be the last thing before a boss you
 * had picked off a list, and it is now the last thing before a door.
 */
function walkIn(): void {
  if (!atTheDoor()) {
    startFight()
    return
  }
  // Standing in a room already: back into it. Coming out to change class and
  // going back in is not the start of an evening.
  if (run && standing !== null) {
    standIn(standing, null)
    return
  }
  // The instance for tonight's setting, resumed. Four settings are four
  // separate places — killing the first boss with ten on normal says nothing
  // about the same boss with twenty-five on heroic — so which one the press
  // opens is read off the fields the player just set rather than off whichever
  // one they happened to be in last.
  const want = party.length as RaidSize
  if (!run || run.size !== want || run.difficulty !== difficulty) {
    run = instanceAt(want, difficulty) ?? startRun(Date.now(), want, difficulty)
    roomId = null
    standing = null
  }
  saveRun(run)
  // At the door, in it. An evening used to open on a plan of the building
  // with the first room a press away; it opens standing in the first room.
  standIn(run.at, null)
}

/**
 * Whether the class screen's button opens a door or starts a fight.
 *
 * One answer, read by the button's label and by what the press does, so the
 * two cannot say different things. A battleground and somebody else's link
 * are single fights; so is a room the party stepped out of to change class,
 * which is what the room test is for.
 */
function atTheDoor(): boolean {
  return mode.kind === 'raid' && !visiting && roomId === null
}

/**
 * A changed party starts its own progression, since the AI's learning is
 * tied to how many times *these* five have pulled. Leaving the screen without
 * changing anything keeps the progress.
 */
function startFight(): void {
  // Face the fight the way it starts rather than the way the last one ended.
  // The view swings slowly on purpose, so one carried over would spend the
  // opening seconds unwinding a bearing that belonged to a different fight.
  resetView()

  // Anything started from the class screen is a normal pull, whatever was
  // played before it.
  playingDaily = false
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
    // A room or a stretch of held ground is rebuilt as what it is. Rebuilt as
    // an ordinary pull instead, the fight would forget which room it was in
    // and the party would walk in on full health rather than on what the last
    // room left them.
    if (reenter()) return
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
  // And repaired rather than re-rolled when no trade works. Rolling the raid
  // again was free while the raid was rolled anyway; now that it can be built
  // by hand it is the difference between changing your spec and losing the
  // twenty-four people you placed.
  party = traded ?? repair(party, pick)
  saveSetup()
}

function updateHome(tap: { x: number; y: number } | null, clock: number): void {
  if (tap) {
    const hit = hitHome(tap.x, tap.y)
    if (hit === 'raid') {
      mode = { kind: 'raid' }
      // Nobody is following a link any more: pressing RAID is walking into
      // the building yourself, and the one-off fight an invitation opens is
      // over the moment you leave it.
      visiting = false
      // A battleground forces the roster to five and leaves the difficulty
      // where it was, so coming back out of one can land on a pair this save
      // has not earned. Settled against the door rather than against whatever
      // boss the setting was last pointed at — the pair is what the setup
      // screen asks for now, and the door is what it is asked against.
      const door = settle(unlocked, doorSetting(party.length as RaidSize, difficulty))
      difficulty = door.difficulty
      if (door.size !== party.length) resize(door.size)
      saveSetup()
      // An evening already going is resumed where it stands rather than
      // re-asked for its settings: it is the one thing in this game long
      // enough to be interrupted, which is why it is the one thing saved
      // mid-way. A fresh one asks the two questions it has.
      if (run) {
        if (run.size !== party.length) resize(run.size)
        difficulty = run.difficulty
        // Back into the room the evening was left standing in, rather than
        // onto a plan of it.
        standIn(run.at, null)
        return
      }
      screen = 'raid'
      return
    }
    if (hit === 'battleground') {
      screen = 'battleground'
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

/** Which of the raid screen's three fields has its list down, if any. */
let raidOpen: RaidField | null = null

function updateRaidSetup(tap: { x: number; y: number } | null): void {
  if (tap) {
    const hit = hitRaidSetup(tap.x, tap.y, raidOpen)
    if (hit?.kind === 'back') {
      raidOpen = null
      screen = 'home'
      return
    }
    if (hit?.kind === 'next') {
      raidOpen = null
      // The first room of the building is the fight the class screen shows,
      // because the way up is single file until the crossing: whatever else
      // this evening turns out to be, the first thing in it is this.
      encounter = firstFight()
      screen = 'roster'
      return
    }
    if (hit?.kind === 'dismiss') {
      raidOpen = null
    } else if (hit?.kind === 'open') {
      raidOpen = raidOpen === hit.field ? null : hit.field
    } else if (hit?.kind === 'choose') {
      // All three fields are one answer, and the rules for what a press does
      // live with what is open rather than here: a press onto something
      // locked comes back unchanged — it is listed locked rather than being
      // absent, since what is left up there is worth knowing — and a press
      // that opens a field may bring another one down with it.
      const before = doorSetting(party.length as RaidSize, difficulty)
      const next =
        hit.field === 'size'
          ? pressSize(unlocked, before, RAID_SIZES[hit.index]!)
          : pressDifficulty(unlocked, before, DIFFICULTY_ORDER[hit.index]!)
      // Only the pair moves. The encounter on a door setting is the first
      // fight and is there to say what "open" means, not to be chosen.
      difficulty = next.difficulty
      if (next.size !== party.length) resize(next.size)
      saveSetup()
      // A press that changed nothing was a press onto a locked rung, and
      // shutting the list on it would read as the press having been taken.
      if (moved(before, next)) raidOpen = null
    }
  }
  drawRaidSetup(ctx, unlocked, party.length, difficulty, raidOpen)
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
    if (hit?.kind === 'credits') {
      screen = 'credits'
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

/**
 * The credits screen, which asks nothing and answers one button.
 *
 * Its own screen rather than a panel on the settings one: what is on it is a
 * licence condition rather than a preference, and a condition folded into a
 * row of toggles is a condition nobody reads.
 */
function updateCredits(tap: { x: number; y: number } | null): void {
  if (tap && hitCredits(tap.x, tap.y) === 'back') {
    screen = 'settings'
    return
  }
  drawCredits(ctx)
}

function updateRoster(tap: { x: number; y: number } | null, clock: number): void {
  if (tap) {
    const hit = hitRoster(tap.x, tap.y)
    if (hit?.kind === 'class') {
      chooseOwn(hit.pick)
    } else if (hit?.kind === 'back') {
      // Back to wherever the class screen was reached from: the map while an
      // evening is going, the two settings before one is, and the front page
      // when the fight belongs to somebody else.
      screen =
        mode.kind !== 'raid' ? 'battleground' : visiting ? 'home' : run ? 'citadel' : 'raid'
      return
    } else if (hit?.kind === 'compose') {
      // Seeded here rather than kept in step with `party`: the board has to
      // open on the raid as it now stands, and the class screen can have
      // moved slot zero since the last time this screen was open.
      composing = beginCompose(party)
      screen = 'composition'
      return
    } else if (hit?.kind === 'pull') {
      walkIn()
      return
    }
  }
  // The room, when there is one, rather than a boss the party is not standing
  // in front of: coming out of a cleared room to change class, this screen was
  // headlining whatever fight the setting last pointed at.
  drawRoster(
    ctx,
    party,
    difficulty,
    clock,
    encounter,
    mode,
    atTheDoor(),
    standing === null ? null : (chamberAt(standing)?.name ?? null),
  )
}

/**
 * Who else is coming.
 *
 * Every press goes through `compose`, and what comes back is written to the
 * party and saved immediately — there is no confirm step, because the board
 * is already showing the answer and a raid that only counted once you pressed
 * DONE would be a second place for the rules to be enforced.
 *
 * An illegal raid cannot be reached: `pressSpec` refuses the press and says
 * why rather than taking it and locking the pull. So there is nothing to
 * guard on the way out.
 */
function updateComposition(tap: { x: number; y: number } | null): void {
  if (tap) {
    const hit = hitComposition(tap.x, tap.y, composing)
    if (hit?.kind === 'back') {
      // The one button that means two things, and the open list gets first
      // claim: a list over the board with no way back but the one that also
      // leaves the screen is a list you cannot change your mind out of.
      if (composing.selected !== null) {
        composing = closeCompose(composing)
      } else {
        screen = 'roster'
        return
      }
    } else if (hit?.kind === 'slot') {
      composing = pressSlot(composing, hit.index)
    } else if (hit?.kind === 'spec') {
      composing = pressSpec(composing, hit.pick)
      applyComposition()
    } else if (hit?.kind === 'auto') {
      composing = pressAuto(composing)
      applyComposition()
    } else if (hit?.kind === 'reroll') {
      composing = pressReroll(composing, Math.random)
      applyComposition()
    } else if (hit?.kind === 'dismiss') {
      composing = closeCompose(composing)
    }
  }
  drawComposition(ctx, composing)
}

/**
 * Puts the board back onto the game's own party.
 *
 * Guarded on legality even though `compose` refuses illegal presses: this is
 * the one line that can hand a raid to a pull, and a rule worth having is
 * worth having at the point it would be broken rather than only upstream
 * of it.
 */
function applyComposition(): void {
  if (!legalCompose(composing)) return
  party = composing.party.map((p) => ({ ...p }))
  saveSetup()
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
      // One boss, one setting, and no evening around it.
      visiting = true
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
    else if (screen === 'citadel') updateCitadel(tap)
    else if (screen === 'credits') updateCredits(tap)
    else if (screen === 'composition') updateComposition(tap)
    else updateRoster(tap, clock)
    requestAnimationFrame(frame)
    return
  }

  if (screen === 'history') {
    input.setMenuMode(true)
    if (tap) {
      const hit = hitHistory(
        tap.x,
        tap.y,
        history.map((e) => e.standings.length),
        historyTab,
        openNote,
      )
      // With a page open, the way out is out of the page. Leaving the screen
      // from inside one would drop the reader two levels for one press.
      if (hit?.kind === 'back') {
        if (openNote !== null) openNote = null
        else screen = 'home'
      } else if (hit?.kind === 'tab') {
        historyTab = hit.tab
        openNote = null
      } else if (hit?.kind === 'boss') {
        openNote = hit.index
      }
    }
    drawHistory(ctx, history, awards, historyTab, notes, openNote)
    requestAnimationFrame(frame)
    return
  }

  input.setMenuMode(false)

  // The stick answers anywhere the fight is not already showing a control.
  // The ability buttons and the autocast toggle test for themselves inside
  // `Input`; these are the ones only this file knows are on screen.
  {
    const taken = [partyButton()]
    // The call row is drawn by the HUD and tapped here, so the stick has to be
    // told about it the same way the party button is.
    for (const c of callSlots(state)) taken.push({ x: c.x, y: c.y, w: c.size, h: c.size })
    if (state.outcome !== 'ongoing') {
      const buttons = outcomeButtons(canAdvance(state))
      for (const r of [buttons.next, buttons.retry, buttons.party, shareRect(state)]) {
        if (r) taken.push(r)
      }
    }
    input.setReserved(taken)
  }

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
      if (run && roomId) {
        // A room won: it stays won, and the party is standing in it with the
        // doors on the floor. Not a plan of the building — the room.
        run = clearedRoom(run, roomId, carriedOut(state))
        saveRun(run)
        standIn(roomId, null)
      } else advanceTier()
    }
    else if (hit === 'retry') restart()
  }
  // A tap on the call row, before anything else can claim the point.
  if (tap) {
    for (const [i, c] of callSlots(state).entries()) {
      if (tap.x >= c.x && tap.x <= c.x + c.size && tap.y >= c.y && tap.y <= c.y + c.size) {
        input.requestCall(i)
        break
      }
    }
  }

  // Resolved here rather than in `Input`, which knows keys and pixels but not
  // which classes this roster brought.
  const called = input.takeCall()
  const callRow = called === null ? [] : callSlots(state)
  const call = called !== null && called < callRow.length ? callRow[called]!.slot.classId : null

  if (input.takeRestart()) restart()

  let ticks = 0
  while (timing.accumulator >= DT && ticks < MAX_CATCHUP_TICKS) {
    const player = input.consume()
    // Only the first tick of a frame carries it: a press is one call, and a
    // frame that catches up three ticks would otherwise spend three cooldowns.
    if (ticks === 0 && call) player.call = call
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

  // Which room the party has walked into.
  //
  // Read off where they are standing rather than off a door they touched: on
  // one continuous floor there is no moment of arrival to catch, only a party
  // that is now somewhere else. When that somewhere has a fight in it the
  // fight starts; when it does not, the doors on the floor become that room's
  // and the walk carries on without anything ending.
  if (state.mode === 'travel' && state.travel?.building === true && run && state.outcome === 'ongoing') {
    const here = roomUnderfoot()
    if (here !== null && here !== state.chamber) {
      const from = state.chamber
      run = stepped(run, here, run.carried)
      saveRun(run)
      standing = here
      state.chamber = here
      if (fightAwaits(here)) {
        enterRoom(here)
        requestAnimationFrame(frame)
        return
      }
      // The same walk, with this room's doors on the floor. Nothing about the
      // party changes — the ground under them is the same ground.
      const next = hallFor(here, typeof from === 'string' ? from : null, canGoTo)
      state.travel.corridor.room = next.room
      state.travel.corridor.ways = next.ways
    }
  }

  // A walk that finished walks on.
  //
  // No results over it and no map after it: crossing a room and taking a door
  // are the middle of a journey rather than the end of a fight, and a screen
  // between every pair of rooms is the list this was meant to replace. Only a
  // wipe stops the party, which is why the outcome is read rather than
  // assumed.
  if (state.mode === 'travel' && state.outcome === 'victory' && run) {
    const to = state.travel?.through ?? null
    if (to !== null) {
      const out = carriedOut(state)
      if (walkKey !== null && roomId !== null) {
        // Ground taken: the door is a door from here on, and the walk itself
        // was what mended the party.
        const from = run.at
        run = walkedTo(run, walkKey, roomId, out)
        saveRun(run)
        walkKey = null
        roomId = null
        arriveAt(to, from)
      } else {
        goThrough(to, out)
      }
      requestAnimationFrame(frame)
      return
    }
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

    // Every raid pull writes to the boss's page, the daily included: they are
    // all that boss doing that to you.
    notes = foldNote(notes, state)
    saveNotes(notes)

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
    if (state.outcome === 'victory' && state.mode === 'raid') {
      const opened = cleared(unlocked, state.encounter, state.party.length, state.difficulty)
      if (opened !== unlocked) {
        unlocked = opened
        saveSetup()
        // And what that rung is for. Said only on the pull that earned it: a
        // line that stayed up on every later kill would be a description of
        // where you are rather than of what you just did.
        //
        // A rung used to buy a mechanic and the line named it. It does not any
        // more — every setting throws the whole fight, the way the source's do
        // — so what a rung opens is either the next boss or more of you.
        const rung = tierAt(opened)
        const fight = ENCOUNTERS[rung.encounter]
        setOpenedLine(
          rung.encounter !== state.encounter
            ? `OPENED  ${fight?.name ?? 'the next fight'}`
            : `OPENED  ${tierLabel(rung).toLowerCase()}  ·  the same fight, ${rung.size} of you`,
        )
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
    const moved = beat(bests, state)
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

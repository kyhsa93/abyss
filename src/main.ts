/**
 * Elwynn Forest, drawn the way the art is drawn.
 *
 * The terrain is the client's own — `pipeline/bake_terrain.py` reads the
 * `.adt` height grid and the doodad placements out of the MPQ archives.  What
 * stands on it is Liberated Pixel Cup: pixel art, four directions, a real walk
 * cycle.
 *
 * The view is LPC's own — axis-aligned, looked down on from a tilt.  It is not
 * an isometric diamond grid, and that is deliberate: LPC's people are drawn
 * facing up, down, left and right, and rotating the world forty-five degrees
 * under them leaves every stride pointing somewhere the sprite is not.  The
 * art decides the projection.  Fighting it is the mistake this repository has
 * already made once, from the other direction, by putting a 3D renderer next
 * to 2D sprites.
 *
 * Height is carried by shading rather than by moving tiles.  A height grid can
 * be drawn as stepped terraces, but LPC has no cliff faces at arbitrary
 * heights, and inventing them means drawing — which this project cannot do.
 * So a hillside is a hillside because it is lit like one.
 */

import { armourOf, attackPower, critChance, damageAfter, dodgeChance, maxHealth, rollMelee, CREATURE_BLOCK, CREATURE_CRIT, CREATURE_DODGE, CREATURE_PARRY_HUMANOID, CRIT, GLANCING, HIT, MISS, OUTCOME_WORD, PARRY_WITH_WEAPON, type Stats, type Who } from './sim/stats.ts'
import { layerFor, still, ORDER, type DollMeta } from './sim/doll.ts'
import { lightAt, skyAt, SKY_WORD, CLEAR, SNOW, STORM } from './sim/sky.ts'
import { parries, SLOT_WORD, STAT_WORD } from './talk.ts'
import { between, roll, seed, reseed } from './sim/roll.ts'
import { migrate, read as readSave, wipe as wipeSave, write as writeSave, SAVE_VERSION, type Save } from './save.ts'
import { canWear, wear, withGear, wornArmour, I_ARMOUR, I_BUY, I_DELAY, I_HI, I_ILVL, I_LO, I_NEED, I_SLOT, I_WORD, K_ARMOUR, K_ID, type Item, type Shelf } from './sim/gear.ts'
import { mute, muteIsOn, play, ready as soundReady, wake, SOUNDS } from './sound.ts'
import { duel } from './sim/duel.ts'
import { threatFrom } from './sim/fight.ts'
import { abilityOf, bearing, coin, errand, goodsOf, josa, nameOf, reward as payFor, speak, tally, TRADE_WORD, zoneOf, type Direction, type Option, type Speech, type Topic } from './talk.ts'
import { layoutFor, touchpad } from './touch.ts'
import { hud as makeHud, type Layout, type Slot } from './hud.ts'
import {
  book, done as errandDone, type Held, hand, holding, killed, mark, offers,
  short, take, walked, wants, type Errand,
} from './sim/quest.ts'
import {
  mitigate, noticeAt, rageFrom, swing, xpFor, E_DAMAGE,
  ARMOUR, A_ATTACK_POWER, A_PERIODIC_DAMAGE,
  E_AURA, E_ENERGIZE, E_WEAPON_ADD,
  ENEMY, HI, HP, LO, MAX_RAGE, MELEE, QUARRY, STANCE, SWING, setMelee,
  aggressive, fightable, type Fight, type Spell,
} from './sim/fight.ts'

type Doodad = {
  k: string; x: number; y: number; z: number; r: number; s: number
  /**
   * How tall the client's own model is and half its footprint, in yards, both
   * already multiplied by this placement's scale.  The kind's own height is
   * the fallback and it was the only thing used: every tree in the forest
   * stood eight yards whether the client had put down a sapling or a
   * sixty-yard oak.
   */
  t?: number; w?: number
  /** Which of the kind's pictures, decided by the model and not the place. */
  v?: number
  /**
   * Which building placement this is, or which one put this piece down.
   *
   * A building's furniture is only hidden from outside once the scene knows
   * whose it is, and it used to work that out from where the piece stood — a
   * test a shelf against a wall fails, because the wall is the edge of the
   * mask.  The bake knows and now says.
   */
  h?: number
  /**
   * A building's own footprint: half along, half across, and the bearing of
   * the long side in degrees.  Only the ones a bridge is drawn from carry it.
   */
  bl?: number; bw?: number; ba?: number
  /** `[centre x, centre y, half along, half across, bearing]` per room. */
  rooms?: [number, number, number, number, number][]
  /** Which rasterised footprint, and how far the model is turned. */
  p?: number; mr?: number
  /**
   * Which area this building's *inside* is, out of `WMOAreaTable.dbc`.
   *
   * A building does not belong to the area the ground under it belongs to:
   * the hillside Northshire's abbey stands on is 86 and its nave is 24, and
   * the client keeps a second table to say so.
   */
  a?: number
  /** Set when the bearing is a coin toss — see the crossings below. */
  bq?: number
}
type Meta = {
  width: number; height: number; unit: number
  x0: number; y0: number; centre: [number, number]; bounds: number[]
  variety?: Record<string, number>
  /** `[w, h, cell yards, model x0, y0, base64 bits]` per model. */
  /**
   * A building from above, three masks over one grid: its outline, the part
   * of that outline a man cannot be in, and the part he can stand on.
   * `[w, h, cell yards, model x0, y0, outline, solid, floor]`.
   */
  plans?: Record<string, [number, number, number, number, number,
    string, string, string]>
  areaWidth?: number; areaHeight?: number; areaUnit?: number
  areaIds?: number[]
  /** Which area each of them sits inside, from `AreaTable.dbc`. */
  areaParent?: Record<string, number>
  /** And what level it is meant for, which is the same table's own column. */
  areaLevel?: Record<string, number>
  closed?: [number, number][]
  /** Where the client takes the floor out — a cave mouth — on the height grid. */
  gaps?: [number, number][]
  /** And the chunks it hands whole to a building, on the zone grid. */
  given?: [number, number][]
  zMin: number; zMax: number
  hasWater?: boolean
  /** What the client painted the ground with, at twice the height grid. */
  ground?: string[]
  groundWidth?: number; groundHeight?: number; groundUnit?: number
  doodads: Doodad[]
}
type Piece = { x: number; y: number; w: number; h: number; kind: string }
type NpcArt = {
  cell: number; cols: number; anchor: number
  kinds: Record<string, { first: number; frames: number; people: boolean; yards?: number }>
}
/** The drawn player: four poses, clips by name, one sheet. */
type HeroArt = {
  cell: number; cols: number
  clips: Record<string, { first: number; count: number }>
}
/**
 * `[x, y, kind, facing, level, role, topic]` — the first, fourth and sixth are
 * indices into `kinds` and `roles`, and the last into `topics`, or -1 for the
 * seven hundred who have nothing to say.
 */
type Spawns = {
  kinds: string[]; roles: string[]; topics: Topic[]
  /** Our words for what an item is — see `spawn_npcs.py`'s `GOODS`. */
  goods?: string[]
  /** `[min copper, max copper, [[goods, chance, min, max], …]]` per pocket. */
  hauls?: [number, number, number[][]][]
  /** What a fight with each distinct (kind, level) costs — see `fight.ts`. */
  fights?: Fight[]
  /** The same for the player, by level. */
  player?: Fight[]
  /** What each level costs, out of `player_xp_for_level`. */
  ladder?: number[]
  /**
   * The steepest ground the server itself walks a creature over, out of
   * `waypoint_data`.  The climbing limit, measured rather than chosen.
   */
  walk?: number
  /**
   * How each kind of spawn moves, deduplicated: `[walk multiplier, run
   * multiplier, notice yards, experience multiplier, respawn seconds, wander
   * yards, movement type]`.  All seven were constants in this file and all
   * seven are columns of `creature` or `creature_template`.
   */
  moves?: number[][]
  /** Every patrol the server lays down in the slice, whole — see `__navcheck`. */
  patrols?: number[][][]
  npcs: number[][]
}

/** 32 pixels to an LPC tile, and an LPC person is about five feet of them. */
const PPY = 24              // pixels to the yard at 1:1
const TILE = 32             // ground tile, in pixels
const YD_PER_TILE = TILE / PPY

/**
 * The world's objects, as `pipeline/objects.py` writes them.
 *
 * A row is `[x, y, kind, facing, trade, skill, respawn, haul, entry, pool]`.
 * `trade` is the empty string for anything you can simply open, and the name
 * of a trade for anything you cannot; `skill` is what `Lock.dbc` asks for.
 */
type Things = {
  objects: (string | number)[][]
  hauls: (string | number)[][][]
  /** How many of a shared slot's members stand at once — `pool_template`. */
  pools: Record<string, number>
}

const hud = document.getElementById('hud') as HTMLDivElement

const load = (src: string) =>
  new Promise<HTMLImageElement>((ok, no) => {
    const i = new Image()
    i.onload = () => ok(i)
    i.onerror = () => no(new Error(src))
    i.src = src
  })

async function main() {
  // Two worlds, and the sharper one wins if it is there.
  //
  // `public/data` is what `bake_terrain.py` writes out of a WoW client, and it
  // is not committed — see the wiki page 저작권과 배포 경계.  `public/world` is
  // what `synth_terrain.py` builds out of AzerothCore alone, and it is, which
  // is why this page works for somebody who has never installed the game.
  //
  // Which one exists is decided at build time, not by trying one and catching
  // the failure: asking the network is a 404 in the console of every visitor to
  // a page where the file is *meant* to be absent.
  const from = __HAS_CLIENT_WORLD__ ? 'data' : 'world'
  /**
   * Whether the ground under you was invented rather than read.
   *
   * `synth_terrain.py` builds a world out of AzerothCore alone, because what
   * `bake_terrain.py` reads out of a client cannot be committed and a visitor
   * without one has to get *something*.  It has the shape of Elwynn and none
   * of its surface: no ground paint, so no roads, because a road exists in
   * exactly one file and that file stays in the archive.
   */
  const MADE_UP = !__HAS_CLIENT_WORLD__
  const head = await fetch(`./${from}/terrain.json`)
  if (!head.ok || !(head.headers.get('content-type') ?? '').includes('json')) {
    // The one screen a developer reads and a player never does, so the command
    // in it stays as it is typed.
    hud.className = 'plain'
    hud.textContent = [
      `./${from}/terrain.json 에 세계가 없습니다.`,
      '',
      from === 'data'
        ? '빌드는 있다고 봤습니다. `npm run bake` 를 다시 돌리거나 public/data 를 지우세요.'
        : '`npm run synth -- <azerothcore 디렉터리> public/world` 를 돌리세요.',
    ].join('\n')
    return
  }
  const meta: Meta = await head.json()
  // The bin is the height grid and then, if there is one, a byte a cell saying
  // whether that cell is under water.
  const bin = await (await fetch(`./${from}/terrain.bin`)).arrayBuffer()
  const cells = meta.width * meta.height
  const heights = new Float32Array(bin, 0, cells)
  const wet = meta.hasWater ? new Uint8Array(bin, cells * 4, cells) : null
  /**
   * The ground as the client painted it, which is the only place a road is.
   *
   * AzerothCore has no road table, the height grid does not bend for one, and
   * the doodads stop at the verge — so a road exists in exactly one file, the
   * alpha maps of the terrain tiles, and either the bake reads them or the
   * forest has no roads in it.  Twice the height grid's resolution because at
   * the height grid's an eight-yard road is a two-cell staircase.
   */
  const GW = meta.groundWidth ?? 0, GH = meta.groundHeight ?? 0
  const GU = meta.groundUnit ?? 1
  const paint = GW && bin.byteLength >= cells * 5 + GW * GH
    ? new Uint8Array(bin, cells * 5, GW * GH) : null
  const PAINT = meta.ground ?? []
  /**
   * Which zone a point is in, at the resolution the client states it.
   *
   * One id a 33-yard chunk, straight out of the `.adt` headers.  Nothing here
   * knew this before: the readout said a coordinate, and every check that
   * wanted to ask "is this Northshire" had to go back to the client and
   * re-derive the boundary.
   */
  const AW = meta.areaWidth ?? 0, AH = meta.areaHeight ?? 0
  const AU = meta.areaUnit ?? 1
  const AREA_IDS = meta.areaIds ?? []
  /** Which area an area sits inside, so an unnamed one can say whose it is. */
  const inside = (area: number) => meta.areaParent?.[String(area)] ?? 0
  const zones = AW && bin.byteLength >= cells * 5 + GW * GH + AW * AH
    ? new Uint8Array(bin, cells * 5 + GW * GH, AW * AH) : null
  const { width: W, height: H, unit: U, x0, y0 } = meta

  const [tilesImg, tilesMeta, heroImg, heroMeta, npcImg, npcArt, spawns, spellbook, things, who, shelf] = await Promise.all([
    load('./art/tiles.png'),
    fetch('./art/tiles.json').then((r) => r.json() as Promise<Record<string, Piece>>),
    load('./art/hero.png'),
    fetch('./art/hero.json').then((r) => r.json() as Promise<HeroArt>),
    load('./art/npcs.png'),
    fetch('./art/npcs.json').then((r) => r.json() as Promise<NpcArt>),
    // Not behind the two-worlds switch, and that is not an oversight: the
    // terrain has two sources because a client's height grid is sharper than
    // anything a database knows, but where a wolf stands is a row in
    // `creature` either way.  One spawn file, and it is the committed one.
    fetch('./world/npcs.json').then((r) => r.json() as Promise<Spawns>),
    // What a warrior can do, out of the client's own `Spell.dbc` by way of
    // `pipeline/spells.py`.  Missing is fine: without it the bar is the two
    // things that need no table.
    fetch('./world/spells.json')
      .then((r) => r.json() as Promise<{ spells: Spell[]; melee?: number
        foes?: Record<string, Spell[]>
        /** `[spell, trigger, param1, param2, chance]` — `smart_scripts`. */
        cues?: Record<string, number[][]> }>)
      .catch(() => ({ spells: [] as Spell[], melee: undefined,
        foes: {} as Record<string, Spell[]>,
        cues: {} as Record<string, number[][]> })),
    // What stands in the world that is not a person.  One file for both
    // worlds and for the same reason the spawns are: where a copper vein
    // stands is a row in `gameobject` whichever height grid it stands on.
    fetch('./world/objects.json')
      .then((r) => r.json() as Promise<Things>)
      .catch(() => ({ objects: [], hauls: [], pools: {} } as Things)),
    // Who the player is, level by level, out of `player_class_stats`,
    // `player_race_stats` and the client's own crit tables.  Without it there
    // are no stats at all and the hit table has nothing to stand on.
    fetch('./world/player.json')
      .then((r) => r.json() as Promise<Who>)
      .catch(() => null),
    // What can be held, bought and taught: `pipeline/items.py`.
    fetch('./world/items.json')
      .then((r) => r.json() as Promise<Shelf>)
      .catch(() => ({ items: {}, stock: {}, trainers: {} } as Shelf)),
  ])

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: false })!
  document.body.appendChild(canvas)
  ctx.imageSmoothingEnabled = false

  /** Bilinear, because the grid is 4.17 yards and a tile is 1.33. */
  function groundAt(wx: number, wy: number): number {
    const fi = (x0 - wx) / U, fj = (y0 - wy) / U
    const i = Math.max(0, Math.min(W - 2, Math.floor(fi)))
    const j = Math.max(0, Math.min(H - 2, Math.floor(fj)))
    const ti = fi - i, tj = fj - j
    const a = heights[i * H + j], b = heights[i * H + j + 1]
    const c = heights[(i + 1) * H + j], d = heights[(i + 1) * H + j + 1]
    return (a * (1 - tj) + b * tj) * (1 - ti) + (c * (1 - tj) + d * tj) * ti
  }

  /**
   * Two different questions about the same gradient, and conflating them is
   * what made the first hillside look like spilled gravel.
   *
   * `shadeAt` is *which way* the ground tilts — light from the north-west, and
   * a face turned towards it is bright.  `slopeAt` is *how much* it tilts, with
   * no direction in it at all.  The first picks the brightness; only the second
   * may pick the tile, because a slope that is steep is steep whichever way it
   * points, and a threshold on a signed number flips across every ridge.
   */
  function gradient(wx: number, wy: number, over = YD_PER_TILE): [number, number] {
    const s = over
    return [
      (groundAt(wx + s, wy) - groundAt(wx - s, wy)) / (2 * s),
      (groundAt(wx, wy + s) - groundAt(wx, wy - s)) / (2 * s),
    ]
  }
  /** The two ends of the shading, named because the ground bake steps them. */
  /**
   * How dark and how bright the hillside tint ever goes.
   *
   * Measured off this terrain rather than chosen: with the shading below, the
   * 2nd percentile of the forest is -1.00 and the brightest cell in it is
   * +0.30.  The pair they replace were -0.55 and +0.4 against a shade function
   * that was the raw gradient, and a raw gradient has no upper bound — a
   * seventh of Elwynn sat pinned at the dark end, which is why the mountains
   * around the forest came out as one flat black.
   */
  const SHADE_LO = -1.0, SHADE_HI = 0.3
  /**
   * The light, as a direction rather than as a pair of numbers.
   *
   * North-west and above, which is what the tint has always claimed to be.
   */
  const LIGHT: [number, number, number] = (() => {
    const v: [number, number, number] = [1, 1, 1.4]
    const n = Math.hypot(...v)
    return [v[0] / n, v[1] / n, v[2] / n]
  })()
  /**
   * How much light the ground catches here, which is a dot product and not a
   * gradient.
   *
   * The first version was `(dx + dy) * 0.95` clamped, and the trouble with a
   * gradient is that it has no bound: on a mountainside the sum reaches nine,
   * so every cell steeper than about a third of a yard per yard pinned at the
   * clamp and the whole range around the forest came out one flat colour.  A
   * surface normal is a unit vector by construction, so this cannot pin — it
   * is zero on the level, positive towards the light and negative away, and
   * the extremes are the extremes of the terrain rather than of the formula.
   */
  function shadeAt(wx: number, wy: number, over = YD_PER_TILE): number {
    const [dx, dy] = gradient(wx, wy, over)
    const inv = 1 / Math.hypot(dx, dy, 1)
    return (-dx * inv) * LIGHT[0] + (-dy * inv) * LIGHT[1]
      + inv * LIGHT[2] - LIGHT[2]
  }
  function slopeAt(wx: number, wy: number, over = YD_PER_TILE): number {
    const [dx, dy] = gradient(wx, wy, over)
    return Math.hypot(dx, dy)
  }
  /**
   * The steepest single step out of here, which is a different question.
   *
   * `slopeAt` is a central difference, so it averages the ground over eight
   * yards — and averaging is exactly what a cliff survives.  Northshire's
   * walls rise in four-yard steps of two and three to the yard with gentler
   * ground in between; smoothed, every one of them came out under the limit,
   * so the starting valley was not enclosed at all.  A flood fill from the
   * abbey reached fourteen hundred yards by fifteen hundred, across eight
   * zones, and climbed to a hundred and seventy yards up the rim.
   *
   * What stops a walker is the worst step he has to take, so that is what is
   * measured: the largest drop or rise to a neighbouring cell of the height
   * grid.  Shading still uses the smooth gradient, because shading is about
   * which way the ground faces and not about whether you can stand on it.
   */
  function stepAt(wx: number, wy: number, over = U): number {
    const s = over
    const z = groundAt(wx, wy)
    return Math.max(
      Math.abs(groundAt(wx + s, wy) - z), Math.abs(groundAt(wx - s, wy) - z),
      Math.abs(groundAt(wx, wy + s) - z), Math.abs(groundAt(wx, wy - s) - z),
    ) / s
  }

  const hash = (a: number, b: number) => {
    const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453
    return n - Math.floor(n)
  }

  const paintAt = (wx: number, wy: number): string => {
    if (!paint) return 'grass'
    const i = Math.round((x0 - wx) / GU), j = Math.round((y0 - wy) / GU)
    if (i < 0 || i >= GW || j < 0 || j >= GH) return 'grass'
    return PAINT[paint[i * GH + j]!] ?? 'grass'
  }
  /**
   * The chunks the client marks impassable, as a set of `i,j` keys.
   *
   * Bit two of an `.adt` chunk's flags is the world saying outright that you
   * cannot walk here, and it was never read: 93 chunks in the slice, nearly
   * all of them the wall along the Burning Steppes, all of them open.
   */
  /**
   * Keyed by number rather than by string.
   *
   * These three masks are asked once a *tile*, and the widest view is eleven
   * hundred tiles a frame: building `${i},${j}` for each of them allocates a
   * string a tile a mask, which is three and a half thousand short-lived
   * strings a frame for a question that fits in one integer.
   */
  const cell = (i: number, j: number) => i * 100000 + j
  const shut = new Set((meta.closed ?? []).map(([i, j]) => cell(i, j)))
  const closedAt = (wx: number, wy: number) => {
    if (!shut.size) return false
    const i = Math.floor((x0 - wx) / AU), j = Math.floor((y0 - wy) / AU)
    return shut.has(cell(i, j))
  }
  /**
   * Where there is no floor at all.
   *
   * A chunk's `holes` field takes four by four squares out of its own ground,
   * and that is how the client makes the mouth of a mine: 674 cells of it in
   * this slice, every mine and den and cellar in the forest.  It was read into
   * the tile and then used by nothing, so the ground was laid straight over
   * every entrance — the one field the wiki singles out as *"ignore the holes
   * and the cave mouth gets covered over"*.
   *
   * There is nothing under it here — no interiors — so a hole is drawn as what
   * it is, an opening, and refuses a step.  Walking on to a floor that is not
   * there is the one thing it certainly should not do.
   */
  const holes = new Set((meta.gaps ?? []).map(([i, j]) => cell(i, j)))
  /**
   * The chunks where the floor is gone because a *building* owns it.
   *
   * All sixteen bits out of one chunk is not a cave mouth — it is ground
   * handed to something that brings its own floor, which in this slice is
   * Stormwind.  There is none of ours there, so it is still drawn as a hole;
   * but the server walks its own creatures across it, and refusing a step
   * there put 86 patrol points and 42 spawns on ground we call impassable.
   */
  const given = new Set((meta.given ?? []).map(([i, j]) => cell(i, j)))
  const holeAt = (wx: number, wy: number) => {
    if (!holes.size) return false
    const i = Math.round((x0 - wx) / U), j = Math.round((y0 - wy) / U)
    return holes.has(cell(i, j))
  }
  /** A hole you may walk over, because somebody else's floor is under it. */
  const floored = (wx: number, wy: number) => {
    if (!given.size) return false
    const i = Math.floor((x0 - wx) / AU), j = Math.floor((y0 - wy) / AU)
    return given.has(cell(i, j))
  }
  /**
   * A hole with nothing under it, which is the only kind worth drawing black.
   *
   * The two halves of this question were being asked separately in three
   * places and one of them forgot the second half — the one that paints the
   * ground.  So the middle of Goldshire was a thirty-yard black square with
   * the inn's own people standing on it: the client cuts its terrain away
   * wherever a building carries its own floor, and the Lion's Pride is one.
   * Walking worked; the ground under your feet was space.
   *
   * Two things can be under a hole.  `given` is a whole chunk handed over —
   * all sixteen bits gone, which in this slice is Stormwind — and that was
   * the only one being asked about.  The Lion's Pride takes a few bits out of
   * one chunk, so it was never in `given`, and the answer that covers both is
   * the building's own floor.
   *
   * One function now, and the three callers agree by construction.
   */
  const openHole = (wx: number, wy: number) => {
    if (!holeAt(wx, wy) || floored(wx, wy)) return false
    // A *floor*, not merely a building's box.  A mine mouth sits inside the
    // box of something that has no plan of its own, and asking "is anything
    // here at all" closed every mouth in the forest — the opposite mistake,
    // caught by the older check within the minute.
    return !inBuilding(wx, wy)?.floor
  }

  /** The client's own area id here, or 0 where the slice has none. */
  const areaOf = (wx: number, wy: number): number => {
    if (!zones) return 0
    const i = Math.floor((x0 - wx) / AU), j = Math.floor((y0 - wy) / AU)
    if (i < 0 || i >= AW || j < 0 || j >= AH) return 0
    return AREA_IDS[zones[i * AH + j]!] ?? 0
  }
  const wetAt = (wx: number, wy: number) => {
    if (!wet) return false
    const i = Math.round((x0 - wx) / U), j = Math.round((y0 - wy) / U)
    if (i < 0 || i >= W || j < 0 || j >= H) return false
    return wet[i * H + j] === 1
  }

  /**
   * One number, used twice on purpose.
   *
   * Above this the ground is drawn as bare rock, and above this it cannot be
   * walked on.  Two constants would drift, and the day they did the player
   * would be stopped by grass or would stroll up a cliff face — either way by
   * something the picture did not warn them about.
   */
  // And it is not chosen here any more.  Fifty degrees was a guess — "roughly
  // where a person stops being able to walk up something" — and a guess in
  // this position is a wall in the wrong place: at fifty, the mountain east of
  // Northshire has a switchback where every step is between 1.14 and 1.19,
  // threading just under the limit, and a walk from the abbey climbs a hundred
  // yards of it and comes out on ground that belongs to no zone at all.
  //
  // `waypoint_data` settles it.  187 patrol routes in this slice, 3,954 legs
  // of walking laid down by the people who run the server, and not one of them
  // climbs steeper than 0.90 — forty-two degrees.  `spawn_npcs.py` measures it
  // and writes it; this is the world's own statement of what walking is.
  const CLIFF = spawns.walk || Math.tan(50 * Math.PI / 180)
  const BARE = Math.tan(40 * Math.PI / 180)

  const WATER_TILES = ['water', 'water2', 'water3'].filter((k) => tilesMeta[k])
  const GROUND_TILES = ['grass', 'grass2', 'grass3'].filter((k) => tilesMeta[k])
  const ROCK_TILE = tilesMeta['stone'] ? 'stone' : GROUND_TILES[0]
  /**
   * A laid road, which is not a rock face.
   *
   * `paved` and `rock` were handed the same tile, so the cobbled road through
   * Northshire — the one the client actually paints with a cobblestone
   * texture — came out the same grey as the cliffs on either side of it, and
   * the starting valley read as having no road at all.
   */
  const PAVED_TILES = ['cobble', 'cobble2'].filter((k) => tilesMeta[k])
  /**
   * What a building is made of, seen from above.
   *
   * Stone for the mass and the darker cut of the same rock for the wall.  Not
   * the pale flagstones the roads are paved with: an abbey drawn in those is a
   * plaza, and the thing that has to read at ninety yards is that it is solid.
   */
  const WALL_TILE = tilesMeta['rock_floor'] ? 'rock_floor' : ROCK_TILE
  /**
   * And what is under the roof, which from above is the roof.
   *
   * The footprint is the building's own outline now — a little over half its
   * bounding box — so filling it is a statement the record supports: *this* is
   * where the building is.  Filling the box was the earlier mistake and it
   * buried the courtyard, the road and the graveyard with it.
   */
  const ROOF_TILE = tilesMeta['roof'] ? 'roof' : WALL_TILE
  /**
   * And the floor you stand on once you are inside one.
   *
   * Flagstones, which is what the roads are paved with and what the inside of
   * a building in this world is — the bake works out where a man can stand in
   * the model's own geometry, and until it did, the abbey's nave was the
   * grass the terrain happens to have under it.
   */
  const FLOOR_TILE = PAVED_TILES[0] ?? WALL_TILE
  const DIRT_TILE = tilesMeta['dirt'] ? 'dirt' : GROUND_TILES[0]
  /**
   * The land a lake touches.
   *
   * Not a shoreline in the tileset's sense — LPC's water edges are a
   * sixteen-case autotile and this is one tile — but the thing being fixed is
   * cruder than that: grass meeting open water at a straight cut reads as a
   * hole in the map rather than as a lake.  A yard of sand around the edge is
   * enough to say which of the two is the ground.
   */
  const SHORE_TILE = tilesMeta['dirt2'] ? 'dirt2' : DIRT_TILE
  /**
   * Flowers, in meadows rather than in a speckle.
   *
   * Rolled per tile at any rate above about a twentieth, Casper Nilsson's
   * flowered grass turns the whole of Elwynn into a flowerbed — the tile is
   * dense enough that four of them side by side read as solid red.  So the
   * decision is made twice: a coarse hash over 5-tile blocks says whether this
   * corner of the field is a meadow at all, and only inside one does the fine
   * hash pick a flowered tile.  Patches are what a meadow is; a uniform
   * probability is what a rash is — and the first pair of thresholds, at .62
   * and .45, put flowers on a fifth of the whole slice, which is the rash
   * again at a larger grain.
   */
  const BLOOM_TILES = ['bloom', 'bloom2', 'bloom3'].filter((k) => tilesMeta[k])
  const MEADOW = 0.78

  /**
   * Which buildings are drawn as their plan rather than as a picture.
   *
   * The cottage sprite is about thirteen yards of building.  Anything that
   * size *is* the cottage; anything bigger has to be drawn as what it is, or
   * Northshire's abbey is a cottage and so is a hundred and sixty yards of
   * curtain wall beside it — which is exactly what the place looked like.
   */
  const BUILT = new Set(['house', 'hall', 'tower'])
  const SPRITE_FITS = 9
  const asPlan = (d: Doodad) =>
    BUILT.has(d.k) && !!d.bl && !!d.bw && Math.max(d.bl, d.bw) > SPRITE_FITS

  // Doodad kinds come out of the bake; a kind picks a piece here.  The bake
  // never emits a model path, so this table is the only place that decides
  // what a tree looks like.
  // `solid`: 'building' takes the footprint off the sprite; a number is a half
  // width in yards, for things whose collision is the trunk rather than the
  // picture.  A canopy is not solid — walking behind a tree is the whole reason
  // the canopy is drawn over the player instead of under.
  // `yards`: how tall the thing should stand.  A drawn oak is 80 pixels, which
  // at 24 to the yard is 3.3 — shorter than two people, and a wood of them
  // reads as scrub.  Stating the height and deriving the scale from the
  // sprite's own is the same move `bake_npcs.py` makes for an animal's length,
  // and it means the number survives the art being recut.
  const KIND: Record<string, {
    pieces: string[]
    yards?: number
    /**
     * A ceiling on how tall one may draw, whatever its model says.
     *
     * For everything else the client's own box is the better answer — it
     * knows a sapling from a sixty-yard oak.  A waterfall is the exception:
     * its box is the *cliff*, 19 to 97 yards for the same picture, and the
     * client builds one fall out of sixteen placements in a fifty-yard
     * cluster.  Each is a strand, and at its stated height one strand
     * covered the glass.
     */
    cap?: number
    /** Drawn under the piece, for pieces that are a canopy and nothing else. */
    trunk?: string
    /** The pieces that are already a whole tree and want no trunk under them. */
    whole?: string[]
    run?: boolean; patch?: boolean
    solid?: 'building' | 'span' | number
  }> = {
    // `oak` and `oak2` are canopies and want a trunk under them.  `deadtree`
    // is a whole tree, trunk and all, and putting one under it drew two trees
    // standing in the same spot with their trunks side by side.
    tree: {
      pieces: ['oak', 'oak2'], trunk: 'trunk',
      yards: 8, solid: 0.5,
    },
    // Drawn front-on, whatever the client says the rotation is.  These are
    // pixel art with no side view, and turning a pixel sprite by an arbitrary
    // angle is how pixel art stops looking like pixel art.
    // `run`: pick the piece off the neighbourhood rather than the doodad, so a
    // boundary is all one fence.  Picking per post gave a line that alternated
    // rail, picket, rail, which is not a fence anybody built.
    fence: { pieces: ['fence', 'fence2'], run: true, solid: 'span' },
    sign: { pieces: ['fence_post'] },
    pine: { pieces: ['pine', 'pine2'], yards: 9, solid: 0.5 },
    // A bare tree, and only where the client put a bare one.  It used to be
    // one of the five pictures `tree` rotated through, so a fifth of Elwynn's
    // living wood was drawn dead.
    deadtree: { pieces: ['deadtree'], yards: 9, solid: 0.5 },
    // One post, which is what the client placed: the fence beside it is its
    // own doodad.
    post: { pieces: ['fence_post'], solid: 0.3 },
    // Four sizes of the same two shrubs.  One shrub repeated 1,220 times is
    // the texture the field had, and it reads as wallpaper however good the
    // sprite is.
    bush: { pieces: ['bush', 'bush2', 'shrub', 'shrub2', 'bush', 'bush2'] },
    rock: { pieces: ['boulder', 'menhir', 'rubble'], solid: 0.55 },
    stump: { pieces: ['stump', 'trunk'], solid: 0.5 },
    log: { pieces: ['trunk2', 'woodpile'] },
    grass: { pieces: ['bush', 'sprout2'] },
    // 710 of these stand in the shallows, and they were bushes.
    // The drawn reeds are 104 pixels — four and a third yards, which put a
    // reed bed over the top of the wood it stood beside.
    water_plant: { pieces: ['reeds', 'reeds2'], yards: 2 },
    flower: { pieces: ['sprout', 'sprout2', 'tomatoes'] },
    crop: { pieces: ['corn', 'corn2', 'carrots', 'tomatoes', 'pumpkin'] },
    // A vineyard is not an object, it is a field: the client puts down one
    // doodad forty yards across and five of them are the whole of Northshire's
    // south-west corner.  Drawn as a single sprite it was a shrub in a
    // paddock — so `patch` sows the piece over the footprint the model
    // declares, the same way `span` lays a fence along a line.
    vine: { pieces: ['corn', 'corn2'], patch: true, yards: 2.6 },
    // Not mushrooms.  The two in the sheet are in its `MISSING:` section —
    // nobody recorded who drew them — so what stands here is a seedling, and
    // that is the whole of the reason.
    mushroom: { pieces: ['sprout2', 'sprout'] },
    lily: { pieces: ['lily', 'lily2', 'lily3'] },
    // Elwynn has thirty-eight of these and nothing was drawn for any of them,
    // which in a forest whose one moving thing is water is a strange gap.
    // Side-on, like a tree: this projection draws a tree as a picture of a
    // tree standing up, and a fall is the same kind of object.
    // Four yards, and the number is about how the client builds one: the
    // biggest fall in the slice is sixteen placements in a fifty-yard cluster,
    // so each one is a *strand* rather than the whole fall.  Sized off the
    // model's own box — 19 to 97 yards, because what it measures is the cliff
    // the fall is cut into — every strand was a wall of blue.
    waterfall: { pieces: ['waterfall'], yards: 4, cap: 6 },
    // Not drawn here at all: fireflies are light.  See the night pass.
    firefly: { pieces: [] },
    barrel: { pieces: ['barrel', 'barrel2', 'barrel3', 'barrel4', 'barrels'], solid: 0.4 },
    // `prop` is the client's word for the furniture of a yard, and 301 of them
    // were one grey blob.  A yard has firewood, sacks, crates and a stall in
    // it, and which one is decided the same way a tree's species is.
    prop: {
      pieces: ['crate', 'sack', 'sacks', 'basket', 'baskets', 'basket2',
        'baskets2', 'firewood', 'firewood2', 'woodpile', 'anvil', 'hay', 'stall'],
      solid: 0.45,
    },
    // Thirteen carts stood in the client's world and none of them were drawn:
    // `cart` was not in this table at all, and a kind that is missing from it
    // is skipped without a word.
    cart: { pieces: ['cart', 'cart2', 'haycart'], solid: 0.7 },
    grave: { pieces: ['grave', 'grave2'], solid: 0.35 },
    // Drawn by the ground pass, not here: a bridge is a floor.  Listed so the
    // bake's kind is known and not reported as missing.
    bridge: { pieces: [] },
    bridge_stone: { pieces: [] },
    // Three that the bake used to hand over as `prop`, which draws a market
    // stall — so the abbey's graveyard was a row of stalls and every torch in
    // Elwynn was one too.
    hay: { pieces: ['hay'] },
    // `campfire` was in the bake's word list and not in this one, so the two
    // of them in the slice were dropped without a word — the silent half of
    // the same mistake the market stalls were the loud half of.
    campfire: { pieces: ['firewood', 'firewood2'] },
    bones: { pieces: ['rubble', 'scatter'] },
    lamp: { pieces: ['fence_post'] },
    // What stands inside a building, which until now was two thirds skipped:
    // the roof came off the abbey and what was under it was a tiled floor
    // with nothing on it.  The pictures are Lanea Zimmerman's, out of the
    // same folder the water and the bridges already come from.
    shelf: { pieces: ['shelf', 'shelf2'], solid: 0.4 },
    cabinet: { pieces: ['cabinet', 'cabinet2'], solid: 0.4 },
    keg: { pieces: ['keg', 'keg2'], solid: 0.4 },
    bed: { pieces: ['sack', 'sacks'], solid: 0.3 },
    // Two thirds of a yard, because that is what a stein is.  Left at the
    // picture's own size a bottle on a table was a barrel beside it.
    crockery: { pieces: ['barrel2', 'barrel3', 'basket', 'basket2'], yards: 0.7 },
    // Buildings.  The client says where one stands and what sort it is; which
    // of ours gets drawn there is decided here, the same as a tree.
    house: { pieces: ['house_a', 'house_b', 'house_c', 'house_d', 'house_e', 'house_f'], solid: 'building' },
    hall: { pieces: ['hall'], solid: 'building' },
    tower: { pieces: ['tower'], solid: 'building' },
    tent: { pieces: ['tent'], solid: 'building' },
    // What the world database puts down, as opposed to the terrain: a herb is
    // a small plant you can pull up and a vein is a rock with something in it.
    // Both are `pipeline/objects.py`'s words and both are decided by the lock
    // rather than by the model, because silverleaf's model *is* a bush.
    herb: { pieces: ['sprout', 'sprout2', 'kit_flower', 'kit_flower2'], yards: 1 },
    vein: { pieces: ['kit_rock', 'kit_rock2', 'kit_stones'], yards: 1.3 },
    crate: { pieces: ['crate', 'basket', 'baskets'], solid: 0.4, yards: 1 },
    firewood: { pieces: ['firewood', 'firewood2', 'woodpile'], yards: 0.8 },
    mailbox: { pieces: ['crate'], yards: 1 },
    anvil: { pieces: ['anvil'], solid: 0.4, yards: 1 },
    forge: { pieces: ['anvil'], solid: 0.5, yards: 1.3 },
  }

  /**
   * How far one fence doodad reaches, and which way.
   *
   * The client puts a fence down every 4.14 yards because its own section is
   * that long; ours is a 32 pixel sprite, which is 1.33.  Drawn one for one they
   * came out as a row of stakes with nearly three yards of air between them —
   * which is what the Goldshire screenshots had been showing all along.
   *
   * Neither the length nor the direction is typed in here.  The length is the
   * distance to the nearest other fence, and the direction is the axis that
   * distance lies along, so the same code draws the client's four yard sections
   * and the synthesised world's one-and-a-third yard ones without being told
   * which world it is in.  Rotation is not consulted: this only ever has to
   * choose between two axes, and for that the neighbours are better evidence
   * than an angle whose convention nobody here has verified.
   */
  function fenceRuns(list: Doodad[]) {
    const out = new Map<Doodad, { span: number; alongX: boolean }>()
    for (const a of list) {
      let best = Infinity, bx = 0, by = 0
      for (const b of list) {
        if (b === a) continue
        const dx = b.x - a.x, dy = b.y - a.y
        const d2 = dx * dx + dy * dy
        if (d2 < best) { best = d2; bx = dx; by = dy }
      }
      const d = Math.sqrt(best)
      out.set(a, {
        span: Number.isFinite(d) ? Math.min(8, Math.max(1.33, d)) : 1.33,
        alongX: Math.abs(bx) > Math.abs(by),
      })
    }
    return out
  }
  const runs = fenceRuns(meta.doodads.filter((d) => d.k === 'fence'))

  type Placed = {
    x: number; y: number; piece: Piece; s: number; trunk?: Piece
    /** The bake's own word for it, kept for the check that reads the census. */
    kind?: string
    /** Which building put it here, if a building did — the bake's number. */
    house?: number
    /** Whose roof it is under, if anybody's — worked out once, not per frame. */
    in?: unknown
    /** The object it draws, for the ones that are taken and come back. */
    node?: { up: boolean }
  }
  const placed: Placed[] = []

  /**
   * What a building stands on, in world yards.
   *
   * The sprite is drawn from its anchor upwards, and up the screen is north, so
   * the footprint runs north from the point the bake put it at.  Not the whole
   * sprite: the top two thirds of a house is roof, and a roof is not something
   * you walk into.  The width is the sprite's, because the wall is.
   */
  type Rect = { x0: number; x1: number; y0: number; y1: number }
  const solids: Rect[] = []
  /**
   * The fireflies, which are not scenery and not creatures.
   *
   * Fifty-one clusters of them stand in Elwynn and there is no picture for
   * one: every asset pack on this machine was searched — LPC's tiles,
   * animals and pets, Kenney's nature and forest sets, the Superpowers packs
   * — and none has a top-down firefly, butterfly or bird.  Drawing one here
   * is not allowed.
   *
   * But a firefly is barely a picture.  It is a point of light that comes and
   * goes, and light is code: the same machinery that draws the rain, which
   * nobody would have called art either.  So the client's own placements are
   * kept and the night pass lights them.
   */
  const motes: { x: number; y: number }[] = []
  /** How many sparks the last frame lit, which is what the check reads. */
  let sparks = 0
  for (const d of meta.doodads) {
    if (d.k === 'firefly') { motes.push({ x: d.x, y: d.y }); continue }
    const k = KIND[d.k]
    if (!k) continue
    const seed = k.run ? hash(Math.floor(d.x / 40), Math.floor(d.y / 40)) : hash(d.x, d.y)
    // Which picture: the model's, not the spot's.  `v` is a number the bake
    // makes out of the model path, so every ELWYNNBUSH09 in the forest is the
    // same bush and a different model is a different one.  Keyed on the spot,
    // the same bush changed shape every time the client put one down.
    //
    // And no more pictures than the client has models.  Five pictures of a
    // crop where the slice holds one crop model is four fields of vegetables
    // this world does not grow; the cap comes from the bake's own count, so a
    // wider slice with more models gets more pictures without anybody editing
    // a list.
    const many = Math.max(1, Math.min(k.pieces.length,
      (meta.variety ?? {})[d.k] ?? k.pieces.length))
    const pick = k.pieces[(d.v ?? Math.floor(seed * 64)) % many]!
    const piece = tilesMeta[pick]
    if (!piece) continue
    // How big this one is.  `yards` says how tall the kind should stand and
    // the sprite says how tall it is drawn, so the scale between them is
    // arithmetic; `d.s` is the client's own word for how big *this* one is,
    // and it was read out of the world and then ignored for three rounds —
    // Elwynn has trees from a sixth of normal to five times it, and every one
    // of them was the same size.
    // A tree drawn as a canopy over a trunk is as tall as both of them, so the
    // height `yards` states is divided over what will actually be drawn — not
    // over the canopy alone, which made every oak thirteen yards.
    const stem = (k.trunk && !k.whole?.includes(pick) && tilesMeta[k.trunk])
      ? tilesMeta[k.trunk]! : null
    const tall = piece.h + (stem ? stem.h * 0.78 : 0)
    // How tall this one should stand.  The client's own model first — it knows
    // the difference between the nineteen things the word `tree` covers — and
    // the kind's figure only where there is no model to ask, which is the
    // buildings.  `d.s` is already inside `d.t`, so it multiplies only the
    // fallback.
    // And a ceiling, for the one case where the model's box is not the object.
    // A waterfall's box is the cliff it is cut into — 19 to 97 yards for the
    // same picture — and the client builds one fall out of sixteen placements
    // in a fifty-yard cluster, so each is a *strand*.  Drawn at its stated
    // height the eastern falls were a wall of blue across the whole glass.
    const yards = Math.min(d.t || (k.yards ? k.yards * d.s : 0), k.cap ?? 1e9)
    const size = yards ? (yards * PPY) / tall : d.s
    if (k.patch) {
      // A field, sown over the footprint the client's model declares rather
      // than drawn as one object at the middle of it.  Rows across and plants
      // along, both spaced by the piece's own size, and the whole thing
      // jittered by the same seeded hash the scenery is scattered with so it
      // does not come out as graph paper.
      const half = d.w ?? 4
      const step = Math.max(1.2, (piece.w * size) / PPY)
      const rows = Math.max(1, Math.round((half * 2) / (step * 1.6)))
      const cols = Math.max(1, Math.round((half * 2) / step))
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const jx = hash(d.x + r, d.y + c) - 0.5
          const jy = hash(d.y + c, d.x + r) - 0.5
          placed.push({
            x: d.x + (r - (rows - 1) / 2) * step * 1.6 + jx * step * 0.5,
            y: d.y + (c - (cols - 1) / 2) * step + jy * step * 0.5,
            piece: tilesMeta[k.pieces[(r + c) % k.pieces.length]!] ?? piece,
            s: size, kind: d.k, ...(d.h ? { house: d.h } : {}),
          })
        }
      }
      continue
    }
    if (k.solid === 'span') {
      // One doodad, several sections, laid end to end so a boundary is a line
      // rather than a row of posts.
      const r = runs.get(d) ?? { span: 1.33, alongX: false }
      // One picture whichever way the line runs.  A rendered fence needed two
      // — a fence along x and a fence along y were different pictures under
      // the old camera — and a drawn one does not: it is front-on by
      // construction, which is the same reason its rotation is ignored.
      const piece2 = piece
      const sec = (piece2.w * size) / PPY
      const n = Math.max(1, Math.round(r.span / sec))
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * sec
        placed.push({
          x: d.x + (r.alongX ? off : 0), y: d.y + (r.alongX ? 0 : off),
          piece: piece2, s: size, kind: d.k, ...(d.h ? { house: d.h } : {}),
        })
      }
      const half = (n * sec) / 2
      solids.push({
        x0: d.x - (r.alongX ? half : 0.5), x1: d.x + (r.alongX ? half : 0.5),
        y0: d.y - (r.alongX ? 0.5 : half), y1: d.y + (r.alongX ? 0.5 : half),
      })
      continue
    }
    // A building drawn as its own plan has no standing picture.  A thirteen
    // yard cottage in the middle of a ninety yard abbey is a cottage in a
    // courtyard, and the plan is the better statement of both where the abbey
    // is and how big.
    if (!(asPlan(d) && (d.rooms?.length || d.p))) {
      placed.push({
        x: d.x, y: d.y, piece, s: size, kind: d.k, ...(d.h ? { house: d.h } : {}),
        ...(stem ? { trunk: stem } : {}),
      })
    }
    if (k.solid === 'building') {
      if (asPlan(d)) {
        // Nothing.  A building drawn as its plan is **not solid**, and that is
        // deliberate: the record gives an extent and an angle and says nothing
        // about where the door is, so a wall we cannot put a door in is a wall
        // that seals people out of the abbey — or in.
        //
        // It was four axis-aligned strips for a day, and the abbey is turned
        // 158 degrees, so the strips did not sit under the stone that was
        // drawn: you were stopped three yards short of a wall you could see,
        // which is the definition of an invisible one.  Better nothing than
        // nearly.
      } else {
        const halfY = (piece.w * size) / PPY / 2
        const deep = ((piece.h * size) / PPY) * 0.32
        solids.push({ x0: d.x - 0.8, x1: d.x + deep, y0: d.y - halfY, y1: d.y + halfY })
      }
    } else if (typeof k.solid === 'number') {
      // The trunk of a tree twice the size is twice as wide, and a player who
      // can walk through the big ones is the visible form of forgetting that.
      const r = k.solid * size
      solids.push({ x0: d.x - r, x1: d.x + r, y0: d.y - r, y1: d.y + r })
    }
  }

  /**
   * A bucket grid over the solids.
   *
   * A linear scan was fine for thirty-six buildings and is not for two and a
   * half thousand trunks, and the cost lands in the movement test which runs
   * three times a frame.  Buckets are eight yards, which is wider than anything
   * in the list, so a rect can only touch the buckets its corners fall in.
   */
  const BUCKET = 8
  const grid = new Map<string, Rect[]>()
  const key = (i: number, j: number) => `${i},${j}`
  for (const r of solids)
    for (let i = Math.floor(r.x0 / BUCKET); i <= Math.floor(r.x1 / BUCKET); i++)
      for (let j = Math.floor(r.y0 / BUCKET); j <= Math.floor(r.y1 / BUCKET); j++) {
        const k2 = key(i, j)
        const b = grid.get(k2)
        if (b) b.push(r)
        else grid.set(k2, [r])
      }

  const solidAt = (wx: number, wy: number) => {
    const b = grid.get(key(Math.floor(wx / BUCKET), Math.floor(wy / BUCKET)))
    if (!b) return false
    for (const s of b)
      if (wx >= s.x0 && wx <= s.x1 && wy >= s.y0 && wy <= s.y1) return true
    return false
  }

  // --- who lives here ---------------------------------------------------

  // LPC's own row order, which is why `spawn_npcs.py` can turn the server's
  // orientation straight into one of these: 0 radians is +x, +x is up the
  // screen, and a quarter turn from there is left.
  const DIR_UP = 0, DIR_LEFT = 1, DIR_DOWN = 2, DIR_RIGHT = 3

  /**
   * Which of the four drawn poses to use.
   *
   * The world velocity, straight — which is the whole point of going back to
   * this projection.  North is up the glass, so the pose that faces up is the
   * pose for walking north, and there is no compromise left to document.  In
   * quarter view this took the *screen* velocity and was still 45 degrees out
   * half the time, because none of the world's four directions was one of the
   * four the sheet was drawn for.
   */
  function facing(dx: number, dy: number): number {
    return Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? DIR_UP : DIR_DOWN)
      : (dy > 0 ? DIR_LEFT : DIR_RIGHT)
  }

  /**
   * How far over the feet each kind's head is, measured off the atlas.
   *
   * The cell is 64 pixels for everybody and nobody fills it: a person leaves
   * room for a hat and a chicken is a fifth of one.  Taking the height from
   * the cell floated the talk prompt two body lengths over a chicken, and
   * `yards` is not a substitute — it is the animal's *length*, which is what
   * the bake scales by and is not the same number for a horse.  So it is
   * measured, one 64x64 read a kind at load: the first row of the standing
   * frame that has anything in it.
   */
  const headOf: Record<string, number> = {}
  {
    const c = npcArt.cell
    const scratch = document.createElement('canvas')
    scratch.width = scratch.height = c
    const sc = scratch.getContext('2d', { willReadFrequently: true })!
    for (const [kind, a] of Object.entries(npcArt.kinds)) {
      const idx = a.first + DIR_DOWN * a.frames
      sc.clearRect(0, 0, c, c)
      sc.drawImage(npcImg, (idx % npcArt.cols) * c, Math.floor(idx / npcArt.cols) * c,
        c, c, 0, 0, c, c)
      const px = sc.getImageData(0, 0, c, c).data
      let top = c
      for (let y = 0; y < c && top === c; y++)
        for (let x = 0; x < c; x++)
          if (px[(y * c + x) * 4 + 3]! > 8) { top = y; break }
      headOf[kind] = c * npcArt.anchor - top
    }
  }

  /**
   * A kind with no art of its own borrows one.  A ghost is a townsman drawn
   * through; there are two of them and a separate sheet for two spawns is not
   * worth the atlas.  A kind in neither table is counted and dropped, not
   * drawn as whatever happens to sit at index zero.
   */
  const BORROWED: Record<string, { art: string; alpha: number }> = {
    ghost: { art: 'townsfolk', alpha: 0.45 },
  }

  /**
   * Every sheet a kind has, because one of them is not enough.
   *
   * The bake cuts `townsfolk`, `townsfolk2` … `townsfolk16` — sixteen people
   * rather than one man repeated 980 times — and the engine should not have to
   * be told how many there are.  The suffix is the whole convention: a name
   * with digits on the end is another of whatever the name without them is.
   */
  const VARIANTS: Record<string, string[]> = {}
  for (const name of Object.keys(npcArt.kinds)) {
    const base = name.replace(/\d+$/, '')
    ;(VARIANTS[base] ??= []).push(name)
  }
  for (const v of Object.values(VARIANTS))
    v.sort((a, b) => (Number(a.match(/\d+$/)?.[0] ?? 1)) - (Number(b.match(/\d+$/)?.[0] ?? 1)))

  /**
   * Which of them this one is.
   *
   * Off the spawn's own position, so the same villager is the same villager
   * every time the game is opened — and so two standing together are almost
   * never the same, which is the whole point.
   */
  const faceOf = (base: string, x: number, y: number) => {
    const v = VARIANTS[base]
    if (!v || v.length < 2) return base
    return v[Math.floor(hash(x + 17, y - 11) * v.length) % v.length]!
  }

  /** Somebody standing behind a counter does not wander off mid-sentence. */
  // `STAYS` used to be here: a list of the roles that do not wander, because
  // nothing said which spawns wander.  `creature.MovementType` says, for every
  // one of the 1,886, and it disagrees — a third of the slice is type 0 and
  // stands still, and plenty of them are not shopkeepers.

  /** Where each number sits in a `moves` row. */
  const MOVE_WALK = 0, MOVE_RUN = 1, MOVE_NOTICE = 2, MOVE_XP = 3
  const MOVE_BACK = 4, MOVE_WANDER = 5, MOVE_TYPE = 6, MOVE_SWIM = 7
  /**
   * The game's own two speeds, which the table gives multipliers of.
   *
   * 2.5 yards a second walking and 7.0 running are the figures every
   * `speed_walk` and `speed_run` in the database is a multiple of — a creature
   * at 1.14 is 8 yards a second — so they are the one pair of numbers here
   * that has to be stated rather than read, and stating them is what makes the
   * six hundred that *are* read mean anything.
   */
  const WALK_BASE = 2.5, RUN_BASE = 7.0

  /**
   * Who has a model, and which of them.
   *
   * Six townsfolk because eighty-three people who are all the same person is
   * the complaint this repository already answered once for the drawn sheet.
   * The kobolds, murlocs, ghosts and every animal are missing from here and
   * cannot be added: there is no CC0 model set for fantasy monsters or forest
   * animals in this style, which was looked for rather than assumed, so those
   * 547 keep the drawn sheet and the seam is visible.
   */

  type Npc = {
    x: number; y: number; hx: number; hy: number
    dir: number; t: number; art: string; alpha: number
    r: number; wander: number; swims: boolean
    vx: number; vy: number; until: number; moving: boolean
    kind: string; role: string; level: number; topic: Topic | null; seed: number
    /** Which creature this is in the world database, which is what a quest
     * names: all three of Northshire's kobolds are `kobold` and the chain
     * wants eight of each in turn. */
    entry: number
    /** Out of `creature_template.speed_walk`, times the game's own 2.5. */
    pace: number
    /** `creature_template.detection_range`, which was a flat twenty. */
    notice: number
    /** `creature_template.speed_run`, times the game's 7.0. */
    chase: number
    /** `creature.spawntimesecs`, which was a flat thirty. */
    back: number
    /** `creature_template.ExperienceModifier`. */
    worth: number
    /** Nothing below this line exists until somebody swings. */
    fight: Fight | null
    hp: number; max: number
    /** When it died, so it can lie there a while and then come back. */
    dead: number
    /** When it was last hit, which is how long its health bar stays up. */
    hurt: number
    /** Who it is fighting, which for now is only ever the player. */
    angry: boolean; next: number
    /** A cut that keeps cutting: when it stops, when it next bites, how hard. */
    bleed: { until: number; next: number; each: number } | null
    /** What it is carrying, and whether anybody has been through it yet. */
    haul: [number, number, number[][]] | null
    looted: boolean
    /** Where it was at the start of this step — the drawing interpolates. */
    was: { x: number; y: number }
    /** And where it is drawn, which is between the two. */
    ix: number; iy: number
    guid: number; pool: number; most: number; leader: number
    up: boolean
    /** When each of its own abilities is ready again. */
    cools: Record<number, number>
    /**
     * Who it is angry at and how much — `ThreatManager`, keyed by name.
     *
     * One entry, because there is one player and no pets; the list is here so
     * that "who is it hitting" is a rule rather than the only thing in reach,
     * and so taunt has something to act on when it arrives.
     */
    threat: Record<string, number>
  }
  const npcs: Npc[] = []
  let unplaceable = 0
  for (const row of spawns.npcs) {
    const kind = spawns.kinds[row[2]!]!
    const borrowed = BORROWED[kind]
    const art = faceOf(borrowed ? borrowed.art : kind, row[0]!, row[1]!)
    const a = npcArt.kinds[art]
    if (!a) { unplaceable++; continue }
    const role = spawns.roles[row[5]!]!
    const fight = (spawns.fights && row[7] !== undefined && row[7]! >= 0)
      ? spawns.fights[row[7]!]! : null
    // How much room a body takes, from the length the bake drew it at. People
    // have no `yards` — they are drawn at LPC's own scale, like the player.
    const yards = a.yards ?? 1.2
    const way = spawns.moves?.[row[10] ?? -1] ?? []
    npcs.push({
      x: row[0]!, y: row[1]!, hx: row[0]!, hy: row[1]!,
      dir: row[3]!, t: hash(row[0]!, row[1]!) * 4, art,
      alpha: borrowed ? borrowed.alpha : 1,
      r: Math.max(0.3, yards * 0.28),
      // How far it strays and whether it strays at all, from `creature`
      // rather than from a rule about shopkeepers.  `MovementType` 0 is a
      // creature that stands still, 1 wanders inside `wander_distance`, 2
      // walks a path; a third of the slice is type 0 and was wandering.
      wander: way[MOVE_TYPE] === 1 ? way[MOVE_WANDER]! : 0,
      pace: WALK_BASE * (way[MOVE_WALK] ?? 1),
      chase: RUN_BASE * (way[MOVE_RUN] ?? 1),
      worth: way[MOVE_XP] ?? 1,
      notice: way[MOVE_NOTICE] ?? 20,
      back: way[MOVE_BACK] ?? 30,
      // `creature_template_movement.Swim`: 2,352 of the slice can be in
      // water and every one of them was being kept out of it.
      swims: !!way[MOVE_SWIM], vx: 0, vy: 0, until: 0, moving: false,
      kind, role, level: row[4]!, seed: row[0]! * 31 + row[1]!,
      topic: row[6]! >= 0 ? spawns.topics[row[6]!]! : null,
      entry: row[9] ?? 0,
      // The world's own identity for this spawn, and who it walks with.
      guid: row[11] ?? 0, pool: row[12] ?? 0, most: row[13] ?? 0,
      leader: row[14] ?? 0,
      /** Standing right now: a shared slot stands up only so many at once. */
      up: true,
      fight, hp: fight ? fight[HP]! : 1, max: fight ? fight[HP]! : 1,
      dead: 0, hurt: -99, angry: false, next: 0, bleed: null,
      haul: (spawns.hauls && row[8] !== undefined && row[8]! >= 0)
        ? spawns.hauls[row[8]!]! : null,
      looted: false,
      was: { x: row[0] as number, y: row[1] as number },
      ix: row[0] as number, iy: row[1] as number,
      threat: {},
      cools: {},
    })
  }

  /**
   * Which members of a shared slot are standing.
   *
   * `pool_creature` was read and used as an *exclusion* — a pooled creature
   * was dropped, which threw away exactly the ones the server rotates.  It is
   * the same mechanic the herb nodes use: `pool_template.max_limit` says how
   * many of a slot stand at once.
   */
  {
    const byPoolNpc = new Map<number, Npc[]>()
    for (const n of npcs) {
      if (!n.pool) continue
      const got = byPoolNpc.get(n.pool)
      if (got) got.push(n)
      else byPoolNpc.set(n.pool, [n])
    }
    let asleep = 0
    for (const [, members] of byPoolNpc) {
      const most = members[0]?.most || members.length
      members.forEach((m, i) => { if (i >= most) { m.up = false; asleep += 1 } })
    }
    if (asleep) console.info(`${asleep} spawns are waiting their turn in a pool`)
  }

  /**
   * Nudge anybody our water mask swallowed, and only by a little.
   *
   * A creature's position is the server's and it is a fact: something stood
   * there.  The water is ours — the client's `MH2O` in one world, the lowest
   * five per cent of an interpolated height field in the other — and it is
   * sampled on a 4.17 yard grid, so a cat two yards up the beach rounds into
   * the lake.  That is the case worth fixing, and the measurement says it is
   * most of them: of the seventy-nine spawns inside the mask, thirty-one are
   * within two yards of dry ground and the worst is twenty-eight.
   *
   * So the search stops at six yards.  Past that the creature is not a
   * rounding error, it is a murloc, and moving it thirty yards inland to keep
   * our own guess about where the shore is would be the tail wagging the dog.
   * Those keep their place and are allowed to move in it.
   */
  let settled = 0, afloat = 0
  const taken = (x: number, y: number) => wetAt(x, y) || solidAt(x, y)
  const REACH = 6
  for (const n of npcs) {
    if (!taken(n.x, n.y)) continue
    for (let ring = 1.5; ring <= REACH && taken(n.x, n.y); ring += 1.5)
      for (let a = 0; a < 12; a++) {
        const t = (a / 12) * Math.PI * 2
        const px = n.hx + Math.cos(t) * ring, py = n.hy + Math.sin(t) * ring
        if (!taken(px, py)) { n.x = px; n.y = py; settled++; break }
      }
    // Whoever is still standing in it belongs in it, and their own movement
    // test stops asking about water. Wherever they ended up is now home, or
    // they would walk straight back to the lake.
    if (wetAt(n.x, n.y)) { n.swims = true; afloat++ }
    n.hx = n.x; n.hy = n.y
  }

  /**
   * The same bucket trick as the scenery, rebuilt every frame.
   *
   * The scenery's grid is built once because nothing in it moves; these do, so
   * theirs is thrown away and refilled — seven hundred inserts, which is less
   * work than one linear scan of the same list would be, and the alternative
   * is a player who can walk through a cow.
   */
  const npcGrid = new Map<string, Npc[]>()
  /**
   * Whoever is close enough to matter this frame.
   *
   * Everything that runs per frame over the cast — the wander, the collision
   * grid, the earshot test — used to run over all of them, which was 777 and
   * is now 1,884 in a forest a hundred times the size of the old slice.  A
   * creature four hundred yards away has nobody to be seen by: it is not
   * indexed, it does not take a step, and it is not asked whether it can hear
   * you.  The radius is well past the widest view, so what is skipped is what
   * cannot be looked at.
   */
  const NEAR = 260
  let active: Npc[] = []
  function awake() {
    active = []
    for (let i = 0; i < npcs.length; i++) {
      const n = npcs[i]!
      if (!n.up) continue
      if (Math.abs(n.x - camX) < NEAR && Math.abs(n.y - camY) < NEAR) active.push(n)
    }
  }

  function reindex() {
    npcGrid.clear()
    for (const n of active) {
      const k2 = key(Math.floor(n.x / BUCKET), Math.floor(n.y / BUCKET))
      const b = npcGrid.get(k2)
      if (b) b.push(n)
      else npcGrid.set(k2, [n])
    }
  }
  reindex()

  /** `skip` is how an NPC asks without colliding with itself. */
  const npcAt = (wx: number, wy: number, skip: Npc | null) => {
    const bi = Math.floor(wx / BUCKET), bj = Math.floor(wy / BUCKET)
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const b = npcGrid.get(key(bi + i, bj + j))
        if (!b) continue
        for (const n of b) {
          if (n === skip) continue
          const dx = wx - n.x, dy = wy - n.y
          if (dx * dx + dy * dy < n.r * n.r) return true
        }
      }
    return false
  }

  /**
   * The crossings, as rectangles the client's own records give.
   *
   * A bridge is a WMO and the WMO record carries a bounding box, which is the
   * only thing in the world that says how long a crossing is.  Six of them
   * were being thrown away outright — `classify_wmo` answered `None` for
   * BRIDGE — so every river in Elwynn was uncrossable water with a fence
   * standing beside it.
   *
   * The box is not the deck, and that cost two rounds.  It is the box *after*
   * the thing has been turned, so a bridge lying diagonally comes back square:
   * Elwynn's lion bridge as 68 yards by 71, Northshire's as 26 by 26.  Painted
   * as decks those were plazas of planks, one of them over half a lake.  The
   * bake turns each box back into the rectangle it came from — `bl` along,
   * `bw` across, `ba` the bearing — so what is painted here is the footprint
   * and the deck lies the way the bridge does.
   */
  /** How far you would have to keep walking from here before the water ends. */
  const toBank = (x: number, y: number, cx: number, cy: number, cap: number) => {
    let m = 0
    while (m < cap && wetAt(x + cx * m, y + cy * m)) m += 1
    return m
  }
  const spans = meta.doodads
    .filter((d) => (d.k === 'bridge' || d.k === 'bridge_stone')
      && !!d.bl && !!d.bw)
    .map((d) => {
      const rad = (d.ba! * Math.PI) / 180
      /**
       * Which way it lies, and the one case where the record cannot say.
       *
       * A box turned 45 degrees is the same square whichever way round the
       * thing inside it is, so for Northshire's bridge the sizes come back
       * from another instance of the model but the bearing is either this one
       * or ninety degrees off it — `bq` is the bake admitting that.  The
       * wrong one of the two is not subtle: the deck lies *along* the river
       * rather than across it, so you walk onto sixty yards of planks and
       * step off into the water at the far end.
       *
       * The terrain settles it, because a crossing reaches a bank at both
       * ends.  Only for the ones flagged: a bearing the record does give is
       * not up for revision, and letting the terrain vote on those turned a
       * well-measured bridge nine degrees for a two-yard gain.
       */
      const ways = [
        { l: d.bl!, w: d.bw!, c: Math.cos(rad), s: Math.sin(rad) },
        ...(d.bq
          ? [{ l: d.bl!, w: d.bw!, c: -Math.sin(rad), s: Math.cos(rad) }]
          : []),
      ].map((v) => ({
        ...v,
        // Sixty yards is further than any crossing in the forest is long, so
        // it is a "this end is nowhere near land" answer and not a limit.
        swim: toBank(d.x - v.c * v.l, d.y - v.s * v.l, -v.c, -v.s, 60)
          + toBank(d.x + v.c * v.l, d.y + v.s * v.l, v.c, v.s, 60),
      }))
      const lie = ways[1] && ways[1].swim < ways[0]!.swim ? ways[1] : ways[0]!
      /**
       * And then it runs on until it is over something dry.
       *
       * The record's box is the model's, and a model's box stops where its
       * geometry does — while the water mask is 4.17 yards a cell and rounds
       * a shoreline outwards.  Between them a deck could finish in open
       * water: you could stand on it and not get on or off, which is worse
       * than no bridge, because the river was impassable either way and now
       * it looks as though it should not be.
       */
      const back = toBank(d.x - lie.c * lie.l, d.y - lie.s * lie.l,
        -lie.c, -lie.s, 20)
      const on = toBank(d.x + lie.c * lie.l, d.y + lie.s * lie.l,
        lie.c, lie.s, 20)
      // Planks run the length of a wooden bridge, so which of the two decks
      // is cut depends on which way it lies.  Stone has no grain.
      const planks = Math.abs(lie.c) >= Math.abs(lie.s) ? 'bridge' : 'bridge_b'
      return {
        x: d.x, y: d.y, w: lie.w, c: lie.c, s: lie.s,
        /** Half the length, one end at a time, because the banks differ. */
        lo: -(lie.l + back), hi: lie.l + on,
        tile: d.k === 'bridge_stone' ? 'stone' : planks,
        /** The deck's height, which is what you stand on rather than the bed. */
        z: d.z,
      }
    })
  /**
   * The buildings, at the size and the angle the client states.
   *
   * Northshire's abbey is ninety-one yards across and its two walls are a
   * hundred and sixty, and all three were drawn as the same thirteen-yard
   * cottage sprite — which is why the place did not look like itself.  The
   * record has carried the footprint the whole time: it is the same box the
   * crossings use, turned back into a rectangle by `footprint` in the bake.
   *
   * So a building is its plan.  There is no abbey in any tileset here and
   * there never will be, but a stone floor of the right size at the right
   * angle with a wall around it is the shape the place has from above, and the
   * shape is the part that makes it recognisable.  The sprite stays for the
   * ones small enough to *be* the sprite.
   */
  /** Base64 to bytes, for the packed footprints. */
  const bytesOf = (b64: string) => {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }
  const buildings = meta.doodads
    .filter((d) => BUILT.has(d.k) && !!d.bl && !!d.bw)
    .map((d) => {
      const a = ((d.ba ?? 0) * Math.PI) / 180
      // The rooms the model is made of, placed where the model says.  A
      // placement record gives one box for a whole building, and for the abbey
      // that box is 91 yards square — the grounds, not the abbey.  `MOGI`
      // gives every group its own, fourteen for the abbey, and the union of
      // those is a cross where the single box is a square.  Anything with no
      // groups falls back to its box, which is what a one-group gate is
      // anyway.
      // The model's own footprint, rasterised by the bake out of its own
      // triangles — 18,817 of them for the abbey — one bit a square yard in
      // the model's own space.  A plan made of the group boxes is a handful of
      // rectangles, which is better than the single box the placement states
      // and still not a building: the abbey is a nave, a crossing and a tower,
      // and three rectangles round them is a blob.
      const raw = d.p ? (meta.plans ?? {})[String(d.p)] : undefined
      const plan = raw ? {
        w: raw[0], h: raw[1], s: raw[2], x0: raw[3], y0: raw[4],
        bits: bytesOf(raw[5]),
        // The wall and the floor, asked of the same file the outline came
        // from: a wall is where a man of the client's own height cannot
        // stand, and the floor is where he can.  Which means the doorways
        // are not marked anywhere — they simply are not wall, because a man
        // fits in one.
        solid: bytesOf(raw[6]), floor: bytesOf(raw[7]),
        // The turn that takes the model's space to the map, in radians.
        c: Math.cos(((d.mr ?? 0) * Math.PI) / 180),
        sn: Math.sin(((d.mr ?? 0) * Math.PI) / 180),
      } : null
      const rooms = (d.rooms ?? []).map(([x, y, l, w, deg]) => {
        const t = (deg * Math.PI) / 180
        return { x, y, l, w, c: Math.cos(t), s: Math.sin(t) }
      })
      return {
        x: d.x, y: d.y, l: d.bl!, w: d.bw!,
        c: Math.cos(a), s: Math.sin(a), k: d.k,
        area: d.a ?? 0,
        /** The bake's number for this placement, which its furniture cites. */
        house: d.h ?? 0,
        plan,
        rooms: rooms.length ? rooms : [{
          x: d.x, y: d.y, l: d.bl!, w: d.bw!,
          c: Math.cos(a), s: Math.sin(a),
        }],
      }
    })
  type Built = (typeof buildings)[number]
  type Plan = NonNullable<Built['plan']>
  /**
   * Which cell of a building's plan a point on the map falls in, or -1.
   *
   * Back out of the map into the model's own space: `to_world` in the bake
   * turns a local point by `ry + 270` and maps the client's axes on to ours,
   * and this is that, inverted.
   */
  const planCell = (p: Plan, b: Built, wx: number, wy: number) => {
    const u = wx - b.x, v = -(wy - b.y)
    const lx = u * p.sn + v * p.c, ly = u * p.c - v * p.sn
    const i = Math.floor((lx - p.x0) / p.s)
    const j = Math.floor((ly - p.y0) / p.s)
    if (i < 0 || i >= p.w || j < 0 || j >= p.h) return -1
    return i * p.h + j
  }
  const bitAt = (bits: Uint8Array, n: number) =>
    n >= 0 && ((bits[n >> 3]! >> (n & 7)) & 1) === 1
  /**
   * The buildings, in a coarse grid.
   *
   * `inRoom` is asked once a ground tile and the widest view is eleven hundred
   * tiles a frame; walking all 105 buildings for each of them is a hundred and
   * twenty thousand box tests a frame to answer "no" almost every time.  A
   * hundred-yard cell is coarse enough that the grid is tiny and fine enough
   * that a tile usually lands in an empty one.
   */
  /** Building by the bake's own placement number, for its own furniture. */
  const byHouse = new Map<number, (typeof buildings)[number]>()
  for (const b of buildings) if (b.house) byHouse.set(b.house, b)
  const BLOCK = 100
  const blocksOf = new Map<number, typeof buildings>()
  for (const b of buildings) {
    const reach = Math.max(b.l, b.w) + 2
    for (let i = Math.floor((b.x - reach) / BLOCK); i <= Math.floor((b.x + reach) / BLOCK); i++)
      for (let j = Math.floor((b.y - reach) / BLOCK); j <= Math.floor((b.y + reach) / BLOCK); j++) {
        const k = i * 100000 + j
        const got = blocksOf.get(k)
        if (got) got.push(b)
        else blocksOf.set(k, [b])
      }
  }
  /** Inside any one of a building's rooms, and which building. */
  const inRoom = (wx: number, wy: number) => {
    const near = blocksOf.get(Math.floor(wx / BLOCK) * 100000 + Math.floor(wy / BLOCK))
    if (!near) return null
    for (const b of near) {
      // The whole box first, so a point outside costs one test and not
      // fourteen.
      const dx = wx - b.x, dy = wy - b.y
      if (Math.abs(dx * b.c + dy * b.s) > b.l + 2) continue
      if (Math.abs(-dx * b.s + dy * b.c) > b.w + 2) continue
      // The footprint if the model gave one, and its boxes if it did not.
      const p = b.plan
      if (p) {
        if (bitAt(p.bits, planCell(p, b, wx, wy))) return b
        continue
      }
      for (const r of b.rooms) {
        const ex = wx - r.x, ey = wy - r.y
        if (Math.abs(ex * r.c + ey * r.s) <= r.l
          && Math.abs(-ex * r.s + ey * r.c) <= r.w) return b
      }
    }
    return null
  }
  /**
   * Inside a building's plan, and whether this is its wall.
   *
   * `thick` is how wide the wall is *for this sample*, and it is the ground's
   * own step rather than a fixed yard and a half.  The ground draws a coarser
   * tile the further out you are — up to five yards — and a wall thinner than
   * the tile that samples it comes out as a dotted line of black squares
   * instead of a wall, which is what the abbey looked like from far enough
   * away to see all of it.
   */
  const inBuilding = (wx: number, wy: number, thick = 1.5) => {
    const here = inRoom(wx, wy)
    if (!here) return null
    const p = here.plan
    if (!p) {
      // No footprint, so only the edge of the box is claimed: filling a box is
      // the mistake that buried the middle of Northshire.
      const dx = wx - here.x, dy = wy - here.y
      const al = Math.abs(dx * here.c + dy * here.s)
      const ac = Math.abs(-dx * here.s + dy * here.c)
      return al > here.l - thick || ac > here.w - thick
        ? { b: here, wall: true, floor: false } : null
    }
    // The wall is not the outline any more, and it is not guessed from one
    // either.  The bake asks the building's own triangles where a man of the
    // client's own height can stand, and what is left over inside the outline
    // is stone: walls, buttresses, the pillars down the nave.  A doorway is
    // not marked as anything — a man fits in it, so it is simply not wall,
    // and the abbey's eight ground-floor doors come out open on their own.
    const n = planCell(p, here, wx, wy)
    // A wall thinner than the tile that samples it falls between samples, and
    // the abbey came out a dotted line of black squares the moment the ground
    // was allowed to draw coarser than a plan cell.  So a tile asks over the
    // cells it actually covers — `thick` wide, so `thick/2` either way — and
    // at the size the plan is cut for, that is the one cell it already read.
    //
    // What it asks them is which there is more of, not whether there is any.
    // A four-yard tile covers nine cells of an abbey and hits a pillar or a
    // step in most of them, so "any" painted the whole nave as stone; the
    // thing a tile that size is standing in for is the mass underneath it.
    const reach = Math.floor(thick / 2 / p.s)
    if (!reach) return { b: here, wall: bitAt(p.solid, n), floor: bitAt(p.floor, n) }
    // Nine samples spread over the tile, however wide it is, rather than every
    // cell under it.  At the widest zoom a tile is ten yards and covers
    // eighty-one cells, and asking all of them for every tile of a building
    // cost twenty frames a second — for an answer that is a majority vote and
    // does not change between nine samples and eighty-one.
    let stone = 0, room = 0
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const m = n + a * reach * p.h + b * reach
        if (m < 0 || m >= p.w * p.h) continue
        if (bitAt(p.solid, m)) stone++
        else if (bitAt(p.floor, m)) room++
      }
    return { b: here, wall: stone > room, floor: room >= stone && room > 0 }
  }
  /** Planks underfoot: inside a crossing's own rectangle, turned as it is. */
  /**
   * The crossings, in the same coarse grid the buildings use, and for the same
   * reason: this is asked once a ground tile and there are eleven hundred of
   * those a frame at the widest zoom.
   */
  const spanBlocks = new Map<number, typeof spans>()
  for (const b of spans) {
    const reach = Math.max(Math.abs(b.lo), Math.abs(b.hi)) + b.w + 2
    for (let i = Math.floor((b.x - reach) / 100); i <= Math.floor((b.x + reach) / 100); i++)
      for (let j = Math.floor((b.y - reach) / 100); j <= Math.floor((b.y + reach) / 100); j++) {
        const k = i * 100000 + j
        const got = spanBlocks.get(k)
        if (got) got.push(b)
        else spanBlocks.set(k, [b])
      }
  }
  const onSpan = (wx: number, wy: number) => {
    const near = spanBlocks.get(Math.floor(wx / 100) * 100000 + Math.floor(wy / 100))
    if (!near) return null
    for (const b of near) {
      const dx = wx - b.x, dy = wy - b.y
      const along = dx * b.c + dy * b.s
      if (along >= b.lo && along <= b.hi
        && Math.abs(-dx * b.s + dy * b.c) <= b.w) return b
    }
    return null
  }

  /**
   * Water, bare rock, a trunk, somebody's wall, or somebody.
   *
   * A deck answers neither of the first two.  Not the water, which is the
   * point of a bridge, and not the slope either: the lion bridge crosses a
   * ravine, so the ground a third of the way along it falls away at more than
   * the cliff limit, and checking the ground under a floor walled the crossing
   * off six yards from each bank.
   */
  const blocked = (wx: number, wy: number) =>
    (onSpan(wx, wy) ? false : stepAt(wx, wy) > CLIFF) || footing(wx, wy)
  /**
   * Everything that stops you that is not a slope.
   *
   * The player is held to this one and not to `blocked`, because refusing to
   * let somebody step on to steep ground is not what that game does — and
   * refusing is exactly what made the mountains climbable.  Refusing costs
   * nothing, so a wall of steep cells with a gentle one between them is a
   * maze, and a maze can be solved.  `slide` puts you back down instead, which
   * cannot be solved: every wrong step gives ground back.
   *
   * The client's own impassable chunks stay in it.  Those are not a slope,
   * they are the world saying no.
   */
  function footing(wx: number, wy: number) {
    return (onSpan(wx, wy) ? false : wetAt(wx, wy) || closedAt(wx, wy)
      || openHole(wx, wy))
      || solidAt(wx, wy) || wallAt(wx, wy) || npcAt(wx, wy, null)
  }

  /**
   * Somebody's wall.
   *
   * Until this there was none: the abbey was a picture of a building and you
   * walked through the middle of it, and every attempt to put collision on the
   * record's own box either stopped you three yards short of a wall that lies
   * diagonally or sealed the doors.  The mask asks the building's own geometry
   * instead, and a doorway is open because a man fits through it.
   *
   * Asked at the plan's own grain rather than the ground's, because this is
   * where you are and not what is drawn: a wall widened to the size of a
   * distant tile would stop you a tile away from it.
   */
  function wallAt(wx: number, wy: number) {
    const got = inBuilding(wx, wy, 0)
    return !!got && got.wall
  }

  /**
   * Ground too steep to stand on does not stop you, it puts you back down.
   *
   * Refusing to step on to it is not what that game does and it is why the
   * mountains were climbable: refusing costs nothing, so a wall of steep cells
   * with a gentle one between them is a maze, and a maze can be solved.  A
   * player who is *pushed* cannot solve it — every wrong step gives ground
   * back, and a hundred-yard switchback at the limit never finishes.
   *
   * Which way is downhill comes from the height grid, and how hard from how
   * far past the limit the ground is: at the limit nothing, and at twice it
   * about a walking pace.  The one number in it is the limit, and that is the
   * world's — the steepest leg the server walks a creature over.
   */
  function slide(dt: number) {
    const over = stepAt(hero.x, hero.y) - CLIFF
    if (over <= 0) return
    const [gx, gy] = gradient(hero.x, hero.y)
    const len = Math.hypot(gx, gy)
    if (len < 1e-4) return
    // Downhill is against the gradient, at a speed that grows with how far
    // past standing the ground is and never beats a run.
    const push = Math.min(RUN_BASE, over * WALK_BASE * 2) * dt
    const nx = hero.x - (gx / len) * push, ny = hero.y - (gy / len) * push
    if (!solidAt(nx, hero.y) && !wetAt(nx, hero.y)) hero.x = nx
    if (!solidAt(hero.x, ny) && !wetAt(hero.x, ny)) hero.y = ny
  }

  /**
   * Wandering, and the reason it is not random.
   *
   * `hash` is the same seeded function the scenery is scattered with, keyed on
   * the NPC's index and a slow tick, so two visitors to the same page at the
   * same moment see the same forest doing the same thing — and so does a
   * screenshot taken twice.  `Math.random` would have made every check of this
   * scene a different scene.
   */
  function wander(dt: number, time: number, busy: Npc | null) {
    const tick = Math.floor(time * 0.4)
    for (let i = 0; i < active.length; i++) {
      const n = active[i]!
      n.was.x = n.x; n.was.y = n.y
      // Nobody walks off in the middle of answering you, and the dead lie
      // where they fell.
      if (n.dead) { n.moving = false; continue }
      if (n.wander === 0 || n === busy) { n.moving = false; continue }
      // Something in a fight is not wandering: it is coming at you, and it
      // ignores the leash the database gave it while it does.
      if (n.angry) {
        const dx0 = hero.x - n.x, dy0 = hero.y - n.y
        const d = Math.hypot(dx0, dy0)
        n.moving = d > MELEE * 0.8
        n.dir = facing(dx0, dy0)
        if (n.moving) {
          n.t += dt
          // Charging, so its running speed: `creature_template.speed_run`
          // times the game's 7.0.  It was the walk rate times 1.4, which made
          // a wolf slower than the man it was chasing.
          const step = n.chase * dt
          const nx = n.x + (dx0 / d) * step, ny = n.y + (dy0 / d) * step
          if (!((!n.swims && wetAt(nx, n.y)) || solidAt(nx, n.y))) n.x = nx
          if (!((!n.swims && wetAt(n.x, ny)) || solidAt(n.x, ny))) n.y = ny
        }
        continue
      }
      if (time > n.until) {
        const h = hash(i, tick)
        n.until = time + 1.5 + h * 4
        if (h < 0.45) { n.vx = 0; n.vy = 0 } else {
          const a = hash(i + 7919, tick) * Math.PI * 2
          n.vx = Math.cos(a); n.vy = Math.sin(a)
        }
      }
      n.moving = n.vx !== 0 || n.vy !== 0
      if (!n.moving) continue
      n.t += dt
      const dx = n.vx * n.pace * dt, dy = n.vy * n.pace * dt
      // Nobody leaves the spot the database put them on for good.
      if ((n.x + dx - n.hx) ** 2 + (n.y + dy - n.hy) ** 2 > n.wander ** 2) {
        n.vx = -n.vx; n.vy = -n.vy
        // And turn round with it.  Reversing the velocity and leaving the
        // pose is how a wolf comes to walk backwards for the four seconds
        // until its next decision — which is most of the time, because the
        // leash is what stops almost every wander.
        n.dir = facing(n.vx, n.vy)
        continue
      }
      // An NPC that spawned inside a wall stays in it rather than squeezing
      // out: the player gets an escape from being stuck because a stuck player
      // is unplayable, but a cow walking out through a barn is worse than a
      // cow standing in one.
      const wall = (x: number, y: number) =>
        // Wandering keeps out of water whatever the thing can do: being able
        // to swim is not a reason to paddle about, and a field of wolves
        // treading water is what reading it that way looked like.  Chasing is
        // where `swims` is asked, below.
        wetAt(x, y) || stepAt(x, y) > CLIFF
        || solidAt(x, y) || npcAt(x, y, n)
      if (!wall(n.x + dx, n.y)) n.x += dx
      if (!wall(n.x, n.y + dy)) n.y += dy
      n.dir = facing(n.vx, n.vy)
    }
  }

  /**
   * Back to front, and back is north.
   *
   * North is up the glass and nothing else is, so what sits further up is
   * drawn first.  It was `x + y` for one round, because in quarter view up the
   * glass was both axes at once.  Sorting once is enough: nothing here moves.
   */
  const depth = (o: { x: number; y: number }) => o.x
  /**
   * The world's objects: veins, herbs, chests, fires, signposts.
   *
   * `gameobject` is 96,624 rows and this pipeline used exactly one of them —
   * as a *height sample*, in the synthesised world.  Not one was ever placed,
   * so there was nothing in this world to open and nothing to gather, and the
   * starting zone's 130 copper veins and 83 silverleaf were not there.
   */
  type Node = {
    x: number; y: number; kind: string; face: number
    /** The trade a lock asks for, or the empty string for anything openable. */
    trade: string
    /** And how much of it — `Lock.dbc`'s own number. */
    skill: number
    /** How long the world database says it takes to come back. */
    back: number
    haul: (string | number)[][]
    /** Which shared slot it belongs to, or 0. */
    pool: number
    /** Standing right now, and when it is due back if it is not. */
    up: boolean
    due: number
  }
  const nodes: Node[] = (things.objects ?? []).map((r) => ({
    x: r[0] as number, y: r[1] as number, kind: r[2] as string,
    face: r[3] as number, trade: r[4] as string, skill: r[5] as number,
    back: r[6] as number, haul: things.hauls?.[r[7] as number] ?? [],
    pool: r[9] as number, up: true, due: 0,
  }))
  /**
   * Which members of a shared slot are standing.
   *
   * This is how a herb node works and it is not a detail: Elwynn has 36
   * copper-vein spots with nine up at a time, 34 silverleaf spots with nine.
   * Take the pool away and the map has every node standing at once, which is
   * not a forest you gather in, it is a shop.  Take the *members* away —
   * which is what dropping pooled rows does, the way the creature spawns do —
   * and there is nothing to gather at all.
   *
   * `pool_template.max_limit` says how many, and which ones is ours: the
   * first `limit` in file order to begin with, and after that whichever free
   * member comes up when one is taken.
   */
  const byPool = new Map<number, Node[]>()
  for (const n of nodes) {
    if (!n.pool) continue
    const got = byPool.get(n.pool)
    if (got) got.push(n)
    else byPool.set(n.pool, [n])
  }
  for (const [pool, members] of byPool) {
    const limit = things.pools?.[String(pool)] ?? members.length
    members.forEach((m, i) => { m.up = i < limit })
  }
  /** Bring a taken slot back, somewhere else in the same pool. */
  const restock = (n: Node) => {
    const members = n.pool ? byPool.get(n.pool) : null
    if (!members) { n.up = true; return }
    const free = members.filter((m) => !m.up && m.due <= 0)
    const pick = free.length ? free[Math.floor(roll() * free.length)]! : n
    pick.up = true
  }

  // Drawn with the rest of the scenery, so a vein sorts behind the tree it is
  // behind — which means they have to join the list *before* it is sorted.
  // The picture is the kind's, the same table the doodads use.
  for (const n of nodes) {
    const k = KIND[n.kind]
    if (!k || !k.pieces.length) continue
    const pick = k.pieces[Math.floor(hash(n.x, n.y) * k.pieces.length)
      % k.pieces.length]!
    const piece = tilesMeta[pick]
    if (!piece) continue
    placed.push({ x: n.x, y: n.y, piece, node: n, kind: n.kind,
      s: ((k.yards ?? 1) * PPY) / piece.h })
  }
  placed.sort((a, b) => depth(b) - depth(a))

  /**
   * The scenery, in buckets, because there are now twelve thousand of it.
   *
   * The frame used to walk the whole list and throw away what was off screen,
   * which was fine at the four thousand a 600 yard disc held and is not at the
   * whole forest's 12,451 — at the widest zoom that scan alone was most of a
   * frame.  Bucketed, the same frame touches the tens of buckets the view
   * covers.  The list stays sorted, so each bucket is sorted, and the visible
   * pieces only have to be merged rather than sorted again.
   */
  const PATCH = 48
  /**
   * How tall a piece of scenery has to draw before it is worth its own call.
   *
   * Eight pixels, and the number is bounded on both sides by something real.
   * Below it a tree is a dab of colour and half of them are redundant.  Above
   * it is where the pictures the checks hold live: `shotcheck`'s widest spot
   * is zoom 0.3, where the scenery draws ten pixels and up, so nothing it
   * guards is thinned — the rule only engages past the zoom anybody plays at.
   */
  const SPECK = 8
  const patchKey = (x: number, y: number) =>
    Math.floor(x / PATCH) * 100000 + Math.floor(y / PATCH)
  // What is indoors, settled once.  A building's own doodads stand inside it —
  // the abbey has a hundred and fifty — and drawn without this they stand on
  // the roof instead: a candle-lit nave laid out across the tiles.
  for (const o of placed) {
    // Whose it is, said by the bake rather than worked out from where it
    // stands.
    //
    // A shelf stands *against* a wall, and the outline it would be tested
    // against is a 1.33-yard mask cut from the building's own triangles — so
    // a piece pushed up to the stone lands a cell outside the silhouette and
    // reads as standing in the street.  With a hundred and fifty pieces that
    // was a curiosity; with three thousand it filled Goldshire with
    // bookcases.  The bake knows exactly which building each piece came out
    // of and now says so, which leaves nothing to get wrong.
    const b = (o.house ? byHouse.get(o.house) : undefined) ?? inRoom(o.x, o.y)
    if (b) o.in = b
  }

  /**
   * And anybody the walls closed on.
   *
   * The same nudge the water gets, for the same reason and with the same
   * limit: a spawn is the server's and it is a fact, but a wall is ours — a
   * 1.33 yard mask cut out of the model's triangles — and a monk standing
   * against the nave wall rounds into it.  Nine of the slice's 1,886 did.  A
   * yard and a half at a time out to three, which is a rounding error's worth
   * and not a relocation; past that he stays where the server put him.
   */
  let walled = 0
  for (const n of npcs) {
    if (!wallAt(n.x, n.y)) continue
    for (let ring = 1.5; ring <= 3 && wallAt(n.x, n.y); ring += 1.5)
      for (let a = 0; a < 12; a++) {
        const t = (a / 12) * Math.PI * 2
        const px = n.x + Math.cos(t) * ring, py = n.y + Math.sin(t) * ring
        if (!wallAt(px, py) && !wetAt(px, py)) {
          n.x = px; n.y = py; n.hx = px; n.hy = py; walled++
          break
        }
      }
  }
  if (walled) console.info(`${walled} spawns nudged out of a wall`)

  const buckets = new Map<number, Placed[]>()
  for (const o of placed) {
    const k = patchKey(o.x, o.y)
    const b = buckets.get(k)
    if (b) b.push(o)
    else buckets.set(k, [o])
  }

  // --- the player -------------------------------------------------------
  const START: [number, number] = [-8949.95, -132.493]
  const hero = {
    x: START[0], y: START[1], dir: 2, frame: 0, t: 0, moving: false,
    /** Where he was at the start of this step, so the drawing can interpolate. */
    was: { x: START[0], y: START[1] },
    /** And where he is drawn, which is between the two. */
    ix: START[0], iy: START[1],
  }
  /**
   * What the keys and the thumb are asking for.
   *
   * Read once a frame and acted on once a *step*: intent is an input and
   * movement is a simulation, and keeping them apart is what lets the second
   * run at a fixed rate while the first stays as responsive as the screen.
   */
  const want = { x: 0, y: 0 }

  /**
   * Put him somewhere, rather than let him walk there.
   *
   * A teleport has to move where he *was* as well as where he is, or the
   * drawing spends a step interpolating across the jump — and the camera,
   * which follows the drawn position, is dragged back toward wherever he came
   * from.  It showed up as the movement check reporting a walk two yards
   * sideways of the key that was pressed.
   */
  const placeHero = (x: number, y: number) => {
    hero.x = x; hero.y = y
    hero.was.x = x; hero.was.y = y
    hero.ix = x; hero.iy = y
  }


  // --- the fight --------------------------------------------------------
  /**
   * Level one, because that is where a character starts.
   *
   * It was five, with a comment saying Elwynn's wolves are five and there was
   * no experience yet so nothing would move it.  There is experience now, and
   * starting at five threw away the half of the zone the quest chain actually
   * begins in — Northshire, levels one to five, which is the only stretch of
   * this game where the errands run one into the next.
   */
  const HERO_LEVEL = who?.levels?.[0] ?? 1
  /**
   * What he is carrying, what he is wearing, and what he has been taught.
   *
   * Declared here rather than on `you` because `lineFor` reads them and `you`
   * is *built out of* `lineFor` — reaching into `you` from inside its own
   * initialiser is a `ReferenceError`, which is the same trip this file has
   * taken twice before.
   */
  let held: number[] = []
  let gear: Record<string, number> = {}
  let taught: number[] = []
  /** What he is made of at each level — `pipeline/player.py`, plus what he wears. */
  const itemOf = (id: number): Item | null => shelf.items?.[String(id)] ?? null
  const wornItems = (): Item[] =>
    Object.values(gear).map(itemOf).filter((x): x is Item => !!x)
  const statsAt = (lv: number): Stats => {
    const base = who?.stats?.[String(Math.max(1, lv))] ?? [23, 20, 22, 20, 20, 20]
    return withGear(base, wornItems())
  }
  /**
   * How far a fight can travel before it stops being one.
   *
   * Forty yards from where it started or from you, whichever goes first.  A
   * chase with no end is not a chase; it is a parade.
   */
  const LEASH = 40
  const LADDER = spawns.ladder ?? []
  /**
   * What a swing is worth and what it takes to kill him, per level.
   *
   * The damage line still comes from the creature arithmetic in
   * `spawn_npcs.py` — a hero is statted as a creature of his level would be,
   * plus his weapon — but **health and armour are derived now**: health from
   * stamina through the server's own curve, armour from agility.  Those two
   * used to come out of the same creature table, which meant a player had no
   * stamina and no agility and nothing he could ever wear would matter.
   */
  /**
   * What he is holding and wearing.
   *
   * The client's starting outfit until he picks something else up, and after
   * that whatever is in the weapon slot — so **the weapon's own `delay`
   * becomes the swing**, which used to be a constant out of the level table.
   */
  /**
   * The items a new character is created holding, by id.
   *
   * `CharStartOutfit.dbc` names five and what the original does with them is
   * **put them in his bags**.  Here they were five rows of arithmetic and
   * nothing else: a weapon's damage and swing borrowed as a fallback whenever
   * the weapon slot was empty, which it always was.  So the sheet said
   * `공격력 9 – 11 (2.9초)` and `입은 것  없음` on consecutive lines, and the
   * 2.9 was the greatsword nobody was holding.  Nothing could be sold,
   * swapped, or drawn on the paperdoll, because there was nothing there.
   */
  const KIT = (who?.kit ?? []).map((k) => k[K_ID] as number)
  /**
   * Put on, here, before `you` exists.
   *
   * `you` is built out of `lineFor`, and `lineFor` asks what is in the weapon
   * slot — so dressing him after the fact means the first three calls see an
   * empty hand.  They did, and the counter below caught it: the character was
   * created bare-handed and dressed a moment later, which is invisible when
   * both answers come out the same and is exactly the seam the whole bug
   * lived in.
   */
  held = [...KIT]
  for (const id of KIT) {
    const it = itemOf(id)
    if (!it || !canWear(it, HERO_LEVEL)) continue
    const slot = it[I_SLOT] as string
    if (!slot || gear[slot] !== undefined) continue
    const put = wear(gear, it, id)
    gear = put.gear
    held = held.filter((x) => x !== id).concat(put.off)
  }
  const heldWeapon = (): (string | number)[] | undefined => {
    const it = gear['weapon'] !== undefined ? itemOf(gear['weapon']!) : null
    if (it) {
      return ['weapon', it[I_LO] as number, it[I_HI] as number,
        it[I_DELAY] as number, it[I_ARMOUR] as number, 0]
    }
    // Bare hands, and it is a real answer rather than a stand-in for the
    // outfit: one second, one damage, which is what the server gives a player
    // with an empty weapon slot.  Reaching for the starting kit here was what
    // let the character sheet disagree with itself, and `bordercheck` now
    // counts how often this line is taken.
    barehanded++
    return ['weapon', 1, 1, 2000, 0, 0]
  }
  /** How many times the line above was needed — see the check. */
  let barehanded = 0
  const lineFor = (lv: number): Fight => {
    const row = spawns.player?.[Math.min(lv, spawns.player.length) - 1]
      ?? [100, 3, 5, 1900, 100, 0]
    const weapon = heldWeapon()
    if (!who || !weapon) return row
    const s = statsAt(lv)
    const worn = wornArmour(wornItems())
      || (who?.kit ?? []).reduce((n, k) => n + (k[K_ARMOUR] as number), 0)
    // `Player::CalculateMinMaxDamage`: the weapon's own damage plus attack
    // power spread over its swing, which is the line the shout already used.
    // This replaces a hero statted as *a creature of his level* — the comment
    // in `spawn_npcs.py` says so — and with it strength finally does
    // something, which was the whole complaint.
    const secs = (weapon[3] as number) / 1000
    const ap = (attackPower(lv, s) / 14) * secs
    return [maxHealth(s),
      Math.max(1, Math.round((weapon[1] as number) + ap)),
      Math.max(2, Math.round((weapon[2] as number) + ap)),
      weapon[3] as number, armourOf(s, worn), row[5] ?? 0]
  }
  const you = {
    level: HERO_LEVEL, line: lineFor(HERO_LEVEL),
    hp: lineFor(HERO_LEVEL)[HP]!, max: lineFor(HERO_LEVEL)[HP]!,
    xp: 0, next: 0, target: null as Npc | null, died: 0, calm: 0,
    rage: 0,
    /** Queued by a heavier blow, spent on the next swing. */
    extra: 0,
    /** When each thing with a cooldown is ready again. */
    cools: {} as Record<number, number>,
    /** And when the global one is — see `cast`. */
    gcd: 0,
    /** The shout, while it lasts. */
    shout: null as { until: number; ap: number } | null,
    purse: 0, kills: 0,
    /** word -> [how many, what the lot is worth in copper]. */
    bag: {} as Record<string, [number, number]>,

    /**
     * What he is good at picking up, by trade.
     *
     * `Lock.dbc` states what each node asks for: silverleaf and peacebloom
     * want nothing, earthroot wants fifteen, truesilver wants two hundred and
     * five.  So the *bar* is data, and what is not is the rate — one point a
     * node, which is the smallest step there is.  The server's own curve for
     * this lives in AzerothCore's C++ and that is not on this machine (see
     * issue 101); when it is, it goes here and nothing else changes.
     *
     * Both trades start at one because in this game a trade is learned by
     * doing it and not from a person.  The twenty-seven trade trainers the
     * slice contains are no longer baked as trainers at all — they have
     * nothing to sell anybody here — and `pipeline/items.py` counts them out
     * loud.  Starting at nought would make the number a lie rather than a
     * placeholder: a node asking for nothing would still refuse.
     */
    trades: { herbs: 1, mining: 1 } as Record<string, number>,
    /** Experience banked by stopping somewhere sensible — see `resting`. */
    rest: 0,
    /** When the ceiling was reached, which is where this slice ends. */
    finished: 0,
    /** When this character was made, so the ending can say how long it took. */
    born: Date.now(),
  }
  /**
   * The four things a warrior can do by level five.
   *
   * Every number in them is the client's, read by `pipeline/spells.py` and
   * never rounded on the way — fifteen rage for a heavier blow, ten for a cut
   * that bleeds five every three seconds for fifteen, a shout that buys
   * fifteen attack power for two minutes, and a run-up that costs nothing,
   * covers eight to twenty-five yards and pays nine rage back.
   *
   * Which of them is on the bar is decided by whether this engine understands
   * what it does.  An ability whose effects mean nothing here simply is not
   * offered, which is more honest than a button that does nothing.
   */
  // `E_DAMAGE` joins the list: it is a number of damage right now, and with
  // `SpellRadius.dbc` finally resolved it is what makes a thunderclap hit
  // everything within eight yards instead of nothing at all.
  const CAN_DO = new Set([E_WEAPON_ADD, E_ENERGIZE, E_AURA, E_DAMAGE])
  // How far a swing reaches, out of `SpellRange.dbc` rather than out of a
  // comment here that said "two bodies and an arm".
  if (spellbook.melee) setMelee(spellbook.melee)
  /**
   * Everything a warrior of this level can do.
   *
   * Filtered **per call** and not once at load.  It used to be once, against
   * the starting level, so levelling up changed your health and your damage
   * and never gave you anything new to press — and starting at level one, as
   * this now does, meant starting with nothing and finishing with nothing.
   * `spells.json` has carried the level on every row all along.
   */
  const known = (level: number) => (spellbook.spells ?? [])
    .filter((sp) => sp.level <= level && abilityOf(sp.id)
      && sp.does.some((d) => CAN_DO.has(d[0]!))
      // Created holding it, or paid a trainer for it.  Levelling opens
      // nothing on its own in the game this reproduces — it opens the
      // *option*, and the option costs money.  Handed out free, the one
      // economic decision this stretch of the game has disappears.
      && (sp.free || taught.includes(sp.id)))
    .sort((a, b) => a.level - b.level || a.id - b.id)
  let spells = known(HERO_LEVEL)
  const ICON_OF: Record<number, string> = {
    78: 'lorc/sword-slice.svg', 6673: 'lorc/shouting.svg',
    100: 'delapouite/charging-bull.svg', 772: 'lorc/bleeding-wound.svg',
  }

  /** Whether a thing can be used right now, and why not if it cannot. */
  const why = (sp: Spell): string | null => {
    if (you.died) return '쓰러져 있다'
    if (you.rage < sp.rage) return `분노가 ${sp.rage} 필요하다`
    // Anything that starts a wait also has to wait; anything that does not,
    // does not — a heavier blow goes off the next swing whatever else you
    // just pressed.
    if (sp.gcd && you.gcd > clock) return '아직 준비되지 않았다'
    if ((you.cools[sp.id] ?? 0) > clock) return '아직 준비되지 않았다'
    const far = sp.reach[1]
    if (far > 0) {
      const t = you.target
      if (!t || t.dead) return '대상이 없다'
      const d = Math.hypot(t.x - hero.x, t.y - hero.y)
      if (d > far) return '너무 멀다'
      if (d < sp.reach[0]) return '너무 가깝다'
    }
    return null
  }

  /**
   * Use one.
   *
   * The effects are the client's own numbers and the handling is per effect
   * rather than per ability, so the day `spells.py` reaches level ten nothing
   * here needs a new branch for a second bleed.
   */
  /**
   * The global cooldown: what pressing anything makes you wait before
   * pressing anything else.
   *
   * It is a **column**, not the constant second and a half it is always
   * described as — `Spell::TriggerGlobalCooldown` (Spell.cpp:8971) reads
   * `StartRecoveryTime` off the spell and clamps it to between one second and
   * one and a half.  A spell with nought there starts none at all, which is
   * how a heavier blow and a run-up can follow anything: they go off the next
   * swing rather than instead of it.
   *
   * Without this you could press everything rage would pay for in the same
   * instant, and the tick length in the wiki's own simulation design is
   * derived from a number that was not in the code.
   */
  const GCD_MIN = 1000, GCD_MAX = 1500
  const gcdOf = (sp: Spell) =>
    sp.gcd ? Math.min(GCD_MAX, Math.max(GCD_MIN, sp.gcd)) : 0
  const cast = (sp: Spell) => {
    // What it was asked for, set before the refusal: a check presses the key
    // drawn on a square and asks which ability heard it, and whether there
    // was rage for it is a different question.
    asked = sp.id
    if (why(sp) !== null) return
    you.rage -= sp.rage
    if (sp.gcd) you.gcd = clock + gcdOf(sp) / 1000
    play('cast', 0.95 + roll() * 0.1)
    if (sp.cool) you.cools[sp.id] = clock + sp.cool / 1000
    const t = you.target
    // What pressing it buys in attention, out of `spell_threat`.  A heavier
    // blow is worth five over the damage it does; a thunderclap is worth
    // nearly twice its damage.  That is the rule that makes an opener an
    // opener rather than an expensive auto-attack.
    if (t && sp.threat) {
      t.threat['you'] = (t.threat['you'] ?? 0)
        + threatFrom(0, sp.threat, attackPower(you.level, statsAt(you.level)))
    }
    for (const [slot, [effect, amount, die, aura, period]] of sp.does.entries()) {
      if (effect === E_DAMAGE) {
        // Everything inside the radius, or just the target if there is none.
        // `SpellRadius.dbc` says eight yards for a thunderclap and thirty for
        // a shout; a radius of nought is a spell that hits what you picked.
        const wide = sp.wide?.[slot] ?? 0
        const hit = between(amount!, amount! + (die ?? 0))
        const at = wide > 0
          ? active.filter((n) => !n.dead && fightable(n.fight)
            && (n.x - hero.x) ** 2 + (n.y - hero.y) ** 2 <= wide * wide)
          : (t ? [t] : [])
        for (const n of at) {
          const dealt = Math.max(1, Math.round(
            hit * (1 - mitigate(n.fight![ARMOUR]!, you.level))))
          n.hp -= dealt
          n.hurt = clock
          n.angry = true
          n.threat['you'] = (n.threat['you'] ?? 0)
            + threatFrom(dealt, sp.threat,
              attackPower(you.level, statsAt(you.level)))
          say(n.x, n.y, `${dealt}`, true)
          if (n.hp <= 0) {
            n.hp = 0; n.dead = clock; you.kills += 1
            if (you.target === n) you.target = null
            reward(n)
          }
        }
        if (at.length > 1) ui.log(`${at.length}을(를) 한꺼번에 쳤다.`, 'hit')
      } else if (effect === E_WEAPON_ADD) you.extra += amount!
      else if (effect === E_ENERGIZE) you.rage = Math.min(MAX_RAGE, you.rage + amount! / 10)
      else if (effect === E_AURA && aura === A_ATTACK_POWER) {
        you.shout = { until: clock + sp.holds / 1000, ap: amount! }
      } else if (effect === E_AURA && aura === A_PERIODIC_DAMAGE && t) {
        t.bleed = { until: clock + sp.holds / 1000, next: clock + period! / 1000, each: amount! }
        t.angry = true
      }
    }
    // A run-up is a run-up: the thing it does that no effect number says is
    // put you next to what you were looking at.
    if (sp.reach[0] > 0 && t) {
      const d = Math.hypot(t.x - hero.x, t.y - hero.y) || 1
      placeHero(t.x - ((t.x - hero.x) / d) * (MELEE * 0.7),
        t.y - ((t.y - hero.y) / d) * (MELEE * 0.7))
      t.angry = true
    }
    ui.log(`${abilityOf(sp.id)![0]}`, 'hit')
  }

  /** Put what you are in the middle of on the screen. */
  function showErrands() {
    ui.setErrands(log.held.map((h) => {
      const q = log.all.get(h.id)!
      const lines: [string, boolean][] = []
      q.kill.forEach(([who, want], i) => {
        const got = h.kill[i] ?? 0
        lines.push([`${nameOf(kindOfEntry(who))} ${tally(got, want)}`, got >= want])
      })
      q.fetch.forEach(([, want, word], i) => {
        const got = h.fetch[i] ?? 0
        lines.push([`${goodsOf(word)} ${tally(got, want)}`, got >= want])
      })
      if (!lines.length) lines.push(['전하는 말을 가져가기', false])
      return { lines, done: errandDone(log, h) }
    }))
  }

  /**
   * What kind of thing a creature entry is, for saying what a quest asks for.
   *
   * The quest names an entry and the words are keyed on our kind, so the two
   * are joined here — through the spawns, which carry both.  Anything not
   * standing in the slice has no kind and no word, and no quest that names it
   * survived the bake.
   */
  const kindByEntry = new Map<number, string>()
  for (const n of npcs) if (!kindByEntry.has(n.entry)) kindByEntry.set(n.entry, n.kind)
  const kindOfEntry = (e: number) => kindByEntry.get(e) ?? 'townsfolk'
  /** One errand as `talk.ts` wants it: our words, not the database's ids. */
  const shapeOf = (q: Errand) => ({
    kill: q.kill.map(([who, n]) => [kindOfEntry(who), n] as [string, number]),
    fetch: q.fetch.map(([, n, word]) => [word, n] as [string, number]),
  })

  /**
   * What a kill was worth, and what it bought.
   *
   * The ladder is `player_xp_for_level` and the gain is the server's own
   * `BaseGain`, so the pace is the game's pace: a level 5 kill is 70 and the
   * step to 6 is 2,800, which is forty of them.  That is slow, and it is
   * slow in the original for the same arithmetic.
   */
  const reward = (foe: Npc): number => {
    // `creature_template.ExperienceModifier`, which is one for everything in
    // this forest and is read anyway: a number that is always one until the
    // day it is not is exactly the sort that gets left out.
    const gain = Math.round(
      xpFor(you.level, foe.level, foe.role === 'elite') * foe.worth)
    // Rested doubles a kill and never more than doubles it, and every point
    // spent comes out of the pool — `Player::GetXPRestBonus`.
    const bonus = Math.min(Math.floor(you.rest), gain)
    you.rest -= bonus
    you.xp += gain + bonus
    // And whatever anybody asked you to do about it.  The entry and not the
    // kind: all three of Northshire's kobolds are `kobold` and the chain wants
    // eight of each in turn.
    for (const what of killed(log, foe.entry, roll)) {
      const [sort, id, at] = what.split(':')
      const q = log.all.get(Number(id))
      const h = holding(log, Number(id))
      if (!q || !h) continue
      const i = Number(at)
      const [got, want] = sort === 'kill'
        ? [h.kill[i]!, q.kill[i]![1]]
        : [h.fetch[i]!, q.fetch[i]![1]]
      const name = sort === 'kill'
        ? nameOf(kindOfEntry(q.kill[i]![0]))
        : goodsOf(q.fetch[i]![2])
      ui.log(`${name} ${tally(got, want)}`, 'note')
      if (errandDone(log, h)) ui.log('마치고 돌아가기', 'gain')
      showErrands()
    }
    levelUp()
    return gain
  }
  /** Spend the experience bar as many times as it will go. */
  function levelUp() {
    const ceiling = who?.levels?.[1] ?? (spawns.player?.length ?? 1)
    while (LADDER[you.level - 1] && you.xp >= LADDER[you.level - 1]!
      && you.level < ceiling) {
      you.xp -= LADDER[you.level - 1]!
      you.level += 1
      you.line = lineFor(you.level)
      you.max = you.line[HP]!
      you.hp = you.max
      play('level')
      // The end of the slice.  Level ten is where this game stops, and a
      // number that stops nothing is a number nobody notices arriving — so it
      // says what the run was.  What comes after it is talents, and talents
      // are the next slice's first item.
      if (you.level >= ceiling && !you.finished) {
        you.finished = clock
        ui.log('노스샤이어에서 할 일은 여기까지다.', 'gain')
      }
      // And whatever the new level opened.  The list is a function of the
      // level now; before this it was decided once at load and never again.
      const had = spells.length
      spells = known(you.level)
      say(hero.x, hero.y, `${you.level}레벨`, true)
      // The bar is built from `spells` every frame, so there is nothing to
      // rebuild — only something to say.  And what opened is not a new button
      // but a new *thing a trainer will sell you*, which is the shape this
      // stretch of the game actually has.
      const offer = (spellbook.spells ?? []).filter(
        (sp) => sp.level === you.level && !sp.free && abilityOf(sp.id))
      if (spells.length > had)
        ui.log(`배울 수 있는 것이 생겼다. (${spells.length - had}가지)`, 'gain')
      else if (offer.length)
        ui.log(`훈련사가 가르칠 것이 생겼다. (${offer.length}가지)`, 'note')
    }
  }
  /**
   * The nearest graveyard that takes this zone's dead.
   *
   * The zone's own list first, because that is the rule the server uses; if
   * the zone has none — the slice reaches corners of four of them — the
   * nearest on the map, and failing everything, where you started.
   */
  const graveyardFor = (x: number, y: number): [number, number] => {
    const all = who?.graveyards ?? {}
    const here = areaOf(x, y)
    const mine = all[String(here)] ?? all[String(inside(here))] ?? []
    const pool = mine.length ? mine : Object.values(all).flat()
    let best: number[] | null = null, bd = Infinity
    for (const g of pool) {
      const d = (g[0]! - x) ** 2 + (g[1]! - y) ** 2
      if (d < bd) { bd = d; best = g }
    }
    return best ? [best[0]!, best[1]!] : [START[0], START[1]]
  }

  /** A number that floats off somebody and fades. */
  type Mark = { x: number; y: number; text: string; at: number; mine: boolean }
  const marks: Mark[] = []
  const say = (x: number, y: number, text: string, mine: boolean) => {
    marks.push({ x, y, text, at: clock, mine })
    if (marks.length > 40) marks.shift()
  }

  /**
   * Everything that happens because two things are swinging at each other.
   *
   * Run over the awake list only, which is the couple of hundred within 260
   * yards: a wolf on the far side of the forest is not in a fight with
   * anybody, and asking 1,884 of them three times a second whether they are
   * would cost more than the fight does.
   */
  /**
   * What was taken comes back, somewhere in the same slot.
   *
   * `gameobject.spawntimesecs` is the world database's own figure and it is
   * not a round number — a copper vein is back in a few minutes, a chest in
   * rather longer.  Where it comes back is the pool's business: pull one of
   * the nine standing copper veins and the tenth spot is as likely as the one
   * you emptied, which is why the forest is not a shop with a fixed shelf.
   */
  /**
   * Who comes with whom.
   *
   * `creature_formations` is 6,021 rows and eleven packs of it stand in this
   * slice, the biggest eight strong.  It was not read, so everything came at
   * you one at a time — and pulling, which is the only decision this game's
   * combat has, is not a decision when the world hands them over singly.
   *
   * Built once: a leader's followers, by the world's own guid.
   */
  const pack = new Map<number, Npc[]>()
  for (const n of npcs) {
    if (!n.leader) continue
    const got = pack.get(n.leader)
    if (got) got.push(n)
    else pack.set(n.leader, [n])
  }
  const byGuid = new Map<number, Npc>()
  for (const n of npcs) if (n.guid) byGuid.set(n.guid, n)
  /** Wake everybody who walks with this one. */
  const rouse = (n: Npc) => {
    const head = n.leader ? byGuid.get(n.leader) : n
    for (const m of [head, ...(head ? pack.get(head.guid) ?? [] : [])]) {
      if (!m || m.dead || m === n) continue
      if (Math.hypot(m.x - n.x, m.y - n.y) > 40) continue
      m.angry = true
    }
  }

  /** A wound of somebody else's, ticking on the player. */
  let youBleed: { until: number; next: number; each: number } | null = null
  /** A clock the render check can hold still — see `__clock`. */
  let frozen: Date | null = null
  /** And a sky, for the same reason — see `__weather`. */
  let forcedSky: number | null = null

  /**
   * Rest, which is what makes it matter where you close the tab.
   *
   * `Player::LoadFromDB` (PlayerStorage.cpp:5523): rest accrues offline at
   * `seconds × (nextLevelXP / 144000) × bubble`, where the bubble is 0.125 in
   * an inn and 0.031 anywhere else — four times faster indoors, which is the
   * whole of the rule.  The cap is `SetRestBonus`: three quarters of a level.
   * Spending it is `GetXPRestBonus` (Player.cpp:9089): every kill is worth
   * double until the pool runs out, never more.
   *
   * In a browser, closing the tab *is* logging out, so this is the one rule
   * from that game that fits this medium better than it fit the original.
   */
  const REST_IN_INN = 0.125, REST_OUTSIDE = 0.031
  /** Which buildings hold somebody who rents beds. */
  const inns = new Set<unknown>()
  for (const n of npcs) {
    if (n.role !== 'innkeeper') continue
    const b = inRoom(n.x, n.y)
    if (b) inns.add(b)
  }
  const resting = () => {
    const b = inRoom(hero.x, hero.y)
    return !!b && inns.has(b)
  }
  // `SetRestBonus` (Player.cpp:10374) refuses to bank anything at the ceiling,
  // which is the server saying the same thing this game says at ten: there is
  // nothing left here to be rested for.
  const restCap = () =>
    you.level >= (who?.levels?.[1] ?? 10) ? 0 : (LADDER[you.level - 1] ?? 0) * 0.75
  const restFor = (seconds: number, inInn: boolean) =>
    seconds * ((LADDER[you.level - 1] ?? 0) / 144000)
    * (inInn ? REST_IN_INN : REST_OUTSIDE)

  function restocking() {
    for (const n of nodes) {
      if (n.up || !n.due || clock < n.due) continue
      n.due = 0
      restock(n)
    }
  }

  function fighting() {
    if (you.died) {
      // Dead is dead for a moment, and then you wake up at a graveyard.
      //
      // Not where you started and not where you fell.  `game_graveyard` and
      // `graveyard_zone` say where each zone sends you — Elwynn has four, one
      // beside the abbey and one in Goldshire — and the walk back from it is
      // the whole cost of dying at these levels.  That is not a simplification:
      // `Player::ResurrectPlayer` (Player.cpp:4605) says in its own comment
      // that characters from level 1 to 10 are not affected by resurrection
      // sickness, so charging anything else here would be inventing a rule.
      //
      // Before this you stood up four seconds later on the spot with full
      // health, which meant there was never a reason to run away — and half of
      // "should I pull this" is the other half of that decision.
      if (clock - you.died > 4) {
        const [gx, gy] = graveyardFor(hero.x, hero.y)
        you.died = 0; you.target = null
        you.hp = Math.max(1, Math.round(you.max / 2))
        you.rage = 0
        placeHero(gx, gy)
        camX = gx; camY = gy
        ui.log('묘지에서 깨어났다.', 'note')
      }
      return
    }
    const reach2 = MELEE * MELEE
    // Out of a fight, you come back.  Without it one bad pull ends the
    // session, and the game this is modelled on sits you down to eat for the
    // same reason.  Five per cent a second after three seconds of quiet.
    let quiet = you.target === null
    // The target has to still be there, still be alive, and still be close.
    const t = you.target
    if (t && (t.dead || (t.x - hero.x) ** 2 + (t.y - hero.y) ** 2 > reach2 * 9))
      you.target = null

    for (const n of active) {
      if (!n.fight) continue
      // A cut that keeps cutting, on its own clock rather than on the swing's.
      if (n.bleed && !n.dead) {
        if (clock > n.bleed.until) n.bleed = null
        else if (clock >= n.bleed.next) {
          n.bleed.next += 3
          n.hp -= n.bleed.each
          n.hurt = clock
          say(n.x, n.y, `${n.bleed.each}`, true)
          if (n.hp <= 0) { n.hp = 0; n.dead = clock; n.bleed = null; you.kills += 1
            ui.log(`${josa(nameOf(n.kind), '은', '는')} 피를 흘리며 쓰러졌다.`, 'gain')
            reward(n)
            if (you.target === n) you.target = null }
        }
      }
      if (n.dead) {
        // Back on its feet after a while, where it stood.
        if (clock - n.dead > n.back) {
          n.dead = 0; n.hp = n.max; n.angry = false; n.alpha = 1
          n.looted = false
          n.x = n.hx; n.y = n.hy
        }
        continue
      }
      const d2 = (n.x - hero.x) ** 2 + (n.y - hero.y) ** 2
      // A hostile notices you from a distance that depends on the gap between
      // you, which is why nothing in the starting field chases a grown player.
      // Only the ones that start fights: a neutral creature is attackable
      // and will fight back, but it does not come at you across a field.
      if (!n.angry && aggressive(n.fight) && !chat) {
        const far = noticeAt(you.level, n.level, n.notice)
        if (d2 < far * far) { n.angry = true; rouse(n) }
      }
      // And gives up.  Without this the forest arrives one at a time and never
      // leaves: `angry` is set by walking past and nothing ever cleared it, so
      // a walk across Elwynn ended with forty things in a queue behind you.
      if (n.angry && (d2 > LEASH * LEASH
        || (n.x - n.hx) ** 2 + (n.y - n.hy) ** 2 > LEASH * LEASH)) {
        n.angry = false
        if (you.target === n) you.target = null
      }
      if (n.angry) quiet = false
      if (!n.angry) continue
      // Angry ones walk at you; `wander` is told to leave them alone.
      if (d2 > reach2) continue
      if (clock * 1000 < n.next) continue
      n.next = clock * 1000 + n.fight[SWING]!
      // What it can do besides swing.  `creature_template_spell` is 9,556 rows
      // and the pipeline read none of them, so every fight in the forest was
      // the same fight: 38 of the slice's kinds carry an ability and a kobold
      // geomancer's bolt is the difference between a wolf and a caster.
      // What it can do, and — where `smart_scripts` says so — *when*.
      //
      // 52,768 rows of which 376 touch this slice and 71 are "cast this".
      // Three triggers are carried and they are the three that make one fight
      // different from another: the moment it turns on you, every so often
      // while fighting, and when it drops below a share of its health.  A
      // creature with no cue for an ability simply uses it when it is ready,
      // which is what it did before any of this.
      const cues = spellbook.cues?.[String(n.entry)] ?? []
      const cued = (sp: Spell) => {
        const rows = cues.filter((c) => c[0] === sp.id)
        if (!rows.length) return true
        return rows.some(([, trigger, p1, p2, chance]) => {
          if (roll() * 100 >= (chance ?? 100)) return false
          if (trigger === 4) return clock - n.hurt < 2      // just turned on you
          if (trigger === 2) {                             // hurt to a share
            const share = (n.hp / n.max) * 100
            return share >= (p1 ?? 0) && share <= (p2 ?? 100)
          }
          return true                                      // every so often
        })
      }
      const trick = (spellbook.foes?.[String(n.entry)] ?? [])
        .find((sp) => (n.cools[sp.id] ?? 0) <= clock && cued(sp)
          && sp.does.some((d) => d[0] === E_DAMAGE
            || (d[0] === E_AURA && d[3] === A_PERIODIC_DAMAGE)))
      if (trick) {
        n.cools[trick.id] = clock + Math.max(4, trick.cool / 1000)
        for (const [effect, amount, die, aura, period] of trick.does) {
          if (effect === E_DAMAGE) {
            const bolt = Math.max(1, Math.round(
              between(amount!, amount! + (die ?? 0))
              * (1 - mitigate(you.line[ARMOUR]!, n.level))))
            you.hp -= bolt
            say(hero.x, hero.y, `-${bolt}`, false)
            ui.log(`${nameOf(n.kind)}의 주문에 ${bolt} 맞았다.`, 'hurt')
          } else if (effect === E_AURA && aura === A_PERIODIC_DAMAGE) {
            youBleed = { until: clock + trick.holds / 1000,
              next: clock + (period ?? 3000) / 1000, each: amount! }
            ui.log(`${nameOf(n.kind)}에게 물렸다.`, 'hurt')
          }
        }
        if (you.hp <= 0) {
          you.hp = 0; you.died = clock; you.target = null; you.calm = 0
          ui.log('쓰러졌다.', 'note')
        }
        continue
      }
      // What happens when it swings, by the server's own table: one roll, and
      // miss, dodge, parry, block, crushing and critical laid end to end.  A
      // creature attacking a player is checked against *his* dodge and parry,
      // which come out of agility and out of holding a weapon.
      const mine = statsAt(you.level)
      const fate = rollMelee(
        { level: n.level, crit: CREATURE_CRIT },
        { level: you.level, dodge: dodgeChance(you.level, mine, who!),
          parry: PARRY_WITH_WEAPON, block: 0, player: true },
        roll() * 10000)
      const raw = swing(n.fight, n.level, you.line[ARMOUR]!, roll())
      const hit = damageAfter(fate, raw, n.level - you.level)
      you.hp -= hit
      // Taking a blow pays too, at a third of what landing one does.
      you.rage = Math.min(MAX_RAGE,
        you.rage + rageFrom(hit, you.level, you.line[SWING]! / 1000, false))
      play(hit > 0 ? 'hurt' : 'miss', 0.9 + roll() * 0.2)
      say(hero.x, hero.y, fate === HIT ? `-${hit}` : (OUTCOME_WORD[fate] ?? ''), false)
      ui.log(fate === HIT || fate === CRIT
        ? `${nameOf(n.kind)}에게 ${hit} 맞았다.${fate === CRIT ? ' (치명타)' : ''}`
        : `${nameOf(n.kind)}의 공격을 ${OUTCOME_WORD[fate]}`, fate === MISS || hit === 0 ? 'note' : 'hurt')
      if (you.hp <= 0) {
        you.hp = 0; you.died = clock; you.target = null; you.calm = 0
        play('die')
        ui.log('쓰러졌다.', 'note')
      }
    }

    // Somebody else's wound, ticking.
    if (youBleed) {
      if (clock > youBleed.until) youBleed = null
      else if (clock >= youBleed.next) {
        youBleed.next = clock + 3
        you.hp -= youBleed.each
        say(hero.x, hero.y, `-${youBleed.each}`, false)
        if (you.hp <= 0) {
          you.hp = 0; you.died = clock; you.target = null; you.calm = 0
          ui.log('쓰러졌다.', 'note')
        }
      }
    }
    if (you.shout && you.shout.until <= clock) you.shout = null
    if (quiet) {
      // Rage drains when nobody is swinging, which is what stops you walking
      // into a fight with a full bar you filled somewhere else.
      you.rage = Math.max(0, you.rage - 2.5 / 60)
      you.calm += 1 / 60
      if (you.calm > 3) you.hp = Math.min(you.max, you.hp + you.max * 0.05 / 60)
    } else {
      you.calm = 0
    }

    // Your own swing, which only happens at something you picked.
    const foe = you.target
    if (!foe || foe.dead || !foe.fight) return
    if ((foe.x - hero.x) ** 2 + (foe.y - hero.y) ** 2 > reach2) return
    if (clock * 1000 < you.next) return
    you.next = clock * 1000 + you.line[SWING]!
    // The shout, while it holds: attack power spread over the swing, which is
    // the same line the weapon's own damage came out of.
    const secs = you.line[SWING]! / 1000
    const shout = (you.shout && you.shout.until > clock)
      ? (you.shout.ap / 14) * secs : 0
    // And your own, through the same table.  A creature dodges and blocks five
    // per cent of the time and parries another five if it is a humanoid — a
    // wolf does not parry, a kobold does — so the starting valley is not one
    // fight repeated at two speeds.
    const mine = statsAt(you.level)
    const fate = rollMelee(
      { level: you.level, crit: critChance(you.level, mine, who!), humanoid: true },
      { level: foe.level, dodge: CREATURE_DODGE, block: CREATURE_BLOCK,
        parry: parries(foe.kind) ? CREATURE_PARRY_HUMANOID : 0 },
      roll() * 10000)
    const raw = Math.round(
      swing(you.line, foe.level, foe.fight[ARMOUR]!, roll())
      + shout + you.extra)
    const hit = damageAfter(fate, raw, foe.level - you.level)
    you.extra = 0
    you.rage = Math.min(MAX_RAGE, you.rage + rageFrom(hit, you.level, secs, true))
    // Attention, before the damage, because a blow that is blocked to nothing
    // still annoys whatever you hit.
    foe.threat['you'] = (foe.threat['you'] ?? 0)
      + threatFrom(hit, undefined, attackPower(you.level, mine))
    foe.hp -= hit
    foe.hurt = clock
    if (hit > 0) { foe.angry = true; rouse(foe) }
    play(fate === CRIT ? 'crit' : hit > 0 ? 'hit' : 'miss', 0.92 + roll() * 0.16)
    say(foe.x, foe.y, fate === HIT ? `${hit}` : (OUTCOME_WORD[fate] ?? `${hit}`), true)
    ui.log(fate === HIT || fate === CRIT || fate === GLANCING
      ? `${josa(nameOf(foe.kind), '을', '를')} ${hit} 때렸다.`
        + (fate === CRIT ? ' (치명타)' : fate === GLANCING ? ' (빗맞음)' : '')
      : `${josa(nameOf(foe.kind), '이', '가')} ${OUTCOME_WORD[fate]}`,
      hit > 0 ? 'hit' : 'note')
    if (foe.hp <= 0) {
      foe.hp = 0
      foe.dead = clock
      you.target = null
      you.kills += 1
      const was = you.level
      // The gain comes back from `reward` rather than being worked out twice:
      // the same formula in two places is two formulas.
      const worth = reward(foe)
      ui.log(`${josa(nameOf(foe.kind), '을', '를')} 처치했다.  경험치 ${worth}`, 'gain')
      if (you.level > was) ui.log(`${you.level}레벨이 되었다.`, 'gain')
    }
  }

  const GOODS = spawns.goods ?? []

  /**
   * Going through a body's pockets.
   *
   * Rolled when it is opened rather than when it died, which is the same thing
   * to a player and one fewer list to keep: nothing is carrying loot until
   * somebody looks.
   */
  const loot = (n: Npc): string => {
    n.looted = true
    if (!n.haul) return '아무것도 없다'
    const [lo, hi, items] = n.haul
    const got: string[] = []
    const copper = between(lo, hi)
    if (copper > 0) { you.purse += copper; got.push(coin(copper)) }
    for (const row of items) {
      const [idx, chance, clo, chi, sell, , need] = row as number[]
      // What `conditions` says has to be true first.  A quest item that falls
      // without the quest is the table's own first example of what goes wrong
      // when nobody reads it — and it looks like generosity, not like a bug.
      if (need && !log.held.some((h) => h.id === need)) continue
      if (roll() * 100 >= chance!) continue
      const word = GOODS[idx!] ?? 'oddment'
      const many = between(clo!, chi!)
      // The price travels with the thing.  A bag that held only counts could
      // not be sold: `weapon` is worth what that creature's weapon was worth,
      // and the word on its own says nothing about that.
      const had = you.bag[word] ?? [0, 0]
      you.bag[word] = [had[0] + many, had[1] + many * (sell ?? 0)]
      got.push(`${goodsOf(word)} ${many}`)
    }
    return got.length ? got.join(', ') : '아무것도 없다'
  }

  /**
   * The nearest thing you could open or gather, or nothing.
   *
   * Reach is the same as a conversation's, because it is the same gesture:
   * one key for "deal with the thing in front of me".
   */
  const atHand = (): Node | null => {
    let best: Node | null = null, bd = EARSHOT * EARSHOT
    for (const n of nodes) {
      if (!n.up || !n.haul.length) continue
      const d = (n.x - hero.x) ** 2 + (n.y - hero.y) ** 2
      if (d < bd) { bd = d; best = n }
    }
    return best
  }

  /**
   * Take what is in it, if you can.
   *
   * What "can" means is `Lock.dbc`'s: a lock with nothing in it opens to
   * anybody, and one asking for a trade asks for a number.  Picking one up
   * teaches you a point of that trade, which is what turns 130 copper veins
   * from scenery into the reason to walk about — earthroot wants fifteen and
   * you get there by pulling fifteen peacebloom.
   */
  const gather = (n: Node): string => {
    if (n.trade && (you.trades[n.trade] ?? 0) < n.skill)
      return `${TRADE_WORD[n.trade] ?? n.trade} ${n.skill} 필요`
    n.up = false
    n.due = clock + Math.max(5, n.back)
    const got: string[] = []
    for (const row of n.haul) {
      const [word, chance, lo, hi, sell] = row as [string, number, number, number, number]
      if (roll() * 100 >= chance) continue
      const many = between(lo, hi)
      const had = you.bag[word] ?? [0, 0]
      you.bag[word] = [had[0] + many, had[1] + many * (sell ?? 0)]
      got.push(`${goodsOf(word)} ${many}`)
    }
    if (n.trade) {
      you.trades[n.trade] = (you.trades[n.trade] ?? 0) + 1
      got.push(`${TRADE_WORD[n.trade] ?? n.trade} ${you.trades[n.trade]}`)
    }
    if (got.length) play('loot')
    return got.length ? got.join(', ') : '아무것도 없다'
  }

  /** The nearest body nobody has been through yet. */
  const corpse = (): Npc | null => {
    let best: Npc | null = null, bd = EARSHOT * EARSHOT
    for (const n of active) {
      if (!n.dead || n.looted) continue
      const d = (n.x - hero.x) ** 2 + (n.y - hero.y) ** 2
      if (d < bd) { bd = d; best = n }
    }
    return best
  }

  /**
   * The nearest thing worth swinging at, or nothing.
   *
   * Hostiles only.  One key that means "hit whatever is closest" and a village
   * square full of people is a key that kills you: the first thing it found
   * outside the abbey was a townsman, who is level 26 with four hundred health
   * and hits back.  Attacking somebody who was not going to attack you should
   * take more than a keystroke.
   */
  const inSwing = (): Npc | null => {
    let best: Npc | null = null, bd = MELEE * MELEE
    for (const n of active) {
      if (!fightable(n.fight) || n.dead) continue
      const d = (n.x - hero.x) ** 2 + (n.y - hero.y) ** 2
      if (d < bd) { bd = d; best = n }
    }
    return best
  }

  const SPEED = 7.0          // yards a second, which is WoW's run speed

  const keys = new Set<string>()
  // A browser will not start an audio context without a gesture, so every
  // plausible gesture asks for one.  The second ask is a no-op.
  for (const when of ['keydown', 'pointerdown', 'touchstart'] as const)
    addEventListener(when, () => wake(), { passive: true })
  /**
   * What each key on the bar does, filled from the bar itself every frame.
   *
   * The keyboard used to hold its own copy of the mapping, and a copy of a
   * table is a table that drifts: this one was one square out from the day a
   * second row of abilities became possible.
   */
  const pressable = new Map<string, () => void>()
  /** The bar as it was last built, for the check that reads it. */
  let squares: Slot[] = []
  /** The last ability any key or square asked `cast` for. */
  let asked: number | null = null

  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase()
    keys.add(k)
    // One key, and it means "the nearest thing I can reach".  A click would
    // want a cursor and this game is played with a thumb as often as a mouse.
    if (k === ' ' || k === 'spacebar') {
      e.preventDefault()
      if (!chat && !you.died) you.target = you.target ?? inSwing()
    }
    // The readout is a developer's and it starts out of the way.
    if (k === '`' || k === '~') hud.hidden = !hud.hidden
    // The bar, out of the bar's own table.  Everything each square guards for
    // itself — a spell checks `!chat`, attack checks `!chat && !you.died` —
    // so pressing a key and clicking a square are the same act.  Not while a
    // conversation is open and taking the number keys for its answers, which
    // is what the branch at the bottom of this handler is for.
    const act = !(chat && k >= '1' && k <= '9') ? pressable.get(k) : undefined
    if (act) { e.preventDefault(); act() }
    if (k === 'b') { e.preventDefault(); bagOpen = !bagOpen }
    // Off and on.  Everything a sound says is also on screen — that is a rule
    // with a check behind it — so this costs nothing but the noise.
    if (k === 'n') {
      e.preventDefault()
      mute(!muteIsOn())
      ui.log(muteIsOn() ? '소리를 껐다.' : '소리를 켰다.', 'note')
    }
    // Put on the best of what is in the bag.  One key, because everything you
    // own that fits an empty slot is better than the nothing in it.
    if (k === 'g') {
      e.preventDefault()
      if (!chat) for (const line of dressUp()) ui.log(line, 'gain')
    }
    if (k === 'c') { e.preventDefault(); sheetOpen = !sheetOpen }
    if (k === 'm') {
      e.preventDefault()
      mapOpen = !mapOpen
      // Drawn the first time it is asked for, because three hundred thousand
      // samples at load is a fifth of a second nobody asked to wait.
      if (mapOpen && !mapDrawn) { paintWorld(); mapDrawn = true }
    }
    if (k === 'escape' && mapOpen) mapOpen = false
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k))
      e.preventDefault()
    if (k === 'escape') endTalk()
    else if (chat && k >= '1' && k <= '9') {
      const i = Number(k) - 1
      if (i < chat.speech.options.length) choose(i)
    }
  })
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()))

  // --- the phone ---------------------------------------------------------

  /**
   * One action, because the game has one verb.
   *
   * The cluster is shaped for five and the bar is a list, so a skill is an
   * entry here and a case in the loop below.  An empty slot is not drawn: a
   * row of dead buttons tells a player the game is broken rather than early.
   */
  const ACTIONS = ['attack', 'talk'] as const
  const pad = touchpad(canvas, ACTIONS.length)
  // The original's own frame places, read out of its `FrameXML` by
  // `pipeline/layout.py`.  Missing is fine: without it the stylesheet's
  // positions stand, which is what there was before there was a source.
  // The errands, out of AzerothCore and the client's `QuestXP.dbc` by way of
  // `pipeline/quests.py`.  Missing is fine: without it nobody asks for
  // anything, which is where this was before.
  const errands = await fetch('./world/quests.json')
    .then((r) => (r.ok ? r.json() as Promise<{ quests: Errand[] }> : null))
    .catch(() => null)
  const log = book(errands?.quests ?? [])

  /**
   * The character, written down, and put back when the tab opens again.
   *
   * Only what cannot be worked out again: level, experience, where he is
   * standing, what is in the bag, how far along each errand is, and **where
   * the stream of chance has got to**.  Maximum health is not saved because it
   * is stamina, and stamina is the level.
   *
   * The world's own hash travels with it.  A save made against a different
   * bake may hold item ids that now mean something else, and the honest thing
   * is to say so rather than to load it and see.
   */
  const worldHash = await fetch('./manifest.json')
    .then((r) => (r.ok ? r.json() as Promise<{ files?: Record<string, string> }> : null))
    .then((m) => m?.files?.['public/world/npcs.json'] ?? '')
    .catch(() => '')
  const snapshot = (): Save => ({
    version: SAVE_VERSION, world: worldHash, at: Date.now(),
    hero: { x: hero.x, y: hero.y, dir: hero.dir },
    you: {
      level: you.level, xp: you.xp, hp: you.hp, rage: you.rage,
      purse: you.purse, kills: you.kills,
      bag: you.bag, trades: you.trades, cools: you.cools,
      items: held, gear, taught,
      rest: you.rest, restedIn: resting() ? 1 : 0,
      finished: you.finished, born: you.born,
    },
    seed: seed(),
    quests: {
      held: log.held, done: [...log.done],
    },
  })
  const restore = (save: Save) => {
    placeHero(save.hero.x, save.hero.y); hero.dir = save.hero.dir
    camX = hero.x; camY = hero.y
    you.level = Math.max(1, save.you.level)
    you.line = lineFor(you.level)
    you.max = you.line[HP]!
    you.hp = Math.min(you.max, save.you.hp || you.max)
    you.xp = save.you.xp; you.rage = save.you.rage
    you.purse = save.you.purse; you.kills = save.you.kills
    you.bag = save.you.bag ?? {}
    you.trades = save.you.trades ?? you.trades
    you.cools = save.you.cools ?? {}
    held = save.you.items ?? []
    gear = save.you.gear ?? {}
    taught = save.you.taught ?? []
    you.rest = save.you.rest ?? 0
    you.finished = save.you.finished ?? 0
    you.born = save.you.born ?? Date.now()
    // Everything downstream of what is worn, worked out again rather than
    // stored: maximum health is stamina and stamina is the level plus a
    // breastplate.
    you.line = lineFor(you.level)
    you.max = you.line[HP]!
    you.hp = Math.min(you.max, save.you.hp || you.max)
    spells = known(you.level)
    reseed(save.seed >>> 0)
    const q = save.quests as { held?: Held[]; done?: number[] } | undefined
    log.held = q?.held ?? []
    log.done = new Set(q?.done ?? [])
  }

  const layout = await fetch('./world/layout.json')
    .then((r) => (r.ok ? r.json() as Promise<Layout> : null))
    .catch(() => null)
  const ui = makeHud(layout ?? undefined)
  let bagOpen = false
  let sheetOpen = false
  let mapOpen = false
  let mapDrawn = false

  /**
   * The minimap, painted rather than drawn.
   *
   * The same three questions the ground loop asks — is it wet, what did the
   * client paint here, how steep is it — at one sample every other pixel and
   * a hundred and twenty yards across.  Four times a second, because a map
   * that updates with the frame is a map costing 22,500 lookups sixty times a
   * second to show you something that moves at seven yards an hour on it.
   */
  /**
   * The whole zone, drawn once.
   *
   * One pixel a terrain cell — 474 by 667, which is 4.17 yards a pixel and the
   * finest the height grid can answer.  Three hundred thousand samples is a
   * fifth of a second, so it happens the first time somebody opens the map and
   * never again: what it shows does not change.
   */
  function paintWorld() {
    // North up and west left, which is the same map the screen is.  `i` walks
    // south and `j` walks east, so `i` is the row and `j` is the column — the
    // picture is `H` across and `W` down, and getting that the other way round
    // draws the same forest on its side.
    const cv = ui.world
    cv.width = H; cv.height = W
    const g = cv.getContext('2d')!
    const img = g.createImageData(H, W)
    const px = img.data
    for (let i = 0; i < W; i++) {
      for (let j = 0; j < H; j++) {
        const wx = x0 - i * U, wy = y0 - j * U
        const hex = wetAt(wx, wy) ? '#2d5f86'
          : stepAt(wx, wy) > CLIFF ? INK['rock']!
            : INK[paintAt(wx, wy)] ?? INK['grass']!
        const o = (i * H + j) * 4
        px[o] = parseInt(hex.slice(1, 3), 16)
        px[o + 1] = parseInt(hex.slice(3, 5), 16)
        px[o + 2] = parseInt(hex.slice(5, 7), 16)
        px[o + 3] = 255
      }
    }
    g.putImageData(img, 0, 0)
  }

  /** Where the hero is on that picture, in its own pixels. */
  const onWorld = (): [number, number] =>
    [(y0 - hero.y) / U, (x0 - hero.x) / U]

  const MAP_YARDS = 120
  const mapCtx = ui.map.getContext('2d')!
  let mapAt = 0
  const INK: Record<string, string> = {
    grass: '#3f7a3a', bloom: '#5a8a3e', road: '#8a6a44', crop: '#9a8244',
    rock: '#6f6b66', paved: '#8f8a84', sand: '#b8a478', snow: '#dde6ee',
  }
  function paintMap() {
    const n = ui.map.width
    const step = 2
    const yd = MAP_YARDS / n
    const img = mapCtx.createImageData(n, n)
    const px = img.data
    for (let j = 0; j < n; j += step) {
      for (let i = 0; i < n; i += step) {
        // North up, west left — the same map the screen is.
        const wx = hero.x + (n / 2 - j) * yd
        const wy = hero.y + (n / 2 - i) * yd
        let hex = wetAt(wx, wy) ? '#2d5f86'
          : stepAt(wx, wy) > CLIFF ? INK['rock']!
            : INK[paintAt(wx, wy)] ?? INK['grass']!
        const r = parseInt(hex.slice(1, 3), 16)
        const g = parseInt(hex.slice(3, 5), 16)
        const b = parseInt(hex.slice(5, 7), 16)
        for (let dy = 0; dy < step; dy++) {
          for (let dx = 0; dx < step; dx++) {
            const o = ((j + dy) * n + (i + dx)) * 4
            px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255
          }
        }
      }
    }
    mapCtx.putImageData(img, 0, 0)
    // Everybody awake, as a dot: red if it would fight you, green if it would
    // not.  Only the awake, which is the same couple of hundred the scene is
    // already thinking about.
    const mid = n / 2
    for (const m of active) {
      if (m.dead) continue
      const i = mid - (m.y - hero.y) / yd
      const j = mid - (m.x - hero.x) / yd
      if (i < 1 || i > n - 1 || j < 1 || j > n - 1) continue
      mapCtx.fillStyle = aggressive(m.fight) ? '#d8564a'
        : fightable(m.fight) ? '#d8b24a' : '#7fc46f'
      mapCtx.fillRect(Math.round(i) - 1, Math.round(j) - 1, 2, 2)
    }
    mapCtx.fillStyle = '#ffffff'
    mapCtx.fillRect(mid - 1, mid - 1, 3, 3)
  }
  const help = document.getElementById('help') as HTMLDivElement
  let talkingNow = false
  let helpFor: boolean | null = null

  // --- talking to people ------------------------------------------------

  const talkEl = document.getElementById('talk') as HTMLDivElement
  const EARSHOT = 3.2          // yards, about an arm and a step

  /** Whoever is close enough to hear you, nearest first. */
  function inReach(): Npc | null {
    let best: Npc | null = null, bd = EARSHOT * EARSHOT
    for (const n of active) {
      // Not the dead, and not anything that would rather bite you.  A wolf had
      // a line for being spoken to — "고개도 들지 않는다" — and it opened a
      // conversation panel, and a conversation panel stops you swinging.  So
      // walking up to a wolf and pressing the interact key made it
      // unattackable until you backed out of talking to it.
      if (n.dead || fightable(n.fight)) continue
      const dx = n.x - hero.x, dy = n.y - hero.y
      const d = dx * dx + dy * dy
      if (d < bd) { bd = d; best = n }
    }
    return best
  }

  /**
   * What a guard can point at, worked out from our own spawn list.
   *
   * `points_of_interest` was the obvious source and is the wrong one: its rows
   * are a coordinate and a name, the name is Blizzard's, and the coordinate on
   * its own does not say what is standing there.  Our own list does — it has a
   * role for every one of the 777 — and it has the further advantage of being
   * true about *this* world rather than about the one the table describes.
   */
  const SERVICES = ['vendor', 'trainer', 'questgiver', 'stablemaster', 'spirithealer']
  function directionsFrom(from: Npc): Direction[] {
    const out: Direction[] = []
    for (const role of SERVICES) {
      let best: Npc | null = null, bd = Infinity
      for (const n of npcs) {
        if (n === from || n.role !== role) continue
        const d = (n.x - from.x) ** 2 + (n.y - from.y) ** 2
        if (d < bd) { bd = d; best = n }
      }
      if (best && bd > 4)
        out.push({ role, yards: Math.sqrt(bd), bearing: bearing(best.x - from.x, best.y - from.y) })
    }
    return out.sort((a, b) => a.yards - b.yards)
  }

  let chat: { npc: Npc; speech: Speech; open: number } | null = null
  /**
   * How tall the panel and the readout are, measured when the panel is built.
   *
   * Read every frame instead, these force the browser to lay the page out
   * inside the render loop — and neither of them changes while somebody is
   * standing still talking to you, which is the only time they are used.
   */
  let panelH = 0, hudH = 0

  /**
   * Open one option, and do it if it does anything.
   *
   * One function for the mouse and the number keys, because they were two:
   * clicking an option ran its `act` and pressing its number only opened it,
   * so every errand in the game could be read and none of it could be
   * accepted from the keyboard.  And `act` runs on the first open whether or
   * not the option already has lines — the test used to be "no lines yet",
   * which is true of a bare answer and false of an errand that states what it
   * wants before you agree to it.
   */
  const didAct = new WeakSet<object>()
  function choose(i: number) {
    if (!chat) return
    const o = chat.speech.options[i]
    if (!o) return
    chat.open = chat.open === i ? -1 : i
    if (chat.open === i && o.act && !didAct.has(o)) {
      didAct.add(o)
      const said = o.act()
      o.lines = o.lines.length ? [...o.lines, ...said] : said
    }
    drawTalk()
  }

  function drawTalk() {
    if (!chat) { talkEl.hidden = true; talkEl.textContent = ''; ui.seat(); return }
    const { speech, open } = chat
    const wasHidden = talkEl.hidden
    talkEl.hidden = false
    if (wasHidden) ui.seat()
    talkEl.replaceChildren()
    const add = (cls: string, text: string) => {
      const d = document.createElement('div')
      d.className = cls
      d.textContent = text
      talkEl.appendChild(d)
      return d
    }
    add('who', speech.who)
    add('say', speech.greet)
    if (speech.options.length) {
      const ol = document.createElement('ol')
      speech.options.forEach((o, i) => {
        const li = document.createElement('li')
        const b = document.createElement('b')
        b.textContent = String(i + 1)
        li.append(b, document.createTextNode(o.label))
        li.onclick = () => choose(i)
        ol.appendChild(li)
        if (open === i) {
          const d = document.createElement('div')
          d.className = 'lines'
          d.textContent = o.lines.join('\n')
          d.style.whiteSpace = 'pre-line'
          ol.appendChild(d)
        }
      })
      talkEl.appendChild(ol)
      // What to press, on the thing you are holding.  A phone has no Esc key
      // and no numbers, and the panel covers most of the screen, so the way
      // out is the part that has to be said.
      add('foot', pad.on ? '답을 누르기   ·   바깥을 눌러 나가기'
        : '1-9 또는 눌러서 묻기   ·   E나 Esc로 나가기')
    } else {
      add('foot', pad.on ? '바깥을 눌러 나가기' : 'E나 Esc로 나가기')
    }
    panelH = talkEl.offsetHeight
    hudH = hud.offsetHeight
  }

  /**
   * Empty the bag over a counter.
   *
   * Everything at once, because what is in the bag is counted goods rather
   * than a list of things — there is nothing to pick between yet, and an
   * interface that makes you sell eleven pieces of cloth one at a time is an
   * interface pretending to have a decision in it.
   */
  const sellAll = (): string[] => {
    const rows = Object.entries(you.bag)
    if (rows.length === 0) return ['팔 것이 없소.']
    let paid = 0
    const said: string[] = []
    for (const [word, [many, worth]] of rows) {
      paid += worth
      said.push(`${goodsOf(word)} ${many} — ${worth > 0 ? coin(worth) : '값이 없다'}`)
    }
    you.bag = {}
    you.purse += paid
    said.push(paid > 0 ? `모두 ${coin(paid)}.` : '한 푼도 쳐주지 않는다.')
    return said
  }

  /**
   * Put on the best of what he is carrying.
   *
   * One gesture rather than a window of drag targets, for the same reason
   * selling empties the bag in one go: there is nothing to choose between yet
   * — everything he owns that fits a slot is better than the nothing in it —
   * and an interface that makes you place eleven pieces one at a time is an
   * interface pretending to have a decision in it.  When there is a choice to
   * make (two swords, one better against armour), this is where it goes.
   */
  const dressUp = (): string[] => {
    const said: string[] = []
    let changed = false
    for (const id of [...held]) {
      const it = itemOf(id)
      if (!it || !canWear(it, you.level)) continue
      const slot = it[I_SLOT] as string
      const now = gear[slot] !== undefined ? itemOf(gear[slot]!) : null
      // Better is the item level, which is the world's own one-number answer
      // to "is this an upgrade".
      if (now && (now[I_ILVL] as number) >= (it[I_ILVL] as number)) continue
      const put = wear(gear, it, id)
      gear = put.gear
      held = held.filter((x) => x !== id).concat(put.off)
      said.push(`${describe(it)} — ${detail(it)}`)
      changed = true
    }
    if (!changed) return ['새로 입을 것이 없다.']
    // Everything downstream of a stat: health, armour, damage, the swing.
    you.line = lineFor(you.level)
    you.max = you.line[HP]!
    you.hp = Math.min(you.hp, you.max)
    return said
  }

  /**
   * The character, drawn wearing what he is wearing.
   *
   * Fifty-eight layer sheets were committed to `public/art/doll/` and
   * `CLAUDE.md` claimed a `src/doll.ts` composed them; nothing in `src/` had
   * ever said the word.  Now something does.
   *
   * Drawn once when what is worn changes, not every frame: it is a still.
   */
  const dollArt = await Promise.all([
    fetch('./art/doll.json').then((r) => r.json() as Promise<DollMeta>)
      .catch(() => null),
  ]).then(([m]) => m)
  const dollCanvas = document.createElement('canvas')
  const dollLayers = new Map<string, HTMLImageElement>()
  let dollKey = ''
  /** Slots something is worn in that the layer sheets cannot draw. */
  const dollMissing = new Set<string>()
  const paintDoll = () => {
    if (!dollArt) return null
    const who = 'male'
    const meta = dollArt.who[who]
    if (!meta) return null
    // Which layer for each slot, from what is worn there — the item's own
    // armour value decides light, medium or heavy, because "is this leather
    // or plate" is not a column anywhere.
    const want: string[] = []
    for (const slot of ORDER) {
      const from = slot === 'body' ? null
        : slot === 'hair' ? null
          : gear[slot] !== undefined ? itemOf(gear[slot]!) : null
      const armour = slot === 'body' ? 0 : (from?.[I_ARMOUR] as number) ?? 0
      const name = slot === 'body' ? `${who}_body_bare`
        : slot === 'hair' ? `${who}_hair_1`
          : from ? layerFor(dollArt, who, slot, armour) : null
      // Something worn that the sheets cannot draw.  There is no `legs` layer
      // in the set at all — 32 files and not one of them is trousers — so the
      // starting outfit's are worn, counted and invisible.  Named rather than
      // dropped, because a silent nothing is how the whole paperdoll came to
      // be believed in for weeks while no such file existed.
      if (from && !name) dollMissing.add(slot)
      if (name) want.push(name)
    }
    const key = want.join('|')
    if (key === dollKey && dollCanvas.width) return dollCanvas
    dollKey = key
    const c = meta.cell, scale = 2
    dollCanvas.width = c * scale
    dollCanvas.height = c * scale
    const g = dollCanvas.getContext('2d')!
    g.imageSmoothingEnabled = false
    g.clearRect(0, 0, dollCanvas.width, dollCanvas.height)
    const frame = still(dollArt, who)
    for (const name of want) {
      let img = dollLayers.get(name)
      if (!img) {
        img = new Image()
        // A layer that arrives after the still was composed has to make the
        // still be composed again, or the panel shows an empty square for
        // ever — the first draw always runs before any of these have loaded.
        img.onload = () => { dollKey = '' }
        img.src = `./art/doll/${name}.png`
        dollLayers.set(name, img)
      }
      if (!img.complete || !img.naturalWidth) continue
      // Each layer is packed at *its own* size, not at the cell's: the body
      // sheet is 592 by 855, which is sixteen columns of 37 by 45, and `dx`
      // and `dy` say where that rectangle sits inside the 57-pixel cell.
      // Read as cell-sized frames the sheet is a tenth of a column out and
      // every layer draws somebody else's elbow.
      const box = meta.layers[name]
      if (!box) continue
      const sx = (frame % dollArt.cols) * box.w
      const sy = Math.floor(frame / dollArt.cols) * box.h
      g.drawImage(img, sx, sy, box.w, box.h,
        box.dx * scale, box.dy * scale, box.w * scale, box.h * scale)
    }
    return dollCanvas
  }

  /** What a thing is, in our words: its sort, and where it goes. */
  const describe = (it: Item): string => {
    const slot = it[I_SLOT] as string
    return slot ? `${goodsOf(it[I_WORD] as string)} (${SLOT_WORD[slot] ?? slot})`
      : goodsOf(it[I_WORD] as string)
  }
  const detail = (it: Item): string => {
    const bits: string[] = []
    if (it[I_LO]) bits.push(`${it[I_LO]}–${it[I_HI]} 피해 / ${((it[I_DELAY] as number) / 1000).toFixed(1)}초`)
    if (it[I_ARMOUR]) bits.push(`방어도 ${it[I_ARMOUR]}`)
    for (const [word, amount] of (it[12] as (string | number)[][]) ?? [])
      bits.push(`${STAT_WORD[word as string] ?? word} +${amount}`)
    if (it[I_NEED]) bits.push(`${it[I_NEED]}레벨 필요`)
    return bits.join(', ') || '쓸모는 파는 값뿐이다'
  }

  function startTalk(n: Npc) {
    const speech = speak(n.kind, n.role, n.level, n.seed, n.topic,
      () => directionsFrom(n))
    // What this one is finished with, first, and then what they are asking
    // for.  Handing in before taking on is the order the original puts them
    // in and the order that reads right: you came back for a reason.
    for (const h of wants(log, n.entry)) {
      const q = log.all.get(h.id)!
      const ready = errandDone(log, h)
      const say2 = {
        label: ready ? '마쳤습니다' : `아직입니다 (${short(log, h)} 남음)`,
        lines: ready ? [] : errand(shapeOf(q)),
      } as Option
      if (ready) {
        say2.act = () => {
          const paid = hand(log, h)
          you.xp += paid.xp
          you.purse += paid.coin
          levelUp()
          ui.log(`완료 — ${payFor(paid.xp, paid.coin)}`, 'gain')
          showErrands()
          return [payFor(paid.xp, paid.coin)]
        }
      }
      speech.options.unshift(say2)
    }
    for (const q of offers(log, n.entry, you.level)) {
      speech.options.unshift({
        label: `일거리 (${q.level}레벨)`,
        lines: [...errand(shapeOf(q)), `사례: ${payFor(q.xp, q.coin)}`],
        act: () => {
          take(log, q)
          ui.log(`맡음 — ${errand(shapeOf(q)).join(', ')}`, 'note')
          showErrands()
          return ['맡았습니다.']
        },
      })
    }
    // A shopkeeper buys as well as sells, and what you have to sell is not
    // something `talk.ts` can know — it has never heard of a bag.
    if (n.role === 'vendor') {
      speech.options.push({
        label: '가진 것을 팝니다', lines: [], act: sellAll,
      })
      // And sells.  `npc_vendor` has been read into the conversation for
      // rounds — "twelve things, from ten copper to a gold" — and there was
      // nothing behind the sentence.  Money you cannot spend is a number, and
      // the whole decision this game has outside a fight is whether to spend
      // it on a lesson or on a breastplate.
      for (const row of (shelf.stock?.[String(n.entry)] ?? []).slice(0, 4)) {
        const id = row[0]!
        const it = itemOf(id)
        if (!it) continue
        const price = it[I_BUY] as number
        speech.options.push({
          label: `${describe(it)} — ${coin(price)}`,
          lines: [detail(it)],
          act: () => {
            if (you.purse < price) return ['돈이 모자라오.']
            you.purse -= price
            held.push(id)
            ui.log(`${describe(it)}을(를) 샀다. ${coin(price)}`, 'note')
            return [`${describe(it)}. ${coin(you.purse)} 남았소.`]
          },
        })
      }
    }
    // And a trainer teaches.  `trainer_spell` says what, at what level, and
    // for how much; the warrior's first ten levels come to 2,110 copper and
    // the zone's quests pay about 1,175, which is the gap the whole economy
    // is made of.
    const school = shelf.trainers?.[String(n.entry)]
    if (school) {
      // The ones he could take now, and only a handful: a class trainer has
      // sixty rows and a conversation is not a spreadsheet.
      const ready = school.teaches
        .filter(([id, , need]) => abilityOf(id!) && !taught.includes(id!)
          && need! <= you.level + 2)
        .sort((a, b) => a[2]! - b[2]!)
        .slice(0, 4)
      for (const [id, cost, need] of ready) {
        const word = abilityOf(id!)!
        speech.options.push({
          label: `${word[0]} 배우기 (${need}레벨) — ${coin(cost!)}`,
          lines: [word[1]],
          act: () => {
            if (you.level < need!) return [`${need}레벨이 되거든 오시오.`]
            if (you.purse < cost!) return ['돈이 모자라오.']
            you.purse -= cost!
            taught.push(id!)
            spells = known(you.level)
            ui.log(`${word[0]}을(를) 배웠다. ${coin(cost!)}`, 'gain')
            return [`${word[0]}. ${coin(you.purse)} 남았소.`]
          },
        })
      }
    }
    chat = { npc: n, speech, open: -1 }
    // Turn to face whoever spoke to them — the four directions are the same
    // four the sprite has, so this costs nothing and is the difference between
    // a conversation and shouting at somebody's back.
    const dx = hero.x - n.x, dy = hero.y - n.y
    n.dir = facing(dx, dy)
    n.vx = 0; n.vy = 0
    drawTalk()
  }

  function endTalk() { chat = null; drawTalk() }

  function toggleTalk() {
    if (chat) { endTalk(); return }
    // A body cannot answer you, so the same key goes through its pockets.
    // One key for "deal with the thing in front of me" is how this game is
    // played with a thumb.
    const body = corpse()
    if (body) {
      const got = loot(body)
      say(body.x, body.y, got, true)
      ui.log(`${nameOf(body.kind)}에게서 ${got}`, 'gain')
      return
    }
    // And whatever is growing or standing there, for the same reason.
    const thing = atHand()
    if (thing && !inReach()) {
      const got = gather(thing)
      say(thing.x, thing.y, got, true)
      ui.log(`${nameOf(thing.kind)} — ${got}`, 'gain')
      return
    }
    const n = inReach()
    if (n) startTalk(n)
  }

  let zoom = 1
  /**
   * How far out you may pull, which is a frame-rate decision.
   *
   * A diamond of ground is a blit and the count goes as the square of how far
   * out you are: at 0.4 the view is 146 yards across and 7,784 tiles, which
   * this machine draws at 37 frames a second.  0.6 is 3,400 tiles and holds
   * 60.  The old floor was 0.4 and the old world was a 600 yard disc, where
   * the whole of it fit in 2,000 tiles at any zoom.
   */
  const clampZoom = (z: number) => Math.max(0.12, Math.min(3, z))
  addEventListener('wheel', (e) => {
    zoom = clampZoom(zoom * (1 - Math.sign(e.deltaY) * 0.12))
  }, { passive: true })


  function resize() {
    canvas.width = Math.floor(innerWidth)
    canvas.height = Math.floor(innerHeight)
    ctx.imageSmoothingEnabled = false
  }
  addEventListener('resize', resize)
  resize()

  // World to screen.  The client's +x is north and +y is west; on screen north
  // is up and west is left, so both axes flip.
  let camX = hero.x, camY = hero.y
  /** How far above the hero the camera sits, in yards.  See the frame loop. */
  let lift = 0
  /**
   * World to screen, in quarter view.
   *
   * North is the world's +x and west is its +y, and neither of them is a
   * screen axis any more: north leaves towards the top right of the glass and
   * west towards the top left, which is what makes a square of ground a
   * diamond and a quarter view a quarter view.
   *
   * The half on the vertical is the 2:1 every isometric tileset is drawn to.
   * The horizontal is left at one rather than at the cosine that would keep a
   * yard exactly a yard, and that is a performance decision as much as a
   * stylistic one: a diamond of side `T` covers half the glass a square of
   * side `T` does, so scaling the world down to fit the old measurements
   * doubles the number of ground tiles on screen — 1,836 of them where 550
   * used to be, at 39 frames a second.  At one, a tile covers the same area it
   * always did, and the world is the 12% larger that every isometric tileset
   * is drawn to be.
   */
  const k = () => PPY * zoom
  const screenX = (_wx: number, wy: number) =>
    (camY - wy) * k() + canvas.width / 2
  const screenY = (wx: number, _wy: number) =>
    (camX - wx) * k() + canvas.height / 2

  /**
   * The ground, pre-tinted.
   *
   * Flat again, so a tile is a straight blit and the shear is gone — but the
   * tint stays baked, because that half of the cache was never about the
   * projection.  A second fill over every tile on the screen was the other
   * half of the draw calls, and taking it out of the frame is what bought the
   * refresh rate back the first time.
   *
   * The tint is quantised, and the steps run between the two ends `shadeAt`
   * actually clamps to rather than between -1 and 1.  Stepped over the wider
   * range the real values only ever reached four of the levels, and four flat
   * levels is not shading, it is faceting.
   */
  const SHADES = 21
  let baked: { key: number; px: number; c: HTMLCanvasElement; at: Record<string, number> } | null = null
  function tintedGround() {
    const key = Math.round(zoom * 100)
    if (baked && baked.key === key) return baked
    const px = Math.ceil(TILE * zoom) + 1
    const ids = [...new Set([...GROUND_TILES, ...BLOOM_TILES, ...WATER_TILES,
      ...PAVED_TILES, WALL_TILE, ROOF_TILE, FLOOR_TILE,
      ROCK_TILE, DIRT_TILE, SHORE_TILE, 'bridge', 'bridge_b', 'stone']
      .filter((k) => k && tilesMeta[k]) as string[])]
    const c = document.createElement('canvas')
    c.width = px * ids.length
    c.height = px * SHADES
    const g = c.getContext('2d')!
    g.imageSmoothingEnabled = false
    const at: Record<string, number> = {}
    ids.forEach((id, i) => {
      at[id] = i * px
      const p = tilesMeta[id]!
      for (let j = 0; j < SHADES; j++) {
        g.drawImage(tilesImg, p.x, p.y, p.w, p.h, i * px, j * px, px, px)
        const sl = SHADE_LO + (j / (SHADES - 1)) * (SHADE_HI - SHADE_LO)
        // Straight across the range, not clamped again on the way out.  The
        // old mapping reached its cap two thirds of the way down and flattened
        // everything below it, which put a second black on top of the first.
        if (Math.abs(sl) > 0.02) {
          g.fillStyle = sl > 0
            ? `rgba(255,247,224,${(sl / SHADE_HI) * 0.34})`
            : `rgba(8,14,26,${(sl / SHADE_LO) * 0.46})`
          g.fillRect(i * px, j * px, px, px)
        }
      }
    })
    baked = { key, px, c, at }
    return baked
  }

  /**
   * And back again, which the tile loop needs.
   *
   * The visible world is a diamond now, so the rectangle of tiles to draw is
   * the bounding box of the four screen corners projected back — not the
   * rectangle the camera is in the middle of.  Inverted from the two lines
   * above rather than guessed at with a fudge factor twice their size.
   */
  const worldAt = (X: number, Y: number) => ({
    x: camX - (Y - canvas.height / 2) / k(),
    y: camY - (X - canvas.width / 2) / k(),
  })

  let fps = 0, frames = 0, acc = 0, drawn = 0, tilesDrawn = 0, npcsDrawn = 0
  let last = performance.now()
  let clock = 0
  const kindCount = new Set(npcs.map((n) => n.art)).size
  const talkers = npcs.filter((n) => n.topic).length

  /**
   * The readout, as a two-column grid rather than as one padded block.
   *
   * The labels used to be padded with spaces inside a single monospace string,
   * which works exactly as long as every glyph is one column wide.  Korean is
   * two — and the font a phone falls back to for it is not monospace at all —
   * so 지면 and 주인공 put their values in different places.  A grid lets the
   * browser measure what the font actually is.
   *
   * The cells are built once and written into, because this runs every frame.
   */
  const hudCells: HTMLSpanElement[] = []
  function readout(rows: [string, string][]) {
    if (hudCells.length === 0) { hud.textContent = ''; hud.className = '' }
    while (hudCells.length < rows.length * 2) {
      const el = document.createElement('span')
      if (hudCells.length % 2 === 0) el.className = 'k'
      hud.appendChild(el)
      hudCells.push(el)
    }
    for (let i = 0; i < rows.length; i++) {
      const [k, v] = rows[i]!
      if (hudCells[i * 2]!.textContent !== k) hudCells[i * 2]!.textContent = k
      if (hudCells[i * 2 + 1]!.textContent !== v) hudCells[i * 2 + 1]!.textContent = v
    }
  }

  /**
   * How long one step of the world is.
   *
   * Fifty milliseconds, which is the figure the simulation design chose and
   * nothing used: `requestAnimationFrame`'s own delta went straight into the
   * simulation, so **the frame rate changed the game**.  A fight that runs
   * differently on a slow machine cannot be reproduced, and what cannot be
   * reproduced cannot be checked — the same argument that put one stream of
   * chance behind every roll.
   *
   * Everything the design hangs off it lands on whole numbers: the global
   * cooldown is thirty ticks and a 2.9 second swing is fifty-eight.
   */
  const STEP = 0.05
  /**
   * How far behind it may fall before it gives up catching up.
   *
   * A backgrounded tab gets no frames and comes back owing minutes; running
   * all of them is a spiral that never closes.  Half a second is generous and
   * the rest is the right thing to lose.
   */
  const BEHIND = 0.5
  let owed = 0

  /** One step of the world, always the same length. */
  let ticks = 0
  function tick() {
    ticks++
    clock += STEP
    // Everyone else first, then the bucket grid they are in, then the player:
    // the player's collision test reads that grid, so it has to describe where
    // people are now rather than where they were a step ago.
    awake()
    wander(STEP, clock, chat && chat.npc)
    reindex()
    fighting()
    restocking()
    walk(STEP)
    slide(STEP)
    // Every fifteen seconds, which is cheap and means a crash costs a walk
    // rather than an afternoon.
    if (clock - saved > 15) { saved = clock; keep() }
    // Somewhere a quest wanted you to stand.  Five of the slice's hundred and
    // two finish this way rather than by killing or carrying, and without it
    // they can be taken and never finished.
    for (const q of walked(log, hero.x, hero.y)) {
      ui.log(`${q.id}번 일거리 — 그곳에 닿았다.`, 'gain')
      showErrands()
    }
  }

  /**
   * One step of walking, at a fixed length.
   *
   * Split out of the frame so the simulation can run on whole steps: what the
   * keys and the stick are asking for is read once a frame and *acted on* once
   * a tick, which is the difference between a game that plays the same on
   * every machine and one that does not.
   */
  function walk(step: number) {
    const sdx = want.x, sdy = want.y
    let mx = 0, my = 0
    if (sdx !== 0 || sdy !== 0) {
      const o = worldAt(canvas.width / 2, canvas.height / 2)
      const t = worldAt(canvas.width / 2 + sdx * 64, canvas.height / 2 + sdy * 64)
      mx = t.x - o.x
      my = t.y - o.y
    }
    hero.was.x = hero.x; hero.was.y = hero.y
    hero.moving = mx !== 0 || my !== 0
    if (hero.moving) {
      const len = Math.hypot(mx, my)
      // A step is a third of a yard at running speed, and a collision test
      // that only asks once a step walks *through* anything narrower than
      // that — a tree, a fence post, the gap between two people.  So the
      // movement is cut into pieces no bigger than a body's own width, which
      // is what the client's collision radius is for.  Asked once, fifteen of
      // twenty steps out of the starting camp were refused outright.
      const each = 0.15
      const pieces = Math.max(1, Math.ceil((SPEED * step) / each))
      const dx = ((mx / len) * SPEED * step) / pieces
      const dy = ((my / len) * SPEED * step) / pieces
      for (let piece = 0; piece < pieces; piece++) {
        // Each axis is tested on its own, so walking into a shoreline at an
        // angle slides along it instead of stopping dead.  Tested together, a
        // diagonal into the bank blocks both halves and the player sticks on
        // water they are not even walking into.
        //
        // And if the player is already standing in water — teleported there,
        // or dropped in by a mask that moved under them — every move is
        // allowed.  A rule that can trap somebody is worse than the thing it
        // prevents.
        const stuck = footing(hero.x, hero.y)
        if (stuck || !footing(hero.x + dx, hero.y)) hero.x += dx
        if (stuck || !footing(hero.x, hero.y + dy)) hero.y += dy
      }
      hero.dir = facing(mx, my)
    }
    hero.t += step
  }

  function frame(now: number) {
    const real = Math.min(0.25, (now - last) / 1000)
    last = now
    // As many whole steps as the time will pay for, and no more.  The leftover
    // stays owed and the render interpolates across it, which is what keeps
    // movement smooth without letting the frame rate into the simulation.
    owed += real
    let ran = 0
    while (owed >= STEP && ran < BEHIND / STEP) { tick(); owed -= STEP; ran++ }
    if (owed > BEHIND) owed = BEHIND
    // How far between two steps the drawing is, in [0, 1).
    /**
     * How far between two steps the drawing is, in [0, 1).
     *
     * The simulation runs at a fixed rate and the screen does not, so a body
     * that moves a third of a yard a step would visibly stutter at sixty
     * frames.  This is drawn *between* where it was and where it is; it
     * changes nothing about the world, only about the picture — which is the
     * whole reason interpolation is allowed to exist.
     */
    const between = owed / STEP
    const tween = (was: number, now: number) => was + (now - was) * between
    for (const n of active) { n.ix = tween(n.was.x, n.x); n.iy = tween(n.was.y, n.y) }
    hero.ix = tween(hero.was.x, hero.x)
    hero.iy = tween(hero.was.y, hero.y)
    const dt = real

    // --- the thumbs, before the keys, because they answer the same question
    pad.setBusy(chat !== null)
    zoom = clampZoom(zoom * pad.pinch())
    // A tap on the world ends a conversation, which is how it ends anywhere.
    // Taps on the panel itself never reach the canvas, so answering an option
    // does not close the thing you are answering.
    const tapped = pad.takeTap()
    if (chat && tapped) endTalk()
    // A tap on the world picks what it lands on.  Until now the only way to
    // choose was to be nearest to it, which is no choice at all when two
    // things are standing together — and two of them always are.
    else if (tapped && !you.died) {
      const at = worldAt(tapped.x, tapped.y)
      let best: Npc | null = null, bd = 3 * 3
      for (const n of active) {
        if (n.dead || !n.fight) continue
        const d = (n.x - at.x) ** 2 + (n.y - at.y) ** 2
        if (d < bd) { bd = d; best = n }
      }
      // Only something that will fight back becomes a target; tapping a
      // townsman is how you look at one, not how you start on them.
      if (best && fightable(best.fight)) you.target = best
      else if (best) you.target = null
    }
    for (const slot of pad.taken()) {
      if (ACTIONS[slot] === 'talk') toggleTalk()
      else if (ACTIONS[slot] === 'attack' && !chat && !you.died)
        you.target = you.target ?? inSwing()
    }

    // Steering happens on the glass, both for the keys and for the thumb.
    //
    // W used to be north because north was up.  In quarter view it is up and
    // to the right, and a W that walks you diagonally while the screen says
    // "up" is the kind of control nobody can aim.  So the intent is collected
    // in screen pixels and put through the same inverse the tile loop uses —
    // one place that knows how the projection works, rather than two that have
    // to agree.
    let sdx = 0, sdy = 0
    if (keys.has('w') || keys.has('arrowup')) sdy -= 1
    if (keys.has('s') || keys.has('arrowdown')) sdy += 1
    if (keys.has('a') || keys.has('arrowleft')) sdx -= 1
    if (keys.has('d') || keys.has('arrowright')) sdx += 1
    const stick = pad.push()
    if (stick) { sdx = stick.x; sdy = stick.y }
    want.x = sdx; want.y = sdy
    // On a phone the panel takes the bottom two thirds of the screen and the
    // person talking stands behind it, which is the one thing a conversation
    // cannot afford.  So the camera follows a point above the hero by exactly
    // enough to centre the pair of you in the gap the panel leaves, and slides
    // back when it closes.  The lift is in yards because the camera is: at a
    // fixed pixel offset, zooming out would walk the pair back down the glass.
    // The band of screen left over: under the readout, over the panel.  The
    // first version centred the pair in everything above the panel and put
    // them behind the readout instead, which is the same bug one corner along.
    const top = chat && pad.on ? hudH + 16 : 0
    const bottom = chat && pad.on ? canvas.height - panelH - 32 : canvas.height
    const wantY = (top + Math.max(top, bottom)) / 2
    // Up the glass is world x and only world x, so the lift is along it alone.
    // In quarter view it had to move along both axes together or the pair of
    // you slid sideways as the panel opened.
    const lifted = (canvas.height / 2 - wantY) / k()
    lift += (lifted - lift) * Math.min(1, dt * 6)
    camX += ((hero.ix - lift) - camX) * Math.min(1, dt * 8)
    camY += (hero.iy - camY) * Math.min(1, dt * 8)

    // Walking away ends it, which is how it ends anywhere.  The threshold is
    // wider than the one that starts it so that shuffling on the spot does not
    // slam the panel shut in your face.
    if (chat && Math.hypot(chat.npc.x - hero.x, chat.npc.y - hero.y) > EARSHOT * 1.8) endTalk()
    const listener = chat ? null : inReach()

    // --- ground ---
    // What the sky is doing here, this hour.  `game_weather` gives the zone
    // its own chances by season and the hour derives the roll, so it does not
    // touch the stream of chance and does not flicker.  The ground colour and
    // the tint over every tile come out of it: the art direction took the
    // colour out of the terrain, and this is most of what is left to give the
    // land an expression.
    const today = frozen ?? new Date()
    const zoneHere = areaOf(hero.x, hero.y)
    const sky = forcedSky ?? skyAt(who?.weather?.[String(zoneHere)]
      ?? who?.weather?.[String(inside(zoneHere))], today)
    const light = lightAt(today, sky)
    ctx.fillStyle = light.ground
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // The glass is an upright rectangle of world again, so the corners put back
    // through the projection are the corners of the box — no slack.
    /**
     * How much ground one tile covers, which is not always 1.33 yards.
     *
     * The ground was drawn at a fixed 1.33 yards a tile whatever the zoom, so
     * the cost went as the square of how far out you were: 2,752 tiles at the
     * old floor and 66,676 four steps below it, at twenty frames a second.
     * That floor was the reason you could never see Northshire — the widest
     * view was eighty-three yards across and the valley is six hundred, so the
     * place could only ever be looked at two per cent at a time.
     *
     * A tile that is four pixels on the glass is not detail, it is cost.  So
     * the world step doubles whenever a tile would fall under sixteen pixels,
     * which holds the count near constant at every zoom and is invisible: at
     * that size there is nothing in a 1.33 yard tile to see.
     */
    const grain = Math.max(1, 2 ** Math.ceil(Math.log2(
      Math.max(1, 16 / (TILE * zoom)))))
    const T = YD_PER_TILE * grain
    const seen = [worldAt(0, 0), worldAt(canvas.width, 0),
      worldAt(0, canvas.height), worldAt(canvas.width, canvas.height)]
    const xLo = Math.floor(Math.min(...seen.map((c) => c.x)) / T) - 1
    const xHi = Math.ceil(Math.max(...seen.map((c) => c.x)) / T) + 1
    const yLo = Math.floor(Math.min(...seen.map((c) => c.y)) / T) - 1
    const yHi = Math.ceil(Math.max(...seen.map((c) => c.y)) / T) + 1

    const ground = tintedGround()
    const px = ground.px
    // Which building the player is standing in, asked once a frame.
    const under = inRoom(hero.x, hero.y)
    tilesDrawn = 0
    for (let ti = xLo; ti <= xHi; ti++) {
      for (let tj = yLo; tj <= yHi; tj++) {
        const wx = ti * T, wy = tj * T
        // The bounding box of a diamond is twice the diamond, so half of what
        // it holds is off the glass: at 1,400 pixels across that was 2,025
        // tiles drawn where 550 are visible, and the frame rate said so.
        const cx = screenX(wx, wy), cy = screenY(wx, wy)
        const edge = px * grain
        if (cx < -edge || cx > canvas.width + edge
          || cy < -edge || cy > canvas.height + edge) continue
        // No floor here at all: the client took this square out of its own
        // ground to make the mouth of something.  Painted as the dark behind
        // the world rather than skipped, because the sheet the frame is
        // cleared with is the colour of ground off the edge of the slice, and
        // a hole is not the edge of anything — it is a way in.
        //
        // Asked *after* the building, which it was not: the client cuts its
        // terrain away wherever a building carries its own floor, and this
        // painted that cut black without looking up.  The middle of Goldshire
        // was a thirty-yard black square with the inn's own people standing
        // on it.  A wall standing on a hole is a wall, and a floor over one is
        // a floor; either way something else is painting here.
        // Asked at the tile's own width, which is the same question the
        // paint below asks a few lines down, so it is asked once.
        const covers = inBuilding(wx, wy, T)
        if (openHole(wx, wy) && !covers) {
          const wide = px * grain
          ctx.fillStyle = '#0a0a0f'
          ctx.fillRect(Math.round(cx - wide / 2), Math.round(cy - wide / 2),
            wide, wide)
          tilesDrawn++
          continue
        }
        const h = hash(ti, tj)
        const water = WATER_TILES.length > 0 && wetAt(wx, wy)
        // Water is flat by definition, so it gets none of the hillside shading
        // — a lit slope on a lake surface is the giveaway that the water is
        // painted on the ground rather than standing on it.
        // Measured over the tile's own width.  A five-yard tile that takes
        // its light from a single point is a five-yard block of whatever that
        // point happened to be, and at the darkest end of the range that is a
        // black square: the hillsides came out with holes punched in them the
        // moment the ground was allowed to draw coarser than 1.33 yards.
        const sl = water ? 0 : shadeAt(wx, wy, T)
        // Bands on one continuous number, so bare ground follows the hillside
        // instead of speckling across it.
        const steep = slopeAt(wx, wy, T)
        const meadow = BLOOM_TILES.length > 0
          && hash(Math.floor(ti / 5) + 811, Math.floor(tj / 5) + 277) > MEADOW
        const shore = !water && WATER_TILES.length > 0
          && (wetAt(wx + T, wy) || wetAt(wx - T, wy)
            || wetAt(wx, wy + T) || wetAt(wx, wy - T))
        // What the client painted here beats what the slope guesses, because
        // one of them is a decision somebody made and the other is arithmetic
        // over a height field.  Where the paint says grass — or where there is
        // none at all, which is the synthesised world — the arithmetic gets
        // its old say.
        const ink = paintAt(wx, wy)
        // A road is dirt on ground you could walk a cart over.  The client
        // paints the same dirt on the scree of every mountainside, so taking
        // it at face value ran roads up cliffs — the mask is a road network
        // and a great deal of loose rock, and only the slope tells them apart.
        const flat = steep <= BARE
        // A deck where a crossing stands.  In the ground pass and not among
        // the trees, because a bridge is a floor: it is what you are standing
        // on rather than something standing beside you.
        const span = onSpan(wx, wy)
        // A building's plan, drawn on the ground: stone inside, darker stone
        // for the wall.  In the ground pass because from above a building is
        // mostly a floor with a line around it, and because a plan ninety
        // yards across is not a thing that can be a sprite.
        const built = span ? null : covers
        // The roof comes off the building you are standing in.  There are no
        // interiors here and the abbey holds the people who hand out the work,
        // so a roof drawn over them is a roof with a quest giver under it —
        // and the walls are what say where you are anyway.
        // From outside, a building is its roof and nothing else: the walls
        // are what you see once you are in it.  Drawn the other way round the
        // abbey was a roof with its own walls painted over the top, which
        // reads as ribs on a tent rather than as a building.
        const id = built && built.b !== under ? ROOF_TILE
          : built && built.wall ? WALL_TILE
          : built && built.floor ? FLOOR_TILE
          : span ? span.tile
          : water ? WATER_TILES[Math.floor(h * WATER_TILES.length)]!
          : ink === 'paved' && PAVED_TILES.length > 0
            ? PAVED_TILES[Math.floor(h * PAVED_TILES.length)]!
          : ink === 'rock' || ink === 'paved' ? ROCK_TILE
            : (ink === 'road' || ink === 'crop') && flat ? DIRT_TILE
              : ink === 'sand' ? SHORE_TILE
                : shore ? SHORE_TILE
                  : stepAt(wx, wy, T) > CLIFF ? ROCK_TILE
                    : ink === 'bloom' || (meadow && h > 0.55)
                      ? BLOOM_TILES[Math.floor(h * 7) % BLOOM_TILES.length]!
                      : steep > BARE ? DIRT_TILE
                        : GROUND_TILES[Math.floor(h * GROUND_TILES.length)]!
        // One straight blit of a square, centred on the tile's own point —
        // which is what `wx, wy` has always meant here.
        const step = Math.max(0, Math.min(SHADES - 1, Math.round(
          ((sl - SHADE_LO) / (SHADE_HI - SHADE_LO)) * (SHADES - 1))))
        const wide = px * grain
        ctx.drawImage(ground.c, ground.at[id]!, step * px, px, px,
          Math.round(cx - wide / 2), Math.round(cy - wide / 2), wide, wide)
        tilesDrawn++
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    // --- things that stand up, back to front ---
    const margin = 120
    drawn = 0
    // On a crossing you stand on the deck, not in the water under it — the
    // shading that reads height off the ground would otherwise darken him into
    // the streambed he is walking over.
    const heroSpan = onSpan(hero.x, hero.y)
    const heroZ = heroSpan ? heroSpan.z : groundAt(hero.x, hero.y)
    /**
     * The player, out of the drawn sheet.
     *
     * One sprite pixel to one screen pixel at zoom 1, which is the scale the
     * ground is drawn at — 32 pixels to a 1.33 yard tile is 24 to the yard,
     * and PPY is 24.  A separate fudge factor here once had sprites eight per
     * cent smaller than the ground they stood on.
     */
    const drawHero = () => {
      const clip = (hero.moving ? heroMeta.clips['walk'] : heroMeta.clips['idle'])!
      const n = clip.count
      const f = hero.moving ? Math.floor(hero.t * 10) % n : Math.floor(hero.t * 2) % n
      const idx = clip.first + hero.dir * n + f
      const c = heroMeta.cell
      const sxp = (idx % heroMeta.cols) * c, syp = Math.floor(idx / heroMeta.cols) * c
      const w = c * zoom
      shadow(hero.ix, hero.iy, 0.34)
      ctx.drawImage(heroImg, sxp, syp, c, c,
        Math.round(screenX(hero.ix, hero.iy) - w / 2),
        Math.round(screenY(hero.ix, hero.iy) - w * 0.82), Math.ceil(w), Math.ceil(w))
      drawn++
    }
    /**
     * The dab of shade a body puts on the ground it stands on.
     *
     * The scenery sprites carry their own — Sharm drew the trees with one
     * under them — and the people do not, which is why a townsman read as a
     * sticker laid on the grass rather than as somebody standing in it.  It is
     * an ellipse and not a cast shadow: the light in this scene is the
     * hillside shading, and that has no direction to cast along.
     */
    const shadow = (wx: number, wy: number, wide: number) => {
      const r = wide * PPY * zoom
      ctx.save()
      ctx.globalAlpha = 0.28
      ctx.fillStyle = '#0b1408'
      ctx.beginPath()
      ctx.ellipse(screenX(wx, wy), screenY(wx, wy), r, r * 0.42, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    const drawNpc = (n: Npc) => {
      const a = npcArt.kinds[n.art]!
      // Frame 0 is the standing pose in every sheet the bake cuts. For people
      // the walk is the frames after it; the animal sheets have no separate
      // stand, so their cycle includes it.
      const from0 = a.people ? 1 : 0
      const span = Math.max(1, a.frames - from0)
      const f = n.moving ? from0 + (Math.floor(n.t * 8) % span) : 0
      const idx = a.first + n.dir * a.frames + f
      const c = npcArt.cell
      const sxp = (idx % npcArt.cols) * c, syp = Math.floor(idx / npcArt.cols) * c
      const w = c * zoom
      // Sized off the art, like the prompt over their head: a chicken casts a
      // chicken's worth of shade.
      shadow(n.ix, n.iy, Math.max(0.3, (a.yards ?? 0.9) * 0.34))
      // The dead lie there and thin out, and come back in half a minute.
      const fade = n.dead ? Math.max(0.15, 1 - (clock - n.dead) / 6) : 1
      if (n.alpha * fade < 1) ctx.globalAlpha = n.alpha * fade
      ctx.drawImage(npcImg, sxp, syp, c, c, Math.round(screenX(n.ix, n.iy) - w / 2),
        Math.round(screenY(n.ix, n.iy) - w * npcArt.anchor), Math.ceil(w), Math.ceil(w))
      if (n.alpha * fade < 1) ctx.globalAlpha = 1
      // A bar, only while it matters: something you are fighting, or something
      // that has been hit in the last few seconds.  A field of health bars over
      // 1,884 people is a spreadsheet, not a forest.
      if (!n.dead && n.fight && (n === you.target || clock - n.hurt < 5)) {
        const X = Math.round(screenX(n.x, n.y))
        const Y = Math.round(screenY(n.x, n.y) - (headOf[n.art] ?? 40) * zoom - 7)
        const bw = Math.round(26 * zoom), bh = Math.max(3, Math.round(3 * zoom))
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.fillRect(X - bw / 2 - 1, Y - 1, bw + 2, bh + 2)
        ctx.fillStyle = n.fight[STANCE] === ENEMY ? '#c4463a'
          : n.fight[STANCE] === QUARRY ? '#c4a03a' : '#4f9e46'
        ctx.fillRect(X - bw / 2, Y, Math.round(bw * (n.hp / n.max)), bh)
      }
      // And the mark, which is how anybody finds the work at all: a full one
      // for something on offer, a question for something finished, a hollow
      // question for something still going.  Without it a quest giver is a
      // person in a field who happens to want something.
      if (!n.dead) {
        const m = mark(log, n.entry, you.level)
        if (m) {
          const X = Math.round(screenX(n.x, n.y))
          const Y = Math.round(screenY(n.x, n.y)
            - (headOf[n.art] ?? 40) * zoom - 14 * zoom)
          ctx.font = `bold ${Math.max(11, Math.round(17 * zoom))}px serif`
          ctx.textAlign = 'center'
          ctx.lineWidth = Math.max(2, 3 * zoom)
          ctx.strokeStyle = 'rgba(0,0,0,.85)'
          ctx.fillStyle = m === '?.' ? '#8a8a8a' : '#f2c341'
          const glyph = m === '!' ? '!' : '?'
          ctx.strokeText(glyph, X, Y)
          ctx.fillText(glyph, X, Y)
          ctx.textAlign = 'left'
        }
      }
      drawn++
    }

    /**
     * Everything that can be somewhere different next frame, in one list.
     *
     * The scenery is sorted once and never again, because none of it moves.
     * These do, so they are collected and sorted per frame — but only the ones
     * on screen, which is tens out of seven hundred.  Then the two sorted
     * lists are merged, which is what keeps a wolf behind the tree it is
     * behind.
     */
    const actors: { x: number; y: number; draw: () => void }[] = []
    for (const n of active) {
      const X = screenX(n.x, n.y), Y = screenY(n.x, n.y)
      if (X < -margin || X > canvas.width + margin || Y < -margin || Y > canvas.height + margin) continue
      // Under somebody else's roof.  The abbey has a dozen people in it and
      // they were drawn on top of it — a row of monks standing on the tiles,
      // which reads as a crowd on the roof rather than a crowd indoors.  The
      // roof is drawn for the same reason: you are not in there.
      const roof = inRoom(n.x, n.y)
      if (roof && roof !== under) continue
      actors.push({ x: n.x, y: n.y, draw: () => drawNpc(n) })
    }
    npcsDrawn = actors.length
    actors.push({ x: hero.x, y: hero.y, draw: drawHero })
    actors.sort((a, b) => depth(b) - depth(a))
    let ai = 0

    // Only the buckets the view covers, and the view is a diamond, so its
    // world-space box is the one the tile loop already worked out.
    const near: Placed[] = []
    const bx0 = Math.floor((Math.min(...seen.map((c) => c.x)) - PATCH) / PATCH)
    const bx1 = Math.floor((Math.max(...seen.map((c) => c.x)) + PATCH) / PATCH)
    const by0 = Math.floor((Math.min(...seen.map((c) => c.y)) - PATCH) / PATCH)
    const by1 = Math.floor((Math.max(...seen.map((c) => c.y)) + PATCH) / PATCH)
    for (let bi = bx0; bi <= bx1; bi++) {
      for (let bj = by0; bj <= by1; bj++) {
        const b = buckets.get(bi * 100000 + bj)
        if (b) for (const o of b) {
          if (o.in && o.in !== under) continue
          if (o.node && !o.node.up) continue
          // Whether it is on the glass, asked *here* rather than after the
          // sort.  A bucket is 40 yards and the widest view is 350, so the
          // buckets it covers hold most of the forest: 17,663 pieces went
          // into this list and 2,463 of them were drawn, and the sort in
          // between was paying for all seventeen thousand.
          const X = screenX(o.x, o.y), Y = screenY(o.x, o.y)
          if (X < -margin || X > canvas.width + margin
            || Y < -margin || Y > canvas.height + margin) continue
          // And whether it is still a thing rather than a speck.
          //
          // The ground has had this rule from the start — it draws a coarser
          // tile once a fine one would be under sixteen pixels, which is why
          // its count is flat at every zoom — and the scenery never got one.
          // Profiling the widest zoom says why that matters: 71% of the time
          // is inside `drawImage`, four thousand calls a frame to cover 2.4
          // megapixels.  The cost is the calls, not the pixels, and the only
          // cure for calls is fewer of them.
          //
          // Under eight pixels a tree is not a tree, it is a dab of the
          // forest's colour; half of them say the same thing the other half
          // says.  Which half is decided by where the piece stands, not by
          // chance, so the same trees are kept every frame and the forest
          // does not boil when the camera moves.
          if (o.piece.h * zoom * o.s < SPECK && ((o.x * 7 + o.y * 13) & 2)) continue
          near.push(o)
        }
      }
    }
    near.sort((a, b) => depth(b) - depth(a))
    for (const o of near) {
      while (ai < actors.length && depth(actors[ai]!) > depth(o)) actors[ai++]!.draw()
      const X = screenX(o.x, o.y), Y = screenY(o.x, o.y)
      const k = zoom * o.s
      if (o.trunk) {
        const t = o.trunk
        ctx.drawImage(tilesImg, t.x, t.y, t.w, t.h, Math.round(X - (t.w * k) / 2),
          Math.round(Y - t.h * k), Math.ceil(t.w * k), Math.ceil(t.h * k))
      }
      const p = o.piece
      const lift = o.trunk ? o.trunk.h * k * 0.78 : 0
      ctx.drawImage(tilesImg, p.x, p.y, p.w, p.h, Math.round(X - (p.w * k) / 2),
        Math.round(Y - p.h * k - lift), Math.ceil(p.w * k), Math.ceil(p.h * k))
      drawn++
    }
    while (ai < actors.length) actors[ai++]!.draw()

    // --- and the hour of the day, over all of it -------------------------
    //
    // `lightAt` has returned `{ ground, tint }` since it was written and
    // nothing ever read the second one.  `ground` is the colour *behind* the
    // world, and the tiles cover the glass edge to edge, so what the night
    // used to darken was the one part of the screen nobody can see: three in
    // the morning and noon came out pixel for pixel the same picture.  This
    // repository built a gate in the pipeline — `*_DEFAULT_OK` — against
    // exactly this shape of failure, a field that is read and then dropped,
    // and it happened again on the other side of the wall.
    //
    // Multiplied rather than laid over, because a translucent grey sheet
    // makes a bright day look foggy and a dark one look grey.  Multiplying by
    // a blue keeps the greens green and takes the light out of them, which is
    // what evening does.  Night is not black: nothing in this game happens
    // after dark that you would want to be unable to see.
    if (light.tint < 1) {
      const k = 1 - light.tint
      ctx.globalCompositeOperation = 'multiply'
      ctx.fillStyle = `rgb(${Math.round(255 - 150 * k)},`
        + `${Math.round(255 - 135 * k)},${Math.round(255 - 60 * k)})`
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'source-over'
    }
    // Fireflies, which are the one thing in this forest that only exists
    // after dark.
    //
    // Fifty-one clusters of them stand in Elwynn and there is no picture for
    // one: every asset pack on this machine was searched and none has a
    // top-down butterfly, bird or firefly, and drawing one here is not
    // allowed.  But a firefly is not really a picture — it is a point of
    // light that comes and goes — and light is code.  So the client's own
    // placements are kept, and what they hold at night is a glow.
    //
    // They fade in as the light goes, which is why this lives inside the
    // tint: `1 - tint` is exactly how dark it is.
    if (light.tint >= 0.55) sparks = 0
    if (light.tint < 0.55) {
      const glow = Math.min(1, (0.55 - light.tint) / 0.35)
      ctx.globalCompositeOperation = 'lighter'
      sparks = 0
      for (const o of motes) {
        const X = screenX(o.x, o.y), Y = screenY(o.x, o.y)
        if (X < -40 || X > canvas.width + 40 || Y < -40 || Y > canvas.height + 40) continue
        // Eight to a cluster, each on its own slow circle, all of them from
        // the cluster's own position — so they neither flicker in step nor
        // take anything from the stream of chance.
        for (let i = 0; i < 8; i++) {
          const t = clock * (0.5 + (i % 3) * 0.17) + i * 2.1 + o.x * 0.07
          // In yards, not in pixels: a cluster is a couple of yards of air
          // and has to stay that whatever the camera is doing.
          const r = (1.1 + (i % 4) * 0.55) * PPY * zoom
          const bx = X + Math.cos(t) * r
          const by = Y - PPY * 0.5 * zoom + Math.sin(t * 1.3) * r * 0.45
          const lit = 0.45 + 0.55 * Math.sin(t * 2.7 + i)
          if (lit <= 0) continue
          const a = lit * glow
          // A halo and a spark.  One flat dot at this size is a pixel of
          // yellow and reads as a dead sub-pixel; what says *light* is that
          // it spills.
          ctx.fillStyle = `rgba(150,190,70,${(0.22 * a).toFixed(3)})`
          ctx.beginPath()
          ctx.arc(bx, by, Math.max(3, 5 * zoom), 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = `rgba(214,240,140,${(0.85 * a).toFixed(3)})`
          ctx.beginPath()
          ctx.arc(bx, by, Math.max(1, 1.7 * zoom), 0, Math.PI * 2)
          ctx.fill()
          sparks++
        }
      }
      ctx.globalCompositeOperation = 'source-over'
    }

    // And what is falling through it.  Derived from the same hour the sky is,
    // so it neither flickers nor touches the stream of chance: the drops are
    // a lattice sliding down the glass, which is what rain looks like at this
    // distance and costs one path.
    if (sky !== CLEAR) {
      const hard = sky === STORM ? 1 : sky === SNOW ? 0.45 : 0.7
      const t = clock * (sky === SNOW ? 40 : 900)
      const gap = sky === SNOW ? 34 : 22
      ctx.globalAlpha = 0.34 * hard
      ctx.strokeStyle = sky === SNOW ? '#e8eef5' : '#b9cbdd'
      ctx.lineWidth = sky === STORM ? 1.6 : 1
      ctx.beginPath()
      const lean = sky === SNOW ? 3 : 14
      const fall = sky === SNOW ? 6 : 20
      for (let x = -lean; x < canvas.width + gap; x += gap) {
        for (let y = -fall; y < canvas.height + fall; y += gap * 1.7) {
          const sx = x + ((t + y * 0.7) % gap)
          const sy = (y + t) % (canvas.height + fall * 2) - fall
          ctx.moveTo(sx, sy)
          ctx.lineTo(sx + lean, sy + fall)
        }
      }
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // Damage, floating off whoever took it.  Drawn over the scenery for the
    // same reason the talk prompt is: a number behind a tree is not a number.
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i]!
      const age = clock - m.at
      if (age > 1.1) { marks.splice(i, 1); continue }
      ctx.globalAlpha = Math.max(0, 1 - age / 1.1)
      ctx.font = `bold ${Math.round(13 * Math.max(1, zoom))}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'
      ctx.fillStyle = m.mine ? '#ffe9a8' : '#ff8d7a'
      const X = screenX(m.x, m.y), Y = screenY(m.x, m.y) - 34 * zoom - age * 26
      ctx.strokeText(m.text, X, Y)
      ctx.fillText(m.text, X, Y)
      ctx.globalAlpha = 1
    }
    ctx.textAlign = 'left'

    // The prompt, over whoever is in earshot.  Drawn last so no tree covers it.
    //
    // The height is `headOf`, measured off the atlas, and not a constant that
    // looked right over a townsman.
    // A body is prompted the same way, because the same key opens it.
    // A thing you could open or gather gets the same prompt a person does,
    // because it is the same key.  Only when nobody is talking to you: a
    // person in earshot wins, since a conversation is the rarer thing.
    const thing = listener || corpse() ? null : atHand()
    if (thing) {
      const w = Math.round(16 * Math.max(1, zoom))
      const X = Math.round(screenX(thing.x, thing.y))
      const Y = Math.round(screenY(thing.x, thing.y) - w * 1.6)
      ctx.font = `bold ${Math.round(11 * Math.max(1, zoom))}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(12,14,20,.82)'
      ctx.fillRect(X - w / 2, Y - w / 2, w, w)
      ctx.strokeStyle = thing.trade
        && (you.trades[thing.trade] ?? 0) < thing.skill ? '#7a6a52' : '#c9a86a'
      ctx.strokeRect(X - w / 2 + 0.5, Y - w / 2 + 0.5, w - 1, w - 1)
      ctx.fillStyle = ctx.strokeStyle
      ctx.fillText('E', X, Y + 1)
    }
    const here = listener ?? corpse()
    if (here) {
      const listener = here
      const head = headOf[listener.art]! * zoom
      const w = Math.round(16 * Math.max(1, zoom))
      const X = Math.round(screenX(listener.x, listener.y))
      const Y = Math.round(screenY(listener.x, listener.y) - head - w * 0.7)
      ctx.font = `bold ${Math.round(11 * Math.max(1, zoom))}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(12,14,20,.82)'
      ctx.fillRect(X - w / 2, Y - w / 2, w, w)
      ctx.strokeStyle = '#c9a86a'
      ctx.lineWidth = 1
      ctx.strokeRect(X - w / 2 + 0.5, Y - w / 2 + 0.5, w - 1, w - 1)
      ctx.fillStyle = '#e8e4d8'
      // A key that is not on the screen is not a prompt.  On a phone the mark
      // says only that there is something to hear; the button says how.
      ctx.fillText(pad.on ? '\u2026' : 'E', X, Y + 0.5)
    }

    // The pad last of all, over everything including the prompt.
    pad.draw(ctx, [
      { label: '공격', ready: you.target !== null || inSwing() !== null },
      { label: '대화', ready: listener !== null },
    ])

    // The help line and a conversation share the bottom of a phone, and the
    // line is about controls that are not there while somebody is talking.
    help.hidden = pad.on && chat !== null
    // And the menu goes with it.  The pad hands the screen over while somebody
    // is talking — `setBusy` — but `#micro` is DOM and knew nothing about it,
    // so five buttons that take a press floated over the answers, and a thumb
    // reaching for 뭘 가르치시오? hit 가방.
    //
    // Only on the edge, and this is not tidiness.  `hud.ts` watches the body's
    // class with a `MutationObserver` to catch the moment the scene decides it
    // is a phone, and `classList.toggle` rewrites the attribute whether or not
    // the answer changed — so writing this every frame re-laid the whole
    // interface out sixty times a second, and took `padcheck` from ninety
    // seconds to past ten minutes.
    if (talkingNow !== (chat !== null)) {
      talkingNow = chat !== null
      document.body.classList.toggle('talking', talkingNow)
    }
    if (helpFor !== pad.on) {
      helpFor = pad.on
      document.body.classList.toggle('touch', pad.on)
      // Nothing about the button: it is round, lit and says Talk on it.
      help.textContent = pad.on
        ? '끌어서 이동\n오므려서 확대'
        : 'WASD: 이동  1: 공격  E: 대화·줍기  B: 가방  G: 장비  N: 소리  C: 정보  M: 지도  `: 수치'
    }

    acc += dt; frames++
    if (acc > 0.5) { fps = frames / acc; frames = 0; acc = 0 }
    // Every row keeps its own tail — the part in brackets — because a phone is
    // forty columns wide and the longest of these was seventy-two.  Dropping
    // the tails rather than whole rows keeps the readout the same readout,
    // which is the point of reading it on the device it looks wrong on.
    const tail = (t: string) => (pad.on ? '' : t)
    readout([
      ['지면', `${tilesDrawn.toLocaleString()}타일`],
      ['지물', `그린 것 ${drawn.toLocaleString()} / ${placed.length.toLocaleString()}` +
        tail(`  (막는 것 ${solids.length})`)],
      ['주민', `그린 것 ${npcsDrawn} / ${npcs.length}, ${kindCount}종` +
        tail(`  (${settled} 뭍으로, ${afloat} 물속)`) +
        (unplaceable ? `  ${unplaceable} 그림 없음` : '')],
      ['주인공', `(${hero.x.toFixed(0)}, ${hero.y.toFixed(0)})  지면 ${heroZ.toFixed(1)}야드` +
        (wetAt(hero.x, hero.y) ? '  [물속]'
          : solidAt(hero.x, hero.y) ? '  [안쪽]'
            : stepAt(hero.x, hero.y) > CLIFF ? '  [바위 위]' : '')],
      // A count and a particle is a sentence — "74이 할 말이 있음", which is
      // wrong, because a number agrees with how it is read and 74 is 칠십사.
      // A readout wants the ratio anyway, and a ratio needs no particle.
      ['대화', `할 말 있는 이 ${talkers} / ${npcs.length}` +
        (chat ? tail(`  [대화 중 — ${chat.speech.who}]`)
          : listener ? tail(pad.on ? '' : '  [E로 대화]') : '')],
      ['체력', you.died ? '쓰러짐 — 곧 일어남'
        : `${Math.round(you.hp)} / ${you.max}  (${you.level}레벨, ` +
          `경험치 ${you.xp}/${LADDER[you.level - 1] ?? '—'})` +
          (you.target ? tail(`  [${nameOf(you.target.kind)} ${you.target.hp}]`)
            : tail(inSwing() ? '  [스페이스로 공격]' : ''))],
      ['시야', `${(canvas.width / (PPY * zoom)).toFixed(0)}야드  배율 ${zoom.toFixed(2)}`],
      // Which of the two worlds this is.  There was a line here already and
      // it said "보간", which is true and told nobody anything: a whole round
      // went on "the roads are missing" from a page that has no road data in
      // it and cannot have any.  The zone line says it too, where it is always
      // on screen.
      ['지형', MADE_UP
        ? '합성 — 아제로스코어 스폰에서 보간, 지면 페인트·구역 없음'
        : '클라이언트 .adt — 높이·지면·구역'],
      ['프레임', `초당 ${fps.toFixed(0)}`],
    ])
    // --- the interface ---
    const foe = you.target
    ui.setMe({
      name: '주인공', level: you.level, hp: you.hp, max: you.max,
      icon: 'sbed/health-normal.svg', foe: false,
    })
    ui.setFoe(foe ? {
      name: nameOf(foe.kind), level: foe.level, hp: foe.hp, max: foe.max,
      icon: foe.art.startsWith('townsfolk') || foe.art.startsWith('guard')
        || foe.art.startsWith('bandit')
        ? 'delapouite/sword-brandish.svg' : 'lorc/wolf-head.svg',
      foe: fightable(foe.fight),
    } : null)
    if (clock - mapAt > 0.25) { mapAt = clock; paintMap() }
    // Which world this is, said out loud.  There are two — the client's own
    // terrain, which cannot be committed, and the one `synth_terrain.py`
    // builds out of AzerothCore alone — and nothing on the screen said which
    // you were looking at.  A whole round of "the roads are missing" was spent
    // on a page that has no road data in it and never could: the deployed
    // build has no client bake, so it serves the synthesised world, and the
    // ground paint a road lives in comes out of `.adt` alpha maps only.
    // Indoors is its own place.  Standing on a building's own floor — not
    // merely inside its outline, which would put its courtyard indoors — the
    // area is the one `WMOAreaTable` gives the building, so walking through
    // the abbey's door changes what this says.
    const roofed = inBuilding(hero.x, hero.y, 0)
    const zone = (roofed?.floor && roofed.b.area)
      || areaOf(hero.x, hero.y)
    // And what the sky is doing, because a readout with a clock in it that
    // never mentions the weather is a clock in a room with no windows.
    // The same sky the glass is showing, and not a second sum over a third
    // clock.  This asked `skyAt` again with `new Date()` while the scene asked
    // it with `frozen ?? new Date()`, so the word and the weather were two
    // different answers to one question — the same shape of bug as the bar
    // drawing one key and the keyboard reading another.
    const overhead = SKY_WORD[sky] ?? ''
    // The plate under the minimap says where you are.  The coordinates on the
    // end of it are a developer's number and the readout already carries them
    // — `주인공 (x, y)` — and on a phone the plate is 118 pixels wide, which
    // 노스샤이어 계곡 -8950, -132 wraps onto three lines of.  So the phone
    // gets the place and the weather, which is what that game's plate says.
    ui.setWhere(`${zoneOf(zone, inside(zone))}${MADE_UP ? ' · 합성' : ''}`
      + `${overhead ? ` · ${overhead}` : ''}`
      + (pad.on ? '' : `  ${hero.x.toFixed(0)}, ${hero.y.toFixed(0)}`),
      // The same clock the sky reads.  This was `new Date()` and the sky was
      // `frozen ?? new Date()`, so the moment a check held the hour still the
      // two disagreed — and the note in `shotcheck` about fixing the time to
      // fix the light was only half true.
      today.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }))
    // The swing, as the only timer in the game.  Full when it is ready.
    // Empty when there is nothing to swing at.  Full meant "ready", which on
    // a gold bar reads as a bar that is full of something.
    ui.setSwing(you.target
      ? 1 - Math.max(0, (you.next - clock * 1000) / you.line[SWING]!) : 0)
    ui.setOfTarget(you.target
      ? (you.target.angry ? '→ 주인공' : '→ 아무도 아님') : null)
    ui.setMicro([
      { key: 'C', label: '정보', on: sheetOpen, use: () => { sheetOpen = !sheetOpen } },
      { key: 'B', label: '가방', on: bagOpen, use: () => { bagOpen = !bagOpen } },
      { key: 'N', label: '소리', on: !muteIsOn(), use: () => mute(!muteIsOn()) },
      { key: 'M', label: '지도', on: mapOpen, use: () => {
        mapOpen = !mapOpen
        if (mapOpen && !mapDrawn) { paintWorld(); mapDrawn = true }
      } },
      { key: '`', label: '수치', on: !hud.hidden, use: () => { hud.hidden = !hud.hidden } },
    ])
    // The map, and the mark on it.  The mark is a DOM element rather than a
    // pixel on the canvas so the picture stays the picture: it is drawn once
    // and never touched again.
    if (mapOpen) {
      const [mx, my] = onWorld()
      ui.setWorld(true, '엘윈 숲',
        `${hero.x.toFixed(0)}, ${hero.y.toFixed(0)}   ·   M이나 Esc로 닫기`)
      ui.setPin(mx / H, my / W)
    } else {
      ui.setWorld(false, '', '')
    }
    // What the seating rule shut.  The original's `UIPanelWindows` says the
    // gossip window will not share the left place with anybody, so opening a
    // conversation closes the character sheet rather than printing itself
    // through it — which is what it used to do, at 88% alpha.
    for (const gone of ui.evicted()) {
      if (gone === 'sheet') sheetOpen = false
      if (gone === 'world') mapOpen = false
      if (gone === 'talk') endTalk()
    }
    ui.setSheet(sheetOpen, [
      ['레벨', `${you.level}`],
      ['경험치', `${you.xp} / ${LADDER[you.level - 1] ?? '—'}`],
      ['생명력', `${Math.round(you.hp)} / ${you.max}`],
      ['공격력', `${you.line[LO]} – ${you.line[HI]}  (${(you.line[SWING]! / 1000).toFixed(1)}초)`],
      ['방어도', `${you.line[ARMOUR]}  (피해 ${Math.round(mitigate(you.line[ARMOUR]!, you.level) * 100)}% 감소)`],
      ['힘·민첩·체력', statsAt(you.level).slice(0, 3).join(' · ')],
      // The slot is the word.  It used to be slot *and* class — 무기 무기,
      // 속옷 방어구 — which is a label saying the same thing twice, and the
      // second half was the only thing on the sheet that knew the outfit
      // existed at all.
      ['입은 것', Object.entries(gear).length
        ? Object.entries(gear).map(([slot]) => SLOT_WORD[slot] ?? slot).join(', ')
        : `없음  (가진 것 ${held.length}, G로 입는다)`],
      ['지갑', coin(you.purse)],
      ['처치', `${you.kills}`],
      // What the run was, once it is over.  A ceiling that says nothing when
      // you reach it is a number nobody notices arriving — and the character
      // growth page warned that level ten would be exactly that.
      ...(you.finished ? [
        ['—', '노스샤이어에서 할 일은 여기까지다'],
        ['걸린 시간', `${Math.max(1, Math.round((Date.now() - you.born) / 60000))}분`],
        ['마친 일거리', `${log.done.size}`],
        ['다음', '특성. 다음 슬라이스의 첫 항목이다'],
      ] as [string, string][] : []),
    ], paintDoll() ?? undefined)
    ui.setXp(you.xp, LADDER[you.level - 1] ?? 0, you.level)
    ui.setBag(bagOpen, coin(you.purse),
      Object.entries(you.bag)
        .map(([w, [n, worth]]) =>
          [goodsOf(w), n, coin(worth)] as [string, number, string])
        .sort((a, b) => b[1] - a[1]))
    // Twelve squares, because that is how many the bar has.  Ten of them are
    // empty and they are drawn empty: a bar that grows as you learn things is
    // a bar that moves under your thumb, and the two that do something are in
    // the same place they will always be.
    const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=']
    // Twelve squares: attack takes the first key, talk takes `E` because it
    // is a verb and not an ability, and the ten in between are the abilities
    // in the order they are learned.  Ten is exactly what a warrior can hold
    // by level ten, which is where this game ends.
    const SPELL_KEYS = KEYS.slice(1, 11)
    // One table, read twice: the letter drawn on a square and the key that
    // presses it come out of the same place.  They used to be worked out
    // separately — the bar drew `KEYS[i + 2]` and the keyboard did
    // `spells[slot - 2]` — so every square was labelled one higher than the
    // key that used it, `2` did nothing on the bar and everything on the
    // keyboard, and the last thing learned had no key at all because the bar
    // drew out to `=` and the handler stopped at `9`.
    squares = [
      {
        key: '1', label: '공격', icon: 'lorc/broadsword.svg',
        tip: `공격  —  ${you.line[LO]}–${you.line[HI]} 피해\n`
          + `${(you.line[SWING]! / 1000).toFixed(1)}초마다 한 번\n`
          + (you.target ? `대상: ${nameOf(you.target.kind)}`
            : inSwing() ? '가장 가까운 적을 친다' : '닿는 곳에 적이 없다'),
        use: () => { if (!chat && !you.died) you.target = you.target ?? inSwing() },
        // The shutter falls as the swing comes back, so a full square is a
        // swing you have not taken rather than one you cannot.
        cooling: you.target
          ? Math.max(0, (you.next - clock * 1000) / you.line[SWING]!) : 0,
        live: you.target !== null || inSwing() !== null,
      },
      {
        key: 'E', label: '대화', icon: 'skoll/talk.svg',
        tip: chat ? '대화를 끝낸다'
          : corpse() ? `${nameOf(corpse()!.kind)}의 주머니를 뒤진다`
            : listener ? `${nameOf(listener.kind)}에게 말을 건다`
              : '말을 걸 사람도 뒤질 것도 없다',
        use: () => toggleTalk(),
        cooling: 0, live: listener !== null || chat !== null || corpse() !== null,
      },
      ...spells.map((sp, i) => {
        const [word, what] = abilityOf(sp.id)!
        const stop = why(sp)
        const ready = you.cools[sp.id] ?? 0
        return {
          key: SPELL_KEYS[i] ?? '', label: word,
          icon: ICON_OF[sp.id] ?? 'lorc/sword-slice.svg',
          tip: `${word}  —  분노 ${sp.rage}\n${what}`
            + (sp.cool ? `\n재사용 ${(sp.cool / 1000).toFixed(0)}초` : '')
            + (sp.gcd ? `\n전역 대기 ${(gcdOf(sp) / 1000).toFixed(1)}초`
              : '\n다음 공격에 실린다')
            + (stop ? `\n${stop}` : ''),
          use: () => { if (!chat) cast(sp) },
          // The shutter falls for whichever wait is longer, so the global one
          // is visible on every square it applies to rather than nowhere.
          cooling: Math.max(
            sp.cool ? Math.max(0, (ready - clock) / (sp.cool / 1000)) : 0,
            sp.gcd ? Math.max(0, (you.gcd - clock) / (gcdOf(sp) / 1000)) : 0),
          live: stop === null,
        }
      }),
      ...SPELL_KEYS.slice(spells.length).map((key) => ({
        key, label: '', icon: '', tip: '', cooling: 0, live: false,
      })),
    ]
    ui.setBar(squares)
    // And the keyboard reads the same table.  Lower-cased because `E` is
    // drawn on a square and typed in lower case, and only the squares that do
    // something go in — an empty one has no `use`.
    pressable.clear()
    for (const sq of squares) if (sq.use) pressable.set(sq.key.toLowerCase(), sq.use)
    ui.setRage(you.rage, MAX_RAGE)
    ui.setAuras('me', you.shout && you.shout.until > clock
      ? [{ icon: 'lorc/shouting.svg', left: you.shout.until - clock,
           text: `외침  —  공격력 +${you.shout.ap}` }]
      : [])
    ui.setAuras('foe', you.target?.bleed
      ? [{ icon: 'lorc/bleeding-wound.svg', left: you.target.bleed.until - clock,
           text: `찢기  —  3초마다 ${you.target.bleed.each}` }]
      : [])

    ;(window as unknown as { __ready: boolean }).__ready = true
    requestAnimationFrame(frame)
  }
  /**
   * Put the character back, and keep putting him down.
   *
   * Loaded before the first frame so nothing is drawn at the wrong place, and
   * written every few seconds and on the way out — `visibilitychange` rather
   * than `beforeunload`, because on a phone the tab is very often not closed
   * so much as left.
   */
  const loaded = await readSave().catch(() => null)
  if (loaded) {
    const fresh = migrate(loaded)
    if (!fresh) {
      ui.log('예전 저장을 읽을 수 없다. 처음부터 시작한다.', 'note')
      await wipeSave().catch(() => {})
    } else if (fresh.world && worldHash && fresh.world !== worldHash) {
      // A different bake: the ids in the save may point at other things now.
      ui.log('세계가 다시 구워졌다. 저장을 버리고 처음부터 시작한다.', 'note')
      await wipeSave().catch(() => {})
    } else {
      restore(fresh)
      // What the time away was worth.  Four times as much if the tab was
      // closed in an inn, which is the only reason it matters where you stop.
      const away = Math.max(0, (Date.now() - (fresh.at ?? Date.now())) / 1000)
      const banked = Math.min(restCap(),
        you.rest + restFor(away, !!fresh.you.restedIn))
      const gained = Math.round(banked - you.rest)
      you.rest = banked
      ui.log(`${you.level}레벨로 이어서 시작한다.`, 'note')
      if (gained > 0) {
        ui.log(fresh.you.restedIn
          ? `여관에서 쉬었다. 휴식 경험치 ${gained}`
          : `쉬는 동안 휴식 경험치 ${gained}`, 'gain')
      }
    }
  }
  let saved = 0
  const keep = () => { writeSave(snapshot()).catch(() => {}) }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') keep()
  })
  window.addEventListener('pagehide', keep)

  requestAnimationFrame(frame)

  /**
   * Ask the game what it thinks of a point.
   *
   * Written because a test that recomputes the slope for itself is testing its
   * own arithmetic: the first attempt at a cliff check found a steep cell by
   * reading the height grid directly, walked at it, and watched the player
   * stroll through — because the game samples a bilinear field at tile spacing
   * and the test had sampled the raw grid.  Both numbers were right.  They were
   * answers to different questions.
   */
  ;(window as unknown as { __probe: (x: number, y: number) => unknown }).__probe = (x, y) => ({
    z: groundAt(x, y), slope: slopeAt(x, y), step: stepAt(x, y),
    area: areaOf(x, y), paint: paintAt(x, y),
    built: !!inBuilding(x, y),
    // What the ground loop would actually paint here, rather than the raw
    // bit: a hole a building has floored over is not a hole on screen.
    hole: openHole(x, y),
    /** Whether a building lays its own floor here, which closes a hole. */
    floor: !!inBuilding(x, y)?.floor,
    wet: wetAt(x, y), solid: solidAt(x, y), blocked: blocked(x, y), cliff: CLIFF,
  })

  /** The scenery's depth keys in draw order, for the check that they sort. */
  ;(window as unknown as { __order: () => number[] }).__order = () => placed.map(depth)

  /**
   * What the scenery is made of, and how much of it knows it is indoors.
   *
   * A building's own furniture is only hidden from outside when the scene can
   * tell which room it belongs to, and it works that out by asking whether
   * the piece stands inside a building's footprint.  When the indoor list
   * grew from a hundred and fifty pieces to three thousand, that answer
   * started mattering: a bookshelf that does not know it is in a house is a
   * bookshelf in the road.
   */
  ;(window as unknown as { __motes: () => unknown }).__motes = () => ({
    n: motes.length, lit: sparks,
  })
  ;(window as unknown as { __scenery: () => unknown }).__scenery = () => {
    const out: Record<string, [number, number]> = {}
    for (const o of placed) {
      const row = out[o.kind ?? '?'] ?? (out[o.kind ?? '?'] = [0, 0])
      row[0]++
      if (o.in) row[1]++
    }
    return out
  }

  /** Where a world point lands on the glass — asked by the movement check. */
  ;(window as unknown as { __screen: (x: number, y: number) => unknown }).__screen =
    (x, y) => ({ x: screenX(x, y), y: screenY(x, y) })

  /** Where the hero is drawn, which is not the middle once the camera lifts. */
  ;(window as unknown as { __heroScreen: () => unknown }).__heroScreen = () =>
    ({ x: screenX(hero.x, hero.y), y: screenY(hero.x, hero.y) })

  /** The pad's geometry and state, for the check that drives it with fingers. */
  ;(window as unknown as { __pad: () => unknown }).__pad = () => ({
    on: pad.on, ...pad.view(), ...layoutFor(canvas.width, canvas.height),
  })

  /** Where each kind's head is, in pixels over its feet — see `headOf`. */
  ;(window as unknown as { __heads: () => unknown }).__heads = () => headOf

  /** One of every kind that has nothing to say, for reading those lines too. */
  ;(window as unknown as { __idleSpeech: () => unknown }).__idleSpeech = () => {
    const seen = new Set<string>()
    return npcs.filter((n) => !n.topic && !seen.has(n.kind + n.role) && seen.add(n.kind + n.role))
      .map((n) => speak(n.kind, n.role, n.level, n.seed, null, () => []))
  }

  /** Every line the slice can say, so the writing can be read in one go. */
  ;(window as unknown as { __speech: () => unknown }).__speech = () =>
    npcs.filter((n) => n.topic).map((n) =>
      speak(n.kind, n.role, n.level, n.seed, n.topic, () => directionsFrom(n)))

  /** What is alive, and where the nearest of it is — asked by the tests. */
  ;(window as unknown as { __npcs: (x?: number, y?: number) => unknown }).__npcs = (x, y) => {
    const kinds: Record<string, number> = {}
    for (const n of npcs) kinds[n.art] = (kinds[n.art] ?? 0) + 1
    let near: { art: string; d: number; x: number; y: number } | null = null
    if (x !== undefined && y !== undefined)
      for (const n of npcs) {
        const d = Math.hypot(n.x - x, n.y - y)
        if (!near || d < near.d) near = { art: n.art, d, x: n.x, y: n.y }
      }
    // `wet` and `inside` are how a settle that did not take shows up: both
    // should be zero, and a cat standing on a lake is the visible form of a
    // number that is not.
    return {
      total: npcs.length, unplaceable, settled, afloat, kinds, near,
      wet: npcs.filter((n) => wetAt(n.x, n.y)).length,
      inside: npcs.filter((n) => solidAt(n.x, n.y)).length,
    }
  }

  // The whole cast, for the behaviour tests: whether anybody wandered, whether
  // the ones behind a counter stayed at it, whether anybody left their patch.
  ;(window as unknown as { __all: () => unknown }).__all = () =>
    npcs.map((n) => ({
      x: n.x, y: n.y, hx: n.hx, hy: n.hy, art: n.art, r: n.r, wander: n.wander,
      kind: n.kind, level: n.level,
      stance: aggressive(n.fight) ? 'enemy'
        : fightable(n.fight) ? 'quarry' : 'friend',
    }))
  ;(window as unknown as { __hero: () => unknown }).__hero = () => ({ x: hero.x, y: hero.y })
  /** The errands, and how far along they are — for the check that walks one. */
  /**
   * Whether a roof is drawn at this point, for the check on the cutaway.
   *
   * Not `inBuilding` alone: the answer depends on where the player is, which
   * is the whole point of it.
   */
  ;(window as unknown as { __roofAt: (x: number, y: number) => boolean })
    .__roofAt = (x, y) => {
      // At the plan's own grain, like the probe beside it: a floor cell a yard
      // from a wall is floor, and only the tile that draws it widens the wall
      // to its own size.
      const got = inBuilding(x, y, 0)
      return !!got && got.b !== inRoom(hero.x, hero.y)
    }
  /** Inside a building's footprint, for the check that the plan is the plan. */
  ;(window as unknown as { __inside: (x: number, y: number) => boolean })
    .__inside = (x, y) => !!inRoom(x, y)
  /**
   * The three answers a building's plan gives about one spot, for the checks:
   * is it in the outline at all, is it stone, and can you stand on it.
   */
  ;(window as unknown as {
    __plotAt: (x: number, y: number) => { wall: boolean; floor: boolean } | null
  }).__plotAt = (x, y) => {
    const got = inBuilding(x, y, 0)
    return got ? { wall: got.wall, floor: got.floor } : null
  }
  /** What the readout says at a spot, for the check that indoors is a place. */
  ;(window as unknown as { __whereAt: (x: number, y: number) => string })
    .__whereAt = (x, y) => {
      const got = inBuilding(x, y, 0)
      const a = (got?.floor && got.b.area) || areaOf(x, y)
      return zoneOf(a, inside(a))
    }
  /**
   * The world's objects and what it takes to open one, for the checks.
   *
   * `take` walks the player to the nearest standing one of a kind and presses
   * the key, which is the only way to find out that gathering works.
   */
  ;(window as unknown as { __things: () => unknown }).__things = () => ({
    total: nodes.length,
    up: nodes.filter((n) => n.up).length,
    gather: nodes.filter((n) => n.trade).length,
    pools: byPool.size,
    trades: { ...you.trades },
    bag: { ...you.bag },
  })
  /** And the hardest one, which is what says a lock can refuse. */
  ;(window as unknown as { __refused: (kind: string) => unknown })
    .__refused = (kind) => {
      const want = nodes.filter((n) => n.up && n.kind === kind && n.haul.length)
        .sort((a, b) => b.skill - a.skill)
      if (!want.length || !want[0]!.skill) return null
      const n = want[0]!
      return { skill: n.skill, got: gather(n), up: n.up }
    }
  ;(window as unknown as { __take: (kind: string) => unknown }).__take = (kind) => {
    // The easiest standing one, which is the one a new player meets: the
    // slice reaches into four zones and its hardest node wants 270 of a trade.
    const want = nodes.filter((n) => n.up && n.kind === kind && n.haul.length)
      .sort((a, b) => a.skill - b.skill)
    if (!want.length) return null
    const n = want[0]!
    placeHero(n.x - 1, n.y)
    camX = hero.x; camY = hero.y
    const before = { ...you.trades }
    const got = gather(n)
    return { kind, trade: n.trade, skill: n.skill, got, before,
      after: { ...you.trades }, up: n.up, due: n.due }
  }
  /** Every area the slice has, with whose it is and what we call it. */
  ;(window as unknown as { __areas: () => unknown }).__areas = () =>
    AREA_IDS.map((a) => ({ id: a, inside: inside(a), name: zoneOf(a, inside(a)),
      level: meta.areaLevel?.[String(a)] ?? 0 }))
  /** Where the client took the floor out, for the check that you cannot walk in. */
  ;(window as unknown as { __gaps: () => [number, number][] }).__gaps = () =>
    (meta.gaps ?? []).map(([i, j]) => [x0 - i * U, y0 - j * U])
  /** Whether a hole here is a building's floor rather than a way down. */
  ;(window as unknown as { __floored: (x: number, y: number) => boolean })
    .__floored = (x, y) => floored(x, y)
  /** And whether this spot is one of them. */
  ;(window as unknown as { __holeAt: (x: number, y: number) => boolean })
    .__holeAt = (x, y) => holeAt(x, y)
  /** Whether a step on to this spot is refused, for the wall check. */
  ;(window as unknown as { __wallAt: (x: number, y: number) => boolean })
    .__wallAt = (x, y) => wallAt(x, y)
  /** How many of the placed pieces stand inside a building. */
  ;(window as unknown as { __indoors: () => number }).__indoors = () =>
    placed.filter((o) => o.in).length
  /** The buildings, for the check that a box is not drawn as a floor. */
  ;(window as unknown as { __buildings: () => unknown }).__buildings = () =>
    buildings.map((b) => ({ x: b.x, y: b.y, l: b.l, w: b.w, k: b.k,
      c: b.c, s: b.s, area: b.area }))
  /**
   * Who the player is right now and what a thousand swings come out as.
   *
   * The hit table is the one thing in this game that cannot be checked by
   * looking: a roll is a roll.  So the check rolls it a great many times and
   * asks whether the shape is the shape — some misses, some dodges, some
   * crits, and a total that adds to one.
   */
  ;(window as unknown as { __me: () => unknown }).__me = () => ({
    level: you.level, hp: you.max, armour: you.line[ARMOUR],
    damage: [you.line[LO], you.line[HI]], swing: you.line[SWING],
    stats: statsAt(you.level),
    crit: who ? critChance(you.level, statsAt(you.level), who) : 0,
    dodge: who ? dodgeChance(you.level, statsAt(you.level), who) : 0,
    spells: spells.map((sp) => ({ id: sp.id, level: sp.level })),
    ceiling: who?.levels?.[1] ?? 0,
  })
  ;(window as unknown as {
    __swings: (against: number, n: number) => Record<string, number>
  }).__swings = (against, n) => {
    const out: Record<string, number> = {}
    const mine = statsAt(you.level)
    for (let i = 0; i < n; i++) {
      const fate = rollMelee(
        { level: you.level, crit: who ? critChance(you.level, mine, who) : 5,
          humanoid: true },
        { level: against, dodge: CREATURE_DODGE, parry: CREATURE_PARRY_HUMANOID,
          block: CREATURE_BLOCK },
        roll() * 10000)
      const word = OUTCOME_WORD[fate] ?? 'hit'
      out[word] = (out[word] ?? 0) + 1
    }
    return out
  }
  /**
   * How a fight actually goes, run in the fight's own arithmetic.
   *
   * The wiki's own check list asks whether pulling two is measurably worse
   * than pulling one, and nothing here could answer it: the fight lives in the
   * frame loop.  This runs the same functions — the hit table, the armour
   * curve, the swing timers — over a synthetic clock, so the answer comes out
   * of the rules rather than out of a guess.
   */
  /**
   * How a fight actually goes, run in the fight's own arithmetic.
   *
   * The wiki's check list asks whether taking two is worse than taking one and
   * nothing could answer it, because the fight lived in the frame loop.  It
   * lives in `src/sim/duel.ts` now, which `scripts/simcheck.mjs` runs in Node
   * with no browser at all — so this is the *same* fight rather than a second
   * one that is supposed to agree with it.
   */
  ;(window as unknown as {
    __duel: (level: number, many: number, runs: number, mineLevel?: number,
      policy?: string) => unknown
  }).__duel = (level, many, runs, mineLevel, policy) => {
    const lv = mineLevel ?? you.level
    const foe = (spawns.npcs ?? []).find((r) => r[4] === level && (r[7] ?? -1) >= 0)
    const line = foe ? spawns.fights?.[foe[7]!] : null
    const opener = spells.find((sp) => sp.id === 78)
    return duel(
      { level: lv, stats: statsAt(lv), line: lineFor(lv) },
      { level, stats: statsAt(1), line: line ?? [60, 3, 5, 2000, 20, 2] },
      who,
      { many, runs, policy: policy === 'rota' ? 'rota' : 'auto',
        ...(opener ? { opener: {
          rage: opener.rage,
          adds: opener.does.find((d) => d[0] === E_WEAPON_ADD)?.[1] ?? 0,
        } } : {}) })
  }

  /** What is for sale and what is taught nearby, and buying and learning it. */
  ;(window as unknown as { __shop: (entry: number) => unknown }).__shop =
    (entry) => ({
      stock: (shelf.stock?.[String(entry)] ?? []).map(([id]) => ({
        id, price: itemOf(id!)?.[I_BUY], slot: itemOf(id!)?.[I_SLOT],
      })),
      teaches: (shelf.trainers?.[String(entry)]?.teaches ?? [])
        .map(([id, cost, need]) => ({ id, cost, need })),
    })
  ;(window as unknown as { __buy: (id: number) => unknown }).__buy = (id) => {
    const it = itemOf(id)
    if (!it) return null
    you.purse += it[I_BUY] as number
    const was = { purse: you.purse, held: held.length }
    you.purse -= it[I_BUY] as number
    held.push(id)
    return { was, purse: you.purse, held: held.length }
  }
  /**
   * The bar, as the screen has it, plus what the last press asked for.
   *
   * Both halves are here on purpose: the bug this exists to catch was that
   * the letter drawn on a square and the key that fired it came from two
   * different sums, so reading either one alone said nothing.
   */
  /** How often the weapon slot came up empty — see `bordercheck`. */
  ;(window as unknown as { __barehanded: () => number }).__barehanded =
    () => barehanded
  /** Which worn slots the paperdoll has no picture for. */
  ;(window as unknown as { __undrawn: () => string[] }).__undrawn =
    () => [...dollMissing]
  ;(window as unknown as { __bar: () => unknown }).__bar = () => ({
    squares: squares.map((sq) => ({ key: sq.key, label: sq.label, filled: !!sq.icon })),
    spells: spells.map((sp) => sp.id),
    asked,
  })
  ;(window as unknown as { __learn: (id: number) => unknown }).__learn = (id) => {
    const had = spells.length
    // Refused rather than quietly dropped a second time.  A trainer used to
    // be able to take money for a spell this character can never hold — the
    // id went into `taught` and `known()` filtered it out again on the way
    // back, so the purse was lighter and the bar was the same.  The bake no
    // longer offers them; this is the other end of the same rule.
    if (!abilityOf(id)) return { had, now: had, refused: id }
    taught.push(id)
    spells = known(you.level)
    return { had, now: spells.length, taught: [...taught] }
  }
  ;(window as unknown as { __dress: () => unknown }).__dress = () => {
    const was = { hp: you.max, armour: you.line[ARMOUR], swing: you.line[SWING],
      stats: statsAt(you.level).slice(0, 3) }
    const said = dressUp()
    return { was, said, now: { hp: you.max, armour: you.line[ARMOUR],
      swing: you.line[SWING], stats: statsAt(you.level).slice(0, 3),
      worn: Object.keys(gear) } }
  }
  /** Kill the player outright, for the check that dying costs a walk. */
  ;(window as unknown as { __die: () => unknown }).__die = () => {
    const was = { x: hero.x, y: hero.y, hp: you.hp }
    you.hp = 0; you.died = clock - 5
    fighting()
    return { was, now: { x: hero.x, y: hero.y, hp: you.hp, max: you.max },
      walked: Math.hypot(hero.x - was.x, hero.y - was.y) }
  }
  /** The save, round-tripped, for the check that closing the tab costs nothing. */
  ;(window as unknown as { __save: () => unknown }).__save = () => snapshot()
  ;(window as unknown as { __load: (s: Save) => unknown }).__load = (raw) => {
    restore(raw)
    return { level: you.level, xp: you.xp, purse: you.purse,
      x: hero.x, y: hero.y, seed: seed() }
  }
  /**
   * Freeze the clock, for the check that compares pictures.
   *
   * The sky is derived from the time of day, so a screenshot taken at dusk is
   * a different screenshot — and a reference image that only matches between
   * noon and four is a reference nobody trusts.
   */
  ;(window as unknown as { __clock: (at: Date) => void }).__clock = (at) => {
    frozen = at
  }
  /** What the sky is doing, and what it was doing hour by hour, for the check. */
  /**
   * Hold the weather still, the way `__clock` holds the hour.
   *
   * Elwynn is wet about a sixth of the time, so a check that waits for rain
   * is a check that fails five runs in six.  `null` gives it back to the
   * hour.
   */
  ;(window as unknown as { __weather: (s: number | null) => boolean })
    .__weather = (s) => { forcedSky = s; return true }
  ;(window as unknown as { __sky: () => unknown }).__sky = () => {
    const zone = areaOf(hero.x, hero.y)
    const chances = who?.weather?.[String(zone)]
      ?? who?.weather?.[String(inside(zone))]
    const day: number[] = []
    const base = new Date()
    for (let h = 0; h < 24 * 30; h++) {
      day.push(skyAt(chances, new Date(base.getTime() + h * 3_600_000)))
    }
    const noon = lightAt(new Date(2026, 5, 21, 12), 0)
    const night = lightAt(new Date(2026, 5, 21, 2), 0)
    return {
      zones: Object.keys(who?.weather ?? {}).length,
      chances, now: skyAt(chances, base),
      wet: day.filter((s) => s > 0).length / day.length,
      // Asked twice for the same hour: it is derived, not rolled.
      steady: skyAt(chances, base) === skyAt(chances, base),
      noon: noon.tint, night: night.tint,
    }
  }
  /**
   * Where the server itself walks things, against where we say a body can be.
   *
   * The climbing limit is a measurement rather than a guess — the steepest of
   * `waypoint_data`'s 3,954 legs — but that is still *reading walkability off
   * a picture*, which is the mistake this repository keeps finding.  The
   * honest cross-check needs the navigation mesh the server actually uses, and
   * building it is 2.2 GB of Recast (issue 93).
   *
   * This is the cheap half and it is not nothing: every point of every patrol
   * in the slice, and every spawn, asked whether *we* would let a body stand
   * there.  The server put them all there, so every refusal is ours.
   */
  ;(window as unknown as { __navcheck: () => unknown }).__navcheck = () => {
    const routes = spawns.patrols ?? []
    // Why each refusal, because "a quarter of the server's own spawns are on
    // ground we refuse" is a number and not a diagnosis.  Somebody standing
    // beside somebody else is refused by `npcAt`, which is a rule about
    // walking through a person and not a claim about the ground.
    const why = (x: number, y: number) => {
      if (onSpan(x, y)) return ''
      if (stepAt(x, y) > CLIFF) return 'slope'
      if (wetAt(x, y)) return 'water'
      if (closedAt(x, y)) return 'closed'
      if (openHole(x, y)) return 'hole'
      if (wallAt(x, y)) return 'wall'
      if (solidAt(x, y)) return 'scenery'
      if (npcAt(x, y, null)) return 'somebody'
      return ''
    }
    const tally = (out: Record<string, number>, k: string) => {
      if (k) out[k] = (out[k] ?? 0) + 1
      return out
    }
    let legs = 0
    const onRoute: Record<string, number> = {}
    for (const route of routes) {
      for (const [x, y] of route) { legs++; tally(onRoute, why(x!, y!)) }
    }
    const standing = npcs.filter((n) => !n.dead)
    const atRest: Record<string, number> = {}
    for (const n of standing) tally(atRest, why(n.x, n.y))
    const count = (o: Record<string, number>) =>
      Object.values(o).reduce((a, b) => a + b, 0)
    // The ground's own verdict, with the two rules that are about bodies
    // rather than about ground taken out.
    const groundOnly = (o: Record<string, number>) =>
      count(o) - (o['somebody'] ?? 0) - (o['wall'] ?? 0)
    return {
      routes: routes.length, legs, onRoute, refusedOnRoute: count(onRoute),
      groundOnRoute: groundOnly(onRoute),
      spawns: standing.length, atRest, refusedAtRest: count(atRest),
      groundAtRest: groundOnly(atRest),
      cliff: CLIFF,
    }
  }
  /** Whether the slice is over, and what the run came to. */
  ;(window as unknown as { __ending: () => unknown }).__ending = () => ({
    level: you.level, ceiling: who?.levels?.[1] ?? 0,
    finished: you.finished > 0, kills: you.kills, quests: log.done.size,
    purse: you.purse, rest: you.rest, restCap: restCap(),
  })
  /** The quests that finish by walking somewhere, and doing it. */
  ;(window as unknown as { __walkTo: () => unknown }).__walkTo = () => {
    const spots = [...log.all.values()].filter((q) => q.walk?.length)
    if (!spots.length) return { quests: 0 }
    const q = spots[0]!
    take(log, q)
    const before = short(log, log.held.find((h) => h.id === q.id)!)
    const [x, y] = q.walk![0] as number[]
    placeHero(x!, y!)
    camX = x!; camY = y!
    const reached = walked(log, hero.x, hero.y).length
    return { quests: spots.length, id: q.id, places: q.walk!.length,
      before, reached,
      after: short(log, log.held.find((h) => h.id === q.id)!) }
  }
  /** What a drop needs before it drops, for the check that `conditions` bites. */
  ;(window as unknown as { __gated: () => unknown }).__gated = () => {
    const gated: { entry: number; item: number; quest: number }[] = []
    for (const n of npcs) {
      for (const row of n.haul?.[2] ?? []) {
        const need = (row as number[])[6] ?? 0
        if (need) gated.push({ entry: n.entry, item: (row as number[])[5]!, quest: need })
      }
    }
    return { gated: gated.slice(0, 4), n: gated.length,
      holding: log.held.map((h) => h.id) }
  }
  /** What the game can say out loud, and whether anything is lost with it off. */
  ;(window as unknown as { __sound: () => unknown }).__sound = () => ({
    loaded: soundReady(), muted: muteIsOn(), words: SOUNDS.length,
  })
  /** Silence it, for the check that silence costs nothing. */
  ;(window as unknown as { __mute: (on: boolean) => void }).__mute =
    (on) => mute(on)
  /** Hold a direction down without a keyboard, for the step check. */
  ;(window as unknown as { __hold: (k: string | null) => void }).__hold = (k) => {
    keys.clear()
    if (k) keys.add(k)
  }
  ;(window as unknown as { __steps: (n: number) => unknown }).__steps = (n) => {
    const from = { x: hero.x, y: hero.y, clock }
    for (let i = 0; i < n; i++) tick()
    return { step: STEP, ran: n, clock: clock - from.clock,
      moved: Math.hypot(hero.x - from.x, hero.y - from.y), ticks, owed,
      want: { ...want } }
  }
  /** What the paperdoll is made of right now, for the check. */
  ;(window as unknown as { __doll: () => unknown }).__doll = () => {
    const c = paintDoll()
    if (!c) return null
    const g = c.getContext('2d')!
    const d = g.getImageData(0, 0, c.width, c.height).data
    let ink = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 8) ink++
    return { w: c.width, h: c.height, ink, layers: dollKey.split('|'),
      worn: Object.keys(gear) }
  }
  /** Where the inns are and what an hour of standing in one is worth. */
  ;(window as unknown as { __rest: () => unknown }).__rest = () => ({
    inns: inns.size,
    innkeepers: npcs.filter((n) => n.role === 'innkeeper').length,
    inside: resting(),
    pool: you.rest, cap: restCap(),
    anHourInside: restFor(3600, true),
    anHourOutside: restFor(3600, false),
  })
  /** Stand in the first inn, for the check that it is a place. */
  ;(window as unknown as { __toInn: () => unknown }).__toInn = () => {
    // The one who is actually standing in his inn: the slice has two and one
    // of them is outdoors, which is a fact about the world rather than a bug.
    const keep = npcs.find((n) => n.role === 'innkeeper' && inns.has(inRoom(n.x, n.y)))
      ?? npcs.find((n) => n.role === 'innkeeper')
    if (!keep) return null
    placeHero(keep.x, keep.y)
    camX = hero.x; camY = hero.y
    return { inside: resting(), where: [hero.x, hero.y] }
  }
  /** Who walks with whom, and who is waiting a turn in a shared slot. */
  ;(window as unknown as { __packs: () => unknown }).__packs = () => ({
    packs: pack.size,
    biggest: Math.max(0, ...[...pack.values()].map((v) => v.length + 1)),
    inPacks: [...pack.values()].reduce((n, v) => n + v.length, 0),
    pooled: npcs.filter((n) => n.pool).length,
    waiting: npcs.filter((n) => !n.up).length,
  })
  /** Anger one member of a pack and say how many came. */
  ;(window as unknown as { __pull: () => unknown }).__pull = () => {
    for (const [lead, members] of pack) {
      const head = byGuid.get(lead)
      if (!head || members.length < 2) continue
      for (const m of [head, ...members]) m.angry = false
      const one = members[0]!
      one.angry = true
      rouse(one)
      const came = [head, ...members].filter((m) => m.angry).length
      return { size: members.length + 1, came }
    }
    return null
  }
  /** What the world's creatures can do besides swing, for the check. */
  ;(window as unknown as { __foes: () => unknown }).__foes = () => {
    const foes = spellbook.foes ?? {}
    const kinds = Object.keys(foes)
    const runnable = Object.values(foes).flat().filter((sp) =>
      sp.does.some((d) => CAN_DO.has(d[0]!)))
    const here = new Set(npcs.map((n) => String(n.entry)))
    return {
      kinds: kinds.length,
      inWorld: kinds.filter((e) => here.has(e)).length,
      abilities: Object.values(foes).flat().length,
      runnable: runnable.length,
      wide: (spellbook.spells ?? []).filter((sp) => (sp.wide?.[0] ?? 0) > 0)
        .map((sp) => ({ id: sp.id, wide: sp.wide[0] })),
      cued: Object.keys(spellbook.cues ?? {}).length,
      cues: Object.values(spellbook.cues ?? {}).flat().length,
    }
  }
  /** Press an ability by id and say what the waits look like after. */
  ;(window as unknown as { __press: (id: number) => unknown }).__press = (id) => {
    const sp = spells.find((x) => x.id === id)
    if (!sp) return null
    you.rage = MAX_RAGE
    you.gcd = 0
    cast(sp)
    return {
      id, gcd: sp.gcd, waits: Math.max(0, you.gcd - clock),
      blocked: spells.filter((x) => x.gcd && why(x) !== null).map((x) => x.id),
      free: spells.filter((x) => !x.gcd).map((x) => x.id),
    }
  }
  /** Push the bar along, so the check can watch a level actually arrive. */
  ;(window as unknown as { __earn: (xp: number) => unknown }).__earn = (xp) => {
    you.xp += xp
    levelUp()
    return { level: you.level, hp: you.max, spells: spells.length }
  }
  /** What the world told us about movement, for the check that it is used. */
  ;(window as unknown as { __rules: () => unknown }).__rules = () => ({
    cliff: CLIFF, melee: MELEE, walkBase: WALK_BASE, runBase: RUN_BASE,
    moves: spawns.moves?.length ?? 0,
    npcs: npcs.slice(0, 400).map((n) => ({
      entry: n.entry, wander: n.wander, pace: +n.pace.toFixed(2),
      chase: +n.chase.toFixed(2), notice: n.notice, back: n.back,
      swims: n.swims,
    })),
  })
  ;(window as unknown as { __quests: () => unknown }).__quests = () => ({
    known: log.all.size,
    held: log.held.map((h) => ({
      id: h.id, kill: h.kill, fetch: h.fetch,
      short: short(log, h), done: errandDone(log, h),
    })),
    done: [...log.done],
    marks: npcs.filter((n) => mark(log, n.entry, you.level))
      .map((n) => [n.entry, mark(log, n.entry, you.level)]),
    xp: you.xp, level: you.level, purse: you.purse,
  })
  /** Stand next to a given creature, so a check can talk to a named one. */
  ;(window as unknown as { __goto: (e: number) => unknown }).__goto = (e) => {
    const n = npcs.find((m) => m.entry === e && !m.dead)
    if (!n) return null
    placeHero(n.x - 1.4, n.y)
    camX = hero.x; camY = hero.y
    return { entry: n.entry, kind: n.kind, x: n.x, y: n.y }
  }
  /** Kill the nearest of a given creature outright, for the same reason. */
  ;(window as unknown as { __slay: (e: number) => unknown }).__slay = (e) => {
    const n = npcs.find((m) => m.entry === e && !m.dead)
    if (!n) return null
    n.hp = 0; n.dead = clock
    reward(n)
    return { entry: e, left: log.held.map((h) => short(log, h)) }
  }
  // For the checks: put the player next to the nearest thing that will fight
  // back, and say what it is.
  // For the checks: the nearest hostile several levels below the player, which
  // is a fight the player can actually finish.
  ;(window as unknown as { __weak: () => unknown }).__weak = () => {
    let best: Npc | null = null, bd = Infinity
    for (const n of npcs) {
      if (!fightable(n.fight) || n.dead || n.level > you.level) continue
      const d = (n.x - hero.x) ** 2 + (n.y - hero.y) ** 2
      if (d < bd) { bd = d; best = n }
    }
    if (!best) return null
    placeHero(best.x - 1.4, best.y)
    return { kind: best.kind, level: best.level, hp: best.hp }
  }
  // For the checks: put something in the bag, so the counter can be tested
  // without first surviving a fight.
  // For the checks: does each walking NPC face the way it is going?
  ;(window as unknown as { __facings: () => unknown }).__facings = () => {
    const want = (dx: number, dy: number) => Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3)
    let seen = 0, wrong = 0
    const some: unknown[] = []
    for (const n of npcs) {
      if (!n.moving || (n.vx === 0 && n.vy === 0)) continue
      seen++
      const w = want(n.vx, n.vy)
      if (w !== n.dir) {
        wrong++
        if (some.length < 6) some.push({ kind: n.kind, vx: +n.vx.toFixed(2), vy: +n.vy.toFixed(2), dir: n.dir, want: w })
      }
    }
    return { seen, wrong, some }
  }
  // For the checks: what scenery is actually placed near the player, against
  // what the world file says is there.
  ;(window as unknown as { __near: (r: number) => unknown }).__near = (r) => {
    const got: Record<string, number> = {}
    for (const o of placed) {
      if (Math.hypot(o.x - hero.x, o.y - hero.y) > r) continue
      const k = Object.entries(tilesMeta).find(([, p]) => p === o.piece)?.[0] ?? '?'
      got[k] = (got[k] ?? 0) + 1
    }
    const raw: Record<string, number> = {}
    for (const d of meta.doodads) {
      if (Math.hypot(d.x - hero.x, d.y - hero.y) > r) continue
      raw[d.k] = (raw[d.k] ?? 0) + 1
    }
    return { placed: got, doodads: raw, total: placed.length }
  }
  /**
   * Every piece drawn near you, with the ground it actually covers.
   *
   * For the check that holds the scenery against the client's own placements:
   * a doodad is right when it is in the right place at the right size, and
   * neither of those is visible in a still picture of a wood.
   */
  /**
   * How many pictures each word has against how many models it covers.
   *
   * More pictures than models is variety this world does not have: the same
   * bush drawn three ways, and two of the client's own bushes drawn alike.
   */
  ;(window as unknown as { __variety: () => unknown }).__variety = () =>
    Object.entries(meta.variety ?? {}).map(([kind, models]) => {
      const have = (KIND[kind]?.pieces ?? []).filter((q) => tilesMeta[q]).length
      return {
        kind, models, pieces: Math.min(have, models || have),
        // A deck is drawn by the ground pass, so it has no standing picture
        // and wants none.  A firefly is drawn by the *night* pass and wants
        // none either: it is a point of light rather than a sprite, which is
        // the whole reason this repository has an answer for fireflies and
        // none for butterflies.
        floor: kind === 'firefly'
          || !!tintedGround().at[kind === 'bridge_stone' ? 'stone' : kind],
      }
    })
  ;(window as unknown as { __pieces: (r: number) => unknown }).__pieces = (r) => {
    const out: unknown[] = []
    for (const o of placed) {
      if (Math.hypot(o.x - hero.x, o.y - hero.y) > r) continue
      const k = Object.entries(tilesMeta).find(([, p]) => p === o.piece)?.[0] ?? '?'
      out.push({
        piece: k, x: +o.x.toFixed(2), y: +o.y.toFixed(2),
        wide: +((o.piece.w * o.s) / PPY).toFixed(2),
        tall: +((o.piece.h * o.s) / PPY).toFixed(2),
      })
    }
    return out
  }
  ;(window as unknown as { __spans: () => unknown }).__spans = () => ({
    n: spans.length, list: spans.slice(0, 4),
    hereSpan: onSpan(hero.x, hero.y),
    haveTiles: [!!tilesMeta['bridge'], !!tilesMeta['bridge_b']],
    baked: Object.keys(tintedGround().at),
  })
  ;(window as unknown as { __give: () => unknown }).__give = () => {
    you.bag['cloth'] = [11, 143]
    you.bag['meat'] = [3, 75]
    return Object.keys(you.bag)
  }
  ;(window as unknown as { __vendor: () => unknown }).__vendor = () => {
    const v = npcs.find((n) => n.role === 'vendor')
    if (!v) return null
    placeHero(v.x - 1.2, v.y)
    return { kind: v.kind, role: v.role }
  }
  ;(window as unknown as { __weakest: () => unknown }).__weakest = () => {
    let best: Npc | null = null, bl = 99
    for (const n of npcs) {
      if (!fightable(n.fight) || n.dead) continue
      // On its own: a pack is a different test and it is the one that keeps
      // happening by accident.
      const alone = !npcs.some((m) => m !== n && fightable(m.fight)
        && (m.x - n.x) ** 2 + (m.y - n.y) ** 2 < 400)
      if (alone && n.level < bl) { bl = n.level; best = n }
    }
    if (!best) return null
    placeHero(best.x - 1.4, best.y)
    return { kind: best.kind, level: best.level, hp: best.hp }
  }
  ;(window as unknown as { __foe: () => unknown }).__foe = () => {
    let best: Npc | null = null, bd = Infinity
    for (const n of npcs) {
      if (!fightable(n.fight) || n.dead) continue
      const d = (n.x - hero.x) ** 2 + (n.y - hero.y) ** 2
      if (d < bd) { bd = d; best = n }
    }
    if (!best) return null
    placeHero(best.x - 1.4, best.y)
    return { kind: best.kind, level: best.level, hp: best.hp, x: best.x, y: best.y }
  }

  // Driven from the screenshot script: a scene is not finished until it has
  // been looked at, and looking means putting the camera somewhere on purpose.
  ;(window as unknown as { __cam: (o: Record<string, number>) => void }).__cam = (o) => {
    if (o.x !== undefined) { placeHero(o.x, hero.y); camX = o.x }
    if (o.y !== undefined) { placeHero(hero.x, o.y); camY = o.y }
    if (o.zoom !== undefined) zoom = o.zoom
    if (o.dir !== undefined) hero.dir = o.dir
  }
}

/**
 * Make it installable, and make the second visit work with no network.
 *
 * The save is in IndexedDB and the world is a handful of files, so there is
 * nothing about this game that needs to be online twice.  Registered after the
 * scene is up rather than before, because a service worker racing the first
 * load is a service worker that slows down the thing it exists to speed up.
 *
 * Wrapped, like every other storage call here: a browser with workers turned
 * off is a browser that should still play the game.
 */
function offline() {
  // The worker is written by the build, so there is none in development and
  // asking for one gets `index.html` back with the wrong media type — a
  // console error on every run of every browser check, for a file that is not
  // supposed to exist yet.
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => { /* no worker, no offline, still a game */ })
  })
}
offline()

main().catch((e) => { hud.textContent = String(e); throw e })

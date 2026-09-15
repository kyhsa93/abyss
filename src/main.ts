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

import { armourOf, attackPower, critChance, damageAfter, dodgeChance, maxHealth, maxMana, manaPerSecond, rollMelee, BASE_MANA, CREATURE_BLOCK, CREATURE_CRIT, CREATURE_DODGE, CREATURE_PARRY_HUMANOID, CRIT, ENERGY_PER_SECOND, FIVE_SECOND_RULE, GLANCING, HIT, healPerTick, MAX_ENERGY, MAX_RAGE, MISS, OUTCOME_WORD, PARRY_WITH_WEAPON, RAGE_LOST_PER_TICK, REGEN_TICK, type Roster, type Stats, type Who } from './sim/stats.ts'
import { layerFor, still, ORDER, type DollMeta } from './sim/doll.ts'
import { outfitFor, outfitOf, WEIGHT } from './sim/outfit.ts'
import { lightAt, skyAt, SKY_WORD, CLEAR, SNOW, STORM } from './sim/sky.ts'
import { parries, SLOT_WORD, STAT_WORD } from './talk.ts'
import { between, roll, seed, reseed } from './sim/roll.ts'
import { cycleOf, standing } from './sim/pools.ts'
import { freeSlot, list as listSaves, wipe as wipeSave, write as writeSave, SAVE_VERSION, type Card, type Save } from './save.ts'
import { canWear, tintOf, wear, withGear, wornArmour, I_ARMOUR, I_BUY, I_DELAY, I_DURA, I_DURA_COST, I_HI, I_ILVL, I_LO, I_ARM, I_NEED, I_QUALITY, I_SELL, I_SLOT, I_USE, I_WORD, K_ARMOUR, K_ID, SLOTS, type Item, type Shelf } from './sim/gear.ts'
import { afterDeath, broken, losePoints, repairCost, wearFromBlow, EQUIPMENT_SLOT } from './sim/durability.ts'
import { matchHighest, reselect, NONE, OFFLINE, ONLINE, TAUNT, UPDATE_INTERVAL, type Ref } from './sim/threat.ts'
import { coolsLeft } from './sim/cools.ts'
import { askedFor, mute, muteIsOn, play, ready as soundReady, wake, SOUNDS } from './sound.ts'
import { afterThis, heatOf, nextRank, riseChance, short as lacking, skinAsks, GIVEN, SOLD, R_COST, R_COUNT, R_GREY, R_HOW, R_MAKES, R_NEEDS, R_RANK, R_SKILL, R_SPELL, R_YELLOW, type Rank, type Recipe, type Trades } from './sim/trades.ts'
import { discountOf, paidBy, rankFloor, rankOf as standingRank, standAfter, EXALTED, NEUTRAL } from './sim/rep.ts'
import { duel } from './sim/duel.ts'
import { threatFrom } from './sim/fight.ts'
import { abilityOf, bearing, coin, errand, fill, goodsOf, josa, nameOf, proseOf, reward as payFor, setProse, speak, tally, RANK_WORD, SIDE_WORD, TRADE_WORD, zoneOf, type Direction, type Listener, type Option, type Reader, type Speech, type Topic } from './talk.ts'
import { layoutFor, touchpad } from './touch.ts'
import { drawBolt } from './render/boltimage.ts'
import { drawFx } from './render/fximage.ts'
import { flightKind, landingFx, schoolColour, tint as rgbaOf } from './render/school.ts'
import type { ProjectileKind } from './render/bolt.ts'
import { hud as makeHud, type BookRow, type Layout, type ShopRow, type Slot, type Worn } from './hud.ts'
import {
  book, done as errandDone, type Held, hand, holding, killed, mark, offers,
  short, take, walked, wants, type Errand,
} from './sim/quest.ts'
import {
  mitigate, noticeAt, rageFrom, seenYards, swing, xpFor, E_DAMAGE, E_TRIGGER, E_ATTACK_ME,
  A_THREAT_PCT, A_DAMAGE_PCT_DONE, A_DAMAGE_PCT_TAKEN, A_BASE_RESISTANCE_PCT,
  ARMOUR, A_ATTACK_POWER, A_PERIODIC_DAMAGE,
  A_PERIODIC_HEAL, A_MOD_STAT, A_MOD_RESISTANCE, A_ABSORB, SCHOOL_PHYSICAL,
  E_AURA, E_ENERGIZE, E_DUMMY, E_CHARGE, E_HEAL, E_COMBO,
  E_WEAPON_ADD, E_WEAPON_PCT, WEAPON_FLAT, costOf, POWER_WORD,
  P_HEALTH, P_MANA, P_RAGE,
  ENEMY, HI, HP, LO, MELEE, QUARRY, STANCE, SWING, setMelee,
  aggressive, fightable, type Fight, type Spell,
} from './sim/fight.ts'

/** A door: where, and for a front door which way is out and how wide. */
type Door = [number, number] | [number, number, number, number, number]
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
   * Where you go in, in world yards.
   *
   * A WMO's own `MOPT`/`MOPV` portals, filtered by the bake to the ones a man
   * can walk through and to the ground storey.  `doorways` had found these
   * since it was written and the bake used them to pick which floor was the
   * ground one and threw the coordinates away.
   *
   * A **front** door carries three more: which way is out, as a unit vector
   * on the map, and how wide the opening is — out of `MOPR`, which says which
   * groups a portal joins, and `MOGI`, which says which of those are rooms and
   * which the outdoors.  A door between two rooms stays a point.
   */
  d?: Door[]
  /**
   * And the doorways of the storeys above the ground, `[storey, x, y]` in
   * world yards, the storey an index into this model's `floors`.  Kept out of
   * `d`, which is the way in from outside: an opening on a gallery is not.
   */
  du?: [number, number, number][]
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
  /**
   * A building with no door: the per cent of its standing room at the ground it
   * stands on, and how high that storey is.  Under half, the bake cut its plan
   * again at the ground — see `ground_doorless` in the bake.
   */
  g?: [number, number]
}
type Meta = {
  width: number; height: number; unit: number
  /** Yards a step in the depth plane at the end of `terrain.bin`. */
  depthUnit?: number
  x0: number; y0: number; centre: [number, number]; bounds: number[]
  variety?: Record<string, number>
  /** `[w, h, cell yards, model x0, y0, base64 bits]` per model. */
  /**
   * A building from above, four masks over one grid: its outline, the part of
   * that outline a man cannot be in, the part he can stand on, and the part
   * with something over his head — and the way up, and how high each of its
   * treads is.
   * `[w, h, cell yards, model x0, y0, outline, solid, floor, over, steps, rises]`.
   *
   * The fourth is what tells a room from a courtyard.  Seen from above an
   * outline is a silhouette and 65% of the slice's is neither stone nor
   * standing room — 192,671 cells of 295,227 — which split by ceiling is
   * **167,238 roofed and 25,433 open to the sky**.
   */
  plans?: Record<string, [number, number, number, number, number,
    string, string, string, string, string, string?]>
  /**
   * And the floors above the ground one, `[sill, …the same nine]` a storey.
   *
   * A building's plan used to be its lowest sill and nothing else: `wmo_plan`
   * took `min(...)` and `check_doors` threw away every portal more than a
   * body's height from it — **111 of this slice's 176**.  The abbey's four
   * storeys came out as one and so did the inn's upstairs, where the
   * innkeeper is.
   *
   * A separate table and not a fifth field on the plan, because a building
   * with one floor is most of them and a key nobody reads is cheaper absent
   * than empty.
   */
  floors?: Record<string, [number, number, number, number, number, number,
    string, string, string, string, string, string?][]>
  /**
   * Yards a step of a tread's height is, and which byte is the sill, for the
   * sixth field of a plan: a byte a steps cell, how far from its storey's
   * sill the tread is.
   */
  planRise?: [number, number]
  areaWidth?: number; areaHeight?: number; areaUnit?: number
  areaIds?: number[]
  /** Which of them this slice actually is — see `areaSlice` in the bake. */
  areaSlice?: number[]
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
  /**
   * The words the client's paint comes down to, in the order the two three-bit
   * fields of a paint cell index.
   */
  ground?: string[]
  groundWidth?: number; groundHeight?: number; groundUnit?: number
  /** How many levels the second word's share is kept in — the bake's number. */
  groundMix?: number
  /** Where each plane of `terrain.bin` starts and how long it is. */
  bin?: Record<string, [number, number]>
  doodads: Doodad[]
}
type Piece = { x: number; y: number; w: number; h: number; kind: string }
/** One kind's block of cells in the NPC atlas. */
/**
 * One kind's row of the creature atlas.
 *
 * `y` is where that row starts, `rows` is how tall the kind actually is, and
 * `top` is how far down the old 64-pixel cell its own box began — which is
 * what puts the picture back on the ground line at the far end.  It was
 * `first` and a flat 18-column grid of 64-pixel cells until the sheet was
 * measured: **19,816 of its 59,904 cell rows were transparent**, because a
 * chicken is sixteen rows tall and was being stored in sixty-four.
 */
type Frames = { y: number; rows: number; top: number
  frames: number; people: boolean; yards?: number
  /** A layer that goes on a person rather than being one — see `WEAPONS`. */
  weapon?: boolean }

/** Which picture goes with what, out of `pipeline/bake_ui.py`. */
type Art = {
  chrome: Record<string, string>
  spells: Record<string, string>
  /** Keyed `"<our word>|<slot>"`, because JSON has no tuple key. */
  goods: Record<string, string>
  slots: Record<string, string>
}

type NpcArt = {
  cell: number; anchor: number
  kinds: Record<string, Frames>
}
/** The drawn player: four poses, clips by name, one sheet. */
type HeroArt = {
  cell: number; cols: number
  clips: Record<string, { first: number; count: number }>
  /** How tall a row of the atlas is, which is not `cell` — see `drawHero`. */
  row?: number
  /**
   * What can be in his hand — one sheet a weapon, under `art/arms/`.
   *
   * Front half and behind half of each of the five `bake_npcs.py` cuts for
   * everybody else, in the two clips he can be in while holding it: the walk,
   * and whichever attack that weapon is used with.  712 of the slice's people
   * carry a weapon and the player was the only body in the world with nothing
   * in his hands.
   *
   * **A sheet a weapon rather than an atlas**, because a man holds one of
   * them.  All five walks in one atlas cost 2.7 MiB decoded whatever he was
   * carrying, and the swings would have taken it to 6.1; one sheet at a time
   * is 2.8 at its very worst, which is the greatsword.  `px` is what that
   * sheet costs, carried so `budgetcheck` can weigh the heaviest rather than
   * guess.
   *
   * Each half is trimmed to its own box, so they have twenty different cell
   * sizes and there is no grid they all belong to: `x`/`y` say where the strip
   * sits on the weapon's sheet, `w`/`h` are its cell, and `dx`/`dy` are where
   * that box sat inside the body's 64-pixel cell — which for an attack sheet
   * is the middle cell of a 3x3 block, because LPC draws a swing too big to
   * fit a walking man's square.
   */
  arms?: Record<string, ArmSheet>
  /**
   * What a player may choose to look like — twelve hairstyles and four
   * beards, one sheet each under `art/look/`, loaded when it is chosen.
   */
  looks?: Record<string, { kind: string; px: number
    clips: Record<string, ArmStrip> }>
  /** Which attack a man with nothing in his hands plays. */
  bare?: string
  /**
   * Where the man is inside his own 64-pixel cell, and where his chin is.
   *
   * `top` and `bottom` are rows of the sheet; `chin` is how far up him the
   * head begins, as a share of his height.  All three measured, because none
   * of them is what arithmetic would guess: he is 49 rows of a 64 cell, and
   * LPC draws him with a head two fifths of his own height.
   */
  body?: { top: number; bottom: number; chin: number }
}
/** One strip of one half of one weapon in one clip. */
type ArmStrip = {
  w: number; h: number; dx: number; dy: number
  cols: number; dirs: number; x: number; y: number
}
type ArmSheet = {
  /** Which attack the *body* plays while holding this — see `bake_sprites`. */
  swing: string
  /** What the sheet costs decoded, for `budgetcheck` to weigh. */
  px: number
  clips: Record<string, Record<string, ArmStrip>>
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
  /**
   * What the people of the slice are holding, as words the atlas has a sheet
   * for — `creature_equip_template`, which nothing read until now.
   */
  arms?: string[]
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
   * How deep that water is, a byte a cell in `depthUnit` yards, at the end of
   * the file so that adding it moved nothing that was already being read.
   */
  const DEPTH_UNIT = meta.depthUnit ?? 0.25
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
  /**
   * Two words a cell, **four bits each**, and the mix beside it a nibble.
   *
   * The bake used to send one word: whichever layer's mean passed 170 won the
   * whole block.  A third of the client's overlay texels are part-covered —
   * every road verge, every skirt of gravel round a rock — so that was 15.5%
   * of the paint thrown away, and the way it showed was a staircase where the
   * client has a gradient.
   */
  const PAINT_CELLS = GW * GH
  const MIX_BYTES = (PAINT_CELLS + 1) >> 1
  /**
   * Where a plane of `terrain.bin` is, asked of the bake rather than added up.
   *
   * The offsets were worked out here, in the bake and in `bordercheck`, and
   * adding the mix plane between the paint and the zones left the third one
   * reading the zones out of the middle of the paint — five places in the
   * forest came back as the wrong kind of place, from a check that is about
   * neither planes nor paint.  The fallback is the old arithmetic, for a
   * world baked before the layout was written down.
   */
  const plane = (name: string, fallback: number, length: number) => {
    const said = meta.bin?.[name]
    const at = said ? said[0] : fallback
    const n = said ? said[1] : length
    return bin.byteLength >= at + n ? new Uint8Array(bin, at, n) : null
  }
  const paint = GW ? plane('ground', cells * 5, PAINT_CELLS) : null
  const paintMix = paint
    ? plane('mix', cells * 5 + PAINT_CELLS, MIX_BYTES) : null
  /** How many levels the bake kept the mix in — its number, not a copy. */
  const MIX_LEVELS = meta.groundMix ?? 15
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
  const ZONES_AT = cells * 5 + PAINT_CELLS + MIX_BYTES
  const zones = AW ? plane('zones', ZONES_AT, AW * AH) : null
  const deep = plane('depth', ZONES_AT + AW * AH, cells)
  const { width: W, height: H, unit: U, x0, y0 } = meta
  /**
   * Half the client's own hole, which is two by two height cells — 8.33 yards
   * across.  A mine's mouth is cut to it, and it is also how wide the doorstep
   * of a mine is: a house's door is a door's width and a mine's is a hillside.
   */
  const MOUTH = U
  /**
   * Where the mines open, filled when they are dug.
   *
   * Declared up here because `openHole` needs it and `openHole` is read by the
   * walkability test, which is written long before there are any caves.  **A
   * mine's mouth is the way in and not a pit**: a hole in the ground stops a
   * man everywhere else, and at a mouth it is the one thing that must not.
   * Without this a mine could be looked at and never entered — the hole
   * refused footing two yards out and the doorstep is one and a half, so the
   * player stopped short of a door he could never reach.  Nothing said,
   * because the culling that hides a kobold in a mine works off the creature's
   * own `cave` and not off where the player is.
   */
  const mouths: [number, number][] = []

  const [tilesImg, tilesMeta, heroImg, heroMeta, npcImg, npcArt, art, spawns, spellbook, things, roster, shelf, said, craft] = await Promise.all([
    load('./art/tiles.png'),
    fetch('./art/tiles.json').then((r) => r.json() as Promise<Record<string, Piece>>),
    load('./art/hero.png'),
    fetch('./art/hero.json').then((r) => r.json() as Promise<HeroArt>),
    load('./art/npcs.png'),
    fetch('./art/npcs.json').then((r) => r.json() as Promise<NpcArt>),
    // Which picture goes with what — see `pipeline/bake_ui.py`.  One list,
    // written where the files are copied from, rather than a file list in the
    // bake and a drawing list here that quietly stop agreeing.
    fetch('./art/ui.json').then((r) => r.json() as Promise<Art>)
      .catch(() => ({ chrome: {}, spells: {}, goods: {}, slots: {} } as Art)),
    // Not behind the two-worlds switch, and that is not an oversight: the
    // terrain has two sources because a client's height grid is sharper than
    // anything a database knows, but where a wolf stands is a row in
    // `creature` either way.  One spawn file, and it is the committed one.
    fetch('./world/npcs.json').then((r) => r.json() as Promise<Spawns>),
    // What each class can do, out of the client's own `Spell.dbc` by way of
    // `pipeline/spells.py`.  Missing is fine: without it the bar is the two
    // things that need no table.
    fetch('./world/spells.json')
      .then((r) => r.json() as Promise<{
        /** One book a class, keyed on the class id the game itself uses. */
        books: Record<string, Spell[]>
        melee?: number
        foes?: Record<string, Spell[]>
        /**
         * The spells the player's own abilities fire.  Half of three of them
         * lives here: Sunder Armor's debuff, Bloodrage's rage and Charge's
         * stun are all a trigger and nothing else.
         */
        linked?: Spell[]
        /** `[spell, trigger, param1, param2, chance]` — `smart_scripts`. */
        cues?: Record<string, number[][]> }>)
      .catch(() => ({ books: {} as Record<string, Spell[]>, melee: undefined,
        foes: {} as Record<string, Spell[]>,
        linked: [] as Spell[],
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
      .then((r) => r.json() as Promise<Roster>)
      .catch(() => null),
    // What can be held, bought and taught: `pipeline/items.py`.
    fetch('./world/items.json')
      .then((r) => r.json() as Promise<Shelf>)
      .catch(() => ({ items: {}, stock: {}, trainers: {} } as Shelf)),
    // And the words of the quests, which are the one thing in this game that
    // is a translation rather than something written here — see issue 190 and
    // `pipeline/prose.py`.  Missing is fine and was the state of the world
    // for a year: `talk.ts` builds the sentence from the shape instead.
    fetch('./world/prose.json')
      .then((r) => r.json() as Promise<{ quests: Record<string, unknown> }>)
      .catch(() => ({ quests: {} })),
    // What can be learned to be made: `pipeline/trades.py`.  Missing is fine
    // and is what a machine with no game client bakes — a recipe lives in
    // `SkillLineAbility.dbc` and nowhere else.
    fetch('./world/trades.json')
      .then((r) => r.json() as Promise<Trades>)
      .catch(() => ({ trades: {}, recipes: [], unused: {} } as Trades)),
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
  /**
   * The same question `stepAt` asks, of the step actually being taken.
   *
   * `stepAt` is the worst step out of a cell **in any of four directions**,
   * and that last part is what walled the starting valley in.  A man walking a
   * road cut along a hillside does not take the step up the bank beside him —
   * he takes the one along the road — but every cell of that road has the bank
   * as a neighbour, so every cell of it reads as a cliff.  Flooded that way
   * the world is 13,533 cells and Northshire is sealed; asked of the step, at
   * the same limit, it is 159,377 and the road out is open.
   *
   * The limit was measured as legs and not as cells: 3,954 of them in
   * `waypoint_data`, each one a walk from somewhere to somewhere.  So this is
   * the shape of thing that number is about.  Still a one-sided difference,
   * because the reason `stepAt` exists at all is that a central one smooths a
   * four-yard cliff into a walkable ramp.
   */
  function climb(ax: number, ay: number, bx: number, by: number): number {
    const far = Math.hypot(bx - ax, by - ay)
    if (far < 1e-6) return 0
    return Math.abs(groundAt(bx, by) - groundAt(ax, ay)) / far
  }

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

  /** Which paint cell a point falls in, or -1 off the grid. */
  const paintCell = (wx: number, wy: number) => {
    if (!paint) return -1
    const i = Math.round((x0 - wx) / GU), j = Math.round((y0 - wy) / GU)
    if (i < 0 || i >= GW || j < 0 || j >= GH) return -1
    return i * GH + j
  }
  /**
   * The word that has most of this cell.
   *
   * Still one word, because most of what asks is asking a question a word
   * answers — is this a road, is this paved, what colour is the minimap here.
   * The **convenience on top**, as the issue that brought the mix put it; the
   * blend is `blendAt` and only the ground pass wants it.
   */
  const paintAt = (wx: number, wy: number): string => {
    const n = paintCell(wx, wy)
    if (n < 0) return 'grass'
    return PAINT[paint![n]! & 15] ?? 'grass'
  }
  /**
   * The second word here and how much of the cell it has, or null.
   *
   * Nought where the client painted one thing, which is 45% of the forest.
   */
  const blendAt = (wx: number, wy: number): [string, number] | null => {
    const n = paintCell(wx, wy)
    if (n < 0 || !paintMix) return null
    const nib = n & 1 ? paintMix[n >> 1]! >> 4 : paintMix[n >> 1]! & 15
    if (!nib) return null
    const word = PAINT[(paint![n]! >> 4) & 15]
    return word ? [word, nib / MIX_LEVELS] : null
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
  /**
   * Whether a point is in the game at all.
   *
   * The slice's bounds are a box and a box is not a zone: Stormwind sits
   * geographically inside Elwynn, so the measured box of area 12 catches the
   * city whole, and the Burning Steppes and a beach of Westfall with it — a
   * third of the walkable ground.  The bake shuts those chunks; this decides
   * what they *look* like, and the answer is the dark behind the world.  An
   * invisible wall across a field is the thing this repository keeps taking
   * out, and the edge of a slice is not a wall.  It is an end.
   */
  const MINE = new Set(meta.areaSlice ?? [])
  /** Where this game is, out of `slice.json` by way of the bake. */
  const EDGE = meta.bounds
  const outside = (wx: number, wy: number) => {
    const a = areaOf(wx, wy)
    // Nought is "the grid has no answer here", not "somewhere else".  Read
    // the other way round this painted most of Elwynn as the end of the
    // world: the zone grid is one id a 33-yard chunk and its edges are
    // ragged, and an unmapped chunk in the middle of the forest is still the
    // forest.
    return a !== 0 && MINE.size > 0 && !MINE.has(a)
  }
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
    // A mine's mouth is the exception, and it is the whole way in.  A disc,
    // the same shape `atDoor` uses, so the ground that takes a step and the
    // ground that opens a door are the same ground.
    for (const [mx, my] of mouths) {
      if (Math.hypot(mx - wx, my - wy) <= MOUTH) return false
    }
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
   * How much water is over the ground here, in yards.  Nought on dry land.
   *
   * The bake has known this per cell since `MH2O` was first read and shipped
   * none of it: `levels` went into one gate and nowhere else, which could not
   * matter while water was a wall.  Water is not a wall any more, and this is
   * the number that tells wading from swimming.
   */
  const depthAt = (wx: number, wy: number): number => {
    if (!deep) return 0
    const i = Math.round((x0 - wx) / U), j = Math.round((y0 - wy) / U)
    if (i < 0 || i >= W || j < 0 || j >= H) return 0
    return deep[i * H + j]! * DEPTH_UNIT
  }
  /**
   * The same two planes read *between* cell centres rather than at the
   * nearest one — nought to one for the water, yards for its depth.
   *
   * The cells are 4.17 yards and a river is a few of them across, so asked by
   * the nearest centre a shoreline is a staircase of four-yard steps.  Read
   * bilinearly and cut at a half, it is the line the cell centres imply.
   */
  const bilinear = (plane: Uint8Array | null, wx: number, wy: number) => {
    if (!plane) return 0
    const fi = (x0 - wx) / U, fj = (y0 - wy) / U
    const i = Math.floor(fi), j = Math.floor(fj)
    const u = fi - i, v = fj - j
    const at = (ii: number, jj: number) =>
      ii < 0 || ii >= W || jj < 0 || jj >= H ? 0 : plane[ii * H + jj]!
    return at(i, j) * (1 - u) * (1 - v) + at(i + 1, j) * u * (1 - v)
      + at(i, j + 1) * (1 - u) * v + at(i + 1, j + 1) * u * v
  }
  const wetShare = (wx: number, wy: number) => bilinear(wet, wx, wy)
  const depthShare = (wx: number, wy: number) => bilinear(deep, wx, wy) * DEPTH_UNIT

  /**
   * Deep enough to swim in, which is the server's own line and not a guess.
   *
   * `Unit::UpdatePosition` (Unit.cpp:4484) compares the water over you against
   * **three quarters of your collision height**, and it says in its own
   * comment that it is mirroring the client.  The height is `HumanMale.m2`'s
   * box, the same 2.03 yards `bake_terrain.py` asks whether a body fits
   * through a doorway with — one measurement, two questions.
   */
  const BODY_YARDS = 2.03
  const SWIM_DEPTH = BODY_YARDS * 0.75
  /**
   * And how fast he goes once he is off his feet.
   *
   * `baseMoveSpeed[MOVE_SWIM]` (Unit.cpp:85) is 4.722222 yards a second
   * against `MOVE_RUN`'s 7.0, which is where the run speed in this file came
   * from too.  Two thirds, and it is a column rather than a feel.
   */
  const SWIM_SPEED = 4.722222
  /** Off his feet here — the line above, asked of a place. */
  const swimAt = (wx: number, wy: number) => depthAt(wx, wy) >= SWIM_DEPTH

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
  /**
   * Every way a ground picture may be laid down.
   *
   * Three pictures on a thirteen-wide screen is three pictures however well
   * the hash shuffles them, and the measurement said so: 14% of the tiles in
   * a patch of meadow were pixel-for-pixel identical to the one beside them,
   * and the autocorrelation peaked at every multiple of 32 pixels.  The hash
   * was the obvious suspect and was innocent — checked for periodicity over
   * four hundred cells and it has none.
   *
   * `bake_tiles.py` turns and mirrors them, which is lossless in pixel art
   * and free at runtime, and whether a piece *may* be turned is decided by
   * the ratio of its horizontal to its vertical contrast rather than by eye.
   * Grass and bloom take all eight; water, cobble, bridge and roof take none.
   */
  const ways = (base: string[]) => base.flatMap((k) =>
    [k, `${k}_r1`, `${k}_r2`, `${k}_r3`, `${k}_m`, `${k}_m1`, `${k}_m2`, `${k}_m3`]
      .filter((q) => tilesMeta[q]))
  const GROUND_TILES = ways(['grass', 'grass2', 'grass3'])
  const ROCK_TILE = tilesMeta['stone'] ? 'stone' : GROUND_TILES[0]
  /**
   * Burnt earth, sand and a field, which used to be stone, a shoreline and
   * bare dirt.
   *
   * Each of the three is a word the bake has always shipped and the scene had
   * no picture for, so it fell through to something else: the Burning Steppes'
   * ash — **8.7% of the slice, its second-largest ground** — came out grey
   * granite, Westfall's beaches came out as the grass-into-water piece with no
   * water in them, and a farm came out as ploughed dirt.
   */
  const ASH_TILE = tilesMeta['ash'] ? 'ash' : ROCK_TILE
  const SAND_TILE = tilesMeta['sand'] ? 'sand' : GROUND_TILES[0]
  const CROP_TILE = tilesMeta['crop'] ? 'crop' : GROUND_TILES[0]
  /** The earths, which take mirrors: their stones have a light on them. */
  const DIRT_TILES = ways(['dirt', 'dirt2'])
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
   * The same pictures as families of one tone each.
   *
   * The two earths are a dark brown and an orange and the two cobbles a cream
   * and a grey-teal, so choosing between them a tile at a time — which the
   * turns and mirrors inside one family are for — is a chessboard of tones
   * however well it is shuffled.  Which family a spot leans to is `toneAt`,
   * and a plate blends the two the way it blends two grounds.
   */
  const DIRT_WAYS = [ways(['dirt']), ways(['dirt2'])].filter((l) => l.length)
  const PAVED_WAYS = PAVED_TILES.map((k) => [k])
  /**
   * Which of its two families a spot leans to, nought to one.
   *
   * Value noise five yards across read bilinearly, the meadow's blotch again,
   * and pushed towards its ends — so the earth is patches of one brown and
   * patches of the other with a short fade between.  In yards and not tiles,
   * so the patches stay where they are when the grain doubles.
   */
  const TONE_YARDS = 5
  const toneAt = (wx: number, wy: number) => {
    const u = wx / TONE_YARDS, v = wy / TONE_YARDS
    const i = Math.floor(u), j = Math.floor(v)
    const fx = u - i, fy = v - j
    const n = hash(i + 313, j + 719) * (1 - fx) * (1 - fy)
      + hash(i + 314, j + 719) * fx * (1 - fy)
      + hash(i + 313, j + 720) * (1 - fx) * fy + hash(i + 314, j + 720) * fx * fy
    const t = Math.max(0, Math.min(1, (n - 0.35) / 0.3))
    return t * t * (3 - 2 * t)
  }
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
   * Which roof each kind of building wears.
   *
   * One picture covered all forty-three: 28 houses, 12 halls and 3 towers, so
   * the abbey and a cottage were the same thing at two sizes.  The materials
   * are cut in `bake_tiles.py` and named for what they are; **which kind wears
   * which is a sentence about the art and it belongs here**, not in the bake.
   *
   * Slate shingle for a hall because a hall is the grand thing in this valley
   * and the abbey is one; boards for a tower, which is the small roof; and the
   * brick flat top stays on a house so that Goldshire looks like Goldshire.
   *
   * `tent` has no entry and that is declared rather than defaulted: there is
   * no tent in this slice — `__buildings()` says house 28, hall 12, tower 3 —
   * and there is no canvas in any sheet this repository has.  `viewcheck`
   * fails on a kind that is *here* and has no roof, which is the half that
   * matters; a kind that is not here has nothing to be wrong about.
   */
  const ROOF_OF: Record<string, string> = {
    house: ROOF_TILE,
    hall: tilesMeta['roof_shingle'] ? 'roof_shingle' : ROOF_TILE,
    tower: tilesMeta['roof_plank'] ? 'roof_plank' : ROOF_TILE,
  }
  /**
   * And the floor a mine has, which is the one kind of building drawn out of
   * the outdoor set.
   *
   * It used to be the floor of *every* building — flagstones, the same picture
   * the roads are paved with, which is what issue 163 was about.  A building
   * has its own set now (`in_floor`, `in_floor2`, `in_wall`) and is drawn by
   * `drawRoom` from the moment you are inside one, so the only thing left
   * reaching for a road's cobbles indoors is the mine, which is rock either
   * way.
   */
  const FLOOR_TILE = PAVED_TILES[0] ?? WALL_TILE

  /**
   * A floor a kind of building.
   *
   * One picture for every inside was the complaint, and `doodads` already
   * sorts this slice's buildings into four words — `hall` 5, `house` 16,
   * `tower` 2, `tent` 5 — so four is the whole cost.  The pictures are cut
   * from sheets `bake_tiles.py` already uses, and that is not laziness: the
   * one sheet with exactly the floors this wanted ends its attribution
   * document with `MISSING attributions: Some bottomleft tiles`, and those
   * floors are the bottom-left tiles.
   *
   * **A tent has no floor of its own** and is not in this table.  Its floor is
   * the ground it is pitched on, which is both true and free — the same branch
   * a courtyard takes.
   */
  const INDOOR_FLOOR: Record<string, (h: number) => string> = {}
  for (const [k, pair] of Object.entries({
    hall: ['in_floor', 'in_floor2'],
    house: ['in_house', 'in_house2'],
    tower: ['in_tower', 'in_tower2'],
  })) {
    const [a, b] = pair as [string, string]
    const one = tilesMeta[a] ? a : FLOOR_TILE
    const two = tilesMeta[b] ? b : one
    INDOOR_FLOOR[k] = (h) => (h > 0.82 ? two : one)
  }
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
  const BLOOM_TILES = ways(['bloom', 'bloom2', 'bloom3'])
  const MEADOW = 0.78
  /**
   * The pictures whose detail sits in the middle of the tile with plain ground
   * round the edge — the grasses and the flowers.
   *
   * Laid on an exact grid their tufts are a lattice one tile apart, and that
   * was hidden for as long as a plate was a pixel too wide a tile: the drift
   * smeared it.  With the plate the width of the world, `shotcheck`'s gauge
   * read 4.0 on the grass alone.  These may be nudged inside their tile, as
   * far as their plain border allows, and the lattice goes.
   */
  const NUDGED = new Set([...GROUND_TILES, ...BLOOM_TILES])

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
    barrel: {
      pieces: ['barrel', 'barrel2', 'barrel3', 'barrel4', 'barrels',
        'barrels2', 'barrels3'],
      solid: 0.4,
    },
    // `prop` is the client's word for the furniture of a yard, and 301 of them
    // were one grey blob.  A yard has firewood, sacks, crates and a stall in
    // it, and which one is decided the same way a tree's species is.
    prop: {
      pieces: ['crate', 'sack', 'sacks', 'basket', 'baskets', 'basket2',
        'baskets2', 'firewood', 'firewood2', 'woodpile', 'anvil', 'hay',
        'stall', 'sacks3', 'chest2', 'barrels2', 'barrels3', 'clock',
        'sidetable', 'tray', 'plates', 'bottles', 'pot_blue', 'lantern'],
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
    // Indoors, out of `Interior.png` — a sheet of the same LPC set that had
    // never been opened until issue 198 counted models against pictures.  A
    // skull is a skull; two pieces of rubble were what the word had before.
    bones: { pieces: ['skull', 'rubble', 'scatter'] },
    lamp: { pieces: ['lamp', 'lamp2', 'lamp3', 'lamp4', 'lantern', 'lantern2'] },
    // What stands inside a building, which until now was two thirds skipped:
    // the roof came off the abbey and what was under it was a tiled floor
    // with nothing on it.  The pictures are Lanea Zimmerman's, out of the
    // same folder the water and the bridges already come from.
    shelf: {
      pieces: ['shelf', 'shelf2', 'bookcase', 'china_case', 'china_case2'],
      solid: 0.4,
    },
    cabinet: {
      pieces: ['cabinet', 'cabinet2', 'cupboard', 'drawers', 'chest2'],
      solid: 0.4,
    },
    keg: { pieces: ['keg', 'keg2', 'barrels2', 'barrels3'], solid: 0.4 },
    bed: { pieces: ['sack', 'sacks', 'sacks3'], solid: 0.3 },
    // Two thirds of a yard, because that is what a stein is.  Left at the
    // picture's own size a bottle on a table was a barrel beside it.
    crockery: {
      pieces: ['barrel2', 'barrel3', 'basket', 'basket2', 'pot_blue',
        'bottles', 'china', 'plates', 'plates2', 'tray'],
      yards: 0.7,
    },
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
    /** Where it stands, which is the half of *whose* that says which floor. */
    z?: number
    /**
     * And which storey that comes to — worked out once, for the same reason.
     *
     * `-1` is the ground floor, the same numbering the player's own `storey`
     * uses.  Before issue 221 the drawing asked only *whose building is this*,
     * so a barrel on the abbey's ground floor stood on the gallery above it and
     * a man on the gallery was visible from the nave.
     */
    storey?: number
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
  /** Scenery standing outside the slice, which is not in this game either. */
  let beyond = 0
  const motes: { x: number; y: number }[] = []
  /** How many sparks the last frame lit, which is what the check reads. */
  let sparks = 0
  for (const d of meta.doodads) {
    // Not in the game.  A third of the box is somewhere else — Stormwind,
    // the Burning Steppes, a beach of Westfall — and drawing its trees over
    // the dark makes an end look like a bug.
    if (outside(d.x, d.y)) { beyond++; continue }
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
            s: size, kind: d.k, ...(d.h ? { house: d.h, z: d.z } : {}),
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
          piece: piece2, s: size, kind: d.k, ...(d.h ? { house: d.h, z: d.z } : {}),
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
        x: d.x, y: d.y, piece, s: size, kind: d.k, ...(d.h ? { house: d.h, z: d.z } : {}),
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
      // One row of the atlas a kind, at the kind's own height.  A frame's
      // index is its place in that row, and `top` is how far back up the
      // 64-pixel cell its own box started — so the picture goes back where it
      // was without the sheet carrying the air.
      const idx = DIR_DOWN * a.frames
      sc.clearRect(0, 0, c, c)
      sc.drawImage(npcImg, idx * c, a.y, c, a.rows, 0, a.top, c, a.rows)
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
    /**
     * Where the server put its feet, which is the only thing that knows
     * where the mines are — see `digCave`.  A height field has one z for an
     * (x, y) and cannot hold a tunnel, so the cave's shape has to come from
     * somewhere, and this is it.
     */
    z: number
    dir: number; t: number; art: string; alpha: number
    r: number; wander: number; swims: boolean
    vx: number; vy: number; until: number; moving: boolean
    kind: string; role: string; level: number; topic: Topic | null; seed: number
    /** Which mine this one is down, if it is down one — see `digCave`. */
    cave?: number
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
    /**
     * And how hard, as a share of what it can take, plus which way the blow
     * came from — `[share, x, y]`, the pair a unit vector away from whoever
     * swung.  `knock` reads it; nothing else does.
     */
    knock: [number, number, number] | null
    /** When it last swung, so the scene can lunge it — see `knock`. */
    swung: number
    /** Who it is fighting, which for now is only ever the player. */
    angry: boolean; next: number
    /** A cut that keeps cutting: when it stops, when it next bites, how hard. */
    bleed: { until: number; next: number; each: number } | null
    /** What it is carrying, and whether anybody has been through it yet. */
    haul: [number, number, number[][]] | null
    looted: boolean
    /** What comes off with a knife, once the pockets are empty. */
    hide: [number, number, number[][]] | null
    skinned: boolean
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
     * One entry, because there is one player and no pet ever stands; the
     * victim is read off it by `src/sim/threat.ts` all the same, so "who is it
     * hitting" is a rule rather than the only thing in reach.
     */
    threat: Record<string, number>
    /** Who that rule last picked, and when it may pick again (ms). */
    victim: string | null
    reselect: number
    /** Until when it is looking at you because it was told to — Taunt. */
    taunted: number
    /** How much of its armour is off, and until when — Sunder Armor. */
    sunder: { until: number; pct: number } | null
    /** What is in the main hand, as an atlas kind, or null for nothing. */
    arm: string | null
    /** Whether the off hand also holds a weapon — `Creature::CanDualWield`. */
    dual: boolean
  }
  const npcs: Npc[] = []
  let unplaceable = 0
  /**
   * Spawns standing outside the slice, which are now nobody's.
   *
   * The box that measures area 12 catches Stormwind whole, because the city
   * sits geographically inside Elwynn — so 439 of the world's own spawns are
   * citizens of a place this repository deliberately does not draw, standing
   * thirty-strong on a flat grey slab.  The bake shuts that ground; this is
   * the other half of the same decision, because a guard patrolling a wall
   * that is not there is worse than no guard.
   */
  let elsewhere = 0
  /**
   * What became of each spawn row, in `npcs.json`'s order: `placed`,
   * `elsewhere` (shut ground) or `unplaceable` (no picture).  Kept so a check
   * that compares the bake's rows with the scene's people can ask this loop's
   * own decision instead of counting a row the scene was never going to place
   * as somebody who went missing.
   */
  const spawnFates: string[] = []
  for (const row of spawns.npcs) {
    if (closedAt(row[0]!, row[1]!)) { elsewhere++; spawnFates.push('elsewhere'); continue }
    const kind = spawns.kinds[row[2]!]!
    const borrowed = BORROWED[kind]
    const art = faceOf(borrowed ? borrowed.art : kind, row[0]!, row[1]!)
    const a = npcArt.kinds[art]
    if (!a) { unplaceable++; spawnFates.push('unplaceable'); continue }
    spawnFates.push('placed')
    const role = spawns.roles[row[5]!]!
    const fight = (spawns.fights && row[7] !== undefined && row[7]! >= 0)
      ? spawns.fights[row[7]!]! : null
    // How much room a body takes, from the length the bake drew it at. People
    // have no `yards` — they are drawn at LPC's own scale, like the player.
    const yards = a.yards ?? 1.2
    const way = spawns.moves?.[row[10] ?? -1] ?? []
    npcs.push({
      x: row[0]!, y: row[1]!, hx: row[0]!, hy: row[1]!,
      z: row[15] ?? 0,
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
      // What is in the hand, and whether there is one in each.  `arm` is a
      // word the atlas has two sheets for; `dual` is `Creature::CanDualWield`
      // (Creature.cpp:3356), which asks only whether the off-hand slot holds
      // something of the weapon class.
      arm: (row[16] ?? -1) >= 0 ? (spawns.arms?.[row[16]!] ?? null) : null,
      dual: !!row[17],
      kind, role, level: row[4]!, seed: row[0]! * 31 + row[1]!,
      topic: row[6]! >= 0 ? spawns.topics[row[6]!]! : null,
      entry: row[9] ?? 0,
      // The world's own identity for this spawn, and who it walks with.
      guid: row[11] ?? 0, pool: row[12] ?? 0, most: row[13] ?? 0,
      leader: row[14] ?? 0,
      /** Standing right now: a shared slot stands up only so many at once. */
      up: true,
      fight, hp: fight ? fight[HP]! : 1, max: fight ? fight[HP]! : 1,
      dead: 0, hurt: -99, knock: null, swung: -99, angry: false,
      next: 0, bleed: null,
      haul: (spawns.hauls && row[8] !== undefined && row[8]! >= 0)
        ? spawns.hauls[row[8]!]! : null,
      looted: false,
      // What comes off the carcass afterwards, and whether it has come off.
      hide: (spawns.hauls && (row[18] ?? -1) >= 0)
        ? spawns.hauls[row[18]!]! : null,
      skinned: false,
      taunted: 0, sunder: null,
      was: { x: row[0] as number, y: row[1] as number },
      ix: row[0] as number, iy: row[1] as number,
      threat: {},
      victim: null, reselect: 0,
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
  const byPoolNpc = new Map<number, Npc[]>()
  for (const n of npcs) {
    if (!n.pool) continue
    const got = byPoolNpc.get(n.pool)
    if (got) got.push(n)
    else byPoolNpc.set(n.pool, [n])
  }
  /**
   * Turn the shared slots to whatever the clock says.
   *
   * Which member stood used to be *the first `most` in file order*, which is
   * a constant — the same rare spawn on the same rock every time the page was
   * opened, for ever.  `src/sim/pools.ts` makes it a function of the wall
   * clock instead, with the period taken from the members' own respawn.
   *
   * The wall clock and not the game's, which is the answer to the wiki's own
   * question about whether respawn time passes while the tab is closed: **it
   * does.**  Coming back tomorrow to a world that has not moved is the thing
   * being fixed.
   */
  const poolTurn = new Map<number, number>()
  const turnPools = (at: number): number => {
    let moved = 0
    for (const [pool, members] of byPoolNpc) {
      const period = members[0]?.back ?? 0
      const turn = cycleOf(period, at)
      if (poolTurn.get(pool) === turn) continue
      poolTurn.set(pool, turn)
      moved += 1
      const up = new Set(standing(pool, members.map((_m, i) => i),
        members[0]?.most || members.length, period, at))
      members.forEach((m, i) => { m.up = up.has(i) })
    }
    return moved
  }
  turnPools(Date.now() / 1000)
  {
    const asleep = npcs.filter((n) => n.pool && !n.up).length
    if (asleep) console.info(`${asleep} spawns are waiting their turn in a pool`)
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
  // A crossing that leads out of the slice leads nowhere, so it is not there.
  // Two of the five in the box land on Westfall's bank, and a bridge with one
  // end in the dark is an invitation to walk into it.
  const spans = meta.doodads
    .filter((d) => !outside(d.x, d.y))
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
  type Doodad0 = (typeof meta.doodads)[number]
  /**
   * One placement, turned into the thing the scene walks around in.
   *
   * A function rather than the body of one `map`, because **a mine goes
   * through it too** since issue 219 and a second copy of ninety lines is a
   * second copy that drifts.  What a mine is not is in `BUILT`: nothing draws
   * a roof over a gallery that is under a hill.
   */
  const builtFrom = (d: Doodad0) => {
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
        // And whether anything stands over a man's head, which is the one
        // thing that says a courtyard is not a room: a roof over a room is a
        // flat face above head height and the sky over a yard is nothing at
        // all.  The bake was throwing that face away as "not near this
        // storey".
        over: bytesOf(raw[8] ?? ''),
        // And the way up, which the height filter used to throw away with the
        // stairs: `steepness` reads a tread as walkable, but a tread halfway
        // between two floors is near neither, so both floors came out with
        // nothing between them.
        steps: bytesOf(raw[9] ?? ''),
        // And how high each of those treads is: a byte for each set cell of
        // `steps`, in cell order, eighths of a yard above this storey's sill
        // — see `rises` in the bake.  Which end of a flight is the top.
        rise: bytesOf(raw[10] ?? ''),
        // The turn that takes the model's space to the map, in radians.
        c: Math.cos(((d.mr ?? 0) * Math.PI) / 180),
        sn: Math.sin(((d.mr ?? 0) * Math.PI) / 180),
      } : null
      // The floors above this one, in the same shape, so the scene has
      // something to join to when it learns to climb (issue 170).  Read here
      // rather than when somebody walks upstairs: it is four masks a storey
      // and thirty-nine storeys in the whole world.
      const floors = ((d.p ? (meta.floors ?? {})[String(d.p)] : undefined) ?? [])
        .map((f) => ({
          z: f[0],
          w: f[1], h: f[2], s: f[3], x0: f[4], y0: f[5],
          bits: bytesOf(f[6]), solid: bytesOf(f[7]), floor: bytesOf(f[8]),
          over: bytesOf(f[9]), steps: bytesOf(f[10] ?? ''), rise: bytesOf(f[11] ?? ''),
          c: Math.cos(((d.mr ?? 0) * Math.PI) / 180),
          sn: Math.sin(((d.mr ?? 0) * Math.PI) / 180),
        }))
      const rooms = (d.rooms ?? []).map(([x, y, l, w, deg]) => {
        const t = (deg * Math.PI) / 180
        return { x, y, l, w, c: Math.cos(t), s: Math.sin(t) }
      })
      return {
        x: d.x, y: d.y, l: d.bl!, w: d.bw!,
        /**
         * The model origin's own height, which is what the floors' sills are
         * measured from — they come out of the model's portals and stay in
         * the model's space.  Carried since issue 221: without it nothing
         * could say which storey a barrel is on.
         */
        z: d.z,
        c: Math.cos(a), s: Math.sin(a), k: d.k,
        area: d.a ?? 0,
        /** The bake's number for this placement, which its furniture cites. */
        house: d.h ?? 0,
        /** Where you go in — see `d` on the doodad. */
        doors: (d.d ?? []) as Door[],
        /**
         * The doorways of the storeys above, `[storey, x, y]` — see `du`.
         * Never in `doors`: that is the way in from outside to everything
         * that reads it, and a doorway on the gallery is not one.
         */
        upDoors: d.du ?? [],
        /** With no door, how much of it is at the ground — see `g`. */
        ground: d.g ?? null,
        /** And what is above it, ground floor first excluded. */
        floors,
        plan,
        rooms: rooms.length ? rooms : [{
          x: d.x, y: d.y, l: d.bl!, w: d.bw!,
          c: Math.cos(a), s: Math.sin(a),
        }],
      }
  }
  const buildings = meta.doodads
    .filter((d) => BUILT.has(d.k) && !!d.bl && !!d.bw)
    .map(builtFrom)
  /**
   * **And the mines the client actually drew**, which is issue 219.
   *
   * `classify_wmo` answered `None` for every one of them — *a hole in a
   * hillside, not a cottage* — and `None` means the placement is dropped, so
   * no plan was ever rasterised and the scene made its own.  Fourteen of them
   * stand in the slice with winding galleries, side rooms, dead ends and pit
   * props, and the game was digging circles beside them.
   *
   * They come through the same path as a building because they *are* one in
   * every way that matters here: a WMO with its own triangles, its own floor
   * and its own walls.  The one thing that is different is which way its faces
   * point — a mine's up-facing triangles are its **floor**, which is why the
   * plan comes out as the gallery and why `BUILT` does not contain `mine`.
   */
  const quarried = meta.doodads
    .filter((d) => d.k === 'mine' && !!d.p && !!d.bl && !!d.bw)
    .map(builtFrom)
  /**
   * The mines, which are not buildings and cannot be.
   *
   * A building is a WMO: its own file, its own walls, its own doors, and this
   * repository rasterises all three.  A mine is not.  Elwynn's are cut out of
   * the `.adt` terrain itself and their mouths are bits in a chunk's `holes`
   * field — and **a height field cannot hold a tunnel**, because one (x, y)
   * has one z.  There is no inside to read.  `bake_terrain.py` knew it and
   * said so: *a mine mouth and an animal den are holes in a hillside, not
   * cottages, and there is no picture here for either.*
   *
   * But the server knows where its creatures stand, and that is the same
   * structural fact the heights already lean on.  **Eighty-nine creatures in
   * this slice stand six yards or more below the baked surface**, and where
   * they are is where the mine is.
   *
   * **The passages between them are ours, and that has to be said out loud.**
   * The server states positions, not whether the rock between two kobolds is
   * tunnel or stone.  So they are *derived* rather than drawn — a minimum
   * spanning tree over the cloud, widened — which means the same world is
   * always the same mine and there is nothing to store; and the readout says
   * the cave is ours the same way it says the synthesised terrain is.
   *
   * **Every number here used to be one somebody picked, and every one of them
   * is a function of something the world already states.**  Issue 210 asked
   * where the passage width came from and the honest answer was the screen.
   *
   *   * A **passage** is a place a man walks, which is the same definition a
   *     wall already has here: `BODY_YARDS`, the client's own human collision
   *     box, 2.03 yards.  Half of it is the radius and half a cell is added on
   *     top, because the mask is sampled at its own 1.33 pitch and a disc of
   *     radius `r` comes back at least `2r - cell` across — so `2.03` survives
   *     the sampling rather than being pinched to one cell.  It was 3.2, and
   *     3.2 is a corridor six and a half yards wide, which is a road.
   *   * A **chamber** is a place a creature lives, so it is that creature's
   *     own `creature.wander_distance` plus a passage's width.  It was 5.5 for
   *     everybody, which is too small for the kobolds whose leash is 7 and
   *     four times too big for the thirty-odd who do not move at all.
   *   * A **mouth** is the client's: a `holes` bit is two by two height cells,
   *     8.33 yards square, so its radius is `U`.  It was `3.2 * 1.4`, which is
   *     the same number by accident and says nothing.
   *
   * **And a cave is a cluster, not an area.**  Grouping the deep creatures by
   * `areaOf` was the last invented rule and the dearest: the area grid is on a
   * 33-yard pitch and a mine's inside often has no cell of its own, so area 12
   * — 엘윈 숲 itself — held **nineteen creatures in two warrens** and got no
   * mine at all, while area 9's one mine is really two warrens of seven joined
   * across the hill.  They are chained by `creature_template.detection_range`
   * now: two creatures that can notice each other are in the same room in any
   * sense this game has, and that is a column rather than a threshold.
   */
  const DOWN = 6
  const CAVE_CELL = 32 / 24
  /** A passage is a place a man walks, and still is after the mask samples it. */
  const CAVE_WIDE = BODY_YARDS / 2 + CAVE_CELL / 2
  /**
   * How many creatures make a warren worth digging.
   *
   * Declared rather than derived, and the count of what it leaves out is in
   * `__caves().lost` — the same bargain `audit.py` makes with a default.  Two
   * or three creatures under a hillside is as likely to be a spawn the height
   * grid is wrong about as a cave: the three in area 87 sit seven yards down,
   * which is one yard past the bar for being underground at all.
   */
  const CREW = 6
  /** How far a creature reaches from where it stands, chamber included. */
  const chamberFor = (n: { wander: number }) => n.wander + CAVE_WIDE
  function digCave(crew: Npc[], mouth: [number, number]) {
    const pad = Math.max(...crew.map(chamberFor)) + 3
    // The mouth is part of the cave.  It has to be: the client's hole is on
    // the hillside and the nearest kobold can be eighty yards in, so a mask
    // drawn round the cloud alone left the way in outside the cave — and
    // walking through it arrived in the dark with nothing drawn at all.
    const xs = [...crew.map((n) => n.x), mouth[0]]
    const ys = [...crew.map((n) => n.y), mouth[1]]
    const lo = { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad }
    const hi = { x: Math.max(...xs) + pad, y: Math.max(...ys) + pad }
    const cx = (lo.x + hi.x) / 2, cy = (lo.y + hi.y) / 2
    const cell = CAVE_CELL
    // Model space, with no turn in it: `planCell` reads lx from the world's
    // -y and ly from its x, so the plan is laid out that way and the two
    // agree by construction rather than by a fudge.
    const w = Math.ceil((hi.y - lo.y) / cell), h = Math.ceil((hi.x - lo.x) / cell)
    const x0 = -(hi.y - cy), y0 = lo.x - cx
    const bits = new Uint8Array(Math.ceil((w * h) / 8))
    const dig = (wx: number, wy: number, r: number) => {
      const lx = -(wy - cy), ly = wx - cx
      const i0 = Math.floor((lx - r - x0) / cell), i1 = Math.ceil((lx + r - x0) / cell)
      const j0 = Math.floor((ly - r - y0) / cell), j1 = Math.ceil((ly + r - y0) / cell)
      for (let i = Math.max(0, i0); i <= Math.min(w - 1, i1); i++) {
        for (let j = Math.max(0, j0); j <= Math.min(h - 1, j1); j++) {
          const px = x0 + (i + 0.5) * cell, py = y0 + (j + 0.5) * cell
          if ((px - lx) ** 2 + (py - ly) ** 2 > r * r) continue
          const n = i * h + j
          bits[n >> 3]! |= 1 << (n & 7)
        }
      }
    }
    for (const n of crew) dig(n.x, n.y, chamberFor(n))
    dig(mouth[0], mouth[1], MOUTH)
    // The adit: the tunnel from the mouth to the chamber nearest it.
    {
      let first = crew[0]!
      let gap = Infinity
      for (const n of crew) {
        const d = (n.x - mouth[0]) ** 2 + (n.y - mouth[1]) ** 2
        if (d < gap) { gap = d; first = n }
      }
      const far = Math.hypot(first.x - mouth[0], first.y - mouth[1]) || 1
      for (let t = 0; t <= far; t += cell * 0.7) {
        dig(mouth[0] + ((first.x - mouth[0]) * t) / far,
          mouth[1] + ((first.y - mouth[1]) * t) / far, CAVE_WIDE)
      }
    }
    // And the passages: a minimum spanning tree over the cloud, widened.  Not
    // a maze and not a random walk — the shortest set of corridors that joins
    // every chamber, which is a function of the positions alone.
    const done = [0]
    const left = crew.map((_, i) => i).slice(1)
    while (left.length) {
      let best = -1, from = 0, gap = Infinity
      for (const a of done) {
        for (let k = 0; k < left.length; k++) {
          const b = left[k]!
          const d = (crew[a]!.x - crew[b]!.x) ** 2 + (crew[a]!.y - crew[b]!.y) ** 2
          if (d < gap) { gap = d; best = k; from = a }
        }
      }
      const to = left.splice(best, 1)[0]!
      done.push(to)
      const a = crew[from]!, b = crew[to]!
      const far = Math.hypot(a.x - b.x, a.y - b.y)
      for (let t = 0; t <= far; t += cell * 0.7) {
        dig(a.x + ((b.x - a.x) * t) / far, a.y + ((b.y - a.y) * t) / far, CAVE_WIDE)
      }
    }
    return { crew, x: cx, y: cy, w, h, cell, x0, y0, bits }
  }

  /**
   * The mines, as buildings whose plan is derived rather than read.
   *
   * Everything a room needs — an outline, a door, a floor — is the same
   * whether the shape came out of a WMO's triangles or out of where the
   * server stands its kobolds, so a cave *is* a building here and the whole
   * door-and-room machinery works on it unchanged.  What is different is
   * where the shape came from, and the readout says so.
   *
   * The mouth is the client's own: a chunk's `holes` bits, which the bake
   * already carries, nearest the cloud.
   */
  /**
   * The mines.  `fromModel` says which of them the client drew and which this
   * scene derived — issue 219 asked for that to be visible rather than
   * guessable, because the two are the same shape once they are in the list.
   */
  const caves: (Built & { fromModel: boolean })[] = []
  /**
   * Whether a place is a warren this scene cut for itself, which is the only
   * kind of mine the readout may call ours.  Asked of the list and not of `k`:
   * a mine the client drew and a mine `digCave` made are both `k: 'mine'`.
   */
  const dugByUs = (b: Built | null): boolean =>
    !!b && b.k === 'mine' && caves.some((c) => c === b && !c.fromModel)
  /** What `digCave` would have made of a warren the client had a model for. */
  const wouldDig = new Map<number, { cells: number[]; dug: number }>()
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
   * `planCell` backwards: a point in the model's own space, in the world.
   *
   * The turn in `planCell` is its own inverse — the matrix is symmetric and
   * its square is one — so the same four numbers take a model point back out.
   */
  const fromPlan = (p: Plan, b: Built, lx: number, ly: number) =>
    [b.x + lx * p.sn + ly * p.c, b.y - (lx * p.c - ly * p.sn)] as const

  /**
   * A building's outline as one shape, **in the model's own axes**.
   *
   * The scene drew a big building by stamping a roof tile on every 1.33 yard
   * square of the world its outline covered, and the world's grid is not the
   * building's: Northshire's abbey is turned 158.5 degrees, so every wall of it
   * came out as a staircase.  That is issue 216, and what fixes it is not finer
   * tiles — it is drawing the building **once, in its own frame**, and letting
   * the canvas turn it.
   *
   * The path is in *cell* units, because the plan is a bitmap and a run of set
   * bits along a row is a rectangle.  One rectangle per run, unioned by the
   * fill: the abbey's 4,900 cells come to a few hundred rectangles and its
   * walls are straight lines again — straight in model space, which is where
   * the building was built, and turned as a whole afterwards.
   *
   * Traced once a model and kept on the plan, which is shared by every
   * placement of it: thirteen farms are one trace.
   */
  /**
   * Which of a building's own part boxes get a roof laid over them.
   *
   * One function and not two, because the check and the drawing are asking
   * the same question and a second copy of a rule is a rule that drifts — the
   * shape this file has paid for more than once.
   *
   * Two things disqualify a box.  It has to be **big enough for the kit**: the
   * roof block is five tiles across and six along, so anything under that has
   * no ridge to run and keeps the flat fill.  And it has to be **mostly inside
   * the footprint**, which is issue 218's finding made into a filter: `MOGI`
   * groups include the grounds and the yard walls, so the abbey's own list has
   * boxes that are ninety yards of field, and a roof over one of those roofs
   * the garden.
   */
  const roofedCache = new WeakMap<Built, { boxes: { r: Built['rooms'][number];
    n: number; m: number; swap: boolean }[]; covered: number }>()
  const roofedBoxes = (b: Built, p: Plan) => {
    // **Worked out once a building and kept.**  It was asked every frame, and
    // it samples the plan mask over the box — a forty-five yard box is three
    // hundred `planCell` lookups — so at Goldshire, where the glass is mostly
    // buildings, forty-three of them came to a quarter of the frame.  Nothing
    // in it moves: the box, the plan and the turn are all the placement's.
    const had = roofedCache.get(b)
    if (had) return had
    const out: { r: Built['rooms'][number]; n: number; m: number;
      swap: boolean }[] = []
    for (const r of b.rooms) {
      const n = Math.round((2 * r.l) / YD_PER_TILE)
      const m = Math.round((2 * r.w) / YD_PER_TILE)
      const swap = r.l > r.w
      if ((swap ? m : n) < 5 || (swap ? n : m) < 6) continue
      // **And a compound is not a roof.**  `MOGI` gives a group a box, and
      // some of those groups are the whole site: Goldshire's inn has one of
      // 132 by 151 yards, which is the village.  A gabled roof laid over that
      // is a single ridge a hundred and fifty yards long, and what it looks
      // like is a tent over a town.  Sixty yards is the longest thing in this
      // world that is actually one roof — the abbey's nave is fifty-two — and
      // anything above it keeps the flat fill, which says *there is a
      // building here* and claims nothing about its shape.
      if (Math.max(2 * r.l, 2 * r.w) > 60) continue
      let on = 0, of = 0
      for (let i = 0; i < n; i += 2) {
        for (let j = 0; j < m; j += 2) {
          const a = -r.l + (i + 0.5) * YD_PER_TILE
          const q = -r.w + (j + 0.5) * YD_PER_TILE
          of++
          if (bitAt(p.bits, planCell(p, b,
            r.x + a * r.c - q * r.s, r.y + a * r.s + q * r.c))) on++
        }
      }
      if (on >= of * 0.6) out.push({ r, n, m, swap })
    }
    /**
     * And **how much of the footprint those boxes actually reach**, which
     * decides what goes underneath them.
     *
     * A building the kit covers gets one flat colour under it, because the
     * roof is drawn over the whole of it; one it does not gets the repeating
     * picture, because there the fill *is* the roof.  Chosen the other way
     * round first, and the middle of Goldshire came out as thirty yards of
     * featureless mauve — the boxes covered a third of that footprint and the
     * other two thirds had one colour and nothing on it.
     */
    let inside = 0, reached = 0
    for (let i = 0; i < p.w; i += 2) {
      for (let j = 0; j < p.h; j += 2) {
        if (!bitAt(p.bits, i * p.h + j)) continue
        inside++
        const lx = p.x0 + (i + 0.5) * p.s, ly = p.y0 + (j + 0.5) * p.s
        const u = lx * p.sn + ly * p.c, v = lx * p.c - ly * p.sn
        const wx = b.x + u, wy = b.y - v
        for (const { r } of out) {
          const ex = wx - r.x, ey = wy - r.y
          if (Math.abs(ex * r.c + ey * r.s) <= r.l
            && Math.abs(-ex * r.s + ey * r.c) <= r.w) { reached++; break }
        }
      }
    }
    const got = { boxes: out, covered: inside ? reached / inside : 0 }
    roofedCache.set(b, got)
    return got
  }

  const planPaths = new Map<Plan, { path: Path2D; cells: number; runs: number }>()
  const planPath = (p: Plan) => {
    let got = planPaths.get(p)
    if (got) return got
    const path = new Path2D()
    let cells = 0, runs = 0
    for (let j = 0; j < p.h; j++) {
      let run = -1
      for (let i = 0; i <= p.w; i++) {
        const on = i < p.w && bitAt(p.bits, i * p.h + j)
        if (on) cells++
        if (on && run < 0) run = i
        else if (!on && run >= 0) {
          path.rect(run, j, i - run, 1); runs++; run = -1
        }
      }
    }
    got = { path, cells, runs }
    planPaths.set(p, got)
    return got
  }
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
  /**
   * Where a building's plan lies in the world, which is not round its
   * placement.
   *
   * A placement's `x, y` is the model's **origin**, and `bl`/`bw` are the half
   * sizes of the box its record states — so a box centred on the origin is the
   * building only when the model was built round its own middle.  The city
   * wall's piece was built from one end: 48 yards long with its origin at
   * nought, so 26 yards either side of that point left the far half of every
   * wall piece outside every building, and a man walked straight through the
   * wall on the lines where its plan was never asked (issue 168).  The plan is
   * in the model's space and says where it is, so the index is built round
   * the plan's own rectangle — `planCell` read backwards, which is its own
   * inverse.
   */
  const reachOf = (b: (typeof buildings)[number]) => {
    const p = b.plan
    if (!p) return { x: b.x, y: b.y, r: Math.max(b.l, b.w) + 2 }
    const [x, y] = fromPlan(p, b, p.x0 + (p.w * p.s) / 2, p.y0 + (p.h * p.s) / 2)
    return { x, y, r: Math.hypot(p.w * p.s, p.h * p.s) / 2 + 2 }
  }
  const blocksOf = new Map<number, typeof buildings>()
  for (const b of buildings) {
    const { x: bx, y: by, r: reach } = reachOf(b)
    for (let i = Math.floor((bx - reach) / BLOCK); i <= Math.floor((bx + reach) / BLOCK); i++)
      for (let j = Math.floor((by - reach) / BLOCK); j <= Math.floor((by + reach) / BLOCK); j++) {
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
      // The footprint if the model gave one, and its boxes if it did not.
      //
      // A plan is its own first test: outside its rectangle `planCell` is -1
      // after four multiplications.  The box round the placement used to come
      // first, and for a model not built round its middle that box is the
      // wrong half of the building — see `reachOf`.
      const p = b.plan
      if (p) {
        if (bitAt(p.bits, planCell(p, b, wx, wy))) return b
        continue
      }
      // The whole box first, so a point outside costs one test and not
      // fourteen.
      const dx = wx - b.x, dy = wy - b.y
      if (Math.abs(dx * b.c + dy * b.s) > b.l + 2) continue
      if (Math.abs(-dx * b.s + dy * b.c) > b.w + 2) continue
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
  /**
   * Whose roof is over this spot, or null for the open sky.
   *
   * Not `inRoom`, which answers *inside whose outline* — and an outline is a
   * silhouette, so it says yes over a courtyard and over the ground beside a
   * building that its eaves happen to reach.  96 of the slice's people stand
   * inside an outline and **only 88 of them have anything over their heads**;
   * the other eight are in the abbey's yard, and hiding them from outside was
   * hiding somebody standing in the open air.
   *
   * The mask is the one issue 160 baked for exactly this question.
   */
  const roofOver = (wx: number, wy: number) => {
    const b = inRoom(wx, wy)
    if (!b) return null
    const p = b.plan
    if (!p || !p.over.length) return b
    return bitAt(p.over, planCell(p, b, wx, wy)) ? b : null
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
  /**
   * Where a man cannot **be**, which is not where he cannot go.
   *
   * The slope half of it used to be `stepAt` — the worst step out of the cell
   * in any direction — and that is the wrong question twice over.  A man on a
   * ledge beside a bank is standing perfectly well; what stops him is having
   * to climb the bank, and he only has to do that if he is going that way.
   * So a cell holds him if there is any direction he could have stepped on to
   * it from, which is the gentlest of the four and not the worst.
   *
   * Whether he can get from here to there is `climb`, asked of the step.  One
   * question each, and the two of them agree — which is the thing that was
   * missing: `footing` and `blocked` disagreed by thirteen times and nothing
   * said why, so a round closed on whichever of the two happened to pass.
   */
  const blocked = (wx: number, wy: number) =>
    (onSpan(wx, wy) ? false : Math.min(
      climb(wx, wy, wx + U, wy), climb(wx, wy, wx - U, wy),
      climb(wx, wy, wx, wy + U), climb(wx, wy, wx, wy - U)) > CLIFF)
    || footing(wx, wy)
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
    // Indoors the world is the room, and nothing else is anywhere.  A wall is
    // the plan's own stone; off the plan is not a place.
    if (indoors) {
      if (!planNow()) return false
      return !roomOpen(wx, wy) || npcAt(wx, wy, null)
    }
    // The edge of the slice is the edge of the world, and it had no wall.
    //
    // `outside()` asks the area grid, which answers nought past the bake's own
    // rectangle — and nought is "the grid has no answer here" rather than
    // "somewhere else", quite rightly, because an unmapped chunk in the middle
    // of the forest is still the forest.  So nothing at all stopped a walk out
    // of the slice: forty yards past every one of its four sides was open
    // ground, over terrain the bake never wrote.
    //
    // `slice.json`'s own four numbers are the answer.  They are where this
    // game is, which is a statement the repository already makes in one place,
    // and past them there is nothing to stand on because nothing was built.
    if (wx < EDGE[0]! || wx > EDGE[1]! || wy < EDGE[2]! || wy > EDGE[3]!) {
      return true
    }
    // Outdoors a building is closed: a roof and a wall all the way round,
    // with the doors the client drew as the only way through.  It used to be
    // open wherever the wall mask happened not to be, which is how you walked
    // into the abbey by leaning on it.
    // Water is not a wall, and it was one for as long as there was no
    // terrain to say how deep it was.  1,469 cells of water within twelve
    // hundred yards of the start and two of them could be entered: Elwynn's
    // streams are waded and its lake is swum, and the island in it is only
    // reachable that way.  What closes a cell now is the ground under the
    // water, not the water — see `depthAt`.
    // Inside a front door's way in, only somebody standing there stops you.
    // The opening is the client's own, and what the scene counts as solid is
    // ours: a cottage near the lumber camp has a piece of its furniture a yard
    // out from the door and another four yards out, and it was the one building
    // in the slice that still could not be walked into.
    const home = inRoom(wx, wy)
    if (home && porchesOf(home).some((q) => toSegment(wx, wy, q) < q.half)) {
      return npcAt(wx, wy, null)
    }
    return (onSpan(wx, wy) ? false : closedAt(wx, wy) || openHole(wx, wy))
      || solidAt(wx, wy) || shutOut(wx, wy) || npcAt(wx, wy, null)
  }
  /**
   * Standing room indoors, on the floor you are on: what `footing` asks of the
   * building once you are inside it, less whoever happens to be standing there.
   *
   * Its own function so that the check which floods a floor from its front
   * door asks the rule a step is held to rather than a copy of it — the first
   * copy, which asked the floor mask round each door, reached one of the
   * abbey's eight doorways while a man could walk to all of them.
   */
  function roomOpen(wx: number, wy: number) {
    const p = planNow()
    if (!p || !indoors) return false
    const n = planCell(p, indoors, wx, wy)
    // A stair is standing room too — it is the one part of a floor that is
    // not flat, and refusing it is refusing the way up.  The floor below's
    // is the way back down, and it is under your feet on this one.
    const under = planUnder()
    const climbable = bitAt(p.steps, n)
      || (!!under && bitAt(under.steps, planCell(under, indoors, wx, wy)))
    return bitAt(p.floor, n) || climbable || atDoor(indoors, wx, wy)
  }
  /**
   * Which way out of a cell nobody can stand in, as a unit vector.
   *
   * Eight directions by three radii, nearest first — the same shape
   * `throughTheDoor` uses when it needs somewhere to put a body, and the same
   * shape for the same reason: it is the cheapest question that cannot answer
   * "nowhere" when there is somewhere.
   *
   * Null when there is no open cell within reach, and that is deliberate: a
   * man in the middle of a mountain has nowhere to be walking *towards*, and
   * the caller lets him move freely rather than pinning him.  What it stops is
   * the common case — one step inside a wall, with open ground a yard away and
   * a hundred yards of rock behind it.
   */
  const REACHES = [1, 2, 4, 8, 14]

  /**
   * What a *placement* must not land on, which is less than what a step must
   * not cross.
   *
   * `footing` answers "may he walk on to this", and that includes two things
   * that have nothing to do with whether a body fits: somebody already
   * standing there, and a building's door policy — a roofed cell of a building
   * you have not walked into is shut whether or not there is stone in it.
   *
   * Put through `footing`, `placeHero` could not put anybody *inside* a
   * building at all: the check that stands the player next to the innkeeper
   * pushed him fourteen yards and out of the inn, because every cell of the
   * inn is shut to somebody who has not come through its door.  What a
   * teleport actually has to avoid is the world being solid where it lands.
   */
  const standable = (wx: number, wy: number) =>
    !(onSpan(wx, wy) ? false : closedAt(wx, wy) || openHole(wx, wy))
    && !solidAt(wx, wy) && !wallAt(wx, wy) && !swimAt(wx, wy)

  function wayOut(wx: number, wy: number,
    ok: (x: number, y: number) => boolean = (x, y) => !footing(x, y)):
  { x: number; y: number } | null {
    for (const r of REACHES) {
      for (let a = 0; a < 8; a++) {
        const t = (a / 8) * Math.PI * 2
        const ux = Math.cos(t), uy = Math.sin(t)
        if (ok(wx + ux * r, wy + uy * r)) return { x: ux, y: uy }
      }
    }
    return null
  }

  /** How near a door has to be to be the door you are standing in. */
  const DOORSTEP = 1.6
  /**
   * How near a door counts as standing in it.
   *
   * A house's is a door's width.  A mine's is the hole the client took out of
   * the hillside, which is 8.33 yards across — asking a player to find the
   * middle of it to within a yard and a half is asking him to find a door
   * that is not drawn.
   */
  /**
   * Which storey a thing at this height is on, numbered the way the player's
   * own `storey` is: `-1` the ground floor, `0` upwards for the rest.
   *
   * A building's sills come out of its own portals and stay in the **model's**
   * space, so they are measured from the placement's `z` rather than from sea
   * level — which is why that number had to start travelling with the
   * building.  Half a body of tolerance, because a barrel stands *on* a floor
   * and a floor has a thickness; the sills here are six to ten yards apart, so
   * nothing is close.
   */
  const storeyOf = (b: { z: number; floors: { z: number }[] }, z: number) => {
    const up = z - b.z
    let n = -1
    for (let i = 0; i < b.floors.length; i++) {
      if (up >= b.floors[i]!.z - BODY_YARDS / 2) n = i
    }
    return n
  }
  const doorstepOf = (b: (typeof buildings)[number]) =>
    b.k === 'mine' ? MOUTH : DOORSTEP
  /**
   * Still inside the building you were inside — asked of *that building*
   * rather than of the index.
   *
   * `inRoom` walks a grid built once from `buildings`, and **a mine is not in
   * it**: mines are dug afterwards, out of where the server stands its
   * creatures, and their plan lies under ground the index has already given to
   * the hillside.  So `throughTheDoor` set `indoors` to the mine, called
   * `step` to put the player on its floor, and `placeHero`'s last line asked
   * the index whose room this was, got nothing, and cleared `indoors` again.
   * A mine could be walked up to and never entered, and the three checks that
   * existed all passed because every one of them asked about the *mask*.
   *
   * The doorstep counts as inside for the same reason it counts as a way in.
   */
  const stillInside = (b: (typeof buildings)[number], wx: number, wy: number) =>
    (b.plan
      ? bitAt(b.plan.bits, planCell(b.plan, b, wx, wy))
      : inRoom(wx, wy) === b) || onDoorstep(b, wx, wy)
  /**
   * A distance and not a box, which matters once a doorstep is wide.
   *
   * A square of half-width `d` reaches `d * root two` at its corners, so
   * `step` putting the player five and a half yards into a mine left him
   * inside a four-yard doorstep — `onStep` never cleared and a man who walked
   * in could not turn round and walk out.  At a yard and a half nobody could
   * tell the difference; at four it is the difference between a door and a
   * room.
   */
  const onDoorstep = (b: (typeof buildings)[number], wx: number, wy: number) =>
    b.doors.some(([dx, dy]) => Math.hypot(dx - wx, dy - wy) < doorstepOf(b))
  /**
   * Where a door lets you stand: its doorstep, and the passage out from it.
   *
   * The passage is a way *to* the door and not a part of the building, so
   * `stillInside` asks the doorstep alone — counted as inside, a teleport on
   * to the path outside a cottage left the scene drawing the cottage.
   */
  const atDoor = (b: (typeof buildings)[number], wx: number, wy: number) =>
    onDoorstep(b, wx, wy) || porchesOf(b).some((q) => toSegment(wx, wy, q) < q.half)
  /**
   * The way in through a front door: the client's own opening, carried out
   * through the eaves to the open.
   *
   * A door is a point the bake takes from the model's portal, and that point is
   * in the *middle* of the wall's thickness, under the roof.  From outside the
   * whole roofed footprint shuts you out, so the doorstep was a disc of 1.6
   * yards sitting inside a silhouette that reaches further than that: the eaves
   * of every cottage in the slice put the door 2.75 yards in from the edge, and
   * the abbey's nearly ten.  The disc touched nothing anybody could stand on, and
   * 24 of the 25 buildings with a door could not be walked into.
   *
   * The portal says the rest.  A front door arrives with which way is out and
   * how wide the opening is, and the way in is that opening carried straight out
   * along it until it leaves the building's own outline — half its width either
   * side, never narrower than a body.  A door between two rooms has no way out to
   * carry, so it opens nothing from outside; a mine's mouth is a hole in a
   * hillside and keeps its disc.
   */
  type Porch = { ax: number; ay: number; bx: number; by: number
    ux: number; uy: number; len: number; half: number; width: number }
  const porches = new Map<(typeof buildings)[number], Porch[]>()
  const porchesOf = (b: (typeof buildings)[number]) => {
    const got = porches.get(b)
    if (got) return got
    const out: Porch[] = []
    if (b.k !== 'mine' && b.plan) {
      for (const door of b.doors) {
        if (door.length !== 5) continue
        const [dx, dy, ox, oy, width] = door
        const n = Math.hypot(ox, oy) || 1
        const ux = ox / n, uy = oy / n
        // Out to where the outline ends, and half a yard on to stand on.  As
        // far as the building itself reaches and no further: a courtyard puts
        // one front door twenty-five yards in, and a number picked below that
        // is how that house came out with no way in at all.
        const reach = 2 * Math.hypot(b.l, b.w)
        let r = 0
        while (r <= reach && inRoom(dx + ux * r, dy + uy * r) === b) r += 0.25
        if (r > reach) continue
        const len = r + 0.5
        out.push({ ax: dx, ay: dy, bx: dx + ux * len, by: dy + uy * len,
          ux, uy, len, width, half: Math.max(width / 2, BODY_YARDS / 2) })
      }
    }
    porches.set(b, out)
    return out
  }
  /**
   * Whether a point is on one of a building's ways in: the passage from a front
   * door out through the eaves, and a doorstep's length in from the door.
   */
  const onPorch = (b: (typeof buildings)[number], wx: number, wy: number) =>
    porchesOf(b).some((q) => toSegment(wx, wy, {
      ax: q.ax - q.ux * DOORSTEP, ay: q.ay - q.uy * DOORSTEP, bx: q.bx, by: q.by }) < q.half)
  const toSegment = (wx: number, wy: number,
    q: { ax: number; ay: number; bx: number; by: number }) => {
    const vx = q.bx - q.ax, vy = q.by - q.ay
    const len2 = vx * vx + vy * vy || 1
    const t = Math.max(0, Math.min(1, ((wx - q.ax) * vx + (wy - q.ay) * vy) / len2))
    return Math.hypot(wx - (q.ax + vx * t), wy - (q.ay + vy * t))
  }
  /**
   * A building, from outside, with its doorways left open.
   *
   * The whole footprint and not just the wall: a closed building has no
   * inside from out here, so its floor stops you the same as its stone does.
   * What does not stop you is a doorstep, which is where the scene changes.
   */
  const shutOut = (wx: number, wy: number) => {
    const b = inRoom(wx, wy)
    if (!b) return wallAt(wx, wy)
    // A front door's way in is the client's own opening, and where the stone
    // mask disagrees with it the portal wins — the argument the bake already
    // makes for a doorstep.  A riser on the steps up to a door is a vertical
    // face, and it put one cell of stone four yards out from a cottage's door
    // with ground to stand on either side of it.
    if (atDoor(b, wx, wy)) return false
    // Open to the sky is not inside.
    //
    // A plan's outline is a silhouette, so "inside the outline" and "inside
    // the building" are not the same thing — a courtyard is in the first and
    // not the second, and the abbey has one.  Shutting the whole silhouette
    // shut the yard as well, which is why 21 of the slice's buildings had no
    // door anybody could reach: the doorstep was an island in a block of
    // stone the size of the grounds.
    //
    // What stops you on an open cell is whatever actually stands there, which
    // is the stone and nothing else.
    const p = b.plan
    if (p && p.over.length
      && !bitAt(p.over, planCell(p, b, wx, wy))) return wallAt(wx, wy)
    // **A building nobody can go into cannot shut anybody out.**
    //
    // `shutOut` is "you have not come through the door", and a building with
    // no door has no such state to be in: it is shut for ever, which makes its
    // whole roofed footprint a wall that nothing in the client says is one.
    // Two of them — 80 by 24 yards and 80 by 8, no portal in either — stand
    // across the only way west out of Northshire, and a walk from the start
    // stopped dead on one four-yard cell of the second.  Same argument as the
    // courtyard two lines up: what stops you is what actually stands there,
    // which is the stone.
    if (!b.doors.length) return wallAt(wx, wy)
    return !atDoor(b, wx, wy)
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
    const [gx, gy] = gradient(hero.x, hero.y)
    const len = Math.hypot(gx, gy)
    if (len < 1e-4) return
    // How far the ground falls away **the way he would go**, which is the one
    // direction that matters here.  It was the worst step out of the cell in
    // any of four, so a man standing on a level shelf with a bank beside him
    // was pushed off his own shelf — and the road out of Northshire is exactly
    // that shape for most of its length.  One-sided still, because a central
    // difference smooths a four-yard cliff into a ramp.
    const drop = (groundAt(hero.x, hero.y)
      - groundAt(hero.x - (gx / len) * U, hero.y - (gy / len) * U)) / U
    const over = drop - CLIFF
    if (over <= 0) return
    // Downhill is against the gradient, at a speed that grows with how far
    // past standing the ground is and never beats a run.
    const push = Math.min(RUN_BASE, over * WALK_BASE * 2) * dt
    const nx = hero.x - (gx / len) * push, ny = hero.y - (gy / len) * push
    if (!solidAt(nx, hero.y)) hero.x = nx
    if (!solidAt(hero.x, ny)) hero.y = ny
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
    // What stops a creature that is running — at you, or home afterwards.
    // The same walls the player has.
    //
    // This asked `wetAt` and `solidAt` and nothing else — water and trees —
    // while the player is also stopped by a closed chunk, a hole, and **a
    // building**.  So a wolf came through the wall: of 4,968 straight lines
    // from a target twenty-two yards out, 144 cross a wall the chase rule did
    // not stop.  And it is the half a player sees most, because he is only
    // occasionally somewhere he should not be and a beast chasing him is there
    // the whole time.
    //
    // Which makes running round a corner work, and that is the value of it: a
    // creature that walks through the corner is a creature there is no getting
    // away from.
    const running = (n: Npc, x: number, y: number) =>
      // Water only stops it where it would have to swim.  A wolf will follow
      // you across a ford now and lose you in the lake, which is the
      // difference between water as terrain and water as a wall.
      (!n.swims && swimAt(x, y)) || solidAt(x, y)
      || closedAt(x, y) || openHole(x, y) || shutOut(x, y)
    const tick = Math.floor(time * 0.4)
    for (let i = 0; i < active.length; i++) {
      const n = active[i]!
      n.was.x = n.x; n.was.y = n.y
      // Nobody walks off in the middle of answering you, and the dead lie
      // where they fell.
      if (n.dead) { n.moving = false; continue }
      // Something in a fight is not wandering: it is coming at you, and it
      // ignores the leash the database gave it while it does.
      //
      // **Whatever its wander is.**  This used to come after
      // `if (n.wander === 0 || n === busy) continue`, so the 388 of the slice's
      // 1,369 fightable spawns that stand still stood still when angered too:
      // a boar hit from twelve yards off was twelve yards off three seconds
      // later, angry, and could be shot at for ever.  A creature's
      // `MovementType` is its *idle* movement — `Creature.cpp:570` turns a
      // random mover with no `wander_distance` into `IDLE_MOTION_TYPE`, and
      // that is the slot it stands in — while a fight is
      // `UnitAI::AttackStart` (UnitAI.cpp:32), which calls `MoveChase` on the
      // victim for every creature without asking what it did before.
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
          if (!running(n, nx, n.y)) n.x = nx
          if (!running(n, n.x, ny)) n.y = ny
        }
        continue
      }
      // Nobody walks off in the middle of answering you.
      if (n === busy) { n.moving = false; continue }
      // And whatever gave up on a fight goes back to where it stood:
      // `CreatureAI::EnterEvadeMode` (CreatureAI.cpp:259) ends in
      // `MoveTargetedHome`.  Nothing here did, which cost little while only a
      // wanderer could chase — it stood outside its own circle, refusing every
      // step the leash below would not allow, and only its respawn put it
      // back.  Once a creature that stands still could chase too, a guard post
      // was wherever the last fight ended.  Home is outside the circle and
      // not merely off the spot, so a wanderer resumes wandering at its edge.
      // At the run speed, which is ours: the home movement generator is
      // outside the core checkout `CLAUDE.md` names.
      const home = Math.hypot(n.hx - n.x, n.hy - n.y)
      if (home > n.wander + 1e-6) {
        n.vx = 0; n.vy = 0
        const step = Math.min(home, n.chase * dt)
        const fx = n.x, fy = n.y
        const nx = fx + ((n.hx - fx) / home) * step, ny = fy + ((n.hy - fy) / home) * step
        if (!running(n, nx, n.y)) n.x = nx
        if (!running(n, n.x, ny)) n.y = ny
        n.moving = n.x !== fx || n.y !== fy
        if (n.moving) { n.t += dt; n.dir = facing(n.hx - fx, n.hy - fy) }
        continue
      }
      if (n.wander === 0) { n.moving = false; continue }
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
        wetAt(x, y) || climb(n.x, n.y, x, y) > CLIFF
        || solidAt(x, y) || npcAt(x, y, n)
        // And a building, which this did not ask either.  A spawn standing
        // outside one may not wander into it and a spawn standing inside one
        // may not wander out — the ninety-six the world stands indoors stay
        // indoors, which is the same rule read from both sides.  Asked
        // against where it *is*, so a creature the database put inside is not
        // suddenly walled in by its own house.
        || (shutOut(x, y) !== shutOut(n.x, n.y))
        // **And a roof**, which is the other edge the scene draws by.
        //
        // `shutOut` is where a man may walk and `roofOver` is who is drawn,
        // and they stopped being the same edge twice: a building with no door
        // shuts nobody out (be1db0c) and a front door's way in is open under
        // the eaves (3ab00c8) — and both are still roof.  Measured over the
        // slice's 998 wanderers, six had a leash crossing a roof edge that
        // `shutOut` did not see, and a chicken grazing into a cottage's porch
        // blinked out of the scene and back four times in two minutes.  The
        // draw loop's edge is the one a wanderer must not cross, or it is seen
        // to cross it.
        || (!roofOver(x, y) !== !roofOver(n.x, n.y))
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
    /** The `SkillLine` a lock asks for, or nought for anything openable. */
    trade: number
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
  /**
   * Why a baked object is not standing in the world, by name.
   *
   * The spawns have had this since they were written — `elsewhere`,
   * `unplaceable`, `beyond` — and the objects never did, so 731 of 1,366 went
   * somewhere with nothing to say where.  That is the gate this pipeline keeps
   * on itself everywhere else: **a thing left out is a thing with a name on
   * it**, and a count that does not add up is the only way to notice that a
   * filter has started eating something it was not meant to.
   *
   * `elsewhere` is the big one and it is not a bug: `objects.py` filters by
   * the slice's **rectangle** and the scene filters by the **area** under the
   * point, and the rectangle takes in corners of Westfall, Stormwind and the
   * Burning Steppes.  The two are not the same question — one is where this
   * game is baked and the other is where this game is — and the rectangle is
   * the looser of them on purpose, because a box is what a bake can walk.
   */
  const lostThings: Record<string, number> = {
    elsewhere: 0, unpictured: 0, unsized: 0,
  }
  /**
   * And *which* elsewhere, by the game's own word for the place.
   *
   * "731 elsewhere" says a number is missing; "615 of them are in Stormwind"
   * says what is missing, and the difference is whether somebody reading it
   * can tell a decision from a hole.  The same distinction the bake makes when
   * it names the holiday it dropped a spawn for rather than counting seasons.
   */
  const lostZone: Record<string, number> = {}
  const nodes: Node[] = (things.objects ?? [])
    .filter((r) => {
      if (outside(r[0] as number, r[1] as number)) {
        lostThings['elsewhere'] = (lostThings['elsewhere'] ?? 0) + 1
        const a = areaOf(r[0] as number, r[1] as number)
        const where = zoneOf(a, inside(a))
        lostZone[where] = (lostZone[where] ?? 0) + 1
        return false
      }
      return true
    })
    .map((r) => ({
    x: r[0] as number, y: r[1] as number, kind: r[2] as string,
    face: r[3] as number, trade: r[4] as number, skill: r[5] as number,
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
  /**
   * And the same turn for the gathering slots, which are fifty of them.
   *
   * A herb pool's period is five minutes where a rare spawn's is two hours, so
   * this is the half of the world that visibly moves: walk away from a
   * clearing and walk back and the silverleaf is somewhere else.  That is what
   * the pool is *for* — `restock` below already moved one that was picked, and
   * this moves the ones nobody touched.
   */
  const nodeTurn = new Map<number, number>()
  const turnNodes = (at: number): number => {
    let moved = 0
    for (const [pool, members] of byPool) {
      const period = members[0]?.back ?? 0
      const turn = cycleOf(period, at)
      if (nodeTurn.get(pool) === turn) continue
      nodeTurn.set(pool, turn)
      moved += 1
      const limit = things.pools?.[String(pool)] ?? members.length
      const up = new Set(standing(pool, members.map((_m, i) => i), limit,
        period, at))
      // A member that is on its own cooldown because somebody picked it stays
      // down: the slot turning does not undo the picking.
      members.forEach((m, i) => { m.up = up.has(i) && m.due <= 0 })
    }
    return moved
  }
  turnNodes(Date.now() / 1000)
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
    if (!k || !k.pieces.length) {
      // Our own word for it exists — the bake would have dropped it
      // otherwise — but nothing was cut for that word at this size.
      lostThings['unpictured'] = (lostThings['unpictured'] ?? 0) + 1
      continue
    }
    const pick = k.pieces[Math.floor(hash(n.x, n.y) * k.pieces.length)
      % k.pieces.length]!
    const piece = tilesMeta[pick]
    if (!piece) {
      lostThings['unsized'] = (lostThings['unsized'] ?? 0) + 1
      continue
    }
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
    if (b) { o.in = b; o.storey = storeyOf(b, o.z ?? b.z) }
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
  /**
   * In the water, which standing on a deck over it is not.
   *
   * Walking has asked `onSpan` before the water since the crossings became
   * floors, and this did not: the mask runs on under a bridge because the
   * river does, so a guard, a troll and a townsman put on the road over
   * Stormwind's canals read as swimming and were carried up to twenty-four
   * yards off the bridge the database stood them on (issue 126).  Those five
   * are Stormwind's now and not placed at all, which is why nothing showed it
   * — the rule was still wrong, and the next spawn on a deck over a wet cell
   * would have gone the same way.  So the deck is asked first, in the order
   * `footing` asks it.
   */
  const afloatAt = (x: number, y: number) => !onSpan(x, y) && wetAt(x, y)
  const taken = (x: number, y: number) => afloatAt(x, y) || solidAt(x, y)
  /** Where the database put everybody this moves — see `__npcs().homes`. */
  const spawnOf = new Map<(typeof npcs)[number], [number, number]>()
  const REACH = 6
  /**
   * Which kinds live in water, asked of the kind and not of the individual.
   *
   * The rule used to be "whoever is still in the lake after the search
   * belongs in it", which is a guess wearing the clothes of a fact: it made a
   * cat that rounded into a pond amphibious and it left a townsman standing
   * in one.  A kind is the right unit — the whole point of a murloc is that
   * murlocs live in water — and our own spawn table states it: 162 murlocs
   * and most of them wet, 383 townsfolk and one.
   *
   * **Not `creature_template_movement.Swim`**, which was tried first.  Over
   * this slice that column says all 233 wolves swim and not one of the 162
   * murlocs does.  It answers a different question — may the server move this
   * creature through water at all — and for a wolf chasing you into a lake
   * the answer is yes.
   */
  const wetOf: Record<string, [number, number]> = {}
  for (const n of npcs) {
    const row = wetOf[n.art] ?? (wetOf[n.art] = [0, 0])
    row[0]++
    if (afloatAt(n.x, n.y)) row[1]++
  }
  const lives = new Set(Object.entries(wetOf)
    .filter(([, [all, wet]]) => wet >= 3 && wet / all >= 0.25)
    .map(([art]) => art))
  for (const n of npcs) {
    if (!taken(n.x, n.y)) continue
    spawnOf.set(n, [n.x, n.y])
    // A kind that lives on land gets a wider search before it is given up on:
    // six yards is the size of a rounding error in our own water mask, and
    // past that a townsman in a lake is not a rounding error, he is wrong.
    const far = lives.has(n.art) ? REACH : 24
    for (let ring = 1.5; ring <= far && taken(n.x, n.y); ring += 1.5)
      for (let a = 0; a < 12; a++) {
        const t = (a / 12) * Math.PI * 2
        const px = n.hx + Math.cos(t) * ring, py = n.hy + Math.sin(t) * ring
        if (!taken(px, py)) { n.x = px; n.y = py; settled++; break }
      }
    // Whoever is still standing in it belongs in it, and their own movement
    // test stops asking about water. Wherever they ended up is now home, or
    // they would walk straight back to the lake.
    if (afloatAt(n.x, n.y)) { n.swims = true; afloat++ }
    n.hx = n.x; n.hy = n.y
  }

  // --- and the mines ----------------------------------------------------
  //
  // Dug after the spawns, because the spawns are the shape.  Only areas that
  // have a cloud worth entering: six creatures under the surface is the bar,
  // and in this slice three areas clear it.
  //
  // **A warren is a cluster and the cut is not a number anybody picked.**
  // These were grouped by `areaOf`, and that lost two mines outright: the area
  // grid is on a 33-yard pitch, so a mine's inside often has no cell of its
  // own and falls through to the zone — area 12 is 엘윈 숲 itself and held
  // nineteen creatures in two warrens.  It also welded two warrens of seven
  // into one sprawling plan because they share a hillside.
  //
  // So: a minimum spanning tree over everybody underground, cut where its own
  // edge lengths break.  **Measured, the break is not close**: the longest
  // passage inside a warren is 34 yards and the shortest gap between two is
  // 288, a factor of eight, so every threshold between those two gives the
  // same six warrens and there is nothing to tune.  `__caves().apart` is that
  // ratio, and `viewcheck` fails if it ever stops being decisive — which is
  // the day this rule needs replacing rather than nudging.
  const buried = npcs.filter((n) => n.z < groundAt(n.x, n.y) - DOWN)
  const warren: number[] = buried.map(() => -1)
  let warrens = 0
  let apart = Infinity
  {
    // Prim's, keeping each edge as it is taken.
    const seen = buried.map(() => false)
    const best = buried.map((n) => Math.hypot(n.x - buried[0]!.x,
      n.y - buried[0]!.y))
    const from = buried.map(() => 0)
    const link: [number, number, number][] = []
    seen[0] = true
    for (let step = 1; step < buried.length; step++) {
      let pick = -1
      for (let i = 0; i < buried.length; i++) {
        if (!seen[i] && (pick < 0 || best[i]! < best[pick]!)) pick = i
      }
      if (pick < 0) break
      link.push([best[pick]!, from[pick]!, pick])
      seen[pick] = true
      for (let i = 0; i < buried.length; i++) {
        if (seen[i]) continue
        const d = Math.hypot(buried[pick]!.x - buried[i]!.x,
          buried[pick]!.y - buried[i]!.y)
        if (d < best[i]!) { best[i] = d; from[i] = pick }
      }
    }
    // Where the lengths break, by ratio rather than by difference: a cave of
    // three chambers and a cave of thirty have different scales and a ratio
    // does not care.
    // Two creatures closer together than a body are standing in one chamber,
    // not at the ends of a passage, so the shortest edges cannot be the break:
    // without the floor the biggest ratio in this slice is 1.4 over 0.9.
    const sorted = link.map(([d]) => d).sort((p, q) => p - q)
    let cut = Infinity
    apart = 1
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i]! / Math.max(sorted[i - 1]!, BODY_YARDS)
      if (gap > apart) { apart = gap; cut = sorted[i - 1]! }
    }
    // Join everything the tree holds together below the cut.
    const owner = buried.map((_n, i) => i)
    const root = (i: number): number => (owner[i] === i ? i : (owner[i] = root(owner[i]!)))
    for (const [d, a, b] of link) if (d <= cut) owner[root(a)] = root(b)
    const seenRoot = new Map<number, number>()
    for (let i = 0; i < buried.length; i++) {
      const r = root(i)
      if (!seenRoot.has(r)) seenRoot.set(r, warrens++)
      warren[i] = seenRoot.get(r)!
    }
  }
  for (let g = 0; g < warrens; g++) {
    const crew = buried.filter((_n, i) => warren[i] === g)
    if (crew.length < CREW) continue
    const area = areaOf(crew[0]!.x, crew[0]!.y)
    // The mouth next, because it is part of the cave: the client's own hole
    // nearest a creature standing in this warren.  Nearest to *a kobold* and
    // not to the middle of the cloud — Ant'hill Mine is 186 yards across, so
    // asking from its centre found no mouth at all.  Without one there is no
    // way in, and a mine you cannot enter is not worth digging.
    //
    // **How far away a mouth may be is the warren's own size**, not a flat
    // forty-five: a mine whose chambers span a hundred and eighty yards may
    // have its entrance on a hillside sixty yards from the nearest kobold, and
    // a den six yards across may not claim one eighty yards off.  The forty-
    // five it used to be is the shape of that argument with the measurement
    // left out — one of the three mines it dug cleared it by four yards.
    const mx = crew.reduce((t, n) => t + n.x, 0) / crew.length
    const my = crew.reduce((t, n) => t + n.y, 0) / crew.length
    const reach = Math.sqrt(Math.max(...crew
      .map((n) => (n.x - mx) ** 2 + (n.y - my) ** 2)))
    let mouth: [number, number] | null = null
    let near = Math.max(reach, MOUTH) ** 2
    for (const [i, j] of meta.gaps ?? []) {
      const hx = x0 - i * U, hy = y0 - j * U
      for (const n of crew) {
        const d = (hx - n.x) ** 2 + (hy - n.y) ** 2
        if (d < near) { near = d; mouth = [hx, hy] }
      }
    }
    if (!mouth) continue
    /**
     * **The client's own gallery first, and ours only if there is none.**
     *
     * Issue 219.  `digCave` is not deleted and must not be — fourteen of the
     * slice's mines are modelled and the rest of the world's holes are not,
     * and a warren of kobolds under a hillside with no WMO anywhere near it is
     * still a mine.  What changed is the *order*: a plan that somebody drew
     * beats a plan we derived, every time.
     *
     * Which model, decided by counting rather than by distance: the one whose
     * own footprint holds the most of this warren.  A mine is a hundred and
     * eighty yards long and bent, so "nearest to the middle" picks the wrong
     * one — the same mistake the mouth search already had to unlearn.
     */
    let model: (typeof quarried)[number] | null = null
    let held = 0
    for (const q of quarried) {
      const p = q.plan
      if (!p) continue
      let in_ = 0
      for (const n of crew) if (bitAt(p.bits, planCell(p, q, n.x, n.y))) in_++
      if (in_ > held) { held = in_; model = q }
    }
    if (model) {
      for (const n of crew) n.cave = caves.length
      // **And what we would have dug here**, kept so the difference can be
      // asserted rather than asserted about.  Issue 219's own wording: *the
      // plan of a mine that has a model differs from `digCave`'s*.  Computing
      // it is the only honest way to say so — a check that compares the model
      // against nothing is a check that would pass if the model were ignored.
      const alt = digCave(crew, mouth)
      if (alt) {
        let n = 0
        for (let k = 0; k < alt.w * alt.h; k++) {
          if ((alt.bits[k >> 3]! >> (k & 7)) & 1) n++
        }
        wouldDig.set(caves.length, {
          cells: [alt.w, alt.h], dug: Math.round((100 * n) / (alt.w * alt.h)),
        })
      }
      // The mouth is the terrain's, not the model's.  **None of the fourteen
      // has a portal**: a mine's way in is a hole the client cut out of its
      // own ground (`gaps`), which is the same thing `digCave` has always
      // looked for and the reason issue 210 had to find it in the first place.
      mouths.push(mouth)
      caves.push({ ...model, k: 'mine', area, doors: [mouth], fromModel: true })
      continue
    }
    const dug = digCave(crew, mouth)
    if (!dug) continue
    for (const n of dug.crew) n.cave = caves.length
    mouths.push(mouth)
    caves.push({
      x: dug.x, y: dug.y, l: (dug.h * dug.cell) / 2, w: (dug.w * dug.cell) / 2,
      ground: null,
      // The mouth's own height: a cave this scene dug has no model, so there
      // is nothing else for a storey to be measured from — and it has one.
      z: groundAt(mouth[0], mouth[1]),
      c: 1, s: 0, k: 'mine', area, house: 0, doors: [mouth], upDoors: [],
      // A cave has one floor by construction: it is cut out of the height
      // grid, and the height grid has one z for an (x, y).
      floors: [],
      plan: {
        w: dug.w, h: dug.h, s: dug.cell, x0: dug.x0, y0: dug.y0,
        bits: dug.bits, solid: new Uint8Array(dug.bits.length), floor: dug.bits,
        // A cave is roofed everywhere it exists — that is what makes it a
        // cave rather than a quarry — and it has one floor, so no stairs.
        over: dug.bits, steps: new Uint8Array(0), rise: new Uint8Array(0),
        c: 1, sn: 0,
      },
      rooms: [{ x: dug.x, y: dug.y, l: (dug.h * dug.cell) / 2,
        w: (dug.w * dug.cell) / 2, c: 1, s: 0 }],
      fromModel: false,
    })
  }
  /**
   * **And the mines nobody is standing in**, which are most of them.
   *
   * The loop above digs a mine where a *warren* is, because before issue 219
   * a cluster of creatures was the only evidence a mine existed.  It is not
   * any more: fourteen of them are in the client, and eleven hold fewer than
   * `CREW` creatures — an animal den with two wolves in it, a burrow with
   * none.  A gallery the client drew is a gallery whether or not anybody
   * lives down there, and leaving those out would be keeping the old rule
   * after its reason had gone.
   *
   * The mouth is the same terrain hole the warrens use, and a mine with none
   * is left out: there is no way in, and a room with no door is a room nobody
   * can find out about.
   */
  for (const q of quarried) {
    if (caves.some((c) => c.plan === q.plan && c.x === q.x && c.y === q.y)) continue
    const p = q.plan
    if (!p) continue
    const reach = Math.max(q.l, q.w) + MOUTH
    let mouth: [number, number] | null = null
    let near = reach * reach
    for (const [i, j] of meta.gaps ?? []) {
      const hx = x0 - i * U, hy = y0 - j * U
      const d = (hx - q.x) ** 2 + (hy - q.y) ** 2
      if (d < near) { near = d; mouth = [hx, hy] }
    }
    if (!mouth) continue
    mouths.push(mouth)
    caves.push({ ...q, k: 'mine', doors: [mouth], fromModel: true })
  }
  /**
   * And who is in which, asked of the plans rather than of the clustering.
   *
   * The warren loop hands a creature its mine as a side effect of the tree it
   * builds, which only reaches the ones it clustered.  Everything else that
   * stands under the surface is asked the plain question — *is it inside one
   * of these footprints* — so a wolf alone in a den is in the den.
   */
  for (const n of npcs) {
    if (n.cave !== undefined) continue
    if (n.z >= groundAt(n.x, n.y) - DOWN) continue
    for (let i = 0; i < caves.length; i++) {
      const p = caves[i]!.plan
      if (p && bitAt(p.bits, planCell(p, caves[i]!, n.x, n.y))) { n.cave = i; break }
    }
  }
  const byArea: Record<number, number> = {}
  for (const n of npcs) {
    if (n.z < groundAt(n.x, n.y) - DOWN) {
      const a = areaOf(n.x, n.y)
      byArea[a] = (byArea[a] ?? 0) + 1
    }
  }
  console.info(`${caves.length} mines dug; under the surface: `
    + Object.entries(byArea).map(([a, n]) => a + ':' + n).join(' '))

  /**
   * And anybody the walls closed on.
   *
   * The same nudge the water gets, for the same reason and with the same
   * limit: a spawn is the server's and it is a fact, but a wall is ours — a
   * 1.33 yard mask cut out of the model's triangles — and a monk standing
   * against the nave wall rounds into it.  Nine of the slice's 1,886 did.  A
   * yard and a half at a time out to six, which is the same reach the water
   * gets and for the same reason — six yards is how wrong a mask sampled at
   * 1.33 can be about a wall two cells thick.  Past that he stays where the
   * server put him, and the count says how many that is.
   */
  let walled = 0
  for (const n of npcs) {
    if (!wallAt(n.x, n.y)) continue
    for (let ring = 1.5; ring <= 6 && wallAt(n.x, n.y); ring += 1.5)
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
  // Where a new character stands, out of `playercreateinfo` through
  // `pipeline/player.py`.  Issues 78 and 97: this was `[-8949.95, -132.493]`
  // typed here while `player.json` had baked the same row since the day it
  // was written and `synth_terrain.py` typed it a third time — three copies
  // that agreed because nobody had changed the table.  `bordercheck` fails if
  // those digits are typed into `src/` again.
  //
  // No fallback, on purpose.  A world with no roster has no classes, no
  // levels and no stats either, and a made-up square to stand on would be the
  // one part of that failure that looked fine.
  if (!roster?.start || roster.start.length < 2)
    throw new Error('player.json has no start: there is nowhere to stand')
  const START: [number, number] = [roster.start[0]!, roster.start[1]!]
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
    // Not where you asked, but the nearest place a man can be.
    //
    // This used to put him down wherever it was told and ask nothing, and
    // there are five callers: charging, the graveyard, walking through a door,
    // and two hooks the checks drive.  Only `throughTheDoor` looked first.
    // Measured over the world's 1,464 targets from eight directions each,
    // **843 of 9,872 charges — one in twelve — landed inside something**, and
    // a landing inside something is the whole of the other half of this
    // (issue 164): once he is in a rock the rules that stop him leaving one
    // are the rules that let him walk through walls.
    //
    // The search is `wayOut`'s, which is `throughTheDoor`'s: eight directions
    // by three radii, nearest first.  If there is nowhere at all he goes where
    // he was told, because refusing to move him is how a teleport becomes a
    // way to be nowhere.
    if (!standable(x, y)) {
      const out = wayOut(x, y, standable)
      if (out) {
        for (const r of REACHES) {
          if (standable(x + out.x * r, y + out.y * r)) {
            x += out.x * r; y += out.y * r
            break
          }
        }
      }
    }
    hero.x = x; hero.y = y
    hero.was.x = x; hero.was.y = y
    hero.ix = x; hero.iy = y
    // Being put down outside a building is leaving it.
    //
    // `indoors` is only ever cleared by walking back over the doorstep, which
    // is right for walking and wrong for every other way of moving: a
    // graveyard is not in the inn, and a teleport out of the abbey left the
    // scene drawing the abbey's floor around a hero standing in a field.
    if (indoors && !stillInside(indoors, x, y)) { indoors = null; storey = -1 }
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
  const HERO_LEVEL = roster?.levels?.[0] ?? 1
  /**
   * Which class this character is, and what that makes him.
   *
   * The default is the warrior for one reason: he is the class this game had
   * when there was one, and something has to stand there between the page
   * loading and the screen that makes a character finishing.  Every number
   * downstream of it — health, mana, what he is holding, what he may press —
   * is looked up again by `becomeClass` the moment a class is chosen or a
   * save brings one back, because a class is not a label on a character, it
   * *is* the character.
   */
  const WARRIOR = 1
  let who: Who | null = roster?.classes?.[String(WARRIOR)] ?? null
  /**
   * And the id itself, kept beside it.
   *
   * Separate from `me.cls` on purpose: `me` is the character the *screen*
   * made and it does not exist until the screen is finished, while `statsAt`
   * and `known` are called while the world is still being built.  One is the
   * answer to "who did the player say he was" and the other to "what is being
   * simulated right now", and they are only the same once a character exists.
   */
  let myClass = WARRIOR
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
  /**
   * How much wear is left on what is worn, by slot, and on what is carried, by
   * id — only where it is less than whole.  See `src/sim/durability.ts` and the
   * `dura` note in `save.ts`; declared beside `gear` for the reason above.
   */
  let dura: Record<string, number> = {}
  let duraHeld: Record<string, number> = {}
  let taught: number[] = []
  /**
   * What has been bought off a limited shelf, as `"<vendor>:<item>" -> [turn,
   * how many]`.
   *
   * The turn is what makes this small: a count from an older turn of the
   * shelf's own clock is a count of nothing, so nothing has to be cleared and
   * nothing has to tick.  See `stockLeft`.
   */
  let bought: Record<string, [number, number]> = {}
  /**
   * The recipes he knows, by the spell id that makes the thing.
   *
   * A separate list from `taught` and not the same one, because the two are
   * bought from different people for different reasons and only one of them
   * goes on the bar: a warrior's rend is an ability and a cook's roast is a
   * row in a window.  Merging them would put roast boar in the spellbook.
   */
  let recipes: number[] = []
  /**
   * What is on the bar, by ability id, one entry a square — **and nothing
   * when the square is empty.**
   *
   * The bar used to *be* the spellbook: `squares` was rebuilt from `spells`
   * every frame in the order things were learned, so `SPELL_KEYS[i]` meant
   * "the i-th thing you bought" and there was no way to move it, no way to
   * leave a square empty, and nothing to save.  With two abilities that is
   * invisible; with a level ten mage's dozen and a bag of food beside it,
   * **what to put within reach is a decision** — and issue 224 makes the
   * order of them the fighting order as well, so it is two decisions.
   *
   * Sixteen because that is what the keys are.  Pruned on load and on every
   * change of class against what is actually known, so an id from another
   * character or another bake cannot sit there unpressable.
   */
  let bar: (number | null)[] = []
  /**
   * The sixteen keys the bar is pressed with, and therefore how many squares
   * there are.
   *
   * The number row and then four letters the game was not already using.  Not
   * `W`: that walks you forward, and a key that both walks and swings is the
   * same class of mistake as a square labelled one higher than the key that
   * presses it, which this file has already made once.
   *
   * `1` is one of them again.  It used to be the attack, which was really the
   * aim, and aiming is not a button — see `takeAim`.
   */
  const BAR_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=',
    'Q', 'R', 'T', 'F'] as const
  const BAR_SLOTS = BAR_KEYS.length
  /**
   * Where he stands with everybody, by faction id.
   *
   * Seeded from `player.json` rather than empty, because a human is not
   * neutral with Stormwind on the day he is made — `Faction.dbc` starts him at
   * 4,000, which is already 우호 and already five per cent off every price in
   * the valley.  Starting at nought would be a number this game invented.
   */
  let stands: Record<string, number> = {}
  /**
   * A blessing, a fortitude, a frost armour: one stat or the armour raised
   * for a while.
   *
   * **Here and not on `you`**, for exactly the reason the three above are:
   * `statsAt` reads it and `you` is built out of `statsAt`, so reaching into
   * `you` from inside its own initialiser is a `ReferenceError` — and an
   * optional chain does not save you from one, because a binding in its dead
   * zone throws on the *read* rather than answering `undefined`.  That is the
   * third time this file has taken this trip.
   *
   * One at a time, because at these levels nobody can hold two; the day
   * somebody can, this becomes a list and `statsAt` sums it.
   */
  let blessed: { until: number; stat: string; amount: number } | null = null
  /** The clock everything below measures against, in seconds. */
  let clock = 0
  /** What he is made of at each level — `pipeline/player.py`, plus what he wears. */
  const itemOf = (id: number): Item | null => shelf.items?.[String(id)] ?? null
  /** How much wear a slot's item takes altogether, nought for none. */
  const maxWearOf = (slot: string): number => {
    const it = gear[slot] !== undefined ? itemOf(gear[slot]!) : null
    return it ? (it[I_DURA] as number) ?? 0 : 0
  }
  /** How much it has left. */
  const wearOf = (slot: string): number => dura[slot] ?? maxWearOf(slot)
  /** `Item::IsBroken` for what is in a slot. */
  const brokenAt = (slot: string): boolean =>
    broken(maxWearOf(slot), wearOf(slot))
  /**
   * What counts: everything worn **that is not broken**.
   *
   * `Player::_ApplyItemMods` returns before applying anything for a broken
   * item (Player.cpp:6749), so a breastplate worn down to nought is on him and
   * adds nothing — no stats and no armour — and the moment it is mended it
   * adds them back (Player.cpp:4994).  Every stat and the armour line come
   * through here, so this one filter is the whole of that rule.
   */
  const wornItems = (): Item[] =>
    Object.entries(gear).filter(([slot]) => !brokenAt(slot))
      .map(([, id]) => itemOf(id)).filter((x): x is Item => !!x)
  /**
   * The outfit sheets for a set of items, keyed the way the bake names them.
   *
   * A word the bake has no sheet for is dropped rather than drawn as
   * something else, the same bargain a weapon with no picture makes.
   */
  const outfitKeys = (worn: (Item | null)[]): string[] =>
    outfitFor(worn).map((w) => `outfit-${w}`)
      .filter((k) => !!heroMeta.looks?.[k])
  /**
   * What he is wearing now, as sheets.
   *
   * Everything in a slot and not `wornItems`, which leaves out what is broken
   * because a broken thing gives nothing: a robe worn to nought is still the
   * robe he has on, and drawing him without it is a second rule for the same
   * slot.
   */
  const wearingNow = (): string[] =>
    outfitKeys(Object.values(gear).map(itemOf))
  /**
   * What a class walks out in, before anybody is made — for the preview.
   *
   * The same filter `becomeClass` dresses him with, so the picture on the
   * screen that makes a character is the man who then appears in the world.
   */
  const kitOf = (cls: number): Item[] =>
    (roster?.classes?.[String(cls)]?.kit ?? [])
      .map((k) => itemOf(k[K_ID] as number))
      .filter((it): it is Item => !!it && canWear(it, 1, cls))
  const statsAt = (lv: number): Stats => {
    const base = who?.stats?.[String(Math.max(1, lv))]
      ?? [23, 20, 22, 20, 20, 20, 0]
    const mine = withGear(base, wornItems())
    // And whatever is blessed on to him, which is a stat by index — the
    // client's own `EffectMiscValue`, 0 strength through 4 spirit.  Armour is
    // not a stat and is added where armour is, in `lineFor`.
    const up = blessing()
    if (up && up.stat !== 'armour') {
      const at = Number(up.stat)
      if (at >= 0 && at < 5) mine[at] = (mine[at] ?? 0) + up.amount
    }
    return mine
  }
  /** The blessing, if it has not run out.  Read from three places. */
  const blessing = () => (blessed && blessed.until > clock) ? blessed : null
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
    if (!it || !canWear(it, HERO_LEVEL, myClass)) continue
    const slot = it[I_SLOT] as string
    if (!slot || gear[slot] !== undefined) continue
    const put = wear(gear, it, id)
    gear = put.gear
    held = held.filter((x) => x !== id).concat(put.off)
  }
  const heldWeapon = (): (string | number)[] | undefined => {
    // A broken weapon is a bare hand: `Player::GetWeaponForAttack` will not
    // hand one to a swing (PlayerStorage.cpp:521).
    const it = gear['weapon'] !== undefined && !brokenAt('weapon')
      ? itemOf(gear['weapon']!) : null
    if (it) {
      return ['weapon', it[I_LO] as number, it[I_HI] as number,
        it[I_DELAY] as number, it[I_ARMOUR] as number, 0]
    }
    // Bare hands, and it is a real answer rather than a stand-in for the
    // outfit: one second, one damage, which is what the server gives a player
    // with an empty weapon slot.  Reaching for the starting kit here was what
    // let the character sheet disagree with itself, and `viewcheck` now
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
    const up = blessing()
    // The kit's armour only when nothing is worn at all — a world baked with
    // no items.  It was `||`, which also handed a character whose armour had
    // all broken the kit's armour back, and a broken item counts for nothing.
    const worn = (Object.keys(gear).length ? wornArmour(wornItems())
      : (who?.kit ?? []).reduce((n, k) => n + (k[K_ARMOUR] as number), 0))
      + (up && up.stat === 'armour' ? up.amount : 0)
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
  /**
   * How long a body is out of its own square after a blow — see `knock`.
   *
   * Four of the world's fifty-millisecond steps, and short on purpose: a
   * flinch that outlasts the next blow is a body that never stands still.
   */
  const HURT_SECONDS = 0.2

  /**
   * Remember a blow, so the scene can shove the body it landed on.
   *
   * Recorded where the damage is dealt rather than worked out where it is
   * drawn, because by then the swing is over and nothing on screen knows who
   * hit whom.  The share is of what the target can take, not of what it has
   * left: a blow is as hard as it is whether or not it is the last one.
   */
  const struck = (t: { hurt: number; knock: [number, number, number] | null },
    hit: number, whole: number, fromX: number, fromY: number,
    atX: number, atY: number) => {
    t.hurt = clock
    const dx = atX - fromX, dy = atY - fromY
    const d = Math.hypot(dx, dy) || 1
    t.knock = hit > 0 ? [hit / Math.max(1, whole), dx / d, dy / d] : null
  }

  const you = {
    level: HERO_LEVEL, line: lineFor(HERO_LEVEL),
    hp: lineFor(HERO_LEVEL)[HP]!, max: lineFor(HERO_LEVEL)[HP]!,
    xp: 0, next: 0, target: null as Npc | null, died: 0, calm: 0,
    /**
     * When the swing he is in the middle of started.
     *
     * The scene reads it and the rules do not: `next` says when the *next*
     * blow lands and a picture needs to know how far through the present one
     * he is.  Six frames of `slash` were cut and nothing at all read them —
     * a fight was two people standing still exchanging numbers.
     */
    swung: -1e9,
    /** And when he was last hit, and how hard — see `knock`. */
    hurt: -99,
    knock: null as [number, number, number] | null,
    /**
     * What is in the bar, and which bar it is.
     *
     * This was `rage: 0`, which is not a simplification but a class: a rogue's
     * bar fills by itself and a mage's does not come back for five seconds
     * after he spends any, and neither of those is rage with a different word
     * on it.  `powerWord` is the class's own — `ChrClasses.dbc`'s
     * `DisplayPower` through `player.json` — and `becomeClass` sets both.
     */
    power: 0,
    powerWord: 'rage',
    /**
     * When power was last spent, for the rule that only mana has.
     *
     * `Player::Regenerate` (Player.cpp:1917) reads a different modifier while
     * `IsUnderLastManaUseEffect` is true, and with no talents anywhere in this
     * game that modifier is exactly nought — so spending mana stops it coming
     * back for five seconds.  That, rather than the size of the bar, is what
     * makes a caster's fight a sequence of decisions.
     */
    spent: -99,
    /**
     * What a shield will eat before health does — `SCHOOL_ABSORB`.
     *
     * A number rather than a list, because at these levels a character can
     * only ever have one on him: the priest's is the only absorb in six books.
     */
    absorb: 0,
    /**
     * A rogue's combo points, and who they are on.
     *
     * They belong to the *target* and not to the rogue — walking away and
     * stabbing something else does not carry them over — which is why the
     * creature is stored beside the count.
     */
    combo: 0,
    comboOn: null as Npc | null,
    /**
     * What he is in the middle of casting.
     *
     * `SpellCastTimes.dbc` was resolved and shipped and nothing read it,
     * because a warrior's abilities are all instant — a column that is always
     * nought looks exactly like a column that does not matter.  Five of the
     * six classes are made of the ones that are not.
     */
    casting: null as { sp: Spell; began: number; until: number
      at: Npc | null } | null,
    /** Queued by a heavier blow, spent on the next swing. */
    extra: 0,
    /**
     * And queued as a *share* of the next swing — `WEAPON_PERCENT_DAMAGE`.
     *
     * A hundred means untouched, which is why it is a percentage rather than
     * a multiplier starting at nought: the core's loop starts the same way.
     */
    extraPct: 100,
    /** A renew, ticking — the heal's mirror of a bleed. */
    mend: null as { until: number; next: number; each: number } | null,
    /**
     * A bandage tied, a meal eaten, a drink drunk.
     *
     * Separate from `mend` although both add health a tick, because the two
     * break on different things: a renew is a spell somebody cast on you and
     * survives being hit, and a bandage does not.  One field holding both
     * would have to carry a flag saying which it was, which is the same as two
     * fields with one fewer thing to get wrong.
     *
     * `word` is only for the log line, so being interrupted can say what was
     * interrupted.
     */
    using: null as {
      until: number; next: number; each: number; power: boolean; word: string
    } | null,
    /** When each thing with a cooldown is ready again. */
    cools: {} as Record<number, number>,
    /** And when the global one is — see `cast`. */
    gcd: 0,
    /** The shout, while it lasts. */
    shout: null as { until: number; ap: number } | null,
    purse: 0, kills: 0,
    /**
     * What is loose in the bag: **item id -> how many.**
     *
     * It was `word -> [how many, what it is worth]`, and the word was the
     * thing's *class* — `cloth`, `meat`, `ore` — so a bag could say eleven
     * cloth and could never say two linen and nine wool.  That is fine for a
     * shopkeeper who pays by the pile and impossible for a recipe, which asks
     * for two linen and nothing else will do.
     *
     * The id was already on every row of every haul in the world; only this
     * tally threw it away.  With it the worth stops being carried here at all
     * — `I_SELL` on the item row is the same number from the same column, and
     * two copies of one fact is the drift this repository keeps paying for.
     */
    bag: {} as Record<string, number>,

    /**
     * Which trades he has taken up: **`SkillLine` id -> [where he is, how far
     * it goes].**
     *
     * Empty to begin with, and that is the change issue 200 made.  It used to
     * be `{ herbs: 1, mining: 1, skinning: 1 }` — three trades nobody chose,
     * because the bake left the slice's trade trainers out as people with
     * nothing to sell, and a trade you cannot be taught has to be a trade you
     * were born with or no trade at all.  Thirteen of them teach now, so the
     * first point of herbalism is a decision and costs ten copper.
     *
     * The ceiling is the second number because it is not a property of the
     * trade: `Spell::EffectLearnSkill` sets it from the rank spell you bought,
     * so apprentice is 75 and journeyman 150, and the difference is a purse
     * and a level.
     *
     * What is still not derived is the *rate* — one point a node, which is the
     * smallest step there is.  The server's curve for a gathering skill needs
     * `SkillChance.Green` and `.Yellow`, and those are config rather than code
     * and are not on this machine; crafting needs neither (see
     * `riseChance` in `sim/trades.ts`) and so crafting has the real one.
     */
    trades: {} as Record<string, [number, number]>,
    /**
     * Whether the automatic hand is on — see `autoCast`.
     *
     * On `you` and not inside `touch.ts`, which is where it lived: a toggle
     * that only exists in the phone's pad is a toggle a keyboard cannot reach,
     * and what it turns on is the difference between surviving four times in a
     * hundred and sixty-nine.
     */
    auto: false,
    /**
     * Which stance he is standing in — the client's own form number, 17
     * Battle or 18 Defensive, or nought before he has been given one.
     *
     * Nought is not "no stance" in the real game; a warrior is put in Battle
     * Stance at creation.  Here it is what it looks like: `2457` is on the
     * bar from level one and pressing it is the first thing that ever cost
     * the rage bar, which is the shape of the decision the wiki was looking
     * for in this stretch.
     */
    stance: 0,
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
  //
  // And the two that name another spell rather than doing anything
  // themselves.  Neither could have been on this list while `spells.py` read
  // the trigger out of `EffectMiscValue`: Sunder Armor's only effect is an
  // `E_TRIGGER` pointing at 58567, so with that column wrong it was an
  // ability whose whole content was a nought — which is exactly what this
  // filter is for, and it was quite right to keep it off the bar.
  /**
   * `APPLY_AREA_AURA_PARTY`, which in a single-player game is an aura.
   *
   * A paladin's devotion aura is one of these and nothing else, so without
   * this line the whole of what a level one paladin brings to a fight is an
   * ability the bar refuses to show.  With one man in the party, "everyone
   * near me" and "me" are the same set.
   */
  const E_AREA_AURA = 65
  const CAN_DO = new Set([...WEAPON_FLAT, E_WEAPON_PCT, E_ENERGIZE, E_DUMMY,
    E_AURA, E_AREA_AURA, E_DAMAGE, E_TRIGGER, E_ATTACK_ME, E_HEAL, E_COMBO])
  /**
   * And the auras it knows what to do with, which is the same gate one level
   * down.
   *
   * Without it every `APPLY_AURA` in six books reads as runnable, so the bar
   * fills with buttons that cost mana and do nothing — a polymorph, a fear, a
   * stealth.  An ability is offered when **some** effect of it lands: a
   * frostbolt whose slow is not implemented is still a frostbolt.
   */
  const CAN_HOLD = new Set([A_PERIODIC_DAMAGE, A_PERIODIC_HEAL, A_ATTACK_POWER,
    A_MOD_STAT, A_MOD_RESISTANCE, A_ABSORB, A_DAMAGE_PCT_TAKEN,
    A_DAMAGE_PCT_DONE, A_THREAT_PCT, A_BASE_RESISTANCE_PCT])
  /** Whether this engine can carry out any part of one ability. */
  const runnable = (sp: Spell): boolean => sp.does.some(
    ([effect, , , aura]) => (effect === E_AURA || effect === E_AREA_AURA)
      ? CAN_HOLD.has(aura!) : CAN_DO.has(effect!))
  // How far a swing reaches, out of `SpellRange.dbc` rather than out of a
  // comment here that said "two bodies and an arm".
  if (spellbook.melee) setMelee(spellbook.melee)
  // And the words of the quests, handed to the file that owns every other
  // word a player reads.  `talk.ts` keeps them rather than `main.ts` for the
  // reason it keeps the rest: one place decides what a sentence is.
  setProse((said?.quests ?? {}) as Record<string, never>)
  /**
   * Everything a warrior of this level can do.
   *
   * Filtered **per call** and not once at load.  It used to be once, against
   * the starting level, so levelling up changed your health and your damage
   * and never gave you anything new to press — and starting at level one, as
   * this now does, meant starting with nothing and finishing with nothing.
   * `spells.json` has carried the level on every row all along.
   */
  const bookOf = (cls: number): Spell[] =>
    spellbook.books?.[String(cls)] ?? []
  /**
   * One ability by id, wherever it is.
   *
   * The class's own book first and then the linked half — the spells the
   * player's own abilities fire, which are all of three of them.  This was a
   * lookup in one flat list; with six books "the spellbook" is not a thing
   * any more, and the book that matters is the one the character has.
   */
  const anySpell = (id: number): Spell | undefined =>
    bookOf(myClass).find((x) => x.id === id)
    ?? (spellbook.linked ?? []).find((x) => x.id === id)
  const known = (level: number) => bookOf(myClass)
    .filter((sp) => sp.level <= level && abilityOf(sp.id) && runnable(sp)
      // Created holding it, or paid a trainer for it.  Levelling opens
      // nothing on its own in the game this reproduces — it opens the
      // *option*, and the option costs money.  Handed out free, the one
      // economic decision this stretch of the game has disappears.
      && (sp.free || taught.includes(sp.id)))
    .sort((a, b) => a.level - b.level || a.id - b.id)
  let spells = known(HERO_LEVEL)
  /**
   * What a bar of his own power holds.
   *
   * Rage and energy are a flat hundred — `Player::SetCreatePowers` — and mana
   * is the only one that is a curve, which is why only mana asks the stats.
   */
  const powerMax = (lv = you.level): number =>
    you.powerWord === 'mana' ? maxMana(statsAt(lv))
      : you.powerWord === 'energy' ? MAX_ENERGY : MAX_RAGE
  /**
   * And what a *percentage* cost is a percentage of.
   *
   * `GetCreateMana()`, which is the class's own `BaseMana` for the level —
   * **not** the bar's maximum.  Charging a share of the maximum would make
   * every spell dearer the better his hat is, which is the opposite of what
   * intellect does.
   */
  const baseFor = (sp: Spell): number => {
    const base = who?.stats?.[String(Math.max(1, you.level))] ?? []
    if (sp.power === P_HEALTH) return maxHealth(base)
    if (sp.power === P_MANA) return base[BASE_MANA] ?? 0
    return MAX_RAGE
  }
  /** Our word for each bar, for the sentence that says there is not enough. */
  const POWER_KOR: Record<string, string> = {
    rage: '분노', mana: '마나', energy: '기력', health: '생명력',
  }
  /**
   * Become a class, which is every number about the character at once.
   *
   * Called from the screen that makes one and from the save that brings one
   * back, and it does the same work either way except for the kit: a new
   * character is dressed out of `CharStartOutfit.dbc`, and a returning one is
   * wearing whatever he was wearing.
   */
  const becomeClass = (cls: number, dress: boolean) => {
    myClass = cls
    who = roster?.classes?.[String(cls)] ?? who
    you.powerWord = who?.power ?? 'rage'
    if (dress) {
      held = []
      gear = {}
      dura = {}
      duraHeld = {}
      taught = []
      for (const k of who?.kit ?? []) {
        const id = k[K_ID] as number
        held.push(id)
        const it = itemOf(id)
        if (!it || !canWear(it, you.level, myClass)) continue
        const slot = it[I_SLOT] as string
        if (!slot || gear[slot] !== undefined) continue
        const put = wear(gear, it, id)
        gear = put.gear
        held = held.filter((x) => x !== id).concat(put.off)
      }
    }
    you.line = lineFor(you.level)
    you.max = you.line[HP]!
    you.hp = you.max
    // A full bar for the ones that have one by default and an empty one for
    // rage, which is the server's own answer: a rogue logs in with a hundred
    // energy (Player.cpp:2089 sets it on respawn) and a warrior logs in with
    // nothing, because rage is earned.
    you.power = you.powerWord === 'rage' ? 0 : powerMax()
    you.combo = 0; you.comboOn = null; you.absorb = 0; you.casting = null
    relearn()
  }
  /**
   * Which picture goes with what, out of `pipeline/bake_ui.py`.
   *
   * This was a table here with four entries in it, because the bar had four
   * squares the day somebody wrote it.  The bar grew to twelve and the table
   * did not, and `?? 'sword-slice'` quietly put one picture on seven
   * abilities — including the racial that shakes a snare off, drawn as a
   * sword.  A file list in the bake and a drawing list in the scene are two
   * lists that drift, so there is one: the bake copies exactly what it maps
   * and writes `ui.json` beside the icons, and a spell with no entry fails
   * the bake rather than getting a sword.
   */
  const iconOf = (id: number): string =>
    art.spells[String(id)] ?? art.chrome['attack'] ?? ''
  /** And for a thing: its sort and where it goes, which is 31 pairs in all. */
  const iconFor = (it: Item): string =>
    art.goods[`${it[I_WORD]}|${it[I_SLOT] ?? ''}`] ?? ''

  /**
   * Which of the five sheets an item is drawn as, or null for a bare hand.
   *
   * The pipeline already answers this for everybody else —
   * `spawn_npcs.WEAPON_SUBCLASS` turns `item_template.subclass` into one of
   * five words — and the same table has to be here because the player's
   * weapon arrives as an item id rather than as a baked spawn row.  Read off
   * the item's own word and slot, which is what `items.py` keeps of a
   * subclass: everything in the `weapon` slot that is not a bow.
   */
  /**
   * Which of the five drawn weapons something is held as.
   *
   * A column now, and it was a guess: two-handed meant an axe, fast meant a
   * dagger, everything else a sword.  Three answers cannot reach five, so
   * `mace` and `staff` were sheets that had been cut, packed and shipped and
   * that nothing in this game could ever ask for — a hundred and thirty-eight
   * of the slice's two hundred and twenty-one weapons drawn as the wrong
   * thing.  `item_template.subclass` is what says, and `items.py` bakes it
   * through the same `WEAPON_SUBCLASS` that decides what an NPC carries.
   *
   * Empty for the eight kinds nothing draws — a bow is carried across the
   * back and there is no sheet for that — which comes back as an empty hand
   * rather than as some other weapon.
   */
  /**
   * The sheet for one weapon, fetched the first time he picks that weapon up.
   *
   * One file a weapon and not one atlas, because he holds one of them: all
   * five walks together were 2.7 MiB decoded whatever was in his hand, and
   * the five swings would have taken it past the whole sheet budget.  The
   * greatsword is the worst single one at 2.8 MiB, which is what
   * `budgetcheck` weighs.
   *
   * Nothing evicts the old one.  Swapping weapons is rare and a dropped
   * reference is the browser's business; what would be a bug is holding all
   * five, and a `Map` keyed on what he is carrying cannot.
   */
  /**
   * And the same for what he looks like.
   *
   * Twelve hairstyles and four beards, one sheet each and one worn at a time,
   * for the reason the weapons are: all sixty-three of LPC's styles at three
   * tenths of a megabyte decoded is nineteen megabytes against a budget of
   * twenty-four for the whole game.
   */
  const lookSheets = new Map<string, HTMLImageElement>()
  const lookSheet = (key: string): HTMLImageElement => {
    let img = lookSheets.get(key)
    if (!img) {
      img = new Image()
      // A sheet that arrives after the preview was painted has to make it be
      // painted again, or the screen that makes a character shows a bald man
      // until something else happens to redraw it — the first paint always
      // runs before any of these have loaded.
      //
      // **Only while that screen is the one that is up.**  `!me` was standing
      // in for "the maker is open", and it stopped meaning that the day a
      // screen that *chooses* came before it: nobody is made while the list
      // is up either, so a hair sheet finishing its download opened the maker
      // behind the list — a full-screen layer under the one being read.
      img.onload = () => { if (!me && ui.making()) drawCreate() }
      img.src = `./art/look/${key}.png`
      lookSheets.set(key, img)
    }
    return img
  }

  const armSheets = new Map<string, HTMLImageElement>()
  const armSheet = (word: string): HTMLImageElement => {
    let img = armSheets.get(word)
    if (!img) {
      img = new Image()
      img.src = `./art/arms/${word}.png`
      armSheets.set(word, img)
    }
    return img
  }

  const armFor = (id: number | undefined): string | null => {
    if (id === undefined) return null
    const it = itemOf(id)
    if (!it) return null
    return (it[I_ARM] as string) || null
  }

  /**
   * One icon as an element, painted in whatever colour is asked for.
   *
   * A mask rather than an `<img>`, because the archive is cut white on
   * transparent on purpose: masked, one file paints in any colour, where
   * tinting an image means a filter chain that only approximates one.
   */
  const pic = (path: string, tint?: string): HTMLElement => {
    const s = document.createElement('span')
    s.className = 'pic'
    s.style.setProperty('--pic', `url(./art/ui/${path})`)
    if (tint) s.style.color = tint
    return s
  }

  /** Whether a thing can be used right now, and why not if it cannot. */
  const why = (sp: Spell): string | null => {
    if (you.died) return '쓰러져 있다'
    if (you.casting) return '시전 중이다'
    // What it costs, which depends on who is pressing it: the flat half is the
    // spell's and the percentage half is a share of the caster's own base
    // power.  `costOf` puts them together.
    const need = costOf(sp, baseFor(sp))
    if (sp.power === P_HEALTH) {
      if (you.hp <= need) return '생명력이 모자라다'
    } else if (you.power < need) {
      const word = POWER_KOR[you.powerWord] ?? you.powerWord
      return `${josa(word, '이', '가')} ${need} 필요하다`
    }
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
  /**
   * And the clamp only bites on a spell that was already inside it.
   *
   * `Spell::TriggerGlobalCooldown` (Spell.cpp:8988) tests
   * `StartRecoveryTime >= MIN_GCD && <= MAX_GCD` *before* touching the value,
   * with a comment saying why: the handful of spells outside that range are
   * not cast directly by a player and are not modified.  Clamping first —
   * which this did — turns a 500ms ability into a 1,000ms one.
   *
   * Nothing in this game is outside it today (68 abilities, all 1,000 or
   * 1,500), so this is the rule arriving before the case does rather than a
   * bug being fixed.  That is the point: the next slice's rogue has one.
   */
  const gcdOf = (sp: Spell) =>
    !sp.gcd ? 0
      : sp.gcd < GCD_MIN || sp.gcd > GCD_MAX ? sp.gcd
        : Math.min(GCD_MAX, Math.max(GCD_MIN, sp.gcd))
  /**
   * Press one, which for five of the six classes is not the same as using it.
   *
   * `SpellCastTimes.dbc` says how long it takes to go off, and a warrior's
   * abilities are all nought — so the column was resolved, shipped and read
   * by nothing for as long as this game had one class.  A cast is started
   * here and finished in `finishCast`; **the cost is taken at the start**,
   * which is the server's order (`Spell::prepare` takes power before the cast
   * bar runs) and the reason an interrupted cast still costs you.
   */
  const cast = (sp: Spell) => {
    // What it was asked for, set before the refusal: a check presses the key
    // drawn on a square and asks which ability heard it, and whether there
    // was rage for it is a different question.
    asked = sp.id
    heard++
    if (why(sp) !== null) return
    fired = { id: sp.id, n: fired.n + 1 }
    const paid = costOf(sp, baseFor(sp))
    if (sp.power === P_HEALTH) you.hp = Math.max(1, you.hp - paid)
    else you.power -= paid
    if (paid > 0 && you.powerWord === 'mana') you.spent = clock
    if (sp.gcd) you.gcd = clock + gcdOf(sp) / 1000
    play('cast', 0.95 + roll() * 0.1)
    if (sp.cool) you.cools[sp.id] = clock + sp.cool / 1000
    if (sp.cast > 0) {
      you.casting = { sp, began: clock, until: clock + sp.cast / 1000,
        at: you.target }
      return
    }
    release(sp, you.target)
  }

  /**
   * What is in the air, and what has just landed on somebody.
   *
   * Came over from the ICC prototype (tag `icc-final`, `spawnBolt` and
   * `drawProjectiles`), with the one thing that prototype settled late kept
   * from the start: **a bolt carries its spell and the spell resolves when it
   * arrives**.  The prototype's first bolts were scenery over damage that had
   * already landed, and a number that appears a second before the thing that
   * caused it reads as the shot being decoration.  The server agrees —
   * `Spell::prepare` holds a spell with a `Speed` back for distance over
   * speed — so a frostbolt from thirty yards is a second in which the target
   * is still standing.
   *
   * Not saved, which is the rule a cast under way already keeps: closing the
   * tab interrupts it.  `to` and `from` are a creature or nought for the
   * player.
   */
  type Flight = {
    x: number; y: number; was: { x: number; y: number }; ix: number; iy: number
    trail: [number, number][]
    kind: ProjectileKind; colour: string; speed: number; id: number
    from: Npc | null; to: Npc | null
    land: () => void
    /** How far off the ground it was last drawn, in pixels — for the checks. */
    lift?: number
  }
  const flights: Flight[] = []
  /** Where the prototype kept a trail: five steps, a step and not a frame. */
  const TRAIL = 5
  /**
   * How big each body is, in yards — the prototype's `BOLT` table, whose
   * numbers were arena units against a raider's radius and are a share of a
   * yard here.  Two sizes a kind for the prototype's reason: one multiplier
   * big enough for a dart to read made the heavy orb as tall as its thrower.
   */
  const FLIGHT: Record<ProjectileKind, { radius: number; sprite: number }> = {
    bolt: { radius: 0.15, sprite: 0.9 },
    dot: { radius: 0.17, sprite: 1 },
    heavy: { radius: 0.25, sprite: 1.3 },
    heal: { radius: 0.17, sprite: 1 },
  }
  /** When the cast's ring and its bar were last drawn, for the checks. */
  const castShown = { ring: -1, bar: -1, done: 0 }
  const heals = (sp: Spell) => sp.does.some((d) => d[0] === E_HEAL)
  const launch = (from: Npc | null, to: Npc | null, sp: Spell, land: () => void) => {
    const x = from ? from.x : hero.x, y = from ? from.y : hero.y
    flights.push({ x, y, was: { x, y }, ix: x, iy: y, trail: [[x, y]],
      kind: flightKind(heals(sp), sp.cast ?? 0, sp.does.some((d) => d[0] === E_AURA)),
      colour: schoolColour(sp.school), speed: sp.speed!, id: sp.id,
      from, to, land })
  }
  /**
   * The flash where a spell lands: a picture from `fx.webp` under a ring in
   * the school's colour, the prototype's burst.  Only for spells — a swing
   * already has its flinch and its number, and a flash on every blow is the
   * noise the prototype spent a round taking back out.
   */
  const flashes: { to: Npc | null; at: number; fx: string; colour: string
    life: number }[] = []
  const flash = (to: Npc | null, sp: Spell) => {
    flashes.push({ to, at: clock, fx: landingFx(sp.school, false, heals(sp)),
      colour: schoolColour(sp.school), life: 0.34 })
    if (flashes.length > 24) flashes.shift()
  }
  /** Whether a spell does anything to the one it is aimed at. */
  const strikes = (sp: Spell) => sp.does.some((d) => d[0] === E_DAMAGE
    || (d[0] === E_AURA && d[3] === A_PERIODIC_DAMAGE))
  /**
   * A cast that has gone off: straight to `finishCast` if it has no speed or
   * nobody to fly at, and into the air if it has both.
   */
  const release = (sp: Spell, target: Npc | null) => {
    if (!sp.speed || !target || target.dead || !strikes(sp)) {
      if (target && !target.dead && strikes(sp)) flash(target, sp)
      finishCast(sp, target)
      return
    }
    launch(null, target, sp, () => {
      const t = target.dead ? null : target
      if (t) flash(t, sp)
      finishCast(sp, t)
    })
  }

  /**
   * Stop a cast that was under way.
   *
   * Moving cancels one and so does being hit — `SPELL_AURA_INTERRUPT_FLAGS`
   * in the client and `Spell::cancel` in the core.  The power is gone either
   * way, which is the whole cost of being interrupted.
   */
  const breakCast = (why_: string) => {
    if (!you.casting) return
    ui.log(`시전이 끊겼다. (${why_})`, 'note')
    you.casting = null
  }

  /**
   * Take a blow, through whatever is in the way of it.
   *
   * A shield is a pool of damage eaten before health is — the priest's is the
   * only absorb in six books — and it is here rather than at the two places
   * damage lands because "damage that reaches you" and "damage aimed at you"
   * are different numbers the moment anything stands between them.
   */
  const takeHit = (hit: number): number => {
    if (hit <= 0 || you.absorb <= 0) return hit
    const eaten = Math.min(you.absorb, hit)
    you.absorb -= eaten
    if (you.absorb <= 0) ui.log('방패가 깨졌다.', 'note')
    return hit - eaten
  }

  const finishCast = (sp: Spell, target: Npc | null) => {
    const t = target
    // What pressing it buys in attention, out of `spell_threat`.  A heavier
    // blow is worth five over the damage it does; a thunderclap is worth
    // nearly twice its damage.  That is the rule that makes an opener an
    // opener rather than an expensive auto-attack.
    if (t && sp.threat) {
      t.threat['you'] = (t.threat['you'] ?? 0)
        + threatFrom(0, sp.threat, attackPower(you.level, statsAt(you.level)))
          * stanceOf().threat
    }
    // A stance is not an effect, it is a change of state, and the state it
    // changes costs you everything you were holding.  `Rage_val` in
    // `AuraEffect::HandleAuraModShapeshift` (SpellAuraEffects.cpp:2223) starts
    // at nought and is only raised by talents this game has none of, so the
    // line under it — `SetPower(POWER_RAGE, Rage_val)` — empties the bar.
    // That is the whole cost of a stance and the reason changing one mid-fight
    // is a decision rather than a free improvement.
    if (sp.stance !== undefined && you.stance !== sp.stance) {
      you.stance = sp.stance
      you.power = 0
    }
    for (const [slot, [effect, base, die, aura, period, fires, misc]] of sp.does.entries()) {
      // What a combo point adds, which is only ever a rogue's finisher:
      // `CalculateSpellDamage` adds `EffectPointsPerComboPoint` times the
      // points on the target.  Eviscerate is one damage and five a point, so
      // read without this it is a five-point finisher that hits for one.
      const perPoint = sp.combo?.[slot] ?? 0
      const amount = base! + Math.round(perPoint * (you.comboOn === t ? you.combo : 0))
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
            hit * stanceOf().deal * (1 - mitigate(armourNow(n), you.level))))
          n.hp -= dealt
          if (n.hp > 0) wearBlow()
          struck(n, dealt, n.max, hero.x, hero.y, n.x, n.y)
          n.angry = true
          n.threat['you'] = (n.threat['you'] ?? 0)
            + threatFrom(dealt, sp.threat,
              attackPower(you.level, statsAt(you.level))) * stanceOf().threat
          say(n.x, n.y, `${dealt}`, true)
          if (n.hp <= 0) {
            n.hp = 0; n.dead = clock; you.kills += 1
            if (you.target === n) you.target = null
            reward(n)
          }
        }
        if (at.length > 1) ui.log(`${at.length}을(를) 한꺼번에 쳤다.`, 'hit')
      } else if (WEAPON_FLAT.has(effect!)) {
        // A swing with something added to it — `Spell::EffectWeaponDmg`,
        // SpellEffects.cpp:3617, which three effect numbers all point at.
        // This was 58 alone, which is the only one of the three a warrior
        // has; 121 is a rogue's every strike and 17 is a wand.
        you.extra += amount!
      } else if (effect === E_WEAPON_PCT) {
        // And the multiplier in the same loop, applied to the whole swing:
        // Backstab is ten damage *and* a hundred and fifty per cent of the
        // weapon, which is what makes it the opener rather than the filler.
        you.extraPct = (you.extraPct || 100) * (amount! / 100)
      } else if (effect === E_COMBO) {
        // A rogue's book-keeping — `Spell::EffectAddComboPoints`.  They sit
        // on the target, so stabbing something else starts again.
        if (t) {
          if (you.comboOn !== t) { you.comboOn = t; you.combo = 0 }
          you.combo = Math.min(5, you.combo + amount!)
        }
      } else if (effect === E_ENERGIZE
        || (effect === E_DUMMY
          && sp.does.some(([e]) => e === E_CHARGE))) {
        // Power back.  `E_ENERGIZE` is Bloodrage; the dummy is Charge, whose
        // nine rage the core hands back in a script — and it is *only* a
        // charge's dummy, because a rogue's finisher has one too and reading
        // that as energy pays him a full bar for finishing.
        //
        // Rage and runic power are stored at ten times the bar; mana and
        // energy are not, which is why the scale is the power's rather than a
        // ten written here.
        const scale = sp.power === P_RAGE ? 10 : 1
        you.power = Math.min(powerMax(), you.power + amount! / scale)
      } else if (effect === E_HEAL) {
        // A heal — `Spell::EffectHeal`.  On whoever is picked, and on
        // yourself when that is nobody, which is what a priest alone in a
        // forest actually does.
        const mend = between(amount!, amount! + (die ?? 0))
        you.hp = Math.min(you.max, you.hp + mend)
        say(hero.x, hero.y, `+${mend}`, false)
        ui.log(`${mend} 회복했다.`, 'gain')
      } else if (effect === E_AURA && aura === A_ABSORB) {
        // A shield: a pool of damage eaten before health is.
        you.absorb = Math.max(you.absorb, amount!)
        ui.log(`${amount} 만큼을 대신 받아낸다.`, 'gain')
      } else if (effect === E_AURA && aura === A_PERIODIC_HEAL) {
        you.mend = { until: clock + sp.holds / 1000,
          next: clock + (period || 3000) / 1000, each: amount! }
      } else if ((effect === E_AURA || effect === E_AREA_AURA)
        && (aura === A_MOD_STAT
          || (aura === A_MOD_RESISTANCE && (misc! & SCHOOL_PHYSICAL)))) {
        // A blessing, a fortitude, a frost armour.  All three are the same
        // shape: a stat or a resistance raised for a while, with which one in
        // `EffectMiscValue`.  Armour is resistance nought, which is why the
        // devotion aura and the demon skin land here rather than in a branch
        // of their own.
        blessed = { until: clock + (sp.holds > 0 ? sp.holds / 1000 : 1800),
          stat: aura === A_MOD_RESISTANCE ? 'armour' : String(misc ?? 0),
          amount: amount! }
        you.line = lineFor(you.level)
        you.max = you.line[HP]!
      } else if (effect === E_AURA && aura === A_ATTACK_POWER) {
        you.shout = { until: clock + sp.holds / 1000, ap: amount! }
      } else if (effect === E_AURA && aura === A_PERIODIC_DAMAGE && t) {
        t.bleed = { until: clock + sp.holds / 1000, next: clock + period! / 1000, each: amount! }
        t.angry = true
      } else if (effect === E_ATTACK_ME && t) {
        // Taunt.  The *state* is what puts you on top — `taunted` is read by
        // `refsOf` as `TAUNT_STATE_TAUNT`, which outranks any number — and the
        // numbers are only raised to the highest on the list, and only when
        // you were not already the one being hit (`Spell::EffectTaunt`,
        // SpellEffects.cpp:3367).  It used to add a point on top, which is a
        // number nobody wrote.  `TauntUpdate` reselects at once
        // (ThreatManager.cpp:548), so the wait for the next second is dropped.
        if (t.victim !== 'you') {
          t.threat['you'] = matchHighest(refsOf(t, true), 'you')
        }
        t.angry = true
        t.taunted = clock + sp.holds / 1000
        t.reselect = 0
        rouse(t)
      } else if (effect === E_TRIGGER && fires && t) {
        // The half of an ability that lives in another spell.  Sunder Armor
        // is nothing but this: fifteen rage, one effect, and a column naming
        // 58567 — which is `-4%` of the target's armour, five deep, for
        // thirty seconds.  All four numbers are the client's, and none of
        // them could be read while the trigger column was `EffectMiscValue`.
        const fired = anySpell(fires!)
        for (const [, take, , which] of fired?.does ?? []) {
          if (which !== A_BASE_RESISTANCE_PCT) continue
          const deep = Math.max(1, fired!.stack ?? 1)
          const was = t.sunder && t.sunder.until > clock ? t.sunder : null
          t.sunder = {
            until: clock + (fired!.holds || 30000) / 1000,
            pct: Math.min(deep, (was?.pct ?? 0) / -take! + 1) * -take!,
          }
          t.angry = true
        }
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
    const ceiling = roster?.levels?.[1] ?? (spawns.player?.length ?? 1)
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
      relearn()
      say(hero.x, hero.y, `${you.level}레벨`, true)
      // The bar is built from `spells` every frame, so there is nothing to
      // rebuild — only something to say.  And what opened is not a new button
      // but a new *thing a trainer will sell you*, which is the shape this
      // stretch of the game actually has.
      const offer = bookOf(myClass).filter(
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
    const all = roster?.graveyards ?? {}
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

  /**
   * A creature's threat list in the shape `src/sim/threat.ts` reads.
   *
   * Only one name is ever on it here (see that file); `you` is offline while
   * dead and taunting while a taunt holds.  `melee` is whether the creature
   * has you in reach, which is all `IsWithinMeleeRange` answers.
   */
  const refsOf = (n: Npc, melee: boolean): Record<string, Ref> => {
    const out: Record<string, Ref> = {}
    for (const [k, v] of Object.entries(n.threat)) {
      out[k] = { threat: v, melee,
        online: k === 'you' && you.died ? OFFLINE : ONLINE,
        taunt: k === 'you' && n.taunted > clock ? TAUNT : NONE }
    }
    return out
  }
  /**
   * Who an angry creature is hitting, read off its list.
   *
   * An angry creature has you on its list at nought even before anything has
   * landed: `Unit::EngageWithTarget` (Unit.cpp:7571) adds nought threat, which
   * is how a wolf that noticed you across a field has somebody to run at.
   * Re-read once a second, or at once when the one it had has gone offline
   * (`GetCurrentVictim`, ThreatManager.cpp:250).
   */
  const victimOf = (n: Npc, melee: boolean): string | null => {
    if (n.threat['you'] === undefined && !you.died) n.threat['you'] = 0
    const list = refsOf(n, melee)
    const now = clock * 1000
    const gone = n.victim !== null && (list[n.victim]?.online ?? OFFLINE) === OFFLINE
    if (n.victim === null || gone || now >= n.reselect) {
      n.victim = reselect(list, n.victim)
      n.reselect = now + UPDATE_INTERVAL
    }
    return n.victim
  }
  /**
   * Nobody left to hit: it leaves the fight, and the list goes with it —
   * `EnterEvadeMode` clears the threat it was holding.
   */
  const evade = (n: Npc) => {
    n.angry = false
    n.threat = {}
    n.victim = null
    n.taunted = 0
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
    you.level >= (roster?.levels?.[1] ?? 10) ? 0 : (LADDER[you.level - 1] ?? 0) * 0.75
  const restFor = (seconds: number, inInn: boolean) =>
    seconds * ((LADDER[you.level - 1] ?? 0) / 144000)
    * (inInn ? REST_IN_INN : REST_OUTSIDE)

  function restocking() {
    for (const n of nodes) {
      if (n.up || !n.due || clock < n.due) continue
      n.due = 0
      restock(n)
    }
    // And the shared slots, turned by the wall clock rather than by the
    // game's.  Fifty-four pools is a cheap thing to ask twenty times a second
    // and the answer changes four times an hour at most, so the work is the
    // comparison and not the turning.
    const at = Date.now() / 1000
    turnPools(at)
    turnNodes(at)
  }

  function fighting() {
    if (you.died) {
      // A dead man is offline on every list, so whatever killed him has
      // nobody left to hit and goes home — see `victimOf`.  Before this the
      // pack stood where he fell, angry, until he walked back into it.
      for (const n of active) {
        if (n.angry && !n.dead && !victimOf(n, false)) evade(n)
      }
      // Dead is dead for a moment, and then you wake up at a graveyard.
      //
      // Not where you started and not where you fell.  `game_graveyard` and
      // `graveyard_zone` say where each zone sends you — Elwynn has four, one
      // beside the abbey and one in Goldshire — and the walk back from it is
      // one cost of dying at these levels.  This comment said it was the whole
      // cost, on `Player::ResurrectPlayer`'s (Player.cpp:4605) note that levels
      // 1 to 10 are not affected by resurrection *sickness* — which is about
      // sickness.  The other cost is wear, and it was charged when he fell:
      // see `fall`.
      //
      // Before this you stood up four seconds later on the spot with full
      // health, which meant there was never a reason to run away — and half of
      // "should I pull this" is the other half of that decision.
      if (clock - you.died > 4) {
        const [gx, gy] = graveyardFor(hero.x, hero.y)
        you.died = 0; you.target = null
        you.hp = Math.max(1, Math.round(you.max / 2))
        // A bar of whatever he swings on: rage is earned and the other two
        // are not, so standing up empty is right for one class and wrong for
        // the rest.
        you.power = you.powerWord === 'rage' ? 0 : powerMax()
        you.combo = 0; you.comboOn = null; you.absorb = 0; you.casting = null
        placeHero(gx, gy)
        camX = gx; camY = gy
        ui.log('묘지에서 깨어났다.', 'note')
        if (wornOnDeath) ui.log('쓰러질 때 입고 있던 것이 상했다.', 'note')
        wornOnDeath = false
      }
      return
    }
    const reach2 = MELEE * MELEE
    // Out of a fight, you come back.  Without it one bad pull ends the
    // session, and the game this is modelled on sits you down to eat for the
    // same reason.  Five per cent a second after three seconds of quiet.
    let quiet = you.target === null
    // The target has to still be there, still be alive, and still be close.
    //
    // Close was three swings' reach, fifteen yards, when every class here
    // fought in melee — and a mage's frostbolt reaches thirty, so a target
    // picked at twenty was let go on the next step and nothing with a cast
    // bar could ever be thrown from where it is meant to be thrown from.  It
    // is the farthest thing he can reach now, and never less than it was.
    const t = you.target
    const keep = Math.max(MELEE * 3, ...spells.map((sp) => sp.reach[1]))
    if (t && (t.dead || (t.x - hero.x) ** 2 + (t.y - hero.y) ** 2 > keep * keep))
      you.target = null

    for (const n of active) {
      if (!n.fight) continue
      // A cut that keeps cutting, on its own clock rather than on the swing's.
      if (n.bleed && !n.dead) {
        if (clock > n.bleed.until) n.bleed = null
        else if (clock >= n.bleed.next) {
          n.bleed.next += 3
          n.hp -= n.bleed.each
          if (n.bleed.each > 0 && n.hp > 0) wearBlow()
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
          n.looted = false; n.skinned = false
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
      // Told to look at you, whether it wanted to or not.  Taunt is the only
      // thing in this game that writes to the list rather than adding to it —
      // it puts you on top of whatever was there and holds the creature for
      // the three seconds `Spell.dbc` gives it, which is what makes it a way
      // out of a fight going wrong rather than another source of threat.
      if (n.taunted > clock) { n.angry = true; quiet = false }
      // And gives up.  Without this the forest arrives one at a time and never
      // leaves: `angry` is set by walking past and nothing ever cleared it, so
      // a walk across Elwynn ended with forty things in a queue behind you.
      if (n.angry && n.taunted <= clock && (d2 > LEASH * LEASH
        || (n.x - n.hx) ** 2 + (n.y - n.hy) ** 2 > LEASH * LEASH)) {
        n.angry = false
        if (you.target === n) you.target = null
      }
      if (n.angry) quiet = false
      if (!n.angry) continue
      // Who it is hitting, off its list.  Always you while you stand — see
      // `src/sim/threat.ts` for why — but read, not assumed.
      if (victimOf(n, d2 <= reach2) !== 'you') {
        if (!n.victim) evade(n)
        continue
      }
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
          if (trigger === 9) {
            // `SMART_EVENT_RANGE`: within so many yards of what it is
            // fighting.  The fourth trigger this reads, and the only one of
            // the four the census in issue 196 added — it is here because it
            // needs no memory, which is exactly what the three it declined do
            // need.
            const d = Math.hypot(hero.x - n.x, hero.y - n.y)
            return d >= (p1 ?? 0) && d <= (p2 ?? 100)
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
        // And it flies, if the client says it does — a kobold's fireball is
        // the mage's fireball, 24 yards a second — and what it does is done
        // when it gets there.  `you.died` is asked on arrival because a bolt
        // already thrown still reaches a man who fell to something else.
        const caster = n, sp = trick
        const land = () => {
          if (you.died) return
          flash(null, sp)
          for (const [effect, amount, die, aura, period] of sp.does) {
            if (effect === E_DAMAGE) {
              const bolt = Math.max(1, Math.round(
                between(amount!, amount! + (die ?? 0)) * stanceOf().take
                * (1 - mitigate(you.line[ARMOUR]!, caster.level))))
              const got = takeHit(bolt)
              you.hp -= got
              if (got > 0 && you.hp > 0) wearBlow()
              breakUse()
              breakCast('맞았다')
              say(hero.x, hero.y, `-${got}`, false)
              ui.log(`${nameOf(caster.kind)}의 주문에 ${bolt} 맞았다.`, 'hurt')
            } else if (effect === E_AURA && aura === A_PERIODIC_DAMAGE) {
              youBleed = { until: clock + sp.holds / 1000,
                next: clock + (period ?? 3000) / 1000, each: amount! }
              ui.log(`${nameOf(caster.kind)}에게 물렸다.`, 'hurt')
            }
          }
          if (you.hp <= 0) {
            you.hp = 0; you.died = clock; you.target = null; you.calm = 0
            ui.log('쓰러졌다.', 'note')
          }
        }
        if (sp.speed) launch(caster, null, sp, land)
        else land()
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
      const hit = takeHit(Math.max(0, Math.round(
        damageAfter(fate, raw, n.level - you.level) * stanceOf().take)))
      you.hp -= hit
      if (hit > 0 && you.hp > 0) wearBlow()
      breakUse()
      n.swung = clock
      struck(you, hit, you.max, n.x, n.y, hero.x, hero.y)
      // Taking a blow pays too, at a third of what landing one does — for
      // the one class that is paid that way.  A rogue's energy and a mage's
      // mana do not care what hit them.
      if (you.powerWord === 'rage') {
        you.power = Math.min(MAX_RAGE,
          you.power + rageFrom(hit, you.level, you.line[SWING]! / 1000, false))
      }
      // And being hit stops whatever was being cast, which is the other half
      // of what a cast time costs.
      if (hit > 0) breakCast('맞았다')
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
        if (youBleed.each > 0 && you.hp > 0) wearBlow()
        breakUse()
        say(hero.x, hero.y, `-${youBleed.each}`, false)
        if (you.hp <= 0) {
          you.hp = 0; you.died = clock; you.target = null; you.calm = 0
          ui.log('쓰러졌다.', 'note')
        }
      }
    }
    if (you.shout && you.shout.until <= clock) you.shout = null
    if (blessed && blessed.until <= clock) {
      blessed = null
      you.line = lineFor(you.level)
      you.max = you.line[HP]!
      you.hp = Math.min(you.hp, you.max)
    }
    // A bandage or a meal, which stops the moment anything lands.
    if (you.using) {
      if (clock > you.using.until) you.using = null
      else if (clock >= you.using.next) {
        const on = you.using
        on.next = clock + 1
        if (on.power) you.power = Math.min(powerMax(), you.power + on.each)
        else you.hp = Math.min(you.max, you.hp + on.each)
        say(hero.x, hero.y, `+${on.each}`, false)
      }
    }
    // A renew, which is a bleed with the sign turned round.
    if (you.mend) {
      if (clock > you.mend.until) you.mend = null
      else if (clock >= you.mend.next) {
        you.mend.next = clock + 3
        you.hp = Math.min(you.max, you.hp + you.mend.each)
        say(hero.x, hero.y, `+${you.mend.each}`, false)
      }
    }
    // What is in the air, a step further on.  It follows whoever it was thrown
    // at, which is what a homing missile in the client does and what makes a
    // bolt that has left the hand a bolt that will land.
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i]!
      const tx = f.to ? f.to.x : hero.x, ty = f.to ? f.to.y : hero.y
      f.was = { x: f.x, y: f.y }
      const gap = Math.hypot(tx - f.x, ty - f.y), go = f.speed * STEP
      if (gap <= go) {
        f.x = tx; f.y = ty
        flights.splice(i, 1)
        f.land()
        continue
      }
      f.x += ((tx - f.x) / gap) * go
      f.y += ((ty - f.y) / gap) * go
      f.trail.push([f.x, f.y])
      if (f.trail.length > TRAIL) f.trail.shift()
    }
    // A cast that was under way, finishing.
    if (you.casting && clock >= you.casting.until) {
      const done = you.casting
      you.casting = null
      release(done.sp, done.at && !done.at.dead ? done.at : null)
    }
    // The bar filling.
    //
    // Three rules and they are three different games.  **Energy comes back
    // whether you are fighting or not** (Player.cpp:1941, ten a second flat),
    // which is why a rogue's decision is what to spend it on rather than
    // whether he has any.  **Mana comes back unless you have spent some in
    // the last five seconds**, which is the rule that makes a caster's fight
    // a sequence rather than a rotation.  **Rage drains when nobody is
    // swinging**, which is what stops you walking into a fight with a bar you
    // filled somewhere else.
    if (you.powerWord === 'energy') {
      you.power = Math.min(powerMax(), you.power + ENERGY_PER_SECOND * STEP)
    } else if (you.powerWord === 'mana') {
      const ratio = who?.spirit?.[String(you.level)] ?? 0
      you.power = Math.min(powerMax(), you.power + manaPerSecond(
        you.level, statsAt(you.level), ratio,
        clock - you.spent < FIVE_SECOND_RULE) * STEP)
    }
    // Out of combat, on the server's own two-second tick rather than smeared
    // across the frame.  Both numbers that used to be here were written by
    // hand — five per cent of maximum a second, after three seconds — and both
    // are in the core: see `healPerTick` and `RAGE_LOST_PER_TICK`.
    //
    // The three seconds went with them.  The server has no such delay; it has
    // a *state*, and `quiet` is this game's name for it.  A number invented to
    // stand in for a state is the shape this repository keeps deleting.
    if (quiet) {
      you.calm += STEP
      if (you.calm >= REGEN_TICK) {
        you.calm -= REGEN_TICK
        if (you.powerWord === 'rage') {
          you.power = Math.max(0, you.power - RAGE_LOST_PER_TICK)
        }
        if (you.hp < you.max) {
          const ratios = who?.mend?.[String(you.level)] as
            [number, number] | undefined
          if (ratios) {
            // **Not sitting**, and that is a deliberate `false` rather than
            // an omission.  The server's 1.33 is `!IsStandState()`, and this
            // game has no sit — mapping it on to `resting()`, which is
            // standing in an inn, would be exactly the invented number issue
            // 202 exists to delete.  The rule travels with the formula and
            // fires the day somebody can sit down.
            you.hp = Math.min(you.max,
              you.hp + healPerTick(you.level, statsAt(you.level), ratios,
                false))
          }
        }
      }
    } else {
      you.calm = 0
    }

    // Your own swing, which only happens at something you picked.
    const foe = you.target
    if (!foe || foe.dead || !foe.fight) return
    if ((foe.x - hero.x) ** 2 + (foe.y - hero.y) ** 2 > reach2) return
    if (clock * 1000 < you.next) return
    you.swung = clock * 1000
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
    const stance = stanceOf()
    // The weapon, plus what an ability queued on to it — a flat amount and a
    // share, in that order, which is the order `Spell::EffectWeaponDmg` does
    // it in: the flat bonus goes on the weapon damage and the percentage
    // multiplies the lot.
    const raw = Math.round(
      ((swing(you.line, foe.level, armourNow(foe), roll())
        + shout + you.extra) * (you.extraPct / 100)) * stance.deal)
    const hit = damageAfter(fate, raw, foe.level - you.level)
    you.extra = 0
    you.extraPct = 100
    if (you.powerWord === 'rage') {
      you.power = Math.min(MAX_RAGE,
        you.power + rageFrom(hit, you.level, secs, true, fate === CRIT))
    }
    // Attention, before the damage, because a blow that is blocked to nothing
    // still annoys whatever you hit.
    foe.threat['you'] = (foe.threat['you'] ?? 0)
      + threatFrom(hit, undefined, attackPower(you.level, mine)) * stance.threat
    foe.hp -= hit
    if (hit > 0 && foe.hp > 0) wearBlow()
    struck(foe, hit, foe.max, hero.x, hero.y, foe.x, foe.y)
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
   * What the stance you are standing in is worth, as three multipliers.
   *
   * Nothing here is a number chosen in this file.  A stance spell says only
   * which form it is; the core names a hidden passive per form
   * (`AuraEffect::HandleAuraModShapeshift`, SpellAuraEffects.cpp:1382-1387)
   * and `spells.py` follows that and appends the passive's effects to the
   * stance's own.  Read out, Battle Stance is one aura and Defensive Stance is
   * three: a tenth off what hits you, a twentieth off what you deal, and
   * nearly half again on what you are worth looking at.
   *
   * Which is the decision the wiki could not find in this stretch of the game.
   * There is no right answer to "hit harder or be hit less" while anything is
   * hitting you, and it costs the bar to change your mind.
   */
  const stanceOf = (): { deal: number; take: number; threat: number } => {
    const out = { deal: 1, take: 1, threat: 1 }
    const sp = you.stance
      ? bookOf(myClass).find((x) => x.stance === you.stance) : null
    for (const [effect, amount, , aura] of sp?.does ?? []) {
      if (effect !== E_AURA) continue
      if (aura === A_DAMAGE_PCT_DONE) out.deal *= 1 + amount! / 100
      else if (aura === A_DAMAGE_PCT_TAKEN) out.take *= 1 + amount! / 100
      else if (aura === A_THREAT_PCT) out.threat *= 1 + amount! / 100
    }
    return out
  }

  /**
   * Skinning's own `SkillLine` id, which nothing else in the world states.
   *
   * A herb and a vein carry their trade on the row because `Lock.dbc` gave it
   * to them.  A carcass has no lock at all — it is `Spell::EffectSkinning`
   * that decides, and the spell knows which skill because it is filed under
   * one.  So this is the one trade this file has to name, and it is named once.
   */
  const SKINNING = 393

  /** Has he taken this trade up at all? */
  const can = (skill: number): boolean => !!you.trades[String(skill)]

  /** Where he is in it, or nought. */
  const rankIn = (skill: number): number => you.trades[String(skill)]?.[0] ?? 0

  /**
   * A point of a trade for having used it, and what to say about it.
   *
   * One point a node and one a hide, which is the smallest step there is, and
   * the ceiling is the one the rank he bought set.  A trade already at its
   * ceiling says nothing rather than saying the same number again.
   */
  const rise = (skill: number): string[] => {
    const at = you.trades[String(skill)]
    if (!at || at[0] >= at[1]) return []
    at[0] += 1
    return [`${TRADE_WORD[skill] ?? skill} ${at[0]}`]
  }

  /**
   * Put `many` of an item into the bag, and say what went in.
   *
   * `word` is the haul row's own word and is the fallback only: the item's
   * row is the better answer because it is the row the shop, the bag and the
   * recipe all read.  They agree everywhere in this world — `check_loot` and
   * `check_recipes` are what make that true — and when they ever do not, the
   * bag says something rather than `물건 766`.
   */
  const intoBag = (item: number, many: number, word: string): Said => {
    const key = String(item)
    you.bag[key] = (you.bag[key] ?? 0) + many
    const it = itemOf(item)
    const text = `${goodsOf(it ? (it[I_WORD] as string) : word)} ${many}`
    return [it ? [text, tintOf(it)] as [string, string] : text]
  }

  /**
   * What came off something, as pieces that may carry a colour.
   *
   * `[text, colour]` where the thing has a quality and a bare string where it
   * has not — **the moment a thing falls is the one moment a player meets it
   * for the first time**, and the colour was on the shelf, on the sheet and
   * in the bag, and not there.
   *
   * One list and not two: the plain sentence is `flat()` of this, so the
   * float over the corpse and the line in the log cannot come to say
   * different things.
   */
  type Said = (string | [string, string])[]
  const flat = (parts: Said): string =>
    parts.map((b) => (typeof b === 'string' ? b : b[0])).join('')
  const joined = (bits: Said[]): Said => {
    const out: Said = []
    bits.forEach((b, i) => { if (i) out.push(', '); out.push(...b) })
    return out
  }

  /**
   * Everything about where he stands, in one place.
   *
   * `sides` is what the bake shipped; a world baked without a client has none,
   * and then every rank is neutral and every price is the price on the row —
   * which is exactly where this game was before issue 201.
   */
  const sides = roster?.factions ?? null

  /** Where he stands with one side, out of what he has earned or was born to. */
  const standWith = (faction: number): number =>
    stands[String(faction)] ?? sides?.start[String(faction)] ?? 0

  /** Which of the eight that is. */
  const rankWith = (faction: number): number =>
    sides ? standingRank(standWith(faction), sides) : NEUTRAL

  /**
   * What a shopkeeper or a trainer charges, rounded the way a price rounds.
   *
   * `items.json`'s `of` says whose side the person behind the counter is on
   * and `discountOf` says what that is worth.  Somebody of a side nobody can
   * hold a standing with — three of the six the slice's shopkeepers belong to
   * — is not in that map at all, and charges the price on the row.
   */
  const priceAt = (entry: number, price: number): number => {
    const side = shelf.of?.[String(entry)]
    if (!side || !sides) return price
    return Math.ceil(price * discountOf(rankWith(side)))
  }

  /**
   * Wear, issue 83.  The rules are `src/sim/durability.ts`; this is where the
   * scene holds the numbers and says when a rule fires.
   */
  const menders = new Set(shelf.repair?.by ?? [])
  /** `Player::GetReputationPriceDiscount` against a creature, as a factor. */
  const discountAt = (entry: number): number => {
    const side = shelf.of?.[String(entry)]
    return side && sides ? discountOf(rankWith(side)) : 1
  }
  /** Set what is left on a worn slot, and re-derive him if it broke or mended. */
  const setWear = (slot: string, next: number) => {
    const max = maxWearOf(slot)
    if (!max) return
    const was = wearOf(slot)
    const now = Math.max(0, Math.min(max, next))
    if (now >= max) delete dura[slot]
    else dura[slot] = now
    if (broken(max, was) !== broken(max, now)) {
      you.line = lineFor(you.level)
      you.max = you.line[HP]!
      you.hp = Math.min(you.hp, you.max)
    }
  }
  /**
   * One blow a player was part of, which the victim survived: half a per cent
   * that one of nineteen slots loses a point (Unit.cpp:1266 and :1283).
   */
  const wearBlow = () => {
    const at = wearFromBlow(roll)
    if (at === null) return
    const slot = Object.keys(EQUIPMENT_SLOT).find((s2) => EQUIPMENT_SLOT[s2] === at)
    if (!slot || !maxWearOf(slot)) return
    setWear(slot, losePoints(maxWearOf(slot), wearOf(slot), 1))
  }
  /** Whether the last death cost anything, for the line on waking. */
  let wornOnDeath = false
  /**
   * He falls.  Every place a blow or a bleed or a bolt could kill him used to
   * write these four fields itself; the fifth thing a death does now is wear.
   *
   * `Unit::Kill` (Unit.cpp:14187) takes `RATE_DURABILITY_LOSS_ON_DEATH` off
   * everything **worn** for a player killed by something that is not a player
   * — every death in this game — and there is no level in the condition.
   */
  const fall = () => {
    you.hp = 0; you.died = clock; you.target = null; you.calm = 0
    for (const slot of Object.keys(gear)) {
      const max = maxWearOf(slot)
      if (!max) continue
      setWear(slot, afterDeath(max, wearOf(slot)))
      wornOnDeath = true
    }
  }
  /**
   * Move wear between a slot and the bag when `wear` swapped something, so
   * taking a thing off and putting it back on is not a free repair.
   */
  const carryWear = (was: Record<string, number>) => {
    for (const [slot, id] of Object.entries(was)) {
      if (gear[slot] === id || dura[slot] === undefined) continue
      const k = String(id)
      duraHeld[k] = Math.min(duraHeld[k] ?? Infinity, dura[slot]!)
      delete dura[slot]
    }
    for (const [slot, id] of Object.entries(gear)) {
      const k = String(id)
      if (was[slot] === id || duraHeld[k] === undefined) continue
      dura[slot] = duraHeld[k]!
      if (!held.includes(id)) delete duraHeld[k]
    }
  }
  /**
   * What is worn down, in the order `Player::DurabilityRepairAll`
   * (Player.cpp:4903) walks it: the equipment slots by their own index, then
   * what is carried.  The order is not cosmetic — a purse that runs out part
   * way mends the first ones and not the last.
   */
  const wornDown = (): { slot: string | null; id: number; it: Item; lost: number }[] => {
    const out: { slot: string | null; id: number; it: Item; lost: number }[] = []
    const slots = Object.keys(gear).sort((a, b) =>
      (EQUIPMENT_SLOT[a] ?? 99) - (EQUIPMENT_SLOT[b] ?? 99))
    for (const slot of slots) {
      const it = itemOf(gear[slot]!)
      const lost = maxWearOf(slot) - wearOf(slot)
      if (it && lost > 0) out.push({ slot, id: gear[slot]!, it, lost })
    }
    for (const [k, now] of Object.entries(duraHeld)) {
      const it = itemOf(Number(k))
      if (!it || !held.includes(Number(k))) continue
      const lost = ((it[I_DURA] as number) ?? 0) - now
      if (lost > 0) out.push({ slot: null, id: Number(k), it, lost })
    }
    return out
  }
  /** What mending one of those costs at this mender, or null for no price. */
  const mendCost = (entry: number, m: { it: Item; lost: number }): number | null =>
    shelf.repair ? repairCost(shelf.repair, m.lost, m.it[I_ILVL] as number,
      m.it[I_QUALITY] as number, m.it[I_DURA_COST] as number,
      discountAt(entry)) : null
  /**
   * Mend everything, item by item, as far as the purse goes.
   *
   * `DurabilityRepair` checks the money **per item** and returns without
   * mending the one it cannot pay for (Player.cpp:4966) — and
   * `DurabilityRepairAll` carries on to the next, so a cheap glove after a
   * dear sword can still be mended.
   */
  const mendAll = (entry: number): { paid: number; left: number } => {
    let paid = 0, left = 0
    for (const m of wornDown()) {
      const cost = mendCost(entry, m)
      if (cost === null) continue
      if (you.purse < cost) { left++; continue }
      you.purse -= cost
      paid += cost
      if (m.slot) setWear(m.slot, maxWearOf(m.slot))
      else delete duraHeld[String(m.id)]
    }
    return { paid, left }
  }

  /**
   * Handing in an errand, as far as the sides are concerned.
   *
   * Returns the lines to say, because the crossing is the whole point: the
   * number moving is not news and **우호에서 존경으로** is.
   */
  const payStanding = (rep: [number, number][]): string[] => {
    if (!sides || !rep.length) return []
    const said: string[] = []
    for (const [faction, amount] of paidBy(rep, stands, sides)) {
      const key = String(faction)
      const was = standWith(faction)
      const now = standAfter(was, amount, sides)
      stands[key] = now
      const word = SIDE_WORD[faction]
      if (!word) continue
      const step = standingRank(now, sides) - standingRank(was, sides)
      said.push(step > 0
        ? `${word} — ${RANK_WORD[standingRank(now, sides)]}`
        : `${word} +${now - was}`)
    }
    return said
  }

  /**
   * The sides worth a line on the sheet, as `[word, where he stands]`.
   *
   * Which sides those are is *derived* rather than listed: a side this game
   * can move is one an errand here pays, plus wherever that spills to.  So
   * the sheet grows by itself if the slice ever widens, and shows nothing at
   * all in a world baked without a client.
   */
  const sideLines = (): [string, string][] => {
    if (!sides) return []
    // **Ordered by how much this game is worth to them**, which puts the one
    // side that can actually cross a rank at the top and the four that only
    // catch a quarter of it underneath.  Sorting by the faction id put
    // Stormwind fourth of five, which is the number sorting itself rather
    // than the player being told anything.
    const moves = new Map<number, number>()
    for (const q of log.all.values()) {
      for (const [faction, amount] of q.rep ?? []) {
        moves.set(faction, (moves.get(faction) ?? 0) + amount)
        for (const [into, share] of sides.spills[String(faction)] ?? []) {
          moves.set(into, (moves.get(into) ?? 0) + Math.floor(amount * share))
        }
      }
    }
    return [...moves.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .map(([f]) => f)
      .filter((f) => SIDE_WORD[f])
      .map((f) => {
        const at = standWith(f)
        const rank = standingRank(at, sides)
        const floor = rankFloor(rank, sides)
        const next = rankFloor(rank + 1, sides)
        return [SIDE_WORD[f]!, rank >= EXALTED
          ? `${RANK_WORD[rank]}`
          : `${RANK_WORD[rank]}  ${at - floor} / ${next - floor}`] as
          [string, string]
      })
  }

  /** ", 스톰윈드 +250" — what an errand is worth to a side, or nothing. */
  const repLine = (rep?: [number, number][]): string =>
    (rep ?? []).filter(([f]) => SIDE_WORD[f])
      .map(([f, n]) => `, ${SIDE_WORD[f]} +${n}`).join('')

  /**
   * The thirteen squares, grouped the way the original groups them.
   *
   * The order and the side come off `layout.json` and not out of this file:
   * `PaperDollFrame.xml` states them and `pipeline/layout.py` reads them.
   * Without a client the shipped list is empty, and then it falls back to the
   * one order this game has of its own — which is a list, and says so.
   */
  const wornSquares = (): Worn => {
    const one = (slot: string): [string, string, string, string, string?] => {
      const id = gear[slot]
      const it = id !== undefined ? itemOf(id) : null
      const max = maxWearOf(slot)
      return [SLOT_WORD[slot] ?? slot,
        it ? iconFor(it) : (art.slots[slot] ?? ''),
        it ? tintOf(it) : '',
        it ? `${describe(it)} — ${detail(it)}`
          + (max ? ` · 내구도 ${wearOf(slot)} / ${max}`
            + (brokenAt(slot) ? ' (부서짐)' : '') : '') : '',
        it && brokenAt(slot) ? '1' : '']
    }
    const doll = (layout?.spec?.doll ?? {}) as Record<string, string[]>
    const known = new Set([...(doll['left'] ?? []), ...(doll['right'] ?? []),
      ...(doll['bottom'] ?? [])])
    // Anything the original has a place for that this game grew later lands
    // in the left column rather than nowhere — a square that exists and is not
    // drawn is the shape this repository keeps finding.
    const spare = SLOTS.filter((s2) => !known.has(s2))
    return {
      left: [...(doll['left'] ?? SLOTS.slice()), ...spare].map(one),
      right: (doll['right'] ?? []).map(one),
      bottom: (doll['bottom'] ?? []).map(one),
    }
  }

  /**
   * Everything the bar is, in one place.
   *
   * `fitBar` is the whole of the rule: **what a character knows and what is on
   * his bar are two lists**, and two lists drift — an ability bought for
   * another class, a world re-baked under an old save, a spell that stopped
   * being learnable.  So the bar is pruned against `spells` every time either
   * could have changed, and anything newly learned drops into the first empty
   * square rather than nowhere.
   *
   * That last part is what keeps this from being a worse game on the day it
   * ships: dropping in the first free square *is* the old behaviour — the
   * order things were learned — and it is now a **starting arrangement**
   * rather than a rule.  You can move it.
   */
  const fitBar = () => {
    const known = new Set(spells.map((sp) => sp.id))
    while (bar.length < BAR_SLOTS) bar.push(null)
    bar.length = BAR_SLOTS
    for (let i = 0; i < bar.length; i++) {
      if (bar[i] !== null && !known.has(bar[i]!)) bar[i] = null
    }
  }

  /**
   * Put newly learned abilities in the first free square.
   *
   * **Only the new ones**, and that is the whole of the difference between a
   * starting arrangement and a rule.  Filling every gap on every fit undid the
   * player's own emptying the moment anything reloaded: a square cleared on
   * purpose came back full, because "not on the bar" and "never put on the
   * bar" look the same from here.  What is new is known where the learning
   * happens, so it is passed rather than guessed.
   */
  const stockBar = (fresh: Iterable<number>) => {
    fitBar()
    const on = new Set(bar.filter((x): x is number => x !== null))
    for (const id of fresh) {
      if (on.has(id)) continue
      const free = bar.indexOf(null)
      if (free < 0) break
      bar[free] = id
      on.add(id)
    }
  }

  /**
   * Work out what is known again, and hand anything new a square.
   *
   * One place, because every caller wants the same two things in the same
   * order and the difference between them is only *whether there is a save to
   * respect* — which `keep` says.
   */
  const relearn = (keep = false) => {
    const had = new Set(spells.map((sp) => sp.id))
    spells = known(you.level)
    if (keep) fitBar()
    else stockBar(spells.filter((sp) => !had.has(sp.id)).map((sp) => sp.id))
  }

  /**
   * Put an ability on a square, or take it off, or swap two.
   *
   * One place, because the book, the bar and a check all want it and three
   * copies of "move this there" is three ways for the bar to end up holding
   * the same spell twice.
   */
  const putOnBar = (slot: number, id: number | null) => {
    if (slot < 0 || slot >= BAR_SLOTS) return
    if (id !== null) {
      // An ability lives in one square.  Dragging it on to a second takes it
      // off the first, and dropping it on an occupied square swaps them,
      // which is what the original does and what every player expects.
      const was = bar.indexOf(id)
      if (was >= 0) bar[was] = bar[slot]
    }
    bar[slot] = id
  }

  // The first fill, which nothing else does: `spells` is worked out before
  // this function exists, so a fresh character's bar would have been empty
  // until the first level or the first lesson.
  stockBar(spells.map((sp) => sp.id))

  /**
   * Aim at whatever is already fighting you, if nothing is aimed at.
   *
   * This is the square that went.  Its body was `you.target ??= inSwing()` —
   * *the nearest thing that can be fought* — and pressing it was never a
   * decision: it had one answer.  Issue 140 called choosing what to hit this
   * game's only combat decision, and that decision is the tap, not the key.
   *
   * **Narrower than the square was, and the slice is why.**  `inSwing` takes
   * anything `fightable`, and of the 934 spawns with a fight row in this world
   * **none is `ENEMY`** — 835 are `FRIEND` and 99 are `QUARRY`.  So "an enemy
   * in reach" has no referent here, and aiming at anything fightable would
   * mean killing every chicken you walked past.  What is left is the case
   * where aiming really is not a decision: **something is already angry at
   * you** — you were jumped, or your target died and its friend is still on
   * you.  Starting a fight stays a choice and stays a gesture.
   */
  const takeAim = () => {
    if (chat || you.died || you.target) return
    let best: Npc | null = null, bd = Infinity
    for (const n of active) {
      if (n.dead || !n.angry || !fightable(n.fight)) continue
      const d = (n.x - hero.x) ** 2 + (n.y - hero.y) ** 2
      if (d < bd) { bd = d; best = n }
    }
    if (best) you.target = best
  }

  /**
   * Keep fighting: cast the leftmost thing on the bar that can be cast.
   *
   * The toggle was called autocast and cast nothing — its whole body was
   * `you.target ??= inSwing()`, which aims.  What it is worth is already
   * measured and printed by `npm run simcheck` every run:
   *
   *     and pressing something beats pressing nothing -> 4% vs 69%
   *
   * Against a level five, a character who presses nothing survives four times
   * in a hundred and one who presses anything survives sixty-nine.  So this is
   * not a convenience; it is whether the game can be won with one thumb.
   *
   * **Leftmost first, and that is the whole rule.**  Three orders were on the
   * table — bar order, damage a second, a hand-written priority a class — and
   * the last is six lists of constants this repository would have to keep, and
   * the middle needs a damage model that cannot see a resource curve.  Bar
   * order costs one line *and hands the ordering back to the player*: issue
   * 225 made the arrangement a decision, and this makes the arrangement the
   * fighting order too.
   *
   * `why(sp)` is the one question, and the bar already dims every square with
   * it: resource, cooldown, global cooldown, stance and reach in one call.
   *
   * What it does not do is change stance or change target.  Both are
   * decisions, and an automatic hand that makes them is an automatic hand that
   * has taken the game over.
   */
  const autoCast = () => {
    if (!you.auto || chat || you.died) return
    // **And it aims, which is the whole difference between a toggle that is on
    // and a toggle that does nothing.**
    //
    // `takeAim` above takes only what is *already angry at you*, and that is
    // right for the thing that happens whether you asked or not: of the 934
    // spawns with a fight row here none is `ENEMY`, so aiming at anything
    // fightable would kill every chicken you walked past.
    //
    // A toggle is different.  Turning this on is the player saying *fight what
    // I can fight*, so here — and only here — the reach is `inSwing`'s, which
    // is what the line that used to live in the phone's own loop did before it
    // was deleted.  Without it `autoCast` returned on `!you.target` and nothing
    // anywhere took one: eleven places read `auto` and not one of them aimed.
    if (!you.target) you.target = inSwing()
    if (!you.target) return
    if (you.casting || you.gcd > clock) return
    for (const id of bar) {
      if (id === null) continue
      const sp = spells.find((x) => x.id === id)
      if (!sp || why(sp) !== null) continue
      // **Not a stance.**  A stance is a decision — it is the one lever this
      // stretch of the game has that is not "which button" — and an automatic
      // hand that changes it has taken that decision away.  It is also free
      // and always usable, so an automatic hand that did not skip it would
      // stand there flipping between two stances for ever.
      if (sp.stance) continue
      cast(sp)
      return
    }
  }

  /** "66 회복, 6초" — what pressing a thing in the bag would do. */
  const useWord = (use: [string, number, number]): string => {
    const [word, total, seconds] = use
    const what = word === 'drink' ? '기력' : '회복'
    return seconds ? `${total} ${what}, ${Math.round(seconds)}초`
      : `${total} ${what}`
  }

  /**
   * A bandage or a meal stops the moment anything lands on you.
   *
   * The original's rule and the reason a first aider is not simply a second
   * healer: mending only works where nothing is hitting you, so it is what you
   * do *between* fights.
   */
  const breakUse = () => {
    if (!you.using) return
    ui.log(`${you.using.word}이(가) 끊겼다.`, 'note')
    you.using = null
  }

  /**
   * Use one of something out of the bag.
   *
   * `I_USE` is `[word, how much altogether, over how many seconds]` and comes
   * off the item's own on-use spell — see `use_of` in `pipeline/trades.py`.
   * Five shapes cover everything this world makes and sells, and the two that
   * take time are the two that need a reason to stand still.
   */
  const useItem = (id: number): string => {
    const it = itemOf(id)
    const use = it?.[I_USE] as [string, number, number] | 0 | undefined
    if (!it || !use) return '쓸 수 없다'
    if ((you.bag[String(id)] ?? 0) < 1) return '가진 것이 없다'
    const [word, total, seconds] = use
    const fighting = !!you.target && !you.target.dead
    // Eating and drinking are out-of-combat things in the original and here,
    // and a bandage is not: it is the one thing you can do while something is
    // still swinging at you, and it breaks the moment it connects.
    if ((word === 'feed' || word === 'drink') && fighting)
      return '싸우면서 먹을 수는 없다'
    if (word === 'mend' && you.using) return '이미 싸매는 중이다'
    const key = String(id)
    const left = (you.bag[key] ?? 0) - 1
    if (left > 0) you.bag[key] = left; else delete you.bag[key]
    if (word === 'heal') {
      const was = you.hp
      you.hp = Math.min(you.max, you.hp + total)
      say(hero.x, hero.y, `+${you.hp - was}`, false)
      play('loot')
      return `${you.hp - was} 회복했다.`
    }
    if (word === 'power') {
      const was = you.power
      you.power = Math.min(powerMax(), you.power + total)
      play('loot')
      return `${Math.round(you.power - was)} 회복했다.`
    }
    // And over time, a point a second, which is the tick the aura itself uses
    // (`AuraEffect::CalculatePeriodic` floors a broken period at 1000ms).
    const ticks = Math.max(1, Math.round(seconds))
    you.using = {
      until: clock + ticks, next: clock + 1,
      each: Math.max(1, Math.round(total / ticks)),
      power: word === 'drink', word: describe(it),
    }
    play('loot')
    return `${describe(it)}. ${ticks}초.`
  }

  /** What is left of a creature's armour once it has been sundered. */
  const armourNow = (n: Npc): number => {
    const base = n.fight?.[ARMOUR] ?? 0
    if (!n.sunder || n.sunder.until <= clock) return base
    return Math.max(0, Math.round(base * (1 - n.sunder.pct / 100)))
  }

  /**
   * Going through a body's pockets.
   *
   * Rolled when it is opened rather than when it died, which is the same thing
   * to a player and one fewer list to keep: nothing is carrying loot until
   * somebody looks.
   */
  /**
   * Going through a body's pockets, and then taking its skin.
   *
   * The order is the game's own: `Creature::AllLootRemovedFromCorpse`
   * (Creature.cpp:3152) turns a corpse skinnable **after** its ordinary loot
   * has been taken and only if its `SkinLootId` has a table.  So one key does
   * both, twice, and a wolf is worth two presses.
   *
   * Rolled when it is opened rather than when it died, which is the same thing
   * to a player and one fewer list to keep: nothing is carrying loot until
   * somebody looks.
   */
  /**
   * Whether a drop's `conditions` hold for the log as it stands.
   *
   * `pipeline/spawn_npcs.py` answers the side and ships what is left: `0` for
   * always, a quest id for the one shape this slice has — one group, one quest
   * held — and otherwise the groups, **any one of which is enough and every
   * quest in which must hold**, a negative id being one that must *not* be.
   * The first reading was `need && !held(need)`, which only ever knew the
   * first shape; a list arriving there would have been truthy and never held.
   */
  const mayFall = (need: unknown): boolean => {
    const held = (q: number) => log.held.some((h) => h.id === q)
    if (!need) return true
    if (typeof need === 'number') return held(need)
    return (need as number[][]).some((group) =>
      group.every((q) => (q > 0 ? held(q) : !held(-q))))
  }
  const loot = (n: Npc): Said => {
    if (n.looted && n.hide && !n.skinned) {
      // **And what it asks for was found in the end.**  A herb and a vein
      // state their own requirement — `Lock.dbc` gives a number per node —
      // and a carcass states none, because the server works it out from the
      // victim's level.  Which line of the server does it was the whole
      // question, and the first answer was the wrong one: `Unit.cpp:3334`
      // makes a *weapon* skill level times five, so a level five wolf wanted
      // twenty-five, nothing could open the gate, and the gate came out.
      //
      // `Spell::EffectSkinning` (SpellEffects.cpp:4914) is the line that
      // actually decides it and it asks **nothing below level ten**, then
      // climbs in tens.  So the gate is openable after all — see `skinAsks`.
      if (!can(SKINNING)) return [`${TRADE_WORD[SKINNING]}을(를) 배워야 한다`]
      const asks = skinAsks(n.level)
      if (rankIn(SKINNING) < asks)
        return [`${TRADE_WORD[SKINNING]} ${asks} 필요`]
      n.skinned = true
      const off: Said[] = []
      for (const row of n.hide[2]) {
        const [idx, chance, clo, chi, , item] = row as number[]
        if (roll() * 100 >= chance!) continue
        off.push(intoBag(item!, between(clo!, chi!), GOODS[idx!] ?? 'oddment'))
      }
      off.push(...rise(SKINNING).map((t) => [t] as Said))
      if (off.length) play('loot')
      return joined(off)
    }
    n.looted = true
    if (!n.haul) return ['아무것도 없다']
    const [lo, hi, items] = n.haul
    const got: Said[] = []
    const copper = between(lo, hi)
    if (copper > 0) { you.purse += copper; got.push([coin(copper)]) }
    for (const row of items) {
      const [idx, chance, clo, chi, , item] = row as number[]
      // What `conditions` says has to be true first.  A quest item that falls
      // without the quest is the table's own first example of what goes wrong
      // when nobody reads it — and it looks like generosity, not like a bug.
      if (!mayFall((row as unknown[])[6])) continue
      if (roll() * 100 >= chance!) continue
      // The id travels and the price no longer has to: `I_SELL` on the item
      // row is the same column this used to copy, and one fact in one place
      // is the difference between a bag that can be sold and a bag that can
      // also be cooked.
      got.push(intoBag(item!, between(clo!, chi!), GOODS[idx!] ?? 'oddment'))
    }
    // And out loud, which this was not.  The skin above said `loot`, and so
    // did a herb, a vein and a bandage; the pockets — the one taken after
    // nearly every kill, and the first thing `art/SOUND-CREDITS.md` names —
    // said nothing, and `viewcheck` wrote that down as the game's gap rather
    // than failing on it.  Only when something came off, the same as `gather`:
    // an empty body has nothing to say.
    if (got.length) play('loot')
    return got.length ? joined(got) : ['아무것도 없다']
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
  const gather = (n: Node): Said => {
    if (n.trade && !can(n.trade))
      return [`${TRADE_WORD[n.trade] ?? n.trade}을(를) 배워야 한다`]
    if (n.trade && rankIn(n.trade) < n.skill)
      return [`${TRADE_WORD[n.trade] ?? n.trade} ${n.skill} 필요`]
    n.up = false
    n.due = clock + Math.max(5, n.back)
    const got: Said[] = []
    for (const row of n.haul) {
      const [word, chance, lo, hi, , item] =
        row as [string, number, number, number, number, number]
      if (roll() * 100 >= chance) continue
      got.push(intoBag(item, between(lo, hi), word))
    }
    if (n.trade) got.push(...rise(n.trade).map((t) => [t] as Said))
    if (got.length) play('loot')
    return got.length ? joined(got) : ['아무것도 없다']
  }

  /**
   * The nearest body with something left on it.
   *
   * Which is the pockets, and then the skin: a looted carcass is still worth
   * walking back to if it has a hide nobody has taken.
   */
  const corpse = (): Npc | null => {
    let best: Npc | null = null, bd = EARSHOT * EARSHOT
    for (const n of active) {
      if (!n.dead) continue
      if (n.looted && !(n.hide && !n.skinned)) continue
      const d = (n.x - hero.x) ** 2 + (n.y - hero.y) ** 2
      if (d < bd) { bd = d; best = n }
    }
    return best
  }

  /**
   * How far the one targeting key reaches.
   *
   * `MELEE` — five yards — until five of the six classes could not use their
   * own books: a smite is thirty yards and every ability with a reach refuses
   * without a target, so a priest could only ever cast at something already
   * standing on him.  Reaching exactly as far as **the longest reach he
   * actually has** is the only answer that is not a number chosen here: a
   * warrior's stays five (a charge is twenty-five, which is why it is the
   * maximum and not the minimum that matters), and a priest's is thirty
   * because a priest has a thirty-yard spell.
   */
  const aimRange = (): number =>
    Math.max(MELEE, ...spells.map((sp) => sp.reach[1] ?? 0))

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
    const far = aimRange()
    let best: Npc | null = null, bd = far * far
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
  /**
   * How many times anything asked, and the last ability that actually went
   * off.  `asked` is set before the refusal on purpose, so it cannot say
   * whether a press *fired* — and "each square fires its own ability" is what
   * `padcheck` promises.  Counted, because the same ability asked for twice in
   * a row looks exactly like nobody asking.
   */
  let heard = 0
  let fired = { id: 0, n: 0 }
  /** The lines a held square last painted, and whose, for the check. */
  let painted: { id: number; lines: string[] } | null = null

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
    // Talking, which is a verb and not an ability.  It had a square on the bar
    // and the square carried the binding; when the spellbook outgrew one row
    // the square went and the key went with it, and `questcheck` stopped
    // being able to talk to anybody at all.  A binding that lives inside a
    // list of abilities is a binding that leaves when the list is rearranged.
    if (k === 'e') { e.preventDefault(); toggleTalk() }
    if (k === 'b') { e.preventDefault(); bagOpen = !bagOpen }
    // The book.  `P` is the original's own key for it, and this game was not
    // using it.
    if (k === 'p') {
      e.preventDefault()
      bookOpen = !bookOpen
      if (bookOpen) bookPage = 0
      drawBook()
    }
    // And the automatic hand, which lived inside the phone's pad and could not
    // be reached from a keyboard at all — see `autoCast`.
    if (k === 'y') {
      e.preventDefault()
      you.auto = !you.auto
      ui.log(you.auto ? '자동 시전을 켰다.' : '자동 시전을 껐다.', 'note')
    }
    // The workbench.  One key, and pressing it again with two trades open
    // turns the page rather than shutting it — a person with cooking and
    // first aid wants both lists off one finger.
    if (k === 't') {
      e.preventDefault()
      const many = Object.keys(you.trades).filter((x) => craft.trades[x]).length
      if (craftOpen && craftAt + 1 < many) { craftAt += 1; craftPage = 0; drawCraft() }
      else showCraft(!craftOpen)
    }
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
    if (k === 'escape' && shopAt) { e.preventDefault(); shutShop() }
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
  /**
   * Five, which is what the cluster has always been drawn for.
   *
   * `touch.ts` lays out five slots in two offset rows — the shape the old
   * prototype settled on, because a column up the right edge is a shape a
   * thumb travels rather than covers — and two of them were used, both
   * hard-coded.  A character who has bought everything a trainer sells has
   * ten abilities and could press **none** of them with a thumb.
   *
   * Attack takes the corner, which is the easiest place on a phone to reach,
   * and the four after it are the first four abilities in the order they were
   * learned.  Ten will not fit in five and nobody should try: what is here is
   * the opener, the heavy blow, the shout and the bleed, and the rest are a
   * keyboard's.
   *
   * **There is no talk button**, and there was not one in the original
   * either.  You tap the person.
   */
  const PHONE_SLOTS = 5
  const pad = touchpad(canvas, PHONE_SLOTS)

  /**
   * How many pages of abilities the cluster has, and which four are on this one.
   *
   * **Five buttons was never the problem; five buttons and no way past them
   * was.**  A level ten warrior who has bought everything a trainer sells
   * knows sixteen abilities and could press three of them — issue 140 closed
   * "you cannot choose what to hit on a phone" and left "you cannot choose
   * what to hit it *with*" standing.
   *
   * The corner stays the attack, because it is the easiest place on a phone
   * to reach and it is the one thing you always want.  The other four turn.
   *
   * One function for both halves, and that matters: the drawing loop and the
   * press loop each need this list, and a bar drawn from one index and fired
   * from another is what puts the wrong spell under the right picture.
   */
  const onBar = () => bar
    .map((id) => (id === null ? null : spells.find((x) => x.id === id) ?? null))
    .filter((sp): sp is Spell => sp !== null)
  const phonePages = () =>
    Math.max(1, Math.ceil(onBar().length / PHONE_SLOTS))
  const onPhonePage = () => {
    const from = Math.min(pad.page, phonePages() - 1) * PHONE_SLOTS
    return onBar().slice(from, from + PHONE_SLOTS)
  }
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
  /**
   * Who the character is, which used to be a sentence in `slice.json`.
   *
   * `race` and `cls` are the client's own ids and `sex` is 0 male, 1 female —
   * the order `CharacterCreate.xml` puts its two buttons in.  Empty until the
   * screen makes one or a save brings one back, and that emptiness is what
   * puts the screen up.
   */
  type Me = { name: string; race: number; sex: number; cls: number
    hair: string; beard: string }
  let me: Me | null = null

  /**
   * The screen that makes one, and the three rules behind it.
   *
   * **Race.**  One, and it is the slice's shape rather than a decision:
   * `playercreateinfo` puts every other race's first step outside this box —
   * dwarves and gnomes in Dun Morogh, night elves in Teldrassil, draenei on
   * Azuremyst.  So the other nine are drawn and said *why*, because the icons
   * page's rule is to show the difference between what is not here and what
   * was decided against.
   *
   * **Class.**  `CharBaseInfo.dbc` says a human may be seven things and that
   * table is the whole rule — there is nothing to reimplement.  Six of them
   * start on the square this game already begins on; the seventh is a death
   * knight, who begins at level 55 on another map, and that is a different
   * reason from the other five, which simply have no spellbook yet (issue
   * 188).  Both reasons are printed.
   *
   * **Sex.**  Two buttons and one of them is off, because `bake_sprites.py`
   * composites `body/bodies/male` and there is no female body in `hero.png`.
   * A choice that changes nothing is worse than a choice that is greyed with
   * a reason.
   */
  const SEXES = [[0, '남자'], [1, '여자']] as const
  const HUMAN = 1
  /** A death knight starts at 55 on another map, which is not this slice. */
  const DEATH_KNIGHT = 6
  /**
   * Which classes this game has a spellbook for.
   *
   * **Read from the bake and not written here.**  It was `new Set([1])` with
   * a comment naming this issue, which is the honest shape of a list that is
   * waiting for data — and the moment the data arrives, a list written here
   * is the second copy that drifts.  A class a player may pick is a class
   * `pipeline/spells.py` baked a book for.
   */
  const PLAYABLE = new Set(Object.keys(spellbook.books ?? {}).map(Number))
  let makeRace = HUMAN, makeSex = 0, makeClass = 1, makeName = ''
  let makeHair = 'plain', makeBeard = ''
  /**
   * Names to roll, because the original's dice rolls one too.
   *
   * Ours and not the client's: `CharacterCreate.lua` calls a server for a
   * name, and the lists the client ships are Blizzard's.  Fourteen plain
   * Korean given names, which is the same bargain every other word in this
   * game makes.
   */
  /**
   * Our word for each thing he can look like.
   *
   * The sheet names are LPC's folder names and they are English; a player
   * reads Korean here for the same reason every other word in this game is
   * ours.  A style with no entry shows its folder name, which is how you find
   * one that needs a word.
   */
  const LOOK_WORD: Record<string, string> = {
    buzzcut: '삭발', high_and_tight: '짧게 친 머리', flat_top_fade: '각진 머리',
    balding: '벗어진 머리', parted: '가르마', page: '단발', plain: '보통',
    cornrows: '땋아 붙인 머리', bob: '단정한 단발', mop: '덥수룩한 머리',
    spiked: '세운 머리', long_messy: '긴 머리',
    '5oclock_shadow': '거뭇한 수염', trimmed: '다듬은 수염',
    medium: '기른 수염', basic: '덥수룩한 수염',
  }
  const NAMES = ['가온', '노을', '단우', '라온', '미르', '바다', '사름',
    '아름', '자람', '차온', '하늘', '해든', '이레', '온새']

  /**
   * The sprite that will walk out, painted for the screen that makes it.
   *
   * The same sheets the world draws from, so what is chosen and what is got
   * cannot be two different people — which is what a second picture of a
   * character always becomes.  Standing still, facing the camera, at three
   * times the size because a 64-pixel man is a thumbnail.
   */
  const meCanvas = document.createElement('canvas')
  /**
   * And the same sprite for the character sheet.
   *
   * A second canvas rather than a second painter: the screen that makes a
   * character and the panel that describes one are looking at the same man,
   * and two ways of drawing him is how the two come to disagree.  Issue 184
   * shelved the *composed* paperdoll — the layer sheets, which cannot draw
   * trousers — and this is not that: it is the picture the player has been
   * looking at all game, already open, in the middle of the squares that say
   * what is on it.
   */
  const sheetCanvas = document.createElement('canvas')
  const paintMe = (into = meCanvas, hair = makeHair, beard = makeBeard,
    k = 3, wearing: string[] = wearingNow()) => {
    const c = heroMeta.cell, rowH = heroMeta.row ?? c, lid = heroMeta.body?.top ?? 0
    into.width = c * k
    into.height = c * k
    const g = into.getContext('2d')!
    g.imageSmoothingEnabled = false
    g.clearRect(0, 0, into.width, into.height)
    const clip = heroMeta.clips['idle'] ?? heroMeta.clips['walk']
    if (!clip) return into
    // Facing the camera, which is LPC's third row, and the first frame of it.
    const idx = clip.first + 2 * clip.count
    const sx = (idx % heroMeta.cols) * c
    const sy = Math.floor(idx / heroMeta.cols) * rowH
    const put = (key: string | null) => {
      if (!key) return
      const a = heroMeta.looks?.[key]?.clips['idle']
      const img = lookSheet(key)
      if (!a || !img.complete || !img.naturalWidth) return
      g.drawImage(img, (a.x ?? 0), a.y + 2 * a.h, a.w, a.h,
        a.dx * k, a.dy * k, a.w * k, a.h * k)
    }
    if (heroImg.complete && heroImg.naturalWidth) {
      g.drawImage(heroImg, sx, sy, c, rowH, 0, lid * k, c * k, rowH * k)
    }
    // What he has on over the body, under the face — see `sim/outfit.ts`.
    for (const key of wearing) put(key)
    put(beard ? `beard-${beard}` : null)
    put(`hair-${hair}`)
    return into
  }

  const drawCreate = () => {
    const table = layout?.who
    if (!table) { ui.setCreate(false, {} as never); return }
    const size = (layout?.spec?.create ?? {}) as Record<string, number[]>
    const legal = new Set((table.pairs ?? [])
      .filter(([r]) => r === makeRace).map(([, c]) => c))
    // **The ten the original shows, and `CharBaseInfo` is what says which.**
    // `ChrRaces.dbc` has twenty-one rows and eleven of them are nobody's
    // choice — a naga, a fel orc, the unused ones — so listing the table
    // straight put 타락한 오크 on the screen beside 인간.  A race a player may
    // be is a race that appears in the 62 pairs, which is the same table the
    // class list comes out of.
    const playable = new Set((table.pairs ?? []).map(([r]) => r))
    const races = [...playable].sort((a, b) => a - b)
      .map((id) => ({
        id, word: table.races[String(id)] ?? String(id),
        can: id === HUMAN,
        ...(id === HUMAN ? {} : { why: '이 상자 밖에서 시작한다' }),
      }))
    const classes = [...legal].sort((a, b) => a - b).map((id) => ({
      id, word: table.classes[String(id)] ?? String(id),
      can: PLAYABLE.has(id),
      ...(PLAYABLE.has(id) ? {}
        : id === DEATH_KNIGHT ? { why: '55레벨, 다른 지도' }
          : { why: '주문서가 아직 없다' }),
    }))
    const sexes = SEXES.map(([id, word]) => ({
      id, word, can: id === 0,
      ...(id === 0 ? {} : { why: '여자 몸을 아직 안 구웠다' }),
    }))
    // What he looks like, out of what was baked.  The keys are the sheet
    // names, so the row is the bake's own list and cannot fall behind it —
    // twelve hairstyles and four beards plus a fifth row that is none.
    const looks = heroMeta.looks ?? {}
    const of = (kind: string) => Object.keys(looks)
      .filter((k) => looks[k]?.kind === kind)
      .map((k) => k.slice(kind.length + 1))
    const hairs = of('hair').map((n, i) => ({ id: i, word: LOOK_WORD[n] ?? n,
      can: true }))
    const beards = ['', ...of('beard')].map((n, i) => ({ id: i,
      word: n ? (LOOK_WORD[n] ?? n) : '없음', can: true }))
    const hairList = of('hair')
    const beardList = ['', ...of('beard')]
    ui.setCreate(true, {
      hairs, hair: Math.max(0, hairList.indexOf(makeHair)),
      pickHair: (i: number) => { makeHair = hairList[i] ?? 'plain'; drawCreate() },
      beards, beard: Math.max(0, beardList.indexOf(makeBeard)),
      pickBeard: (i: number) => { makeBeard = beardList[i] ?? ''; drawCreate() },
      races, race: makeRace, pickRace: (id) => { makeRace = id; drawCreate() },
      sexes, sex: makeSex, pickSex: (id) => { makeSex = id; drawCreate() },
      classes, cls: makeClass,
      pickClass: (id) => { makeClass = id; drawCreate() },
      name: makeName, rename: (v) => { makeName = v; drawCreate() },
      say: `${table.races[String(makeRace)] ?? ''} `
        + `${table.classes[String(makeClass)] ?? ''}`
        + ` · ${SEXES.find(([i]) => i === makeSex)?.[1] ?? ''}`,
      ready: makeName.trim().length > 0,
      // Back to the list, but only when there is a list: with nobody made
      // yet this screen is the whole game and there is nowhere behind it.
      ...(cards.length ? { back: () => {
        ui.setCreate(false, {} as never)
        drawPick()
      } } : {}),
      done: () => {
        const born: Me = { name: makeName.trim(), race: makeRace,
          sex: makeSex, cls: makeClass, hair: makeHair, beard: makeBeard }
        me = born
        // A class is not a label on a character, it is the character: health,
        // mana, what he is holding and what he may press are all looked up
        // again here.  Nothing between the page loading and this line knew
        // which of the six it was.
        becomeClass(born.cls, true)
        ui.setName(born.name)
        ui.setCreate(false, {} as never)
        ui.log(`${born.name}. 노스샤이어 계곡에서 시작한다.`, 'gain')
        // Into a slot of his own, chosen before the screen opened.  Written
        // at once rather than at the next fifteen-second tick, because a
        // character who is not in the list is a character the screen that
        // chooses cannot show.
        writeSave(snapshot(), mySlot).catch(() => {})
        cards = cards.filter((c) => c.slot !== mySlot)
          .concat([{ slot: mySlot, save: snapshot() }])
          .sort((a, c) => a.slot - c.slot)
      },
      // **A look at random**, which is what the original's button is for —
      // `CharacterCreateRandomizeButton` rolls the appearance and leaves the
      // race and the class alone.  Every hairstyle and every beard, the none
      // included, because all of them can be picked; race, sex and class each
      // have exactly one thing in them that can, so there is nothing to roll.
      // It only rolled the name before, and a name is still rolled when there
      // is none yet: a press should leave a character that can walk out, and a
      // name somebody typed is theirs.
      dice: () => {
        makeHair = hairList[Math.floor(roll() * hairList.length)] ?? 'plain'
        makeBeard = beardList[Math.floor(roll() * beardList.length)] ?? ''
        if (!makeName.trim()) makeName = NAMES[Math.floor(roll() * NAMES.length)]!
        drawCreate()
      },
      // Wearing what this class walks out in, so the picture changes with
      // the class row — the kit, through the same rule the world uses.
      face: paintMe(meCanvas, makeHair, makeBeard, 3, outfitKeys(kitOf(makeClass))),
      size: size as Record<string, [number, number]>,
      list: (size['list'] ?? [220, 220]) as [number, number],
      racePitch: (size['racePitch'] ?? [0, 21]) as [number, number],
      classPitch: (size['classPitch'] ?? [6, 0]) as [number, number],
    })
  }

  /**
   * The characters there are, and which slot this one is in.
   *
   * **Ten slots, and the ten is the client's**: `MAX_CHARACTERS_PER_REALM` in
   * `CharacterSelect.lua`, which `pipeline/layout.py` reads the same way it
   * reads how many rows a shop shows at once.  The issue that asked for this
   * screen said the number was ours to decide, and it is not — the same as
   * every other number in this interface.
   */
  /**
   * Who is reading a quest, for the markers its text carries.
   *
   * The original writes each quest once and lets the client fill in the
   * reader — `$N`, `$C`, `$R`, `$Ghe:she;` — and so does the translation, for
   * the same reason: resolving them at bake time would be one copy of every
   * quest per class per sex.
   */
  const reader = (): Reader => ({
    name: me?.name ?? '주인공',
    cls: layout?.who?.classes?.[String(myClass)] ?? '',
    race: layout?.who?.races?.[String(me?.race ?? 1)] ?? '',
    sex: me?.sex ?? 0,
  })
  /**
   * What an errand says, with the shape underneath it.
   *
   * `told` is the original's own paragraph where there is a translation of it;
   * `errand(shapeOf(q))` is the line this game has always built out of the
   * numbers, and it stays under the prose rather than instead of it — a
   * paragraph says why and the shape says how many, and the second is the one
   * a player checks against the counter in the corner.
   */
  const told = (id: number, which: keyof NonNullable<ReturnType<typeof proseOf>>)
  : string[] => {
    const got = proseOf(id)?.[which]
    return got ? fill(got, reader()) : []
  }

  const roomFor = () => (layout?.spec?.pick?.['slots'] as number) ?? 10
  let cards: Card[] = []
  let mySlot = 1
  /**
   * Put a chosen character in the world.
   *
   * Filled in at the bottom of this file, where the save is read, because
   * that is where the rest bonus is worked out and `drawPick` is written
   * above it.  A forward reference rather than moving one of the two: the
   * screen is drawn from four places and the boot happens once.
   */
  let intoWorld: (card: Card) => void = () => {}

  /**
   * Draw the screen that chooses a character.
   *
   * A save from another bake is **listed and refused**, not deleted.  With one
   * slot the rule was "a world that has been re-baked throws the save away",
   * which was fine when the save was the only one and the message was on the
   * screen the moment it happened.  With ten, deleting on sight means a
   * player opens the game after a deploy and three names are simply gone with
   * one line in a log — so the names stay, the row says why it cannot be
   * entered, and the button that removes it is the player's.
   */
  let chosen = 0
  const drawPick = () => {
    const size = (layout?.spec?.pick ?? {}) as Record<string, number[]>
    const rows = cards.map((c) => {
      const w = c.save.you.who
      const table = layout?.who
      const race = table?.races?.[String(w?.race ?? 1)] ?? ''
      const kind = table?.classes?.[String(w?.cls ?? 1)] ?? ''
      const ok = !worldHash || !c.save.world || c.save.world === worldHash
      return {
        slot: c.slot,
        name: w?.name || '주인공',
        what: `${c.save.you.level}레벨 · ${race} ${kind}`.trim(),
        // Worked out from where he stopped rather than stored beside it: the
        // area a coordinate is in is a fact about the world, and a word kept
        // next to the numbers it came from is a word that can disagree.
        where: zoneOf(areaOf(c.save.hero.x, c.save.hero.y),
          inside(areaOf(c.save.hero.x, c.save.hero.y))),
        can: ok,
        ...(ok ? {} : { why: '다른 세계에서 만든 캐릭터다' }),
      }
    })
    if (!rows.some((r) => r.slot === chosen)) {
      chosen = rows.find((r) => r.can)?.slot ?? rows[0]?.slot ?? 0
    }
    ui.setPick(true, {
      rows,
      chosen,
      choose: (slot) => { chosen = slot; drawPick() },
      enter: (slot) => {
        const card = cards.find((c) => c.slot === slot)
        if (card) intoWorld(card)
      },
      erase: (slot) => {
        cards = cards.filter((c) => c.slot !== slot)
        wipeSave(slot).catch(() => {})
        if (cards.length) drawPick()
        else { ui.setPick(false, {} as never); mySlot = 1; drawCreate() }
      },
      make: () => {
        const free = freeSlot(cards, roomFor())
        if (free === null) return
        mySlot = free
        ui.setPick(false, {} as never)
        drawCreate()
      },
      room: freeSlot(cards, roomFor()) !== null,
      say: `${cards.length} / ${roomFor()}`,
      size: size as Record<string, [number, number]>,
    })
  }

  const snapshot = (): Save => ({
    version: SAVE_VERSION, world: worldHash, at: Date.now(),
    hero: { x: hero.x, y: hero.y, dir: hero.dir,
      ...(indoors ? { inside: (() => {
        const mine = caves.findIndex((c) => c === indoors)
        return [mine >= 0 ? 1 : 0,
          mine >= 0 ? mine : buildings.indexOf(indoors!), storey] as [number, number, number]
      })() } : {}) },
    you: {
      level: you.level, xp: you.xp, hp: you.hp, power: you.power,
      purse: you.purse, kills: you.kills,
      bag: you.bag, trades: you.trades,
      // **What is left, not when it ends.**  `clock` starts at nought every
      // load, so a cooldown stored as a moment on it is a cooldown that comes
      // back with the whole session still to run.
      cools: Object.fromEntries(Object.entries(you.cools)
        .map(([id, at]) => [id, Math.max(0, at - clock)])
        .filter(([, left]) => (left as number) > 0)),
      items: held, gear, taught, bought, recipes, stands, bar,
      dura: { worn: { ...dura }, held: { ...duraHeld } },
      auto: you.auto ? 1 : 0,
      auras: stillOn(),
      rest: you.rest, restedIn: resting() ? 1 : 0,
      finished: you.finished, born: you.born,
      ...(me ? { who: { ...me } } : {}),
    },
    seed: seed(),
    quests: {
      held: log.held, done: [...log.done],
    },
  })
  /**
   * What is still on him, with the seconds each has left.
   *
   * Everything here is stored against `clock`, which starts at nought on every
   * load — so the save carries the *remainder* and `restore` puts it back on
   * whatever clock it finds.  A time saved against a clock that restarts is
   * not a time.
   */
  const stillOn = (): NonNullable<Save['you']['auras']> => {
    const left = (until: number) => Math.max(0, until - clock)
    const out: NonNullable<Save['you']['auras']> = {}
    if (you.mend && you.mend.until > clock) {
      out.mend = [left(you.mend.until), left(you.mend.next), you.mend.each]
    }
    if (you.using && you.using.until > clock) {
      out.using = [left(you.using.until), left(you.using.next),
        you.using.each, you.using.power ? 1 : 0, you.using.word]
    }
    if (youBleed && youBleed.until > clock) {
      out.bleed = [left(youBleed.until), left(youBleed.next), youBleed.each]
    }
    if (you.shout && you.shout.until > clock) {
      out.shout = [left(you.shout.until), you.shout.ap]
    }
    if (blessed && blessed.until > clock) {
      out.blessed = [left(blessed.until), blessed.stat, blessed.amount]
    }
    if (you.absorb > 0) out.absorb = you.absorb
    if (you.stance) out.stance = you.stance
    return out
  }

  /** And back on to this session's clock. */
  const putBackOn = (a: Save['you']['auras']) => {
    you.mend = null; you.using = null; youBleed = null
    you.shout = null; blessed = null; you.absorb = 0
    // A cast in flight is interrupted by closing the tab, the way the server
    // interrupts one; combo points belong to a target that is not here.
    you.casting = null; you.combo = 0; you.comboOn = null; you.gcd = 0
    if (!a) return
    if (a.mend) {
      you.mend = { until: clock + a.mend[0], next: clock + a.mend[1],
        each: a.mend[2] }
    }
    if (a.using) {
      you.using = { until: clock + a.using[0], next: clock + a.using[1],
        each: a.using[2], power: !!a.using[3], word: a.using[4] }
    }
    if (a.bleed) {
      youBleed = { until: clock + a.bleed[0], next: clock + a.bleed[1],
        each: a.bleed[2] }
    }
    if (a.shout) you.shout = { until: clock + a.shout[0], ap: a.shout[1] }
    if (a.blessed) {
      blessed = { until: clock + a.blessed[0], stat: a.blessed[1],
        amount: a.blessed[2] }
    }
    you.absorb = a.absorb ?? 0
    you.stance = a.stance ?? 0
  }

  const restore = (save: Save) => {
    // Back in the room before being put down in it: `placeHero` asks whether
    // the spot can be stood on *from where the scene thinks he is*, and from
    // outside a room is a roof.
    const inside = save.hero.inside
    const room = inside ? (inside[0] ? caves : buildings)[inside[1]] ?? null : null
    indoors = room && room.plan ? room : null
    storey = indoors
      ? Math.max(-1, Math.min(inside![2], (indoors.floors?.length ?? 0) - 1)) : -1
    onRung = false
    // On a doorstep counts as having just come through it, or the first step
    // walks him straight back out of the door he was saved beside.
    onStep = !!indoors
    placeHero(save.hero.x, save.hero.y); hero.dir = save.hero.dir
    camX = hero.x; camY = hero.y
    if (save.you.who) {
      const was = save.you.who
      me = { hair: 'plain', beard: '', ...was }
      // The same call the creation screen makes, without the dressing: a
      // returning character is wearing what he was wearing, and those rows
      // are restored below.
      becomeClass(me.cls, false)
      ui.setName(was.name)
    }
    you.level = Math.max(1, save.you.level)
    you.line = lineFor(you.level)
    you.max = you.line[HP]!
    you.hp = Math.min(you.max, save.you.hp || you.max)
    you.xp = save.you.xp; you.power = save.you.power
    you.purse = save.you.purse; you.kills = save.you.kills
    you.bag = save.you.bag ?? {}
    you.trades = save.you.trades ?? you.trades
    // Back on to this session's clock — see the note on `cools` in `save.ts`
    // — and never longer than the ability's own cooldown, because some v4
    // saves hold a moment where this reads a remainder (`src/sim/cools.ts`).
    // After `becomeClass`, so `anySpell` is reading this character's book.
    you.cools = Object.fromEntries(Object.entries(coolsLeft(save.you.cools,
      (id) => (anySpell(id)?.cool ?? 0) / 1000))
      .map(([id, leftover]) => [id, clock + leftover]))
    putBackOn(save.you.auras)
    held = save.you.items ?? []
    gear = save.you.gear ?? {}
    // Before `lineFor` below, which asks what is broken.
    dura = { ...(save.you.dura?.worn ?? {}) }
    duraHeld = { ...(save.you.dura?.held ?? {}) }
    taught = save.you.taught ?? []
    recipes = save.you.recipes ?? []
    stands = save.you.stands ?? {}
    bar = (save.you.bar ?? []).slice(0, BAR_SLOTS)
    you.auto = !!save.you.auto
    bought = save.you.bought ?? {}
    you.rest = save.you.rest ?? 0
    you.finished = save.you.finished ?? 0
    you.born = save.you.born ?? Date.now()
    // Everything downstream of what is worn, worked out again rather than
    // stored: maximum health is stamina and stamina is the level plus a
    // breastplate.
    you.line = lineFor(you.level)
    you.max = you.line[HP]!
    you.hp = Math.min(you.max, save.you.hp || you.max)
    // **Keeping the arrangement**, which is the whole point of saving it: a
    // square the player emptied on purpose stays empty, and only what is no
    // longer known is taken off.
    relearn(true)
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
  /**
   * The plan, on the minimap, when the plan is where you are.
   *
   * Indoors the circle used to show the forest — `paintMap` asked three
   * questions a cell and all three were about the ground outside, with no line
   * anywhere asking *whether you are in a building*.  Since the inside became
   * a scene of its own (issue 130) the screen and the minimap have been
   * showing two different worlds.
   *
   * **The original does not do this either**, and that is worth saying rather
   * than hiding: 3.3.5a draws terrain indoors too and what you see is the
   * roof.  It has no plan to draw — `DungeonMap.dbc` has 55 rows and not one
   * of them is a building in Elwynn.  We have one, per storey, so this is
   * doing better than the original rather than copying it.
   *
   * Three cells' worth of information a pixel, and all of it already baked:
   * `bits` is the outline, `solid` the walls, `floor` where a man can stand,
   * `over` whether there is anything above his head — which is the only thing
   * that tells a courtyard from a room — and `steps` the way up.
   */
  const PLAN_INK = {
    /** Outside the outline: the same slate the panels are drawn on. */
    off: '#14161f',
    /** Stone. */
    wall: '#4a463c',
    /** Where a man can stand, under a roof. */
    floor: '#9a8f78',
    /**
     * And where he can stand under the sky, which is a yard and not a room.
     *
     * Not the meadow's own green, which it was: the two palettes have to be
     * **disjoint** or the check that asks "is this circle ground or plan"
     * cannot tell a courtyard from a field, and that is exactly the question
     * it exists to answer.
     */
    yard: '#4a7a44',
    /** The way up, which is the one thing on this map you can act on. */
    steps: '#c9a86a',
    /** Inside the outline and none of the above: fill, cellar, thickness. */
    dark: '#25272e',
    /**
     * Standing room with something standing on it — a pew end, a pillar: the
     * room drawing's *speck*, floor with an edge round it.  A shade of the
     * floor and not the wall, because the room does not draw it as a wall.
     */
    speck: '#7a7160',
    /**
     * **Another storey of the same building, faint.**  Where this storey has
     * nothing — outside its outline, or a stairwell — the storeys above and
     * below show through, so the circle says where a flight comes out before
     * you climb it.  A cool slate rather than a dim floor colour, because a
     * dim floor colour came out the wall's brown and the two read as one.
     */
    ghost: '#2e3444',
    /** And their flights, which is the part of another storey worth finding. */
    ghostSteps: '#6a5836',
  }
  const inkRgb = (hex: string) =>
    [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)] as const

  /**
   * The plan of the storey you are on, a pixel at a time, with the others under it.
   *
   * **The room's own cells, not the bake's masks.**  Each pixel asks
   * `codesOf` — the sort `roomCells` makes for the room drawing — so a wall is
   * where the room draws wall, a pew end is floor with something on it, and a
   * stairwell's air is not a purple carpet of `steps`.  A storey the room has
   * not been composed for is sorted all the same, without composing it: the
   * sort is bytes, and the picture is megabytes.
   *
   * One sample a pixel indoors, where outdoors takes one every two: the
   * outdoor circle is 120 yards and a ground, the indoor one is the building's
   * own size and a plan, and at two a pixel a cottage's inner wall was a
   * dotted line or nothing.  The abbey's four storeys come to a millisecond.
   */
  function paintPlan(b: Built, n: number, yd: number, px: Uint8ClampedArray) {
    const all = [b.plan!, ...b.floors]
    const here = Math.max(0, Math.min(all.length - 1, storey + 1))
    const codes = all.map((q, k) => codesOf(b, q, k ? all[k - 1]! : null))
    // The nearest storey first: under a stairwell the floor it leads to is
    // the one worth showing, not the attic three floors up.
    const others = all.map((_, k) => k).filter((k) => k !== here)
      .sort((u, v) => Math.abs(u - here) - Math.abs(v - here))
    const byCode = [PLAN_INK.off, PLAN_INK.wall, PLAN_INK.dark, PLAN_INK.floor,
      PLAN_INK.yard, PLAN_INK.speck, PLAN_INK.steps].map(inkRgb)
    const ghost = inkRgb(PLAN_INK.ghost), ghostSteps = inkRgb(PLAN_INK.ghostSteps)
    const q = all[here]!, mine = codes[here]!
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const wx = hero.x + (n / 2 - j) * yd
        const wy = hero.y + (n / 2 - i) * yd
        const cell = planCell(q, b, wx, wy)
        const cc = cell < 0 ? CELL.off : mine[cell]!
        let ink = byCode[cc]!
        if (cc === CELL.off || cc === CELL.void) {
          for (const k of others) {
            const m = planCell(all[k]!, b, wx, wy)
            if (m < 0) continue
            const o = codes[k]![m]!
            if (o === CELL.stairs) { ink = ghostSteps; break }
            if (o === CELL.floor || o === CELL.yard || o === CELL.speck) { ink = ghost; break }
          }
        }
        const at = (j * n + i) * 4
        px[at] = ink[0]; px[at + 1] = ink[1]; px[at + 2] = ink[2]; px[at + 3] = 255
      }
    }
  }

  /**
   * The ways out and the flights' marks, on the plan, at the plan's size — the
   * same marks `drawRoom` puts on the glass, out of the same composed room.
   *
   * Only from a room already kept: the storey you stand on is composed by the
   * frame before the circle is painted, and composing one for the circle alone
   * would be megabytes for a mark.  A doorway between rooms is a bar across its
   * gap, the threshold's own width; a front door is the arrow going out.
   */
  function mapMarks(b: Built, p: Plan, room: Room, toMap: (x: number, y: number) => [number, number],
    size: number) {
    mapFlightMarks.length = 0
    const at = (i: number, j: number) => {
      const [x, y] = fromPlan(p, b, p.x0 + i * p.s, p.y0 + j * p.s)
      return toMap(x, y)
    }
    const rim = Math.max(1.5, size / 5)
    for (const x of room.exits) {
      const [X, Y] = at(x.at[0], x.at[1])
      const [X2, Y2] = at(x.at[0] + x.along[0], x.at[1] + x.along[1])
      const l = Math.hypot(X2 - X, Y2 - Y) || 1
      const ux = (X2 - X) / l, uy = (Y2 - Y) / l
      if (x.kind === 'front') { drawMark(X, Y, ux, uy, 'out', mapCtx, size, rim); continue }
      const h = Math.max(1, x.half / toMapScale)
      mapCtx.lineCap = 'round'
      mapCtx.strokeStyle = 'rgba(22, 18, 14, 0.9)'
      mapCtx.lineWidth = rim + 1.5
      mapCtx.beginPath()
      mapCtx.moveTo(X + uy * h, Y - ux * h)
      mapCtx.lineTo(X - uy * h, Y + ux * h)
      mapCtx.stroke()
      mapCtx.strokeStyle = markInk
      mapCtx.lineWidth = rim
      mapCtx.stroke()
      mapCtx.lineCap = 'butt'
    }
    for (const fl of room.flights) {
      const pair = fl.marks.length === 2 && fl.marks[0]!.at[0] === fl.marks[1]!.at[0]
        && fl.marks[0]!.at[1] === fl.marks[1]!.at[1]
      fl.marks.forEach((m, which) => {
        const [X, Y] = at(m.at[0], m.at[1])
        mapFlightMarks.push(X, Y)
        let ux = 0, uy = 0
        if (m.dir) {
          const [X2, Y2] = at(m.at[0] + m.dir[0], m.at[1] + m.dir[1])
          const l = Math.hypot(X2 - X, Y2 - Y) || 1
          ux = (X2 - X) / l; uy = (Y2 - Y) / l
        }
        drawMark(X + (pair ? (which ? 0.55 : -0.55) * size : 0), Y, ux, uy, m.what, mapCtx, size, rim)
      })
    }
  }
  /** Yards a minimap pixel is, as the last paint had it. */
  let toMapScale = 1
  /** How big a mark on the circle is, in its own pixels, as the last paint had it. */
  let mapMark = 7
  /**
   * Where the last paint put the flights' marks on the circle, x then y — so a
   * check reading a threshold's pixels can tell a threshold with a triangle
   * drawn over it from one that is not there.  One array, emptied a paint.
   */
  const mapFlightMarks: number[] = []

  function paintMap() {
    const n = ui.map.width
    const step = 2
    const inside = indoors
    const plan = inside ? planNow() : null
    // **The building's own size, not a fixed number.**  Outdoors the circle is
    // a hundred and twenty yards because that is a useful distance to see; a
    // cottage is ten across and the abbey ninety-one, and a map of a room that
    // shows a hundred and twenty yards of it is a map of eight pixels of room.
    // What an indoor map is for is the whole building, so that is what it
    // spans — capped at the outdoor number, because more than that is not a
    // minimap any more.
    const span = inside
      ? Math.min(MAP_YARDS, 2 * Math.max(inside.l, inside.w) + 6)
      : MAP_YARDS
    const yd = span / n
    toMapScale = yd
    // Marks a set size on the glass, whatever the circle is drawn at: five
    // pixels of mark on a desktop's 150-pixel circle is twelve of the canvas's
    // on a phone's 64.  Seven was tried first and the abbey's tower storey was
    // a field of triangles, and on a phone the inn's plan was mostly marks.
    // Read off the page four times a second, which is the rate this is painted
    // at and not the frame's.
    const dial = ui.map.clientWidth || n
    const size = Math.max(4, Math.round((5 * n) / dial))
    mapMark = size
    const img = mapCtx.createImageData(n, n)
    const px = img.data
    if (inside && plan && inside.plan) paintPlan(inside, n, yd, px)
    else {
      for (let j = 0; j < n; j += step) {
        for (let i = 0; i < n; i += step) {
          // North up, west left — the same map the screen is.
          const wx = hero.x + (n / 2 - j) * yd
          const wy = hero.y + (n / 2 - i) * yd
          const hex = wetAt(wx, wy) ? '#2d5f86'
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
    }
    mapCtx.putImageData(img, 0, 0)
    const mid = n / 2
    const toMap = (x: number, y: number): [number, number] =>
      [mid - (y - hero.y) / yd, mid - (x - hero.x) / yd]
    if (inside && plan) {
      const room = roomCache.get(plan)
      if (room) mapMarks(inside, plan, room, toMap, size)
    }
    // Everybody awake, as a dot: red if it would fight you, green if it would
    // not.  Only the awake, which is the same couple of hundred the scene is
    // already thinking about.
    //
    // **And only the ones under this roof**, which is the same question the
    // scene asks before it draws anybody: a dot on the plan for somebody
    // standing in the meadow outside is the forest coming back in through the
    // other door.
    for (const m of active) {
      if (m.dead) continue
      if (inside && roofOver(m.x, m.y) !== inside) continue
      const i = mid - (m.y - hero.y) / yd
      const j = mid - (m.x - hero.x) / yd
      if (i < 1 || i > n - 1 || j < 1 || j > n - 1) continue
      mapCtx.fillStyle = aggressive(m.fight) ? '#d8564a'
        : fightable(m.fight) ? '#d8b24a' : '#7fc46f'
      mapCtx.fillRect(Math.round(i) - 1, Math.round(j) - 1, 2, 2)
    }
    // **The player, and which way he faces.**  A three-pixel square was a
    // pixel and a third on a phone's circle, and it said nothing about where
    // he would go next — which on a plan with doors in it is the question.  A
    // dot with a dark rim and a wedge ahead of it, the way the sprite faces:
    // the four poses are the glass's four directions, and north is up both.
    const r0 = Math.max(2, size * 0.35)
    const [fx, fy] = hero.dir === DIR_UP ? [0, -1] : hero.dir === DIR_DOWN ? [0, 1]
      : hero.dir === DIR_LEFT ? [-1, 0] : [1, 0]
    const tip = r0 + size * 0.8, base = r0 * 0.4, wide = size * 0.45
    mapCtx.beginPath()
    mapCtx.moveTo(mid + fx * tip, mid + fy * tip)
    mapCtx.lineTo(mid + fx * base - fy * wide, mid + fy * base + fx * wide)
    mapCtx.lineTo(mid + fx * base + fy * wide, mid + fy * base - fx * wide)
    mapCtx.closePath()
    mapCtx.moveTo(mid + r0, mid)
    mapCtx.arc(mid, mid, r0, 0, Math.PI * 2)
    mapCtx.lineJoin = 'round'
    mapCtx.lineWidth = Math.max(1.5, size / 5)
    mapCtx.strokeStyle = 'rgba(12, 10, 8, 0.9)'
    mapCtx.stroke()
    mapCtx.fillStyle = '#ffffff'
    mapCtx.fill()
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
  let hudH = 0
  /**
   * And how far across the panel reaches, which on a phone is what matters.
   *
   * The panel used to sit along the bottom of the glass, so the camera lifted
   * the pair of you *up* out from behind it.  It sits down the left now — the
   * corner `GossipFrame` takes, and the one a thumb does not — so what it
   * hides is a strip of the left of the screen and the camera pushes the pair
   * of you *right* instead.  The axis is the whole difference, and getting it
   * wrong slides the person you are talking to behind the panel you opened to
   * talk to them.
   */
  let panelR = 0

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
        li.append(b)
        // The picture, when the row is a thing rather than a sentence.  A
        // shop that says `식량 — 25동` on two consecutive rows is two
        // different things wearing the same four characters, and this game
        // does not use item names at all — so the picture is the only thing
        // on the row that tells them apart, and the quality is the only thing
        // that says which is worth having.
        if (o.icon) li.append(pic(o.icon, o.tint))
        const text = document.createElement('span')
        text.textContent = o.label
        if (o.tint) text.style.color = o.tint
        li.append(text)
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
    panelR = talkEl.getBoundingClientRect().right
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
  /**
   * Which shop is open, and which page of it.
   *
   * Two fields rather than one, because a page is not a property of the
   * shopkeeper: walk away and come back and you are at the front of his stock
   * again, which is what the original does.
   */
  /**
   * The colour a crafting row carries, which is the only thing on it that is
   * about the *player* rather than about the recipe.
   *
   * Orange, yellow, green, grey are the original's four and they are what the
   * skill-up curve actually looks like — see `heatOf`.  A grey row still works
   * and teaches nothing, which is why it is drawn dimmer rather than removed.
   */
  const HEAT_TINT: Record<string, string> = {
    orange: '#d98032', yellow: '#d9c04a', green: '#6fbf5a', grey: '#8a8a8a',
  }

  /** Whether the spellbook is up, and which page of it. */
  let bookOpen = false
  let bookPage = 0
  /**
   * The book, twelve to a page — the original's own number out of
   * `SpellBookFrame.lua`.
   *
   * Everything known, not everything on the bar: the book is what you have and
   * the bar is what you chose to keep within reach.  Those were the same list
   * until issue 225, which is why there was no book.
   */
  const drawBook = () => {
    if (!bookOpen) {
      ui.setBook(false, 0, 0, [], () => {})
      return
    }
    const per = (layout?.spec?.book?.['page'] as number) ?? 12
    const pages = Math.max(1, Math.ceil(spells.length / per))
    bookPage = Math.max(0, Math.min(bookPage, pages - 1))
    const rows = spells.slice(bookPage * per, bookPage * per + per)
      .map((sp) => {
        const [word, what] = abilityOf(sp.id)!
        const on = bar.includes(sp.id)
        return [sp.id, word + (on ? '  ·' : ''), iconOf(sp.id),
          `${word}\n${what}`, why(sp) === null] as BookRow
      })
    ui.setBook(true, bookPage, pages, rows,
      (to) => { bookPage = to; drawBook() },
      // Pressed rather than dragged, because a phone has no drag on to a bar
      // it cannot see while the book is up: the first free square takes it.
      (id) => {
        if (bar.includes(id)) return
        const free = bar.indexOf(null)
        if (free >= 0) { putOnBar(free, id); drawBook() }
      })
  }

  /** Whether the crafting window is up, and which trade's page it shows. */
  let craftOpen = false
  let craftAt = 0
  let craftPage = 0

  let shopAt: Npc | null = null
  let shopPage = 0
  /**
   * **No buyback tab, and that is a decision rather than an omission.**
   *
   * The original has one and `BUYBACK_ITEMS_PER_PAGE` is twelve, which
   * `layout.py` now reads and ships — so the number is there the day it is
   * wanted.  What is not there is the thing it undoes: selling here is
   * `sellAll`, one press that empties the bag, because this game's bag is a
   * tally of goods and not a grid of things.  A buyback list is for taking
   * back the one item you sold by mistake out of the several you sold on
   * purpose, and there is no "one item" to point at yet.  It comes with the
   * bag becoming a grid, not before.
   */
  const SHOP_PER_PAGE = () => layout?.spec?.shop?.page ?? 10
  /**
   * Open a shopkeeper's window.
   *
   * The stock is `npc_vendor` through `items.py`, and it is the whole of it —
   * not the first four.  Ninety vendors, 528 rows between them, a median of
   * five and a longest of twenty-eight: seventy-eight fit on one page and
   * twelve do not, which is why the original has page buttons and why this
   * does.
   */
  /**
   * What is left of a limited row, and when it comes back.
   *
   * `npc_vendor.maxcount` and `incrtime` are the two columns that make a shelf
   * a decision rather than a list: 82 of this slice's 1,679 vendor rows hold
   * one, two or three of something and put another out every two, two and a
   * half or twenty-four hours.  Both were baked and neither was read.
   *
   * **The clock does the remembering, not the save.**  The wiki's objection to
   * this was that *"저장이 복잡해진다"*, and the shape issue 193 found for the
   * spawn pools answers it: a restock is a turn of a cycle, so all a save has
   * to carry is how many were bought **and which turn it was** — a count from
   * an older turn is a count of nothing.  One pair of numbers a row.
   */
  const stockLeft = (entry: number, row: number[]): number | null => {
    const most = row[1] ?? 0
    if (!most) return null
    const back = row[2] ?? 0
    const turn = cycleOf(back, Date.now() / 1000)
    const had = bought[`${entry}:${row[0]}`]
    return Math.max(0, most - (had && had[0] === turn ? had[1] : 0))
  }
  const takeStock = (entry: number, row: number[]) => {
    if (!(row[1] ?? 0)) return
    const turn = cycleOf(row[2] ?? 0, Date.now() / 1000)
    const key = `${entry}:${row[0]}`
    const had = bought[key]
    bought[key] = [turn, (had && had[0] === turn ? had[1] : 0) + 1]
  }
  /**
   * Buy one thing from one shopkeeper.
   *
   * One function, called by the window's own row and by `__buy`.  It was two:
   * the hook added the money and pushed the item itself, so a check that
   * bought something out of a limited shelf bought it through a path that had
   * never heard of a limited shelf and watched the count stay at one.  *A
   * check that reads the same side as the bug is blind to it* — this is that
   * again, one layer in.
   */
  const buyFrom = (entry: number, id: number): string | null => {
    const it = itemOf(id)
    if (!it) return null
    const row = (shelf.stock?.[String(entry)] ?? []).find((r) => r[0] === id)
    if (row && stockLeft(entry, row) === 0) return '그건 다 나갔소. 얼마 뒤에 다시 들어오오.'
    // **The price is his and not the row's.**  Standing is money off, and
    // where the money comes off is here — one place, for the same reason
    // buying has one place at all.
    const price = priceAt(entry, it[I_BUY] as number)
    if (you.purse < price) return '돈이 모자라다.'
    you.purse -= price
    held.push(id)
    if (row) takeStock(entry, row)
    return null
  }
  // One window, so opening either closes the other.  A workbench that shares
  // a shopkeeper's list has to share his box too, and two things drawing into
  // one box in the same frame is the last one winning.
  const openShop = (n: Npc) => {
    shopAt = n; shopPage = 0; craftOpen = false; drawShop()
  }
  const shutShop = () => { shopAt = null; drawShop() }
  const showCraft = (on: boolean) => {
    craftOpen = on
    if (on) { shopAt = null; craftPage = 0 }
    if (on) drawCraft(); else drawShop()
  }
  const drawShop = () => {
    if (!shopAt) {
      if (craftOpen) { drawCraft(); return }
      ui.setShop(false, '', '', 0, 0, [], () => {}, () => {})
      return
    }
    const at = shopAt.entry
    const stock = (shelf.stock?.[String(at)] ?? [])
      .filter((row) => !!itemOf(row[0]!))
    const per = SHOP_PER_PAGE()
    const pages = Math.max(1, Math.ceil(stock.length / per))
    shopPage = Math.max(0, Math.min(shopPage, pages - 1))
    const rows = stock.slice(shopPage * per, shopPage * per + per)
      .map((row) => {
        const id = row[0]!
        const it = itemOf(id)!
        const price = priceAt(at, it[I_BUY] as number)
        const left = stockLeft(at, row)
        // `coin(0)` is 없음, which on a purse means "you have none" and on a
        // price means nothing at all.  A few of the slice's stacked goods —
        // arrows, bullets — come to under a copper each once `items.py` has
        // divided the stack's price by its count, and a shop row saying
        // *nothing* where the price goes is worse than saying it is free.
        return [id, describe(it) + (left === null ? '' : ` (남은 ${left})`),
          price ? coin(price) : '거저', iconFor(it),
          tintOf(it), detail(it),
          you.purse >= price && left !== 0] as ShopRow
      })
    // The title says whose shop it is and, when standing is doing something,
    // that it is doing it.  A price five per cent off with nothing on screen
    // saying why is a number that looks like a mistake.
    const side = shelf.of?.[String(at)]
    const off = side && sides ? 1 - discountOf(rankWith(side)) : 0
    ui.setShop(true, nameOf(shopAt.kind)
      + (off > 0 && SIDE_WORD[side!]
        ? `  ·  ${SIDE_WORD[side!]} ${RANK_WORD[rankWith(side!)]} −${Math.round(off * 100)}%`
        : ''),
      coin(you.purse), shopPage, pages, rows,
      (id) => {
        const it = itemOf(id)
        if (!it) return
        const no = buyFrom(at, id)
        if (no) { ui.log(no, 'note'); return }
        ui.log(`${describe(it)}을(를) 샀다. ${coin(priceAt(at, it[I_BUY] as number))}`,
          'note')
        drawShop()
      },
      (to) => { shopPage = to; drawShop() },
      undefined, mendOffer(at))
  }
  /**
   * The mend button for this shopkeeper, or nothing if he does not mend.
   *
   * It says the whole price on its face — the sum of what each item costs, the
   * number `DurabilityRepairAll` would take if the purse holds it.
   */
  const mendOffer = (at: number) => {
    if (!menders.has(at) || !shelf.repair) return null
    const down = wornDown()
    const total = down.reduce((n, m) => n + (mendCost(at, m) ?? 0), 0)
    return {
      says: down.length ? `모두 수리 ${coin(total)}` : '고칠 것이 없다',
      can: down.length > 0,
      go: () => {
        const { paid, left } = mendAll(at)
        if (paid) ui.log(`고쳤다. ${coin(paid)}`, 'note')
        if (left) ui.log('돈이 모자라 다 고치지 못했다.', 'note')
        drawShop()
      },
    }
  }

  /**
   * What the skill rules hand over the moment a trade is taken up or raised.
   *
   * `Player::LearnSkillRewardedSpells` (Player.cpp:12256) is the rule and the
   * bake has already applied it: a recipe whose `R_HOW` is `GIVEN` is one of
   * these, and its rank is the rank it arrives at.  Called on learning and
   * again on every point, because half of them arrive later — a smith is given
   * the copper chain belt at one and the runed copper breastplate at fifty.
   */
  const learnFree = (skill: number) => {
    const at = you.trades[String(skill)]
    if (!at) return
    for (const r of craft.recipes) {
      if (r[R_SKILL] !== skill || r[R_HOW] !== GIVEN) continue
      if (r[R_RANK] > at[0] || recipes.includes(r[R_SPELL])) continue
      recipes.push(r[R_SPELL])
    }
  }

  /**
   * Pay for a rank of a trade and take it up.
   *
   * One implementation, called by the conversation and by the test hook.  The
   * shop learned this the hard way: `__buy` was a *second* way to buy a thing
   * that skipped the limited shelf, so the check that a shop could run out was
   * watching a path that had never heard of shelves.
   */
  const takeUp = (skill: number, step: Rank, cost = step[1]): string | null => {
    if (you.purse < cost) return '돈이 모자라오.'
    you.purse -= cost
    // The floor is one and not nought, and that is the server's:
    // `Spell::EffectLearnSkill` keeps what you had or starts you at one, never
    // at nothing.  A trade at nought would refuse a node that asks for nothing.
    const at = you.trades[String(skill)]
    you.trades[String(skill)] = [Math.max(1, at?.[0] ?? 0), step[4]]
    learnFree(skill)
    ui.log(`${TRADE_WORD[skill] ?? ''}을(를) 배웠다. ${coin(cost)}`, 'gain')
    return null
  }

  /** "리넨 천 2, 굵은 실 1" — what a recipe asks for, in Korean. */
  const needsLine = (r: Recipe): string =>
    r[R_NEEDS].map(([item, many]) => {
      const it = itemOf(item)
      return `${it ? describe(it) : `물건 ${item}`} ${many}`
    }).join(', ')

  /**
   * Make one, if the bag can pay for it.
   *
   * The skill-up is the server's own roll: `Player::UpdateCraftSkill` asks
   * `CraftSkillGainChance` with the ability's two thresholds and raises the
   * skill by one if it lands.  Which means the orange rows are where a trade
   * moves and the grey ones are where it stops — and that, rather than a
   * number on a screen, is the decision the crafting list is made of.
   */
  const makeOne = (r: Recipe): Said => {
    const at = you.trades[String(r[R_SKILL])]
    if (!at) return ['배우지 않은 기술이다']
    if (at[0] < r[R_RANK])
      return [`${TRADE_WORD[r[R_SKILL]] ?? ''} ${r[R_RANK]} 필요`]
    const missing = lacking(r[R_NEEDS], you.bag)
    if (missing.length) {
      const it = itemOf(missing[0]![0])
      return [`${it ? describe(it) : `물건 ${missing[0]![0]}`} ${missing[0]![1]} 모자란다`]
    }
    for (const [item, many] of r[R_NEEDS]) {
      const key = String(item)
      const left = (you.bag[key] ?? 0) - many
      if (left > 0) you.bag[key] = left
      else delete you.bag[key]
    }
    const made = itemOf(r[R_MAKES])
    const got = intoBag(r[R_MAKES], r[R_COUNT], made
      ? (made[I_WORD] as string) : 'oddment')
    const said: Said[] = [got]
    if (at[0] < at[1]
      && roll() * 1000 < riseChance(at[0], r[R_YELLOW], r[R_GREY])) {
      at[0] += 1
      said.push([`${TRADE_WORD[r[R_SKILL]] ?? ''} ${at[0]}`])
    }
    play('loot')
    return joined(said)
  }

  /**
   * Draw the crafting window.
   *
   * The shop's own window, because it is the shop's own shape: a picture, our
   * word for the thing, what it costs and whether you can afford it.  What a
   * recipe costs is a list of things rather than a number of coins, and that
   * is the only difference — writing a second list widget to say the same
   * four things in the same four places is how two lists start to drift.
   */
  const drawCraft = () => {
    if (!craftOpen) {
      ui.setShop(false, '', '', 0, 0, [], () => {}, () => {})
      return
    }
    const mine = Object.keys(you.trades)
      .filter((k) => craft.trades[k])
      .sort((a, b) => Number(a) - Number(b))
    if (!mine.length) {
      ui.setShop(true, '제작', '배운 기술이 없다', 0, 0, [], () => {}, () => {},
        '기술을 가르치는 사람을 찾아보시오')
      return
    }
    craftAt = Math.max(0, Math.min(craftAt, mine.length - 1))
    const skill = mine[craftAt]!
    const trade = craft.trades[skill]!
    const at = you.trades[skill]!
    const rows_ = craft.recipes
      .filter((r) => r[R_SKILL] === Number(skill) && recipes.includes(r[R_SPELL]))
      .sort((a, b) => a[R_RANK] - b[R_RANK])
    const per = SHOP_PER_PAGE()
    const pages = Math.max(1, Math.ceil(rows_.length / per))
    craftPage = Math.max(0, Math.min(craftPage, pages - 1))
    const rows = rows_.slice(craftPage * per, craftPage * per + per)
      .map((r) => {
        const made = itemOf(r[R_MAKES])
        const heat = heatOf(at[0], r[R_YELLOW], r[R_GREY])
        return [r[R_SPELL],
          (made ? describe(made) : `물건 ${r[R_MAKES]}`)
          + (r[R_COUNT] > 1 ? ` x${r[R_COUNT]}` : ''),
          needsLine(r), made ? iconFor(made) : '',
          HEAT_TINT[heat]!, made ? detail(made) : '',
          !lacking(r[R_NEEDS], you.bag).length] as ShopRow
      })
    // The title is the trade and where he is in it, which is the one number
    // the whole window is about; the purse's place says how many trades he has
    // and which of them this is, because that is what the key cycles.
    ui.setShop(true,
      `${TRADE_WORD[Number(skill)] ?? trade.word} ${at[0]} / ${at[1]}`,
      mine.length > 1 ? `T — ${craftAt + 1} / ${mine.length}` : '',
      craftPage, pages, rows,
      (id) => {
        const r = craft.recipes.find((x) => x[R_SPELL] === id)
        if (!r) return
        ui.log(makeOne(r), 'gain')
        drawCraft()
      },
      (to) => { craftPage = to; drawCraft() },
      '만들 줄 아는 것이 없다')
  }

  const sellAll = (): string[] => {
    const rows = Object.entries(you.bag)
    // And the things he is carrying but not wearing, which had no way out at
    // all: an item could be bought, found and worn, and `I_SELL` was a column
    // the bake filled that nothing in `src/` ever read — so a spare sword was
    // a number in a list forever.  Only what is *not* on him; taking the
    // shirt off his back over a counter is a different gesture.
    const spare = held.filter((id) => {
      const it = itemOf(id)
      return it && (it[I_SELL] as number) > 0
    })
    if (rows.length === 0 && spare.length === 0) return ['팔 것이 없소.']
    let paid = 0
    const said: string[] = []
    for (const [id, many] of rows) {
      const it = itemOf(Number(id))
      // The price comes off the item row now and not out of the bag, which is
      // what letting the id travel bought: one column, read by the shop, the
      // bag and the shopkeeper alike.
      const worth = ((it?.[I_SELL] as number) ?? 0) * many
      paid += worth
      said.push(`${it ? describe(it) : `물건 ${id}`} ${many} — `
        + `${worth > 0 ? coin(worth) : '값이 없다'}`)
    }
    for (const id of spare) {
      const it = itemOf(id)!
      const worth = it[I_SELL] as number
      paid += worth
      said.push(`${describe(it)} — ${coin(worth)}`)
    }
    you.bag = {}
    held = held.filter((id) => !spare.includes(id))
    for (const id of spare) delete duraHeld[String(id)]
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
      if (!it || !canWear(it, you.level, myClass)) continue
      const slot = it[I_SLOT] as string
      const now = gear[slot] !== undefined ? itemOf(gear[slot]!) : null
      // Better is the item level, which is the world's own one-number answer
      // to "is this an upgrade".
      if (now && (now[I_ILVL] as number) >= (it[I_ILVL] as number)) continue
      const was = gear
      const put = wear(gear, it, id)
      gear = put.gear
      held = held.filter((x) => x !== id).concat(put.off)
      carryWear(was)
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
  /**
   * The player's face, for the portrait.
   *
   * `PlayerFrame.xml` puts a 64 by 64 `PlayerPortrait` at the head of twenty
   * textures and what the client puts in it is the character's own head.
   * Ours was `sbed/health-normal` — a white cross — while the fifty-eight
   * layer sheets of that same character sat in `public/art/doll/` and the
   * paperdoll composed them two panels away.
   *
   * The same layers as the doll, cropped to the head: a helmet shows in the
   * portrait, which is what the original does and is the reason the portrait
   * is a portrait rather than a class badge.
   */
  const faceCanvas = document.createElement('canvas')
  let faceFrom = ''
  /**
   * The player's face, cropped out of the paperdoll.
   *
   * `PlayerFrame.xml` puts a 64 by 64 `PlayerPortrait` at the head of twenty
   * textures, and what the client puts in it is the character's own head.
   * Ours was `sbed/health-normal` — a white cross — while the fifty-eight
   * layer sheets of that same character sat in `public/art/doll/` and the
   * paperdoll composed them two panels away.
   *
   * A window over the doll and **not a second composition**, which was the
   * first attempt: the layers are packed at their own sizes with `dx`/`dy`
   * into a 57-pixel cell, so recomputing that geometry with a zoom over it
   * drew four per cent of a face.  The doll already solves it.  A helmet
   * shows in the portrait for free, which is what the original does and the
   * reason a portrait is a portrait rather than a class badge.
   */
  const paintFace = () => {
    const doll = paintDoll()
    if (!doll || !doll.width) return null
    // **Keyed on the composition, not on the names in it.**  It was the list
    // of layers, and a layer arrives a moment after it is first asked for:
    // the doll was composed without it, the face was cut from that, and when
    // the image landed `paintDoll` composed the same list again — the same
    // key — so the portrait kept the picture from before it loaded for as
    // long as the page was open.  A helmet put on never reached the frame.
    const key = `${dollDrawn}|${doll.width}`
    if (key === faceFrom && faceCanvas.width) return faceCanvas
    const side = 64
    faceCanvas.width = side
    faceCanvas.height = side
    const g = faceCanvas.getContext('2d')!
    g.imageSmoothingEnabled = false
    g.clearRect(0, 0, side, side)
    // Where the figure actually is, measured rather than assumed.
    //
    // A 114-pixel canvas holds a 24 by 80 person somewhere in the middle of
    // it, and *where* depends on the layer sheets: guessing at fractions of
    // the canvas put the window on empty air twice.  `paintDoll` takes that
    // measurement while only the worn layers are down, because once he was
    // given something to hold, the box of everything painted was a box round
    // a man and a sword and the window came out on his shoulder.
    //
    // Marked done only once there was something to measure.  Set before it,
    // the first blank frame was cached — the layers load a moment after the
    // first compose — and the portrait stayed empty for ever.
    if (!dollPerson) return null
    const { x0, y0, x1, y1 } = dollPerson
    faceFrom = key
    // The head is the top quarter of a standing figure, and square: a
    // portrait is a face, not a bust.
    const cut = Math.max(8, (y1 - y0) * 0.30)
    g.drawImage(doll, (x0 + x1) / 2 - cut / 2, y0 - cut * 0.06, cut, cut,
      0, 0, side, side)
    return faceCanvas
  }

  /**
   * And the target's face, which is the creature itself.
   *
   * The target frame chose between two icons — a wolf's head or a sword —
   * while `bake_npcs.py` had already cut every creature in four directions.
   * The first frame facing down is the one the client would use, and it is
   * the picture the player is looking at on the ground.
   */
  const foeCanvas = document.createElement('canvas')
  let foeFrom = ''
  const paintFoe = (n: Npc) => {
    const a = npcArt.kinds[n.art]
    if (!a) return null
    if (foeFrom === n.art && foeCanvas.width) return foeCanvas
    const c = npcArt.cell
    const side = 64
    foeCanvas.width = side
    foeCanvas.height = side
    const g = foeCanvas.getContext('2d')!
    g.imageSmoothingEnabled = false
    g.clearRect(0, 0, side, side)
    // Facing down, standing still: `dir` 0 is towards the camera and frame 0
    // is the one a creature is drawn in when it is not walking.
    // The top half of the cell, which is a head on anything drawn upright and
    // the front of anything that is not.  Measured against the 64-pixel cell
    // as it always was and then moved on to the kind's own row, so a chicken's
    // portrait is still a chicken's head and not its whole body.
    const cut = c * 0.62
    const wantY = c * 0.06
    const fromY = Math.max(a.y, a.y + wantY - a.top)
    const tall = Math.max(1, Math.min(cut, a.y + a.rows - fromY))
    g.drawImage(npcImg, (c - cut) / 2, fromY, cut, tall,
      0, 0, side, (side * tall) / cut)
    foeFrom = n.art
    return foeCanvas
  }

  const dollCanvas = document.createElement('canvas')
  /**
   * The one frame of each layer the doll is drawn from, cut out and kept —
   * not the sheet it came in.
   *
   * The portrait and the character sheet both draw the standing frame and
   * nothing else, and the sheets are every frame of every clip: the sword's is
   * 1,248 by 1,349, 6.4 MB decoded, and the five a new character wears were
   * 14.6 MB held for as long as the page was open to paint a 64-pixel face.
   * Cut to the frame they are a few kilobytes, and the sheet is let go.  None
   * of this was in `budgetcheck`, because the paths are built from a name and
   * its regex only finds the ones written out.
   */
  const dollStills = new Map<string, HTMLCanvasElement>()
  const dollLoading = new Set<string>()
  let dollKey = ''
  /** How many times the doll has actually been composed — see `paintFace`. */
  let dollDrawn = 0
  /** Where the man himself is inside `dollCanvas` — see `paintDoll`. */
  let dollPerson: { x0: number; y0: number; x1: number; y1: number } | null = null
  /** Slots something is worn in that the layer sheets cannot draw. */
  const dollMissing = new Set<string>()
  const paintDoll = () => {
    if (!dollArt) return null
    const who = 'male'
    const meta = dollArt.who[who]
    if (!meta) return null
    // Which layer for each slot, from what is worn there.  This said the
    // armour value decides light, medium or heavy "because is this leather or
    // plate is not a column anywhere" — and it is: `subclass`.  The chest now
    // takes its weight from the same rule the world sprite is drawn by, so the
    // sheet and the world cannot put two different materials on one man.
    const want: string[] = []
    for (const slot of ORDER) {
      // **The doll's `head` is a face and its `helm` is what goes on it**, and
      // the items call the helmet's slot `head`.  Read straight across, a
      // helmet drew a bare face and nothing drew the helmet — and with no
      // helmet on, nothing drew a face at all: `body` stops at the neck, so
      // the portrait was hair over a stump.  `render_paperdoll.py` renders the
      // face with every body (`ALWAYS`) for exactly this reason.
      const worn = slot === 'helm' ? gear['head'] : gear[slot]
      const from = slot === 'body' || slot === 'hair' || slot === 'head' ? null
        : worn !== undefined ? itemOf(worn) : null
      const armour = slot === 'body' ? 0 : (from?.[I_ARMOUR] as number) ?? 0
      const name = slot === 'body' ? `${who}_body_bare`
        : slot === 'head' ? `${who}_head_bare`
        : slot === 'hair' ? `${who}_hair_1`
          : from ? layerFor(dollArt, who, slot, armour,
            slot === 'weapon' ? armFor(gear[slot]) : null,
            slot === 'chest' ? WEIGHT[outfitOf(from) ?? ''] ?? null : null) : null
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
    const scale = 2
    // The canvas is what is actually being drawn, not the cell.
    //
    // `cell` is the box the *worn* layers fit in, because a man has to be
    // framed by where the man is — `pack_paperdoll.py` says why, and it says
    // it in the past tense: measured with a staff in the union it took that
    // box from 57 pixels to 98 and moved every other layer's offset with it.
    // So a held thing is allowed to hang outside the cell, its offsets go
    // negative, and the canvas grows to cover whatever this particular
    // outfit reaches.  Sized at the cell instead, a staff lost its lower
    // third and a greatsword its point.
    let lx = 0, ly = 0, rx = meta.cell, ry = meta.cell
    for (const name of want) {
      const b = meta.layers[name]
      if (!b) continue
      lx = Math.min(lx, b.dx); ly = Math.min(ly, b.dy)
      rx = Math.max(rx, b.dx + b.w); ry = Math.max(ry, b.dy + b.h)
    }
    dollCanvas.width = (rx - lx) * scale
    dollCanvas.height = (ry - ly) * scale
    // And how big that is on the panel.  `#sheet .doll` gives the *cell* 56
    // CSS pixels; the canvas is wider than the cell whenever he is holding
    // something, so the sum has to be done where the cell is known.  Left to
    // a fixed 56 square in the stylesheet, a sword made the canvas 156 by 150
    // and the man was squashed sideways to fit beside it.
    const on = 56 / meta.cell
    dollCanvas.style.width = `${((rx - lx) * on).toFixed(1)}px`
    dollCanvas.style.height = `${((ry - ly) * on).toFixed(1)}px`
    // Pulled up by however far the canvas grew above the cell, so that the
    // *man's* head stays where the panel puts it.  Without it a greatsword —
    // whose box reaches eighteen pixels over the cell, because somewhere in
    // the swing it is over his head — pushed him down on to the first two
    // rows of his own character sheet.
    dollCanvas.style.marginTop = `${(ly * on).toFixed(1)}px`
    const g = dollCanvas.getContext('2d')!
    g.imageSmoothingEnabled = false
    g.clearRect(0, 0, dollCanvas.width, dollCanvas.height)
    const frame = still(dollArt, who)
    /** Whether a layer is something he is carrying rather than wearing. */
    const held = (name: string) => name.includes('_weapon_')
    const put = (name: string) => {
      const box = meta.layers[name]
      if (!box) return
      const k = `${name}#${frame}`
      const cut = dollStills.get(k)
      if (!cut) {
        if (dollLoading.has(k)) return
        dollLoading.add(k)
        const img = new Image()
        // A layer that arrives after the still was composed has to make the
        // still be composed again, or the panel shows an empty square for
        // ever — the first draw always runs before any of these have loaded.
        img.onload = () => {
          // Each layer is packed at *its own* size, not at the cell's: the
          // body sheet is 592 by 855, which is sixteen columns of 37 by 45,
          // and `dx` and `dy` say where that rectangle sits inside the
          // 57-pixel cell.  Read as cell-sized frames the sheet is a tenth of
          // a column out and every layer draws somebody else's elbow.
          const c = document.createElement('canvas')
          c.width = box.w
          c.height = box.h
          const cg = c.getContext('2d')!
          cg.imageSmoothingEnabled = false
          cg.drawImage(img, (frame % dollArt.cols) * box.w,
            Math.floor(frame / dollArt.cols) * box.h, box.w, box.h, 0, 0, box.w, box.h)
          dollStills.set(k, c)
          dollLoading.delete(k)
          dollKey = ''
        }
        img.src = `./art/doll/${name}.png`
        return
      }
      g.drawImage(cut, 0, 0, box.w, box.h,
        (box.dx - lx) * scale, (box.dy - ly) * scale,
        box.w * scale, box.h * scale)
    }
    // Worn first, then measured, then held — and the order is the whole point.
    //
    // `dollPerson` is where the *man* is, and the portrait is a window on to
    // it.  Measured over everything drawn, a sword hanging at his side moved
    // the middle of the box a third of a head to the left and the portrait
    // came back nine per cent painted: a picture of his shoulder.  What he is
    // carrying is not part of where he is, which is the same distinction
    // `pack_paperdoll.py` makes one file away when it leaves the weapon out of
    // the cell.
    for (const name of want) if (!held(name)) put(name)
    dollDrawn++
    dollPerson = inkBox(g, dollCanvas.width, dollCanvas.height)
    for (const name of want) if (held(name)) put(name)
    return dollCanvas
  }

  /** The box of everything painted on a canvas, or null if nothing is. */
  const inkBox = (g: CanvasRenderingContext2D, w: number, h: number) => {
    const d = g.getImageData(0, 0, w, h).data
    let x0 = w, y0 = h, x1 = -1, y1 = -1
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3]! <= 20) continue
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
    return x1 < 0 ? null : { x0, y0, x1, y1 }
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
    // What using it does, which is the one thing a shop row never said.
    //
    // Two waters on one shelf — 159 and 46784 — carry the same word, the same
    // price, the same picture and the same level, and the only difference
    // between them is what happens when you drink one.  The row had no place
    // to say that, so the shop printed the same line twice; `I_USE` is the
    // place, and it arrived with issue 200 because a bandage needed it.
    const use = it[I_USE] as [string, number, number] | 0 | undefined
    if (use) bits.push(useWord(use))
    if (it[I_NEED]) bits.push(`${it[I_NEED]}레벨 필요`)
    // And if it does nothing at all, what it is worth being — `ItemLevel`, the
    // world's own one-number answer to "is this better", which `dressUp`
    // already decides an upgrade by.
    //
    // Not decoration.  Two recipes at 400 copper and two lumps of ore at 200
    // were the same picture, the same word and the same price on one page of
    // one shop, and this game ships no item names, so `등급` is the only thing
    // left that differs.  Without it a shopkeeper printed the same line twice
    // and the player had nothing to choose on.
    if (!bits.length && it[I_ILVL]) return `등급 ${it[I_ILVL]}`
    return bits.join(', ') || '쓸모는 파는 값뿐이다'
  }

  /**
   * How many times this one has been spoken to.
   *
   * Kept on the spawn rather than saved, because it is about a conversation
   * and not about the character: somebody the original gives three things to
   * say says them in turn while you stand there, and a new session starts the
   * turn over the way walking away and coming back would.
   */
  const spoken = new Map<number, number>()

  /**
   * What a conversation needs to know about whoever is having it.
   *
   * `conditions` is 276 rows touching this slice — *this line only to a
   * rogue*, *this option only once that errand is done* — and it was read by
   * nothing.  These five facts are what the table actually asks for, and the
   * kinds it asks that this game cannot answer are counted by the bake rather
   * than shipped as a rule that is always false.
   */
  const listener = (): Listener => ({
    cls: myClass,
    race: me?.race ?? 1,
    level: you.level,
    // A trade is a `SkillLine` id in the table and in this game too, now that
    // the trades are learned from the people the table files under the same
    // number.  There used to be a third table here joining our three words to
    // their ids; the ids arrive from the bake and the join is gone.
    skills: Object.fromEntries(Object.entries(you.trades)
      .map(([skill, at]) => [Number(skill), at[0]])),
    quest: (id: number) => log.done.has(id) ? 'done'
      : holding(log, id)
        ? (errandDone(log, holding(log, id)!) ? 'ready' : 'doing')
        : 'none',
  })

  function startTalk(n: Npc) {
    const turn = (spoken.get(n.entry) ?? 0)
    spoken.set(n.entry, turn + 1)
    const speech = speak(n.kind, n.role, n.level, n.seed, n.topic,
      () => directionsFrom(n), listener(), turn)
    // What this one is finished with, first, and then what they are asking
    // for.  Handing in before taking on is the order the original puts them
    // in and the order that reads right: you came back for a reason.
    for (const h of wants(log, n.entry)) {
      const q = log.all.get(h.id)!
      const ready = errandDone(log, h)
      const say2 = {
        label: ready ? '마쳤습니다' : `아직입니다 (${short(log, h)} 남음)`,
        // What he says when you come back: the original's line for having
        // finished, or for not having, with the shape under the second so the
        // counter and the sentence agree.
        lines: ready ? told(q.id, 'reward')
          : [...told(q.id, 'waiting'), ...errand(shapeOf(q))],
      } as Option
      if (ready) {
        /**
         * Handing it in, and what it pays.
         *
         * `chose` is an index into the quest's `pick` and -1 when there is
         * nothing to choose.  An errand's reward is where most equipment
         * comes from at these levels — the only other ways in are the shirt
         * you were made in and a shopkeeper, and both of those cost money.
         */
        const payOut = (chose: number) => {
          const paid = hand(log, h, chose)
          you.xp += paid.xp
          you.purse += paid.coin
          const got: string[] = []
          for (const [id, many] of paid.items) {
            for (let k = 0; k < many; k++) held.push(id)
            const it = itemOf(id)
            got.push(it ? describe(it) : `물건 ${id}`)
          }
          levelUp()
          // And what it is worth to a side.  Thirty-seven of this game's
          // fifty-one errands pay Stormwind and every one of them paid
          // nothing at all until issue 201, because the column is an index
          // and this read it as an amount.
          const stood = payStanding(paid.rep)
          const said = payFor(paid.xp, paid.coin)
            + (got.length ? `, ${got.join(', ')}` : '')
            + (stood.length ? `, ${stood.join(', ')}` : '')
          ui.log(`완료 — ${said}`, 'gain')
          showErrands()
          // And the next one, on the spot.  `RewardNextQuest` is not the same
          // column as `PrevQuestID`: that one says "this unlocks that", this
          // one says "hand this in and here is the next", and fourteen of the
          // slice's thirty-one are handed rather than walked.  Without it the
          // player finishes an errand, walks away, and has to work out for
          // themselves that the same person now wants something else.
          const next = q.leads ? log.all.get(q.leads) : undefined
          if (next && !log.done.has(next.id) && !holding(log, next.id)
            && you.level >= next.min) {
            startTalk(n)
            return [said, '그리고 다음 일거리를 내민다.']
          }
          return [said, ...(got.length ? ['G를 눌러 입는다.'] : [])]
        }
        // One of several, and you cannot take it back.  Nine of this slice's
        // thirty-one errands offer a choice of up to five and the game was
        // taking none of them — which is the shape of decision the wiki went
        // looking for and could not find in this stretch.
        if (q.pick.length) {
          say2.lines = ['고를 것이 있다.']
          speech.options.unshift(...q.pick.map(([id, many], i) => {
            const it = itemOf(id)
            return {
              label: `마치고 받기 — ${it ? describe(it) : `물건 ${id}`}`
                + (many > 1 ? ` x${many}` : ''),
              ...(it ? { icon: iconFor(it), tint: tintOf(it) } : {}),
              lines: it ? [detail(it)] : [],
              act: () => payOut(i),
            } as Option
          }))
        } else {
          say2.act = () => payOut(-1)
        }
      }
      speech.options.unshift(say2)
    }
    // **And which class he is**, which is the other half of issue 151's
    // filter.  The bake keeps a quest whose mask names any of this game's six
    // classes; the log only shows one whose mask names *this* one.
    for (const q of offers(log, n.entry, you.level, myClass)) {
      const name = told(q.id, 'title')[0]
      speech.options.unshift({
        label: name ? `${name} (${q.level}레벨)` : `일거리 (${q.level}레벨)`,
        lines: [...told(q.id, 'body'), ...errand(shapeOf(q)),
          // And what it is worth to a side, where it is worth anything.
          // Thirty-seven of this game's fifty-one errands pay Stormwind and
          // the offer said nothing about it — the original puts it in the
          // reward pane, and a reward you are not told about is not one you
          // can choose on.
          `사례: ${payFor(q.xp, q.coin)}${repLine(q.rep)}`],
        act: () => {
          take(log, q)
          ui.log(`맡음 — ${name || errand(shapeOf(q)).join(', ')}`, 'note')
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
      // And sells — **in a window of its own now**, which is what the original
      // does.  Four of them were lines of this conversation, and a shopkeeper
      // with twenty-eight things to sell had four of them on offer with no way
      // to reach the rest; the icons page had already printed the result,
      // *"lines 4 and 5 have the same words and the same price."*
      // A mender opens the same window with nothing on the shelf — the one
      // in Goldshire who keeps none still mends.
      const stocked = (shelf.stock?.[String(n.entry)] ?? []).length > 0
      if (stocked || (menders.has(n.entry) && shelf.repair)) {
        speech.options.push({
          label: stocked ? '물건을 봅니다' : '수리를 맡깁니다', lines: [],
          act: () => { openShop(n); return [] },
        })
      }
    }
    // And a trainer teaches.  `trainer_spell` says what, at what level, and
    // for how much; the warrior's first ten levels come to 2,110 copper and
    // the zone's quests pay about 1,175, which is the gap the whole economy
    // is made of.
    // **Only a trainer of your own class teaches you anything.**  `for` is
    // the class out of `trainer.Requirement`; a warrior standing in front of
    // the mage trainer gets the conversation and no lessons, which is what
    // the original does and what the whole of issue 151's filter was about.
    const school = shelf.trainers?.[String(n.entry)]
    if (school && (!school['for'] || school['for'] === myClass)) {
      // The ones he could take now, and only a handful: a class trainer has
      // sixty rows and a conversation is not a spreadsheet.
      const ready = school.teaches
        .filter(([id, , need]) => abilityOf(id!) && !taught.includes(id!)
          && need! <= you.level + 2)
        .sort((a, b) => a[2]! - b[2]!)
        .slice(0, 4)
      for (const [id, cost, need] of ready) {
        const word = abilityOf(id!)!
        // A lesson costs what *he* charges, which is the shop's rule and not
        // a second one: `Player::GetReputationPriceDiscount` is asked about
        // the creature, and a trainer is a creature.
        const price = priceAt(n.entry, cost!)
        speech.options.push({
          label: `${word[0]} 배우기 (${need}레벨) — ${coin(price)}`,
          lines: [word[1]],
          act: () => {
            if (you.level < need!) return [`${need}레벨이 되거든 오시오.`]
            if (you.purse < price) return ['돈이 모자라오.']
            you.purse -= price
            taught.push(id!)
            relearn()
            ui.log(`${word[0]}을(를) 배웠다. ${coin(price)}`, 'gain')
            return [`${word[0]}. ${coin(you.purse)} 남았소.`]
          },
        })
      }
    }
    // And a trade trainer teaches a trade.
    //
    // Thirteen of them stand in this slice and until now not one of them was
    // anybody: `items.py` counted them out of the trainer list because they
    // sold nothing this game could learn, which was true and was a
    // description of a hole rather than of a decision.  What they sell is
    // two things — the *rank*, which raises the ceiling, and the recipes
    // above the first, which are ordinary rows with a skill instead of a
    // level on them.
    for (const [skill, trade] of Object.entries(craft.trades)) {
      if (!trade.at.includes(n.entry)) continue
      const at = you.trades[skill]
      const step = nextRank(trade, at?.[0] ?? 0, at?.[1] ?? 0, you.level)
      const word = TRADE_WORD[Number(skill)] ?? trade.word
      if (step) {
        const cost = priceAt(n.entry, step[1])
        speech.options.push({
          label: at ? `${word} 더 배우기 (${step[4]}까지) — ${coin(cost)}`
            : `${word} 배우기 — ${coin(cost)}`,
          lines: [],
          act: () => {
            const no = takeUp(Number(skill), step, cost)
            if (no) return [no]
            return [`${word}. ${coin(you.purse)} 남았소.`]
          },
        })
      } else if (at) {
        const far = afterThis(trade, at[1])
        if (far) {
          speech.options.push({
            label: `${word} 더 배우기`, lines: [
              far[2] > at[0] ? `${word}이(가) ${far[2]}은 되어야 하오.`
                : `${far[3]}레벨은 되어야 하오.`],
            act: () => [],
          })
        }
      }
      // The recipes this one sells that he could take now.  Only the ones his
      // skill already reaches, sorted by what they ask for, and a handful —
      // a conversation is not a spreadsheet, which is the class trainer's
      // rule and the same one here.
      if (!at) continue
      const shelf_ = craft.recipes
        .filter((r) => r[R_SKILL] === Number(skill) && r[R_HOW] === SOLD
          && !recipes.includes(r[R_SPELL]) && r[R_RANK] <= at[0])
        .sort((a, b) => a[R_RANK] - b[R_RANK])
        .slice(0, 4)
      for (const r of shelf_) {
        const made = itemOf(r[R_MAKES])
        const label = made ? describe(made) : `물건 ${r[R_MAKES]}`
        const price = priceAt(n.entry, r[R_COST])
        speech.options.push({
          label: `${label} 만드는 법 — ${coin(price)}`,
          lines: [needsLine(r)],
          act: () => {
            if (you.purse < price) return ['돈이 모자라오.']
            you.purse -= price
            recipes.push(r[R_SPELL])
            ui.log(`${label} 만드는 법을 배웠다. ${coin(price)}`, 'gain')
            return [`${label}. ${coin(you.purse)} 남았소.`]
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

  /**
   * The other seam, which is a staircase.
   *
   * The same shape as a door and for the same reason: a landing is a *place*,
   * and standing on it is the act.  No prompt, no menu — the floor changes
   * under you and the scene is the floor above.
   *
   * Each storey's `steps` mask marks the way *up* from it, so going down is
   * the floor below's own mask read from the floor above — the stairs are
   * under your feet either way and the mask does not have to be stored twice.
   *
   * `onRung` is the doorstep's latch: a landing is several cells across and a
   * step is a third of a yard, so without it you would ride the stairs up and
   * down once a frame.
   */
  let onRung = false
  function upOrDown() {
    if (!indoors) return
    const here = planNow()
    if (!here) return
    // **The way in is not a flight.**  The ground storey's `steps` run under
    // some front doors — house 26 in Goldshire's is on them — and while the
    // door threw a man three yards in or out, nobody stood there long enough
    // for this to see it.  Walked through, the next step took him upstairs on
    // the way in and on the way out.  A doorway between rooms is not one of
    // these, so a stairwell beside one still climbs.
    if (storey < 0 && onPorch(indoors, hero.x, hero.y)) { onRung = true; return }
    const up = bitAt(here.steps, planCell(here, indoors, hero.x, hero.y))
    const below = planUnder()
    const down = !!below
      && bitAt(below.steps, planCell(below, indoors, hero.x, hero.y))
    if (!up && !down) { onRung = false; return }
    if (onRung) return
    onRung = true
    // Up wins when a cell is both, which happens on a landing between two
    // flights: the player pressed towards the stairs and the stairs go on.
    if (up && storey + 1 < indoors.floors.length) {
      storey += 1
      ui.log('위층으로 올라갔다.', 'note')
    } else if (down && storey >= 0) {
      storey -= 1
      ui.log('아래층으로 내려왔다.', 'note')
    }
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
      say(body.x, body.y, flat(got), true)
      ui.log([`${nameOf(body.kind)}에게서 `, ...got], 'gain')
      return
    }
    // And whatever is growing or standing there, for the same reason.
    const thing = atHand()
    if (thing && !inReach()) {
      const got = gather(thing)
      say(thing.x, thing.y, flat(got), true)
      ui.log([`${nameOf(thing.kind)} — `, ...got], 'gain')
      return
    }
    const n = inReach()
    if (n) startTalk(n)
  }

  /**
   * How much ground a screen shows, and why it is yards rather than a scale.
   *
   * `zoom = 1` means twenty-four pixels to the yard whatever the screen is, so
   * the amount of *world* on the glass was whatever the window happened to be:
   * 37 yards across a nine-hundred-pixel desktop and **sixteen across a
   * phone**.  The same game is four times emptier in the hand than on the
   * desk, and nothing said so — which is half of why the world reads as empty
   * (issue 172).  Measured over 300 walkable spots near the start, a screen
   * held 0.97 people.
   *
   * The number is the world's own.  `creature_template.detection_range` is how
   * far a creature notices you and the slice's largest is **twenty yards**, so
   * a screen narrower than forty across its short side is a screen things
   * reach you from outside of.  *You should be able to see whatever can see
   * you* is a rule, where "it looks nicer" is a taste.
   *
   * It is a floor and not a fixed value: a wide desktop shows more, because
   * there is no reason to crop it, and a pinch still does what a pinch does.
   *
   * **And it is read, not typed.**  This was `40` under a comment that said
   * so, and nothing read the column; `seenYards` doubles the largest
   * `notice` the bake wrote, with the same default a spawn with no row gets
   * below, and `bordercheck` holds this line to it.
   */
  const SEEN_YARDS = seenYards(spawns.npcs.map((row) =>
    spawns.moves?.[row[10] ?? -1]?.[MOVE_NOTICE] ?? 20))
  let zoom = 1
  /**
   * How far out you may pull, which **used to be a frame-rate decision and is
   * not one any more**.
   *
   * What stood here said a diamond of ground is a blit and the count goes as
   * the square of how far out you are — 0.4 was 146 yards, 7,784 tiles and 37
   * frames a second; 0.6 was 3,400 and held 60.  That was true and the floor
   * was 0.12 anyway, three times further out than the number the comment was
   * defending, so the comment was guarding a cliff nobody was standing on.
   *
   * And the cliff is gone: the plain ground is composed into plates now and
   * kept, so the tile count no longer follows the zoom.  Measured on a phone
   * viewport at six zooms from 0.5 to 0.12, **every one of them is 60 frames a
   * second**, the tile count never passes 140, and the heap and the canvas
   * cache do not move.
   *
   * **So the far limit is not about frames, and the client states what it is
   * about.**  The near limit has been derived since `SEEN_YARDS`: forty yards
   * is `creature_template.detection_range`'s own maximum, because a screen
   * narrower than that is a screen you cannot see what is coming on.  The far
   * one is `cameraDistanceMaxFactor` in the original's own options —
   * `layout.json`'s `camera.follow`, a slider from 1 to **2**: *you may pull
   * back to twice the default distance*.  A camera at twice the distance sees
   * twice the ground, and twice the ground is half the zoom.
   *
   * So the floor is **the opening framing halved**, and because the opening
   * framing is itself a function of the glass, a phone and a desktop get
   * different floors without either being typed.  Measured at every size the
   * harness lays out:
   *
   * | glass | opens | widest | across | a person |
   * |---|---|---|---|---|
   * | 390 x 844 phone | 0.406 | 0.203 | 80 yd | 13 px |
   * | 844 x 390 phone | 0.406 | 0.203 | 173 yd | 13 px |
   * | 360 x 640, `MIN_SCREEN` | 0.375 | 0.188 | 80 yd | 12 px |
   * | 1024 x 768 desktop | 0.8 | 0.4 | 107 yd | 26 px |
   *
   * Twelve pixels is the tightest of those and it is still above the type
   * floor on the same screen — 11, the client's own ladder one rung up — which
   * is what `viewcheck` and `padcheck` assert rather than a number chosen
   * here.  At the old 0.12 a person is **eight** pixels on a 293-yard screen,
   * which is a game you cannot read long before it is a game that stutters.
   */
  const MAX_FOLLOW = (layout?.camera?.follow as number | undefined) ?? 2
  const fitZoom = () => Math.min(canvas.width, canvas.height) / (PPY * SEEN_YARDS)
  /**
   * **On a phone the zoom is three steps, and a pinch moves between them.**
   *
   * A pinch froze the game, and the reason was the cache rather than the view:
   * the tinted ground atlas and everything cut from it are keyed on the zoom to
   * a hundredth, so a pinch rebuilt them on nearly every frame.  One rebuild is
   * the whole atlas at the new tile size — measured on a phone viewport with
   * the CPU slowed four times, **200 ms at 0.8, 250 at 1, 420 at 1.6 and 780 at
   * 3** — and a pinch from 0.41 to 0.2 ran at eight frames a second for eleven
   * seconds.  The atlas also grows as the square of the zoom: 12 MB decoded at
   * 0.8, 19 at 1, 29 at 1.25, 48 at 1.6 and 161 at 3, which a phone has to find
   * room for while the old one is still alive.
   *
   * The rebuild is cheap now — see `tintedGround`: the first visit to a step
   * went 1,250 ms to 150, and a real two-finger pinch across all three steps
   * went from a worst frame of 1,083 ms to 133 — and it still grows with the
   * zoom.  So a phone's zoom is a ladder a quarter apart, and the two most
   * recent atlases are kept, so a pinch that goes in and back out rebuilds
   * nothing:
   *
   *   * **0.8 at the far end**, the widest that held sixty with the CPU slowed
   *     four times — 0.7 was 56, 0.6 was 44, the old opening 0.41 was 35 and
   *     the old floor 0.2 was 20
   *   * **1.25 at the near end**, where two kept atlases are 48 MB; the next
   *     step, 1.6, is 48 MB on its own
   *   * **1 to open on**, by the owner's decision on 2026-09-15 that a phone
   *     starts closer.  It is the art's own scale — a 32-pixel tile on 32
   *     pixels — and it is sixteen yards across a 390-wide phone, which is
   *     inside the forty yards `SEEN_YARDS` asks for: on a phone that rule is
   *     given up for the frame rate and the size of a person, and the desktop
   *     still keeps it.
   */
  const PHONE_ZOOMS = [0.8, 1, 1.25]
  const PHONE_OPENS = 1
  /** Where a pinch has got to, which the phone's zoom snaps to a step of. */
  let zoomWant = 1
  const snapZoom = (z: number) => PHONE_ZOOMS.reduce((best, step) =>
    Math.abs(Math.log(step / z)) < Math.abs(Math.log(best / z)) ? step : best)
  const clampZoom = (z: number) => pad.on
    ? snapZoom(z)
    : Math.max(Math.min(1, fitZoom()) / MAX_FOLLOW, Math.min(3, z))
  /**
   * Move the zoom by a factor, the way a wheel and a pinch both do.
   *
   * Through `zoomWant` rather than from `zoom`, because on a phone `zoom` is a
   * step: multiplied by a pinch's few per cent and snapped, it would round back
   * to the step it was on and never move.  Held a little past either end so a
   * pinch that overshoots comes straight back.
   */
  const nudgeZoom = (by: number) => {
    // A door crossed since the last frame is framed before the wheel moves
    // anything, or the framing would take the wheel's zoom for the outside's.
    framing()
    const lo = pad.on ? PHONE_ZOOMS[0]! / 1.12 : clampZoom(0)
    const hi = pad.on ? PHONE_ZOOMS[PHONE_ZOOMS.length - 1]! * 1.12 : clampZoom(99)
    zoomWant = Math.max(lo, Math.min(hi, zoomWant * by))
    zoom = clampZoom(zoomWant)
    zoomIsMine = true
  }
  addEventListener('wheel', (e) => {
    nudgeZoom(1 - Math.sign(e.deltaY) * 0.12)
  }, { passive: true })


  /**
   * Whether the player has taken the zoom over, so a resize does not take it
   * back.  A pinch or a wheel is a decision and a rotated phone is not.
   */
  let zoomIsMine = false
  /** Whether the zoom was last laid out for a phone — see the frame. */
  let zoomedAsPhone = false
  /**
   * How big a mark on the glass is — a way out, a flight's up or down: one
   * line of the smallest type the page sets, which is the help line's.  A mark
   * you cannot read at the size of the words beside it is not a mark.  Read
   * off the stylesheet in `resize`, and declared up here because `resize` runs
   * before the room code below it exists.
   */
  let markPx = 18
  /** The interface's own light, which a way out is drawn in. */
  let markInk = '#f0e6d2'
  /**
   * Which room and storey the zoom was last framed for — see `framing` — and
   * the zoom the player had outside, kept to be given back at the door.
   * Declared up here with the zoom because `resize` reads them.
   */
  let framedB: Built | null = null
  let framedStorey = -1
  let outdoorZoom: { zoom: number; want: number; mine: boolean } | null = null
  /**
   * The storey framed: where a man can stand on it in the world, the zoom at
   * which that fits beside the interface, and whether it did.
   */
  let roomView: { x0: number; x1: number; y0: number; y1: number; cells: number
    limit: number; fits: boolean; zoom: number } | null = null

  function resize() {
    canvas.width = Math.floor(innerWidth)
    canvas.height = Math.floor(innerHeight)
    ctx.imageSmoothingEnabled = false
    const help = document.getElementById('help')
    if (help) {
      const line = parseFloat(getComputedStyle(help).lineHeight)
      if (line > 0) markPx = line
      markInk = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || markInk
    }
    // Pull out far enough to see forty yards across the short side — see
    // `SEEN_YARDS`.  Never *in*: a wide screen shows what it has room for.
    if (!zoomIsMine) {
      // Indoors the screen wants the room, which is framed afresh for the
      // new glass — a phone turned on its side in a cottage.
      if (framedB) frameRoom()
      else {
        zoom = pad.on ? PHONE_OPENS : Math.min(1, clampZoom(fitZoom()))
        zoomWant = zoom
      }
    }
  }
  addEventListener('resize', resize)
  resize()

  // World to screen.  The client's +x is north and +y is west; on screen north
  // is up and west is left, so both axes flip.
  let camX = hero.x, camY = hero.y
  /** How far above the hero the camera sits, in yards.  See the frame loop. */
  let lift = 0
  /** And the same, across — see `panelR`. */
  let slide_ = 0
  /**
   * World to screen, flat.
   *
   * **The quarter view is gone**, and this docstring described it for weeks
   * after the code stopped doing it — a wrong explanation directly over the
   * function it explains, in the one place `CLAUDE.md` says is allowed to know
   * how the camera works.  What it used to say: north left towards the top
   * right of the glass and west towards the top left, a square of ground came
   * out a diamond, and the vertical was halved to the 2:1 every isometric
   * tileset is drawn to.
   *
   * What it does: the world's **+x is north and goes straight up the glass**,
   * its **+y is west and goes straight left**, and a yard is `PPY` pixels
   * either way round.  Each screen axis therefore depends on exactly one world
   * axis, which is why the parameters the other one takes are unused — they
   * are kept so that every caller passes a whole position and nobody has to
   * remember which half of it matters here.
   *
   * The art decided it.  LPC's people are drawn facing up, down, left and
   * right *on the screen*, so in a quarter view none of the world's four
   * directions was any of theirs and `facing()` had to guess from screen-space
   * velocity and be forty-five degrees out half the time.  Flat, `facing()`
   * takes the world velocity straight.
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
  /**
   * The edge between two grounds, which eighteen fills could not draw.
   *
   * Every ground piece in this repository was a 32-pixel fill, so two grounds
   * meeting had nothing to meet with: a riverbank, a roadside, the lip of a
   * village's paving all came out as a staircase of 1.33-yard squares, and
   * the tile size was blamed for it.  The tile size is not the reason.  There
   * was no such thing as an edge.
   *
   * These sheets are drawn for corner autotiling — a 3x3 outer ring, four
   * inner corners, fills — which is sixteen pieces for the sixteen ways four
   * corners can be one ground or the other.  So the tile is chosen by its
   * four **corners** rather than by its middle, and the boundary lands on
   * half-tile lines without the paint mask gaining a single byte.
   *
   * Named for the side the material fades out on: `n` is transparent along
   * the top, so it is the piece to use when the material is *below*.
   */
  const RING: Record<string, string> = {
    grass: 't_grass', road: 't_road', paved: 't_paved',
    // A ploughed field ends in bare earth, and so does a beach: both take
    // the dirt set rather than going without one, because a ground with no
    // set of its own cannot draw its own edge and neither can the grass
    // beside it — grass ranks last on purpose.
    crop: 't_road', sand: 't_road',
  }
  /**
   * Which of two grounds draws the edge over the other.
   *
   * `GROUND_ORDER` is already the bake's answer to "two of them cover the
   * same texel, which wins" — most deliberate first, because somebody laid a
   * road and grass is what happens anyway.  The same order decides who owns
   * the boundary, so one set per ground is enough: nine grounds want nine
   * sets and not seventy-two pairs.
   */
  const rankOf = (mat: string) => {
    const i = (meta.ground ?? []).indexOf(mat)
    return i < 0 ? 99 : i
  }
  /**
   * Which piece for which corners.
   *
   * The key is four bits — north-west, north-east, south-west, south-east —
   * saying where the upper ground is.  `null` is "all four or none", which is
   * a fill and not an edge.
   */
  const PIECE: (string | null)[] = [
    null,   // 0000
    'ne',   // 0001  SE only: fades out to the left and the top
    'nw',   // 0010  SW only
    'n',    // 0011  the south half: fades out along the top
    'se',   // 0100  NE only
    'e',    // 0101  the east half
    null,   // 0110  two diagonal corners, which no single piece can say
    'ine',  // 0111  everything but NW
    'sw',   // 1000  NW only
    null,   // 1001  the other diagonal
    'w',    // 1010  the west half
    'inw',  // 1011  everything but NE
    's',    // 1100  the north half
    'ise',  // 1101  everything but SW
    'isw',  // 1110  everything but SE
    null,   // 1111
  ]
  /**
   * The room you are in, or `null` for the world outside.
   *
   * **A building is closed from outside.**  What stood here before was the
   * roof coming off whichever building you were standing in, which was the
   * right call at the time and is the wrong one in the end: a room seen from
   * above is not a room — the walls become lines, the ceiling and the door
   * frames and the windows are gone, and the abbey is 45 yards across so a
   * building fills half the glass with a handful of things in it.  Two open
   * bugs came straight out of that transom view and both stop existing here:
   * the inn's floor drawn as a pit, and a roof lifted off an empty field.
   *
   * Pokémon's answer, and the one 2D actually uses: the world is two kinds of
   * scene, fields and rooms, and a door is the seam.  Everything it needs was
   * already baked — the plan, the walls, the floor, the furniture, the
   * doors — and the only thing missing was the decision.
   */
  let indoors: (typeof buildings)[number] | null = null
  /**
   * Which floor of it, as an index into `indoors.floors`, or -1 for the ground.
   *
   * A separate variable and not a field on `indoors`, because thirty-two
   * places ask *which building* and two ask *which floor of it*.
   */
  let storey = -1
  /** The plan of the floor being stood on, which is the ground one by default. */
  const planNow = () =>
    (storey >= 0 ? indoors?.floors[storey] : indoors?.plan) ?? null
  /** And the one below it, whose stairs are the way back down. */
  const planUnder = () =>
    (storey > 0 ? indoors?.floors[storey - 1] : storey === 0
      ? indoors?.plan : null) ?? null
  /**
   * Whether the player is still standing in the doorway he arrived by.
   *
   * A door, not *the* door: the abbey has eight and two of them are five
   * yards apart, so remembering which one he came through sent him straight
   * back out the moment the step inside landed him on its neighbour.  What
   * matters is only that he has not yet left the threshold.
   */
  let onStep = false

  const SHADES = 21
  /**
   * The row of the tinted strip that is not tinted, or nearest to it.
   *
   * A plate is composed from this one and the hillside's light is multiplied
   * over the whole plate afterwards — so the tiles must go in unlit, or the
   * light lands twice.  `tintedGround` skips the wash where `|sl|` is under
   * 0.02, and this row is 0.025 out, which is a one per cent tint.
   */
  const FLAT_ROW = Math.round(((0 - SHADE_LO) / (SHADE_HI - SHADE_LO)) * (SHADES - 1))
  /**
   * The wash one row of the tinted strip is given, or null for the untinted.
   *
   * Out of `tintedGround`'s loop so a room — composed from the sheet rather
   * than from the atlas — is washed with the same numbers the atlas would have
   * given it.  Straight across the range, not clamped again on the way out.
   * The old mapping reached its cap two thirds of the way down and flattened
   * everything below it, which put a second black on top of the first.
   */
  /** The colour the darkest row is washed towards, and how far: row 0's wash. */
  const SHADOW = [8, 14, 26, 0.46] as const
  const washOf = (row: number) => {
    const sl = SHADE_LO + (row / (SHADES - 1)) * (SHADE_HI - SHADE_LO)
    if (Math.abs(sl) <= 0.02) return null
    return sl > 0
      ? `rgba(255,247,224,${(sl / SHADE_HI) * 0.34})`
      : `rgba(${SHADOW[0]},${SHADOW[1]},${SHADOW[2]},${(sl / SHADE_LO) * SHADOW[3]})`
  }
  /**
   * Which rows of the tinted strip an indoor scene actually used last frame.
   *
   * A room is lit flat on purpose — 실내 바닥 6절 asks for three steps at most
   * and it uses one — and this is that promise as an observation rather than
   * as a constant somebody can read back out of the source.
   */
  const indoorRows = new Set<number>()
  /**
   * How many tiles square a plate of plain ground is, and what the whole cache
   * may weigh.
   *
   * About five hundred pixels a side, **whatever the zoom**, and that is the
   * whole of why it is a number of pixels rather than a number of tiles.  A
   * plate of sixteen tiles is 528 pixels at 1:1 and 1,040 at 2:1, which is
   * four megabytes each — two of those fill the budget, the cache thrashes,
   * and the closest zoom went from sixty frames to thirty-eight.  Held near a
   * constant size the count follows the glass instead of the zoom.
   *
   * Twelve megabytes because that is a little over twice a 1200 x 760 screen's
   * own pixels, which is what a cache of exactly what is on the glass comes to
   * — and the issue that asked for this budgeted 8.7.  `viewcheck` holds it.
   */
  const PLATE_PX = 512
  const PLATE_BUDGET = 12 * 1024 * 1024
  type Plate = { c: HTMLCanvasElement; used: number; bytes: number; fresh: boolean; tile: number }
  const plates = new Map<string, Plate>()
  /**
   * A tile's width in the last plate composed and the world's at that zoom,
   * and how many milliseconds of work the plate was in all.
   */
  const plateLaid = { tile: 0, world: 0, picture: 0, ms: 0 }
  /**
   * The one plate being composed, a slice at a time — see `COMPOSE_MS`.
   */
  let platePending: { key: string; pi: number; pj: number; ms: number;
    run: Generator<void, Plate | null, void> } | null = null
  /**
   * How long composing plates may take out of one frame.
   *
   * A plate was composed whole in one frame, and one a frame kept sixty while
   * a plate was a millisecond of blits.  Blended, it is a layer a ground, and
   * laying a layer on the plate makes the canvas raster everything drawn into
   * it — measured, 2.5 milliseconds a layer, six grounds a plate at zoom 1.2,
   * **twenty milliseconds a plate** and thirty-two frames a second while a
   * cold view filled.  The cost does not shrink by being moved, so it is
   * spread instead: a plate is a generator that stops after each layer, and
   * each frame runs it until this much of the frame is gone.  The view takes
   * a few more frames to fill and loose tiles stand in meanwhile, as they did.
   */
  const COMPOSE_MS = 4
  let plateBytes = 0
  let plateKey = ''
  let platesDrawn = 0
  /**
   * Scratch for laying one ground over another inside a plate: the ground is
   * drawn here, cut by its share of each spot, and laid on the plate.  Kept
   * rather than made a plate, because a canvas a plate wide is a quarter of a
   * million pixels to allocate.
   */
  const splatLayer = document.createElement('canvas')
  const splatShare = document.createElement('canvas')
  /**
   * **A canvas that is dropped is sized to nothing first.**
   *
   * Dropping the last reference leaves its pixels to the collector, and a
   * phone's browser collects canvases late and caps what they may hold all
   * together — iOS Safari at a few hundred megabytes.  Counted with nothing
   * collected, zooming held 29 MB after load, 156 after five zoom steps and
   * 449 after twenty: every step makes a new ground atlas of 20 to 30 MB and a
   * screenful of plates, and the old ones waited.  Past the cap `getContext`
   * answers null, the frame throws, and the game stops — which is what a phone
   * saw as "zooming freezes it".  A canvas of nought by nought holds nothing
   * whether or not anybody has collected it yet.
   */
  const releaseCanvas = (c: HTMLCanvasElement | null | undefined) => {
    if (c) { c.width = 0; c.height = 0 }
  }
  /** The plate being composed, so a plate abandoned half-way is released too. */
  let composing: HTMLCanvasElement | null = null
  /**
   * What the blends inside a plate actually came out as, read back off the
   * layer's own pixels.  Only while a check asks — reading a plate back is a
   * `getImageData` of a quarter of a million pixels a ground.
   */
  const splatProbe = { on: false, edges: 0, within: 0, shore: 0, shoreWithin: 0 }
  /**
   * The order a plate lays its grounds in — the same everywhere.
   *
   * A ground goes on at its share of what is down so far, and that is the
   * same number on both sides of a seam only if both plates lay the grounds
   * in the same order.  Sorted plate by plate by how much of the plate each
   * one had, the hills came out as rectangles a plate wide with a straight
   * line between them.
   */
  const LAYING = ['rock', 'ash', 'sand', 'grass', 'crop', 'road', 'paved', 'shore', 'water']
  /**
   * How deep water has to be to look its deepest, in yards.
   *
   * Over the slice's 19,953 wet cells the depth runs nought at the tenth
   * percentile, 2.5 at the median, 8.5 at the ninetieth and 34 at the most, so
   * twelve puts nearly all the forest's water on the ramp and lets the lake be
   * the lake.
   */
  const DEEP_YARDS = 12
  /** Water tiles laid loose in the last frame, and tiles of water composed into plates ever. */
  let waterTilesDrawn = 0
  /** Crossings laid on the glass in the last frame, each one piece. */
  let decksDrawn = 0
  /** Front doors drawn on the roofs in the last frame. */
  let frontsDrawn = 0
  let wateredEver = 0
  /** Thrown away when the zoom changes, because the tinted strip is. */
  /** Roof pictures cut from the tinted atlas — see `roofPattern`. */
  /**
   * The roof kit's own cell names — `_k<column><row>` over a five by six
   * block.  Written once because three places need them: the atlas that has
   * to tint them, the draw that blits them, and the check that asks whether
   * they all arrived.
   */
  const KIT_COLS = 5, KIT_ROWS = 6
  const KIT_CELLS = Array.from({ length: KIT_COLS * KIT_ROWS }, (_, n) =>
    `_k${n % KIT_COLS}${Math.floor(n / KIT_COLS)}`)
  const patterns = new Map<string, CanvasPattern | null>()
  /**
   * A whole roof, composed once and kept — see the kit pass.
   *
   * Keyed on the **shape** and not on the placement, so the thirteen farms in
   * this world are one canvas.  Thrown away with the plates, because both are
   * cut from the tinted atlas and the atlas is rebuilt whenever the zoom
   * changes.
   */
  const sheets = new Map<string, HTMLCanvasElement>()
  let sheetBytes = 0
  /** One flat colour a roof word, for the fringe the kit does not reach. */
  const inks = new Map<string, string>()
  const forgetPlates = () => {
    for (const v of plates.values()) releaseCanvas(v.c)
    plates.clear()
    plateBytes = 0
    platePending = null
    releaseCanvas(composing)
    composing = null
    for (const c of sheets.values()) releaseCanvas(c)
    // The roof patterns are cut from the same tinted atlas, so they go with
    // it: a pattern is a *copy*, and a copy of an atlas that no longer exists
    // is a roof drawn at the last zoom's size.
    patterns.clear()
    inks.clear()
    sheets.clear()
    sheetBytes = 0
  }
  type Baked = {
    /**
     * `px` is how big a tile is drawn on the glass at this zoom; `cell` is how
     * big it is stored in the atlas, which is never more than `ATLAS_CELL`.
     * Every read of the atlas cuts `cell` and draws `px`.
     */
    key: number; px: number; cell: number; c: HTMLCanvasElement
    /** Where a picture's column starts, and where its band of shades does. */
    at: Record<string, number>; top: Record<string, number>
  }
  /**
   * **No side of the atlas is longer than 4,096 pixels.**
   *
   * It was one strip, every picture side by side and a row per shade under
   * them, so its width was the picture count times the tile: 7,029 at zoom 1
   * and 8,733 at 1.25.  An iPhone puts a canvas on the GPU as a texture, and a
   * texture side past 8,192 is more than it has — so on a phone the game opened
   * at 1 and the first pinch in to 1.25 closed it.  Every other canvas here is
   * under 2,048 on a side at every step.  The atlas is folded into bands now,
   * as many pictures across as 4,096 holds, which is also the side of the
   * 16.7-megapixel area iOS allows one canvas.  At a desktop's zoom 3 the bands
   * run taller than that; a phone never gets past 1.25.
   */
  const ATLAS_SIDE = 4096
  /**
   * **And no tile in it is stored bigger than it is drawn at zoom 1.**
   *
   * The pictures are 32 pixels.  The atlas was built at the tile's size on the
   * glass, so at a desktop's zoom 3 every one of them was stored three times
   * over — a 4,074 by 12,222 canvas, 137 MB, and two kept: 275 of the 295 MB
   * of canvas the game held there, with not a pixel of detail the 32-pixel
   * picture does not have.  Pixel art scaled with smoothing off is the same
   * picture whether it is scaled into the atlas or out of it, so above zoom 1
   * the atlas stays at zoom 1's size and the scaling happens at the draw.  A
   * phone's 1.25 shares zoom 1's atlas, which is also a pinch between those two
   * steps that builds nothing.
   */
  const ATLAS_CELL = TILE + 1
  let baked: Baked | null = null
  /**
   * The atlas before this one, kept.  A pinch in and back out on a phone
   * returns to the step it came from, and rebuilding that is the freeze.
   */
  let bakedBefore: Baked | null = null
  /**
   * When the zoom last moved, so the atlas before this one can go once it has
   * stood still.  It is kept for a pinch that comes back to where it started,
   * and a phone that is not being pinched was holding it for nothing: 30 MB of
   * the 71 MB of canvas a phone held standing at one step.
   */
  let zoomSeen = 0, zoomMoved = 0
  const ATLAS_SPARE_MS = 3000
  function tintedGround() {
    const px = Math.ceil(TILE * zoom) + 1
    // Keyed on what is stored, not on the zoom: every zoom over 1 is the same
    // atlas.  `px` is the caller's and is put on whichever atlas answers.
    const cell = Math.min(px, ATLAS_CELL)
    const key = cell
    if (baked && baked.key === key) { baked.px = px; return baked }
    if (bakedBefore && bakedBefore.key === key) {
      ;[baked, bakedBefore] = [bakedBefore, baked]
      baked.px = px
      return baked
    }
    // The one before the one before goes, and its pixels with it.
    if (bakedBefore) releaseCanvas(bakedBefore.c)
    bakedBefore = baked
    const edges = [...Object.values(RING), 't_shore'].flatMap((pre) =>
      ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se', 'inw', 'ine', 'isw', 'ise']
        .map((q) => `${pre}_${q}`))
    const ids = [...new Set([...GROUND_TILES, ...BLOOM_TILES, ...WATER_TILES,
      ...PAVED_TILES, ...DIRT_TILES, WALL_TILE, ROOF_TILE, FLOOR_TILE,
      // Every roof a kind can wear, out of the table rather than by name: a
      // list here and a table there is two lists, and the day they parted the
      // abbey came out as ninety yards of nothing at all — `drawImage` with an
      // undefined source draws no pixels and reports no error.
      ...Object.values(ROOF_OF),
      // And the kit each of them comes with — five across and six along,
      // taken from the same table for the same reason.  Derived and not
      // listed: the day a kind gets a new roof word its thirty pieces come
      // with it, and `drawImage` with an undefined source draws no pixels and
      // reports no error, which is how the abbey once came out as ninety
      // yards of nothing at all.
      ...Object.values(ROOF_OF).flatMap((w) => KIT_CELLS.map((k) => `${w}${k}`)),
      ROCK_TILE, DIRT_TILE, SHORE_TILE, 'bridge', 'bridge_b', 'stone',
      // Indoors, which is its own scene and its own set.
      'in_floor', 'in_floor2', 'in_wall',
      'in_house', 'in_house2', 'in_tower', 'in_tower2',
      ...edges]
      .filter((k) => k && tilesMeta[k]) as string[])]
    // **Drawn once and copied, not drawn twenty-one times.**  Every row of the
    // strip is the same pictures under a different wash, and it was built a
    // picture at a time for every row — a scaled `drawImage` and a `fillRect`
    // per tile per shade, twenty thousand calls, which is what made a phone
    // stall for a fifth of a second every time the zoom moved.  Now the
    // pictures are laid once into the first row, each row is that row copied,
    // and the wash is two fills a row: one across the whole tiles and one,
    // `source-atop`, across the edge pieces — which are kept together at the
    // end of the strip so that one fill over all of them is the same as one
    // fill per piece, landing on the piece and not on its hole.
    const order = [...ids.filter((id) => !id.startsWith('t_')),
      ...ids.filter((id) => id.startsWith('t_'))]
    const pieces = order.findIndex((id) => id.startsWith('t_'))
    const split = pieces < 0 ? order.length : pieces
    const across = Math.max(1, Math.floor(ATLAS_SIDE / cell))
    const bands = Math.ceil(order.length / across)
    const c = document.createElement('canvas')
    c.width = cell * Math.min(order.length, across)
    c.height = cell * SHADES * bands
    const g = c.getContext('2d')!
    g.imageSmoothingEnabled = false
    const at: Record<string, number> = {}
    const top: Record<string, number> = {}
    // Into a strip of its own and copied from there.  Copied from the atlas's
    // own first row into its other rows, a canvas drawn on to itself took the
    // slow path — the whole canvas snapshotted for every row — and the first
    // visit to 1.25 still cost a second with the CPU slowed four times.
    const row = document.createElement('canvas')
    row.width = c.width
    row.height = cell
    const rg = row.getContext('2d')!
    rg.imageSmoothingEnabled = false
    for (let band = 0; band < bands; band++) {
      const from = band * across
      const to = Math.min(order.length, from + across)
      const y0 = band * SHADES * cell
      rg.clearRect(0, 0, row.width, row.height)
      for (let i = from; i < to; i++) {
        const id = order[i]!
        at[id] = (i - from) * cell
        top[id] = y0
        const p = tilesMeta[id]!
        rg.drawImage(tilesImg, p.x, p.y, p.w, p.h, (i - from) * cell, 0, cell, cell)
      }
      for (let j = 0; j < SHADES; j++) g.drawImage(row, 0, y0 + j * cell)
      // What of this band is whole tiles and what is edge pieces: the pieces
      // are at the end of the order, so a band is whole tiles, pieces, or
      // whole tiles and then pieces.
      const wholeTo = Math.max(from, Math.min(split, to))
      for (let j = 0; j < SHADES; j++) {
        const wash = washOf(j)
        if (!wash) continue
        g.fillStyle = wash
        // A fill is a full square and on a whole tile that never mattered; an
        // edge piece is mostly hole, and tinting the hole paints a grey square
        // around every boundary in the world — so over the pieces, only where
        // the piece is.
        if (wholeTo > from) g.fillRect(0, y0 + j * cell, (wholeTo - from) * cell, cell)
        if (to > wholeTo) {
          g.globalCompositeOperation = 'source-atop'
          g.fillRect((wholeTo - from) * cell, y0 + j * cell, (to - wholeTo) * cell, cell)
          g.globalCompositeOperation = 'source-over'
        }
      }
    }
    releaseCanvas(row)
    baked = { key, px, cell, c, at, top }
    return baked
  }

  /**
   * One tile of the atlas, at one shade, as a repeating pattern.
   *
   * A building is filled in its own axes now (issue 216) and a fill wants a
   * pattern, not a blit.  Kept because `createPattern` copies the source: one
   * per roof word per shade per zoom, which over the six roofs this world has
   * is a handful of 32-pixel squares.
   *
   * The pattern is scaled to **one plan cell**, not to one pixel, because the
   * transform the fill runs under is in cell units — so the roof lands one
   * picture to a 1.33 yard square exactly as the tile pass laid it, and turns
   * with the building instead of with the world.
   */
  /**
   * A whole roof for one box shape, composed out of the kit and kept.
   *
   * The roofs pack ships ten colours, each a **five by six block laid out as
   * one gabled roof** — and `roofs.png` had never been opened here: only the
   * pack's preview had, for the one flat square cut out of it.  The comment
   * beside that cut said the rest of the sheet "is a slope in perspective, and
   * a slope tiled over a footprint reads as a hillside with bricks on it",
   * which was true while a roof was stamped on the *world* grid with no
   * structure in it.  A roof seen from above at an angle **is** a slope in
   * perspective; what was missing was the ridge.
   *
   * **Three columns of the five and two rows of the six**, and what is dropped
   * is the whole lesson.  The block is one house at one size, not a nine-slice
   * — only the middle columns and rows honestly tile.  The outer column is a
   * *corner*, a dark diagonal with roof below it, and laid down a fourteen-cell
   * edge it chains into a staircase across the roof; row 0 is a gable with a
   * **dormer** either side of the ridge, and laid along the same edge it puts
   * six dormers in a row.  Both of those were drawn and looked at before they
   * were dropped.  What is left is the part that tiles: the light slope, the
   * ridge, the dark slope, and the two caps that close the ridge at its ends.
   * The silhouette is not this kit's job — the outline and its own dark stroke
   * already say where the building stops, to the yard, at whatever angle.
   *
   * The ridge runs along the box's longer side, which is what `swap` picks.
   */
  const roofSheet = (id: string, step: number, px: number,
    n: number, m: number, swap: boolean) => {
    const key = `${id}:${step}:${px}:${n}x${m}:${swap ? 1 : 0}`
    const got = sheets.get(key)
    if (got) return got
    const bytes = n * px * m * px * 4
    // A roof bigger than this is a compound rather than a building — see
    // `roofedBoxes`, which already refuses one over sixty yards — and the cap
    // is here as well so a widened slice cannot quietly spend the budget.
    if (bytes > 8 * 1048576) return null
    while (sheetBytes + bytes > 16 * 1048576 && sheets.size) {
      const oldest = sheets.keys().next().value as string
      const c = sheets.get(oldest)!
      sheetBytes -= c.width * c.height * 4
      sheets.delete(oldest)
      releaseCanvas(c)
    }
    const ground = tintedGround()
    const c = document.createElement('canvas')
    c.width = n * px; c.height = m * px
    const g = c.getContext('2d')!
    g.imageSmoothingEnabled = false
    const across = swap ? m : n
    const along = swap ? n : m
    const mid = Math.floor((across - 1) / 2)
    const col = (i: number) => i === mid ? 2 : i < mid ? 1 : 3
    const row = (j: number, i: number) => i !== mid ? 3
      : j === 0 ? 1 : j === along - 1 ? 4 : 3
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        const ci = swap ? col(j) : col(i)
        const cj = swap ? row(i, j) : row(j, i)
        const cell = `${id}${KIT_CELLS[ci + cj * KIT_COLS]}`
        const at = ground.at[cell]
        if (at === undefined) continue
        g.drawImage(ground.c, at, ground.top[cell]! + step * ground.cell,
          ground.cell, ground.cell, i * px, j * px, px, px)
      }
    }
    sheets.set(key, c)
    sheetBytes += bytes
    return c
  }

  /** Which row of the tinted atlas a light value lands on. */
  const shadeRow = (sl: number) => Math.max(0, Math.min(SHADES - 1, Math.round(
    ((sl - SHADE_LO) / (SHADE_HI - SHADE_LO)) * (SHADES - 1))))
  const roofPattern = (id: string, sl: number, px: number) => {
    const step = shadeRow(sl)
    const key = `${id}:${step}:${px}`
    const got = patterns.get(key)
    if (got !== undefined) return got
    const ground = tintedGround()
    const at = ground.at[id]
    let pat: CanvasPattern | null = null
    if (at !== undefined) {
      const c = document.createElement('canvas')
      c.width = px; c.height = px
      const g = c.getContext('2d')!
      g.imageSmoothingEnabled = false
      g.drawImage(ground.c, at, ground.top[id]! + step * ground.cell,
        ground.cell, ground.cell, 0, 0, px, px)
      pat = ctx.createPattern(c, 'repeat')
      pat?.setTransform(new DOMMatrix().scaleSelf(1 / px))
      // And the same square as one colour, for the parts of a footprint the
      // kit does not reach.  **A pattern fill over a whole outline is not
      // free**: sampling a repeating source under a turned transform took
      // Goldshire from sixty frames to thirty-nine, and what it buys there is
      // a texture nobody sees, because the roof itself is drawn over the top
      // of it a moment later.  A flat fill under the roof says *there is
      // building here* for the yard or two of fringe that shows.
      const d = g.getImageData(0, 0, px, px).data
      let r = 0, gr = 0, bl = 0, n = 0
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue
        r += d[i]; gr += d[i + 1]; bl += d[i + 2]; n++
      }
      if (n) {
        inks.set(key, `rgb(${Math.round(r / n)},${Math.round(gr / n)},`
          + `${Math.round(bl / n)})`)
      }
      // The pattern holds its own copy of the square, so the square goes.
      releaseCanvas(c)
    }
    patterns.set(key, pat)
    return pat
  }
  const roofInk = (id: string, sl: number, px: number) => {
    roofPattern(id, sl, px)
    return inks.get(`${id}:${shadeRow(sl)}:${px}`)
  }

  /**
   * The row of the tinted strip a room is lit at.
   *
   * The middle one, which is what `drawRoom` has always drawn a room from — a
   * room has no hillside and no sun in it.  Named because a room is composed
   * straight from the sheet now and has to be washed the way that row is.
   */
  const ROOM_ROW = (SHADES - 1) >> 1
  /**
   * A room, composed once in the building's own axes, and kept.
   *
   * **The roof's lesson, one storey down.**  A room was laid one plan cell to
   * one tile of the *world* at a time, and the world's grid is not the
   * building's: 41 of this world's 43 buildings stand at an angle it cannot
   * hold, so every wall of every room came out as a staircase — the exact
   * thing issue 216 took off the roofs.  In the model's own space a wall *is*
   * straight, so the room is laid there, one picture a cell into a canvas of
   * its own, and the frame turns the whole canvas at once under the transform
   * the roofs use.
   *
   * Three things about it are the roofs' costs again, and all three are
   * *doing per frame what could be done once*.  It is **composed once a
   * storey** and not a frame: a turned `drawImage` costs its destination, and
   * laying a few thousand of them a frame is the fifteen frames a second the
   * roof kit measured.  It is **composed from the sheet at the picture's own
   * size, not from the tinted atlas**, because the atlas is rebuilt whenever the
   * zoom moves and a room keyed on it would be thrown away by every pinch.  And
   * it is **keyed on the plan**, which is one storey of one placement, so going
   * up a flight and back down composes nothing.
   */
  type Room = {
    c: HTMLCanvasElement; S: number; bytes: number; ms: number
    /** What was laid, as `part:tile` cells — what `roomPaint` is filled from. */
    tally: Map<string, number>
    /** The line where standing room meets wall or nothing, and meets a speck. */
    walls: Path2D; specks: Path2D
    /** Cell sides on each kind of edge, and the segments they were merged into. */
    edges: { interior: number; outline: number; speck: number; runs: number }
    /** Each room region's size and every picture laid on it, for the checks. */
    regions: { cells: number; pictures: string[] }[]
    /**
     * Each flight: how many cells, whether its treads were turned, how many
     * of its cells lead up, down or both, and where its up and down marks go
     * in plan cells.
     */
    flights: { cells: number; turned: boolean; up: number; down: number; both: number
      /**
       * Where each mark goes and which way it points, in plan cells: an up
       * mark towards the top of the treads it stands on, a down mark towards
       * their foot, or `null` where nothing says which end is the top.
       */
      marks: { what: 'up' | 'down'; at: [number, number]; dir: [number, number] | null }[]
      /** What said which way it climbs — see `aimFlights`. */
      rule: 'heights' | 'both ways' | 'shape'
      /**
       * From the middle of the cells that lead only down to the middle of
       * those that lead only up, in cells, on a flight that has both.
       */
      ways: [number, number] | null
      /** The plane through each part's tread heights, as `slopeOf` fits it. */
      tops: { up: Slope | null; down: Slope | null } }[]
    /**
     * The longest straight run of the outline where the room's wall or
     * nothing meets the outside, in cells — a side with no stroke on it, so a
     * check reading it off the glass is reading the picture — and one cell of
     * stone, so the wall's tone can be read back out of the canvas.
     */
    outline: { across: number; a: number; q0: number; q1: number } | null
    wallCell: [number, number] | null
    /**
     * Where each cell laid as outdoor ground is, in the world, x then y — the
     * yard under the sky.  A count cannot say whether a patch of grass is under
     * a storey of the same building, which is what a stairwell read as open sky
     * looks like; a position can.
     */
    ground: Float32Array
    /**
     * The ways out of this storey that the bake names, in plan cells: every
     * front door and every doorway between two rooms, with which way is out
     * for a front door and which way the wall runs for a doorway.
     */
    exits: RoomExit[]
    /**
     * What the room is where nothing is marked: the wall's tone and each
     * floor picture's, read back out of the canvas after the wash and before
     * a door was laid, so a check can ask whether a door differs from them.
     */
    tones: number[][]
    /**
     * The shade along the walls: how long laying it took and how many cells of
     * what cannot be stood on border standing room — see `shadeRoom`.
     */
    shade: { ms: number; band: number }
    /** Which room region each cell is in, or -1 — for the check on the shade. */
    region: Int32Array
  }
  /**
   * One way out.  `at` is the door in plan cells, `along` a unit vector in
   * cells — out through a front door, across the opening of a doorway —
   * and `half` half the opening, in yards.
   */
  type RoomExit = { kind: 'front' | 'between'; x: number; y: number
    at: [number, number]; along: [number, number]; half: number }
  const roomCache = new Map<Plan, Room>()
  let roomBytes = 0
  /**
   * How many rooms were composed and how many frames found theirs kept, since
   * the page opened — so a check can say that what is composed once is not
   * being composed every frame, which a picture cannot.
   */
  let roomComposed = 0, roomHits = 0
  /**
   * The most one room may weigh: a roof sheet's own cap, because a room and a
   * roof are the same kind of thing — a building composed into a canvas — and
   * the argument for the cap is the same phone.
   */
  const ROOM_BYTES = 8 * 1048576
  /**
   * Pixels a plan cell is composed at: the picture's own 32, or fewer for a
   * plan too big to hold at that.  The abbey's ground floor is 70 cells square
   * and comes to 20; the gold mine, 143 by 65, to 13.
   */
  const roomScale = (p: Plan) => Math.max(4,
    Math.min(TILE, Math.floor(Math.sqrt(ROOM_BYTES / 4 / (p.w * p.h)))))
  const roomWeight = (p: Plan) => roomScale(p) ** 2 * p.w * p.h * 4
  /**
   * How many rooms may be kept, as bytes: **every storey of the heaviest
   * building**, worked out from the buildings rather than typed.  Climbing is
   * the one thing that must never compose twice, and a budget smaller than a
   * building's own storeys would evict the floor you are about to walk back
   * down to.
   */
  let roomBudget = 0
  const roomOf = (b: Built, p: Plan, under: Plan | null): Room => {
    const had = roomCache.get(p)
    if (had) {
      roomHits++
      // Most recently used goes to the back, so eviction takes the oldest.
      roomCache.delete(p)
      roomCache.set(p, had)
      return had
    }
    if (!roomBudget) {
      for (const one of [...buildings, ...caves]) {
        if (!one.plan) continue
        const all = [one.plan, ...(one.floors ?? [])]
        roomBudget = Math.max(roomBudget, all.reduce((n, q) => n + roomWeight(q), 0))
      }
    }
    const made = composeRoom(b, p, under)
    while (roomBytes + made.bytes > roomBudget && roomCache.size) {
      const oldest = roomCache.keys().next().value as Plan
      const gone = roomCache.get(oldest)!
      roomBytes -= gone.bytes
      roomCache.delete(oldest)
      releaseCanvas(gone.c)
    }
    roomCache.set(p, made)
    roomBytes += made.bytes
    return made
  }

  /**
   * A storey's cells sorted by what a man can do with them, and the pieces of
   * what he cannot.
   *
   * `walk` is the rule a step indoors is held to — `roomOpen`'s: the floor,
   * this storey's steps, and the steps of the storey below, which are the way
   * back down and are under his feet.  `stair` is the part of that a man
   * stands on *on this storey*: a steps cell with standing room over it.
   * Everything else inside the outline is one of two things and the bake says
   * which: stone (`solid`), or nothing at all — no surface a body fits on at
   * this storey, which is a stairwell, the eaves round a wall, or the air over
   * a lower roof.
   *
   * The pieces of what he cannot stand on are labelled four-connected, with
   * their size and whether they reach the edge of the outline, because that is
   * what tells a wall from a speck: every partition in the abbey is joined to
   * its shell, and what stands free inside a room is a pillar or a pew end.
   */
  const roomPieces = (p: Plan, under: Plan | null) => {
    const W = p.w, H = p.h, N = W * H
    const inside = new Uint8Array(N)
    const walk = new Uint8Array(N)
    const stair = new Uint8Array(N)
    // Which of the two masks a steps cell came from, kept apart: this storey's
    // leads up and the one below's leads down, which is `upOrDown`'s rule and
    // what a flight has to say on the glass.
    const up = new Uint8Array(N)
    const down = new Uint8Array(N)
    for (let i = 0; i < W; i++) {
      for (let j = 0; j < H; j++) {
        const n = i * H + j
        // A cell the silhouette missed but its neighbours did not is a hole
        // in the flood fill and not a hole in the floor.  Left as it was, the
        // nave came out speckled with black.
        if (!(bitAt(p.bits, n)
          || (i > 0 && j > 0 && i < W - 1 && j < H - 1
            && bitAt(p.bits, n - H) && bitAt(p.bits, n + H)
            && bitAt(p.bits, n - 1) && bitAt(p.bits, n + 1)))) continue
        inside[n] = 1
        const goesUp = bitAt(p.steps, n)
        let goesDown = false
        if (under) {
          // The storey below has its own grid; the model's space is shared.
          const ui = Math.floor((p.x0 + (i + 0.5) * p.s - under.x0) / under.s)
          const uj = Math.floor((p.y0 + (j + 0.5) * p.s - under.y0) / under.s)
          goesDown = ui >= 0 && uj >= 0 && ui < under.w && uj < under.h
            && bitAt(under.steps, ui * under.h + uj)
        }
        const steps = goesUp || goesDown
        if (goesUp) up[n] = 1
        if (goesDown) down[n] = 1
        const floor = bitAt(p.floor, n)
        if (floor || steps) walk[n] = 1
        if (floor && steps) stair[n] = 1
      }
    }
    const piece = new Int32Array(N).fill(-1)
    const sizes: number[] = []
    const edge: boolean[] = []
    const stack: number[] = []
    for (let n0 = 0; n0 < N; n0++) {
      if (!inside[n0] || walk[n0] || piece[n0] >= 0) continue
      const id = sizes.length
      let size = 0, touches = false
      piece[n0] = id
      stack.push(n0)
      while (stack.length) {
        const m = stack.pop()!
        size++
        const i = (m / H) | 0, j = m % H
        for (let q = 0; q < 4; q++) {
          const a = q === 0 ? i - 1 : q === 1 ? i + 1 : i
          const c = q === 2 ? j - 1 : q === 3 ? j + 1 : j
          if (a < 0 || c < 0 || a >= W || c >= H) { touches = true; continue }
          const o = a * H + c
          if (!inside[o]) { touches = true; continue }
          if (walk[o] || piece[o] >= 0) continue
          piece[o] = id
          stack.push(o)
        }
      }
      sizes.push(size)
      edge.push(touches)
    }
    return { W, H, inside, walk, stair, up, down, piece, sizes, edge }
  }

  /**
   * How big a piece of what nobody can stand on has to be to be drawn as wall.
   *
   * **Drawing `solid` as wall once turned the nave into rubble**, and the
   * answer then was to draw no inside at all — the perimeter and one flagstone
   * field, so the abbey had no rooms and no corridors.  The rubble was every
   * pillar, pew end and rail stamped as a whole tile of wall on the world's
   * grid.  What separates rooms is not that: every partition in this slice is
   * joined to the building's shell, and the pieces that stand free are small.
   *
   * So the line is taken from the pieces themselves.  Every free-standing
   * piece on every storey of every building that can be walked into, and
   * every mine, has a size; the sizes are a crowd of ones and twos with a
   * tail, and the cut is where that distribution divides best in two on a log
   * scale (Otsu's criterion, between-class variance of log size).  A piece
   * that reaches the outline is wall whatever its size; one that stands free
   * is wall from the cut up, and below it gets the floor with an edge round
   * it — the footprint of something the props already draw, or a pillar,
   * which says *you cannot stand here* without saying *this is a wall*.
   *
   * Worked out once, over the whole slice, because a building alone is too
   * few pieces to divide: the cottages have one to four, and the split moves
   * from two to eight between buildings for no reason but the count.
   */
  let speckStats: { cells: number; pieces: number; below: number; above: number;
    belowCells: number; aboveCells: number; ms: number } | null = null
  const speckCut = () => {
    if (speckStats) return speckStats.cells
    const t0 = performance.now()
    const sizes: number[] = []
    for (const one of [...buildings, ...caves]) {
      if (!one.plan || !one.doors.length) continue
      const all = [one.plan, ...(one.floors ?? [])]
      all.forEach((q, s) => {
        const r = roomPieces(q, s ? all[s - 1]! : null)
        r.sizes.forEach((n, x) => { if (!r.edge[x]) sizes.push(n) })
      })
    }
    sizes.sort((u, v) => u - v)
    const logs = sizes.map((n) => Math.log2(n))
    const total = logs.reduce((u, v) => u + v, 0)
    let best = -1, cells = Infinity, sum = 0
    for (let x = 1; x < sizes.length; x++) {
      sum += logs[x - 1]!
      if (sizes[x] === sizes[x - 1]) continue
      const lo = x / sizes.length
      const between = lo * (1 - lo) * (sum / x - (total - sum) / (sizes.length - x)) ** 2
      if (between > best) { best = between; cells = sizes[x]! }
    }
    const below = sizes.filter((n) => n < cells)
    speckStats = {
      cells, pieces: sizes.length, below: below.length, above: sizes.length - below.length,
      belowCells: below.reduce((u, v) => u + v, 0),
      aboveCells: sizes.filter((n) => n >= cells).reduce((u, v) => u + v, 0),
      ms: performance.now() - t0,
    }
    return cells
  }

  /** A picture's own average colour, off the sheet — see `roomTones`. */
  const picInks = new Map<string, [number, number, number]>()
  const inkOfPicture = (id: string): [number, number, number] => {
    const had = picInks.get(id)
    if (had) return had
    const pic = tilesMeta[id]
    let ink: [number, number, number] = [60, 60, 60]
    if (pic) {
      const c = document.createElement('canvas')
      c.width = pic.w; c.height = pic.h
      const g = c.getContext('2d')!
      g.drawImage(tilesImg, pic.x, pic.y, pic.w, pic.h, 0, 0, pic.w, pic.h)
      const d = g.getImageData(0, 0, pic.w, pic.h).data
      let r = 0, gr = 0, bl = 0, n = 0
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3]! < 128) continue
        r += d[i]!; gr += d[i + 1]!; bl += d[i + 2]!; n++
      }
      if (n) ink = [r / n, gr / n, bl / n]
      releaseCanvas(c)
    }
    picInks.set(id, ink)
    return ink
  }
  /**
   * The two tones of what a man cannot stand on: stone, and nothing.
   *
   * Both out of pictures this repository already cuts and its own wash, not
   * picked.  Stone is the wall picture's own average colour — slate in a
   * building, and in a mine the unlit cut of the rock, which `bake_tiles.py`
   * says `rock_floor` is: the same rock as `stone`, dark.  Nothing is the same
   * colour under the darkest wash the atlas has, row 0, because a stairwell
   * or the eaves is somewhere with no floor at all and has to read as further
   * down than a wall.  The room's own wash goes over both afterwards, the same
   * as over its floor.
   */
  const roomTones = (k: string) => {
    const from = k === 'mine' ? 'rock_floor' : 'in_wall'
    const [r, g, bl] = inkOfPicture(from)
    const [sr, sg, sb, deep] = SHADOW
    const rgb = (u: number, v: number, w: number) =>
      `rgb(${Math.round(u)},${Math.round(v)},${Math.round(w)})`
    return {
      from,
      wall: rgb(r, g, bl),
      void: rgb(r * (1 - deep) + sr * deep, g * (1 - deep) + sg * deep, bl * (1 - deep) + sb * deep),
    }
  }

  /**
   * The room itself, into its own canvas: floor where a man can stand, stone
   * and nothing where he cannot, and the line between the two as a path.
   *
   * **The line is the structure.**  Before, a room was its perimeter and one
   * floor inside it, and the abbey read as one blue flagstone field with no
   * rooms or corridors in it: the perimeter was the only wall the scene knew,
   * because `floor` inside a cathedral is patchy by nature and `solid` drawn
   * as wall tiles was rubble.  The boundary between where a man can stand and
   * where he cannot is what a plan of a building *is*, and it is drawn as a
   * dark edge — two paths, one where the floor meets wall, the outline or
   * nothing, and a lighter one round a speck — composed once in cell units
   * and stroked each frame under the same transform, so the line stays one
   * width on the glass at every zoom instead of being resampled with the
   * picture.
   */
  /**
   * What each cell of a storey is, once, for everything that draws it: the
   * room's own canvas and the minimap's plan.
   *
   * **One rule and two pictures of it.**  The minimap used to ask the baked
   * masks for itself — `steps` straight off the plan, stone wherever `solid`
   * said — while the room asked `roomPieces` and the speck cut, so the circle
   * drew a purple stairwell and every pew end as a wall that the screen beside
   * it did not.  Both read this now.
   *
   * `kind` is the room's sort: 0 standing room, 1 a speck, 2 wall or nothing
   * inside the outline, 3 outside it.  `code` is what a picture of the plan
   * needs on top of that — which of wall and nothing, whether standing room is
   * under a roof, and whether it is a flight — as one of `CELL`.
   */
  const CELL = { off: 0, wall: 1, void: 2, floor: 3, yard: 4, speck: 5, stairs: 6 } as const
  const roomCells = (b: Built, p: Plan, under: Plan | null) => {
    const cut = speckCut()
    const r = roomPieces(p, under)
    const { W, H } = r
    const kind = new Uint8Array(W * H)
    for (let n = 0; n < W * H; n++) {
      kind[n] = !r.inside[n] ? 3 : r.walk[n] ? 0
        : r.edge[r.piece[n]!] || r.sizes[r.piece[n]!]! >= cut ? 2 : 1
    }
    // Open to the sky, which inside an outline is a courtyard.
    //
    // An outline is a silhouette, so "inside the building" and "in a room"
    // are not the same thing — the abbey's yard is inside its outline and
    // the sky is over it.  The bake was throwing away the one face that
    // says which: a ceiling is a flat surface above a man's head and it
    // was being dropped as "not near this storey".  Baked, the outline's
    // 65% that is neither stone nor standing room splits **167,238 roofed
    // and 25,433 open**.  A tent has no floor of its own and is all yard.
    const roofed = (n: number) => b.k !== 'tent' && (!p.over.length || bitAt(p.over, n))
    // The tread picture a building's flights are laid in — see `composeRoom`.
    // Without one there are no flights to draw, and a stair cell is floor.
    const stairId = b.k === 'house' && tilesMeta['in_stair_wood'] ? 'in_stair_wood'
      : tilesMeta['in_stair'] ? 'in_stair' : null
    const code = new Uint8Array(W * H)
    for (let n = 0; n < W * H; n++) {
      const k = kind[n]!
      code[n] = k === 3 ? CELL.off
        : k === 2 ? (bitAt(p.solid, n) ? CELL.wall : CELL.void)
          : stairId && r.stair[n] ? CELL.stairs
            : k === 1 ? CELL.speck
              : roofed(n) ? CELL.floor : CELL.yard
    }
    planCodes.set(p, code)
    return { r, kind, code, roofed, stairId }
  }
  /**
   * The codes of the storeys of the building you are in, kept — the minimap
   * asks every storey four times a second, and a storey it has not been
   * composed for has no room to ask.  Bytes, not canvases: a cell a byte, so
   * the abbey's ground floor, 70 cells square, is 4.9 KB.  Emptied when the
   * building changes, so it
   * holds one building and not every building ever walked into.
   */
  const planCodes = new Map<Plan, Uint8Array>()
  let planCodesFor: Built | null = null
  const codesOf = (b: Built, p: Plan, under: Plan | null) => {
    if (planCodesFor !== b) { planCodes.clear(); planCodesFor = b }
    return planCodes.get(p) ?? roomCells(b, p, under).code
  }


  /**
   * **A wall stands, so the floor beside it is in its lee.**  Seen from above
   * a room is a floor and a flat fill of wall tone, and a flat fill reads as
   * paint on the floor: nothing in the picture says the wall goes up.  What
   * says it in every top-down game that has walls is the dark the floor takes
   * next to them — the light from the open side of the room does not reach
   * the foot of a wall — so standing room is shaded by how far it is from the
   * nearest cell nobody can stand on.
   *
   * Every number in it is one this file already has.  **How far** is
   * `BODY_YARDS`, a man's height: the wall is at least that tall, since a man
   * does not fit through it, and a lee reaches out about as far as its wall is
   * high.  **How dark at the foot** is the darkest wash the atlas has, row 0's
   * — `SHADOW`, colour and share — which is what `roomTones` already calls
   * *further down than a wall*.  Between the two it falls off as the square of
   * what is left of the reach, which is a choice and is the one part that is:
   * a straight ramp drew a visible line where it met the floor.
   *
   * **A layer and not a picture**, so the promises the room already keeps are
   * kept: a region is still one floor picture, laid first, and this is
   * multiplied over it; the room is still lit flat, because *lit* is the
   * terrain's light — the strip's rows, which `indoorRows` counts — and none
   * of those is used.  What cannot be stood on is what shades: stone, nothing,
   * and the outside of the outline.  A speck does not: it is floor with a prop
   * on it, and the prop is drawn standing.
   *
   * **Composed once, at half a cell.**  The distance is sampled at every half
   * cell corner into a canvas two samples a cell across, blown up over the
   * room with smoothing on — the hillside light's own trick, one sample a
   * corner — and clipped to standing room, so a wall keeps its own tone.  It is
   * worked from the edge inwards rather than from each sample outwards: only
   * the cells that border standing room splat, which in the abbey is a tenth
   * of the storey.  The small canvas is released the moment it is laid.
   */
  let shadesLaid = 0
  function shadeRoom(g: CanvasRenderingContext2D, p: Plan, W: number, H: number, S: number,
    kind: Uint8Array): { ms: number; band: number } {
    const t0 = performance.now()
    const SUB = 2
    const reach = BODY_YARDS / p.s
    const rc = Math.ceil(reach)
    const sw = W * SUB + 1, sh = H * SUB + 1
    const near = new Float32Array(sw * sh).fill(Infinity)
    const stands = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H && kind[i * H + j]! <= 1
    let band = 0
    for (let i = -1; i <= W; i++) {
      for (let j = -1; j <= H; j++) {
        if (stands(i, j)) continue
        let edge = false
        for (let a = -1; a <= 1 && !edge; a++) {
          for (let c = -1; c <= 1; c++) if (stands(i + a, j + c)) { edge = true; break }
        }
        if (!edge) continue
        band++
        const a0 = Math.max(0, (i - rc) * SUB), a1 = Math.min(sw - 1, (i + 1 + rc) * SUB)
        const c0 = Math.max(0, (j - rc) * SUB), c1 = Math.min(sh - 1, (j + 1 + rc) * SUB)
        for (let a = a0; a <= a1; a++) {
          const x = a / SUB
          const dx = Math.max(0, i - x, x - (i + 1))
          for (let c = c0; c <= c1; c++) {
            const y = c / SUB
            const dy = Math.max(0, j - y, y - (j + 1))
            const d = dx * dx + dy * dy
            const o = a * sh + c
            if (d < near[o]!) near[o] = d
          }
        }
      }
    }
    if (!band) return { ms: performance.now() - t0, band }
    const sc = document.createElement('canvas')
    sc.width = sw
    sc.height = sh
    const sg = sc.getContext('2d')!
    const img = sg.createImageData(sw, sh)
    const [sr, sgr, sb, deep] = SHADOW
    for (let a = 0; a < sw; a++) {
      for (let c = 0; c < sh; c++) {
        const d = Math.sqrt(near[a * sh + c]!) / reach
        if (d >= 1) continue
        const o = (c * sw + a) * 4
        img.data[o] = sr; img.data[o + 1] = sgr; img.data[o + 2] = sb
        img.data[o + 3] = Math.round(255 * deep * (1 - d) * (1 - d))
      }
    }
    sg.putImageData(img, 0, 0)
    const clip = new Path2D()
    for (let i = 0; i < W; i++) {
      let from = -1
      for (let j = 0; j <= H; j++) {
        const on = j < H && stands(i, j)
        if (on && from < 0) from = j
        if (!on && from >= 0) { clip.rect(i * S, from * S, S, (j - from) * S); from = -1 }
      }
    }
    g.save()
    g.clip(clip)
    g.globalCompositeOperation = 'multiply'
    g.imageSmoothingEnabled = true
    // A sample is a corner, and a pixel's middle is where it lands on the
    // glass: half a sample up and left.
    const q = S / SUB
    g.drawImage(sc, -q / 2, -q / 2, sw * q, sh * q)
    g.restore()
    releaseCanvas(sc)
    shadesLaid++
    return { ms: performance.now() - t0, band }
  }

  /**
   * A storey's tread heights spread over its grid, in `planRise` steps (the
   * sill is byte `planRise[1]`), or -1 where `steps` is not set — see `rise` on the plan.  Made
   * when a room is composed and dropped with it: bytes, not a canvas.
   */
  const risesOf = (p: Plan) => {
    const out = new Int16Array(p.w * p.h).fill(-1)
    if (!p.rise.length) return out
    let k = 0
    for (let n = 0; n < p.w * p.h && k < p.rise.length; n++) {
      if (bitAt(p.steps, n)) out[n] = p.rise[k++]!
    }
    return out
  }
  /**
   * Which way a set of treads climbs, as a plane through their heights: the
   * unit direction uphill in plan cells, how far they rise along it over the
   * cells they cover, and how far the heights stand off the plane, in yards.
   *
   * A least-squares plane and not the two ends, because a flight's cells are
   * a patch and not a line, and one tread at a corner would swing a line
   * through its ends.  Cells in a single row have no plane; they get the line
   * along their row.
   */
  const slopeOf = (ii: number[], jj: number[], zz: number[]) => {
    const n = zz.length
    if (n < 2) return null
    const unit = meta.planRise?.[0] ?? 0
    let mi = 0, mj = 0, mz = 0
    for (let k = 0; k < n; k++) { mi += ii[k]!; mj += jj[k]!; mz += zz[k]! }
    mi /= n; mj /= n; mz /= n
    let sii = 0, sij = 0, sjj = 0, siz = 0, sjz = 0
    for (let k = 0; k < n; k++) {
      const di = ii[k]! - mi, dj = jj[k]! - mj, dz = zz[k]! - mz
      sii += di * di; sij += di * dj; sjj += dj * dj; siz += di * dz; sjz += dj * dz
    }
    let a = 0, c = 0
    const det = sii * sjj - sij * sij
    if (det > 1e-6 * (sii + sjj) ** 2) {
      a = (siz * sjj - sjz * sij) / det
      c = (sjz * sii - siz * sij) / det
    } else {
      const [u0, u1] = sii >= sjj ? [sii, sij] : [sij, sjj]
      const l = Math.hypot(u0, u1)
      if (!l) return null
      const e0 = u0 / l, e1 = u1 / l
      const stt = e0 * e0 * sii + 2 * e0 * e1 * sij + e1 * e1 * sjj
      if (!stt) return null
      const k = (e0 * siz + e1 * sjz) / stt
      a = k * e0; c = k * e1
    }
    const g = Math.hypot(a, c)
    let lo = Infinity, hi = -Infinity, ss = 0
    for (let k = 0; k < n; k++) {
      const di = ii[k]! - mi, dj = jj[k]! - mj
      if (g) {
        const t = (di * a + dj * c) / g
        if (t < lo) lo = t
        if (t > hi) hi = t
      }
      const off = zz[k]! - mz - (a * di + c * dj)
      ss += off * off
    }
    return { dir: g ? [a / g, c / g] as [number, number] : null,
      rise: g ? g * (hi - lo) * unit : 0, off: Math.sqrt(ss / n) * unit, cells: n }
  }
  type Slope = NonNullable<ReturnType<typeof slopeOf>>
  /**
   * Whether a plane through a part of a flight says which end is the top.
   *
   * It has to rise by more than the heights stand off it — twice their spread
   * — and by more than one step of the byte they were kept in, or it is a
   * landing, a spiral, or two flights crossing on one cell, and a direction
   * read out of any of those is a coin.  See `aimFlights` for what the slice
   * does with the rest.
   */
  const FLIGHT_RISE = { off: 2, steps: 2 }
  const topOf = (fit: Slope | null) =>
    fit && fit.dir && fit.rise >= FLIGHT_RISE.off * fit.off
      && fit.rise >= FLIGHT_RISE.steps * (meta.planRise?.[0] ?? Infinity) ? fit.dir : null

  /**
   * **Which way each flight goes, and which end of it is the top.**
   *
   * Up or down is `upOrDown`'s own rule: a cell of this storey's `steps` takes
   * you up, a cell of the storey below's takes you down, and a cell of both is
   * a landing where up wins.  Each flight carries an up mark on its up cells'
   * own middle and a down mark on its down cells', so a flight that does both
   * has each mark at its own end.  A landing's cells count for both.
   *
   * **Which end is the top is the treads' heights**, a byte a steps cell out
   * of the bake: a plane is fitted through the heights of each part — the up
   * cells out of this storey's mask, the down cells out of the one below's,
   * each measured from its own sill so they are never mixed — and the up mark
   * points up its slope and the down mark down its. It had been declined
   * without them: 8 of the slice's 255 flights have cells leading both ways
   * and say it outright, and the two readings tried for the rest agreed 24
   * times in 37, which is a coin.  **Where the plane does not rise clear of
   * its own spread (`topOf`) nothing is guessed**: a flight whose cells lead
   * both ways points from its down cells to its up cells, the one thing it
   * says outright, and any other keeps the triangle up or down the glass —
   * the map's word for a level, which claims no end.
   *
   * The treads are turned across the way the flight climbs when that is
   * known, and otherwise the flight is longer than it is wide.
   *
   * A mark only on a flight a body fits on — `BODY_YARDS` square — because
   * the abbey's first floor has twenty-five single cells of steps along its
   * roof's edge, and twenty-five triangles there say *stairs* where nobody
   * could climb.
   */
  function aimFlights(p: Plan, under: Plan | null, r: ReturnType<typeof roomPieces>,
    flight: Int32Array, flights: Room['flights']) {
    const { W, H } = r
    const upZ = risesOf(p), downZ = under ? risesOf(under) : null
    const acc = flights.map(() => ({ ui: 0, uj: 0, un: 0, di: 0, dj: 0, dn: 0,
      bi: 0, bj: 0, bn: 0,
      hu: [[], [], []] as number[][], hd: [[], [], []] as number[][] }))
    for (let n = 0; n < W * H; n++) {
      const at = flight[n]!
      if (at < 0) continue
      const x = acc[at]!, i = (n / H) | 0, j = n % H
      const u = r.up[n] === 1, dd = r.down[n] === 1
      if (u && dd) { x.bi += i; x.bj += j; x.bn++ }
      else if (u) { x.ui += i; x.uj += j; x.un++ }
      else if (dd) { x.di += i; x.dj += j; x.dn++ }
      if (u && upZ[n]! >= 0) { x.hu[0]!.push(i + 0.5); x.hu[1]!.push(j + 0.5); x.hu[2]!.push(upZ[n]!) }
      if (dd && under && downZ) {
        // The storey below has its own grid; the model's space is shared.
        const ui = Math.floor((p.x0 + (i + 0.5) * p.s - under.x0) / under.s)
        const uj = Math.floor((p.y0 + (j + 0.5) * p.s - under.y0) / under.s)
        const z = ui >= 0 && uj >= 0 && ui < under.w && uj < under.h ? downZ[ui * under.h + uj]! : -1
        if (z >= 0) { x.hd[0]!.push(i + 0.5); x.hd[1]!.push(j + 0.5); x.hd[2]!.push(z) }
      }
    }
    const bodyCells = (BODY_YARDS / p.s) ** 2
    const targets = flights.map((fl, at) => {
      const x = acc[at]!
      fl.up = x.un; fl.down = x.dn; fl.both = x.bn
      fl.tops = { up: slopeOf(x.hu[0]!, x.hu[1]!, x.hu[2]!), down: slopeOf(x.hd[0]!, x.hd[1]!, x.hd[2]!) }
      if (x.un && x.dn) fl.ways = [x.ui / x.un - x.di / x.dn, x.uj / x.un - x.dj / x.dn]
      let upDir = topOf(fl.tops.up)
      let downDir = topOf(fl.tops.down)
      if (downDir) downDir = [-downDir[0], -downDir[1]]
      if (upDir || downDir) {
        fl.rule = 'heights'
        const d = upDir ?? downDir!
        fl.turned = Math.abs(d[0]) > Math.abs(d[1])
      } else if (x.un && x.dn) {
        fl.rule = 'both ways'
        fl.turned = Math.abs(fl.ways![0]) > Math.abs(fl.ways![1])
      }
      if (fl.cells < bodyCells) return null
      // Up on the up cells' own middle and down on the down cells', so a
      // flight that does both has each mark at its own end.  A landing's
      // cells count for both.
      const mid = (si: number, sj: number, sn: number) => (sn ? [si / sn, sj / sn] : null)
      return {
        up: mid(x.ui + x.bi, x.uj + x.bj, x.un + x.bn),
        down: mid(x.di + x.bi, x.dj + x.bj, x.dn + x.bn),
        upDir, downDir, bestUp: Infinity, bestDown: Infinity,
      }
    })
    for (let n = 0; n < W * H; n++) {
      const at = flight[n]!
      const t = at >= 0 ? targets[at] : null
      if (!t) continue
      const i = (n / H) | 0, j = n % H, fl = flights[at]!
      // On a cell that says it, nearest the middle of the cells that say it.
      if (t.up && r.up[n] === 1) {
        const dd = (i - t.up[0]!) ** 2 + (j - t.up[1]!) ** 2
        if (dd < t.bestUp) {
          t.bestUp = dd
          fl.marks = fl.marks.filter((m) => m.what !== 'up')
          fl.marks.push({ what: 'up', at: [i + 0.5, j + 0.5], dir: t.upDir })
        }
      }
      if (t.down && r.down[n] === 1) {
        const dd = (i - t.down[0]!) ** 2 + (j - t.down[1]!) ** 2
        if (dd < t.bestDown) {
          t.bestDown = dd
          fl.marks = fl.marks.filter((m) => m.what !== 'down')
          fl.marks.push({ what: 'down', at: [i + 0.5, j + 0.5], dir: t.downDir })
        }
      }
    }
  }

  function composeRoom(b: Built, p: Plan, under: Plan | null): Room {
    const t0 = performance.now()
    roomComposed++
    if (planCodesFor !== b) { planCodes.clear(); planCodesFor = b }
    const { r, kind, code, roofed, stairId } = roomCells(b, p, under)
    const { W, H } = r
    const S = roomScale(p)
    const c = document.createElement('canvas')
    c.width = W * S
    c.height = H * S
    const g = c.getContext('2d')!
    g.imageSmoothingEnabled = false
    const tones = roomTones(b.k)
    let wallCell: [number, number] | null = null
    const grounds: number[] = []
    const tally = new Map<string, number>()
    const add = (key: string) => tally.set(key, (tally.get(key) ?? 0) + 1)
    /**
     * **One floor picture a room, not a coin tossed a cell.**  Two pictures
     * were mixed by a hash on every cell, which is a floor that shimmers:
     * nothing in it lines up with a room, and the seams between the two
     * pictures read as structure where there is none.  A room region is
     * standing room under a roof joined four ways, with the specks standing in
     * it, and the building's own pair is tossed once for the whole of it — so
     * the pair still gets used, and where it changes is a doorway or a wall.
     *
     * A mine is one picture, the lit cut of the rock.  It was the unlit one
     * with the lit one thrown in on three cells in ten, and a lit rock beside
     * an unlit one is exactly what the wall looks like — the floor read as
     * rubble.  `bake_tiles.py` cuts the two as the same rock lit and dark, so
     * the floor takes the light and the wall (`roomTones`) keeps the dark.
     */
    const floorOf = (i: number, j: number) => b.k === 'mine'
      ? (tilesMeta['stone'] ? 'stone' : ROCK_TILE)
      : (INDOOR_FLOOR[b.k] ?? INDOOR_FLOOR['hall']!)(hash(i, j))
    /**
     * **And the way up is drawn on the cells a man stands on while climbing,
     * as treads.**  It was a rug on every `steps` cell, and a `steps` cell is a
     * walkable face *between* this floor and the next: the abbey's gallery has
     * 1,299 of them, most of them the inside of its crossing tower, and the
     * storey came out a purple carpet.  What is drawn now is `stair` — a steps
     * cell, this storey's or the one below's, with standing room over it — in
     * the found tread picture: stone for a hall, a tower or a mine, timber for
     * a house.  The picture's treads run across its rows, so a flight longer
     * across the plan's first axis than its second is turned a quarter: a
     * flight is longer than it is wide — unless its own cells say which way
     * it climbs, which is below.  Which picture is `roomCells`' `stairId`,
     * because whether a cell is a flight at all depends on there being one.
     */
    const region = new Int32Array(W * H).fill(-1)
    const flight = new Int32Array(W * H).fill(-1)
    const regionsOut: { cells: number; id: string; pictures: Set<string> }[] = []
    const flights: Room['flights'] = []
    const stack: number[] = []
    const flood = (n0: number, into: Int32Array, label: number, ok: (o: number) => boolean) => {
      let cells = 0, iLo = W, iHi = -1, jLo = H, jHi = -1
      into[n0] = label
      stack.push(n0)
      while (stack.length) {
        const m = stack.pop()!
        cells++
        const i = (m / H) | 0, j = m % H
        if (i < iLo) iLo = i
        if (i > iHi) iHi = i
        if (j < jLo) jLo = j
        if (j > jHi) jHi = j
        if (i > 0 && into[m - H]! < 0 && ok(m - H)) { into[m - H] = label; stack.push(m - H) }
        if (i < W - 1 && into[m + H]! < 0 && ok(m + H)) { into[m + H] = label; stack.push(m + H) }
        if (j > 0 && into[m - 1]! < 0 && ok(m - 1)) { into[m - 1] = label; stack.push(m - 1) }
        if (j < H - 1 && into[m + 1]! < 0 && ok(m + 1)) { into[m + 1] = label; stack.push(m + 1) }
      }
      return { cells, across: iHi - iLo, along: jHi - jLo }
    }
    const inRoom = (o: number) => kind[o]! <= 1 && !(stairId && r.stair[o]) && roofed(o)
    const onFlight = (o: number) => !!stairId && r.stair[o] === 1
    for (let n = 0; n < W * H; n++) {
      if (region[n]! < 0 && inRoom(n)) {
        const got = flood(n, region, regionsOut.length, inRoom)
        regionsOut.push({ cells: got.cells, id: floorOf((n / H) | 0, n % H), pictures: new Set() })
      }
      if (flight[n]! < 0 && onFlight(n)) {
        const got = flood(n, flight, flights.length, onFlight)
        flights.push({ cells: got.cells, turned: got.across > got.along,
          up: 0, down: 0, both: 0, marks: [], rule: 'shape', ways: null, tops: { up: null, down: null } })
      }
    }
    aimFlights(p, under, r, flight, flights)
    // The tread picture a quarter turned, once, for the flights that want it.
    let turned: HTMLCanvasElement | null = null
    const stairPic = stairId ? tilesMeta[stairId] : undefined
    if (stairPic && flights.some((f) => f.turned)) {
      turned = document.createElement('canvas')
      turned.width = stairPic.h; turned.height = stairPic.w
      const tg = turned.getContext('2d')!
      tg.imageSmoothingEnabled = false
      tg.translate(stairPic.h, 0)
      tg.rotate(Math.PI / 2)
      tg.drawImage(tilesImg, stairPic.x, stairPic.y, stairPic.w, stairPic.h, 0, 0, stairPic.w, stairPic.h)
    }
    for (let i = 0; i < W; i++) {
      for (let j = 0; j < H; j++) {
        const n = i * H + j
        const cc = code[n]!
        if (cc === CELL.off) continue
        if (cc === CELL.wall || cc === CELL.void) {
          const stone = cc === CELL.wall
          g.fillStyle = stone ? tones.wall : tones.void
          g.fillRect(i * S, j * S, S, S)
          if (stone && !wallCell) wallCell = [i, j]
          // Named for the picture the tone is the colour of, so a count says
          // what the wall is made of and cannot be read as a mine's floor.
          add(stone ? `wall:${tones.from}` : `void:${tones.from}`)
          continue
        }
        if (cc === CELL.stairs && stairPic) {
          add(`stairs:${stairId}`)
          if (turned && flights[flight[n]!]!.turned) g.drawImage(turned, i * S, j * S, S, S)
          else g.drawImage(tilesImg, stairPic.x, stairPic.y, stairPic.w, stairPic.h, i * S, j * S, S, S)
          continue
        }
        let id: string
        if (region[n]! >= 0) {
          const home = regionsOut[region[n]!]!
          id = home.id
          home.pictures.add(id)
        } else {
          // What an open cell gets is the ground the client painted there,
          // asked the short way: this is a yard and not a hillside, so the
          // slope bands and the meadow blotch that the outdoor pass spends its
          // time on have nothing to say about it.  Still a picture a cell,
          // because it is ground, and ground is laid that way everywhere else.
          const [wx, wy] = fromPlan(p, b, p.x0 + (i + 0.5) * p.s, p.y0 + (j + 0.5) * p.s)
          id = paintAt(wx, wy) === 'paved' && PAVED_TILES.length
            ? PAVED_TILES[Math.floor(hash(i, j) * PAVED_TILES.length)]!
            : GROUND_TILES[Math.floor(hash(i, j) * GROUND_TILES.length)]!
          grounds.push(wx, wy)
        }
        const pic = tilesMeta[id]
        if (!pic) continue
        add(`${cc === CELL.speck ? 'speck' : region[n]! >= 0 ? 'floor' : 'open'}:${id}`)
        g.drawImage(tilesImg, pic.x, pic.y, pic.w, pic.h, i * S, j * S, S, S)
      }
    }
    releaseCanvas(turned)
    // Lit flat, at the row the tile pass used to take a room's pictures from,
    // with the same wash that row is given — over what was laid and nothing
    // else, so the dark round a room stays the dark.
    const wash = washOf(ROOM_ROW)
    if (wash) {
      g.globalCompositeOperation = 'source-atop'
      g.fillStyle = wash
      g.fillRect(0, 0, c.width, c.height)
      g.globalCompositeOperation = 'source-over'
    }
    // What the room is where nothing is marked, before anything is: the wall
    // and one cell of each floor region, off the canvas itself.
    const plain: number[][] = []
    const toneAt = (i: number, j: number) => {
      const d = g.getImageData(i * S + (S >> 1), j * S + (S >> 1), 1, 1).data
      plain.push([d[0]!, d[1]!, d[2]!])
    }
    if (wallCell) toneAt(wallCell[0], wallCell[1])
    const toned = new Set<number>()
    for (let n = 0; n < W * H && toned.size < regionsOut.length; n++) {
      const at = region[n]!
      if (at < 0 || toned.has(at) || kind[n] !== 0) continue
      toned.add(at)
      toneAt((n / H) | 0, n % H)
    }
    // After the tones, so they stay the floor where nothing is marked — the
    // middle of a room, which is what the shade is measured against — and
    // before the ways out, so a porch in daylight is not in a wall's lee.
    const shade = shadeRoom(g, p, W, H, S, kind)
    const exits = composeExits(b, p, g, S, r)
    // The edges, as runs: a cell side is on an edge when standing room is on
    // exactly one side of it, and consecutive sides of the same kind are one
    // segment — the abbey's ground floor is a few hundred segments, not the
    // thousands of cell sides they cover.
    const at = (i: number, j: number) =>
      i < 0 || j < 0 || i >= W || j >= H ? 3 : kind[i * H + j]!
    const walls = new Path2D(), specks = new Path2D()
    const edges = { interior: 0, outline: 0, speck: 0, runs: 0 }
    let outline: { across: number; a: number; q0: number; q1: number } | null = null
    const sideOf = (u: number, v: number) =>
      (u === 0) === (v === 0) ? 0 : u === 0 ? v : u
    const count = (t: number) => {
      if (t === 1) edges.speck++
      else if (t === 2) edges.interior++
      else if (t === 3) edges.outline++
    }
    for (let across = 0; across < 2; across++) {
      const outer = across ? W : H, inner = across ? H : W
      for (let a = 0; a <= outer; a++) {
        let run = 0, was = 0, shell = -1
        for (let q = 0; q <= inner; q++) {
          // Wall or nothing (2) on one side and the outside (3) on the other.
          const u = q < inner ? (across ? at(a - 1, q) : at(q, a - 1)) : 0
          const v = q < inner ? (across ? at(a, q) : at(q, a)) : 0
          const onShell = u + v === 5 && u * v === 6
          if (onShell && shell < 0) shell = q
          if (!onShell && shell >= 0) {
            if (!outline || q - shell > outline.q1 - outline.q0) {
              outline = { across, a, q0: shell, q1: q }
            }
            shell = -1
          }
          let t = 0
          if (q < inner) {
            t = across ? sideOf(at(a - 1, q), at(a, q)) : sideOf(at(q, a - 1), at(q, a))
            count(t)
          }
          const path = t === 1 ? 1 : t ? 2 : 0
          if (path === was) continue
          if (was) {
            const into = was === 1 ? specks : walls
            if (across) { into.moveTo(a, run); into.lineTo(a, q) }
            else { into.moveTo(run, a); into.lineTo(q, a) }
            edges.runs++
          }
          run = q
          was = path
        }
      }
    }
    return { c, S, bytes: c.width * c.height * 4, tally, ms: performance.now() - t0,
      walls, specks, edges, shade, region,
      regions: regionsOut.map((x) => ({ cells: x.cells, pictures: [...x.pictures] })), flights,
      outline, wallCell, ground: Float32Array.from(grounds), exits, tones: plain }
  }

  /**
   * A world point in a plan's own cells, fractional — `planCell` without the
   * floor, for things that are drawn where they are rather than in a cell.
   */
  const cellsOf = (p: Plan, b: Built, wx: number, wy: number): [number, number] => {
    const u = wx - b.x, v = -(wy - b.y)
    return [(u * p.sn + v * p.c - p.x0) / p.s, (u * p.c - v * p.sn - p.y0) / p.s]
  }
  /** And a direction on the map, which turns the same way and does not move. */
  const turnOf = (p: Plan, ux: number, uy: number): [number, number] => {
    const lx = ux * p.sn - uy * p.c, ly = ux * p.c + uy * p.sn
    const n = Math.hypot(lx, ly) || 1
    return [lx / n, ly / n]
  }

  /**
   * The ways out of a storey, laid into its room: a threshold across every
   * doorway, and at a front door the opening carried out to the open.
   *
   * **From the bake's doors and not from the plan.**  Standing room runs
   * through a doorway the same as through the middle of a room — that is why
   * the doorways fall out of the bake on their own — so a plan read for its
   * gaps finds every gap, and a gap between two pillars is not a door.  The
   * client's portals say which openings are doors (`d`), and `MOPR`/`MOGI`
   * say which of those lead outside and which way (`front_doors`).  The
   * ground storey's are `doors`, fronts and all; a storey above lays its own,
   * `upDoors`, each snapped by the bake to the storey its sill opens on — and
   * those are only ever thresholds, because an opening on a gallery is not a
   * way out of the building.  Over the slice 27 doorways on the storeys above,
   * 20 of them laid.
   *
   * **A doorway between rooms is a threshold.**  It carries no width and no
   * facing, so both come from the plan at the door: the standing room through
   * the door runs short one way — the gap in the wall, bounded by stone at
   * both ends — and long the other, which is the way through.  The
   * threshold is the found tread picture, two treads of it, across the gap:
   * a threshold *is* a step, and it is the one picture this set has of the
   * edge of a stone.  26 of the slice's 34 doorways are bounded both ends
   * inside eight cells; the rest are arches between two halls and get the
   * shorter run, whatever its length, because that is still the line
   * between the two.
   *
   * **A front door is the way out, and it is drawn going out.**  The same
   * threshold across the portal's own width, and from it the opening carried
   * out through the wall to where the outline ends — the porch `porchesOf`
   * already walks — floored with the ground the client painted outside the
   * door and framed by its jambs, the way a front door is drawn from outside.
   * Laid after the room's wash, so the ground out there is in daylight and
   * the room is not: the light is on the side that is out.
   */
  function composeExits(b: Built, p: Plan, g: CanvasRenderingContext2D, S: number,
    r: ReturnType<typeof roomPieces>): RoomExit[] {
    const out: RoomExit[] = []
    if (b.k === 'mine') return out
    // The ground storey's doors are `doors`, fronts and all; a storey above
    // has its own doorways, `upDoors`, which are never a way out.
    const upper = b.floors.findIndex((f) => f === p)
    const doors: Door[] = p === b.plan ? b.doors
      : upper >= 0 ? b.upDoors.filter((u) => u[0] === upper).map((u) => [u[1], u[2]] as Door) : []
    if (!doors.length) { exitsUnmarked.set(p, 0); return out }
    const { W, H } = r
    const px = S / p.s
    const tread = tilesMeta[b.k === 'house' && tilesMeta['in_stair_wood']
      ? 'in_stair_wood' : 'in_stair']
    // A threshold, in a frame whose x is the way through and y the gap.
    const sill = (half: number) => {
      const depth = p.s / 2
      const across = 2 * half
      if (tread) {
        const n = Math.max(1, Math.round(across / YD_PER_TILE))
        g.save()
        g.rotate(Math.PI / 2)
        for (let k = 0; k < n; k++) {
          g.drawImage(tilesImg, tread.x, tread.y, tread.w, tread.h >> 1,
            -half + (k * across) / n, -depth / 2, across / n, depth)
        }
        g.restore()
      }
      g.fillStyle = 'rgba(22, 18, 14, 0.9)'
      const line = 0.08 * YD_PER_TILE
      g.fillRect(-depth / 2 - line, -half, line, across)
      g.fillRect(depth / 2, -half, line, across)
    }
    const walkAt = (i: number, j: number) =>
      i >= 0 && j >= 0 && i < W && j < H && r.walk[i * H + j] === 1
    let unmarked = 0
    for (const door of doors) {
      const [dx, dy] = door
      const [ci, cj] = cellsOf(p, b, dx, dy)
      if (door.length === 5) {
        const [ox, oy] = turnOf(p, door[2], door[3])
        const half = Math.max(door[4] / 2, BODY_YARDS / 2)
        const porch = porchesOf(b).find((q) => q.ax === dx && q.ay === dy)
        g.setTransform(ox * px, oy * px, -oy * px, ox * px, ci * S, cj * S)
        if (porch) {
          const [wx, wy] = [dx + porch.ux * porch.len, dy + porch.uy * porch.len]
          const id = paintAt(wx, wy) === 'paved' && PAVED_TILES.length ? PAVED_TILES[0]!
            : GROUND_TILES[0]!
          const pic = tilesMeta[id]
          if (pic) {
            // One tile of the world is `YD_PER_TILE` yards, here as everywhere.
            const each = Math.max(1, Math.round(porch.width / YD_PER_TILE))
            const side = (2 * half) / each
            for (let a = 0; a < porch.len; a += side) {
              for (let k = 0; k < each; k++) {
                g.drawImage(tilesImg, pic.x, pic.y, pic.w, pic.h,
                  a, -half + k * side, Math.min(side, porch.len - a), side)
              }
            }
          }
          g.fillStyle = 'rgba(22, 18, 14, 0.9)'
          const jamb = 0.16 * YD_PER_TILE
          g.fillRect(0, -half - jamb, porch.len, jamb)
          g.fillRect(0, half, porch.len, jamb)
        }
        sill(half)
        g.setTransform(1, 0, 0, 1, 0, 0)
        out.push({ kind: 'front', x: dx, y: dy, at: [ci, cj], along: [ox, oy], half })
        continue
      }
      // The standing room nearest the door, which is the doorway's own floor:
      // a portal sits in the middle of the wall's thickness and can round on
      // to the stone either side of it.
      let i0 = -1, j0 = -1, best = Infinity
      for (let a = Math.floor(ci) - 1; a <= Math.floor(ci) + 1; a++) {
        for (let c = Math.floor(cj) - 1; c <= Math.floor(cj) + 1; c++) {
          const dd = (a + 0.5 - ci) ** 2 + (c + 0.5 - cj) ** 2
          if (walkAt(a, c) && dd < best) { best = dd; i0 = a; j0 = c }
        }
      }
      if (i0 < 0) { unmarked++; continue }
      // No wider than the widest door the client names anywhere in the slice,
      // because a run of standing room longer than that is not a gap in a wall
      // — it is the room going on.  Measured without that cap, two doorways
      // under the abbey's crossing came out as twenty-yard thresholds laid
      // across each other in an X, one of them the wrong way round: with no
      // wall either side, which way the gap runs is not in the plan.
      const cap = Math.ceil(widestDoor() / p.s)
      // Measured on the door's cell and on the cell either side of it through
      // the wall, the narrowest kept: the portal is in the middle of the
      // wall's thickness, a wall is one to three cells thick, and a door point
      // that rounds on to the corridor beyond a thin wall runs the length of
      // the corridor.  Asked on the door's cell alone, eight of the slice's
      // doorways came out with no wall either side.
      const run = (a0: number, c0: number, di: number, dj: number) => {
        if (!walkAt(a0, c0)) return { lo: 0, hi: 0, cells: Infinity, a0, c0 }
        let lo = 0, hi = 0
        while (lo <= cap && walkAt(a0 - di * (lo + 1), c0 - dj * (lo + 1))) lo++
        while (hi <= cap && walkAt(a0 + di * (hi + 1), c0 + dj * (hi + 1))) hi++
        return { lo, hi, cells: lo + hi + 1, a0, c0 }
      }
      const narrowest = (di: number, dj: number) => [-1, 0, 1]
        .map((k) => run(i0 + dj * k, j0 + di * k, di, dj))
        .reduce((u, v) => (v.cells < u.cells ? v : u))
      const alongI = narrowest(1, 0), alongJ = narrowest(0, 1)
      // The gap is the shorter run; the way through is across it.
      const gapJ = alongJ.cells <= alongI.cells
      const gap = gapJ ? alongJ : alongI
      if (gap.cells > cap) { unmarked++; continue }
      const [ti, tj] = gapJ ? [gap.a0 + 0.5, gap.c0 + (gap.hi - gap.lo) / 2 + 0.5]
        : [gap.a0 + (gap.hi - gap.lo) / 2 + 0.5, gap.c0 + 0.5]
      const along: [number, number] = gapJ ? [1, 0] : [0, 1]
      const half = (gap.cells * p.s) / 2
      g.setTransform(along[0] * px, along[1] * px, -along[1] * px, along[0] * px, ti * S, tj * S)
      sill(half)
      g.setTransform(1, 0, 0, 1, 0, 0)
      out.push({ kind: 'between', x: dx, y: dy, at: [ti, tj], along, half })
    }
    exitsUnmarked.set(p, unmarked)
    return out
  }
  /** Doorways a room could not lay a threshold for, by plan — see the cap. */
  const exitsUnmarked = new Map<Plan, number>()
  let widest = 0
  /** The widest front door any building in the slice states, in yards. */
  const widestDoor = () => {
    if (widest) return widest
    for (const one of buildings) {
      for (const d of one.doors) if (d.length === 5) widest = Math.max(widest, d[4])
    }
    return widest || BODY_YARDS
  }

  /**
   * The room you are in, on the glass: one turned blit of the room composed
   * for this storey, and its edges stroked over it.
   *
   * The transform is the roofs' — `planCell` read backwards, with a negative
   * determinant, so it is a `setTransform` and not a `rotate` — scaled by the
   * pixels a cell was composed at.
   */
  function drawRoom(b: (typeof buildings)[number]) {
    const p = planNow()
    if (!p) return
    const room = roomOf(b, p, planUnder())
    const kk = k()
    const q = kk * p.s
    const a = q * p.c, bb = -q * p.sn, c = -q * p.sn, d = -q * p.c
    const Ox = screenX(b.x, b.y), Oy = screenY(b.x, b.y)
    const i0 = p.x0 / p.s, j0 = p.y0 / p.s
    const e = Ox + a * i0 + c * j0, f = Oy + bb * i0 + d * j0
    ctx.setTransform(a / room.S, bb / room.S, c / room.S, d / room.S, e, f)
    ctx.drawImage(room.c, 0, 0)
    // In cell units, because the paths are: a pixel on the glass is `1 / q`
    // of a cell.  Square caps, so two runs meeting at a corner close it.
    ctx.setTransform(a, bb, c, d, e, f)
    ctx.lineCap = 'square'
    ctx.strokeStyle = 'rgba(22, 18, 14, 0.85)'
    ctx.lineWidth = Math.max(1.5, 2 * zoom) / q
    ctx.stroke(room.walls)
    ctx.strokeStyle = 'rgba(22, 18, 14, 0.45)'
    ctx.lineWidth = Math.max(1, zoom) / q
    ctx.stroke(room.specks)
    ctx.lineCap = 'butt'
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    // **And the way out is marked on the glass, pointing out.**  The porch
    // says where a front door is once you look for it; an arrow says it
    // before you do, at every zoom, and it has to be upright and one size on
    // the glass to do that — so it is drawn here, a frame at a time, at the
    // place the room's own transform puts the door and turned the way that
    // transform turns the door's way out.  Nothing in the found sets is a
    // mark on a floor that says *this way*; the colour is the interface's own
    // ink, because it is a mark for the player and not a thing in the room.
    exitsDrawn = 0
    for (const x of room.exits) {
      if (x.kind !== 'front') continue
      const [i, j] = x.at
      const X = a * i + c * j + e, Y = bb * i + d * j + f
      if (X < -markPx || Y < -markPx || X > canvas.width + markPx || Y > canvas.height + markPx) continue
      const gx = a * x.along[0] + c * x.along[1], gy = bb * x.along[0] + d * x.along[1]
      const n = Math.hypot(gx, gy) || 1
      drawMark(X, Y, gx / n, gy / n, 'out')
      exitsDrawn++
    }
    // And each flight's up or down, where `composeRoom` put it.  A landing
    // carries both on one cell, so the pair is set side by side.
    marksLaid.length = 0
    room.flights.forEach((fl, at) => {
      const pair = fl.marks.length === 2 && fl.marks[0]!.at[0] === fl.marks[1]!.at[0]
        && fl.marks[0]!.at[1] === fl.marks[1]!.at[1]
      fl.marks.forEach((m, which) => {
        const [i, j] = m.at
        const X = a * i + c * j + e + (pair ? (which ? 0.55 : -0.55) * markPx : 0)
        const Y = bb * i + d * j + f
        if (X < -markPx || Y < -markPx || X > canvas.width + markPx || Y > canvas.height + markPx) return
        // Along the flight where its heights say which way it climbs, turned
        // the way the room's transform turns that direction.
        let gx = 0, gy = 0
        if (m.dir) {
          const vx = a * m.dir[0] + c * m.dir[1], vy = bb * m.dir[0] + d * m.dir[1]
          const l = Math.hypot(vx, vy) || 1
          gx = vx / l; gy = vy / l
        }
        drawMark(X, Y, gx, gy, m.what)
        marksLaid.push({ flight: at, what: m.what, i, j, X, Y, gx, gy, dir: m.dir })
      })
    })
    roomLaid = room
    roomPlan = p
    roomXform = [a, bb, c, d, e, f]
    // What was laid, and on which part of the room — see `roomPaint`.  The
    // whole room and not the part on the glass: it is one picture now, and a
    // count of what happens to be in view was a count of the camera.
    for (const [key, n] of room.tally) roomPaint.set(key, (roomPaint.get(key) ?? 0) + n)
    indoorRows.add(ROOM_ROW)
  }
  /** How many ways out the last frame marked on the glass. */
  let exitsDrawn = 0
  /** The flights' marks the last frame drew: which flight, which way, where. */
  const marksLaid: { flight: number; what: 'up' | 'down'; i: number; j: number
    X: number; Y: number; gx: number; gy: number; dir: [number, number] | null }[] = []
  /**
   * One mark, upright, centred on the glass at `(X, Y)`: an arrow along the
   * unit vector `(ux, uy)` for a way out, and a triangle for a flight — along
   * `(ux, uy)` when the flight's heights say which way it climbs, and up or
   * down the glass when nothing does.  A dark rim round it, the wall's own stroke, so it
   * reads on a pale floor and a dark one alike.  On the glass by default, and
   * on the minimap at the minimap's own size.
   */
  function drawMark(X: number, Y: number, ux: number, uy: number, what: 'out' | 'up' | 'down',
    g: CanvasRenderingContext2D = ctx, size = markPx, rim = 3) {
    const s = size / 2
    g.save()
    g.translate(X, Y)
    g.beginPath()
    if (what === 'out') {
      // Along the way out: x forward, y across.
      const pt = (fx: number, fy: number) =>
        [(fx * ux - fy * uy) * s, (fx * uy + fy * ux) * s] as const
      const shape = [[1, 0], [0.05, -0.85], [0.05, -0.35], [-0.9, -0.35],
        [-0.9, 0.35], [0.05, 0.35], [0.05, 0.85]]
      shape.forEach(([fx, fy], k) => {
        const [qx, qy] = pt(fx!, fy!)
        if (k) g.lineTo(qx, qy); else g.moveTo(qx, qy)
      })
      g.fillStyle = markInk
    } else {
      const [fx, fy] = ux || uy ? [ux, uy] : [0, what === 'up' ? -1 : 1]
      g.moveTo(fx * s, fy * s)
      g.lineTo((-fx * 0.75 - fy * 0.95) * s, (-fy * 0.75 + fx * 0.95) * s)
      g.lineTo((-fx * 0.75 + fy * 0.95) * s, (-fy * 0.75 - fx * 0.95) * s)
      g.fillStyle = PLAN_INK.steps
    }
    g.closePath()
    g.lineJoin = 'round'
    g.lineWidth = rim
    g.strokeStyle = 'rgba(22, 18, 14, 0.9)'
    g.stroke()
    g.fill()
    g.restore()
  }
  /** The room the last frame drew, and the transform it drew it under. */
  let roomLaid: Room | null = null
  let roomPlan: Plan | null = null
  let roomXform: number[] = []

  /**
   * **The camera fits the room.**  Going in used to keep the zoom the forest
   * had, which is forty yards across a desktop and sixteen across a phone,
   * so a cottage was a box in the corner of the glass and the abbey's nave
   * ran off it on every side — and a room you cannot see the walls of is a
   * room you cannot find the door of.
   *
   * So a door and a flight each frame what is on the other side of them, and
   * the way out gives back what was there before.  Asked of the state rather
   * than hooked on each place that changes it, because there are nine of
   * those (a door, a flight, a save loaded, a teleport clearing the room, the
   * harness's setters) and a hook missed is a room framed for the wrong
   * floor.  Called once a frame, and first by anything about to move the
   * zoom, so a wheel turned the moment after a door does not have its own
   * zoom taken for the outside's.
   *
   * **The player's zoom indoors is his until he leaves or climbs.**  A wheel
   * or a pinch sets `zoomIsMine`, which `resize` already respects; the zoom
   * outside is kept apart, with its own `zoomIsMine`, and handed back.
   */
  function framing() {
    if (indoors === framedB && storey === framedStorey) return
    const was = framedB
    framedB = indoors
    framedStorey = storey
    if (!indoors) {
      roomView = null
      const back = outdoorZoom
      outdoorZoom = null
      if (!back) return
      zoomIsMine = back.mine
      // What the screen wants outside is worked out again rather than
      // remembered, in case the glass turned while he was in there.
      if (back.mine) { zoom = clampZoom(back.zoom); zoomWant = back.want }
      else resize()
      return
    }
    if (!was) outdoorZoom = { zoom, want: zoomWant, mine: zoomIsMine }
    zoomIsMine = false
    frameRoom()
  }

  /**
   * What the room must not go under: the interface that is always on the
   * glass, as rectangles in the canvas's pixels.
   *
   * **The five panels that hide the world, and the thumbs.**  The frame, the
   * map, the experience bar, the swing bar and the action bars are drawn
   * over the scene and are there whatever the player does; on a phone the
   * stick and the buttons are, drawn off `layoutFor` like everything else
   * that has to know where a thumb is.  **The log and the help line are
   * not**, and the reason is a measurement: they are words laid over the
   * world, which is read through, and on a 1280 by 800 desktop the help line
   * sits eighty-six pixels below the middle of the glass — held clear of it
   * and of the log, a cottage came out 197 by 173 pixels, against 560 across
   * without them.  Panels the player opens (the bag,
   * the sheet, a shop, a conversation) are not in it either: opening one is
   * choosing to cover the room.
   */
  const CHROME = ['units', 'map', 'xp', 'swing', 'deck']
  const chromeRects = () => {
    const out: { x: number; y: number; w: number; h: number }[] = []
    for (const id of CHROME) {
      const e = document.getElementById(id)
      if (!e || e.hidden) continue
      const r = e.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) out.push({ x: r.x, y: r.y, w: r.width, h: r.height })
    }
    if (pad.on) {
      const l = layoutFor(canvas.width, canvas.height)
      const disc = (x: number, y: number, r: number) =>
        out.push({ x: x - r, y: y - r, w: 2 * r, h: 2 * r })
      disc(l.home.x, l.home.y, l.base)
      for (const s of l.slots) disc(s.x, s.y, l.hit)
      disc(l.autoAt.x, l.autoAt.y, l.autoR)
      disc(l.pageAt.x, l.pageAt.y, l.pageR)
    }
    return out
  }

  /**
   * Where a man can stand on this storey, as a box in the world: every piece
   * of the standing room `roomOpen` allows, joined four ways, that is at least
   * the speck cut in size.
   *
   * **The storey and not the patch under his feet**, and the patch was tried
   * first.  Joined to where he stood, `__floor` put the harness one floor up
   * the abbey on three stray cells of the gallery and framed them at zoom 3,
   * and with a floor under that — a patch had to reach the cut — it put him
   * on a strip of house 20's first floor and framed that at 2.46: a wardrobe
   * filling the glass.  A player arriving by a flight lands somewhere just as
   * arbitrary.  So the box does not depend on where he is.  **And not every
   * cell of it either**, because a storey's plan carries standing room nobody
   * reaches — the abbey's first floor has single cells along its roof's edge
   * — and a box stretched to take those in is framed round nothing.  The cut
   * is the one the walls are drawn with (`speckCut`): what is too small to be
   * drawn as a wall is too small to be framed as a room.  The box is the
   * cells' corners, so a turned building's box is the one the glass sees.
   */
  const standingExtent = (b: Built, p: Plan, under: Plan | null) => {
    const r = roomPieces(p, under)
    const { W, H } = r
    const cut = speckCut()
    const seen = new Uint8Array(W * H)
    const take = new Uint8Array(W * H)
    const stack: number[] = []
    let taken = 0
    for (let n0 = 0; n0 < W * H; n0++) {
      if (!r.walk[n0] || seen[n0]) continue
      const piece = [n0]
      seen[n0] = 1
      stack.push(n0)
      while (stack.length) {
        const m = stack.pop()!
        const i = (m / H) | 0, j = m % H
        for (const o of [i > 0 ? m - H : -1, i < W - 1 ? m + H : -1,
          j > 0 ? m - 1 : -1, j < H - 1 ? m + 1 : -1]) {
          if (o >= 0 && !seen[o] && r.walk[o]) { seen[o] = 1; stack.push(o); piece.push(o) }
        }
      }
      if (piece.length < cut) continue
      for (const m of piece) take[m] = 1
      taken += piece.length
    }
    // A storey that is all specks is still somewhere to stand.
    if (!taken) for (let n = 0; n < W * H; n++) take[n] = r.walk[n]!
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, cells = 0
    for (let n = 0; n < W * H; n++) {
      if (!take[n]) continue
      cells++
      const i = (n / H) | 0, j = n % H
      for (const [u, v] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]] as const) {
        const [wx, wy] = fromPlan(p, b, p.x0 + u * p.s, p.y0 + v * p.s)
        if (wx < x0) x0 = wx
        if (wx > x1) x1 = wx
        if (wy < y0) y0 = wy
        if (wy > y1) y1 = wy
      }
    }
    return { x0, x1, y0, y1, cells }
  }

  /**
   * The zoom the room you are standing in fits at, and the room framed.
   *
   * **The margin is the interface, measured.**  The box is laid centred on
   * the glass, and it may grow until it touches the glass's edge or one of
   * `chromeRects` — the zoom at which a centred box meets a rectangle is the
   * larger of its two gaps from the middle over the box's two half sizes,
   * because a box only overlaps a rectangle when it overlaps it both ways.
   * So a desktop's cottage stops at the experience bar and a wide hall at the
   * map's corner, and nothing about it is a number of pixels typed here.
   *
   * Then the zoom's own rules, unchanged: at most `clampZoom`'s near end, and
   * **never past the far one**.  On a phone the zoom is a ladder, so a room
   * gets the nearest step it still fits at.
   *
   * **A storey that does not fit at the far limit is shown at the far limit**,
   * and the camera holds the glass inside it — see `camAim` — so what is on
   * the glass is as much of the room as the glass can hold, following the
   * player, and none of the dark round it.  Fitting the room region he stands
   * in instead was the other choice, and it answers the same: a region is
   * standing room joined four ways, doorways and all, so on the abbey's
   * ground floor it is nearly the whole storey.
   */
  function frameRoom() {
    const b = indoors, p = planNow()
    if (!b || !p) { roomView = null; return }
    const ext = standingExtent(b, p, planUnder())
    const cx = canvas.width / 2, cy = canvas.height / 2
    // Half the box on the glass at zoom 1: across is world y, down is world x.
    const halfW = Math.max(1e-3, ((ext.y1 - ext.y0) * PPY) / 2)
    const halfH = Math.max(1e-3, ((ext.x1 - ext.x0) * PPY) / 2)
    let limit = Math.min(cx / halfW, cy / halfH)
    for (const q of chromeRects()) {
      const dx = Math.max(0, q.x - cx, cx - (q.x + q.w))
      const dy = Math.max(0, q.y - cy, cy - (q.y + q.h))
      // A panel over the very middle is covering the scene, not framing it.
      if (!dx && !dy) continue
      limit = Math.min(limit, Math.max(dx / halfW, dy / halfH))
    }
    let fits: boolean
    if (pad.on) {
      const steps = PHONE_ZOOMS.filter((s) => s <= limit)
      fits = steps.length > 0
      zoom = fits ? steps[steps.length - 1]! : PHONE_ZOOMS[0]!
    } else {
      const far = clampZoom(0)
      fits = limit >= far
      zoom = fits ? clampZoom(limit) : far
    }
    zoomWant = zoom
    roomView = { ...ext, limit, fits, zoom }
  }

  /**
   * Where the camera looks indoors: at the player, held so the glass stays
   * on the room.
   *
   * A room smaller than the glass one way is centred that way — it is where
   * the zoom was fitted to sit — and a room bigger than the glass is followed
   * up to its edge and no further, so the dark past a wall never takes the
   * glass from a room that has more to show.  While somebody is talking the
   * camera is the conversation's, which moves it to keep the pair of you
   * clear of the panel.
   */
  function camAim(x: number, y: number): [number, number] {
    const v = roomView
    if (!indoors || !v || chat) return [x, y]
    const hx = canvas.height / 2 / k(), hy = canvas.width / 2 / k()
    const hold = (at: number, lo: number, hi: number, half: number) =>
      hi - lo <= 2 * half ? (lo + hi) / 2 : Math.max(lo + half, Math.min(hi - half, at))
    return [hold(x, v.x0, v.x1, hx), hold(y, v.y0, v.y1, hy)]
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
  /**
   * How many tiles of ground the buildings shadowed last frame, and how many
   * sides of a tile were drawn as a building's edge.
   *
   * Counted where the drawing happens rather than worked out again, for the
   * reason every other counter here exists: a check that recomputes what it is
   * checking is checking its own copy.
   */
  let shaded = 0, outlined = 0
  /**
   * What the last frame actually drew **inside a building**, by storey.
   *
   * Read off the draw loop's own decision rather than re-derived, because the
   * failure this exists for is exactly a second copy of the rule agreeing with
   * itself: before issue 221 both filters asked *whose building is this* and
   * neither asked *which floor*, and a check that recomputed that pair of
   * conditions would have agreed that everything was fine.
   */
  const indoorProps: number[][] = []
  const indoorFolk: (number | string)[][] = []
  /**
   * How many pictures the last frame put the hero together out of.
   *
   * One is a man with nothing in his hands.  Counted where the images are
   * actually drawn rather than where they are chosen, because `drawArm`
   * returns early on a name the atlas has never heard of — so this says a
   * picture landed, which is the claim, and not merely that a branch ran.
   */
  let heroLayers = 0
  /**
   * Which sheets the hero was drawn out of last frame, by key: `hair-<style>`,
   * `beard-<style>`, `<weapon>:behind`.  A count of layers could not say the
   * beard was missing, because the hair is drawn as `hair-plain` when nothing
   * is chosen and that made up the number.
   */
  const heroSheets: string[] = []
  /**
   * Every clip this page has actually put on screen, as `sheet:clip`.
   *
   * Kept because a clip that is cut and never played is this repository's most
   * frequent bug and it is invisible from either end alone: the bake says six
   * frames of `slash` exist, the scene says it draws the hero, and nothing
   * compared the two.  Twenty-four cells sat unread for as long as the sprite
   * has existed — `tint` (issue 118) and `I_QUALITY` (issue 157) were the same
   * shape.  `viewcheck` drives every weapon past this and fails on a gap.
   */
  const played = new Set<string>()
  /** The pose the last frame drew him in, for the check that it is the swing. */
  let heroPose = { clip: '', frame: 0, count: 0 }
  /**
   * What was painted inside a building's outline this frame, by tile name.
   *
   * Counted off the real draw rather than re-derived, because re-deriving the
   * paint chain is a second copy of it and a second copy drifts.  `__underRoof`
   * hands it to the check.
   */
  const indoorPaint = new Map<string, number>()
  /**
   * What the last frame laid **inside** a room, as `part:tile` — `floor` under
   * the roof, `open` where the sky is over a courtyard, and `wall` round the
   * edge.
   *
   * `indoorPaint` is the outside's count of the same outline and cannot say
   * it: once you are through the door that pass does not run.  Issue 159 asked
   * that a building's inside use three floor pictures at most, and nothing had
   * counted what `drawRoom` puts down, so the promise sat in the wiki with a
   * dash beside it.
   */
  const roomPaint = new Map<string, number>()
  /**
   * Who the draw loop left out this frame, for the check that asks whether
   * they deserved it.
   *
   * Read off the loop's own decision rather than re-derived: a check that
   * re-derives the condition is a check that agrees with itself.
   */
  const hidden: { x: number; y: number; kind: string; why: string }[] = []
  /**
   * Whether the scene can see somebody, and if not why — the draw loop's own
   * decision, as a function, so a check can ask it every step without a frame
   * in between.
   *
   * It was written inline in the loop, which is right for a check that reads
   * one frame and wrong for the one issue 173 asked for: *somebody wandering
   * does not appear and disappear*.  A frame is sixteen milliseconds and a
   * wander is minutes, so a check that had to wait for frames to watch it
   * could watch a few seconds.  Pulled out rather than copied, because a check
   * that re-derives the rule is a check that agrees with itself.
   */
  const sightOf = (n: Npc) => {
    // A kobold in a mine is in the mine, and the mine is not a WMO so
    // `inRoom` cannot see it.  Without this the whole of Ant'hill stood on
    // the hillside above itself.
    const mine = n.cave !== undefined ? caves[n.cave]! : null
    // Under somebody's **roof**, not merely inside somebody's outline — see
    // `roofOver`.  Asked the outline's way this hid eight people standing in
    // the abbey's yard under the open sky, and made anybody who wandered
    // across the silhouette's edge blink.
    const roof = mine ?? roofOver(n.x, n.y)
    // And which floor of it.  A creature's height is the server's, the same
    // number the mines already lean on, so this is the same question asked
    // of a spawn instead of a barrel.
    const up = roof ? storeyOf(roof, n.z) : -1
    // Why, so the check can ask whether it was deserved.  Three reasons and
    // they are not the same: a roof cut from the building's own triangles, a
    // building with no plan at all — which is drawn as a picture, so its
    // inside is not a place — and a mine, which is not a model and has no
    // plan by construction.
    const why = indoors
      ? (roof !== indoors || up !== storey ? 'outside the room you are in' : null)
      : !roof ? null : mine ? 'mine' : !roof.plan ? 'sprite' : 'roof'
    return { roof, up, why }
  }
  /** How many tiles this frame were an edge rather than a fill. */
  let edged = 0
  /** How many tiles the ground loop looked at, against how many it drew. */
  let tilesInView = 0
  /** Every blend ever laid down, which a plate's one-off composition needs. */
  let blendedEver = 0
  /** And every tile ever composed into a plate, so the two can be a share. */
  let platedEver = 0
  /**
   * The same three kinds of edge counted apart, for the check on the ring
   * pieces (issue 129).  `blendedEver` adds them up, so it went on reading
   * "an edge or a blend" after the plates took over and would have gone on
   * reading it with no ring piece drawn anywhere: a plate's edges are its own
   * share layers, and the ring and shore pieces are only laid on a **loose**
   * tile — one drawn in the frames before its plate is composed.
   */
  let plateEdgeEver = 0
  let ringEver = 0
  let looseBlendEver = 0
  let looseEver = 0
  let last = performance.now()
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
    // Walking cancels a cast — the client's own `SPELL_AURA_INTERRUPT_FLAGS`,
    // and the reason a caster's fight is stand-still-and-decide rather than
    // kite-and-press.  The power is already gone, which is what makes moving
    // away mid-cast a real mistake rather than a free cancel.
    if (hero.moving) breakCast('움직였다')
    if (hero.moving) {
      const len = Math.hypot(mx, my)
      // A step is a third of a yard at running speed, and a collision test
      // that only asks once a step walks *through* anything narrower than
      // that — a tree, a fence post, the gap between two people.  So the
      // movement is cut into pieces no bigger than a body's own width, which
      // is what the client's collision radius is for.  Asked once, fifteen of
      // twenty steps out of the starting camp were refused outright.
      const each = 0.15
      /**
       * And how fast, which water decides.
       *
       * Three states and one threshold, which is the server's: shallower than
       * three quarters of a body he is standing in it and runs, deeper and he
       * is off his feet at `MOVE_SWIM`'s 4.72 yards a second.  Wading between
       * is the run slowed by how much of him is under — at the knee almost
       * nothing, at the chest nearly the swim.  That last part is ours; the
       * two ends are not.
       */
      const under = depthAt(hero.x, hero.y)
      const pace = under >= SWIM_DEPTH ? SWIM_SPEED
        : SPEED - (SPEED - SWIM_SPEED) * Math.min(1, under / SWIM_DEPTH)
      const pieces = Math.max(1, Math.ceil((pace * step) / each))
      const dx = ((mx / len) * pace * step) / pieces
      const dy = ((my / len) * pace * step) / pieces
      for (let piece = 0; piece < pieces; piece++) {
        // Each axis is tested on its own, so walking into a shoreline at an
        // angle slides along it instead of stopping dead.  Tested together, a
        // diagonal into the bank blocks both halves and the player sticks on
        // water they are not even walking into.
        //
        // And if the player is already standing somewhere he cannot be —
        // teleported there, or dropped in by a mask that moved under him — he
        // may move, because a rule that can trap somebody is worse than the
        // thing it prevents.
        //
        // **But only towards the way out.**  Allowing *every* direction is how
        // that rule became the bug it was meant to prevent: once inside a rock
        // you could walk anywhere for as long as you liked, and three of four
        // directions from a blocked cell ended on another blocked cell, so the
        // escape hatch never closed behind you.  Indoors it is wider still —
        // `footing` refuses every cell that is not `floor`, which is 41% of
        // the abbey.
        //
        // `wayOut` is the same question `throughTheDoor` asks when it needs
        // somewhere to stand: eight directions, a few radii, nearest first.
        const stuck = footing(hero.x, hero.y) ? wayOut(hero.x, hero.y) : null
        if (stuck) {
          hero.x += stuck.x * Math.hypot(dx, dy)
          hero.y += stuck.y * Math.hypot(dx, dy)
          continue
        }
        if (!footing(hero.x + dx, hero.y)) hero.x += dx
        if (!footing(hero.x, hero.y + dy)) hero.y += dy
      }
      hero.dir = facing(mx, my)
      throughTheDoor()
      upOrDown()
    }
    hero.t += step
  }

  /**
   * The seam between the two kinds of scene.
   *
   * Walking on to a doorstep changes which world is drawn, and that is the
   * whole of it: no menu, no prompt, no loading.  A door is a place, and
   * standing in it is the act.
   *
   * The one thing that needs care is not walking straight back out.  A
   * doorstep is 1.6 yards across and a step is a third of a yard, so a player
   * crossing one is on it for five steps; the door he came through is
   * remembered and only lets him back out once he has left it.
   */
  function throughTheDoor() {
    const near = (b: (typeof buildings)[number]) => b.doors.find(([dx, dy]) =>
      Math.hypot(dx - hero.x, dy - hero.y) < doorstepOf(b))
    // **A front door is walked through, not jumped.**  Since the way in was
    // carried out through the eaves (issue 235) a man can walk from the grass
    // to the room on his own feet — `atDoor` lets him stand on it from either
    // side — and this went on doing what it did when the door was a disc in a
    // wall: on the doorstep it put him three to six yards in, and walking back
    // to the door put him three to six yards out.  So a player walking in or
    // out was thrown across the threshold every four steps, forty times a
    // doorway; and `doors` also holds the doorways *between* a building's
    // rooms, so walking past one of those indoors threw him out and back in.
    // Walked the way a player walks, 24 of 25 buildings were entered and 10
    // could be left.  Where a building has a way in nobody is moved now: he is
    // inside from its door, and outside once he is off the building's outline,
    // which the passage runs half a yard past.  The door is 2.75 yards in from
    // the eaves, so the two edges are apart and nothing flickers between them.
    // The jump stays for what has no passage — a mine's mouth is a hole in a
    // hillside.
    const walkIn = (b: (typeof buildings)[number]) => porchesOf(b).length > 0
    if (indoors && walkIn(indoors)) {
      if (!stillInside(indoors, hero.x, hero.y)) {
        indoors = null
        storey = -1
        onStep = false
        ui.log('밖으로 나왔다.', 'note')
      }
      return
    }
    if (!indoors) {
      for (const b of buildings) {
        if (!b.plan || !walkIn(b)) continue
        if (!porchesOf(b).some((q) => Math.hypot(q.ax - hero.x, q.ay - hero.y) < DOORSTEP)) continue
        indoors = b
        storey = -1
        // Latched as though he were already on a rung: he is standing at the
        // door, and at house 26 in Goldshire the door is on the stairs, so
        // unlatched the next step took him upstairs on the way in.  The jump
        // used to put him three yards past it, off them.  A flight is climbed
        // by stepping on to it, which he still does once he has stepped off.
        onRung = true
        onStep = false
        ui.log(`${zoneOf(b.area || areaOf(hero.x, hero.y))} 안으로 들어갔다.`, 'note')
        return
      }
    }
    if (indoors) {
      const door = near(indoors)
      if (!door) { onStep = false; return }
      if (onStep) return
      step(indoors, door, 1)
      indoors = null
      storey = -1
      ui.log('밖으로 나왔다.', 'note')
      return
    }
    // Asked of the doors and **not** of `inRoom`, which was the first
    // attempt and cannot work: a doorway is an opening, so the outline bit at
    // a door is nought and the building says you are not in it.  That is the
    // whole reason the abbey's eight doors come out open in the bake's own
    // check, and it is why walking at one entered nothing.
    let b: (typeof buildings)[number] | null = null
    let door: Door | undefined
    for (const x of [...buildings, ...caves]) {
      if (!x.plan || !x.doors.length || walkIn(x)) continue
      const d = near(x)
      if (d) { b = x; door = d; break }
    }
    if (!b || !door) return
    indoors = b
    // You come in on the ground floor, whatever floor you left on.
    storey = -1
    onRung = false
    onStep = true
    step(b, door, -1)
    ui.log(`${zoneOf(b.area || areaOf(hero.x, hero.y))} 안으로 들어갔다.`, 'note')
  }
  /**
   * Over the threshold, one way or the other.
   *
   * Which way is *in* comes from the plan's own floor bits and not from the
   * line out of the building's middle, which was the first attempt and does
   * not work: a placement's box is the grounds and not the room — the abbey's
   * is 91 yards square — so its centre is nowhere near the nave, and stepping
   * "inward" from a door walked out of the side of the building.  Eight
   * directions at three yards, and the first one standing on floor wins.
   */
  /**
   * **Test only**: in through a door, the way the checks have always gone in —
   * on to the floor a few yards past it.
   *
   * `throughTheDoor` stopped moving anybody through a building that has a way
   * in, and it only opens one at its front door: a doorway between two rooms
   * is not a way in from outside, and a player can only stand at one by
   * already being inside.  The hooks put him at *a* door, often one of those,
   * and every check written on top of them expects to be standing in the room
   * after — so they ask for that here rather than the rule bending for them.
   */
  function putInside(b: (typeof buildings)[number], door: Door) {
    if (!porchesOf(b).length) { throughTheDoor(); return }
    indoors = b
    storey = -1
    onRung = false
    onStep = false
    step(b, door, -1)
  }
  function step(b: (typeof buildings)[number], door: Door, way: number) {
    const p = b.plan
    if (!p) return
    // Measured from the threshold, which is not the same width for everything.
    // A house's doorstep is a door and three yards in is a room; a mine's is
    // the client's own hole in the hillside, 8.33 yards across, and three
    // yards in is still standing in the doorway — so `throughTheDoor` never
    // cleared `onStep` and a player who walked in could not walk out again.
    const past = doorstepOf(b) - DOORSTEP
    for (const r of [3 + past, 4.5 + past, 6 + past]) {
      for (let a = 0; a < 8; a++) {
        const t = (a / 8) * Math.PI * 2
        const x = door[0] + Math.cos(t) * r, y = door[1] + Math.sin(t) * r
        const on = bitAt(p.floor, planCell(p, b, x, y))
        // Going in wants floor; coming out wants none of it, and ground that
        // will hold a man.
        if (way < 0 ? on : (!on && !inRoom(x, y) && !blocked(x, y))) {
          placeHero(x, y)
          return
        }
      }
    }
  }

  /**
   * What the keys and the thumb are asking for, read into `want`.
   *
   * Once a frame, and `walk` acts on it once a step.  A function of its own
   * because `__hold` has to read a held key the same way: it only changed
   * `keys`, and a check that holds a key and steps the world inside one
   * evaluation never gives a frame the chance to read it — so 9t's "twenty
   * steps go as far as twenty steps" walked nought yards both ways and passed
   * on nought against nought.
   */
  function steer() {
    let sdx = 0, sdy = 0
    if (keys.has('w') || keys.has('arrowup')) sdy -= 1
    if (keys.has('s') || keys.has('arrowdown')) sdy += 1
    if (keys.has('a') || keys.has('arrowleft')) sdx -= 1
    if (keys.has('d') || keys.has('arrowright')) sdx += 1
    const stick = pad.push()
    if (stick) { sdx = stick.x; sdy = stick.y }
    want.x = sdx; want.y = sdy
  }

  function frame(now: number) {
    if (zoom !== zoomSeen) { zoomSeen = zoom; zoomMoved = now }
    else if (bakedBefore && now - zoomMoved > ATLAS_SPARE_MS) {
      releaseCanvas(bakedBefore.c)
      bakedBefore = null
    }
    // **The next frame is asked for first.**  It was the last line, so one
    // frame that threw — a canvas the browser would not allocate, on a phone
    // out of canvas memory — was the last frame there would ever be, and the
    // game sat frozen on its final picture.  Asked first, a bad frame is one
    // bad frame.
    requestAnimationFrame(frame)
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
    for (const f of flights) { f.ix = tween(f.was.x, f.x); f.iy = tween(f.was.y, f.y) }
    const dt = real

    // --- the thumbs, before the keys, because they answer the same question
    pad.setBusy(chat !== null)
    // One flag, two interfaces.  The pad draws it and asks for changes; the
    // scene owns it, so `Y` and the thumb are the same switch.
    pad.setAuto(you.auto, (want) => { you.auto = want })
    // A pinch takes the zoom over — the same as a wheel.  A `1` is nobody
    // pinching, so a frame where nothing happened does not count as a
    // decision and a rotated phone still gets its fit back.
    const pinched = pad.pinch()
    if (pinched !== 1) nudgeZoom(pinched)
    // The page learns it is on a phone from the pad, which can be after the
    // first `resize` chose a desktop's opening — so the phone's own opening is
    // taken the first frame it knows, unless the player has already zoomed.
    if (pad.on !== zoomedAsPhone) {
      zoomedAsPhone = pad.on
      if (!zoomIsMine) resize()
      else { zoom = clampZoom(zoom); zoomWant = zoom }
    }
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
      const PICK = 3 * 3
      let best: Npc | null = null, bd = PICK
      for (const n of active) {
        if (n.dead || !n.fight) continue
        const d = (n.x - at.x) ** 2 + (n.y - at.y) ** 2
        if (d < bd) { bd = d; best = n }
      }
      // Only something that will fight back becomes a target; tapping a
      // townsman is how you look at one, not how you start on them.
      if (best && fightable(best.fight)) you.target = best
      else if (best) you.target = null
      // And tapping somebody who will talk is how you talk to them, because
      // there is no talk button any more: the original has none either, and a
      // button that says 대화 is a button that has to be aimed at while the
      // person it is about is somewhere else on the glass.
      //
      // **Tapping *him*, not tapping anywhere while he is near.**  This asked
      // only whether anybody was in earshot, so a tap on open ground four
      // yards past a shopkeeper opened him — and so did a press on an ability
      // square, until `touch.ts` stopped lifting those as taps.  Issue 143's
      // table says what empty ground does: nothing.  The radius is the one the
      // aim above uses, so a person and a wolf are hit by the same finger.
      const near = inReach()
      const onHim = !!near && (near.x - at.x) ** 2 + (near.y - at.y) ** 2 < PICK
      if (onHim && (!best || !fightable(best.fight))) toggleTalk()
    }
    // Aiming, which is not a button any more — see `takeAim`.
    takeAim()
    // And the autocast, which says "keep fighting" and until now only picked a
    // target.  See `autoCast`.
    autoCast()
    for (const slot of pad.taken()) {
      if (chat || you.died) continue
      // A press that turned into a question is not a press.
      if (pad.asking) continue
      const sp = onPhonePage()[slot]
      if (sp) cast(sp)
    }

    // Steering happens on the glass, both for the keys and for the thumb.
    //
    // W used to be north because north was up.  In quarter view it is up and
    // to the right, and a W that walks you diagonally while the screen says
    // "up" is the kind of control nobody can aim.  So the intent is collected
    // in screen pixels and put through the same inverse the tile loop uses —
    // one place that knows how the projection works, rather than two that have
    // to agree.
    steer()
    // On a phone the panel takes the bottom two thirds of the screen and the
    // person talking stands behind it, which is the one thing a conversation
    // cannot afford.  So the camera follows a point above the hero by exactly
    // enough to centre the pair of you in the gap the panel leaves, and slides
    // back when it closes.  The lift is in yards because the camera is: at a
    // fixed pixel offset, zooming out would walk the pair back down the glass.
    // The band of screen left over: under the readout, and right of the panel.
    // The first version centred the pair in everything above the panel and put
    // them behind the readout instead, which is the same bug one corner along.
    // Through a door or up a flight since the last frame: frame the room.
    framing()
    const top = chat && pad.on ? hudH + 16 : 0
    const wantY = (top + canvas.height) / 2
    // Up the glass is world x and only world x, so the lift is along it alone.
    // In quarter view it had to move along both axes together or the pair of
    // you slid sideways as the panel opened.
    const lifted = (canvas.height / 2 - wantY) / k()
    lift += (lifted - lift) * Math.min(1, dt * 6)
    // And across, which is the axis the panel now takes.  Screen-right is
    // *down* world y — see `screenX` — so pushing the pair of you right of the
    // panel means walking the camera's y up.
    const wantX = chat && pad.on
      ? (Math.min(panelR + 24, canvas.width) + canvas.width) / 2
      : canvas.width / 2
    const shove = (wantX - canvas.width / 2) / k()
    slide_ += (shove - slide_) * Math.min(1, dt * 6)
    // Both axes after both offsets, because indoors the point followed is
    // held to the room — see `camAim` — and holding one axis needs the other.
    const [aimX, aimY] = camAim(hero.ix - lift, hero.iy + slide_)
    camX += (aimX - camX) * Math.min(1, dt * 8)
    camY += (aimY - camY) * Math.min(1, dt * 8)

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
    const sky = forcedSky ?? skyAt(roster?.weather?.[String(zoneHere)]
      ?? roster?.weather?.[String(inside(zoneHere))], today)
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
     * and at that size there is nothing in a 1.33 yard tile to see.
     *
     * **It caps the far end; it does not flatten the range**, and the comment
     * here said flat for a round.  A tile is 32 pixels at 1:1, so the doubling
     * cannot engage until the zoom is under 0.5 — above that the count is the
     * square law, undisturbed.  Measured over the sweep `viewcheck` now walks:
     * 86 tiles at zoom 3, 520 at 1, **1,256 at 0.5 — and 422 at the 0.396
     * floor**, which is the whole of what this buys.  Pulling out past the
     * doubling costs *less* than the zoom just above it, and that is the
     * property the check asserts, because it is the one that is true.
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
    // A plate is composed at the size the tinted strip is cut to, so the two
    // are thrown away together.  Nothing else moves the plain ground: its
    // light is the hillside's own and the sky is a wash over the top.
    // How many tiles a plate holds here, so that a plate is about `PLATE_PX`
    // across at any zoom.  A power of two so the grid lines up with itself
    // when the grain doubles.
    // Sixteen at most, and that is a *composition* cost rather than a memory
    // one: a plate is composed one tile at a time, so thirty-two tiles square
    // is a thousand draws in the frame it appears — which at the widest zoom
    // put the check that watches the frame rate on a knife edge, 43 to 46.
    const PLATE = Math.max(2, Math.min(16,
      2 ** Math.round(Math.log2(Math.max(1, PLATE_PX / (px * grain))))))
    // **A tile of a plate is as wide as a tile of the world, not as its
    // picture.**  The strip cuts a picture a pixel wider than the tile and
    // rounds it up — 24 pixels at zoom 0.7, where a tile is 22.4 apart — so
    // that loose tiles overlap instead of cracking.  A plate composed at the
    // picture's width was a sixteenth too wide *per tile*: 25 pixels a plate,
    // which the next plate then drew over.  While every tile was a square of
    // its own nobody could see it; with the grounds blended across the tiles
    // every seam was a straight line through the hills.  Keyed on the zoom the
    // strip is keyed on, and laid on the glass at the exact size.
    const zkey = Math.round(zoom * 100)
    const UNIT = TILE * (zkey / 100) * grain
    const pkey = `${px}|${grain}|${PLATE}|${zkey}`
    if (pkey !== plateKey) { forgetPlates(); plateKey = pkey }
    // And the ones nobody has looked at for a while, once there is pressure.
    if (plateBytes > PLATE_BUDGET / 2) {
      for (const [k, v] of plates) {
        if (frames - v.used > 240) { plates.delete(k); plateBytes -= v.bytes; releaseCanvas(v.c) }
      }
    }
    platesDrawn = 0
    tilesDrawn = 0
    waterTilesDrawn = 0
    tilesInView = 0
    indoorPaint.clear()
    roomPaint.clear()
    indoorProps.length = 0
    indoorFolk.length = 0
    edged = 0
    /**
     * Which building covers each tile of the box, kept so the pass after this
     * one can find the edges of them.
     *
     * A building had no boundary at all: ninety yards of one grey tile with
     * nothing to say where it stopped.  Finding that edge needs the *four
     * neighbours* of every roofed tile, and asking `inBuilding` four more
     * times a tile is four times the work for a line — so the answer this
     * loop already has is written down and read back.
     */
    const cw = xHi - xLo + 1
    /**
     * The whole answer and not just which building, because the paint pass
     * now runs *after* this is filled in and would otherwise ask `inBuilding`
     * a second time for every tile — which is the expensive half of the loop.
     */
    const under: (ReturnType<typeof inBuilding>)[] =
      new Array(cw * (yHi - yLo + 1)).fill(null)
    /** Which of them are on screen, gathered as the box is walked. */
    const standing = new Set<(typeof buildings)[number]>()
    const coverOf = (ti: number, tj: number) =>
      (ti < xLo || ti > xHi || tj < yLo || tj > yHi) ? null
        : under[(ti - xLo) * (yHi - yLo + 1) + (tj - yLo)] ?? null
    const roofOf = (ti: number, tj: number) => coverOf(ti, tj)?.b ?? null
    /**
     * One tile of the outdoor ground, drawn into `g`.
     *
     * Three modes, because the plain ground is now composed once into a
     * **plate** and kept:
     *
     *   * `all`   — everything, which is what a tile with no plate behind it
     *     gets and what this pass always did
     *   * `plain` — the terrain and nothing else, for composing a plate: no
     *     building, no bridge deck, no water, and a hole left to the frame
     *   * `over`  — only what a plate cannot hold, for a tile whose plate is
     *     already down
     *
     * One function and not three: the chain that turns a paint word into a
     * picture is sixty lines long, and a second copy of a chain is a chain
     * that drifts — which this file has paid for twice.
     */
    const paintGround = (g: CanvasRenderingContext2D, ti: number, tj: number,
      cx: number, cy: number, covers: ReturnType<typeof inBuilding>,
      mode: 'all' | 'plain' | 'over',
      /**
       * This tile is under a building that is drawn **as one piece**, so the
       * ground under it is ordinary ground and the roof is somebody else's
       * job.  Only ever true on the fringe of a footprint: a tile with the
       * same building on all four sides is skipped before this is called.
       *
       * Not the same as passing `null` for `covers`.  The client cuts its own
       * terrain away where a building brings its own floor, and a hole with
       * nothing over it is painted black — the middle of Goldshire was a
       * thirty-yard black square for exactly that reason.  So the hole still
       * has to know it is covered even when the roof is not drawn here.
       */
      roofless = false,
      /**
       * For `plain`: this kind of ground's picture, whatever the paint and the
       * slope say the tile is.  A plate lays its grounds down one at a time
       * and lets each one's share decide where it shows — see `kindsOf`.
       */
      layer?: string,
      /** And which family of its pictures, for a word that has two. */
      family?: number): number => {
      const wx = ti * T, wy = tj * T
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
      if (outside(wx, wy) || (openHole(wx, wy) && !covers)) {
        if (mode === 'plain') return 0
        const wide = px * grain
        g.fillStyle = '#0a0a0f'
        g.fillRect(Math.round(cx - wide / 2), Math.round(cy - wide / 2),
          wide, wide)
        return 1
      }
      const h = hash(ti, tj)
      // Only a tile drawn loose is a tile of water.  In a plate water is a
      // share like any ground, and over a plate there is none left to lay.
      const water = mode === 'all'
        && WATER_TILES.length > 0 && wetAt(wx, wy)
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
      // A meadow used to be a 5x5 block of tiles — 6.67 yards square, all
      // of it flowers or none — and its edges were ruled with a straight
      // edge.  The same coarse grid read *bilinearly* costs the same four
      // lookups and gives a blotch.
      // Four lookups where there was one, so only at the tile's own size:
      // past that the ground is drawing one square where sixty-four belong
      // and the edge of a meadow is not a thing anybody can see.  Without
      // the guard the widest zoom went from 54 frames to 35.
      const mu = ti / 5, mv = tj / 5
      const mi = Math.floor(mu), mj = Math.floor(mv)
      let blotch: number
      if (grain === 1) {
        const fx = mu - mi, fy = mv - mj
        const n00 = hash(mi + 811, mj + 277), n10 = hash(mi + 812, mj + 277)
        const n01 = hash(mi + 811, mj + 278), n11 = hash(mi + 812, mj + 278)
        blotch = n00 * (1 - fx) * (1 - fy) + n10 * fx * (1 - fy)
          + n01 * (1 - fx) * fy + n11 * fx * fy
      } else blotch = hash(mi + 811, mj + 277)
      const meadow = BLOOM_TILES.length > 0 && blotch > MEADOW
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
      // A building's plan, drawn on the ground: stone inside, darker stone
      // for the wall.  In the ground pass because from above a building is
      // mostly a floor with a line around it, and because a plan ninety
      // yards across is not a thing that can be a sprite.
      const built = roofless ? null : covers
      // The roof comes off the building you are standing in.  There are no
      // interiors here and the abbey holds the people who hand out the work,
      // so a roof drawn over them is a roof with a quest giver under it —
      // and the walls are what say where you are anyway.
      // From outside, a building is its roof and nothing else: the walls
      // are what you see once you are in it.  Drawn the other way round the
      // abbey was a roof with its own walls painted over the top, which
      // reads as ribs on a tent rather than as a building.
      // A building, from outside, is its roof — **whatever the plan says is
      // under it**, and that is the whole of it now.
      //
      // This used to be three branches: roof if it is not the building you
      // are standing in, wall where the plan says stone, floor where it says
      // room.  Two of them were unreachable and one of those unreachabilities
      // was a bug that is now fixed somewhere else.  `inBuilding` makes
      // *three* states and not two — `stone === 0 && room === 0` is false
      // twice — and that third state had no branch, so it fell all the way
      // down to the outdoor paint: the abbey had brown earth in it and the
      // inn had grass in the hall.  It is 65% of the outline over all
      // forty-six plans, 192,671 cells of 295,227, and one building is
      // 80,746 cells of outline with 253 of floor.
      //
      // `327779e` closed the buildings, and a closed building is drawn by
      // `drawRoom` off its own outline the moment you are inside one.  So
      // `built.b === under` never reaches this loop, the wall and floor
      // branches under it are dead, and the third state cannot fall through
      // any more.  Measured from outside the abbey and outside Goldshire,
      // what lands under an outline is 2,212 and 525 tiles of `roof` and
      // nothing else — which `viewcheck` now asserts, because the thing that
      // keeps this true is a check and not the shape of the expression.
      /**
       * Which picture a word gets here.
       *
       * A function rather than one expression because the paint now says
       * *two* words and how much of each, so the chain is walked twice —
       * and a second copy of a chain is a chain that drifts.
       */
      const way = family ?? (toneAt(wx, wy) > 0.5 ? 1 : 0)
      const pick = (fams: string[][]) => {
        const l = fams[Math.min(way, fams.length - 1)]!
        return l[Math.floor(h * l.length)]!
      }
      const tileFor = (word: string) => word === 'paved' && PAVED_TILES.length > 0
        ? pick(PAVED_WAYS)
        : word === 'ash' ? ASH_TILE
        : word === 'rock' || word === 'paved' ? ROCK_TILE
          : word === 'crop' && flat ? CROP_TILE
          : word === 'road' && flat
            ? pick(DIRT_WAYS)
            : word === 'sand' ? SAND_TILE
              : shore ? SHORE_TILE
                : stepAt(wx, wy, T) > CLIFF ? ROCK_TILE
                  : word === 'bloom' || (meadow && h > 0.55)
                    ? BLOOM_TILES[Math.floor(h * 7) % BLOOM_TILES.length]!
                    : steep > BARE
                      ? pick(DIRT_WAYS)
                      : GROUND_TILES[Math.floor(h * GROUND_TILES.length)]!
      /**
       * The picture of one kind of ground here, with nothing left to decide
       * but which of its turns — the plate's half of `tileFor`, whose
       * conditions have already been paid out as shares by `kindsOf`.
       */
      /**
       * Whether the client's flowers are on this tile, as a throw against the
       * share of them it painted here.
       *
       * Flowers are not a ground to blend.  Laid as a layer at their share,
       * every tile of a meadow carried the same flower picture faintly and
       * the meadow became a lattice of ghosts one tile apart — `shotcheck`'s
       * chessboard gauge went from 2.1 to 4.3.  A tile is flowered or it is
       * not, the way the meadow's own blotch has always decided it.
       */
      const flowered = () => {
        const second = blendAt(wx, wy)
        const m = second ? Math.min(1, second[1]) : 0
        const share = (ink === 'bloom' ? 1 - m : 0)
          + (second && second[0] === 'bloom' ? m : 0)
        // Pushed towards its ends, and that is the meadow comment's lesson
        // again: a flower at a uniform probability is a rash.  Where the client
        // painted mostly flowers there are flowers, where it painted a trace
        // there are none, and only between is it a throw.
        const t = Math.max(0, Math.min(1, (share - 0.35) / 0.3))
        return hash(ti + 71, tj + 23) < t * t * (3 - 2 * t)
      }
      const pictureOf = (kind: string) => kind === 'paved'
        ? (PAVED_TILES.length > 0 ? pick(PAVED_WAYS) : ROCK_TILE)
        : kind === 'ash' ? ASH_TILE
        : kind === 'rock' ? ROCK_TILE
        : kind === 'crop' ? CROP_TILE
        : kind === 'road' ? pick(DIRT_WAYS)
        : kind === 'sand' ? SAND_TILE
        : kind === 'shore' ? SHORE_TILE
        : kind === 'water' && WATER_TILES.length > 0
          ? WATER_TILES[Math.floor(h * WATER_TILES.length)]!
        : (meadow && h > 0.55) || flowered()
          ? BLOOM_TILES[Math.floor(h * 7) % BLOOM_TILES.length]!
        : GROUND_TILES[Math.floor(h * GROUND_TILES.length)]!
      const id = built ? (ROOF_OF[built.b.k] ?? ROOF_TILE)
        : water ? WATER_TILES[Math.floor(h * WATER_TILES.length)]!
          : layer !== undefined ? pictureOf(layer) : tileFor(ink)
      // What a building's outline got painted with, tallied as it is drawn.
      //
      // The check this feeds could not be written any other way without a
      // second copy of the chain above, and a second copy of a chain is a
      // chain that drifts.  Counted off the real draw instead: whatever ends
      // up under an outline this frame, by name.  A building may be drawn in
      // a roof, a wall and a floor and nothing else.
      if (built) indoorPaint.set(id, (indoorPaint.get(id) ?? 0) + 1)
      // One straight blit of a square, centred on the tile's own point —
      // which is what `wx, wy` has always meant here.
      // Twenty-one steps over a smooth hillside is a mosaic, and the line
      // between step nine and step ten is dead straight because every tile
      // takes its light from the one point at its middle.  Half a step of
      // jitter from the tile's own hash turns that line into a zigzag: it
      // costs nothing, it is stable frame to frame, and the hash was
      // already measured to have no periodicity in it.
      // **A plate takes its light flat and gets it multiplied back on
      // afterwards, once, smoothly.**  Twenty-one steps over a hillside is a
      // mosaic and the line between step nine and step ten is dead straight,
      // which is why there is a jitter in the other branch — half a step of
      // noise to turn that line into a zigzag.  A plate does not need either:
      // it is a bitmap, so the light can be interpolated across it.
      const step = mode === 'plain' ? FLAT_ROW
        : Math.max(0, Math.min(SHADES - 1, Math.round(
          ((sl - SHADE_LO) / (SHADE_HI - SHADE_LO)) * (SHADES - 1)
          + (grain === 1 ? (hash(ti + 37, tj + 91) - 0.5) * 1.8 : 0))))
      const wide = px * grain
      // A plate already holds the plain ground under this tile, and its
      // water, so what is left is whatever a plate cannot hold: a building.
      // A bridge deck is not a tile at all — it is laid after this pass, in
      // the axes it lies in.
      if (mode === 'over' && !built && !water) return 0
      if (water) waterTilesDrawn++
      g.drawImage(ground.c, ground.at[id]!, ground.top[id]! + step * ground.cell, ground.cell, ground.cell,
        Math.round(cx - wide / 2), Math.round(cy - wide / 2), wide, wide)
      // A tuft moved up to a tenth of the tile — three pixels of thirty-two,
      // inside the grass sheet's plain border — over the same picture laid
      // straight, so the strip it uncovers is never empty.  Only in a plate:
      // a loose tile is gone in a few frames.
      if (mode === 'plain' && NUDGED.has(id)) {
        const nx = Math.round((hash(ti + 5, tj + 13) - 0.5) * wide * 0.2)
        const ny = Math.round((hash(ti + 17, tj + 3) - 0.5) * wide * 0.2)
        g.drawImage(ground.c, ground.at[id]!, ground.top[id]! + step * ground.cell, ground.cell, ground.cell,
          Math.round(cx - wide / 2) + nx, Math.round(cy - wide / 2) + ny, wide, wide)
      }
      // A plate blends its grounds itself, across the tile rather than a tile
      // at a time, so everything below is for a tile drawn loose.
      if (mode === 'plain') return 1
      // --- and the edge, if this tile is on one ---------------------
      //
      // The tile above is the tile's *middle*.  This asks its four corners,
      // and where they do not agree it lays the higher ground's ring piece
      // over the top.  That is the whole of the dual-grid trick: the
      // boundary now falls on half-tile lines, out of a paint mask that has
      // not gained a byte.
      //
      // Only outdoors, and only where the middle is plain ground: a roof, a
      // wall, a bridge deck and a lake are each one thing all the way
      // across, and asking a roof what its corners are painted is asking
      // the wrong question.
      // And only at the tile's own size.  Past that the ground is already
      // drawing one square where four belong — `grain` — and an edge
      // between two grounds at sixteen pixels is a detail nobody can see,
      // which is the same argument the coarsening itself makes.  It is also
      // what keeps the widest zoom above its floor: the edge pass is a
      // second blit a tile, and at 1,134 tiles that is the difference
      // between 60 frames and 46.
      //
      // **And the client's own blend comes first, where there is one.**  A
      // paint cell now says two words and what share the second has, so an
      // edge that the ring pieces can only put on a half-tile line is laid
      // down as the thing it actually is: the second ground, at the alpha
      // the client painted.  46% of the forest's paint cells carry one.
      //
      // It takes the ring pass's place rather than adding to it — the same
      // one extra blit a tile, so the frame budget is where it was — and
      // the ring pieces still run where the paint says one word and the
      // corners disagree anyway, which is the coarse grid disagreeing with
      // itself.
      let blended = false
      if (grain === 1 && !built && !water) looseEver++
      if (grain === 1 && !built && !water) {
        const mix = blendAt(wx, wy)
        // A nibble's worth is the floor: below one level in fifteen there
        // is nothing to see and the blit is wasted.
        if (mix && mix[1] > 1 / MIX_LEVELS) {
          const other = tileFor(mix[0])
          if (other !== id) {
            g.globalAlpha = Math.min(1, mix[1])
            g.drawImage(ground.c, ground.at[other]!, ground.top[other]! + step * ground.cell, ground.cell, ground.cell,
              Math.round(cx - wide / 2), Math.round(cy - wide / 2), wide, wide)
            g.globalAlpha = 1
            blended = true
            edged++
            // Never reset, because a plate is composed once and a check
            // standing still a second later would see a frame in which no
            // ground was drawn at all.
            blendedEver++
            looseBlendEver++
          }
        }
      }
      if (!blended && grain === 1 && !built && !water
        && ground.at[`${RING['grass']}_n`]) {
        const half = T / 2
        const q = [
          paintAt(wx - half, wy - half), paintAt(wx + half, wy - half),
          paintAt(wx - half, wy + half), paintAt(wx + half, wy + half),
        ]
        if (q[0] !== q[1] || q[1] !== q[2] || q[2] !== q[3]) {
          // The best-ranked of the four that has a set of its own, and the
          // bits saying which corners are its.
          let top = '', rank = 99
          for (const m of q) {
            const r = rankOf(m)
            if (RING[m] && r < rank) { rank = r; top = m }
          }
          const bits = (q[0] === top ? 8 : 0) | (q[1] === top ? 4 : 0)
            | (q[2] === top ? 2 : 0) | (q[3] === top ? 1 : 0)
          const which = PIECE[bits]
          const ringKey = top && which ? `${RING[top]}_${which}` : ''
          const cut = ringKey ? ground.at[ringKey] : undefined
          if (cut !== undefined) {
            g.drawImage(ground.c, cut, ground.top[ringKey]! + step * ground.cell, ground.cell, ground.cell,
              Math.round(cx - wide / 2), Math.round(cy - wide / 2), wide, wide)
            edged++
            blendedEver++
            ringEver++
          }
        }
        // And the shore, which is the boundary this forest has most of and
        // the one it drew worst: a flat square of `dirt2` wherever a tile
        // touched water.  `watergrass.png` is a whole grass-to-water set,
        // already composited, so it is laid down instead of the tile rather
        // than over it — the same sixteen corners, asked of the water mask.
        else if (ground.at['t_shore_n']) {
          const lit = [
            wetAt(wx - half, wy - half) ? 0 : 8,
            wetAt(wx + half, wy - half) ? 0 : 4,
            wetAt(wx - half, wy + half) ? 0 : 2,
            wetAt(wx + half, wy + half) ? 0 : 1,
          ]
          const bits = lit[0]! | lit[1]! | lit[2]! | lit[3]!
          const which = bits === 15 ? null : PIECE[bits]
          const shoreKey = which ? `t_shore_${which}` : ''
          const cut = shoreKey ? ground.at[shoreKey] : undefined
          if (cut !== undefined) {
            g.drawImage(ground.c, cut, ground.top[shoreKey]! + step * ground.cell, ground.cell, ground.cell,
              Math.round(cx - wide / 2), Math.round(cy - wide / 2), wide, wide)
            edged++
            blendedEver++
            ringEver++
          }
        }
      }
      return 1
    }

    /**
     * The plain ground, composed a plate at a time and kept.
     *
     * **The count was never 68,910.**  The issue that asked for this took its
     * numbers from before the grain doubling, which already holds the tile
     * count near four thousand at every zoom.  Measured, what is actually
     * wrong is narrower and worse: at half zoom the grain has not doubled yet
     * and the blend pass is still on, so the ground is **3,900 tiles and 1,392
     * blends every frame — thirty frames a second**, against sixty either side
     * of it.  Taking the blits out and leaving the loop runs at fifty-nine, so
     * it is the blitting and not the arithmetic.
     *
     * A plate is `PLATE` tiles square, composed once and blitted whole.  It is
     * keyed on the tile grid rather than on the client's chunks so that it
     * lines up at every grain, and on the zoom because the tinted strip is.
     * Nothing else invalidates it: the ground's light is the hillside's own
     * and does not move with the hour — the sky is a wash over the top.
     */
    const composePlate = function* (pi: number, pj: number, key: string):
      Generator<void, Plate | null, void> {
      const side = PLATE * UNIT
      const want = Math.ceil(side) ** 2 * 4
      if (side < 1 || want > PLATE_BUDGET) return null
      // Least recently looked at goes first.  Refusing instead — which is what
      // this did at first — means that once a camera has roamed the budget is
      // full of ground nobody is standing on and **no new plate is ever made
      // again**: `viewcheck` teleports around the forest and arrived back at
      // 1,040 loose tiles and not one plate.
      while (plateBytes + want > PLATE_BUDGET && plates.size) {
        let old = ''
        let when = Infinity
        for (const [k, v] of plates) if (v.used < when) { when = v.used; old = k }
        const gone = plates.get(old)!
        plates.delete(old)
        plateBytes -= gone.bytes
        releaseCanvas(gone.c)
      }
      const c = document.createElement('canvas')
      composing = c
      c.width = c.height = Math.ceil(side)
      const g = c.getContext('2d')!
      g.imageSmoothingEnabled = false
      // The plate's own corner in world space, and the screen offset that
      // puts a tile's centre where the tile pass would put it.
      const ox = pi * PLATE, oy = pj * PLATE
      const tpx = UNIT
      const half = tpx / 2
      /**
       * One ground's picture across the plate, or across the tiles `only`
       * lets through.
       *
       * `screenX` falls as world y rises and `screenY` falls as world x rises
       * — north is up the glass and west is left — so **both** indices count
       * backwards inside a plate.  With only one of them reversed the plate
       * lands upside down and the rows that should have been under it stay
       * black, which is what the first screenshot showed: a band of nothing
       * above and below a correct middle.
       */
      const lay = (into: CanvasRenderingContext2D, word: string | undefined,
        family: number | undefined, only?: (a: number, d: number) => boolean) => {
        let n = 0
        for (let a = 0; a < PLATE; a++) {
          for (let d = 0; d < PLATE; d++) {
            if (only && !only(a, d)) continue
            n += paintGround(into, ox + a, oy + d, (PLATE - 1 - d) * tpx + half,
              (PLATE - 1 - a) * tpx + half, null, 'plain', false, word, family)
          }
        }
        return n
      }
      // --- the grounds, blended across a tile and not a tile at a time -----
      //
      // The paint says two words a cell and the second one's share, and this
      // used to lay the second word over the whole tile at that one alpha.
      // That is the client's blend delivered as a mosaic: a road verge came
      // out as a staircase of see-through squares, which is a staircase.
      //
      // A plate is a bitmap, so the share can be what the light already is —
      // a gradient.  Every word here gets its share at every tile centre, a
      // tile of margin all round so the next plate agrees at the seam, and a
      // share is written into a small image and blown up with smoothing on.
      // Each ground is its own pictures across the plate, cut by that image.
      //
      // The first is the ground with most of the plate, laid down whole.  Each
      // one after goes on at *its share of what is down so far* — `c / (sum of
      // the ones laid)` — which is what makes painting one over another come
      // out as a weighted mix rather than as whichever went last.
      const N = PLATE + 2
      const sample = (a: number, d: number) => (PLATE - a) * N + (PLATE - d)
      const smooth01 = (t: number) => {
        const c01 = Math.max(0, Math.min(1, t))
        return c01 * c01 * (3 - 2 * c01)
      }
      const depths = new Float32Array(N * N)
      const shares = new Map<string,
        { word: string; family: number | undefined; got: Float32Array }>()
      const put = (word: string, family: number | undefined, k: number, v: number) => {
        if (v <= 0) return
        const key = `${word}|${family ?? ''}`
        let got = shares.get(key)
        if (!got) {
          got = { word, family, got: new Float32Array(N * N) }
          shares.set(key, got)
        }
        got.got[k] += v
      }
      // Earth and cobble draw from two families of different tone, so their
      // share is split between the families by `toneAt` and the tone changes
      // in patches with a fade instead of tile by tile.
      const give = (kind: string, k: number, v: number, tone: number) => {
        if (kind === 'road' || kind === 'paved') {
          put(kind, 0, k, v * (1 - tone))
          put(kind, 1, k, v * tone)
        } else put(kind, undefined, k, v)
      }
      /**
       * What one painted word comes to here, as shares of kinds of ground.
       *
       * `tileFor` decides with thresholds — steeper than `BARE` is bare earth,
       * a step past `CLIFF` is rock, a field on a slope is not a field — and a
       * threshold decided a tile at a time is a staircase however the paint
       * is blended: the hills came out as squares of dirt in squares of rock.
       * So here each threshold is a ramp a fifth of its own value wide, and
       * what `tileFor` would have picked on either side of it is a share.  The
       * order of the questions is `tileFor`'s: a cliff before a slope, a road
       * or a field only once the ground is too steep to be one.
       */
      const kindsOf = (word: string, bare: number, cliff: number,
        k: number, v: number, tone: number) => {
        if (word === 'paved' || word === 'ash' || word === 'rock' || word === 'sand') {
          give(word, k, v, tone)
        } else if (word === 'road') {
          give('rock', k, v * bare * cliff, tone)
          give('road', k, v * (1 - bare * cliff), tone)
        } else if (word === 'crop') {
          give('crop', k, v * (1 - bare), tone)
          give('rock', k, v * bare * cliff, tone)
          give('road', k, v * bare * (1 - cliff), tone)
        } else {
          give('rock', k, v * cliff, tone)
          give('road', k, v * (1 - cliff) * bare, tone)
          give('grass', k, v * (1 - cliff) * (1 - bare), tone)
        }
      }
      const ramp = (at: number, limit: number) => {
        const t = Math.max(0, Math.min(1, (at - limit) / (limit * 0.2) + 0.5))
        return t * t * (3 - 2 * t)
      }
      for (let a = -1; a <= PLATE; a++) {
        for (let d = -1; d <= PLATE; d++) {
          const wx = (ox + a) * T, wy = (oy + d) * T
          if (outside(wx, wy) || openHole(wx, wy)) continue
          const mix = blendAt(wx, wy)
          const m = mix ? Math.min(1, mix[1]) : 0
          const tone = toneAt(wx, wy)
          const bare = ramp(slopeAt(wx, wy, T), BARE)
          const cliff = ramp(stepAt(wx, wy, T), CLIFF)
          // **Water first, and what it leaves is the ground's.**  Water was a
          // tile laid over the plate every frame, a square a cell, with a
          // grass-to-water piece round the edge that can only sit on the tile
          // grid — so a river was a staircase however the ground beside it
          // blended.  Here it is a share like any other: the wet plane read
          // between its centres and cut at a half with a fade, and a band of
          // wet bank where it is rising towards that half.
          const w = WATER_TILES.length ? wetShare(wx, wy) : 0
          const lake = smooth01((w - 0.35) / 0.3)
          const bank = (1 - lake) * smooth01((w - 0.02) / 0.3)
          const dry = 1 - lake - bank
          depths[sample(a, d)] = lake > 0 ? depthShare(wx, wy) : 0
          if (lake > 0) give('water', sample(a, d), lake, tone)
          if (bank > 0) give('shore', sample(a, d), bank, tone)
          if (lake > 0.5 && a >= 0 && a < PLATE && d >= 0 && d < PLATE) wateredEver++
          kindsOf(paintAt(wx, wy), bare, cliff, sample(a, d), (1 - m) * dry, tone)
          if (mix) kindsOf(mix[0], bare, cliff, sample(a, d), m * dry, tone)
        }
      }
      const order = [...shares.values()]
        .sort((x, y) => LAYING.indexOf(x.word) - LAYING.indexOf(y.word)
          || (x.family ?? 0) - (y.family ?? 0))
      if (order.length) {
        platedEver += lay(g, order[0]!.word, order[0]!.family)
      }
      yield
      if (order.length > 1) {
        if (splatLayer.width !== c.width || splatLayer.height !== c.height) {
          splatLayer.width = c.width
          splatLayer.height = c.height
        }
        if (splatShare.width !== N) splatShare.width = splatShare.height = N
        const lg = splatLayer.getContext('2d', { willReadFrequently: false })!
        const sg = splatShare.getContext('2d')!
        const share = sg.createImageData(N, N)
        const sum = Float32Array.from(order[0]!.got)
        const alpha = (a: number, d: number) => share.data[sample(a, d) * 4 + 3]!
        // The nine centres a tile's own pixels are interpolated between.
        const spread = (a: number, d: number) => {
          let lo = 255, hi = 0
          for (let da = -1; da <= 1; da++) {
            for (let dd = -1; dd <= 1; dd++) {
              const v = alpha(a + da, d + dd)
              if (v < lo) lo = v
              if (v > hi) hi = v
            }
          }
          return [lo, hi] as const
        }
        // A tile is an edge once however many grounds meet on it.
        const edgy = new Uint8Array(PLATE * PLATE)
        for (let k = 1; k < order.length; k++) {
          const { word, family, got } = order[k]!
          let any = false
          for (let i = 0; i < N * N; i++) {
            sum[i] += got[i]!
            const v = sum[i]! > 0 ? got[i]! / sum[i]! : 0
            share.data[i * 4] = share.data[i * 4 + 1] = share.data[i * 4 + 2] = 255
            share.data[i * 4 + 3] = Math.round(255 * v)
            if (share.data[i * 4 + 3]) any = true
          }
          if (!any) continue
          // **Only the pixels this ground reaches.**  A layer is three passes
          // over its canvas — clear it, cut it by the share, lay it down — and
          // a plate at zoom 1.2 is 614 pixels a side with six grounds in it:
          // measured, that was eighteen milliseconds of a twenty millisecond
          // plate, and the ground fell to thirty-two frames a second while a
          // cold view filled.  Most grounds after the first are a road or a
          // patch of the other earth, a corner of the plate, so the passes are
          // clipped to the box of the tiles they touch.
          const reach = new Uint8Array(PLATE * PLATE)
          let aLo = PLATE, aHi = -1, dLo = PLATE, dHi = -1
          for (let a = 0; a < PLATE; a++) {
            for (let d = 0; d < PLATE; d++) {
              if (spread(a, d)[1] === 0) continue
              reach[a * PLATE + d] = 1
              if (a < aLo) aLo = a
              if (a > aHi) aHi = a
              if (d < dLo) dLo = d
              if (d > dHi) dHi = d
            }
          }
          if (aHi < 0) continue
          // A picture is a pixel wider than its tile, so the box is too.
          const pad = Math.ceil(Math.max(0, px * grain - tpx) / 2) + 1
          const bx = Math.max(0, Math.floor((PLATE - 1 - dHi) * tpx) - pad)
          const by = Math.max(0, Math.floor((PLATE - 1 - aHi) * tpx) - pad)
          const bw = Math.min(c.width, Math.ceil((PLATE - dLo) * tpx) + pad) - bx
          const bh = Math.min(c.height, Math.ceil((PLATE - aLo) * tpx) + pad) - by
          lg.globalCompositeOperation = 'source-over'
          lg.imageSmoothingEnabled = false
          lg.save()
          lg.beginPath()
          lg.rect(bx, by, bw, bh)
          lg.clip()
          lg.clearRect(bx, by, bw, bh)
          lay(lg, word, family, (a, d) => reach[a * PLATE + d] === 1)
          sg.putImageData(share, 0, 0)
          // Sample centres land on tile centres: pixel `u` of the share is
          // stretched to `tpx` wide and starts a whole tile off the plate,
          // because the image carries a tile of margin on every side.
          lg.globalCompositeOperation = 'destination-in'
          lg.imageSmoothingEnabled = true
          lg.drawImage(splatShare, -tpx, -tpx, N * tpx, N * tpx)
          // Deeper is darker, laid only on the water that is there.  The
          // depth has been baked a byte a cell since water stopped being a
          // wall and was drawn by nothing: the ford and the lake were the
          // same blue.
          if (word === 'water') {
            const dark = sg.createImageData(N, N)
            for (let i = 0; i < N * N; i++) {
              dark.data[i * 4] = 6
              dark.data[i * 4 + 1] = 30
              dark.data[i * 4 + 2] = 62
              dark.data[i * 4 + 3] = Math.round(255 * 0.55 * smooth01(depths[i]! / DEEP_YARDS))
            }
            sg.putImageData(dark, 0, 0)
            lg.globalCompositeOperation = 'source-atop'
            lg.drawImage(splatShare, -tpx, -tpx, N * tpx, N * tpx)
          }
          lg.restore()
          const seen = splatProbe.on
            ? lg.getImageData(0, 0, splatLayer.width, splatLayer.height).data : null
          for (let a = 0; a < PLATE; a++) {
            for (let d = 0; d < PLATE; d++) {
              const [lo, hi] = spread(a, d)
              if (hi === lo) continue
              if (!edgy[a * PLATE + d]) {
                edgy[a * PLATE + d] = 1
                edged++
                blendedEver++
                plateEdgeEver++
              }
              // Does the share actually change *inside* the tile?  The four
              // quarter points of a tile whose neighbours disagree by a
              // quarter or more must not all read the same — which is what a
              // tile laid at one alpha, or a share blown up without
              // smoothing, would give.
              if (!seen || hi - lo < 64) continue
              const x0 = (PLATE - 1 - d) * tpx, y0 = (PLATE - 1 - a) * tpx
              const q = [0.25, 0.75].flatMap((u) => [0.25, 0.75].map((v) =>
                seen[(Math.floor(y0 + v * tpx) * splatLayer.width
                  + Math.floor(x0 + u * tpx)) * 4 + 3]!))
              const varies = Math.max(...q) - Math.min(...q) >= 4
              splatProbe.edges++
              if (varies) splatProbe.within++
              if (word === 'water') {
                splatProbe.shore++
                if (varies) splatProbe.shoreWithin++
              }
            }
          }
          g.drawImage(splatLayer, bx, by, bw, bh, bx, by, bw, bh)
          yield
        }
      }
      // --- and the light, once, across the whole plate -------------------
      //
      // The hillside's own light is the only thing in this scene that carries
      // height — the projection is flat and a tile does not move for a slope —
      // and it was being delivered in **twenty-one steps**, one a tile.  That
      // is a mosaic: issue 142 measured the picture repeating exactly one tile
      // apart, and the reason 104 tiles of meadow came out as 28 different
      // pictures rather than three was the steps.
      //
      // A plate is a bitmap, so the light can be a *gradient*: one sample a
      // tile into a small canvas, blown up with smoothing on, laid over the
      // plate with `source-atop` so it lands on the ground and not on the
      // holes.  The colours are the wash `tintedGround` already uses, and
      // both ends reach alpha nought at `sl = 0` — so interpolating from lit
      // to shaded passes through no tint at all, which is what it should do.
      {
        const lm = document.createElement('canvas')
        lm.width = lm.height = PLATE + 1
        const lg = lm.getContext('2d')!
        // Written as pixels rather than as 289 `fillRect` calls, which is not
        // a micro-optimisation: two plates a frame at 289 fills apiece took
        // the ground from 60 frames to 54, and the widest zoom to 39.
        const lit = lg.createImageData(PLATE + 1, PLATE + 1)
        for (let a = 0; a <= PLATE; a++) {
          for (let d = 0; d <= PLATE; d++) {
            // The sample is a tile *corner*, half a tile off the centres the
            // tiles are drawn on, which is what makes the upscale line up.
            // Water is flat by definition, so it takes no hillside light —
            // a lit slope on a lake is the giveaway that it is painted on.
            const cxw = (ox + a - 0.5) * T, cyw = (oy + d - 0.5) * T
            const sl = shadeAt(cxw, cyw, T)
              * (1 - (WATER_TILES.length ? smooth01((wetShare(cxw, cyw) - 0.35) / 0.3) : 0))
            const at = ((PLATE - a) * (PLATE + 1) + (PLATE - d)) * 4
            const up = sl > 0
            lit.data[at] = up ? 255 : 8
            lit.data[at + 1] = up ? 247 : 14
            lit.data[at + 2] = up ? 224 : 26
            lit.data[at + 3] = Math.round(255 * (up
              ? (sl / SHADE_HI) * 0.34 : (sl / SHADE_LO) * 0.46))
          }
        }
        lg.putImageData(lit, 0, 0)
        // Straight over, not `source-atop`.  Atop has to read the plate's own
        // alpha for every pixel it touches and that is a quarter of a million
        // of them a plate: measured, it cost four frames a second at the
        // widest zoom, which is where the budget is tightest.  What atop was
        // for is the holes — the cells a plate leaves empty — and those are
        // painted over by the tile pass a moment later anyway.
        g.imageSmoothingEnabled = true
        g.drawImage(lm, -0.5 * tpx, -0.5 * tpx, (PLATE + 1) * tpx, (PLATE + 1) * tpx)
        releaseCanvas(lm)
        g.imageSmoothingEnabled = false
      }
      const made: Plate = { c, used: frames, bytes: c.width * c.height * 4, fresh: true, tile: tpx }
      plateLaid.tile = tpx
      plateLaid.world = TILE * zoom * grain
      plateLaid.picture = px * grain
      plateBytes += made.bytes
      // Evicted again at the end, because a plate composed over several
      // frames may find the budget spent by the ones that finished meanwhile.
      while (plateBytes + made.bytes > PLATE_BUDGET && plates.size) {
        let old = ''
        let when = Infinity
        for (const [k, v] of plates) if (v.used < when) { when = v.used; old = k }
        const gone = plates.get(old)!
        plates.delete(old)
        plateBytes -= gone.bytes
        releaseCanvas(gone.c)
      }
      plates.set(key, made)
      composing = null
      return made
    }
    /**
     * A kept plate, or a slice more of the one being composed and nothing yet.
     */
    const plateOf = (pi: number, pj: number, deadline: number): Plate | null => {
      const key = `${pi},${pj}`
      const had = plates.get(key)
      if (had) { had.used = frames; return had }
      if (platePending && platePending.key !== key) return null
      if (!platePending) {
        if (performance.now() >= deadline) return null
        platePending = { key, pi, pj, ms: 0, run: composePlate(pi, pj, key) }
      }
      const job = platePending
      do {
        const t = performance.now()
        const step = job.run.next()
        job.ms += performance.now() - t
        if (step.done) {
          platePending = null
          if (step.value) plateLaid.ms = job.ms
          return step.value
        }
      } while (performance.now() < deadline)
      return null
    }
    if (indoors) { drawRoom(indoors) }
    else {
      // Plates first, whole, and then the tile pass over them.
      // At every grain, not only the finest: a plate is keyed on the tile grid
      // so it doubles with it.  Restricted to grain one at first, which left
      // the quarter zoom exactly where it was — 3,850 tiles at 37 frames.
      const usePlates = PLATE * px > 8
      // **How many may be composed in one frame.**  A camera that jumps finds
      // every plate missing at once, and composing a dozen of them is three
      // thousand tile draws in a single frame: measured, that took the ground
      // from sixty frames to fifteen — the cost did not go away, it moved into
      // a hitch.  Two a frame spreads it, and the tiles a plate has not
      // reached yet are drawn the old way in the meantime, so nothing is ever
      // missing from the screen.
      //
      // **One**, not two.  A plate is about a millisecond of tile blits and
      // another of light, and two of them is four milliseconds on a frame
      // that has sixteen — which showed up as forty frames a second at the
      // widest zoom, where the cache is coldest and the budget tightest.  One
      // takes twice as many frames to fill the glass and every one of them is
      // inside the refresh rate.
      const deadline = performance.now() + COMPOSE_MS
      // A plate half composed for a patch of ground that has left the view is
      // not worth finishing, and would hold up every plate behind it.
      if (platePending && (platePending.pi < Math.floor(xLo / PLATE)
        || platePending.pi > Math.floor(xHi / PLATE)
        || platePending.pj < Math.floor(yLo / PLATE)
        || platePending.pj > Math.floor(yHi / PLATE))) {
        platePending = null
        releaseCanvas(composing)
        composing = null
      }
      const done = new Set<string>()
      if (usePlates) {
        for (let pi = Math.floor(xLo / PLATE); pi <= Math.floor(xHi / PLATE); pi++) {
          for (let pj = Math.floor(yLo / PLATE); pj <= Math.floor(yHi / PLATE); pj++) {
            const plate = plateOf(pi, pj, deadline)
            if (!plate) continue
            plate.fresh = false
            // The plate's top-left on the glass, which is its *largest* tile
            // index both ways round, less half a tile.
            // and its far edge the same way, so a plate is as wide on the glass
            // as sixteen tiles of the world and the next one starts where it
            // ends.  Stretched by the difference between this zoom and the
            // one it was composed at, which is under a pixel in a hundred.
            const unit = TILE * zoom * grain
            const left = screenX(0, (pj * PLATE + PLATE - 1) * T) - unit / 2
            const top = screenY((pi * PLATE + PLATE - 1) * T, 0) - unit / 2
            const dx = Math.round(left), dy = Math.round(top)
            const dw = Math.round(left + PLATE * unit) - dx
            const dh = Math.round(top + PLATE * unit) - dy
            const sw = Math.round(PLATE * UNIT)
            if (dw === sw && dh === sw) ctx.drawImage(plate.c, dx, dy)
            else ctx.drawImage(plate.c, 0, 0, sw, sw, dx, dy, dw, dh)
            done.add(`${pi},${pj}`)
            platesDrawn++
          }
        }
      }
      // **Who is under what, before anything is painted.**
      //
      // This used to be one loop: ask `inBuilding`, write the answer down,
      // paint.  A building is drawn as one piece now (issue 216), and to know
      // whether a tile is *inside* a footprint or on the fringe of it you need
      // its four neighbours — which the painting loop did not have yet for the
      // tile one step north.  So the asking and the painting are two passes
      // over the same box, and the expensive half, `inBuilding`, still runs
      // once a tile: the whole answer is kept rather than only which building.
      for (let ti = xLo; ti <= xHi; ti++) {
        for (let tj = yLo; tj <= yHi; tj++) {
          const wx = ti * T, wy = tj * T
          const cx = screenX(wx, wy), cy = screenY(wx, wy)
          const edge = px * grain
          if (cx < -edge || cx > canvas.width + edge
            || cy < -edge || cy > canvas.height + edge) continue
          // Asked at the tile's own width, which is the same question the
          // paint asks, so it is asked once.
          const covers = inBuilding(wx, wy, T)
          if (covers) {
            under[(ti - xLo) * (yHi - yLo + 1) + (tj - yLo)] = covers
            if (covers.b.plan) standing.add(covers.b)
          }
        }
      }
      for (let ti = xLo; ti <= xHi; ti++) {
        for (let tj = yLo; tj <= yHi; tj++) {
          const wx = ti * T, wy = tj * T
          const cx = screenX(wx, wy), cy = screenY(wx, wy)
          const edge = px * grain
          if (cx < -edge || cx > canvas.width + edge
            || cy < -edge || cy > canvas.height + edge) continue
          tilesInView++
          const covers = coverOf(ti, tj)
          const b = covers?.b
          // A building with a plan is drawn in one piece, in its own axes.
          // Inside its footprint there is nothing for this loop to do at all —
          // **the tile is not drawn**, which is where the cost of the new pass
          // comes from: the abbey is two thousand blits this loop no longer
          // makes.  On the fringe the ground is drawn as ordinary ground,
          // because the true outline cuts across the tile and what is outside
          // it has to be somewhere to stand.
          if (b?.plan && !indoors) {
            if (roofOf(ti + 1, tj) === b && roofOf(ti - 1, tj) === b
              && roofOf(ti, tj + 1) === b && roofOf(ti, tj - 1) === b) continue
          }
          const on = done.has(`${Math.floor(ti / PLATE)},${Math.floor(tj / PLATE)}`)
          tilesDrawn += paintGround(ctx, ti, tj, cx, cy, covers,
            on ? 'over' : 'all', !!b?.plan && !indoors)
        }
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    // --- a crossing, drawn once, in the axes it lies in -------------------
    //
    // A deck was a tile laid on every 1.33 yard square of the world its
    // rectangle covered, which is the building's mistake over again: the
    // Northshire crossing lies at 45 degrees, so both of its long sides came
    // out as staircases of planks with water in every notch, and the two
    // that lie nearly north-south were ragged at the ends.  The rectangle has
    // been the bake's since the boxes were turned back — `lo` and `hi` along
    // it, `w` either side, `c` and `s` the way it lies — so it is drawn as
    // that rectangle, under the same transform the roofs use, filled with the
    // planks one picture a tile and running along it.
    //
    // Three things from the one rectangle, as a building has: a shadow on the
    // glass rather than in the deck's axes, because the sun does not turn
    // with the bridge; the planks; and a dark rail down each long side, which
    // is what says where the edge of something you can fall off is.
    decksDrawn = 0
    if (!indoors) {
      const kk = k()
      const tile = YD_PER_TILE
      const lift = Math.max(1, Math.round(px * grain * 0.35))
      for (const b of spans) {
        const Ox = screenX(b.x, b.y), Oy = screenY(b.x, b.y)
        const reach = (Math.max(-b.lo, b.hi) + b.w) * kk
        if (Ox < -reach || Ox > canvas.width + reach
          || Oy < -reach || Oy > canvas.height + reach) continue
        // In tile units along and across the deck.  `screenX` falls as world
        // y rises and `screenY` as world x rises, which is the same pair of
        // flips the roofs carry, so this is their matrix at a tile's scale.
        const a = -kk * b.s * tile, bb = -kk * b.c * tile
        const c = -kk * b.c * tile, d = kk * b.s * tile
        const x0 = b.lo / tile, y0 = -b.w / tile
        const along = (b.hi - b.lo) / tile, across = (2 * b.w) / tile
        ctx.setTransform(a, bb, c, d, Ox + lift, Oy + lift)
        ctx.fillStyle = 'rgba(8, 12, 16, 0.30)'
        ctx.fillRect(x0, y0, along, across)
        ctx.setTransform(a, bb, c, d, Ox, Oy)
        // One picture for a wooden deck, with its planks along the pattern's
        // own x, which is along the deck: the second picture only existed to
        // turn the planks for a deck lying north-south on the world's grid.
        const pat = roofPattern(b.tile === 'stone' ? 'stone' : 'bridge', 0, px)
        if (pat) {
          ctx.fillStyle = pat
          ctx.fillRect(x0, y0, along, across)
        }
        ctx.fillStyle = 'rgba(40, 24, 12, 0.9)'
        const rail = 0.12
        ctx.fillRect(x0, y0, along, rail)
        ctx.fillRect(x0, y0 + across - rail, along, rail)
        decksDrawn++
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
    }

    // --- a building, drawn once, in the axes it was built in --------------
    //
    // Issue 216.  A roof used to be stamped on every 1.33 yard square of the
    // *world* a footprint covered, and the world's grid is not the building's:
    // Northshire's abbey stands at 158.5 degrees, so all four of its walls
    // came out as staircases and no finer tile would have helped.
    //
    // What is drawn instead is the plan's own outline — `planPath`, a few
    // hundred rectangles in cell units — filled with the roof as a repeating
    // pattern, under a transform that takes the model's axes to the glass.
    // The walls are straight because in model space they *are* straight, and
    // the turn happens to the whole shape at once.
    //
    // The transform is `planCell` read backwards.  That function takes
    // `(u, v) = (wx - bx, -(wy - by))` to `lx = u*sn + v*c`, `ly = u*c - v*sn`
    // — a matrix that is its own inverse — and the screen puts `X` on `-wy` and
    // `Y` on `-wx`, so a cell `(i, j)` lands at
    //
    //   dX =  k*s*( c*i - sn*j),   dY = k*s*(-sn*i - c*j)
    //
    // about the building's own centre, plus the `(x0, y0)` the plan is cut
    // from.  Its determinant is negative, which is right and is the thing to
    // remember: two axis flips and a turn is a *reflection*, not a rotation,
    // and `ctx.rotate` cannot express it.
    //
    // Three things are drawn from the one path: the drop shadow, offset down
    // and to the right in screen space because the light is north-west; the
    // roof; and the edge.  That is three fills a building where it used to be
    // one blit a tile plus four line segments a tile.
    frontsDrawn = 0
    if (!indoors) {
      shaded = 0
      outlined = 0
      ctx.save()
      const kk = k()
      const wide = px * grain
      /**
       * **A frame may turn one screenful of roof and no more.**
       *
       * A turned `drawImage` costs its *destination* area, and at Goldshire —
       * the one view in this world that is nine parts roof — fifteen of them
       * came to sixty frames a second becoming forty-six.  The budget is the
       * glass itself rather than a number: one screenful is what a frame can
       * afford to turn, it follows the viewport instead of being typed, and
       * what it means is *no view may pay for more roof than it can show*.
       *
       * Spent nearest first, so what loses the kit is the building furthest
       * away — which at any zoom is the one whose courses of shingle are
       * smallest on the glass.  It keeps the flat fill, which is what every
       * building had a day ago.
       */
      let turnable = canvas.width * canvas.height
      const near = [...standing].sort((u, v) =>
        ((u.x - camX) ** 2 + (u.y - camY) ** 2)
        - ((v.x - camX) ** 2 + (v.y - camY) ** 2))
      for (const b of near) {
        const p = b.plan!
        const { path, cells } = planPath(p)
        const Ox = screenX(b.x, b.y), Oy = screenY(b.x, b.y)
        const q = kk * p.s
        const a = q * p.c, bb = -q * p.sn, c = -q * p.sn, d = -q * p.c
        // The plan's own corner, in cells, folded into the offset so the path
        // can be drawn at the origin.
        const i0 = p.x0 / p.s, j0 = p.y0 / p.s
        const e = Ox + a * i0 + c * j0, f = Oy + bb * i0 + d * j0
        // The shadow: the same shape, one tile down and to the right on the
        // glass.  On the glass and not in the model's axes, because the sun
        // does not turn with the building.
        ctx.setTransform(a, bb, c, d, e + wide, f + wide)
        ctx.fillStyle = 'rgba(8, 12, 16, 0.30)'
        ctx.fill(path)
        shaded++
        ctx.setTransform(a, bb, c, d, e, f)
        const id = ROOF_OF[b.k] ?? ROOF_TILE
        const step0 = shadeRow(shadeAt(b.x, b.y))
        // **Which boxes this frame can afford to turn, decided before the
        // fill under them is chosen.**  A building whose roof is drawn gets a
        // flat colour under it, because the roof covers it; one whose roof is
        // not — three of this world's forty-three have no part box the kit
        // fits, and any of them can lose it to the frame's budget — keeps the
        // repeating picture, because there the fill *is* the roof.  Choosing
        // the fill first left a building at the wrong end of the budget as one
        // flat colour with nothing on it.
        const kit = roofedBoxes(b, p)
        const boxes = []
        for (const box of kit.boxes) {
          const cost = box.n * box.m * (YD_PER_TILE * kk) ** 2
          if (cost > turnable) continue
          turnable -= cost
          boxes.push(box)
        }
        const pat = boxes.length && kit.covered > 0.8
          ? roofInk(id, shadeAt(b.x, b.y), px)
          : roofPattern(id, shadeAt(b.x, b.y), px)
        if (pat) {
          ctx.fillStyle = pat
          ctx.fill(path)
          /**
           * And the roof's own shape over the top of it — issue 217.
           *
           * The flat fill says *there is a roof here* and nothing else: no
           * ridge, no eaves, nothing that says which way the slope runs.  The
           * roofs pack this repository already credits ships a **kit** for
           * that — ten colours, each a five by six block laid out as one
           * gabled roof, whose middle column-pair and middle row-pair tile —
           * and `roofs.png` had never been opened here.  Only the pack's
           * preview had, for the one flat square.
           *
           * It is laid **per part**, out of the boxes the model's own `MOGI`
           * groups state, because a roof is a thing with a ridge and a
           * footprint is not: the abbey is a nave, two transepts and a tower,
           * and one ridge over all four is a tent.  Each box gets the kit
           * nine-sliced over it in *its* axes, with the ridge along its longer
           * side, and the whole lot is clipped to the outline so a box that
           * overhangs the footprint does not roof the garden.
           *
           * Boxes that are not mostly inside the outline are skipped, and the
           * reason is issue 218's finding: `MOGI` groups include the grounds
           * and the yard walls, so the abbey's own list has boxes that are
           * ninety yards of field.
           */
          ctx.save()
          ctx.clip(path)
          for (const { r, n, m, swap } of boxes) {
            const sheet = roofSheet(id, step0, px, n, m, swap)
            if (!sheet) continue
            // **One turned blit and not `n * m` of them.**  A rotated
            // `drawImage` is several times the cost of a straight one, and the
            // first version of this laid the kit cell by cell under the box's
            // transform: **fifteen frames a second** at Goldshire, where the
            // whole point of drawing a building in one piece was that it got
            // cheaper.  The roof is composed once into its own canvas — keyed
            // on the *shape* rather than the placement, so the thirteen farms
            // in this world are one canvas — and the frame turns that.
            const Ox = screenX(r.x, r.y), Oy = screenY(r.x, r.y)
            ctx.setTransform(-kk * r.s, -kk * r.c, -kk * r.c, kk * r.s, Ox, Oy)
            ctx.drawImage(sheet, -r.l, -r.w, n * YD_PER_TILE, m * YD_PER_TILE)
          }
          ctx.restore()
          ctx.setTransform(a, bb, c, d, e, f)
          // What a building's outline got painted with, which `viewcheck`
          // reads.  One fill and not two thousand blits, so it is counted as
          // the cells it covers — the same number the tile pass used to
          // report, off the same mask.
          indoorPaint.set(id, (indoorPaint.get(id) ?? 0) + cells)
        }
        ctx.strokeStyle = 'rgba(22, 18, 14, 0.85)'
        // In model-cell units, because the path is: one screen pixel is
        // `1 / q` of a cell.
        ctx.lineWidth = Math.max(1, Math.round(zoom)) / q
        ctx.stroke(path)
        outlined++
        // --- and its front doors, where the client put them --------------
        //
        // A roof seen from above says nothing about where you get in, and the
        // player walked round every cottage looking for it.  At each front door
        // the opening is drawn as what it is from up here: a gap in the eaves
        // as wide as the portal, running from the door out to the edge of the
        // roof, floored with the room's own floor and framed by the jambs.
        for (const q of porchesOf(b)) {
          const t = YD_PER_TILE
          ctx.setTransform(-kk * q.uy * t, -kk * q.ux * t, -kk * q.ux * t, kk * q.uy * t,
            screenX(q.ax, q.ay), screenY(q.ax, q.ay))
          const along = q.len / t, side = q.width / 2 / t
          const floor = roofPattern('in_floor', 0, px)
          ctx.fillStyle = floor ?? 'rgb(96, 82, 64)'
          ctx.fillRect(0, -side, along, 2 * side)
          // In shadow, because it is under the eaves: laid bare the room's
          // floor read as a pale slab, which from above is a pond.
          ctx.fillStyle = 'rgba(12, 10, 8, 0.45)'
          ctx.fillRect(0, -side, along, 2 * side)
          ctx.fillStyle = 'rgba(22, 18, 14, 0.9)'
          const jamb = 0.16
          ctx.fillRect(0, -side - jamb, along, jamb)
          ctx.fillRect(0, side, along, jamb)
          frontsDrawn++
        }
        ctx.setTransform(a, bb, c, d, e, f)
      }
      ctx.restore()
    }

    // --- the doors, on the roofs they are cut into ----------------------
    //
    // A closed building needs somewhere visible to go in, or it is a wall
    // with a secret.  The client drew the doors and the bake now carries
    // them; this is the only thing that says so from out here.  Drawn on the
    // ground pass rather than among the scenery because a doorway is a hole
    // in a roof and not a thing standing on it.
    if (!indoors) {
      for (const b of buildings) {
        if (!b.doors.length) continue
        for (const [dx, dy] of b.doors) {
          const X = screenX(dx, dy), Y = screenY(dx, dy)
          if (X < -40 || X > canvas.width + 40 || Y < -40 || Y > canvas.height + 40) continue
          const w = Math.max(6, 2.2 * PPY * zoom), h = Math.max(5, 1.6 * PPY * zoom)
          const x0 = Math.round(X - w / 2), y0 = Math.round(Y - h / 2)
          const dw = Math.round(w), dh = Math.round(h)
          /**
           * A doorway is a **hole in a roof with the floor showing through
           * it**, and that is what it is drawn as now.
           *
           * It was a dark rectangle with a gold line round it, which is within
           * a shade of the one other thing this game paints as a dark
           * rectangle: `openHole`, the mouth of a mine, at `#0a0a0f`.  Eight
           * doorways on the abbey, all of them correctly placed by the client's
           * own portals, and every one of them read as somewhere to fall into.
           *
           * The floor is the building's own — `in_floor`, the same tile
           * `drawRoom` lays once you are inside — taken at the darkest shade,
           * because what you are looking at through the gap is a room with a
           * roof over it.  Nothing is drawn here that is not already cut: the
           * doorway is the floor tile, the roof around it, and a line of the
           * roof's own shadow for a lintel.
           */
          // The building's **own** floor, which is the one `drawRoom` lays
          // once you have walked in: a doorway that shows a different floor
          // from the room behind it is a doorway into somewhere else.
          const inside = (INDOOR_FLOOR[b.k] ?? INDOOR_FLOOR['hall'])?.(0.5)
          const floorKey = ground.at[inside ?? ''] !== undefined ? inside ?? '' : FLOOR_TILE
          const floor = ground.at[floorKey]
          if (floor !== undefined) {
            ctx.drawImage(ground.c, floor, ground.top[floorKey] ?? 0, ground.cell, ground.cell,
              x0, y0, dw, dh)
          } else {
            ctx.fillStyle = '#2a2119'
            ctx.fillRect(x0, y0, dw, dh)
          }
          // The jamb: the roof's own dark edge, thicker at the head than at
          // the sides, which is what a doorway seen from above has.
          ctx.strokeStyle = 'rgba(18, 14, 10, 0.9)'
          ctx.lineWidth = Math.max(1, Math.round(zoom))
          ctx.strokeRect(x0 + 0.5, y0 + 0.5, dw - 1, dh - 1)
          ctx.fillStyle = 'rgba(18, 14, 10, 0.55)'
          ctx.fillRect(x0, y0, dw, Math.max(1, Math.round(dh * 0.22)))
        }
      }
    }

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
      const arm = armFor(gear['weapon'])
      const held = arm ? heroMeta.arms?.[arm] : undefined
      /**
       * Which pose he is in, and which of three questions decides it.
       *
       * Walking wins over swinging, which is the one judgement here.  A swing
       * lands every `SWING` milliseconds and the next one starts the instant
       * it ends, so in melee he is *always* mid-swing — let that win and a
       * player who backs out of a fight slides across the grass in an attack
       * pose with his legs still.  The original cancels the attack animation
       * on movement for the same reason.
       *
       * The swing itself is the weapon's, not the body's: LPC gives
       * `magic/gnarled` a thrust and no slash, because a pole is pushed rather
       * than swung, and it is the thing in the hand that knows which.
       */
      const swinging = clock * 1000 < you.swung + you.line[SWING]!
      const want = hero.moving ? 'walk'
        : swinging ? (held?.swing ?? heroMeta.bare ?? 'slash')
          : 'idle'
      const clip = (heroMeta.clips[want] ?? heroMeta.clips['idle'])!
      const n = clip.count
      /**
       * And where in it.
       *
       * A swing runs once over the swing's own length, so the motion *is* the
       * weapon speed: a 2.9 second greatsword takes 2.9 seconds to come down
       * and a dagger does not.  Twenty-four cells of `slash` were cut and
       * nothing read them at all, which is the third time this repository has
       * shipped a column nobody consults — `tint` (issue 118) and `I_QUALITY`
       * (issue 157) were the other two.
       */
      const f = want === 'walk' ? Math.floor(hero.t * 10) % n
        : want === 'idle' ? Math.floor(hero.t * 2) % n
          : Math.min(n - 1, Math.floor(
            ((clock * 1000 - you.swung) / you.line[SWING]!) * n))
      const idx = clip.first + hero.dir * n + f
      const c = heroMeta.cell
      // A row of the atlas is not a cell.  The sheet is cropped to the man —
      // fourteen rows of nothing over his head on every one of a hundred
      // frames was 0.33 MiB of a 24 MiB budget — and `body.top` is the offset
      // back.  Every other number in this file stays against the 64 cell,
      // which is what `cell` still is.
      const rowH = heroMeta.row ?? c
      const lid = heroMeta.body?.top ?? 0
      const sxp = (idx % heroMeta.cols) * c
      const syp = Math.floor(idx / heroMeta.cols) * rowH
      const w = c * zoom
      // Shoved out of his own square by whatever last hit him, and not far
      // enough to move where he *is*: the shadow stays put under the square
      // he is standing on, because a man rocked back on his heels has not
      // gone anywhere.
      const off = knock(you)
      const X = Math.round(screenX(hero.ix + (off?.[0] ?? 0),
        hero.iy + (off?.[1] ?? 0)) - w / 2)
      const Y = Math.round(screenY(hero.ix + (off?.[0] ?? 0),
        hero.iy + (off?.[1] ?? 0)) - w * 0.82)
      /**
       * How much of him the water covers, which is the whole swim animation.
       *
       * There is no swim clip and there will not be one: LPC has no swim sheet
       * for the layers this body is built from, and the one thing that reads
       * unmistakably as swimming is that only his top half is showing.  So the
       * picture is cut at the waterline and the sprite below it is not drawn —
       * geometry over the art there is, the same answer the flinch got in
       * issue 175.
       *
       * **Both ends of the mapping are measured and neither is a fraction of
       * the cell.**  The bottom is dry land.  The top is the swimming line —
       * the server's three quarters of a collision box — drawn at his chin,
       * because that is where a swimming man's waterline is.  And his chin is
       * `bake_sprites.py`'s measurement of the art rather than a share of his
       * height: LPC draws him chibi, head two fifths of him, so the depth read
       * straight against a real body put the water over his mouth while he was
       * still standing on the bed.  His feet and his chin are both rows of the
       * sheet, counted once at bake time.
       */
      const shape = heroMeta.body
      const chin = shape?.chin ?? 0.55
      const under = Math.min(1, depthAt(hero.x, hero.y) / SWIM_DEPTH) * chin
      if (under > 0 && shape) {
        ctx.save()
        const sole = Y + shape.bottom * zoom
        const line = sole - under * (shape.bottom - shape.top) * zoom
        ctx.beginPath()
        ctx.rect(X - w, Y - w, w * 3, line - (Y - w))
        ctx.clip()
      }
      shadow(hero.ix, hero.iy, 0.34)
      // The cast, gathering on the ground round him — the prototype's
      // `drawCasts`: a dashed ring closing in from a way out to the edge of
      // him as the cast completes, and a dial filling clockwise from noon.
      // Under him, because it is on the floor, and in the colour of the
      // school the spell belongs to.
      if (you.casting) {
        const c0 = you.casting
        const done = Math.max(0, Math.min(1, (clock + between * STEP - c0.began)
          / Math.max(0.001, c0.until - c0.began)))
        const colour = schoolColour(c0.sp.school)
        const cx = screenX(hero.ix, hero.iy), cy = screenY(hero.ix, hero.iy)
        const base = Math.max(4, 0.5 * PPY * zoom)
        ctx.save()
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.arc(cx, cy, base + (1 - done) * 1.4 * PPY * zoom, 0, Math.PI * 2)
        ctx.strokeStyle = rgbaOf(colour, 0.2 + 0.5 * done)
        ctx.lineWidth = Math.max(1, 2 * zoom)
        ctx.setLineDash([5, 6])
        ctx.lineDashOffset = -done * 40
        ctx.stroke()
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.arc(cx, cy, base + 5 * zoom, -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * done)
        ctx.strokeStyle = rgbaOf(colour, 0.9)
        ctx.lineWidth = Math.max(1.5, 3 * zoom)
        ctx.stroke()
        ctx.restore()
        castShown.ring = clock
      }
      // What is in his hand, in two halves either side of him — the same
      // arrangement everybody else in the world already had.  A weapon has no
      // idle of its own, so standing still it takes the pose LPC puts at frame
      // 0 of the walk, which is the standing one.
      const armClip = want === 'idle' ? 'walk' : want
      const armAt = want === 'idle' ? 0 : f
      played.add(`hero:${want}`)
      heroPose = { clip: want, frame: f, count: n }
      if (arm && heroMeta.arms?.[arm]?.clips[armClip]) {
        played.add(`arms:${arm}:${armClip}`)
      }
      heroLayers = 1
      heroSheets.length = 0
      drawArm(arm, armClip, 'behind', armAt, X, Y, w / c)
      ctx.drawImage(heroImg, sxp, syp, c, rowH,
        X, Math.round(Y + lid * zoom), Math.ceil(w), Math.ceil(rowH * zoom))
      // What he is wearing over his chest, on the **body's** clip and frame
      // rather than the weapon's: a hairstyle borrows the walk's first frame
      // while standing because a weapon has no idle, and a cuirass drawn that
      // way would sit a breath out of step with the chest under it.
      // `drawLook` records each one that lands in `heroSheets` itself.
      for (const key of wearingNow()) drawLook(key, want, f, X, Y, w / c)
      // What he chose to look like, over the body and under what he is
      // holding: a beard is on the face and hair is over the head, and a
      // sword swings in front of both.
      drawLook(me?.beard ? `beard-${me.beard}` : null, armClip, armAt, X, Y, w / c)
      drawLook(`hair-${me?.hair ?? 'plain'}`, armClip, armAt, X, Y, w / c)
      drawArm(arm, armClip, 'front', armAt, X, Y, w / c)
      if (under > 0 && shape) ctx.restore()
      drawn++
    }

    /**
     * One strip laid over the body, at the body's own scale.
     *
     * A weapon half and a hairstyle are the same thing to this function: a
     * box trimmed out of a 64-pixel cell, carrying the offset back to it.  It
     * was two functions for one frame and the second was a copy of the first.
     */
    const drawStrip = (img: HTMLImageElement | null,
      a: { w: number; h: number; dx: number; dy: number; cols: number
           x?: number; y: number } | undefined,
      f: number, X: number, Y: number, k: number) => {
      if (!a || !img || !img.complete || !img.naturalWidth) return false
      ctx.drawImage(img, (a.x ?? 0) + (f % a.cols) * a.w, a.y + hero.dir * a.h,
        a.w, a.h,
        Math.round(X + a.dx * k), Math.round(Y + a.dy * k),
        Math.ceil(a.w * k), Math.ceil(a.h * k))
      heroLayers++
      return true
    }
    /** One half of what he is holding. */
    const drawArm = (word: string | null, clip: string, half: string,
      f: number, X: number, Y: number, k: number) => {
      if (drawStrip(word ? armSheet(word) : null,
        word ? heroMeta.arms?.[word]?.clips[clip]?.[half] : undefined,
        f, X, Y, k)) heroSheets.push(`${word}:${half}`)
    }
    /** And one of the things he chose to look like — see `LOOKS`. */
    const drawLook = (key: string | null, clip: string,
      f: number, X: number, Y: number, k: number) => {
      if (drawStrip(key ? lookSheet(key) : null,
        key ? heroMeta.looks?.[key]?.clips[clip] : undefined, f, X, Y, k)) {
        heroSheets.push(key!)
      }
    }
    /**
     * How far a body is shoved out of its own square by a blow, in yards.
     *
     * **There is no hit pose and that is a measurement rather than an
     * oversight.**  LPC draws `hurt` as six frames facing *down* — one
     * direction of four — and the animal packs this world's beasts are cut
     * from have no hurt row at all, so not one of the forty-eight kinds here
     * has a flinch to play.  Baking a fifth of a hit animation would put a
     * wolf face-on to the camera every time it was struck.
     *
     * So the flinch is motion over the art there is, which costs no sheet: a
     * body is shoved away from whatever hit it and eases straight back.  How
     * far is **the size of the blow** — a hit that takes a third of you moves
     * you three times as far as one that takes a ninth — because a knockback
     * that is the same for every blow says nothing, and this one says how
     * badly that went.  Half a yard is the cap, which is a body's width.
     *
     * `HURT_SECONDS` is four of the world's own fifty-millisecond steps, and
     * the thing that makes it the right length is that it is over before
     * anything in this slice can swing again: the quickest weapon here is
     * 1,300 ms.  `viewcheck` asserts that rather than trusting it.
     */
    const knock = (n: { hurt: number; knock: [number, number, number] | null }) => {
      if (!n.knock || clock - n.hurt > HURT_SECONDS) return null
      const t = (clock - n.hurt) / HURT_SECONDS
      // Out fast and back slowly, which is what being hit looks like.
      const far = Math.sin(t * Math.PI) * Math.min(0.5, n.knock[0] * 1.5)
      return [n.knock[1] * far, n.knock[2] * far] as [number, number]
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
      const idx = n.dir * a.frames + f
      const c = npcArt.cell
      const sxp = idx * c, syp = a.y
      const w = c * zoom
      // Sized off the art, like the prompt over their head: a chicken casts a
      // chicken's worth of shade.
      shadow(n.ix, n.iy, Math.max(0.3, (a.yards ?? 0.9) * 0.34))
      // The dead lie there and thin out, and come back in half a minute.
      const fade = n.dead ? Math.max(0.15, 1 - (clock - n.dead) / 6) : 1
      if (n.alpha * fade < 1) ctx.globalAlpha = n.alpha * fade
      // Shoved back by a blow, or leaning into one of its own.
      //
      // The lunge is the same mechanism as the flinch and the same reason for
      // it: 48 kinds are cut from walk frames and none of them has an attack
      // pose, so a creature that could only stand or walk stood perfectly
      // still while it killed you.  It leans a fifth of a yard at whatever it
      // is angry with over the first tenth of its swing and comes back.
      const hurtBy = knock(n)
      const lean = n.swung > 0 && clock - n.swung < HURT_SECONDS
        ? Math.sin(((clock - n.swung) / HURT_SECONDS) * Math.PI) * 0.2 : 0
      const toward = lean
        ? Math.hypot(hero.x - n.x, hero.y - n.y) || 1 : 1
      const ox = (hurtBy?.[0] ?? 0) + (lean ? ((hero.x - n.x) / toward) * lean : 0)
      const oy = (hurtBy?.[1] ?? 0) + (lean ? ((hero.y - n.y) / toward) * lean : 0)
      const X = Math.round(screenX(n.ix + ox, n.iy + oy) - w / 2)
      const Y = Math.round(screenY(n.ix + ox, n.iy + oy) - w * npcArt.anchor)
      // What is in the hand, in two halves either side of the body.
      //
      // `creature_equip_template` says 934 of this slice's spawns hold
      // something and every one of them stood barehanded.  The weapon rides
      // the person's own grid frame for frame — LPC draws it for the body it
      // goes on — so the only arithmetic is which cell, and it is the same
      // arithmetic twice.  The halves are not two versions of one picture:
      // over the four facings the longsword's front sheet holds 1,325 opaque
      // pixels and the behind sheet 5,730, they overlap in nought, and facing
      // away from the camera the front sheet is empty.
      const arm = n.arm ? npcArt.kinds[n.arm] : undefined
      const armBg = n.arm ? npcArt.kinds[`${n.arm}.bg`] : undefined
      const layer = (k: Frames | undefined) => {
        if (!k) return
        const i = n.dir * k.frames + f
        ctx.drawImage(npcImg, i * c, k.y, c, k.rows,
          X, Y + Math.round(k.top * zoom), Math.ceil(w),
          Math.ceil(k.rows * zoom))
      }
      layer(armBg)
      ctx.drawImage(npcImg, sxp, syp, c, a.rows,
        X, Y + Math.round(a.top * zoom), Math.ceil(w),
        Math.ceil(a.rows * zoom))
      layer(arm)
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
    hidden.length = 0
    for (const n of active) {
      const X = screenX(n.x, n.y), Y = screenY(n.x, n.y)
      if (X < -margin || X > canvas.width + margin || Y < -margin || Y > canvas.height + margin) continue
      // Under somebody else's roof.  The abbey has a dozen people in it and
      // they were drawn on top of it — a row of monks standing on the tiles,
      // which reads as a crowd on the roof rather than a crowd indoors.  The
      // roof is drawn for the same reason: you are not in there.
      // Indoors the room is the world, so everybody outside it is out of
      // sight; outdoors it is the other way round.  Before, an outdoor scene
      // hid whoever was under a roof and an indoor one showed the whole
      // forest through the walls.
      // A kobold in a mine is in the mine, and the mine is not a WMO so
      // `inRoom` cannot see it.  Without this the whole of Ant'hill stood on
      // the hillside above itself.
      const seen = sightOf(n)
      if (indoors && seen.roof === indoors && seen.up === storey) {
        indoorFolk.push([n.x, n.y, seen.up, n.kind])
      }
      if (seen.why) {
        hidden.push({ x: n.x, y: n.y, kind: n.kind, why: seen.why })
        continue
      }
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
          // The same two-way test the people get: a room holds its own
          // furniture and nothing else, and a field holds everything that is
          // not in a room.
          // **And which floor of it** — issue 221.  This asked only *whose
          // building*, so the abbey's ground-floor barrels stood on the
          // gallery above them at every storey the player climbed to.  A
          // building with one floor answers `-1` either way, which is what
          // `storey` is on the ground.
          if (indoors
            ? (o.in !== indoors || (o.storey ?? -1) !== storey)
            : !!o.in) continue
          // What got through, when there is a floor to be on.  Kept so a check
          // can ask *what is on screen* rather than re-deriving the rule it is
          // checking — the mistake `viewcheck` has paid for more than once.
          if (indoors) indoorProps.push([o.x, o.y, o.storey ?? -1])
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
    if (light.tint < 1 && !indoors) {
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
    // And no sky at all under a roof: rain does not fall indoors and the sun
    // does not set in a nave.
    if (indoors) { sparks = 0 }
    else if (light.tint >= 0.55) sparks = 0
    if (light.tint < 0.55 && !indoors) {
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
    if (sky !== CLEAR && !indoors) {
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

    // What is in the air, and where it has just landed — the prototype's
    // `drawProjectiles` and its bursts.  Over the scenery for the same reason
    // the numbers are: a bolt behind a tree is not a bolt.
    {
      const at = clock + between * STEP
      // Flying at chest height rather than along the ground, from the
      // thrower's chest to the target's: a position here is a point on the
      // ground, and a bolt aimed at one arrives between somebody's ankles.
      // How far along it is comes from the two distances, because both ends
      // walk about while it is in the air.
      //
      // The chest is three fifths of the way down the figure, not two: LPC
      // draws people chibi with the head two fifths of them, so two fifths down
      // is the chin and a fireball thrown from there left from his face.
      const chestOf = (who: Npc | null) => who
        ? (headOf[who.art] ?? 40) * 0.45 * zoom
        : (heroMeta.cell * 0.82 - (heroMeta.body
          ? heroMeta.body.top + (heroMeta.body.bottom - heroMeta.body.top) * 0.6
          : heroMeta.cell * 0.5)) * zoom
      ctx.lineCap = 'round'
      for (const f of flights) {
        const style = FLIGHT[f.kind]
        const ox = f.from ? f.from.ix : hero.ix, oy = f.from ? f.from.iy : hero.iy
        const tx = f.to ? f.to.ix : hero.ix, ty = f.to ? f.to.iy : hero.iy
        const gone = Math.hypot(f.ix - ox, f.iy - oy)
        const left = Math.hypot(tx - f.ix, ty - f.iy)
        const along = gone + left > 0.01 ? gone / (gone + left) : 1
        const lands = chestOf(f.to)
        const lift = chestOf(f.from) + (lands - chestOf(f.from)) * along
        const x = screenX(f.ix, f.iy), y = screenY(f.ix, f.iy) - lift
        f.lift = lift
        const r = Math.max(2, style.radius * PPY * zoom)
        // The trail behind it, thinning and fading toward where it came from.
        for (let i = 1; i < f.trail.length; i++) {
          const [ax, ay] = f.trail[i - 1]!, [bx, by] = f.trail[i]!
          const fade = i / f.trail.length
          ctx.beginPath()
          ctx.moveTo(screenX(ax, ay), screenY(ax, ay) - lift)
          ctx.lineTo(screenX(bx, by), screenY(bx, by) - lift)
          ctx.strokeStyle = rgbaOf(f.colour, 0.35 * fade)
          ctx.lineWidth = Math.max(1, r * 1.2 * fade)
          ctx.stroke()
        }
        // A halo that falls off, under the body: it is what lifts a sixteen
        // pixel sprite off ground as busy as a forest floor.
        const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2)
        halo.addColorStop(0, rgbaOf(f.colour, 0.5))
        halo.addColorStop(0.45, rgbaOf(f.colour, 0.22))
        halo.addColorStop(1, rgbaOf(f.colour, 0))
        ctx.beginPath()
        ctx.arc(x, y, r * 3.2, 0, Math.PI * 2)
        ctx.fillStyle = halo
        ctx.fill()
        // Which way it points: at whoever it is going to.  The prototype read
        // it off the trail, which on the step it is thrown is one point and
        // says east; a bolt that homes is always pointing at its target.
        const angle = Math.atan2(screenY(tx, ty) - lands - y, screenX(tx, ty) - x)
        if (!drawBolt(ctx, f.kind, x, y, Math.max(6, style.sprite * PPY * zoom),
          angle, f.colour, at)) {
          ctx.beginPath()
          ctx.arc(x, y, r, 0, Math.PI * 2)
          ctx.fillStyle = f.colour
          ctx.fill()
        }
      }
      // And the flashes: the picture first, then the ring in the school's
      // colour on top of it, because the ring is the part that says which.
      //
      // The prototype added both, so two hits at once brightened instead of
      // muddying — on a dark stone floor.  Added on to a sunlit meadow a
      // flame is yellow-green and a frost burst is white, so here the picture
      // is painted and only the ring is added.
      ctx.save()
      for (let i = flashes.length - 1; i >= 0; i--) {
        const b = flashes[i]!
        const t = (at - b.at) / b.life
        if (t >= 1) { flashes.splice(i, 1); continue }
        if (t < 0) continue
        const fade = 1 - t
        const wx = b.to ? b.to.ix : hero.ix, wy = b.to ? b.to.iy : hero.iy
        const x = screenX(wx, wy), y = screenY(wx, wy) - chestOf(b.to)
        ctx.globalCompositeOperation = 'source-over'
        drawFx(ctx, b.fx, x, y, 1.6 * PPY * zoom, t, fade)
        ctx.globalCompositeOperation = 'lighter'
        // A heal closes on its target instead of leaving it.
        const spread = b.fx === 'heal' ? 1 - t : t
        const r = Math.max(1, 0.9 * PPY * zoom * (0.25 + spread * 0.75))
        ctx.strokeStyle = rgbaOf(b.colour, 0.85 * fade)
        ctx.lineWidth = Math.max(1, 4 * fade * zoom)
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.stroke()
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2
          const outer = r * (1 + 0.35 * t)
          ctx.beginPath()
          ctx.moveTo(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55)
          ctx.lineTo(x + Math.cos(a) * outer, y + Math.sin(a) * outer)
          ctx.strokeStyle = rgbaOf(b.colour, 0.55 * fade)
          ctx.lineWidth = Math.max(1, 2.5 * fade * zoom)
          ctx.stroke()
        }
      }
      ctx.restore()
      ctx.lineCap = 'butt'
      // The cast bar under him, the prototype's: forty-eight wide and five
      // tall under the body, filling in the school's colour.  The bar at the
      // bottom of the screen says the same thing in the original's place;
      // this one is where the eye already is.
      if (you.casting) {
        const c0 = you.casting
        const done = Math.max(0, Math.min(1, (at - c0.began)
          / Math.max(0.001, c0.until - c0.began)))
        const w = Math.round(48 * Math.max(1, zoom)), h = 5
        const X = Math.round(screenX(hero.ix, hero.iy) - w / 2)
        const Y = Math.round(screenY(hero.ix, hero.iy) + 6 * zoom)
        ctx.fillStyle = 'rgba(0,0,0,0.6)'
        ctx.fillRect(X - 1, Y - 1, w + 2, h + 2)
        ctx.fillStyle = schoolColour(c0.sp.school)
        ctx.fillRect(X, Y, Math.round(w * done), h)
        castShown.bar = clock
        castShown.done = done
      }
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
        && (!can(thing.trade) || rankIn(thing.trade) < thing.skill)
        ? '#7a6a52' : '#c9a86a'
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
      ...onPhonePage().map((sp) => ({
        label: abilityOf(sp.id)?.[0] ?? '', icon: iconOf(sp.id),
        ready: why(sp) === null,
        // The shutter the desktop bar has, for whichever wait is longer.
        cooling: Math.max(
          sp.cool ? Math.max(0, ((you.cools[sp.id] ?? 0) - clock) / (sp.cool / 1000)) : 0,
          sp.gcd ? Math.max(0, (you.gcd - clock) / (gcdOf(sp) / 1000)) : 0),
      })),
    ], phonePages())

    // What a held button says.  The same words the desktop tooltip carries,
    // drawn above the finger — the whole reason the hover version had to go
    // is that a finger is where the answer would have been.
    painted = null
    const asked = pad.held()
    if (asked) {
      // **Through the page, not past it.**  This was `asked.slot + 1`, which
      // was right while the cluster could only ever show the first four
      // abilities: turn a page and the finger asks about one spell and is
      // answered about another.  The id is the join, so the two cannot drift.
      const want = onPhonePage()[asked.slot]
      const sq = want ? squares.find((x) => x.id === want.id) : null
      const lines = (sq?.tip ?? '').split('\n').filter(Boolean)
      if (lines.length) {
        ctx.font = `12px ${getComputedStyle(document.documentElement)
          .getPropertyValue('--body').trim() || 'sans-serif'}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        const wide = Math.max(...lines.map((t) => ctx.measureText(t).width)) + 20
        const tall = lines.length * 17 + 12
        const bx = Math.max(8, Math.min(canvas.width - wide - 8, asked.at.x - wide / 2))
        const by = Math.max(8, asked.at.y - tall - 40)
        ctx.fillStyle = 'rgba(10,9,12,.95)'
        ctx.fillRect(bx, by, wide, tall)
        ctx.strokeStyle = '#6d5a37'
        ctx.lineWidth = 1
        ctx.strokeRect(bx + 0.5, by + 0.5, wide - 1, tall - 1)
        lines.forEach((t, i) => {
          ctx.fillStyle = i === 0 ? '#c8aa6e' : '#e8e4d8'
          ctx.fillText(t, bx + wide / 2, by + 6 + i * 17)
        })
        // Kept after it is drawn and not before, so what the check reads is
        // what reached the glass.
        if (want) painted = { id: want.id, lines }
      }
    }
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
        ? '끌어서 이동  ·  눌러서 고르기\n오므려서 확대'
        : 'WASD: 이동  E: 대화·줍기  B: 가방  P: 주문서  T: 제작  Y: 자동  G: 장비  N: 소리  C: 정보  M: 지도  `: 수치'
    }

    acc += dt; frames++
    if (acc > 0.5) { fps = frames / acc; frames = 0; acc = 0 }
    // Every row keeps its own tail — the part in brackets — because a phone is
    // forty columns wide and the longest of these was seventy-two.  Dropping
    // the tails rather than whole rows keeps the readout the same readout,
    // which is the point of reading it on the device it looks wrong on.
    const tail = (t: string) => (pad.on ? '' : t)
    readout([
      ['지면', `${tilesDrawn.toLocaleString()}타일` + tail(`  (가장자리 ${edged})`)],
      ['지물', `그린 것 ${drawn.toLocaleString()} / ${placed.length.toLocaleString()}` +
        tail(`  (막는 것 ${solids.length})`)],
      ['주민', `그린 것 ${npcsDrawn} / ${npcs.length}, ${kindCount}종` +
        tail(`  (${settled} 뭍으로, ${afloat} 물속)`) +
        (unplaceable ? `  ${unplaceable} 그림 없음` : '')
        + (elsewhere ? `  ${elsewhere} 슬라이스 밖` : '')],
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
      name: me?.name || '주인공', level: you.level, hp: you.hp, max: you.max,
      icon: art.chrome['health'] ?? '', face: paintFace(), foe: false,
    })
    ui.setFoe(foe ? {
      name: nameOf(foe.kind), level: foe.level, hp: foe.hp, max: foe.max,
      icon: (foe.art.startsWith('townsfolk') || foe.art.startsWith('guard')
        || foe.art.startsWith('bandit')
        ? art.chrome['person'] : art.chrome['beast']) ?? '',
      face: paintFoe(foe),
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
    // And a mine this scene dug says it is ours — **only** that one.  Issue
    // 133 wrote this line when every mine was `digCave`'s: the client drew
    // the mouth and the chambers behind it came out of where the server
    // stands its creatures.  Since 3111160 the galleries come out of the
    // client's own models and `viewcheck` holds `derived === 0`, and the line
    // went on asking `k === 'mine'` — so every gallery the client drew was
    // labelled as one we made up, which is the same lie the other way round
    // from the one this label was written to stop.  What is ours is
    // `fromModel === false`, and that is the question now.
    // Which storey of how many, beside the circle — only in a building that
    // has more than one.  Counted from the ground as one, the way a Korean
    // building is: the bake's storeys are all above the sill of the front door.
    ui.setStorey(indoors && indoors.floors.length
      ? `${storey + 2}/${indoors.floors.length + 1}층` : null)
    ui.setWhere(`${zoneOf(zone, inside(zone))}${MADE_UP ? ' · 합성' : ''}`
      + `${dugByUs(indoors) ? ' · 우리가 판 굴' : ''}`
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
      { key: 'T', label: '제작', on: craftOpen, use: () => showCraft(!craftOpen) },
      { key: 'P', label: '주문서', on: bookOpen, use: () => {
        bookOpen = !bookOpen
        if (bookOpen) bookPage = 0
        drawBook()
      } },
      // Not on a phone, where the toggle is already on the glass beside the
      // ability buttons it drives: two switches for one flag, one of them
      // inside a menu that has to be opened, is a phone with two answers to
      // "is it on".
      ...(pad.on ? [] : [
        { key: 'Y', label: '자동', on: you.auto, use: () => { you.auto = !you.auto } },
      ]),
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
      if (gone === 'shop') shutShop()
    }
    // Walking away shuts the shop.  A window you can buy from across the
    // valley is not a shop, and the conversation it was opened from is held to
    // the same rule by `inReach`.
    if (shopAt && ((shopAt.x - hero.x) ** 2 + (shopAt.y - hero.y) ** 2
      > EARSHOT * EARSHOT || shopAt.dead)) shutShop()
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
      ['입은 것', `${Object.entries(gear).length} / ${SLOTS.length}`
        + (held.length ? `  (가진 것 ${held.length}, G로 입는다)` : '')],
      ['지갑', coin(you.purse)],
      ['처치', `${you.kills}`],
      // Where he stands, and only with the sides this game can move.  A
      // hundred and five factions have a starting number for a human and a
      // hundred of them will hold that number for ever, so listing them all
      // would be a page of a screen saying nothing.
      ...sideLines(),
      // And the trades, for the same reason: what he chose to learn.
      ...Object.entries(you.trades)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([skill, at]) =>
          [TRADE_WORD[Number(skill)] ?? skill, `${at[0]} / ${at[1]}`] as
            [string, string]),
      // What the run was, once it is over.  A ceiling that says nothing when
      // you reach it is a number nobody notices arriving — and the character
      // growth page warned that level ten would be exactly that.
      ...(you.finished ? [
        ['—', '노스샤이어에서 할 일은 여기까지다'],
        ['걸린 시간', `${Math.max(1, Math.round((Date.now() - you.born) / 60000))}분`],
        ['마친 일거리', `${log.done.size}`],
        ['다음', '특성. 다음 슬라이스의 첫 항목이다'],
      ] as [string, string][] : []),
    /**
     * **No paperdoll on the sheet, by the owner's decision (issue 184).**
     *
     * It was 56 by 56 of a 384 by 512 panel — two per cent of it — and nine
     * per cent of that was opaque.  What carried the information was the
     * thirteen squares below it, and the doll showed one of the four things
     * that were on: a bare body with boots and hair.
     *
     * `paintDoll` is still called, because the portrait in the corner is a
     * window on to it and that is how issue 137 solved a portrait.  Where the
     * portrait comes from if the layers go too is the second half of 184, and
     * it is written down in the wiki rather than decided here.
     */
    ],
    // The man himself, between the two columns.  `me` is nought before a
    // character has been made, and the sheet is not reachable then.
    me ? paintMe(sheetCanvas, me.hair ?? 'plain', me.beard ?? '', 2) : undefined,
    // And the thirteen squares, empty ones included, **in the shape the
    // original lays them out in** — see `doll_columns` in `layout.py`.  What
    // is worn rather than which squares are full, which is what this said
    // before, and with no item names in this game a word could never have
    // said the difference.
    wornSquares())
    ui.setXp(you.xp, LADDER[you.level - 1] ?? 0, you.level)
    ui.setBag(bagOpen, coin(you.purse),
      Object.entries(you.bag)
        .map(([id, n]) => {
          // The word on its own is what this game has instead of a name, so
          // a bag of eleven words is eleven lines of Korean.  The picture is
          // keyed on `(word, slot)` and a stack has no slot — everything that
          // does goes in `held` and is worn rather than counted.
          const it = itemOf(Number(id))
          const word = it ? (it[I_WORD] as string) : 'oddment'
          const use = it?.[I_USE] as [string, number, number] | 0 | undefined
          return [goodsOf(word), n,
            coin(((it?.[I_SELL] as number) ?? 0) * n),
            art.goods[`${word}|`] ?? '',
            use ? useWord(use) : '', Number(id),
            it ? tintOf(it) : ''] as
            [string, number, string, string, string, number, string]
        })
        .sort((a, b) => b[1] - a[1]),
      (id) => ui.log(useItem(id), 'gain'))
    // Sixteen squares, and the number is not a taste.
    //
    // It was twelve — the original's bar — with attack on the first, talk on
    // the second and ten for abilities, under a comment saying *ten is exactly
    // what a warrior can hold by level ten*.  That was true of a book with
    // thirteen things in it.  It holds seventeen now (issue 148), of which a
    // character who has bought everything a trainer sells carries **fifteen**,
    // and the four that did not fit had no key at all — which `uicheck` caught
    // the moment the book grew, from the other end: a filled square with no
    // letter on it.
    //
    // So the bar is as long as the book, and talk gives up its square.  It was
    // never an ability and the original has no button for it either — you
    // click the person, the help line says `E`, and on a phone `padcheck`
    // already documents that you tap them.  A square that is a verb was the
    // odd one out.
    // The number row and then four letters the game was not already using.
    // Not `W`: that walks you forward, and a key that both walks and swings
    // is the same class of mistake as a square labelled one higher than the
    // key that presses it, which this file has already made once.
    // One table, read twice: the letter drawn on a square and the key that
    // presses it come out of the same place.  They used to be worked out
    // separately — the bar drew `KEYS[i + 2]` and the keyboard did
    // `spells[slot - 2]` — so every square was labelled one higher than the
    // key that used it, `2` did nothing on the bar and everything on the
    // keyboard, and the last thing learned had no key at all because the bar
    // drew out to `=` and the handler stopped at `9`.
    //
    // **And the first key is no longer the attack.**  That square's whole
    // body was `you.target = you.target ?? inSwing()` — it aimed, and the
    // swing goes out on its own once something is aimed at.  Aiming at the
    // nearest was never a choice, so it is not a button; see `takeAim`.
    squares = BAR_KEYS.map((key, i) => {
      const id = bar[i] ?? null
      const sp = id === null ? null : spells.find((x) => x.id === id) ?? null
      if (!sp) return { key, label: '', icon: '', tip: '', cooling: 0, live: false }
      const [word, what] = abilityOf(sp.id)!
      const stop = why(sp)
      const ready = you.cools[sp.id] ?? 0
      return {
        key, label: word, id: sp.id,
        icon: iconOf(sp.id),
        tip: `${word}  —  ${POWER_KOR[POWER_WORD[sp.power] ?? you.powerWord]
          ?? ''} ${costOf(sp, baseFor(sp))}\n${what}`
          + (sp.cast ? `\n시전 ${(sp.cast / 1000).toFixed(1)}초` : '')
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
    })
    ui.setBar(squares, (slot, id) => { putOnBar(slot, id); drawBook() })
    drawBook()
    // And the keyboard reads the same table.  Lower-cased because `E` is
    // drawn on a square and typed in lower case, and only the squares that do
    // something go in — an empty one has no `use`.
    pressable.clear()
    for (const sq of squares) if (sq.use) pressable.set(sq.key.toLowerCase(), sq.use)
    // The bar, and the word on it.  One class's was called rage and the
    // readout said so in Korean; six of them means the word is the
    // character's rather than the interface's.
    ui.setRage(you.power, powerMax(), you.powerWord)
    ui.setCast(you.casting
      ? { word: abilityOf(you.casting.sp.id)?.[0] ?? '',
          at: (clock - you.casting.began)
            / Math.max(0.001, you.casting.until - you.casting.began) }
      : null)
    ui.setCombo(you.powerWord === 'energy' ? you.combo : 0)
    ui.setAuras('me', you.shout && you.shout.until > clock
      ? [{ icon: iconOf(6673), left: you.shout.until - clock,
           text: `외침  —  공격력 +${you.shout.ap}` }]
      : [])
    ui.setAuras('foe', you.target?.bleed
      ? [{ icon: iconOf(772), left: you.target.bleed.until - clock,
           text: `찢기  —  3초마다 ${you.target.bleed.each}` }]
      : [])

    ;(window as unknown as { __ready: boolean }).__ready = true
  }
  /**
   * Put the character back, and keep putting him down.
   *
   * Loaded before the first frame so nothing is drawn at the wrong place, and
   * written every few seconds and on the way out — `visibilitychange` rather
   * than `beforeunload`, because on a phone the tab is very often not closed
   * so much as left.
   */
  cards = await listSaves(roomFor()).catch(() => [])
  /**
   * Put one of them in the world.
   *
   * The rest bonus is worked out here rather than where the save is read,
   * because it is a fact about *this* character's time away and there are now
   * several characters with several different ones.
   */
  const enterWorld = (card: Card) => {
    mySlot = card.slot
    restore(card.save)
    // What the time away was worth.  Four times as much if the tab was
    // closed in an inn, which is the only reason it matters where you stop.
    const away = Math.max(0, (Date.now() - (card.save.at ?? Date.now())) / 1000)
    const banked = Math.min(restCap(),
      you.rest + restFor(away, !!card.save.you.restedIn))
    const gained = Math.round(banked - you.rest)
    you.rest = banked
    ui.setPick(false, {} as never)
    ui.log(`${you.level}레벨로 이어서 시작한다.`, 'note')
    if (gained > 0) {
      ui.log(card.save.you.restedIn
        ? `여관에서 쉬었다. 휴식 경험치 ${gained}`
        : `쉬는 동안 휴식 경험치 ${gained}`, 'gain')
    }
  }
  /**
   * And one of two screens: the list, or the maker when there is nobody.
   *
   * **The list comes up even for one character**, by the owner's decision.
   * It used to be skipped — a list of one is a click on the way to somewhere
   * you were already going — and what that cost was the only place a player
   * sees who they are about to play, can make a second, or can delete the
   * first.  With nobody saved there is nothing to choose, so the maker is
   * still the first screen.
   */
  intoWorld = enterWorld
  if (!cards.length) {
    mySlot = 1
    drawCreate()
  } else {
    drawPick()
  }

  let saved = 0
  const keep = () => {
    // Only once there is somebody to save.  The screens that choose and make
    // a character are both up *before* one exists, and writing then would put
    // a nameless level-one warrior into whichever slot was next — which is
    // the slot the player was about to make somebody in.
    if (!me) return
    writeSave(snapshot(), mySlot).catch(() => {})
    const now = snapshot()
    cards = cards.filter((c) => c.slot !== mySlot)
      .concat([{ slot: mySlot, save: now }]).sort((a, c) => a.slot - c.slot)
  }
  // And on demand, for the check that asks whether two slots mix: the answer
  // only means anything after a write, and waiting fifteen seconds for one is
  // a check nobody runs.
  ;(window as unknown as { __keep: () => unknown }).__keep = () => {
    keep()
    return { slot: mySlot, level: you.level }
  }
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
  /** How much of the world the slice's own edge shut out. */
  /** How much of the last frame's ground was an edge rather than a fill. */
  /** Which room the player is in, and how the doors are placed. */
  /** The mines, and where their mouths are. */
  ;(window as unknown as { __caves: () => unknown }).__caves = () => ({
    /**
     * How many of this world's mines the *client* drew and how many this
     * scene derived, which issue 219 asked for out loud: the two are the same
     * shape once they are in the list, and that is exactly why the answer had
     * to be carried rather than guessed.
     */
    fromModel: caves.filter((c) => c.fromModel).length,
    derived: caves.filter((c) => !c.fromModel).length,
    /** And how many the client has that nobody is standing in. */
    modelled: quarried.length,
    mines: caves.map((c) => ({
      area: c.area, at: [Math.round(c.x), Math.round(c.y)],
      fromModel: c.fromModel,
      // Not rounded: a check that asks which cells are a mouth has to ask it
      // of the same point the walkability does, and half a yard of rounding
      // put seven cells on the wrong side of the answer.
      mouth: c.doors[0], cells: [c.plan!.w, c.plan!.h],
      /** And what this scene would have dug here if the client had nothing. */
      wouldDig: wouldDig.get(caves.indexOf(c)) ?? null,
      /**
       * Whether the mouth is on the gallery's own floor, and how far from it.
       *
       * A derived mine was cut *around* its mouth, so this was true by
       * construction and nobody had to ask.  A modelled one is not: the
       * mouth is a hole the client took out of the terrain and the gallery is
       * a separate file, so the two have to be checked to meet.
       */
      onFloor: bitAt(c.plan!.bits, planCell(c.plan!, c, c.doors[0]![0],
        c.doors[0]![1])),
      floorPct: (() => {
        let n = 0, f = 0
        const p = c.plan!
        for (let k = 0; k < p.w * p.h; k++) {
          if ((p.bits[k >> 3]! >> (k & 7)) & 1) n++
          if ((p.floor[k >> 3]! >> (k & 7)) & 1) f++
        }
        let so = 0, ov = 0
        for (let k = 0; k < p.w * p.h; k++) {
          if ((p.solid[k >> 3]! >> (k & 7)) & 1) so++
          if (p.over.length && ((p.over[k >> 3]! >> (k & 7)) & 1)) ov++
        }
        return [Math.round((100 * f) / Math.max(1, n)),
          Math.round((100 * so) / Math.max(1, n)),
          Math.round((100 * ov) / Math.max(1, n))]
      })(),
      // How much of the box is actually dug, which is what says this is a
      // warren of passages and not a rectangle with kobolds in it.
      dug: (() => {
        let n = 0
        const bits = c.plan!.bits
        for (let k = 0; k < c.plan!.w * c.plan!.h; k++) {
          if ((bits[k >> 3]! >> (k & 7)) & 1) n++
        }
        return Math.round((100 * n) / (c.plan!.w * c.plan!.h))
      })(),
      crew: npcs.filter((n) => n.cave !== undefined && caves[n.cave] === c).length,
      /**
       * The crew member nearest the mouth, which is the one a check can see
       * from either side of the doorstep without walking the whole warren.
       */
      near: (() => {
        // **Where it was put, not where it is standing.**  Everything in this
        // world wanders, so a hook built out of live positions answers
        // differently every time it is asked — and the check that the same
        // world digs the same mine compares two answers.  The mine is dug
        // from the spawn points, so the spawn points are what it reports.
        const crew = npcs.filter((n) => n.cave !== undefined && caves[n.cave] === c)
        // A mine with nobody in it is a mine — eleven of the client's
        // fourteen hold fewer than `CREW`, and one of those is an empty
        // burrow.  It was `crew[0]!` and that `!` was a promise this list
        // could not keep the day the mines stopped being made out of crowds.
        if (!crew.length) return null
        let best = crew[0]!
        let gap = Infinity
        for (const n of crew) {
          const d = (n.hx - c.doors[0]![0]) ** 2 + (n.hy - c.doors[0]![1]) ** 2
          if (d < gap) { gap = d; best = n }
        }
        return [Math.round(best.hx), Math.round(best.hy),
          Math.round(Math.sqrt(gap))]
      })(),
      /**
       * What the chambers and the passages were cut to, and where the numbers
       * came from.  A constant here was a bug waiting to be found: `3.2` and
       * `5.5` were chosen by looking at the screen.
       */
      wander: (() => {
        const w = npcs.filter((n) => n.cave !== undefined && caves[n.cave] === c)
          .map((n) => n.wander).sort((a, z) => a - z)
        if (!w.length) return null
        return [w[0], w[w.length >> 1], w[w.length - 1]]
      })(),
    })),
    /** The mouth is the client's own hole and this is how wide it is. */
    mouth: MOUTH,
    /**
     * How decisive the cut between one warren and the next is.
     *
     * The longest passage inside a warren against the shortest gap between
     * two.  While this is a factor of several there is nothing to tune — every
     * threshold in between gives the same warrens — and the day it approaches
     * one is the day clustering stops being the right rule.
     */
    apart: Math.round(apart * 10) / 10,
    warrens,
    /** A passage is a place a man walks, after the mask is sampled. */
    wide: CAVE_WIDE,
    body: BODY_YARDS,
    cell: 32 / 24,
    /**
     * Everybody under the surface, by area, and whether a mine took them.
     *
     * `spread` is what separates the two reasons a creature is down here.  A
     * mine is a **cloud**: its members are tens of yards apart and the widest
     * is Ant'hill at 186.  A creature that is six yards under the forest on
     * its own is not in a cave at all — it is a spawn the height grid is
     * wrong about, and counting it as a lost miner hid that.
     */
    under: (() => {
      const by: Record<string, { n: number; mine: number; spread: number;
        deep: number; toMouth: number; reach: number; lumps: number[] }> = {}
      const where: Record<string, [number, number, number][]> = {}
      for (const n of npcs) {
        // Home rather than here, for the same reason `near` is: a census taken
        // off live positions is a census that answers differently every time.
        const g = groundAt(n.hx, n.hy)
        if (n.z >= g - DOWN) continue
        const a = String(areaOf(n.hx, n.hy))
        by[a] ??= { n: 0, mine: 0, spread: 0, deep: 0, toMouth: -1, reach: 0,
          lumps: [] }
        by[a]!.n++
        if (n.cave !== undefined) by[a]!.mine++
        ;(where[a] ??= []).push([n.hx, n.hy, g - n.z])
      }
      for (const [a, pts] of Object.entries(where)) {
        // The median nearest neighbour, which says cloud or scatter without
        // being moved by one outlier the way a bounding box is.
        const near = pts.map(([x, y]) => Math.sqrt(Math.min(...pts
          .filter((q) => q[0] !== x || q[1] !== y)
          .map((q) => (q[0] - x) ** 2 + (q[1] - y) ** 2), Infinity)))
          .sort((p, q) => p - q)
        by[a]!.spread = Math.round(near[near.length >> 1] ?? 0)
        const d = pts.map((q) => q[2]).sort((p, q) => p - q)
        by[a]!.deep = Math.round(d[d.length >> 1]!)
        // And how far the nearest way in is.  The bar for digging is a hole
        // of the client's within `REACH` of somebody down here; when a cloud
        // is refused this is the number that says whether the bar is wrong or
        // the place really has no mouth.
        let best = Infinity
        for (const [i, j] of meta.gaps ?? []) {
          const mx = x0 - i * U, my = y0 - j * U
          for (const [px, py] of pts) {
            const q = (mx - px) ** 2 + (my - py) ** 2
            if (q < best) best = q
          }
        }
        by[a]!.toMouth = Math.round(Math.sqrt(best))
        // How big the cloud itself is, from its own middle.  This is what
        // decides how far away a mouth may be: Ant'hill is 186 yards across
        // and its entrance is on a hillside 69 yards from the nearest kobold,
        // and a den six yards across has no business claiming one 80 away.
        const mx = pts.reduce((t, q) => t + q[0], 0) / pts.length
        const my = pts.reduce((t, q) => t + q[1], 0) / pts.length
        by[a]!.reach = Math.round(Math.sqrt(Math.max(...pts
          .map((q) => (q[0] - mx) ** 2 + (q[1] - my) ** 2))))
        // And whether that cloud is one thing.  Single linkage, so a chain of
        // chambers stays one cave: area 12's nineteen look like a cloud by
        // nearest neighbour and span 1,468 yards, which is the zone and not a
        // mine.
        const seen = pts.map(() => -1)
        let group = 0
        for (let i = 0; i < pts.length; i++) {
          if (seen[i]! >= 0) continue
          const queue = [i]
          seen[i] = group
          while (queue.length) {
            const k = queue.pop()!
            for (let j = 0; j < pts.length; j++) {
              if (seen[j]! >= 0) continue
              if ((pts[k]![0] - pts[j]![0]) ** 2
                + (pts[k]![1] - pts[j]![1]) ** 2 > 40 * 40) continue
              seen[j] = group
              queue.push(j)
            }
          }
          group++
        }
        const sizes: number[] = []
        for (let g = 0; g < group; g++) sizes.push(seen.filter((v) => v === g).length)
        by[a]!.lumps = sizes.sort((p, q) => q - p)
      }
      return by
    })(),
    /**
     * Creatures under the surface that ended up in no mine at all.
     *
     * Asked at **home**, the same as `under` above.  This one used to ask the
     * ground under where the creature happened to be standing, while `under`
     * asked the ground under its spawn — so one that had wandered on to a
     * different height was below the surface for one count and not for the
     * other, and CI reported 86 in a mine and 4 lost out of 89 underground.
     * The two numbers have to add up, so they have to be asked the same way.
     */
    lost: npcs.filter((n) => n.z < groundAt(n.hx, n.hy) - DOWN
      && n.cave === undefined).length,
  })
  ;(window as unknown as { __room: () => unknown }).__room = () => ({
    inside: indoors ? indoors.k : null,
    doors: indoors ? indoors.doors : (inRoom(hero.x, hero.y)?.doors ?? []),
    at: [Math.round(hero.x), Math.round(hero.y)],
    /** Buildings with a plan, and how many of them you can get into. */
    shut: buildings.filter((b) => b.plan).length,
    open: buildings.filter((b) => b.plan && b.doors.length).length,
    /**
     * Every door, and whether the ground just outside it can be walked to.
     * A door that opens on to a cliff is a building nobody can enter.
     */
    reachable: buildings.filter((b) => b.doors.length).map((b) => {
      const ok = b.doors.filter(([dx, dy]) => {
        for (let r = 2.5; r <= 6; r += 1.5) {
          for (let a = 0; a < 12; a++) {
            const t = (a / 12) * Math.PI * 2
            const x = dx + Math.cos(t) * r, y = dy + Math.sin(t) * r
            // Not `inRoom` — a door in the middle of a big footprint has
            // the same building on both sides of it, and the abbey's
            // outline is its grounds.  What matters is that there is
            // *standable ground* out there.
            if (!blocked(x, y)) return true
          }
        }
        return false
      }).length
      return [b.k, ok, b.doors.length]
    }),
    houses: buildings.length,
    withDoors: buildings.filter((b) => b.doors.length).length,
    planned: buildings.filter((b) => b.plan).length,
  })
  ;(window as unknown as { __edges: () => unknown }).__edges = () => ({
    tiles: tilesDrawn, inView: tilesInView, edged, shaded, outlined,
    plates: platesDrawn,
    blended: blendedEver, plated: platedEver,
    plateEdges: plateEdgeEver, rings: ringEver, looseBlends: looseBlendEver,
    loose: looseEver,
    waterTiles: waterTilesDrawn, watered: wateredEver, decks: decksDrawn,
    fronts: frontsDrawn,
  })
  /**
   * What the plain ground is costing, in kept pixels.
   *
   * The issue that asked for plates asked for this in the same breath: a cache
   * is a budget, and one that nothing weighs is a leak with a good name.
   */
  /**
   * How the light is delivered, and what it costs the atlas.
   *
   * The issue that asked for a continuous hillside asked in the same breath
   * that making the light finer **must not grow the atlas** — and it does not,
   * because the plain ground is composed from one flat row and the light is
   * multiplied over the plate afterwards.  Twenty-one rows is what the tiles
   * that are *not* in a plate still use.
   */
  ;(window as unknown as { __shading: () => unknown }).__shading = () => {
    const g = tintedGround()
    return {
      rows: SHADES, flat: FLAT_ROW, high: g.c.height, tile: g.cell, wide: g.c.width,
      bands: g.c.height / (g.cell * SHADES), drawn: g.px,
      spare: bakedBefore ? bakedBefore.c.width * bakedBefore.c.height * 4 : 0,
      indoor: [...indoorRows],
    }
  }
  /**
   * How the buildings were drawn last frame, and which of them could not be.
   *
   * Issue 216 asked for both halves out loud: a building with a plan is one
   * fill in its own axes, and a building **without** one is still the old
   * stamp — so the second number is the one that has to be printed rather than
   * left to be noticed.  `doors` is the join the same issue asked to check:
   * the door coordinates come from the model's own portals (`MOPT`) and the
   * outline comes from its triangles, and a door that is not on the edge of
   * the shape is a picture and a doorstep that disagree.
   */
  ;(window as unknown as { __built: () => unknown }).__built = () => {
    const rows = buildings.map((b) => {
      const p = b.plan
      const path = p ? planPath(p) : null
      let inside = 0, deepest = 0
      for (const [dx, dy] of b.doors) {
        if (!p) continue
        const n = planCell(p, b, dx, dy)
        if (!bitAt(p.bits, n)) continue
        inside++
        // And how far inside.  A door is a hole cut in the edge of a roof, so
        // it has to be *near* the boundary as well as within it — a door in
        // the middle of a ninety-yard shape is a door nobody can reach.
        // Measured as rings out from the door's own cell until one of them
        // leaves the shape, in yards.
        const i = Math.floor(n / p.h), j = n % p.h
        const out = (a: number, c: number) =>
          a < 0 || a >= p.w || c < 0 || c >= p.h || !bitAt(p.bits, a * p.h + c)
        let r = 1
        for (; r <= 16; r++) {
          let hit = false
          for (let t = -r; t <= r && !hit; t++) {
            hit = out(i + r, j + t) || out(i - r, j + t)
              || out(i + t, j + r) || out(i + t, j - r)
          }
          if (hit) break
        }
        deepest = Math.max(deepest, r * p.s)
      }
      return {
        kind: b.k, turn: Math.round(Math.atan2(p?.sn ?? 0, p?.c ?? 1) * 180 / Math.PI),
        plan: !!p, cells: path?.cells ?? 0, runs: path?.runs ?? 0,
        doors: b.doors.length, inside, deepest: +deepest.toFixed(1),
        boxes: b.rooms.map((r) => [Math.round(2 * r.l), Math.round(2 * r.w)]),
        roofed: p ? roofedBoxes(b, p).boxes.length : 0,
        covered: p ? +roofedBoxes(b, p).covered.toFixed(2) : 0,
      }
    })
    let art = 0
    for (const pat of patterns.values()) if (pat) art += tintedGround().px ** 2 * 4
    let masks = 0
    for (const p of new Set(buildings.map((b) => b.plan))) {
      if (p) masks += p.bits.length + p.solid.length + p.floor.length
        + p.over.length + p.steps.length
    }
    return {
      all: rows.length,
      /**
       * What the buildings cost to hold, which is the question issue 218
       * asked and the answer it did not expect.  `art` is every roof picture
       * the scene has cut; `masks` is the footprints themselves; `asSheets` is
       * what nineteen per-model bitmaps at the ground's own 24 pixels a yard
       * would have been.
       */
      art,
      masks,
      asSheets: [...new Set(buildings.map((b) => b.plan))]
        .reduce((a, p) => a + (p ? p.w * p.h * (p.s * PPY) ** 2 * 4 : 0), 0),
      /** Drawn as one piece, turned the way the placement turns it. */
      onePiece: rows.filter((r) => r.plan).length,
      /** And the ones that are not, which is what must not go quietly. */
      stamped: rows.filter((r) => !r.plan).length,
      /** How many tile squares the one-piece fills stand in for. */
      cells: rows.reduce((a, r) => a + r.cells, 0),
      runs: rows.reduce((a, r) => a + r.runs, 0),
      doors: rows.reduce((a, r) => a + r.doors, 0),
      inside: rows.reduce((a, r) => a + r.inside, 0),
      /** The deepest any door sits inside its own roof, in yards. */
      deepest: Math.max(0, ...rows.map((r) => r.deepest)),
      /**
       * How many buildings have a roof laid out of the kit, how many keep the
       * flat fill, and why — which is issue 217's *"count the ones with no
       * picture and print them"* said in the only terms that can be checked.
       */
      kitted: rows.filter((r) => r.roofed > 0).length,
      flat: rows.filter((r) => r.roofed === 0).length,
      /** And whether every roof word actually has all thirty of its pieces. */
      kit: Object.fromEntries(Object.values(ROOF_OF).map((w) =>
        [w, KIT_CELLS.filter((c) => tintedGround().at[`${w}${c}`] !== undefined)
          .length])),
      kitCells: KIT_CELLS.length,
      turned: rows.filter((r) => r.plan && r.turn % 90 !== 0).length,
      rows,
    }
  }
  /**
   * Whether a blend inside a plate changes across a tile, read off the pixels.
   * `__splat(true)` starts counting from nought, `__splat(false)` stops.
   */
  ;(window as unknown as { __splat: (on?: boolean) => unknown }).__splat = (on) => {
    if (on !== undefined) {
      splatProbe.on = on
      if (on) {
        splatProbe.edges = 0
        splatProbe.within = 0
        splatProbe.shore = 0
        splatProbe.shoreWithin = 0
      }
    }
    return { ...splatProbe }
  }
  ;(window as unknown as { __plates: () => unknown }).__plates = () => ({
    kept: plates.size, bytes: plateBytes, budget: PLATE_BUDGET,
    side: PLATE_PX, drawn: platesDrawn, ...plateLaid,
  })
  /**
   * Where the zoom may go, and where each end of it came from.
   *
   * Both limits are derived and the check reads them rather than repeating
   * them: a harness that types `0.12` is a harness testing a screen no player
   * can reach, which is what the widest-zoom check was doing for a round after
   * the floor stopped being a constant.  `cell` is how many pixels of person
   * the floor leaves, because that — not the tile count — is what decides how
   * far out is too far now.
   */
  ;(window as unknown as { __zooms: () => unknown }).__zooms = () => ({
    zoom, fit: fitZoom(), follow: MAX_FOLLOW, floor: clampZoom(0),
    phone: pad.on, steps: pad.on ? PHONE_ZOOMS : null, opens: pad.on ? PHONE_OPENS : null,
    ceiling: clampZoom(99), seen: SEEN_YARDS,
    cell: heroMeta.cell * clampZoom(0),
    across: canvas.width / (PPY * clampZoom(0)),
  })
  /**
   * What the client painted, as the scene actually has it.
   *
   * `mixed` is the number the issue that brought this asked for: how much of
   * the forest carries a second ground, which is the paint a single word a
   * cell used to step over.  `off` is what the bake measured itself at.
   */
  ;(window as unknown as { __paint: (x?: number, y?: number) => unknown })
    .__paint = (x, y) => {
    let mixed = 0
    if (paintMix) {
      for (let n = 0; n < PAINT_CELLS; n++) {
        if (n & 1 ? paintMix[n >> 1]! >> 4 : paintMix[n >> 1]! & 15) mixed++
      }
    }
    return {
      cells: PAINT_CELLS, wide: GW, tall: GH, yards: GU, levels: MIX_LEVELS,
      words: PAINT.length, mixed,
      /** Two words a cell and a nibble beside it, which is what ships. */
      bytes: PAINT_CELLS + MIX_BYTES,
      here: x === undefined || y === undefined ? null
        : { word: paintAt(x, y), second: blendAt(x, y) },
    }
  }
  /**
   * Which roof each kind of building here is wearing.
   *
   * Both halves: the kinds this world actually contains and the table that
   * dresses them.  One picture covered all forty-three buildings, so the abbey
   * and a cottage were the same thing at two sizes, and "how many roof tiles
   * are there" would have said one and been quite right.
   */
  ;(window as unknown as { __roofs: () => unknown }).__roofs = () => {
    const kinds = [...new Set(buildings.filter((b) => b.k !== 'mine')
      .map((b) => b.k))].sort()
    return {
      kinds, wears: Object.fromEntries(kinds.map((k) => [k, ROOF_OF[k] ?? null])),
      painted: [...indoorPaint.entries()],
    }
  }
  ;(window as unknown as { __edge: () => unknown }).__edge = () => ({
    npcs: npcs.length, elsewhere, unplaceable, beyond, scenery: placed.length,
    /** Walkable ground that is not this slice's, which has to be none. */
    strayed: (() => {
      let open = 0, stray = 0
      for (let x = x0 - W * U; x <= x0; x += 24) {
        for (let y = y0 - H * U; y <= y0; y += 24) {
          if (blocked(x, y)) continue
          open++
          if (outside(x, y)) stray++
        }
      }
      return { open, stray }
    })(),
  })
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
    on: pad.on, auto: pad.auto,
    ...pad.view(), ...layoutFor(canvas.width, canvas.height),
    // After the spread, because `view()` has a `held` of its own — whether a
    // finger is on the stick — and the two mean different things.
    held: pad.held(),
    // What that held square actually painted — its lines, and whose.  Read off
    // the drawing rather than the tooltip text, because a tooltip built right
    // and drawn for the wrong square is the bug a turned page once was.
    told: painted,
    // Which four of the spellbook the cluster is showing, and how many pages
    // there are.  Read off the same call the drawing uses, so a check that
    // walks every page is walking what the thumb walks.
    page: pad.page, pages: pad.pages,
    onPage: onPhonePage().map((sp) => sp.id),
    knows: spells.map((sp) => sp.id),
  })

  /**
   * Walk in through a named building's own door, the way a player does.
   *
   * `__put` places him and `indoors` is only ever set by crossing a doorstep,
   * so a check that teleports into a room is a check standing in a room the
   * game does not think it is in.  This puts him on the step and lets
   * `throughTheDoor` do the rest.
   */
  ;(window as unknown as { __enter: (k?: string, least?: number) => unknown })
    .__enter = (k, least = 0) => {
      for (const b of buildings) {
        if (!b.plan || !b.doors.length) continue
        if (k && b.k !== k) continue
        if ((b.floors?.length ?? 0) < least) continue
        const door = b.doors[0]!
        placeHero(door[0], door[1])
        putInside(b, door)
        if (indoors) {
          return { k: b.k, storey, l: b.l, w: b.w,
            floors: b.floors?.length ?? 0 }
        }
      }
      return null
    }

  /**
   * Walk into a mine, for the check on what the readout says down one.
   *
   * `__enter` walks `buildings` and a mine is in `caves`, so it could never
   * have answered this.  Returns which mine and what `dugByUs` says of it;
   * the words themselves are read off the glass by the check, because the
   * failure is a label, and a label is what reaches the screen.
   */
  ;(window as unknown as { __enterMine: (i?: number) => unknown })
    .__enterMine = (i = 0) => {
      const c = caves[i]
      if (!c || !c.doors.length) return null
      indoors = null
      const door = c.doors[0]!
      placeHero(door[0], door[1])
      throughTheDoor()
      return { mines: caves.length, fromModel: c.fromModel, inside: indoors === c,
        ours: dugByUs(indoors) }
    }
  /**
   * Walk in through one particular building's door, by its index in
   * `__buildings()` — `__enter` takes the first of a kind, and a check that
   * has to go into every building, or into one named place, cannot say which.
   * Each door is tried in turn, the same step `__enter` takes.
   */
  ;(window as unknown as { __enterOne: (i: number, d?: number) => unknown })
    .__enterOne = (i, d) => {
      const b = buildings[i]
      if (!b || !b.plan || !b.doors.length) return null
      for (let j = 0; j < b.doors.length; j++) {
        if (d !== undefined && j !== d) continue
        const door = b.doors[j]!
        placeHero(door[0], door[1])
        putInside(b, door)
        if (indoors === b) {
          return { i, k: b.k, door: j, storey, x: hero.x, y: hero.y,
            floors: b.floors?.length ?? 0 }
        }
        // Into a neighbour whose door is nearer, or nowhere: out again.
        indoors = null
        storey = -1
      }
      return null
    }
  /** The same, for the building whose outline holds a point. */
  ;(window as unknown as { __enterAt: (x: number, y: number) => unknown })
    .__enterAt = (x, y) => {
      const b = inRoom(x, y)
      return b ? (window as unknown as { __enterOne: (i: number) => unknown })
        .__enterOne(buildings.indexOf(b)) : null
    }
  /**
   * What the last frame laid inside the room you are in, by part — see
   * `roomPaint`.
   */
  ;(window as unknown as { __roomPaint: () => unknown }).__roomPaint = () => {
    const out: Record<string, Record<string, number>> = { floor: {}, open: {}, wall: {},
      void: {}, speck: {}, stairs: {} }
    for (const [key, n] of roomPaint) {
      const [part, id] = key.split(':') as [string, string]
      ;(out[part] ??= {})[id] = n
    }
    // And the room itself: what a cell was composed at, what it weighs, what
    // composing it cost, and how many rooms the budget is holding.
    const room = roomLaid ? { scale: roomLaid.S, bytes: roomLaid.bytes,
      ms: roomLaid.ms, kept: roomCache.size, keptBytes: roomBytes, budget: roomBudget,
      composed: roomComposed, hits: roomHits, shades: shadesLaid, shade: roomLaid.shade } : null
    return { inside: indoors ? indoors.k : null, storey, ...out, room,
      edges: roomLaid?.edges ?? null, cut: speckStats,
      regions: roomLaid?.regions ?? [], flights: roomLaid?.flights ?? [],
      // And the transform the frame drew it under, cell units to the glass, so
      // a check can say where a wall of the plan should be on the screen.
      xform: roomXform.length ? roomXform : null,
      // The wall's tone as it came out of the composition, wash and all, read
      // back off the room's own canvas rather than worked out again.
      wallTone: roomLaid?.wallCell ? [...roomLaid.c.getContext('2d')!.getImageData(
        roomLaid.wallCell[0] * roomLaid.S + (roomLaid.S >> 1),
        roomLaid.wallCell[1] * roomLaid.S + (roomLaid.S >> 1), 1, 1).data].slice(0, 3) : null }
  }
  /**
   * The ways out of the room the last frame drew, and where each one is on
   * the glass — see `composeExits`.
   *
   * `glass` is the door put through the transform the frame drew the room
   * under, and `out` a front door's way out turned the same way, so a check
   * can read the pixels there; `tones` is the room where nothing is marked.
   * The door's own world point is passed back unchanged, so the check can put
   * it through `__screen` itself and not only take this hook's word for it.
   */
  ;(window as unknown as { __roomFrame: () => unknown }).__roomFrame = () => {
    const [ax, ay] = camAim(hero.ix - lift, hero.iy + slide_)
    return {
      inside: indoors ? indoors.k : null, storey, zoom, want: zoomWant, mine: zoomIsMine,
      outdoor: outdoorZoom ? outdoorZoom.zoom : null, view: roomView,
      cam: { x: camX, y: camY }, aim: { x: ax, y: ay },
      settled: Math.hypot(camX - ax, camY - ay) < 0.05,
      far: pad.on ? PHONE_ZOOMS[0] : clampZoom(0), near: pad.on
        ? PHONE_ZOOMS[PHONE_ZOOMS.length - 1] : clampZoom(99),
      ladder: pad.on ? PHONE_ZOOMS : null, chrome: chromeRects(),
      glass: { w: canvas.width, h: canvas.height },
    }
  }
  ;(window as unknown as { __roomExits: () => unknown }).__roomExits = () => {
    const r = roomLaid
    if (!r || roomXform.length < 6) return null
    const [a, bb, c, d, e, f] = roomXform as [number, number, number, number, number, number]
    return {
      inside: indoors ? indoors.k : null, storey, drawn: exitsDrawn, mark: markPx,
      unmarked: roomPlan ? exitsUnmarked.get(roomPlan) ?? 0 : 0,
      // The doorways of the storey drawn: the ground's `doors`, or the
      // `upDoors` of the storey above it that the room was composed for.
      doors: !indoors ? 0 : roomPlan === indoors.plan ? indoors.doors.length
        : indoors.upDoors.filter((u) => u[0] === indoors!.floors.findIndex((f) => f === roomPlan)).length,
      ink: markInk, tones: r.tones, wallTone: r.tones[0] ?? null,
      exits: r.exits.map((x) => {
        const [i, j] = x.at
        const gx = a * x.along[0] + c * x.along[1], gy = bb * x.along[0] + d * x.along[1]
        const n = Math.hypot(gx, gy) || 1
        // And the threshold's own middle in the world, which for a doorway
        // is the gap it was laid across and not the portal's point.
        const [cx, cy] = roomPlan && indoors ? fromPlan(roomPlan, indoors,
          roomPlan.x0 + i * roomPlan.s, roomPlan.y0 + j * roomPlan.s) : [x.x, x.y]
        return { kind: x.kind, x: x.x, y: x.y, half: x.half, centre: { x: cx, y: cy },
          glass: { x: a * i + c * j + e, y: bb * i + d * j + f },
          out: { x: gx / n, y: gy / n } }
      }),
    }
  }
  /**
   * The flights of the room the last frame drew, and the marks it put on them.
   *
   * Each mark is passed back where it was drawn on the glass and where it
   * stands in the world, so a check can ask `__stairs` what that cell does
   * and read the triangle's own pixels to see which way it points.
   */
  ;(window as unknown as { __roomFlights: () => unknown }).__roomFlights = () => {
    const r = roomLaid, p = roomPlan, b = indoors
    if (!r || !p || !b || !b.plan) return null
    // Where each flight's cells are in the world, so a check can read the
    // treads of that flight and no other.  Labelled again rather than kept on
    // the room: a label a cell is four bytes of every storey's grid.
    const all = [b.plan, ...b.floors]
    const k = all.findIndex((q) => q === p)
    const sorted = roomCells(b, p, k > 0 ? all[k - 1]! : null)
    const { flight } = labelFlights(sorted.r, sorted.stairId)
    const where: [number, number][][] = r.flights.map(() => [])
    for (let n = 0; n < flight.length; n++) {
      const f = flight[n]!
      if (f < 0 || !where[f]) continue
      const i = (n / p.h) | 0, j = n % p.h
      const [x, y] = fromPlan(p, b, p.x0 + (i + 0.5) * p.s, p.y0 + (j + 0.5) * p.s)
      where[f]!.push([x, y])
    }
    return {
      inside: b.k, storey, cell: p.s, mark: markPx,
      flights: r.flights.map((fl, at) => ({ cells: fl.cells, where: where[at], up: fl.up, down: fl.down,
        both: fl.both, turned: fl.turned, marks: fl.marks.length, rule: fl.rule,
        tops: { up: fl.tops.up && { rise: fl.tops.up.rise, off: fl.tops.up.off },
          down: fl.tops.down && { rise: fl.tops.down.rise, off: fl.tops.down.off } } })),
      // `aim` is the way the triangle points on the glass, and `toward` the
      // same direction in the world, a unit vector — both null where the
      // flight says no end is the top and the triangle is up or down the glass.
      marks: marksLaid.map((m) => {
        const [x, y] = fromPlan(p, b, p.x0 + m.i * p.s, p.y0 + m.j * p.s)
        let toward = null
        if (m.dir) {
          const [x2, y2] = fromPlan(p, b, p.x0 + (m.i + m.dir[0]) * p.s, p.y0 + (m.j + m.dir[1]) * p.s)
          const l = Math.hypot(x2 - x, y2 - y) || 1
          toward = { x: (x2 - x) / l, y: (y2 - y) / l }
        }
        return { flight: m.flight, what: m.what, glass: { x: m.X, y: m.Y }, world: { x, y },
          aim: m.dir ? { x: m.gx, y: m.gy } : null, toward }
      }),
    }
  }
  /**
   * Every flight of every storey of every building that can be walked into,
   * and what said which end of it is the top — see `aimFlights`.  Sorted and
   * aimed without composing a room, the way the minimap sorts a storey, and
   * the sort is dropped afterwards so it holds nothing.
   *
   * `agree` holds the heights against the one thing a flight says outright:
   * of the flights whose cells lead both ways and whose heights say which
   * way, how many point from the down cells' mark to the up cells'.
   */
  /**
   * A storey's flights labelled the way `composeRoom` labels them — the same
   * scan and the same four-way flood over the same cells — without composing
   * anything, for the hooks that ask about flights the frame did not draw.
   */
  const labelFlights = (r: ReturnType<typeof roomPieces>, stairId: string | null) => {
    const W = r.W, H = r.H
    const flight = new Int32Array(W * H).fill(-1)
    const flights: Room['flights'] = []
    const stack: number[] = []
    const on = (o: number) => !!stairId && r.stair[o] === 1
    for (let n0 = 0; n0 < W * H; n0++) {
      if (flight[n0]! >= 0 || !on(n0)) continue
      let cells = 0
      flight[n0] = flights.length
      stack.push(n0)
      while (stack.length) {
        const m = stack.pop()!
        cells++
        const i = (m / H) | 0, j = m % H
        for (const o of [i > 0 ? m - H : -1, i < W - 1 ? m + H : -1, j > 0 ? m - 1 : -1, j < H - 1 ? m + 1 : -1]) {
          if (o >= 0 && flight[o]! < 0 && on(o)) { flight[o] = flights.length; stack.push(o) }
        }
      }
      flights.push({ cells, turned: false, up: 0, down: 0, both: 0, marks: [], rule: 'shape',
        ways: null, tops: { up: null, down: null } })
    }
    return { flight, flights }
  }
  ;(window as unknown as { __flightTops: () => unknown }).__flightTops = () => {
    const rows: { i: number; k: string; storey: number; cells: number; marked: boolean
      marks: { what: string; at: [number, number]; dir: [number, number] | null }[]
      rule: string; up: number[] | null; down: number[] | null; ways: number | null
      agree: boolean | null }[] = []
    buildings.forEach((b, bi) => {
      if (!b.plan || !b.doors.length) return
      const all = [b.plan, ...b.floors]
      all.forEach((q, s) => {
        const under = s ? all[s - 1]! : null
        const { r, stairId } = roomCells(b, q, under)
        const { flight, flights } = labelFlights(r, stairId)
        aimFlights(q, under, r, flight, flights)
        for (const fl of flights) {
          const u = fl.marks.find((m) => m.what === 'up'), d = fl.marks.find((m) => m.what === 'down')
          const dir = fl.rule === 'heights' ? (u?.dir ?? (d?.dir ? [-d.dir[0], -d.dir[1]] : null)) : null
          rows.push({ i: bi, k: b.k, storey: s - 1, cells: fl.cells, marked: fl.marks.length > 0,
            marks: fl.marks.map((m) => ({ what: m.what, at: m.at, dir: m.dir })),
            rule: fl.rule, up: fl.tops.up && [fl.tops.up.rise, fl.tops.up.off, fl.tops.up.cells],
            down: fl.tops.down && [fl.tops.down.rise, fl.tops.down.off, fl.tops.down.cells],
            ways: fl.ways && Math.hypot(fl.ways[0], fl.ways[1]),
            agree: fl.ways && dir ? fl.ways[0] * dir[0] + fl.ways[1] * dir[1] > 0 : null })
        }
      })
    })
    planCodes.clear()
    planCodesFor = null
    return rows
  }
  /**
   * Where the room the last frame drew laid outdoor ground, as world points —
   * see `Room.ground`.
   */
  ;(window as unknown as { __roomGround: () => unknown }).__roomGround = () => {
    const g = roomLaid?.ground
    if (!g) return []
    const out: [number, number][] = []
    for (let i = 0; i + 1 < g.length; i += 2) out.push([g[i]!, g[i + 1]!])
    return out
  }
  /**
   * Where the longest straight run of the room's outline is on the glass, and
   * a point in the world beside it to stand at.
   *
   * Put through the transform the last frame drew the room under, so what a
   * check reads off the glass there is where the picture's wall edge is if the
   * room was drawn as one shape — and a staircase beside the line if it was not.
   */
  ;(window as unknown as { __roomWall: () => unknown }).__roomWall = () => {
    const r = roomLaid, p = roomPlan, b = indoors
    if (!r || !p || !b || !r.outline || roomXform.length < 6) return null
    const [a, bb, c, d, e, f] = roomXform as [number, number, number, number, number, number]
    const o = r.outline
    const [i0, j0, i1, j1] = o.across ? [o.a, o.q0, o.a, o.q1] : [o.q0, o.a, o.q1, o.a]
    const glass = (i: number, j: number) => ({ x: a * i + c * j + e, y: bb * i + d * j + f })
    const [wx, wy] = fromPlan(p, b, p.x0 + ((i0 + i1) / 2) * p.s, p.y0 + ((j0 + j1) / 2) * p.s)
    return { from: glass(i0, j0), to: glass(i1, j1), cells: o.q1 - o.q0,
      world: { x: wx, y: wy }, turn: (Math.atan2(p.sn, p.c) * 180) / Math.PI }
  }
  /**
   * Stand on another storey.
   *
   * A setter, and it says so: climbing is a landing and a step, and a check
   * that walked the abbey's four floors would be measuring the staircase.
   * What is being checked is that the *map* follows the storey — which is a
   * rule about what `planNow` hands the painter — so the state is put there
   * and the rule is measured.
   */
  /**
   * For world points, how many storeys of the building you are in, above the
   * one you are on, have outline over each — read off the plans the bake
   * shipped, not off the drawing.  What the room drawing laid as outdoor ground
   * is `__roomGround`; this is the fact it is held against.
   */
  ;(window as unknown as { __storeysOver: (at: [number, number][]) => number[] | null })
    .__storeysOver = (at) => {
      const b = indoors
      if (!b) return null
      return at.map(([x, y]) => {
        let above = 0
        for (let s = storey + 1; s < b.floors.length; s++) {
          const f = b.floors[s]!
          if (bitAt(f.bits, planCell(f, b, x, y))) above++
        }
        return above
      })
    }
  ;(window as unknown as { __floor: (n: number) => unknown })
    .__floor = (n) => {
      if (!indoors) return null
      storey = Math.max(-1, Math.min(n, (indoors.floors?.length ?? 0) - 1))
      return { storey, floors: indoors.floors?.length ?? 0 }
    }

  /**
   * The minimap as pixels, and what it is a map *of*.
   *
   * Read off the canvas and not off the code that drew it: the failure this is
   * for is a circle showing the forest while the screen shows a room, and a
   * check that asked `paintMap` what it had decided would have agreed with it.
   */
  ;(window as unknown as { __minimap: () => unknown }).__minimap = () => {
    paintMap()
    const n = ui.map.width
    const px = mapCtx.getImageData(0, 0, n, n).data
    const seen: Record<string, number> = {}
    for (let i = 0; i < px.length; i += 4) {
      const hex = '#' + [px[i]!, px[i + 1]!, px[i + 2]!]
        .map((v) => v.toString(16).padStart(2, '0')).join('')
      seen[hex] = (seen[hex] ?? 0) + 1
    }
    const b = indoors
    return {
      inside: b ? b.k : null, storey, n, mark: mapMark, palette: PLAN_INK,
      hero: { x: hero.x, y: hero.y, dir: hero.dir },
      storeys: b ? b.floors.length + 1 : 0,
      plate: (document.querySelector('#map .storey') as HTMLElement | null)?.hidden === false
        ? document.querySelector('#map .storey')!.textContent : null,
      span: b ? Math.min(MAP_YARDS, 2 * Math.max(b.l, b.w) + 6) : MAP_YARDS,
      // Which of the two palettes the circle is painted out of, counted.
      ground: Object.entries(INK)
        .reduce((n2, [, hex]) => n2 + (seen[hex] ?? 0), 0),
      plan: Object.values(PLAN_INK)
        .reduce((n2, hex) => n2 + (seen[hex] ?? 0), 0),
      inks: Object.entries(seen).sort((a, c) => c[1] - a[1]).slice(0, 6),
      flightMarks: b ? Array.from({ length: mapFlightMarks.length >> 1 },
        (_, k) => [mapFlightMarks[2 * k]!, mapFlightMarks[2 * k + 1]!]) : [],
    }
  }

  /**
   * What the bake's own masks say about one spot on one storey of the building
   * you are in — the plan the minimap is held against, asked without the room's
   * sort in between.  `below` is the steps of the storey under it, which lead
   * down from this one.
   */
  ;(window as unknown as { __planAt: (x: number, y: number, s: number) => unknown })
    .__planAt = (x, y, s) => {
      const b = indoors
      if (!b || !b.plan) return null
      const all = [b.plan, ...b.floors]
      const q = all[s + 1]
      if (!q) return null
      const under = s >= 0 ? all[s]! : null
      const n = planCell(q, b, x, y)
      const on = (m: Uint8Array) => n >= 0 && bitAt(m, n)
      return { inside: on(q.bits), floor: on(q.floor), solid: on(q.solid), steps: on(q.steps),
        below: !!under && bitAt(under.steps, planCell(under, b, x, y)),
        roofed: b.k !== 'tent' && (!q.over.length || on(q.over)), cell: q.s }
    }
  /**
   * The shade the room the last frame drew was composed with, read back off
   * its canvas: for each room region, the mean brightness of its cells beside
   * something nobody can stand on against its cells well clear of all of it.
   * Every cell of a region is the same picture, so before the shade the two
   * means are one number.  Cells near a way out are left out, because the
   * thresholds and porches are laid over the shade.
   */
  ;(window as unknown as { __roomShade: () => unknown }).__roomShade = () => {
    const r = roomLaid, p = roomPlan, b = indoors
    const codes = p ? planCodes.get(p) : null
    // Only the storey he is on: a frame not yet drawn since a door or a flight
    // still has the last room laid, and its shade would answer for this one.
    if (!r || !p || !b || !codes || p !== planNow()) return null
    const W = p.w, H = p.h, S = r.S
    const d = r.c.getContext('2d')!.getImageData(0, 0, r.c.width, r.c.height).data
    const blocked = (i: number, j: number) => i < 0 || j < 0 || i >= W || j >= H
      || (codes[i * H + j]! !== CELL.floor && codes[i * H + j]! !== CELL.yard
        && codes[i * H + j]! !== CELL.speck && codes[i * H + j]! !== CELL.stairs)
    const clear = Math.ceil(BODY_YARDS / p.s) + 1
    const rows = new Map<number, { near: number; nNear: number; mid: number; nMid: number }>()
    for (let i = 0; i < W; i++) {
      for (let j = 0; j < H; j++) {
        const n = i * H + j
        if (codes[n] !== CELL.floor || r.region[n]! < 0) continue
        if (r.exits.some((x) => Math.hypot(x.at[0] - i, x.at[1] - j) < 4)) continue
        const beside = blocked(i - 1, j) || blocked(i + 1, j) || blocked(i, j - 1) || blocked(i, j + 1)
        let far = !beside
        for (let a = -clear; a <= clear && far; a++) {
          for (let c = -clear; c <= clear; c++) if (blocked(i + a, j + c)) { far = false; break }
        }
        if (!beside && !far) continue
        let sum = 0
        for (let y = j * S; y < (j + 1) * S; y++) {
          for (let x = i * S; x < (i + 1) * S; x++) {
            const o = (y * r.c.width + x) * 4
            sum += 0.3 * d[o]! + 0.6 * d[o + 1]! + 0.1 * d[o + 2]!
          }
        }
        const lum = sum / (S * S)
        const row = rows.get(r.region[n]!) ?? { near: 0, nNear: 0, mid: 0, nMid: 0 }
        if (beside) { row.near += lum; row.nNear++ } else { row.mid += lum; row.nMid++ }
        rows.set(r.region[n]!, row)
      }
    }
    return { inside: b.k, storey, shade: r.shade,
      regions: [...rows.entries()].filter(([, v]) => v.nNear && v.nMid)
        .map(([k, v]) => ({ region: k, near: v.near / v.nNear, nearCells: v.nNear,
          mid: v.mid / v.nMid, midCells: v.nMid })) }
  }

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

  /**
   * Whether placement would move a creature off this spot, for the check that
   * a deck is floor to it — asked of the rule and not only of the spawns,
   * because the one spawn left on a deck in this slice stands on a dry cell
   * and would stay put under either reading.
   */
  ;(window as unknown as { __placeTaken: (x: number, y: number) => boolean })
    .__placeTaken = (x, y) => taken(x, y)
  /** What placement decided about each spawn row — see `spawnFates`. */
  ;(window as unknown as { __spawnFates: () => string[] }).__spawnFates = () => [...spawnFates]
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
    // How a settle that did not take shows up.
    //
    // `wet` was written as "should be zero" and it never should have been:
    // eighteen of them are murlocs and a murloc lives in a lake.  What has to
    // be zero is a creature in water whose *kind* does not live there — see
    // `lives` below, which is derived from where each kind actually stands.
    //
    // `inside` is the same correction.  It counts anybody inside a building's
    // footprint, which was a fault when buildings were closed boxes and is
    // ordinary now that you can walk into one: a shopkeeper stands in a shop.
    // The number that has to be zero is `walled` — somebody inside the *wall*
    // itself, which is a 1.33-yard mask rounding a man into stone.
    return {
      total: npcs.length, unplaceable, settled, afloat, kinds, near,
      // Asked with the deck taken out, the way placement asks it: a guard on
      // a bridge is on the bridge, and counting him wet is the reading that
      // carried him off it.
      wet: npcs.filter((n) => afloatAt(n.x, n.y)).length,
      inside: npcs.filter((n) => solidAt(n.x, n.y)).length,
      /** Water dwellers, derived from where the kind stands — see above. */
      lives: [...lives],
      /** And the ones in water that are not: this has to be zero. */
      adrift: npcs.filter((n) => afloatAt(n.x, n.y) && !lives.has(n.art))
        .map((n) => `${n.art} (${Math.round(n.x)}, ${Math.round(n.y)})`),
      /**
       * Where the database put each creature and where placement left it, as
       * `[art, spawn x, spawn y, home x, home y, lives in water]`.
       *
       * The home and not the live position, because everything here wanders
       * and the rule being checked is about where it was put.
       */
      homes: npcs.map((n) => {
        const s = spawnOf.get(n)
        return [n.art, s ? s[0] : n.hx, s ? s[1] : n.hy, n.hx, n.hy,
          lives.has(n.art) ? 1 : 0]
      }),
      /** And anybody the wall mask closed on, which has to be zero. */
      walled: npcs.filter((n) => wallAt(n.x, n.y))
        .map((n) => `${n.art} (${Math.round(n.x)}, ${Math.round(n.y)})`),
    }
  }

  // The whole cast, for the behaviour tests: whether anybody wandered, whether
  // the ones behind a counter stayed at it, whether anybody left their patch.
  ;(window as unknown as { __all: () => unknown }).__all = () =>
    npcs.map((n) => ({
      x: n.x, y: n.y, hx: n.hx, hy: n.hy, art: n.art, r: n.r, wander: n.wander,
      kind: n.kind, level: n.level, role: n.role,
      // What it is holding and what comes off it, for the checks that read
      // `creature_equip_template` and `skinning_loot_template` back out.
      arm: n.arm, dual: n.dual,
      hide: !!n.hide, looted: n.looted, skinned: n.skinned, dead: !!n.dead,
      sunder: n.sunder, taunted: n.taunted, angry: n.angry,
      stance: aggressive(n.fight) ? 'enemy'
        : fightable(n.fight) ? 'quarry' : 'friend',
    }))
  ;(window as unknown as { __hero: () => unknown }).__hero = () => ({ x: hero.x, y: hero.y })
  /**
   * A copy of the trades that will not change under a check.
   *
   * `{ ...you.trades }` is a *shallow* copy and every value is the live
   * `[rank, ceiling]` pair, so a before-and-after around one node showed the
   * same number twice and the check that gathering teaches you something
   * failed while gathering was teaching perfectly well.
   */
  const tradesNow = (): Record<string, [number, number]> =>
    Object.fromEntries(Object.entries(you.trades)
      .map(([k, v]) => [k, [v[0], v[1]] as [number, number]]))
  /** The trades and how far along they are — for the check that skins one. */
  ;(window as unknown as { __trades: () => unknown }).__trades = () => ({
    mine: tradesNow(), know: [...recipes],
    can: Object.keys(craft.trades).map(Number),
  })
  /**
   * Take up a trade the way the trainer's own option does.
   *
   * `takeUp` and not a second copy of it: the purse is filled first because a
   * check standing in a field is not standing in front of a trainer, and
   * everything after the money is the real path.
   */
  ;(window as unknown as { __takeUp: (skill: number) => unknown })
    .__takeUp = (skill) => {
      const trade = craft.trades[String(skill)]
      if (!trade) return null
      const at = you.trades[String(skill)]
      const step = nextRank(trade, at?.[0] ?? 0, at?.[1] ?? 0, you.level)
      if (!step) return { at: tradesNow()[String(skill)] ?? null, step: null }
      you.purse += step[1]
      const no = takeUp(skill, step)
      return { no, at: tradesNow()[String(skill)] ?? null, know: recipes.length }
    }
  /** What the workbench would show for a trade, and making one of a row. */
  ;(window as unknown as {
    __craft: (skill: number, spell?: number) => unknown
  }).__craft = (skill, spell) => {
    const rows = craft.recipes.filter((r) => r[R_SKILL] === skill
      && recipes.includes(r[R_SPELL]))
    if (spell === undefined) {
      return rows.map((r) => ({
        spell: r[R_SPELL], rank: r[R_RANK], makes: r[R_MAKES],
        needs: r[R_NEEDS], can: !lacking(r[R_NEEDS], you.bag).length,
      }))
    }
    const r = rows.find((x) => x[R_SPELL] === spell)
    if (!r) return { said: '모르는 조리법' }
    const before = { ...you.bag }
    return { said: flat(makeOne(r)), before, after: { ...you.bag },
             at: tradesNow()[String(skill)] ?? null }
  }
  /**
   * Where he stands, what a shop charges him, and what an errand would pay.
   *
   * The price comes back through `priceAt` rather than being worked out here,
   * for the reason `__buy` learned the hard way: a check that reads a second
   * implementation is reading something the player never touches.
   */
  ;(window as unknown as { __stands: (entry?: number) => unknown })
    .__stands = (entry) => {
      const out: Record<string, unknown> = {}
      for (const [word, faction] of Object.entries(SIDE_WORD)
        .map(([f, w]) => [w, Number(f)] as [string, number])) {
        out[word] = { faction, at: standWith(faction), rank: rankWith(faction) }
      }
      return {
        sides: !!sides, stands: { ...stands }, words: out,
        ...(entry === undefined ? {} : {
          entry, of: shelf.of?.[String(entry)] ?? 0,
          price: priceAt(entry, 1000),
        }),
      }
    }
  /** Hand a standing over the way an errand does, for the check that it lands. */
  ;(window as unknown as { __pay: (rep: [number, number][]) => unknown })
    .__pay = (rep) => ({ said: payStanding(rep), stands: { ...stands } })
  /** What is in the bag, by item id, and what using one of them does. */
  ;(window as unknown as { __bag: (id?: number) => unknown }).__bag = (id) =>
    id === undefined ? { ...you.bag }
      : { said: useItem(id), hp: you.hp, max: you.max,
          using: you.using ? { ...you.using } : null, bag: { ...you.bag } }
  /**
   * The bits of the player a check reads back: rage, the stance he is
   * standing in, and what the stance is worth.
   */
  /**
   * Hurt him, so the check that he heals has something to heal.
   *
   * A setter and not a second regen loop: everything after this goes through
   * the frame the player's does.
   */
  ;(window as unknown as { __hurt: (to: number) => unknown }).__hurt = (to) => {
    you.hp = Math.max(1, Math.min(you.max, to))
    you.calm = 0
    return { hp: you.hp, max: you.max, calm: you.calm }
  }
  /**
   * Fill the bar the class fights on, for the checks that compare two
   * arrangements.
   *
   * A comparison has to start both runs from the same state, and the one that
   * matters here is the resource: the check that asserts *the leftmost square
   * it can use* fires two abilities in both orders, and the first run spends
   * the rage the second one needs.  One run would then fire the right-hand
   * square for a reason that is true — it could not use the left one — and the
   * check would read it as the rule being broken.
   */
  ;(window as unknown as { __fuel: () => unknown }).__fuel = () => {
    you.power = powerMax()
    you.spent = 0
    return { power: Math.round(you.power), of: Math.round(powerMax()) }
  }
  /**
   * Put one ability on its own cooldown for this many seconds, or take it off.
   *
   * For the other half of *the leftmost square it can use*: with the bar full
   * of rage every square is usable and the leftmost is the answer whether or
   * not anything was skipped.  A cooldown is the one way to make a square
   * unusable that no swing in the meantime can undo.
   */
  ;(window as unknown as { __cool: (id: number, secs: number) => unknown })
    .__cool = (id, secs) => {
      you.cools[id] = secs > 0 ? clock + secs : 0
      return { id, until: you.cools[id] }
    }
  ;(window as unknown as { __you: () => unknown }).__you = () => ({
    level: you.level, hp: you.hp, max: you.max, calm: +you.calm.toFixed(2),
    rage: Math.round(you.power),
    power: Math.round(you.power), powerWord: you.powerWord,
    powerMax: Math.round(powerMax()), combo: you.combo,
    casting: you.casting?.sp.id ?? null,
    cls: myClass, spells: spells.map((sp) => sp.id),
    stance: you.stance, target: you.target?.kind ?? null, ...stanceOf(),
  })
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
    __plotAt: (x: number, y: number) =>
    { wall: boolean; floor: boolean; roofed: boolean; of: number } | null
  }).__plotAt = (x, y) => {
    const got = inBuilding(x, y, 0)
    if (!got) return null
    // And whether there is anything over your head, which is the one thing
    // that tells a courtyard from a room — see the `over` mask.
    const p = got.b.plan
    const roofed = !p || !p.over.length
      || bitAt(p.over, planCell(p, got.b, x, y))
    // Whose plan answered, in `__buildings()` order: a stable beside a wall
    // piece is two plans, and a check about one must not count the other's.
    return { wall: got.wall, floor: got.floor, roofed, of: buildings.indexOf(got.b) }
  }
  /** What the readout says at a spot, for the check that indoors is a place. */
  /**
   * Why the world has the population it has, for the check that asks whether
   * it looks empty.
   *
   * Four numbers and they mean different things: what the bake shipped, who
   * stands in a place this game draws, who is waiting a turn in a shared slot,
   * and how wide a screen actually is in yards.  The last one is the one
   * nobody had written down.
   */
  ;(window as unknown as { __people: () => unknown }).__people = () => ({
    shipped: spawns.npcs.length,
    placed: npcs.length,
    /** Standing right now: a shared slot stands up only so many at once. */
    up: npcs.filter((n) => n.up).length,
    waiting: npcs.filter((n) => !n.up).length,
    inStormwind: elsewhere,
    noPicture: unplaceable,
    /** How much ground the glass covers, which decides how empty it looks. */
    yardsWide: canvas.width / (PPY * zoom),
    yardsTall: canvas.height / (PPY * zoom),
    zoom,
  })
  /** Who was on screen and left out anyway, last frame. */
  ;(window as unknown as { __hidden: () => unknown }).__hidden = () =>
    hidden.map((n) => ({ x: n.x, y: n.y, kind: n.kind, why: n.why }))
  /**
   * Whether the scene would leave each of these people out right now, and
   * why — `sightOf`, which is the draw loop's own decision, asked between
   * frames.  By index into `__all()`.
   */
  ;(window as unknown as { __sight: (at: number[]) => (string | null)[] })
    .__sight = (at) => at.map((i) => (npcs[i] ? sightOf(npcs[i]!).why : null))
  /** What a building's outline was painted with, last frame, by tile name. */
  ;(window as unknown as { __underRoof: () => Record<string, number> })
    .__underRoof = () => Object.fromEntries(indoorPaint)
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
  /**
   * The shared slots, and what the clock is doing to them.
   *
   * `at` lets a check ask about a moment rather than about now — the whole
   * claim being that the standing set is a function of the clock, and a check
   * that can only see one moment cannot test a function.
   */
  ;(window as unknown as { __pools: (at?: number) => unknown }).__pools =
    (at) => {
      const when = at ?? Date.now() / 1000
      const which = (pool: number, members: { back: number; most?: number }[],
        limit: number) => standing(pool, members.map((_m, i) => i), limit,
        members[0]?.back ?? 0, when).join(',')
      return {
        creatures: [...byPoolNpc].map(([pool, members]) => ({
          pool, members: members.length,
          most: members[0]?.most || members.length,
          period: members[0]?.back ?? 0,
          up: which(pool, members, members[0]?.most || members.length),
        })),
        nodes: [...byPool].map(([pool, members]) => ({
          pool, members: members.length,
          most: things.pools?.[String(pool)] ?? members.length,
          period: members[0]?.back ?? 0,
          up: which(pool, members, things.pools?.[String(pool)] ?? members.length),
        })),
      }
    }
  /**
   * Every baked object, and where each one went.
   *
   * The sum has to be the whole: `drawn + the reasons = baked`.  A remainder
   * is a filter nobody wrote down, which is the thing this exists to catch —
   * and it is not hypothetical, it is how 731 objects went missing with
   * nothing to say so.
   */
  ;(window as unknown as { __lost: () => unknown }).__lost = () => {
    const baked = (things.objects ?? []).length
    const drawn = placed.filter((q) => q.node).length
    const named = Object.values(lostThings).reduce((a, b) => a + b, 0)
    return {
      baked, drawn, standing: nodes.filter((n) => n.up).length,
      why: { ...lostThings },
      // And where the elsewhere ones are, biggest first.
      where: Object.fromEntries(Object.entries(lostZone)
        .sort((a, b) => b[1] - a[1])),
      // The gathering slots, which is the half of this the issue asked about:
      // fifty are baked and the ones that stand are the ones in this game.
      pools: { baked: Object.keys(things.pools ?? {}).length,
        standing: byPool.size },
      // What nothing accounted for.  Zero, or somebody has added a filter and
      // not a name for it.
      unaccounted: baked - drawn - named,
    }
  }
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
      return { skill: n.skill, got: flat(gather(n)), up: n.up }
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
    const before = tradesNow()
    const got = flat(gather(n))
    return { kind, trade: n.trade, skill: n.skill, got, before,
      after: tradesNow(), up: n.up, due: n.due }
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
  /** And whether a building shuts it, which is a wider question than a wall. */
  ;(window as unknown as { __shutOut: (x: number, y: number) => boolean })
    .__shutOut = (x, y) => shutOut(x, y)
  /**
   * Put the player somewhere, the way every teleport in this game does.
   *
   * `__cam` will not do for the check that guards this: it calls `placeHero`
   * twice, once an axis, which is two landings and not one.
   */
  /**
   * Hand him something wearable he has not got on, for the check that the
   * sheet's picture does not change when the squares do.
   *
   * Out of the shipped shelf rather than an invented row: a check that dresses
   * a character in an item this world does not have is dressing somebody else.
   */
  /**
   * Open a shopkeeper's window without walking there, and take what falls off
   * the nearest body — both for the checks that read the *colour* on the
   * glass rather than the call that put it there.
   *
   * Through `openShop` and `loot`, which are the paths a player takes: a check
   * that builds its own rows is reading its own copy, which is how `__buy`
   * once bought past a limited shelf.
   */
  ;(window as unknown as { __openShopAt: (entry: number) => unknown })
    .__openShopAt = (entry) => {
      // Nought shuts it, through the same call the conversation uses: a check
      // that leaves a window open is a check that makes the next one click on
      // a panel.
      if (!entry) { shutShop(); return null }
      const who = npcs.find((n) => n.entry === entry)
      if (!who) return null
      openShop(who)
      return { kind: who.kind, rows: shelf.stock?.[String(entry)]?.length ?? 0 }
    }
  ;(window as unknown as { __lootNearby: () => unknown }).__lootNearby = () => {
    // **Until something actually falls.**  A haul is a roll, so the first body
    // is often empty — and a check that reads a colour off a line saying
    // `아무것도 없다` is reading whatever was in the log before it.
    for (let tries = 0; tries < 40; tries++) {
      let at = npcs.find((n) => n.dead && !n.looted && n.haul?.[2]?.length)
      if (!at) {
        const foe = npcs.find((n) => !n.dead && n.fight && n.haul?.[2]?.length)
        if (!foe) return null
        foe.hp = 0; foe.dead = clock; foe.looted = false
        at = foe
      }
      placeHero(at.x - 1, at.y)
      const got = loot(at)
      const said = flat(got)
      // Coin is not a thing with a quality on it, so a body that dropped only
      // money proves nothing about the colour.
      if (!got.some((b) => Array.isArray(b))) continue
      ui.log([`${nameOf(at.kind)}에게서 `, ...got], 'gain')
      return { kind: at.kind, said,
        tinted: got.filter((b) => Array.isArray(b)).length }
    }
    return null
  }
  ;(window as unknown as { __giveItem: () => unknown }).__giveItem = () => {
    // **For a slot he has nothing in**, so putting it on is certain: `dressUp`
    // only wears an upgrade, and anything beats nothing.  A check that dresses
    // a character and cannot be sure he got dressed is a check that passes on
    // an empty change.
    const empty = SLOTS.filter((s2) => gear[s2] === undefined)
    for (const slot of empty) {
      for (const key of Object.keys(shelf.items ?? {})) {
        const id = Number(key)
        const it = itemOf(id)
        if (!it || it[I_SLOT] !== slot) continue
        if (!canWear(it, you.level, myClass)) continue
        held.push(id)
        return { id, slot, had: held.length }
      }
    }
    return null
  }
  ;(window as unknown as { __put: (x: number, y: number) => unknown })
    .__put = (x, y) => { placeHero(x, y); return { x: hero.x, y: hero.y } }
  /**
   * **Test only**: put him exactly here, inside a wall if that is where here is.
   *
   * Every way the game moves him goes through `placeHero`, which since issue
   * 165 moves him off a cell nobody can stand on — so the check on escaping a
   * wall teleported into one with `__cam`, landed two yards outside it, and
   * measured a walk across open ground.  Getting into a rock is the thing the
   * game now prevents; getting out of one is the rule under test, and that
   * has to start inside.
   */
  ;(window as unknown as { __putUnchecked: (x: number, y: number) => unknown })
    .__putUnchecked = (x, y) => {
      hero.x = x; hero.y = y
      hero.was.x = x; hero.was.y = y
      hero.ix = x; hero.iy = y
      camX = x; camY = y
      if (indoors && !stillInside(indoors, x, y)) { indoors = null; storey = -1 }
      return { x: hero.x, y: hero.y, wall: wallAt(x, y), refused: footing(x, y) }
    }
  /**
   * The two seams, run on demand, and what floor the player is on.
   *
   * `__put` places him; it does not walk him, so neither seam fires.  A check
   * that wants to know whether a staircase works has to be able to stand on
   * one and then ask.
   */
  ;(window as unknown as { __seam: () => unknown }).__seam = () => {
    // Put down on a door from outside, he goes in the way the checks always
    // have — see `putInside`; walking is `throughTheDoor`'s alone.
    const at = indoors ? null : buildings.find((b) => b.plan && porchesOf(b).length
      && b.doors.some(([dx, dy]) => Math.hypot(dx - hero.x, dy - hero.y) < DOORSTEP))
    const door = at?.doors.find(([dx, dy]) => Math.hypot(dx - hero.x, dy - hero.y) < DOORSTEP)
    if (at && door) putInside(at, door)
    else throughTheDoor()
    upOrDown()
    return { inside: indoors ? indoors.k : null, storey,
      floors: indoors?.floors.length ?? 0 }
  }
  /**
   * Where the stairs of the floor the player is on come out in the world.
   *
   * The plan is in the model's own space and turned by the placement, so a
   * check cannot work this out from the masks alone without a second copy of
   * `planCell`'s inverse — which is the sort of second copy this repository
   * spends its rounds deleting.
   */
  /**
   * What the stairs of the floor you are on can do, cell by cell.
   *
   * `upOrDown` reads two masks — this floor's `steps`, which lead up, and the
   * floor below's, which lead down — and where a cell is in both it takes the
   * up.  Whether that ever happens, and how often, was never measured; issue
   * 220 could not tell a latch that would not release from a staircase that
   * only ever points one way.
   */
  /** What the last frame drew inside a building, by storey — see the pair. */
  ;(window as unknown as { __shown: () => unknown }).__shown = () => ({
    storey, inside: indoors ? indoors.k : null,
    props: indoorProps.map((r) => r.slice()),
    folk: indoorFolk.map((r) => r.slice()),
  })
  ;(window as unknown as { __rungs: () => unknown }).__rungs = () => {
    const b = indoors
    const here = planNow()
    if (!b || !here) return null
    const below = planUnder()
    let up = 0, down = 0, both = 0
    for (let i = 0; i < here.w; i++) {
      for (let j = 0; j < here.h; j++) {
        const n = i * here.h + j
        const u = bitAt(here.steps, n)
        // The floor below is a different grid; ask it through the world, the
        // way `upOrDown` does, rather than by index.
        const lx = here.x0 + (i + 0.5) * here.s
        const ly = here.y0 + (j + 0.5) * here.s
        const uu = lx * here.sn + ly * here.c, vv = lx * here.c - ly * here.sn
        const d = !!below
          && bitAt(below.steps, planCell(below, b, b.x + uu, b.y - vv))
        if (u && d) both++
        else if (u) up++
        else if (d) down++
      }
    }
    return { storey, floors: b.floors.length, up, down, both, k: b.k }
  }
  ;(window as unknown as { __stairs: () => (number | null)[][] }).__stairs = () => {
    const b = indoors
    if (!b) return []
    /**
     * **Both masks, and every cell of them** — which is two corrections to
     * what this used to return, and issue 220 could not tell them apart from a
     * latch that would not release.
     *
     * It returned this floor's `steps` alone.  `upOrDown` reads *two* masks —
     * this floor's, which lead up, and the floor below's, which lead down — so
     * at the top of a building this answered nothing at all while the way down
     * was under the player's feet: the abbey's second floor has 1,253 cells
     * that lead down and none that lead up.  A check built on it could climb
     * and never descend.
     *
     * And it walked the grid `i += 2, j += 2`, so three cells in four were
     * never named.  A check that walks two yards on to "a stair" and lands
     * between the ones it was told about is a check that reports a staircase
     * nobody can use.
     */
    const here = storey >= 0 ? b.floors[storey] : b.plan
    const below = storey > 0 ? b.floors[storey - 1] : (storey === 0 ? b.plan : null)
    /**
     * And **which way each one goes**, because they are not interchangeable
     * and a caller that cannot tell them apart walks in circles.  The
     * building with three floors that this check could only climb one of has
     * 420 cells that lead down on its ground floor against 115 that lead up:
     * picked at random, three tries in four take you the wrong way, and the
     * next try starts from the wrong floor.
     *
     * `1` leads up, `-1` leads down, `0` is both — a landing between two
     * flights, where `upOrDown` takes the up.
     *
     * And **how high the tread is**, straight off the bake's bytes and not
     * through the flights' fit: the fourth column is the tread of this floor's
     * mask and the fifth the floor below's, each in yards from its own sill,
     * `null` where that mask has no step.  A check holds a mark's direction
     * against these.
     */
    const out: (number | null)[][] = []
    const mark = new Map<string, (number | null)[]>()
    const [unit, zero] = meta.planRise ?? [0, 0]
    for (const [way, p] of [[1, here], [-1, below]] as [number, Plan][]) {
      if (!p) continue
      const zs = risesOf(p)
      for (let i = 0; i < p.w; i++) {
        for (let j = 0; j < p.h; j++) {
          if (!bitAt(p.steps, i * p.h + j)) continue
          const lx = p.x0 + (i + 0.5) * p.s, ly = p.y0 + (j + 0.5) * p.s
          const u = lx * p.sn + ly * p.c, v = lx * p.c - ly * p.sn
          const x = b.x + u, y = b.y - v
          const key = `${x.toFixed(2)},${y.toFixed(2)}`
          const z = zs[i * p.h + j]! >= 0 ? (zs[i * p.h + j]! - zero) * unit : null
          const had = mark.get(key)
          if (had) { had[2] = 0; had[way > 0 ? 3 : 4] = z; continue }
          const row = [x, y, way, way > 0 ? z : null, way > 0 ? null : z]
          mark.set(key, row)
          out.push(row)
        }
      }
    }
    return out
  }
  /**
   * Whether a step on to this spot is allowed at all — the whole question and
   * not one of its halves.
   *
   * `__wallAt` is a building's stone and nothing else, which is the wrong
   * probe for "how much world is there": it says nothing about water, a chunk
   * the slice does not cover, or the mouth of a mine.
   */
  ;(window as unknown as { __canWalk: (x: number, y: number) => boolean })
    .__canWalk = (x, y) => !footing(x, y)
  /**
   * How much world there is, by whichever yardstick you name.
   *
   * There are two "you cannot go there" in this game and they disagree by
   * thirteen times.  `footing` is what a *step* is held to — water, trees,
   * buildings, people — and `blocked` is that plus anything steeper than the
   * cliff limit, which is what the door checks, the creatures and the harness
   * use.  A player is allowed on to steep ground and `slide` pushes him back
   * down, so neither measure is wrong and neither is the whole answer: the
   * mask is open and the legs cannot make the climb.
   *
   * Measured here rather than in the check because the classification is the
   * point.  A flood that comes back with a number says the world shrank; a
   * flood that says *what refused each step on its frontier* says where.
   */
  ;(window as unknown as {
    __reach: (rule?: string, step?: number) => unknown
  }).__reach = (rule = 'leg', S = 4, limit = CLIFF) => {
    // The yardsticks, side by side, because comparing them is the point.
    //
    //   leg      the step question — how far the ground rises between here
    //            and there.  What a walk is actually held to.
    //   blocked  where a man cannot be: the gentlest step on to the cell
    //   footing  everything that stops a step that is not a slope
    //   wall     a building's stone and nothing else
    //   cell     what `blocked` used to be — the worst step out of the cell
    //            in any of four directions, which sealed the valley
    const shut = rule === 'footing' ? footing
      : rule === 'wall' ? (x: number, y: number) => wallAt(x, y)
      : rule === 'cell' ? (x: number, y: number) =>
        (onSpan(x, y) ? false : stepAt(x, y) > limit) || footing(x, y)
      : blocked
    const B = meta.bounds
    const seen = new Set<string>()
    const key = (x: number, y: number) =>
      `${Math.round(x / S)},${Math.round(y / S)}`
    const from = { x: START[0]!, y: START[1]! }
    const stack: [number, number][] = [[from.x, from.y]]
    seen.add(key(from.x, from.y))
    // Why the frontier stopped, one tally a reason.  A cell can be refused by
    // more than one thing and every reason it was refused by is counted: what
    // this is for is "which rule is the wall", and a first-match tally answers
    // the order the conditions happen to be written in instead.
    const why: Record<string, number> = {}
    let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity]
    while (stack.length) {
      const [x, y] = stack.pop()!
      lo = [Math.min(lo[0]!, x), Math.min(lo[1]!, y)]
      hi = [Math.max(hi[0]!, x), Math.max(hi[1]!, y)]
      for (const [ax, ay] of [[S, 0], [-S, 0], [0, S], [0, -S]]) {
        const px = x + ax!, py = y + ay!
        if (px < B[0]! || px > B[1]! || py < B[2]! || py > B[3]!) continue
        const k = key(px, py)
        if (seen.has(k)) continue
        seen.add(k)
        // Tested **along** the step and not only at the end of it.  A flood
        // that steps four yards and asks once hops a wall two yards thick:
        // the way west out of Northshire came out open on the mask and the
        // walk stopped dead on a four-yard hall it had jumped clean over.
        // Sampled at the plan's own pitch, which is what a wall is drawn at.
        let stop = false
        const far = Math.hypot(px - x, py - y)
        for (let t = YD_PER_TILE; t <= far && !stop; t += YD_PER_TILE) {
          const mx = x + ((px - x) * t) / far, my = y + ((py - y) * t) / far
          stop = rule === 'leg'
            ? (footing(mx, my) || (!onSpan(mx, my) && climb(x, y, mx, my) > limit))
            : shut(mx, my)
        }
        if (!stop) { stack.push([px, py]); continue }
        const on = onSpan(px, py)
        if (!on && climb(x, y, px, py) > limit) why['steep'] = (why['steep'] ?? 0) + 1
        if (!on && closedAt(px, py)) why['off the slice'] = (why['off the slice'] ?? 0) + 1
        if (!on && openHole(px, py)) why['a hole'] = (why['a hole'] ?? 0) + 1
        if (solidAt(px, py)) why['scenery'] = (why['scenery'] ?? 0) + 1
        if (shutOut(px, py)) why['a building'] = (why['a building'] ?? 0) + 1
        if (npcAt(px, py, null)) why['somebody standing there'] = (why['somebody standing there'] ?? 0) + 1
      }
    }
    return {
      rule, step: S, cells: seen.size,
      goldshire: seen.has(key(-9461.6, 16.19)),
      abbey: seen.has(key(-8930, -200)),
      box: [lo[0], hi[0], lo[1], hi[1]],
      why,
      has: (x: number, y: number) => seen.has(key(x, y)),
    }
  }

  /**
   * A way from the start to somewhere, over the step rule, as waypoints.
   *
   * The third yardstick this issue wanted, and the only one that is not a
   * mask: a check can walk it.  A mask that is open and a pair of legs that
   * cannot make the trip are two different claims, and until something walked
   * the route there was nothing between them — the flood said the world was
   * three hundred thousand cells while a straight push from the start stopped
   * at a fence nine yards on.
   *
   * Thinned to the corners, because a check that steers at every four-yard
   * cell is testing the check's own steering.
   */
  ;(window as unknown as {
    __path: (x: number, y: number, step?: number) => unknown
  }).__path = (tx, ty, S = 4) => {
    const B = meta.bounds
    const key = (x: number, y: number) =>
      `${Math.round(x / S)},${Math.round(y / S)}`
    const from = { x: START[0]!, y: START[1]! }
    const came = new Map<string, [number, number] | null>()
    came.set(key(from.x, from.y), null)
    const queue: [number, number][] = [[from.x, from.y]]
    const goal = key(tx, ty)
    let head = 0
    while (head < queue.length) {
      const [x, y] = queue[head++]!
      if (key(x, y) === goal) break
      for (const [ax, ay] of [[S, 0], [-S, 0], [0, S], [0, -S]]) {
        const px = x + ax!, py = y + ay!
        if (px < B[0]! || px > B[1]! || py < B[2]! || py > B[3]!) continue
        const k = key(px, py)
        if (came.has(k)) continue
        // Along the step, for the reason `__reach` gives: a four-yard hop
        // over a two-yard wall is a route nothing can walk.
        let stop = false
        const far = Math.hypot(px - x, py - y)
        for (let t = YD_PER_TILE; t <= far && !stop; t += YD_PER_TILE) {
          const mx = x + ((px - x) * t) / far, my = y + ((py - y) * t) / far
          stop = footing(mx, my)
            || (!onSpan(mx, my) && climb(x, y, mx, my) > CLIFF)
        }
        if (stop) continue
        came.set(k, [x, y])
        queue.push([px, py])
      }
    }
    if (!came.has(goal)) return null
    // Walk the trail back, then keep only the turns.
    const back: [number, number][] = []
    let at: [number, number] | null =
      queue.find((q) => key(q[0], q[1]) === goal) ?? null
    while (at) { back.push(at); at = came.get(key(at[0], at[1])) ?? null }
    back.reverse()
    const turns: [number, number][] = []
    for (let i = 1; i < back.length - 1; i++) {
      const a = back[i - 1]!, b = back[i]!, c = back[i + 1]!
      if ((b[0] - a[0]) !== (c[0] - b[0]) || (b[1] - a[1]) !== (c[1] - b[1])) {
        turns.push(b)
      }
    }
    if (back.length) turns.push(back[back.length - 1]!)
    return { cells: back.length, yards: (back.length - 1) * S, turns, trail: back }
  }

  /** The height grid's own cell, which is what a step ought to be measured in. */
  ;(window as unknown as { __grid: () => number }).__grid = () => U
  /**
   * The screen that makes a character, as it stands, and what made it.
   *
   * Both halves on purpose: what the screen offers *and* the table it is
   * supposed to have come from.  A check that only reads the screen is a check
   * that agrees with whatever the screen happens to say — the pairs are the
   * assertion, and `CharBaseInfo.dbc` is 62 rows of them.
   */
  ;(window as unknown as { __make: () => unknown }).__make = () => {
    const box = document.getElementById('create')
    const pick = (sel: string) =>
      Array.from(box?.querySelectorAll(sel) ?? [])
      .map((e) => ({
        word: (e.querySelector('.word') as HTMLElement)?.textContent ?? '',
        can: !e.classList.contains('off'),
        why: (e.querySelector('.why') as HTMLElement)?.textContent ?? '',
        w: Math.round((e as HTMLElement).getBoundingClientRect().width),
        h: Math.round((e as HTMLElement).getBoundingClientRect().height),
      }))
    // A drop-down's rows have no box of their own while it is shut, so each
    // one reports the size of the control it is chosen through.
    const drop = (sel: string) => {
      const s = box?.querySelector(sel) as HTMLSelectElement | null
      const r = s?.getBoundingClientRect()
      return Array.from(s?.options ?? []).map((o) => ({
        word: o.dataset.word ?? '',
        can: !o.disabled,
        why: o.dataset.why ?? '',
        w: Math.round(r?.width ?? 0),
        h: Math.round(r?.height ?? 0),
      }))
    }
    return {
      up: box ? !box.hidden : false,
      made: me ? { ...me } : null,
      race: makeRace, cls: makeClass, sex: makeSex,
      races: drop('.races select'),
      classes: drop('.classes select'),
      sexes: pick('.sexes .pick'),
      // The table the screen is supposed to be made of.
      pairs: layout?.who?.pairs ?? [],
      names: layout?.who?.classes ?? {},
      size: layout?.spec?.create ?? {},
    }
  }
  /** Make one, so a check can get into the world without typing. */
  /**
   * The characters there are, and which one is being played.
   *
   * What a check needs to say that two slots do not mix: the list is the
   * store's, the names are the players' own, and `mine` is the slot the
   * character on screen is actually being written to.
   */
  ;(window as unknown as { __picks: () => unknown }).__picks = () => ({
    slots: roomFor(),
    mine: me ? mySlot : 0,
    up: !document.getElementById('pick')?.hidden,
    // Whether the question before a delete is on the screen.
    asking: !(document.querySelector('#pick .confirm') as HTMLElement | null)?.hidden,
    rows: cards.map((c) => ({
      slot: c.slot,
      name: c.save.you.who?.name ?? '',
      cls: c.save.you.who?.cls ?? 0,
      level: c.save.you.level,
    })),
  })
  /** Choose and enter a slot, the way the screen's own button does. */
  ;(window as unknown as { __pickOne: (slot: number) => unknown })
    .__pickOne = (slot) => {
      const card = cards.find((c) => c.slot === slot)
      if (!card) return null
      intoWorld(card)
      return { slot, name: me?.name ?? '' }
    }
  /** And make room for another, which is what the list's own button does. */
  ;(window as unknown as { __pickNew: () => unknown }).__pickNew = () => {
    const free = freeSlot(cards, roomFor())
    if (free === null) return null
    mySlot = free
    ui.setPick(false, {} as never)
    drawCreate()
    return { slot: free }
  }
  /**
   * And remove one — **through the question, not around it.**
   *
   * This used to filter the list and wipe the slot itself, which was exactly
   * what the screen's own button did on a single press; now the button asks
   * for the name, and a hook that went round the question would keep the old
   * checks green whatever became of it.  So it presses what a player presses:
   * choose the row, open the question, type, and press 삭제.  `typed` is what
   * goes in the box, the character's own name when it is left out, so a check
   * can also type the wrong one.  `open` says whether the button would press.
   */
  ;(window as unknown as { __pickErase: (slot: number, typed?: string) => unknown })
    .__pickErase = (slot, typed) => {
      const card = cards.find((c) => c.slot === slot)
      if (!card) return null
      chosen = slot
      drawPick()
      const q = <T extends HTMLElement>(sel: string) =>
        document.querySelector(`#pick ${sel}`) as T | null
      q<HTMLButtonElement>('.foot .erase')?.click()
      const box = q<HTMLInputElement>('.confirm .name')
      if (!box) return null
      box.value = typed ?? (card.save.you.who?.name || '주인공')
      box.dispatchEvent(new Event('input'))
      const yes = q<HTMLButtonElement>('.confirm .really')
      const open = !!yes && !yes.disabled
      yes?.click()
      return { open, left: cards.length }
    }

  ;(window as unknown as { __makeOne: (name: string, cls?: number) => unknown })
    .__makeOne = (name, cls) => {
      makeName = name
      // And which class, because a check that can only make a warrior can
      // only ever check a warrior — which is how "every class has a
      // spellbook" stayed true and unexamined for as long as there was one.
      if (cls !== undefined) makeClass = cls
      drawCreate()
      const ok = document.querySelector('#create .ok') as HTMLButtonElement
      ok?.click()
      return { made: me ? { ...me } : null }
    }

  /** Everything that has an opinion about one spot, for finding a wall. */
  ;(window as unknown as { __why: (x: number, y: number) => unknown }).__why =
    (x, y) => ({
      z: Math.round(groundAt(x, y) * 10) / 10,
      step: Math.round(stepAt(x, y) * 1000) / 1000, cliff: CLIFF,
      steep: !onSpan(x, y) && stepAt(x, y) > CLIFF,
      wet: wetAt(x, y), depth: depthAt(x, y),
      solid: solidAt(x, y), closed: closedAt(x, y), hole: openHole(x, y),
      shut: shutOut(x, y), span: onSpan(x, y),
      footing: footing(x, y), blocked: blocked(x, y),
    })

  /**
   * The water, and how much of it a man can get into and out of again.
   *
   * Flooded from where a character starts rather than counted cell by cell,
   * because "can be entered" and "can be reached" are different claims and it
   * is the second one that matters: a lake you can stand in but not swim to
   * is no better than a wall.  Reaching it from dry land also answers getting
   * out, since the flood only connects cells a step can cross either way.
   *
   * 1,469 cells of water within twelve hundred yards of the start and two of
   * them could be entered, which is what "water is a wall" looked like as a
   * number.
   */
  ;(window as unknown as { __water: (yards?: number) => unknown }).__water =
    (yards = 1200) => {
      const sx = START[0]!, sy = START[1]!
      const near = (i: number, j: number) => {
        const wx = x0 - i * U, wy = y0 - j * U
        return (wx - sx) ** 2 + (wy - sy) ** 2 <= yards * yards
      }
      let total = 0, swim = 0, wade = 0, deepest = 0
      for (let i = 0; i < W; i++) {
        for (let j = 0; j < H; j++) {
          if (!near(i, j) || wet?.[i * H + j] !== 1) continue
          total++
          const d = depthAt(x0 - i * U, y0 - j * U)
          if (d > deepest) deepest = d
          if (d >= SWIM_DEPTH) swim++; else wade++
        }
      }
      // The flood, over the same rule a step uses.
      const seen = new Uint8Array(W * H)
      const si = Math.round((x0 - sx) / U), sj = Math.round((y0 - sy) / U)
      const queue = [si * H + sj]
      seen[si * H + sj] = 1
      let reached = 0, land = 0
      // The deepest water a man can walk to, and the shallowest cell next to
      // it he can stand in — which is where a check that wants to swim starts.
      let deep = { x: 0, y: 0, d: -1 }
      const shallows: { x: number; y: number; d: number }[] = []
      while (queue.length) {
        const at = queue.pop()!
        const i = Math.floor(at / H), j = at % H
        if (wet?.[at] === 1) {
          if (near(i, j)) reached++
          const wx = x0 - i * U, wy = y0 - j * U
          const d = depthAt(wx, wy)
          if (d > deep.d) deep = { x: wx, y: wy, d }
          if (d > 0 && d < SWIM_DEPTH) shallows.push({ x: wx, y: wy, d })
        } else land++
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const ni = i + di, nj = j + dj
          if (ni < 0 || ni >= W || nj < 0 || nj >= H) continue
          const k = ni * H + nj
          if (seen[k]) continue
          seen[k] = 1
          if (footing(x0 - ni * U, y0 - nj * U)) continue
          queue.push(k)
        }
      }
      const shore = shallows.sort((a, b) =>
        (a.x - deep.x) ** 2 + (a.y - deep.y) ** 2
        - ((b.x - deep.x) ** 2 + (b.y - deep.y) ** 2))[0] ?? null
      return { total, reached, swim, wade, land, deep, shore,
        deepest: Math.round(deepest * 10) / 10,
        swimDepth: Math.round(SWIM_DEPTH * 100) / 100, swimSpeed: SWIM_SPEED }
    }
  /**
   * Walk towards somewhere, for a check that has to get to the water.
   *
   * The keys are read in screen space and so is this: it sets the same `want`
   * a finger on the stick does, so what it exercises is the real walk with
   * the real `footing` under it and not a teleport wearing its clothes.
   */
  /**
   * A world point in the glass's own pixels — `worldAt` turned round.
   *
   * For the check that a tap on something aims at it: a check that works out
   * where a creature is on screen with its own arithmetic is a check that
   * agrees with itself, so the inverse is written beside the thing it
   * inverts and both are read from here.
   */
  ;(window as unknown as { __screenAt: (x: number, y: number) => number[] })
    .__screenAt = (x, y) => {
      const s2 = k()
      return [canvas.width / 2 - (y - camY) * s2,
        canvas.height / 2 - (x - camX) * s2]
    }
  ;(window as unknown as { __aim: (x: number | null, y?: number) => unknown })
    .__aim = (x, y) => {
      if (x === null) { want.x = 0; want.y = 0; return null }
      const ax = screenX(hero.x, hero.y), ay = screenY(hero.x, hero.y)
      const bx = screenX(x, y!), by = screenY(x, y!)
      const d = Math.hypot(bx - ax, by - ay) || 1
      want.x = (bx - ax) / d
      want.y = (by - ay) / d
      return { x: want.x, y: want.y }
    }
  /** How deep the water is where he is standing, and whether he is afloat. */
  ;(window as unknown as { __depth: () => unknown }).__depth = () => ({
    depth: Math.round(depthAt(hero.x, hero.y) * 100) / 100,
    swimming: swimAt(hero.x, hero.y),
    x: hero.x, y: hero.y,
  })
  /** The slice's own box, so a check can flood it without typing it out. */
  ;(window as unknown as { __bounds: () => number[] }).__bounds = () =>
    [...meta.bounds]
  /**
   * And where a character starts, which is not the same as where the hero is.
   *
   * A check that has driven the camera about has moved him, and a flood that
   * begins wherever it left him answers a different question every run — which
   * is how the walkable-world check came out 7 of 7 one minute and 6 of 7 the
   * next.
   */
  ;(window as unknown as { __start: () => { x: number; y: number } })
    .__start = () => ({ x: START[0], y: START[1] })
  /** How many of the placed pieces stand inside a building. */
  ;(window as unknown as { __indoors: () => number }).__indoors = () =>
    placed.filter((o) => o.in).length
  /**
   * How much of each building's plan the scene actually answers for.
   *
   * Every set bit of every outline, taken back out to the world with
   * `fromPlan` and asked of `inRoom`.  A bit nobody claims is a piece of a
   * building a man walks through as if it were not there — which is what half
   * of every city wall piece was while the first test was a box round the
   * model's origin.
   */
  ;(window as unknown as { __planCover: () => unknown }).__planCover = () => {
    let bits = 0, missed = 0, plans = 0
    const lost: string[] = []
    for (const b of buildings) {
      const p = b.plan
      if (!p) continue
      plans++
      let on = 0, off = 0
      for (let i = 0; i < p.w; i++) {
        for (let j = 0; j < p.h; j++) {
          if (!bitAt(p.bits, i * p.h + j)) continue
          on++
          const [x, y] = fromPlan(p, b, p.x0 + (i + 0.5) * p.s, p.y0 + (j + 0.5) * p.s)
          if (!inRoom(x, y)) off++
        }
      }
      bits += on
      missed += off
      if (off) lost.push(`${b.k} at ${Math.round(b.x)},${Math.round(b.y)}: ${off} of ${on}`)
    }
    return { plans, bits, missed, lost }
  }
  /**
   * From where the player stands indoors, the cells of this floor he can walk
   * to and which of the building's doorways they reach.
   *
   * A flood over the plan's own cells, four ways, asking `roomOpen` — the rule
   * a step indoors is held to — at each cell's centre.  People are left out on
   * purpose: somebody standing in a doorway is weather, and the question is
   * whether the floor joins the rooms.
   */
  ;(window as unknown as { __roomFlood: () => unknown }).__roomFlood = () => {
    const b = indoors
    const p = planNow()
    if (!b || !p) return null
    const at = (i: number, j: number) =>
      fromPlan(p, b, p.x0 + (i + 0.5) * p.s, p.y0 + (j + 0.5) * p.s)
    const start = planCell(p, b, hero.x, hero.y)
    if (start < 0) return { cells: 0, doors: b.doors.map(() => false) }
    const seen = new Uint8Array(p.w * p.h)
    const stack = [start]
    seen[start] = 1
    const got: (readonly [number, number])[] = []
    while (stack.length) {
      const n = stack.pop()!
      const i = Math.floor(n / p.h), j = n % p.h
      got.push(at(i, j))
      for (const [a, c] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]] as const) {
        if (a < 0 || a >= p.w || c < 0 || c >= p.h) continue
        const m = a * p.h + c
        if (seen[m]) continue
        seen[m] = 1
        const [x, y] = at(a, c)
        if (roomOpen(x, y)) stack.push(m)
      }
    }
    return {
      cells: got.length,
      doors: b.doors.map(([dx, dy]) =>
        got.some(([x, y]) => Math.hypot(x - dx, y - dy) < doorstepOf(b))),
    }
  }
  /** Each building's door passages, in `__buildings()` order — see `porchesOf`. */
  ;(window as unknown as { __porches: () => unknown }).__porches = () =>
    buildings.map((b) => porchesOf(b).map((q) => [q.ax, q.ay, q.bx, q.by, q.half]))
  /** The buildings, for the check that a box is not drawn as a floor. */
  ;(window as unknown as { __buildings: () => unknown }).__buildings = () =>
    buildings.map((b) => ({ x: b.x, y: b.y, z: b.z, l: b.l, w: b.w, k: b.k,
      c: b.c, s: b.s, area: b.area, doors: b.doors, upDoors: b.upDoors, doorstep: doorstepOf(b),
      house: b.house, ground: b.ground,
      floors: b.floors?.map((f) => f.z) ?? [] }))
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
    at: [hero.x, hero.y],
    damage: [you.line[LO], you.line[HI]], swing: you.line[SWING],
    stats: statsAt(you.level),
    crit: who ? critChance(you.level, statsAt(you.level), who) : 0,
    dodge: who ? dodgeChance(you.level, statsAt(you.level), who) : 0,
    spells: spells.map((sp) => ({ id: sp.id, level: sp.level })),
    ceiling: roster?.levels?.[1] ?? 0,
  })
  /**
   * `rolls` is how far the stream of chance moved, counted off `seed()`.
   *
   * The loop below draws once a swing and hands the number in, so anything
   * over `n` is `rollMelee` drawing again on its own — the sequence of
   * independent rolls the hit table must not be.  The total of `fates` is
   * `n` whatever the table says, which is why "the bands add to one" used to
   * be a check that could not fail.
   */
  const swingAgainst = (against: number) => {
    const mine = statsAt(you.level)
    return (r: number) => rollMelee(
      { level: you.level, crit: who ? critChance(you.level, mine, who) : 5,
        humanoid: true },
      { level: against, dodge: CREATURE_DODGE, parry: CREATURE_PARRY_HUMANOID,
        block: CREATURE_BLOCK },
      r)
  }
  ;(window as unknown as {
    __swings: (against: number, n: number) => unknown
  }).__swings = (against, n) => {
    const out: Record<string, number> = {}
    const fate = swingAgainst(against)
    const from = seed()
    for (let i = 0; i < n; i++) {
      const word = OUTCOME_WORD[fate(roll() * 10000)] ?? 'hit'
      out[word] = (out[word] ?? 0) + 1
    }
    let rolls = 0
    for (let s = from; s !== seed() && rolls <= n * 8; rolls++) {
      s = (s + 0x6d2b79f5) >>> 0
    }
    return { fates: out, rolls }
  }
  /**
   * The hit table itself, read off the function rather than sampled: every
   * whole roll from nought to ten thousand, and the runs of outcome they fall
   * in, in the order they fall.  One roll and cumulative bands means each
   * outcome is one unbroken run and the runs tile the whole range.
   */
  ;(window as unknown as {
    __bands: (against: number) => [string, number, number][]
  }).__bands = (against) => {
    const fate = swingAgainst(against)
    const runs: [string, number, number][] = []
    for (let r = 0; r < 10000; r++) {
      const word = OUTCOME_WORD[fate(r)] ?? 'hit'
      const last = runs[runs.length - 1]
      if (last && last[0] === word && last[2] === r) last[2] = r + 1
      else runs.push([word, r, r + 1])
    }
    return runs
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
    // **The character's own bar, in the character's own order.**  It was one
    // ability found by id, which made the simulation reachable from the page a
    // different rule from the one the page follows — and issue 224 made the
    // arrangement the fighting order, so the order is the whole point.
    const rota = bar
      .map((id) => (id === null ? null : spells.find((sp) => sp.id === id)))
      .filter((sp): sp is Spell => !!sp && sp.cost > 0)
      .map((sp) => ({ rage: sp.cost,
        adds: sp.does.find((d) => d[0] === E_WEAPON_ADD)?.[1] ?? 0 }))
      .filter((sp) => sp.adds > 0)
    return duel(
      { level: lv, stats: statsAt(lv), line: lineFor(lv) },
      { level, stats: statsAt(1), line: line ?? [60, 3, 5, 2000, 20, 2] },
      who,
      { many, runs, policy: policy === 'rota' ? 'rota' : 'auto', bar: rota })
  }

  /** What is for sale and what is taught nearby, and buying and learning it. */
  ;(window as unknown as { __shop: (entry: number) => unknown }).__shop =
    (entry) => ({
      side: shelf.of?.[String(entry)] ?? 0,
      stock: (shelf.stock?.[String(entry)] ?? []).map((row) => ({
        id: row[0],
        // **What he charges**, not what the catalogue says.  The row, the
        // purchase and this all go through `priceAt`, because a check reading
        // its own copy of a price agrees with itself and with nothing else —
        // which is how `__buy` once bought past a limited shelf.
        price: priceAt(entry, (itemOf(row[0]!)?.[I_BUY] as number) ?? 0),
        list: itemOf(row[0]!)?.[I_BUY],
        slot: itemOf(row[0]!)?.[I_SLOT],
        // What a limited shelf has left, and nothing for an unlimited one.
        // `npc_vendor.maxcount` and `incrtime`, which were baked and unread.
        most: row[1] || null, back: row[2] || null,
        left: stockLeft(entry, row),
      })),
      teaches: (shelf.trainers?.[String(entry)]?.teaches ?? [])
        .map(([id, cost, need]) => ({ id, cost: priceAt(entry, cost!), need })),
    })
  /**
   * Every shop in the world, as the window would draw it.
   *
   * The rows and not the ids, because the failure this is for is two lines of
   * a shop that **look the same** — `아이콘` 3절 printed it: *"lines 4 and 5
   * have the same words and the same price."*  This game has no item names, so
   * a row is a picture, our word for the sort of thing it is, and a price;
   * two rows that match on all three are two rows a player cannot choose
   * between.
   */
  ;(window as unknown as { __shops: () => unknown }).__shops = () => {
    const per = SHOP_PER_PAGE()
    const out: { entry: number; rows: number; pages: number; same: string[] }[] = []
    /**
     * Two rows that look the same because the **items** are the same in every
     * column this game ships.
     *
     * That is not a bug in the shop, it is where the no-names rule lands: two
     * arrows with the same damage, the same delay, the same level and the same
     * price differ only by a name, and this game does not carry names.  Named
     * and counted rather than hidden — the same idea as the pipeline's
     * `*_DEFAULT_OK`, because an absence looks exactly like an oversight
     * unless something says it out loud.
     */
    let twins = 0
    for (const [entry, stock] of Object.entries(shelf.stock ?? {})) {
      const ids = stock.map(([id]) => id!).filter((id) => !!itemOf(id))
      const look = (id: number) => {
        const it = itemOf(id)!
        return `${iconFor(it)}|${tintOf(it)}|${describe(it)}|${it[I_BUY]}`
          + `|${detail(it)}`
      }
      // Everything the bake ships about the thing, which is what "the same
      // item twice" has to mean when there are no names.
      const all = (id: number) => JSON.stringify(itemOf(id))
      const same: string[] = []
      // Per page, because two identical rows a page apart are never both on
      // the glass — which is the difference between a shop that is confusing
      // and a shop that is merely long.
      for (let at = 0; at < ids.length; at += per) {
        const seen = new Map<string, number>()
        for (const id of ids.slice(at, at + per)) {
          const key = look(id)
          const was = seen.get(key)
          if (was !== undefined) {
            if (all(was) === all(id)) twins++
            else same.push(`${was} and ${id}: ${key}`)
          }
          seen.set(key, id)
        }
      }
      out.push({ entry: Number(entry), rows: ids.length,
        pages: Math.max(1, Math.ceil(ids.length / per)), same })
    }
    return { per, vendors: out.length,
      longest: Math.max(...out.map((v) => v.rows), 0),
      paged: out.filter((v) => v.pages > 1).length,
      muddled: out.filter((v) => v.same.length),
      twins,
    }
  }
  ;(window as unknown as { __buy: (id: number, from?: number) => unknown })
    .__buy = (id, from) => {
      const it = itemOf(id)
      if (!it) return null
      you.purse += it[I_BUY] as number
      const was = { purse: you.purse, held: held.length }
      // Through the window's own buying, so a shelf that can run out runs out.
      const entry = from ?? Number(Object.entries(shelf.stock ?? {})
        .find(([, rows]) => rows.some((r) => r[0] === id))?.[0] ?? 0)
      const no = buyFrom(entry, id)
      return { was, purse: you.purse, held: held.length, refused: no }
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
  /**
   * What can be held, what is drawn for it, and whether holding it shows.
   *
   * Three lists rather than a count, because a count is what let this go
   * wrong in the first place: the hand was drawn empty for every weapon in
   * the game while five strips of LPC and five renders of the kit sat there
   * unasked for, and "five kinds, five pictures" would have passed.  What has
   * to agree is the set of kinds **the items actually are** against the set
   * the two sheets can draw, and either one being short is a failure.
   *
   * `flat` is the world sprite's gap and `undressed` the paperdoll's; they are
   * separate because they are separate sheets cut from separate archives, and
   * a kind can easily be in one and not the other.
   */
  ;(window as unknown as { __arms: () => unknown }).__arms = () => {
    const kinds = new Set<string>()
    for (const it of Object.values(shelf.items)) {
      const word = it[I_ARM] as string
      if (word) kinds.add(word)
    }
    const want = [...kinds].sort()
    const doll = dollArt?.who['male']?.layers ?? {}
    return {
      kinds: want,
      // Both halves of both clips, because a weapon is drawn in front of the
      // body and behind it, and half a sword is worse than none — and because
      // a weapon with a walk and no swing is a sword that freezes mid-air the
      // moment he uses it.
      flat: want.filter((k) => {
        const a = heroMeta.arms?.[k]
        return !a || !['walk', a.swing].every((c) =>
          a.clips[c]?.['front'] && a.clips[c]?.['behind'])
      }),
      undressed: want.filter((k) => !doll[`male_weapon_${k}`]),
      held: armFor(gear['weapon']),
      layers: heroLayers,
      sheets: [...heroSheets],
      // What the rule says he is wearing, as the keys `sheets` should hold.
      outfit: wearingNow(),
      wearing: dollKey.split('|').filter(Boolean),
    }
  }

  /** Which worn slots the paperdoll has no picture for. */
  ;(window as unknown as { __undrawn: () => string[] }).__undrawn =
    () => [...dollMissing]
  ;(window as unknown as { __bar: () => unknown }).__bar = () => ({
    squares: squares.map((sq) => ({ key: sq.key, label: sq.label, filled: !!sq.icon })),
    spells: spells.map((sp) => sp.id),
    // What is actually on each square, which is not the same list as the
    // spellbook any more — see `fitBar`.
    bar: bar.slice(),
    auto: you.auto,
    // Which of them could go off right now, which is the one question the
    // automatic hand asks — `why(sp) === null`.
    usable: spells.filter((sp) => why(sp) === null).map((sp) => sp.id),
    /** Which of them are stances, which the automatic hand never casts. */
    stances: spells.filter((sp) => !!sp.stance).map((sp) => sp.id),
    asked, heard, fired,
  })
  /** The automatic hand, set from a check the way `Y` sets it. */
  ;(window as unknown as { __setAuto: (on: boolean) => unknown })
    .__setAuto = (on) => { you.auto = on; return you.auto }
  /** Aim the way a click aims, for the checks that need something aimed at. */
  ;(window as unknown as { __aimAtNearest: () => unknown })
    .__aimAtNearest = () => {
      you.target = you.target ?? inSwing()
      return you.target?.kind ?? null
    }
  ;(window as unknown as { __learn: (id: number) => unknown }).__learn = (id) => {
    const had = spells.length
    // Refused rather than quietly dropped a second time.  A trainer used to
    // be able to take money for a spell this character can never hold — the
    // id went into `taught` and `known()` filtered it out again on the way
    // back, so the purse was lighter and the bar was the same.  The bake no
    // longer offers them; this is the other end of the same rule.
    if (!abilityOf(id)) return { had, now: had, refused: id }
    taught.push(id)
    relearn()
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
  /**
   * Put one kind of weapon in his hand and start a swing, for the check that
   * nothing is cut and left unplayed.
   *
   * The five weapons do not all swing alike — a polearm is thrust and the rest
   * are slashed — so the only way to have played every baked clip is to have
   * held every weapon, and no ordinary run of the game does that.
   */
  ;(window as unknown as { __wield: (word: string, swing?: boolean) => unknown })
    .__wield = (word, swing = true) => {
      const found = Object.entries(shelf.items)
        .find(([, v]) => (v as Item)[I_ARM] === word)
      if (!found) return { word, held: null }
      const [id, it] = found as [string, Item]
      const put = wear(gear, it, Number(id))
      gear = put.gear
      you.line = lineFor(you.level)
      // Nothing to hit, so the swing this starts is the only one: a second
      // one landing mid-check would restart the clip and the reading would be
      // of whatever moment the frame happened to catch.
      you.target = null
      // `swing: false` is how the check sees him *standing* with each of them,
      // which is a different strip of the same sheet: a weapon has no idle, so
      // at rest it holds frame 0 of its walk.
      you.swung = swing ? clock * 1000 : -1e9
      you.next = you.swung + you.line[SWING]!
      return { word, held: armFor(gear['weapon']), swing: you.line[SWING] }
    }
  /** Which clips this page has actually drawn — see `played`. */
  ;(window as unknown as { __clips: () => unknown }).__clips = () => ({
    played: [...played].sort(),
    pose: heroPose,
    hurtSeconds: HURT_SECONDS,
    fastest: Math.min(...Object.values(shelf.items)
      .filter((v) => (v as Item)[I_ARM])
      .map((v) => (v as Item)[I_DELAY] as number)),
  })
  /** Kill the player outright, for the check that dying costs a walk. */
  ;(window as unknown as { __die: () => unknown }).__die = () => {
    const was = { x: hero.x, y: hero.y, hp: you.hp }
    // Through `fall`, which is the path every blow takes — a check that set
    // the four fields itself would be dying a death that wears nothing.
    fall(); you.died = clock - 5
    fighting()
    return { was, now: { x: hero.x, y: hero.y, hp: you.hp, max: you.max },
      walked: Math.hypot(hero.x - was.x, hero.y - was.y) }
  }
  /**
   * Wear, as the checks read it — and set it, through `setWear`, which is the
   * path a blow and a death take, so a slot set to nought breaks the way a
   * slot worn to nought does.
   */
  ;(window as unknown as { __dura: (set?: Record<string, number>) => unknown })
    .__dura = (set) => {
      for (const [slot, v] of Object.entries(set ?? {})) setWear(slot, v)
      const worn: Record<string, [number, number]> = {}
      for (const slot of Object.keys(gear)) {
        if (maxWearOf(slot)) worn[slot] = [wearOf(slot), maxWearOf(slot)]
      }
      return { worn, held: { ...duraHeld }, gear: { ...gear },
        line: you.line.slice(), max: you.max, purse: you.purse,
        stats: statsAt(you.level) }
    }
  /**
   * Stand beside the nearest shopkeeper who mends and open his window the way
   * the conversation does, and say what his discount is — the one input to
   * the price that the check cannot read off `items.json`.
   */
  ;(window as unknown as { __mendAt: () => unknown }).__mendAt = () => {
    let best: Npc | null = null, bd = Infinity
    for (const n of npcs) {
      if (!menders.has(n.entry) || n.dead || !n.up) continue
      const d = (n.x - hero.x) ** 2 + (n.y - hero.y) ** 2
      if (d < bd) { bd = d; best = n }
    }
    if (!best) return null
    placeHero(best.x - 1, best.y)
    openShop(best)
    return { entry: best.entry, discount: discountAt(best.entry) }
  }
  /**
   * Every creature near him that is angry or has anybody on its list — for
   * the check that the victim is read off the list, and that a death takes
   * him off every one of them.
   */
  ;(window as unknown as { __threat: (ids?: number[]) => unknown }).__threat =
    (ids) => (ids ? ids.map((i) => npcs[i]).filter((n): n is Npc => !!n)
      : active.filter((n) => n.angry || Object.keys(n.threat).length))
      .map((n) => ({ id: npcs.indexOf(n), angry: n.angry, victim: n.victim,
        threat: { ...n.threat } }))
  /**
   * The bar and the book, for the checks that the arrangement is a choice.
   *
   * `__place` is `putOnBar` and not a second way to move things — the drag and
   * the check press the same function, which is the lesson `__buy` taught.
   */
  ;(window as unknown as { __place: (slot: number, id: number | null) => unknown })
    .__place = (slot, id) => { putOnBar(slot, id); return bar.slice() }
  ;(window as unknown as { __book: (page?: number) => unknown })
    .__book = (page) => {
      if (page !== undefined) { bookOpen = true; bookPage = page; drawBook() }
      const per = (layout?.spec?.book?.['page'] as number) ?? 12
      return spells.slice(bookPage * per, bookPage * per + per).map((sp) => sp.id)
    }
  /**
   * Make the nearest thing that can be fought angry, the way a landed blow
   * does — the same field, set the same way `__pull` sets it for a pack.
   *
   * For the check on `takeAim`, which is a rule about *state*: something is
   * angry and nothing is aimed at.  Getting there by actually fighting means
   * waiting on a swing timer while the thing wanders, and a rabbit dies before
   * it can be angry at anybody — so the check would be measuring the weather.
   */
  //
  // Nearest to a point when given one, for the chase check: it angers a
  // particular creature outside a wall, and the nearest to a player standing
  // indoors is usually somebody in the room with him.
  ;(window as unknown as { __anger: (x?: number, y?: number) => unknown })
    .__anger = (x = hero.x, y = hero.y) => {
      let best: Npc | null = null, bd = Infinity
      for (const n of active) {
        if (n.dead || !fightable(n.fight)) continue
        const d = (n.x - x) ** 2 + (n.y - y) ** 2
        if (d < bd) { bd = d; best = n }
      }
      if (!best) return null
      best.angry = true
      return { kind: best.kind, away: Math.sqrt(bd), x: best.x, y: best.y }
    }
  /** Let go of whatever is aimed at, for the check that aim comes back. */
  ;(window as unknown as { __unaim: () => unknown }).__unaim = () => {
    you.target = null
    return null
  }
  /**
   * Everything still on him, as the check reads it back.
   *
   * The seconds are rounded, because the point is *whether the three seconds
   * of bleeding came back* and not whether the frame that measured them fell
   * on the same millisecond.
   */
  ;(window as unknown as { __standing: () => unknown }).__standing = () => ({
    mend: you.mend ? Math.round(you.mend.until - clock) : 0,
    using: you.using ? Math.round(you.using.until - clock) : 0,
    bleed: youBleed ? Math.round(youBleed.until - clock) : 0,
    shout: you.shout ? Math.round(you.shout.until - clock) : 0,
    blessed: blessed ? Math.round(blessed.until - clock) : 0,
    absorb: Math.round(you.absorb),
    stance: you.stance,
    cools: Object.fromEntries(Object.entries(you.cools)
      .map(([id, at]) => [id, Math.round(Math.max(0, at - clock))])
      .filter(([, left]) => (left as number) > 0)),
  })
  /**
   * Put something on him, the way a spell would, for the check that a reload
   * does not wash it off.
   *
   * A setter and it says so: what is being checked is that the *save* carries
   * these, and getting to them by casting means finding a caster, a target and
   * a rage bar — which is the weather again.
   */
  ;(window as unknown as { __afflict: () => unknown }).__afflict = () => {
    you.mend = { until: clock + 12, next: clock + 3, each: 4 }
    you.using = { until: clock + 6, next: clock + 1, each: 11, power: false,
      word: '붕대' }
    youBleed = { until: clock + 9, next: clock + 3, each: 5 }
    you.shout = { until: clock + 100, ap: 30 }
    blessed = { until: clock + 200, stat: 'str', amount: 46 }
    you.absorb = 48
    you.stance = 18
    // Seven seconds left on an ability that **has** a cooldown that long.  It
    // was Heroic Strike, which has none — a remainder no save could hold — and
    // the day a restore held every cooldown to the ability's own
    // (`src/sim/cools.ts`) it came back as nothing, correctly.
    const cooled = bookOf(myClass).find((sp) => sp.cool >= 7000)
    if (cooled) you.cools[cooled.id] = clock + 7
    return (window as unknown as { __standing: () => unknown }).__standing()
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
    const chances = roster?.weather?.[String(zone)]
      ?? roster?.weather?.[String(inside(zone))]
    const day: number[] = []
    const base = new Date()
    for (let h = 0; h < 24 * 30; h++) {
      day.push(skyAt(chances, new Date(base.getTime() + h * 3_600_000)))
    }
    const noon = lightAt(new Date(2026, 5, 21, 12), 0)
    const night = lightAt(new Date(2026, 5, 21, 2), 0)
    return {
      zones: Object.keys(roster?.weather ?? {}).length,
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
    level: you.level, ceiling: roster?.levels?.[1] ?? 0,
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
  /**
   * The quests that finish by carrying something, and doing one.
   *
   * For `questcheck`'s walk over every kind of objective, which walked a kill
   * and nothing else.  A fetch counts on the kill of something that drops it
   * — `killed` in `sim/quest.ts` rolls the drop's own per cent — so this kills
   * the named dropper with a roll of nought until the errand is carried, and
   * reports how far short it was before and after.  The log goes back to what
   * it was.
   */
  ;(window as unknown as { __fetchOne: () => unknown }).__fetchOne = () => {
    const q = [...log.all.values()].find((e) => e.fetch.length
      && e.fetch.every((f) => f[3].length) && !e.kill.length && !e.walk?.length)
    if (!q) return { quests: 0 }
    const was = log.held.slice()
    log.held = log.held.filter((h) => h.id !== q.id)
    const h = take(log, q)
    const before = short(log, h)
    let kills = 0
    for (const [, want, , from] of q.fetch) {
      for (let i = 0; i < want; i++) { killed(log, from[0]![0], () => 0); kills++ }
    }
    const after = short(log, h)
    log.held = was
    return { quests: [...log.all.values()].filter((e) => e.fetch.length).length,
      id: q.id, before, kills, after }
  }
  /** What a drop needs before it drops, for the check that `conditions` bites. */
  ;(window as unknown as { __gated: () => unknown }).__gated = () => {
    const gated: { entry: number; item: number; quest: unknown }[] = []
    for (const n of npcs) {
      for (const row of n.haul?.[2] ?? []) {
        const need = (row as unknown[])[6] ?? 0
        if (need) gated.push({ entry: n.entry, item: (row as number[])[5]!, quest: need })
      }
    }
    return { gated: gated.slice(0, 4), n: gated.length,
      holding: log.held.map((h) => h.id) }
  }
  /**
   * Go through a gated body's pockets `times` times, with the quest or
   * without it, and count what fell.
   *
   * `__gated` counted rows that *carry* a condition, so the check that read it
   * passed whether or not `loot` ever asked — a gate nobody consults looks
   * exactly like a gate.  This rolls the real `loot` on a real body.  Nothing
   * it touches is kept: the stream of chance, the bag, the purse, the log and
   * the body go back to what they were, because the checks after it roll too.
   */
  ;(window as unknown as { __lootRoll: (holding: boolean, times: number) => unknown })
    .__lootRoll = (holding, times) => {
      const n = npcs.find((m) => (m.haul?.[2] ?? []).some((r) => (r as unknown[])[6]))
      if (!n) return null
      const row = n.haul![2].find((r) => (r as unknown[])[6])! as unknown[]
      const item = row[5] as number, need = row[6]
      const quests = (typeof need === 'number' ? [need]
        : (need as number[][]).flat().filter((q) => q > 0))
      const was = { seed: seed(), bag: { ...you.bag }, purse: you.purse,
        held: log.held.slice(), looted: n.looted }
      log.held = log.held.filter((h) => !quests.includes(h.id))
      if (holding) {
        for (const q of quests) { const e = log.all.get(q); if (e) take(log, e) }
      }
      const has = quests.every((q) => log.held.some((h) => h.id === q))
      let fell = 0
      for (let i = 0; i < times; i++) {
        const before = you.bag[String(item)] ?? 0
        n.looted = false
        loot(n)
        if ((you.bag[String(item)] ?? 0) > before) fell++
      }
      reseed(was.seed)
      you.bag = was.bag; you.purse = was.purse
      log.held = was.held; n.looted = was.looted
      return { entry: n.entry, item, need, chance: row[1], holding: has, times, fell }
    }
  /** What the game can say out loud, and whether anything is lost with it off. */
  ;(window as unknown as { __sound: () => unknown }).__sound = () => ({
    loaded: soundReady(), muted: muteIsOn(), words: SOUNDS.length,
    asked: askedFor(),
  })
  /** Silence it, for the check that silence costs nothing. */
  ;(window as unknown as { __mute: (on: boolean) => void }).__mute =
    (on) => mute(on)
  /**
   * The words floating over people right now — the damage numbers and the
   * outcome words — which are half of what `art/SOUND-CREDITS.md` pairs a
   * sound with.  `mine` is over something else, not over him.
   */
  // What is in the air, what has just landed, and when the cast was last
  // drawn — so a check can ask whether a bolt carries its damage rather than
  // whether something moved.
  ;(window as unknown as { __flights: () => unknown }).__flights = () => ({
    clock,
    flights: flights.map((f) => ({ id: f.id, kind: f.kind, colour: f.colour,
      x: f.x, y: f.y, speed: f.speed, trail: f.trail.length, lift: f.lift,
      from: f.from ? f.from.entry : 'you', to: f.to ? f.to.entry : 'you' })),
    flashes: flashes.map((b) => ({ fx: b.fx, colour: b.colour, at: b.at })),
    cast: { ...castShown },
    target: you.target ? { entry: you.target.entry, hp: you.target.hp,
      dead: !!you.target.dead } : null,
    hp: you.hp,
  })
  /**
   * **Test only**: stand `away` yards from the nearest creature that can be
   * fought — one of `entries` if given — and aim at it.  A bolt is only a bolt
   * across a gap, and every other placing hook here puts him in reach of a
   * swing.
   */
  ;(window as unknown as { __bolt: (away: number, entries?: number[]) => unknown })
    .__bolt = (away, entries) => {
      let best: Npc | null = null, bd = Infinity
      for (const n of npcs) {
        // Something a spell does not kill outright: a rabbit with one health
        // dies to the first spark, and a check that got a corpse measured
        // nothing about when the damage landed.
        if (n.dead || !fightable(n.fight) || n.hp < 30) continue
        if (entries && !entries.includes(n.entry)) continue
        const d = (n.x - hero.x) ** 2 + (n.y - hero.y) ** 2
        if (d < bd) { bd = d; best = n }
      }
      if (!best) return null
      placeHero(best.x - away, best.y)
      you.target = best
      return { entry: best.entry, hp: best.hp, level: best.level,
        x: best.x, y: best.y, away: Math.hypot(best.x - hero.x, best.y - hero.y) }
    }
  ;(window as unknown as { __marks: () => unknown }).__marks = () => ({
    clock, marks: marks.map((m) => ({ text: m.text, mine: m.mine, at: m.at })),
  })
  /**
   * Hold a direction down without a keyboard, for the step check — and read
   * it the way the frame does, through `steer`, so a check that holds a key
   * and steps the world in one evaluation walks.  It used to change `keys` and
   * nothing else, and 9t measured nought yards against nought yards.
   */
  ;(window as unknown as { __hold: (k: string | null) => void }).__hold = (k) => {
    keys.clear()
    if (k) keys.add(k)
    steer()
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
      worn: Object.keys(gear),
      // What is kept to paint it: one frame a layer, and its bytes.
      stills: dollStills.size, stillBytes: [...dollStills.values()]
        .reduce((n, s) => n + s.width * s.height * 4, 0) }
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
      wide: bookOf(myClass).filter((sp) => (sp.wide?.[0] ?? 0) > 0)
        .map((sp) => ({ id: sp.id, wide: sp.wide[0] })),
      cued: Object.keys(spellbook.cues ?? {}).length,
      cues: Object.values(spellbook.cues ?? {}).flat().length,
    }
  }
  /**
   * The half of `__press` that is not a press: a full bar and no global wait,
   * and which abilities could go off now.  For the check that a *finger* on a
   * square fires it — the press has to come through the pad, so this only
   * sets the table.  Not `__ready`, which it was called for one run: that name
   * is the flag every check waits on before it starts, and a function is
   * truthy, so the wait passed before the page had loaded.
   */
  ;(window as unknown as { __topUp: () => unknown }).__topUp = () => {
    you.power = powerMax()
    you.gcd = 0
    return spells.filter((sp) => why(sp) === null).map((sp) => sp.id)
  }
  /** Press an ability by id and say what the waits look like after. */
  ;(window as unknown as { __press: (id: number) => unknown }).__press = (id) => {
    const sp = spells.find((x) => x.id === id)
    if (!sp) return null
    you.power = powerMax()
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
    /**
     * Which errand each option of the open talk panel would take, in the
     * order the panel lists them.
     *
     * A check that presses `1` and hopes is a check that breaks the day a
     * giver has two things to offer — which is what happened the moment the
     * scaling quests came back and Marshal McBride went from one to several.
     * The panel is built from `offers()` and this is the same list **in the
     * panel's order**, which is not `offers()`'s: each one is `unshift`ed so
     * that work sits above everything else a person has to say, and unshifting
     * a list in order reverses it.  Reported the way the screen reads, because
     * the whole point of this is to press the right number.
     */
    offering: chat
      ? offers(log, chat.npc.entry, you.level, myClass).map((q) => q.id).reverse()
      : [],
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
        // A mine is drawn from *inside* — `drawRoom`, off the plan the client's
        // own triangles gave it — so it has no standing picture and wants
        // none, the same as a bridge deck.  Before issue 219 it had no word
        // here at all, because the bake dropped every one of them.
        floor: kind === 'firefly' || kind === 'mine'
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
    /** Every crossing, not the first four — see the deck placement check. */
    all: spans,
    hereSpan: onSpan(hero.x, hero.y),
    haveTiles: [!!tilesMeta['bridge'], !!tilesMeta['bridge_b']],
    baked: Object.keys(tintedGround().at),
  })
  ;(window as unknown as { __give: (what?: Record<string, number>) => unknown })
    .__give = (what) => {
      // Linen cloth and stringy wolf meat by id, which is what the bag holds
      // now — the two a first aider and a cook start with.
      for (const [id, n] of Object.entries(what ?? { 2589: 11, 2672: 3 })) {
        you.bag[id] = (you.bag[id] ?? 0) + n
      }
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
  ;(window as unknown as { __foe: (least?: number) => unknown })
    .__foe = (least = 0) => {
      // `least` is the smallest level worth walking to.  A check that needs
      // something to *still be alive* after one swing cannot use the nearest,
      // because the nearest is a rabbit with one health — and a check that
      // quietly got a corpse is a check that measured nothing.
      let best: Npc | null = null, bd = Infinity
      for (const n of npcs) {
        if (!fightable(n.fight) || n.dead || n.level < least) continue
        const d = (n.x - hero.x) ** 2 + (n.y - hero.y) ** 2
        if (d < bd) { bd = d; best = n }
      }
      if (!best) return null
      placeHero(best.x - 1.4, best.y)
      return { kind: best.kind, level: best.level, hp: best.hp,
        x: best.x, y: best.y }
    }

  // Driven from the screenshot script: a scene is not finished until it has
  // been looked at, and looking means putting the camera somewhere on purpose.
  ;(window as unknown as { __cam: (o: Record<string, number>) => void }).__cam = (o) => {
    // A door the harness has just walked through is framed first, so the
    // zoom asked for here lands on the room and the zoom outside is kept.
    framing()
    // One placement and not two, one an axis.  `placeHero` looks before it
    // puts him down now, so placing x against the *old* y lands him at a
    // corner of nowhere, corrects, and then the second call corrects the
    // correction — which moved the wide shot a third of the picture.
    if (o.x !== undefined || o.y !== undefined) {
      placeHero(o.x ?? hero.x, o.y ?? hero.y)
      camX = hero.x; camY = hero.y
    }
    // A zoom of nought means *put it back where the screen wants it*, which
    // is the only way a check that has been pulling the camera about can ask
    // what a player would actually see.
    if (o.zoom === 0) { zoomIsMine = false; resize() }
    // **Clamped, like a wheel and a pinch.**  It was set straight, so a check
    // that asked for the widest view got a zoom no player can reach — and the
    // one check watching the frame rate out there was watching a screen that
    // does not exist.
    else if (o.zoom !== undefined) { zoom = clampZoom(o.zoom); zoomWant = zoom; zoomIsMine = true }
    // Indoors the camera goes straight to where it will settle, so a check
    // that reads the glass two frames later is not reading it on the way.
    if (indoors) [camX, camY] = camAim(hero.x, hero.y)
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

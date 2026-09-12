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

import { abilityOf, bearing, coin, goodsOf, josa, nameOf, speak, type Direction, type Speech, type Topic } from './talk'
import { layoutFor, touchpad } from './touch'
import { hud as makeHud } from './hud'
import {
  mitigate, noticeAt, rageFrom, swing, xpFor,
  ARMOUR, A_ATTACK_POWER, A_PERIODIC_DAMAGE,
  E_AURA, E_ENERGIZE, E_WEAPON_ADD,
  FOE, HI, HP, LO, MAX_RAGE, MELEE, SWING, type Fight, type Spell,
} from './fight'

type Doodad = { k: string; x: number; y: number; z: number; r: number; s: number }
type Meta = {
  width: number; height: number; unit: number
  x0: number; y0: number; centre: [number, number]; bounds: number[]
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
  npcs: number[][]
}

/** 32 pixels to an LPC tile, and an LPC person is about five feet of them. */
const PPY = 24              // pixels to the yard at 1:1
const TILE = 32             // ground tile, in pixels
const YD_PER_TILE = TILE / PPY

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
  const { width: W, height: H, unit: U, x0, y0 } = meta

  const [tilesImg, tilesMeta, heroImg, heroMeta, npcImg, npcArt, spawns, spellbook] = await Promise.all([
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
    fetch('./world/spells.json').then((r) => r.json() as Promise<{ spells: Spell[] }>)
      .catch(() => ({ spells: [] as Spell[] })),
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
  function gradient(wx: number, wy: number): [number, number] {
    const s = YD_PER_TILE
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
  function shadeAt(wx: number, wy: number): number {
    const [dx, dy] = gradient(wx, wy)
    const inv = 1 / Math.hypot(dx, dy, 1)
    return (-dx * inv) * LIGHT[0] + (-dy * inv) * LIGHT[1]
      + inv * LIGHT[2] - LIGHT[2]
  }
  function slopeAt(wx: number, wy: number): number {
    const [dx, dy] = gradient(wx, wy)
    return Math.hypot(dx, dy)
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
  // As angles, because that is what they are about: a gradient of 1 is 45
  // degrees.  At 0.62 and 0.44 — 31 and 24 degrees — a third of Elwynn was
  // unclimbable and read as bare rock, which is rolling ground and not a
  // cliff.  Fifty degrees is roughly where a person stops being able to walk
  // up something and is about where the game this is modelled on stops you;
  // forty is where grass stops holding.
  const CLIFF = Math.tan(50 * Math.PI / 180)
  const BARE = Math.tan(40 * Math.PI / 180)

  const WATER_TILES = ['water', 'water2', 'water3'].filter((k) => tilesMeta[k])
  const GROUND_TILES = ['grass', 'grass2', 'grass3'].filter((k) => tilesMeta[k])
  const ROCK_TILE = tilesMeta['stone'] ? 'stone' : GROUND_TILES[0]
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
    /** Drawn under the piece, for pieces that are a canopy and nothing else. */
    trunk?: string
    /** The pieces that are already a whole tree and want no trunk under them. */
    whole?: string[]
    run?: boolean; solid?: 'building' | 'span' | number
  }> = {
    // `oak` and `oak2` are canopies and want a trunk under them.  `deadtree`
    // is a whole tree, trunk and all, and putting one under it drew two trees
    // standing in the same spot with their trunks side by side.
    tree: {
      pieces: ['oak', 'oak2', 'oak', 'oak2', 'deadtree'], trunk: 'trunk',
      whole: ['deadtree'], yards: 8, solid: 0.5,
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
    // Not mushrooms.  The two in the sheet are in its `MISSING:` section —
    // nobody recorded who drew them — so what stands here is a seedling, and
    // that is the whole of the reason.
    mushroom: { pieces: ['sprout2', 'sprout'] },
    lily: { pieces: ['lily', 'lily2', 'lily3'] },
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
    // Three that the bake used to hand over as `prop`, which draws a market
    // stall — so the abbey's graveyard was a row of stalls and every torch in
    // Elwynn was one too.
    hay: { pieces: ['hay'] },
    bones: { pieces: ['rubble', 'scatter'] },
    lamp: { pieces: ['fence_post'] },
    // Buildings.  The client says where one stands and what sort it is; which
    // of ours gets drawn there is decided here, the same as a tree.
    house: { pieces: ['house_a', 'house_b', 'house_c', 'house_d', 'house_e', 'house_f'], solid: 'building' },
    hall: { pieces: ['hall'], solid: 'building' },
    tower: { pieces: ['tower'], solid: 'building' },
    tent: { pieces: ['tent'], solid: 'building' },
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

  type Placed = { x: number; y: number; piece: Piece; s: number; trunk?: Piece }
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
  for (const d of meta.doodads) {
    const k = KIND[d.k]
    if (!k) continue
    const seed = k.run ? hash(Math.floor(d.x / 40), Math.floor(d.y / 40)) : hash(d.x, d.y)
    const pick = k.pieces[Math.floor(seed * k.pieces.length) % k.pieces.length]!
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
    const size = (k.yards ? (k.yards * PPY) / tall : 1) * d.s
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
          piece: piece2, s: size,
        })
      }
      const half = (n * sec) / 2
      solids.push({
        x0: d.x - (r.alongX ? half : 0.5), x1: d.x + (r.alongX ? half : 0.5),
        y0: d.y - (r.alongX ? 0.5 : half), y1: d.y + (r.alongX ? 0.5 : half),
      })
      continue
    }
    placed.push({
      x: d.x, y: d.y, piece, s: size,
      ...(stem ? { trunk: stem } : {}),
    })
    if (k.solid === 'building') {
      const halfY = (piece.w * size) / PPY / 2
      const deep = ((piece.h * size) / PPY) * 0.32
      solids.push({ x0: d.x - 0.8, x1: d.x + deep, y0: d.y - halfY, y1: d.y + halfY })
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
  const STAYS = new Set(['vendor', 'trainer', 'questgiver', 'innkeeper', 'banker',
    'stablemaster', 'flightmaster', 'spirithealer', 'talker'])

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
    npcs.push({
      x: row[0]!, y: row[1]!, hx: row[0]!, hy: row[1]!,
      dir: row[3]!, t: hash(row[0]!, row[1]!) * 4, art,
      alpha: borrowed ? borrowed.alpha : 1,
      r: Math.max(0.3, yards * 0.28),
      wander: STAYS.has(role) ? 0 : 7,
      swims: false, vx: 0, vy: 0, until: 0, moving: false,
      kind, role, level: row[4]!, seed: row[0]! * 31 + row[1]!,
      topic: row[6]! >= 0 ? spawns.topics[row[6]!]! : null,
      fight, hp: fight ? fight[HP]! : 1, max: fight ? fight[HP]! : 1,
      dead: 0, hurt: -99, angry: false, next: 0, bleed: null,
      haul: (spawns.hauls && row[8] !== undefined && row[8]! >= 0)
        ? spawns.hauls[row[8]!]! : null,
      looted: false,
    })
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

  /** Water, bare rock, a trunk, somebody's wall, or somebody. */
  const blocked = (wx: number, wy: number) =>
    wetAt(wx, wy) || slopeAt(wx, wy) > CLIFF || solidAt(wx, wy) || npcAt(wx, wy, null)

  /**
   * Wandering, and the reason it is not random.
   *
   * `hash` is the same seeded function the scenery is scattered with, keyed on
   * the NPC's index and a slow tick, so two visitors to the same page at the
   * same moment see the same forest doing the same thing — and so does a
   * screenshot taken twice.  `Math.random` would have made every check of this
   * scene a different scene.
   */
  const NPC_SPEED = 2.2        // yards a second, near enough WoW's walk
  function wander(dt: number, time: number, busy: Npc | null) {
    const tick = Math.floor(time * 0.4)
    for (let i = 0; i < active.length; i++) {
      const n = active[i]!
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
          const step = NPC_SPEED * 1.4 * dt
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
      const dx = n.vx * NPC_SPEED * dt, dy = n.vy * NPC_SPEED * dt
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
        (!n.swims && wetAt(x, y)) || slopeAt(x, y) > CLIFF || solidAt(x, y) || npcAt(x, y, n)
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
  const patchKey = (x: number, y: number) =>
    Math.floor(x / PATCH) * 100000 + Math.floor(y / PATCH)
  const buckets = new Map<number, Placed[]>()
  for (const o of placed) {
    const k = patchKey(o.x, o.y)
    const b = buckets.get(k)
    if (b) b.push(o)
    else buckets.set(k, [o])
  }

  // --- the player -------------------------------------------------------
  const START: [number, number] = [-8949.95, -132.493]
  const hero = { x: START[0], y: START[1], dir: 2, frame: 0, t: 0, moving: false }

  // --- the fight --------------------------------------------------------
  /**
   * Level five, which is the forest's own median.
   *
   * Elwynn's wolves sit at five, its kobolds at three and its bandits at five,
   * so a hero at five is a hero the zone was built for.  There is no
   * experience yet; when there is, this is what it moves.
   */
  const HERO_LEVEL = 5
  /**
   * How far a fight can travel before it stops being one.
   *
   * Forty yards from where it started or from you, whichever goes first.  A
   * chase with no end is not a chase; it is a parade.
   */
  const LEASH = 40
  const LADDER = spawns.ladder ?? []
  const lineFor = (lv: number): Fight =>
    spawns.player?.[Math.min(lv, spawns.player.length) - 1] ?? [100, 3, 5, 1900, 100, 0]
  const you = {
    level: HERO_LEVEL, line: lineFor(HERO_LEVEL),
    hp: lineFor(HERO_LEVEL)[HP]!, max: lineFor(HERO_LEVEL)[HP]!,
    xp: 0, next: 0, target: null as Npc | null, died: 0, calm: 0,
    rage: 0,
    /** Queued by a heavier blow, spent on the next swing. */
    extra: 0,
    /** When each thing with a cooldown is ready again. */
    cools: {} as Record<number, number>,
    /** The shout, while it lasts. */
    shout: null as { until: number; ap: number } | null,
    purse: 0, kills: 0,
    /** word -> [how many, what the lot is worth in copper]. */
    bag: {} as Record<string, [number, number]>,
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
  const CAN_DO = new Set([E_WEAPON_ADD, E_ENERGIZE, E_AURA])
  const spells = (spellbook.spells ?? [])
    .filter((sp) => sp.level <= HERO_LEVEL && abilityOf(sp.id)
      && sp.does.some((d) => CAN_DO.has(d[0]!)))
    .sort((a, b) => a.level - b.level || a.id - b.id)
  const ICON_OF: Record<number, string> = {
    78: 'lorc/sword-slice.svg', 6673: 'lorc/shouting.svg',
    100: 'delapouite/charging-bull.svg', 772: 'lorc/bleeding-wound.svg',
  }

  /** Whether a thing can be used right now, and why not if it cannot. */
  const why = (sp: Spell): string | null => {
    if (you.died) return '쓰러져 있다'
    if (you.rage < sp.rage) return `분노가 ${sp.rage} 필요하다`
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
  const cast = (sp: Spell) => {
    if (why(sp) !== null) return
    you.rage -= sp.rage
    if (sp.cool) you.cools[sp.id] = clock + sp.cool / 1000
    const t = you.target
    for (const [effect, amount, _die, aura, period] of sp.does) {
      if (effect === E_WEAPON_ADD) you.extra += amount!
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
      hero.x = t.x - ((t.x - hero.x) / d) * (MELEE * 0.7)
      hero.y = t.y - ((t.y - hero.y) / d) * (MELEE * 0.7)
      t.angry = true
    }
    ui.log(`${abilityOf(sp.id)![0]}`, 'hit')
  }

  /**
   * What a kill was worth, and what it bought.
   *
   * The ladder is `player_xp_for_level` and the gain is the server's own
   * `BaseGain`, so the pace is the game's pace: a level 5 kill is 70 and the
   * step to 6 is 2,800, which is forty of them.  That is slow, and it is
   * slow in the original for the same arithmetic.
   */
  const reward = (foe: Npc): number => {
    const gain = xpFor(you.level, foe.level, foe.role === 'elite')
    you.xp += gain
    while (LADDER[you.level - 1] && you.xp >= LADDER[you.level - 1]!
      && you.level < (spawns.player?.length ?? 1)) {
      you.xp -= LADDER[you.level - 1]!
      you.level += 1
      you.line = lineFor(you.level)
      you.max = you.line[HP]!
      you.hp = you.max
      say(hero.x, hero.y, `${you.level}레벨`, true)
    }
    return gain
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
  function fighting() {
    if (you.died) {
      // Dead is dead for a moment, and then you are back where you started.
      if (clock - you.died > 4) {
        you.died = 0; you.hp = you.max; you.target = null
        hero.x = START[0]; hero.y = START[1]
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
        if (clock - n.dead > 30) {
          n.dead = 0; n.hp = n.max; n.angry = false; n.alpha = 1
          n.looted = false
          n.x = n.hx; n.y = n.hy
        }
        continue
      }
      const d2 = (n.x - hero.x) ** 2 + (n.y - hero.y) ** 2
      // A hostile notices you from a distance that depends on the gap between
      // you, which is why nothing in the starting field chases a grown player.
      if (!n.angry && n.fight[FOE] && !chat) {
        const far = noticeAt(you.level, n.level)
        if (d2 < far * far) n.angry = true
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
      const hit = swing(n.fight, n.level, you.line[ARMOUR]!, Math.random())
      you.hp -= hit
      // Taking a blow pays too, at a third of what landing one does.
      you.rage = Math.min(MAX_RAGE,
        you.rage + rageFrom(hit, you.level, you.line[SWING]! / 1000, false))
      say(hero.x, hero.y, `-${hit}`, false)
      ui.log(`${nameOf(n.kind)}에게 ${hit} 맞았다.`, 'hurt')
      if (you.hp <= 0) {
        you.hp = 0; you.died = clock; you.target = null; you.calm = 0
        ui.log('쓰러졌다.', 'note')
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
    const hit = Math.round(
      swing(you.line, foe.level, foe.fight[ARMOUR]!, Math.random())
      + shout + you.extra)
    you.extra = 0
    you.rage = Math.min(MAX_RAGE, you.rage + rageFrom(hit, you.level, secs, true))
    foe.hp -= hit
    foe.hurt = clock
    foe.angry = true
    say(foe.x, foe.y, `${hit}`, true)
    ui.log(`${josa(nameOf(foe.kind), '을', '를')} ${hit} 때렸다.`, 'hit')
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
    const copper = lo + Math.floor(Math.random() * Math.max(1, hi - lo + 1))
    if (copper > 0) { you.purse += copper; got.push(coin(copper)) }
    for (const row of items) {
      const [idx, chance, clo, chi, sell] = row as number[]
      if (Math.random() * 100 >= chance!) continue
      const word = GOODS[idx!] ?? 'oddment'
      const many = clo! + Math.floor(Math.random() * Math.max(1, chi! - clo! + 1))
      // The price travels with the thing.  A bag that held only counts could
      // not be sold: `weapon` is worth what that creature's weapon was worth,
      // and the word on its own says nothing about that.
      const had = you.bag[word] ?? [0, 0]
      you.bag[word] = [had[0] + many, had[1] + many * (sell ?? 0)]
      got.push(`${goodsOf(word)} ${many}`)
    }
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
      if (!n.fight || n.dead || !n.fight[FOE]) continue
      const d = (n.x - hero.x) ** 2 + (n.y - hero.y) ** 2
      if (d < bd) { bd = d; best = n }
    }
    return best
  }

  const SPEED = 7.0          // yards a second, which is WoW's run speed

  const keys = new Set<string>()
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase()
    keys.add(k)
    // One key, and it means "the nearest thing I can reach".  A click would
    // want a cursor and this game is played with a thumb as often as a mouse.
    if (k === ' ' || k === 'spacebar' || k === '1') {
      e.preventDefault()
      if (!chat && !you.died) you.target = you.target ?? inSwing()
    }
    // The readout is a developer's and it starts out of the way.
    if (k === '`' || k === '~') hud.hidden = !hud.hidden
    // 2 onwards are the abilities, in the order they are learned.
    const slot = Number(k)
    if (slot >= 2 && slot <= 9 && spells[slot - 2]) {
      e.preventDefault()
      if (!chat) cast(spells[slot - 2]!)
    }
    if (k === 'b') { e.preventDefault(); bagOpen = !bagOpen }
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
    if (k === 'e') { e.preventDefault(); toggleTalk() }
    else if (k === 'escape') endTalk()
    else if (chat && k >= '1' && k <= '9') {
      const i = Number(k) - 1
      if (i < chat.speech.options.length) { chat.open = chat.open === i ? -1 : i; drawTalk() }
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
  const ui = makeHud()
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
          : slopeAt(wx, wy) > CLIFF ? INK['rock']!
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
          : slopeAt(wx, wy) > CLIFF ? INK['rock']!
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
      mapCtx.fillStyle = m.fight?.[FOE] ? '#d8564a' : '#7fc46f'
      mapCtx.fillRect(Math.round(i) - 1, Math.round(j) - 1, 2, 2)
    }
    mapCtx.fillStyle = '#ffffff'
    mapCtx.fillRect(mid - 1, mid - 1, 3, 3)
  }
  const help = document.getElementById('help') as HTMLDivElement
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
      if (n.dead || n.fight?.[FOE]) continue
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

  function drawTalk() {
    if (!chat) { talkEl.hidden = true; talkEl.textContent = ''; return }
    const { speech, open } = chat
    talkEl.hidden = false
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
        li.onclick = () => {
          chat!.open = chat!.open === i ? -1 : i
          // An option that does something does it once, the first time it is
          // opened, and what it returns is what it then says.
          if (chat!.open === i && o.act && o.lines.length === 0) o.lines = o.act()
          drawTalk()
        }
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

  function startTalk(n: Npc) {
    const speech = speak(n.kind, n.role, n.level, n.seed, n.topic,
      () => directionsFrom(n))
    // A shopkeeper buys as well as sells, and what you have to sell is not
    // something `talk.ts` can know — it has never heard of a bag.
    if (n.role === 'vendor') {
      speech.options.push({
        label: '가진 것을 팝니다', lines: [], act: sellAll,
      })
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
  const clampZoom = (z: number) => Math.max(0.6, Math.min(3, z))
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
      ROCK_TILE, DIRT_TILE, SHORE_TILE].filter(Boolean) as string[])]
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

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    clock += dt

    // --- move ---
    // Everyone else first, then the bucket grid they are in, then the player:
    // the player's collision test reads that grid, so it has to describe where
    // people are now rather than where they were a frame ago.
    awake()
    wander(dt, clock, chat && chat.npc)
    reindex()
    fighting()

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
      if (best && best.fight![FOE]) you.target = best
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
    let mx = 0, my = 0
    if (sdx !== 0 || sdy !== 0) {
      const o = worldAt(canvas.width / 2, canvas.height / 2)
      const t = worldAt(canvas.width / 2 + sdx * 64, canvas.height / 2 + sdy * 64)
      mx = t.x - o.x
      my = t.y - o.y
    }
    hero.moving = mx !== 0 || my !== 0
    if (hero.moving) {
      const len = Math.hypot(mx, my)
      const dx = (mx / len) * SPEED * dt
      const dy = (my / len) * SPEED * dt
      // Each axis is tested on its own, so walking into a shoreline at an angle
      // slides along it instead of stopping dead.  Tested together, a diagonal
      // into the bank blocks both halves and the player sticks on water they
      // are not even walking into.
      //
      // And if the player is already standing in water — teleported there, or
      // dropped in by a mask that moved under them — every move is allowed.
      // A rule that can trap somebody is worse than the thing it prevents.
      const stuck = blocked(hero.x, hero.y)
      if (stuck || !blocked(hero.x + dx, hero.y)) hero.x += dx
      if (stuck || !blocked(hero.x, hero.y + dy)) hero.y += dy
      hero.dir = facing(mx, my)
      hero.t += dt
    } else {
      hero.t += dt
    }
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
    const want = (canvas.height / 2 - wantY) / k()
    lift += (want - lift) * Math.min(1, dt * 6)
    camX += ((hero.x - lift) - camX) * Math.min(1, dt * 8)
    camY += (hero.y - camY) * Math.min(1, dt * 8)

    // Walking away ends it, which is how it ends anywhere.  The threshold is
    // wider than the one that starts it so that shuffling on the spot does not
    // slam the panel shut in your face.
    if (chat && Math.hypot(chat.npc.x - hero.x, chat.npc.y - hero.y) > EARSHOT * 1.8) endTalk()
    const listener = chat ? null : inReach()

    // --- ground ---
    ctx.fillStyle = '#1b2410'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // The glass is an upright rectangle of world again, so the corners put back
    // through the projection are the corners of the box — no slack.
    const T = YD_PER_TILE
    const seen = [worldAt(0, 0), worldAt(canvas.width, 0),
      worldAt(0, canvas.height), worldAt(canvas.width, canvas.height)]
    const xLo = Math.floor(Math.min(...seen.map((c) => c.x)) / T) - 1
    const xHi = Math.ceil(Math.max(...seen.map((c) => c.x)) / T) + 1
    const yLo = Math.floor(Math.min(...seen.map((c) => c.y)) / T) - 1
    const yHi = Math.ceil(Math.max(...seen.map((c) => c.y)) / T) + 1

    const ground = tintedGround()
    const px = ground.px
    tilesDrawn = 0
    for (let ti = xLo; ti <= xHi; ti++) {
      for (let tj = yLo; tj <= yHi; tj++) {
        const wx = ti * T, wy = tj * T
        // The bounding box of a diamond is twice the diamond, so half of what
        // it holds is off the glass: at 1,400 pixels across that was 2,025
        // tiles drawn where 550 are visible, and the frame rate said so.
        const cx = screenX(wx, wy), cy = screenY(wx, wy)
        if (cx < -px || cx > canvas.width + px
          || cy < -px || cy > canvas.height + px) continue
        const h = hash(ti, tj)
        const water = WATER_TILES.length > 0 && wetAt(wx, wy)
        // Water is flat by definition, so it gets none of the hillside shading
        // — a lit slope on a lake surface is the giveaway that the water is
        // painted on the ground rather than standing on it.
        const sl = water ? 0 : shadeAt(wx, wy)
        // Bands on one continuous number, so bare ground follows the hillside
        // instead of speckling across it.
        const steep = slopeAt(wx, wy)
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
        const id = water ? WATER_TILES[Math.floor(h * WATER_TILES.length)]!
          : ink === 'rock' || ink === 'paved' ? ROCK_TILE
            : (ink === 'road' || ink === 'crop') && flat ? DIRT_TILE
              : ink === 'sand' ? SHORE_TILE
                : shore ? SHORE_TILE
                  : steep > CLIFF ? ROCK_TILE
                    : ink === 'bloom' || (meadow && h > 0.55)
                      ? BLOOM_TILES[Math.floor(h * 7) % BLOOM_TILES.length]!
                      : steep > BARE ? DIRT_TILE
                        : GROUND_TILES[Math.floor(h * GROUND_TILES.length)]!
        // One straight blit of a square, centred on the tile's own point —
        // which is what `wx, wy` has always meant here.
        const step = Math.max(0, Math.min(SHADES - 1, Math.round(
          ((sl - SHADE_LO) / (SHADE_HI - SHADE_LO)) * (SHADES - 1))))
        ctx.drawImage(ground.c, ground.at[id]!, step * px, px, px,
          Math.round(cx - px / 2), Math.round(cy - px / 2), px, px)
        tilesDrawn++
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    // --- things that stand up, back to front ---
    const margin = 120
    drawn = 0
    const heroZ = groundAt(hero.x, hero.y)
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
      shadow(hero.x, hero.y, 0.34)
      ctx.drawImage(heroImg, sxp, syp, c, c,
        Math.round(screenX(hero.x, hero.y) - w / 2),
        Math.round(screenY(hero.x, hero.y) - w * 0.82), Math.ceil(w), Math.ceil(w))
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
      shadow(n.x, n.y, Math.max(0.3, (a.yards ?? 0.9) * 0.34))
      // The dead lie there and thin out, and come back in half a minute.
      const fade = n.dead ? Math.max(0.15, 1 - (clock - n.dead) / 6) : 1
      if (n.alpha * fade < 1) ctx.globalAlpha = n.alpha * fade
      ctx.drawImage(npcImg, sxp, syp, c, c, Math.round(screenX(n.x, n.y) - w / 2),
        Math.round(screenY(n.x, n.y) - w * npcArt.anchor), Math.ceil(w), Math.ceil(w))
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
        ctx.fillStyle = n.fight[FOE] ? '#c4463a' : '#4f9e46'
        ctx.fillRect(X - bw / 2, Y, Math.round(bw * (n.hp / n.max)), bh)
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
        if (b) for (const o of b) near.push(o)
      }
    }
    near.sort((a, b) => depth(b) - depth(a))
    for (const o of near) {
      while (ai < actors.length && depth(actors[ai]!) > depth(o)) actors[ai++]!.draw()
      const X = screenX(o.x, o.y), Y = screenY(o.x, o.y)
      if (X < -margin || X > canvas.width + margin || Y < -margin || Y > canvas.height + margin) continue
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
    if (helpFor !== pad.on) {
      helpFor = pad.on
      document.body.classList.toggle('touch', pad.on)
      // Nothing about the button: it is round, lit and says Talk on it.
      help.textContent = pad.on
        ? '끌어서 이동\n오므려서 확대'
        : 'WASD: 이동  1: 공격  E: 대화·줍기  B: 가방  C: 정보  M: 지도  `: 수치'
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
            : slopeAt(hero.x, hero.y) > CLIFF ? '  [바위 위]' : '')],
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
      ['지형', from === 'data' ? '클라이언트의 것'
        : tail('AzerothCore 스폰에서 보간') || '보간'],
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
      foe: !!(foe.fight && foe.fight[FOE]),
    } : null)
    if (clock - mapAt > 0.25) { mapAt = clock; paintMap() }
    ui.setWhere(`${hero.x.toFixed(0)}, ${hero.y.toFixed(0)}`,
      new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }))
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
    ui.setSheet(sheetOpen, [
      ['레벨', `${you.level}`],
      ['경험치', `${you.xp} / ${LADDER[you.level - 1] ?? '—'}`],
      ['생명력', `${Math.round(you.hp)} / ${you.max}`],
      ['공격력', `${you.line[LO]} – ${you.line[HI]}  (${(you.line[SWING]! / 1000).toFixed(1)}초)`],
      ['방어도', `${you.line[ARMOUR]}  (피해 ${Math.round(mitigate(you.line[ARMOUR]!, you.level) * 100)}% 감소)`],
      ['지갑', coin(you.purse)],
      ['처치', `${you.kills}`],
    ])
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
    ui.setBar([
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
          key: KEYS[i + 2] ?? '', label: word,
          icon: ICON_OF[sp.id] ?? 'lorc/sword-slice.svg',
          tip: `${word}  —  분노 ${sp.rage}\n${what}`
            + (sp.cool ? `\n재사용 ${(sp.cool / 1000).toFixed(0)}초` : '')
            + (stop ? `\n${stop}` : ''),
          use: () => { if (!chat) cast(sp) },
          cooling: sp.cool ? Math.max(0, (ready - clock) / (sp.cool / 1000)) : 0,
          live: stop === null,
        }
      }),
      ...KEYS.slice(2 + spells.length).map((key) => ({
        key, label: '', icon: '', tip: '', cooling: 0, live: false,
      })),
    ])
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
    z: groundAt(x, y), slope: slopeAt(x, y),
    wet: wetAt(x, y), solid: solidAt(x, y), blocked: blocked(x, y), cliff: CLIFF,
  })

  /** The scenery's depth keys in draw order, for the check that they sort. */
  ;(window as unknown as { __order: () => number[] }).__order = () => placed.map(depth)

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
    npcs.map((n) => ({ x: n.x, y: n.y, hx: n.hx, hy: n.hy, art: n.art, r: n.r, wander: n.wander }))
  ;(window as unknown as { __hero: () => unknown }).__hero = () => ({ x: hero.x, y: hero.y })
  // For the checks: put the player next to the nearest thing that will fight
  // back, and say what it is.
  // For the checks: the nearest hostile several levels below the player, which
  // is a fight the player can actually finish.
  ;(window as unknown as { __weak: () => unknown }).__weak = () => {
    let best: Npc | null = null, bd = Infinity
    for (const n of npcs) {
      if (!n.fight || !n.fight[FOE] || n.dead || n.level > you.level) continue
      const d = (n.x - hero.x) ** 2 + (n.y - hero.y) ** 2
      if (d < bd) { bd = d; best = n }
    }
    if (!best) return null
    hero.x = best.x - 1.4; hero.y = best.y
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
  ;(window as unknown as { __give: () => unknown }).__give = () => {
    you.bag['cloth'] = [11, 143]
    you.bag['meat'] = [3, 75]
    return Object.keys(you.bag)
  }
  ;(window as unknown as { __vendor: () => unknown }).__vendor = () => {
    const v = npcs.find((n) => n.role === 'vendor')
    if (!v) return null
    hero.x = v.x - 1.2; hero.y = v.y
    return { kind: v.kind, role: v.role }
  }
  ;(window as unknown as { __weakest: () => unknown }).__weakest = () => {
    let best: Npc | null = null, bl = 99
    for (const n of npcs) {
      if (!n.fight || !n.fight[FOE] || n.dead) continue
      // On its own: a pack is a different test and it is the one that keeps
      // happening by accident.
      const alone = !npcs.some((m) => m !== n && m.fight && m.fight[FOE]
        && (m.x - n.x) ** 2 + (m.y - n.y) ** 2 < 400)
      if (alone && n.level < bl) { bl = n.level; best = n }
    }
    if (!best) return null
    hero.x = best.x - 1.4; hero.y = best.y
    return { kind: best.kind, level: best.level, hp: best.hp }
  }
  ;(window as unknown as { __foe: () => unknown }).__foe = () => {
    let best: Npc | null = null, bd = Infinity
    for (const n of npcs) {
      if (!n.fight || !n.fight[FOE] || n.dead) continue
      const d = (n.x - hero.x) ** 2 + (n.y - hero.y) ** 2
      if (d < bd) { bd = d; best = n }
    }
    if (!best) return null
    hero.x = best.x - 1.4; hero.y = best.y
    return { kind: best.kind, level: best.level, hp: best.hp, x: best.x, y: best.y }
  }

  // Driven from the screenshot script: a scene is not finished until it has
  // been looked at, and looking means putting the camera somewhere on purpose.
  ;(window as unknown as { __cam: (o: Record<string, number>) => void }).__cam = (o) => {
    if (o.x !== undefined) { hero.x = o.x; camX = o.x }
    if (o.y !== undefined) { hero.y = o.y; camY = o.y }
    if (o.zoom !== undefined) zoom = o.zoom
    if (o.dir !== undefined) hero.dir = o.dir
  }
}

main().catch((e) => { hud.textContent = String(e); throw e })

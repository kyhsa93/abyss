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

import { bearing, speak, type Direction, type Speech, type Topic } from './talk'
import { layoutFor, touchpad } from './touch'

type Doodad = { k: string; x: number; y: number; z: number; r: number; s: number }
type Meta = {
  width: number; height: number; unit: number
  x0: number; y0: number; centre: [number, number]; radius: number
  zMin: number; zMax: number
  hasWater?: boolean
  doodads: Doodad[]
}
type Piece = { x: number; y: number; w: number; h: number; kind: string }
type Clips = Record<string, { first: number; count: number; dirs: number }>
type NpcArt = {
  cell: number; cols: number; anchor: number
  kinds: Record<string, { first: number; frames: number; people: boolean; yards?: number }>
}
/**
 * `[x, y, kind, facing, level, role, topic]` — the first, fourth and sixth are
 * indices into `kinds` and `roles`, and the last into `topics`, or -1 for the
 * seven hundred who have nothing to say.
 */
type Spawns = {
  kinds: string[]; roles: string[]; topics: Topic[]; npcs: number[][]
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
  const { width: W, height: H, unit: U, x0, y0 } = meta

  const [tilesImg, tilesMeta, heroImg, heroMeta, npcImg, npcArt, spawns] = await Promise.all([
    load('./art/tiles.png'),
    fetch('./art/tiles.json').then((r) => r.json() as Promise<Record<string, Piece>>),
    load('./art/hero.png'),
    fetch('./art/hero.json').then((r) => r.json() as Promise<{ cell: number; cols: number; clips: Clips }>),
    load('./art/npcs.png'),
    fetch('./art/npcs.json').then((r) => r.json() as Promise<NpcArt>),
    // Not behind the two-worlds switch, and that is not an oversight: the
    // terrain has two sources because a client's height grid is sharper than
    // anything a database knows, but where a wolf stands is a row in
    // `creature` either way.  One spawn file, and it is the committed one.
    fetch('./world/npcs.json').then((r) => r.json() as Promise<Spawns>),
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
  const SHADE_LO = -0.55, SHADE_HI = 0.4
  function shadeAt(wx: number, wy: number): number {
    const [dx, dy] = gradient(wx, wy)
    return Math.max(SHADE_LO, Math.min(SHADE_HI, (dx + dy) * 0.95))
  }
  function slopeAt(wx: number, wy: number): number {
    const [dx, dy] = gradient(wx, wy)
    return Math.hypot(dx, dy)
  }

  const hash = (a: number, b: number) => {
    const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453
    return n - Math.floor(n)
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
  const CLIFF = 0.62
  const BARE = 0.44

  const WATER_TILES = ['water', 'water2', 'water3'].filter((k) => tilesMeta[k])
  const GROUND_TILES = ['grass', 'grass2', 'grass3'].filter((k) => tilesMeta[k])
  const ROCK_TILE = tilesMeta['rock_floor'] ? 'rock_floor' : GROUND_TILES[0]
  const DIRT_TILE = tilesMeta['dirt'] ? 'dirt' : GROUND_TILES[0]
  /**
   * Flowers, in meadows rather than in a speckle.
   *
   * Rolled per tile at any rate above about a twentieth, Casper Nilsson's
   * flowered grass turns the whole of Elwynn into a flowerbed — the tile is
   * dense enough that four of them side by side read as solid red.  So the
   * decision is made twice: a coarse hash over 5-tile blocks says whether this
   * corner of the field is a meadow at all, and only inside one does the fine
   * hash pick a flowered tile.  Patches are what a meadow is; a uniform
   * probability is what a rash is.
   */
  const BLOOM_TILES = ['bloom', 'bloom2', 'bloom3'].filter((k) => tilesMeta[k])
  const MEADOW = 0.62

  // Doodad kinds come out of the bake; a kind picks a piece here.  The bake
  // never emits a model path, so this table is the only place that decides
  // what a tree looks like.
  // `solid`: 'building' takes the footprint off the sprite; a number is a half
  // width in yards, for things whose collision is the trunk rather than the
  // picture.  A canopy is not solid — walking behind a tree is the whole reason
  // the canopy is drawn over the player instead of under.
  const KIND: Record<string, {
    pieces: string[]; trunk?: string; run?: boolean; solid?: 'building' | 'span' | number
  }> = {
    tree: { pieces: ['oak', 'oak2', 'oak', 'oak2', 'deadtree'], trunk: 'trunk', solid: 0.5 },
    // Drawn front-on, whatever the client says the rotation is.  These are
    // pixel art with no side view, and turning a pixel sprite by an arbitrary
    // angle is how pixel art stops looking like pixel art.
    // `run`: pick the piece off the neighbourhood rather than the doodad, so a
    // boundary is all one fence.  Picking per post gave a line that alternated
    // rail, picket, rail, which is not a fence anybody built.
    fence: { pieces: ['fence', 'fence2'], run: true, solid: 'span' },
    lamp: { pieces: ['fence_post'] },
    sign: { pieces: ['fence_post'] },
    pine: { pieces: ['pine', 'pine2'], solid: 0.5 },
    // Four sizes of the same two shrubs.  One shrub repeated 1,220 times is
    // the texture the field had, and it reads as wallpaper however good the
    // sprite is.
    bush: { pieces: ['bush', 'bush2', 'shrub', 'shrub2', 'bush', 'bush2'] },
    rock: { pieces: ['boulder', 'menhir', 'rubble'], solid: 0.55 },
    stump: { pieces: ['stump', 'trunk'], solid: 0.5 },
    log: { pieces: ['trunk2', 'woodpile'] },
    grass: { pieces: ['bush', 'sprout2'] },
    // 710 of these stand in the shallows, and they were bushes.
    water_plant: { pieces: ['reeds', 'reeds2'] },
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

  type Placed = { x: number; y: number; piece: Piece; trunk?: Piece }
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
    if (k.solid === 'span') {
      // One doodad, several sections, laid end to end so a boundary is a line
      // rather than a row of posts.
      const r = runs.get(d) ?? { span: 1.33, alongX: false }
      const sec = piece.w / PPY
      const n = Math.max(1, Math.round(r.span / sec))
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * sec
        placed.push({ x: d.x + (r.alongX ? off : 0), y: d.y + (r.alongX ? 0 : off), piece })
      }
      const half = (n * sec) / 2
      solids.push({
        x0: d.x - (r.alongX ? half : 0.5), x1: d.x + (r.alongX ? half : 0.5),
        y0: d.y - (r.alongX ? 0.5 : half), y1: d.y + (r.alongX ? 0.5 : half),
      })
      continue
    }
    placed.push({ x: d.x, y: d.y, piece, ...(k.trunk && tilesMeta[k.trunk] ? { trunk: tilesMeta[k.trunk] } : {}) })
    if (k.solid === 'building') {
      const halfY = piece.w / PPY / 2
      const deep = (piece.h / PPY) * 0.32
      solids.push({ x0: d.x - 0.8, x1: d.x + deep, y0: d.y - halfY, y1: d.y + halfY })
    } else if (typeof k.solid === 'number') {
      solids.push({ x0: d.x - k.solid, x1: d.x + k.solid, y0: d.y - k.solid, y1: d.y + k.solid })
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
   * Which of the four poses to draw, decided on the glass and not in the world.
   *
   * LPC's people are drawn facing up, down, left and right *on the screen*,
   * and in quarter view none of the world's four directions is any of those:
   * north leaves towards the top right.  So the movement is projected first
   * and the pose is whichever of the four it comes nearest — squash included,
   * because a step north covers twice as much glass sideways as it does
   * vertically, and sideways is therefore what it looks like.
   *
   * This is what the projection costs, and it is a real cost: the world's four
   * diagonals land exactly on the four poses, and the world's four axes land
   * exactly between two of them.  Nothing in this art set can fix that — it is
   * the thing CLAUDE.md means by the art deciding the projection.
   */
  function facing(dx: number, dy: number): number {
    const sdx = dx - dy
    const sdy = -(dx + dy) * ISO_SQUASH
    return Math.abs(sdx) > Math.abs(sdy)
      ? (sdx > 0 ? DIR_RIGHT : DIR_LEFT)
      : (sdy > 0 ? DIR_DOWN : DIR_UP)
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

  /** Somebody standing behind a counter does not wander off mid-sentence. */
  const STAYS = new Set(['vendor', 'trainer', 'questgiver', 'innkeeper', 'banker',
    'stablemaster', 'flightmaster', 'spirithealer', 'talker'])

  type Npc = {
    x: number; y: number; hx: number; hy: number
    dir: number; t: number; art: string; alpha: number
    r: number; wander: number; swims: boolean
    vx: number; vy: number; until: number; moving: boolean
    kind: string; role: string; level: number; topic: Topic | null; seed: number
  }
  const npcs: Npc[] = []
  let unplaceable = 0
  for (const row of spawns.npcs) {
    const kind = spawns.kinds[row[2]!]!
    const borrowed = BORROWED[kind]
    const art = borrowed ? borrowed.art : kind
    const a = npcArt.kinds[art]
    if (!a) { unplaceable++; continue }
    const role = spawns.roles[row[5]!]!
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
  function reindex() {
    npcGrid.clear()
    for (const n of npcs) {
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
    for (let i = 0; i < npcs.length; i++) {
      const n = npcs[i]!
      // Nobody walks off in the middle of answering you.
      if (n.wander === 0 || n === busy) { n.moving = false; continue }
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

  // Drawn back to front, and in this projection "back" is north — larger world
  // x.  Sorting once is enough: nothing here moves.
  /**
   * Back to front, which in quarter view is neither axis on its own.
   *
   * Sorting on the world's north alone was right while north was up the
   * screen.  It is up *and to the right* now, so what decides which of two
   * things is further away is how far up the glass it sits — and that is
   * `x + y`, the one combination the projection squashes onto the vertical.
   * Sorted on `x` in quarter view, a tree hides a wall it is standing beside.
   */
  const depth = (o: { x: number; y: number }) => o.x + o.y
  placed.sort((a, b) => depth(b) - depth(a))

  // --- the player -------------------------------------------------------
  const START: [number, number] = [-8949.95, -132.493]
  const hero = { x: START[0], y: START[1], dir: 2, frame: 0, t: 0, moving: false }
  const SPEED = 7.0          // yards a second, which is WoW's run speed

  const keys = new Set<string>()
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase()
    keys.add(k)
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
  const ACTIONS = ['talk'] as const
  const pad = touchpad(canvas, ACTIONS.length)
  const help = document.getElementById('help') as HTMLDivElement
  let helpFor: boolean | null = null

  // --- talking to people ------------------------------------------------

  const talkEl = document.getElementById('talk') as HTMLDivElement
  const EARSHOT = 3.2          // yards, about an arm and a step

  /** Whoever is close enough to hear you, nearest first. */
  function inReach(): Npc | null {
    let best: Npc | null = null, bd = EARSHOT * EARSHOT
    for (const n of npcs) {
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
        li.onclick = () => { chat!.open = chat!.open === i ? -1 : i; drawTalk() }
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

  function startTalk(n: Npc) {
    chat = {
      npc: n,
      speech: speak(n.kind, n.role, n.level, n.seed, n.topic, () => directionsFrom(n)),
      open: -1,
    }
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
    const n = inReach()
    if (n) startTalk(n)
  }

  let zoom = 1
  const clampZoom = (z: number) => Math.max(0.4, Math.min(3, z))
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
  const ISO = 1
  const ISO_SQUASH = 0.5
  const kx = () => PPY * zoom * ISO
  const ky = () => PPY * zoom * ISO * ISO_SQUASH
  const screenX = (wx: number, wy: number) =>
    ((wx - camX) - (wy - camY)) * kx() + canvas.width / 2
  const screenY = (wx: number, wy: number) =>
    -((wx - camX) + (wy - camY)) * ky() + canvas.height / 2

  /**
   * The ground, pre-sheared.
   *
   * Drawing a square tile into a diamond means a transformed `drawImage`, and
   * a transformed blit is about twice the cost of a straight one: 934 of them
   * held the frame rate at 47 where the flat view ran at 60.  So each ground
   * tile is sheared once into an offscreen diamond and then blitted straight,
   * and the hillside tint is baked in with it rather than being a second fill
   * over every tile — which is where the other half of the draw calls went.
   *
   * The tint is quantised, and the steps run between the two ends `shadeAt`
   * actually clamps to rather than between -1 and 1.  Stepped over the wider
   * range the real values only reached four of the nine levels, and four flat
   * levels on a diamond lattice is not shading, it is faceting — very visible,
   * and the thing that made the first quarter-view hillside look like a low
   * polygon model.
   *
   * Rebuilt when the zoom changes, which is not per frame; a pinch rebuilds it
   * as it goes, and ninety small draws is not a cost worth caching around.
   */
  const SHADES = 21
  let sheared: { key: number; w: number; h: number; c: HTMLCanvasElement; at: Record<string, number> } | null = null
  function shearedGround() {
    const key = Math.round(zoom * 100)
    if (sheared && sheared.key === key) return sheared
    const T = YD_PER_TILE
    const a = T * kx(), b = T * ky()
    const w = Math.ceil(a * 2) + 2, h = Math.ceil(b * 2) + 2
    const ids = [...new Set([...GROUND_TILES, ...BLOOM_TILES, ...WATER_TILES,
      ROCK_TILE, DIRT_TILE].filter(Boolean) as string[])]
    const c = document.createElement('canvas')
    c.width = w * ids.length
    c.height = h * SHADES
    const g = c.getContext('2d')!
    g.imageSmoothingEnabled = false
    const at: Record<string, number> = {}
    const s = T / TILE
    ids.forEach((id, i) => {
      at[id] = i * w
      const p = tilesMeta[id]!
      for (let k = 0; k < SHADES; k++) {
        // The bitmap's origin is the tile's north-west corner, which under this
        // map is the diamond's topmost point — so it goes at the top middle of
        // the cell and the other three corners fall inside it.
        g.setTransform(s * kx(), s * ky(), -s * kx(), s * ky(), i * w + a + 1, k * h + 1)
        g.drawImage(tilesImg, p.x, p.y, p.w, p.h, 0, 0, TILE + 1, TILE + 1)
        const sl = SHADE_LO + (k / (SHADES - 1)) * (SHADE_HI - SHADE_LO)
        if (Math.abs(sl) > 0.02) {
          // Over the tile only: `source-atop` is what keeps the tint inside the
          // diamond instead of putting a square of it on the grass.
          g.globalCompositeOperation = 'source-atop'
          g.fillStyle = sl > 0 ? `rgba(255,247,224,${Math.min(0.42, sl * 0.75)})`
            : `rgba(8,14,26,${Math.min(0.5, -sl * 0.75)})`
          g.fillRect(0, 0, TILE + 1, TILE + 1)
          g.globalCompositeOperation = 'source-over'
        }
      }
    })
    g.setTransform(1, 0, 0, 1, 0, 0)
    sheared = { key, w, h, c, at }
    return sheared
  }

  /**
   * And back again, which the tile loop needs.
   *
   * The visible world is a diamond now, so the rectangle of tiles to draw is
   * the bounding box of the four screen corners projected back — not the
   * rectangle the camera is in the middle of.  Inverted from the two lines
   * above rather than guessed at with a fudge factor twice their size.
   */
  const worldAt = (X: number, Y: number) => {
    const a = (X - canvas.width / 2) / kx()
    const b = -(Y - canvas.height / 2) / ky()
    return { x: camX + (a + b) / 2, y: camY + (b - a) / 2 }
  }

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
    wander(dt, clock, chat && chat.npc)
    reindex()

    // --- the thumbs, before the keys, because they answer the same question
    pad.setBusy(chat !== null)
    zoom = clampZoom(zoom * pad.pinch())
    // A tap on the world ends a conversation, which is how it ends anywhere.
    // Taps on the panel itself never reach the canvas, so answering an option
    // does not close the thing you are answering.
    const tapped = pad.takeTap()
    if (chat && tapped) endTalk()
    for (const slot of pad.taken()) if (ACTIONS[slot] === 'talk') toggleTalk()

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
    // Up the glass is not a world axis any more.  `screenY` is fed by x + y and
    // `screenX` by x - y, so moving the camera the same distance along both
    // slides the view straight up and leaves it centred sideways; moving it
    // along x alone — which is what "above the hero" meant while north was up —
    // carries the pair of you off to the right as the panel opens.
    const want = (wantY - canvas.height / 2) / (2 * ky())
    lift += (want - lift) * Math.min(1, dt * 6)
    camX += ((hero.x + lift) - camX) * Math.min(1, dt * 8)
    camY += ((hero.y + lift) - camY) * Math.min(1, dt * 8)

    // Walking away ends it, which is how it ends anywhere.  The threshold is
    // wider than the one that starts it so that shuffling on the spot does not
    // slam the panel shut in your face.
    if (chat && Math.hypot(chat.npc.x - hero.x, chat.npc.y - hero.y) > EARSHOT * 1.8) endTalk()
    const listener = chat ? null : inReach()

    // --- ground ---
    ctx.fillStyle = '#1b2410'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // The visible world is a diamond, so the tiles to draw are the bounding box
    // of the four corners of the glass put back through the projection — not a
    // rectangle around the camera, which in quarter view misses two corners of
    // the screen and fills two with tiles nobody can see.
    const T = YD_PER_TILE
    const seen = [worldAt(0, 0), worldAt(canvas.width, 0),
      worldAt(0, canvas.height), worldAt(canvas.width, canvas.height)]
    const xLo = Math.floor(Math.min(...seen.map((c) => c.x)) / T) - 1
    const xHi = Math.ceil(Math.max(...seen.map((c) => c.x)) / T) + 1
    const yLo = Math.floor(Math.min(...seen.map((c) => c.y)) / T) - 1
    const yHi = Math.ceil(Math.max(...seen.map((c) => c.y)) / T) + 1

    // A square of ground is a diamond on the glass, so the tile goes through
    // the same map the world does: one bitmap pixel east is `+u` and one south
    // is `+v`, and both of those are diagonals now.  The four coefficients are
    // the same for every tile — only where it lands moves — so they are worked
    // out once and only the origin is set per tile.
    const iso = shearedGround()
    const half = T * kx()
    tilesDrawn = 0
    for (let ti = xLo; ti <= xHi; ti++) {
      for (let tj = yLo; tj <= yHi; tj++) {
        const wx = ti * T, wy = tj * T
        // The bounding box of a diamond is twice the diamond, so half of what
        // it holds is off the glass: at 1,400 pixels across that was 2,025
        // tiles drawn where 550 are visible, and the frame rate said so.
        const cx = screenX(wx, wy), cy = screenY(wx, wy)
        const edge = T * kx() + 2
        if (cx < -edge || cx > canvas.width + edge
          || cy < -edge || cy > canvas.height + edge) continue
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
        const id = water ? WATER_TILES[Math.floor(h * WATER_TILES.length)]!
          : steep > CLIFF ? ROCK_TILE
            : steep > BARE ? DIRT_TILE
              : meadow && h > 0.45
                ? BLOOM_TILES[Math.floor(h * 7) % BLOOM_TILES.length]!
                : GROUND_TILES[Math.floor(h * GROUND_TILES.length)]!
        // One straight blit of a diamond that was sheared at load, placed by
        // its topmost point — which is the tile's north-west corner, the same
        // corner the shear was built around.
        const k = Math.max(0, Math.min(SHADES - 1, Math.round(
          ((sl - SHADE_LO) / (SHADE_HI - SHADE_LO)) * (SHADES - 1))))
        ctx.drawImage(iso.c, iso.at[id]!, k * iso.h, iso.w, iso.h,
          Math.round(screenX(wx + T / 2, wy + T / 2) - half - 1),
          Math.round(screenY(wx + T / 2, wy + T / 2) - 1), iso.w, iso.h)
        tilesDrawn++
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    // --- things that stand up, back to front ---
    const margin = 120
    drawn = 0
    const heroZ = groundAt(hero.x, hero.y)
    const drawHero = () => {
      const clip = hero.moving ? heroMeta.clips['walk']! : heroMeta.clips['idle']!
      const n = clip.count
      const f = hero.moving
        ? Math.floor(hero.t * 10) % n
        : Math.floor(hero.t * 2) % n
      const idx = clip.first + hero.dir * n + f
      const c = heroMeta.cell
      const sxp = (idx % heroMeta.cols) * c, syp = Math.floor(idx / heroMeta.cols) * c
      // One sprite pixel to one screen pixel at zoom 1, which is the same
      // scale the ground tiles are drawn at — 32 pixels to a 1.33 yard tile is
      // 24 to the yard, and PPY is 24.  A separate fudge factor here had
      // sprites eight per cent smaller than the ground they stood on.
      const w = c * zoom, hgt = w
      shadow(hero.x, hero.y, 0.34)
      ctx.drawImage(heroImg, sxp, syp, c, c,
        Math.round(screenX(hero.x, hero.y) - w / 2),
        Math.round(screenY(hero.x, hero.y) - hgt * 0.82), Math.ceil(w), Math.ceil(hgt))
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
      if (n.alpha < 1) ctx.globalAlpha = n.alpha
      ctx.drawImage(npcImg, sxp, syp, c, c, Math.round(screenX(n.x, n.y) - w / 2),
        Math.round(screenY(n.x, n.y) - w * npcArt.anchor), Math.ceil(w), Math.ceil(w))
      if (n.alpha < 1) ctx.globalAlpha = 1
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
    for (const n of npcs) {
      const X = screenX(n.x, n.y), Y = screenY(n.x, n.y)
      if (X < -margin || X > canvas.width + margin || Y < -margin || Y > canvas.height + margin) continue
      actors.push({ x: n.x, y: n.y, draw: () => drawNpc(n) })
    }
    npcsDrawn = actors.length
    actors.push({ x: hero.x, y: hero.y, draw: drawHero })
    actors.sort((a, b) => depth(b) - depth(a))
    let ai = 0

    for (const o of placed) {
      while (ai < actors.length && depth(actors[ai]!) > depth(o)) actors[ai++]!.draw()
      const X = screenX(o.x, o.y), Y = screenY(o.x, o.y)
      if (X < -margin || X > canvas.width + margin || Y < -margin || Y > canvas.height + margin) continue
      const k = zoom
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

    // The prompt, over whoever is in earshot.  Drawn last so no tree covers it.
    //
    // The height is `headOf`, measured off the atlas, and not a constant that
    // looked right over a townsman.
    if (listener) {
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
    pad.draw(ctx, [{ label: '대화', ready: listener !== null }])

    // The help line and a conversation share the bottom of a phone, and the
    // line is about controls that are not there while somebody is talking.
    help.hidden = pad.on && chat !== null
    if (helpFor !== pad.on) {
      helpFor = pad.on
      document.body.classList.toggle('touch', pad.on)
      // Nothing about the button: it is round, lit and says Talk on it.
      help.textContent = pad.on
        ? '끌어서 이동\n오므려서 확대'
        : 'WASD: 이동   휠: 확대   E: 대화'
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
      ['시야', `${(canvas.width / (PPY * zoom)).toFixed(0)}야드  배율 ${zoom.toFixed(2)}`],
      ['지형', from === 'data' ? '클라이언트의 것'
        : tail('AzerothCore 스폰에서 보간') || '보간'],
      ['프레임', `초당 ${fps.toFixed(0)}`],
    ])
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

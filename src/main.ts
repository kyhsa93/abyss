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
    hud.textContent = [
      `No world at ./${from}/terrain.json.`,
      '',
      from === 'data'
        ? 'The build saw one there. Re-run `npm run bake`, or delete public/data.'
        : 'Run `npm run synth -- <azerothcore dir> public/world`.',
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

  const [tilesImg, tilesMeta, heroImg, heroMeta] = await Promise.all([
    load('./art/tiles.png'),
    fetch('./art/tiles.json').then((r) => r.json() as Promise<Record<string, Piece>>),
    load('./art/hero.png'),
    fetch('./art/hero.json').then((r) => r.json() as Promise<{ cell: number; cols: number; clips: Clips }>),
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
  function shadeAt(wx: number, wy: number): number {
    const [dx, dy] = gradient(wx, wy)
    return Math.max(-0.55, Math.min(0.4, (dx + dy) * 0.95))
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

  const WATER_TILES = ['water', 'water2', 'water3'].filter((k) => tilesMeta[k])
  const GROUND_TILES = ['grass', 'grass2', 'grass3'].filter((k) => tilesMeta[k])
  const ROCK_TILE = tilesMeta['rock_floor'] ? 'rock_floor' : GROUND_TILES[0]
  const DIRT_TILE = tilesMeta['dirt'] ? 'dirt' : GROUND_TILES[0]

  // Doodad kinds come out of the bake; a kind picks a piece here.  The bake
  // never emits a model path, so this table is the only place that decides
  // what a tree looks like.
  const KIND: Record<string, { pieces: string[]; trunk?: string; run?: boolean }> = {
    tree: { pieces: ['oak', 'oak2'], trunk: 'trunk' },
    // Drawn front-on, whatever the client says the rotation is.  These are
    // pixel art with no side view, and turning a pixel sprite by an arbitrary
    // angle is how pixel art stops looking like pixel art.
    // `run`: pick the piece off the neighbourhood rather than the doodad, so a
    // boundary is all one fence.  Picking per post gave a line that alternated
    // rail, picket, rail, which is not a fence anybody built.
    fence: { pieces: ['fence', 'fence2'], run: true },
    lamp: { pieces: ['fence_post'] },
    sign: { pieces: ['fence_post'] },
    pine: { pieces: ['pine', 'pine2'] },
    bush: { pieces: ['bush', 'bush2'] },
    rock: { pieces: ['boulder', 'menhir'] },
    stump: { pieces: ['trunk'] },
    log: { pieces: ['rubble'] },
    grass: { pieces: ['bush'] },
    water_plant: { pieces: ['bush'] },
    flower: { pieces: ['bush2'] },
    crop: { pieces: ['bush2'] },
    mushroom: { pieces: ['scatter'] },
    lily: { pieces: ['scatter'] },
    barrel: { pieces: ['rubble'] },
    prop: { pieces: ['scatter', 'rubble'] },
    // Buildings.  The client says where one stands and what sort it is; which
    // of ours gets drawn there is decided here, the same as a tree.
    house: { pieces: ['house_a', 'house_b', 'house_c', 'house_d', 'house_e', 'house_f'] },
    hall: { pieces: ['hall'] },
    tower: { pieces: ['tower'] },
    tent: { pieces: ['house_f'] },
  }

  type Placed = { x: number; y: number; piece: Piece; trunk?: Piece }
  const placed: Placed[] = []
  for (const d of meta.doodads) {
    const k = KIND[d.k]
    if (!k) continue
    const seed = k.run ? hash(Math.floor(d.x / 40), Math.floor(d.y / 40)) : hash(d.x, d.y)
    const pick = k.pieces[Math.floor(seed * k.pieces.length) % k.pieces.length]!
    const piece = tilesMeta[pick]
    if (!piece) continue
    placed.push({ x: d.x, y: d.y, piece, ...(k.trunk && tilesMeta[k.trunk] ? { trunk: tilesMeta[k.trunk] } : {}) })
  }
  // Drawn back to front, and in this projection "back" is north — larger world
  // x.  Sorting once is enough: nothing here moves.
  placed.sort((a, b) => b.x - a.x)

  // --- the player -------------------------------------------------------
  const START: [number, number] = [-8949.95, -132.493]
  const hero = { x: START[0], y: START[1], dir: 2, frame: 0, t: 0, moving: false }
  const SPEED = 7.0          // yards a second, which is WoW's run speed
  const DIR_UP = 0, DIR_LEFT = 1, DIR_DOWN = 2, DIR_RIGHT = 3

  const keys = new Set<string>()
  addEventListener('keydown', (e) => {
    keys.add(e.key.toLowerCase())
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase()))
      e.preventDefault()
  })
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()))

  let zoom = 1
  addEventListener('wheel', (e) => {
    zoom = Math.max(0.4, Math.min(3, zoom * (1 - Math.sign(e.deltaY) * 0.12)))
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
  const sx = (wy: number) => (camY - wy) * PPY * zoom + canvas.width / 2
  const sy = (wx: number) => (camX - wx) * PPY * zoom + canvas.height / 2

  let fps = 0, frames = 0, acc = 0, drawn = 0, tilesDrawn = 0
  let last = performance.now()

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now

    // --- move ---
    let mx = 0, my = 0
    if (keys.has('w') || keys.has('arrowup')) mx += 1
    if (keys.has('s') || keys.has('arrowdown')) mx -= 1
    if (keys.has('a') || keys.has('arrowleft')) my += 1
    if (keys.has('d') || keys.has('arrowright')) my -= 1
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
      const stuck = wetAt(hero.x, hero.y)
      if (stuck || !wetAt(hero.x + dx, hero.y)) hero.x += dx
      if (stuck || !wetAt(hero.x, hero.y + dy)) hero.y += dy
      hero.dir = Math.abs(mx) > Math.abs(my) ? (mx > 0 ? DIR_UP : DIR_DOWN) : (my > 0 ? DIR_LEFT : DIR_RIGHT)
      hero.t += dt
    } else {
      hero.t += dt
    }
    camX += (hero.x - camX) * Math.min(1, dt * 8)
    camY += (hero.y - camY) * Math.min(1, dt * 8)

    // --- ground ---
    ctx.fillStyle = '#1b2410'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const px = TILE * zoom
    const halfW = canvas.width / 2 / (PPY * zoom)
    const halfH = canvas.height / 2 / (PPY * zoom)
    const xLo = Math.floor((camX - halfH) / YD_PER_TILE) - 1
    const xHi = Math.ceil((camX + halfH) / YD_PER_TILE) + 1
    const yLo = Math.floor((camY - halfW) / YD_PER_TILE) - 1
    const yHi = Math.ceil((camY + halfW) / YD_PER_TILE) + 1
    tilesDrawn = 0
    for (let ti = xLo; ti <= xHi; ti++) {
      for (let tj = yLo; tj <= yHi; tj++) {
        const wx = ti * YD_PER_TILE, wy = tj * YD_PER_TILE
        const h = hash(ti, tj)
        const water = WATER_TILES.length > 0 && wetAt(wx, wy)
        // Water is flat by definition, so it gets none of the hillside shading
        // — a lit slope on a lake surface is the giveaway that the water is
        // painted on the ground rather than standing on it.
        const sl = water ? 0 : shadeAt(wx, wy)
        // Bands on one continuous number, so bare ground follows the hillside
        // instead of speckling across it.
        const steep = slopeAt(wx, wy)
        const id = water ? WATER_TILES[Math.floor(h * WATER_TILES.length)]!
          : steep > 0.62 ? ROCK_TILE
            : steep > 0.44 ? DIRT_TILE
              : GROUND_TILES[Math.floor(h * GROUND_TILES.length)]!
        const p = tilesMeta[id]!
        const X = Math.round(sx(wy) - px / 2), Y = Math.round(sy(wx) - px / 2)
        ctx.drawImage(tilesImg, p.x, p.y, p.w, p.h, X, Y, Math.ceil(px), Math.ceil(px))
        // Shading is the only thing carrying elevation, so it is not subtle.
        if (sl > 0.02) {
          ctx.fillStyle = `rgba(255,247,224,${Math.min(0.42, sl * 0.75)})`
          ctx.fillRect(X, Y, Math.ceil(px), Math.ceil(px))
        } else if (sl < -0.02) {
          ctx.fillStyle = `rgba(8,14,26,${Math.min(0.5, -sl * 0.75)})`
          ctx.fillRect(X, Y, Math.ceil(px), Math.ceil(px))
        }
        tilesDrawn++
      }
    }

    // --- things that stand up, back to front ---
    const margin = 120
    drawn = 0
    const heroZ = groundAt(hero.x, hero.y)
    let heroDone = false
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
      ctx.drawImage(heroImg, sxp, syp, c, c, Math.round(sx(hero.y) - w / 2),
        Math.round(sy(hero.x) - hgt * 0.82), Math.ceil(w), Math.ceil(hgt))
      drawn++
    }
    for (const o of placed) {
      if (!heroDone && o.x < hero.x) { drawHero(); heroDone = true }
      const X = sx(o.y), Y = sy(o.x)
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
    if (!heroDone) drawHero()

    acc += dt; frames++
    if (acc > 0.5) { fps = frames / acc; frames = 0; acc = 0 }
    hud.textContent = [
      `ground   ${tilesDrawn.toLocaleString()} tiles`,
      `standing ${drawn.toLocaleString()} of ${placed.length.toLocaleString()} drawn`,
      `hero     (${hero.x.toFixed(0)}, ${hero.y.toFixed(0)})  ground ${heroZ.toFixed(1)} yd` +
        (wetAt(hero.x, hero.y) ? '  [in water]' : ''),
      `view     ${(canvas.width / (PPY * zoom)).toFixed(0)} yd across  zoom ${zoom.toFixed(2)}`,
      `terrain  ${from === 'data' ? "the client's own" : 'interpolated from AzerothCore spawns'}`,
      `fps      ${fps.toFixed(0)}`,
    ].join('\n')
    ;(window as unknown as { __ready: boolean }).__ready = true
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

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

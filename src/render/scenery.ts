/**
 * What stands around the floor.
 *
 * Same contract as the bodies' sheet: absent is an ordinary state — the first
 * frames of a cold start, a fetch the browser refused, and the harness, which
 * draws in Node where there is no `Image` — and the arena is a complete
 * picture without it.
 *
 * Everything here is outside the wall, and that is the whole design rather
 * than a placement detail. The floor is the one surface in this game that must
 * not have opinions: every mechanic is drawn on it, and those are the things a
 * player is reading. So the scenery does not go on it. It goes in the ring
 * beyond it, where it can say what kind of room this is without ever competing
 * with a telegraph.
 *
 * Nothing stands taller than a person, for the reason the wall is low: height
 * here is screen taken off the top of the fight, and on a phone that is the
 * half the raid is standing in.
 */

import { Rng } from '../sim/rng'
import { PROPS, PROPS_SRC, PROP_IDS } from './props'
import type { Obstacle, Vec2 } from '../sim/types'

type Sheet = CanvasImageSource & { width: number; height: number }

let sheet: Sheet | null = null
let started = false

function begin(): void {
  if (started || typeof Image === 'undefined') return
  started = true
  const image = new Image()
  image.decoding = 'async'
  image.onload = () => {
    sheet = image as unknown as Sheet
  }
  image.src = PROPS_SRC
}

/**
 * The floor's own surface, as a repeating pattern.
 *
 * Cut out of the props sheet into a canvas of its own, because a pattern made
 * from the sheet would repeat the whole sheet — every headstone tiled across
 * the arena. One extra canvas, made once.
 *
 * Null until the sheet arrives, and the caller draws its flat fill either way:
 * the floor is a complete floor without this.
 */
let floorPattern: CanvasPattern | null | undefined
let floorFor: CanvasRenderingContext2D | null = null
let floorKey = ''

export function floorTexture(
  ctx: CanvasRenderingContext2D,
  seed: number,
  encounter: number,
): CanvasPattern | null {
  begin()
  if (!sheet || FLOORS.length === 0) return null
  // A pattern belongs to the context that made it, and the harness makes more
  // than one.
  const key = `${seed}:${encounter}`
  if (floorPattern !== undefined && floorFor === ctx && floorKey === key) return floorPattern

  // Rolled off the fight, like the room around it.
  const pick = FLOORS[new Rng(seed * 17 + encounter * 104729 + 7919).int(FLOORS.length)]!
  const rect = PROPS[pick]
  if (!rect) return null
  const [sx, sy, sw, sh] = rect
  const tile = document.createElement('canvas')
  tile.width = sw
  tile.height = sh
  const tc = tile.getContext('2d')
  if (!tc) return null
  tc.imageSmoothingEnabled = false
  tc.drawImage(sheet, sx, sy, sw, sh, 0, 0, sw, sh)
  // The hue thrown away and the light kept.
  //
  // These fills are sand and clay and brick, and a floor that took their
  // colour would be an orange arena on one pull and a red one on the next —
  // the encounter's accent drowned by whatever the tile happened to be. What
  // is wanted from them is the grain, so the saturation is taken out and the
  // arena's own colour shows through underneath.
  tc.globalCompositeOperation = 'saturation'
  tc.fillStyle = '#808080'
  tc.fillRect(0, 0, sw, sh)

  floorFor = ctx
  floorKey = key
  floorPattern = ctx.createPattern(tile, 'repeat')
  return floorPattern
}


/** And everything that is a surface, in a fixed order so a seed picks one. */
const FLOORS = PROP_IDS.filter((id) => id.startsWith('floor-')).sort()

/**
 * What can be the middle of a pile, and what can be the rest of it.
 *
 * Stone only. The graveyard was in this list for a while and it was wrong for
 * a reason worth writing down: a headstone means something on this floor now —
 * somebody died here — and a headstone that is also a rock you cannot walk
 * through is the same picture saying two things. Whichever one the player
 * learns first makes the other one a lie.
 */
const ANCHORS = ['boulder', 'menhir']
const LITTER = ['scatter', 'rubble-a', 'rubble-b', 'pebbles']

interface Lump {
  id: string
  /** Offset from the obstacle's centre, in world units. */
  dx: number
  dy: number
  /** How tall it stands, in world units. */
  tall: number
  flip: boolean
}

const piles = new Map<string, Lump[]>()

/**
 * What one rock is built out of.
 *
 * A pile rather than a picture. An obstacle here is thirty to seventy units
 * across and the art is thirty-two pixels; blown up to fill the circle its
 * pixels would be eight times the size of the pixels on the bodies standing
 * next to it, which is not a bigger rock, it is a different game. So the
 * circle is filled with several rocks at close to their own size: one that
 * anchors it and a handful of smaller ones spilling round the base.
 *
 * Keyed off where the rock is, so it is the same pile every frame and a
 * different one from the rock beside it, without anybody having to store it in
 * the simulation. Terrain does not move.
 */
function pileFor(rock: Obstacle): Lump[] {
  const key = `${rock.pos.x.toFixed(1)},${rock.pos.y.toFixed(1)},${rock.radius.toFixed(1)}`
  const had = piles.get(key)
  if (had) return had

  const rng = new Rng(Math.round(rock.pos.x * 73 + rock.pos.y * 179 + rock.radius * 13))
  const lumps: Lump[] = [
    {
      id: ANCHORS[rng.int(ANCHORS.length)]!,
      dx: rng.range(-0.15, 0.15) * rock.radius,
      dy: rng.range(-0.1, 0.1) * rock.radius,
      tall: rock.radius * rng.range(1.0, 1.35),
      flip: rng.chance(0.5),
    },
  ]
  // The rest around the base, inside the circle, so the pile reads as one
  // thing rather than as a rock with debris beside it.
  const rest = 2 + rng.int(3)
  for (let i = 0; i < rest; i++) {
    const angle = (i / rest) * Math.PI * 2 + rng.range(0, 1.2)
    const out = rng.range(0.35, 0.8) * rock.radius
    lumps.push({
      id: LITTER[rng.int(LITTER.length)]!,
      dx: Math.cos(angle) * out,
      dy: Math.sin(angle) * out * 0.6,
      tall: rock.radius * rng.range(0.35, 0.6),
      flip: rng.chance(0.5),
    })
  }
  piles.set(key, lumps)
  return lumps
}

/** What a body gets when it stops being one. */
const GRAVES = ['grave-round', 'grave-rip', 'cross', 'grave-pair', 'tomb', 'cross-wood']

/**
 * A headstone where somebody died.
 *
 * A dead raider was the coloured disc it stands on and nothing else — the body
 * sprite is only drawn for the living — so the floor after a bad pull was a
 * scatter of dim circles that read as marks rather than as people. It is the
 * one place in this game where a picture says something a shape was not
 * saying: that is where they went down, and it is still their patch of floor.
 *
 * Off the raider and the fight together, so it holds still where it has to and
 * varies where it should: the same stone for that raider for the whole of that
 * pull, a different one from the raider beside them, and a different one again
 * the next time the same raider goes down in the same spot on a different
 * pull. Off the id alone it was a fixed cycle — slot one always took the
 * round stone — and six raiders dying laid out the same six stones in the same
 * order every time.
 *
 * Still not `Math.random`, for the reason the room is not: a pull replays from
 * its seed and a fight can be handed to somebody as a link, and a headstone
 * that re-rolled on every frame would flicker between six of them.
 *
 * @param tall How tall to stand it, in screen pixels — a shade under a living
 *   body, because a headstone is not a person.
 */
export function drawGrave(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tall: number,
  who: number,
  seed: number,
): boolean {
  begin()
  if (!sheet) return false
  const id = GRAVES[new Rng(who * 2654435761 + seed * 40503 + 911).int(GRAVES.length)]!
  const rect = PROPS[id]
  if (!rect) return false
  const [sx, sy, sw, sh] = rect
  const w = (tall * sw) / sh
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(sheet, sx, sy, sw, sh, x - w / 2, y - tall, w, tall)
  ctx.restore()
  return true
}

/**
 * The rocks, drawn as rocks.
 *
 * @param project The renderer's own world-to-screen, passed in rather than
 *   imported: it depends on the camera, and the camera lives with the drawing.
 */
export function drawObstacles(
  ctx: CanvasRenderingContext2D,
  project: (p: Vec2) => Vec2,
  scale: number,
  obstacles: Obstacle[],
): boolean {
  begin()
  if (!sheet) return false

  for (const rock of obstacles) {
    const lumps = pileFor(rock)
    ctx.save()
    ctx.imageSmoothingEnabled = false
    // Back to front inside the pile, by where each lump meets the ground.
    for (const lump of [...lumps].sort((a, b) => a.dy - b.dy)) {
      const rect = PROPS[lump.id]
      if (!rect) continue
      const [sx, sy, sw, sh] = rect
      const at = project({ x: rock.pos.x + lump.dx, y: rock.pos.y + lump.dy })
      const h = lump.tall * scale
      const w = (h * sw) / sh
      ctx.save()
      if (lump.flip) {
        ctx.translate(at.x, 0)
        ctx.scale(-1, 1)
        ctx.drawImage(sheet, sx, sy, sw, sh, -w / 2, at.y - h, w, h)
      } else {
        ctx.drawImage(sheet, sx, sy, sw, sh, at.x - w / 2, at.y - h, w, h)
      }
      ctx.restore()
    }
    ctx.restore()
  }
  return true
}


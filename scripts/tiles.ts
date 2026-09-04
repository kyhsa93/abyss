/**
 * Cut the arena's furniture out of Liberated Pixel Cup tilesets.
 *
 * The sister of `scripts/lpc.ts`, and it exists for the same reason: the set
 * that draws the bodies also draws the ground they stand on, properly licensed
 * and properly credited, and a game that already ships one of them has no
 * excuse for inventing the other.
 *
 * What is different is the licensing, and it is the whole of why this file has
 * an `AUTHORS` table in it. The tilesets ship one attribution document for the
 * lot, and that document has a `MISSING:` section — a list of tiles nobody
 * recorded the author of. Among them, in this set, are the stone columns and
 * the carved head, which are the first things anybody reaching for scenery
 * would reach for.
 *
 * A sheet licensed CC-BY whose author is unknown cannot be complied with: the
 * condition is attribution, and there is nobody to attribute. That is the same
 * position this game threw an entire set of generated art away over — "no
 * stated terms is a worse position than any stated terms" — so it is not one
 * to walk back into with a nicer-looking pillar.
 *
 * So every piece here names an author, the build refuses one that does not,
 * and the credits are written out of the same table the pieces come from.
 *
 *   npm run tiles -- --tiles ~/src/lpc-tiles
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

const IMAGE = resolve(process.cwd(), 'public/art/props.webp')
const TABLE = resolve(process.cwd(), 'src/render/props.ts')
const CREDITS = resolve(process.cwd(), 'art/LPC-TERRAIN-CREDITS.md')

const args = process.argv.slice(2)
const at = args.indexOf('--tiles')
const TILES = resolve(at >= 0 && args[at + 1] ? args[at + 1]! : join(homedir(), 'src/lpc-tiles'))

/** Painted detail is what compresses badly and pixel art has none. */
const QUALITY = 0.9

interface Author {
  name: string
  licences: string
  url?: string
}

/**
 * Who drew what, named rather than assumed.
 *
 * Copied out of `Final Attribution.txt` beside the sheets, which is the file
 * the tilesets are distributed with. Only the people whose work is actually
 * cut out below appear here — the sheets have more authors than this and the
 * credits should say what was used, not what was available.
 */
const AUTHORS: Record<string, Author> = {
  sharm: {
    name: 'Lanea Zimmerman (AKA Sharm)',
    licences: 'CC-BY 3.0 / GPL 3.0 / GPL 2.0 / OGA-BY 3.0',
    url: 'https://opengameart.org/content/tiled-terrains',
  },
  casper: {
    name: 'Casper Nilsson',
    licences: 'CC-BY-SA 3.0 / GPL 3.0',
    url: 'https://opengameart.org/content/lpc-adjusted-tilesets',
  },
  eddeland: {
    name: 'Daniel Eddeland',
    licences: 'CC-BY-SA 3.0 / GPL 3.0',
    url: 'https://opengameart.org/content/lpc-farming-tilesets-magic-animations-and-ui-elements',
  },
}

interface Piece {
  id: string
  sheet: string
  x: number
  y: number
  w: number
  h: number
  /** Which of `AUTHORS`. There is no default and there must not be. */
  by: string
}

/**
 * The pieces, in source pixels.
 *
 * Rectangles rather than tile indices because a headstone is not a tile — it
 * is two of them with a fish swimming past the corner of the second, and the
 * numbers here are the ones that leave the fish out.
 */
const PIECES: Piece[] = [
  // Casper Nilsson's graveyard, which is what a drowned floor should be
  // furnished with.
  { id: 'cross', sheet: 'Outside Objects.png', x: 864, y: 544, w: 32, h: 64, by: 'casper' },
  { id: 'tomb', sheet: 'Outside Objects.png', x: 896, y: 544, w: 60, h: 96, by: 'casper' },
  { id: 'grave-round', sheet: 'Outside Objects.png', x: 960, y: 544, w: 32, h: 50, by: 'casper' },
  { id: 'grave-rip', sheet: 'Outside Objects.png', x: 992, y: 544, w: 32, h: 50, by: 'casper' },
  { id: 'grave-pair', sheet: 'Outside Objects.png', x: 960, y: 588, w: 64, h: 54, by: 'casper' },
  { id: 'cross-wood', sheet: 'Outside Objects.png', x: 832, y: 640, w: 32, h: 46, by: 'casper' },

  // Daniel Eddeland's pier is not here and it is the interesting omission: it
  // is drawn lying on the ground, and everything else in this table stands up.
  // Drawn upright with the rest it reads as a wooden fence, which is a thing
  // this game does not have. A flat piece needs the floor's own tilt on it,
  // which is a second way of drawing rather than a second entry in a table.

  // Sharm's floor, and the only piece here that repeats: everything else is an
  // object and this is a surface. Picked by tiling the candidates five across
  // and looking — the neighbouring fills in the same set are the bordered ones
  // and show their own edges every thirty-two pixels, which on a floor this
  // size is a visible weave.
  //
  // Five of them, and the renderer picks one per fight. They are wildly
  // different colours — sand, clay, brick, slate — and none of that colour
  // reaches the floor: the pattern is taken and the hue is thrown away, for
  // the same reason the slabs under it are drawn in the encounter's accent
  // rather than in whatever an artist chose. What varies between rooms is the
  // stone; what says which fight this is stays the fight's own.
  { id: 'floor-slate', sheet: 'Terrain and Outside.png', x: 320, y: 96, w: 32, h: 32, by: 'sharm' },
  { id: 'floor-sand', sheet: 'Terrain and Outside.png', x: 32, y: 96, w: 32, h: 32, by: 'sharm' },
  { id: 'floor-earth', sheet: 'Terrain and Outside.png', x: 128, y: 96, w: 32, h: 32, by: 'sharm' },
  { id: 'floor-clay', sheet: 'Terrain and Outside.png', x: 224, y: 96, w: 32, h: 32, by: 'sharm' },
  { id: 'floor-cobble', sheet: 'Terrain and Outside.png', x: 192, y: 384, w: 32, h: 32, by: 'sharm' },

  // Sharm's white rocks.
  { id: 'rock', sheet: 'Terrain and Outside.png', x: 960, y: 544, w: 32, h: 32, by: 'sharm' },
  { id: 'rocks', sheet: 'Terrain and Outside.png', x: 992, y: 544, w: 32, h: 32, by: 'sharm' },
]

function unattributed(): string[] {
  return PIECES.filter((p) => !AUTHORS[p.by]).map((p) => `${p.id} names no author (${p.by})`)
}

async function main(): Promise<void> {
  if (!existsSync(TILES)) {
    console.error(`no tilesets at ${TILES}`)
    console.error('  the LPC tilesets and their Final Attribution.txt go there')
    process.exit(1)
  }
  const wrong = unattributed()
  for (const line of wrong) console.error(`  ! ${line}`)
  if (wrong.length > 0) process.exit(1)

  const sheets: Record<string, string> = {}
  for (const name of new Set(PIECES.map((p) => p.sheet))) {
    const file = join(TILES, name)
    if (!existsSync(file)) {
      console.error(`missing sheet ${name}`)
      process.exit(1)
    }
    sheets[name] = `data:image/png;base64,${readFileSync(file).toString('base64')}`
  }

  const browser = await chromium.launch()
  let packed: { png: string; width: number; height: number; rects: [number, number, number, number][] }
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><meta charset="utf-8">', { waitUntil: 'load' })
    packed = await page.evaluate(
      async ({ sheets, pieces, quality }) => {
        const imgs: Record<string, HTMLImageElement> = {}
        for (const [name, data] of Object.entries(sheets)) {
          const img = new Image()
          img.src = data
          await img.decode()
          imgs[name] = img
        }

        // Shelves, tallest first, into a sheet as wide as the widest piece
        // needs and no wider than a texture anybody has trouble with.
        const width = 256
        const order = [...pieces].sort((a, b) => b.h - a.h)
        const placed = new Map<string, { x: number; y: number }>()
        let penX = 0
        let penY = 0
        let shelf = 0
        for (const p of order) {
          if (penX + p.w > width) {
            penX = 0
            penY += shelf
            shelf = 0
          }
          placed.set(p.id, { x: penX, y: penY })
          penX += p.w
          shelf = Math.max(shelf, p.h)
        }
        const height = penY + shelf

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.imageSmoothingEnabled = false
        for (const p of pieces) {
          const at = placed.get(p.id)!
          ctx.drawImage(imgs[p.sheet]!, p.x, p.y, p.w, p.h, at.x, at.y, p.w, p.h)
        }
        return {
          png: canvas.toDataURL('image/webp', quality),
          width,
          height,
          rects: pieces.map((p) => {
            const at = placed.get(p.id)!
            return [at.x, at.y, p.w, p.h] as [number, number, number, number]
          }),
        }
      },
      { sheets, pieces: PIECES, quality: QUALITY },
    )
  } finally {
    await browser.close()
  }

  mkdirSync(resolve(process.cwd(), 'public/art'), { recursive: true })
  const bytes = Buffer.from(packed.png.slice(packed.png.indexOf(',') + 1), 'base64')
  writeFileSync(IMAGE, bytes)

  const rows = PIECES.map((p, i) => `  '${p.id}': [${packed.rects[i]!.join(', ')}],`).join('\n')
  writeFileSync(
    TABLE,
    `/**
 * Where each prop sits in \`public/art/props.webp\`, as [x, y, w, h].
 *
 * Generated by \`npm run tiles\` — edit the piece table in the packer, not this
 * file. Every piece names an author and the build refuses one that does not;
 * the credits are in \`art/LPC-TERRAIN-CREDITS.md\`.
 */

export const PROPS_SRC = 'art/props.webp'

export const PROPS: Record<string, [number, number, number, number]> = {
${rows}
}

export const PROP_IDS = Object.keys(PROPS)
`,
  )

  const used = [...new Set(PIECES.map((p) => p.by))].sort()
  const lines = used.map((key) => {
    const a = AUTHORS[key]!
    const mine = PIECES.filter((p) => p.by === key).map((p) => p.id).sort()
    return `- **${a.name}** — ${a.licences}${a.url ? `\n  <${a.url}>` : ''}\n  ${mine.join(', ')}`
  })
  mkdirSync(resolve(process.cwd(), 'art'), { recursive: true })
  writeFileSync(
    CREDITS,
    `# Terrain credits

The props standing around the arena are cut from [Liberated Pixel
Cup](https://lpc.opengameart.org/) tilesets by \`npm run tiles\`. They are
variously licensed CC-BY 3.0, CC-BY-SA 3.0, GPL 3.0, GPL 2.0 and OGA-BY 3.0;
attribution is a condition of all of them, so this list is generated from the
same table the pieces are cut with and cannot fall behind a change to it.

The tilesets ship one attribution document between them, and it has a section
listing tiles whose author nobody recorded. Nothing from that section is used
here: a CC-BY tile with no known author is a tile whose licence cannot be
complied with. The packer refuses a piece that names no author.

${lines.join('\n\n')}
`,
  )

  const kb = (bytes.length / 1024).toFixed(1)
  console.log(`tiles: ${PIECES.length} props, ${packed.width}x${packed.height}, ${kb} kB webp`)
  console.log(`  ${used.length} authors credited`)
}

void main()

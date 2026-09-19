/**
 * Eighty-two icons into one sheet, tinted by what the ability is.
 *
 * The library ships monochrome — a white glyph on a black square — and that is
 * the useful part rather than a limitation. The complaint that started this was
 * that a shield outline reads the same whether it belongs to a paladin or a
 * warlock, and a silhouette with no colour of its own can be given the colour
 * of its school. The icon then carries two facts at once, which is what a
 * button forty pixels wide has room for.
 *
 * Both edits to the source are safe because the library is uniform: every file
 * is a 512 viewBox holding exactly one unfilled background rect and glyph paths
 * filled `#fff`. That is asserted below rather than assumed — a library update
 * that changed it would otherwise produce eighty-two black squares.
 *
 * Shipping them loose would put eighty-two entries in the service worker's
 * precache and eighty-two requests on a first paint; on the phone this game is
 * aimed at, that is the whole budget spent on decoration. One sheet is one
 * request and one cache entry.
 *
 * The browser does the packing. Node has no image encoder, and `visualcheck`
 * already brought a real one into this repo.
 *
 *   npm run atlas
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

import { ABILITIES } from '../src/sim/abilities'
import { elementOf } from './artprompt'

const MAP = resolve(process.cwd(), 'art/icons.json')
const SVG = resolve(process.cwd(), 'art/svg')
const IMAGE = resolve(process.cwd(), 'public/art/icons.webp')
const TABLE = resolve(process.cwd(), 'src/render/atlas.ts')

/**
 * An icon is drawn at roughly forty CSS pixels inside a round button. Ninety-
 * six covers that at a device pixel ratio of two with room to spare, and the
 * ratio is capped at two on the way in.
 */
const CELL = 96

/** Wide enough that the sheet stays close to square at eighty-odd icons. */
const COLS = 10

/** Painted detail is what compresses badly, and there is none of it here. */
const QUALITY = 0.9

/**
 * The colour a school reads as, on this game's background.
 *
 * Deliberately not the palette prose in `artprompt` — that describes materials
 * to a model, and this has to survive being drawn at 40px on `#0a0a0f`, which
 * rules out anything dark or unsaturated. Kept lighter than the equivalent
 * body colours for the same reason: a glyph is thin where a body is solid.
 */
const TINT: Record<string, string> = {
  lunar: '#c4b5fd',
  ice: '#7dd3fc',
  storm: '#93c5fd',
  holy: '#fde68a',
  fire: '#fb923c',
  shadow: '#c084fc',
  earth: '#d6b98c',
  nature: '#86efac',
  fel: '#a3e635',
  poison: '#a3e635',
  water: '#67e8f9',
}

/** No school of its own: physical strikes, taunts, plain defensives. */
const BY_KIND: Record<string, string> = {
  damage: '#e5e7eb',
  heal: '#86efac',
  defensive: '#93c5fd',
  taunt: '#fca5a5',
  charge: '#fcd34d',
}

/** Which of the element names in `artprompt` a palette entry belongs to. */
function schoolOf(id: string, name: string): string | null {
  const prose = elementOf(id, name)
  if (!prose) return null
  for (const key of Object.keys(TINT)) if (prose.startsWith(key)) return key
  return null
}

function tintFor(id: string): string {
  const ability = ABILITIES[id]
  if (!ability) return '#e5e7eb'
  const school = schoolOf(id, ability.name)
  return (school && TINT[school]) || BY_KIND[ability.kind] || '#e5e7eb'
}

/** The white glyph in the game's colour, on nothing. */
function recolour(source: string, colour: string): string {
  // The black square behind the glyph is the one path with no fill. Dropping it
  // is what lets the sheet be transparent, so an icon can sit on a cooldown
  // shade, a disabled button and a highlight without carrying its own square.
  const withoutGround = source.replace('<path d="M0 0h512v512H0z"/>', '')
  if (withoutGround === source) throw new Error('no background rect — the library changed shape')
  if (!withoutGround.includes('fill="#fff"')) throw new Error('no white glyph — the library changed shape')
  return withoutGround.replaceAll('fill="#fff"', `fill="${colour}"`)
}

interface Chosen {
  icon: string
  author: string
}

async function main(): Promise<void> {
  if (!existsSync(MAP)) {
    console.error('no art/icons.json — run `npm run iconmatch -- --icons <dir> --write` first')
    process.exit(1)
  }

  const chosen = JSON.parse(readFileSync(MAP, 'utf8')) as Record<string, Chosen>
  // Sorted, so the sheet is byte-stable and adding an ability in the middle of
  // `abilities.ts` does not reshuffle everything.
  const ids = Object.keys(chosen).sort()

  const cells = ids.map((id, index) => {
    const path = resolve(SVG, `${chosen[id]!.icon}.svg`)
    if (!existsSync(path)) throw new Error(`missing SVG for ${id}: ${chosen[id]!.icon}`)
    const svg = recolour(readFileSync(path, 'utf8'), tintFor(id))
    return {
      id,
      x: (index % COLS) * CELL,
      y: Math.floor(index / COLS) * CELL,
      data: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    }
  })

  const width = COLS * CELL
  const height = Math.ceil(cells.length / COLS) * CELL

  const browser = await chromium.launch()
  let encoded: string
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><meta charset="utf-8">', { waitUntil: 'load' })
    encoded = await page.evaluate(
      async ({ cells, width, height, cell, quality }) => {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.clearRect(0, 0, width, height)

        for (const c of cells) {
          const image = new Image()
          image.src = c.data
          await image.decode()
          // A little inset: these glyphs run to the edge of their viewBox, and
          // butted against each other they bleed into the neighbouring cell
          // when the sheet is sampled with any filtering at all.
          const pad = Math.round(cell * 0.06)
          ctx.drawImage(image, c.x + pad, c.y + pad, cell - pad * 2, cell - pad * 2)
        }
        return canvas.toDataURL('image/webp', quality)
      },
      { cells, width, height, cell: CELL, quality: QUALITY },
    )
  } finally {
    await browser.close()
  }

  mkdirSync(resolve(process.cwd(), 'public/art'), { recursive: true })
  const bytes = Buffer.from(encoded.slice(encoded.indexOf(',') + 1), 'base64')
  writeFileSync(IMAGE, bytes)

  const entries = cells.map((c) => `  ${c.id}: [${c.x}, ${c.y}],`).join('\n')
  const authors = [...new Set(ids.map((id) => chosen[id]!.author))].sort()
  writeFileSync(
    TABLE,
    `/**
 * Where each ability icon sits in \`public/art/icons.webp\`.
 *
 * Generated by \`npm run atlas\` — edit \`art/icons.json\` or the packer, not
 * this file.
 *
 * The art is from game-icons.net under CC BY 3.0, recoloured. Attribution is a
 * condition of that licence, so the names here are not a courtesy:
 * ${authors.join(', ')}.
 */

export const ATLAS_CELL = ${CELL}
export const ATLAS_SRC = 'art/icons.webp'

export const ATLAS: Record<string, readonly [number, number]> = {
${entries}
}
`,
  )

  const kb = (bytes.length / 1024).toFixed(1)
  console.log(`atlas: ${cells.length} icons, ${width}x${height}, ${kb} kB webp`)
  console.log(`  credit: ${authors.join(', ')}`)
}

main()

/**
 * Pack the hit effects into one sheet.
 *
 * These are CC0 — no attribution required and no share-alike, which is the
 * lightest licence anything in this repo runs under. They come from the
 * Superpowers asset packs, which ship them as horizontal strips of frames.
 *
 * They go over the drawn burst rather than instead of it. That burst takes its
 * colour from the ability's own icon, which is how fifty-one spells stopped
 * flying as four colours of dot, and a sprite has a colour baked in — replacing
 * the primitive would trade a fact for a flourish. Layered, the ring still says
 * which school and the sprite says how hard it landed.
 *
 * Which effect plays is chosen by school where the art already agrees with one
 * — fire gets flame, holy gets the cross, storm gets the bolt — and by a
 * neutral burst everywhere else. Nothing is tinted: an orange flame recoloured
 * violet stops looking like fire and starts looking like a mistake.
 *
 *   npm run fx -- --packs ~/src/superpowers-asset-packs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

const IMAGE = resolve(process.cwd(), 'public/art/fx.webp')
const TABLE = resolve(process.cwd(), 'src/render/fx.ts')

const args = process.argv.slice(2)
const at = args.indexOf('--packs')
const PACKS = resolve(at >= 0 && args[at + 1] ? args[at + 1]! : join(homedir(), 'src/superpowers-asset-packs'))
const FX_DIR = 'rpg-battle-system/fx'

/** Square, and about the size a hit is drawn at on a phone. */
const CELL = 64

/** Flat colour over transparency; there is nothing here for a codec to smear. */
const QUALITY = 0.9

/**
 * The effects, and how many frames each strip holds.
 *
 * Frame count is measured rather than guessed. Dividing width by height looked
 * right and was wrong on half of them — it cut the blast through the middle of
 * its own explosions and gave the bolt ten frames, five of them blank. The
 * count that is right is the one whose frame boundaries land on empty columns,
 * which is a thing that can be checked instead of counted by eye:
 *
 *   for k in 2..12: score k by how many of its k-1 boundaries are blank
 *
 * Run against these strips that picks 6, 4, 3, 6, 5, 7, 3, 5 — and every one
 * of those cuts cleanly between frames.
 */
const EFFECTS: Array<{ name: string; file: string; frames: number }> = [
  { name: 'burst', file: '1', frames: 6 },
  { name: 'flame', file: '11', frames: 4 },
  { name: 'holy', file: '12', frames: 3 },
  { name: 'bolt', file: '2', frames: 6 },
  { name: 'slash', file: '4', frames: 5 },
  { name: 'heal', file: '7', frames: 7 },
  { name: 'blast', file: '9', frames: 3 },
  { name: 'gust', file: '14', frames: 5 },
]

async function main(): Promise<void> {
  const dir = join(PACKS, FX_DIR)
  if (!existsSync(dir)) {
    console.error(`no effects at ${dir}`)
    console.error('  git clone --depth 1 https://github.com/sparklinlabs/superpowers-asset-packs.git')
    console.error('  npm run fx -- --packs <that directory>')
    process.exit(1)
  }

  const missing = EFFECTS.filter((e) => !existsSync(join(dir, `${e.file}.png`)))
  for (const e of missing) console.error(`  ! missing  ${e.file}.png`)
  if (missing.length > 0) process.exit(1)

  const rows = EFFECTS.map((e, index) => ({
    name: e.name,
    frames: e.frames,
    row: index,
    data: `data:image/png;base64,${readFileSync(join(dir, `${e.file}.png`)).toString('base64')}`,
  }))

  const width = Math.max(...EFFECTS.map((e) => e.frames)) * CELL
  const height = EFFECTS.length * CELL

  const browser = await chromium.launch()
  let encoded: string
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><meta charset="utf-8">', { waitUntil: 'load' })
    encoded = await page.evaluate(
      async ({ rows, width, height, cell, quality }) => {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.imageSmoothingEnabled = false

        for (const r of rows) {
          const image = new Image()
          image.src = r.data
          await image.decode()

          const step = image.naturalWidth / r.frames
          // Fit rather than fill, and centred: the strips are not all the same
          // shape and a bolt is much wider than it is tall. Stretching each to
          // a square would make the wide ones squat and the tall ones thin.
          const scale = Math.min(cell / step, cell / image.naturalHeight)
          const w = step * scale
          const h = image.naturalHeight * scale

          for (let f = 0; f < r.frames; f++) {
            ctx.drawImage(
              image,
              Math.round(f * step),
              0,
              Math.round(step),
              image.naturalHeight,
              f * cell + (cell - w) / 2,
              r.row * cell + (cell - h) / 2,
              w,
              h,
            )
          }
        }
        return canvas.toDataURL('image/webp', quality)
      },
      { rows, width, height, cell: CELL, quality: QUALITY },
    )
  } finally {
    await browser.close()
  }

  mkdirSync(resolve(process.cwd(), 'public/art'), { recursive: true })
  const bytes = Buffer.from(encoded.slice(encoded.indexOf(',') + 1), 'base64')
  writeFileSync(IMAGE, bytes)

  const entries = EFFECTS.map((e, i) => `  ${e.name}: { row: ${i}, frames: ${e.frames} },`).join('\n')
  writeFileSync(
    TABLE,
    `/**
 * Where each hit effect sits in \`public/art/fx.webp\`.
 *
 * Generated by \`npm run fx\` — edit the effect table in the packer, not this
 * file. One effect per row, frames across, left to right.
 *
 * The art is from the Superpowers asset packs and is CC0: no attribution
 * required, no share-alike. It is the lightest licence anything here runs
 * under, which is why there is no credits file to go with it.
 */

export const FX_CELL = ${CELL}
export const FX_SRC = 'art/fx.webp'

export const FX: Record<string, { row: number; frames: number }> = {
${entries}
}
`,
  )

  const kb = (bytes.length / 1024).toFixed(1)
  console.log(`fx: ${EFFECTS.length} effects, ${width}x${height}, ${kb} kB webp`)
}

main()

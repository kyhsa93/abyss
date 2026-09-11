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

/**
 * And the second shelf, which is where the variety came from.
 *
 * The Superpowers pack is fourteen effects and it is a *hit* set: eight of
 * them are the flash where a bolt landed. What a boss's floor needs is the
 * other thing — something that turns over inside a circle for twelve seconds
 * — and there were three of those in it.
 *
 * CodeManu's pack is twenty, CC0 as well, and it is almost entirely the other
 * kind: rings, spins, vortices, a frost burst. Both are pixel art, which is
 * the only test that has ever mattered here — the round this followed threw
 * out a set of 3D renders for the single reason that they were a different
 * kind of image from everything already on the floor.
 *
 *   https://opengameart.org/content/free-pixel-effects-pack
 */
const codeAt = args.indexOf('--codemanu')
const CODEMANU = resolve(
  codeAt >= 0 && args[codeAt + 1] ? args[codeAt + 1]! : join(homedir(), 'src/fx/codemanu'),
)

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
interface Effect {
  name: string
  file: string
  frames: number
  /**
   * How many cells across the source is, when it is a grid rather than a strip.
   *
   * The two packs are shaped differently and neither is wrong: Superpowers
   * ships a row of frames, CodeManu ships a square — nine by nine of hundred
   * pixel cells, read left to right and top to bottom. A grid is subsampled
   * the way the bodies are, evenly across however many frames it really has,
   * because eighty-one frames at sixty-four pixels is a five-thousand-pixel
   * row for one effect.
   */
  grid?: number
}

const EFFECTS: Effect[] = [
  { name: 'burst', file: '1', frames: 6 },
  { name: 'flame', file: '11', frames: 4 },
  { name: 'holy', file: '12', frames: 3 },
  { name: 'bolt', file: '2', frames: 6 },
  { name: 'slash', file: '4', frames: 5 },
  { name: 'heal', file: '7', frames: 7 },
  { name: 'blast', file: '9', frames: 3 },
  { name: 'gust', file: '14', frames: 5 },
  // And the six the pack ships that nothing was taking.
  //
  // These are not for hits. Everything above plays once where a bolt landed;
  // these loop on the *floor*, on the ground a boss has laid, because a patch
  // that is bad to stand in was a coloured circle with a dashed edge and
  // nothing in it — the shape says where and nothing says what. The shape is
  // still the fact and still what the raid reads: the sprite goes over it, the
  // same arrangement the hits already have, and the circle underneath is
  // untouched.
  { name: 'dust', file: '13', frames: 6 },
  { name: 'rocks', file: '8', frames: 6 },
  { name: 'claw', file: '3', frames: 6 },
  { name: 'sweep', file: '5', frames: 4 },
  { name: 'cross', file: '6', frames: 5 },
  { name: 'rake', file: '10', frames: 4 },

  // --- CodeManu, and this is the half that goes on the floor ---------------
  //
  // Eight frames each out of squares of up to a hundred and twenty-one, which
  // is enough for a loop to read as motion and few enough that the sheet stays
  // a sheet. Chosen for what the building actually holds rather than for what
  // the pack is proud of: this is a citadel of ice, plague and bone, so the
  // frost burst, the green rot and the dark plume are in, and the pink
  // figure-of-eight is not.
  { name: 'freezing', file: 'codemanu:19_freezing', frames: 8, grid: 10 },
  { name: 'vortex', file: 'codemanu:13_vortex', frames: 8, grid: 8 },
  { name: 'ring', file: 'codemanu:8_protectioncircle', frames: 8, grid: 8 },
  { name: 'rot', file: 'codemanu:17_felspell', frames: 8, grid: 10 },
  { name: 'nova', file: 'codemanu:12_nebula', frames: 8, grid: 8 },
  { name: 'flare', file: 'codemanu:16_sunburn', frames: 8, grid: 8 },
  { name: 'firering', file: 'codemanu:7_firespin', frames: 8, grid: 8 },
  { name: 'phantom', file: 'codemanu:14_phantom', frames: 8, grid: 8 },
  { name: 'shade', file: 'codemanu:18_midnight', frames: 8, grid: 8 },
  { name: 'impact', file: 'codemanu:10_weaponhit', frames: 6, grid: 6 },
  { name: 'coldfire', file: 'codemanu:3_bluefire', frames: 8, grid: 8 },
]

async function main(): Promise<void> {
  const dir = join(PACKS, FX_DIR)
  if (!existsSync(dir)) {
    console.error(`no effects at ${dir}`)
    console.error('  git clone --depth 1 https://github.com/sparklinlabs/superpowers-asset-packs.git')
    console.error('  npm run fx -- --packs <that directory>')
    process.exit(1)
  }

  /** Which shelf a name is on, and what it is called there. */
  const pathOf = (file: string): string =>
    file.startsWith('codemanu:')
      ? join(CODEMANU, `${file.slice('codemanu:'.length)}_spritesheet.png`)
      : join(dir, `${file}.png`)

  const missing = EFFECTS.filter((e) => !existsSync(pathOf(e.file)))
  for (const e of missing) console.error(`  ! missing  ${pathOf(e.file)}`)
  if (missing.length > 0) process.exit(1)

  const rows = EFFECTS.map((e, index) => ({
    name: e.name,
    frames: e.frames,
    grid: e.grid ?? 0,
    row: index,
    data: `data:image/png;base64,${readFileSync(pathOf(e.file)).toString('base64')}`,
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

          // A grid reads its cell off how many are across; a strip divides its
          // width by the frames it is declared to have.
          const across = r.grid > 0 ? r.grid : r.frames
          const stepX = image.naturalWidth / across
          const stepY = r.grid > 0 ? image.naturalHeight / r.grid : image.naturalHeight
          // Fit rather than fill, and centred: the strips are not all the same
          // shape and a bolt is much wider than it is tall. Stretching each to
          // a square would make the wide ones squat and the tall ones thin.
          const scale = Math.min(cell / stepX, cell / stepY)
          const w = stepX * scale
          const h = stepY * scale
          const total = r.grid > 0 ? r.grid * r.grid : r.frames

          for (let f = 0; f < r.frames; f++) {
            // Evenly across whatever the source really has, first frame first.
            const from =
              r.frames === 1 ? 0 : Math.round((f * (total - 1)) / (r.frames - 1))
            ctx.drawImage(
              image,
              Math.round((from % across) * stepX),
              Math.round(Math.floor(from / across) * stepY),
              Math.round(stepX),
              Math.round(stepY),
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
 * Where each effect sits in \`public/art/fx.webp\`.
 *
 * Generated by \`npm run fx\` — edit the effect table in the packer, not this
 * file. One effect per row, frames across, left to right.
 *
 * Two packs, both CC0: the Superpowers asset packs, which are a *hit* set —
 * the flash where a bolt landed — and CodeManu's Free Pixel Effects Pack,
 * which is mostly the other kind, the thing that turns over inside a circle
 * for as long as the circle is there. CC0 is no attribution and no
 * share-alike, the lightest licence anything here runs under, which is why
 * there is no credits file to go with it. Both are named anyway:
 *
 *   https://github.com/sparklinlabs/superpowers-asset-packs
 *   https://opengameart.org/content/free-pixel-effects-pack
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

/**
 * Pack the projectile bodies into one sheet.
 *
 * These are CC0 pixel art spells by DevWizard, from OpenGameArt. Same licence
 * as the hit effects: no attribution required and no share-alike, so there is
 * no credits file to go with them.
 *
 *   npm run bolt -- --spells <the unpacked "Pixelart Spells" directory>
 *
 * Everything here comes out greyscale, and that is the whole point rather than
 * a compromise.
 *
 * A projectile's colour is not decoration in this renderer: it comes from the
 * ability's own icon, and it is the only thing telling fifty-one spells apart
 * in flight. Every projectile sprite that exists anywhere has a colour baked
 * in, so using one as drawn would send a frost bolt across the arena in
 * orange. That is a worse trade than the coloured dot it replaced — a shape
 * gained and a fact lost.
 *
 * So the art is reduced to luminance here and tinted per ability at draw time.
 * The shape and the shine come from the sprite, the colour keeps coming from
 * the ability, and neither has to give anything up.
 *
 * Reducing to luminance also frees the choice of shapes. Picking only sprites
 * that happened to be drawn grey left three usable ones, one of which was a
 * beam segment and one a scatter of specks. Desaturating means the four can be
 * chosen on what they look like instead.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

const IMAGE = resolve(process.cwd(), 'public/art/bolt.webp')
const TABLE = resolve(process.cwd(), 'src/render/bolt.ts')

const args = process.argv.slice(2)
const at = args.indexOf('--spells')
const SPELLS = resolve(at >= 0 && args[at + 1] ? args[at + 1]! : join(homedir(), 'src/pixelart-spells'))
const PNG_DIR = 'PNG Files'

/** Source frames are 16x16; twice that leaves room to scale without blurring. */
const CELL = 32

/** Six for all four, so the sheet is a rectangle and the loop is one modulo. */
const FRAMES = 6

/** Flat colour over transparency; there is nothing here for a codec to smear. */
const QUALITY = 0.9

/**
 * One body per projectile kind, chosen by shape rather than by name.
 *
 * The file names are what the pack calls them and the row names are what they
 * look like, because a fireball desaturated and tinted violet is a comet and
 * calling it a fireball in the renderer would be the same mistake as letting
 * it stay orange.
 *
 *   dart   a thin head with a swept tail — reads as fast and aimed
 *   comet  a chunky head trailing debris — reads as something that lingers
 *   orb    a full disc — reads as heavy and slow
 *   star   a four-pointed sparkle, symmetric, so rotation cannot look wrong
 */
const BODIES: Array<{ kind: string; file: string }> = [
  { kind: 'bolt', file: 'Light Bolt' },
  { kind: 'dot', file: 'Fireball' },
  { kind: 'heavy', file: 'Bolt Of Purity' },
  { kind: 'heal', file: 'Pure Bolt 2' },
]

async function main(): Promise<void> {
  const dir = join(SPELLS, PNG_DIR)
  if (!existsSync(dir)) {
    console.error(`no spells at ${dir}`)
    console.error('  https://opengameart.org/content/pixel-art-spells  (CC0, DevWizard)')
    console.error('  npm run bolt -- --spells <the unpacked directory>')
    process.exit(1)
  }

  const missing = BODIES.filter((b) => !existsSync(join(dir, `${b.file}.png`)))
  for (const b of missing) console.error(`  ! missing  ${b.file}.png`)
  if (missing.length > 0) process.exit(1)

  const rows = BODIES.map((b, index) => ({
    kind: b.kind,
    row: index,
    data: `data:image/png;base64,${readFileSync(join(dir, `${b.file}.png`)).toString('base64')}`,
  }))

  const browser = await chromium.launch()
  let packed: { encoded: string; report: string[] }
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><meta charset="utf-8">', { waitUntil: 'load' })
    packed = await page.evaluate(
      async ({ rows, cell, frames, quality }) => {
        const canvas = document.createElement('canvas')
        canvas.width = frames * cell
        canvas.height = rows.length * cell
        const ctx = canvas.getContext('2d')!
        ctx.imageSmoothingEnabled = false
        const report: string[] = []

        for (const r of rows) {
          const image = new Image()
          image.src = r.data
          await image.decode()

          const size = image.naturalHeight
          const have = Math.max(1, Math.round(image.naturalWidth / size))

          const cut = document.createElement('canvas')
          cut.width = image.naturalWidth
          cut.height = size
          const cx = cut.getContext('2d', { willReadFrequently: true })!
          cx.imageSmoothingEnabled = false
          cx.drawImage(image, 0, 0)
          const pixels = cx.getImageData(0, 0, cut.width, cut.height)
          const d = pixels.data

          // Desaturate, then stretch so the brightest pixel is white.
          //
          // The stretch is what makes tinting work rather than a nicety. The
          // tint multiplies, so a sprite whose brightest pixel sits at a third
          // of full comes out at a third of the ability's colour — muddy, and
          // muddier the darker the source. Normalising means every body tints
          // to the same strength and the choice of sprite stops leaking into
          // how vivid the spell looks.
          let peak = 0
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3]! < 20) continue
            const l = d[i]! * 0.299 + d[i + 1]! * 0.587 + d[i + 2]! * 0.114
            if (l > peak) peak = l
          }
          const gain = peak > 0 ? 255 / peak : 1
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3]! < 20) {
              d[i + 3] = 0
              continue
            }
            const l = Math.min(255, (d[i]! * 0.299 + d[i + 1]! * 0.587 + d[i + 2]! * 0.114) * gain)
            d[i] = l
            d[i + 1] = l
            d[i + 2] = l
          }
          cx.putImageData(pixels, 0, 0)
          report.push(`${r.kind}: ${have} frames, peak ${Math.round(peak)} -> 255`)

          for (let f = 0; f < frames; f++) {
            // A sprite with fewer frames than the sheet holds loops rather
            // than blanks: four frames read as a slower animation, an empty
            // cell reads as the projectile having vanished mid-flight.
            const src = f % have
            ctx.drawImage(
              cut,
              src * size,
              0,
              size,
              size,
              f * cell,
              r.row * cell,
              cell,
              cell,
            )
          }
        }
        return { encoded: canvas.toDataURL('image/webp', quality), report }
      },
      { rows, cell: CELL, frames: FRAMES, quality: QUALITY },
    )
  } finally {
    await browser.close()
  }

  mkdirSync(resolve(process.cwd(), 'public/art'), { recursive: true })
  const bytes = Buffer.from(packed.encoded.slice(packed.encoded.indexOf(',') + 1), 'base64')
  writeFileSync(IMAGE, bytes)

  const entries = BODIES.map((b, i) => `  ${b.kind}: ${i},`).join('\n')
  writeFileSync(
    TABLE,
    `/**
 * Where each projectile body sits in \`public/art/bolt.webp\`.
 *
 * Generated by \`npm run bolt\` — edit the body table in the packer, not this
 * file. One kind per row, frames across, left to right.
 *
 * The art is greyscale on purpose: a projectile takes its colour from the
 * ability that threw it, and a sprite with a colour baked in would throw that
 * away. It is tinted at draw time instead.
 *
 * CC0 pixel art spells by DevWizard — no attribution required, no share-alike,
 * which is why there is no credits file to go with it.
 */

import type { ProjectileKind } from '../sim/types'

export const BOLT_CELL = ${CELL}
export const BOLT_FRAMES = ${FRAMES}
export const BOLT_SRC = 'art/bolt.webp'

export const BOLT_ROW: Record<ProjectileKind, number> = {
${entries}
}
`,
  )

  for (const line of packed.report) console.log(`  ${line}`)
  const kb = (bytes.length / 1024).toFixed(1)
  console.log(`bolt: ${BODIES.length} bodies, ${FRAMES * CELL}x${BODIES.length * CELL}, ${kb} kB webp`)
}

main()

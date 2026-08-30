/**
 * Cut the field sprites out of their background and pack them into one sheet.
 *
 * The generator returns JPEG and JPEG has no alpha, so a body that stands on
 * the floor has to have its background removed here. That is a flood fill
 * inwards from the four edges: start on every border pixel and walk to any
 * neighbour close enough in colour, which follows a gradient backdrop all the
 * way round and stops at the step in colour where the figure begins.
 *
 * The tolerance is the whole thing and it was found by sweeping. Too loose and
 * the fill steps across the outline and eats the body — at 24 the paladin came
 * back as a scattering of gold flecks. Too tight and the backdrop's own
 * gradient stops it. Ten is the value where the figure survives whole.
 *
 * A second pass clears what the fill cannot reach. Background enclosed by the
 * subject — the gap under an arm, the hole in a staff's ring — touches no edge,
 * so it is found by colour instead: whatever the border of this particular
 * picture actually is.
 *
 * That colour is measured rather than assumed, and the assumption is what
 * broke first. The prompt asks for a white backdrop and the prompt is not in
 * charge: a priest described in black and violet came back on a near-black
 * ground and a druid in green came back on green, and a cutout written around
 * the word "white" removed the character and kept the background. Reading the
 * border makes the cut work on whatever arrived.
 *
 * Everything happens in the browser because Node has no image codec, and
 * `visualcheck` already brought one into this repo.
 *
 *   npm run sprites
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const SRC = resolve(process.cwd(), 'art/sprites')
const IMAGE = resolve(process.cwd(), 'public/art/sprites.webp')
const TABLE = resolve(process.cwd(), 'src/render/sprites.ts')

/**
 * A body is drawn about three times the actor's radius tall, and a radius is
 * around fifteen screen pixels, so a cell of 160 covers it at twice that.
 */
const CELL = 160

/** Five across keeps twenty-two cells close to square. */
const COLS = 5

/** Alpha is what costs here; the colour is flat and compresses to nothing. */
const QUALITY = 0.8

/** Found by sweeping. See the note above — this is not a number to nudge. */
const TOLERANCE = 10

async function main(): Promise<void> {
  if (!existsSync(SRC)) {
    console.error('no art/sprites — run `npm run artgen -- --sprites --write` first')
    process.exit(1)
  }

  const ids = readdirSync(SRC)
    .filter((f) => f.endsWith('.jpg'))
    .map((f) => f.slice(0, -4))
    .sort()

  if (ids.length === 0) {
    console.error('no sprites in art/sprites')
    process.exit(1)
  }

  const cells = ids.map((id, index) => ({
    id,
    x: (index % COLS) * CELL,
    y: Math.floor(index / COLS) * CELL,
    data: `data:image/jpeg;base64,${readFileSync(resolve(SRC, `${id}.jpg`)).toString('base64')}`,
  }))

  const width = COLS * CELL
  const height = Math.ceil(cells.length / COLS) * CELL

  const browser = await chromium.launch()
  let result: { image: string; kept: Record<string, number> }
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><meta charset="utf-8">', { waitUntil: 'load' })
    result = await page.evaluate(
      async ({ cells, width, height, cell, quality, tolerance }) => {
        const sheet = document.createElement('canvas')
        sheet.width = width
        sheet.height = height
        const out = sheet.getContext('2d')!
        const kept: Record<string, number> = {}

        for (const c of cells) {
          const image = new Image()
          image.src = c.data
          await image.decode()

          // Cut at the source resolution and scale on the way into the sheet:
          // a flood fill on a downscaled image walks through the soft pixels
          // the scaler made along the outline.
          const w = image.naturalWidth
          const h = image.naturalHeight
          const work = document.createElement('canvas')
          work.width = w
          work.height = h
          const wc = work.getContext('2d', { willReadFrequently: true })!
          wc.drawImage(image, 0, 0)

          const pixels = wc.getImageData(0, 0, w, h)
          const d = pixels.data

          // What this picture's background actually is, taken as the median of
          // its border so one bright corner cannot move it.
          const border: number[][] = [[], [], []]
          const sample = (i: number) => {
            const o = i * 4
            border[0]!.push(d[o]!)
            border[1]!.push(d[o + 1]!)
            border[2]!.push(d[o + 2]!)
          }
          for (let x = 0; x < w; x += 2) {
            sample(x)
            sample((h - 1) * w + x)
          }
          for (let y = 0; y < h; y += 2) {
            sample(y * w)
            sample(y * w + w - 1)
          }
          const ground = border.map((channel) => {
            channel.sort((a, b) => a - b)
            return channel[channel.length >> 1]!
          })
          const seen = new Uint8Array(w * h)
          const stack: number[] = []

          const push = (i: number) => {
            if (!seen[i]) {
              seen[i] = 1
              stack.push(i)
            }
          }
          for (let x = 0; x < w; x++) {
            push(x)
            push((h - 1) * w + x)
          }
          for (let y = 0; y < h; y++) {
            push(y * w)
            push(y * w + w - 1)
          }

          while (stack.length > 0) {
            const i = stack.pop()!
            const o = i * 4
            const x = i % w
            const y = (i / w) | 0
            const near = (j: number) => {
              const p = j * 4
              const diff =
                Math.abs(d[p]! - d[o]!) + Math.abs(d[p + 1]! - d[o + 1]!) + Math.abs(d[p + 2]! - d[o + 2]!)
              if (diff <= tolerance) push(j)
            }
            if (x > 0) near(i - 1)
            if (x < w - 1) near(i + 1)
            if (y > 0) near(i - w)
            if (y < h - 1) near(i + w)
          }

          let solid = 0
          for (let i = 0; i < w * h; i++) {
            const o = i * 4
            const r = d[o]!
            const g = d[o + 1]!
            const b = d[o + 2]!
            // Enclosed background the fill never reached. Tighter than the
            // fill's own tolerance, because this one is not walking a gradient
            // — it is asking whether a pixel is the background colour, and a
            // loose answer punches holes in the character.
            const same =
              Math.abs(r - ground[0]!) + Math.abs(g - ground[1]!) + Math.abs(b - ground[2]!) <= 18
            if (seen[i] || same) d[o + 3] = 0
            else solid += 1
          }
          kept[c.id] = Math.round((solid / (w * h)) * 1000) / 10
          wc.putImageData(pixels, 0, 0)

          // Trim to what survived. The generator frames a figure with a lot of
          // room around it — often two thirds of the picture is background —
          // and drawing the frame rather than the figure is why the first pass
          // put wisps on the floor instead of people. The cell is the body.
          let x0 = w
          let y0 = h
          let x1 = -1
          let y1 = -1
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              if (d[(y * w + x) * 4 + 3]! > 24) {
                if (x < x0) x0 = x
                if (x > x1) x1 = x
                if (y < y0) y0 = y
                if (y > y1) y1 = y
              }
            }
          }
          if (x1 < x0 || y1 < y0) continue

          // Squared off around the taller axis, so a figure keeps its
          // proportions instead of being stretched to fill a square cell.
          const bw = x1 - x0 + 1
          const bh = y1 - y0 + 1
          const side = Math.max(bw, bh)
          const sx = x0 - (side - bw) / 2
          const sy = y0 - (side - bh) / 2

          out.drawImage(work, sx, sy, side, side, c.x, c.y, cell, cell)
        }

        return { image: sheet.toDataURL('image/webp', quality), kept }
      },
      { cells, width, height, cell: CELL, quality: QUALITY, tolerance: TOLERANCE },
    )
  } finally {
    await browser.close()
  }

  mkdirSync(resolve(process.cwd(), 'public/art'), { recursive: true })
  const bytes = Buffer.from(result.image.slice(result.image.indexOf(',') + 1), 'base64')
  writeFileSync(IMAGE, bytes)

  const entries = cells.map((c) => `  '${c.id}': [${c.x}, ${c.y}],`).join('\n')
  writeFileSync(
    TABLE,
    `/**
 * Where each field sprite sits in \`public/art/sprites.webp\`.
 *
 * Generated by \`npm run sprites\` — regenerate the art or edit the packer, not
 * this file. Keys are \`<class>-<spec>\` and \`boss-<id>\`, which is what the
 * simulation already calls them.
 */

export const SPRITE_CELL = ${CELL}
export const SPRITE_SRC = 'art/sprites.webp'

export const SPRITES: Record<string, readonly [number, number]> = {
${entries}
}
`,
  )

  // A figure should be a fifth to a half of its frame. Anything outside that
  // is a cutout that failed one way or the other, and it is cheaper to be told
  // than to find it later as a hole on the floor.
  const odd = Object.entries(result.kept).filter(([, pct]) => pct < 8 || pct > 62)
  const kb = (bytes.length / 1024).toFixed(1)
  console.log(`sprites: ${ids.length} in ${width}x${height}, ${kb} kB webp`)
  if (odd.length > 0) {
    for (const [id, pct] of odd) console.log(`  suspect: ${id} kept ${pct}%`)
  }
}

main()

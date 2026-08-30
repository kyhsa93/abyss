/**
 * The arena floor, as one picture rather than a tile.
 *
 * Tiling was the obvious idea and the wrong one twice over. Asked for a
 * seamless tile the generator draws the seams — the first two candidates came
 * back with a hard X across the middle, which is a grout line, not a texture.
 * And nothing here needs to tile: the arena is a circle of fixed world size,
 * so one image stretched across it has no repeat to give itself away.
 *
 * It is darkened hard on the way through. The floor is the surface every
 * mechanic is drawn on — puddles, telegraphs, the grasp — and a floor with
 * opinions competes with the thing the player is supposed to be reading. What
 * it is for is to stop the ground being a flat fill, not to be looked at.
 *
 *   npm run floor
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const SRC = resolve(process.cwd(), 'art/floor/arena.jpg')
const OUT = resolve(process.cwd(), 'public/art/floor.webp')

/** Big enough for a tablet's arena, small enough to stay under a hundred kB. */
const SIZE = 768

/** How much of the original survives. The rest is the game's own floor colour. */
const STRENGTH = 0.34

async function main(): Promise<void> {
  if (!existsSync(SRC)) {
    console.error('no art/floor/arena.jpg')
    process.exit(1)
  }

  const data = `data:image/jpeg;base64,${readFileSync(SRC).toString('base64')}`
  const browser = await chromium.launch()
  let encoded: string
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><meta charset="utf-8">', { waitUntil: 'load' })
    encoded = await page.evaluate(
      async ({ data, size, strength }) => {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')!

        // The game's floor colour underneath, the picture over it at a fraction
        // of full strength. Compositing here rather than at draw time means the
        // renderer pays nothing for it and the result can be looked at.
        ctx.fillStyle = '#14141c'
        ctx.fillRect(0, 0, size, size)

        const image = new Image()
        image.src = data
        await image.decode()
        ctx.globalAlpha = strength
        ctx.drawImage(image, 0, 0, size, size)
        ctx.globalAlpha = 1

        return canvas.toDataURL('image/webp', 0.8)
      },
      { data, size: SIZE, strength: STRENGTH },
    )
  } finally {
    await browser.close()
  }

  mkdirSync(resolve(process.cwd(), 'public/art'), { recursive: true })
  const bytes = Buffer.from(encoded.slice(encoded.indexOf(',') + 1), 'base64')
  writeFileSync(OUT, bytes)
  console.log(`floor: ${SIZE}x${SIZE}, ${(bytes.length / 1024).toFixed(1)} kB webp`)
}

main()

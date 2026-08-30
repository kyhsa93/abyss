/**
 * The app icons, generated rather than drawn.
 *
 * The five PNGs under `public/icons` used to be a picture somebody made by
 * hand, checked in as five opaque binaries. Nothing could say where the colours
 * came from, changing the palette left the icon behind, and there was no way to
 * regenerate it — the only record of the design was the file itself.
 *
 * These are a placeholder, and it is worth being plain about that: a wordmark
 * in the game's own palette is not art. It is a slot that builds, keeps the
 * install prompt working, and can be replaced the day there are real assets.
 * What it buys until then is that the icon is derived from `theme.ts` like
 * everything else on screen, so it cannot drift away from the game.
 *
 * A browser renders it, because the mark is type and type needs a font — which
 * is exactly the thing `canvasrec` says it will not do. `visualcheck` already
 * brought a real browser into this repo, so the font is free.
 *
 *   npm run icons
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

import { COLORS } from '../src/render/theme'

const OUT = resolve(process.cwd(), 'public/icons')

/** Every icon the manifest and `index.html` between them ask for. */
const ICONS = [
  { file: 'favicon-32.png', size: 32, maskable: false },
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
  // Maskable art is cropped to a circle by the launcher, so everything that
  // matters has to sit inside the middle 80%.
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
]

/**
 * `A`, and at the sizes where a letter would be a smudge, a mark instead.
 *
 * A favicon is 32 pixels. A glyph with a counter that small closes up into a
 * blob, so below the threshold the ring is the icon and the letter is dropped.
 */
function page(size: number, maskable: boolean): string {
  const pad = maskable ? 0.2 : 0.11
  const inner = size * (1 - pad * 2)
  const ring = Math.max(1.5, inner * 0.055)
  const letter = size >= 64

  return `<!doctype html><meta charset="utf-8">
<style>
  html, body { margin: 0; width: ${size}px; height: ${size}px; }
  body {
    background: ${COLORS.bg};
    display: grid;
    place-items: center;
    font-family: ui-monospace, 'DejaVu Sans Mono', monospace;
  }
  .mark {
    box-sizing: border-box;
    width: ${inner}px;
    height: ${inner}px;
    border: ${ring}px solid ${COLORS.energyBar};
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: ${COLORS.text};
    font-size: ${inner * 0.52}px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.04em;
  }
</style>
<div class="mark">${letter ? 'A' : ''}</div>`
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })

  const browser = await chromium.launch()
  try {
    for (const { file, size, maskable } of ICONS) {
      const context = await browser.newContext({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1,
      })
      const tab = await context.newPage()
      await tab.setContent(page(size, maskable), { waitUntil: 'load' })
      writeFileSync(resolve(OUT, file), await tab.screenshot({ type: 'png' }))
      await context.close()
    }
  } finally {
    await browser.close()
  }

  console.log(`icons: wrote ${ICONS.length} files to public/icons`)
}

main()

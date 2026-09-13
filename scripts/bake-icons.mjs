/**
 * The two icons a browser wants before it will offer to install this.
 *
 * Drawn from the same game-icons.net blade the attack button uses — CC-BY, the
 * author is the directory it sits in, and `art/UI-CREDITS.md` already names
 * him.  Nothing new is drawn here: the SVG is rendered on the same dark ground
 * the page uses, at the two sizes a manifest is asked for.
 *
 * Rendered with the browser that is already a dependency, because the
 * alternative was a rasteriser nobody has installed.
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'

const BLADE = 'public/art/ui/lorc/broadsword.svg'
const GROUND = '#14161f', INK = '#c9a86a'

const svg = readFileSync(BLADE, 'utf8')
mkdirSync('public/art/icon', { recursive: true })

const browser = await chromium.launch()
for (const size of [192, 512]) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  })
  await page.setContent(`<style>
    html,body{margin:0;height:100%;background:${GROUND};display:grid;place-items:center}
    svg{width:${Math.round(size * 0.62)}px;height:${Math.round(size * 0.62)}px;fill:${INK}}
  </style>${svg}`)
  await page.screenshot({ path: `public/art/icon/abyss-${size}.png` })
  await page.close()
  console.log(`public/art/icon/abyss-${size}.png`)
}
await browser.close()

/**
 * A picture of the game, taken without a browser.
 *
 * The bodies, the floor, the telegraphs and the whole heads-up display are
 * canvas code, and nothing in this repo could look at any of it: the checks
 * assert on numbers, and the one machine this is developed on has no
 * libraries for a headless browser. So every judgement about how the game
 * looks has been made by deploying it and squinting at a phone.
 *
 * This runs the real simulation for a while, calls the real `drawWorld` and
 * `drawHud` against the recorder in `canvasrec`, and writes the frame out.
 * It is the same code path the browser runs, so what comes out is what is on
 * screen — minus the text, which needs a font and therefore lives in the SVG
 * rather than the PNG.
 *
 *   npm run screenshot                                  # desktop, 20 seconds in
 *   npm run screenshot -- shot.png 390 844 40 25        # portrait, 40s, 25-man
 */

import { writeFileSync } from 'node:fs'
import { RecordingCtx, toPng, toSvg } from './canvasrec'
import { drawWorld } from '../src/render/draw'
import { drawHud } from '../src/render/hud'
import { Effects } from '../src/render/effects'
import { L, updateLayout } from '../src/render/theme'
import { createState } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { Rng } from '../src/sim/rng'
import { autoParty, pickFor, type RaidSize } from '../src/sim/classes'
import { DT } from '../src/sim/constants'

const out = process.argv[2] ?? 'shot.png'
const w = Number(process.argv[3] ?? 1280)
const h = Number(process.argv[4] ?? 800)
const seconds = Number(process.argv[5] ?? 20)
const size = Number(process.argv[6] ?? 5) as RaidSize
const seed = Number(process.argv[7] ?? 0x51ed)

updateLayout(w, h)

const s = createState(seed, 4, autoParty(size, pickFor('paladin', 'tank')!))
s.countdown = 0

// Played, rather than posed: the party AI walks itself into a real formation
// and the boss gets far enough through its timeline to have something on the
// floor. A posed frame would be a frame nobody will ever see.
const rng = new Rng(seed)
const ticks = Math.round(seconds / DT)
for (let i = 0; i < ticks; i++) {
  const t = i * DT
  step(s, { moveX: Math.cos(t * 0.7) * 0.8, moveY: Math.sin(t * 0.9) * 0.8, pressed: [] }, rng)
}

const ctx = new RecordingCtx()
drawWorld(ctx.as2d(), s, 1, s.time, new Effects())
drawHud(ctx.as2d(), s, { active: false, joystick: null, heldSlots: new Set<number>() })

const svgPath = out.replace(/\.(png|svg)$/, '') + '.svg'
const pngPath = out.replace(/\.(png|svg)$/, '') + '.png'
writeFileSync(svgPath, toSvg(ctx, w, h, '#0a0a0f'))
writeFileSync(pngPath, toPng(ctx, w, h, '#0a0a0f'))
// The token radius is printed because it is the number that decides whether
// bodies are drawn at all, and it is not obvious from the viewport.
const token = (s.actors.find((a) => a.isPlayer)?.radius ?? 0) * L.scale
console.log(
  `${pngPath} + ${svgPath}: ${size}-man, ${seconds}s in, ${s.actors.filter((a) => a.alive).length} alive, ` +
    `${ctx.shapes.length} shapes, token r=${token.toFixed(1)}px`,
)

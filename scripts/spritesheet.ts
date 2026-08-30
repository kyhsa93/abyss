/**
 * A contact sheet of every body the game draws.
 *
 * The bodies are drawn by canvas code that only runs in a browser, so the
 * only way anyone could judge how a token looked was to deploy it and squint
 * at a phone — a terrible loop for a thing whose entire job is to be read at
 * a glance. This runs the same drawing code against the recorder in
 * `canvasrec` and writes a picture of it: every class, every role it can
 * fill, standing, walking, casting and dead, plus the boss, a thrall, a ring
 * of bearings, and the size ramp down through the threshold where a body goes
 * back to being a dot.
 *
 *   npm run spritesheet                  # sprites.svg and sprites.png
 *   npm run spritesheet -- out.svg
 *
 * The SVG has the labels on it, because a browser has fonts. The PNG has the
 * shapes, which is what the shapes have to be judged on.
 */

import { writeFileSync } from 'node:fs'
import { RecordingCtx, toPng, toSvg } from './canvasrec'
import { BODY_MIN_R, drawBody, mix } from '../src/render/sprite'
import type { BodyKind } from '../src/render/sprite'
import { CLASSES, CLASS_ORDER } from '../src/sim/classes'
import type { ClassId } from '../src/sim/classes'
import type { Role } from '../src/sim/types'
import { classColor } from '../src/render/theme'

const BG = '#0a0a0f'
const INK = '#c9c9d4'
const DIM = '#6b6b7b'

const ctx = new RecordingCtx()
const canvas = ctx.as2d()

/** Draws a token exactly the way the arena does: footprint, body, role letter. */
function token(
  x: number,
  y: number,
  r: number,
  opts: {
    kind?: BodyKind
    classId?: ClassId
    role?: Role
    facing?: number
    alive?: boolean
    moving?: boolean
    casting?: boolean
    clock?: number
  },
): void {
  const kind = opts.kind ?? 'party'
  const classId = opts.classId ?? 'warrior'
  const role = opts.role ?? 'dps'
  const alive = opts.alive ?? true
  const colour =
    kind === 'boss' ? '#ef4444' : kind === 'add' ? '#a855f7' : alive ? classColor(classId) : '#4b5563'
  const bodied = r >= BODY_MIN_R

  ctx.globalAlpha = alive ? 1 : 0.4
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = bodied && alive ? mix(colour, BG, 0.68) : colour
  ctx.fill()
  ctx.strokeStyle = BG
  ctx.lineWidth = 2
  ctx.stroke()

  drawBody(canvas, {
    kind,
    classId,
    role,
    x,
    y,
    r,
    facing: opts.facing ?? 0,
    colour,
    alive,
    moving: opts.moving ?? false,
    casting: opts.casting ?? false,
    clock: opts.clock ?? 0,
  })
  ctx.globalAlpha = 1

  ctx.fillStyle = BG
  ctx.font = `bold ${kind === 'boss' ? 16 : 11}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const glyph = kind === 'boss' ? 'B' : kind === 'add' ? 'x' : role === 'tank' ? 'T' : role === 'healer' ? 'H' : 'D'
  ctx.fillText(glyph, x, y)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
}

function label(
  text: string,
  x: number,
  y: number,
  colour = DIM,
  size = 11,
  align: 'left' | 'center' = 'left',
): void {
  ctx.fillStyle = colour
  ctx.font = `${size}px sans-serif`
  ctx.textAlign = align
  ctx.fillText(text, x, y)
  ctx.textAlign = 'left'
}

// A magnifier for judging a silhouette, since the thing being judged is
// twenty pixels across in the game and the eye needs more than that.
//
//   npm run spritesheet -- sprites.svg 3
const SCALE = Math.max(1, Number(process.argv[3] ?? 1))
const R = 30 * SCALE
const COL = 132 * SCALE
const ROW = 104 * SCALE
const LEFT = 160
const POSES = [
  { name: 'stand', moving: false, casting: false, alive: true },
  { name: 'walk', moving: true, casting: false, alive: true },
  { name: 'cast', moving: false, casting: true, alive: true },
  { name: 'dead', moving: false, casting: false, alive: false },
] as const

// One row per way a class can be played, since a tank and a healer of the
// same class are two different silhouettes.
const rows: { classId: ClassId; role: Role }[] = []
for (const id of CLASS_ORDER) {
  const seen = new Set<Role>()
  for (const spec of CLASSES[id]!.specs) {
    if (seen.has(spec.role)) continue
    seen.add(spec.role)
    rows.push({ classId: id, role: spec.role })
  }
}

const width = Math.max(LEFT + COL * POSES.length + 60, LEFT + 100 + 84 * SCALE * 8)
const height = 150 + ROW * rows.length + (150 + 130 + 140) * SCALE

label('abyss — bodies', 28, 44, INK, 22)
label(
  'drawn from primitives every frame: no sprite sheet, no art, recoloured from the class table',
  28,
  68,
  DIM,
  12,
)
POSES.forEach((pose, i) => label(pose.name, LEFT + COL * i + COL / 2, 104, DIM, 11, 'center'))

rows.forEach((row, i) => {
  const y = 130 + ROW * i + ROW / 2
  label(CLASSES[row.classId]!.name, 28, y - 4, classColor(row.classId), 13)
  label(row.role, 28, y + 14, DIM, 11)
  POSES.forEach((pose, j) => {
    token(LEFT + COL * j + COL / 2, y, R, {
      classId: row.classId,
      role: row.role,
      moving: pose.moving,
      casting: pose.casting,
      alive: pose.alive,
      clock: 0.42,
    })
  })
})

// The two things on the floor that are not people.
{
  const y = 130 + ROW * rows.length + 60 * SCALE
  label('Boss', 28, y - 4, '#ef4444', 13)
  label('and a thrall', 28, y + 14, DIM, 11)
  token(LEFT + COL * 0.5, y, 48 * SCALE, { kind: 'boss' })
  token(LEFT + COL * 1.5, y, 48 * SCALE, { kind: 'boss', casting: true, clock: 0.42 })
  token(LEFT + COL * 2.5, y, 22 * SCALE, { kind: 'add' })
  token(LEFT + COL * 3.5, y, 22 * SCALE, { kind: 'add', moving: true, clock: 0.42 })
}

// Bearing: the fact a circle could not carry at all, and the one the gaze
// has been asking about since it existed.
{
  const y = 130 + ROW * rows.length + 190 * SCALE
  label('Facing', 28, y - 4, INK, 13)
  label('eight bearings', 28, y + 14, DIM, 11)
  for (let i = 0; i < 8; i++) {
    token(LEFT + 40 + i * 84 * SCALE, y, R, { classId: 'paladin', role: 'tank', facing: (i * Math.PI) / 4 })
  }
}

// The size ramp, where the threshold has to be argued rather than asserted:
// everything left of the step is a plain disc on purpose.
{
  const y = 130 + ROW * rows.length + 310 * SCALE
  label('Size', 28, y - 4, INK, 13)
  label(`a body over ${BODY_MIN_R}px`, 28, y + 14, DIM, 11)
  let x = LEFT + 30
  // Real pixels, never magnified: this row is the threshold argument, and a
  // magnified ramp would draw bodies at sizes that get a disc in the game.
  for (const r of [5, 7, 9, 12, 16, 20, 26, 34, 44]) {
    token(x, y, r, { classId: 'druid', role: 'healer', clock: 0.42 })
    label(`${r}`, x, y + 62, DIM, 10, 'center')
    x += r * 2 + 44
  }
}

const out = process.argv[2] ?? 'sprites.svg'
const svgPath = out.endsWith('.png') ? out.replace(/\.png$/, '.svg') : out
const pngPath = svgPath.replace(/\.svg$/, '.png')
writeFileSync(svgPath, toSvg(ctx, width, height, BG))
writeFileSync(pngPath, toPng(ctx, width, height, BG))
console.log(
  `${svgPath} + ${pngPath}: ${rows.length} class/role bodies, ${ctx.shapes.length} shapes, ${width}x${height}`,
)

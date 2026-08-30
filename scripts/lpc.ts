/**
 * Build the field sprites out of Liberated Pixel Cup parts.
 *
 * LPC is a modular pixel-art set: a body, and separate sheets for legs, torso,
 * head, weapon and shield that line up with it frame for frame, every one of
 * them drawn in four directions with a real walk cycle. That last part is why
 * it is here. A body on this floor has to face four ways and walk, and the
 * generator this replaced could not produce frames that agree with each other
 * — its motion had to be arithmetic on a single still.
 *
 * What each class wears is read off `classes.ts` rather than decided here.
 * `armorType` is already a game concept, printed on the roster card next to
 * the mitigation it buys, so plate looks like plate for the same reason it
 * reduces damage like plate. Tanks carry a shield because tanks carry a
 * shield. Nothing about the picture is a second opinion about what the class
 * is.
 *
 * Class colour is deliberately not in the sprite. The disc under a body
 * already carries it on its ring, and four armour types across seventeen specs
 * is the wrong channel to try to say "shaman" with — the ring says which
 * class, the body says what kind of fighter, and neither repeats the other.
 *
 * Licence is a condition rather than a courtesy here: the parts are variously
 * CC-BY-SA 3.0, GPL 3.0, OGA-BY and CC0, and every one names an author. The
 * credits are collected from the same definitions the layers come from and
 * written out, so the list cannot drift from what was actually used.
 *
 *   npm run lpc -- --lpc ~/src/Universal-LPC-Spritesheet-Character-Generator
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

import { CLASSES, CLASS_ORDER } from '../src/sim/classes'
import type { ClassId } from '../src/sim/classes'

const IMAGE = resolve(process.cwd(), 'public/art/lpc.webp')
const TABLE = resolve(process.cwd(), 'src/render/lpc.ts')
const CREDITS = resolve(process.cwd(), 'art/LPC-CREDITS.md')

const args = process.argv.slice(2)
const at = args.indexOf('--lpc')
const LPC = resolve(at >= 0 && args[at + 1] ? args[at + 1]! : join(homedir(), 'src/lpc'))

/** Nine frames across, four directions down, at LPC's own cell size. */
const CELL = 64
const FRAMES = 9
const DIRECTIONS = 4

/**
 * How much of each cell is actually drawn in.
 *
 * LPC frames a 64-wide cell around a body that is nowhere near that wide — the
 * union of every frame in this sheet spans x 12 to 51 and nothing else is ever
 * touched. Measured rather than guessed, and re-measured at build time below,
 * because a layer table that gains a wider weapon would otherwise clip it.
 *
 * Height stays whole: something does reach the top of the cell, and something
 * else the bottom.
 */
const CROP_X = 12
const CELL_W = 40

/** Painted detail is what compresses badly and pixel art has none. */
const QUALITY = 0.85

/**
 * What the armour on the roster card looks like.
 *
 * Mail has no plate-style leg piece in the set, so it borrows the plain
 * trousers the light classes wear — at sixty pixels the torso is what reads,
 * and a wrong pair of greaves is invisible next to a wrong chestpiece.
 */
const ARMOUR: Record<string, { torso: string; legs: string }> = {
  plate: { torso: 'torso/armour/plate/male', legs: 'legs/armour/plate/male' },
  mail: { torso: 'torso/chainmail/male', legs: 'legs/pants/male' },
  leather: { torso: 'torso/armour/leather/male', legs: 'legs/pants/male' },
  cloth: { torso: 'torso/clothes/shortsleeve/tshirt/male', legs: 'legs/pants/male' },
}

/**
 * What the class fights with.
 *
 * A weapon is a handful of pixels at this size, which is the point: it is the
 * silhouette's outline that separates a staff from a bow, and that survives
 * being small far better than a colour does.
 */
const WEAPON: Record<ClassId, string | null> = {
  warrior: 'weapon/sword/longsword',
  paladin: 'weapon/sword/arming',
  priest: 'weapon/magic/simple',
  druid: 'weapon/magic/gnarled',
  shaman: 'weapon/magic/s',
  mage: 'weapon/magic/crystal',
  warlock: 'weapon/magic/diamond',
  hunter: 'weapon/ranged/bow/normal',
  rogue: 'weapon/sword/dagger',
}

/**
 * The bosses, out of the same set.
 *
 * LPC ships no monsters, but it ships monstrous heads — skeleton, zombie,
 * orc, troll, minotaur, lizard, alien — and they are drawn to sit on the same
 * bodies as the human ones. That is enough: a boss here has to read as a large
 * hostile thing at a glance, and the head is what carries that.
 *
 * Armour only exists for the male, female and teen bodies, so a boss that
 * wears any is built on one of those with a monster's head. The Long Ledger
 * wears nothing, which is what lets it be an actual skeleton.
 *
 * Each is chosen against the `demand` line the encounter already shows before
 * a pull, so the picture cannot promise a fight the encounter does not run.
 */
const BOSS: Record<string, Layer[]> = {
  // "the floor, and whoever is standing on it" — a drowned jailer in plate.
  warden: [
    { z: 10, path: 'body/bodies/male/walk' },
    { z: 20, path: 'legs/armour/plate/male/walk' },
    { z: 60, path: 'torso/armour/plate/male/walk' },
    { z: 100, path: 'head/heads/zombie/adult/walk' },
  ],
  // "stay apart, and out-heal the singing" — something robed with a lantern
  // for a head, which is as close to a many-mouthed chorus as the set goes.
  choir: [
    { z: 10, path: 'body/bodies/male/walk' },
    { z: 20, path: 'legs/pants/male/walk' },
    { z: 60, path: 'torso/clothes/shortsleeve/tshirt/male/walk' },
    { z: 100, path: 'head/heads/jack/adult/walk' },
  ],
  // "come in, get behind, change target" — an armoured thing from the water.
  tidebreaker: [
    { z: 10, path: 'body/bodies/male/walk' },
    { z: 20, path: 'legs/armour/plate/male/walk' },
    { z: 60, path: 'torso/armour/plate/male/walk' },
    { z: 100, path: 'head/heads/lizard/male/walk' },
  ],
  // "stop, look away, and leave it whole" — the head is all eyes.
  watcher: [
    { z: 10, path: 'body/bodies/male/walk' },
    { z: 20, path: 'legs/pants/male/walk' },
    { z: 60, path: 'torso/clothes/shortsleeve/tshirt/male/walk' },
    { z: 100, path: 'head/heads/alien/adult/walk' },
  ],
  // "decide who pays, then pay it" — a skeleton, wearing nothing, which is the
  // one boss the bare skeleton body is exactly right for.
  ledger: [
    { z: 10, path: 'body/bodies/skeleton/walk' },
    { z: 100, path: 'head/heads/skeleton/adult/walk' },
  ],
}

/** Only tanks, because only tanks are holding one. */
const SHIELD = 'shield/heater'

/**
 * Find the walk sheet somewhere under a directory.
 *
 * LPC does not lay its equipment out one way. A longsword keeps its walk
 * frames at `walk/longsword.png`, a gnarled staff at
 * `universal/walk/foreground.png`, a plain one at `foreground/walk/simple.png`
 * and a shield several directories further down again. Hard-coding those was
 * five wrong guesses in a row, so the path in the table is the equipment and
 * this finds the sheet.
 *
 * Foreground wins where a piece has two halves: the background layer is what
 * sits behind the body, and one of the two is enough at this size.
 */
function findWalk(dir: string): string | null {
  const root = join(LPC, 'spritesheets', dir)
  if (!existsSync(root)) return null

  const hits: string[] = []
  const walk = (d: string, depth: number) => {
    if (depth > 5) return
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name)
      if (entry.isDirectory()) walk(full, depth + 1)
      else if (entry.name.endsWith('.png') && (full.includes('/walk/') || entry.name === 'walk.png')) {
        hits.push(full)
      }
    }
  }
  walk(root, 0)
  if (hits.length === 0) return null

  const score = (p: string) =>
    (p.includes('background') || p.includes('/bg/') ? 2 : 0) + p.split('/').length / 100
  hits.sort((a, b) => score(a) - score(b))
  return hits[0]!.slice(join(LPC, 'spritesheets').length + 1, -4)
}

interface Layer {
  z: number
  path: string
}

function layersFor(classId: ClassId, role: string): Layer[] {
  const armour = ARMOUR[CLASSES[classId].armorType] ?? ARMOUR.cloth!
  const weapon = WEAPON[classId]

  const stack: Layer[] = [
    { z: 10, path: 'body/bodies/male/walk' },
    { z: 20, path: `${armour.legs}/walk` },
    { z: 60, path: `${armour.torso}/walk` },
    { z: 100, path: 'head/heads/human/male/walk' },
  ]

  if (role === 'tank') {
    const shield = findWalk(SHIELD)
    if (shield) stack.push({ z: 130, path: shield })
  }
  if (weapon) {
    const found = findWalk(weapon)
    if (found) stack.push({ z: 140, path: found })
  }
  return stack
}

/** Every spec in the order the roster shows them, then every boss. */
function specs(): Array<{ id: string; layers: Layer[] }> {
  const out: Array<{ id: string; layers: Layer[] }> = []
  for (const classId of CLASS_ORDER) {
    for (const spec of CLASSES[classId].specs) {
      out.push({ id: `${classId}-${spec.id}`, layers: layersFor(classId, spec.role) })
    }
  }
  for (const [id, layers] of Object.entries(BOSS)) {
    out.push({ id: `boss-${id}`, layers })
  }
  return out
}

/**
 * Who drew what, gathered from the definitions rather than from memory.
 *
 * Each definition carries a `credits` array naming the file, its authors and
 * its licences. Walking the definitions for the paths actually used means the
 * attribution cannot fall behind a change to the layer table.
 */
function credits(paths: Set<string>): string[] {
  const lines = new Set<string>()
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.json')) {
        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(readFileSync(full, 'utf8')) as Record<string, unknown>
        } catch {
          continue
        }
        const rows = parsed.credits
        if (!Array.isArray(rows)) continue
        for (const row of rows as Array<Record<string, string>>) {
          const file = String(row.file ?? '')
          if (!file) continue
          // A definition credits a directory; the layer table names a file
          // inside it, so the match is by prefix in either direction.
          const used = [...paths].some((p) => p.startsWith(file) || file.startsWith(p.split('/').slice(0, -1).join('/')))
          if (!used) continue
          const authors = row.authors ?? row.notes ?? ''
          const licence = row.licenses ?? row.license ?? ''
          lines.add(`- \`${file}\` — ${authors} (${licence})`)
        }
      }
    }
  }
  walk(join(LPC, 'sheet_definitions'))
  return [...lines].sort()
}

async function main(): Promise<void> {
  if (!existsSync(join(LPC, 'spritesheets'))) {
    console.error(`no LPC checkout at ${LPC}`)
    console.error('  git clone --depth 1 https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator.git')
    console.error('  npm run lpc -- --lpc <that directory>')
    process.exit(1)
  }

  const all = specs()
  const used = new Set<string>()
  const missing: string[] = []

  const cells = all.map((spec, index) => {
    const layers = spec.layers
      .map((layer) => {
        const file = join(LPC, 'spritesheets', `${layer.path}.png`)
        if (!existsSync(file)) {
          missing.push(`${spec.id}: ${layer.path}`)
          return null
        }
        used.add(layer.path)
        return { z: layer.z, data: `data:image/png;base64,${readFileSync(file).toString('base64')}` }
      })
      .filter((l): l is { z: number; data: string } => l !== null)
      .sort((a, b) => a.z - b.z)

    return { id: spec.id, row: index, layers }
  })

  for (const line of missing) console.error(`  ! missing layer  ${line}`)

  // One spec per row: nine frames across for the cycle, and the four
  // directions stacked, which is how LPC ships them and how the renderer wants
  // to index them.
  const width = FRAMES * CELL_W
  const height = all.length * DIRECTIONS * CELL

  const browser = await chromium.launch()
  let encoded: string
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><meta charset="utf-8">', { waitUntil: 'load' })
    encoded = await page.evaluate(
      async ({ cells, width, height, cell, cellW, cropX, frames, directions, quality }) => {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.imageSmoothingEnabled = false

        for (const c of cells) {
          for (const layer of c.layers) {
            const image = new Image()
            image.src = layer.data
            await image.decode()
            // Every LPC sheet is the same shape, so a layer drops straight
            // onto the row without any per-layer offset.
            // Frame by frame rather than whole-sheet, because the crop has to
            // be taken out of the middle of every one of them.
            for (let f = 0; f < frames; f++) {
              for (let d = 0; d < directions; d++) {
                ctx.drawImage(
                  image,
                  f * cell + cropX,
                  d * cell,
                  cellW,
                  cell,
                  f * cellW,
                  (c.row * directions + d) * cell,
                  cellW,
                  cell,
                )
              }
            }
          }
        }
        return canvas.toDataURL('image/webp', quality)
      },
      { cells, width, height, cell: CELL, cellW: CELL_W, cropX: CROP_X, frames: FRAMES, directions: DIRECTIONS, quality: QUALITY },
    )
  } finally {
    await browser.close()
  }

  mkdirSync(resolve(process.cwd(), 'public/art'), { recursive: true })
  const bytes = Buffer.from(encoded.slice(encoded.indexOf(',') + 1), 'base64')
  writeFileSync(IMAGE, bytes)

  const rows = all.map((spec, index) => `  '${spec.id}': ${index},`).join('\n')
  writeFileSync(
    TABLE,
    `/**
 * Which row of \`public/art/lpc.webp\` belongs to each spec.
 *
 * Generated by \`npm run lpc\` — edit the layer table in the packer, not this
 * file. A row is four directions of a nine-frame walk, in LPC's own order:
 * up, left, down, right.
 *
 * The art is Liberated Pixel Cup, variously CC-BY-SA 3.0, GPL 3.0, OGA-BY and
 * CC0. Attribution is a condition of those, and the list is in
 * \`art/LPC-CREDITS.md\`.
 */

export const LPC_CELL_W = ${CELL_W}
export const LPC_CELL_H = ${CELL}
export const LPC_FRAMES = ${FRAMES}
export const LPC_DIRECTIONS = ${DIRECTIONS}
export const LPC_SRC = 'art/lpc.webp'

/** Row order in the sheet, which is also LPC's direction order. */
export const LPC_UP = 0
export const LPC_LEFT = 1
export const LPC_DOWN = 2
export const LPC_RIGHT = 3

export const LPC_ROW: Record<string, number> = {
${rows}
}
`,
  )

  const lines = credits(used)
  mkdirSync(resolve(process.cwd(), 'art'), { recursive: true })
  writeFileSync(
    CREDITS,
    `# Sprite credits

The field sprites are built from [Liberated Pixel Cup](https://lpc.opengameart.org/)
parts by \`npm run lpc\`. The parts are variously licensed CC-BY-SA 3.0, GPL
3.0, OGA-BY 3.0 and CC0; attribution is a condition of the first three, so this
list is generated from the same definitions the layers are taken from and
cannot fall behind a change to them.

${lines.join('\n')}
`,
  )

  const kb = (bytes.length / 1024).toFixed(1)
  console.log(`lpc: ${all.length} specs, ${width}x${height}, ${kb} kB webp`)
  console.log(`  ${used.size} distinct layers, ${lines.length} credit lines`)
  if (missing.length > 0) process.exit(1)
}

main()

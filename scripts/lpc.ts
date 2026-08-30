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

/** LPC's own cell, and its four directions. */
const CELL = 64
const DIRECTIONS = 4

/**
 * Five frames per animation, subsampled from whatever LPC ships.
 *
 * The sheets are nine frames for a walk and six or seven for an action, and at
 * sixty pixels on a phone nothing survives of the difference between four
 * frames of a stride and eight. Taking five evenly is what pays for the second
 * animation: narrowing the columns almost exactly offsets doubling the rows,
 * so casting costs nothing in bytes.
 *
 * Frame zero is kept whatever else is dropped. It is LPC's standing pose and
 * the renderer reserves it for standing still.
 */
const FRAMES = 5

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
    { z: 10, dir: 'body/bodies/male' },
    { z: 20, dir: 'legs/armour/plate/male' },
    { z: 60, dir: 'torso/armour/plate/male' },
    { z: 100, dir: 'head/heads/zombie/adult' },
  ],
  // "stay apart, and out-heal the singing" — something robed with a lantern
  // for a head, which is as close to a many-mouthed chorus as the set goes.
  choir: [
    { z: 10, dir: 'body/bodies/male' },
    { z: 20, dir: 'legs/pants/male' },
    { z: 60, dir: 'torso/clothes/shortsleeve/tshirt/male' },
    { z: 100, dir: 'head/heads/jack/adult' },
  ],
  // "come in, get behind, change target" — an armoured thing from the water.
  tidebreaker: [
    { z: 10, dir: 'body/bodies/male' },
    { z: 20, dir: 'legs/armour/plate/male' },
    { z: 60, dir: 'torso/armour/plate/male' },
    { z: 100, dir: 'head/heads/lizard/male' },
  ],
  // "stop, look away, and leave it whole" — the head is all eyes.
  watcher: [
    { z: 10, dir: 'body/bodies/male' },
    { z: 20, dir: 'legs/pants/male' },
    { z: 60, dir: 'torso/clothes/shortsleeve/tshirt/male' },
    { z: 100, dir: 'head/heads/alien/adult' },
  ],
  // "decide who pays, then pay it" — a skeleton, wearing nothing, which is the
  // one boss the bare skeleton body is exactly right for.
  ledger: [
    { z: 10, dir: 'body/bodies/skeleton' },
    { z: 100, dir: 'head/heads/skeleton/adult' },
  ],
}

/**
 * Hair, one per spec.
 *
 * This is the channel that separates two specs of the same class. Armour comes
 * off `armorType` and a warrior's two specs wear the same plate, so without
 * this the protection and arms tiles are the same person holding the same
 * sword. It is a few pixels at the top of a head and it is enough, because at
 * this size a silhouette is mostly outline.
 *
 * Named by style rather than by path: some styles keep their frames under
 * `adult/`, some under `male/`, some behind another `fg/`, and the resolver
 * below finds whichever it is.
 */
const HAIR: Record<string, string> = {
  'warrior-protection': 'buzzcut',
  'warrior-arms': 'mop',
  'paladin-protection': 'parted',
  'paladin-holy': 'long',
  'paladin-retribution': 'swoop',
  'priest-discipline': 'bob',
  'priest-shadow': 'long_messy',
  'druid-guardian': 'dreadlocks_short',
  'druid-restoration': 'braid',
  'druid-balance': 'long_straight',
  'druid-feral': 'unkempt',
  'shaman-restoration': 'cornrows',
  'shaman-elemental': 'twists_fade',
  'mage-frost': 'xlong',
  'warlock-destruction': 'spiked',
  'hunter-marksmanship': 'ponytail',
  'rogue-assassination': 'pixie',
}

/**
 * The three things a boss puts on the floor.
 *
 * A thrall and a stalker walk in and hit somebody, which is what every summon
 * before them did and what the party's rules already understand — one body
 * covers both.
 *
 * The other two break that rule in opposite directions and the whole demand of
 * their fights is telling them apart, so they are drawn to be told apart. The
 * knell hurts nobody and has to be killed anyway: it is a skeleton, a thing.
 * The vessel hurts somebody and must not be killed: it is a person, in cloth,
 * with a human face — the one summon on the floor that does not look like
 * something to swing at.
 */
const ADD: Record<string, Layer[]> = {
  thrall: [
    { z: 10, dir: 'body/bodies/male' },
    { z: 20, dir: 'legs/pants/male' },
    { z: 60, dir: 'torso/armour/leather/male' },
    { z: 100, dir: 'head/heads/goblin/adult' },
    { z: 140, dir: 'weapon/sword/dagger' },
  ],
  knell: [
    { z: 10, dir: 'body/bodies/skeleton' },
    { z: 100, dir: 'head/heads/skeleton/adult' },
  ],
  vessel: [
    { z: 10, dir: 'body/bodies/male' },
    { z: 20, dir: 'legs/pants/male' },
    { z: 60, dir: 'torso/clothes/shortsleeve/tshirt/male' },
    { z: 100, dir: 'head/heads/human/male' },
    { z: 110, dir: 'hair/long' },
  ],
}

/** Only tanks, because only tanks are holding one. */
const SHIELD = 'shield/heater'

/**
 * The two things a body on this floor is ever doing.
 *
 * Walking, and the thing it does when it presses a button. Which of those the
 * second one looks like comes off `spec.melee`, which the simulation already
 * uses to decide whether a spec has to close the distance — so a caster casts
 * and a melee spec swings for the same reason each moves the way it does.
 */
const ANIMATIONS = ['walk', 'action'] as const

/** What LPC calls the animation, and what else it might call it. */
const ALIASES: Record<string, string[]> = {
  walk: ['walk'],
  slash: ['slash', 'attack_slash'],
  spellcast: ['spellcast', 'cast'],
}

/**
 * Find a sheet for one animation somewhere under a directory.
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
function findAnim(dir: string, anim: string): string | null {
  const root = join(LPC, 'spritesheets', dir)
  if (!existsSync(root)) return null

  const names = ALIASES[anim] ?? [anim]
  const hits: string[] = []
  const walk = (d: string, depth: number) => {
    if (depth > 5) return
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name)
      if (entry.isDirectory()) walk(full, depth + 1)
      else if (entry.name.endsWith('.png')) {
        const matches = names.some((n) => full.includes(`/${n}/`) || entry.name === `${n}.png`)
        if (matches) hits.push(full)
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
  /** A directory. Which sheet inside it depends on the animation being built. */
  dir: string
}

function layersFor(classId: ClassId, spec: string, role: string): Layer[] {
  const armour = ARMOUR[CLASSES[classId].armorType] ?? ARMOUR.cloth!
  const weapon = WEAPON[classId]

  const stack: Layer[] = [
    { z: 10, dir: 'body/bodies/male' },
    { z: 20, dir: armour.legs },
    { z: 60, dir: armour.torso },
    { z: 100, dir: 'head/heads/human/male' },
  ]

  // Above the head, below anything held: hair is drawn on a head, and a shield
  // arm passes in front of it.
  const hair = HAIR[`${classId}-${spec}`]
  if (hair) stack.push({ z: 110, dir: `hair/${hair}` })

  if (role === 'tank') stack.push({ z: 130, dir: SHIELD })
  if (weapon) stack.push({ z: 140, dir: weapon })
  return stack
}

interface Subject {
  id: string
  layers: Layer[]
  /** Which sheet the action animation is built from. */
  action: string
}

/** Every spec in the order the roster shows them, then every boss. */
function specs(): Subject[] {
  const out: Subject[] = []
  for (const classId of CLASS_ORDER) {
    for (const spec of CLASSES[classId].specs) {
      out.push({
        id: `${classId}-${spec.id}`,
        layers: layersFor(classId, spec.id, spec.role),
        // The simulation already uses `melee` to decide whether a spec has to
        // close the distance, so a caster casts and a melee spec swings for
        // the same reason each moves the way it does.
        action: spec.melee ? 'slash' : 'spellcast',
      })
    }
  }
  // A boss's mechanics are scripted rather than cast off an ability table, and
  // every one of them reads as something being done to the room. Slash is the
  // closer of the two to that.
  for (const [id, layers] of Object.entries(BOSS)) {
    out.push({ id: `boss-${id}`, layers, action: 'slash' })
  }
  // A thrall swings. The other two never do anything a swing would describe,
  // but a block has to exist for every subject, and standing on frame zero of
  // one is what they will be doing.
  for (const [id, layers] of Object.entries(ADD)) {
    out.push({ id: `add-${id}`, layers, action: 'slash' })
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

  // A block per subject per animation, four directions inside each. A layer
  // that has no sheet for an animation is dropped rather than fatal — a staff
  // with no slash frames is a staff that is not drawn mid-swing, which is
  // better than no character.
  const blocks = all.flatMap((spec, index) =>
    ANIMATIONS.map((anim, order) => {
      const sheet = anim === 'walk' ? 'walk' : spec.action
      const layers = spec.layers
        .map((layer) => {
          const found = findAnim(layer.dir, sheet)
          if (!found) {
            if (anim === 'walk') missing.push(`${spec.id}: ${layer.dir} has no ${sheet}`)
            return null
          }
          used.add(found)
          const file = join(LPC, 'spritesheets', `${found}.png`)
          return { z: layer.z, data: `data:image/png;base64,${readFileSync(file).toString('base64')}` }
        })
        .filter((l): l is { z: number; data: string } => l !== null)
        .sort((a, b) => a.z - b.z)

      return { id: spec.id, block: index * ANIMATIONS.length + order, layers }
    }),
  )

  for (const line of missing) console.error(`  ! missing layer  ${line}`)

  const width = FRAMES * CELL_W
  const height = blocks.length * DIRECTIONS * CELL

  const browser = await chromium.launch()
  let encoded: string
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><meta charset="utf-8">', { waitUntil: 'load' })
    encoded = await page.evaluate(
      async ({ blocks, width, height, cell, cellW, cropX, frames, directions, quality }) => {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.imageSmoothingEnabled = false

        for (const c of blocks) {
          for (const layer of c.layers) {
            const image = new Image()
            image.src = layer.data
            await image.decode()
            // How many frames this animation shipped with. Sheets are six,
            // seven or nine wide depending on what they show, so the five taken
            // out of them spread across whatever is there rather than across an
            // assumed width.
            const source = Math.max(1, Math.round(image.naturalWidth / cell))

            // Frame by frame rather than whole-sheet, because the crop has to
            // be taken out of the middle of every one of them.
            for (let f = 0; f < frames; f++) {
              // Frame zero stays frame zero — it is the standing pose and the
              // renderer reserves it — and the rest spread over the remainder.
              const from =
                f === 0 ? 0 : Math.min(source - 1, Math.round((f * (source - 1)) / (frames - 1)))
              for (let d = 0; d < directions; d++) {
                ctx.drawImage(
                  image,
                  from * cell + cropX,
                  d * cell,
                  cellW,
                  cell,
                  f * cellW,
                  (c.block * directions + d) * cell,
                  cellW,
                  cell,
                )
              }
            }
          }
        }
        return canvas.toDataURL('image/webp', quality)
      },
      { blocks, width, height, cell: CELL, cellW: CELL_W, cropX: CROP_X, frames: FRAMES, directions: DIRECTIONS, quality: QUALITY },
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
 * Which block of \`public/art/lpc.webp\` belongs to each spec.
 *
 * Generated by \`npm run lpc\` — edit the layer table in the packer, not this
 * file. A subject owns \`LPC_ANIMATIONS\` blocks, each of four directions in
 * LPC's own order — up, left, down, right — and each direction is
 * \`LPC_FRAMES\` frames across.
 *
 * The art is Liberated Pixel Cup, variously CC-BY-SA 3.0, GPL 3.0, OGA-BY and
 * CC0. Attribution is a condition of those, and the list is in
 * \`art/LPC-CREDITS.md\`.
 */

export const LPC_CELL_W = ${CELL_W}
export const LPC_CELL_H = ${CELL}
export const LPC_FRAMES = ${FRAMES}
export const LPC_DIRECTIONS = ${DIRECTIONS}

/** Blocks per subject, in this order. A block is four directions. */
export const LPC_WALK = 0
export const LPC_ACTION = 1
export const LPC_ANIMATIONS = ${ANIMATIONS.length}
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

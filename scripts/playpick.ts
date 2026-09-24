/**
 * What to play next, decided by what has been played least.
 *
 * A session that chooses for itself plays Marrowgar as a frost mage forever.
 * Not out of laziness -- it is the example in every doc, the first boss on the
 * list and the default spec -- and twenty-four sessions a day of the same pull
 * is one session a day, repeated. So the choice is taken away from the session
 * and derived from the ledger.
 *
 * **Per axis, not per combination.** The full cross product of mode, boss,
 * size, difficulty, spec, style, viewport and whether the save was empty is
 * about a hundred and ninety thousand cells; at one session an hour that is
 * twenty-two years, so aiming at it would mean the ledger never fills and the
 * choice is effectively random anyway. Balancing each axis on its own covers
 * every boss inside half a day and every spec inside a day, and leaves the
 * *combinations* varied because they are assembled from eight independent
 * least-played values.
 *
 *   npm run playpick              # the next cell, as shell variables
 *   npm run playpick -- report    # how well each axis is covered
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ENCOUNTERS } from '../src/sim/encounters'
import { SPEC_OPTIONS } from '../src/sim/classes'

const LEDGER = resolve(process.cwd(), 'playtest/sessions.jsonl')

// `playpick | head -1` is the obvious way to use this, and it closes the pipe
// under us. Without this the useful line is followed by a node stack trace, in
// a log somebody is going to read looking for something else.
process.stdout.on('error', () => process.exit(0))

/** The things a session can differ in. Anything not here will not get varied. */
const AXES = {
  // `clear` is the whole evening in one sitting, from the way in to as far as the
  // building goes. It is the only mode that answers whether an evening can be
  // finished, and after three sessions nothing had: the job had reached the first
  // boss once and fought two dailies.
  mode: ['raid', 'battleground', 'daily', 'walk', 'clear', 'menus'],
  boss: ENCOUNTERS.map((e) => e.id),
  map: ['conquest', 'flags', 'escort'],
  size: ['10', '25'],
  difficulty: ['normal', 'heroic'],
  spec: SPEC_OPTIONS.map((p) => `${p.classId}:${p.spec}`),
  style: ['idle', 'mash', 'dodge', 'good', 'wander', 'melee', 'flee', 'auto'],
  view: ['390x844,touch', '844x390,touch', '1280x800', '820x1180,touch'],
  save: ['fresh', 'carried'],
} as const

type Axis = keyof typeof AXES

interface Session {
  cell?: Partial<Record<Axis, string>>
}

function ledger(): Session[] {
  if (!existsSync(LEDGER)) return []
  return readFileSync(LEDGER, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as Session]
      } catch {
        // A half-written line is the machine having gone down mid-session, not
        // a reason to refuse to pick.
        return []
      }
    })
}

function counts(sessions: Session[], axis: Axis): Map<string, number> {
  const seen = new Map<string, number>(AXES[axis].map((v) => [v, 0]))
  for (const s of sessions) {
    const v = s.cell?.[axis]
    if (v !== undefined && seen.has(v)) seen.set(v, (seen.get(v) ?? 0) + 1)
  }
  return seen
}

/**
 * The least-played value, with ties broken by how many sessions there are.
 *
 * The rotation matters: with an empty ledger every value is tied at zero, and
 * a fixed tie-break would make the first day of sessions pick the same first
 * value on every axis -- exactly the sameness this file exists to stop.
 */
function leanest(sessions: Session[], axis: Axis): string {
  const seen = counts(sessions, axis)
  const low = Math.min(...seen.values())
  const tied = [...seen].filter(([, n]) => n === low).map(([v]) => v)
  return tied[sessions.length % tied.length]!
}

const sessions = ledger()

if (process.argv.includes('report')) {
  process.stdout.write(`${sessions.length} sessions in the ledger\n\n`)
  for (const axis of Object.keys(AXES) as Axis[]) {
    const seen = [...counts(sessions, axis)].sort((a, b) => a[1] - b[1])
    const worst = seen.filter(([, n]) => n === seen[0]![1]).length
    process.stdout.write(
      `${axis.padEnd(11)} ${seen.map(([v, n]) => `${v}=${n}`).join(' ')}\n${' '.repeat(11)} ${worst} of ${seen.length} still at the floor (${seen[0]![1]})\n\n`,
    )
  }
  process.exit(0)
}

const mode = leanest(sessions, 'mode')
const cell: Record<string, string> = { mode }
// Only the axes this mode actually has. A battleground has no boss and a menus
// session has no style, and filling them in anyway would credit coverage for
// something the session never touched.
if (mode === 'raid' || mode === 'daily' || mode === 'walk') cell.boss = leanest(sessions, 'boss')
// A clear starts at the way in and takes the building in its own order, so there
// is no boss to choose -- the size and the difficulty are the whole setting.
if (mode === 'battleground') cell.map = leanest(sessions, 'map')
if (mode !== 'menus') {
  cell.spec = leanest(sessions, 'spec')
  cell.style = leanest(sessions, 'style')
}
if (mode === 'raid' || mode === 'walk' || mode === 'clear') {
  cell.size = leanest(sessions, 'size')
  cell.difficulty = leanest(sessions, 'difficulty')
}
cell.view = leanest(sessions, 'view')
cell.save = leanest(sessions, 'save')

process.stdout.write(`${JSON.stringify(cell)}\n`)
for (const [k, v] of Object.entries(cell)) process.stdout.write(`${k}=${v}\n`)

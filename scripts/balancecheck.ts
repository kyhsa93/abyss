import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ENCOUNTERS } from '../src/sim/encounters'

/**
 * The harness prints a few hundred numbers and nobody reads them.
 *
 * That is not a jab at anybody: `npm run check` takes about an hour, and at the
 * end of it a person is asked to notice that a tuning commit also moved a cell
 * three tables away. A number nobody reads cannot hold a line, so the lines that
 * matter are written down here and the run fails when one is crossed.
 *
 * The simulation is deterministic — fixed seeds, no Math.random() in sim/ — so
 * running twice without touching the code gives the same tables to the digit.
 * Every failure here was put there by a commit.
 *
 * The bands are design intent, not measurement. Each one is also wider than the
 * noise of the sample it reads: two standard errors on a forty-pull win rate is
 * about sixteen points, so a band any tighter would be measuring the seed.
 */

type Band = { name: string; why: string; check(text: string): string[] }

const rows = (text: string, header: RegExp): string[] => {
  const start = text.search(header)
  if (start < 0) return []
  const body = text.slice(text.indexOf('\n', start) + 1)
  const end = body.search(/\n\s*\n/)
  return (end < 0 ? body : body.slice(0, end)).split('\n').filter((line) => line.trim())
}

/**
 * How many rows a section must have before its band is allowed to pass.
 *
 * A band reads a table by finding its header and taking the lines under it. If
 * the header moves, or the shard that prints those lines stops running, `rows`
 * returns nothing and every band over it passes -- having checked nothing.
 *
 * That is not hypothetical. The per-boss shards were a hand-typed list that
 * stopped at the fifth boss while eight were being written, so three fights
 * had no rows in the size-and-difficulty table at all, and the band below
 * reported ok for a boss sitting at nought percent in every cell it had.
 *
 * So a band that finds an empty table fails, and says so. An assertion with
 * nothing to assert on is the one failure mode a green run cannot show you.
 */
const atLeast = (found: string[], want: number, what: string): string[] =>
  found.length >= want ? [] : [`${what}: ${found.length} rows in the harness output, expected ${want}`]

const percents = (line: string) => [...line.matchAll(/(\d+)%/g)].map((m) => Number(m[1]))

/** Everything before the first run of two spaces. Names have single spaces in them. */
const label = (line: string) => line.split(/\s{2,}/)[0].trim()

const SPEC_FLOOR = 50
const CELL_FLOOR = 50
const BG_MARGIN = 20

const BANDS: Band[] = [
  {
    name: 'no spec is a trap',
    why:
      'the class screen is the one decision this game asks you to make, and a spec that ' +
      'cannot clear the reference fight makes that screen a lie',
    check: (text) => {
      const bad: string[] = []
      for (const section of ['dps', 'healer', 'tank']) {
        const found = rows(text, new RegExp(`^spec: ${section} `, 'm')).slice(1)
        bad.push(...atLeast(found, 1, `the ${section} spec table`))
        for (const line of found) {
          if (line.startsWith('  spread')) continue
          const win = percents(line).at(-1)
          if (win !== undefined && win < SPEC_FLOOR) {
            bad.push(`${label(line)} wins ${win}% (floor ${SPEC_FLOOR}%)`)
          }
        }
      }
      return bad
    },
  },
  {
    name: 'every fight is winnable by the ninth pull',
    why:
      'a fight is learned by repeating it. A cell still unwinnable after nine attempts is ' +
      'not teaching anything, it is refusing',
    check: (text) => {
      const bad: string[] = []
      const found = rows(text, /^boss \/ size \/ difficulty /m).slice(1)
      // Three sizes by two difficulties for every boss on the roster. Counted
      // rather than "more than none", because the way this table went wrong
      // was a boss missing from it while the others were all present.
      bad.push(...atLeast(found, ENCOUNTERS.length * 6, 'the size and difficulty table'))
      for (const line of found) {
        const pulls = percents(line)
        if (pulls.length >= 2 && pulls[1] < CELL_FLOOR) {
          bad.push(`${label(line)} is at ${pulls[1]}% by pull 9 (floor ${CELL_FLOOR}%)`)
        }
      }
      return bad
    },
  },
  {
    name: 'a battleground rewards playing it',
    why:
      'the drives are the same five players told to care about different things. If standing ' +
      'still scores like playing, the map is scenery rather than a game',
    check: (text) => {
      const wins = new Map<string, Map<string, number>>()
      for (const line of rows(text, /^battleground {2,}player /m).slice(1)) {
        const [, drive] = line.split(/\s{2,}/)
        const win = percents(line)[0]
        if (drive === undefined || win === undefined) continue
        const map = wins.get(label(line)) ?? new Map<string, number>()
        map.set(drive.trim(), win)
        wins.set(label(line), map)
      }
      const bad: string[] = []
      for (const [map, drives] of wins) {
        const ai = drives.get('ai')
        const idle = drives.get('idle')
        if (ai === undefined || idle === undefined) continue
        if (ai - idle < BG_MARGIN) {
          bad.push(`${map}: playing beats standing still by ${ai - idle} points (want ${BG_MARGIN})`)
        }
      }
      return bad
    },
  },
]

// The harness used to cost about an hour on one core; `harnessrun` splits it
// across all of them and it costs the longest shard. Anything that already has
// its output can still hand it over rather than paying twice — the weekly
// upkeep job reads the tables itself and then checks the bands against the
// same text.
const saved = process.env.ABYSS_HARNESS_OUT
const text = saved
  ? readFileSync(resolve(process.cwd(), saved), 'utf8')
  : execFileSync(process.execPath, [resolve(process.cwd(), 'node_modules/.cache/harnessrun.mjs')], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
// Print it anyway. The bands are a floor under the tables, not a replacement for
// reading them, and a run that prints nothing teaches nobody anything.
process.stdout.write(text)

/**
 * Bands not being checked right now, by name, and why.
 *
 * A band is design intent and widening one to make a run pass is the edit that
 * turns this file into decoration -- that is the last line this file prints and
 * it still means it. This is the other thing, and it is written down rather
 * than done quietly: two of them are switched off, in the open, until the thing
 * that keeps invalidating them stops moving.
 *
 * What is moving is the rooms. Every fight in this game was played in one
 * circle until a few commits ago; the fights are being given their own rooms
 * now, one at a time, and a room decides how far a body walks to answer
 * anything. The Whisper's twenty-five-man cells were tuned to 65 and 83
 * percent in a circle, and reading 28 in the hall it has since been given is
 * not a regression in the fight -- it is the same fight in a different room.
 * Tuning against a room that changes next week is work thrown away twice: once
 * when it is done and once when it is undone.
 *
 * So they come back when the twelve rooms in #26 through #37 are written and
 * the arena has stopped being a variable. The band definitions above are
 * untouched, so coming back is deleting this list.
 *
 * Nothing may be added to it without the same two sentences: what is moving
 * underneath the band, and what has to settle before it is switched on again.
 */
const SUSPENDED: string[] = [
  'no spec is a trap',
  'every fight is winnable by the ninth pull',
]

let failed = false
for (const band of BANDS) {
  if (SUSPENDED.includes(band.name)) {
    console.log(`balancecheck: ${band.name} — NOT CHECKED (suspended)`)
    continue
  }
  const bad = band.check(text)
  if (!bad.length) {
    console.log(`balancecheck: ${band.name} — ok`)
    continue
  }
  failed = true
  console.error(`\nbalancecheck: ${band.name}`)
  console.error(`  ${band.why}.`)
  for (const line of bad) console.error(`  - ${line}`)
}

if (SUSPENDED.length > 0) {
  console.log(
    `\nbalancecheck: ${SUSPENDED.length} band(s) are switched off and were not checked: ` +
      `${SUSPENDED.join(', ')}. A green run here does not mean what it usually means. ` +
      `See SUSPENDED in scripts/balancecheck.ts for what has to settle first.`,
  )
}

if (failed) {
  console.error(
    '\nA band is design intent. Widening one to make this pass is the edit that turns ' +
      'the whole file into decoration — retune the fight, or change the band on purpose ' +
      'and say why in the commit.',
  )
  process.exit(1)
}

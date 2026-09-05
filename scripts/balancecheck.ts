import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

const percents = (line: string) => [...line.matchAll(/(\d+)%/g)].map((m) => Number(m[1]))

/** Everything before the first run of two spaces. Names have single spaces in them. */
const label = (line: string) => line.split(/\s{2,}/)[0].trim()

const SPEC_FLOOR = 50
const CELL_FLOOR = 50
const DESCENT_RANGE: [number, number] = [4, 10]
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
        for (const line of rows(text, new RegExp(`^spec: ${section} `, 'm')).slice(1)) {
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
      for (const line of rows(text, /^boss \/ size \/ difficulty /m).slice(1)) {
        const pulls = percents(line)
        if (pulls.length >= 2 && pulls[1] < CELL_FLOOR) {
          bad.push(`${label(line)} is at ${pulls[1]}% by pull 9 (floor ${CELL_FLOOR}%)`)
        }
      }
      return bad
    },
  },
  {
    name: 'the descent ends somewhere worth telling',
    why:
      'one attempt, boss after boss. A median of two is a wall and a median of fifteen is a ' +
      'treadmill; either way there is no sentence in it',
    check: (text) => {
      const found = /descent runs: median floor (\d+)/.exec(text)
      if (!found) return ['the descent line is gone from the harness output']
      const median = Number(found[1])
      const [low, high] = DESCENT_RANGE
      return median < low || median > high
        ? [`median floor ${median} (want ${low}-${high})`]
        : []
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

let failed = false
for (const band of BANDS) {
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

if (failed) {
  console.error(
    '\nA band is design intent. Widening one to make this pass is the edit that turns ' +
      'the whole file into decoration — retune the fight, or change the band on purpose ' +
      'and say why in the commit.',
  )
  process.exit(1)
}

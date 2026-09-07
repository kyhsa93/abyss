/**
 * The harness, run on every core instead of one.
 *
 * `scripts/harness.ts` is a dozen independent tables of independent pulls, and
 * it took an hour on one core of a machine with eight. Nothing about it was
 * hard to split -- the simulation is deterministic from a seed and reaches
 * outside itself for nothing -- so the hour was being paid for no reason
 * beyond nobody having asked.
 *
 * Profiled first, because splitting a file evenly is the wrong move when it is
 * not evenly expensive. The size-and-difficulty table is 1120 of the 1475
 * seconds and everything else together is 355, so the shards are one per boss
 * of that table plus one per table for the rest, and the wall clock is the
 * largest of them rather than the sum.
 *
 * The output is concatenated in the order the file itself prints, so what
 * comes out of here is byte-identical to what comes out of a single run --
 * which is asserted rather than hoped for: `npm run harness` still runs the
 * whole thing in one process, and that is what this was diffed against.
 */
import { execFile } from 'node:child_process'
import { availableParallelism } from 'node:os'
import { resolve } from 'node:path'
import { ENCOUNTERS } from '../src/sim/encounters'

/**
 * In the order `harness.ts` prints them. Nothing else decides the output.
 *
 * The per-boss shards are counted off the roster rather than typed out, and
 * that is not tidiness. They were typed out, `size:0` through `size:4`, from a
 * round where there were five bosses. Three more were written afterwards and
 * nobody added a line here, so the size-and-difficulty table -- the one the
 * "every fight is winnable by the ninth pull" band reads, and the only place a
 * cell is measured at all -- simply had no rows for the last three fights.
 *
 * The band did not fail, because `rows()` finds nothing and a band with
 * nothing to read passes. So a boss could be built, tuned by eye, shipped and
 * left at nought percent across every size and difficulty, and every check in
 * the repo would agree it was fine. One was: see the Reeking Host's numbers in
 * the commit that found this.
 *
 * A list of shards that has to be extended by hand every time a boss is added
 * will be short again. This one cannot be.
 */
const SHARDS = [
  'composition',
  'boss',
  ...ENCOUNTERS.map((_, i) => `size:${i}`),
  'member',
  'spec',
  'mechanic',
  'bg',
]

const harness = resolve(process.cwd(), 'node_modules/.cache/harness.mjs')

function shard(tag: string): Promise<string> {
  return new Promise((ok, fail) => {
    execFile(
      process.execPath,
      [harness],
      {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, ABYSS_SHARD: tag },
      },
      (err, out, errOut) => {
        if (err) {
          fail(new Error(`shard ${tag} failed: ${err.message}\n${errOut}`))
          return
        }
        ok(out)
      },
    )
  })
}

async function main(): Promise<void> {
  // Started in order and collected in order, with only as many in flight as
  // the machine has cores. Starting all thirteen at once on a four-core runner
  // does not finish sooner; it finishes at the same time having spent the
  // difference on context switches and thirteen copies of the heap.
  const width = Math.max(1, availableParallelism())
  const out: string[] = new Array(SHARDS.length).fill('')
  let next = 0

  async function worker(): Promise<void> {
    for (;;) {
      const mine = next++
      if (mine >= SHARDS.length) return
      out[mine] = await shard(SHARDS[mine]!)
    }
  }

  await Promise.all(Array.from({ length: Math.min(width, SHARDS.length) }, worker))
  process.stdout.write(out.join(''))
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})

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
import { mkdirSync, writeFileSync } from 'node:fs'
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
  // A shard a *cell* of the size table, not a shard a boss.
  //
  // A boss was the right grain while every shard ran on one of the four cores
  // of one machine. It is the wrong grain once a shard can be a whole runner:
  // six cells of up to twenty-five-man pulls is twenty minutes on one core,
  // and no amount of runners makes a single shard finish sooner. A cell is
  // three minutes, and three minutes is a thing forty of can be finished in
  // under ten.
  //
  // The order is the file's own — boss, then size, then difficulty — because
  // the output of the shards is concatenated in this order and has to come out
  // byte-identical to a single run.
  ...ENCOUNTERS.flatMap((_, i) =>
    [5, 10, 25].flatMap((size) => ['normal', 'heroic'].map((d) => `size:${i}:${size}:${d}`)),
  ),
  'member',
  'spec',
  // A shard a boss here too, and for the same reason the size table has one a
  // cell: it was one shard of ten minutes, which is a shard no number of
  // runners can make finish sooner.
  ...ENCOUNTERS.map((_, i) => `mechanic:${i}`),
  'bg',
]

/**
 * The slice of the list this run is responsible for.
 *
 * Contiguous, and that is the whole requirement: the pieces are pasted back
 * together in this file's order, so a run that takes a contiguous slice can be
 * pasted next to its neighbours without anybody holding an index. Unset is the
 * whole list, which is what a person at a terminal wants and what the
 * single-process run is diffed against.
 */
function mine(): Array<{ at: number; tag: string }> {
  // Shards nobody is reading, named by whoever is not reading them.
  //
  // `balancecheck` has three bands and two of them are switched off while the
  // fights are being given rooms of their own. The tables they read are still
  // computed on every push, and one of them — the spec sweep, seventeen specs
  // across every boss — is twenty-one minutes on a core and cannot be split
  // any further than itself: every other shard in this file finishes inside
  // eighty seconds, and that one alone decided how long the whole run took.
  //
  // So the build skips it by name while its band is off, and the two come back
  // together. The name is passed in rather than hard-coded here, because a
  // list of skips that lives next to the shards is a list that outlives the
  // reason for it.
  const skip = new Set((process.env.ABYSS_SKIP ?? '').split(',').filter(Boolean))
  const all = SHARDS.map((tag, at) => ({ at, tag })).filter(({ tag }) => !skip.has(tag))
  const of = Number(process.env.ABYSS_CHUNKS ?? '1')
  const which = Number(process.env.ABYSS_CHUNK ?? '0')
  if (!Number.isInteger(of) || of < 1 || !Number.isInteger(which) || which < 0 || which >= of) {
    return all
  }
  // Dealt round-robin rather than cut into blocks. The list is not evenly
  // expensive — a twenty-five-man cell is worth several five-man ones and the
  // six cells of one boss sit next to each other — so blocks would hand one
  // runner every heavy shard and the wall clock would be that runner.
  //
  // Which is why each piece carries the index it came from. Round-robin does
  // not concatenate; numbered pieces do, and the numbering is what lets the
  // work be dealt out by cost instead of by position.
  return all.filter((_, i) => i % of === which)
}

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
  //
  // Overridable, because "the machine has eight cores" is not the same claim
  // as "the machine can hold eight of these". Each shard is its own heap with
  // its own copy of the sprite atlas in it, and this box has seven gigabytes:
  // two of these runs going at once is sixteen processes, and what happens
  // then is not a slow run, it is a SIGTERM in the middle of one -- twice, at
  // forty minutes in, with no failure to read afterwards. `ABYSS_SHARD_WIDTH`
  // is how a second run gets out of the first one's way.
  const todo = mine()
  const asked = Number(process.env.ABYSS_SHARD_WIDTH ?? '')
  const width = Number.isFinite(asked) && asked >= 1
    ? Math.floor(asked)
    : Math.max(1, availableParallelism())
  const out: string[] = new Array(todo.length).fill('')
  let next = 0

  async function worker(): Promise<void> {
    for (;;) {
      const i = next++
      if (i >= todo.length) return
      const began = Date.now()
      out[i] = await shard(todo[i]!.tag)
      // On stderr, so it is in the log and not in the tables. Which shard is
      // the long pole decides how the work is split, and guessing at that from
      // the outside is how it came to be split one-shard-a-boss long after a
      // boss stopped being an affordable unit.
      console.error(`shard ${todo[i]!.tag} — ${((Date.now() - began) / 1000).toFixed(1)}s`)
    }
  }

  await Promise.all(Array.from({ length: Math.min(width, todo.length) }, worker))

  // Numbered pieces on disk, for a run that is one of several machines; the
  // whole thing on stdout, for a run that is the only one. The pieces are
  // named by their place in `SHARDS`, so whoever pastes them back together
  // needs nothing but the numbers — not which machine ran what, not how many
  // there were.
  const parts = process.env.ABYSS_PARTS
  if (parts) {
    mkdirSync(parts, { recursive: true })
    todo.forEach(({ at }, i) => {
      writeFileSync(resolve(parts, `part-${String(at).padStart(3, '0')}.txt`), out[i]!)
    })
    return
  }
  process.stdout.write(out.join(''))
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})

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
 * not evenly expensive. The size-and-difficulty table was most of the cost, so
 * it is one shard a cell; the other tables are one shard each or one a boss,
 * and the wall clock is the largest of them rather than the sum. The one table
 * that is a sum over bosses, the spec sweep, is one shard a spec: its seventeen
 * rows are independent, and the table is printed from them by `spec:merge`.
 *
 * The output is concatenated in the order the file itself prints, so what
 * comes out of here is byte-identical to what comes out of a single run --
 * which is asserted rather than hoped for: `npm run harness` still runs the
 * whole thing in one process, and that is what this was diffed against.
 */
import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { RAID_SIZES, SPEC_OPTIONS } from '../src/sim/classes'
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
    [...RAID_SIZES].flatMap((size) => ['normal', 'heroic'].map((d) => `size:${i}:${size}:${d}`)),
  ),
  'member',
  // A shard a spec. The table is a sum over every boss for each of seventeen
  // specs, so it cannot be cut by boss (one boss is a third of it) and it
  // cannot be pasted together with `cat`: the rows are sorted by role and the
  // spread is read off all of them. Each shard writes its spec's four numbers
  // to `spec-rows/`, and `ABYSS_SPEC_MERGE` prints the table from the seventeen.
  ...SPEC_OPTIONS.map((_, i) => `spec:${i}`),
  // A shard a boss here too, and for the same reason the size table has one a
  // cell: it was one shard of ten minutes, which is a shard no number of
  // runners can make finish sooner.
  ...ENCOUNTERS.map((_, i) => `mechanic:${i}`),
  // A shard a boss, for the same reason as the two above it: ninety heroic pulls
  // twice over is minutes rather than seconds, and a shard no number of runners
  // can make finish sooner is the one that decides the wall clock.
  ...ENCOUNTERS.map((_, i) => `reward:${i}`),
  'bg',
  // Last, so every piece before it keeps its number and its bytes. A shard a
  // boss: the table is 120 pulls a boss at 10-man heroic.
  ...ENCOUNTERS.map((_, i) => `crisis:${i}`),
]

/**
 * What a shard costs, in seconds on the slow kind of hosted runner.
 *
 * Read off run 37891192987 (`shard <tag> — Ns` in each harness job's log), and
 * used for one thing: dealing the shards out so the heaviest ones start first
 * and no runner is handed two of them while another is handed none. A shard
 * that is not in the table costs `DEFAULT_COST`. A stale table makes a run
 * slower, never wrong: the output is put together by `part-NNN` number, which
 * does not depend on who ran what. Recalibrate it from the `shard` lines of a
 * few runs after the split changes.
 */
const COSTS: Record<string, number> = {
  'boss': 512, 'composition': 510, 'size:6:25:normal': 435, 'mechanic:6': 262,
  'reward:6': 252, 'bg': 242, 'size:4:25:normal': 227, 'size:6:25:heroic': 225,
  'size:1:25:heroic': 216, 'size:8:25:heroic': 205, 'size:2:25:normal': 204, 'size:6:10:normal': 195,
  'size:0:25:heroic': 193, 'size:3:25:heroic': 183, 'size:10:25:heroic': 180, 'size:2:25:heroic': 178,
  'size:0:25:normal': 165, 'size:4:25:heroic': 160, 'size:1:25:normal': 145, 'size:8:25:normal': 137,
  'size:10:25:normal': 133, 'size:7:25:heroic': 132, 'size:7:25:normal': 130, 'size:6:10:heroic': 129,
  'size:3:25:normal': 125, 'size:5:25:heroic': 110, 'mechanic:8': 107, 'mechanic:3': 106,
  'size:9:25:normal': 104, 'size:9:25:heroic': 103, 'mechanic:5': 101, 'reward:0': 95,
  'crisis:6': 95, 'reward:8': 94, 'mechanic:7': 91, 'reward:4': 86,
  'crisis:8': 84, 'size:4:10:heroic': 83, 'crisis:4': 81, 'reward:1': 79,
  'reward:3': 78, 'size:4:10:normal': 76, 'mechanic:2': 76, 'crisis:10': 72,
  'reward:2': 71, 'mechanic:4': 71, 'mechanic:10': 64, 'reward:9': 62,
  'mechanic:1': 59, 'size:5:25:normal': 58, 'size:8:10:normal': 56, 'mechanic:0': 56,
  'reward:10': 55, 'crisis:3': 54, 'size:10:10:normal': 52, 'crisis:0': 51,
  'size:0:10:heroic': 50, 'size:3:10:normal': 49, 'mechanic:9': 49, 'reward:5': 45,
  'size:1:10:normal': 41, 'crisis:2': 39, 'size:3:10:heroic': 37, 'size:10:10:heroic': 34,
  'reward:7': 34, 'crisis:7': 34, 'size:2:10:heroic': 33, 'size:0:10:normal': 33,
  'size:5:10:heroic': 32, 'size:9:10:heroic': 31, 'size:8:10:heroic': 31, 'size:7:10:heroic': 31,
  'size:5:10:normal': 29, 'crisis:5': 29, 'crisis:1': 29, 'member': 28,
  'size:1:10:heroic': 23, 'crisis:9': 20, 'size:7:10:normal': 19, 'size:2:10:normal': 19,
  'size:9:10:normal': 16,
}
const SPEC_COST = 107
const DEFAULT_COST = 100

const isSpecRow = (tag: string): boolean => /^spec:\d+$/.test(tag)
const costOf = (tag: string): number => (isSpecRow(tag) ? SPEC_COST : (COSTS[tag] ?? DEFAULT_COST))

/** Whether `ABYSS_SKIP` names this shard. Skipping `spec` skips all its rows. */
function skipped(tag: string): boolean {
  const skip = new Set((process.env.ABYSS_SKIP ?? '').split(',').filter(Boolean))
  return skip.has(tag) || (isSpecRow(tag) && skip.has('spec'))
}

/**
 * Longest-processing-time-first: the most expensive shard goes to the chunk
 * that is lightest so far, ties to the lower chunk number, ties in cost to the
 * earlier place in `SHARDS`. Deterministic, so every chunk's job computes the
 * same answer without being told it. Each chunk's list comes back in cost
 * order, which is the order it should start them in.
 */
function deal(all: Array<{ at: number; tag: string }>, of: number): Array<Array<{ at: number; tag: string }>> {
  const chunks: Array<Array<{ at: number; tag: string }>> = Array.from({ length: of }, () => [])
  const load: number[] = new Array(of).fill(0)
  const byCost = [...all].sort((a, b) => costOf(b.tag) - costOf(a.tag) || a.at - b.at)
  for (const shard of byCost) {
    let lightest = 0
    for (let c = 1; c < of; c++) if (load[c]! < load[lightest]!) lightest = c
    chunks[lightest]!.push(shard)
    load[lightest]! += costOf(shard.tag)
  }
  // Every shard in exactly one chunk, or a band reads a table with a hole in it.
  const seen = chunks.flat().map((x) => x.tag)
  if (seen.length !== all.length || new Set(seen).size !== all.length || all.some((x) => !seen.includes(x.tag))) {
    throw new Error(`dealing ${all.length} shards into ${of} chunks lost or doubled one`)
  }
  return chunks
}

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
  // Shards nobody is reading, named by whoever is not reading them. Passed in
  // rather than hard-coded here, because a list of skips that lives next to
  // the shards is a list that outlives the reason for it. Nothing is skipped
  // by the build.
  const all = SHARDS.map((tag, at) => ({ at, tag })).filter(({ tag }) => !skipped(tag))
  const of = Number(process.env.ABYSS_CHUNKS ?? '1')
  const which = Number(process.env.ABYSS_CHUNK ?? '0')
  if (!Number.isInteger(of) || of < 1 || !Number.isInteger(which) || which < 0 || which >= of) {
    return all
  }
  // Dealt by cost rather than cut into blocks or turned round-robin. The list
  // is not evenly expensive -- a twenty-five-man cell is worth several five-man
  // ones, and `boss` alone is eight minutes -- so a blind deal can hand one
  // runner two of the heavy ones and the wall clock is that runner.
  //
  // Each piece carries the index it came from. Dealing by cost does not
  // concatenate; numbered pieces do, and the numbering is what lets the work
  // be dealt out by cost instead of by position.
  return deal(all, of)[which]!
}

const harness = resolve(process.cwd(), 'node_modules/.cache/harness.mjs')

function shard(tag: string, extra: Record<string, string> = {}): Promise<string> {
  return new Promise((ok, fail) => {
    execFile(
      process.execPath,
      [harness],
      {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, ABYSS_SHARD: tag, ...extra },
      },
      (err, out, errOut) => {
        if (err) {
          fail(new Error(`shard ${tag} failed: ${err.message}\n${errOut}`))
          return
        }
        // The per-boss timers of the spec rows, and anything else a shard says
        // on stderr, belong in the log next to the shard's own total.
        if (errOut) process.stderr.write(errOut)
        ok(out)
      },
    )
  })
}

/**
 * How many of each thing a whole sweep comes back in, printed and nothing else.
 * Three numbers, and they count three different things:
 *
 * - `ABYSS_COUNT`: the `part-NNN.txt` files the build finds in `parts/` once
 *   the spec rows are merged. A merged `spec` is one part, so it is one of
 *   these however many shards made it.
 * - `ABYSS_COUNT_TAGS`: the shards dealt out to chunks (a `spec:i` is one each).
 *   Every one of them lands in exactly one chunk, asserted when they are dealt.
 * - `ABYSS_COUNT_RAW`: the rows `spec-rows/` holds, one a spec, kept out of
 *   `parts/` so that counting the parts cannot be satisfied by them.
 *
 * For the build, which pastes the pieces together and has to know whether any
 * of them went missing -- a band that opens an empty table passes having
 * checked nothing. It used to be a number typed into the workflow beside the
 * paste, and it went stale the moment the five-man raid did: the sweep dropped
 * from fifty-five pieces to forty-four and the build failed on arithmetic
 * rather than on anything being wrong.
 *
 * Counted with the same `ABYSS_SKIP` the run itself reads, so a skipped shard
 * is not looked for either.
 */
const counts = {
  ABYSS_COUNT: () => SHARDS.filter((tag) => !skipped(tag) && !(isSpecRow(tag) && tag !== 'spec:0')).length,
  ABYSS_COUNT_TAGS: () => SHARDS.filter((tag) => !skipped(tag)).length,
  ABYSS_COUNT_RAW: () => SHARDS.filter((tag) => !skipped(tag) && isSpecRow(tag)).length,
}
for (const [name, count] of Object.entries(counts)) {
  if (process.env[name] !== undefined) {
    process.stdout.write(`${count()}\n`)
    process.exit(0)
  }
}

/** The spec rows, one file a spec, in `SPEC_OPTIONS` order. */
const specRowsDir = (): string => resolve(process.cwd(), process.env.ABYSS_SPEC_ROWS ?? 'spec-rows')
const specRowFile = (dir: string, tag: string): string =>
  resolve(dir, `spec-${tag.slice('spec:'.length).padStart(2, '0')}.txt`)

/**
 * The seventeen rows, printed as the three tables. The slot is the first spec
 * shard's, which is where the single `spec` used to sit, so the merged part
 * sorts exactly where the old one did.
 */
async function mergeSpec(dir: string): Promise<{ at: number; out: string }> {
  const rows = readdirSync(dir).filter((f) => /^spec-\d+\.txt$/.test(f))
  const want = counts.ABYSS_COUNT_RAW()
  if (rows.length !== want) {
    throw new Error(`${rows.length} spec rows in ${dir}, wanted ${want}`)
  }
  const at = SHARDS.indexOf('spec:0')
  return { at, out: await shard('spec:merge', { ABYSS_SPEC_ROWS: dir }) }
}

async function main(): Promise<void> {
  if (process.env.ABYSS_SPEC_MERGE) {
    // The build's own step, run once after the chunks are back: rows in,
    // merged part out, in the slot the single `spec` table used to have.
    const merged = await mergeSpec(specRowsDir())
    const dir = process.env.ABYSS_PARTS ?? '.'
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolve(dir, `part-${String(merged.at).padStart(3, '0')}.txt`), merged.out)
    return
  }
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
  const began = Date.now()
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

  // A spec shard's output is one row, not a piece of the file. It goes to its
  // own folder, never to `parts/`: the build counts `parts/` and a raw row
  // there would let the count pass with a part missing.
  const specAt = todo.map(({ tag }, i) => ({ tag, i })).filter(({ tag }) => isSpecRow(tag))
  const parts = process.env.ABYSS_PARTS

  // Numbered pieces on disk, for a run that is one of several machines; the
  // whole thing on stdout, for a run that is the only one. The pieces are
  // named by their place in `SHARDS`, so whoever pastes them back together
  // needs nothing but the numbers -- not which machine ran what, not how many
  // there were.
  if (parts) {
    mkdirSync(parts, { recursive: true })
    if (specAt.length > 0) {
      const dir = specRowsDir()
      mkdirSync(dir, { recursive: true })
      for (const { tag, i } of specAt) writeFileSync(specRowFile(dir, tag), out[i]!)
    }
    todo.forEach(({ at, tag }, i) => {
      if (!isSpecRow(tag)) writeFileSync(resolve(parts, `part-${String(at).padStart(3, '0')}.txt`), out[i]!)
    })
  } else {
    const pieces = todo.map(({ at, tag }, i) => ({ at, tag, text: out[i]! })).filter(({ tag }) => !isSpecRow(tag))
    if (specAt.length > 0) {
      // The only machine there is, so the rows are all here: merge them where
      // the spec shards sit in the file.
      const dir = mkdtempSync(resolve(tmpdir(), 'abyss-spec-'))
      for (const { tag, i } of specAt) writeFileSync(specRowFile(dir, tag), out[i]!)
      const merged = await mergeSpec(dir)
      pieces.push({ at: merged.at, tag: 'spec', text: merged.out })
    }
    pieces.sort((a, b) => a.at - b.at)
    process.stdout.write(pieces.map((x) => x.text).join(''))
  }
  // Dealt by cost, so this is the line that says how well it was dealt.
  console.error(`chunk total — ${((Date.now() - began) / 1000).toFixed(1)}s`)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})

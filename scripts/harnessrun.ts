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
 * not evenly expensive. The wall clock of a run is the longest runner, and a
 * runner cannot finish before its longest shard, so the shards are cut until
 * none is longer than a few minutes on the slow kind of hosted runner: a row of
 * the composition and boss tables, a cell of the size table (and the biggest
 * cells again, by pull), a boss of the other tables (and the long ones again, by
 * row), a spec of the spec sweep. The rows of a table that is a sum or an
 * average -- the spec sweep and the cut size cells -- cannot be pasted with
 * `cat`, so their shards write raw numbers and a `merge` shard prints the table
 * from them with the code a single process prints it with.
 *
 * The output is concatenated in the order the file itself prints, so what
 * comes out of here is byte-identical to what comes out of a single run --
 * which is asserted rather than hoped for: `npm run harness` still runs the
 * whole thing in one process, and that is what this was diffed against.
 */
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { RAID_SIZES, SPEC_OPTIONS } from '../src/sim/classes'
import { ENCOUNTERS } from '../src/sim/encounters'
import { BATTLEGROUNDS } from '../src/sim/battleground'
import {
  BG_DRIVE_COUNT,
  BG_ROWS_SPLIT,
  BOSS_PIECES,
  COMPOSITION_ROWS,
  MECHANIC_ROWS_SPLIT,
  REWARD_DRIVE_COUNT,
  REWARD_ROWS_SPLIT,
  SIZE_PIECES,
  rowFile,
} from './shardplan'

/**
 * A run of shards that make one table, and how it is put back together.
 *
 * - `single` is the tag that asks for the whole table from one process, which is
 *   what `npm run harness` prints and what the cut table is diffed against.
 * - `tags` are the pieces, in the table's own order.
 * - `merge`, when there is one, is the tag that prints the table from raw rows
 *   (`spec:merge`): the pieces then write rows, not text, and the merge writes
 *   the part. Without one the pieces are lines of the file and paste back with
 *   `cat`, because each of them reads nothing from the one before.
 */
type Group = { single: string; tags: string[]; merge: string | null }
/** What one table of the file is made of, so that it can be diffed whole. */
type Table = { single: string; groups: Group[] }

const whole = (tag: string): Group => ({ single: tag, tags: [tag], merge: null })
const cut = (single: string, tags: string[], merge: string | null = null): Group => ({ single, tags, merge })
const upTo = (n: number): number[] => Array.from({ length: n }, (_, i) => i)
const table = (single: string, groups: Group[]): Table => ({ single, groups })

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
const TABLES: Table[] = [
  // A shard a row: eight minutes each as a table, and a shard no number of
  // runners can make finish sooner. The rows read nothing from each other.
  table('composition', upTo(COMPOSITION_ROWS).map((j) => whole(`composition:${j}`))),
  // The seventh boss is a third of the table by itself, so its row is cut by pull.
  table(
    'boss',
    ENCOUNTERS.map((_, i) => {
      const pieces = BOSS_PIECES[i]
      return pieces === undefined ? whole(`boss:${i}`) : cut(`boss:${i}`, upTo(pieces).map((k) => `boss:${i}:${k}`), `boss:${i}:merge`)
    }),
  ),
  // A shard a *cell* of the size table, not a shard a boss.
  //
  // A boss was the right grain while every shard ran on one of the four cores
  // of one machine. It is the wrong grain once a shard can be a whole runner:
  // six cells of up to twenty-five-man pulls is twenty minutes on one core,
  // and no amount of runners makes a single shard finish sooner. A cell is
  // three minutes, and three minutes is a thing forty of can be finished in
  // under ten. The biggest cells are cut again, by pull, and put back by `merge`.
  //
  // The order is the file's own -- boss, then size, then difficulty -- because
  // the output of the shards is concatenated in this order and has to come out
  // byte-identical to a single run.
  ...ENCOUNTERS.flatMap((_, i) =>
    [...RAID_SIZES].flatMap((size) =>
      ['normal', 'heroic'].map((d) => {
        const cell = `size:${i}:${size}:${d}`
        const pieces = SIZE_PIECES[cell]
        return table(
          cell,
          [pieces === undefined ? whole(cell) : cut(cell, upTo(pieces).map((k) => `${cell}:${k}`), `${cell}:merge`)],
        )
      }),
    ),
  ),
  table('member', [whole('member')]),
  // A shard a spec. The table is a sum over every boss for each of seventeen
  // specs, so it cannot be cut by boss (one boss is a third of it) and it
  // cannot be pasted together with `cat`: the rows are sorted by role and the
  // spread is read off all of them. Each shard writes its spec's four numbers
  // to `rows/`, and `spec:merge` prints the table from the seventeen.
  table('spec', [cut('spec', SPEC_OPTIONS.map((_, i) => `spec:${i}`), 'spec:merge')]),
  // A shard a boss here too, and for the same reason the size table has one a
  // cell: it was one shard of ten minutes, which is a shard no number of
  // runners can make finish sooner. The long one is cut to a mechanic a shard.
  ...ENCOUNTERS.map((e, i) =>
    table(
      `mechanic:${i}`,
      MECHANIC_ROWS_SPLIT.includes(i) ? e.kit.map((_, k) => whole(`mechanic:${i}:${k}`)) : [whole(`mechanic:${i}`)],
    ),
  ),
  // A shard a boss, for the same reason as the two above it: ninety heroic pulls
  // twice over is minutes rather than seconds, and a shard no number of runners
  // can make finish sooner is the one that decides the wall clock. The long one
  // is a drive a shard.
  ...ENCOUNTERS.map((_, i) =>
    table(
      `reward:${i}`,
      REWARD_ROWS_SPLIT.includes(i) ? upTo(REWARD_DRIVE_COUNT).map((d) => whole(`reward:${i}:${d}`)) : [whole(`reward:${i}`)],
    ),
  ),
  table(
    'bg',
    BG_ROWS_SPLIT
      ? BATTLEGROUNDS.flatMap((_, b) => upTo(BG_DRIVE_COUNT).map((d) => whole(`bg:${b}:${d}`)))
      : [whole('bg')],
  ),
  // Last, so every piece before it keeps its number and its bytes. A shard a
  // boss: the table is 120 pulls a boss at 10-man heroic.
  ...ENCOUNTERS.map((_, i) => table(`crisis:${i}`, [whole(`crisis:${i}`)])),
]

const GROUPS = TABLES.flatMap((t) => t.groups)

const SHARDS = GROUPS.flatMap((g) => g.tags)
/** The group a shard belongs to. */
const groupOf = new Map(GROUPS.flatMap((g) => g.tags.map((tag) => [tag, g] as const)))
const tableOf = new Map(TABLES.flatMap((t) => t.groups.flatMap((g) => g.tags.map((tag) => [tag, t] as const))))
/** A piece that writes a raw row rather than a part of the file. */
const isRow = (tag: string): boolean => groupOf.get(tag)?.merge != null

/**
 * What a shard costs, in seconds -- on a table whose scale is NOT uniform, and
 * the numbers must not be read as one machine's.
 *
 * - Most entries are run 37891192987's `shard <tag> — Ns` lines, a mix of
 *   hosts, roughly the middling runner. For the tables cut since (rows of
 *   `composition` and `boss`, a boss's mechanics and rewards, the maps of `bg`)
 *   that old whole-shard value is shared out by what each piece took alone on a
 *   laptop, four at a time; a size cell cut by pull is the cell's value over its
 *   pieces.
 * - Three entries are the slow kind of runner, the AMD EPYC 7763, from the three
 *   main runs after the first split: `SPEC_COST` (about 200) and the pieces of
 *   `size:6:25:heroic` (375 over three) and `size:4:25:normal` (315 over two).
 *   Dealing a 7763 number beside middling ones makes the spec rows look slightly
 *   heavier than their neighbours, which is the safe way to be wrong.
 *
 * It is used for one thing: dealing the shards out so the heaviest ones start
 * first and no runner is handed two of them while another is handed none. A
 * shard that is not in the table costs `DEFAULT_COST` (`ABYSS_LIST=1` prints
 * every shard with the ones the table has never heard of marked). A stale table
 * makes a run slower, never wrong: the output is put together by `part-NNN`
 * number, which does not depend on who ran what. It is recalibrated from the
 * `shard` lines of the first runs after a split changes, in one pass, and not by
 * hand in between.
 */
const COSTS: Record<string, number> = {
  'size:1:25:normal': 145, 'size:8:25:normal': 137, 'reward:6:1': 135, 'size:10:25:normal': 133,
  'size:7:25:heroic': 132, 'size:7:25:normal': 130, 'size:6:10:heroic': 129, 'size:3:25:normal': 125,
  'reward:6:0': 117, 'size:4:25:normal:0': 158, 'size:4:25:normal:1': 158, 'size:5:25:heroic': 110,
  'size:6:25:normal:0': 109, 'size:6:25:normal:1': 109, 'size:6:25:normal:2': 109, 'size:6:25:normal:3': 109,
  'size:1:25:heroic:0': 108, 'size:1:25:heroic:1': 108, 'mechanic:8': 107, 'mechanic:3': 106,
  'size:9:25:normal': 104, 'size:9:25:heroic': 103, 'size:2:25:normal:0': 102, 'size:2:25:normal:1': 102,
  'size:8:25:heroic:0': 102, 'size:8:25:heroic:1': 102, 'mechanic:5': 101, 'size:6:10:normal:0': 98,
  'size:6:10:normal:1': 98, 'boss:6:0': 96, 'boss:6:1': 96, 'size:0:25:heroic:0': 96,
  'size:0:25:heroic:1': 96, 'crisis:6': 95, 'reward:0': 95, 'reward:8': 94,
  'size:3:25:heroic:0': 92, 'size:3:25:heroic:1': 92, 'mechanic:7': 91, 'size:10:25:heroic:0': 90,
  'size:10:25:heroic:1': 90, 'size:2:25:heroic:0': 89, 'size:2:25:heroic:1': 89, 'reward:4': 86,
  'crisis:8': 84, 'size:4:10:heroic': 83, 'size:0:25:normal:0': 82, 'size:0:25:normal:1': 82,
  'crisis:4': 81, 'size:4:25:heroic:0': 80, 'size:4:25:heroic:1': 80, 'composition:1': 79,
  'reward:1': 79, 'composition:4': 78, 'reward:3': 78, 'mechanic:2': 76,
  'size:4:10:normal': 76, 'size:6:25:heroic:0': 125, 'size:6:25:heroic:1': 125, 'size:6:25:heroic:2': 125,
  'composition:5': 72, 'crisis:10': 72, 'composition:0': 71, 'composition:3': 71,
  'mechanic:4': 71, 'reward:2': 71, 'composition:2': 70, 'composition:6': 69,
  'boss:4': 66, 'mechanic:10': 64, 'reward:9': 62, 'mechanic:1': 59,
  'size:5:25:normal': 58, 'mechanic:0': 56, 'mechanic:6:0': 56, 'mechanic:6:1': 56,
  'size:8:10:normal': 56, 'reward:10': 55, 'crisis:3': 54, 'size:10:10:normal': 52,
  'crisis:0': 51, 'size:0:10:heroic': 50, 'mechanic:9': 49, 'size:3:10:normal': 49,
  'mechanic:6:3': 45, 'reward:5': 45, 'size:1:10:normal': 41, 'boss:10': 40,
  'crisis:2': 39, 'mechanic:6:5': 37, 'size:3:10:heroic': 37, 'boss:0': 36,
  'boss:8': 36, 'mechanic:6:2': 35, 'boss:3': 34, 'crisis:7': 34,
  'reward:7': 34, 'size:10:10:heroic': 34, 'size:0:10:normal': 33, 'size:2:10:heroic': 33,
  'mechanic:6:4': 32, 'size:5:10:heroic': 32, 'size:7:10:heroic': 31, 'size:8:10:heroic': 31,
  'size:9:10:heroic': 31, 'crisis:1': 29, 'crisis:5': 29, 'size:5:10:normal': 29,
  'bg:0:0': 28, 'bg:0:3': 28, 'member': 28, 'bg:0:2': 26,
  'bg:0:1': 25, 'boss:1': 25, 'boss:2': 23, 'size:1:10:heroic': 23,
  'boss:5': 21, 'boss:7': 21, 'crisis:9': 20, 'bg:1:1': 19,
  'bg:1:2': 19, 'bg:1:3': 19, 'size:2:10:normal': 19, 'size:7:10:normal': 19,
  'bg:2:0': 18, 'boss:9': 18, 'bg:1:0': 16, 'bg:2:1': 16,
  'bg:2:2': 16, 'size:9:10:normal': 16, 'bg:2:3': 13,
}
// A slow-runner entry (see the table above): a spec took 95 to 99 seconds on the
// fast hosts and 197 to 210 on the EPYC 7763 ones (run 37902004103, mean 176
// over the seventeen).
const SPEC_COST = 200
const DEFAULT_COST = 100

const isSpecRow = (tag: string): boolean => /^spec:\d+$/.test(tag)
const costOf = (tag: string): number => (isSpecRow(tag) ? SPEC_COST : (COSTS[tag] ?? DEFAULT_COST))

/** Whether `ABYSS_SKIP` names this shard, or the table it is a piece of. */
function skipped(tag: string): boolean {
  const skip = new Set((process.env.ABYSS_SKIP ?? '').split(',').filter(Boolean))
  const g = groupOf.get(tag)
  const t = tableOf.get(tag)
  const named = (names: Set<string>): boolean =>
    names.has(tag) || (g !== undefined && names.has(g.single)) || (t !== undefined && names.has(t.single))
  // `ABYSS_ONLY` is the same list turned round, for a person who wants one
  // table cut and put back (`ABYSS_ONLY=boss,composition`) without an hour.
  const only = new Set((process.env.ABYSS_ONLY ?? '').split(',').filter(Boolean))
  return named(skip) || (only.size > 0 && !named(only))
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
 *   the raw rows are merged. A merged table is one part however many shards
 *   made it, so only the first piece of a merged table is counted.
 * - `ABYSS_COUNT_TAGS`: the shards dealt out to chunks. Every one of them lands
 *   in exactly one chunk, asserted when they are dealt.
 * - `ABYSS_COUNT_RAW`: the raw rows `rows/` holds -- a spec each and a piece
 *   each of the size cells that are cut by pull -- kept out of `parts/` so that
 *   counting the parts cannot be satisfied by them.
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
  ABYSS_COUNT: () => SHARDS.filter((tag) => !skipped(tag) && (!isRow(tag) || groupOf.get(tag)!.tags[0] === tag)).length,
  ABYSS_COUNT_TAGS: () => SHARDS.filter((tag) => !skipped(tag)).length,
  ABYSS_COUNT_RAW: () => SHARDS.filter((tag) => !skipped(tag) && isRow(tag)).length,
}
for (const [name, count] of Object.entries(counts)) {
  if (process.env[name] !== undefined) {
    process.stdout.write(`${count()}\n`)
    process.exit(0)
  }
}
// What a person pricing the table wants: every shard in file order, with what
// the table says it costs, and the ones the table has never heard of marked.
if (process.env.ABYSS_LIST !== undefined) {
  for (const tag of SHARDS) process.stdout.write(`${tag}\t${costOf(tag)}${tag in COSTS || isSpecRow(tag) ? '' : '\tdefault'}\n`)
  process.exit(0)
}

/** The raw rows, one file each, in `rows/` (or wherever `ABYSS_ROWS` says). */
const rowsDir = (): string => resolve(process.cwd(), process.env.ABYSS_ROWS ?? 'rows')

/**
 * A table printed from its raw rows, by the same code a single process prints
 * it with. The slot is the first piece's, which is where the single table sat,
 * so the merged part sorts exactly where the uncut one did.
 */
async function mergeGroup(group: Group, dir: string): Promise<{ at: number; out: string }> {
  const rows = group.tags.filter((tag) => !skipped(tag))
  const missing = rows.filter((tag) => !existsSync(resolve(dir, rowFile(tag))))
  if (missing.length > 0) throw new Error(`${group.single} is missing rows in ${dir}: ${missing.join(', ')}`)
  return { at: SHARDS.indexOf(group.tags[0]!), out: await shard(group.merge!, { ABYSS_ROWS: dir }) }
}

/** The groups that are put back from rows and that this run has not skipped. */
const mergedGroups = (): Group[] => GROUPS.filter((g) => g.merge !== null && !skipped(g.tags[0]!))

/**
 * Every cut table against its single-process self, on `ABYSS_RUNS` pulls a row
 * (the build sets one; the PR that cut them was checked at two).
 *
 * The whole sweep is an hour on a core and cannot be run twice to compare, so
 * this runs each cut table both ways with `ABYSS_RUNS` pulls a row and diffs the text. What it covers is what could differ: a
 * row's numbers depending on the rows measured before it in the same process,
 * the sum of a cell depending on how its pulls were grouped, and the numbers
 * surviving the trip through a file. Which rows are cut, and where, is the
 * code under test, so there is no list of its own here to go stale.
 */
async function verify(): Promise<void> {
  const dir = mkdtempSync(resolve(tmpdir(), 'abyss-verify-'))
  const width = Math.max(1, availableParallelism())
  const tables = TABLES.filter((t) => t.groups.length > 1 || t.groups.some((g) => g.tags.length > 1))
  const results = new Map<string, string>()
  const jobs: Array<() => Promise<void>> = []
  for (const t of tables) {
    jobs.push(async () => void results.set(`single ${t.single}`, await shard(t.single)))
    for (const g of t.groups) {
      for (const tag of g.tags) {
        jobs.push(async () => {
          const text = await shard(tag)
          if (g.merge !== null) writeFileSync(resolve(dir, rowFile(tag)), text)
          else results.set(`piece ${tag}`, text)
        })
      }
    }
  }
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(width, jobs.length) }, async () => {
      for (;;) {
        const i = next++
        if (i >= jobs.length) return
        await jobs[i]!()
      }
    }),
  )
  let bad = 0
  for (const t of tables) {
    const single = results.get(`single ${t.single}`)!
    const texts: string[] = []
    for (const g of t.groups) {
      texts.push(g.merge !== null ? (await mergeGroup(g, dir)).out : g.tags.map((tag) => results.get(`piece ${tag}`)!).join(''))
    }
    const split = texts.join('')
    const same = single === split && single.length > 0
    if (!same) bad++
    const pieces = t.groups.reduce((n, g) => n + g.tags.length, 0)
    console.log(`${same ? 'same' : 'DIFFERENT'}  ${t.single} (${pieces} pieces, ${single.length} bytes)`)
  }
  if (bad > 0) throw new Error(`${bad} cut table(s) are not the table a single process prints`)
}

/**
 * The three knobs that shrink a table. They exist so that the cut tables can be
 * diffed against the uncut ones on `ABYSS_RUNS` pulls a row (one in the build, two by hand; `ABYSS_VERIFY=1`), and a
 * sweep that read one of them would hand the bands a small table that looks
 * like the real one: the header names the pulls, and the bands do not read it.
 * So the only run that may see them is the one that says it is a verification.
 */
function refuseKnobs(): void {
  const set = ['ABYSS_RUNS', 'ABYSS_SPEC_RUNS', 'ABYSS_SPEC_BOSSES'].filter((n) => (process.env[n] ?? '') !== '')
  if (set.length > 0 && process.env.ABYSS_VERIFY !== '1') {
    throw new Error(`${set.join(', ')} shrink the tables and only ABYSS_VERIFY may be run with them; unset them for a sweep`)
  }
}

async function main(): Promise<void> {
  refuseKnobs()
  if (process.env.ABYSS_VERIFY === '1') {
    await verify()
    return
  }
  if (process.env.ABYSS_MERGE) {
    // The build's own step, run once after the chunks are back: rows in,
    // merged parts out, each in the slot its uncut table had.
    const dir = rowsDir()
    const have = existsSync(dir) ? readdirSync(dir).length : 0
    const want = counts.ABYSS_COUNT_RAW()
    if (have !== want) throw new Error(`${have} raw rows in ${dir}, wanted ${want}`)
    const parts = process.env.ABYSS_PARTS ?? '.'
    mkdirSync(parts, { recursive: true })
    for (const group of mergedGroups()) {
      const merged = await mergeGroup(group, dir)
      writeFileSync(resolve(parts, `part-${String(merged.at).padStart(3, '0')}.txt`), merged.out)
    }
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

  // A raw row's output is a row, not a piece of the file. It goes to its own
  // folder, never to `parts/`: the build counts `parts/` and a raw row there
  // would let the count pass with a part missing.
  const rowAt = todo.map(({ tag }, i) => ({ tag, i })).filter(({ tag }) => isRow(tag))
  const parts = process.env.ABYSS_PARTS

  // Numbered pieces on disk, for a run that is one of several machines; the
  // whole thing on stdout, for a run that is the only one. The pieces are
  // named by their place in `SHARDS`, so whoever pastes them back together
  // needs nothing but the numbers -- not which machine ran what, not how many
  // there were.
  if (parts) {
    mkdirSync(parts, { recursive: true })
    if (rowAt.length > 0) {
      const dir = rowsDir()
      mkdirSync(dir, { recursive: true })
      for (const { tag, i } of rowAt) writeFileSync(resolve(dir, rowFile(tag)), out[i]!)
    }
    todo.forEach(({ at, tag }, i) => {
      if (!isRow(tag)) writeFileSync(resolve(parts, `part-${String(at).padStart(3, '0')}.txt`), out[i]!)
    })
  } else {
    const pieces = todo.map(({ at, tag }, i) => ({ at, tag, text: out[i]! })).filter(({ tag }) => !isRow(tag))
    if (rowAt.length > 0) {
      // The only machine there is, so the rows are all here: merge them where
      // the cut tables sit in the file.
      const dir = mkdtempSync(resolve(tmpdir(), 'abyss-rows-'))
      for (const { tag, i } of rowAt) writeFileSync(resolve(dir, rowFile(tag)), out[i]!)
      for (const group of mergedGroups()) {
        const merged = await mergeGroup(group, dir)
        pieces.push({ at: merged.at, tag: group.single, text: merged.out })
      }
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

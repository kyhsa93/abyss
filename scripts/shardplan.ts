/**
 * How the sweep is cut, written down once for the two files that have to agree.
 *
 * `harness.ts` prints a table and `harnessrun.ts` deals its pieces out to
 * runners; the first has to know how many pieces a size cell was cut into to
 * pick its own, and the second to know what to ask for. Two copies of a number
 * are two numbers that drift, so this is the one, and `harness.ts` asserts the
 * counts that are about its own tables (`PARTIES`, `DRIVES`) rather than
 * trusting them.
 *
 * Nothing here is a result. A stale plan makes a run slower or longer to deal
 * and never changes a byte of output: every piece is put back by number.
 */

/** Rows of the composition table: one shard each. Asserted against `PARTIES`. */
export const COMPOSITION_ROWS = 7

/** Drives of a battleground row, times the maps: one shard each when split. */
export const BG_DRIVE_COUNT = 4

/** Rows of a reward table per boss (`played`, `idle`) when it is cut. */
export const REWARD_DRIVE_COUNT = 2

/**
 * Bosses whose mechanic rows are shards of their own (`mechanic:6:2`), the rest
 * staying one shard a boss. A row reads nothing from the one above it.
 */
export const MECHANIC_ROWS_SPLIT: readonly number[] = [6]

/** Bosses whose two reward rows are shards of their own (`reward:6:1`). */
export const REWARD_ROWS_SPLIT: readonly number[] = [6]

/** Whether the battleground table is a shard a row (`bg:1:3`) rather than one. */
export const BG_ROWS_SPLIT = true

/**
 * Boss rows cut by pull, boss index to pieces. The seventh boss alone is more
 * than a third of the table; a row is an average, so it is cut the way a size
 * cell is.
 */
export const BOSS_PIECES: Readonly<Record<number, number>> = { 6: 2 }

/**
 * Size cells cut by pull, not by row: a cell is one row, an average over its
 * pulls, so it cannot be pasted with `cat`. A piece prints the raw numbers of
 * every `k`th pull (`size:6:25:normal:2`) and the merge sums them in the
 * original order, which is what keeps the float sum bit for bit the one a
 * single process makes (see `pullsOf` in `harness.ts`).
 */
export const SIZE_PIECES: Readonly<Record<string, number>> = {
  'size:6:25:normal': 4,
  'size:4:25:normal': 2,
  'size:6:25:heroic': 3,
  'size:1:25:heroic': 2,
  'size:8:25:heroic': 2,
  'size:2:25:normal': 2,
  'size:6:10:normal': 2,
  'size:0:25:heroic': 2,
  'size:3:25:heroic': 2,
  'size:10:25:heroic': 2,
  'size:2:25:heroic': 2,
  'size:0:25:normal': 2,
  'size:4:25:heroic': 2,
}

/** The file a raw row is kept in: `spec:3` is `spec-03.txt`, a piece `size-6-25-normal-2.txt`. */
export function rowFile(tag: string): string {
  const spec = /^spec:(\d+)$/.exec(tag)
  if (spec) return `spec-${spec[1]!.padStart(2, '0')}.txt`
  return `${tag.replaceAll(':', '-')}.txt`
}

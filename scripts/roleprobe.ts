/**
 * How much a raid needs the player's slot to be filled, by lead and by boss, and
 * what a choice made at the input is worth (#369).
 *
 * One pull is the harness's reward pull: ten-man heroic, the player's slot given
 * to a lead and the other nine filled by role around it, with the slot driven
 * one of several ways. A table sets some of those ways side by side on the very
 * same seeds and prints the win rate of each and the differences.
 *
 *   idle         the body is still there and does nothing -- no movement, no
 *                presses. The reward table's `idle` row, same function.
 *   unattended   the slot is handed to the party AI (`unattended`).
 *   the rest     policies written at the input, in `policies.ts`, which says what
 *                each one is, what code it copies and how it is held to it.
 *
 * Tables, by name:
 *
 *   slot     idle, unattended                                          every lead
 *   auto     idle, auto                                                every lead
 *   tank     never (= auto), alwaysTaunt, swap, and a raid of one tank  tanks
 *   healer   auto, spend, autostill                                    healers
 *   ranged   fixed, keep, with damage dealt a minute                   the hunter
 *
 * A number printed is a second win rate minus a first, in points of win rate. It
 * says what the choice is worth for a slot driven the same way in both. It says
 * nothing about the lead's own skill, which is why `played` is not in any table:
 * the stand-in is rougher than the AI and would bias the difference downward.
 * The ranged table also prints damage dealt a minute, in the damage's own unit;
 * it is not in win-rate points and is not read against a line in win rate.
 *
 * This is a diagnostic and not a gate. It prints no table the harness prints,
 * `harness.ts` does not import it, and it is not in `check`, so no shard count
 * or build time moves with it. Nothing here reads a number: it prints the
 * difference and leaves the reading to whoever has the pool. The one thing it
 * does check is itself, before the first pull (`selfCheck`), and it stops with
 * an error if a policy is not what its comment says.
 *
 *   npm run roleprobe                       defaults below, a few pulls a cell
 *   ABYSS_PROBE_RUNS=40 ABYSS_PROBE_LEADS=warrior ABYSS_PROBE_BOSSES=0,1 npm run roleprobe
 *
 * Environment (all optional; an unusable value is an error rather than a quiet
 * default, so a typo cannot print a different table under the asked-for name):
 *   ABYSS_PROBE_RUNS         pulls a cell. Small by default because a pool of
 *                            ninety is hours on a core.
 *   ABYSS_PROBE_SEED_OFFSET  first pool index. Pull n of a cell uses seed
 *                            1000 + (offset + n) * 137 -- the reward table's
 *                            stride -- so one pool of forty at offset 0 and a
 *                            later one of ninety at offset 40 share no seed.
 *   ABYSS_PROBE_LEADS        comma-separated, from LEADS below.
 *   ABYSS_PROBE_BOSSES       comma-separated encounter indices, from 0.
 *   ABYSS_PROBE_TABLES       comma-separated, from TABLES below. A table is
 *                            printed for the leads asked for whose role it is
 *                            about; a column two tables share is pulled once.
 *
 * The attempt is the same in every column and is also what `unattended` is told.
 */
import { ENCOUNTERS } from '../src/sim/encounters'
import { pickFor, type ClassId, type Pick } from '../src/sim/classes'
import { standinParty, run, type RaidDrive } from './standin'
import { alwaysTaunt, auto, autostill, fixed, keep, oneTankParty, selfCheck, spend, swap, swapBosses, linedBosses } from './policies'

type Role = Parameters<typeof pickFor>[1]

/** The leads the question is asked of, with the role each is put in. Not all seventeen specs: that is cost. */
const LEADS: Record<string, { classId: ClassId; role: Role }> = {
  warrior: { classId: 'warrior', role: 'tank' },
  druid: { classId: 'druid', role: 'tank' },
  priest: { classId: 'priest', role: 'healer' },
  shaman: { classId: 'shaman', role: 'healer' },
  hunter: { classId: 'hunter', role: 'dps' },
}

const RAID_SIZE = 10
const DIFFICULTY = 'heroic'
const ATTEMPT = 0
const STRIDE = 137

/** A way the slot is driven, and whether the raid around it is the one-tank one. */
interface Drive {
  drive: RaidDrive
  oneTank?: boolean
}

/** Every way any table drives a slot, by the name the tables use. A pull is run once per name. */
const DRIVES: Record<string, Drive> = {
  idle: { drive: 'idle' },
  unattended: { drive: 'unattended' },
  auto: { drive: auto },
  autostill: { drive: autostill },
  alwaysTaunt: { drive: alwaysTaunt },
  swap: { drive: swap },
  // With no other tank to hand the boss to, `swap` is `auto`, so the raid is the only difference.
  oneTank: { drive: auto, oneTank: true },
  spend: { drive: spend },
  fixed: { drive: fixed },
  keep: { drive: keep },
}

interface Column {
  /** A name from DRIVES. */
  drive: string
  /** What the column is called in this table, where the table's own word for it is not the drive's. */
  label: string
  /** Only these fights are pulled for it; a dash everywhere else. */
  bosses?: (() => number[]) | undefined
}

interface Table {
  name: string
  /** The role it is about; every lead when absent. */
  role?: Role
  columns: Column[]
  /** Differences printed, as the indexes of the column taken from and the column taken away. */
  differences: Array<[number, number]>
  /** Also print damage dealt a minute, a column each and the difference. */
  dealt?: boolean
}

const col = (drive: string, label = drive, bosses?: () => number[]): Column => ({ drive, label, bosses })

/**
 * In print order. `never` is `auto`, under the name the question calls it: the
 * AUTO tank does not hand the boss over (`policies.ts`). The drive is the same,
 * so a pull is made once and printed under both names.
 *
 * `swap` is pulled only where it can differ from `never`, which is where a body
 * holding the boss carries a count (`linedBosses`); everywhere else it is the
 * same function and a dash is printed rather than a difference that is zero by
 * construction. `oneTank` is pulled where the code says a raid with one tank
 * cannot answer (`swapBosses`), against `never`: the same lead, the same AUTO
 * tank, one tank fewer around it.
 */
const TABLES: Table[] = [
  { name: 'slot', columns: [col('idle'), col('unattended')], differences: [[1, 0]] },
  { name: 'auto', columns: [col('idle'), col('auto')], differences: [[1, 0]] },
  {
    name: 'tank',
    role: 'tank',
    columns: [col('auto', 'never'), col('alwaysTaunt'), col('swap', 'swap', linedBosses), col('oneTank', 'oneTank', swapBosses)],
    differences: [
      [1, 0],
      [2, 0],
      [3, 0],
    ],
  },
  {
    name: 'healer',
    role: 'healer',
    columns: [col('auto'), col('spend'), col('autostill')],
    differences: [
      [0, 1],
      [0, 2],
    ],
  },
  { name: 'ranged', role: 'dps', columns: [col('fixed'), col('keep')], differences: [[1, 0]], dealt: true },
]

const whole = (name: string, fallback: number, min: number): number => {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < min) throw new Error(`${name} is "${raw}": it is a whole number of at least ${min}`)
  return n
}

const list = (name: string): string[] | null => {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return null
  return raw.split(',').map((x) => x.trim())
}

const RUNS = whole('ABYSS_PROBE_RUNS', 4, 1)
const OFFSET = whole('ABYSS_PROBE_SEED_OFFSET', 0, 0)

const leads = list('ABYSS_PROBE_LEADS') ?? Object.keys(LEADS)
for (const l of leads) {
  if (LEADS[l] === undefined) throw new Error(`ABYSS_PROBE_LEADS has "${l}": it is one of ${Object.keys(LEADS).join(', ')}`)
}

const bosses = (list('ABYSS_PROBE_BOSSES') ?? ENCOUNTERS.map((_, i) => String(i))).map((x) => {
  const i = Number(x)
  if (!Number.isInteger(i) || i < 0 || i >= ENCOUNTERS.length) {
    throw new Error(`ABYSS_PROBE_BOSSES has "${x}": it is an index from 0 to ${ENCOUNTERS.length - 1}`)
  }
  return i
})

const asked = list('ABYSS_PROBE_TABLES') ?? TABLES.map((t) => t.name)
for (const a of asked) {
  if (!TABLES.some((t) => t.name === a)) {
    throw new Error(`ABYSS_PROBE_TABLES has "${a}": it is one of ${TABLES.map((t) => t.name).join(', ')}`)
  }
}

// First line, so a log says which machine and which pool it is before any
// number: the same pool on another architecture is not the same pool (#350).
console.log(
  `ROLEPROBE all ${process.arch}/${process.platform} node ${process.version} ` +
    `size ${RAID_SIZE} ${DIFFICULTY} attempt ${ATTEMPT} runs ${RUNS} seed-offset ${OFFSET} ` +
    `leads ${leads.join(',')} bosses ${bosses.join(',')} tables ${asked.join(',')}`,
)
console.log(`policy self-check: ${selfCheck()} things asked`)

/** What one cell of one drive came to over its pulls. */
interface Cell {
  wins: number
  damage: number
  seconds: number
}

const parties = new Map<string, Pick[]>()
const partyFor = (lead: string, oneTank: boolean): Pick[] => {
  const key = `${lead}/${oneTank}`
  let party = parties.get(key)
  if (party === undefined) {
    const { classId, role } = LEADS[lead]!
    const pick = pickFor(classId, role)
    if (pick === null) throw new Error(`${classId} has no ${role} spec`)
    party = oneTank ? oneTankParty(RAID_SIZE, pick) : standinParty(RAID_SIZE, pick)
    parties.set(key, party)
  }
  return party
}

const cells = new Map<string, Cell>()
const pull = (lead: string, e: number, name: string): Cell => {
  const key = `${lead}/${e}/${name}`
  let c = cells.get(key)
  if (c === undefined) {
    const { drive, oneTank } = DRIVES[name]!
    const party = partyFor(lead, oneTank === true)
    c = { wins: 0, damage: 0, seconds: 0 }
    for (let n = 0; n < RUNS; n++) {
      const r = run(1000 + (OFFSET + n) * STRIDE, ATTEMPT, party, DIFFICULTY, e, drive)
      if (r.outcome === 'victory') c.wins++
      c.damage += r.playerDamage
      c.seconds += r.time
    }
    cells.set(key, c)
  }
  return c
}

const points = (a: Cell, b: Cell): string => {
  const d = ((a.wins - b.wins) / RUNS) * 100
  return `${d >= 0 ? '+' : ''}${d.toFixed(0)}`
}

const perMinute = (c: Cell): number => c.damage / Math.max(1, c.seconds / 60)

const signed = (d: number): string => `${d >= 0 ? '+' : ''}${d.toFixed(0)}`

for (const table of TABLES) {
  if (!asked.includes(table.name)) continue
  const who = leads.filter((l) => table.role === undefined || LEADS[l]!.role === table.role)
  if (who.length === 0) {
    console.log(`table ${table.name}: none of the leads asked for is a ${table.role}`)
    continue
  }
  const width = Math.max(10, ...table.columns.map((c) => c.label.length + 2))
  const names = (i: number): string => table.columns[i]!.label
  console.log(`table ${table.name}  (differences: win-rate points, first minus second)`)
  console.log(
    'lead      boss                   ' +
      table.columns.map((c) => c.label.padEnd(width)).join('') +
      table.differences.map(([a, b]) => `${names(a)}-${names(b)}`.padEnd(width + 6)).join('') +
      (table.dealt === true
        ? `dealt/min ${table.columns.map((c) => c.label.padEnd(width)).join('')}${names(1)}-${names(0)}`
        : ''),
  )
  for (const name of who) {
    for (const e of bosses) {
      // A column that is only pulled for some fights is not pulled for this one.
      const got = table.columns.map((c) => (c.bosses === undefined || c.bosses().includes(e) ? pull(name, e, c.drive) : null))
      const wins = (c: Cell | null): string => (c === null ? '-' : `${c.wins}/${RUNS}`)
      console.log(
        `${name}`.padEnd(10) +
          `${ENCOUNTERS[e]!.name}`.padEnd(23) +
          got.map((c) => wins(c).padEnd(width)).join('') +
          table.differences
            .map(([a, b]) => (got[a] === null || got[b] === null ? '-' : points(got[a]!, got[b]!)).padEnd(width + 6))
            .join('') +
          (table.dealt === true
            ? ''.padEnd(10) +
              got.map((c) => (c === null ? '-' : perMinute(c).toFixed(0)).padEnd(width)).join('') +
              signed(perMinute(got[1]!) - perMinute(got[0]!))
            : ''),
      )
    }
  }
}

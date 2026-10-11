/**
 * How much a raid needs the player's slot to be filled, by lead and by boss (#369).
 *
 * One pull is the harness's reward pull: ten-man heroic, the player's slot given
 * to a lead and the other nine filled by role around it, with the slot driven
 * one of two ways.
 *
 *   idle         the body is still there and does nothing -- no movement, no
 *                presses. The reward table's `idle` row, same function.
 *   unattended   the slot is handed to the party AI (`unattended`).
 *
 * The number printed is the second win rate minus the first, in points of win
 * rate. It is what the slot is worth when somebody competent fills it and the
 * body would otherwise stand there. It says nothing about the lead's own
 * skill, which is why `played` is not in this table: the stand-in is rougher
 * than the AI and would bias the difference downward.
 *
 * This is a diagnostic and not a gate. It prints no table the harness prints,
 * `harness.ts` does not import it, and it is not in `check`, so no shard count
 * or build time moves with it. Nothing here reads a number: it prints the
 * difference and leaves the reading to whoever has the pool.
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
 *
 * The attempt is the same in both rows and is also what `unattended` is told.
 */
import { ENCOUNTERS } from '../src/sim/encounters'
import { pickFor, type ClassId } from '../src/sim/classes'
import { standinParty, run, type RaidDrive } from './standin'

/** The leads the question is asked of, with the role each is put in. Not all seventeen specs: that is cost. */
const LEADS: Record<string, { classId: ClassId; role: Parameters<typeof pickFor>[1] }> = {
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

/** The two ways the slot is driven, in print order. The difference is the second minus the first. */
const DRIVES: [RaidDrive, RaidDrive] = ['idle', 'unattended']

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

// First line, so a log says which machine and which pool it is before any
// number: the same pool on another architecture is not the same pool (#350).
console.log(
  `ROLEPROBE all ${process.arch}/${process.platform} node ${process.version} ` +
    `size ${RAID_SIZE} ${DIFFICULTY} attempt ${ATTEMPT} runs ${RUNS} seed-offset ${OFFSET} ` +
    `leads ${leads.join(',')} bosses ${bosses.join(',')}`,
)
console.log(
  `lead      boss                   ${DRIVES[0].padEnd(8)}${DRIVES[1].padEnd(12)}difference (win-rate points, ${DRIVES[1]} minus ${DRIVES[0]})`,
)

for (const name of leads) {
  const { classId, role } = LEADS[name]!
  const lead = pickFor(classId, role)
  if (lead === null) throw new Error(`${classId} has no ${role} spec`)
  const party = standinParty(RAID_SIZE, lead)
  for (const e of bosses) {
    const won: number[] = []
    for (const drive of DRIVES) {
      let wins = 0
      for (let n = 0; n < RUNS; n++) {
        if (run(1000 + (OFFSET + n) * STRIDE, ATTEMPT, party, DIFFICULTY, e, drive).outcome === 'victory') wins++
      }
      won.push(wins)
    }
    const points = ((won[1]! - won[0]!) / RUNS) * 100
    console.log(
      `${name}`.padEnd(10) +
        `${ENCOUNTERS[e]!.name}`.padEnd(23) +
        `${won[0]}/${RUNS}`.padEnd(8) +
        `${won[1]}/${RUNS}`.padEnd(12) +
        `${points >= 0 ? '+' : ''}${points.toFixed(0)}`,
    )
  }
}

/**
 * A fight, run in Node, with no browser anywhere.
 *
 * The harness design said four of its six kinds of check should not need one —
 * data, rules, geometry, determinism — and two of those had nowhere to live:
 * every rule was inside `main()`, in the same closure as the canvas, so
 * "is the combat arithmetic right" could only be asked by starting Chromium
 * and playing the game.
 *
 * This asks it directly.  It reads the baked world off disk, builds the player
 * the way the scene does, and runs several hundred fights through the same
 * functions — which is also what makes the numbers *reproducible*: the stream
 * of chance is seeded here, so the same seed gives the same table twice.
 */
import { readFileSync } from 'node:fs'
import { duel } from '../src/sim/duel.ts'
import { reseed } from '../src/sim/roll.ts'
import { armourOf, attackPower, maxHealth } from '../src/sim/stats.ts'
import { withGear, K_LO, K_HI, K_DELAY, K_ARMOUR } from '../src/sim/gear.ts'

let bad = 0
const check = (what, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? `   -> ${detail}` : ''}`)
  if (!ok) bad++
}

const world = (name) =>
  JSON.parse(readFileSync(`public/world/${name}.json`, 'utf8'))
const who = world('player')
const spawns = world('npcs')
const book = world('spells')

/** The player at a level, exactly the way `main.ts` builds him. */
const player = (level) => {
  const stats = withGear(who.stats[String(level)], [])
  // By name, not by number.  These indices were written out by hand here and
  // again in `main.ts`, and when the kit grew an entry id on the front only
  // one of them moved: this went on summing field four, which had been armour
  // and was now the swing in milliseconds, and handed a level-one warrior
  // 2,900 armour.  `K_*` lives beside the item constants in `sim/gear.ts`.
  const weapon = (who.kit ?? []).find((k) => k[K_LO] > 0)
    ?? [0, 'weapon', 3, 5, 2900, 0, 17]
  const worn = (who.kit ?? []).reduce((n, k) => n + k[K_ARMOUR], 0)
  const secs = weapon[K_DELAY] / 1000
  const ap = (attackPower(level, stats) / 14) * secs
  return {
    level, stats,
    line: [maxHealth(stats), Math.round(weapon[K_LO] + ap),
      Math.round(weapon[K_HI] + ap), weapon[K_DELAY], armourOf(stats, worn), 0],
  }
}

/** A creature of a level, taken off the spawn list rather than invented. */
const creature = (level) => {
  const row = (spawns.npcs ?? []).find((n) => n[4] === level && n[7] >= 0)
  const line = row ? spawns.fights[row[7]] : [60, 3, 5, 2000, 20, 2]
  return { level, stats: [0, 0, 0, 0, 0, 0], line }
}

const heroic = (book.spells ?? []).find((s) => s.id === 78)
const opener = heroic
  ? { rage: heroic.rage, adds: heroic.does.find((d) => d[0] === 58)?.[1] ?? 0 }
  : undefined

console.log('a fight, run without a browser\n')
console.log(`     ${'against'.padEnd(12)}${'policy'.padEnd(8)}${'survived'.padStart(9)}`
  + `${'seconds'.padStart(9)}${'presses'.padStart(9)}`)
const table = []
for (const [level, many] of [[1, 1], [3, 1], [3, 2], [5, 1]]) {
  for (const policy of ['auto', 'rota']) {
    reseed(20260913)
    const got = duel(player(1), creature(level), who,
      { many, runs: 400, policy, opener })
    table.push({ level, many, policy, ...got })
    console.log(`     ${`level ${level} x${many}`.padEnd(12)}${policy.padEnd(8)}`
      + `${`${(got.survived * 100).toFixed(0)}%`.padStart(9)}`
      + `${got.seconds.toFixed(1).padStart(9)}${got.presses.toFixed(1).padStart(9)}`)
  }
}
console.log()

const at = (level, many, policy) =>
  table.find((r) => r.level === level && r.many === many && r.policy === policy)

check('a level one beats a level one', at(1, 1, 'auto').survived > 0.9,
  `${(at(1, 1, 'auto').survived * 100).toFixed(0)}% survived`)
check('and pressing something beats pressing nothing',
  at(5, 1, 'rota').survived > at(5, 1, 'auto').survived + 0.25,
  `against a level 5: ${(at(5, 1, 'auto').survived * 100).toFixed(0)}% vs `
  + `${(at(5, 1, 'rota').survived * 100).toFixed(0)}%`)
check('and two is worse than one',
  at(3, 2, 'auto').survived < at(3, 1, 'auto').survived - 0.3,
  `${(at(3, 1, 'auto').survived * 100).toFixed(0)}% vs `
  + `${(at(3, 2, 'auto').survived * 100).toFixed(0)}%`)

// And the thing a browser could never check: the same seed gives the same
// table.  A distribution nobody can run twice is a distribution nobody can
// trust.
reseed(20260913)
const once = duel(player(1), creature(3), who, { many: 1, runs: 200 })
reseed(20260913)
const twice = duel(player(1), creature(3), who, { many: 1, runs: 200 })
check('and the same seed gives the same fight',
  once.won === twice.won && once.seconds === twice.seconds,
  `${once.won} and ${twice.won} won of 200, ${once.seconds.toFixed(2)}s each`)

console.log(bad ? `${bad} FAILED` : 'all checks passed')
process.exit(bad ? 1 : 0)

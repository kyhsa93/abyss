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

import { standing } from '../src/sim/pools.ts'

const world = (name) =>
  JSON.parse(readFileSync(`public/world/${name}.json`, 'utf8'))
const roster = world('player')
/**
 * The warrior, because a duel is a melee fight and the hit table is his.
 *
 * `player.json` is a roster now — one entry a class, keyed on the class id —
 * and this file simulates the one class whose whole fight is swinging.  The
 * five that cast are a different simulation and not this one; what would be
 * dishonest is averaging them.
 */
const WARRIOR = 1
const who = roster.classes[String(WARRIOR)]
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

const heroic = (book.books?.[String(WARRIOR)] ?? []).find((s) => s.id === 78)
const opener = heroic
  ? { rage: heroic.cost, adds: heroic.does.find((d) => d[0] === 58)?.[1] ?? 0 }
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

// --- the world is not the same world twice ---------------------------------
//
// Issue 193: `pool_creature` says several spawn points share one slot and
// `pool_template.max_limit` says how many stand at once — and which of them
// stood was *the first `most` in file order*, which is a constant.  The same
// rare spawn on the same rock every time the page was opened, for ever.
//
// Checked here rather than in a browser because the claim is about a
// function: **the standing set is a function of the clock**, and a check that
// can only see one moment cannot test a function.  The numbers are the baked
// world's own — the pools, their members, and the period each one turns on,
// which is the members' own `spawntimesecs`.
{
  const moves = spawns.moves ?? []
  const pools = new Map()
  for (const r of spawns.npcs ?? []) {
    const pool = r[12] ?? 0
    if (!pool) continue
    const way = moves[r[10] ?? -1] ?? []
    const got = pools.get(pool) ?? { members: [], most: r[13] ?? 0, period: way[4] ?? 0 }
    got.members.push(got.members.length)
    pools.set(pool, got)
  }
  check('the world has shared slots in it', pools.size > 0,
    `${pools.size} pools over ${[...pools.values()]
      .reduce((n, p) => n + p.members.length, 0)} spawns`)

  // A day, walked in ten-minute steps: the set has to move more than once or
  // "it turns" is a claim about a thing that does not turn.
  const DAY = 86400, STEP = 600, FROM = 1_800_000_000
  let mostSets = 0
  const worlds = new Set()
  for (const [, p] of pools) {
    const seen = new Set()
    for (let at = FROM; at < FROM + DAY; at += STEP) {
      seen.add(standing(p.members, p.most, p.period, at).join(','))
    }
    mostSets = Math.max(mostSets, seen.size)
  }
  for (let at = FROM; at < FROM + DAY; at += STEP) {
    worlds.add([...pools.values()]
      .map((p) => standing(p.members, p.most, p.period, at).join(',')).join('|'))
  }
  check('and a day does not find the same world twice', worlds.size >= 2,
    `${worlds.size} different worlds over a day, `
    + `the busiest pool showing ${mostSets} sets`)

  // And the other half, which is the one that keeps the first honest: the
  // same moment is the same world.  A world that rolled itself at load would
  // pass the check above and be exactly the bug this repository's one stream
  // of chance exists to prevent.
  const twiceSame = [...pools.values()].every((p) =>
    standing(p.members, p.most, p.period, FROM).join(',')
    === standing(p.members, p.most, p.period, FROM).join(','))
  const nextTurn = [...pools.values()].some((p) =>
    standing(p.members, p.most, p.period, FROM).join(',')
    !== standing(p.members, p.most, p.period, FROM + p.period).join(','))
  check('and the same moment is always the same world',
    twiceSame && nextTurn,
    twiceSame ? 'and one period on is a different one' : 'it rolled itself')

  // And nothing stands that the data did not allow to stand.
  const overfull = [...pools.entries()].filter(([, p]) =>
    standing(p.members, p.most, p.period, FROM).length
      > Math.min(p.most || p.members.length, p.members.length))
  check('and never more of a slot than max_limit allows',
    overfull.length === 0,
    overfull.map(([id]) => id).join(', ')
    || [...pools.entries()].map(([id, p]) =>
      `${id}: ${p.most} of ${p.members.length}`).join(', '))
}

console.log(bad ? `${bad} FAILED` : 'all checks passed')
process.exit(bad ? 1 : 0)

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
import { armourOf, attackPower, healPerTick, maxHealth, MAX_RAGE, RAGE_LOST_PER_TICK, REGEN_TICK, SPIRIT_BAND } from '../src/sim/stats.ts'
import { rageFrom, RAGE_PER_SECOND_OF_SWING } from '../src/sim/fight.ts'
import { withGear, K_LO, K_HI, K_DELAY, K_ARMOUR } from '../src/sim/gear.ts'

let bad = 0
const check = (what, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? `   -> ${detail}` : ''}`)
  if (!ok) bad++
}

import { standing } from '../src/sim/pools.ts'
import { between, roll, seed } from '../src/sim/roll.ts'
import { book as ledgerOf, killed, take } from '../src/sim/quest.ts'
import { speak } from '../src/talk.ts'
import { riseChance, short as lacking, skinAsks, R_GREY, R_MAKES, R_NEEDS, R_YELLOW } from '../src/sim/trades.ts'
import { discountOf, paidBy, rankFloor, rankOf, standAfter, EXALTED, FRIENDLY, NEUTRAL, UNFRIENDLY } from '../src/sim/rep.ts'

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

/**
 * The bar, as the automatic hand walks it: every ability a level one warrior
 * has that puts something on the next swing, cheapest first.
 *
 * **A list and not one ability**, because issue 224 made the automatic hand
 * walk the bar left to right and the simulation has to be the same rule — a
 * `rota` that presses one thing is a stand-in for a bar with no arrangement,
 * which is what there was.
 *
 * Cheapest first here and not "best", because the order is the *player's* and
 * this file must not decide it: what is being measured is that pressing beats
 * not pressing, and any order the player could actually arrange will do.
 */
const E_WEAPON_ADD = 58
const bar = (book.books?.[String(WARRIOR)] ?? [])
  .filter((s) => s.level <= 1 && s.cost > 0
    && s.does?.some((d) => d[0] === E_WEAPON_ADD))
  .map((s) => ({ rage: s.cost,
    adds: s.does.find((d) => d[0] === E_WEAPON_ADD)?.[1] ?? 0 }))
  .sort((a, b) => a.rage - b.rage)
const opener = bar[0]

/**
 * A share of fights, with the error it carries.
 *
 * Issue 109 closed with the table below printing shares and nothing else,
 * under an issue whose last paragraph was *always report the sample size and
 * the expected error* — because the old abyss chased differences inside ±18
 * points at thirty runs a row and took them for findings.  The standard error
 * of a proportion, `sqrt(p (1 - p) / n)`; it is nought at nought and at a
 * hundred per cent, which is the normal approximation being generous at the
 * ends and not a certainty.
 */
const RUNS = 400
const se = (p, n = RUNS) => Math.sqrt(p * (1 - p) / n)
const rate = (p, n = RUNS) =>
  `${(p * 100).toFixed(1)}% ±${(se(p, n) * 100).toFixed(1)}`

console.log('a fight, run without a browser\n')
console.log(`     ${'against'.padEnd(12)}${'policy'.padEnd(8)}${'survived'.padStart(9)}`
  + `${'± se'.padStart(7)}${'seconds'.padStart(9)}${'presses'.padStart(9)}`)
const table = []
for (const [level, many] of [[1, 1], [3, 1], [3, 2], [5, 1]]) {
  for (const policy of ['auto', 'rota']) {
    reseed(20260913)
    const got = duel(player(1), creature(level), who,
      { many, runs: RUNS, policy, bar })
    table.push({ level, many, policy, ...got })
    console.log(`     ${`level ${level} x${many}`.padEnd(12)}${policy.padEnd(8)}`
      + `${`${(got.survived * 100).toFixed(0)}%`.padStart(9)}`
      + `${`±${(se(got.survived) * 100).toFixed(1)}`.padStart(7)}`
      + `${got.seconds.toFixed(1).padStart(9)}${got.presses.toFixed(1).padStart(9)}`)
  }
}
console.log(`     (${RUNS} fights a row; ± is one standard error)\n`)

const at = (level, many, policy) =>
  table.find((r) => r.level === level && r.many === many && r.policy === policy)

check('a level one beats a level one', at(1, 1, 'auto').survived > 0.9,
  `${rate(at(1, 1, 'auto').survived)} survived`)
check('and pressing something beats pressing nothing',
  at(5, 1, 'rota').survived > at(5, 1, 'auto').survived + 0.25,
  `against a level 5: ${rate(at(5, 1, 'auto').survived)} vs `
  + `${rate(at(5, 1, 'rota').survived)}`)
check('and two is worse than one',
  at(3, 2, 'auto').survived < at(3, 1, 'auto').survived - 0.3,
  `${rate(at(3, 1, 'auto').survived)} vs ${rate(at(3, 2, 'auto').survived)}`)

// **Auto-attack alone beats its own level and nothing four above it**, at
// every level of the slice.  Issue 109's first line was *auto-attack alone
// cannot reach level ten* — the check the wiki called this project's win-rate
// test — and its closing comment answered it honestly: with a graveyard to
// run back from, killing level ones for ever gets there.  What it measured
// instead, *it beats its own level and cannot get past four above*, was one
// row of the table above at level one and never an assertion.  So it is
// asserted wherever the world has a creature of that level, and a rate only
// counts when it clears one half by three standard errors — "cannot beat" is
// losing more fights than it wins, and a bar tighter than that would be a
// number picked here.
{
  const [lo, hi] = roster.levels
  const stands = (level) =>
    (spawns.npcs ?? []).some((n) => n[4] === level && n[7] >= 0)
  const rows = []
  for (let level = lo; level <= hi; level++) {
    for (const up of [0, 4]) {
      if (!stands(level + up)) continue
      reseed(20260913)
      const got = duel(player(level), creature(level + up), who,
        { many: 1, runs: RUNS, policy: 'auto' })
      rows.push({ level, up, p: got.survived })
    }
  }
  const own = rows.filter((r) => r.up === 0)
  const above = rows.filter((r) => r.up === 4)
  const said = (r) => `${r.level}${r.up ? ` vs ${r.level + r.up}` : ''} ${rate(r.p)}`
  check('auto-attack alone beats its own level at every level of the slice',
    own.length > 0 && own.every((r) => r.p - 3 * se(r.p) > 0.5),
    own.map(said).join(', '))
  check('and cannot beat anything four levels above it at any of them',
    above.length > 0 && above.every((r) => r.p + 3 * se(r.p) < 0.5),
    `${above.map(said).join(', ')} — levels with nothing four above them `
    + `standing here: ${hi - lo + 1 - above.length}`)
}

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
    const got = pools.get(pool) ?? { id: pool, members: [], most: r[13] ?? 0, period: way[4] ?? 0 }
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
      seen.add(standing(p.id, p.members, p.most, p.period, at).join(','))
    }
    mostSets = Math.max(mostSets, seen.size)
  }
  for (let at = FROM; at < FROM + DAY; at += STEP) {
    worlds.add([...pools.values()]
      .map((p) => standing(p.id, p.members, p.most, p.period, at).join(',')).join('|'))
  }
  check('and a day does not find the same world twice', worlds.size >= 2,
    `${worlds.size} different worlds over a day, `
    + `the busiest pool showing ${mostSets} sets`)

  // And the other half, which is the one that keeps the first honest: the
  // same moment is the same world.  A world that rolled itself at load would
  // pass the check above and be exactly the bug this repository's one stream
  // of chance exists to prevent.
  const twiceSame = [...pools.values()].every((p) =>
    standing(p.id, p.members, p.most, p.period, FROM).join(',')
    === standing(p.id, p.members, p.most, p.period, FROM).join(','))
  const nextTurn = [...pools.values()].some((p) =>
    standing(p.id, p.members, p.most, p.period, FROM).join(',')
    !== standing(p.id, p.members, p.most, p.period, FROM + p.period).join(','))
  check('and the same moment is always the same world',
    twiceSame && nextTurn,
    twiceSame ? 'and one period on is a different one' : 'it rolled itself')

  // **And two pools of the same shape are not the same pool.**  Issue 88 asked
  // for `(world seed, pool id, respawn cycle)` and what shipped mixed the
  // member's index within its pool with the cycle — no pool anywhere in it —
  // while the comment above the function said the pool's id was the whole of
  // it.  So every herb pool of three on a five-minute period rose the same
  // member at the same moment as every other one, all over the forest.
  //
  // The herbs and the ore are where it shows, so they are read too: fifty
  // node pools against four creature ones, and the shapes repeat.  A pair
  // agreeing on a turn is chance; agreeing on **every** turn of a day is the
  // bug.  Only pools that choose — fewer standing than there are members —
  // because a pool that stands everybody has one answer and so does its twin.
  {
    const things = world('objects')
    const all = [...pools.values()]
    const nodes = new Map()
    for (const r of things.objects ?? []) {
      const pool = r[9] ?? 0
      if (!pool) continue
      const got = nodes.get(pool) ?? { id: pool, members: [],
        most: things.pools?.[String(pool)] ?? 0, period: r[6] ?? 0 }
      got.members.push(got.members.length)
      nodes.set(pool, got)
    }
    all.push(...nodes.values())
    const shapes = new Map()
    for (const p of all) {
      if (!p.period || !(p.most > 0 && p.most < p.members.length)) continue
      const k = `${p.members.length}/${p.most}/${p.period}`
      shapes.set(k, [...(shapes.get(k) ?? []), p])
    }
    let pairs = 0, lockstep = [], closest = 0
    for (const [k, same] of shapes) {
      for (let i = 0; i < same.length; i++) {
        for (let j = i + 1; j < same.length; j++) {
          const a = same[i], c = same[j]
          let agree = 0, turns = 0
          for (let at = FROM; at < FROM + DAY; at += a.period) {
            turns++
            if (standing(a.id, a.members, a.most, a.period, at).join(',')
              === standing(c.id, c.members, c.most, c.period, at).join(',')) agree++
          }
          pairs++
          closest = Math.max(closest, agree / turns)
          if (agree === turns) lockstep.push(`${a.id}~${c.id} (${k})`)
        }
      }
    }
    check('and two pools of the same shape do not stand in lockstep over a day',
      pairs > 0 && lockstep.length === 0,
      lockstep.length ? `${lockstep.length} of ${pairs} pairs agree on every turn: `
        + lockstep.slice(0, 4).join(', ')
        : `${pairs} same-shaped pairs over ${all.length} pools, the closest `
        + `agreeing on ${(closest * 100).toFixed(0)}% of a day's turns`)
  }

  // And nothing stands that the data did not allow to stand.
  const overfull = [...pools.entries()].filter(([, p]) =>
    standing(p.id, p.members, p.most, p.period, FROM).length
      > Math.min(p.most || p.members.length, p.members.length))
  check('and never more of a slot than max_limit allows',
    overfull.length === 0,
    overfull.map(([id]) => id).join(', ')
    || [...pools.entries()].map(([id, p]) =>
      `${id}: ${p.most} of ${p.members.length}`).join(', '))
}

// --- a conversation that depends on who is having it -----------------------
//
// Issue 195: `conditions` is the table that says *this line only to a rogue*
// and it was read by nothing, so every person in this world said the same
// thing to everybody.  276 of its rows touch this slice and 172 of those are
// about the class.
//
// Checked without a browser because `talk.ts` has never needed one — it takes
// numbers and returns sentences — and because the two creatures worth asking
// about are indoors, where nothing outside can walk to them.
{
  const topics = spawns.topics ?? []
  const only = topics.filter((t) => t.only?.length)
  const says = topics.filter((t) => (t.says ?? 1) > 1)
  check('conversations depend on who is having them',
    only.length > 0 && says.length > 0,
    `${only.length} of ${topics.length} topics single somebody out, `
    + `${says.length} have more than one thing to say`)

  // A listener who meets a condition and one who does not, through the same
  // topic.  The rogue trainer's menu names class mask 8 — the rogue — and the
  // mage's names 128.
  const person = (cls) => ({
    cls, race: 1, level: 10, skills: { 182: 1 }, quest: () => 'none',
  })
  const asked = (t, cls) => speak('townsfolk', 'trainer', 20, 7, t,
    () => [], person(cls), 0).options.length
  const classed = only.find((t) =>
    t.only.some(([k, v]) => k === 15 && [1, 2, 4, 5, 8, 9]
      .some((c) => v === (1 << (c - 1)))))
  const who = classed?.only.find(([k]) => k === 15)?.[1] ?? 0
  const mine = [1, 2, 4, 5, 8, 9].find((c) => who & (1 << (c - 1))) ?? 1
  const other = [1, 2, 4, 5, 8, 9].find((c) => !(who & (1 << (c - 1)))) ?? 1
  check('and a conditioned line is there for the one it names',
    !!classed && asked(classed, mine) > asked(classed, other),
    classed ? `class ${mine} hears ${asked(classed, mine)} options, `
      + `class ${other} hears ${asked(classed, other)}`
      : 'no class condition in the slice')

  // And the other half, which is the one that matters: **it is not there for
  // somebody it does not name.**  A condition that is always true is not a
  // condition, and that is what reading the table's own complement rows as
  // conditions produced — the first-aid trainer congratulating a rogue with no
  // first aid on his handiwork.
  const every = only.every((t) => {
    const a = asked(t, 1), b = asked(t, 8)
    return a >= 0 && b >= 0
  })
  const sometimes = only.filter((t) => asked(t, 1) !== asked(t, 8))
  check('and not there for somebody it does not', every && sometimes.length > 0,
    `${sometimes.length} of ${only.length} topics answer a warrior and a mage `
    + 'differently')

  // Two conversations with the same person are not the same conversation —
  // for the ones the original gives more than one line to, and only those.
  const varies = says.filter((t) => {
    const a = speak('townsfolk', 'trainer', 20, 7, t, () => [], person(1), 0)
    const b = speak('townsfolk', 'trainer', 20, 7, t, () => [], person(1), 1)
    return a.greet !== b.greet
  })
  const fixed = topics.filter((t) => (t.says ?? 1) === 1).slice(0, 20)
    .every((t) => speak('townsfolk', 'trainer', 20, 7, t, () => [], person(1), 0)
      .greet === speak('townsfolk', 'trainer', 20, 7, t, () => [], person(1), 1)
      .greet)
  check('and speaking twice to one of them says two things',
    varies.length === says.length && fixed,
    `${varies.length} of ${says.length} vary, and the ones the original gives `
    + `one line to ${fixed ? 'do not' : 'vary anyway, which is ours and not theirs'}`)
}

// Trades, which are arithmetic before they are a window.
{
  const craft = world('trades')
  const items = world('items').items
  const trades = Object.entries(craft.trades)
  check('every trade this game teaches has somebody here to teach it',
    trades.length > 0 && trades.every(([, t]) => t.at.length > 0),
    trades.map(([id, t]) => `${t.word} ${t.at.length}`).join(', '))
  check('and a ceiling it can actually be taken to',
    trades.every(([, t]) => t.cap >= 75 && t.ranks.length > 0),
    trades.map(([, t]) => `${t.word} ${t.cap}`).join(', '))
  // Every recipe's two ends have a row, which `items.py` asserts on the other
  // side of the bake — here off the two shipped files rather than off the
  // script that wrote them, so it is two derivations agreeing.
  const loose = craft.recipes.filter((r) =>
    !items[String(r[R_MAKES])]
    || r[R_NEEDS].some(([e]) => !items[String(e)]))
  check('and every recipe names things this world has rows for',
    loose.length === 0,
    `${craft.recipes.length} recipes, ${loose.length} loose`)

  // The skill-up curve, which is `Player::CraftSkillGainChance` and has to
  // come out at its own two ends.
  const r = craft.recipes.find((x) => x[R_GREY] > x[R_YELLOW])
  check('a recipe at its yellow rank always might teach you something',
    riseChance(r[R_YELLOW], r[R_YELLOW], r[R_GREY]) === 1000,
    `rank ${r[R_YELLOW]} of ${r[R_GREY]} -> 100.0%`)
  check('and one at its grey rank never does',
    riseChance(r[R_GREY], r[R_YELLOW], r[R_GREY]) === 0
    && riseChance(r[R_GREY] + 40, r[R_YELLOW], r[R_GREY]) === 0,
    `rank ${r[R_GREY]} of ${r[R_GREY]} -> 0.0%`)
  const mid = Math.round((r[R_YELLOW] + r[R_GREY]) / 2)
  check('and the green rank in between is the half-way house',
    Math.abs(riseChance(mid, r[R_YELLOW], r[R_GREY]) - 500) <= 20,
    `rank ${mid} -> ${(riseChance(mid, r[R_YELLOW], r[R_GREY]) / 10).toFixed(1)}%`)
  check('and the chance never rises with the skill',
    [...Array(60).keys()].every((i) =>
      riseChance(r[R_YELLOW] + i, r[R_YELLOW], r[R_GREY])
      >= riseChance(r[R_YELLOW] + i + 1, r[R_YELLOW], r[R_GREY])),
    'monotone from yellow to grey')

  // And the gate on a corpse, which this game read off the wrong line of the
  // server for a year — see `skinAsks`.
  check('skinning asks nothing of a corpse this game can reach',
    [1, 5, 9].every((l) => skinAsks(l) === 0) && skinAsks(10) === 0
    && skinAsks(15) === 50 && skinAsks(25) === 125,
    'levels 1-10 ask 0, 15 asks 50, 25 asks 125')
  check('and the trade opens the gate it asks for',
    skinAsks(12) <= (craft.trades['393']?.cap ?? 0),
    `a level 12 corpse asks ${skinAsks(12)}, skinning reaches `
    + `${craft.trades['393']?.cap ?? 0}`)

  // What the bag has to be able to say, which is the whole reason it stopped
  // holding words.
  check('a recipe knows what the bag is short of',
    lacking([[2589, 2], [2592, 1]], { 2589: 1 }).length === 2
    && lacking([[2589, 2]], { 2589: 5 }).length === 0,
    'two linen against one, and two against five')
}

// Standing, which is arithmetic before it is a line on a sheet.
{
  const sides = world('player').factions
  const quests = world('quests').quests
  check('the world says where a character begins with everybody',
    !!sides && Object.keys(sides.start).length > 0,
    `${Object.keys(sides?.start ?? {}).length} sides have a starting number`)

  // The eight spans have to come out at the boundaries the server's own
  // `ReputationRankToStanding` would give, and the bottom has to be the
  // bottom — 42,999 less every span is exactly -42,000.
  check('the eight ranks tile the whole range with no gap',
    rankFloor(0, sides) === -42000
    && rankFloor(EXALTED, sides) === 42000
    && [...Array(8).keys()].every((i) =>
      rankOf(rankFloor(i, sides), sides) === i
      && (i === 0 || rankOf(rankFloor(i, sides) - 1, sides) === i - 1)),
    `hated begins at ${rankFloor(0, sides)}, exalted at ${rankFloor(EXALTED, sides)}`)
  check('and standing buys nothing until it is above neutral',
    discountOf(NEUTRAL) === 1 && discountOf(UNFRIENDLY) === 1
    && Math.abs(discountOf(FRIENDLY) - 0.95) < 1e-9
    && Math.abs(discountOf(EXALTED) - 0.8) < 1e-9,
    '중립 0%, 우호 5%, 숭배 20%')

  // And the thing the whole feature is for: the errands of this slice, run
  // end to end, move a human across one rank.  The same claim `quests.py`
  // asserts, read here off the two shipped files instead of off the script
  // that wrote them.
  const paid = {}
  for (const q of quests) for (const [f, n] of q.rep ?? []) paid[f] = (paid[f] ?? 0) + n
  const [main] = Object.entries(paid).sort((a, b) => b[1] - a[1])
  const start = sides.start[main[0]] ?? 0
  check('every errand here together crosses one standing',
    rankOf(start + main[1], sides) > rankOf(start, sides),
    `faction ${main[0]}: ${start} + ${main[1]} — rank `
    + `${rankOf(start, sides)} -> ${rankOf(start + main[1], sides)}`)
  check('and crossing it takes five per cent off every price of that side',
    Math.abs(discountOf(rankOf(start, sides))
      - discountOf(rankOf(start + main[1], sides)) - 0.05) < 1e-9,
    `${discountOf(rankOf(start, sides))} -> `
    + `${discountOf(rankOf(start + main[1], sides))}`)

  // The spill is a quarter and it stops at a rank rather than at a number.
  const spilt = paidBy([[Number(main[0]), 1000]], {}, sides)
  check('what is paid to one side spills into the sides it is allied with',
    spilt.length === 1 + (sides.spills[main[0]] ?? []).length
    && spilt.slice(1).every(([, n]) => n === 250),
    spilt.map(([f, n]) => `${f}:${n}`).join(' '))
  // And it changes no rank here, which is worth knowing rather than hiding:
  // a quarter of 5,445 on top of 3,100 is still 우호.
  const over = (sides.spills[main[0]] ?? []).map(([into]) => {
    const was = sides.start[String(into)] ?? 0
    return [into, rankOf(was, sides), rankOf(was + Math.floor(main[1] * 0.25), sides)]
  })
  check('and the spill is counted even where it changes nothing',
    over.length > 0,
    over.map(([f, a, b]) => `${f} ${a}->${b}`).join(', '))

  // A standing cannot run off either end.
  check('a standing stops at both ends',
    standAfter(sides.cap, 10000, sides) === sides.cap
    && standAfter(-42000, -10000, sides) === -42000,
    `${sides.cap} and -42000`)
}

// Standing still, which is the other half of every fight.
{
  const roster = world('player')
  const warrior = roster.classes['1']
  const lo = roster.levels[0], hi = roster.levels[1]
  check('every class knows what a point of spirit is worth in health',
    Object.values(roster.classes).every((c) => c.mend
      && Object.keys(c.mend).length >= hi - lo + 1),
    `${Object.keys(warrior.mend).length} levels a class`)

  // A level one warrior heals a real share of his bar on one tick, and the
  // share falls as the bar grows — which is the shape the original has and
  // the flat five per cent a second did not.
  const share = (lv) => {
    const st = warrior.stats[String(lv)]
    const hp = st[5] + Math.min(st[2], 20) + Math.max(0, st[2] - 20) * 10
    const s = [st[0], st[1], st[2], st[3], st[4]]
    return healPerTick(lv, s, warrior.mend[String(lv)]) / hp
  }
  check('a hurt warrior heals faster at one than at ten',
    share(lo) > share(hi) && share(lo) > 0.4 && share(hi) > 0.05,
    `${(share(lo) * 100).toFixed(0)}% of the bar a tick at ${lo}, `
    + `${(share(hi) * 100).toFixed(0)}% at ${hi}`)
  check('and sitting down is worth a third again',
    Math.abs(healPerTick(lo, [0, 0, 0, 0, 20], warrior.mend[String(lo)], true)
      / healPerTick(lo, [0, 0, 0, 0, 20], warrior.mend[String(lo)]) - 1.33) < 1e-6,
    '1.33')
  // And nobody in this game reaches the second ratio, which is why it is here
  // rather than in the game: the rule arrives with the data.
  const over = Object.values(roster.classes).some((c) =>
    Object.keys(c.stats).some((lv) => c.stats[lv][4] > SPIRIT_BAND))
  check('and no one here has enough spirit to reach the second ratio',
    over === false,
    `the band is ${SPIRIT_BAND} and the most anybody has is `
    + Math.max(...Object.values(roster.classes)
      .flatMap((c) => Object.values(c.stats).map((r) => r[4]))))

  // Rage, which is the number the old abyss learned you cannot check by
  // damage a second.
  const RAGE_SWING = 2.9
  check('a swing that crits is worth more rage than the same damage cold',
    rageFrom(20, 5, RAGE_SWING, true, true) > rageFrom(20, 5, RAGE_SWING, true),
    `${rageFrom(20, 5, RAGE_SWING, true).toFixed(2)} vs `
    + `${rageFrom(20, 5, RAGE_SWING, true, true).toFixed(2)}`)
  check('and the speed half of it is a whole number of rage',
    Number.isInteger(rageFrom(0, 5, RAGE_SWING, true) * 2),
    `a ${RAGE_SWING}s weapon contributes `
    + `${Math.floor(RAGE_SWING * RAGE_PER_SECOND_OF_SWING)}, not `
    + `${(RAGE_SWING * RAGE_PER_SECOND_OF_SWING).toFixed(2)}`)
  check('and a warrior who stops fighting empties in a hundred seconds',
    MAX_RAGE / RAGE_LOST_PER_TICK * REGEN_TICK === 100,
    `${MAX_RAGE} at ${RAGE_LOST_PER_TICK} every ${REGEN_TICK}s`)
}

// --- the same seed and the same inputs are the same game, N steps on --------
//
// Issue 103's third condition: *same seed plus same inputs is the same state,
// run N steps and compare.*  What stood for it was the pair of `duel()` calls
// above — one function called twice with nothing in between, which is a claim
// about one loop.
//
// This is the widest path Node can load, on one stream and in one order:
// fights at every level of the slice, against its own level and up to three
// above, one foe and two, both policies; every fight that is won credits every
// errand in the world through `quest.ts`, whose item objectives roll the same
// stream; and a draw from `between` each step.  Each step writes down what
// came out and where the stream is, and the quest ledger is compared at the
// end too.  And the save's half of it: the position written down half-way,
// the stream used for something else, the position put back.
//
// **The boundary is `main.ts`.**  The world's own fifty-millisecond step —
// walking, noticing, a creature's script, the loot off a body — lives in the
// closure with the canvas, so the whole world's determinism is asked only in a
// browser.  What is asked here is every rule in `src/sim/` that takes a roll.
{
  const errands = world('quests').quests
  const entries = [...new Set(errands.flatMap((q) => [
    ...q.kill.map(([whom]) => whom),
    ...q.fetch.flatMap(([, , , from]) => from.map(([whom]) => whom))]))]
  const [lo, hi] = roster.levels
  const STEPS = 300
  const session = (from, pauseAt = -1) => {
    reseed(from)
    const ledger = ledgerOf(errands)
    for (const q of errands) take(ledger, q)
    const steps = []
    for (let i = 0; i < STEPS; i++) {
      if (i === pauseAt) {
        const at = seed()
        reseed(0x5eed)
        for (let k = 0; k < 97; k++) roll()
        reseed(at)
      }
      const level = lo + (i % (hi - lo + 1))
      const fought = duel(player(level), creature(level + (i % 4)), who,
        { many: i % 3 === 2 ? 2 : 1, runs: 1,
          policy: i % 2 ? 'rota' : 'auto', bar })
      const news = fought.won
        ? killed(ledger, entries[i % entries.length], roll) : []
      steps.push([fought.won, fought.seconds, fought.presses, news.join(' '),
        between(0, 99), seed()])
    }
    return { steps, said: JSON.stringify([steps, ledger.held]) }
  }
  const once = session(20260915)
  const again = session(20260915)
  const paused = session(20260915, STEPS / 2)
  const other = session(20260916)
  const won = once.steps.filter((s) => s[0]).length
  const moved = once.steps.filter((s) => s[3]).length
  const firstApart = (a, b) => a.steps.findIndex((s, i) =>
    JSON.stringify(s) !== JSON.stringify(b.steps[i]))
  check(`the same seed and the same inputs are the same state after ${STEPS} steps`,
    once.said === again.said && won > 0 && won < STEPS && moved > 0,
    once.said === again.said
      ? `${won} of ${STEPS} fights won, ${moved} of them moved an errand, the `
        + `stream at ${once.steps.at(-1)[5]} both times`
      : `the two runs part at step ${firstApart(once, again)}`)
  check('and a stream written down and put back is the same stream',
    paused.said === once.said,
    paused.said === once.said
      ? `position saved at step ${STEPS / 2}, 97 rolls spent elsewhere, restored`
      : `parts at step ${firstApart(once, paused)}`)
  check('and a different seed is a different game', other.said !== once.said,
    other.said !== once.said
      ? `seed + 1 parts at step ${firstApart(once, other)}`
      : 'the seed changes nothing, so the checks above are about nothing')
}

// --- an old save still loads --------------------------------------------------
//
// Issue 84's second condition: *old save samples are in the repository and a
// check loads them.*  `save.ts` has walked v1 → v2 → v3 → v4 for as long as
// the chain has had anything in it, and nothing had ever put a v1 through it.
// So there is one sample a version under `scripts/fixtures/saves/`, built by
// hand from the shape each version's `snapshot` wrote (0969de9, bbd5dc3,
// d195b09, ab9c4f4) — nobody's character.  The newest is a finished one,
// because that is also the save `budgetcheck` weighs.
//
// `migrate` has no browser in it — IndexedDB is only touched inside the
// functions that open the store — so it runs here as it is.
//
// **What "loads" means is what `restore` in `main.ts` reads.**  `REQUIRED` is
// what it reads with nothing to fall back on; `SHAPED` is what it reads behind
// a fallback, so it may be missing but may not be the wrong shape.  Which
// fields `restore` reads is taken off its own body, and a field it reads that
// neither list names fails — the bargain `audit.py` makes with a default.
//
// One thing no sample can say, and it is worth keeping: cooldowns became *what
// is left* rather than *when it ends* in 0d7962d, four hours after v4 shipped
// and with no version of its own, so a v4 save from that afternoon holds
// moments on a clock that has since restarted and nothing in it says which.
{
  const { readdirSync } = await import('node:fs')
  const { migrate, SAVE_VERSION } = await import('../src/save.ts')
  const DIR = 'scripts/fixtures/saves'
  const samples = new Map(readdirSync(DIR).filter((f) => /^v\d+\.json$/.test(f))
    .map((f) => [Number(f.slice(1, -5)),
      JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))]))
  const absent = [...Array(SAVE_VERSION).keys()].map((i) => i + 1)
    .filter((v) => samples.get(v)?.version !== v)
  check('there is a sample save for every version there has been',
    absent.length === 0,
    absent.length ? `no v${absent.join(', v')} in ${DIR}`
      : `v1 to v${SAVE_VERSION} in ${DIR}`)

  const scene = readFileSync('src/main.ts', 'utf8')
  const from = scene.indexOf('const restore = (save: Save) => {')
  const body = from < 0 ? '' : scene.slice(from, scene.indexOf('\n  }\n', from))
  // Comments out first: `restore` says "see the note in `save.ts`", and read
  // as code that was a field called `ts`.
  const reads = [...new Set([...body.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ').matchAll(/\bsave\.((?:you|hero)\.\w+|\w+)/g)]
    .map((m) => m[1]))]
  const num = (v) => typeof v === 'number' && Number.isFinite(v)
  const ids = (v) => Array.isArray(v) && v.every(num)
  const counts = (v) => !!v && typeof v === 'object' && Object.values(v).every(num)
  const REQUIRED = {
    'hero.x': num, 'hero.y': num, 'hero.dir': num,
    'you.level': num, 'you.xp': num, 'you.power': num, 'you.purse': num,
    'you.kills': num, seed: num,
  }
  const SHAPED = {
    'you.who': (w) => typeof w.name === 'string' && [w.race, w.sex, w.cls].every(num),
    'you.hp': num,
    // Item id to how many, which is the whole of what v3 → v4 is for.
    'you.bag': (b) => counts(b) && Object.keys(b).every((k) => /^\d+$/.test(k)),
    'you.trades': (t) => Object.entries(t).every(([k, v]) => /^\d+$/.test(k)
      && Array.isArray(v) && v.length === 2 && v.every(num)),
    'you.cools': counts,
    'you.auras': (a) => !!a && typeof a === 'object',
    'you.items': ids, 'you.gear': counts, 'you.taught': ids, 'you.recipes': ids,
    'you.stands': counts,
    'you.bar': (b) => Array.isArray(b) && b.every((x) => x === null || num(x)),
    'you.auto': num,
    'you.bought': (o) => Object.values(o).every((v) => ids(v) && v.length === 2),
    'you.rest': num, 'you.finished': num, 'you.born': num,
    quests: (q) => !!q && Array.isArray(q.held ?? []) && ids(q.done ?? []),
  }
  const unnamed = reads.filter((r) => !(r in REQUIRED) && !(r in SHAPED))
  check('and every field restore reads is one this check knows the rule for',
    body.length > 0 && reads.length > 10 && unnamed.length === 0,
    unnamed.length ? `restore reads ${unnamed.join(', ')} and nothing here says `
      + 'whether a migrated save must have it'
      : `${reads.length} fields, ${Object.keys(REQUIRED).length} with no fallback`)

  const get = (o, path) => path.split('.').reduce((x, k) => x?.[k], o)
  const wrong = [], lost = []
  for (const [v, was] of [...samples].sort((a, b) => a[0] - b[0])) {
    const now = migrate(structuredClone(was))
    if (!now || now.version !== SAVE_VERSION) {
      wrong.push(`v${v} came out as ${now ? `v${now.version}` : 'nothing'}`)
      continue
    }
    for (const [k, ok] of Object.entries(REQUIRED)) {
      if (!ok(get(now, k))) wrong.push(`v${v} ${k} is ${JSON.stringify(get(now, k))}`)
    }
    for (const [k, ok] of Object.entries(SHAPED)) {
      const x = get(now, k)
      if (x !== undefined && !ok(x)) wrong.push(`v${v} ${k} is ${JSON.stringify(x)}`)
    }
    if (!now.you.who) wrong.push(`v${v} came out as nobody`)
    // And what the character had is still his: a migration may rename and
    // may sell, and may not drop.
    for (const k of ['hero.x', 'hero.y', 'hero.dir', 'you.level', 'you.xp',
      'you.kills', 'seed']) {
      if (get(now, k) !== get(was, k)) lost.push(`v${v} ${k} ${get(was, k)} -> ${get(now, k)}`)
    }
    if (JSON.stringify(now.quests) !== JSON.stringify(was.quests)) {
      lost.push(`v${v} quests`)
    }
    if (now.you.power !== (was.you.power ?? was.you.rage)) {
      lost.push(`v${v} the bar ${was.you.power ?? was.you.rage} -> ${now.you.power}`)
    }
    const sold = Object.values(was.you.bag ?? {})
      .reduce((n, x) => n + (Array.isArray(x) ? x[1] : 0), 0)
    if (now.you.purse !== was.you.purse + sold) {
      lost.push(`v${v} purse ${was.you.purse} + ${sold} sold -> ${now.you.purse}`)
    }
    if (Object.keys(now.you.trades ?? {}).length
      !== Object.keys(was.you.trades ?? {}).length) {
      lost.push(`v${v} trades ${JSON.stringify(was.you.trades)} -> `
        + JSON.stringify(now.you.trades))
    }
    if (v === SAVE_VERSION && JSON.stringify(now) !== JSON.stringify(was)) {
      lost.push(`v${v} is the current shape and migrate changed it`)
    }
  }
  check(`every sample comes forward to v${SAVE_VERSION} with what restore reads`,
    samples.size > 0 && wrong.length === 0,
    wrong.length ? wrong.slice(0, 4).join('; ')
      : [...samples.keys()].sort().map((v) => `v${v}`).join(', '))
  check('and nothing a character had is lost on the way',
    samples.size > 0 && lost.length === 0,
    lost.length ? lost.slice(0, 4).join('; ')
      : 'position, level, experience, kills, the stream, the errands and the '
      + 'bar kept; an old bag sold into the purse at its own worth')
}

// --- what a character is made of, at every level the slice has ----------------
//
// Issue 72's second condition: *a human warrior's stats at levels 1 to 10
// agree with player_class_stats + player_race_stats.*  What stood for it was
// level one — `player.py` asserts a warrior's sixty health and a mage's 165
// mana — so a row from two to ten read off the wrong column would say nothing.
//
// Two halves with different reaches, the bargain `corecheck` makes with the
// C++.  **With the world database's dump** (`$ABYSS_ACORE`, by default
// `~/src/azerothcore-wotlk`, the tree `npm run bake` reads) every baked row —
// every class `slice.json` offers, every level of its range — is the class's
// row plus the race's, column by column, out of the two SQL files themselves.
// **Without it** that half says so, and what runs everywhere is the table
// `stats.ts` makes of the baked rows: health, mana, attack power, armour and
// critical chance at every level, printed, held to the figures issue 72 closed
// on for the warrior — 60 health, 42 armour and 8.4% at one, 227 health and 54
// armour at ten — and to health that never falls as a level rises.
//
// The ids are read out of `pipeline/slice.py`, which is the one place a word
// in `slice.json` becomes a number, rather than typed here a second time.
{
  const { existsSync } = await import('node:fs')
  const { homedir } = await import('node:os')
  const { join } = await import('node:path')
  const { critChance, maxMana } = await import('../src/sim/stats.ts')
  const slice = JSON.parse(readFileSync('slice.json', 'utf8'))
  const [lo, hi] = slice.levels
  const py = readFileSync('pipeline/slice.py', 'utf8')
  const idsOf = (name) => Object.fromEntries([...(py.match(
    new RegExp(`^${name} = \\{([^}]*)\\}`, 'm'))?.[1] ?? '')
    .matchAll(/'(\w+)':\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]))
  const CLASS_ID = idsOf('CLASS_ID'), RACE_ID = idsOf('RACE_ID')
  const offered = slice.classes.map((c) => [c, CLASS_ID[c]])
  const levels = [...Array(hi - lo + 1).keys()].map((i) => lo + i)
  const gaps = offered.flatMap(([c, id]) => levels
    .filter((l) => !roster.classes[String(id)]?.stats?.[String(l)])
    .map((l) => `${c} ${l}`))
  check('every class the slice offers has a stat row at every level of it',
    offered.length > 0 && offered.every(([, id]) => id) && gaps.length === 0,
    gaps.length ? `missing: ${gaps.slice(0, 6).join(', ')}`
      : `${offered.length} classes x levels ${lo}-${hi}`)

  const tableOf = (id) => {
    const c = roster.classes[String(id)]
    const worn = (c.kit ?? []).reduce((n, k) => n + k[K_ARMOUR], 0)
    return levels.map((l) => {
      const s = c.stats[String(l)]
      return { level: l, health: maxHealth(s), mana: maxMana(s),
        power: attackPower(l, s), armour: armourOf(s, worn),
        crit: critChance(l, s, c) }
    })
  }
  const warrior = tableOf(CLASS_ID.Warrior)
  console.log(`\n     the warrior, as stats.ts makes him\n     ${'level'.padEnd(7)}`
    + `${'health'.padStart(7)}${'power'.padStart(7)}${'armour'.padStart(8)}`
    + `${'crit'.padStart(7)}`)
  for (const r of warrior) {
    console.log(`     ${String(r.level).padEnd(7)}${String(r.health).padStart(7)}`
      + `${String(r.power).padStart(7)}${String(r.armour).padStart(8)}`
      + `${`${r.crit.toFixed(1)}%`.padStart(7)}`)
  }
  console.log()
  const one = warrior.find((r) => r.level === 1)
  const ten = warrior.find((r) => r.level === 10)
  const falls = offered.flatMap(([c, id]) => tableOf(id).slice(1)
    .filter((r, i) => r.health < tableOf(id)[i].health).map((r) => `${c} ${r.level}`))
  check('a warrior is what issue 72 closed on at one and at ten, and nobody '
    + 'loses health for a level',
    one?.health === 60 && one?.armour === 42 && one?.crit.toFixed(1) === '8.4'
    && ten?.health === 227 && ten?.armour === 54 && falls.length === 0,
    `level 1: ${one?.health} health, ${one?.armour} armour, `
    + `${one?.crit.toFixed(1)}% crit; level 10: ${ten?.health} health, `
    + `${ten?.armour} armour${falls.length ? `; health falls at ${falls.join(', ')}` : ''}`)

  const ACORE = process.env['ABYSS_ACORE'] || join(homedir(), 'src/azerothcore-wotlk')
  const DB = join(ACORE, 'data/sql/base/db_world')
  const sql = (table) => {
    const text = readFileSync(join(DB, `${table}.sql`), 'utf8')
    const cols = [...(text.match(new RegExp(`CREATE TABLE \`${table}\` \\(([\\s\\S]*?)\\n\\)`))
      ?.[1] ?? '').matchAll(/^\s*`(\w+)`/gm)].map((m) => m[1])
    const at = text.indexOf(`INSERT INTO \`${table}\` VALUES`)
    const block = at < 0 ? '' : text.slice(at, text.indexOf(';\n', at))
    return [...block.matchAll(/\(([^()]*)\)/g)].map((m) => Object.fromEntries(
      m[1].split(',').map((v, i) => [cols[i], Number(v)])))
  }
  if (!existsSync(join(DB, 'player_class_stats.sql'))) {
    console.log(`      (no world database at ${ACORE}, so the baked rows are not `
      + 'compared with player_class_stats — set ABYSS_ACORE to a checkout of '
      + 'azerothcore-wotlk)')
  } else {
    const race = sql('player_race_stats').find((r) => r.Race === RACE_ID[slice.races[0]])
    const byClass = sql('player_class_stats')
    const COLS = ['Strength', 'Agility', 'Stamina', 'Intellect', 'Spirit']
    const differ = []
    for (const [c, id] of offered) {
      for (const l of levels) {
        const row = byClass.find((r) => r.Class === id && r.Level === l)
        const want = row && race ? [...COLS.map((k) => row[k] + race[k]),
          row.BaseHP, row.BaseMana] : null
        const got = roster.classes[String(id)]?.stats?.[String(l)]
        if (JSON.stringify(want) !== JSON.stringify(got)) {
          differ.push(`${c} ${l}: table ${JSON.stringify(want)}, baked ${JSON.stringify(got)}`)
        }
      }
    }
    check('and every baked row is player_class_stats plus player_race_stats',
      !!race && differ.length === 0,
      !race ? `no ${slice.races[0]} row in player_race_stats`
        : differ.length ? differ.slice(0, 3).join('; ')
          : `${offered.length} classes x ${levels.length} levels, seven columns `
          + `each, read out of ${DB}`)
  }
}

console.log(bad ? `${bad} FAILED` : 'all checks passed')
process.exit(bad ? 1 : 0)

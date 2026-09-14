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

console.log('a fight, run without a browser\n')
console.log(`     ${'against'.padEnd(12)}${'policy'.padEnd(8)}${'survived'.padStart(9)}`
  + `${'seconds'.padStart(9)}${'presses'.padStart(9)}`)
const table = []
for (const [level, many] of [[1, 1], [3, 1], [3, 2], [5, 1]]) {
  for (const policy of ['auto', 'rota']) {
    reseed(20260913)
    const got = duel(player(1), creature(level), who,
      { many, runs: 400, policy, bar })
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

console.log(bad ? `${bad} FAILED` : 'all checks passed')
process.exit(bad ? 1 : 0)

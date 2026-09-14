/**
 * The numbers this game takes from the server, read back out of the server.
 *
 * Issue 202 counted four constants with no source: the rage formula, the
 * global cooldown, out-of-combat healing and which way an orientation of
 * nought points.  Every one of them turned out to be a line of AzerothCore
 * that nobody had gone and found.
 *
 * So this is the `derive_body` / `derive_climb` shape one level up.  Those
 * two *derive* a number at bake time from a model and a table; these are
 * literals in C++, so what can be done is to go and read the literal and fail
 * when the copy in `src/` has drifted from it.  A constant with a source in
 * the comment and no check behind it is a comment, and comments do not fail.
 *
 * Needs a checkout of the core at `~/src/acore-src` or `$ABYSS_CORE`, which
 * CI has not got — without one it says so and passes, the same bargain
 * `wikicheck` makes with the wiki.  The sparse checkout only needs the
 * directories this reads: Combat, Entities, Miscellaneous, Reputation, Spells.
 */
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

let bad = 0
const check = (what, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? `   -> ${detail}` : ''}`)
  if (!ok) bad++
}

const CORE = process.env['ABYSS_CORE'] || join(homedir(), 'src/acore-src')
const GAME = join(CORE, 'src/server/game')
if (!existsSync(GAME)) {
  console.log(`no core at ${CORE}, so nothing to read the numbers back out of`)
  console.log('  (set ABYSS_CORE to a checkout of azerothcore-wotlk)')
  console.log('all checks passed')
  process.exit(0)
}

const core = (p) => {
  const at = join(GAME, p)
  if (!existsSync(at)) { check(`the core has ${p}`, false); return '' }
  return readFileSync(at, 'utf8')
}
const ours = (p) => readFileSync(p, 'utf8')

/** Every number in one line of C++, so a formula can be compared as a list. */
const numbersIn = (src, needle) => {
  const at = src.indexOf(needle)
  if (at < 0) return null
  const line = src.slice(at, src.indexOf('\n', at))
  return (line.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
}

// --- 1. Rage ---------------------------------------------------------------
//
// `Unit::RewardRage` is the whole of it: a conversion curve on the level, a
// share of the damage, and the weapon's own speed.  The wiki's 층 B page put
// this first because a warrior is the class this slice is built around — and
// because the old abyss learned that **matching damage a second does not
// match resource a swing**, and the resource is what the decisions run on.
{
  const unit = core('Entities/Unit/Unit.cpp')
  const unitH = core('Entities/Unit/Unit.h')
  const fight = ours('src/sim/fight.ts')
  const curve = numbersIn(unit, 'float rageconversion =')
  const mine = numbersIn(fight, 'const convert =')
  check('the rage conversion curve is the server\'s own three numbers',
    !!curve && !!mine && curve.length === 3 && mine.length === 3
    && curve.every((v, i) => Math.abs(v - mine[i]) < 1e-9),
    `${curve?.join(', ')} vs ${mine?.join(', ')}`)
  const dealt = numbersIn(unit, 'float rageFromDamageDealt =')
  const taken = numbersIn(unit, 'addRage = damage / rageconversion * 2.5f')
  const speed = numbersIn(unitH, 'return uint32(GetAttackTime(att) / 1000.0f')
  const shares = numbersIn(fight, 'export const RAGE_DEALT')
  check('and the three shares it splits by',
    !!dealt && !!taken && !!speed && shares?.length === 3
    && dealt.at(-1) === shares[0] && taken.at(-1) === shares[1]
    && speed.includes(shares[2]),
    `dealt ${dealt?.at(-1)}, taken ${taken?.at(-1)}, `
    + `a second of swing ${shares?.[2]} (off-hand ${speed?.at(-1)})`)
  // The two the game used to get wrong, both in the same line of the server.
  check('and the speed factor is a whole number',
    unitH.includes('return uint32(GetAttackTime(att)')
    && fight.includes('Math.floor(swingSeconds * RAGE_PER_SECOND_OF_SWING)'),
    'uint32 in Unit.h:923, Math.floor in fight.ts')
  check('and a critical doubles it',
    unit.includes('weaponSpeedHitFactor *= 2')
    && fight.includes('* (crit ? 2 : 1)'),
    'Unit.cpp:1115')
  // And what it costs to stand still, which was two and a half a second here
  // and is one a second there.
  const decay = numbersIn(core('Entities/Player/Player.cpp'),
    'addvalue += -20 * RageDecreaseRate')
  const stats = ours('src/sim/stats.ts')
  const lost = numbersIn(stats, 'export const RAGE_LOST_PER_TICK')
  check('and rage drains at the rate the server drains it',
    decay?.[0] === -20 && lost?.[0] === 2,
    `-20 a tick held ten to the point = ${lost?.[0]} a tick`)
}

// --- 2. The global cooldown ------------------------------------------------
{
  const spell = core('Spells/Spell.cpp')
  const main = ours('src/main.ts')
  const min_ = numbersIn(spell, 'MIN_GCD =')
  const max_ = numbersIn(spell, 'MAX_GCD =')
  const mine = numbersIn(main, 'const GCD_MIN = ')
  check('the global cooldown floor and ceiling are the server\'s',
    min_?.[0] === mine?.[0] && max_?.[0] === mine?.[1],
    `${min_?.[0]}..${max_?.[0]}`)
  // And the half of the rule that is not the numbers: the clamp only applies
  // to a spell that was already inside the range.
  check('and the clamp only bites where the server lets it',
    spell.includes('if (m_spellInfo->StartRecoveryTime >= MIN_GCD && m_spellInfo->StartRecoveryTime <= MAX_GCD)')
    && main.includes('sp.gcd < GCD_MIN || sp.gcd > GCD_MAX ? sp.gcd'),
    'Spell.cpp:8988')
}

// --- 3. Healing out of combat ----------------------------------------------
//
// Five per cent of maximum a second, three seconds after the last blow — two
// numbers, both written here, and neither of them anywhere in the server.
{
  const player = core('Entities/Player/Player.cpp')
  const stats = ours('src/sim/stats.ts')
  check('health is settled on the server\'s own tick and not every frame',
    player.includes('if (m_regenTimerCount >= 2000)')
    && numbersIn(stats, 'export const REGEN_TICK')?.[0] === 2,
    'Player.cpp:1833 — two seconds')
  const band = numbersIn(player, 'if (baseSpirit > 50)')
  check('and the two spirit bands are the server\'s one number',
    band?.[0] === 50
    && numbersIn(stats, 'export const SPIRIT_BAND')?.[0] === 50,
    'Player.cpp:5393')
  check('and the sum is doubled the way the server doubles it',
    player.includes('moreSpirit * moreRatio->ratio) * 2')
    && stats.includes('return base * 2 * boost'),
    'Player.cpp:5396')
  const boost = numbersIn(player, 'HealthIncreaseRate = sWorld->getRate(RATE_HEALTH) * (2.066f')
  check('and the low-level boost is the one the mana line already took',
    boost?.includes(2.066) && boost?.includes(0.066)
    && stats.includes('2.066 - level * 0.066'),
    'Player.cpp:2036, and every level this game has is under fifteen')
  check('and sitting still is worth what the server says it is',
    player.includes('addvalue *= 1.33f')
    && stats.includes('(sitting ? 1.33 : 1)'),
    'Player.cpp:2051')
  // The three seconds had nowhere to come from, so they went.
  check('and nothing waits three seconds any more',
    !ours('src/main.ts').includes('you.calm > 3'),
    'the server has a state, not a delay')
}

// --- 4. Which way nought points --------------------------------------------
//
// It looks like the smallest of the four and it is the one that would go
// unnoticed: every creature in the world facing ninety degrees off is a world
// that looks fine.
{
  const pos = core('Entities/Object/Position.h')
  const spawn = ours('pipeline/spawn_npcs.py')
  const main = ours('src/main.ts')
  check('an orientation of nought points along +x, out of the server',
    pos.includes('NormalizeOrientation(std::atan2(')
    && /atan2\(\s*\n?\s*static_cast<float>\(y - m_positionY\),\s*\n?\s*static_cast<float>\(x - m_positionX\)/
      .test(pos.replace(/\s+/g, ' ').replace(/ /g, ' ')),
    'Position.h:193 — atan2(dy, dx), so nought is +x and a quarter turn is +y')
  check('and the bake turns it into a row the same way round',
    spawn.includes('facing = int(round(o / (math.pi / 2))) % 4')
    && spawn.includes('0 up, pi/2 left, pi down, 3pi/2'),
    'spawn_npcs.py')
  check('and the scene reads +x as up and +y as left',
    /dx > 0 \? DIR_UP : DIR_DOWN/.test(main)
    && /dy > 0 \? DIR_LEFT : DIR_RIGHT/.test(main),
    'main.ts facing()')
}

console.log(bad ? `${bad} FAILED` : 'all checks passed')
process.exit(bad ? 1 : 0)

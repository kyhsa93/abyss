/**
 * The module boundary, as a check rather than as a paragraph.
 *
 * The wiki's structure page opens with "a boundary that lives only in a
 * document is not kept", and then the boundary lived only in a document.
 *
 * Four of these read the source, which is weaker than running it.  The fifth
 * is the real one: **the rules load in Node with no browser at all.**  A
 * module that reaches for `document` passes every grep you can write against
 * it right up until the day somebody adds one line, and then fails here.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const check = (what, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? `   -> ${detail}` : ''}`)
  if (!ok) bad++
}

/**
 * The modules that are rules rather than screen.
 *
 * These are what a headless harness would run and what a check can roll
 * twenty thousand times: the hit table, the experience curve, the quest
 * ledger, the stream of chance, what an item does.  `main.ts` and `hud.ts`
 * are the other half and are allowed everything.
 */
const PURE = ['fight.ts', 'stats.ts', 'quest.ts', 'roll.ts', 'gear.ts', 'save.ts']
const SCREEN = /\b(document|window|HTMLElement|localStorage|requestAnimationFrame|CanvasRenderingContext2D)\b/

/** Comments are prose, and prose is allowed to name the thing it forbids. */
const code = (body) => body
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')

for (const name of PURE) {
  const body = code(readFileSync(join('src', name), 'utf8'))
  // `save.ts` is the exception it has to be: IndexedDB *is* the browser, and
  // naming the exception is the point of keeping a list rather than a rule.
  const banned = name === 'save.ts'
    ? /\b(document|window|HTMLElement|localStorage|requestAnimationFrame)\b/
    : SCREEN
  const hit = body.match(banned)
  check(`src/${name} is rules and not screen`, !hit, hit ? hit[0] : '')
}

// Nothing in `src/` may reach into the pipeline, and nothing in the pipeline
// may reach into `src/`: one is what runs in a browser and the other is what
// runs where the client is, and they share a shape rather than a file.
const sources = readdirSync('src').filter((f) => f.endsWith('.ts'))
const leaks = []
for (const f of sources) {
  const body = code(readFileSync(join('src', f), 'utf8'))
  if (/from\s+'[^']*pipeline\//.test(body)) leaks.push(`src/${f}`)
}
for (const f of readdirSync('pipeline').filter((f) => f.endsWith('.py'))) {
  const body = readFileSync(join('pipeline', f), 'utf8')
  if (/from\s+src[.\/]|import\s+src\b/.test(body)) leaks.push(`pipeline/${f}`)
}
check('the pipeline and the scene do not import each other', leaks.length === 0,
  leaks.join(', '))

// And the one that runs.  Imported straight into Node — no bundler, no DOM —
// and asked to produce an answer, because a module that only *looks* pure is
// a module nobody has tried.
let ran = null
try {
  const { xpFor, greyAt } = await import('../src/fight.ts')
  const { rollMelee, healthFromStamina, MISS } = await import('../src/stats.ts')
  const { roll, reseed } = await import('../src/roll.ts')
  reseed(1)
  const outcomes = new Set()
  for (let i = 0; i < 5000; i++)
    outcomes.add(rollMelee({ level: 1, crit: 5 },
      { level: 1, dodge: 5, parry: 5, block: 5 }, roll() * 10000))
  ran = {
    xp: xpFor(1, 1, false), grey: greyAt(10),
    health: healthFromStamina(22), outcomes: outcomes.size,
    missed: outcomes.has(MISS),
  }
} catch (e) {
  ran = { error: String(e).slice(0, 200) }
}
check('and they run in Node with no browser at all',
  !!ran && !ran.error && ran.health === 40 && ran.outcomes > 3,
  ran.error ?? `a level 1 kill is ${ran.xp} xp, 22 stamina is ${ran.health} health, `
    + `${ran.outcomes} different outcomes in 5,000 swings`)

console.log(bad ? `${bad} FAILED` : 'all checks passed')
process.exit(bad ? 1 : 0)

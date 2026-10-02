import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

/**
 * Two of README's laws, held by the gate rather than by a weekly read.
 *
 * **The simulation is deterministic.** Same seed, same fight, to the tick. The
 * daily, the share link, the harness and every probe stand on it, and until
 * this file the only thing that checked it was a grep in the weekly upkeep job
 * -- which for two weeks finished in two minutes having checked nothing. So the
 * sim, and everything it imports, may not read a clock or `Math.random`.
 *
 * **The party's hands learn; its judgement does not.** A pull's attempt number
 * makes the AI react sooner and fumble less (`makeAi`). It may not change what
 * the AI decides is dangerous, because that decision is the player's to make
 * better than the party -- a judgement that sharpened with attempts would be
 * the party learning the fight for you. `currentDanger` is that judgement, and
 * it may not read the attempt or the two numbers the attempt tunes.
 *
 * Both are greps, so both are cheap; both read code with the comments taken
 * out, because this repository explains itself at length and says
 * `Math.random` in prose in more places than it ever did in code.
 */

const root = process.cwd()
let failures = 0
const expect = (label: string, ok: boolean, detail = ''): void => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok || !detail ? '' : `  -> ${detail}`}`)
}

/** Source with comments and string contents blanked, line numbers kept. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '')
    .replace(/(['"`])(?:\\.|(?!\1)[^\\\n])*\1/g, (m) => m[0] + ' '.repeat(m.length - 2) + m[0])
}

// --- 1. nothing the sim runs reads a clock or Math.random -------------------

const SIM = resolve(root, 'src/sim')
const files = new Set<string>()
const queue = readdirSync(SIM).filter((f) => f.endsWith('.ts')).map((f) => resolve(SIM, f))
while (queue.length > 0) {
  const file = queue.pop()!
  if (files.has(file)) continue
  files.add(file)
  // Imports are followed out of src/sim: a helper the sim calls is the sim.
  for (const m of readFileSync(file, 'utf8').matchAll(/^import\s(?!type\b)[^'"]*['"](\.{1,2}\/[^'"]+)['"]/gm)) {
    const target = resolve(dirname(file), m[1]!)
    const ts = existsSync(`${target}.ts`) ? `${target}.ts` : existsSync(resolve(target, 'index.ts')) ? resolve(target, 'index.ts') : null
    if (ts) queue.push(ts)
  }
}

const FORBIDDEN = /\bMath\.random\b|\bDate\.now\b|\bperformance\.now\b|\bnew Date\b/g
const hits: string[] = []
for (const file of files) {
  const lines = code(readFileSync(file, 'utf8')).split('\n')
  lines.forEach((line, i) => {
    for (const m of line.matchAll(FORBIDDEN)) hits.push(`${file.slice(root.length + 1)}:${i + 1} ${m[0]}`)
  })
}
const outside = [...files].filter((f) => !f.startsWith(SIM)).length
expect(
  `the sim and the ${outside} module(s) it imports from outside src/sim read no clock and no Math.random (${files.size} files)`,
  hits.length === 0,
  hits.join(', '),
)
expect('and the walk found the sim at all', files.size >= 10, `${files.size} files`)

// --- 2. the judgement does not learn ----------------------------------------

/** The body of a named function, by brace matching on comment-free code. */
function body(text: string, name: string): string | null {
  const at = text.search(new RegExp(`function ${name}\\s*\\(`))
  if (at < 0) return null
  const open = text.indexOf('{', text.indexOf(')', at))
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}' && --depth === 0) return text.slice(open, i + 1)
  }
  return null
}

const AI = 'src/sim/ai.ts'
const judgement = body(code(readFileSync(resolve(root, AI), 'utf8')), 'currentDanger')
expect(`${AI} still has currentDanger, the judgement this law is about`, judgement !== null)
if (judgement !== null) {
  const learned = [...judgement.matchAll(/\b(attempt|reactionDelay|mistakeChance)\b/g)].map((m) => m[1])
  expect(
    'and it reads neither the attempt nor what the attempt tunes',
    learned.length === 0,
    [...new Set(learned)].join(', '),
  )
}

if (failures > 0) {
  console.error(`lawcheck: ${failures} check(s) failed`)
  process.exit(1)
}
console.log(`lawcheck: ${files.size} sim files deterministic, the judgement does not learn`)

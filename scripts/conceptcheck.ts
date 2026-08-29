import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The menu and the concept have to agree.
 *
 * A front screen is easy to add a row to and a concept is not, so the two drift
 * in one direction only: modes accrete, the sentence at the top of the README
 * stays where it was, and after a while nobody can say what the game is. That is
 * how this project ended up with four different promises on one screen before
 * anybody wrote down which of them was the point.
 *
 * So the table in "Four shapes of the same promise" is pinned to HOME_ORDER.
 * Adding a mode now means saying, in one line, what it promises a player — and
 * if it cannot be described as content that would otherwise need other people,
 * that is the check doing its job.
 */

// The bundle lands in node_modules/.cache, so its own directory is no guide to
// the repo. npm runs scripts from the package root, which is.
const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const fail = (message: string): never => {
  console.error(`conceptcheck: ${message}`)
  process.exit(1)
}

const menu = read('src/render/menu.ts')
const order = /const HOME_ORDER: HomeChoice\[\] = \[([^\]]*)\]/.exec(menu)?.[1]
if (!order) fail('HOME_ORDER not found in src/render/menu.ts')

const modes = [...order!.matchAll(/'([a-z]+)'/g)].map((m) => m[1])
// Settings is not a mode; it promises nothing and plays nothing.
const played = modes.filter((mode) => mode !== 'settings')

const readme = read('README.md')
const table = /### Four shapes of the same promise\n([\s\S]*?)\n\n/.exec(readme)?.[1]
if (!table) fail('the "Four shapes of the same promise" table is gone from README.md')

const documented = [...table!.matchAll(/^\| `([a-z]+)` \| ([^|]+?) \|/gm)].map((m) => ({
  mode: m[1],
  promise: m[2].trim(),
}))

for (const mode of played) {
  const row = documented.find((entry) => entry.mode === mode)
  if (!row) {
    fail(
      `the home screen offers "${mode}" and the README does not. Add a row saying what it ` +
        `promises a player, or take it off the front screen.`,
    )
  }
  if (row!.promise.length < 8) fail(`"${mode}" has a row but no promise written in it`)
}

for (const entry of documented) {
  if (!played.includes(entry.mode)) {
    fail(`the README documents "${entry.mode}" and the home screen no longer offers it`)
  }
}

console.log(`conceptcheck: ${played.length} modes, each with a promise — ${played.join(', ')}`)

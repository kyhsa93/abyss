/**
 * Choose an icon for each ability out of a library of four thousand.
 *
 * The library is game-icons.net: about 4,200 monochrome SVGs under CC BY 3.0.
 * That licence is the whole reason this exists instead of the generator next
 * to it — every image model on this API bills for output, and a set drawn by
 * one group of people is more coherent than eighty-two independent
 * generations were ever going to be.
 *
 * Monochrome is the other reason. The complaint that started this was that a
 * shield outline looks the same whether it belongs to a paladin or a warlock;
 * a silhouette with no colour of its own can be tinted by the ability's
 * element, so the icon carries both what it does and what school it is.
 *
 * Matching is the hard part and it is not a string problem. `aimed_shot`
 * shares no substring with `arrow-scope`, and naive matching cheerfully
 * offered `mug-shot`. So a language model reads the whole list and picks —
 * the free tier covers text, which is what makes this the free path.
 *
 * The result is written to `art/icons.json` and committed. It is a decision,
 * not a build artifact: the model picks once, a person reads the list, and
 * from then on the game is not one API call away from a different icon set.
 *
 *   npm run iconmatch -- --icons ~/src/game-icons
 *   npm run iconmatch -- --icons ~/src/game-icons --write
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { ABILITIES } from '../src/sim/abilities'
import { elementOf, iconJobs } from './artprompt'

const MAP = resolve(process.cwd(), 'art/icons.json')
const SVG_OUT = resolve(process.cwd(), 'art/svg')
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions'

/** Text is the one thing this API's free tier still covers. */
const MODEL = 'gemini-3.6-flash'

const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const LIB = (() => {
  const at = args.indexOf('--icons')
  return resolve(at >= 0 && args[at + 1] ? args[at + 1]! : join(homedir(), 'src/game-icons'))
})()

function apiKey(): string | null {
  const fromEnv = process.env.GEMINI_API_KEY?.trim()
  if (fromEnv) return fromEnv
  for (const path of [resolve(homedir(), '.config/abyss/gemini-key'), resolve(process.cwd(), '.gemini-key')]) {
    if (existsSync(path)) {
      const value = readFileSync(path, 'utf8').trim()
      if (value) return value
    }
  }
  return null
}

/**
 * Every icon in the library, and who drew it.
 *
 * The author is not decoration: CC BY is attribution-or-nothing, and the only
 * place that fact is recorded is the directory the file sits in. Collecting it
 * here means the credits are generated from what was actually used rather than
 * from somebody remembering to update a list.
 */
function library(): Map<string, { path: string; author: string }> {
  const found = new Map<string, { path: string; author: string }>()

  const walk = (dir: string, author: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) walk(path, author)
      else if (entry.endsWith('.svg')) {
        const name = entry.slice(0, -4)
        if (!found.has(name)) found.set(name, { path, author })
      }
    }
  }

  for (const entry of readdirSync(LIB)) {
    const path = join(LIB, entry)
    // Top-level directories are contributors; everything else is repo scaffolding.
    if (entry.startsWith('.') || !statSync(path).isDirectory()) continue
    if (entry === 'badges') continue
    walk(path, entry)
  }
  return found
}

function findText(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) for (const item of node) findText(item, out)
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'text' && typeof value === 'string') out.push(value)
      else findText(value, out)
    }
  }
  return out
}

async function choose(names: string[], key: string): Promise<Record<string, string>> {
  // One request rather than eighty-two: the icon list is the expensive part of
  // the prompt, and sending it once is both cheaper and more consistent — the
  // model can see that it has already spent `fireball` when it reaches the
  // next fire spell.
  const abilities = iconJobs().map((job) => {
    const ability = ABILITIES[job.id]!
    const element = elementOf(job.id, job.name)
    return `${job.id} — "${job.name}", ${ability.role} ${ability.kind}${element ? `, ${element}` : ''}`
  })

  const prompt = [
    'Pick the single best icon for each game ability from the list of available icon names.',
    'Prefer an icon that shows the action or its effect, not a generic symbol.',
    'Avoid reusing the same icon for two different abilities where a distinct one exists.',
    'Reply with JSON only: an object mapping ability id to icon name.',
    'Use only names that appear in the list, spelled exactly.',
    '',
    'ABILITIES:',
    ...abilities,
    '',
    'ICON NAMES:',
    names.join(' '),
  ].join('\n')

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ model: MODEL, input: [{ type: 'text', text: prompt }] }),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`)

  const text = findText(await response.json()).sort((a, b) => b.length - a.length)[0] ?? ''
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  if (!json) throw new Error('no JSON object in the reply')
  return JSON.parse(json) as Record<string, string>
}

async function main(): Promise<void> {
  if (!existsSync(LIB)) {
    console.error(`no icon library at ${LIB}`)
    console.error('  git clone --depth 1 https://github.com/game-icons/icons.git')
    console.error('  npm run iconmatch -- --icons <that directory>')
    process.exit(1)
  }

  const icons = library()
  const jobs = iconJobs()
  console.log(`library: ${icons.size} icons, abilities: ${jobs.length}`)

  const key = apiKey()
  if (!key) {
    console.error('no key found — text generation is what picks the icons')
    process.exit(1)
  }

  const picked = await choose([...icons.keys()], key)

  // Everything the model said, checked against what exists. A name it invented
  // would otherwise become a missing file three steps later, in the packer.
  const chosen: Record<string, { icon: string; author: string }> = {}
  const missing: string[] = []
  const invented: string[] = []

  for (const job of jobs) {
    const name = picked[job.id]
    if (!name) {
      missing.push(job.id)
      continue
    }
    const entry = icons.get(name)
    if (!entry) {
      invented.push(`${job.id} -> ${name}`)
      continue
    }
    chosen[job.id] = { icon: name, author: entry.author }
  }

  const reused = new Map<string, string[]>()
  for (const [id, { icon }] of Object.entries(chosen)) {
    reused.set(icon, [...(reused.get(icon) ?? []), id])
  }
  const shared = [...reused.entries()].filter(([, ids]) => ids.length > 1)

  for (const line of invented) console.error(`  ! not in the library: ${line}`)
  if (missing.length > 0) console.error(`  ! no pick: ${missing.join(', ')}`)
  for (const [icon, ids] of shared) console.log(`  shared: ${icon} <- ${ids.join(', ')}`)

  console.log(`iconmatch: ${Object.keys(chosen).length}/${jobs.length} matched`)

  if (!WRITE) {
    console.log('  (dry run — pass --write to save art/icons.json and copy the SVGs)')
    return
  }

  mkdirSync(SVG_OUT, { recursive: true })
  for (const { icon } of Object.values(chosen)) {
    copyFileSync(icons.get(icon)!.path, resolve(SVG_OUT, `${icon}.svg`))
  }

  mkdirSync(resolve(process.cwd(), 'art'), { recursive: true })
  writeFileSync(MAP, `${JSON.stringify(chosen, null, 2)}\n`)

  const authors = [...new Set(Object.values(chosen).map((c) => c.author))].sort()
  console.log(`  wrote art/icons.json and ${Object.keys(chosen).length} SVGs`)
  console.log(`  authors to credit: ${authors.join(', ')}`)
}

main()

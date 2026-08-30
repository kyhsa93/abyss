/**
 * Ask for the class and boss portraits.
 *
 * Generation is not deterministic, so this is not a check and its output is
 * not a build artifact: the images it writes are committed, and this exists to
 * make a new one or replace one that came back wrong, never to run in CI.
 *
 * It talks to pollinations.ai, which answers an unauthenticated GET with a
 * JPEG. That is the whole reason it is this service: every image model on the
 * Gemini API bills for output, and the point of the portraits was to find out
 * whether generated art is usable here at all — a question worth answering
 * before it is worth paying for. Being free also changes how the tool is used,
 * because rerolling a portrait until it is right costs nothing but a minute.
 *
 * What it does not have is terms. The project is MIT, but that covers the
 * software and the documentation says nothing about the images: no ownership,
 * no commercial-use clause, no attribution requirement. "Unstated" is not
 * "granted", and that is a decision taken with open eyes rather than a detail
 * that was missed — see the note in the README.
 *
 *   npm run artgen                          # print the prompts, write nothing
 *   npm run artgen -- --write               # generate what is missing
 *   npm run artgen -- --write --only mage-frost,boss-warden
 *   npm run artgen -- --write --force --seed 42   # reroll everything
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { portraitJobs, type ArtJob } from './artprompt'

const OUT = resolve(process.cwd(), 'art/portraits')
const ENDPOINT = 'https://image.pollinations.ai/prompt'

/** Square, and four times the size the smaller of the two slots draws at. */
const SIZE = 512

/**
 * Anonymous requests get one model, and naming another is ignored rather than
 * refused — asking for `flux` silently returns this. Recorded here so nobody
 * spends an afternoon wondering why the quality does not move.
 */
const MODEL = 'sana'

/** Generation is slow and unqueued; a burst of parallel requests gets dropped. */
const GAP_MS = 1500

const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const FORCE = args.includes('--force')

function flag(name: string): string | null {
  const at = args.indexOf(name)
  return at >= 0 && args[at + 1] ? args[at + 1]! : null
}

const ONLY = flag('--only') ? new Set(flag('--only')!.split(',')) : null

/**
 * The same seed every run, so a rerun that fills in a gap draws the rest of
 * the set the way it already looks. Change it to reroll deliberately.
 */
const SEED = Number(flag('--seed') ?? 11)

async function generate(job: ArtJob, seed: number): Promise<Buffer> {
  const url =
    `${ENDPOINT}/${encodeURIComponent(job.prompt)}` +
    `?width=${SIZE}&height=${SIZE}&nologo=true&model=${MODEL}&seed=${seed}`

  const response = await fetch(url, { signal: AbortSignal.timeout(240_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const bytes = Buffer.from(await response.arrayBuffer())
  // The service answers errors with a 200 and a page, so the status is not
  // enough. Every JPEG starts FF D8 FF, and a portrait is never this small.
  if (bytes.length < 4000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error(`not a JPEG (${bytes.length} bytes)`)
  }
  return bytes
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

async function main(): Promise<void> {
  const jobs = portraitJobs().filter((job) => !ONLY || ONLY.has(job.id))
  if (jobs.length === 0) {
    console.error('--only matched nothing')
    process.exit(1)
  }

  if (!WRITE) {
    for (const job of jobs) console.log(`${job.id}  (${job.label})\n  ${job.prompt}\n`)
    console.log(`artgen: ${jobs.length} prompts, nothing written`)
    return
  }

  mkdirSync(OUT, { recursive: true })

  let made = 0
  let kept = 0
  const failed: string[] = []

  for (const job of jobs) {
    const path = resolve(OUT, `${job.id}.jpg`)
    if (!FORCE && existsSync(path)) {
      kept += 1
      continue
    }

    try {
      // The seed is per portrait rather than per run: one seed for the whole
      // set would ask for seventeen different subjects from the same starting
      // noise, which pulls them towards the same face.
      writeFileSync(path, await generate(job, SEED + jobs.indexOf(job)))
      made += 1
      console.log(`  ${job.id}`)
    } catch (error) {
      // One bad portrait does not end the run, and a rerun picks up exactly
      // what is missing.
      failed.push(`${job.id}: ${(error as Error).message}`)
    }
    await sleep(GAP_MS)
  }

  if (failed.length > 0) for (const line of failed) console.error(`  ! ${line}`)
  console.log(`artgen: ${made} written, ${kept} already there, ${failed.length} failed`)
  if (made > 0) console.log('review art/portraits — reroll one with --only <id> --force --seed <n>')
  if (failed.length > 0) process.exit(1)
}

main()

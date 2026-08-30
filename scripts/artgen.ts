/**
 * Ask an image model for the eighty-two ability icons.
 *
 * Generation is not deterministic, so this is not a check and its output is
 * not a build artifact: the images it writes are committed, and this exists to
 * make a new one or replace a bad one, not to run in CI. Treat it the way you
 * treat `spritesheet` — a tool that produces something a person then looks at.
 *
 * The key is never a command-line argument and is never printed. Put it in a
 * file only you can read:
 *
 *   umask 077 && printf %s 'YOUR_KEY' > ~/.config/abyss/gemini-key
 *
 * or export GEMINI_API_KEY. Without either, this still runs — it prints what
 * it would ask for and writes nothing, which is the only part worth reviewing
 * before spending a daily quota on eighty-two pictures.
 *
 *   npm run artgen                 # dry run: print the prompts
 *   npm run artgen -- --write      # generate what is missing
 *   npm run artgen -- --write --only frostbolt,pyroblast
 *   npm run artgen -- --write --force   # redo ones that already exist
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

import { iconJobs, type IconJob } from './artprompt'

const OUT = resolve(process.cwd(), 'art/icons')
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions'

/**
 * The cheapest model that can do 512, which is already four times the size an
 * icon is drawn at. Paying for 1K here would buy pixels the game throws away
 * on the first draw.
 *
 * Every image model is billed. There is a free tier on this API and it does
 * not cover image output — the pricing table says "not available" and the
 * endpoint says `limit: 0`, which reads like a spent quota and is not one.
 * At this model's rate eighty-two icons is a couple of dollars.
 */
const MODEL = 'gemini-3.1-flash-lite-image'

/**
 * The free tier allows a handful of requests a minute and the exact number
 * moves. Eighty-two icons is a quarter of an hour at this spacing, which is
 * cheaper than being rate-limited into a retry storm.
 */
const GAP_MS = 7000

const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const FORCE = args.includes('--force')
const ONLY = (() => {
  const at = args.indexOf('--only')
  return at >= 0 && args[at + 1] ? new Set(args[at + 1]!.split(',')) : null
})()

/**
 * Read the key without ever putting it somewhere it can be read back.
 *
 * Not an argument, because arguments are in the process table and in shell
 * history. Not logged, and never included in an error message — a failed
 * request that echoes its own auth header is how a key ends up in a paste.
 */
function apiKey(): string | null {
  const fromEnv = process.env.GEMINI_API_KEY?.trim()
  if (fromEnv) return fromEnv

  for (const path of [
    resolve(homedir(), '.config/abyss/gemini-key'),
    resolve(process.cwd(), '.gemini-key'),
  ]) {
    if (existsSync(path)) {
      const value = readFileSync(path, 'utf8').trim()
      if (value) return value
    }
  }
  return null
}

/**
 * Find the image in whatever shape the response arrived in.
 *
 * The REST response nesting is not part of the documented contract — the
 * examples are all SDK convenience properties — so rather than hard-code a
 * path that a version bump can move, walk the tree for the first block that
 * carries base64 image data. A wrong guess here fails on every icon at once,
 * long after the quota is spent.
 */
function findImage(node: unknown, depth = 0): string | null {
  if (depth > 12 || node === null || typeof node !== 'object') return null

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findImage(item, depth + 1)
      if (found) return found
    }
    return null
  }

  const record = node as Record<string, unknown>
  const data = record.data ?? record.bytesBase64Encoded ?? record.b64_json
  const mime = String(record.mime_type ?? record.mimeType ?? record.type ?? '')
  if (typeof data === 'string' && data.length > 512 && !mime.startsWith('text')) {
    return data
  }

  for (const value of Object.values(record)) {
    const found = findImage(value, depth + 1)
    if (found) return found
  }
  return null
}

async function generate(job: IconJob, key: string): Promise<Buffer> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      model: MODEL,
      input: [{ type: 'text', text: job.prompt }],
      // JPEG is the only mime the endpoint accepts. It costs nothing here:
      // an ability icon is opaque by design — it carries its own dark ground
      // so it can sit on buttons of different colours — and the atlas
      // re-encodes to WebP anyway.
      response_format: {
        type: 'image',
        mime_type: 'image/jpeg',
        aspect_ratio: '1:1',
        image_size: '512',
      },
    }),
  })

  if (!response.ok) {
    // Long enough to reach the useful part. A 429 here is two different
    // failures wearing one status: a rate limit, which passes on its own, and
    // `limit: 0`, which means the model has no free tier and never will. That
    // distinction lives past the three hundredth character of the message.
    //
    // The body can carry a rejected-key message; the request headers cannot
    // appear here, and nothing prints the key itself.
    const detail = (await response.text()).slice(0, 700)
    throw new Error(`HTTP ${response.status}: ${detail}`)
  }

  const image = findImage(await response.json())
  if (!image) throw new Error('no image block in the response')
  return Buffer.from(image, 'base64')
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

async function main(): Promise<void> {
  const jobs = iconJobs().filter((job) => !ONLY || ONLY.has(job.id))
  if (jobs.length === 0) {
    console.error('--only matched nothing')
    process.exit(1)
  }

  const key = apiKey()

  if (!WRITE || !key) {
    if (WRITE && !key) {
      console.error('no key found — printing prompts instead of spending quota')
      console.error('  put one in ~/.config/abyss/gemini-key or export GEMINI_API_KEY\n')
    }
    for (const job of jobs) console.log(`${job.id}\n  ${job.prompt}\n`)
    console.log(`artgen: ${jobs.length} prompts, nothing written`)
    // A missing key when one was asked for is a failure, so a script that
    // wraps this cannot mistake "printed some text" for "generated the art".
    process.exit(WRITE && !key ? 1 : 0)
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
      writeFileSync(path, await generate(job, key))
      made += 1
      console.log(`  ${job.id}`)
    } catch (error) {
      // One bad icon does not end the run: the rest of the quota is still
      // worth spending, and a rerun picks up exactly what is missing.
      failed.push(`${job.id}: ${(error as Error).message}`)
    }
    await sleep(GAP_MS)
  }

  if (failed.length > 0) for (const line of failed) console.error(`  ! ${line}`)
  console.log(`artgen: ${made} written, ${kept} already there, ${failed.length} failed`)
  if (made > 0) console.log('review art/icons, then: npm run atlas')
  if (failed.length > 0) process.exit(1)
}

main()

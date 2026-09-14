#!/usr/bin/env node
/**
 * The game's voice, weighed without a browser and without ears.
 *
 *   npm run soundcheck
 *
 * Issue 208 was the honest complaint that eight sounds had shipped and nobody
 * had listened to one of them.  Listening is a person's job and `bake_sounds.py
 * --listen` writes the page for it; what a script can do is the half that is
 * arithmetic, and there turned out to be more of that than expected:
 *
 *   * **Relative loudness is a statement about which event matters.**  The
 *     eight arrived from four different packs at whatever level their own game
 *     wanted, spanning 10.5 dB — so `loot`, which this game plays more often
 *     than anything but `hit`, was the quietest thing in it and sat under every
 *     blow.  Nobody decided that.  The bake levels them now and this is the
 *     gate that keeps them level.
 *   * **A word the game has and never says is the shape this repository keeps
 *     finding** — a field computed and never read, one layer up.  Every word in
 *     `SOUNDS` has to be played somewhere in `src/`, and every file in
 *     `public/art/sound` has to have a word.
 *   * **A gap with a reason on it is a decision; a gap with nothing on it is
 *     an oversight.**  `art/SOUND-CREDITS.md` carries the roster — everywhere a
 *     sound could go — and every silent line has to carry an argument, which
 *     is the bargain `audit.py` makes with the classifiers' defaults.
 *
 * It reads what is committed, not the pipeline: the sound pack is not in this
 * repository and CI has none of it, the same trade `classcheck` makes with the
 * client.  So this runs on every push, which is why the sounds did not need to
 * become a `bake.py` stage to stop drifting.
 */
import { readFileSync, readdirSync } from 'node:fs'

let bad = 0
const check = (what, ok, note = '') => {
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${what}${note ? ` -> ${note}` : ''}`)
  if (!ok) bad++
}

const WHERE = 'public/art/sound'
const DOC = 'art/SOUND-CREDITS.md'

// --- what is on disk ------------------------------------------------------
const files = readdirSync(WHERE).filter((f) => f.endsWith('.wav')).sort()

/**
 * A wav, far enough to answer the three questions this asks.
 *
 * Chunks are walked rather than assumed at offset 36: a file with a `LIST`
 * chunk in it reads as silence if you take the header's size on faith, and
 * every wrong reading of a container looks exactly like a quiet sound.
 */
function wav(path) {
  const b = readFileSync(path)
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') return null
  let at = 12; let fmt = null; let data = null
  while (at + 8 <= b.length) {
    const id = b.toString('ascii', at, at + 4)
    const size = b.readUInt32LE(at + 4)
    if (id === 'fmt ') {
      fmt = { channels: b.readUInt16LE(at + 10), rate: b.readUInt32LE(at + 12),
        bits: b.readUInt16LE(at + 22) }
    } else if (id === 'data') {
      data = b.subarray(at + 8, at + 8 + Math.min(size, b.length - at - 8))
    }
    at += 8 + size + (size & 1)
  }
  if (!fmt || !data || fmt.bits !== 16) return fmt ? { ...fmt, samples: null } : null
  const n = Math.floor(data.length / 2)
  const x = new Float64Array(n)
  for (let i = 0; i < n; i++) x[i] = data.readInt16LE(i * 2) / 32768
  return { ...fmt, samples: x, seconds: n / (fmt.rate * fmt.channels) }
}

/**
 * The root-mean-square of the loudest tenth of a second.
 *
 * The same measure `bake_sounds.py` levels on, and it has to be: a check that
 * measures a different thing from the thing that was set is a check that
 * passes for the wrong reason.  Not the whole sound's RMS, which punishes a
 * long tail; not the peak, which is one sample and hears nothing.
 */
function loudest(x, rate, window = 0.1) {
  const n = Math.max(1, Math.round(rate * window))
  if (x.length <= n) {
    let s = 0
    for (const v of x) s += v * v
    return Math.sqrt(s / x.length)
  }
  let run = 0
  for (let i = 0; i < n; i++) run += x[i] * x[i]
  let best = run
  for (let i = n; i < x.length; i++) {
    run += x[i] * x[i] - x[i - n] * x[i - n]
    if (run > best) best = run
  }
  return Math.sqrt(best / n)
}

const db = (v) => (v > 1e-6 ? 20 * Math.log10(v) : -120)

const heard = files.map((f) => ({ word: f.replace(/\.wav$/, ''), ...wav(`${WHERE}/${f}`) }))
check('every sound is a wav this game can read',
  heard.every((h) => h.samples), `${heard.length} files`)

// --- the shape the bake promises -----------------------------------------
//
// Mono at 22,050.  Not a style rule: it is a quarter of the bytes of what the
// pack ships, and the budget row for sound is 2 MB against a world that is
// 1.57.  A stereo file here would be a file that quietly doubled.
const wrong = heard.filter((h) => h.channels !== 1 || h.rate !== 22050 || h.bits !== 16)
check('and every one of them is mono, 22,050 Hz, 16-bit',
  wrong.length === 0,
  wrong.length ? wrong.map((h) => `${h.word} ${h.channels}ch ${h.rate}Hz ${h.bits}b`).join(', ')
    : `${heard.length} files, ${heard.reduce((n, h) => n + h.seconds, 0).toFixed(1)} s of sound altogether`)

// --- levelled -------------------------------------------------------------
const loud = heard.map((h) => ({ word: h.word, at: db(loudest(h.samples, h.rate)) }))
const spread = Math.max(...loud.map((l) => l.at)) - Math.min(...loud.map((l) => l.at))
// One decibel is the band, not a target: below about a decibel nobody can hear
// the difference, and above it the pack is deciding which of this game's
// events a player notices.  The pack's own spread was 10.5.
check('and no sound is louder than another, which the pack had decided for us',
  spread <= 1.0,
  `${spread.toFixed(1)} dB apart, `
  + loud.map((l) => `${l.word} ${l.at.toFixed(1)}`).join(' ') + ' dBFS')

// Nothing clips.  A sound levelled up is a sound that can be levelled into the
// ceiling, and a clipped sample is a crackle that sounds like a broken file.
const hot = heard.filter((h) => h.samples.some((v) => Math.abs(v) >= 0.999))
check('and none of them is levelled into the ceiling', hot.length === 0,
  hot.length ? hot.map((h) => h.word).join(', ')
    : `loudest peak ${db(Math.max(...heard.map((h) => Math.max(...h.samples.map(Math.abs))))).toFixed(1)} dBFS`)

// --- three lists that could drift ----------------------------------------
const src = readFileSync('src/sound.ts', 'utf8')
const words = [...src.matchAll(/'([a-z]+)'/g)]
  .map((m) => m[1])
  .filter((w, i, all) => all.indexOf(w) === i)
const declared = (src.match(/export const SOUNDS = \[([^\]]+)\]/) ?? [])[1]
const said = declared ? [...declared.matchAll(/'([a-z]+)'/g)].map((m) => m[1]) : []
const onDisk = heard.map((h) => h.word)
check('the words the game has and the files it ships are the same list',
  said.length === onDisk.length && said.every((w) => onDisk.includes(w)),
  `${said.length} in sound.ts, ${onDisk.length} on disk`
  + (said.filter((w) => !onDisk.includes(w)).length
    ? ` — missing ${said.filter((w) => !onDisk.includes(w)).join(', ')}` : '')
  + (onDisk.filter((w) => !said.includes(w)).length
    ? ` — unnamed ${onDisk.filter((w) => !said.includes(w)).join(', ')}` : ''))

// A word nobody plays is the shape this repository keeps finding.  `main.ts`
// is where every `play()` in the game is, because the scene owns the events.
const scene = readFileSync('src/main.ts', 'utf8')
const played = said.filter((w) => new RegExp(`play\\(\\s*(?:[^)]*\\?\\s*)?'${w}'`).test(scene)
  || new RegExp(`'${w}'\\s*:\\s*'`).test(scene) || new RegExp(`:\\s*'${w}'`).test(scene))
check('and every word the game has is actually said somewhere',
  played.length === said.length,
  played.length === said.length ? `${said.length} words, all played`
    : `never played: ${said.filter((w) => !played.includes(w)).join(', ')}`)

// --- the document ---------------------------------------------------------
const doc = readFileSync(DOC, 'utf8')
const rows = [...doc.matchAll(/^\| `([a-z]+)` \| `([^`]+)` \| ([^|]*) \|/gm)]
check(`${DOC} has a row for every sound`,
  rows.length === said.length && said.every((w) => rows.some((r) => r[1] === w)),
  `${rows.length} rows for ${said.length} sounds`)

// The third column is the promise the game makes to a player who turns the
// sound off: every sound has something on screen that says the same.
check('and every row names what says the same on screen',
  rows.every((r) => r[3].trim().length > 4),
  rows.filter((r) => r[3].trim().length <= 4).map((r) => r[1]).join(', ')
  || 'all eight')

// --- the roster -----------------------------------------------------------
//
// Everywhere a sound could go.  The count is the answer to the question the
// issue asked — how many places are quiet — and it is in the document so that
// it can go stale, which is what this catches.
const roster = [...doc.matchAll(/^\| ([^|]+) \| (—|`[a-z]+`) \| ([^|]*) \|/gm)]
  .filter((r) => r[1].trim() !== 'when')
const quiet = roster.filter((r) => r[2] === '—')
const sounded = roster.filter((r) => r[2] !== '—')
check('the roster names somewhere for every sound the game has',
  sounded.every((r) => said.includes(r[2].replace(/`/g, ''))),
  `${sounded.length} places with a voice, ${quiet.length} without`)

check('and every silent place on it carries the reason it is silent',
  quiet.every((r) => r[3].trim().length > 20),
  quiet.filter((r) => r[3].trim().length <= 20).map((r) => r[1].trim()).join(', ')
  || `${quiet.length} arguments for ${quiet.length} silences`)

// And the numbers in the prose are the numbers in the table, because a number
// written in two places goes stale in one of them — which is the lesson the
// budget document had just been rewritten around.
const stated = doc.match(/\*\*(\d+) of (\d+)\*\* places in\s+this game have a voice and \*\*(\d+)\*\*/)
check('and the counts the document states are the counts in its own table',
  !!stated && +stated[1] === sounded.length && +stated[2] === roster.length
    && +stated[3] === quiet.length,
  stated ? `${stated[1]} of ${stated[2]} with a voice, ${stated[3]} without`
    : 'the document does not state them — run `python3 pipeline/bake_sounds.py public/art`')

console.log(`\n${bad ? `${bad} failed` : 'all good'}`)
process.exit(bad ? 1 : 0)

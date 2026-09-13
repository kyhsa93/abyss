/**
 * What the game says out loud.
 *
 * There was no `AudioContext` and no `new Audio` anywhere in `src/`.  Nobody
 * decided to make a silent game; there was no plan for sound, which is a
 * different thing and a worse one.  The argument for why it costs more here
 * than elsewhere is short: in a tab-target fight **the ear reports the result
 * before the eye does**, and the fun page has already found that there is very
 * little to decide inside a fight — so the least it can do is read clearly.
 *
 * Three rules, each of them a mistake somebody has already made:
 *
 *   * **A context does not start without a gesture.**  Browsers refuse, and a
 *     game that opens one at load is a game whose first twenty sounds are
 *     silent and whose twenty-first is a surprise.  It opens on the first
 *     touch, click or key.
 *   * **Short sounds overlap**, so every play gets its own source node off one
 *     decoded buffer.  A single `Audio` element replayed is a sound that cuts
 *     itself off, which in a fight is most of them.
 *   * **Turning it off may not lose information.**  Every sound here has
 *     something on screen that says the same, `art/SOUND-CREDITS.md` lists the
 *     pairs, and `viewcheck` holds the game to it.
 */

/** The words the game has for itself — `pipeline/bake_sounds.py` writes them. */
export const SOUNDS = ['hit', 'miss', 'crit', 'hurt', 'die', 'cast', 'level',
  'loot'] as const
export type Sound = (typeof SOUNDS)[number]

let ctx: AudioContext | null = null
let gain: GainNode | null = null
const buffers = new Map<string, AudioBuffer>()
let muted = false
let base = './art/sound'

/** How loud, once.  Not a slider yet, and nobody has asked for one. */
const LOUD = 0.35

/**
 * Open the context, which may only happen inside a gesture.
 *
 * Safe to call again: the second call is a no-op, so every listener that could
 * plausibly be a gesture can simply call it.
 */
export function wake(where = './art/sound') {
  base = where
  if (ctx) return
  try {
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!Ctor) return
    ctx = new Ctor()
    gain = ctx.createGain()
    gain.gain.value = muted ? 0 : LOUD
    gain.connect(ctx.destination)
    for (const name of SOUNDS) load(name)
  } catch {
    // A browser with no audio is a browser that still plays the game.
    ctx = null
  }
}

async function load(name: string) {
  if (!ctx || buffers.has(name)) return
  try {
    const res = await fetch(`${base}/${name}.wav`)
    if (!res.ok) return
    const bytes = await res.arrayBuffer()
    buffers.set(name, await ctx.decodeAudioData(bytes))
  } catch {
    // One sound that will not decode is one sound that does not play.
  }
}

/** Say it, if there is anything to say it with. */
export function play(name: Sound, pitch = 1) {
  if (!ctx || !gain || muted) return
  const buf = buffers.get(name)
  if (!buf) return
  try {
    const src = ctx.createBufferSource()
    src.buffer = buf
    // A little variation, because the same hit forty times in a row is a
    // rattle rather than a fight.
    src.playbackRate.value = pitch
    src.connect(gain)
    src.start()
  } catch {
    // Nothing worth stopping the game for.
  }
}

export function mute(on: boolean) {
  muted = on
  if (gain) gain.gain.value = on ? 0 : LOUD
}
export const muteIsOn = () => muted
/** Whether anything is actually loaded, for the check. */
export const ready = () => (ctx ? buffers.size : 0)

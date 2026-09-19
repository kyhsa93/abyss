import type { SoundEvent } from './sim/types'

/**
 * Synthesised audio.
 *
 * Every sound here is generated from oscillators and a noise buffer rather
 * than loaded from a file — the same reason the rest of the game is drawn
 * from shapes. In a raid, sound is information: the point is that a puddle
 * landing behind you is audible before it is visible.
 */

interface Tone {
  /** Waveform. */
  type: OscillatorType
  from: number
  to: number
  duration: number
  gain: number
  /** Seconds to wait before playing, for two-part sounds. */
  delay?: number
}

interface Recipe {
  tones: Tone[]
  /** A burst of filtered noise, for impacts. */
  noise?: { duration: number; gain: number; cutoff: number }
  /** Minimum seconds between repeats, so spam cannot stack into a drone. */
  throttle: number
}

const RECIPES: Record<SoundEvent, Recipe> = {
  // One per second before the pull. Flat, quiet and unhurried: it is a clock,
  // not a warning, and it must not be mistaken for the telegraph.
  countdown: {
    tones: [{ type: 'sine', from: 440, to: 440, duration: 0.09, gain: 0.09 }],
    throttle: 0.3,
  },
  // The one that says go — the same note an octave up, held longer.
  pull: {
    tones: [{ type: 'sine', from: 880, to: 880, duration: 0.3, gain: 0.13 }],
    throttle: 0.5,
  },
  // Rising two-tone warning: the sound you learn to move on.
  telegraph: {
    tones: [
      { type: 'triangle', from: 520, to: 660, duration: 0.12, gain: 0.16 },
      { type: 'triangle', from: 660, to: 780, duration: 0.14, gain: 0.14, delay: 0.1 },
    ],
    throttle: 0.12,
  },
  // Something large moving outward.
  shockwave: {
    tones: [{ type: 'sawtooth', from: 240, to: 70, duration: 0.5, gain: 0.16 }],
    throttle: 0.3,
  },
  // Dull unavoidable thud; deliberately unlike the telegraph.
  raid: {
    tones: [{ type: 'sine', from: 150, to: 110, duration: 0.22, gain: 0.2 }],
    noise: { duration: 0.14, gain: 0.1, cutoff: 700 },
    throttle: 0.2,
  },
  hit: {
    tones: [{ type: 'square', from: 190, to: 120, duration: 0.07, gain: 0.07 }],
    noise: { duration: 0.09, gain: 0.09, cutoff: 1400 },
    throttle: 0.07,
  },
  heal: {
    tones: [{ type: 'sine', from: 620, to: 880, duration: 0.16, gain: 0.06 }],
    throttle: 0.12,
  },
  // Barely there: it fires on every global cooldown.
  cast: {
    tones: [{ type: 'triangle', from: 900, to: 900, duration: 0.035, gain: 0.03 }],
    throttle: 0.05,
  },
  // A press that did not happen. Falling, dull, and nothing like `cast`, so
  // "that went out" and "that did not" are never mistaken for each other.
  blocked: {
    tones: [{ type: 'square', from: 260, to: 150, duration: 0.09, gain: 0.05 }],
    throttle: 0.35,
  },
  death: {
    tones: [{ type: 'sawtooth', from: 330, to: 70, duration: 0.7, gain: 0.16 }],
    throttle: 0.25,
  },
  phase: {
    tones: [
      { type: 'sawtooth', from: 90, to: 70, duration: 0.8, gain: 0.18 },
      { type: 'triangle', from: 360, to: 300, duration: 0.6, gain: 0.1, delay: 0.06 },
    ],
    throttle: 1,
  },
  victory: {
    tones: [
      { type: 'triangle', from: 523, to: 523, duration: 0.16, gain: 0.16 },
      { type: 'triangle', from: 659, to: 659, duration: 0.16, gain: 0.16, delay: 0.14 },
      { type: 'triangle', from: 784, to: 784, duration: 0.5, gain: 0.18, delay: 0.28 },
    ],
    throttle: 2,
  },
  wipe: {
    tones: [
      { type: 'sine', from: 220, to: 90, duration: 0.9, gain: 0.18 },
      { type: 'sine', from: 165, to: 60, duration: 1.1, gain: 0.14, delay: 0.12 },
    ],
    throttle: 2,
  },
}

const MUTE_KEY = 'abyss.muted'
const VOLUME_KEY = 'abyss.volume'

/**
 * How loud, in three steps.
 *
 * Three rather than a slider: a slider on a canvas is a drag to implement and
 * a drag to use, and nobody has ever wanted 0.63 of this.
 */
export const VOLUME_STEPS = [0.4, 0.75, 1.15] as const
export const VOLUME_NAMES = ['quiet', 'normal', 'loud'] as const

function readVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY)
    const parsed = raw === null ? NaN : Number.parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed >= 0 && parsed < VOLUME_STEPS.length ? parsed : 1
  } catch {
    return 1
  }
}

export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private lastPlayed = new Map<SoundEvent, number>()
  private muted: boolean
  private level: number

  constructor() {
    this.muted = readMuted()
    this.level = readVolume()
  }

  /**
   * Browsers refuse to start audio without a gesture, so this is called from
   * the first real input rather than at load.
   */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return

    this.ctx = new Ctor()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : VOLUME_STEPS[this.level]!
    this.master.connect(this.ctx.destination)

    const length = Math.floor(this.ctx.sampleRate * 0.3)
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    // Deterministic noise: audio must never touch the simulation's RNG, and
    // a fixed sequence sounds identical to a random one here.
    let seed = 0x2f6e2b1
    for (let i = 0; i < length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      data[i] = (seed / 0x3fffffff - 1) * 0.6
    }
    this.noiseBuffer = buffer
  }

  isMuted(): boolean {
    return this.muted
  }

  /** Index into `VOLUME_STEPS`, not a gain: the settings screen shows names. */
  volume(): number {
    return this.level
  }

  setVolume(level: number): void {
    this.level = Math.max(0, Math.min(VOLUME_STEPS.length - 1, Math.round(level)))
    this.applyGain()
    try {
      localStorage.setItem(VOLUME_KEY, String(this.level))
    } catch {
      // Not worth failing over.
    }
  }

  private applyGain(): void {
    if (this.master) this.master.gain.value = this.muted ? 0 : VOLUME_STEPS[this.level]!
  }

  toggleMute(): boolean {
    this.muted = !this.muted
    this.applyGain()
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0')
    } catch {
      // Not worth failing over.
    }
    return this.muted
  }

  play(event: SoundEvent): void {
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master || this.muted) return

    const recipe = RECIPES[event]
    const now = ctx.currentTime
    const last = this.lastPlayed.get(event) ?? -Infinity
    if (now - last < recipe.throttle) return
    this.lastPlayed.set(event, now)

    for (const tone of recipe.tones) {
      const at = now + (tone.delay ?? 0)
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = tone.type
      osc.frequency.setValueAtTime(tone.from, at)
      if (tone.to !== tone.from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, tone.to), at + tone.duration)

      // Short attack, exponential decay: anything else clicks.
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(tone.gain, at + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + tone.duration)

      osc.connect(gain)
      gain.connect(master)
      osc.start(at)
      osc.stop(at + tone.duration + 0.05)
    }

    if (recipe.noise && this.noiseBuffer) {
      const source = ctx.createBufferSource()
      source.buffer = this.noiseBuffer
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = recipe.noise.cutoff
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(recipe.noise.gain, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + recipe.noise.duration)

      source.connect(filter)
      filter.connect(gain)
      gain.connect(master)
      source.start(now)
      source.stop(now + recipe.noise.duration + 0.02)
    }
  }

  /** Drains a tick's worth of events. */
  playAll(events: readonly SoundEvent[]): void {
    for (const event of events) this.play(event)
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

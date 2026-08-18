import type { SimState } from '../sim/types'
import { COLORS, L } from './theme'

/**
 * First-sight explanations.
 *
 * The encounter is meant to be learned by repeating it, but a mechanic you
 * have never seen named is just an unexplained death. Each one introduces
 * itself once, the first time it appears, and never again.
 */
interface Hint {
  title: string
  advice: string
}

const HINTS: Record<string, Hint> = {
  puddle: { title: 'VOID PUDDLE', advice: 'Move out — it detonates, then lingers' },
  breath: { title: 'TIDAL BREATH', advice: 'Get out of the cone, or behind the boss' },
  shockwave: { title: 'SHOCKWAVE', advice: 'It outruns you — get INSIDE the ring, toward the boss' },
  spread: { title: 'SPREAD', advice: 'Marked player walks away from everyone else' },
  adds: { title: 'THRALLS', advice: 'They chase the nearest player — kill them first' },
  slam: { title: 'ABYSSAL SLAM', advice: 'Aimed at the tank; it needs a defensive' },
  raid: { title: 'CRUSHING TIDE', advice: 'Unavoidable party damage — nothing to dodge' },
}

const SHOW_FOR = 4.5
const SEEN_KEY = 'abyss.seen'

export class Hints {
  private seen = new Set<string>(readSeen())
  private active: { hint: Hint; age: number } | null = null

  /** Watches the fight and raises a card the first time something appears. */
  observe(s: SimState, elapsed: number): void {
    if (this.active) {
      this.active.age += elapsed
      if (this.active.age > SHOW_FOR) this.active = null
    }

    for (const g of s.ground) this.trigger(g.kind)
    if (s.actors.some((a) => a.faction === 'boss' && a.alive && !a.isPlayer && a.id !== 100)) {
      this.trigger('adds')
    }
    if (s.actors.some((a) => a.auras.some((au) => au.id === 'spread'))) this.trigger('spread')
    if (boss(s)?.castId === 'boss_slam') this.trigger('slam')
    for (const sound of s.sounds) if (sound === 'raid') this.trigger('raid')
  }

  private trigger(key: string): void {
    if (this.seen.has(key)) return
    const hint = HINTS[key]
    if (!hint) return

    this.seen.add(key)
    this.active = { hint, age: 0 }
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...this.seen]))
    } catch {
      // Not worth failing over.
    }
  }

  /** Forgets everything, so the encounter can be learned again. */
  reset(): void {
    this.seen.clear()
    this.active = null
    try {
      localStorage.removeItem(SEEN_KEY)
    } catch {
      // Not worth failing over.
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.active) return
    const { hint, age } = this.active

    // Fade in quickly, hold, fade out.
    const fade = Math.min(1, age / 0.25, (SHOW_FOR - age) / 0.6)
    if (fade <= 0) return

    const w = Math.min(L.w - 32, 420)
    const h = 52 * L.ui
    const x = (L.w - w) / 2
    const y = L.cy - L.arenaR - h - 14

    ctx.save()
    ctx.globalAlpha = fade
    ctx.fillStyle = 'rgba(15, 17, 26, 0.92)'
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = COLORS.castBar
    ctx.lineWidth = 2
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)

    ctx.textAlign = 'center'
    ctx.fillStyle = COLORS.castBar
    ctx.font = `bold ${Math.round(13 * L.ui)}px ui-monospace, monospace`
    ctx.fillText(hint.title, x + w / 2, y + h * 0.42)

    ctx.fillStyle = COLORS.text
    ctx.font = `${Math.round(11 * L.ui)}px ui-monospace, monospace`
    ctx.fillText(hint.advice, x + w / 2, y + h * 0.78)
    ctx.restore()
  }
}

function boss(s: SimState) {
  return s.actors.find((a) => a.id === 100)
}

function readSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

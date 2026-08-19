import { iconFor } from './icons'
import type { EffectEvent, SimState, Vec2 } from '../sim/types'

/**
 * Hit effects.
 *
 * Lives here rather than in the simulation for the same reason the sound does:
 * a pull replays identically from its seed, and particles that aged inside the
 * state would make that untrue. The simulation says what happened, this
 * decides what it looks like and for how long, and the harness never sees it.
 *
 * Everything is drawn from three primitives — an expanding ring, spokes
 * radiating out of it, and an arc for a swing — so there is nothing to load
 * and nothing to keep in step with an asset.
 */

interface Burst {
  pos: Vec2
  age: number
  life: number
  colour: string
  /** World units the ring travels to.  */
  reach: number
  spokes: number
  angle: number
  /** Half-width of the arc, or zero for a full ring. */
  arc: number
  /** Fills rather than outlines: a heal reads as arriving, not detonating. */
  inward: boolean
}

/** A hit is worth about this much reach at full power. */
const REACH = 46
const MAX_BURSTS = 90

/** Steel, for a weapon that has no ability behind it to take a colour from. */
const WEAPON = '#e2e8f0'

/**
 * The boss's casts are not in the ability table and cannot be — the icon
 * check rejects an icon with no ability behind it — so they take the colour
 * their own cast bar already uses.
 */
const BOSS_CAST = '#f97316'

function rgba(colour: string, alpha: number): string {
  // The icon table is all six-digit hex, which is the only form this has to
  // read. Anything else falls through as-is and simply does not fade.
  if (!/^#[0-9a-f]{6}$/i.test(colour)) return colour
  const r = parseInt(colour.slice(1, 3), 16)
  const g = parseInt(colour.slice(3, 5), 16)
  const b = parseInt(colour.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`
}

function colourOf(abilityId: string | null): string {
  if (!abilityId) return WEAPON
  if (abilityId.startsWith('boss_')) return BOSS_CAST
  return iconFor(abilityId).colour
}

export class Effects {
  private bursts: Burst[] = []

  /**
   * Takes one tick's worth of events.
   *
   * Called per tick rather than per frame, because the channel is emptied at
   * the top of every one: a frame that catches up on three ticks would
   * otherwise draw the last one's hits and silently lose the other two — the
   * same reason the sound is drained inside the same loop.
   */
  ingest(s: SimState): void {
    for (const event of s.effects) this.spawn(event)
  }

  /** Ages what is on screen. Once a frame, in wall-clock seconds. */
  age(elapsed: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i]!
      burst.age += elapsed
      if (burst.age >= burst.life) this.bursts.splice(i, 1)
    }
  }

  private spawn(event: EffectEvent): void {
    // A twenty-five man swinging and casting at once can queue more of these
    // in a second than anyone can read. The oldest go first, so the newest
    // hit — the one you are looking at — is never the one dropped.
    if (this.bursts.length >= MAX_BURSTS) this.bursts.shift()

    const colour = colourOf(event.abilityId)
    // Big hits reach further, but only just: the finishers deal ten times a
    // filler and drawing that literally would black out the arena.
    const weight = Math.min(1.6, 0.6 + Math.sqrt(Math.max(0, event.power)) / 22)

    // A cast going off throws a ring out of the caster; one coming apart
    // collapses back into them. Neither has spokes: they are not hits, and
    // the hit that follows a cast is drawn where it lands.
    if (event.kind === 'cast' || event.kind === 'fizzle') {
      const fizzled = event.kind === 'fizzle'
      this.bursts.push({
        pos: event.pos,
        age: 0,
        life: fizzled ? 0.3 : 0.26,
        colour: fizzled ? WEAPON : colour,
        reach: fizzled ? 30 : 44,
        spokes: 0,
        angle: 0,
        arc: 0,
        inward: fizzled,
      })
      return
    }

    if (event.kind === 'swing') {
      this.bursts.push({
        pos: event.pos,
        age: 0,
        life: 0.22,
        colour: WEAPON,
        reach: 54,
        spokes: 0,
        angle: event.angle,
        arc: 0.85,
        inward: false,
      })
      return
    }

    this.bursts.push({
      pos: event.pos,
      age: 0,
      life: event.kind === 'heal' ? 0.5 : 0.34,
      colour,
      reach: REACH * weight,
      spokes: event.kind === 'heal' ? 0 : 6,
      angle: event.angle,
      arc: 0,
      inward: event.kind === 'heal',
    })
  }

  /**
   * Draws in world space, through whatever transform the camera is using —
   * passed in rather than imported so this never has to know where the view
   * is pointed.
   */
  draw(ctx: CanvasRenderingContext2D, project: (p: Vec2) => Vec2, scale: number): void {
    if (this.bursts.length === 0) return

    ctx.save()
    // Additive, so overlapping hits brighten instead of muddying. It is the
    // one thing that makes flat shapes read as energy rather than as paint.
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'

    for (const burst of this.bursts) {
      const t = Math.min(1, burst.age / burst.life)
      const fade = 1 - t
      const p = project(burst.pos)
      // A heal closes on the target instead of leaving it.
      const spread = burst.inward ? 1 - t : t
      const r = Math.max(1, burst.reach * (0.25 + spread * 0.75) * scale)

      ctx.strokeStyle = rgba(burst.colour, 0.85 * fade)
      ctx.lineWidth = Math.max(1, 4 * fade * scale)
      ctx.beginPath()
      if (burst.arc > 0) {
        ctx.arc(p.x, p.y, r, burst.angle - burst.arc, burst.angle + burst.arc)
      } else {
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      }
      ctx.stroke()

      for (let i = 0; i < burst.spokes; i++) {
        const a = burst.angle + (i / burst.spokes) * Math.PI * 2
        const inner = r * 0.55
        const outer = r * (1 + 0.35 * t)
        ctx.beginPath()
        ctx.moveTo(p.x + Math.cos(a) * inner, p.y + Math.sin(a) * inner)
        ctx.lineTo(p.x + Math.cos(a) * outer, p.y + Math.sin(a) * outer)
        ctx.strokeStyle = rgba(burst.colour, 0.55 * fade)
        ctx.lineWidth = Math.max(1, 2.5 * fade * scale)
        ctx.stroke()
      }
    }

    ctx.restore()
    ctx.lineCap = 'butt'
  }

  /** How much is on screen. Only the checks ask. */
  get count(): number {
    return this.bursts.length
  }
}

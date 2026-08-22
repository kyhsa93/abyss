import { hitStyleFor, iconFor } from './icons'
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
  /** Half-width of the arc, zero for a full ring, negative for a streak. */
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

/** How hard the biggest hit is allowed to shove the view, in world units. */
const MAX_SHAKE = 7

export class Effects {
  private bursts: Burst[] = []
  private shakeMag = 0
  private clock = 0

  /**
   * Whether hits are allowed to shove the view.
   *
   * On behind a fight, off behind a menu: a background that jolts every time
   * somebody lands a crit drags the eye off the thing being read, and the
   * whole point of a background is that it can be ignored.
   */
  constructor(private readonly shoves = true) {}

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
    this.clock += elapsed
    // Falls off fast: a shove that outlasts the hit that caused it reads as
    // the game stuttering rather than as the hit landing.
    this.shakeMag *= Math.max(0, 1 - elapsed * 9)
    if (this.shakeMag < 0.05) this.shakeMag = 0

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

    // Only the hits worth feeling: a crit, or something on the scale of a
    // finisher. Every swing shoving the camera would be unplayable.
    if (this.shoves && event.kind === 'impact' && (event.crit || event.power >= 300)) {
      const shove = event.crit ? 2.2 : 0
      const size = Math.min(4.5, event.power / 140)
      this.shakeMag = Math.min(MAX_SHAKE, this.shakeMag + shove + size)
    }
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

    // A charge: a streak along the ground where the warrior went, drawn as an
    // arc squashed flat rather than as a ring, since it has a direction and a
    // length rather than a centre.
    if (event.kind === 'dash') {
      this.bursts.push({
        pos: event.pos,
        age: 0,
        life: 0.32,
        colour: WEAPON,
        reach: Math.max(20, event.power),
        spokes: 0,
        angle: event.angle,
        arc: -1,
        inward: false,
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

    // A heal is its own shape and always was: it closes on whoever it landed
    // on rather than leaving them.
    if (event.kind === 'heal') {
      this.bursts.push({
        pos: event.pos,
        age: 0,
        life: 0.5,
        colour,
        reach: REACH * weight,
        spokes: 0,
        angle: event.angle,
        arc: 0,
        inward: true,
      })
      if (event.empowered) this.empower(event, colour, weight, true)
      return
    }

    // What the hit looks like comes from what threw it. Every damaging
    // ability used to make the same ring with the same six spokes, tinted:
    // one picture for a fireball, a dagger and an arrow, and the picture is
    // the thing anybody is actually looking at during a fight.
    const style = hitStyleFor(event.abilityId)
    const reach = REACH * weight * (event.crit ? 1.35 : 1)
    const spokes = event.crit ? 10 : 6

    switch (style) {
      case 'cleave':
        // An arc across the target, along the line the blow came in on.
        this.bursts.push({
          pos: event.pos,
          age: 0,
          life: event.crit ? 0.34 : 0.26,
          colour,
          reach: reach * 1.15,
          spokes: Math.round(spokes / 3),
          angle: event.angle,
          arc: 0.6,
          inward: false,
        })
        break
      case 'pierce':
        // A streak straight through, and a short spray out the back.
        this.bursts.push({
          pos: event.pos,
          age: 0,
          life: 0.24,
          colour,
          reach: reach * 1.5,
          spokes: 0,
          angle: event.angle,
          arc: -1,
          inward: false,
        })
        this.bursts.push({
          pos: event.pos,
          age: 0,
          life: 0.3,
          colour,
          reach: reach * 0.5,
          spokes: Math.round(spokes / 2),
          angle: event.angle,
          arc: 0,
          inward: false,
        })
        break
      case 'crush':
        // Short, wide and heavy: it does not travel, it arrives.
        this.bursts.push({
          pos: event.pos,
          age: 0,
          life: event.crit ? 0.4 : 0.3,
          colour,
          reach: reach * 0.72,
          spokes,
          angle: event.angle,
          arc: 1.1,
          inward: false,
        })
        break
      case 'wither':
        // Sinks in rather than pushing out, which is the same rule a heal
        // follows and reads as something arriving on a body.
        this.bursts.push({
          pos: event.pos,
          age: 0,
          life: 0.42,
          colour,
          reach: reach * 0.9,
          spokes: Math.round(spokes / 2),
          angle: event.angle,
          arc: 0,
          inward: true,
        })
        break
      default:
        this.bursts.push({
          pos: event.pos,
          age: 0,
          life: event.crit ? 0.44 : 0.34,
          colour,
          reach,
          spokes,
          angle: event.angle,
          arc: 0,
          inward: false,
        })
        break
    }

    if (event.empowered) this.empower(event, colour, weight, false)
  }

  /**
   * A second ring, for a hit the spec's own rule was paying for.
   *
   * A rogue's finisher on five combo points deals double and looked exactly
   * like one on none. This is the difference being visible: a wider ring
   * arriving a moment behind the hit, so the eye reads "that one counted"
   * without anything having to be written on screen.
   */
  private empower(event: EffectEvent, colour: string, weight: number, inward: boolean): void {
    this.bursts.push({
      pos: event.pos,
      age: -0.05,
      life: 0.46,
      colour,
      reach: REACH * weight * 1.9,
      spokes: 4,
      angle: event.angle + Math.PI / 4,
      arc: 0,
      inward,
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
      // A burst can be queued with a negative age to arrive a moment late —
      // the empowered ring does, so it reads as a second beat rather than a
      // thicker first one. Nothing is drawn until it has started.
      if (burst.age < 0) continue
      const t = Math.min(1, burst.age / burst.life)
      const fade = 1 - t
      const p = project(burst.pos)
      // A heal closes on the target instead of leaving it.
      const spread = burst.inward ? 1 - t : t
      const r = Math.max(1, burst.reach * (0.25 + spread * 0.75) * scale)

      ctx.strokeStyle = rgba(burst.colour, 0.85 * fade)
      ctx.lineWidth = Math.max(1, 4 * fade * scale)
      ctx.beginPath()
      if (burst.arc < 0) {
        // The dash: a line from where it started to where it ended, fading
        // and thinning from the tail.
        const run = burst.reach * scale
        const head = { x: p.x + Math.cos(burst.angle) * run, y: p.y + Math.sin(burst.angle) * run }
        const tail = {
          x: p.x + Math.cos(burst.angle) * run * t,
          y: p.y + Math.sin(burst.angle) * run * t,
        }
        ctx.moveTo(tail.x, tail.y)
        ctx.lineTo(head.x, head.y)
        ctx.lineWidth = Math.max(1, 5 * fade * scale)
      } else if (burst.arc > 0) {
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

  /**
   * How far to shove the view this frame, in world units.
   *
   * Two frequencies that do not divide into each other, so it reads as a jolt
   * rather than as a wobble, and it is applied to the world alone — a heads-up
   * display that shakes is a heads-up display nobody can read.
   */
  offset(): Vec2 {
    if (this.shakeMag === 0) return { x: 0, y: 0 }
    return {
      x: Math.sin(this.clock * 61) * this.shakeMag,
      y: Math.cos(this.clock * 47) * this.shakeMag,
    }
  }

  /** How much is on screen. Only the checks ask. */
  get count(): number {
    return this.bursts.length
  }

  /** Current shove, for the checks. */
  get shake(): number {
    return this.shakeMag
  }
}

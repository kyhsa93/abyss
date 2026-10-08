import { bossEffect, hitStyleFor, iconFor } from './icons'
import type { EffectEvent, SimState, Vec2 } from '../sim/types'
import { elementOf } from './element'
import { drawFx } from './fximage'
import { chestHeight } from './lpcimage'
import { DT, MELEE_RANGE, PARTY_RADIUS } from '../sim/constants'

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
  /**
   * A sprite to play over the drawn shape, or null for the shape alone.
   *
   * Over rather than instead: the ring's colour says which school landed on
   * you, and a sprite has its colour baked in. Layered, the ring keeps the
   * fact and the sprite adds the weight.
   */
  fx: string | null
  /** How wide to play it, in world units. */
  fxSize: number
  /**
   * How far above the floor to draw it, in world units.
   *
   * An actor's position is a point on the ground, so a hit pushed at a body's
   * position lands between its ankles. A hit on a person is raised to the
   * chest; a mechanic is not, because a mechanic is the floor.
   */
  lift: number
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
  /**
   * A weapon swing paired with the body it struck: the line it draws and the
   * ring it ends in, both in world units. Absent on everything else, and on a
   * swing nothing could be paired with, which keeps the old arc.
   */
  trail?: { length: number; end: number } | undefined
}

/**
 * What a swing's arc used to reach, and still does for a swing that cannot be
 * paired with the body it struck. Also the length below which a trail has no
 * floor.
 */
export const FALLBACK_REACH = 54

/** The most a trail is ever drawn: what the simulation lets a blow reach. */
const TRAIL_MAX = MELEE_RANGE

/**
 * How much of the way to the struck body's edge a trail goes. Any share from
 * 0.8 to 1 satisfies the rule; short of the edge so that the end ring sits on
 * the surface rather than a rounding error past it.
 */
const TRAIL_SHARE = 0.9

/** The end ring's radius is the trail's length held between these. */
const END_MIN = 4
const END_MAX = 12

/** Line and end ring are never thicker than this, in canvas units. */
export const TRAIL_WIDTH = 2

/** Peak opacity of a trail. A swing used to peak at 0.85, like everything. */
export const TRAIL_ALPHA = 0.5

/** How near a body must be to a hit's position to be the one that took it, before it is allowed any ground it covered since. */
const PAIR_TOLERANCE = 0.5

/**
 * How far a swing's line is drawn, given the distance from the attacker's
 * centre to the struck body's simulated surface.
 *
 * Nothing before the surface is passed, so the line never goes into the body;
 * where the attacker already stands inside it there is no line at all. The
 * 54-unit floor is only for a body far enough away that 0.8 of the way is more
 * than that, and 116 is the reach the simulation grants.
 */
export function trailLength(d: number): number {
  if (!(d > 0)) return 0
  if (d > TRAIL_MAX) return TRAIL_MAX
  if (d < FALLBACK_REACH) return d * TRAIL_SHARE
  return Math.max(d * TRAIL_SHARE, FALLBACK_REACH)
}

/** The range a trail's length has to fall in for a given d. */
export function trailBounds(d: number): { lo: number; hi: number } {
  if (!(d > 0)) return { lo: 0, hi: 0 }
  if (d > TRAIL_MAX) return { lo: TRAIL_MAX, hi: TRAIL_MAX }
  if (d < FALLBACK_REACH) return { lo: 0.8 * d, hi: d }
  return { lo: Math.max(0.8 * d, FALLBACK_REACH), hi: d }
}

/** The ring on the end of a trail. */
export function trailEnd(length: number): number {
  return Math.min(END_MAX, Math.max(END_MIN, length))
}

interface Body {
  pos: Vec2
  prevPos?: Vec2
  radius: number
  moveSpeed?: number
  faction?: string
}

/**
 * The body a swing struck, read back out of the events alone.
 *
 * The first hit after the swing that faces the same way is the one the
 * simulation pushed straight after it, on whoever it hit. The struck body is
 * then whichever one stands on that spot. Nothing here is added to the event,
 * so the simulation does not know it is being read. Null when either half is
 * missing, and the swing keeps its old arc.
 */
export function pairSwing(
  events: readonly EffectEvent[],
  at: number,
  bodies: ReadonlyArray<Body>,
): { d: number; length: number } | null {
  const swing = events[at]
  if (!swing || swing.kind !== 'swing') return null
  let hit: EffectEvent | null = null
  for (let i = at + 1; i < events.length; i++) {
    const e = events[i]!
    if (e.kind === 'impact' && e.angle === swing.angle) {
      hit = e
      break
    }
  }
  if (!hit) return null
  let body: Body | null = null
  let nearest = Infinity
  for (const b of bodies) {
    // Events are read after the whole tick, and a body can have moved since
    // it was struck. The tick began at `prevPos`, so it was standing on one of
    // the two.
    const off = Math.min(
      Math.hypot(b.pos.x - hit.pos.x, b.pos.y - hit.pos.y),
      b.prevPos ? Math.hypot(b.prevPos.x - hit.pos.x, b.prevPos.y - hit.pos.y) : Infinity,
    )
    // Half a unit, plus a tick's walk for a body that was shoved along after
    // it was struck: pushed apart from a neighbour, say, which is neither of
    // the two places above.
    if (off <= PAIR_TOLERANCE + (b.moveSpeed ?? 0) * DT && off < nearest) {
      nearest = off
      body = b
    }
  }
  if (!body) return null
  const rt = body.faction === 'party' ? PARTY_RADIUS : body.radius
  const d = Math.hypot(hit.pos.x - swing.pos.x, hit.pos.y - swing.pos.y) - rt
  return { d, length: trailLength(d) }
}

/** A hit is worth about this much reach at full power. */
const REACH = 46

/**
 * How far above the floor a hit is drawn.
 *
 * Chest height on a raider, or nothing at all if the thing that went off has a
 * reach of its own — that is a mechanic, and a mechanic happens on the floor
 * where it was telegraphed. Raising one would put a puddle in the air.
 *
 * A person's chest rather than the struck body's own, because an effect
 * carries where it happened and not who it happened to. Most of what is struck
 * in this game is raider-sized; a hit on the boss rides lower on it than its
 * own chest, which reads as a hit landing on a large thing rather than as a
 * mistake.
 */
function liftOf(event: EffectEvent): number {
  return event.radius > 0 ? 0 : chestHeight(PARTY_RADIUS)
}

/**
 * How wide a mechanic's detonation plays, against the floor it covered.
 *
 * Rather less than the whole of it. A single sprite stretched edge to edge
 * across a crush is one drawing blown up past the point it holds together,
 * and the ring that expands to the mechanic's full reach is already saying
 * where the edge was. This is the flash at the middle of that, and the ring
 * is the extent.
 */
const MECHANIC_FX = 1.15
const MAX_BURSTS = 90

/**
 * Which sprite a hit plays, chosen by what the art already says.
 *
 * Only where the two agree. Fire gets the flame, holy gets the cross, storm
 * gets the bolt — those are drawn in the colours those schools are already
 * shown in. Everywhere else takes the neutral burst rather than a recolour: an
 * orange flame tinted violet stops looking like fire and starts looking like a
 * mistake, and the ring underneath is already saying violet.
 */
const FX_BY_SCHOOL: Array<[RegExp, string]> = [
  [/^fire/, 'flame'],
  [/^holy/, 'holy'],
  [/^storm/, 'bolt'],
  [/^nature|^water/, 'gust'],
]

function fxFor(abilityId: string | null, kind: string, crit: boolean): string | null {
  if (kind === 'heal') return 'heal'
  if (kind === 'swing') return 'slash'
  if (kind !== 'impact') return null
  // A crit is the one hit worth the biggest thing in the set, whatever school
  // it belongs to. It is also the hit the camera already moved for.
  if (crit) return 'blast'
  if (!abilityId) return 'slash'
  const school = elementOf(abilityId, abilityId)
  if (school) for (const [pattern, name] of FX_BY_SCHOOL) if (pattern.test(school)) return name
  return 'burst'
}

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
  if (abilityId.startsWith('boss_')) return bossEffect(abilityId)?.colour ?? BOSS_CAST
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
    // The checks hand this a bare list of events more than once.
    const actors = s.actors ?? []
    for (let i = 0; i < s.effects.length; i++) {
      const event = s.effects[i]!
      if (event.kind === 'swing') {
        // A blow that kills something that is then taken out of the fight in
        // the same tick leaves nothing to read: it is looked for among the
        // bodies as the last tick left them.
        const paired = pairSwing(s.effects, i, actors) ?? pairSwing(s.effects, i, this.seen)
        if (!paired) this.fallbacks++
        this.spawn(event, paired?.length)
      } else this.spawn(event)
    }
    // Copied, because a position is rewritten in place every tick. Reused, so
    // this allocates only when a body arrives.
    const n = actors.length
    this.seen.length = n
    for (let i = 0; i < n; i++) {
      const a = actors[i]!
      const b = (this.seen[i] ??= { pos: { x: 0, y: 0 }, radius: 0 })
      b.pos.x = a.pos.x
      b.pos.y = a.pos.y
      b.radius = a.radius
      b.moveSpeed = a.moveSpeed
      b.faction = a.faction
    }
  }

  private seen: Body[] = []

  /** Swings that found no struck body and drew the old arc. Only the checks ask. */
  fallbacks = 0

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

  private spawn(event: EffectEvent, trail?: number): void {
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
        lift: liftOf(event),
        // A cast is a wind-up rather than a landing, and the sprite set has
        // nothing that reads as one. The ring alone is right here.
        fx: null,
        fxSize: 0,
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
        lift: liftOf(event),
        fx: null,
        fxSize: 0,
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
        lift: liftOf(event),
        fx: null,
        fxSize: 0,
        age: 0,
        life: 0.22,
        colour: WEAPON,
        reach: FALLBACK_REACH,
        spokes: 0,
        angle: event.angle,
        arc: 0.85,
        inward: false,
        trail: trail === undefined ? undefined : { length: trail, end: trailEnd(trail) },
      })
      return
    }

    // A heal is its own shape and always was: it closes on whoever it landed
    // on rather than leaving them.
    if (event.kind === 'heal') {
      this.bursts.push({
        pos: event.pos,
        lift: liftOf(event),
        fx: null,
        fxSize: 0,
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

    // One sprite for the hit, carried by whichever burst is pushed first. A
    // pierce throws two and a cleave one; playing it on each would stack the
    // same animation on itself and read as a smear.
    const fx = fxFor(event.abilityId, event.kind, event.crit)
    // About the width of a body, and no more. The first pass ran this at two
    // and a half times the ring's reach, which put a fireball over a quarter of
    // the screen and hid the boss behind its own hit — the exact failure the
    // floor texture had, arriving from the other direction.
    //
    // Unless the thing that went off has a size of its own, which is what a
    // mechanic has and a hit does not. A crush covering half the arena and a
    // spire the width of one body used to flash the same sprite, because the
    // only size on hand was read off damage — and damage says how much it hurt,
    // not how much floor it took. So a mechanic is drawn at its own reach.
    //
    // Playing it that large is safe here and nowhere else: the telegraph has
    // already run, so the information this covers is information the player has
    // finished acting on. Before that instant the same sprite would be hiding
    // the one thing on the floor worth reading.
    const fxSize =
      event.radius > 0 ? event.radius * MECHANIC_FX : reach * (event.crit ? 1.15 : 0.95)
    let used = false
    const once = () => {
      if (used) return null
      used = true
      return fx
    }

    switch (style) {
      case 'cleave':
        // An arc across the target, along the line the blow came in on.
        this.bursts.push({
          pos: event.pos,
          lift: liftOf(event),
          fx: once(),
          fxSize,
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
          lift: liftOf(event),
          fx: once(),
          fxSize,
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
          lift: liftOf(event),
          fx: once(),
          fxSize,
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
          lift: liftOf(event),
          fx: once(),
          fxSize,
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
          lift: liftOf(event),
          fx: once(),
          fxSize,
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
          lift: liftOf(event),
          fx: once(),
          fxSize,
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
      lift: liftOf(event),
      fx: null,
      fxSize: 0,
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
  draw(
    ctx: CanvasRenderingContext2D,
    project: (p: Vec2) => Vec2,
    scale: number,
    /**
     * How far the world is turned under the camera.
     *
     * Passed in beside the projection and for the same reason: a burst's
     * bearing is the one the fight gave it — the line a blow came in on — and
     * every shape drawn from it lands on the glass, where that line is turned.
     * Without this a cleave arced away from the blow that made it.
     */
    turn = 0,
  ): void {
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
      // Off the floor, in screen space: height above the ground is not a
      // coordinate on a plane the camera is looking down at.
      p.y -= burst.lift * scale
      const aim = burst.angle + turn
      // A heal closes on the target instead of leaving it.
      const spread = burst.inward ? 1 - t : t
      const r = Math.max(1, burst.reach * (0.25 + spread * 0.75) * scale)

      // The sprite over the shape, on the same clock. Drawn before the ring
      // rather than after so the ring — which is the part carrying the school
      // colour — stays the thing on top.
      if (burst.fx) {
        drawFx(ctx, burst.fx, p.x, p.y, burst.fxSize * scale, t, fade)
      }

      if (burst.trail) {
        this.drawTrail(ctx, project, burst, p, t, fade, scale)
        continue
      }

      ctx.strokeStyle = rgba(burst.colour, 0.85 * fade)
      ctx.lineWidth = Math.max(1, 4 * fade * scale)
      ctx.beginPath()
      if (burst.arc < 0) {
        // The dash: a line from where it started to where it ended, fading
        // and thinning from the tail.
        const run = burst.reach * scale
        const head = { x: p.x + Math.cos(aim) * run, y: p.y + Math.sin(aim) * run }
        const tail = {
          x: p.x + Math.cos(aim) * run * t,
          y: p.y + Math.sin(aim) * run * t,
        }
        ctx.moveTo(tail.x, tail.y)
        ctx.lineTo(head.x, head.y)
        ctx.lineWidth = Math.max(1, 5 * fade * scale)
      } else if (burst.arc > 0) {
        ctx.arc(p.x, p.y, r, aim - burst.arc, aim + burst.arc)
      } else {
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      }
      ctx.stroke()

      for (let i = 0; i < burst.spokes; i++) {
        const a = aim + (i / burst.spokes) * Math.PI * 2
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
   * A swing as a thin line from the attacker to the body it struck, with a
   * small ring where it lands.
   *
   * The line is worked out in the world and then projected, so on the glass it
   * ends on the struck body's surface and not wherever a screen-space angle
   * happens to point. Nothing is drawn past the end of it: the ring opens
   * towards the attacker.
   */
  private drawTrail(
    ctx: CanvasRenderingContext2D,
    project: (p: Vec2) => Vec2,
    burst: Burst,
    from: Vec2,
    t: number,
    fade: number,
    scale: number,
  ): void {
    const trail = burst.trail!
    // Out to the end quickly and then holds, so the line reads as arriving.
    const grow = 1 - (1 - Math.min(1, t / 0.4)) ** 2
    const run = trail.length * grow
    ctx.strokeStyle = rgba(burst.colour, TRAIL_ALPHA * fade)
    ctx.lineWidth = TRAIL_WIDTH
    const end = project({
      x: burst.pos.x + Math.cos(burst.angle) * run,
      y: burst.pos.y + Math.sin(burst.angle) * run,
    })
    end.y -= burst.lift * scale
    if (run > 0) {
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(end.x, end.y)
      ctx.stroke()
    }
    // Open towards the attacker, and only ever behind the end.
    const back =
      run > 0 ? Math.atan2(from.y - end.y, from.x - end.x) : Math.atan2(-Math.sin(burst.angle), -Math.cos(burst.angle))
    ctx.beginPath()
    ctx.arc(end.x, end.y, trail.end * scale, back - burst.arc, back + burst.arc)
    ctx.stroke()
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

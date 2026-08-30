/**
 * Bodies, drawn rather than dotted.
 *
 * Everything on this floor used to be a filled circle with a letter in it,
 * which is honest about position and silent about everything else. Two things
 * were being thrown away by that.
 *
 * The first is what someone is. Colour already says the class, but ten
 * colours is ten colours: a mage and a shaman are two blues, and at a glance
 * on a phone that is one blue. A silhouette is a second, redundant channel
 * for the same fact, and redundancy is what survives a small screen.
 *
 * The second is bearing. Every actor here has a `facing`, and the gaze is
 * answered by turning away from the boss — so the one mechanic that asks
 * which way you are pointing was being answered off a number that nothing on
 * screen showed.
 *
 * Both are answered here, and deliberately not in the same way. A body drawn
 * from above and turned with its bearing was tried first and it reads as an
 * insect: a human seen from directly overhead is a blob with shoulders, and
 * rotating that blob makes it worse, not clearer. So the body stands up and
 * faces the screen — head, shoulders, arms, a weapon in its hand, which is
 * what a person looks like at twenty pixels — and the bearing goes on the
 * ground under it, as a mark on the rim of the disc it is standing on. The
 * body only mirrors, left or right, with the way it is turned.
 *
 * There is no art in here and there is not going to be any. This is the same
 * primitives the rest of the render path uses — arcs, lines, filled paths —
 * so it costs nothing to load, scales to any size, recolours itself from the
 * class table, and cannot go stale against a sprite sheet nobody regenerated.
 *
 * The footprint stays where it was. `drawActor` still fills the plain disc at
 * the actor's true radius before calling in here, because that disc is the
 * hitbox: a body drawn over it is a picture, and a picture must never be the
 * thing position is read off.
 */

export type BodyKind = 'party' | 'boss' | 'add'

export interface BodyLook {
  kind: BodyKind
  /** Only meaningful for a party body; the boss and its summons have their own. */
  classId: string
  role: 'tank' | 'healer' | 'dps'
  /** Screen centre of the footprint. */
  x: number
  y: number
  /** The footprint radius in screen pixels — the hitbox, unchanged. */
  r: number
  facing: number
  /** Whatever the caller resolved: class colour, boss accent, or the dead grey. */
  colour: string
  alive: boolean
  /** Moving bodies take steps; standing ones do not. */
  moving: boolean
  casting: boolean
  clock: number
}

/**
 * Under this many pixels a body is a dot again.
 *
 * A twenty-five man on a portrait phone puts tokens at seven or eight pixels,
 * and a shoulder pad drawn at eight pixels is one dark pixel that reads as
 * dirt on the screen. Detail that cannot be resolved is not neutral — it eats
 * the silhouette it was meant to add to. So the disc keeps the small sizes,
 * where colour and the role letter are all that survive anyway.
 */
export const BODY_MIN_R = 9

/**
 * How far above the footprint a body reaches, in units of the radius.
 *
 * Health bars and names are placed off this: a standing body would otherwise
 * be drawn straight through the bar belonging to the body behind it.
 */
export const BODY_HEIGHT = 2.3

/** Under this, a body keeps its shape and loses whatever it was holding. */
export const KIT_MIN_R = 15

/** Mixes two hex colours, `t` of the way from the first to the second. */
export function mix(from: string, to: string, t: number): string {
  const a = rgb(from)
  const b = rgb(to)
  return `#${a.map((v, i) => Math.round(v + (b[i]! - v) * t).toString(16).padStart(2, '0')).join('')}`
}

function rgb(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '')
  if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!
  const n = Number.parseInt(h.slice(0, 6), 16)
  if (!Number.isFinite(n)) return [200, 200, 200]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const OUTLINE = '#0a0a0f'

/**
 * Draws a body standing on the footprint at (x, y).
 *
 * Everything is in units of the footprint radius, with the feet just below
 * the centre and up being negative, so one set of numbers serves a
 * nine-pixel thrall and a sixty-pixel boss.
 */
export function drawBody(ctx: CanvasRenderingContext2D, look: BodyLook): void {
  if (look.r < BODY_MIN_R) return

  const dark = mix(look.colour, OUTLINE, 0.45)
  const light = mix(look.colour, '#ffffff', 0.45)
  const line = 1.9 / look.r

  ctx.save()
  ctx.translate(look.x, look.y)

  // The bearing, on the ground rather than on the body: an arc on the rim of
  // the disc, pointing where this one is turned. It is the only thing here
  // that rotates, which is what keeps the body itself readable.
  if (look.alive) {
    ctx.save()
    ctx.rotate(look.facing)
    ctx.beginPath()
    ctx.arc(0, 0, look.r * 0.92, -0.36, 0.36)
    ctx.strokeStyle = light
    ctx.globalAlpha = ctx.globalAlpha * 0.55
    ctx.lineWidth = Math.max(1.5, look.r * 0.1)
    ctx.lineCap = 'round'
    ctx.stroke()
    ctx.restore()
  }

  ctx.scale(look.r, look.r)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.lineWidth = line
  ctx.strokeStyle = OUTLINE

  if (!look.alive) {
    // A corpse is a body that stopped being one and became a shape on the
    // floor. Drawing the full kit greyed out reads as "still playing", so it
    // gets its own posture: down, and flat.
    ctx.rotate(1.35)
    ctx.scale(1, 0.75)
    drawPerson(ctx, { ...look, moving: false, casting: false }, dark, light, line, true)
    ctx.restore()
    return
  }

  // A little bob while walking, which is the whole animation budget and is
  // enough: a body that moves up and down reads as moving, and one that does
  // not reads as standing.
  if (look.moving) ctx.translate(0, -Math.abs(Math.sin(look.clock * 9)) * 0.06)

  // Mirrored rather than turned: a body facing left is the same body.
  if (Math.cos(look.facing) < 0) ctx.scale(-1, 1)

  if (look.kind === 'boss') drawBoss(ctx, look, dark, light, line)
  else if (look.kind === 'add') drawAdd(ctx, look, dark, light, line)
  else drawPerson(ctx, look, dark, light, line, false)

  ctx.restore()
}

/** A party member, seen from the front: legs, torso, arms, head, and a kit. */
function drawPerson(
  ctx: CanvasRenderingContext2D,
  look: BodyLook,
  dark: string,
  light: string,
  line: number,
  fallen: boolean,
): void {
  // The walk. One leg forward and one back, scissoring, sampled off the
  // shared clock rather than a per-actor timer so it stays deterministic and
  // costs no state — bodies fall out of step with each other anyway, because
  // their positions are what decide whether they are stepping at all.
  const step = look.moving ? Math.sin(look.clock * 9 + look.x * 0.05) : 0

  // Legs a shade off the torso rather than the outline: the footprint under
  // them is already dark, and a dark leg on it is a leg nobody can see.
  const leg = mix(look.colour, OUTLINE, 0.22)
  limb(ctx, 0.2, -0.35, 0.2 + step * 0.22, 0.3 - Math.max(0, step) * 0.12, leg, 0.24, line)
  limb(ctx, -0.2, -0.35, -0.2 - step * 0.22, 0.3 + Math.min(0, step) * 0.12, leg, 0.24, line)

  // Torso: hips narrow, shoulders wide. The one shape carrying the class
  // colour, so it is the biggest solid thing on the body.
  ctx.beginPath()
  ctx.moveTo(-0.3, -0.26)
  ctx.quadraticCurveTo(-0.42, -0.8, -0.5, -1.12)
  ctx.quadraticCurveTo(-0.4, -1.32, -0.15, -1.34)
  ctx.lineTo(0.15, -1.34)
  ctx.quadraticCurveTo(0.4, -1.32, 0.5, -1.12)
  ctx.quadraticCurveTo(0.42, -0.8, 0.3, -0.26)
  ctx.closePath()
  ctx.fillStyle = look.colour
  ctx.fill()
  ctx.lineWidth = line * 1.2
  ctx.stroke()
  ctx.lineWidth = line

  // Arms. Both come up while casting, which is the one pose that has to read
  // at a distance: a caster standing in fire is a caster who has not noticed.
  const handY = look.casting ? -1.05 : -0.62
  const handX = look.casting ? 0.5 : 0.56
  limb(ctx, -0.44, -1.08, -handX, handY, look.colour, 0.2, line)
  limb(ctx, 0.44, -1.08, handX, handY, look.colour, 0.2, line)

  // Shoulders. A tank's are the widest thing on the floor, which is the
  // cheapest way to make the body holding the boss findable in a crowd.
  const pad = look.role === 'tank' ? 0.29 : 0.21
  ellipse(ctx, -0.47, -1.12, pad, pad * 0.72, dark, OUTLINE, line)
  ellipse(ctx, 0.47, -1.12, pad, pad * 0.72, dark, OUTLINE, line)

  // Head, and something over it so the top of the silhouette is not a ball.
  circle(ctx, 0, -1.6, 0.29, light, OUTLINE, line * 1.2)
  ctx.beginPath()
  ctx.arc(0, -1.62, 0.31, Math.PI * 1.06, Math.PI * 1.94)
  ctx.strokeStyle = dark
  ctx.lineWidth = line * 3
  ctx.stroke()
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = line

  // A healer wears a ring over the head. Role is the letter on the token and
  // always has been, but the letter is the first thing a crowd eats, and the
  // healer is the one role you go looking for in a crowd.
  if (look.role === 'healer') {
    ctx.beginPath()
    ctx.ellipse(0, -2.02, 0.34, 0.1, 0, 0, Math.PI * 2)
    ctx.strokeStyle = light
    ctx.lineWidth = line * 1.6
    ctx.stroke()
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = line
  }

  // Below this the kit comes off. A greatsword at twelve pixels is three
  // pixels of light on the wrong side of the body: it does not say "warrior",
  // it says the token has a smudge on it, and it costs the silhouette the
  // clean edge that was doing the work. A phone gets bodies, not props.
  if (!fallen && look.r >= KIT_MIN_R) kit(ctx, look, dark, light, line)

  if (look.casting) {
    // Something gathering over the hands. The cast bar under the body says
    // how long; this says who, from across the arena.
    const pulse = 0.16 + 0.04 * Math.sin(look.clock * 12)
    circle(ctx, 0, -1.02, pulse, light, light, line)
  }
}

/**
 * What each class is holding.
 *
 * One prop per class, chosen so the silhouettes differ at the edges rather
 * than in the middle: a bow is a circle beside the body, a two-hander is
 * taller than its owner, a mage is a triangle on top. Ten of these on one
 * floor have to be told apart by shape alone, since the colours are already
 * crowded.
 */
function kit(
  ctx: CanvasRenderingContext2D,
  look: BodyLook,
  dark: string,
  light: string,
  line: number,
): void {
  // A kit hangs where a lowered hand holds it, casting or not. Lifting it
  // with the arms was tried and puts a greatsword in the sky above the body,
  // which is worse than an arm that has let go of it for a second.
  const lift = 0

  switch (look.classId) {
    case 'warrior': {
      // A greatsword, taller than the body holding it.
      limb(ctx, 0.62, 0.06 + lift, 0.62, -1.95 + lift, light, 0.14, line)
      limb(ctx, 0.4, -1.52 + lift, 0.84, -1.52 + lift, dark, 0.12, line)
      if (look.role === 'tank') ellipse(ctx, -0.66, -0.86, 0.26, 0.38, dark, light, line * 1.4)
      break
    }
    case 'paladin': {
      // A hammer: haft, and a block on the end of it.
      limb(ctx, 0.62, 0.02 + lift, 0.62, -1.62 + lift, light, 0.13, line)
      block(ctx, 0.62, -1.78 + lift, 0.42, 0.32, dark, light, line)
      ellipse(ctx, -0.66, -0.86, 0.26, 0.38, dark, light, line * 1.4)
      break
    }
    case 'priest': {
      // A staff with a light on it.
      limb(ctx, 0.62, 0.24 + lift, 0.62, -1.82 + lift, light, 0.12, line)
      circle(ctx, 0.62, -1.98 + lift, 0.17, light, OUTLINE, line)
      break
    }
    case 'druid': {
      // Antlers. The one class not holding a weapon at all.
      antler(ctx, 1, light, line)
      antler(ctx, -1, light, line)
      break
    }
    case 'shaman': {
      // A totem carried rather than swung: blocks stacked on a short haft.
      limb(ctx, -0.68, -0.2, -0.68, -1.42, light, 0.12, line)
      block(ctx, -0.68, -1.02, 0.42, 0.22, dark, light, line)
      block(ctx, -0.68, -1.44, 0.42, 0.22, dark, light, line)
      break
    }
    case 'mage': {
      // The hat is the silhouette; the orb is where the cast comes from.
      ctx.beginPath()
      ctx.moveTo(0, -2.42)
      ctx.lineTo(-0.44, -1.72)
      ctx.lineTo(0.44, -1.72)
      ctx.closePath()
      ctx.fillStyle = dark
      ctx.fill()
      ctx.lineWidth = line * 1.2
      ctx.stroke()
      ctx.lineWidth = line
      circle(ctx, 0.62, -0.68 + lift, 0.16, light, OUTLINE, line)
      break
    }
    case 'warlock': {
      // Something of its own, going round it: the class in one shape.
      const a = look.clock * 1.6
      circle(ctx, Math.cos(a) * 1.02, -0.95 + Math.sin(a) * 0.34, 0.26, dark, light, line * 2)
      circle(ctx, -Math.cos(a) * 0.72, -0.95 - Math.sin(a) * 0.24, 0.13, dark, light, line * 1.2)
      break
    }
    case 'hunter': {
      // A bow: an arc with the string drawn as its chord.
      ctx.beginPath()
      ctx.arc(0.5, -0.95, 0.62, Math.PI * 0.42, Math.PI * 1.58)
      ctx.strokeStyle = light
      ctx.lineWidth = line * 2.4
      ctx.stroke()
      ctx.strokeStyle = OUTLINE
      ctx.lineWidth = line
      limb(
        ctx,
        0.5 + Math.cos(Math.PI * 0.42) * 0.62,
        -0.95 + Math.sin(Math.PI * 0.42) * 0.62,
        0.5 + Math.cos(Math.PI * 1.58) * 0.62,
        -0.95 + Math.sin(Math.PI * 1.58) * 0.62,
        light,
        0.06,
        line * 0.6,
      )
      break
    }
    case 'rogue': {
      // Two short blades, one in each hand: the only symmetric kit here.
      limb(ctx, 0.62, -0.4 + lift, 0.78, -1.1 + lift, light, 0.11, line)
      limb(ctx, -0.62, -0.4 + lift, -0.78, -1.1 + lift, light, 0.11, line)
      break
    }
    default:
      break
  }
}

function antler(ctx: CanvasRenderingContext2D, side: number, colour: string, line: number): void {
  ctx.beginPath()
  ctx.moveTo(0.18 * side, -1.8)
  ctx.lineTo(0.42 * side, -2.06)
  ctx.lineTo(0.6 * side, -2.02)
  ctx.moveTo(0.42 * side, -2.06)
  ctx.lineTo(0.44 * side, -2.28)
  ctx.strokeStyle = colour
  ctx.lineWidth = line * 3
  ctx.stroke()
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = line
}

/**
 * The boss.
 *
 * Bigger is not a silhouette — a large person is still a person, and the boss
 * has been telling the party which way it is turned since the first cone. So
 * it gets the shapes nothing else on the floor has: horns, a hunch, and arms
 * that reach past its own feet.
 */
function drawBoss(
  ctx: CanvasRenderingContext2D,
  look: BodyLook,
  dark: string,
  light: string,
  line: number,
): void {
  limb(ctx, 0.3, -0.4, 0.34, 0.34, dark, 0.34, line)
  limb(ctx, -0.3, -0.4, -0.34, 0.34, dark, 0.34, line)

  // A hunched slab of a torso, wider at the shoulders than it is tall.
  ctx.beginPath()
  ctx.moveTo(-0.42, -0.3)
  ctx.quadraticCurveTo(-0.7, -0.8, -0.86, -1.15)
  ctx.quadraticCurveTo(-0.5, -1.42, 0, -1.4)
  ctx.quadraticCurveTo(0.5, -1.42, 0.86, -1.15)
  ctx.quadraticCurveTo(0.7, -0.8, 0.42, -0.3)
  ctx.closePath()
  ctx.fillStyle = look.colour
  ctx.fill()
  ctx.lineWidth = line * 1.4
  ctx.stroke()
  ctx.lineWidth = line

  const reach = look.casting ? -1.5 : -0.5
  limb(ctx, -0.78, -1.08, -1.12, reach, dark, 0.28, line)
  limb(ctx, 0.78, -1.08, 1.12, reach, dark, 0.28, line)
  circle(ctx, -0.82, -1.14, 0.3, dark, OUTLINE, line)
  circle(ctx, 0.82, -1.14, 0.3, dark, OUTLINE, line)

  circle(ctx, 0, -1.66, 0.42, dark, OUTLINE, line * 1.2)
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(0.26 * side, -1.94)
    ctx.quadraticCurveTo(0.58 * side, -2.12, 0.5 * side, -2.36)
    ctx.strokeStyle = light
    ctx.lineWidth = line * 5
    ctx.stroke()
  }
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = line

  // Eyes: the cheapest way to make a front read as a front.
  circle(ctx, -0.16, -1.7, 0.1, '#ffffff', OUTLINE, line * 0.6)
  circle(ctx, 0.16, -1.7, 0.1, '#ffffff', OUTLINE, line * 0.6)

  if (look.casting) {
    const pulse = 0.22 + 0.06 * Math.sin(look.clock * 10)
    circle(ctx, 0, -1.85, pulse, light, light, line)
  }
}

/**
 * A summon.
 *
 * Small, hunched and spiked — deliberately not a person, because the one
 * question the party asks about a thrall is whether it is a thrall or one of
 * theirs, and that answer should not depend on reading a colour.
 */
function drawAdd(
  ctx: CanvasRenderingContext2D,
  look: BodyLook,
  dark: string,
  light: string,
  line: number,
): void {
  const step = look.moving ? Math.sin(look.clock * 11) : 0
  limb(ctx, 0.22, -0.3, 0.24 + step * 0.16, 0.3, dark, 0.2, line)
  limb(ctx, -0.22, -0.3, -0.24 - step * 0.16, 0.3, dark, 0.2, line)

  ellipse(ctx, 0, -0.72, 0.55, 0.5, look.colour, OUTLINE, line * 1.2)
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(0.3 * side, -0.95)
    ctx.lineTo(0.72 * side, -1.5)
    ctx.strokeStyle = dark
    ctx.lineWidth = line * 2.4
    ctx.stroke()
  }
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = line
  circle(ctx, 0, -1.16, 0.28, light, OUTLINE, line * 1.2)
}

// --- primitives ------------------------------------------------------------

function circle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
  stroke: string,
  line: number,
): void {
  ellipse(ctx, x, y, r, r, fill, stroke, line)
}

function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
  stroke: string,
  line: number,
): void {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = line
  ctx.stroke()
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = line
}

/** An arm, a leg or a haft: one thick round-capped line with an outline. */
function limb(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  colour: string,
  width: number,
  line: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = width + line * 1.6
  ctx.stroke()
  ctx.strokeStyle = colour
  ctx.lineWidth = width
  ctx.stroke()
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = line
}

/** A hammer head or a totem: a filled box centred on a point. */
function block(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke: string,
  line: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x - w / 2, y - h / 2)
  ctx.lineTo(x + w / 2, y - h / 2)
  ctx.lineTo(x + w / 2, y + h / 2)
  ctx.lineTo(x - w / 2, y + h / 2)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = line * 1.4
  ctx.stroke()
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = line
}

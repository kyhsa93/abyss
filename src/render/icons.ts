/**
 * Ability icons, drawn rather than loaded.
 *
 * Same reason as the rest of the game: no art assets. Each icon is a shape
 * primitive plus a colour, and the pair has to be unique across the spell
 * list — a bar where two buttons look alike is worse than one with no icons
 * at all, so uniqueness is asserted in the checks.
 */

export type IconShape =
  | 'blade'
  | 'dagger'
  | 'shield'
  | 'cross'
  | 'hammer'
  | 'droplet'
  | 'leaf'
  | 'star'
  | 'wave'
  | 'flame'
  | 'bolt'
  | 'orb'
  | 'spiral'
  | 'arrow'
  | 'moon'
  | 'burst'

export interface IconSpec {
  shape: IconShape
  colour: string
  /** Repeats of the motif, for chained or multi-hit abilities. */
  repeat?: number
}

const ICONS: Record<string, IconSpec> = {
  // warrior
  cleave: { shape: 'blade', colour: '#f97316' },
  shield_slam: { shape: 'shield', colour: '#60a5fa' },
  shield_wall: { shape: 'shield', colour: '#fbbf24' },
  taunt: { shape: 'burst', colour: '#f97316' },
  charge: { shape: 'arrow', colour: '#c79c6e' },
  mortal_strike: { shape: 'blade', colour: '#ef4444' },
  rend: { shape: 'blade', colour: '#b91c1c', repeat: 3 },
  execute: { shape: 'blade', colour: '#fde047' },

  // paladin
  consecration: { shape: 'cross', colour: '#f59e0b' },
  avengers_shield: { shape: 'shield', colour: '#fcd34d' },
  divine_protection: { shape: 'shield', colour: '#fef3c7' },
  hand_of_reckoning: { shape: 'hammer', colour: '#fca5a5' },
  crusader_strike: { shape: 'hammer', colour: '#fbbf24' },
  judgement: { shape: 'cross', colour: '#fde68a' },
  hammer_of_wrath: { shape: 'hammer', colour: '#f59e0b', repeat: 2 },
  holy_light: { shape: 'cross', colour: '#fef9c3' },
  lay_on_hands: { shape: 'burst', colour: '#fde047' },
  holy_shock: { shape: 'bolt', colour: '#fcd34d' },

  // priest
  heal: { shape: 'cross', colour: '#e2e8f0' },
  renew: { shape: 'droplet', colour: '#bbf7d0' },
  flash_heal: { shape: 'cross', colour: '#a5f3fc' },
  smite: { shape: 'bolt', colour: '#f8fafc' },
  mind_flay: { shape: 'spiral', colour: '#c084fc' },
  shadow_word_pain: { shape: 'spiral', colour: '#7e22ce' },
  mind_blast: { shape: 'burst', colour: '#a855f7' },

  // druid
  swipe: { shape: 'blade', colour: '#a16207' },
  maul: { shape: 'blade', colour: '#78350f', repeat: 2 },
  frenzied_regen: { shape: 'shield', colour: '#65a30d' },
  growl: { shape: 'wave', colour: '#a16207' },
  healing_touch: { shape: 'leaf', colour: '#22c55e' },
  rejuvenation: { shape: 'leaf', colour: '#86efac' },
  swiftmend: { shape: 'leaf', colour: '#facc15' },
  shred: { shape: 'dagger', colour: '#a16207' },
  rake: { shape: 'dagger', colour: '#65a30d', repeat: 3 },
  ferocious_bite: { shape: 'burst', colour: '#a16207' },
  starsurge: { shape: 'star', colour: '#c4b5fd' },
  wrath: { shape: 'orb', colour: '#a78bfa' },
  moonfire: { shape: 'moon', colour: '#818cf8' },
  starfire: { shape: 'star', colour: '#6366f1' },

  // shaman
  healing_wave: { shape: 'wave', colour: '#2dd4bf' },
  riptide: { shape: 'wave', colour: '#5eead4' },
  chain_heal: { shape: 'wave', colour: '#14b8a6', repeat: 3 },
  lava_burst: { shape: 'flame', colour: '#fb923c' },
  lightning_bolt: { shape: 'bolt', colour: '#38bdf8' },
  flame_shock: { shape: 'flame', colour: '#f87171' },
  chain_lightning: { shape: 'bolt', colour: '#0ea5e9', repeat: 3 },

  // mage
  frostbolt: { shape: 'orb', colour: '#7dd3fc' },
  living_bomb: { shape: 'orb', colour: '#fb7185' },
  pyroblast: { shape: 'flame', colour: '#dc2626' },

  // hunter
  steady_shot: { shape: 'arrow', colour: '#a3e635' },
  serpent_sting: { shape: 'arrow', colour: '#4d7c0f' },
  aimed_shot: { shape: 'arrow', colour: '#facc15', repeat: 2 },

  // rogue
  sinister_strike: { shape: 'dagger', colour: '#cbd5e1' },
  rupture: { shape: 'dagger', colour: '#991b1b' },
  eviscerate: { shape: 'dagger', colour: '#f43f5e', repeat: 2 },
}

export function iconFor(abilityId: string): IconSpec {
  return ICONS[abilityId] ?? { shape: 'orb', colour: '#94a3b8' }
}

export function allIcons(): Array<[string, IconSpec]> {
  return Object.entries(ICONS)
}

/** Draws the icon centred on (cx, cy), sized to fit a box of `size`. */
export function drawIcon(
  ctx: CanvasRenderingContext2D,
  abilityId: string,
  cx: number,
  cy: number,
  size: number,
  dim: boolean,
): void {
  const spec = iconFor(abilityId)
  const r = size / 2

  ctx.save()
  ctx.globalAlpha = dim ? 0.4 : 1
  ctx.strokeStyle = spec.colour
  ctx.fillStyle = spec.colour
  ctx.lineWidth = Math.max(1.5, size * 0.09)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const repeat = spec.repeat ?? 1
  for (let i = 0; i < repeat; i++) {
    // Repeats fan out slightly so a triple reads as three, not as one thick one.
    const offset = repeat === 1 ? 0 : (i - (repeat - 1) / 2) * size * 0.22
    shape(ctx, spec.shape, cx + offset, cy, repeat === 1 ? r : r * 0.62)
  }

  ctx.restore()
}

function shape(ctx: CanvasRenderingContext2D, kind: IconShape, x: number, y: number, r: number): void {
  ctx.beginPath()
  switch (kind) {
    case 'blade':
      ctx.moveTo(x - r * 0.7, y + r * 0.75)
      ctx.lineTo(x + r * 0.7, y - r * 0.75)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x + r * 0.15, y - r * 0.75)
      ctx.lineTo(x + r * 0.7, y - r * 0.75)
      ctx.lineTo(x + r * 0.7, y - r * 0.2)
      ctx.stroke()
      break

    case 'dagger':
      ctx.moveTo(x, y - r * 0.85)
      ctx.lineTo(x, y + r * 0.5)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x - r * 0.5, y + r * 0.45)
      ctx.lineTo(x + r * 0.5, y + r * 0.45)
      ctx.stroke()
      break

    case 'shield':
      ctx.moveTo(x, y - r * 0.85)
      ctx.lineTo(x + r * 0.75, y - r * 0.45)
      ctx.lineTo(x + r * 0.55, y + r * 0.5)
      ctx.lineTo(x, y + r * 0.9)
      ctx.lineTo(x - r * 0.55, y + r * 0.5)
      ctx.lineTo(x - r * 0.75, y - r * 0.45)
      ctx.closePath()
      ctx.stroke()
      break

    case 'cross':
      ctx.moveTo(x, y - r * 0.9)
      ctx.lineTo(x, y + r * 0.9)
      ctx.moveTo(x - r * 0.65, y - r * 0.15)
      ctx.lineTo(x + r * 0.65, y - r * 0.15)
      ctx.stroke()
      break

    case 'hammer':
      ctx.moveTo(x, y + r * 0.9)
      ctx.lineTo(x, y - r * 0.2)
      ctx.stroke()
      ctx.beginPath()
      ctx.rect(x - r * 0.7, y - r * 0.85, r * 1.4, r * 0.62)
      ctx.stroke()
      break

    case 'droplet':
      ctx.moveTo(x, y - r * 0.9)
      ctx.quadraticCurveTo(x + r * 0.85, y + r * 0.25, x, y + r * 0.85)
      ctx.quadraticCurveTo(x - r * 0.85, y + r * 0.25, x, y - r * 0.9)
      ctx.stroke()
      break

    case 'leaf':
      ctx.moveTo(x - r * 0.75, y + r * 0.7)
      ctx.quadraticCurveTo(x - r * 0.2, y - r * 0.95, x + r * 0.8, y - r * 0.6)
      ctx.quadraticCurveTo(x + r * 0.35, y + r * 0.8, x - r * 0.75, y + r * 0.7)
      ctx.stroke()
      break

    case 'star': {
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i / 5) * Math.PI * 2
        const px = x + Math.cos(a) * r * 0.9
        const py = y + Math.sin(a) * r * 0.9
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
        const b = a + Math.PI / 5
        ctx.lineTo(x + Math.cos(b) * r * 0.38, y + Math.sin(b) * r * 0.38)
      }
      ctx.closePath()
      ctx.stroke()
      break
    }

    case 'wave':
      ctx.moveTo(x - r * 0.9, y)
      ctx.quadraticCurveTo(x - r * 0.45, y - r * 0.8, x, y)
      ctx.quadraticCurveTo(x + r * 0.45, y + r * 0.8, x + r * 0.9, y)
      ctx.stroke()
      break

    case 'flame':
      ctx.moveTo(x, y + r * 0.85)
      ctx.quadraticCurveTo(x - r * 0.9, y + r * 0.1, x - r * 0.2, y - r * 0.9)
      ctx.quadraticCurveTo(x - r * 0.1, y - r * 0.2, x + r * 0.35, y - r * 0.55)
      ctx.quadraticCurveTo(x + r * 0.9, y + r * 0.25, x, y + r * 0.85)
      ctx.stroke()
      break

    case 'bolt':
      ctx.moveTo(x + r * 0.35, y - r * 0.9)
      ctx.lineTo(x - r * 0.45, y + r * 0.05)
      ctx.lineTo(x + r * 0.15, y + r * 0.05)
      ctx.lineTo(x - r * 0.3, y + r * 0.9)
      ctx.stroke()
      break

    case 'orb':
      ctx.arc(x, y, r * 0.72, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x - r * 0.22, y - r * 0.22, r * 0.2, 0, Math.PI * 2)
      ctx.fill()
      break

    case 'spiral': {
      const turns = 2.2
      for (let i = 0; i <= 40; i++) {
        const t = (i / 40) * turns * Math.PI * 2
        const rad = (i / 40) * r * 0.85
        const px = x + Math.cos(t) * rad
        const py = y + Math.sin(t) * rad
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
      break
    }

    case 'arrow':
      ctx.moveTo(x - r * 0.85, y + r * 0.7)
      ctx.lineTo(x + r * 0.8, y - r * 0.75)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x + r * 0.2, y - r * 0.75)
      ctx.lineTo(x + r * 0.8, y - r * 0.75)
      ctx.lineTo(x + r * 0.8, y - r * 0.15)
      ctx.stroke()
      break

    case 'moon':
      ctx.arc(x, y, r * 0.82, Math.PI * 0.35, Math.PI * 1.65)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x + r * 0.42, y, r * 0.72, Math.PI * 1.72, Math.PI * 0.28)
      ctx.stroke()
      break

    case 'burst':
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        ctx.moveTo(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3)
        ctx.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9)
      }
      ctx.stroke()
      break
  }
}

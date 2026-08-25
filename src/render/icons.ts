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
  wild_charge: { shape: 'arrow', colour: '#b5651d' },
  // Leather's answer to the same problem the charge solves for plate: not a
  // way in, a way out and back.
  sprint: { shape: 'arrow', colour: '#fff569' },
  dash: { shape: 'arrow', colour: '#ff7d0a' },
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

/**
 * What a hit from this ability looks like where it lands.
 *
 * Every damaging ability in the game used to produce the same expanding ring
 * with the same six spokes, in the ability's colour. A mage's fireball, a
 * rogue's dagger and a hunter's arrow were one picture tinted three ways —
 * and the picture is what you are actually looking at during a fight, since
 * nobody watches the buttons.
 *
 * The shapes come from the same three primitives the effects already use, so
 * this is a table of parameters rather than a new renderer.
 */
export type HitStyle =
  /** A ring that pushes out. Spells, and anything without an edge or a point. */
  | 'burst'
  /** An arc across the target, along the line of the swing. Blades and claws. */
  | 'cleave'
  /** A streak through it, and a little spray behind. Arrows and bolts. */
  | 'pierce'
  /** Short, wide, and downward. Hammers and shields. */
  | 'crush'
  /** Closes inward instead of leaving. Shadow, poison, anything that sinks in. */
  | 'wither'

/**
 * Read off the icon rather than listed separately: a blade already draws a
 * blade on its button, so a blade cleaves. The mapping only has to name the
 * exceptions.
 */
const STYLE_BY_SHAPE: Record<IconShape, HitStyle> = {
  blade: 'cleave',
  dagger: 'cleave',
  arrow: 'pierce',
  bolt: 'pierce',
  hammer: 'crush',
  shield: 'crush',
  cross: 'crush',
  flame: 'burst',
  orb: 'burst',
  burst: 'burst',
  star: 'burst',
  wave: 'burst',
  spiral: 'wither',
  moon: 'wither',
  leaf: 'wither',
  droplet: 'wither',
}

/**
 * What the boss's own mechanics look like when they land.
 *
 * They are not in the ability table and cannot be — that table is what the
 * player presses, and the icon check rejects an entry with no ability behind
 * it — so they are listed here instead. Before this they were not listed
 * anywhere: the slam, the cone, the ring, the floor and the party-wide hit
 * drew nothing at all, and the only thing the boss did that left a mark on
 * the screen was its sweep. Three fights' worth of mechanics arrived as
 * numbers over people's heads.
 *
 * The colours follow what each mechanic already looks like on the floor, so
 * the hit and the thing that threw it are recognisably the same event.
 */
const BOSS_EFFECTS: Record<string, { colour: string; style: HitStyle }> = {
  // The tank's problem: heavy, close, and it arrives rather than travels.
  boss_slam: { colour: '#f97316', style: 'crush' },
  // The cone, in the cone's own blue, thrown along the way it was facing.
  boss_breath: { colour: '#38bdf8', style: 'pierce' },
  // The ring, in the ring's amber.
  boss_shockwave: { colour: '#facc15', style: 'pierce' },
  // The floor, in the floor's magenta, sinking in rather than pushing out.
  boss_puddle: { colour: '#be185d', style: 'wither' },
  boss_brand: { colour: '#f472b6', style: 'wither' },
  // The judgement, in a colour nothing else here owns: it is the one thing on
  // any of these bosses that no amount of walking answers.
  boss_verdict: { colour: '#4f46e5', style: 'pierce' },
  // The one thing armour answers, so it is drawn as steel.
  boss_sweep: { colour: '#e2e8f0', style: 'cleave' },
  // The same band as the sweep and deliberately not the same colour: one is a
  // swing that arrives and the other is the floor itself coming down, and a
  // player who cannot tell them apart cannot learn that one of them warned.
  boss_crush: { colour: '#dc2626', style: 'crush' },
  // The floor splitting, which is a line rather than a circle: stone, and
  // cleaving, because what it does is come apart along one.
  boss_fault: { colour: '#475569', style: 'cleave' },
  // The floor standing up, which is the split's opposite and must not be its
  // colour: warm stone against that cold slate, and crushing rather than
  // cleaving, because what it does is arrive from underneath.
  boss_spire: { colour: '#a8a29e', style: 'crush' },
  // The floor going under everywhere but three patches. Deep water rather
  // than the shallow teal the gathering owns, and the only mechanic here whose
  // colour means the ground rather than the thing standing on it.
  boss_shallows: { colour: '#1d4ed8', style: 'wither' },
  // Everyone at once, which is the healer's whole fight.
  boss_raid: { colour: '#a78bfa', style: 'burst' },
  boss_rot: { colour: '#65a30d', style: 'wither' },
  // The fight changing under you. Its own id rather than borrowed from the
  // slam, because a check that asks whether the slam ever landed must not be
  // answerable by the phase break.
  boss_phase: { colour: '#fb7185', style: 'burst' },
  boss_thrall: { colour: '#a855f7', style: 'cleave' },
  // Armour coming apart: the same steel as the sweep would say "physical",
  // but this is the thing that makes physical hurt, so it is rust.
  boss_sunder: { colour: '#b45309', style: 'crush' },
  // The one the party answers together, so it arrives on everybody at once
  // and reads as something settling rather than something thrown.
  boss_soak: { colour: '#2dd4bf', style: 'wither' },
  // The wedge that turns, in a colour nothing else on the floor owns. It has
  // to be read as one shape moving rather than as a series of cones, so it
  // cannot borrow the cone's blue.
  boss_hand: { colour: '#84cc16', style: 'cleave' },
  // The floor answering under the one it marked. Its own violet rather than
  // a shade of the brand's pink, which is the closest thing to it: both
  // arrive where somebody was standing, and they are opposite mechanics
  // about it — the brand is ground to keep off afterwards and this is gone
  // before anybody could.
  boss_echo: { colour: '#c084fc', style: 'wither' },
  // The split, in the one colour left that reads as a division rather than a
  // hazard: nothing is on fire, the person beside you is simply wrong.
  boss_schism: { colour: '#059669', style: 'cleave' },
  // The thing that followed you, in a colour nothing else uses: whatever else
  // is happening, this one is about you specifically.
  boss_stalk: { colour: '#fb923c', style: 'cleave' },
  // A weight coming down in the hands it was left in. Drawn as a crush
  // because that is what it is — the difference from the boss's own is that
  // this one landed somewhere a person walked it to.
  boss_burden: { colour: '#818cf8', style: 'crush' },
  // A debt falling due, which either splits or does not. A burst rather than
  // a wither: it arrives all at once and it is over.
  boss_yoke: { colour: '#f0abfc', style: 'burst' },
  // A note finishing, on everybody at once. A burst, because the whole of it
  // arrives in one frame and there is nothing left of it afterwards.
  boss_knell: { colour: '#f43f5e', style: 'burst' },
  // Whatever was inside it, coming back out at whoever opened it.
  boss_vessel: { colour: '#06b6d4', style: 'burst' },
  // Your own damage, handed back. Pierced rather than crushed: what lands is
  // the shape of what was thrown.
  boss_mirror: { colour: '#7dd3fc', style: 'pierce' },
  // A price being collected, in a metal nothing else here is: the fight's one
  // hit that a body walked to rather than failed to leave.
  boss_toll: { colour: '#f59e0b', style: 'burst' },
  // Something closing on one body out of the crowd. Deep violet, and crushing,
  // because what it does is take hold rather than burn.
  boss_grasp: { colour: '#7c3aed', style: 'crush' },
  // Ground rationed out. Its own cold blue rather than a shade of the water
  // that drowns the floor -- these are the pieces that are left, and a player
  // who reads them as the same mechanic reads standing on one as a mistake.
  boss_refuge: { colour: '#0e7490', style: 'pierce' },
}

export function bossEffect(abilityId: string): { colour: string; style: HitStyle } | null {
  return BOSS_EFFECTS[abilityId] ?? null
}

/** Every boss mechanic that has a look, for the checks. */
export function bossEffectIds(): string[] {
  return Object.keys(BOSS_EFFECTS)
}

export function hitStyleFor(abilityId: string | null): HitStyle {
  if (!abilityId) return 'cleave'
  if (abilityId.startsWith('boss_')) return bossEffect(abilityId)?.style ?? 'crush'
  return STYLE_BY_SHAPE[iconFor(abilityId).shape]
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

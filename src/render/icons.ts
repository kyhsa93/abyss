/**
 * Ability icons, drawn rather than loaded.
 *
 * Same reason as the rest of the game: no art assets. Each icon is a shape
 * primitive plus a colour, and the pair has to be unique across the spell
 * list — a bar where two buttons look alike is worse than one with no icons
 * at all, so uniqueness is asserted in the checks.
 */

import { drawAtlasIcon } from './atlasimage'

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
  // The raid's cooldowns. Coloured by what they do rather than by class — a
  // player scanning this row is asking "can I soften the next hit", not "which
  // of my nine classes is up" — and shaped so the three answers stay apart at
  // the size the row is drawn at.
  //
  // Every one of them is drawn twice over, which is the one thing they all
  // have in common and the thing that separates them from the single-target
  // spell each is otherwise the twin of: this lands on everybody.
  rallying_cry: { shape: 'shield', colour: '#f59e0b', repeat: 2 },
  aegis: { shape: 'shield', colour: '#fcd34d', repeat: 2 },
  barrier: { shape: 'shield', colour: '#a5b4fc', repeat: 2 },
  wildgrowth: { shape: 'leaf', colour: '#34d399', repeat: 2 },
  tidewall: { shape: 'wave', colour: '#38bdf8', repeat: 2 },
  harvest: { shape: 'moon', colour: '#c084fc', repeat: 2 },
  quicken: { shape: 'spiral', colour: '#67e8f9', repeat: 2 },
  volley_call: { shape: 'arrow', colour: '#a3e635', repeat: 2 },
  shadowmeld_call: { shape: 'dagger', colour: '#f472b6', repeat: 2 },
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
  ice_lance: { shape: 'bolt', colour: '#bae6fd' },

  // hunter
  steady_shot: { shape: 'arrow', colour: '#a3e635' },
  serpent_sting: { shape: 'arrow', colour: '#4d7c0f' },
  aimed_shot: { shape: 'arrow', colour: '#facc15', repeat: 2 },

  // the fifth button: an answer to the floor for everyone who had none.
  // Braces are shields in the wearer's own colour, ways out are arrows, and
  // the instants are the shape of what they throw.
  die_by_the_sword: { shape: 'shield', colour: '#ef4444' },
  shield_of_vengeance: { shape: 'shield', colour: '#f59e0b' },
  divine_shield: { shape: 'shield', colour: '#fef08a' },
  divine_steed: { shape: 'arrow', colour: '#f5d0a9' },
  fade: { shape: 'shield', colour: '#94a3b8' },
  dispersion: { shape: 'shield', colour: '#7e22ce' },
  shadow_word_death: { shape: 'spiral', colour: '#a78bfa' },
  barkskin: { shape: 'shield', colour: '#78350f' },
  sunfire: { shape: 'orb', colour: '#fbbf24' },
  survival_instincts: { shape: 'shield', colour: '#ff7d0a' },
  astral_shift: { shape: 'shield', colour: '#0f8fe8' },
  exorcism: { shape: 'burst', colour: '#fde68a' },
  earth_shock: { shape: 'orb', colour: '#92400e' },
  ice_barrier: { shape: 'shield', colour: '#7dd3fc' },
  unending_resolve: { shape: 'shield', colour: '#9482c9' },
  deterrence: { shape: 'shield', colour: '#abd473' },
  cheetah: { shape: 'arrow', colour: '#65a30d' },
  evasion: { shape: 'shield', colour: '#cbd5e1' },
  beacon_of_light: { shape: 'star', colour: '#fef9c3' },

  // warlock
  shadow_bolt: { shape: 'orb', colour: '#9482c9' },
  immolate: { shape: 'flame', colour: '#7e22ce' },
  chaos_bolt: { shape: 'bolt', colour: '#6d28d9' },
  // The one button in the game that is drawn in the colour of a health bar,
  // because that is what it spends.
  life_tap: { shape: 'droplet', colour: '#ef4444' },

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
  // The ring, in the ring's amber.
  // Blue on the floor, and a burst rather than a slash: it arrives as a patch
  // lighting up, not as something swung.
  // Bone rather than blood: it is a thing standing out of the floor, and what
  // it asks for is a target call, not a step.
  boss_spike: { colour: '#e7e5e4', style: 'pierce' },
  // The second boss's cold, at three sizes, and the one thing of its that is
  // not cold at all.
  //
  // Its own page says so: the shard, the volley and the shade are the same
  // material arriving three ways, and the rotting ground is the only demand it
  // makes about your feet -- so the six that are not about your feet must not
  // wear the colour that one does. Two of the three were not keeping their
  // half of that. The volley was a sky-600, three steps darker than the shard
  // and near enough to the floor that twenty-five of them going out at once
  // read as nothing going out at all; the shade was a purple, which is not
  // cold by any reading.
  //
  // Paler as it spreads: the shard is the whole of it in one place, the volley
  // is the same thing thinned across everybody and is drawn thinner, and the
  // shade steps sideways into cyan because it is the one that follows you
  // rather than the one that is thrown at you.
  boss_decay: { colour: '#3f6212', style: 'crush' },
  boss_frostbolt: { colour: '#7dd3fc', style: 'pierce' },
  boss_volley: { colour: '#bae6fd', style: 'burst' },
  boss_shade: { colour: '#67e8f9', style: 'burst' },
  boss_insignificance: { colour: '#64748b', style: 'crush' },
  boss_empower: { colour: '#c026d3', style: 'burst' },
  boss_dominate: { colour: '#7e22ce', style: 'crush' },
  // The gorged one's five, all in its own red and none of them the same red:
  // the gauge is the darkest because it is the fight underneath, the mark is
  // the brightest because it is the only one of them that never ends.
  boss_siphon: { colour: '#7f1d1d', style: 'crush' },
  boss_spill: { colour: '#991b1b', style: 'burst' },
  boss_fester: { colour: '#c2410c', style: 'pierce' },
  boss_champion: { colour: '#b91c1c', style: 'cleave' },
  boss_gorge: { colour: '#450a0a', style: 'crush' },
  // The confluence's six. All in its own green and none of them the same
  // green: the spray is the arm, the infection is what it leaves on a body,
  // the small things and the merging are the fight itself, the flood is the
  // floor, and the engulfing is what the boss does with what nobody cleared.
  boss_spray: { colour: '#65a30d', style: 'cleave' },
  boss_infection: { colour: '#84cc16', style: 'pierce' },
  boss_ooze: { colour: '#6b8e23', style: 'crush' },
  boss_flood: { colour: '#9acd32', style: 'burst' },
  boss_merge: { colour: '#d9f99d', style: 'burst' },
  boss_engulf: { colour: '#1a2e05', style: 'crush' },
  boss_bonestorm: { colour: '#d6d3d1', style: 'crush' },
  boss_blight: { colour: '#365314', style: 'crush' },
  boss_inhale: { colour: '#a3e635', style: 'burst' },
  boss_pungent: { colour: '#4d7c0f', style: 'pierce' },
  boss_spore: { colour: '#bef264', style: 'burst' },
  boss_vilegas: { colour: '#166534', style: 'burst' },
  boss_bloat: { colour: '#a16207', style: 'crush' },
  boss_coldflame: { colour: '#22d3ee', style: 'burst' },
  // Everyone at once, which is the healer's whole fight.
  boss_raid: { colour: '#a78bfa', style: 'burst' },
  // The fight changing under you. Its own id rather than borrowed from the
  // slam, because a check that asks whether the slam ever landed must not be
  // answerable by the phase break.
  boss_phase: { colour: '#fb7185', style: 'burst' },
  boss_thrall: { colour: '#a855f7', style: 'cleave' },
  // The interlude's elite. Its own entry rather than the thrall's, because a
  // thrall on the floor is one boss's idea and this walks in on four others —
  // and because a fight that has stopped for one thing should not be drawing
  // it in another boss's colour.
  boss_herald: { colour: '#eab308', style: 'cleave' },
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

/**
 * Draws the icon centred on (cx, cy), sized to fit a box of `size`.
 *
 * Art first, glyph second. The sheet is not always there — the first frames of
 * a cold start, a refused fetch, and the harness, which draws in Node where
 * there is no image loader — so the drawn shape stays and remains what
 * `rendercheck` asserts on. `iconFor(...).colour` is untouched either way,
 * because the cast bars and hit particles read it and they are not icons.
 */
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

  if (drawAtlasIcon(ctx, abilityId, cx, cy, size)) {
    ctx.restore()
    return
  }

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

/** World radius of the arena; must match ARENA_RADIUS in the simulation. */
export const WORLD_RADIUS = 320

export const COLORS = {
  bg: '#0a0a0f',
  floor: '#14141c',
  floorEdge: '#2b2b3d',
  grid: '#1b1b27',

  player: '#4ade80',
  tank: '#60a5fa',
  healer: '#f0abfc',
  boss: '#ef4444',
  dead: '#3f3f46',

  telegraph: 'rgba(244, 114, 30, 0.20)',
  telegraphEdge: 'rgba(251, 146, 60, 0.85)',
  puddle: 'rgba(190, 24, 93, 0.32)',
  puddleEdge: 'rgba(244, 63, 94, 0.7)',
  spread: 'rgba(250, 204, 21, 0.85)',

  text: '#cbd5e1',
  textDim: '#6b7280',
  hpBar: '#22c55e',
  hpBarLow: '#ef4444',
  manaBar: '#3b82f6',
  castBar: '#facc15',
  bossCast: '#f97316',
  panel: 'rgba(15, 17, 26, 0.9)',
  panelEdge: '#2a2a3a',
} as const

/**
 * Everything on screen is positioned from this, recomputed on resize.
 *
 * The canvas fills the viewport rather than being letterboxed at a fixed
 * aspect: on a portrait phone a letterboxed 960x760 canvas occupies barely a
 * third of the screen, and touches in the surrounding margin never reach it,
 * which makes the on-screen controls unusable.
 */
export interface Layout {
  w: number
  h: number
  portrait: boolean

  /** World units to screen pixels. */
  scale: number
  cx: number
  cy: number
  arenaR: number
  /** Multiplier for fonts and panel sizes on small screens. */
  ui: number

  bossX: number
  bossY: number
  bossW: number

  partyX: number
  partyY: number
  partyW: number
  partyRow: number

  infoX: number
  infoY: number
  chatY: number
  actionY: number
  castY: number

  joyHomeX: number
  joyHomeY: number
  joyBase: number
  joyKnob: number
  joyZoneMaxX: number
  joyDeadzone: number

  btnX: number
  btnYs: number[]
  btnR: number
  btnHit: number
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function computeLayout(w: number, h: number): Layout {
  const portrait = h > w
  const ui = clamp(Math.min(w, h) / 760, 0.62, 1.15)

  const topBand = 54 * ui
  let arenaR: number
  let cy: number

  if (portrait) {
    // Reserve the bottom third for thumbs, then fit the arena above it.
    const controlBand = clamp(h * 0.3, 190, 320)
    arenaR = Math.max(90, Math.min((w - 20) / 2, (h - topBand - controlBand) / 2))
    cy = topBand + arenaR + 6
  } else {
    // Landscape keeps the party frames on the left and buttons on the right.
    arenaR = Math.max(90, Math.min((h - topBand - 28) / 2, (w - 300 * ui) / 2))
    cy = topBand + arenaR + 4
  }

  const btnR = clamp(Math.min(w, h) * 0.062, 34, 52)
  const joyBase = clamp(Math.min(w, h) * 0.105, 58, 92)

  const btnX = w - btnR - 14
  const btnGap = btnR * 2.35
  const btnBottom = h - btnR - (portrait ? 26 : 18)
  const btnYs = [btnBottom - btnGap * 2, btnBottom - btnGap, btnBottom]

  return {
    w,
    h,
    portrait,
    scale: arenaR / WORLD_RADIUS,
    cx: w / 2,
    cy,
    arenaR,
    ui,

    bossX: Math.max(12, w / 2 - Math.min(w * 0.42, 320)),
    bossY: 16 * ui,
    bossW: Math.min(w - 24, Math.min(w * 0.84, 640)),

    partyX: 6,
    partyY: topBand + 8,
    partyW: clamp(w * 0.19, 108, 150),
    partyRow: clamp(h * 0.085, 46, 70),

    infoX: w - 10,
    infoY: topBand + 22,
    chatY: h - (portrait ? 250 : 120),
    actionY: h - 68,
    castY: h - 30,

    joyHomeX: joyBase + 24,
    joyHomeY: h - joyBase - (portrait ? 34 : 22),
    joyBase,
    joyKnob: joyBase * 0.43,
    joyZoneMaxX: w * 0.5,
    joyDeadzone: 0.18,

    btnX,
    btnYs,
    btnR,
    btnHit: btnR * 1.32,
  }
}

/** Live layout. Mutated in place on resize so modules can hold a reference. */
export const L: Layout = computeLayout(960, 760)

export function updateLayout(w: number, h: number): void {
  Object.assign(L, computeLayout(w, h))
}

export function roleColor(role: string, isPlayer: boolean): string {
  if (isPlayer) return COLORS.player
  if (role === 'tank') return COLORS.tank
  if (role === 'healer') return COLORS.healer
  return COLORS.player
}

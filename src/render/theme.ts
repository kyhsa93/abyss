import { ARENA_RADIUS } from '../sim/constants'

/** World radius of the arena. Taken from the simulation, never redeclared. */
export const WORLD_RADIUS = ARENA_RADIUS

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
  /**
   * Where the camera is pinned, and so where the player's own token is drawn.
   *
   * The middle of the viewport, not the middle of the arena: the two used to
   * be the same thing because the arena was laid out to fill whatever was
   * left between the top band and the thumbs, which on a portrait phone put
   * its centre in the upper third of the screen.
   */
  cx: number
  cy: number
  arenaR: number
  /**
   * Baseline for the banners that used to hang off the top of the arena.
   *
   * With the camera following the player there is no fixed screen position
   * for the arena's edge to hang them from, so they anchor to the top band
   * instead — which is where they were being drawn anyway.
   */
  bannerY: number
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

  /** Centre of every action button, in press order. */
  btnPos: Array<{ x: number; y: number }>
  btnR: number
  btnHit: number
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function computeLayout(w: number, h: number): Layout {
  const portrait = h > w
  const ui = clamp(Math.min(w, h) / 760, 0.62, 1.15)

  const topBand = 54 * ui
  let arenaR: number

  if (portrait) {
    // Reserve the bottom third for thumbs, then size the arena to what is
    // left. This sets the zoom, not the position: the camera follows the
    // player, so the floor is free to run off the edges.
    const controlBand = clamp(h * 0.3, 190, 320)
    arenaR = Math.max(90, Math.min((w - 20) / 2, (h - topBand - controlBand) / 2))
  } else {
    // Landscape keeps the party frames on the left and buttons on the right.
    arenaR = Math.max(90, Math.min((h - topBand - 28) / 2, (w - 300 * ui) / 2))
  }

  const btnR = clamp(Math.min(w, h) * 0.062, 34, 52)
  const joyBase = clamp(Math.min(w, h) * 0.105, 58, 92)

  const btnX = w - btnR - 14
  const btnGap = btnR * 2.35
  const btnBottom = h - btnR - (portrait ? 26 : 18)

  // Three up the right edge, and the fourth beside the bottom one instead of
  // continuing the column. A fourth row reaches back up into the arena on a
  // phone — the stack is already nine button-radii tall — and the corner is
  // the easiest place for a thumb to get to anyway. It still has to clear the
  // left half of the screen, which belongs to the stick.
  const btnPos = [
    { x: btnX, y: btnBottom - btnGap * 2 },
    { x: btnX, y: btnBottom - btnGap },
    { x: btnX, y: btnBottom },
    { x: btnX - btnGap, y: btnBottom },
  ]

  return {
    w,
    h,
    portrait,
    scale: arenaR / WORLD_RADIUS,
    cx: w / 2,
    cy: h / 2,
    arenaR,
    bannerY: topBand - 3,
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
    // Slot height plus its caption plus a small margin. Nothing sits under it.
    actionY: h - (58 * ui + 12 * ui + 10),
    castY: h - 30,

    joyHomeX: joyBase + 24,
    joyHomeY: h - joyBase - (portrait ? 34 : 22),
    joyBase,
    joyKnob: joyBase * 0.43,
    joyZoneMaxX: w * 0.5,
    joyDeadzone: 0.18,

    btnPos,
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

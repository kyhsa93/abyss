export const CANVAS_W = 960
export const CANVAS_H = 760

/** Vertical centre of the arena in canvas space. */
export const ARENA_CX = CANVAS_W / 2
export const ARENA_CY = 60 + 320

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
 * Touch control layout, in canvas-logical coordinates.
 *
 * The joystick has a home position but relocates to wherever the left half of
 * the screen is first touched, so the player is never reaching for a fixed
 * spot that does not suit their grip.
 */
export const JOYSTICK = {
  homeX: 128,
  homeY: 628,
  baseRadius: 74,
  knobRadius: 32,
  /** Fraction of the base radius that still counts as neutral. */
  deadzone: 0.18,
} as const

export const TOUCH_BUTTONS = {
  x: 876,
  ys: [478, 588, 698],
  radius: 44,
  /** Generous hit radius; fingers are imprecise. */
  hitRadius: 58,
} as const

/** The left half of the canvas drives movement; the right half is buttons. */
export const JOYSTICK_ZONE_MAX_X = CANVAS_W / 2

export function roleColor(role: string, isPlayer: boolean): string {
  if (isPlayer) return COLORS.player
  if (role === 'tank') return COLORS.tank
  if (role === 'healer') return COLORS.healer
  return COLORS.player
}

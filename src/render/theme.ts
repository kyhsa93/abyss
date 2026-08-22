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
  rageBar: '#dc2626',
  energyBar: '#facc15',
  focusBar: '#f97316',
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

  /**
   * Top-left corner of the party frames.
   *
   * Their size is not here: how many frames there are, and so how small each
   * one has to be, depends on the raid, which the layout does not know about.
   * See `partyFrames` in the HUD.
   */
  partyX: number
  partyY: number

  /**
   * Minimap: a scaled copy of the arena, top right.
   *
   * It earns its place because the camera follows the player — standing near
   * the rim puts half the floor off screen, and "where is everyone" stops
   * being answerable by looking.
   */
  mapX: number
  mapY: number
  mapR: number

  /** Right edge of the fight readout, which now stops short of the minimap. */
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
  /** The autocast toggle, above the cluster. Touch only. */
  autoPos: { x: number; y: number }
  autoR: number
  btnHit: number
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

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

  // The camera setting, applied to the fitted radius. Everything in world
  // units is drawn through `scale`, so one multiplication moves all of it.
  arenaR *= ZOOM_STEPS[zoomStep] ?? 1

  const mapR = clamp(Math.min(w, h) * 0.082, 30, 62)
  const mapX = w - mapR - 10
  const mapY = topBand + 8 + mapR

  const btnR = clamp(Math.min(w, h) * 0.031, 17, 26)
  const joyBase = clamp(Math.min(w, h) * 0.105, 58, 92)

  const btnX = w - btnR - 14
  const btnGap = btnR * 2.2
  const btnBottom = h - btnR - (portrait ? 26 : 18)

  /**
   * Five buttons gathered into the bottom right corner, in two offset rows.
   *
   * They used to run up the right edge — three in a column with two beside
   * them — which is a shape a thumb travels rather than covers: the column
   * alone stood nine button-radii tall and the top of it was most of the way
   * up the arena. Two rows of a hexagonal cluster keep every button inside one
   * thumb's arc, and the offset is what stops it reading as a row of buttons
   * you have to aim along.
   *
   * The order is the order they are pressed in, so slot one is the corner
   * itself — the easiest place on a phone to reach.
   */
  const row = btnGap * 0.87
  // Above the cluster and slightly smaller: it is a thing you set once a
  // fight, not a thing you press, so it should not sit in the path of a thumb
  // going for its rotation.
  const autoR = btnR * 0.82
  const autoPos = { x: btnX - btnGap, y: btnBottom - row * 2 - 4 }
  const btnPos = [
    { x: btnX, y: btnBottom },
    { x: btnX - btnGap, y: btnBottom },
    { x: btnX - btnGap * 2, y: btnBottom },
    { x: btnX - btnGap * 0.5, y: btnBottom - row },
    { x: btnX - btnGap * 1.5, y: btnBottom - row },
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

    mapX,
    mapY,
    mapR,

    // Right-aligned against the minimap rather than the screen edge; the
    // party and mute buttons hang off this too, so the whole readout column
    // moves left together.
    infoX: mapX - mapR - 12,
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
    autoPos,
    autoR,
    btnHit: btnR * 1.32,
  }
}

/** Live layout. Mutated in place on resize so modules can hold a reference. */
/**
 * How close the camera sits, as a multiple of the fit-to-screen distance.
 *
 * One is the arena drawn as large as the space allows, which is the framing
 * every layout number here was worked out against. Above that the floor runs
 * off the edges — the portrait layout already assumes it can — and the trade
 * is legibility for warning: the minimap is what is left saying where the
 * things you cannot see are.
 *
 * A multiplier on the fitted radius rather than a separate transform, so
 * everything drawn in world units moves together and nothing has to know the
 * camera exists.
 */
export const ZOOM_STEPS = [1, 1.25, 1.5, 1.8] as const
export const ZOOM_NAMES = ['FAR', 'NEAR', 'CLOSE', 'CLOSER'] as const

const ZOOM_KEY = 'abyss.zoom'

let zoomStep = load()

function load(): number {
  try {
    const raw = localStorage.getItem(ZOOM_KEY)
    const level = raw === null ? 0 : Number.parseInt(raw, 10)
    return Number.isFinite(level) ? Math.max(0, Math.min(ZOOM_STEPS.length - 1, level)) : 0
  } catch {
    // No storage is not an error; it is the default framing.
    return 0
  }
}

export function saveZoom(level: number): void {
  try {
    localStorage.setItem(ZOOM_KEY, String(level))
  } catch {
    // As everywhere else: private browsing is not worth failing over.
  }
}

export function zoomLevel(): number {
  return zoomStep
}

/** What the camera setting multiplies the fitted arena by. */
export function zoomFactor(): number {
  return ZOOM_STEPS[zoomStep] ?? 1
}

/** Returns whether it moved, so a caller knows to redraw. */
export function setZoomLevel(level: number, w: number, h: number): boolean {
  const next = Math.max(0, Math.min(ZOOM_STEPS.length - 1, Math.round(level)))
  if (next === zoomStep) return false
  zoomStep = next
  updateLayout(w, h)
  return true
}

export const L: Layout = computeLayout(960, 760)

export function updateLayout(w: number, h: number): void {
  Object.assign(L, computeLayout(w, h))
}

/**
 * One colour per class.
 *
 * The world says what everyone is playing by colour, and the letter on the
 * token still says what they are doing: colour is the class, the glyph is the
 * role. Without this a raid was three shades of blue and pink and you could
 * not tell a mage from a shaman on the floor.
 */
export const CLASS_COLORS: Record<string, string> = {
  warrior: '#c79c6e',
  paladin: '#f58cba',
  priest: '#f0f0f0',
  druid: '#ff7d0a',
  shaman: '#0f8fe8',
  mage: '#40c7eb',
  hunter: '#abd473',
  rogue: '#fff569',
}

export function classColor(classId: string): string {
  return CLASS_COLORS[classId] ?? COLORS.text
}

/** A resource is read by colour before it is read by number. */
export function resourceColor(resource: string): string {
  if (resource === 'rage') return COLORS.rageBar
  if (resource === 'energy') return COLORS.energyBar
  if (resource === 'focus') return COLORS.focusBar
  return COLORS.manaBar
}


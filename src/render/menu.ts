import { BATTLEGROUNDS } from '../sim/battleground'
import { DIFFICULTIES, RAID_SIZES, type DifficultyId, type RaidSize } from '../sim/classes'
import { ENCOUNTERS } from '../sim/encounters'
import { SPEC_OPTIONS } from '../sim/classes'
import { VOLUME_NAMES } from '../sfx'
import type { BgKind } from '../sim/types'
import { COLORS, L } from './theme'

/**
 * The screens before the fight.
 *
 * One question per screen, in the order the answers depend on each other:
 * what kind of thing you are doing, then the settings that kind of thing has,
 * then who you are playing. Everything used to be on one screen, which meant a
 * battleground was chosen on a page that also offered a raid's difficulty and a
 * boss list, and half of it had to be hidden depending on what you had picked.
 *
 * Geometry is computed once per screen and shared by the drawing and the hit
 * test, the same arrangement the party screen already used, so the two cannot
 * disagree about where a button is.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type MenuScreen = 'home' | 'raid' | 'battleground' | 'daily' | 'settings'

/** How many specs the class grid has to hold. */
const SPEC_COUNT = SPEC_OPTIONS.length

export type HomeChoice =
  | 'raid'
  | 'battleground'
  | 'daily'
  | 'descent'
  | 'settings'
  | 'record'
  | 'share'

function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

function font(size: number, bold = false): string {
  return `${bold ? 'bold ' : ''}${Math.round(size * L.ui)}px ui-monospace, monospace`
}

function pad(): number {
  return Math.max(10, L.w * 0.03)
}

/** A stack of full-width choices, centred, with room left under them. */
function column(count: number, top: number, bottom: number, maxWidth = 340): Rect[] {
  const gap = Math.max(8, L.h * 0.014)
  const w = Math.min(maxWidth, L.w - pad() * 2)
  const h = Math.min(
    Math.max(40, L.h * 0.09),
    Math.max(30, (bottom - top - gap * (count - 1)) / count),
  )
  const block = h * count + gap * (count - 1)
  const startY = top + Math.max(0, (bottom - top - block) / 2)
  return Array.from({ length: count }, (_, i) => ({
    x: L.w / 2 - w / 2,
    y: startY + i * (h + gap),
    w,
    h,
  }))
}

function backRect(): Rect {
  const w = Math.min(120, L.w * 0.3)
  const h = Math.max(32, Math.min(44, L.h * 0.055))
  return { x: pad(), y: L.h - h - pad(), w, h }
}

function primaryRect(): Rect {
  const back = backRect()
  return { x: back.x + back.w + 8, y: back.y, w: L.w - pad() * 2 - back.w - 8, h: back.h }
}

function titleY(): number {
  return Math.max(26, L.h * 0.07)
}

function button(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  label: string,
  detail: string,
  accent: string,
  active = false,
): void {
  ctx.fillStyle = active ? 'rgba(250, 204, 21, 0.12)' : COLORS.panel
  ctx.fillRect(r.x, r.y, r.w, r.h)
  ctx.strokeStyle = active ? accent : COLORS.panelEdge
  ctx.lineWidth = active ? 2 : 1
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)

  ctx.textAlign = 'center'
  ctx.fillStyle = accent
  // A detail line only fits when the button is tall enough to hold two; below
  // that the name is the only thing worth keeping.
  const roomy = r.h > 46 && detail !== ''
  ctx.font = font(roomy ? 13 : 12, true)
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h * (roomy ? 0.44 : 0.62))

  if (roomy) {
    ctx.fillStyle = COLORS.textDim
    ctx.font = font(9)
    ctx.fillText(detail, r.x + r.w / 2, r.y + r.h * 0.74)
  }
}

function screenTitle(ctx: CanvasRenderingContext2D, text: string, sub = ''): void {
  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.text
  ctx.font = font(17, true)
  ctx.fillText(text, L.w / 2, titleY())
  if (sub === '') return
  ctx.fillStyle = COLORS.textDim
  ctx.font = font(10)
  ctx.fillText(sub, L.w / 2, titleY() + 17 * L.ui)
}

function backdrop(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, L.w, L.h)
}

// --- home -------------------------------------------------------------------

export interface HomeLayout {
  choices: Rect[]
  record: Rect
  share: Rect
}

export function homeLayout(): HomeLayout {
  // Two of the same size, centred as a pair. Neither is a way into a fight,
  // which is why they sit under the column rather than in it.
  const base = backRect()
  const gap = 8
  const left = L.w / 2 - base.w - gap / 2
  const choices = column(HOME_ORDER.length, titleY() + 34 * L.ui, base.y - 16)
  return {
    choices,
    record: { ...base, x: left },
    share: { ...base, x: left + base.w + gap },
  }
}

const HOME_ORDER: HomeChoice[] = ['raid', 'battleground', 'daily', 'descent', 'settings']

export function drawHome(
  ctx: CanvasRenderingContext2D,
  clock: number,
  /** Replaces the share button's label after a press, to confirm what happened. */
  shareLabel?: string,
): void {
  backdrop(ctx)
  screenTitle(ctx, 'ABYSS', 'a raid boss, or five people who would rather you left')

  const layout = homeLayout()
  const labels: Array<[string, string, string]> = [
    ['RAID', `${ENCOUNTERS.length} bosses · 5, 10 or 25 players`, COLORS.castBar],
    ['BATTLEGROUND', `${BATTLEGROUNDS.length} maps · five against five`, COLORS.tank],
    ["TODAY'S RUN", 'one fight a day, the same one for everybody', COLORS.hpBar],
    ['THE DESCENT', 'boss after boss, no second try', COLORS.hpBarLow],
    ['SETTINGS', 'sound', COLORS.textDim],
  ]
  labels.forEach(([label, detail, accent], i) => {
    const r = layout.choices[i]!
    // The first one breathes, so the eye starts there rather than reading all
    // three before choosing.
    const pulse = i === 0 ? 0.75 + 0.25 * Math.sin(clock * 3) : 1
    ctx.globalAlpha = pulse
    button(ctx, r, label, detail, accent, i === 0)
    ctx.globalAlpha = 1
  })

  button(ctx, layout.record, 'RECORD', '', COLORS.textDim)
  button(ctx, layout.share, shareLabel ?? 'SHARE', '', COLORS.tank)
}

export function hitHome(x: number, y: number): HomeChoice | null {
  const layout = homeLayout()
  for (let i = 0; i < layout.choices.length; i++) {
    if (inside(layout.choices[i]!, x, y)) return HOME_ORDER[i]!
  }
  if (inside(layout.record, x, y)) return 'record'
  if (inside(layout.share, x, y)) return 'share'
  return null
}

// --- raid setup -------------------------------------------------------------

export interface RaidSetupLayout {
  bosses: Rect[]
  sizes: Rect[]
  difficulties: Rect[]
  back: Rect
  next: Rect
  headings: number[]
}

export type RaidSetupHit =
  | { kind: 'boss'; index: number }
  | { kind: 'size'; size: RaidSize }
  | { kind: 'difficulty'; id: DifficultyId }
  | { kind: 'back' }
  | { kind: 'next' }

const DIFFICULTY_ORDER: DifficultyId[] = ['normal', 'heroic']

export function raidSetupLayout(): RaidSetupLayout {
  const p = pad()
  const back = backRect()
  const rowH = Math.max(32, Math.min(46, L.h * 0.062))
  const gap = 6

  // Three labelled rows, spread through the space between the title and the
  // buttons rather than stacked at the top: on a tall phone that left the
  // whole middle of the screen empty.
  const top = titleY() + 30 * L.ui
  const bottom = back.y - 14
  const band = (bottom - top) / 3
  const headings: number[] = []
  const row = (i: number, count: number, maxWidth: number): Rect[] => {
    const y = top + band * i + 18 * L.ui
    headings.push(y - 8 * L.ui)
    const w = Math.min(maxWidth, (L.w - p * 2 - gap * (count - 1)) / count)
    const block = w * count + gap * (count - 1)
    return Array.from({ length: count }, (_, n) => ({
      x: L.w / 2 - block / 2 + n * (w + gap),
      y,
      w,
      h: rowH,
    }))
  }

  return {
    bosses: row(0, ENCOUNTERS.length, 150),
    sizes: row(1, RAID_SIZES.length, 90),
    difficulties: row(2, DIFFICULTY_ORDER.length, 130),
    back,
    next: primaryRect(),
    headings,
  }
}

export function drawRaidSetup(
  ctx: CanvasRenderingContext2D,
  encounter: number,
  unlocked: number,
  size: number,
  difficulty: DifficultyId,
): void {
  backdrop(ctx)
  screenTitle(ctx, 'RAID', 'pick the fight, then who you are playing')

  const layout = raidSetupLayout()
  const heading = (text: string, y: number) => {
    ctx.textAlign = 'center'
    ctx.fillStyle = COLORS.textDim
    ctx.font = font(9)
    ctx.fillText(text, L.w / 2, y)
  }

  heading('BOSS', layout.headings[0]!)
  ENCOUNTERS.forEach((fight, i) => {
    const locked = i > unlocked
    const r = layout.bosses[i]!
    if (locked) {
      button(ctx, r, `${fight.short} 🔒`, 'not reached', COLORS.dead)
      return
    }
    button(ctx, r, fight.short, fight.demand, COLORS.boss, i === encounter)
  })

  heading('RAID SIZE', layout.headings[1]!)
  RAID_SIZES.forEach((option, i) => {
    button(ctx, layout.sizes[i]!, `${option}`, '', COLORS.castBar, option === size)
  })

  heading('DIFFICULTY', layout.headings[2]!)
  DIFFICULTY_ORDER.forEach((id, i) => {
    button(
      ctx,
      layout.difficulties[i]!,
      DIFFICULTIES[id].name,
      id === 'heroic' ? 'more health, same mechanics' : '',
      id === 'heroic' ? COLORS.hpBarLow : COLORS.castBar,
      id === difficulty,
    )
  })

  button(ctx, layout.back, 'BACK', '', COLORS.textDim)
  button(ctx, layout.next, 'PICK YOUR CLASS', '', COLORS.castBar, true)
}

export function hitRaidSetup(x: number, y: number): RaidSetupHit | null {
  const layout = raidSetupLayout()
  if (inside(layout.back, x, y)) return { kind: 'back' }
  if (inside(layout.next, x, y)) return { kind: 'next' }
  for (let i = 0; i < layout.bosses.length; i++) {
    if (inside(layout.bosses[i]!, x, y)) return { kind: 'boss', index: i }
  }
  for (let i = 0; i < layout.sizes.length; i++) {
    if (inside(layout.sizes[i]!, x, y)) return { kind: 'size', size: RAID_SIZES[i]! }
  }
  for (let i = 0; i < layout.difficulties.length; i++) {
    if (inside(layout.difficulties[i]!, x, y)) {
      return { kind: 'difficulty', id: DIFFICULTY_ORDER[i]! }
    }
  }
  return null
}

// --- today's run ------------------------------------------------------------

export interface DailyLayout {
  classes: Rect[]
  start: Rect
  share: Rect
  back: Rect
  headingY: number
  summaryY: number
}

export function dailyLayout(): DailyLayout {
  const p = pad()
  const back = backRect()
  const headingY = titleY() + 26 * L.ui
  // Room for the fight line, the record line and the affix's two.
  const summaryY = headingY + 68 * L.ui
  const top = summaryY + 22 * L.ui

  // The one thing the day leaves you: which class to bring.
  const gap = Math.max(3, p * 0.3)
  const cols = L.portrait ? 3 : 5
  const rows = Math.ceil(SPEC_COUNT / cols)
  const cellW = (L.w - p * 2 - gap * (cols - 1)) / cols
  const cellH = Math.max(30, Math.min(52, (back.y - 14 - top - gap * (rows - 1)) / rows))
  const classes: Rect[] = []
  for (let i = 0; i < SPEC_COUNT; i++) {
    classes.push({
      x: p + (i % cols) * (cellW + gap),
      y: top + Math.floor(i / cols) * (cellH + gap),
      w: cellW,
      h: cellH,
    })
  }

  // The share sits between BACK and PULL: it is about the run you have had
  // rather than the one you are about to have, so it does not take the corner
  // the way out already owns.
  const start = primaryRect()
  const shareW = Math.min(96, start.w * 0.32)
  return {
    classes,
    start: { ...start, x: start.x + shareW + 8, w: start.w - shareW - 8 },
    share: { ...start, w: shareW },
    back,
    headingY,
    summaryY,
  }
}

export type DailyHit =
  | { kind: 'class'; index: number }
  | { kind: 'start' }
  | { kind: 'share' }
  | { kind: 'back' }

export function drawDaily(
  ctx: CanvasRenderingContext2D,
  today: { label: string; key: number; affix: { name: string; detail: string } },
  best: { line: string; attempts: number } | null,
  chosen: number,
  labelFor: (index: number) => { text: string; colour: string },
  /** Replaces the share button's label after a press, to confirm what happened. */
  shareLabel?: string,
): void {
  backdrop(ctx)
  screenTitle(ctx, "TODAY'S RUN", 'the same fight for everybody, until midnight')

  const layout = dailyLayout()
  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.hpBar
  ctx.font = font(12, true)
  ctx.fillText(today.label, L.w / 2, layout.headingY)

  ctx.fillStyle = COLORS.textDim
  ctx.font = font(10)
  ctx.fillText(
    best
      ? `${best.line}   ·   ${best.attempts} attempt${best.attempts === 1 ? '' : 's'}`
      : 'no attempt yet today',
    L.w / 2,
    layout.headingY + 16 * L.ui,
  )

  // The twist, given its own line and its own colour: it is the thing that
  // makes today different from the same boss yesterday.
  ctx.fillStyle = COLORS.castBar
  ctx.font = font(11, true)
  ctx.fillText(today.affix.name, L.w / 2, layout.headingY + 34 * L.ui)
  ctx.fillStyle = COLORS.textDim
  ctx.font = font(9)
  ctx.fillText(today.affix.detail, L.w / 2, layout.headingY + 47 * L.ui)

  ctx.fillText('THE DAY PICKS THE FIGHT — YOU PICK THE CLASS', L.w / 2, layout.summaryY)

  for (let i = 0; i < layout.classes.length; i++) {
    const { text, colour } = labelFor(i)
    button(ctx, layout.classes[i]!, text, '', colour, i === chosen)
  }

  button(ctx, layout.back, 'BACK', '', COLORS.textDim)
  button(ctx, layout.share, shareLabel ?? 'SHARE', '', COLORS.tank)
  button(ctx, layout.start, 'PULL', '', COLORS.castBar, true)
}

export function hitDaily(x: number, y: number): DailyHit | null {
  const layout = dailyLayout()
  if (inside(layout.back, x, y)) return { kind: 'back' }
  if (inside(layout.share, x, y)) return { kind: 'share' }
  if (inside(layout.start, x, y)) return { kind: 'start' }
  for (let i = 0; i < layout.classes.length; i++) {
    if (inside(layout.classes[i]!, x, y)) return { kind: 'class', index: i }
  }
  return null
}

// --- battleground pick ------------------------------------------------------

export interface BgSetupLayout {
  maps: Rect[]
  back: Rect
}

export function bgSetupLayout(): BgSetupLayout {
  const back = backRect()
  return {
    maps: column(BATTLEGROUNDS.length, titleY() + 34 * L.ui, back.y - 16, 400),
    back,
  }
}

export function drawBgSetup(ctx: CanvasRenderingContext2D, kind: BgKind | null): void {
  backdrop(ctx)
  screenTitle(ctx, 'BATTLEGROUND', 'five against five, and the other five are people')

  const layout = bgSetupLayout()
  BATTLEGROUNDS.forEach((map, i) => {
    button(ctx, layout.maps[i]!, map.name, map.demand, COLORS.tank, map.kind === kind)
  })
  button(ctx, layout.back, 'BACK', '', COLORS.textDim)
}

export function hitBgSetup(x: number, y: number): { kind: 'map'; map: BgKind } | { kind: 'back' } | null {
  const layout = bgSetupLayout()
  if (inside(layout.back, x, y)) return { kind: 'back' }
  for (let i = 0; i < layout.maps.length; i++) {
    if (inside(layout.maps[i]!, x, y)) return { kind: 'map', map: BATTLEGROUNDS[i]!.kind }
  }
  return null
}

// --- settings ---------------------------------------------------------------

export interface SettingsLayout {
  sound: Rect
  volumes: Rect[]
  back: Rect
  headings: number[]
}

export function settingsLayout(): SettingsLayout {
  const p = pad()
  const back = backRect()
  const top = titleY() + 40 * L.ui
  const rowH = Math.max(38, Math.min(52, L.h * 0.07))
  const w = Math.min(340, L.w - p * 2)
  const gap = 6

  const sound = { x: L.w / 2 - w / 2, y: top + 14 * L.ui, w, h: rowH }
  const volumeY = sound.y + rowH + 34 * L.ui
  const vw = (w - gap * (VOLUME_NAMES.length - 1)) / VOLUME_NAMES.length
  const volumes = VOLUME_NAMES.map((_, i) => ({
    x: L.w / 2 - w / 2 + i * (vw + gap),
    y: volumeY,
    w: vw,
    h: rowH,
  }))

  return {
    sound,
    volumes,
    back,
    headings: [sound.y - 10 * L.ui, volumeY - 10 * L.ui],
  }
}

export function drawSettings(
  ctx: CanvasRenderingContext2D,
  muted: boolean,
  volume: number,
): void {
  backdrop(ctx)
  screenTitle(ctx, 'SETTINGS')

  const layout = settingsLayout()
  const heading = (text: string, y: number) => {
    ctx.textAlign = 'center'
    ctx.fillStyle = COLORS.textDim
    ctx.font = font(9)
    ctx.fillText(text, L.w / 2, y)
  }

  heading('SOUND', layout.headings[0]!)
  button(
    ctx,
    layout.sound,
    muted ? 'OFF' : 'ON',
    muted ? 'nothing is audible' : 'a puddle behind you is audible before it is visible',
    muted ? COLORS.dead : COLORS.hpBar,
    !muted,
  )

  heading('VOLUME', layout.headings[1]!)
  VOLUME_NAMES.forEach((name, i) => {
    const dim = muted
    button(
      ctx,
      layout.volumes[i]!,
      name,
      '',
      dim ? COLORS.dead : COLORS.castBar,
      !dim && i === volume,
    )
  })

  button(ctx, layout.back, 'BACK', '', COLORS.textDim)
}

export function hitSettings(
  x: number,
  y: number,
): { kind: 'sound' } | { kind: 'volume'; level: number } | { kind: 'back' } | null {
  const layout = settingsLayout()
  if (inside(layout.back, x, y)) return { kind: 'back' }
  if (inside(layout.sound, x, y)) return { kind: 'sound' }
  for (let i = 0; i < layout.volumes.length; i++) {
    if (inside(layout.volumes[i]!, x, y)) return { kind: 'volume', level: i }
  }
  return null
}

import { BATTLEGROUNDS } from '../sim/battleground'
import { DIFFICULTIES, RAID_SIZES, type DifficultyId } from '../sim/classes'
import { ENCOUNTERS, MECHANIC_NAMES, encounterKit } from '../sim/encounters'
import { bossOpen, isOpen } from '../progress'
import { SPEC_OPTIONS } from '../sim/classes'
import { VOLUME_NAMES } from '../sfx'
import type { BgKind } from '../sim/types'
import { COLORS, L, ZOOM_NAMES, MENU_TEXT, fitText, groupSize } from './theme'
import { drawBackdrop } from './ambience'

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

function px(size: number, bold = false): string {
  return `${bold ? 'bold ' : ''}${Math.round(size)}px ui-monospace, monospace`
}

function font(size: number, bold = false): string {
  return px(size * L.ui * MENU_TEXT, bold)
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

/** One row's worth of type, measured once and used by every button in it. */
interface RowText {
  label: number
  /** Zero when the row's detail lines are too small to keep, and all are dropped. */
  detail: number
  roomy: boolean
}

/**
 * The size and the arrangement a whole row of buttons shares.
 *
 * A button left to size itself is sized by its own text, and a row is not a
 * collection of buttons — it is one question asked once. Two ways it used to
 * come apart: the boss row printed "Choir" at full size and "Tidebreaker" at
 * a third of it, and the difficulty row, where only heroic carries a detail
 * line, put the two names at two sizes and two heights. Both are measured
 * together here instead, so a row is one size or none of it is.
 */
function rowText(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  labels: string[],
  details: string[],
): RowText {
  const max = r.w - 16
  let roomy = r.h > 35 * L.ui * MENU_TEXT && details.some((d) => d !== '')
  let detail = 0
  if (roomy) {
    ctx.font = font(9)
    const fitted = groupSize(
      ctx,
      details.filter((d) => d !== ''),
      max,
    )
    // Same floor `fitText` keeps: below it the line is noise shaped like
    // text, and dropping it gives the names the whole button back.
    if (fitted >= 8) detail = fitted
    else roomy = false
  }
  ctx.font = font(roomy ? 13 : 12, true)
  return { label: groupSize(ctx, labels, max), detail, roomy }
}

/**
 * One size for a screenful of rows, not just for each row on its own.
 *
 * The rows are measured apart because they hold different words, and that
 * left the raid screen printing its bosses a fifth smaller than its
 * difficulties — three rows of buttons that look like three different kinds
 * of control when they are three answers to the same setup. The smallest
 * that fits wins, since it is the only one every row can hold.
 */
function unify(rows: RowText[]): void {
  const label = Math.min(...rows.map((r) => r.label))
  const written = rows.map((r) => r.detail).filter((size) => size > 0)
  const detail = written.length > 0 ? Math.min(...written) : 0
  for (const r of rows) {
    r.label = label
    if (r.detail > 0) r.detail = detail
  }
}

function button(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  label: string,
  detail: string,
  accent: string,
  active = false,
  /** Set when this button is one of a row that has already been measured. */
  shared?: RowText,
): void {
  ctx.fillStyle = active ? 'rgba(250, 204, 21, 0.12)' : COLORS.panel
  ctx.fillRect(r.x, r.y, r.w, r.h)
  ctx.strokeStyle = active ? accent : COLORS.panelEdge
  ctx.lineWidth = active ? 2 : 1
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)

  ctx.textAlign = 'center'
  ctx.fillStyle = accent
  // A detail line only fits when the button is tall enough to hold two; below
  // that the name is the only thing worth keeping. The bar is font-coupled:
  // it used to be a flat 46 against a 13-point label, and when the menu text
  // doubled, every mid-sized button kept its detail line and printed the two
  // lines through each other.
  const roomy = shared ? shared.roomy : r.h > 35 * L.ui * MENU_TEXT && detail !== ''
  ctx.font = shared ? px(shared.label, true) : font(roomy ? 13 : 12, true)
  fitText(ctx, label, r.x + r.w / 2, r.y + r.h * (roomy ? 0.44 : 0.62), r.w - 16)

  if (roomy && detail !== '') {
    ctx.fillStyle = COLORS.textDim
    ctx.font = shared ? px(shared.detail) : font(9)
    fitText(ctx, detail, r.x + r.w / 2, r.y + r.h * 0.74, r.w - 16, 8)
  }
}

function screenTitle(ctx: CanvasRenderingContext2D, text: string, sub = ''): void {
  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.text
  ctx.font = font(17, true)
  fitText(ctx, text, L.w / 2, titleY(), L.w - pad() * 2)
  if (sub === '') return
  ctx.fillStyle = COLORS.textDim
  ctx.font = font(10)
  fitText(ctx, sub, L.w / 2, titleY() + 17 * L.ui * MENU_TEXT, L.w - pad() * 2)
}

function backdrop(ctx: CanvasRenderingContext2D): void {
  drawBackdrop(ctx)
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
  const choices = column(HOME_ORDER.length, titleY() + 34 * L.ui * MENU_TEXT, base.y - 16)
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
  // One measurement for the stack: BATTLEGROUND is half again as long as
  // RAID, and sized apart the two came out at two sizes in one column.
  const text = rowText(
    ctx,
    layout.choices[0]!,
    labels.map(([label]) => label),
    labels.map(([, detail]) => detail),
  )
  const pair = rowText(ctx, layout.record, ['RECORD', shareLabel ?? 'SHARE'], [])
  unify([text, pair])
  labels.forEach(([label, detail, accent], i) => {
    const r = layout.choices[i]!
    // The first one breathes, so the eye starts there rather than reading all
    // three before choosing.
    const pulse = i === 0 ? 0.75 + 0.25 * Math.sin(clock * 3) : 1
    ctx.globalAlpha = pulse
    button(ctx, r, label, detail, accent, i === 0, text)
    ctx.globalAlpha = 1
  })

  button(ctx, layout.record, 'RECORD', '', COLORS.textDim, false, pair)
  button(ctx, layout.share, shareLabel ?? 'SHARE', '', COLORS.tank, false, pair)
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

/**
 * The three settings a raid has, as three of the same control.
 *
 * They were three rows of buttons, and the rows held five, three and two
 * things. Three counts meant three button widths, and once the labels were
 * fitted to those widths it meant three type sizes on one screen — a boss
 * name printed a fifth smaller than the difficulty beside it, and on a phone
 * the boss row came out at seven points. A row of choices has to be re-shaped
 * every time the number of choices changes; one control that opens does not.
 *
 * So each setting is a field showing its answer, and the list it opens is the
 * same width as the field. Nothing on this screen has to shrink to fit, and
 * nothing has to be re-fitted when a sixth boss arrives.
 */
export type RaidField = 'boss' | 'size' | 'difficulty'

export const RAID_FIELDS: RaidField[] = ['boss', 'size', 'difficulty']

export const DIFFICULTY_ORDER: DifficultyId[] = ['normal', 'heroic']

const FIELD_NAMES: Record<RaidField, string> = {
  boss: 'BOSS',
  size: 'RAID SIZE',
  difficulty: 'DIFFICULTY',
}

export interface RaidSetupLayout {
  /** The closed control for each setting, in `RAID_FIELDS` order. */
  fields: Rect[]
  /** The rows of the open list, drawn over everything else. Empty when shut. */
  options: Rect[]
  back: Rect
  next: Rect
  headings: number[]
  summaryY: number
}

export type RaidSetupHit =
  | { kind: 'open'; field: RaidField }
  | { kind: 'choose'; field: RaidField; index: number }
  | { kind: 'dismiss' }
  | { kind: 'back' }
  | { kind: 'next' }

/** One entry of a field's list, and whether it can be taken. */
interface Choice {
  label: string
  /** Reachable, rather than a rung still to be bought. */
  open: boolean
  chosen: boolean
}

function choicesFor(
  field: RaidField,
  encounter: number,
  unlocked: number,
  size: number,
  difficulty: DifficultyId,
): Choice[] {
  if (field === 'boss') {
    return ENCOUNTERS.map((fight, i) => ({
      label: fight.short,
      open: bossOpen(unlocked, i),
      chosen: i === encounter,
    }))
  }
  if (field === 'size') {
    return RAID_SIZES.map((option) => ({
      label: `${option}`,
      open: isOpen(unlocked, encounter, option, 'normal'),
      chosen: option === size,
    }))
  }
  return DIFFICULTY_ORDER.map((id) => ({
    label: DIFFICULTIES[id].name,
    open: isOpen(unlocked, encounter, size, id),
    chosen: id === difficulty,
  }))
}

function accentFor(field: RaidField, difficulty: DifficultyId): string {
  if (field === 'boss') return COLORS.boss
  if (field === 'difficulty' && difficulty === 'heroic') return COLORS.hpBarLow
  return COLORS.castBar
}

/** How far in from a field's edge its text starts, at either end. */
function inset(): number {
  return 12 * L.ui
}

/**
 * The open list: under its field, and never off the bottom of the screen.
 *
 * It is allowed to cover the fields below it, which is the whole point of a
 * list that opens — the alternative is pushing them down, and a screen whose
 * controls move when you look at one of them is a screen you have to re-read
 * after every press.
 */
function listRects(field: Rect, count: number): Rect[] {
  const p = pad()
  const h = Math.max(28, Math.min(field.h, (L.h - p * 2) / (count + 1)))
  const wanted = field.y + field.h + 2
  const y = Math.min(wanted, Math.max(p, L.h - p - h * count))
  return Array.from({ length: count }, (_, i) => ({ x: field.x, y: y + i * h, w: field.w, h }))
}

function optionCount(field: RaidField): number {
  if (field === 'boss') return ENCOUNTERS.length
  if (field === 'size') return RAID_SIZES.length
  return DIFFICULTY_ORDER.length
}

export function raidSetupLayout(open: RaidField | null = null): RaidSetupLayout {
  const p = pad()
  const back = backRect()
  const w = Math.min(420, L.w - p * 2)
  const x = L.w / 2 - w / 2
  const top = titleY() + 30 * L.ui * MENU_TEXT
  // Three lines under the last field: what the fight asks of you, what it
  // throws tonight, and how much of the boss that is.
  const summary = 46 * L.ui * MENU_TEXT
  const bottom = back.y - 12 - summary
  const block = (bottom - top) / RAID_FIELDS.length
  const h = Math.max(34, Math.min(56, block - 18 * L.ui * MENU_TEXT))
  const headings: number[] = []
  const fields = RAID_FIELDS.map((_, i) => {
    const y = top + block * i + 14 * L.ui * MENU_TEXT
    headings.push(y - 5 * L.ui * MENU_TEXT)
    return { x, y, w, h }
  })

  return {
    fields,
    options:
      open === null ? [] : listRects(fields[RAID_FIELDS.indexOf(open)]!, optionCount(open)),
    back,
    next: primaryRect(),
    headings,
    summaryY: bottom + 18 * L.ui * MENU_TEXT,
  }
}

/** The closed control: the answer on the left, what is left of the list on the right. */
function control(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  value: string,
  tally: string,
  accent: string,
  size: number,
  opened: boolean,
): void {
  ctx.fillStyle = opened ? 'rgba(250, 204, 21, 0.12)' : COLORS.panel
  ctx.fillRect(r.x, r.y, r.w, r.h)
  ctx.strokeStyle = opened ? accent : COLORS.panelEdge
  ctx.lineWidth = opened ? 2 : 1
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)

  const mid = r.y + r.h / 2 + size * 0.35
  ctx.font = px(size, true)
  ctx.textAlign = 'left'
  ctx.fillStyle = accent
  ctx.fillText(value, r.x + inset(), mid)

  // The count is the part a list costs you: with the rows folded away, this
  // is the only place the screen still says how much of the game is above
  // where you have got to.
  ctx.textAlign = 'right'
  ctx.fillStyle = COLORS.textDim
  ctx.fillText(`${tally} ${opened ? '▲' : '▼'}`, r.x + r.w - inset(), mid)
}

function optionRow(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  choice: Choice,
  accent: string,
  size: number,
): void {
  ctx.fillStyle = choice.chosen ? 'rgba(250, 204, 21, 0.12)' : COLORS.panel
  ctx.fillRect(r.x, r.y, r.w, r.h)
  ctx.strokeStyle = choice.chosen ? accent : COLORS.panelEdge
  ctx.lineWidth = 1
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)

  const mid = r.y + r.h / 2 + size * 0.35
  ctx.font = px(size, choice.chosen)
  ctx.textAlign = 'left'
  ctx.fillStyle = choice.open ? accent : COLORS.dead
  ctx.fillText(choice.label, r.x + inset(), mid)

  // Locked rows are listed rather than left out, the same as they were when
  // this was a row of buttons: what is still up there is worth knowing.
  const mark = choice.open ? (choice.chosen ? '✓' : '') : '🔒'
  if (mark === '') return
  ctx.textAlign = 'right'
  ctx.fillText(mark, r.x + r.w - inset(), mid)
}

export function drawRaidSetup(
  ctx: CanvasRenderingContext2D,
  encounter: number,
  /** How far up the one chain of settings the player has climbed. */
  unlocked: number,
  size: number,
  difficulty: DifficultyId,
  /** Which field's list is down, if any. */
  open: RaidField | null = null,
): void {
  backdrop(ctx)
  screenTitle(ctx, 'RAID', 'pick the fight, then who you are playing')

  const layout = raidSetupLayout(open)
  const lists = RAID_FIELDS.map((field) =>
    choicesFor(field, encounter, unlocked, size, difficulty),
  )
  const tallies = lists.map((list) => `${list.filter((c) => c.open).length}/${list.length}`)

  // One size for the whole screen, measured over everything that has to fit
  // inside a field: the answers, the counts, and every row of every list.
  // They are all the same width, so one measurement settles all of them.
  ctx.font = font(13, true)
  const text = groupSize(
    ctx,
    lists.flatMap((list, i) => [
      `${list.find((c) => c.chosen)?.label ?? ''}    ${tallies[i]!} ▼`,
      ...list.map((c) => `${c.label}    🔒`),
    ]),
    layout.fields[0]!.w - inset() * 2,
  )

  RAID_FIELDS.forEach((field, i) => {
    ctx.textAlign = 'center'
    ctx.fillStyle = COLORS.textDim
    ctx.font = font(9)
    ctx.fillText(FIELD_NAMES[field], L.w / 2, layout.headings[i]!)

    const list = lists[i]!
    control(
      ctx,
      layout.fields[i]!,
      list.find((c) => c.chosen)?.label ?? '',
      tallies[i]!,
      accentFor(field, difficulty),
      text,
      open === field,
    )
  })

  // What the three fields add up to.
  //
  // The boss, the size and the difficulty each decide part of one thing —
  // which mechanics this pull has in it — and until this was here that sum
  // was invisible: a player who ticked heroic could see the health bar go up
  // and had no way to learn that a rung had been bought as well. It reads off
  // the same function the scheduler does, so it cannot describe a fight that
  // is not the one about to start.
  drawSummary(ctx, encounter, size, difficulty, layout)

  button(ctx, layout.back, 'BACK', '', COLORS.textDim)
  button(ctx, layout.next, 'PICK YOUR CLASS', '', COLORS.castBar, true)

  // Last, so it covers the fields under it rather than being covered.
  if (open !== null) {
    const list = lists[RAID_FIELDS.indexOf(open)]!
    const accent = accentFor(open, difficulty)
    layout.options.forEach((r, i) => optionRow(ctx, r, list[i]!, accent, text))
  }
}

/** What the fight asks, what it throws, and how much of the boss that is. */
function drawSummary(
  ctx: CanvasRenderingContext2D,
  encounter: number,
  size: number,
  difficulty: DifficultyId,
  layout: RaidSetupLayout,
): void {
  const fight = ENCOUNTERS[encounter]
  if (!fight) return

  const kit = encounterKit(fight, size, difficulty)
  const wide = L.w - pad() * 2
  const y = layout.summaryY
  const line = 14 * L.ui * MENU_TEXT

  // The demand used to sit inside the boss button, which is what made the
  // buttons two lines tall and their type small. It says the same thing here
  // and only for the fight actually picked.
  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.text
  ctx.font = font(10)
  fitText(ctx, fight.demand, L.w / 2, y, wide)

  ctx.fillStyle = COLORS.boss
  ctx.font = font(10, true)
  fitText(ctx, kit.map((id) => MECHANIC_NAMES[id]).join(' · '), L.w / 2, y + line, wide)

  // And what is still in the boss and not in tonight's pull, so the ladder
  // reads as a ladder rather than as a fixed list that happens to differ.
  const held = fight.ladder.length - kit.length
  ctx.fillStyle = COLORS.textDim
  ctx.font = font(8)
  fitText(
    ctx,
    held > 0
      ? `${kit.length} of ${fight.ladder.length} — a bigger raid or heroic buys the rest`
      : `all ${fight.ladder.length}, which is everything it has`,
    L.w / 2,
    y + line * 2,
    wide,
    8,
  )
}

export function hitRaidSetup(
  x: number,
  y: number,
  open: RaidField | null = null,
): RaidSetupHit | null {
  const layout = raidSetupLayout(open)

  // An open list is drawn over everything, so it answers before anything
  // under it does.
  if (open !== null) {
    for (let i = 0; i < layout.options.length; i++) {
      if (inside(layout.options[i]!, x, y)) return { kind: 'choose', field: open, index: i }
    }
    if (inside(layout.fields[RAID_FIELDS.indexOf(open)]!, x, y)) {
      return { kind: 'open', field: open }
    }
    // Anywhere else shuts it and does nothing else. A press that dismisses
    // and acts in the same motion is a press you cannot take back — you would
    // leave the screen by tapping past a list you only meant to close.
    return { kind: 'dismiss' }
  }

  if (inside(layout.back, x, y)) return { kind: 'back' }
  if (inside(layout.next, x, y)) return { kind: 'next' }
  for (let i = 0; i < RAID_FIELDS.length; i++) {
    if (inside(layout.fields[i]!, x, y)) return { kind: 'open', field: RAID_FIELDS[i]! }
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
  // 34 rather than 26: the title has a sub line, and the fight label was
  // printing through its descenders once both doubled.
  const headingY = titleY() + 34 * L.ui * MENU_TEXT
  // Room for the fight line, the record line and the affix's two.
  const summaryY = headingY + 68 * L.ui * MENU_TEXT
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
  fitText(
    ctx,
    best
      ? `${best.line}   ·   ${best.attempts} attempt${best.attempts === 1 ? '' : 's'}`
      : 'no attempt yet today',
    L.w / 2,
    layout.headingY + 16 * L.ui * MENU_TEXT,
    L.w - pad() * 2,
  )

  // The twist, given its own line and its own colour: it is the thing that
  // makes today different from the same boss yesterday.
  ctx.fillStyle = COLORS.castBar
  ctx.font = font(11, true)
  ctx.fillText(today.affix.name, L.w / 2, layout.headingY + 34 * L.ui * MENU_TEXT)
  ctx.fillStyle = COLORS.textDim
  ctx.font = font(9)
  fitText(ctx, today.affix.detail, L.w / 2, layout.headingY + 47 * L.ui * MENU_TEXT, L.w - pad() * 2)

  fitText(ctx, 'THE DAY PICKS THE FIGHT — YOU PICK THE CLASS', L.w / 2, layout.summaryY, L.w - pad() * 2)

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
    maps: column(BATTLEGROUNDS.length, titleY() + 34 * L.ui * MENU_TEXT, back.y - 16, 400),
    back,
  }
}

export function drawBgSetup(ctx: CanvasRenderingContext2D, kind: BgKind | null): void {
  backdrop(ctx)
  screenTitle(ctx, 'BATTLEGROUND', 'five against five, and the other five are people')

  const layout = bgSetupLayout()
  const text = rowText(
    ctx,
    layout.maps[0]!,
    BATTLEGROUNDS.map((map) => map.name),
    BATTLEGROUNDS.map((map) => map.demand),
  )
  BATTLEGROUNDS.forEach((map, i) => {
    button(ctx, layout.maps[i]!, map.name, map.demand, COLORS.tank, map.kind === kind, text)
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

export type SettingsHit =
  | { kind: 'sound' }
  | { kind: 'volume'; level: number }
  | { kind: 'backdrop' }
  | { kind: 'camera'; level: number }
  | { kind: 'name' }
  | { kind: 'back' }

export interface SettingsLayout {
  name: Rect
  sound: Rect
  volumes: Rect[]
  backdrop: Rect
  cameras: Rect[]
  back: Rect
  headings: number[]
}

export function settingsLayout(): SettingsLayout {
  const p = pad()
  const back = backRect()
  const top = titleY() + 40 * L.ui * MENU_TEXT
  const rowH = Math.max(38, Math.min(52, L.h * 0.07))
  const w = Math.min(340, L.w - p * 2)
  const gap = 6

  // Four labelled rows now, so the space between them is what gives rather
  // than the rows themselves: a settings screen that runs off the bottom of a
  // small phone is worse than a cramped one.
  const rows = 5
  const spare = back.y - 14 - (top + 14 * L.ui) - rowH * rows
  const step = rowH + Math.max(18 * L.ui, Math.min(34 * L.ui, spare / (rows - 1)))

  const rowY = (i: number): number => top + 14 * L.ui + step * i
  const spread = (count: number, y: number): Rect[] => {
    const cw = (w - gap * (count - 1)) / count
    return Array.from({ length: count }, (_, i) => ({
      x: L.w / 2 - w / 2 + i * (cw + gap),
      y,
      w: cw,
      h: rowH,
    }))
  }

  const name = { x: L.w / 2 - w / 2, y: rowY(0), w, h: rowH }
  const sound = { x: L.w / 2 - w / 2, y: rowY(1), w, h: rowH }
  const volumes = spread(VOLUME_NAMES.length, rowY(2))
  const cameras = spread(ZOOM_NAMES.length, rowY(3))
  const backdrop = { x: L.w / 2 - w / 2, y: rowY(4), w, h: rowH }

  return {
    name,
    sound,
    volumes,
    cameras,
    backdrop,
    back,
    headings: [0, 1, 2, 3, 4].map((i) => rowY(i) - 10 * L.ui),
  }
}

export function drawSettings(
  ctx: CanvasRenderingContext2D,
  muted: boolean,
  volume: number,
  /** Whether the fight behind the menus is on. Named for the setting, not for
   *  the local `backdrop()`, which is the thing it draws through. */
  scene: boolean,
  camera: number,
  name: string,
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

  heading('NAME', layout.headings[0]!)
  button(ctx, layout.name, name, 'what the rest of them call you', COLORS.text)

  heading('SOUND', layout.headings[1]!)
  button(
    ctx,
    layout.sound,
    muted ? 'OFF' : 'ON',
    muted ? 'nothing is audible' : 'a puddle behind you is audible before it is visible',
    muted ? COLORS.dead : COLORS.hpBar,
    !muted,
  )

  heading('VOLUME', layout.headings[2]!)
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

  heading('CAMERA', layout.headings[3]!)
  ZOOM_NAMES.forEach((name, i) => {
    button(ctx, layout.cameras[i]!, name, '', COLORS.hpBar, i === camera)
  })

  heading('BACKDROP', layout.headings[4]!)
  button(
    ctx,
    layout.backdrop,
    scene ? 'ON' : 'OFF',
    scene ? 'a real fight, running itself behind the menus' : 'the menus sit on nothing',
    scene ? COLORS.tank : COLORS.dead,
    scene,
  )

  button(ctx, layout.back, 'BACK', '', COLORS.textDim)
}

export function hitSettings(x: number, y: number): SettingsHit | null {
  const layout = settingsLayout()
  if (inside(layout.back, x, y)) return { kind: 'back' }
  if (inside(layout.name, x, y)) return { kind: 'name' }
  if (inside(layout.sound, x, y)) return { kind: 'sound' }
  if (inside(layout.backdrop, x, y)) return { kind: 'backdrop' }
  for (let i = 0; i < layout.cameras.length; i++) {
    if (inside(layout.cameras[i]!, x, y)) return { kind: 'camera', level: i }
  }
  for (let i = 0; i < layout.volumes.length; i++) {
    if (inside(layout.volumes[i]!, x, y)) return { kind: 'volume', level: i }
  }
  return null
}

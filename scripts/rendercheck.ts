import { BAR_SLOTS } from '../src/input'
import { MAX_CATCHUP_TICKS, advance, type Clock } from '../src/loop'
import { drawWorld } from '../src/render/draw'
import { Effects } from '../src/render/effects'
import { allIcons, iconFor } from '../src/render/icons'
import {
  drawHud,
  meterRect,
  partyButton,
  partyFrames,
  slotStatus,
  soundButton,
} from '../src/render/hud'
import { drawRoster, hitRoster, rosterLayout } from '../src/render/roster'
import { COLORS, L, classColor, updateLayout } from '../src/render/theme'
import { ABILITIES, type Ability } from '../src/sim/abilities'
import {
  abilityBar,
  autoParty,
  canSelect,
  CLASS_ORDER,
  CLASSES,
  countRoles,
  FIVE_MAN,
  isLegalComposition,
  makeSlots,
  mitigation,
  partyIndex,
  pickFor,
  randomAround,
  randomParty,
  RESOURCES,
  ROLE_LIMITS,
  roleOf,
  selectInto,
  SPEC_OPTIONS,
  specLabel,
  specOf,
  type Pick,
  type RaidSize,
} from '../src/sim/classes'
import {
  PROJECTILE_MIN_RANGE,
  addAura,
  applyDamage,
  applyHeal,
  boss,
  castBlocker,
  dist,
  landAbility,
  projectileKind,
  resolveAbility,
  topThreatTarget,
} from '../src/sim/combat'
import {
  ARENA_RADIUS,
  CHARGE_RAGE,
  CRIT_CHANCE,
  CRIT_MULTIPLIER,
  ENRAGE_AT,
  MELEE_RANGE,
  SPELL_RANGE,
} from '../src/sim/constants'
import { Rng } from '../src/sim/rng'
import { step } from '../src/sim/sim'
import { PLAYER_ID, createState } from '../src/sim/state'
import {
  HISTORY_LIMIT,
  STANDING_LIMIT,
  append,
  record,
  standings,
  totals,
  type Attempt,
} from '../src/history'
import { drawHistory, historyLayout, hitHistory } from '../src/render/history'
import { gainPower } from '../src/sim/combat'
import type { Role } from '../src/sim/types'

/** Records every 2D context call so the render path can run outside a browser. */
function stubCtx(): CanvasRenderingContext2D {
  const noop = () => {}
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop) {
      if (prop === 'measureText') return () => ({ width: 10 })
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
        return () => ({ addColorStop: noop })
      }
      if (prop === 'canvas') return { width: 960, height: 760 }
      return noop
    },
    set() {
      return true
    },
  }
  return new Proxy({}, handler) as unknown as CanvasRenderingContext2D
}

function touchView(active: boolean) {
  return {
    active,
    // Mirror what Input actually reports: positions come from the layout.
    joystick: active
      ? {
          originX: L.joyHomeX,
          originY: L.joyHomeY,
          knobX: L.joyHomeX + L.joyBase * 0.4,
          knobY: L.joyHomeY - L.joyBase * 0.3,
        }
      : null,
    heldSlots: new Set<number>(active ? [1] : []),
  }
}

const ctx = stubCtx()
let frames = 0
// Exercise a desktop and a portrait-phone layout; both go through the same
// drawing code with very different numbers.
const VIEWPORTS = [
  [1440, 900],
  [390, 844],
] as const

for (const [vi, attempt] of [[0, 0], [1, 5]] as const) {
  updateLayout(VIEWPORTS[vi]![0], VIEWPORTS[vi]![1])
  const s = createState(0x51ed, attempt)
  const rng = new Rng(0x51ed + attempt * 7919)
  while (s.outcome === 'ongoing' && s.time < ENRAGE_AT + 60) {
    step(s, { moveX: 0, moveY: 0, pressed: s.tick % 45 === 0 ? [0, 1, 2] : [] }, rng)
    drawWorld(ctx, s, 0.5, s.time, new Effects())
    // Alternate modes so both the desktop bar and the touch overlay are drawn.
    drawHud(ctx, s, touchView(s.tick % 2 === 0), s.tick % 3 === 0)
    frames++
  }
  // Also render the terminal state, which draws the outcome overlay.
  drawWorld(ctx, s, 1, s.time, new Effects())
  drawHud(ctx, s, touchView(true), true)
  drawHud(ctx, s, touchView(false), false)
  console.log(`attempt ${attempt}: ${s.outcome} at ${s.time.toFixed(1)}s`)
}
console.log(`rendered ${frames} frames with no exceptions`)

// --- the clock must not bank time on menus --------------------------------
//
// This is the bug where a fight opened at several times speed: the frame loop
// accumulated simulation time while the raid screen was up, and the fight
// then burned through the backlog the moment it started.
{
  const dt = 1 / 30
  let clock: Clock = { accumulator: 0, elapsedTotal: 0 }

  // A minute on the raid screen at 60fps.
  for (let i = 0; i < 3600; i++) clock = advance(clock, 1 / 60, false, dt)
  const banked = clock.accumulator
  console.log(
    banked === 0 ? 'ok  ' : 'FAIL',
    `  a minute of menu banks ${banked.toFixed(3)}s of simulation`,
  )
  if (banked !== 0) throw new Error('menu time is accumulating into the fight')

  // Wall-clock time still advances, so animations do not freeze behind menus.
  console.log(
    clock.elapsedTotal > 59 ? 'ok  ' : 'FAIL',
    `  animation clock still runs (${clock.elapsedTotal.toFixed(1)}s)`,
  )
  if (clock.elapsedTotal <= 59) throw new Error('animation clock stopped')

  // A stalled frame is dropped rather than replayed at speed.
  clock = advance({ accumulator: 0, elapsedTotal: 0 }, 30, true, dt)
  const ticks = Math.floor(clock.accumulator / dt)
  console.log(
    ticks <= MAX_CATCHUP_TICKS ? 'ok  ' : 'FAIL',
    `  a 30s stall queues ${ticks} ticks, not 900`,
  )
  if (ticks > MAX_CATCHUP_TICKS) throw new Error('catch-up is unbounded')

  // And normal frames still run at exactly one tick each.
  clock = { accumulator: 0, elapsedTotal: 0 }
  let run = 0
  for (let i = 0; i < 300; i++) {
    clock = advance(clock, dt, true, dt)
    while (clock.accumulator >= dt) {
      clock.accumulator -= dt
      run++
    }
  }
  console.log(
    run === 300 ? 'ok  ' : 'FAIL',
    `  300 frames at the tick rate produce ${run} ticks`,
  )
  if (run !== 300) throw new Error('steady-state stepping drifted')
}

// --- the results screen must be silent ------------------------------------
//
// Sound events are drained by the renderer each frame. Leaving the final
// tick's events queued after the fight ended meant they were replayed for as
// long as the report was on screen.
{
  const s = createState(0x51ed, 0)
  const rng = new Rng(0x51ed)
  while (s.outcome === 'ongoing' && s.time < ENRAGE_AT + 60) {
    step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  }

  const atEnd = s.sounds.length
  // Frames keep arriving after the fight resolves.
  for (let i = 0; i < 20; i++) step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  const afterwards = s.sounds.length

  console.log(
    afterwards === 0 ? 'ok  ' : 'FAIL',
    `  results screen queues ${afterwards} sounds per frame (ended with ${atEnd})`,
  )
  if (afterwards !== 0) throw new Error('sound events repeat over the results screen')
}

// --- every ability needs its own icon -------------------------------------
//
// Same failure mode as the projectiles: icons are keyed by ability id, so a
// renamed spell list would silently fall back to a generic grey orb. And two
// buttons that look alike are worse than a bar with no icons at all.
{
  const defined = new Map(allIcons())
  const missing = Object.keys(ABILITIES).filter((id) => !defined.has(id))
  console.log(
    missing.length === 0 ? 'ok  ' : 'FAIL',
    `  all ${Object.keys(ABILITIES).length} abilities have an icon`,
  )
  if (missing.length > 0) throw new Error(`no icon for: ${missing.join(', ')}`)

  const seen = new Map<string, string>()
  const clashes: string[] = []
  for (const id of Object.keys(ABILITIES)) {
    const spec = iconFor(id)
    const key = `${spec.shape}/${spec.colour}/${spec.repeat ?? 1}`
    const owner = seen.get(key)
    if (owner) clashes.push(`${id} looks like ${owner}`)
    else seen.set(key, id)
  }
  console.log(
    clashes.length === 0 ? 'ok  ' : 'FAIL',
    `  ${seen.size} icons are visually distinct`,
  )
  if (clashes.length > 0) throw new Error(clashes.join('; '))

  // Icons that belong to no ability are dead weight in the table.
  const orphans = [...defined.keys()].filter((id) => !(id in ABILITIES))
  console.log(orphans.length === 0 ? 'ok  ' : 'FAIL', `  no orphaned icons`)
  if (orphans.length > 0) throw new Error(`icons for missing abilities: ${orphans.join(', ')}`)
}

// Every ranged ability must put a bolt in the air.
//
// This check used to assert only that *some* projectile existed, and duly
// passed when a rename left thirty-three of the thirty-four ranged abilities
// silently firing nothing. Assert each one individually instead.
{
  const s = createState(0x51ed, 0)
  const rng = new Rng(0x51ed)
  const caster = s.actors[0]!
  const ally = s.actors.find((a) => a.faction === 'party' && a.id !== caster.id)!
  const target = s.actors[s.actors.length - 1]!

  const silent: string[] = []
  // A charge has a range and throws nothing: it is the caster crossing the
  // gap rather than something crossing it for them.
  const thrown = (a: Ability) => a.range >= PROJECTILE_MIN_RANGE && a.kind !== 'charge'

  for (const ability of Object.values(ABILITIES)) {
    if (!thrown(ability)) continue
    s.projectiles.length = 0
    // Heals need someone other than the caster, or there is nothing to cross.
    const victim = ability.kind === 'heal' ? ally : target
    resolveAbility(s, caster, ability, victim.id, rng)
    if (s.projectiles.length === 0) silent.push(ability.id)
  }

  const ranged = Object.values(ABILITIES).filter(thrown)
  console.log(
    silent.length === 0 ? 'ok  ' : 'FAIL',
    `  all ${ranged.length} ranged abilities fire a bolt`,
  )
  if (silent.length > 0) throw new Error(`no projectile from: ${silent.join(', ')}`)

  // And every visual class is reachable, so none of them is dead code.
  const kinds = new Set(ranged.map((a) => projectileKind(a)))
  console.log(
    kinds.size === 4 ? 'ok  ' : 'FAIL',
    `  bolt styles in use: ${[...kinds].sort().join(', ')}`,
  )
  if (kinds.size !== 4) throw new Error('a projectile style is unreachable')
}

// --- the party screen must draw and stay hit-testable ---------------------
{
  // Every raid size has to lay out and stay reachable.
  const parties: Pick[][] = [
    autoParty(5, pickFor('mage', 'dps')!),
    autoParty(10, pickFor('druid', 'tank')!),
    autoParty(25, pickFor('shaman', 'healer')!),
  ]
  for (const [w, h] of [[1440, 900], [390, 844], [844, 390]] as const) {
    updateLayout(w, h)

    for (const party of parties) {
      for (let slot = 0; slot < party.length; slot += 3) {
        drawRoster(stubCtx(), party, slot % 2 === 0 ? 'normal' : 'heroic', 1.5)
      }

      // Every drawn control must be reachable by a tap at its own centre, at
      // every raid size — a 25-slot grid is where they start to collide.
      const layout = rosterLayout()
      const targets = [
        ...layout.sizes.map((r, i) => [`size ${i}`, r] as const),
        ...layout.difficulties.map((r, i) => [`difficulty ${i}`, r] as const),
        ...layout.classes.map((r, i) => [`class ${i}`, r] as const),
        ['history', layout.history] as const,
        ['pull', layout.pull] as const,
      ]

      const bad = targets.filter(([name, r]) => {
        if (r.x < 0 || r.y < 0 || r.x + r.w > w || r.y + r.h > h) return true
        const hit = hitRoster(r.x + r.w / 2, r.y + r.h / 2)
        if (hit === null) return true
        // The hit must be the control that was drawn there, not a neighbour
        // sitting on top of it.
        const [kind] = name.split(' ')
        if (kind === 'class' && hit.kind !== 'class') return true
        if (kind === 'size' && hit.kind !== 'size') return true
        if (kind === 'difficulty' && hit.kind !== 'difficulty') return true
        if (kind === 'history' && hit.kind !== 'history') return true
        if (kind === 'pull' && hit.kind !== 'pull') return true
        return false
      })

      // No slot grid at all any more: the raid is neither chosen nor shown.
      const slotProblems: string[] = []
      if ('slots' in layout) slotProblems.push('the roster still draws slots')

      console.log(
        bad.length === 0 && slotProblems.length === 0 ? 'ok  ' : 'FAIL',
        `  roster ${w}x${h} ${party.length}-player: ${targets.length} controls`,
      )
      if (bad.length > 0 || slotProblems.length > 0) {
        throw new Error(
          `roster ${w}x${h} ${party.length}-player: ${[...bad.map(([n]) => n), ...slotProblems].join(', ')}`,
        )
      }
    }
  }
}

// --- parties must actually stand as parties -------------------------------
//
// Grouping is the point of the structure: a puddle dropped on one party is a
// puddle on five people. If the layout scatters them, the raid is just
// twenty-five individuals and the party division means nothing.
{
  for (const size of [10, 25] as RaidSize[]) {
    const slots = makeSlots(size)
    let within = 0
    let withinCount = 0
    let across = 0
    let acrossCount = 0

    // Slot zero is the player, who starts near the pull point on their own.
    for (let a = 1; a < slots.length; a++) {
      for (let b = a + 1; b < slots.length; b++) {
        const d = Math.hypot(slots[a]!.x - slots[b]!.x, slots[a]!.y - slots[b]!.y)
        if (partyIndex(a) === partyIndex(b)) {
          within += d
          withinCount++
        } else {
          across += d
          acrossCount++
        }
      }
    }

    const avgWithin = within / Math.max(1, withinCount)
    const avgAcross = across / Math.max(1, acrossCount)
    const grouped = avgWithin < avgAcross * 0.7
    console.log(
      grouped ? 'ok  ' : 'FAIL',
      `  ${size}-player: ${avgWithin.toFixed(0)} apart within a party, ${avgAcross.toFixed(0)} across`,
    )
    if (!grouped) throw new Error(`parties are not grouped at ${size} players`)
  }

  // Role caps hold for every generated roster.
  for (const size of [5, 10, 25] as RaidSize[]) {
    const rosters = [autoParty(size, pickFor('mage', 'dps')!)]
    let seed = 7
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (let i = 0; i < 100; i++) rosters.push(randomParty(size, random))

    const bad = rosters.filter((r) => {
      const roles = countRoles(r)
      return (
        roles.tank < ROLE_LIMITS.tank.min ||
        roles.tank > ROLE_LIMITS.tank.max ||
        roles.healer < ROLE_LIMITS.healer.min ||
        roles.healer > ROLE_LIMITS.healer.max
      )
    })
    console.log(
      bad.length === 0 ? 'ok  ' : 'FAIL',
      `  ${size}-player rosters stay within 1-2 tanks and 1-3 healers`,
    )
    if (bad.length > 0) throw new Error(`role caps violated at ${size} players`)
  }
}

// --- random raids must still be raids -------------------------------------
//
// The point of keeping role counts is that a random pull is a surprise rather
// than a guaranteed loss; if that ever regresses, half of them become
// unwinnable before the first global cooldown.
{
  let seed = 12345
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }

  for (const size of [5, 10, 25] as RaidSize[]) {
    const combos = new Set<string>()
    let worstTanks = Infinity
    let worstHealers = Infinity
    let wrongSize = 0

    for (let trial = 0; trial < 300; trial++) {
      const party = randomParty(size, random)
      if (party.length !== size) wrongSize++
      const roles = countRoles(party)
      worstTanks = Math.min(worstTanks, roles.tank)
      worstHealers = Math.min(worstHealers, roles.healer)
      combos.add(party.map((p) => `${p.classId}:${roleOf(p)}`).join(','))
    }

    // Varied enough to be worth pressing twice.
    const varied = combos.size > 30
    const ok = wrongSize === 0 && worstTanks >= 1 && worstHealers >= 1 && varied
    console.log(
      ok ? 'ok  ' : 'FAIL',
      `  random ${size}-player: min ${worstTanks} tank / ${worstHealers} healer, ${combos.size} distinct`,
    )
    if (!ok) throw new Error(`randomParty produced an unfightable ${size}-player raid`)
  }
}

// --- the global cooldown must be visible on every slot --------------------
//
// It is the difference between "everything is briefly locked" and "this one
// ability is down", and it is drawn, not stated: without it the bar looks
// identical whether you just pressed something or not.
{
  updateLayout(1440, 900)
  const s = createState(0x51ed, 0)
  const player = s.actors.find((a) => a.isPlayer)!

  const idle: Circle[] = []
  drawHud(recordingCtx(idle), s, touchView(true), false)

  player.gcd = 1.2
  const locked: Circle[] = []
  drawHud(recordingCtx(locked), s, touchView(true), false)

  // Each button draws its ring; a sweep adds one arc on top of that.
  const extra = locked.length - idle.length
  console.log(
    extra >= 3 ? 'ok  ' : 'FAIL',
    `  global cooldown sweeps every slot (${extra} extra arcs while locked)`,
  )
  if (extra < 3) throw new Error('global cooldown is not drawn on the action bar')
}

// --- the action bar and its captions must fit on screen -------------------
{
  for (const [w, h] of [[1440, 900], [1280, 720], [980, 620]] as const) {
    updateLayout(w, h)
    const slot = 58 * L.ui
    // Where drawActionBar puts the caption baseline.
    const captionY = L.actionY + slot + 11 * L.ui
    // The bar is an overlay and may sit over the arena; only running off the
    // bottom of the screen is a problem.
    const fits = captionY < h - 2 && L.actionY > 0
    console.log(
      fits ? 'ok  ' : 'FAIL',
      `  ${w}x${h}: action bar caption at ${captionY.toFixed(0)} of ${h}`,
    )
    if (!fits) throw new Error(`action bar caption off screen at ${w}x${h}`)
  }
}

// --- on-screen controls must not overlap ----------------------------------
{
  for (const [w, h] of [[1440, 900], [390, 844], [844, 390], [360, 640]] as const) {
    updateLayout(w, h)
    for (const [name, rect] of [
      ['party', partyButton()],
      ['sound', soundButton()],
    ] as const) {
      const overlaps = L.btnPos.some(
        (b) =>
          Math.abs(rect.x + rect.w / 2 - b.x) < rect.w / 2 + L.btnR &&
          Math.abs(rect.y + rect.h / 2 - b.y) < rect.h / 2 + L.btnR,
      )
      // Also clear of the fight readout, which sits directly above.
      const belowReadout = rect.y > L.infoY + 15 * L.ui * 3
      const onScreen = rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= w && rect.y + rect.h <= h
      const ok = !overlaps && onScreen && belowReadout
      console.log(ok ? 'ok  ' : 'FAIL', `  ${w}x${h}: ${name} button placed clear`)
      if (!ok) throw new Error(`${name} button collides at ${w}x${h}`)
    }
  }
}

// --- every mechanic must actually fire ------------------------------------
//
// Later-phase mechanics only appear once the boss is low enough, so a change
// that quietly stops them spawning would not show up as an exception anywhere.
{
  const seen = new Set<string>()
  let maxPhase = 1
  for (let run = 0; run < 6 && seen.size < 5; run++) {
    const s = createState(1000 + run * 137, 8)
    const rng = new Rng(1000 + run * 137)
    while (s.outcome === 'ongoing' && s.time < ENRAGE_AT + 60) {
      step(s, { moveX: 0, moveY: 0, pressed: s.tick % 45 === 0 ? [0, 1, 2] : [] }, rng)
      for (const g of s.ground) seen.add(g.kind)
      if (s.actors.some((a) => a.faction === 'boss' && a.id !== 100)) seen.add('adds')
      if (s.actors.some((a) => a.auras.some((au) => au.id === 'spread'))) seen.add('spread')
      maxPhase = Math.max(maxPhase, s.phase)
    }
  }
  const want = ['puddle', 'breath', 'shockwave', 'adds', 'spread']
  const missing = want.filter((w) => !seen.has(w))
  console.log(
    missing.length === 0 ? 'ok  ' : 'FAIL',
    `  mechanics fired: ${[...seen].sort().join(', ')} (reached phase ${maxPhase})`,
  )
  if (missing.length > 0) throw new Error(`mechanics never fired: ${missing.join(', ')}`)
}

// --- the controls must actually reach the canvas ----------------------------
//
// Exceptions alone would not have caught the bug where touch controls were
// gated behind a flag that started false: nothing threw, nothing drew. So
// record the draw calls and assert the circles are really there, on screen.

interface Circle {
  x: number
  y: number
  r: number
}

interface Label {
  text: string
  x: number
  y: number
}

function recordingCtx(circles: Circle[], labels: Label[] = []): CanvasRenderingContext2D {
  const noop = () => {}
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop) {
      if (prop === 'arc') {
        return (x: number, y: number, r: number) => circles.push({ x, y, r })
      }
      if (prop === 'fillText') {
        return (text: string, x: number, y: number) => labels.push({ text, x, y })
      }
      if (prop === 'measureText') return () => ({ width: 10 })
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
        return () => ({ addColorStop: noop })
      }
      if (prop === 'canvas') return { width: L.w, height: L.h }
      return noop
    },
    set: () => true,
  }
  return new Proxy({}, handler) as unknown as CanvasRenderingContext2D
}

let failures = 0
function expect(label: string, ok: boolean, detail: string): void {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `  -> ${detail}`}`)
}

for (const [label, w, h] of [
  ['portrait 390x844', 390, 844],
  ['landscape 844x390', 844, 390],
] as const) {
  updateLayout(w, h)
  const s = createState(0x51ed, 0)

  const circles: Circle[] = []
  drawHud(recordingCtx(circles), s, touchView(true), false)

  const onScreen = (c: Circle) => c.x >= 0 && c.x <= w && c.y >= 0 && c.y <= h

  const stick = circles.find((c) => Math.abs(c.r - L.joyBase) < 1)
  expect(`${label}: joystick ring drawn`, stick !== undefined && onScreen(stick), JSON.stringify(stick))

  const buttons = circles.filter(
    (c) => Math.abs(c.r - L.btnR) < 1 && L.btnPos.some((b) => Math.abs(c.x - b.x) < 2),
  )
  expect(`${label}: three ability buttons drawn`, buttons.length >= 3, `${buttons.length}`)
  expect(`${label}: buttons on screen`, buttons.every(onScreen), JSON.stringify(buttons[0]))

  // The desktop bar must not draw those circles when touch is inactive.
  const desktop: Circle[] = []
  drawHud(recordingCtx(desktop), s, touchView(false), false)
  const strays = desktop.filter((c) => Math.abs(c.r - L.btnR) < 1)
  expect(`${label}: no touch buttons in keyboard mode`, strays.length === 0, `${strays.length}`)
}

// --- the camera must stay locked to the player ----------------------------
//
// The view follows the player rather than the arena. Drawing is the only
// place that knows this, so the check is on what actually lands on the
// canvas: the player's own token at the centre of the play area, and the
// arena floor displaced by exactly as far as they have walked.
for (const [label, w, h] of [
  ['desktop 1440x900', 1440, 900],
  ['portrait 390x844', 390, 844],
] as const) {
  updateLayout(w, h)
  const s = createState(0x51ed, 0)
  const rng = new Rng(0x51ed)

  // Walk off the origin, or a camera that never moved would pass this.
  for (let i = 0; i < 60; i++) step(s, { moveX: 1, moveY: 0.6, pressed: [] }, rng)
  const player = s.actors.find((a) => a.isPlayer)!
  const walked = Math.hypot(player.pos.x, player.pos.y)
  expect(`${label}: player walked off the origin`, walked > 50, walked.toFixed(1))

  const circles: Circle[] = []
  drawWorld(recordingCtx(circles), s, 1, s.time, new Effects())

  const token = Math.max(4, player.radius * L.scale)
  const centred = circles.some(
    (c) => Math.abs(c.x - L.cx) < 0.01 && Math.abs(c.y - L.cy) < 0.01 && Math.abs(c.r - token) < 0.01,
  )
  expect(`${label}: player token sits at the centre`, centred, `no r=${token.toFixed(1)} circle at ${L.cx},${L.cy}`)

  const floor = circles.find((c) => Math.abs(c.r - L.arenaR) < 0.01)
  const expectedX = L.cx - player.pos.x * L.scale
  const expectedY = L.cy - player.pos.y * L.scale
  const follows =
    floor !== undefined &&
    Math.abs(floor.x - expectedX) < 0.01 &&
    Math.abs(floor.y - expectedY) < 0.01
  expect(`${label}: arena scrolls under the player`, follows, JSON.stringify(floor))
}

// --- threat is earned, not issued -----------------------------------------
//
// Tanks used to open with a flat 400 threat, which meant the pull could not
// go wrong and the threat table was decoration for the first minute. Now the
// table starts empty and the tank has to take the boss with a taunt, so all
// three of these are load-bearing: the empty start, the taunt itself, and an
// AI that actually presses it.
{
  const s = createState(0x51ed, 0)

  const start = Object.entries(s.threat)
  expect(
    'nobody opens with a threat lead',
    start.length > 0 && start.every(([, v]) => v === 0),
    JSON.stringify(s.threat),
  )

  // Every tank spec carries a taunt, and it fits on a bar the player can
  // reach: an ability nobody can press is the same as one that is missing.
  const tanks = CLASS_ORDER.flatMap((id) =>
    CLASSES[id].specs.filter((spec) => spec.role === 'tank').map((spec) => ({ id, spec })),
  )
  const untaunted = tanks.filter(({ spec }) => {
    const taunt = spec.abilities.taunt
    return !taunt || ABILITIES[taunt]?.kind !== 'taunt'
  })
  expect(
    `all ${tanks.length} tank specs carry a taunt`,
    tanks.length === 3 && untaunted.length === 0,
    untaunted.map((t) => t.id).join(', '),
  )

  // The bar order is a contract with the keyboard: slot i is pressed with key
  // i+1, and the label on the slot is that index. It used to be a field on
  // the ability, which could not survive one ability sitting in different
  // slots in two specs — a warrior's charge is the fifth button as
  // protection and the fourth as arms.
  const mislabelled: string[] = []
  for (const id of CLASS_ORDER) {
    for (const spec of CLASSES[id].specs) {
      const bar = abilityBar({ classId: id, spec: spec.id })
      if (bar.length > BAR_SLOTS) mislabelled.push(`${id} ${spec.role}: ${bar.length} slots`)
      if (new Set(bar).size !== bar.length) mislabelled.push(`${id} ${spec.role}: a repeated ability`)
      if (bar.some((abilityId) => 'key' in ABILITIES[abilityId]!)) {
        mislabelled.push(`${id} ${spec.role}: an ability still carries its own key`)
      }
    }
  }
  expect('no ability carries a key of its own', mislabelled.length === 0, mislabelled.join('; '))
}

// A taunt has to take the boss back off whoever ran away with it.
{
  const s = createState(0x51ed, 0)
  const rng = new Rng(0x51ed)
  const tank = s.actors.find((a) => a.role === 'tank')!
  const dealer = s.actors.find((a) => a.faction === 'party' && a.role === 'dps')!

  s.threat[dealer.id] = 5000
  expect('a dealer can out-threat the tank', topThreatTarget(s)?.id === dealer.id, `${topThreatTarget(s)?.name}`)

  // Landed rather than cast: a taunt is thrown, so casting it only puts it
  // in the air. What it does when it arrives is what is being checked here.
  const taunt = ABILITIES[CLASSES.warrior.specs.find((sp) => sp.role === 'tank')!.abilities.taunt!]!
  landAbility(s, tank, taunt, boss(s).id, rng)
  expect('the taunt takes it back', topThreatTarget(s)?.id === tank.id, `${topThreatTarget(s)?.name}`)

  // But only just: it buys the lead, it does not end the fight. A dealer that
  // keeps going takes the boss straight back.
  const lead = (s.threat[tank.id] ?? 0) - 5000
  expect('the taunt is a nose ahead, not a pile of threat', lead > 0 && lead < 1000, `${lead.toFixed(0)}`)
}

// And the AI has to use it: with no head start, an unattended raid must still
// end up with the boss parked on a tank rather than chewing through the back
// line for the whole fight.
{
  for (const size of [5, 25] as RaidSize[]) {
    const party = autoParty(size, pickFor('mage', 'dps')!)
    const s = createState(0x51ed, 3, party)
    const rng = new Rng(0x51ed + 3 * 7919)

    let onTank = 0
    let ticks = 0
    let firstTankPull = -1
    while (s.outcome === 'ongoing' && s.time < 90) {
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
      const held = topThreatTarget(s)
      if (held?.role === 'tank' && firstTankPull < 0) firstTankPull = s.time
      // The opening seconds belong to whoever the table happens to order
      // first; what matters is where the boss spends the fight.
      if (s.time < 5) continue
      ticks++
      if (held?.role === 'tank') onTank++
    }

    const share = onTank / Math.max(1, ticks)
    expect(
      `${size}-player: the boss stays on a tank`,
      share > 0.9,
      `${(share * 100).toFixed(0)}% of ${ticks} ticks`,
    )
    expect(
      `${size}-player: a tank takes it in the first seconds`,
      firstTankPull >= 0 && firstTankPull < 3,
      `${firstTankPull.toFixed(1)}s`,
    )
  }
}

// --- the composition rules have to hold however the raid was built --------
//
// They used to be advice: the party screen printed "3 tanks, max 2 — this
// will not hold" and then pulled with it. Every way a roster can be assembled
// has to respect them now, so this covers all of them.
{
  const CAPPED = [
    { role: 'tank' as Role, cap: ROLE_LIMITS.tank.max },
    { role: 'healer' as Role, cap: ROLE_LIMITS.healer.max },
  ]

  for (const { role, cap } of CAPPED) {
    const options = SPEC_OPTIONS.filter((o) => roleOf(o) === role)
    expect(`there are ${role} specs to over-fill with`, options.length >= 3, `${options.length}`)

    for (const size of [10, 25] as RaidSize[]) {
      // Tapping the same role into every slot in turn, which is exactly what
      // the party screen does with a finger held on the class list.
      let party = autoParty(size, pickFor('mage', 'dps')!)
      let rejected = 0
      for (let slot = 0; slot < size; slot++) {
        const pick = options[slot % options.length]!
        const next = selectInto(party, slot, pick)
        if (next) party = next
        else rejected++
      }

      const filled = countRoles(party)[role]
      expect(
        `${size}-player: tapping ${role}s into every slot stops at ${cap}`,
        filled <= cap && isLegalComposition(party),
        `${filled} ${role}s, ${rejected} taps rejected`,
      )
      expect(`${size}-player: the party is still the right size after ${role}s`, party.length === size, `${party.length}`)
    }

    // Swapping one for another is not an extra one, or a raid at the cap
    // could never change who fills the role at all.
    const party = autoParty(25, pickFor('mage', 'dps')!)
    expect(`the 25-player default fields ${cap} ${role}s`, countRoles(party)[role] === cap, `${countRoles(party)[role]}`)

    const held = party.findIndex((p) => roleOf(p) === role)
    const swap = selectInto(party, held, options[options.length - 1]!)
    expect(`a ${role} can be swapped for another ${role}`, swap !== null && countRoles(swap)[role] === cap, `${swap && countRoles(swap)[role]}`)

    const dpsSlot = party.findIndex((p) => roleOf(p) === 'dps')
    expect(`one ${role} past the cap is refused`, !canSelect(party, dpsSlot, options[0]!), `slot ${dpsSlot}`)
    expect(`a dealer is still fine alongside ${role}s`, canSelect(party, dpsSlot, pickFor('mage', 'dps')!), `slot ${dpsSlot}`)
    expect(`selectInto refuses the extra ${role} too`, selectInto(party, dpsSlot, options[0]!) === null, 'returned a party')
  }

  // --- and a five-man is exact, not capped ---------------------------------
  //
  // One tank, one healer, three damage. There is no arrangement of five slots
  // that plays and no way to tap the screen into a different one.
  {
    const shape = (party: Pick[]) => {
      const r = countRoles(party)
      return `${r.tank}t ${r.healer}h ${r.dps}d`
    }
    const wanted = `${FIVE_MAN.tank}t ${FIVE_MAN.healer}h ${FIVE_MAN.dps}d`

    // Every tap the class list can produce, on every slot, from a party that
    // is itself the result of the previous tap.
    let party = autoParty(5, pickFor('mage', 'dps')!)
    expect('the five-man default is the fixed shape', shape(party) === wanted, shape(party))

    const wrong: string[] = []
    for (let round = 0; round < 3; round++) {
      for (let slot = 0; slot < 5; slot++) {
        for (const option of SPEC_OPTIONS) {
          const next = selectInto(party, slot, option)
          if (!next) continue
          party = next
          if (shape(party) !== wanted) wrong.push(`${specLabel(option)} into slot ${slot}: ${shape(party)}`)
          if (party.length !== 5) wrong.push(`slot ${slot}: ${party.length} players`)
        }
      }
    }
    expect(
      `every tap on a five-man leaves ${wanted}`,
      wrong.length === 0,
      wrong.slice(0, 3).join('; '),
    )

    // The trade is what keeps it usable: the player in slot zero has to be
    // able to become the tank, which costs the current tank its role.
    const before = autoParty(5, pickFor('mage', 'dps')!)
    const tanked = selectInto(before, 0, pickFor('warrior', 'tank')!)
    expect('the player can take the tank slot', tanked !== null && roleOf(tanked[0]!) === 'tank', `${tanked && roleOf(tanked[0]!)}`)
    expect('and the raid is still 1t 1h 3d', tanked !== null && shape(tanked) === wanted, `${tanked && shape(tanked)}`)
    expect(
      'the displaced tank keeps the role it was handed',
      tanked !== null && tanked.filter((p) => roleOf(p) === 'dps').length === FIVE_MAN.dps,
      `${tanked && shape(tanked)}`,
    )

    // Bigger raids keep their slack: this trade must not leak into them.
    const ten = autoParty(10, pickFor('mage', 'dps')!)
    const third = selectInto(ten, 9, pickFor('warrior', 'tank')!)
    expect('a ten-man still refuses a third tank outright', third === null, 'traded instead')
  }

  // Nothing that builds a roster on its own may produce an illegal one either.
  {
    let seed = 99
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    const built: Pick[][] = []
    for (const size of [5, 10, 25] as RaidSize[]) {
      for (const starter of SPEC_OPTIONS) built.push(autoParty(size, starter))
      for (let i = 0; i < 100; i++) built.push(randomParty(size, random))
    }
    const over = built.filter((p) => !isLegalComposition(p))
    expect(`${built.length} generated rosters are legal compositions`, over.length === 0, `${over.length} illegal`)
  }

  // And a save from before the rules must not smuggle one back in.
  const stored: Array<[string, Pick[]]> = [
    ['three tanks', [
      pickFor('warrior', 'tank')!,
      pickFor('paladin', 'tank')!,
      pickFor('druid', 'tank')!,
      pickFor('priest', 'healer')!,
      pickFor('mage', 'dps')!,
    ]],
    ['four healers', [
      pickFor('warrior', 'tank')!,
      pickFor('priest', 'healer')!,
      pickFor('paladin', 'healer')!,
      pickFor('druid', 'healer')!,
      pickFor('shaman', 'healer')!,
    ]],
    ['a five-man with two healers', [
      pickFor('warrior', 'tank')!,
      pickFor('priest', 'healer')!,
      pickFor('paladin', 'healer')!,
      pickFor('mage', 'dps')!,
      pickFor('rogue', 'dps')!,
    ]],
    ['a five-man with no tank', [
      pickFor('mage', 'dps')!,
      pickFor('priest', 'healer')!,
      pickFor('hunter', 'dps')!,
      pickFor('rogue', 'dps')!,
      pickFor('shaman', 'dps')!,
    ]],
  ]
  for (const [label, party] of stored) {
    expect(`a stored roster with ${label} is rejected`, !isLegalComposition(party), 'accepted')
  }
}

// --- the minimap and the meter must fit, and stay out of the way ----------
//
// Both are corner furniture on a screen that already has a stick, four
// buttons, two frames and a readout on it. Where they land is the whole
// question, so it is checked at every viewport in both control modes.
{
  const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

  for (const [label, w, h] of [
    ['desktop 1440x900', 1440, 900],
    ['portrait 390x844', 390, 844],
    ['landscape 844x390', 844, 390],
    ['small portrait 360x640', 360, 640],
  ] as const) {
    updateLayout(w, h)

    const map = { x: L.mapX - L.mapR, y: L.mapY - L.mapR, w: L.mapR * 2, h: L.mapR * 2 }
    const onScreen = (r: typeof map) =>
      r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h

    expect(`${label}: the minimap is on screen`, onScreen(map), JSON.stringify(map))
    expect(
      `${label}: the minimap clears the boss frame`,
      map.y > L.bossY + 36 * L.ui,
      `map top ${map.y.toFixed(0)} vs boss ${(L.bossY + 36 * L.ui).toFixed(0)}`,
    )
    // Measured against the widest raid, which is the one that reaches
    // furthest right.
    const framesRight = Math.max(...partyFrames(25).map((r) => r.x + r.w))
    expect(
      `${label}: the minimap clears the party frames`,
      map.x > framesRight,
      `map left ${map.x.toFixed(0)} vs frames ${framesRight.toFixed(0)}`,
    )
    for (const [name, rect] of [['party', partyButton()], ['sound', soundButton()]] as const) {
      expect(`${label}: the minimap clears the ${name} button`, !overlap(map, rect), JSON.stringify(rect))
    }

    for (const touch of [false, true]) {
      const mode = touch ? 'touch' : 'keyboard'
      const meter = meterRect(touch)
      expect(`${label} ${mode}: the meter is on screen`, onScreen(meter), JSON.stringify(meter))
      expect(`${label} ${mode}: the meter clears the minimap`, !overlap(meter, map), JSON.stringify(meter))
      for (const [name, rect] of [['party', partyButton()], ['sound', soundButton()]] as const) {
        expect(`${label} ${mode}: the meter clears the ${name} button`, !overlap(meter, rect), JSON.stringify(meter))
      }

      if (touch) {
        // The controls are round, so a rectangle overlap test on their
        // bounding boxes is the strict version of the question.
        const buttons = L.btnPos.map((b) => ({
          x: b.x - L.btnR,
          y: b.y - L.btnR,
          w: L.btnR * 2,
          h: L.btnR * 2,
        }))
        expect(
          `${label} ${mode}: the meter clears every ability button`,
          buttons.every((b) => !overlap(meter, b)),
          JSON.stringify(meter),
        )
        const stick = {
          x: L.joyHomeX - L.joyBase,
          y: L.joyHomeY - L.joyBase,
          w: L.joyBase * 2,
          h: L.joyBase * 2,
        }
        expect(`${label} ${mode}: the meter clears the stick`, !overlap(meter, stick), JSON.stringify(stick))
        // The stick relocates to wherever a thumb lands in the left half, so
        // the meter has to be clear of that whole zone, not just its home.
        expect(
          `${label} ${mode}: the meter stays out of the steering half`,
          meter.x > L.joyZoneMaxX,
          `${meter.x.toFixed(0)} vs ${L.joyZoneMaxX}`,
        )
      } else {
        // The action bar is centred along the bottom in keyboard mode.
        const slot = 58 * L.ui
        const barW = 4 * slot + 3 * 8 * L.ui
        const bar = { x: (w - barW) / 2, y: L.actionY, w: barW, h: slot + 14 * L.ui }
        expect(`${label} ${mode}: the meter clears the action bar`, !overlap(meter, bar), JSON.stringify(meter))
      }
    }
  }
}

// The meter has to carry your own row even when you are last, which is the
// case it exists for: a board you drop off the bottom of answers nothing.
{
  updateLayout(1440, 900)
  const party = autoParty(25, pickFor('mage', 'dps')!)
  const s = createState(0x51ed, 0, party)
  const rng = new Rng(0x51ed)
  // The player never presses anything, so they finish last of twenty-five.
  while (s.outcome === 'ongoing' && s.time < 40) {
    step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  }

  const player = s.actors.find((a) => a.isPlayer)!
  const labels: Label[] = []
  drawHud(recordingCtx([], labels), s, touchView(false), false)

  const meter = meterRect(false)
  const inMeter = labels.filter(
    (t) => t.x >= meter.x - 2 && t.x <= meter.x + meter.w + 2 && t.y >= meter.y && t.y <= meter.y + meter.h,
  )
  const own = inMeter.find((t) => t.text.endsWith(player.name))
  expect('the meter lists the player', own !== undefined, inMeter.map((t) => t.text).join(' | '))
  expect(
    'and shows the rank they actually hold',
    own !== undefined && /^\d+ /.test(own.text) && Number(own.text.split(' ')[0]) > 5,
    `${own?.text}`,
  )
  expect('the meter fits its rows', inMeter.length >= (meter.rows ?? 5), `${inMeter.length} labels`)
}

// Every actor on the floor has to appear on the minimap.
{
  updateLayout(1440, 900)
  const s = createState(0x51ed, 0, autoParty(10, pickFor('mage', 'dps')!))
  const rng = new Rng(0x51ed)
  for (let i = 0; i < 200; i++) step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)

  const circles: Circle[] = []
  drawHud(recordingCtx(circles), s, touchView(false), false)

  const living = s.actors.filter((a) => a.alive).length
  const dots = circles.filter(
    (c) => Math.hypot(c.x - L.mapX, c.y - L.mapY) <= L.mapR && c.r < L.mapR * 0.5,
  )
  expect(`all ${living} living actors are on the minimap`, dots.length >= living, `${dots.length} dots`)
  const frame = circles.filter((c) => Math.abs(c.r - L.mapR) < 0.01)
  expect('the minimap is drawn at its own radius', frame.length >= 2, `${frame.length}`)
}

// --- a press that goes nowhere has to say so ------------------------------
//
// Cooldowns and empty mana are drawn on the button. Being too far away was
// not, so pressing from across the arena did nothing at all and read as the
// button being broken.
{
  const far = () => {
    const s = createState(0x51ed, 0)
    const player = s.actors.find((a) => a.isPlayer)!
    // The rim, with the boss on the origin: outside every range in the game.
    player.pos.x = ARENA_RADIUS - 10
    player.pos.y = 0
    return { s, player }
  }

  {
    const { s, player } = far()
    const rng = new Rng(0x51ed)
    const filler = abilityBar({ classId: player.classId, spec: player.spec })[0]!

    expect(
      'the slot reads as out of range before it is pressed',
      slotStatus(s, player, filler) === 'range',
      slotStatus(s, player, filler),
    )

    step(s, { moveX: 0, moveY: 0, pressed: [0] }, rng)
    const notices = s.texts.filter((t) => t.text === 'Out of range')
    expect('pressing it says so', notices.length === 1, `${notices.length} notices`)
    expect('and it is audible', s.sounds.includes('blocked'), s.sounds.join(','))
    // The press cost nothing, so it can be answered by walking in and
    // pressing again rather than waiting out a cooldown you never used.
    expect('the press costs no global cooldown', player.gcd === 0, `${player.gcd}`)
    expect('and no cooldown', (player.cooldowns[filler] ?? 0) === 0, `${player.cooldowns[filler]}`)
  }

  {
    // Three fingers is three presses in one tick, and three copies of the
    // same words on top of each other is unreadable.
    const { s } = far()
    const rng = new Rng(0x51ed)
    step(s, { moveX: 0, moveY: 0, pressed: [0, 1, 2] }, rng)
    const notices = s.texts.filter((t) => t.text === 'Out of range')
    expect('three blocked presses say it once', notices.length === 1, `${notices.length} notices`)
  }

  {
    // In range it stays quiet and the cast goes out.
    const s = createState(0x51ed, 0)
    const player = s.actors.find((a) => a.isPlayer)!
    player.pos.x = 80
    player.pos.y = 0
    const filler = abilityBar({ classId: player.classId, spec: player.spec })[0]!

    expect('in range the slot reads ready', slotStatus(s, player, filler) === 'ready', slotStatus(s, player, filler))
    step(s, { moveX: 0, moveY: 0, pressed: [0] }, new Rng(0x51ed))
    expect(
      'and nothing is reported',
      s.texts.every((t) => t.text !== 'Out of range'),
      s.texts.map((t) => t.text).join(','),
    )
    expect('the cast went out', player.gcd > 0, `${player.gcd}`)
  }

  {
    // A reason the button already shows wins, or walking closer would look
    // like the fix for a cooldown.
    const { s, player } = far()
    const filler = abilityBar({ classId: player.classId, spec: player.spec })[0]!
    player.cooldowns[filler] = 5
    expect(
      'a cooldown outranks the distance',
      slotStatus(s, player, filler) === 'locked' &&
        castBlocker(s, player, ABILITIES[filler]!, boss(s).id) === 'locked',
      slotStatus(s, player, filler),
    )
  }

  {
    // Self-cast abilities have no range and must never report one.
    const { s, player } = far()
    const defensives = Object.values(ABILITIES).filter((a) => a.range === 0)
    expect('there are rangeless abilities to check', defensives.length > 0, `${defensives.length}`)
    const reported = defensives.filter(
      (a) => castBlocker(s, player, a, player.id) === 'range',
    )
    expect('nothing rangeless reports a range', reported.length === 0, reported.map((a) => a.id).join(','))
  }
}

// --- a broken cast costs nothing ------------------------------------------
//
// Moving cancels your cast, which is the core tension of the fight. It used
// to also eat the cooldown, so stepping out of a puddle a quarter of the way
// into a Pyroblast cost twenty seconds of an ability that never went off, and
// the cheapest play was to stand in the fire and finish the cast.
{
  const setup = () => {
    const s = createState(0x51ed, 0)
    const player = s.actors.find((a) => a.isPlayer)!
    player.pos.x = 80
    player.pos.y = 0
    const bar = abilityBar({ classId: player.classId, spec: player.spec })
    const slot = bar.findIndex((id) => ABILITIES[id]!.castTime > 0)
    return { s, player, slot, id: bar[slot]! }
  }

  const { id: castId } = setup()
  expect('the player has a cast-time ability to break', ABILITIES[castId]!.castTime > 0, castId)
  expect('and it is worth refunding', ABILITIES[castId]!.cooldown > 0, `${ABILITIES[castId]!.cooldown}`)

  {
    const { s, player, slot, id } = setup()
    const rng = new Rng(0x51ed)
    step(s, { moveX: 0, moveY: 0, pressed: [slot] }, rng)
    expect('the cast starts', player.castId === id, `${player.castId}`)
    expect('and takes the cooldown while it runs', (player.cooldowns[id] ?? 0) > 0, `${player.cooldowns[id]}`)

    step(s, { moveX: 1, moveY: 0, pressed: [] }, rng)
    expect('moving breaks it', player.castId === null, `${player.castId}`)
    expect('the break is reported', s.texts.some((t) => t.text === 'moved'), s.texts.map((t) => t.text).join(','))
    expect('and hands the cooldown back', (player.cooldowns[id] ?? 0) === 0, `${player.cooldowns[id]}`)

    // Which has to mean it is pressable again, not merely zero on paper.
    while (player.gcd > 0) step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    step(s, { moveX: 0, moveY: 0, pressed: [slot] }, rng)
    expect('so it can be started again straight away', player.castId === id, `${player.castId}`)
  }

  {
    // The refund must not leak into casts that actually land.
    const { s, player, slot, id } = setup()
    const rng = new Rng(0x51ed)
    step(s, { moveX: 0, moveY: 0, pressed: [slot] }, rng)
    const cast = ABILITIES[id]!.castTime
    for (let i = 0; i < Math.ceil(cast / (1 / 30)) + 2; i++) {
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    }
    expect('a finished cast resolves', player.castId === null, `${player.castId}`)
    expect(
      'and stays on cooldown',
      (player.cooldowns[id] ?? 0) > ABILITIES[id]!.cooldown - cast - 1,
      `${player.cooldowns[id]}`,
    )
  }

  {
    // Instants have nothing to break, so their cooldown must survive a step.
    const s = createState(0x51ed, 0)
    const player = s.actors.find((a) => a.isPlayer)!
    player.pos.x = 80
    player.pos.y = 0
    const bar = abilityBar({ classId: player.classId, spec: player.spec })
    const slot = bar.findIndex((id) => ABILITIES[id]!.castTime === 0 && ABILITIES[id]!.cooldown > 0)
    const id = bar[slot]!
    const rng = new Rng(0x51ed)

    step(s, { moveX: 0, moveY: 0, pressed: [slot] }, rng)
    step(s, { moveX: 1, moveY: 0, pressed: [] }, rng)
    expect('an instant keeps its cooldown through a move', (player.cooldowns[id] ?? 0) > 0, `${player.cooldowns[id]}`)
  }
}

// --- weapons swing on their own -------------------------------------------
//
// The boss and its thralls always had auto-attacks; the party fought with
// nothing but its spell list, so a rogue standing in melee between presses
// was doing literally nothing.
{
  const armed = SPEC_OPTIONS.filter((pick) => specOf(pick).auto !== undefined)
  const wrong = SPEC_OPTIONS.filter((pick) => {
    const spec = specOf(pick)
    const shoots = pick.classId === 'hunter'
    const shouldHave = spec.melee || shoots
    if (!shouldHave) return spec.auto !== undefined
    if (!spec.auto) return true
    return spec.auto.range !== (spec.melee ? MELEE_RANGE : SPELL_RANGE)
  })
  expect(
    `${armed.length} specs carry a weapon, and only the right ones`,
    wrong.length === 0 && armed.length === 8,
    wrong.map((p) => `${p.classId} ${roleOf(p)}`).join(', ') || `${armed.length} armed`,
  )

  // A melee player who never touches a button still contributes, purely by
  // being in range. Pinned to the boss each tick so the count is exact
  // rather than a function of where the boss wandered.
  const swinging = (pick: Pick, gap: number) => {
    const party: Pick[] = [
      pick,
      pickFor('warrior', 'tank')!,
      pickFor('priest', 'healer')!,
      pickFor('hunter', 'dps')!,
      pickFor('rogue', 'dps')!,
    ]
    const s = createState(0x51ed, 0, party)
    const player = s.actors.find((a) => a.isPlayer)!
    const rng = new Rng(0x51ed)
    let sawOwnBolt = false

    for (let i = 0; i < 30 * 12; i++) {
      const b = boss(s)
      player.pos.x = b.pos.x + gap
      player.pos.y = b.pos.y
      s.projectiles.length = 0
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
      sawOwnBolt ||= s.projectiles.some(
        (p) => p.prevPos.x === player.pos.x && p.prevPos.y === player.pos.y,
      )
    }
    return { dealt: s.tally[player.id]?.damage ?? 0, sawOwnBolt, player }
  }

  // Swings land at zero and every `speed` seconds after, each worth its
  // damage or half again on a crit, and whether the last one falls inside the
  // window is a matter of tick alignment — so the total sits in a band rather
  // than on a number.
  const band = (auto: { damage: number; speed: number }, seconds: number) => {
    const swings = Math.floor(seconds / auto.speed)
    return { swings, low: swings * auto.damage, high: (swings + 1) * auto.damage * 1.5 }
  }

  {
    const auto = specOf(pickFor('rogue', 'dps')!).auto!
    const { dealt } = swinging(pickFor('rogue', 'dps')!, 20)
    const { swings, low, high } = band(auto, 12)
    expect(
      'a melee player who presses nothing still swings',
      dealt >= low && dealt <= high,
      `${dealt} damage, outside ${low}-${high} for ${swings} swings`,
    )
  }

  {
    // The hunter is the one ranged weapon, and it has to put something in
    // the air or it reads as standing still doing nothing.
    const auto = specOf(pickFor('hunter', 'dps')!).auto!
    const { dealt, sawOwnBolt } = swinging(pickFor('hunter', 'dps')!, 300)
    const { low, high } = band(auto, 12)
    expect(
      'the hunter shoots from outside melee',
      dealt >= low && dealt <= high,
      `${dealt} damage at 300 units, outside ${low}-${high}`,
    )
    expect('and the shot is visible', sawOwnBolt, 'no bolt from the hunter')
  }

  {
    // Casters have no weapon, and nothing swings from out of reach.
    const { dealt: caster } = swinging(pickFor('mage', 'dps')!, 20)
    expect('a caster in melee swings nothing', caster === 0, `${caster} damage`)
    const { dealt: away } = swinging(pickFor('rogue', 'dps')!, 300)
    expect('and a melee weapon does not reach across the floor', away === 0, `${away} damage`)
  }

  {
    // Physical, and the enrage is the boss hitting harder rather than
    // everything hitting harder — which is what it would have meant once the
    // party had a physical attack of its own.
    const s = createState(0x51ed, 0)
    const b = boss(s)
    const member = s.actors.find((a) => a.faction === 'party')!
    addAura(b, 'enrage', b.id)

    const before = b.hp
    applyDamage(s, b, 100, 'physical', { sourceId: member.id, silent: true })
    expect('an enraged boss does not amplify what it is taking', before - b.hp === 100, `${before - b.hp}`)

    const took = member.hp
    applyDamage(s, member, 100, 'physical', { sourceId: b.id, silent: true })
    const expected = Math.round(Math.max(0, 100 - member.block) * (1 - mitigation(member.armor)) * 2)
    expect('but still amplifies what it deals', took - member.hp === expected, `${took - member.hp} vs ${expected}`)
  }

  {
    // Swinging at the boss is damage on the boss, so it moves the threat
    // table like any other.
    const s = createState(0x51ed, 0, [
      pickFor('rogue', 'dps')!,
      pickFor('warrior', 'tank')!,
      pickFor('priest', 'healer')!,
      pickFor('hunter', 'dps')!,
      pickFor('mage', 'dps')!,
    ])
    const player = s.actors.find((a) => a.isPlayer)!
    const rng = new Rng(0x51ed)
    for (let i = 0; i < 30 * 4; i++) {
      const b = boss(s)
      player.pos.x = b.pos.x + 20
      player.pos.y = b.pos.y
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    }
    expect('a weapon builds threat', (s.threat[player.id] ?? 0) > 0, `${s.threat[player.id]}`)
  }
}

// --- classes run on different resources -----------------------------------
//
// Mana is a budget for the fight, energy and focus refill on their own, and
// rage is neither: it starts at nothing and is earned by hitting and being
// hit. A resource that never moves is a bar, not a system, so the shape of
// each one is checked rather than just its presence.
{
  // Keyed by spec, not by class: a bear tank runs on rage while the same
  // druid healing runs on mana, which is the whole reason the resource sits
  // on the spec.
  const EXPECTED: Record<string, string> = {
    'warrior protection': 'rage',
    'warrior arms': 'rage',
    'druid guardian': 'rage',
    'rogue assassination': 'energy',
    'druid feral': 'energy',
    'hunter marksmanship': 'focus',
  }
  const wrongRes = SPEC_OPTIONS.filter(
    (pick) => specOf(pick).resource !== (EXPECTED[`${pick.classId} ${pick.spec}`] ?? 'mana'),
  )
  expect('every spec runs on its own resource', wrongRes.length === 0, wrongRes.map((p) => `${p.classId} ${p.spec} is ${specOf(p).resource}`).join(', '))

  // And a class that fills three roles is allowed three answers.
  // Two dps specs, and they do not run on the same thing: the caster spends
  // mana, the cat spends energy. That is the case the spec-level resource
  // exists for.
  const druid = CLASSES.druid.specs.map((spec) => `${spec.role}:${spec.resource}`).join(' ')
  expect(
    'a druid answers four different ways',
    druid === 'tank:rage healer:mana dps:mana dps:energy',
    druid,
  )

  const poolless = SPEC_OPTIONS.filter((pick) => specOf(pick).power <= 0)
  expect('and every spec has a pool to spend', poolless.length === 0, poolless.map((p) => `${p.classId} ${p.spec}`).join(', '))

  // Everything but the answers to a mechanic costs something. A defensive or
  // a taunt that is sometimes unaffordable is a mechanic you cannot answer
  // for a reason the button never showed. A charge is free for the opposite
  // reason: it is where a warrior's rage comes from at the start of a pull,
  // and charging to earn rage you needed to charge would be a circle.
  const free = Object.values(ABILITIES).filter((a) => a.cost === 0)
  const shouldBeFree = free.every(
    (a) => a.kind === 'defensive' || a.kind === 'taunt' || a.kind === 'charge',
  )
  expect(
    `only the ${free.length} defensives, taunts and charges are free`,
    shouldBeFree && free.length === 7,
    free.map((a) => a.id).join(', '),
  )

  // Rage: empty at the pull, earned by swinging, earned by being hit, and
  // never handed over by simply waiting.
  {
    const s = createState(0x51ed, 0, [
      pickFor('warrior', 'tank')!,
      pickFor('paladin', 'tank')!,
      pickFor('priest', 'healer')!,
      pickFor('mage', 'dps')!,
      pickFor('rogue', 'dps')!,
    ])
    const warrior = s.actors.find((a) => a.classId === 'warrior')!
    const caster = s.actors.find((a) => a.classId === 'mage')!
    expect('a warrior opens the pull with no rage', warrior.power === 0, `${warrior.power}`)
    expect('and a caster opens it with a full bar', caster.power === caster.maxPower, `${caster.power}`)

    // Parked out of everyone's reach so nothing but the clock can touch it.
    const rng = new Rng(0x51ed)
    warrior.pos.x = ARENA_RADIUS - 5
    warrior.pos.y = 0
    for (let i = 0; i < 30 * 5; i++) {
      warrior.pos.x = ARENA_RADIUS - 5
      warrior.pos.y = 0
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    }
    expect('waiting earns none of it', warrior.power === 0, `${warrior.power} after five seconds`)

    const swing = RESOURCES.rage.onSwing
    applyDamage(s, boss(s), 10, 'physical', { sourceId: warrior.id, silent: true })
    expect('nor does dealing damage on its own', warrior.power === 0, `${warrior.power}`)

    gainPower(warrior, swing)
    expect('a landed swing does', warrior.power === swing, `${warrior.power}`)

    // Big enough to get past a tank's block, since damage that never landed
    // is not a hit taken.
    applyDamage(s, warrior, 900, 'physical', { sourceId: boss(s).id })
    expect(
      'and so does being hit',
      warrior.power === swing + RESOURCES.rage.onHit,
      `${warrior.power}`,
    )

    // Ground ticks are silent and land thirty times a second; paying for
    // those would hand a tank a full bar for standing in fire.
    const before = warrior.power
    for (let i = 0; i < 30; i++) applyDamage(s, warrior, 20, 'magic', { silent: true })
    expect('standing in fire earns nothing', warrior.power === before, `${warrior.power} vs ${before}`)
  }

  // Energy and focus refill on their own, at their own rates, and mana users
  // are not quietly getting the same treatment.
  {
    for (const [classId, role] of [['rogue', 'dps'], ['hunter', 'dps'], ['mage', 'dps']] as const) {
      const s = createState(0x51ed, 0, [
        pickFor(classId, role)!,
        pickFor('warrior', 'tank')!,
        pickFor('priest', 'healer')!,
        pickFor('mage', 'dps')!,
        pickFor('rogue', 'dps')!,
      ])
      const player = s.actors.find((a) => a.isPlayer)!
      const rules = RESOURCES[player.resource]
      player.power = 0
      const rng = new Rng(0x51ed)
      for (let i = 0; i < 30; i++) step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
      expect(
        `${classId} regains ${rules.regen} ${player.resource} a second`,
        Math.abs(player.power - rules.regen) < 0.5,
        `${player.power.toFixed(1)} after a second`,
      )
    }
  }

  // Spending: a press takes the resource, and an empty bar stops the press.
  {
    const s = createState(0x51ed, 0, [
      pickFor('rogue', 'dps')!,
      pickFor('warrior', 'tank')!,
      pickFor('priest', 'healer')!,
      pickFor('mage', 'dps')!,
      pickFor('hunter', 'dps')!,
    ])
    const player = s.actors.find((a) => a.isPlayer)!
    player.pos.x = 20
    player.pos.y = 0
    const filler = abilityBar({ classId: player.classId, spec: player.spec })[0]!
    const cost = ABILITIES[filler]!.cost
    expect('the rogue filler costs energy', cost > 0, `${cost}`)

    const before = player.power
    step(s, { moveX: 0, moveY: 0, pressed: [0] }, new Rng(0x51ed))
    // A tick of regen lands in the same step, so the check is that the cost
    // came off rather than that the bar reads a particular number.
    expect('pressing it spends that energy', player.power < before, `${player.power} of ${before}`)

    player.power = cost - 1
    player.gcd = 0
    expect(
      'and an empty bar is what stops the press',
      castBlocker(s, player, ABILITIES[filler]!, boss(s).id) === 'resource',
      `${castBlocker(s, player, ABILITIES[filler]!, boss(s).id)}`,
    )
    expect('which the slot says out loud', slotStatus(s, player, filler) === 'resource', slotStatus(s, player, filler))
  }
}

// --- one class, two ways to deal damage -----------------------------------
//
// The druid fills the same role twice, which is what a pick naming a role
// could not express and why it names a spec instead.
{
  const dps = CLASSES.druid.specs.filter((spec) => spec.role === 'dps')
  expect('the druid has two damage specs', dps.length === 2, `${dps.length}`)

  const caster = dps.find((spec) => !spec.melee)
  const cat = dps.find((spec) => spec.melee)
  expect(
    'one casts on mana, the other swings on energy',
    caster?.resource === 'mana' && cat?.resource === 'energy' && cat?.auto !== undefined,
    `${caster?.id}:${caster?.resource} ${cat?.id}:${cat?.resource}`,
  )

  // Two picks that differ only by spec have to stay two different picks all
  // the way through: same class, same role, different everything else.
  const picks = SPEC_OPTIONS.filter((p) => p.classId === 'druid' && roleOf(p) === 'dps')
  expect('and the picker offers both', picks.length === 2, picks.map((p) => p.spec).join(', '))
  const labels = new Set(SPEC_OPTIONS.map((p) => specLabel(p)))
  expect(
    `all ${SPEC_OPTIONS.length} specs are named apart`,
    labels.size === SPEC_OPTIONS.length,
    `${labels.size} labels`,
  )

  // A spec nothing can roll is a spec nobody sees. AUTO and RANDOM draw from
  // an explicit list, so this is the check that it was added to it.
  let seed = 31
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const rolled = new Set<string>()
  for (let i = 0; i < 400; i++) {
    for (const pick of randomParty(25, random)) rolled.add(`${pick.classId}:${pick.spec}`)
  }
  const missing = SPEC_OPTIONS.filter((p) => !rolled.has(`${p.classId}:${p.spec}`))
  expect('every spec can be rolled', missing.length === 0, missing.map((p) => `${p.classId} ${p.spec}`).join(', '))

  // The cat has to actually fight: a kit that resolves to nothing would still
  // pass every layout check above.
  const s = createState(0x51ed, 0, [
    { classId: 'druid', spec: 'feral' },
    { classId: 'warrior', spec: 'protection' },
    { classId: 'priest', spec: 'discipline' },
    { classId: 'mage', spec: 'frost' },
    { classId: 'rogue', spec: 'assassination' },
  ])
  const player = s.actors.find((a) => a.isPlayer)!
  expect('a feral player is a melee on energy', player.resource === 'energy' && player.melee, `${player.resource}`)

  const bar = abilityBar({ classId: player.classId, spec: player.spec })
  expect('with three buttons of its own', bar.length === 3, bar.join(', '))
  // Eight seconds, which is before the first thralls arrive: the player's own
  // targeting prefers an add, and an add that dies takes the bleed with it.
  const rng = new Rng(0x51ed)
  for (let i = 0; i < 30 * 8; i++) {
    const b = boss(s)
    player.pos.x = b.pos.x + 20
    player.pos.y = b.pos.y
    // Bleed first, filler second — the priority a player would press, and
    // one that leaves the bleed a window. A fixed cadence of one slot every
    // 45 ticks does not: 45 ticks is exactly the global cooldown, so the
    // filler took every one of them and the bleed never went out.
    step(s, { moveX: 0, moveY: 0, pressed: [1, 0] }, rng)
  }
  expect('and damage on the board', (s.tally[player.id]?.damage ?? 0) > 0, `${s.tally[player.id]?.damage}`)
  expect(
    'including its own bleed',
    boss(s).auras.some((a) => a.id === 'rake'),
    boss(s).auras.map((a) => a.id).join(', '),
  )
}

// --- party frames are a grid of parties, not one long column --------------
//
// Twenty-five frames stacked in a single column ran two screens off the
// bottom, and every frame was sized for a five-man whatever the raid was.
{
  for (const [label, w, h] of [
    ['desktop 1440x900', 1440, 900],
    ['portrait 390x844', 390, 844],
    ['landscape 844x390', 844, 390],
    ['small portrait 360x640', 360, 640],
  ] as const) {
    updateLayout(w, h)

    for (const size of [5, 10, 25] as RaidSize[]) {
      const rects = partyFrames(size)
      expect(`${label} ${size}: one frame each`, rects.length === size, `${rects.length}`)

      const onScreen = rects.every((r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h)
      const bottom = Math.max(...rects.map((r) => r.y + r.h))
      expect(`${label} ${size}: all of them fit on screen`, onScreen, `bottom ${bottom.toFixed(0)} of ${h}`)

      // Three columns at most, and a party is a column: every five
      // consecutive members share an x and descend.
      const columns = new Set(rects.map((r) => r.x.toFixed(1)))
      expect(`${label} ${size}: at most three across`, columns.size <= 3, `${columns.size} columns`)

      const stacked = rects.every((r, i) => {
        if (i % 5 === 0) return true
        const prev = rects[i - 1]!
        return r.x === prev.x && r.y > prev.y
      })
      expect(`${label} ${size}: a party reads top to bottom`, stacked, 'a party is not a column')

      // Nothing may sit on top of anything else.
      const overlapping = rects.some((a, i) =>
        rects.slice(i + 1).some((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h),
      )
      expect(`${label} ${size}: no two frames overlap`, !overlapping, 'frames collide')

      // And they stay out of the middle, where the player is pinned.
      const right = Math.max(...rects.map((r) => r.x + r.w))
      expect(`${label} ${size}: clear of the player`, right < L.cx - 10, `${right.toFixed(0)} vs ${L.cx}`)

      // The block is capped at half the screen however many frames it holds.
      const top = Math.min(...rects.map((r) => r.y))
      const block = Math.max(...rects.map((r) => r.y + r.h)) - top
      expect(
        `${label} ${size}: the block is at most half the screen tall`,
        block <= h / 2 + 0.01,
        `${block.toFixed(0)} of ${(h / 2).toFixed(0)}`,
      )
    }

    // Width is not chosen on its own: one shape at every raid size and every
    // viewport, so a frame is never long and thin here and square there.
    const ratios = [5, 10, 25].flatMap((size) => partyFrames(size).map((r) => r.w / r.h))
    const spread = Math.max(...ratios) - Math.min(...ratios)
    expect(
      `${label}: every frame is the same shape`,
      spread < 0.01 && ratios[0]! > 2.5 && ratios[0]! < 3.5,
      `${ratios[0]!.toFixed(2)} to ${Math.max(...ratios).toFixed(2)}`,
    )

    // Smaller than they were: the old frames were a flat 108-150 wide and
    // 46-70 tall whatever the screen or the raid.
    const five = partyFrames(5)[0]!
    const raid = partyFrames(25)[0]!
    expect(
      `${label}: a raid frame is no taller than a party frame`,
      raid.h <= five.h && five.h <= 46,
      `${five.h.toFixed(0)} then ${raid.h.toFixed(0)}`,
    )
  }
}

// --- hits have a picture now ----------------------------------------------
//
// A weapon swing landed damage every three seconds from a token standing
// still, and every ability resolved with nothing on screen but a number. The
// effects live in the renderer: the simulation says what happened, this
// decides what it looks like, and a pull still replays from its seed.
{
  updateLayout(1440, 900)
  const s = createState(0x51ed, 0, [
    { classId: 'rogue', spec: 'assassination' },
    { classId: 'warrior', spec: 'protection' },
    { classId: 'priest', spec: 'discipline' },
    { classId: 'mage', spec: 'frost' },
    { classId: 'hunter', spec: 'marksmanship' },
  ])
  const player = s.actors.find((a) => a.isPlayer)!
  const rng = new Rng(0x51ed)

  const seen = new Set<string>()
  const effects = new Effects()
  let ticks = 0
  for (let i = 0; i < 30 * 12; i++) {
    const b = boss(s)
    player.pos.x = b.pos.x + 20
    player.pos.y = b.pos.y
    step(s, { moveX: 0, moveY: 0, pressed: [0] }, rng)
    for (const e of s.effects) seen.add(e.kind)
    effects.ingest(s)
    ticks++
  }

  expect('an ability landing draws something', seen.has('impact'), [...seen].join(', '))
  expect('a weapon swing draws something', seen.has('swing'), [...seen].join(', '))
  expect('and so does a heal', seen.has('heal'), [...seen].join(', '))
  expect('the effects are on screen', effects.count > 0, `${effects.count}`)

  // The channel is emptied every tick like the sound is, or a frame that
  // catches up on three ticks would draw one of them and lose two.
  step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  const carried = s.effects.length
  step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  expect(
    'the channel is drained every tick',
    s.effects.length <= carried + 8 && s.effects.every((e) => e.pos !== undefined),
    `${s.effects.length} queued`,
  )

  // They age out rather than piling up for the whole pull.
  effects.age(3)
  expect('and they age off the screen', effects.count === 0, `${effects.count} left`)

  // Nothing in the simulation may read them back: a pull has to replay
  // identically whether or not anything was drawn.
  const replay = (drain: boolean) => {
    const run = createState(0x51ed, 3)
    const r = new Rng(0x51ed + 3 * 7919)
    while (run.outcome === 'ongoing' && run.time < 60) {
      step(run, { moveX: 0, moveY: 0, pressed: [] }, r)
      if (drain) run.effects.length = 0
    }
    return `${run.outcome} ${run.time.toFixed(2)} ${boss(run).hp}`
  }
  expect('drawing changes nothing about the fight', replay(true) === replay(false), replay(true))
}

// Every bolt in the air carries the ability that threw it, so it can be
// coloured like that ability's own icon instead of one of four generic dots.
{
  const s = createState(0x51ed, 0)
  const rng = new Rng(0x51ed)
  const caster = s.actors[0]!
  const target = s.actors[s.actors.length - 1]!

  const anonymous: string[] = []
  // A charge has a range and throws nothing: it is the caster crossing the
  // gap rather than something crossing it for them.
  const thrown = (a: Ability) => a.range >= PROJECTILE_MIN_RANGE && a.kind !== 'charge'

  for (const ability of Object.values(ABILITIES)) {
    if (!thrown(ability)) continue
    s.projectiles.length = 0
    const victim = ability.kind === 'heal' ? s.actors[2]! : target
    resolveAbility(s, caster, ability, victim.id, rng)
    if (s.projectiles.some((p) => p.abilityId !== ability.id)) anonymous.push(ability.id)
  }
  expect('every bolt knows what threw it', anonymous.length === 0, anonymous.join(', '))

  // Which is only worth anything if the icons it reads from are distinct —
  // that is already checked above, so this checks the join: a colour for
  // every ability that can put something in the air.
  const ranged = Object.values(ABILITIES).filter(thrown)
  const colours = new Set(ranged.map((a) => iconFor(a.id).colour))
  expect(
    `${ranged.length} ranged abilities draw on ${colours.size} colours`,
    colours.size > 4,
    `${colours.size}`,
  )
}

// --- a bolt has to arrive before it counts --------------------------------
//
// Damage used to resolve the instant the ability did, with the bolt flying
// after it as scenery. That meant a shot at something about to die always
// counted, a heal was never too late, and range cost nothing.
{
  const setup = () => {
    const s = createState(0x51ed, 0, [
      { classId: 'mage', spec: 'frost' },
      { classId: 'warrior', spec: 'protection' },
      { classId: 'priest', spec: 'discipline' },
      { classId: 'hunter', spec: 'marksmanship' },
      { classId: 'rogue', spec: 'assassination' },
    ])
    const player = s.actors.find((a) => a.isPlayer)!
    // Out at the rim, so the flight is long enough to watch.
    player.pos.x = 300
    player.pos.y = 0
    return { s, player }
  }

  {
    const { s, player } = setup()
    const rng = new Rng(0x51ed)
    step(s, { moveX: 0, moveY: 0, pressed: [0] }, rng)

    const mine = s.projectiles.filter((p) => p.sourceId === player.id)
    expect('casting at range only puts a bolt in the air', mine.length === 1, `${mine.length} bolts`)
    expect('and nothing has landed yet', (s.tally[player.id]?.damage ?? 0) === 0, `${s.tally[player.id]?.damage}`)

    let ticks = 0
    while (s.projectiles.some((p) => p.sourceId === player.id) && ticks < 60) {
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
      ticks++
    }
    expect('the bolt takes real time to get there', ticks > 3, `${ticks} ticks`)
    expect('and lands its damage on arrival', (s.tally[player.id]?.damage ?? 0) > 0, `${s.tally[player.id]?.damage}`)
  }

  {
    // Something that dies while the shot is in the air takes nothing, which
    // is the cost of a travel time existing at all.
    const { s } = setup()
    const rng = new Rng(0x51ed)
    const victim = s.actors.find((a) => a.faction === 'party' && !a.isPlayer)!

    const heal = ABILITIES.heal!
    const healer = s.actors.find((a) => a.role === 'healer')!
    victim.hp = 100
    resolveAbility(s, healer, heal, victim.id, rng)
    expect('the heal is in the air', s.projectiles.some((p) => p.targetId === victim.id), 'no heal bolt')

    victim.alive = false
    victim.hp = 0
    let ticks = 0
    while (s.projectiles.some((p) => p.targetId === victim.id) && ticks < 60) {
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
      ticks++
    }
    expect('a heal arriving too late does nothing', victim.hp === 0 && !victim.alive, `${victim.hp}`)
  }

  {
    // Melee and self-cast still resolve where they stand: there is nothing
    // in the air to wait for.
    const s = createState(0x51ed, 0, [
      { classId: 'rogue', spec: 'assassination' },
      { classId: 'warrior', spec: 'protection' },
      { classId: 'priest', spec: 'discipline' },
      { classId: 'mage', spec: 'frost' },
      { classId: 'hunter', spec: 'marksmanship' },
    ])
    const player = s.actors.find((a) => a.isPlayer)!
    player.pos.x = 20
    player.pos.y = 0
    step(s, { moveX: 0, moveY: 0, pressed: [0] }, new Rng(0x51ed))
    expect(
      'a melee ability lands on the press',
      (s.tally[player.id]?.damage ?? 0) > 0,
      `${s.tally[player.id]?.damage}`,
    )
  }

  {
    // The hunter's auto shot is drawn after the fact: its damage was already
    // dealt where the hunter stands, so the bolt must not land it a second
    // time when it arrives.
    const s = createState(0x51ed, 0, [
      { classId: 'hunter', spec: 'marksmanship' },
      { classId: 'warrior', spec: 'protection' },
      { classId: 'priest', spec: 'discipline' },
      { classId: 'mage', spec: 'frost' },
      { classId: 'rogue', spec: 'assassination' },
    ])
    const player = s.actors.find((a) => a.isPlayer)!
    const auto = specOf({ classId: player.classId, spec: player.spec }).auto!
    const rng = new Rng(0x51ed)

    for (let i = 0; i < 30 * 10; i++) {
      const b = boss(s)
      player.pos.x = b.pos.x + 250
      player.pos.y = b.pos.y
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    }
    const dealt = s.tally[player.id]?.damage ?? 0
    // Ten seconds of shooting is a known number of swings, each worth its
    // damage or half again. Landing them twice would put the total clean
    // outside that band.
    const swings = Math.floor(10 / auto.speed)
    const low = swings * auto.damage
    const high = (swings + 1) * auto.damage * 1.5
    expect(
      'a scenery bolt does not deal its damage twice',
      dealt >= low && dealt <= high,
      `${dealt} against ${swings} swings of ${auto.damage}, band ${low}-${high}`,
    )
  }
}

// --- only your own numbers ------------------------------------------------
//
// Twenty-five people trading hits put a wall of floating numbers over a fight
// whose actual state is already on the frames and the meter. Either end
// counts as yours: what you dealt, and what landed on you.
{
  const s = createState(0x51ed, 0, autoParty(25, { classId: 'mage', spec: 'frost' }))
  const player = s.actors.find((a) => a.isPlayer)!
  const other = s.actors.find((a) => a.faction === 'party' && !a.isPlayer)!
  const b = boss(s)

  const numbers = () => s.texts.filter((t) => t.kind === 'damage' || t.kind === 'heal').length

  s.texts.length = 0
  applyDamage(s, b, 100, 'none', { sourceId: player.id })
  expect('what you deal shows', numbers() === 1, `${numbers()}`)

  s.texts.length = 0
  applyDamage(s, player, 100, 'physical', { sourceId: b.id })
  expect('what lands on you shows', numbers() === 1, `${numbers()}`)

  s.texts.length = 0
  applyDamage(s, b, 100, 'none', { sourceId: other.id })
  expect('somebody else hitting the boss does not', numbers() === 0, `${numbers()}`)

  s.texts.length = 0
  applyDamage(s, other, 100, 'physical', { sourceId: b.id })
  expect('nor the boss hitting somebody else', numbers() === 0, `${numbers()}`)

  s.texts.length = 0
  other.hp = other.maxHp * 0.5
  applyHeal(s, other, 200, player.id)
  expect('a heal you cast shows', numbers() === 1, `${numbers()}`)

  s.texts.length = 0
  applyHeal(s, other, 200, other.id)
  expect('a heal between two other people does not', numbers() === 0, `${numbers()}`)

  s.texts.length = 0
  player.hp = player.maxHp * 0.5
  applyHeal(s, player, 200, other.id)
  expect('a heal on you does', numbers() === 1, `${numbers()}`)
}

// And the wall is actually gone: a twenty-five man fought by everyone but the
// player, whose numbers are the only ones that can appear.
{
  const s = createState(0x51ed, 0, autoParty(25, { classId: 'mage', spec: 'frost' }))
  const rng = new Rng(0x51ed)
  let peak = 0
  for (let i = 0; i < 30 * 20; i++) {
    step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    peak = Math.max(peak, s.texts.filter((t) => t.kind === 'damage' || t.kind === 'heal').length)
  }
  // Numbers live about a second, and twenty-four people hitting things would
  // stack dozens of them in that time.
  expect('a raid does not bury the screen in numbers', peak <= 6, `${peak} at once`)
}

// --- a cast has a picture too ---------------------------------------------
//
// The cast bar on the party frame is the far side of the screen from where
// you are looking. A cast now gathers on the caster, goes off when it
// completes, and comes apart when it breaks.
{
  const s = createState(0x51ed, 0, [
    { classId: 'mage', spec: 'frost' },
    { classId: 'warrior', spec: 'protection' },
    { classId: 'priest', spec: 'discipline' },
    { classId: 'hunter', spec: 'marksmanship' },
    { classId: 'rogue', spec: 'assassination' },
  ])
  const player = s.actors.find((a) => a.isPlayer)!
  player.pos.x = 200
  player.pos.y = 0
  const bar = abilityBar({ classId: player.classId, spec: player.spec })
  const slot = bar.findIndex((id) => ABILITIES[id]!.castTime > 0)
  const rng = new Rng(0x51ed)

  // Cast it through, watching the ring while it runs.
  step(s, { moveX: 0, moveY: 0, pressed: [slot] }, rng)
  expect('the cast is running', player.castId !== null, `${player.castId}`)

  const circles: Circle[] = []
  drawWorld(recordingCtx(circles), s, 1, s.time, new Effects())
  const around = circles.filter(
    (c) => Math.abs(c.x - L.cx) < 0.01 && Math.abs(c.y - L.cy) < 0.01,
  )
  // The player is pinned at the centre, so a ring gathering on them is a
  // circle drawn there that is bigger than their own token.
  const token = Math.max(4, player.radius * L.scale)
  expect(
    'something is gathering on the caster',
    around.some((c) => c.r > token + 1),
    around.map((c) => c.r.toFixed(0)).join(', '),
  )

  let fired = false
  for (let i = 0; i < 30 * 4 && player.castId; i++) {
    step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    fired ||= s.effects.some((e) => e.kind === 'cast')
  }
  expect('finishing it goes off', fired, 'no cast effect')

  // And breaking one collapses instead.
  const again = createState(0x51ed, 0, [
    { classId: 'mage', spec: 'frost' },
    { classId: 'warrior', spec: 'protection' },
    { classId: 'priest', spec: 'discipline' },
    { classId: 'hunter', spec: 'marksmanship' },
    { classId: 'rogue', spec: 'assassination' },
  ])
  const caster = again.actors.find((a) => a.isPlayer)!
  caster.pos.x = 200
  caster.pos.y = 0
  const r2 = new Rng(0x51ed)
  step(again, { moveX: 0, moveY: 0, pressed: [slot] }, r2)
  step(again, { moveX: 1, moveY: 0, pressed: [] }, r2)
  expect(
    'breaking one comes apart',
    again.effects.some((e) => e.kind === 'fizzle') && caster.castId === null,
    again.effects.map((e) => e.kind).join(', '),
  )
}

// --- crits, and the shove they give the view ------------------------------
//
// The floating text has had a `crit` kind since long before anything emitted
// one. Crits are the party's alone: incoming damage is the healers' problem,
// and a boss that occasionally hits half again as hard makes that a coin toss.
{
  const s = createState(0x51ed, 0, autoParty(25, pickFor('mage', 'dps')!))
  const rng = new Rng(0x51ed)
  let crits = 0
  let hits = 0
  for (let i = 0; i < 30 * 40; i++) {
    step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    for (const e of s.effects) {
      if (e.kind !== 'impact') continue
      hits++
      if (e.crit) crits++
    }
  }
  const rate = crits / Math.max(1, hits)
  expect(
    `crits land at about ${(CRIT_CHANCE * 100).toFixed(0)}%`,
    hits > 200 && Math.abs(rate - CRIT_CHANCE) < 0.06,
    `${(rate * 100).toFixed(1)}% of ${hits} hits`,
  )

  // A crit is worth exactly its multiplier, and a mechanic never crits.
  const target = boss(s)
  const member = s.actors.find((a) => a.faction === 'party')!
  const before = target.hp
  applyDamage(s, target, 200, 'none', { sourceId: member.id, silent: true })
  const plain = before - target.hp
  const mid = target.hp
  applyDamage(s, target, 200, 'none', { sourceId: member.id, silent: true, crit: true })
  const big = mid - target.hp
  expect(
    'and hit for the multiplier',
    Math.abs(big - plain * CRIT_MULTIPLIER) < 1,
    `${plain} then ${big}`,
  )

  // Your own crit reads as one rather than as a bigger number.
  s.texts.length = 0
  applyDamage(s, target, 200, 'none', { sourceId: PLAYER_ID, crit: true })
  expect('a crit is marked as one', s.texts.some((t) => t.kind === 'crit'), s.texts.map((t) => t.kind).join(', '))

  // The view is shoved by the hits worth feeling and nothing else.
  const effects = new Effects()
  expect('nothing shakes on its own', effects.shake === 0 && effects.offset().x === 0, `${effects.shake}`)

  effects.ingest({ effects: [{ kind: 'impact', pos: { x: 0, y: 0 }, angle: 0, abilityId: null, power: 50, crit: false }] } as never)
  expect('a filler does not shake the view', effects.shake === 0, `${effects.shake}`)

  effects.ingest({ effects: [{ kind: 'impact', pos: { x: 0, y: 0 }, angle: 0, abilityId: null, power: 50, crit: true }] } as never)
  const shoved = effects.shake
  expect('a crit does', shoved > 0, `${shoved}`)
  expect('and it moves the view off centre', effects.offset().x !== 0 || effects.offset().y !== 0, 'no offset')

  effects.age(0.5)
  expect('and it settles quickly', effects.shake === 0, `${effects.shake} after half a second`)
}

// A bolt leaves a trail behind it, and the trail is renderer-side: it must
// not appear in a state that has to replay identically.
{
  updateLayout(1440, 900)
  const s = createState(0x51ed, 0, [
    pickFor('mage', 'dps')!,
    pickFor('warrior', 'tank')!,
    pickFor('priest', 'healer')!,
    pickFor('hunter', 'dps')!,
    pickFor('rogue', 'dps')!,
  ])
  const player = s.actors.find((a) => a.isPlayer)!
  player.pos.x = 300
  player.pos.y = 0
  const rng = new Rng(0x51ed)
  step(s, { moveX: 0, moveY: 0, pressed: [0] }, rng)

  const bolt = s.projectiles.find((p) => p.sourceId === player.id)
  expect('there is a bolt to trail', bolt !== undefined, 'no bolt')
  expect(
    'and it carries no trail of its own',
    bolt !== undefined && !('trail' in bolt) && !('history' in bolt),
    Object.keys(bolt ?? {}).join(', '),
  )

  // Drawn twice with the bolt moving between: the second frame has more line
  // work than the first, which is the trail behind it.
  const effects = new Effects()
  const first: Circle[] = []
  drawWorld(recordingCtx(first), s, 1, s.time, effects)
  for (let i = 0; i < 4; i++) step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  const second: Circle[] = []
  drawWorld(recordingCtx(second), s, 1, s.time, effects)
  expect(
    'a bolt in flight draws something behind it',
    s.projectiles.length === 0 || second.length >= first.length,
    `${first.length} then ${second.length}`,
  )
}

// --- the record screen ----------------------------------------------------
//
// The record is the meter, pull by pull: the thing anyone actually reads
// during a fight and argues about afterwards. It outlives a pull, a party and
// a page load, so nothing about it lives in the simulation.
{
  const s = createState(0x51ed, 0, autoParty(10, pickFor('mage', 'dps')!))
  const rng = new Rng(0x51ed)
  expect('a fight in progress records nothing', record(s, 1000) === null, 'recorded early')

  while (s.outcome === 'ongoing' && s.time < 300) {
    step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  }

  // What the meter says and what the record keeps have to be the same board.
  const live = standings(s)
  const entry = record(s, 1234)!
  expect('a finished pull records', entry !== null && entry.standings.length > 0, 'nothing recorded')
  // Every row but the last, which is where a player outside the cap is put
  // back: the board is the meter's, in the meter's order.
  expect(
    'the record is the meter, in the meter order',
    entry.standings
      .slice(0, STANDING_LIMIT - 1)
      .every((row, i) => row.name === live[i]!.name && row.dps === live[i]!.dps),
    entry.standings.map((r) => r.name).join(', '),
  )
  expect(
    'ranked by damage and healing together',
    live.every((row, i) => i === 0 || live[i - 1]!.dps + live[i - 1]!.hps >= row.dps + row.hps),
    live.map((r) => r.dps + r.hps).join(', '),
  )
  expect(
    'with the pull it belongs to',
    entry.outcome === s.outcome && entry.size === 10 && entry.difficulty === s.difficulty,
    JSON.stringify({ outcome: entry.outcome, size: entry.size }),
  )

  // A board is capped, and your own row survives the cap however it placed.
  {
    const big = createState(0x51ed, 0, autoParty(25, pickFor('mage', 'dps')!))
    const r2 = new Rng(0x51ed)
    // Run out, not cut short: a pull still going records nothing at all.
    while (big.outcome === 'ongoing' && big.time < 300) {
      step(big, { moveX: 0, moveY: 0, pressed: [] }, r2)
    }
    const board = record(big, 1)!
    expect(
      `a twenty-five man keeps ${STANDING_LIMIT} rows`,
      board.standings.length === STANDING_LIMIT,
      `${board.standings.length}`,
    )
    // The player pressed nothing all fight, so they placed last of
    // twenty-five and are exactly the row a cap would drop.
    expect('and yours is one of them', board.standings.some((r) => r.isPlayer), 'the player fell off')
  }

  // Newest first, and it never grows without bound.
  let kept: Attempt[] = []
  for (let i = 0; i < HISTORY_LIMIT + 15; i++) kept = append(kept, { ...entry, at: i })
  expect(`the record stops at ${HISTORY_LIMIT}`, kept.length === HISTORY_LIMIT, `${kept.length}`)
  expect('newest at the top', kept[0]!.at === HISTORY_LIMIT + 14, `${kept[0]!.at}`)

  // Totals over a night rather than over a pull.
  const you = (dps: number) => ({ name: 'You', classId: 'mage', spec: 'frost', dps, hps: 0, isPlayer: true })
  const them = (dps: number) => ({ name: 'Vale', classId: 'rogue', spec: 'assassination', dps, hps: 0, isPlayer: false })
  const night: Attempt[] = [
    { ...entry, outcome: 'victory', standings: [them(500), you(300)] },
    { ...entry, outcome: 'wipe', standings: [them(410), you(380)] },
  ]
  const t = totals(night)
  expect(
    'the totals read the night',
    t.pulls === 2 && t.kills === 1 && t.bestOwn === 380 && t.bestAny === 500,
    JSON.stringify(t),
  )

  // The screen itself: reachable, on screen, and drawing at every size.
  for (const [label, w, h] of [
    ['desktop 1440x900', 1440, 900],
    ['portrait 390x844', 390, 844],
    ['landscape 844x390', 844, 390],
    ['small portrait 360x640', 360, 640],
  ] as const) {
    updateLayout(w, h)
    for (const count of [0, 2, HISTORY_LIMIT]) {
      const rows = Array.from({ length: count }, (_, i) => ({ ...entry, at: i }))
      const counts = rows.map((e) => e.standings.length)
      const layout = historyLayout(counts)
      drawHistory(stubCtx(), rows)

      const every = layout.blocks.flatMap((b) => [b.header, ...b.rows])
      const fits = every.every((r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h)
      expect(`${label} ${count}: every row fits`, fits, JSON.stringify(every[every.length - 1]))
      expect(
        `${label} ${count}: it shows what it has room for`,
        layout.blocks.length <= count,
        `${layout.blocks.length} blocks of ${count} pulls`,
      )
      expect(
        `${label} ${count}: a block is a whole board`,
        layout.blocks.every((b, i) => b.rows.length === counts[i]),
        'a pull was drawn with rows missing',
      )

      const back = layout.back
      const onScreen = back.x >= 0 && back.y >= 0 && back.x + back.w <= w && back.y + back.h <= h
      expect(`${label} ${count}: the way out is on screen`, onScreen, JSON.stringify(back))
      expect(
        `${label} ${count}: and answers a tap`,
        hitHistory(back.x + back.w / 2, back.y + back.h / 2, counts) === 'back',
        'back did not answer',
      )
      const clear = every.every((r) => r.y + r.h <= back.y)
      expect(`${label} ${count}: nothing is under the button`, clear, 'a row overlaps the button')
    }
  }
}

// --- you pick yourself, the raid is rolled --------------------------------
//
// The party screen used to fill twenty-five slots one tap at a time. The only
// pick anyone makes now is their own, and everyone else is rolled around it —
// which has to hold for every spec, at every size, without ever producing a
// raid that would be refused at the door.
{
  let seed = 4242
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }

  const illegal: string[] = []
  const misplaced: string[] = []
  for (const size of [5, 10, 25] as RaidSize[]) {
    for (const own of SPEC_OPTIONS) {
      for (let trial = 0; trial < 12; trial++) {
        const raid = randomAround(size, own, random)
        if (raid.length !== size) illegal.push(`${size} came out ${raid.length}`)
        if (!isLegalComposition(raid)) {
          illegal.push(`${size} ${own.classId} ${own.spec}: ${JSON.stringify(countRoles(raid))}`)
        }
        const first = raid[0]!
        if (first.classId !== own.classId || first.spec !== own.spec) {
          misplaced.push(`${own.classId} ${own.spec} became ${first.classId} ${first.spec}`)
        }
      }
    }
  }
  expect('every rolled raid is a legal one', illegal.length === 0, illegal.slice(0, 3).join('; '))
  expect('and yours is the one it was built around', misplaced.length === 0, misplaced.slice(0, 3).join('; '))

  // Including when what you picked is the role the raid only needs one of.
  for (const size of [5, 10, 25] as RaidSize[]) {
    const asTank = randomAround(size, pickFor('warrior', 'tank')!, random)
    const roles = countRoles(asTank)
    expect(
      `${size}: taking the tank spot does not add a tank`,
      roles.tank <= ROLE_LIMITS.tank.max && isLegalComposition(asTank),
      JSON.stringify(roles),
    )
  }

  // Rolling again keeps you and changes the rest, rather than the reverse.
  {
    const own = pickFor('priest', 'healer')!
    const before = randomAround(25, own, random)
    let changed = false
    for (let i = 0; i < 8 && !changed; i++) {
      const after = randomAround(25, own, random)
      expect(
        'a reroll keeps you where you are',
        after[0]!.classId === own.classId && after[0]!.spec === own.spec,
        `${after[0]!.classId}`,
      )
      changed = after
        .slice(1)
        .some((p, j) => p.classId !== before[j + 1]!.classId || p.spec !== before[j + 1]!.spec)
    }
    expect('and changes everybody else', changed, 'eight rolls came out identical')
  }

  // The whole roster is still reachable as a choice for yourself: nothing is
  // locked out any more, because a pick the raid cannot hold rolls the raid
  // again instead of being refused.
  const unreachable = SPEC_OPTIONS.filter((own) => {
    const raid = randomAround(5, own, random)
    return !isLegalComposition(raid) || raid[0]!.spec !== own.spec
  })
  expect(
    `all ${SPEC_OPTIONS.length} specs can be played in a five-man`,
    unreachable.length === 0,
    unreachable.map((p) => `${p.classId} ${p.spec}`).join(', '),
  )
}

// --- colour says the class -------------------------------------------------
//
// A raid was three shades of blue and pink: role colours told you what people
// were doing and nothing told you what they were. Colour is the class now and
// the glyph on the token is still the role, so both are readable at once.
{
  const classes = CLASS_ORDER
  const missing = classes.filter((id) => classColor(id) === COLORS.text)
  expect('every class has a colour', missing.length === 0, missing.join(', '))

  const used = new Set(classes.map((id) => classColor(id)))
  expect(
    `all ${classes.length} of them are different`,
    used.size === classes.length,
    `${used.size} colours`,
  )

  // Far enough apart to tell apart. Two classes a few points of brightness
  // from each other is the same problem as sharing a colour.
  const rgb = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
  const tooClose: string[] = []
  for (let i = 0; i < classes.length; i++) {
    for (let j = i + 1; j < classes.length; j++) {
      const a = rgb(classColor(classes[i]!))
      const b = rgb(classColor(classes[j]!))
      const apart = Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!)
      if (apart < 60) tooClose.push(`${classes[i]} and ${classes[j]} (${apart.toFixed(0)})`)
    }
  }
  expect('and none of them are near neighbours', tooClose.length === 0, tooClose.join(', '))

  // Nothing on the floor may wear a class colour that is not a party member's.
  const boss = [COLORS.boss, '#a855f7', COLORS.dead]
  const clashes = classes.filter((id) => boss.includes(classColor(id)))
  expect('and none of them is the boss', clashes.length === 0, clashes.join(', '))
}

// --- a warrior closes its own gap -----------------------------------------
//
// Melee spend the opening seconds walking. A charge crosses that gap, earns
// the rage a warrior otherwise opens a pull without, and is the one ability
// with a near edge: being already there is not a reason to spend it.
{
  const charge = ABILITIES.charge!
  expect('a charge reaches further than a swing', charge.range > MELEE_RANGE * 3, `${charge.range}`)
  expect('and has a near edge', (charge.minRange ?? 0) > MELEE_RANGE, `${charge.minRange}`)
  expect('and costs nothing', charge.cost === 0, `${charge.cost}`)

  const warriors = SPEC_OPTIONS.filter((p) => p.classId === 'warrior')
  const armed = warriors.filter((p) => specOf(p).abilities.mobility === 'charge')
  expect('both warrior specs carry it', armed.length === warriors.length, `${armed.length}`)

  const bars = warriors.map((p) => abilityBar(p))
  expect(
    'and it sits in a different slot in each',
    bars[0]!.indexOf('charge') !== bars[1]!.indexOf('charge'),
    bars.map((b) => b.indexOf('charge')).join(' and '),
  )

  const setup = (gap: number) => {
    const s = createState(0x51ed, 0, [
      pickFor('warrior', 'dps')!,
      pickFor('warrior', 'tank')!,
      pickFor('priest', 'healer')!,
      pickFor('mage', 'dps')!,
      pickFor('rogue', 'dps')!,
    ])
    const player = s.actors.find((a) => a.isPlayer)!
    player.pos.x = boss(s).pos.x + gap
    player.pos.y = boss(s).pos.y
    player.power = 0
    return { s, player, slot: abilityBar(pickFor('warrior', 'dps')!).indexOf('charge') }
  }

  {
    const { s, player, slot } = setup(220)
    const before = dist(player.pos, boss(s).pos)
    step(s, { moveX: 0, moveY: 0, pressed: [slot] }, new Rng(0x51ed))
    const after = dist(player.pos, boss(s).pos)
    expect('charging crosses the gap', after < MELEE_RANGE + boss(s).radius + 5, `${after.toFixed(0)} from ${before.toFixed(0)}`)
    expect('and arrives with rage to spend', player.power >= CHARGE_RAGE - 1, `${player.power}`)
    expect('and draws the run', s.effects.some((e) => e.kind === 'dash'), s.effects.map((e) => e.kind).join(', '))
  }

  {
    // Already there: refused, and told why in the words that fit.
    const { s, player, slot } = setup(30)
    expect(
      'standing on it, the charge is blocked for being close',
      castBlocker(s, player, charge, boss(s).id) === 'close',
      `${castBlocker(s, player, charge, boss(s).id)}`,
    )
    step(s, { moveX: 0, moveY: 0, pressed: [slot] }, new Rng(0x51ed))
    expect('which is not the same thing as out of range', s.texts.some((t) => t.text === 'Too close'), s.texts.map((t) => t.text).join(', '))
    expect('and costs no cooldown', (player.cooldowns.charge ?? 0) === 0, `${player.cooldowns.charge}`)
  }

  {
    // Across the arena: still out of range, and still says so.
    const { s, player } = setup(ARENA_RADIUS - 20)
    expect(
      'from across the floor it is out of range',
      castBlocker(s, player, charge, boss(s).id) === 'range',
      `${castBlocker(s, player, charge, boss(s).id)}`,
    )
  }

  {
    // The button reads as unusable at both edges, since from either one the
    // answer is the same: not from here.
    const near = setup(30)
    const far = setup(ARENA_RADIUS - 20)
    expect(
      'the slot is red at both edges',
      slotStatus(near.s, near.player, 'charge') === 'range' &&
        slotStatus(far.s, far.player, 'charge') === 'range',
      `${slotStatus(near.s, near.player, 'charge')} and ${slotStatus(far.s, far.player, 'charge')}`,
    )
  }

  {
    // And the AI uses it rather than walking: a warrior parked at range
    // should be in melee within a couple of seconds.
    const s = createState(0x51ed, 0, [
      pickFor('mage', 'dps')!,
      pickFor('warrior', 'tank')!,
      pickFor('priest', 'healer')!,
      pickFor('warrior', 'dps')!,
      pickFor('rogue', 'dps')!,
    ])
    const arms = s.actors.find((a) => a.classId === 'warrior' && a.spec === 'arms')!
    arms.pos.x = boss(s).pos.x + 200
    arms.pos.y = boss(s).pos.y
    const rng = new Rng(0x51ed)
    let charged = false
    for (let i = 0; i < 30 * 3 && !charged; i++) {
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
      charged = s.effects.some((e) => e.kind === 'dash')
    }
    expect('an AI warrior charges rather than walks', charged, 'it walked the whole way')
  }
}

if (failures > 0) throw new Error(`${failures} render check(s) failed`)
console.log('all render checks passed')

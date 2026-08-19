import { BAR_SLOTS } from '../src/input'
import { MAX_CATCHUP_TICKS, advance, type Clock } from '../src/loop'
import { drawWorld } from '../src/render/draw'
import { allIcons, iconFor } from '../src/render/icons'
import { drawHud, partyButton, soundButton } from '../src/render/hud'
import { drawRoster, hitRoster, rosterLayout } from '../src/render/roster'
import { L, updateLayout } from '../src/render/theme'
import { ABILITIES } from '../src/sim/abilities'
import {
  CLASSES,
  CLASS_ORDER,
  ROLE_LIMITS,
  SPEC_OPTIONS,
  abilityBar,
  autoParty,
  canSelect,
  selectInto,
  FIVE_MAN,
  isLegalComposition,
  countRoles,
  makeSlots,
  partyIndex,
  randomParty,
  specLabel,
  type Pick,
  type RaidSize,
} from '../src/sim/classes'
import {
  PROJECTILE_MIN_RANGE,
  boss,
  projectileKind,
  resolveAbility,
  topThreatTarget,
} from '../src/sim/combat'
import { ENRAGE_AT } from '../src/sim/constants'
import { Rng } from '../src/sim/rng'
import { step } from '../src/sim/sim'
import { createState } from '../src/sim/state'
import type { Role } from '../src/sim/types'

/** Records every 2D context call so the render path can run outside a browser. */
function stubCtx(): CanvasRenderingContext2D {
  const noop = () => {}
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop) {
      if (prop === 'measureText') return () => ({ width: 10 })
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
    drawWorld(ctx, s, 0.5, s.time)
    // Alternate modes so both the desktop bar and the touch overlay are drawn.
    drawHud(ctx, s, touchView(s.tick % 2 === 0), s.tick % 3 === 0)
    frames++
  }
  // Also render the terminal state, which draws the outcome overlay.
  drawWorld(ctx, s, 1, s.time)
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
  for (const ability of Object.values(ABILITIES)) {
    if (ability.range < PROJECTILE_MIN_RANGE) continue
    s.projectiles.length = 0
    // Heals need someone other than the caster, or there is nothing to cross.
    const victim = ability.kind === 'heal' ? ally : target
    resolveAbility(s, caster, ability, victim.id, rng)
    if (s.projectiles.length === 0) silent.push(ability.id)
  }

  const ranged = Object.values(ABILITIES).filter((a) => a.range >= PROJECTILE_MIN_RANGE)
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
    autoParty(5, { classId: 'mage', role: 'dps' }),
    autoParty(10, { classId: 'druid', role: 'tank' }),
    autoParty(25, { classId: 'shaman', role: 'healer' }),
  ]
  for (const [w, h] of [[1440, 900], [390, 844], [844, 390]] as const) {
    updateLayout(w, h)

    for (const party of parties) {
      for (let slot = 0; slot < party.length; slot += 3) {
        drawRoster(stubCtx(), party, slot % 2 === 0 ? 'normal' : 'heroic', slot, 1.5)
      }

      // Every drawn control must be reachable by a tap at its own centre, at
      // every raid size — a 25-slot grid is where they start to collide.
      const layout = rosterLayout(party.length)
      const targets = [
        ...layout.sizes.map((r, i) => [`size ${i}`, r] as const),
        ...layout.difficulties.map((r, i) => [`difficulty ${i}`, r] as const),
        ...layout.slots.map((r, i) => [`slot ${i}`, r] as const),
        ...layout.classes.map((r, i) => [`class ${i}`, r] as const),
        ['auto', layout.auto] as const,
        ['random', layout.random] as const,
        ['pull', layout.pull] as const,
      ]

      const bad = targets.filter(([name, r]) => {
        if (r.x < 0 || r.y < 0 || r.x + r.w > w || r.y + r.h > h) return true
        const hit = hitRoster(r.x + r.w / 2, r.y + r.h / 2, party.length)
        if (hit === null) return true
        // The hit must be the control that was drawn there, not a neighbour
        // sitting on top of it.
        const [kind, index] = name.split(' ')
        if (kind === 'slot' && hit.kind === 'slot') return hit.index !== Number(index)
        if (kind === 'class' && hit.kind !== 'class') return true
        if (kind === 'size' && hit.kind !== 'size') return true
        if (kind === 'difficulty' && hit.kind !== 'difficulty') return true
        if (kind === 'auto' && hit.kind !== 'auto') return true
        if (kind === 'random' && hit.kind !== 'random') return true
        if (kind === 'pull' && hit.kind !== 'pull') return true
        return false
      })

      console.log(
        bad.length === 0 ? 'ok  ' : 'FAIL',
        `  roster ${w}x${h} ${party.length}-player: ${targets.length} controls`,
      )
      if (bad.length > 0) {
        throw new Error(
          `roster ${w}x${h} ${party.length}-player: ${bad.map(([n]) => n).join(', ')}`,
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
    const rosters = [autoParty(size, { classId: 'mage', role: 'dps' })]
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
      combos.add(party.map((p) => `${p.classId}:${p.role}`).join(','))
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

function recordingCtx(circles: Circle[]): CanvasRenderingContext2D {
  const noop = () => {}
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop) {
      if (prop === 'arc') {
        return (x: number, y: number, r: number) => circles.push({ x, y, r })
      }
      if (prop === 'measureText') return () => ({ width: 10 })
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
  drawWorld(recordingCtx(circles), s, 1, s.time)

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

  // The bar order is a contract with the keyboard: slot i is key i+1. A new
  // ability appended in the wrong place relabels every button after it.
  const mislabelled: string[] = []
  for (const id of CLASS_ORDER) {
    for (const spec of CLASSES[id].specs) {
      const bar = abilityBar({ classId: id, role: spec.role })
      if (bar.length > BAR_SLOTS) mislabelled.push(`${id} ${spec.role}: ${bar.length} slots`)
      bar.forEach((abilityId: string, i: number) => {
        const key = ABILITIES[abilityId]!.key
        if (key !== String(i + 1)) mislabelled.push(`${id} ${spec.role}: ${abilityId} says ${key}, is slot ${i + 1}`)
      })
    }
  }
  expect('every bar slot is labelled with the key that fires it', mislabelled.length === 0, mislabelled.join('; '))
}

// A taunt has to take the boss back off whoever ran away with it.
{
  const s = createState(0x51ed, 0)
  const rng = new Rng(0x51ed)
  const tank = s.actors.find((a) => a.role === 'tank')!
  const dealer = s.actors.find((a) => a.faction === 'party' && a.role === 'dps')!

  s.threat[dealer.id] = 5000
  expect('a dealer can out-threat the tank', topThreatTarget(s)?.id === dealer.id, `${topThreatTarget(s)?.name}`)

  const taunt = ABILITIES[CLASSES.warrior.specs.find((sp) => sp.role === 'tank')!.abilities.taunt!]!
  resolveAbility(s, tank, taunt, boss(s).id, rng)
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
    const party = autoParty(size, { classId: 'mage', role: 'dps' })
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
    const options = SPEC_OPTIONS.filter((o) => o.role === role)
    expect(`there are ${role} specs to over-fill with`, options.length >= 3, `${options.length}`)

    for (const size of [10, 25] as RaidSize[]) {
      // Tapping the same role into every slot in turn, which is exactly what
      // the party screen does with a finger held on the class list.
      let party = autoParty(size, { classId: 'mage', role: 'dps' })
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
    const party = autoParty(25, { classId: 'mage', role: 'dps' })
    expect(`the 25-player default fields ${cap} ${role}s`, countRoles(party)[role] === cap, `${countRoles(party)[role]}`)

    const held = party.findIndex((p) => p.role === role)
    const swap = selectInto(party, held, options[options.length - 1]!)
    expect(`a ${role} can be swapped for another ${role}`, swap !== null && countRoles(swap)[role] === cap, `${swap && countRoles(swap)[role]}`)

    const dpsSlot = party.findIndex((p) => p.role === 'dps')
    expect(`one ${role} past the cap is refused`, !canSelect(party, dpsSlot, options[0]!), `slot ${dpsSlot}`)
    expect(`a dealer is still fine alongside ${role}s`, canSelect(party, dpsSlot, { classId: 'mage', role: 'dps' }), `slot ${dpsSlot}`)
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
    let party = autoParty(5, { classId: 'mage', role: 'dps' })
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
    const before = autoParty(5, { classId: 'mage', role: 'dps' })
    const tanked = selectInto(before, 0, { classId: 'warrior', role: 'tank' })
    expect('the player can take the tank slot', tanked !== null && tanked[0]!.role === 'tank', `${tanked && tanked[0]!.role}`)
    expect('and the raid is still 1t 1h 3d', tanked !== null && shape(tanked) === wanted, `${tanked && shape(tanked)}`)
    expect(
      'the displaced tank keeps the role it was handed',
      tanked !== null && tanked.filter((p) => p.role === 'dps').length === FIVE_MAN.dps,
      `${tanked && shape(tanked)}`,
    )

    // Bigger raids keep their slack: this trade must not leak into them.
    const ten = autoParty(10, { classId: 'mage', role: 'dps' })
    const third = selectInto(ten, 9, { classId: 'warrior', role: 'tank' })
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
      { classId: 'warrior', role: 'tank' },
      { classId: 'paladin', role: 'tank' },
      { classId: 'druid', role: 'tank' },
      { classId: 'priest', role: 'healer' },
      { classId: 'mage', role: 'dps' },
    ]],
    ['four healers', [
      { classId: 'warrior', role: 'tank' },
      { classId: 'priest', role: 'healer' },
      { classId: 'paladin', role: 'healer' },
      { classId: 'druid', role: 'healer' },
      { classId: 'shaman', role: 'healer' },
    ]],
    ['a five-man with two healers', [
      { classId: 'warrior', role: 'tank' },
      { classId: 'priest', role: 'healer' },
      { classId: 'paladin', role: 'healer' },
      { classId: 'mage', role: 'dps' },
      { classId: 'rogue', role: 'dps' },
    ]],
    ['a five-man with no tank', [
      { classId: 'mage', role: 'dps' },
      { classId: 'priest', role: 'healer' },
      { classId: 'hunter', role: 'dps' },
      { classId: 'rogue', role: 'dps' },
      { classId: 'shaman', role: 'dps' },
    ]],
  ]
  for (const [label, party] of stored) {
    expect(`a stored roster with ${label} is rejected`, !isLegalComposition(party), 'accepted')
  }
}

if (failures > 0) throw new Error(`${failures} render check(s) failed`)
console.log('all render checks passed')

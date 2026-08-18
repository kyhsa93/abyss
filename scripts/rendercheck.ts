import { Rng } from '../src/sim/rng'
import { createState } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { ENRAGE_AT } from '../src/sim/constants'
import { drawWorld } from '../src/render/draw'
import { drawHud } from '../src/render/hud'
import { partyButton, soundButton } from '../src/render/hud'
import { drawRoster, hitRoster, rosterLayout } from '../src/render/roster'
import {
  autoParty,
  countRoles,
  randomParty,
  type ClassId,
  type RaidSize,
} from '../src/sim/classes'
import { L, updateLayout } from '../src/render/theme'

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

// Ranged casts must actually put bolts in the air; they are simulation state,
// so a regression here would silently remove them from every replay too.
{
  updateLayout(1440, 900)
  const s = createState(0x51ed, 0)
  const rng = new Rng(0x51ed)
  let seen = 0
  let peak = 0
  while (s.outcome === 'ongoing' && s.time < 45) {
    step(s, { moveX: 0, moveY: 0, pressed: s.tick % 45 === 0 ? [0, 1, 2] : [] }, rng)
    seen += s.projectiles.length
    peak = Math.max(peak, s.projectiles.length)
  }
  console.log(
    seen > 0 && peak > 0 ? 'ok  ' : 'FAIL',
    `  ranged bolts in flight (peak ${peak})`,
  )
  if (seen === 0) throw new Error('no projectiles were spawned')
}

// --- the party screen must draw and stay hit-testable ---------------------
{
  // Every raid size has to lay out and stay reachable.
  const parties: ClassId[][] = [
    ['mage', 'warrior', 'priest', 'hunter', 'rogue'],
    autoParty(10, 'mage'),
    autoParty(25, 'warrior'),
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
      combos.add(party.join(','))
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

// --- on-screen controls must not overlap ----------------------------------
{
  for (const [w, h] of [[1440, 900], [390, 844], [844, 390], [360, 640]] as const) {
    updateLayout(w, h)
    for (const [name, rect] of [
      ['party', partyButton()],
      ['sound', soundButton()],
    ] as const) {
      const overlaps = L.btnYs.some(
        (y) =>
          Math.abs(rect.x + rect.w / 2 - L.btnX) < rect.w / 2 + L.btnR &&
          Math.abs(rect.y + rect.h / 2 - y) < rect.h / 2 + L.btnR,
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

  const buttons = circles.filter((c) => Math.abs(c.r - L.btnR) < 1 && Math.abs(c.x - L.btnX) < 2)
  expect(`${label}: three ability buttons drawn`, buttons.length >= 3, `${buttons.length}`)
  expect(`${label}: buttons on screen`, buttons.every(onScreen), JSON.stringify(buttons[0]))

  // The desktop bar must not draw those circles when touch is inactive.
  const desktop: Circle[] = []
  drawHud(recordingCtx(desktop), s, touchView(false), false)
  const strays = desktop.filter((c) => Math.abs(c.r - L.btnR) < 1)
  expect(`${label}: no touch buttons in keyboard mode`, strays.length === 0, `${strays.length}`)
}

if (failures > 0) throw new Error(`${failures} render check(s) failed`)
console.log('all render checks passed')

import { BAR_SLOTS } from '../src/input'
import { MAX_CATCHUP_TICKS, advance, type Clock } from '../src/loop'
import { drawWorld } from '../src/render/draw'
import { Effects } from '../src/render/effects'
import { allIcons, hitStyleFor, iconFor } from '../src/render/icons'
import {
  canAdvance,
  drawHud,
  hitOutcome,
  shareRect as outcomeShareRect,
  meterRect,
  outcomeButtons,
  partyButton,
  partyFrames,
  slotStatus,
} from '../src/render/hud'
import { drawRoster, hitRoster, rosterLayout } from '../src/render/roster'
import {
  bgSetupLayout,
  drawBgSetup,
  drawHome,
  drawRaidSetup,
  drawSettings,
  hitBgSetup,
  hitHome,
  hitRaidSetup,
  hitSettings,
  homeLayout,
  raidSetupLayout,
  settingsLayout,
  dailyLayout,
  drawDaily,
  hitDaily,
} from '../src/render/menu'
import {
  dailyLink,
  fightLink,
  dailyMessage,
  gameMessage,
  killMessage,
  parseInvite,
} from '../src/share'
import { VOLUME_NAMES } from '../src/sfx'
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
  AURA_TICK,
  PROJECTILE_MIN_RANGE,
  addAura,
  getAura,
  hasteOf,
  stackAura,
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
  COUNTDOWN,
  COUNTDOWN_TICKS,
  GLOBAL_COOLDOWN,
  CRIT_CHANCE,
  CRIT_MULTIPLIER,
  MELEE_RANGE,
  SPREAD_RADIUS,
  SHOT_MIN_RANGE,
  SPELL_RANGE,
} from '../src/sim/constants'
import { ENCOUNTERS, encounterAt, encounterIndex, hasNext } from '../src/sim/encounters'
import {
  BASE_RADIUS,
  BATTLEGROUNDS,
  NODE_RADIUS,
  carrying,
  held,
  inTerrain,
  living,
  spawnPoint,
  teamOf,
} from '../src/sim/battleground'
import { aiGoal } from '../src/sim/bgai'
import { createBattlegroundState } from '../src/sim/state'
import type { BgKind } from '../src/sim/types'
import { autoPress } from '../src/sim/autocast'
import { dailyFor, dailyKey } from '../src/sim/daily'
import { AFFIXES, type AffixId } from '../src/sim/affix'
import { descentDamage, descentEncounter, descentHealth } from '../src/sim/descent'
import { fold as foldDaily } from '../src/daily-record'
import { Rng } from '../src/sim/rng'
import { step } from '../src/sim/sim'
import { PLAYER_ID, createState } from '../src/sim/state'
import { AWARDS, check as checkAwards, type Earned } from '../src/achievements'
import {
  HISTORY_LIMIT,
  STANDING_LIMIT,
  append,
  record,
  standings,
  totals,
  type Attempt,
} from '../src/history'
import {
  HISTORY_TABS,
  drawHistory,
  historyLayout,
  hitHistory,
} from '../src/render/history'
import { gainPower } from '../src/sim/combat'
import { Ambience, ZOOM, drawBackdrop, setAmbience } from '../src/render/ambience'
import type { Actor, AuraId, Role, SimState, Vec2 } from '../src/sim/types'

/**
 * A fight with its opening countdown already spent.
 *
 * Everything here is about a pull that is running, and a pull that has not
 * started drops input on the floor — without this, every ability check below
 * would be pressing buttons at a boss that cannot hear them yet. The countdown
 * itself is checked at the bottom of this file, against `createState` direct.
 */
function pulled(...args: Parameters<typeof createState>): SimState {
  const s = createState(...args)
  s.countdown = 0
  return s
}

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
  const s = pulled(0x51ed, attempt)
  const rng = new Rng(0x51ed + attempt * 7919)
  while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
    step(s, { moveX: 0, moveY: 0, pressed: s.tick % 45 === 0 ? [0, 1, 2] : [] }, rng)
    drawWorld(ctx, s, 0.5, s.time, new Effects())
    // Alternate modes so both the desktop bar and the touch overlay are drawn.
    drawHud(ctx, s, touchView(s.tick % 2 === 0))
    frames++
  }
  // Also render the terminal state, which draws the outcome overlay.
  drawWorld(ctx, s, 1, s.time, new Effects())
  drawHud(ctx, s, touchView(true))
  drawHud(ctx, s, touchView(false))
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
  const s = pulled(0x51ed, 0)
  const rng = new Rng(0x51ed)
  while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
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
  const s = pulled(0x51ed, 0)
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
        for (const mode of [{ kind: 'raid' } as const, { kind: 'bg', bg: 'flags' } as const]) {
          drawRoster(
            stubCtx(),
            party,
            slot % 2 === 0 ? 'normal' : 'heroic',
            1.5,
            slot % ENCOUNTERS.length,
            mode,
          )
        }
      }

      // Every drawn control must be reachable by a tap at its own centre, at
      // every raid size — a 25-slot grid is where they start to collide.
      const layout = rosterLayout()
      const targets = [
        ...layout.classes.map((r, i) => [`class ${i}`, r] as const),
        ['back', layout.history] as const,
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
        if (kind === 'back' && hit.kind !== 'back') return true
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
  const s = pulled(0x51ed, 0)
  const player = s.actors.find((a) => a.isPlayer)!

  const idle: Circle[] = []
  drawHud(recordingCtx(idle), s, touchView(true))

  player.gcd = 1.2
  const locked: Circle[] = []
  drawHud(recordingCtx(locked), s, touchView(true))

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
    for (const [name, rect] of [['party', partyButton()]] as const) {
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
    const s = pulled(1000 + run * 137, 8)
    const rng = new Rng(1000 + run * 137)
    while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
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

interface BarBox {
  kind: string
  x: number
  y: number
  w: number
  h: number
}

/** Records filled and stroked rectangles, for things drawn as bars. */
function recordingBoxes(boxes: BarBox[]): CanvasRenderingContext2D {
  const noop = () => {}
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop) {
      if (prop === 'fillRect' || prop === 'strokeRect') {
        return (x: number, y: number, w: number, h: number) =>
          boxes.push({ kind: String(prop), x, y, w, h })
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
  const s = pulled(0x51ed, 0)

  const circles: Circle[] = []
  drawHud(recordingCtx(circles), s, touchView(true))

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
  drawHud(recordingCtx(desktop), s, touchView(false))
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
  const s = pulled(0x51ed, 0)
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
  const s = pulled(0x51ed, 0)

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
  const s = pulled(0x51ed, 0)
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
    const s = pulled(0x51ed, 3, party)
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
    for (const [name, rect] of [['party', partyButton()]] as const) {
      expect(`${label}: the minimap clears the ${name} button`, !overlap(map, rect), JSON.stringify(rect))
    }

    for (const touch of [false, true]) {
      const mode = touch ? 'touch' : 'keyboard'
      const meter = meterRect(touch)
      expect(`${label} ${mode}: the meter is on screen`, onScreen(meter), JSON.stringify(meter))
      expect(`${label} ${mode}: the meter clears the minimap`, !overlap(meter, map), JSON.stringify(meter))
      for (const [name, rect] of [['party', partyButton()]] as const) {
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
  const s = pulled(0x51ed, 0, party)
  const rng = new Rng(0x51ed)
  // The player never presses anything, so they finish last of twenty-five.
  while (s.outcome === 'ongoing' && s.time < 40) {
    step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  }

  const player = s.actors.find((a) => a.isPlayer)!
  const labels: Label[] = []
  drawHud(recordingCtx([], labels), s, touchView(false))

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
  const s = pulled(0x51ed, 0, autoParty(10, pickFor('mage', 'dps')!))
  const rng = new Rng(0x51ed)
  for (let i = 0; i < 200; i++) step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)

  const circles: Circle[] = []
  drawHud(recordingCtx(circles), s, touchView(false))

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
    const s = pulled(0x51ed, 0)
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
    const s = pulled(0x51ed, 0)
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
    const s = pulled(0x51ed, 0)
    const player = s.actors.find((a) => a.isPlayer)!
    player.pos.x = 80
    player.pos.y = 0
    const bar = abilityBar({ classId: player.classId, spec: player.spec })
    // With a cooldown: a mage's filler is a cast now, and a refund check needs
    // something that has anything to refund.
    const slot = bar.findIndex((id) => ABILITIES[id]!.castTime > 0 && ABILITIES[id]!.cooldown > 0)
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
    const s = pulled(0x51ed, 0)
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
    const s = pulled(0x51ed, 0, party)
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
    const s = pulled(0x51ed, 0)
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
    const s = pulled(0x51ed, 0, [
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
    // Nine now: leather melee carry a free way out of a puddle, for the same
    // reason a charge is free — it is the answer to the floor, and an answer
    // you sometimes cannot afford is worse than not having one.
    shouldBeFree && free.length === 10,
    free.map((a) => a.id).join(', '),
  )

  // Rage: empty at the pull, earned by swinging, earned by being hit, and
  // never handed over by simply waiting.
  {
    const s = pulled(0x51ed, 0, [
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
      const s = pulled(0x51ed, 0, [
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
    const s = pulled(0x51ed, 0, [
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
  const s = pulled(0x51ed, 0, [
    { classId: 'druid', spec: 'feral' },
    { classId: 'warrior', spec: 'protection' },
    { classId: 'priest', spec: 'discipline' },
    { classId: 'mage', spec: 'frost' },
    { classId: 'rogue', spec: 'assassination' },
  ])
  const player = s.actors.find((a) => a.isPlayer)!
  expect('a feral player is a melee on energy', player.resource === 'energy' && player.melee, `${player.resource}`)

  const bar = abilityBar({ classId: player.classId, spec: player.spec })
  // Four now: leather melee carry a way back onto the boss as well.
  expect('with four buttons of its own', bar.length === 4, bar.join(', '))
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
  const s = pulled(0x51ed, 0, [
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
    const run = pulled(0x51ed, 3)
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
  const s = pulled(0x51ed, 0)
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
    const s = pulled(0x51ed, 0, [
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

  // Slot zero is a cast for a mage now, so the bolt appears when the cast
  // lands rather than on the press.
  const finishCast = (fight: SimState, castRng: Rng, slot: number): void => {
    const caster = fight.actors.find((a) => a.isPlayer)!
    const bar = abilityBar({ classId: caster.classId, spec: caster.spec })
    const wait = Math.ceil((ABILITIES[bar[slot]!]?.castTime ?? 0) * 30) + 1
    step(fight, { moveX: 0, moveY: 0, pressed: [slot] }, castRng)
    for (let i = 0; i < wait; i++) step(fight, { moveX: 0, moveY: 0, pressed: [] }, castRng)
  }

  {
    const { s, player } = setup()
    const rng = new Rng(0x51ed)
    finishCast(s, rng, 0)

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
    const s = pulled(0x51ed, 0, [
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
    const s = pulled(0x51ed, 0, [
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
  const s = pulled(0x51ed, 0, autoParty(25, { classId: 'mage', spec: 'frost' }))
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
  const s = pulled(0x51ed, 0, autoParty(25, { classId: 'mage', spec: 'frost' }))
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
  const s = pulled(0x51ed, 0, [
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
  const slot = bar.findIndex((id) => ABILITIES[id]!.castTime > 0 && ABILITIES[id]!.cooldown > 0)
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
  const again = pulled(0x51ed, 0, [
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
  const s = pulled(0x51ed, 0, autoParty(25, pickFor('mage', 'dps')!))
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
  const s = pulled(0x51ed, 0, [
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
  // A mage's filler is a cast, so the bolt leaves when the cast lands.
  step(s, { moveX: 0, moveY: 0, pressed: [0] }, rng)
  for (let i = 0; i < 45; i++) {
    if (s.projectiles.some((p) => p.sourceId === player.id)) break
    step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  }

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
  const s = pulled(0x51ed, 0, autoParty(10, pickFor('mage', 'dps')!))
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
    const big = pulled(0x51ed, 0, autoParty(25, pickFor('mage', 'dps')!))
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
      for (const tab of HISTORY_TABS) drawHistory(stubCtx(), rows, {}, tab)

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
    const s = pulled(0x51ed, 0, [
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
    const s = pulled(0x51ed, 0, [
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

// --- a bow has a near edge ------------------------------------------------
//
// The hunter is the one ranged class that cannot stand on what it is
// shooting. Same machinery as the charge's near edge, for the opposite
// reason: one exists to cross a gap, the other needs one.
{
  const shots = ['steady_shot', 'serpent_sting', 'aimed_shot']
  const missing = shots.filter((id) => (ABILITIES[id]!.minRange ?? 0) < SHOT_MIN_RANGE)
  expect('every shot needs the distance', missing.length === 0, missing.join(', '))
  expect(
    'and so does the bow itself',
    (specOf(pickFor('hunter', 'dps')!).auto?.minRange ?? 0) === SHOT_MIN_RANGE,
    `${specOf(pickFor('hunter', 'dps')!).auto?.minRange}`,
  )

  // Nobody else picked one up by accident. A charge is the only other thing
  // with a near edge, and it has one to cross rather than to keep.
  const others = Object.values(ABILITIES).filter(
    (a) => (a.minRange ?? 0) > 0 && a.kind !== 'charge' && !shots.includes(a.id),
  )
  expect('and nothing else has one', others.length === 0, others.map((a) => a.id).join(', '))

  const setup = (gap: number) => {
    const s = pulled(0x51ed, 0, [
      pickFor('hunter', 'dps')!,
      pickFor('warrior', 'tank')!,
      pickFor('priest', 'healer')!,
      pickFor('mage', 'dps')!,
      pickFor('rogue', 'dps')!,
    ])
    const player = s.actors.find((a) => a.isPlayer)!
    player.pos.x = boss(s).pos.x + gap
    player.pos.y = boss(s).pos.y
    return { s, player }
  }

  {
    // On top of it: refused, and told the truth about why.
    const { s, player } = setup(70)
    const shot = ABILITIES.steady_shot!
    expect(
      'standing on the boss, a shot is blocked for being close',
      castBlocker(s, player, shot, boss(s).id) === 'close',
      `${castBlocker(s, player, shot, boss(s).id)}`,
    )
    step(s, { moveX: 0, moveY: 0, pressed: [0] }, new Rng(0x51ed))
    expect('and says so', s.texts.some((t) => t.text === 'Too close'), s.texts.map((t) => t.text).join(', '))
    expect('the slot is red', slotStatus(s, player, 'steady_shot') === 'range', slotStatus(s, player, 'steady_shot'))
    expect('and no shot went out', (s.tally[player.id]?.damage ?? 0) === 0, `${s.tally[player.id]?.damage}`)
  }

  {
    // Backed off: fine, exactly as before.
    const { s, player } = setup(220)
    expect(
      'from range it is a shot like any other',
      castBlocker(s, player, ABILITIES.steady_shot!, boss(s).id) === null,
      `${castBlocker(s, player, ABILITIES.steady_shot!, boss(s).id)}`,
    )
  }

  {
    // The bow shoots past what is standing on it rather than at it: a hunter
    // with a thrall in its face still puts its damage on the boss.
    const { s, player } = setup(200)
    const auto = specOf(pickFor('hunter', 'dps')!).auto!
    const rng = new Rng(0x51ed)
    let shotSomething = false
    for (let i = 0; i < 30 * 8; i++) {
      const b = boss(s)
      player.pos.x = b.pos.x + 200
      player.pos.y = b.pos.y
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
      shotSomething ||= (s.tally[player.id]?.damage ?? 0) > 0
    }
    const dealt = s.tally[player.id]?.damage ?? 0
    expect('a hunter held at range keeps shooting', shotSomething && dealt >= auto.damage, `${dealt}`)
  }

  {
    // And the AI keeps itself outside its own edge rather than standing in a
    // dead zone doing nothing. The party AI's shared idea of far enough is
    // narrower than a bow's, which is what this had to learn.
    const s = pulled(0x51ed, 0, [
      pickFor('mage', 'dps')!,
      pickFor('warrior', 'tank')!,
      pickFor('priest', 'healer')!,
      pickFor('hunter', 'dps')!,
      pickFor('rogue', 'dps')!,
    ])
    const hunter = s.actors.find((a) => a.classId === 'hunter')!
    hunter.pos.x = boss(s).pos.x + 70
    hunter.pos.y = boss(s).pos.y
    const rng = new Rng(0x51ed)
    for (let i = 0; i < 30 * 20; i++) step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    expect(
      'an AI hunter does not stand in its own dead zone',
      (s.tally[hunter.id]?.damage ?? 0) > 0,
      'it never fired a shot',
    )
  }
}

// --- awards ----------------------------------------------------------------
//
// Judged from the pull that just ended plus the record kept before it, one
// pure rule each. The simulation does not know they exist, which is what
// stops one from ever changing how a pull plays out.
{
  const ids = AWARDS.map((a) => a.id)
  expect('every award has its own id', new Set(ids).size === ids.length, ids.join(', '))
  expect(
    'and says what it wants',
    AWARDS.every((a) => a.name.length > 0 && a.detail.length > 0),
    AWARDS.filter((a) => !a.detail).map((a) => a.id).join(', '),
  )

  // A wipe earns nothing that is about winning.
  const wiped = pulled(0x51ed, 0, autoParty(5, pickFor('mage', 'dps')!))
  wiped.outcome = 'wipe'
  const onLoss = AWARDS.filter((a) => a.earned(wiped, []))
  expect('a wipe earns nothing', onLoss.length === 0, onLoss.map((a) => a.id).join(', '))

  // A kill earns the ones it should and none of the others.
  const s = pulled(0x51ed, 0, autoParty(5, pickFor('mage', 'dps')!))
  const rng = new Rng(0x51ed)
  while (s.outcome === 'ongoing' && s.time < 300) {
    step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  }
  s.outcome = 'victory'
  const held: Earned = {}
  const first = checkAwards(s, [], held, 1000)
  expect('a kill earns first blood', first.some((a) => a.id === 'first_kill'), first.map((a) => a.id).join(', '))
  expect('and it is written down', held.first_kill === 1000, JSON.stringify(held))

  // And only once: the second kill earns nothing it already holds.
  const again = checkAwards(s, [], held, 2000)
  expect('the same kill does not earn it twice', !again.some((a) => a.id === 'first_kill'), again.map((a) => a.id).join(', '))

  // The ones about the record read the record, not the pull.
  const board = (classId: string) => ({
    at: 1,
    size: 5,
    difficulty: 'normal' as const,
    outcome: 'wipe' as const,
    standings: [{ name: 'You', classId, spec: 'frost', dps: 1, hps: 0, isPlayer: true }],
  })
  const five = ['mage', 'rogue', 'priest', 'druid', 'shaman'].map(board)
  const tourist = AWARDS.find((a) => a.id === 'tourist')!
  expect('five classes earns the tourist', tourist.earned(wiped, five), 'not earned')
  expect('four does not', !tourist.earned(wiped, five.slice(0, 4)), 'earned too early')

  const persistent = AWARDS.find((a) => a.id === 'persistent')!
  expect(
    'ten pulls earns the tenth',
    persistent.earned(wiped, Array.from({ length: 10 }, () => board('mage'))),
    'not earned',
  )

  // Storage drops an award that no longer exists rather than keeping a ghost.
  const kept = { first_kill: 1, no_such_award: 2 } as Record<string, number>
  const known = new Set(ids)
  const survivors = Object.keys(kept).filter((id) => known.has(id))
  expect('an unknown award is dropped on load', survivors.length === 1, survivors.join(', '))

  // The screen shows them, locked ones included, and the tabs answer taps.
  for (const [label, w, h] of [
    ['desktop 1440x900', 1440, 900],
    ['portrait 390x844', 390, 844],
    ['landscape 844x390', 844, 390],
    ['small portrait 360x640', 360, 640],
  ] as const) {
    updateLayout(w, h)
    const layout = historyLayout([])
    const onScreen = (r: { x: number; y: number; w: number; h: number }) =>
      r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h

    expect(`${label}: the award rows fit`, layout.awards.every(onScreen), JSON.stringify(layout.awards[layout.awards.length - 1]))
    expect(`${label}: nothing is under the button`, layout.awards.every((r) => r.y + r.h <= layout.back.y), 'a row overlaps the button')
    expect(`${label}: both tabs are on screen`, layout.tabs.every(onScreen), JSON.stringify(layout.tabs))

    const answers = HISTORY_TABS.every(
      (id, i) => hitHistory(layout.tabs[i]!.x + 4, layout.tabs[i]!.y + 4, []) === id,
    )
    expect(`${label}: and answer their own taps`, answers, 'a tab answered as another')
  }
}

// --- the pull waits, and then it starts -------------------------------------
//
// Two opposite failures are silent here. A fight that runs anyway makes the
// count decoration, and every balance number was measured without three extra
// seconds of boss script in front of it. A fight that never starts leaves a
// dead screen with nothing thrown. Both are asserted against the simulation
// rather than against the drawing, and the number itself against the canvas,
// since a countdown nobody can see is the third way this goes wrong.
{
  const s = createState(0x51ed, 0)
  const rng = new Rng(0x51ed)
  const before = boss(s).hp
  const player = s.actors.find((a) => a.isPlayer)!
  const start = { x: player.pos.x, y: player.pos.y }

  expect('a pull opens on the countdown', s.countdown === COUNTDOWN_TICKS, `${s.countdown}`)

  // One tick short of the whole count, leaning on the controls throughout.
  for (let i = 0; i < COUNTDOWN_TICKS - 1; i++) {
    step(s, { moveX: 1, moveY: 1, pressed: [0, 1, 2] }, rng)
  }

  expect('no time passes during it', s.time === 0 && s.tick === 0, `${s.time} / ${s.tick}`)
  expect('the boss script has not run', s.ground.length === 0 && boss(s).hp === before, `${s.ground.length}`)
  expect(
    'and the player cannot move off their mark',
    player.pos.x === start.x && player.pos.y === start.y,
    `${player.pos.x - start.x}, ${player.pos.y - start.y}`,
  )
  expect('the count is still running', s.countdown > 0, `${s.countdown}`)

  step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  expect('it ends on the tick it should', s.countdown === 0, `${s.countdown}`)
  expect('and says go once', s.sounds.filter((e) => e === 'pull').length === 1, s.sounds.join(','))

  // The tick after is a fight, which is the half that a `return` too high up
  // would leave permanently frozen.
  step(s, { moveX: 1, moveY: 0, pressed: [] }, rng)
  expect('the fight runs from there', s.time > 0 && s.tick === 1, `${s.time} / ${s.tick}`)
  expect(
    'and the player moves again',
    player.pos.x !== start.x || player.pos.y !== start.y,
    'still on the mark',
  )
}

for (const [label, w, h] of [
  ['desktop 1440x900', 1440, 900],
  ['portrait 390x844', 390, 844],
  ['landscape 844x390', 844, 390],
] as const) {
  updateLayout(w, h)

  const counting: Label[] = []
  drawHud(recordingCtx([], counting), createState(0x51ed, 0), touchView(false))

  // The same frame with the fight running. Searching the first list for the
  // text "3" on its own would find an ability slot's own number and pass on a
  // countdown that drew nothing, so what counts is the difference between the
  // two: text that is on screen only while the count is.
  const started = pulled(0x51ed, 0)
  const running: Label[] = []
  drawHud(recordingCtx([], running), started, touchView(false))

  const added = counting.filter(
    (c) => !running.some((r) => r.text === c.text && r.x === c.x && r.y === c.y),
  )
  const count = added.find((t) => t.text === String(COUNTDOWN))
  expect(
    `${label}: the count is drawn on screen`,
    count !== undefined && count.x >= 0 && count.x <= w && count.y >= 0 && count.y <= h,
    JSON.stringify(added.map((t) => t.text)),
  )

  // It is over the world, not over the player's own token: the pause is for
  // reading where you are, and a number parked on top of you removes it.
  expect(
    `${label}: and not on top of the player`,
    count !== undefined && Math.hypot(count.x - L.cx, count.y - L.cy) > 24,
    JSON.stringify(count),
  )

  // And it leaves rather than sitting at zero over the fight.
  const leftover = running.filter(
    (r) => !counting.some((c) => c.text === r.text && c.x === r.x && c.y === r.y),
  )
  expect(
    `${label}: and gone once the fight starts`,
    !running.some((t) => count !== undefined && t.x === count.x && t.y === count.y),
    JSON.stringify(leftover.map((t) => t.text)),
  )
}

// --- the results screen answers its own buttons and nothing else ------------
//
// The overlay is mostly report: what everyone dealt, what they took, how the
// pull ended. Reading it is the point of the screen, and a tap anywhere on it
// used to be read as PULL AGAIN — so on a phone, where there is no other way
// to look at anything, looking started the next pull.
for (const [label, w, h] of [
  ['desktop 1440x900', 1440, 900],
  ['portrait 390x844', 390, 844],
  ['landscape 844x390', 844, 390],
  ['small portrait 360x640', 360, 640],
] as const) {
  updateLayout(w, h)
  // A wipe, which is the two-button case.
  const ended = pulled(0x51ed, 0)
  ended.outcome = 'wipe'
  const b = outcomeButtons()
  const middle = (r: { x: number; y: number; w: number; h: number }) => ({
    x: r.x + r.w / 2,
    y: r.y + r.h / 2,
  })

  const retry = middle(b.retry)
  const party = middle(b.party)
  expect(`${label}: PULL AGAIN answers`, hitOutcome(retry.x, retry.y, ended) === 'retry', `${hitOutcome(retry.x, retry.y, ended)}`)
  expect(`${label}: CHANGE PARTY answers`, hitOutcome(party.x, party.y, ended) === 'party', `${hitOutcome(party.x, party.y, ended)}`)

  // Every corner of each button counts, or a tap on the edge of the one you
  // aimed at falls through to the other outcome.
  const corners = [b.retry, b.party].every((r) =>
    [
      [r.x, r.y],
      [r.x + r.w, r.y],
      [r.x, r.y + r.h],
      [r.x + r.w, r.y + r.h],
    ].every(([x, y]) => hitOutcome(x!, y!, ended) !== null),
  )
  expect(`${label}: their edges count as hits`, corners, 'an edge fell through')

  for (const [where, x, y] of [
    ['the report', L.w / 2, L.h * 0.4],
    ['the outcome title', L.w / 2, Math.max(40, L.h * 0.11)],
    ['the gap between the buttons', L.w / 2, b.retry.y + b.retry.h / 2],
    ['the line under them', L.w / 2, b.retry.y + b.retry.h + 20],
    ['a corner of the screen', 3, 3],
    ['below everything', L.w / 2, L.h - 2],
  ] as const) {
    expect(`${label}: ${where} does not`, hitOutcome(x, y, ended) === null, `${hitOutcome(x, y, ended)}`)
  }
}

// --- the bosses are different fights, and each one is survivable ------------
//
// A table of numbers is easy to get wrong in a way that types cannot catch: a
// cadence of zero disables a mechanic, and a scheduler that does not check for
// it fires that mechanic every tick instead of never. That is what happened to
// spread the first time this ran — every party member marked, thirty times a
// second — so what each boss actually puts on the floor is asserted here
// rather than read off the table it came from.
{
  const seen = new Map<string, Set<string>>()
  for (let i = 0; i < ENCOUNTERS.length; i++) {
    const kinds = new Set<string>()
    let spreads = 0
    let adds = 0
    const s = pulled(0x51ed, 8, undefined, 'normal', i)
    const rng = new Rng(0x51ed)
    while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
      step(s, { moveX: 0, moveY: 0, pressed: [0] }, rng)
      for (const g of s.ground) kinds.add(g.kind)
      for (const a of s.actors) {
        if (a.faction === 'party' && a.auras.some((aura) => aura.id === 'spread')) spreads++
      }
      adds += s.actors.filter((a) => a.faction === 'boss' && a.id !== boss(s).id).length
    }
    if (spreads > 0) kinds.add('spread')
    if (adds > 0) kinds.add('adds')
    seen.set(ENCOUNTERS[i]!.id, kinds)

    const encounter = ENCOUNTERS[i]!
    const label = encounter.name

    // Whatever the table says it does, it does — and whatever it says it does
    // not do, it never does.
    for (const key of ['breath', 'shockwave', 'adds', 'spread'] as const) {
      const wanted = Object.values(encounter.phases).some((p) => p[key] > 0)
      const happened = kinds.has(key)
      // A mechanic can be scheduled and still not reach the floor inside one
      // pull, so only the negative is asserted in both directions.
      if (!wanted) {
        expect(`${label}: no ${key}`, !happened, `${key} fired on a boss with none`)
      } else if (key === 'spread' || key === 'adds') {
        expect(`${label}: ${key} happens`, happened, `${key} never fired`)
      }
    }

    expect(
      `${label}: the pull resolves`,
      s.outcome !== 'ongoing',
      `still running at ${s.time.toFixed(0)}s`,
    )
  }

  // And they are not the same fight with a different name on it.
  const ids = [...seen.keys()]
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = seen.get(ids[i]!)!
      const b = seen.get(ids[j]!)!
      const same = a.size === b.size && [...a].every((k) => b.has(k))
      expect(`${ids[i]} and ${ids[j]} ask for different things`, !same, [...a].join(','))
    }
  }

  // An index from a save older than the list must not open a fight that is
  // not there.
  expect('a wild index clamps', encounterIndex(99) === ENCOUNTERS.length - 1, `${encounterIndex(99)}`)
  expect('and so does a negative one', encounterIndex(-5) === 0, `${encounterIndex(-5)}`)
  expect('the last boss has no next', !hasNext(ENCOUNTERS.length - 1), 'it claims one')
}

// --- NEXT BOSS appears exactly when there is one ----------------------------
for (const [label, w, h] of [
  ['desktop 1440x900', 1440, 900],
  ['portrait 390x844', 390, 844],
  ['landscape 844x390', 844, 390],
  ['small portrait 360x640', 360, 640],
] as const) {
  updateLayout(w, h)

  const two = outcomeButtons(false)
  const three = outcomeButtons(true)
  expect(`${label}: two buttons without a next boss`, two.next === null, 'a third appeared')
  expect(`${label}: three with one`, three.next !== null, 'the third is missing')

  // Left of PULL AGAIN, which is what was asked for and also the order the
  // three read in: leave this boss, repeat it, or go change the raid.
  expect(
    `${label}: NEXT BOSS sits left of PULL AGAIN`,
    three.next !== null && three.next.x + three.next.w <= three.retry.x,
    JSON.stringify(three),
  )

  const row = [three.next!, three.retry, three.party]
  expect(
    `${label}: all three fit on screen`,
    row.every((r) => r.x >= 0 && r.x + r.w <= w && r.y >= 0 && r.y + r.h <= h),
    JSON.stringify(row),
  )
  expect(
    `${label}: and do not overlap`,
    row.every((r, i) => i === 0 || r.x >= row[i - 1]!.x + row[i - 1]!.w),
    JSON.stringify(row),
  )

  // The hit test has to be asked the same question the drawing was, or the
  // third button is drawn and answers as PULL AGAIN.
  // Asked with the state, which is what makes the two layouts impossible to
  // mix up: a kill on a boss with a successor is exactly the case that draws
  // three, so it is the case that must read three.
  const killed = pulled(0x51ed, 0, undefined, 'normal', 0)
  killed.outcome = 'victory'
  const wiped = pulled(0x51ed, 0, undefined, 'normal', 0)
  wiped.outcome = 'wipe'

  const at = (r: { x: number; y: number; w: number; h: number }) => [r.x + r.w / 2, r.y + r.h / 2] as const
  expect(`${label}: NEXT BOSS answers`, hitOutcome(...at(three.next!), killed) === 'next', 'it did not')
  expect(`${label}: PULL AGAIN still answers`, hitOutcome(...at(three.retry), killed) === 'retry', 'it did not')
  expect(`${label}: CHANGE PARTY still answers`, hitOutcome(...at(three.party), killed) === 'party', 'it did not')
  expect(
    `${label}: a wipe reads the two-button row`,
    hitOutcome(...at(two.retry), wiped) === 'retry' && hitOutcome(...at(two.party), wiped) === 'party',
    'a wipe read the wrong row',
  )
}

// A kill on the last boss offers no way on, and a wipe never does.
{
  updateLayout(1440, 900)
  const last = pulled(0x51ed, 0, undefined, 'normal', ENCOUNTERS.length - 1)
  last.outcome = 'victory'
  expect('the last kill has nowhere to go', !canAdvance(last), 'it offered one')

  const first = pulled(0x51ed, 0, undefined, 'normal', 0)
  first.outcome = 'victory'
  expect('an earlier kill does', canAdvance(first), 'it did not')

  first.outcome = 'wipe'
  expect('a wipe does not', !canAdvance(first), 'a wipe offered the next boss')
  first.outcome = 'enrage'
  expect('nor an enrage', !canAdvance(first), 'an enrage offered the next boss')
}

// --- battlegrounds ----------------------------------------------------------
//
// The other team stands where the boss did, in the faction sense, and that is
// exactly the kind of reuse that goes wrong quietly: two rules keyed off
// `faction === 'party'` were handing blue a seven percent damage advantage and
// deleting every cast red ever finished. Neither threw. So what is asserted
// here is symmetry — a side that wins because it is that side.
for (const bg of BATTLEGROUNDS) {
  const s = createBattlegroundState(0x51ed, bg.kind)
  s.countdown = 0
  const rng = new Rng(0x51ed)

  expect(`${bg.name}: five a side`, living(s, 'blue').length === 5 && living(s, 'red').length === 5,
    `${living(s, 'blue').length} v ${living(s, 'red').length}`)
  expect(`${bg.name}: the player is on blue`,
    s.actors.filter((a) => a.isPlayer).every((a) => teamOf(a) === 'blue'), 'player is not blue')
  expect(`${bg.name}: everyone else is driven`,
    s.actors.every((a) => a.isPlayer || a.ai !== null), 'somebody has no AI')

  let deaths = 0
  let respawns = 0
  const alive = new Map(s.actors.map((a) => [a.id, a.alive]))
  let ticks = 0
  while (s.outcome === 'ongoing' && s.time < s.bg!.timeLimit + 30) {
    const player = s.actors.find((a) => a.isPlayer)!
    const goal = player.alive ? aiGoal(s, player) : null
    let moveX = 0
    let moveY = 0
    if (goal) {
      const dx = goal.x - player.pos.x
      const dy = goal.y - player.pos.y
      const d = Math.hypot(dx, dy)
      if (d > 12) {
        moveX = dx / d
        moveY = dy / d
      }
    }
    step(s, { moveX, moveY, pressed: ticks % 45 === 0 ? [0] : [] }, rng)
    ticks++
    for (const a of s.actors) {
      const was = alive.get(a.id)
      if (was && !a.alive) deaths++
      if (was === false && a.alive) respawns++
      alive.set(a.id, a.alive)
    }
  }

  expect(`${bg.name}: it ends`, s.outcome === 'victory' || s.outcome === 'defeat',
    `${s.outcome} at ${s.time.toFixed(0)}s`)
  expect(`${bg.name}: somebody died`, deaths > 0, 'nobody died in a whole match')
  // A battleground where the dead stay down is a deathmatch with extra
  // reading: the first team to win a fight wins the match.
  expect(`${bg.name}: and got back up`, respawns > 0, `${deaths} deaths, no respawns`)

  // Both sides fight. Red's finished casts used to be routed into the boss
  // script and dropped on the floor, which no test could see except this one.
  const redDamage = s.actors
    .filter((a) => teamOf(a) === 'red')
    .reduce((sum, a) => sum + (s.tally[a.id]?.damageTaken ?? 0), 0)
  const blueDamage = s.actors
    .filter((a) => teamOf(a) === 'blue')
    .reduce((sum, a) => sum + (s.tally[a.id]?.damageTaken ?? 0), 0)
  expect(`${bg.name}: blue lands damage`, redDamage > 0, `${redDamage}`)
  expect(`${bg.name}: red lands damage`, blueDamage > 0, `${blueDamage}`)
  expect(
    `${bg.name}: and neither by a landslide`,
    Math.max(redDamage, blueDamage) < Math.min(redDamage, blueDamage) * 3,
    `blue took ${blueDamage}, red took ${redDamage}`,
  )
}

// The rules themselves, checked directly rather than through a whole match.
{
  const s = createBattlegroundState(0x51ed, 'conquest')
  s.countdown = 0
  const rng = new Rng(0x51ed)
  const bg = s.bg!
  const node = bg.nodes[0]!

  // Nobody on it: nothing happens, however long you wait.
  node.progress = 0.5
  for (const a of s.actors) {
    a.pos.x = 900
    a.pos.y = 900
  }
  for (let i = 0; i < 60; i++) step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  expect('an empty point does not drift', Math.abs(node.progress - 0.5) < 0.001, `${node.progress}`)

  // Both teams on it: frozen and marked, rather than one of them winning.
  const blue = s.actors.find((a) => teamOf(a) === 'blue')!
  const red = s.actors.find((a) => teamOf(a) === 'red')!
  for (const a of [blue, red]) {
    a.pos.x = node.pos.x
    a.pos.y = node.pos.y
  }
  const before = node.progress
  step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  expect('a contested point is marked', node.contested, 'not contested')
  expect('even numbers do not move it', Math.abs(node.progress - before) < 0.001, `${node.progress}`)

  // But numbers do. Freezing a contested point outright meant a fight on the
  // circle stopped the circle, and with a healer a side those fights do not
  // resolve — the bar sat still for a third of every match.
  const second = s.actors.filter((a) => teamOf(a) === 'blue')[1]!
  const third = s.actors.filter((a) => teamOf(a) === 'blue')[2]!
  for (const a of [second, third]) {
    a.pos.x = node.pos.x
    a.pos.y = node.pos.y
  }
  const outnumbered = node.progress
  step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  expect('but being outnumbered does', node.progress > outnumbered, `${node.progress}`)
  expect('and it is still contested', node.contested, 'stopped being contested')
  for (const a of [second, third]) {
    a.pos.x = 900
    a.pos.y = 900
  }

  // One team alone takes it, and only pays once it is all the way over.
  red.alive = false
  const scoreBefore = bg.score.blue
  // Long enough to cross the whole bar: a point pays only once it is all the
  // way over, and it starts this test half way.
  for (let i = 0; i < 120; i++) step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  expect('a held point pays', bg.score.blue > scoreBefore, `${bg.score.blue}`)
  expect('and is owned', held(bg, 'blue') >= 1, `${held(bg, 'blue')}`)
}

{
  const s = createBattlegroundState(0x51ed, 'flags')
  s.countdown = 0
  const rng = new Rng(0x51ed)
  const bg = s.bg!
  const runner = s.actors.find((a) => teamOf(a) === 'blue' && !a.isPlayer)!

  // Standing on their flag takes it; standing on your own does not.
  runner.pos = { ...bg.flags.red.pos }
  step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  expect('their flag can be taken', bg.flags.red.carrierId === runner.id, `${bg.flags.red.carrierId}`)
  expect('and rides its carrier', bg.flags.red.state === 'carried', bg.flags.red.state)

  // Carrying it home scores, but only while your own flag is still standing.
  bg.flags.blue.state = 'dropped'
  bg.flags.blue.dropTimer = 10
  bg.flags.blue.pos = { x: 0, y: 0 }
  runner.pos = { ...bg.bases.blue }
  step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  expect('a cap is refused while yours is out', bg.score.blue === 0, `${bg.score.blue}`)

  bg.flags.blue.state = 'home'
  bg.flags.blue.pos = { ...bg.bases.blue }
  runner.pos = { ...bg.bases.blue }
  step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  expect('and allowed once it is home', bg.score.blue === 1, `${bg.score.blue}`)
  expect('the flag goes back', bg.flags.red.state === 'home', bg.flags.red.state)

  // Carrying it costs something, or nobody ever catches a carrier and both
  // flags stay out for the whole match — which is what happened.
  {
    const other = s.actors.find((a) => teamOf(a) === 'red')!
    runner.pos = { ...bg.flags.red.pos }
    step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    expect('carrying it is a handicap', carrying(s, runner) && !carrying(s, other), 'wrong carrier')

    const hp = runner.hp
    const otherHp = other.hp
    applyDamage(s, runner, 1000, 'none', { sourceId: other.id })
    applyDamage(s, other, 1000, 'none', { sourceId: runner.id })
    const carrierTook = hp - runner.hp
    const plainTook = otherHp - other.hp
    expect('and a carrier takes more', carrierTook > plainTook, `${carrierTook} vs ${plainTook}`)

  }

  // A carrier that dies drops it where they fell rather than teleporting it.
  runner.pos = { ...bg.flags.red.pos }
  step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  runner.pos = { x: 40, y: 40 }
  step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  const where = { ...bg.flags.red.pos }
  runner.alive = false
  step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  expect('a dead carrier drops it', bg.flags.red.state === 'dropped', bg.flags.red.state)
  expect(
    'where they fell',
    Math.hypot(bg.flags.red.pos.x - where.x, bg.flags.red.pos.y - where.y) < 1,
    JSON.stringify(bg.flags.red.pos),
  )
  // And it does not sit there long. Fifteen seconds of nobody able to score
  // is most of why a match locked up.
  expect('and returns itself soon', bg.flags.red.dropTimer <= 6, `${bg.flags.red.dropTimer}`)
}

// The escort's own rules: a thing that rolls while you keep it company.
{
  const s = createBattlegroundState(0x51ed, 'escort')
  s.countdown = 0
  const rng = new Rng(0x51ed)
  const bg = s.bg!
  expect('an escort has two carts', bg.carts !== null, 'none')
  if (bg.carts) {
    const ours = bg.carts.blue
    const theirs = bg.carts.red

    expect(
      'each starts at its own base',
      dist(ours.pos, bg.bases.blue) < 1 && dist(theirs.pos, bg.bases.red) < 1,
      `${ours.pos.x.toFixed(0)} / ${theirs.pos.x.toFixed(0)}`,
    )
    expect('and they start level', ours.progress === 0 && theirs.progress === 0, 'not at zero')

    // Nobody near it: it does not move, however long you wait.
    //
    // The AI is switched off for this: left on, it walks whoever is planted on
    // a cart straight back off it, and what the test then measures is the
    // walking rather than the rule.
    for (const a of s.actors) {
      a.ai = null
      a.pos = { x: 900, y: 900 }
    }
    for (let i = 0; i < 90; i++) step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    expect('an abandoned cart stops', ours.progress === 0, `${ours.progress.toFixed(3)}`)

    // Your side alone: it rolls.
    const pusher = s.actors.find((a) => teamOf(a) === 'blue')!
    pusher.pos = { ...ours.pos }
    for (let i = 0; i < 60; i++) {
      pusher.pos = { ...ours.pos }
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    }
    const pushed = ours.progress
    expect('one of yours pushes it', pushed > 0, `${pushed.toFixed(3)}`)

    // Theirs turns up in equal number: it stops and says so.
    const blocker = s.actors.find((a) => teamOf(a) === 'red')!
    for (let i = 0; i < 60; i++) {
      pusher.pos = { ...ours.pos }
      blocker.pos = { ...ours.pos }
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    }
    // Even numbers creep rather than freeze: a single missing body used to be
    // the whole match, since five against four was one cart moving and one
    // standing still.
    const contestedGain = ours.progress - pushed
    expect('one of theirs nearly stops it', contestedGain > 0 && contestedGain < pushed * 0.5, `${contestedGain.toFixed(3)} vs ${pushed.toFixed(3)}`)
    expect('and it is marked as held', ours.contested, 'not contested')

    // Outnumbered on your own cart costs ground rather than freezing it: two
    // of theirs against one of yours moves nothing, three of yours moves it.
    const second = s.actors.filter((a) => teamOf(a) === 'blue')[1]!
    const third = s.actors.filter((a) => teamOf(a) === 'blue')[2]!
    const held = ours.progress
    for (let i = 0; i < 60; i++) {
      for (const a of [pusher, second, third]) a.pos = { ...ours.pos }
      blocker.pos = { ...ours.pos }
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    }
    expect('numbers move it again', ours.progress > held, `${held.toFixed(3)} -> ${ours.progress.toFixed(3)}`)

    // Arriving ends the match, for whichever side arrives.
    ours.progress = 1
    step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    expect('arriving wins it', s.outcome === 'victory', s.outcome)
  }
}

{
  // And the other way round, so the rule is not written for one side.
  const s = createBattlegroundState(0x51ed, 'escort')
  s.countdown = 0
  const rng = new Rng(0x51ed)
  s.bg!.carts!.red.progress = 1
  step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  expect('and theirs arriving loses it', s.outcome === 'defeat', s.outcome)
}

// The screens: a battleground draws its own readouts and none of the raid's.
for (const [label, w, h] of [
  ['desktop 1440x900', 1440, 900],
  ['portrait 390x844', 390, 844],
  ['landscape 844x390', 844, 390],
] as const) {
  updateLayout(w, h)
  for (const kind of ['conquest', 'flags'] as BgKind[]) {
    const s = createBattlegroundState(0x51ed, kind)
    s.countdown = 0
    const rng = new Rng(0x51ed)
    for (let i = 0; i < 300; i++) step(s, { moveX: 1, moveY: 0.3, pressed: [0] }, rng)

    // It has to draw at all, mid-match and over the result.
    drawWorld(stubCtx(), s, 0.5, 1.5, new Effects())
    drawHud(stubCtx(), s, touchView(true))
    s.outcome = 'defeat'
    drawHud(stubCtx(), s, touchView(false))
    s.outcome = 'ongoing'

    const labels: Label[] = []
    drawHud(recordingCtx([], labels), s, touchView(false))
    const text = labels.map((t) => t.text).join(' | ')
    expect(`${label} ${kind}: the score is on screen`, text.includes(BATTLEGROUNDS.find((b) => b.kind === kind)!.name), text.slice(0, 80))
    expect(`${label} ${kind}: no enrage clock`, !text.includes('enrage'), text.slice(0, 80))
    expect(`${label} ${kind}: no phase readout`, !/phase \d/.test(text), text.slice(0, 80))
  }

  // Nothing in the summary may be drawn over the grid.
  //
  // The rect checks above cannot see this: text is not a rect, and the boss
  // name went in as a fourth summary line under a grid whose top had been a
  // fixed step below the *first* line since there were two. It was drawn
  // across the first row of specs on every screen — 25 pixels into them on a
  // desktop — and every check passed.
  for (const mode of [
    { kind: 'raid' } as const,
    { kind: 'bg', bg: 'flags' } as const,
  ]) {
    const layout = rosterLayout()
    const labels: Label[] = []
    drawRoster(
      recordingCtx([], labels),
      autoParty(5, pickFor('mage', 'dps')!),
      'normal',
      1.5,
      0,
      mode,
    )

    const headlineName =
      mode.kind === 'raid'
        ? ENCOUNTERS[0]!.name
        : BATTLEGROUNDS.find((b) => b.kind === mode.bg)!.name
    const headline = labels.find((t) => t.text.includes(headlineName))
    expect(
      `${label} ${mode.kind}: the headline is above the grid`,
      headline !== undefined && headline.y < layout.gridTop,
      `${headline?.y.toFixed(0)} vs grid at ${layout.gridTop.toFixed(0)}`,
    )

    const rolled = labels.find((t) => t.text.includes('rolled at the door'))
    expect(
      `${label} ${mode.kind}: and so is the composition line`,
      rolled !== undefined && rolled.y < layout.gridTop,
      `${rolled?.y.toFixed(0)} vs grid at ${layout.gridTop.toFixed(0)}`,
    )
  }
}

// --- the menu ---------------------------------------------------------------
//
// One question per screen, and every one of them has to be drawable and
// answerable at every size. A control that draws but does not answer its own
// tap is the failure this catches: the two come from one layout function so
// they cannot disagree, and this is what holds that arrangement in place.
interface Box {
  x: number
  y: number
  w: number
  h: number
}
const collides = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) >
  1

for (const [label, w, h] of [
  ['desktop 1440x900', 1440, 900],
  ['portrait 390x844', 390, 844],
  ['landscape 844x390', 844, 390],
  ['small portrait 360x640', 360, 640],
  ['tiny portrait 320x568', 320, 568],
] as const) {
  updateLayout(w, h)
  const onScreen = (r: Box) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h
  const middle = (r: { x: number; y: number; w: number; h: number }) =>
    [r.x + r.w / 2, r.y + r.h / 2] as const

  // Home: the ways in, plus the record and the share.
  drawHome(stubCtx(), 1.5)
  const home = homeLayout()
  const homeRects = [...home.choices, home.record, home.share]
  expect(`${label}: the front page fits`, homeRects.every(onScreen), JSON.stringify(homeRects))
  expect(
    `${label}: and nothing on it overlaps`,
    homeRects.every((r, i) => homeRects.every((o, j) => i === j || !collides(r, o))),
    'two choices share space',
  )
  const answers = ['raid', 'battleground', 'daily', 'descent', 'settings'] as const
  expect(
    `${label}: each choice answers as itself`,
    answers.every((want, i) => hitHome(...middle(home.choices[i]!)) === want) &&
      hitHome(...middle(home.record)) === 'record' &&
      hitHome(...middle(home.share)) === 'share',
    `${answers.map((_, i) => hitHome(...middle(home.choices[i]!))).join(',')}`,
  )

  // Raid setup: boss, size, difficulty, and the way on.
  drawRaidSetup(stubCtx(), 0, ENCOUNTERS.length - 1, 5, 'heroic')
  drawRaidSetup(stubCtx(), 0, 0, 25, 'normal')
  const raid = raidSetupLayout()
  const raidRects = [...raid.bosses, ...raid.sizes, ...raid.difficulties, raid.back, raid.next]
  expect(`${label}: the raid setup fits`, raidRects.every(onScreen), JSON.stringify(raidRects.filter((r) => !onScreen(r))))
  expect(
    `${label}: and its rows do not collide`,
    raidRects.every((r, i) => raidRects.every((o, j) => i === j || !collides(r, o))),
    'two raid controls share space',
  )
  expect(
    `${label}: every raid control answers as itself`,
    raid.bosses.every((r, i) => {
      const hit = hitRaidSetup(...middle(r))
      return hit?.kind === 'boss' && hit.index === i
    }) &&
      raid.sizes.every((r) => hitRaidSetup(...middle(r))?.kind === 'size') &&
      raid.difficulties.every((r) => hitRaidSetup(...middle(r))?.kind === 'difficulty') &&
      hitRaidSetup(...middle(raid.back))?.kind === 'back' &&
      hitRaidSetup(...middle(raid.next))?.kind === 'next',
    'a raid control answered as something else',
  )

  // Battleground: pick a map, and that is the whole screen.
  drawBgSetup(stubCtx(), 'flags')
  const bg = bgSetupLayout()
  const bgRects = [...bg.maps, bg.back]
  expect(`${label}: the battleground list fits`, bgRects.every(onScreen), JSON.stringify(bgRects))
  expect(
    `${label}: a map answers as that map`,
    bg.maps.every((r, i) => {
      const hit = hitBgSetup(...middle(r))
      return hit?.kind === 'map' && hit.map === BATTLEGROUNDS[i]!.kind
    }) && hitBgSetup(...middle(bg.back))?.kind === 'back',
    'a map answered as something else',
  )

  // Settings: sound, the volume it plays at, and the fight behind the menus.
  drawSettings(stubCtx(), false, 1, true)
  drawSettings(stubCtx(), true, 0, false)
  const settings = settingsLayout()
  const settingsRects = [settings.sound, ...settings.volumes, settings.backdrop, settings.back]
  expect(`${label}: the settings fit`, settingsRects.every(onScreen), JSON.stringify(settingsRects))
  expect(
    `${label}: and do not collide`,
    settingsRects.every((r, i) => settingsRects.every((o, j) => i === j || !collides(r, o))),
    'two settings share space',
  )
  expect(
    `${label}: one button per volume level`,
    settings.volumes.length === VOLUME_NAMES.length,
    `${settings.volumes.length}`,
  )
  expect(
    `${label}: sound and volume answer as themselves`,
    hitSettings(...middle(settings.backdrop))?.kind === 'backdrop' &&
      hitSettings(...middle(settings.sound))?.kind === 'sound' &&
      settings.volumes.every((r, i) => {
        const hit = hitSettings(...middle(r))
        return hit?.kind === 'volume' && hit.level === i
      }) &&
      hitSettings(...middle(settings.back))?.kind === 'back',
    'a setting answered as something else',
  )
}

// --- terrain ----------------------------------------------------------------
//
// Everything in a battleground walks straight at what it wants, so terrain is
// the one thing on the map that can make a body stop making progress. That is
// the failure this game has already had twice, and both times it looked like
// standing still rather than like a bug.
for (const kind of ['conquest', 'flags'] as BgKind[]) {
  const s = createBattlegroundState(0x51ed, kind)
  s.countdown = 0
  const rng = new Rng(0x51ed)
  const bg = s.bg!

  expect(`${kind}: the map has terrain`, bg.obstacles.length > 0, `${bg.obstacles.length}`)

  // Rolled per match, so what has to hold is every roll rather than this one.
  // Sixty of them: placement, spacing, symmetry, and that the map is still a
  // map — a pair of rocks a body cannot fit between is a wall, and nothing
  // here can path around a wall.
  {
    let bad = 0
    let identical = 0
    const shapes = new Set<string>()
    for (let n = 0; n < 60; n++) {
      const rolled = createBattlegroundState(2000 + n * 137, kind)
      const map = rolled.bg!
      shapes.add(map.obstacles.map((r) => `${r.pos.x.toFixed(0)},${r.pos.y.toFixed(0)},${r.radius.toFixed(0)}`).join('|'))

      for (const rock of map.obstacles) {
        if (Math.hypot(rock.pos.x, rock.pos.y) + rock.radius > ARENA_RADIUS - 10) bad++
        if (map.nodes.some((node) => dist(rock.pos, node.pos) < NODE_RADIUS + rock.radius)) bad++
        for (const team of ['blue', 'red'] as const) {
          if (dist(rock.pos, map.bases[team]) < BASE_RADIUS + rock.radius) bad++
          for (let i = 0; i < 5; i++) if (inTerrain(map, spawnPoint(map, team, i), 18)) bad++
        }
        // Mirrored, or one team has cover the other does not.
        const twin = map.obstacles.find(
          (o) =>
            Math.abs(o.pos.x + rock.pos.x) < 0.01 &&
            Math.abs(o.pos.y - rock.pos.y) < 0.01 &&
            Math.abs(o.radius - rock.radius) < 0.01,
        )
        if (!twin) bad++
      }
      for (let i = 0; i < map.obstacles.length; i++) {
        for (let j = i + 1; j < map.obstacles.length; j++) {
          const a = map.obstacles[i]!
          const b = map.obstacles[j]!
          if (dist(a.pos, b.pos) - a.radius - b.radius < 40) bad++
        }
      }
    }
    if (shapes.size < 30) identical++

    expect(`${kind}: every roll is a legal map`, bad === 0, `${bad} faults over 60 rolls`)
    expect(`${kind}: and they are not the same map`, identical === 0, `${shapes.size} distinct layouts in 60`)
  }

  // Reachable, on rolls that are not this one: a body walking from its base
  // has to arrive at every objective rather than leaning on a rock forever.
  {
    let stuck = 0
    for (let n = 0; n < 12; n++) {
      const rolled = createBattlegroundState(3000 + n * 137, kind)
      rolled.countdown = 0
      const walkRng = new Rng(3000 + n)
      const map = rolled.bg!
      const walker = rolled.actors.find((a) => a.isPlayer)!
      const targets = kind === 'conquest' ? map.nodes.map((node) => node.pos) : [map.bases.red]

      for (const target of targets) {
        walker.pos = { ...map.bases.blue }
        walker.prevPos = { ...walker.pos }
        let ticks = 0
        while (ticks < 1200 && dist(walker.pos, target) > 30) {
          const dx = target.x - walker.pos.x
          const dy = target.y - walker.pos.y
          const gap = Math.hypot(dx, dy) || 1
          step(rolled, { moveX: dx / gap, moveY: dy / gap, pressed: [] }, walkRng)
          ticks++
        }
        if (dist(walker.pos, target) > 30) stuck++
      }
    }
    expect(`${kind}: every objective stays reachable`, stuck === 0, `${stuck} unreachable objectives`)
  }

  // Nothing may be placed on top of anything that has to be stood on.
  const onObjective = bg.obstacles.some(
    (rock) =>
      bg.nodes.some((n) => dist(rock.pos, n.pos) < rock.radius + n.radius) ||
      (['blue', 'red'] as const).some(
        (team) => dist(rock.pos, bg.bases[team]) < rock.radius + BASE_RADIUS,
      ),
  )
  expect(`${kind}: and none of it sits on a point or a base`, !onObjective, 'terrain covers an objective')

  const spawnsClear = (['blue', 'red'] as const).every((team) =>
    [0, 1, 2, 3, 4].every((i) => !inTerrain(bg, spawnPoint(bg, team, i), 18)),
  )
  expect(`${kind}: nor on a spawn`, spawnsClear, 'somebody spawns inside a rock')

  // Play it out. Nobody may end a tick inside terrain, and the match still has
  // to reach an end rather than deadlocking against a rock.
  let inside = 0
  while (s.outcome === 'ongoing' && s.time < bg.timeLimit + 30) {
    step(s, { moveX: 0.6, moveY: 0.4, pressed: [] }, rng)
    for (const a of s.actors) {
      if (a.alive && inTerrain(bg, a.pos, a.radius * 0.9)) inside++
    }
  }
  expect(`${kind}: nobody walks through it`, inside === 0, `${inside} actor-ticks inside terrain`)
  expect(`${kind}: and the match still ends`, s.outcome !== 'ongoing', `${s.outcome}`)
}

// A body aimed straight through a rock has to come out the other side.
{
  const s = createBattlegroundState(0x51ed, 'conquest')
  s.countdown = 0
  const rng = new Rng(0x51ed)
  const bg = s.bg!
  const rock = bg.obstacles[0]!
  const walker = s.actors.find((a) => a.isPlayer)!

  // Lined up so the straight route is blocked by the middle of the rock.
  walker.pos = { x: rock.pos.x - rock.radius - 120, y: rock.pos.y }
  walker.prevPos = { ...walker.pos }
  const goal = { x: rock.pos.x + rock.radius + 120, y: rock.pos.y }

  let ticks = 0
  while (ticks < 900 && dist(walker.pos, goal) > 40) {
    const dx = goal.x - walker.pos.x
    const dy = goal.y - walker.pos.y
    const gap = Math.hypot(dx, dy) || 1
    step(s, { moveX: dx / gap, moveY: dy / gap, pressed: [] }, rng)
    ticks++
  }
  expect(
    'walking into a rock goes around it',
    dist(walker.pos, goal) <= 40,
    `stopped ${dist(walker.pos, goal).toFixed(0)} away after ${ticks} ticks`,
  )
}

// --- a battleground AI has to actually get somewhere -------------------------
//
// Walking is not the same as travelling. The capture-point assignment used to
// sort the points by distance from the actor and then index into that list, so
// one step toward a point reordered it, handed the actor a different point,
// and sent it back — for whole matches. Nothing threw, the AI looked busy, and
// win rates stayed even because both teams did it. What it cost was the ground
// they covered: four percent of what they walked.
{
  const s = createBattlegroundState(0x51ed, 'conquest')
  s.countdown = 0
  const rng = new Rng(0x51ed)

  const WINDOW = 150
  const track = new Map<number, { walked: number; from: Vec2; ratios: number[] }>()
  for (const a of s.actors) if (a.ai) track.set(a.id, { walked: 0, from: { ...a.pos }, ratios: [] })

  let ticks = 0
  while (s.outcome === 'ongoing' && s.time < 120) {
    const before = new Map(s.actors.map((a) => [a.id, { ...a.pos }]))
    step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    ticks++

    for (const a of s.actors) {
      const t = track.get(a.id)
      if (!t || !a.alive) continue
      const p = before.get(a.id)!
      t.walked += Math.hypot(a.pos.x - p.x, a.pos.y - p.y)
      if (ticks % WINDOW !== 0) continue
      // Only windows with real walking in them: standing on a point you hold
      // is the correct thing to be doing and would read as a ratio of zero.
      if (t.walked > 120) {
        t.ratios.push(Math.hypot(a.pos.x - t.from.x, a.pos.y - t.from.y) / t.walked)
      }
      t.walked = 0
      t.from = { ...a.pos }
    }
  }

  const scored = [...track.values()].filter((t) => t.ratios.length > 0)
  const average =
    scored.reduce((sum, t) => sum + t.ratios.reduce((a, b) => a + b, 0) / t.ratios.length, 0) /
    Math.max(1, scored.length)
  // Terrain costs a little of this: walking round a rock is ground covered
  // that does not close the distance.
  expect(
    'a battleground AI covers the ground it walks',
    average > 0.38,
    `net over walked averaged ${average.toFixed(2)} across ${scored.length} actors`,
  )

  // And the commitment itself: an actor's point may not change every tick.
  const changes = new Map<number, number>()
  const last = new Map<number, number | null>()
  const fresh = createBattlegroundState(0x51ed, 'conquest')
  fresh.countdown = 0
  const freshRng = new Rng(0x51ed)
  let freshTicks = 0
  while (fresh.outcome === 'ongoing' && fresh.time < 60) {
    step(fresh, { moveX: 0, moveY: 0, pressed: [] }, freshRng)
    freshTicks++
    for (const a of fresh.actors) {
      const now = fresh.bg!.assignment[a.id] ?? null
      const before = last.get(a.id)
      if (before !== undefined && before !== now) {
        changes.set(a.id, (changes.get(a.id) ?? 0) + 1)
      }
      last.set(a.id, now)
    }
  }
  const flips = [...changes.values()].reduce((a, b) => a + b, 0)
  // A minute of play, ten actors: a handful of real decisions, not hundreds.
  expect(
    'and does not change its mind every tick',
    flips < freshTicks / 10,
    `${flips} changes over ${freshTicks} ticks`,
  )
}

// --- the damage specs have to stay different from each other -----------------
//
// They were nine names for one spec: filler, dot, finisher, with the numbers
// moved ten percent and the same three presses in the same order. Nothing was
// broken about it, which is why it survived so long — it just meant picking a
// class chose a colour.
//
// A training dummy rather than a pull: an encounter measures the walk, the
// dodging and the dying as much as the rotation, and five runs of one swung a
// hunter between 32 and 177 dps, which no tuning could converge against.
{
  const SECONDS = 60
  const profiles: Array<{ name: string; dps: number; presses: number; mix: number[]; cast: number }> = []

  for (const pick of SPEC_OPTIONS) {
    if (roleOf(pick) !== 'dps') continue
    const spec = specOf(pick)
    const s = pulled(0x51ed, 8, autoParty(5, pick))
    const rng = new Rng(0x51ed)
    const player = s.actors.find((a) => a.isPlayer)!
    const boss = s.actors[s.actors.length - 1]!
    const bar = abilityBar(pick)
    const range = spec.melee ? 40 : 260

    const counts = new Array(bar.length).fill(0)
    let presses = 0
    let castTicks = 0

    for (let tick = 0; tick < SECONDS * 30; tick++) {
      // Nothing is allowed to move, die or end the fight.
      boss.hp = boss.maxHp
      boss.pos.x = 0
      boss.pos.y = 0
      for (const a of s.actors) if (a.faction === 'party') a.hp = a.maxHp
      player.pos.x = range + boss.radius
      player.pos.y = 0
      s.ground.length = 0

      const pressed = autoPress(s)
      for (const slot of pressed) {
        counts[slot]++
        presses++
      }
      if (player.castId) castTicks++
      step(s, { moveX: 0, moveY: 0, pressed }, rng)
    }

    profiles.push({
      name: specLabel(pick),
      dps: (s.tally[player.id]?.damage ?? 0) / SECONDS,
      presses: presses / SECONDS,
      mix: counts.map((c) => c / Math.max(1, presses)),
      cast: castTicks / (SECONDS * 30),
    })
  }

  // Even, because a spec nobody would pick is a spec that does not exist.
  const best = Math.max(...profiles.map((p) => p.dps))
  const worst = Math.min(...profiles.map((p) => p.dps))
  expect(
    'no damage spec is the obvious one',
    best < worst * 1.25,
    profiles.map((p) => `${p.name} ${p.dps.toFixed(0)}`).join(', '),
  )

  // Even is half of it. The other half is that the traits actually do
  // something, which is asserted directly rather than inferred from a play
  // profile: on a dummy every spec presses once a global and splits its
  // presses by its cooldowns, so two specs that play nothing alike come out
  // identical there. What separates them is what the same press is worth
  // after what you did before it, and that is what these measure.
  const hit = (
    build: (fight: SimState, actor: Actor) => void,
    pick: Pick,
    slotOf: 'filler' | 'finisher',
  ): number => {
    const fight = pulled(0x51ed, 0, autoParty(5, pick))
    const actor = fight.actors.find((a) => a.isPlayer)!
    const boss = fight.actors[fight.actors.length - 1]!
    boss.pos = { x: 0, y: 0 }
    actor.pos = { x: (specOf(pick).melee ? 40 : 240) + boss.radius, y: 0 }
    boss.hp = boss.maxHp
    build(fight, actor)

    const id = specOf(pick).abilities[slotOf]!
    const before = boss.hp
    landAbility(fight, actor, ABILITIES[id]!, boss.id, new Rng(1))
    return before - boss.hp
  }

  const rogue = pickFor('rogue', 'dps')!
  const empty = hit(() => {}, rogue, 'finisher')
  const banked = hit((_fight, actor) => {
    for (let i = 0; i < 5; i++) stackAura(actor, 'combo', actor.id)
  }, rogue, 'finisher')
  expect('combo points are worth spending', banked > empty * 1.7, `${empty} -> ${banked}`)

  const balance = pickFor('druid', 'dps')!
  const closed = hit(() => {}, balance, 'filler')
  const open = hit((_fight, actor) => stackAura(actor, 'eclipse', actor.id), balance, 'filler')
  expect('an eclipse window is worth filling', open > closed * 1.3, `${closed} -> ${open}`)

  const shadow = pickFor('priest', 'dps')!
  const unmarked = hit(() => {}, shadow, 'filler')
  const marked = hit((fight, actor) => {
    const boss = fight.actors[fight.actors.length - 1]!
    addAura(boss, specOf(shadow).abilities.overTime as AuraId, actor.id)
  }, shadow, 'filler')
  expect('a mark is worth keeping up', marked > unmarked * 1.25, `${unmarked} -> ${marked}`)

  const arms = pickFor('warrior', 'dps')!
  const poor = hit((_fight, actor) => { actor.power = 0 }, arms, 'filler')
  const rich = hit((_fight, actor) => { actor.power = actor.maxPower }, arms, 'filler')
  expect('overflowing rage is worth spending', rich > poor * 1.3, `${poor} -> ${rich}`)

  const hunter = pickFor('hunter', 'dps')!
  const close = hit((_fight, actor) => { actor.pos.x = 150 }, hunter, 'filler')
  const far = hit((_fight, actor) => { actor.pos.x = 340 }, hunter, 'filler')
  expect('a hunter is paid for its distance', far > close * 1.15, `${close} -> ${far}`)

  const mage = pickFor('mage', 'dps')!
  const cold = hit(() => {}, mage, 'filler')
  const rolling = hit((_fight, actor) => {
    for (let i = 0; i < 3; i++) stackAura(actor, 'momentum', actor.id)
  }, mage, 'filler')
  expect('momentum compounds', rolling > cold * 1.3, `${cold} -> ${rolling}`)

  // The chain is the one that pays in a crowd rather than on its target, so it
  // is measured where a crowd exists. A raid opens with a boss and nothing
  // else, which is why the first version of this check quietly skipped itself.
  {
    const shaman = pickFor('shaman', 'dps')!
    const fight = createBattlegroundState(0x51ed, 'conquest', autoParty(5, shaman))
    fight.countdown = 0
    const actor = fight.actors.find((a) => a.isPlayer)!
    const enemies = fight.actors.filter((a) => a.faction === 'boss')
    const target = enemies[0]!

    target.pos = { x: 0, y: 0 }
    actor.pos = { x: 240, y: 0 }
    for (const [i, extra] of enemies.slice(1, 3).entries()) {
      extra.pos = { x: 70 * (i + 1), y: 0 }
      extra.alive = true
      extra.hp = extra.maxHp
    }

    const before = enemies.slice(1, 3).reduce((sum, a) => sum + a.hp, 0)
    landAbility(fight, actor, ABILITIES[specOf(shaman).abilities.finisher!]!, target.id, new Rng(1))
    const after = enemies.slice(1, 3).reduce((sum, a) => sum + a.hp, 0)
    expect('the chain reaches what is standing near', after < before, `${before} -> ${after}`)

    // And not what is standing near on your own side.
    const friends = fight.actors.filter((a) => a.faction === 'party' && !a.isPlayer)
    for (const friend of friends) {
      friend.pos = { x: 40, y: 0 }
      friend.hp = friend.maxHp
    }
    const friendlyBefore = friends.reduce((sum, a) => sum + a.hp, 0)
    landAbility(fight, actor, ABILITIES[specOf(shaman).abilities.finisher!]!, target.id, new Rng(1))
    const friendlyAfter = friends.reduce((sum, a) => sum + a.hp, 0)
    expect('and never your own side', friendlyAfter === friendlyBefore, `${friendlyBefore} -> ${friendlyAfter}`)
  }

  // Healers and tanks have rules of their own, and the same rule applies to
  // them: a trait that only exists in the tuning notes is a comment. These are
  // asserted through the damage and healing paths rather than by reading the
  // table back.
  {
    const healTest = (
      pick: Pick,
      build: (fight: SimState, healer: Actor, patient: Actor) => Actor,
    ): number => {
      const fight = pulled(0x51ed, 0, autoParty(5, pick))
      const healer = fight.actors.find((a) => a.isPlayer)!
      const patient = build(fight, healer, fight.actors.find((a) => a.faction === 'party' && !a.isPlayer)!)
      patient.pos = { ...healer.pos }
      patient.hp = Math.round(patient.maxHp * 0.4)
      const before = patient.hp
      landAbility(fight, healer, ABILITIES[specOf(pick).abilities.filler]!, patient.id, new Rng(1))
      return patient.hp - before
    }

    // The paladin is a tank healer: more on the tank, less on everyone else.
    const paladin = pickFor('paladin', 'healer')!
    const onTank = healTest(paladin, (fight, _healer, fallback) =>
      fight.actors.find((a) => a.faction === 'party' && a.role === 'tank') ?? fallback,
    )
    const onDealer = healTest(paladin, (fight, _healer, fallback) =>
      fight.actors.find((a) => a.faction === 'party' && a.role === 'dps' && !a.isPlayer) ?? fallback,
    )
    expect('a paladin heals the tank for more', onTank > onDealer * 1.4, `${onTank} vs ${onDealer}`)

    // The druid's direct heal blooms on somebody already mending.
    const druid = pickFor('druid', 'healer')!
    const dry = healTest(druid, (_fight, _healer, fallback) => fallback)
    const mending = healTest(druid, (_fight, healer, fallback) => {
      addAura(fallback, specOf(druid).abilities.overTime as AuraId, healer.id)
      return fallback
    })
    expect('a druid heal blooms on a mending target', mending > dry * 1.4, `${dry} -> ${mending}`)

    // The priest puts its reduction on before the hit arrives.
    {
      const priest = pickFor('priest', 'healer')!
      const fight = pulled(0x51ed, 0, autoParty(5, priest))
      const healer = fight.actors.find((a) => a.isPlayer)!
      const ally = fight.actors.find((a) => a.faction === 'party' && !a.isPlayer)!
      ally.pos = { ...healer.pos }
      ally.hp = ally.maxHp

      const bare = (() => {
        const before = ally.hp
        applyDamage(fight, ally, 1000, 'none', { sourceId: healer.id })
        const took = before - ally.hp
        ally.hp = ally.maxHp
        return took
      })()

      landAbility(fight, healer, ABILITIES[specOf(priest).abilities.overTime!]!, ally.id, new Rng(1))
      expect('a priest ward goes on the target', getAura(ally, 'ward') !== undefined, 'no ward')
      const warded = (() => {
        const before = ally.hp
        applyDamage(fight, ally, 1000, 'none', { sourceId: healer.id })
        return before - ally.hp
      })()
      expect('and it is worth having on first', warded < bare * 0.8, `${bare} -> ${warded}`)
    }

    // The warrior tank spends rage on not being hit.
    {
      const warrior = pickFor('warrior', 'tank')!
      const fight = pulled(0x51ed, 0, autoParty(5, warrior))
      const tank = fight.actors.find((a) => a.isPlayer)!
      const boss = fight.actors[fight.actors.length - 1]!

      tank.power = 0
      tank.hp = tank.maxHp
      let before = tank.hp
      applyDamage(fight, tank, 800, 'physical', { sourceId: boss.id })
      const poor = before - tank.hp

      tank.power = tank.maxPower
      tank.hp = tank.maxHp
      before = tank.hp
      applyDamage(fight, tank, 800, 'physical', { sourceId: boss.id })
      const rich = before - tank.hp
      expect('rage is armour on a warrior', rich < poor * 0.85, `${poor} -> ${rich}`)
    }

    // The paladin tank's reduction is on a clock a healer can read.
    {
      const paladinTank = pickFor('paladin', 'tank')!
      const fight = pulled(0x51ed, 0, autoParty(5, paladinTank))
      const tank = fight.actors.find((a) => a.isPlayer)!
      const boss = fight.actors[fight.actors.length - 1]!

      const at = (time: number): number => {
        fight.time = time
        tank.hp = tank.maxHp
        const before = tank.hp
        applyDamage(fight, tank, 800, 'physical', { sourceId: boss.id })
        return before - tank.hp
      }
      const inWindow = at(0.5)
      const outOfWindow = at(5)
      expect('a paladin tank runs on a clock', inWindow < outOfWindow * 0.8, `${outOfWindow} -> ${inWindow}`)
    }

    // The bear gives back a slice of whatever lands on it.
    {
      const bear = pickFor('druid', 'tank')!
      const fight = pulled(0x51ed, 0, autoParty(5, bear))
      const tank = fight.actors.find((a) => a.isPlayer)!
      const boss = fight.actors[fight.actors.length - 1]!
      tank.hp = Math.round(tank.maxHp * 0.6)
      applyDamage(fight, tank, 600, 'physical', { sourceId: boss.id })
      expect('a bear starts mending when hit', getAura(tank, 'mending') !== undefined, 'no mending')
    }
  }

  // Every trait has to actually do something, or it is a comment.
  for (const pick of SPEC_OPTIONS) {
    const spec = specOf(pick)
    if (roleOf(pick) !== 'dps') continue
    expect(`${specLabel(pick)} has a trait`, spec.trait !== undefined, 'none')
  }
}

// --- today's run -------------------------------------------------------------
//
// The whole value of a daily is that somebody else played the same one, which
// makes reproducibility a feature rather than a testing property. So what is
// asserted is that a date fixes everything except the class, that it fixes it
// the same way twice, and that neighbouring dates are not neighbouring fights.
{
  const at = new Date(Date.UTC(2026, 7, 21, 13, 45))
  const key = dailyKey(at)
  expect('the key is the date', key === 20260821, `${key}`)

  // Same date, same everything, however many times it is asked.
  const mage = pickFor('mage', 'dps')!
  const first = dailyFor(key, mage)
  const again = dailyFor(key, mage)
  expect(
    'the same day is the same run',
    first.seed === again.seed &&
      first.encounter === again.encounter &&
      first.size === again.size &&
      first.difficulty === again.difficulty &&
      JSON.stringify(first.party) === JSON.stringify(again.party),
    `${first.seed} vs ${again.seed}`,
  )

  // The time of day must not enter into it, or two people in one country get
  // different fights depending on when they opened the page.
  const evening = dailyFor(dailyKey(new Date(Date.UTC(2026, 7, 21, 23, 59))), mage)
  expect('and any hour of it', evening.seed === first.seed, `${evening.seed}`)

  // Different days must not be neighbouring fights: the date is a poor seed on
  // its own, since consecutive days differ by one.
  const tomorrow = dailyFor(dailyKey(new Date(Date.UTC(2026, 7, 22))), mage)
  expect('a different day is a different run', tomorrow.seed !== first.seed, `${tomorrow.seed}`)
  const spread = new Set<string>()
  for (let day = 1; day <= 28; day++) {
    const d = dailyFor(dailyKey(new Date(Date.UTC(2026, 7, day))), mage)
    spread.add(`${d.encounter}/${d.size}/${d.difficulty}`)
  }
  expect('and a month is not one fight', spread.size >= 6, `${spread.size} distinct in 28 days`)

  // The class is the player's, and the rest of the party is the day's.
  const asRogue = dailyFor(key, pickFor('rogue', 'dps')!)
  expect(
    'the day picks the party, you pick the class',
    asRogue.party[0]!.classId === 'rogue' &&
      JSON.stringify(asRogue.party.slice(1)) === JSON.stringify(first.party.slice(1)),
    `${asRogue.party.map((p) => p.classId).join(',')}`,
  )
  expect('and the party is the size the day chose', first.party.length === first.size, `${first.party.length} of ${first.size}`)

  // The record keeps the best answer to a day rather than the last one.
  {
    const run = pulled(first.seed, 0, first.party, first.difficulty, first.encounter)
    run.outcome = 'victory'
    run.time = 140
    let record = foldDaily([], key, run, 'Warden', 'Mage')
    expect('a first attempt is kept', record.length === 1 && record[0]!.time === 140, JSON.stringify(record[0]))

    run.time = 175
    record = foldDaily(record, key, run, 'Warden', 'Mage')
    expect('a slower kill does not replace it', record[0]!.time === 140, `${record[0]!.time}`)
    expect('but it still counts as an attempt', record[0]!.attempts === 2, `${record[0]!.attempts}`)

    run.time = 121
    record = foldDaily(record, key, run, 'Warden', 'Mage')
    expect('a faster kill does', record[0]!.time === 121, `${record[0]!.time}`)

    // A loss never displaces a kill, however close it came.
    run.outcome = 'wipe'
    run.time = 40
    record = foldDaily(record, key, run, 'Warden', 'Mage')
    expect('and a loss never displaces a kill', record[0]!.outcome === 'victory' && record[0]!.time === 121, JSON.stringify(record[0]))
    expect('while still counting', record[0]!.attempts === 4, `${record[0]!.attempts}`)
  }
}

// --- hits look like what threw them ------------------------------------------
//
// Every damaging ability used to produce one expanding ring with six spokes in
// the ability's colour: a fireball, a dagger and an arrow were one picture
// tinted three ways. The picture is what anybody is actually looking at during
// a fight — nobody watches the buttons — so it is the thing that has to say
// which class is hitting.
{
  // Each style has to be reachable from somebody's bar, or it is a table
  // entry nothing uses.
  const styles = new Map<string, string[]>()
  for (const option of SPEC_OPTIONS) {
    for (const id of abilityBar(option)) {
      const ability = ABILITIES[id]!
      if (ability.kind !== 'damage') continue
      const style = hitStyleFor(id)
      styles.set(style, [...(styles.get(style) ?? []), specLabel(option)])
    }
  }
  for (const style of ['burst', 'cleave', 'pierce', 'crush', 'wither'] as const) {
    expect(`somebody hits with a ${style}`, (styles.get(style) ?? []).length > 0, 'nobody does')
  }

  // And the classes are not all drawing the same one.
  const perSpec = new Map<string, Set<string>>()
  for (const option of SPEC_OPTIONS) {
    if (roleOf(option) !== 'dps') continue
    const set = new Set<string>()
    for (const id of abilityBar(option)) {
      if (ABILITIES[id]!.kind === 'damage') set.add(hitStyleFor(id))
    }
    perSpec.set(specLabel(option), set)
  }
  const signatures = new Set([...perSpec.values()].map((set) => [...set].sort().join('+')))
  expect(
    'the damage specs do not all hit alike',
    signatures.size >= 4,
    `${signatures.size} distinct hit signatures across ${perSpec.size} specs`,
  )

  // The picture actually changes: two styles must not draw the same shapes.
  const shapesFor = (abilityId: string, empowered: boolean): string => {
    const effects = new Effects()
    effects.ingest({
      effects: [
        {
          kind: 'impact' as const,
          pos: { x: 0, y: 0 },
          angle: 0.4,
          abilityId,
          power: 200,
          crit: false,
          empowered,
        },
      ],
    } as unknown as SimState)
    const boxes: BarBox[] = []
    const strokes: string[] = []
    const ctx = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'arc') {
            return (_x: number, _y: number, r: number, from: number, to: number) =>
              strokes.push(`arc ${r.toFixed(0)} ${(to - from).toFixed(2)}`)
          }
          if (prop === 'moveTo' || prop === 'lineTo') {
            return (x: number, y: number) => strokes.push(`line ${x.toFixed(0)},${y.toFixed(0)}`)
          }
          return () => {}
        },
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D
    effects.age(0.05)
    effects.draw(ctx, (p) => p, 1)
    void boxes
    return strokes.join('|')
  }

  const cleave = shapesFor('sinister_strike', false)
  const pierce = shapesFor('steady_shot', false)
  const burst = shapesFor('frostbolt', false)
  expect('a blade does not draw what a bolt draws', cleave !== pierce, cleave.slice(0, 60))
  expect('nor what a spell draws', cleave !== burst, burst.slice(0, 60))
  expect('and a bolt does not draw a spell', pierce !== burst, pierce.slice(0, 60))

  // An empowered hit is visibly more than an ordinary one, which is the whole
  // of what the traits were missing: a finisher on five combo points deals
  // double and looked exactly like one on none.
  const plainHit = shapesFor('eviscerate', false)
  const paidHit = shapesFor('eviscerate', true)
  expect('a hit the trait paid for looks different', plainHit !== paidHit, `${plainHit.length} vs ${paidHit.length}`)
  expect('and it is more rather than less', paidHit.length > plainHit.length, `${plainHit.length} -> ${paidHit.length}`)
}

// --- the descent -------------------------------------------------------------
//
// One attempt, boss after boss, each harder than the last. The rules that
// matter: it gets harder, it starts easier than a raid, the bosses come round
// rather than running out, and a floor cleared always has another below it.
{
  expect(
    'each floor is harder than the one above',
    [1, 2, 3, 5, 8, 12].every((d, i, all) => i === 0 || descentHealth(d) > descentHealth(all[i - 1]!)) &&
      [1, 2, 3, 5, 8, 12].every((d, i, all) => i === 0 || descentDamage(d) > descentDamage(all[i - 1]!)),
    `${[1, 5, 12].map((d) => descentHealth(d).toFixed(2)).join(', ')}`,
  )

  // The first floors are below an ordinary pull on purpose: a run that ends on
  // floor one most of the time is a raid with the retry button taken away.
  expect('and the first is easier than a raid', descentHealth(1) < 0.8, `${descentHealth(1).toFixed(2)}`)
  expect('while the fifth is not', descentHealth(5) >= 1, `${descentHealth(5).toFixed(2)}`)

  // The bosses come round rather than running out.
  const floors = Array.from({ length: 9 }, (_, i) => descentEncounter(i + 1))
  expect(
    'the bosses come round',
    new Set(floors).size === ENCOUNTERS.length && floors[0] === floors[ENCOUNTERS.length],
    floors.join(','),
  )

  // A cleared floor always has another below it, however deep — where a raid
  // eventually runs out of bosses and stops offering.
  const deep = pulled(0x51ed, 0, autoParty(5, pickFor('mage', 'dps')!), 'normal', ENCOUNTERS.length - 1, null, 7)
  deep.outcome = 'victory'
  expect('a descent always goes deeper', canAdvance(deep), 'it offered no floor')
  const lastRaid = pulled(0x51ed, 0, autoParty(5, pickFor('mage', 'dps')!), 'normal', ENCOUNTERS.length - 1)
  lastRaid.outcome = 'victory'
  expect('a raid still runs out', !canAdvance(lastRaid), 'the last boss offered another')

  // Depth is carried by the fight rather than by the screen, and an ordinary
  // pull has none.
  expect('a descent knows its floor', deep.depth === 7, `${deep.depth}`)
  expect('an ordinary pull has no floor', lastRaid.depth === 0, `${lastRaid.depth}`)

  // The boss at a depth is actually bigger, which is what the multiplier is
  // for — read off the actor rather than the function.
  const shallow = pulled(0x51ed, 0, autoParty(5, pickFor('mage', 'dps')!), 'normal', 0, null, 1)
  const deeper = pulled(0x51ed, 0, autoParty(5, pickFor('mage', 'dps')!), 'normal', 0, null, 9)
  expect(
    'and it is built with more health',
    boss(deeper).maxHp > boss(shallow).maxHp * 1.5,
    `${boss(shallow).maxHp} -> ${boss(deeper).maxHp}`,
  )
}

// --- affixes -----------------------------------------------------------------
//
// Each one has to change the fight, and none of them may touch a fight that
// did not ask for one: a raid being learned has to be the same on the ninth
// pull as on the first, so an affix that leaked into ordinary play would undo
// the reason the boss is a script at all.
{
  const play = (affix: AffixId | null, seconds: number) => {
    const fight = createState(0x51ed, 8, autoParty(5, pickFor('mage', 'dps')!), 'normal', 0, affix)
    fight.countdown = 0
    const rng = new Rng(0x51ed)
    let adds = 0
    let lingerTicks = 0
    let healing = 0
    let rotDamage = 0
    let enraged = false
    let spreadReach = 0

    while (fight.outcome === 'ongoing' && fight.time < seconds) {
      const before = new Map(fight.actors.map((a) => [a.id, a.hp]))
      step(fight, { moveX: 0, moveY: 0, pressed: [] }, rng)
      adds = Math.max(adds, fight.actors.filter((a) => a.faction === 'boss' && a.alive).length - 1)
      lingerTicks += fight.ground.filter((g) => g.kind === 'puddle' && g.detonated).length
      if (boss(fight).auras.some((a) => a.id === 'enrage')) enraged = true
      for (const a of fight.actors) {
        const was = before.get(a.id)
        if (was === undefined) continue
        if (a.hp > was) healing += a.hp - was
        if (a.hp < was && getAura(a, 'rot')) rotDamage += was - a.hp
      }
      const carrier = fight.actors.find((a) => getAura(a, 'spread'))
      if (carrier) {
        spreadReach = Math.max(
          spreadReach,
          fight.actors.filter(
            (a) => a.faction === 'party' && a.alive && dist(a.pos, carrier.pos) <= SPREAD_RADIUS * 1.5,
          ).length,
        )
      }
    }
    return { adds, lingerTicks, healing, rotDamage, enraged, spreadReach }
  }

  const plain = play(null, 150)

  expect('swarming brings more', play('swarming', 150).adds > plain.adds, `${plain.adds}`)
  expect(
    'lingering leaves more on the floor',
    play('lingering', 150).lingerTicks > plain.lingerTicks * 1.3,
    `${plain.lingerTicks}`,
  )
  expect('faltering heals for less', play('faltering', 120).healing < plain.healing * 0.95, `${plain.healing}`)
  // Measured on its own rather than inside a pull: everything else the boss
  // does lands on the same health bar, and a whole fight's worth of that
  // drowned the difference the first time this was written.
  {
    const rotOnly = (affix: AffixId | null): number => {
      const fight = createState(0x51ed, 0, autoParty(5, pickFor('mage', 'dps')!), 'normal', 0, affix)
      fight.countdown = 0
      const victim = fight.actors.find((a) => a.faction === 'party' && !a.isPlayer)!
      // Far from anything the boss can reach, so the only thing touching this
      // health bar is the dot.
      victim.pos = { x: 0, y: -430 }
      victim.hp = victim.maxHp
      addAura(victim, 'rot', boss(fight).id)

      const before = victim.hp
      const rng = new Rng(1)
      for (let i = 0; i < 30 * 6; i++) {
        victim.pos = { x: 0, y: -430 }
        step(fight, { moveX: 0, moveY: 0, pressed: [] }, rng)
      }
      return before - victim.hp
    }
    const bare = rotOnly(null)
    const festering = rotOnly('festering')
    // Half again, not double: the affixes are levelled against each other and
    // this one was the heaviest of the eight before it came down.
    expect('festering bites harder', festering > bare * 1.4, `${bare} -> ${festering}`)
  }

  // The enrage lands early enough to be the thing that ends a slow pull.
  const hastened = createState(0x51ed, 8, autoParty(5, pickFor('mage', 'dps')!), 'normal', 0, 'hastened')
  hastened.countdown = 0
  hastened.time = encounterAt(hastened.encounter).enrage - 20
  step(hastened, { moveX: 0, moveY: 0, pressed: [] }, new Rng(1))
  expect(
    'hastened brings the enrage forward',
    boss(hastened).auras.some((a) => a.id === 'enrage'),
    'not enraged twenty seconds early',
  )
  expect('and an ordinary pull is not enraged there', !plain.enraged, 'enraged without an affix')

  // Every affix in the list has to be reachable and say what it does.
  for (const affix of AFFIXES) {
    expect(`${affix.name} explains itself`, affix.detail.length > 8, affix.detail)
  }

  // Nothing carries an affix unless it was asked for.
  const ordinary = pulled(0x51ed, 0)
  expect('an ordinary pull has none', ordinary.affix === null, `${ordinary.affix}`)
  const bg = createBattlegroundState(0x51ed, 'conquest')
  expect('nor does a battleground', bg.affix === null, `${bg.affix}`)

  // And a daily always has one, drawn from the same day as everything else.
  const today = dailyFor(20260821, pickFor('mage', 'dps')!)
  expect('a daily always has one', AFFIXES.some((a) => a.id === today.affix), `${today.affix}`)
  expect(
    'the same day is the same affix',
    dailyFor(20260821, pickFor('rogue', 'dps')!).affix === today.affix,
    'it moved with the class',
  )
}

// --- a bar over the hurt, and over nobody else -------------------------------
//
// Always-on bars are twenty-seven of them in a twenty-five man, which is
// wallpaper: the party frames already carry that in a grid. What is asserted
// here is that the bar appears when somebody drops below full and not before,
// because "shows up exactly when it matters" is the whole of its value.
{
  updateLayout(1440, 900)
  const s = pulled(0x51ed, 0, autoParty(5, pickFor('mage', 'dps')!))
  const player = s.actors.find((a) => a.isPlayer)!

  // A frame drawn with everyone at full: no bar anywhere.
  for (const a of s.actors) a.hp = a.maxHp
  const healthy: BarBox[] = []
  drawWorld(recordingBoxes(healthy), s, 1, 1.5, new Effects())
  const bars = (boxes: BarBox[]) => boxes.filter((b) => b.kind === 'fillRect' && b.h === 3)
  expect('nobody at full health carries a bar', bars(healthy).length === 0, `${bars(healthy).length}`)

  // One of them hurt: exactly one bar.
  const patient = s.actors.find((a) => a.faction === 'party' && !a.isPlayer)!
  patient.hp = Math.round(patient.maxHp * 0.5)
  const oneHurt: BarBox[] = []
  drawWorld(recordingBoxes(oneHurt), s, 1, 1.5, new Effects())
  expect('one hurt body carries one bar', bars(oneHurt).length === 1, `${bars(oneHurt).length}`)

  // And its length tracks the health rather than being decoration.
  const half = bars(oneHurt)[0]!
  patient.hp = Math.round(patient.maxHp * 0.2)
  const nearlyDead: BarBox[] = []
  drawWorld(recordingBoxes(nearlyDead), s, 1, 1.5, new Effects())
  const short = bars(nearlyDead)[0]!
  expect('and the bar is shorter when the health is', short.w < half.w * 0.6, `${half.w.toFixed(0)} -> ${short.w.toFixed(0)}`)

  // The dead do not carry one either.
  patient.alive = false
  const dead: BarBox[] = []
  drawWorld(recordingBoxes(dead), s, 1, 1.5, new Effects())
  expect('the dead carry none', bars(dead).length === 0, `${bars(dead).length}`)
  void player
}

// --- the boss throws more than one kind of thing -----------------------------
//
// Everything it did was magic except its weapon, so armour was a line in the
// class table rather than a reason to bring anybody: a plate dealer took the
// same mechanic damage as a mage in cloth. The sweep is the one thing armour
// answers, and the rot is the one it cannot touch, so no stat block is the
// whole answer to a fight.
{
  const s = pulled(0x51ed, 0, [
    pickFor('warrior', 'dps')!,
    pickFor('warrior', 'tank')!,
    pickFor('priest', 'healer')!,
    pickFor('mage', 'dps')!,
    pickFor('rogue', 'dps')!,
  ])
  const rng = new Rng(0x51ed)
  const plate = s.actors.find((a) => a.classId === 'warrior' && a.role === 'dps')!
  const cloth = s.actors.find((a) => a.classId === 'mage')!
  const boss = s.actors[s.actors.length - 1]!

  // Both standing the same distance from the boss, so only the armour differs.
  plate.pos = { x: boss.radius + 60, y: 0 }
  cloth.pos = { x: boss.radius + 60, y: 40 }
  plate.hp = plate.maxHp
  cloth.hp = cloth.maxHp

  let sawSweep = false
  let sawRot = false
  let plateTook = 0
  let clothTook = 0

  while (s.time < 120 && !(sawSweep && sawRot)) {
    const plateBefore = plate.hp
    const clothBefore = cloth.hp
    step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    plate.pos = { x: boss.pos.x + boss.radius + 60, y: boss.pos.y }
    cloth.pos = { x: boss.pos.x + boss.radius + 60, y: boss.pos.y + 40 }

    if (s.chat.some((line) => line.text === 'Sweeping' && line.age < 0.1)) {
      sawSweep = true
      plateTook = plateBefore - plate.hp
      clothTook = clothBefore - cloth.hp
    }
    if (s.actors.some((a) => getAura(a, 'rot'))) sawRot = true
    plate.hp = plate.maxHp
    cloth.hp = cloth.maxHp
  }

  expect('the boss sweeps', sawSweep, 'no sweep in two minutes')
  expect('and rots somebody', sawRot, 'no rot in two minutes')
  expect(
    'plate takes less of the sweep than cloth',
    plateTook > 0 && plateTook < clothTook * 0.85,
    `plate ${plateTook}, cloth ${clothTook}`,
  )

  // The rot is magic, so armour must make no difference to it at all.
  const rotTick = AURA_TICK.rot?.damage ?? 0
  const rotOnPlate = (() => {
    plate.hp = plate.maxHp
    const before = plate.hp
    applyDamage(s, plate, rotTick, 'none', { sourceId: boss.id, silent: true })
    return before - plate.hp
  })()
  const rotOnCloth = (() => {
    cloth.hp = cloth.maxHp
    const before = cloth.hp
    applyDamage(s, cloth, rotTick, 'none', { sourceId: boss.id, silent: true })
    return before - cloth.hp
  })()
  expect('and the rot does not care about armour', rotOnPlate === rotOnCloth, `${rotOnPlate} vs ${rotOnCloth}`)
}

// --- everything that has to reach the boss can -------------------------------
//
// A tank that cannot get back to what wandered off is a tank whose raid is
// being eaten while it jogs. Both rage tanks carry a charge; both refuse to
// spend it from inside melee, where it would buy nothing.
{
  const chargers = SPEC_OPTIONS.filter((option) => {
    const spec = specOf(option)
    return spec.role === 'tank' && spec.resource === 'rage'
  })
  expect('the rage tanks are the ones that charge', chargers.length >= 2, `${chargers.length}`)

  for (const pick of chargers) {
    const spec = specOf(pick)
    const mobility = spec.abilities.mobility
    expect(`${specLabel(pick)} carries a charge`, mobility !== null, 'none')
    if (!mobility) continue

    const ability = ABILITIES[mobility]!
    expect(`${specLabel(pick)}: it is a charge`, ability.kind === 'charge', ability.kind)
    expect(`${specLabel(pick)}: it is free`, ability.cost === 0, `${ability.cost}`)
    expect(
      `${specLabel(pick)}: and refuses to fire from melee`,
      (ability.minRange ?? 0) > MELEE_RANGE,
      `${ability.minRange}`,
    )

    // It has to actually close the gap, and pay for itself in rage.
    const fight = pulled(0x51ed, 0, autoParty(5, pick))
    const runner = fight.actors.find((a) => a.isPlayer)!
    const boss = fight.actors[fight.actors.length - 1]!
    boss.pos = { x: 0, y: 0 }
    runner.pos = { x: 260, y: 0 }
    runner.power = 0
    const gapBefore = dist(runner.pos, boss.pos)
    landAbility(fight, runner, ability, boss.id, new Rng(1))
    const gapAfter = dist(runner.pos, boss.pos)
    expect(`${specLabel(pick)}: it crosses the gap`, gapAfter < gapBefore * 0.5, `${gapBefore.toFixed(0)} -> ${gapAfter.toFixed(0)}`)
    expect(`${specLabel(pick)}: and arrives with rage`, runner.power >= CHARGE_RAGE, `${runner.power}`)
  }
}

// --- leather melee carry their own way out -----------------------------------
{
  // Every leather-wearing melee, found by what they are rather than by asking
  // for "the druid's dps spec" — a druid has two of those and the first one is
  // a caster, which is how the cat quietly went unchecked.
  const leather = SPEC_OPTIONS.filter((option) => {
    const spec = specOf(option)
    return spec.melee && roleOf(option) === 'dps' && CLASSES[option.classId].armorType === 'leather'
  })
  expect('there are leather melee to check', leather.length >= 2, `${leather.length}`)

  for (const pick of leather) {
    const spec = specOf(pick)
    const mobility = spec.abilities.mobility
    expect(`${specLabel(pick)} carries a way out`, mobility !== null, 'none')
    if (!mobility) continue

    const ability = ABILITIES[mobility]!
    expect(`${specLabel(pick)}: it is free`, ability.cost === 0, `${ability.cost}`)
    expect(`${specLabel(pick)}: and on a long cooldown`, ability.cooldown >= 30, `${ability.cooldown}`)

    const fight = pulled(0x51ed, 0, autoParty(5, pick))
    const runner = fight.actors.find((a) => a.isPlayer)!
    const rng = new Rng(1)
    const before = runner.moveSpeed * hasteOf(runner)
    landAbility(fight, runner, ability, runner.id, rng)
    const after = runner.moveSpeed * hasteOf(runner)
    expect(`${specLabel(pick)}: and it actually moves you faster`, after > before * 1.2, `${before} -> ${after}`)

    // Brief: it is one exit and one return, not a way to play the fight.
    const aura = getAura(runner, 'sprint')
    expect(`${specLabel(pick)}: but not for long`, (aura?.duration ?? 0) <= 8, `${aura?.duration}`)
  }
}

// --- autocast ---------------------------------------------------------------
//
// It presses the player's own bar for them, so the one thing it must never do
// is press something the bar would have drawn as unusable — a rotation that
// fires through cooldowns is not help, it is a different game.
{
  const s = pulled(0x51ed, 8, autoParty(5, pickFor('mage', 'dps')!))
  const rng = new Rng(0x51ed)
  const player = s.actors.find((a) => a.isPlayer)!
  const bar = abilityBar({ classId: player.classId, spec: player.spec })

  // Nothing before the pull starts.
  const waiting = pulled(0x51ed, 0)
  waiting.countdown = 30
  expect('autocast waits for the pull', autoPress(waiting).length === 0, `${autoPress(waiting)}`)

  let presses = 0
  let illegal = 0
  let ticks = 0
  while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
    const pressed = autoPress(s)
    presses += pressed.length

    for (const slot of pressed) {
      const id = bar[slot]
      const ability = id ? ABILITIES[id] : undefined
      // Every press has to be one the bar itself would light up.
      if (!ability) illegal++
      else if (slotStatus(s, player, ability.id) !== 'ready') illegal++
    }
    // Never more than one thing per tick: the global cooldown makes the second
    // one a wasted press, and two heals on one tick is two heals paid for.
    if (pressed.length > 1) illegal++

    // Walked toward the boss rather than left at the spawn: autocast refuses
    // anything out of range, and a caster standing where it started is out of
    // range for most of a fight. Standing still measures the walk, not the
    // rotation.
    const boss = s.actors[s.actors.length - 1]!
    const dx = boss.pos.x - player.pos.x
    const dy = boss.pos.y - player.pos.y
    const gap = Math.hypot(dx, dy)
    const closing = gap > 200
    step(
      s,
      { moveX: closing ? dx / gap : 0, moveY: closing ? dy / gap : 0, pressed },
      rng,
    )
    ticks++
  }

  // Roughly a press per global cooldown, allowing for the ones spent moving,
  // dead or waiting on a cast.
  const globals = ticks / (GLOBAL_COOLDOWN * 30)
  // Not every global, and not close to it for a caster: a mage's filler is a
  // 1.4s cast, autocast refuses casts while walking, and the boss moves — so a
  // mage chasing it presses only what is instant. That is the spec working as
  // intended rather than autocast failing, and the number this guards is
  // "presses at all, steadily" rather than "presses on the global".
  expect(
    'autocast presses steadily',
    presses > globals * 0.28,
    `${presses} presses over ${globals.toFixed(0)} globals`,
  )
  expect('and never an unusable one', illegal === 0, `${illegal} illegal presses`)
  expect(
    'and the fight resolves',
    s.outcome !== 'ongoing',
    `${s.outcome} at ${s.time.toFixed(0)}s`,
  )

  // It has to be worth turning on. The same seeds, the same party, against the
  // stand-in that presses one button on a loop.
  const played = (auto: boolean) => {
    let damage = 0
    for (let n = 0; n < 6; n++) {
      const seed = 1000 + n * 137
      const run = pulled(seed, 8, autoParty(5, pickFor('mage', 'dps')!))
      const runRng = new Rng(seed)
      let tick = 0
      while (run.outcome === 'ongoing' && run.time < encounterAt(run.encounter).enrage + 60) {
        const pressed = auto ? autoPress(run) : tick % 45 === 0 ? [0] : []
        // Both sides walk the same way, so the comparison is about the presses.
        const own = run.actors.find((a) => a.isPlayer)!
        const target = run.actors[run.actors.length - 1]!
        const dx = target.pos.x - own.pos.x
        const dy = target.pos.y - own.pos.y
        const gap = Math.hypot(dx, dy) || 1
        const closing = gap > 200
        step(
          run,
          { moveX: closing ? dx / gap : 0, moveY: closing ? dy / gap : 0, pressed },
          runRng,
        )
        tick++
      }
      const own = run.actors.find((a) => a.isPlayer)!
      damage += run.tally[own.id]?.damage ?? 0
    }
    return damage
  }
  const manual = played(false)
  const auto = played(true)
  expect('and beats mashing one button', auto > manual * 1.2, `${auto} vs ${manual}`)

  // A healer, asked directly rather than by playing a whole fight: a scripted
  // healer that never dodges is dead twenty seconds in, and what that measures
  // is standing still.
  {
    const healed = pulled(0x51ed, 0, autoParty(5, pickFor('priest', 'healer')!))
    healed.countdown = 0
    const medic = healed.actors.find((a) => a.isPlayer)!
    const bar = abilityBar({ classId: medic.classId, spec: medic.spec })
    const kit = specOf({ classId: medic.classId, spec: medic.spec }).abilities
    const patient = healed.actors.find((a) => a.faction === 'party' && !a.isPlayer)!
    patient.pos = { ...medic.pos }

    expect('a healer with nobody hurt presses nothing', autoPress(healed).length === 0, `${autoPress(healed)}`)

    patient.hp = patient.maxHp * 0.7
    const routine = autoPress(healed)
    // Either the routine heal or the over-time — putting the mend up first is
    // the efficient play, and which of the two comes first is the healer's
    // trait rather than a rule this check gets to make.
    expect(
      'a hurt ally gets a heal',
      routine.length === 1 && [kit.filler, kit.overTime].includes(bar[routine[0]!]!),
      `${routine.map((i) => bar[i]).join(',')}`,
    )

    patient.hp = patient.maxHp * 0.2
    const urgent = autoPress(healed)
    expect(
      'and a dying one gets the big one',
      urgent.length === 1 && bar[urgent[0]!] === kit.finisher,
      `${urgent.map((i) => bar[i]).join(',')}`,
    )

    // Whatever it wants, it cannot press through a cooldown.
    medic.cooldowns[kit.finisher!] = 8
    const afterCooldown = autoPress(healed)
    expect(
      'a cooldown is not pressed through',
      afterCooldown.every((i) => bar[i] !== kit.finisher),
      `${afterCooldown.map((i) => bar[i]).join(',')}`,
    )

    medic.gcd = 1
    expect('nor a global', autoPress(healed).length === 0, `${autoPress(healed)}`)
    medic.gcd = 0

    // Out of range is out of range, even for a heal.
    patient.pos = { x: 4000, y: 4000 }
    expect('and not across the map', autoPress(healed).length === 0, `${autoPress(healed)}`)
  }
}

// --- a share is an invitation, so the link has to survive the trip ----------
//
// There is no server here: the fight is not stored anywhere, it is rebuilt
// from the seed. That makes a link the whole of what is shared, and a link
// that decodes to a different fight than it encoded is worse than no share at
// all — two people compare times on what they think is the same boss.
{
  updateLayout(1440, 900)

  const day = parseInvite(dailyLink(20260820))
  expect('a daily link comes back as its day', day?.day === 20260820, JSON.stringify(day))

  for (const size of [5, 10, 25] as const) {
    for (const difficulty of ['normal', 'heroic'] as const) {
      const id = ENCOUNTERS[1]!.id
      const back = parseInvite(fightLink(id, size, difficulty))
      expect(
        `a ${size}-player ${difficulty} link comes back whole`,
        back?.boss === id && back.size === size && back.difficulty === difficulty,
        JSON.stringify(back),
      )
    }
  }

  // Anything a stranger can type is something a stranger will type. A link
  // that decodes to nothing sends you to the front page, which is fine; one
  // that decodes to a boss that does not exist crashes the lookup.
  for (const junk of ['', '#', '#nonsense', '#b=notaboss', '#d=17', '#d=99999999', '#s=7']) {
    expect(`"${junk}" invites nobody anywhere`, parseInvite(junk) === null, JSON.stringify(parseInvite(junk)))
  }

  // A size the game cannot field, alongside a boss it can, must not become a
  // party of seven.
  const odd = parseInvite('#b=' + ENCOUNTERS[0]!.id + '&s=7&h=2')
  expect('an impossible size is dropped, not honoured', odd?.boss !== undefined && odd.size === undefined, JSON.stringify(odd))

  // The message is what somebody else reads. It has to carry the link, or the
  // invitation is only a boast.
  const today = dailyFor(20260820, { classId: 'mage', spec: 'frost' })
  const message = dailyMessage(today, undefined)
  expect('the daily message carries its link', message.includes(dailyLink(20260820)), message)
  expect('and says it is unattempted', message.includes('not attempted'), message)

  // The front page's share is about the game rather than a fight, so it has no
  // fragment to decode — but it must not claim a record that is not there.
  const nothing = gameMessage({ kills: {}, clean: {}, depth: 0, damage: 0 })
  expect(
    'a first-time share claims nothing',
    !nothing.includes('bosses down') && !nothing.includes('floor'),
    nothing,
  )
  const some = gameMessage({
    kills: { [ENCOUNTERS[0]!.id]: 118.4, [ENCOUNTERS[1]!.id]: 204.25 },
    clean: {},
    depth: 7,
    damage: 0,
  })
  expect('a played share counts the bosses', some.includes(`2 of ${ENCOUNTERS.length} bosses down`), some)
  expect('and the descent', some.includes('deepest floor 7'), some)
  expect(
    'and names the furthest one it has killed',
    some.includes(`${ENCOUNTERS[1]!.name} in 204.3s`),
    some,
  )
  expect('and invites nobody to a fragment', parseInvite(some.split('\n').pop()!) === null, some)

  const kill = killMessage('Aphotic Warden', ENCOUNTERS[0]!.id, 25, 'normal', 132.4, 'Mage DPS', 0)
  expect('a kill message carries its link', kill.includes(fightLink(ENCOUNTERS[0]!.id, 25, 'normal')), kill)
  expect('and the time it took', kill.includes('132.4s'), kill)
}

// --- the share button answers for itself, on both screens ------------------
{
  for (const [label, w, h] of [
    ['desktop 1440x900', 1440, 900],
    ['portrait 390x844', 390, 844],
    ['landscape 844x390', 844, 390],
    ['small portrait 360x640', 360, 640],
  ] as const) {
    updateLayout(w, h)

    // Today's screen: SHARE was carved out of PULL's width, so the two must
    // not overlap. A share that also pulls starts the run you meant to send.
    const daily = dailyLayout()
    expect(
      `${label}: SHARE and PULL do not overlap`,
      daily.share.x + daily.share.w <= daily.start.x,
      JSON.stringify([daily.share, daily.start]),
    )
    expect(
      `${label}: both stay on screen`,
      [daily.share, daily.start, daily.back].every((r) => r.x >= 0 && r.x + r.w <= w && r.y + r.h <= h),
      JSON.stringify([daily.share, daily.start, daily.back]),
    )
    const mid = (r: { x: number; y: number; w: number; h: number }) => [r.x + r.w / 2, r.y + r.h / 2] as const
    expect(`${label}: SHARE answers`, hitDaily(...mid(daily.share))?.kind === 'share', JSON.stringify(hitDaily(...mid(daily.share))))
    expect(`${label}: PULL still answers`, hitDaily(...mid(daily.start))?.kind === 'start', JSON.stringify(hitDaily(...mid(daily.start))))
    expect(`${label}: BACK still answers`, hitDaily(...mid(daily.back))?.kind === 'back', JSON.stringify(hitDaily(...mid(daily.back))))

    // It draws what it is told to say, so a copy that says nothing on its own
    // still says something.
    const labels: Label[] = []
    drawDaily(
      recordingCtx([], labels),
      { label: 'Wednesday', key: 20260820, affix: { name: 'Thin Air', detail: 'less healing' } },
      null,
      0,
      () => ({ text: 'Mage DPS', colour: '#fff' }),
      'COPIED',
    )
    expect(
      `${label}: a pressed share says so`,
      labels.some((l) => l.text.includes('COPIED')),
      labels.map((l) => l.text).join('|'),
    )

    // The front page says what its share did, the same as the other two.
    const homeLabels: Label[] = []
    drawHome(recordingCtx([], homeLabels), 1.5, 'SHARED')
    expect(
      `${label}: the front page share says so too`,
      homeLabels.some((l) => l.text.includes('SHARED')),
      homeLabels.map((l) => l.text).join('|'),
    )

    // The results screen: only a kill offers one, and it must not be sitting
    // on top of any of the three ways off the screen.
    const killed = pulled(0x51ed, 0, undefined, 'normal', 0)
    killed.outcome = 'victory'
    const wiped = pulled(0x51ed, 0, undefined, 'normal', 0)
    wiped.outcome = 'wipe'
    const rect = outcomeShareRect(killed)
    expect(`${label}: a kill offers a share`, rect !== null, 'it did not')
    expect(`${label}: a wipe does not`, outcomeShareRect(wiped) === null, 'it did')
    if (rect) {
      expect(
        `${label}: the outcome share answers`,
        hitOutcome(rect.x + rect.w / 2, rect.y + rect.h / 2, killed) === 'share',
        `${hitOutcome(rect.x + rect.w / 2, rect.y + rect.h / 2, killed)}`,
      )
      const three = outcomeButtons(canAdvance(killed))
      const clash = [three.next, three.retry, three.party].some(
        (r) => r && r.x < rect.x + rect.w && rect.x < r.x + r.w && r.y < rect.y + rect.h && rect.y < r.y + r.h,
      )
      expect(`${label}: and sits clear of the button row`, !clash, JSON.stringify(rect))
      expect(`${label}: and stays on screen`, rect.x >= 0 && rect.x + rect.w <= w && rect.y + rect.h <= h, JSON.stringify(rect))
    }

    // A wipe's corner is still nothing, which the older check assumed.
    expect(`${label}: a wipe's top right is empty`, hitOutcome(w - 20, 20, wiped) === null, `${hitOutcome(w - 20, 20, wiped)}`)
  }
}

/**
 * How much of a living fight the zoomed background actually shows.
 *
 * The camera has nobody to follow in an unattended fight, so it sits at the
 * middle of the arena and the visible half-width is the screen over the scale
 * over the zoom. Measured rather than eyeballed, because there is no browser
 * here to look at and the difference between two and two and a half turns out
 * to be the difference between a busy background and an occasionally empty
 * one.
 */
function onScreenShare(scene: Ambience, zoom: number): number {
  const alive = scene.showing.actors.filter((a) => a.alive)
  if (alive.length === 0) return 1
  const on = alive.filter(
    (a) => Math.abs(a.pos.x * L.scale * zoom) < L.w / 2 && Math.abs(a.pos.y * L.scale * zoom) < L.h / 2,
  )
  return on.length / alive.length
}

// --- the fight behind the menus --------------------------------------------
//
// Not a video and not a loop of sprites: an actual pull, stepped at the same
// rate as a real one, with the player's slot handed to the AI. That is only
// affordable because the simulation already runs without a screen — but it
// also means every way a real fight can go wrong is a way the front page can
// go wrong, so the things worth asserting are that it is really running, that
// it never sits on a finished fight, and that it stays behind the menu.
{
  updateLayout(1440, 900)
  const scene = new Ambience()

  // It opens in the middle of something. The first twenty seconds of a pull
  // are five people walking in, which is the least interesting footage in the
  // game and the part a background would otherwise show most of.
  expect('a scene opens mid-fight', scene.showing.time > 15, `${scene.showing.time}`)
  expect('and is already ongoing', scene.showing.outcome === 'ongoing', scene.showing.outcome)

  const bossBefore = scene.showing.actors.find((a) => a.faction === 'boss')
  const before = scene.showing.time
  for (let i = 0; i < 120; i++) scene.advance(1 / 60)
  expect('and then runs', scene.showing.time > before, `${before} -> ${scene.showing.time}`)

  // Nobody is playing it, so the party has to be playing itself: if the
  // player's slot were still waiting for input the fight would still progress,
  // but this is the assertion that the AI took the slot over.
  const player = scene.showing.actors.find((a) => a.isPlayer)
  expect('with nobody in it', player === undefined, 'somebody was still the player')
  expect(
    'and everyone in it acting',
    scene.showing.actors.filter((a) => a.faction === 'party').every((a) => a.ai !== null),
    'someone had no ai',
  )

  // A fight nobody is watching makes no sound. Nothing drains the channel on
  // this state, so anything pushed unconditionally would also pile up in it.
  expect('and makes no sound', scene.showing.sounds.length === 0, `${scene.showing.sounds.length}`)

  // Long enough to end several fights and cut past them. A background stuck on
  // a corpse is worse than no background.
  let cuts = 0
  let ended = 0
  let cold = 0
  let lastBoss = bossBefore?.maxHp ?? 0
  // What the zoom costs. Drawn twice as close, the arena's edges go off the
  // screen — which is the point, since there is nothing at the edges worth
  // keeping behind a menu — but a background that is briefly empty because
  // both teams walked out of frame is a background that looks broken.
  const seen: number[] = []
  for (let i = 0; i < 60 * 200; i++) {
    scene.advance(1 / 60)
    if (i % 30 === 0) seen.push(onScreenShare(scene, ZOOM))
    if (scene.showing.outcome !== 'ongoing') ended++
    const boss = scene.showing.actors.find((a) => a.faction === 'boss')
    const mark = boss?.maxHp ?? 0
    if (mark !== lastBoss) {
      cuts++
      // The incoming fight was warmed up while the outgoing one was still on
      // screen. Doing that on the frame of the cut is twenty-two seconds of
      // simulation in one frame, which is a hitch in whatever menu is being
      // read at the time.
      if (scene.showing.time < 15) cold++
    }
    lastBoss = mark
  }
  expect('and cuts to a fight already under way', cold === 0, `${cold} of ${cuts} started cold`)
  const emptiest = Math.min(...seen)
  const typical = seen.reduce((a, b) => a + b, 0) / seen.length
  expect('the zoom never empties the screen', emptiest > 0, `${(emptiest * 100).toFixed(0)}% at its worst`)
  expect(
    'and keeps most of the fight in frame',
    typical > 0.7,
    `${(typical * 100).toFixed(0)}% on average`,
  )
  expect('it never shows a finished fight', ended === 0, `${ended} frames of one`)
  expect('and cuts to another in its own time', cuts > 0, 'it showed one fight for ever')

  // Off is off: no stepping, and a flat fill rather than a dimmed one.
  scene.setEnabled(false)
  const still = scene.showing.time
  for (let i = 0; i < 60; i++) scene.advance(1 / 60)
  expect('switched off, it stops', scene.showing.time === still, `${still} -> ${scene.showing.time}`)

  const circles: Circle[] = []
  scene.draw(recordingCtx(circles))
  expect('and draws nothing', circles.length === 0, `${circles.length} circles`)

  scene.setEnabled(true)
  const lit: Circle[] = []
  scene.draw(recordingCtx(lit))
  expect('switched on, it draws the fight', lit.length > 0, 'the scene was empty')

  // The wash is the whole reason this is usable: the menu is read, and a fight
  // at full brightness behind text is a fight instead of a menu. It has to
  // cover the screen and it has to come last.
  const boxes: BarBox[] = []
  scene.draw(recordingBoxes(boxes))
  const full = boxes.filter((b) => b.x <= 0 && b.y <= 0 && b.w >= L.w && b.h >= L.h)
  expect('the scene is washed out', full.length >= 2, `${full.length} full-screen fills`)
  expect(
    'and the wash goes on last',
    boxes.length > 0 && boxes[boxes.length - 1] === full[full.length - 1],
    'something was drawn over the wash',
  )

  // The scene sits closer than the game does, and the zoom stays behind the
  // menu: a transform left open here would put every button on the screen at
  // twice the size and half of them off the edge of it.
  const moves: string[] = []
  const transforms: number[][] = []
  const spy = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'save' || prop === 'restore') return () => moves.push(String(prop))
        if (prop === 'scale') {
          return (x: number, y: number) => {
            moves.push('scale')
            transforms.push([x, y])
          }
        }
        if (prop === 'measureText') return () => ({ width: 10 })
        if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
          return () => ({ addColorStop: () => {} })
        }
        if (prop === 'canvas') return { width: L.w, height: L.h }
        return () => {}
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D
  scene.draw(spy)
  expect('the scene is drawn closer than the game', ZOOM > 1, `${ZOOM}`)
  expect(
    'at the scale it says it is',
    transforms.some(([x, y]) => x === ZOOM && y === ZOOM),
    JSON.stringify(transforms),
  )
  let depth = 0
  let lowest = 0
  for (const move of moves) {
    if (move === 'save') depth++
    if (move === 'restore') depth--
    if (move === 'scale' && depth === 0) lowest++
  }
  expect('and the zoom is put away afterwards', depth === 0, `${depth} saves left open`)
  expect('and never applied outside one', lowest === 0, `${lowest} scales at the top level`)

  // With none installed the menus fill flat, which is what every check that
  // does not ask for a fight has been drawing against all along.
  setAmbience(null)
  const bare: Circle[] = []
  drawBackdrop(recordingCtx(bare))
  expect('no scene means a flat page', bare.length === 0, `${bare.length} circles`)

  setAmbience(scene)
  const dressed: Circle[] = []
  drawHome(recordingCtx(dressed), 1.5)
  expect('an installed scene reaches the front page', dressed.length > 0, 'the page was flat')
  setAmbience(null)
}

if (failures > 0) throw new Error(`${failures} render check(s) failed`)
console.log('all render checks passed')

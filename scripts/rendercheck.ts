import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { ROUND_ARENA, insideRoom, onEdge, pushInside, roomArea, roomHasOutside, roomReach, wallGap } from '../src/sim/room'
import { terrainFaults } from '../src/sim/battleground'
import { everyAuthor } from '../src/credits'
import { BAR_SLOTS } from '../src/input'
import { MAX_CATCHUP_TICKS, advance, type Clock } from '../src/loop'
import { TILT, drawOrder, drawWorld, focusOn } from '../src/render/draw'
import { resetView, viewAngle } from '../src/render/camera'
import { HINT_KEYS } from '../src/render/hints'
import { LPC_ANIMATIONS, LPC_ARMS, LPC_CELLS, LPC_ROW } from '../src/render/lpc'
import { Effects } from '../src/render/effects'
import { allIcons, hitStyleFor, iconFor } from '../src/render/icons'
import {
  MARK_LETTER,
  advanceLabel,
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
import { compositionLayout, drawComposition, hitComposition } from '../src/render/composition'
import {
  begin as beginCompose,
  close as closeCompose,
  legal as legalCompose,
  pressAuto,
  pressReroll,
  pressSlot,
  pressSpec,
  refusal,
  repair,
  summary as composeSummary,
} from '../src/compose'
import { DEFAULT_ZOOM, ZOOM_NAMES, ZOOM_STEPS, setWorldRoom, setZoomLevel, zoomLevel } from '../src/render/theme'
import {
  RAID_FIELDS,
  bgSetupLayout,
  citadelLayout,
  creditsLayout,
  drawBgSetup,
  drawCitadel,
  drawCredits,
  drawHome,
  drawRaidSetup,
  drawSettings,
  hitBgSetup,
  hitCitadel,
  hitCredits,
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
  DEFAULT_PARTY,
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
  RAID_SIZES,
  RESOURCES,
  ROLE_LIMITS,
  healerCount,
  fixedCount,
  roleOf,
  selectInto,
  SPEC_OPTIONS,
  specLabel,
  specOf,
  type DifficultyId,
  type Pick,
  type RaidSize,
} from '../src/sim/classes'
import {
  PROJECTILE_MIN_RANGE,
  addAura,
  AURA_DURATION,
  adds,
  getAura,
  hasteOf,
  holdOrFall,
  stackAura,
  clearAura,
  pushText,
  applyDamage,
  applyHeal,
  boss,
  castBlocker,
  dist,
  landAbility,
  projectileKind,
  resolveAbility,
  topThreatTarget,
  mechanicScale,
} from '../src/sim/combat'
import {
  ARENA_RADIUS,
  CHARGE_RAGE,
  COUNTDOWN,
  COUNTDOWN_TICKS,
  TICK_RATE,
  GLOBAL_COOLDOWN,
  INHALE_MAX,
  PUNGENT_PER_BREATH,
  SLIME_DRY,
  HEALTH,
  CRIT_CHANCE,
  CRIT_MULTIPLIER,
  MELEE_RANGE,
  SHOT_MIN_RANGE,
  SPELL_RANGE,
  MELEE_CALL,
} from '../src/sim/constants'
import {
  ENCOUNTERS,
  encounterAt,
  openDoors,
  encounterKit,
  withRequired,
  MECHANIC_SCALES,
  MECHANIC_NAMES,
  kitCount,
  kitThrough,
  type MechanicId,
  MECHANIC_IDS,
} from '../src/sim/encounters'
import {
  BASE_RADIUS,
  BATTLEGROUNDS,
  FLAG_PICKUP,
  FLAG_TAKE,
  NODE_RADIUS,
  RALLY_RADIUS,
  RALLY_TELEGRAPH,
  carrying,
  held,
  inTerrain,
  living,
  spawnPoint,
  teamOf,
} from '../src/sim/battleground'
import { aiGoal } from '../src/sim/bgai'
import { createBattlegroundState } from '../src/sim/state'
import { CHAMBERS, PASSAGES, citadelPacks, citadelSprings, citadelWorld, hallFor } from '../src/dungeon'
import type { BgKind } from '../src/sim/types'
import { autoPress } from '../src/sim/autocast'
import { dailyFor, dailyKey } from '../src/sim/daily'
import { fold, pageFor } from '../src/notes'
import { AFFIXES, type AffixId } from '../src/sim/affix'
import { fold as foldDaily } from '../src/daily-record'
import { Rng } from '../src/sim/rng'
import { pressTarget, step } from '../src/sim/sim'
import {
  BOSS_ID,
  FIRST_OBJECT_ID,
  PLAYER_ID,
  createCorridorState,
  createState,
  unattended,
} from '../src/sim/state'
import { AWARDS, check as checkAwards, type Earned } from '../src/achievements'
import {
  HISTORY_LIMIT,
  STANDING_LIMIT,
  append,
  damageBoard,
  healingBoard,
  meterBoard,
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
import { gainPower, boss as bossOf } from '../src/sim/combat'
// The AI's own view of the hold, which is the only honest way to ask whether
// one is being kept: the mechanic and the check have to agree about what
// "holding" means, and there is one function that says.
import { DEFAULT_NAME, NAME_MAX, cleanName, nameThePlayer } from '../src/name'

/**
 * Declared up here rather than beside `expect`, which is where it used to be.
 *
 * `expect` is a hoisted function and this is not: a check added above the old
 * declaration ran fine while it passed and died in the temporal dead zone the
 * moment it failed — so the first failure in a new block reported a
 * ReferenceError instead of the claim that broke. The counter has to be older
 * than every check that can reach it.
 */
let failures = 0
import { bossEffect, bossEffectIds } from '../src/render/icons'
import {
} from '../src/sim/boss'
import {
  FIRST_TIER,
  LADDER,
  RUNGS_PER_BOSS,
  bestOpen,
  bossOpen,
  cleared,
  doorOpen,
  hasNextTier,
  isOpen,
  moved,
  nextSetting,
  pressBoss,
  pressDifficulty,
  pressSize,
  rungBuys,
  settle,
  tierAt,
  tierOf,
  type Setting,
} from '../src/progress'
import { Ambience, ZOOM, backdropZoom, drawBackdrop, setAmbience } from '../src/render/ambience'
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
      // The two calls a real canvas refuses, refused here too.
      //
      // This stub records calls and validates none of them, which is right for
      // most of what it does — the point is to run the whole render path in
      // Node — and was wrong for exactly this. A negative radius is not a small
      // circle, it is an exception thrown out of `ellipse` that takes the frame
      // with it, and two of the eight bosses were throwing one on their first
      // second while passing every check in this file. Found by driving the
      // built game in a real browser, which is a thing nobody does on a push.
      //
      // The stack from here names the caller, which is the other half of what
      // this is for: the browser reports a minified frame and no line.
      if (prop === 'ellipse') {
        return (_x: number, _y: number, rx: number, ry: number) => {
          if (!(rx >= 0) || !(ry >= 0)) throw new Error(`ellipse radius ${rx}, ${ry}`)
        }
      }
      if (prop === 'arc') {
        return (_x: number, _y: number, r: number) => {
          if (!(r >= 0)) throw new Error(`arc radius ${r}`)
        }
      }
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

// --- and a frame over a room with nothing in it ------------------------------
//
// The citadel is walked now, so most of an evening is spent in a state with no
// boss in it at all — a room being crossed, and a corridor. Two things drew
// straight through the fight's promise that one exists and threw the frame
// away: the minimap, which marks the boss on it, and the player's own bearing,
// which faces the boss while standing still. Neither is anywhere near the
// citadel in the source, and neither was reachable by any check here, because
// everything above this line pulls a boss first.
//
// So: a whole frame, world and HUD, over both of the states that have none.
{
  const dps = pickFor('warrior', 'dps')!
  for (const [w, h] of VIEWPORTS) {
    updateLayout(w, h)
    for (const [what, ground] of [
      ['a room being crossed', hallFor('crossing', 'rise', () => true)],
      ['held ground', PASSAGES.find((p) => p.corridor)!.corridor!],
    ] as const) {
      const s = createCorridorState(9, autoParty(10, dps), ground, 'normal')
      s.chamber = 'crossing'
      const rng = new Rng(9)
      let drawn = 0
      for (let i = 0; i < 90 && s.outcome === 'ongoing'; i++) {
        step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
        drawWorld(ctx, s, 0.5, s.time, new Effects())
        drawHud(ctx, s, touchView(i % 2 === 0))
        drawn++
      }
      // Terminal too, which is the overlay the walk never shows but must not
      // fall over drawing.
      drawWorld(ctx, s, 1, s.time, new Effects())
      drawHud(ctx, s, touchView(true))
      expect(`${w}x${h}: ${what} draws a whole frame`, drawn > 0, `${drawn} frames`)
    }
  }
  updateLayout(1440, 900)
}

// --- the floor does not turn while you are only walking ---------------------
//
// The view is arranged around the thing you are working on, and crossing a
// building there is not one. It was the nearest door first, which swung the
// whole floor every time the player crossed the middle of a hub; then it was
// whatever had woken up, which is the same thing wearing a corridor's clothes
// — a passage that sends bodies at you turned the world the moment the first
// one appeared, a hall's length away.
//
// It matters more than a camera usually does because this game is read off the
// floor and walked with a stick: press up, and up has to still mean what it
// meant a second ago. The building is laid out so that walking up the screen
// from the entrance reaches the first fight, and a view that rotates on its
// own is that promise withdrawn.
//
// Drawn with something awake and standing on the party, which is the state
// that used to turn it hardest.
{
  const dps = pickFor('warrior', 'dps')!
  const ground = { ...hallFor('threshold', null, () => true), id: 'citadel', packs: citadelPacks(), springs: citadelSprings() }
  const s = createCorridorState(9, autoParty(10, dps), ground, 'normal', 4, undefined, true)
  s.floor = citadelWorld().map((cell) => cell.room)
  s.chamber = 'threshold'
  resetView()
  const rng = new Rng(9)
  let worst = 0
  let woke = 0
  for (let i = 0; i < 30 * 45 && s.outcome === 'ongoing'; i++) {
    step(s, { moveX: 0, moveY: -1, pressed: [] }, rng)
    drawWorld(ctx, s, 0.5, s.time, new Effects())
    worst = Math.max(worst, Math.abs(viewAngle()))
    woke = Math.max(woke, s.actors.filter((a) => a.faction === 'boss' && a.alive).length)
  }
  expect('a raid walking has something to walk into', woke > 0, `${woke} standing`)
  expect(
    'and the view does not turn while it walks',
    worst < 0.001,
    `turned ${((worst * 180) / Math.PI).toFixed(1)} degrees`,
  )
}

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
  const target = bossOf(s)

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
        ['compose', layout.compose] as const,
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
        if (kind === 'compose' && hit.kind !== 'compose') return true
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

// --- the raid may be built by hand, and only into a raid -------------------
//
// The board is the one place a raid the game did not generate can reach a
// pull, so what it may produce is checked here rather than trusted to the
// screen that draws it.
{
  for (const size of [5, 10, 25] as RaidSize[]) {
    const start = autoParty(size, pickFor('mage', 'dps')!)
    expect(`a ${size} starts legal`, legalCompose(beginCompose(start)), composeSummary(start))

    // Opening a slot, giving it something, and getting a legal raid back.
    let c = beginCompose(start)
    c = pressSlot(c, size > 1 ? 1 : 0)
    expect(`a ${size} opens a slot`, c.selected === (size > 1 ? 1 : 0), `${c.selected}`)
    // Pressing the open one again closes it: the board must always be one
    // press away or the list needs a second dismiss target beside the first.
    expect(`a ${size} closes the one it opened`, pressSlot(c, c.selected!).selected === null, 'stayed open')

    // Every spec, into every slot, at every size. What is refused must be
    // refused with a reason, and what is taken must leave a raid that pulls.
    let taken = 0
    let refused = 0
    for (let slot = 0; slot < size; slot++) {
      for (const option of SPEC_OPTIONS) {
        const after = pressSpec(pressSlot(beginCompose(start), slot), option)
        if (after.refused !== null) {
          refused++
          // A refusal keeps the slot open, or the board would look as though
          // the press went through.
          expect_quiet(`a refusal at ${size}/${slot} keeps the slot open`, after.selected === slot)
          expect_quiet(`a refusal at ${size}/${slot} changes nothing`, after.party.every((p, i) => p.classId === start[i]!.classId && p.spec === start[i]!.spec))
          continue
        }
        taken++
        expect_quiet(`a ${size} stays a raid after ${slot}:${option.classId}`, legalCompose(after))
        expect_quiet(`and the slot took it`, after.party[slot]!.classId === option.classId && after.party[slot]!.spec === option.spec)
        expect_quiet(`and the list closed`, after.selected === null)
      }
    }
    expect(
      `every press on a ${size} is answered`,
      taken + refused === size * SPEC_OPTIONS.length && taken > 0,
      `${taken} taken, ${refused} refused`,
    )
    // A five refuses nothing, which is not slack — it is the trade rule.
    // Every role count is fixed there, so there is no legal intermediate
    // state to pass through and a press that changes a slot's role is read as
    // a swap with whoever was holding it. Refusing instead would leave the
    // composition unchangeable. Bigger raids have real slack and take more
    // than they refuse.
    expect(
      `a ${size} ${size === 5 ? 'trades rather than refuses' : 'takes more than it refuses'}`,
      size === 5 ? refused === 0 : taken > refused,
      `${taken} taken, ${refused} refused`,
    )
    if (size === 5) {
      // And the trade is a trade: somebody else moved to pay for it.
      const before = beginCompose(start)
      const dps = start.findIndex((p, i) => i > 0 && roleOf(p) === 'dps')
      const after = pressSpec(pressSlot(before, dps), pickFor('warrior', 'tank')!)
      expect(
        'and a five pays for a new tank with the old one',
        roleOf(after.party[dps]!) === 'tank' &&
          after.party.filter((p) => roleOf(p) === 'tank').length === 1,
        composeSummary(after.party),
      )
    }

    // AUTO and REROLL both have to land on a raid, since both reach a pull.
    expect(`AUTO builds a ${size} that pulls`, legalCompose(pressAuto(beginCompose(start))), 'illegal')
    let seed = 1
    const rolled = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
    for (let i = 0; i < 20; i++) {
      const r = pressReroll(beginCompose(start), rolled)
      expect_quiet(`REROLL builds a ${size} that pulls`, legalCompose(r))
      expect_quiet('and keeps you where you are', r.party[0]!.classId === start[0]!.classId)
    }
    expect(`REROLL builds a ${size} that pulls, twenty times`, true, '')

    // Closing while a slot is open never edits the raid.
    const opened = pressSlot(beginCompose(start), 0)
    expect(
      `closing a ${size} changes nobody`,
      closeCompose(opened).party.every((p, i) => p.classId === start[i]!.classId),
      'the raid moved',
    )

    // A legal raid has nothing to explain; an illegal one must say what it is.
    expect(`a legal ${size} gives no reason`, refusal(start) === null, refusal(start) ?? '')
  }

  // The repair, which is what stops changing your own spec from costing you
  // the raid you built. A twenty-five with two tanks, and you want to be the
  // third: the press has to be taken and the other twenty-four mostly kept.
  {
    const built = autoParty(25, pickFor('mage', 'dps')!)
    const fixed = repair(built, pickFor('warrior', 'tank')!)
    expect('repairing a 25 keeps it a raid', isLegalComposition(fixed), composeSummary(fixed))
    expect(
      'and takes the press',
      fixed[0]!.classId === 'warrior' && roleOf(fixed[0]!) === 'tank',
      specLabel(fixed[0]!),
    )
    const kept = fixed.filter((p, i) => i > 0 && p.classId === built[i]!.classId && p.spec === built[i]!.spec).length
    // A re-roll would keep almost none of them; this is the whole difference.
    expect(
      'and keeps almost everyone it did not have to move',
      kept >= 22,
      `${kept} of 24 kept`,
    )
  }

  // The screen: reachable, on screen, drawing, at every size and viewport —
  // with the list up and with it down, since the list covers the board and a
  // press in that area means two different things.
  for (const [w, h] of [[1440, 900], [390, 844], [844, 390], [360, 640]] as const) {
    updateLayout(w, h)
    for (const size of [5, 10, 25] as RaidSize[]) {
      const closed = beginCompose(autoParty(size, pickFor('priest', 'healer')!))
      const open = pressSlot(closed, size - 1)
      for (const c of [closed, open]) drawComposition(stubCtx(), c)

      const layout = compositionLayout(size)
      const problems: string[] = []
      const onScreen = (r: { x: number; y: number; w: number; h: number }) =>
        r.x >= 0 && r.y >= 0 && r.x + r.w <= w + 0.5 && r.y + r.h <= h + 0.5

      for (const [name, r] of [
        ['back', layout.back] as const,
        ['auto', layout.auto] as const,
        ['reroll', layout.reroll] as const,
      ]) {
        if (!onScreen(r)) problems.push(`${name} off screen`)
        const hit = hitComposition(r.x + r.w / 2, r.y + r.h / 2, closed)
        if (hit?.kind !== name) problems.push(`${name} not reachable`)
      }

      // Every slot, at its own centre, with the list down.
      layout.slots.forEach((r, i) => {
        if (!onScreen(r)) problems.push(`slot ${i} off screen`)
        const hit = hitComposition(r.x + r.w / 2, r.y + r.h / 2, closed)
        if (hit?.kind !== 'slot' || hit.index !== i) problems.push(`slot ${i} not reachable`)
      })

      // And every spec, at its own centre, with the list up. The same points
      // must read as slots when it is down, which is the collision worth
      // checking: one of the two readings is always wrong.
      layout.specs.forEach((r, i) => {
        if (!onScreen(r)) problems.push(`spec ${i} off screen`)
        const hit = hitComposition(r.x + r.w / 2, r.y + r.h / 2, open)
        if (hit?.kind !== 'spec') problems.push(`spec ${i} not reachable`)
        else if (hit.pick.classId !== SPEC_OPTIONS[i]!.classId || hit.pick.spec !== SPEC_OPTIONS[i]!.spec) {
          problems.push(`spec ${i} is somebody else`)
        }
      })

      // A press inside the board area with the list up dismisses rather than
      // reaching the name underneath.
      const mid = hitComposition(w / 2, (layout.boardTop + layout.boardBottom) / 2, open)
      if (mid === null || (mid.kind !== 'spec' && mid.kind !== 'dismiss')) {
        problems.push('the open list leaks to the board')
      }

      console.log(
        problems.length === 0 ? 'ok  ' : 'FAIL',
        `  composition ${w}x${h} ${size}-player: ${layout.slots.length} slots, ${layout.specs.length} specs`,
      )
      if (problems.length > 0) {
        throw new Error(`composition ${w}x${h} ${size}: ${problems.join(', ')}`)
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
        roles.healer > healerCount(size)
      )
    })
    console.log(
      bad.length === 0 ? 'ok  ' : 'FAIL',
      `  ${size}-player rosters stay within 1-2 tanks and 1-${healerCount(size)} healers`,
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
//
// Swept across all five bosses at the top of their ladders rather than run
// six times against the first one, because no single pull has the whole
// vocabulary in it any more — and that is the point of the ladders, so the
// check that guards the vocabulary has to know it. A mechanic nothing throws
// at a heroic twenty-five is a mechanic nothing throws at all.
{
  const seen = new Set<string>()
  let maxPhase = 1
  for (let i = 0; i < ENCOUNTERS.length; i++) {
    const s = pulled(1000 + i * 137, 8, autoParty(25, pickFor('mage', 'dps')!), 'heroic', i)
    const rng = new Rng(1000 + i * 137)
    while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
      step(s, { moveX: 0, moveY: 0, pressed: s.tick % 45 === 0 ? [0, 1, 2] : [] }, rng)
      for (const g of s.ground) {
        // The floor and the mechanic that laid it are not always the same
        // word: a grain is `nucleus` on the ground and `nuclei` on the table.
        seen.add(g.kind === 'nucleus' ? 'nuclei' : g.kind)
      }
      for (const a of s.actors) {
        if (a.faction !== 'boss' || a.id === 100) continue
        // A wave is a body with no name. The named ones are their own
        // mechanics -- a body of a fight that has three, a thing that falls --
        // and counting them as a wave says a boss summons on a rung where it
        // does something else entirely.
        if (a.spawn === undefined || a.spawn === 'beast') seen.add('adds')
        else if (a.spawn === 'ballast') seen.add('ballast')
      }
      // Whatever billed anybody, which is the one detector that needs no list:
      // a mechanic that took health off a raider says its own name on the way
      // past. The floor kinds above and the auras below are for the ones that
      // cost nothing at the instant they land.
      for (const t of Object.values(s.tally)) {
        for (const id of Object.keys(t.byMechanic)) seen.add(id)
      }
      for (const [aura, id] of [
        ['spread', 'spread'],
        ['rot', 'rot'],
        ['sunder', 'sunder'],
        ['championed', 'champion'],
        ['crowned', 'rotation'],
        ['gifted', 'gift'],
        ['souring', 'gift'],
        ['bonded', 'bond'],
        ['aloft', 'flight'],
        ['carrying', 'nuclei'],
        ['bound', 'prison'],
        ['drained', 'thirst'],
        ['infected', 'infection'],
        ['engulfed', 'engulf'],
        ['hunted', 'hunt'],
        ['spiked', 'spike'],
        ['storming', 'bonestorm'],
        ['haunted', 'shade'],
        ['slighted', 'insignificance'],
        ['empowered', 'empower'],
        ['turned', 'dominate'],
        ['gorged', 'inhale'],
        ['swelling', 'bloat'],
        ['spore', 'spore'],
        ['reek', 'vilegas'],
      ] as const) {
        if (s.actors.some((a) => a.auras.some((au) => au.id === aura))) seen.add(id)
      }
      // The one mechanic in the game that never lands on anybody. A gauge does
      // not cast, land, linger or stick to a body: the only evidence it
      // happened is that the number moved. It is also the only rung like that,
      // and the day there is a second one this line is where it will be
      // noticed.
      if (s.gauge > 0) seen.add('siphon')
      // And the other mechanic with no bill and no aura: two small things
      // becoming one leaves nothing behind but a body that has eaten. Only the
      // fifth merging bills anybody, so waiting for damage here would be
      // waiting for the one merging in five that the fight is trying to stop.
      if (s.actors.some((a) => (a.eaten ?? 0) > 0)) seen.add('merge')
      // And the third of them: a rule about where a circle lands leaves no
      // bill, no aura and no floor of its own -- what says it happened is that
      // the circle is following somebody.
      if (s.ground.some((g) => g.kind === 'gather' && g.named !== undefined)) seen.add('chase')
      // A body that turned, on the fight where turning is what the raid did
      // rather than what the clock did. Two mechanics share the aura and say
      // opposite things with it, so which one this was is a fact about the
      // fight rather than about the body.
      if (
        encounterAt(s.encounter).ladder.includes('turning') &&
        s.actors.some((a) => a.faction === 'party' && a.auras.some((au) => au.id === 'turned'))
      ) {
        seen.add('turning')
      }
      maxPhase = Math.max(maxPhase, s.phase)
    }
  }
  // Asked of the roster rather than written out. It was nine names typed in by
  // hand and it went stale the moment the roster changed: five fights left and
  // it was still demanding the pools, the cone and the ring that went with
  // them. What it means is "everything a boss sells, a boss throws", and that
  // reads straight off the table -- so a fight added tomorrow has its rungs
  // guarded without anybody remembering to come back here.
  const want = [
    ...new Set(ENCOUNTERS.flatMap((e) => [...(e.always ?? []), ...e.ladder])),
    // Except the one rung in the game that only happens when the raid fails.
    //
    // Everything else here is something a boss does; this is what is left when
    // the raid did not hand the gift on in time, and a pull the party plays
    // well never contains one. A sweep that demanded it would be a sweep
    // demanding the roster make a mistake, and the day the AI got better at
    // this fight the check would have failed for the best possible reason.
    //
    // It is not unchecked: the block below puts a gift on somebody with
    // nowhere to hand it and asserts that they turn.
  ].filter((id) => id !== 'turning') as string[]
  const missing = want.filter((w) => !seen.has(w))
  console.log(
    missing.length === 0 ? 'ok  ' : 'FAIL',
    `  mechanics fired: ${[...seen].sort().join(', ')} (reached phase ${maxPhase})`,
  )
  if (missing.length > 0) throw new Error(`mechanics never fired: ${missing.join(', ')}`)
}

// --- a boss must wear its phase in its own colour --------------------------
//
// The break is the one moment in a fight that is meant to look like a
// different fight, and the rings it leaves behind were the red every enemy in
// the game shares -- so it looked like the same different fight on all eight.
// Counted rather than eyeballed, because a colour is exactly the kind of thing
// that goes back to a shared constant in a tidy-up and throws nothing.
{
  updateLayout(1440, 900)

  interface Stroke {
    r: number
    style: string
  }

  const strokeRecorder = (out: Stroke[]): CanvasRenderingContext2D => {
    const noop = () => {}
    let pending = 0
    let style = ''
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop) {
        // The path is laid first and the colour set after it, so the radius is
        // held until whatever closes the path asks for it.
        if (prop === 'ellipse') {
          return (_x: number, _y: number, rx: number) => {
            pending = rx
          }
        }
        if (prop === 'arc') {
          return (_x: number, _y: number, r: number) => {
            pending = r
          }
        }
        if (prop === 'stroke') return () => out.push({ r: pending, style })
        if (prop === 'measureText') return () => ({ width: 10 })
        if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
          return () => ({ addColorStop: noop })
        }
        if (prop === 'canvas') return { width: L.w, height: L.h }
        return noop
      },
      set(_t, prop, value) {
        if (prop === 'strokeStyle') style = String(value)
        return true
      },
    }
    return new Proxy({}, handler) as unknown as CanvasRenderingContext2D
  }

  const SHARED_RED = 'rgba(248, 113, 113'
  const wrong: string[] = []
  const accents = new Set<string>()

  for (let i = 0; i < ENCOUNTERS.length; i++) {
    const accent = ENCOUNTERS[i]!.accent
    accents.add(accent)

    // The same frame twice, differing only in how far the fight has turned, so
    // everything the boss draws at every phase cancels out of the difference.
    const at = (phase: number): { own: number; shared: number } => {
      const s = pulled(2200 + i * 137, 8, autoParty(10, pickFor('mage', 'dps')!), 'heroic', i)
      s.phase = phase
      // Long past the turn, so the one-second alarm ring is not in the count.
      s.phaseAt = s.time - 60
      const out: Stroke[] = []
      drawWorld(strokeRecorder(out), s, 1, s.time, new Effects())
      return {
        own: out.filter((x) => x.style === accent).length,
        shared: out.filter((x) => x.style.startsWith(SHARED_RED)).length,
      }
    }

    const first = at(1)
    const last = at(3)
    const short = ENCOUNTERS[i]!.short
    if (last.own - first.own !== 2) {
      wrong.push(`${short}: ${last.own - first.own} rings in its own colour by phase three, wanted 2`)
    }
    if (last.shared > first.shared) {
      wrong.push(`${short}: ${last.shared - first.shared} of them came out the shared red`)
    }
  }

  expect('a boss lays a ring in its own colour for every ground it has given', wrong.length === 0, wrong.join('; '))
  expect('and the roster does not agree on one colour to do it in', accents.size > 1, `${accents.size} distinct accents`)
}

// --- every cast the boss makes must be announced as itself ------------------
//
// The bar named the cone and defaulted everything else to the slam, and there
// are three casts. The third is the shard, which the second boss aims at
// whoever is holding it and whose whole answer is reading this bar and cutting
// the cast -- so the raid was told the interrupt coming at it was a tank slam.
{
  updateLayout(1440, 900)
  const e = ENCOUNTERS.findIndex((x) => x.id === 'whisper')
  const s = pulled(0x5ad0, 8, autoParty(10, pickFor('mage', 'dps')!), 'heroic', e)
  const rng = new Rng(0x5ad0)
  const b = s.actors.find((a) => a.faction === 'boss')!

  let caught = false
  while (s.outcome === 'ongoing' && s.time < 90 && !caught) {
    step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    if (b.castId === 'boss_frostbolt') caught = true
  }
  expect('the second boss gets round to its shard', caught, `castId ${b.castId}`)

  if (caught) {
    const labels: Label[] = []
    drawHud(recordingCtx([], labels), s, touchView(true))
    const text = labels.map((l) => l.text)
    const names = ENCOUNTERS[e]!.names
    expect(
      'and the bar over it says what it is',
      text.includes(names.shard),
      `${names.shard} not among ${text.slice(0, 12).join(' | ')}`,
    )
    expect(
      'and not what the tank slam is called',
      !text.includes(names.slam),
      `the shard was announced as ${names.slam}`,
    )
  }
}

// --- a turned ally must be visible as one -----------------------------------
//
// The one mechanic in the game that asks a raid to stop hitting something. The
// body keeps its class colour, its name and its party frame, because which of
// your own it is is the question -- and that was all it kept: nothing on the
// floor said it had turned at all.
{
  updateLayout(1440, 900)
  const e = ENCOUNTERS.findIndex((x) => x.id === 'whisper')
  const s = pulled(0x7047, 8, autoParty(10, pickFor('mage', 'dps')!), 'heroic', e)
  const mate = s.actors.find((a) => a.faction === 'party' && !a.isPlayer && a.role !== 'tank')!

  const before: Circle[] = []
  drawWorld(recordingCtx(before), s, 1, s.time, new Effects())
  addAura(mate, 'turned', BOSS_ID)
  const after: Circle[] = []
  drawWorld(recordingCtx(after), s, 1, s.time, new Effects())

  expect(
    'a turned body is drawn differently from the body it was a second ago',
    after.length > before.length,
    `${before.length} shapes before, ${after.length} after`,
  )
}

// --- what a boss throws must be in the air ----------------------------------
//
// Both halves matter and they pull opposite ways. A boss with nothing in the
// air bills bodies it is nowhere near and the health just goes; a boss that
// throws a bolt for a mechanic answered by the floor is telling the raid to
// watch the wrong thing. The list is the rule in `throwBolt`, written out.
{
  const THROWN = new Set(['boss_raid', 'boss_volley', 'boss_frostbolt', 'boss_rot', 'boss_dominate'])
  const silent: string[] = []
  const stray: string[] = []

  for (let e = 0; e < ENCOUNTERS.length; e++) {
    const s = pulled(4242, 8, autoParty(25, pickFor('mage', 'dps')!), 'heroic', e)
    const rng = new Rng(4242)
    const seen = new Set<string>()
    while (s.outcome === 'ongoing' && s.time < 70) {
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
      for (const p of s.projectiles) {
        if (p.sourceId !== BOSS_ID) continue
        seen.add(p.abilityId ?? '(unnamed)')
      }
    }
    if (seen.size === 0) silent.push(ENCOUNTERS[e]!.short)
    for (const id of seen) if (!THROWN.has(id)) stray.push(`${ENCOUNTERS[e]!.short}: ${id}`)
  }

  expect('every boss puts something in the air', silent.length === 0, silent.join(', '))
  expect('and only what it actually throws', stray.length === 0, stray.join(', '))
}

// --- the one that came back wrong must happen, and be killed first ----------
//
// Two failures that hid each other. Its beat ran alongside the summoning one
// rather than off it -- forty-seven seconds against forty-four, independent --
// and when it came round to an empty floor it reset anyway, so over five pulls
// where fifteen were due it fired twice. And the twice it fired, the raid
// killed it last: a rotation aims at the summon with the least health left,
// and empowering one gives it more and fills it, so marking the dangerous body
// also marked it as the last one anybody would aim at.
{
  const e = ENCOUNTERS.findIndex((x) => x.id === 'whisper')
  let fired = 0
  let died = 0
  let last = 0

  for (const seed of [11, 22, 33, 44, 55]) {
    const s = unattended(createState(seed, 8, autoParty(25, pickFor('mage', 'dps')!), 'heroic', e))
    s.countdown = 0
    const rng = new Rng(seed)
    const watch = new Set<number>()
    const peers = new Map<number, number[]>()
    while (s.outcome === 'ongoing' && s.time < 140) {
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
      for (const a of adds(s)) {
        if (!getAura(a, 'empowered') || watch.has(a.id)) continue
        watch.add(a.id)
        fired++
        peers.set(a.id, adds(s).filter((x) => x.id !== a.id).map((x) => x.id))
      }
      for (const id of [...watch]) {
        const one = s.actors.find((x) => x.id === id)
        if (one && one.alive) continue
        died++
        const wave = (peers.get(id) ?? []).map((pid) => s.actors.find((x) => x.id === pid))
        if (wave.length > 0 && wave.every((x) => !x || !x.alive)) last++
        watch.delete(id)
      }
    }
  }

  expect('the wave brings one back wrong, often', fired >= 10, `${fired} in five pulls`)
  expect(
    'and the raid does not leave it for last',
    died > 0 && last / died < 0.4,
    `${last} of ${died} died after their whole wave`,
  )

  // And a body cannot be told to kill one it cannot pick out.
  const s = pulled(0x3117, 8, autoParty(10, pickFor('mage', 'dps')!), 'heroic', e)
  const rng = new Rng(0x3117)
  while (s.outcome === 'ongoing' && adds(s).length === 0 && s.time < 60) {
    step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  }
  const one = adds(s)[0]
  expect('a wave turns up to mark', one !== undefined, `${adds(s).length} adds by ${s.time.toFixed(0)}s`)
  if (one) {
    const plain: Circle[] = []
    drawWorld(recordingCtx(plain), s, 1, s.time, new Effects())
    addAura(one, 'empowered', BOSS_ID)
    const marked: Circle[] = []
    drawWorld(recordingCtx(marked), s, 1, s.time, new Effects())
    expect(
      'and the wrong one is drawn as the wrong one',
      marked.length > plain.length,
      `${plain.length} shapes before, ${marked.length} after`,
    )
  }
}

// --- every rung a boss sells must introduce itself once ----------------------
//
// The card module's own first line: a mechanic you have never seen named is
// just an unexplained death. It was true of the first boss's three and of
// nothing else -- the second boss sold eight demands and named one of them, so
// a raid met seven things it had no word for on the fight straight after the
// one that teaches it what a card means.
{
  const named = new Set(HINT_KEYS)
  const missing: string[] = []
  for (const e of [ENCOUNTERS.findIndex((x) => x.id === 'marrow'), ENCOUNTERS.findIndex((x) => x.id === 'whisper')]) {
    for (const rung of [...(ENCOUNTERS[e]!.always ?? []), ...ENCOUNTERS[e]!.ladder]) {
      if (!named.has(rung)) missing.push(`${ENCOUNTERS[e]!.short}: ${rung}`)
    }
  }
  expect(
    'the first two bosses name everything they sell',
    missing.length === 0,
    missing.join(', '),
  )
}

// --- the raid must be able to kill its own, and mostly not ------------------
//
// The top rung of the second boss asks a raid to stop hitting something, and
// for as long as it existed nothing could hit it: a turned body keeps its
// faction and the raid only ever aimed at the other one, so the demand was a
// rule the engine enforced. Three claims now, and the middle one is the one
// that took the measuring -- with nothing keeping the hits out, twenty-five
// raiders take one of their own off the floor inside the time it takes anybody
// to notice, and the answer went from impossible to fail to impossible to
// pass.
{
  const e = ENCOUNTERS.findIndex((x) => x.id === 'whisper')
  const toll = (attempt: number): { turned: number; killed: number; called: boolean } => {
    let turned = 0
    let killed = 0
    let called = false
    for (const seed of [11, 22, 33, 44, 55]) {
      const s = unattended(
        createState(seed, attempt, autoParty(25, pickFor('mage', 'dps')!), 'heroic', e),
      )
      s.countdown = 0
      const rng = new Rng(seed)
      const watch = new Set<number>()
      while (s.outcome === 'ongoing' && s.time < 130) {
        step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
        for (const a of s.actors) {
          if (a.ai?.striking?.startsWith('hold:')) called = true
          if (a.faction !== 'party' || !getAura(a, 'turned')) continue
          if (!watch.has(a.id)) {
            watch.add(a.id)
            turned++
          }
        }
        for (const id of watch) {
          const a = s.actors.find((x) => x.id === id)!
          if (!a.alive) {
            killed++
            watch.delete(id)
          } else if (!getAura(a, 'turned')) {
            watch.delete(id)
          }
        }
      }
    }
    return { turned, killed, called }
  }

  const green = toll(0)
  expect(
    'a turned body is something the raid can kill',
    green.killed > 0,
    `${green.killed} of ${green.turned} unpractised`,
  )
  expect(
    'and not something it always does',
    green.killed < green.turned,
    `${green.killed} of ${green.turned} unpractised`,
  )
  expect(
    'and the raid is told to stop rather than left to work it out',
    green.called,
    'no body was ever called off a turned one',
  )
}

// --- a storming boss does one thing -----------------------------------------
//
// The original casts nothing but the cold line while it whirls, because
// whirling is what it does *instead of* pinning and *instead of* swinging.
// Both were still going out: two spikes and two slams a storm, and every one
// of those slams named nobody -- the tank target is null for exactly one
// reason and the cast went out on it anyway, so the bar read SABER LASH over a
// thing that had let go of everybody and then landed on nothing.
//
// Two demands the raid cannot both answer is not difficulty. A spike says stop
// and turn round; a storm says do not stop.
{
  const e = ENCOUNTERS.findIndex((x) => x.id === 'marrow')
  const s = pulled(4242, 8, autoParty(10, pickFor('mage', 'dps')!), 'heroic', e)
  const rng = new Rng(4242)
  const b = s.actors.find((a) => a.id === BOSS_ID)!

  let storms = 0
  let spikes = 0
  let slams = 0
  let blind = 0
  let lines = 0
  let pinned = 0
  let wasStorming = false
  let wasCasting: string | null = null

  while (s.outcome === 'ongoing' && s.time < 180) {
    step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    const storming = b.auras.some((x) => x.id === 'storming')
    if (storming && !wasStorming) storms++
    const held = s.actors.filter((a) => a.spawn === 'spike' && a.alive).length
    if (storming) {
      if (held > pinned) spikes++
      if (b.castId === 'boss_slam' && wasCasting !== 'boss_slam') {
        slams++
        if (b.castTargetId === null) blind++
      }
      if (s.ground.some((g) => g.kind === 'coldflame')) lines++
    }
    wasStorming = storming
    pinned = held
    wasCasting = b.castId
  }

  expect('the first boss gets to storm', storms >= 2, `${storms} storms in three minutes`)
  expect('and pins nobody while it does', spikes === 0, `${spikes} spikes inside a storm`)
  expect('and swings at nobody while it does', slams === 0, `${slams} slams inside a storm`)
  expect('and never names a body it is not holding', blind === 0, `${blind} slams named nobody`)
  expect('and the cold line is what it does instead', lines > 0, 'no line during any storm')
}

// --- and a volley must be a volley ------------------------------------------
//
// One shot per body is what the word means, and each shot has to be in the air
// long enough to be looked at. The second half is the one that failed quietly:
// the bolts were all there and, at the range this game actually rings a boss
// at, most of them crossed the gap in two or three frames. A tell that is over
// before anybody looks up is a mechanic that reads as going to the far half of
// the raid and nobody else.
{
  const e = ENCOUNTERS.findIndex((x) => x.id === 'whisper')
  const s = pulled(4242, 8, autoParty(25, pickFor('mage', 'dps')!), 'heroic', e)
  const rng = new Rng(4242)
  const volley = () => s.projectiles.filter((p) => p.abilityId === 'boss_volley')

  let casts = 0
  let worst = Infinity
  const missed: string[] = []

  while (s.outcome === 'ongoing' && s.time < 40) {
    const before = volley().length
    step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    const now = volley()
    if (now.length <= before) continue

    casts++
    const b = s.actors.find((a) => a.id === BOSS_ID)!
    const bodies = s.actors.filter((a) => a.faction === 'party' && a.alive).length
    if (now.length !== bodies) missed.push(`${now.length} bolts for ${bodies} bodies`)
    for (const p of now) {
      const t = s.actors.find((a) => a.id === p.targetId)
      if (!t) continue
      worst = Math.min(worst, Math.hypot(t.pos.x - b.pos.x, t.pos.y - b.pos.y) / p.speed)
    }
  }

  expect('the volley goes out', casts > 0, `${casts} casts in forty seconds`)
  expect('and puts one shot on every body', missed.length === 0, missed.join('; '))
  expect(
    'and none of them is over before it is seen',
    worst >= 0.45,
    `the shortest was in the air ${worst.toFixed(2)}s`,
  )
}

// --- what a body is drawn holding must be in the sheet ----------------------
//
// `src/render/lpc.ts` is generated, and a generated table is exactly the thing
// that comes back thinner after a rebuild with nothing thrown and nobody the
// wiser -- a hand is simply empty. Two bosses carry something on purpose: the
// first drags a two-handed axe and the second holds a staff, and both are
// claims about a sheet that is rebuilt from an art checkout this repo does not
// contain.
{
  const problems: string[] = []
  for (const [id, pairs] of Object.entries(LPC_ARMS)) {
    if (LPC_ROW[id] === undefined) problems.push(`${id} holds something and is not a body`)
    if (pairs.length === 0) problems.push(`${id} has an empty hand`)
    for (const [behind, front] of pairs) {
      for (const row of [behind, front]) {
        for (let block = 0; block < LPC_ANIMATIONS; block++) {
          if (!LPC_CELLS[row * LPC_ANIMATIONS + block]) {
            problems.push(`${id} points at row ${row} block ${block}, which is not in the sheet`)
          }
        }
      }
    }
  }
  expect(
    'everything a body is drawn holding is in the sheet',
    problems.length === 0,
    problems.slice(0, 4).join('; '),
  )

  const armed = ['boss-marrow', 'boss-whisper'].filter((id) => (LPC_ARMS[id] ?? []).length > 0)
  expect(
    'and the two bosses that carry something still do',
    armed.length === 2,
    `armed: ${armed.join(', ') || 'neither'}`,
  )
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
      // A footprint is an ellipse now — the floor is looked across rather than
      // straight down — so the recorder has to see one. Its horizontal radius
      // is what the code has always called `r`, so it is recorded as that and
      // every assertion written against a circle keeps working.
      if (prop === 'ellipse') {
        return (x: number, y: number, rx: number) => circles.push({ x, y, r: rx })
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

function expect(label: string, ok: boolean, detail: string): void {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `  -> ${detail}`}`)
}

/**
 * The same claim, printed only when it breaks.
 *
 * For sweeps that make one claim a few hundred times — every spec into every
 * slot at every size — where a line each would bury the rest of the run and
 * a single line at the end would not say which one went.
 */
function expect_quiet(label: string, ok: boolean, detail = ''): void {
  if (ok) return
  failures++
  console.log(`FAIL  ${label}${detail ? `  -> ${detail}` : ''}`)
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

  // Back to front, against a bearing this check works out for itself.
  //
  // The order is the one thing about a frame that a check reading the finished
  // frame cannot see, and it broke without anything going red: the sort used
  // the world's y, which was the same as depth into the screen right up until
  // the view could turn. A quarter turn later it was sorting by the axis that
  // runs across the screen, and bodies swapped in front of each other as the
  // player walked round the boss.
  //
  // The projection here is written out rather than borrowed, so this is not
  // the renderer agreeing with itself. Depth into the screen is the world
  // point turned by the view; the tilt scales it and the camera offsets it,
  // and neither changes an ordering, so neither is needed.
  const face = viewAngle()
  const into = (a: { pos: Vec2 }) => a.pos.x * Math.sin(face) + a.pos.y * Math.cos(face)
  const order = drawOrder(s)
  let backToFront = true
  for (let i = 1; i < order.length; i++) {
    if (into(order[i]!) < into(order[i - 1]!) - 0.001) backToFront = false
  }
  expect(
    `${label}: bodies are drawn back to front`,
    backToFront,
    `view ${((face * 180) / Math.PI).toFixed(0)}deg`,
  )

  const token = Math.max(4, player.radius * L.scale)
  const centred = circles.some(
    (c) => Math.abs(c.x - L.cx) < 0.01 && Math.abs(c.y - L.cy) < 0.01 && Math.abs(c.r - token) < 0.01,
  )
  expect(`${label}: player token sits at the centre`, centred, `no r=${token.toFixed(1)} circle at ${L.cx},${L.cy}`)

  // Within the band the projection can put it in, rather than on a pixel.
  //
  // This has been narrowed twice by the camera growing, and each version was
  // the largest claim that was still true. It began as an exact pixel — centre
  // minus the player's position — which held until the view could turn, and a
  // turning view puts the arena's centre anywhere on a circle around the
  // middle of the screen. It became that circle's radius, which held until the
  // floor was tipped away from the camera, and a tipped floor turns the circle
  // into an ellipse: the same world offset lands at full distance across the
  // screen and at `TILT` of it going into the screen.
  //
  // So the band is the ellipse's two axes, and what is still being tested is
  // what was being tested at the start — that the floor is drawn under the
  // player rather than pinned to the middle of the screen.
  const floor = circles.find((c) => Math.abs(c.r - L.arenaR) < 0.01)
  const want = Math.hypot(player.pos.x, player.pos.y) * L.scale
  const off = floor === undefined ? -1 : Math.hypot(floor.x - L.cx, floor.y - L.cy)
  const follows = floor !== undefined && off >= want * TILT - 0.01 && off <= want + 0.01
  expect(
    `${label}: arena scrolls under the player`,
    follows,
    `${off.toFixed(1)} from centre, wanted ${(want * TILT).toFixed(1)}..${want.toFixed(1)}`,
  )
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

  // Five buttons a spec, and every one of them reachable.
  //
  // The second half is the one that had been quietly false. `attack` -- the
  // healer's damage button and the mage's one instant -- was in the kit, was
  // pressed by the party AI, and was never listed on the bar: five specs
  // carried a button the screen did not offer and no key could reach. An
  // ability the player cannot press is an ability only four fifths of the
  // raid has.
  const shapes: string[] = []
  const unreachable: string[] = []
  for (const pick of SPEC_OPTIONS) {
    const bar = abilityBar(pick)
    if (bar.length !== BAR_SLOTS) shapes.push(`${specLabel(pick)}: ${bar.length}`)
    const kit = specOf(pick).abilities as unknown as Record<string, string | null>
    for (const [slot, id] of Object.entries(kit)) {
      // The raid cooldown is the one kit entry that is deliberately not on the
      // bar. It is not this player's button — it is the raid's, pressed for
      // whichever member of the class is nearest and ready — so it lives on
      // its own row and is reachable there. Everything else on this list being
      // unreachable is still the bug this check was written for.
      if (slot === 'raid') continue
      if (id && !bar.includes(id)) unreachable.push(`${specLabel(pick)} ${slot}=${id}`)
    }
  }
  expect(`all ${SPEC_OPTIONS.length} specs carry ${BAR_SLOTS} buttons`, shapes.length === 0, shapes.join(', '))
  expect('and every one of them is on the bar', unreachable.length === 0, unreachable.join(', '))

  // The brace is the fifth for eleven of them, and it has to be the same
  // answer everywhere: free, off the global, and long enough that it is a
  // reaction rather than a rotation.
  const braces = SPEC_OPTIONS.map((pick) => ({ pick, id: specOf(pick).abilities.defensive }))
    .filter((b): b is { pick: Pick; id: string } => b.id !== null)
  const wrong = braces.filter(({ id }) => {
    const a = ABILITIES[id]!
    return a.cost !== 0 || !a.offGcd || a.cooldown < 40
  })
  expect(
    `all ${braces.length} specs answer the floor for free`,
    wrong.length === 0 && braces.length === SPEC_OPTIONS.length,
    wrong.map((b) => b.id).join(', ') || `${braces.length} of ${SPEC_OPTIONS.length}`,
  )
  // And a brace is not a wall: the tank's is worth keeping tanks for.
  const walls = braces.filter(({ id }) => ABILITIES[id]!.aura === 'shield')
  expect(
    'and only the tanks carry the wall',
    walls.every(({ pick }) => roleOf(pick) === 'tank') && walls.length === 3,
    walls.map((w) => specLabel(w.pick)).join(', '),
  )
}

// --- a brace does not make the fire safe -------------------------------------
//
// The rule the whole fifth button hangs on. A brace answers what could not be
// avoided and is worth nothing against what was, because the other way round
// it stands in for practice: measured with it covering everything, the gap
// between an unpractised raid and a practised one on the Warden's puddle --
// the biggest teacher in the game -- fell from five points to one.
{
  const s = pulled(0x51ed, 0, autoParty(5, pickFor('mage', 'dps')!))
  const you = s.actors.find((a) => a.isPlayer)!
  const monster = bossOf(s)

  const hit = (mechanic: boolean): number => {
    you.hp = you.maxHp
    if (mechanic) applyDamage(s, you, 400, 'magic', { sourceId: monster.id, mechanic: 'decay' })
    else applyDamage(s, you, 400, 'magic', { sourceId: monster.id })
    return you.maxHp - you.hp
  }

  const barePlain = hit(false)
  const bareMechanic = hit(true)
  addAura(you, 'brace', you.id)
  const bracedPlain = hit(false)
  const bracedMechanic = hit(true)

  expect(
    'a brace takes a bite out of what the fight throws at everybody',
    bracedPlain < barePlain * 0.8,
    `${barePlain} -> ${bracedPlain}`,
  )
  expect(
    'and nothing at all out of what you stood in',
    bracedMechanic === bareMechanic,
    `${bareMechanic} -> ${bracedMechanic}`,
  )
  // The tank's wall is the one that covers both, which is what a tank is.
  clearAura(you, 'brace')
  addAura(you, 'shield', you.id)
  expect(
    'a wall covers the floor as well',
    hit(true) < bareMechanic * 0.6,
    `${bareMechanic} -> ${hit(true)}`,
  )
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
  // Healers are a count rather than a ceiling, and the count is the size's:
  // one per five bodies everywhere, which is what five and ten already ran and
  // what twenty-five was missing. Tanks stay capped — one or two is a real
  // choice, and three is a raid that cannot kill anything.
  const capFor = (role: Role, size: number) =>
    role === 'healer' ? healerCount(size) : ROLE_LIMITS.tank.max
  const CAPPED: Role[] = ['tank', 'healer']

  for (const role of CAPPED) {
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

      const cap = capFor(role, size)
      const filled = countRoles(party)[role]
      const exact = fixedCount(role, size) !== null
      expect(
        `${size}-player: tapping ${role}s into every slot ${exact ? 'holds at' : 'stops at'} ${cap}`,
        (exact ? filled === cap : filled <= cap) && isLegalComposition(party),
        `${filled} ${role}s, ${rejected} taps rejected`,
      )
      expect(`${size}-player: the party is still the right size after ${role}s`, party.length === size, `${party.length}`)
    }

    // Swapping one for another is not an extra one, or a raid at the cap
    // could never change who fills the role at all.
    const party = autoParty(25, pickFor('mage', 'dps')!)
    const cap25 = capFor(role, 25)
    expect(`the 25-player default fields ${cap25} ${role}s`, countRoles(party)[role] === cap25, `${countRoles(party)[role]}`)

    const held = party.findIndex((p) => roleOf(p) === role)
    const swap = selectInto(party, held, options[options.length - 1]!)
    expect(`a ${role} can be swapped for another ${role}`, swap !== null && countRoles(swap)[role] === cap25, `${swap && countRoles(swap)[role]}`)

    const dpsSlot = party.findIndex((p) => roleOf(p) === 'dps')
    expect(`a dealer is still fine alongside ${role}s`, canSelect(party, dpsSlot, pickFor('mage', 'dps')!), `slot ${dpsSlot}`)

    // Past the count, the two roles part company. A tank is capped, so a
    // third is simply refused. A healer count is fixed, so the same tap is a
    // move instead: the role goes to the tapped slot and the slot that had it
    // takes what was traded away. Refusing that would leave the player unable
    // to say which of the twenty-five is the one healing.
    const extra = selectInto(party, dpsSlot, options[0]!)
    if (fixedCount(role, 25) === null) {
      expect(`one ${role} past the cap is refused`, !canSelect(party, dpsSlot, options[0]!), `slot ${dpsSlot}`)
      expect(`selectInto refuses the extra ${role} too`, extra === null, 'returned a party')
    } else {
      expect(
        `a ${role} tapped onto a dealer moves rather than adds`,
        extra !== null && countRoles(extra)[role] === cap25 && roleOf(extra[dpsSlot]!) === role,
        `${extra && countRoles(extra)[role]}`,
      )
      expect(`and the count is still exactly ${cap25}`, extra !== null && isLegalComposition(extra), 'illegal')
    }
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

  // The ceiling is the size's, not one number for every raid. Four healers is
  // what a twenty-five needs to run the one-per-five that five and ten
  // already do; the same four in a ten-man is one healer per two and a half
  // people, and a fifth of its healing lands on nobody. Both directions are
  // checked, because a flat cap passes one of them whichever number it holds.
  {
    const fill = (size: number, healers: number): Pick[] => {
      const party: Pick[] = [pickFor('warrior', 'tank')!, pickFor('paladin', 'tank')!]
      const bench = SPEC_OPTIONS.filter((o) => roleOf(o) === 'healer')
      for (let i = 0; i < healers; i++) party.push(bench[i % bench.length]!)
      while (party.length < size) party.push(pickFor('mage', 'dps')!)
      return party.slice(0, size)
    }
    expect('a ten-man fields exactly two healers', isLegalComposition(fill(10, 2)), 'rejected')
    expect('not three', !isLegalComposition(fill(10, 3)), 'accepted')
    expect('and not one', !isLegalComposition(fill(10, 1)), 'accepted')
    expect('a twenty-five fields exactly four', isLegalComposition(fill(25, 4)), 'rejected')
    expect('not five', !isLegalComposition(fill(25, 5)), 'accepted')
    expect('and not three', !isLegalComposition(fill(25, 3)), 'accepted')
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
        // Its home, which is the only place it can be checked against now.
        // The stick relocates to wherever a thumb lands, and a thumb may land
        // anywhere the fight is not showing a control, so there is no longer a
        // zone for a readout to stay clear of — it can be drawn over, and is.
        expect(`${label} ${mode}: the meter clears the stick`, !overlap(meter, stick), JSON.stringify(stick))
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
      const b = bossOf(s)
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
    const b = bossOf(s)
    const member = s.actors.find((a) => a.faction === 'party')!
    addAura(b, 'enrage', b.id)

    const before = b.hp
    applyDamage(s, b, 100, 'physical', { sourceId: member.id, silent: true })
    expect('an enraged boss does not amplify what it is taking', before - b.hp === 100, `${before - b.hp}`)

    const took = member.hp
    applyDamage(s, member, 100, 'physical', { sourceId: b.id, silent: true })
    // `HEALTH` first: the boss is the fight, and the fight's damage is written
    // in health bars. Block comes off what is left, which is why the tank's
    // flat mitigation had to be denominated the same way.
    const expected = Math.round(
      Math.max(0, 100 * HEALTH - member.block) * (1 - mitigation(member.armor)) * 2,
    )
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
      const b = bossOf(s)
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
  // Free of both currencies, since one button pays in the other one: a tap
  // costs no mana and eight percent of the bar, and counting it here would
  // read the most expensive press in the game as costless.
  //
  // The raid cooldowns joined the list for the same reason as the defensives:
  // they answer damage there is no dodging, and a shield the raid could not
  // afford at the moment it was needed is a shield the raid does not have.
  // Their cost is the ninety seconds, which is the only cost that makes the
  // timing worth anything.
  const free = Object.values(ABILITIES).filter((a) => a.cost === 0 && !a.selfCost)
  const shouldBeFree = free.every(
    (a) => a.kind === 'defensive' || a.kind === 'taunt' || a.kind === 'charge' || a.kind === 'raid',
  )
  expect(
    `only the ${free.length} defensives, taunts, charges and raid calls are free`,
    // One a spec now, plus the tanks' own: the answer to the floor is free
    // for the same reason a charge is — an answer you sometimes cannot afford
    // is worse than not having one. The nine raid calls are the same argument
    // made once per class.
    shouldBeFree && free.length === 33,
    free.map((a) => a.id).join(', '),
  )

  // And the one that pays in health is charged for it. A press that took
  // nothing would be a free damage window, which is not what any of this is.
  const paid = Object.values(ABILITIES).filter((a) => (a.selfCost ?? 0) > 0)
  expect(
    'the tap costs a real slice of the bar',
    paid.length === 1 && paid.every((a) => a.cost === 0 && a.selfCost! >= 0.05),
    paid.map((a) => `${a.id} ${a.selfCost}`).join(', '),
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
  // Five, like everything else: a way back onto the boss and a way to live
  // through what it could not leave.
  expect('with five buttons of its own', bar.length === 5, bar.join(', '))
  // Eight seconds, which is before the first thralls arrive: the player's own
  // targeting prefers an add, and an add that dies takes the bleed with it.
  const rng = new Rng(0x51ed)
  for (let i = 0; i < 30 * 8; i++) {
    const b = bossOf(s)
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
    const b = bossOf(s)
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
  const target = bossOf(s)

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
      const b = bossOf(s)
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
  const b = bossOf(s)

  // Both directions count. What you dealt and what landed on you are drawn
  // in different colours now, which is the point of them being different
  // kinds — but the rule this checks is still that both of them appear.
  const numbers = () =>
    s.texts.filter((t) => t.kind === 'damage' || t.kind === 'taken' || t.kind === 'heal').length

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
  // Six pulls rather than one, and the bound moved with them.
  //
  // This used to run a single seed and assert the peak stayed at six. What it
  // measures is the high-water mark of a thing that comes and goes in about a
  // second, which is noisier than one draw can show: swept across seeds on
  // code that has never been touched it runs three, seven, three, six, four,
  // three. The bound was under what the game already reaches, and the check
  // was passing because of which seed it happened to hold.
  //
  // So it samples, and the bound is one over what the sweep actually reaches.
  // What it guards has not changed: this exists because the wall of numbers a
  // twenty-five man threw was dozens deep, and the fix was to show only your
  // own. Seven is that fix holding. Dozens would not be.
  let peak = 0
  for (const seed of [0x51ed, 0x1234, 0x9abc, 0x4444, 0x7777, 0xbeef]) {
    const s = pulled(seed, 0, autoParty(25, { classId: 'mage', spec: 'frost' }))
    const rng = new Rng(seed)
    for (let i = 0; i < 30 * 20; i++) {
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
      peak = Math.max(peak, s.texts.filter((t) => t.kind === 'damage' || t.kind === 'heal').length)
    }
  }
  expect('a raid does not bury the screen in numbers', peak <= 8, `${peak} at once`)
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
  //
  // With the interlude cleared out of the way first. Twenty seconds of a
  // twenty-five man is long enough to break the boss into its second phase,
  // which is where its herald walks in, and nothing reaches the boss while one
  // is standing. Left alone, every number below came out nought — and the
  // multiplier assertion passed on it, because nought is exactly twice nought.
  // That is the shape of a check that has quietly stopped testing anything.
  for (const a of s.actors) if (a.spawn === 'herald') a.alive = false

  const target = bossOf(s)
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
  // The record is the meter's boards, each in the meter's order — but no
  // longer a prefix of the whole list, since the cap now takes the top of the
  // damage board and the top of the healing one rather than the first nine
  // rows of a list that happens to open with twenty damage dealers. So the
  // claim is per board: same order, and what is kept is that board's top.
  for (const healing of [false, true]) {
    const on = (r: { role: string }) => (r.role === 'healer') === healing
    const keptRows = entry.standings.filter(on)
    const meter = live.filter(on)
    expect(
      `the record is the ${healing ? 'healing' : 'damage'} board, in the meter order`,
      // Your own row is the one exception, and it is the point of the cap
      // rule: a player who placed below it is written into the last slot of
      // their own block, so that slot holds them rather than the meter's row.
      keptRows.every(
        (row, i) =>
          row.isPlayer ||
          (row.name === meter[i]!.name && row.dps === meter[i]!.dps && row.hps === meter[i]!.hps),
      ),
      `${keptRows.map((r) => r.name).join(', ')} vs ${meter.map((r) => r.name).join(', ')}`,
    )
  }
  // Two boards, each ranked on its own number and never against the other.
  // The old assertion here checked that the board was sorted by damage plus
  // healing, which is exactly the ranking the split was made to end.
  expect(
    'the damage board is ranked on damage',
    live
      .filter((r) => r.role !== 'healer')
      .every((row, i, board) => i === 0 || board[i - 1]!.dps >= row.dps),
    live.filter((r) => r.role !== 'healer').map((r) => r.dps).join(', '),
  )
  expect(
    'the healing board is ranked on healing',
    live
      .filter((r) => r.role === 'healer')
      .every((row, i, board) => i === 0 || board[i - 1]!.hps >= row.hps),
    live.filter((r) => r.role === 'healer').map((r) => r.hps).join(', '),
  )
  expect(
    'and the damage board comes first, whole',
    live.findIndex((r) => r.role === 'healer') === -1 ||
      live.slice(live.findIndex((r) => r.role === 'healer')).every((r) => r.role === 'healer'),
    live.map((r) => r.role).join(', '),
  )
  const dmg = damageBoard(s)
  const heals = healingBoard(s)
  expect(
    'no zero pads either live board',
    dmg.every((r) => r.dps > 0) && heals.every((r) => r.hps > 0),
    `${dmg.length} damage, ${heals.length} healing`,
  )

  // The meter shows the board you are on, which is the whole reason there is
  // room for the split on a phone at all. Checked from a real pull as each
  // role, since a rule about what a player is looking at that only exists
  // inside a draw call is a rule nothing can hold to account.
  for (const [role, pick] of [
    ['dps', pickFor('mage', 'dps')!],
    ['healer', pickFor('priest', 'healer')!],
    ['tank', pickFor('warrior', 'tank')!],
  ] as const) {
    const run = pulled(0x51ed, 0, autoParty(10, pick))
    const r = new Rng(0x51ed)
    while (run.outcome === 'ongoing' && run.time < 300) {
      step(run, { moveX: 0, moveY: 0, pressed: [] }, r)
    }
    const shown = meterBoard(run)
    expect(
      `the meter shows a ${role} the ${role === 'healer' ? 'healing' : 'damage'} board`,
      shown.healing === (role === 'healer'),
      `healing: ${shown.healing}`,
    )
    // And it is the board itself, not a re-sort of it.
    const want = role === 'healer' ? healingBoard(run) : damageBoard(run)
    expect(
      'and it is that board, unchanged',
      shown.rows.length === want.length && shown.rows.every((row, i) => row.name === want[i]!.name),
      shown.rows.map((row) => row.name).join(', '),
    )
  }
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

    // The cap is where the split can quietly undo itself: a twenty-five man
    // fields twenty damage rows before the first healer, so nine rows taken
    // off the top would be nine damage rows and a record with no evidence
    // anybody was healed. Both boards have to survive it.
    const healers = board.standings.filter((r) => r.role === 'healer')
    const damage = board.standings.filter((r) => r.role !== 'healer')
    expect(
      'and the cap keeps both boards',
      healers.length > 0 && damage.length > 0,
      `${damage.length} damage, ${healers.length} healing`,
    )
    // Your row goes back into your own block, not onto the end of the list.
    // The end is a healing row now, so the obvious way to write it back both
    // files a damage dealer under the healing ranking and evicts the healer
    // the cap had just reserved a place for.
    const mine = board.standings.findIndex((r) => r.isPlayer)
    expect(
      'and puts your row back on your own board',
      board.standings[mine]!.role !== 'healer' && mine < damage.length,
      `row ${mine} of ${board.standings.length}, ${damage.length} on the damage board`,
    )

    // Kept in proportion rather than one token row: a raid that is a fifth
    // healers should be reading about two of them.
    const full = standings(big)
    const share = (full.filter((r) => r.role === 'healer').length / full.length) * STANDING_LIMIT
    expect(
      'in roughly the proportion the raid has',
      Math.abs(healers.length - share) <= 1,
      `${healers.length} kept, ${share.toFixed(1)} expected`,
    )
    // And each block is still its own ranking after the cap cut it.
    expect(
      'each still ranked on its own number after the cap',
      damage.every((r, i) => i === 0 || damage[i - 1]!.dps >= r.dps) &&
        healers.every((r, i) => i === 0 || healers[i - 1]!.hps >= r.hps),
      board.standings.map((r) => `${r.role}:${r.role === 'healer' ? r.hps : r.dps}`).join(', '),
    )
  }

  // Newest first, and it never grows without bound.
  let kept: Attempt[] = []
  for (let i = 0; i < HISTORY_LIMIT + 15; i++) kept = append(kept, { ...entry, at: i })
  expect(`the record stops at ${HISTORY_LIMIT}`, kept.length === HISTORY_LIMIT, `${kept.length}`)
  expect('newest at the top', kept[0]!.at === HISTORY_LIMIT + 14, `${kept[0]!.at}`)

  // Totals over a night rather than over a pull.
  const you = (dps: number) => ({ name: 'You', classId: 'mage', spec: 'frost', role: 'dps' as const, dps, hps: 0, isPlayer: true })
  const them = (dps: number) => ({ name: 'Vale', classId: 'rogue', spec: 'assassination', role: 'dps' as const, dps, hps: 0, isPlayer: false })
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
        hitHistory(back.x + back.w / 2, back.y + back.h / 2, counts)?.kind === 'back',
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
  // It used to sit in a different slot in each of them, which is the example
  // that put the key on the bar index instead of on the ability. Every spec
  // carries the same five slots now, so a shared button lands under the same
  // finger in both -- better for the hands, and no reason at all to move the
  // key back onto the ability. So the rule is checked rather than the example
  // that once demonstrated it.
  expect(
    'and the slot is what says which key it is on',
    bars[0]!.indexOf('charge') === bars[1]!.indexOf('charge') && !('key' in charge),
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
    player.pos.x = bossOf(s).pos.x + gap
    player.pos.y = bossOf(s).pos.y
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
    arms.pos.x = bossOf(s).pos.x + 200
    arms.pos.y = bossOf(s).pos.y
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
    player.pos.x = bossOf(s).pos.x + gap
    player.pos.y = bossOf(s).pos.y
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
      const b = bossOf(s)
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
    hunter.pos.x = bossOf(s).pos.x + 70
    hunter.pos.y = bossOf(s).pos.y
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
    standings: [{ name: 'You', classId, spec: 'frost', role: 'dps' as const, dps: 1, hps: 0, isPlayer: true }],
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
    expect(`${label}: every tab is on screen`, layout.tabs.every(onScreen), JSON.stringify(layout.tabs))

    const answers = HISTORY_TABS.every((id, i) => {
      const hit = hitHistory(layout.tabs[i]!.x + 4, layout.tabs[i]!.y + 4, [])
      return hit?.kind === 'tab' && hit.tab === id
    })
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
  const before = bossOf(s).hp
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
    let adds = 0
    const s = pulled(0x51ed, 8, undefined, 'normal', i)
    const rng = new Rng(0x51ed)
    while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
      step(s, { moveX: 0, moveY: 0, pressed: [0] }, rng)
      for (const g of s.ground) kinds.add(g.kind)
      // And whatever the fight put on a body, which the floor alone does not
      // say. Two bosses whose first rung is not a shape on the ground -- an
      // air to breathe, blood on somebody -- both showed an empty floor here
      // and were reported as the same fight. What a boss asks for is not only
      // what it draws on the tiles.
      for (const a of s.actors) for (const aura of a.auras) kinds.add(aura.id)
      // Thralls only, told apart by `spawn`: a herald and a spike are also
      // bodies on the boss's side, and counting them as a wave said a boss had
      // adds on a rung where it has one of those instead.
      adds += s.actors.filter(
        (a) => a.faction === 'boss' && a.id !== bossOf(s).id && a.spawn === undefined,
      ).length
    }
    if (adds > 0) kinds.add('adds')
    seen.set(ENCOUNTERS[i]!.id, kinds)

    const encounter = ENCOUNTERS[i]!
    const label = encounter.name

    // Whatever tonight's kit says it does, it does — and whatever the kit
    // left on the ladder, it never does. Read at the size and difficulty this
    // pull was actually run at, since that is what decides the kit.
    const kit = encounterKit(encounter, 5, 'normal')
    for (const key of ['adds'] as const) {
      const wanted = kit.includes(key)
      const happened = kinds.has(key)
      // A mechanic can be scheduled and still not reach the floor inside one
      // pull, so only the negative is asserted in both directions.
      if (!wanted) {
        expect(`${label}: no ${key}`, !happened, `${key} fired on a boss with none`)
      } else {
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

  // Nor do they read as the same fight.
  //
  // The mechanic sets above have differed since the second boss existed, and
  // the check saying so has passed all along — but every boss cast the same
  // two spells by the same two names in the same red, which is what the fights
  // actually looked like from the outside. A fight that asks for something
  // different has to *say* something different.
  for (const encounter of ENCOUNTERS) {
    const label = encounter.name
    // The ladder rather than tonight's kit: a boss that owns a cone needs the
    // cone's name in the table whether or not a five-man ever climbs to it.
    //
    // And what it carries outside the ladder counts as owning it. A fight can
    // throw something at every setting rather than sell it on one — the wave
    // the Whisper's empowered body is one of — and a thing thrown every pull
    // that the table refuses to name is the worst version of this rule being
    // broken, not an exception to it.
    const uses = (key: MechanicId) =>
      encounter.ladder.includes(key) || (encounter.always ?? []).includes(key)

    expect(`${label}: its slam has a name`, encounter.names.slam !== '', 'it had none')
    // Every mechanic, not a list written out here. The list version named ten
    // of them and was never extended, so twenty could have been announced by a
    // boss that does not throw them, or thrown in silence, and nothing would
    // have said so. `lines` does not carry a key for a mechanic that is never
    // announced, which is the one legitimate absence.
    for (const key of MECHANIC_IDS) {
      if (!(key in encounter.lines)) continue
      const line = (encounter.lines as Record<string, string>)[key]!
      expect(
        `${label}: its ${key} is announced exactly when it happens`,
        uses(key) === (line !== ''),
        `uses ${uses(key)}, says "${line}"`,
      )
      if (!uses(key)) continue
      expect(
        `${label}: and has a cadence for it in every phase`,
        [1, 2, 3].every((phase) => encounter.phases[phase]![key] > 0) && encounter.opening[key] > 0,
        `${[1, 2, 3].map((phase) => encounter.phases[phase]![key]).join('/')} from ${encounter.opening[key]}`,
      )
      // Later phases ask sooner. A cadence that is flat is a boss that does
      // not build.
      expect(
        `${label}: and asks for it sooner as it goes`,
        encounter.phases[1]![key] > encounter.phases[2]![key] &&
          encounter.phases[2]![key] > encounter.phases[3]![key],
        `${[1, 2, 3].map((phase) => encounter.phases[phase]![key]).join('/')}`,
      )
    }
    // And nothing it does not own has a cadence either, or a boss carries a
    // timer for a fight it is not having.
    const stray = MECHANIC_IDS.filter((key) => !uses(key) && encounter.phases[1]![key] > 0)
    expect(`${label}: and throws nothing it does not own`, stray.length === 0, stray.join(','))
  }

  // Two bosses sharing a word is two bosses the player cannot tell apart while
  // reading a cast bar, which is the only place either name is ever seen.
  const spoken = ENCOUNTERS.flatMap((e) => [
    e.names.slam,
    ...Object.values(e.lines),
  ]).filter((line) => line !== '')
  expect(
    'no two bosses say the same thing',
    new Set(spoken).size === spoken.length,
    spoken.filter((line, i) => spoken.indexOf(line) !== i).join(','),
  )
  const accents = ENCOUNTERS.map((e) => e.accent)
  expect('nor share a colour', new Set(accents).size === accents.length, accents.join(','))

// --- the ladders themselves -------------------------------------------------
//
// The tables above say what each boss *can* throw; this says what any given
// raid actually meets, and it is the part that used to be missing. Every boss
// owned a different set on paper and the first one owned nearly all of it, so
// the second and third were the first one with things taken away — three
// fights that opened on the same two mechanics and diverged only once the
// party was already dead.
//
// So: the rungs each raid climbs, checked as a shape rather than as a table.
{
  const RUNGS: Array<{ size: number; difficulty: DifficultyId }> = [
    { size: 5, difficulty: 'normal' },
    { size: 5, difficulty: 'heroic' },
    { size: 10, difficulty: 'normal' },
    { size: 10, difficulty: 'heroic' },
    { size: 25, difficulty: 'normal' },
    { size: 25, difficulty: 'heroic' },
  ]

  for (const encounter of ENCOUNTERS) {
    expect(
      `${encounter.name}: asks for the same thing twice on no rung`,
      new Set(encounter.ladder).size === encounter.ladder.length,
      encounter.ladder.join(','),
    )
    // One, which is the smallest thing that is still a fight rather than a
    // health bar. There is no bound above it in either direction now: what a
    // step buys scales with what the boss has to sell, and how much that is
    // is the fight's business.
    //
    // Three was the old floor and it was a judgement about pacing rather than
    // about correctness — a fight with two ideas repeated is thin. That
    // judgement is still true and it is not this file's to enforce.
    expect(
      `${encounter.name}: throws something`,
      encounter.ladder.length >= 1,
      `${encounter.ladder.length} rungs`,
    )
  }

  // Neither axis ever takes something away, and between them they buy the
  // whole boss.
  //
  // "More at every step" was the rule while every fight owned six mechanics
  // and there are six settings. A fight is allowed to own three now — the
  // first boss does, and sells all three to everybody, because what a raid is
  // unlocking there is itself rather than the fight. So the rule that survives
  // is the one that was always the point: a bigger or harder setting never
  // shows you less, and climbing the whole ladder shows you all of it.
  for (const encounter of ENCOUNTERS) {
    for (const size of [5, 10, 25]) {
      const normal = encounterKit(encounter, size, 'normal')
      const heroic = encounterKit(encounter, size, 'heroic')
      expect(
        `${encounter.name} at ${size}: heroic asks no less than normal`,
        heroic.length >= normal.length,
        `${normal.length} vs ${heroic.length}`,
      )
      expect(
        `${encounter.name} at ${size}: and for everything normal did`,
        normal.every((id) => heroic.includes(id)),
        heroic.join(','),
      )
    }
    // And the top of the ladder is the whole fight. This is what the two rules
    // above used to guarantee between them and now do not: a boss could sell
    // the same three at every setting and satisfy "no less" forever while
    // three of its six sat in the table unreachable.
    expect(
      `${encounter.name}: the last rung is the whole boss`,
      encounterKit(encounter, 25, 'heroic').length >=
        encounter.ladder.length + (encounter.always?.length ?? 0),
      `${encounterKit(encounter, 25, 'heroic').length} of ${encounter.ladder.length}`,
    )
    for (const difficulty of ['normal', 'heroic'] as DifficultyId[]) {
      const five = encounterKit(encounter, 5, difficulty)
      const ten = encounterKit(encounter, 10, difficulty)
      const full = encounterKit(encounter, 25, difficulty)
      expect(
        `${encounter.name} on ${difficulty}: a bigger raid meets no less of it`,
        five.length <= ten.length && ten.length <= full.length,
        `${five.length}/${ten.length}/${full.length}`,
      )
      expect(
        `${encounter.name} on ${difficulty}: and never less`,
        five.every((id) => ten.includes(id)) && ten.every((id) => full.includes(id)),
        full.join(','),
      )
    }
  }

  // A boss whose opening scales with nothing has to say so in its own numbers.
  //
  // `MECHANIC_SCALES` is the property that decides how a boss behaves at size:
  // things dropped on people ask more of a bigger raid, arena shapes ask the
  // same of any raid. A boss made entirely of the second kind gets easier the
  // more people turn up, and no global dial can fix that without moving the
  // bosses that do not have the problem — which is what `sizeMechanic` is for.
  //
  // Checked at the opening rather than across the ladder, because that is
  // where it is unambiguous: two mechanics, and either one of them scales or
  // none of them do. The Tidebreaker opens on a cone and a ring and carries
  // weights at all three sizes; the Warden is four fifths roster-aimed and
  // carries none. This is the rule that pairing followed, written down.
  for (const e of ENCOUNTERS) {
    const opening = encounterKit(e, 5, 'normal')
    const scaling = opening.filter((m) => MECHANIC_SCALES[m]).length
    if (scaling > 0) continue
    expect(
      `${e.short}: an opening that scales with nothing carries its own weights`,
      e.sizeMechanic !== undefined,
      opening.join(','),
    )
  }

  // And the property is total: a mechanic nobody classified is a mechanic the
  // rule above silently reads as arena-aimed.
  {
    const unclassified = (Object.keys(MECHANIC_NAMES) as MechanicId[]).filter(
      (m) => MECHANIC_SCALES[m] === undefined,
    )
    expect('every mechanic says whether it scales', unclassified.length === 0, unclassified.join(','))
  }

  // And no two bosses are the same fight at any rung. The opening is held to
  // the stricter rule: a five-man on normal meets three mechanics and no
  // more, so if any of the three overlap the two bosses open alike, which is
  // the complaint this whole arrangement answers.
  for (const { size, difficulty } of RUNGS) {
    const kits = ENCOUNTERS.map((e) => ({ e, kit: encounterKit(e, size, difficulty) }))
    for (let i = 0; i < kits.length; i++) {
      for (let j = i + 1; j < kits.length; j++) {
        const a = kits[i]!
        const b = kits[j]!
        const shared = a.kit.filter((id) => b.kit.includes(id))
        expect(
          `${size}-${difficulty}: ${a.e.short} and ${b.e.short} are not one another`,
          !(shared.length === a.kit.length || shared.length === b.kit.length),
          `${a.kit.join(',')} vs ${b.kit.join(',')}`,
        )
        if (size === 5 && difficulty === 'normal') {
          expect(
            `and they open on nothing in common: ${a.e.short} / ${b.e.short}`,
            shared.length === 0,
            shared.join(','),
          )
        }
      }
    }
  }


}

  // And the colour reaches the screen: the boss is drawn in its own, not in
  // the one every boss used to be.
  for (let i = 0; i < ENCOUNTERS.length; i++) {
    const painted = new Set<string>()
    const spy = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'measureText') return () => ({ width: 10 })
          if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
            return () => ({ addColorStop: () => {} })
          }
          if (prop === 'canvas') return { width: L.w, height: L.h }
          return () => {}
        },
        set(_t, prop, value) {
          if (prop === 'fillStyle' && typeof value === 'string') painted.add(value)
          return true
        },
      },
    ) as unknown as CanvasRenderingContext2D
    updateLayout(1440, 900)
    const s = pulled(0x51ed, 0, undefined, 'normal', i)
    s.countdown = 0
    drawWorld(spy, s, 1, 0, new Effects())
    expect(
      `${ENCOUNTERS[i]!.name}: is drawn in its own colour`,
      painted.has(ENCOUNTERS[i]!.accent),
      [...painted].join(','),
    )
  }

  // And they leave a mark when they land.
  //
  // The party's abilities have drawn their own hit since there were hit
  // styles at all. The boss's drew nothing: the slam, the cone, the ring, the
  // floor going off and the party-wide hit pushed no effect of any kind, so
  // the whole of what a boss does arrived as numbers over people's heads and
  // a shape on the floor changing state. Only its sweep ever made a picture.
  const thrown = new Map<string, Set<string>>()
  for (let i = 0; i < ENCOUNTERS.length; i++) {
    const ids = new Set<string>()
    // A ten-man on heroic rather than the default five-man normal. Two
    // reasons, both about the ladder: four rungs is where every boss has
    // bought something that draws, and the armour break only exists where
    // there are two tanks to trade it between.
    const raid = autoParty(10, pickFor('mage', 'dps')!)
    // Kept with the kind attached. A cast that gathers and a hit that lands
    // are different pictures, and the slam pushes both — asking only whether
    // the id appeared would pass on a slam that winds up and then connects
    // with nothing at all, which is the exact bug being fixed.
    const landed = new Set<string>()
    const s = pulled(0x51ed, 8, raid, 'heroic', i)
    const rng = new Rng(0x51ed)
    while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
      step(s, { moveX: 0, moveY: 0, pressed: [0] }, rng)
      for (const event of s.effects) {
        if (!event.abilityId?.startsWith('boss_')) continue
        ids.add(event.abilityId)
        if (event.kind === 'impact') landed.add(event.abilityId)
      }
    }
    thrown.set(ENCOUNTERS[i]!.id, ids)

    const encounter = ENCOUNTERS[i]!
    const kit = encounterKit(encounter, 10, 'heroic')
    // Spread is missing on purpose: it detonates on its carrier and draws
    // nothing with the boss's name on it, so it is checked by its aura in the
    // pass above rather than by a picture here.
    const DRAWN: Partial<Record<MechanicId, string>> = {
      adds: 'boss_thrall',
    }
    for (const [key, id] of Object.entries(DRAWN) as Array<[MechanicId, string]>) {
      if (kit.includes(key)) {
        expect(`${encounter.name}: its ${key} shows itself`, ids.has(id), `${id} was never drawn`)
      } else {
        expect(`${encounter.name}: nothing draws a ${key}`, !ids.has(id), `${id} was drawn anyway`)
      }
    }
    // These two every boss does, so every boss has to show them landing.
    for (const id of ['boss_slam', 'boss_raid'] as const) {
      expect(`${encounter.name}: its ${id.slice(5)} lands visibly`, landed.has(id), 'it drew nothing')
    }
    expect(
      `${encounter.name}: and its casts wind up`,
      ids.has('boss_slam'),
      'no cast was ever drawn',
    )
  }

  // The blight and everything made of it.
  //
  // Driven together because they only exist together: `REQUIRES` pulls the
  // air and the spore in behind the breath out, so asking a floor for the last
  // of them is asking for all four. The breath out is also the one mechanic in
  // the game that can throw nothing at all — it returns what was taken, and a
  // fight where the boss has taken nothing has nothing to return — so the
  // cadences here are set so a breath in lands well before it.
  {
    const air = floorWith(
      { pungent: 26, inhale: 8, vilegas: 14, bloat: 6 },
      autoParty(10, pickFor('mage', 'dps')!),
    )
    const rng = new Rng(0x51ed)
    const ids = new Set<string>()
    while (air.outcome === 'ongoing' && air.time < 150) {
      step(air, { moveX: 0, moveY: 0, pressed: [0] }, rng)
      for (const event of air.effects) {
        if (event.abilityId?.startsWith('boss_')) ids.add(event.abilityId)
      }
    }
    expect('a floor can foul its own air', ids.has('boss_blight'), 'it drew nothing')
    expect('and drink it', ids.has('boss_inhale'), 'it drew nothing')
    expect('and give it back', ids.has('boss_pungent'), 'it drew nothing')
    thrown.set('air', ids)
  }

  // The whisper's, which are four different kinds of taking something away and
  // are driven together for the same reason the air's are: the empowered body
  // is one of a wave, so asking for it is asking for the wave as well, and
  // `REQUIRES` is what knows that.
  {
    const taken = floorWith(
      { decay: 12, empower: 9, dominate: 11, shade: 10, insignificance: 9, frostbolt: 8, volley: 7 },
      autoParty(10, pickFor('mage', 'dps')!),
    )
    const rng = new Rng(0x51ed)
    const ids = new Set<string>()
    while (taken.outcome === 'ongoing' && taken.time < 150) {
      step(taken, { moveX: 0, moveY: 0, pressed: [0] }, rng)
      for (const event of taken.effects) {
        if (event.abilityId?.startsWith('boss_')) ids.add(event.abilityId)
      }
    }
    expect('a floor can rot its own ground', ids.has('boss_decay'), 'it drew nothing')
    expect('and send one back wrong', ids.has('boss_empower'), 'it drew nothing')
    expect('and turn one of yours around', ids.has('boss_dominate'), 'it drew nothing')
    thrown.set('taken', ids)
  }

  // The gorged one's five, driven together because four of them exist to feed
  // the fifth. The gauge is the reason this block cannot be folded into the
  // sweep above: it is bought on the second rung and the mark on the fifth, so
  // a pull at the size that sweep runs meets neither -- and the mark is not on
  // a clock at all, it is bought with what the other four let happen.
  {
    const blood = floorWith(
      { siphon: 14, spill: 9, fester: 11, gorge: 13, champion: 40, adds: 16 },
      autoParty(10, pickFor('mage', 'dps')!),
    )
    const rng = new Rng(0x51ed)
    const ids = new Set<string>()
    while (blood.outcome === 'ongoing' && blood.time < 150) {
      step(blood, { moveX: 0, moveY: 0, pressed: [0] }, rng)
      for (const event of blood.effects) {
        if (event.abilityId?.startsWith('boss_')) ids.add(event.abilityId)
      }
    }
    expect('a floor can spill blood on somebody', ids.has('boss_spill'), 'it drew nothing')
    expect('and leave a wound open', ids.has('boss_fester'), 'it drew nothing')
    expect('and swallow whoever is holding it', ids.has('boss_gorge'), 'it drew nothing')
    expect('and be paid for all of it', ids.has('boss_siphon'), 'it drew nothing')
    expect('and spend what it was paid', ids.has('boss_champion'), 'it drew nothing')
    thrown.set('blood', ids)
  }

  // The confluence's six, driven together because five of them are one idea.
  // The merging has no cadence at all -- two small things touch or they do not
  // -- so what this has to do is make small things and let the floor decide,
  // which means an infection often enough that two of them are alive at once.
  {
    const seep = floorWith(
      { spray: 11, infection: 5, flood: 14, engulf: 4 },
      autoParty(10, pickFor('mage', 'dps')!),
    )
    const rng = new Rng(0x51ed)
    const ids = new Set<string>()
    while (seep.outcome === 'ongoing' && seep.time < 150) {
      step(seep, { moveX: 0, moveY: 0, pressed: [0] }, rng)
      for (const event of seep.effects) {
        if (event.abilityId?.startsWith('boss_')) ids.add(event.abilityId)
      }
    }
    expect('a floor can spray its own front', ids.has('boss_spray'), 'it drew nothing')
    expect('and leave something on a body', ids.has('boss_infection'), 'it drew nothing')
    expect('and that body can leave something behind', ids.has('boss_ooze'), 'it drew nothing')
    expect('and the floor can spread', ids.has('boss_flood'), 'it drew nothing')
    expect('and two of them can become one', ids.has('boss_merge'), 'it drew nothing')
    expect('and the boss can eat one', ids.has('boss_engulf'), 'it drew nothing')
    thrown.set('seep', ids)
  }

  // The two flasks' five. The reagent is the only one of them a pull at the
  // sweep's own size never reaches -- it is the last rung -- and the
  // gathering needs something to be gathering *on*, which `REQUIRES` pulls in
  // whether this block asks for it or not.
  {
    const bench = floorWith(
      { caustic: 9, hound: 14, gather: 12, chase: 12, decant: 13, reagent: 4 },
      autoParty(10, pickFor('mage', 'dps')!),
    )
    const rng = new Rng(0x51ed)
    const ids = new Set<string>()
    while (bench.outcome === 'ongoing' && bench.time < 150) {
      step(bench, { moveX: 0, moveY: 0, pressed: [0] }, rng)
      for (const event of bench.effects) {
        if (event.abilityId?.startsWith('boss_')) ids.add(event.abilityId)
      }
    }
    expect('a floor can break its own glass', ids.has('boss_caustic'), 'it drew nothing')
    expect('and set something after one of you', ids.has('boss_hound'), 'it drew nothing')
    expect('and call everybody onto them', ids.has('boss_gather'), 'it drew nothing')
    expect('and leave two on the floor', ids.has('boss_decant'), 'it drew nothing')
    expect('and drink its own work', ids.has('boss_reagent'), 'it drew nothing')
    thrown.set('bench', ids)
  }

  // The crimson gift's five, and this one cannot be driven off an imposed
  // floor at all: what schedules four of them is the raid passing something.
  // So it is a real pull of the fight, long enough for a gift to be handed on
  // once, to sour once, and for the boss to leave the floor.
  {
    const held = ENCOUNTERS.findIndex((e) => e.id === 'gift')
    expect('the fight that hands something over is on the roster', held >= 0, `${held}`)
    const s = pulled(0x51ed, 8, autoParty(25, pickFor('mage', 'dps')!), 'heroic', held)
    const rng = new Rng(0x51ed)
    const ids = new Set<string>()
    while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage) {
      step(s, { moveX: 0, moveY: 0, pressed: s.tick % 45 === 0 ? [0, 1, 2] : [] }, rng)
      for (const event of s.effects) {
        if (event.abilityId?.startsWith('boss_')) ids.add(event.abilityId)
      }
    }
    expect('a fight can hand somebody a gift', ids.has('boss_gift'), 'it drew nothing')
    expect('and tie two of them together', ids.has('boss_bond'), 'it drew nothing')
    expect('and leave blood where it was passed', ids.has('boss_stain'), 'it drew nothing')
    expect('and leave the floor entirely', ids.has('boss_flight'), 'it drew nothing')
    expect('and charge for every one in play', ids.has('boss_crimson'), 'it drew nothing')
    thrown.set('gift', ids)
  }

  // The three crowns' five. The crown itself needs three bodies to move
  // between, which only its own fight has -- so this one is run against that
  // fight rather than through the imposed floor, and the imposed floor covers
  // the four that are ordinary mechanics wearing a court's clothes.
  {
    const court = floorWith(
      { thirst: 6, ballast: 9, nuclei: 7, prison: 11 },
      autoParty(10, pickFor('mage', 'dps')!),
    )
    const rng = new Rng(0x51ed)
    const ids = new Set<string>()
    while (court.outcome === 'ongoing' && court.time < 150) {
      step(court, { moveX: 0, moveY: 0, pressed: [0] }, rng)
      for (const event of court.effects) {
        if (event.abilityId?.startsWith('boss_')) ids.add(event.abilityId)
      }
    }
    expect('a floor can drop something that must not land', ids.has('boss_ballast'), 'it drew nothing')
    expect('and leave a grain to be picked up', ids.has('boss_nuclei'), 'it drew nothing')
    expect('and tell everybody to be still', ids.has('boss_prison'), 'it drew nothing')
    thrown.set('court', ids)
  }

  // And the two that only exist where there is more than one body to be. The
  // thirst is what the bodies without the crown do, so it needs the fight that
  // has them -- an imposed floor is one boss, and one boss is never thirsty.
  {
    const crowns = ENCOUNTERS.findIndex((e) => e.id === 'crowns')
    expect('the fight with three bodies is on the roster', crowns >= 0, `${crowns}`)
    const s = pulled(0x51ed, 8, autoParty(10, pickFor('mage', 'dps')!), 'heroic', crowns)
    const rng = new Rng(0x51ed)
    const ids = new Set<string>()
    while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage) {
      step(s, { moveX: 0, moveY: 0, pressed: s.tick % 45 === 0 ? [0, 1, 2] : [] }, rng)
      for (const event of s.effects) {
        if (event.abilityId?.startsWith('boss_')) ids.add(event.abilityId)
      }
    }
    expect('a court can move its crown', ids.has('boss_rotation'), 'it drew nothing')
    expect('and drink from whoever is near', ids.has('boss_thirst'), 'it drew nothing')
    thrown.set('crowns', ids)
  }

  // A mechanic with no entry falls back to one orange ring shared with every
  // other boss cast, and an entry nothing throws is a colour for a mechanic
  // that does not exist. Both are the same rot the names had.
  const everything = new Set([...thrown.values()].flatMap((set) => [...set]))
  for (const id of everything) {
    expect(`${id} has a look of its own`, bossEffect(id) !== null, 'it falls back to the shared one')
  }
  for (const id of bossEffectIds()) {
    // The interlude is the one thing here nothing can produce any more. It is
    // a per-encounter field rather than a mechanic a floor can roll, and every
    // fight that declared one was removed -- so the feature is still in the
    // engine with nothing using it. Exempted by name rather than deleted,
    // because the icon is not the thing that is missing.
    if (id === 'boss_herald') continue
    // And the one picture in the game that only a mistake produces. A raid
    // that hands the gift on in time never draws it, and the sweeps above are
    // played by a roster that hands it on in time -- so demanding it here
    // would be demanding the party play badly. The block that puts a gift
    // somewhere it cannot be handed on asserts the rule instead.
    if (id === 'boss_turning') continue
    expect(`${id} is something a boss actually does`, everything.has(id), 'nothing ever threw it')
  }
  const shades = bossEffectIds().map((id) => bossEffect(id)!.colour)
  expect(
    'and no two mechanics share a colour',
    new Set(shades).size === shades.length,
    shades.join(','),
  )

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

// --- the chain the raid opens along ----------------------------------------
//
// One chain through every setting rather than three locked doors: six rungs
// per boss in the order the fight gets harder, and the last of one boss opens
// the first of the next. What is open is always a prefix of it, which is why a
// single number describes it — and why nothing here has to ask "but did they
// clear the *other* twenty-five man".
{
  expect(
    'six rungs a boss, and one chain through all of them',
    LADDER.length === ENCOUNTERS.length * RUNGS_PER_BOSS && RUNGS_PER_BOSS === 6,
    `${LADDER.length} rungs over ${ENCOUNTERS.length} bosses`,
  )

  // Every setting the setup screen can offer is somewhere on it, exactly once.
  const seen = new Set<string>()
  for (let i = 0; i < ENCOUNTERS.length; i++) {
    for (const size of [5, 10, 25] as RaidSize[]) {
      for (const difficulty of ['normal', 'heroic'] as DifficultyId[]) {
        const at = tierOf(i, size, difficulty)
        expect(
          `${ENCOUNTERS[i]!.short} ${size} ${difficulty} is on the chain`,
          at >= 0 && !seen.has(`${at}`),
          `${at}`,
        )
        seen.add(`${at}`)
        const rung = tierAt(at)
        expect(
          'and reads back as itself',
          rung.encounter === i && rung.size === size && rung.difficulty === difficulty,
          `${rung.encounter}/${rung.size}/${rung.difficulty}`,
        )
      }
    }
  }

  // A battleground is five a side and is not a rung of anything.
  expect('a size off the roster is not on it', tierOf(0, 7, 'normal') === -1, `${tierOf(0, 7, 'normal')}`)

  // It gets harder along its own length, which is the whole claim the order
  // makes. Measured against the harness's own reading of each cell rather than
  // asserted: heroic at one size sits below normal at the next, which is why
  // the rungs alternate rather than running all the sizes and then all the
  // difficulties.
  expect(
    'and it steps size, difficulty, size, difficulty',
    [0, 1, 2, 3, 4, 5].every((i) => {
      const rung = tierAt(i)
      return rung.size === ([5, 5, 10, 10, 25, 25] as const)[i] &&
        rung.difficulty === (i % 2 === 0 ? 'normal' : 'heroic')
    }),
    [0, 1, 2, 3, 4, 5].map((i) => `${tierAt(i).size}${tierAt(i).difficulty[0]}`).join(' '),
  )

  // A new save opens exactly one thing.
  const fresh = FIRST_TIER
  expect(
    'a new player has one fight and one setting',
    isOpen(fresh, 0, 5, 'normal') &&
      !isOpen(fresh, 0, 5, 'heroic') &&
      !isOpen(fresh, 0, 10, 'normal') &&
      !bossOpen(fresh, 1),
    'more than the first rung was open',
  )

  // And clearing walks it, one rung at a time, all the way to the end.
  {
    let open = FIRST_TIER
    const walked: string[] = []
    for (let step = 0; step < LADDER.length; step++) {
      const rung = tierAt(open)
      expect(
        `rung ${step + 1} is open when it is reached`,
        isOpen(open, rung.encounter, rung.size, rung.difficulty),
        `${rung.encounter}/${rung.size}/${rung.difficulty}`,
      )
      // And the one after it is not, until this one is cleared.
      if (step + 1 < LADDER.length) {
        const above = tierAt(open + 1)
        expect(
          'and the one above it is not',
          !isOpen(open, above.encounter, above.size, above.difficulty),
          `${above.encounter}/${above.size}/${above.difficulty}`,
        )
      }
      walked.push(`${ENCOUNTERS[rung.encounter]!.short}${rung.size}${rung.difficulty[0]}`)
      open = cleared(open, rung.encounter, rung.size, rung.difficulty)
    }
    expect('the whole game opens in eighteen kills', open === LADDER.length - 1, `${open}`)
    expect(
      'and the handovers land where they should',
      walked[RUNGS_PER_BOSS - 1] === `${ENCOUNTERS[0]!.short}25h` &&
        walked[RUNGS_PER_BOSS] === `${ENCOUNTERS[1]!.short}5n`,
      walked.join(' '),
    )
  }

  // Clearing something already behind you opens nothing, which is what lets a
  // player farm the first boss without the rest closing up.
  {
    const far = tierOf(1, 10, 'normal')
    expect('a kill behind you costs nothing', cleared(far, 0, 5, 'normal') === far, `${cleared(far, 0, 5, 'normal')}`)
    expect('and one at the top does not run off the end', cleared(LADDER.length - 1, ENCOUNTERS.length - 1, 25, 'heroic') === LADDER.length - 1, 'it did')
  }

  // What the setup screen falls back to when the setting it was handed is not
  // open: the best rung of the boss that was asked for, never a different one.
  {
    const open = tierOf(0, 10, 'normal')
    const best = bestOpen(open, 0)
    expect(
      'a locked setting falls back within its own boss',
      best.encounter === 0 && best.size === 10 && best.difficulty === 'normal',
      `${best.encounter}/${best.size}/${best.difficulty}`,
    )
    const unreached = bestOpen(open, ENCOUNTERS.length - 1)
    expect(
      'and a boss not reached at all falls back to the first rung of the game',
      unreached.encounter === 0 && unreached.size === 5 && unreached.difficulty === 'normal',
      `${unreached.encounter}/${unreached.size}/${unreached.difficulty}`,
    )
  }

  // --- and what the three rows of the setup screen do about it -------------
  //
  // The rules live in `progress` rather than in the click handler, which is
  // the only reason this can be asked at all: a rule about what is open that
  // lives in a screen is a rule nothing can check, and the screen is the one
  // place a rung that was never earned would turn into a pull.
  {
    const at = (encounter: number, size: RaidSize, difficulty: DifficultyId): Setting => ({
      encounter,
      size,
      difficulty,
    })

    // A fresh save: every press but the one that is already selected refuses.
    const fresh = FIRST_TIER
    const start = at(0, 5, 'normal')
    expect(
      'a new player cannot press past the first rung',
      !moved(start, pressSize(fresh, start, 10)) &&
        !moved(start, pressSize(fresh, start, 25)) &&
        !moved(start, pressDifficulty(fresh, start, 'heroic')) &&
        !moved(start, pressBoss(fresh, start, 1)),
      'a locked press moved something',
    )

    // Stepping up a size lands on its normal even from heroic, because the
    // rung that opens a size *is* that size on normal.
    {
      const open = tierOf(0, 10, 'normal')
      const onFiveHeroic = at(0, 5, 'heroic')
      const stepped = pressSize(open, onFiveHeroic, 10)
      expect(
        'stepping up a size lands on its normal',
        stepped.size === 10 && stepped.difficulty === 'normal',
        `${stepped.size}/${stepped.difficulty}`,
      )
      // And once its heroic is open too, the difficulty is kept.
      const later = pressSize(tierOf(0, 10, 'heroic'), onFiveHeroic, 10)
      expect(
        'and keeps heroic once heroic is open there',
        later.size === 10 && later.difficulty === 'heroic',
        `${later.size}/${later.difficulty}`,
      )
    }

    // Pressing a boss brings the rows down with it rather than carrying a
    // heroic twenty-five onto a boss only opened at five.
    {
      const open = tierOf(1, 5, 'normal')
      const carried = pressBoss(open, at(0, 25, 'heroic'), 1)
      expect(
        'a new boss is entered at the rung it was opened on',
        carried.encounter === 1 && carried.size === 5 && carried.difficulty === 'normal',
        `${carried.encounter}/${carried.size}/${carried.difficulty}`,
      )
      // And a press only brings the rows down when it has to. Going back to a
      // boss where the current size and difficulty are open leaves them where
      // they are: the two rows are their own controls, and a boss press that
      // silently moved them when it did not need to would be a press with a
      // second effect nobody asked for.
      const back = pressBoss(open, at(1, 5, 'normal'), 0)
      expect(
        'and an old one keeps the rows it can',
        back.encounter === 0 && back.size === 5 && back.difficulty === 'normal',
        `${back.encounter}/${back.size}/${back.difficulty}`,
      )
    }

    // Settling never moves the boss unless the boss itself is unreached.
    {
      const open = tierOf(0, 10, 'normal')
      const settled = settle(open, at(0, 25, 'heroic'))
      expect(
        'settling stays on the boss it was asked about',
        settled.encounter === 0 && settled.size === 10 && settled.difficulty === 'normal',
        `${settled.encounter}/${settled.size}/${settled.difficulty}`,
      )
      const already = at(0, 5, 'normal')
      expect('and leaves an open setting alone', !moved(already, settle(open, already)), 'it moved')
    }

    // The whole game, walked with nothing but the advance button — which is
    // the path a player who never touches the setup screen actually takes.
    {
      let open = FIRST_TIER
      let where = at(0, 5, 'normal')
      const seen: string[] = []
      for (let step = 0; step < LADDER.length; step++) {
        expect(
          `the advance button never lands on a locked rung (${step + 1})`,
          isOpen(open, where.encounter, where.size, where.difficulty),
          `${where.encounter}/${where.size}/${where.difficulty}`,
        )
        seen.push(`${where.encounter}${where.size}${where.difficulty[0]}`)
        open = cleared(open, where.encounter, where.size, where.difficulty)
        const next = nextSetting(where)
        if (step === LADDER.length - 1) {
          expect('and stops at the top', !moved(where, next), 'it kept going')
        } else {
          expect(`and moves every time before it (${step + 1})`, moved(where, next), 'it stalled')
        }
        where = next
      }
      expect(
        'eighteen presses walk the whole game',
        new Set(seen).size === LADDER.length,
        seen.join(' '),
      )
    }
  }

  // The last rung of the game is the only one with nothing above it.
  {
    const ends = LADDER.filter((t) => !hasNextTier(t.encounter, t.size, t.difficulty))
    expect('exactly one rung is the end of it', ends.length === 1, `${ends.length}`)
    expect(
      'and it is the hardest setting of the last boss',
      ends[0]!.encounter === ENCOUNTERS.length - 1 &&
        ends[0]!.size === 25 &&
        ends[0]!.difficulty === 'heroic',
      JSON.stringify(ends[0]),
    )
  }
}

// A kill on the last rung of the last boss offers no way on, and a wipe never
// does. Every other kill offers the rung above it, which is usually this same
// boss one setting harder rather than the next boss at all.
{
  updateLayout(1440, 900)
  const top = pulled(
    0x51ed,
    0,
    autoParty(25, pickFor('mage', 'dps')!),
    'heroic',
    ENCOUNTERS.length - 1,
  )
  top.outcome = 'victory'
  expect('the last kill has nowhere to go', !canAdvance(top), 'it offered one')

  // The last boss at the *first* setting is not the last kill: five more rungs
  // of it are left, and the old check said otherwise because a boss was the
  // only thing that was ever locked.
  const lastBossFirstRung = pulled(0x51ed, 0, undefined, 'normal', ENCOUNTERS.length - 1)
  lastBossFirstRung.outcome = 'victory'
  expect('but its five-man normal has five', canAdvance(lastBossFirstRung), 'it offered none')
  expect(
    'and says which one',
    advanceLabel(lastBossFirstRung) === '5-MAN HEROIC',
    advanceLabel(lastBossFirstRung),
  )

  const first = pulled(0x51ed, 0, undefined, 'normal', 0)
  first.outcome = 'victory'
  expect('an earlier kill does', canAdvance(first), 'it did not')

  // The top of a boss is the one rung whose button really is the next boss.
  const handover = pulled(0x51ed, 0, autoParty(25, pickFor('mage', 'dps')!), 'heroic', 0)
  handover.outcome = 'victory'
  expect('the top of a boss hands over', advanceLabel(handover) === 'NEXT BOSS', advanceLabel(handover))

  first.outcome = 'wipe'
  expect('a wipe does not', !canAdvance(first), 'a wipe offered the next rung')
  first.outcome = 'enrage'
  expect('nor an enrage', !canAdvance(first), 'an enrage offered the next rung')
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
  //
  // Every red is moved off rather than one being killed. The other four are
  // driven, and red's own distance ordering assigns one of them to this very
  // point, so whether anybody arrives to contest it came down to which classes
  // that match happened to roll — which made this check pass or fail on a roll
  // it never meant to depend on.
  for (const a of s.actors.filter((o) => teamOf(o) === 'red')) {
    a.alive = false
    a.pos.x = 900
    a.pos.y = 900
  }
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

  // A flag at home is lifted by standing on it rather than by touching it, so
  // every one of these has to hold the runner there while the clock runs. Red
  // is held away from its own base throughout, since the whole team spawns on
  // top of the flag it defends and one of them in reach is enough to stop it.
  const clearRed = (): void => {
    for (const a of s.actors) {
      if (teamOf(a) !== 'red') continue
      a.pos.x = -300
      a.pos.y = 300
    }
  }

  /** Ticks it took, or -1 if it never came off. */
  const lift = (): number => {
    for (let tick = 0; tick < 150; tick++) {
      clearRed()
      runner.pos = { ...bg.flags.red.pos }
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
      if (bg.flags.red.state === 'carried') return tick
    }
    return -1
  }

  // Defended first, because the undefended case leaves it carried.
  {
    const guard = s.actors.find((a) => teamOf(a) === 'red')!
    for (let tick = 0; tick < 120; tick++) {
      clearRed()
      guard.pos = { ...bg.flags.red.pos }
      runner.pos = { ...bg.flags.red.pos }
      // Held up rather than fought out: what is being asserted is the rule,
      // not who wins a duel over four seconds.
      guard.hp = guard.maxHp
      runner.hp = runner.maxHp
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    }
    expect('a defended flag stays put', bg.flags.red.state === 'home', bg.flags.red.state)
    expect('and the taker is still there', runner.alive && guard.alive, 'somebody died')
  }

  const lifted = lift()
  expect('their flag can be taken', bg.flags.red.carrierId === runner.id, `${bg.flags.red.carrierId}`)
  expect('and rides its carrier', bg.flags.red.state === 'carried', bg.flags.red.state)
  // The point of the whole rule: undefended it still goes, but not for free.
  expect('but not on touch', lifted > 30, `${lifted} ticks`)

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
    lift()
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
  lift()
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

// A flag being lifted has to look different from a flag standing there, or the
// rule that makes a defender worth anything is one a defender cannot see.
{
  const s = createBattlegroundState(0x51ed, 'flags')
  s.countdown = 0
  const bg = s.bg!
  const wanted = FLAG_PICKUP * L.scale

  const rings = (): number => {
    const circles: Circle[] = []
    drawWorld(recordingCtx(circles), s, 1, s.time, new Effects())
    return circles.filter((c) => Math.abs(c.r - wanted) < wanted * 0.2).length
  }

  const quiet = rings()
  bg.flags.red.taking = FLAG_TAKE * 0.5
  expect('a flag being lifted shows it', rings() === quiet + 1, `${quiet} then ${rings()}`)
  bg.flags.red.taking = 0
  expect('and stops when it is let go', rings() === quiet, `${quiet} then ${rings()}`)
}

// --- the rally ---------------------------------------------------------------
//
// The one thing on a battleground's clock, and therefore the one thing on a
// battleground that can be built, wired into the AI and shipped without ever
// appearing: it spends most of a match not existing, so "nothing was drawn" is
// its resting state and a stub context has nothing to throw. The circles are
// recorded and asserted at each of the three states it has.
for (const kind of ['conquest', 'escort', 'flags'] as const) {
  const s = createBattlegroundState(0x51ed, kind)
  s.countdown = 0
  const bg = s.bg!

  expect(
    `${kind} rally: on the fair axis`,
    Math.abs(bg.rally.pos.x) < 0.001,
    `x = ${bg.rally.pos.x}`,
  )
  expect(
    `${kind} rally: and off the middle`,
    Math.abs(bg.rally.pos.y) > RALLY_RADIUS,
    `y = ${bg.rally.pos.y}`,
  )
  expect(
    `${kind} rally: no rock on it`,
    s.obstacles.every(
      (rock) =>
        Math.hypot(rock.pos.x - bg.rally.pos.x, rock.pos.y - bg.rally.pos.y) >
        rock.radius + RALLY_RADIUS,
    ),
    'a rock is standing in the rally',
  )

  const at = (telegraph: number, settled: boolean): Circle[] => {
    bg.rally.telegraph = telegraph
    bg.rally.settled = settled
    const circles: Circle[] = []
    drawWorld(recordingCtx(circles), s, 1, s.time, new Effects())
    return circles
  }

  // Counted rather than located. A capture point is 105 across and a cart's
  // circle the same, so a radius-only match calls every conquest and escort
  // map a rally — including in the two states where the right answer is that
  // nothing was drawn at all — and the position it would have to be matched
  // against is behind a camera this file cannot reach.
  //
  // Counting works because nothing else differs: the same state is rendered
  // four times over and the only fields touched between renders are the
  // rally's own two. So the ring it puts on the floor is exactly one more
  // circle of its own size than the renders where it is not there.
  const wanted = RALLY_RADIUS * L.scale
  const rings = (circles: Circle[]): number =>
    circles.filter((c) => Math.abs(c.r - wanted) < wanted * 0.25).length

  const quiet = rings(at(RALLY_TELEGRAPH + 20, false))
  const warning = rings(at(RALLY_TELEGRAPH * 0.5, false))
  const live = rings(at(0, false))
  const done = rings(at(0, true))

  expect(
    `${kind} rally: the warning is drawn`,
    warning === quiet + 1,
    `${quiet} rings without it, ${warning} with the warning up`,
  )
  expect(
    `${kind} rally: and it is drawn live`,
    live === quiet + 1,
    `${quiet} rings without it, ${live} live`,
  )
  expect(
    `${kind} rally: nothing once it settles`,
    done === quiet,
    `${quiet} rings before it exists, ${done} after it is over`,
  )
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

    // The line that points at the board of who else is coming. It used to say
    // the raid was rolled at the door, which stopped being the whole truth the
    // moment the board could be opened and changed.
    const rolled = labels.find((t) => t.text.includes('THE RAID'))
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
  const answers = ['raid', 'battleground', 'daily', 'settings'] as const
  expect(
    `${label}: each choice answers as itself`,
    answers.every((want, i) => hitHome(...middle(home.choices[i]!)) === want) &&
      hitHome(...middle(home.record)) === 'record' &&
      hitHome(...middle(home.share)) === 'share',
    `${answers.map((_, i) => hitHome(...middle(home.choices[i]!))).join(',')}`,
  )

  // Raid setup: two fields that open, and the way on. Drawn at both ends of
  // the chain, since the locked labels are a different set.
  drawRaidSetup(stubCtx(), LADDER.length - 1, 5, 'heroic')
  drawRaidSetup(stubCtx(), FIRST_TIER, 25, 'normal')
  const raid = raidSetupLayout()
  const raidRects = [...raid.fields, raid.back, raid.next]
  expect(`${label}: the raid setup fits`, raidRects.every(onScreen), JSON.stringify(raidRects.filter((r) => !onScreen(r))))
  expect(
    `${label}: and its fields do not collide`,
    raidRects.every((r, i) => raidRects.every((o, j) => i === j || !collides(r, o))),
    'two raid controls share space',
  )
  expect(
    `${label}: every raid field answers as itself`,
    raid.fields.every((r, i) => {
      const hit = hitRaidSetup(...middle(r))
      return hit?.kind === 'open' && hit.field === RAID_FIELDS[i]
    }) &&
      hitRaidSetup(...middle(raid.back))?.kind === 'back' &&
      hitRaidSetup(...middle(raid.next))?.kind === 'next',
    'a raid control answered as something else',
  )

  // And with one of them down: the list has to be reachable, has to answer as
  // itself, and has to be the only thing answering — a press past an open
  // list closes it and does nothing else, or you leave the screen by trying
  // to put a list away.
  const counts: Record<string, number> = {
    size: RAID_SIZES.length,
    difficulty: 2,
  }
  for (const field of RAID_FIELDS) {
    drawRaidSetup(stubCtx(), LADDER.length - 1, 5, 'heroic', field)
    drawRaidSetup(stubCtx(), FIRST_TIER, 25, 'normal', field)
    const down = raidSetupLayout(field)
    expect(
      `${label}: the ${field} list has one row per choice`,
      down.options.length === counts[field],
      `${down.options.length} against ${counts[field]}`,
    )
    expect(
      `${label}: and all of it is on the screen`,
      down.options.every(onScreen),
      JSON.stringify(down.options.filter((r) => !onScreen(r))),
    )
    expect(
      `${label}: and its rows do not overlap each other`,
      down.options.every((r, i) => down.options.every((o, j) => i === j || !collides(r, o))),
      'two rows share space',
    )
    expect(
      `${label}: each ${field} row answers as its own choice`,
      down.options.every((r, i) => {
        const hit = hitRaidSetup(middle(r)[0], middle(r)[1], field)
        return hit?.kind === 'choose' && hit.field === field && hit.index === i
      }),
      'a row answered as something else',
    )
    const self = down.fields[RAID_FIELDS.indexOf(field)]!
    // It may cover the fields under it -- that is what opening one is for --
    // but not the field it belongs to and not the two buttons at the bottom.
    // A list sized to the screen rather than to the room under its field ran
    // over both: the way on was printed through, and clamping the bottom
    // alone then pushed the top up over the open control's own answer.
    expect(
      `${label}: the ${field} list clears its own field and the bottom row`,
      down.options.every(
        (r) => !collides(r, self) && !collides(r, down.next) && !collides(r, down.back),
      ),
      'the open list covered a control it has to leave alone',
    )
    expect(
      `${label}: pressing the ${field} field again puts it away`,
      hitRaidSetup(middle(self)[0], middle(self)[1], field)?.kind === 'open',
      'the open field answered as something else',
    )
    // A corner, which no control is ever in.
    expect(
      `${label}: and a press past the ${field} list only dismisses it`,
      hitRaidSetup(w - 1, 1, field)?.kind === 'dismiss',
      `${hitRaidSetup(w - 1, 1, field)?.kind}`,
    )
  }

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
  drawSettings(stubCtx(), false, 1, true, 0, 'You')
  drawSettings(stubCtx(), true, 0, false, 3, 'Somebody')
  const settings = settingsLayout()
  const settingsRects = [
    settings.name,
    settings.sound,
    ...settings.volumes,
    ...settings.cameras,
    settings.backdrop,
    settings.back,
  ]
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
    hitSettings(...middle(settings.name))?.kind === 'name' &&
      hitSettings(...middle(settings.backdrop))?.kind === 'backdrop' &&
      settings.cameras.every((r, i) => {
        const hit = hitSettings(...middle(r))
        return hit?.kind === 'camera' && hit.level === i
      }) &&
      hitSettings(...middle(settings.sound))?.kind === 'sound' &&
      settings.volumes.every((r, i) => {
        const hit = hitSettings(...middle(r))
        return hit?.kind === 'volume' && hit.level === i
      }) &&
      hitSettings(...middle(settings.back))?.kind === 'back',
    'a setting answered as something else',
  )
}

// --- a screenful of choices is one size -------------------------------------
//
// Every stub context above answers `measureText` with a flat ten pixels,
// which means none of them can see the bug this catches: the menu shrinks a
// line that does not fit, and it used to shrink each line on its own. The
// raid screen was three rows of buttons holding five, three and two things,
// so it had three button widths and, once the labels were fitted to them,
// three type sizes at once -- "Choir" at full size beside "Tidebreaker" at a
// third of it. The rows are three fields that open now, all the same width,
// which is what makes one size possible; this is what holds it there.
// Monospace makes the measurement exact the same way it does in `fitText`.
{
  interface Typed {
    text: string
    x: number
    y: number
    size: number
    /** Centred is a heading or a caption; a control writes to its edges. */
    align: string
  }
  const typedCtx = (out: Typed[]): CanvasRenderingContext2D => {
    const noop = () => {}
    const state: Record<string, unknown> = { font: '10px monospace', textAlign: 'left' }
    const sizeOf = () => Number(/([\d.]+)px/.exec(String(state.font))?.[1] ?? 0)
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop) {
        if (prop === 'font') return state.font
        if (prop === 'textAlign') return state.textAlign
        // Monospace: width is linear in the size and in the characters.
        if (prop === 'measureText') {
          return (text: string) => ({ width: 0.6 * sizeOf() * [...text].length })
        }
        if (prop === 'fillText') {
          return (text: string, x: number, y: number) =>
            out.push({ text, x, y, size: sizeOf(), align: String(state.textAlign) })
        }
        if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
          return () => ({ addColorStop: noop })
        }
        if (prop === 'canvas') return { width: L.w, height: L.h }
        return noop
      },
      set(_t, prop, value) {
        state[prop as string] = value
        return true
      },
    }
    return new Proxy({}, handler) as unknown as CanvasRenderingContext2D
  }

  const inside = (r: Box, t: { x: number; y: number }) =>
    t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h

  for (const [label, w, h] of [
    ['desktop 1440x900', 1440, 900],
    ['desktop 960x760', 960, 760],
    ['portrait 390x844', 390, 844],
    ['landscape 844x390', 844, 390],
    ['tiny portrait 320x568', 320, 568],
  ] as const) {
    updateLayout(w, h)
    // Both ends of the chain: the locked rows carry a padlock, which is
    // another character every field has to hold.
    for (const [state, unlocked] of [
      ['everything open', LADDER.length - 1],
      ['first pull', FIRST_TIER],
    ] as const) {
      for (const open of [null, ...RAID_FIELDS] as const) {
        const out: Typed[] = []
        drawRaidSetup(typedCtx(out), unlocked, 5, 'heroic', open)
        const layout = raidSetupLayout(open)
        const boxes: Box[] = [...layout.fields, ...layout.options]
        // An open list is drawn over the headings under it, so being inside a
        // box is not enough to be part of one: a control writes to its left
        // and right edges, and everything centred is a heading or a caption.
        const inControls = out.filter(
          (t) => t.align !== 'center' && boxes.some((r) => inside(r, t)),
        )
        const what = open === null ? 'shut' : `${open} open`

        expect(
          `${label} ${state} ${what}: the fields are written`,
          inControls.length >= layout.fields.length,
          `${inControls.length} lines`,
        )
        const sizes = new Set(inControls.map((t) => t.size))
        expect(
          `${label} ${state} ${what}: at one size`,
          sizes.size === 1,
          JSON.stringify(inControls.map((t) => `${t.text}@${t.size}`)),
        )
        // Nothing is written at a size that is not worth writing.
        expect(
          `${label} ${state} ${what}: and a size worth printing`,
          [...sizes].every((size) => size >= 12),
          `${[...sizes].join(',')}`,
        )
      }

      // Every choice is actually listed when its field is down, locked ones
      // included: the count beside the answer is the only other place the
      // screen says how much is still above you, and it has to agree.
      const out: Typed[] = []
      drawRaidSetup(typedCtx(out), unlocked, 5, 'heroic', 'size')
      expect(
        `${label} ${state}: every raid size is in the list`,
        RAID_SIZES.every((size) => out.some((t) => t.text === `${size}`)),
        JSON.stringify(RAID_SIZES.filter((size) => !out.some((t) => t.text === `${size}`))),
      )
      const listed = RAID_SIZES.filter((size) => doorOpen(unlocked, size, 'normal')).length
      expect(
        `${label} ${state}: and the count says how many are open`,
        out.some((t) => t.text.startsWith(`${listed}/${RAID_SIZES.length}`)),
        JSON.stringify(out.map((t) => t.text).filter((t) => t.includes('/'))),
      )
    }
  }
}

// --- melee are paid for standing where the boss aims -------------------------
//
// What used to be here was the damage spread across the nine damage specs,
// measured in a pull: twenty-four pulls a spec across every boss in the game,
// three and a half thousand of them, about twenty minutes on one core — and
// then not checked. Its three bands are switched off while the rooms are being
// written, for the same reason `balancecheck`'s are, so what the twenty
// minutes bought was one line of numbers nobody gates on, recomputed on every
// push, and moving every push because moving the rooms is the round this
// repository is in.
//
// It is `scripts/specprobe.ts` now — the same measurement, split across the
// cores of whatever runs it, for a person who wants the numbers. It comes back
// here when the bands do; see SUSPENDED in `scripts/balancecheck.ts` for what
// has to settle first.
//
// This is the part of it that was never a simulation. The ranged lead the
// bands bound is allowed because melee bring the raid's cooldowns back sooner,
// and that discount is a constant: it can be read without playing a fight.
{
  expect(
    'melee are paid for standing where the boss aims',
    MELEE_CALL < 1,
    `${MELEE_CALL} of everybody else's count`,
  )
}

// --- lethality ---------------------------------------------------------------
//
// Every ability in the game was numbered against a boss, so each person puts
// out about sixty-five damage a second, and sixty-five a second against a
// raid-sized health bar is over a minute of uninterrupted hitting to kill one
// player. A battleground never gives anyone that minute — the matches
// measured before this spent two thirds of their length with nobody in range
// of anybody — so nobody died and the fights on the point decided nothing.
//
// The bar came down for everyone rather than for one mode, which means the
// raid only stays where it was because everything else denominated in health
// bars came down with it. That is what is checked here: not the multiplier,
// which is free to move, but that it reaches both modes equally, that a
// person's damage was left out of it, and that the mode it produces is one
// where people actually die.
{
  const raid = createState(0x51ed, 0)
  const bg = createBattlegroundState(0x51ed, 'conquest')

  // The whole of the request: one health model, not a battleground exception.
  {
    let mismatched = 0
    let compared = 0
    for (const a of bg.actors) {
      const twin = raid.actors.find((r) => r.classId === a.classId && r.spec === a.spec)
      if (!twin) continue
      compared++
      if (a.maxHp !== twin.maxHp) mismatched++
    }
    expect('a battleground bar is a raid bar', mismatched === 0 && compared > 0, `${mismatched}/${compared} differ`)
  }

  // And that the bar actually moved, or the two agreeing means nothing.
  {
    const lead = raid.actors.find((a) => a.id === PLAYER_ID)!
    const sheet = specOf({ classId: lead.classId, spec: lead.spec }).hp
    expect('the bar is smaller than the sheet', lead.maxHp === Math.round(sheet * HEALTH), `${lead.maxHp} of ${sheet}`)
  }

  // The regression that would put the raid back where it was without anyone
  // noticing: the fight's damage is written in health bars and a person's is
  // not, so the same number has to land differently depending on who threw
  // it. Fired at the same target, from the boss and from a party member.
  {
    const s = createState(0x51ed, 0)
    const victim = s.actors.find((a) => a.id === PLAYER_ID)!
    const mate = s.actors.find((a) => a.faction === 'party' && a.id !== PLAYER_ID)!

    victim.hp = victim.maxHp
    applyDamage(s, victim, 1000, 'none', { sourceId: BOSS_ID, silent: true })
    const fromFight = victim.maxHp - victim.hp

    victim.hp = victim.maxHp
    applyDamage(s, victim, 1000, 'none', { sourceId: mate.id, silent: true })
    const fromPerson = victim.maxHp - victim.hp

    expect(
      "the fight's damage is in health bars and a person's is not",
      fromPerson === 1000 && fromFight === Math.round(1000 * HEALTH),
      `person ${fromPerson}, fight ${fromFight}`,
    )
  }

  // The same rule from the other side, and the trap in it: a battleground
  // numbers its red team from `BOSS_ID` up, so the first of them carries the
  // boss's id exactly. Anything that decides "is this the fight" by id rather
  // than by what the source is will cut that one player's damage in half and
  // read as tuning.
  {
    const s = createBattlegroundState(0x51ed, 'conquest')
    const twin = s.actors.find((a) => a.id === BOSS_ID)!
    const victim = s.actors.find((a) => a.faction === 'party')!
    victim.hp = victim.maxHp
    applyDamage(s, victim, 1000, 'none', { sourceId: twin.id, silent: true })
    expect(
      'a red player sharing the boss id still hits like a player',
      victim.maxHp - victim.hp === 1000,
      `${victim.maxHp - victim.hp}`,
    )
  }

  // Healing is a fraction of a bar, so it moves with the bar too. Without
  // this the raid would quietly get easier: same heals, smaller bars.
  {
    const s = createState(0x51ed, 0)
    const hurt = s.actors.find((a) => a.id === PLAYER_ID)!
    const healer = s.actors.find((a) => a.role === 'healer')!
    hurt.hp = 1
    applyHeal(s, hurt, 1000, healer.id)
    expect('a heal is in health bars', hurt.hp - 1 === Math.round(1000 * HEALTH), `${hurt.hp - 1}`)
  }

  // A respawn hands the body its health back, and a path that read the spec
  // sheet instead of the actor would undo all of this the first time anyone
  // died.
  {
    const s = createBattlegroundState(0x51ed, 'conquest')
    s.countdown = 0
    const rng = new Rng(0x51ed)
    const victim = s.actors.find((a) => a.faction === 'boss')!
    const bar = victim.maxHp
    victim.hp = 0
    victim.alive = false
    let back = -1
    for (let n = 0; n < 60 * 30 && back < 0; n++) {
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
      if (victim.alive) back = victim.hp
    }
    expect('a respawn returns the battleground bar', back === bar, `${back} vs ${bar}`)
  }

  // And the point of the whole thing. Driven the way the harness drives it,
  // through the same reasoning every other body on the map uses.
  //
  // One death a match is the floor, not the target: below that, dying is the
  // end of someone's match rather than a part of it, which is the mode that
  // was measured before the bar moved. The measured figure is comfortably
  // above it — this is here to catch the bar drifting back, not to pin it.
  {
    let deaths = 0
    let matches = 0
    for (const kind of ['conquest', 'flags', 'escort'] as BgKind[]) {
      for (let n = 0; n < 4; n++) {
        const s = createBattlegroundState(4000 + n * 137, kind)
        s.countdown = 0
        const rng = new Rng(4000 + n * 137)
        const pid = s.actors.find((a) => a.isPlayer)!.id
        let wasAlive = true
        while (s.outcome === 'ongoing' && s.time < s.bg!.timeLimit) {
          const player = s.actors.find((a) => a.id === pid)!
          autoPress(s)
          let moveX = 0
          let moveY = 0
          if (player.alive) {
            const goal = aiGoal(s, player)
            if (goal) {
              const dx = goal.x - player.pos.x
              const dy = goal.y - player.pos.y
              const d = Math.hypot(dx, dy)
              if (d > 20) {
                moveX = dx / d
                moveY = dy / d
              }
            }
          }
          step(s, { moveX, moveY, pressed: [] }, rng)
          if (wasAlive && !player.alive) deaths++
          wasAlive = player.alive
        }
        matches++
      }
    }
    expect(
      'a battleground kills the player more than once a match',
      deaths / matches > 1,
      `${(deaths / matches).toFixed(2)} deaths a match over ${matches}`,
    )
  }
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

  expect(`${kind}: the map has terrain`, s.obstacles.length > 0, `${s.obstacles.length}`)

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
      shapes.add(rolled.obstacles.map((r) => `${r.pos.x.toFixed(0)},${r.pos.y.toFixed(0)},${r.radius.toFixed(0)}`).join('|'))

      for (const rock of rolled.obstacles) {
        if (Math.hypot(rock.pos.x, rock.pos.y) + rock.radius > ARENA_RADIUS - 10) bad++
        if (map.nodes.some((node) => dist(rock.pos, node.pos) < NODE_RADIUS + rock.radius)) bad++
        for (const team of ['blue', 'red'] as const) {
          if (dist(rock.pos, map.bases[team]) < BASE_RADIUS + rock.radius) bad++
          for (let i = 0; i < 5; i++) if (inTerrain(rolled.obstacles, spawnPoint(map, team, i), 18)) bad++
        }
        // Mirrored, or one team has cover the other does not.
        const twin = rolled.obstacles.find(
          (o) =>
            Math.abs(o.pos.x + rock.pos.x) < 0.01 &&
            Math.abs(o.pos.y - rock.pos.y) < 0.01 &&
            Math.abs(o.radius - rock.radius) < 0.01,
        )
        if (!twin) bad++
      }
      for (let i = 0; i < rolled.obstacles.length; i++) {
        for (let j = i + 1; j < rolled.obstacles.length; j++) {
          const a = rolled.obstacles[i]!
          const b = rolled.obstacles[j]!
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
  const onObjective = s.obstacles.some(
    (rock) =>
      bg.nodes.some((n) => dist(rock.pos, n.pos) < rock.radius + n.radius) ||
      (['blue', 'red'] as const).some(
        (team) => dist(rock.pos, bg.bases[team]) < rock.radius + BASE_RADIUS,
      ),
  )
  expect(`${kind}: and none of it sits on a point or a base`, !onObjective, 'terrain covers an objective')

  const spawnsClear = (['blue', 'red'] as const).every((team) =>
    [0, 1, 2, 3, 4].every((i) => !inTerrain(s.obstacles, spawnPoint(bg, team, i), 18)),
  )
  expect(`${kind}: nor on a spawn`, spawnsClear, 'somebody spawns inside a rock')

  // Play it out. Nobody may end a tick inside terrain, and the match still has
  // to reach an end rather than deadlocking against a rock.
  let inside = 0
  while (s.outcome === 'ongoing' && s.time < bg.timeLimit + 30) {
    step(s, { moveX: 0.6, moveY: 0.4, pressed: [] }, rng)
    for (const a of s.actors) {
      if (a.alive && inTerrain(s.obstacles, a.pos, a.radius * 0.9)) inside++
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
  const rock = s.obstacles[0]!
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
    const boss = bossOf(s)
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

  // Evenness used to be asserted here, on the dummy, and it is asserted in a
  // pull further down instead. The dummy cannot see the thing the spread
  // actually turns on: nobody moves on it, so the one spec in the game with a
  // cast-time filler never loses a global to the floor and the eight with
  // instant fillers never gain one. It ranked the field the other way round
  // from the game — the shaman last here and first in a pull, the mage the
  // reverse — and it passed at 1.25x for as long as the pull sat at 1.61x.
  //
  // What the dummy is kept for is what it can vouch for: every spec presses,
  // presses at a sane rate, and splits those presses differently from its
  // neighbours. That is below, and the trait measurements after it.
  {
    const quiet = profiles.filter((p) => p.dps <= 0 || p.presses <= 0)
    expect('every damage spec does something on a dummy', quiet.length === 0, quiet.map((p) => p.name).join(', '))
  }

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
    const boss = bossOf(fight)
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

  // And that the window holds more than one press. It used to be a single
  // charge cleared by the first filler after the finisher, which made its
  // eight second duration decorative and the trait worth about five percent
  // while the others were worth fifteen to twenty — the measured spread
  // across the nine damage specs was 1.61x, and nothing was watching.
  {
    const fight = pulled(0x51ed, 0, autoParty(5, balance))
    const actor = fight.actors.find((a) => a.isPlayer)!
    const boss = bossOf(fight)
    boss.pos = { x: 0, y: 0 }
    actor.pos = { x: 240 + boss.radius, y: 0 }
    const kit = specOf(balance).abilities

    // Through `landAbility`, the same path a press takes: the charge is spent
    // where the damage is dealt, and a test that poked the aura directly would
    // not notice if the two came apart.
    const rng = new Rng(1)
    boss.hp = boss.maxHp
    landAbility(fight, actor, ABILITIES[kit.finisher!]!, boss.id, rng)
    let lit = 0
    for (let n = 0; n < 6; n++) {
      const before = boss.hp
      landAbility(fight, actor, ABILITIES[kit.filler!]!, boss.id, rng)
      if (before - boss.hp > closed * 1.3) lit++
      boss.hp = boss.maxHp
    }
    expect('one finisher lights up three fillers', lit === 3, `${lit}`)
  }

  const shadow = pickFor('priest', 'dps')!
  const unmarked = hit(() => {}, shadow, 'filler')
  const marked = hit((fight, actor) => {
    const boss = bossOf(fight)
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
      const boss = bossOf(fight)

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
      const boss = bossOf(fight)

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
      const boss = bossOf(fight)
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

  // The warlock buys its window with health, so both halves have to be true:
  // the bar goes down by what the button says, and the fillers under the
  // window land harder than the ones outside it. Either alone is a class that
  // pays for nothing or gets nothing for paying.
  {
    const lock = SPEC_OPTIONS.find((p) => p.classId === 'warlock')!
    const spec = specOf(lock)
    const tap = ABILITIES[spec.abilities.pact!]!
    const fight = pulled(0x51ed, 0, autoParty(5, lock))
    const you = fight.actors.find((a) => a.isPlayer)!
    const rng = new Rng(1)

    const before = you.hp
    landAbility(fight, you, tap, you.id, rng)
    expect(
      'a tap costs the health it says it does',
      you.hp === before - Math.round(you.maxHp * tap.selfCost!),
      `${before} -> ${you.hp} of ${you.maxHp}`,
    )
    expect('and opens a window of three', getAura(you, 'pact')?.stacks === 3, `${getAura(you, 'pact')?.stacks}`)

    // The filler under the window against the same filler outside it, on a
    // boss standing still with nothing else happening to either of them.
    const filler = ABILITIES[spec.abilities.filler!]!
    const monster = bossOf(fight)
    const hit = (): number => {
      const was = monster.hp
      landAbility(fight, you, filler, monster.id, new Rng(7))
      return was - monster.hp
    }
    const lit = hit()
    clearAura(you, 'pact')
    const plain = hit()
    expect(
      'and the fillers inside it land harder',
      lit > plain * 1.3,
      `${lit} against ${plain}`,
    )

    // And it cannot be pressed down to nothing: health is a resource, and a
    // press you cannot pay for is refused rather than lethal.
    you.hp = Math.round(you.maxHp * tap.selfCost!)
    expect(
      'a tap you cannot afford is refused',
      castBlocker(fight, you, tap, you.id) === 'resource',
      `${castBlocker(fight, you, tap, you.id)}`,
    )
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

// --- affixes -----------------------------------------------------------------
//
// Each one has to change the fight, and none of them may touch a fight that
// did not ask for one: a raid being learned has to be the same on the ninth
// pull as on the first, so an affix that leaked into ordinary play would undo
// the reason the boss is a script at all.
{
  // On whichever boss owns the pools, asked rather than remembered. It was
  // encounter zero, which was the Warden until a boss was put in front of it —
  // and the affix under test multiplies how long hazardous ground lingers, so
  // pointed at a fight with none of it the check compares nothing against
  // nothing. The same mistake is written up two blocks below, about thralls,
  // with the same conclusion: ask the ladder.
  // Whichever fight still lays ground that stays. The pools are retiring, so
  // asking for them by name finds nobody and the affix gets measured against a
  // fight with nothing on the floor -- the exact mistake this comment was
  // written about, arriving from the other direction.
  const pooled = ENCOUNTERS.findIndex((e) =>
    [...(e.always ?? []), ...e.ladder].some((m) => m === 'decay' || m === 'coldflame'),
  )
  const play = (affix: AffixId | null, seconds: number) => {
    const fight = createState(
      0x51ed,
      8,
      autoParty(5, pickFor('mage', 'dps')!),
      'normal',
      pooled,
      affix,
    )
    fight.countdown = 0
    const rng = new Rng(0x51ed)
    let adds = 0
    let lingerTicks = 0
    let healing = 0
    let enraged = false

    while (fight.outcome === 'ongoing' && fight.time < seconds) {
      const before = new Map(fight.actors.map((a) => [a.id, a.hp]))
      step(fight, { moveX: 0, moveY: 0, pressed: [] }, rng)
      adds = Math.max(adds, fight.actors.filter((a) => a.faction === 'boss' && a.alive).length - 1)
      // Any ground still burning, by the one property that says so. Two kinds
      // were named here and both are retiring, which is how a check written
      // against "the affix is about ground rather than one boss's version of
      // it" ended up naming two bosses' versions of it.
      lingerTicks += fight.ground.filter((g) => g.detonated && g.lingering > 0).length
      if (boss(fight).auras.some((a) => a.id === 'enrage')) enraged = true
      for (const a of fight.actors) {
        const was = before.get(a.id)
        if (was === undefined) continue
        if (a.hp > was) healing += a.hp - was
      }
    }
    return { adds, lingerTicks, healing, enraged }
  }

  const plain = play(null, 150)

  // Measured on whichever boss owns thralls, at a size and difficulty that
  // reaches that rung. The affix multiplies a wave, and a boss with no wave
  // has nothing to multiply -- asking the wrong one compares nothing against
  // nothing and passes. It was pinned to encounter index 2 and went on
  // passing until the ladders were redealt and the thralls moved, which is
  // the argument for asking the ladder rather than remembering a number.
  {
    const summoner = ENCOUNTERS.findIndex((e) => [...(e.always ?? []), ...e.ladder].includes('adds'))
    expect('some boss summons at all', summoner >= 0, 'none has thralls')
    const addsUnder = (affix: AffixId | null): number => {
      const fight = createState(
        0x51ed,
        8,
        autoParty(25, pickFor('mage', 'dps')!),
        'heroic',
        summoner,
        affix,
      )
      fight.countdown = 0
      const rng = new Rng(0x51ed)
      let most = 0
      while (fight.outcome === 'ongoing' && fight.time < 150) {
        step(fight, { moveX: 0, moveY: 0, pressed: [0] }, rng)
        most = Math.max(
          most,
          fight.actors.filter(
            (a) =>
              a.faction === 'boss' &&
              a.alive &&
              a.id !== bossOf(fight).id &&
              a.spawn === undefined,
          ).length,
        )
      }
      return most
    }
    const bare = addsUnder(null)
    expect('a boss that summons does', bare > 0, 'no wave ever arrived')
    expect('swarming brings more', addsUnder('swarming') > bare, `${bare} at a time`)
  }
  expect(
    'lingering leaves more on the floor',
    play('lingering', 150).lingerTicks > plain.lingerTicks * 1.3,
    `${plain.lingerTicks}`,
  )
  // Measured on one heal rather than across a pull, for the same reason the
  // rot is: a whole fight's healing is a function of how long the fight lasted
  // and how many bodies were still standing to be healed, and those move for
  // reasons that have nothing to do with the affix. Read over a pull, a
  // faltering raid *out-healed* the plain one — because the plain one wiped at
  // a hundred and three seconds and stopped needing any.
  {
    const healed = (affix: AffixId | null): number => {
      const fight = createState(0x51ed, 0, autoParty(5, pickFor('mage', 'dps')!), 'normal', 0, affix)
      const patient = fight.actors.find((a) => a.faction === 'party' && !a.isPlayer)!
      patient.hp = Math.round(patient.maxHp * 0.5)
      const before = patient.hp
      applyHeal(fight, patient, 1000, patient.id)
      return patient.hp - before
    }
    const bare = healed(null)
    expect('faltering heals for less', healed('faltering') < bare * 0.95, `${bare}`)
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
// same mechanic damage as a mage in cloth. A thrall's weapon is the thing
// armour answers, and the rot is the one it cannot touch, so no stat block is
// the whole answer to a fight.
{
  // Applied by hand rather than watched for in a fight, which is how the rot
  // half below has always been done and is now how both halves are.
  //
  // Driving a floor and reading health was tried twice and measured the wrong
  // thing twice. Everything a fight throws that is not a weapon lands on both
  // of them identically -- the rot on whoever is marked, the tide on everybody
  // -- so any window wide enough to catch a swing catches those too, and the
  // reading came back fifty-four against fifty-four: armour does nothing.
  // Narrowing to the ticks where they differed then measured which of the two
  // a wandering thrall happened to walk to. The claim is about a number, and
  // the number is available directly.
  const s = floorWith({ decay: 16 }, [
    pickFor('warrior', 'dps')!,
    pickFor('warrior', 'tank')!,
    pickFor('priest', 'healer')!,
    pickFor('mage', 'dps')!,
    pickFor('rogue', 'dps')!,
  ])
  const plate = s.actors.find((a) => a.classId === 'warrior' && a.role === 'dps')!
  const cloth = s.actors.find((a) => a.classId === 'mage')!
  const boss = bossOf(s)

  // A thrall's swing, at the size one lands for.
  const swing = 400
  const took = (a: typeof plate, school: 'physical' | 'none'): number => {
    a.alive = true
    a.hp = a.maxHp
    const before = a.hp
    applyDamage(s, a, swing, school, { sourceId: boss.id, silent: true })
    return before - a.hp
  }

  const plateTook = took(plate, 'physical')
  const clothTook = took(cloth, 'physical')
  expect(
    'plate takes less of a weapon than cloth',
    plateTook > 0 && plateTook < clothTook * 0.85,
    `plate ${plateTook}, cloth ${clothTook}`,
  )

  // Magic ignores armour entirely, which is the other half of the claim above:
  // plate is worth something against a swing and nothing against a spell, or
  // the tank's job would be "wear the heaviest thing" rather than "be the one
  // it is aimed at". Any magic number will do; the ground's is to hand.
  const magic = 400
  const magicOnPlate = (() => {
    plate.hp = plate.maxHp
    const before = plate.hp
    applyDamage(s, plate, magic, 'magic', { sourceId: boss.id, silent: true })
    return before - plate.hp
  })()
  const magicOnCloth = (() => {
    cloth.hp = cloth.maxHp
    const before = cloth.hp
    applyDamage(s, cloth, magic, 'magic', { sourceId: boss.id, silent: true })
    return before - cloth.hp
  })()
  expect(
    'and magic goes through armour untouched',
    Math.abs(magicOnPlate - magicOnCloth) < 0.001,
    `plate ${magicOnPlate}, cloth ${magicOnCloth}`,
  )
}

// --- everything that has to reach the boss can -------------------------------
//
// A tank that cannot get back to what wandered off is a tank whose raid is
// being eaten while it jogs. Every tank carries one now and all of them refuse
// to spend it from inside melee, where it would buy nothing.
//
// It used to be the rage tanks alone, on the grounds that a charge is where a
// warrior's rage comes from. That is an argument for the button being free,
// not for the third tank going without: measured against the same fights with
// the same healers, the paladin took 0.019 bars a second and the other two
// took 0.008 and 0.007. Asked for by role now rather than by resource.
{
  const chargers = SPEC_OPTIONS.filter((option) => specOf(option).role === 'tank')
  expect('every tank carries a way back', chargers.length === 3, `${chargers.length}`)

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
    const boss = bossOf(fight)
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
    const boss = bossOf(s)
    const dx = boss.pos.x - player.pos.x
    const dy = boss.pos.y - player.pos.y
    const gap = Math.hypot(dx, dy)
    const closing = gap > 200
    // And out of anything on the floor first, which is the other half of what
    // a player does. Without it the stand-in stood in every pool the fight
    // dropped and died about a minute in, and a corpse presses nothing — the
    // rotation was being measured against a body.
    let moveX = closing ? dx / gap : 0
    let moveY = closing ? dy / gap : 0
    for (const g of s.ground) {
      const away = Math.hypot(player.pos.x - g.pos.x, player.pos.y - g.pos.y)
      if (away <= g.radius + 20) {
        moveX = (player.pos.x - g.pos.x) / (away || 1)
        moveY = (player.pos.y - g.pos.y) / (away || 1)
      }
    }
    step(s, { moveX, moveY, pressed }, rng)
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
  const nothing = gameMessage({ kills: {}, clean: {}, damage: 0 })
  expect(
    'a first-time share claims nothing',
    !nothing.includes('bosses down') && !nothing.includes('floor'),
    nothing,
  )
  const some = gameMessage({
    kills: { [ENCOUNTERS[0]!.id]: 118.4, [ENCOUNTERS[1]!.id]: 204.25 },
    clean: {},
    damage: 0,
  })
  expect('a played share counts the bosses', some.includes(`2 of ${ENCOUNTERS.length} bosses down`), some)
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
 * A fight built to order, for a mechanic no boss owns.
 *
 * Twenty-seven mechanics are still implemented and belong to nobody -- see
 * `RETIRING` -- and each is live code until the commit that takes it out. A
 * check cannot reach them through a boss, because no boss's table has a
 * cadence for them, so it says which it wants and `SimState.imposed` puts
 * them on the boss in place of its own.
 *
 * It dies with the list. Every caller here names something on it.
 */
function floorWith(
  every: Partial<Record<MechanicId, number>>,
  party?: Parameters<typeof createState>[2],
): SimState {
  const s = pulled(0x51ed, 8, party, 'normal', 0)
  s.countdown = 0
  // Through the same rule the ladders use, so a fight asked for the breath out
  // is one that also has air to breathe. Without it a check can ask for half a
  // mechanic and get it.
  const filled: Partial<Record<MechanicId, number>> = { ...every }
  for (const id of withRequired(Object.keys(every) as MechanicId[])) {
    if (filled[id] === undefined) filled[id] = 8
  }
  s.imposed = filled

  // And the opening timers, which were seeded from the boss's own table and
  // would otherwise start clocks for mechanics this fight is not having --
  // that is how a check about one mechanic ends up failing for a reason that
  // has nothing to do with what it is testing.
  //
  // Over every mechanic rather than a list written out here. It used to be
  // forty-odd hand-written lines, one per id, which is a list that is wrong
  // the day somebody adds a mechanic and never says so.
  for (const id of MECHANIC_IDS) {
    const rate = filled[id]
    // The two that need something else to have happened first come at nine
    // tenths rather than at a little under half: the breath out is what was
    // breathed in, and the empowered one is one of a wave that has to arrive.
    s.next[id] = rate === undefined ? 0 : rate * (id === 'pungent' || id === 'empower' ? 0.9 : 0.45)
  }
  return s
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
  // Asked of the renderer rather than assumed, so the check cannot be measuring
  // a camera the game does not use.
  const cam = focusOn(scene.showing)
  const on = alive.filter(
    (a) =>
      Math.abs((a.pos.x - cam.x) * L.scale * zoom) < L.w / 2 &&
      Math.abs((a.pos.y - cam.y) * L.scale * zoom) < L.h / 2,
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
    if (i % 30 === 0) seen.push(onScreenShare(scene, backdropZoom()))
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
    transforms.some(([x, y]) => x === backdropZoom() && y === backdropZoom()),
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

  // A phone holds a third of the width, so the same zoom cuts more off the
  // sides. Checked separately rather than assumed to follow from the desktop
  // one, since the framing is what the zoom trades against.
  updateLayout(390, 844)
  const portrait = new Ambience()
  let tightest = 1
  for (let i = 0; i < 60 * 90; i++) {
    portrait.advance(1 / 60)
    if (i % 30 === 0) tightest = Math.min(tightest, onScreenShare(portrait, backdropZoom()))
  }
  expect('and does not empty a phone either', tightest > 0, `${(tightest * 100).toFixed(0)}% at its worst`)
  updateLayout(1440, 900)

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

// --- the numbers have to be readable over the floor, not just present ------
//
// There was already a check that a hit produces a number. What there was no
// check for was whether anybody could read it: twelve pixels of pale red with
// no outline over a magenta puddle is texture rather than a number, and the
// alpha started falling on the frame it appeared, so it spent most of its
// life half gone.
{
  updateLayout(1440, 900)

  interface Drawn {
    text: string
    x: number
    y: number
    font: string
    fill: string
    alpha: number
    stroked: boolean
  }

  const paint = (s: SimState): Drawn[] => {
    const drawn: Drawn[] = []
    const state = { font: '', fillStyle: '', globalAlpha: 1, strokeStyle: '' }
    const stroked = new Set<string>()
    const spy = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'strokeText') {
            return (text: string, x: number) => stroked.add(`${text}@${Math.round(x)}`)
          }
          if (prop === 'fillText') {
            return (text: string, x: number, y: number) =>
              drawn.push({
                text,
                x,
                y,
                font: state.font,
                fill: state.fillStyle,
                alpha: state.globalAlpha,
                stroked: stroked.has(`${text}@${Math.round(x)}`),
              })
          }
          if (prop === 'measureText') return () => ({ width: 10 })
          if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
            return () => ({ addColorStop: () => {} })
          }
          if (prop === 'canvas') return { width: L.w, height: L.h }
          return () => {}
        },
        set(_t, prop, value) {
          if (prop === 'font') state.font = String(value)
          if (prop === 'fillStyle') state.fillStyle = String(value)
          if (prop === 'strokeStyle') state.strokeStyle = String(value)
          if (prop === 'globalAlpha') state.globalAlpha = Number(value)
          return true
        },
      },
    ) as unknown as CanvasRenderingContext2D
    drawWorld(spy, s, 1, 0, new Effects(false))
    return drawn
  }

  // "bold 18px ui-monospace, monospace" — the number is the only number in it.
  const sized = (row: Drawn): number => Number.parseInt(/(\d+)px/.exec(row.font)?.[1] ?? '0', 10)

  const s = pulled(0x51ed, 0)
  s.countdown = 0
  const b = bossOf(s)
  const player = s.actors.find((a) => a.isPlayer)!

  s.texts.length = 0
  pushText(s, b.pos, '-120', 'damage', 120)
  pushText(s, b.pos, '-1400', 'damage', 1400)
  pushText(s, player.pos, '-300', 'taken', 300)
  pushText(s, player.pos, '+450', 'heal', 450)
  const drawn = paint(s).filter((row) => row.text.startsWith('-') || row.text.startsWith('+'))

  expect('every number is outlined', drawn.every((row) => row.stroked), JSON.stringify(drawn.map((r) => [r.text, r.stroked])))

  const small = drawn.find((row) => row.text === '-120')!
  const big = drawn.find((row) => row.text === '-1400')!
  expect('a big hit is drawn bigger', sized(big) > sized(small) + 3, `${sized(small)} then ${sized(big)}`)
  // The floor is what stops these drifting back down. They were twelve
  // pixels once, which over a floor full of colour is texture rather than a
  // number — and then they were doubled outright, so the floor moves with
  // them. A floor that stays where it was stops guarding anything.
  expect('and a small one is still legible', sized(small) >= 34, `${sized(small)}`)

  const status = (() => {
    s.texts.length = 0
    pushText(s, player.pos, 'Too close', 'miss', 0)
    return paint(s).find((row) => row.text === 'Too close')!
  })()
  expect('and a message about why a press did nothing is too', sized(status) >= 30, `${sized(status)}`)

  // Doubling the glyphs without doubling the lanes would put twice-as-wide
  // numbers into lanes built for the old ones. Four hits at once is exactly
  // the case the fan-out exists for, so it is the case that has to be checked:
  // consecutive ids take consecutive lanes, and the outermost two must still
  // land clear of each other.
  const fanned = (() => {
    s.texts.length = 0
    for (const [text, power] of [['-1', 1], ['-2', 1], ['-3', 1], ['-4', 1]] as const) {
      pushText(s, b.pos, text, 'damage', power)
    }
    // Halfway through the life, where the drift has opened up.
    for (const t of s.texts) t.age = 0.55
    const rows = paint(s).filter((row) => /^-[1-4]$/.test(row.text))
    return rows.map((row) => ({ text: row.text, x: row.x, size: sized(row) }))
  })()

  expect('four at once take four lanes', fanned.length === 4, `${fanned.length}`)
  const xs = fanned.map((f) => f.x).sort((a, b2) => a - b2)
  const tightest = Math.min(...xs.slice(1).map((x, i) => x - xs[i]!))
  // The fan does not pull multi-digit numbers fully apart and never did — two
  // four-character numbers are wider than any lane gap. What it does is offset
  // them enough to read as separate, and the measure of that is the gap
  // against the glyph size. That ratio has been about half a glyph since the
  // lanes existed, so half a glyph is what is asserted: it holds today, and it
  // breaks the moment the font grows without the lanes growing with it.
  expect(
    'and the lanes grew with the glyphs',
    tightest >= fanned[0]!.size * 0.5,
    `lane gap ${tightest.toFixed(0)} against ${fanned[0]!.size}px glyphs`
  )

  const dealt = drawn.find((row) => row.text === '-1400')!
  const taken = drawn.find((row) => row.text === '-300')!
  const healed = drawn.find((row) => row.text === '+450')!
  expect(
    'what you deal does not look like what lands on you',
    dealt.fill !== taken.fill,
    `${dealt.fill} against ${taken.fill}`,
  )
  expect('and a heal looks like neither', healed.fill !== dealt.fill && healed.fill !== taken.fill, healed.fill)

  // A burst of hits on one target has to read as several numbers rather than
  // one smudge, which means consecutive ones cannot share a column.
  s.texts.length = 0
  for (let i = 0; i < 4; i++) pushText(s, b.pos, `-${100 + i}`, 'damage', 400)
  // Aged a little, since they all start on the same point and fan out as they
  // rise — on the frame they appear they are supposed to be together.
  for (const t of s.texts) t.age = 0.5
  const burst = paint(s).filter((row) => row.text.startsWith('-'))
  const columns = new Set(burst.map((row) => Math.round(row.x)))
  expect('four hits at once are four numbers', columns.size === 4, `${columns.size} columns`)

  // And they are at full strength for long enough to be read, rather than
  // fading from the frame they appear on.
  s.texts.length = 0
  pushText(s, b.pos, '-999', 'damage', 900)
  const young = paint(s).find((row) => row.text === '-999')!
  s.texts[0]!.age = 0.4
  const middle = paint(s).find((row) => row.text === '-999')!
  s.texts[0]!.age = 1.0
  const old = paint(s).find((row) => row.text === '-999')!
  expect('a number holds while it can be read', middle.alpha >= 0.99, `${middle.alpha}`)
  expect('and is gone by the end', old.alpha < 0.3, `${old.alpha}`)
  expect('and starts solid', young.alpha >= 0.99, `${young.alpha}`)
}

// --- the camera setting ----------------------------------------------------
//
// A multiplier on the fitted arena radius rather than a transform of its own,
// so everything drawn in world units moves together and nothing else has to
// know the camera exists. What it trades is warning for legibility: the floor
// runs off the edges, and the minimap — which is not affected — is what is
// left saying where the things off screen are.
{
  updateLayout(1440, 900)
  const at = (level: number) => {
    setZoomLevel(level, 1440, 900)
    return { scale: L.scale, arena: L.arenaR, map: L.mapR }
  }

  const far = at(0)
  const near = at(1)
  const closest = at(ZOOM_STEPS.length - 1)

  expect('the first step is the fitted framing', ZOOM_STEPS[0] === 1, `${ZOOM_STEPS[0]}`)
  // Not the default, though. Fitting the whole arena on screen is the wrong
  // framing for what the game asks you to do — read your own token, your own
  // numbers and the shape under your feet — and the arena's edges are what
  // the minimap is for.
  expect('but not where the camera starts', DEFAULT_ZOOM > 0, `${DEFAULT_ZOOM}`)
  expect('a step in draws the world larger', near.scale > far.scale, `${far.scale} then ${near.scale}`)
  expect('and every step after it', closest.scale > near.scale, `${near.scale} then ${closest.scale}`)
  expect(
    'the arena keeps up with the world',
    Math.abs(closest.arena / closest.scale - far.arena / far.scale) < 0.001,
    'the floor and its edge disagree',
  )
  expect(
    'the minimap does not move with it',
    closest.map === far.map,
    `${far.map} then ${closest.map}`,
  )
  expect('one name per step', ZOOM_NAMES.length === ZOOM_STEPS.length, `${ZOOM_NAMES.length}`)

  // Out of range on either side is the framing it already had, not a crash or
  // a blank screen.
  setZoomLevel(99, 1440, 900)
  expect('a wild level clamps', zoomLevel() === ZOOM_STEPS.length - 1, `${zoomLevel()}`)
  setZoomLevel(-5, 1440, 900)
  expect('and so does a negative one', zoomLevel() === 0, `${zoomLevel()}`)

  // The menus are drawn behind their own camera, and it must not compound
  // with this one: at the closest setting a background multiplied rather than
  // divided would sit at three and a half times, where both teams walk out of
  // frame.
  // Measured off what the scene actually applies rather than off what it is
  // supposed to apply: asking the check to compute the intended factor is
  // asking it to agree with the bug.
  //
  // The room is pinned before each reading, and that is the whole of what
  // makes this a check rather than a coin toss. `L.scale` is the fitted radius
  // over the room's reach, so a scene in a smaller room is at a different
  // scale for a reason that has nothing to do with the camera -- and an
  // `Ambience` rolls its scene with `Math.random()`. Once fights stopped all
  // sharing one room, two readings taken from two instances were comparing
  // two rooms, and this passed or failed on which pair came up. It failed at
  // 1.31 against 0.88, which is 920 over 620 and not a camera at all.
  const worldScale = (level: number): number => {
    setWorldRoom(ROUND_ARENA)
    setZoomLevel(level, 1440, 900)
    const applied: number[] = []
    const spy = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'scale') return (x: number) => applied.push(x)
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
    const scene = new Ambience()
    scene.draw(spy)
    return L.scale * applied.reduce((a, b) => a * b, 1)
  }

  const loose = worldScale(0)
  const tight = worldScale(ZOOM_STEPS.length - 1)
  expect(
    'the background sits at the same distance whatever the camera is set to',
    Math.abs(loose - tight) < 0.0001,
    `${loose.toFixed(4)} against ${tight.toFixed(4)}`,
  )

  // Put back to what a player actually gets, so everything checked after this
  // point is checked at the framing the game ships with.
  setZoomLevel(DEFAULT_ZOOM, 1440, 900)
}

// --- what the fight says, at a size somebody can read ----------------------
//
// The chat is where the tells live — a phase break, a call for a heal, the
// line before the ring. It was eleven pixels of dim grey in a corner, which
// is a thing nobody reads during a pull. Bigger lines need more room, so the
// five of them have to still fit above where they start.
for (const [label, w, h] of [
  ['desktop 1440x900', 1440, 900],
  ['portrait 390x844', 390, 844],
  ['landscape 844x390', 844, 390],
  ['tiny portrait 320x568', 320, 568],
] as const) {
  updateLayout(w, h)
  const s = pulled(0x51ed, 0)
  s.countdown = 0
  for (let i = 0; i < 5; i++) {
    s.chat.push({ id: i, speaker: 'The Drowned Warden', text: 'The tide rises!', age: 0 })
  }

  const labels: Label[] = []
  drawHud(recordingCtx([], labels), s, touchView(false))
  const lines = labels.filter((l) => l.text.includes('The tide rises!'))
  expect(`${label}: every line of it is drawn`, lines.length === 5, `${lines.length}`)
  expect(
    `${label}: and all of them on the screen`,
    lines.every((l) => l.y > 0 && l.y < h),
    JSON.stringify(lines.map((l) => Math.round(l.y))),
  )
  // Below the party frames, which is the other thing down the left side.
  expect(
    `${label}: below what is already there`,
    lines.every((l) => l.y > L.partyY),
    `${L.partyY} against ${Math.min(...lines.map((l) => l.y))}`,
  )
}

// --- a heal goes to somebody who needs one ---------------------------------
//
// Every press aimed at `playerTarget`, with one exception carved out for a
// taunt. That is right for everything that hurts something and wrong for the
// one kind that does not: a healer's every button was aimed at the boss, so
// the bolt flew at it, the heal landed on it, and the player was credited
// with the healing. A discipline priest's filler handed the Drowned Warden
// 473 health a press.
{
  const healers = [
    pickFor('priest', 'healer')!,
    pickFor('druid', 'healer')!,
    pickFor('paladin', 'healer')!,
    pickFor('shaman', 'healer')!,
  ].filter(Boolean)
  expect('there are healers to check', healers.length >= 2, `${healers.length}`)

  for (const healer of healers) {
    const label = specLabel(healer)
    const s = pulled(0x51ed, 0, [healer, ...DEFAULT_PARTY.slice(1)])
    s.countdown = 0
    const player = s.actors.find((a) => a.isPlayer)!
    const b = bossOf(s)
    const mate = s.actors.find((a) => a.faction === 'party' && !a.isPlayer)!
    mate.hp = Math.round(mate.maxHp * 0.35)

    const bar = abilityBar({ classId: player.classId, spec: player.spec })
    const bossBefore = b.hp

    // Every healing button on the bar, not just the filler.
    let pressed = 0
    for (let slot = 0; slot < bar.length; slot++) {
      const ability = ABILITIES[bar[slot] ?? '']
      if (!ability || ability.kind !== 'heal') continue
      pressed++

      const aimed = pressTarget(s, ability, player)
      const at = s.actors.find((a) => a.id === aimed)
      expect(
        `${label}: ${ability.name} is aimed at somebody on your side`,
        at !== undefined && at.faction === 'party',
        `${at?.name ?? 'nobody'}`,
      )
    }
    expect(`${label}: has heals on the bar`, pressed > 0, 'none of its buttons heal')

    // And the whole way through: press, cast, bolt, landing.
    const rng = new Rng(7)
    const slot = bar.findIndex((id) => ABILITIES[id ?? '']?.kind === 'heal')
    let flew: string | null = null
    for (let i = 0; i < 150; i++) {
      step(s, { moveX: 0, moveY: 0, pressed: i === 0 ? [slot] : [] }, rng)
      for (const p of s.projectiles) {
        if (p.sourceId !== player.id) continue
        flew = s.actors.find((a) => a.id === p.targetId)?.faction ?? 'gone'
      }
    }
    expect(`${label}: and the bolt goes the same way`, flew !== 'boss', `${flew}`)
    expect(
      `${label}: the boss gains nothing from it`,
      b.hp <= bossBefore,
      `${bossBefore} -> ${b.hp}`,
    )
    const credited = s.tally[player.id]?.healing ?? 0
    expect(`${label}: and the healing lands on the party`, credited > 0, `${credited}`)
  }

  // The button's light has to answer the same question the press does, or it
  // is a light about something else: a healer's buttons were lit against the
  // distance to the boss, which is not where any of them were going.
  {
    const s = pulled(0x51ed, 0, [pickFor('priest', 'healer')!, ...DEFAULT_PARTY.slice(1)])
    s.countdown = 0
    const player = s.actors.find((a) => a.isPlayer)!
    const mate = s.actors.find((a) => a.faction === 'party' && !a.isPlayer)!
    mate.hp = Math.round(mate.maxHp * 0.3)
    // Everybody where they can be reached, and the boss a long way off.
    player.pos = { x: 0, y: 0 }
    mate.pos = { x: 40, y: 0 }
    boss(s).pos = { x: 900, y: 0 }
    const bar = abilityBar({ classId: player.classId, spec: player.spec })
    const heal = bar.find((id) => ABILITIES[id ?? '']?.kind === 'heal')!
    expect(
      'a heal is ready when its target is in reach',
      slotStatus(s, player, heal) === 'ready',
      slotStatus(s, player, heal),
    )
    mate.pos = { x: 900, y: 40 }
    expect(
      'and out of range when they are not',
      slotStatus(s, player, heal) === 'range',
      slotStatus(s, player, heal),
    )
  }

  // A taunt still goes to the boss, and everything that hurts still goes to
  // whatever is being hit.
  {
    const s = pulled(0x51ed, 0, autoParty(10, pickFor('warrior', 'tank')!))
    const player = s.actors.find((a) => a.isPlayer)!
    const taunt = ABILITIES['taunt']!
    expect('a taunt still goes to the boss', pressTarget(s, taunt, player) === BOSS_ID, 'it did not')
    const swing = ABILITIES['shield_slam'] ?? ABILITIES['strike']
    if (swing) {
      const at = s.actors.find((a) => a.id === pressTarget(s, swing, player))
      expect('and a swing still goes at something hostile', at?.faction === 'boss', `${at?.name}`)
    }
  }
}

// --- who is who, over the tokens -------------------------------------------
//
// The name used to be drawn only while somebody was at full health, because a
// hurt body already carries a bar where the name would go. That meant a name
// disappeared at the exact moment its owner became worth looking at.
{
  updateLayout(1440, 900)
  const s = pulled(0x51ed, 0)
  s.countdown = 0
  const party = s.actors.filter((a) => a.faction === 'party')
  const wounded = party[1]!
  wounded.hp = Math.round(wounded.maxHp * 0.4)

  const labels: Label[] = []
  drawWorld(recordingCtx([], labels), s, 1, 0, new Effects(false))
  const said = labels.map((l) => l.text)

  expect(
    'everyone on your side is named',
    party.every((a) => said.includes(a.name)),
    said.join(' | '),
  )
  expect(
    'including whoever is hurt',
    said.includes(wounded.name),
    'the name went when the health did',
  )

  // Above the bar rather than instead of it: the bar keeps the place it had,
  // and the name goes over the top of it. Measured on one person either side
  // of taking damage rather than on two people, who are standing in different
  // places and would be compared on where they stand.
  const whereName = (): number => {
    const drawn: Label[] = []
    drawWorld(recordingCtx([], drawn), s, 1, 0, new Effects(false))
    return drawn.find((l) => l.text === wounded.name)!.y
  }
  const low = whereName()
  wounded.hp = wounded.maxHp
  const high = whereName()
  expect('a hurt name moves up to make room for the bar', low < high, `${low} against ${high}`)
  wounded.hp = Math.round(wounded.maxHp * 0.4)

  // The boss has a frame of its own across the top of the screen; a thrall is
  // one of a crowd and has nothing worth saying.
  expect('the boss is not labelled twice', !said.includes(boss(s).name), said.join(' | '))

  // Everyone, at every size and on every screen. There was a rule that
  // withheld names from a twenty-five man on a small screen on the grounds
  // that twenty-five of them is mush — but a name you cannot rely on being
  // there is worse than a crowded one, and picking a particular body out of
  // the crowd is exactly what the raid size makes hard.
  const raid = pulled(0x51ed, 0, autoParty(25, pickFor('mage', 'dps')!))
  for (const [label, w, h] of [
    ['a phone', 360, 640],
    ['a desktop', 1440, 900],
  ] as const) {
    updateLayout(w, h)
    for (const [size, fight] of [
      ['a five-man', s],
      ['a twenty-five man', raid],
    ] as const) {
      const drawn: Label[] = []
      drawWorld(recordingCtx([], drawn), fight, 1, 0, new Effects(false))
      const missing = fight.actors.filter(
        (a) => a.faction === 'party' && !drawn.some((l) => l.text === a.name),
      )
      expect(`${size} on ${label} names everybody`, missing.length === 0, `${missing.length} unnamed`)
    }
  }
  updateLayout(1440, 900)
}

// --- a name of your own ----------------------------------------------------
//
// Anything at all can be typed into a text field, and all of it ends up drawn
// over a token and written into a record that outlives the session: control
// characters, a hundred spaces, an empty string, a line longer than the
// arena. So what a typed name becomes is the part worth checking.
{
  expect('an ordinary name survives', cleanName('Bramble') === 'Bramble', cleanName('Bramble'))
  expect('nothing at all is the default', cleanName('') === DEFAULT_NAME, cleanName(''))
  expect('and so is a field of spaces', cleanName('     ') === DEFAULT_NAME, cleanName('     '))
  expect(
    'the ends are trimmed',
    cleanName('  Wren  ') === 'Wren',
    `"${cleanName('  Wren  ')}"`,
  )
  expect(
    'a long one is cut to what fits over a token',
    cleanName('Bartholomewthelongwinded').length === NAME_MAX,
    `${cleanName('Bartholomewthelongwinded').length}`,
  )
  const broken = cleanName('a\nb\tc')
  expect('newlines and tabs become spaces rather than vanishing', broken === 'a b c', `"${broken}"`)
  expect(
    'and a run of whitespace collapses',
    cleanName('a       b') === 'a b',
    `"${cleanName('a       b')}"`,
  )
  // Counted in characters rather than in code units, or a name of emoji comes
  // out cut in half — literally, into an unpaired surrogate.
  const wide = cleanName('🐟🐟🐟🐟🐟🐟🐟🐟🐟🐟🐟🐟🐟🐟🐟🐟')
  expect('a wide name is cut where a character ends', [...wide].length === NAME_MAX, `${[...wide].length}`)
  // A lone surrogate is what a cut through the middle of a character leaves.
  // Testing the last code unit would fail on every well-formed emoji, since
  // that is a low surrogate too — the question is whether any of them stands
  // by itself.
  expect(
    'and is not left broken in half',
    [...wide].every((ch) => {
      const code = ch.codePointAt(0) ?? 0
      return code < 0xd800 || code > 0xdfff
    }),
    wide,
  )

  // It reaches the fight, and only the player.
  const s = pulled(0x51ed, 0)
  s.countdown = 0
  nameThePlayer(s, 'Bramble')
  const player = s.actors.find((a) => a.isPlayer)!
  expect('the player wears it', player.name === 'Bramble', player.name)
  expect(
    'and nobody else is renamed',
    s.actors.filter((a) => a.name === 'Bramble').length === 1,
    s.actors.map((a) => a.name).join(','),
  )

  // Including over the token, which is where it is for.
  updateLayout(1440, 900)
  const labels: Label[] = []
  drawWorld(recordingCtx([], labels), s, 1, 0, new Effects(false))
  expect(
    'it is drawn over the token',
    labels.some((l) => l.text === 'Bramble'),
    labels.map((l) => l.text).join(' | '),
  )

  // And a name typed as nothing does not leave a nameless body on the floor.
  nameThePlayer(s, '   ')
  expect('an empty name falls back rather than blanking', player.name === DEFAULT_NAME, `"${player.name}"`)

  // The simulation is not told. A fight has to replay identically from its
  // seed whoever is playing it, and the harness must not depend on storage.
  const fresh = createState(0x51ed, 0)
  expect(
    'the simulation builds the slot as it always did',
    fresh.actors.find((a) => a.isPlayer)?.name === DEFAULT_NAME,
    `${fresh.actors.find((a) => a.isPlayer)?.name}`,
  )
}


// --- no mechanic's branch answers for another mechanic --------------------
//
// Read off the source rather than run, because what this catches is a shape
// that behaves correctly nearly always. Every hazard in the ground loop and
// every entry in `currentDanger` is an `if (g.kind === '...')` arm, and
// adjacent arms tend to open with the same three or four lines -- decrement
// the telegraph, return if it has not run out, mark it detonated. When two of
// them are written at the same time and merged, a diff can hand one arm's
// closing body to the other. The result compiles, reads fine, and quietly
// resolves one mechanic with another's damage.
//
// It happened twice in the round that added eight mechanics. Both times it was
// caught by hand, which is not a thing to rely on twice more.
{
  // From the working directory, not from `import.meta.url`. `npm run check`
  // bundles this file into node_modules/.cache and runs it from there, so a
  // path relative to the module resolves inside node_modules and the read
  // throws -- which is exactly the check that passed for a week under
  // `npx tsx` and had never once run in CI.
  const armed = readFileSync(resolve(process.cwd(), 'src/sim/boss.ts'), 'utf8')
  const advising = readFileSync(resolve(process.cwd(), 'src/sim/ai.ts'), 'utf8')
  let arms = 0
  const mixed: string[] = []
  for (const [file, source] of [['boss.ts', armed], ['ai.ts', advising]] as const) {
    for (const opener of source.matchAll(/if \((?:[^()]|\([^()]*\))*g\.kind === '(\w+)'(?:[^()]|\([^()]*\))*\) \{/g)) {
      const own = new Set([...opener[0].matchAll(/g\.kind === '(\w+)'/g)].map((m) => m[1]!))
      let depth = 0
      let cursor = opener.index + opener[0].length - 1
      for (; cursor < source.length; cursor++) {
        if (source[cursor] === '{') depth++
        else if (source[cursor] === '}' && --depth === 0) break
      }
      const body = source.slice(opener.index + opener[0].length, cursor)
      arms++
      for (const id of MECHANIC_IDS) {
        if (own.has(id)) continue
        if (new RegExp(`boss_${id}\\b|'${id}'`).test(body)) {
          mixed.push(`${file}: the ${[...own].join('/')} arm names ${id}`)
        }
      }
    }
  }
  // Counted twice, by two different readers, because the scan above is a
  // regular expression walking source text and a regular expression that has
  // stopped matching reports no mixed-up arms at all -- which is the shape of
  // pass this file has been bitten by twice.
  //
  // The floor used to be a typed-in thirty, from a round when there were
  // seventeen kinds of ground. There are two now and one arm between them, so
  // a fixed number is a number that has to be edited every time the roster
  // moves. This asks the plainer counter to agree with the parser instead.
  const plainly = [armed, advising]
    .join('\n')
    .split('\n')
    .filter((line) => /if \(g\.kind === '/.test(line)).length
  expect('every hazard arm was read', arms === plainly && arms > 0, `${arms} of ${plainly}`)
  expect('and none of them answers for another mechanic', mixed.length === 0, mixed.join('; '))
}

// --- what the fight puts on a body has to be visible ------------------------
//
// The Reeking Host is the one boss that puts nothing on the floor and summons
// nothing: every demand it makes is an aura. Five of them -- the spore, the
// reek, the inoculation, the swelling and the boss's own held breaths -- were
// drawn in no place at all, so a pull against it was floating numbers over a
// party standing in an empty room, and the two that have a *radius* had nothing
// saying where it was. A player found that, not a check.
//
// The rule that should have caught it was pointed the wrong way. There is one
// saying every picture must belong to a mechanic something throws, and one
// saying a boss throws what its ladder sells -- and between them nothing asks
// whether a mechanic reaches the screen at all when its whole expression is a
// mark on somebody.
{
  // Both surfaces a player looks at, not one. The first version of this asked
  // only about the world and named five marks that are on the party frames --
  // a check that is right about the shape of the problem and wrong about where
  // the answer is allowed to live fails honest code, and gets widened.
  const source = [
    readFileSync(resolve(process.cwd(), 'src/render/draw.ts'), 'utf8'),
    readFileSync(resolve(process.cwd(), 'src/render/hud.ts'), 'utf8'),
  ].join('\n')
  // Every aura this fight can put on a body, read off the schedulers rather
  // than listed here: a list would go stale the first time one is added, which
  // is the failure this whole check exists because of.
  const applied = new Set<string>(
    [...readFileSync(resolve(process.cwd(), 'src/sim/boss.ts'), 'utf8').matchAll(
      /(?:add|stack)Aura\([^,]+, '(\w+)'/g,
    )].map((m) => m[1]!),
  )
  const unseen = [...applied].filter((id) => !source.includes(`'${id}'`))
  expect(
    'every mark the fight applies reaches a picture somewhere',
    unseen.length === 0,
    `${unseen.join(', ')} reach no picture`,
  )
}

// --- and the frame can tell two of them apart -------------------------------
//
// A chip is one character and there are thirty-eight auras. Seven begin with S
// and nine with R, so the first letter was never an identifier -- the spore and
// the swelling were the same chip, and naming one exception moved the collision
// onto the priest's ward rather than removing it.
{
  const letters = Object.values(MARK_LETTER) as string[]
  expect(
    "no two of the fight's marks share a letter",
    new Set(letters).size === letters.length,
    letters.join(''),
  )
  // Capitals are the fight's and lower case is the raid's own, so the two
  // families cannot be confused even where a letter is reused across them.
  expect(
    "and the fight's marks are the capitals",
    letters.every((l) => l === l.toUpperCase() && l.length === 1),
    letters.filter((l) => l !== l.toUpperCase()).join(','),
  )
}

// --- every rung a boss sells actually happens ------------------------------
//
// The simplest property there is, and nothing asserted it until the ladders
// had already been dealt out across five bosses through eight merges. A
// mechanic lost in a merge -- a schedule call dropped, an arm closed with the
// wrong body -- does not look like a broken build. It looks like a boss that
// is slightly easier than expected, which is indistinguishable from tuning.
//
// Three of the thirty arrive as bodies rather than as effects and each is told
// apart by a different field: the bell and the jar carry `spawn`, the stalker
// carries its quarry, and a thrall is the one with neither. Written out here
// because getting that wrong is how a first draft of this check reported two
// mechanics missing that were firing perfectly well.
{
  for (let b = 0; b < ENCOUNTERS.length; b++) {
    const encounter = ENCOUNTERS[b]!
    const kit = encounterKit(encounter, 25, 'heroic')
    const seen = new Set<string>()
    for (let n = 0; n < 3; n++) {
      const seed = 1000 + n * 137
      const s = createState(seed, 8, autoParty(25, pickFor('mage', 'dps')!), 'heroic', b)
      s.countdown = 0
      // The boss may not die before its late rungs come round, and the raid
      // may not wipe: what this asks is what the boss does, not who wins.
      const monster = bossOf(s)
      monster.maxHp *= 40
      monster.hp = monster.maxHp
      const rng = new Rng(seed + 8 * 7919)
      let ticks = 0
      while (s.outcome === 'ongoing' && s.time < 300) {
        step(s, { moveX: 0, moveY: 0, pressed: ticks % 45 === 0 ? [0] : [] }, rng)
        ticks++
        for (const fx of s.effects) {
          if (fx.abilityId && fx.abilityId.startsWith('boss_')) seen.add(fx.abilityId.slice(5))
        }
        for (const g of s.ground) {
          seen.add(g.kind)
          // A circle that has named somebody is the chase, which is a rung
          // with no cast, no aura and no floor of its own.
          if (g.kind === 'gather' && g.named !== undefined) seen.add('chase')
          if (g.kind === 'nucleus') seen.add('nuclei')
        }
        for (const a of s.actors) for (const aura of a.auras) seen.add(aura.id)
        for (const a of s.actors) {
          if (a.faction !== 'boss' || a.id === monster.id) continue
          // A beast is a thrall that has picked somebody: what sold it is the
          // wave, not a mechanic of its own.
          if (a.spawn === 'beast') seen.add('adds')
          else if (a.spawn === 'crown') seen.add('rotation')
          else if (a.spawn !== undefined) seen.add(a.spawn)
          else seen.add('adds')
        }
        for (const a of s.actors) {
          if (a.faction !== 'party') continue
          a.alive = true
          a.hp = a.maxHp
        }
      }
    }
    const missing = kit.filter((m) => !seen.has(m))
    expect(`${encounter.name}: throws every rung it sells`, missing.length === 0, missing.join(','))
  }
}

// --- what a kill pays out ----------------------------------------------------
//
// Two things a pull hands over, neither of which is power: the rung it opened
// and what that rung is for, and the page of the boss it was against.
{
  // What a rung pays out, which the results screen now says out loud.
  //
  // Never more than one mechanic, and one exactly when the kit grows: the
  // chain alternates, since 5-heroic and 10-normal buy the same four ideas
  // and the second of them is paying for bodies instead. A line that promised
  // a mechanic on every rung would be lying on half of them, which is why the
  // screen has a second thing to say.
  const inside = LADDER.map((_, i) => i).filter((i) => i % RUNGS_PER_BOSS !== 0)
  //
  // How many a rung may sell is not capped any more.
  //
  // It was one, then a share of what the boss owns, and both were the same
  // idea: this game introduces things one at a time. That is a good idea and
  // it is a judgement about a particular fight's ladder rather than a rule
  // every fight has to obey — a boss with twelve mechanics cannot introduce
  // them one at a time across six settings, and telling it to try only means
  // it may not have twelve.
  //
  // What replaces it is the pair below, which is the part that was actually
  // load-bearing: a rung never sells something the setting did not widen for,
  // and the top of the ladder is the whole boss. Between them a raid still
  // meets more as it climbs and meets all of it by the end; how that is
  // parcelled out is the fight's business.
  //
  // "At most one", where this used to say "exactly one when the kit grows".
  //
  // The rule was written when every boss owned six mechanics, because six is
  // how many rungs there are — three sizes by two difficulties — and that made
  // the count of a boss's ideas a fact about the progression rather than about
  // the boss. A fight that owns something which cannot be a rung now says so
  // in `always`, and one of them owns five ladder entries and its room. Its
  // last setting sells no new mechanic, and what a raid buys there is the size
  // and the difficulty, which were always most of what a rung was.
  //
  // What must not happen is still checked above: no rung ever sells two ideas
  // at once, because a rung is how this game introduces things one at a time.
  const grows = inside.every((i) => {
    const here = tierAt(i)
    const before = tierAt(i - 1)
    const wider = kitCount(here.size, here.difficulty) > kitCount(before.size, before.difficulty)
    return rungBuys(i).length === 0 || wider
  })
  expect('and never buys one where the kit does not grow', grows, 'a rung paid the wrong thing')
  // And the first rung of a boss buys a fight rather than a mechanic, so the
  // line that names one has to have something else to say.
  const firsts = LADDER.map((_, i) => i).filter((i) => i % RUNGS_PER_BOSS === 0)
  expect(
    'and the first rung of a boss buys none',
    firsts.every((i) => rungBuys(i).length === 0),
    'a boss opened owing a mechanic',
  )
  // What it names is what the fight will actually throw at that rung.
  const named = inside.every((i) => {
    const tier = tierAt(i)
    const fight = ENCOUNTERS[tier.encounter]!
    return rungBuys(i).every((id) => encounterKit(fight, tier.size, tier.difficulty).includes(id))
  })
  expect('and names something the rung actually throws', named, 'a rung sold what it does not throw')

  // The page: what a pull writes on it is what the pull put in front of you.
  // A bill for a mechanic the fight was not carrying would be a page that
  // teaches the wrong boss, and it is the one thing the attribution could get
  // wrong without any test noticing -- every damage call in the game says
  // which mechanic it is, and nothing else checks that it says the right one.
  for (const [size, difficulty] of [[5, 'normal'], [25, 'heroic']] as const) {
    let billed = 0
    let split = 0
    const stray: string[] = []
    for (let e = 0; e < ENCOUNTERS.length; e++) {
      const fight = ENCOUNTERS[e]!
      const s = unattended(createState(0x51ed, 0, autoParty(size, pickFor('mage', 'dps')!), difficulty, e))
      const rng = new Rng(0x51ed + 7919)
      while (s.outcome === 'ongoing' && s.time < encounterAt(e).enrage + 60) {
        step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
      }
      const kit = encounterKit(fight, size, difficulty)
      for (const t of Object.values(s.tally)) {
        billed += t.mechanicHits
        for (const [id, hits] of Object.entries(t.byMechanic)) {
          split += hits
          if (!kit.includes(id as MechanicId)) stray.push(`${fight.short}: ${id}`)
        }
      }
      // And the page only ever claims what the pull reached.
      const shown = kitThrough(fight, size, difficulty, s.phase)
      expect(
        `${fight.short} ${size}${difficulty[0]}: the page claims no more than the kit`,
        shown.every((id) => kit.includes(id)),
        shown.filter((id) => !kit.includes(id)).join(','),
      )
    }
    expect(
      `${size} ${difficulty}: every mechanic hit says which mechanic it was`,
      billed === split && billed > 0,
      `${billed} hits against ${split} named`,
    )
    expect(
      `and none of them names one the fight was not carrying`,
      stray.length === 0,
      stray.join(', '),
    )
  }

  // The page itself, written from a real pull.
  {
    const fight = ENCOUNTERS[0]!
    const play = (size: RaidSize, difficulty: DifficultyId): SimState => {
      const s = unattended(createState(0x51ed, 0, autoParty(size, pickFor('mage', 'dps')!), difficulty, 0))
      const rng = new Rng(0x51ed + 7919)
      while (s.outcome === 'ongoing' && s.time < encounterAt(0).enrage + 60) {
        step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
      }
      // The seat was handed to the AI so the pull could play itself; the page
      // is written from your own row, so hand it back before folding.
      s.actors.find((a) => a.faction === 'party')!.isPlayer = true
      return s
    }

    const small = play(5, 'normal')
    const one = fold({}, small)
    const page = pageFor(one, 0)!
    expect(`${fight.short}: one pull is one pull`, page.pulls === 1, `${page.pulls}`)
    expect(
      'and a kill is counted as one',
      page.kills === (small.outcome === 'victory' ? 1 : 0),
      `${page.kills} on a ${small.outcome}`,
    )
    // The five-man kit is three of the six, so a page written by one of them
    // has to still be saying that the other three are up there.
    expect(
      'and a small kit leaves the rest of the boss unmet',
      page.metCount === kitCount(5, 'normal', fight.ladder.length) &&
        page.rungs.length === fight.ladder.length,
      `${page.metCount} of ${page.rungs.length}`,
    )
    const billed = small.tally[small.actors.find((a) => a.isPlayer)!.id]?.byMechanic ?? {}
    expect(
      'and what caught you is what the fight billed you for',
      page.rungs.every((r) => r.hits === (billed[r.id] ?? 0)),
      page.rungs.map((r) => `${r.id}:${r.hits}/${billed[r.id] ?? 0}`).join(','),
    )

    // Knowledge only ever grows: a later pull at a wider setting adds rungs,
    // and a page that could lose one would be a page that forgets a fight you
    // have already been shown.
    const two = fold(one, play(25, 'heroic'))
    const wider = pageFor(two, 0)!
    expect(`${fight.short}: a second pull is counted`, wider.pulls === 2, `${wider.pulls}`)
    expect(
      'and a wider kit only ever adds to the page',
      page.rungs.every((r) => !r.met || wider.rungs.find((o) => o.id === r.id)?.met === true) &&
        wider.metCount === kitCount(25, 'heroic', fight.ladder.length),
      `${wider.metCount} of ${wider.rungs.length}`,
    )
    // And a battleground has no boss to write about.
    const bg = createBattlegroundState(0x51ed, 'flags', autoParty(5, pickFor('mage', 'dps')!))
    expect('a battleground writes no page', Object.keys(fold(two, bg)).length === 1, 'a page was written')
  }

  // Nothing about the page reaches the fight. The same rule the awards keep,
  // and the reason a record can be kept per boss without ever changing what a
  // pull does: the split is written where damage is applied, declared where
  // the tally is, and named nowhere else under `src/sim`. Read off the source
  // because there is no run that could show a rule being kept.
  const reads = ['sim.ts', 'boss.ts', 'ai.ts', 'autocast.ts', 'combat.ts', 'state.ts', 'types.ts']
    .filter((file) => /byMechanic/.test(readFileSync(resolve(process.cwd(), `src/sim/${file}`), 'utf8')))
  expect(
    'the split is written by the fight and never read by it',
    reads.join(',') === 'combat.ts,state.ts,types.ts',
    reads.join(','),
  )
}

// --- nobody shares an id -----------------------------------------------------
//
// The counter that hands out ids is shared by chat lines, floating text,
// ground effects, projectiles and summoned bodies, and two ids are constants
// sitting still: the player's and the boss's. Nothing stopped the counter
// walking onto one of them, and it did — about twenty-five seconds into a
// fight, which is roughly when the first summon arrives.
//
// What that cost was not a duplicate row in a list. `BOSS_ID` is how the
// damage path asks whether a hit is aimed at the boss, so a herald holding it
// inherited the rule that makes a boss untouchable while its herald stands: it
// could not be killed, so it never stopped standing, so the boss was never
// touchable again. One pull in six ran to the clock with the boss frozen at
// exactly its phase-two health.
//
// Two checks, and the second is the one that matters — which is worth writing
// down, because the first is the one that looks like it should be.
//
// Scanning pulls for two bodies with the same number only catches the seed
// where the counter lands exactly on a reserved id. Run against the broken
// counter, five bosses of it noticed nothing: by the time a summon appears the
// counter is somewhere in the hundreds, and whether that somewhere is exactly
// a hundred is a coin the seed flips. It is kept because a duplicate id is
// worth catching whatever causes it, not because it would have caught this.
//
// What makes it impossible is the floor, and the floor is checked directly.
// Put `FIRST_OBJECT_ID` back to one and that is the line that goes red.
{
  for (let e = 0; e < ENCOUNTERS.length; e++) {
    const roster = autoParty(25, pickFor('mage', 'dps')!)
    const s = pulled(4242 + e * 17, 8, roster, 'heroic', e)
    s.countdown = 0
    const rng = new Rng(4242 + e)
    const taken = new Set<number>([BOSS_ID, ...roster.map((_, i) => i + 1)])
    const stolen = new Set<string>()
    const clashes = new Set<string>()
    while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage) {
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
      const seen = new Map<number, string>()
      for (const a of s.actors) {
        const other = seen.get(a.id)
        if (other) clashes.add(`${a.id}: ${other} and ${a.name}`)
        else seen.set(a.id, a.name)
        // A summon is anything that was not dealt in: the roster is the first
        // twenty-five ids and the boss is its own constant, so everything else
        // came off the counter and must have come off it past both.
        if (a.faction === 'boss' && a.id !== BOSS_ID && taken.has(a.id)) {
          stolen.add(`${a.name} holds ${a.id}`)
        }
        if (a.faction === 'boss' && a.id !== BOSS_ID && a.id < FIRST_OBJECT_ID) {
          stolen.add(`${a.name} holds ${a.id}, under the counter's floor`)
        }
      }
    }
    expect(
      `${ENCOUNTERS[e]!.name}: nothing summoned holds a reserved id`,
      stolen.size === 0 && clashes.size === 0,
      [...stolen, ...clashes].join('; '),
    )
  }
  // And the reason they cannot, stated where it can be read: the counter
  // starts past everything that is not allocated from it.
  expect(
    'and the counter starts past every reserved id',
    FIRST_OBJECT_ID > BOSS_ID && FIRST_OBJECT_ID > PLAYER_ID,
    `${FIRST_OBJECT_ID} against ${BOSS_ID}`,
  )
}

// --- the room is a property of the fight, not a constant -------------------
//
// `ARENA_RADIUS` used to be read in twenty places: the clamp, the AI's wall
// term, the idle ring, the terrain roll, the camera's scale, four shapes in
// the renderer. Every one of them was a fight assuming it was being fought in
// the same circle as every other fight, and the assumption was invisible
// because it was spelled the same way each time.
//
// So the constant is allowed in exactly two files — where it is declared, and
// where the default room is built out of it — and everything else asks a room.
// Without this the next person to want "the whole floor" writes the constant
// again, and it is right for eleven of the twelve rooms.
{
  const roots = ['src']
  const offenders: string[] = []
  let scanned = 0
  const allowed = new Set(['src/sim/constants.ts', 'src/sim/room.ts'])
  const walk = (dir: string): void => {
    for (const entry of readdirSync(resolve(process.cwd(), dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(path)
      else if (path.endsWith('.ts')) {
        scanned++
        if (allowed.has(path)) continue
        const source = readFileSync(resolve(process.cwd(), path), 'utf8')
        // In code, not in prose: the comments that explain why the constant
        // moved are the point of the comments.
        for (const line of source.split('\n')) {
          const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '')
          if (/\bARENA_RADIUS\b/.test(code)) offenders.push(`${path}: ${line.trim()}`)
        }
      }
    }
  }
  for (const root of roots) walk(root)
  expect('every source file was read for the arena constant', scanned > 30, `${scanned} files`)
  expect(
    'and nothing outside constants.ts and room.ts reads it',
    offenders.length === 0,
    offenders.join('; '),
  )
}

// --- and the three shapes answer their own questions ------------------------
//
// The disc's arithmetic is the arithmetic `clampToArena` had, to the digit:
// every number in `docs/mechanic-rules.md` was measured against it, so a room
// module that rounded the yardstick differently would silently retune the
// whole game. The rectangle is the one that has never existed before, and both
// of its failure modes are corners.
{
  const disc = { kind: 'round', radius: 920 } as const
  const hall = { kind: 'hall', halfWidth: 560, front: 1560, back: 720 } as const

  // Written out the way `clampToArena` wrote it, down to the order of the
  // multiplication: scaling by `limit / dist` and multiplying by `limit` then
  // dividing by `dist` are the same number in arithmetic and not always the
  // same double, and this check is about the double.
  const oldClamp = (pos: Vec2, radius: number): Vec2 => {
    const limit = 920 - radius
    const d = Math.hypot(pos.x, pos.y)
    if (d <= limit) return { ...pos }
    const scale = limit / d
    return { x: pos.x * scale, y: pos.y * scale }
  }
  let drift = 0
  for (let i = 0; i < 400; i++) {
    const angle = (i / 400) * Math.PI * 2
    const out = 200 + (i % 7) * 180
    const at = { x: Math.cos(angle) * out, y: Math.sin(angle) * out }
    const was = oldClamp(at, 17)
    const now = { ...at }
    pushInside(disc, now, 17)
    drift = Math.max(drift, Math.hypot(was.x - now.x, was.y - now.y))
  }
  expect('the disc clamps exactly where it always did', drift === 0, `${drift.toFixed(6)} off`)

  // A corner is inside a hall and outside the circle that contains it, and the
  // far end of a hall is the other way round. Both used to be answered by one
  // radius, and both used to be answered wrong.
  expect(
    'a hall is not the circle around it',
    insideRoom(hall, { x: 540, y: -700 }) && !insideRoom(hall, { x: 0, y: 1600 }),
    'corner or far end read wrong',
  )
  const pinned = { x: 900, y: 2000 }
  pushInside(hall, pinned, 17)
  expect(
    'and it pushes back on each axis rather than toward the middle',
    pinned.x === 560 - 17 && pinned.y === 1560 - 17,
    `${pinned.x}, ${pinned.y}`,
  )
  expect(
    'a hall reaches furthest at a corner',
    Math.abs(roomReach(hall) - Math.hypot(560, 1560)) < 1e-9 && roomReach(disc) === 920,
    `${roomReach(hall).toFixed(2)}`,
  )
  // The wall term in `findSafeSpot` is written off this, so a body pressed
  // against the long side of a hall has to read as against a wall — which,
  // measured from the middle, it does not.
  expect(
    'and the wall a body is nearest is the wall it is scored against',
    wallGap(hall, { x: 540, y: 0 }) === 20 && wallGap(disc, { x: 900, y: 0 }) === 20,
    `${wallGap(hall, { x: 540, y: 0 })}`,
  )
}

// --- a written room is the same room every pull ----------------------------
//
// Terrain was rolled: a third of pulls came up empty and the rest got one to
// four rocks wherever they landed, so the same boss twice was two different
// rooms. A fight can write its own now, and the moment it does, two things
// have to hold that nothing checked before — the floor is identical from pull
// to pull, and the rocks somebody typed out obey the rules the roll obeyed.
//
// The rules themselves are `terrainFaults`, which the roll now calls too, so
// there is one statement of them rather than two that drift.
{
  let authored = 0
  const faults: string[] = []
  for (let e = 0; e < ENCOUNTERS.length; e++) {
    const written = ENCOUNTERS[e]!.terrain
    if (!written) continue
    authored++
    for (const size of RAID_SIZES) {
      const slots = makeSlots(size).map((slot) => ({ x: slot.x, y: slot.y }))
      const room = ENCOUNTERS[e]!.room ?? ROUND_ARENA
      for (const rock of written) {
        for (const fault of terrainFaults(room, rock, slots, written)) {
          faults.push(`${ENCOUNTERS[e]!.short} at ${size}: a rock is ${fault}`)
        }
      }
    }
  }
  expect(`${authored} written room(s) obey the rules the roll obeys`, faults.length === 0, faults.join('; '))

  // And the checker itself, because a check that has nothing to look at yet is
  // a check nobody has ever seen fail. One rock in the middle of the floor,
  // one against the wall, one on top of another, one on the raid's own mark.
  const room = ROUND_ARENA
  const marks = makeSlots(25).map((slot) => ({ x: slot.x, y: slot.y }))
  const good = { pos: { x: 420, y: -380 }, radius: 44 }
  expect(
    'and the rule is one a legal rock passes',
    terrainFaults(room, good, marks, [good]).length === 0,
    terrainFaults(room, good, marks, [good]).join('; '),
  )
  const bad: Array<[string, { pos: Vec2; radius: number }]> = [
    ['in the middle', { pos: { x: 80, y: 0 }, radius: 44 }],
    ['against the wall', { pos: { x: 900, y: 0 }, radius: 44 }],
    ['on a starting mark', { pos: { x: marks[6]!.x, y: marks[6]!.y }, radius: 44 }],
  ]
  for (const [what, rock] of bad) {
    expect(
      `and one a rock ${what} fails`,
      terrainFaults(room, rock, marks, [rock]).length > 0,
      'passed when it should not have',
    )
  }
  const touching = [
    { pos: { x: 420, y: -380 }, radius: 44 },
    { pos: { x: 470, y: -380 }, radius: 44 },
  ]
  expect(
    'and two rocks a lane apart are two rocks, closer than that they are a corner',
    terrainFaults(room, touching[0]!, marks, touching).length > 0,
    'a pair that touches passed',
  )

  // The floor is the same floor twice, and a rolled one is not.
  const written = ENCOUNTERS.findIndex((e) => e.terrain)
  if (written >= 0) {
    const a = pulled(4242, 3, autoParty(10, pickFor('mage', 'dps')!), 'normal', written)
    const b = pulled(9999, 5, autoParty(10, pickFor('mage', 'dps')!), 'normal', written)
    expect(
      'a written room comes up the same on a different seed',
      JSON.stringify(a.obstacles) === JSON.stringify(b.obstacles),
      `${a.obstacles.length} against ${b.obstacles.length}`,
    )
    a.obstacles.push({ pos: { x: 0, y: 0 }, radius: 1 })
    expect(
      'and the fight as written is not what the pull writes into',
      ENCOUNTERS[written]!.terrain!.length !== a.obstacles.length,
      'the encounter shares its list with the state',
    )
  }

  // And a fight that names no terrain still rolls one, seed by seed. This is
  // the other half of the pair above: a written room has to be the same room
  // every pull because it is part of what there is to learn, and an unwritten
  // one has to not be, or the roll is decoration.
  const unwritten = ENCOUNTERS.findIndex((e) => !e.terrain)
  if (unwritten >= 0) {
    const rooms = [1, 2, 3, 4, 5, 6].map((n) =>
      JSON.stringify(
        pulled(700 + n * 31, 3, autoParty(10, pickFor('mage', 'dps')!), 'normal', unwritten).obstacles,
      ),
    )
    expect(
      'and an unwritten room is rolled, seed by seed',
      new Set(rooms).size > 1,
      'every seed came up with the same room',
    )
  }
}

// --- and a wave comes in through a door ------------------------------------
//
// A wave used to appear at a rolled bearing on a ring of 230, which is not a
// place: whichever side it came from, the answer was the same. Doors make
// "which side first" a question, and the room says where they are before
// anything comes through them.
//
// Nothing declares doors yet — the rooms that want them are #27 and #35 — so
// what is checked here is the rule and the machinery: a declared door has to
// be on a wall, the mouth has to be clear, the size gate has to open and shut,
// and a fight given doors has to actually use them, in turn.
{
  const faults: string[] = []
  let declared = 0
  for (const fight of ENCOUNTERS) {
    for (const door of fight.doors ?? []) {
      declared++
      const room = fight.room ?? ROUND_ARENA
      const gap = wallGap(room, door.pos)
      if (Math.abs(gap) > 64) faults.push(`${fight.short}: a door sits ${gap.toFixed(0)} off its wall`)
      const away = Math.hypot(door.pos.x, door.pos.y) || 1
      const mouth = { x: door.pos.x * (1 - 64 / away), y: door.pos.y * (1 - 64 / away) }
      if (inTerrain(fight.terrain ?? [], mouth, 16)) {
        faults.push(`${fight.short}: a door opens into a rock`)
      }
    }
  }
  expect(`${declared} declared door(s) are on a wall with a clear mouth`, faults.length === 0, faults.join('; '))

  // The gate, on a fight given one door of each kind.
  const subject = ENCOUNTERS.findIndex(
    (e) => e.ladder.includes('adds') || (e.always ?? []).includes('adds'),
  )
  expect('a fight that summons exists to hang doors on', subject >= 0, 'no boss on the roster summons')
  const fight = ENCOUNTERS[subject]!
  const kept = fight.doors
  // In a room of the check's own making rather than the fight's. The fixture
  // used to read the fight's room to find its wall, and the day that fight
  // grew a hall the three doors collapsed onto the origin and every arrival
  // matched the first of them -- a fixture failing as if the rotation had.
  const keptRoom = fight.room
  fight.room = { kind: 'round', radius: 920 }
  fight.doors = [
    { pos: { x: -919, y: 0 } },
    { pos: { x: 919, y: 0 } },
    { pos: { x: 0, y: -919 }, from: 25 },
  ]
  try {
    expect(
      'a door with a floor opens for the raid that reaches it and not below',
      openDoors(fight, 5).length === 2 && openDoors(fight, 10).length === 2 && openDoors(fight, 25).length === 3,
      `${openDoors(fight, 5).length} / ${openDoors(fight, 10).length} / ${openDoors(fight, 25).length}`,
    )

    // And a pull actually uses them. Every body that was not there a tick ago
    // has to have arrived within a step of a doorway, and the doorways have to
    // be taken in turn rather than one of them taking the lot.
    const s = pulled(3131, 2, autoParty(25, pickFor('mage', 'dps')!), 'heroic', subject)
    const rng = new Rng(3131)
    const known = new Set(s.actors.map((a) => a.id))
    const arrivals: number[] = []
    let strays = 0
    while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage) {
      step(s, { moveX: 0, moveY: 0, pressed: s.tick % 45 === 0 ? [0, 1, 2] : [] }, rng)
      for (const a of s.actors) {
        if (known.has(a.id)) continue
        known.add(a.id)
        if (a.faction !== 'boss') continue
        const at = openDoors(fight, 25).findIndex((door) => dist(door.pos, a.pos) < 64 + 24)
        if (at < 0) strays++
        else arrivals.push(at)
      }
    }
    expect('and a summoned body arrives in a doorway', arrivals.length > 0 && strays === 0, `${strays} arrived elsewhere`)
    expect(
      'and the doorways are taken in turn',
      new Set(arrivals).size > 1 && arrivals.slice(0, 3).join() === [0, 1, 2].slice(0, Math.min(3, arrivals.length)).join(),
      arrivals.slice(0, 6).join(', '),
    )
  } finally {
    if (kept) fight.doors = kept
    else delete fight.doors
    if (keptRoom) fight.room = keptRoom
    else delete fight.room
  }
}

// --- a gift with nowhere to go ---------------------------------------------
//
// The one rung in this game that is a failure rather than an action, so it
// cannot be swept for: a raid that plays the fight well never produces one.
// What is checked instead is the rule itself -- a gift whose warning runs out
// with nobody clean to hand it to turns the body holding it.
{
  const held = ENCOUNTERS.findIndex((e) => e.id === 'gift')
  expect('the fight that hands something over is on the roster', held >= 0, `${held}`)
  const s = pulled(6100, 8, autoParty(25, pickFor('mage', 'dps')!), 'heroic', held)
  const rng = new Rng(6100)
  // Everybody has already held one, which is the state a long pull walks into
  // on its own and the state this check needs on the first tick.
  for (const a of s.actors) if (a.faction === 'party') s.held.push(a.id)
  const holder = s.actors.find((a) => a.faction === 'party' && a.role !== 'tank')!
  addAura(holder, 'souring', BOSS_ID)
  let turned = false
  // Counted in ticks rather than in seconds. The clock does not move while a
  // pull is counting down, so a loop written against `s.time` is a loop that
  // never ends if anything ever changes about how a fixture starts -- which is
  // exactly what happened: this hung the whole check on its first run.
  const ticks = Math.ceil((AURA_DURATION.souring + 2) * TICK_RATE)
  for (let n = 0; n < ticks && s.outcome === 'ongoing'; n++) {
    step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    if (holder.auras.some((au) => au.id === 'turned')) turned = true
  }
  expect('a gift with nowhere to go turns the body holding it', turned, 'nothing happened')
}

// --- a room that floods, and the two rules that keep it answerable ---------
//
// Taking floor away super-scales -- `docs/mechanic-rules.md` rule 5 -- so a
// room that rises has to promise two things or it is not a hard room, it is a
// moment with no answer in it: the middle never goes under, and what is under
// at any one instant stays under a third of the floor.
//
// Both are measured off a real pull rather than argued from the constants,
// because what decides them is where the patches actually land after the
// room has pushed them inside itself.
{
  const sludge = ENCOUNTERS.findIndex((e) => e.id === 'confluence')
  expect('the fight in the room that rises is on the roster', sludge >= 0, `${sludge}`)
  const room = ENCOUNTERS[sludge]!.room ?? ROUND_ARENA
  const floor = roomArea(room)
  const s = pulled(4700, 8, autoParty(25, pickFor('mage', 'dps')!), 'heroic', sludge)
  const rng = new Rng(4700)
  let wettest = 0
  let dry = Infinity
  let risings = 0
  const counted = new Set<number>()
  while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage) {
    step(s, { moveX: 0, moveY: 0, pressed: s.tick % 45 === 0 ? [0, 1, 2] : [] }, rng)
    let wet = 0
    for (const g of s.ground) {
      if (g.kind !== 'slime') continue
      if (!counted.has(g.id)) {
        counted.add(g.id)
        risings++
      }
      wet += Math.PI * g.radius * g.radius
      dry = Math.min(dry, Math.hypot(g.pos.x, g.pos.y) - g.radius)
    }
    wettest = Math.max(wettest, wet)
  }
  expect(`${risings} patch(es) of the room went under`, risings > 0, 'the floor never rose')
  // Counted as circles rather than as their union, which is the harsh reading:
  // two patches that overlap are counted twice, so a run that passes here has
  // a real margin rather than an arithmetic one.
  expect(
    `and at most ${((wettest / floor) * 100).toFixed(0)}% of the floor was under at once`,
    wettest <= floor / 3,
    `${((wettest / floor) * 100).toFixed(0)}% of ${Math.round(floor)}`,
  )
  expect(
    `and the middle stayed dry (nearest edge ${dry === Infinity ? 'n/a' : dry.toFixed(0)})`,
    dry >= SLIME_DRY,
    `${dry.toFixed(0)} from the middle, wants ${SLIME_DRY}`,
  )
}

// --- two answers that can both be right at once -----------------------------
//
// The one thing a room can get wrong that no other check would catch. This
// fight asks for a circle everybody is inside and for that circle to be a body
// that has to keep walking, and both of those are answered by standing
// somewhere -- so if the room's furniture, its walls and its own floor leave
// no place where both are true, it is not a hard room, it is a room with no
// answer in it.
//
// Measured as an outcome rather than as a geometry proof: how many of the raid
// were actually inside the circle when it closed. A room where the two demands
// cannot both be met shows up here as a circle nobody reaches.
{
  const flasks = ENCOUNTERS.findIndex((e) => e.id === 'flasks')
  expect('the fight that asks for two answers is on the roster', flasks >= 0, `${flasks}`)
  const party = autoParty(25, pickFor('mage', 'dps')!)
  const shares: number[] = []
  let chased = 0
  for (let n = 0; n < 3; n++) {
    const seed = 4400 + n * 137
    const s = pulled(seed, 8, party, 'heroic', flasks)
    const rng = new Rng(seed)
    const live = new Set<number>()
    while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage) {
      // The circle is on the floor while it counts and gone the tick it
      // resolves, so the share has to be read on the last tick it exists.
      const before = s.ground.filter((g) => g.kind === 'gather' && !g.detonated)
      for (const g of before) live.add(g.id)
      // Counted before the step, along with who was standing at that moment: a
      // circle kills people as it resolves, so a share read against the
      // survivors is a share read against a smaller raid than the one that was
      // asked -- which is how this first reported a hundred and seventy
      // percent of the raid inside a circle.
      const standing = s.actors.filter((a) => a.faction === 'party' && a.alive).length
      const inside = new Map<number, number>()
      for (const g of before) {
        inside.set(
          g.id,
          s.actors.filter((a) => a.faction === 'party' && a.alive && dist(a.pos, g.pos) <= g.radius)
            .length,
        )
        if (g.named !== undefined) chased++
      }
      step(s, { moveX: 0, moveY: 0, pressed: s.tick % 45 === 0 ? [0, 1, 2] : [] }, rng)
      for (const g of before) {
        if (s.ground.some((now) => now.id === g.id && !now.detonated)) continue
        live.delete(g.id)
        const came = inside.get(g.id) ?? 0
        shares.push(came / Math.max(1, standing))
      }
    }
  }
  expect(`${shares.length} circle(s) closed`, shares.length > 0, 'none resolved')
  expect('and the circle was following somebody', chased > 0, 'it never chased')
  const worst = shares.length > 0 ? Math.min(...shares) : 0
  const typical = shares.length > 0 ? shares.reduce((a, b) => a + b, 0) / shares.length : 0
  // Not "everybody made it" -- a raid that always makes it is a demand that
  // asks nothing. What is being checked is that the room leaves the answer
  // available: most of the raid reaches most of them, and none of them is a
  // circle nobody could reach at all.
  expect(
    `and most of the raid reached them (${(typical * 100).toFixed(0)}% typical, ${(worst * 100).toFixed(0)}% worst)`,
    typical > 0.6 && worst > 0.15,
    `${(typical * 100).toFixed(0)} / ${(worst * 100).toFixed(0)}`,
  )
}

// --- a wave that has to walk -----------------------------------------------
//
// On the one fight where how long that takes is the mechanic. A beast's hits
// are what fills the gorged one's gauge, so the distance between the door it
// came out of and the body it picked is the raid's whole window to stop it --
// and a wave that arrived already standing on somebody would be a window of
// nothing, which is the same mechanic with its answer removed.
//
// Written against the fight's own doors rather than a fixture's, because the
// thing being checked is exactly that those doors are far enough from where a
// raid stands.
{
  const gorged = ENCOUNTERS.findIndex((e) => e.id === 'gorged')
  expect('the fight whose clock is a walk is on the roster', gorged >= 0, `${gorged}`)
  const s = pulled(0x51ed, 8, autoParty(25, pickFor('mage', 'dps')!), 'heroic', gorged)
  const rng = new Rng(0x51ed)
  const known = new Set(s.actors.map((a) => a.id))
  let waves = 0
  let closest = Infinity
  while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage) {
    step(s, { moveX: 0, moveY: 0, pressed: s.tick % 45 === 0 ? [0, 1, 2] : [] }, rng)
    for (const a of s.actors) {
      if (known.has(a.id)) continue
      known.add(a.id)
      if (a.faction !== 'boss' || a.spawn !== 'beast') continue
      waves++
      for (const p of s.actors) {
        if (p.faction !== 'party' || !p.alive) continue
        closest = Math.min(closest, dist(a.pos, p.pos))
      }
    }
  }
  expect(`${waves} beast(s) walked in`, waves > 0, 'none arrived')
  expect(
    'and every one of them arrived with ground to cross',
    closest > MELEE_RANGE * 3,
    `one arrived ${closest.toFixed(0)} from somebody`,
  )
}

// --- a room with nothing under its edge -------------------------------------
//
// Three of the twelve rooms have an outside, and until now the edge of the
// floor was the one thing in this game that could not hurt anybody: the clamp
// pushed a body back in and that was the whole rule. A platform ends instead,
// which is a new cause of death — so the thing to check is not that the fall
// works but that the party never meets it by walking.
{
  const disc = { kind: 'round', radius: 920 } as const
  const stage = { kind: 'platform', radius: 880 } as const
  expect(
    'only a platform has an outside',
    roomHasOutside(stage) && !roomHasOutside(disc) &&
      !roomHasOutside({ kind: 'hall', halfWidth: 560, front: 1560, back: 720 }),
    'a room answered wrong about its own edge',
  )
  expect(
    'and the brink is the last lane of it, and only there',
    onEdge(stage, { x: 860, y: 0 }) && !onEdge(stage, { x: 700, y: 0 }) && !onEdge(disc, { x: 915, y: 0 }),
    'the brink is in the wrong place',
  )

  // A body over the side. Through `holdOrFall`, which is what every step in
  // the game ends with, rather than by calling the fall directly.
  const s = pulled(2024, 4, autoParty(10, pickFor('mage', 'dps')!), 'normal', 0)
  const walker = s.actors.find((a) => a.faction === 'party')!
  s.room = disc
  walker.pos = { x: 1400, y: 0 }
  holdOrFall(s, walker)
  expect(
    'a wall holds a body in, as it always did',
    walker.alive && Math.hypot(walker.pos.x, walker.pos.y) <= 920,
    `${Math.hypot(walker.pos.x, walker.pos.y).toFixed(0)} out, alive ${walker.alive}`,
  )
  s.room = stage
  walker.pos = { x: 1400, y: 0 }
  holdOrFall(s, walker)
  expect(
    'and an outside does not',
    !walker.alive && Math.hypot(walker.pos.x, walker.pos.y) <= 880,
    `alive ${walker.alive}, at ${Math.hypot(walker.pos.x, walker.pos.y).toFixed(0)}`,
  )
  expect(
    'and the body is laid on the rim rather than left in the air',
    Math.hypot(walker.pos.x, walker.pos.y) > 880 - 60,
    `${Math.hypot(walker.pos.x, walker.pos.y).toFixed(0)}`,
  )

  // And the part that matters: a whole pull on a platform, with nobody
  // steering the player, and nobody goes over. A fall the AI walks into on its
  // own is a death that cannot be practised, which rule 1 says is not a
  // mechanic at all.
  const fight = ENCOUNTERS[0]!
  const kept = fight.room
  fight.room = stage
  try {
    const run = pulled(5150, 2, autoParty(25, pickFor('mage', 'dps')!), 'heroic', 0)
    const rng = new Rng(5150)
    let fell = 0
    let outside = 0
    while (run.outcome === 'ongoing' && run.time < encounterAt(run.encounter).enrage) {
      step(run, { moveX: 0, moveY: 0, pressed: run.tick % 45 === 0 ? [0, 1, 2] : [] }, rng)
      for (const text of run.texts) if (text.text === 'FELL' && text.age === 0) fell++
      for (const a of run.actors) {
        if (a.alive && !insideRoom(run.room, a.pos, a.radius * 0.9)) outside++
      }
    }
    expect('a raid on a platform walks off it never', fell === 0, `${fell} went over`)
    expect('and stands on it the whole time', outside === 0, `${outside} body-ticks outside`)
  } finally {
    if (kept) fight.room = kept
    else delete fight.room
  }
}

// --- the names ship with the build ------------------------------------------
//
// Attribution is a condition of most of the licences this game's art is under,
// and until now it was met in two markdown files in the repository — which
// meets it for people who read repositories. What is distributed is the build,
// so the build has to carry the names.
//
// `npm run artcheck` proves the list is complete against the generated credit
// files. What is checked here is that it is *on the screen*: every name drawn,
// on a phone as well as a desktop, with the one button that leaves.
{
  for (const [label, w, h] of [
    ['desktop 1440x900', 1440, 900],
    ['portrait 390x844', 390, 844],
    ['landscape 844x390', 844, 390],
    ['small portrait 360x640', 360, 640],
  ] as const) {
    updateLayout(w, h)
    const drawn: string[] = []
    let lowest = 0
    const spy = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'fillText') {
            return (text: string, _x: number, y: number) => {
              drawn.push(text)
              // The button that leaves is drawn last and sits below its own
              // rectangle's top; what is being measured is the prose above it.
              if (text !== 'BACK') lowest = Math.max(lowest, y)
            }
          }
          // A width that grows with the text, so the wrapping in `drawCredits`
          // is exercised rather than short-circuited by a stub that answers
          // ten for everything.
          if (prop === 'measureText') return (text: string) => ({ width: text.length * 6 })
          if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
            return () => ({ addColorStop: () => {} })
          }
          if (prop === 'canvas') return { width: L.w, height: L.h }
          return () => {}
        },
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D

    drawCredits(spy)
    const page = drawn.join(' ')
    const missing = everyAuthor().filter((name) => !page.includes(name))
    expect(`${label}: every name in the art is on the screen`, missing.length === 0, missing.join(', '))

    const layout = creditsLayout()
    expect(
      `${label}: and the last of them is above the way out`,
      lowest < layout.back.y,
      `${lowest.toFixed(0)} against ${layout.back.y.toFixed(0)}`,
    )
    const fits = layout.back.x >= 0 && layout.back.y >= 0 &&
      layout.back.x + layout.back.w <= w && layout.back.y + layout.back.h <= h
    expect(`${label}: the way out is on screen`, fits, JSON.stringify(layout.back))
    expect(
      `${label}: and answers a tap`,
      hitCredits(layout.back.x + layout.back.w / 2, layout.back.y + layout.back.h / 2) === 'back',
      'the button does not answer',
    )
    expect(
      `${label}: and the settings row that opens it does too`,
      hitSettings(
        settingsLayout().credits.x + settingsLayout().credits.w / 2,
        settingsLayout().credits.y + settingsLayout().credits.h / 2,
      )?.kind === 'credits',
      'the credits row does not answer',
    )
    // Every row of the settings screen still fits, with the new one on it.
    const rows = settingsLayout()
    const all = [rows.name, rows.sound, rows.backdrop, rows.credits, rows.back, ...rows.volumes, ...rows.cameras]
    expect(
      `${label}: and the settings screen still holds all six rows`,
      all.every((r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h),
      JSON.stringify(rows.credits),
    )
    expect(
      `${label}: with nothing under the way out`,
      rows.credits.y + rows.credits.h <= rows.back.y,
      `${rows.credits.y + rows.credits.h} against ${rows.back.y}`,
    )
  }
  updateLayout(1440, 900)
}

// --- the zoom is a zoom, and the floor is the room --------------------------
//
// The camera follows the player, so what the layout's `scale` decides is how
// big a body is on the glass rather than how much room fits on it. Scaled to
// fit the room instead — which is what it did when rooms arrived — a hall
// twice as long would draw every body at half the size and the small room
// would draw them at twice it: the game would zoom by boss while claiming to
// be one game. What must vary with the room is the *floor*, and only that.
{
  updateLayout(1440, 900)
  const zoom = L.scale
  const sizes: Record<string, number> = {}
  for (const [label, room] of [
    ['disc', ROUND_ARENA],
    ['small', { kind: 'round', radius: 620 } as const],
    ['hall', { kind: 'hall', halfWidth: 560, front: 1560, back: 720 } as const],
    ['platform', { kind: 'platform', radius: 880 } as const],
  ] as const) {
    setWorldRoom(room)
    expect(`${label}: a body is the same size in it`, L.scale === zoom, `${L.scale} against ${zoom}`)
    // What the floor paints, measured off the widest thing drawn on it.
    const xs: number[] = []
    const spy = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'ellipse') {
            return (x: number, _y: number, rx: number) => {
              xs.push(x - rx, x + rx)
            }
          }
          if (prop === 'moveTo' || prop === 'lineTo') return (x: number) => xs.push(x)
          if (prop === 'measureText') return () => ({ width: 10 })
          if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
            return () => ({ addColorStop: () => {} })
          }
          if (prop === 'createPattern') return () => null
          if (prop === 'canvas') return { width: L.w, height: L.h }
          return () => {}
        },
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D
    focusOn(pulled(11, 1, autoParty(10, pickFor('mage', 'dps')!), 'normal', 0), 1)
    drawWorld(spy, (() => {
      const s = pulled(11, 1, autoParty(10, pickFor('mage', 'dps')!), 'normal', 0)
      s.room = room
      return s
    })(), 1, 0, { offset: () => ({ x: 0, y: 0 }), draw: () => {} } as never)
    sizes[label] = Math.max(...xs) - Math.min(...xs)
  }
  setWorldRoom(ROUND_ARENA)
  expect(
    'a smaller room is drawn smaller',
    sizes.small! < sizes.disc!,
    `${sizes.small!.toFixed(0)} against ${sizes.disc!.toFixed(0)}`,
  )
  expect(
    'and a longer one is drawn longer',
    sizes.hall! > sizes.disc!,
    `${sizes.hall!.toFixed(0)} against ${sizes.disc!.toFixed(0)}`,
  )
}

// --- the map an evening is read off ------------------------------------------
//
// A dungeon with no map is a dungeon for people who have memorised it, so the
// screen has to hold all fifteen rooms at once on the smallest phone the rest
// of this file tests — and a map that scrolls is a map you cannot see at once.
// What it says about each room has to be true as well: where the party is
// standing, what is down, and which doors the chain has actually opened.
{
  // An evening two rooms in: the first fight down, the party standing in the
  // second with it still alive, and the room after that one waiting for a
  // fight nobody has built.
  const run = { seed: 1, size: 10 as const, difficulty: 'normal' as const, at: 'oratory', cleared: ['spire'], carried: [0.5], entered: 2, walked: [], visited: ['threshold', 'spire', 'oratory'] }
  const allowed = new Set(['spire', 'oratory', 'airless'])
  for (const [label, w, h] of [
    ['desktop 1440x900', 1440, 900],
    ['portrait 390x844', 390, 844],
    ['landscape 844x390', 844, 390],
    ['small portrait 360x640', 360, 640],
  ] as const) {
    updateLayout(w, h)
    const layout = citadelLayout(run, allowed)
    // Every room the map has, counted off the map rather than written here:
    // the building grows a room when the source has one, and a number typed in
    // a check is a number that goes stale without failing.
    expect(
      `${label}: all ${CHAMBERS.length} rooms are on the map`,
      layout.rows.length === CHAMBERS.length,
      `${layout.rows.length} of ${CHAMBERS.length}`,
    )
    const off = layout.rows.filter(
      (r) => r.rect.x < 0 || r.rect.y < 0 || r.rect.x + r.rect.w > w || r.rect.y + r.rect.h > h,
    )
    expect(`${label}: and all of them on the screen`, off.length === 0, off.map((r) => r.id).join(', '))
    const clash = layout.rows.filter(
      (r) => r.rect.y + r.rect.h > layout.back.y && r.rect.x + r.rect.w > layout.back.x,
    )
    expect(`${label}: and none of them under the way out`, clash.length === 0, clash.map((r) => r.id).join(', '))
    // A plan whose boxes overlap is a plan that says two rooms are one room.
    const overlaps = layout.rows.filter((r, i) =>
      layout.rows.some(
        (o, j) =>
          i !== j &&
          r.rect.x < o.rect.x + o.rect.w &&
          o.rect.x < r.rect.x + r.rect.w &&
          r.rect.y < o.rect.y + o.rect.h &&
          o.rect.y < r.rect.y + r.rect.h,
      ),
    )
    expect(
      `${label}: and no two rooms are drawn on top of each other`,
      overlaps.length === 0,
      overlaps.map((r) => r.id).join(', '),
    )

    const here = layout.rows.find((r) => r.state === 'here')
    expect(`${label}: the party is somewhere on it`, here?.id === 'oratory', here?.id ?? 'nowhere')
    expect(
      `${label}: what is down reads as down`,
      layout.rows.find((r) => r.id === 'spire')?.state === 'cleared',
      layout.rows.find((r) => r.id === 'spire')?.state ?? 'missing',
    )
    expect(
      `${label}: a room behind a shut door is shut`,
      layout.rows.find((r) => r.id === 'throne')?.state === 'shut',
      layout.rows.find((r) => r.id === 'throne')?.state ?? 'missing',
    )
    // The way back to the door, which is a pad and always lit: a room with no
    // fight in it still answers, because going there is what the press means.
    expect(
      `${label}: the door can be walked back to`,
      layout.rows.find((r) => r.id === 'threshold')?.state === 'open',
      layout.rows.find((r) => r.id === 'threshold')?.state ?? 'missing',
    )

    // A lit pad is the only press this screen takes. The building is walked,
    // so a map that carried a party across it would be the list the map was
    // drawn to replace — what a pad buys is the one walk you have earned the
    // right not to make twice.
    const pad = layout.rows.find((r) => r.id === 'threshold')!
    const jump = hitCitadel(run, pad.rect.x + 4, pad.rect.y + pad.rect.h / 2, allowed)
    expect(
      `${label}: a lit pad answers a tap`,
      jump?.kind === 'room' && jump.id === 'threshold',
      JSON.stringify(jump),
    )
    // And nothing else does — not the room you are in, not the one a door
    // away, not the one behind a shut door. Those are places you walk to.
    const dead = ['oratory', 'spire', 'throne'].filter((id) => {
      const r = layout.rows.find((row) => row.id === id)!
      return hitCitadel(run, r.rect.x + 4, r.rect.y + r.rect.h / 2, allowed) !== null
    })
    expect(
      `${label}: and nothing without one does`,
      dead.length === 0,
      `${dead.join(', ')} answered a press on the map`,
    )
    expect(
      `${label}: the way out and the way to give up both answer`,
      hitCitadel(run, layout.back.x + 4, layout.back.y + 4, allowed)?.kind === 'back' &&
        layout.abandon !== null &&
        hitCitadel(run, layout.abandon.x + 4, layout.abandon.y + 4, allowed)?.kind === 'abandon',
      'a button does not answer',
    )
    // An evening with a room still open is an evening: it is not offered a
    // different one, whatever rung the chain has reached.
    expect(
      `${label}: and a map with somewhere to go is not offered another evening`,
      citadelLayout(run, allowed, '10-MAN NORMAL').again === null,
      'the way on was offered over a room that is still alive',
    )

    // And it draws. The stub answers everything; what is being checked is that
    // nothing in the screen reaches for something a canvas does not have.
    drawCitadel(ctx, run, allowed)
  }
  updateLayout(1440, 900)

  // A room whose fight nobody has built says so, once the doors reach it.
  const deeper = { ...run, at: 'mooring', cleared: ['spire', 'oratory'] }
  expect(
    'a room with no fight in it yet says what it is waiting for',
    citadelLayout(deeper, allowed).rows.find((r) => r.id === 'mooring')?.state === 'here' &&
      citadelLayout({ ...deeper, at: 'oratory' }, allowed).rows.find((r) => r.id === 'mooring')?.state === 'waiting',
    citadelLayout({ ...deeper, at: 'oratory' }, allowed).rows.find((r) => r.id === 'mooring')?.state ?? 'missing',
  )

  // A room the chain has not opened is shut on the map even though the door is
  // open: the citadel is somewhere to walk the ladder through, not a way round
  // it.
  const closed = citadelLayout(run, new Set(['spire']))
  expect(
    'a room the ladder has not opened is shut',
    closed.rows.find((r) => r.id === 'airless')?.state === 'shut',
    closed.rows.find((r) => r.id === 'airless')?.state ?? 'missing',
  )

  // And an evening with nothing left open in it is offered the next rung
  // rather than a dead map. Without this the run is saved, the front page
  // resumes it, and the only way on is a button that says GIVE UP.
  //
  // "Nothing left" is about fights, not about presses: every room the party
  // can walk to answers a tap, because the press on this map means go there.
  // So the evening below has somewhere to stand and nothing to kill.
  const stuck = { ...run, cleared: ['spire', 'oratory'], at: 'oratory' }
  const dead = citadelLayout(stuck, new Set(['spire', 'oratory']), '10-MAN NORMAL')
  expect(
    'an evening with nowhere left to walk offers the next rung',
    dead.again !== null && dead.abandon === null,
    `again ${dead.again === null ? 'missing' : 'there'}, abandon ${dead.abandon === null ? 'gone' : 'there'}`,
  )
  expect(
    'and the way on answers as itself',
    hitCitadel(stuck, dead.again!.x + 4, dead.again!.y + 4, new Set(['spire', 'oratory']), '10-MAN NORMAL')
      ?.kind === 'again',
    'the way on answered as something else',
  )
  expect(
    'and it is not offered when the chain has nothing above this run',
    citadelLayout(stuck, new Set(['spire', 'oratory'])).again === null,
    'a way on with nowhere to go',
  )
  drawCitadel(ctx, stuck, new Set(['spire', 'oratory']), '10-MAN NORMAL')
}

// --- the third breath happens -----------------------------------------------
//
// `INHALE_MAX` is three and every comment on that fight describes a count that
// fills to three and empties. It never reached three: the breath in and the
// breath out ran on unrelated timers whose ratio sat a hair over two in every
// phase, so the stack was two, forever, and the mechanic the fight is built
// around was a fixed bill on a fixed clock.
//
// The count drives it now, and this is the check that says so: every breath
// out in a full pull is a breath out at three. Written against the fight
// rather than the constants, so moving a cadence cannot quietly put it back.
{
  const host = ENCOUNTERS.findIndex((e) => e.id === 'host')
  expect('the fight that counts breaths is on the roster', host >= 0, `${host}`)
  // Read off the bill rather than off the stack.
  //
  // The breath in and the breath out resolve in the same tick, so a stack read
  // after the step has already been emptied — sampling it says two and means
  // three. What it was worth is on the effect the exhale pushes, and the bill
  // is `PUNGENT_PER_BREATH` a breath, so the bill divided by one breath is the
  // count the fight actually paid at.
  const at: number[] = []
  for (let n = 0; n < 6; n++) {
    const seed = 4000 + n * 137
    const s = unattended(createState(seed, 6, autoParty(25, pickFor('mage', 'dps')!), 'heroic', host))
    s.countdown = 0
    const rng = new Rng(seed)
    while (s.outcome === 'ongoing' && s.time < encounterAt(host).enrage) {
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
      const one = PUNGENT_PER_BREATH * mechanicScale(s)
      for (const fx of s.effects) {
        if (fx.abilityId !== 'boss_pungent' || fx.power === undefined) continue
        at.push(Math.round(fx.power / one))
        break
      }
    }
  }
  expect(
    `${at.length} breaths out, every one of them at ${INHALE_MAX}`,
    at.length > 0 && at.every((n) => n === INHALE_MAX),
    at.join(', '),
  )
}

if (failures > 0) throw new Error(`${failures} render check(s) failed`)
console.log('all render checks passed')

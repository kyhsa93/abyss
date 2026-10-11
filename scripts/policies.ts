/**
 * The ways a player's slot can be steered, written at the input (#369).
 *
 * A policy here is a function of the state that returns what a thumb returns: a
 * direction and the buttons pressed this tick. Nothing in `src/` is changed or
 * reached around. Where a policy has to say what the AI would do, it reads what
 * `autocast.ts`, `ai.ts` and `constants.ts` export, and where the AI keeps the
 * rule to itself (a closure inside `tankRotation`) the rule is written out
 * again here and `selfCheck` holds the copy to the source and to the AI's own
 * behaviour, so a change to either one stops the probe instead of quietly
 * measuring something that no longer exists.
 *
 * The pairs `roleprobe.ts` sets side by side:
 *
 *   auto         AUTO's own presses (`autoPress`) with the stand-in's steering,
 *                which is `dodge`: out of any puddle, else stand still. Not a
 *                new policy; it is what a player does who turns AUTO on and
 *                steers only to get out of a puddle.
 *   autostill    The same presses and no steering at all.
 *   alwaysTaunt  AUTO as it was before #366: the taunt first, whoever holds.
 *   swap         `auto`, plus the hand-over (see `wantsSwap`).
 *   spend        `auto`, plus the healer's big heal pressed on any hurt body
 *                rather than held for the dire one.
 *   keep, fixed  `auto`, plus the hunter at the far edge of its reach, kept
 *                there or put there once.
 *
 * `never` (the tank who does not hand over) is `auto`: since #366 the AUTO
 * tank only takes the boss off somebody who is not a tank, and that is the
 * whole of what `never` has ever meant here.
 */
import { readFileSync } from 'node:fs'
import { ABILITIES } from '../src/sim/abilities'
import { autoPress } from '../src/sim/autocast'
import { abilityBar, isLegalComposition, pickFor, specOf, type Pick } from '../src/sim/classes'
import { BLOAT_SWAP_AT, DT, ENGULF_MAX, REAGENT_MAX, SLIGHT_MAX } from '../src/sim/constants'
import { boss as bossOf, canCast, getAura, mostHurt, topThreatTarget, stackAura } from '../src/sim/combat'
import { ENCOUNTERS } from '../src/sim/encounters'
import { Rng } from '../src/sim/rng'
import { pressTarget, step } from '../src/sim/sim'
import { createState, unattended } from '../src/sim/state'
import type { Actor, AuraId, SimState } from '../src/sim/types'
import { dodge, dps, standinParty, type Steer } from './standin'

const playerOf = (s: SimState): Actor => s.actors.find((a) => a.isPlayer)!

/** The bar slot of one of the player's own abilities, or -1 when the spec has none. */
const slotFor = (player: Actor, id: string | null): number =>
  id === null ? -1 : abilityBar({ classId: player.classId, spec: player.spec }).indexOf(id)

/** Whether pressing this ability now would go out, asked with the answer the press itself uses. */
const pressable = (s: SimState, player: Actor, id: string | null): boolean => {
  const slot = slotFor(player, id)
  const ability = id === null ? undefined : ABILITIES[id]
  return slot >= 0 && ability !== undefined && canCast(s, player, ability, pressTarget(s, ability, player))
}

/** AUTO's presses, steered the way the stand-in steers. */
export const auto: Steer = (s) => dodge(s, autoPress(s))

/** The same presses with the feet nailed down. */
export const autostill: Steer = (s) => ({ moveX: 0, moveY: 0, pressed: autoPress(s) })

/**
 * `auto`, with `press` tried first. `press` returns an ability id and is asked
 * only while AUTO itself would be allowed to press anything: the player alive,
 * not mid-cast, past the countdown, the pull still going (`autocast.ts`, the
 * first lines of `autoPress`).
 */
const ahead =
  (press: (s: SimState, player: Actor) => string | null): Steer =>
  (s) => {
    const player = playerOf(s)
    if (player.alive && !player.castId && s.countdown <= 0 && s.outcome === 'ongoing') {
      const id = press(s, player)
      if (id !== null && pressable(s, player, id)) return dodge(s, [slotFor(player, id)])
    }
    return auto(s)
  }

/**
 * The taunt, whoever holds the boss: the tank branch of `autoPress` as it was
 * before #366 (`e5a0e82`), which put the taunt first in the list and let
 * `canCast` decide. The rest of the list is `autoPress`'s own, reached when the
 * taunt cannot go out.
 */
export const alwaysTaunt: Steer = ahead((_, player) => specOf({ classId: player.classId, spec: player.spec }).abilities.taunt)

/**
 * The stack lines a holder is read against, worst first by share of its line.
 *
 * The first two are `tankRotation`'s own (`ai.ts`, the `reads` array inside
 * `load`). The AI reads those two and no others: a body holding the boss under
 * an engulf or a dose is not something its swap rule looks at. The last two are
 * the same line drawn one short of the stack that bursts, the way
 * `BLOAT_SWAP_AT` is drawn one short of ten, and they are what makes `swap` a
 * policy for the four fights that count a holder up and not only for the two
 * the AI answers. A swallowed holder needs no line: `topThreatTarget` skips it
 * (`combat.ts`), so the boss is already on somebody else and the retake rule
 * `autoPress` has applies as it is.
 */
const SWAP_LINES: Array<{ aura: AuraId; at: number }> = [
  { aura: 'swelling', at: BLOAT_SWAP_AT },
  { aura: 'slighted', at: SLIGHT_MAX },
  { aura: 'engulfed', at: ENGULF_MAX - 1 },
  { aura: 'dosed', at: REAGENT_MAX - 1 },
]

/** The line `a` is nearest, as stacks held and the line they are read against. Same shape as the AI's `load`. */
const loadOf = (a: Actor | null): { stacks: number; at: number; of: AuraId } => {
  const reads = SWAP_LINES.map((line) => ({ stacks: a ? (getAura(a, line.aura)?.stacks ?? 0) : 0, at: line.at, of: line.aura }))
  let worst = reads[0]!
  for (const read of reads) if (read.stacks / read.at > worst.stacks / worst.at) worst = read
  return worst
}

/**
 * Whether the other tank should take the boss now: the swap rule of
 * `tankRotation` (`ai.ts`, "The swap"). Not at the line myself, the holder is a
 * tank, the holder is at its line, and the holder carries more of that stack
 * than I do.
 */
export function wantsSwap(s: SimState, player: Actor): boolean {
  const mine = loadOf(player)
  if (mine.stacks >= mine.at) return false
  const holder = topThreatTarget(s)
  const theirs = loadOf(holder)
  return (
    holder !== null &&
    holder.id !== player.id &&
    holder.role === 'tank' &&
    theirs.stacks >= theirs.at &&
    theirs.stacks > (getAura(player, theirs.of)?.stacks ?? 0)
  )
}

/** `auto`, and the taunt whenever `wantsSwap`. */
export const swap: Steer = ahead((s, player) =>
  wantsSwap(s, player) ? specOf({ classId: player.classId, spec: player.spec }).abilities.taunt : null,
)

/** Below this share of health the finisher is not held back for a dire body: `autoPress`'s filler line. */
const HURT_AT = 0.9

/**
 * The healer's big heal on any hurt body. `autoPress` presses it only for a
 * body under forty-five percent and holds it otherwise; this presses it
 * wherever it presses the filler, which is what spending mana on it means. It
 * costs what the ability costs and the press is refused when the bar is short
 * (`castBlocker`, 'resource').
 */
export const spend: Steer = ahead((s, player) => {
  if (player.role !== 'healer') return null
  const hurt = mostHurt(s)
  return hurt !== null && hurt.hp / hurt.maxHp < HURT_AT ? specOf({ classId: player.classId, spec: player.spec }).abilities.finisher : null
})

/**
 * The hunters' two answers to where to stand, which differ in whether they
 * keep standing there.
 *
 * Both walk, when nothing is on the floor under them, to the band just inside
 * the reach of the filler (measured to the boss's edge, the way `castBlocker`
 * measures; shots are instants, so walking costs no cast). The far end of the
 * reach is where the distance trait pays most (`combat.ts`, `traitBonus`,
 * `'distance'`) and the near end of the shot is a floor (`SHOT_MIN_RANGE`), so
 * a hunter that is left to stand where the raid put it can be inside the floor
 * and fire nothing; neither of these is that hunter. That one is `auto`.
 *
 *   keep    walks back to the band every time it is out of it, which is
 *           whenever the boss has moved.
 *   fixed   walks to the band once, the first time it is not in it, and stands
 *           from then on, leaving only for a puddle and not coming back.
 *
 * The pair is the cost of attention and nothing else: both are at the same
 * place at the start, and the difference is the boss's walking since.
 */
const settled = new WeakSet<SimState>()

const band =
  (once: boolean): Steer =>
  (s) => {
    const base = auto(s)
    if (Math.hypot(base.moveX, base.moveY) > 0 || (once && settled.has(s))) return base
    const player = playerOf(s)
    const filler = specOf({ classId: player.classId, spec: player.spec }).abilities.filler
    const reach = filler === null ? 0 : (ABILITIES[filler]?.range ?? 0)
    const b = bossOf(s)
    if (!player.alive || reach <= 0) return base
    const gap = Math.hypot(b.pos.x - player.pos.x, b.pos.y - player.pos.y)
    const edge = reach + b.radius
    const stepLen = player.moveSpeed * DT
    // Three steps wide, so a step either way cannot carry it over the other side.
    if (gap < edge - 4 * stepLen) {
      return { moveX: (player.pos.x - b.pos.x) / (gap || 1), moveY: (player.pos.y - b.pos.y) / (gap || 1), pressed: base.pressed }
    }
    if (gap > edge - stepLen) {
      return { moveX: (b.pos.x - player.pos.x) / (gap || 1), moveY: (b.pos.y - player.pos.y) / (gap || 1), pressed: base.pressed }
    }
    if (once) settled.add(s)
    return base
  }

export const keep: Steer = band(false)
export const fixed: Steer = band(true)

/**
 * The raid with one tank: `standinParty` with the second tank's slot given to
 * the damage pick `autoParty` itself would have put there (the first of its
 * damage pool, a rogue). Every other slot keeps its seat and its pick, so the
 * pull differs from the two-tank one in that body and what follows from it.
 * `autoParty` cannot make this raid: its tank count is a target (`roleTargets`,
 * two from ten bodies up), and `isLegalComposition` has said one is fine since
 * #367.
 */
export function oneTankParty(size: number, lead: Pick): Pick[] {
  const party = standinParty(size, lead)
  const other = party.findIndex((p, i) => i > 0 && specOf(p).role === 'tank')
  if (other < 0) throw new Error(`${lead.classId} has no second tank in a raid of ${size} to give up`)
  const out = party.map((p, i) => (i === other ? dps('rogue') : p))
  if (!isLegalComposition(out)) throw new Error('the one-tank raid is not a legal composition')
  return out
}

/**
 * Encounters in which the body holding the boss carries a count that the other
 * tank answers (`swelling`, `slighted`, `engulfed`, `dosed`; `boss.ts`, the only
 * four places those four auras are stacked). `swap` differs from AUTO's own tank
 * in these and only these.
 */
const LINED = ['bloat', 'insignificance', 'engulf', 'reagent'] as const

/**
 * Those four, and the swallowing: the five whose code says a second tank is the
 * answer (`boss.ts`, `scheduleBloat`, `scheduleSlight`, `scheduleGorge`,
 * `scheduleEngulf`, `scheduleReagent`). The swallowing counts nothing up, so
 * the policy has no line for it; it is in the one-tank column all the same,
 * because the code says a raid with one tank cannot answer it.
 */
const SWALLOWS = [...LINED, 'gorge'] as const

export const linedBosses = (): number[] =>
  ENCOUNTERS.flatMap((e, i) => (LINED.some((m) => e.kit.includes(m)) ? [i] : []))

export const swapBosses = (): number[] =>
  ENCOUNTERS.flatMap((e, i) => (SWALLOWS.some((m) => e.kit.includes(m)) ? [i] : []))

// --- the held-to-source check ------------------------------------------------

/**
 * Lines of `ai.ts` and `autocast.ts` that the copies above are copies of. If
 * one is edited the check stops the probe, and whoever edited it reads the
 * policy again.
 */
const SOURCE_LINES: Array<[file: string, line: string]> = [
  ['src/sim/ai.ts', "{ stacks: swelling, at: BLOAT_SWAP_AT, of: 'swelling' },"],
  ['src/sim/ai.ts', "{ stacks: slighted, at: SLIGHT_MAX, of: 'slighted' },"],
  ['src/sim/ai.ts', 'if (kit.taunt && mineNow.stacks < mineNow.at) {'],
  [
    'src/sim/ai.ts',
    "if (holder && holder.id !== actor.id && holder.role === 'tank' && theirs.stacks >= theirs.at && theirs.stacks > mine) {",
  ],
  ['src/sim/autocast.ts', "const mayTaunt = s.mode !== 'raid' || (holder !== null && holder.role !== 'tank')"],
  ['src/sim/autocast.ts', 'if (hurt !== null && hurt.hp / hurt.maxHp < 0.9) order.push(slotOf(kit.filler))'],
  ['src/sim/autocast.ts', 'if (dire) order.push(slotOf(kit.finisher))'],
]

const SEED = 4242

/** A ten-man heroic pull, past the countdown, with `party` and the player in slot 0. */
const pulled = (party: Pick[], encounter: number): SimState => {
  const s = createState(SEED, 0, party, 'heroic', encounter)
  s.countdown = 0
  return s
}

const tauntOn = (player: Actor): boolean =>
  (player.cooldowns[specOf({ classId: player.classId, spec: player.spec }).abilities.taunt!] ?? 0) > 0

/**
 * What the policies are held to, run once before any pull. Throws on the first
 * thing that is not so; returns how many things it asked, for the log.
 *
 *   - the copied lines are still in the source;
 *   - `swap` presses the taunt on the very state in which the AI's own tank,
 *     in the same slot, does, and on none in which it does not, over every
 *     stack count of the two lines the AI reads;
 *   - `swap` also presses at the two lines the AI does not read;
 *   - `never` (the AUTO tank) presses no taunt while the other tank holds, and
 *     `alwaysTaunt` does;
 *   - `spend` presses the finisher on a hurt body where `auto` does not, and
 *     `autostill` does not move where `auto` does;
 *   - `keep` walks back to the band when the boss has moved, `fixed` placed once does not;
 *   - the one-tank raid has one tank and is a legal composition.
 */
export function selfCheck(): number {
  let asked = 0
  const expect = (what: string, ok: boolean): void => {
    asked++
    if (!ok) throw new Error(`policy self-check: ${what}`)
  }

  for (const [file, line] of SOURCE_LINES) {
    expect(`${file} no longer has the line "${line}"`, readFileSync(file, 'utf8').includes(line))
  }

  const lead = pickFor('warrior', 'tank')!
  const two = standinParty(10, lead)
  const one = oneTankParty(10, lead)
  expect('the one-tank raid has one tank', one.filter((p) => specOf(p).role === 'tank').length === 1)
  expect('the two-tank raid has two', two.filter((p) => specOf(p).role === 'tank').length === 2)
  expect('the fights that count a holder up are four', linedBosses().length === 4)
  expect('the fights a second tank answers are five', swapBosses().length === 5)

  // The holder is the other tank with `stacks` of `aura`; the player holds none.
  const holding = (aura: AuraId, stacks: number, mine = 0): SimState => {
    const s = pulled(two, linedBosses()[0]!)
    const player = playerOf(s)
    const other = s.actors.find((a) => !a.isPlayer && a.faction === 'party' && a.role === 'tank')!
    for (let i = 0; i < stacks; i++) stackAura(other, aura, bossOf(s).id)
    for (let i = 0; i < mine; i++) stackAura(player, aura, bossOf(s).id)
    s.threat[other.id] = 1e9
    expect('the other tank holds the boss', topThreatTarget(s)!.id === other.id)
    return s
  }

  /** Whether the tank's taunt went out in one tick, the slot driven by `steer` or handed to the AI. */
  const taunted = (s: SimState, steer: Steer | null, seed: number): boolean => {
    const player = playerOf(s)
    if (steer === null) unattended(s, 0)
    step(s, steer === null ? { moveX: 0, moveY: 0, pressed: [] } : steer(s), new Rng(seed))
    return tauntOn(player)
  }

  const pressedBy = (steer: Steer, aura: AuraId, stacks: number, mine = 0): boolean =>
    taunted(holding(aura, stacks, mine), steer, SEED)
  // The AI rolls a fumble now and then, so "the AI did" is "the AI did on some roll".
  const aiDid = (aura: AuraId, stacks: number, mine = 0): boolean => {
    for (let seed = 1; seed <= 12; seed++) if (taunted(holding(aura, stacks, mine), null, seed)) return true
    return false
  }

  for (const { aura, at } of SWAP_LINES.slice(0, 2)) {
    for (let stacks = 0; stacks <= at + 1; stacks++) {
      expect(`swap and the AI agree on ${aura} x${stacks}`, pressedBy(swap, aura, stacks) === aiDid(aura, stacks))
    }
    // Not vacuous: the AI does take the boss at the line, and does not below it.
    expect(`the AI takes the boss at ${aura} x${at}`, aiDid(aura, at))
    expect(`the AI does not at ${aura} x${at - 1}`, !aiDid(aura, at - 1))
    // Carrying as much as the holder: not the trade, for either.
    expect(`swap and the AI agree on ${aura} when both carry it`, pressedBy(swap, aura, at, at) === aiDid(aura, at, at))
  }
  for (const { aura, at } of SWAP_LINES.slice(2)) {
    expect(`swap holds below the ${aura} line`, !pressedBy(swap, aura, at - 1))
    expect(`swap takes the boss at the ${aura} line`, pressedBy(swap, aura, at))
  }

  expect('never (auto) presses no taunt while the other tank holds', !pressedBy(auto, 'swelling', 0))
  expect('alwaysTaunt presses it', pressedBy(alwaysTaunt, 'swelling', 0))

  {
    const s = pulled(standinParty(10, pickFor('priest', 'healer')!), 0)
    const player = playerOf(s)
    const hurt = s.actors.find((a) => !a.isPlayer && a.faction === 'party')!
    hurt.hp = hurt.maxHp * 0.8
    const finisher = slotFor(player, specOf({ classId: player.classId, spec: player.spec }).abilities.finisher)
    expect('auto holds the finisher at eighty percent', !auto(s).pressed.includes(finisher))
    expect('spend presses it', spend(s).pressed.includes(finisher))
    hurt.hp = hurt.maxHp * 0.3
    expect('auto presses it on a dire body', auto(s).pressed.includes(finisher))
  }

  {
    const s = pulled(two, 0)
    const player = playerOf(s)
    // `dodge` reads a patch's position and radius and nothing else, so that is all this one has.
    s.ground.push({ pos: { x: player.pos.x + 1, y: player.pos.y }, radius: 80 } as SimState['ground'][number])
    const walks = auto(s)
    expect('auto steps out of a puddle', Math.hypot(walks.moveX, walks.moveY) > 0)
    const still = autostill(s)
    expect('autostill does not', still.moveX === 0 && still.moveY === 0)
  }

  {
    const s = pulled(standinParty(10, pickFor('hunter', 'dps')!), 0)
    const player = playerOf(s)
    const b = bossOf(s)
    s.ground.length = 0
    // A body's length off the boss, well inside the band.
    player.pos.x = b.pos.x + b.radius + 40
    player.pos.y = b.pos.y
    expect('auto stands where it is', auto(s).moveX === 0)
    expect('keep walks out from a boss that is close', keep(s).moveX > 0)
    expect('fixed does too, the first time', fixed(s).moveX > 0)
    // Put it in the band, let `fixed` see that, and then move the boss away.
    const reach = ABILITIES[specOf({ classId: player.classId, spec: player.spec }).abilities.filler!]!.range
    player.pos.x = b.pos.x + b.radius + reach - 2 * player.moveSpeed * DT
    expect('fixed stands in the band', fixed(s).moveX === 0 && keep(s).moveX === 0)
    b.pos.x -= 200
    expect('fixed stays put once placed', fixed(s).moveX === 0)
    expect('keep walks back to the boss', keep(s).moveX < 0)
  }

  return asked
}

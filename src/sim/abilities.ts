import { SHOT_MIN_RANGE, SPELL_RANGE } from './constants'
import type { AuraId, Role } from './types'

export type AbilityKind = 'damage' | 'heal' | 'defensive' | 'taunt' | 'charge' | 'raid'

export interface Ability {
  id: string
  name: string
  role: Role
  kind: AbilityKind
  /** 0 means instant. */
  castTime: number
  cooldown: number
  /**
   * Paid out of whatever the class runs on.
   *
   * Free is a deliberate answer rather than a default: defensives and taunts
   * are the reply to a mechanic, and a reply that is sometimes unaffordable
   * for reasons the button cannot show is worse than no resource at all.
   */
  cost: number
  /** Direct damage or heal, before modifiers. */
  amount: number
  /**
   * Threat multiplier applied on top of the damage dealt.
   *
   * Taunts ignore this: they do not scale off a number they never deal.
   */
  threatMult: number
  /** Aura applied to the target on a successful cast. */
  aura: AuraId | null
  /** Maximum distance to the target. */
  range: number
  /**
   * Minimum distance.
   *
   * Two things need one, for opposite reasons: a charge because being already
   * there is not worth a cooldown, and a bow because it cannot be drawn on
   * something standing on top of you.
   */
  minRange?: number
  /**
   * Off the global cooldown, like a defensive in the game this apes: it can
   * be pressed mid-rotation without losing the press you already made.
   */
  offGcd?: boolean
  /**
   * Paid out of your own health bar, as a fraction of it.
   *
   * The one resource in this game that the healers can see. Everything else a
   * press costs is private -- mana, rage, a cooldown -- and is settled between
   * the player and their own bar; this is spent out of the number somebody
   * else is watching, which is what makes it a decision about the raid rather
   * than about the rotation.
   *
   * Never lethal: a press that would take the last of it is refused, the same
   * as one that cannot be afforded in mana.
   */
  selfCost?: number
}

const MELEE = 52
const SPELL = SPELL_RANGE
const HEAL_RANGE = 390

/**
 * As far as a warrior will run at something.
 *
 * Short of a spell's range: this is a sprint, not a leap across the arena.
 */
const CHARGE_RANGE = 260

/**
 * Taunts reach further than a swing.
 *
 * A taunt that only worked in melee would be useless for the case it exists
 * for: the boss has already walked off to eat somebody else, and the tank is
 * the one thing that is not next to it.
 */
const TAUNT_RANGE = 260

/**
 * Long enough that losing the boss twice in a row is a real failure rather
 * than a button press, short enough to answer one bad pull.
 */
const TAUNT_COOLDOWN = 10

const list: Ability[] = [
  // --- warrior (tank) -------------------------------------------------------
  { id: 'cleave', name: 'Wide Swing', role: 'tank', kind: 'damage', castTime: 0, cooldown: 0, cost: 15, amount: 60, threatMult: 4, aura: null, range: MELEE },
  { id: 'shield_slam', name: 'Shield Bash', role: 'tank', kind: 'damage', castTime: 0, cooldown: 6, cost: 20, amount: 110, threatMult: 6, aura: null, range: MELEE },
  { id: 'shield_wall', name: 'Brace', role: 'tank', kind: 'defensive', castTime: 0, cooldown: 40, cost: 0, amount: 0, threatMult: 0, aura: 'shield', range: 0, offGcd: true },
  { id: 'taunt', name: 'Challenge', role: 'tank', kind: 'taunt', castTime: 0, cooldown: TAUNT_COOLDOWN, cost: 0, amount: 0, threatMult: 0, aura: null, range: TAUNT_RANGE },

  // --- priest (healer): sustained, leans on its heal-over-time -------------
  { id: 'heal', name: 'Mend', role: 'healer', kind: 'heal', castTime: 2, cooldown: 0, cost: 40, amount: 473, threatMult: 0, aura: null, range: HEAL_RANGE },
  { id: 'renew', name: 'Steady Mend', role: 'healer', kind: 'heal', castTime: 0, cooldown: 10, cost: 27, amount: 0, threatMult: 0, aura: 'renew', range: HEAL_RANGE },
  { id: 'flash_heal', name: 'Quick Mend', role: 'healer', kind: 'heal', castTime: 0, cooldown: 7, cost: 56, amount: 308, threatMult: 0, aura: null, range: HEAL_RANGE },

  // --- paladin (healer): slower, bigger, with a panic button ---------------
  { id: 'holy_light', name: 'Radiance', role: 'healer', kind: 'heal', castTime: 2.2, cooldown: 0, cost: 50, amount: 484, threatMult: 0, aura: null, range: HEAL_RANGE },
  { id: 'lay_on_hands', name: 'Last Rite', role: 'healer', kind: 'heal', castTime: 0, cooldown: 45, cost: 126, amount: 1173, threatMult: 0, aura: null, range: HEAL_RANGE },

  // Healers contribute damage when nobody needs them, which is the only thing
  // that makes a two-healer party viable rather than a slow loss.
  { id: 'smite', name: 'Rebuke', role: 'healer', kind: 'damage', castTime: 0, cooldown: 0, cost: 14, amount: 78, threatMult: 1, aura: null, range: SPELL },
  { id: 'holy_shock', name: 'Searing Word', role: 'healer', kind: 'damage', castTime: 0, cooldown: 6, cost: 20, amount: 210, threatMult: 1, aura: null, range: SPELL },

  // --- mage: burst, and a long cast that fights the movement ---------------
  //
  // All four are fifteen percent above where they were fitted, which is what
  // the cast time is worth once every rung of every boss buys one more
  // mechanic than it used to. Nine of the ten damage specs fill with an
  // instant and pay a step for a demand to move; this one pays the whole
  // global. Measured over five bosses at twelve pulls a spec, that had it last
  // on four of the five and last overall by a spread of 1.44; at 1.15 the
  // spread is 1.33 and it is no longer the worst on three of them.
  //
  // Fifteen percent and not more, and the sweep says why: at 1.30 it is second
  // on the Tidebreaker, at 1.45 it is first there and second on the Choir --
  // and it is *still* last on the Watcher and the Ledger at both. A flat
  // coefficient overpays on the fights it can stand still in and cannot buy
  // anything on the two that keep it walking. Those two want a rotation that
  // works while moving, not a bigger number.
  { id: 'frostbolt', name: 'Frost Shard', role: 'dps', kind: 'damage', castTime: 1.4, cooldown: 0, cost: 18, amount: 138, threatMult: 1, aura: null, range: SPELL },
  { id: 'living_bomb', name: 'Slow Burn', role: 'dps', kind: 'damage', castTime: 0, cooldown: 14, cost: 25, amount: 28, threatMult: 1, aura: 'living_bomb', range: SPELL },
  { id: 'pyroblast', name: 'Falling Ember', role: 'dps', kind: 'damage', castTime: 2.5, cooldown: 13, cost: 55, amount: 495, threatMult: 1, aura: null, range: SPELL },
  // The one thing it can press with its feet moving.
  //
  // Every other damage spec fills with an instant, so a fight that asks the
  // raid to move costs them a step and costs this one the whole global. That
  // was survivable while a ten-man on normal met three mechanics; at four it
  // put the mage at two fifths of the best dealer on the boss that moves the
  // most, and at the bottom of four of the five. Weak on purpose -- standing
  // still is still where the damage is -- but not nothing, which is what it
  // had.
  { id: 'ice_lance', name: 'Icicle', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, cost: 10, amount: 83, threatMult: 1, aura: null, range: SPELL },

  // --- hunter: everything instant, so it never stops damaging --------------
  { id: 'steady_shot', name: 'Steady Draw', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, cost: 14, amount: 109, threatMult: 1, aura: null, range: SPELL, minRange: SHOT_MIN_RANGE },
  { id: 'serpent_sting', name: 'Venom Shot', role: 'dps', kind: 'damage', castTime: 0, cooldown: 16, cost: 20, amount: 44, threatMult: 1, aura: 'serpent_sting', range: SPELL, minRange: SHOT_MIN_RANGE },
  { id: 'aimed_shot', name: 'Long Shot', role: 'dps', kind: 'damage', castTime: 0, cooldown: 7, cost: 25, amount: 369, threatMult: 1, aura: null, range: SPELL, minRange: SHOT_MIN_RANGE },

  // --- leather melee: brief speed on a long cooldown -----------------------
  //
  // A rogue and a cat pay for their damage by standing where the boss is
  // aiming, and pay again every time something lands on the floor: melee range
  // is 52 units, so walking out is walking out of the fight entirely, while a
  // caster keeps working from 340. Plate melee answer that with armour they
  // can afford to eat a hit through. Leather cannot, so they get the other
  // answer — leave sooner and come back faster.
  //
  // Five seconds and forty-five of cooldown: enough for one exit and one
  // return, not enough to play the whole fight at speed.
  { id: 'sprint', name: 'Bolt', role: 'dps', kind: 'defensive', castTime: 0, cooldown: 45, cost: 0, amount: 0, threatMult: 0, aura: 'sprint', range: 0, offGcd: true },
  { id: 'dash', name: 'Dash', role: 'dps', kind: 'defensive', castTime: 0, cooldown: 45, cost: 0, amount: 0, threatMult: 0, aura: 'sprint', range: 0, offGcd: true },

  // --- rogue: highest sustained damage, paid for in melee range ------------
  { id: 'sinister_strike', name: 'Quick Stab', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, cost: 32, amount: 93, threatMult: 1, aura: null, range: MELEE },
  { id: 'rupture', name: 'Open Wound', role: 'dps', kind: 'damage', castTime: 0, cooldown: 14, cost: 25, amount: 45, threatMult: 1, aura: 'rupture', range: MELEE },
  { id: 'eviscerate', name: 'Gut', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, cost: 35, amount: 193, threatMult: 1, aura: null, range: MELEE },

  // --- warrior, as damage: bleeds and an execute -----------------------------
  { id: 'charge', name: 'Close', role: 'dps', kind: 'charge', castTime: 0, cooldown: 15, cost: 0, amount: 0, threatMult: 0, aura: null, range: CHARGE_RANGE, minRange: MELEE + 40 },
  // The bear's own. Same rule as the warrior's — it crosses a gap it could not
  // walk, arrives with rage to spend, and refuses to fire from inside melee —
  // because a tank that cannot reach what wandered off is a tank whose raid is
  // being eaten while it jogs.
  { id: 'wild_charge', name: 'Bound', role: 'tank', kind: 'charge', castTime: 0, cooldown: 15, cost: 0, amount: 0, threatMult: 0, aura: null, range: CHARGE_RANGE, minRange: MELEE + 40 },
  { id: 'mortal_strike', name: 'Deep Cut', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, cost: 18, amount: 108, threatMult: 1, aura: null, range: MELEE },
  { id: 'rend', name: 'Bleed', role: 'dps', kind: 'damage', castTime: 0, cooldown: 14, cost: 10, amount: 40, threatMult: 1, aura: 'rend', range: MELEE },
  { id: 'execute', name: 'Finish', role: 'dps', kind: 'damage', castTime: 0, cooldown: 14, cost: 25, amount: 475, threatMult: 1, aura: null, range: MELEE },

  // --- paladin, as tank ------------------------------------------------------
  { id: 'avengers_shield', name: 'Thrown Shield', role: 'tank', kind: 'damage', castTime: 0, cooldown: 6, cost: 28, amount: 105, threatMult: 6, aura: null, range: 200 },
  { id: 'consecration', name: 'Hallowed Ground', role: 'tank', kind: 'damage', castTime: 0, cooldown: 0, cost: 22, amount: 58, threatMult: 4, aura: null, range: MELEE },
  { id: 'divine_protection', name: 'Ward', role: 'tank', kind: 'defensive', castTime: 0, cooldown: 40, cost: 0, amount: 0, threatMult: 0, aura: 'shield', range: 0, offGcd: true },
  { id: 'hand_of_reckoning', name: 'Summons', role: 'tank', kind: 'taunt', castTime: 0, cooldown: TAUNT_COOLDOWN, cost: 0, amount: 0, threatMult: 0, aura: null, range: TAUNT_RANGE },

  // --- paladin, as damage ----------------------------------------------------
  { id: 'crusader_strike', name: 'Zealot Blow', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, cost: 18, amount: 80, threatMult: 1, aura: null, range: MELEE },
  { id: 'judgement', name: 'Verdict', role: 'dps', kind: 'damage', castTime: 0, cooldown: 8, cost: 14, amount: 26, threatMult: 1, aura: 'judgement', range: 200 },
  { id: 'hammer_of_wrath', name: 'Falling Hammer', role: 'dps', kind: 'damage', castTime: 0, cooldown: 13, cost: 45, amount: 301, threatMult: 1, aura: null, range: 200 },

  // --- druid, as tank --------------------------------------------------------
  { id: 'maul', name: 'Maul', role: 'tank', kind: 'damage', castTime: 0, cooldown: 6, cost: 22, amount: 118, threatMult: 6, aura: null, range: MELEE },
  { id: 'swipe', name: 'Swipe', role: 'tank', kind: 'damage', castTime: 0, cooldown: 0, cost: 16, amount: 62, threatMult: 4, aura: null, range: MELEE },
  { id: 'frenzied_regen', name: 'Knit', role: 'tank', kind: 'defensive', castTime: 0, cooldown: 40, cost: 0, amount: 0, threatMult: 0, aura: 'shield', range: 0, offGcd: true },
  { id: 'growl', name: 'Growl', role: 'tank', kind: 'taunt', castTime: 0, cooldown: TAUNT_COOLDOWN, cost: 0, amount: 0, threatMult: 0, aura: null, range: TAUNT_RANGE },

  // --- druid, as healer: heal-over-time first ---------------------------------
  { id: 'healing_touch', name: 'Greenmend', role: 'healer', kind: 'heal', castTime: 2.2, cooldown: 0, cost: 42, amount: 385, threatMult: 0, aura: null, range: HEAL_RANGE },
  { id: 'rejuvenation', name: 'Quicken', role: 'healer', kind: 'heal', castTime: 0, cooldown: 9, cost: 30, amount: 0, threatMult: 0, aura: 'rejuvenation', range: HEAL_RANGE },
  { id: 'swiftmend', name: 'Bloom', role: 'healer', kind: 'heal', castTime: 0, cooldown: 8, cost: 54, amount: 246, threatMult: 0, aura: null, range: HEAL_RANGE },
  { id: 'starsurge', name: 'Star Lance', role: 'healer', kind: 'damage', castTime: 0, cooldown: 8, cost: 22, amount: 195, threatMult: 1, aura: null, range: SPELL },

  // --- priest, as damage -----------------------------------------------------
  { id: 'mind_blast', name: 'Mind Blow', role: 'dps', kind: 'damage', castTime: 0, cooldown: 8, cost: 45, amount: 352, threatMult: 1, aura: null, range: SPELL },
  { id: 'shadow_word_pain', name: 'Creeping Pain', role: 'dps', kind: 'damage', castTime: 0, cooldown: 8, cost: 18, amount: 33, threatMult: 1, aura: 'shadow_word_pain', range: SPELL },
  { id: 'mind_flay', name: 'Unravel', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, cost: 18, amount: 100, threatMult: 1, aura: null, range: SPELL },

  // --- shaman, as healer -----------------------------------------------------
  { id: 'healing_wave', name: 'Tidemend', role: 'healer', kind: 'heal', castTime: 2.1, cooldown: 0, cost: 41, amount: 422, threatMult: 0, aura: null, range: HEAL_RANGE },
  { id: 'riptide', name: 'Undertow', role: 'healer', kind: 'heal', castTime: 0, cooldown: 9, cost: 31, amount: 0, threatMult: 0, aura: 'riptide', range: HEAL_RANGE },
  { id: 'chain_heal', name: 'Tide Chain', role: 'healer', kind: 'heal', castTime: 0, cooldown: 8, cost: 58, amount: 300, threatMult: 0, aura: null, range: HEAL_RANGE },
  { id: 'lava_burst', name: 'Magma Burst', role: 'healer', kind: 'damage', castTime: 0, cooldown: 7, cost: 24, amount: 215, threatMult: 1, aura: null, range: SPELL },

  // --- shaman --------------------------------------------------------------
  { id: 'lightning_bolt', name: 'Spark', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, cost: 20, amount: 120, threatMult: 1, aura: null, range: SPELL },
  { id: 'flame_shock', name: 'Cinder', role: 'dps', kind: 'damage', castTime: 0, cooldown: 13, cost: 24, amount: 83, threatMult: 1, aura: 'flame_shock', range: SPELL },
  { id: 'chain_lightning', name: 'Forked Spark', role: 'dps', kind: 'damage', castTime: 1.5, cooldown: 9, cost: 34, amount: 430, threatMult: 1, aura: null, range: SPELL },

  // --- the fifth button ------------------------------------------------------
  //
  // Everybody now carries an answer to the floor, which is a thing only tanks
  // and leather melee had. A mechanic in this game is dodged or eaten, and
  // eleven of the seventeen specs had nothing at all to do about the eating —
  // so the one press that separated a good pull from a bad one was a press
  // most of the roster did not own.
  //
  // A brace, not a wall. Thirty percent off for four seconds against a tank's
  // sixty for six, and on a longer cooldown: it is enough to live through the
  // one thing you could not get out of, and not enough to stand in the next
  // one on purpose. Free of resource for the same reason a taunt is — an
  // answer to a mechanic that is sometimes unaffordable is worse than none.
  { id: 'die_by_the_sword', name: 'Last Stand', role: 'dps', kind: 'defensive', castTime: 0, cooldown: 50, cost: 0, amount: 0, threatMult: 0, aura: 'brace', range: 0, offGcd: true },
  { id: 'shield_of_vengeance', name: 'Reprisal', role: 'dps', kind: 'defensive', castTime: 0, cooldown: 50, cost: 0, amount: 0, threatMult: 0, aura: 'brace', range: 0, offGcd: true },
  { id: 'fade', name: 'Slip Away', role: 'healer', kind: 'defensive', castTime: 0, cooldown: 50, cost: 0, amount: 0, threatMult: 0, aura: 'brace', range: 0, offGcd: true },
  { id: 'dispersion', name: 'Scatter', role: 'dps', kind: 'defensive', castTime: 0, cooldown: 50, cost: 0, amount: 0, threatMult: 0, aura: 'brace', range: 0, offGcd: true },
  { id: 'barkskin', name: 'Bark', role: 'dps', kind: 'defensive', castTime: 0, cooldown: 50, cost: 0, amount: 0, threatMult: 0, aura: 'brace', range: 0, offGcd: true },
  { id: 'survival_instincts', name: 'Thick Hide', role: 'dps', kind: 'defensive', castTime: 0, cooldown: 50, cost: 0, amount: 0, threatMult: 0, aura: 'brace', range: 0, offGcd: true },
  { id: 'astral_shift', name: 'Phase Out', role: 'dps', kind: 'defensive', castTime: 0, cooldown: 50, cost: 0, amount: 0, threatMult: 0, aura: 'brace', range: 0, offGcd: true },
  { id: 'ice_barrier', name: 'Rime Shell', role: 'dps', kind: 'defensive', castTime: 0, cooldown: 50, cost: 0, amount: 0, threatMult: 0, aura: 'brace', range: 0, offGcd: true },
  { id: 'unending_resolve', name: 'Grit', role: 'dps', kind: 'defensive', castTime: 0, cooldown: 50, cost: 0, amount: 0, threatMult: 0, aura: 'brace', range: 0, offGcd: true },
  { id: 'deterrence', name: 'Turn Aside', role: 'dps', kind: 'defensive', castTime: 0, cooldown: 50, cost: 0, amount: 0, threatMult: 0, aura: 'brace', range: 0, offGcd: true },
  { id: 'evasion', name: 'Sidestep', role: 'dps', kind: 'defensive', castTime: 0, cooldown: 50, cost: 0, amount: 0, threatMult: 0, aura: 'brace', range: 0, offGcd: true },
  { id: 'divine_shield', name: 'Sanctuary', role: 'healer', kind: 'defensive', castTime: 0, cooldown: 50, cost: 0, amount: 0, threatMult: 0, aura: 'brace', range: 0, offGcd: true },

  // Two more ways to close a gap, on the same terms as the warrior's: free,
  // refused from inside melee, and the reason a class that has to be
  // somewhere can get there.
  { id: 'divine_steed', name: 'Charger', role: 'tank', kind: 'charge', castTime: 0, cooldown: 15, cost: 0, amount: 0, threatMult: 0, aura: null, range: CHARGE_RANGE, minRange: MELEE + 40 },
  // The hunter's is the other direction — it is the one class whose damage
  // falls off when something walks onto it, so its way out is speed rather
  // than a way in.
  { id: 'cheetah', name: 'Fleetfoot', role: 'dps', kind: 'defensive', castTime: 0, cooldown: 45, cost: 0, amount: 0, threatMult: 0, aura: 'sprint', range: 0, offGcd: true },

  // And the instants that give a walking spec something to press. The mage's
  // `ice_lance` was the first of these and was unreachable for two rounds:
  // it sat in the kit, the bar never listed it, and only the party AI ever
  // pressed one.
  { id: 'shadow_word_death', name: 'Last Word', role: 'dps', kind: 'damage', castTime: 0, cooldown: 9, cost: 22, amount: 196, threatMult: 1, aura: null, range: SPELL },
  { id: 'sunfire', name: 'Sunbrand', role: 'dps', kind: 'damage', castTime: 0, cooldown: 9, cost: 21, amount: 188, threatMult: 1, aura: null, range: SPELL },
  { id: 'exorcism', name: 'Banish', role: 'dps', kind: 'damage', castTime: 0, cooldown: 9, cost: 22, amount: 197, threatMult: 1, aura: null, range: 200 },
  { id: 'earth_shock', name: 'Stoneblow', role: 'dps', kind: 'damage', castTime: 0, cooldown: 9, cost: 24, amount: 205, threatMult: 1, aura: null, range: SPELL },

  // The paladin's healing kit was two buttons, which is the smallest in the
  // game by half. A trickle it can put on the tank and leave there.
  { id: 'beacon_of_light', name: 'Beacon', role: 'healer', kind: 'heal', castTime: 0, cooldown: 9, cost: 30, amount: 0, threatMult: 0, aura: 'beacon', range: HEAL_RANGE },

  // --- warlock: instant, and paid for out of its own health ----------------
  //
  // Everything it presses is instant except the finisher, which is the shape
  // the fight argues with: the mage pays the movement tax on its filler and
  // this one pays it once, on the biggest press it has. What it does with the
  // globals it keeps is buy them with health.
  { id: 'shadow_bolt', name: 'Gloom Bolt', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, cost: 20, amount: 96, threatMult: 1, aura: null, range: SPELL },
  { id: 'immolate', name: 'Kindle', role: 'dps', kind: 'damage', castTime: 0, cooldown: 14, cost: 24, amount: 42, threatMult: 1, aura: 'immolate', range: SPELL },
  { id: 'chaos_bolt', name: 'Ruin Bolt', role: 'dps', kind: 'damage', castTime: 2, cooldown: 10, cost: 44, amount: 455, threatMult: 1, aura: null, range: SPELL },
  // The button the class is about. Costs no mana and eight percent of the
  // bar, and what it buys is three fillers worth half again -- so the damage
  // is real, the price is paid to the healers rather than to the rotation,
  // and the fight decides how often it can be afforded.
  { id: 'life_tap', name: 'Blood Price', role: 'dps', kind: 'defensive', castTime: 0, cooldown: 6, cost: 0, amount: 0, threatMult: 0, aura: 'pact', range: 0, offGcd: true, selfCost: 0.08 },

  // --- druid ---------------------------------------------------------------
  { id: 'wrath', name: 'Sunbolt', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, cost: 16, amount: 106, threatMult: 1, aura: null, range: SPELL },
  { id: 'moonfire', name: 'Moonbrand', role: 'dps', kind: 'damage', castTime: 0, cooldown: 15, cost: 24, amount: 58, threatMult: 1, aura: 'moonfire', range: SPELL },
  { id: 'shred', name: 'Shred', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, cost: 30, amount: 82, threatMult: 1, aura: null, range: MELEE },
  { id: 'rake', name: 'Rake', role: 'dps', kind: 'damage', castTime: 0, cooldown: 14, cost: 26, amount: 37, threatMult: 1, aura: 'rake', range: MELEE },
  { id: 'ferocious_bite', name: 'Savage Bite', role: 'dps', kind: 'damage', castTime: 0, cooldown: 0, cost: 33, amount: 175, threatMult: 1, aura: null, range: MELEE },
  { id: 'starfire', name: 'Starbolt', role: 'dps', kind: 'damage', castTime: 2, cooldown: 9, cost: 38, amount: 412, threatMult: 1, aura: null, range: SPELL },
]

/**
 * The nine a raid can be asked for.
 *
 * Long cooldowns against a fight that lands twenty to seventy raid-wide hits
 * in a pull, so a raid brings ten or so presses to spend on far more moments
 * than that. That ratio is the whole design: with enough of them the right
 * answer would be "press whenever it is up", which is the shape every other
 * input in this game already has and the reason none of them is a decision.
 *
 * Cast time is nought on all of them. What is being decided is which moment,
 * not whether the caller can stand still through it — and a called cooldown
 * that could be walked out of would be a cooldown the fight cancels rather
 * than one the player spends.
 *
 * Three answers, deliberately not interchangeable:
 *
 *   soften    `rally`, before the hit. Called late it is wasted.
 *   undo      a heal, after it. Called early it is wasted.
 *   press     damage, which asks a different question — not how to live
 *             through this but whether now is the moment to stop asking.
 */
export const RAID_COOLDOWN = 190

export const RAID_ABILITIES: Ability[] = [
  // Soften.
  { id: 'rallying_cry', name: 'Rallying Cry', role: 'dps', kind: 'raid', castTime: 0, cooldown: RAID_COOLDOWN, cost: 0, amount: 0, threatMult: 0, aura: 'rally', range: 0, offGcd: true },
  { id: 'aegis', name: 'Aegis', role: 'healer', kind: 'raid', castTime: 0, cooldown: RAID_COOLDOWN, cost: 0, amount: 0, threatMult: 0, aura: 'rally', range: 0, offGcd: true },
  { id: 'barrier', name: 'Barrier', role: 'healer', kind: 'raid', castTime: 0, cooldown: RAID_COOLDOWN, cost: 0, amount: 0, threatMult: 0, aura: 'rally', range: 0, offGcd: true },

  // Undo.
  { id: 'wildgrowth', name: 'Wildgrowth', role: 'healer', kind: 'raid', castTime: 0, cooldown: RAID_COOLDOWN, cost: 0, amount: 0, threatMult: 0, aura: 'renewal', range: 0, offGcd: true },
  { id: 'tidewall', name: 'Tidewall', role: 'healer', kind: 'raid', castTime: 0, cooldown: RAID_COOLDOWN, cost: 0, amount: 240, threatMult: 0, aura: null, range: 0, offGcd: true },
  { id: 'harvest', name: 'Harvest', role: 'dps', kind: 'raid', castTime: 0, cooldown: RAID_COOLDOWN, cost: 0, amount: 180, threatMult: 0, aura: 'renewal', range: 0, offGcd: true },

  // Press.
  { id: 'quicken', name: 'Quicken', role: 'dps', kind: 'raid', castTime: 0, cooldown: RAID_COOLDOWN, cost: 0, amount: 0, threatMult: 0, aura: 'urgency', range: 0, offGcd: true },
  { id: 'volley_call', name: 'Volley', role: 'dps', kind: 'raid', castTime: 0, cooldown: RAID_COOLDOWN, cost: 0, amount: 0, threatMult: 0, aura: 'urgency', range: 0, offGcd: true },
  { id: 'shadowmeld_call', name: 'Shadowstep', role: 'dps', kind: 'raid', castTime: 0, cooldown: RAID_COOLDOWN, cost: 0, amount: 0, threatMult: 0, aura: 'urgency', range: 0, offGcd: true },
]

export const ABILITIES: Record<string, Ability> = Object.fromEntries(
  [...list, ...RAID_ABILITIES].map((a) => [a.id, a]),
)
